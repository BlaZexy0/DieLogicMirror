"""Werkzeugseiten nur mit Konto — und zwar schon beim Ausliefern.

Vorher entschied das erst die Projektleiste im Browser: das Dashboard kam
vollständig an, baute sich auf und sprang dann zur Anmeldung; das 3D-Studio
fragte gar nicht. Jetzt schickt der Server ohne Sitzung für jede Seite
unter /tools/ einen 302 auf /konto/?next=… — kein HTML verlässt ihn."""
from pathlib import Path
from urllib.parse import quote

from fastapi.testclient import TestClient

from backend.app import SITE_DIR, app, needs_login

TOOLS = SITE_DIR / "tools"
PAGES = sorted("/tools/" + p.relative_to(TOOLS).as_posix() for p in TOOLS.rglob("*.html"))


def _client():
    c = TestClient(app, follow_redirects=False)
    c.__enter__()   # Startup: Schema + Demo-Konto (DIELOGIC_DEMO_PASSWORD aus conftest)
    return c


def _redirects_to_login(r, target):
    assert r.status_code == 302, target
    assert r.headers["location"] == "/konto/?next=" + quote(target, safe=""), target
    assert "<html" not in r.text.lower(), "die Seite darf nicht mitgeschickt werden"


def test_needs_login_meint_nur_die_seiten_unter_tools():
    assert needs_login("/tools/auslegung/")
    assert needs_login("/tools/auslegung/chart.html")
    assert needs_login("/tools/3d-studio/anguss.html")
    assert needs_login("/tools/3d-studio")
    # Skripte, Styles, Modelle: frei — Konto- und Theorieseiten laden Module von dort.
    assert not needs_login("/tools/auslegung/js/config/fields.js")
    assert not needs_login("/tools/auslegung/css/main.css")
    assert not needs_login("/tools/3d-studio/models/form.glb")
    # Alles außerhalb: frei.
    for path in ("/", "/index.html", "/konto/", "/theorie/pq2.html", "/recht/impressum.html", "/api/health"):
        assert not needs_login(path), path


def test_jede_werkzeugseite_wird_ohne_sitzung_zur_anmeldung_geschickt():
    assert len(PAGES) >= 13, PAGES   # Dashboard (2), Sprengfläche, Teilekosten, Zyklus, 3D-Studio (14)
    c = _client()
    for url in PAGES:
        _redirects_to_login(c.get(url), url)
        if url.endswith("/index.html"):
            d = url[: -len("index.html")]
            _redirects_to_login(c.get(d), d)
    _redirects_to_login(c.head("/tools/auslegung/"), "/tools/auslegung/")


def test_umleitung_nimmt_die_suchparameter_mit():
    c = _client()
    _redirects_to_login(c.get("/tools/auslegung/chart.html?id=pq2&x=1"), "/tools/auslegung/chart.html?id=pq2&x=1")
    _redirects_to_login(c.get("/tools/3d-studio/anguss.html?demo=zwei"), "/tools/3d-studio/anguss.html?demo=zwei")


def test_umleitung_traegt_dieselben_koepfe_wie_jede_seite():
    r = _client().get("/tools/auslegung/")
    assert r.status_code == 302
    assert r.headers["cache-control"] == "no-cache"
    assert "default-src 'self'" in r.headers.get("content-security-policy", "")
    assert r.headers.get("x-frame-options") == "DENY"


def test_alles_andere_bleibt_offen():
    c = _client()
    for url in ("/", "/konto/", "/theorie/pq2.html", "/recht/impressum.html", "/recht/datenschutz.html"):
        assert c.get(url).status_code == 200, url
    # Module unter /tools/…/js/ brauchen die Konto- und die Theorieseite — ohne Anmeldung.
    for url in ("/tools/auslegung/js/config/fields.js", "/tools/auslegung/css/main.css"):
        r = c.get(url)
        assert r.status_code == 200, url
        assert "<html" not in r.text[:200].lower(), url


def test_mit_sitzung_kommen_die_seiten_und_nach_dem_abmelden_nicht_mehr():
    c = _client()
    assert c.post("/api/auth/demo/login").status_code == 200
    for url in ("/tools/auslegung/", "/tools/auslegung/chart.html?id=pq2", "/tools/sprengflaeche/",
                "/tools/teilekosten/", "/tools/zyklus/", "/tools/3d-studio/", "/tools/3d-studio/anguss.html"):
        r = c.get(url)
        assert r.status_code == 200, url
        assert "<html" in r.text.lower(), url
    assert c.post("/api/auth/logout").status_code in (200, 204)
    _redirects_to_login(c.get("/tools/auslegung/"), "/tools/auslegung/")
    _redirects_to_login(c.get("/tools/3d-studio/anguss.html"), "/tools/3d-studio/anguss.html")
