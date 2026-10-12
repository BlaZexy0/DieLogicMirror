/* Simulation einrichten (web/tools/simulation/): die Rechnung ohne DOM —
   Vereinigung der Körper, Einlass, Fall, ZIP — und die Seite unter dem
   DOM-Platzhalter mit dem Beispiel Gusstraube vom Laden bis zum ZIP.
   Ob der Fall in OpenFOAM läuft, prüft das ein lokaler Lauf (Allrun);
   hier stehen die Eigenschaften, an denen er hängt. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import { buildDocument, installGlobals } from '../stubs/dom.mjs';
import { ROOT, loadDesignScripts, wait } from './fixture.mjs';

const SIM = resolve(ROOT, '..', 'simulation');
const WEB = resolve(ROOT, '..', '..');
const imp = f => import(pathToFileURL(resolve(SIM, f)).href);
const G = await imp('js/core/geometry.js');
const C = await imp('js/core/casegen.js');
const Z = await imp('js/core/zip.js');

/* Ein Quader als Dreieckssuppe (nach außen orientiert), mm. */
function box(x0, y0, z0, x1, y1, z1) {
  const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
  const q = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [0, 4, 7, 3], [1, 2, 6, 5]];
  const out = [];
  for (const [a, b, c, d] of q) out.push(...v[a], ...v[b], ...v[c], ...v[a], ...v[c], ...v[d]);
  return Float64Array.from(out);
}
const area = t => { let A = 0; for (let i = 0; i < t.length; i += 9) { const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2]; A += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } return A; };

test('Vereinigung: Überlappung wird innen, der Rand bleibt Wand', () => {
  /* zwei Quader 10×10×10, um 4 mm ineinander geschoben */
  const a = box(0, 0, 0, 10, 10, 10), b = box(6, 0, 0, 16, 10, 10);
  const r = G.unionSurfaces([{ tris: a }, { tris: b }], { maxEdge: 1 });
  const wall = r.patches.get(0);
  /* Rand der Vereinigung 16×10×10: 2·(160 + 160 + 100) = 840 mm². Wo beide
     Körper dieselbe Außenebene haben (die vier Seiten im Streifen 6…10),
     bleiben beide Stücke Wand: 4 · 4 · 10 = 160 mm² doppelt — für
     snappyHexMesh harmlos. */
  /* Die Wand ist nie kleiner als der wahre Rand (kein Spalt), sie ragt
     höchstens eine Teilungskante (1 mm) über die Ränder der Stirnflächen. */
  assert.ok(area(wall) >= 1000 - 1e-6 && area(wall) <= 1000 + 2 * 40 * 1, 'Wandfläche ' + area(wall));
  /* innen: je eine Stirnfläche 10×10 im anderen Körper, bis auf den Saum */
  assert.ok(area(r.internal) <= 200 + 1e-6 && area(r.internal) >= 200 - 2 * 40 * 1, 'innere Fläche ' + area(r.internal));
});

