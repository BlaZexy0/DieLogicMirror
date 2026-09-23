/* Rechenverfahren „Partikel" — schwach kompressible SPH (js/sph/), als
   Adapter für Angussfüllung und Kammerfüllung. Dieselbe Gestalt wie
   engines/lbm.js (dort beschrieben); was hier anders ist:

   · Die Auflösung heißt Partikelabstand, nicht Zellkante.
   · Im Anguss steht hinter dem Pressrest die Säule des Zustroms, so lang
     wie der Kolbenweg des Laufs — der Adapter rechnet ihn aus Kurve und
     Laufzeit (travelOf).
   · Die Kammer kommt vor dem Start zur Ruhe. Auf der Grafikkarte ist das
     ein Befehlspuffer; in JavaScript fährt der Adapter die Schritte SELBST
     (dieselben, die solver.settle() führe — hohe Zähigkeit, danach v = 0),
     denn settle() läuft am Stück, und sechshundert Schritte lang wäre
     „Abbrechen" nicht zu erreichen.
   · Ankunftsfarben gibt es nicht: die Partikelrechnung führt kein Feld
     der Ankunft je Ort (paintArrival fehlt — das Werkzeug fragt danach).

   Der Abbruch erreicht den Lauf wie beim Gitter über die Rückfrage nach
   der Kolbengeschwindigkeit je Schritt — und wie dort ist ein AbortError,
   den niemand verlangt hat, eine Panne der Grafikkarte (env.js, gpuFailure).
   Das Tempo lernt nur aus den Schritten des Laufs, die Ruhe davor zählt
   nicht (sie steht nicht in run.steps). */

import * as T from 'three';
import { abortError } from '../../abort.js';
import { fmt, fmtUnit } from '../../studio/format.js';
import { minRunnerArea } from '../../lbm/piston.js';
import {
  runnerSetup, suggestSpacingRunner, particleCountRunner, runnerFillFraction,
  sleeveSetup, suggestSpacingSleeve, particleCountSleeve, enclosedAirSleeve,
  MAX_PARTICLES, MAX_PARTICLES_CPU, H_OVER_D
} from '../../sph/domain.js';
import { createSphSolver, suggestDt, PARAMS, NEVER } from '../../sph/wcsph.js';
import { createGpuSphSolver } from '../../sph/gpu.js';
import { runSph } from '../../sph/run.js';
import { createPoints, showParticles, speedScaleParticles } from '../../sph/points.js';
import { env, tempo, runTime, learnTempo, runClock, gpuFailure, roughTime, kernelName, fmtCount, fmtMB, tick } from './env.js';

const kernelOf = opts => (env.gpu && !(opts && opts.forceCpu) ? 'gpu' : 'cpu');

/* Kolbenweg des Laufs in mm: so lang wird die Säule des Zustroms. */
function travelOf(problem) {
  const n = 400, p = problem.piston, tMax = problem.tMax;
  let s = 0;
  for (let i = 0; i < n; i++) s += p.v((i + 0.5) / n * tMax) * tMax / n;
  return s * 1000;
}

/* Schall und Zeitschritt vorab — dieselben, mit denen run() rechnet.
   Anguss: Bezugsgeschwindigkeit ist der Kolbenstrom durch den kleinsten
   Laufkanalquerschnitt, wie der Zeitschritt der Gitterrechnung. Kammer:
   c0 = 10·v hält die Dichte auf ein Prozent. */
function timing(problem, cell) {
  let vRef;
  if (problem.kind === 'kammer') vRef = Math.max(problem.curve.profile.vmax, 0.5);
  else { const p = problem.piston; vRef = Math.max(p.vMax * p.A / minRunnerArea(problem.net), p.vMax, 1e-3); }
  const c0 = PARAMS.cMach * vRef;
  return { vRef, c0, dt: suggestDt({ h: H_OVER_D * cell * 1e-3, c0, vRef }) };
}

function sleeveEnd(problem, cell) {
  const { profile } = problem.curve;
  const sEnd = Math.min(profile.travel * 1000, problem.spec.length - 3 * cell);
  return { sEnd, tEnd: profile.atPos(sEnd / 1000).t };
}

