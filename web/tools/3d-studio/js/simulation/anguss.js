/* Angussfüllung — das Werkzeug im gemeinsamen Rahmen.

   Ein Angusssystem aus dem Angussdesigner (Beispiel oder JSON), die
   Schusskurve des Projekts, ein Knopf: die Schmelze steht im Pressrest, der
   Kolben schiebt mit der Kurve, und die Front läuft durch die Laufkanäle
   bis zu den Anschnitten. Gerechnet wird mit dem Gitter (Lattice-Boltzmann,
   js/lbm/) oder mit Partikeln (SPH, js/sph/) — früher zwei Seiten, jetzt ein
   Schalter; was beide Verfahren und ihre Bedienung gemeinsam haben, steht
   in core.js, die Verfahren selbst hinter engines/.

   Das Werkzeug arbeitet nicht auf einem Bauteil, sondern auf einem
   ANGUSSSYSTEM: es verzichtet auf das Bauteil des Gastgebers
   (createHost({ part: false })), beschriftet dessen Chip in der Kopfzeile
   zum Anguss-Chip um (Beispiel wählen, Angussdatei öffnen) und nennt mit
   host.settingsFor(quelle) das System, zu dem seine Einstellungen gehören.

   Die Modi: System (was geladen ist) · Prozess (Legierung, Gussvolumen,
   Füllkammer — und was die Kurve daraus macht) · Simulation (Verfahren,
   Auflösung, Aufwand) · Ergebnis (Ankunft je Anschnitt: Gitter · Partikel ·
   1D, dazu das Bild über die Zeit). Nur „Ergebnis" zeigt Schmelze oder
   Ankunftsfarben; in den anderen Modi steht der Anguss durchscheinend da. */

import * as T from 'three';
import { segButtons, segButtonSet, slider, numberInput, colorbar, gradient, rgbCss } from '../ui/controls.js';
import { setTris } from '../ui/common.js';
import { turbo } from '../part/colors.js';
import { kpis } from '../studio/rows.js';
import { fmt, fmtPlain, fmtUnit, fmtFixed } from '../studio/format.js';
import * as G from '../runner/graph.js';
import { DEMOS } from '../runner/presets.js';
import { sampleNetwork } from '../runner/curve.js';
import { sweepRunner, biscuitMesh } from '../runner/sweep.js';
import * as F from '../runner/flow.js';
import { shotTimeline, flowOnCurve } from '../runner/shottime.js';
import { pistonCurve } from '../lbm/piston.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { createSimCore, ENGINES, engineFromUrl } from './core.js';
import { env, probeGpu } from './engines/env.js';
import { compareTable } from './table.js';
import { MODES, DARSTELLUNG } from './anguss-panel.js';

export const FORMAT = 'dielogic-angussfuellung';
export const FORMAT_VERSION = 1;

const VOLUME = [1, 1e5], CHAMBER = [50, 3000];
const PROC_KEYS = ['alloy', 'volume', 'fillTime', 'vGate', 'cBranch', 'chamberLen'];
const ms1 = t => (Number.isFinite(t) ? fmtFixed(t * 1000, 1) : '—');

