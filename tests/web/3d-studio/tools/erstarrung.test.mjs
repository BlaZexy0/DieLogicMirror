/* Erstarrung einrichten (web/tools/erstarrung/): der Fall für
   dieLogicSolFoam ohne DOM — Formblock, Kolben, Kanäle, Dateien des Falls,
   der Bericht — und die Seite unter dem DOM-Platzhalter mit dem Beispiel
   Gusstraube vom Laden bis zum ZIP. Ob der Fall in OpenFOAM läuft, prüft ein
   lokaler Lauf (Allrun); hier stehen die Eigenschaften, an denen er hängt. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildDocument, installGlobals } from '../stubs/dom.mjs';
import { ROOT, loadDesignScripts, wait } from './fixture.mjs';

const SOL = resolve(ROOT, '..', 'erstarrung');
const SIM = resolve(ROOT, '..', 'simulation');
const WEB = resolve(ROOT, '..', '..');
const imp = (base, f) => import(pathToFileURL(resolve(base, f)).href);
const G = await imp(SIM, 'js/core/geometry.js');
const S = await imp(SOL, 'js/core/solcase.js');
const M = await imp(SOL, 'js/core/materials.js');

function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5]];
  const out = [];
  for (const [a, b, c, d] of q) out.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  return Float64Array.from(out);
}
/* Zylinder um (cx, cy) von z0 bis z1, nach außen orientiert */
function cylinder(cx, cy, R, z0, z1, n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a0 = 2 * Math.PI * i / n, a1 = 2 * Math.PI * (i + 1) / n;
    const p0 = [cx + R * Math.cos(a0), cy + R * Math.sin(a0)], p1 = [cx + R * Math.cos(a1), cy + R * Math.sin(a1)];
    out.push(cx, cy, z0, ...p1, z0, ...p0, z0);
    out.push(cx, cy, z1, ...p0, z1, ...p1, z1);
    out.push(...p0, z0, ...p1, z0, ...p1, z1, ...p0, z0, ...p1, z1, ...p0, z1);
  }
  return Float64Array.from(out);
}
/* Platte über der Trennebene nach unten (z −10 … 0), Pressrest darunter (z −30 … −10) */
function shot() {
  const part = box(-60, -30, -10, 60, 30, 0), bis = cylinder(0, -50, 20, -30, -10);
  const runner = box(-8, -45, -10, 8, -25, -4);
  const bodies = [{ name: 'Bauteil', role: 'part', tris: part }, { name: 'Anguss', role: 'runner', tris: runner }, { name: 'Pressrest', role: 'biscuit', tris: bis }];
  const s = G.suggestInlet(bis);
  const plunger = { centroid: s.centroid, normal: s.normal, radius: s.radius, depth: G.depthAlong(bis, s.centroid, s.normal) };
  return { bodies, plunger, union: G.unionSurfaces(bodies.map(b => Object.assign({}, b, { maxEdge: 1 })), { maxEdge: 1 }) };
}

test('Formblock: Rand um das Gussteil, Kolben bis zum Rand, feste Hälfte auf der Seite des Kolbens', () => {
  const { bodies, plunger } = shot();
  assert.ok(Math.abs(plunger.normal[2] + 1) < 1e-9, 'die Kolbenfläche schaut nach −z');
  const b = S.dieBlock({ bodies, plunger, die: { margin: 40, parting: 0 }, mesh: { cell: 2, dieLevel: 2 } });
  assert.ok(b.lo[2] <= -30 - 40 + 1e-9 && b.hi[2] >= 0 + 40 - 1e-9, 'Rand je Seite');
  assert.equal(b.hBg, 8);
  for (let k = 0; k < 3; k++) assert.ok(Math.abs((b.hi[k] - b.lo[k]) / b.hBg - b.n[k]) < 1e-9, 'ganze Zellen');
  assert.ok(Math.abs(b.plungerLength - (-30 - b.lo[2])) < 1e-9, 'von der Fläche bis zum Boden des Blocks');
  assert.equal(b.fixedBelow, true);
  /* Kolben von oben: die feste Hälfte oben */
  const up = Object.assign({}, plunger, { normal: [0, 0, 1], centroid: [0, -50, 0] });
  assert.equal(S.dieBlock({ bodies, plunger: up, die: {}, mesh: { cell: 2, dieLevel: 1 } }).fixedBelow, false);
});

test('Kanäle: Abstand einer Strecke zum Gussteil', () => {
  const t = box(0, 0, 0, 10, 10, 10);
  /* Stichproben: Ecken und Mitten der Dreiecke — knapp über dem wahren Abstand */
  const d = S.segmentDistance([-20, 5, 25], [30, 5, 25], t);
  assert.ok(d >= 15 - 1e-9 && d < 15.2, 'Abstand ' + d);
  assert.ok(S.segmentDistance([-20, 5, 5], [30, 5, 5], t) < 6, 'durch den Körper: höchstens bis zur nächsten Stichprobe');
});

