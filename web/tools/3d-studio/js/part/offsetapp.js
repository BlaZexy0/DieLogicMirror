/* Wandstärkenanalyse (wandstaerke.html).

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
   Rasterbild in der Turbo-Skala, wahlweise nur innen (dann zeigt es die
   Wandstärke), nur außen oder beides, mit der Höhenlinie des aktuellen
   Aufmaßes. Im Schnitt steht nur das Bauteil, durchscheinend — die
   Offsetfläche verdeckte ihn sonst. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import { mountPartSource, frame } from './partsource.js';
import { buildField, fieldSize, fieldExtrema, thickMaxima } from './field.js';
import { surfaceNets } from './surfacenets.js';
import { writeSTL } from './stlio.js';
import { volume, surface } from '../mesh.js';
import {
  $, fmt, fmtPlain, facts, segButtons, slider, numberInput, runControl, colorbar, gradient, chip
} from '../ui/controls.js';
import * as C from './colors.js';

mountNav('wandstaerke.html');

const container = $('viewport');
const status = $('status');
const busy = $('busy');
const IDLE = 'Ziehen: drehen · Rechte Maustaste: verschieben · Rad: zoomen';

const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  minDistance: 5, maxDistance: 20000
});
mountViewBar(container, view);

const state = {
  name: '', model: null, field: null, offsetTris: null,
  res: 96, band: 10, delta: 2,
  show: 'both', opacity: 0.35,
  slice: { on: false, axis: 2, pos: 50, scale: 'innen' },
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
   Wandstärke. Ein Kreis ist dieselbe Kugel als Umriss, immer zur Kamera
   gedreht und ohne Tiefenprüfung, damit er auch im deckenden Bauteil zu
   sehen ist. */
const hotGroup = new T.Group();
hotGroup.visible = false;
group.add(hotGroup);
const hotSphereGeo = new T.SphereGeometry(1, 24, 16);
const hotRingGeo = new T.RingGeometry(0.86, 1, 48);
const hotSphereMat = new T.MeshStandardMaterial({
  color: 0xb42318, roughness: 0.5, metalness: 0.05, transparent: true, opacity: 0.6, depthWrite: false
});
const hotRingMat = new T.MeshBasicMaterial({
  color: 0xb42318, transparent: true, opacity: 0.92, side: T.DoubleSide, depthTest: false, depthWrite: false
});

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
    state.stats = fieldExtrema(state.field);
    /* Nach innen endet die Skala am Maximum: tiefer als die dickste
       Stelle gibt es keine Fläche mehr, also auch keinen Reglerweg. */
    $('delta-slider').min = String(-Math.ceil(state.stats.maxIn * 2) / 2);
    if (state.delta < -state.stats.maxIn) state.delta = -Math.floor(state.stats.maxIn * 2) / 2;
    $('delta').value = fmtPlain(state.delta);
    $('delta-slider').value = String(Math.max(+$('delta-slider').min, Math.min(40, state.delta)));
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
      note: state.delta > state.field.band
        ? 'Das Aufmaß liegt außerhalb der gerechneten Bandbreite (bis +'
          + fmt(state.field.band) + ' mm) — das Feld muss nach außen größer werden.'
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
  updateHotspots();
}

