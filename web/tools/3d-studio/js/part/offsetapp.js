/* Offsetflächen-Viewer (offset.html).

   Zwei getrennte Schritte, und nur der erste kostet Zeit:

   1. FELD BERECHNEN (auf Knopfdruck) — js/part/field.js rastert das
      Bauteil und legt für jeden Rasterpunkt den vorzeichenbehafteten
      Abstand zur Oberfläche ab. Auflösung und Bandbreite bestimmen
      Genauigkeit, Speicher und Dauer; beide stehen als Regler daneben,
      und was sie kosten werden, steht VOR dem Rechnen in den Kennzahlen.
   2. FLÄCHE ABLEITEN (sofort) — js/part/surfacenets.js zieht die Fläche
      gleichen Abstands heraus. Solange das Aufmaß in der Bandbreite
      liegt, geht das ohne Neurechnung: eintippen, Eingabetaste, fertig.

   Zusätzlich lässt sich das Feld selbst ansehen — ein Schnitt als
   Rasterbild, gefärbt nach Abstand, mit der Höhenlinie des aktuellen
   Aufmaßes. Das ist die ehrlichste Darstellung dessen, woraus die Fläche
   entsteht. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import { mountPartSource, frame } from './partsource.js';
import { buildField, fieldSize } from './field.js';
import { surfaceNets } from './surfacenets.js';
import { writeSTL } from './stlio.js';
import { volume, surface } from '../mesh.js';
import {
  $, fmt, facts, segButtons, slider, numberInput, runControl, colorbar, gradient, chip
} from '../ui/controls.js';
import * as C from './colors.js';

mountNav('offset.html');

const container = $('viewport');
const status = $('status');
const busy = $('busy');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';

const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  grid: true, gridSize: 600, gridY: -100, minDistance: 5, maxDistance: 20000
});
mountViewBar(container, view);

const state = {
  name: '', model: null, field: null, offsetTris: null,
  res: 96, band: 10, delta: 2,
  show: 'both', opacity: 0.35,
  slice: { on: false, axis: 2, pos: 50 },
  stale: true, running: false, ready: false,
  ms: 0
};

const group = new T.Group();
view.scene.add(group);

const partMat = new T.MeshStandardMaterial({
  color: 0xb5c0c4, roughness: 0.62, metalness: 0.08,
  transparent: true, opacity: 0.35, depthWrite: false, side: T.DoubleSide
});
const partMesh = new T.Mesh(new T.BufferGeometry(), partMat);
group.add(partMesh);

const offsetMat = new T.MeshStandardMaterial({
  color: 0x008c82, roughness: 0.5, metalness: 0.12, side: T.DoubleSide, flatShading: true
});
const offsetMesh = new T.Mesh(new T.BufferGeometry(), offsetMat);
group.add(offsetMesh);

const sliceMat = new T.MeshBasicMaterial({ side: T.DoubleSide, transparent: false });
const sliceMesh = new T.Mesh(new T.PlaneGeometry(1, 1), sliceMat);
sliceMesh.visible = false;
group.add(sliceMesh);

/* ── Bauteil laden ───────────────────────────────────────────── */
const source = mountPartSource({
  busy, viewport: container,
  onStart: name => { state.ready = false; state.name = name; },
  onLoad: model => {
    state.model = model;
    state.field = null;
    state.offsetTris = null;
    state.stale = true;
    /* Bandbreite an die Bauteilgröße anpassen, solange der Nutzer sie
       nicht selbst gesetzt hat. */
    if (!state.bandTouched) {
      state.band = round1(Math.max(2, Math.min(25, model.bounds.diag * 0.05)));
      $('band').value = fmt(state.band);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
    g.computeVertexNormals();
    partMesh.geometry.dispose();
    partMesh.geometry = g;
    offsetMesh.geometry.dispose();
    offsetMesh.geometry = new T.BufferGeometry();
    sliceMesh.visible = false;
    view.fitTo(partMesh);
    updateFieldFacts();
    updateOffsetFacts();
    updateRunButton();
    updateColorbar();
    state.ready = true;
  }
});

/* ── Schritt 1: Feld ─────────────────────────────────────────── */
async function runField() {
  if (!state.model || state.running) return;
  state.running = true;
  state.ready = false;
  updateRunButton();
  const t0 = performance.now();
  try {
    busy.textContent = 'Feld rastern …';
    busy.classList.add('on');
    await frame();
    state.field = await buildField(state.model, {
      res: state.res, band: state.band,
      onProgress: (p, what) => { busy.textContent = 'Feld rastern · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
    });
    state.ms = performance.now() - t0;
    state.stale = false;
    extract();
  } catch (err) {
    $('model-warn').textContent = 'Das Feld konnte nicht gerechnet werden: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.running = false;
    state.ready = true;
    updateRunButton();
  }
}

function markStale() {
  if (!state.model) return;
  state.stale = true;
  updateFieldFacts();
  updateRunButton();
}

const setRun = runControl('run-field', 'field-state');

function updateRunButton() {
  if (state.running) return setRun({ label: 'rechnet …', disabled: true });
  if (!state.model) return setRun({ label: 'Feld berechnen', disabled: true });
  if (!state.field) {
    return setRun({ label: 'Feld berechnen',
      note: 'Noch kein Feld — ohne Feld gibt es keine Offsetfläche.' });
  }
  if (state.stale) {
    return setRun({ label: 'Feld neu berechnen', warn: true,
      note: Math.abs(state.delta) > state.field.band
        ? 'Das Aufmaß liegt außerhalb der gerechneten Bandbreite (± '
          + fmt(state.field.band) + ' mm) — das Feld muss größer werden.'
        : 'Rastereinstellungen geändert — das Bild zeigt noch das vorige Feld.' });
  }
  setRun({ label: 'Feld ist aktuell', outline: true, disabled: true });
}

/* ── Schritt 2: Fläche aus dem Feld ──────────────────────────── */
function extract() {
  if (!state.field) return;
  const t0 = performance.now();
  state.offsetTris = surfaceNets(state.field, state.delta);
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(Float32Array.from(state.offsetTris), 3));
  g.computeVertexNormals();
  offsetMesh.geometry.dispose();
  offsetMesh.geometry = g;
  state.extractMs = performance.now() - t0;
  applyVisibility();
  updateOffsetFacts();
  updateSlice();
  updateColorbar();
}

function applyVisibility() {
  partMesh.visible = state.show !== 'offset';
  offsetMesh.visible = state.show !== 'part' && !!(state.offsetTris && state.offsetTris.length);
  /* Allein dargestellt darf das Bauteil deckend sein. */
  const solo = state.show === 'part';
  partMat.opacity = solo ? 1 : state.opacity;
  partMat.transparent = !solo && state.opacity < 0.999;
  partMat.depthWrite = solo || state.opacity >= 0.999;
  partMat.needsUpdate = true;
}

/* ── Kennzahlen ──────────────────────────────────────────────── */
function updateFieldFacts() {
  if (!state.model) { facts('field-facts', []); return; }
  const est = fieldSize(state.model, state.res, state.band);
  const mb = est.bytes / (1024 * 1024);
  const rows = [
    ['Zellgröße', fmt(est.h) + ' mm'],
    ['Raster', est.dims.join(' × ')],
    ['Rasterpunkte', (est.samples / 1e6).toFixed(2) + ' Mio.'],
    ['Speicher', mb.toFixed(1) + ' MB']
  ];
  if (state.field && !state.stale) rows.push(['Rechenzeit', state.ms.toFixed(0) + ' ms']);
  facts('field-facts', rows);
  $('model-warn').textContent = mb > 400
    ? 'Das Raster braucht ' + mb.toFixed(0) + ' MB — Auflösung oder Bandbreite verkleinern.'
    : '';
}

function updateOffsetFacts() {
  if (!state.field || !state.offsetTris || !state.offsetTris.length) {
    facts('offset-facts', state.model ? [['noch keine Fläche', '—']] : []);
    return;
  }
  const vPart = Math.abs(state.model.volume);
  const vOff = Math.abs(volume(state.offsetTris));
  facts('offset-facts', [
    ['Dreiecke', fmt(state.offsetTris.length / 9, 0)],
    ['Volumen Bauteil', fmt(vPart / 1000) + ' cm³'],
    ['Volumen Offset', fmt(vOff / 1000) + ' cm³'],
    ['Fläche Offset', fmt(surface(state.offsetTris) / 100) + ' cm²'],
    ['Volumenfaktor', (vPart ? vOff / vPart : 1).toLocaleString('de-DE', { minimumFractionDigits: 3, maximumFractionDigits: 3 })],
    ['Ableiten', state.extractMs.toFixed(0) + ' ms']
  ]);
}

/* ── Feldschnitt als Rasterbild ──────────────────────────────── */
/* Farbverlauf: innen warm, außen kühl, an der Bauteiloberfläche weiß.
   Zwei Höhenlinien liegen darüber — die Bauteilfläche (Abstand 0) und
   die aktuelle Offsetfläche. */
function sliceRgb(v, band) {
  const t = Math.max(-1, Math.min(1, v / band));
  return t < 0 ? C.mix('#b42318', '#ffffff', 1 + t) : C.mix('#ffffff', '#00534d', t);
}
const sliceCss = (v, band) => 'rgb(' + sliceRgb(v, band).map(x => Math.round(x * 255)).join(',') + ')';

function sliceColor(v, band, h, delta, out, o) {
  const rgb = sliceRgb(v, band);
  let r = rgb[0], g = rgb[1], b = rgb[2];
  if (Math.abs(v - delta) < h * 0.6) { r = 0.05; g = 0.16; b = 0.2; }      // Offsetlinie
  else if (Math.abs(v) < h * 0.6) { r = 0.35; g = 0.42; b = 0.45; }        // Bauteilkontur
  out[o] = r * 255; out[o + 1] = g * 255; out[o + 2] = b * 255; out[o + 3] = 255;
}

function updateSlice() {
  const f = state.field;
  if (!f || !state.slice.on) { sliceMesh.visible = false; return; }
  const [nx, ny, nz] = f.dims;
  const a = state.slice.axis;
  const n = [nx, ny, nz][a];
  const k = Math.max(0, Math.min(n - 1, Math.round(state.slice.pos / 100 * (n - 1))));
  const coord = f.origin[a] + k * f.h;
  $('slice-pos-val').textContent = fmt(coord) + ' mm';

  /* u/v: die beiden übrigen Achsen, u zuerst in aufsteigender Reihenfolge. */
  const [ua, va] = a === 0 ? [2, 1] : a === 1 ? [0, 2] : [0, 1];
  const w = f.dims[ua], hgt = f.dims[va];
  const px = new Uint8Array(w * hgt * 4);
  const at = (i, j, kk) => f.data[(kk * ny + j) * nx + i];
  for (let vv = 0; vv < hgt; vv++) {
    for (let uu = 0; uu < w; uu++) {
      const idx = [0, 0, 0];
      idx[a] = k; idx[ua] = uu; idx[va] = vv;
      sliceColor(at(idx[0], idx[1], idx[2]), f.band, f.h, state.delta, px, (vv * w + uu) * 4);
    }
  }
  const tex = new T.DataTexture(px, w, hgt, T.RGBAFormat);
  tex.magFilter = T.NearestFilter;       // das Raster soll man sehen
  tex.minFilter = T.LinearFilter;
  tex.needsUpdate = true;
  if (sliceMat.map) sliceMat.map.dispose();
  sliceMat.map = tex;
  sliceMat.needsUpdate = true;

  sliceMesh.geometry.dispose();
  sliceMesh.geometry = new T.PlaneGeometry((w - 1) * f.h, (hgt - 1) * f.h);
  const c = [0, 1, 2].map(ax => f.origin[ax] + (f.dims[ax] - 1) * f.h / 2);
  c[a] = coord;
  sliceMesh.position.set(c[0], c[1], c[2]);
  sliceMesh.rotation.set(0, 0, 0);
  if (a === 0) sliceMesh.rotation.y = -Math.PI / 2;
  else if (a === 1) sliceMesh.rotation.x = Math.PI / 2;
  sliceMesh.visible = true;
}

/* ── Farbskala ───────────────────────────────────────────────── */
function updateColorbar() {
  if (!state.field || !state.slice.on) return colorbar(null);
  const band = state.field.band;
  colorbar({
    title: 'Abstand zur Oberfläche',
    stops: gradient(t => sliceCss(-band + 2 * band * t, band)),
    ticks: [band, band / 2, 0, -band / 2, -band].map(v => fmt(v)),
    extra: chip('#0d2933') + 'Offset ' + fmt(state.delta) + ' mm'
  });
}

/* ── Bedienung ───────────────────────────────────────────────── */
const round1 = v => Math.round(v * 10) / 10;

slider('res', v => { state.res = v; markStale(); updateFieldFacts(); }, v => v + ' Zellen');
numberInput('band', v => {
  state.bandTouched = true;
  state.band = Math.max(0.1, Math.min(1e4, v));
  markStale();
  updateFieldFacts();
  return state.band;
});
$('run-field').addEventListener('click', runField);

/* Verlangt das Aufmaß mehr, als das Feld speichert, wird die Bandbreite
   gleich mitgezogen — dann genügt ein Klick auf „Feld neu berechnen",
   statt zwei Felder von Hand aufeinander abzustimmen. */
numberInput('delta', v => {
  state.delta = Math.max(-1e4, Math.min(1e4, v));
  if (state.field && Math.abs(state.delta) > state.field.band) {
    state.band = round1(Math.abs(state.delta) * 1.15 + 1);
    state.bandTouched = true;
    $('band').value = fmt(state.band);
    markStale();
  } else if (state.field) {
    extract();
  }
  updateColorbar();
  return state.delta;
});
segButtons('show-seg', v => { state.show = v; applyVisibility(); });

$('offset-export').addEventListener('click', () => {
  if (!state.offsetTris || !state.offsetTris.length) return;
  const blob = new Blob([writeSTL(state.offsetTris, 'form3d Offsetflaeche')], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.name.replace(/\.stl$/i, '') || 'bauteil') + '-offset.stl';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$('slice-on').addEventListener('change', e => {
  state.slice.on = e.target.checked;
  $('slice-block').classList.toggle('disabled', !state.slice.on);
  updateSlice();
  updateColorbar();
});
segButtons('slice-seg', v => { state.slice.axis = +v; updateSlice(); });
slider('slice-pos', v => { state.slice.pos = v; updateSlice(); }, () => '');
slider('opacity', v => { state.opacity = v / 100; applyVisibility(); }, v => v + ' %');

status.textContent = IDLE;

export const __viewer = { state, view, partMesh, offsetMesh, sliceMesh, runField, extract };
window.__form3d = __viewer;

source.start();
