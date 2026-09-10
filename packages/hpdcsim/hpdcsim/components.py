"""Physical components of the shot system. SI units only.

Temperatures on Melt and in thermal models may use any consistent unit
(models only use differences); Environment.ambient_temperature is Kelvin
because gas-law vacuum models use it absolutely.
"""
from dataclasses import dataclass, field

import numpy as np

from .geometry import GRAVITY, CircularSection, circular_section
from .vacuum import VacuumModel, VentChannel


@dataclass(frozen=True)
class Environment:
    """Ambient conditions and air properties for gas-law models."""
    ambient_pressure: float = 101325.0     # Pa
    ambient_temperature: float = 293.15    # K (absolute — gas law)
    gas_constant: float = 287.05           # J/(kg K), air
    heat_capacity_ratio: float = 1.4       # gamma, air
    viscosity: float = 1.82e-5             # Pa s, air at 20 °C (vent channels)

    def __post_init__(self):
        if (self.ambient_pressure <= 0.0 or self.ambient_temperature <= 0.0
                or self.gas_constant <= 0.0 or self.heat_capacity_ratio <= 1.0
                or self.viscosity <= 0.0):
            raise ValueError("environment values must be physical "
                             "(pressures/temperatures/viscosity > 0, gamma > 1).")


@dataclass(frozen=True)
class Melt:
    """Melt material properties."""
    density: float
    specific_heat: float
    pouring_temperature: float
    latent_heat: float | None = None
    liquidus: float | None = None
    solidus: float | None = None
    viscosity: float | None = None

    def __post_init__(self):
        if self.density <= 0.0 or self.specific_heat <= 0.0:
            raise ValueError("density and specific_heat must be greater than zero.")
        if self.latent_heat is not None and self.latent_heat <= 0.0:
            raise ValueError("latent_heat must be greater than zero.")
        if self.viscosity is not None and self.viscosity <= 0.0:
            raise ValueError("viscosity must be greater than zero.")
        if (self.liquidus is not None and self.solidus is not None
                and self.solidus > self.liquidus):
            raise ValueError("solidus must not exceed liquidus.")


@dataclass(frozen=True)
class ShotSleeve:
    """Horizontal shot sleeve. pour_hole_position is the plunger stroke at
    which the trailing edge of the pour hole is sealed; pour_hole_area is the
    opening's flow area (None = treat as an ideal vent while open)."""
    diameter: float
    length: float
    fill_fraction: float
    pour_hole_position: float
    pour_hole_area: float | None = None
    gravity: float = GRAVITY

    def __post_init__(self):
        if self.diameter <= 0.0 or self.length <= 0.0:
            raise ValueError("diameter and length must be greater than zero.")
        if not 0.0 < self.fill_fraction < 1.0:
            raise ValueError("fill_fraction must be strictly between 0 and 1.")
        if not 0.0 < self.pour_hole_position <= self.length:
            raise ValueError("pour_hole_position must lie within the sleeve.")
        if self.pour_hole_area is not None and self.pour_hole_area <= 0.0:
            raise ValueError("pour_hole_area must be greater than zero.")

    @property
    def area(self):
        """Bore cross-section area pi/4 * D^2."""
        return np.pi * self.diameter**2 / 4.0

    @property
    def volume(self): return self.area * self.length

    @property
    def melt_volume(self):
        """Dosed melt volume at the target fill fraction."""
        return self.fill_fraction * self.volume

    @property
    def stroke_to_fill(self):
        """Stroke after which the melt fills the whole cross-section."""
        return self.length * (1.0 - self.fill_fraction)

    def section(self, fill_fraction) -> CircularSection:
        """Melt cross-section at an arbitrary fill fraction."""
        return circular_section(self.diameter, fill_fraction, self.gravity)


@dataclass(frozen=True)
class Runner:
    """Runner system between sleeve and cavity; gate_area enables gate
    velocity output, surface_area enables downstream heat-loss models."""
    volume: float
    gate_area: float | None = None
    surface_area: float | None = None

    def __post_init__(self):
        if self.volume <= 0.0:
            raise ValueError("runner volume must be greater than zero.")
        if self.gate_area is not None and self.gate_area <= 0.0:
            raise ValueError("gate_area must be greater than zero.")
        if self.surface_area is not None and self.surface_area <= 0.0:
            raise ValueError("surface_area must be greater than zero.")


