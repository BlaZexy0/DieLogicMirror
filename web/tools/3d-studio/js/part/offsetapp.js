/* Wandstärkenanalyse (wandstaerke.html).

   Zwei getrennte Schritte, und nur der erste kostet Zeit:

   1. FELD BERECHNEN (auf Knopfdruck) — js/part/field.js rastert das
      Bauteil mit der gewählten ZELLKANTE und legt für jeden Rasterpunkt
      den vorzeichenbehafteten Abstand zur Oberfläche ab. Das Feld reicht
      nur so weit wie das Bauteil (zwei Zellen Luft): nach außen braucht
      diese Seite nichts — Abstandsflächen außen, für die Temperierung,
      rechnet der Temperierkanal-Designer selbst. Nach innen ist das Feld
      vollständig (das Innere über die Distanztransformation). Was die
      Zellkante kostet, steht VOR dem Rechnen in den Kennzahlen.
   2. ISOFLÄCHE ABLEITEN (sofort) — js/part/surfacenets.js zieht die
      Fläche gleichen Abstands INNEN heraus: ein Untermaß von s lässt
      stehen, was dicker als 2·s ist — die dicken Bereiche. Eintippen oder
      ziehen, kein neues Feld.

   Dazu der FELDSCHNITT — die Wandstärke als Rasterbild in der Turbo-Skala
   — und die WÄRMEZENTREN: die dicksten Stellen als Kugeln mit dem Radius
   des Feldwerts, gefärbt nach ihrer Größe auf derselben Skala. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountPartSource, frame } from './partsource.js';
import { buildField, fieldSize, fieldExtrema, thickMaxima, suggestCell, CELL_RANGE } from './field.js';
import { surfaceNets } from './surfacenets.js';
import { writeSTL } from './stlio.js';
import { volume, surface } from '../mesh.js';
import {
  $, fmt, fmtPlain, facts, segButtons, slider, numberInput, runControl, colorbar, gradient, chip
} from '../ui/controls.js';
import * as C from './colors.js';

const container = $('viewport');
const status = $('status');
const busy = $('busy');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';

const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  minDistance: 5, maxDistance: 20000
});
mountViewBar(container, view);

/* Das Feld eng um das Bauteil: zwei Zellen Luft, exakt gestempelte
   Abstände drei Zellen um die Oberfläche, der Rest innen aus der
   Distanztransformation (auf eine halbe Zelle genau). */
const PAD_CELLS = 2;
const BAND_CELLS = 3;

