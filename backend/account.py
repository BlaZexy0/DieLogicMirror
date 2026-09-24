"""Kontoverwaltung jenseits der Anmeldung: die Organisation (Name, Export,
Löschung), das eigene Konto (Sitzungen, Löschung) und das Protokoll.

Löschen ist endgültig und heißt hier wirklich löschen, nicht archivieren:
Projekte samt Revisionen, Stammdaten, Einladungen, Sitzungen, Protokoll,
Benutzer, Organisation. Der Export davor ist der Weg, die Daten zu behalten
(DSGVO Art. 20); die Löschung selbst ist Art. 17. Beides verlangt das
Passwort noch einmal, die Organisation zusätzlich ihren Namen als
Bestätigung.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from . import audit
from .auth import (COOKIE, admin_user, current_user, end_session, me_out, user_out,
                   verify_password)
from .db import (AuditLog, AuthSession, Invite, Org, OrgSetting, PasswordReset, Project,
                 ProjectRevision, User, get_db, iso, now)

router = APIRouter(prefix="/api", tags=["account"])


class PasswordConfirm(BaseModel):
    password: str = Field(min_length=1, max_length=200)


class OrgDelete(PasswordConfirm):
    confirm: str = Field(min_length=1, max_length=200)


class OrgIn(BaseModel):
    name: str = Field(min_length=2, max_length=200)


def _check_password(user: User, password: str) -> None:
    if not verify_password(password, user.pw_hash):
        raise HTTPException(status_code=403, detail="Das Passwort stimmt nicht.")


# ── Organisation ──────────────────────────────────────────────────────

@router.get("/org")
def get_org(user: User = Depends(current_user), db: Session = Depends(get_db)):
    org = user.org
    n_users = db.scalar(select(func.count()).select_from(User).where(User.org_id == org.id))
    n_projects = db.scalar(select(func.count()).select_from(Project).where(Project.org_id == org.id, Project.archived_at.is_(None)))
    n_archived = db.scalar(select(func.count()).select_from(Project).where(Project.org_id == org.id, Project.archived_at.is_not(None)))
    return {"id": org.id, "slug": org.slug, "name": org.name, "created_at": iso(org.created_at),
            "members": n_users, "projects": n_projects, "archived": n_archived}


@router.put("/org")
def rename_org(body: OrgIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    old = user.org.name
    user.org.name = body.name.strip()
    db.commit()
    audit.record(db, "org.rename", user=user, request=request, target=user.org.name, detail={"von": old})
    return {"name": user.org.name}


@router.get("/org/export")
def export_org(request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Alles der Organisation als ein JSON: Projekte mit allen Revisionen,
    Stammdaten, Mitglieder (ohne Passwort-Hashes), Protokoll."""
    org = user.org
    projects = db.scalars(select(Project).where(Project.org_id == org.id).order_by(Project.created_at)).all()
    users = db.scalars(select(User).where(User.org_id == org.id).order_by(User.created_at)).all()
    settings = db.scalars(select(OrgSetting).where(OrgSetting.org_id == org.id)).all()
    logs = db.scalars(select(AuditLog).where(AuditLog.org_id == org.id).order_by(AuditLog.at)).all()
    out = {
        "app": "DieLogic", "kind": "org-export", "schema": 1, "exported_at": iso(now()),
        "org": {"slug": org.slug, "name": org.name, "created_at": iso(org.created_at)},
        "members": [dict(user_out(u), disabled=u.disabled, created_at=iso(u.created_at)) for u in users],
        "settings": {s.key: {"data": s.data, "updated_at": iso(s.updated_at)} for s in settings},
        "projects": [{
            "id": p.id, "name": p.name, "description": p.description, "customer": p.customer,
            "part_no": p.part_no, "created_at": iso(p.created_at), "updated_at": iso(p.updated_at),
            "archived_at": iso(p.archived_at), "draft": p.draft, "draft_at": iso(p.draft_at),
            "revisions": [{"rev": r.rev, "note": r.note, "created_at": iso(r.created_at),
                           "author": r.author.email if r.author else None, "data": r.data} for r in p.revisions],
        } for p in projects],
        "audit": [audit.out(row) for row in logs],
    }
    audit.record(db, "org.export", user=user, request=request, detail={"projekte": len(projects)})
    return out


def _delete_org(db: Session, org: Org) -> None:
    """Alles der Organisation entfernen, in der Reihenfolge der Abhängigkeiten."""
    user_ids = [u.id for u in db.scalars(select(User).where(User.org_id == org.id)).all()]
    if user_ids:
        db.execute(delete(AuthSession).where(AuthSession.user_id.in_(user_ids)))
        db.execute(delete(PasswordReset).where(PasswordReset.user_id.in_(user_ids)))
    for p in db.scalars(select(Project).where(Project.org_id == org.id)).all():
        db.delete(p)          # Revisionen fallen mit (cascade)
    db.execute(delete(OrgSetting).where(OrgSetting.org_id == org.id))
    db.execute(delete(Invite).where(Invite.org_id == org.id))
    db.execute(delete(AuditLog).where(AuditLog.org_id == org.id))
    db.execute(delete(User).where(User.org_id == org.id))
    db.delete(org)
    db.commit()


