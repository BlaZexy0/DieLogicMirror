/* Entformungsanalyse (entformungsanalyse.html).

   Ablauf beim Laden eines Bauteils:
     Dreieckssuppe → buildModel (verschweißen, T-Stöße schließen,
     Nachbarschaft) → computeVisibility (sechs Richtungen, der teure
     Teil, hängt NUR am Netz) → segment (feste Regeln, Millisekunden).

   Gerechnet wird sofort beim Laden — es gibt keine Regler, die eine
   Bestätigung bräuchten. Die Formöffnung wird automatisch gewählt; X/Y/Z
   lassen sich zum Vergleich fest setzen, das rechnet nur die Zuordnung
   neu. Das Netz wird genommen, wie es kommt — feinere Netze sind Sache
   des Exports, nicht der Analyse.

   Die Seitenleiste hat REITER, und jeder Reiter ist ein MODUS: er
   bestimmt allein, was im Viewport steht, und nimmt es beim Verlassen
   wieder mit.
     Bauteil     das graue Netz (Netzkanten wahlweise)
     Entformung  das Bauteil nach Regionen oder Schräge gefärbt, Trennlinie
     Formteile   die Regionen als Formteile auseinandergezogen, jedes
                 der sechs möglichen ein- und ausblendbar (js/part/dieviewer.js)
     Flächen     die projizierten Flächen als Silhouetten jenseits des
                 Bauteils, Abstand und Deckkraft einstellbar
     Haftung     das Bauteil nach Haftmaß gefärbt und die Haftkarten beider
                 Hälften jenseits des Bauteils, auf gemeinsamer Skala
                 (js/part/ejector.js); Schieber haben keine Karte
   Kein Schalter schaltet einen anderen mit.

   Gezeichnet wird EIN Netz mit Punktfarben; der Modus tauscht nur das
   Farb-Attribut aus. Trennlinie und Netzkanten sind eigene Linien-
   Objekte. Die Wandstärkenanalyse hat eine eigene Seite
   (wandstaerke.html) — sie rechnet über ein Rasterfeld, nicht über dieses
   Netz. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountPartSource, frame } from './partsource.js';
import { computeVisibility, DIRS } from './visibility.js';
import { segment, UNDERCUT } from './segment.js';
import { draftAngles, draftStats, dirNames } from './draft.js';
import { diePieces, pieceProjections } from './dieview.js';
import { gripPerFace, ejectorMaps } from './ejector.js';
import { $, fmt, rgbCss, facts, segButtons, segButtonSet, slider, colorbar, gradient, chip } from '../ui/controls.js';
import * as C from './colors.js';
import { createDieView } from './dieviewer.js';

const container = $('viewport');
const status = $('status');
const busy = $('busy');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';

const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  minDistance: 5, maxDistance: 20000
});
mountViewBar(container, view);

const TABS = ['bauteil', 'entformung', 'formteile', 'flaechen', 'haftung'];

/* ── Zustand ─────────────────────────────────────────────────── */
const state = {
  name: '', model: null, vis: null, seg: null, draft: null,
  tab: 'entformung',
  axis: 'auto',       // Formöffnung: 'auto' oder 0/1/2
  movSign: 1,         // welche Hälfte auf der Achse die bewegliche ist: +1 oder −1
  mode: 'regions',    // Einfärbung im Reiter Entformung: 'regions' | 'draft'
  draftLimit: 1.5,
  showParting: true,
  showEdges: false,
  /* Formteile: Abstand und Rand der Stücke, das Bauteil durchscheinend
     dazwischen, je Formteil ein Schalter (label → false = ausgeblendet). */
  die: { dist: 60, skirt: 8, part: true, show: {}, distTouched: false },
  pieces: null,       // die Stücke (js/part/dieview.js) — auch für Flächen und Haftung
  proj: null,         // projizierte Flächen je Stück
  projView: { gap: 30, alpha: 0.6, gapTouched: false },
  /* Haftung: Haftmaß je Dreieck und die Karten beider Hälften. */
  grip: null, ejMaps: null,
  ej: { mu: 0.3, gap: 30, alpha: 0.7, gapTouched: false },
  analysed: false,    // Sichtbarkeit + Zuordnung liegen vor
  running: false,
  ready: false,       // false, solange geladen oder gerechnet wird
  visMs: 0, segMs: 0
};

