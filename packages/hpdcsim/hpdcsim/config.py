"""Build a whole ShotProcess from JSON or a plain dict. SI units only.

Top-level sections: sleeve (required), casting (required), process
(required: dosing_time, dwell_time), motion (required), melt, environment,
vacuum, thermal (all optional). Model sections carry a "type" key resolved
through a registry; register custom implementations with
register_motion_type / register_vacuum_model / register_thermal_model.
"""
import json
from dataclasses import fields as dataclass_fields
from pathlib import Path

from .components import (CastingSystem, Environment, Melt, Overflow, Part,
                         Runner, ShotSleeve, VacuumSystem)
from .laws import TwoStageLaw
from .motion import MotionProfile
from .process import ShotProcess
from .thermal import ConstantTemperature, LumpedCapacitance, MultiSurfaceLumped
from .vacuum import (ConductanceVacuum, IdealVacuum, NoVacuum, PumpedVacuum,
                     TankVacuum, VentChannel)


class ConfigError(ValueError):
    pass


def _expect_dict(data, path):
    if not isinstance(data, dict):
        raise ConfigError(f"{path}: expected an object, got "
                          f"{type(data).__name__}.")
    return data


def _build_dataclass(cls, data, path):
    _expect_dict(data, path)
    allowed = {f.name for f in dataclass_fields(cls)}
    unknown = set(data) - allowed
    if unknown:
        raise ConfigError(f"{path}: unknown keys {sorted(unknown)}; "
                          f"allowed: {sorted(allowed)}.")
    try:
        return cls(**data)
    except (TypeError, ValueError) as error:
        raise ConfigError(f"{path}: {error}") from error


def _call_factory(cls, data, path):
    try:
        return cls(**data)
    except (TypeError, ValueError) as error:
        raise ConfigError(f"{path}: {error}") from error


def _resolve_type(data, path, registry, kind):
    _expect_dict(data, path)
    if "type" not in data:
        raise ConfigError(f"{path}: needs a 'type' key; available {kind} "
                          f"types: {sorted(registry)}.")
    data = dict(data)
    name = data.pop("type")
    if name not in registry:
        raise ConfigError(f"{path}: unknown {kind} type '{name}'; "
                          f"available: {sorted(registry)}.")
    return registry[name](data, path)


# --- motion ---
def _motion_two_stage(data, path):
    return _build_dataclass(TwoStageLaw, data, path)


def _motion_profile(data, path):
    _expect_dict(data, path)
    missing = {"positions", "velocities"} - set(data)
    if missing:
        raise ConfigError(f"{path}: profile motion needs {sorted(missing)}.")
    unknown = set(data) - {"positions", "velocities"}
    if unknown:
        raise ConfigError(f"{path}: unknown keys {sorted(unknown)}.")
    try:
        return MotionProfile(data["positions"], data["velocities"])
    except ValueError as error:
        raise ConfigError(f"{path}: {error}") from error


MOTION_TYPES = {"two_stage": _motion_two_stage, "profile": _motion_profile}


def register_motion_type(name, factory):
    """factory(data: dict, path: str) -> MotionProfile | PlungerLaw"""
    MOTION_TYPES[str(name)] = factory


# --- vacuum models ---
VACUUM_MODEL_TYPES = {
    "sealed": lambda data, path: _call_factory(NoVacuum, data, path),
    "ideal": lambda data, path: _call_factory(IdealVacuum, data, path),
    "pumped": lambda data, path: _call_factory(PumpedVacuum, data, path),
    "conductance": lambda data, path: _call_factory(ConductanceVacuum, data, path),
    "tank": lambda data, path: _call_factory(TankVacuum, data, path),
}


def _with_channel(data, key, path):
    """Replace a nested vent-channel object (gap, length, ...) by its
    VentChannel; None stays None."""
    data = dict(data)
    if data.get(key) is not None:
        data[key] = _build_dataclass(VentChannel, data[key], f"{path}.{key}")
    return data


def register_vacuum_model(name, factory):
    """factory(data: dict, path: str) -> VacuumModel"""
    VACUUM_MODEL_TYPES[str(name)] = factory


# --- thermal models ---
def _thermal_multi_surface(data, path):
    _expect_dict(data, path)
    data = dict(data)
    raw = data.pop("surfaces", None)
    if not isinstance(raw, dict) or not raw:
        raise ConfigError(f"{path}: multi_surface needs a non-empty "
                          "'surfaces' object.")
    surfaces = {}
    for name, spec in raw.items():
        if (not isinstance(spec, dict)
                or {"htc", "wall_temperature"} - set(spec)):
            raise ConfigError(f"{path}.surfaces.{name}: needs 'htc' and "
                              "'wall_temperature'.")
        unknown = set(spec) - {"htc", "wall_temperature"}
        if unknown:
            raise ConfigError(f"{path}.surfaces.{name}: unknown keys "
                              f"{sorted(unknown)}.")
        surfaces[name] = (spec["htc"], spec["wall_temperature"])
    try:
        return MultiSurfaceLumped(surfaces, **data)
    except (TypeError, ValueError) as error:
        raise ConfigError(f"{path}: {error}") from error


