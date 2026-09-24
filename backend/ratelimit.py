"""Schutz vor Passwort-Raten und Massenanfragen: gleitende Fenster je
Schlüssel (Adresse des Aufrufers, E-Mail-Adresse), im Speicher des
Prozesses.

Für einen einzelnen Dienst (Render: ein Prozess) reicht das; mit mehreren
Instanzen zählte jede für sich, der Schutz wäre dann um den Faktor der
Instanzen schwächer, nie ganz weg. Ein Neustart leert die Zähler.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request

_hits: dict[str, deque] = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request) -> str:
    """Hinter dem Proxy steht die Adresse des Aufrufers in X-Forwarded-For
    (erster Eintrag); sonst die der Verbindung."""
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "?"


def check(key: str, limit: int, window_s: int) -> None:
    """Den Aufruf zählen; bei mehr als `limit` in `window_s` Sekunden 429."""
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and q[0] <= now - window_s:
            q.popleft()
        if len(q) >= limit:
            retry = int(q[0] + window_s - now) + 1
            minutes = max(1, -(-retry // 60))
            raise HTTPException(status_code=429,
                                detail=f"Zu viele Versuche. Bitte in {minutes} Minute(n) erneut.",
                                headers={"Retry-After": str(retry)})
        q.append(now)


def clear() -> None:
    with _lock:
        _hits.clear()
