#!/usr/bin/env python3
"""Die Site lokal ausliefern — ohne dass der Browser alte Dateien behält.

    npm run serve            →  http://127.0.0.1:8765/
    python3 scripts/serve.py 9000

Warum nicht einfach `python3 -m http.server`: der schickt nur Last-Modified
und kein Cache-Control. Browser raten dann die Frischedauer (heuristisches
Caching, rund ein Zehntel des Dateialters) und holen ein ES-Modul beim
normalen Aufruf einer Seite NICHT neu. Wird gerade entwickelt, läuft im
Browser eine Mischung aus alten und neuen Modulen — mit Fehlern, die es im
Code nicht gibt. Das Backend setzt für HTML/JS/CSS deshalb `no-cache`
(backend/app.py, cache_headers); dieser Server tut lokal dasselbe, nur
strenger: `no-store`.

Ohne Backend: /api/… gibt es hier nicht (404) — die Kopfleiste zeigt dann
„Anmelden", die Werkzeuge rechnen trotzdem. Für Konto und Projekte das
Backend starten (backend/README.md).
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent / "web"


class NoStore(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        # Nur Fehler — die Modulflut einer Seite macht die Konsole sonst unlesbar.
        if len(args) >= 2 and str(args[1]).startswith(("4", "5")) and "/api/" not in str(args[0]):
            super().log_message(fmt, *args)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(NoStore, directory=str(SITE)))
    print(f"DieLogic lokal: http://127.0.0.1:{port}/   (3D-Studio: /tools/3d-studio/)   Strg+C beendet")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()


if __name__ == "__main__":
    main()
