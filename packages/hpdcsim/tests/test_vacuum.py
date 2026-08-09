import numpy as np

from common import build_casting, build_process, build_sleeve, raises
from hpdcsim import (ATMOSPHERE, ConductanceVacuum, IdealVacuum, NoVacuum,
                     PumpedVacuum, VacuumModel, VacuumSystem,
                     orifice_mass_flow)


def with_vacuum(model, **kwargs):
    return build_process(vacuum=VacuumSystem(start_position=0.15, model=model,
                                             end_position=0.42, **kwargs))


def test_no_vacuum_sealed_isothermal():
    process = build_process()
    assert process.air_pressure_at_stroke(0.10) == ATMOSPHERE
    v_seal = process.air_volume_at_stroke(0.12)
    for s in (0.20, 0.30, 0.40):
        expected = ATMOSPHERE*v_seal/process.air_volume_at_stroke(s)
        assert abs(process.air_pressure_at_stroke(s) - expected) < 1e-9


def test_ideal_vacuum_phases():
    process = with_vacuum(IdealVacuum(8e3))
    assert process.air_pressure_at_stroke(0.10) == ATMOSPHERE
    assert ATMOSPHERE < process.air_pressure_at_stroke(0.14) < 1.1*ATMOSPHERE
    assert process.air_pressure_at_stroke(0.30) == 8e3
    v_close = process.air_volume_at_stroke(0.42)
    expected = 8e3*v_close/process.air_volume_at_stroke(0.45)
    assert abs(process.air_pressure_at_stroke(0.45) - expected) < 1e-9


def test_pumped_vacuum_ordering_and_floor():
    pressures = [with_vacuum(PumpedVacuum(s)).air_pressure_at_stroke(0.40)
                 for s in (0.001, 0.005, 0.05)]
    sealed = build_process().air_pressure_at_stroke(0.40)
    assert 0.0 <= pressures[2] < pressures[1] < pressures[0] < sealed
    floored = with_vacuum(PumpedVacuum(0.05, ultimate_pressure=5e3))
    assert floored.air_pressure_at_stroke(0.40) >= 5e3*0.99


def test_conductance_large_valve_approaches_pump_pressure():
    process = with_vacuum(ConductanceVacuum(8e3), valve_area=5e-3)
    p = process.air_pressure_at_stroke(0.40)
    assert 8e3*0.99 <= p <= 8e3*1.5


def test_conductance_tiny_valve_matches_sealed():
    process = with_vacuum(ConductanceVacuum(8e3), valve_area=1e-9)
    sealed = build_process()
    for s in (0.20, 0.35):
        a, b = process.air_pressure_at_stroke(s), sealed.air_pressure_at_stroke(s)
        assert abs(a - b)/b < 0.02


def test_conductance_pour_hole_orifice_overpressure():
    sleeve = build_sleeve(pour_hole_area=3e-6)
    process = build_process(
        sleeve=sleeve,
        vacuum=VacuumSystem(0.15, ConductanceVacuum(8e3), end_position=0.42,
                            valve_area=1e-9))
    # while the pour hole is still open, the moving plunger builds
    # overpressure because the small orifice cannot vent the sweep rate
    assert process.air_pressure_at_stroke(0.10) > 1.05*ATMOSPHERE


def test_conductance_requires_valve_area():
    process = with_vacuum(ConductanceVacuum(8e3))  # valve_area missing
    raises(ValueError, process.air_pressure_at_stroke, 0.3)


def test_orifice_mass_flow_properties():
    args = (293.15, 287.05, 1.4)
    assert orifice_mass_flow(0.8, 1e-4, 1e5, 1e5, *args) == 0.0
    assert orifice_mass_flow(0.8, 1e-4, 1e5, 2e5, *args) == 0.0
    choked_a = orifice_mass_flow(0.8, 1e-4, 1e5, 1e3, *args)
    choked_b = orifice_mass_flow(0.8, 1e-4, 1e5, 1e4, *args)
    assert abs(choked_a - choked_b) < 1e-12  # both fully choked
    subsonic = orifice_mass_flow(0.8, 1e-4, 1e5, 9e4, *args)
    assert 0.0 < subsonic < choked_a
    assert abs(orifice_mass_flow(0.8, 2e-4, 1e5, 1e3, *args)
               - 2.0*choked_a) < 1e-12


def test_pressure_solution_is_cached():
    process = with_vacuum(PumpedVacuum(0.005))
    process.air_pressure_at_time(6.0)
    cached = process._pressure_solution
    process.air_pressure_at_time(6.3)
    assert process._pressure_solution is cached


def test_model_without_implementation_raises():
    class Broken(VacuumModel):
        pass
    process = with_vacuum(Broken())
    raises(NotImplementedError, process.air_pressure_at_stroke, 0.3)
