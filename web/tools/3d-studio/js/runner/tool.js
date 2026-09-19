/* Angussdesigner — das Werkzeug im gemeinsamen Rahmen.

   Der Ablauf ist immer derselbe und immer in dieser Reihenfolge:

     Graph  →  Anschnittbreiten  →  Abtasten  →  Strömung  →  Anzeige

   Alles hängt am Graphen (js/runner/graph.js); nichts wird doppelt
   gehalten. Ein Zug am Griff ändert eine Koordinate, danach läuft die
   ganze Kette neu — Abtasten, Sweep, Strömung und Prüfregeln kosten bei
   einem üblichen System zusammen wenige Millisekunden, also darf das bei
   jedem Mausschritt passieren. Es gibt hier nichts, was auf Knopfdruck
   wartet.

   Was der Rahmen dazugibt: die Modi System · Kanalform · Prozess · Prüfung
   (der Körper und seine Griffe sind der Plan selbst und stehen in jedem
   Modus im Bild), das Anfügen als Chips über dem Viewport, das Bearbeiten
   der Auswahl im Auswahlfeld daneben, Rückgängig, Entwurf und
   „Ungespeichert". Jede abgeschlossene Änderung meldet das Werkzeug dem
   Gastgeber (host.changed): ein Zug am Griff ist EIN Schritt (gemeldet
   beim Loslassen), ein Regler ebenso (coalesce).

   Das Referenzbauteil ist das Bauteil des Gastgebers. Es kommt im
   Bauteilsystem an (Trennebene z = 0) und wird — das NETZ bleibt, wie es
   ist, nur das Mesh bekommt Lage und Drehung — in die Trennebene des
   Angusses gedreht und vor die Anschnitte gestellt (placePart). Der
   Strahl auf das Bauteil (js/handles.js) rechnet mit der Weltmatrix,
   trifft also, was man sieht.

   Die Datei bleibt „dielogic-anguss" Version 1: der Graph. Dazu kommen
   drei Schlüssel, die ältere Leser übergehen — `process` und `sizing`
   (sonst nähme Rückgängig eine Prozessänderung nur halb zurück: die
   Anschnittbreiten hängen an ihr) und `ref`, die Lage des Bauteils. */

import * as T from 'three';
import { facts, slider, numberInput, segButtons, segButtonSet } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import { writeSTL } from '../part/stlio.js';
import { DEMO_PARTS } from '../part/demoparts.js';
import * as G from './graph.js';
import { sampleNetwork } from './curve.js';
import { sweepRunner, biscuitMesh, centerlines } from './sweep.js';
import * as F from './flow.js';
import { checkRules } from './rules.js';
import { autoTaper, DEFAULT_SIZING } from './sizing.js';
import { DEMOS } from './presets.js';
import { flowChart } from './chart.js';
import { createEditor, SELECTED_RING, FOLLOWER_COLOR } from './editor.js';
import { rotate, norm, cross, dot, sub, add } from './vec.js';
import { shotTimeline, flowOnCurve } from './shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { download, safeName, dirText, setTris } from '../ui/common.js';
import { MODES, INSPECTOR, DARSTELLUNG, CHART } from './panel.js';

const HANDLE_HINT = '<b>Punkt</b> ziehen: in der Arbeitsebene · <b>Alt</b>: aus ihr heraus · <b>Pfeil</b> am Anschnitt: Mündung ans Bauteil · <b>Entf</b>: entfernen';
const NEEDS_SEL = 'Zuerst einen Punkt wählen — der neue hängt sich dahinter.';
const IS_FOLLOWER = 'Das ist die gespiegelte Seite — bearbeitet wird die andere.';
const NEEDS_PART = 'Zuerst ein Referenzbauteil laden (oben über den Bauteil-Chip) — dann zeigt der Klick, wo der Anschnitt münden soll.';
const DETAILS = 'Details';

/* Die Grenzen der Prozesswerte — an einer Stelle, weil Felder UND Dateien
   durch sie hindurch müssen. */
const PROC_RANGE = { volume: [1, 1e5], fillTime: [1, 5000], vGate: [1, 200], chamberLen: [50, 3000], cBranch: [0.1, 1.2] };
const within = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));

/* Das Bauteil, das ein Beispiel mitbringt, nennt presets.js als Datei; der
   Gastgeber lädt Beispielteile nach ihrer Kennung. */
const partIdOf = ref => (DEMO_PARTS.find(p => p.file === ref.file) || {}).id || null;

