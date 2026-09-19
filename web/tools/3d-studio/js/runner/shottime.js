/* Ankunft der Schmelze nach der Schusskurve — statt nach einem
   konstanten Strom.

   Der Angussdesigner rechnet die Ankunft an jedem Anschnitt mit EINEM
   Volumenstrom: Gussvolumen durch Füllzeit, von Anfang bis Ende gleich.
   Der Kolben fährt aber eine Kurve: langsam, bis die Kammer voll ist,
   dann die Rampe der zweiten Phase — und der Anguss füllt sich genau in
   dieser Rampe. Wann die Front einen Anschnitt erreicht, hängt also
   davon ab, wie viel Volumen der Kolben bis dahin geschoben hat, und
   wie schnell er das tut.

   Die Umrechnung ist eine Substitution: aus der Strömungsrechnung
   (js/runner/flow.js) folgt für jeden Knoten das VOLUMEN, das den
   Pressrest passiert hat, wenn die Front dort ankommt — Ankunftszeit
   mal Strom, denn jede Kante füllt sich mit ihrem Anteil am Strom, und
   die Anteile ändern sich mit dem Strom nicht. Auf der Schusskurve ist
   dieses Volumen ein Kolbenweg hinter „Kammer voll" (Volumen durch
   Kolbenfläche), und das Bewegungsprofil kennt die Zeit zu jedem Weg.

   Die Kurve ist die DieLogic-Kurve der Auslegung (js/core/curvegen.js,
   Modus 'lopez'): López-Anfahrt bis v_krit, Plateau bis „Kammer voll",
   Rampe mit a_max auf das v₂, das die NADCA-Füllzeit trifft. Sie wird
   hier für das Modell erzeugt — Maschine, Kammer, Legierung und Thermik
   aus dem Auslegungszustand, die Massen aus den Volumen des Modells —,
   unabhängig davon, welche Kurve das Dashboard gerade zeigt. Der
   Angussdesigner (js/runner/tool.js) und der Anguss-Schritt der Werkbank
   (js/werkbank/runner.js) benutzen es gleich.
   Kein DOM: die Tests rechnen es unter Node nach. */

import { generateCurve } from '../../../auslegung/js/core/curvegen.js';
import { computeShot, pistonArea, rhoSolidus } from '../../../auslegung/js/core/physics.js';

/**
 * Die Zeitachse des Schusses für ein Modell.
 *   values      Auslegungszustand (state.values des Dashboards)
 *   volumesMm3  { part, runner, overflow, biscuit } in mm³ aus dem Modell
 *               (0 zählt); was fehlt, bleibt bei der Auslegung
 *   chamber     { diam, length } in mm — die Füllkammer des Modells: der
 *               Kolben-Ø (beim Angussdesigner der Pressrest) und die
 *               Kammerlänge. Daraus folgt der Füllgrad, und der bestimmt
 *               die ganze erste Phase; ohne Angabe gilt die Kammer der
 *               Auslegung (die Werkbank hat sie aus ihrem Dashboard).
 * → { error } oder { v, points, warn, shot, A, phi, tFull, timeForVolume(V) }
 *   mit A in m², phi dem Füllgrad, tFull der Kurvenzeit von „Kammer
 *   voll" in s und timeForVolume(V in m³) der Zeit ab „Kammer voll", zu
 *   der V den Pressrest passiert hat — null, wenn die Kurve vorher endet.
 */
export function shotTimeline(values, volumesMm3 = {}, chamber = null) {
  const v = { ...values };
  if (chamber) {
    if (chamber.diam > 0) v.diam = chamber.diam;
    if (chamber.length > 0) v.length = chamber.length;
  }
  const rho = rhoSolidus(v);
  for (const k of ['part', 'runner', 'overflow', 'biscuit']) {
    const mm3 = volumesMm3[k];
    /* Null ist ein Wert: ein Modell ohne Überläufe hat keine — nicht die
       zwei Kilogramm der Auslegungsvorgabe. */
    if (Number.isFinite(mm3) && mm3 >= 0) v[k] = mm3 * 1e-9 * rho;
  }
  const gen = generateCurve(v, { mode: 'lopez' });
  if (gen.error) return { error: gen.error };
  let shot;
  try { shot = computeShot(v, gen.points); } catch (e) { return { error: String(e && e.message || e) }; }
  if (shot.error) return { error: shot.error };
  const A = pistonArea(v) * 1e-6;
  const full = shot.events[0];
  if (!full || !full.inP) return { error: 'Die Kurve endet, bevor die Kammer voll ist.' };
  const tFull = full.t;
  return {
    v, points: gen.points, warn: gen.warn || null, shot, A, phi: shot.phi, tFull, v2: gen.v2, tN: gen.tN,
    timeForVolume(V) {
      if (!(V >= 0)) return null;
      const s = shot.sFill + V / A;
      if (s > shot.profile.travel + 1e-9) return null;
      return Math.max(0, shot.profile.atPos(s).t - tFull);
    }
  };
}

/**
 * Die Ankunftszeiten einer Strömungsrechnung auf die Zeitachse legen.
 *   flow      Ergebnis von analyseFlow (arrival in s bei konstantem Q in m³/s)
 *   timeline  aus shotTimeline
 * → { arrival: {id → s ab Kolbenstart | null}, gates: [{…r, tArrive}],
 *     tFirst, tLast, unreached: [ids], tRunner } — tRunner ist die Zeit,
 *   zu der der letzte Anschnitt erreicht ist (der Anguss ist voll).
 *   Alle Zeiten ab Kolbenstart (timeline.tFull + Zeit ab „Kammer voll").
 */
export function shotArrivals(flow, timeline) {
  /* Ab Kolbenstart, nicht ab „Kammer voll": die Zeit der Kurve. */
  const t0 = Number.isFinite(timeline.tFull) ? timeline.tFull : 0;
  const arrival = {};
  for (const [id, t] of Object.entries(flow.arrival || {})) {
    const rel = timeline.timeForVolume(t * flow.Q);
    arrival[id] = rel === null || rel === undefined ? null : rel + t0;
  }
  const unreached = [];
  const gates = flow.gates.map(r => {
    const t = arrival[r.id];
    if (t === null || t === undefined) unreached.push(r.id);
    return { ...r, tArrive: Number.isFinite(t) ? t : NaN };
  });
  const ts = gates.map(r => r.tArrive).filter(Number.isFinite);
  return {
    arrival, gates, unreached,
    tFirst: ts.length ? Math.min(...ts) : NaN,
    tLast: ts.length ? Math.max(...ts) : NaN,
    tRunner: ts.length && !unreached.length ? Math.max(...ts) : null
  };
}

/** Eine Strömungsrechnung mit den Zeiten der Schusskurve — für Schema,
    Prüfregeln und Auswahlfeld, ohne dass die je etwas von der Kurve
    wissen. */
export function flowOnCurve(flow, timeline) {
  const a = shotArrivals(flow, timeline);
  return {
    ...flow,
    gates: a.gates, arrival: a.arrival,
    tFirst: a.tFirst, tLast: a.tLast,
    fillTime: Number.isFinite(timeline.shot.fill) && timeline.shot.fill > 0 ? timeline.shot.fill : flow.fillTime,
    unreached: a.unreached, tRunner: a.tRunner, onCurve: true
  };
}
