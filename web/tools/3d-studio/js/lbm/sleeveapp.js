/* Kammerfüllung (kammerfuellung.html) — Einstieg und Verdrahtung.

   Die Füllkammer als liegender Zylinder: Durchmesser, Länge, Füllgrad
   und der Laufkanal in der Stirnfläche; der Kolben fährt die
   Schusskurve — die DieLogic-Kurve des Projekts oder zweistufig v₁/v₂.
   Beim Start steht die Schmelze ruhig unten in der Kammer; dann schiebt
   der Kolben, und die Welle läuft (js/lbm/sleeve.js baut das Gitter,
   js/lbm/fslbm.js und gpu.js rechnen mit Schwerkraft und wanderndem
   Kolben, js/lbm/run.js fährt den Lauf). Heraus kommt: wann die
   Schmelze den Laufkanal erreicht („Kammer voll", gegen die Kurve), wie
   viel Luft die Welle einschließt, und der Füllstand zu jeder Zeit am
   Regler, die Schmelze nach Geschwindigkeit gefärbt (js/lbm/paint.js). */

import * as T from 'three';
import { initScene } from '../scene.js';
import { mountViewBar } from '../ui/viewbar.js';
import { $, fmt, fmtPlain, facts, segButtons, slider, numberInput, colorbar } from '../ui/controls.js';
import { setTris } from '../ui/common.js';
import { surfaceNets } from '../part/surfacenets.js';
import * as F from '../runner/flow.js';
import { shotTimeline } from '../runner/shottime.js';
import { state as design } from '../../../auslegung/js/core/state.js';
import { generateCurve } from '../../../auslegung/js/core/curvegen.js';
import { buildProfile, rhoSolidus, vCrit } from '../../../auslegung/js/core/physics.js';
import { buildSleeveDomain, suggestCell, cellCount, hydrostatic, enclosedGas, MAX_CELLS, MAX_CELLS_CPU } from './sleeve.js';
import { latticeUnits } from './piston.js';
import { createSolver } from './fslbm.js';
import { createGpuSolver, hasWebGPU } from './gpu.js';
import { runSimulation } from './run.js';
import { paintMelt, speedScale, speedColorbar } from './paint.js';
import { NEVER } from './lattice.js';

const container = $('viewport');
const busy = $('busy');
const view = initScene(container, {
  cameraStart: [225, 120, 620], target: [225, 0, 0],
  grid: false, minDistance: 3, maxDistance: 30000
});
mountViewBar(container, view);

const state = {
  spec: { d: 90, length: 450, fill: 0.4, outletW: 30, outletH: 15 },
  curveMode: 'dielogic', v1: 0.5, v2: 2, a: 100, alloy: 'al',
  h: 3, curve: null,        // { profile, tFull, sFill, vcrit, tEnd, sEnd, warn }
  domain: null, units: null, result: null,
  running: false, cancel: false, forceCpu: false,
  show: 'schmelze', frame: 0, playing: null, opacity: 0.25, ready: false
};

/* ── Szene ───────────────────────────────────────────────────── */
const group = new T.Group();
view.scene.add(group);
const sleeveMat = new T.MeshStandardMaterial({
  color: 0x93a6b0, roughness: 0.55, metalness: 0.1, side: T.DoubleSide, transparent: true, opacity: 0.25, depthWrite: false
});
const sleeveMesh = new T.Mesh(new T.BufferGeometry(), sleeveMat);
group.add(sleeveMesh);
const plungerMat = new T.MeshStandardMaterial({ color: 0x557786, roughness: 0.5, metalness: 0.3, side: T.DoubleSide });
const plungerMesh = new T.Mesh(new T.BufferGeometry(), plungerMat);
group.add(plungerMesh);
const outletMat = new T.MeshStandardMaterial({ color: 0x008c82, roughness: 0.5, metalness: 0.05, side: T.DoubleSide });
const outletMesh = new T.Mesh(new T.BufferGeometry(), outletMat);
group.add(outletMesh);
/* Die Schmelze: deckend, je Ecke nach Geschwindigkeit gefärbt (js/lbm/paint.js). */
const meltMat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, flatShading: true });
const meltMesh = new T.Mesh(new T.BufferGeometry(), meltMat);
meltMesh.visible = false;
group.add(meltMesh);

