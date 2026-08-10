"""DieLogic-Backend: API (/api/…) + Auslieferung der statischen Website (site/).

Starten (aus dem Ordner dielogic/):
    .venv/bin/uvicorn backend.app:app --reload
"""

from pathlib import Path, PurePosixPath

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles

from .sim import router as sim_router

SITE_DIR = Path(__file__).resolve().parent.parent / "site"

app = FastAPI(title="DieLogic Backend", version="0.1.0")
app.include_router(sim_router)

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
    return {"status": "ok"}


# Zuletzt mounten, damit /api/… Vorrang hat. html=True liefert index.html aus.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
