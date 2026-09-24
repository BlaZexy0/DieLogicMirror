"""Projekte: ein Bauteil/Auftrag (z. B. „DieCastPartA") mit Beschreibung und
allen Werkzeug-Abschnitten (design, geometry, cycle, cost) als JSON-Dokument.

Der Arbeitsstand (draft) wird vom Client laufend synchronisiert — die
Datenbank ist die Quelle, der Browser nur Cache. Eine Revision ist ein
benannter, unveränderlicher Schnappschuss; der Projektkopf zeigt auf die
jüngste (head_rev). Alle Zugriffe sind auf die Organisation des angemeldeten
Benutzers beschränkt.
"""

from __future__ import annotations

import json
import math

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .auth import current_user
from .db import Project, ProjectRevision, User, get_db, iso, now

router = APIRouter(prefix="/api/projects", tags=["projects"])

MAX_DATA_BYTES = 1_000_000
SECTIONS = ("design", "geometry", "cycle", "cost")


class ProjectIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=5000)
    customer: str = Field("", max_length=200)
    part_no: str = Field("", max_length=100)


class ProjectCreate(ProjectIn):
    data: dict | None = None
    note: str = Field("", max_length=500)
    # Idempotenz-Schlüssel: die stabile lokale id des Clients. Geht die Antwort
    # verloren (Tab schließt, Reload), legt der nächste Versuch damit kein
    # zweites Projekt an.
    id: str | None = Field(None, pattern=r"^[A-Za-z0-9_-]{4,32}$")


class RevisionIn(BaseModel):
    data: dict
    note: str = Field("", max_length=500)


class DraftIn(BaseModel):
    data: dict
    # Optimistische Sperre: der Draft-Stempel, auf dem der Client arbeitet.
    # None = kein Anspruch: beim allerersten Push eines Projekts (noch kein
    # draftAt bekannt) — ein normaler, laufend genutzter Pfad, nicht nur
    # ein Fall für ältere Clients (shared/projectbar.js: push()).
    base_draft_at: str | None = None


def _reject_non_finite(value, where: str) -> None:
    """NaN und Infinity rekursiv ablehnen.

    Python nimmt die Literale beim Lesen an, ``JSONResponse`` verweigert sie
    beim Schreiben (``allow_nan=False``). Eine einmal gespeicherte NaN macht
    damit jeden späteren GET dauerhaft zu einem 500er — die Zeile ist
    committet, der Endpunkt für dieses Projekt für immer kaputt. Kein Browser
    erzeugt so etwas (``JSON.stringify`` kann es nicht), jeder andere Client
    schon."""
    if isinstance(value, float) and not math.isfinite(value):
        raise HTTPException(status_code=422,
                            detail=f"{where}: {value} ist keine gültige JSON-Zahl (NaN/Infinity).")
    if isinstance(value, dict):
        for k, v in value.items():
            _reject_non_finite(v, f"{where}.{k}")
    elif isinstance(value, list):
        for i, v in enumerate(value):
            _reject_non_finite(v, f"{where}[{i}]")