const group = new T.Group();
view.scene.add(group);

const partMat = new T.MeshStandardMaterial({
  vertexColors: true, roughness: 0.62, metalness: 0.08,
  flatShading: true, side: T.DoubleSide
});
const partMesh = new T.Mesh(new T.BufferGeometry(), partMat);
group.add(partMesh);

const partingLines = new T.LineSegments(new T.BufferGeometry(),
  new T.LineBasicMaterial({ color: 0x002733 }));
group.add(partingLines);

const edgeLines = new T.LineSegments(new T.BufferGeometry(),
  new T.LineBasicMaterial({ color: 0x4c6870, transparent: true, opacity: 0.35 }));
edgeLines.visible = false;
group.add(edgeLines);

const dieView = createDieView(view);
let dieBuiltFor = null;                          // die Stücke, aus denen die Formteile gebaut sind

/* ── Bauteil laden: danach sofort rechnen ────────────────────── */
const source = mountPartSource({
  busy, viewport: container,
  onStart: name => { state.ready = false; state.name = name; },
  onLoad: model => {
    state.model = model;
    state.vis = null;
    state.seg = null;
    state.draft = null;
    state.pieces = null; state.proj = null; state.grip = null; state.ejMaps = null;
    state.analysed = false;
    dieBuiltFor = null;
    buildGeometry();
    clearAnalysis();
    /* Abstände folgen der Bauteilgröße, solange niemand sie gesetzt hat. */
    const longest = Math.max(...model.bounds.size);
    $('die-dist').max = String(Math.max(50, Math.round(longest * 1.2)));
    if (!state.die.distTouched) setSlider('die-dist', Math.max(10, Math.round(longest * 0.25)), ' mm');
    state.die.dist = +$('die-dist').value;
    for (const [id, st] of [['proj-gap', state.projView], ['ej-gap', state.ej]]) {
      $(id).max = String(Math.max(50, Math.round(longest)));
      if (!st.gapTouched) setSlider(id, Math.max(10, Math.round(longest * 0.08)), ' mm');
      st.gap = +$(id).value;
    }
    view.fitTo(partMesh);
    state.ready = true;
    runAnalysis();
  }
});

function setSlider(id, v, unit) {
  $(id).value = String(v);
  $(id + '-val').textContent = fmt(v, 0) + unit;
}

function buildGeometry() {
  const tris = state.model.tris;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(Float32Array.from(tris), 3));
  g.setAttribute('color', new T.BufferAttribute(new Float32Array(tris.length), 3));
  g.computeVertexNormals();
  partMesh.geometry.dispose();
  partMesh.geometry = g;

  /* Kantenbild nur bei überschaubaren Netzen — sonst kostet es mehr, als
     es zeigt. */
  edgeLines.geometry.dispose();
  if (state.model.faceCount <= 60000) {
    edgeLines.geometry = new T.WireframeGeometry(g);
    $('show-edges').disabled = false;
  } else {
    edgeLines.geometry = new T.BufferGeometry();
    $('show-edges').checked = false;
    $('show-edges').disabled = true;
    state.showEdges = false;
  }
  edgeLines.visible = false;
}

/* Die Sichtbarkeit hängt nur am Netz und wird einmal je Bauteil
   gerechnet; die Zuordnung danach bei jedem Achsenwechsel (Millisekunden). */
