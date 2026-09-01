/* Angussdesigner (anguss.html) — Einstieg und Verdrahtung.

   Der Ablauf ist immer derselbe und immer in dieser Reihenfolge:

     Graph  →  Anschnittbreiten  →  Abtasten  →  Strömung  →  Anzeige

   Alles hängt am Graphen (js/runner/graph.js); nichts wird doppelt
   gehalten. Ein Zug am Griff ändert eine Koordinate, danach läuft die
   ganze Kette neu — Abtasten und Sweep kosten bei einem üblichen System
   wenige Millisekunden, also darf es bei jedem Mausschritt passieren.

   Genau EINE Sache kostet spürbar Zeit und läuft deshalb NUR auf
   Knopfdruck: das Verschmelzen zum dichten Körper (js/runner/sdf.js bzw.
   js/runner/gpu.js). Dieselbe Trennung wie auf der Offsetseite — was
   sofort geht, geht sofort; was rechnet, wartet auf Bestätigung und sagt
   vorher, was es kosten wird. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import {
  $, fmt, facts, segButtons, slider, numberInput, runControl, colorbar, gradient
} from '../ui/controls.js';
import { ramp } from '../part/colors.js';
import { surfaceNets } from '../part/surfacenets.js';
import { writeSTL, parseSTL } from '../part/stlio.js';
import { readGLB, isGLB } from '../part/glbio.js';
import { volume, surface } from '../mesh.js';
import * as G from './graph.js';
import { sampleNetwork } from './curve.js';
import { sweepRunner, biscuitMesh, centerlines } from './sweep.js';
import * as SDF from './sdf.js';
import { initGPU, buildFieldGPU } from './gpu.js';
import * as F from './flow.js';
import { checkRules } from './rules.js';
import { autoTaper, DEFAULT_SIZING } from './sizing.js';
import { DEMOS, demoTwoGates } from './presets.js';
import { flowChart, SPEED_STOPS } from './chart.js';
import { createEditor, SELECTED_RING, FOLLOWER_COLOR } from './editor.js';
import { rotate, norm, cross, dot, sub, add } from './vec.js';

mountNav('anguss.html');

const container = $('viewport');
const busy = $('busy');
const IDLE = 'Punkt anklicken und ziehen · Alt: aus der Ebene heben · '
  + 'Ziehen im Leeren: frei drehen · Rechte Maustaste: verschieben · Rad: zoomen';

/* Ohne Bodenraster: der Anguss ist ein freistehender Körper, den man von
   allen Seiten ansieht — ein Raster darunter gäbe ihm ein „unten", das er
   nicht hat, und läge bei jeder schrägen Ansicht im Bild. */
