/* Angussfüllung (angussfuellung.html) — Einstieg und Verdrahtung.

   Ein Angusssystem aus dem Angussdesigner (Beispiel oder JSON), die
   Schusskurve des Projekts, ein Knopf: die Schmelze steht im Pressrest,
   der Kolben schiebt mit der Kurve, und die Front läuft durch die
   Laufkanäle bis zu den Anschnitten — Lattice-Boltzmann mit freier
   Oberfläche (js/lbm/fslbm.js), auf der Grafikkarte (js/lbm/gpu.js) oder,
   ohne WebGPU, in JavaScript auf grobem Gitter.

   Ablauf beim Knopf: Gitter aus Anguss und Pressrest (js/lbm/domain.js),
   Einheiten aus Kurve und Querschnitten (js/lbm/piston.js), dann
   Schritte in Paketen mit Bildern des Füllstands dazwischen, bis alle
   Anschnitte gemeldet sind oder die Kurve endet. Danach: Ankunft je
   Anschnitt neben der 1D-Rechnung des Angussdesigners, der Füllstand zu
   jeder Zeit am Regler — die Schmelze nach Geschwindigkeit gefärbt
   (js/lbm/paint.js) —, der Anguss nach Ankunft. */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { $, fmt, fmtPlain, facts, segButtons, slider, numberInput, colorbar, gradient, rgbCss } from '../ui/controls.js';
import { setTris, readBuffer, looksLikeJSON } from '../ui/common.js';
import { turbo } from '../part/colors.js';
import { surfaceNets } from '../part/surfacenets.js';
import * as G from '../runner/graph.js';
import { DEMOS } from '../runner/presets.js';
import { sampleNetwork } from '../runner/curve.js';
import { sweepRunner, biscuitMesh } from '../runner/sweep.js';
import * as F from '../runner/flow.js';
import { shotTimeline, flowOnCurve } from '../runner/shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { buildDomain, suggestCell, cellCount, runnerMask, MAX_CELLS, MAX_CELLS_CPU } from './domain.js';
import { pistonCurve, minRunnerArea, latticeUnits } from './piston.js';
import { createSolver } from './fslbm.js';
import { createGpuSolver, hasWebGPU } from './gpu.js';
import { runSimulation } from './run.js';
import { paintMelt, speedScale, speedColorbar } from './paint.js';
import { NEVER } from './lattice.js';

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
  h: 2, timeline: null, flow: null, flowShown: null, piston: null,
  domain: null, units: null,
  result: null,          // { snapshots: [{ t, fill, speed, uMax }], arrival, gates, engine, steps, ms, filled, reason, uScale, vScale }
  running: false, cancel: false,
  show: 'schmelze', frame: 0, playing: null, opacity: 0.3,
  forceCpu: false, ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);

const runnerMat = new T.MeshStandardMaterial({
  color: 0x008c82, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, flatShading: true,
  transparent: true, opacity: 0.3, depthWrite: false
});
const colorMat = new T.MeshStandardMaterial({
  vertexColors: true, color: 0xffffff, roughness: 0.6, metalness: 0.05, side: T.DoubleSide, flatShading: true
});
const runnerMesh = new T.Mesh(new T.BufferGeometry(), runnerMat);
group.add(runnerMesh);
const biscMat = new T.MeshStandardMaterial({
  color: 0x93a6b0, roughness: 0.6, metalness: 0.06, side: T.DoubleSide, transparent: true, opacity: 0.3, depthWrite: false
});
const biscMesh = new T.Mesh(new T.BufferGeometry(), biscMat);
group.add(biscMesh);
/* Die Schmelze: deckend, je Ecke nach Geschwindigkeit gefärbt (js/lbm/paint.js). */
const meltMat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, flatShading: true });
const meltMesh = new T.Mesh(new T.BufferGeometry(), meltMat);
meltMesh.visible = false;
group.add(meltMesh);

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
  state.h = suggestCell(g, gpu ? 4e5 : 1.2e5);
  $('cell-h').value = fmtPlain(state.h, 1);
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  facts('graph-facts', [
    ['Anschnitte', fmt(gates.length, 0)],
    ['Pressrest', 'Ø ' + fmt(g.biscuit.d, 0) + ' × ' + fmt(g.biscuit.t, 0) + ' mm']
  ]);
  clearResult();
  updateCurve();
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

