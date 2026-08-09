"""Build a shot process in code (no JSON) and query it.

Run from the package root: python3 examples/basic_usage.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import numpy as np

from hpdcsim import (CastingSystem, IdealVacuum, Melt, MultiSurfaceLumped,
                     Overflow, Part, Runner, ShotProcess, ShotSleeve,
                     TwoStageLaw, VacuumSystem)


def main():
    sleeve = ShotSleeve(diameter=0.09, length=0.5, fill_fraction=0.35,
                        pour_hole_position=0.12)
    casting = CastingSystem(
        runner=Runner(volume=250e-6, gate_area=180e-6, surface_area=0.030),
        part=Part(volume=680e-6, surface_area=0.45),
        overflow=Overflow(volume=90e-6, surface_area=0.008),
    )
    melt = Melt(density=2400.0, specific_heat=1050.0,
                pouring_temperature=680.0)
    process = ShotProcess(
        sleeve, casting,
        TwoStageLaw(a1=2.0, v1=0.3, a2=15.0, v2=2.5),  # strokes from volumes
        dosing_time=4.0, dwell_time=1.5, melt=melt,
        vacuum=VacuumSystem(start_position=0.15, model=IdealVacuum(8e3)),
        thermal=MultiSurfaceLumped({"shell": (2000.0, 180.0),
                                    "downstream": (4000.0, 150.0)}),
    )

    x = process.state_at_time(process.time_of("runner_full"))
    print(f"at runner_full: stroke {x.stroke_mm:.1f} mm, "
          f"v = {x.plunger_velocity:.2f} m/s, "
          f"melt {x.melt_temperature:.1f} deg, "
          f"air {x.air_pressure/1e3:.1f} kPa")

    crossing = process.critical_crossing()
    print(f"critical crossing at {crossing.stroke_mm:.1f} mm "
          f"({crossing.plunger_velocity:.3f} m/s)")

    data = process.arrays(count=300, spacing="distance")
    supercritical = data["stroke"][data["velocity_margin"] < 0.0]
    print(f"supercritical from {supercritical[0]*1000:.0f} mm to "
          f"{supercritical[-1]*1000:.0f} mm of the stroke")
    print(f"peak gate velocity {np.nanmax(data['gate_velocity']):.1f} m/s")


if __name__ == "__main__":
    main()
