/* Die Partikelrechnung (js/sph/): Kern, Kammer, Anguss, Bilder — in
   JavaScript, ohne DOM, auf kleinen Partikelsätzen. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/project.js', 'shared/clampmodel.js']) require(path.join(site, f));

const R = '../../../web/tools/3d-studio/';
const K = await import(R + 'js/sph/kernel.js');
const { createSphSolver, suggestDt, sampleField, KIND, NEVER, PARAMS } = await import(R + 'js/sph/wcsph.js');
const D = await import(R + 'js/sph/domain.js');
const { runSph, snapshotOf } = await import(R + 'js/sph/run.js');
const { speedScaleParticles } = await import(R + 'js/sph/points.js');
const PRE = await import(R + 'js/runner/presets.js');
const F = await import(R + 'js/runner/flow.js');
const { FLAG } = await import(R + 'js/lbm/lattice.js');

test('Kern: Wendland C2 ist normiert, positiv, mit Träger 2h und fallender Ableitung', () => {
  const h = 0.01;
  /* Riemann-Summe über ein feines Gitter im Träger. */
  const s = h / 25;
  let sum = 0, grad = 0;
  for (let x = -2 * h; x <= 2 * h; x += s) for (let y = -2 * h; y <= 2 * h; y += s) for (let z = -2 * h; z <= 2 * h; z += s) {
    const r = Math.hypot(x, y, z);
    sum += K.W(r, h) * s * s * s;
    grad += K.dW(r, h) * s * s * s;
  }
  assert.ok(Math.abs(sum - 1) < 0.01, '∫W dV = ' + sum);
  assert.ok(K.W(0, h) > K.W(h, h) && K.W(h, h) > K.W(1.99 * h, h) && K.W(2 * h, h) === 0, 'fällt und endet bei 2h');
  assert.ok(K.dW(0.5 * h, h) < 0 && K.dW(2 * h, h) === 0 && K.dW(0, h) === 0);
  assert.ok(grad < 0, 'die Ableitung ist im Träger negativ');
  assert.equal(K.SUPPORT, 2);
});

test('Feld: trilineare Abfrage trifft die Gitterpunkte und klemmt außerhalb', () => {
  const dims = [3, 2, 2];
  const data = new Float32Array(12);
  for (let i = 0; i < 12; i++) data[i] = i;
  const f = { dims, origin: [0, 0, 0], cell: 1, data };
  const near = (a, b, tol = 1e-3) => Math.abs(a - b) < tol;
  assert.ok(near(sampleField(f, 0, 0, 0), 0));
  assert.ok(near(sampleField(f, 2, 0, 0), 2), 'am Ende geklemmt auf den letzten Punkt');
  assert.ok(near(sampleField(f, 0.5, 0, 0), 0.5));
  assert.ok(near(sampleField(f, 0, 1, 0), 3));
  assert.ok(near(sampleField(f, 0, 0, 1), 6));
  assert.ok(near(sampleField(f, -5, -5, -5), 0), 'geklemmt');
  assert.ok(sampleField(f, 9, 9, 9) > 10.9, 'geklemmt ans Ende');
});

const spec = { d: 40, length: 80, fill: 0.4, outletW: 20, outletH: 10 };

