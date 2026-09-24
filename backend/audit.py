"""Änderungsprotokoll: wer hat wann was getan, je Organisation.

Eine Zeile je Ereignis (Anmeldung, Einladung, Passwort, Projekt angelegt
oder archiviert, Revision, Stammdaten, Export, Löschung). Für Firmenkunden
die übliche Frage „wer hat das geändert?", und für den Betreiber die Spur,
wenn etwas verschwunden ist. Das Protokoll gehört der Organisation; ein
gelöschtes Konto bleibt mit seiner Adresse im Text stehen (actor_email),
der Verweis auf den Benutzer wird leer.

record() wirft nie: ein Fehler beim Protokollieren darf den eigentlichen
Vorgang nicht abbrechen.
"""

from __future__ import annotations

import logging

from fastapi import Request
from sqlalchemy.orm import Session

from .db import AuditLog, User, iso

log = logging.getLogger("uvicorn.error")


def _ip(request: Request | None) -> str | None:
    if request is None:
        return None
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()[:64]
    return (request.client.host if request.client else None)


def record(db: Session, action: str, *, org_id: str | None = None, user: User | None = None,
           request: Request | None = None, target: str = "", detail: dict | None = None,
           commit: bool = True) -> None:
    """Ein Ereignis festhalten. org_id fällt auf die Organisation des
    Benutzers zurück; ohne beides wird nichts geschrieben."""
    try:
        oid = org_id or (user.org_id if user else None)
        if not oid:
            return
        db.add(AuditLog(org_id=oid, user_id=user.id if user else None,
                        actor_email=user.email if user else "", action=action[:64],
                        target=(target or "")[:200], detail=detail or {}, ip=_ip(request)))
        if commit:
            db.commit()
    except Exception:
        db.rollback()
        log.exception("Audit-Eintrag %s konnte nicht geschrieben werden.", action)


def out(row: AuditLog) -> dict:
    return {"id": row.id, "at": iso(row.at), "actor": row.actor_email, "action": row.action,
            "target": row.target, "detail": row.detail or {}, "ip": row.ip}
