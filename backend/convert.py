"""Übersetzt Dashboard-Eingaben (Browser-Einheiten: mm, kg, °C) in die
hpdcsim-JSON-Konfiguration (SI). Bewusst ohne FastAPI/Pydantic-Import,
damit die Logik ohne installierte Web-Abhängigkeiten testbar bleibt.

Konventionen wie im Dashboard (web/tools/auslegung/js/core/physics.js):
Dosiervolumen = (Bauteil + Anguss + Überlauf + Pressrest) / Dichte,
Füllgrad φ = V_dose / (A·L). Die Schusskurve kommt als [s_mm, v_m_s]-Punkte;
hpdcsim verlangt, dass das Profil nicht über den Füllende-Hub
(L − Pressrestlänge) hinausfährt — die Kurve wird deshalb dort gekappt.
Die Einfüllöffnung schließt beim Hub values.sealStroke (Dashboard-Feld
„Einfüllöffnung verschlossen"); fehlt er, gilt 20 % der Kammerlänge.
"""

import math

REQUIRED_KEYS = ("part", "runner", "overflow", "biscuit", "density",
                 "diam", "length", "gate")

DEFAULT_PROCESS = {
    "dosing_time": 4.0,
    "dwell_time": 1.0,
    # Wie das Dashboard (js/core/physics.js): OpenFOAM-CFD-Tabelle am
    # dosierten Füllgrad. Über den process-Block des Requests umstellbar
    # (z. B. "segment_fit", "nogowizin" oder "garber_lopez").
    "critical_velocity_model": "cfd_table",
}
# Fällt zurück, wenn das Projekt keine Legierungs-Thermik mitschickt.
DEFAULT_SPECIFIC_HEAT = 1050.0     # J/(kg K) — wie hpdcsim examples/demo.json
DEFAULT_POUR_TEMP = 680.0          # °C, falls Tcast fehlt
POUR_HOLE_POSITION_FRACTION = 0.2  # Eingusslage: 20 % der Kammerlänge, falls sealStroke fehlt
CLAMP_MARGIN = 1e-6                # m, Abstand zum Füllende-Hub beim Kappen


class ConvertError(ValueError):
    """Fachlicher Fehler in den Eingaben (wird als 422 an den Browser gereicht)."""


def _melt_config(values, rho):
    """Legierungsdaten des Projekts statt eines festen Wertes.

    Das Dashboard schickt die vollständige Thermik des Legierungs-Presets mit
    (cpL, cp bei Solidus, Erstarrungswärme, Liquidus, Solidus) — sie wurden
    hier bisher verworfen und durch 1050 J/(kg·K) ersetzt, für JEDE Legierung.
    Über die fünf mitgelieferten Presets liegt zwischen dem kleinsten und dem
    größten Wert Faktor 2,2; die Schmelztemperaturkurve war damit für alles
    außer Aluminium schlicht falsch.

    In der Gießkammer ist die Schmelze flüssig — maßgeblich ist deshalb die
    Wärmekapazität bei Liquidus. Erstarrungswärme, Liquidus und Solidus gehen
    mit, damit das Wärmemodell die Erstarrungszone kennt (thermal.py).
    """
    melt = {
        "density": rho,
        "specific_heat": _num_opt(values, "cpL", DEFAULT_SPECIFIC_HEAT),
        "pouring_temperature": _num_opt(values, "Tcast", DEFAULT_POUR_TEMP),
    }
    if melt["specific_heat"] <= 0.0:
        raise ConvertError("Wärmekapazität der Legierung muss > 0 J/(kg·K) sein.")

    liq = _num_opt(values, "Tliq", 0.0)
    sol = _num_opt(values, "Tsol", 0.0)
    lat = _num_opt(values, "hf", 0.0) * 1000.0        # kJ/kg → J/kg
    if liq > 0.0 and sol > 0.0:
        if sol > liq:
            raise ConvertError(
                f"Solidus ({sol:.0f} °C) darf nicht über Liquidus ({liq:.0f} °C) liegen.")
        melt["liquidus"] = liq
        melt["solidus"] = sol
        if lat > 0.0:
            melt["latent_heat"] = lat
    return melt


def _num(values, key):
    try:
        x = float(values[key])
    except (KeyError, TypeError, ValueError):
        raise ConvertError(f"Eingabe '{key}' fehlt oder ist keine Zahl.")
    if not math.isfinite(x):
        raise ConvertError(f"Eingabe '{key}' ist nicht endlich.")
    return x