const state = {
  name: '', model: null, field: null, offsetTris: null,
  cell: 3, cellTouched: false,
  under: 2, underTouched: false,              // Untermaß in mm, nach innen
  show: 'both', opacity: 0.35,
  slice: { on: false, axis: 2, pos: 50 },
  /* Wärmezentren: die dicksten Stellen als Kugeln (Kugelprobe) oder
     Kreise, ab einem Anteil der größten Wandstärke. */
  hot: { on: false, shape: 'kugeln', min: 75, clear: true },
  stats: null, maxima: [], hotField: null,
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

/* Die Marken der dicksten Stellen. Eine Kugel hat genau den Radius des
   Feldwerts — sie ist die Kugelprobe selbst, ihr Durchmesser die
   Wandstärke — und die Farbe ihrer Größe auf der Wandstärken-Skala. Ein
   Kreis ist dieselbe Kugel als Umriss, immer zur Kamera gedreht und ohne
   Tiefenprüfung, damit er auch im deckenden Bauteil zu sehen ist. */
const hotGroup = new T.Group();
hotGroup.visible = false;
group.add(hotGroup);
const hotSphereGeo = new T.SphereGeometry(1, 24, 16);
const hotRingGeo = new T.RingGeometry(0.86, 1, 48);

/* ── Bauteil laden ───────────────────────────────────────────── */
const source = mountPartSource({
  busy, viewport: container,
  onStart: name => { state.ready = false; state.name = name; },
  onLoad: model => {
    state.model = model;
    state.field = null;
    state.offsetTris = null;
    state.stats = null;
    state.maxima = [];
    state.stale = true;
    state.underTouched = false;               // ein neues Teil bekommt wieder die Vorgabe
    /* Die Zellkante folgt dem Bauteil (halbe Wanddicke 2V/A), solange der
       Nutzer sie nicht selbst gesetzt hat. */
    if (!state.cellTouched) {
      state.cell = suggestCell(model);
      $('cell').value = fmtPlain(state.cell);
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
    g.computeVertexNormals();
    partMesh.geometry.dispose();
    partMesh.geometry = g;
    offsetMesh.geometry.dispose();
    offsetMesh.geometry = new T.BufferGeometry();
    sliceMesh.visible = false;
    clearHotspots();
    view.fitTo(partMesh);
    updateFieldFacts();
    updateOffsetFacts();
    updateRunButton();
    updateColorbar();
    state.ready = true;
  }
});

/** Zellkante, Band und Luft des Feldes — alles aus der Zellkante. */
function fieldParams() {
  const h = state.cell;
  return { h, band: BAND_CELLS * h, pad: PAD_CELLS * h };
}

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
      ...fieldParams(),
      onProgress: (p, what) => { busy.textContent = 'Feld rastern · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
    });
    state.ms = performance.now() - t0;
    state.stale = false;
    state.stats = fieldExtrema(state.field);
    /* Der Regler endet an der dicksten Stelle: tiefer als das Maximum gibt
       es keine Fläche mehr. */
    $('under-slider').max = String(Math.ceil(state.stats.maxIn * 2) / 2);
    /* Vorgabe: ein Untermaß von der halben größten Tiefe — stehen bleibt,
       was dicker ist als die halbe größte Wandstärke: die dicken Bereiche,
       um die es geht. Wer das Untermaß selbst gesetzt hat, behält es. */
    if (!state.underTouched) state.under = Math.round(state.stats.maxIn) / 2;
    if (state.under > state.stats.maxIn) state.under = Math.floor(state.stats.maxIn * 2) / 2;
    $('under').value = fmtPlain(state.under);
    $('under-slider').value = String(state.under);
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
      note: 'Noch kein Feld: ohne Feld gibt es weder Wandstärke noch Isofläche.' });
  }
  if (state.stale) {
    return setRun({ label: 'Feld neu berechnen', warn: true,
      note: 'Zellkante geändert: das Bild zeigt noch das vorige Feld.' });
  }
  setRun({ label: 'Feld ist aktuell', outline: true, disabled: true });
}

/* ── Schritt 2: Fläche aus dem Feld ──────────────────────────── */
function extract() {
  if (!state.field) return;
  const t0 = performance.now();
  state.offsetTris = surfaceNets(state.field, -state.under);
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
  updateHotspots();
}

/* ── Wärmezentren ────────────────────────────────────────────── */
function clearHotspots() {
  for (const c of hotGroup.children.slice()) { c.material.dispose(); hotGroup.remove(c); }
}

function updateHotspots() {
  clearHotspots();
  const on = state.hot.on && !!state.field && !!state.stats;
  hotGroup.visible = on;
  if (!on) { facts('hot-facts', []); view.invalidate(); return; }
  if (state.hotField !== state.field || state.hotMin !== state.hot.min) {
    state.maxima = thickMaxima(state.field, { minFrac: state.hot.min / 100 });
    state.hotField = state.field;
    state.hotMin = state.hot.min;
  }
  const rings = state.hot.shape === 'kreise';
  const maxIn = Math.max(state.stats.maxIn, 1e-6);
  for (const m of state.maxima) {
    const rgb = turbo(m.r / maxIn);
    const color = new T.Color(rgb[0], rgb[1], rgb[2]);
    const mat = rings
      ? new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, side: T.DoubleSide, depthTest: false, depthWrite: false })
      : new T.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.05, transparent: true, opacity: 0.65, depthWrite: false });
    const mesh = new T.Mesh(rings ? hotRingGeo : hotSphereGeo, mat);
    mesh.position.set(m.x, m.y, m.z);
    mesh.scale.setScalar(m.r);
    mesh.renderOrder = 4;
    mesh.userData.r = m.r;
    if (rings) mesh.onBeforeRender = (renderer, scene, camera) => { mesh.quaternion.copy(camera.quaternion); };
    hotGroup.add(mesh);
  }
  const rows = [
    ['Stellen', fmt(state.maxima.length, 0)],
    ['größte Wandstärke', fmt(2 * state.stats.maxIn) + ' mm']
  ];
  if (state.maxima[0]) {
    const m = state.maxima[0];
    rows.push(['dickste bei', [m.x, m.y, m.z].map(v => fmt(v, 0)).join(' / ') + ' mm']);
  }
  if (state.maxima.length > 1) {
    const last = state.maxima[state.maxima.length - 1];
    rows.push(['kleinste Marke', fmt(2 * last.r) + ' mm']);
  }
  facts('hot-facts', rows);
  view.invalidate();
}

