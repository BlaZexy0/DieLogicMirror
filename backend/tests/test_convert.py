"""Tests für backend/convert.py — die Übersetzung Dashboard (mm, kg, mbar)
→ hpdcsim-Konfiguration (SI). Referenzwerte sind unabhängig von Hand
hergeleitet (siehe Kommentare), nicht aus der Implementierung kopiert."""
import math

from backend.convert import ConvertError, sim_config_from_browser

# Dashboard-Defaults (site/app/js/config/fields.js)
VALUES = {
    "part": 12, "runner": 3, "overflow": 2, "biscuit": 1.2, "density": 2700,
    "diam": 150, "length": 700, "gate": 1800, "vent": 800, "Tcast": 660,
}
CURVE = [[60, 0.4], [318, 0.4], [470, 4], [675, 4]]

# Herleitung: A = pi/4·0,15² = 0,0176715 m²; V_dose = 18,2 kg / 2700 kg/m³;
# phi = V_dose/(A·0,7); Pressrestlänge = (1,2/2700)/A; Füllende = L − Pressrest.
PHI = 0.5449255664710162
BISCUIT_MM = 25.150410760200746
FILL_COMPLETE_MM = 674.8495892397992


def close(got, want, rtol=1e-9):
    assert got == want or abs(got - want) <= rtol * max(1.0, abs(want)), \
        f"erwartet {want}, erhalten {got}"


def raises_convert_error(fn, fragment=""):
    try:
        fn()
    except ConvertError as e:
        assert fragment in str(e), f"'{fragment}' nicht in Fehlermeldung: {e}"
        return
    raise AssertionError("ConvertError erwartet, aber nichts geworfen")


# ── Happy Path ──────────────────────────────────────────────────

def test_config_defaults():
    config, meta = sim_config_from_browser(VALUES, CURVE)
    close(config["sleeve"]["diameter"], 0.15)
    close(config["sleeve"]["length"], 0.7)
    close(config["sleeve"]["fill_fraction"], PHI)
    close(config["sleeve"]["pour_hole_position"], 0.2 * 0.7)
    close(config["melt"]["density"], 2700.0)
    close(config["melt"]["pouring_temperature"], 660.0)
    close(config["casting"]["runner"]["volume"], 3 / 2700)
    close(config["casting"]["runner"]["gate_area"], 1800e-6)
    close(config["casting"]["part"]["volume"], 12 / 2700)
    close(config["casting"]["overflow"]["volume"], 2 / 2700)
    close(config["casting"]["vent_area"], 800e-6)
    assert config["process"]["critical_velocity_model"] == "cfd_table"
    close(meta["phi"], PHI)
    close(meta["biscuit_mm"], BISCUIT_MM)
    close(meta["fill_complete_mm"], FILL_COMPLETE_MM)


def test_curve_origin_and_units():
    config, _ = sim_config_from_browser(VALUES, CURVE)
    pos, vel = config["motion"]["positions"], config["motion"]["velocities"]
    # Ursprung wird ergänzt, Wege mm → m
    assert pos[0] == 0.0 and vel[0] == 0.0
    close(pos[1], 0.060)
    close(vel[1], 0.4)


def test_curve_clamped_at_fill_complete():
    # Kurvenende 675 mm liegt hinter dem Füllende (674,85 mm) → gekappt.
    config, meta = sim_config_from_browser(VALUES, CURVE)
    assert meta["curve_clamped"] is True
    close(config["motion"]["positions"][-1], FILL_COMPLETE_MM / 1000 - 1e-6, rtol=1e-12)
    # Kappunkt liegt im konstanten 4-m/s-Segment → Geschwindigkeit bleibt 4.
    close(config["motion"]["velocities"][-1], 4.0)


def test_curve_not_clamped():
    curve = [[60, 0.4], [318, 0.4], [470, 4], [670, 4]]
    config, meta = sim_config_from_browser(VALUES, curve)
    assert meta["curve_clamped"] is False
    close(config["motion"]["positions"][-1], 0.670)


def test_clamp_interpolates_velocity():
    # Kappunkt fällt in eine Rampe: v am Kappunkt linear interpoliert.
    values = dict(VALUES)
    curve = [[600, 1], [700, 3]]  # Rampe 1 → 3 m/s zwischen 600 und 700 mm
    config, meta = sim_config_from_browser(values, curve)
    assert meta["curve_clamped"] is True
    cut = FILL_COMPLETE_MM / 1000 - 1e-6
    f = (cut - 0.600) / 0.100
    close(config["motion"]["velocities"][-1], 1 + f * 2, rtol=1e-9)


