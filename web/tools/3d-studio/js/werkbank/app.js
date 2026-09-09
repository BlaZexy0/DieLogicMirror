/* Werkbank (werkbank.html) — Einstieg und Verdrahtung.

   Ein Bauteil, ein Viewport, sechs Schritte in einer Leiste links:

     1 Bauteil       Laden, Entformung, Wandstärke        js/werkbank/part.js
     2 Anguss        Pressrest, Kanäle, Anschnitte         js/werkbank/runner.js
     3 Füllung       die Front von den Anschnitten aus     js/werkbank/fill.js
     4 Überläufe     Überläufe und Entlüftungen            js/werkbank/vents.js
     5 Temperierung  Kühlstiche und Kanäle                 js/werkbank/cooling.js
     6 Auslegung     das Dashboard mit den Zahlen daraus   js/werkbank/design.js

   Jeder Schritt ist die Portierung einer Werkzeugseite des Studios; die
   Rechenmodule (Graph, Strömung, Pläne, Feld, Griffe) sind dieselben.
   Was hier steht, ist das Gemeinsame: die Szene, das Bauteil als EIN
   Netz für alle Schritte, das Abstandsfeld, das einmal gerechnet und
   dreimal gebraucht wird, die Ereignisse zwischen den Schritten und die
   Datei, die alle Pläne zusammen aufhebt.

   Rahmen: das Bauteilsystem der Analyseseiten — Trennebene z = 0, die
   Form öffnet nach +z. Der Anguss liegt als Nut in der beweglichen
   Hälfte (z > 0), Achse −z. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { $, fmt } from '../ui/controls.js';
import { mountPartSource, frame } from '../part/partsource.js';
import { buildField, fieldSize, fieldExtrema } from '../part/field.js';
import { parseSTL } from '../part/stlio.js';
import { readGLB, isGLB } from '../part/glbio.js';
import { FORMAT as FORMAT_ANGUSS } from '../runner/graph.js';
import { FORMAT as FORMAT_LUFT } from '../vents/model.js';
import { FORMAT as FORMAT_TEMPERIER } from '../cooling/model.js';
import { FORMAT as FORMAT_FUELLUNG } from '../fill/model.js';
import { createAimUI, readBuffer, looksLikeJSON, download, safeName } from './common.js';
import { createPartStage } from './part.js';
import { createRunnerStage } from './runner.js';
import { createFillStage } from './fill.js';
import { createVentStage } from './vents.js';
import { createCoolingStage } from './cooling.js';
import { createDesignStage } from './design.js';

export const FORMAT = 'dielogic-werkbank';
export const FORMAT_VERSION = 1;

const container = $('viewport');
const busy = $('busy');
const view = initScene(container, {
  cameraStart: [520, -640, 470], target: [0, 0, 0],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

/* ── Das Bauteil: ein Netz, zwei Materialien ─────────────────── */
/* Grau für alle, die auf die Wand klicken; mit Punktfarben für die
   Analyse und die Füllung — dieselbe Geometrie, das Farb-Attribut ist
   der Malgrund, den der aktive Schritt beschreibt. */
const plainMat = new T.MeshStandardMaterial({ color: 0xb5c0c4, roughness: 0.7, metalness: 0.05, side: T.DoubleSide, flatShading: true });
const colorMat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.62, metalness: 0.08, side: T.DoubleSide, flatShading: true });
const partMesh = new T.Mesh(new T.BufferGeometry(), plainMat);
partMesh.visible = false;
view.scene.add(partMesh);

const part = {
  model: null, name: '', demoId: null, mesh: partMesh, opacity: 1,
  setOpacity(v) { part.opacity = v; part.applyOpacity(v); },
  applyOpacity(v) {
    for (const m of [plainMat, colorMat]) {
      m.opacity = v;
      m.transparent = v < 0.999;
      m.depthWrite = v >= 0.999;
      m.needsUpdate = true;
    }
    view.invalidate();
  },
  usePlain() { if (partMesh.material !== plainMat) { partMesh.material = plainMat; view.invalidate(); } },
  useColors() { if (partMesh.material !== colorMat) { partMesh.material = colorMat; view.invalidate(); } }
};

/* ── Das Abstandsfeld: einmal für Wandstärke, Füllung, Temperierung ── */
/* Die Zellkante folgt der Wanddicke (halbe Wanddicke, wie die Füllung
   sie vorschlägt), das Band nach außen dem, was der weiteste Abnehmer
   braucht — die Abstandsfläche der Temperierung. Nach innen ist das
   Feld immer vollständig. */
