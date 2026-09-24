/* Rechenverfahren „Metamodell" — das trainierte Modell der OpenFOAM-Rechnungen (js/meta/), als
   Adapter für das Werkzeug Kammerfüllung. Dieselbe Gestalt wie engines/lbm.js und engines/sph.js,
   damit das Werkzeug nie wissen muss, welches Verfahren es gerade fährt.

   Drei Dinge sind hier anders als bei Gitter und Partikeln:

     · Es gibt KEINE Auflösung. Das Modell hat das Gitter seiner Rechnungen gelernt (30 × 30 je
       Schicht, eine Schicht D · 3/30 hoch) und kann kein anderes — die Seitenleiste zeigt für dieses
       Verfahren deshalb kein Feld „Zellkante", sondern was das Gitter IST.
     · Es gilt nur, wo trainiert wurde: λ = Länge/Durchmesser 5 … 20, Füllgrad 30 … 70 %,
       Durchmesser 60 … 300 mm, und Kurven wie die der Rechnungen: aus dem Stand, nie langsamer
       werdend, höchstens 1,05 · Fr_c, Rampen bis 0,5 g (curveOutOfBox). Außerhalb rechnet es
       nicht — es ratet, und das sagt der Knopf, statt es zu tun.
     · Der Laufkanal der Kammer geht nicht ein: die Rechnungen hatten alle dasselbe Auslassfenster
       (Sehne bei 0,42 R in der Stirnplatte). „Kammer voll" heißt hier: die Schmelze erreicht dieses
       Fenster. Breite und Tiefe des Laufkanals bleiben beim Gitter und bei den Partikeln.

   Der Lauf ist eine Abfrage, kein Fortschreiten in der Zeit: alle 101 Kolbenstellungen entstehen in
   Paketen (js/meta/model.js), und erst danach wird ausgewertet — Zeit aus der Schusskurve,
   eingeschlossene Luft mit derselben Frage wie beim Gitter (js/meta/air.js). */

import * as T from 'three';
import { abortError } from '../../abort.js';
import { fmt, fmtUnit } from '../../studio/format.js';
import { speedScale } from '../../lbm/paint.js';
import {
  loadModel, runPositions, layerCount, lambdaOf, modelLoaded, froudeCritical,
  G, POSITIONS, TRAINED, TRAINED_CURVE, MODEL_MB, ORT_MB
} from '../../meta/model.js';
import { buildTopology, buildVolume, fillFrame, extractSurface } from '../../meta/ogrid.js';
import { buildGraph, cellVolumes, enclosedAir } from '../../meta/air.js';
import { tempo, learnTempo, runClock, roughTime, kernelName, fmtCount } from './env.js';
import { airMaxOf } from './common.js';

/* Die Unterkante des Auslassfensters der Rechnungen, × R über der Achse (case_ss, windowChord). */
const WINDOW_CHORD = 0.42;
const KERNEL = 'wasm';
/* Schmelze ist eine Zelle, die mehr als halb voll ist — so zählen auch die Luft (js/meta/air.js) und
   das Maximum je Bild (js/meta/model.js). */
const MELT = 128;

/* Jede Grenze in zwei Fassungen: lang für den Modus „Simulation" (alle Grenzen, dazu der Rat), kurz
   für die Zeile unter dem Knopf, die in JEDEM Modus steht. Sie hat EINE Zeile: im Modus „Kurve" mit
   v₁/v₂ schob schon eine zweite (bei 1280 × 720) die Felder über den Schalter der Kurve — gemessen am
   2026-09-22, in Firefox wie in Chromium passen bis 46 Zeichen in eine Zeile. */
const over = (what, value, limit, kurz = what + ' ' + value + ', gelernt ' + limit + '.') => ({ long: what + ' ' + value + ' (gelernt: ' + limit + ')', short: kurz });

/** Was die Kammer von der Trainingsbox trennt — leer heißt: das Modell kennt diesen Fall. */
function outOfBox(problem) {
  const spec = problem.spec, lam = lambdaOf(spec), out = [];
  const say = (what, v, [lo, hi], unit, digits) => {
    if (v >= lo - 1e-9 && v <= hi + 1e-9) return;
    out.push(over(what, fmt(v, digits) + unit, fmt(lo, digits) + ' … ' + fmt(hi, digits) + unit));
  };
  say('Länge/Durchmesser', lam, TRAINED.lam, '', 1);
  say('Füllgrad', spec.fill * 100, [TRAINED.fill[0] * 100, TRAINED.fill[1] * 100], ' %', 0);
  say('Durchmesser', spec.d, TRAINED.d, ' mm', 0);
  return out.concat(curveOutOfBox(problem));
}