export const sph = {
  id: 'sph', label: 'Partikel', cellLabel: 'Partikelabstand',
  range: problem => (problem && problem.kind === 'kammer' ? [0.5, 30] : [0.5, 20]),

  suggest(problem) {
    return problem.kind === 'kammer'
      ? suggestSpacingSleeve(problem.spec, env.gpu ? 6e4 : 2e3)
      : suggestSpacingRunner(problem.graph, problem.runnerVolume, env.gpu ? 4e4 : 2.5e3);
  },

  estimate(problem, cell, opts = {}) {
    const kernel = kernelOf(opts);
    const limit = kernel === 'gpu' ? MAX_PARTICLES : MAX_PARTICLES_CPU;
    const { dt } = timing(problem, cell);
    const parts = [];
    const kammer = problem.kind === 'kammer';
    let count, tRun, tLimit;
    if (kammer) {
      count = particleCountSleeve(problem.spec, cell);
      tLimit = sleeveEnd(problem, cell).tEnd;
      tRun = Math.min(tLimit, problem.curve.tFull * 1.05) + 0.02;     // dazu die 20 ms Ruhe
      parts.push(fmtCount(count) + ' Partikel', fmt(problem.spec.d / cell, 0) + ' Partikel über den Durchmesser');
    } else {
      const travel = travelOf(problem);
      count = particleCountRunner(problem.graph, cell, travel);
      tRun = problem.tExpect; tLimit = problem.tMax;
      parts.push(fmtCount(count) + ' Partikel (Pressrest und Säule für ' + fmtUnit(travel, 'mm', 0) + ' Kolbenweg)');
    }
    parts.push(fmtMB(count * 64), roughTime(runTime({ steps: tRun / dt, stepsMax: tLimit / dt, frames: kammer ? 100 : 80, c: count * tempo('sph', kernel), kernel })), kernelName(kernel));
    return {
      text: parts.join(' · '), count, kernel,
      note: env.gpu ? '' : 'Kein WebGPU in diesem Browser: gerechnet wird in JavaScript, mit wenigen Partikeln (bis ' + fmt(MAX_PARTICLES_CPU / 1e3, 0)
        + ' Tsd.), und das dauert Minuten. Chrome oder Edge rechnen auf der Grafikkarte.',
      blocked: count > limit ? 'Zu fein: höchstens ' + fmt(limit / 1e3, 0) + ' Tsd. Partikel. Den Abstand vergrößern.' : '',
      blockedShort: count > limit ? 'Zu fein: höchstens ' + fmt(limit / 1e3, 0) + ' Tsd. Partikel.' : ''
    };
  },

  async run(problem, opts) {
    const { cell, signal, progress = () => {} } = opts;
    const check = () => { if (signal && signal.aborted) throw abortError(); };
    const kernel = kernelOf(opts);
    const t0 = performance.now(), clock = runClock();
    let solver = null;
    try {
      progress(0, 'Partikel …');
      await tick();
      const ctx = { check, progress, signal, t0, clock, own: s => { solver = s; }, openGates: opts.openGates !== false };
      return problem.kind === 'kammer' ? await runSleeve(problem, cell, kernel, ctx) : await runRunner(problem, cell, kernel, ctx);
    } catch (err) {
      throw gpuFailure(err, signal);
    } finally {
      if (solver && solver.dispose) solver.dispose();
    }
  },

  /* Die Partikel als beleuchtete Kugeln vom Partikelabstand (js/sph/points.js).
     Die Größe steckt im Material — ein Lauf mit anderem Abstand bekommt
     deshalb eine neue Wolke. */
  createDisplay() {
    const holder = new T.Group();
    let points = null, size = 0;
    return {
      object: holder,
      get points() { return points; },
      show(result, k) {
        if (!points || size !== result.cell) {
          if (points) { holder.remove(points); points.geometry.dispose(); points.material.dispose(); }
          points = createPoints(result.cell);
          size = result.cell;
          holder.add(points);
        }
        /* Platz für das größte Bild des Laufs: die Zahl der Partikel ändert sich
           fast mit jedem Bild (die Säule wird zu Schmelze, der Auslass nimmt). */
        const most = result.snapshots.reduce((m, sn) => Math.max(m, sn.n), 0);
        showParticles(points, result.snapshots[Math.max(0, Math.min(result.snapshots.length - 1, k))], result.vScale, most);
      },
      hide() { if (points) points.visible = false; }
    };
  },

  paintArrival: null
};