function applyVisibility() {
  /* Im Schnitt — und bei markierten Wärmezentren, wenn man es so will —
     nur das Bauteil, und zwar durchscheinend: die Isofläche legte sich
     sonst über Schnittebene und Marken, und das Bauteil deckend davor
     verdeckte sie ebenso. */
  const slice = (state.slice.on || (state.hot.on && state.hot.clear)) && !!state.field;
  partMesh.visible = slice || state.show !== 'offset';
  offsetMesh.visible = !slice && state.show !== 'part' && !!(state.offsetTris && state.offsetTris.length);
  /* Allein dargestellt darf das Bauteil deckend sein. */
  const solo = !slice && state.show === 'part';
  const opacity = slice ? Math.min(state.opacity, 0.45) : state.opacity;
  partMat.opacity = solo ? 1 : opacity;
  partMat.transparent = !solo && opacity < 0.999;
  partMat.depthWrite = solo || opacity >= 0.999;
  partMat.needsUpdate = true;
  view.invalidate();
}

/* ── Kennzahlen ──────────────────────────────────────────────── */
function updateFieldFacts() {
  if (!state.model) { facts('field-facts', []); return; }
  const p = fieldParams();
  const est = fieldSize(state.model, 0, p.band, { h: p.h, pad: p.pad });
  const mb = est.bytes / (1024 * 1024);
  const rows = [
    ['Zellkante', fmt(est.h, 2) + ' mm'],
    ['Raster', est.dims.join(' × ')],
    ['Rasterpunkte', (est.samples / 1e6).toFixed(2) + ' Mio.'],
    ['Speicher', mb.toFixed(1) + ' MB']
  ];
  if (state.field && !state.stale) rows.push(['Rechenzeit', state.ms.toFixed(0) + ' ms']);
  facts('field-facts', rows);
  $('model-warn').textContent = mb > 400
    ? 'Das Raster braucht ' + mb.toFixed(0) + ' MB: Zellkante vergrößern.'
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
    ['Volumen in der Isofläche', fmt(vOff / 1000) + ' cm³'],
    ['Inhalt der Isofläche', fmt(surface(state.offsetTris) / 100) + ' cm²'],
    ['Volumenanteil', (100 * (vPart ? vOff / vPart : 0)).toFixed(1) + ' %'],
    ['Ableiten', state.extractMs.toFixed(0) + ' ms']
  ]);
}

/* ── Feldschnitt als Rasterbild ──────────────────────────────── */
/* Die Turbo-Skala über die Wandstärke: |v| von 0 (Oberfläche, blau) bis
   zur dicksten Stelle (rot). Außen bleibt hellgrau — so hebt sich der
   Querschnitt des Bauteils ab; die Bauteilkontur liegt als dunkle Linie
   darüber. Turbo läuft an beiden Enden ins Dunkle; benutzt wird das
   Stück von sattem Blau bis sattem Rot. */
const OUTSIDE_SCALE = [0.87, 0.9, 0.91];
const turbo = t => C.turbo(0.08 + 0.84 * Math.max(0, Math.min(1, t)));
const scaleEnd = () => Math.max(state.stats ? state.stats.maxIn : 1, 1e-6);
const sliceRgb = (v, inn) => (v >= 0 ? OUTSIDE_SCALE : turbo(-v / inn));
const sliceCss = (v, inn) => 'rgb(' + sliceRgb(v, inn).map(x => Math.round(x * 255)).join(',') + ')';

