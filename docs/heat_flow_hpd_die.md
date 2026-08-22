
---

## 21. Verification against the scans and implementation notes (DieLogic, 2026-08-22)

All equations used by the Zyklusanalyse were checked against the page images
of the two scans. Findings:

- **(5.14) is incomplete above.** The source gives both practical forms:
  `Q_Kon = 1.8·τz·L·(B+H) [kJ]` **and** `Q_Pl = 18·τz·B·H [kJ]` (L, B, H in m,
  τz in s; Source A p. 303). The implementation uses the detailed forms
  (12.7+12.9) and (12.10) with areas derived from L, B, H instead.
- **(12.3) is missing above:** `t_fa = t_luft + 0.6·(t_f − 20 °C)` — first
  approximation of the die outer-surface temperature from the deep-zone die
  temperature (Source B p. 691). Used to derive `t_fa` from the project's
  `Tdie`.
- **Worked example, Source B pp. 705–708** (used as the test fixture in
  `tests/web/waermebilanz.test.mjs`): V = 300 cm³, ρ_L = 2445 kg/m³,
  c_20 = 846, c_S = 1034, c_L = 1056 J/(kg·K), h_f = 403 kJ/kg, t_S = 521,
  t_L = 593, t_e = 320 °C → Q = 496.63 kJ. Losses with τz = 60 s, τ_bl = 10 s,
  A_fa = 0.34, A_k1 = 0.18, A_k2 = 0.2, A_fgr = 0.05 m², t_f = 200,
  t_fomin = 240, t_fa = 140, t_fa1 = 130, t_fa2 = 120, t_pl1 = 60, t_pl2 = 50,
  t_luft = 20, t_luft1 = 80, t_luft2 = 20 °C, V_luft = 0.06 m³, m₁ = 0.02 kg,
  α_kon = 7, α_str = 2.7, α_k = 100, α_bl = 40 W/(m²·K) →
  Q_Kon+Str = 23.75, Q_Pl = 159.6, Q_Luft = 3.6, Q_Bl = 5.2, Q_Spr = 52,
  Q_U = 244.15, Q_Ts = 252.48 kJ.
  - The example evaluates `Q_Spr = 2600·m₁` although (12.22) states 2594;
    the implementation uses 2594 (→ 51.88 kJ).
  - The example states `c_m = 989.21 J/(kg·K)`, but the printed formula
    `c_m = c_20 + (t_S + t_e − 40)/(2·t_S − 40)·(c_S − c_20)` evaluates to
    996.29 with the example data; Q then becomes 497.68 kJ (+0.2 %). The
    implementation follows the printed formula.
- **Tempering example, Source A pp. 298–299:** G = 2 kg, q = 700 kJ/kg,
  k = 0.5, τz = 70 s → P_T = 10 kW (5.4); d = 10 mm, w = 2 m/s, n₁ = 4,
  n₂ = 2 → V̇₁ = 37.68, V̇₂ = 18.84 l/min (5.9); with Marlotherm SH at
  140 °C (ρ = 958 kg/m³, c = 1990 J/(kg·K)) and ΔT = 6 K → P_T1 = 7.18 kW,
  P_T2 = 3.59 kW (5.5). Used as the second fixture.
- Table 12.1 (Q/V per alloy and ejection temperature) and Table 5.3
  (q per alloy) are consistent with (12.2) within a few percent and were
  used to sanity-check the thermal data added to the example alloys
  (`web/shared/examples/alloys.js`: Tliq, Tsol, hf, cp20, cpS, cpL).

Implementation map (`web/tools/zyklus/zyklus-logic.js`):

| Function | Equations |
|---|---|
| `meanHeatCapacities`, `heatInput` | (12.2) with c_l, c_m of 12.4.1 |
| `outerSurfaceTemp` | (12.3) |
| `heatLosses` | (12.7)+(12.9) as one coefficient, (12.10), (12.14), (12.15), (12.22) |
| `heatBalance` | (12.1)/(5.19), P_T = Q_T/τz (5.4), k = Q_T/Q |
| `temperingCapacity` | Re, (5.8), (5.24), (5.9), (5.21), (5.20)/(5.25), (5.22), (5.23), checks (5.26) |

Not implemented (next steps): pressure loss / pump check (5.27–5.29, 5.10),
warm-up transient (5.31–5.37), spray-mass estimate from the skin layer
(12.19–12.21, 5.15–5.18) — the spray mass is an input.
