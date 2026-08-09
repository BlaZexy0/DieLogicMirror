import os
import tempfile

import numpy as np

from common import (build_casting, build_melt, build_process, build_profile,
                    build_sleeve, raises)
from hpdcsim import (CastingSystem, IdealVacuum, LumpedCapacitance,
                     MotionProfile, Overflow, Part, Phase, Runner,
                     VacuumSystem)


def test_volume_conservation_and_air_balance():
    process = build_process()
    area = process.sleeve.area
    for spacing in ("time", "distance"):
        for x in process.iter_states(150, spacing=spacing):
            parts = (x.sleeve_melt_volume + x.runner_melt_volume
                     + x.part_melt_volume + x.overflow_melt_volume)
            assert abs(parts - x.melt_volume) < 1e-12
            system = (area*(process.sleeve.length - x.stroke)
                      + process.casting.total_volume)
            assert abs(x.air_volume + x.melt_volume - system) < 1e-12
            if x.phase in (Phase.SHOT, Phase.COMPLETE):
                assert abs(x.melt_volume - process.sleeve.melt_volume) < 1e-15


def test_events_are_ordered_and_consistent():
    process = build_process()
    events = process.events()
    times = [e.time for e in events.values()]
    assert times == sorted(times)
    assert abs(events["sleeve_full"].stroke - process.stroke_to_fill) < 1e-12
    assert abs(events["dosing_end"].time - 4.0) < 1e-12
    assert abs(events["shot_start"].time - 5.5) < 1e-12
    # 470 mm travel: part_full (471.2 mm) and fill_complete not reached
    assert "part_full" not in events and "fill_complete" not in events


def test_state_round_trips_and_flows():
    process = build_process()
    s_event = process.stroke_of("runner_full")
    t_event = process.time_of("runner_full")
    assert abs(process.state_at_time(t_event).stroke - s_event) < 1e-9
    before = process.state_at_stroke(s_event - 0.005)
    after = process.state_at_stroke(s_event + 0.005)
    assert before.gate_flow_rate == 0.0 and after.gate_flow_rate > 0.0
    assert abs(after.gate_velocity - after.gate_flow_rate/180e-6) < 1e-9
    assert abs(process.flow_rate_at_time(2.0)
               - process.sleeve.melt_volume/4.0) < 1e-15
    assert abs(process.flow_rate_at_stroke(0.3)
               - process.sleeve.area*process.velocity_at_stroke(0.3)) < 1e-12


def test_wetted_area_split():
    process = build_process()
    for x in process.iter_states(80, spacing="distance"):
        assert abs(x.shell_wetted_area + x.plunger_face_area
                   + x.die_face_area - x.wetted_area) < 1e-12
        assert abs(x.total_wetted_area
                   - (x.wetted_area + x.downstream_wetted_area)) < 1e-12
        assert abs(x.melt_mass - x.melt_volume*2400.0) < 1e-9


def test_vacuum_end_defaults_to_fill_complete():
    vacuum = VacuumSystem(start_position=0.15, model=IdealVacuum(8e3))
    process = build_process(vacuum=vacuum)
    expected = min(process.profile.end_position, process.fill_complete_stroke)
    assert abs(process.vacuum.end_position - expected) < 1e-12
    assert process.vacuum.active(0.3)


def test_construction_errors():
    huge_casting = CastingSystem(Runner(2000e-6), Part(680e-6), Overflow(0.0))
    raises(ValueError, build_process, casting=huge_casting)
    raises(ValueError, build_process, motion=build_profile(s_end=0.49))
    raises(ValueError, build_process, dosing_time=0.0)
    bad_vacuum = VacuumSystem(0.15, IdealVacuum(8e3), end_position=0.48)
    raises(ValueError, build_process, vacuum=bad_vacuum)


def test_meltless_process_gives_nan_mass():
    process = build_process(melt=None)
    assert np.isnan(process.state_at_time(6.0).melt_mass)
    assert np.isnan(process.state_at_time(6.0).melt_temperature)


def test_attached_thermal_fills_state_temperature():
    process = build_process(thermal=LumpedCapacitance(1500.0, 200.0))
    state = process.state_at_time(process.shot_start_time)
    assert 200.0 < state.melt_temperature < 680.0
    t, temp = process.temperatures(100)
    assert temp[0] == 680.0 and np.all(np.diff(temp) <= 1e-9)
    assert abs(process.temperature_at_time(t[42]) - temp[42]) < 1e-9


def test_critical_crossing():
    # Default fixture accelerates at s_u=0.25 < stroke_to_fill: the ramp
    # crosses the (constant, dosed-fill) Garber/Lopez limit before the
    # sleeve runs full.
    process = build_process()
    crossing = process.critical_crossing()
    assert abs(crossing.velocity_margin) < 1e-6
    assert 0.0 < crossing.stroke < process.stroke_to_fill
    # The criterion is evaluated at the dosed fill, constant over the shot.
    state0 = process.state_at_stroke(0.0)
    assert abs(state0.critical_velocity - process.critical_velocity) < 1e-12
    assert abs(crossing.critical_velocity - process.critical_velocity) < 1e-12


def test_no_flag_after_sleeve_full():
    # Slow phase stays subcritical; acceleration starts only at
    # stroke_to_fill (no free surface left) -> nothing may be flagged.
    from hpdcsim import TwoStageLaw
    process = build_process(motion=TwoStageLaw(a1=2.0, v1=0.3, a2=15.0,
                                               v2=2.5))
    assert process.critical_velocity > 0.3
    assert process.critical_crossing() is None
    # After the sleeve is full the criterion no longer applies.
    state = process.state_at_stroke(process.stroke_to_fill + 0.05)
    assert np.isnan(state.critical_velocity)
    assert state.is_subcritical


def test_critical_velocity_models():
    garber = build_process()
    nogo = build_process(critical_velocity_model="nogowizin")
    phi = garber.sleeve.fill_fraction
    section = garber.sleeve.section(phi)
    assert garber.critical_velocity_model == "garber_lopez"
    assert nogo.critical_velocity_model == "nogowizin"
    assert abs(garber.critical_velocity - section.critical_velocity) < 1e-12
    expected = (np.sqrt(section.gravity * section.diameter)
                * (1.386 - 1.915*phi + 0.615*phi*phi))
    assert abs(nogo.critical_velocity - expected) < 1e-12
    try:
        build_process(critical_velocity_model="unbekannt")
        assert False, "unknown model must raise"
    except ValueError:
        pass


def test_arrays_and_csv_export():
    process = build_process(thermal=LumpedCapacitance(1500.0, 200.0))
    data = process.arrays(count=40)
    for key in ("time", "stroke", "velocity", "melt_temperature",
                "air_pressure", "gate_velocity", "froude"):
        assert key in data and len(data[key]) == 40
    path = os.path.join(tempfile.gettempdir(), "hpdcsim_test.csv")
    process.export_csv(path, count=30)
    with open(path) as stream:
        lines = stream.read().splitlines()
    assert len(lines) == 31 and "melt_temperature" in lines[0]
    os.remove(path)


def test_dosing_phase_states():
    process = build_process()
    state = process.state_at_time(2.0)
    assert state.phase is Phase.DOSING
    assert abs(state.melt_volume - 0.5*process.sleeve.melt_volume) < 1e-12
    assert state.pour_hole_open and state.plunger_velocity == 0.0
    assert process.state_at_time(5.0).phase is Phase.DWELL
