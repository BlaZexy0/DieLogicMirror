# Physik-Fixtures — von Hand hergeleitete Referenzfälle

Das Dashboard leitet Hübe, Zeiten und Anschnittgeschwindigkeit an zwei
Stellen unabhängig voneinander her: in der Auslegung
(`web/tools/auslegung/js/core/physics.js`, `computeShot`, Millimeter) und in
der Luftsimulation (`web/tools/auslegung/js/core/airsim/`, eigene Kinematik
in SI). Diese Fixtures halten beide aneinander fest: **eine** Datei je
Referenzfall mit bekannten Eingaben (Massen, Geometrie, Schusskurve) und von
Hand hergeleiteten Ergebnissen (Füllgrad, Hübe, kritische Geschwindigkeit,
Zeiten, Anschnittgeschwindigkeit).

`node --test tests/web/physics-fixtures.test.mjs` prüft beide Rechenwege
gegen dieselben Sollwerte — weicht einer ab, sind sie auseinandergelaufen.

Dieselben vier Fälle sind die Eingaben der Referenzfälle der Luftsimulation
(`fixtures/airsim/`); dort stehen die vollständigen Druckverläufe.

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

`rtol` ist die zulässige relative Abweichung. Alle Größen verlangen 1e-9 —
bis auf **`fill_time_ms`** (1e-4): die Luftsimulation kappt die Schusskurve
1 µm vor dem Füllende-Hub (`CLAMP_MARGIN` in `airsim/config.js`), die
Auslegung nicht.

`v_crit` ist exakt: beide Rechenwege rufen dieselbe Funktion `vCrit()` mit
derselben Normierungskonstante (`VKRIT_GRAVITY` = 9,81). Eine gelockerte
Toleranz verdeckte hier schon einmal eine Abweichung;
`tests/web/vkrit-table.test.mjs` lässt sie deshalb nicht über 1e-9 steigen.

## Größen

| Schlüssel | Bedeutung | Auslegung (`computeShot`) | Luftsimulation (`createShotProcess`) |
|---|---|---|---|
| `phi` | Füllgrad der Kammer | `r.phi` | `meta.phi` |
| `s_fill_mm` | Hub „Kammer voll“ | `r.sFill` | `sleeveFullStroke` |
| `biscuit_mm` | Schmelzerest in der Kammer beim Füllende (L − Füllende) | `r.biscLiquid` | `biscuitLength` |
| `fill_complete_mm` | Hub „Füllende“ | `r.totalStroke` | `fillCompleteStroke` |
| `v_crit` | krit. Geschw. (CFD-Tabelle) | `r.vcrit` | `criticalVelocity` |
| `v_slow_max` | max. Kolbengeschw. bis Kammer voll (v1) | `r.v1` | Profil-Maximum bis `s_fill` |
| `t_sleeve_full_s` | Zeit bis Kammer voll (ab Schussbeginn) | `r.events[0].t` | `motion.sampleAtPosition(…).time` |
| `v_sleeve_full` | Kolbengeschw. bei Kammer voll | `r.events[0].v` | `motion.sampleAtPosition(…).velocity` |
| `t_part_full_s` | Zeit bis Bauteil gefüllt | `r.events[2].t` | `motion.sampleAtPosition(partFullStroke).time` |
| `gate_v_part_full` | Anschnittgeschw. bei Bauteil gefüllt | `r.events[2].gv` | `stateAtStroke(partFullStroke).gateVelocity` |
| `fill_time_ms` | Füllzeit Anguss → Überlauf | `r.fill` | Zeitdifferenz der Ereignishübe |

## Sollwerte herleiten

Die `value`-Einträge stammen aus den geschlossenen Formeln der Auslegung
(unabhängig nachgerechnet, nicht aus einer der Implementierungen kopiert):
A = πD²/4, V_dose = m_dos/ρ_flüssig, φ = V_dose/(A·L), s_fill = (1−φ)·L, Hübe
kumulativ über V_i/A mit V_i = m_i/ρ_sol (Kavitäten fest, ρ_sol = ρ_s/(1+s)³;
ohne `densitySolid` flüssig); Schusskurve stückweise konstant beschleunigt mit
v₁² = v₀² + 2aΔs und Δt = 2Δs/(v₀+v₁); v_krit = √(g·D)·f(D, φ) mit f bilinear
aus der OpenFOAM-CFD-Tabelle (`fixtures/vkrit/v_krit_sim.csv`);
Anschnittgeschwindigkeit v·A/A_gate. Neue Fälle mit denselben Formeln
herleiten und die Herleitung in `note`-Feldern dokumentieren.
