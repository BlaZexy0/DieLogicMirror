"""End-to-End: Einladung → Konto → Projekt → Revisionen → Mandantentrennung.
Läuft gegen eine frische SQLite-Datei (DATABASE_URL setzt conftest.py vor dem Import)."""
from fastapi.testclient import TestClient

from backend.app import app
from backend.auth import hash_password, verify_password
from backend.db import Org, SessionLocal

PW = "korrektes-pferd-batterie"


def _client():
    c = TestClient(app)
    c.__enter__()  # Startup-Event: Schema + Bootstrap-Einladung
    return c


def test_password_hashing_roundtrip():
    h = hash_password("geheim1234")
    assert h.startswith("scrypt$") and verify_password("geheim1234", h)
    assert not verify_password("falsch", h) and not verify_password("x", "kaputt")


def test_a_bootstrap_invite_and_register():
    c = _client()
    r = c.get("/api/auth/invite/bootstrap-token-for-tests")
    if r.status_code == 200:   # andere Testmodule können den Owner schon angelegt haben
        assert r.json()["email"] == "owner@example.com" and r.json()["role"] == "admin"
        r = c.post("/api/auth/register", json={"token": "bootstrap-token-for-tests", "name": "Owner", "password": "kurz"})
        assert r.status_code == 422  # Passwort zu kurz
        r = c.post("/api/auth/register", json={"token": "bootstrap-token-for-tests", "name": "Owner", "password": PW})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin" and r.json()["org"]["slug"] == "dielogic"
    else:
        _ensure_owner()
        assert c.post("/api/auth/login", json={"email": "owner@example.com", "password": PW}).status_code == 200
    assert c.get("/api/auth/me").status_code == 200

    # Einladung ist verbraucht
    assert c.get("/api/auth/invite/bootstrap-token-for-tests").status_code == 404
    # Abmelden beendet die Sitzung
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401
    # Anmelden mit Passwort
    assert c.post("/api/auth/login", json={"email": "Owner@Example.com", "password": "nope"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "Owner@Example.com", "password": PW}).status_code == 200


def _ensure_owner():
    """Owner-Konto anlegen, falls noch nicht geschehen (Tests laufen in
    alphabetischer Reihenfolge und sollen einzeln bestehen)."""
    c = _client()
    if c.get("/api/auth/invite/bootstrap-token-for-tests").status_code == 200:
        c.post("/api/auth/register", json={"token": "bootstrap-token-for-tests", "name": "Owner", "password": PW})


def _ensure_jane():
    admin = _client()
    _login(admin, "owner@example.com")
    if any(m["email"] == "jane@example.com" for m in admin.get("/api/org/members").json()):
        return
    token = admin.post("/api/org/invites", json={"email": "jane@example.com", "role": "member"}).json()["token"]
    assert _client().post("/api/auth/register", json={"token": token, "name": "Jane", "password": PW}).status_code == 200


