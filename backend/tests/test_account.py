"""Kontoverwaltung: Passwortqualität, Sitzungen, Organisation (Name, Export,
Löschung), Konto löschen, Rollen, Protokoll."""
import os

import pytest

from backend import mail, ratelimit
from backend.auth import password_problem
from backend.tests.conftest import PW


@pytest.fixture(autouse=True)
def _quiet(monkeypatch):
    monkeypatch.setenv("DIELOGIC_MAIL", "memory")
    mail.OUTBOX.clear()
    ratelimit.clear()
    yield
    mail.OUTBOX.clear()


def test_password_problem_rules():
    assert password_problem("kurz") is not None
    assert "12" in password_problem("elfzeichen!")
    assert "häufig" in password_problem("Password123!")
    assert "verschiedene" in password_problem("aaaaaaabbbbb")
    assert "Ziffern" in password_problem("918273645091")
    assert "folgen" in password_problem("abcdefgh1234")
    assert "E-Mail" in password_problem("anna.mueller-2026", "anna.mueller@firma.de", "Anna Müller")
    assert password_problem("korrektes-pferd-batterie", "x@y.de", "X") is None


def test_password_rules_apply_to_change_and_reset(owner_client, client):
    r = owner_client.post("/api/auth/password", json={"current_password": PW, "new_password": "password1234"})
    assert r.status_code == 422 and "häufig" in r.json()["detail"]
    me = owner_client.get("/api/auth/me").json()["user"]
    client.post("/api/auth/password/forgot", json={"email": me["email"]})
    import re
    token = re.search(r"\?reset=(\S+)", mail.OUTBOX[-1]["text"]).group(1)
    # gleich wie das alte: nein
    r = client.post("/api/auth/password/reset", json={"token": token, "password": PW})
    assert r.status_code == 422 and "unterscheiden" in r.json()["detail"]
    # zu schwach: nein, Link bleibt gültig
    r = client.post("/api/auth/password/reset", json={"token": token, "password": "qwertzuiop12"})
    assert r.status_code == 422
    assert client.get(f"/api/auth/password/reset/{token}").status_code == 200


def test_sessions_list_and_revoke_others(owner_client):
    from fastapi.testclient import TestClient
    from backend.app import app
    me = owner_client.get("/api/auth/me").json()["user"]
    with TestClient(app) as other:
        assert other.post("/api/auth/login", json={"email": me["email"], "password": PW}).status_code == 200
        rows = owner_client.get("/api/auth/sessions").json()
        assert len(rows) >= 2 and sum(1 for s in rows if s["current"]) == 1
        r = owner_client.post("/api/auth/sessions/revoke-others")
        assert r.status_code == 200 and r.json()["revoked"] >= 1
        assert other.get("/api/auth/me").status_code == 401
        assert owner_client.get("/api/auth/me").status_code == 200


def test_org_info_rename_export_and_audit(owner_client):
    info = owner_client.get("/api/org").json()
    assert info["members"] >= 1 and "name" in info
    r = owner_client.put("/api/org", json={"name": "Owner Druckguss GmbH"})
    assert r.status_code == 200 and r.json()["name"] == "Owner Druckguss GmbH"
    assert owner_client.get("/api/auth/me").json()["org"]["name"] == "Owner Druckguss GmbH"
    p = owner_client.post("/api/projects", json={"name": "Export-Test", "data": {"design": {"values": {"part": 1}}}}).json()
    owner_client.post(f"/api/projects/{p['id']}/revisions", json={"data": {"design": {"values": {"part": 2}}}, "note": "eins"})
    ex = owner_client.get("/api/org/export").json()
    assert ex["kind"] == "org-export" and ex["org"]["name"] == "Owner Druckguss GmbH"
    names = [q["name"] for q in ex["projects"]]
    assert "Export-Test" in names
    proj = next(q for q in ex["projects"] if q["name"] == "Export-Test")
    assert proj["revisions"][0]["note"] == "eins" and proj["revisions"][0]["data"]["design"]["values"]["part"] == 2
    assert all("pw_hash" not in m for m in ex["members"])
    log = owner_client.get("/api/org/audit").json()
    actions = [row["action"] for row in log]
    assert "org.rename" in actions and "project.create" in actions and "project.revision" in actions and "org.export" in actions
    owner_client.delete(f"/api/projects/{p['id']}")
    assert "project.archive" in [row["action"] for row in owner_client.get("/api/org/audit").json()]
    r = owner_client.put("/api/org", json={"name": info["name"]})
    assert r.status_code == 200


