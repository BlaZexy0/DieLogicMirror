"""End-to-End: Einladung → Konto → Projekt → Revisionen → Mandantentrennung.
Läuft gegen eine frische SQLite-Datei (DATABASE_URL setzt conftest.py vor dem Import)."""
from fastapi.testclient import TestClient

from backend.app import app
from backend.auth import hash_password, verify_password
from backend.db import Org, SessionLocal
from backend.tests.conftest import BOOTSTRAP_TOKEN, OWNER_EMAIL, PW


def test_password_hashing_roundtrip():
    h = hash_password("geheim1234")
    assert h.startswith("scrypt$") and verify_password("geheim1234", h)
    assert not verify_password("falsch", h) and not verify_password("x", "kaputt")


def test_a_bootstrap_invite_and_register(client):
    c = client
    r = c.get(f"/api/auth/invite/{BOOTSTRAP_TOKEN}")
    if r.status_code == 200:   # andere Testmodule können den Owner schon angelegt haben
        assert r.json()["email"] == OWNER_EMAIL and r.json()["role"] == "admin"
        r = c.post("/api/auth/register", json={"token": BOOTSTRAP_TOKEN, "name": "Owner", "password": "kurz"})
        assert r.status_code == 422  # Passwort zu kurz
        r = c.post("/api/auth/register", json={"token": BOOTSTRAP_TOKEN, "name": "Owner", "password": PW})
        assert r.status_code == 200, r.text
        assert r.json()["user"]["role"] == "admin" and r.json()["org"]["slug"] == "dielogic"
    else:
        # Token schon verbraucht → den Owner gibt es zwingend schon (sonst
        # gäbe es niemanden, der ihn hätte verbrauchen können).
        assert c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": PW}).status_code == 200
    assert c.get("/api/auth/me").status_code == 200

    # Einladung ist verbraucht
    assert c.get(f"/api/auth/invite/{BOOTSTRAP_TOKEN}").status_code == 404
    # Abmelden beendet die Sitzung
    c.post("/api/auth/logout")
    assert c.get("/api/auth/me").status_code == 401
    # Anmelden mit Passwort
    assert c.post("/api/auth/login", json={"email": "Owner@Example.com", "password": "nope"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "Owner@Example.com", "password": PW}).status_code == 200


def test_admin_invites_member_and_projects_flow(owner_client, client):
    admin = owner_client

    r = admin.post("/api/org/invites", json={"email": "jane@example.com", "role": "member"})
    assert r.status_code == 201, r.text
    token, url = r.json()["token"], r.json()["url"]
    assert "/konto/?token=" + token in url
    assert any(i["email"] == "jane@example.com" for i in admin.get("/api/org/invites").json())

    jane = client
    r = jane.post("/api/auth/register", json={"token": token, "name": "Jane", "password": PW})
    assert r.status_code == 200, r.text
    assert r.json()["user"]["role"] == "member"
    # Mitglied darf keine Einladungen aussprechen
    assert jane.post("/api/org/invites", json={"email": "x@example.com"}).status_code == 403
    members = jane.get("/api/org/members").json()
    assert {OWNER_EMAIL, "jane@example.com"} <= {m["email"] for m in members}

    # Ein unbekannter Abschnitt ist ein Fehler des Aufrufers — stumm verwerfen
    # und 200 antworten hieße: das nächste Werkzeug verliert seine Arbeit (H-01).
    r = jane.post("/api/projects", json={"name": "X", "data": {"design": {}, "unbekannt": {"x": 1}}})
    assert r.status_code == 422, r.text
    assert "unbekannt" in r.json()["detail"]

    # Projekt anlegen (mit erster Revision) und speichern
    doc = {"design": {"values": {"part": 12}, "machine": "hcc800"}, "cycle": {"durs": {"schuss": 4}}}
    r = jane.post("/api/projects", json={"name": "DieCastPartA", "description": "Getriebegehäuse", "data": doc})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert r.json()["rev"] == 0 and r.json()["draft_at"]  # Anlegen = Arbeitsstand, keine Revision

    r = admin.get(f"/api/projects/{pid}")  # gleiche Organisation → sichtbar
    assert r.status_code == 200 and r.json()["data"]["design"]["machine"] == "hcc800"
    assert jane.put(f"/api/projects/{pid}/draft",
                    json={"data": {"design": {}, "unbekannt": {}}}).status_code == 422

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
    assert revs[0]["author"]["email"] == OWNER_EMAIL and revs[0]["note"] == "Gewicht korrigiert"
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


