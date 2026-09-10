"""Air-pressure / vacuum models for the lumped air volume. SI units only.

The process treats all gas (sleeve headspace + unfilled runner/part/overflow)
as one lumped volume. Models come in two kinds:

- **closed-form**: implement `pressure_at(process, air)` — a pure function of
  the current AirState (NoVacuum, IdealVacuum).
- **path-dependent**: override `solve(process, count)` and integrate over the
  timeline (PumpedVacuum, ConductanceVacuum, TankVacuum). The process caches
  the solution and interpolates state pressures from it. A path-dependent
  model may also override `solve_channels()` to publish further time series
  next to the air pressure (TankVacuum: the tank pressure).

Models read ambient conditions and gas properties from process.environment
and get their inputs from AirState / `process.air_state_at_time(t)`, both of
which are computed without any pressure — a model can never recurse into
itself. All provided models treat the air as isothermal at the ambient
temperature.

Openings (pour hole, chill vents, vacuum valve) are either plain orifices
(isentropic nozzle flow, `orifice_mass_flow`) or — when the component
carries a `VentChannel` — slit channels with wall friction
(`channel_mass_flow`): choked at large pressure ratios, friction-limited
in between, viscous (Poiseuille) once the flow turns laminar at low
pressure and small pressure difference.
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


# --- vent channels with friction ---
@dataclass(frozen=True)
class VentChannel:
    """A vent path as a wide slit with wall friction. `gap` is the slit
    height, `length` the flow path from the air volume to the sink; the
    width follows from the opening's flow area (area/gap), so the hydraulic
    diameter is 2*gap. `entry_loss` is the inlet's minor-loss coefficient
    (0.5: sharp-edged), `roughness` the wall roughness entering the
    turbulent friction factor (5 µm: machined steel)."""
    gap: float
    length: float
    entry_loss: float = 0.5
    roughness: float = 5e-6

    def __post_init__(self):
        if self.gap <= 0.0 or self.length <= 0.0:
            raise ValueError("gap and length must be greater than zero.")
        if self.entry_loss < 0.0 or self.roughness < 0.0:
            raise ValueError("entry_loss and roughness must not be negative.")

    @property
    def hydraulic_diameter(self):
        return 2.0 * self.gap


def slit_friction_factor(reynolds, relative_roughness=0.0):
    """Darcy friction factor of a wide slit over all regimes: Churchill's
    all-regime correlation with the laminar branch of parallel plates
    (f = 96/Re) in place of the pipe's 64/Re."""
    re = max(float(reynolds), 1e-3)
    a = (2.457*np.log(1.0/((7.0/re)**0.9 + 0.27*relative_roughness)))**16
    b = (37530.0/re)**16
    return 8.0*((12.0/re)**12 + 1.0/(a + b)**1.5)**(1.0/12.0)


def choking_ratio(loss):
    """Reservoir/exit pressure ratio r at which isothermal duct flow with
    total loss coefficient K chokes: r^2 - 2 ln r - 1 = K. The left side is
    convex and increasing for r >= 1, so Newton from r = 1 + sqrt(K) (which
    is at or above the root) converges monotonically."""
    if loss <= 0.0:
        return 1.0
    r = 1.0 + np.sqrt(loss)
    for _ in range(60):
        step = (r*r - 2.0*np.log(r) - 1.0 - loss)/(2.0*r - 2.0/r)
        r -= step
        if abs(step) <= 1e-13*r:
            break
    return r