/* Die Schusskurve mit der Kammer von hier — wie im Angussdesigner. */
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

/* ── Gitter und Rechenwerk ───────────────────────────────────── */
const gpu = hasWebGPU();

function updateGridNote() {
  if (!state.graph) return;
  const { dims, count } = cellCount(state.graph, state.h);
  const mb = count * (19 * 2 * 4 + 7 * 4 + 6 * 4) / 1048576;
  $('grid-note').textContent = 'Gitter ' + dims.join(' × ') + ' = ' + fmt(count / 1e6, 2) + ' Mio. Zellen · '
    + fmt(mb, 0) + ' MB auf der Grafikkarte';
  const limit = gpu ? MAX_CELLS : MAX_CELLS_CPU;
  const notes = [];
  if (!gpu) notes.push('Kein WebGPU in diesem Browser: gerechnet wird in JavaScript, auf grobem Gitter (bis ' + fmt(MAX_CELLS_CPU / 1e3, 0) + ' Tsd. Zellen). Chrome oder Edge rechnen auf der Grafikkarte.');
  if (count > limit) notes.push('Zu fein: höchstens ' + fmt(limit / 1e6, 2) + ' Mio. Zellen. Die Zellkante vergrößern.');
  $('engine-note').textContent = notes.join(' ');
  $('run').disabled = state.running || !state.timeline || count > limit;
}

function clearResult() {
  state.result = null;
  state.frame = 0;
  stopPlay();
  meltMesh.visible = false;
  $('t-slider').max = '0';
  $('t-slider').value = '0';
  $('t-row').classList.add('disabled');
  $('play').disabled = true;
  facts('result-facts', []);
  $('run-note').textContent = '';
  $('run-note').className = 'run-note';
  applyShow();
}

