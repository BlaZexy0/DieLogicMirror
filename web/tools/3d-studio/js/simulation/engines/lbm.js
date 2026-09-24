/* Rechenverfahren „Gitter" — Lattice-Boltzmann mit freier Oberfläche
   (js/lbm/), als Adapter für die Werkzeuge Angussfüllung und Kammerfüllung.

   Beide Verfahren (dies und engines/sph.js) haben EINE Gestalt, damit das
   Werkzeug nie wissen muss, welches es gerade fährt:

     id, label ('Gitter'), cellLabel ('Zellkante'), range [min, max] mm
     suggest(problem)                 Vorschlag für die Zellkante, mm
     estimate(problem, cell, opts)    → { text, note, blocked, blockedShort, count, kernel }
                                      text: die Zeile unter dem Feld (Zellen,
                                      Speicher, grobe Zeit, Rechenwerk);
                                      blocked: warum so nicht gerechnet wird,
                                      blockedShort: dasselbe in EINER Zeile
                                      für unter den Knopf (core.js, primary)
     run(problem, { cell, signal, progress, forceCpu }) → Ergebnis
     createDisplay()                  → { object, show(ergebnis, bild), hide() }
     paintArrival(ergebnis, netz)     Ankunftsfarben (nur das Gitter kennt sie)

   problem.kind ist 'anguss' ({ graph, net, piston, tMax, tExpect, alloy })
   oder 'kammer' ({ spec, curve, alloy }). Das Ergebnis trägt für beide
   Verfahren dieselben Felder (engine, kernel, cell, snapshots mit t,
   steps, ms, reason, vScale, facts; Anguss: gates, filled; Kammer: full,
   airMax) — und dahinter, was nur das eigene Bild braucht (domain, uScale,
   arrival).

   Die Kerne bleiben unberührt. Der Abbruch erreicht sie trotzdem sofort:
   run.js fragt das Signal nur zwischen zwei Bildern, aber es ruft je
   SCHRITT nach der Kolbengeschwindigkeit — dort wirft der Adapter den
   Abbruch, und der Lauf endet mitten im Paket statt Sekunden später.

   Umgekehrt ist nicht jeder AbortError ein Abbruch: eine verlorene
   Grafikkarte meldet sich beim Lesen genau so, und der Rahmen (js/studio/
   job.js) zeigte dann „Abgebrochen", als hätte man gedrückt. Was nicht vom
   Signal kommt, verlässt den Adapter als gewöhnlicher Fehler (env.js,
   gpuFailure). */

import * as T from 'three';
import { setTris } from '../../ui/common.js';
import { surfaceNets } from '../../part/surfacenets.js';
import { scaleFn, linRgb, VIEW } from '../../part/colors.js';
import { fmt, fmtUnit } from '../../studio/format.js';
import { buildDomain, suggestCell as suggestRunner, cellCount as countRunner, runnerMask, MAX_CELLS, MAX_CELLS_CPU } from '../../lbm/domain.js';
import { buildSleeveDomain, suggestCell as suggestSleeve, cellCount as countSleeve, hydrostatic, enclosedGas } from '../../lbm/sleeve.js';
import { minRunnerArea, latticeUnits } from '../../lbm/piston.js';
import { createSolver } from '../../lbm/fslbm.js';
import { createGpuSolver } from '../../lbm/gpu.js';
import { runSimulation } from '../../lbm/run.js';
import { paintMelt, speedScale } from '../../lbm/paint.js';
import { NEVER, Q, FF, FU } from '../../lbm/lattice.js';
import { env, tempo, runTime, learnTempo, roughTime, kernelName, fmtCount, fmtMB } from './env.js';
import { kernelOf, RANGE, FRAMES, kammerVref, sleeveEnd, withSolver, firstArrival, runnerOutcome, sleeveOutcome, tooFine, noWebGpuNote } from './common.js';

/* Byte je Zelle, wie beide Kerne sie anlegen (lbm/fslbm.js, lbm/gpu.js):
   zwei Sätze Verteilungen, die Zellwerte doppelt (vor und nach dem
   Schritt), dazu Flaggen, Melder und Form. Vorher fehlte der zweite Satz
   Zellwerte, und die Anzeige lag rund 13 % unter dem, was wirklich belegt
   wird. */
const BYTES_PER_CELL = 4 * (2 * Q + 2 * FF.COUNT_F + FU.COUNT_U);