def test_vent_zero_omitted():
    values = dict(VALUES, vent=0)
    config, _ = sim_config_from_browser(values, CURVE)
    assert "vent_area" not in config["casting"]


# ── Eingabefehler ───────────────────────────────────────────────

def test_missing_key():
    values = dict(VALUES)
    del values["gate"]
    raises_convert_error(lambda: sim_config_from_browser(values, CURVE), "gate")


def test_non_numeric_value():
    raises_convert_error(
        lambda: sim_config_from_browser(dict(VALUES, part="zwölf"), CURVE), "part")


def test_non_finite_value():
    raises_convert_error(
        lambda: sim_config_from_browser(dict(VALUES, diam=math.inf), CURVE), "diam")


def test_overfilled_chamber():
    raises_convert_error(
        lambda: sim_config_from_browser(dict(VALUES, part=200), CURVE), "Füllgrad")


def test_biscuit_required():
    raises_convert_error(
        lambda: sim_config_from_browser(dict(VALUES, biscuit=0), CURVE), "Pressrest")


def test_curve_negative_velocity():
    raises_convert_error(
        lambda: sim_config_from_browser(VALUES, [[60, -1], [300, 2]]), "≥ 0")


def test_curve_not_increasing():
    raises_convert_error(
        lambda: sim_config_from_browser(VALUES, [[300, 1], [200, 2]]), "steigen")


def test_curve_no_valid_points():
    raises_convert_error(
        lambda: sim_config_from_browser(VALUES, [[math.nan, math.nan]]), "keine gültigen")


def test_curve_entirely_beyond_fill_complete_clamps_from_origin():
    # Alle Punkte hinter dem Füllende: der ergänzte Ursprung bleibt, der Rest
    # wird auf den Kappunkt interpoliert (Rampe 0 → 1 m/s über 690 mm).
    config, meta = sim_config_from_browser(VALUES, [[690, 1], [700, 2]])
    assert meta["curve_clamped"] is True
    pos, vel = config["motion"]["positions"], config["motion"]["velocities"]
    assert len(pos) == 2
    cut = FILL_COMPLETE_MM / 1000 - 1e-6
    close(pos[-1], cut, rtol=1e-12)
    close(vel[-1], cut / 0.690, rtol=1e-9)


# ── Vakuum ──────────────────────────────────────────────────────

def test_vacuum_off_variants():
    for model in ("", "aus", "none", "sealed"):
        config, _ = sim_config_from_browser(VALUES, CURVE, vacuum={"model": model})
        assert "vacuum" not in config


def test_vacuum_ideal_si_units():
    vac = {"model": "ideal", "pump_mbar": 80, "valve_mm2": 100, "start_mm": 150}
    config, _ = sim_config_from_browser(VALUES, CURVE, vacuum=vac)
    v = config["vacuum"]
    close(v["start_position"], 0.150)          # mm → m
    close(v["valve_area"], 100e-6)             # mm² → m²
    close(v["model"]["pump_pressure"], 8000.0)  # mbar → Pa
    assert v["model"]["type"] == "ideal"


def test_vacuum_unknown_model():
    raises_convert_error(lambda: sim_config_from_browser(
        VALUES, CURVE, vacuum={"model": "turbo"}), "unbekannt")


def test_vacuum_start_behind_fill_complete():
    vac = {"model": "ideal", "pump_mbar": 80, "valve_mm2": 100, "start_mm": 680}
    raises_convert_error(
        lambda: sim_config_from_browser(VALUES, CURVE, vacuum=vac), "Vakuum-Start")


def test_vacuum_pump_positive():
    vac = {"model": "ideal", "pump_mbar": 0, "valve_mm2": 100, "start_mm": 150}
    raises_convert_error(
        lambda: sim_config_from_browser(VALUES, CURVE, vacuum=vac), "Enddruck")


# ── Prozess-Overrides ───────────────────────────────────────────

def test_process_override():
    config, _ = sim_config_from_browser(
        VALUES, CURVE, process={"critical_velocity_model": "garber_lopez"})
    assert config["process"]["critical_velocity_model"] == "garber_lopez"
    close(config["process"]["dosing_time"], 4.0)  # Defaults bleiben erhalten
