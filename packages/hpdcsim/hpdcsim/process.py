"""The HPDC shot process timeline and its query API. SI units only.

Timeline: DOSING (melt volume grows to the target fill over dosing_time,
plunger at rest) -> DWELL (static hold) -> SHOT (plunger follows the motion
profile; melt is pushed through runner, part and overflow) -> COMPLETE.

Physics models are one-way overlays over the kinematic timeline:
kinematics -> air pressure (VacuumModel) -> melt temperature (ThermalModel).
Nothing feeds back; each overlay is solved once and cached.
"""
import csv
from dataclasses import dataclass, replace
from enum import Enum
from typing import Iterator

import numpy as np
from scipy.optimize import brentq

from .components import (CastingSystem, Environment, Melt, ShotSleeve,
                         VacuumSystem)
from .geometry import CircularSection
from .laws import PlungerLaw, ShotPlan
from .motion import MotionProfile
from .thermal import ThermalModel
from .vacuum import AirState, NoVacuum, VacuumModel


class Phase(Enum):
    DOSING = "dosing"
    DWELL = "dwell"
    SHOT = "shot"
    COMPLETE = "complete"


@dataclass(frozen=True)
class Event:
    name: str
    time: float
    stroke: float


@dataclass(frozen=True)
class ProcessState:
    """Snapshot of the whole shot system at one instant."""
    time: float
    phase: Phase
    stroke: float
    plunger_velocity: float
    plunger_acceleration: float
    section: CircularSection      # melt cross-section in the sleeve
    melt_volume: float            # total melt in the system
    sleeve_melt_volume: float
    runner_melt_volume: float
    part_melt_volume: float
    overflow_melt_volume: float
    melt_front_region: str        # "sleeve" | "runner" | "part" | "overflow" | "complete"
    melt_mass: float              # nan if the process has no Melt material
    melt_temperature: float       # nan if the process has no ThermalModel
    air_volume: float
    air_pressure: float
    wetted_area: float            # sleeve shell + both end-face segments
    downstream_wetted_area: float # fill-scaled runner/part/overflow surfaces
    free_surface_area: float
    plunger_flow_rate: float      # bore area * plunger velocity
    gate_flow_rate: float         # flow through the gate (front past runner)
    gate_velocity: float          # gate_flow_rate / gate_area (nan without area)
    dosing_flow_rate: float
    pour_hole_open: bool
    vacuum_active: bool
    runner_fill: float
    part_fill: float
    overflow_fill: float

    @property
    def sleeve_fill(self): return self.section.fill_fraction
    @property
    def melt_height(self): return self.section.height
    @property
    def stroke_mm(self): return self.stroke*1000.0

    # --- wetted area split by contact partner ---
    @property
    def plunger_face_area(self):
        """Melt contact area on the plunger face (one segment)."""
        return self.section.area
    @property
    def die_face_area(self):
        """Melt contact area on the die-side sleeve end face (one segment)."""
        return self.section.area
    @property
    def shell_wetted_area(self):
        """Melt contact area on the sleeve shell (arc * wetted length)."""
        return self.wetted_area - self.plunger_face_area - self.die_face_area
    @property
    def total_wetted_area(self):
        """All melt-metal contact: sleeve (shell + faces) plus downstream."""
        return self.wetted_area + self.downstream_wetted_area

    @property
    def critical_velocity(self):
        """Critical plunger velocity of the current sleeve free surface."""
        return self.section.critical_velocity
    @property
    def velocity_margin(self):
        """critical_velocity - plunger_velocity (negative = supercritical)."""
        return self.critical_velocity - self.plunger_velocity
    @property
    def is_subcritical(self): return self.plunger_velocity <= self.critical_velocity
    @property
    def froude(self):
        """Plunger Froude number; nan once the sleeve free surface is gone."""
        return self.section.froude(self.plunger_velocity)


