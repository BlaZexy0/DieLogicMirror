/* Rechenverfahren „Metamodell" — das trainierte Modell der OpenFOAM-Rechnungen (js/meta/), als
   Adapter für das Werkzeug Kammerfüllung. Dieselbe Gestalt wie engines/lbm.js und engines/sph.js,
   damit das Werkzeug nie wissen muss, welches Verfahren es gerade fährt.

   Drei Dinge sind hier anders als bei Gitter und Partikeln:

     · Es gibt KEINE Auflösung. Das Modell hat das Gitter seiner Rechnungen gelernt (30 × 30 je
       Schicht, eine Schicht D · 3/30 hoch) und kann kein anderes — die Seitenleiste zeigt für dieses
       Verfahren deshalb kein Feld „Zellkante", sondern was das Gitter IST.
     · Es gilt nur, wo trainiert wurde: λ = Länge/Durchmesser 5 … 20, Füllgrad 30 … 70 %,
       Durchmesser 60 … 300 mm, und Kurven bis knapp über die kritische Geschwindigkeit. Außerhalb
       rechnet es nicht — es ratet, und das sagt der Knopf, statt es zu tun.
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
import { loadModel, runPositions, layerCount, lambdaOf, modelLoaded, POSITIONS, TRAINED } from '../../meta/model.js';
import { buildTopology, buildVolume, fillFrame, extractSurface } from '../../meta/ogrid.js';
import { buildGraph, cellVolumes, enclosedAir } from '../../meta/air.js';
import { tempo, learnTempo, roughTime, kernelName, fmtCount } from './env.js';

/* Die Unterkante des Auslassfensters der Rechnungen, × R über der Achse (case_ss, windowChord). */
const WINDOW_CHORD = 0.42;
const KERNEL = 'wasm';

/** Was die Kammer von der Trainingsbox trennt — leer heißt: das Modell kennt diesen Fall. */
function outOfBox(spec) {
  const lam = lambdaOf(spec), out = [];
  const say = (what, v, [lo, hi], unit, digits) => {
    if (v >= lo - 1e-9 && v <= hi + 1e-9) return;
    out.push(what + ' ' + fmt(v, digits) + unit + ' (gelernt: ' + fmt(lo, digits) + ' … ' + fmt(hi, digits) + unit + ')');
  };
  say('Länge/Durchmesser', lam, TRAINED.lam, '', 1);
  say('Füllgrad', spec.fill * 100, [TRAINED.fill[0] * 100, TRAINED.fill[1] * 100], ' %', 0);
  say('Durchmesser', spec.d, TRAINED.d, ' mm', 0);
  return out;
}

export const meta = {
  id: 'meta', label: 'Metamodell', short: 'Modell', cellLabel: null, kinds: ['kammer'],
  range: () => [0, 0],
  suggest: () => 0,

  estimate(problem) {
    const lam = lambdaOf(problem.spec), Z = Math.max(1, Math.round(lam * 10));
    const count = POSITIONS * Z;
    const ms = count * tempo('meta', KERNEL);
    const nd = 30;
    const box = outOfBox(problem.spec);
    return {
      text: 'Modellgitter ' + nd + ' × ' + nd + ' je Schicht · ' + fmt(Z, 0) + ' Schichten · '
        + fmt(POSITIONS, 0) + ' Kolbenstellungen (' + fmtCount(count * nd * nd) + ' Zellen) · '
        + roughTime(ms) + ' · ' + kernelName(KERNEL),
      count, kernel: KERNEL,
      note: modelLoaded() ? '' : 'Das Modell (12 MB) wird beim ersten Lauf geladen.',
      blocked: box.length
        ? 'Außerhalb des Trainings: ' + box.join('; ') + '. Mit dem Gitter oder mit Partikeln rechnen.'
        : ''
    };
  },

  async run(problem, opts) {
    const { signal, progress = () => {} } = opts;
    const check = () => { if (signal && signal.aborted) throw abortError(); };
    const spec = problem.spec, cv = problem.curve;
    progress(0, 'Metamodell · Modell laden …');
    const bundle = await loadModel();
    check();
    /* Die Uhr läuft erst ab hier: das Laden gehört zum ersten Lauf, nicht zum
       Tempo des Geräts — sonst lernte learnTempo einmalig zu langsam. */
    const t0 = performance.now();
    const meta_ = bundle.meta;
    const lam = lambdaOf(spec), Z = layerCount(meta_, lam), nd = meta_.nd, per = nd * nd;
    const topo = buildTopology(meta_);
    /* Die Kurve, wie das Modell sie kennt: Froude-Zahl über der Kolbenstellung s ∈ [0, 1] —
       s = 1 ist „Kammer voll" (Kolbenweg sFill), dort endet der Lauf. */
    const travel = cv.sFill, uMs = Math.sqrt(9.81 * spec.d / 1000);
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
      if (!full && window_.some(q => snap.fill[q] > 127)) full = { t: snap.t, s };
      if (k % 10 === 0) { check(); progress(0.92 + 0.08 * k / frames.length, 'Metamodell · Luft und Zeiten …'); }
    }
    check();
    const ms = performance.now() - t0;
    learnTempo('meta', KERNEL, ms, POSITIONS, Z);
    const before = full ? snapshots.filter(snap => snap.t <= full.t) : snapshots;
    const vScale = speedScale(before.length > 1 ? before : snapshots, 0.99);
    return {
      engine: 'meta', kernel: KERNEL, kind: 'kammer', cell: null, snapshots, steps: POSITIONS, ms,
      vScale, full, reason: full ? 'Kammer voll' : 'der Kolben ist am Ende der Kurve',
      airMax: snapshots.reduce((a, s) => (s.air > a.air ? s : a), snapshots[0]),
      /* Was das Bild braucht (createDisplay) und was die Rechnung erklärt. */
      model: meta_, topo, Z, spec: { ...spec }, travel, lam,
      facts: [
        ['Ende', full ? 'Kammer voll' : 'Ende des Kolbenwegs'],
        ['Stellungen', fmt(POSITIONS, 0) + ' × ' + fmtUnit(travel / (POSITIONS - 1), 'mm', 1)],
        ['Modellgitter', fmt(Z, 0) + ' Schichten · ' + nd + ' × ' + nd + ' je Schicht'],
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