const countOf = (problem, cell) => (problem.kind === 'kammer' ? countSleeve(problem.spec, cell) : countRunner(problem.graph, cell));

/* Die Einheiten vorab — dieselben, mit denen run() rechnet. */
function unitsOf(problem, cell) {
  if (problem.kind === 'kammer') {
    const cv = problem.curve;
    /* Zeitschritt aus der doppelten Kolbengeschwindigkeit (die Welle ist
       nicht viel schneller als der Kolben); der Laufkanal wird schneller,
       dort klemmt der Kern. */
    return latticeUnits({ h: cell, vMax: kammerVref(problem), A: cv.A, aMin: cv.A / 2, nu: problem.alloy.nu, uTarget: 0.08 });
  }
  const p = problem.piston;
  return latticeUnits({ h: cell, vMax: p.vMax, A: p.A, aMin: minRunnerArea(problem.net), nu: problem.alloy.nu });
}

export const lbm = {
  id: 'lbm', label: 'Gitter', cellLabel: 'Zellkante',
  range: RANGE,

  suggest(problem) {
    return problem.kind === 'kammer'
      ? suggestSleeve(problem.spec, env.gpu ? 1.5e5 : 3e4)
      : suggestRunner(problem.graph, env.gpu ? 4e5 : 1.2e5);
  },

  estimate(problem, cell, opts = {}) {
    const kernel = kernelOf(opts);
    const { dims, count } = countOf(problem, cell);
    const limit = kernel === 'gpu' ? MAX_CELLS : MAX_CELLS_CPU;
    const units = unitsOf(problem, cell);
    const kammer = problem.kind === 'kammer';
    const tLimit = kammer ? sleeveEnd(problem, cell).tEnd : problem.tMax;
    const tRun = kammer ? Math.min(tLimit, problem.curve.tFull * 1.05) : problem.tExpect;
    const ms = runTime({ steps: tRun / units.dt, stepsMax: tLimit / units.dt, frames: FRAMES(problem.kind), c: count * tempo('lbm', kernel), kernel });
    const parts = ['Gitter ' + dims.join(' × ') + ' = ' + fmtCount(count) + ' Zellen'];
    if (kammer) parts.push(fmt(problem.spec.d / cell, 0) + ' Zellen über den Durchmesser');
    parts.push(fmtMB(count * BYTES_PER_CELL), roughTime(ms), kernelName(kernel));
    return {
      text: parts.join(' · '), count, kernel,
      note: env.gpu ? '' : noWebGpuNote('auf grobem Gitter', MAX_CELLS_CPU, ' Zellen', kammer ? ', und die erste Phase dauert Minuten' : ''),
      ...tooFine(count, limit, 'Zellen', 'Die Zellkante vergrößern')
    };
  },

  async run(problem, opts) {
    const { cell } = opts;
    return withSolver('Gitter …', opts, (kernel, ctx) =>
      problem.kind === 'kammer' ? runSleeve(problem, cell, kernel, ctx) : runRunner(problem, cell, kernel, ctx));
  },

  /* Die Schmelze zu einem Bild: Fläche des halben Füllstands aus dem
     Gitter, Stahl zählt als leer, damit die Fläche an der Wand zugeht; je
     Ecke die Geschwindigkeit als Farbe (js/lbm/paint.js). */
  createDisplay() {
    const mat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.55, metalness: 0.05, side: T.DoubleSide, flatShading: true });
    const mesh = new T.Mesh(new T.BufferGeometry(), mat);
    mesh.visible = false;
    return {
      object: mesh,
      show(result, k) {
        const d = result.domain;
        const snap = result.snapshots[Math.max(0, Math.min(result.snapshots.length - 1, k))];
        const data = new Float32Array(d.N);
        for (let i = 0; i < d.N; i++) data[i] = 0.5 - snap.fill[i] / 255;
        const tris = surfaceNets({ dims: d.dims, origin: d.origin, h: d.h, data }, 0);
        setTris(mesh, tris);
        paintMelt(mesh, snap, d, result.uScale);
        mesh.visible = tris.length > 0;
      },
      hide() { mesh.visible = false; }
    };
  },

  /* Der Anguss nach Ankunft gefärbt: je Ecke des Netzes die früheste
     Ankunft der 27 umliegenden Zellen (die Ecke liegt auf der Wand; die
     nächsten Zellen sind oft Stahl, und auf der Deckfläche liegt die erste
     Schmelzezelle eine ganze Zelle tiefer). Die Ankunft auf der ganzen
     Farbleiste `heat`, früh blau, spät rot; nie erreicht trägt das Grau
     des Bauteils (keine Daten). → Ende der Skala in s. */
  paintArrival(result, mesh) {
    const d = result.domain;
    const pos = mesh.geometry.getAttribute('position');
    if (!d || !pos || !result.arrival) return 0;
    const n = pos.count;
    const col = new Float32Array(n * 3);
    const [nx, ny, nz] = d.dims;
    let tMax = 0;
    for (const gt of result.gates) if (Number.isFinite(gt.tSim)) tMax = Math.max(tMax, gt.tSim);
    if (!(tMax > 0)) tMax = result.snapshots[result.snapshots.length - 1].t || 1;
    const grey = linRgb(VIEW.noData), heat = scaleFn('heat');
    for (let v = 0; v < n; v++) {
      const i0 = Math.round((pos.getX(v) - d.origin[0]) / d.h), j0 = Math.round((pos.getY(v) - d.origin[1]) / d.h), k0 = Math.round((pos.getZ(v) - d.origin[2]) / d.h);
      let best = NEVER;
      for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = i0 + dx, j = j0 + dy, k = k0 + dz;
        if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) continue;
        const a = result.arrival[(k * ny + j) * nx + i];
        if (a < best) best = a;
      }
      const c = best === NEVER ? grey : heat(Math.min(1, best * result.dt / tMax));
      col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
    }
    mesh.geometry.setAttribute('color', new T.BufferAttribute(col, 3));
    return tMax;
  }
};