test('Kammer: der Partikelsatz füllt den Zylinder bis zum Stand des Füllgrads, hydrostatisch', () => {
  const su = D.sleeveSetup(spec, 4, { rho0: 2450, c0: 10 });
  assert.ok(su.n > 300 && su.n < 700, 'Partikel: ' + su.n);
  /* Die Schätzung ist Volumen/d³ — das Gitter lässt an jeder Wand d/2
     frei, in dieser kleinen Kammer ein Drittel. */
  assert.ok(D.particleCountSleeve(spec, 4) > su.n && D.particleCountSleeve(spec, 4) < 1.6 * su.n, 'die Schätzung liegt darüber: ' + D.particleCountSleeve(spec, 4));
  assert.ok(su.yLevel < 0 && su.yLevel > -su.R, 'der Spiegel liegt unter der Achse bei 40 %');
  let ymax = -1, rmax = 0, xmin = 1, xmax = 0;
  for (let i = 0; i < su.n; i++) {
    const x = su.pos[4 * i], y = su.pos[4 * i + 1], z = su.pos[4 * i + 2];
    ymax = Math.max(ymax, y); rmax = Math.max(rmax, Math.hypot(y, z)); xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    assert.equal(su.pos[4 * i + 3], KIND.FLUID);
    assert.ok(su.vel[4 * i + 3] >= 2450 && su.vel[4 * i + 3] < 2470, 'Dichte hydrostatisch: ' + su.vel[4 * i + 3]);
  }
  assert.ok(ymax <= su.yLevel && ymax > su.yLevel - 2 * su.d, 'oben endet es am Spiegel');
  assert.ok(rmax <= su.R - 0.5 * su.d + 1e-9, 'innen im Zylinder');
  assert.ok(xmin >= 0.5 * su.d - 1e-6 && xmax <= su.L - 0.5 * su.d + 1e-6, 'x von d/2 bis L − d/2 (Float32)');
  assert.equal(D.suggestSpacingSleeve(spec, 500), 4.5, 'Vorschlag rund 500 Partikel → 4,5 mm (auf halbe Millimeter)');
});

test('Kammer: in Ruhe unter Schwerkraft bleibt die Dichte bei ρ0 und die Schmelze steht; der Kolben schiebt sie zum Laufkanal', async () => {
  const vRef = 1, c0 = PARAMS.cMach * vRef;
  const su = D.sleeveSetup(spec, 4, { rho0: 2450, c0 });
  const s = createSphSolver(su);
  const dt = suggestDt({ h: su.h, c0, vRef });
  assert.ok(dt > 5e-5 && dt < 2e-4, 'dt ' + dt);
  s.settle(300, dt);
  const t0 = s.totals();
  assert.ok(Math.abs(t0.rhoMean - 2450) / 2450 < 0.03, 'nach dem Zur-Ruhe-Kommen ρ̄ = ' + t0.rhoMean);
  for (let k = 1; k <= 300; k++) s.step(dt, { uIn: 0, step: k, piston: 0 });
  const t1 = s.totals();
  assert.equal(t1.count, su.n, 'kein Partikel verloren');
  assert.ok(Math.abs(t1.rhoMean - 2450) / 2450 < 0.03, 'ρ̄ bleibt: ' + t1.rhoMean);
  const pos = s.positions(), vel = s.velocities();
  let ymax = -1, urms = 0;
  for (let i = 0; i < su.n; i++) { ymax = Math.max(ymax, pos[4 * i + 1]); urms += vel[4 * i] ** 2 + vel[4 * i + 1] ** 2 + vel[4 * i + 2] ** 2; }
  urms = Math.sqrt(urms / su.n);
  assert.ok(Math.abs(ymax - su.yLevel) < 2 * su.d, 'der Spiegel bleibt: ' + ymax + ' gegen ' + su.yLevel);
  assert.ok(urms < 0.1, 'in Ruhe: u_rms ' + urms);
  assert.equal(s.gateArrival[0], NEVER, 'ohne Kolben kommt nichts am Laufkanal an');

  /* Der Kolben mit 0,5 m/s: Kammer voll, wenn er etwa (1 − φ)·L gefahren ist.
     Zur Ruhe kommt die Kammer vorher, außerhalb des Laufs (wie engines/sph.js). */
  const su2 = D.sleeveSetup(spec, 4, { rho0: 2450, c0 });
  const s2 = createSphSolver(su2);
  const u = 0.5;
  s2.settle(100, dt);
  const run = await runSph({
    solver: s2, engine: 'cpu', dt, stepsMax: 3000, snapEvery: 250,
    ctrlAt: step => ({ uIn: u, piston: u * step * dt }),
    onSnapshot: (snap, gateDone) => (gateDone[0] !== NEVER ? 'voll' : null)
  });
  assert.equal(run.reason, 'voll', 'der Laufkanal wird erreicht: ' + run.reason);
  const sFull = u * run.gateDone[0] * dt * 1000;
  assert.ok(sFull > 35 && sFull < 70, 'Kammer voll bei ' + sFull + ' mm Kolbenweg (Kurve: 48)');
  assert.ok(run.snapshots.length >= 3);
  const last = run.snapshots[run.snapshots.length - 1];
  /* Nach Kammer voll läuft der Lauf noch ein Stück — und der Kolben
     drückt dabei Schmelze durch den Laufkanal hinaus. */
  assert.ok(last.n > 0.4 * su2.n && last.n < su2.n, 'Schmelze am Ende: ' + last.n + ' von ' + su2.n);
  const atFull = run.snapshots.filter(sn => sn.step <= run.gateDone[0]).pop();
  assert.ok(atFull.n > 0.9 * su2.n, 'bis Kammer voll fast alles noch da: ' + atFull.n);
  assert.ok(last.uMax > 0.3 && last.uMax < 0.5 * c0, 'sie bewegt sich: ' + last.uMax);
  let xmin = 1e9;
  for (let i = 0; i < last.n; i++) xmin = Math.min(xmin, last.pos[3 * i]);
  assert.ok(xmin >= sFull - 5, 'nichts hinter dem Kolben: ' + xmin + ' gegen ' + sFull);
  const air = D.enclosedAirSleeve(last.pos, last.n, su2, sFull * 1e-3, 1.5 * su2.d, 1e-3);
  assert.ok(air.enclosed >= 0 && air.cells > 0 && air.bubbles >= 0);
  const scale = speedScaleParticles(run.snapshots);
  assert.ok(scale > 0 && scale <= last.uMax + 1e-9, 'Skala ' + scale);
  assert.equal(speedScaleParticles([run.snapshots[0]]), 0);
});

