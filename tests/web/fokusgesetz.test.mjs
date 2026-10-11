/* Neue Physik der Auslegung (2026-10-11):
     1. das fokussierende Kolbengesetz (physics.focusLaw) gegen die Tabelle
        des Papiers (DieLogic_OF, claude_paper/paper/sections/focus_rows.tex)
        und die DieLogic-Kurve (curvegen 'focus'), die daraus entsteht;
     2. der Wärmeverlust in der Füllkammer (physics.sleeveLoss) in seinen
        Grenzfällen;
     3. die Druckspitze am Füllende (physics.fillEndSpike).
   node --test tests/web/fokusgesetz.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ladeSkripte, themeLaden, auslegung, defaults } from './stubs/dashboard.mjs';

ladeSkripte();
await themeLaden();

const Ph = await auslegung('core/physics.js');
const { generateCurve } = await auslegung('core/curvegen.js');

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} ${a} ≠ ${b} (± ${tol})`);
const at = (x, xs, ys) => {
  let i = 1;
  while (i < xs.length - 1 && xs[i] < x) i++;
  return ys[i - 1] + (x - xs[i - 1]) / (xs[i] - xs[i - 1]) * (ys[i] - ys[i - 1]);
};

/* Auszug aus der Tabelle des Papiers: X/[ℓ(1−φ)] beim Erreichen von U/U_H,
   dazu U_H/√(gD) und t*·√(gD)/ℓ = 1/C₀. */
const PAPIER = {
  0.2: { UH: 1.043, tstar: 2.354, X: { 0.5: 0.418, 0.9: 0.730, 0.99: 0.841 } },
  0.4: { UH: 0.704, tstar: 1.773, X: { 0.5: 0.247, 0.9: 0.566, 0.99: 0.735 } },
  0.7: { UH: 0.340, tstar: 1.313, X: { 0.5: 0.115, 0.9: 0.386, 0.99: 0.614 } }
};

test('Fokusgesetz: Konstanten und Weg-Tabelle des Papiers auf drei Stellen', () => {
  for (const [p, ref] of Object.entries(PAPIER)) {
    const phi = Number(p), law = Ph.focusLaw(phi);
    near(law.UH, ref.UH, 5e-4, 'U_H bei φ = ' + phi);
    near(1 / law.C0, ref.tstar, 5e-4, 't* bei φ = ' + phi);
    for (const [lv, x] of Object.entries(ref.X))
      near(at(Number(lv) * law.UH, law.U, law.xi) / (1 - phi), x, 5e-4, 'X bei U/U_H = ' + lv + ', φ = ' + phi);
    /* Deckenberührung genau bei „Kammer voll" */
    near(law.xi[law.xi.length - 1], 1 - phi, 1e-9, 'X(t*)');
    near(law.tau[law.tau.length - 1], 1, 1e-12, 't = t*');
  }
});

test('Fokusgesetz: U_H ist die Deckengeschwindigkeit der Theorie (vCritTheory)', () => {
  for (const phi of [0.15, 0.3, 0.5, 0.65, 0.8]) {
    const D = 0.12;
    near(Ph.focusLaw(phi).UH * Math.sqrt(9.81 * D), Ph.vCritTheory(D, phi), 2e-3 * Ph.vCritTheory(D, phi), 'φ = ' + phi);
  }
  assert.equal(Ph.focusLaw(0), null);
  assert.equal(Ph.focusLaw(1), null);
});

test('DieLogic-Kurve: kappt bei min(κ·U_H, v_krit), erfüllt die 1. Phase und erreicht das Füllende', () => {
  for (const o of [{}, { part: 4 }, { diam: 100, length: 600, part: 3 }, { part: 22 }]) {
    const v = Object.assign(defaults(), o);
    const g = generateCurve(v, { mode: 'focus', kappa: 0.95 });
    assert.ok(!g.error, g.error);
    const shot = Ph.computeShot(v, g.points);
    const ids = shot.checks.filter(c => !c.ok).map(c => c.id);
    for (const id of ['vcrit', 'travel', 'endlage']) assert.ok(!ids.includes(id), id + ' verletzt bei ' + JSON.stringify(o));
    const UH = Ph.focusLaw(shot.phi).UH * Math.sqrt(9.81 * v.diam / 1000);
    const cap = Math.min(0.95 * UH, shot.vcrit);
    assert.ok(shot.v1 <= cap + 1e-9, 'v₁ ' + shot.v1 + ' über der Kappe ' + cap);
    assert.ok(shot.v1 >= cap - 2e-3, 'v₁ ' + shot.v1 + ' weit unter der Kappe ' + cap);
    /* Die Punkte der Anfahrt liegen auf dem Gesetz: v/U_H über s/(L(1−φ)) */
    const law = Ph.focusLaw(shot.phi);
    for (const [s, vp] of g.points.filter(p => p[1] < cap - 1e-3)) {
      const xi = s / v.length;
      near(vp / Math.sqrt(9.81 * v.diam / 1000), at(xi, law.xi, law.U), 2e-3, 'Punkt bei s = ' + s);
    }
  }
});

test('DieLogic-Kurve: κ über 1 wird auf U_H begrenzt, κ fehlt → 0,95', () => {
  const v = Object.assign(defaults(), { part: 4 });          // φ ≈ 0,27: v_krit liegt über 0,95·U_H
  const a = generateCurve(v, { mode: 'focus' });
  const b = generateCurve(v, { mode: 'focus', kappa: 0.95 });
  assert.deepEqual(a.points, b.points);
  const c = generateCurve(v, { mode: 'focus', kappa: 3 });
  const d = generateCurve(v, { mode: 'focus', kappa: 1 });
  assert.deepEqual(c.points, d.points);
});

