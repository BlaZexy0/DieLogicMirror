/* Der Lauf der Partikelrechnung — gemeinsam für Anguss und Kammer.

   Schritte in Paketen, dazwischen ein Bild: die Orte der Schmelze-
   partikel (mm, drei Gleitkommazahlen) und der Betrag ihrer
   Geschwindigkeit als Byte auf das Maximum des Bildes bezogen — wie bei
   der Gitterrechnung (js/lbm/run.js), nur je Partikel statt je Zelle.
   Melder auslesen, den Aufrufer zu Wort kommen lassen: Fortschritt,
   Abbruch, Ende. Die Zustromsäule hinter dem Pressrest ist nicht im
   Bild — sie ist die Füllkammer, nicht der Anguss. */

import { NEVER, KIND } from './wcsph.js';

const tick = () => new Promise(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/** Ein Bild aus Orten und Geschwindigkeiten (Float32Array 4·n): nur
    die Schmelze, Orte in mm, Geschwindigkeit als Byte. */
export function snapshotOf(pos, vel, n, step) {
  let m = 0;
  for (let i = 0; i < n; i++) if (pos[4 * i + 3] === KIND.FLUID) m++;
  const out = new Float32Array(3 * m), sp = new Float32Array(m);
  let uMax = 0, q = 0;
  for (let i = 0; i < n; i++) {
    if (pos[4 * i + 3] !== KIND.FLUID) continue;
    out[3 * q] = pos[4 * i] * 1e3; out[3 * q + 1] = pos[4 * i + 1] * 1e3; out[3 * q + 2] = pos[4 * i + 2] * 1e3;
    const s = Math.hypot(vel[4 * i], vel[4 * i + 1], vel[4 * i + 2]);
    sp[q] = s;
    if (s > uMax) uMax = s;
    q++;
  }
  const speed = new Uint8Array(m);
  if (uMax > 0) for (let i = 0; i < m; i++) speed[i] = Math.round(sp[i] / uMax * 255);
  return { step, n: m, pos: out, speed, uMax };
}

/**
 * Den Lauf fahren.
 *   solver      aus createSphSolver oder createGpuSphSolver
 *   engine      'gpu' | 'cpu'
 *   dt          Zeitschritt s
 *   stepsMax, snapEvery
 *   ctrlAt(step) → { uIn, piston }
 *   gates        Zahl der Melder (sonst die des Kerns)
 *   settleSteps  Schritte zum Zur-Ruhe-Kommen vor dem Start (wahlweise)
 *   onSnapshot(snap, gateDone, step) → Grund zum Aufhören oder nichts
 *   onWork(step), isCancelled()
 * → { snapshots, gateDone, steps, reason }
 */
export async function runSph(opts) {
  const { solver, engine, dt, stepsMax, snapEvery, ctrlAt, onSnapshot, onWork, signal, settleSteps = 0 } = opts;
  const isCancelled = () => (opts.isCancelled && opts.isCancelled()) || (signal && signal.aborted);
  const n = solver.n;
  const gateDone = new Array(opts.gates || solver.gates || (solver.gateArrival ? solver.gateArrival.length : 1)).fill(NEVER);
  if (settleSteps > 0) {
    if (engine === 'gpu') await solver.settle(settleSteps, dt);
    else solver.settle(settleSteps, dt);
  }
  const snapshots = [];
  const first = engine === 'gpu'
    ? snapshotOf(await solver.readPositions(), await solver.readVelocities(), n, 0)
    : snapshotOf(solver.positions(), solver.velocities(), n, 0);
  first.uMax = 0; first.speed.fill(0);
  snapshots.push(first);
  let step = 0, stopAt = Infinity, reason = '';
  while (step < stepsMax && step < stopAt && !(isCancelled && isCancelled())) {
    const m = Math.min(snapEvery, stepsMax - step, stopAt - step);
    let snap;
    if (engine === 'gpu') {
      const ctrls = [];
      for (let k = 1; k <= m; k++) { const c = ctrlAt(step + k); ctrls.push({ dt, uIn: c.uIn, piston: c.piston, step: step + k }); }
      solver.run(ctrls, step + 1);
      step += m;
      const [p, v, g] = await Promise.all([solver.readPositions(), solver.readVelocities(), solver.readGates()]);
      for (let k = 0; k < gateDone.length; k++) gateDone[k] = g[k];
      snap = snapshotOf(p, v, n, step);
    } else {
      const t0 = performance.now();
      for (let k = 1; k <= m; k++) {
        step++;
        const c = ctrlAt(step);
        solver.step(dt, { uIn: c.uIn, piston: c.piston, step });
        if (performance.now() - t0 > 40 && onWork) { onWork(step); await tick(); }
      }
      for (let k = 0; k < gateDone.length; k++) gateDone[k] = solver.gateArrival[k];
      snap = snapshotOf(solver.positions(), solver.velocities(), n, step);
    }
    snapshots.push(snap);
    const why = onSnapshot ? onSnapshot(snap, gateDone, step) : null;
    if (why && stopAt === Infinity) {
      stopAt = Math.min(stepsMax, step + Math.max(snapEvery, Math.round(step * 0.05)));
      reason = why;
    }
    await tick();
  }
  if (isCancelled && isCancelled()) reason = 'abgebrochen';
  else if (!reason) reason = 'Schrittgrenze erreicht';
  return { snapshots, gateDone, steps: step, reason };
}
