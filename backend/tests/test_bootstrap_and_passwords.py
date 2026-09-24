"""Betriebsfeste Startphase und Kontopflege (HIGH-Befunde H-03, H-06, H-07):

  H-03  Eine Fehlkonfiguration des Bootstraps darf nicht die ganze Site
        abschalten — auch nicht die rein statischen Seiten.
  H-06  Der Bootstrap-Token ist das einzige frei gewählte Geheimnis im
        System: Untergrenze, Obergrenze (Spaltenbreite) und Ablauf.
  H-07  Passwort ändern, Passwort zurücksetzen, wieder aktivieren.
"""
import os

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from backend import app as app_module
from backend.auth import MAX_TOKEN_CHARS, MIN_BOOTSTRAP_TOKEN, bootstrap_from_env
from backend.db import Base, Invite, User, aware
from backend.tests.conftest import PW

MEMBER = "pw-test@example.com"


def _fresh_session(tmp_path):
    """Eigene, leere Datenbank — bootstrap_from_env greift nur, solange es
    noch keinen Benutzer gibt."""
    engine = create_engine(f"sqlite:///{tmp_path / 'boot.db'}")
    Base.metadata.create_all(engine)
    return sessionmaker(engine)()


# ── H-03 ──────────────────────────────────────────────────────────────

def test_broken_admin_email_does_not_take_the_site_down(tmp_path, monkeypatch, caplog):
    monkeypatch.setenv("DIELOGIC_ADMIN_EMAIL", "kein-at-zeichen")
    monkeypatch.setenv("DIELOGIC_ADMIN_TOKEN", "x" * 40)
    with _fresh_session(tmp_path) as db:
        with pytest.raises(ValueError):
            bootstrap_from_env(db)          # die Ursache bleibt ein Fehler …


def test_startup_survives_a_failing_bootstrap_step(tmp_path, monkeypatch):
    """… aber _startup fängt ihn ab und startet den Dienst trotzdem. Vorher
    reichte ein Tippfehler in einer Umgebungsvariablen, damit uvicorn den
    Dienst verweigerte — inklusive aller rein statischen Seiten."""
    def boom(_db):
        raise ValueError("Ungültige E-Mail-Adresse.")

    engine = create_engine(f"sqlite:///{tmp_path / 'startup.db'}")
    Base.metadata.create_all(engine)
    monkeypatch.setattr(app_module, "SessionLocal", sessionmaker(engine))
    monkeypatch.setattr(app_module, "init_db", lambda: None)
    monkeypatch.setattr(app_module, "bootstrap_from_env", boom)
    monkeypatch.setattr(app_module, "bootstrap_demo", boom)

    app_module._startup()                    # darf nicht werfen


def test_demo_account_does_not_block_the_bootstrap(tmp_path, monkeypatch):
    """bootstrap_demo läuft auch, wenn bootstrap_from_env scheitert. Zählte
    das Demo-Konto als „es gibt schon einen Benutzer", käme der Betreiber nie
    mehr an seinen ersten Admin."""
    from backend.auth import DEMO_EMAIL
    token = "c" * 40
    monkeypatch.setenv("DIELOGIC_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setenv("DIELOGIC_ADMIN_TOKEN", token)
    with _fresh_session(tmp_path) as db:
        from backend.db import Org
        org = Org(slug="demo", name="Demo")
        db.add(org)
        db.commit()
        db.add(User(org_id=org.id, email=DEMO_EMAIL, name="Demo", pw_hash="x", role="admin"))
        db.commit()

        bootstrap_from_env(db)
        assert db.scalar(select(Invite).where(Invite.token == token)) is not None


# ── H-06 ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("token", ["kurz", "x" * (MIN_BOOTSTRAP_TOKEN - 1),
                                   "x" * (MAX_TOKEN_CHARS + 1)])