def channel_mass_flow(channel: VentChannel, area, p_up, p_down, temperature,
                      gas_constant, viscosity, friction_factor=None):
    """Isothermal compressible flow of an ideal gas from a reservoir at rest
    (p_up) through a wide slit with wall friction into a sink (p_down).

    Momentum balance along the channel with constant mass flux G:

        p_up^2 - p_exit^2 = G^2 R T (K + 2 ln(p_up/p_exit)),
        K = 1 + entry_loss + f L/D_h

    The 1 accelerates the gas from rest, f is the slit's Darcy friction
    factor (laminar 96/Re, turbulent via Churchill) and Re = G D_h/mu
    depends on G itself — resolved by fixed-point iteration, seeded with the
    previous friction factor when given. The exit cannot exceed the
    isothermal sound speed (M = 1/sqrt(gamma)): once p_down falls below
    p_up/r with choking_ratio(K) = r, the flow is choked at
    G = p_exit/sqrt(R T) and the sink pressure no longer matters.

    Limits: a vanishing length recovers an isothermal nozzle — choked flux
    0.56 p_up/sqrt(RT) without entry loss, below the isentropic orifice's
    0.69 because the isothermal sound speed sqrt(RT) is lower than
    sqrt(gamma RT); at low Reynolds numbers the result is Poiseuille's
    viscous slit flow G = gap^2 (p_up^2 - p_down^2)/(24 mu L R T), i.e.
    mass flow grows with the difference of the squared pressures instead
    of with the pressure ratio.

    Returns (mass_flow, friction_factor) — pass the factor back in for the
    next call at nearby conditions to save iterations.
    """
    if area <= 0.0 or p_up <= 0.0 or p_up <= p_down:
        return 0.0, (friction_factor or 0.0)
    gas_rt = gas_constant*temperature
    d_h = channel.hydraulic_diameter
    rel_rough = channel.roughness/d_h
    ln_ratio = np.log(p_up/max(p_down, 1e-12))
    f = 0.03 if not friction_factor or friction_factor <= 0.0 else float(friction_factor)
    flux = 0.0
    for _ in range(40):
        loss = 1.0 + channel.entry_loss + f*channel.length/d_h
        p_exit = p_up/choking_ratio(loss)
        if p_down <= p_exit:
            new_flux = p_exit/np.sqrt(gas_rt)                       # choked
        else:
            new_flux = np.sqrt((p_up*p_up - p_down*p_down)
                               / (gas_rt*(loss + 2.0*ln_ratio)))    # subsonic
        f = slit_friction_factor(new_flux*d_h/viscosity, rel_rough)
        done = abs(new_flux - flux) <= 1e-7*new_flux
        flux = new_flux
        if done:
            break
    return flux*area, f


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

    def solve_channels(self, process, count=2000):
        """Like solve(), but as a dict of named time series: "time" and
        "pressure" always, plus whatever the model wants to publish next to
        the air pressure (TankVacuum adds "tank_pressure")."""
        times, pressures = self.solve(process, count)
        return {"time": times, "pressure": pressures}

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
    """Instantaneous vacuum: the air pressure jumps to `pump_pressure` the
    moment the valve opens and stays there while it is active — an
    infinitely fast pump behind an infinitely wide vent. No opening area
    enters this model. After the valve closes: sealed isothermal
    compression from the valve-close state. Before the valve opens it
    behaves like NoVacuum. Upper bound of what any vacuum system can do."""

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