const view = initScene(container, {
  orbit: 'trackball',
  cameraStart: [230, 210, 280], target: [0, 0, 60],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = {
  graph: demoTwoGates(),
  net: null, flow: null, rules: [],
  proc: { ...F.DEFAULT_PROCESS },
  sizing: { ...DEFAULT_SIZING },
  show: 'sweep', color: 'plain',
  cell: 0.8, blend: 3,
  merged: null, mergeStale: true, merging: false, mergeInfo: null,
  gpu: null, gpuTried: false, gpuNote: 'noch nicht angefordert',
  name: 'Zwei Anschnitte', ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

const runnerMat = new T.MeshStandardMaterial({
  color: 0x008c82, roughness: 0.45, metalness: 0.15, side: T.DoubleSide
});
const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
group.add(runnerMesh);

const mergedMat = new T.MeshStandardMaterial({
  color: 0x00534d, roughness: 0.4, metalness: 0.2, side: T.DoubleSide, flatShading: true
});
const mergedMesh = new T.Mesh(new T.BufferGeometry(), mergedMat);
mergedMesh.visible = false;
group.add(mergedMesh);

const biscMat = new T.MeshStandardMaterial({
  color: 0x8fa3ad, roughness: 0.55, metalness: 0.25, transparent: true, opacity: 0.55,
  side: T.DoubleSide, depthWrite: false
});
const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
group.add(biscMesh);

const lineMat = new T.LineBasicMaterial({ color: 0x002733, transparent: true, opacity: 0.55 });
const lineGroup = new T.Group();
group.add(lineGroup);

const refMat = new T.MeshStandardMaterial({
  color: 0xb5c0c4, roughness: 0.7, metalness: 0.05,
  transparent: true, opacity: 0.3, depthWrite: false, side: T.DoubleSide
});
const refMesh = new T.Mesh(new T.BufferGeometry(), refMat);
refMesh.visible = false;
group.add(refMesh);

const editor = createEditor({
  view,
  getGraph: () => state.graph,
  onSelect: () => syncSelection(),
  onChange: (what) => {
    rebuild();
    if (what === 'drop') syncSelection();
  }
});

/* Der „Verschmelzen"-Knopf wird schon beim ersten rebuild() gesetzt —
   deshalb steht sein Zustandsschalter hier oben und nicht erst bei den
   übrigen Bedienelementen. */
const setRun = runControl('run-merge', 'merge-state');

/* ── Kette: Graph → Anzeige ──────────────────────────────────── */
function rebuild() {
  const g = state.graph;
  F.applyAutoGates(g, state.proc);
  state.net = sampleNetwork(g);
  state.flow = F.analyseFlow(g, state.net, state.proc);
  state.rules = checkRules(g, state.net, state.flow, state.proc);
  updateRunner();
  updateLines();
  updateBiscuit();
  editor.refresh();
  updateFacts();
  updateRules();
  updateChart();
  updateColorbar();
  updateMergeFacts();
  setStale(true);
  updatePointMenu();
}

/* Farbe je Schnitt — dieselbe Skala wie im Flussschema. */
function colorFn() {
  if (state.color === 'plain') return null;
  if (state.color === 'speed') {
    const vMax = Math.max(...state.flow.gates.map(r => r.v), 1);
    return (e, i) => {
      const l = state.flow.losses.get(e.toId);
      const q = l ? l.Q : 0;
      return ramp(SPEED_STOPS, (q / (e.sections[i].area * 1e-6)) / vMax);
    };
  }
  const aMax = Math.max(...state.net.edges.map(e => e.sections[0].area), 1);
  return (e, i) => ramp(SPEED_STOPS, 1 - e.sections[i].area / aMax);
}

function updateRunner() {
  const { tris, colors } = sweepRunner(state.net, colorFn());
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(tris), 3));
  if (colors) geo.setAttribute('color', new T.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  runnerMesh.geometry.dispose();
  runnerMesh.geometry = geo;
  runnerMat.vertexColors = !!colors;
  runnerMat.needsUpdate = true;
  applyVisibility();
}

function updateLines() {
  for (const child of lineGroup.children.slice()) {
    child.geometry.dispose();
    lineGroup.remove(child);
  }
  for (const pts of centerlines(state.net)) {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(pts, 3));
    lineGroup.add(new T.Line(geo, lineMat));
  }
}

function updateBiscuit() {
  const tris = biscuitMesh(state.graph.biscuit);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(tris), 3));
  geo.computeVertexNormals();
  biscMesh.geometry.dispose();
  biscMesh.geometry = geo;
}

function applyVisibility() {
  runnerMesh.visible = state.show === 'sweep';
  mergedMesh.visible = state.show === 'merged' && !!state.merged;
  biscMesh.visible = $('show-biscuit').checked && state.show !== 'merged';
  const handles = $('show-line').checked;
  lineGroup.visible = handles;
  editor.group.visible = handles;
  editor.setEnabled(handles);
}

/* ── Kennzahlen, Regeln, Schema ──────────────────────────────── */
function updateFacts() {
  const g = state.graph, net = state.net, fl = state.flow;
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  facts('graph-facts', [
    ['Punkte', fmt(G.allNodes(g).length, 0)],
    ['Anschnitte', fmt(gates.length, 0)],
    ['Lauflänge', fmt(net.length, 0) + ' mm'],
    ['Angussvolumen', fmt(fl.runnerVolume / 1000) + ' cm³']
  ]);
  facts('flow-facts', [
    ['Volumenstrom', fmt(fl.Q * 1e6, 0) + ' cm³/s'],
    ['Anschnittfläche', fmt(fl.gateArea, 0) + ' mm²'],
    ['v am Anschnitt', fmt(fl.vGateMean) + ' m/s'],
    ['Druckbedarf', fmt(fl.dp / 1e5) + ' bar'],
    ['Füllbalance', fmt(fl.imbalance * 100) + ' %-Punkte']
  ]);
}