async function runAnalysis() {
  const model = state.model;
  if (!model || state.running) return;
  state.running = true;
  state.ready = false;
  $('analysis-state').textContent = 'rechnet … ' + fmt(model.faceCount, 0) + ' Dreiecke';
  try {
    busy.textContent = 'Sichtbarkeit rechnen …';
    busy.classList.add('on');
    await frame();
    const t0 = performance.now();
    const vis = await computeVisibility(model, {
      /* Bei sehr großen Netzen weniger Abtastpunkte je Dreieck — der
         Unterschied ist gering, die Rechenzeit halbiert sich. */
      samples: model.faceCount > 120000 ? 4 : 7,
      onProgress: (p, label) => { busy.textContent = 'Sichtbarkeit ' + label + ' … ' + Math.round(p * 100) + ' %'; }
    });
    if (state.model !== model) return;            // inzwischen ein anderes Teil geladen
    state.vis = vis;
    state.visMs = performance.now() - t0;
    state.analysed = true;
    recompute();
    /* Wer im Reiter Bauteil ein Teil lädt, will sein Ergebnis sehen — dort
       steht das Netz aber absichtlich grau. Also hinüber zur Entformung;
       in jedem anderen Reiter bleibt es beim gewählten. */
    if (state.tab === 'bauteil') showTab('entformung');
  } catch (err) {
    $('model-warn').textContent = 'Die Analyse ist gescheitert: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.running = false;
    state.ready = true;
    /* Kam währenddessen ein anderes Teil, ist es noch ungerechnet: der
       Aufruf beim Laden lief ins Leere, weil hier noch gerechnet wurde. */
    if (state.model !== model) runAnalysis();
  }
}

/* Anzeige ohne Analyse: graues Bauteil, leere Legenden und Listen. */
function clearAnalysis() {
  const col = partMesh.geometry.getAttribute('color');
  if (col) { col.array.fill(0.75); col.needsUpdate = true; }
  partingLines.visible = false;
  $('parting-count').textContent = '0';
  $('legend').innerHTML = '<div class="legend-row"><span class="name">Rechnet …</span></div>';
  for (const id of ['seg-facts', 'draft-facts', 'proj-facts', 'ej-facts', 'ej-legend', 'die-pieces']) $(id).innerHTML = '';
  $('analysis-state').textContent = '';
  $('ej-warn').textContent = '';
  dieView.build(null, null);
  dieView.setProjections(null);
  dieView.setEjector(null);
  applyMode();
}

/* ── Zuordnung (Millisekunden — Regeln, keine Regler) ────────── */
function recompute() {
  if (!state.model || !state.vis) return;
  const t0 = performance.now();
  state.seg = segment(state.model, state.vis, { mainAxis: state.axis, movingSign: state.movSign });
  state.draft = draftAngles(state.model, state.vis, state.seg.label);
  state.pieces = diePieces(state.model, state.seg, { skirt: state.die.skirt });
  state.proj = pieceProjections(state.pieces, state.model, state.seg);
  state.grip = gripPerFace(state.model, state.vis, state.seg, { mu: state.ej.mu, movSign: state.movSign });
  state.ejMaps = null;
  dieBuiltFor = null;
  state.segMs = performance.now() - t0;
  const ax = 'XYZ'[state.seg.mainAxis];
  $('mov-plus').textContent = '+' + ax;
  $('mov-minus').textContent = '−' + ax;
  updatePartingLine();
  updateLegend();
  updateFacts();
  updateProjFacts();
  updateGripFacts();
  updatePieceRows();
  dieView.setPieces(state.pieces);
  dieView.setProjections(state.proj);
  dieView.setEjector(null);
  applyMode();
}

/* ── Modus: der Reiter bestimmt den Viewport ─────────────────── */

/** Die Einfärbung des Bauteils im aktuellen Reiter. */
function colouring() {
  return state.tab === 'entformung' ? state.mode : state.tab === 'haftung' ? 'grip' : 'plain';
}