@router.delete("/org", status_code=204)
def delete_org(body: OrgDelete, request: Request, response: Response,
               user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Die ganze Organisation löschen: Passwort und der Name der Organisation
    als Bestätigung. Danach ist niemand mehr angemeldet."""
    _check_password(user, body.password)
    if body.confirm.strip() != user.org.name:
        raise HTTPException(status_code=422, detail="Zur Bestätigung den Namen der Organisation genau so eingeben, wie er angezeigt wird.")
    org = user.org
    _delete_org(db, org)
    response.delete_cookie(COOKIE, path="/")
    return Response(status_code=204)


# ── Eigenes Konto ─────────────────────────────────────────────────────

@router.get("/auth/sessions")
def list_sessions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    cur = request.cookies.get(COOKIE)
    rows = db.scalars(select(AuthSession).where(AuthSession.user_id == user.id).order_by(AuthSession.created_at.desc())).all()
    return [{"id": s.id, "created_at": iso(s.created_at), "expires_at": iso(s.expires_at),
             "current": s.token == cur} for s in rows]


@router.post("/auth/sessions/revoke-others")
def revoke_other_sessions(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Alle anderen Geräte abmelden; diese Sitzung bleibt."""
    cur = request.cookies.get(COOKIE)
    n = db.execute(delete(AuthSession).where(AuthSession.user_id == user.id, AuthSession.token != cur)).rowcount
    db.commit()
    audit.record(db, "sessions.revoke", user=user, request=request, detail={"beendet": n})
    return {"revoked": n}


@router.delete("/auth/me", status_code=204)
def delete_me(body: PasswordConfirm, request: Request, response: Response,
              user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Das eigene Konto löschen. Ist es das einzige der Organisation, geht die
    Organisation mit allem, was ihr gehört; sonst bleibt alles der
    Organisation, nur die Person verschwindet (ihre Projekte und Revisionen
    behalten die Adresse im Protokoll, der Verweis wird leer). Der letzte
    aktive Admin einer Organisation mit weiteren Mitgliedern muss vorher
    einen Nachfolger ernennen."""
    _check_password(user, body.password)
    org = user.org
    others = db.scalars(select(User).where(User.org_id == org.id, User.id != user.id)).all()
    if not others:
        audit.record(db, "account.delete", user=user, request=request, detail={"mit_organisation": True})
        _delete_org(db, org)
        response.delete_cookie(COOKIE, path="/")
        return Response(status_code=204)
    if user.role == "admin" and not any(u.role == "admin" and not u.disabled for u in others):
        raise HTTPException(status_code=400, detail="Das ist der letzte aktive Administrator der Organisation. Erst ein anderes Mitglied zum Administrator machen (oder die ganze Organisation löschen).")
    audit.record(db, "account.delete", user=user, request=request, detail={"mit_organisation": False})
    db.execute(update(Project).where(Project.created_by == user.id).values(created_by=None))
    db.execute(update(ProjectRevision).where(ProjectRevision.created_by == user.id).values(created_by=None))
    db.execute(update(OrgSetting).where(OrgSetting.updated_by == user.id).values(updated_by=None))
    db.execute(update(Invite).where(Invite.created_by == user.id).values(created_by=None))
    db.execute(update(AuditLog).where(AuditLog.user_id == user.id).values(user_id=None))
    db.execute(delete(AuthSession).where(AuthSession.user_id == user.id))
    db.execute(delete(PasswordReset).where(PasswordReset.user_id == user.id))
    db.delete(user)
    db.commit()
    response.delete_cookie(COOKIE, path="/")
    return Response(status_code=204)


@router.post("/org/members/{user_id}/role")
def set_role(user_id: str, body: OrgIn, request: Request, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Rolle eines Mitglieds setzen (admin | member). `name` trägt die Rolle,
    damit das Schema klein bleibt."""
    role = body.name.strip()
    if role not in ("admin", "member"):
        raise HTTPException(status_code=422, detail="Rolle muss admin oder member sein.")
    target = db.get(User, user_id)
    if not target or target.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Benutzer nicht gefunden.")
    if target.id == user.id and role != "admin":
        raise HTTPException(status_code=400, detail="Die eigene Admin-Rolle kann nur ein anderer Administrator entziehen.")
    target.role = role
    db.commit()
    audit.record(db, "member.role", user=user, request=request, target=target.email, detail={"rolle": role})
    return user_out(target)


# ── Protokoll ─────────────────────────────────────────────────────────

@router.get("/org/audit")
def list_audit(limit: int = 200, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    limit = max(1, min(limit, 1000))
    rows = db.scalars(select(AuditLog).where(AuditLog.org_id == user.org_id)
                      .order_by(AuditLog.at.desc()).limit(limit)).all()
    return [audit.out(r) for r in rows]


# me_out wird von der Konto-Seite nach Rollenwechsel gebraucht
__all__ = ["router", "me_out"]