function updateRules() {
  $('rules-list').innerHTML = state.rules.map(r =>
    '<div class="rule ' + r.level + '"><b>' + r.title + '</b><span>' + r.text + '</span></div>').join('');
}

function updateChart() {
  if (!$('chart-on').checked) return;
  $('chart-body').innerHTML = flowChart(state.graph, state.net, state.flow, { width: 620 });
}

function updateColorbar() {
  if (state.color === 'plain' || state.show === 'merged') return colorbar(null);
  const css = t => 'rgb(' + ramp(SPEED_STOPS, t).map(v => Math.round(v * 255)).join(',') + ')';
  if (state.color === 'speed') {
    const vMax = Math.max(...state.flow.gates.map(r => r.v), 1);
    return colorbar({
      title: 'Geschwindigkeit',
      stops: gradient(css),
      ticks: [1, 0.75, 0.5, 0.25, 0].map(t => fmt(vMax * t, 0) + ' m/s')
    });
  }
  const aMax = Math.max(...state.net.edges.map(e => e.sections[0].area), 1);
  colorbar({
    title: 'Querschnitt',
    stops: gradient(css),
    ticks: [0, 0.25, 0.5, 0.75, 1].map(t => fmt(aMax * t, 0) + ' mm²')
  });
}

/* ── Auswahl ─────────────────────────────────────────────────── */

/* Dieselbe Beschriftung steht im Viewport (Menü) und in der Seitenleiste
   (Kopf des Eigenschaftsblocks) — einmal gebaut, damit sie nicht
   auseinanderläuft. */
function selectionLabel(g, id) {
  const n = id && g.nodes[id];
  if (!n) return null;
  const meta = G.TYPES[n.type];
  return '<span class="dot" style="background:' + meta.color + '"></span>'
    + meta.label + ' <code>' + id + '</code>'
    + (G.isFollower(g, id) ? ' <em>(gespiegelt — die andere Seite bearbeiten)</em>' : '');
}

/** Die Legende der Punktfarben — aus derselben Tabelle wie die Griffe. */
function mountLegend() {
  const rows = Object.values(G.TYPES).map(t =>
    '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>');
  rows.push('<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING
    + '"></span>gewählt</div>');
  rows.push('<div class="lg-row"><span class="dot" style="background:' + FOLLOWER_COLOR
    + '"></span>gespiegelt (folgt)</div>');
  $('pt-legend').innerHTML = '<div class="pt-menu-title">Punktarten</div>' + rows.join('');
}

