/* Der Lauf — gemeinsam für Anguss und Füllkammer, und (runPackets, tick,
   nextTask) für beide Rechenverfahren: js/sph/run.js fährt seine Schleife
   damit ebenso, nur je Partikel statt je Zelle (dort beschrieben).

   Schritte in Paketen, dazwischen ein Bild — Füllstand und Betrag der
   Geschwindigkeit, je ein Byte je Zelle —, Melder auslesen, den Aufrufer zu Wort
   kommen lassen: Fortschritt, Abbruch, Ende. Auf der Grafikkarte ist
   ein Paket ein Befehlspuffer und das Bild ein Lesen; in JavaScript
   werden die Schritte einzeln gerechnet und die Seite bekommt alle
   paar Dutzend Millisekunden das Bild zurück.

   Ein Abbruch (signal.aborted) verlässt runPackets als AbortError
   (js/abort.js) — nicht als Ergebnis mit reason „abgebrochen": der Adapter
   (js/simulation/engines/lbm.js, engines/sph.js) fängt ihn zusammen mit
   einer verlorenen Grafikkarte (env.js, gpuFailure) und muss dafür kein
   Ergebnis mehr auf eine magische Zeichenkette prüfen. */

import { abortError } from '../abort.js';
import { NEVER, NO_PLUNGER, FLAG } from './lattice.js';

/** Eine Aufgabe später, ungedrosselt: eine Nachricht an sich selbst. Anders
    als setTimeout, das der Browser in einem verborgenen Reiter auf eine
    Sekunde (nach Minuten auf eine je Minute) streckt. Unter Node ohne
    MessageChannel: setTimeout. */
export function nextTask() {
  if (typeof MessageChannel !== 'function') return new Promise(r => setTimeout(r, 0));
  return new Promise(resolve => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
    ch.port2.postMessage(0);
  });
}

/** Dem Browser Luft lassen: ein Bild lang (requestAnimationFrame), damit er
    Fortschritt und Bild zeichnet — solange die Seite zu sehen ist. In einem
    Reiter im Hintergrund kommt dieses Bild NIE, und bis 2026-09-22 stand der
    Lauf dort still, bis man zurückkam. Verborgen geht es deshalb mit
    nextTask() weiter, und wird die Seite verborgen, während das Bild noch
    aussteht, ebenso. Ohne Seite (Node): setTimeout. */
export function tick() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (typeof requestAnimationFrame !== 'function' || !doc) return new Promise(r => setTimeout(r, 0));
  if (doc.hidden) return nextTask();
  return new Promise(resolve => {
    let done = false;
    const go = () => { if (done) return; done = true; doc.removeEventListener('visibilitychange', go); resolve(); };
    requestAnimationFrame(go);
    doc.addEventListener('visibilitychange', go);
  });
}

/** Alle 40 ms Rechnen ein Bild lang Luft holen (siehe Kopf der Datei) — und die
    Uhr dann NEU stellen: stand sie still, wartete die Schleife ab den ersten
    40 ms nach JEDEM Schritt auf das nächste Bild (gemessen 15,8 ms je Schritt
    bei 2,3 ms Rechnen, ein Gitterlauf 66 s statt 28 s, 2026-09-19). Die
    Schritte selbst und ihre Reihenfolge bleiben dieselben — nur der JavaScript-
    Zweig braucht das (die Grafikkarte rechnet ein ganzes Paket am Stück). */
export function stepClock(onWork) {
  let t0 = performance.now();
  return async step => {
    if (onWork && performance.now() - t0 > 40) { onWork(step); await tick(); t0 = performance.now(); }
  };
}

/**
 * Die Schleife in Paketen — gemeinsam für js/lbm/run.js (Zellen) und
 * js/sph/run.js (Partikel): wie weit ein Paket reicht, wann aufgehört wird,
 * der Abbruch. Was EIN Paket tut (die Grafikkarte einen Befehlspuffer
 * abschicken lassen oder in JavaScript einzeln schreiten) weiß nur der
 * Aufrufer — er liefert es über `advance`.
 *   stepsMax        höchstens so viele Schritte
 *   snapEvery       ein Paket alle so viel Schritte (kürzer, wenn `onSnapshot`
 *                   schon einen Grund zum Aufhören nennt — noch ein Stück für
 *                   das Bild, dann Schluss)
 *   initial         das Bild bei Schritt 0 (fertig, ohne Geschwindigkeit)
 *   gateCount       Zahl der Melder
 *   advance(step, n) → { step, snap, gate }   n Schritte weiter; `gate` sind
 *                   die Ankunftsschritte des Pakets (Länge gateCount)
 *   onSnapshot(snap, gateDone, step)   nach jedem Paket; ein Grund zum
 *                   Aufhören (Text) oder nichts
 *   signal          AbortSignal: abgebrochen wird zwischen zwei Paketen
 * → { snapshots, gateDone, steps, reason }
 * Ein Abbruch verlässt die Funktion als AbortError (js/abort.js), nicht als
 * Ergebnis — siehe Kopf der Datei.
 */
