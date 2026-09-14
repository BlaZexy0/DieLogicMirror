/* Der Lauf — gemeinsam für Anguss und Füllkammer.

   Schritte in Paketen, dazwischen ein Bild des Füllstands (Momentauf-
   nahme als Byte je Zelle), Melder auslesen, den Aufrufer zu Wort
   kommen lassen: Fortschritt, Abbruch, Ende. Auf der Grafikkarte ist
   ein Paket ein Befehlspuffer und das Bild ein Lesen; in JavaScript
   werden die Schritte einzeln gerechnet und die Seite bekommt alle
   paar Dutzend Millisekunden das Bild zurück. */

import { NEVER, NO_PLUNGER, FLAG } from './lattice.js';

const tick = () => new Promise(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/**
 * Den Lauf fahren.
 *   solver     aus createSolver (JavaScript) oder createGpuSolver
 *   engine     'gpu' | 'cpu'
 *   domain     das Gitter (N, flags, gates)
 *   stepsMax   höchstens so viele Schritte
 *   snapEvery  Bild alle so viel Schritte
 *   uAt(step)  Kolbengeschwindigkeit [x,y,z] in Gittereinheiten
 *   ipAt(step) Kolbenschicht (wahlweise), sonst NO_PLUNGER
 *   onSnapshot(snap, gateDone)   nach jedem Bild; liefert einen Grund zum
 *              Aufhören (Text) oder nichts
 *   isCancelled()
 * → { snapshots: [{ step, fill: Uint8Array }], arrival, gateDone, steps, reason }
 */
export async function runSimulation(opts) {
  const { solver, engine, domain, stepsMax, snapEvery, uAt, ipAt, onSnapshot, isCancelled } = opts;
  const N = domain.N;
  const snapshots = [];
  const gateDone = new Array((domain.gates || []).length).fill(NEVER);
  const toBytes = fill => {
    const u8 = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const e = fill[i]; u8[i] = e >= 1 ? 255 : e <= 0 ? 0 : Math.round(e * 255); }
    return u8;
  };
  const initial = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const fl = domain.flags[i];
    initial[i] = fl === FLAG.FLUID || fl === FLAG.INLET ? 1 : fl === FLAG.INTERFACE ? 0.5 : 0;
  }
  snapshots.push({ step: 0, fill: toBytes(initial) });
  let step = 0, stopAt = Infinity, reason = '';
  const ip = s => (ipAt ? ipAt(s) : NO_PLUNGER);
  while (step < stepsMax && step < stopAt && !(isCancelled && isCancelled())) {
    const n = Math.min(snapEvery, stepsMax - step, stopAt - step);
    let fill;
    if (engine === 'gpu') {
      const uIns = [], ips = [];
      for (let k = 1; k <= n; k++) { uIns.push(uAt(step + k)); ips.push(ip(step + k)); }
      solver.run(uIns, step + 1, ips);
      step += n;
      const [f, gates] = await Promise.all([solver.readFill(), solver.readGates()]);
      for (let k = 0; k < gateDone.length; k++) gateDone[k] = gates[k];
      fill = f;
    } else {
      const t0 = performance.now();
      for (let k = 1; k <= n; k++) {
        step++;
        solver.step(uAt(step), step, ip(step));
        if (performance.now() - t0 > 40 && opts.onWork) { opts.onWork(step); await tick(); }
      }
      for (let k = 0; k < gateDone.length; k++) gateDone[k] = solver.gateArrival[k];
      fill = solver.fill();
    }
    const snap = { step, fill: toBytes(fill) };
    snapshots.push(snap);
    const why = onSnapshot ? onSnapshot(snap, gateDone, step) : null;
    if (why && stopAt === Infinity) {
      /* Noch ein Stück für das Bild, dann Schluss. */
      stopAt = Math.min(stepsMax, step + Math.max(snapEvery, Math.round(step * 0.05)));
      reason = why;
    }
    await tick();
  }
  if (isCancelled && isCancelled()) reason = 'abgebrochen';
  else if (!reason) reason = 'Schrittgrenze erreicht';
  const arrival = engine === 'gpu' ? await solver.readArrival() : solver.arrival().slice();
  return { snapshots, arrival, gateDone, steps: step, reason };
}