def solidus_density(values):
    """Dichte der Kavität: das Werkzeug ist um das lineare Schwindmaß s
    größer als das kalte Bauteil (densitySolid) → ρ_sol = ρ_s/(1+s)³.
    Ohne Feststoffdichte (alte Projekte, direkte API-Nutzung) flüssig."""
    rho_s = _num_opt(values, "densitySolid", 0.0)
    if rho_s <= 0:
        return _num(values, "density")
    k = 1.0 + max(0.0, _num_opt(values, "shrink", 0.0)) / 100.0
    return rho_s / (k * k * k)


def _num_opt(values, key, default):
    """Optionaler Wert: fehlt der Schlüssel (oder ist er None), gilt der
    Default — ist er vorhanden, muss er eine endliche Zahl sein."""
    if key not in values or values[key] is None:
        return float(default)
    return _num(values, key)


def _clamped_curve(curve, limit):
    """Kurvenpunkte [s_m, v] aufsteigend, Ursprung ergänzt, bei `limit` gekappt
    (Geschwindigkeit am Kappunkt linear interpoliert)."""
    pts = []
    for p in curve:
        try:
            s, v = float(p[0]) / 1000.0, float(p[1])
        except (TypeError, ValueError, IndexError):
            raise ConvertError("Schusskurve: Punkte müssen [s_mm, v_m_s]-Paare sein.")
        # Nicht-endliche Punkte still überspringen — wie buildProfile()
        # in web/tools/auslegung/js/core/physics.js (leere Tabellenzeilen o. ä.).
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

    # Liegt die ganze Kurve hinter dem Kappunkt, bleibt der ergänzte Ursprung
    # und der erste Punkt wird auf den Kappunkt interpoliert (getestet in
    # test_curve_entirely_beyond_fill_complete_clamps_from_origin).
    cut = limit - CLAMP_MARGIN
    if cut <= 0:
        raise ConvertError(
            "Füllende-Hub ist null — das Pressrestvolumen lässt keinen Kolbenweg zu.")
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


ALLOWED_VACUUM_MODELS = ("ideal", "conductance")


def _vacuum_config(vac, fill_complete, travel):
    """Vakuum-Block in Browser-Einheiten (model, pump_mbar, valve_mm2,
    start_mm) → hpdcsim-VacuumSystem (SI). None wenn kein Vakuum gewählt."""
    model = str(vac.get("model", "") or "").strip()
    if model in ("", "aus", "none", "sealed"):
        return None
    if model not in ALLOWED_VACUUM_MODELS:
        raise ConvertError(
            f"Vakuum-Modell '{model}' unbekannt — erlaubt: "
            + ", ".join(ALLOWED_VACUUM_MODELS) + " oder 'aus'.")
    pump = _num(vac, "pump_mbar") * 100.0          # mbar → Pa
    if pump <= 0:
        raise ConvertError("Pumpen-Enddruck muss > 0 mbar sein.")
    valve = _num(vac, "valve_mm2") / 1e6           # mm² → m² (Entlüftungsfläche)
    if valve <= 0:
        raise ConvertError("Entlüftungsfläche muss > 0 mm² sein.")
    start = _num(vac, "start_mm") / 1000.0         # mm → m
    if start < 0:
        raise ConvertError("Vakuum-Start muss ≥ 0 mm sein.")
    limit = min(fill_complete, travel)
    if start >= limit:
        raise ConvertError(
            f"Vakuum-Start ({start * 1000:.0f} mm) muss vor dem Kurvenende/"
            f"Füllende ({limit * 1000:.0f} mm) liegen.")
    return {
        "start_position": start,
        "valve_area": valve,
        "model": {"type": model, "pump_pressure": pump},
    }