function syncSelection() {
  const g = state.graph;
  const id = editor.selected;
  const n = id && g.nodes[id];
  $('sel-block').classList.toggle('disabled', !n);
  const label = selectionLabel(g, id);
  $('pt-sel').className = 'pt-sel' + (label ? '' : ' empty');
  if (!n) {
    $('sel-title').textContent = 'Kein Punkt gewählt';
    $('pt-sel').textContent = 'Kein Punkt gewählt';
    facts('sel-facts', []);
    updatePointMenu();
    return;
  }
  const follower = G.isFollower(g, id);
  $('sel-title').innerHTML = label;
  $('pt-sel').innerHTML = label;
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(n.pos[i], 2);
  $('sel-w').value = fmt(n.w, 2);
  $('sel-h').value = fmt(n.h, 2);
  $('sel-roll').value = String(n.tilt[0]);
  $('sel-roll-val').textContent = fmt(n.tilt[0], 0) + '°';
  $('sel-pitch').value = String(n.tilt[1]);
  $('sel-pitch-val').textContent = fmt(n.tilt[1], 0) + '°';

  const isBranch = n.type === 'branch' || n.type === 'mirror';
  $('branch-block').classList.toggle('hidden', !isBranch);
  if (isBranch) {
    $('sel-ratio').value = String(Math.round((n.ratio || 0.5) * 100));
    $('sel-ratio-val').textContent = fmt(n.ratio * 100, 0) + ':' + fmt((1 - n.ratio) * 100, 0);
    $('sel-mirror').checked = !!n.mirror;
    $('sel-mirror').disabled = n.type === 'mirror';
  }
  const isGate = n.type === 'gate';
  $('gate-block').classList.toggle('hidden', !isGate);
  if (isGate) {
    $('sel-gh').value = fmt(n.gate.h, 2);
    $('sel-glen').value = fmt(n.gate.len, 2);
    $('sel-gw').value = fmt(n.gate.w, 2);
    $('sel-gauto').checked = !!n.gate.auto;
    $('sel-gw').disabled = !!n.gate.auto;
    $('sel-gtrans').value = n.gate.transition;
  }

  const na = state.net.nodeArea[id];
  const rows = [['Querschnitt', fmt(na.area, 0) + ' mm²'], ['hydr. Ø', fmt(na.dh) + ' mm']];
  const inEdge = state.net.edges.find(e => e.toId === id);
  if (inEdge) {
    const l = state.flow.losses.get(id);
    rows.push(['Kantenlänge', fmt(inEdge.length, 0) + ' mm']);
    if (l) {
      rows.push(['v ein → aus', fmt(l.vIn) + ' → ' + fmt(l.vOut) + ' m/s']);
      rows.push(['Verlust', fmt(l.loss / 1e5, 2) + ' bar']);
    }
  }
  if (isGate) {
    const r = state.flow.gates.find(x => x.id === id);
    if (r) {
      rows.push(['Anschnittfläche', fmt(r.area, 0) + ' mm²']);
      rows.push(['Anteil soll/ist', fmt(r.soll * 100, 0) + ' / ' + fmt(r.ist * 100, 0) + ' %']);
    }
  }
  facts('sel-facts', rows);
  updatePointMenu();
}

function updatePointMenu() {
  const g = state.graph;
  const id = editor.selected;
  const n = id && g.nodes[id];
  const follower = n && G.isFollower(g, id);
  const canAdd = !!n && n.type !== 'gate' && !follower;
  for (const b of ['add-point', 'add-branch', 'add-mirror', 'add-gate']) $(b).disabled = !canAdd;
  $('insert-point').disabled = !n || !n.parent || follower;
  $('del-node').disabled = !n || !n.parent || follower;
}

/* ── Bedienung: Auswahlfelder ────────────────────────────────── */
const sel = () => (editor.selected ? state.graph.nodes[editor.selected] : null);

function editNode(fn) {
  const n = sel();
  if (!n || G.isFollower(state.graph, n.id)) return false;
  fn(n);
  G.syncFrom(state.graph, n.id);
  rebuild();
  return true;
}

