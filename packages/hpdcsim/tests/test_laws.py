import numpy as np

from common import build_casting, build_process, build_sleeve
from hpdcsim import (MotionProfile, PlungerLaw, ShotPlan, TwoStageLaw,
                     VelocityFunctionLaw)


def test_plan_strokes_match_volumes():
    sleeve, casting = build_sleeve(), build_casting()
    plan = ShotPlan(sleeve, casting)
    area = sleeve.area
    assert abs(plan.sleeve_full_stroke - 0.5*(1 - 0.35)) < 1e-12
    assert abs(plan.runner_full_stroke
               - plan.sleeve_full_stroke - 250e-6/area) < 1e-12
    assert abs(plan.part_full_stroke
               - plan.runner_full_stroke - 680e-6/area) < 1e-12
    assert abs(plan.fill_complete_stroke
               - plan.part_full_stroke - 90e-6/area) < 1e-12
    assert abs(plan.biscuit_length
               - (sleeve.length - plan.fill_complete_stroke)) < 1e-12
    assert abs(plan.fill_at_stroke(0.0) - 0.35) < 1e-12
    assert abs(plan.fill_at_stroke(plan.sleeve_full_stroke) - 1.0) < 1e-12


def test_two_stage_law_defaults_to_plan_strokes():
    plan = ShotPlan(build_sleeve(), build_casting())
    profile = TwoStageLaw(a1=2.0, v1=0.3, a2=15.0, v2=2.5).build(plan)
    assert abs(profile.end_position - plan.fill_complete_stroke) < 1e-12
    # switch happens at the sleeve-full stroke: still at v1 just before
    assert abs(profile.velocity_at_position(plan.sleeve_full_stroke - 1e-6)
               - 0.3) < 1e-6


def test_two_stage_law_explicit_strokes():
    plan = ShotPlan(build_sleeve(), build_casting())
    profile = TwoStageLaw(2.0, 0.3, 15.0, 2.5, s_u=0.2, s_end=0.4).build(plan)
    assert abs(profile.end_position - 0.4) < 1e-12


def test_velocity_function_law():
    plan = ShotPlan(build_sleeve(), build_casting())
    law = VelocityFunctionLaw(lambda s, p: np.sqrt(2*3.0*s), s_end=0.4)
    profile = law.build(plan)
    assert abs(profile.velocity_at_position(0.2) - np.sqrt(2*3.0*0.2)) < 1e-9


def test_custom_plunger_law_with_process():
    class ConstantVelocity(PlungerLaw):
        def build(self, plan):
            end = plan.sleeve_full_stroke
            return MotionProfile([0.0, end], [0.2, 0.2], add_origin=False)

    process = build_process(motion=ConstantVelocity())
    assert abs(process.profile.end_position - process.plan.sleeve_full_stroke) < 1e-12
    assert abs(process.velocity_at_stroke(0.1) - 0.2) < 1e-12
