"""End-to-End-Tests für /api/sim/shot über den FastAPI-TestClient:
Dashboard-Payload hinein, Simulationsergebnis (oder 422) heraus."""
from fastapi.testclient import TestClient

from backend.app import app
from backend.sim import ShotRequest  # noqa: F401 — Import prüft das Schema

client = TestClient(app)

VALUES = {
    "part": 12, "runner": 3, "overflow": 2, "biscuit": 1.2, "density": 2700,
    "diam": 150, "length": 700, "gate": 1800, "vent": 800, "Tcast": 660,
}
CURVE = [[60, 0.4], [318, 0.4], [470, 4], [675, 4]]


def shot(payload_extra=None, **overrides):
    payload = {"values": dict(VALUES, **overrides), "curve": CURVE, "count": 200}
    payload.update(payload_extra or {})
    return client.post("/api/sim/shot", json=payload)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["version"]


def test_shot_happy_path():
    r = shot()
    assert r.status_code == 200, r.text
    data = r.json()
    assert set(data) == {"meta", "samples", "events", "critical_crossing"}

    meta = data["meta"]
    assert abs(meta["phi"] - 0.544926) < 1e-4
    assert meta["critical_velocity_model"] == "cfd_table"
    assert meta["v_crit"] > 0
    assert meta["curve_clamped"] is True

    s = data["samples"]
    assert all(len(s[k]) == 200 for k in
               ("t", "s_mm", "v", "gate_v", "p_air_mbar", "T_melt", "part_fill"))
    # Schussphase: Zeit startet bei 0, Weg wächst monoton bis zum Füllende.
    assert s["t"][0] == 0.0
    assert all(b >= a for a, b in zip(s["s_mm"], s["s_mm"][1:]))
    assert abs(s["s_mm"][-1] - 674.85) < 0.1
    # Luftdruck ohne Vakuum: startet bei Umgebungsdruck.
    assert abs(s["p_air_mbar"][0] - 1013.25) < 1

    names = {e["id"] for e in data["events"]}
    assert {"shot_start", "sleeve_full", "runner_full", "part_full",
            "pour_hole_sealed"} <= names
    # Zeiten sind relativ zum Schussbeginn — nur dosing_end liegt davor.
    for e in data["events"]:
        if e["id"] != "dosing_end":
            assert e["t"] is None or e["t"] >= 0


def test_shot_event_strokes_match_volumes():
    r = shot()
    events = {e["id"]: e for e in r.json()["events"]}
    # Kammer voll bei (1−phi)·L, danach kumulativ Anguss/Bauteil (Herleitung
    # wie in test_convert.py).
    assert abs(events["sleeve_full"]["s_mm"] - 318.552) < 1e-2
    A = 0.017671458676442587
    runner_full = 318.55210347028867 + (3 / 2700) / A * 1000
    assert abs(events["runner_full"]["s_mm"] - runner_full) < 1e-2


def test_shot_count_clamped():
    assert len(shot(payload_extra={"count": 50}).json()["samples"]["t"]) == 50
    # Pydantic begrenzt count auf 50…2000 → außerhalb ist ein 422.
    assert shot(payload_extra={"count": 10}).status_code == 422
    assert shot(payload_extra={"count": 99999}).status_code == 422


def test_shot_invalid_inputs_are_422():
    r = shot(part=2000)  # Füllgrad ≥ 100 %
    assert r.status_code == 422
    assert "Füllgrad" in r.json()["detail"]

    r = shot(biscuit=0)
    assert r.status_code == 422
    assert "Pressrest" in r.json()["detail"]

    r = shot(runner=0)  # Dashboard erlaubt 0, die Simulation nicht —
    assert r.status_code == 422  # Meldung muss deutsch sein
    assert "Anguss" in r.json()["detail"]


def test_seal_stroke_drives_pour_hole_event():
    # Das Dashboard-Feld „Einfüllöffnung verschlossen" bestimmt, wo die
    # Luftkompression beginnt — nicht mehr die hartkodierten 20 % von L.
    events = {e["id"]: e for e in shot(sealStroke=150).json()["events"]}
    assert abs(events["pour_hole_sealed"]["s_mm"] - 150.0) < 1e-6
    events = {e["id"]: e for e in shot().json()["events"]}
    assert abs(events["pour_hole_sealed"]["s_mm"] - 140.0) < 1e-6  # 0,2·700


def test_shot_curve_validation():
    payload = {"values": VALUES, "curve": [], "count": 200}
    assert client.post("/api/sim/shot", json=payload).status_code == 422  # Pydantic
    payload["curve"] = [[i, 1] for i in range(1, 60)]
    assert client.post("/api/sim/shot", json=payload).status_code == 422  # > 50 Punkte


def test_shot_with_vacuum_lowers_air_pressure():
    vac = {"model": "ideal", "pump_mbar": 80, "valve_mm2": 100, "start_mm": 150}
    without = shot().json()["samples"]["p_air_mbar"]
    with_vac = shot(payload_extra={"vacuum": vac}).json()["samples"]["p_air_mbar"]
    assert min(p for p in with_vac if p is not None) < min(
        p for p in without if p is not None)


def test_shot_vacuum_invalid_model_is_422():
    vac = {"model": "turbo", "pump_mbar": 80, "valve_mm2": 100, "start_mm": 150}
    r = shot(payload_extra={"vacuum": vac})
    assert r.status_code == 422 and "unbekannt" in r.json()["detail"]


def test_static_site_is_served():
    r = client.get("/")
    assert r.status_code == 200 and "DieLogic" in r.text
    assert r.headers["cache-control"] == "no-cache"
    r = client.get("/assets/logo.svg")
    assert r.status_code == 200
    assert r.headers["cache-control"] == "public, max-age=3600"


def test_security_headers_on_every_response():
    """Es gab keine — kein CSP, keine Referrer-Policy, kein nosniff, kein
    X-Frame-Options (H-34)."""
    for url in ("/api/health", "/index.html", "/konto/"):
        r = client.get(url)
        assert r.status_code in (200, 404), url
        h = r.headers
        assert "default-src 'self'" in h.get("content-security-policy", ""), url
        assert h.get("x-content-type-options") == "nosniff", url
        assert h.get("x-frame-options") == "DENY", url
        assert h.get("referrer-policy") == "strict-origin-when-cross-origin", url
        assert "frame-ancestors 'none'" in h["content-security-policy"], url

    # Die CSP muss die mitgelieferten Inline-Blöcke zulassen — sonst wäre die
    # Seite mit einem strengen Kopf schlicht kaputt statt sicher.
    csp = client.get("/api/health").headers["content-security-policy"]
    assert "script-src 'self' 'unsafe-inline'" in csp
    assert "connect-src 'self'" in csp and "object-src 'none'" in csp


def test_api_responses_are_not_cached():
    """Kontodaten gehören in keinen Cache."""
    assert client.get("/api/health").headers.get("cache-control") == "no-store"


def test_schema_explorer_is_closed_by_default():
    """/docs listet jeden Endpunkt samt Feldern und lädt zum Ausprobieren
    ein — in Produktion bleibt er zu, solange ihn niemand einschaltet."""
    for url in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(url).status_code == 404, url
