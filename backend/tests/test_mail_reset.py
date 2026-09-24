"""Mailversand, Passwort vergessen, Einladung per Mail, Rate-Limits.

Der Transport ist „memory": jede Mail landet in backend.mail.OUTBOX, nichts
verlässt den Testlauf."""
import os
import re

import pytest

from backend import mail, ratelimit
from backend.tests.conftest import PW


@pytest.fixture(autouse=True)
def _mail_memory(monkeypatch):
    monkeypatch.setenv("DIELOGIC_MAIL", "memory")
    mail.OUTBOX.clear()
    ratelimit.clear()
    yield
    mail.OUTBOX.clear()
    ratelimit.clear()


def _link(text: str, key: str) -> str:
    m = re.search(r"https?://\S+\?" + key + r"=(\S+)", text)
    assert m, text
    return m.group(1)


def test_features_report_mail(client):
    assert client.get("/api/auth/features").json()["mail"] is True
    os.environ["DIELOGIC_MAIL"] = "off"
    assert client.get("/api/auth/features").json()["mail"] is False


def test_invite_is_mailed_with_link(owner_client):
    r = owner_client.post("/api/org/invites", json={"email": "neu@kunde.de", "role": "member"})
    assert r.status_code == 201, r.text
    assert r.json()["mailed"] is True
    assert len(mail.OUTBOX) == 1
    m = mail.OUTBOX[0]
    assert m["to"] == "neu@kunde.de" and "Einladung" in m["subject"]
    assert _link(m["text"], "token") == r.json()["token"]
    # erneut senden: gleicher Link, Frist neu
    r2 = owner_client.post(f"/api/org/invites/{r.json()['id']}/resend")
    assert r2.status_code == 200 and r2.json()["mailed"] is True
    assert len(mail.OUTBOX) == 2 and _link(mail.OUTBOX[1]["text"], "token") == r.json()["token"]
    owner_client.delete(f"/api/org/invites/{r.json()['id']}")


def test_invite_without_mail_transport_reports_it(owner_client):
    os.environ["DIELOGIC_MAIL"] = "off"
    r = owner_client.post("/api/org/invites", json={"email": "kein-mail@kunde.de", "role": "member"})
    assert r.status_code == 201 and r.json()["mailed"] is False and r.json()["url"].endswith("?token=" + r.json()["token"])
    owner_client.delete(f"/api/org/invites/{r.json()['id']}")


def test_forgot_reset_login_flow(owner_client, client):
    me = owner_client.get("/api/auth/me").json()["user"]
    # 1) anfordern: Mail mit Link
    r = client.post("/api/auth/password/forgot", json={"email": me["email"]})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert len(mail.OUTBOX) == 1 and mail.OUTBOX[0]["to"] == me["email"]
    token = _link(mail.OUTBOX[0]["text"], "reset")
    # 2) Link prüfen
    assert client.get(f"/api/auth/password/reset/{token}").json()["email"] == me["email"]
    # 3) neues Passwort setzen: angemeldet, alte Sitzung des Owners tot
    new_pw = "neues-sicheres-passwort-1"
    r = client.post("/api/auth/password/reset", json={"token": token, "password": new_pw})
    assert r.status_code == 200 and r.json()["user"]["email"] == me["email"]
    assert client.get("/api/auth/me").status_code == 200
    assert owner_client.get("/api/auth/me").status_code == 401
    # Sicherheitsmail über die Änderung
    assert any("geändert" in m["subject"] for m in mail.OUTBOX)
    # 4) Link ist verbraucht
    assert client.get(f"/api/auth/password/reset/{token}").status_code == 404
    assert client.post("/api/auth/password/reset", json={"token": token, "password": new_pw}).status_code == 404
    # 5) altes Passwort gilt nicht mehr, neues schon
    assert client.post("/api/auth/login", json={"email": me["email"], "password": PW}).status_code == 401
    assert client.post("/api/auth/login", json={"email": me["email"], "password": new_pw}).status_code == 200
    # zurück auf das Testpasswort, damit die anderen Dateien es weiter nutzen können
    r = client.post("/api/auth/password", json={"current_password": new_pw, "new_password": PW})
    assert r.status_code == 200


def test_forgot_does_not_reveal_accounts(client):
    r = client.post("/api/auth/password/forgot", json={"email": "niemand@nirgends.de"})
    assert r.status_code == 200 and r.json() == {"ok": True}
    assert mail.OUTBOX == []


def test_forgot_without_mail_transport_says_so(client):
    os.environ["DIELOGIC_MAIL"] = "off"
    r = client.post("/api/auth/password/forgot", json={"email": "x@y.de"})
    assert r.status_code == 503


def test_login_rate_limit(client):
    for _ in range(8):
        r = client.post("/api/auth/login", json={"email": "wer@auch.immer", "password": "falsch-falsch"})
        assert r.status_code == 401
    r = client.post("/api/auth/login", json={"email": "wer@auch.immer", "password": "falsch-falsch"})
    assert r.status_code == 429 and "Retry-After" in r.headers


def test_forgot_rate_limit_per_address(client):
    for _ in range(3):
        assert client.post("/api/auth/password/forgot", json={"email": "a@b.de"}).status_code == 200
    assert client.post("/api/auth/password/forgot", json={"email": "a@b.de"}).status_code == 429
