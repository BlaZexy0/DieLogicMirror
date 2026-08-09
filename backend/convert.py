"""Übersetzt Dashboard-Eingaben (Browser-Einheiten: mm, kg, °C) in die
hpdcsim-JSON-Konfiguration (SI). Bewusst ohne FastAPI/Pydantic-Import,
damit die Logik ohne installierte Web-Abhängigkeiten testbar bleibt.

Konventionen wie im Dashboard (app/js/core/physics.js):
Dosiervolumen = (Bauteil + Anguss + Überlauf + Pressrest) / Dichte,
Füllgrad φ = V_dose / (A·L). Die Schusskurve kommt als [s_mm, v_m_s]-Punkte;
hpdcsim verlangt, dass das Profil nicht über den Füllende-Hub
(L − Pressrestlänge) hinausfährt — die Kurve wird deshalb dort gekappt.
"""

import math

REQUIRED_KEYS = ("part", "runner", "overflow", "biscuit", "density",
                 "diam", "length", "gate")

DEFAULT_PROCESS = {"dosing_time": 4.0, "dwell_time": 1.0}
DEFAULT_SPECIFIC_HEAT = 1050.0     # J/(kg K) — wie hpdcsim examples/demo.json
DEFAULT_POUR_TEMP = 680.0          # °C, falls Tcast fehlt
POUR_HOLE_POSITION_FRACTION = 0.2  # Eingusslage: 20 % der Kammerlänge
CLAMP_MARGIN = 1e-6                # m, Abstand zum Füllende-Hub beim Kappen


class ConvertError(ValueError):
    """Fachlicher Fehler in den Eingaben (wird als 422 an den Browser gereicht)."""


def _num(values, key):
    try:
        x = float(values[key])
    except (KeyError, TypeError, ValueError):
        raise ConvertError(f"Eingabe '{key}' fehlt oder ist keine Zahl.")
    if not math.isfinite(x):
        raise ConvertError(f"Eingabe '{key}' ist nicht endlich.")
    return x


def _clamped_curve(curve, limit):
    """Kurvenpunkte [s_m, v] aufsteigend, Ursprung ergänzt, bei `limit` gekappt
    (Geschwindigkeit am Kappunkt linear interpoliert)."""
    pts = []
    for p in curve:
        try:
            s, v = float(p[0]) / 1000.0, float(p[1])
        except (TypeError, ValueError, IndexError):
            raise ConvertError("Schusskurve: Punkte müssen [s_mm, v_m_s]-Paare sein.")
        if not (math.isfinite(s) and math.isfinite(v)):
            continue
        if v < 0:
            raise ConvertError("Schusskurve: Geschwindigkeiten müssen ≥ 0 sein.")
        pts.append((s, v))
    if not pts:
        raise ConvertError("Schusskurve: keine gültigen Punkte.")
    if pts[0][0] < 0:
        raise ConvertError("Schusskurve: Wege müssen ≥ 0 sein.")
    for a, b in zip(pts, pts[1:]):
        if b[0] <= a[0]:
            raise ConvertError("Schusskurve: Wege müssen streng steigen.")
    if pts[0][0] > 0:
        pts.insert(0, (0.0, 0.0))

    cut = limit - CLAMP_MARGIN
    if pts[0][0] >= cut:
        raise ConvertError("Schusskurve beginnt hinter dem Füllende-Hub.")
    clamped = False
    out = [pts[0]]
    for prev, p in zip(pts, pts[1:]):
        if p[0] <= cut:
            out.append(p)
            continue
        # linear interpolierte Geschwindigkeit am Kappunkt
        f = (cut - prev[0]) / (p[0] - prev[0])
        out.append((cut, prev[1] + f * (p[1] - prev[1])))
        clamped = True
        break
    if len(out) < 2:
        raise ConvertError("Schusskurve: zu wenige Punkte vor dem Füllende-Hub.")
    return out, clamped


def sim_config_from_browser(values, curve, process=None, vacuum=None):
    """(values, curve) aus dem Dashboard → (hpdcsim-Konfig-Dict, Meta-Dict)."""
    for key in REQUIRED_KEYS:
        _num(values, key)

    rho = _num(values, "density")
    if rho <= 0:
        raise ConvertError("Dichte muss > 0 sein.")
    D = _num(values, "diam") / 1000.0
    L = _num(values, "length") / 1000.0
    if D <= 0 or L <= 0:
        raise ConvertError("Kolben-Ø und Kammerlänge müssen > 0 sein.")
    A = 0.25 * math.pi * D * D

    Vr = _num(values, "runner") / rho
    Vp = _num(values, "part") / rho
    Vo = _num(values, "overflow") / rho
    Vb = _num(values, "biscuit") / rho
    if Vb <= 0:
        raise ConvertError("Pressrestgewicht muss > 0 sein (hpdcsim braucht einen Pressrest).")
    Vdose = Vr + Vp + Vo + Vb
    phi = Vdose / (A * L)
    if phi >= 1:
        raise ConvertError(
            f"Dosiervolumen ({Vdose * 1e6:.0f} cm³) übersteigt das Kammervolumen — Füllgrad ≥ 100 %.")
    if phi <= 0:
        raise ConvertError("Dosiervolumen ist null.")

    biscuit_len = Vb / A
    fill_complete = L - biscuit_len
    positions_velocities, clamped = _clamped_curve(curve, fill_complete)

    gate_area = _num(values, "gate") / 1e6
    if gate_area <= 0:
        raise ConvertError("Anschnittfläche muss > 0 sein.")
    vent = float(values.get("vent", 0) or 0) / 1e6

    config = {
        "sleeve": {
            "diameter": D,
            "length": L,
            "fill_fraction": phi,
            "pour_hole_position": POUR_HOLE_POSITION_FRACTION * L,
        },
        "melt": {
            "density": rho,
            "specific_heat": DEFAULT_SPECIFIC_HEAT,
            "pouring_temperature": float(values.get("Tcast", DEFAULT_POUR_TEMP)),
        },
        "casting": {
            "runner": {"volume": Vr, "gate_area": gate_area},
            "part": {"volume": Vp},
            "overflow": {"volume": Vo},
        },
        "motion": {
            "type": "profile",
            "positions": [p[0] for p in positions_velocities],
            "velocities": [p[1] for p in positions_velocities],
        },
        "process": {**DEFAULT_PROCESS, **(process or {})},
    }
    if vent > 0:
        config["casting"]["vent_area"] = vent
    if vacuum:
        config["vacuum"] = vacuum  # SI, hpdcsim-Schema — 1:1 durchgereicht

    meta = {
        "phi": phi,
        "fill_complete_mm": fill_complete * 1000.0,
        "biscuit_mm": biscuit_len * 1000.0,
        "curve_clamped": clamped,
    }
    return config, meta