for (const [id, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
  numberInput(id, v => {
    const n = sel();
    if (!n) return v;
    const p = n.pos.slice();
    p[axis] = v;
    G.setPos(state.graph, n.id, p);
    rebuild();
    return v;
  });
}
numberInput('sel-w', v => {
  const n = sel();
  if (!n) return v;
  const w = Math.max(1, Math.min(state.graph.biscuit.d, v));
  editNode(x => { x.w = w; });
  return w;
});
numberInput('sel-h', v => {
  const n = sel();
  if (!n) return v;
  const h = Math.max(0.4, Math.min(200, v));
  editNode(x => { x.h = h; });
  return h;
});
slider('sel-roll', v => { editNode(n => { n.tilt = [v, n.tilt[1]]; }); }, v => fmt(v, 0) + '°');
slider('sel-pitch', v => { editNode(n => { n.tilt = [n.tilt[0], v]; }); }, v => fmt(v, 0) + '°');
slider('sel-ratio', v => {
  editNode(n => { n.ratio = v / 100; });
}, v => fmt(v, 0) + ':' + fmt(100 - v, 0));
$('sel-mirror').addEventListener('change', e => {
  editNode(n => { n.mirror = e.target.checked; });
});

$('sel-gtrans').innerHTML = Object.entries(G.TRANSITIONS)
  .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
$('sel-gtrans').addEventListener('change', e => editNode(n => { n.gate.transition = e.target.value; }));
numberInput('sel-gh', v => {
  const h = Math.max(0.3, Math.min(30, v));
  editNode(n => { n.gate.h = h; });
  return h;
});
numberInput('sel-glen', v => {
  const l = Math.max(0, Math.min(60, v));
  editNode(n => { n.gate.len = l; });
  return l;
});
numberInput('sel-gw', v => {
  const w = Math.max(1, Math.min(600, v));
  editNode(n => { n.gate.w = w; });
  return w;
});
$('sel-gauto').addEventListener('change', e => {
  $('sel-gw').disabled = e.target.checked;
  editNode(n => { n.gate.auto = e.target.checked; });
  syncSelection();
});

/* ── Punkte anfügen und entfernen ────────────────────────────── */
const addOf = type => () => {
  const n = sel();
  if (!n) return;
  const made = G.addChild(state.graph, n.id, type);
  rebuild();
  if (made) editor.select(made.id);
};
$('add-point').addEventListener('click', addOf('point'));
$('add-branch').addEventListener('click', addOf('branch'));
$('add-mirror').addEventListener('click', addOf('mirror'));
$('add-gate').addEventListener('click', addOf('gate'));
$('insert-point').addEventListener('click', () => {
  const n = sel();
  if (!n) return;
  const made = G.insertBefore(state.graph, n.id, 'point');
  rebuild();
  if (made) editor.select(made.id);
});
$('del-node').addEventListener('click', () => {
  const n = sel();
  if (!n || !n.parent) return;
  const parent = n.parent;
  G.removeNode(state.graph, n.id);
  rebuild();
  editor.select(state.graph.nodes[parent] ? parent : state.graph.rootId);
});

/* ── Pressrest ───────────────────────────────────────────────── */
numberInput('bisc-d', v => {
  const d = Math.max(10, Math.min(400, v));
  state.graph.biscuit.d = d;
  rebuild();
  return d;
});
numberInput('bisc-t', v => {
  const t = Math.max(1, Math.min(300, v));
  state.graph.biscuit.t = t;
  rebuild();
  return t;
});
for (const [id, axis] of [['bisc-x', 0], ['bisc-y', 1], ['bisc-z', 2]]) {
  numberInput(id, v => {
    const g = state.graph;
    const shift = [0, 0, 0];
    shift[axis] = v - g.biscuit.pos[axis];
    /* Der Pressrest zieht das ganze System mit — sonst reißt der Anguss
       von seinem Ursprung ab, sobald man ihn versetzt. */
    for (const n of G.allNodes(g)) n.pos = add(n.pos, shift);
    g.biscuit.pos[axis] = v;
    rebuild();
    return v;
  });
}
segButtons('axis-seg', value => {
  const g = state.graph;
  const from = G.AXES[g.biscuit.axis], to = G.AXES[value];
  /* Mitdrehen statt nur umdeuten: die Trennebene kippt, und der Anguss
     liegt weiter in ihr. */
  let axis = cross(from, to);
  let ang = Math.acos(Math.max(-1, Math.min(1, dot(from, to))));
  if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-9) {
    axis = norm(cross(from, Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]));
  }
  if (ang > 1e-9) {
    const o = g.biscuit.pos;
    for (const n of G.allNodes(g)) n.pos = add(o, rotate(sub(n.pos, o), axis, ang));
  }
  g.biscuit.axis = value;
  G.setBiscuit(g, {});
  rebuild();
  syncSelection();
  view.fitTo(group);
});

/* ── Kanalform ───────────────────────────────────────────────── */
slider('draft', v => { state.graph.draft = v; rebuild(); }, v => fmt(v) + '°');
numberInput('radius', v => {
  const r = Math.max(0, Math.min(20, v));
  state.graph.radius = r;
  rebuild();
  return r;
});
slider('tension', v => { state.graph.tension = v / 100; rebuild(); }, v => fmt(v / 100, 2));
numberInput('step', v => {
  const s = Math.max(0.2, Math.min(10, v));
  state.graph.step = s;
  rebuild();
  return s;
});
slider('taper', v => { state.sizing.taper = v / 100; }, v => fmt(v, 0) + ' %');
slider('aspect', v => { state.sizing.aspect = v / 100; }, v => fmt(v / 100, 2));
$('auto-taper').addEventListener('click', () => {
  autoTaper(state.graph, state.proc, state.sizing);
  rebuild();
  syncSelection();
});

