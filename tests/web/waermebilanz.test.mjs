/* Wärmebilanz der Zyklusanalyse (zyklus-logic.js) gegen die Zahlenbeispiele
   der Quellen (docs/heat_flow_hpd_die.md, Abschnitt 21):
   1. [B] 12.4 (S. 705–708): Wärmeeintrag und Verlustterme
   2. [A] S. 298–299: Volumenströme, Fluid-Bilanz, Reynoldszahl
   3. computeHeat() auf dem Beispielprojekt, Formabmessungen aus der
      Maschine, Zustands-Sanitisierung */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const Z = require(path.join(site, 'tools/zyklus/zyklus-logic.js'));

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} ≠ ${b} ± ${tol}`);

/* Beispiel [B] 12.4.1: EN AC-AlSi9Cu3(Fe), V = 300 cm³, ρ_L = 2445 kg/m³ */
const ALLOY_B = { Tliq: 593, Tsol: 521, hf: 403, cp20: 846, cpS: 1034, cpL: 1056 };
const M_B = 300e-6 * 2445;

test('heatInput: Beispiel [B] 12.4.1 — c_l, c_m, Q nach (12.2); Überhitzung getrennt', () => {
  const r = Z.heatInput(Object.assign({ mdose: M_B, Tcast: 593, Teject: 320 }, ALLOY_B));
  assert.equal(r.cl, 1045);
  near(r.cm, 996.29, 0.01, 'c_m nach gedruckter Formel (Quelle nennt 989,21)');
  near(r.Qdie, 496.63, 1.2, 'Q ≈ 496,63 kJ (Quelle; Abweichung nur über c_m)');
  assert.equal(r.Qsuper, 0);
  near(r.q, 677, 2, 'q bei t_e = 320 °C (Tab. 5.3: 700)');
  /* Mit Gießtemperatur 660 °C kommt die Überhitzung dazu — geht in die Gießkammer, nicht in Qdie */
  const r2 = Z.heatInput(Object.assign({ mdose: M_B, Tcast: 660, Teject: 320 }, ALLOY_B));
  near(r2.Qsuper, M_B * 1056 * 67 / 1000, 1e-9, 'Q_super = m·c_L·(T_cast − T_liq)');
  assert.equal(r2.Qdie, r.Qdie);
  assert.equal(r2.Qtotal, r2.Qdie + r2.Qsuper);
  /* Tab. 5.3 / 12.1: bei 280 °C Entformung ≈ 740 kJ/kg */
  near(Z.heatInput(Object.assign({ mdose: 1, Tcast: 593, Teject: 280 }, ALLOY_B)).q, 740, 30, 'q(280 °C)');
  assert.equal(Z.heatInput(Object.assign({ mdose: 0, Tcast: 660, Teject: 300 }, ALLOY_B)), null);
  assert.equal(Z.heatInput(Object.assign({ mdose: 1, Tcast: 660, Teject: 300 }, ALLOY_B, { Tliq: 500 })), null);
});

test('heatLosses: Beispiel [B] 12.4.2 — Terme mit den Konstanten der Quelle', () => {
  /* Form so gewählt, dass A_fa = 2·L·(B+H) ≈ 0,34 m² und A_k = B·H ≈ 0,19 m² wie im Beispiel */
  const l = Z.heatLosses({ tz: 60, tauBl: 10, Tdie: 200, Teject: 320, Acav: 0.05, B: 0.42, H: 0.45, L: 0.195 });
  assert.equal(l.tfa, 128);                         // (12.3) statt der gemessenen 140 °C des Beispiels
  near(l.Afa, 0.3393, 1e-4, 'A_fa');
  /* Konvektion + Strahlung: 9,7·A_fa·60·(128 − 20) — Beispiel mit 140 °C: 23,75 kJ */
  near(l.Qkon, 9.7 * l.Afa * 60 * 108 / 1000, 1e-9, 'Q_Kon+Str');
  /* Aufspannplatten: 100·60·2·0,189·(128 − 55) — Beispiel (andere Temperaturen): 159,6 kJ */
  near(l.Qpl, 100 * 60 * 2 * l.Ak * 73 / 1000, 1e-9, 'Q_Pl');
  near(l.Qluft, l.Vluft * 60, 1e-9, 'Q_Luft = V·(80 − 20) kJ');
  near(l.Qbl, 40 * 0.05 * 10 * ((320 + 230) / 2 - 20) / 1000, 1e-9, 'Q_Bl mit Gravur 230 °C vor dem Gießen');
  /* Trennstoff (12.21): 0,744·0,05·0,01·(320 − 200) = 44,6 g → (12.22) 115,8 kJ */
  near(l.mSpray, 0.04464, 1e-5, 'm_1');
  near(l.Qspr, 2594 * 0.04464, 0.03, 'Q_Spr');
  assert.equal(l.QU, l.Qkon + l.Qpl + l.Qluft + l.Qbl + l.Qspr);
  /* Beispielgrößen (12.15/12.21/12.22) direkt: A_fgr 0,4 m², Δ 50 K → 0,15 kg (Quelle S. 705) */
  near(Z.heatLosses({ tz: 60, tauBl: 10, Tdie: 250, Teject: 300, Acav: 0.4, B: 0.4, H: 0.4, L: 0.2 }).mSpray, 0.1488, 1e-4, 'm_1 = 0,744·A·x0·Δt');
});

test('coolingCheck: Beispiel [A] S. 298–299 — Volumenströme, ΔT aus der Fluid-Bilanz, Re', () => {
  const fluid = { TV: 140, rho: 958, c: 1990, lambda: 0.115, nu: 1.8e-6, Pr: 24 };
  /* 4 + 2 Kreisläufe, d = 10 mm, w = 2 m/s → 37,68 + 18,84 = 56,52 l/min */
  const c = Z.coolingCheck({ QT: 700, tz: 70, fluid, n: 6, d: 10, w: 2, B: 1, H: 1, Tdie: 200 });
  near(c.VdotLmin, 56.52, 0.05, 'V̇ gesamt');
  near(c.Re, 11111, 1, 'Re');
  assert.equal(c.turbulent, true);
  near(c.wMin, 1.8, 1e-9, 'w_min für Re = 10⁴');
  /* P_T = 10 kW (5.4) über 56,52 l/min Öl → ΔT = 10 kW/(ρ·c·V̇) = 5,6 K ≤ 10 K */
  near(c.dT, 700e3 / (958 * 1990 * c.Vdot * 70), 1e-9, 'ΔT = Q_T/(ρ·c·V̇·τz)');
  near(c.dT, 5.57, 0.02, 'ΔT ≈ 5,6 K');
  assert.equal(c.okDT, true);
  assert.deepEqual(c.halves.map(h => h.n), [3, 3]);
  /* zu wenig Volumenstrom → ΔT über 10 K; keine Kreisläufe → unendlich */
  assert.equal(Z.coolingCheck({ QT: 700, tz: 70, fluid, n: 2, d: 10, w: 2, B: 1, H: 1, Tdie: 200 }).okDT, false);
  assert.equal(Z.coolingCheck({ QT: 700, tz: 70, fluid, n: 0, d: 10, w: 2, B: 1, H: 1, Tdie: 200 }).dT, Infinity);
});

test('coolingCheck: Wärmeleitung (5.25) und Wandübergang (5.22/5.24) reagieren richtig', () => {
  const base = { QT: 2000, tz: 60, fluid: Z.FLUIDS.wasser, n: 10, d: 12, w: 2.5, B: 1, H: 1, Tdie: 200 };
  const r = Z.coolingCheck(base);
  const h = r.halves[0];
  assert.equal(h.n, 5); near(h.b, 0.2, 1e-12, 'Teilung b = B/n'); near(h.lK, 0.7, 1e-12, 'l_K = 0,7·H');
  assert.equal(r.Tsurf, 340);
  const R = 2 * Math.PI * 0.015 / 0.2 + Math.log(0.2 / (Math.PI * 0.012));
  near(h.QKlambda, 2 * Math.PI * 28 * 5 * 0.7 * 60 / R * 140 / 1000, 1e-9, 'Q_Kλ (5.25)');
  near(h.QKalpha, r.alpha * 5 * Math.PI * 0.012 * 2 * 60 * (200 - r.TFl) / 1000, 1e-9, 'Q_Kα (5.22)');
  assert.ok(r.alpha > 5000 && r.alpha < 20000, 'α Wasser ' + r.alpha);
  /* mehr Kreisläufe → engere Teilung → mehr Wärmeleitung; schnelleres Wasser → mehr α */
  assert.ok(Z.coolingCheck(Object.assign({}, base, { n: 20 })).halves[0].QKlambda > h.QKlambda);
  assert.ok(Z.coolingCheck(Object.assign({}, base, { w: 3 })).alpha > r.alpha);
  assert.equal(r.okLambda, r.halves.every(x => x.QKlambda >= x.QT));
});

test('computeHeat: Beispielprojekt (18,2 kg, 1600 t) rechnet durch und ist knapp ausgelegt', () => {
  const st = Z.defaultState();
  const lay = Z.layoutCycle(st.durs, Z.extrasFromState(st));
  const die = Z.dieFromMachine({ tieX: 1170, tieY: 1170 });
  assert.deepEqual(die, { B: 940, H: 940, L: 470 });
  assert.deepEqual(Z.dieFromMachine(null), { B: 1000, H: 1000, L: 500 });
  const r = Z.computeHeat({ mdose: 18.2, Tcast: 660, alloy: null, Tdie: 200, Teject: st.heat.Teject, Acav: 0.6,
    die, tz: lay.total, tauBl: st.durs.spruehen, cooling: st.heat.cooling });
  assert.ok(r.input.Qdie > 12000 && r.input.Qdie < 13000, 'Q_die ≈ 12,7 MJ: ' + r.input.Qdie);
  assert.ok(r.k > 0.6 && r.k < 0.95, 'k plausibel: ' + r.k);
  assert.ok(r.PT > 150 && r.PT < 260, 'P_T ≈ 200 kW: ' + r.PT);
  assert.equal(r.deficit, false);
  assert.ok(r.cooling.ok, 'Beispielkühlung reicht: ' + JSON.stringify([r.cooling.okLambda, r.cooling.okAlpha, r.cooling.okDT, r.cooling.turbulent]));
  assert.ok(r.cooling.dT > 3 && r.cooling.dT <= 10, 'ΔT: ' + r.cooling.dT);
  /* ohne Legierung: Fallback; mit Zink deutlich weniger Wärme */
  const zn = Z.computeHeat({ mdose: 18.2, Tcast: 420, alloy: { Tliq: 386, Tsol: 380, hf: 110, cp20: 420, cpS: 470, cpL: 500 }, Tdie: 200, Teject: 250, Acav: 0.6,
    die, tz: lay.total, tauBl: st.durs.spruehen, cooling: st.heat.cooling });
  assert.ok(zn.input.Qdie < r.input.Qdie / 3);
  /* Verluste größer als Eintrag → Heizfall, Kühlung trivial erfüllt */
  const tiny = Z.computeHeat({ mdose: 0.2, Tcast: 660, alloy: null, Tdie: 200, Teject: 300, Acav: 0.6, die, tz: 120, tauBl: 8, cooling: st.heat.cooling });
  assert.equal(tiny.deficit, true);
  assert.equal(tiny.cooling.dT, 0);
  /* unbrauchbare Eingaben → input null, Verluste trotzdem */
  const bad = Z.computeHeat({ mdose: 0, Tcast: 660, alloy: null, Tdie: 200, Teject: 300, Acav: 0.6, die, tz: 60, tauBl: 8, cooling: st.heat.cooling });
  assert.equal(bad.input, null); assert.ok(bad.losses.QU > 0); assert.equal(bad.cooling, null);
});

test('sanitizeHeat / sanitizeState: Lücken aus den Defaults, Zahlen erzwungen, Fluid validiert', () => {
  const d = Z.heatDefaults();
  assert.deepEqual(Z.sanitizeHeat(null), d);
  const s = Z.sanitizeHeat({ Teject: '280', die: { B: '1200', H: -5, L: 'x' }, cooling: { fluid: 'nix', n: '7.4', w: '3' } });
  assert.equal(s.Teject, 280);
  assert.deepEqual(s.die, { B: 1200, H: null, L: null });
  assert.equal(s.cooling.fluid, 'wasser');
  assert.equal(s.cooling.n, 7);
  assert.equal(s.cooling.w, 3);
  assert.equal(s.cooling.d, d.cooling.d);
  assert.deepEqual(Z.sanitizeState({ durs: { schuss: 5 } }).heat, d);
  assert.equal(Z.sanitizeState({ heat: { Teject: 310 } }).heat.Teject, 310);
});
