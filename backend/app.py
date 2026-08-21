"""DieLogic-Backend: API (/api/…: Simulation, Anmeldung, Projekte) + Auslieferung der statischen Website (site/).

Starten (aus dem Ordner dielogic/):
    .venv/bin/uvicorn backend.app:app --reload
"""

import re
from pathlib import Path, PurePosixPath

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .auth import bootstrap_from_env, router as auth_router
from .db import SessionLocal, init_db
from .orgsettings import router as orgsettings_router
from .projects import router as projects_router
from .sim import router as sim_router

SITE_DIR = Path(__file__).resolve().parent.parent / "site"

def site_version() -> str:
    """Einzige Quelle: site/version.js (window.__DL_VERSION__ = '…')."""
    m = re.search(r"__DL_VERSION__\s*=\s*'([^']+)'", (SITE_DIR / "version.js").read_text())
    return m.group(1) if m else "0"


VERSION = site_version()
app = FastAPI(title="DieLogic Backend", version=VERSION)
app.include_router(sim_router)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(orgsettings_router)


@app.on_event("startup")
def _startup():
    """Schema anlegen (create_all ist idempotent) und ggf. den ersten Admin
    per Umgebungsvariablen einladen — siehe auth.bootstrap_from_env."""
    init_db()
    with SessionLocal() as db:
        bootstrap_from_env(db)

# Ohne Cache-Control raten Browser die Frischedauer aus Last-Modified
# (heuristisches Caching) und zeigen nach einem Deploy tagelang alte
# Seiten. HTML/JS/CSS daher immer revalidieren (per ETag → billige 304),
# selten geänderte Assets dürfen eine Stunde aus dem Cache kommen.
ASSET_SUFFIXES = {".png", ".ico", ".svg", ".webmanifest", ".stl", ".woff", ".woff2"}


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if not path.startswith("/api/"):
        if PurePosixPath(path).suffix.lower() in ASSET_SUFFIXES:
            response.headers["Cache-Control"] = "public, max-age=3600"
        else:
            response.headers["Cache-Control"] = "no-cache"
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


# Zuletzt mounten, damit /api/… Vorrang hat. html=True liefert index.html aus.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
