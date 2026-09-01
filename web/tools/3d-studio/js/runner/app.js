/* Angussdesigner (anguss.html) — Einstieg und Verdrahtung.

   Der Ablauf ist immer derselbe und immer in dieser Reihenfolge:

     Graph  →  Anschnittbreiten  →  Abtasten  →  Strömung  →  Anzeige

   Alles hängt am Graphen (js/runner/graph.js); nichts wird doppelt
   gehalten. Ein Zug am Griff ändert eine Koordinate, danach läuft die
   ganze Kette neu — Abtasten, Sweep, Strömung und Prüfregeln kosten bei
   einem üblichen System zusammen wenige Millisekunden, also darf das bei
   jedem Mausschritt passieren. Es gibt hier nichts, was auf Knopfdruck
   wartet. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { mountNav } from '../ui/nav.js';
import {
  $, fmt, fmtPlain, facts, segButtons, slider, numberInput
} from '../ui/controls.js';
import { parseSTL, writeSTL } from '../part/stlio.js';
import { readGLB, isGLB } from '../part/glbio.js';
import { volume } from '../mesh.js';
import { concat } from '../solids.js';
import * as G from './graph.js';
import { sampleNetwork } from './curve.js';
import { sweepRunner, biscuitMesh, centerlines } from './sweep.js';
import * as F from './flow.js';
import { checkRules } from './rules.js';
import { autoTaper, DEFAULT_SIZING } from './sizing.js';
import { DEMOS, demoTwoGates } from './presets.js';
import { flowChart } from './chart.js';
import { createEditor, SELECTED_RING, FOLLOWER_COLOR } from './editor.js';
import { mountAxes } from './axes.js';
import { rotate, norm, cross, dot, sub, add } from './vec.js';

mountNav('anguss.html');

const container = $('viewport');

/* Ohne Bodenraster: der Anguss ist ein freistehender Körper, den man von
   allen Seiten ansieht — ein Raster darunter gäbe ihm ein „unten", das er
   nicht hat, und läge bei jeder schrägen Ansicht im Bild. */
