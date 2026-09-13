/* Die Angussfüllung ohne Browser: Gitterkonstanten, der JavaScript-Kern
   der freien Oberfläche, das Gitter aus dem Angusssystem, Kolben und
   Einheiten. Der WGSL-Kern (js/lbm/gpu.js) ist die Abschrift desselben
   Verfahrens; ihn prüft der Browser-Test gegen diesen Kern.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/lbm.test.mjs                        */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web');
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/project.js', 'shared/clampmodel.js']) require(path.join(site, f));

const R = '../../../web/tools/3d-studio/';
const L = await import(R + 'js/lbm/lattice.js');
const { createSolver } = await import(R + 'js/lbm/fslbm.js');
const { buildDomain, suggestCell, cellCount, runnerMask } = await import(R + 'js/lbm/domain.js');
const { pistonCurve, minRunnerArea, latticeUnits } = await import(R + 'js/lbm/piston.js');
const PRE = await import(R + 'js/runner/presets.js');
const F = await import(R + 'js/runner/flow.js');
const { sampleNetwork } = await import(R + 'js/runner/curve.js');
const { shotTimeline } = await import(R + 'js/runner/shottime.js');
const { allFields } = await import(path.join(site, 'tools/auslegung/js/config/fields.js'));
const { FLAG, NEVER } = L;

const defaults = () => { const v = {}; for (const f of allFields()) v[f.key] = f.def; return v; };

test('Gitter: D3Q19 — Gewichte, Symmetrie, Gegenrichtungen, Schallgeschwindigkeit', () => {
  assert.equal(L.C.length, 19);
  let sw = 0; const m1 = [0, 0, 0]; const m2 = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  L.C.forEach((c, i) => {
    sw += L.W[i];
    for (let a = 0; a < 3; a++) { m1[a] += L.W[i] * c[a]; for (let b = 0; b < 3; b++) m2[a][b] += L.W[i] * c[a] * c[b]; }
    const o = L.OPP[i];
    assert.deepEqual(L.C[o].map(v => v + 0), c.map(v => -v + 0), 'Gegenrichtung von ' + i);
  });
  assert.ok(Math.abs(sw - 1) < 1e-12);
  assert.deepEqual(m1.map(v => +v.toFixed(12)), [0, 0, 0]);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) assert.ok(Math.abs(m2[a][b] - (a === b ? 1 / 3 : 0)) < 1e-12, 'c_s² = 1/3');
  /* Gleichgewicht: Summe = Dichte, Impuls = Dichte × Geschwindigkeit. */
  let r = 0, px = 0; for (let i = 0; i < 19; i++) { const f = L.feq(i, 1.2, 0.05, -0.02, 0.01); r += f; px += L.C[i][0] * f; }
  assert.ok(Math.abs(r - 1.2) < 1e-12 && Math.abs(px - 1.2 * 0.05) < 1e-12);
});

/* Ein gerader Kanal entlang x, Rand aus Wand, innen 8×8 Zellen. */
function channel(len = 72, fillTo = 10, inlet = true) {
  const nx = len, ny = 10, nz = 10, N = nx * ny * nz;
  const flags = new Uint32Array(N).fill(FLAG.WALL);
  const at = (x, y, z) => (z * ny + y) * nx + x;
  for (let z = 1; z < nz - 1; z++) for (let y = 1; y < ny - 1; y++) for (let x = 1; x < nx - 1; x++) {
    flags[at(x, y, z)] = (inlet && x === 1) ? FLAG.INLET : x <= fillTo ? FLAG.FLUID : x === fillTo + 1 ? FLAG.INTERFACE : FLAG.GAS;
  }
  return { dims: [nx, ny, nz], N, flags, sensor: new Uint32Array(N), gates: [], inletDir: 1, at };
}

test('Kern: in der geschlossenen Box bleibt die Masse exakt, nichts geht verloren', () => {
  const d = channel(40, 10, false);
  const s = createSolver(d);
  const m0 = s.totals().mass;
  for (let k = 1; k <= 150; k++) s.step([0, 0, 0], k);
  const t = s.totals();
  assert.ok(Math.abs(t.mass - m0) < 1e-6 * m0, 'Masse ' + m0 + ' → ' + t.mass);
  assert.equal(t.lost, 0);
  for (const e of s.fill()) assert.ok(Number.isFinite(e) && e >= 0 && e <= 1);
});

