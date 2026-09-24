"""Sicherheitsbefunde des Code-Reviews (MEDIUM/LOW).

Alle drei Backend-Befunde vorher gemessen:
  - GET /api/auth/demo lieferte unauthentifiziert ein gültiges Anmeldepaar.
  - Login: 45,3 ms für eine vorhandene, 4,2 ms für eine unbekannte Adresse
    (Faktor 10,8) — ein Orakel ohne Anmeldung abfragbar.
  - Ein Org-Admin bekam „gibt es bereits ein Konto" für JEDE registrierte
    Adresse, auch in fremden Mandanten.
"""
import statistics
import time

import pytest

from backend.app import MAX_BODY_BYTES
from backend.tests.conftest import OWNER_EMAIL


def test_demo_endpoint_does_not_hand_out_the_password(client):
    r = client.get("/api/auth/demo")
    assert r.status_code == 200
    assert "password" not in r.json(), "ein gültiges Anmeldepaar, offen im Netz"
    assert r.json().get("email")


def test_demo_login_works_without_knowing_the_password(client):
    assert client.post("/api/auth/demo/login").status_code == 200
    assert client.get("/api/auth/me").json()["org"]["slug"] == "demo"


def test_login_takes_the_same_time_for_known_and_unknown_addresses(owner_client):
    """Ohne Blindvergleich lief scrypt nur für vorhandene Konten."""
    c = owner_client

    def median_ms(email):
        xs = []
        for _ in range(9):
            t = time.perf_counter()
            c.post("/api/auth/login", json={"email": email, "password": "definitiv-falsch-123"})
            xs.append(time.perf_counter() - t)
        return statistics.median(xs) * 1000

    bekannt = median_ms(OWNER_EMAIL)
    unbekannt = median_ms("gibt-es-nicht@example.com")
    # Vorher Faktor 10,8. Großzügige Schranke, damit der Test auf langsamen
    # Läufern nicht flackert — sie trennt trotzdem sauber.
    assert 0.4 < bekannt / unbekannt < 2.5, f"bekannt {bekannt:.1f} ms, unbekannt {unbekannt:.1f} ms"


def test_admin_cannot_probe_addresses_of_other_tenants(owner_client):
    admin = owner_client

    # Eigene Organisation: der Grund darf genannt werden.
    r = admin.post("/api/org/invites", json={"email": OWNER_EMAIL})
    assert r.status_code == 422
    assert "dieser Organisation" in r.json()["detail"]

    # Fremde Organisation: keine Bestätigung, dass es das Konto gibt.
    from backend.auth import DEMO_EMAIL
    r = admin.post("/api/org/invites", json={"email": DEMO_EMAIL})
    assert r.status_code == 422
    assert "bereits ein Konto" not in r.json()["detail"], r.json()["detail"]
    assert "kann hier nicht eingeladen werden" in r.json()["detail"]


def test_request_body_size_is_capped(owner_client):
    admin = owner_client
    riesig = "x" * (MAX_BODY_BYTES + 1000)
    r = admin.post("/api/projects", json={"name": "gross", "description": riesig})
    assert r.status_code == 413, r.status_code
    # Knapp darunter geht weiterhin durch (der fachliche Filter greift danach).
    assert admin.post("/api/projects", json={"name": "ok", "data": {}}).status_code == 201


def test_organisation_cannot_lose_its_last_admin(owner_client):
    """Über HTTP ist der Fall nicht erreichbar (das eigene Konto ist gesperrt,
    und wer disable aufruft, ist selbst ein aktiver Admin). Auf der
    Kommandozeile war er es — dort hielt niemand auf, den letzten
    Administrator zu deaktivieren oder herabzustufen."""
    from backend import manage
    from backend.db import SessionLocal, User
    from sqlalchemy import select

    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == OWNER_EMAIL))
        assert owner and owner.role == "admin" and not owner.disabled
        org_id = owner.org_id
        andere = db.scalars(select(User).where(
            User.org_id == org_id, User.role == "admin",
            User.disabled.is_(False), User.id != owner.id)).all()
        for u in andere:            # Ausgangslage: genau ein aktiver Admin
            u.disabled = True
        db.commit()

    for argv in (["disable", OWNER_EMAIL], ["set-role", OWNER_EMAIL, "member"]):
        with pytest.raises(SystemExit) as exc:
            manage.main(argv)
        assert "letzte aktive Administrator" in str(exc.value), argv

    with SessionLocal() as db:                     # nichts verändert
        owner = db.scalar(select(User).where(User.email == OWNER_EMAIL))
        assert owner.role == "admin" and not owner.disabled

    # Zu „admin" heraufstufen bleibt jederzeit erlaubt.
    manage.main(["set-role", OWNER_EMAIL, "admin"])

    # Und --force lässt es ausdrücklich zu.
    manage.main(["disable", OWNER_EMAIL, "--force"])
    with SessionLocal() as db:
        owner = db.scalar(select(User).where(User.email == OWNER_EMAIL))
        assert owner.disabled
        owner.disabled = False                     # für die übrigen Tests zurück
        db.commit()


def test_https_behind_chained_proxies_is_read_the_same_everywhere():
    """Cookie (Secure) und HSTS lesen X-Forwarded-Proto gleich: der erste
    Eintrag der Liste zählt. Vorher verglich das Cookie den ganzen Kopf, bei
    „https, http" fehlte ihm Secure, während HSTS schon galt."""
    from starlette.requests import Request
    from backend.auth import request_is_https

    def req(proto):
        headers = [(b"x-forwarded-proto", proto.encode())] if proto is not None else []
        return Request({"type": "http", "scheme": "http", "path": "/", "headers": headers,
                        "server": ("test", 80), "query_string": b""})
    assert request_is_https(req("https"))
    assert request_is_https(req("https, http"))
    assert request_is_https(req(" HTTPS "))
    assert not request_is_https(req("http, https"))
    assert not request_is_https(req(None))


def test_create_org_checks_the_slug_it_stores():
    """„ACME" neben „acme": die Prüfung sah die Großschreibung, gespeichert
    wurde klein, und der Befehl scheiterte mit einem Traceback der Datenbank
    statt der Meldung."""
    from backend import manage
    try:
        manage.main(["create-org", "slug-test-acme", "Acme"])
    except SystemExit:
        pass                                       # aus einem früheren Lauf schon da
    with pytest.raises(SystemExit) as exc:
        manage.main(["create-org", "SLUG-TEST-ACME", "Acme 2"])
    assert "vergeben" in str(exc.value)