/* Was beide Läufe am Ende gleich zusammenstellen. Die Rechenzeit ist der
   ganze Lauf (so lange hat man gewartet); gelernt wird nur das Rechnen der
   Schritte, ab clock.start() — so zählt auch die Schätzung. */
function finish(problem, cell, kernel, run, units, domain, t0, clock, until) {
  const ms = performance.now() - t0;
  if (clock.fair()) learnTempo('lbm', kernel, clock.ms(), run.steps, domain.N, run.snapshots.length);
  /* Die Skala aus den Bildern bis zur ersten Ankunft — danach herrschen
     Anschnitte bzw. Laufkanal, und der Weg davor wäre einfarbig blau. */
  const before = run.snapshots.filter(s => s.step <= until);
  const uScale = speedScale(before.length > 1 ? before : run.snapshots);
  return {
    engine: 'lbm', kernel, kind: problem.kind, cell, snapshots: run.snapshots, steps: run.steps, ms,
    domain, arrival: run.arrival, dt: units.dt, tau0: units.tau0, N: domain.N,
    uScale, vScale: uScale * units.dx / units.dt,
    /* Kurz und wenige: die Werte brechen nicht um, und aufgeklappt darf
       der Kasten die Seitenleiste nicht zum Scrollen bringen. */
    facts: [
      ['Schritte', fmt(run.steps, 0) + ' × ' + fmt(units.dt * 1e6, 2) + ' µs'],
      ['Zellen', fmtCount(domain.N) + ' · ' + fmtUnit(cell, 'mm')],
      ['Relaxation τ', fmt(units.tau0, 3)],
      ['Rechenzeit', fmtUnit(ms / 1000, 's') + ' · ' + kernelName(kernel)]
    ]
  };
}