function applyMode() {
  const t = state.tab, has = !!state.seg;
  updateColors();
  updateColorbar();
  if (t === 'formteile' && has) { ensureDie(); dieView.show(true); }
  else dieView.show(false);
  dieView.showProjections(t === 'flaechen' && has);
  if (t === 'haftung' && has) { ensureMap(); dieView.showEjector(true); }
  else dieView.showEjector(false);
  if (t === 'flaechen') { dieView.setGap(state.projView.gap); dieView.setOverlayOpacity(state.projView.alpha); }
  if (t === 'haftung') { dieView.setGap(state.ej.gap); dieView.setOverlayOpacity(state.ej.alpha); }
  applyOpacity();
}

/* Die Formteile aus den aktuellen Stücken — einmal je Zuordnung, dann nur
   noch ein- und ausblenden. */
function ensureDie() {
  if (dieBuiltFor !== state.pieces) {
    dieView.build(state.model, state.seg, { pieces: state.pieces });
    dieView.setDistance(state.die.dist);
    dieBuiltFor = state.pieces;
  }
  for (let l = 0; l < 6; l++) dieView.setVisible(l, state.die.show[l] !== false);
}

/* Die Haftkarten beider Hälften — gerechnet, wenn sie gebraucht werden,
   einmal je Haftmaß; auf gemeinsamer Skala, damit die Seiten vergleichbar
   sind. Schieber bekommen keine Karte: sie haften nicht mit. */
function ensureMap() {
  if (state.ejMaps && state.ejMaps.grip === state.grip) return;
  const labels = [halfLabel(1), halfLabel(-1)].filter(l => l >= 0);
  state.ejMaps = ejectorMaps(state.model, state.seg, state.grip, labels);
  state.ejMaps.grip = state.grip;
  dieView.setEjector(state.ejMaps);
}

/* Das Bauteil: deckend — im Reiter Formteile durchscheinend zwischen den
   Formteilen oder ganz weg. Trennlinie nur in der Entformung, Netzkanten
   nur im Reiter Bauteil. */
function applyOpacity() {
  const ghost = state.tab === 'formteile' && !!state.seg;
  const o = ghost ? (state.die.part ? 0.18 : 0) : 1;
  partMesh.visible = o > 0;
  partMat.opacity = o;
  partMat.transparent = o < 0.999;
  partMat.depthWrite = o >= 0.999;
  partMat.needsUpdate = true;
  partingLines.visible = state.tab === 'entformung' && state.showParting
    && !!state.seg && partingLines.geometry.getAttribute('position')?.count > 0;
  edgeLines.visible = state.tab === 'bauteil' && state.showEdges && !!state.model;
  view.invalidate();
}

/** Das Formteil der Hälfte: sign +1 die bewegliche, −1 die feste Seite —
    welche das auf der Achse ist, sagt state.movSign. */
function halfLabel(sign) {
  if (!state.seg) return -1;
  return DIRS.findIndex(d => d.axis === state.seg.mainAxis && d.sign === sign * state.movSign);
}

/* ── Farben ──────────────────────────────────────────────────── */
function updateColors() {
  const { model, seg, draft } = state;
  const mode = colouring();
  const col = partMesh.geometry.getAttribute('color');
  if (!col) return;
  const arr = col.array;
  if (!seg || mode === 'plain') { arr.fill(0); for (let i = 0; i < arr.length; i += 3) { arr[i] = 0.72; arr[i + 1] = 0.76; arr[i + 2] = 0.78; } col.needsUpdate = true; view.invalidate(); return; }
  for (let f = 0; f < model.faceCount; f++) {
    let rgb;
    if (mode === 'grip') rgb = gripColor(f);
    else if (seg.label[f] === UNDERCUT) rgb = C.hex2rgb(mode === 'draft' ? C.UNDERCUT_DARK : C.UNDERCUT_COLOR);
    else if (mode === 'draft') rgb = C.draftColor(draft[f], state.draftLimit);
    else rgb = C.hex2rgb(C.REGION_COLORS[seg.label[f]]);
    for (let e = 0; e < 3; e++) {
      arr[f * 9 + e * 3] = rgb[0];
      arr[f * 9 + e * 3 + 1] = rgb[1];
      arr[f * 9 + e * 3 + 2] = rgb[2];
    }
  }
  col.needsUpdate = true;
  view.invalidate();
}