def sim_config_from_browser(values, curve, process=None, vacuum=None):
    """(values, curve) aus dem Dashboard → (hpdcsim-Konfig-Dict, Meta-Dict)."""
    for key in REQUIRED_KEYS:
        _num(values, key)

    rho = _num(values, "density")
    if rho <= 0:
        raise ConvertError("Dichte muss > 0 sein.")
    rho_sol = solidus_density(values)
    D = _num(values, "diam") / 1000.0
    L = _num(values, "length") / 1000.0
    if D <= 0 or L <= 0:
        raise ConvertError("Kolben-Ø und Kammerlänge müssen > 0 sein.")
    A = 0.25 * math.pi * D * D

    # Kavitäten sind feste Geometrie (ρ_sol), die Dosierung liegt flüssig in
    # der Kammer (ρ) — dieselbe Konvention wie physics.js (rhoSolidus).
    Vr = _num(values, "runner") / rho_sol
    Vp = _num(values, "part") / rho_sol
    Vo = _num(values, "overflow") / rho_sol
    Vb = _num(values, "biscuit") / rho_sol           # Pressrest fest (Endlage)
    if Vr <= 0:
        raise ConvertError("Angussgewicht muss > 0 sein (hpdcsim braucht einen Anguss).")
    if Vp <= 0:
        raise ConvertError("Bauteilgewicht muss > 0 sein.")
    if Vo < 0:
        raise ConvertError("Überlaufgewicht darf nicht negativ sein.")
    if Vb <= 0:
        raise ConvertError("Pressrestgewicht muss > 0 sein (hpdcsim braucht einen Pressrest).")
    Vdose = (_num(values, "runner") + _num(values, "part")
             + _num(values, "overflow") + _num(values, "biscuit")) / rho
    phi = Vdose / (A * L)
    if phi >= 1:
        raise ConvertError(
            f"Dosiervolumen ({Vdose * 1e6:.0f} cm³) übersteigt das Kammervolumen — Füllgrad ≥ 100 %.")
    if phi <= 0:
        raise ConvertError("Dosiervolumen ist null.")

    # Füllende = Kammer voll + Kavität; danach Nachverdichtung bis zur
    # Endlage L − Pressrest fest.
    biscuit_len = Vb / A
    fill_complete = (L - Vdose / A) + (Vr + Vp + Vo) / A
    intens = L - biscuit_len - fill_complete
    # Der Nachverdichtungshub ist die Schwindung: flüssig dosiertes Volumen
    # minus fester Kavität minus festem Pressrest. Er wird negativ, sobald
    # die Feststoffdichte unter der Schmelzedichte liegt — ein physikalisch
    # unmöglicher Schuss, den die API bisher mit 200 OK und
    # curve_clamped: false auslieferte (gemessen −94,37 mm).
    # Ohne Feststoffdichte fällt solidus_density auf die Schmelzedichte
    # zurück — dann ist der Hub exakt null, bis auf Rundungsreste. Die
    # Toleranz ist ein Mikrometer, nicht null.
    if intens < -1e-6:
        raise ConvertError(
            f"Nachverdichtungshub wäre negativ ({intens * 1000:.1f} mm): die Feststoffdichte "
            f"({rho_sol:.0f} kg/m³ nach Schwindung) liegt unter der Schmelzedichte "
            f"({rho:.0f} kg/m³) — das Gussstück würde beim Erstarren größer.")
    positions_velocities, clamped = _clamped_curve(curve, fill_complete)

    gate_area = _num(values, "gate") / 1e6
    if gate_area <= 0:
        raise ConvertError("Anschnittfläche muss > 0 sein.")
    vent = _num_opt(values, "vent", 0.0) / 1e6

    # Einfüllöffnung: Verschluss-Hub aus dem Dashboard (sealStroke, mm) —
    # derselbe Wert wie im Füllkammer-Schema; ohne Angabe (direkte
    # API-Nutzung) 20 % der Kammerlänge.
    seal = _num_opt(values, "sealStroke",
                    POUR_HOLE_POSITION_FRACTION * L * 1000.0) / 1000.0
    if not 0 < seal <= L:
        raise ConvertError(
            f"Einfüllöffnung-Verschlusshub ({seal * 1000:.0f} mm) muss > 0 mm "
            f"sein und in der Kammer ({L * 1000:.0f} mm) liegen.")

    config = {
        "sleeve": {
            "diameter": D,
            "length": L,
            "fill_fraction": phi,
            "pour_hole_position": seal,
        },
        "melt": _melt_config(values, rho),
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
    # TODO: Es wird KEIN thermal-Block konfiguriert — deshalb ist
    # samples.T_melt in jeder Antwort null, obwohl die Legierungsdaten
    # (oben in _melt_config) inzwischen vollständig ankommen. Den Kanal zu
    # füllen braucht Wärmeübergangszahlen und Wandtemperaturen
    # (vgl. packages/hpdcsim/examples/demo.json: shell/plunger_face/
    # die_face/downstream mit htc und wall_temperature). Das sind
    # Modellparameter, die niemand vorgegeben hat; sie gehören entschieden,
    # nicht geraten. Bis dahin bleibt T_melt ein leerer Kanal.
    if vent > 0:
        config["casting"]["vent_area"] = vent
    if vacuum:
        vac = _vacuum_config(vacuum, fill_complete,
                             positions_velocities[-1][0])
        if vac is not None:
            config["vacuum"] = vac

    meta = {
        "phi": phi,
        "fill_complete_mm": fill_complete * 1000.0,
        "biscuit_mm": biscuit_len * 1000.0,
        "intens_mm": intens * 1000.0,
        "curve_clamped": clamped,
    }
    return config, meta
