/* Entformungsanalyse (entformungsanalyse.html).

   Ablauf beim Laden eines Bauteils:
     Dreieckssuppe → buildModel (verschweißen, T-Stöße schließen,
     Nachbarschaft) → computeVisibility (sechs Richtungen, der teure
     Teil, hängt NUR am Netz) → segment (feste Regeln, Millisekunden).

   Gerechnet wird sofort beim Laden — es gibt keine Regler, die eine
   Bestätigung bräuchten. Die Formöffnung wird automatisch gewählt; X/Y/Z
   lassen sich zum Vergleich fest setzen, das rechnet nur die Zuordnung
   neu. Darstellungsschalter (Einfärbung, Grenzwert, Deckkraft) wirken
   sofort und rechnen nichts neu.

   Gezeichnet wird EIN Netz mit Punktfarben; die Darstellungsart tauscht
   nur das Farb-Attribut aus. Trennlinie und Netzkanten sind eigene
   Linien-Objekte. Die Wandstärkenanalyse hat eine eigene Seite
   (wandstaerke.html) — sie rechnet über ein Rasterfeld, nicht über dieses
   Netz. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountPartSource, frame } from './partsource.js';
import { computeVisibility, DIRS } from './visibility.js';
import { segment, UNDERCUT } from './segment.js';
import { draftAngles, draftStats, dirNames } from './draft.js';
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

/* ── Zustand ─────────────────────────────────────────────────── */
const state = {
  name: '', model: null, vis: null, seg: null, draft: null,
  axis: 'auto',       // Formöffnung: 'auto' oder 0/1/2
  mode: 'regions',
  draftLimit: 1.5,
  showParting: true,
  showEdges: false,
  opacity: 1,
  /* Formansicht: die Regionen als Formteile auseinandergezogen (js/part/dieviewer.js). */
  die: { on: false, dist: 60, skirt: 8, part: true, look: 'frei', distTouched: false },
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

/* ── Bauteil laden: danach sofort rechnen ────────────────────── */
const source = mountPartSource({
  busy, viewport: container,
  onStart: name => { state.ready = false; state.name = name; },
  onLoad: model => {
    state.model = model;
    state.vis = null;
    state.seg = null;
    state.draft = null;
    state.analysed = false;
    buildGeometry();
    clearAnalysis();
    dieView.build(null, null);
    /* Der Abstand der Formteile folgt der Bauteilgröße, solange niemand
       ihn gesetzt hat. */
    const longest = Math.max(...model.bounds.size);
    $('die-dist').max = String(Math.max(50, Math.round(longest * 1.2)));
    if (!state.die.distTouched) {
      state.die.dist = Math.max(10, Math.round(longest * 0.25));
      $('die-dist').value = String(state.die.dist);
      $('die-dist-val').textContent = fmt(state.die.dist, 0) + ' mm';
      dieView.setDistance(state.die.dist);
    }
    view.fitTo(partMesh);
    state.ready = true;
    runAnalysis();
  }
});

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
    edgeLines.visible = false;
  }
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
  } catch (err) {
    $('model-warn').textContent = 'Die Analyse ist gescheitert: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.running = false;
    state.ready = true;
  }
}

/* Anzeige ohne Analyse: graues Bauteil, leere Legende. */
function clearAnalysis() {
  const col = partMesh.geometry.getAttribute('color');
  if (col) { col.array.fill(0.75); col.needsUpdate = true; }
  partingLines.visible = false;
  $('parting-count').textContent = '0';
  $('legend').innerHTML = '<div class="legend-row"><span class="name">Rechnet …</span></div>';
  $('seg-facts').innerHTML = '';
  $('draft-facts').innerHTML = '';
  $('analysis-state').textContent = '';
  updateColorbar();
}

/* ── Zuordnung (Millisekunden — Regeln, keine Regler) ────────── */
function recompute() {
  if (!state.model || !state.vis) return;
  const t0 = performance.now();
  state.seg = segment(state.model, state.vis, { mainAxis: state.axis });
  state.draft = draftAngles(state.model, state.vis, state.seg.label);
  state.segMs = performance.now() - t0;
  updateColors();
  updatePartingLine();
  updateLegend();
  updateColorbar();
  updateFacts();
  updateDieView();
}

/* ── Formansicht ─────────────────────────────────────────────── */
function updateDieView() {
  if (!state.die.on || !state.seg) { dieView.lookFree(); dieView.show(false); applyOpacity(); return; }
  dieView.build(state.model, state.seg, { skirt: state.die.skirt });
  dieView.setDistance(state.die.dist);
  dieView.show(true);
  applyLook();
}

