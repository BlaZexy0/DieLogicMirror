/* Abstand zwischen zwei Netzen und das Verfeinern davor.

   Geprüft wird gegen Anordnungen, deren Abstand man im Kopf ausrechnet:
   Punkt vor einer Quaderfläche, vor einer Kante, vor einer Ecke, im
   Inneren — und zwei konzentrische Kugeln, bei denen jeder Punkt der
   äußeren denselben Abstand zur inneren hat. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { bounds, refine, volume, surface } from '../../../web/tools/3d-studio/js/mesh.js';
import { buildModel } from '../../../web/tools/3d-studio/js/part/model.js';
import { buildLocator, closestDistance, distanceToMesh, distanceStats } from '../../../web/tools/3d-studio/js/part/distance.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol,
  (msg || '') + ': ' + a + ' ≠ ' + b + ' (±' + tol + ')');

test('Punkt-Netz-Abstand: Fläche, Kante, Ecke, innen', () => {
  const loc = buildLocator(S.box(100, 60, 40));       // x ±50, y ±30, z ±20
  near(closestDistance(loc, 80, 0, 0), 30, 1e-9, 'vor der Fläche x = 50');
  near(closestDistance(loc, 0, 0, 60), 40, 1e-9, 'über der Deckfläche');
  near(closestDistance(loc, 55, 35, 0), Math.hypot(5, 5), 1e-9, 'vor einer Kante');
  near(closestDistance(loc, 60, 40, 30), Math.hypot(10, 10, 10), 1e-9, 'vor einer Ecke');
  near(closestDistance(loc, 50, 30, 20), 0, 1e-9, 'genau auf der Ecke');
  near(closestDistance(loc, 0, 0, 0), 20, 1e-9, 'innen: Abstand zur nächsten Wand');
});

test('Die Suchgrenze deckelt, statt weiterzusuchen', () => {
  const loc = buildLocator(S.box(100, 60, 40));
  near(closestDistance(loc, 80, 0, 0, 5), 5, 1e-9, 'echter Abstand 30, Grenze 5');
  near(closestDistance(loc, 80, 0, 0, 100), 30, 1e-9, 'Grenze über dem echten Abstand');
});

test('Die Rasterweite ändert das Ergebnis nicht, nur das Tempo', () => {
  const box = S.box(100, 60, 40);
  const grob = buildLocator(box, { cells: 2 });
  const fein = buildLocator(box, { cells: 60 });
  for (const p of [[80, 0, 0], [0, 0, 60], [60, 40, 30], [0, 0, 0], [-90, -70, -55]]) {
    near(closestDistance(grob, ...p), closestDistance(fein, ...p), 1e-9, 'Punkt ' + p.join(','));
  }
});

test('Zwei Kugeln: jeder Punkt der äußeren hat denselben Abstand', async () => {
  const inner = S.sphere(30, 48, 30);
  const outer = buildModel(S.sphere(45, 48, 30));
  const loc = buildLocator(inner, { maxDist: 30 });
  const d = await distanceToMesh(outer, loc, { maxDist: 30 });
  const st = distanceStats(outer, d);
  /* Beide Kugeln sind Vielecke — der Abstand schwankt um die Sehnenhöhe. */
  near(st.min, 15, 0.4, 'kleinster Abstand');
  near(st.max, 15, 0.9, 'größter Abstand');
  near(st.mean, 15, 0.4, 'Mittel');
});

test('Der Abstand ist symmetrisch', async () => {
  /* Zwei Platten, 15 mm Luft dazwischen. Verfeinert, weil die kürzeste
     Verbindung mitten auf den Flächen liegt — ein Quader hat dort keinen
     Punkt, und ohne Verfeinerung fände die Messung nur die Ecken. */
  const a = buildModel(refine(S.box(60, 60, 10), 5));
  const b = buildModel(refine(S.place(S.box(40, 40, 10), 'z', 0, 0, 25), 5));
  const dA = await distanceToMesh(a, buildLocator(b.tris), {});
  const dB = await distanceToMesh(b, buildLocator(a.tris), {});
  near(distanceStats(a, dA).min, 15, 1e-6, 'A → B');
  near(distanceStats(b, dB).min, 15, 1e-6, 'B → A');
});

test('Verfeinern behält die Fläche und teilt zu große Dreiecke', () => {
  const plate = S.box(200, 200, 5);
  assert.equal(plate.length / 9, 12, 'ein Quader hat zwölf Dreiecke');
  const fine = refine(plate, 10);
  assert.ok(fine.length / 9 > 1000, 'geteilt: ' + fine.length / 9 + ' Dreiecke');
  near(volume(fine), volume(plate), 1e-6, 'Volumen unverändert');
  near(surface(fine), surface(plate), 1e-6, 'Oberfläche unverändert');
  const b0 = bounds(plate), b1 = bounds(fine);
  for (let k = 0; k < 3; k++) near(b1.size[k], b0.size[k], 1e-9, 'Ausdehnung');
  /* Keine Kante bleibt zu lang. */
  let worst = 0;
  for (let i = 0; i < fine.length; i += 9) {
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, c = i + ((e + 1) % 3) * 3;
      worst = Math.max(worst, Math.hypot(fine[c] - fine[a], fine[c + 1] - fine[a + 1], fine[c + 2] - fine[a + 2]));
    }
  }
  assert.ok(worst <= 10 + 1e-9, 'längste Kante: ' + worst.toFixed(3));
  assert.equal(refine(fine, 10).length, fine.length, 'ein zweiter Lauf ändert nichts mehr');
});

test('Verfeinern hört an der Obergrenze auf', () => {
  const fine = refine(S.box(200, 200, 5), 0.5, 5000);
  assert.ok(fine.length / 9 <= 20000, 'gedeckelt statt ins Unendliche: ' + fine.length / 9);
});

test('Grobes Netz verfälscht die Karte, verfeinertes nicht', async () => {
  /* Eine 200er-Platte 10 mm über einem kleinen Quader: an den Ecken ist
     sie weit weg, in der Mitte genau 10 mm. Ohne Verfeinerung gibt es
     nur die vier Eckpunkte — und der kleinste gemessene Abstand wäre
     völlig falsch. */
  const target = buildLocator(S.box(100, 60, 40));
  const platte = S.place(S.box(200, 200, 5), 'z', 0, 0, 32.5);
  const grob = buildModel(platte);
  const stG = distanceStats(grob, await distanceToMesh(grob, target, {}));
  assert.ok(stG.min > 50, 'grob: kleinster Abstand grotesk zu groß (' + stG.min.toFixed(1) + ' mm)');

  const fein = buildModel(refine(platte, 4));
  const stF = distanceStats(fein, await distanceToMesh(fein, target, {}));
  near(stF.min, 10, 0.01, 'verfeinert: der echte Abstand');
});