class _VentedVacuum(VacuumModel):
    """Shared integration for models that move air mass through openings:

    - pour hole open: ideal vent (p = ambient) unless the sleeve declares a
      pour_hole_area, in which case it vents as an orifice like everything
      else (allowing transient overpressure while the plunger approaches it).
    - chill vents (casting.vent_area, optionally casting.vent_channel)
      release air to ambient whenever the internal pressure exceeds it
      (outflow only; no backflow into the die).
    - the vacuum valve (vacuum.valve_area, optionally vacuum.valve_channel;
      required when a VacuumSystem is attached) drains toward the model's
      sink while active. Subclasses define the sink: its pressure and what
      the arriving mass does to it (ConductanceVacuum: a plenum held at
      constant pressure; TankVacuum: a finite tank that fills up).

    Openings with a VentChannel use channel_mass_flow (friction, choking,
    viscous regime), plain ones the isentropic orifice with the model's
    discharge coefficient.

    Air mass m evolves by the summed flows; p = m*R*T/V. Integration uses
    the exact per-step exponential of the linearized loss (mass flows scale
    with pressure and thus with mass), which keeps it stable as the air
    volume collapses.
    """

    def __init__(self, discharge_coefficient=0.8):
        if not 0.0 < discharge_coefficient <= 1.0:
            raise ValueError("discharge_coefficient must be in (0, 1].")
        self.discharge_coefficient = float(discharge_coefficient)

    # --- sink hooks ---
    def _sink_start(self, process):
        """Initial sink state (None: the sink has no state of its own)."""
        return None

    def _sink_pressure(self, sink):
        raise NotImplementedError

    def _sink_step(self, sink, mass_in, dt, process):
        """Advance the sink by one step: `mass_in` arrived through the
        valve (0 while it is closed)."""
        return sink

    def _sink_channels(self, sink_pressures):
        """Extra time series for solve_channels()."""
        return {}

    def _opening_flow(self, area, channel, p_up, p_down, env, friction):
        """Mass flow through one opening and the friction factor to seed
        the next call with (plain orifices carry none)."""
        if area is None or area <= 0.0:
            return 0.0, friction
        if channel is None:
            return orifice_mass_flow(
                self.discharge_coefficient, area, p_up, p_down,
                env.ambient_temperature, env.gas_constant,
                env.heat_capacity_ratio), friction
        return channel_mass_flow(channel, area, p_up, p_down,
                                 env.ambient_temperature, env.gas_constant,
                                 env.viscosity, friction)

    def solve(self, process, count=4000):
        solution = self.solve_channels(process, count)
        return solution["time"], solution["pressure"]

    def solve_channels(self, process, count=4000):
        env = process.environment
        sleeve, casting, vacuum = process.sleeve, process.casting, process.vacuum
        if vacuum is not None and vacuum.valve_area is None:
            raise ValueError(f"{type(self).__name__} needs valve_area on the "
                             "VacuumSystem.")
        gas_rt = env.gas_constant * env.ambient_temperature
        times = _solver_times(process, count)
        pressures = np.empty_like(times)
        sink = self._sink_start(process)
        sink_pressures = np.full_like(times, np.nan)
        mass = None
        friction = {"vent": None, "valve": None}
        for i, t in enumerate(times):
            dt = times[i] - times[i-1] if i > 0 else 0.0
            air = process.air_state_at_time(t)
            volume = air.air_volume
            p_sink = self._sink_pressure(sink) if sink is not None else np.nan
            valve_mass = 0.0
            if volume <= 0.0:
                pressures[i] = np.inf
            elif air.pour_hole_open and sleeve.pour_hole_area is None:
                mass = env.ambient_pressure * volume / gas_rt
                pressures[i] = env.ambient_pressure
            else:
                if mass is None:
                    mass = env.ambient_pressure * volume / gas_rt
                pressure = mass * gas_rt / volume
                if i > 0 and mass > 0.0:
                    outflow, friction["vent"] = self._opening_flow(
                        casting.vent_area, casting.vent_channel, pressure,
                        env.ambient_pressure, env, friction["vent"])
                    if air.pour_hole_open:
                        outflow += orifice_mass_flow(
                            self.discharge_coefficient, sleeve.pour_hole_area,
                            pressure, env.ambient_pressure,
                            env.ambient_temperature, env.gas_constant,
                            env.heat_capacity_ratio)
                    valve_flow = 0.0
                    if air.vacuum_active:
                        valve_flow, friction["valve"] = self._opening_flow(
                            vacuum.valve_area, vacuum.valve_channel, pressure,
                            p_sink, env, friction["valve"])
                        outflow += valve_flow
                    if outflow > 0.0:
                        before = mass
                        mass *= np.exp(-outflow / mass * dt)
                        # Every opening stops at its downstream pressure; one
                        # step must not carry the air below the lowest active
                        # sink — the valve's sink while it is open, ambient
                        # for the vents (the frozen-rate exponential would
                        # otherwise crush the mass toward zero when the air
                        # volume collapses at the end of fill).
                        floor = p_sink if air.vacuum_active else env.ambient_pressure
                        if pressure > floor:
                            mass = max(mass, floor*volume/gas_rt)
                        # What left through the valve arrives in the sink —
                        # the actual mass difference, split by flow share,
                        # so the sink gains exactly what the die lost.
                        valve_mass = (before - mass) * valve_flow / outflow
                pressures[i] = mass * gas_rt / volume
            if sink is not None and i > 0:
                sink = self._sink_step(sink, valve_mass, dt, process)
                p_sink = self._sink_pressure(sink)
            sink_pressures[i] = p_sink
        solution = {"time": times, "pressure": pressures}
        solution.update(self._sink_channels(sink_pressures))
        return solution


