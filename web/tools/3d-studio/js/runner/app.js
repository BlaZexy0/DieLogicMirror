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
import {
  $, fmt, fmtPlain, facts, segButtons, segButtonSet, slider, numberInput
} from '../ui/controls.js';
import { parseSTL, writeSTL } from '../part/stlio.js';
import { readGLB, isGLB } from '../part/glbio.js';
import { volume } from '../mesh.js';
import * as G from './graph.js';
import { sampleNetwork } from './curve.js';
import { sweepRunner, biscuitMesh, centerlines } from './sweep.js';
import * as F from './flow.js';
import { checkRules } from './rules.js';
import { autoTaper, DEFAULT_SIZING } from './sizing.js';
import { DEMOS, demoTwoGates } from './presets.js';
import { flowChart } from './chart.js';
import { createEditor, SELECTED_RING, FOLLOWER_COLOR } from './editor.js';
import { rotate, norm, cross, dot, sub, add } from './vec.js';
import { shotTimeline, flowOnCurve } from './shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { download, safeName, dirText, readBuffer, looksLikeJSON, createAimUI } from '../ui/common.js';

const container = $('viewport');

/* Ohne Bodenraster: der Anguss ist ein freistehender Körper, den man von
   allen Seiten ansieht — ein Raster darunter gäbe ihm ein „unten", das er
   nicht hat, und läge bei jeder schrägen Ansicht im Bild. */