/* Die Rechenzeit ist der ganze Lauf; gelernt wird ab clock.start() — wie beim Gitter. */
function finish(problem, cell, kernel, run, t0, clock, setup, dt, c0, until) {
  const ms = performance.now() - t0;
  if (clock.fair()) learnTempo('sph', kernel, clock.ms(), run.steps, setup.n, run.snapshots.length);
  const before = run.snapshots.filter(s => s.step <= until);
  return {
    engine: 'sph', kernel, kind: problem.kind, cell, snapshots: run.snapshots, steps: run.steps, ms,
    dt, c0, h: setup.h, n: setup.n,
    vScale: speedScaleParticles(before.length > 1 ? before : run.snapshots),
    /* Kurz und wenige — siehe engines/lbm.js. */
    facts: [
      ['Schritte', fmt(run.steps, 0) + ' × ' + fmt(dt * 1e6, 2) + ' µs'],
      ['Partikel', fmtCount(setup.n) + ' · ' + fmtUnit(cell, 'mm')],
      ['h · c₀', fmtUnit(setup.h * 1000, 'mm') + ' · ' + fmt(c0, 0) + ' m/s'],
      ['Rechenzeit', fmtUnit(ms / 1000, 's') + ' · ' + kernelName(kernel)]
    ]
  };
}

/* ── Anguss ──────────────────────────────────────────────────── */
async function runRunner(problem, cell, kernel, { check, progress, signal, t0, clock, own, openGates }) {
  const piston = problem.piston;
  const { c0, vRef } = timing(problem, cell);
  const setup = await runnerSetup(problem.graph, cell, {
    rho0: problem.alloy.rho, c0, travel: travelOf(problem),
    onProgress: (p, what) => { check(); progress(0.1 * p, 'Partikel · ' + what + ' … ' + Math.round(p * 100) + ' %'); }
  });
  check();
  /* openGates = false: ohne Auslass bleibt der Anguss für die Partikel eine
     Sackgasse — für den Vergleich im Browser-Test. */
  if (!openGates) setup.boundary.OUTLET = 0xFFFF;
  const dt = suggestDt({ h: setup.h, c0, vRef });
  const solver = kernel === 'gpu' ? await createGpuSphSolver(setup) : createSphSolver(setup);
  own(solver);
  clock.start();
  const tMax = problem.tMax;
  const stepsMax = Math.max(10, Math.ceil(tMax / dt));
  const snapEvery = Math.max(1, Math.ceil(stepsMax / 80));
  /* Der Kolbenweg je Schritt — die Drossel der Anschnitte zählt damit. */
  const sTable = new Float64Array(stepsMax + 2);
  for (let k = 1; k < sTable.length; k++) sTable[k] = sTable[k - 1] + 0.5 * (piston.v((k - 1) * dt) + piston.v(k * dt)) * dt;
  const ctrlAt = step => { check(); return { uIn: piston.v(step * dt), piston: sTable[Math.min(step, sTable.length - 1)] }; };
  const run = await runSph({
    solver, engine: kernel, dt, stepsMax, snapEvery, ctrlAt, gates: setup.gates, signal,
    onWork: step => progress(0.1 + 0.9 * step / stepsMax, 'Rechnet … ' + fmtUnit(step * dt * 1000, 'ms', 1)),
    onSnapshot: (snap, gateDone) => {
      snap.t = snap.step * dt;
      snap.filled = runnerFillFraction(snap.pos, snap.n, setup, 1e-3);
      progress(0.1 + 0.9 * snap.step / stepsMax, 'Rechnet … ' + fmtUnit(snap.t * 1000, 'ms', 1) + ' · Anguss ' + fmtUnit(snap.filled * 100, '%') + ' · Schritt ' + fmt(snap.step, 0));
      return gateDone.every(a => a !== NEVER) ? 'alle Anschnitte erreicht' : null;
    }
  });
  if (run.reason === 'abgebrochen') throw abortError();
  const { snapshots, gateDone } = run;
  snapshots[0].t = 0; snapshots[0].filled = runnerFillFraction(snapshots[0].pos, snapshots[0].n, setup, 1e-3);
  const first = Math.min(...gateDone.filter(a => a !== NEVER), Infinity);
  const out = finish(problem, cell, kernel, run, t0, clock, setup, dt, c0, first);
  out.reason = run.reason === 'Schrittgrenze erreicht' ? (tMax >= piston.tEnd - 1e-9 ? 'die Kurve endet' : 'Zeitgrenze erreicht') : run.reason;
  out.facts.unshift(['Ende', out.reason]);
  out.gates = setup.lbm.gates.map((gt, k) => ({ id: gt.id, step: gateDone[k], tSim: gateDone[k] === NEVER ? NaN : gateDone[k] * dt }));
  out.filled = snapshots[snapshots.length - 1].filled;
  out.nFluid = setup.nFluid; out.nInflow = setup.nInflow;
  out.facts[out.facts.findIndex(f => f[0] === 'Partikel')] = ['Pressrest + Säule', fmtCount(setup.nFluid) + ' + ' + fmtCount(setup.nInflow) + ' · ' + fmtUnit(cell, 'mm')];
  return out;
}

