/* Der Temperierkanal-Designer ohne Browser: Plan, Körper, Datei.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/cooling.test.mjs                   */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = '../../../web/tools/3d-studio/';
const M = await import(R + 'js/cooling/model.js');
const GEO = await import(R + 'js/cooling/geom.js');
const { volume, weld, adjacency } = await import(R + 'js/mesh.js');

const openEdges = tris => {
  const w = weld(tris);
  const nbr = adjacency(w.index, tris.length / 9);
  let open = 0;
  for (let i = 0; i < nbr.length; i++) if (nbr[i] < 0) open++;
  return open;
};
const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b), (msg || '') + ': ' + a + ' ≠ ' + b);

test('Plan: Kühlstich und Kanal mit Vorgaben, Endpunkte, beide Enden bewegen', () => {
  const plan = M.emptyPlan();
  assert.equal(plan.dist, 20);
  const s = M.addStich(plan, [10, 0, 0], [2, 0, 0]);
  assert.deepEqual(s.dir, [1, 0, 0], 'Richtung normiert');
  assert.equal(s.d, 8); assert.equal(s.len, 60);
  assert.deepEqual(M.axisOf(s).b, [70, 0, 0], 'das äußere Ende liegt len weiter');
  const k = M.addKanal(plan, [0, 0, 0], [0, 100, 0], { d: 12 });
  assert.equal(k.d, 12);
  assert.equal(M.lengthOf(k), 100);
  M.setEnd(plan, k.id, 'b', [0, 100, 30]);
  assert.deepEqual(k.a, [0, 0, 0], 'nur das eine Ende');
  M.setEnd(plan, k.id, 'a', [5, 0, 0], true);
  assert.deepEqual(k.a, [5, 0, 0]);
  assert.deepEqual(k.b, [5, 100, 30], 'beide Enden: derselbe Versatz');
  M.setEnd(plan, s.id, 'p', [12, 1, 1]);
  assert.deepEqual(s.p, [12, 1, 1]);
  M.placeStich(plan, s.id, [0, 0, 0], [0, 0, 5]);
  assert.deepEqual(s.dir, [0, 0, 1]);
  M.removeItem(plan, k.id);
  assert.equal(M.allItems(plan).length, 1);
});

test('Richtung eines Kühlstichs: Normale, Blick oder Achse vom Bauteil weg', () => {
  const n = [0.6, 0.8, 0];
  assert.deepEqual(M.directionFor('normal', n, [0, 0, 1]), n);
  assert.deepEqual(M.directionFor('blick', n, [0, 0, 2]), [0, 0, 1], 'zur Kamera, normiert');
  assert.deepEqual(M.directionFor('x', n, null), [1, 0, 0]);
  assert.deepEqual(M.directionFor('x', [-0.6, 0.8, 0], null), [-1, 0, 0], 'das Vorzeichen zeigt vom Bauteil weg');
  assert.deepEqual(M.directionFor('z', [0, 1, 0], null), [0, 0, 1], 'ohne Anteil: positiv');
});

test('Körper: dicht, nach außen gewickelt, Volumen wie gerechnet', () => {
  const plan = M.emptyPlan();
  const s = M.addStich(plan, [3, -2, 5], [0.6, 0, 0.8], { d: 8, len: 60 });
  const ts = GEO.stichBody(s);
  assert.ok(volume(ts) > 0, 'Kühlstich: Wicklung nach außen');
  assert.equal(openEdges(ts), 0, 'Kühlstich geschlossen');
  /* Halbkugel (2/3 π r³) plus Zylinder von r bis len — die Sehnen der
     Halbkugel und des Kreises nehmen ein paar Prozent weg. */
  const r = 4;
  rel(volume(ts), 2 / 3 * Math.PI * r ** 3 + Math.PI * r * r * (60 - r), 0.03, 'Kühlstich-Volumen');
  const k = M.addKanal(plan, [0, 0, 0], [30, 40, 0], { d: 10 });
  const tk = GEO.kanalBody(k);
  assert.ok(volume(tk) > 0);
  assert.equal(openEdges(tk), 0, 'Kanal geschlossen');
  rel(volume(tk), Math.PI * 25 * 50, 0.02, 'Kanal-Volumen');
  assert.ok(GEO.buildAll(plan).length === ts.length + tk.length);
  assert.deepEqual(Object.keys(GEO.buildByType(plan)).sort(), ['kanal', 'stich']);
  assert.equal(GEO.kanalBody(M.addKanal(plan, [1, 1, 1], [1, 1, 1])).length, 0, 'ohne Länge kein Körper');
});

test('Wandabstand: Feldwert entlang der Achse minus Radius', () => {
  const plan = M.emptyPlan();
  const s = M.addStich(plan, [20, 0, 0], [1, 0, 0], { d: 8, len: 50 });
  /* Ein Feld, dessen Wert der Abstand zur Ebene x = 0 ist. */
  const sample = (x) => x;
  assert.ok(Math.abs(GEO.wallClearance(s, sample) - 16) < 1e-9, 'Spitze bei 20, Radius 4 → 16');
  const k = M.addKanal(plan, [30, 0, 0], [10, 0, 0], { d: 10 });
  assert.ok(Math.abs(GEO.wallClearance(k, sample) - 5) < 1e-9, 'das nähere Ende zählt');
});

test('Datei: hin und zurück ergibt denselben Plan', () => {
  const plan = M.emptyPlan();
  plan.dist = 25;
  const s = M.addStich(plan, [1, 2, 3], [0, 0.6, 0.8], { d: 6, len: 45 });
  const k = M.addKanal(plan, [0, 0, 0], [50, 0, 0], { d: 12 });
  const back = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(plan))));
  assert.equal(back.dist, 25);
  assert.equal(M.allItems(back).length, 2);
  assert.equal(back.items[s.id].len, 45);
  assert.ok(Math.abs(back.items[s.id].dir[1] - 0.6) < 1e-6);
  assert.deepEqual(back.items[k.id].b, [50, 0, 0]);
  assert.equal(back.seq, 2);
  assert.throws(() => M.fromJSON({ format: 'x' }), /Temperierdatei/);
});
