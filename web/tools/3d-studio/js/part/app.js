/* Bauteilanalyse-Viewer (bauteilanalyse.html).

   Ablauf beim Laden eines Bauteils:
     Dreieckssuppe → buildModel (verschweißen, T-Stöße schließen,
     Nachbarschaft) → computeVisibility (sechs Richtungen, teuer, hängt
     NUR am Netz) → segment (Saat, Inseln, Ausbreiten — billig, hängt an
     den Reglern).

   Gerechnet wird NUR auf Knopfdruck. Bei einem großen Netz kostet die
   Sichtbarkeit spürbar Zeit; ein Regler, der jede Zwischenstellung
   durchrechnet, macht die Seite unbenutzbar. Also: Bauteil laden zeigt
   es zunächst grau, „Analyse starten" rechnet, und jede Änderung an den
   Teilungs-Reglern markiert das Ergebnis als veraltet, bis erneut
   bestätigt wird. Reine Darstellungsschalter (Einfärbung, Stufe,
   Grenzwert, Deckkraft) wirken dagegen sofort — sie rechnen nichts neu.

   Gezeichnet wird EIN Netz mit Punktfarben; die Darstellungsart tauscht
   nur das Farb-Attribut aus. Trennlinie und Netzkanten sind eigene
   Linien-Objekte. Die Offsetflächen haben eine eigene Seite
   (offset.html) — sie rechnen über ein Rasterfeld, nicht über dieses
   Netz. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import { mountPartSource, frame } from './partsource.js';
import { computeVisibility, DIRS } from './visibility.js';
import { segment, UNDERCUT, DEFAULTS } from './segment.js';
import { draftAngles, draftStats, dirNames } from './draft.js';
import {
  $, fmt, rgbCss, facts, segButtons, slider, runControl, colorbar, gradient, steps, chip
} from '../ui/controls.js';
import * as C from './colors.js';

mountNav('bauteilanalyse.html');

const container = $('viewport');
const status = $('status');
const busy = $('busy');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';

const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  grid: true, gridSize: 600, gridY: -100, minDistance: 5, maxDistance: 20000
});
mountViewBar(container, view);

/* ── Zustand ─────────────────────────────────────────────────── */
const state = {
  name: '', model: null, vis: null, seg: null, draft: null,
  opts: { ...DEFAULTS },
  stageMax: 3,
  mode: 'regions',
  draftLimit: 1.5,
  showParting: true,
  showEdges: false,
  opacity: 1,
  analysed: false,    // Sichtbarkeit + Zuordnung liegen vor
  stale: true,        // Regler seit der letzten Rechnung verstellt
  running: false,
  ready: false        // false, solange geladen oder gerechnet wird
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

/* ── Bauteil laden ───────────────────────────────────────────── */
const source = mountPartSource({
  busy, viewport: container,
  onStart: name => { state.ready = false; state.name = name; },
  onLoad: model => {
    state.model = model;
    state.vis = null;
    state.seg = null;
    state.draft = null;
    state.analysed = false;
    state.stale = true;
    buildGeometry();
    clearAnalysis();
    view.fitTo(partMesh);
    updateRunButton();
    state.ready = true;
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

/* ── Rechnen auf Bestätigung ─────────────────────────────────── */

/* Die Sichtbarkeit hängt nur am Netz und wird deshalb einmal je Bauteil
   gerechnet; die Zuordnung hängt an den Reglern und läuft danach bei
   jedem Bestätigen erneut (sie kostet nur Millisekunden). */
async function runAnalysis() {
  if (!state.model || state.running) return;
  state.running = true;
  state.ready = false;
  updateRunButton();
  try {
    if (!state.vis) {
      busy.textContent = 'Sichtbarkeit rechnen …';
      busy.classList.add('on');
      await frame();
      state.vis = await computeVisibility(state.model, {
        /* Bei sehr großen Netzen weniger Abtastpunkte je Dreieck — der
           Unterschied ist gering, die Rechenzeit halbiert sich. */
        samples: state.model.faceCount > 120000 ? 4 : 7,
        onProgress: (p, label) => { busy.textContent = 'Sichtbarkeit ' + label + ' … ' + Math.round(p * 100) + ' %'; }
      });
    }
    state.analysed = true;
    state.stale = false;
    recompute();
  } catch (err) {
    $('model-warn').textContent = 'Die Analyse ist gescheitert: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.running = false;
    state.ready = true;
    updateRunButton();
  }
}

/* Ein Teilungs-Regler wurde verstellt: Ergebnis stehen lassen, aber als
   veraltet kennzeichnen. */
function markStale() {
  if (!state.model) return;
  state.stale = true;
  updateRunButton();
}

const setRun = runControl('run-analysis', 'analysis-state');

function updateRunButton() {
  if (state.running) return setRun({ label: 'rechnet …', disabled: true });
  if (!state.model) return setRun({ label: 'Analyse starten', disabled: true });
  if (!state.analysed) {
    return setRun({ label: 'Analyse starten',
      note: 'Noch nicht gerechnet — ' + fmt(state.model.faceCount, 0) + ' Dreiecke.' });
  }
  if (state.stale) {
    return setRun({ label: 'Analyse aktualisieren', warn: true,
      note: 'Einstellungen geändert — das Bild zeigt noch die vorige Rechnung.' });
  }
  setRun({ label: 'Analyse ist aktuell', outline: true, disabled: true });
}

/* Anzeige ohne Analyse: graues Bauteil, leere Legende. */
function clearAnalysis() {
  const col = partMesh.geometry.getAttribute('color');
  if (col) { col.array.fill(0.75); col.needsUpdate = true; }
  partingLines.visible = false;
  $('parting-count').textContent = '0';
  $('legend').innerHTML = '<div class="legend-row"><span class="name">Noch keine Analyse — auf „Analyse starten" klicken.</span></div>';
  $('seg-facts').innerHTML = '';
  $('draft-facts').innerHTML = '';
  updateColorbar();
}

/* ── Zuordnung neu rechnen (Millisekunden — nur die Regler) ──── */
let lastRecomputeMs = 0;

function recompute() {
  if (!state.model || !state.vis) return;
  const t0 = performance.now();
  state.seg = segment(state.model, state.vis, state.opts);
  state.draft = draftAngles(state.model, state.vis, state.seg.label);
  updateColors();
  updatePartingLine();
  updateLegend();
  updateColorbar();
  lastRecomputeMs = performance.now() - t0;
  updateFacts(lastRecomputeMs);
}

/* ── Farben ──────────────────────────────────────────────────── */
function updateColors() {
  const { model, seg, draft, mode, stageMax } = state;
  if (!seg) return;
  const col = partMesh.geometry.getAttribute('color');
  const arr = col.array;
  const cand = seg.cand;
  const open = C.hex2rgb(C.OPEN_COLOR);

  for (let f = 0; f < model.faceCount; f++) {
    let rgb;
    if (mode === 'plain') {
      rgb = [0.72, 0.76, 0.78];
    } else if (mode === 'count') {
      let n = 0;
      for (let d = 0; d < 6; d++) if (cand[f] & (1 << d)) n++;
      rgb = C.hex2rgb(C.COUNT_COLORS[Math.min(n, C.COUNT_COLORS.length - 1)]);
    } else if (seg.label[f] === UNDERCUT) {
      rgb = C.hex2rgb(mode === 'draft' ? C.UNDERCUT_DARK : C.UNDERCUT_COLOR);
    } else if (seg.stage[f] > stageMax) {
      rgb = open;                                   // Stufe noch nicht erreicht
    } else if (mode === 'draft') {
      rgb = C.draftColor(draft[f], state.draftLimit);
    } else {
      rgb = C.hex2rgb(C.REGION_COLORS[seg.label[f]]);
    }
    for (let e = 0; e < 3; e++) {
      arr[f * 9 + e * 3] = rgb[0];
      arr[f * 9 + e * 3 + 1] = rgb[1];
      arr[f * 9 + e * 3 + 2] = rgb[2];
    }
  }
  col.needsUpdate = true;
}

function updatePartingLine() {
  const { model, seg, stageMax } = state;
  if (!seg) return;
  /* Nur Kanten zwischen zwei bereits entschiedenen, verschiedenen
     Regionen — in Stufe 1 ist die Trennlinie deshalb noch löchrig. */
  const pts = [];
  const { nbr, index, verts, faceCount: F } = model;
  const eff = f => (seg.stage[f] > stageMax ? -3 : seg.label[f]);
  for (let f = 0; f < F; f++) {
    for (let e = 0; e < 3; e++) {
      const w = nbr[f * 3 + e];
      if (w < 0 || w < f) continue;
      const a = eff(f), b = eff(w);
      if (a === b || a === -3 || b === -3) continue;
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
  const { model, seg, stageMax, mode } = state;
  if (!seg) return;
  const el = $('legend');
  const names = dirNames(state.opts.mainAxis);
  const A = model.totalArea || 1;

  /* Fläche je Region NUR bis zur gewählten Stufe. */
  const area = new Float64Array(8);
  for (let f = 0; f < model.faceCount; f++) {
    const l = seg.label[f];
    if (l === UNDERCUT) area[6] += model.areas[f];
    else if (seg.stage[f] > stageMax) area[7] += model.areas[f];
    else area[l] += model.areas[f];
  }

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
  if (mode === 'count') {
    el.innerHTML = [0, 1, 2, 3].map(n =>
      '<div class="legend-row">' + chip(C.COUNT_COLORS[n])
      + '<span class="name">' + (n === 0 ? 'keine Richtung (Hinterschnitt)' : n === 3 ? '3 und mehr Richtungen' : n + (n === 1 ? ' Richtung (eindeutig)' : ' Richtungen')) + '</span></div>').join('');
    return;
  }
  if (mode === 'plain') { el.innerHTML = '<div class="legend-row"><span class="name">Ohne Einfärbung.</span></div>'; return; }

  const rows = names.map((d, i) => ({
    name: d.name, color: C.REGION_COLORS[i], frac: area[i] / A
  }));
  rows.push({ name: 'Hinterschnitt (keine Richtung)', color: C.UNDERCUT_COLOR, frac: area[6] / A });
  if (area[7] > 0) rows.push({ name: 'noch offen (spätere Stufe)', color: C.OPEN_COLOR, frac: area[7] / A });

  el.innerHTML = rows.map(r =>
    '<div class="legend-row' + (r.frac < 0.0005 ? ' off' : '') + '">' + chip(r.color)
    + '<span class="name">' + r.name + '</span>'
    + '<span class="pct">' + (100 * r.frac).toFixed(1) + ' %</span></div>').join('');
}

/* Farbskala links unten im Viewport — nur für Größen mit einer Ordnung:
   die Entformschräge (stetig) und die Anzahl entformbarer Richtungen
   (abgestuft). Bei den Regionen wäre eine Skala falsch, dort gibt es
   keine Reihenfolge; das erklärt die Legende in der Seitenleiste. */
function updateColorbar() {
  if (!state.seg || (state.mode !== 'draft' && state.mode !== 'count')) return colorbar(null);
  if (state.mode === 'draft') {
    const lim = state.draftLimit, top = 3 * lim;
    return colorbar({
      title: 'Entformschräge',
      stops: gradient(t => rgbCss(C.draftColor(top * t, lim))),
      ticks: [top, 2 * lim, lim, 0].map(v => fmt(v) + '°'),
      extra: chip(C.UNDERCUT_DARK) + 'Hinterschnitt'
    });
  }
  colorbar({
    title: 'Entformbar aus',
    stops: steps([0, 1, 2, 3].map(n => C.COUNT_COLORS[n])),
    ticks: ['3+', '2', '1', '0'],
    bands: true
  });
}

function updateFacts(ms) {
  const { seg, model } = state;
  if (!seg) return;
  const c = seg.counts;
  facts('seg-facts', [
    ['Saat (eindeutig)', fmt(c.seed, 0) + ' △'],
    ['Inseln aufgenommen', fmt(c.island, 0) + ' △'],
    ['ausgebreitet', fmt(c.grown, 0) + ' △'],
    ['Nachsaat', fmt(c.rest, 0) + ' △'],
    ['Hinterschnitt', fmt(c.undercut, 0) + ' △'],
    ['Rechenzeit', ms.toFixed(0) + ' ms']
  ]);

  const st = draftStats(model, state.draft, seg.label, state.draftLimit);
  facts('draft-facts', [
    ['kleinste Schräge', fmt(st.min) + ' °'],
    ['unter Grenzwert', (100 * st.belowFrac).toFixed(1) + ' % der Fläche'],
    ['Hinterschnitt', (100 * st.undercutFrac).toFixed(1) + ' % der Fläche']
  ]);
}

/* ── Bedienung ───────────────────────────────────────────────── */
/* Teilungs-Regler: rechnen NICHT sofort, sondern markieren das Ergebnis
   als veraltet (siehe Kopfkommentar). */
segButtons('axis-seg', v => { state.opts.mainAxis = +v; markStale(); });
slider('min-draft', v => { state.opts.minDraftDeg = v; markStale(); }, v => fmt(v) + ' °');
slider('slider-pen', v => { state.opts.sliderPenalty = v; markStale(); }, v => fmt(v));
slider('edge-w', v => { state.opts.edgeWeight = v; markStale(); }, v => fmt(v));
$('run-analysis').addEventListener('click', runAnalysis);

/* Darstellungsschalter: wirken sofort, sie rechnen nichts neu. */
segButtons('stage-seg', v => {
  state.stageMax = +v;
  updateColors(); updatePartingLine(); updateLegend();
});
segButtons('mode-seg', v => {
  state.mode = v;
  $('draft-block').classList.toggle('disabled', v !== 'draft');
  updateColors(); updateLegend(); updateColorbar();
});
slider('draft-limit', v => {
  state.draftLimit = v;
  if (state.seg) { updateColors(); updateLegend(); updateColorbar(); updateFacts(lastRecomputeMs); }
}, v => fmt(v) + ' °');
slider('opacity', v => {
  state.opacity = v / 100;
  partMat.opacity = state.opacity;
  partMat.transparent = state.opacity < 0.999;
  partMat.depthWrite = state.opacity >= 0.999;
  partMat.needsUpdate = true;
}, v => v + ' %');

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
   Bildtakt (auf abstand.html mit zwei Netzen doppelt). Deshalb wird nur die
   zuletzt gemeldete Position gemerkt und höchstens einmal je Bild
   ausgewertet: für eine Anzeige unter dem Zeiger ist das genau richtig. */
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
  const names = dirNames(state.opts.mainAxis);
  const stageName = ['—', 'Saat', 'Insel', 'ausgebreitet', 'Nachsaat'][state.seg.stage[f]];
  const vis = [];
  for (let d = 0; d < 6; d++) if (state.seg.cand[f] & (1 << d)) vis.push(DIRS[d].label);
  status.textContent = (l === UNDERCUT ? 'Hinterschnitt' : names[l].name)
    + ' · ' + stageName
    + ' · Entformschräge ' + fmt(state.draft[f]) + '°'
    + ' · entformbar aus: ' + (vis.length ? vis.join(' ') : 'keiner Richtung');
}
view.renderer.domElement.addEventListener('pointerleave', () => {
  hoverAt = null;
  status.textContent = IDLE;
});

/* Handle für die Browser-Konsole UND für den Verdrahtungstest
   (tests/viewer.test.mjs). */
export const __viewer = { state, view, partMesh, partingLines, edgeLines, recompute, runAnalysis };
window.__form3d = __viewer;

source.start();
