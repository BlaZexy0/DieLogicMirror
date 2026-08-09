"""DieLogic-Backend: API (/api/…) + Auslieferung der statischen Website (site/).

Starten (aus dem Ordner dielogic/):
    .venv/bin/uvicorn backend.app:app --reload
"""

from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .sim import router as sim_router

SITE_DIR = Path(__file__).resolve().parent.parent / "site"

app = FastAPI(title="DieLogic Backend", version="0.1.0")
app.include_router(sim_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Zuletzt mounten, damit /api/… Vorrang hat. html=True liefert index.html aus.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