/* ── Wärmezentren ────────────────────────────────────────────── */
function updateHotspots() {
  for (const c of hotGroup.children.slice()) hotGroup.remove(c);
  const on = state.hot.on && !!state.field && !!state.stats;
  hotGroup.visible = on;
  if (!on) { facts('hot-facts', []); view.invalidate(); return; }
  if (state.hotField !== state.field || state.hotMin !== state.hot.min) {
    state.maxima = thickMaxima(state.field, { minFrac: state.hot.min / 100 });
    state.hotField = state.field;
    state.hotMin = state.hot.min;
  }
  const rings = state.hot.shape === 'kreise';
  for (const m of state.maxima) {
    const mesh = new T.Mesh(rings ? hotRingGeo : hotSphereGeo, rings ? hotRingMat : hotSphereMat);
    mesh.position.set(m.x, m.y, m.z);
    mesh.scale.setScalar(m.r);
    mesh.renderOrder = 4;
    if (rings) mesh.onBeforeRender = (renderer, scene, camera) => { mesh.quaternion.copy(camera.quaternion); };
    hotGroup.add(mesh);
  }
  const st = state.stats;
  const rows = [
    ['Stellen', fmt(state.maxima.length, 0)],
    ['größte Wandstärke', (st.clipped ? '≥ ' : '') + fmt(2 * st.maxIn) + ' mm']
  ];
  if (state.maxima[0]) {
    const m = state.maxima[0];
    rows.push(['dickste bei', [m.x, m.y, m.z].map(v => fmt(v, 0)).join(' / ') + ' mm']);
  }
  facts('hot-facts', rows);
  $('hot-note').textContent = st.clipped
    ? 'Im Kern steht das Feld auf der Bandbreite — das Bauteil ist dort dicker als ' + fmt(2 * state.field.band)
      + ' mm. Bandbreite erhöhen und das Feld neu rechnen, dann sind auch diese Stellen zu sehen.'
    : '';
  view.invalidate();
}

