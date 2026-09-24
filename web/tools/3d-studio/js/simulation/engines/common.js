/* Was engines/lbm.js und engines/sph.js gemeinsam haben: derselbe Rahmen um
   zwei ganz verschiedene Kerne, damit core.js nie wissen muss, welches
   Verfahren gerade läuft. Der Rahmen:

     kernelOf(opts)         GPU oder JavaScript, wie env.js und forceCpu es sagen
     RANGE                  die Grenzen der Auflösung, Anguss und Kammer
     FRAMES(kind)           Bilder je Lauf — dieselbe Zahl in estimate() UND
                             in run() (der snapEvery folgt ihr), sonst driften
                             Schätzung und Rechnung auseinander
     kammerVref(problem)    Bezugsgeschwindigkeit der Kammer, nie unter 0,5 m/s
     sleeveEnd(problem, cell)   wo die Kammerrechnung aufhört (Zellen vor der Stirnwand)
     withSolver(label, opts, body)   Abbruch, Kern, Uhr, ein Bild abgeben, dann
                             body(kernel, ctx) — und am Ende Fehler und
                             Aufräumen gemeinsam (gpuFailure, solver.dispose)
     firstArrival(gateDone)  früheste Ankunft eines Melders (NEVER sonst)
     runnerOutcome(out, …)   was beide Verfahren nach einem Anguss-Lauf gleich
                             zusammenstellen: Ende, Melder, Füllgrad
     sleeveOutcome(out, …)   … nach einem Kammer-Lauf: Ende, „Kammer voll", Luft
     airMaxOf(snapshots)     das Bild mit der meisten eingeschlossenen Luft
                             (auch vom Metamodell, engines/meta.js)
     tooFine(count, limit, unit, verb)   die „Zu fein"-Zeile unter dem Feld
     noWebGpuNote(clause, limit, unit, extra)   die Zeile ohne WebGPU

   Was je Verfahren eigen bleibt (die Kerne, die Einheiten der Rechnung, die
   Felder von finish()) steht weiter in lbm.js und sph.js. */

import { abortError } from '../../abort.js';
import { NEVER } from '../../lbm/lattice.js';
import { env, runClock, gpuFailure, tick, fmtCount } from './env.js';

/** GPU, wenn env.gpu es sagt und forceCpu (Test/Vergleich) es nicht abschaltet. */
export const kernelOf = opts => (env.gpu && !(opts && opts.forceCpu) ? 'gpu' : 'cpu');

/** Die Grenzen der Zellkante bzw. des Partikelabstands — für beide Verfahren
    dieselben, Anguss und Kammer je eigene. */
export const RANGE = problem => (problem && problem.kind === 'kammer' ? [0.5, 30] : [0.5, 20]);

/** Bilder je Lauf: die estimate()-Schätzung und der snapEvery von run() müssen
    sich hier EINIG sein, sonst weiß die Zeile „grob … s" nicht, wie viele
    Bilder der Lauf wirklich abgibt. */
export const FRAMES = kind => (kind === 'kammer' ? 100 : 80);

/** Bezugsgeschwindigkeit der Kammer für Zeitschritt/Zähigkeit: die Welle ist
    nicht viel schneller als der Kolben, aber ein sehr langsamer Kolben soll
    keinen winzigen Zeitschritt erzwingen. */
export const kammerVref = problem => Math.max(problem.curve.profile.vmax, 0.5);

/** Das Ende der Kammerrechnung hängt an der Zellkante: drei Zellen vor der
    Stirnwand ist Schluss, sonst führe der Kolben in den Auslass. */
export function sleeveEnd(problem, cell) {
  const { profile } = problem.curve;
  const sEnd = Math.min(profile.travel * 1000, problem.spec.length - 3 * cell);
  return { sEnd, tEnd: profile.atPos(sEnd / 1000).t };
}

/**
 * Der Rahmen jedes Laufs: Abbruch prüfen, Kern wählen, die Uhr, ein Bild
 * abgeben — dann kind-spezifisch weiter (`body`) —, und am Ende Fehler und
 * Aufräumen gemeinsam. Der Abbruch erreicht die Kerne trotzdem sofort: run.js
 * fragt das Signal nur zwischen zwei Bildern, aber `ctx.check` wird je
 * SCHRITT nach der Kolbengeschwindigkeit gerufen (uAt/ctrlAt der Verfahren).
 *
 * Umgekehrt ist nicht jeder AbortError ein Abbruch: eine verlorene
 * Grafikkarte meldet sich beim Lesen genau so (gpuFailure prüft signal.aborted).
 *   label   die erste Fortschrittszeile ('Gitter …' / 'Partikel …')
 *   body(kernel, ctx) → Ergebnis; ctx = { check, progress, signal, t0, clock, own }
 *           own(solver) merkt den Kern für dispose() im finally vor
 */