/* ── Anguss: vom Pressrest zu den Anschnitten ────────────────── */
async function runRunner(problem, cell, kernel, { check, progress, signal, t0, clock, own }) {
  const domain = await buildDomain(problem.graph, cell, {
    onProgress: (p, what) => { check(); progress(0.1 * p, 'Gitter · ' + what + ' … ' + Math.round(p * 100) + ' %'); }
  });
  check();
  const piston = problem.piston;
  const units = latticeUnits({ h: cell, vMax: piston.vMax, A: piston.A, aMin: minRunnerArea(domain.net), nu: problem.alloy.nu });
  const solver = kernel === 'gpu' ? await createGpuSolver(domain) : createSolver(domain);
  own(solver);
  clock.start();
  /* Wie lange: bis alle Anschnitte gemeldet sind — dann noch ein Stück für
     das Bild —, spätestens bei problem.tMax (Ende der Kurve oder das
     Dreifache der 1D-Schätzung). */
  const tMax = problem.tMax;
  const stepsMax = Math.max(10, Math.ceil(tMax / units.dt));
  const snapEvery = Math.max(1, Math.ceil(stepsMax / FRAMES(problem.kind)));
  const mask = runnerMask(domain);
  let maskCount = 0;
  for (let i = 0; i < domain.N; i++) maskCount += mask[i];
  const filledOf = fill => { let f = 0; for (let i = 0; i < domain.N; i++) if (mask[i]) f += fill[i]; return maskCount ? f / (255 * maskCount) : 0; };
  const uAt = s => { check(); const u = units.uIn(piston.v(s * units.dt)); return [domain.axis[0] * u, domain.axis[1] * u, domain.axis[2] * u]; };
  const run = await runSimulation({
    solver, engine: kernel, domain, stepsMax, snapEvery, uAt, signal,
    onWork: step => progress(0.1 + 0.9 * step / stepsMax, 'Rechnet … ' + fmtUnit(step * units.dt * 1000, 'ms', 1)),
    onSnapshot: (snap, gateDone) => {
      snap.t = snap.step * units.dt;
      snap.filled = filledOf(snap.fill);
      progress(0.1 + 0.9 * snap.step / stepsMax, 'Rechnet … ' + fmtUnit(snap.t * 1000, 'ms', 1) + ' · Anguss ' + fmtUnit(snap.filled * 100, '%') + ' · Schritt ' + fmt(snap.step, 0));
      return gateDone.every(a => a !== NEVER) ? 'alle Anschnitte erreicht' : null;
    }
  });
  const { snapshots, gateDone } = run;
  snapshots[0].t = 0; snapshots[0].filled = filledOf(snapshots[0].fill);
  const out = finish(problem, cell, kernel, run, units, domain, t0, clock, firstArrival(gateDone));
  return runnerOutcome(out, { run, gates: domain.gates, gateDone, dt: units.dt, tMax, tEnd: piston.tEnd, snapshots });
}

/* ── Kammer: die Welle vor dem Kolben ────────────────────────── */
async function runSleeve(problem, cell, kernel, { check, progress, signal, t0, clock, own }) {
  const domain = buildSleeveDomain(problem.spec, cell);
  check();
  const cv = problem.curve;
  const units = unitsOf(problem, cell);
  const gLat = 9.81 * units.dt * units.dt / units.dx;
  domain.rho0 = hydrostatic(domain, gLat);
  const params = { g: [0, -gLat, 0] };
  const solver = kernel === 'gpu' ? await createGpuSolver(domain, params) : createSolver(domain, params);
  own(solver);
  clock.start();
  const { tEnd } = sleeveEnd(problem, cell);
  const stepsMax = Math.max(10, Math.ceil(tEnd / units.dt));
  const snapEvery = Math.max(1, Math.ceil(stepsMax / FRAMES(problem.kind)));
  const pad = 2;
  const sAt = step => cv.profile.atTime(step * units.dt).s * 1000;      // mm
  const uAt = step => { check(); return [units.uIn(cv.profile.atTime(step * units.dt).v), 0, 0]; };
  const ipAt = step => pad + Math.floor(sAt(step) / cell);
  const h3 = cell ** 3 / 1000;                                          // cm³ je Zelle
  const run = await runSimulation({
    solver, engine: kernel, domain, stepsMax, snapEvery, uAt, ipAt, signal,
    onWork: step => progress(0.02 + 0.98 * step / stepsMax, 'Rechnet … ' + fmtUnit(step * units.dt * 1000, 'ms', 0)),
    onSnapshot: (snap, gateDone) => {
      snap.t = snap.step * units.dt;
      snap.s = sAt(snap.step);
      const eg = enclosedGas(snap.fill, domain);
      snap.air = eg.enclosed * h3;
      snap.bubbles = eg.bubbles;
      progress(0.02 + 0.98 * snap.step / stepsMax, 'Rechnet … ' + fmtUnit(snap.t * 1000, 'ms', 0) + ' · Kolben bei ' + fmtUnit(snap.s, 'mm', 0) + ' · Luft ' + fmtUnit(snap.air, 'cm³'));
      return gateDone[0] !== NEVER ? 'Kammer voll: der Laufkanal ist erreicht' : null;
    }
  });
  const { snapshots, gateDone } = run;
  Object.assign(snapshots[0], { t: 0, s: 0, air: 0, bubbles: 0 });
  const out = finish(problem, cell, kernel, run, units, domain, t0, clock, gateDone[0] === NEVER ? Infinity : gateDone[0]);
  return sleeveOutcome(out, { run, gateDone, sAtMm: sAt, dt: units.dt, snapshots });
}
