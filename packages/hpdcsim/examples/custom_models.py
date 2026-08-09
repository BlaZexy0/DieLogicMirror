"""Extend hpdcsim with custom models and use them from JSON.

Demonstrates the three extension seams: a PlungerLaw (Lopez-style slow shot
at a fraction of the critical velocity), a VacuumModel, and registering both
so a plain JSON/dict config can refer to them by name.

Run from the package root: python3 examples/custom_models.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from hpdcsim import (MotionProfile, PlungerLaw, VacuumModel, load_process,
                     register_motion_type, register_vacuum_model)


class FractionOfCriticalLaw(PlungerLaw):
    """Slow shot held at a fraction of the instantaneous critical velocity,
    ending at the sleeve-full stroke."""

    def __init__(self, fraction=0.8, floor=0.05):
        self.fraction, self.floor = float(fraction), float(floor)

    def build(self, plan):
        def velocity(stroke):
            section = plan.sleeve.section(plan.fill_at_stroke(stroke))
            return max(self.floor, self.fraction*section.critical_velocity)
        return MotionProfile.from_velocity_law(
            velocity, plan.sleeve_full_stroke)


class LeakyVacuum(VacuumModel):
    """Ideal pump with a constant leak: pressure settles at pump + leak
    offset while active (toy model to show the closed-form seam)."""

    def __init__(self, pump_pressure, leak_offset=2e3):
        self.pump_pressure = float(pump_pressure)
        self.leak_offset = float(leak_offset)

    def pressure_at(self, process, air):
        ambient = process.environment.ambient_pressure
        if air.vacuum_active:
            return self.pump_pressure + self.leak_offset
        return ambient  # simplification: everything else at ambient


register_motion_type(
    "fraction_of_critical",
    lambda data, path: FractionOfCriticalLaw(**data))
register_vacuum_model(
    "leaky", lambda data, path: LeakyVacuum(**data))


def main():
    config = {
        "sleeve": {"diameter": 0.09, "length": 0.5, "fill_fraction": 0.35,
                   "pour_hole_position": 0.12},
        "casting": {"runner": {"volume": 250e-6},
                    "part": {"volume": 680e-6},
                    "overflow": {"volume": 90e-6}},
        "motion": {"type": "fraction_of_critical", "fraction": 0.8},
        "vacuum": {"start_position": 0.15,
                   "model": {"type": "leaky", "pump_pressure": 8e3}},
        "process": {"dosing_time": 4.0, "dwell_time": 1.5},
    }
    process = load_process(config)
    print(f"slow shot takes {process.profile.end_time:.2f} s over "
          f"{process.profile.end_position*1000:.1f} mm")
    margins = [process.state_at_stroke(s).velocity_margin
               for s in np.linspace(0.0, 0.3, 40)]
    print(f"minimum velocity margin over the first 300 mm: "
          f"{min(margins):.3f} m/s")
    print(f"air pressure while valve active: "
          f"{process.air_pressure_at_stroke(0.3)/1e3:.1f} kPa (pump 8.0 + leak 2.0)")


if __name__ == "__main__":
    main()