/* Haftung: Turbo nach dem Haftmaß je Fläche; was nicht haftet (Außenwand,
   waagerecht, Schieber, Hinterschnitt), bleibt hellgrau. */
const GRIP_NONE = [0.84, 0.87, 0.88];
function gripColor(f) {
  const g = state.grip;
  if (!g || !(g.intensity[f] > 0) || !(g.maxIntensity > 0)) return GRIP_NONE;
  return C.turbo(0.08 + 0.84 * Math.min(1, g.intensity[f] / g.maxIntensity));
}

function updatePartingLine() {
  const { model, seg } = state;
  if (!seg) return;
  const pts = [];
  const { nbr, index, verts, faceCount: F } = model;
  for (let f = 0; f < F; f++) {
    for (let e = 0; e < 3; e++) {
      const w = nbr[f * 3 + e];
      if (w < 0 || w < f || seg.label[f] === seg.label[w]) continue;
      const i0 = index[f * 3 + e], i1 = index[f * 3 + (e + 1) % 3];
      pts.push(verts[i0 * 3], verts[i0 * 3 + 1], verts[i0 * 3 + 2],
               verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]);
    }
  }
  partingLines.geometry.dispose();
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(Float32Array.from(pts), 3));
  partingLines.geometry = g;
  $('parting-count').textContent = (pts.length / 6).toLocaleString('de-DE');
}

/* ── Legenden, Farbskala und Kennzahlen ──────────────────────── */
const legendRows = rows => rows.map(([n, color, txt]) =>
  '<div class="legend-row">' + chip(color) + '<span class="name">' + n + '</span><span class="pct">' + (txt || '') + '</span></div>').join('');

/* Die Legende der Entformung: Regionen mit Flächenanteil oder die Stufen
   der Schräge. */
function updateLegend() {
  const { model, seg, mode } = state;
  if (!seg) return;
  const el = $('legend');
  const A = model.totalArea || 1;
  if (mode === 'draft') {
    const st = draftStats(model, state.draft, seg.label, state.draftLimit);
    const lim = state.draftLimit;
    el.innerHTML = legendRows([
      ['unter ' + fmt(lim) + '°', rgbCss(C.draftColor(0, lim)), (100 * st.below / A).toFixed(1) + ' %'],
      [fmt(lim) + '° … ' + fmt(3 * lim) + '°', rgbCss(C.draftColor(lim * 1.4, lim)), ''],
      ['über ' + fmt(3 * lim) + '°', rgbCss(C.draftColor(lim * 4, lim)), ''],
      ['Hinterschnitt', C.UNDERCUT_DARK, (100 * st.undercut / A).toFixed(1) + ' %']
    ]);
    return;
  }
  const names = dirNames(seg.mainAxis, state.movSign);
  const rows = names.map((d, i) => ({ name: d.name, color: C.REGION_COLORS[i], frac: seg.areaByLabel[i] / A }));
  rows.push({ name: 'Hinterschnitt (keine Richtung)', color: C.UNDERCUT_COLOR, frac: seg.areaByLabel[6] / A });
  el.innerHTML = rows.map(r =>
    '<div class="legend-row' + (r.frac < 0.0005 ? ' off' : '') + '">' + chip(r.color)
    + '<span class="name">' + r.name + '</span>'
    + '<span class="pct">' + (100 * r.frac).toFixed(1) + ' %</span></div>').join('');
}

/* Farbskala links unten im Viewport — für die Schräge und die Haftung,
   die eine Ordnung haben. Bei den Regionen wäre eine Skala falsch. */