/* Der Blick: alle Stücke frei, oder von der Trennebene in eine Hälfte
   (die andere Seite weggeschnitten, das Bauteil aus dem Bild). */
function applyLook() {
  const look = state.die.look;
  if (look === 'frei' || !state.die.on || !state.seg) dieView.lookFree();
  else if (!dieView.lookInto(halfLabel(look === 'mov' ? 1 : -1))) { state.die.look = 'frei'; segButtonSet('die-look-seg', 'frei'); dieView.lookFree(); }
  applyOpacity();
}

/* Das Bauteil: deckend wie eingestellt — in der Formansicht durchscheinend
   zwischen den Formteilen, beim Blick in eine Hälfte oder ohne Häkchen weg. */
function applyOpacity() {
  const ghost = state.die.on && state.seg;
  const o = ghost ? (state.die.part && state.die.look === 'frei' ? Math.min(state.opacity, 0.18) : 0) : state.opacity;
  partMesh.visible = o > 0;
  partMat.opacity = o;
  partMat.transparent = o < 0.999;
  partMat.depthWrite = o >= 0.999;
  partMat.needsUpdate = true;
  /* Die Linien gehören zum Bauteil: ohne Bauteil hingen sie in der Luft. */
  partingLines.visible = o > 0 && state.showParting && partingLines.geometry.getAttribute('position')?.count > 0;
  edgeLines.visible = o > 0 && state.showEdges;
  view.invalidate();
}

/** Das Formteil der Hälfte: +Achse ist die bewegliche, −Achse die feste Seite. */
function halfLabel(sign) {
  if (!state.seg) return -1;
  return DIRS.findIndex(d => d.axis === state.seg.mainAxis && d.sign === sign);
}