/* ── Prozess ─────────────────────────────────────────────────── */
$('alloy').innerHTML = Object.entries(F.ALLOYS)
  .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
$('alloy').value = state.proc.alloy;
$('alloy').addEventListener('change', e => { state.proc.alloy = e.target.value; rebuild(); });
numberInput('vol', v => {
  state.proc.volume = Math.max(1, Math.min(1e5, v));
  rebuild();
  return state.proc.volume;
});
numberInput('tfill', v => {
  state.proc.fillTime = Math.max(1, Math.min(5000, v));
  rebuild();
  return state.proc.fillTime;
});
numberInput('vgate', v => {
  state.proc.vGate = Math.max(1, Math.min(200, v));
  rebuild();
  return state.proc.vGate;
});
slider('cbranch', v => { state.proc.cBranch = v / 100; rebuild(); }, v => fmt(v / 100, 2));

/* ── Darstellung ─────────────────────────────────────────────── */
segButtons('show-seg', v => {
  state.show = v;
  applyVisibility();
  updateColorbar();
});
segButtons('color-seg', v => { state.color = v; updateRunner(); updateColorbar(); });
for (const id of ['show-biscuit', 'show-line']) {
  $(id).addEventListener('change', applyVisibility);
}
$('chart-on').addEventListener('change', e => {
  $('chart-panel').classList.toggle('on', e.target.checked);
  updateChart();
});
$('chart-close').addEventListener('click', () => {
  $('chart-on').checked = false;
  $('chart-panel').classList.remove('on');
});
slider('ref-opacity', v => {
  refMat.opacity = v / 100;
  refMat.transparent = v < 100;
  refMat.depthWrite = v >= 100;
  refMat.needsUpdate = true;
}, v => v + ' %');

/* ── Verschmelzen ────────────────────────────────────────────── */
function setStale(stale) {
  state.mergeStale = stale;
  if (state.merging) return setRun({ label: 'rechnet …', disabled: true });
  if (!stale && state.merged) {
    return setRun({ label: 'Körper ist aktuell', outline: true, disabled: true });
  }
  setRun({
    label: state.merged ? 'Körper neu verschmelzen' : 'Körper verschmelzen',
    warn: !!state.merged,
    note: state.merged
      ? 'Am Anguss wurde etwas geändert — der verschmolzene Körper zeigt noch den vorigen Stand.'
      : 'Der dichte Körper mit den weichen Übergängen entsteht erst auf Knopfdruck; nur er lässt sich als STL speichern.'
  });
}

function updateMergeFacts() {
  const segs = SDF.buildSegments(state.graph, state.net);
  const spec = SDF.fieldSpec(segs, $('show-biscuit').checked ? state.graph.biscuit : null,
    { cell: state.cell, blend: state.blend });
  const mb = spec.bytes / 1048576;
  const rows = [
    ['Prismen', fmt(segs.count, 0)],
    ['Raster', spec.dims.join(' × ')],
    ['Rasterpunkte', (spec.samples / 1e6).toFixed(2) + ' Mio.'],
    ['Speicher', mb.toFixed(1) + ' MB'],
    ['Beschleunigung', state.gpu ? 'WebGPU · ' + state.gpu.name : state.gpuNote]
  ];
  if (state.mergeInfo) {
    rows.push(['Feld gerechnet', state.mergeInfo.ms.toFixed(0) + ' ms ('
      + (state.mergeInfo.backend === 'webgpu' ? 'GPU' : 'CPU') + ')']);
    rows.push(['Dreiecke', fmt(state.mergeInfo.faces, 0)]);
    rows.push(['Volumen', fmt(state.mergeInfo.volume / 1000) + ' cm³']);
  }
  facts('merge-facts', rows);
  $('graph-warn').textContent = mb > 600
    ? 'Das Raster braucht ' + mb.toFixed(0) + ' MB — die Zellweite sollte gröber werden.'
    : '';
  return { segs, spec };
}

