"""Anmeldung nur auf Einladung.

Es gibt keine offene Registrierung: ein Admin (CLI backend/manage.py oder
Organisations-Admin über /api/org/invites) erzeugt eine Einladung für eine
E-Mail-Adresse; der Link führt auf /app/konto.html?token=… — dort legt die
eingeladene Person Namen und Passwort fest. Danach E-Mail + Passwort.

Sitzungen: zufälliger Token in einem HttpOnly-Cookie, serverseitig in der
Tabelle sessions (Abmelden = Zeile löschen; kein Geheimnis zum Signieren
nötig). Passwörter: scrypt aus der Standardbibliothek mit Salt je Nutzer.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import AuthSession, Invite, Org, User, get_db, iso, now

router = APIRouter(prefix="/api", tags=["auth"])

COOKIE = "dl_session"
SESSION_DAYS = 30
INVITE_DAYS = 14
MIN_PASSWORD = 10


# ── Passwörter ────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2 ** 14, r=8, p=1)
    return "scrypt$" + salt.hex() + "$" + digest.hex()


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, salt_hex, digest_hex = stored.split("$")
        if algo != "scrypt":
            return False
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2 ** 14, r=8, p=1)
        return hmac.compare_digest(digest, bytes.fromhex(digest_hex))
    except (ValueError, TypeError):
        return False


# ── Sitzungen ─────────────────────────────────────────────────────────

def _secure_cookie(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    return proto == "https"


def start_session(db: Session, user: User, request: Request, response: Response) -> None:
    sess = AuthSession(user_id=user.id, expires_at=now() + timedelta(days=SESSION_DAYS))
    db.add(sess)
    db.commit()
    response.set_cookie(COOKIE, sess.token, max_age=SESSION_DAYS * 86400, httponly=True,
                        samesite="lax", secure=_secure_cookie(request), path="/")


def end_session(db: Session, request: Request, response: Response) -> None:
    token = request.cookies.get(COOKIE)
    if token:
        sess = db.scalar(select(AuthSession).where(AuthSession.token == token))
        if sess:
            db.delete(sess)
            db.commit()
    response.delete_cookie(COOKIE, path="/")


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    token = request.cookies.get(COOKIE)
    if not token:
        return None
    sess = db.scalar(select(AuthSession).where(AuthSession.token == token))
    if not sess:
        return None
    expires = sess.expires_at
    if expires.tzinfo is None:  # SQLite liefert naive Zeitstempel zurück
        from datetime import timezone
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < now():
        db.delete(sess)
        db.commit()
        return None
    user = db.get(User, sess.user_id)
    if not user or user.disabled:
        return None
    return user


def current_user(user: User | None = Depends(optional_user)) -> User:
    if not user:
        raise HTTPException(status_code=401, detail="Nicht angemeldet.")
    return user


def admin_user(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Nur für Administratoren der Organisation.")
    return user


# ── Einladungen ───────────────────────────────────────────────────────

def create_invite(db: Session, org: Org, email: str, role: str = "member",
                  created_by: str | None = None, token: str | None = None) -> Invite:
    email = email.strip().lower()
    if not email or "@" not in email:
        raise ValueError("Ungültige E-Mail-Adresse.")
    if role not in ("admin", "member"):
        raise ValueError("Rolle muss admin oder member sein.")
    if db.scalar(select(User).where(User.email == email)):
        raise ValueError("Für diese E-Mail-Adresse gibt es bereits ein Konto.")
    inv = Invite(org_id=org.id, email=email, role=role, created_by=created_by,
                 expires_at=now() + timedelta(days=INVITE_DAYS))
    if token:
        inv.token = token
    db.add(inv)
    db.commit()
    return inv


def invite_url(base_url: str, token: str) -> str:
    return base_url.rstrip("/") + "/app/konto.html?token=" + token


def _valid_invite(db: Session, token: str) -> Invite:
    inv = db.scalar(select(Invite).where(Invite.token == token))
    if not inv or inv.used_at is not None:
        raise HTTPException(status_code=404, detail="Einladung unbekannt oder bereits eingelöst.")
    expires = inv.expires_at
    if expires is not None:
        if expires.tzinfo is None:
            from datetime import timezone
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < now():
            raise HTTPException(status_code=410, detail="Einladung abgelaufen — bitte neu einladen lassen.")
    return inv


def bootstrap_from_env(db: Session) -> None:
    """Erster Admin ohne Shell (z. B. Render Free): DIELOGIC_ADMIN_EMAIL und
    DIELOGIC_ADMIN_TOKEN setzen — solange es keinen Benutzer gibt, wird
    beim Start die Organisation DIELOGIC_ORG (Standard „DieLogic") angelegt
    und eine Admin-Einladung mit genau diesem Token. Einlösen unter
    /app/konto.html?token=<DIELOGIC_ADMIN_TOKEN>."""
    email = os.environ.get("DIELOGIC_ADMIN_EMAIL", "").strip().lower()
    token = os.environ.get("DIELOGIC_ADMIN_TOKEN", "").strip()
    if not email or not token:
        return
    if db.scalar(select(User).limit(1)):
        return
    if db.scalar(select(Invite).where(Invite.token == token)):
        return
    slug = os.environ.get("DIELOGIC_ORG", "dielogic").strip().lower() or "dielogic"
    org = db.scalar(select(Org).where(Org.slug == slug))
    if not org:
        org = Org(slug=slug, name=os.environ.get("DIELOGIC_ORG_NAME", slug.capitalize()))
        db.add(org)
        db.commit()
    inv = create_invite(db, org, email, role="admin", token=token)
    inv.expires_at = None  # Bootstrap-Einladung läuft nicht ab
    db.commit()


DEMO_EMAIL = "demo@dielogic.de"


def bootstrap_demo(db: Session) -> None:
    """Demo-Zugang zum schnellen Ausprobieren: DIELOGIC_DEMO_PASSWORD setzen →
    Organisation „Demo" mit Admin demo@dielogic.de (Passwort wird bei jedem
    Start auf den Env-Wert gesetzt). Nur für Entwicklung/Vorführung — in
    Produktion die Variable weglassen."""
    pw = os.environ.get("DIELOGIC_DEMO_PASSWORD", "")
    if len(pw) < MIN_PASSWORD:
        return
    org = db.scalar(select(Org).where(Org.slug == "demo"))
    if not org:
        org = Org(slug="demo", name="Demo Druckguss GmbH")
        db.add(org)
        db.commit()
    user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
    if not user:
        user = User(org_id=org.id, email=DEMO_EMAIL, name="Demo", pw_hash=hash_password(pw), role="admin")
        db.add(user)
    else:
        user.pw_hash, user.disabled = hash_password(pw), False
    db.commit()


def demo_credentials() -> dict | None:
    pw = os.environ.get("DIELOGIC_DEMO_PASSWORD", "")
    return {"email": DEMO_EMAIL, "password": pw} if len(pw) >= MIN_PASSWORD else None


# ── Schemas ───────────────────────────────────────────────────────────

class RegisterIn(BaseModel):
    token: str = Field(min_length=8, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=MIN_PASSWORD, max_length=200)


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=200)


class InviteIn(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: str = Field("member", pattern="^(admin|member)$")


def user_out(user: User) -> dict:
    return {"id": user.id, "email": user.email, "name": user.name, "role": user.role}


def me_out(user: User) -> dict:
    return {"user": user_out(user), "org": {"id": user.org.id, "slug": user.org.slug, "name": user.org.name}}


# ── Endpunkte ─────────────────────────────────────────────────────────

@router.get("/auth/invite/{token}")
def get_invite(token: str, db: Session = Depends(get_db)):
    inv = _valid_invite(db, token)
    return {"email": inv.email, "role": inv.role, "org": {"slug": inv.org.slug, "name": inv.org.name}}


@router.get("/auth/demo")
def demo():
    """Zugangsdaten des Demo-Kontos (nur wenn DIELOGIC_DEMO_PASSWORD gesetzt)."""
    return demo_credentials() or {}


@router.post("/auth/register")
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    inv = _valid_invite(db, body.token)
    if db.scalar(select(User).where(User.email == inv.email)):
        raise HTTPException(status_code=409, detail="Für diese E-Mail-Adresse gibt es bereits ein Konto.")
    user = User(org_id=inv.org_id, email=inv.email, name=body.name.strip(),
                pw_hash=hash_password(body.password), role=inv.role)
    inv.used_at = now()
    db.add(user)
    db.commit()
    db.refresh(user)
    start_session(db, user, request, response)
    return me_out(user)


@router.post("/auth/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    # Gleiche Fehlermeldung für unbekannte Adresse und falsches Passwort.
    if not user or user.disabled or not verify_password(body.password, user.pw_hash):
        raise HTTPException(status_code=401, detail="E-Mail oder Passwort stimmen nicht.")
    start_session(db, user, request, response)
    return me_out(user)


@router.post("/auth/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    end_session(db, request, response)
    return {"ok": True}


@router.get("/auth/me")
def me(user: User = Depends(current_user)):
    return me_out(user)


@router.get("/org/members")
def members(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(User).where(User.org_id == user.org_id).order_by(User.created_at)).all()
    return [dict(user_out(u), disabled=u.disabled, created_at=iso(u.created_at)) for u in rows]


@router.get("/org/invites")
def list_invites(user: User = Depends(admin_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Invite).where(Invite.org_id == user.org_id, Invite.used_at.is_(None))
                      .order_by(Invite.created_at.desc())).all()
    return [{"id": i.id, "email": i.email, "role": i.role, "token": i.token,
             "created_at": iso(i.created_at),
             "expires_at": iso(i.expires_at)} for i in rows]


@router.post("/org/invites", status_code=201)
def new_invite(body: InviteIn, request: Request, user: User = Depends(admin_user),
               db: Session = Depends(get_db)):
    try:
        inv = create_invite(db, user.org, body.email, body.role, created_by=user.id)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    base = str(request.base_url)
    return {"id": inv.id, "email": inv.email, "role": inv.role, "token": inv.token,
            "url": invite_url(base, inv.token), "expires_at": iso(inv.expires_at)}


@router.delete("/org/invites/{invite_id}", status_code=204)
def revoke_invite(invite_id: str, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    inv = db.get(Invite, invite_id)
    if not inv or inv.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Einladung nicht gefunden.")
    db.delete(inv)
    db.commit()
    return Response(status_code=204)


@router.post("/org/members/{user_id}/disable", status_code=204)
def disable_member(user_id: str, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target or target.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden.")
    if target.id == user.id:
        raise HTTPException(status_code=400, detail="Das eigene Konto kann nicht deaktiviert werden.")
    target.disabled = True
    for sess in db.scalars(select(AuthSession).where(AuthSession.user_id == target.id)).all():
        db.delete(sess)
    db.commit()
    return Response(status_code=204)