function sliceColor(v, h, inn, out, o) {
  const rgb = sliceRgb(v, inn);
  let r = rgb[0], g = rgb[1], b = rgb[2];
  if (Math.abs(v) < h * 0.6) { r = 0.08; g = 0.13; b = 0.16; }
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
  const inn = scaleEnd();
  for (let vv = 0; vv < hgt; vv++) {
    for (let uu = 0; uu < w; uu++) {
      const idx = [0, 0, 0];
      idx[a] = k; idx[ua] = uu; idx[va] = vv;
      sliceColor(at(idx[0], idx[1], idx[2]), f.h, inn, px, (vv * w + uu) * 4);
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
  view.invalidate();
}

/* ── Farbskala ───────────────────────────────────────────────── */
/* Eine Skala für Schnitt und Marken: die WANDSTÄRKE (das Doppelte des
   Feldwerts — der Betrag ist der Radius der größten Kugel, die dort
   hineinpasst), unten die Oberfläche, oben die dickste Stelle. */
function updateColorbar() {
  if (!state.field || !state.stats || !(state.slice.on || state.hot.on)) return colorbar(null);
  const inn = scaleEnd();
  colorbar({
    title: 'Wandstärke',
    stops: gradient(t => sliceCss(-inn * t, inn)),
    ticks: [1, 0.75, 0.5, 0.25, 0].map(q => fmt(2 * inn * q) + ' mm'),
    extra: (state.slice.on ? chip('#14212a') + 'Bauteilkontur' : '')
      + (state.hot.on ? (state.slice.on ? ' · ' : '') + 'Marken nach Größe gefärbt' : '')
  });
}

/* ── Bedienung ───────────────────────────────────────────────── */
numberInput('cell', v => {
  state.cellTouched = true;
  state.cell = Math.max(CELL_RANGE[0], Math.min(CELL_RANGE[1], v));
  markStale();
  updateFieldFacts();
  return state.cell;
});
$('run-field').addEventListener('click', runField);

/* Das Untermaß: ein Regler von 0 bis zur dicksten Stelle für die Hand und
   ein Feld für die Zahl — beide zeigen denselben Wert; ein Minus davor
   ist egal, nach innen geht es ohnehin. Am Regler wird höchstens einmal
   je Bild abgeleitet: das Ableiten kostet Millisekunden, aber ein Regler
   meldet sich öfter, als Bilder gezeichnet werden. */
let extractRaf = 0;
const maxUnder = () => (state.stats ? state.stats.maxIn : 1e4);
function setUnder(v, live) {
  state.underTouched = true;
  state.under = Math.max(0, Math.min(maxUnder(), Math.abs(v)));
  $('under').value = fmtPlain(state.under);
  $('under-slider').value = String(state.under);
  if (state.field) {
    if (live) {
      if (!extractRaf) extractRaf = requestAnimationFrame(() => { extractRaf = 0; extract(); });
    } else extract();
  }
  return state.under;
}
numberInput('under', v => setUnder(v, false));
/* Von Hand verdrahtet statt über slider(): der Regler hat kein eigenes
   Wertfeld — die Zahl steht im Eingabefeld daneben. */
$('under-slider').addEventListener('input', e => setUnder(+e.target.value, true));
segButtons('show-seg', v => { state.show = v; applyVisibility(); });

$('offset-export').addEventListener('click', () => {
  if (!state.offsetTris || !state.offsetTris.length) return;
  const blob = new Blob([writeSTL(state.offsetTris, 'form3d Isofläche')], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (state.name.replace(/\.stl$/i, '') || 'bauteil') + '-isoflaeche.stl';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});

$('slice-on').addEventListener('change', e => {
  state.slice.on = e.target.checked;
  $('slice-block').classList.toggle('disabled', !state.slice.on);
  updateSlice();
  updateColorbar();
  applyVisibility();
});
segButtons('slice-seg', v => { state.slice.axis = +v; updateSlice(); });

$('hot-on').addEventListener('change', e => {
  state.hot.on = e.target.checked;
  $('hot-block').classList.toggle('disabled', !state.hot.on);
  updateHotspots();
  updateColorbar();
  applyVisibility();
});
$('hot-clear').addEventListener('change', e => { state.hot.clear = e.target.checked; applyVisibility(); });
segButtons('hot-seg', v => { state.hot.shape = v; updateHotspots(); });
slider('hot-min', v => { state.hot.min = v; updateHotspots(); }, v => v + ' %');
slider('slice-pos', v => { state.slice.pos = v; updateSlice(); }, () => '');
slider('opacity', v => { state.opacity = v / 100; applyVisibility(); }, v => v + ' %');

status.textContent = IDLE;

export const __viewer = { state, view, partMesh, offsetMesh, sliceMesh, hotGroup, runField, extract };
window.__form3d = __viewer;

source.start();