test('Vereinigung: gegensinnig berührende Flächen werden zum Durchgang, gleichsinnige bleiben Wand', () => {
  /* Anschnitt: Quader b liegt an der Wand x = 10 von a an */
  const a = box(0, 0, 0, 10, 10, 10), b = box(10, 2, 2, 14, 8, 8);
  const r = G.unionSurfaces([{ tris: a }, { tris: b }], { maxEdge: 0.5 });
  assert.ok(r.stats.touching > 0);
  /* nie größer als der Fleck (sonst ein Spalt), kleiner höchstens um einen
     Saum von einer Teilungskante (0,5 mm am Umfang 24 mm) */
  assert.ok(area(r.internal) <= 72 + 1e-6 && area(r.internal) >= 72 - 2 * 24 * 0.5, 'Berührfläche zweimal 6×6: ' + area(r.internal));
  assert.ok(r.stats.internalArea[0] <= 36 + 1e-6 && r.stats.internalArea[0] >= 36 - 24 * 0.5, 'die Öffnung in der Wand von a: ' + r.stats.internalArea[0]);
  /* gemeinsame Trennebene z = 0: beide Unterseiten gleichsinnig — Wand */
  const c = box(0, 0, 0, 10, 10, 2), d = box(5, 5, 0, 20, 8, 1);
  const s = G.unionSurfaces([{ tris: c }, { tris: d }], { maxEdge: 0.5 });
  const bottom = t => { let A = 0; for (let i = 0; i < t.length; i += 9) if (t[i + 2] === 0 && t[i + 5] === 0 && t[i + 8] === 0) A += area(t.subarray(i, i + 9)); return A; };
  /* Boden der Vereinigung: 100 + der Teil von d außerhalb c (10×3) — d's Boden in c zählt doppelt (gleichsinnig, Wand) */
  assert.ok(bottom(s.patches.get(0)) >= 130 - 1e-6, 'Boden ' + bottom(s.patches.get(0)));
  assert.equal(bottom(s.internal), 0);
});

test('Vereinigung: ein großes Wanddreieck, durch dessen Mitte ein Anguss läuft, bekommt ein Loch nur dort', () => {
  /* Wand x = 0 von a ist EIN großes Dreieckspaar; b steckt mittig darin */
  const a = box(0, -100, -100, 50, 100, 100), b = box(-5, -2, -2, 2, 2, 2);
  const r = G.unionSurfaces([{ tris: a }, { tris: b }], { maxEdge: 0.25 });
  assert.ok(r.stats.internalArea[0] <= 16 + 1e-6 && r.stats.internalArea[0] >= 16 - 16 * 0.25, 'Öffnung in a ≈ 4×4: ' + r.stats.internalArea[0]);
  /* und nur dort: der Rest der großen Wand bleibt Wand */
  assert.ok(r.stats.internalArea[0] < 20);
});

test('Vereinigung: ein Körper aus zwei sich durchdringenden Schalen (Anguss des Designers) zählt wie zwei', () => {
  const a = box(0, 0, 0, 10, 10, 10), b = box(6, 0, 0, 16, 10, 10);
  const one = new Float64Array(a.length + b.length); one.set(a); one.set(b, a.length);
  assert.equal(G.shells(one).length, 2);
  const r = G.unionSurfaces([{ tris: one }], { maxEdge: 1 });
  /* wie zwei Körper: Rand 840 mm² (+ 160 doppelt auf den gemeinsamen Ebenen), innen die beiden Stirnflächen */
  assert.ok(area(r.patches.get(0)) >= 1000 - 1e-6 && area(r.patches.get(0)) <= 1080, 'Wand ' + area(r.patches.get(0)));
  assert.ok(area(r.internal) <= 200 + 1e-6 && area(r.internal) >= 120, 'innen ' + area(r.internal));
  assert.equal(r.stats.internalArea.length, 1, 'gezählt wird je Körper');
});

test('Vereinigung: Anschnitt mit gemeinsamer Ober- und Unterseite bleibt in voller Höhe offen', () => {
  /* Platte 4 mm dick, Steg 10 × 4 mm, 2 mm in die Platte gesteckt — Ober- und
     Unterseite in denselben Ebenen. Die Öffnung in der Plattenwand ist 10 × 4. */
  const plate = box(-50, 0, -4, 50, 60, 0), bar = box(-5, -40, -4, 5, 2, 0);
  const r = G.unionSurfaces([{ tris: plate }, { tris: bar }], { maxEdge: 1 });
  /* volle Höhe offen; an den Seiten x = ±5 höchstens ein Saum der Teilungskante (1 mm) */
  assert.ok(r.stats.internalArea[0] > 40 - 2 * 4 * 0.5 - 1e-6 && r.stats.internalArea[0] <= 40 + 1e-6, 'Öffnung in der Platte ' + r.stats.internalArea[0]);
});