def json_safe(value):
    """Bereits gespeicherte NaN/Infinity beim LESEN zu ``null`` entschärfen —
    sonst bliebe ein Projekt, in das einmal so ein Wert gelangt ist, für immer
    unlesbar. Neue Schreibvorgänge fängt ``_reject_non_finite`` vorher ab."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, dict):
        return {k: json_safe(v) for k, v in value.items()}
    if isinstance(value, list):
        return [json_safe(v) for v in value]
    return value


def _check_data(data: dict) -> dict:
    """Die bekannten Abschnitte übernehmen, Größe begrenzen. Die fachliche
    Prüfung der Inhalte macht der Client beim Laden (applyData).

    Unbekannte Abschnitte sind ein Fehler des Aufrufers und kein Anlass,
    Daten wegzuwerfen: sie stumm zu verwerfen und 200 zu antworten hieße,
    dass das nächste Werkzeug mit einem eigenen Abschnitt seine Arbeit
    unbemerkt verliert."""
    unknown = sorted(k for k in data if k not in SECTIONS)
    if unknown:
        raise HTTPException(
            status_code=422,
            detail="Unbekannte Abschnitte: " + ", ".join(unknown[:5])
                   + " — erlaubt sind: " + ", ".join(SECTIONS) + ".")
    clean = {}
    for key in SECTIONS:
        value = data.get(key)
        if value is None:
            continue
        if not isinstance(value, dict):
            raise HTTPException(status_code=422, detail=f"Abschnitt '{key}' muss ein Objekt sein.")
        _reject_non_finite(value, f"Abschnitt '{key}'")
        clean[key] = value
    if len(json.dumps(clean)) > MAX_DATA_BYTES:
        raise HTTPException(status_code=413, detail="Projektdaten zu groß (max. 1 MB).")
    return clean


def _project_out(p: Project) -> dict:
    return {
        "id": p.id, "name": p.name, "description": p.description,
        "customer": p.customer, "part_no": p.part_no, "rev": p.head_rev,
        "created_at": iso(p.created_at), "updated_at": iso(p.updated_at),
        "draft_at": iso(p.draft_at),
    }


def _revision_out(r: ProjectRevision, with_data: bool) -> dict:
    out = {"rev": r.rev, "note": r.note, "created_at": iso(r.created_at),
           "author": {"id": r.author.id, "name": r.author.name, "email": r.author.email} if r.author else None}
    if with_data:
        out["data"] = json_safe(r.data)
    return out


def _get_project(db: Session, user: User, project_id: str) -> Project:
    p = db.get(Project, project_id)
    if not p or p.org_id != user.org_id or p.archived_at is not None:
        raise HTTPException(status_code=404, detail="Projekt nicht gefunden.")
    return p


REV_ATTEMPTS = 5


def _add_revision(db: Session, p: Project, user: User, data: dict, note: str) -> ProjectRevision:
    """Revision anlegen und den Draft auf denselben Stand setzen.

    ``head_rev += 1`` ist ein Read-Modify-Write ohne Sperre. Zwei „Revision
    anlegen" in derselben Sekunde liefen bisher in einen unbehandelten
    ``IntegrityError`` (HTTP 500) — der benannte Schnappschuss war weg.
    Gemessen: 6 gleichzeitige Aufrufe, 2 angelegt, 4 Abstürze.

    Die Wahrheit ist der Unique-Index ``(project_id, rev)``. Bei einer
    Kollision wird der Stand neu gelesen und der Versuch wiederholt; das
    ``with_for_update`` serialisiert zusätzlich auf Postgres (SQLite ignoriert
    es und verlässt sich auf den Retry)."""
    for attempt in range(REV_ATTEMPTS):
        try:
            head = db.execute(select(Project.head_rev).where(Project.id == p.id)
                              .with_for_update()).scalar_one()
            nxt = head + 1
            rev = ProjectRevision(project_id=p.id, rev=nxt, data=data,
                                  note=note.strip(), created_by=user.id)
            db.add(rev)
            p.head_rev = nxt
            p.draft, p.draft_at = data, now()
            p.updated_at = now()
            db.commit()
            db.refresh(rev)
            return rev
        except IntegrityError:
            db.rollback()
            if attempt == REV_ATTEMPTS - 1:
                raise HTTPException(
                    status_code=409,
                    detail="Es wird gerade eine andere Revision angelegt — bitte erneut versuchen.")
    raise AssertionError("unerreichbar")


@router.get("")
def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Project).where(Project.org_id == user.org_id, Project.archived_at.is_(None))
                      .order_by(Project.updated_at.desc())).all()
    return [_project_out(p) for p in rows]


@router.post("", status_code=201)
def create_project(body: ProjectCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Projekt anlegen. Schickt der Client eine ``id`` mit, ist der Aufruf
    idempotent: dieselbe id liefert dasselbe Projekt statt eines zweiten.
    Eine id, die in einer fremden Organisation liegt, wird ignoriert (der
    Server vergibt dann eine eigene) — sie darf nichts über fremde
    Bestände verraten."""
    if body.id:
        exists = db.get(Project, body.id)
        if exists is not None and exists.org_id == user.org_id:
            # Ein archiviertes Projekt zurückzugeben hieße: der Client hält es
            # für gespeichert, während es in keiner Liste mehr auftaucht.
            if exists.archived_at is not None:
                raise HTTPException(status_code=409,
                                    detail="Dieses Projekt ist archiviert und kann nicht neu angelegt werden.")
            return _project_out(exists)
    # Erst prüfen, dann anlegen — eine abgelehnte Anfrage darf kein
    # Geisterprojekt hinterlassen.
    draft = _check_data(body.data) if body.data is not None else None
    p = Project(org_id=user.org_id, name=body.name.strip(), description=body.description,
                customer=body.customer, part_no=body.part_no, created_by=user.id)
    if body.id and db.get(Project, body.id) is None:
        p.id = body.id
    if draft is not None:
        p.draft = draft
        p.draft_at = now()
    db.add(p)
    db.commit()
    db.refresh(p)
    return _project_out(p)