export async function runPackets({ stepsMax, snapEvery, signal, initial, gateCount, advance, onSnapshot }) {
  const isCancelled = () => !!(signal && signal.aborted);
  const gateDone = new Array(gateCount).fill(NEVER);
  const snapshots = [initial];
  let step = 0, stopAt = Infinity, reason = '';
  while (step < stepsMax && step < stopAt && !isCancelled()) {
    const n = Math.min(snapEvery, stepsMax - step, stopAt - step);
    const { step: next, snap, gate } = await advance(step, n);
    step = next;
    for (let k = 0; k < gateDone.length; k++) gateDone[k] = gate[k];
    snapshots.push(snap);
    const why = onSnapshot ? onSnapshot(snap, gateDone, step) : null;
    if (why && stopAt === Infinity) {
      /* Noch ein Stück für das Bild, dann Schluss. */
      stopAt = Math.min(stepsMax, step + Math.max(snapEvery, Math.round(step * 0.05)));
      reason = why;
    }
    await tick();
  }
  if (isCancelled()) throw abortError();
  if (!reason) reason = 'Schrittgrenze erreicht';
  return { snapshots, gateDone, steps: step, reason };
}

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
 *   signal     AbortSignal: abgebrochen wird zwischen zwei Bildern (als
 *              AbortError, siehe runPackets)
 * → { snapshots: [{ step, fill: Uint8Array, speed: Uint8Array, uMax }], arrival, gateDone, steps, reason }
 *   speed ist |u| je Schmelzezelle als Byte, 255 = uMax dieses Bildes
 *   (Gittereinheiten); Gaszellen tragen 0.
 */
export async function runSimulation(opts) {
  const { solver, engine, domain, stepsMax, snapEvery, uAt, ipAt, onSnapshot, onWork, signal } = opts;
  const N = domain.N;
  const toBytes = fill => {
    const u8 = new Uint8Array(N);
    for (let i = 0; i < N; i++) { const e = fill[i]; u8[i] = e >= 1 ? 255 : e <= 0 ? 0 : Math.round(e * 255); }
    return u8;
  };
  /* Der Betrag der Geschwindigkeit, auf das Maximum des Bildes bezogen:
     so bleibt ein Bild ein Byte je Zelle, ohne dass die Skala des Laufs
     vorab bekannt sein müsste (js/lbm/paint.js legt sie hinterher). */
  const speedBytes = (vel, fill) => {
    const sp = new Float32Array(N);
    let uMax = 0;
    for (let i = 0; i < N; i++) {
      if (!(fill[i] > 0)) continue;
      const ux = vel[i], uy = vel[N + i], uz = vel[2 * N + i];
      const s = Math.sqrt(ux * ux + uy * uy + uz * uz);
      sp[i] = s;
      if (s > uMax) uMax = s;
    }
    const u8 = new Uint8Array(N);
    if (uMax > 0) for (let i = 0; i < N; i++) u8[i] = Math.round(sp[i] / uMax * 255);
    return { speed: u8, uMax };
  };
  const initialFill = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const fl = domain.flags[i];
    initialFill[i] = fl === FLAG.FLUID || fl === FLAG.INLET ? 1 : fl === FLAG.INTERFACE ? 0.5 : 0;
  }
  const initial = { step: 0, fill: toBytes(initialFill), speed: new Uint8Array(N), uMax: 0 };
  const ip = s => (ipAt ? ipAt(s) : NO_PLUNGER);

  /* Ein Paket weiter: auf der Grafikkarte ein Befehlspuffer, in JavaScript die
     Schritte einzeln (mit Atempausen, stepClock). */
  const advance = async (step, n) => {
    let fill, vel, gate;
    if (engine === 'gpu') {
      const uIns = [], ips = [];
      for (let k = 1; k <= n; k++) { uIns.push(uAt(step + k)); ips.push(ip(step + k)); }
      solver.run(uIns, step + 1, ips);
      step += n;
      const [f, gates, u] = await Promise.all([solver.readFill(), solver.readGates(), solver.readVelocity()]);
      fill = f; vel = u; gate = gates;
    } else {
      const yieldMaybe = stepClock(onWork);
      for (let k = 1; k <= n; k++) {
        step++;
        solver.step(uAt(step), step, ip(step));
        await yieldMaybe(step);
      }
      fill = solver.fill(); vel = solver.velocity(); gate = solver.gateArrival;
    }
    return { step, gate, snap: { step, fill: toBytes(fill), ...speedBytes(vel, fill) } };
  };

  const run = await runPackets({
    stepsMax, snapEvery, signal, initial, gateCount: (domain.gates || []).length, advance, onSnapshot
  });
  const arrival = engine === 'gpu' ? await solver.readArrival() : solver.arrival().slice();
  return { ...run, arrival };
}
