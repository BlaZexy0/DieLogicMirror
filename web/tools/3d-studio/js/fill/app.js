/* Füllabschätzung (fuellung.html) — Einstieg und Verdrahtung.

   Das Bauteil wird gerastert (js/part/field.js: innen negativ, außen
   positiv), auf seine Wand setzt man rechteckige Anschnitte — Klick
   aufs Bauteil, Rechteck in der Wandebene, Breite und Höhe wie beim
   Angussdesigner —, und js/fill/solve.js lässt die Front von dort durch
   die Innenzellen laufen. Heraus kommt je Zelle der FÜLLGRAD, bei dem
   sie voll wird.

   Drei Ansichten davon: das Bauteil nach Füllgrad gefärbt (Turbo, früh
   blau, spät rot; was über dem Regler liegt, bleibt grau — so wandert
   die Front über die Oberfläche), der FÜLLKÖRPER — die Schmelze bei
   diesem Füllgrad als Fläche aus dem Raster gezogen — und die zuletzt
   gefüllten Stellen als Kugeln: dort gehören Überläufe hin.

   Die Rechnung dauert Sekunden (je feiner die Zellkante, desto länger);
   nach dem ersten Lauf läuft sie bei jeder Änderung am Plan von selbst
   nach. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { $, fmt, facts, segButtons, slider, numberInput, colorbar, gradient, rgbCss } from '../ui/controls.js';
import { mountPartSource, frame } from '../part/partsource.js';
import { buildField, fieldSize } from '../part/field.js';
import { surfaceNets } from '../part/surfacenets.js';
import { writeSTL } from '../part/stlio.js';
import { turbo } from '../part/colors.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import * as M from './model.js';
import { buildAll } from './geom.js';
import { solveFill, fracToSurface, sampleFrac, fillBodyField, lastSpots } from './solve.js';

const container = $('viewport');
const busy = $('busy');
const view = initScene(container, {
  cameraStart: [260, 200, 260], target: [0, 0, 0],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = {
  plan: M.emptyPlan(), model: null, name: '', field: null, fieldH: 0,
  h: 3, hAuto: true, result: null, surf: null, stale: true, computing: false, queued: false,
  show: 'farbe', q: 1, spots: { on: true, count: 5, list: [] },
  defaults: { w: 30, h: 2 }, ms: 0, opacity: 1, ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

/* Das Bauteil: einmal grau (Wand, auf die geklickt wird), einmal nach
   Füllgrad gefärbt — dasselbe Netz, zwei Materialien. */
const plainMat = new T.MeshStandardMaterial({ color: 0xb5c0c4, roughness: 0.7, metalness: 0.05, side: T.DoubleSide });
const colorMat = new T.MeshStandardMaterial({
  vertexColors: true, color: 0xffffff, roughness: 0.62, metalness: 0.06, side: T.DoubleSide
});
const partMesh = new T.Mesh(new T.BufferGeometry(), plainMat);
partMesh.visible = false;
group.add(partMesh);

/* Der Füllkörper: die Schmelze bis zum Füllgrad, in Turbo-Rot der Front. */
const bodyMat = new T.MeshStandardMaterial({ color: 0xd8a23a, roughness: 0.35, metalness: 0.45, side: T.DoubleSide, flatShading: true });
const bodyMesh = new T.Mesh(new T.BufferGeometry(), bodyMat);
bodyMesh.visible = false;
group.add(bodyMesh);

const inletMat = new T.MeshStandardMaterial({ color: M.COLOR, roughness: 0.5, metalness: 0.1, side: T.DoubleSide, flatShading: true });
const inletMesh = new T.Mesh(new T.BufferGeometry(), inletMat);
group.add(inletMesh);

/* Die zuletzt gefüllten Stellen als Kugeln, Größe im Bild konstant. */
const spotGeo = new T.SphereGeometry(1, 20, 14);
const spotMat = new T.MeshBasicMaterial({ color: 0xb42318, depthTest: false, transparent: true, opacity: 0.9 });
const spotGroup = new T.Group();
spotGroup.renderOrder = 5;
group.add(spotGroup);

