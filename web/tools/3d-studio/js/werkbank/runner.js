/* Schritt 2 — Anguss: das Angusssystem am Bauteil.

   Die Portierung des Angussdesigners (js/runner/app.js) in die Werkbank.
   Dieselbe Kette bei jeder Änderung — Graph → Anschnittbreiten →
   Abtasten → Strömung → Anzeige —, dieselben Griffe (js/runner/editor.js),
   dasselbe Flussschema und dieselben Prüfregeln. Anders ist der Rahmen:
   die Werkbank arbeitet im Bauteilsystem (Trennebene z = 0), und das
   Referenzbauteil ist das Bauteil der Werkbank, nicht eine eigene Datei.

   Neu ist der VORSCHLAG (js/werkbank/propose.js): sobald ein Bauteil
   geladen ist, liegt ein Angusssystem davor, die Anschnitte an die Wand
   gebunden — der Ausgangspunkt, von dem aus man zieht und bemaßt statt
   bei null anzufangen. Das Gussvolumen kommt aus Bauteil und Überläufen,
   die Anschnitte gehen als Mündungen in die Füllung (Schritt 3) und als
   Fläche, Volumen und Pressrest in die Auslegung (Schritt 6). */

import * as T from 'three';
import { $, fmt, fmtPlain, facts, segButtons, segButtonSet, slider, numberInput } from '../ui/controls.js';
import { writeSTL } from '../part/stlio.js';
import { concat } from '../solids.js';
import * as G from '../runner/graph.js';
import { sampleNetwork } from '../runner/curve.js';
import { sweepRunner, biscuitMesh, centerlines } from '../runner/sweep.js';
import * as F from '../runner/flow.js';
import { checkRules } from '../runner/rules.js';
import { autoTaper, DEFAULT_SIZING } from '../runner/sizing.js';
import { flowChart } from '../runner/chart.js';
import { createEditor, SELECTED_RING, FOLLOWER_COLOR } from '../runner/editor.js';
import { rotate, norm, cross, dot, sub, add } from '../runner/vec.js';
import { proposeRunner, gateRays } from './propose.js';
import { shotTimeline, flowOnCurve } from '../runner/shottime.js';
import { download, safeName, dirText } from '../ui/common.js';

const SUBTITLE = 'Anguss: Pressrest, Laufkanäle und Anschnitte als Graph, vorgeschlagen aus dem Bauteil, gebunden an seine Wand.';
const STATUS = '<b>Punkt</b> ziehen: in der Arbeitsebene &nbsp;·&nbsp; <b>Alt</b>: aus ihr heraus &nbsp;·&nbsp; '
  + '<b>Pfeil</b> am Anschnitt: Mündung ans Bauteil &nbsp;·&nbsp; <b>Leer</b>: drehen &nbsp;·&nbsp; <b>rechts</b>: verschieben &nbsp;·&nbsp; <b>Rad</b>: zoomen';

