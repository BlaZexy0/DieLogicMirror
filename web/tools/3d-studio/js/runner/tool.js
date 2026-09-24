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
import { onScheme, ROLE, VIEW } from '../part/colors.js';
import { facts, slider, numberInput, segButtons, segButtonSet, POS_LIMIT } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit, parseNumber } from '../studio/format.js';
import { kpis, esc, selTitle, groupTabs, legendRow, selectedRow } from '../studio/rows.js';
import { saveSTL } from '../studio/files.js';
import { DEMO_PARTS } from '../part/demoparts.js';
import * as G from './graph.js';
import { sampleNetwork } from './curve.js';
import { sweepRunner, biscuitMesh, centerlines } from './sweep.js';
import * as F from './flow.js';
import { checkRules } from './rules.js';
import { autoTaper, DEFAULT_SIZING } from './sizing.js';
import { DEMOS } from './presets.js';
import { flowChart } from './chart.js';
import { createEditor } from './editor.js';
import { createPlacer } from '../handles.js';
import { rayAt } from '../viewmath.js';
import { rotate, norm, cross, dot, sub, add } from './vec.js';
import { shotTimeline, flowOnCurve, curveValues as curveValuesFor } from './shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { dirText, setTris, surfaceMaterial } from '../ui/common.js';
import { MODES, INSPECTOR, DARSTELLUNG, CHART } from './panel.js';