test('erfcx: Tabellenwerte und stetig am Übergang bei 2', () => {
  for (const [x, ref] of [[0, 1], [0.5, 0.6156903], [1, 0.4275836], [2, 0.2553957], [3, 0.1790011], [6, 0.0927766]])
    near(Ph.erfcx(x), ref, 1e-6, 'x = ' + x);
  near(Ph.erfcx(2 - 1e-9), Ph.erfcx(2 + 1e-9), 1e-6, 'Sprung bei 2');
});

test('Kammerwärme je m²: Newton für kleines h, reine Wärmeleitung für großes h', () => {
  const S = Ph.SLEEVE_STEEL, a = S.k / (S.rho * S.c), dT = 400, t = 4;
  const cond = 2 * dT * S.k / Math.sqrt(a) * Math.sqrt(t / Math.PI);
  near(Ph.sleeveHeatPerArea(dT, 1e-3, t), dT * 1e-3 * t, 1e-6, 'Newton');
  near(Ph.sleeveHeatPerArea(dT, 50, t) / (dT * 50 * t), 1, 0.02, 'Newton, h = 50');
  near(Ph.sleeveHeatPerArea(dT, 1e8, t) / cond, 1, 1e-3, 'Leitung');
  /* monoton in h und t */
  assert.ok(Ph.sleeveHeatPerArea(dT, 3000, t) < Ph.sleeveHeatPerArea(dT, 6000, t));
  assert.ok(Ph.sleeveHeatPerArea(dT, 3000, 2) < Ph.sleeveHeatPerArea(dT, 3000, 4));
  assert.equal(Ph.sleeveHeatPerArea(0, 3000, t), 0);
});

test('Wärmeverlust der Kammer: Energiebilanz, Überhitzung zuerst, Grenzen', () => {
  const v = defaults();
  const r = Ph.sleeveLoss(v, 4);
  assert.ok(r && r.Q > 0);
  /* benetzte Fläche: Bogen D·θ₀ über L plus zwei Segmente */
  const D = v.diam / 1000, L = v.length / 1000, phi = Ph.fillRatio(v);
  const theta = Math.acos(1 - 2 * Ph.segHeight(phi));
  near(r.area, D * theta * L + 2 * phi * Math.PI * D * D / 4, 1e-12);
  /* Temperaturabfall = Q/(m·c_L), solange die Überhitzung reicht */
  assert.ok(r.used < 1);
  near(r.dT, r.Q / (Ph.doseMass(v) * v.cpL), 1e-9);
  assert.equal(r.solidMean, 0);
  assert.ok(r.shellMax > 0 && r.shellMax < 1);
  /* lange Verweilzeit: Überhitzung weg, Schmelze auf Liquidus, ein Teil erstarrt */
  const s = Ph.sleeveLoss(v, 120);
  assert.ok(s.used > 1);
  assert.equal(s.Tmelt, v.Tliq);
  assert.ok(s.solidMean > 0);
  /* heißere Kammer verliert weniger */
  assert.ok(Ph.sleeveLoss(Object.assign(defaults(), { sleeveT: 350 }), 4).Q < r.Q);
  /* ungültig: Kammer so heiß wie die Schmelze, keine Zeit, Gießtemperatur unter Liquidus */
  assert.equal(Ph.sleeveLoss(Object.assign(defaults(), { sleeveT: v.Tcast }), 4), null);
  assert.equal(Ph.sleeveLoss(v, 0), null);
  assert.equal(Ph.sleeveLoss(Object.assign(defaults(), { Tcast: v.Tliq - 1 }), 4), null);
});

test('Druckspitze am Füllende: Wasserschlag ρ·a·v_p plus Anschnittdruck', () => {
  const v = defaults();
  const r = Ph.fillEndSpike(v, 4.5);
  near(r.hammer, v.density * v.soundSpeed * 4.5 / 1e5, 1e-9);
  const va = 4.5 * Ph.pistonArea(v) / v.gate;
  near(r.va, va, 1e-9);
  near(r.gateP, v.density * (va / v.Cd) ** 2 / 2 / 1e5, 1e-9);
  near(r.peak, r.hammer + r.gateP, 1e-9);
  /* stehender Kolben: keine Spitze */
  assert.equal(Ph.fillEndSpike(v, 0).peak, 0);
  assert.equal(Ph.fillEndSpike(Object.assign(defaults(), { soundSpeed: 0 }), 4.5), null);
});

/* Befunde der Durchsicht vom 2026-10-11 */
test('Kurvengenerator: Ziel ist min(NADCA, t_max), die erzeugte Kurve hält t_max', () => {
  const v = Object.assign(defaults(), { wall: 8 });          // NADCA ≈ 130 ms > t_max 100 ms
  assert.ok(Ph.nadcaFillMs(v) > v.tmax);
  for (const mode of ['focus', 'lopez']) {
    const g = generateCurve(v, { mode });
    assert.equal(g.tN, v.tmax);
    const shot = Ph.computeShot(v, g.points);
    assert.ok(shot.fill <= v.tmax, mode + ': Füllzeit ' + shot.fill);
  }
});

test('Kurvengenerator: ohne a_max bleibt die Füllzeit unter der NADCA-Empfehlung', () => {
  const v = Object.assign(defaults(), { amax: 0 });
  const g = generateCurve(v, { mode: 'lopez' });
  assert.ok(Ph.computeShot(v, g.points).fill <= g.tN);
});

test('V₁/V₂: die Rundung hebt v₁ nicht über V₁', () => {
  const v = Object.assign(defaults(), { length: 899.97 });
  const g = generateCurve(v, { mode: 'v1v2', v1: 0.6, a1: 5, v2: 4, a2: 30 });
  assert.ok(Ph.computeShot(v, g.points).v1 <= 0.6 + 1e-9);
});
