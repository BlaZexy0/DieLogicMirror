"""Load a complete shot process from JSON and query it.

Run from the package root: python3 examples/run_from_json.py [config.json]
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from hpdcsim import load_process


def main():
    config = sys.argv[1] if len(sys.argv) > 1 else \
        Path(__file__).with_name("demo.json")
    process = load_process(config)

    plan = process.plan
    print(f"biscuit {plan.biscuit_length*1000:.1f} mm, "
          f"fill complete at {plan.fill_complete_stroke*1000:.1f} mm, "
          f"total cycle {process.total_time:.2f} s\n")

    print("events:")
    for event in process.events().values():
        print(f"  {event.name:17s} t={event.time:7.3f} s  "
              f"s={event.stroke*1000:6.1f} mm")

    crossing = process.critical_crossing()
    if crossing is not None:
        print(f"\ncritical crossing at {crossing.stroke_mm:.1f} mm "
              f"(t={crossing.time:.3f} s, v={crossing.plunger_velocity:.3f} m/s)")

    print("\n  t_s   phase     s_mm   v_m/s  fill s/r/p/o         "
          "p_air_kPa  T_melt  Q_gate_cm3/s")
    for t in [0.0, 2.0, 4.0, 5.0] + [process.shot_start_time + f*process.profile.end_time
                                     for f in (0.2, 0.5, 0.8, 0.95, 0.99)]:
        x = process.state_at_time(t)
        print(f"  {x.time:5.2f}  {x.phase.value:8s}{x.stroke_mm:6.1f}  "
              f"{x.plunger_velocity:5.2f}  "
              f"{x.sleeve_fill:.2f}/{x.runner_fill:.2f}/"
              f"{x.part_fill:.2f}/{x.overflow_fill:.2f}   "
              f"{x.air_pressure/1000:9.1f}  {x.melt_temperature:6.1f}  "
              f"{x.gate_flow_rate*1e6:10.1f}")

    out = Path(__file__).with_name("shot_result.csv")
    process.export_csv(out, count=500)
    print(f"\nfull timeline exported to {out}")


if __name__ == "__main__":
    main()
