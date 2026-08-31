"""Stammdaten der Organisation: Maschinen-, Legierungs- und Bauteiltyp-Presets
sowie Kosten & Sätze (Legierungspreis, Strompreis, Stundensätze …).

Jede Organisation pflegt ihre eigenen Listen; solange ein Schlüssel fehlt,
gelten die Beispielwerte aus web/shared/examples/*.js. Lesen dürfen alle
Mitglieder, schreiben nur Administratoren.
"""

from __future__ import annotations

import json
import math
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import admin_user, current_user
from .db import OrgSetting, User, get_db, iso, now
from .projects import json_safe

router = APIRouter(prefix="/api/org/settings", tags=["org-settings"])

LIST_KEYS = ("machines", "alloys", "parts")
KEYS = LIST_KEYS + ("kosten",)
MAX_ITEMS = 200
MAX_BYTES = 200_000
ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


class SettingIn(BaseModel):
    data: dict | list


def _num_fields(fields, where: str) -> dict:
    if not isinstance(fields, dict):
        raise HTTPException(status_code=422, detail=f"{where}: 'fields' muss ein Objekt sein.")
    out = {}
    for k, v in fields.items():
        if not isinstance(k, str) or not re.match(r"^[A-Za-z][A-Za-z0-9]{0,31}$", k):
            raise HTTPException(status_code=422, detail=f"{where}: ungültiger Feldschlüssel '{k}'.")
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise HTTPException(status_code=422, detail=f"{where}: Feld '{k}' muss eine Zahl sein.")
        # NaN/Infinity sind float und kämen hier durch. Gespeichert machen sie
        # den Lese-Endpunkt dauerhaft zu einem 500er (JSONResponse schreibt
        # sie nicht) — siehe projects._reject_non_finite.
        if not math.isfinite(v):
            raise HTTPException(status_code=422,
                                detail=f"{where}: Feld '{k}' ist keine gültige JSON-Zahl (NaN/Infinity).")
        out[k] = v
    return out


def clean_setting(key: str, data) -> dict | list:
    """Struktur prüfen und auf das Nötige reduzieren."""
    if key in LIST_KEYS:
        if not isinstance(data, list):
            raise HTTPException(status_code=422, detail=f"'{key}' muss eine Liste sein.")
        if len(data) > MAX_ITEMS:
            raise HTTPException(status_code=422, detail=f"Höchstens {MAX_ITEMS} Einträge.")
        out, ids = [], set()
        for i, item in enumerate(data):
            where = f"{key}[{i}]"
            if not isinstance(item, dict):
                raise HTTPException(status_code=422, detail=f"{where}: Eintrag muss ein Objekt sein.")
            pid, name = item.get("id"), item.get("name")
            if not isinstance(pid, str) or not ID_RE.match(pid):
                raise HTTPException(status_code=422, detail=f"{where}: ungültige id '{pid}' (a-z, 0-9, -, _).")
            if pid in ids:
                raise HTTPException(status_code=422, detail=f"{where}: id '{pid}' doppelt.")
            if not isinstance(name, str) or not name.strip() or len(name) > 120:
                raise HTTPException(status_code=422, detail=f"{where}: Name fehlt oder zu lang.")
            ids.add(pid)
            out.append({"id": pid, "name": name.strip(), "fields": _num_fields(item.get("fields", {}), where)})
        cleaned = out
    elif key == "kosten":
        if not isinstance(data, dict):
            raise HTTPException(status_code=422, detail="'kosten' muss ein Objekt sein.")
        cleaned = _num_fields(data, "kosten")
    else:
        raise HTTPException(status_code=404, detail="Unbekannter Einstellungsschlüssel.")
    if len(json.dumps(cleaned)) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Einstellung zu groß.")
    return cleaned


def _out(row: OrgSetting) -> dict:
    # json_safe: bereits gespeicherte NaN/Infinity beim Lesen zu null machen,
    # damit eine einmal verdorbene Zeile den Endpunkt nicht dauerhaft blockiert.
    return {"key": row.key, "data": json_safe(row.data), "updated_at": iso(row.updated_at)}


@router.get("")
def get_settings(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(OrgSetting).where(OrgSetting.org_id == user.org_id)).all()
    return {r.key: _out(r) for r in rows}


@router.put("/{key}")
def put_setting(key: str, body: SettingIn, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    data = clean_setting(key, body.data)
    row = db.scalar(select(OrgSetting).where(OrgSetting.org_id == user.org_id, OrgSetting.key == key))
    if not row:
        row = OrgSetting(org_id=user.org_id, key=key, data=data)
        db.add(row)
    row.data, row.updated_by, row.updated_at = data, user.id, now()
    db.commit()
    db.refresh(row)
    return _out(row)


@router.delete("/{key}", status_code=204)
def delete_setting(key: str, user: User = Depends(admin_user), db: Session = Depends(get_db)):
    """Zurück auf die Beispielwerte: Schlüssel entfernen."""
    if key not in KEYS:
        raise HTTPException(status_code=404, detail="Unbekannter Einstellungsschlüssel.")
    row = db.scalar(select(OrgSetting).where(OrgSetting.org_id == user.org_id, OrgSetting.key == key))
    if row:
        db.delete(row)
        db.commit()
    from fastapi import Response
    return Response(status_code=204)
