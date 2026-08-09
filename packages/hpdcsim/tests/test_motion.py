import numpy as np

from common import raises
from hpdcsim import MotionProfile


def test_shot_curve_v1_reached():
    p = MotionProfile.shot_curve(2.0, 0.3, 0.25, 15.0, 2.5, 0.5)
    assert abs(p.velocity_at_position(0.1) - 0.3) < 1e-12
    assert abs(p.velocity_at_position(0.48) - 2.5) < 1e-12
    ramp_end = 0.25 + (2.5**2 - 0.3**2)/(2*15.0)
    assert abs(p.velocity_at_position(ramp_end) - 2.5) < 1e-9


def test_shot_curve_v1_not_reached_by_s_u():
    p = MotionProfile.shot_curve(0.1, 0.5, 0.25, 15.0, 2.5, 0.5)
    v_u = np.sqrt(2*0.1*0.25)
    assert abs(p.velocity_at_position(0.25) - v_u) < 1e-9
    assert abs(p.velocity_at_position(0.5) - 2.5) < 1e-9


def test_shot_curve_v2_not_reached_by_s_end():
    p = MotionProfile.shot_curve(2.0, 0.3, 0.25, 1.0, 5.0, 0.5)
    v_end = np.sqrt(0.3**2 + 2*1.0*0.25)
    assert abs(p.velocity_at_position(0.5) - v_end) < 1e-9


def test_shot_curve_deceleration_stage():
    p = MotionProfile.shot_curve(5.0, 1.0, 0.2, 2.0, 0.2, 0.5)
    assert abs(p.velocity_at_position(0.5) - 0.2) < 1e-9


def test_sampling_spacings():
    p = MotionProfile.shot_curve(2.0, 0.3, 0.25, 15.0, 2.5, 0.5)
    t, v, s, a = p.samples(11, spacing="time")
    assert np.allclose(np.diff(t), t[1]-t[0])
    t2, v2, s2, a2 = p.samples(11, spacing="distance")
    assert np.allclose(np.diff(s2), s2[1]-s2[0])
    raises(ValueError, lambda: list(p.iter_samples(11, spacing="bogus")))


def test_time_position_roundtrip():
    p = MotionProfile.shot_curve(2.0, 0.3, 0.25, 15.0, 2.5, 0.5)
    for s in (0.05, 0.2, 0.35, 0.49):
        t = p.time_at_position(s)
        assert abs(p.position_at_time(t) - s) < 1e-9
    assert abs(p.maximum_velocity() - 2.5) < 1e-12


def test_from_velocity_law_reproduces_constant_acceleration():
    a, s_end = 3.0, 0.4
    p = MotionProfile.from_velocity_law(lambda s: np.sqrt(2*a*s), s_end,
                                        count=400)
    assert abs(p.end_time - np.sqrt(2*s_end/a)) < 1e-5
    assert abs(p.velocity_at_position(0.2) - np.sqrt(2*a*0.2)) < 1e-9


def test_from_velocity_law_rejects_zero_span():
    raises(ValueError,
           MotionProfile.from_velocity_law, lambda s: max(0.0, s-0.1), 0.4)
    raises(ValueError, MotionProfile.from_velocity_law, lambda s: 1.0, -0.1)


def test_profile_validation():
    raises(ValueError, MotionProfile, [0.0, 0.1], [0.0, -1.0])
    raises(ValueError, MotionProfile, [0.0, 0.1, 0.05], [0.0, 1.0, 1.0])
    raises(ValueError, MotionProfile, [0.0, 0.1], [0.0, 0.0])