/* ── Farben ──────────────────────────────────────────────────── */
function updateColors() {
  const { model, seg, draft, mode } = state;
  if (!seg) return;
  const col = partMesh.geometry.getAttribute('color');
  const arr = col.array;
  for (let f = 0; f < model.faceCount; f++) {
    let rgb;
    if (mode === 'plain') rgb = [0.72, 0.76, 0.78];
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
  partingLines.visible = state.showParting && pts.length > 0;
  $('parting-count').textContent = (pts.length / 6).toLocaleString('de-DE');
}

/* ── Legende, Farbskala und Kennzahlen ───────────────────────── */
function updateLegend() {
  const { model, seg, mode } = state;
  if (!seg) return;
  const el = $('legend');
  const names = dirNames(seg.mainAxis);
  const A = model.totalArea || 1;

  if (mode === 'draft') {
    const st = draftStats(model, state.draft, seg.label, state.draftLimit);
    const rows = [
      ['unter ' + fmt(state.draftLimit) + '°', C.draftColor(0, state.draftLimit), st.below / A],
      [fmt(state.draftLimit) + '° … ' + fmt(3 * state.draftLimit) + '°', C.draftColor(state.draftLimit * 1.4, state.draftLimit), null],
      ['über ' + fmt(3 * state.draftLimit) + '°', C.draftColor(state.draftLimit * 4, state.draftLimit), null],
      ['Hinterschnitt', C.hex2rgb(C.UNDERCUT_DARK), st.undercut / A]
    ];
    el.innerHTML = rows.map(([n, rgb, frac]) =>
      '<div class="legend-row">' + chip(rgbCss(rgb))
      + '<span class="name">' + n + '</span><span class="pct">'
      + (frac === null ? '' : (100 * frac).toFixed(1) + ' %') + '</span></div>').join('');
    return;
  }
  if (mode === 'plain') { el.innerHTML = '<div class="legend-row"><span class="name">Ohne Einfärbung.</span></div>'; return; }

  const rows = names.map((d, i) => ({ name: d.name, color: C.REGION_COLORS[i], frac: seg.areaByLabel[i] / A }));
  rows.push({ name: 'Hinterschnitt (keine Richtung)', color: C.UNDERCUT_COLOR, frac: seg.areaByLabel[6] / A });
  el.innerHTML = rows.map(r =>
    '<div class="legend-row' + (r.frac < 0.0005 ? ' off' : '') + '">' + chip(r.color)
    + '<span class="name">' + r.name + '</span>'
    + '<span class="pct">' + (100 * r.frac).toFixed(1) + ' %</span></div>').join('');
}

/* Farbskala links unten im Viewport — nur für die Entformschräge, die
   eine Ordnung hat. Bei den Regionen wäre eine Skala falsch. */
function updateColorbar() {
  if (!state.seg || state.mode !== 'draft') return colorbar(null);
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
  $('analysis-state').textContent = 'Formöffnung ' + axisName + (seg.auto ? ' (automatisch gewählt)' : ' (fest gewählt)');
  facts('seg-facts', [
    ['Formhälften', (100 * halves / A).toFixed(1) + ' % der Fläche'],
    ['Schieber', (100 * sliders / A).toFixed(1) + ' % der Fläche'],
    ['Hinterschnitt', (100 * seg.areaByLabel[6] / A).toFixed(1) + ' % der Fläche'],
    ['Rechenzeit', (state.visMs + state.segMs).toFixed(0) + ' ms (Sichtbarkeit ' + state.visMs.toFixed(0) + ')']
  ]);

  const st = draftStats(model, state.draft, seg.label, state.draftLimit);
  facts('draft-facts', [
    ['kleinste Schräge', fmt(st.min) + ' °'],
    ['unter Grenzwert', (100 * st.belowFrac).toFixed(1) + ' % der Fläche'],
    ['Hinterschnitt', (100 * st.undercutFrac).toFixed(1) + ' % der Fläche']
  ]);
}

/* ── Bedienung ───────────────────────────────────────────────── */
segButtons('axis-seg', v => { state.axis = v === 'auto' ? 'auto' : +v; recompute(); });
segButtons('mode-seg', v => {
  state.mode = v;
  $('draft-block').classList.toggle('disabled', v !== 'draft');
  updateColors(); updateLegend(); updateColorbar();
});
slider('draft-limit', v => {
  state.draftLimit = v;
  if (state.seg) { updateColors(); updateLegend(); updateColorbar(); updateFacts(); }
}, v => fmt(v) + ' °');
slider('opacity', v => { state.opacity = v / 100; applyOpacity(); }, v => v + ' %');

$('die-on').addEventListener('change', e => {
  state.die.on = e.target.checked;
  $('die-block').classList.toggle('disabled', !state.die.on);
  updateDieView();
});
slider('die-dist', v => {
  state.die.dist = v;
  if (v !== +$('die-dist').defaultValue) state.die.distTouched = true;
  dieView.setDistance(v);
}, v => fmt(v, 0) + ' mm');
let skirtTimer = 0;
slider('die-skirt', v => {
  state.die.skirt = v;
  clearTimeout(skirtTimer);
  if (state.die.on && state.seg) skirtTimer = setTimeout(updateDieView, 120);
}, v => fmt(v, 0) + ' mm');
$('die-part').addEventListener('change', e => { state.die.part = e.target.checked; applyOpacity(); });
segButtons('die-look-seg', v => { state.die.look = v; applyLook(); });

$('show-parting').addEventListener('change', e => {
  state.showParting = e.target.checked;
  partingLines.visible = state.showParting
    && partingLines.geometry.getAttribute('position')?.count > 0;
});
$('show-edges').addEventListener('change', e => {
  state.showEdges = e.target.checked;
  edgeLines.visible = state.showEdges;
});

/* Hover: Richtung und Entformschräge des Dreiecks unter der Maus.

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
  if (!state.seg) { status.textContent = IDLE; return; }
  const r = view.renderer.domElement.getBoundingClientRect();
  const p = new T.Vector2(((at.x - r.left) / r.width) * 2 - 1, -((at.y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(p, view.camera);
  const hit = ray.intersectObject(partMesh, false)[0];
  if (!hit) { status.textContent = IDLE; return; }
  const f = hit.faceIndex;
  const l = state.seg.label[f];
  const names = dirNames(state.seg.mainAxis);
  const vis = [];
  for (let d = 0; d < 6; d++) if (state.seg.cand[f] & (1 << d)) vis.push(DIRS[d].label);
  status.textContent = (l === UNDERCUT ? 'Hinterschnitt' : names[l].name)
    + ' · Entformschräge ' + fmt(state.draft[f]) + '°'
    + ' · frei gesehen aus: ' + (vis.length ? vis.join(' ') : 'keiner Richtung');
}
view.renderer.domElement.addEventListener('pointerleave', () => {
  hoverAt = null;
  status.textContent = IDLE;
});

/* Handle für die Browser-Konsole UND für den Verdrahtungstest
   (tests/viewer.test.mjs). */
export const __viewer = { state, view, partMesh, partingLines, edgeLines, dieView, recompute, runAnalysis };
window.__form3d = __viewer;

source.start();