/** Der Lauf. */
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
    busy.textContent = 'Gitter …'; busy.classList.add('on');
    await tick();
    const domain = await buildDomain(g, state.h, {
      onProgress: (p, what) => { busy.textContent = 'Gitter · ' + what + ' … ' + Math.round(p * 100) + ' %'; }
    });
    state.domain = domain;
    const piston = state.piston;
    const units = latticeUnits({
      h: state.h, vMax: piston.vMax, A: piston.A,
      aMin: minRunnerArea(domain.net), nu: (F.ALLOYS[state.proc.alloy] || F.ALLOYS.al).nu
    });
    state.units = units;
    /* state.forceCpu: der JavaScript-Kern auch mit WebGPU — für den
       Vergleich beider Kerne im Browser-Test. */
    const engine = gpu && !state.forceCpu ? 'gpu' : 'cpu';
    solver = engine === 'gpu' ? await createGpuSolver(domain) : createSolver(domain);

    /* Wie lange: bis alle Anschnitte gemeldet sind — dann noch ein
       Stück für das Bild —, spätestens am Ende der Kurve oder beim
       Dreifachen der 1D-Schätzung. */
    const t1d = state.flowShown.gates.map(r => r.tArrive - state.timeline.tFull).filter(Number.isFinite);
    const tMax = Math.min(piston.tEnd, Math.max(0.03, t1d.length ? 3 * Math.max(...t1d) : 0.05));
    const stepsMax = Math.max(10, Math.ceil(tMax / units.dt));
    const snapEvery = Math.max(1, Math.ceil(stepsMax / 80));
    const mask = runnerMask(domain);
    let maskCount = 0;
    for (let i = 0; i < domain.N; i++) maskCount += mask[i];
    const uAt = s => { const u = units.uIn(piston.v(s * units.dt)); return [domain.axis[0] * u, domain.axis[1] * u, domain.axis[2] * u]; };
    const filledOf = fill => { let f = 0; for (let i = 0; i < domain.N; i++) if (mask[i]) f += fill[i]; return maskCount ? f / (255 * maskCount) : 0; };
    const run = await runSimulation({
      solver, engine, domain, stepsMax, snapEvery, uAt,
      isCancelled: () => state.cancel,
      onWork: step => { busy.textContent = 'Rechnet … ' + fmt(step * units.dt * 1000, 1) + ' ms'; },
      onSnapshot: (snap, gateDone) => {
        snap.t = snap.step * units.dt;
        snap.filled = filledOf(snap.fill);
        busy.textContent = 'Rechnet … ' + fmt(snap.t * 1000, 1) + ' ms · Anguss ' + fmt(snap.filled * 100, 0) + ' % · Schritt ' + fmt(snap.step, 0);
        $('run-note').textContent = busy.textContent;
        return gateDone.every(a => a !== NEVER) ? 'alle Anschnitte erreicht' : null;
      }
    });
    const { snapshots, arrival, gateDone } = run;
    snapshots[0].t = 0; snapshots[0].filled = filledOf(snapshots[0].fill);
    const step = run.steps;
    const reason = run.reason === 'Schrittgrenze erreicht'
      ? (tMax >= piston.tEnd - 1e-9 ? 'die Kurve endet' : 'Zeitgrenze erreicht') : run.reason;
    const gates = domain.gates.map((gt, k) => {
      const r1 = state.flowShown.gates.find(x => x.id === gt.id);
      return {
        id: gt.id, step: gateDone[k],
        tSim: gateDone[k] === NEVER ? NaN : gateDone[k] * units.dt,
        t1d: r1 && Number.isFinite(r1.tArrive) ? r1.tArrive - state.timeline.tFull : NaN
      };
    });
    state.result = {
      snapshots, arrival, gates, engine, steps: step, ms: performance.now() - t0, reason,
      filled: snapshots[snapshots.length - 1].filled, dt: units.dt, tau0: units.tau0, N: domain.N
    };
    /* Die Skala aus den Bildern bis zur ersten Ankunft — danach
       herrschen die Anschnitte, und der Anguss wäre einfarbig blau. */
    const first = Math.min(...gateDone.filter(a => a !== NEVER), Infinity);
    const before = snapshots.filter(s => s.step <= first);
    state.result.uScale = speedScale(before.length > 1 ? before : snapshots);
    state.result.vScale = state.result.uScale * units.dx / units.dt;
    colourByArrival();
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
  rows.push(['Rechnung', fmt(r.steps, 0) + ' Schritte · ' + fmt(r.N / 1e6, 2) + ' Mio. Zellen · ' + fmt(r.ms / 1000, 1) + ' s · '
    + (r.engine === 'gpu' ? 'WebGPU' : 'JavaScript')]);
  rows.push(['Gitter', 'Δt ' + fmt(r.dt * 1e6, 2) + ' µs · τ ' + fmt(r.tau0, 3) + ' · Zellkante ' + fmt(state.h, 1) + ' mm']);
  facts('result-facts', rows);
  $('run-note').textContent = 'Zeiten ab „Kammer voll" (' + fmt(state.timeline.tFull * 1000, 0) + ' ms nach Kolbenstart).';
  $('run-note').className = 'run-note';
}

/* ── Anzeige ─────────────────────────────────────────────────── */

/* Die Schmelze zu einem Bild: Fläche des halben Füllstands aus dem
   Gitter, Stahl zählt als leer, damit die Fläche an der Wand zugeht;
   je Ecke die Geschwindigkeit als Farbe. */