@router.get("/{project_id}")
def get_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get_project(db, user, project_id)
    head = db.scalar(select(ProjectRevision).where(ProjectRevision.project_id == p.id,
                                                   ProjectRevision.rev == p.head_rev))
    out = _project_out(p)
    # Arbeitsstand vor letzter Revision — der Client arbeitet immer auf dem Draft.
    out["data"] = json_safe(p.draft if p.draft is not None else (head.data if head else None))
    out["head"] = _revision_out(head, False) if head else None
    return out


@router.put("/{project_id}")
def update_project(project_id: str, body: ProjectIn, user: User = Depends(current_user),
                   db: Session = Depends(get_db)):
    p = _get_project(db, user, project_id)
    p.name, p.description = body.name.strip(), body.description
    p.customer, p.part_no = body.customer, body.part_no
    p.updated_at = now()
    db.commit()
    return _project_out(p)


@router.put("/{project_id}/draft")
def save_draft(project_id: str, body: DraftIn, user: User = Depends(current_user),
               db: Session = Depends(get_db)):
    """Arbeitsstand synchronisieren (Autosave) — keine Revision.

    Der Client schickt in ``base_draft_at`` den Stempel, auf dem er arbeitet.
    Weicht der vom Server ab, hat inzwischen jemand anders geschrieben: dann
    wird nicht überschrieben, sondern mit 409 abgelehnt. Ein Schreibvorgang,
    der nichts ändert, ist nie ein Konflikt — das fängt den Wiederholungs-
    versuch nach einem verlorenen Antwort-Paket ab."""
    p = _get_project(db, user, project_id)
    clean = _check_data(body.data)
    have, seen = iso(p.draft_at), p.draft_at
    if (body.base_draft_at is not None and have is not None
            and body.base_draft_at != have and p.draft != clean):
        raise HTTPException(status_code=409,
                            detail="Auf dem Server liegt ein neuerer Arbeitsstand.")

    # Prüfen und Schreiben müssen EIN Schritt sein. Getrennt lasen mehrere
    # gleichzeitige Anfragen denselben Stempel, bestanden alle die Prüfung
    # und schrieben nacheinander: gemessen kamen von zehn Versuchen mit
    # demselben base_draft_at drei durch statt einem. Das bedingte UPDATE
    # entscheidet in der Datenbank.
    stamp = now()
    stmt = update(Project).where(Project.id == p.id)
    if body.base_draft_at is not None:
        stmt = stmt.where(Project.draft_at.is_(None) if seen is None
                          else Project.draft_at == seen)
    res = db.execute(stmt.values(draft=clean, draft_at=stamp, updated_at=stamp))
    db.commit()
    db.expire(p)

    if res.rowcount == 0:
        # Jemand anders war schneller. Steht dort inzwischen genau derselbe
        # Stand, ist das kein Konflikt (verlorenes Antwort-Paket).
        if p.draft == clean:
            return {"draft_at": iso(p.draft_at), "updated_at": iso(p.updated_at)}
        raise HTTPException(status_code=409,
                            detail="Auf dem Server liegt ein neuerer Arbeitsstand.")
    return {"draft_at": iso(p.draft_at), "updated_at": iso(p.updated_at)}


@router.delete("/{project_id}", status_code=204)
def archive_project(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    """Archivieren statt löschen — Revisionen bleiben nachvollziehbar."""
    p = _get_project(db, user, project_id)
    p.archived_at = now()
    db.commit()
    return Response(status_code=204)


@router.get("/{project_id}/revisions")
def list_revisions(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    p = _get_project(db, user, project_id)
    rows = db.scalars(select(ProjectRevision).where(ProjectRevision.project_id == p.id)
                      .order_by(ProjectRevision.rev.desc())).all()
    return [_revision_out(r, False) for r in rows]


@router.post("/{project_id}/revisions", status_code=201)
def save_revision(project_id: str, body: RevisionIn, user: User = Depends(current_user),
                  db: Session = Depends(get_db)):
    p = _get_project(db, user, project_id)
    data = _check_data(body.data)
    rev = _add_revision(db, p, user, data, body.note)
    return _revision_out(rev, False)


@router.get("/{project_id}/revisions/{rev}")
def get_revision(project_id: str, rev: int, user: User = Depends(current_user),
                 db: Session = Depends(get_db)):
    p = _get_project(db, user, project_id)
    r = db.scalar(select(ProjectRevision).where(ProjectRevision.project_id == p.id, ProjectRevision.rev == rev))
    if not r:
        raise HTTPException(status_code=404, detail="Revision nicht gefunden.")
    return _revision_out(r, True)