/* ── Griffe ──────────────────────────────────────────────────── */
const handles = createHandles({
  view,
  getRefMesh: () => partMesh,
  markColor: M.COLOR,
  items: () => M.allItems(state.plan).map(it => ({
    id: it.id, pos: it.pos, color: M.COLOR, dir: it.n, planeSize: Math.max(24, it.w * 1.5)
  })),
  /* Gezogen wird in der Wandebene: der Anschnitt rutscht auf der Wand. */
  plane: id => {
    const it = state.plan.items[id];
    return it ? { origin: it.pos, normal: it.n } : null;
  },
  move: (id, pos) => M.setPos(state.plan, id, pos),
  onSelect: () => { cancelAim(); syncSelection(); },
  onChange: what => {
    if (what === 'drag') { rebuild('drag'); return; }
    rebuild();
    if (what === 'drop') { syncSelection(); planChanged(); }
  },
  onAim: id => startMove(id)
});

/* ── Kette: Plan → Anzeige ───────────────────────────────────── */
function setTris(mesh, tris, smooth) {
  const attr = mesh.geometry.getAttribute('position');
  if (attr && attr.array.length === tris.length) {
    attr.array.set(tris);
    attr.needsUpdate = true;
    mesh.geometry.boundingSphere = null;
    if (smooth) mesh.geometry.computeVertexNormals();
  } else {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3));
    if (smooth) geo.computeVertexNormals();
    mesh.geometry.dispose();
    mesh.geometry = geo;
  }
  mesh.visible = tris.length > 0;
}

function rebuild(mode) {
  setTris(inletMesh, buildAll(state.plan));
  handles.refresh();
  if (mode === 'drag') { view.invalidate(); return; }
  updateMenu();
  view.invalidate();
}

/* ── Raster ──────────────────────────────────────────────────── */
/* Wie fein gerastert wird, sagt die ZELLKANTE in mm — nicht eine
   Zellenzahl entlang der längsten Kante. Der Anwender kennt die
   Wanddicke seines Teils, und die muss das Raster auflösen: mindestens
   zwei Zellen über die Dicke, also die halbe Wanddicke als Kante. Genau
   das ist der Vorschlag beim Laden (Wanddicke 2V/A des Bauteils). Nach
   oben begrenzt nur der Speicher: mehr als MAX_SAMPLES Rasterpunkte gibt
   es nicht — dann wird die Kante angehoben, und die Zeile sagt es.

   Das Raster liegt ENG um das Bauteil, zwei Zellen Rand. Das Feld der
   Wandstärkenanalyse trägt außen ein breites Band für die Offsetfläche;
   hier zählt nur das Innere, und ein Rand von fünf, sechs Zellen an
   allen Seiten hätte bei einem flachen Teil mehr Luft als Metall
   gerastert. */
const MAX_SAMPLES = 16e6;
const H_MIN = 0.25, H_MAX = 50;
export function suggestH(m) {
  const wall = m.volume > 0 && m.totalArea > 0 ? 2 * m.volume / m.totalArea : 0;
  const longest = Math.max(m.bounds.size[0], m.bounds.size[1], m.bounds.size[2]) || 1;
  const h = Math.max(H_MIN, Math.min(H_MAX, wall > 0 ? wall / 2 : longest / 64));
  /* Auf eine glatte Zahl: halbe Millimeter ab 1 mm, darunter Zehntel. */
  return h >= 1 ? Math.round(h * 2) / 2 : Math.round(h * 10) / 10;
}
const gridFor = (m, h) => {
  const band = Math.max(2.5 * h, 1.5);
  return { h, band, pad: 2 * h, size: fieldSize(m, 0, band, { h, pad: 2 * h }) };
};