async function runMerge() {
  if (state.merging) return;
  state.merging = true;
  setStale(state.mergeStale);
  const t0 = performance.now();
  busy.textContent = 'Abstandsfeld rechnen …';
  busy.classList.add('on');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    const { segs, spec } = updateMergeFacts();
    const bisc = $('show-biscuit').checked ? state.graph.biscuit : null;
    if (!state.gpuTried) {
      state.gpuTried = true;
      state.gpu = await initGPU();
      state.gpuNote = state.gpu ? state.gpu.name : 'CPU (kein WebGPU)';
    }
    let field = null;
    if (state.gpu) {
      try {
        busy.textContent = 'Abstandsfeld auf der Grafikkarte …';
        field = await buildFieldGPU(state.gpu, spec, segs, bisc,
          p => { busy.textContent = 'Abstandsfeld auf der Grafikkarte … ' + Math.round(p * 100) + ' %'; });
      } catch (err) {
        console.warn('WebGPU-Weg fehlgeschlagen, es geht auf der CPU weiter:', err);
        state.gpu = null;
        state.gpuNote = 'CPU (WebGPU brach ab)';
        field = null;
      }
    }
    if (!field) {
      field = await SDF.buildFieldCPU(spec, segs, bisc,
        p => { busy.textContent = 'Abstandsfeld rechnen … ' + Math.round(p * 100) + ' %'; });
    }
    busy.textContent = 'Fläche ableiten …';
    await new Promise(r => setTimeout(r, 0));
    const tris = surfaceNets(field, 0);
    state.merged = tris;
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(tris), 3));
    geo.computeVertexNormals();
    mergedMesh.geometry.dispose();
    mergedMesh.geometry = geo;
    state.mergeInfo = {
      ms: performance.now() - t0, backend: field.backend,
      faces: tris.length / 9, volume: Math.abs(volume(tris)), area: surface(tris)
    };
    state.mergeStale = false;
    state.show = 'merged';
    segButtonSet('show-seg', 'merged');
  } catch (err) {
    $('graph-warn').textContent = 'Der Körper konnte nicht verschmolzen werden: ' + err.message;
    console.error(err);
  } finally {
    busy.classList.remove('on');
    state.merging = false;
    applyVisibility();
    updateColorbar();
    updateMergeFacts();
    setStale(state.mergeStale);
  }
}

function segButtonSet(id, value) {
  for (const b of $(id).querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.value === value);
  }
}

$('run-merge').addEventListener('click', runMerge);
numberInput('cell', v => {
  state.cell = Math.max(0.1, Math.min(20, v));
  updateMergeFacts();
  setStale(true);
  return state.cell;
});
numberInput('blend', v => {
  state.blend = Math.max(0, Math.min(30, v));
  updateMergeFacts();
  setStale(true);
  return state.blend;
});

/* ── Dateien ─────────────────────────────────────────────────── */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const safeName = () => (state.name || 'anguss').replace(/[^\w-]+/g, '-').toLowerCase();

$('stl-save').addEventListener('click', async () => {
  if (!state.merged || state.mergeStale) await runMerge();
  if (!state.merged || !state.merged.length) return;
  download(new Blob([writeSTL(state.merged, 'DieLogic Angusssystem')], { type: 'model/stl' }),
    safeName() + '.stl');
});

$('json-save').addEventListener('click', () => {
  const text = JSON.stringify(G.toJSON(state.graph), null, 1);
  download(new Blob([text], { type: 'application/json' }), safeName() + '.json');
});

$('json-btn').addEventListener('click', () => $('json-input').click());
$('json-input').addEventListener('change', e => { if (e.target.files[0]) readAny(e.target.files[0]); });
$('ref-btn').addEventListener('click', () => $('ref-input').click());
$('ref-input').addEventListener('change', e => { if (e.target.files[0]) readAny(e.target.files[0]); });
$('ref-clear').addEventListener('click', () => {
  refMesh.visible = false;
  refMesh.geometry.dispose();
  refMesh.geometry = new T.BufferGeometry();
  $('ref-note').textContent = 'Kein Referenzbauteil geladen.';
});

