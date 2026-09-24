/* Geometrie-Kern: Primitive, boolesche Operationen, Netz-Werkzeuge.
   Alles ohne Three.js — genau deshalb sind diese Module getrennt. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { subtract, union, intersect } from './csg.mjs';
import { volume, surface, bounds, weld, adjacency, cleanMesh, smoothNormals } from '../../../web/tools/3d-studio/js/mesh.js';

/* Vergleich mit RELATIVER Toleranz — Volumen liegen hier im
   Millionenbereich, absolute Schranken wären dort sinnlos. */
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.max(Math.abs(b), 1),
  (msg || '') + ': ' + a + ' ≠ ' + b + ' (rel. ' + rel + ')');
/* Fläche eines regelmäßigen n-Ecks mit Umkreisradius r. */
const polyArea = (n, r) => n * 0.5 * r * r * Math.sin(2 * Math.PI / n);

test('Primitive: Volumen, Ausdehnung, Orientierung', () => {
  near(volume(S.box(10, 20, 30)), 6000, 1e-9, 'Quader');
  near(volume(S.box(10, 20, 30, 1)), 12 * 22 * 32, 1e-9, 'aufgedickter Quader');
  const seg = 40;
  near(volume(S.cyl(5, -5, 5, seg)), polyArea(seg, 5) * 10, 1e-9, 'Zylinder');
  near(volume(S.sphere(20, 48, 32)), 4 / 3 * Math.PI * 8000, 200, 'Kugel');
  /* Positives Volumen heißt: Normalen zeigen nach außen. */
  for (const t of [S.box(3, 4, 5), S.cyl(2, 0, 7, 24), S.sphere(3, 16, 10),
                   S.rectLoft([{ z: 0, w: 4, h: 4 }, { z: 5, w: 2, h: 2 }])]) {
    assert.ok(volume(t) > 0, 'Normalen nach außen');
  }
});

test('place() dreht ohne die Orientierung zu kippen', () => {
  for (const ax of ['x', 'y', 'z', '-x', '-y', '-z']) {
    const t = S.place(S.cyl(5, 0, 10, 24), ax, 0, 0, 0);
    assert.ok(volume(t) > 0, 'Achse ' + ax + ' behält die Orientierung');
    const b = bounds(t);
    near(Math.max(...b.size), 10, 1e-9, 'Länge nach ' + ax);
  }
  near(bounds(S.place(S.cyl(5, 0, 10, 24), '-x')).min[0], -10, 1e-9, '−x zeigt nach −x');
});

test('Aufdicken zieht den Endquerschnitt mit (kein Span bleibt stehen)', () => {
  /* Ein Kegelstumpf und sein aufgedickter Zwilling: der Zwilling muss den
     Kegel VOLLSTÄNDIG enthalten, sonst bliebe beim Ausschneiden ein
     hauchdünner Rest im Stahl stehen. */
  const cone = S.rectLoft([{ z: 0, w: 60, h: 20 }, { z: 30, w: 170, h: 5 }]);
  const tool = S.rectLoft([{ z: 0, w: 60, h: 20 }, { z: 30, w: 170, h: 5 }], 0.15);
  near(volume(subtract(cone, tool)), 0, 1e-6, 'Kegel liegt ganz im Werkzeug');
});

test('CSG: Vereinigung, Differenz, Durchschnitt', () => {
  const a = S.box(100, 100, 100);
  const b = S.place(S.box(100, 100, 100), 'z', 50, 0, 0);
  near(volume(union(a, b)), 1.5e6, 1e-6);
  near(volume(intersect(a, b)), 5e5, 1e-6);
  near(volume(subtract(a, b)), 5e5, 1e-6);

  const seg = 32;
  const hole = subtract(a, S.cyl(20, -60, 60, seg));
  near(volume(hole), 1e6 - polyArea(seg, 20) * 100, 1e-6, 'durchgehende Bohrung');

  /* Deckungsgleiche Fläche: Werkzeug bündig auf der Oberseite. */
  near(volume(subtract(a, S.place(S.box(40, 40, 40), 'z', 0, 0, 50))), 1e6 - 40 * 40 * 20, 1e-6);
});

test('Netz: verschweißen, Nachbarschaft, T-Stöße', () => {
  const box = S.box(10, 20, 30);
  const w = weld(box);
  assert.equal(w.vertexCount, 8, 'Quader hat 8 Punkte');
  assert.ok(adjacency(w.index, 12).every(v => v >= 0), 'Quader ist geschlossen');

  const raw = subtract(S.box(100, 60, 40), S.cyl(15, -30, 30, 32));
  const before = adjacency(weld(raw).index, raw.length / 9);
  assert.ok([...before].some(v => v < 0), 'CSG hinterlässt T-Stöße');

  const clean = cleanMesh(raw).tris;
  const w2 = weld(clean);
  const after = adjacency(w2.index, clean.length / 9);
  assert.ok([...after].every(v => v >= 0), 'nach der Reparatur hat jede Kante einen Nachbarn');
  near(volume(clean), volume(raw), 1e-6, 'Reparatur ändert das Volumen nicht');
});

test('weiche Normalen: rund bleibt rund, Kanten bleiben Kanten', () => {
  const cyl = S.cyl(20, 0, 40, 48);
  const n = smoothNormals(cyl, 32);
  /* Auf dem Mantel steht die Normale waagerecht (nz ≈ 0), auf den
     Deckeln senkrecht (|nz| = 1) — der Knick dazwischen bleibt hart. */
  let flat = 0, round = 0;
  for (let i = 0; i < n.length; i += 3) {
    if (Math.abs(n[i + 2]) > 0.99) flat++;
    else if (Math.abs(n[i + 2]) < 0.01) round++;
  }
  assert.ok(flat > 0 && round > 0, 'Deckel flach, Mantel rund');
  assert.equal(n.length, cyl.length, 'eine Normale je Punkt');
});

test('Rohrzug ist geschlossen und hat positives Volumen', () => {
  const p = S.pipe([[0, 0, 0], [100, 0, 0], [100, 100, 0]], 10, 20);
  assert.ok(volume(p) > 0);
  near(surface(S.box(10, 10, 10)), 600, 1e-9, 'Oberfläche des Würfels');
});
