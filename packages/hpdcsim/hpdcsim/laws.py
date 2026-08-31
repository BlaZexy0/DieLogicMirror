"""Plunger motion laws: geometry-aware MotionProfile builders. SI units only.

A PlungerLaw decouples the motion definition from the process the same way
VacuumModel and ThermalModel do: it receives a ShotPlan (the stroke targets
derived from sleeve and casting volumes) and returns a MotionProfile. This is
the extension point for literature laws — e.g. a Lopez et al. constant-wave
slow-shot law becomes a subclass that evaluates its v(s) from
plan.sleeve (diameter, fill, gravity) and discretizes it with
MotionProfile.from_velocity_law.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Callable

from .components import CastingSystem, ShotSleeve
from .motion import MotionProfile


@dataclass(frozen=True)
class ShotPlan:
    """Stroke targets derived from the sleeve and casting volumes."""
    sleeve: ShotSleeve
    casting: CastingSystem

    @property
    def sleeve_full_stroke(self):
        """Stroke at which the melt fills the sleeve cross-section."""
        return self.sleeve.stroke_to_fill

    @property
    def runner_full_stroke(self):
        return self.sleeve_full_stroke + self.casting.runner.volume/self.sleeve.area

    @property
    def part_full_stroke(self):
        return self.runner_full_stroke + self.casting.part.volume/self.sleeve.area

    @property
    def fill_complete_stroke(self):
        """Maximum meaningful plunger travel (start of the biscuit)."""
        return self.part_full_stroke + self.casting.overflow.volume/self.sleeve.area

    @property
    def biscuit_length(self):
        return self.sleeve.length - self.fill_complete_stroke

    def fill_at_stroke(self, stroke):
        """Sleeve fill fraction at a stroke (before the sleeve is full).

        At the sleeve end the remaining chamber is zero and beyond it the
        volume turns negative: the division blew up and then returned
        NEGATIVE fill fractions past the end. A fill fraction is bounded by
        [0, 1] by definition - at and beyond the end the sleeve is full."""
        chamber = self.sleeve.area*(self.sleeve.length - stroke)
        if chamber <= 0.0:
            return 1.0
        return min(1.0, self.sleeve.melt_volume/chamber)


class PlungerLaw(ABC):
    @abstractmethod
    def build(self, plan: ShotPlan) -> MotionProfile:
        ...


@dataclass(frozen=True)
class TwoStageLaw(PlungerLaw):
    """Classic two-stage shot: a1 towards v1, switch at s_u, a2 towards v2,
    end at s_end. s_u defaults to the sleeve-full stroke and s_end to the
    fill-complete stroke, so by default the curve matches the volumes."""
    a1: float
    v1: float
    a2: float
    v2: float
    s_u: float | None = None
    s_end: float | None = None

    def build(self, plan: ShotPlan) -> MotionProfile:
        s_u = plan.sleeve_full_stroke if self.s_u is None else self.s_u
        s_end = plan.fill_complete_stroke if self.s_end is None else self.s_end
        return MotionProfile.shot_curve(self.a1, self.v1, s_u,
                                        self.a2, self.v2, s_end)


@dataclass(frozen=True)
class VelocityFunctionLaw(PlungerLaw):
    """Arbitrary plunger law v(stroke, plan), discretized into a piecewise
    constant-acceleration profile. s_end defaults to the fill-complete
    stroke."""
    velocity: Callable[[float, ShotPlan], float]
    s_end: float | None = None
    count: int = 400

    def build(self, plan: ShotPlan) -> MotionProfile:
        s_end = plan.fill_complete_stroke if self.s_end is None else self.s_end
        return MotionProfile.from_velocity_law(
            lambda s: self.velocity(s, plan), s_end, count=self.count)
