# DieLogic Backend

FastAPI-Backend: liefert die statische Website (`../site/`) aus und stellt
unter `/api/…` die serverseitige Simulation mit
[`hpdcsim`](../packages/hpdcsim) bereit. Phase 1 — noch ohne Benutzer/Abrechnung
(dafür vorgesehen: `auth.py`, `presets.py`, `billing.py`).

## Setup & Start

```bash
cd dielogic
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/pip install -e ./packages/hpdcsim
.venv/bin/uvicorn backend.app:app --reload
```

→ http://127.0.0.1:8000/ ist die Website, das Dashboard unter
`/app/index.html` zeigt den simulierten Luftdruck auf der zweiten Achse der Schusskurve. Ohne laufendes
Backend (statisches Hosting) entfällt nur diese Serie mit einem Hinweis — alles
andere rechnet weiter im Browser.

## API

- `GET /api/health` — Lebenszeichen.
- `POST /api/sim/shot` — Body:

  ```json
  {
    "values": { "part": 12, "runner": 3, "overflow": 2, "biscuit": 1.2,
                "density": 2700, "diam": 150, "length": 700,
                "gate": 1800, "vent": 800, "Tcast": 660 },
    "curve": [[60, 0.4], [318, 0.4], [470, 4], [675, 4]],
    "count": 400,
    "process": {"dosing_time": 4.0, "dwell_time": 1.0},
    "vacuum": {"model": "ideal", "pump_mbar": 80,
                "valve_mm2": 100, "start_mm": 150}
  }
  ```

  `values`/`curve` sind 1:1 der Dashboard-Zustand (Browser-Einheiten:
  mm, kg, °C); `process` und `vacuum` sind optional. `vacuum` kommt
  ebenfalls in Browser-Einheiten (`model`: `ideal` | `conductance` |
  `aus`, `pump_mbar`, `valve_mm2`, `start_mm`) und wird in `convert.py`
  ins SI-Schema von hpdcsim übersetzt; beim `conductance`-Modell wirken
  zusätzlich die Entlüftungsfläche (`values.vent` → `casting.vent_area`)
  und der Einguss als Drosselquerschnitte. Antwort: `meta`
  (φ, Füllende-Hub, Pressrestlänge, ob die Kurve gekappt wurde), `samples`
  über die Schussphase (t, s_mm, v, gate_v, p_air_mbar, T_melt, part_fill),
  `events` (Einguss dicht, Kammer voll, …) und `critical_crossing`
  (erste Überschreitung der kritischen Geschwindigkeit nach Garber/López).

## Aufbau

| Datei | Inhalt |
|---|---|
| `app.py` | FastAPI-App: API-Router + statische Website |
| `sim.py` | dünne HTTP-Schicht (`/api/sim/shot`, Pydantic-Validierung) |
| `core.py` | löst den hpdcsim-Prozess, tastet die Schussphase ab, JSON-tauglich (NaN/Inf → null) |
| `convert.py` | Einheiten-Übersetzung Browser ↔ SI, Füllgrad, Kurven-Kappung am Füllende-Hub — ohne Web-Abhängigkeiten testbar |

Wissenswertes zur Übersetzung (`convert.py`):

- Volumina aus Massen/Dichte wie im Dashboard; φ = V_dose/(A·L).
- hpdcsim verweigert Profile, die über den Füllende-Hub (L − Pressrest)
  hinausfahren — die Schusskurve wird dort gekappt (`meta.curve_clamped`).
- Ohne eigene Felder gesetzt: Eingusslage 0,2·L, c_p = 1050 J/(kg·K),
  Dosierzeit 4 s, Beruhigungszeit 1 s.

## Schnelltest ohne Server

```bash
PYTHONPATH=packages/hpdcsim python3 -c "
from backend.core import run_shot_simulation
print(run_shot_simulation({'part':12,'runner':3,'overflow':2,'biscuit':1.2,
  'density':2700,'diam':150,'length':700,'gate':1800},
  [[60,.4],[318,.4],[470,4],[675,4]])['meta'])"
```
