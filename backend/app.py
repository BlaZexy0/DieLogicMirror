"""DieLogic-Backend: API (/api/…: Anmeldung, Projekte, Stammdaten) + Auslieferung der statischen Website (web/).

Starten (aus dem Ordner dielogic/):
    .venv/bin/uvicorn backend.app:app --reload
"""

import logging
import os
import re
from pathlib import Path, PurePosixPath

from contextlib import asynccontextmanager
from urllib.parse import quote

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .auth import bootstrap_demo, bootstrap_from_env, optional_user, request_is_https, router as auth_router
from .db import SessionLocal, init_db
from .orgsettings import router as orgsettings_router
from .projects import router as projects_router

log = logging.getLogger("uvicorn.error")

SITE_DIR = Path(__file__).resolve().parent.parent / "web"

def site_version() -> str:
    """Einzige Quelle: web/shared/version.js (window.__DL_VERSION__ = '…')."""
    m = re.search(r"__DL_VERSION__\s*=\s*'([^']+)'", (SITE_DIR / "shared" / "version.js").read_text())
    return m.group(1) if m else "0"


VERSION = site_version()

# Der Schema-Explorer ist ein Entwicklungswerkzeug: er listet jeden Endpunkt
# samt Feldern und lädt zum Ausprobieren ein. In Produktion bleibt er zu,
# solange ihn niemand ausdrücklich einschaltet.
DOCS = os.environ.get("DIELOGIC_DOCS", "").strip() not in ("", "0", "false", "no")

@asynccontextmanager
async def _lifespan(_app):
    # Start über lifespan: @app.on_event ist in FastAPI veraltet, und die
    # Version ist nicht festgelegt (requirements.txt: >=0.110). Fiele es weg,
    # liefen Schema und Bootstrap still nicht mehr an.
    _startup()
    yield


app = FastAPI(title="DieLogic Backend", version=VERSION, lifespan=_lifespan,
              docs_url="/docs" if DOCS else None,
              redoc_url="/redoc" if DOCS else None,
              openapi_url="/openapi.json" if DOCS else None)
app.include_router(auth_router)
app.include_router(projects_router)
app.include_router(orgsettings_router)


def _startup():
    """Schema anlegen (create_all ist idempotent) und ggf. den ersten Admin
    per Umgebungsvariablen einladen — siehe auth.bootstrap_from_env.

    Der Bootstrap ist eine Bequemlichkeit für den ersten Start, kein Teil des
    Dienstes: eine Fehlkonfiguration (z. B. ein Tippfehler in
    DIELOGIC_ADMIN_EMAIL) darf nicht die ganze Site abschalten — vorher warf
    create_invite einen ValueError bis in den uvicorn-Start hinauf und der
    verweigerte den Dienst samt aller rein statischen Seiten."""
    init_db()
    with SessionLocal() as db:
        for step in (bootstrap_from_env, bootstrap_demo):
            try:
                step(db)
            except Exception:
                db.rollback()
                log.exception("%s fehlgeschlagen — die Site startet trotzdem, "
                              "aber ohne diesen Schritt. Konfiguration prüfen.", step.__name__)

# Ohne Cache-Control raten Browser die Frischedauer aus Last-Modified
# (heuristisches Caching) und zeigen nach einem Deploy tagelang alte
# Seiten. HTML/JS/CSS daher immer revalidieren (per ETag → billige 304),
# selten geänderte Assets dürfen eine Stunde aus dem Cache kommen.
ASSET_SUFFIXES = {".png", ".ico", ".svg", ".webmanifest", ".stl", ".woff", ".woff2"}


# Sicherheits-Header. Es gab bisher keine — kein CSP, keine Referrer-Policy,
# kein nosniff, kein X-Frame-Options.
#
# script-src/style-src brauchen 'unsafe-inline': die Seiten tragen ihre Logik
# und ihr CSS in <script>- und <style>-Blöcken (und einem onload-Attribut auf
# der Theorieseite). Das ist die ehrliche Fassung — sie sperrt fremde
# Herkünfte aus, ohne so zu tun, als gäbe es keine Inline-Skripte. Alles
# Externe ist ohnehin mitgeliefert (KaTeX unter /shared/vendor/), deshalb
# reicht überall 'self'.
#
# 'wasm-unsafe-eval' kam mit dem Metamodell der Kammerfüllung dazu
# (onnxruntime-web unter /tools/3d-studio/vendor/): OHNE das Schlüsselwort
# lehnen Chrome UND Firefox jedes WebAssembly.instantiate() ab
# ("blocked by CSP"), und das Verfahren scheitert beim ersten Lauf. Es
# erlaubt genau das Übersetzen von WebAssembly — nicht eval() von
# JavaScript ('unsafe-eval' wäre das und bleibt draußen); woher die Bytes
# kommen dürfen, regelt weiter 'self'.
#
# Referrer-Policy ist hier nicht Kosmetik: der Einladungslink trägt sein
# Token in der Adresszeile; ohne die Regel stünde es im Referrer jeder
# fremden Seite, die von dort aus geöffnet wird.
CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