export async function withSolver(label, opts, body) {
  const { signal, progress = () => {} } = opts;
  const check = () => { if (signal && signal.aborted) throw abortError(); };
  const kernel = kernelOf(opts);
  const t0 = performance.now(), clock = runClock();
  let solver = null;
  try {
    progress(0, label);
    await tick();
    const ctx = { check, progress, signal, t0, clock, own: s => { solver = s; } };
    return await body(kernel, ctx);
  } catch (err) {
    throw gpuFailure(err, signal);
  } finally {
    if (solver && solver.dispose) solver.dispose();
  }
}

/** Frühester Melder (NEVER, wenn keiner meldete) — für finish()s `until`
    (die Farbskala gilt nur bis zur ersten Ankunft, danach herrschen die
    Anschnitte bzw. der Laufkanal). */
export const firstArrival = gateDone => Math.min(...gateDone.filter(a => a !== NEVER), Infinity);

/** Was beide Verfahren nach einem Anguss-Lauf gleich zusammenstellen: der
    Grund fürs Ende (nicht „Schrittgrenze erreicht" — das sagt nichts über
    Kurve oder Zeitgrenze), die Melder je Anschnitt, der Füllgrad am Ende.
    `gates` ist die Liste der Anschnitte (domain.gates bzw. setup.lbm.gates),
    `tEnd` das Ende der Kurve (piston.tEnd). */
export function runnerOutcome(out, { run, gates, gateDone, dt, tMax, tEnd, snapshots }) {
  out.reason = run.reason === 'Schrittgrenze erreicht' ? (tMax >= tEnd - 1e-9 ? 'die Kurve endet' : 'Zeitgrenze erreicht') : run.reason;
  out.facts.unshift(['Ende', out.reason]);
  out.gates = gates.map((gt, k) => ({ id: gt.id, step: gateDone[k], tSim: gateDone[k] === NEVER ? NaN : gateDone[k] * dt }));
  out.filled = snapshots[snapshots.length - 1].filled;
  return out;
}

/** … nach einem Kammer-Lauf: „Kammer voll" oder das Ende der Kurve, die Luft.
    `sAtMm(step)` ist der Kolbenweg zum Schritt in MILLIMETERN (js/lbm/engines
    hat das schon, js/sph/engines rechnet von Metern um). */
export function sleeveOutcome(out, { run, gateDone, sAtMm, dt, snapshots }) {
  out.reason = run.reason === 'Schrittgrenze erreicht' ? 'der Kolben ist am Ende der Kurve' : run.reason;
  out.full = gateDone[0] !== NEVER ? { t: gateDone[0] * dt, s: sAtMm(gateDone[0]) } : null;
  out.facts.unshift(['Ende', out.full ? 'Kammer voll' : 'Ende der Kurve']);
  out.airMax = airMaxOf(snapshots);
  return out;
}

/** Das Bild mit der meisten eingeschlossenen Luft — Gitter, Partikel und
    Metamodell fragen alle dasselbe. */
export const airMaxOf = snapshots => snapshots.reduce((a, s) => (s.air > a.air ? s : a), snapshots[0]);

/** Die Zeile „Zu fein …": `unit` ist Zellen/Partikel, `verb` sagt, was zu
    vergrößern ist. blockedShort steht unter dem Knopf (jeder Modus),
    blocked im Modus „Simulation" (blockedShort + der Rat). */
export function tooFine(count, limit, unit, verb) {
  if (!(count > limit)) return { blocked: '', blockedShort: '' };
  const blockedShort = 'Zu fein: höchstens ' + fmtCount(limit) + ' ' + unit + '.';
  return { blocked: blockedShort + ' ' + verb + '.', blockedShort };
}

/** Die Zeile ohne WebGPU: „gerechnet wird in JavaScript, <clause> (bis <limit>
    <unit>)<extra>. Chrome oder Edge rechnen auf der Grafikkarte." — `unit`
    steht MIT führendem Leerzeichen (oder leer, wenn `limit` es schon sagt). */
export const noWebGpuNote = (clause, limit, unit, extra = '') =>
  'Kein WebGPU in diesem Browser: gerechnet wird in JavaScript, ' + clause + ' (bis ' + fmtCount(limit) + unit + ')' + extra
  + '. Chrome oder Edge rechnen auf der Grafikkarte.';