/* Die Kurve, wie das Modell sie bekommt: v über dem Weg bis „Kammer voll" (s = 1), v² zwischen den
   Punkten linear, wie in den Rechnungen. Gemessen wird an den Kurven des Trainings (TRAINED_CURVE),
   aber in den Größen der Seite: m/s, m/s², mm, s. Bis 2026-09-22 prüfte das Werkzeug nur λ, φ und D,
   und v₁ = 1,5 m/s (das Doppelte des Gelernten) ergab still „Kammer voll bei 0 ms". */
function curveOutOfBox({ spec, curve: cv }) {
  const C = TRAINED_CURVE, p = cv.profile, sFill = cv.sFill / 1000;              // m
  const u = Math.sqrt(G * spec.d / 1000), frC = froudeCritical(spec.fill);        // √(gD) in m/s
  const out = [];
  if (p.v[0] > 1e-9) out.push(over('Start mit', fmtUnit(p.v[0], 'm/s'), 'aus dem Stand'));
  /* Die Abschnitte bis „Kammer voll", je einer mit fester Beschleunigung. */
  let vMax = p.atPos(sFill).v, aMax = 0, fall = null;
  for (let k = 0; k < p.a.length && p.s[k] < sFill - 1e-9; k++) {
    vMax = Math.max(vMax, p.v[k]);
    aMax = Math.max(aMax, p.a[k]);
    if (!fall && p.a[k] < -1e-9) fall = [p.v[k], p.atPos(Math.min(p.s[k + 1], sFill)).v];
  }
  /* Kurz heißt die Geschwindigkeit wie ihre Kennzahl im Modus „Kurve": „1. Phase bis …". */
  const vLim = C.frMax * frC * u, vText = fmtUnit(vLim, 'm/s');
  if (vMax > vLim * (1 + 1e-9)) out.push(over('Kolbengeschwindigkeit', fmtUnit(vMax, 'm/s'), 'bis ' + vText, '1. Phase bis ' + fmtUnit(vMax, 'm/s') + ', gelernt bis ' + vText + '.'));
  const aLim = C.aMax * G;
  if (aMax > aLim * (1 + 1e-9)) out.push(over('Beschleunigung', fmt(aMax, aMax < 10 ? 1 : 0) + ' m/s²', 'bis ' + fmt(aLim, 1) + ' m/s²'));
  if (fall) out.push(over('Kolben bremst von ' + fmt(fall[0], 2) + ' auf', fmtUnit(fall[1], 'm/s'), 'nie langsamer', 'Kolben bremst auf ' + fmtUnit(fall[1], 'm/s') + ': nie gelernt.'));
  /* Nicht zu langsam: ab 5 % des Wegs wenigstens ein Zehntel von Fr_c (200 Stellen wie im Plan). */
  let low = null;
  for (let i = 0; i < 200; i++) {
    const x = (C.sFloor + (1 - C.sFloor) * i / 199) * sFill, v = p.atPos(x).v;
    if (!low || v < low.v) low = { x, v };
  }
  const vFloor = C.floor * frC * u, bei = fmtUnit(low.x * 1000, 'mm', 0);
  if (low.v < vFloor * (1 - 1e-9)) out.push(over('Kolben bei ' + bei, fmtUnit(low.v, 'm/s'), 'ab ' + fmtUnit(vFloor, 'm/s'), 'Bei ' + bei + ' erst ' + fmtUnit(low.v, 'm/s') + ', gelernt ab ' + fmtUnit(vFloor, 'm/s') + '.'));
  const t = p.atPos(sFill).t, tLim = C.tStar * Math.sqrt(spec.d / 1000 / G);
  if (t > tLim * (1 + 1e-9)) out.push(over('Kammer voll nach', fmtUnit(t, 's'), 'bis ' + fmtUnit(tLim, 's')));
  return out;
}

const refusal = box => 'Außerhalb des Trainings: ' + box.map(b => b.long).join('; ') + '. Mit dem Gitter oder mit Partikeln rechnen.';