test('Kern: der Kolben schiebt — Zustrom und Frontweg stimmen mit der Kolbengeschwindigkeit', () => {
  const d = channel(72, 10, true);
  const s = createSolver(d);
  const u = 0.03, inletCells = 64;
  const m0 = s.totals().mass;
  const front = () => { const e = s.fill(); let mx = 0; for (let i = 0; i < d.N; i++) if (e[i] > 0.5 && d.flags[i] !== FLAG.WALL) mx = Math.max(mx, i % d.dims[0]); return mx; };
  for (let k = 1; k <= 300; k++) s.step([u, 0, 0], k);
  const m = s.totals().mass;
  const expect = m0 + inletCells * u * 300;
  assert.ok(Math.abs(m - expect) / expect < 0.03, `Zustrom: ${m.toFixed(1)} gegen ${expect.toFixed(1)}`);
  /* Die Front ist ein laminarer Finger: die Mitte eilt dem Mittel voraus. */
  const f = front();
  assert.ok(f >= 10 + u * 300 - 1 && f <= 10 + 2 * u * 300 + 2, 'Front bei x = ' + f);
  /* Ankunft: die Zelle bei x = 12 wurde nach dem Start benetzt. */
  const arr = s.arrival();
  const idx = d.at(14, 5, 5);
  assert.ok(arr[idx] > 0 && arr[idx] < 300, 'Ankunftsschritt ' + arr[idx]);
  assert.equal(arr[d.at(60, 5, 5)], NEVER, 'weit hinten kam noch nichts an');
});

test('Gitter aus dem Angusssystem: Rollen, Kolbenfläche, Anschnitte mit Meldern, Front dazwischen', async () => {
  const g = PRE.demoTwoGates();
  const h = 5;
  const cc = cellCount(g, h);
  const d = await buildDomain(g, h);
  assert.deepEqual(d.dims, cc.dims, 'die Vorschau zählt dieselben Zellen');
  assert.equal(d.N, cc.count);
  assert.ok(suggestCell(g) >= 1 && suggestCell(g) <= 4, 'Vorschlag ' + suggestCell(g));
  const b = g.biscuit;
  const biscVol = Math.PI * b.d * b.d / 4 * b.t / (h * h * h);
  assert.ok(Math.abs(d.biscuitCells - biscVol) / biscVol < 0.2, `Pressrest ${d.biscuitCells} Zellen gegen ${biscVol.toFixed(0)}`);
  const disc = Math.PI * b.d * b.d / 4 / (h * h);
  assert.ok(Math.abs(d.inletCells - disc) / disc < 0.35, `Kolbenfläche ${d.inletCells} Zellen gegen ${disc.toFixed(0)}`);
  assert.equal(d.inletDir, 3, 'der Kolben schiebt nach +y');
  assert.equal(d.gates.length, 2);
  for (const gt of d.gates) assert.ok(gt.outlet > 0 && gt.sensor > 0, gt.id + ': Auslass ' + gt.outlet + ', Melder ' + gt.sensor);
  /* Keine leere Zelle neben Schmelze, kein Schmelzezelle am Rand. */
  const [nx, ny] = d.dims;
  const OFF = L.C.map(c => c[0] + c[1] * nx + c[2] * nx * ny);
  let bad = 0;
  for (let i = 0; i < d.N; i++) {
    if (d.flags[i] !== FLAG.FLUID && d.flags[i] !== FLAG.INLET) continue;
    for (let k = 1; k < 19; k++) if (d.flags[i + OFF[k]] === FLAG.GAS) bad++;
  }
  assert.equal(bad, 0, 'die Front trennt Schmelze und Luft');
  const mask = runnerMask(d);
  let n = 0; for (let i = 0; i < d.N; i++) n += mask[i];
  assert.ok(n > 0 && n < d.runnerCells + 10);
});