THERMAL_TYPES = {
    "constant": lambda data, path: _call_factory(ConstantTemperature, data, path),
    "lumped": lambda data, path: _call_factory(LumpedCapacitance, data, path),
    "multi_surface": _thermal_multi_surface,
}


def register_thermal_model(name, factory):
    """factory(data: dict, path: str) -> ThermalModel"""
    THERMAL_TYPES[str(name)] = factory


# --- top level ---
_TOP_LEVEL = {"sleeve", "casting", "melt", "environment", "motion", "vacuum",
              "thermal", "process"}
_REQUIRED = {"sleeve", "casting", "motion", "process"}


def process_from_dict(config) -> ShotProcess:
    """Build a ShotProcess from a plain configuration dict (see demo.json)."""
    _expect_dict(config, "config")
    unknown = set(config) - _TOP_LEVEL
    if unknown:
        raise ConfigError(f"config: unknown sections {sorted(unknown)}; "
                          f"allowed: {sorted(_TOP_LEVEL)}.")
    missing = _REQUIRED - set(config)
    if missing:
        raise ConfigError(f"config: missing required sections "
                          f"{sorted(missing)}.")

    sleeve = _build_dataclass(ShotSleeve, config["sleeve"], "sleeve")

    casting_data = dict(_expect_dict(config["casting"], "casting"))
    unknown = set(casting_data) - {"runner", "part", "overflow", "vent_area",
                                   "vent_channel"}
    if unknown:
        raise ConfigError(f"casting: unknown keys {sorted(unknown)}.")
    if {"runner", "part"} - set(casting_data):
        raise ConfigError("casting: needs 'runner' and 'part'.")
    runner = _build_dataclass(Runner, casting_data["runner"], "casting.runner")
    part = _build_dataclass(Part, casting_data["part"], "casting.part")
    overflow = (_build_dataclass(Overflow, casting_data["overflow"],
                                 "casting.overflow")
                if "overflow" in casting_data else Overflow(0.0))
    casting = _call_factory(
        CastingSystem,
        _with_channel({"runner": runner, "part": part, "overflow": overflow,
                       "vent_area": casting_data.get("vent_area"),
                       "vent_channel": casting_data.get("vent_channel")},
                      "vent_channel", "casting"), "casting")

    melt = (_build_dataclass(Melt, config["melt"], "melt")
            if "melt" in config else None)
    environment = (_build_dataclass(Environment, config["environment"],
                                    "environment")
                   if "environment" in config else None)

    motion = _resolve_type(config["motion"], "motion", MOTION_TYPES, "motion")

    vacuum = None
    if "vacuum" in config:
        vacuum_data = dict(_expect_dict(config["vacuum"], "vacuum"))
        if "model" not in vacuum_data:
            raise ConfigError("vacuum: needs a 'model' object.")
        model = _resolve_type(vacuum_data.pop("model"), "vacuum.model",
                              VACUUM_MODEL_TYPES, "vacuum model")
        vacuum_data["model"] = model
        vacuum = _build_dataclass(
            VacuumSystem, _with_channel(vacuum_data, "valve_channel", "vacuum"),
            "vacuum")

    thermal = (_resolve_type(config["thermal"], "thermal", THERMAL_TYPES,
                             "thermal model")
               if "thermal" in config else None)

    process_data = dict(_expect_dict(config["process"], "process"))
    unknown = set(process_data) - {"dosing_time", "dwell_time",
                                   "critical_velocity_model"}
    if unknown:
        raise ConfigError(f"process: unknown keys {sorted(unknown)}.")
    if {"dosing_time", "dwell_time"} - set(process_data):
        raise ConfigError("process: needs 'dosing_time' and 'dwell_time'.")

    try:
        return ShotProcess(sleeve, casting, motion,
                           dosing_time=process_data["dosing_time"],
                           dwell_time=process_data["dwell_time"],
                           melt=melt, vacuum=vacuum, thermal=thermal,
                           environment=environment,
                           critical_velocity_model=process_data.get(
                               "critical_velocity_model", "garber_lopez"))
    except ValueError as error:
        raise ConfigError(f"process: {error}") from error


def load_process(source) -> ShotProcess:
    """Build a ShotProcess from a dict, a JSON string, or a JSON file path."""
    if isinstance(source, dict):
        return process_from_dict(source)
    if isinstance(source, Path):
        return process_from_dict(json.loads(source.read_text()))
    if isinstance(source, str):
        text = source if source.lstrip().startswith("{") else \
            Path(source).read_text()
        try:
            return process_from_dict(json.loads(text))
        except json.JSONDecodeError as error:
            raise ConfigError(f"invalid JSON: {error}") from error
    raise ConfigError("load_process takes a dict, JSON string, or file path.")
