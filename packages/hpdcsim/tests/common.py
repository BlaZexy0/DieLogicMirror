"""Shared builders for the test suite (plain functions, no fixtures, so the
tests run under pytest and under the bundled run_tests.py alike)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hpdcsim import (CastingSystem, Melt, MotionProfile, Overflow, Part,
                     Runner, ShotProcess, ShotSleeve)


def build_sleeve(**overrides):
    values = dict(diameter=0.09, length=0.5, fill_fraction=0.35,
                  pour_hole_position=0.12)
    values.update(overrides)
    return ShotSleeve(**values)


def build_casting(**overrides):
    values = dict(
        runner=Runner(volume=250e-6, gate_area=180e-6, surface_area=0.030),
        part=Part(volume=680e-6, surface_area=0.45),
        overflow=Overflow(volume=90e-6, surface_area=0.008),
    )
    values.update(overrides)
    return CastingSystem(**values)


def build_melt():
    return Melt(density=2400.0, specific_heat=1050.0,
                pouring_temperature=680.0, latent_heat=440e3,
                liquidus=595.0, solidus=540.0)


def build_profile(s_end=0.47):
    return MotionProfile.shot_curve(2.0, 0.3, 0.25, 15.0, 2.5, s_end)


def build_process(**overrides):
    values = dict(dosing_time=4.0, dwell_time=1.5, melt=build_melt())
    sleeve = overrides.pop("sleeve", build_sleeve())
    casting = overrides.pop("casting", build_casting())
    motion = overrides.pop("motion", build_profile())
    values.update(overrides)
    return ShotProcess(sleeve, casting, motion, **values)


def raises(exception, callable_, *args, **kwargs):
    try:
        callable_(*args, **kwargs)
    except exception as error:
        return error
    raise AssertionError(f"{exception.__name__} not raised")
