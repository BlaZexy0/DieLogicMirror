import numpy as np

from common import raises
from hpdcsim import circular_section
from hpdcsim.geometry import (area_fraction_from_height,
                              height_from_fill_fraction,
                              height_from_fill_fraction_exact)


def test_area_fraction_endpoints_and_symmetry():
    assert area_fraction_from_height(0.0) == 0.0
    assert abs(area_fraction_from_height(1.0) - 1.0) < 1e-12
    assert abs(area_fraction_from_height(0.5) - 0.5) < 1e-12
    for y in (0.1, 0.25, 0.4):
        assert abs(area_fraction_from_height(y)
                   + area_fraction_from_height(1.0 - y) - 1.0) < 1e-12


def test_height_inversion_roundtrip():
    for fill in np.linspace(0.001, 0.999, 41):
        y = height_from_fill_fraction(fill)
        assert abs(area_fraction_from_height(y) - fill) < 1e-5


def test_table_matches_exact_inversion():
    for fill in np.linspace(0.001, 0.999, 41):
        assert abs(height_from_fill_fraction(fill)
                   - height_from_fill_fraction_exact(fill)) < 2e-6


def test_half_full_section():
    s = circular_section(0.1, 0.5)
    assert abs(s.height - 0.05) < 1e-9
    assert abs(s.chord - 0.1) < 1e-6
    assert abs(s.central_angle - np.pi) < 1e-5
    assert abs(s.area - 0.5*np.pi*0.1**2/4.0) < 1e-12
    assert abs(s.hydraulic_depth - s.area/s.chord) < 1e-12


def test_wave_speeds_and_critical_velocity():
    s = circular_section(0.09, 0.35)
    g = 9.80665
    assert abs(s.wave_speed_D - np.sqrt(g*0.09)) < 1e-12
    assert abs(s.wave_speed_h - np.sqrt(g*s.height)) < 1e-12
    assert abs(s.critical_velocity
               - 2.0*(np.sqrt(g*0.09) - np.sqrt(g*s.height))) < 1e-12
    assert abs(s.froude(s.wave_speed_hydraulic) - 1.0) < 1e-12
    # full bore: no head difference left
    assert abs(circular_section(0.09, 1.0).critical_velocity) < 1e-9


def test_validation():
    raises(ValueError, circular_section, -1.0, 0.5)
    raises(ValueError, circular_section, 0.09, 1.5)
    raises(ValueError, height_from_fill_fraction, -0.1)
    raises(ValueError, area_fraction_from_height, 1.2)
