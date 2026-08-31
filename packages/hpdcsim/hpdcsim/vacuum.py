"""Air-pressure / vacuum models for the lumped air volume. SI units only.

The process treats all gas (sleeve headspace + unfilled runner/part/overflow)
as one lumped volume. Models come in two kinds:

- **closed-form**: implement `pressure_at(process, air)` — a pure function of
  the current AirState (NoVacuum, IdealVacuum).
- **path-dependent**: override `solve(process, count)` and integrate over the
  timeline (PumpedVacuum, ConductanceVacuum). The process caches the solution
  and interpolates state pressures from it.

Models read ambient conditions and gas properties from process.environment
and get their inputs from AirState / `process.air_state_at_time(t)`, both of
which are computed without any pressure — a model can never recurse into
itself. All provided models treat the air as isothermal at the ambient
temperature.
"""
from abc import ABC
from dataclasses import dataclass

import numpy as np

ATMOSPHERE = 101325.0  # Pa


@dataclass(frozen=True)
class AirState:
    """Pressure-free snapshot of the lumped air volume."""
    time: float
    stroke: float
    air_volume: float
    pour_hole_open: bool
    vacuum_active: bool


def _solver_times(process, count):
    """Integration grid over the whole process, concentrated on the shot
    phase: before the shot the plunger stands still and the pour hole vents,
    so a coarse prefix (a tenth of the points) suffices — the fine remainder
    covers the shot, where the air volume actually collapses."""
    t0, t1 = process.shot_start_time, process.total_time
    count = max(2, int(count))
    if t0 <= 0.0 or t1 <= t0:
        return np.linspace(0.0, t1, count)
    # Die Untergrenzen von 2 auf beiden Teilstücken ergaben bei kleinen count
    # MEHR Punkte als verlangt (count = 2 lieferte 3). Der Vorlauf bekommt
    # daher höchstens so viele Punkte, dass die Gesamtzahl exakt stimmt.
    pre = min(max(1, count // 10), count - 2)
    shot = count - pre
    return np.r_[np.linspace(0.0, t0, pre + 1)[:-1], np.linspace(t0, t1, shot)]


def orifice_mass_flow(discharge_coefficient, area, p_up, p_down,
                      temperature, gas_constant, heat_capacity_ratio):
    """Compressible orifice mass flow (isentropic, choked when the pressure
    ratio is below critical). Zero when there is no forward pressure drop."""
    if area <= 0.0 or p_up <= 0.0 or p_up <= p_down:
        return 0.0
    g = heat_capacity_ratio
    critical = (2.0/(g + 1.0))**(g/(g - 1.0))
    ratio = max(p_down/p_up, critical)
    term = ratio**(2.0/g) - ratio**((g + 1.0)/g)
    return (discharge_coefficient * area * p_up
            * np.sqrt(2.0*g/((g - 1.0)*gas_constant*temperature) * term))


class VacuumModel(ABC):
    def pressure_at(self, process, air: AirState):
        """Closed-form pressure at one AirState. Return None if the model is
        path-dependent; the process then falls back to solve()."""
        return None

    def solve(self, process, count=2000):
        """Pressure history (times, pressures) over the whole process. The
        default samples the closed-form path; path-dependent models override
        this with their own integration."""
        times = np.linspace(0.0, process.total_time, count)
        pressures = np.empty_like(times)
        for i, t in enumerate(times):
            p = self.pressure_at(process, process.air_state_at_time(t))
            if p is None:
                raise NotImplementedError(
                    "path-dependent VacuumModel must override solve().")
            pressures[i] = p
        return times, pressures

    # Beyond this compression ratio the isothermal ideal-gas law stops
    # describing anything real: the entrapped air would be at hundreds of bar,
    # where it dissolves into the melt, leaks through the die or heats up far
    # from isothermally. The model has nothing to say there.
    MAX_COMPRESSION = 1000.0

    @staticmethod
    def _isothermal(p_ref, v_ref, air_volume):
        """p*V = const compression from a reference state.

        Returns inf once the air volume vanishes OR the compression leaves the
        range where the law means anything. Without the second condition the
        end of fill produced a huge but FINITE number - measured 541 936 346
        mbar at complete fill - which passed every isfinite() guard downstream
        and was plotted as if it were a result.
        """
        if air_volume <= 0.0:
            return np.inf
        ratio = v_ref / air_volume
        if not np.isfinite(ratio) or ratio > VacuumModel.MAX_COMPRESSION:
            return np.inf
        return p_ref * v_ref / air_volume


class NoVacuum(VacuumModel):
    """Ambient while the pour hole is open, then sealed isothermal
    compression. Ignores venting through the die."""

    def pressure_at(self, process, air: AirState):
        ambient = process.environment.ambient_pressure
        if air.pour_hole_open:
            return ambient
        v_seal = process.air_volume_at_stroke(process.sleeve.pour_hole_position)
        return self._isothermal(ambient, v_seal, air.air_volume)


class IdealVacuum(VacuumModel):
    """Perfect pump: air pressure clamps to `pump_pressure` while the vacuum
    valve is active, then sealed isothermal compression from the valve-close
    state. Before the valve opens it behaves like NoVacuum."""

    def __init__(self, pump_pressure):
        if pump_pressure <= 0.0:
            raise ValueError("pump_pressure must be greater than zero.")
        self.pump_pressure = float(pump_pressure)
        self._no_vacuum = NoVacuum()

    def pressure_at(self, process, air: AirState):
        vacuum = process.vacuum
        if vacuum is None or air.stroke < vacuum.start_position:
            return self._no_vacuum.pressure_at(process, air)
        if air.vacuum_active:
            return self.pump_pressure
        v_close = process.air_volume_at_stroke(vacuum.end_position)
        return self._isothermal(self.pump_pressure, v_close, air.air_volume)


class PumpedVacuum(VacuumModel):
    """Path-dependent model: isothermal ideal-gas air pumped with a finite
    volumetric speed S at the valve. Tracking q = p*V (proportional to the
    air amount): q is held at ambient*V while the pour hole vents, evolves as
    dq/dt = -S*q/V while the valve is active (integrated with the exact
    per-step exponential, unconditionally stable), and is conserved otherwise
    (sealed isothermal compression)."""

    def __init__(self, pump_speed, ultimate_pressure=0.0):
        if pump_speed <= 0.0:
            raise ValueError("pump_speed must be greater than zero.")
        if ultimate_pressure < 0.0:
            raise ValueError("ultimate_pressure must not be negative.")
        self.pump_speed = float(pump_speed)
        self.ultimate_pressure = float(ultimate_pressure)

    def solve(self, process, count=2000):
        ambient = process.environment.ambient_pressure
        times = _solver_times(process, count)
        pressures = np.empty_like(times)
        q = None
        for i, t in enumerate(times):
            air = process.air_state_at_time(t)
            volume = air.air_volume
            if air.pour_hole_open or q is None:
                q = ambient * volume
            elif air.vacuum_active and volume > 0.0:
                dt = times[i] - times[i-1]
                q *= np.exp(-self.pump_speed * dt / volume)
                q = max(q, self.ultimate_pressure * volume)
            pressures[i] = np.inf if volume <= 0.0 else q / volume
        return times, pressures


class ConductanceVacuum(VacuumModel):
    """Path-dependent mass-flow model: isothermal ideal-gas air vented and
    pumped through orifices.

    - pour hole open: ideal vent (p = ambient) unless the sleeve declares a
      pour_hole_area, in which case it vents as an orifice like everything
      else (allowing transient overpressure while the plunger approaches it).
    - chill vents (casting.vent_area) release air to ambient whenever the
      internal pressure exceeds it (outflow only; no backflow into the die).
    - the vacuum valve (vacuum.valve_area, required when a VacuumSystem is
      attached) pumps toward a plenum held at `pump_pressure` while active.

    Air mass m evolves by the summed orifice flows; p = m*R*T/V. Integration
    uses the exact per-step exponential of the linearized loss (mass flows
    scale with pressure and thus with mass), which keeps it stable as the
    air volume collapses.
    """

    def __init__(self, pump_pressure, discharge_coefficient=0.8):
        if pump_pressure <= 0.0:
            raise ValueError("pump_pressure must be greater than zero.")
        if not 0.0 < discharge_coefficient <= 1.0:
            raise ValueError("discharge_coefficient must be in (0, 1].")
        self.pump_pressure = float(pump_pressure)
        self.discharge_coefficient = float(discharge_coefficient)

    def solve(self, process, count=4000):
        env = process.environment
        sleeve, casting, vacuum = process.sleeve, process.casting, process.vacuum
        if vacuum is not None and vacuum.valve_area is None:
            raise ValueError("ConductanceVacuum needs valve_area on the "
                             "VacuumSystem.")
        gas_rt = env.gas_constant * env.ambient_temperature
        flow_args = (env.ambient_temperature, env.gas_constant,
                     env.heat_capacity_ratio)
        times = _solver_times(process, count)
        pressures = np.empty_like(times)
        mass = None
        for i, t in enumerate(times):
            air = process.air_state_at_time(t)
            volume = air.air_volume
            if volume <= 0.0:
                pressures[i] = np.inf
                continue
            if air.pour_hole_open and sleeve.pour_hole_area is None:
                mass = env.ambient_pressure * volume / gas_rt
                pressures[i] = env.ambient_pressure
                continue
            if mass is None:
                mass = env.ambient_pressure * volume / gas_rt
            pressure = mass * gas_rt / volume
            if i > 0 and mass > 0.0:
                dt = times[i] - times[i-1]
                vent_area = (casting.vent_area or 0.0)
                if air.pour_hole_open:
                    vent_area += sleeve.pour_hole_area or 0.0
                outflow = orifice_mass_flow(
                    self.discharge_coefficient, vent_area, pressure,
                    env.ambient_pressure, *flow_args)
                if air.vacuum_active:
                    outflow += orifice_mass_flow(
                        self.discharge_coefficient, vacuum.valve_area,
                        pressure, self.pump_pressure, *flow_args)
                if outflow > 0.0:
                    mass *= np.exp(-outflow / mass * dt)
                    # Every orifice stops at its downstream pressure; one
                    # step must not carry the air below the lowest active
                    # sink — the pump plenum while the valve is open,
                    # ambient for the vents (the frozen-rate exponential
                    # would otherwise crush the mass toward zero when the
                    # air volume collapses at the end of fill).
                    floor = (self.pump_pressure if air.vacuum_active
                             else env.ambient_pressure)
                    if pressure > floor:
                        mass = max(mass, floor*volume/gas_rt)
            pressures[i] = mass * gas_rt / volume
        return times, pressures