function updateColorbar() {
  const mode = state.seg ? colouring() : 'plain';
  if (mode === 'grip') {
    return colorbar({
      title: 'Haftung',
      stops: gradient(t => rgbCss(C.turbo(0.08 + 0.84 * t))),
      ticks: ['stark', '', '', '', 'schwach'],
      extra: chip(rgbCss(GRIP_NONE)) + 'haftet nicht'
    });
  }
  if (mode !== 'draft') return colorbar(null);
  const lim = state.draftLimit, top = 3 * lim;
  colorbar({
    title: 'Entformschräge',
    stops: gradient(t => rgbCss(C.draftColor(top * t, lim))),
    ticks: [top, 2 * lim, lim, 0].map(v => fmt(v) + '°'),
    extra: chip(C.UNDERCUT_DARK) + 'Hinterschnitt'
  });
}

function updateFacts() {
  const { seg, model } = state;
  if (!seg) return;
  const A = model.totalArea || 1;
  let halves = 0, sliders = 0;
  for (let d = 0; d < 6; d++) (DIRS[d].axis === seg.mainAxis ? halves += seg.areaByLabel[d] : sliders += seg.areaByLabel[d]);
  const axisName = 'XYZ'[seg.mainAxis];
  $('analysis-state').textContent = 'Formöffnung ' + axisName + (seg.auto ? ' (automatisch gewählt)' : ' (fest gewählt)')
    + ' · bewegliche Seite ' + (state.movSign > 0 ? '+' : '−') + axisName;
  const rows = [
    ['Formhälften', (100 * halves / A).toFixed(1) + ' % der Fläche'],
    ['Schieber', (100 * sliders / A).toFixed(1) + ' % der Fläche'],
    ['Hinterschnitt', (100 * seg.areaByLabel[6] / A).toFixed(1) + ' % der Fläche']
  ];
  if (seg.sliverArea > 0) rows.push(['Splitter den Hälften zugeschlagen', fmt(seg.sliverArea, 1) + ' mm²']);
  rows.push(['Rechenzeit', (state.visMs + state.segMs).toFixed(0) + ' ms (Sichtbarkeit ' + state.visMs.toFixed(0) + ')']);
  facts('seg-facts', rows);

  const st = draftStats(model, state.draft, seg.label, state.draftLimit);
  facts('draft-facts', [
    ['kleinste Schräge', fmt(st.min) + ' °'],
    ['unter Grenzwert', (100 * st.belowFrac).toFixed(1) + ' % der Fläche'],
    ['Hinterschnitt', (100 * st.undercutFrac).toFixed(1) + ' % der Fläche']
  ]);
}

/* ── Formteile: je mögliches Formteil ein Schalter ───────────── */
function updatePieceRows() {
  const el = $('die-pieces');
  const { seg, model } = state;
  if (!seg) { el.innerHTML = ''; return; }
  const names = dirNames(seg.mainAxis, state.movSign);
  const A = model.totalArea || 1;
  /* Erst die beiden Hälften, dann die vier Schieber in fester Reihenfolge. */
  const order = [halfLabel(1), halfLabel(-1)].concat([0, 1, 2, 3, 4, 5].filter(l => DIRS[l].axis !== seg.mainAxis));
  let html = order.map(l => {
    const area = seg.areaByLabel[l], has = area > 0;
    const on = has && state.die.show[l] !== false;
    return '<label class="inline piece-row' + (has ? '' : ' off') + '" title="'
      + (has ? 'Dieses Formteil zeigen oder ausblenden' : 'Kein Dreieck braucht dieses Formteil — es kommt in der Form nicht vor') + '">'
      + '<input type="checkbox" data-label="' + l + '"' + (on ? ' checked' : '') + (has ? '' : ' disabled') + '>'
      + chip(C.REGION_COLORS[l]) + '<span class="name">' + names[l].name + '</span>'
      + '<span class="pct">' + (has ? (100 * area / A).toFixed(1) + ' %' : 'nicht in der Form') + '</span></label>';
  }).join('');
  if (seg.areaByLabel[6] > 0) {
    html += '<div class="legend-row">' + chip(C.UNDERCUT_COLOR) + '<span class="name">Hinterschnitt — bleibt rot an Ort und Stelle</span>'
      + '<span class="pct">' + (100 * seg.areaByLabel[6] / A).toFixed(1) + ' %</span></div>';
  }
  el.innerHTML = html;
}