export function createAngussfuellungTool(host) {
  const { shell, view } = host;
  const ui = host.ui;

  const state = {
    graph: null, name: '', sourceKey: '', net: null,
    proc: { ...F.DEFAULT_PROCESS }, sourceProc: { ...F.DEFAULT_PROCESS },
    timeline: null, curveError: '', flow: null, flowShown: null, piston: null,
    tMax: 0, tExpect: 0,           // Laufzeit höchstens / erwartet, s ab „Kammer voll" (tMax dürfen Tests kürzen)
    show: 'schmelze', opacity: 0.3, ready: false
  };

  /* ── Szene ───────────────────────────────────────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const runnerMat = new T.MeshStandardMaterial({
    color: 0x008c82, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, flatShading: true,
    transparent: true, opacity: 0.3, depthWrite: false
  });
  const colorMat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.6, metalness: 0.05, side: T.DoubleSide, flatShading: true });
  const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
  /* flatShading: setTris() legt keine Normalen an — ohne sie bliebe der Pressrest
     unbeleuchtet, ein dunkler Klotz statt eines durchscheinenden Körpers (so
     stand er auf den alten Seiten). */
  const biscMat = new T.MeshStandardMaterial({ color: 0x93a6b0, roughness: 0.6, metalness: 0.06, side: T.DoubleSide, flatShading: true, transparent: true, opacity: 0.3, depthWrite: false });
  const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
  group.add(runnerMesh, biscMesh);
  /* Eingepasst werden Anguss und Pressrest — F, „Einpassen" und Doppelklick fragen hier. */
  const sceneBox = () => (state.graph ? new T.Box3().setFromObject(runnerMesh).union(new T.Box3().setFromObject(biscMesh)) : null);
  shell.setFitTarget(sceneBox);
  /* Für welches Ergebnis der Anguss gerade Ankunftsfarben trägt. */
  let paintedFor = null;

  /* ── Gemeinsamer Teil: Verfahren, Lauf, Bild ─────────────── */
  const core = createSimCore({
    host, state, group, kind: 'anguss',
    until: 'bis zur ersten Ankunft',
    problem: () => (state.graph && state.timeline ? {
      kind: 'anguss', graph: state.graph, net: state.net, piston: state.piston,
      tMax: state.tMax, tExpect: state.tExpect, runnerVolume: state.flow ? state.flow.runnerVolume : 0,
      alloy: F.ALLOYS[state.proc.alloy] || F.ALLOYS.al
    } : null),
    blocked: () => (state.graph ? 'Keine DieLogic-Kurve: ' + state.curveError : 'Noch kein Angusssystem geladen.'),
    frameText: snap => ({ time: fmtUnit(snap.t * 1000, 'ms', 1), info: 'Anguss zu ' + fmtUnit(snap.filled * 100, '%') + ' gefüllt' }),
    meltVisible: () => showNow() === 'schmelze',
    onFrame: (snap, r) => applyLook(r),
    render: renderTable
  });

  /* Was im Ergebnis zu sehen ist. „Ankunft" kennt nur das Gitter: steht das
     Bild der Partikel da, gilt „Schmelze" — die Wahl selbst bleibt und greift
     wieder, sobald das Bild zum Gitter zurückkehrt. */
  function showNow() {
    const r = core.shown();
    return state.show === 'ankunft' && r && ENGINES[r.engine].paintArrival ? 'ankunft' : 'schmelze';
  }

  /* ── Angusssystem ────────────────────────────────────────── */
  function adoptGraph(g, name, proc, key) {
    state.ready = false;
    state.graph = g;
    state.name = name;
    state.sourceKey = key || name;
    /* Eine Werkbankdatei bringt ihren Prozess mit; sonst bleibt, was eingestellt ist. */
    if (proc) for (const k of PROC_KEYS) if (proc[k] !== undefined) state.proc[k] = proc[k];
    state.sourceProc = { ...state.proc };
    syncProcFields();
    setTris(biscMesh, biscuitMesh(g.biscuit));
    core.autoCell();
    updateCurve();
    setSourceChip(name);
    shell.fit(sceneBox());
    state.ready = true;
    /* Zu DIESEM System gehören die Einstellungen — sind welche gemerkt, kommen sie jetzt. */
    host.settingsFor(state.sourceKey);
  }

  function syncProcFields() {
    ui('alloy').value = state.proc.alloy;
    ui('vol').value = fmtPlain(state.proc.volume, 1);
    ui('chamber-len').value = fmtPlain(state.proc.chamberLen, 0);
  }

  function modelVolumes() {
    const b = state.graph.biscuit;
    return {
      part: state.proc.volume * 1000, overflow: 0,
      runner: state.flow ? state.flow.runnerVolume : NaN,
      biscuit: Math.PI * b.d * b.d / 4 * b.t
    };
  }

  /* Die Schusskurve mit der Kammer von hier — wie im Angussdesigner. Jede
     Änderung daran ist ein anderes Problem: beide Ergebnisse gehen. */
  function updateCurve() {
    const g = state.graph;
    F.applyAutoGates(g, state.proc);
    state.net = sampleNetwork(g);
    /* Die Anschnitte folgen dem Prozess (applyAutoGates) — der Körper im Bild auch. */
    setTris(runnerMesh, sweepRunner(state.net));
    paintedFor = null;
    state.flow = F.analyseFlow(g, state.net, state.proc);
    const tl = shotTimeline(design.values, modelVolumes(), { diam: g.biscuit.d, length: state.proc.chamberLen });
    if (tl.error) {
      state.timeline = null; state.flowShown = null; state.piston = null; state.curveError = tl.error;
    } else {
      state.timeline = tl; state.curveError = '';
      state.flowShown = flowOnCurve(state.flow, tl);
      state.piston = pistonCurve(tl);
      /* Wie lange höchstens: bis zum Ende der Kurve oder dem Dreifachen der
         1D-Schätzung; erwartet wird das Doppelte (für die Zeile „grob … s"). */
      const t1d = state.flowShown.gates.map(r => r.tArrive - tl.tFull).filter(Number.isFinite);
      const last = t1d.length ? Math.max(...t1d) : 0;
      state.tMax = Math.min(state.piston.tEnd, Math.max(0.03, last ? 3 * last : 0.05));
      state.tExpect = Math.min(state.tMax, Math.max(0.02, 2 * last));
    }
    renderSystem();
    renderCurve();
    core.invalidate();
  }

  function renderSystem() {
    const g = state.graph;
    if (!g) return;
    const gates = G.allNodes(g).filter(n => n.type === 'gate');
    kpis(ui('graph-kpis'), [
      { label: 'Anschnitte', value: fmt(gates.length, 0) },
      { label: 'Pressrest', value: 'Ø ' + fmt(g.biscuit.d, 0) + ' × ' + fmt(g.biscuit.t, 0) + ' mm' },
      { label: 'Laufkanäle', value: state.flow ? fmtUnit(state.flow.runnerVolume / 1000, 'cm³') : '—' }
    ]);
  }

  function renderCurve() {
    const tl = state.timeline;
    ui('curve-warn').textContent = tl ? (tl.warn || '') : 'Keine DieLogic-Kurve: ' + state.curveError;
    if (!tl) { kpis(ui('curve-kpis'), []); return; }
    kpis(ui('curve-kpis'), [
      { label: 'Füllkammer', value: 'Ø ' + fmt(tl.v.diam, 0) + ' × ' + fmt(tl.v.length, 0) + ' mm', note: 'Füllgrad ' + fmtUnit(tl.phi * 100, '%') },
      { label: 'Kammer voll', value: 'bei ' + fmtUnit(tl.tFull * 1000, 'ms', 0), note: 'Kolben ' + fmtUnit(tl.shot.events[0].v, 'm/s') + ', ab hier zählen alle Zeiten' },
      { label: '2. Phase', value: 'v₂ ' + fmtUnit(tl.v2, 'm/s'), note: 'die Kurve endet ' + fmtUnit(state.piston.tEnd * 1000, 'ms', 0) + ' nach „Kammer voll"' }
    ]);
  }

  /* ── Ergebnis: Ankunft je Anschnitt, beide Verfahren und 1D ─ */
  function renderTable() {
    if (!state.graph) return;
    const one = state.flowShown ? state.flowShown.gates : [];
    const t1d = id => { const r = one.find(x => x.id === id); return r && Number.isFinite(r.tArrive) ? r.tArrive - state.timeline.tFull : NaN; };
    const ids = G.allNodes(state.graph).filter(n => n.type === 'gate').map(n => n.id);
    const shownNow = core.shown();
    const res = core.ids.map(id => state.results[id]);
    const tSim = (r, id) => { const gt = r && r.gates.find(x => x.id === id); return gt ? gt.tSim : NaN; };
    /* Die 1D-Zeit steht auch im Ergebnis des Laufs — für Testgriffe und Skripte. */
    for (const r of res) if (r) for (const gt of r.gates) gt.t1d = t1d(gt.id);
    const spread = ts => { const f = ts.filter(Number.isFinite); return f.length > 1 ? fmtFixed((Math.max(...f) - Math.min(...f)) * 1000, 1) : '—'; };
    compareTable(ui('result-table'), {
      caption: 'Ankunft in ms ab „Kammer voll"',
      cols: [
        ...core.ids.map((id, i) => ({ label: ENGINES[id].short || ENGINES[id].label, off: !res[i], shown: !!shownNow && shownNow.engine === id && !!res[i] })),
        { label: '1D' }
      ],
      rows: [
        ...ids.map(id => ({
          label: G.TYPES.gate.label + ' ' + id,
          cells: [...res.map(r => (r ? (Number.isFinite(tSim(r, id)) ? ms1(tSim(r, id)) : 'nie') : '—')), ms1(t1d(id))]
        })),
        { label: 'Δ erster bis letzter', sum: true, cells: [...res.map(r => (r ? spread(ids.map(id => tSim(r, id))) : '—')), spread(ids.map(t1d))] }
      ]
    });
    const r = shownNow;
    /* Ankunftsfarben kennt nur das Gitter: beim Bild der Partikel gibt es
       nichts zu wählen, also keine Zeile (die Hilfe sagt, warum). */
    ui('show-row').hidden = !(r && ENGINES[r.engine].paintArrival);
    segButtonSet(ui('show-seg'), showNow());
  }

  /* Wie der Anguss aussieht: durchscheinend — oder, im Ergebnis mit „Ankunft",
     nach der Ankunft der Front gefärbt (das Bild der Schmelze macht core.js). */
  function applyLook(r) {
    const eng = r ? ENGINES[r.engine] : null;
    const arrival = !!r && showNow() === 'ankunft';
    /* Färben kostet einen Gang über alle Ecken — einmal je Ergebnis. */
    if (arrival && paintedFor !== r) { r.tArrivalMax = eng.paintArrival(r, runnerMesh); paintedFor = r; }
    runnerMesh.material = arrival ? colorMat : runnerMat;
    for (const m of [runnerMat, biscMat]) {
      m.opacity = state.opacity;
      m.transparent = state.opacity < 1;
      m.depthWrite = state.opacity >= 1;
      m.needsUpdate = true;
    }
    if (arrival) {
      colorbar({
        title: 'Ankunft ab Kammer voll',
        stops: gradient(t => rgbCss(turbo(t))),
        ticks: [fmtUnit(r.tArrivalMax * 1000, 'ms', 1), fmtUnit(r.tArrivalMax * 500, 'ms', 1), '0 ms'],
        extra: '<span class="chip" style="background:rgb(184,194,199)"></span> nie erreicht'
      });
    }
    view.invalidate();
  }

  /* ── Quelle: der Chip der Kopfzeile wird zum Anguss-Chip ─── */
  /* Der Rahmen kennt nur „Bauteil" und blendet seinen Chip für Werkzeuge
     ohne Bauteil aus. Dieses Werkzeug HAT eine Quelle — dieselbe Stelle,
     dieselbe Geste, nur steht „Anguss" daran und die Klappe nimmt JSON. */
  const inFrame = sel => shell.root.querySelector(sel);
  function setSourceChip(name) {
    shell.header.setPart(name, 'Anguss');
    ui('part-chip').title = 'Angusssystem wählen oder laden';
  }
  function mountSource() {
    ui('part').hidden = false;
    const sel = inFrame('#demo-select'), input = inFrame('#stl-input'), btn = inFrame('#stl-btn');
    inFrame('[data-ui="part-pop"] label.row span').textContent = 'Beispiel';
    sel.innerHTML = DEMOS.map(d => '<option value="' + d.id + '">' + d.label + '</option>').join('');
    sel.addEventListener('change', e => pickDemo(e.target.value));
    input.setAttribute('accept', '.json,application/json');
    btn.textContent = 'Angussdatei öffnen …';
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; if (f) host.openFile(f); e.target.value = ''; });
    inFrame('.st-pop-hint').textContent = 'Eine Datei des Angussdesigners oder der Werkbank (JSON). Sie lässt sich auch in den Viewport ziehen.';
    inFrame('[data-ui="part-pop"] details').hidden = true;
    ui('drop-hint').textContent = 'Angussdatei (JSON) hier ablegen';
  }

  function pickDemo(id) {
    const d = DEMOS.find(x => x.id === id) || DEMOS[0];
    inFrame('#demo-select').value = d.id;
    inFrame('#model-warn').textContent = '';
    ui('graph-note').textContent = '';
    ui('graph-warn').textContent = '';
    adoptGraph(d.build(), d.label, null, 'beispiel-' + d.id);
  }

  /* Eine Angussdatei — oder eine Werkbankdatei, die einen Anguss samt Prozess
     enthält. Der Rahmen liest und erkennt die Datei (host.openFile) und
     reicht hierher, was nicht die eigenen Einstellungen sind. */
  function openJSON(obj, name) {
    const src = obj.format === 'dielogic-werkbank' && obj.anguss ? obj.anguss : obj;
    let g;
    try { g = G.fromJSON(src); }
    catch (err) {
      ui('graph-warn').textContent = 'Die Datei „' + name + '" konnte nicht gelesen werden: ' + err.message;
      throw err;
    }
    inFrame('#demo-select').selectedIndex = -1;
    inFrame('#model-warn').textContent = '';
    ui('graph-warn').textContent = '';
    ui('graph-note').textContent = 'Geladen: ' + name;
    /* Kein eigener Toast: adoptGraph meldet gegebenenfalls „Einstellungen
       übernommen" mit „Zurücksetzen" — den würde er verdrängen. */
    adoptGraph(g, name.replace(/\.json$/i, ''), obj.prozess || null);
  }

  /* ── Modi ────────────────────────────────────────────────── */
  const modes = MODES.map(m => ({ ...m }));
  for (const m of modes) { m.primary = core.primary; m.enter = () => core.applyView(); m.leave = () => core.stopPlay(); }

  /* ── Verdrahtung ─────────────────────────────────────────── */
  let wired = false;
  const changed = label => { if (wired) host.changed(label); };
  let opacityEl = null;
  const urlEngine = engineFromUrl();
  let starting = true;

  function mounted() {
    mountSource();
    host.openJSON = openJSON;
    ui('alloy').innerHTML = Object.entries(F.ALLOYS).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
    ui('alloy').addEventListener('change', e => { state.proc.alloy = e.target.value; updateCurve(); changed('Legierung'); });
    numberInput(ui('vol'), v => { state.proc.volume = v; updateCurve(); changed('Gussvolumen'); return v; }, { min: VOLUME[0], max: VOLUME[1], unit: 'cm³' });
    numberInput(ui('chamber-len'), v => { state.proc.chamberLen = v; updateCurve(); changed('Füllkammerlänge'); return v; }, { min: CHAMBER[0], max: CHAMBER[1], unit: 'mm' });
    segButtons(ui('show-seg'), v => { state.show = v; core.applyView(); changed('Zeigen'); });
    const pop = shell.darstellung(DARSTELLUNG);
    opacityEl = pop.querySelector('[data-ui="opacity"]');
    slider(opacityEl, v => { state.opacity = v / 100; applyLook(shell.mode === 'ergebnis' ? core.shown() : null); changed('Deckkraft'); }, v => v + ' %');
    core.mounted();
    wired = true;
  }

  /* ── Einstellungen: merken, laden, zurücksetzen ──────────── */
  const toJSON = () => ({
    format: FORMAT, version: FORMAT_VERSION, ...core.settings(),
    proc: { alloy: state.proc.alloy, volume: state.proc.volume, chamberLen: state.proc.chamberLen },
    show: state.show, opacity: state.opacity
  });
  function fromJSON(obj) {
    if (!obj || obj.format !== FORMAT) throw new Error('Das ist keine Datei der Angussfüllung.');
    if (!(obj.version <= FORMAT_VERSION)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
    const p = obj.proc || {};
    const before = JSON.stringify([state.proc.alloy, state.proc.volume, state.proc.chamberLen]);
    if (F.ALLOYS[p.alloy]) state.proc.alloy = p.alloy;
    if (Number.isFinite(p.volume)) state.proc.volume = Math.max(VOLUME[0], Math.min(VOLUME[1], p.volume));
    if (Number.isFinite(p.chamberLen)) state.proc.chamberLen = Math.max(CHAMBER[0], Math.min(CHAMBER[1], p.chamberLen));
    syncProcFields();
    /* Nur ein anderer Prozess ist ein anderes Problem — Verfahren, Auflösung
       und Anzeige lassen ein Ergebnis stehen. */
    if (state.graph && before !== JSON.stringify([state.proc.alloy, state.proc.volume, state.proc.chamberLen])) updateCurve();
    core.applySettings(obj, { keepEngine: starting && !!urlEngine });
    state.show = obj.show === 'ankunft' ? 'ankunft' : 'schmelze';
    segButtonSet(ui('show-seg'), state.show);
    state.opacity = Number.isFinite(obj.opacity) ? Math.max(0.05, Math.min(1, obj.opacity)) : 0.3;
    opacityEl.value = String(Math.round(state.opacity * 100));
    opacityEl.parentNode.querySelector('.val').textContent = opacityEl.value + ' %';
    core.renderResults();
    host.refreshActions();
  }
  const resetSettings = () => fromJSON({
    format: FORMAT, version: FORMAT_VERSION, engine: urlEngine || core.defaultEngine, cell: {},
    proc: state.sourceProc, show: 'schmelze', opacity: 0.3
  });

  /* Erst fragen, ob die Grafikkarte wirklich mitmacht (engines/env.js) —
     Vorschlag und Grenzen hängen daran —, dann das Beispiel. */
  async function start() {
    await probeGpu();
    pickDemo(new URLSearchParams(location.search).get('demo'));
    starting = false;
  }

  const tool = {
    id: 'angussfuellung', modes, startMode: 'system', settingsOnly: true,
    mounted, start, toJSON, fromJSON, resetSettings, accepts: [FORMAT], exports: [],
    /* „beispiel-zwei" statt des langen Beispielnamens mit Klammern — daraus wird der Dateiname. */
    docName: () => state.sourceKey || 'anguss',
    state, group
  };
  tool.__viewer = {
    state, view, shell, host, tool, core, group, runnerMesh, biscMesh,
    simulate: core.simulate, showFrame: core.showFrame, pickDemo, adoptGraph,
    get meltMesh() { return core.displays.lbm.object; },
    get points() { return core.displays.sph.points; },
    get gpu() { return env.gpu; },
    /* Was eingepasst wird — tests/browser/ux.spec.mjs misst daran, ob das Modell im Bild liegt. */
    get partMesh() { return runnerMesh; }
  };
  return tool;
}