async function computeField() {
  if (!state.model) return;
  const m = state.model;
  let h = state.h;
  let g = gridFor(m, h);
  let lifted = false;
  while (g.size.samples > MAX_SAMPLES) { h = Math.round(h * 110) / 100; g = gridFor(m, h); lifted = true; }
  if (lifted) { state.h = h; $('cell-h').value = fmt(h, 2); }
  $('res-note').textContent = lifted
    ? 'Feiner geht hier nicht: ' + fmt(MAX_SAMPLES / 1e6, 0) + ' Mio. Rasterpunkte sind die Grenze — die Kante steht auf ' + fmt(h, 2) + ' mm.'
    : '';
  busy.textContent = 'Bauteil rastern …';
  busy.classList.add('on');
  await frame();
  try {
    state.field = await buildField(m, {
      h, band: g.band, pad: g.pad,
      onProgress: (p, what) => { busy.textContent = 'Raster · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
    });
    state.fieldH = h;
    let cells = 0;
    for (let i = 0; i < state.field.data.length; i++) if (state.field.data[i] < 0) cells++;
    $('grid-note').textContent = 'Kante ' + fmt(state.field.h, 2) + ' mm · ' + fmt(cells, 0) + ' Zellen im Bauteil · Raster '
      + state.field.dims.join(' × ') + ' = ' + fmt(state.field.data.length / 1e6, 2) + ' Mio. Punkte';
  } catch (err) {
    $('model-warn').textContent = 'Das Raster konnte nicht gerechnet werden: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
  }
  $('regrid').disabled = true;
  state.result = null;
  state.surf = null;
  state.stale = true;
  updateResult();
  if (M.allItems(state.plan).length) compute();
}

/* ── Rechnen ─────────────────────────────────────────────────── */
/* Jede Änderung am Plan rechnet nach — die Rechnung dauert Zehntel-
   sekunden, und eine Ansicht, die nicht zum Plan passt, führt in die
   Irre. Während gerechnet wird, merkt sich compute() den nächsten Lauf. */
function planChanged() {
  state.stale = true;
  updateFacts();
  compute();
}

async function compute() {
  if (!state.field) return;
  if (state.computing) { state.queued = true; return; }
  const items = M.allItems(state.plan);
  if (!items.length) { state.result = null; state.surf = null; state.stale = true; updateResult(); return; }
  state.computing = true;
  $('run').disabled = true;
  const t0 = performance.now();
  try {
    const wall = state.model.totalArea > 0 ? 2 * state.model.volume / state.model.totalArea : null;
    const res = await solveFill(state.field, state.plan, {
      alpha: state.plan.alpha, wallThickness: wall,
      onProgress: p => { busy.textContent = 'Füllung … ' + Math.round(p * 100) + ' %'; busy.classList.add('on'); }
    });
    state.result = res;
    state.surf = fracToSurface(state.field, res.frac);
    state.stale = false;
    state.ms = performance.now() - t0;
  } catch (err) {
    $('model-warn').textContent = 'Die Füllung konnte nicht gerechnet werden: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.computing = false;
    $('run').disabled = false;
  }
  updateResult();
  if (state.queued) { state.queued = false; compute(); }
}

/* Alles, was aus dem Ergebnis folgt: Farben, Körper, Kugeln, Zahlen. */
function updateResult() {
  paintPart();
  updateBody();
  updateSpots();
  updateFacts();
  applyVisibility();
}

const GREY = [0.71, 0.75, 0.77];
function paintPart() {
  const geo = partMesh.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  let col = geo.getAttribute('color');
  if (!col || col.count !== pos.count) {
    col = new T.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', col);
  }
  const arr = col.array;
  if (!state.result) { for (let i = 0; i < pos.count; i++) arr.set(GREY, 3 * i); col.needsUpdate = true; return; }
  const p = pos.array, f = state.field, s = state.surf, q = state.q;
  for (let i = 0; i < pos.count; i++) {
    const v = sampleFrac(f, s, p[3 * i], p[3 * i + 1], p[3 * i + 2]);
    if (Number.isNaN(v) || v > q + 1e-6) { arr.set(GREY, 3 * i); continue; }
    arr.set(turbo(v), 3 * i);
  }
  col.needsUpdate = true;
}

function updateBody() {
  if (!state.result || state.show !== 'koerper') { bodyMesh.visible = false; return; }
  const tris = surfaceNets(fillBodyField(state.field, state.result.frac, state.q), 0);
  setTris(bodyMesh, tris, true);
  bodyMat.color.setRGB(...turbo(Math.min(1, state.q)));
}

function updateSpots() {
  spotGroup.clear();
  state.spots.list = [];
  if (!state.result || !state.spots.on) return;
  const f = state.field;
  const spacing = Math.max(4 * f.h, 12);
  const list = lastSpots(f, state.result.frac, { minFrac: 0.8, spacing, limit: state.spots.count });
  state.spots.list = list;
  for (const m of list) {
    const mesh = new T.Mesh(spotGeo, spotMat);
    mesh.position.set(m.x, m.y, m.z);
    mesh.onBeforeRender = (renderer, scene, camera) => {
      const d = camera.isOrthographicCamera ? (camera.top - camera.bottom) / camera.zoom / 3 : camera.position.distanceTo(mesh.position);
      mesh.scale.setScalar(d * 0.012);
    };
    spotGroup.add(mesh);
  }
}

function applyVisibility() {
  const has = !!state.result;
  partMesh.material = (has && state.show === 'farbe') ? colorMat : plainMat;
  if (state.show === 'koerper' && has) {
    plainMat.opacity = Math.min(plainMat.opacity, 0.25);
    plainMat.transparent = true;
    plainMat.depthWrite = false;
  } else {
    plainMat.opacity = state.opacity;
    plainMat.transparent = state.opacity < 1;
    plainMat.depthWrite = state.opacity >= 1;
  }
  plainMat.needsUpdate = true;
  bodyMesh.visible = has && state.show === 'koerper' && bodyMesh.geometry.getAttribute('position') && bodyMesh.geometry.getAttribute('position').count > 0;
  spotGroup.visible = has && state.spots.on;
  $('q-row').classList.toggle('disabled', !has);
  colorbar(has && state.show !== 'grau' ? {
    title: 'Füllgrad',
    stops: gradient(t => rgbCss(turbo(t))),
    ticks: [100, 75, 50, 25, 0].map(v => v + ' %')
  } : null);
  view.invalidate();
}

function updateFacts() {
  const r = state.result;
  const rows = [];
  const items = M.allItems(state.plan);
  if (!items.length) {
    $('run-note').textContent = state.field ? 'Noch kein Anschnitt — im Auswahlfeld „Anschnitt setzen", dann aufs Bauteil klicken.' : '';
    $('run-note').className = 'run-note';
    facts('result-facts', []);
    facts('inlet-facts', []);
    return;
  }
  if (!r) {
    $('run-note').textContent = 'Der Plan ist noch nicht gerechnet.';
    $('run-note').className = 'run-note stale';
    facts('result-facts', []);
    facts('inlet-facts', []);
    return;
  }
  const dauer = state.ms >= 1000 ? fmt(state.ms / 1000, 1) + ' s' : fmt(state.ms, 0) + ' ms';
  $('run-note').textContent = (state.stale ? 'Rechnet nach …' : 'Gerechnet in ' + dauer + ' · α = ' + fmt(r.stats.alpha, 1))
    + (r.stats.unreached ? ' · ⚠ ' + fmt(r.stats.unreached, 0) + ' Zellen nicht erreicht (abgetrennter Bereich?)' : '');
  $('run-note').className = 'run-note' + (state.stale || r.stats.unreached ? ' stale' : '');
  rows.push(['längster Fließweg', fmt(r.stats.maxPath, 0) + ' mm']);
  rows.push(['Wanddicke 2V/A', fmt(r.stats.wallThickness, 1) + ' mm']);
  rows.push(['Fließweg / Wanddicke', fmt(r.stats.flowRatio, 0) + ' : 1' + (r.stats.flowRatio > 300 ? ' ⚠' : '')]);
  rows.push(['Volumen im Raster', fmt(r.stats.volume / 1000, 1) + ' cm³']);
  if (state.spots.list.length) {
    rows.push(['letzte Stelle', fmt(100 * state.spots.list[0].frac, 0) + ' % · ' + state.spots.list[0].x.toFixed(0) + ' / '
      + state.spots.list[0].y.toFixed(0) + ' / ' + state.spots.list[0].z.toFixed(0)]);
  }
  facts('result-facts', rows);
  const sh = M.shares(state.plan);
  facts('inlet-facts', r.stats.inlets.map(i => [
    '<code>' + i.id + '</code> ' + fmt(100 * (sh[i.id] || 0), 0) + ' % Strom',
    fmt(100 * i.cells / Math.max(1, r.cells), 0) + ' % Volumen' + (i.seeds <= 1 ? ' ⚠' : '')
  ]));
}

/* ── Auswahl ─────────────────────────────────────────────────── */
const sel = () => (handles.selected ? state.plan.items[handles.selected] : null);

function syncSelection() {
  const it = sel();
  $('sel-block').classList.toggle('disabled', !it);
  $('pt-sel').className = 'pt-sel' + (it ? '' : ' empty');
  if (!it) {
    $('pt-sel').textContent = 'Kein Anschnitt gewählt';
    facts('sel-facts', []);
    updateMenu();
    return;
  }
  $('pt-sel').innerHTML = '<span class="dot" style="background:' + M.COLOR + '"></span>Anschnitt <code>' + it.id + '</code>';
  $('sel-w').value = fmt(it.w, 2);
  $('sel-h').value = fmt(it.h, 2);
  $('sel-share').value = it.share === null || it.share === undefined ? '' : fmt(it.share, 0);
  $('sel-share').placeholder = 'auto ' + fmt(100 * (M.shares(state.plan)[it.id] || 0), 0);
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(it.pos[i], 1);
  $('sel-rot').value = String(it.rot || 0);
  $('sel-rot-val').textContent = fmt(it.rot || 0, 0) + '°';
  const rows = [['Fläche', fmt(M.areaOf(it), 1) + ' mm²'], ['Normale', dirText(it.n)]];
  const r = state.result;
  if (r && !state.stale) {
    const inf = r.stats.inlets.find(x => x.id === it.id);
    if (inf) rows.push(['füllt', fmt(100 * inf.cells / Math.max(1, r.cells), 0) + ' % des Volumens']);
  }
  facts('sel-facts', rows);
  updateMenu();
}

function dirText(d) {
  const ax = ['X', 'Y', 'Z'];
  let best = 0;
  for (let i = 1; i < 3; i++) if (Math.abs(d[i]) > Math.abs(d[best])) best = i;
  const name = (d[best] < 0 ? '−' : '+') + ax[best];
  return Math.abs(d[best]) > 0.985 ? name : 'schräg, überwiegend ' + name;
}

function updateMenu() {
  $('del-item').disabled = !sel();
  $('add-inlet').disabled = !partMesh.visible;
  $('run').disabled = !state.field || state.computing || !M.allItems(state.plan).length;
}

const clampParam = (k, v) => Math.max(M.PARAM_META[k].min, Math.min(M.PARAM_META[k].max, v));
numberInput('sel-w', v => { const it = sel(); if (!it) return v; it.w = clampParam('w', v); rebuild(); syncSelection(); planChanged(); return it.w; });
numberInput('sel-h', v => { const it = sel(); if (!it) return v; it.h = clampParam('h', v); rebuild(); syncSelection(); planChanged(); return it.h; });
/* Der Anteil: leer heißt „aus der Fläche"; eine Zahl setzt ihn fest. */
$('sel-share').addEventListener('change', e => {
  const it = sel();
  if (!it) return;
  const t = e.target.value.trim().replace(',', '.');
  it.share = t === '' ? null : clampParam('share', Number(t) || 0);
  syncSelection(); planChanged();
});
for (const [id, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
  numberInput(id, v => {
    const it = sel();
    if (!it) return v;
    const p = it.pos.slice();
    p[axis] = v;
    M.setPos(state.plan, it.id, p);
    rebuild(); planChanged();
    return v;
  });
}
slider('sel-rot', v => {
  const it = sel();
  if (!it) return;
  M.setRot(state.plan, it.id, v);
  rebuild();
  planChanged();
}, v => fmt(v, 0) + '°');

$('del-item').addEventListener('click', removeSelected);
function removeSelected() {
  const it = sel();
  if (!it) return;
  M.removeItem(state.plan, it.id);
  handles.select(null);
  rebuild();
  syncSelection();
  planChanged();
}

/* ── Zielmodus: setzen und neu setzen ────────────────────────── */
function aimArmed(on, text) {
  $('aim-banner').classList.toggle('hidden', !on);
  $('aim-banner').classList.remove('miss');
  if (text) $('aim-text').textContent = text;
}
let missTimer = 0;
function miss() {
  clearTimeout(missTimer);
  const keep = $('aim-text').textContent;
  $('aim-banner').classList.add('miss');
  $('aim-text').textContent = 'Daneben — die Stelle muss auf dem Bauteil liegen.';
  missTimer = setTimeout(() => { if (handles.aiming) { $('aim-banner').classList.remove('miss'); $('aim-text').textContent = keep; } }, 1600);
}
function cancelAim() {
  handles.cancelAim();
  aimArmed(false);
}
/* Der Strahl liefert die nach INNEN gerichtete Normale. */
const outward = d => [-d[0], -d[1], -d[2]];

function noPart() {
  aimArmed(true, 'Zuerst ein Bauteil laden — dann setzt der Klick den Anschnitt dorthin.');
  clearTimeout(missTimer);
  missTimer = setTimeout(() => { if (!handles.aiming) aimArmed(false); }, 3200);
}

function startPlace() {
  if (!partMesh.visible) { noPart(); return; }
  handles.select(null);
  aimArmed(true, 'Anschnitt: die Stelle am Bauteil anklicken, wo die Schmelze eintritt. Ziehen dreht die Ansicht, Esc bricht ab.');
  handles.armAim({
    onHit: hit => {
      aimArmed(false);
      const it = M.addInlet(state.plan, hit.point, outward(hit.dir), { w: state.defaults.w, h: state.defaults.h });
      rebuild();
      handles.select(it.id);
      planChanged();
    },
    onMiss: miss
  });
}

function startMove(id) {
  const it = state.plan.items[id];
  if (!it) return;
  if (!partMesh.visible) { noPart(); return; }
  aimArmed(true, 'Anschnitt ' + id + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.');
  handles.armAim({
    onHit: hit => {
      aimArmed(false);
      M.placeAt(state.plan, id, hit.point, outward(hit.dir));
      rebuild();
      syncSelection();
      planChanged();
    },
    onMiss: miss
  });
}

$('add-inlet').addEventListener('click', startPlace);
$('aim-cancel').addEventListener('click', cancelAim);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { cancelAim(); return; }
  const tag = (e.target && e.target.tagName) || '';
  if ((e.key === 'Delete' || e.key === 'Backspace') && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') {
    removeSelected();
  }
});

/* ── Regler ──────────────────────────────────────────────────── */
slider('ref-opacity', v => { state.opacity = v / 100; applyVisibility(); }, v => v + ' %');
numberInput('cell-h', v => {
  state.h = Math.max(H_MIN, Math.min(H_MAX, v));
  state.hAuto = false;
  const changed = !!state.model && state.fieldH > 0 && Math.abs(state.fieldH - state.h) > 1e-9;
  $('res-note').textContent = changed ? 'Neu rastern übernimmt die Kantenlänge.' : '';
  $('regrid').disabled = !changed;
  return state.h;
});
$('regrid').addEventListener('click', () => computeField());
numberInput('def-w', v => { state.defaults.w = clampParam('w', v); return state.defaults.w; });
numberInput('def-h', v => { state.defaults.h = clampParam('h', v); return state.defaults.h; });
slider('alpha', v => { state.plan.alpha = v; planChanged(); }, v => fmt(v, 1));
$('run').addEventListener('click', compute);
segButtons('show-seg', v => { state.show = v; updateBody(); applyVisibility(); });
slider('q', v => { state.q = v / 100; paintPart(); updateBody(); view.invalidate(); }, v => v + ' %');
$('spots-on').addEventListener('change', e => { state.spots.on = e.target.checked; updateSpots(); updateFacts(); applyVisibility(); });
slider('spots-count', v => { state.spots.count = v; updateSpots(); updateFacts(); view.invalidate(); }, v => String(v));

/* ── Bauteil ─────────────────────────────────────────────────── */
const source = mountPartSource({
  busy, viewport: container,
  onLoad: async (model, name) => {
    state.model = model;
    state.name = name;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
    geo.computeVertexNormals();
    partMesh.geometry.dispose();
    partMesh.geometry = geo;
    partMesh.visible = true;
    state.result = null; state.surf = null; state.stale = true;
    view.fitTo(partMesh);
    rebuild();
    /* Solange der Anwender keine Kante gesetzt hat, kommt sie vom Teil. */
    if (state.hAuto) { state.h = suggestH(model); $('cell-h').value = fmt(state.h, 2); }
    await computeField();
    syncSelection();
  },
  start: 'gearbox_cover'
});

/* ── Dateien ─────────────────────────────────────────────────── */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const safeName = () => ((state.name || 'bauteil') + '-fuellung').replace(/[^\w-]+/g, '-').toLowerCase();

$('stl-save').addEventListener('click', () => {
  if (!state.result) return;
  const tris = surfaceNets(fillBodyField(state.field, state.result.frac, state.q), 0);
  if (!tris.length) return;
  download(new Blob([writeSTL(tris, 'DieLogic Füllkörper ' + Math.round(100 * state.q) + ' %')], { type: 'model/stl' }),
    safeName() + '-' + Math.round(100 * state.q) + '.stl');
});
$('json-save').addEventListener('click', () => {
  download(new Blob([JSON.stringify(M.toJSON(state.plan), null, 1)], { type: 'application/json' }), safeName() + '.json');
});
$('json-btn').addEventListener('click', () => $('json-input').click());
$('json-input').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      loadPlan(M.fromJSON(JSON.parse(fr.result)));
    } catch (err) {
      $('model-warn').textContent = 'Die Datei „' + f.name + '" konnte nicht gelesen werden: ' + err.message;
    }
  };
  fr.readAsText(f);
  e.target.value = '';
});

function loadPlan(plan) {
  state.plan = plan;
  handles.select(null);
  $('alpha').value = String(plan.alpha);
  $('alpha-val').textContent = fmt(plan.alpha, 1);
  rebuild();
  syncSelection();
  planChanged();
}

/* ── Legende ─────────────────────────────────────────────────── */
$('pt-legend').innerHTML = '<div class="pt-menu-title">Zeichen</div>'
  + '<div class="lg-row"><span class="dot" style="background:' + M.COLOR + '"></span>Anschnitt</div>'
  + '<div class="lg-row"><span class="dot" style="background:#b42318"></span>zuletzt gefüllt</div>'
  + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>';

rebuild();
syncSelection();
updateResult();
source.start().then(() => { state.ready = true; });

export const __viewer = { state, view, handles, rebuild, compute, computeField, startPlace, startMove, loadPlan, partMesh, bodyMesh, spotGroup, group, source };
window.__fuellung = __viewer;
