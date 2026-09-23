/* Der Lauf der Partikelrechnung — gemeinsam für Anguss und Kammer.

   Schritte in Paketen, dazwischen ein Bild: die Orte der Schmelze-
   partikel (mm, drei Gleitkommazahlen) und der Betrag ihrer
   Geschwindigkeit als Byte auf das Maximum des Bildes bezogen — wie bei
   der Gitterrechnung (js/lbm/run.js), nur je Partikel statt je Zelle.
   Melder auslesen, den Aufrufer zu Wort kommen lassen: Fortschritt,
   Abbruch, Ende. Die Zustromsäule hinter dem Pressrest ist nicht im
   Bild — sie ist die Füllkammer, nicht der Anguss.

   Die Schleife selbst (Pakete, Abbruch, wann aufgehört wird) kommt aus
   js/lbm/run.js (runPackets) — dort beschrieben, mit dem Gitter geteilt;
   was hier bleibt, ist EIN Paket weiter: auf der Grafikkarte ein
   Befehlspuffer, in JavaScript die Schritte einzeln, dazu das Bild aus
   Orten und Geschwindigkeiten (snapshotOf) statt aus Zellwerten. */

import { KIND } from './wcsph.js';
/* Der Rahmen der Schleife (Pakete, Abbruch) und die Atempausen kommen aus
   der Gitterrechnung — siehe oben. */
import { runPackets, stepClock } from '../lbm/run.js';

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
 *   onSnapshot(snap, gateDone, step) → Grund zum Aufhören oder nichts
 *   onWork(step), signal (AbortSignal)
 * → { snapshots, gateDone, steps, reason }
 *
 * Zur Ruhe kommt die Kammer VOR dem Lauf (engines/sph.js): dort lässt es
 * sich unterbrechen, und die Uhr des Tempos läuft erst danach.
 */
export async function runSph(opts) {
  const { solver, engine, dt, stepsMax, snapEvery, ctrlAt, onSnapshot, onWork, signal } = opts;
  const n = solver.n;
  const gateCount = opts.gates || solver.gates || (solver.gateArrival ? solver.gateArrival.length : 1);
  const initial = engine === 'gpu'
    ? snapshotOf(await solver.readPositions(), await solver.readVelocities(), n, 0)
    : snapshotOf(solver.positions(), solver.velocities(), n, 0);
  initial.uMax = 0; initial.speed.fill(0);

  /* Ein Paket weiter: auf der Grafikkarte ein Befehlspuffer, in JavaScript die
     Schritte einzeln (mit Atempausen, stepClock). */
  const advance = async (step, m) => {
    let snap, gate;
    if (engine === 'gpu') {
      const ctrls = [];
      for (let k = 1; k <= m; k++) { const c = ctrlAt(step + k); ctrls.push({ dt, uIn: c.uIn, piston: c.piston, step: step + k }); }
      solver.run(ctrls);
      step += m;
      const [p, v, g] = await Promise.all([solver.readPositions(), solver.readVelocities(), solver.readGates()]);
      gate = g;
      snap = snapshotOf(p, v, n, step);
    } else {
      const yieldMaybe = stepClock(onWork);
      for (let k = 1; k <= m; k++) {
        step++;
        const c = ctrlAt(step);
        solver.step(dt, { uIn: c.uIn, piston: c.piston, step });
        await yieldMaybe(step);
      }
      gate = solver.gateArrival;
      snap = snapshotOf(solver.positions(), solver.velocities(), n, step);
    }
    return { step, gate, snap };
  };

  return runPackets({ stepsMax, snapEvery, signal, initial, gateCount, advance, onSnapshot });
}