def _login(c, email, pw=PW):
    _ensure_owner()
    r = c.post("/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code == 200, r.text


def test_admin_invites_member_and_projects_flow():
    admin = _client()
    _login(admin, "owner@example.com")

    r = admin.post("/api/org/invites", json={"email": "jane@example.com", "role": "member"})
    assert r.status_code == 201, r.text
    token, url = r.json()["token"], r.json()["url"]
    assert "/konto/?token=" + token in url
    assert any(i["email"] == "jane@example.com" for i in admin.get("/api/org/invites").json())

    jane = _client()
    r = jane.post("/api/auth/register", json={"token": token, "name": "Jane", "password": PW})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "member"
    # Mitglied darf keine Einladungen aussprechen
    assert jane.post("/api/org/invites", json={"email": "x@example.com"}).status_code == 403
    members = jane.get("/api/org/members").json()
    assert {"owner@example.com", "jane@example.com"} <= {m["email"] for m in members}

    # Projekt anlegen (mit erster Revision) und speichern
    doc = {"design": {"values": {"part": 12}, "machine": "hcc800"}, "cycle": {"durs": {"schuss": 4}},
           "unbekannt": {"x": 1}}
    r = jane.post("/api/projects", json={"name": "DieCastPartA", "description": "Getriebegehäuse", "data": doc})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["rev"] == 0 and r.json()["draft_at"]  # Anlegen = Arbeitsstand, keine Revision

    r = admin.get(f"/api/projects/{pid}")  # gleiche Organisation → sichtbar
    assert r.status_code == 200 and r.json()["data"]["design"]["machine"] == "hcc800"
    assert "unbekannt" not in r.json()["data"]

    # Autosave: Draft ändern, dann Revision als Schnappschuss
    r = jane.put(f"/api/projects/{pid}/draft", json={"data": {"design": {"values": {"part": 12.5}}}})
    assert r.status_code == 200
    assert admin.get(f"/api/projects/{pid}").json()["data"]["design"]["values"]["part"] == 12.5
    r = jane.post(f"/api/projects/{pid}/revisions", json={"data": {"design": {"values": {"part": 12}}}, "note": "Angebot"})
    assert r.status_code == 201 and r.json()["rev"] == 1
    r = admin.post(f"/api/projects/{pid}/revisions", json={"data": {"design": {"values": {"part": 13}}}, "note": "Gewicht korrigiert"})
    assert r.status_code == 201 and r.json()["rev"] == 2
    assert admin.get(f"/api/projects/{pid}").json()["data"]["design"]["values"]["part"] == 13
    revs = jane.get(f"/api/projects/{pid}/revisions").json()
    assert [x["rev"] for x in revs] == [2, 1]
    assert revs[0]["author"]["email"] == "owner@example.com" and revs[0]["note"] == "Gewicht korrigiert"
    assert jane.get(f"/api/projects/{pid}/revisions/1").json()["data"]["design"]["values"]["part"] == 12

    r = jane.put(f"/api/projects/{pid}", json={"name": "DieCastPartA", "description": "Rev B", "customer": "ACME", "part_no": "4711"})
    assert r.status_code == 200 and r.json()["customer"] == "ACME"
    assert [p["id"] for p in jane.get("/api/projects").json()] == [pid]

    # Abschnitt muss ein Objekt sein
    assert jane.post(f"/api/projects/{pid}/revisions", json={"data": {"cost": [1, 2]}}).status_code == 422

    # Archivieren: verschwindet aus Liste und Zugriff
    assert jane.delete(f"/api/projects/{pid}").status_code == 204
    assert jane.get("/api/projects").json() == []
    assert admin.get(f"/api/projects/{pid}").status_code == 404


def test_tenant_isolation():
    with SessionLocal() as db:
        other = Org(slug="other", name="Other GmbH")
        db.add(other)
        db.commit()
        from backend.auth import create_invite
        inv = create_invite(db, other, "bob@other.example", "admin")
        token = inv.token

    bob = _client()
    assert bob.post("/api/auth/register", json={"token": token, "name": "Bob", "password": PW}).status_code == 200
    r = bob.post("/api/projects", json={"name": "Secret", "data": {"design": {"values": {}}}})
    assert r.status_code == 201
    secret_id = r.json()["id"]

    admin = _client()
    _login(admin, "owner@example.com")
    assert admin.get(f"/api/projects/{secret_id}").status_code == 404
    assert admin.post(f"/api/projects/{secret_id}/revisions", json={"data": {}}).status_code == 404
    assert all(p["id"] != secret_id for p in admin.get("/api/projects").json())
    assert all(m["email"] != "bob@other.example" for m in admin.get("/api/org/members").json())


def test_disable_member_ends_access():
    _ensure_jane()
    admin = _client()
    _login(admin, "owner@example.com")
    jane_id = next(m["id"] for m in admin.get("/api/org/members").json() if m["email"] == "jane@example.com")
    jane = _client()
    _login(jane, "jane@example.com")
    assert admin.post(f"/api/org/members/{jane_id}/disable").status_code == 204
    assert jane.get("/api/auth/me").status_code == 401
    assert jane.post("/api/auth/login", json={"email": "jane@example.com", "password": PW}).status_code == 401


def test_demo_account_from_env():
    c = _client()
    assert c.get("/api/auth/demo").json() == {"email": "demo@dielogic.de", "password": "demo-demo-demo"}
    r = c.post("/api/auth/login", json={"email": "demo@dielogic.de", "password": "demo-demo-demo"})
    assert r.status_code == 200 and r.json()["org"]["slug"] == "demo" and r.json()["user"]["role"] == "admin"