def test_member_cannot_read_audit_or_rename(owner_client, client):
    inv = owner_client.post("/api/org/invites", json={"email": "mitglied@kunde.de", "role": "member"}).json()
    r = client.post("/api/auth/register", json={"token": inv["token"], "name": "Mitglied", "password": "lila-wolke-fahrrad-2026"})
    assert r.status_code == 200
    assert client.get("/api/org/audit").status_code == 403
    assert client.put("/api/org", json={"name": "Hijack"}).status_code == 403
    assert client.get("/api/org/export").status_code == 403
    # Rolle heben und wieder senken
    uid = r.json()["user"]["id"]
    assert owner_client.post(f"/api/org/members/{uid}/role", json={"name": "admin"}).status_code == 200
    assert client.get("/api/org/audit").status_code == 200
    assert owner_client.post(f"/api/org/members/{uid}/role", json={"name": "member"}).status_code == 200
    # Mitglied löscht sich selbst (Passwort nötig, falsches wird abgewiesen)
    assert client.request("DELETE", "/api/auth/me", json={"password": "falsch-falsch-falsch"}).status_code == 403
    assert client.request("DELETE", "/api/auth/me", json={"password": "lila-wolke-fahrrad-2026"}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert "mitglied@kunde.de" not in [m["email"] for m in owner_client.get("/api/org/members").json()]
    assert any(row["action"] == "account.delete" and row["actor"] == "mitglied@kunde.de"
               for row in owner_client.get("/api/org/audit").json())


def test_last_admin_cannot_delete_self_while_members_remain(owner_client, client):
    inv = owner_client.post("/api/org/invites", json={"email": "zweites@kunde.de", "role": "member"}).json()
    r = client.post("/api/auth/register", json={"token": inv["token"], "name": "Zwei", "password": "gruene-birne-fenster-2026"})
    assert r.status_code == 200, r.text   # sonst wäre der Owner allein und die Löschung träfe die ganze Organisation
    r = owner_client.request("DELETE", "/api/auth/me", json={"password": PW})
    assert r.status_code == 400 and "Administrator" in r.json()["detail"]
    client.request("DELETE", "/api/auth/me", json={"password": "gruene-birne-fenster-2026"})


def test_delete_whole_org(client):
    """Eine eigene Organisation anlegen (CLI-Weg), dann als deren Admin alles löschen."""
    from backend.db import Org, SessionLocal
    from backend.auth import create_invite
    with SessionLocal() as db:
        org = Org(slug="wegdamit", name="Weg damit GmbH")
        db.add(org)
        db.commit()
        inv = create_invite(db, org, "chef@wegdamit.de", role="admin")
        token = inv.token
    r = client.post("/api/auth/register", json={"token": token, "name": "Chef", "password": "sehr-geheimes-kennwort-2026"})
    assert r.status_code == 200
    p = client.post("/api/projects", json={"name": "P1"}).json()
    assert client.get("/api/projects").status_code == 200
    r = client.request("DELETE", "/api/org", json={"password": "sehr-geheimes-kennwort-2026", "confirm": "falsch"})
    assert r.status_code == 422
    r = client.request("DELETE", "/api/org", json={"password": "sehr-geheimes-kennwort-2026", "confirm": "Weg damit GmbH"})
    assert r.status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/login", json={"email": "chef@wegdamit.de", "password": "sehr-geheimes-kennwort-2026"}).status_code == 401
    with SessionLocal() as db:
        from sqlalchemy import select
        from backend.db import Project
        assert db.scalar(select(Org).where(Org.slug == "wegdamit")) is None
        assert db.get(Project, p["id"]) is None