SECURITY_HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",          # für Browser ohne frame-ancestors
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


# Obergrenze für den Rumpf einer Anfrage. MAX_DATA_BYTES in projects.py misst
# erst, was die Filterung überlebt hat — bis dahin ist der ganze Körper gelesen
# und als JSON geparst. Ein einzelner Aufruf konnte damit beliebig viel
# Speicher binden.
MAX_BODY_BYTES = 2_000_000


@app.middleware("http")
async def body_limit(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH"):
        declared = request.headers.get("content-length")
        if declared is not None:
            try:
                if int(declared) > MAX_BODY_BYTES:
                    return JSONResponse(status_code=413, content={
                        "detail": f"Anfrage zu groß (max. {MAX_BODY_BYTES // 1000} kB)."})
            except ValueError:
                return JSONResponse(status_code=400, content={"detail": "Ungültiger Content-Length-Kopf."})
    return await call_next(request)


# Die Werkzeugseiten (Dashboard, Sprengfläche, Teilekosten, Zyklus, 3D-Studio)
# gibt es nur mit Konto. Bisher prüfte das erst die Projektleiste im Browser:
# die Seite kam vollständig an, baute sich auf und sprang dann zur Anmeldung —
# das 3D-Studio fragte gar nicht. Jetzt entscheidet der Server vor der
# Auslieferung: ohne Sitzung geht das HTML nicht raus, sondern ein 302 auf die
# Konto-Seite, mit ?next= zurück ans Ziel (die Konto-Seite prüft, dass es auf
# dieser Site liegt). Gemeint sind nur die Seiten selbst (Verzeichnis oder
# .html); Skripte, Styles und Modelle darunter bleiben frei — die Konto- und
# die Theorieseiten laden Module aus /tools/auslegung/js/.
#
# Registriert VOR cache_headers: Starlette legt jede neue Middleware außen
# herum, so läuft die Umleitung noch durch cache_headers und trägt
# Cache-Control und die Sicherheits-Header wie jede andere Antwort.
LOGIN_ONLY = ("/tools/",)
PAGE_SUFFIXES = {"", ".html", ".htm"}


def needs_login(path: str) -> bool:
    return path.startswith(LOGIN_ONLY) and PurePosixPath(path).suffix.lower() in PAGE_SUFFIXES


def _has_session(request: Request) -> bool:
    with SessionLocal() as db:
        return optional_user(request, db) is not None


@app.middleware("http")
async def login_gate(request: Request, call_next):
    if request.method in ("GET", "HEAD") and needs_login(request.url.path):
        if not await run_in_threadpool(_has_session, request):
            target = request.url.path + ("?" + request.url.query if request.url.query else "")
            return RedirectResponse("/konto/?next=" + quote(target, safe=""), status_code=302)
    return await call_next(request)


@app.middleware("http")
async def cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    if not path.startswith("/api/"):
        if PurePosixPath(path).suffix.lower() in ASSET_SUFFIXES:
            response.headers["Cache-Control"] = "public, max-age=3600"
        else:
            response.headers["Cache-Control"] = "no-cache"
    else:
        # API-Antworten tragen Kontodaten — sie gehören in keinen Cache.
        response.headers.setdefault("Cache-Control", "no-store")
    for k, v in SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    # HSTS nur, wenn die Verbindung wirklich über TLS kam (hinter dem Proxy
    # steht das in X-Forwarded-Proto) — sonst sperrt man die lokale
    # Entwicklung über http aus.
    if request_is_https(request):
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response


@app.get("/api/health")
def health():
    return {"status": "ok", "version": VERSION}


# Zuletzt mounten, damit /api/… Vorrang hat. html=True liefert index.html aus.
app.mount("/", StaticFiles(directory=SITE_DIR, html=True), name="site")