test('Einlass: die große Kreisfläche eines Zylinders, Tiefe = Höhe', () => {
  const n = 64, R = 30, H = 20, out = [];
  for (let i = 0; i < n; i++) {
    const a0 = 2 * Math.PI * i / n, a1 = 2 * Math.PI * (i + 1) / n;
    const p0 = [R * Math.cos(a0), R * Math.sin(a0)], p1 = [R * Math.cos(a1), R * Math.sin(a1)];
    out.push(0, 0, -H, ...p1, -H, ...p0, -H);           // Boden, Normale −z
    out.push(0, 0, 0, ...p0, 0, ...p1, 0);              // Deckel, +z
    out.push(...p0, -H, ...p1, -H, ...p1, 0, ...p0, -H, ...p1, 0, ...p0, 0);
  }
  const t = Float64Array.from(out);
  const s = G.suggestInlet(t);
  assert.ok(s.circularity > 0.99 && Math.abs(s.radius - R) < 0.2);
  assert.ok(Math.abs(Math.abs(s.normal[2]) - 1) < 1e-9);
  assert.ok(Math.abs(G.depthAlong(t, s.centroid, s.normal) - H) < 1e-9);
  /* Wandstärke: der dünnste Teil ist die Höhe */
  assert.ok(Math.abs(G.thickness(t).p10 - H) < 1e-6);
});