const tick = () => new Promise(r => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

/* Die Kammer als Zylinder entlang x, Kolben als Scheibe, Laufkanal als
   Klotz oben in der Stirnfläche. */
function rebuildScene() {
  const { d, length, outletW, outletH } = state.spec;
  const R = d / 2;
  const cyl = new T.CylinderGeometry(R, R, length, 64, 1, true);
  cyl.rotateZ(-Math.PI / 2);
  cyl.translate(length / 2, 0, 0);
  sleeveMesh.geometry.dispose();
  sleeveMesh.geometry = cyl;
  placePlunger(0);
  const box = new T.BoxGeometry(6, outletH, outletW);
  box.translate(length + 3, R - outletH / 2, 0);
  outletMesh.geometry.dispose();
  outletMesh.geometry = box;
  view.invalidate();
}
function placePlunger(s) {
  const R = state.spec.d / 2;
  const disc = new T.CylinderGeometry(R, R, 4, 64);
  disc.rotateZ(-Math.PI / 2);
  disc.translate(s - 2, 0, 0);
  plungerMesh.geometry.dispose();
  plungerMesh.geometry = disc;
}

/* ── Kammer und Kurve ────────────────────────────────────────── */
function updateSleeve() {
  const { d, length, fill } = state.spec;
  const A = Math.PI * d * d / 4;
  facts('sleeve-facts', [
    ['Kammervolumen', fmt(A * length / 1000, 0) + ' cm³ · Schmelze ' + fmt(A * length * fill / 1000, 0) + ' cm³'],
    ['Kammer voll', 'nach ' + fmt((1 - fill) * length, 0) + ' mm Kolbenweg']
  ]);
  updateCurve();
  rebuildScene();
  updateGridNote();
  clearResult();
}

/* Die Auslegungswerte mit der Kammer von hier: Kolben-Ø, Länge, und die
   Massen so, dass der Füllgrad stimmt (die Kurve rechnet ihn aus den
   Massen). Der Pressrest bekommt 25 mm, der Anguss ein Zehntel des
   Rests, das Bauteil den Rest — für die zweite Phase der Kurve. */
function valuesFor() {
  const { d, length, fill } = state.spec;
  const v = { ...design.values, diam: d, length };
  const A = Math.PI * d * d / 4;
  const liquid = A * length * fill;                                   // mm³
  const rhoS = rhoSolidus(v);
  const solid = liquid * v.density / rhoS;                            // mm³ fest
  const biscuit = Math.min(solid * 0.3, A * 25);
  const runner = (solid - biscuit) * 0.1;
  const part = solid - biscuit - runner;
  return { v, volumes: { part, runner, overflow: 0, biscuit } };
}

function updateCurve() {
  const { v, volumes } = valuesFor();
  const { d, length, fill } = state.spec;
  const A = Math.PI * d * d / 4;
  let profile, tFull, warn, v2;
  try {
    if (state.curveMode === 'dielogic') {
      const tl = shotTimeline(v, volumes, { diam: d, length });
      if (tl.error) throw new Error(tl.error);
      profile = tl.shot.profile; tFull = tl.tFull; warn = tl.warn; v2 = tl.v2;
    } else {
      const rho = v.density;
      for (const k of ['part', 'runner', 'overflow', 'biscuit']) v[k] = volumes[k] * 1e-9 * rhoSolidus(v);
      void rho;
      const gen = generateCurve(v, { mode: 'v1v2', v1: state.v1, a1: state.a, v2: state.v2, a2: state.a });
      if (gen.error) throw new Error(gen.error);
      profile = buildProfile(gen.points);
      tFull = profile.atPos((1 - fill) * length / 1000).t;
      warn = gen.warn; v2 = state.v2;
    }
  } catch (err) {
    state.curve = null;
    facts('curve-facts', []);
    $('curve-warn').textContent = 'Keine Kurve: ' + (err.message || err);
    $('run').disabled = true;
    return;
  }
  const sFill = (1 - fill) * length;
  const sEnd = Math.min(profile.travel * 1000, length - 3 * state.h);
  const tEnd = profile.atPos(sEnd / 1000).t;
  const vc = vCrit(d / 1000, fill);
  state.curve = { profile, tFull, sFill, sEnd, tEnd, vcrit: vc, v2, A: A * 1e-6, warn };
  facts('curve-facts', [
    ['1. Phase', 'bis ' + fmt(profile.maxVelBefore(sFill / 1000), 2) + ' m/s · v_krit ' + fmt(vc, 2) + ' m/s'],
    ['Kammer voll', 'bei ' + fmt(tFull * 1000, 0) + ' ms · ' + fmt(sFill, 0) + ' mm Kolbenweg'],
    ['2. Phase', 'v₂ ' + fmt(v2, 2) + ' m/s · Kurve endet bei ' + fmt(profile.travel * 1000, 0) + ' mm']
  ]);
  $('curve-warn').textContent = warn || '';
  updateGridNote();
}

/* ── Gitter und Rechenwerk ───────────────────────────────────── */
const gpu = hasWebGPU();

function updateGridNote() {
  const { dims, count } = cellCount(state.spec, state.h);
  const mb = count * (19 * 2 * 4 + 7 * 4 + 7 * 4) / 1048576;
  $('grid-note').textContent = 'Gitter ' + dims.join(' × ') + ' = ' + fmt(count / 1e6, 2) + ' Mio. Zellen · '
    + fmt(mb, 0) + ' MB auf der Grafikkarte · ' + fmt(state.spec.d / state.h, 0) + ' Zellen über den Durchmesser';
  const limit = gpu ? MAX_CELLS : MAX_CELLS_CPU;
  const notes = [];
  if (!gpu) notes.push('Kein WebGPU in diesem Browser: gerechnet wird in JavaScript, auf grobem Gitter (bis ' + fmt(MAX_CELLS_CPU / 1e3, 0) + ' Tsd. Zellen), und die erste Phase dauert Minuten. Chrome oder Edge rechnen auf der Grafikkarte.');
  if (count > limit) notes.push('Zu fein: höchstens ' + fmt(limit / 1e6, 2) + ' Mio. Zellen. Die Zellkante vergrößern.');
  $('engine-note').textContent = notes.join(' ');
  $('run').disabled = state.running || !state.curve || count > limit;
}

function clearResult() {
  state.result = null;
  state.frame = 0;
  stopPlay();
  meltMesh.visible = false;
  placePlunger(0);
  $('t-slider').max = '0';
  $('t-slider').value = '0';
  $('t-row').classList.add('disabled');
  $('play').disabled = true;
  facts('result-facts', []);
  $('run-note').textContent = '';
  $('run-note').className = 'run-note';
  colorbar(null);
  view.invalidate();
}

async function simulate() {
  if (state.running || !state.curve) return;
  state.running = true; state.cancel = false;
  $('run').disabled = true;
  $('run').textContent = 'Rechnet …';
  clearResult();
  const t0 = performance.now();
  let solver = null;
  try {
    busy.textContent = 'Gitter …'; busy.classList.add('on');
    await tick();
    const domain = buildSleeveDomain(state.spec, state.h);
    state.domain = domain;
    const cv = state.curve;
    /* Zeitschritt aus der doppelten Kolbengeschwindigkeit (die Welle
       ist nicht viel schneller als der Kolben); der Laufkanal wird
       schneller, dort klemmt der Kern. */
    const units = latticeUnits({ h: state.h, vMax: Math.max(cv.profile.vmax, 0.5), A: cv.A, aMin: cv.A / 2, nu: (F.ALLOYS[state.alloy] || F.ALLOYS.al).nu, uTarget: 0.08 });
    state.units = units;
    const gLat = 9.81 * units.dt * units.dt / units.dx;
    domain.rho0 = hydrostatic(domain, gLat);
    const engine = gpu && !state.forceCpu ? 'gpu' : 'cpu';
    const params = { g: [0, -gLat, 0] };
    solver = engine === 'gpu' ? await createGpuSolver(domain, params) : createSolver(domain, params);
    const stepsMax = Math.max(10, Math.ceil(cv.tEnd / units.dt));
    const snapEvery = Math.max(1, Math.ceil(stepsMax / 100));
    const pad = 2;
    const sAt = step => cv.profile.atTime(step * units.dt).s * 1000;      // mm
    const uAt = step => [units.uIn(cv.profile.atTime(step * units.dt).v), 0, 0];
    const ipAt = step => pad + Math.floor(sAt(step) / state.h);
    const h3 = state.h ** 3 / 1000;                                       // cm³ je Zelle
    const run = await runSimulation({
      solver, engine, domain, stepsMax, snapEvery, uAt, ipAt,
      isCancelled: () => state.cancel,
      onWork: step => { busy.textContent = 'Rechnet … ' + fmt(step * units.dt * 1000, 0) + ' ms'; },
      onSnapshot: (snap, gateDone) => {
        snap.t = snap.step * units.dt;
        snap.s = sAt(snap.step);
        const eg = enclosedGas(snap.fill, domain);
        snap.air = eg.enclosed * h3;
        snap.bubbles = eg.bubbles;
        busy.textContent = 'Rechnet … ' + fmt(snap.t * 1000, 0) + ' ms · Kolben bei ' + fmt(snap.s, 0) + ' mm · Luft ' + fmt(snap.air, 1) + ' cm³';
        $('run-note').textContent = busy.textContent;
        return gateDone[0] !== NEVER ? 'Kammer voll: der Laufkanal ist erreicht' : null;
      }
    });
    const { snapshots, gateDone } = run;
    snapshots[0].t = 0; snapshots[0].s = 0; snapshots[0].air = 0; snapshots[0].bubbles = 0;
    let airMax = snapshots[0], full = null;
    for (const sn of snapshots) if (sn.air > airMax.air) airMax = sn;
    if (gateDone[0] !== NEVER) full = { t: gateDone[0] * units.dt, s: sAt(gateDone[0]) };
    state.result = {
      snapshots, engine, steps: run.steps, ms: performance.now() - t0, N: domain.N,
      reason: run.reason === 'Schrittgrenze erreicht' ? 'der Kolben ist am Ende der Kurve' : run.reason,
      full, airMax, dt: units.dt, tau0: units.tau0
    };
    /* Die Skala aus den Bildern bis Kammer voll — danach herrscht der
       Laufkanal, und die Welle wäre einfarbig blau. */
    const before = snapshots.filter(s => gateDone[0] === NEVER || s.step <= gateDone[0]);
    state.result.uScale = speedScale(before.length > 1 ? before : snapshots);
    state.result.vScale = state.result.uScale * units.dx / units.dt;
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
  const r = state.result, cv = state.curve;
  if (!r) return;
  const last = r.snapshots[r.snapshots.length - 1];
  const rows = [
    ['Kammer voll', r.full
      ? 'Simulation ' + fmt(r.full.t * 1000, 0) + ' ms bei ' + fmt(r.full.s, 0) + ' mm · Kurve ' + fmt(cv.tFull * 1000, 0) + ' ms bei ' + fmt(cv.sFill, 0) + ' mm'
      : 'nicht erreicht · Kurve ' + fmt(cv.tFull * 1000, 0) + ' ms bei ' + fmt(cv.sFill, 0) + ' mm'],
    ['Eingeschlossene Luft', 'höchstens ' + fmt(r.airMax.air, 1) + ' cm³ bei ' + fmt(r.airMax.t * 1000, 0) + ' ms · am Ende '
      + fmt(last.air, 1) + ' cm³ in ' + fmt(last.bubbles, 0) + ' Blasen'],
    ['Ende', r.reason],
    ['Rechnung', fmt(r.steps, 0) + ' Schritte · ' + fmt(r.N / 1e6, 2) + ' Mio. Zellen · ' + fmt(r.ms / 1000, 1) + ' s · '
      + (r.engine === 'gpu' ? 'WebGPU' : 'JavaScript')],
    ['Gitter', 'Δt ' + fmt(r.dt * 1e6, 1) + ' µs · τ ' + fmt(r.tau0, 3) + ' · Zellkante ' + fmt(state.h, 1) + ' mm']
  ];
  facts('result-facts', rows);
  $('run-note').textContent = 'Zeiten ab Kolbenstart.';
  $('run-note').className = 'run-note';
}

/* ── Anzeige ─────────────────────────────────────────────────── */
function showFrame(k) {
  const r = state.result;
  if (!r || !state.domain) return;
  const snap = r.snapshots[Math.max(0, Math.min(r.snapshots.length - 1, k))];
  state.frame = k;
  $('t-val').textContent = fmt(snap.t * 1000, 0) + ' ms · ' + fmt(snap.s, 0) + ' mm · Luft ' + fmt(snap.air, 1) + ' cm³';
  placePlunger(snap.s);
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
function applyShow() {
  sleeveMat.opacity = state.opacity;
  sleeveMat.transparent = state.opacity < 1;
  sleeveMat.depthWrite = state.opacity >= 1;
  sleeveMat.needsUpdate = true;
  if (state.show === 'schmelze' && state.result) { showFrame(state.frame); colorbar(speedColorbar(state.result.vScale, 'bis Kammer voll')); }
  else { meltMesh.visible = false; colorbar(null); }
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
    state.frame++;
    if (state.frame >= state.result.snapshots.length) { state.frame = state.result.snapshots.length - 1; stopPlay(); }
    $('t-slider').value = String(state.frame);
    showFrame(state.frame);
  }, 100);
}

/* ── Bedienung ───────────────────────────────────────────────── */
/* Neue Maße: Zellkante neu vorschlagen und das Bild neu einpassen. */
const resized = () => { state.h = suggestCell(state.spec, gpu ? 1.5e5 : 3e4); $('cell-h').value = fmtPlain(state.h, 1); updateSleeve(); view.fitTo(group); };
numberInput('sl-d', v => { state.spec.d = Math.max(20, Math.min(300, v)); resized(); return state.spec.d; });
numberInput('sl-len', v => { state.spec.length = Math.max(50, Math.min(2000, v)); resized(); return state.spec.length; });
slider('sl-fill', v => { state.spec.fill = v / 100; updateSleeve(); }, v => v + ' %');
numberInput('sl-ow', v => { state.spec.outletW = Math.max(2, Math.min(300, v)); updateSleeve(); return state.spec.outletW; });
numberInput('sl-oh', v => { state.spec.outletH = Math.max(1, Math.min(150, v)); updateSleeve(); return state.spec.outletH; });
segButtons('curve-seg', v => { state.curveMode = v; $('v1v2-block').classList.toggle('hidden', v !== 'v1v2'); updateCurve(); clearResult(); });
numberInput('sl-v1', v => { state.v1 = Math.max(0.05, Math.min(5, v)); updateCurve(); clearResult(); return state.v1; });
numberInput('sl-v2', v => { state.v2 = Math.max(0.1, Math.min(12, v)); updateCurve(); clearResult(); return state.v2; });
numberInput('sl-a', v => { state.a = Math.max(5, Math.min(2000, v)); updateCurve(); clearResult(); return state.a; });
$('alloy').innerHTML = Object.entries(F.ALLOYS).map(([k, x]) => '<option value="' + k + '">' + x.label + '</option>').join('');
$('alloy').addEventListener('change', e => { state.alloy = e.target.value; });
numberInput('cell-h', v => { state.h = Math.max(0.5, Math.min(30, v)); updateCurve(); updateGridNote(); return state.h; });
$('run').addEventListener('click', () => { if (state.running) state.cancel = true; else simulate(); });
segButtons('show-seg', v => { state.show = v; applyShow(); });
slider('t-slider', v => { stopPlay(); showFrame(v); }, () => '');
$('play').addEventListener('click', togglePlay);
slider('opacity', v => { state.opacity = v / 100; applyShow(); }, v => v + ' %');

state.h = suggestCell(state.spec, gpu ? 1.5e5 : 3e4);
$('cell-h').value = fmtPlain(state.h, 1);
$('sl-fill-val').textContent = '40 %';
updateSleeve();
view.fitTo(group);
state.ready = true;

export const __viewer = { state, view, simulate, showFrame, meltMesh, sleeveMesh, plungerMesh, group, gpu };
window.__kammerfuellung = __viewer;
