import contextlib
import os
import sys
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Tests laufen gegen eine frische SQLite-Datei — muss vor dem ersten Import
# von backend.db gesetzt sein (die Engine entsteht beim Import).
_tmp = Path(tempfile.mkdtemp(prefix="dielogic-test-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp / 'test.db'}"
os.environ["DIELOGIC_ADMIN_EMAIL"] = "owner@example.com"
os.environ["DIELOGIC_ADMIN_TOKEN"] = "bootstrap-token-for-tests"
os.environ["DIELOGIC_DEMO_PASSWORD"] = "demo-demo-demo"

# Dieselben Werte wie oben, als Namen statt als in jeder Testdatei erneut
# getippte Literale — auch das Passwort, mit dem alle Test-Konten angelegt
# werden (nur diese SQLite-Datei betrifft es, sie lebt nur für den Testlauf).
BOOTSTRAP_TOKEN = os.environ["DIELOGIC_ADMIN_TOKEN"]
OWNER_EMAIL = os.environ["DIELOGIC_ADMIN_EMAIL"]
PW = "korrektes-pferd-batterie"


@pytest.fixture
def client():
    """TestClient mit durchlaufenem Startup (Schema + Bootstrap-Einladung),
    sauber geschlossen am Ende des Tests — vorher stand dafür ein blankes
    c.__enter__() ohne Gegenstück in fünf Dateien."""
    from backend.app import app
    with TestClient(app) as c:
        yield c


@pytest.fixture
def client_no_redirect():
    """Wie client, aber folgt keinen Redirects — für Tests, die den 302
    selbst prüfen wollen (Login-Gate: test_login_gate.py)."""
    from backend.app import app
    with TestClient(app, follow_redirects=False) as c:
        yield c


@pytest.fixture
def owner_client():
    """Angemeldeter Owner/Admin-Client. Die Testdateien teilen sich für den
    Lauf eine SQLite-Datei (siehe DATABASE_URL oben) und sollen einzeln
    bestehen — das Owner-Konto wird darum nur angelegt, falls die
    Bootstrap-Einladung noch offen ist."""
    from backend.app import app
    with TestClient(app) as c:
        if c.get(f"/api/auth/invite/{BOOTSTRAP_TOKEN}").status_code == 200:
            r = c.post("/api/auth/register",
                       json={"token": BOOTSTRAP_TOKEN, "name": "Owner", "password": PW})
            assert r.status_code == 200, r.text
        else:
            r = c.post("/api/auth/login", json={"email": OWNER_EMAIL, "password": PW})
            assert r.status_code == 200, r.text
        yield c


@pytest.fixture
def member_client(owner_client):
    """Fabrik statt fester Fixture, weil jeder Aufrufer seine eigene
    E-Mail-Adresse (und mitunter Rolle) braucht: registriert ein neues
    Mitglied über eine Einladung von owner_client, oder meldet ein
    schon vorhandenes an (dieselbe Datei kann mehrfach danach fragen, oder
    ein früherer Testlauf gegen dieselbe SQLite-Datei hat es schon angelegt).
    Jeder erzeugte Client wird am Ende des Tests geschlossen."""
    from backend.app import app
    with contextlib.ExitStack() as stack:
        def make(email, *, role="member", password=PW, name=None):
            members = owner_client.get("/api/org/members").json()
            c = stack.enter_context(TestClient(app))
            if any(m["email"] == email for m in members):
                r = c.post("/api/auth/login", json={"email": email, "password": password})
                assert r.status_code == 200, r.text
            else:
                token = owner_client.post("/api/org/invites",
                                          json={"email": email, "role": role}).json()["token"]
                r = c.post("/api/auth/register",
                          json={"token": token, "name": name or email.split("@")[0], "password": password})
                assert r.status_code == 200, r.text
            return c
        yield make
