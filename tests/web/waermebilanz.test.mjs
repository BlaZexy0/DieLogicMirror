/* Wärmebilanz der Zyklusanalyse (zyklus-logic.js) gegen die Zahlenbeispiele
   der Quellen (docs/heat_flow_hpd_die.md, Abschnitt 21):
   1. [B] 12.4 (S. 705–708): Wärmeeintrag Q und alle Verlustterme
   2. [A] S. 298–299: Temperierleistung, Volumenströme, Fluid-Bilanz
   3. Bilanz, Kapazitätsprüfungen, thermalReport() mit Zeitleiste,
      Zustands-Sanitisierung. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const Z = require(path.join(site, 'tools/zyklus/zyklus-logic.js'));

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ± ${tol}`);

/* Eingabedaten des Beispiels [B] 12.4.1 (EN AC-AlSi9Cu3(Fe)) */
const ALLOY_B = { Tliq: 593, Tsol: 521, hf: 403, cp20: 846, cpS: 1034, cpL: 1056 };
const M_B = 300e-6 * 2445;   // V = 300 cm³, ρ_L = 2445 kg/m³

test('heatInput: Beispiel [B] 12.4.1 — c_l, c_m und Q nach (12.2)', () => {
  const r = Z.heatInput(Object.assign({ mdose: M_B, te: 320 }, ALLOY_B));
  assert.equal(r.cl, 1045);                       // 0,5·(c_S + c_L)
  near(r.cm, 996.29, 0.01, 'c_m nach gedruckter Formel (Quelle nennt 989,21)');
  near(r.Q, 496.63, 1.2, 'Q ≈ 496,63 kJ (Quelle; Abweichung nur über c_m)');
  near(r.q, 677, 2, 'q ≈ 700 kJ/kg bei t_e = 320 °C (Tab. 5.3: 700)');
  /* Tab. 5.3 / 12.1: bei 280 °C Entformung mehr Wärme, ≈ 740 kJ/kg */
  const r2 = Z.heatInput(Object.assign({ mdose: 1, te: 280 }, ALLOY_B));
  near(r2.q, 740, 30, 'q(280 °C) — Tab. 5.3 nennt 740 mit anderen c_p-Annahmen');
  /* unbrauchbare Eingaben → null */
  assert.equal(Z.heatInput(Object.assign({ mdose: 0, te: 300 }, ALLOY_B)), null);
  assert.equal(Z.heatInput(Object.assign({ mdose: 1, te: 300 }, ALLOY_B, { Tliq: 500 })), null);
});

test('heatLosses: Beispiel [B] 12.4.2 — alle Verlustterme', () => {
  const l = Z.heatLosses({ tz: 60, Afa: 0.34, alphaKonStr: 7 + 2.7, tfa: 140, tluft: 20,
    alphaK: 100, Ak1: 0.18, tfa1: 130, tpl1: 60, Ak2: 0.2, tfa2: 120, tpl2: 50,
    Vluft: 0.06, tluft1: 80, alphaBl: 40, Afgr: 0.05, tauBl: 10, te: 320, tfomin: 240, tluft2: 20,
    mSpray: 0.02 });
  near(l.Qkon, 23.75, 0.01, 'Q_Kon+Str');
  near(l.Qpl, 159.6, 0.01, 'Q_Pl');
  near(l.Qluft, 3.6, 0.01, 'Q_Luft');
  near(l.Qbl, 5.2, 0.01, 'Q_Bl');
  near(l.Qspr, 51.88, 0.01, 'Q_Spr mit 2594 kJ/kg (Beispiel rechnet 2600 → 52)');
  near(l.QU, 244.03, 0.01, 'Q_U');
  /* Bilanz: Q_Ts = Q − Q_U ≈ 252,5 kJ, k ≈ 51 % (Quelle: 40–60 % über das Temperiersystem) */
  const b = Z.heatBalance(496.63, l.QU, 60);
  near(b.QT, 252.6, 0.1, 'Q_T');
  near(b.PT, 4.21, 0.01, 'P_T = Q_T/τz in kW');
  near(b.k, 0.509, 0.001, 'k');
  assert.equal(b.deficit, false);
  assert.equal(Z.heatBalance(100, 150, 60).deficit, true);
});

test('outerSurfaceTemp (12.3): 200 °C Form, 20 °C Luft → 128 °C', () => {
  assert.equal(Z.outerSurfaceTemp(200, 20), 128);
});

test('temperingCapacity: Beispiel [A] S. 298–299 — Volumenströme, Fluid-Bilanz, Re', () => {
  const fluid = { rho: 958, c: 1990, lambda: 0.115, nu: 1.8e-6, Pr: 24 };
  const base = { tz: 70, fluid, d: 10, w: 2, lK: 1, LK: 1, a: 15, b: 0, lambdaF: 28, TFomax: 480, TF: 200, TV: 140, dT: 6 };
  const h1 = Z.temperingCapacity(Object.assign({ QT: 0, n: 4 }, base));
  const h2 = Z.temperingCapacity(Object.assign({ QT: 0, n: 2 }, base));
  near(h1.VdotLmin, 37.68, 0.05, 'V̇₁');
  near(h2.VdotLmin, 18.84, 0.05, 'V̇₂');
  near(h1.QKdT / 70, 7.18, 0.02, 'P_T1 = c·ρ·V̇₁·ΔT in kW');
  near(h2.QKdT / 70, 3.59, 0.02, 'P_T2');
  near(h1.Re, 11111, 1, 'Re = w·d/ν');
  assert.equal(h1.turbulent, true);
  near(h1.wMin, 1.8, 0.001, 'w_min für Re = 10⁴ (5.8)');
  /* P_T nach (5.4): k·q·G/τz = 0,5·700·2/70 = 10 kW; Fluid-Bilanz beider Hälften 10,77 kW ≥ 10 kW */
  near((h1.QKdT + h2.QKdT) / 70, 10.77, 0.03, 'P_T1 + P_T2');
});