test('Kolben und Einheiten: die Kurve ab Kammer voll, ein stabiler Zeitschritt', () => {
  const g = PRE.demoTwoGates();
  const proc = { ...F.DEFAULT_PROCESS };
  F.applyAutoGates(g, proc);
  const net = sampleNetwork(g);
  const b = g.biscuit;
  const tl = shotTimeline(defaults(), { part: proc.volume * 1000, overflow: 0, runner: 8e4, biscuit: Math.PI * b.d * b.d / 4 * b.t }, { diam: b.d, length: proc.chamberLen });
  assert.ok(!tl.error, tl.error);
  const pc = pistonCurve(tl);
  assert.ok(pc.tEnd > 0.02, 'die Kurve läuft nach Kammer voll weiter: ' + pc.tEnd);
  assert.ok(Math.abs(pc.v(0) - tl.shot.events[0].v) < 1e-9, 'bei Kammer voll die Kolbengeschwindigkeit der Kurve');
  let last = pc.v(0);
  for (let t = 0; t <= pc.tEnd; t += pc.tEnd / 50) { const v = pc.v(t); assert.ok(v >= last - 1e-9, 'die Rampe fällt nicht'); last = v; }
  assert.ok(pc.vMax >= last - 1e-9 && pc.vMax <= tl.v2 + 1e-6, 'vMax ' + pc.vMax + ' gegen v₂ ' + tl.v2);
  const aMin = minRunnerArea(net);
  const aGate = net.nodeArea[net.edges.find(e => e.to.type === 'gate').toId + ':gate'].area * 1e-6;
  assert.ok(aMin > aGate * 1.3, 'der kleinste Laufkanal ist nicht der Anschnitt: ' + aMin + ' gegen ' + aGate);
  const u = latticeUnits({ h: 2, vMax: pc.vMax, A: pc.A, aMin, nu: F.ALLOYS.al.nu });
  assert.ok(u.tau0 >= 0.51, 'τ bleibt stabil: ' + u.tau0);
  assert.ok(Math.abs(u.uIn(u.vRunMax) - u.uTarget) < 1e-12, 'an der schnellsten Stelle die Zielgeschwindigkeit');
  assert.ok(u.uIn(pc.vMax) < 0.02, 'der Kolben selbst ist langsam im Gitter: ' + u.uIn(pc.vMax));
  assert.ok(u.dt > 1e-7 && u.dt < 1e-4, 'Zeitschritt ' + u.dt);
});

test('Ganzer Lauf auf grobem Gitter: die Front kommt an beiden Anschnitten an, in der Größenordnung der 1D-Rechnung', async () => {
  const g = PRE.demoTwoGates();
  const proc = { ...F.DEFAULT_PROCESS };
  F.applyAutoGates(g, proc);
  const d = await buildDomain(g, 6);
  const net = d.net;
  const flow = F.analyseFlow(g, net, proc);
  const b = g.biscuit;
  const tl = shotTimeline(defaults(), { part: proc.volume * 1000, overflow: 0, runner: flow.runnerVolume, biscuit: Math.PI * b.d * b.d / 4 * b.t }, { diam: b.d, length: proc.chamberLen });
  const pc = pistonCurve(tl);
  const u = latticeUnits({ h: 6, vMax: pc.vMax, A: pc.A, aMin: minRunnerArea(net), nu: F.ALLOYS.al.nu });
  const s = createSolver(d);
  const mask = runnerMask(d);
  let step = 0;
  const maxSteps = Math.ceil(0.04 / u.dt);
  while (step < maxSteps && Array.from(s.gateArrival).some(a => a === NEVER)) {
    step++;
    const ul = u.uIn(pc.v(step * u.dt));
    s.step([d.axis[0] * ul, d.axis[1] * ul, d.axis[2] * ul], step);
  }
  const times = Array.from(s.gateArrival).map(a => a * u.dt);
  assert.ok(times.every(t => Number.isFinite(t) && t > 0.003 && t < 0.04), 'Ankunft ' + times.map(t => (t * 1000).toFixed(1)).join(' / ') + ' ms');
  assert.ok(Math.abs(times[0] - times[1]) < 0.004, 'symmetrisch: beide etwa gleichzeitig');
  const e = s.fill();
  let filled = 0, n = 0;
  for (let i = 0; i < d.N; i++) if (mask[i]) { filled += e[i]; n++; }
  assert.ok(filled / n > 0.6, 'der Anguss ist dann weitgehend voll: ' + (filled / n));
  for (let i = 0; i < d.N; i++) assert.ok(Number.isFinite(e[i]));
});
