/* Rasterfeld und die daraus gezogene Offsetfläche.

   Geprüft wird gegen Körper, deren Offsetvolumen sich in geschlossener
   Form angeben lässt. Für einen Quader a×b×c mit Aufmaß r ist das der
   Quader plus sechs Platten, zwölf Viertelzylinder und acht Achtelkugeln:

       V = abc + 2r(ab+bc+ca) + πr²(a+b+c) + 4/3 πr³
       A = 2(ab+bc+ca) + 2πr(a+b+c) + 4πr²

   Genau diese Verrundung ist der Unterschied zum Verschieben von
   Dreiecken: dort würde die Ecke spitz bleiben (oder umklappen). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { subtract, union } from '../../../web/tools/3d-studio/js/csg.js';
import { volume, surface, weld, adjacency } from '../../../web/tools/3d-studio/js/mesh.js';
import { buildModel } from '../../../web/tools/3d-studio/js/part/model.js';
import { buildField, fieldSize, sampleField, fieldVolume, fieldExtrema, thickMaxima } from '../../../web/tools/3d-studio/js/part/field.js';
import { surfaceNets } from '../../../web/tools/3d-studio/js/part/surfacenets.js';

const rel = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol * Math.abs(b),
  (msg || '') + ': ' + a.toFixed(2) + ' ≠ ' + b.toFixed(2) + ' (rel. ' + tol + ')');

const boxOffsetVolume = (a, b, c, r) =>
  a * b * c + 2 * r * (a * b + b * c + c * a) + Math.PI * r * r * (a + b + c) + 4 / 3 * Math.PI * r ** 3;
const boxOffsetArea = (a, b, c, r) =>
  2 * (a * b + b * c + c * a) + 2 * Math.PI * r * (a + b + c) + 4 * Math.PI * r * r;

test('Rastermaße wachsen mit Auflösung und Band', async () => {
  const m = buildModel(S.box(100, 60, 40));
  const a = fieldSize(m, 50, 5), b = fieldSize(m, 100, 5);
  rel(a.h, 2, 1e-9, 'Zellgröße = längste Kante / Auflösung');
  rel(b.h, 1, 1e-9);
  assert.ok(b.samples > 6 * a.samples, 'doppelte Auflösung ≈ achtfacher Speicher');
  const wide = fieldSize(m, 50, 20);
  assert.ok(wide.samples > a.samples, 'breiteres Band braucht mehr Punkte');
});

test('Das Feld trifft den Abstand exakt', async () => {
  const m = buildModel(S.box(100, 60, 40));
  const f = await buildField(m, { res: 80, band: 12 });
  rel(sampleField(f, 55, 0, 0), 5, 0.01, '5 mm vor der Seitenfläche');
  rel(sampleField(f, 0, 0, 26), 6, 0.01, '6 mm über der Deckfläche');
  assert.ok(Math.abs(sampleField(f, 50, 0, 0)) < 0.05, 'auf der Fläche ist der Abstand null');
  assert.ok(sampleField(f, 0, 0, 0) < 0, 'innen ist das Vorzeichen negativ');
  assert.ok(sampleField(f, 200, 0, 0) > 0, 'außen positiv');
  /* Ecke: der Abstand ist der Abstand zum Eckpunkt, nicht zur Ebene. */
  const d = 3 / Math.sqrt(3);
  rel(sampleField(f, 50 + d, 30 + d, 20 + d), 3, 0.02, 'diagonal vor der Ecke');
});

test('Offsetfläche: Volumen und Fläche wie in der geschlossenen Formel', async () => {
  const [a, b, c] = [100, 60, 40];
  const m = buildModel(S.box(a, b, c));
  const f = await buildField(m, { res: 110, band: 14 });
  for (const r of [0, 3, 6, 10]) {
    const tris = surfaceNets(f, r);
    assert.ok(tris.length > 0, 'Fläche bei r = ' + r);
    rel(volume(tris), boxOffsetVolume(a, b, c, r), 0.02, 'Volumen bei r = ' + r);
    rel(surface(tris), boxOffsetArea(a, b, c, r), 0.05, 'Fläche bei r = ' + r);
  }
});

test('Untermaß schrumpft den Körper', async () => {
  const [a, b, c] = [100, 60, 40];
  const m = buildModel(S.box(a, b, c));
  const f = await buildField(m, { res: 110, band: 12 });
  const tris = surfaceNets(f, -6);
  /* Nach innen bleibt es ein scharfkantiger Quader — nur kleiner. */
  rel(volume(tris), (a - 12) * (b - 12) * (c - 12), 0.03, 'Volumen bei −6 mm');
});

test('Die Offsetfläche ist geschlossen und nach außen orientiert', async () => {
  const m = buildModel(S.box(80, 50, 30));
  const f = await buildField(m, { res: 70, band: 8 });
  const tris = surfaceNets(f, 4);
  assert.ok(volume(tris) > 0, 'positives Volumen = Normalen nach außen');
  const w = weld(tris);
  const nbr = adjacency(w.index, tris.length / 9);
  let open = 0;
  for (let i = 0; i < nbr.length; i++) if (nbr[i] < 0) open++;
  assert.ok(open / nbr.length < 0.001,
    'offene Kanten: ' + (100 * open / nbr.length).toFixed(3) + ' %');
});