test('Fall: Dateien, Randflächen, Schmelzezylinder, Allrun, Bilder', () => {
  const part = box(-50, -20, -10, 50, 40, 0);
  const bis = box(-15, -45, -12, 15, -15, 0);        // „Pressrest" (eckig genügt hier), überlappt das Bauteil
  const bodies = [{ name: 'Bauteil', tris: part, labels: new Int32Array(part.length / 9) }, { name: 'Pressrest', tris: bis, labels: new Int32Array(bis.length / 9) }];
  /* Einlass: Unterseite des Pressrests (z = −12), Auslass: Stirn x = 50 des Bauteils */
  const lab = (b, f) => { for (let i = 0; i < b.tris.length / 9; i++) if (f(b.tris.subarray(i * 9, i * 9 + 9))) b.labels[i] = b === bodies[1] ? 1 : 2; };
  lab(bodies[1], t => t[2] === -12 && t[5] === -12 && t[8] === -12);
  lab(bodies[0], t => t[0] === 50 && t[3] === 50 && t[6] === 50);
  const union = G.unionSurfaces(bodies, { maxEdge: 1 });
  const { files, info } = C.buildCase({
    title: 'Test', union, bodies,
    inlet: { centroid: [0, -30, -12], normal: [0, 0, -1], area: 900, radius: Math.sqrt(900 / Math.PI), depth: 12 },
    outlets: [{ centroid: [50, 10, -5], area: 600, mode: 'orifice', Cd: 0.8 }],
    mesh: { cell: 2, level: 1, nProc: 2 }, process: {}
  });
  for (const f of ['Allrun', 'Allclean', 'render.py', 'system/snappyHexMeshDict', 'system/blockMeshDict', 'system/setFieldsDict', 'system/controlDict',
    'constant/triSurface/walls.stl', 'constant/triSurface/inlet.stl', 'constant/triSurface/vent1.stl', 'constant/triSurface/internal.stl',
    'constant/gasProperties', 'constant/thermalProperties', 'constant/plungerTable', '0.orig/U', '0.orig/alpha.melt', '0.orig/p_rgh', '0.orig/T'])
    assert.ok(f in files, f + ' fehlt');
  assert.deepEqual(info.names, ['walls', 'inlet', 'vent1']);
  const shm = files['system/snappyHexMeshDict'];
  /* Überlappungen nur verfeinert, keine Fläche (Zellscheiben zwischen nahen inneren Flächen) */
  assert.match(shm, /internal \{ mode distance; levels \(\(0\.002 1\)\); \}/);
  assert.doesNotMatch(shm, /faceZone/);
  assert.match(shm, /locationsOutsideMesh/);
  assert.match(shm, /vent1 \{ level \(1 1\); patchInfo \{ type patch; \} \}/);
  assert.match(files['system/setFieldsDict'], /cylinderToCell/);
  /* wie die Validierungsfälle: Wandfilme mit Reibung */
  assert.match(files['system/fvSolution'], /wallFilmFriction true;/);
  assert.match(files['constant/gasProperties'], /vent1\s+\{ Cd 0\.8; \}/);
  /* Drossel: die Luft geht über das Gasmodell, für die Schmelze ist sie Wand */
  assert.match(files['0.orig/U'], /vent1 +\{ type noSlip; \}/);
  assert.match(files['0.orig/p_rgh'], /vent1 +\{ type fixedFluxPressure;/);
  assert.match(files['0.orig/alpha.melt'], /vent1 +\{ type zeroGradient; \}/);
  /* offen: Luft und Schmelze treten aus */
  const opened = C.buildCase({
    title: 'Test', union, bodies,
    inlet: { centroid: [0, -30, -12], normal: [0, 0, -1], area: 900, radius: Math.sqrt(900 / Math.PI), depth: 12 },
    outlets: [{ centroid: [50, 10, -5], area: 600, mode: 'open' }],
    mesh: { cell: 2, level: 1, nProc: 2 }, process: {}
  }).files;
  assert.match(opened['constant/gasProperties'], /vent1\s+\{ open true; \}/);
  assert.match(opened['0.orig/U'], /vent1 +\{ type pressureInletOutletVelocity;/);
  assert.match(opened['0.orig/p_rgh'], /vent1 +\{ type fixedValue;/);
  assert.match(opened['0.orig/alpha.melt'], /vent1 +\{ type inletOutlet;/);
  assert.match(files['constant/controlDict'] || files['system/controlDict'], /application\s+dieLogicFoam/);
  /* Kolben in Richtung der Einlassnormale nach innen (+z) */
  assert.match(files['constant/plungerTable'], /\(0 \(0 0 0\.5\)\)/);
  /* locationInMesh im Pressrest, nicht auf einer Zellfläche */
  const loc = /locationInMesh \(([^)]+)\)/.exec(shm)[1].split(' ').map(Number).map(x => x * 1000);
  assert.ok(loc[2] > -12 && loc[2] < 0 && Math.abs(loc[1] + 30) < 15, 'locationInMesh ' + loc);
  /* der Hintergrund liegt krumm: keine Zellfläche auf z = 0 */
  const bm = files['system/blockMeshDict'];
  const lo = /\(([-\d.e]+) ([-\d.e]+) ([-\d.e]+)\)/.exec(bm).slice(1).map(Number);
  const h = 2 * 2;
  assert.ok(Math.abs(((lo[2] % (h / 2)) + h / 2) % (h / 2)) > 0.05, 'Zellflächen auf runden Ebenen');
  /* Allrun prüft Leck und verschwundene Flächen; die Bilder: Farbleiste oben links, alle Kennwerte */
  assert.match(files.Allrun, /PATCHES="inlet vent1"/);
  assert.match(files.Allrun, /leakPath/);
  /* und vergleicht das Volumen des Netzes mit dem der Vereinigung (Platte + Pressrest − Überlappung) */
  const vm = Number(/awk -v vm=([\d.e-]+) /.exec(files.Allrun)[1]);
  const exact = (100 * 60 * 10 + 30 * 30 * 12 - 30 * 5 * 10) * 1e-9;   // ganze Dreiecke am Saum: auf 1 % genau
  assert.ok(Math.abs(vm / exact - 1) < 0.01, 'Modellvolumen ' + vm);
  assert.match(files.Allrun, /Total volume/);
  assert.match(files['render.py'], /bar\.Position = \[F\['barX'\], 1\.0 - F\['barTop'\] - F\['barLen'\]\]/, 'Farbleiste oben links, aus FRAME');
  for (const k of ['velocity', 'temperature', 'air', 'oxide', 'trapped', 'fillTime', 'solid']) assert.match(files['render.py'], new RegExp('"' + k + '"'));
  /* Binäre STL in Metern: 84 + 50·n Bytes, Koordinaten unter 1 */
  const stl = files['constant/triSurface/walls.stl'];
  const n = new DataView(stl.buffer, stl.byteOffset).getUint32(80, true);
  assert.equal(stl.length, 84 + 50 * n);
  assert.ok(Math.abs(new DataView(stl.buffer, stl.byteOffset).getFloat32(84 + 12, true)) < 1);
});

test('Fall: ohne Einlass oder Auslass gibt es keinen', () => {
  assert.throws(() => C.buildCase({ bodies: [{ tris: box(0, 0, 0, 1, 1, 1) }], union: {}, mesh: { cell: 1 } }), /Einlass/);
  assert.deepEqual(C.missing({ bodies: [], outlets: [], mesh: {} }).length, 4);
});

test('ZIP: lesbar, CRC stimmt, Allrun ausführbar', async () => {
  const files = { 'Allrun': '#!/bin/sh\necho hallo\n', 'a/b.txt': 'x'.repeat(5000), 'bin.dat': new Uint8Array([1, 2, 3, 250]) };
  const z = await Z.zip(files, { root: 'fall' });
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const eocd = z.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  const count = dv.getUint16(eocd + 10, true);
  assert.equal(count, 3);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let i = 0; i < count; i++) {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const method = dv.getUint16(p + 10, true), crc = dv.getUint32(p + 16, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), attr = dv.getUint32(p + 38, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(z.subarray(p + 46, p + 46 + nlen));
    const lnlen = dv.getUint16(off + 26, true), data = z.subarray(off + 30 + lnlen, off + 30 + lnlen + csize);
    const raw = method === 8 ? new Uint8Array(inflateRawSync(data)) : data;
    assert.equal(Z.crc32(raw), crc, name);
    const want = files[name.replace(/^fall\//, '')];
    assert.deepEqual([...raw], [...(typeof want === 'string' ? new TextEncoder().encode(want) : want)], name);
    if (name === 'fall/Allrun') assert.equal((attr >>> 16) & 0o777, 0o755);
    p += 46 + nlen;
  }
});

test('Fall mit Kammer: Hub als extrudeMesh, Kolben als libshotSleeve, Schmelze in Ruhe', () => {
  const part = box(-50, -20, -10, 50, 40, 0);
  const bis = box(-15, -45, -12, 15, -15, 0);
  const bodies = [{ name: 'Bauteil', tris: part, labels: new Int32Array(part.length / 9) }, { name: 'Pressrest', tris: bis, labels: new Int32Array(bis.length / 9) }];
  for (let i = 0; i < bis.length / 9; i++) if (bis[i * 9 + 2] === -12 && bis[i * 9 + 5] === -12 && bis[i * 9 + 8] === -12) bodies[1].labels[i] = 1;
  for (let i = 0; i < part.length / 9; i++) if (part[i * 9] === 50 && part[i * 9 + 3] === 50 && part[i * 9 + 6] === 50) bodies[0].labels[i] = 2;
  const union = G.unionSurfaces(bodies, { maxEdge: 1 });
  const shot = { chamber: true, mode: 'focus', points: [[2, 0.05], [100, 0.5], [150, 0.5], [190, 3]], inletTable: [[0, 0.5]], piston: [[0, 0], [1, 190]],
    tFull: 0.3, tEnd: 0.35, sFull: 150, sEnd: 185, phi: 0.5, diam: 33.85, length: 212, depth: 12, stroke: 200, Vdose: 1e5 };
  const plan = {
    title: 'Kammer', union, bodies,
    inlet: { centroid: [0, -30, -12], normal: [0, 0, -1], area: 900, radius: Math.sqrt(900 / Math.PI), depth: 12 },
    outlets: [{ centroid: [50, 10, -5], area: 600, mode: 'orifice', Cd: 0.8 }],
    mesh: { cell: 2, level: 1, nProc: 2, sleeveCell: 4 }, process: { gravity: '-y' }, shot
  };
  const { files, info } = C.buildCase(plan);
  for (const f of ['system/extrudeMeshDict', 'constant/dynamicMeshDict', 'system/shotSleeveDict', 'system/setAlphaFieldDict', 'system/topoSetDict', 'system/controlDict.slow', 'system/controlDict.shot'])
    assert.ok(f in files, f + ' fehlt');
  assert.ok(!('constant/plungerTable' in files), 'mit Kammer fährt der Kolben, keine Einlassgeschwindigkeit');
  const ex = files['system/extrudeMeshDict'];
  assert.match(ex, /direction +\(0 0 -1\);/);                       // nach außen, zum Kolbenstart
  assert.match(ex, /thickness +0\.2;/);
  assert.match(ex, /nLayers +50;/);                             // 200 mm / 4 mm
  assert.match(files['constant/dynamicMeshDict'], /axis +\(0 0 1\);/);
  const ssd = files['system/shotSleeveDict'];
  assert.match(ssd, /length +200;/);
  assert.match(ssd, /\(190 3\)/);
  assert.match(files['0.orig/U'], /inlet +\{ type movingWallVelocity;/);
  /* Füllgrad 0,5 in der liegenden Kammer: der Spiegel auf der Achse, unterhalb gefüllt */
  const al = files['system/setAlphaFieldDict'];
  assert.match(al, /normal +\(0 -1 0\);/);
  const y = Number(/origin +\(([-\d.e]+) ([-\d.e]+) /.exec(al)[2]);
  assert.ok(Math.abs(y * 1000 + 30) < 1e-6, 'Spiegel bei y = ' + y * 1000);
  assert.match(files['system/topoSetDict'], /action invert/);
  assert.match(files['system/setFieldsDict'], /cellToCell \{ set notChamber;/);
  assert.match(files.Allrun, /runApplication extrudeMesh/);
  assert.match(files.Allrun, /runApplication setAlphaField[\s\S]*runApplication topoSet[\s\S]*runApplication setFields/);
  assert.match(files['system/controlDict.slow'], /timeActivatedFileUpdate[\s\S]*\(0\.\d+ "<system>\/controlDict\.shot"\)/);
  assert.ok(info.sleeveCells > 0 && info.chamber);
  /* Kolbenachse parallel zur Schwerkraft: abgewiesen */
  assert.throws(() => C.buildCase(Object.assign({}, plan, { process: { gravity: '-z' } })), /waagerecht/);
});

test('Bilder: Zeitpunkte nach Füllgrad, Zeit oder Kolbenweg; Format aus Seitenverhältnis und Breite', async () => {
  const R = await imp('js/core/render.js');
  const p = R.defaultPost();
  assert.deepEqual(R.targets(p), [25, 50, 75, 100]);
  assert.deepEqual(R.targets({ ...p, when: { by: 'fill', count: 3 } }), [33.3, 66.7, 100]);
  assert.deepEqual(R.targets({ ...p, when: { by: 'time', count: 2 } }), [0.5, 1]);
  assert.deepEqual(R.imageSize(p), [1600, 900]);
  assert.deepEqual(R.imageSize({ ...p, aspect: '1:1', width: 1280 }), [1280, 1280]);
  assert.deepEqual(R.imageSize({ ...p, aspect: '4:3', width: 1920 }), [1920, 1440]);
  /* 6 Kennwerte × 4 + Füllzeit einmal */
  assert.equal(R.imageCount(p), 6 * 4 + 1);
  /* alte Pläne mit fills/size */
  const old = R.normalizePost({ criteria: ['velocity'], fills: [10, 20, 30], size: [1280, 720], views: p.views });
  assert.deepEqual([old.when.by, old.when.count, old.width], ['fill', 3, 1280]);
  const py = R.renderScript({ ...p, title: 'T', chamber: { c: [0, 0, 0], a: [0, 0, 1], r: 0.05, top: 0.02 }, piston: [[0, 0], [1, 500]], views: [{ id: 'cam1', label: 'A', pos: [0, -500, 300], target: [0, 0, 0], up: [0, 0, 1], fov: 30 }] });
  assert.match(py, /"pos": \[\n?\s*0,\n?\s*-0\.5/);
  assert.match(py, /view\.CameraViewAngle = v\['fov'\]/);
});

test('Seite: Beispiel laden, Schritte der Reihe nach, Fall als ZIP', async () => {
  const { doc } = buildDocument(readFileSync(resolve(SIM, 'index.html'), 'utf8'));
  installGlobals(doc);
  /* /examples/ liegt neben dem Studio, nicht darin */
  const inner = globalThis.fetch;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.startsWith('/examples/')) { const buf = readFileSync(resolve(WEB, u.slice(1))); return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; }
    return inner(url);
  };
  globalThis.location = { search: '', href: 'http://test/tools/simulation/', pathname: '/tools/simulation/' };
  loadDesignScripts();
  const mod = await import(pathToFileURL(resolve(SIM, 'js/app.js')).href);
  const v = mod.__viewer;
  await wait(() => v.state.ready && v.plan.bodies.length === 4, 1600);
  assert.deepEqual(v.plan.bodies.map(b => b.role).sort(), ['biscuit', 'overflow', 'part', 'runner']);
  /* Rollen aus dem Namen: „Überlauf" enthält „lauf" und ist doch kein Anguss */
  const { guessRole } = await import(pathToFileURL(resolve(SIM, 'js/plan.js')).href);
  assert.deepEqual(['Überlauf', 'Überläufe', 'Anguss Steg', 'Laufkanal', 'Pressrest', 'castPart'].map(guessRole), ['overflow', 'overflow', 'runner', 'runner', 'biscuit', 'part']);
  /* Ablaufplan: offen ist der Einlass; „Fall" ist gesperrt */
  assert.equal(v.state.open, 'einlass');
  assert.equal(v.activate('fall'), false);
  const rail = doc.querySelector('[data-ui="rail"]');
  assert.ok(rail.querySelector('[data-stage="fall"]').classList.contains('locked'));
  /* Anguss, Pressrest und Überläufe kommen als Dateien: die Designer-Schritte
     entfallen, die Leiste zählt nur, was dasteht. */
  const step = id => rail.querySelector('[data-stage="' + id + '"]');
  assert.deepEqual(v.state.shown, ['koerper', 'einlass', 'auslass', 'netz', 'prozess', 'auswertung', 'fall']);
  assert.ok(step('anguss').hidden && step('ueberlauf').hidden);
  assert.equal(step('einlass').querySelector('.st-step-num').textContent, '2');
  assert.equal(v.activate('anguss'), false, 'ein entfallener Schritt lässt sich nicht öffnen');
  const toggle = (role, on) => { const b = v.plan.bodies.find(x => x.role === role && x.src === 'file'); b.include = on; v.plan.dropStale(); v.plan.changed('include'); };
  /* ohne Anguss-Datei: der Schritt erscheint — erledigt durch den Pressrest,
     sein „Weiter" unter dem Knopf des Designers führt am Überlauf vorbei */
  toggle('runner', false);
  assert.ok(!step('anguss').hidden);
  assert.equal(step('einlass').querySelector('.st-step-num').textContent, '3');
  v.activate('anguss');
  const next = () => doc.querySelector('[data-ui="sim-next"]');
  assert.equal(next().textContent, 'Weiter: Einlass');
  assert.equal(next().disabled, false);
  /* auch ohne Pressrest: der Anguss-Schritt ist offen, weiter geht es nicht */
  toggle('biscuit', false);
  assert.equal(v.state.open, 'anguss');
  assert.equal(next().disabled, true);
  assert.ok(step('einlass').classList.contains('locked'));
  toggle('runner', true); toggle('biscuit', true);
  assert.equal(v.state.stage, 'einlass', 'der Schritt entfällt wieder — weiter zum ersten offenen');
  assert.ok(step('anguss').hidden);
  /* ohne Überlauf-Datei: der Überlauf-Schritt ist wahlweise */
  toggle('overflow', false);
  assert.ok(!step('ueberlauf').hidden);
  assert.equal(v.state.open, 'einlass');
  v.activate('ueberlauf');
  assert.equal(next().textContent, 'Ohne Überläufe weiter: Einlass');
  next().dispatch('click');
  assert.equal(v.state.stage, 'einlass');
  toggle('overflow', true);
  assert.equal(doc.querySelector('[data-ui="sim-next"]'), null, 'der Zusatzstreifen gehört nur den Designer-Schritten');
  /* Einlass vorschlagen: die Kreisfläche des Pressrests */
  v.activate('einlass');
  v.tools.einlass.suggest();
  assert.ok(Math.abs(v.plan.inlet.radius - 65) < 0.2 && Math.abs(v.plan.inlet.depth - 20) < 0.1);
  /* Auslass: die Ventilfläche des Überlaufs */
  const ov = v.plan.bodies.find(b => b.role === 'overflow');
  let face = -1;
  for (let f = 0; f < ov.tris.length / 9 && face < 0; f++) { const o = f * 9; if ((ov.tris[o + 1] + ov.tris[o + 4] + ov.tris[o + 7]) / 3 > 330 && Math.abs((ov.tris[o + 2] + ov.tris[o + 5] + ov.tris[o + 8]) / 3 + 3) < 0.01) face = f; }
  v.activate('auslass');
  assert.ok(v.tools.auslass.pickFace(ov.id, face));
  assert.equal(v.plan.outlets.length, 1);
  assert.ok(Math.abs(v.plan.outlets[0].area - 2819.4) < 1);
  /* jetzt ist alles bis „Fall" offen */
  assert.equal(v.state.open, 'fall');
  v.activate('netz');
  v.tools.netz.measure();
  assert.equal(ov.extra, 2, 'Überläufe 1,5 mm dick: zwei Stufen feiner');
  /* Fall bauen (ohne Worker direkt) */
  v.plan.mesh.cell = 3;
  const payload = (await import(pathToFileURL(resolve(SIM, 'js/payload.js')).href)).payloadOf(v.plan);
  /* die DieLogic-Kurve auf das Modell: Kolben-Ø = Pressrest, Füllgrad aus Massen und Kammer */
  assert.equal(payload.shot.mode, 'focus');
  assert.ok(Math.abs(payload.shot.diam - 129.9) < 0.2, 'Kolben-Ø ' + payload.shot.diam);
  assert.ok(payload.shot.phi > 0.1 && payload.shot.phi < 0.9);
  assert.equal(payload.shot.inletTable[0][0], 0);
  const r = await v.app.build(payload, () => {});
  assert.ok(r.zip.length > 1e5);
  assert.equal(r.root, 'Gusstraube_openfoam');
  assert.ok(r.files.includes('constant/triSurface/vent1.stl'));
  /* Überläufe 1,5 mm: zwei Stufen; der Anguss nach seinem Anschnitt (dünnste 2 %, 2,5 mm): eine */
  assert.deepEqual(r.info.extra, [0, 2, 1, 0], 'Stufen je Körper (Reihenfolge: ' + v.plan.included().map(b => b.name) + ')');
});