/* ── Kammer ──────────────────────────────────────────────────── */
async function runSleeve(problem, cell, kernel, { check, progress, signal, t0, clock, own }) {
  const cv = problem.curve;
  const { c0, vRef } = timing(problem, cell);
  const setup = sleeveSetup(problem.spec, cell, { rho0: problem.alloy.rho, c0 });
  check();
  const dt = suggestDt({ h: setup.h, c0, vRef });
  const solver = kernel === 'gpu' ? await createGpuSphSolver(setup) : createSphSolver(setup);
  own(solver);
  const { tEnd } = sleeveEnd(problem, cell);
  const stepsMax = Math.max(10, Math.ceil(tEnd / dt));
  const snapEvery = Math.max(1, Math.ceil(stepsMax / 100));
  const settleSteps = Math.min(600, Math.round(0.02 / dt));
  progress(0, 'Zur Ruhe kommen …');
  await tick();
  if (kernel === 'gpu') await solver.settle(settleSteps, dt);
  else {
    /* Wie solver.settle(), nur mit Atempausen — siehe Kopf der Datei. */
    let last = performance.now();
    for (let k = 1; k <= settleSteps; k++) {
      solver.step(dt, { uIn: 0, step: 0, piston: 0, alpha: PARAMS.settleAlpha });
      if (performance.now() - last > 40) { check(); progress(0.05 * k / settleSteps, 'Zur Ruhe kommen … ' + Math.round(100 * k / settleSteps) + ' %'); await tick(); last = performance.now(); }
    }
    const vel = solver.velocities();
    for (let i = 0; i < solver.n; i++) { vel[4 * i] = 0; vel[4 * i + 1] = 0; vel[4 * i + 2] = 0; }
  }
  check();
  clock.start();
  const sAt = step => cv.profile.atTime(step * dt).s;                   // m
  const ctrlAt = step => { check(); const p = cv.profile.atTime(step * dt); return { uIn: p.v, piston: p.s }; };
  const run = await runSph({
    solver, engine: kernel, dt, stepsMax, snapEvery, ctrlAt, gates: 1, signal,
    onWork: step => progress(0.05 + 0.95 * step / stepsMax, 'Rechnet … ' + fmtUnit(step * dt * 1000, 'ms', 0)),
    onSnapshot: (snap, gateDone) => {
      snap.t = snap.step * dt;
      snap.s = sAt(snap.step) * 1000;
      const air = enclosedAirSleeve(snap.pos, snap.n, setup, sAt(snap.step), 1.5 * setup.d, 1e-3);
      snap.air = air.enclosed * 1e6;
      snap.bubbles = air.bubbles;
      progress(0.05 + 0.95 * snap.step / stepsMax, 'Rechnet … ' + fmtUnit(snap.t * 1000, 'ms', 0) + ' · Kolben bei ' + fmtUnit(snap.s, 'mm', 0) + ' · Luft ' + fmtUnit(snap.air, 'cm³'));
      return gateDone[0] !== NEVER ? 'Kammer voll: der Laufkanal ist erreicht' : null;
    }
  });
  if (run.reason === 'abgebrochen') throw abortError();
  const { snapshots, gateDone } = run;
  Object.assign(snapshots[0], { t: 0, s: 0, air: 0, bubbles: 0 });
  const out = finish(problem, cell, kernel, run, t0, clock, setup, dt, c0, gateDone[0] === NEVER ? Infinity : gateDone[0]);
  out.reason = run.reason === 'Schrittgrenze erreicht' ? 'der Kolben ist am Ende der Kurve' : run.reason;
  out.full = gateDone[0] !== NEVER ? { t: gateDone[0] * dt, s: sAt(gateDone[0]) * 1000 } : null;
  out.airMax = snapshots.reduce((a, s) => (s.air > a.air ? s : a), snapshots[0]);
  out.settleSteps = settleSteps;
  out.facts.unshift(['Ende', out.full ? 'Kammer voll' : 'Ende der Kurve']);
  out.facts.splice(2, 0, ['Zur Ruhe davor', fmt(settleSteps, 0) + ' Schritte']);
  return out;
}