def test_tenant_isolation(client, owner_client):
    with SessionLocal() as db:
        other = Org(slug="other", name="Other GmbH")
        db.add(other)
        db.commit()
        from backend.auth import create_invite
        inv = create_invite(db, other, "bob@other.example", "admin")
        token = inv.token

    bob = client
    assert bob.post("/api/auth/register", json={"token": token, "name": "Bob", "password": PW}).status_code == 200
    r = bob.post("/api/projects", json={"name": "Secret", "data": {"design": {"values": {}}}})
    assert r.status_code == 201
    secret_id = r.json()["id"]

    admin = owner_client
    assert admin.get(f"/api/projects/{secret_id}").status_code == 404
    assert admin.post(f"/api/projects/{secret_id}/revisions", json={"data": {}}).status_code == 404
    assert all(p["id"] != secret_id for p in admin.get("/api/projects").json())
    assert all(m["email"] != "bob@other.example" for m in admin.get("/api/org/members").json())


def test_disable_member_ends_access(owner_client, member_client):
    admin = owner_client
    jane = member_client("jane@example.com")
    jane_id = next(m["id"] for m in admin.get("/api/org/members").json() if m["email"] == "jane@example.com")
    assert admin.post(f"/api/org/members/{jane_id}/disable").status_code == 204
    assert jane.get("/api/auth/me").status_code == 401
    assert jane.post("/api/auth/login", json={"email": "jane@example.com", "password": PW}).status_code == 401


def test_demo_account_from_env(client):
    """Der Endpunkt sagt, DASS es einen Demo-Zugang gibt — nicht mehr, WIE er
    lautet. Vorher lieferte er unauthentifiziert ein gültiges Anmeldepaar."""
    c = client
    assert c.get("/api/auth/demo").json() == {"email": "demo@dielogic.de"}
    assert "password" not in c.get("/api/auth/demo").json()

    # Anmelden ohne das Passwort zu kennen — der Server macht es.
    with TestClient(app) as d:
        r = d.post("/api/auth/demo/login")
        assert r.status_code == 200, r.text
        assert r.json()["org"]["slug"] == "demo" and r.json()["user"]["role"] == "admin"
        assert d.get("/api/auth/me").status_code == 200

    # Das Passwort funktioniert weiterhin, wer es kennt (Env-Variable).
    with TestClient(app) as e:
        r = e.post("/api/auth/login", json={"email": "demo@dielogic.de", "password": "demo-demo-demo"})
        assert r.status_code == 200


def test_draft_conflict_is_refused_not_overwritten(owner_client):
    """Optimistische Sperre: wer auf einem veralteten Draft-Stempel aufsetzt,
    bekommt 409 statt den fremden Stand zu überschreiben (C-3)."""
    # Zwei Sitzungen desselben Kontos = zwei Tabs/Rechner auf einem Projekt.
    admin = owner_client
    jane = TestClient(app)
    jane.__enter__()
    assert jane.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": PW}).status_code == 200

    pid = admin.post("/api/projects", json={"name": "Konflikt", "data": {"design": {"values": {"schuss": 1}}}}).json()["id"]
    base = admin.get(f"/api/projects/{pid}").json()["draft_at"]

    # Kollegin schreibt
    r = jane.put(f"/api/projects/{pid}/draft",
                 json={"data": {"design": {"values": {"schuss": 99}}}, "base_draft_at": base})
    assert r.status_code == 200, r.text

    # Kollege setzt noch auf dem alten Stempel auf → abgelehnt, Stand bleibt
    r = admin.put(f"/api/projects/{pid}/draft",
                  json={"data": {"design": {"values": {"schuss": 77}}}, "base_draft_at": base})
    assert r.status_code == 409, r.text
    assert admin.get(f"/api/projects/{pid}").json()["data"]["design"]["values"]["schuss"] == 99

    # Ein Schreibvorgang, der nichts ändert, ist kein Konflikt (verlorene Antwort)
    r = admin.put(f"/api/projects/{pid}/draft",
                  json={"data": {"design": {"values": {"schuss": 99}}}, "base_draft_at": base})
    assert r.status_code == 200, r.text

    # Mit dem aktuellen Stempel geht es weiter
    now = admin.get(f"/api/projects/{pid}").json()["draft_at"]
    r = admin.put(f"/api/projects/{pid}/draft",
                  json={"data": {"design": {"values": {"schuss": 77}}}, "base_draft_at": now})
    assert r.status_code == 200, r.text
    assert admin.get(f"/api/projects/{pid}").json()["data"]["design"]["values"]["schuss"] == 77

    # Ohne Anspruch (älterer Client) bleibt es beim bisherigen Verhalten
    assert admin.put(f"/api/projects/{pid}/draft", json={"data": {}}).status_code == 200


