/* Angussfüllung mit Partikeln (angussfuellung-sph.html) — Einstieg und
   Verdrahtung. Dieselbe Seite wie die Gitterrechnung (js/lbm/app.js):
   Angusssystem, Prozess, Schusskurve, ein Knopf — nur rechnet hier SPH
   (js/sph/wcsph.js, gpu.js): der Pressrest voll Partikel, dahinter die
   Säule des Zustroms, die der Kolben mit der Kurve vor sich her schiebt
   (js/sph/domain.js), die Wände als Abstandsfeld aus dem Rollenraster
   der Gitterseite.
   Heraus kommt dasselbe: Ankunft je Anschnitt neben der 1D-Rechnung,
   der Füllgrad des Angusses über die Zeit, die Partikel zu jeder Zeit
   am Regler, nach Geschwindigkeit gefärbt. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { $, fmt, fmtPlain, facts, segButtons, slider, numberInput, colorbar } from '../ui/controls.js';
import { setTris, readBuffer, looksLikeJSON } from '../ui/common.js';
import * as G from '../runner/graph.js';
import { DEMOS } from '../runner/presets.js';
import { sampleNetwork } from '../runner/curve.js';
import { sweepRunner, biscuitMesh } from '../runner/sweep.js';
import * as F from '../runner/flow.js';
import { shotTimeline, flowOnCurve } from '../runner/shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { pistonCurve, minRunnerArea } from '../lbm/piston.js';
import { speedColorbar } from '../lbm/paint.js';
import { runnerSetup, suggestSpacingRunner, particleCountRunner, runnerFillFraction, MAX_PARTICLES, MAX_PARTICLES_CPU } from './domain.js';
import { createSphSolver, suggestDt, PARAMS, NEVER } from './wcsph.js';
import { createGpuSphSolver, hasWebGPU } from './gpu.js';
import { runSph } from './run.js';
import { createPoints, showParticles, speedScaleParticles } from './points.js';

const container = $('viewport');
const busy = $('busy');
const view = initScene(container, {
  cameraStart: [230, 210, 280], target: [0, 0, 60],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = {
  graph: null, name: '', net: null,
  proc: { ...F.DEFAULT_PROCESS },
  d: 3, timeline: null, flow: null, flowShown: null, piston: null, tMax: 0, travel: 0,
  setup: null, result: null,
  running: false, cancel: false,
  show: 'schmelze', frame: 0, playing: null, opacity: 0.3,
  forceCpu: false, openGates: true, ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);
const runnerMat = new T.MeshStandardMaterial({
  color: 0x008c82, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, flatShading: true,
  transparent: true, opacity: 0.3, depthWrite: false
});
const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
group.add(runnerMesh);
const biscMat = new T.MeshStandardMaterial({
  color: 0x93a6b0, roughness: 0.6, metalness: 0.06, side: T.DoubleSide, transparent: true, opacity: 0.3, depthWrite: false
});
const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
group.add(biscMesh);
let points = createPoints(state.d);
points.visible = false;
group.add(points);

const tick = () => new Promise(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/* ── Angusssystem ────────────────────────────────────────────── */
function adoptGraph(g, name, proc) {
  state.graph = g;
  state.name = name;
  if (proc) for (const k of ['alloy', 'volume', 'fillTime', 'vGate', 'cBranch', 'chamberLen']) if (proc[k] !== undefined) state.proc[k] = proc[k];
  $('alloy').value = state.proc.alloy;
  $('vol').value = fmtPlain(state.proc.volume, 1);
  $('chamber-len').value = fmtPlain(state.proc.chamberLen, 0);
  F.applyAutoGates(g, state.proc);
  state.net = sampleNetwork(g);
  setTris(runnerMesh, sweepRunner(state.net));
  setTris(biscMesh, biscuitMesh(g.biscuit));
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  facts('graph-facts', [
    ['Anschnitte', fmt(gates.length, 0)],
    ['Pressrest', 'Ø ' + fmt(g.biscuit.d, 0) + ' × ' + fmt(g.biscuit.t, 0) + ' mm']
  ]);
  clearResult();
  updateCurve();
  state.d = suggestSpacingRunner(g, state.flow ? state.flow.runnerVolume : 0, gpu ? 4e4 : 2.5e3);
  $('spacing').value = fmtPlain(state.d, 1);
  updateGridNote();
  view.fitTo(group);
  state.ready = true;
}

