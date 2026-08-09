"""hpdcsim — quasi-static HPDC shot simulation.

Dosing, dwell and shot of a cold-chamber die casting machine with pluggable
motion laws, vacuum models and thermal models. SI units only. Build processes
in code or from JSON via load_process().
"""
from .components import (CastingSystem, Environment, Melt, Overflow, Part,
                         Runner, ShotSleeve, VacuumSystem)
from .config import (ConfigError, load_process, process_from_dict,
                     register_motion_type, register_thermal_model,
                     register_vacuum_model)
from .geometry import (GRAVITY, CircularSection, area_fraction_from_height,
                       circular_section, height_from_fill_fraction)
from .laws import PlungerLaw, ShotPlan, TwoStageLaw, VelocityFunctionLaw
from .motion import MotionProfile, MotionSample
from .process import Event, Phase, ProcessState, ShotProcess
from .thermal import (ConstantTemperature, LumpedCapacitance,
                      MultiSurfaceLumped, ThermalModel)
from .vacuum import (ATMOSPHERE, AirState, ConductanceVacuum, IdealVacuum,
                     NoVacuum, PumpedVacuum, VacuumModel, orifice_mass_flow)

__version__ = "0.1.0"

__all__ = [
    "ATMOSPHERE", "AirState", "CastingSystem", "CircularSection",
    "ConductanceVacuum", "ConfigError", "ConstantTemperature", "Environment",
    "Event", "GRAVITY", "IdealVacuum", "LumpedCapacitance", "Melt",
    "MotionProfile", "MotionSample", "MultiSurfaceLumped", "NoVacuum",
    "Overflow", "Part", "Phase", "PlungerLaw", "ProcessState", "PumpedVacuum",
    "Runner", "ShotPlan", "ShotProcess", "ShotSleeve", "ThermalModel",
    "TwoStageLaw", "VacuumModel", "VacuumSystem", "VelocityFunctionLaw",
    "area_fraction_from_height", "circular_section",
    "height_from_fill_fraction", "load_process", "orifice_mass_flow",
    "process_from_dict", "register_motion_type", "register_thermal_model",
    "register_vacuum_model",
]
