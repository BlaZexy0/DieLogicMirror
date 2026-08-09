import numpy as np

from common import build_process, raises
from hpdcsim import (ConstantTemperature, LumpedCapacitance,
                     MultiSurfaceLumped)


def test_requires_melt():
    process = build_process(melt=None)
    raises(ValueError, LumpedCapacitance(1500.0, 200.0).solve, process)
    raises(ValueError, ConstantTemperature().solve, process)


def test_constant_temperature():
    process = build_process()
    assert ConstantTemperature(700.0).temperature_at_time(process, 3.0) == 700.0
    assert ConstantTemperature().temperature_at_time(process, 3.0) == 680.0


def test_lumped_cooling_bounds_and_monotony():
    process = build_process()
    t, temp = LumpedCapacitance(1500.0, 200.0).solve(process, 600)
    assert temp[0] == 680.0
    assert np.all(np.diff(temp) <= 1e-9)
    assert np.all(temp >= 200.0) and np.all(temp <= 680.0)


def test_dosing_enthalpy_slows_cooling_during_dosing():
    process = build_process()
    with_inflow = LumpedCapacitance(1500.0, 200.0, dosing_enthalpy=True)
    without = LumpedCapacitance(1500.0, 200.0, dosing_enthalpy=False)
    t_dose = process.dosing_time
    assert (with_inflow.temperature_at_time(process, t_dose)
            > without.temperature_at_time(process, t_dose))


def test_multi_surface_matches_lumped_when_equivalent():
    process = build_process()
    lumped = LumpedCapacitance(1500.0, 200.0)
    multi = MultiSurfaceLumped({name: (1500.0, 200.0) for name in
                                ("shell", "plunger_face", "die_face",
                                 "downstream")})
    t1, a = lumped.solve(process, 400)
    t2, b = multi.solve(process, 400)
    assert np.allclose(a, b, rtol=1e-9)


def test_multi_surface_selective_surfaces_cool_less():
    process = build_process()
    all_surfaces = MultiSurfaceLumped({name: (1500.0, 200.0) for name in
                                       ("shell", "plunger_face", "die_face",
                                        "downstream")})
    shell_only = MultiSurfaceLumped({"shell": (1500.0, 200.0)})
    _, full = all_surfaces.solve(process, 300)
    _, partial = shell_only.solve(process, 300)
    assert partial[-1] > full[-1]


def test_multi_surface_validation():
    raises(ValueError, MultiSurfaceLumped, {})
    raises(ValueError, MultiSurfaceLumped, {"bogus": (100.0, 200.0)})
    raises(ValueError, MultiSurfaceLumped, {"shell": (-1.0, 200.0)})
    raises(ValueError, LumpedCapacitance, -1.0, 200.0)


def test_attached_model_and_recursion_guard():
    process = build_process(
        thermal=MultiSurfaceLumped({"shell": (2000.0, 180.0),
                                    "downstream": (4000.0, 150.0)}))
    state = process.state_at_time(process.total_time)
    assert 150.0 < state.melt_temperature < 680.0
    # solving again through the state path reuses the cache
    cached = process._thermal_solution
    process.state_at_time(1.0)
    assert process._thermal_solution is cached