def test_create_is_idempotent_per_client_id(owner_client):
    """Geht die Antwort verloren (Tab schließt, Reload), darf derselbe Versuch
    kein zweites Projekt anlegen (C-5)."""
    admin = owner_client
    before = len(admin.get("/api/projects").json())

    body = {"id": "p19c4f1a2b3c0123456789abcdef0", "name": "Nur einmal",
            "data": {"design": {"values": {"part": 3}}}}
    r1 = admin.post("/api/projects", json=body)
    assert r1.status_code == 201, r1.text
    assert r1.json()["id"] == body["id"]
    r2 = admin.post("/api/projects", json=body)
    assert r2.status_code == 201 and r2.json()["id"] == r1.json()["id"]
    assert len(admin.get("/api/projects").json()) == before + 1

    # Eine ungültige Anfrage hinterlässt kein Geisterprojekt (H-04)
    assert admin.post("/api/projects", json={"name": "Kaputt", "data": {"cost": [1, 2]}}).status_code == 422
    assert len(admin.get("/api/projects").json()) == before + 1

    # Ein archiviertes Projekt darf der Idempotenz-Schlüssel nicht wiederbeleben:
    # der Client hielte es für gespeichert, während es in keiner Liste steht (H-09).
    assert admin.delete(f"/api/projects/{body['id']}").status_code == 204
    r3 = admin.post("/api/projects", json=body)
    assert r3.status_code == 409, r3.text


def test_non_finite_numbers_are_refused_not_stored(owner_client):
    """NaN/Infinity machen den Lese-Endpunkt dauerhaft zu 500 — Python nimmt
    die Literale an, JSONResponse schreibt sie nicht (H-02)."""
    admin = owner_client
    pid = admin.post("/api/projects", json={"name": "Endlich", "data": {}}).json()["id"]

    for body in ('{"data": {"design": {"values": {"part": NaN}}}}',
                 '{"data": {"design": {"values": {"part": Infinity}}}}',
                 '{"data": {"design": {"kurve": [1, -Infinity]}}}'):
        r = admin.put(f"/api/projects/{pid}/draft", content=body,
                      headers={"Content-Type": "application/json"})
        assert r.status_code == 422, (body, r.text)
        assert "NaN" in r.json()["detail"] or "Infinity" in r.json()["detail"]

    # Der Endpunkt bleibt lesbar
    assert admin.get(f"/api/projects/{pid}").status_code == 200

    # Eine bereits verdorbene Zeile heilt beim Lesen zu null, statt 500 zu bleiben
    from backend.db import Project, SessionLocal
    with SessionLocal() as db:
        p = db.get(Project, pid)
        p.draft = {"design": {"values": {"part": float("nan"), "ok": 3}}}
        db.commit()
    r = admin.get(f"/api/projects/{pid}")
    assert r.status_code == 200, r.text
    assert r.json()["data"]["design"]["values"] == {"part": None, "ok": 3}


def test_concurrent_revisions_all_succeed(owner_client):
    """head_rev war ein Read-Modify-Write ohne Sperre: gleichzeitige
    „Revision anlegen" endeten in HTTP 500, der Schnappschuss war weg (H-05)."""
    import threading
    admin = owner_client
    pid = admin.post("/api/projects", json={"name": "Parallel", "data": {}}).json()["id"]

    codes = []
    def one(i):
        r = admin.post(f"/api/projects/{pid}/revisions",
                       json={"data": {"design": {"n": i}}, "note": f"r{i}"})
        codes.append(r.status_code)

    threads = [threading.Thread(target=one, args=(i,)) for i in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert codes == [201] * 6, codes
    revs = sorted(r["rev"] for r in admin.get(f"/api/projects/{pid}/revisions").json())
    assert revs == [1, 2, 3, 4, 5, 6], revs


def test_draft_lock_is_atomic_under_load(owner_client):
    """Prüfen und Schreiben müssen EIN Schritt sein. Getrennt lasen mehrere
    gleichzeitige Anfragen denselben Stempel, bestanden alle die Prüfung und
    schrieben nacheinander — gemessen kamen von zehn Versuchen mit demselben
    base_draft_at drei durch."""
    import threading
    from collections import Counter

    admin = owner_client
    pid = admin.post("/api/projects", json={"name": "Wettlauf", "data": {"design": {"v": 0}}}).json()["id"]
    base = admin.get(f"/api/projects/{pid}").json()["draft_at"]

    codes = []
    def one(i):
        r = admin.put(f"/api/projects/{pid}/draft",
                      json={"data": {"design": {"v": i}}, "base_draft_at": base})
        codes.append(r.status_code)

    threads = [threading.Thread(target=one, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    zaehlung = Counter(codes)
    assert zaehlung[200] == 1, f"genau einer darf durchkommen, war: {dict(zaehlung)}"
    assert zaehlung[409] == 9, dict(zaehlung)