test('Werkstoffe: Kurven fallen, die Auslegung gibt eine lineare', () => {
  for (const a of M.ALLOYS) {
    for (let i = 1; i < a.fs.length; i++) assert.ok(a.fs[i][0] < a.fs[i - 1][0] && a.fs[i][1] > a.fs[i - 1][1], a.id + ' fs(T) fällt');
    assert.ok(a.rhoSolid > a.rhoLiquid, a.id + ' schwindet');
  }
  const l = M.alloyFromFields('x', 'AlSi9Cu3', { density: 2420, densitySolid: 2750, Tcast: 660, Tliq: 593, Tsol: 521, hf: 403, cp20: 846, cpS: 1034, cpL: 1056 });
  assert.deepEqual(l.fs, [[593 + 273.15, 0], [521 + 273.15, 1]]);
  assert.equal(M.liquidus(l), 593);
  assert.equal(M.solidus(l), 521);
});

test('Fall: Zonen, Kanäle, Kolben, Prozess, Allrun', () => {
  const { bodies, plunger, union } = shot();
  const channels = [{ a: [-200, 0, 30], b: [200, 0, 30], d: 10, T: 60, h: 8000 }, { a: [-200, 0, -50], b: [200, 0, -50], d: 0, T: 60, h: 8000 }];
  const { files, info } = S.buildSolCase({ title: 'Platte', bodies, plunger, union, die: { margin: 40, parting: 0 }, channels, mesh: { cell: 2, dieLevel: 2, nProc: 4 }, process: {}, post: {} });
  for (const f of ['Allrun', 'Allclean', 'README.md', 'bilder.py', 'bericht.py', 'auswertung.json', 'simulation/system/snappyHexMeshDict', 'simulation/system/topoSetDict',
    'simulation/constant/materialProperties', 'simulation/constant/heatTransferProperties', 'simulation/constant/processProperties', 'simulation/constant/defectProperties',
    'simulation/system/auswertung', 'simulation/0.orig/T', 'simulation/constant/triSurface/casting.stl']) assert.ok(files[f], f);
  const sn = files['simulation/system/snappyHexMeshDict'];
  assert.ok(/faceZone casting;[\s\S]*cellZone gussteil;[\s\S]*cellZoneInside insidePoint;/.test(sn));
  /* der Punkt im Pressrest liegt im Pressrest: unter der Kolbenfläche (z −30 … −10), im Kreis */
  const ip = sn.match(/insidePoint \(([^)]+)\)/)[1].split(' ').map(x => 1000 * Number(x));
  assert.ok(ip[2] > -30 && ip[2] < -10 && Math.hypot(ip[0], ip[1] + 50) < 20, 'im Pressrest: ' + ip);
  /* ein Kanal mit Ø 0 fällt weg, der andere ist ein Zylinder mit eigenem Rand */
  assert.ok(sn.includes('kanal1 { type searchableCylinder;') && !sn.includes('kanal2'));
  assert.equal(info.channels, 1);
  const ht = files['simulation/constant/heatTransferProperties'];
  assert.ok(/kanal1 +\{ type convective; h 8000; Tinf 333.15; \}/.test(ht), ht);
  assert.ok(/plungerEnd/.test(ht) && /castingDie[\s\S]*dieFixed[\s\S]*dieMoving[\s\S]*plunger/.test(ht));
  const ts = files['simulation/system/topoSetDict'];
  for (const z of ['name feeder;', 'name gussteil; type cellZoneSet', 'name plunger;', 'name dieMoving;', 'name kolbenEnde;']) assert.ok(ts.includes(z), z);
  /* die bewegliche Hälfte liegt über der Trennebene (Kolben unten) */
  const box_ = ts.match(/boxToCell; box \(([^)]+)\) \(([^)]+)\)/);
  assert.equal(Number(box_[1].split(' ')[2]), 0);
  const mp = files['simulation/constant/materialProperties'];
  assert.ok(mp.includes('cellZones   (gussteil feeder);') && mp.includes('cellZones   (dieMoving);') && mp.includes('cellZones   (plunger);'));
  assert.ok(files['simulation/constant/defectProperties'].includes('feederZones     (feeder);'));
  /* ein Schuss: bis das Gussteil fest ist; Füllzeit als fillEndTime */
  const pp = files['simulation/constant/processProperties'];
  assert.ok(pp.includes('stopWhenSolid   yes;') && pp.includes('fillEndTime     0.05;'));
  assert.ok(/intensificationPressure table \(\(0 5000000\) \(0.03 80000000\)/.test(pp));
  const ar = files['Allrun'];
  assert.ok(ar.startsWith('#!/bin/sh') && ar.includes('FUELLUNG=${FUELLUNG:-}') && ar.includes('snappyHexMesh -parallel -overwrite') && ar.includes('reconstructParMesh -constant'));
  const conf = JSON.parse(files['auswertung.json']);
  assert.deepEqual(conf.views.map(v => v.id), ['iso']);
  assert.ok(conf.frameDt > 0 && conf.tEst > 0);
  /* Zyklen und Füllrechnung */
  const z = S.buildSolCase({ title: 'Platte', bodies, plunger, union, die: {}, channels: [], mesh: { cell: 2, dieLevel: 2, nProc: 4 },
    process: { mode: 'cycles', nCycles: 3, cycleTime: 50, dieOpen: 30, spray0: 33, spray1: 36, start: 'fill', fillCase: '../../F/simulation' }, post: {} });
  const zp = z.files['simulation/constant/processProperties'];
  assert.ok(/cycles\s*\{\s*nCycles\s+3;\s*cycleTime\s+50;\s*dieOpen\s+30;\s*spray\s+\(33 36\);/.test(zp));
  assert.ok(!zp.includes('fillEndTime') && !zp.includes('stopWhenSolid'));
  assert.ok(z.files['Allrun'].includes('FUELLUNG=${FUELLUNG:-../../F/simulation}'));
  assert.ok(/endTime\s+150;/.test(z.files['simulation/system/controlDict']));
});

