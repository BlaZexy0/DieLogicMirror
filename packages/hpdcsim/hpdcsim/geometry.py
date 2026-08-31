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


def critical_velocity_segment_fit(section):
    """DieLogic segment fit of the shallow-water ceiling criterion
    v_crit = integral of sqrt(g*T/A) dh from the dosed level to the crown,
    evaluated for the circular section and fitted with basis functions from
    the endpoint asymptotics (phi^(1/3) cusp when empty, (1-phi)^(5/6)
    decay when full):

        sqrt(g*D) * (1-phi)^(5/6)
            * (2.3173 - 2.4762*u + 1.3404*u^2 - 0.3552*phi),  u = phi^(1/3)

    Max deviation from the exact integral: 0.25 % for phi in [0.01, 0.98].
    Mirrors vCrit() in web/tools/auslegung/js/core/physics.js."""
    phi = min(max(section.fill_fraction, 0.0), 1.0)
    u = phi ** (1.0 / 3.0)
    return (np.sqrt(section.gravity * section.diameter)
            * (1.0 - phi) ** (5.0 / 6.0)
            * (2.3173 - 2.4762 * u + 1.3404 * u * u - 0.3552 * phi))


def critical_velocity_cfd_table(section):
    """Bilinear interpolation of DieLogic's OpenFOAM CFD table
    (fixtures/vkrit/v_krit_sim.csv -> _vkrit_table.py): v_crit =
    sqrt(9.81*D) * f(D, phi). Edge rules: D clamped to the 60-300 mm grid;
    phi below 0.1 uses the 0.1 column (conservative, f rises toward small
    phi); phi above 0.9 ramps linearly to 0 at phi = 1.
    Mirrors vCrit() in web/tools/auslegung/js/core/physics.js.

    Denormalised with VKRIT_GRAVITY - the constant the table was NORMALISED
    with (generated alongside it). Using section.gravity here meant the table
    was normalised with 9.81 and denormalised with 9.80665, so every v_crit
    value differed from the JavaScript twin by a factor 1 + 1.708e-4. The
    fixture even documented the gap and loosened its tolerance to hide it."""
    from ._vkrit_table import VKRIT_D_MM, VKRIT_PHI, VKRIT_F, VKRIT_GRAVITY
    # Above the grid the diameter is clamped. BELOW it, clamping used to
    # report a too HIGH v_crit (f rises with D) - the unsafe direction. The
    # slope of the first two rows is continued instead: it follows the data
    # and errs low. Mirrors tableF() in physics.js.
    d_mm = min(section.diameter * 1000.0, VKRIT_D_MM[-1])
    phi = section.fill_fraction
    i = 0
    while i < len(VKRIT_D_MM) - 2 and VKRIT_D_MM[i + 1] < d_mm:
        i += 1
    t_d = (d_mm - VKRIT_D_MM[i]) / (VKRIT_D_MM[i + 1] - VKRIT_D_MM[i])

    def row(j):
        return max(0.0, VKRIT_F[i][j] * (1.0 - t_d) + VKRIT_F[i + 1][j] * t_d)

    p_lo, p_hi = VKRIT_PHI[0], VKRIT_PHI[-1]
    if phi <= p_lo:
        f = row(0)
    elif phi >= p_hi:
        f = row(len(VKRIT_PHI) - 1) * max(0.0, (1.0 - phi) / (1.0 - p_hi))
    else:
        j = 0
        while j < len(VKRIT_PHI) - 2 and VKRIT_PHI[j + 1] < phi:
            j += 1
        t_p = (phi - VKRIT_PHI[j]) / (VKRIT_PHI[j + 1] - VKRIT_PHI[j])
        f = row(j) * (1.0 - t_p) + row(j + 1) * t_p
    return np.sqrt(VKRIT_GRAVITY * section.diameter) * f


CRITICAL_VELOCITY_MODELS = {
    "garber_lopez": critical_velocity_garber_lopez,
    "nogowizin": critical_velocity_nogowizin,
    "segment_fit": critical_velocity_segment_fit,
    "cfd_table": critical_velocity_cfd_table,
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