test('temperingCapacity: Wärmeleitung (5.20/5.25) und Übergang (5.22/5.24) reagieren richtig', () => {
  const base = { QT: 100, tz: 60, fluid: Z.FLUIDS.wasser, d: 10, w: 2, n: 1, lK: 1, LK: 2, a: 15, b: 0, lambdaF: 28, TFomax: 480, TF: 200, TV: 80, dT: 6 };
  const r = Z.temperingCapacity(base);
  /* Einzelkanal (5.20): 2π·28·1·60/ln(60/10)·(340−200)/1000 = 825 kJ */
  near(r.QKlambda, 2 * Math.PI * 28 * 60 / Math.log(6) * 140 / 1000, 1e-9, 'Q_Kλ Einzelkanal');
  assert.equal(r.TFo, 340);
  /* Kanal näher an der Gravur → mehr Wärmeleitung; Kanalreihe (5.25) mit b: anderer Widerstand */
  assert.ok(Z.temperingCapacity(Object.assign({}, base, { a: 10 })).QKlambda > r.QKlambda);
  const row = Z.temperingCapacity(Object.assign({}, base, { b: 40 }));
  near(row.QKlambda, 2 * Math.PI * 28 * 60 / (2 * Math.PI * 15 / 40 + Math.log(40 / (Math.PI * 10))) * 140 / 1000, 1e-9, 'Q_Kλ Kanalreihe');
  /* Wasser turbulent: α nach (5.24) in der Größenordnung 10⁴ W/(m²·K); mehr Geschwindigkeit → mehr α */
  assert.ok(r.alpha > 5000 && r.alpha < 20000, 'α Wasser ' + r.alpha);
  assert.ok(Z.temperingCapacity(Object.assign({}, base, { w: 3 })).alpha > r.alpha);
  /* Prüfungen gegen Q_T */
  assert.equal(r.okLambda, r.QKlambda >= 100);
  assert.equal(r.okDT, r.QKdT >= 100);
});

test('thermalReport: Standardzustand rechnet durch, Zeitleiste liefert τz, τhz, τbl', () => {
  const st = Z.defaultState();
  const lay = Z.layoutCycle(st.durs, Z.extrasFromState(st));
  const rep = Z.thermalReport(st.thermal, lay, st.durs, null);
  assert.equal(rep.tz, lay.total);
  assert.equal(rep.tauHz, st.durs.schuss + st.durs.halten);
  assert.equal(rep.tauBl, st.durs.spruehen);
  assert.equal(rep.alloy, Z.ALLOY_FALLBACK);
  assert.ok(rep.input && rep.input.Q > 0);
  assert.ok(rep.balance && isFinite(rep.balance.PT));
  assert.equal(rep.halves.length, 2);
  /* Anteil der beweglichen Hälfte: share % von Q_T */
  near(rep.halves[0].QT + rep.halves[1].QT, Math.max(rep.balance.QT, 0), 1e-9, 'Q_T-Aufteilung');
  /* Außenflächen + Aufspannfläche aus den Formabmessungen */
  const th = st.thermal;
  near(rep.Afa, 2 * th.dieL * (th.dieB + th.dieH) * 1e-6, 1e-12, 'A_fa = 2·L·(B+H)');
  near(rep.Ak, th.dieB * th.dieH * 1e-6, 1e-12, 'A_k = B·H');
  /* Das Beispiel ist so bemessen, dass die Kühlung knapp reicht und turbulent ist */
  assert.ok(rep.total.okLambda && rep.total.okAlpha && rep.total.okDT, 'Beispielkühlung reicht');
  assert.ok(rep.halves[0].turbulent);
  assert.ok(rep.balance.k > 0.5 && rep.balance.k < 0.95, 'k im plausiblen Bereich: ' + rep.balance.k);
  /* Eigene Legierungswerte werden genutzt */
  const rep2 = Z.thermalReport(st.thermal, lay, st.durs, { Tliq: 386, Tsol: 380, hf: 110, cp20: 420, cpS: 470, cpL: 500 });
  assert.ok(rep2.input.Q < rep.input.Q, 'Zink bringt weniger Wärme je kg als Aluminium');
});

test('sanitizeThermal / sanitizeState: Lücken aus den Defaults, Zahlen erzwungen, Fluid validiert', () => {
  const d = Z.thermalDefaults();
  assert.deepEqual(Z.sanitizeThermal(null), d);
  const s = Z.sanitizeThermal({ mdose: '12', te: 'x', linked: { mdose: false }, temp: { fluid: 'nix', w: '3', halves: [{ n: '6' }] } });
  assert.equal(s.mdose, 12);
  assert.equal(s.te, d.te);
  assert.equal(s.linked.mdose, false);
  assert.equal(s.linked.Tdie, true);
  assert.equal(s.temp.fluid, 'wasser');
  assert.equal(s.temp.w, 3);
  assert.equal(s.temp.halves[0].n, 6);
  assert.equal(s.temp.halves[1].n, d.temp.halves[1].n);
  /* sanitizeState trägt thermal mit — auch für alte Projekte ohne den Abschnitt */
  const st = Z.sanitizeState({ durs: { schuss: 5 } });
  assert.deepEqual(st.thermal, d);
  assert.equal(Z.sanitizeState({ thermal: { mSpray: 0.1 } }).thermal.mSpray, 0.1);
});
