"""Stammdaten der Organisation: Lesen für Mitglieder, Schreiben nur Admin,
Validierung, Zurücksetzen, Mandantentrennung."""
from fastapi.testclient import TestClient

from backend.app import app

PW = "korrektes-pferd-batterie"


def _client():
    c = TestClient(app)
    c.__enter__()
    return c


def _admin():
    c = _client()
    if c.get("/api/auth/invite/bootstrap-token-for-tests").status_code == 200:
        c.post("/api/auth/register", json={"token": "bootstrap-token-for-tests", "name": "Owner", "password": PW})
    assert c.post("/api/auth/login", json={"email": "owner@example.com", "password": PW}).status_code == 200
    return c


def _member(admin, email="settings-member@example.com"):
    c = _client()
    if not any(m["email"] == email for m in admin.get("/api/org/members").json()):
        token = admin.post("/api/org/invites", json={"email": email}).json()["token"]
        assert c.post("/api/auth/register", json={"token": token, "name": "M", "password": PW}).status_code == 200
    else:
        assert c.post("/api/auth/login", json={"email": email, "password": PW}).status_code == 200
    return c


def test_settings_roundtrip_and_permissions():
    admin = _admin()
    member = _member(admin)
    assert admin.get("/api/org/settings").status_code == 200

    machines = [{"id": "m-800", "name": "Unsere 800 t", "fields": {"force": 8000, "vmax": 6.5}},
                {"id": "m-1600", "name": "Unsere 1600 t", "fields": {"force": 16000, "vmax": 8}}]
    assert member.put("/api/org/settings/machines", json={"data": machines}).status_code == 403
    r = admin.put("/api/org/settings/machines", json={"data": machines})
    assert r.status_code == 200, r.text
    assert r.json()["data"][1]["name"] == "Unsere 1600 t" and r.json()["updated_at"]

    got = member.get("/api/org/settings").json()
    assert [m["id"] for m in got["machines"]["data"]] == ["m-800", "m-1600"]

    r = admin.put("/api/org/settings/kosten", json={"data": {"pAl": 2.9, "pE": 0.21}})
    assert r.status_code == 200 and r.json()["data"] == {"pAl": 2.9, "pE": 0.21}

    # Validierung
    assert admin.put("/api/org/settings/machines", json={"data": {"x": 1}}).status_code == 422
    assert admin.put("/api/org/settings/machines", json={"data": [{"id": "Bad ID", "name": "x", "fields": {}}]}).status_code == 422
    assert admin.put("/api/org/settings/machines", json={"data": [{"id": "a", "name": "x", "fields": {}}, {"id": "a", "name": "y", "fields": {}}]}).status_code == 422
    assert admin.put("/api/org/settings/machines", json={"data": [{"id": "a", "name": "x", "fields": {"force": "viel"}}]}).status_code == 422
    assert admin.put("/api/org/settings/kosten", json={"data": {"pAl": True}}).status_code == 422
    assert admin.put("/api/org/settings/unbekannt", json={"data": []}).status_code == 404

    # Zurücksetzen
    assert admin.delete("/api/org/settings/machines").status_code == 204
    assert "machines" not in admin.get("/api/org/settings").json()
    assert member.delete("/api/org/settings/kosten").status_code == 403


def test_settings_are_tenant_scoped():
    _client()  # Startup: Schema anlegen
    from backend.auth import create_invite
    from backend.db import Org, SessionLocal
    from sqlalchemy import select
    with SessionLocal() as db:
        org = db.scalar(select(Org).where(Org.slug == "settings-other"))
        if not org:
            org = Org(slug="settings-other", name="Other")
            db.add(org)
            db.commit()
        token = create_invite(db, org, "carol@settings-other.example", "admin").token
    carol = _client()
    assert carol.post("/api/auth/register", json={"token": token, "name": "Carol", "password": PW}).status_code == 200
    assert carol.put("/api/org/settings/alloys", json={"data": [{"id": "geheim", "name": "Geheimlegierung", "fields": {"density": 2400}}]}).status_code == 200
    admin = _admin()
    assert "alloys" not in admin.get("/api/org/settings").json()