/* ── Projizierte Flächen ─────────────────────────────────────── */
function updateProjFacts() {
  const { seg, proj } = state;
  if (!seg || !proj) return;
  const names = dirNames(seg.mainAxis, state.movSign);
  const rows = proj.pieces.map(q => [names[q.label].name, fmt(q.area / 100, 1) + ' cm²']);
  rows.push(['Bauteil auf die Trennebene', fmt(proj.total.area / 100, 1) + ' cm²']);
  facts('proj-facts', rows);
}

/* ── Haftung ─────────────────────────────────────────────────── */
function updateGripFacts() {
  const { seg, grip } = state;
  if (!seg || !grip) return;
  const sum = grip.mov + grip.fix;
  const movPct = sum > 0 ? 100 * grip.mov / sum : 50;
  facts('ej-facts', [
    ['Haftung bewegliche Seite', fmt(movPct, 0) + ' %'],
    ['Haftung feste Seite', fmt(100 - movPct, 0) + ' %']
  ]);
  $('ej-warn').textContent = sum <= 0 ? 'Keine Fläche haftet — das Teil hält sich nirgends.'
    : grip.fix > grip.mov ? 'Das Teil haftet stärker an der festen Seite — beim Öffnen bliebe es dort, nicht bei den Auswerfern.' : '';
  $('ej-legend').innerHTML = legendRows([
    ['haftet stark', rgbCss(C.turbo(0.92)), ''],
    ['haftet wenig', rgbCss(C.turbo(0.2)), ''],
    ['haftet nicht', rgbCss(GRIP_NONE), '']
  ]);
}

/* ── Bedienung ───────────────────────────────────────────────── */
segButtons('tab-seg', v => showTab(v));
function showTab(v) {
  if (!TABS.includes(v)) return;
  state.tab = v;
  for (const t of TABS) $('tab-' + t).classList.toggle('tab-off', t !== v);
  segButtonSet('tab-seg', v);
  applyMode();
}

/* Bauteil */
$('show-edges').addEventListener('change', e => { state.showEdges = e.target.checked; applyOpacity(); });

/* Entformung */
segButtons('axis-seg', v => { state.axis = v === 'auto' ? 'auto' : +v; recompute(); });
segButtons('mov-seg', v => { state.movSign = +v === -1 ? -1 : 1; recompute(); });
segButtons('mode-seg', v => {
  state.mode = v;
  $('draft-block').classList.toggle('disabled', v !== 'draft');
  updateLegend();
  applyMode();
});
slider('draft-limit', v => {
  state.draftLimit = v;
  if (state.seg) { updateLegend(); updateFacts(); applyMode(); }
}, v => fmt(v) + ' °');
$('show-parting').addEventListener('change', e => { state.showParting = e.target.checked; applyOpacity(); });

/* Formteile */
slider('die-dist', v => {
  state.die.dist = v;
  if (v !== +$('die-dist').defaultValue) state.die.distTouched = true;
  dieView.setDistance(v);
}, v => fmt(v, 0) + ' mm');
let skirtTimer = 0;
slider('die-skirt', v => {
  state.die.skirt = v;
  clearTimeout(skirtTimer);
  if (state.seg) skirtTimer = setTimeout(() => {
    state.pieces = diePieces(state.model, state.seg, { skirt: state.die.skirt });
    dieBuiltFor = null;
    dieView.setPieces(state.pieces);
    applyMode();
  }, 120);
}, v => fmt(v, 0) + ' mm');
$('die-part').addEventListener('change', e => { state.die.part = e.target.checked; applyOpacity(); });
$('die-pieces').addEventListener('change', e => {
  const l = Number(e.target && e.target.dataset ? e.target.dataset.label : NaN);
  if (!Number.isInteger(l)) return;
  state.die.show[l] = !!e.target.checked;
  dieView.setVisible(l, state.die.show[l]);
});