const view = initScene(container, {
  cameraStart: [230, 210, 280], target: [0, 0, 60],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = {
  graph: demoTwoGates(),
  net: null, flow: null, rules: [],
  proc: { ...F.DEFAULT_PROCESS },
  sizing: { ...DEFAULT_SIZING },
  show: 'sweep',
  /* Ankunft nach der DieLogic-Schusskurve (js/runner/shottime.js): timeline
     ist die Kurve der Auslegung für dieses System, flowShown die Strömung
     mit ihren Zeiten — oder die mit konstantem Strom, wenn aus. */
  onCurve: true, timeline: null, flowShown: null,
  name: 'Zwei Anschnitte', ready: false,
  chartOpen: false,
  refPending: null          // Versprechen, solange ein Beispiel sein Referenzteil holt
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

/* Fast ohne Metallanteil: ohne Umgebungskarte hat ein metallisches
   Material nichts zu spiegeln — es wird nur dunkel, wo kein Licht
   hinfällt. */
/* flatShading lässt den Shader die Flächennormale selbst ableiten. Bei
   einer Dreieckssuppe ohne geteilte Ecken lieferte computeVertexNormals
   ohnehin nur die Flächennormale — nur eben als 2,2 MB großes Attribut,
   das bei jedem Mauszug neu gerechnet und hochgeladen wurde. */
const runnerMat = new T.MeshStandardMaterial({
  color: 0x008c82, roughness: 0.52, metalness: 0.04, side: T.DoubleSide,
  flatShading: true
});
const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
group.add(runnerMesh);

/* Deckend: der Pressrest ist ein Körper wie die Kanäle, kein Hinweis.
   Durchscheinend sah er aus wie etwas, das noch nicht entschieden ist.

   Der erste Kanal beginnt in der Mitte des Pressrests und läuft durch
   ihn hindurch — beide Körper liegen mit der Oberseite in der Trennebene,
   ihre Deckflächen sind dort deckungsgleich. Zwei Flächen in derselben
   Tiefe kann der Tiefenpuffer nicht ordnen: das gab ein Flimmern aus
   Streifen beider Farben auf dem Pressrest. polygonOffset zieht den
   Pressrest um einen Tiefenschritt vor — wo beide Flächen zusammenfallen,
   gewinnt er, und die Kanaloberseite verschwindet unter seiner Scheibe,
   wie im Metall auch. Die Körper selbst bleiben, wie sie sind: die
   Vereinigung entsteht wie an den Verzweigungen durch Überlappung. */
const biscMat = new T.MeshStandardMaterial({
  color: 0x93a6b0, roughness: 0.6, metalness: 0.06, side: T.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
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
  getRefMesh: () => refMesh,
  /* Der Pfeil am Anschnitt zeigt die WIRKLICHE Mündungsrichtung: die
     letzte Tangente der abgetasteten Kante, ob gebunden oder aus der
     Sehne. */
  getGateDir: id => {
    const e = state.net && state.net.edges.find(x => x.toId === id);
    return e && e.sections.length ? e.sections[e.sections.length - 1].t : null;
  },
  onAim: id => startAim(id),
  onSelect: () => { cancelAim(); syncSelection(); },
  onChange: (what) => {
    if (what === 'drag') { rebuild('drag'); return; }
    rebuild();
    if (what === 'drop') syncSelection();
  }
});

/* ── Kette: Graph → Anzeige ──────────────────────────────────── */
/* Während eines Zuges zählt, was man sieht: Netz, Linien, Griffe. Regeln,
   Kennzahlen und Schema kommen beim Loslassen — sie gehören zum
   Ergebnis, nicht zur Bewegung. */
function rebuild(mode) {
  const g = state.graph;
  F.applyAutoGates(g, state.proc);
  state.net = sampleNetwork(g);
  state.flow = F.analyseFlow(g, state.net, state.proc);
  updateRunner();
  updateLines();
  updateBiscuit();
  editor.refresh();
  if (mode === 'drag') { view.invalidate(); return; }
  updateTimeline();
  state.rules = checkRules(g, state.net, state.flowShown, shownProc());
  updateFacts();
  updateRules();
  updateChart();
  updatePointMenu();
  view.invalidate();
}

/* ── Die Schusskurve unter dem Anguss ────────────────────────
   Die Kurve der Auslegung mit dem, was HIER feststeht: die Volumen (das
   Gussvolumen samt Überläufen, wie unter „Prozess" eingetragen, dieser
   Anguss, dieser Pressrest) und die Füllkammer — der Pressrest-Ø ist
   der Kolben-Ø, die Kammerlänge steht unter „Prozess". Daraus folgt der
   Füllgrad, und der bestimmt die ganze erste Phase; ihn aus der Kammer
   des Projekts zu nehmen, hieße einen 150er Kolben unter einen 90er
   Pressrest zu setzen. Maschine (v_max, a_max) und Thermik kommen
   weiter aus dem aktuellen Projekt — eine Anbindung an die Auslegung
   ist das nicht, nur ihre Kurve. */
function modelVolumes() {
  const b = state.graph.biscuit;
  return {
    part: state.proc.volume * 1000, overflow: 0,
    runner: state.flow ? state.flow.runnerVolume : NaN,
    biscuit: Math.PI * b.d * b.d / 4 * b.t
  };
}
function updateTimeline() {
  state.timeline = null;
  state.flowShown = state.flow;
  if (!state.onCurve || !state.flow) return;
  const tl = shotTimeline(design.values, modelVolumes(),
    { diam: state.graph.biscuit.d, length: state.proc.chamberLen });
  if (tl.error) { state.timeline = { error: tl.error }; return; }
  state.timeline = tl;
  state.flowShown = flowOnCurve(state.flow, tl);
}
/* Die Prüfregel der Spanne misst an der Füllzeit — auf der Kurve an ihrer eigenen. */
const shownProc = () => (state.flowShown && state.flowShown.onCurve
  ? { ...state.proc, fillTime: state.flowShown.fillTime } : state.proc);

function updateShotFacts() {
  const tl = state.timeline, fl = state.flowShown;
  const warn = $('shot-warn');
  $('shot-adopt').disabled = !(tl && !tl.error && Number.isFinite(tl.shot.fill) && tl.shot.fill > 0);
  if (!state.onCurve || !tl) { facts('shot-facts', []); warn.textContent = ''; return; }
  if (tl.error) { facts('shot-facts', []); warn.textContent = 'Keine DieLogic-Kurve: ' + tl.error + ' Die Ankunft steht mit konstantem Strom.'; return; }
  const sh = tl.shot;
  const rows = [
    ['Füllkammer', 'Ø ' + fmt(tl.v.diam, 0) + ' × ' + fmt(tl.v.length, 0) + ' mm · Füllgrad ' + fmt(tl.phi * 100, 0) + ' %'],
    ['Kammer voll', 'bei ' + fmt(tl.tFull * 1000, 0) + ' ms · Kolben ' + fmt(sh.events[0].v, 2) + ' m/s'],
    ['2. Phase', 'v₂ ' + fmt(tl.v2) + ' m/s' + (Number.isFinite(sh.fill) ? ' · Füllzeit ' + fmt(sh.fill, 0) + ' ms' : '')
      + (Number.isFinite(tl.tN) ? ' (NADCA ' + fmt(tl.tN, 0) + ' ms)' : '')]
  ];
  if (fl && fl.onCurve) {
    rows.push(['Anguss voll', fl.tRunner !== null ? 'bei ' + fmt(fl.tRunner * 1000, 0) + ' ms ab Kolbenstart'
      : 'die Kurve endet vorher (' + fl.unreached.join(', ') + ')']);
  }
  if (Number.isFinite(sh.fill) && Math.abs(sh.fill - state.proc.fillTime) > 0.5) {
    rows.push(['Prozess', 'Füllzeit ' + fmt(state.proc.fillTime, 0) + ' ms, die Kurve braucht ' + fmt(sh.fill, 0) + ' ms']);
  }
  facts('shot-facts', rows);
  warn.textContent = tl.warn || '';
}

/* Während eines Zuges ändert sich die GRÖSSE des Netzes nicht — nur die
   Werte. Dann wird in den vorhandenen Puffer geschrieben statt Geometrie,
   Attribut und Hüllkugel jedes Mal neu anzulegen. */
function updateRunner() {
  const tris = sweepRunner(state.net);
  const attr = runnerMesh.geometry.getAttribute('position');
  if (attr && attr.array.length === tris.length) {
    attr.array.set(tris);
    attr.needsUpdate = true;
    runnerMesh.geometry.boundingSphere = null;   // sonst friert das Culling den alten Ort ein
  } else {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3));
    runnerMesh.geometry.dispose();
    runnerMesh.geometry = geo;
  }
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

/* Der Pressrest ändert sich nur, wenn seine Maße sich ändern — nicht bei
   jedem Zug an einem Kanalpunkt. */
let biscuitKey = '';
function updateBiscuit() {
  const b = state.graph.biscuit;
  const key = [b.pos.join(','), b.axis, b.d, b.t].join('|');
  if (key === biscuitKey) return;
  biscuitKey = key;
  const tris = biscuitMesh(b);
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
  view.invalidate();
}

/* ── Kennzahlen, Regeln, Schema ──────────────────────────────── */
/* Die Kennzahlen des ganzen Systems stehen beim Flussschema, nicht in der
   Seitenleiste — und dort nur, was das Schema NICHT ohnehin zeigt.
   Anschnittfläche, Geschwindigkeit und die Aufteilung soll/ist hängen im
   Bild an den Ästen selbst; sie ein zweites Mal als Summe daneben zu
   setzen, hieße dieselbe Sache zweimal sagen und dabei die interessante
   Hälfte (welcher Ast?) wegzulassen. */
function updateFacts() {
  const g = state.graph, net = state.net, fl = state.flowShown || state.flow;
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  const rows = [
    ['Punkte', fmt(G.allNodes(g).length, 0)],
    ['Anschnitte', fmt(gates.length, 0)],
    ['Lauflänge', fmt(net.length, 0) + ' mm'],
    ['Angussvolumen', fmt(fl.runnerVolume / 1000) + ' cm³'],
    ['Volumenstrom', fmt(fl.Q * 1e6, 0) + ' cm³/s'],
    ['Druckbedarf', fmt(fl.dp / 1e5) + ' bar']
  ];
  /* Wann die Schmelze wo ist: erster und letzter Anschnitt — auf der
     Schusskurve ab Kolbenstart, sonst ab Eintritt in den Anguss. */
  if (gates.length && Number.isFinite(fl.tFirst)) {
    rows.push(['Ankunft', (gates.length > 1
      ? fmt(fl.tFirst * 1000) + ' bis ' + fmt(fl.tLast * 1000) + ' ms'
      : fmt(fl.tFirst * 1000) + ' ms') + (fl.onCurve ? ' ab Kolbenstart' : ' bei konstantem Strom')]);
  }
  if (fl.onCurve && state.timeline) {
    rows.push(['Schusskurve', 'DieLogic-Kurve · Kammer voll bei ' + fmt(state.timeline.tFull * 1000, 0) + ' ms · v₂ '
      + fmt(state.timeline.v2) + ' m/s' + (fl.unreached.length ? ' · endet vor ' + fl.unreached.join(', ') : '')]);
  }
  facts('chart-facts', rows);
  updateShotFacts();
}

function updateRules() {
  $('rules-list').innerHTML = state.rules.map(r =>
    '<div class="rule ' + r.level + '"><b>' + r.title + '</b><span>' + r.text + '</span></div>').join('');
}

/* Das Schema füllt den ganzen Viewport; gezeichnet wird es nur, solange
   es offen ist — und in Bildschirmbreite, damit die Schrift mitwächst. */
function updateChart() {
  if (!state.chartOpen) return;
  $('chart-body').innerHTML = flowChart(state.graph, state.net, state.flowShown || state.flow, { width: 900 });
}

function openChart(on) {
  state.chartOpen = on;
  $('chart-panel').classList.toggle('on', on);
  $('chart-btn').classList.toggle('active', on);
  if (on) { cancelAim(); updateChart(); }
}

/* ── Auswahl ─────────────────────────────────────────────────── */

/* Kopfzeile des Auswahlfeldes im Viewport: Artfarbe, Bezeichnung, id. */
function selectionLabel(g, id) {
  const n = id && g.nodes[id];
  if (!n) return null;
  const meta = G.TYPES[n.type];
  return '<span class="dot" style="background:' + meta.color + '"></span>'
    + meta.label + ' <code>' + id + '</code>'
    + (G.isFollower(g, id) ? ' <em>(gespiegelt: die andere Seite bearbeiten)</em>'
      : n.aim ? ' <em class="pinned">ans Bauteil gebunden</em>' : '');
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

/* ── Mündung ans Bauteil ─────────────────────────────────────
   Ein Anschnitt, dessen Richtung aus der Sehne zum Vorgänger kommt,
   dreht sich mit, sobald der Vorgänger wandert — beim Ausbalancieren
   des Systems passiert das ständig. Wer stattdessen die Stelle am
   Bauteil anklickt, legt beides auf einmal fest: den Ort der Mündung
   und die Richtung, in der die Schmelze das Bauteil betritt. */
/* Der scharfe Zustand muss unübersehbar sein: oben im Viewport steht,
   was zu tun ist. Ein Zielmodus, den man nicht sieht, ist einer, in dem
   man rätselt, warum der Klick nichts tut. */
const aim = createAimUI();
function cancelAim() {
  if (editor.cancelAim()) aim.hide();
}

/* Der Klick auf den Pfeil eines Anschnitts. Ohne Referenzbauteil gibt es
   nichts zu treffen — dann sagt der Hinweis das, statt zu schweigen. */
function startAim(id) {
  const n = id && state.graph.nodes[id];
  if (!n || n.type !== 'gate' || G.isFollower(state.graph, id)) return;
  if (!refMesh.visible) {
    aim.note('Zuerst ein Referenzbauteil laden (STL oder GLB), dann zeigt der Klick auf den Pfeil, wo der Anschnitt münden soll.');
    return;
  }
  /* Schon scharf für diesen Anschnitt: bleibt scharf. Abgebrochen wird
     mit Esc, mit „Abbrechen" im Hinweis oder durch eine andere Auswahl. */
  aim.show(true, 'Mündung ans Bauteil: eine Stelle auf dem Bauteil anklicken. Ziehen dreht die Ansicht, Esc bricht ab.');
  aim.onCancel = cancelAim;
  editor.armAim({
    /* Die Arbeitsebene des Anschnitts, jedes Mal frisch: ein Treffer an
       einer aufrechten Wand wird in sie gelegt (js/runner/editor.js). */
    plane: () => {
      const gn = state.graph.nodes[id];
      return gn ? { origin: gn.pos, normal: G.planeNormal(state.graph, gn) } : null;
    },
    onHit: hit => {
      aim.hide();
      G.aimAt(state.graph, id, hit.point, hit.dir);
      rebuild();
      syncSelection();
    },
    onMiss: () => aim.miss('Daneben: die Stelle muss auf dem Bauteil liegen.', () => editor.aiming)
  });
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (state.chartOpen) openChart(false);
  cancelAim();
  aim.hide();
});

/* Die gebundene Richtung als Text — drei Dezimalzahlen sagen niemandem
   etwas, die nächstliegende Achse schon. */

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
  $('pt-sel').innerHTML = label;
  /* Ein Zehntel: „−137,25" passt nicht in ein Drittel der Zeile, und auf
     den Hundertstelmillimeter setzt niemand einen Kanalpunkt. */
  for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) $(k).value = fmt(n.pos[i], 1);
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
    $('sel-gh').title = n.gate.hAuto
      ? 'Folgt der Anschnitthöhe unter „Kanalform". Ein eigener Wert löst ihn davon.'
      : 'Eigene Höhe dieses Anschnitts; die Vorgabe unter „Kanalform" gilt hier nicht mehr.';
    $('sel-gh').classList.toggle('inherited', !!n.gate.hAuto);
    $('sel-glen').value = fmt(n.gate.len, 2);
    $('sel-gw').value = fmt(n.gate.w, 2);
    $('sel-gauto').checked = !!n.gate.auto;
    $('sel-gw').disabled = !!n.gate.auto;
    $('sel-gtrans').value = n.gate.transition;
  } else { cancelAim(); aim.hide(); }

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
    const fl = state.flowShown || state.flow;
    const r = fl.gates.find(x => x.id === id);
    if (r) {
      rows.push(['Anschnittfläche', fmt(r.area, 0) + ' mm²']);
      rows.push(['Anteil Soll/Ist', fmt(r.soll * 100, 0) + ' / ' + fmt(r.ist * 100, 0) + ' %']);
      rows.push(['Ankunft', Number.isFinite(r.tArrive)
        ? fmt(r.tArrive * 1000) + ' ms' + (fl.onCurve ? ' ab Kolbenstart' : '')
        : 'die Kurve endet vorher']);
    }
    /* Wohin der Anschnitt mündet — und ob das ans Bauteil gebunden ist
       oder dem Punkt davor folgt. Der Pfeil im Viewport zeigt dasselbe. */
    const e = state.net.edges.find(x => x.toId === id);
    const t = e && e.sections.length ? e.sections[e.sections.length - 1].t : null;
    if (t) {
      const tilt = G.aimTilt(g, n);
      rows.push(['Mündung', dirText(t) + (n.aim
        ? ' · gebunden' + (tilt >= 1 ? ', ' + fmt(tilt, 0) + '° aus der Ebene' : '')
        : ' · folgt dem Kanal')]);
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
  /* Ein eigener Wert nimmt den Anschnitt aus der Vorgabe heraus — es sei
     denn, er ist genau die Vorgabe. */
  editNode(n => { n.gate.h = h; n.gate.hAuto = Math.abs(h - state.graph.gateH) < 1e-9; });
  syncSelection();
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
  /* Die Kamera bleibt stehen. Das System dreht sich um den Pressrest;
     wer die Richtung umschaltet, will sehen, wie es sich dreht — nicht
     ein neu eingepasstes Bild. */
});