export function createAngussTool(host) {
  const { shell, view } = host;
  const ui = host.ui;
  const state = {
    graph: DEMOS[0].build(),
    net: null, flow: null, rules: [], lines: [],
    proc: { ...F.DEFAULT_PROCESS },
    sizing: { ...DEFAULT_SIZING },
    show: 'sweep',
    /* Ankunft nach der DieLogic-Schusskurve (js/runner/shottime.js): timeline
       ist die Kurve der Auslegung für dieses System, flowShown die Strömung
       mit ihren Zeiten ab Kolbenstart — oder die mit konstantem Strom, wenn
       aus. flowView ist dieselbe Strömung mit den Zeiten AB „KAMMER VOLL":
       das lesen Auswahlfeld, Schema und Prüfregeln. */
    onCurve: true, timeline: null, flowShown: null, flowView: null,
    name: DEMOS[0].label, preset: DEMOS[0].id, ready: false,
    chartOpen: false, openGroup: '',
    /* Lage des Referenzbauteils: { key, quat, pos } — oder null ohne Bauteil. */
    place: null,
    refPending: null
  };
  let wired = false, hinted = false, dragged = false;

  /* ── Szene ───────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);

  /* Fast ohne Metallanteil: ohne Umgebungskarte hat ein metallisches
     Material nichts zu spiegeln — es wird nur dunkel, wo kein Licht
     hinfällt. flatShading lässt den Shader die Flächennormale selbst
     ableiten: bei einer Dreieckssuppe ohne geteilte Ecken lieferte
     computeVertexNormals ohnehin nur die Flächennormale — nur eben als
     2,2 MB großes Attribut, das bei jedem Mauszug neu gerechnet wurde. */
  const runnerMat = new T.MeshStandardMaterial({ color: 0x008c82, roughness: 0.52, metalness: 0.04, side: T.DoubleSide, flatShading: true });
  const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
  group.add(runnerMesh);

  /* Deckend: der Pressrest ist ein Körper wie die Kanäle, kein Hinweis. Der
     erste Kanal läuft durch ihn hindurch, beide Deckflächen liegen in der
     Trennebene — zwei Flächen in derselben Tiefe kann der Tiefenpuffer nicht
     ordnen (Flimmern). polygonOffset zieht den Pressrest um einen
     Tiefenschritt vor: wo beide zusammenfallen, gewinnt er. */
  const biscMat = new T.MeshStandardMaterial({
    color: 0x93a6b0, roughness: 0.6, metalness: 0.06, side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
  group.add(biscMesh);

  const lineMat = new T.LineBasicMaterial({ color: 0x002733, transparent: true, opacity: 0.55 });
  const lineGroup = new T.Group();
  group.add(lineGroup);

  /* „Einpassen" (Knopf, F, Doppelklick) passt ein, was JETZT da ist: der Anguss
     wächst mit jedem Punkt, ein gemerkter Quader wäre nach dem ersten Zug
     veraltet — der Rahmen fragt deshalb jedes Mal nach (shell.setFitTarget). */
  function fitBox() {
    const box = new T.Box3().setFromObject(group);
    if (host.part.model && host.part.mesh.visible) box.expandByObject(host.part.mesh);
    return box.isEmpty() ? null : box;
  }
  shell.setFitTarget(fitBox);
  const fit = () => { const box = fitBox(); if (box) shell.fit(box); };

  const editor = createEditor({
    view,
    getGraph: () => state.graph,
    getRefMesh: () => host.part.mesh,
    /* Der Pfeil am Anschnitt zeigt die WIRKLICHE Mündungsrichtung: die
       letzte Tangente der abgetasteten Kante, ob gebunden oder aus der Sehne. */
    getGateDir: id => {
      const e = state.net && state.net.edges.find(x => x.toId === id);
      return e && e.sections.length ? e.sections[e.sections.length - 1].t : null;
    },
    onAim: id => startAim(id),
    onSelect: () => { cancelAim(); syncSelection(); },
    onChange: what => {
      if (what === 'drag') { dragged = true; rebuild('drag'); return; }
      rebuild();
      if (what !== 'drop') return;
      syncSelection();
      /* Ein Klick auf einen Griff endet auch mit „drop" — gemeldet wird nur,
         was sich bewegt hat: sonst stünde nach dem bloßen Auswählen
         „Ungespeichert" da. */
      if (dragged) host.changed(sel() && !sel().parent ? 'System verschoben' : 'Punkt verschoben');
      dragged = false;
    }
  });

  /* ── Kette: Graph → Anzeige ──────────────────────────────── */
  /* Während eines Zuges zählt, was man sieht: Netz, Linien, Griffe. Regeln,
     Kennzahlen und Schema kommen beim Loslassen — sie gehören zum
     Ergebnis, nicht zur Bewegung. */
  function rebuild(mode) {
    const g = state.graph;
    F.applyAutoGates(g, state.proc);
    state.net = sampleNetwork(g);
    state.flow = F.analyseFlow(g, state.net, state.proc);
    setTris(runnerMesh, sweepRunner(state.net));
    updateLines();
    updateBiscuit();
    applyVisibility();
    editor.refresh();
    if (mode === 'drag') { view.invalidate(); return; }
    updateTimeline();
    state.rules = checkRules(g, state.net, state.flowView, shownProc());
    if (wired) {
      updateSystem();
      updateShot();
      updateRules();
      updateChart();
      shell.renderChips();
      if (host.refreshActions) host.refreshActions();
    }
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
  /* Dieselbe Strömung, die Zeiten ab „Kammer voll" statt ab Kolbenstart: von
     da an füllt sich der Anguss. Die Spanne zwischen den Anschnitten — und
     damit jede Prüfregel — bleibt, wie sie ist. */
  function fromFull(fl, tl) {
    if (!fl || !fl.onCurve || !tl || tl.error) return fl;
    const t0 = tl.tFull;
    const shift = t => (Number.isFinite(t) ? t - t0 : t);
    const arrival = {};
    for (const [id, t] of Object.entries(fl.arrival || {})) arrival[id] = t === null || t === undefined ? t : t - t0;
    return {
      ...fl, arrival, gates: fl.gates.map(r => ({ ...r, tArrive: shift(r.tArrive) })),
      tFirst: shift(fl.tFirst), tLast: shift(fl.tLast), tRunner: fl.tRunner === null ? null : fl.tRunner - t0
    };
  }
  function updateTimeline() {
    state.timeline = null;
    state.flowShown = state.flow;
    state.flowView = state.flow;
    if (!state.onCurve || !state.flow) return;
    const tl = shotTimeline(design.values, modelVolumes(), { diam: state.graph.biscuit.d, length: state.proc.chamberLen });
    if (tl.error) { state.timeline = { error: tl.error }; return; }
    state.timeline = tl;
    state.flowShown = flowOnCurve(state.flow, tl);
    state.flowView = fromFull(state.flowShown, tl);
  }
  /* Die Prüfregel der Spanne misst an der Füllzeit — auf der Kurve an ihrer eigenen. */
  const shownProc = () => (state.flowShown && state.flowShown.onCurve
    ? { ...state.proc, fillTime: state.flowShown.fillTime } : state.proc);
  const curveFill = () => {
    const tl = state.timeline;
    return tl && !tl.error && Number.isFinite(tl.shot.fill) && tl.shot.fill > 0 ? tl.shot.fill : null;
  };

  function updateLines() {
    for (const child of lineGroup.children.slice()) { child.geometry.dispose(); lineGroup.remove(child); }
    state.lines = centerlines(state.net);
    for (const pts of state.lines) {
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
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(biscuitMesh(b)), 3));
    geo.computeVertexNormals();
    biscMesh.geometry.dispose();
    biscMesh.geometry = geo;
  }

  /* Anzeigeoptionen (Darstellung ▾): nichts davon ändert den Plan. */
  const look = { biscuit: true, handles: true };
  function applyVisibility() {
    runnerMesh.visible = state.show === 'sweep';
    biscMesh.visible = look.biscuit;
    lineGroup.visible = look.handles;
    editor.group.visible = look.handles;
    editor.setEnabled(look.handles);
    view.invalidate();
  }

  /* ── Kennzahlen, Regeln, Schema ──────────────────────────── */
  const gatesOf = g => G.allNodes(g).filter(n => n.type === 'gate');
  /* Zwischen den Anschnitten liegen oft nur ein, zwei Millisekunden: Ankunftszeiten
     bekommen deshalb immer eine Nachkommastelle. */
  const ms = t => fmtUnit(t * 1000, 'ms', 1);

  /* Wann die Schmelze wo ist — ab „Kammer voll", dazu die Spanne zwischen
     erstem und letztem Anschnitt; sie ist es, die die Balance beschreibt. */
  function arrivalText(fl) {
    if (!fl || !Number.isFinite(fl.tFirst)) return null;
    const many = fl.gates.length > 1 && Number.isFinite(fl.tLast);
    /* Ein symmetrisches System bedient alle Anschnitte im selben Augenblick —
       „15,6 – 15,6 ms · Δ 0" sagte das umständlicher. */
    const even = many && (fl.tLast - fl.tFirst) * 1000 < 0.05;
    return {
      many, value: many && !even ? fmt(fl.tFirst * 1000, 1) + ' – ' + ms(fl.tLast) : ms(fl.tFirst),
      spread: many ? ms(fl.tLast - fl.tFirst) : ''
    };
  }

  function updateSystem() {
    const g = state.graph, net = state.net, fl = state.flowView || state.flow;
    const b = g.biscuit;
    ui('bisc-d').value = fmtPlain(b.d, 2);
    ui('bisc-t').value = fmtPlain(b.t, 2);
    segButtonSet(ui('axis-seg'), b.axis);
    facts(ui('system-facts'), [
      ['Punkte', fmt(G.allNodes(g).length, 0)],
      ['Anschnitte', fmt(gatesOf(g).length, 0)],
      ['Lauflänge', fmtUnit(net.length, 'mm', 0)],
      ['Angussvolumen', fmtUnit(fl.runnerVolume / 1000, 'cm³')]
    ]);
  }

  /* Das Referenzbauteil: Name und Volumen — wie man eines lädt und was es
     hier tut, steht hinter dem ⓘ der Überschrift. */
  function updateRef() {
    const m = host.part.model;
    if (!m) { kpis(ui('ref-kpis'), [{ label: 'Keines geladen', value: '—' }]); return; }
    const cm3 = m.volume / 1000;
    const usable = cm3 >= 0.01 && cm3 <= 1e5;
    kpis(ui('ref-kpis'), [{
      label: host.part.name || 'Bauteil', value: usable ? fmtUnit(cm3, 'cm³') : '—', verdict: usable ? '' : 'warn',
      note: usable ? '' : 'Volumen unbrauchbar (offenes Netz) — das Gussvolumen bleibt, wie es ist.'
    }]);
  }

  /* Die Werte der Kurve: was man vom Schuss wissen will, als Kennzahlen mit
     Urteil — knapp, damit der Modus nie scrollt. Was ab Kolbenstart zählt,
     steht zugeklappt darunter (die Ankunft je Anschnitt im Auswahlfeld). */
  function updateShot() {
    const tl = state.timeline, fl = state.flowView || state.flow, abs = state.flowShown;
    const rows = [], details = [];
    const warn = ui('shot-warn');
    warn.textContent = '';
    const at = arrivalText(fl);
    const spreadRule = state.rules.find(r => /Anschnitte werden nacheinander erreicht|Schmelze kommt gleichzeitig an/.test(r.title));
    /* Mehrere Anschnitte: immer zwei Zeilen — wann die Schmelze da ist und
       wie weit erster und letzter auseinanderliegen. */
    const arrivalRows = extra => {
      if (!at) return;
      rows.push({ label: 'Ankunft ab Kammer voll' + (extra || ''), value: at.value, verdict: spreadRule ? spreadRule.level : '' });
      if (at.many) rows.push({ label: 'Δ erster / letzter Anschnitt', value: at.spread });
    };
    if (state.onCurve && tl && !tl.error) {
      const fill = curveFill();
      if (fill !== null) {
        rows.push({
          label: 'Füllzeit der Kurve · v₂ ' + fmtUnit(tl.v2, 'm/s'), value: fmtUnit(fill, 'ms', 0),
          verdict: Math.abs(fill - state.proc.fillTime) > 0.5 ? 'warn' : 'ok'
        });
      }
      arrivalRows('');
      if (!at && abs && abs.unreached && abs.unreached.length) rows.push({ label: 'Ankunft', value: '—', verdict: 'bad', note: 'Die Kurve endet, bevor die Schmelze ankommt (' + abs.unreached.join(', ') + ').' });
      details.push(['Füllgrad der Kammer', fmtUnit(tl.phi * 100, '%')]);
      details.push(['Kammer voll ab Kolbenstart', fmtUnit(tl.tFull * 1000, 'ms', 0)]);
      if (abs && abs.onCurve && abs.tRunner === null && abs.unreached.length) details.push(['Kurve endet vor', abs.unreached.join(', ')]);
      warn.textContent = tl.warn || '';
    } else {
      arrivalRows(' · konstanter Strom');
      if (state.onCurve && tl && tl.error) warn.textContent = 'Keine DieLogic-Kurve: ' + tl.error + ' Die Ankunft steht mit konstantem Strom.';
    }
    kpis(ui('shot-kpis'), rows);
    facts(ui('shot-facts'), details);
  }

  /* Die Prüfung: am Reiter, wie viele Regeln erfüllt sind; im Modus ein
     Balken mit einem Feld je Regel und die Liste — Verletztes oben und
     aufgeklappt, Erfülltes als Zeile, die man aufklappen kann. */
  const RANK = { bad: 0, warn: 1, note: 2, ok: 3 };
  function updateRules() {
    const rules = state.rules;
    const ok = rules.filter(r => r.level === 'ok').length;
    const bad = rules.filter(r => r.level === 'bad').length, warn = rules.filter(r => r.level === 'warn').length;
    const kind = bad ? 'bad' : warn ? 'warn' : '';
    shell.setTabBadge('pruefung', rules.length ? ok + '/' + rules.length : '', kind);
    kpis(ui('rules-kpis'), [{
      label: 'Regeln erfüllt', value: ok + ' von ' + rules.length, verdict: kind || 'ok',
      note: [bad ? bad + ' verletzt' : '', warn ? warn + (warn === 1 ? ' Warnung' : ' Warnungen') : ''].filter(Boolean).join(' · ')
    }]);
    const sorted = rules.slice().sort((a, b) => RANK[a.level] - RANK[b.level]);
    ui('rules-bar').innerHTML = sorted.map(r => '<span class="' + r.level + '"></span>').join('');
    ui('rules-list').innerHTML = sorted.map(r =>
      '<details class="rule ' + r.level + '"' + (r.level === 'ok' ? '' : ' open') + '><summary><b>' + r.title + '</b></summary><span>' + r.text + '</span></details>').join('');
  }

  /* Die Kennzahlen des ganzen Systems stehen beim Flussschema — und dort
     nur, was das Schema NICHT ohnehin zeigt. Gezeichnet wird es nur, solange
     es offen ist, in Bildschirmbreite, damit die Schrift mitwächst. */
  function updateChart() {
    if (!state.chartOpen) return;
    const g = state.graph, fl = state.flowView || state.flow;
    const rows = [
      ['Punkte', fmt(G.allNodes(g).length, 0)],
      ['Anschnitte', fmt(gatesOf(g).length, 0)],
      ['Lauflänge', fmtUnit(state.net.length, 'mm', 0)],
      ['Angussvolumen', fmtUnit(fl.runnerVolume / 1000, 'cm³')],
      ['Volumenstrom', fmt(fl.Q * 1e6, 0) + ' cm³/s'],
      ['Druckbedarf', fmtUnit(fl.dp / 1e5, 'bar')]
    ];
    const at = arrivalText(fl);
    if (at) rows.push(['Ankunft', at.value + ' ab Kammer voll' + (at.many ? ' · Δ ' + at.spread : '') + (fl.onCurve ? '' : ' · bei konstantem Strom')]);
    if (fl.onCurve && state.timeline) {
      rows.push(['Schusskurve', 'DieLogic-Kurve · v₂ ' + fmtUnit(state.timeline.v2, 'm/s') + (fl.unreached.length ? ' · endet vor ' + fl.unreached.join(', ') : '')]);
    }
    facts(ui('chart-facts'), rows);
    ui('chart-body').innerHTML = flowChart(g, state.net, fl, { width: 900 });
  }
  function openChart(on) {
    state.chartOpen = !!on;
    ui('chart-panel').classList.toggle('on', state.chartOpen);
    /* Über dem Schema hat der Hinweis zu den Griffen nichts zu suchen. */
    if (state.chartOpen) { cancelAim(); updateChart(); if (hinted) { shell.status(''); hinted = false; } }
    else syncSelection();
    shell.renderChips();
    if (host.refreshActions) host.refreshActions();
  }

  /* ── Auswahl ─────────────────────────────────────────────── */
  const sel = () => (editor.selected ? state.graph.nodes[editor.selected] || null : null);
  const nodeName = n => (G.TYPES[n.type] || G.TYPES.point).label + ' ' + n.id;

  /* Kopfzeile des Auswahlfeldes: Artfarbe, Bezeichnung, id. */
  function selectionLabel(g, n) {
    const meta = G.TYPES[n.type] || G.TYPES.point;
    return '<span class="dot" style="background:' + meta.color + '"></span>' + meta.label + ' <code>' + n.id + '</code>'
      + (G.isFollower(g, n.id) ? ' <em>gespiegelt — die andere Seite bearbeiten</em>'
        : n.aim ? ' <em class="pinned">ans Bauteil gebunden</em>' : '');
  }

  /* Welche Gruppen das Auswahlfeld zeigt, hängt an der Art des Punktes. */
  const groupsFor = n => ['Lage', 'Querschnitt',
    ...(n.type === 'branch' || n.type === 'mirror' ? ['Verzweigung'] : []),
    ...(n.type === 'gate' ? ['Anschnitt', 'Mündung'] : []), DETAILS];

  function showGroup() {
    for (const b of ui('sel-groups').querySelectorAll('[data-group-tab]')) {
      const on = b.getAttribute('data-group-tab') === state.openGroup;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const el of ui('sel-params').querySelectorAll('[data-group]')) el.hidden = el.getAttribute('data-group') !== state.openGroup;
    ui('sel-facts').hidden = state.openGroup !== DETAILS;
  }

  function syncSelection() {
    const g = state.graph;
    const n = sel();
    shell.renderChips();
    /* Die Bedienhinweise des Rahmens (drehen, schieben, zoomen) bleiben stehen,
       bis hier etwas Eigenes zu sagen ist. */
    if (!n) { shell.inspector.hide(); if (hinted) { shell.status(''); hinted = false; } return; }
    hinted = true;
    const follower = G.isFollower(g, n.id);
    const isRoot = !n.parent, isGate = n.type === 'gate', isBranch = n.type === 'branch' || n.type === 'mirror';
    shell.inspector.show({ title: selectionLabel(g, n) });
    shell.status(HANDLE_HINT);

    const names = groupsFor(n);
    if (!names.includes(state.openGroup)) state.openGroup = names[0];
    ui('sel-groups').innerHTML = names.map(x => '<button type="button" role="tab" data-group-tab="' + x + '">' + x + '</button>').join('');
    showGroup();

    /* Ein Zehntel: „−137,25" passt nicht in ein Drittel der Zeile, und auf
       den Hundertstelmillimeter setzt niemand einen Kanalpunkt. */
    for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) ui(k).value = fmtPlain(n.pos[i], 1);
    ui('sel-w').value = fmtPlain(n.w, 2);
    ui('sel-h').value = fmtPlain(n.h, 2);
    /* Der Pressrest trägt statt einer Arbeitsebene seine eigenen Maße (unter
       „System"): seine Ebene IST die Ausstoßrichtung, kippen lässt sie sich nicht. */
    ui('plane-block').hidden = isRoot;
    ui('root-note').hidden = !isRoot;
    ui('sel-roll').value = String(n.tilt[0]);
    ui('sel-roll-val').textContent = fmt(n.tilt[0], 0) + '°';
    ui('sel-pitch').value = String(n.tilt[1]);
    ui('sel-pitch-val').textContent = fmt(n.tilt[1], 0) + '°';
    if (isBranch) {
      ui('sel-ratio').value = String(Math.round((n.ratio || 0.5) * 100));
      ui('sel-ratio-val').textContent = fmt(n.ratio * 100, 0) + ':' + fmt((1 - n.ratio) * 100, 0);
      ui('sel-mirror').checked = !!n.mirror;
    }
    if (isGate) {
      ui('sel-gh').value = fmtPlain(n.gate.h, 2);
      ui('sel-gh').classList.toggle('inherited', !!n.gate.hAuto);
      ui('sel-glen').value = fmtPlain(n.gate.len, 2);
      ui('sel-gw').value = fmtPlain(n.gate.w, 2);
      ui('sel-gauto').checked = !!n.gate.auto;
      ui('sel-gtrans').value = n.gate.transition;
    } else cancelAim();

    /* Die nachgezogene Seite einer Spiegelung zeigt ihre Werte, nimmt aber
       keine an — bearbeitet wird die andere. */
    for (const k of ['sel-x', 'sel-y', 'sel-z', 'sel-w', 'sel-h', 'sel-roll', 'sel-pitch', 'sel-ratio', 'sel-gh', 'sel-glen', 'sel-gtrans', 'sel-gauto']) ui(k).disabled = follower;
    ui('sel-mirror').disabled = follower || n.type === 'mirror';
    ui('sel-gw').disabled = follower || (isGate && !!n.gate.auto);
    ui('sel-aim').disabled = follower;
    /* Eine andere Stelle bekommt der Anschnitt mit einem neuen Klick — einen
       Knopf zum Lösen gibt es nicht: es gibt nichts zu lösen, was man nicht
       durch Neusetzen (oder Strg+Z) besser täte. */
    ui('sel-aim').textContent = n.aim ? 'Mündung neu ans Bauteil binden' : 'Mündung ans Bauteil binden';
    ui('del-node').disabled = isRoot || follower;
    syncFacts(n);
  }

  /* Was sich aus der Rechnung ergibt: die Ankunft (ab „Kammer voll") steht
     beim Anschnitt immer da, alles andere unter „Details". */
  function syncFacts(n) {
    const g = state.graph, id = n.id;
    const isRoot = !n.parent, isGate = n.type === 'gate';
    const fl = state.flowView || state.flow, abs = state.flowShown || state.flow;
    const arrive = ui('sel-arrive'), aimNote = ui('sel-aim-note');
    arrive.textContent = '';
    aimNote.textContent = '';
    const na = state.net.nodeArea[id];
    const rows = [['Querschnitt', fmtUnit(na.area, 'mm²')], ['hydraulischer Ø', fmtUnit(na.dh, 'mm')]];
    if (isRoot) {
      const b = g.biscuit;
      rows.unshift(['Pressrest-Volumen', fmtUnit(Math.PI * b.d * b.d / 4 * b.t / 1000, 'cm³')]);
    }
    const inEdge = state.net.edges.find(e => e.toId === id);
    if (inEdge) {
      const l = state.flow.losses.get(id);
      rows.push(['Länge ab Vorgänger', fmtUnit(inEdge.length, 'mm', 0)]);
      if (l) {
        rows.push(['v ein → aus', fmt(l.vIn) + ' → ' + fmtUnit(l.vOut, 'm/s')]);
        rows.push(['Verlust', fmtUnit(l.loss / 1e5, 'bar')]);
      }
    }
    if (isGate) {
      const r = fl.gates.find(x => x.id === id), ra = abs.gates.find(x => x.id === id);
      if (r) {
        rows.push(['Anschnittfläche', fmtUnit(r.area, 'mm²')]);
        rows.push(['Anteil Soll / Ist', fmt(r.soll * 100, 0) + ' / ' + fmtUnit(r.ist * 100, '%')]);
        if (Number.isFinite(r.tArrive)) {
          const later = Number.isFinite(fl.tFirst) ? r.tArrive - fl.tFirst : 0;
          arrive.textContent = 'Ankunft ' + ms(r.tArrive) + ' ab Kammer voll'
            + (fl.gates.length > 1 ? (later * 1000 >= 0.05 ? ' · ' + ms(later) + ' nach dem ersten' : ' · als erster') : '')
            + (fl.onCurve ? '' : ' · konstanter Strom');
          if (abs.onCurve && ra && Number.isFinite(ra.tArrive)) rows.push(['Ankunft ab Kolbenstart', ms(ra.tArrive)]);
        } else {
          arrive.textContent = 'Die Schusskurve endet, bevor die Schmelze hier ankommt.';
        }
      }
      /* Wohin der Anschnitt mündet — und ob das ans Bauteil gebunden ist
         oder dem Punkt davor folgt. Der Pfeil im Viewport zeigt dasselbe. */
      const e = state.net.edges.find(x => x.toId === id);
      const t = e && e.sections.length ? e.sections[e.sections.length - 1].t : null;
      if (t) {
        const tilt = G.aimTilt(g, n);
        const text = dirText(t) + (n.aim ? ' · gebunden' + (tilt >= 1 ? ', ' + fmt(tilt, 0) + '° aus der Ebene' : '') : ' · folgt dem Kanal');
        rows.push(['Mündung', text]);
        aimNote.textContent = 'Mündung ' + text;
      }
    }
    facts(ui('sel-facts'), rows);
  }

  /* Ein Feld des Auswahlfelds ändert den gewählten Punkt. `key` fasst
     Reglerschritte zu EINEM Eintrag im Verlauf zusammen. */
  function commit(label, key) {
    if (key && host.history) { host.history.coalesce(key, label); host.changed('', { silent: true }); }
    else host.changed(label);
  }
  function editNode(fn, label, key) {
    const n = sel();
    if (!n || G.isFollower(state.graph, n.id)) return false;
    fn(n);
    G.syncFrom(state.graph, n.id);
    rebuild();
    syncFacts(n);
    commit(label, key);
    return true;
  }

  /* ── Punkte anfügen und entfernen ────────────────────────── */
  const addReason = () => {
    const n = sel();
    if (!n) return NEEDS_SEL;
    if (G.isFollower(state.graph, n.id)) return IS_FOLLOWER;
    if (n.type === 'gate') return 'Hinter einem Anschnitt ist Schluss — einen Punkt davor wählen oder „Davor einfügen".';
    return '';
  };
  const insertReason = () => {
    const n = sel();
    if (!n) return 'Zuerst einen Punkt wählen — der neue kommt zwischen ihn und seinen Vorgänger.';
    if (!n.parent) return 'Vor dem Pressrest gibt es nichts — er ist der Anfang.';
    if (G.isFollower(state.graph, n.id)) return IS_FOLLOWER;
    return '';
  };
  function addOf(type) {
    const n = sel();
    if (!n || addReason()) return;
    const made = G.addChild(state.graph, n.id, type);
    rebuild();
    if (!made) return;
    editor.select(made.id);
    host.changed(nodeName(made) + ' angefügt');
  }
  function insertBefore() {
    const n = sel();
    if (!n || insertReason()) return;
    const made = G.insertBefore(state.graph, n.id, 'point');
    rebuild();
    if (!made) return;
    editor.select(made.id);
    host.changed(nodeName(made) + ' eingefügt');
  }

  /* Entfernen fragt nicht. Ein Punkt mit genau einem Nachfolger wird
     überbrückt, sonst fällt alles dahinter mit weg (js/runner/graph.js) —
     die Meldung sagt, wie viel, und „Rückgängig" holt es zurück. */
  function removeSelected() {
    const g = state.graph;
    const n = sel();
    /* Unter dem offenen Flussschema sieht man nicht, was man entfernte. */
    if (!n || state.chartOpen) return false;
    if (!n.parent) { shell.toast('Der Pressrest bleibt — er ist der Anfang des Systems.'); return true; }
    if (G.isFollower(g, n.id)) { shell.toast(IS_FOLLOWER); return true; }
    let behind = 0;
    if (n.children.length !== 1) {
      const count = id => { for (const c of g.nodes[id].children) { behind++; count(c); } };
      count(n.id);
    }
    const name = nodeName(n), parent = n.parent;
    G.removeNode(g, n.id);
    rebuild();
    editor.select(g.nodes[parent] ? parent : g.rootId);
    host.changed(name + ' entfernt');
    host.toastUndo(behind ? name + ' und ' + behind + (behind === 1 ? ' Punkt' : ' Punkte') + ' dahinter entfernt.' : name + ' entfernt.');
    return true;
  }

  /* ── Mündung ans Bauteil ─────────────────────────────────────
     Ein Anschnitt, dessen Richtung aus der Sehne zum Vorgänger kommt,
     dreht sich mit, sobald der Vorgänger wandert — beim Ausbalancieren
     des Systems passiert das ständig. Wer stattdessen die Stelle am
     Bauteil anklickt, legt beides auf einmal fest: den Ort der Mündung
     und die Richtung, in der die Schmelze das Bauteil betritt.
     Der scharfe Zustand muss unübersehbar sein: oben im Viewport steht,
     was zu tun ist. */
  const aim = shell.aim;
  /* Solange gezielt wird, weicht das Auswahlfeld auf seine Kopfzeile zurück —
     das tut der Rahmen (shell.aim.show). */
  function cancelAim() {
    const was = editor.cancelAim();
    aim.hide();
    return was;
  }
  host.cancelAim = cancelAim;

  /* Der Klick auf den Pfeil eines Anschnitts (oder auf den Knopf im
     Auswahlfeld). Ohne Referenzbauteil gibt es nichts zu treffen — dann
     sagt der Hinweis das, statt zu schweigen. */
  function startAim(id) {
    const n = id && state.graph.nodes[id];
    if (!n || n.type !== 'gate' || G.isFollower(state.graph, id)) return;
    if (!host.part.model || !host.part.mesh.visible) { aim.note(NEEDS_PART); return; }
    if (state.chartOpen) openChart(false);
    /* Schon scharf für diesen Anschnitt: bleibt scharf. Abgebrochen wird
       mit Esc, mit „Abbrechen" im Hinweis oder durch eine andere Auswahl. */
    aim.show(true, 'Mündung ans Bauteil: die Stelle auf dem Bauteil anklicken. Ziehen dreht die Ansicht, Esc bricht ab.');
    aim.onCancel = cancelAim;
    editor.armAim({
      /* Die Arbeitsebene des Anschnitts, jedes Mal frisch: ein Treffer an
         einer aufrechten Wand wird in sie gelegt (js/handles.js). */
      plane: () => {
        const gn = state.graph.nodes[id];
        return gn ? { origin: gn.pos, normal: G.planeNormal(state.graph, gn) } : null;
      },
      onHit: hit => {
        aim.hide();
        G.aimAt(state.graph, id, hit.point, hit.dir);
        rebuild();
        syncSelection();
        host.changed('Mündung ans Bauteil gebunden');
      },
      onMiss: () => aim.miss('Daneben — die Stelle muss auf dem Bauteil liegen.', () => editor.aiming)
    });
  }

  /* ── Ein Klick auf den Kanal wählt den nächsten Punkt ────────
     Der Strahl trifft den Körper; die Mittellinien (centerlines aus
     sweep.js, ohnehin für die dünne Linie gerechnet) sagen, zu welcher
     Kante die Stelle gehört — gewählt wird ihr näheres Ende. Ein Griff
     geht vor (js/handles.js hat den Druck dann schon genommen), ein Zug
     dreht die Ansicht wie immer. */
  const bodyRay = new T.Raycaster();
  function pickBody(ev) {
    if (!state.net || state.chartOpen) return null;
    const dom = view.renderer.domElement;
    const r = dom.getBoundingClientRect();
    bodyRay.setFromCamera(new T.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), view.camera);
    group.updateMatrixWorld(true);
    const hits = bodyRay.intersectObjects([runnerMesh, biscMesh].filter(m => m.visible), false);
    if (!hits.length) return null;
    if (hits[0].object === biscMesh) return state.graph.rootId;
    const p = hits[0].point;
    let best = null, bestD = Infinity;
    state.lines.forEach((pts, k) => {
      for (let i = 0; i < pts.length; i += 3) {
        const d = (pts[i] - p.x) ** 2 + (pts[i + 1] - p.y) ** 2 + (pts[i + 2] - p.z) ** 2;
        if (d < bestD) { bestD = d; best = { k, at: i / 3, n: pts.length / 3 }; }
      }
    });
    if (!best) return null;
    const e = state.net.edges[best.k];
    return best.at < best.n / 2 ? e.fromId : e.toId;
  }
  {
    const dom = view.renderer.domElement;
    let down = null;
    dom.addEventListener('pointerdown', ev => {
      down = ev.button === 0 && !ev.shiftKey && !ev.defaultPrevented && look.handles && !editor.dragging && !editor.aiming
        ? { x: ev.clientX, y: ev.clientY } : null;
    });
    dom.addEventListener('pointerup', ev => {
      const d = down;
      down = null;
      if (!d || editor.aiming || editor.dragging || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return;
      const id = pickBody(ev);
      if (id && id !== editor.selected) editor.select(id);
    });
  }

  /* ── Das Referenzbauteil in die Lage des Angusses bringen ────
     Ein Bauteil liegt im Studio mit der Trennebene bei z = 0. Hier liegt
     die Trennebene im Pressrest, ihre Normale ist die Ausstoßrichtung:
     +z des Bauteils wird auf die Gegenrichtung gedreht (für „Y" ist das die
     Drehung um x um 90°, mit der die Beispiele seit jeher kommen — die
     Kavität steht dann über der Trennebene), dann rückt das Bauteil mit
     seiner nächsten Kante an den fernsten Anschnitt, mittig zu allen.
     Bringt das Beispiel sein Bauteil mit (`ref` in presets.js), gilt
     dessen Lage genau. Gedreht wird das MESH; das Netz bleibt unberührt. */
  const round = (v, n) => Math.round(v * 10 ** n) / 10 ** n;
  function applyPlace(p) {
    const mesh = host.part.mesh;
    if (p) { mesh.quaternion.set(p.quat[0], p.quat[1], p.quat[2], p.quat[3]); mesh.position.set(p.pos[0], p.pos[1], p.pos[2]); }
    else { mesh.quaternion.identity(); mesh.position.set(0, 0, 0); }
    mesh.updateMatrixWorld(true);
    state.place = p || null;
    view.invalidate();
  }
  const placeOf = (q, pos) => ({ key: host.part.key, quat: q.toArray().map(v => round(v, 6)), pos: pos.map(v => round(v, 3)) });
  function placePart(ref) {
    const m = host.part.model;
    if (!m) { applyPlace(null); return; }
    if (ref) {
      const q = new T.Quaternion().setFromEuler(new T.Euler((ref.rotX || 0) * Math.PI / 180, 0, 0));
      applyPlace(placeOf(q, (ref.translate || [0, 0, 0]).slice()));
      return;
    }
    const g = state.graph;
    const a = G.AXES[g.biscuit.axis] || G.AXES['+y'];
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, 1), new T.Vector3(-a[0], -a[1], -a[2]));
    /* Wohin die Anschnitte vom Pressrest aus liegen — in der Trennebene. */
    const targets = gatesOf(g).length ? gatesOf(g) : G.allNodes(g).filter(n => !n.children.length);
    const o = g.biscuit.pos;
    let mean = [0, 0, 0];
    for (const n of targets) mean = add(mean, sub(n.pos, o));
    let u = sub(mean, [a[0] * dot(mean, a), a[1] * dot(mean, a), a[2] * dot(mean, a)]);
    if (Math.hypot(u[0], u[1], u[2]) < 1e-6) u = cross(a, Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
    u = norm(u);
    const w = cross(a, u);
    /* Der gedrehte Hüllquader des Bauteils, gemessen entlang u und w. */
    let uMin = Infinity, wMin = Infinity, wMax = -Infinity;
    const b = m.bounds;
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const c = new T.Vector3(x, y, z).applyQuaternion(q).toArray();
      uMin = Math.min(uMin, dot(c, u));
      wMin = Math.min(wMin, dot(c, w)); wMax = Math.max(wMax, dot(c, w));
    }
    let uGate = -Infinity, wGate = 0;
    for (const n of targets) { uGate = Math.max(uGate, dot(n.pos, u)); wGate += dot(n.pos, w) / targets.length; }
    if (!targets.length) { uGate = dot(o, u) + g.biscuit.d; wGate = dot(o, w); }
    const du = uGate - uMin, dw = wGate - (wMin + wMax) / 2, da = dot(o, a);
    applyPlace(placeOf(q, [0, 1, 2].map(i => u[i] * du + w[i] * dw + a[i] * da)));
  }

  /* ── Beispiele ───────────────────────────────────────────── */
  const presetRef = () => { const d = DEMOS.find(x => x.id === state.preset); return d && d.ref ? d.ref : null; };

  /** Ein Beispiel laden: ein neues System — der Verlauf beginnt neu. Bringt
      es sein Bauteil mit, holt es der Gastgeber; bis dahin ist die Seite
      nicht „fertig". Ein Beispiel ohne Bauteil lässt ein geladenes stehen
      und stellt es vor seine Anschnitte. */
  function pickPreset(id) {
    const d = DEMOS.find(x => x.id === id) || DEMOS[0];
    cancelAim();
    state.preset = d.id;
    state.name = d.label;
    state.graph = d.build();
    ui('preset').value = d.id;
    ui('graph-note').textContent = '';
    ui('graph-warn').textContent = '';
    const refId = d.ref ? partIdOf(d.ref) : null;
    const loaded = !!host.part.model && refId && host.part.demoId === refId;
    if (host.part.model) placePart(loaded ? d.ref : null);
    adoptGraph();
    if (refId && !loaded) {
      state.ready = false;
      /* Die Auswahl der Bauteil-Klappe mitführen: daran liest der Gastgeber,
         welches Beispielteil es ist (Schlüssel des Entwurfs). */
      const partSel = document.getElementById('demo-select');
      if (partSel) partSel.value = refId;
      state.refPending = Promise.resolve(host.part.pickDemo(refId)).then(() => {
        /* Kam das Teil nicht (Datei fehlt), meldet es die Bauteil-Klappe —
           die Seite arbeitet ohne weiter. */
        if (!state.ready) { ui('graph-warn').textContent = '„' + d.ref.name + '" konnte nicht geladen werden — das Beispiel steht ohne sein Bauteil.'; state.ready = true; }
      });
      return state.refPending;
    }
    return Promise.resolve();
  }

  /** Nach dem Laden eines anderen Systems alle Anzeigen nachziehen. */
  function syncPanel() {
    const g = state.graph, p = state.proc;
    ui('draft').value = String(g.draft);
    ui('draft-val').textContent = fmt(g.draft) + '°';
    ui('radius').value = fmtPlain(g.radius, 2);
    ui('branch-r').value = fmtPlain(g.branchR, 2);
    ui('tension').value = String(Math.round(g.tension * 100));
    ui('tension-val').textContent = fmt(g.tension, 2);
    ui('step').value = fmtPlain(g.step, 2);
    ui('gate-h').value = fmtPlain(g.gateH, 2);
    ui('taper').value = String(Math.round(state.sizing.taper * 100));
    ui('taper-val').textContent = fmt(state.sizing.taper * 100, 0) + ' %';
    ui('aspect').value = String(Math.round(state.sizing.aspect * 100));
    ui('aspect-val').textContent = fmt(state.sizing.aspect, 2);
    ui('alloy').value = p.alloy;
    ui('vol').value = fmtPlain(p.volume, 1);
    ui('tfill').value = fmtPlain(p.fillTime, 1);
    ui('vgate').value = fmtPlain(p.vGate, 1);
    ui('chamber-len').value = fmtPlain(p.chamberLen, 0);
    ui('cbranch').value = String(Math.round(p.cBranch * 100));
    ui('cbranch-val').textContent = fmt(p.cBranch, 2);
    ui('shot-time').checked = state.onCurve;
  }
  function adoptGraph() {
    syncPanel();
    rebuild();
    /* Nichts gewählt: das erste Bild zeigt das ganze System, kein Feld davor. */
    editor.select(null);
    if (host.history) host.history.reset();
    fit();
    state.ready = true;
  }

  /* ── Datei, Verlauf ──────────────────────────────────────── */
  const toDoc = () => ({
    ...G.toJSON(state.graph),
    process: { ...state.proc, onCurve: state.onCurve },
    sizing: { taper: state.sizing.taper, aspect: state.sizing.aspect },
    ...(state.place ? { ref: state.place } : {})
  });
  /* Ein Abzug zurück in den Zustand. Die zusätzlichen Schlüssel sind
     freiwillig (eine ältere Datei hat sie nicht) und gehen durch dieselben
     Grenzen wie die Felder. */
  function applyDoc(doc) {
    state.graph = G.fromJSON(doc);
    const p = doc.process;
    if (p && typeof p === 'object') {
      if (F.ALLOYS[p.alloy]) state.proc.alloy = p.alloy;
      for (const k of Object.keys(PROC_RANGE)) if (Number.isFinite(p[k])) state.proc[k] = within(p[k], PROC_RANGE[k]);
      if (typeof p.onCurve === 'boolean') state.onCurve = p.onCurve;
    }
    const s = doc.sizing;
    if (s && typeof s === 'object') {
      if (Number.isFinite(s.taper)) state.sizing.taper = within(s.taper, [0.7, 1]);
      if (Number.isFinite(s.aspect)) state.sizing.aspect = within(s.aspect, [0.3, 1.2]);
    }
    /* Die Lage des Bauteils gilt nur für DAS Bauteil, zu dem sie gehört. */
    const r = doc.ref;
    if (r && host.part.model && r.key === host.part.key && Array.isArray(r.quat) && r.quat.length === 4 && Array.isArray(r.pos) && r.pos.length === 3
      && [...r.quat, ...r.pos].every(Number.isFinite)) applyPlace({ key: r.key, quat: r.quat.slice(), pos: r.pos.slice() });
  }

  /* ── Chips: anfügen, einfügen, Schema ────────────────────── */
  const addChip = (id, label, type, title) => ({
    id, label, icon: G.TYPES[type].color, title,
    enabled: () => !addReason(), reason: addReason, onClick: () => addOf(type)
  });
  shell.setChips([
    addChip('add-point', '+ Punkt', 'point', 'Regulären Punkt hinter der Auswahl anfügen'),
    addChip('add-branch', '+ Verzweigung', 'branch', 'Verzweigung mit zwei eigenständigen Ästen anfügen'),
    addChip('add-mirror', '+ Spiegelpunkt', 'mirror', 'Spiegelpunkt: ein Ast wird bearbeitet, zwei entstehen'),
    addChip('add-gate', '+ Anschnitt', 'gate', 'Anschnitt als Endpunkt anfügen'),
    { id: 'insert-point', label: 'Davor einfügen', title: 'Punkt zwischen Auswahl und Vorgänger einfügen', enabled: () => !insertReason(), reason: insertReason, onClick: insertBefore },
    { id: 'chart', label: 'Flussschema', title: 'Der Angussbaum als Schema: Querschnitte, Geschwindigkeiten, Soll gegen Ist und die Ankunft an jedem Anschnitt', active: () => state.chartOpen, onClick: () => openChart(!state.chartOpen) }
  ]);

  /* ── Verdrahten: sobald der Rahmen die Felder der Modi eingesetzt hat ── */
  function mounted() {
    shell.inspector.body.innerHTML = INSPECTOR;
    for (const b of shell.inspector.body.querySelectorAll('[data-help]')) {
      b.addEventListener('click', ev => { ev.preventDefault(); ev.stopPropagation(); shell.help.show(b.getAttribute('data-help')); });
    }
    shell.inspector.onClose(() => editor.select(null));
    shell.viewport.insertAdjacentHTML('beforeend', CHART);
    ui('chart-close').addEventListener('click', () => openChart(false));
    shell.header.setPart('Bauteil laden …', 'Referenz');
    /* Die Bauteil-Klappe zeigt von sich aus das erste Beispielteil als
       gewählt — hier ist aber (noch) keines geladen. */
    const partSel = document.getElementById('demo-select');
    if (partSel) partSel.selectedIndex = -1;

    ui('sel-groups').addEventListener('click', ev => {
      const b = ev.target.closest('[data-group-tab]');
      if (!b) return;
      state.openGroup = b.getAttribute('data-group-tab');
      showGroup();
    });

    /* System */
    ui('preset').innerHTML = DEMOS.map(d => '<option value="' + d.id + '">' + d.label + '</option>').join('');
    ui('preset').addEventListener('change', e => pickPreset(e.target.value));
    numberInput(ui('bisc-d'), v => { state.graph.biscuit.d = v; rebuild(); host.changed('Pressrest-Durchmesser geändert'); return v; }, { min: 10, max: 400, unit: 'mm' });
    numberInput(ui('bisc-t'), v => { state.graph.biscuit.t = v; rebuild(); host.changed('Pressrest-Dicke geändert'); return v; }, { min: 1, max: 300, unit: 'mm' });
    segButtons(ui('axis-seg'), value => {
      const g = state.graph;
      const from = G.AXES[g.biscuit.axis], to = G.AXES[value];
      /* Mitdrehen statt nur umdeuten: die Trennebene kippt, und der Anguss
         liegt weiter in ihr — das Referenzbauteil mit ihm. */
      let axis = cross(from, to);
      const ang = Math.acos(Math.max(-1, Math.min(1, dot(from, to))));
      if (Math.hypot(axis[0], axis[1], axis[2]) < 1e-9) axis = cross(from, Math.abs(from[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]);
      axis = norm(axis);
      if (ang > 1e-9) {
        const o = g.biscuit.pos;
        for (const n of G.allNodes(g)) n.pos = add(o, rotate(sub(n.pos, o), axis, ang));
        if (state.place && host.part.model) {
          const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(axis[0], axis[1], axis[2]), ang);
          const q = turn.clone().multiply(new T.Quaternion(state.place.quat[0], state.place.quat[1], state.place.quat[2], state.place.quat[3]));
          applyPlace(placeOf(q, add(o, rotate(sub(state.place.pos, o), axis, ang))));
        }
      }
      g.biscuit.axis = value;
      G.setBiscuit(g, {});
      rebuild();
      syncSelection();
      host.changed('Ausstoßrichtung geändert');
      /* Die Kamera bleibt stehen. Das System dreht sich um den Pressrest;
         wer die Richtung umschaltet, will sehen, wie es sich dreht — nicht
         ein neu eingepasstes Bild. */
    });

    /* Kanalform */
    const graphSlider = (name, set, text, label) => slider(ui(name), v => {
      if (!wired) return;
      set(v);
      rebuild();
      if (sel()) syncFacts(sel());
      commit(label, name);
    }, text, ui(name + '-val'));
    graphSlider('draft', v => { state.graph.draft = v; }, v => fmt(v) + '°', 'Entformschräge geändert');
    graphSlider('tension', v => { state.graph.tension = v / 100; }, v => fmt(v / 100, 2), 'Splinestraffheit geändert');
    const graphNumber = (name, set, range, label) => numberInput(ui(name), v => { set(v); rebuild(); syncSelection(); host.changed(label); return v; }, { min: range[0], max: range[1], unit: 'mm' });
    graphNumber('radius', v => { state.graph.radius = v; }, [0, 20], 'Bodenradius geändert');
    graphNumber('branch-r', v => { state.graph.branchR = v; }, [0, 40], 'Zwickelradius geändert');
    graphNumber('step', v => { state.graph.step = v; }, [0.2, 10], 'Abtastschritt geändert');
    graphNumber('gate-h', v => { G.setGateHeight(state.graph, v); }, [0.3, 30], 'Anschnitthöhe geändert');
    /* Verjüngung und Seitenverhältnis wirken erst mit „Querschnitte abstufen". */
    slider(ui('taper'), v => { if (!wired) return; state.sizing.taper = v / 100; commit('Verjüngung geändert', 'taper'); }, v => fmt(v, 0) + ' %', ui('taper-val'));
    slider(ui('aspect'), v => { if (!wired) return; state.sizing.aspect = v / 100; commit('Seitenverhältnis geändert', 'aspect'); }, v => fmt(v / 100, 2), ui('aspect-val'));

    /* Prozess */
    ui('alloy').innerHTML = Object.entries(F.ALLOYS).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
    ui('alloy').addEventListener('change', e => { state.proc.alloy = e.target.value; rebuild(); host.changed('Legierung geändert'); });
    const procNumber = (name, key, unit, label) => numberInput(ui(name), v => {
      state.proc[key] = v;
      rebuild();
      syncSelection();
      host.changed(label);
      return v;
    }, { min: PROC_RANGE[key][0], max: PROC_RANGE[key][1], unit });
    procNumber('vol', 'volume', 'cm³', 'Gussvolumen geändert');
    procNumber('tfill', 'fillTime', 'ms', 'Füllzeit geändert');
    procNumber('vgate', 'vGate', 'm/s', 'Zielgeschwindigkeit geändert');
    procNumber('chamber-len', 'chamberLen', 'mm', 'Füllkammerlänge geändert');
    slider(ui('cbranch'), v => {
      if (!wired) return;
      state.proc.cBranch = v / 100;
      rebuild();
      if (sel()) syncFacts(sel());
      commit('Verzweigungsverlust geändert', 'cbranch');
    }, v => fmt(v / 100, 2), ui('cbranch-val'));
    ui('shot-time').addEventListener('change', e => {
      state.onCurve = e.target.checked;
      rebuild();
      syncSelection();
      host.changed(state.onCurve ? 'Ankunft nach der Schusskurve' : 'Ankunft bei konstantem Strom');
    });

    /* Auswahlfeld */
    for (const [name, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
      numberInput(ui(name), v => {
        const n = sel();
        if (!n || G.isFollower(state.graph, n.id)) return v;
        const p = n.pos.slice();
        p[axis] = v;
        G.setPos(state.graph, n.id, p);
        rebuild();
        syncFacts(n);
        host.changed(n.parent ? 'Lage geändert' : 'System verschoben');
        return v;
      });
    }
    numberInput(ui('sel-w'), v => {
      const w = Math.min(state.graph.biscuit.d, v);
      editNode(x => { x.w = w; }, 'Kanalbreite geändert');
      return w;
    }, { min: 1, max: 400, unit: 'mm' });
    numberInput(ui('sel-h'), v => { editNode(x => { x.h = v; }, 'Kanaltiefe geändert'); return v; }, { min: 0.4, max: 200, unit: 'mm' });
    const nodeSlider = (name, set, text, label) => slider(ui(name), v => {
      if (!wired || !sel()) return;
      editNode(n => set(n, v), label, name + ':' + sel().id);
    }, text, ui(name + '-val'));
    nodeSlider('sel-roll', (n, v) => { n.tilt = [v, n.tilt[1]]; }, v => fmt(v, 0) + '°', 'Ebene längs gekippt');
    nodeSlider('sel-pitch', (n, v) => { n.tilt = [n.tilt[0], v]; }, v => fmt(v, 0) + '°', 'Ebene quer gekippt');
    nodeSlider('sel-ratio', (n, v) => { n.ratio = v / 100; }, v => fmt(v, 0) + ':' + fmt(100 - v, 0), 'Aufteilung geändert');
    ui('sel-mirror').addEventListener('change', e => {
      editNode(n => { n.mirror = e.target.checked; }, e.target.checked ? 'Äste gespiegelt' : 'Spiegelung gelöst');
      syncSelection();
    });
    ui('sel-gtrans').innerHTML = Object.entries(G.TRANSITIONS).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
    ui('sel-gtrans').addEventListener('change', e => editNode(n => { n.gate.transition = e.target.value; }, 'Übergang geändert'));
    numberInput(ui('sel-gh'), v => {
      /* Ein eigener Wert nimmt den Anschnitt aus der Vorgabe heraus — es sei
         denn, er ist genau die Vorgabe. */
      editNode(n => { n.gate.h = v; n.gate.hAuto = Math.abs(v - state.graph.gateH) < 1e-9; }, 'Anschnitthöhe geändert');
      syncSelection();
      return v;
    }, { min: 0.3, max: 30, unit: 'mm' });
    numberInput(ui('sel-glen'), v => { editNode(n => { n.gate.len = v; }, 'Anschnitttiefe geändert'); return v; }, { min: 0, max: 60, unit: 'mm' });
    numberInput(ui('sel-gw'), v => { editNode(n => { n.gate.w = v; }, 'Anschnittbreite geändert'); return v; }, { min: 1, max: 600, unit: 'mm' });
    ui('sel-gauto').addEventListener('change', e => {
      editNode(n => { n.gate.auto = e.target.checked; }, e.target.checked ? 'Anschnittbreite folgt der Zielgeschwindigkeit' : 'Anschnittbreite von Hand');
      syncSelection();
    });
    ui('sel-aim').addEventListener('click', () => { if (sel()) startAim(sel().id); });
    ui('del-node').addEventListener('click', () => removeSelected());

    /* Darstellung, Legende */
    const pop = shell.darstellung(DARSTELLUNG);
    const inPop = name => pop.querySelector('[data-ui="' + name + '"]');
    slider(inPop('opacity'), v => host.part.setOpacity(v / 100), v => v + ' %', inPop('opacity-val'));
    segButtons(inPop('show-seg'), v => { state.show = v; applyVisibility(); });
    inPop('show-biscuit').addEventListener('change', e => { look.biscuit = e.target.checked; applyVisibility(); });
    inPop('show-line').addEventListener('change', e => { look.handles = e.target.checked; applyVisibility(); });
    shell.legend('<div class="st-title">Punktarten</div>'
      + Object.values(G.TYPES).map(t => '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>').join('')
      + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>'
      + '<div class="lg-row"><span class="dot" style="background:' + FOLLOWER_COLOR + '"></span>gespiegelt (folgt)</div>');

    updateRef();
    wired = true;
  }

  /* ── Hauptknöpfe der Modi ────────────────────────────────── */
  const PRIMARY = {
    system: () => null,
    /* reason: '' — die Zustandszeile eines anderen Modus bleibt sonst stehen. */
    kanalform: () => ({
      label: 'Querschnitte abstufen', reason: '',
      onClick: () => {
        autoTaper(state.graph, state.proc, state.sizing);
        rebuild();
        syncSelection();
        host.changed('Querschnitte abgestuft');
        shell.toast('Alle Querschnitte von den Anschnitten rückwärts neu abgestuft.');
      }
    }),
    /* Die Füllzeit, die die Kurve braucht, als Füllzeit des Prozesses — dann
       rechnen Strom und Zeiten mit derselben Zahl. Stimmen sie schon, gibt
       es nichts zu tun: kein toter Knopf, nur die Zeile, die es sagt. */
    prozess: () => {
      const fill = curveFill();
      if (fill === null) {
        return {
          label: 'Füllzeit der Kurve übernehmen', disabled: true,
          reason: state.onCurve ? 'Ohne DieLogic-Kurve gibt es keine Füllzeit zu übernehmen.' : 'Schusskurve aus (Details) — es gilt die Füllzeit von oben.'
        };
      }
      if (Math.abs(fill - state.proc.fillTime) <= 0.5) return { hidden: true, reason: 'Prozess und Schusskurve rechnen mit derselben Füllzeit.', noteKind: 'ok' };
      return {
        label: 'Füllzeit der Kurve übernehmen', reason: 'Kurve ' + fmtUnit(fill, 'ms', 0) + ' · Prozess ' + fmtUnit(state.proc.fillTime, 'ms', 0),
        onClick: () => {
          const f = curveFill();
          if (f === null) return;
          state.proc.fillTime = Math.round(f * 10) / 10;
          ui('tfill').value = fmtPlain(state.proc.fillTime, 1);
          rebuild();
          syncSelection();
          host.changed('Füllzeit der Kurve übernommen');
        }
      };
    },
    pruefung: () => ({ label: state.chartOpen ? 'Flussschema schließen' : 'Flussschema öffnen', reason: '', kind: state.chartOpen ? 'outline' : '', onClick: () => openChart(!state.chartOpen) })
  };

  const fileBase = () => safeName(state.name || host.part.name || 'anguss');

  const tool = {
    id: 'anguss',
    modes: MODES.map(m => ({ ...m, enter() {}, leave() {}, primary: PRIMARY[m.id] })),
    accepts: [G.FORMAT],
    toJSON: toDoc,
    /* Eine Datei (oder ein Entwurf): ein anderes System — nichts gewählt, das
       Bild eingepasst. Den Verlauf setzt der Gastgeber zurück. */
    fromJSON(obj) {
      cancelAim();
      applyDoc(obj);
      state.name = '';
      state.preset = null;
      ui('preset').selectedIndex = -1;
      ui('graph-note').textContent = 'Aus einer Datei oder einem Entwurf geladen.';
      ui('graph-warn').textContent = '';
      syncPanel();
      rebuild();
      editor.select(null);
      fit();
    },
    serialize: toDoc,
    /* Rückgängig: das System wie es war. Kommt dabei etwas zurück (ein
       Entfernen wurde zurückgenommen), ist es gewählt — beim Teilbaum sein
       erster Punkt: man sieht, was wieder da ist, und Entf träfe es wieder.
       Sonst bleibt die Auswahl, wenn es sie noch gibt. */
    restore(doc) {
      const keep = editor.selected;
      const before = new Set(Object.keys(state.graph.nodes));
      cancelAim();
      applyDoc(doc);
      const g = state.graph;
      const back = Object.keys(g.nodes).filter(id => !before.has(id));
      const heads = back.filter(id => before.has(g.nodes[id].parent) && !G.isFollower(g, id));
      syncPanel();
      rebuild();
      editor.select(heads.length ? heads[0] : back.length ? back[0] : keep && g.nodes[keep] ? keep : null);
      syncSelection();
    },
    /* Zwei STL-Dateien: der Anguss — ein geschlossener Körper, am Mantel des
       Pressrests beschnitten (js/runner/sweep.js) — und der Pressrest als
       Zylinder. Beide berühren sich am Mantel, keiner steckt im anderen; im
       CAD sind es zwei Körper, die man vereinigen kann oder nicht. */
    exports: [{
      label: 'Anguss und Pressrest als STL (zwei Dateien)',
      enabled: () => !!state.net && state.net.edges.length > 0, reason: 'Ohne Kanal gibt es keinen Körper.',
      run: () => {
        const runner = sweepRunner(state.net);
        if (!runner.length) return;
        download(new Blob([writeSTL(runner, 'DieLogic Anguss')], { type: 'model/stl' }), fileBase() + '-anguss.stl');
        download(new Blob([writeSTL(biscuitMesh(state.graph.biscuit), 'DieLogic Pressrest')], { type: 'model/stl' }), fileBase() + '-pressrest.stl');
        shell.toast('Zwei Dateien: ' + fileBase() + '-anguss.stl und ' + fileBase() + '-pressrest.stl.');
      }
    }],
    keys: {
      Delete: () => removeSelected(),
      Escape: () => {
        if (state.chartOpen) { openChart(false); return true; }
        if (!editor.selected) return false;
        editor.select(null);
        return true;
      }
    },
    onPartStart() { state.ready = false; },
    /* Ein Referenzbauteil ist da: hinstellen, sein Volumen übernehmen. Das
       Referenzteil liefert die Zahl, um die sich alles dreht — aus dem
       Gussvolumen und der Füllzeit kommt der Volumenstrom, daraus die
       Anschnittflächen und damit jeder Querschnitt. Überläufe sind darin
       NICHT enthalten; wer sie mitrechnen will, schlägt sie im Feld auf. */
    onPart(model) {
      host.part.setLook({ visible: true, colors: false });
      const ref = presetRef();
      const mine = !!ref && host.part.demoId === partIdOf(ref);
      placePart(mine ? ref : null);
      const cm3 = model.volume / 1000;
      if (cm3 >= 0.01 && cm3 <= 1e5) {
        state.proc.volume = Math.round(cm3 * 10) / 10;
        ui('vol').value = fmtPlain(state.proc.volume, 1);
        /* Mit dem Gussvolumen des Teils werden die Anschnitte breiter — beim
           Beispiel, das sein Teil mitbringt, ziehen die Kanäle nach. */
        if (mine) { F.applyAutoGates(state.graph, state.proc); autoTaper(state.graph, state.proc, state.sizing); }
      }
      updateRef();
      rebuild();
      syncSelection();
      /* Ein Bauteil ist kein Schritt, den Rückgängig zurücknehmen könnte. */
      if (host.history) host.history.reset();
      fit();
      state.ready = true;
    },
    /* Loslegen: das Beispiel aus der Adresszeile (?demo=…) — wie ?part=… auf
       den Bauteilseiten; damit lässt sich ein bestimmtes System verlinken.
       Ohne Bauteil beginnt die Seite, wie sie es immer tat; ?part=… lädt eines. */
    start() {
      const q = new URLSearchParams(location.search);
      const done = pickPreset(q.get('demo'));
      const d = DEMOS.find(x => x.id === state.preset);
      if (!(d && d.ref)) {
        host.settingsFor('');
        if (q.get('part')) return host.part.start();
      }
      return done;
    },
    mounted
  };

  tool.__viewer = {
    state, view, shell, host, tool, editor, handles: editor, group, runnerMesh, biscMesh,
    rebuild, pickPreset, pickDemo: pickPreset, openChart, startAim, placePart, fit,
    /* Ohne Bauteil ist das Netz des Gastgebers leer — dann gibt es keines. */
    get partMesh() { return host.part.model ? host.part.mesh : null; },
    get refMesh() { return host.part.mesh; }
  };
  return tool;
}