/* Flächen */
slider('proj-gap', v => {
  state.projView.gap = v;
  if (v !== +$('proj-gap').defaultValue) state.projView.gapTouched = true;
  if (state.tab === 'flaechen') dieView.setGap(v);
}, v => fmt(v, 0) + ' mm');
slider('proj-alpha', v => {
  state.projView.alpha = v / 100;
  if (state.tab === 'flaechen') dieView.setOverlayOpacity(state.projView.alpha);
}, v => fmt(v, 0) + ' %');

/* Haftung */
slider('ej-mu', v => {
  state.ej.mu = v;
  if (state.seg) {
    state.grip = gripPerFace(state.model, state.vis, state.seg, { mu: v, movSign: state.movSign });
    state.ejMaps = null;
    updateGripFacts();
    applyMode();
  }
}, v => fmt(v, 2));
slider('ej-gap', v => {
  state.ej.gap = v;
  if (v !== +$('ej-gap').defaultValue) state.ej.gapTouched = true;
  if (state.tab === 'haftung') dieView.setGap(v);
}, v => fmt(v, 0) + ' mm');
slider('ej-alpha', v => {
  state.ej.alpha = v / 100;
  if (state.tab === 'haftung') dieView.setOverlayOpacity(state.ej.alpha);
}, v => fmt(v, 0) + ' %');

/* Hover: Richtung, Entformschräge und Haftung des Dreiecks unter der Maus.

   Der Strahlentest läuft ohne Beschleunigungsstruktur über das ganze Netz —
   gemessen 9,7 ms je Ereignis bei 197k Dreiecken, und pointermove feuert so
   oft, wie der Zeiger Positionen meldet. Ungedrosselt frisst das den ganzen
   Bildtakt. Deshalb wird nur die zuletzt gemeldete Position gemerkt und
   höchstens einmal je Bild ausgewertet. */
const ray = new T.Raycaster();
status.textContent = IDLE;
let hoverAt = null, hoverQueued = false;

view.renderer.domElement.addEventListener('pointermove', ev => {
  hoverAt = { x: ev.clientX, y: ev.clientY };
  if (hoverQueued) return;
  hoverQueued = true;
  requestAnimationFrame(() => { hoverQueued = false; if (hoverAt) evalHover(hoverAt); });
});

function evalHover(at) {
  if (!state.seg || !partMesh.visible) { status.textContent = IDLE; return; }
  const r = view.renderer.domElement.getBoundingClientRect();
  const p = new T.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(p, view.camera);
  const hit = ray.intersectObject(partMesh, false)[0];
  if (!hit) { status.textContent = IDLE; return; }
  const f = hit.faceIndex;
  const l = state.seg.label[f];
  const names = dirNames(state.seg.mainAxis, state.movSign);
  const vis = [];
  for (let d = 0; d < 6; d++) if (state.seg.cand[f] & (1 << d)) vis.push(DIRS[d].label);
  const g = state.grip && state.grip.intensity[f] > 0 && state.grip.maxIntensity > 0
    ? ' · Haftung ' + fmt(100 * state.grip.intensity[f] / state.grip.maxIntensity, 0) + ' %' : '';
  status.textContent = (l === UNDERCUT ? 'Hinterschnitt' : names[l].name)
    + ' · Entformschräge ' + fmt(state.draft[f]) + '°'
    + ' · frei gesehen aus: ' + (vis.length ? vis.join(' ') : 'keiner Richtung') + g;
}
view.renderer.domElement.addEventListener('pointerleave', () => {
  hoverAt = null;
  status.textContent = IDLE;
});

/* Handle für die Browser-Konsole UND für den Verdrahtungstest
   (tests/viewer.test.mjs). */
export const __viewer = { state, view, partMesh, partingLines, edgeLines, dieView, recompute, runAnalysis, showTab, colouring };
window.__form3d = __viewer;

source.start();