function showFrame(k) {
  const r = state.result;
  if (!r || !state.domain) return;
  const snap = r.snapshots[Math.max(0, Math.min(r.snapshots.length - 1, k))];
  state.frame = k;
  $('t-val').textContent = fmt(snap.t * 1000, 1) + ' ms · ' + fmt(snap.filled * 100, 0) + ' %';
  if (state.show !== 'schmelze') { meltMesh.visible = false; view.invalidate(); return; }
  const d = state.domain;
  const data = new Float32Array(d.N);
  for (let i = 0; i < d.N; i++) data[i] = 0.5 - snap.fill[i] / 255;
  const tris = surfaceNets({ dims: d.dims, origin: d.origin, h: d.h, data }, 0);
  setTris(meltMesh, tris);
  paintMelt(meltMesh, snap, d, r.uScale);
  meltMesh.visible = tris.length > 0;
  view.invalidate();
}

/* Der Anguss nach Ankunft gefärbt: je Ecke des Netzes die früheste
   Ankunft der 27 umliegenden Zellen (die Ecke liegt auf der Wand; die
   nächsten Zellen sind oft Stahl, und auf der Deckfläche liegt die erste
   Schmelzezelle eine ganze Zelle tiefer). */
function colourByArrival() {
  const r = state.result, d = state.domain;
  if (!r || !d) return;
  const geo = runnerMesh.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  const [nx, ny, nz] = d.dims;
  let tMax = 0;
  for (const gt of r.gates) if (Number.isFinite(gt.tSim)) tMax = Math.max(tMax, gt.tSim);
  if (!(tMax > 0)) tMax = r.snapshots[r.snapshots.length - 1].t || 1;
  const grey = [0.72, 0.76, 0.78];
  for (let v = 0; v < n; v++) {
    const x = (pos.getX(v) - d.origin[0]) / d.h, y = (pos.getY(v) - d.origin[1]) / d.h, z = (pos.getZ(v) - d.origin[2]) / d.h;
    const i0 = Math.round(x), j0 = Math.round(y), k0 = Math.round(z);
    let best = NEVER;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = i0 + dx, j = j0 + dy, k = k0 + dz;
      if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
      const a = r.arrival[(k * ny + j) * nx + i];
      if (a < best) best = a;
    }
    const c = best === NEVER ? grey : turbo(Math.min(1, best * r.dt / tMax));
    col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
  }
  geo.setAttribute('color', new T.BufferAttribute(col, 3));
  state.result.tMax = tMax;
}

function applyShow() {
  const r = state.result;
  const ankunft = state.show === 'ankunft' && r && runnerMesh.geometry.getAttribute('color');
  runnerMesh.material = ankunft ? colorMat : runnerMat;
  runnerMat.opacity = state.opacity;
  runnerMat.transparent = state.opacity < 1;
  runnerMat.depthWrite = state.opacity >= 1;
  runnerMat.needsUpdate = true;
  if (ankunft) {
    colorbar({
      title: 'Ankunft ab Kammer voll',
      stops: gradient(t => rgbCss(turbo(t))),
      ticks: [fmt(r.tMax * 1000, 1) + ' ms', fmt(r.tMax * 500, 1) + ' ms', '0 ms'],
      extra: '<span class="chip" style="background:rgb(184,194,199)"></span> nie erreicht'
    });
  } else if (state.show === 'schmelze' && r) colorbar(speedColorbar(r.vScale, 'bis zur ersten Ankunft'));
  else colorbar(null);
  if (state.show === 'schmelze' && r) showFrame(state.frame);
  else meltMesh.visible = false;
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
numberInput('cell-h', v => { state.h = Math.max(0.5, Math.min(20, v)); updateGridNote(); return state.h; });
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

/* Eine Angussdatei — oder eine Werkbankdatei, die einen Anguss samt
   Prozess enthält. */
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

export const __viewer = { state, view, simulate, showFrame, pickDemo, adoptGraph, runnerMesh, meltMesh, biscMesh, group, gpu };
window.__angussfuellung = __viewer;