test('Kugel: der Offset vergrößert den Radius', async () => {
  const r0 = 25;
  const m = buildModel(S.sphere(r0, 44, 28));
  const f = await buildField(m, { res: 70, band: 8 });
  for (const d of [0, 5, -5]) {
    const tris = surfaceNets(f, d);
    rel(volume(tris), 4 / 3 * Math.PI * (r0 + d) ** 3, 0.03, 'Kugel r = ' + (r0 + d));
  }
});

test('Selbstdurchdringung: enge Innenecken laufen zusammen statt sich zu kreuzen', async () => {
  /* Zwei dicht benachbarte Klötze: mit 6 mm Aufmaß wächst der Spalt von
     8 mm zu — ein verschobenes Netz würde sich hier selbst durchdringen,
     das Feld verschmilzt die beiden Körper korrekt zu einem. */
  const gap = 8, r = 6;
  const part = union(S.place(S.box(40, 40, 40), 'z', -(20 + gap / 2), 0, 0),
    S.place(S.box(40, 40, 40), 'z', 20 + gap / 2, 0, 0));
  const m = buildModel(part);
  const f = await buildField(m, { res: 100, band: 9 });
  const tris = surfaceNets(f, r);
  assert.ok(volume(tris) > 0);
  const w = weld(tris);
  const nbr = adjacency(w.index, tris.length / 9);
  let open = 0;
  for (let i = 0; i < nbr.length; i++) if (nbr[i] < 0) open++;
  assert.ok(open / nbr.length < 0.001, 'auch verschmolzen bleibt die Fläche geschlossen');
  /* Der Spalt ist zu: das Volumen liegt über der Summe zweier Einzeloffsets
     minus dem, was sich überlappt — jedenfalls deutlich über null und
     unter dem Volumen der umschließenden Box. */
  const both = 2 * boxOffsetVolume(40, 40, 40, r);
  assert.ok(volume(tris) < both, 'die Überlappung wird nicht doppelt gezählt');
  assert.ok(volume(tris) > 0.8 * both, 'aber es bleibt ein zusammenhängender Körper');
});

test('fieldVolume schätzt das Volumen aus den Rasterpunkten', async () => {
  const m = buildModel(S.box(100, 60, 40));
  const f = await buildField(m, { res: 120, band: 8 });
  rel(fieldVolume(f, 0), 100 * 60 * 40, 0.02, 'Volumen aus dem Feld');
  rel(fieldVolume(f, 4), boxOffsetVolume(100, 60, 40, 4), 0.03, 'mit Aufmaß');
});

test('Wärmezentren: die dicksten Stellen eines Quaders liegen auf seiner Mittellinie', async () => {
  /* 100 × 60 × 40: die größte Kugel hat den Radius 20 (halbe kleinste
     Kante) und passt überall auf der Strecke x ∈ [−30, 30] der Mittellinie. */
  const m = buildModel(S.box(100, 60, 40));
  const f = await buildField(m, { res: 80, band: 24 });
  const st = fieldExtrema(f);
  rel(st.maxIn, 20, 0.05, 'größter Betrag innen = halbe kleinste Kante');
  assert.equal(st.clipped, 0, 'nichts abgeschnitten — das Band ist größer als die halbe Dicke');
  assert.ok(st.maxOut > 20, 'außen reicht das Feld bis ans Band');
  const hot = thickMaxima(f, { minFrac: 0.6 });
  assert.ok(hot.length >= 1 && hot.length <= 6, 'wenige Marken auf dem Grat: ' + hot.length);
  /* Die Kugel mit Radius 20 berührt immer beide z-Flächen und passt
     überall auf der Mittelfläche |x| ≤ 30, |y| ≤ 10 — dort ist der Quader
     gleich dick, und genau dort dürfen die Marken liegen. */
  for (const h of hot) {
    rel(h.r, 20, 0.06, 'Radius der Kugelprobe');
    assert.ok(Math.abs(h.z) < f.h + 1e-9, 'in der Mittelebene: ' + [h.x, h.y, h.z]);
    assert.ok(Math.abs(h.y) <= 10 + f.h && Math.abs(h.x) <= 30 + f.h, 'auf der Mittelfläche des Quaders: ' + [h.x, h.y, h.z]);
  }
  assert.ok(hot.every((h, i) => i === 0 || h.r <= hot[i - 1].r), 'nach Radius fallend');
  for (let i = 0; i < hot.length; i++) {
    for (let j = i + 1; j < hot.length; j++) {
      const d = Math.hypot(hot[i].x - hot[j].x, hot[i].y - hot[j].y, hot[i].z - hot[j].z);
      assert.ok(d >= hot[i].r * 1.6 + f.h - 1e-9, 'keine Marke dicht bei einer stärkeren');
    }
  }

  /* Ein zu kleines Band schneidet den Kern ab: dann weiß das Feld nichts
     über die Dicke, und es gibt keine Marken — aber die Auskunft, warum. */
  const f10 = await buildField(m, { res: 80, band: 10 });
  const st10 = fieldExtrema(f10);
  assert.ok(st10.clipped > 0, 'Kern auf −band');
  rel(st10.maxIn, 10, 0.01, 'maxIn ist dann nur das Band');
  assert.equal(thickMaxima(f10, { minFrac: 0.6 }).length, 0, 'keine Marke auf einem abgeschnittenen Kern');
});
