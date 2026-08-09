import json
import os
import tempfile

import numpy as np

from common import raises
from hpdcsim import (ConfigError, MotionProfile, PlungerLaw, VacuumModel,
                     load_process, process_from_dict, register_motion_type,
                     register_vacuum_model)
from hpdcsim.config import MOTION_TYPES, VACUUM_MODEL_TYPES


def full_config():
    return {
        "sleeve": {"diameter": 0.09, "length": 0.5, "fill_fraction": 0.35,
                   "pour_hole_position": 0.12},
        "melt": {"density": 2400.0, "specific_heat": 1050.0,
                 "pouring_temperature": 680.0, "latent_heat": 440e3,
                 "liquidus": 595.0, "solidus": 540.0},
        "casting": {
            "runner": {"volume": 250e-6, "gate_area": 180e-6,
                       "surface_area": 0.030},
            "part": {"volume": 680e-6, "surface_area": 0.45},
            "overflow": {"volume": 90e-6, "surface_area": 0.008},
            "vent_area": 20e-6,
        },
        "environment": {"ambient_pressure": 101325.0,
                        "ambient_temperature": 293.15},
        "motion": {"type": "two_stage", "a1": 2.0, "v1": 0.3,
                   "a2": 15.0, "v2": 2.5},
        "vacuum": {"start_position": 0.15, "valve_area": 100e-6,
                   "model": {"type": "conductance", "pump_pressure": 8e3}},
        "thermal": {"type": "multi_surface",
                    "surfaces": {"shell": {"htc": 2000.0,
                                           "wall_temperature": 180.0},
                                 "downstream": {"htc": 4000.0,
                                                "wall_temperature": 150.0}}},
        "process": {"dosing_time": 4.0, "dwell_time": 1.5},
    }


def test_full_config_builds_working_process():
    process = process_from_dict(full_config())
    # motion law resolved against the plan
    assert abs(process.profile.end_position
               - process.fill_complete_stroke) < 1e-9
    # vacuum end resolved to fill-complete
    assert abs(process.vacuum.end_position
               - process.fill_complete_stroke) < 1e-9
    state = process.state_at_time(6.0)
    assert np.isfinite(state.air_pressure)
    assert 150.0 < state.melt_temperature <= 680.0
    # demo.json: v1=0.3 stays under the dosed-fill limit and the fast phase
    # starts only at sleeve-full -> no supercritical crossing is flagged.
    assert process.critical_velocity > 0.3
    assert process.critical_crossing() is None


def test_minimal_config():
    config = {
        "sleeve": {"diameter": 0.09, "length": 0.5, "fill_fraction": 0.35,
                   "pour_hole_position": 0.12},
        "casting": {"runner": {"volume": 250e-6}, "part": {"volume": 680e-6}},
        "motion": {"type": "two_stage", "a1": 2.0, "v1": 0.3,
                   "a2": 15.0, "v2": 2.5, "s_end": 0.4},
        "process": {"dosing_time": 4.0, "dwell_time": 1.0},
    }
    process = process_from_dict(config)
    assert process.melt is None and process.vacuum is None
    assert np.isnan(process.state_at_time(6.0).melt_temperature)


def test_json_string_and_file_loading():
    text = json.dumps(full_config())
    assert load_process(text).total_time > 0
    path = os.path.join(tempfile.gettempdir(), "hpdcsim_config.json")
    with open(path, "w") as stream:
        stream.write(text)
    assert load_process(path).total_time > 0
    os.remove(path)
    raises(ConfigError, load_process, "{not valid json")
    raises(ConfigError, load_process, 42)


def test_config_error_messages():
    config = full_config()
    config["bogus_section"] = {}
    error = raises(ConfigError, process_from_dict, config)
    assert "bogus_section" in str(error)

    config = full_config()
    del config["sleeve"]
    error = raises(ConfigError, process_from_dict, config)
    assert "sleeve" in str(error)

    config = full_config()
    config["sleeve"]["bogus_key"] = 1.0
    error = raises(ConfigError, process_from_dict, config)
    assert "bogus_key" in str(error) and "sleeve" in str(error)

    config = full_config()
    config["motion"]["type"] = "warp_drive"
    error = raises(ConfigError, process_from_dict, config)
    assert "warp_drive" in str(error) and "two_stage" in str(error)

    config = full_config()
    config["thermal"]["surfaces"]["shell"] = {"htc": 2000.0}
    error = raises(ConfigError, process_from_dict, config)
    assert "wall_temperature" in str(error)

    config = full_config()
    config["process"] = {"dosing_time": 4.0}
    error = raises(ConfigError, process_from_dict, config)
    assert "dwell_time" in str(error)


def test_every_builtin_model_type():
    for model in ({"type": "sealed"}, {"type": "ideal", "pump_pressure": 8e3},
                  {"type": "pumped", "pump_speed": 0.005}):
        config = full_config()
        config["vacuum"] = {"start_position": 0.15, "model": model}
        process = process_from_dict(config)
        assert np.isfinite(process.air_pressure_at_stroke(0.3))
    for thermal in ({"type": "constant"},
                    {"type": "lumped", "htc": 1500.0,
                     "wall_temperature": 200.0}):
        config = full_config()
        config["thermal"] = thermal
        process = process_from_dict(config)
        assert np.isfinite(process.temperature_at_time(6.0))
    config = full_config()
    config["motion"] = {"type": "profile", "positions": [0.0, 0.2, 0.4],
                        "velocities": [0.0, 0.5, 0.5]}
    assert abs(process_from_dict(config).profile.end_position - 0.4) < 1e-12


def test_registries_accept_custom_types():
    class CreepLaw(PlungerLaw):
        def __init__(self, velocity): self.velocity = velocity
        def build(self, plan):
            return MotionProfile([0.0, plan.sleeve_full_stroke],
                                 [self.velocity, self.velocity],
                                 add_origin=False)

    class FixedPressure(VacuumModel):
        def __init__(self, value): self.value = value
        def pressure_at(self, process, air): return self.value

    register_motion_type("creep", lambda data, path: CreepLaw(**data))
    register_vacuum_model("fixed", lambda data, path: FixedPressure(**data))
    try:
        config = full_config()
        config["motion"] = {"type": "creep", "velocity": 0.2}
        config["vacuum"] = {"start_position": 0.15,
                           "model": {"type": "fixed", "value": 4e3}}
        process = process_from_dict(config)
        assert abs(process.velocity_at_stroke(0.1) - 0.2) < 1e-12
        assert process.air_pressure_at_stroke(0.3) == 4e3
    finally:
        MOTION_TYPES.pop("creep", None)
        VACUUM_MODEL_TYPES.pop("fixed", None)