const view = initScene(container, {
  orbit: 'trackball', headlight: true,
  cameraStart: [230, 210, 280], target: [0, 0, 60],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

/* Achsenkreuz unter der Ansichtsleiste. Three.js ruft scene.onBeforeRender
   vor jedem Bild mit der gerade benutzten Kamera — damit stimmt es auch
   nach dem Umschalten auf die Parallelprojektion, ohne dass die
   Bildschleife etwas davon wissen muss. */
const axes = mountAxes(container);
view.scene.onBeforeRender = (renderer, scene, camera) => axes.update(camera);

const state = {
  graph: demoTwoGates(),
  net: null, flow: null, rules: [],
  proc: { ...F.DEFAULT_PROCESS },
  sizing: { ...DEFAULT_SIZING },
  show: 'sweep',
  name: 'Zwei Anschnitte', ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

/* Fast ohne Metallanteil: ohne Umgebungskarte hat ein metallisches
   Material nichts zu spiegeln — es wird nur dunkel, wo kein Licht
   hinfällt. */
const runnerMat = new T.MeshStandardMaterial({
  color: 0x008c82, roughness: 0.52, metalness: 0.04, side: T.DoubleSide
});
const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
group.add(runnerMesh);

const biscMat = new T.MeshStandardMaterial({
  color: 0x93a6b0, roughness: 0.6, metalness: 0.06, transparent: true, opacity: 0.5,
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
  updatePointMenu();
}

function updateRunner() {
  const geo = new T.BufferGeometry();
  geo.setAttribute('position',
    new T.BufferAttribute(Float32Array.from(sweepRunner(state.net)), 3));
  geo.computeVertexNormals();
  runnerMesh.geometry.dispose();
  runnerMesh.geometry = geo;
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
  biscMesh.visible = $('show-biscuit').checked;
  const handles = $('show-line').checked;
  lineGroup.visible = handles;
  editor.group.visible = handles;
  editor.setEnabled(handles);
}

/* ── Kennzahlen, Regeln, Schema ──────────────────────────────── */
/* Die Kennzahlen des ganzen Systems stehen beim Flussschema, nicht in der
   Seitenleiste — und dort nur, was das Schema NICHT ohnehin zeigt.
   Anschnittfläche, Geschwindigkeit und die Aufteilung soll/ist hängen im
   Bild an den Ästen selbst; sie ein zweites Mal als Summe daneben zu
   setzen, hieße dieselbe Sache zweimal sagen und dabei die interessante
   Hälfte (welcher Ast?) wegzulassen. */
function updateFacts() {
  const g = state.graph, net = state.net, fl = state.flow;
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  facts('chart-facts', [
    ['Punkte', fmt(G.allNodes(g).length, 0)],
    ['Anschnitte', fmt(gates.length, 0)],
    ['Lauflänge', fmt(net.length, 0) + ' mm'],
    ['Angussvolumen', fmt(fl.runnerVolume / 1000) + ' cm³'],
    ['Volumenstrom', fmt(fl.Q * 1e6, 0) + ' cm³/s'],
    ['Druckbedarf', fmt(fl.dp / 1e5) + ' bar']
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

/* ── Auswahl ─────────────────────────────────────────────────── */

/* Kopfzeile des Auswahlfeldes im Viewport: Artfarbe, Bezeichnung, id. */
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
    $('pt-sel').textContent = 'Kein Punkt gewählt';
    facts('sel-facts', []);
    updatePointMenu();
    return;
  }
  const follower = G.isFollower(g, id);
  $('pt-sel').innerHTML = label;
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(n.pos[i], 2);
  $('sel-w').value = fmt(n.w, 2);
  $('sel-h').value = fmt(n.h, 2);
  $('sel-roll').value = String(n.tilt[0]);
  $('sel-roll-val').textContent = fmt(n.tilt[0], 0) + '°';
  $('sel-pitch').value = String(n.tilt[1]);
  $('sel-pitch-val').textContent = fmt(n.tilt[1], 0) + '°';

  /* Der Pressrest ist ein Punkt wie jeder andere — nur trägt er statt
     einer Arbeitsebene seine eigenen Maße. Beides gleichzeitig zu zeigen
     wäre falsch: seine Ebene IST die Ausstoßrichtung, kippen lässt sie
     sich nicht. */
  const isRoot = !n.parent;
  $('bisc-block').classList.toggle('hidden', !isRoot);
  $('plane-block').classList.toggle('hidden', isRoot);
  if (isRoot) {
    $('bisc-d').value = fmt(g.biscuit.d, 2);
    $('bisc-t').value = fmt(g.biscuit.t, 2);
    segButtonSet('axis-seg', g.biscuit.axis);
  }

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
  if (isRoot) {
    const b = g.biscuit;
    rows.unshift(['Pressrest-Volumen',
      fmt(Math.PI * b.d * b.d / 4 * b.t / 1000) + ' cm³']);
  }
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
segButtons('show-seg', v => { state.show = v; applyVisibility(); });
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

/* Der Umschalter „Kanäle / nur Linie" merkt sich seine Stellung im
   Knopf; beim Beispielwechsel muss sie von Hand nachgezogen werden. */
function segButtonSet(id, value) {
  for (const b of $(id).querySelectorAll('button')) {
    b.classList.toggle('active', b.dataset.value === value);
  }
}

/* ── Dateien ─────────────────────────────────────────────────── */
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const safeName = () => (state.name || 'anguss').replace(/[^\w-]+/g, '-').toLowerCase();

/* Die STL enthält, was im Viewport steht — die Schläuche durchdringen
   sich an den Gabelungen. Ein einziger verschmolzener Körper wäre schöner
   und war einmal da; er kostete ein Rasterfeld und eine Wartezeit, und
   jedes CAD vereinigt überlappende Körper mit einem Klick. */
$('stl-save').addEventListener('click', () => {
  const parts = [sweepRunner(state.net)];
  if ($('show-biscuit').checked) parts.push(biscuitMesh(state.graph.biscuit));
  const tris = concat(parts);
  if (!tris.length) return;
  download(new Blob([writeSTL(tris, 'DieLogic Angusssystem')], { type: 'model/stl' }),
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
  $('ref-file').classList.add('hidden');
  $('ref-input').value = '';
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
  $('graph-note').textContent = 'Geladen: ' + name;
  $('graph-warn').textContent = '';
  $('demo-select').selectedIndex = -1;
  adoptGraph();
}

/* Das Referenzteil liefert die Zahl, um die sich alles dreht: aus dem
   Gussvolumen und der Füllzeit kommt der Volumenstrom, daraus die
   Anschnittflächen und damit jeder Querschnitt. Sie von Hand einzutippen,
   während das Bauteil daneben liegt, ist eine Fehlerquelle ohne Gewinn —
   also wird sie übernommen. Überläufe sind darin NICHT enthalten; wer sie
   mitrechnen will, schlägt sie im Feld auf. */
function loadReference(buffer, name) {
  const tris = isGLB(buffer) ? readGLB(buffer) : parseSTL(buffer);
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(tris), 3));
  geo.computeVertexNormals();
  refMesh.geometry.dispose();
  refMesh.geometry = geo;
  refMesh.visible = true;

  const cm3 = Math.abs(volume(tris)) / 1000;
  if (cm3 >= 0.01 && cm3 <= 1e5) {
    state.proc.volume = Math.round(cm3 * 10) / 10;
    $('vol').value = fmtPlain(state.proc.volume, 1);
    rebuild();
    $('ref-note').textContent = name + ' · ' + fmt(cm3) + ' cm³';
  } else {
    $('ref-note').textContent = name + ' · Volumen unbrauchbar (offenes Netz)';
  }
  $('ref-file').classList.remove('hidden');
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
  $('graph-note').textContent = '';
  adoptGraph();
}
$('demo-select').addEventListener('change', e => pickDemo(e.target.value));

/** Nach dem Laden eines anderen Systems alle Anzeigen nachziehen. */
function adoptGraph() {
  const g = state.graph;
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
/* Beispiel aus der Adresszeile (?demo=…) — wie ?part=… auf den
   Bauteilseiten; damit lässt sich ein bestimmtes System verlinken. */
pickDemo(new URLSearchParams(location.search).get('demo'));

export const __viewer = {
  state, view, editor, rebuild, adoptGraph, pickDemo,
  runnerMesh, biscMesh, refMesh, group
};
window.__anguss = __viewer;