class ConductanceVacuum(_VentedVacuum):
    """Vented air with the vacuum valve draining into a plenum held at
    `pump_pressure` — a pump (or tank) big enough that nothing the die
    releases raises its pressure. The pressure history is then governed by
    the openings alone: orifice or channel flow through the valve, chill
    vents and pour hole (see _VentedVacuum)."""

    def __init__(self, pump_pressure, discharge_coefficient=0.8):
        super().__init__(discharge_coefficient)
        if pump_pressure <= 0.0:
            raise ValueError("pump_pressure must be greater than zero.")
        self.pump_pressure = float(pump_pressure)

    def _sink_start(self, process):
        return self.pump_pressure

    def _sink_pressure(self, sink):
        return sink


class TankVacuum(_VentedVacuum):
    """Vented air with the vacuum valve draining into a finite tank of
    `tank_volume` that was evacuated to `tank_pressure` before the shot.
    Every kilogram the die releases raises the tank pressure by R*T/V_tank
    (isothermal), so the driving pressure difference shrinks as the shot
    proceeds — the smaller the tank, the sooner. An optional pump keeps
    evacuating the tank with volumetric speed `pump_speed` toward
    `ultimate_pressure` (default: the tank's start pressure); over the few
    tens of milliseconds of a shot it barely matters (time constant
    V_tank/S is seconds), which is exactly why the tank exists.

    solve_channels() publishes the tank pressure as "tank_pressure"."""

    def __init__(self, tank_volume, tank_pressure, pump_speed=0.0,
                 ultimate_pressure=None, discharge_coefficient=0.8):
        super().__init__(discharge_coefficient)
        if tank_volume <= 0.0:
            raise ValueError("tank_volume must be greater than zero.")
        if tank_pressure <= 0.0:
            raise ValueError("tank_pressure must be greater than zero.")
        if pump_speed < 0.0:
            raise ValueError("pump_speed must not be negative.")
        if ultimate_pressure is None:
            ultimate_pressure = tank_pressure
        if ultimate_pressure <= 0.0 or ultimate_pressure > tank_pressure:
            raise ValueError("ultimate_pressure must be in (0, tank_pressure].")
        self.tank_volume = float(tank_volume)
        self.tank_pressure = float(tank_pressure)
        self.pump_speed = float(pump_speed)
        self.ultimate_pressure = float(ultimate_pressure)

    def _sink_start(self, process):
        # sink state: the tank pressure itself (isothermal, so the tank's air
        # mass is pressure*V/(R*T) and never needs to be tracked separately)
        return self.tank_pressure

    def _sink_pressure(self, sink):
        return sink

    def _sink_step(self, sink, mass_in, dt, process):
        env = process.environment
        gas_rt = env.gas_constant * env.ambient_temperature
        pressure = sink + mass_in * gas_rt / self.tank_volume
        if self.pump_speed > 0.0 and pressure > self.ultimate_pressure:
            # dp/dt = -(S/V)(p - p_ult): exact per-step exponential
            pressure = self.ultimate_pressure + (
                (pressure - self.ultimate_pressure)
                * np.exp(-self.pump_speed * dt / self.tank_volume))
        return pressure

    def _sink_channels(self, sink_pressures):
        return {"tank_pressure": sink_pressures}