test('Bericht: bericht.py schreibt Graphiken, Daten und bericht.html (Python 3)', t => {
  if (spawnSync('python3', ['--version']).status !== 0) { t.skip('ohne python3'); return; }
  const { bodies, plunger, union } = shot();
  const { files } = S.buildSolCase({ title: 'Platte', bodies, plunger, union, die: {}, channels: [], mesh: { cell: 2, dieLevel: 2, nProc: 2 }, process: {}, post: {} });
  const dir = mkdtempSync(join(tmpdir(), 'dielogic-erstarrung-'));
  try {
    for (const f of ['auswertung.json', 'bericht.py', 'bilder.py']) writeFileSync(join(dir, f), files[f]);
    const c = spawnSync('python3', ['-m', 'py_compile', join(dir, 'bilder.py')], { encoding: 'utf8' });
    assert.equal(c.status, 0, c.stderr);
    const pp = join(dir, 'simulation', 'postProcessing', 'dieLogicSol');
    mkdirSync(pp, { recursive: true });
    const ts = Array.from({ length: 41 }, (_, i) => i * 0.25);
    writeFileSync(join(pp, 'solidification.dat'), '# time  cycle  cycleTime  timeFromFillStart  deltaT  nOuter  liquidFraction  castTmin  castTmax  dieTmin  dieTmax  Qboundary[W]  QcastToDie[W]  QopenDie[W]  pFeed[Pa]  energyError[J]  heatOut[J]\n'
      + ts.map(t => [t, 1, t, t + 0.05, 0.01, 3, Math.max(0, 1 - t / 9), 900 - 20 * t, 930 - 10 * t, 473, 600 - 5 * t, 2000, 5e4 / (1 + t), 0, 8e7, 1e-6, 1000 * t].join(' ')).join('\n') + '\n');
    writeFileSync(join(pp, 'porosity.dat'), '# time  cycleTime  pFeed[Pa]  fedLiquid[cm3]  nIsolated  isolatedLiquid[cm3]  shrinkagePores[cm3]  gasPores[cm3]  microPores[cm3]  maxPorosity\n'
      + ts.map(t => [t, t, 8e7, Math.max(0, 70 - 8 * t), t > 5 ? 1 : 0, t > 5 ? 2 : 0, t > 6 ? 0.12 : 0, 0.01, 0, t > 6 ? 0.14 : 0.01].join(' ')).join('\n') + '\n');
    writeFileSync(join(pp, 'soldering.dat'), '# time  dieSurfaceTmax[K]  areaAboveTcrit[cm2]  maxSolderingIndex  areaIndexAbove1[cm2]\n10 826 2.6 0.72 0\n');
    writeFileSync(join(pp, 'solidificationTimes.dat'), '# cycle  region  solid at [s, from end of fill]  [s, from start of fill]\n1  gussteil  9.1  9.15\n1  feeder  9.8  9.85\n1  casting  9.8  9.85\n');
    writeFileSync(join(dir, 'simulation', 'log.dieLogicSolFoam'), 'Time = 9.8\nExecutionTime = 812.5 s  ClockTime = 830 s\n\nEnd\n');
    const r = spawnSync('python3', [join(dir, 'bericht.py')], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(join(dir, 'auswertung', 'bericht.html'), 'utf8');
    for (const x of ['Gussteil ohne Pressrest fest', '9,1 s', 'Pressrest fest', 'Ganz fest', '9,8 s', 'Schwindungsporen', '0,12 cm³', 'Klebeindex höchstens', '13 min 50 s', 'Restschmelze im Gussteil', 'Speisung']) assert.ok(html.includes(x), x);
    assert.ok(!/NaN|undefined/.test(html.replace(/isFinite|NaN\)|f\.rest/g, '')), 'keine Lücken');
    for (const f of ['graphiken/restschmelze.svg', 'graphiken/temperaturen.svg', 'graphiken/speisung.svg', 'daten/erstarrung.csv', 'daten/erstarrungszeiten.csv']) assert.ok(existsSync(join(dir, 'auswertung', f)), f);
    assert.ok(!/d="L/.test(readFileSync(join(dir, 'auswertung', 'graphiken', 'restschmelze.svg'), 'utf8')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Seite: Beispiel laden, Schritte der Reihe nach, Fall als ZIP', async () => {
  const { doc } = buildDocument(readFileSync(resolve(SOL, 'index.html'), 'utf8'));
  installGlobals(doc);
  const inner = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.startsWith('/examples/')) { const buf = readFileSync(resolve(WEB, u.slice(1))); return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; }
    return inner(url);
  };
  globalThis.location = { search: '', href: 'http://test/tools/erstarrung/', pathname: '/tools/erstarrung/' };
  loadDesignScripts();
  const mod = await import(pathToFileURL(resolve(SOL, 'js/app.js')).href);
  const v = mod.__viewer;
  await wait(() => v.state.ready && v.plan.bodies.length === 4, 1600);
  assert.deepEqual(v.state.shown, ['koerper', 'kolben', 'form', 'kuehlung', 'netz', 'prozess', 'auswertung', 'fall']);
  assert.equal(v.state.open, 'kolben');
  assert.equal(v.activate('fall'), false);
  /* Kolben: beim ersten Besuch gilt die größte Kreisfläche des Pressrests */
  v.activate('kolben');
  assert.ok(v.plan.inlet && Math.abs(v.plan.inlet.radius - 65) < 0.2);
  assert.equal(v.state.open, 'fall', 'Form, Kühlung (wahlweise), Netz, Prozess, Auswertung haben Vorgaben');
  /* Form: der Rand folgt dem Vorschlag beim ersten Besuch */
  v.activate('form');
  assert.equal(v.plan.sol.die.margin, 40, '1,5 × Pressrest (20 mm, mindestens 25) auf 5 mm');
  /* Kühlung: Vorschlag setzen legt Kanäle, die das Gussteil nicht schneiden */
  v.activate('kuehlung');
  doc.querySelector('[data-ui="ch-sugg"]').dispatch('click');
  assert.ok(v.plan.sol.channels.length >= 2, 'Kanäle: ' + v.plan.sol.channels.length);
  const S2 = await imp(SOL, 'js/core/solcase.js');
  for (const c of v.plan.sol.channels) {
    const d = Math.min(...v.plan.included().map(b => S2.segmentDistance(c.a, c.b, b.tris))) - c.d / 2;
    assert.ok(d >= c.d, 'Stahl bis zur Kavität ' + d);
  }
  /* Netz: die Zellgröße nach Vorschlag */
  v.activate('netz');
  assert.ok(v.plan.sol.mesh.cell > 0 && v.plan.sol.mesh.cellSet === false);
  v.activate('prozess');
  assert.ok(v.tools.prozess.valid());
  /* Füllrechnung ohne Pfad: der Prozess ist nicht erledigt */
  v.plan.sol.process.start = 'fill'; v.plan.changed('sol');
  assert.equal(v.tools.prozess.valid(), false);
  assert.equal(v.state.open, 'prozess');
  v.plan.sol.process.start = 'uniform'; v.plan.changed('sol');
  /* Fall: ZIP mit dem Namen nach Vorschlag */
  v.activate('fall');
  const B = await imp(SOL, 'js/build.js');
  const P = await imp(SOL, 'js/payload.js');
  const p = P.payloadOf(v.plan);
  p.mesh.cell = 6;                     // schneller: nur der Aufbau zählt hier
  const r = await B.build(p);
  assert.ok(/^\d{4}-\d{2}-\d{2}_Gusstraube_Erstarrung$/.test(r.root), r.root);
  assert.ok(r.files.includes('simulation/system/snappyHexMeshDict') && r.files.includes('Allrun'));
  assert.ok(r.zip.length > 1000);
  /* Die Datei der Seite: Kennung und Einstellungen von plan.sol */
  const j = v.toJSON();
  assert.equal(j.format, 'dielogic-erstarrung');
  assert.ok(j.plan.sol && j.plan.sol.channels.length === v.plan.sol.channels.length);
});