const MAX_SAMPLES = 16e6;
const H_MIN = 0.25, H_MAX = 50;
function suggestH(m) {
  const wall = m.volume > 0 && m.totalArea > 0 ? 2 * m.volume / m.totalArea : 0;
  const longest = Math.max(m.bounds.size[0], m.bounds.size[1], m.bounds.size[2]) || 1;
  const h = Math.max(H_MIN, Math.min(H_MAX, wall > 0 ? wall / 2 : longest / 64));
  return h >= 1 ? Math.round(h * 2) / 2 : Math.round(h * 10) / 10;
}
const field = {
  data: null, stats: null, h: 3, hAuto: true, bandWanted: 12, stale: false, promise: null, ms: 0,
  setCell(v) {
    field.h = Math.max(H_MIN, Math.min(H_MAX, v));
    field.hAuto = false;
    if (field.data && Math.abs(field.data.h - field.h) > 1e-9) { field.stale = true; ctx.emit('field'); }
    return field.h;
  },
  /** Das Feld holen — vorhanden, oder jetzt rechnen. `band` verlangt eine
      Mindestbreite nach außen, `force` rechnet neu. */
  async ensure(opts = {}) {
    const m = part.model;
    if (!m) return null;
    const band = Math.max(field.bandWanted, opts.band || 0);
    field.bandWanted = band;
    const fits = f => f && f.band >= band - 1e-6;
    if (!opts.force && !field.stale && fits(field.data)) return field.data;
    if (field.promise) {
      const f = await field.promise;
      if (!opts.force && !field.stale && fits(f) && part.model === m) return f;
      if (part.model !== m) return null;
    }
    field.promise = compute(m, band);
    const out = await field.promise;
    field.promise = null;
    return out;
  }
};
async function compute(m, band) {
  let h = field.h;
  let size = fieldSize(m, 0, band, { h });
  let lifted = false;
  while (size.samples > MAX_SAMPLES) { h = Math.round(h * 110) / 100; size = fieldSize(m, 0, band, { h }); lifted = true; }
  if (lifted) field.h = h;
  busy.textContent = 'Abstandsfeld rastern …';
  busy.classList.add('on');
  markBusyAll(true);
  await frame();
  const t0 = performance.now();
  let f = null;
  try {
    f = await buildField(m, {
      h, band,
      onProgress: (p, what) => { busy.textContent = 'Abstandsfeld · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
    });
    if (part.model !== m) return null;
    field.data = f;
    field.stats = fieldExtrema(f);
    field.stale = false;
    field.ms = performance.now() - t0;
    $('model-warn').textContent = lifted
      ? 'Feiner geht hier nicht: ' + fmt(MAX_SAMPLES / 1e6, 0) + ' Mio. Rasterpunkte sind die Grenze — die Zellkante steht auf ' + fmt(h, 2) + ' mm.'
      : '';
  } catch (err) {
    $('model-warn').textContent = 'Das Abstandsfeld konnte nicht gerechnet werden: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    markBusyAll(false);
  }
  ctx.emit('field', f);
  return f;
}
function markBusyAll(on) {
  for (const id of ['bauteil', 'fuellung', 'temperier']) ctx.setBusyStage(id, on);
}

/* ── Der Zusammenhang der Schritte ───────────────────────────── */
const listeners = {};
const ctx = {
  view, container, busy, part, field, stages: {}, active: null, ready: false,
  aim: createAimUI(),
  on(ev, fn) { (listeners[ev] ||= []).push(fn); },
  emit(ev, ...args) { for (const fn of listeners[ev] || []) { try { fn(...args); } catch (err) { console.error(ev, err); } } },
  status(text) { $('status').textContent = text; },
  statusHTML(html) { $('status').innerHTML = html; },
  subtitle(text) { $('wb-subtitle').textContent = text; },
  markDone(id, on) { const b = railButton(id); if (b) b.classList.toggle('done', !!on); },
  setBusyStage(id, on) { const b = railButton(id); if (b) b.classList.toggle('busy', !!on); },
  readAny: null
};
const railButton = id => document.querySelector('[data-stage="' + id + '"]');

const stages = [
  createPartStage(ctx),
  createRunnerStage(ctx),
  createFillStage(ctx),
  createVentStage(ctx),
  createCoolingStage(ctx),
  createDesignStage(ctx)
];
for (const s of stages) ctx.stages[s.id] = s;
/* Das Band des Felds nach außen richtet sich nach dem weitesten Abnehmer,
   der Abstandsfläche der Temperierung — sonst rechnete der Schritt das
   Feld ein zweites Mal, breiter. */
field.bandWanted = Math.max(field.bandWanted, ctx.stages.temperier.state.plan.dist * 1.3 + 5);

function activate(id) {
  const next = ctx.stages[id];
  if (!next || ctx.active === id) return;
  const prev = ctx.active && ctx.stages[ctx.active];
  if (prev) prev.leave();
  ctx.aim.hide();
  ctx.active = id;
  for (const s of stages) $('stage-' + s.id).classList.toggle('hidden', s.id !== id);
  for (const b of document.querySelectorAll('[data-stage]')) b.classList.toggle('active', b.dataset.stage === id);
  next.enter();
  view.invalidate();
}
$('wb-rail').addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (b && b.dataset.stage) activate(b.dataset.stage);
});

