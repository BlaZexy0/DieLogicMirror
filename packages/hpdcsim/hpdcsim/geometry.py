"""Circular-segment cross-section of a horizontal cylinder. SI units only.

fill -> height inversion uses a precomputed interpolation table (fast enough
for tight model integration loops); `height_from_fill_fraction_exact` keeps
the brentq root-solve for validation.
"""
from dataclasses import dataclass

import numpy as np
from scipy.optimize import brentq

GRAVITY = 9.80665  # m/s^2


def area_fraction_from_height(height_over_diameter):
    """Filled circular area fraction from relative height h/D."""
    y = np.asarray(height_over_diameter, dtype=float)
    if np.any((y < 0.0) | (y > 1.0)):
        raise ValueError("height_over_diameter must be between 0 and 1.")
    root = np.sqrt(np.clip(y * (1.0 - y), 0.0, None))
    value = (np.arccos(1.0 - 2.0*y) - 2.0*(1.0 - 2.0*y)*root) / np.pi
    return float(value) if value.ndim == 0 else value


_TABLE_HEIGHT = np.linspace(0.0, 1.0, 8193)
_TABLE_FILL = area_fraction_from_height(_TABLE_HEIGHT)


def height_from_fill_fraction(fill_fraction):
    """Relative liquid height h/D from circular area fill fraction
    (table-interpolated, error < 1e-6 except in the extreme tails)."""
    fill = float(fill_fraction)
    if not 0.0 <= fill <= 1.0:
        raise ValueError("fill_fraction must be between 0 and 1.")
    return float(np.interp(fill, _TABLE_FILL, _TABLE_HEIGHT))


def height_from_fill_fraction_exact(fill_fraction):
    """Exact (brentq) inversion; slower, used for validation."""
    fill = float(fill_fraction)
    if not 0.0 <= fill <= 1.0:
        raise ValueError("fill_fraction must be between 0 and 1.")
    if fill in (0.0, 1.0):
        return fill
    return brentq(lambda y: area_fraction_from_height(y) - fill, 0.0, 1.0)


@dataclass(frozen=True)
class CircularSection:
    """Liquid cross-section in a horizontal cylinder bore."""
    fill_fraction: float
    diameter: float
    height: float
    chord: float
    arc: float
    area: float
    central_angle: float
    gravity: float = GRAVITY

    @property
    def height_over_D(self): return self.height / self.diameter
    @property
    def free_surface_width(self): return self.chord
    @property
    def wetted_perimeter(self): return self.arc
    @property
    def hydraulic_depth(self): return np.nan if self.chord <= 0 else self.area / self.chord
    @property
    def hydraulic_radius(self): return np.nan if self.arc <= 0 else self.area / self.arc

    @property
    def wave_speed_D(self):
        """Shallow-water wave speed based on bore diameter: sqrt(g*D)."""
        return np.sqrt(self.gravity * self.diameter)

    @property
    def wave_speed_h(self):
        """Shallow-water wave speed based on liquid height: sqrt(g*h)."""
        return np.sqrt(self.gravity * self.height)

    @property
    def wave_speed_hydraulic(self):
        """Wave speed based on hydraulic depth A/b: sqrt(g*h_hydraulic)."""
        return np.sqrt(self.gravity * self.hydraulic_depth)

    @property
    def critical_velocity(self):
        """Critical plunger velocity 2*(sqrt(g*D) - sqrt(g*h)) (Garber/Lopez)."""
        return 2.0 * (self.wave_speed_D - self.wave_speed_h)

    def froude(self, velocity):
        """Froude number v / sqrt(g*h_hydraulic); nan without a free surface."""
        return float(velocity) / self.wave_speed_hydraulic


# --- critical-velocity criteria -----------------------------------------
# A criterion maps the DOSED melt cross-section (the initial fill state,
# where the classic slow-shot limits are defined) to a critical plunger
# velocity. Selected per process via ShotProcess(critical_velocity_model=…)
# or the JSON key process.critical_velocity_model.

def critical_velocity_garber_lopez(section):
    """Garber/Lopez: 2*(sqrt(g*D) - sqrt(g*h))."""
    return 2.0 * (section.wave_speed_D - section.wave_speed_h)


def critical_velocity_nogowizin(section):
    """Nogowizin: sqrt(g*D) * (1.386 - 1.915*phi + 0.615*phi^2)."""
    phi = section.fill_fraction
    return (np.sqrt(section.gravity * section.diameter)
            * (1.386 - 1.915 * phi + 0.615 * phi * phi))


CRITICAL_VELOCITY_MODELS = {
    "garber_lopez": critical_velocity_garber_lopez,
    "nogowizin": critical_velocity_nogowizin,
}


def register_critical_velocity_model(name, fn):
    """fn(section: CircularSection) -> float, evaluated at the dosed fill."""
    CRITICAL_VELOCITY_MODELS[str(name)] = fn


def resolve_critical_velocity_model(model):
    """Accept a registry name or a callable; return (name, fn)."""
    if callable(model):
        return getattr(model, "__name__", "custom"), model
    try:
        return str(model), CRITICAL_VELOCITY_MODELS[model]
    except KeyError:
        raise ValueError(
            f"unknown critical_velocity_model {model!r}; "
            f"available: {sorted(CRITICAL_VELOCITY_MODELS)}.") from None


def circular_section(diameter, fill_fraction, gravity=GRAVITY):
    """Build a CircularSection from bore diameter and area fill fraction."""
    diameter, fill = float(diameter), float(fill_fraction)
    if diameter <= 0.0:
        raise ValueError("diameter must be greater than zero.")
    if not 0.0 <= fill <= 1.0:
        raise ValueError("fill_fraction must be between 0 and 1.")
    y = height_from_fill_fraction(fill)
    chord_over_D = 2.0*np.sqrt(max(0.0, y*(1.0-y)))
    angle = 2.0*np.arccos(np.clip(1.0-2.0*y, -1.0, 1.0))
    return CircularSection(
        fill, diameter, y*diameter, chord_over_D*diameter,
        angle*diameter/2.0, fill*np.pi*diameter**2/4.0, angle, float(gravity)
    )