export const meta = {
  id: 'meta', label: 'Metamodell', short: 'Modell', cellLabel: null, kinds: ['kammer'],
  suggest: () => 0,

  estimate(problem) {
    const lam = lambdaOf(problem.spec), Z = Math.max(1, Math.round(lam * 10));
    const count = POSITIONS * Z;
    const ms = count * tempo('meta', KERNEL);
    const nd = 30;
    const box = outOfBox(problem);
    return {
      text: 'Modellgitter ' + nd + ' × ' + nd + ' je Schicht · ' + fmt(Z, 0) + ' Schichten · '
        + fmt(POSITIONS, 0) + ' Kolbenstellungen (' + fmtCount(count * nd * nd) + ' Zellen) · '
        + roughTime(ms) + ' · ' + kernelName(KERNEL),
      count, kernel: KERNEL,
      note: modelLoaded() ? '' : 'Das Modell (' + fmt(MODEL_MB, 1) + ' MB) und sein Rechenwerk (' + fmt(ORT_MB, 0) + ' MB) werden beim ersten Lauf geladen.',
      blocked: box.length ? refusal(box) : '',
      /* Unter dem Knopf die erste Grenze, kurz; der Modus „Simulation" nennt alle. */
      blockedShort: box.length ? box[0].short : ''
    };
  },

  async run(problem, opts) {
    const { signal, progress = () => {} } = opts;
    const check = () => { if (signal && signal.aborted) throw abortError(); };
    const spec = problem.spec, cv = problem.curve;
    /* Der Knopf fragt vorher (estimate); wer run() selbst ruft, bekommt dieselbe Antwort. */
    const box = outOfBox(problem);
    if (box.length) throw new Error(refusal(box));
    progress(0, 'Metamodell · Modell laden …');
    /* „Abbrechen" wartet nicht auf das Laden (js/meta/model.js): das Warten endet, das Laden nicht. */
    const bundle = await loadModel(signal);
    check();
    /* Die Uhr läuft erst ab hier: das Laden gehört zum ersten Lauf, nicht zum
       Tempo des Geräts — sonst lernte learnTempo einmalig zu langsam. */
    const clock = runClock();
    const meta_ = bundle.meta;
    const lam = lambdaOf(spec), Z = layerCount(meta_, lam), nd = meta_.nd, per = nd * nd;
    const topo = buildTopology(meta_);
    /* Die Kurve, wie das Modell sie kennt: Froude-Zahl über der Kolbenstellung s ∈ [0, 1] —
       s = 1 ist „Kammer voll" (Kolbenweg sFill), dort endet der Lauf. Die Kurve reicht bis dorthin
       (das Werkzeug stellt sonst kein Problem, kammer.js): keine Stellung hält am Ende der Kurve an. */
    const travel = cv.sFill, uMs = Math.sqrt(G * spec.d / 1000);
    const vAt = s => cv.profile.atPos(Math.max(0, Math.min(1, s)) * travel / 1000).v;
    progress(0.05, 'Metamodell · rechnet …');
    const frames = await runPositions(bundle, { lam, fill: spec.fill, d: spec.d, fr: s => vAt(s) / uMs }, {
      Z, check,
      progress: (f, k) => progress(0.05 + 0.85 * f, 'Metamodell · Stellung ' + fmt(k, 0) + ' von ' + fmt(POSITIONS, 0))
    });
    /* Was außerhalb des Gitters im Bild steht, gehört nicht dazu: es verfälschte Skala und Luft. */
    for (const fr of frames) {
      for (let l = 0; l < Z; l++) for (let q = 0; q < per; q++) {
        if (topo.inMask[q]) continue;
        fr.fill[l * per + q] = 0; fr.speed[l * per + q] = 0;
      }
    }
    check();
    progress(0.92, 'Metamodell · Luft und Zeiten …');
    /* Das Fenster der Stirnplatte (Schicht 0): erreicht die Schmelze es, ist die Kammer voll. */
    const yD = meta_.y_D.flat(), area = meta_.area_D2.flat();
    const window_ = [];
    for (let q = 0; q < per; q++) if (area[q] > 0 && yD[q] > WINDOW_CHORD * 0.5) window_.push(q);
    const graph = buildGraph(topo);
    const snapshots = [];
    let full = null;
    for (let k = 0; k < frames.length; k++) {
      const sNorm = k / (frames.length - 1), s = sNorm * travel;
      const comp = 1 - sNorm * (1 - spec.fill);
      const vol = cellVolumes(meta_, spec, Z, comp);
      const air = enclosedAir(graph, topo, frames[k].fill, Z, vol);
      const snap = Object.assign(frames[k], {
        step: k, t: cv.profile.atPos(s / 1000).t, s,
        air: air.enclosed, bubbles: air.bubbles
      });
      snapshots.push(snap);
      if (!full && window_.some(q => snap.fill[q] >= MELT)) full = { t: snap.t, s };
      if (k % 10 === 0) { check(); progress(0.92 + 0.08 * k / frames.length, 'Metamodell · Luft und Zeiten …'); }
    }
    check();
    const ms = clock.ms();
    if (clock.fair()) learnTempo('meta', KERNEL, ms, POSITIONS, Z);
    /* Die Skala über die Schmelze allein: die Luft trägt im Modell eigene, oft schnellere Werte, und
       ihre Bytes stehen auf 255 (bezogen auf das Maximum der Schmelze). Mit ihr rückte das 99. Perzentil
       zum Maximum der Schmelze (Ø 90 × 450 mm, 40 %: mit den Wegpunkten des Projekts 1,10 statt
       0,88 m/s, mit der DieLogic-Kurve 2,26 statt 1,77 m/s). */
    const before = full ? snapshots.filter(snap => snap.t <= full.t) : snapshots;
    const vScale = speedScale(before.length > 1 ? before : snapshots, 0.99, MELT);
    const nTrain = meta_.training && meta_.training.n_train;
    return {
      engine: 'meta', kernel: KERNEL, kind: 'kammer', cell: null, snapshots, steps: POSITIONS, ms,
      vScale, full, reason: full ? 'Kammer voll' : 'Ende des Kolbenwegs',
      airMax: airMaxOf(snapshots),
      /* Was das Bild braucht (createDisplay) und was die Rechnung erklärt. */
      model: meta_, topo, Z, spec: { ...spec }, travel, lam,
      facts: [
        ['Ende', full ? 'Kammer voll' : 'Ende des Kolbenwegs'],
        ['Stellungen', fmt(POSITIONS, 0) + ' × ' + fmtUnit(travel / (POSITIONS - 1), 'mm', 1)],
        ['Modellgitter', fmt(Z, 0) + ' Schichten · ' + nd + ' × ' + nd + ' je Schicht'],
        /* Aus der Beilage, nicht aus dem Gedächtnis: ein neues Modell bringt seine Zahl mit. */
        ...(nTrain > 0 ? [['Gelernt aus', fmt(nTrain, 0) + ' OpenFOAM-Rechnungen']] : []),
        ['Rechenzeit', fmtUnit(ms / 1000, 's') + ' · ' + kernelName(KERNEL)]
      ]
    };
  },

  /* Die Schmelze zu einem Bild: die Fläche des halben Schmelzeanteils direkt auf dem O-Gitter
     (js/meta/ogrid.js) — Wand, Kolben und Stirnplatte schließen sie mit Geisterknoten. */
  createDisplay() {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.5, metalness: 0.05, side: T.DoubleSide });
    const mesh = new T.Mesh(new T.BufferGeometry(), mat);
    mesh.visible = false;
    let vol = null, volFor = null;
    return {
      object: mesh,
      show(result, k) {
        const snap = result.snapshots[Math.max(0, Math.min(result.snapshots.length - 1, k))];
        if (!vol || volFor !== result.topo || vol.Z !== result.Z) { vol = buildVolume(result.topo, result.Z); volFor = result.topo; }
        fillFrame(vol, snap, result.spec, snap.s / result.travel, result.travel);
        const { positions, colors, indices } = extractSurface(vol, result.vScale);
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.BufferAttribute(positions, 3));
        geo.setAttribute('color', new T.BufferAttribute(colors, 3));
        geo.setIndex(new T.BufferAttribute(indices, 1));
        geo.computeVertexNormals();
        mesh.geometry.dispose();
        mesh.geometry = geo;
        mesh.visible = indices.length > 0;
      },
      hide() { mesh.visible = false; }
    };
  }
};