function modelVolumes() {
  const b = state.graph.biscuit;
  return {
    part: state.proc.volume * 1000, overflow: 0,
    runner: state.flow ? state.flow.runnerVolume : NaN,
    biscuit: Math.PI * b.d * b.d / 4 * b.t
  };
}

/* Die Schusskurve mit der Kammer von hier — wie im Angussdesigner; dazu
   der Kolbenweg des Laufs, so lang wird die Säule des Zustroms. */
function updateCurve() {
  const g = state.graph;
  F.applyAutoGates(g, state.proc);
  state.net = sampleNetwork(g);
  state.flow = F.analyseFlow(g, state.net, state.proc);
  const tl = shotTimeline(design.values, modelVolumes(), { diam: g.biscuit.d, length: state.proc.chamberLen });
  if (tl.error) {
    state.timeline = null; state.flowShown = null; state.piston = null;
    facts('curve-facts', []);
    $('curve-warn').textContent = 'Keine DieLogic-Kurve: ' + tl.error;
    $('run').disabled = true;
    return;
  }
  state.timeline = tl;
  state.flowShown = flowOnCurve(state.flow, tl);
  state.piston = pistonCurve(tl);
  const t1d = state.flowShown.gates.map(r => r.tArrive - tl.tFull).filter(Number.isFinite);
  state.tMax = Math.min(state.piston.tEnd, Math.max(0.03, t1d.length ? 3 * Math.max(...t1d) : 0.05));
  let s = 0;
  const nInt = 400;
  for (let i = 0; i < nInt; i++) s += state.piston.v((i + 0.5) / nInt * state.tMax) * state.tMax / nInt;
  state.travel = s * 1000;                                              // mm
  const sh = tl.shot;
  facts('curve-facts', [
    ['Füllkammer', 'Ø ' + fmt(tl.v.diam, 0) + ' × ' + fmt(tl.v.length, 0) + ' mm · Füllgrad ' + fmt(tl.phi * 100, 0) + ' %'],
    ['Kammer voll', 'bei ' + fmt(tl.tFull * 1000, 0) + ' ms · Kolben ' + fmt(sh.events[0].v, 2) + ' m/s'],
    ['2. Phase', 'v₂ ' + fmt(tl.v2) + ' m/s · Kurve endet ' + fmt(state.piston.tEnd * 1000, 0) + ' ms danach'],
    ['1D-Rechnung', state.flowShown.gates.map(r => G.TYPES.gate.label + ' ' + r.id + ' '
      + (Number.isFinite(r.tArrive) ? fmt((r.tArrive - tl.tFull) * 1000, 1) + ' ms' : '—')).join(' · ')]
  ]);
  $('curve-warn').textContent = tl.warn || '';
  updateGridNote();
}

/* ── Partikel und Rechenwerk ─────────────────────────────────── */
const gpu = hasWebGPU();

function updateGridNote() {
  if (!state.graph) return;
  const count = particleCountRunner(state.graph, state.d, state.travel);
  const mb = count * 64 / 1048576;
  $('grid-note').textContent = fmt(count / 1e3, 1) + ' Tsd. Partikel (Pressrest und Säule für ' + fmt(state.travel, 0) + ' mm Kolbenweg) · '
    + fmt(mb, 0) + ' MB auf der Grafikkarte';
  const limit = gpu ? MAX_PARTICLES : MAX_PARTICLES_CPU;
  const notes = [];
  if (!gpu) notes.push('Kein WebGPU in diesem Browser: gerechnet wird in JavaScript, mit wenigen Partikeln (bis ' + fmt(limit / 1e3, 0) + ' Tsd.), und das dauert Minuten. Chrome oder Edge rechnen auf der Grafikkarte.');
  if (count > limit) notes.push('Zu fein: höchstens ' + fmt(limit / 1e3, 0) + ' Tsd. Partikel. Den Abstand vergrößern.');
  $('engine-note').textContent = notes.join(' ');
  $('run').disabled = state.running || !state.timeline || count > limit;
}