test('Anguss: Pressrest voll, dahinter die Säule; das Abstandsfeld ist innen negativ; die ersten Schritte schieben die Front', async () => {
  const g = PRE.demoTwoGates();
  const proc = { ...F.DEFAULT_PROCESS };
  F.applyAutoGates(g, proc);
  /* 6 mm: die Kanäle des Beispiels sind gut zwei Partikel tief — gröber
     passt kein Partikel mehr hinein. */
  const d = 6;
  const su = await D.runnerSetup(g, d, { rho0: 2450, c0: 200, travel: 30 });
  assert.ok(su.nFluid > 50 && su.nInflow > 50, 'Pressrest ' + su.nFluid + ', Säule ' + su.nInflow);
  assert.ok(Math.abs(su.n - D.particleCountRunner(g, d, 30)) < 0.4 * su.n, 'Schätzung ' + D.particleCountRunner(g, d, 30) + ' gegen ' + su.n);
  assert.equal(su.gates, 2);
  assert.equal(su.boundary.type, 'grid');
  /* Die Drossel: zwei gleiche Anschnitte teilen sich den Kolbenstrom. */
  assert.equal(su.gateRate.length, 2);
  const A = Math.PI * 0.045 * 0.045;
  assert.ok(Math.abs(su.gateRate[0] - 0.5 * A / (0.006 ** 3)) / su.gateRate[0] < 1e-6 && Math.abs(su.gateRate[0] - su.gateRate[1]) < 1e-6, 'Rate ' + su.gateRate[0]);
  /* Die Melderzone: vor jedem Anschnitt mehr Zellen als die Gitterseite
     hat, und jeder Anschnitt hat welche. */
  const sens = su.boundary.flags.sensor, lbmSens = su.lbm.sensor, fl = su.boundary.flags.data;
  let mine = [0, 0, 0], theirs = 0, outMine = 0, outTheirs = 0;
  for (let i = 0; i < sens.length; i++) {
    if (sens[i]) mine[sens[i]]++; if (lbmSens[i]) theirs++;
    if (fl[i] === FLAG.OUTLET) outMine++; if (su.lbm.flags[i] === FLAG.OUTLET) outTheirs++;
  }
  assert.ok(mine[1] > 0 && mine[2] > 0 && mine[1] + mine[2] > theirs, 'Melder je Anschnitt: ' + mine.slice(1) + ' gegen ' + theirs);
  assert.ok(outMine > outTheirs, 'der Auslass rückt dorthin, wo ein Partikel hinkommt: ' + outMine + ' gegen ' + outTheirs);
  /* Der Melder liegt, wo ein Partikel stehen kann: im Feld tiefer als d/2. */
  let deep = 0, all = 0;
  for (let i = 0; i < sens.length; i++) if (sens[i] && !lbmSens[i]) { all++; if (su.sdf.data[i] <= -0.5 * su.d) deep++; }
  assert.ok(deep > 0.3 * all, 'Melderzellen tief genug: ' + deep + ' von ' + all);
  const axis = su.inflow.axis;
  let fluidMin = Infinity, inflowMax = -Infinity;
  for (let i = 0; i < su.n; i++) {
    const a = su.pos[4 * i] * axis[0] + su.pos[4 * i + 1] * axis[1] + su.pos[4 * i + 2] * axis[2];
    if (su.pos[4 * i + 3] === KIND.FLUID) fluidMin = Math.min(fluidMin, a); else inflowMax = Math.max(inflowMax, a);
  }
  assert.ok(fluidMin > su.inflow.plane && inflowMax < su.inflow.plane, 'die Ebene trennt Pressrest und Säule');
  /* Das Feld: in der Mitte des Pressrests negativ, weit draußen positiv. */
  const b = g.biscuit;
  const mid = [b.pos[0] - axis[0] * b.t / 2, b.pos[1] - axis[1] * b.t / 2, b.pos[2] - axis[2] * b.t / 2].map(v => v * 1e-3);
  assert.ok(sampleField(su.sdf, mid[0], mid[1], mid[2]) < 0, 'innen negativ');
  const far = [b.pos[0] + b.d, b.pos[1] + b.d, b.pos[2] + b.d].map(v => v * 1e-3);
  assert.ok(sampleField(su.sdf, far[0], far[1], far[2]) > 0, 'draußen positiv');
  const f0 = D.runnerFillFraction(su.pos.filter((_, i) => i % 4 !== 3), su.n, su);
  assert.ok(f0 < 0.05, 'der Anguss ist leer (bis auf die Zellen an der Mündung): ' + f0);

  const s = createSphSolver(su);
  const dt = suggestDt({ h: su.h, c0: 200, vRef: 20 });
  const u = 3.0;
  for (let k = 1; k <= 400; k++) s.step(dt, { uIn: u, step: k });
  assert.ok(u * 400 * dt > 1.2 * su.d, 'die Säule ist mehr als einen Abstand gefahren');
  const t = s.totals();
  assert.ok(t.count > su.nFluid, 'aus der Säule ist Schmelze geworden: ' + t.count + ' > ' + su.nFluid);
  assert.ok(Math.abs(t.rhoMean - 2450) / 2450 < 0.05, 'ρ̄ ' + t.rhoMean);
  const snap = snapshotOf(s.positions(), s.velocities(), su.n, 400);
  assert.equal(snap.n, t.count);
  assert.ok(snap.uMax > 0.5 * u, 'die Schmelze fährt mit: ' + snap.uMax);
  let top = 0; for (let i = 0; i < snap.n; i++) top = Math.max(top, snap.speed[i]);
  assert.equal(top, 255);
  const f1 = D.runnerFillFraction(snap.pos, snap.n, su, 1e-3);
  /* Der Lauf führt je Anschnitt einen Melder, auch wenn der Kern (GPU)
     keine Ankunftsliste anbietet. */
  const fake = { n: 0, positions: () => new Float32Array(0), velocities: () => new Float32Array(0), step() {}, gateArrival: new Uint32Array(2).fill(NEVER) };
  const r0 = await runSph({ solver: fake, engine: 'cpu', dt, stepsMax: 1, snapEvery: 1, ctrlAt: () => ({ uIn: 0 }), gates: su.gates });
  assert.equal(r0.gateDone.length, 2);
  assert.ok(f1 > 0, 'die Front steht im Anguss: ' + f1);
  for (let i = 0; i < snap.n; i++) {
    const phi = sampleField(su.sdf, snap.pos[3 * i] * 1e-3, snap.pos[3 * i + 1] * 1e-3, snap.pos[3 * i + 2] * 1e-3);
    assert.ok(phi < 0.3 * su.d, 'kein Partikel im Stahl: φ = ' + phi);
  }
});