def test_weak_or_oversized_bootstrap_token_is_refused(tmp_path, monkeypatch, token):
    monkeypatch.setenv("DIELOGIC_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setenv("DIELOGIC_ADMIN_TOKEN", token)
    with _fresh_session(tmp_path) as db:
        bootstrap_from_env(db)               # still, aber ohne Einladung
        assert db.scalar(select(Invite).where(Invite.token == token)) is None


def test_bootstrap_invite_expires_and_is_renewed_while_unused(tmp_path, monkeypatch):
    token = "b" * 40
    monkeypatch.setenv("DIELOGIC_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setenv("DIELOGIC_ADMIN_TOKEN", token)
    with _fresh_session(tmp_path) as db:
        bootstrap_from_env(db)
        inv = db.scalar(select(Invite).where(Invite.token == token))
        assert inv is not None and inv.role == "admin"
        assert inv.expires_at is not None, "eine Einladung, die nie abläuft, ist ein Dauerschlüssel"

        # Frist künstlich verkürzen; der nächste Start verlängert sie wieder,
        # damit sich der Betreiber nicht aussperrt.
        from datetime import timedelta
        from backend.db import now
        inv.expires_at = now() - timedelta(days=1)
        db.commit()
        bootstrap_from_env(db)
        db.refresh(inv)
        assert aware(inv.expires_at) > now()

        # Sobald ein Benutzer existiert, passiert gar nichts mehr.
        db.add(User(org_id=inv.org_id, email="a@b.de", name="A", pw_hash="x", role="admin"))
        db.commit()
        inv.expires_at = now() - timedelta(days=1)
        db.commit()
        bootstrap_from_env(db)
        db.refresh(inv)
        assert aware(inv.expires_at) < now(), "mit vorhandenem Benutzer wird nichts mehr verlängert"


def test_invite_without_expiry_counts_as_expired(tmp_path, monkeypatch):
    """Alte Einladungen ohne Frist sind kein Dauerschlüssel."""
    from fastapi import HTTPException
    from backend.auth import _valid_invite
    token = "c" * 40
    monkeypatch.setenv("DIELOGIC_ADMIN_EMAIL", "owner@example.com")
    monkeypatch.setenv("DIELOGIC_ADMIN_TOKEN", token)
    with _fresh_session(tmp_path) as db:
        bootstrap_from_env(db)
        inv = db.scalar(select(Invite).where(Invite.token == token))
        assert _valid_invite(db, token) is inv
        inv.expires_at = None
        db.commit()
        with pytest.raises(HTTPException) as err:
            _valid_invite(db, token)
        assert err.value.status_code == 410


# ── H-07 ──────────────────────────────────────────────────────────────

def test_change_own_password_and_end_other_sessions(client, owner_client, member_client):
    here = member_client(MEMBER)
    elsewhere = member_client(MEMBER)  # zweite Sitzung desselben Kontos

    assert here.post("/api/auth/password", json={
        "current_password": "falsch-falsch", "new_password": "neues-passwort-123"}).status_code == 403
    assert here.post("/api/auth/password", json={
        "current_password": PW, "new_password": PW}).status_code == 422

    r = here.post("/api/auth/password", json={"current_password": PW, "new_password": "neues-passwort-123"})
    assert r.status_code == 200, r.text
    assert here.get("/api/auth/me").status_code == 200, "die eigene Sitzung bleibt"
    assert elsewhere.get("/api/auth/me").status_code == 401, "andere Sitzungen enden"

    assert client.post("/api/auth/login", json={"email": MEMBER, "password": PW}).status_code == 401
    back = member_client(MEMBER, password="neues-passwort-123")
    # für die übrigen Tests dieser Datei zurücksetzen
    assert back.post("/api/auth/password", json={
        "current_password": "neues-passwort-123", "new_password": PW}).status_code == 200


def test_admin_resets_password_and_reactivates_member(owner_client, member_client):
    admin = owner_client
    member_client(MEMBER)
    mid = next(m["id"] for m in admin.get("/api/org/members").json() if m["email"] == MEMBER)

    # Deaktivieren war bisher endgültig: erneut einladen scheitert am Konto.
    assert admin.post(f"/api/org/members/{mid}/disable").status_code == 204
    assert admin.post("/api/org/invites", json={"email": MEMBER}).status_code == 422
    assert admin.post(f"/api/org/members/{mid}/enable").status_code == 204
    assert not next(m for m in admin.get("/api/org/members").json() if m["id"] == mid)["disabled"]

    r = admin.post(f"/api/org/members/{mid}/password")
    assert r.status_code == 200, r.text
    temp = r.json()["password"]
    assert r.json()["email"] == MEMBER and len(temp) >= 12

    member = member_client(MEMBER, password=temp)
    assert member.post("/api/auth/password", json={
        "current_password": temp, "new_password": PW}).status_code == 200

    # Mitglieder dürfen das nicht
    assert member.post(f"/api/org/members/{mid}/password").status_code == 403
    assert member.post(f"/api/org/members/{mid}/enable").status_code == 403
