# Referenzfälle der Luftsimulation

Die Luftsimulation des Dashboards (`web/tools/auslegung/js/core/airsim/`)
rechnet im Browser. Bis September 2026 kam sie vom Server: das Python-Paket
`hpdcsim` hinter `POST /api/sim/shot`. Diese Dateien sind die Ergebnisse
jenes Pakets — mit ihnen bleibt die JavaScript-Fassung an der Referenz
festgehalten, auch nachdem das Paket aus dem Repository entfernt wurde.

Geprüft wird mit `node --test tests/web/airsim.test.mjs`: jede Reihe, jedes
Ereignis und jede Ablehnung, relativ auf 1e-8 (absolut 1e-12 nahe null).
Nichts ist gerundet.

## Vier Familien

| Muster | Inhalt |
|---|---|
| `<fixture>--<variante>.json` | die vier Physik-Fixtures (`fixtures/physics/`) × Vakuum-Modell (aus · ideal · conductance · tank) × Öffnung (Blende · Kanal) × Ventilschluss (fill · stroke · time) |
| `special--<name>.json` | Randfälle desselben Wegs: Abtastzahl, Kurvenformen, Strömungsbereiche |
| `invalid--<name>.json` | Eingaben, die die Referenz ablehnt, mit ihrer Meldung |
| `layer--<name>.json` | Konfigurationen, die das Dashboard nicht erzeugen kann (Fläche der Einfüllöffnung, Entlüftung gegen Umgebung, Tank mit Pumpe, eigene Umgebung) — sie halten die Löserpfade fest, die `airsim/solver.js` der Vollständigkeit halber trägt; die Lösung ist ausgedünnt (`index`) |

## Dateiformat

```json
{
  "header":   { "source": "dielogic@<sha>", "python": "…", "numpy": "…", "scipy": "…",
                "generated": "2026-09-19", "generator": "scripts/gen-v2-vacuum-goldens.py" },
  "inputs":   { "values": { "…": "Dashboard-Werte (kg, mm, mm², mbar, L, ms)" },
                "curve": [[60, 0.4], [318, 0.4]], "count": 200,
                "vacuum": { "…": "der Vakuum-Block der früheren HTTP-Anfrage — nur zur Dokumentation" } },
  "expected": { "meta": {}, "samples": {}, "events": [], "critical_crossing": {} }
}
```

Die Simulation liest allein `inputs.values` und `inputs.curve`. Bei
`invalid--` steht unter `expected.error` die Meldung der Referenz; wo die
JavaScript-Fassung bewusst anders formuliert (das Paket beim Namen genannt,
englische Meldung, Schlüssel der HTTP-Schnittstelle), führt der Test die
Abweichung einzeln auf (`REWORDED`).

Der letzte Abtastwert eines gedrosselten Modells ist kein Ergebnis: die
Kurve endet 1 µm vor dem Füllende, und dort entscheidet Rundung, ob das
Ventil noch offen ist. Die Dateien halten auch das bitgenau fest; die
Diagramme lesen den Restdruck dort, wo `part_fill` 1 erreicht.

## Herkunft und Neuerzeugen

`header.source` nennt den Commit, an dem die Referenz lief: Tag `v1-final`.
Dort liegen Paket (`packages/hpdcsim/`), Übersetzungsschicht
(`backend/convert.py`, `backend/simcore.py`) und ihre Tests vollständig im
Git-Verlauf; eine Kopie des Pakets liegt außerhalb des Repositorys unter
`~/DieLogic/backup/hpdcsim-2026-09-19/`. Der Generator
`scripts/gen-v2-vacuum-goldens.py` läuft nur an diesem Tag
(`git checkout v1-final`) und verweigert jeden anderen Stand.

Die Fälle werden nicht mehr neu erzeugt — sie sind der eingefrorene Maßstab.
Ändert sich das Modell absichtlich, ist das eine fachliche Entscheidung: die
betroffenen Dateien mit der neuen JavaScript-Fassung neu schreiben und im
Commit begründen, warum die Referenz nicht mehr gilt.