function clearResult() {
  state.result = null;
  state.frame = 0;
  stopPlay();
  points.visible = false;
  $('t-slider').max = '0';
  $('t-slider').value = '0';
  $('t-row').classList.add('disabled');
  $('play').disabled = true;
  facts('result-facts', []);
  $('run-note').textContent = '';
  $('run-note').className = 'run-note';
  applyShow();
}

async function simulate() {
  if (state.running || !state.graph || !state.timeline) return;
  state.running = true; state.cancel = false;
  $('run').disabled = true;
  $('run').textContent = 'Rechnet …';
  clearResult();
  const g = state.graph;
  const t0 = performance.now();
  let solver = null;
  try {
    busy.textContent = 'Partikel …'; busy.classList.add('on');
    await tick();
    const piston = state.piston;
    const alloy = F.ALLOYS[state.proc.alloy] || F.ALLOYS.al;
    /* Bezugsgeschwindigkeit: der Kolbenstrom durch den kleinsten
       Laufkanalquerschnitt — wie der Zeitschritt der Gitterrechnung. */
    const aMin = minRunnerArea(state.net);
    const vRef = Math.max(piston.vMax * piston.A / aMin, piston.vMax, 1e-3);
    const c0 = PARAMS.cMach * vRef;
    const setup = await runnerSetup(g, state.d, {
      rho0: alloy.rho, c0, travel: state.travel,
      onProgress: (p, what) => { busy.textContent = 'Partikel · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
    });
    state.setup = setup;
    /* state.openGates: ohne Auslass bleibt der Anguss für die Partikel
       eine Sackgasse — für den Vergleich im Browser-Test. */
    if (!state.openGates) setup.boundary.OUTLET = 0xFFFF;
    const dt = suggestDt({ h: setup.h, c0, vRef });
    const engine = gpu && !state.forceCpu ? 'gpu' : 'cpu';
    solver = engine === 'gpu' ? await createGpuSphSolver(setup) : createSphSolver(setup);
    const stepsMax = Math.max(10, Math.ceil(state.tMax / dt));
    const snapEvery = Math.max(1, Math.ceil(stepsMax / 80));
    /* Der Kolbenweg je Schritt — die Drossel der Anschnitte zählt damit. */
    const sTable = new Float64Array(stepsMax + 2);
    for (let k = 1; k < sTable.length; k++) sTable[k] = sTable[k - 1] + 0.5 * (piston.v((k - 1) * dt) + piston.v(k * dt)) * dt;
    const ctrlAt = step => ({ uIn: piston.v(step * dt), piston: sTable[Math.min(step, sTable.length - 1)] });
    group.remove(points); points = createPoints(state.d); points.visible = false; group.add(points);
    const run = await runSph({
      solver, engine, dt, stepsMax, snapEvery, ctrlAt, gates: setup.gates,
      isCancelled: () => state.cancel,
      onWork: step => { busy.textContent = 'Rechnet … ' + fmt(step * dt * 1000, 1) + ' ms'; },
      onSnapshot: (snap, gateDone) => {
        snap.t = snap.step * dt;
        snap.filled = runnerFillFraction(snap.pos, snap.n, setup, 1e-3);
        busy.textContent = 'Rechnet … ' + fmt(snap.t * 1000, 1) + ' ms · Anguss ' + fmt(snap.filled * 100, 0) + ' % · Schritt ' + fmt(snap.step, 0);
        $('run-note').textContent = busy.textContent;
        return gateDone.every(a => a !== NEVER) ? 'alle Anschnitte erreicht' : null;
      }
    });
    const { snapshots, gateDone } = run;
    snapshots[0].t = 0; snapshots[0].filled = runnerFillFraction(snapshots[0].pos, snapshots[0].n, setup, 1e-3);
    const reason = run.reason === 'Schrittgrenze erreicht'
      ? (state.tMax >= piston.tEnd - 1e-9 ? 'die Kurve endet' : 'Zeitgrenze erreicht') : run.reason;
    const gates = setup.lbm.gates.map((gt, k) => {
      const r1 = state.flowShown.gates.find(x => x.id === gt.id);
      return {
        id: gt.id, step: gateDone[k],
        tSim: gateDone[k] === NEVER ? NaN : gateDone[k] * dt,
        t1d: r1 && Number.isFinite(r1.tArrive) ? r1.tArrive - state.timeline.tFull : NaN
      };
    });
    const first = Math.min(...gateDone.filter(a => a !== NEVER), Infinity);
    const before = snapshots.filter(s => s.step <= first);
    state.result = {
      snapshots, gates, engine, steps: run.steps, ms: performance.now() - t0, reason,
      filled: snapshots[snapshots.length - 1].filled, dt, c0, h: setup.h, n: setup.n, nFluid: setup.nFluid, nInflow: setup.nInflow,
      vScale: speedScaleParticles(before.length > 1 ? before : snapshots)
    };
    state.frame = snapshots.length - 1;
    $('t-slider').max = String(snapshots.length - 1);
    $('t-slider').value = String(state.frame);
    $('t-row').classList.remove('disabled');
    $('play').disabled = false;
    updateResultFacts();
    applyShow();
  } catch (err) {
    $('run-note').textContent = 'Die Rechnung ist gescheitert: ' + (err && err.message || err);
    $('run-note').className = 'run-note stale';
    console.error(err);
  } finally {
    if (solver && solver.dispose) solver.dispose();
    busy.classList.remove('on');
    state.running = false;
    $('run').textContent = 'Simulieren';
    updateGridNote();
  }
}

function updateResultFacts() {
  const r = state.result;
  if (!r) return;
  const rows = [];
  for (const gt of r.gates) {
    rows.push([G.TYPES.gate.label + ' ' + gt.id,
      (Number.isFinite(gt.tSim) ? fmt(gt.tSim * 1000, 1) + ' ms' : 'nicht erreicht')
      + ' · 1D ' + (Number.isFinite(gt.t1d) ? fmt(gt.t1d * 1000, 1) + ' ms' : '—')]);
  }
  rows.push(['Anguss gefüllt', fmt(r.filled * 100, 0) + ' % am Ende (' + fmt(r.snapshots[r.snapshots.length - 1].t * 1000, 1) + ' ms)']);
  rows.push(['Ende', r.reason]);
  rows.push(['Rechnung', fmt(r.steps, 0) + ' Schritte · ' + fmt(r.nFluid / 1e3, 1) + ' Tsd. Partikel im Pressrest, ' + fmt(r.nInflow / 1e3, 1) + ' Tsd. in der Säule · '
    + fmt(r.ms / 1000, 1) + ' s · ' + (r.engine === 'gpu' ? 'WebGPU' : 'JavaScript')]);
  rows.push(['Partikel', 'Δt ' + fmt(r.dt * 1e6, 2) + ' µs · h ' + fmt(r.h * 1000, 1) + ' mm · c₀ ' + fmt(r.c0, 0) + ' m/s · Abstand ' + fmt(state.d, 1) + ' mm']);
  facts('result-facts', rows);
  $('run-note').textContent = 'Zeiten ab „Kammer voll" (' + fmt(state.timeline.tFull * 1000, 0) + ' ms nach Kolbenstart).';
  $('run-note').className = 'run-note';
}

/* ── Anzeige ─────────────────────────────────────────────────── */
function showFrame(k) {
  const r = state.result;
  if (!r) return;
  const snap = r.snapshots[Math.max(0, Math.min(r.snapshots.length - 1, k))];
  state.frame = k;
  $('t-val').textContent = fmt(snap.t * 1000, 1) + ' ms · ' + fmt(snap.filled * 100, 0) + ' %';
  if (state.show !== 'schmelze') { points.visible = false; view.invalidate(); return; }
  showParticles(points, snap, r.vScale);
  view.invalidate();
}

function applyShow() {
  const r = state.result;
  runnerMat.opacity = state.opacity;
  runnerMat.transparent = state.opacity < 1;
  runnerMat.depthWrite = state.opacity >= 1;
  runnerMat.needsUpdate = true;
  if (state.show === 'schmelze' && r) { showFrame(state.frame); colorbar(speedColorbar(r.vScale, 'bis zur ersten Ankunft')); }
  else { points.visible = false; colorbar(null); }
  view.invalidate();
}

function stopPlay() {
  if (state.playing) { clearInterval(state.playing); state.playing = null; }
  $('play').textContent = '▶ Abspielen';
}
function togglePlay() {
  if (state.playing) { stopPlay(); return; }
  if (!state.result) return;
  $('play').textContent = '⏸ Anhalten';
  if (state.frame >= state.result.snapshots.length - 1) state.frame = 0;
  state.playing = setInterval(() => {
    if (!state.result) { stopPlay(); return; }
    state.frame = state.frame + 1;
    if (state.frame >= state.result.snapshots.length) { state.frame = state.result.snapshots.length - 1; stopPlay(); }
    $('t-slider').value = String(state.frame);
    showFrame(state.frame);
  }, 120);
}

/* ── Bedienung ───────────────────────────────────────────────── */
$('demo-select').innerHTML = DEMOS.map(d => '<option value="' + d.id + '">' + d.label + '</option>').join('');
$('demo-select').addEventListener('change', e => pickDemo(e.target.value));
function pickDemo(id) {
  const d = DEMOS.find(x => x.id === id) || DEMOS[0];
  $('demo-select').value = d.id;
  $('graph-note').textContent = '';
  $('graph-warn').textContent = '';
  adoptGraph(d.build(), d.label);
}

$('alloy').innerHTML = Object.entries(F.ALLOYS).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
$('alloy').addEventListener('change', e => { state.proc.alloy = e.target.value; updateCurve(); });
numberInput('vol', v => { state.proc.volume = Math.max(1, Math.min(1e5, v)); updateCurve(); return state.proc.volume; });
numberInput('chamber-len', v => { state.proc.chamberLen = Math.max(50, Math.min(3000, v)); updateCurve(); return state.proc.chamberLen; });
numberInput('spacing', v => { state.d = Math.max(0.5, Math.min(20, v)); updateGridNote(); return state.d; });
$('run').addEventListener('click', () => { if (state.running) state.cancel = true; else simulate(); });
segButtons('show-seg', v => { state.show = v; applyShow(); });
slider('t-slider', v => { stopPlay(); showFrame(v); }, () => '');
$('play').addEventListener('click', togglePlay);
slider('opacity', v => { state.opacity = v / 100; applyShow(); }, v => v + ' %');

$('json-btn').addEventListener('click', () => $('json-input').click());
$('json-input').addEventListener('change', e => { if (e.target.files[0]) readAny(e.target.files[0]); });
for (const ev of ['dragenter', 'dragover']) container.addEventListener(ev, e => { e.preventDefault(); container.classList.add('dragover'); });
for (const ev of ['dragleave', 'drop']) container.addEventListener(ev, e => { e.preventDefault(); container.classList.remove('dragover'); });
container.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) readAny(f); });

async function readAny(file) {
  try {
    const buf = await readBuffer(file);
    if (!looksLikeJSON(buf)) throw new Error('keine JSON-Datei');
    const obj = JSON.parse(new TextDecoder().decode(buf));
    const src = obj.format === 'dielogic-werkbank' && obj.anguss ? obj.anguss : obj;
    const g = G.fromJSON(src);
    $('demo-select').selectedIndex = -1;
    $('graph-note').textContent = 'Geladen: ' + file.name;
    $('graph-warn').textContent = '';
    adoptGraph(g, file.name.replace(/\.json$/i, ''), obj.prozess || null);
  } catch (err) {
    $('graph-warn').textContent = 'Die Datei „' + file.name + '" konnte nicht gelesen werden: ' + err.message;
    console.error(err);
  }
}

pickDemo(new URLSearchParams(location.search).get('demo'));

export const __viewer = { state, view, simulate, showFrame, pickDemo, adoptGraph, runnerMesh, biscMesh, get points() { return points; }, group, gpu };
window.__angussfuellungSph = __viewer;