@dataclass(frozen=True)
class Part:
    """Cast part cavity volume; surface_area enables downstream heat-loss
    models."""
    volume: float
    surface_area: float | None = None

    def __post_init__(self):
        if self.volume <= 0.0:
            raise ValueError("part volume must be greater than zero.")
        if self.surface_area is not None and self.surface_area <= 0.0:
            raise ValueError("surface_area must be greater than zero.")


@dataclass(frozen=True)
class Overflow:
    """Aggregated overflow (and vent well) volume."""
    volume: float
    surface_area: float | None = None

    def __post_init__(self):
        if self.volume < 0.0:
            raise ValueError("overflow volume must not be negative.")
        if self.surface_area is not None and self.surface_area <= 0.0:
            raise ValueError("surface_area must be greater than zero.")


@dataclass(frozen=True)
class CastingSystem:
    """Everything downstream of the sleeve, filled in order
    runner -> part -> overflow. vent_area is the total chill-vent flow area
    to ambient (used by the vented vacuum models); vent_channel describes
    those vents as slit channels with friction — without it they are plain
    orifices."""
    runner: Runner
    part: Part
    overflow: Overflow = field(default_factory=lambda: Overflow(0.0))
    vent_area: float | None = None
    vent_channel: VentChannel | None = None

    def __post_init__(self):
        if self.vent_area is not None and self.vent_area <= 0.0:
            raise ValueError("vent_area must be greater than zero.")
        if self.vent_channel is not None and self.vent_area is None:
            raise ValueError("vent_channel needs a vent_area.")

    @property
    def total_volume(self):
        return self.runner.volume + self.part.volume + self.overflow.volume

    def distribute(self, melt_volume):
        """Split a downstream melt volume into (runner, part, overflow)
        volumes plus the melt-front region name."""
        v = max(0.0, float(melt_volume))
        vr = min(v, self.runner.volume); v -= vr
        vp = min(v, self.part.volume); v -= vp
        vo = min(v, self.overflow.volume); v -= vo
        if vr < self.runner.volume: region = "runner"
        elif vp < self.part.volume: region = "part"
        elif vo < self.overflow.volume: region = "overflow"
        else: region = "complete"
        return vr, vp, vo, region

    def wetted_area(self, runner_fill, part_fill, overflow_fill):
        """Approximate downstream wetted area: each component's surface area
        scaled by its fill fraction. Components without a surface_area
        contribute nothing."""
        total = 0.0
        for component, fill in ((self.runner, runner_fill),
                                (self.part, part_fill),
                                (self.overflow, overflow_fill)):
            if component.surface_area is not None:
                total += component.surface_area * fill
        return total


@dataclass(frozen=True)
class VacuumSystem:
    """Vacuum valve opened at a plunger stroke, with an attached pressure
    model. It closes at `end_position`, or after `duration` seconds of
    being open (the process resolves that to a stroke along the motion
    profile), or — with neither given — "when the melt reaches the valve":
    the fill-complete stroke (capped at the profile travel). After closing
    the remaining air is compressed. valve_area is the valve's flow area,
    needed by the vented models; valve_channel describes the vent path to
    the valve as a slit channel with friction (without it: plain orifice)."""
    start_position: float
    model: VacuumModel
    end_position: float | None = None
    valve_area: float | None = None
    valve_channel: VentChannel | None = None
    duration: float | None = None

    def __post_init__(self):
        if self.start_position < 0.0:
            raise ValueError("start_position must not be negative.")
        if (self.end_position is not None
                and self.end_position <= self.start_position):
            raise ValueError("end_position must exceed start_position.")
        if self.duration is not None:
            if self.duration <= 0.0:
                raise ValueError("duration must be greater than zero.")
            if self.end_position is not None:
                raise ValueError("give either end_position or duration, "
                                 "not both.")
        if self.valve_area is not None and self.valve_area <= 0.0:
            raise ValueError("valve_area must be greater than zero.")
        if self.valve_channel is not None and self.valve_area is None:
            raise ValueError("valve_channel needs a valve_area.")

    def active(self, stroke):
        if self.end_position is None:
            raise ValueError("end_position not resolved; attach the "
                             "VacuumSystem to a ShotProcess first.")
        return self.start_position <= stroke < self.end_position