/* Was für eine Datei das ist, entscheidet der INHALT, nicht die Endung:
   eine geschweifte Klammer heißt Angussdatei, alles andere ist
   Geometrie. */
function readAny(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const head = new Uint8Array(fr.result, 0, Math.min(64, fr.result.byteLength));
      let i = 0;
      while (i < head.length && head[i] <= 32) i++;
      if (head[i] === 0x7b) loadGraphJSON(new TextDecoder().decode(fr.result), file.name);
      else loadReference(fr.result, file.name);
    } catch (err) {
      $('graph-warn').textContent = 'Die Datei „' + file.name + '" konnte nicht gelesen werden: ' + err.message;
      console.error(err);
    }
  };
  fr.onerror = () => {
    $('graph-warn').textContent = 'Die Datei „' + file.name + '" konnte nicht gelesen werden.';
  };
  fr.readAsArrayBuffer(file);
}

function loadGraphJSON(text, name) {
  const g = G.fromJSON(JSON.parse(text));
  state.graph = g;
  state.name = name.replace(/\.json$/i, '');
  state.merged = null;
  state.mergeInfo = null;
  $('graph-note').textContent = 'Geladen: ' + name;
  $('graph-warn').textContent = '';
  $('demo-select').selectedIndex = -1;
  adoptGraph();
}

function loadReference(buffer, name) {
  const tris = isGLB(buffer) ? readGLB(buffer) : parseSTL(buffer);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(tris), 3));
  geo.computeVertexNormals();
  refMesh.geometry.dispose();
  refMesh.geometry = geo;
  refMesh.visible = true;
  $('ref-note').textContent = name + ' · ' + fmt(tris.length / 9, 0)
    + ' Dreiecke — nur als Bezug, es wird nicht gerechnet.';
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

/* ── Beispiele ───────────────────────────────────────────────── */
$('demo-select').innerHTML = DEMOS
  .map(d => '<option value="' + d.id + '">' + d.label + '</option>').join('');

function pickDemo(id) {
  const d = DEMOS.find(x => x.id === id) || DEMOS[0];
  $('demo-select').value = d.id;
  state.graph = d.build();
  state.name = d.label;
  state.merged = null;
  state.mergeInfo = null;
  $('graph-note').textContent = '';
  adoptGraph();
}
$('demo-select').addEventListener('change', e => pickDemo(e.target.value));

/** Nach dem Laden eines anderen Systems alle Anzeigen nachziehen. */
function adoptGraph() {
  const g = state.graph;
  $('bisc-d').value = fmt(g.biscuit.d, 2);
  $('bisc-t').value = fmt(g.biscuit.t, 2);
  $('bisc-x').value = fmt(g.biscuit.pos[0], 2);
  $('bisc-y').value = fmt(g.biscuit.pos[1], 2);
  $('bisc-z').value = fmt(g.biscuit.pos[2], 2);
  segButtonSet('axis-seg', g.biscuit.axis);
  $('draft').value = String(g.draft);
  $('draft-val').textContent = fmt(g.draft) + '°';
  $('radius').value = fmt(g.radius, 2);
  $('tension').value = String(Math.round(g.tension * 100));
  $('tension-val').textContent = fmt(g.tension, 2);
  $('step').value = fmt(g.step, 2);
  rebuild();
  editor.select(g.rootId);
  view.fitTo(group);
  state.ready = true;
}

mountLegend();
$('status').textContent = IDLE;
/* Beispiel aus der Adresszeile (?demo=…) — wie ?part=… auf den
   Bauteilseiten; damit lässt sich ein bestimmtes System verlinken. */
pickDemo(new URLSearchParams(location.search).get('demo'));

export const __viewer = {
  state, view, editor, runMerge, rebuild, adoptGraph, pickDemo,
  runnerMesh, mergedMesh, biscMesh, refMesh, group
};
window.__anguss = __viewer;