class ShotProcess:
    def __init__(self, sleeve: ShotSleeve, casting: CastingSystem,
                 motion: MotionProfile | PlungerLaw, *, dosing_time, dwell_time,
                 melt: Melt | None = None, vacuum: VacuumSystem | None = None,
                 thermal: ThermalModel | None = None,
                 environment: Environment | None = None):
        if dosing_time <= 0.0 or dwell_time < 0.0:
            raise ValueError("dosing_time must be > 0 and dwell_time >= 0.")
        plan = ShotPlan(sleeve, casting)
        if plan.biscuit_length <= 0.0:
            raise ValueError(
                "melt volume does not cover runner+part+overflow; no biscuit "
                f"remains (deficit {-plan.biscuit_length*sleeve.area*1e6:.1f} cm^3).")
        profile = motion.build(plan) if isinstance(motion, PlungerLaw) else motion
        if profile.start_position != 0.0:
            raise ValueError("profile must start at stroke 0.")
        if profile.end_position > plan.fill_complete_stroke + 1e-9:
            raise ValueError(
                "profile pushes past complete fill: maximum stroke is "
                f"{plan.fill_complete_stroke*1000:.2f} mm "
                f"(biscuit {plan.biscuit_length*1000:.2f} mm).")
        if vacuum is not None:
            if vacuum.end_position is None:
                vacuum = replace(vacuum, end_position=min(
                    profile.end_position, plan.fill_complete_stroke))
            if vacuum.end_position > profile.end_position:
                raise ValueError("vacuum end_position lies beyond the "
                                 "profile travel.")
        self.sleeve, self.casting, self.profile = sleeve, casting, profile
        self.plan = plan
        self.melt = melt
        self.dosing_time, self.dwell_time = float(dosing_time), float(dwell_time)
        self.vacuum = vacuum
        self.environment = environment if environment is not None else Environment()
        self.air_model: VacuumModel = (vacuum.model if vacuum is not None
                                       else NoVacuum())
        self.thermal = thermal
        self.biscuit_length = plan.biscuit_length
        self.fill_complete_stroke = plan.fill_complete_stroke
        self._pressure_solution = None
        self._thermal_solution = None
        self._solving_thermal = False

    # --- timeline ---
    @property
    def shot_start_time(self): return self.dosing_time + self.dwell_time
    @property
    def total_time(self): return self.shot_start_time + self.profile.end_time
    @property
    def stroke_to_fill(self): return self.sleeve.stroke_to_fill

    def events(self):
        """Ordered process events as name -> Event(time, stroke)."""
        def shot_event(stroke):
            return Event("", self.shot_start_time
                         + self.profile.time_at_position(stroke), stroke)
        table = {
            "dosing_end": Event("", self.dosing_time, 0.0),
            "shot_start": Event("", self.shot_start_time, 0.0),
        }
        travel = self.profile.end_position
        marks = [("pour_hole_sealed", self.sleeve.pour_hole_position)]
        if self.vacuum is not None:
            marks += [("vacuum_start", self.vacuum.start_position),
                      ("vacuum_end", self.vacuum.end_position)]
        marks += [("sleeve_full", self.plan.sleeve_full_stroke),
                  ("runner_full", self.plan.runner_full_stroke),
                  ("part_full", self.plan.part_full_stroke),
                  ("fill_complete", self.plan.fill_complete_stroke)]
        for name, stroke in marks:
            if stroke <= travel + 1e-12:
                table[name] = shot_event(min(stroke, travel))
        table["shot_end"] = Event("", self.total_time, travel)
        return {name: Event(name, e.time, e.stroke)
                for name, e in sorted(table.items(), key=lambda kv: kv[1].time)}

    def time_of(self, event_name): return self.events()[event_name].time
    def stroke_of(self, event_name): return self.events()[event_name].stroke

    # --- volume bookkeeping ---
    def _melt_volume_at_time(self, time):
        if time >= self.dosing_time:
            return self.sleeve.melt_volume
        return self.sleeve.melt_volume * time / self.dosing_time

    def air_volume_at_stroke(self, stroke, melt_volume=None):
        """Lumped air volume A*(L-s) + V_downstream - V_melt during the shot
        (or dosing, with reduced melt volume)."""
        melt = self.sleeve.melt_volume if melt_volume is None else melt_volume
        chamber = self.sleeve.area * (self.sleeve.length - stroke)
        return max(0.0, chamber + self.casting.total_volume - melt)

    # --- kinematics (no physics models) ---
    def _kinematics_at_time(self, time):
        t = float(time)
        if t < 0.0:
            raise ValueError("time must not be negative.")
        dosing_rate = 0.0
        if t <= self.dosing_time:
            phase = Phase.DOSING
            stroke = velocity = acceleration = 0.0
            melt = self._melt_volume_at_time(t)
            dosing_rate = self.sleeve.melt_volume / self.dosing_time
        elif t <= self.shot_start_time:
            phase = Phase.DWELL
            stroke = velocity = acceleration = 0.0
            melt = self.sleeve.melt_volume
        else:
            shot_t = t - self.shot_start_time
            phase = Phase.SHOT if shot_t <= self.profile.end_time else Phase.COMPLETE
            sample = self.profile.sample_at_time(min(shot_t, self.profile.end_time))
            stroke, acceleration = sample.position, sample.acceleration
            velocity = sample.velocity if phase is Phase.SHOT else 0.0
            melt = self.sleeve.melt_volume
        return t, phase, stroke, velocity, acceleration, melt, dosing_rate

    def _air_state(self, t, phase, stroke, melt) -> AirState:
        pour_open = stroke < self.sleeve.pour_hole_position
        vac_active = (phase in (Phase.SHOT, Phase.COMPLETE)
                      and self.vacuum is not None and self.vacuum.active(stroke))
        return AirState(t, stroke, self.air_volume_at_stroke(stroke, melt),
                        pour_open, vac_active)

    def air_state_at_time(self, time) -> AirState:
        """Pressure-free air snapshot — safe for VacuumModel integration."""
        t, phase, stroke, _, _, melt, _ = self._kinematics_at_time(time)
        return self._air_state(t, phase, stroke, melt)

    # --- physics overlays ---
    def _air_pressure(self, air: AirState):
        pressure = self.air_model.pressure_at(self, air)
        if pressure is not None:
            return float(pressure)
        if self._pressure_solution is None:
            self._pressure_solution = self.air_model.solve(self)
        times, pressures = self._pressure_solution
        return float(np.interp(air.time, times, pressures))

    def _melt_temperature(self, time):
        if self.thermal is None or self._solving_thermal:
            return np.nan
        if self._thermal_solution is None:
            self._solving_thermal = True
            try:
                self._thermal_solution = self.thermal.solve(self)
            finally:
                self._solving_thermal = False
        times, temps = self._thermal_solution
        return float(np.interp(time, times, temps))

    def temperature_at_time(self, time):
        """Melt temperature from the attached ThermalModel (nan without one)."""
        return self._melt_temperature(float(time))

    def temperatures(self, count=1000):
        """(times, temperatures) from the attached ThermalModel."""
        if self.thermal is None:
            raise ValueError("no ThermalModel attached to the process.")
        self._melt_temperature(0.0)  # ensure solved
        times = np.linspace(0.0, self.total_time, count)
        return times, np.interp(times, *self._thermal_solution)

    # --- state construction ---
    def state_at_time(self, time) -> ProcessState:
        t, phase, stroke, velocity, acceleration, melt, dosing_rate = \
            self._kinematics_at_time(time)
        air = self._air_state(t, phase, stroke, melt)
        return self._build_state(t, phase, stroke, velocity, acceleration,
                                 melt, dosing_rate, air,
                                 self._air_pressure(air))

    def _build_state(self, t, phase, stroke, velocity, acceleration,
                     melt, dosing_rate, air_state, pressure) -> ProcessState:
        sleeve, casting = self.sleeve, self.casting
        chamber = sleeve.area * (sleeve.length - stroke)
        if melt <= chamber:
            sleeve_melt, downstream = melt, 0.0
        else:
            sleeve_melt, downstream = chamber, melt - chamber
        vr, vp, vo, region = casting.distribute(downstream)
        if downstream <= 0.0:
            region = "sleeve"
        section = sleeve.section(min(1.0, sleeve_melt/chamber))
        wet_length = sleeve.length - stroke
        wetted = section.arc*wet_length + 2.0*section.area
        free_surface = section.chord*wet_length
        runner_fill = vr/casting.runner.volume
        part_fill = vp/casting.part.volume
        overflow_fill = (vo/casting.overflow.volume
                         if casting.overflow.volume > 0 else 1.0)
        downstream_wetted = casting.wetted_area(runner_fill, part_fill,
                                                overflow_fill)
        melt_mass = melt*self.melt.density if self.melt is not None else np.nan
        plunger_flow = sleeve.area*velocity
        gate_flow = plunger_flow if region in ("part", "overflow", "complete") else 0.0
        gate_area = casting.runner.gate_area
        gate_velocity = gate_flow/gate_area if gate_area else np.nan
        return ProcessState(
            t, phase, stroke, velocity, acceleration, section, melt,
            sleeve_melt, vr, vp, vo, region, melt_mass,
            self._melt_temperature(t), air_state.air_volume, pressure, wetted,
            downstream_wetted, free_surface, plunger_flow, gate_flow,
            gate_velocity, dosing_rate, air_state.pour_hole_open,
            air_state.vacuum_active, runner_fill, part_fill, overflow_fill,
        )

    def state_at_stroke(self, stroke) -> ProcessState:
        """Shot-phase state at a plunger stroke."""
        t = self.shot_start_time + self.profile.time_at_position(float(stroke))
        return self.state_at_time(t)

    # --- shortcuts ---
    def velocity_at_time(self, t): return self.state_at_time(t).plunger_velocity
    def velocity_at_stroke(self, s): return self.state_at_stroke(s).plunger_velocity
    def flow_rate_at_time(self, t):
        """Melt displacement rate: dosing pour rate before the shot, plunger
        sweep rate A*v during it."""
        state = self.state_at_time(t)
        return state.dosing_flow_rate if state.phase is Phase.DOSING else state.plunger_flow_rate
    def flow_rate_at_stroke(self, s): return self.state_at_stroke(s).plunger_flow_rate
    def gate_flow_rate_at_time(self, t): return self.state_at_time(t).gate_flow_rate
    def gate_flow_rate_at_stroke(self, s): return self.state_at_stroke(s).gate_flow_rate
    def air_volume_at_time(self, t): return self.state_at_time(t).air_volume
    def air_pressure_at_time(self, t): return self.state_at_time(t).air_pressure
    def air_pressure_at_stroke(self, s): return self.state_at_stroke(s).air_pressure
    def fill_state_at_time(self, t):
        x = self.state_at_time(t)
        return {"sleeve": x.sleeve_fill, "runner": x.runner_fill,
                "part": x.part_fill, "overflow": x.overflow_fill}

    def critical_crossing(self, *, count=2000):
        """First stroke where the plunger velocity reaches the critical
        velocity, searched while a sleeve free surface exists. Returns the
        ProcessState at the crossing, or None."""
        end = min(self.profile.end_position, self.stroke_to_fill)
        margin = lambda s: self.state_at_stroke(s).velocity_margin
        grid = np.linspace(0.0, end, count)
        values = np.array([margin(s) for s in grid])
        if values[0] <= 0.0:
            return self.state_at_stroke(0.0)
        crossings = np.nonzero((values[:-1] > 0.0) & (values[1:] <= 0.0))[0]
        if len(crossings) == 0:
            return None
        i = crossings[0]
        return self.state_at_stroke(brentq(margin, grid[i], grid[i+1]))

    # --- sampling ---
    def iter_states(self, count=1000, *, spacing="time") -> Iterator[ProcessState]:
        """Evenly spaced states: spacing="time" covers the whole process,
        spacing="distance" covers the plunger travel of the shot phase."""
        if count < 2: raise ValueError("count must be at least 2.")
        if spacing == "time":
            for t in np.linspace(0.0, self.total_time, count):
                yield self.state_at_time(t)
        elif spacing == "distance":
            for s in np.linspace(0.0, self.profile.end_position, count):
                yield self.state_at_stroke(s)
        else:
            raise ValueError("spacing must be 'time' or 'distance'.")

    def states(self, count=1000, *, spacing="time"):
        return list(self.iter_states(count, spacing=spacing))

    def arrays(self, count=1000, *, spacing="time"):
        """Sampled process data as a dict of numpy arrays."""
        states = self.states(count, spacing=spacing)
        def field(f): return np.array([f(x) for x in states])
        return {
            "time": field(lambda x: x.time),
            "phase": np.array([x.phase.value for x in states]),
            "stroke": field(lambda x: x.stroke),
            "velocity": field(lambda x: x.plunger_velocity),
            "acceleration": field(lambda x: x.plunger_acceleration),
            "sleeve_fill": field(lambda x: x.sleeve_fill),
            "melt_height": field(lambda x: x.melt_height),
            "melt_volume": field(lambda x: x.melt_volume),
            "melt_mass": field(lambda x: x.melt_mass),
            "melt_temperature": field(lambda x: x.melt_temperature),
            "runner_fill": field(lambda x: x.runner_fill),
            "part_fill": field(lambda x: x.part_fill),
            "overflow_fill": field(lambda x: x.overflow_fill),
            "air_volume": field(lambda x: x.air_volume),
            "air_pressure": field(lambda x: x.air_pressure),
            "wetted_area": field(lambda x: x.wetted_area),
            "shell_wetted_area": field(lambda x: x.shell_wetted_area),
            "plunger_face_area": field(lambda x: x.plunger_face_area),
            "downstream_wetted_area": field(lambda x: x.downstream_wetted_area),
            "total_wetted_area": field(lambda x: x.total_wetted_area),
            "free_surface_area": field(lambda x: x.free_surface_area),
            "plunger_flow_rate": field(lambda x: x.plunger_flow_rate),
            "gate_flow_rate": field(lambda x: x.gate_flow_rate),
            "gate_velocity": field(lambda x: x.gate_velocity),
            "critical_velocity": field(lambda x: x.critical_velocity),
            "velocity_margin": field(lambda x: x.velocity_margin),
            "froude": field(lambda x: x.froude),
        }

    def export_csv(self, filename, *, count=1000, spacing="time"):
        data = self.arrays(count, spacing=spacing)
        columns = [
            ("time_s", data["time"], 1.0),
            ("phase", data["phase"], None),
            ("stroke_mm", data["stroke"], 1000.0),
            ("velocity_m_s", data["velocity"], 1.0),
            ("acceleration_m_s2", data["acceleration"], 1.0),
            ("sleeve_fill", data["sleeve_fill"], 1.0),
            ("melt_height_mm", data["melt_height"], 1000.0),
            ("melt_mass_kg", data["melt_mass"], 1.0),
            ("melt_temperature", data["melt_temperature"], 1.0),
            ("runner_fill", data["runner_fill"], 1.0),
            ("part_fill", data["part_fill"], 1.0),
            ("overflow_fill", data["overflow_fill"], 1.0),
            ("air_volume_cm3", data["air_volume"], 1e6),
            ("air_pressure_Pa", data["air_pressure"], 1.0),
            ("wetted_area_cm2", data["wetted_area"], 1e4),
            ("downstream_wetted_cm2", data["downstream_wetted_area"], 1e4),
            ("plunger_flow_cm3_s", data["plunger_flow_rate"], 1e6),
            ("gate_flow_cm3_s", data["gate_flow_rate"], 1e6),
            ("gate_velocity_m_s", data["gate_velocity"], 1.0),
            ("critical_velocity_m_s", data["critical_velocity"], 1.0),
            ("froude", data["froude"], 1.0),
        ]
        with open(filename, "w", newline="", encoding="utf-8") as stream:
            writer = csv.writer(stream)
            writer.writerow([name for name, _, _ in columns])
            for i in range(len(data["time"])):
                writer.writerow([values[i] if scale is None else values[i]*scale
                                 for _, values, scale in columns])
