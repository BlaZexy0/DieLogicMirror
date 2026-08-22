# Physik-Fixtures — geteilte Referenzfälle für JS und Python

Die Physik existiert zweimal: das Dashboard rechnet clientseitig
(`web/tools/auslegung/js/core/physics.js`), das Backend serverseitig (`backend/convert.py`
→ `packages/hpdcsim`). Diese Fixtures halten beide Implementierungen
aneinander fest: **eine** Datei je Referenzfall mit bekannten Eingaben
(Massen, Geometrie, Schusskurve) und von Hand hergeleiteten Ergebnissen
(Füllgrad, Hübe, kritische Geschwindigkeit, Zeiten, Anschnittgeschwindigkeit).

Beide Testsuiten lesen dieselben Dateien und vergleichen gegen dieselben
Sollwerte:

- JS: `node --test tests/web/physics-fixtures.test.mjs`
- Python: `pytest backend/tests` (`test_physics_fixtures.py`)

## Dateiformat

```json
{
  "name": "kurzname",
  "beschreibung": "was der Fall abdeckt",
  "inputs": {
    "values": { "part": 12, "runner": 3, "…": "Dashboard-Einheiten (kg, mm, mm²)" },
    "curve": [[60, 0.4], [318, 0.4]]
  },
  "expected": {
    "phi": { "value": 0.5449, "rtol": 1e-9, "note": "V_dose/(A·L)" }
  }
}
```

`rtol` ist die zulässige relative Abweichung. Jede Größe trägt ihre eigene
Toleranz, weil zwei Fälle systematisch abweichen:

- **`v_crit`** (rtol 1e-3): das Dashboard rechnet mit g = 9,81 m/s²,
  hpdcsim mit der Normfallbeschleunigung 9,80665 m/s² → ±1,7·10⁻⁴ relativ.
- **`fill_time_ms`** (rtol 1e-4): das Backend kappt die Schusskurve 1 µm vor
  dem Füllende-Hub (`CLAMP_MARGIN` in `backend/convert.py`).

## Größen

| Schlüssel | Bedeutung | JS-Quelle (`computeShot`) | Python-Quelle (`load_process`) |
|---|---|---|---|
| `phi` | Füllgrad der Kammer | `r.phi` | `proc.sleeve.fill_fraction` |
| `s_fill_mm` | Hub „Kammer voll“ | `r.sFill` | `plan.sleeve_full_stroke` |
| `biscuit_mm` | Pressrestlänge | `r.biscLen` | `plan.biscuit_length` |
| `fill_complete_mm` | Hub „Füllende“ | `r.totalStroke` | `plan.fill_complete_stroke` |
| `v_crit` | krit. Geschw. (Nogowizin) | `r.vcrit` | `proc.critical_velocity` |
| `v_slow_max` | max. Kolbengeschw. bis Kammer voll (v1) | `r.v1` | Profil-Maximum bis `s_fill` |
| `t_sleeve_full_s` | Zeit bis Kammer voll (ab Schussbeginn) | `r.events[0].t` | `profile.time_at_position` |
| `v_sleeve_full` | Kolbengeschw. bei Kammer voll | `r.events[0].v` | `profile.velocity_at_position` |
| `t_part_full_s` | Zeit bis Bauteil gefüllt | `r.events[2].t` | `profile.time_at_position` |
| `gate_v_part_full` | Anschnittgeschw. bei Bauteil gefüllt | `r.events[2].gv` | `state_at_stroke(...).gate_velocity` |
| `fill_time_ms` | Füllzeit Anguss → Überlauf | `r.fill` | Zeitdifferenz der Ereignishübe |

## Sollwerte herleiten

Die `value`-Einträge stammen aus den geschlossenen Formeln der Auslegung
(unabhängig nachgerechnet, nicht aus einer der Implementierungen kopiert):
A = πD²/4, V = m/ρ, φ = V_dose/(A·L), s_fill = (1−φ)·L, Hübe kumulativ über
V/A; Schusskurve stückweise konstant beschleunigt mit v₁² = v₀² + 2aΔs und
Δt = 2Δs/(v₀+v₁); v_krit = √(g·D)·(1,386 − 1,915φ + 0,615φ²);
Anschnittgeschwindigkeit v·A/A_gate. Neue Fälle mit denselben Formeln
herleiten und die Herleitung in `note`-Feldern dokumentieren.
