"""Physik-Fixtures (fixtures/physics/*.json) gegen den Backend-Pfad
convert.py → hpdcsim: dieselben Dateien prüft site/tests/
physics-fixtures.test.mjs gegen die Dashboard-Physik (physics.js) —
weicht eine Seite von den Sollwerten ab, ist die Physik auseinandergelaufen."""
import json
import math
from pathlib import Path

from hpdcsim import load_process

from backend.convert import sim_config_from_browser

FIXTURES = Path(__file__).resolve().parents[2] / "fixtures" / "physics"


def _quantities(proc):
    plan, prof = proc.plan, proc.profile
    s_fill = plan.sleeve_full_stroke
    slow = [v for s, v in zip(prof.positions, prof.velocities) if s <= s_fill]
    # Beim Kappen endet das Profil 1 µm vor dem Füllende — dort auswerten.
    fill_end = min(plan.fill_complete_stroke, prof.end_position)
    return {
        "phi": proc.sleeve.fill_fraction,
        "s_fill_mm": s_fill * 1000,
        "biscuit_mm": plan.biscuit_length * 1000,
        "fill_complete_mm": plan.fill_complete_stroke * 1000,
        "v_crit": proc.critical_velocity,
        "v_slow_max": max(slow + [prof.velocity_at_position(s_fill)]),
        "t_sleeve_full_s": prof.time_at_position(s_fill),
        "v_sleeve_full": prof.velocity_at_position(s_fill),
        "t_part_full_s": prof.time_at_position(plan.part_full_stroke),
        "gate_v_part_full": proc.state_at_stroke(plan.part_full_stroke).gate_velocity,
        "fill_time_ms": (prof.time_at_position(fill_end)
                         - prof.time_at_position(plan.runner_full_stroke)) * 1000,
    }


def test_physics_fixtures():
    files = sorted(FIXTURES.glob("*.json"))
    assert files, f"keine Fixtures in {FIXTURES} gefunden"
    for file in files:
        fx = json.loads(file.read_text(encoding="utf-8"))
        config, _ = sim_config_from_browser(fx["inputs"]["values"],
                                            fx["inputs"]["curve"])
        got = _quantities(load_process(config))
        for key, exp in fx["expected"].items():
            assert key in got, f"{fx['name']}: unbekannte Fixture-Größe '{key}'"
            g = got[key]
            assert math.isfinite(g), f"{fx['name']}/{key}: kein endlicher Wert ({g})"
            tol = exp["rtol"] * max(1.0, abs(exp["value"]))
            assert abs(g - exp["value"]) <= tol, (
                f"{fx['name']}/{key}: erwartet {exp['value']}, "
                f"erhalten {g} (rtol {exp['rtol']})")