export function createRunnerStage(ctx) {
  const { view } = ctx;
  const state = {
    graph: G.emptyGraph(), net: null, flow: null, rules: [],
    proc: { ...F.DEFAULT_PROCESS },
    sizing: { ...DEFAULT_SIZING },
    show: 'sweep', volAuto: true, gatesWanted: 2,
    /* Ankunft nach der DieLogic-Schusskurve (js/runner/shottime.js):
       timeline ist die Kurve für dieses Modell, flowShown die Strömung
       mit ihren Zeiten — oder die mit konstantem Strom, wenn aus. */
    onCurve: true, timeline: null, flowShown: null,
    chartOpen: false, active: false, ready: false, name: ''
  };

  /* ── Szene ────────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const runnerMat = new T.MeshStandardMaterial({
    color: 0x008c82, roughness: 0.52, metalness: 0.04, side: T.DoubleSide, flatShading: true
  });
  const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
  group.add(runnerMesh);
  const biscMat = new T.MeshStandardMaterial({
    color: 0x93a6b0, roughness: 0.6, metalness: 0.06, side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
  group.add(biscMesh);
  const lineMat = new T.LineBasicMaterial({ color: 0x002733, transparent: true, opacity: 0.55 });
  const lineGroup = new T.Group();
  group.add(lineGroup);

  const editor = createEditor({
    view,
    getGraph: () => state.graph,
    getRefMesh: () => ctx.part.mesh,
    getGateDir: id => {
      const e = state.net && state.net.edges.find(x => x.toId === id);
      return e && e.sections.length ? e.sections[e.sections.length - 1].t : null;
    },
    onAim: id => startAim(id),
    onSelect: () => { cancelAim(); syncSelection(); },
    onChange: what => {
      if (what === 'drag') { rebuild('drag'); return; }
      rebuild();
      if (what === 'drop') syncSelection();
    }
  });
  editor.setEnabled(false);
  editor.group.visible = false;

  /* ── Kette: Graph → Anzeige ───────────────────────────────── */
  function rebuild(mode) {
    const g = state.graph;
    if (!g.rootId) { setEmpty(); return; }
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
    ctx.markDone('anguss', true);
    view.invalidate();
    ctx.emit('runner', state);
  }

  function setEmpty() {
    state.net = null; state.flow = null; state.flowShown = null; state.timeline = null; state.rules = [];
    facts('an-shot-facts', []);
    $('an-shot-warn').textContent = '';
    runnerMesh.visible = biscMesh.visible = false;
    for (const child of lineGroup.children.slice()) { child.geometry.dispose(); lineGroup.remove(child); }
    editor.refresh();
    $('an-rules').innerHTML = '';
    facts('an-chart-facts', []);
    ctx.markDone('anguss', false);
    view.invalidate();
    ctx.emit('runner', state);
  }

  function updateRunner() {
    const tris = sweepRunner(state.net);
    const attr = runnerMesh.geometry.getAttribute('position');
    if (attr && attr.array.length === tris.length) {
      attr.array.set(tris);
      attr.needsUpdate = true;
      runnerMesh.geometry.boundingSphere = null;
    } else {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3));
      runnerMesh.geometry.dispose();
      runnerMesh.geometry = geo;
    }
    applyVisibility();
  }

  function updateLines() {
    for (const child of lineGroup.children.slice()) { child.geometry.dispose(); lineGroup.remove(child); }
    for (const pts of centerlines(state.net)) {
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(pts, 3));
      lineGroup.add(new T.Line(geo, lineMat));
    }
  }

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
    const has = !!state.net;
    runnerMesh.visible = has && state.show === 'sweep';
    biscMesh.visible = has && $('an-show-biscuit').checked;
    const handles = $('an-show-line').checked;
    lineGroup.visible = has && handles;
    editor.group.visible = state.active && has && handles;
    editor.setEnabled(state.active && handles);
    view.invalidate();
  }

  /* ── Die Schusskurve unter dem Anguss ─────────────────────── */
  /* Die Massen für die Kurve kommen aus dem Modell: Bauteil, dieser
     Anguss, die Überläufe, dieser Pressrest. Maschine, Kammer, Legierung
     und Thermik aus dem Auslegungszustand. */
  function modelVolumes() {
    const b = state.graph.biscuit;
    return {
      part: ctx.part.model ? Math.abs(ctx.part.model.volume) : NaN,
      runner: state.flow ? state.flow.runnerVolume : NaN,
      overflow: ctx.stages.ueberlauf ? ctx.stages.ueberlauf.volume() : NaN,
      biscuit: state.graph.rootId ? Math.PI * b.d * b.d / 4 * b.t : NaN
    };
  }
  function updateTimeline() {
    state.timeline = null;
    state.flowShown = state.flow;
    if (!state.onCurve || !state.flow) return;
    const d = ctx.stages.auslegung;
    const values = d && d.values();
    if (!values) return;
    const tl = shotTimeline(values, modelVolumes());
    if (tl.error) { state.timeline = { error: tl.error }; return; }
    state.timeline = tl;
    state.flowShown = flowOnCurve(state.flow, tl);
  }
  /* Der Prozess für die Prüfregeln: die Spanne der Ankunft wird an der
     Füllzeit gemessen — auf der Kurve an ihrer eigenen. */
  const shownProc = () => (state.flowShown && state.flowShown.onCurve
    ? { ...state.proc, fillTime: state.flowShown.fillTime } : state.proc);

  function updateShotFacts() {
    const tl = state.timeline, fl = state.flowShown;
    const warn = $('an-shot-warn');
    if (!state.onCurve) { facts('an-shot-facts', []); warn.textContent = ''; return; }
    if (!tl) { facts('an-shot-facts', []); warn.textContent = 'Ohne Bauteil und Anguss gibt es keine Kurve.'; return; }
    if (tl.error) { facts('an-shot-facts', []); warn.textContent = 'Keine DieLogic-Kurve: ' + tl.error + ' Die Ankunft steht mit konstantem Strom.'; return; }
    const sh = tl.shot;
    const rows = [
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
    facts('an-shot-facts', rows);
    warn.textContent = tl.warn || '';
  }

  /* ── Kennzahlen, Regeln, Schema ───────────────────────────── */
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
    if (gates.length && Number.isFinite(fl.tFirst)) {
      rows.push(['Ankunft', (gates.length > 1
        ? fmt(fl.tFirst * 1000) + '–' + fmt(fl.tLast * 1000) + ' ms'
        : fmt(fl.tFirst * 1000) + ' ms') + (fl.onCurve ? ' ab Kolbenstart' : ' bei konstantem Strom')]);
    }
    if (fl.onCurve && state.timeline) {
      rows.push(['Schusskurve', 'DieLogic-Kurve · Kammer voll bei ' + fmt(state.timeline.tFull * 1000, 0) + ' ms · v₂ '
        + fmt(state.timeline.v2) + ' m/s' + (fl.unreached.length ? ' · endet vor ' + fl.unreached.join(', ') : '')]);
    }
    facts('an-chart-facts', rows);
    updateShotFacts();
  }

  function updateRules() {
    $('an-rules').innerHTML = state.rules.map(r =>
      '<div class="rule ' + r.level + '"><b>' + r.title + '</b><span>' + r.text + '</span></div>').join('');
  }

  function updateChart() {
    if (!state.chartOpen || !state.net) return;
    $('an-chart-body').innerHTML = flowChart(state.graph, state.net, state.flowShown || state.flow, { width: 900 });
  }

  function openChart(on) {
    state.chartOpen = on;
    $('an-chart-panel').classList.toggle('on', on);
    $('an-chart-btn').classList.toggle('active', on);
    if (on) { cancelAim(); updateChart(); }
  }

  /* ── Auswahl ──────────────────────────────────────────────── */
  function selectionLabel(g, id) {
    const n = id && g.nodes[id];
    if (!n) return null;
    const meta = G.TYPES[n.type];
    return '<span class="dot" style="background:' + meta.color + '"></span>'
      + meta.label + ' <code>' + id + '</code>'
      + (G.isFollower(g, id) ? ' <em>(gespiegelt: die andere Seite bearbeiten)</em>'
        : n.aim ? ' <em class="pinned">ans Bauteil gebunden</em>' : '');
  }

  function legendHTML() {
    const rows = Object.values(G.TYPES).map(t =>
      '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>');
    rows.push('<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>');
    rows.push('<div class="lg-row"><span class="dot" style="background:' + FOLLOWER_COLOR + '"></span>gespiegelt (folgt)</div>');
    return '<div class="pt-menu-title">Punktarten</div>' + rows.join('');
  }

  /* ── Mündung ans Bauteil ──────────────────────────────────── */
  function cancelAim() {
    if (editor.cancelAim()) ctx.aim.hide();
  }
  function startAim(id) {
    const n = id && state.graph.nodes[id];
    if (!n || n.type !== 'gate' || G.isFollower(state.graph, id)) return;
    if (!ctx.part.model) { ctx.aim.note('Zuerst ein Bauteil laden (Schritt 1). Dann zeigt der Klick auf den Pfeil, wo der Anschnitt münden soll.'); return; }
    ctx.aim.show(true, 'Mündung ans Bauteil: eine Stelle auf dem Bauteil anklicken. Ziehen dreht die Ansicht, Esc bricht ab.');
    ctx.aim.onCancel = cancelAim;
    editor.armAim({
      plane: () => {
        const gn = state.graph.nodes[id];
        return gn ? { origin: gn.pos, normal: G.planeNormal(state.graph, gn) } : null;
      },
      onHit: hit => {
        ctx.aim.hide();
        G.aimAt(state.graph, id, hit.point, hit.dir);
        rebuild();
        syncSelection();
      },
      onMiss: () => ctx.aim.miss('Daneben: die Stelle muss auf dem Bauteil liegen.', () => editor.aiming)
    });
  }

  /* Die Anschnitte des Vorschlags mit dem Strahl an die Wand binden —
     dasselbe wie der Klick auf den Pfeil, nur ohne Maus. */
  const ray = new T.Raycaster();
  const nmat = new T.Matrix3();
  function aimGatesAtPart() {
    const mesh = ctx.part.mesh, model = ctx.part.model;
    if (!model || !mesh.geometry.attributes.position) return 0;
    mesh.updateMatrixWorld(true);
    let bound = 0;
    for (const r of gateRays(state.graph, model)) {
      ray.set(new T.Vector3(...r.origin), new T.Vector3(...r.dir));
      ray.far = 400;
      const hits = ray.intersectObject(mesh, false);
      const h = hits.find(x => x.face);
      if (!h) continue;
      const n = h.face.normal.clone().applyMatrix3(nmat.getNormalMatrix(mesh.matrixWorld)).normalize();
      if (n.dot(ray.ray.direction) < 0) n.negate();
      /* An einer aufrechten Wand die Richtung in die Trennebene legen — so
         wie js/handles.js es beim Klick tut. */
      const gn = state.graph.nodes[r.id];
      const pn = new T.Vector3(...G.planeNormal(state.graph, gn)).normalize();
      const off = n.dot(pn);
      if (Math.abs(off) <= Math.sin(30 * Math.PI / 180)) n.addScaledVector(pn, -off).normalize();
      /* Der Strahl lief einen Hauch neben der Trennebene; die Mündung
         gehört in die Arbeitsebene des Anschnitts — dort, wo der Klick
         auf den Pfeil sie auch hinlegt (moveInPlane). */
      const p = h.point.clone();
      p.addScaledVector(pn, -pn.dot(p.clone().sub(new T.Vector3(...gn.pos))));
      G.aimAt(state.graph, r.id, p.toArray(), n.toArray());
      bound++;
    }
    return bound;
  }

  /** Ein neues Angusssystem aus dem Bauteil. */
  function propose(gates = state.gatesWanted, fit = true) {
    const model = ctx.part.model;
    if (!model) return;
    state.gatesWanted = gates;
    $('an-propose').value = String(gates);
    cancelAim();
    syncVolume(false);
    state.graph = proposeRunner(model, { gates, proc: state.proc, sizing: state.sizing });
    state.name = ctx.part.name;
    const bound = aimGatesAtPart();
    autoTaper(state.graph, state.proc, state.sizing);
    $('an-warn').textContent = bound ? '' : 'Kein Anschnitt hat die Wand bei −Y getroffen: die Mündungen über den Pfeil von Hand ans Bauteil setzen.';
    adoptGraph();
    if (fit) fitAll();
  }

  /** Bauteil und Anguss zusammen ins Bild. */
  function fitAll() {
    const box = new T.Box3().setFromObject(ctx.part.mesh);
    if (runnerMesh.visible) box.expandByObject(runnerMesh);
    if (biscMesh.visible) box.expandByObject(biscMesh);
    if (!box.isEmpty()) view.fitTo(box, 1.2);
  }

  function syncSelection() {
    const g = state.graph;
    const id = editor.selected;
    const n = id && g.nodes[id];
    $('an-sel-block').classList.toggle('disabled', !n || !state.net);
    const label = selectionLabel(g, id);
    $('an-pt-sel').className = 'pt-sel' + (label ? '' : ' empty');
    if (!n || !state.net) {
      $('an-pt-sel').textContent = 'Kein Punkt gewählt';
      facts('an-sel-facts', []);
      updatePointMenu();
      return;
    }
    $('an-pt-sel').innerHTML = label;
    for (const [k, i] of [['an-sel-x', 0], ['an-sel-y', 1], ['an-sel-z', 2]]) $(k).value = fmt(n.pos[i], 1);
    $('an-sel-w').value = fmt(n.w, 2);
    $('an-sel-h').value = fmt(n.h, 2);
    $('an-sel-roll').value = String(n.tilt[0]);
    $('an-sel-roll-val').textContent = fmt(n.tilt[0], 0) + '°';
    $('an-sel-pitch').value = String(n.tilt[1]);
    $('an-sel-pitch-val').textContent = fmt(n.tilt[1], 0) + '°';

    const isRoot = !n.parent;
    $('an-bisc-block').classList.toggle('hidden', !isRoot);
    $('an-plane-block').classList.toggle('hidden', isRoot);
    if (isRoot) {
      $('an-bisc-d').value = fmt(g.biscuit.d, 2);
      $('an-bisc-t').value = fmt(g.biscuit.t, 2);
      segButtonSet('an-axis-seg', g.biscuit.axis);
    }
    const isBranch = n.type === 'branch' || n.type === 'mirror';
    $('an-branch-block').classList.toggle('hidden', !isBranch);
    if (isBranch) {
      $('an-sel-ratio').value = String(Math.round((n.ratio || 0.5) * 100));
      $('an-sel-ratio-val').textContent = fmt(n.ratio * 100, 0) + ':' + fmt((1 - n.ratio) * 100, 0);
      $('an-sel-mirror').checked = !!n.mirror;
      $('an-sel-mirror').disabled = n.type === 'mirror';
    }
    const isGate = n.type === 'gate';
    $('an-gate-block').classList.toggle('hidden', !isGate);
    if (isGate) {
      $('an-sel-gh').value = fmt(n.gate.h, 2);
      $('an-sel-gh').classList.toggle('inherited', !!n.gate.hAuto);
      $('an-sel-glen').value = fmt(n.gate.len, 2);
      $('an-sel-gw').value = fmt(n.gate.w, 2);
      $('an-sel-gauto').checked = !!n.gate.auto;
      $('an-sel-gw').disabled = !!n.gate.auto;
      $('an-sel-gtrans').value = n.gate.transition;
    } else cancelAim();

    const na = state.net.nodeArea[id];
    const rows = [['Querschnitt', fmt(na.area, 0) + ' mm²'], ['hydr. Ø', fmt(na.dh) + ' mm']];
    if (isRoot) {
      const b = g.biscuit;
      rows.unshift(['Pressrest-Volumen', fmt(Math.PI * b.d * b.d / 4 * b.t / 1000) + ' cm³']);
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
      const e = state.net.edges.find(x => x.toId === id);
      const t = e && e.sections.length ? e.sections[e.sections.length - 1].t : null;
      if (t) {
        const tilt = G.aimTilt(g, n);
        rows.push(['Mündung', dirText(t) + (n.aim
          ? ' · gebunden' + (tilt >= 1 ? ', ' + fmt(tilt, 0) + '° aus der Ebene' : '')
          : ' · folgt dem Kanal')]);
      }
    }
    facts('an-sel-facts', rows);
    updatePointMenu();
  }

  function updatePointMenu() {
    const g = state.graph;
    const id = editor.selected;
    const n = id && g.nodes[id];
    const follower = n && G.isFollower(g, id);
    const canAdd = !!n && n.type !== 'gate' && !follower;
    for (const b of ['an-add-point', 'an-add-branch', 'an-add-mirror', 'an-add-gate']) $(b).disabled = !canAdd;
    $('an-insert-point').disabled = !n || !n.parent || follower;
    $('an-del-node').disabled = !n || !n.parent || follower;
  }

  /* ── Bedienung: Auswahlfelder ─────────────────────────────── */
  const sel = () => (editor.selected ? state.graph.nodes[editor.selected] : null);

  function editNode(fn) {
    const n = sel();
    if (!n || G.isFollower(state.graph, n.id)) return false;
    fn(n);
    G.syncFrom(state.graph, n.id);
    rebuild();
    return true;
  }

  for (const [id, axis] of [['an-sel-x', 0], ['an-sel-y', 1], ['an-sel-z', 2]]) {
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
  numberInput('an-sel-w', v => {
    const n = sel();
    if (!n) return v;
    const w = Math.max(1, Math.min(state.graph.biscuit.d, v));
    editNode(x => { x.w = w; });
    return w;
  });
  numberInput('an-sel-h', v => {
    const n = sel();
    if (!n) return v;
    const h = Math.max(0.4, Math.min(200, v));
    editNode(x => { x.h = h; });
    return h;
  });
  slider('an-sel-roll', v => { editNode(n => { n.tilt = [v, n.tilt[1]]; }); }, v => fmt(v, 0) + '°');
  slider('an-sel-pitch', v => { editNode(n => { n.tilt = [n.tilt[0], v]; }); }, v => fmt(v, 0) + '°');
  slider('an-sel-ratio', v => { editNode(n => { n.ratio = v / 100; }); }, v => fmt(v, 0) + ':' + fmt(100 - v, 0));
  $('an-sel-mirror').addEventListener('change', e => { editNode(n => { n.mirror = e.target.checked; }); });

  $('an-sel-gtrans').innerHTML = Object.entries(G.TRANSITIONS)
    .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
  $('an-sel-gtrans').addEventListener('change', e => editNode(n => { n.gate.transition = e.target.value; }));
  numberInput('an-sel-gh', v => {
    const h = Math.max(0.3, Math.min(30, v));
    editNode(n => { n.gate.h = h; n.gate.hAuto = Math.abs(h - state.graph.gateH) < 1e-9; });
    syncSelection();
    return h;
  });
  numberInput('an-sel-glen', v => {
    const l = Math.max(0, Math.min(60, v));
    editNode(n => { n.gate.len = l; });
    return l;
  });
  numberInput('an-sel-gw', v => {
    const w = Math.max(1, Math.min(600, v));
    editNode(n => { n.gate.w = w; });
    return w;
  });
  $('an-sel-gauto').addEventListener('change', e => {
    $('an-sel-gw').disabled = e.target.checked;
    editNode(n => { n.gate.auto = e.target.checked; });
    syncSelection();
  });

  const addOf = type => () => {
    const n = sel();
    if (!n) return;
    const made = G.addChild(state.graph, n.id, type);
    rebuild();
    if (made) editor.select(made.id);
  };
  $('an-add-point').addEventListener('click', addOf('point'));
  $('an-add-branch').addEventListener('click', addOf('branch'));
  $('an-add-mirror').addEventListener('click', addOf('mirror'));
  $('an-add-gate').addEventListener('click', addOf('gate'));
  $('an-insert-point').addEventListener('click', () => {
    const n = sel();
    if (!n) return;
    const made = G.insertBefore(state.graph, n.id, 'point');
    rebuild();
    if (made) editor.select(made.id);
  });
  $('an-del-node').addEventListener('click', () => {
    const n = sel();
    if (!n || !n.parent) return;
    const parent = n.parent;
    G.removeNode(state.graph, n.id);
    rebuild();
    editor.select(state.graph.nodes[parent] ? parent : state.graph.rootId);
  });

  /* ── Pressrest ────────────────────────────────────────────── */
  numberInput('an-bisc-d', v => {
    const d = Math.max(10, Math.min(400, v));
    state.graph.biscuit.d = d;
    rebuild();
    return d;
  });
  numberInput('an-bisc-t', v => {
    const t = Math.max(1, Math.min(300, v));
    state.graph.biscuit.t = t;
    rebuild();
    return t;
  });
  segButtons('an-axis-seg', value => {
    const g = state.graph;
    if (!g.rootId) return;
    const from = G.AXES[g.biscuit.axis], to = G.AXES[value];
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
  });

  /* ── Kanalform ────────────────────────────────────────────── */
  slider('an-draft', v => { state.graph.draft = v; rebuild(); }, v => fmt(v) + '°');
  numberInput('an-gate-h', v => {
    const h = Math.max(0.3, Math.min(30, v));
    G.setGateHeight(state.graph, h);
    rebuild();
    syncSelection();
    return h;
  });
  numberInput('an-radius', v => {
    const r = Math.max(0, Math.min(20, v));
    state.graph.radius = r;
    rebuild();
    return r;
  });
  slider('an-tension', v => { state.graph.tension = v / 100; rebuild(); }, v => fmt(v / 100, 2));
  numberInput('an-step', v => {
    const s = Math.max(0.2, Math.min(10, v));
    state.graph.step = s;
    rebuild();
    return s;
  });
  slider('an-taper', v => { state.sizing.taper = v / 100; }, v => fmt(v, 0) + ' %');
  slider('an-aspect', v => { state.sizing.aspect = v / 100; }, v => fmt(v / 100, 2));
  $('an-auto-taper').addEventListener('click', () => {
    if (!state.graph.rootId) return;
    autoTaper(state.graph, state.proc, state.sizing);
    rebuild();
    syncSelection();
  });

  /* ── Prozess ──────────────────────────────────────────────── */
  $('an-alloy').innerHTML = Object.entries(F.ALLOYS)
    .map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
  $('an-alloy').value = state.proc.alloy;
  $('an-alloy').addEventListener('change', e => { state.proc.alloy = e.target.value; rebuild(); });
  numberInput('an-vol', v => {
    state.proc.volume = Math.max(1, Math.min(1e5, v));
    state.volAuto = false;
    $('an-vol-auto').checked = false;
    rebuild();
    return state.proc.volume;
  });
  $('an-vol-auto').addEventListener('change', e => { state.volAuto = e.target.checked; syncVolume(true); });
  numberInput('an-tfill', v => {
    state.proc.fillTime = Math.max(1, Math.min(5000, v));
    rebuild();
    return state.proc.fillTime;
  });
  numberInput('an-vgate', v => {
    state.proc.vGate = Math.max(1, Math.min(200, v));
    rebuild();
    return state.proc.vGate;
  });
  slider('an-cbranch', v => { state.proc.cBranch = v / 100; rebuild(); }, v => fmt(v / 100, 2));
  $('an-shot-time').addEventListener('change', e => {
    state.onCurve = e.target.checked;
    if (state.graph.rootId) { rebuild(); syncSelection(); }
  });

  /* Das Gussvolumen aus Bauteil und Überläufen — ohne Tippen. */
  function castVolumeCm3() {
    const part = ctx.part.model ? Math.abs(ctx.part.model.volume) : 0;
    const vents = ctx.stages.ueberlauf ? ctx.stages.ueberlauf.volume() : 0;
    return (part + vents) / 1000;
  }
  function syncVolume(doRebuild) {
    if (!state.volAuto) return;
    const v = Math.round(castVolumeCm3() * 10) / 10;
    if (v < 0.01) return;
    if (Math.abs(v - state.proc.volume) < 1e-9) return;
    state.proc.volume = v;
    $('an-vol').value = fmtPlain(v, 1);
    if (doRebuild && state.graph.rootId) rebuild();
  }

  /* Prozess aus der Auslegung: Legierung nach der Dichte, Füllzeit aus der
     Schusskurve, Zielgeschwindigkeit aus der Mitte des Zielbands. */
  $('an-from-design').addEventListener('click', () => {
    const d = ctx.stages.auslegung && ctx.stages.auslegung.designValues();
    if (!d) return;
    const rho = d.values.density;
    let best = 'al', dist = Infinity;
    for (const [k, a] of Object.entries(F.ALLOYS)) {
      const dd = Math.abs(a.rho - rho);
      if (dd < dist) { dist = dd; best = k; }
    }
    state.proc.alloy = best;
    $('an-alloy').value = best;
    /* Die Füllzeit: von der DieLogic-Kurve dieses Modells, sonst von der
       Kurve des Dashboards. */
    const shot = state.timeline && !state.timeline.error ? state.timeline.shot : d.shot;
    if (shot && !shot.error && Number.isFinite(shot.fill) && shot.fill > 0) {
      state.proc.fillTime = Math.round(shot.fill * 10) / 10;
      $('an-tfill').value = fmtPlain(state.proc.fillTime, 1);
    }
    if (Number.isFinite(d.values.gateMin) && Number.isFinite(d.values.gateMax)) {
      state.proc.vGate = Math.round((d.values.gateMin + d.values.gateMax) / 2);
      $('an-vgate').value = fmtPlain(state.proc.vGate, 0);
    }
    rebuild();
    syncSelection();
  });

  /* ── Darstellung ──────────────────────────────────────────── */
  segButtons('an-show-seg', v => { state.show = v; applyVisibility(); });
  for (const id of ['an-show-biscuit', 'an-show-line']) $(id).addEventListener('change', applyVisibility);
  $('an-chart-btn').addEventListener('click', () => openChart(!state.chartOpen));
  $('an-chart-close').addEventListener('click', () => openChart(false));
  slider('an-ref-opacity', v => { if (state.active) ctx.part.applyOpacity(v / 100); }, v => v + ' %');

  /* ── Vorschlag ────────────────────────────────────────────── */
  $('an-propose').addEventListener('change', e => { state.gatesWanted = +e.target.value || 2; });
  $('an-propose-btn').addEventListener('click', () => propose(+$('an-propose').value || 2, false));

  /* ── Dateien ──────────────────────────────────────────────── */
  const fileName = () => safeName(state.name || ctx.part.name) + '-anguss';
  $('an-stl-save').addEventListener('click', () => {
    if (!state.net) return;
    const parts = [sweepRunner(state.net)];
    if ($('an-show-biscuit').checked) parts.push(biscuitMesh(state.graph.biscuit));
    const tris = concat(parts);
    if (!tris.length) return;
    download(new Blob([writeSTL(tris, 'DieLogic Angusssystem')], { type: 'model/stl' }), fileName() + '.stl');
  });
  $('an-json-save').addEventListener('click', () => {
    if (!state.graph.rootId) return;
    download(new Blob([JSON.stringify(G.toJSON(state.graph), null, 1)], { type: 'application/json' }), fileName() + '.json');
  });
  $('an-json-btn').addEventListener('click', () => $('an-json-input').click());
  $('an-json-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) ctx.readAny(f);
    e.target.value = '';
  });

  function loadJSON(obj, name) {
    const g = G.fromJSON(obj);
    state.graph = g;
    state.name = (name || 'anguss').replace(/\.json$/i, '');
    const ax = g.biscuit.axis;
    $('an-warn').textContent = ax === '+z' || ax === '-z' ? ''
      : 'Die Datei liegt im Rahmen des Angussdesigners (Achse ' + ax + '). Die Werkbank erwartet die Trennebene bei z = 0: im Auswahlfeld des Pressrests die Richtung auf −Z stellen und den Pressrest an seinen Ort ziehen.';
    adoptGraph();
  }

  function adoptGraph() {
    const g = state.graph;
    $('an-draft').value = String(g.draft);
    $('an-draft-val').textContent = fmt(g.draft) + '°';
    $('an-radius').value = fmt(g.radius, 2);
    $('an-tension').value = String(Math.round(g.tension * 100));
    $('an-tension-val').textContent = fmt(g.tension, 2);
    $('an-step').value = fmt(g.step, 2);
    $('an-gate-h').value = fmt(g.gateH, 2);
    rebuild();
    editor.select(g.rootId);
    syncSelection();
    state.ready = true;
  }

  /** Die Mündungen für die Füllung: Ort, Mündungsrichtung (nach innen),
      Breite, Höhe, Ist-Anteil je Anschnitt — auch die gespiegelten. */
  function gateMouths() {
    const g = state.graph, net = state.net, fl = state.flow;
    if (!net || !fl) return [];
    const shown = state.flowShown || fl;
    const out = [];
    for (const n of G.allNodes(g)) {
      if (n.type !== 'gate') continue;
      const e = net.edges.find(x => x.toId === n.id);
      const t = e && e.sections.length ? e.sections[e.sections.length - 1].t : G.chordDir(g, n);
      const r = fl.gates.find(x => x.id === n.id);
      const rs = shown.gates.find(x => x.id === n.id);
      out.push({ id: n.id, pos: n.pos.slice(), dir: t.slice(), w: n.gate.w, h: n.gate.h,
        share: r ? r.ist : 1 / Math.max(1, fl.gates.length), bound: !!n.aim || G.isFollower(g, n.id),
        /* Ankunft ab Kolbenstart auf der Schusskurve — NaN, wenn die Kurve
           vorher endet; ohne Kurve gibt es keine Zeit. */
        tArrive: shown.onCurve && rs ? rs.tArrive : NaN });
    }
    return out;
  }

  /** Die Schusskurve unter diesem Anguss — für die Uhr der Füllung. */
  function curve() {
    const on = !!(state.flowShown && state.flowShown.onCurve);
    return { onCurve: on, timeline: on ? state.timeline : null };
  }

  /** Gussvolumen in mm³ — Anguss und Pressrest, für die Auslegung. */
  function volumes() {
    const b = state.graph.biscuit;
    return {
      runner: state.flow ? state.flow.runnerVolume : 0,
      biscuit: state.graph.rootId ? Math.PI * b.d * b.d / 4 * b.t : 0
    };
  }

  /* ── Tastatur ─────────────────────────────────────────────── */
  document.addEventListener('keydown', e => {
    if (!state.active || e.key !== 'Escape') return;
    if (state.chartOpen) openChart(false);
    cancelAim();
  });

  /* ── Ereignisse ───────────────────────────────────────────── */
  ctx.on('part', () => { propose(state.gatesWanted, true); });
  ctx.on('vents', () => { syncVolume(true); if (state.graph.rootId && state.onCurve) rebuild(); });
  /* Maschine, Kammer oder Legierung im Auslegungsschritt geändert: die
     Kurve unter dem Anguss ist eine andere. */
  ctx.on('design', () => { if (state.graph.rootId && state.onCurve) { rebuild(); syncSelection(); } });

  return {
    id: 'anguss', state, group, editor,
    enter() {
      state.active = true;
      ctx.subtitle(SUBTITLE);
      ctx.statusHTML(STATUS);
      $('pt-legend').innerHTML = legendHTML();
      $('an-menu').classList.remove('wb-off');
      $('an-chart-btn').classList.remove('wb-off');
      ctx.part.applyOpacity(+$('an-ref-opacity').value / 100);
      applyVisibility();
      syncSelection();
    },
    leave() {
      state.active = false;
      cancelAim();
      openChart(false);
      $('an-menu').classList.add('wb-off');
      $('an-chart-btn').classList.add('wb-off');
      applyVisibility();
      ctx.part.applyOpacity(ctx.part.opacity);
    },
    propose, rebuild, loadJSON, adoptGraph, gateMouths, curve, volumes, startAim, openChart,
    toJSON: () => (state.graph.rootId ? G.toJSON(state.graph) : null),
    procJSON: () => ({ ...state.proc, sizing: { ...state.sizing }, volAuto: state.volAuto, onCurve: state.onCurve }),
    setProc(p) {
      if (!p) return;
      for (const k of ['alloy', 'volume', 'fillTime', 'cBranch', 'vGate']) if (p[k] !== undefined) state.proc[k] = p[k];
      if (p.sizing) Object.assign(state.sizing, p.sizing);
      if (p.volAuto !== undefined) { state.volAuto = !!p.volAuto; $('an-vol-auto').checked = state.volAuto; }
      if (p.onCurve !== undefined) { state.onCurve = !!p.onCurve; $('an-shot-time').checked = state.onCurve; }
      $('an-alloy').value = state.proc.alloy;
      $('an-vol').value = fmtPlain(state.proc.volume, 1);
      $('an-tfill').value = fmtPlain(state.proc.fillTime, 1);
      $('an-vgate').value = fmtPlain(state.proc.vGate, 1);
      $('an-cbranch').value = String(Math.round(state.proc.cBranch * 100));
      $('an-cbranch-val').textContent = fmt(state.proc.cBranch, 2);
    },
    runnerMesh, biscMesh
  };
}
