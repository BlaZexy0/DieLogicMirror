"""End-to-End-Tests der Anwendung über den FastAPI-TestClient: Health,
statische Auslieferung, Sicherheitsköpfe. (Konto, Projekte und Stammdaten
haben ihre eigenen Dateien.)"""
from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_health():
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok" and r.json()["version"]


def test_simulation_endpoint_is_gone():
    """Die Luftsimulation rechnet im Browser (web/tools/auslegung/js/core/
    airsim/). Der frühere Endpunkt darf nicht halb weiterleben — etwa als
    statische Datei oder als Route ohne Rechenkern."""
    r = client.post("/api/sim/shot", json={"values": {}, "curve": [[0, 1]]})
    assert r.status_code in (404, 405)


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
    assert "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'" in csp
    # WebAssembly ja (das Metamodell der Kammerfüllung), eval() nein.
    assert "'unsafe-eval'" not in csp.replace("'wasm-unsafe-eval'", "")
    assert "connect-src 'self'" in csp and "object-src 'none'" in csp


def test_api_responses_are_not_cached():
    """Kontodaten gehören in keinen Cache."""
    assert client.get("/api/health").headers.get("cache-control") == "no-store"


def test_schema_explorer_is_closed_by_default():
    """/docs listet jeden Endpunkt samt Feldern und lädt zum Ausprobieren
    ein — in Produktion bleibt er zu, solange ihn niemand einschaltet."""
    for url in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(url).status_code == 404, url