const HANDLE_HINT = '<b>Punkt</b> ziehen: in der Arbeitsebene · <b>Alt</b>: aus ihr heraus · <b>Pfeil</b> am Anschnitt: Mündung ans Bauteil · <b>Entf</b>: entfernen';
const NEEDS_SEL = 'Zuerst einen Punkt wählen; der neue hängt sich dahinter.';
const IS_FOLLOWER = 'Das ist die gespiegelte Seite; bearbeitet wird die andere.';
const NEEDS_PART = 'Zuerst ein Referenzbauteil laden (oben über den Bauteil-Chip), dann zeigt der Klick, wo der Anschnitt münden soll.';
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
    preset: DEMOS[0].id, ready: false,
    chartOpen: false,
    /* Lage des Referenzbauteils: { key, quat, pos } — oder null ohne Bauteil. */
    place: null
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
  const runnerMat = surfaceMaterial(ROLE.runner, { roughness: 0.52, metalness: 0.04 });
  const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
  group.add(runnerMesh);

  /* Deckend: der Pressrest ist ein Körper wie die Kanäle, kein Hinweis. Der
     erste Kanal läuft durch ihn hindurch, beide Deckflächen liegen in der
     Trennebene — zwei Flächen in derselben Tiefe kann der Tiefenpuffer nicht
     ordnen (Flimmern). polygonOffset zieht den Pressrest um einen
     Tiefenschritt vor: wo beide zusammenfallen, gewinnt er. */
  const biscMat = surfaceMaterial(ROLE.biscuit, {
    roughness: 0.6, metalness: 0.06, flat: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  });
  const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
  group.add(biscMesh);

  const lineMat = new T.LineBasicMaterial({ color: VIEW.lines, transparent: true, opacity: 0.55 });
  /* Ein Wechsel des Farbschemas: Anguss, Pressrest und Mittellinien
     umfärben, Auswahlfeld, Legende und Schema neu. Die Griffe gleicht
     js/handles.js selbst ab, die Chips der Rahmen. */
  onScheme(() => {
    runnerMat.color.set(ROLE.runner);
    biscMat.color.set(ROLE.biscuit);
    lineMat.color.set(VIEW.lines);
    if (wired) { updateLegend(); if (state.chartOpen) updateChart(); else syncSelection(); }
    view.invalidate();
  });
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
    onSelect: () => { placer.cancel(); syncSelection(); },
    onChange: (what, id) => {
      if (what === 'drag') { dragged = true; rebuild('drag'); return; }
      /* Esc mitten im Zug (host.cancelDrag): zurück zum Stand davor, ohne
         Schritt. Hat sich nichts bewegt, gibt es nichts zurückzuholen — dann
         nur die Anzeige, die während des Zugs ohne Regeln lief. */
      if (what === 'cancel') {
        dragged = false;
        if (!host.revert()) { rebuild(); syncSelection(); }
        return;
      }
      rebuild();
      if (what !== 'drop') return;
      syncSelection();
      /* Ein Klick auf einen Griff endet auch mit „drop" — gemeldet wird nur,
         was sich bewegt hat: sonst stünde nach dem bloßen Auswählen
         „Ungespeichert" da. Benannt nach dem GEZOGENEN Punkt, nicht nach
         der Auswahl: am Pressrest hieß der Schritt sonst „Punkt verschoben". */
      const n = state.graph.nodes[id];
      if (dragged) host.changed(n && !n.parent ? 'System verschoben' : 'Punkt verschoben');
      dragged = false;
    }
  });
  const placer = createPlacer({ aim: shell.aim, handles: editor });

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
  /* Die Legierung von hier gilt auch für die Kurve (runner/shottime.js). */
  const curveValues = () => curveValuesFor(design.values, state.proc.alloy);
  function updateTimeline() {
    state.timeline = null;
    state.flowShown = state.flow;
    state.flowView = state.flow;
    if (!state.onCurve || !state.flow) return;
    const tl = shotTimeline(curveValues(), modelVolumes(), { diam: state.graph.biscuit.d, length: state.proc.chamberLen });
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
      many, value: many && !even ? fmt(fl.tFirst * 1000, 1) + ' bis ' + ms(fl.tLast) : ms(fl.tFirst),
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
    /* Der Dateiname ist Text von außen — in die Seite nur maskiert. */
    kpis(ui('ref-kpis'), [{
      label: esc(host.part.name || 'Bauteil'), value: usable ? fmtUnit(cm3, 'cm³') : '—', verdict: usable ? '' : 'warn',
      note: usable ? '' : 'Volumen unbrauchbar (offenes Netz); das Gussvolumen bleibt, wie es ist.'
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
      if (!at && abs && abs.unreached && abs.unreached.length) rows.push({ label: 'Ankunft', value: '—', verdict: 'bad', note: 'Die Kurve endet, bevor die Schmelze ankommt (' + esc(abs.unreached.join(', ')) + ').' });
      details.push(['Füllgrad der Kammer', fmtUnit(tl.phi * 100, '%')]);
      details.push(['Kammer voll ab Kolbenstart', fmtUnit(tl.tFull * 1000, 'ms', 0)]);
      if (abs && abs.onCurve && abs.tRunner === null && abs.unreached.length) details.push(['Kurve endet vor', esc(abs.unreached.join(', '))]);
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
    /* Die Sätze nennen Kennungen aus der Datei: maskiert, wie alles von außen. */
    ui('rules-list').innerHTML = sorted.map(r =>
      '<details class="rule ' + r.level + '"' + (r.level === 'ok' ? '' : ' open') + '><summary><b>' + esc(r.title) + '</b></summary><span>' + esc(r.text) + '</span></details>').join('');
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
      rows.push(['Schusskurve', 'DieLogic-Kurve · v₂ ' + fmtUnit(state.timeline.v2, 'm/s') + (fl.unreached.length ? ' · endet vor ' + esc(fl.unreached.join(', ')) : '')]);
    }
    facts(ui('chart-facts'), rows);
    ui('chart-body').innerHTML = flowChart(g, state.net, fl, { width: 900 });
  }
  function openChart(on) {
    state.chartOpen = !!on;
    ui('chart-panel').classList.toggle('on', state.chartOpen);
    /* Über dem Schema hat der Hinweis zu den Griffen nichts zu suchen. */
    if (state.chartOpen) { placer.cancel(); updateChart(); if (hinted) { shell.status(''); hinted = false; } }
    else syncSelection();
    shell.renderChips();
    if (host.refreshActions) host.refreshActions();
  }

  /* ── Auswahl ─────────────────────────────────────────────── */
  const sel = () => (editor.selected ? state.graph.nodes[editor.selected] || null : null);
  const nodeName = n => (G.TYPES[n.type] || G.TYPES.point).label + ' ' + n.id;

  /* Kopfzeile des Auswahlfeldes: Artfarbe, Bezeichnung, id. Die id kann aus
     einer Datei stammen; fromJSON lässt nur harmlose zu, maskiert wird sie
     trotzdem (selTitle). */
  function selectionLabel(g, n) {
    const meta = G.TYPES[n.type] || G.TYPES.point;
    return selTitle({ color: meta.color, label: meta.label, id: n.id,
      extra: G.isFollower(g, n.id) ? ' <em>gespiegelt, die andere Seite bearbeiten</em>'
        : n.aim ? ' <em class="pinned">ans Bauteil gebunden</em>' : '' });
  }

  /* Welche Gruppen das Auswahlfeld zeigt, hängt an der Art des Punktes. Eine
     Gabelung ist, was sich gabelt — auch der Pressrest mit zwei Abgängen. */
  const isFork = n => n.type === 'branch' || n.type === 'mirror' || n.children.length >= 2;
  const groupsFor = n => ['Lage', 'Querschnitt',
    ...(isFork(n) ? ['Verzweigung'] : []),
    ...(n.type === 'gate' ? ['Anschnitt', 'Mündung'] : []), DETAILS];

  /* Warum Aufteilung oder Spiegel-Häkchen gerade nicht gehen — '' heißt:
     beide gehen. Die Zeile steht unter dem Regler, der Regler ist gesperrt;
     ein Regler, der sich zieht und nichts tut, sagte es nicht. */
  function forkNote(n) {
    const kids = n.children.length;
    if (G.isMirrorBranch(n) && kids === 2) {
      return n.type === 'mirror' ? 'Ein Spiegelpunkt teilt immer 50:50.'
        : 'Gespiegelt teilen die Äste 50:50. Für eine andere Aufteilung die Spiegelung lösen.';
    }
    if (kids > 2) return fmt(kids, 0) + ' Abgänge teilen den Strom zu gleichen Teilen; spiegeln lassen sich nur zwei.';
    if (!n.parent) return 'Am Pressrest gibt es nichts zu spiegeln: ihm fehlt die Zulaufrichtung.';
    return '';
  }

  /* Die Gruppen des Auswahlfelds (js/studio/rows.js) und die Regler darin —
     es gibt sie, sobald der Rahmen das Feld eingesetzt hat (mounted). */
  let groups = null;
  const sliders = {};

  function syncSelection() {
    if (!groups) return;
    const g = state.graph;
    const n = sel();
    shell.renderChips();
    /* Die Bedienhinweise des Rahmens (drehen, schieben, zoomen) bleiben stehen,
       bis hier etwas Eigenes zu sagen ist. */
    if (!n) { shell.inspector.hide(); if (hinted) { shell.status(''); hinted = false; } return; }
    hinted = true;
    const follower = G.isFollower(g, n.id);
    const isRoot = !n.parent, isGate = n.type === 'gate', isBranch = isFork(n);
    shell.inspector.show({ title: selectionLabel(g, n) });
    shell.status(HANDLE_HINT);

    groups.set(groupsFor(n));

    /* Ein Zehntel: „−137,25" passt nicht in ein Drittel der Zeile, und auf
       den Hundertstelmillimeter setzt niemand einen Kanalpunkt. */
    for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) ui(k).value = fmtPlain(n.pos[i], 1);
    ui('sel-w').value = fmtPlain(n.w, 2);
    ui('sel-h').value = fmtPlain(n.h, 2);
    /* Der Pressrest trägt statt einer Arbeitsebene seine eigenen Maße (unter
       „System"): seine Ebene IST die Ausstoßrichtung, kippen lässt sie sich nicht. */
    ui('plane-block').hidden = isRoot;
    ui('root-note').hidden = !isRoot;
    sliders['sel-roll'].set(n.tilt[0]);
    sliders['sel-pitch'].set(n.tilt[1]);
    if (isBranch) {
      const r = n.ratio === undefined ? 0.5 : n.ratio;
      sliders['sel-ratio'].set(Math.round(r * 100));
      if (n.children.length > 2) ui('sel-ratio-val').textContent = 'gleich';
      ui('sel-mirror').checked = !!n.mirror && n.children.length <= 2;
      ui('sel-ratio-note').textContent = follower ? '' : forkNote(n);
    }
    if (isGate) {
      ui('sel-gh').value = fmtPlain(n.gate.h, 2);
      ui('sel-gh').classList.toggle('inherited', !!n.gate.hAuto);
      ui('sel-glen').value = fmtPlain(n.gate.len, 2);
      ui('sel-gw').value = fmtPlain(n.gate.w, 2);
      ui('sel-gauto').checked = !!n.gate.auto;
      ui('sel-gtrans').value = n.gate.transition;
    } else placer.cancel();

    /* Die nachgezogene Seite einer Spiegelung zeigt ihre Werte, nimmt aber
       keine an — bearbeitet wird die andere. */
    for (const k of ['sel-x', 'sel-y', 'sel-z', 'sel-w', 'sel-h', 'sel-roll', 'sel-pitch', 'sel-gh', 'sel-glen', 'sel-gtrans', 'sel-gauto']) ui(k).disabled = follower;
    /* Die Aufteilung gilt nur für genau zwei Äste, und eine Spiegelung hält
       sie auf 50:50 (G.syncMirror); gespiegelt wird nur an einer Gabelung
       mit Zulauf und genau zwei Ästen. forkNote sagt jeweils, warum nicht. */
    ui('sel-ratio').disabled = follower || n.children.length !== 2 || G.isMirrorBranch(n);
    ui('sel-mirror').disabled = follower || n.type === 'mirror' || isRoot || n.children.length !== 2;
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
  const commit = (label, key) => host.changed(label, key ? { coalesce: key } : undefined);
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
    if (n.type === 'gate') return 'Hinter einem Anschnitt ist Schluss: einen Punkt davor wählen oder „Davor einfügen".';
    /* Ein dritter Ast schaltete die Spiegelung stillschweigend ab (G.addChild
       verweigert ihn deshalb) — hier steht, warum und was stattdessen geht. */
    if (G.isMirrorBranch(n) && n.children.length >= 2) {
      return n.type === 'mirror'
        ? 'Ein Spiegelpunkt hat genau zwei Äste: einen Punkt dahinter wählen und dort anfügen.'
        : 'Eine gespiegelte Verzweigung hat genau zwei Äste. Für einen dritten zuerst die Spiegelung lösen (Auswahlfeld, Verzweigung).';
    }
    return '';
  };
  const insertReason = () => {
    const n = sel();
    if (!n) return 'Zuerst einen Punkt wählen; der neue kommt zwischen ihn und seinen Vorgänger.';
    if (!n.parent) return 'Vor dem Pressrest gibt es nichts; er ist der Anfang.';
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
    if (!n.parent) { shell.toast('Der Pressrest bleibt; er ist der Anfang des Systems.'); return true; }
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
    host.removed(name, behind ? name + ' und ' + behind + (behind === 1 ? ' Punkt' : ' Punkte') + ' dahinter entfernt.' : undefined);
    return true;
  }

  /* ── Mündung ans Bauteil ─────────────────────────────────────
     Ein Anschnitt, dessen Richtung aus der Sehne zum Vorgänger kommt,
     dreht sich mit, sobald der Vorgänger wandert — beim Ausbalancieren
     des Systems passiert das ständig. Wer stattdessen die Stelle am
     Bauteil anklickt, legt beides auf einmal fest: den Ort der Mündung
     und die Richtung, in der die Schmelze das Bauteil betritt.
     Der scharfe Zustand muss unübersehbar sein: oben im Viewport steht,
     was zu tun ist (js/handles.js, createPlacer); solange gezielt wird,
     weicht das Auswahlfeld auf seine Kopfzeile zurück — das tut der Rahmen. */

  /* Der Klick auf den Pfeil eines Anschnitts (oder auf den Knopf im
     Auswahlfeld). Ohne Referenzbauteil gibt es nichts zu treffen — dann
     sagt der Hinweis das, statt zu schweigen. */
  function startAim(id) {
    const n = id && state.graph.nodes[id];
    if (!n || n.type !== 'gate' || G.isFollower(state.graph, id)) return;
    if (!host.part.model || !host.part.mesh.visible) { shell.aim.note(NEEDS_PART); return; }
    if (state.chartOpen) openChart(false);
    /* Schon scharf für diesen Anschnitt: bleibt scharf. Abgebrochen wird
       mit Esc, mit „Abbrechen" im Hinweis oder durch eine andere Auswahl. */
    placer.aim({
      text: 'Mündung ans Bauteil: die Stelle auf dem Bauteil anklicken. Ziehen dreht die Ansicht, Esc bricht ab.',
      miss: 'Daneben: Die Stelle muss auf dem Bauteil liegen.',
      /* Die Arbeitsebene des Anschnitts, jedes Mal frisch: ein Treffer an
         einer aufrechten Wand wird in sie gelegt (js/handles.js). */
      plane: () => {
        const gn = state.graph.nodes[id];
        return gn ? { origin: gn.pos, normal: G.planeNormal(state.graph, gn) } : null;
      },
      onHit: hit => {
        G.aimAt(state.graph, id, hit.point, hit.dir);
        rebuild();
        syncSelection();
        host.changed('Mündung ans Bauteil gebunden');
      }
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
    rayAt(bodyRay, ev, view.renderer.domElement, view.camera);
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
    placer.cancel();
    state.preset = d.id;
    state.graph = d.build();
    /* Bemessen ist ein Beispiel für den voreingestellten Prozess
       (presets.js). Gilt hier ein anderer — ein Bauteil hat sein Volumen
       eingetragen —, wird es für DIESEN bemessen, wie mit „Querschnitte
       abstufen": sonst begrüßte es mit 1000 cm³ Gussvolumen mit wachsendem
       Querschnitt, zu schnellem Laufkanal und zu großem Anschnitt. */
    F.applyAutoGates(state.graph, state.proc);
    autoTaper(state.graph, state.proc, state.sizing);
    ui('preset').value = d.id;
    ui('graph-note').textContent = '';
    ui('graph-warn').textContent = '';
    const refId = d.ref ? partIdOf(d.ref) : null;
    const loaded = !!host.part.model && refId && host.part.demoId === refId;
    if (host.part.model) placePart(loaded ? d.ref : null);
    adoptGraph();
    if (refId && !loaded) {
      state.ready = false;
      /* Das Beispielteil lädt der Gastgeber; die Klappe zeigt es als gewählt,
         und sein Schlüssel ist der des Entwurfs. */
      return Promise.resolve(host.part.pickDemo(refId)).then(() => {
        /* Kam das Teil nicht (Datei fehlt), meldet es die Bauteil-Klappe —
           die Seite arbeitet ohne weiter. */
        if (!state.ready) { ui('graph-warn').textContent = '„' + d.ref.name + '" konnte nicht geladen werden; das Beispiel steht ohne sein Bauteil.'; state.ready = true; }
      });
    }
    return Promise.resolve();
  }

  /** Nach dem Laden eines anderen Systems alle Anzeigen nachziehen. */
  function syncPanel() {
    const g = state.graph, p = state.proc;
    sliders.draft.set(g.draft);
    ui('radius').value = fmtPlain(g.radius, 2);
    ui('branch-r').value = fmtPlain(g.branchR, 2);
    sliders.tension.set(Math.round(g.tension * 100));
    ui('step').value = fmtPlain(g.step, 2);
    ui('gate-h').value = fmtPlain(g.gateH, 2);
    sliders.taper.set(Math.round(state.sizing.taper * 100));
    sliders.aspect.set(Math.round(state.sizing.aspect * 100));
    ui('alloy').value = p.alloy;
    ui('vol').value = fmtPlain(p.volume, 1);
    ui('tfill').value = fmtPlain(p.fillTime, 1);
    ui('vgate').value = fmtPlain(p.vGate, 1);
    ui('chamber-len').value = fmtPlain(p.chamberLen, 0);
    sliders.cbranch.set(Math.round(p.cBranch * 100));
    ui('shot-time').checked = state.onCurve;
  }
  function adoptGraph() {
    syncPanel();
    rebuild();
    /* Nichts gewählt: das erste Bild zeigt das ganze System, kein Feld davor. */
    editor.select(null);
    host.resetHistory();
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
      if (Object.hasOwn(F.ALLOYS, p.alloy)) state.proc.alloy = p.alloy;
      for (const k of Object.keys(PROC_RANGE)) if (Number.isFinite(p[k])) state.proc[k] = within(p[k], PROC_RANGE[k]);
      if (typeof p.onCurve === 'boolean') state.onCurve = p.onCurve;
    }
    const s = doc.sizing;
    if (s && typeof s === 'object') {
      if (Number.isFinite(s.taper)) state.sizing.taper = within(s.taper, [0.7, 1]);
      if (Number.isFinite(s.aspect)) state.sizing.aspect = within(s.aspect, [0.3, 1.2]);
    }
    /* Die Lage des Bauteils gilt nur für DAS Bauteil, zu dem sie gehört. Die
       Drehung auf Länge eins: ein anderer Betrag verzerrte das Bauteil. */
    const r = doc.ref;
    if (r && host.part.model && r.key === host.part.key && Array.isArray(r.quat) && r.quat.length === 4 && Array.isArray(r.pos) && r.pos.length === 3
      && [...r.quat, ...r.pos].every(Number.isFinite)) {
      const l = Math.hypot(...r.quat);
      if (l > 1e-6) {
        applyPlace({ key: r.key, quat: Math.abs(l - 1) > 1e-6 ? r.quat.map(v => v / l) : r.quat.slice(), pos: r.pos.slice() });
        return true;
      }
    }
    return false;
  }

  /* ── Chips: anfügen, einfügen, Schema ────────────────────── */
  const addChip = (id, label, type, title) => ({
    id, label, icon: () => G.TYPES[type].color, title,
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
    /* Die ⓘ darin bedient der Rahmen (ein Zuhörer am Auswahlfeld, js/studio/shell.js). */
    shell.inspector.body.innerHTML = INSPECTOR;
    shell.inspector.onClose(() => editor.select(null));
    shell.viewport.insertAdjacentHTML('beforeend', CHART);
    ui('chart-close').addEventListener('click', () => openChart(false));
    shell.header.setPart('Bauteil laden …', 'Referenz');
    /* Die Bauteil-Klappe zeigt von sich aus das erste Beispielteil als
       gewählt — hier ist aber (noch) keines geladen. */
    host.part.deselect();
    /* Welche Gruppen es gibt, hängt an der Art des Punktes; „Details" zeigt
       die abgeleiteten Zahlen darunter. */
    groups = groupTabs({ tabs: ui('sel-groups'), box: ui('sel-params'), onShow: open => { ui('sel-facts').hidden = open !== DETAILS; } });

    /* System */
    ui('preset').innerHTML = DEMOS.map(d => '<option value="' + d.id + '">' + d.label + '</option>').join('');
    ui('preset').addEventListener('change', e => pickPreset(e.target.value));
    /* Der Pressrest ist Kolben und Füllkammer der Kurve: mit seinen Maßen
       ändern sich Füllgrad und Ankunft — auch die im offenen Auswahlfeld. */
    const mm = k => ({ min: G.LIMITS[k][0], max: G.LIMITS[k][1], unit: 'mm' });
    numberInput(ui('bisc-d'), v => { state.graph.biscuit.d = v; rebuild(); syncSelection(); host.changed('Pressrest-Durchmesser geändert'); return v; }, mm('biscuitD'));
    numberInput(ui('bisc-t'), v => { state.graph.biscuit.t = v; rebuild(); syncSelection(); host.changed('Pressrest-Dicke geändert'); return v; }, mm('biscuitT'));
    segButtons(ui('axis-seg'), value => {
      const g = state.graph;
      const o = g.biscuit.pos.slice();
      /* Mitdrehen statt nur umdeuten: die Trennebene kippt, und der Anguss
         liegt weiter in ihr, samt gebundener Mündungen (G.turnSystem) — das
         Referenzbauteil mit ihm. */
      const { axis, ang } = G.turnSystem(g, value);
      if (ang > 1e-9 && state.place && host.part.model) {
        const turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(axis[0], axis[1], axis[2]), ang);
        const q = turn.clone().multiply(new T.Quaternion(state.place.quat[0], state.place.quat[1], state.place.quat[2], state.place.quat[3]));
        applyPlace(placeOf(q, add(o, rotate(sub(state.place.pos, o), axis, ang))));
      }
      rebuild();
      syncSelection();
      host.changed('Ausstoßrichtung geändert');
      /* Die Kamera bleibt stehen. Das System dreht sich um den Pressrest;
         wer die Richtung umschaltet, will sehen, wie es sich dreht — nicht
         ein neu eingepasstes Bild. */
    });

    /* Kanalform */
    const graphSlider = (name, set, text, label) => { sliders[name] = slider(ui(name), v => {
      set(v);
      rebuild();
      if (sel()) syncFacts(sel());
      commit(label, name);
    }, text, ui(name + '-val'), { fire: false }); };
    graphSlider('draft', v => { state.graph.draft = v; }, v => fmt(v) + '°', 'Entformschräge geändert');
    graphSlider('tension', v => { state.graph.tension = v / 100; }, v => fmt(v / 100, 2), 'Splinestraffheit geändert');
    const graphNumber = (name, set, key, label) => numberInput(ui(name), v => { set(v); rebuild(); syncSelection(); host.changed(label); return v; }, mm(key));
    graphNumber('radius', v => { state.graph.radius = v; }, 'radius', 'Bodenradius geändert');
    graphNumber('branch-r', v => { state.graph.branchR = v; }, 'branchR', 'Zwickelradius geändert');
    graphNumber('step', v => { state.graph.step = v; }, 'step', 'Abtastschritt geändert');
    graphNumber('gate-h', v => { G.setGateHeight(state.graph, v); }, 'gateH', 'Anschnitthöhe geändert');
    /* Verjüngung und Seitenverhältnis wirken erst mit „Querschnitte abstufen". */
    sliders.taper = slider(ui('taper'), v => { state.sizing.taper = v / 100; commit('Verjüngung geändert', 'taper'); }, v => fmt(v, 0) + ' %', ui('taper-val'), { fire: false });
    sliders.aspect = slider(ui('aspect'), v => { state.sizing.aspect = v / 100; commit('Seitenverhältnis geändert', 'aspect'); }, v => fmt(v / 100, 2), ui('aspect-val'), { fire: false });

    /* Prozess */
    ui('alloy').innerHTML = Object.entries(F.ALLOYS).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
    ui('alloy').addEventListener('change', e => { state.proc.alloy = e.target.value; rebuild(); syncSelection(); host.changed('Legierung geändert'); });
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
    sliders.cbranch = slider(ui('cbranch'), v => {
      state.proc.cBranch = v / 100;
      rebuild();
      if (sel()) syncFacts(sel());
      commit('Verzweigungsverlust geändert', 'cbranch');
    }, v => fmt(v / 100, 2), ui('cbranch-val'), { fire: false });
    ui('shot-time').addEventListener('change', e => {
      state.onCurve = e.target.checked;
      rebuild();
      syncSelection();
      host.changed(state.onCurve ? 'Ankunft nach der Schusskurve' : 'Ankunft bei konstantem Strom');
    });

    /* Auswahlfeld. Die Lage steht auf das Zehntel gerundet im Feld; ein
       Enter im unveränderten Feld las diese Rundung wieder ein und setzte
       den Punkt (am Pressrest das ganze System) um ein paar Hundertstel —
       als Schritt im Verlauf. Wer nichts ändert, verschiebt nichts. Die
       Grenzen fangen „12.500" ab: das liest sich deutsch als 12 500 mm und
       läge ohne Hinweis zwölf Meter neben dem Bauteil. */
    for (const [name, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
      numberInput(ui(name), v => {
        const n = sel();
        if (!n || G.isFollower(state.graph, n.id)) return v;
        if (v === parseNumber(fmtPlain(n.pos[axis], 1))) return v;
        const p = n.pos.slice();
        p[axis] = v;
        G.setPos(state.graph, n.id, p);
        rebuild();
        syncFacts(n);
        host.changed(n.parent ? 'Lage geändert' : 'System verschoben');
        return v;
      }, POS_LIMIT);
    }
    numberInput(ui('sel-w'), v => {
      const w = Math.min(state.graph.biscuit.d, v);
      editNode(x => { x.w = w; }, 'Kanalbreite geändert');
      return w;
    }, mm('w'));
    numberInput(ui('sel-h'), v => { editNode(x => { x.h = v; }, 'Kanaltiefe geändert'); return v; }, mm('h'));
    const nodeSlider = (name, set, text, label) => { sliders[name] = slider(ui(name), v => {
      if (!sel()) return;
      editNode(n => set(n, v), label, name + ':' + sel().id);
    }, text, ui(name + '-val'), { fire: false }); };
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
    }, mm('gateH'));
    numberInput(ui('sel-glen'), v => { editNode(n => { n.gate.len = v; }, 'Anschnitttiefe geändert'); return v; }, mm('gateLen'));
    numberInput(ui('sel-gw'), v => { editNode(n => { n.gate.w = v; }, 'Anschnittbreite geändert'); return v; }, mm('gateW'));
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
    updateLegend();

    updateRef();
    wired = true;
  }

  function updateLegend() {
    shell.legend('<div class="st-title">Punktarten</div>'
      + Object.values(G.TYPES).map(t => legendRow(t.color, t.label)).join('')
      + selectedRow() + legendRow(VIEW.follower, 'gespiegelt (folgt)', ';opacity:.6'));
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
          reason: state.onCurve ? 'Ohne DieLogic-Kurve gibt es keine Füllzeit zu übernehmen.' : 'Schusskurve aus (Details); es gilt die Füllzeit von oben.'
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

  /* Dateinamen wie beim Plan (<bauteil>-anguss.json, js/studio/files.js):
     <bauteil>-anguss.stl und <bauteil>-pressrest.stl. Vorher hießen die
     STL nach dem Beispiel, der Plan nach dem Bauteil. */

  /* Mit Referenzbauteil kommen Anguss und Pressrest in DESSEN Koordinaten
     heraus. Hier steht das Bauteil gedreht und verschoben (placePart), im
     CAD so, wie seine Datei es beschreibt: die Umkehrung seiner Lage bringt
     die Körper dorthin, wo sie am Bauteil sitzen (bei der Ölwanne 90° und
     637 mm). Eine starre Bewegung, der Umlaufsinn bleibt. */
  function toPartFrame(tris) {
    const p = state.place;
    const m = new T.Matrix4().compose(new T.Vector3(p.pos[0], p.pos[1], p.pos[2]),
      new T.Quaternion(p.quat[0], p.quat[1], p.quat[2], p.quat[3]), new T.Vector3(1, 1, 1)).invert();
    const out = new Float64Array(tris.length);
    const v = new T.Vector3();
    for (let i = 0; i < tris.length; i += 3) {
      v.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(m);
      out[i] = v.x; out[i + 1] = v.y; out[i + 2] = v.z;
    }
    return out;
  }

  const tool = {
    id: 'anguss',
    modes: MODES.map(m => ({ ...m, primary: PRIMARY[m.id] })),
    accepts: [G.FORMAT],
    toJSON: toDoc,
    /* Eine Datei (oder ein Entwurf): ein anderes System — nichts gewählt, das
       Bild eingepasst. Den Verlauf setzt der Gastgeber zurück. Kennt die
       Datei keine Lage für DIESES Bauteil (ein anderes, keines, ein Plan von
       woanders), stünde es noch dort, wo es zum vorigen Plan gehörte —
       womöglich 300 mm neben den Anschnitten. Es kommt vor die Anschnitte
       des geöffneten Plans, wie bei einem Beispiel ohne eigenes Bauteil,
       und die Zeile unter dem Beispiel sagt es. */
    fromJSON(obj) {
      placer.cancel();
      const placed = applyDoc(obj);
      const moved = !!host.part.model && !placed;
      if (moved) placePart(null);
      state.preset = null;
      ui('preset').selectedIndex = -1;
      ui('graph-note').textContent = 'Aus einer Datei oder einem Entwurf geladen.'
        + (moved ? ' Eine Lage für dieses Bauteil kannte der Plan nicht: es steht jetzt vor seinen Anschnitten.' : '');
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
      placer.cancel();
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
        const inPart = !!(host.part.model && state.place);
        const frame = inPart ? toPartFrame : t => t;
        const a = saveSTL(frame(runner), 'DieLogic Anguss', host.part.name, 'anguss');
        const b = saveSTL(frame(biscuitMesh(state.graph.biscuit)), 'DieLogic Pressrest', host.part.name, 'pressrest');
        shell.toast('Zwei Dateien: ' + a + ' und ' + b + '.' + (inPart ? ' Sie stehen in den Koordinaten des Bauteils und liegen im CAD genau an ihm.' : ''));
      }
    }],
    keys: {
      Delete: () => removeSelected(),
      /* Einen laufenden Zug und das Zielen bricht der Rahmen vorher ab
         (cancelDrag, cancelAim); hier kommt Esc nur ohne beides an. */
      Escape: () => {
        if (state.chartOpen) { openChart(false); return true; }
        if (!editor.selected) return false;
        editor.select(null);
        return true;
      }
    },
    cancelDrag: () => { if (!editor.dragging) return false; editor.cancelDrag(); return true; },
    cancelAim: () => placer.cancel(),
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
      host.resetHistory();
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