/* ── Kanalform ───────────────────────────────────────────────── */
slider('draft', v => { state.graph.draft = v; rebuild(); }, v => fmt(v) + '°');
numberInput('gate-h', v => {
  const h = Math.max(0.3, Math.min(30, v));
  G.setGateHeight(state.graph, h);
  rebuild();
  syncSelection();
  return h;
});
numberInput('radius', v => {
  const r = Math.max(0, Math.min(20, v));
  state.graph.radius = r;
  rebuild();
  return r;
});
numberInput('branch-r', v => {
  const r = Math.max(0, Math.min(40, v));
  state.graph.branchR = r;
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
numberInput('chamber-len', v => {
  state.proc.chamberLen = Math.max(50, Math.min(3000, v));
  rebuild();
  syncSelection();
  return state.proc.chamberLen;
});
slider('cbranch', v => { state.proc.cBranch = v / 100; rebuild(); }, v => fmt(v / 100, 2));
$('shot-time').addEventListener('change', e => {
  state.onCurve = e.target.checked;
  rebuild();
  syncSelection();
});
/* Die Füllzeit, die die Kurve braucht, als Füllzeit des Prozesses — dann
   rechnen Strom und Zeiten mit derselben Zahl. */
$('shot-adopt').addEventListener('click', () => {
  const tl = state.timeline;
  if (!tl || tl.error || !(tl.shot.fill > 0)) return;
  state.proc.fillTime = Math.round(tl.shot.fill * 10) / 10;
  $('tfill').value = fmtPlain(state.proc.fillTime, 1);
  rebuild();
  syncSelection();
});

/* ── Darstellung ─────────────────────────────────────────────── */
segButtons('show-seg', v => { state.show = v; applyVisibility(); });
for (const id of ['show-biscuit', 'show-line']) {
  $(id).addEventListener('change', applyVisibility);
}
$('chart-btn').addEventListener('click', () => openChart(!state.chartOpen));
$('chart-close').addEventListener('click', () => openChart(false));
slider('ref-opacity', v => {
  refMat.opacity = v / 100;
  refMat.transparent = v < 100;
  refMat.depthWrite = v >= 100;
  refMat.needsUpdate = true;
  view.invalidate();
}, v => v + ' %');

/* Der Umschalter „Kanäle / nur Linie" merkt sich seine Stellung im
   Knopf; beim Beispielwechsel muss sie von Hand nachgezogen werden. */

/* ── Dateien ─────────────────────────────────────────────────── */

const fileName = () => safeName(state.name || 'anguss');

/* Zwei STL-Dateien: der Anguss — ein geschlossener Körper, am Mantel
   des Pressrests beschnitten (js/runner/sweep.js) — und der Pressrest
   als Zylinder. Beide berühren sich am Mantel, keiner steckt im
   anderen; im CAD sind es zwei Körper, die man vereinigen kann oder
   nicht. Der Browser fragt beim ersten Mal, ob die Seite mehrere
   Dateien laden darf. */
$('stl-save').addEventListener('click', () => {
  const runner = sweepRunner(state.net);
  if (!runner.length) return;
  download(new Blob([writeSTL(runner, 'DieLogic Anguss')], { type: 'model/stl' }),
    fileName() + '-anguss.stl');
  download(new Blob([writeSTL(biscuitMesh(state.graph.biscuit), 'DieLogic Pressrest')], { type: 'model/stl' }),
    fileName() + '-pressrest.stl');
});

$('json-save').addEventListener('click', () => {
  const text = JSON.stringify(G.toJSON(state.graph), null, 1);
  download(new Blob([text], { type: 'application/json' }), fileName() + '.json');
});

$('json-btn').addEventListener('click', () => $('json-input').click());
$('json-input').addEventListener('change', e => { if (e.target.files[0]) readAny(e.target.files[0]); });
$('ref-btn').addEventListener('click', () => $('ref-input').click());
$('ref-input').addEventListener('change', e => { if (e.target.files[0]) readAny(e.target.files[0]); });
$('ref-clear').addEventListener('click', () => {
  cancelAim();
  aim.hide();
  refMesh.visible = false;
  view.invalidate();
  refMesh.geometry.dispose();
  refMesh.geometry = new T.BufferGeometry();
  $('ref-file').classList.add('hidden');
  $('ref-input').value = '';
  syncSelection();
});

/* Was für eine Datei das ist, entscheidet der INHALT, nicht die Endung:
   eine geschweifte Klammer heißt Angussdatei, alles andere ist
   Geometrie. */
async function readAny(file) {
  try {
    const buf = await readBuffer(file);
    if (looksLikeJSON(buf)) loadGraphJSON(new TextDecoder().decode(buf), file.name);
    else loadReference(buf, file.name);
  } catch (err) {
    $('graph-warn').textContent = 'Die Datei „' + file.name + '" konnte nicht gelesen werden: ' + err.message;
    console.error(err);
  }
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
  adoptReference(isGLB(buffer) ? readGLB(buffer) : parseSTL(buffer), name);
}

function adoptReference(tris, name) {
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
  syncSelection();
  view.invalidate();
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

/* Ein Referenzteil aus assets/ in die Lage des Beispiels bringen: Drehung
   um x (Grad), dann Versatz. Die Beispielteile liegen mit der Trennebene
   bei z = 0; hier liegt sie bei y = 0. */
function placeTris(tris, ref) {
  const out = Float64Array.from(tris);
  const a = (ref.rotX || 0) * Math.PI / 180;
  const c = Math.round(Math.cos(a) * 1e12) / 1e12, s = Math.round(Math.sin(a) * 1e12) / 1e12;
  const t = ref.translate || [0, 0, 0];
  for (let i = 0; i < out.length; i += 3) {
    const y = out[i + 1], z = out[i + 2];
    out[i] += t[0];
    out[i + 1] = y * c - z * s + t[1];
    out[i + 2] = y * s + z * c + t[2];
  }
  return out;
}

/* Das Referenzteil eines Beispiels kommt asynchron aus assets/parts/ —
   so wie die Bauteilseiten ihre Beispielteile holen. Bis dahin steht
   der Name in der Dateizeile; state.refPending hält das Versprechen. */
function loadDemoReference(ref) {
  $('ref-note').textContent = ref.name + ' … wird geladen';
  $('ref-file').classList.remove('hidden');
  state.refPending = fetch(ref.file).then(async res => {
    if (!res.ok) throw new Error(ref.file + ' fehlt');
    adoptReference(placeTris(readGLB(await res.arrayBuffer()), ref), ref.name);
    /* Mit dem Gussvolumen des Teils werden die Anschnitte breiter — die
       Kanäle ziehen nach, wie beim Knopf „Auslegung". */
    autoTaper(state.graph, state.proc, state.sizing);
    rebuild();
    syncSelection();
    view.fitTo(group);
  }).catch(err => {
    $('ref-note').textContent = ref.name + ' konnte nicht geladen werden: ' + err.message;
    console.error(err);
  });
  return state.refPending;
}

function pickDemo(id) {
  const d = DEMOS.find(x => x.id === id) || DEMOS[0];
  $('demo-select').value = d.id;
  state.graph = d.build();
  state.name = d.label;
  $('graph-note').textContent = '';
  adoptGraph();
  /* Ein Beispiel ohne Referenzteil lässt ein geladenes stehen. */
  if (d.ref) loadDemoReference(d.ref);
}
$('demo-select').addEventListener('change', e => pickDemo(e.target.value));

/** Nach dem Laden eines anderen Systems alle Anzeigen nachziehen. */
function adoptGraph() {
  const g = state.graph;
  $('draft').value = String(g.draft);
  $('draft-val').textContent = fmt(g.draft) + '°';
  $('radius').value = fmt(g.radius, 2);
  $('branch-r').value = fmt(g.branchR, 2);
  $('tension').value = String(Math.round(g.tension * 100));
  $('tension-val').textContent = fmt(g.tension, 2);
  $('step').value = fmt(g.step, 2);
  $('gate-h').value = fmt(g.gateH, 2);
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
  state, view, editor, rebuild, adoptGraph, pickDemo, openChart, startAim,
  runnerMesh, biscMesh, refMesh, group
};
window.__anguss = __viewer;