function applyVisibility() {
  /* Im Schnitt — und bei markierten Wärmezentren, wenn man es so will —
     nur das Bauteil, und zwar durchscheinend: die Offsetfläche legte
     sich sonst über Schnittebene und Marken, und das Bauteil deckend
     davor verdeckte sie ebenso. */
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
/* Die Turbo-Skala über den gewählten Bereich:
     innen   |v| von 0 (Oberfläche, blau) bis band (dick, rot) — die Wandstärke;
     außen   v von 0 (blau) bis band (rot);
     beides  von −band (innen, rot) über 0 (grün) bis +band (außen, blau).
   Was nicht zum Bereich gehört, bleibt hellgrau — so hebt sich der
   Querschnitt des Bauteils ab. Zwei Höhenlinien liegen darüber: die
   Bauteilfläche (Abstand 0) und die aktuelle Offsetfläche. */
const OUTSIDE_SCALE = [0.87, 0.9, 0.91];
/* Turbo läuft an beiden Enden ins Dunkle; benutzt wird das Stück von
   sattem Blau bis sattem Rot — sonst lag alles jenseits des Bandes als
   schwarze Fläche im Bild. */
const turbo = t => C.turbo(0.08 + 0.84 * Math.max(0, Math.min(1, t)));
/* Die Enden der Skala sind die GRÖSSTEN Werte, die im Feld vorkommen —
   nicht die Bandbreite. Ein Band von 13 mm bei 6 mm dicksten Wänden
   ließ die halbe Skala ungenutzt, und alles Dicke sah gleich grün aus. */
const scaleEnds = () => {
  const st = state.stats || { maxIn: state.field ? state.field.band : 1, maxOut: state.field ? state.field.band : 1 };
  return { inn: Math.max(st.maxIn, 1e-6), out: Math.max(st.maxOut, 1e-6) };
};
function sliceRgb(v, mode, ends) {
  if (mode === 'innen') return v >= 0 ? OUTSIDE_SCALE : turbo(-v / ends.inn);
  if (mode === 'aussen') return v <= 0 ? OUTSIDE_SCALE : turbo(v / ends.out);
  return turbo((ends.out - v) / (ends.inn + ends.out));
}
const sliceCss = (v, mode, ends) => 'rgb(' + sliceRgb(v, mode, ends).map(x => Math.round(x * 255)).join(',') + ')';

/* Nur die Bauteilkontur liegt als Linie darüber. Die Offsetfläche hat
   hier nichts zu suchen: der Schnitt zeigt das Feld, nicht die Wahl. */
function sliceColor(v, h, mode, ends, out, o) {
  const rgb = sliceRgb(v, mode, ends);
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
  const ends = scaleEnds();
  for (let vv = 0; vv < hgt; vv++) {
    for (let uu = 0; uu < w; uu++) {
      const idx = [0, 0, 0];
      idx[a] = k; idx[ua] = uu; idx[va] = vv;
      sliceColor(at(idx[0], idx[1], idx[2]), f.h, state.slice.scale, ends, px, (vv * w + uu) * 4);
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
/* Innen zeigt die Skala die WANDSTÄRKE (das Doppelte des Feldwerts —
   der Betrag ist der Radius der größten Kugel, die dort hineinpasst),
   außen und beides den Abstand zur Oberfläche. Unten steht jeweils die
   Oberfläche, oben das Ende des Bandes. */
function updateColorbar() {
  if (!state.field || !state.slice.on) return colorbar(null);
  const mode = state.slice.scale;
  const ends = scaleEnds();
  const clipped = state.stats && state.stats.clipped;
  const extra = chip('#14212a') + 'Bauteilkontur';
  if (mode === 'innen') {
    colorbar({
      title: 'Wandstärke' + (clipped ? ' (≥ Band)' : ''),
      stops: gradient(t => sliceCss(-ends.inn * t, mode, ends)),
      ticks: [1, 0.75, 0.5, 0.25, 0].map(q => fmt(2 * ends.inn * q) + ' mm'),
      extra
    });
  } else if (mode === 'aussen') {
    colorbar({
      title: 'Abstand nach außen',
      stops: gradient(t => sliceCss(ends.out * t, mode, ends)),
      ticks: [1, 0.75, 0.5, 0.25, 0].map(q => fmt(ends.out * q) + ' mm'),
      extra
    });
  } else {
    const span = ends.inn + ends.out;
    colorbar({
      title: 'Abstand zur Oberfläche',
      stops: gradient(t => sliceCss(ends.out - span * t, mode, ends)),
      ticks: [0, 0.25, 0.5, 0.75, 1].map(q => fmt(-ends.inn + span * q) + ' mm'),
      extra: extra + ' · innen negativ'
    });
  }
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

/* Das Aufmaß: ein Regler von −20 bis +40 mm für die Hand und ein Feld
   für die Zahl — beide zeigen denselben Wert. Verlangt das Aufmaß mehr,
   als das Feld speichert, wird die Bandbreite gleich mitgezogen; dann
   genügt ein Klick auf „Feld neu berechnen". Am Regler wird höchstens
   einmal je Bild abgeleitet: das Ableiten kostet Millisekunden, aber ein
   Regler meldet sich öfter, als Bilder gezeichnet werden. */
let extractRaf = 0;
/* Tiefer als die dickste Stelle geht es nicht: dort ist nichts mehr,
   was eine Fläche gleichen Abstands haben könnte. */
const minDelta = () => (state.stats ? -state.stats.maxIn : -1e4);
function setDelta(v, live) {
  state.delta = Math.max(minDelta(), Math.min(1e4, v));
  $('delta').value = fmtPlain(state.delta);
  $('delta-slider').value = String(Math.max(+$('delta-slider').min, Math.min(40, state.delta)));
  if (state.field && state.delta > state.field.band) {
    state.band = round1(Math.abs(state.delta) * 1.15 + 1);
    state.bandTouched = true;
    $('band').value = fmt(state.band);
    markStale();
  } else if (state.field) {
    if (live) {
      if (!extractRaf) extractRaf = requestAnimationFrame(() => { extractRaf = 0; extract(); });
    } else extract();
  }
  updateColorbar();
  return state.delta;
}
numberInput('delta', v => setDelta(v, false));
/* Von Hand verdrahtet statt über slider(): der Regler hat kein eigenes
   Wertfeld — die Zahl steht im Eingabefeld daneben. */
$('delta-slider').addEventListener('input', e => setDelta(+e.target.value, true));
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
  applyVisibility();
});
segButtons('slice-seg', v => { state.slice.axis = +v; updateSlice(); });
segButtons('slice-scale-seg', v => { state.slice.scale = v; updateSlice(); updateColorbar(); });

$('hot-on').addEventListener('change', e => {
  state.hot.on = e.target.checked;
  $('hot-block').classList.toggle('disabled', !state.hot.on);
  updateHotspots();
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