/* ── Das Bauteil laden ───────────────────────────────────────── */
const source = mountPartSource({
  busy, viewport: null,
  onStart: name => { ctx.ready = false; part.name = name; },
  onLoad: async (model, name) => {
    part.model = model;
    part.name = name;
    const sel = $('demo-select');
    part.demoId = sel.selectedIndex >= 0 && sel.value ? sel.value : null;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(model.tris.length).fill(0.75), 3));
    geo.computeVertexNormals();
    partMesh.geometry.dispose();
    partMesh.geometry = geo;
    partMesh.visible = true;
    partMesh.material = plainMat;
    field.data = null; field.stats = null; field.stale = false; field.promise = null;
    if (field.hAuto) field.h = suggestH(model);
    view.fitTo(partMesh, 1.35);
    ctx.emit('part', model);
    ctx.ready = true;
  },
  start: 'gearbox_cover'
});

/* ── Dateien: was für eine es ist, sagt der Inhalt ───────────── */
async function readAny(file) {
  try {
    const buf = await readBuffer(file);
    if (looksLikeJSON(buf)) { loadJSON(JSON.parse(new TextDecoder().decode(buf)), file.name); return; }
    const glb = isGLB(buf);
    const tris = glb ? readGLB(buf) : parseSTL(buf);
    $('demo-select').selectedIndex = -1;
    await source.load(tris, file.name, (glb ? 'GLB-Datei · ' : 'STL-Datei · ') + (buf.byteLength / 1024).toFixed(0) + ' kB');
  } catch (err) {
    $('model-warn').textContent = 'Die Datei „' + file.name + '" konnte nicht gelesen werden: ' + err.message;
    console.error(err);
  }
}
ctx.readAny = readAny;

function loadJSON(obj, name) {
  const f = obj && obj.format;
  if (f === FORMAT) return loadWerkbank(obj);
  if (f === FORMAT_ANGUSS) { ctx.stages.anguss.loadJSON(obj, name); activate('anguss'); return; }
  if (f === FORMAT_LUFT) { ctx.stages.ueberlauf.fromJSON(obj); activate('ueberlauf'); return; }
  if (f === FORMAT_TEMPERIER) { ctx.stages.temperier.fromJSON(obj); activate('temperier'); return; }
  if (f === FORMAT_FUELLUNG) throw new Error('Füllpläne braucht die Werkbank nicht — ihre Anschnitte kommen aus dem Anguss.');
  throw new Error('unbekannte Kennung „' + f + '"');
}

for (const ev of ['dragenter', 'dragover']) {
  container.addEventListener(ev, e => { e.preventDefault(); container.classList.add('dragover'); });
}
for (const ev of ['dragleave', 'drop']) {
  container.addEventListener(ev, e => { e.preventDefault(); container.classList.remove('dragover'); });
}
container.addEventListener('drop', e => {
  const f = e.dataTransfer && e.dataTransfer.files[0];
  if (f) readAny(f);
});
$('wb-open').addEventListener('click', () => $('wb-file').click());
$('wb-file').addEventListener('change', e => {
  const f = e.target.files[0];
  if (f) readAny(f);
  e.target.value = '';
});

/* ── Die Werkbank-Datei: alle Pläne, das Bauteil als Verweis ─── */
function toJSON() {
  return {
    format: FORMAT, version: FORMAT_VERSION,
    part: { demo: part.demoId, name: part.name },
    anguss: ctx.stages.anguss.toJSON(),
    prozess: ctx.stages.anguss.procJSON(),
    fuellung: ctx.stages.fuellung.toJSON(),
    luft: ctx.stages.ueberlauf.toJSON(),
    temperier: ctx.stages.temperier.toJSON()
  };
}
async function loadWerkbank(obj) {
  if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Werkbank-Datei (Kennung „' + FORMAT + '" fehlt).');
  if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
  const demo = obj.part && obj.part.demo;
  if (demo && demo !== part.demoId) {
    $('demo-select').value = demo;
    await source.pickDemo(demo);
  } else if (!demo && obj.part && obj.part.name && obj.part.name !== part.name) {
    $('model-warn').textContent = 'Die Datei gehört zum Bauteil „' + obj.part.name + '" — das Netz selbst steht nicht darin. Die Pläne liegen jetzt am geladenen Bauteil.';
  }
  const an = ctx.stages.anguss;
  if (obj.prozess) an.setProc(obj.prozess);
  if (obj.anguss) an.loadJSON(obj.anguss, obj.part && obj.part.name);
  ctx.stages.fuellung.fromJSON(obj.fuellung);
  if (obj.luft) ctx.stages.ueberlauf.fromJSON(obj.luft);
  if (obj.temperier) ctx.stages.temperier.fromJSON(obj.temperier);
}
$('wb-save').addEventListener('click', () => {
  download(new Blob([JSON.stringify(toJSON(), null, 1)], { type: 'application/json' }), safeName(part.name) + '-werkbank.json');
});

/* ── Los ─────────────────────────────────────────────────────── */
activate(new URLSearchParams(location.search).get('schritt') || 'bauteil');
source.start();

export const __viewer = { ctx, state: ctx, stages: ctx.stages, view, activate, toJSON, loadWerkbank, loadJSON, readAny, source, partMesh, field };
window.__werkbank = __viewer;
