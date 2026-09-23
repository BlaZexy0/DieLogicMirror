/* Die Füllabschätzung ohne Browser: Plan, Startzellen, Frontausbreitung,
   Füllgrad, Füllkörper, letzte Stellen.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/fill.test.mjs                      */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../../../web/tools/3d-studio/js/solids.js';
import { volume } from '../../../web/tools/3d-studio/js/mesh.js';
import { buildModel } from '../../../web/tools/3d-studio/js/part/model.js';
import { buildField } from '../../../web/tools/3d-studio/js/part/field.js';
import { surfaceNets } from '../../../web/tools/3d-studio/js/part/surfacenets.js';
import * as M from '../../../web/tools/3d-studio/js/fill/model.js';
import { inletBody } from '../../../web/tools/3d-studio/js/fill/geom.js';
import { solveFill, seedCells, fillBodyField, lastSpots, fracToSurface, sampleFrac, gateGap, GAP_CELLS } from '../../../web/tools/3d-studio/js/fill/solve.js';

const cellAt = (f, idx) => {
  const [nx, ny] = f.dims;
  const k = (idx / (nx * ny)) | 0, j = ((idx - k * nx * ny) / nx) | 0, i = idx - (k * ny + j) * nx;
  return [f.origin[0] + i * f.h, f.origin[1] + j * f.h, f.origin[2] + k * f.h];
};
const idxAt = (f, p) => {
  const [nx, ny] = f.dims;
  const g = a => Math.round((p[a] - f.origin[a]) / f.h);
  return (g(2) * ny + g(1)) * nx + g(0);
};

test('Plan: Anschnitt sitzt auf der Wand, Rechteck liegt in der Wand, Anteile nach Fläche', () => {
  const plan = M.emptyPlan();
  const a = M.addInlet(plan, [50, 0, 0], [2, 0, 0]);
  assert.deepEqual(a.n, [1, 0, 0], 'Normale normiert');
  assert.equal(a.w, 30); assert.equal(a.h, 2);
  const f = M.frameOf(a);
  const d = (x, y) => x[0] * y[0] + x[1] * y[1] + x[2] * y[2];
  assert.ok(Math.abs(d(f.u, f.n)) < 1e-12 && Math.abs(d(f.v, f.n)) < 1e-12, 'Breite und Höhe liegen in der Wand');
  assert.ok(Math.abs(d(f.u, f.v)) < 1e-12, 'und senkrecht zueinander');
  M.setRot(plan, a.id, 90);
  const g = M.frameOf(a);
  assert.ok(Math.abs(Math.abs(d(g.u, f.v)) - 1) < 1e-9, '90° dreht Breite auf Höhe');
  const c = M.corners(a);
  assert.equal(c.length, 4);
  for (const p of c) assert.ok(Math.abs(p[0] - 50) < 1e-9, 'alle Ecken in der Wandebene x = 50');
  const b = M.addInlet(plan, [0, 30, 0], [0, 1, 0], { w: 10, h: 2 });
  const sh = M.shares(plan);
  assert.ok(Math.abs(sh[a.id] - 0.75) < 1e-12 && Math.abs(sh[b.id] - 0.25) < 1e-12, 'Anteile 60:20 mm² → 3:1');
  b.share = 60;
  const sh2 = M.shares(plan);
  assert.ok(Math.abs(sh2[b.id] - 0.6) < 1e-12 && Math.abs(sh2[a.id] - 0.4) < 1e-12, 'fester Anteil, Rest an die anderen');
  const rt = M.fromJSON(JSON.parse(JSON.stringify(M.toJSON(plan))));
  assert.equal(M.allItems(rt).length, 2);
  assert.equal(rt.items[b.id].share, 60);
  assert.equal(rt.items[a.id].share, null);
  assert.equal(rt.items[a.id].rot, 90);
  assert.throws(() => M.fromJSON({ format: 'x' }), /Fülldatei/);
});

test('Startzellen: innen liegende Zellen unter dem Rechteck; ohne Treffer die nächste Innenzelle', async () => {
  const m = buildModel(S.box(100, 40, 20));
  const f = await buildField(m, { res: 50, band: 6 });
  const plan = M.emptyPlan();
  const a = M.addInlet(plan, [50, 0, 0], [1, 0, 0], { w: 20, h: 4 });
  const seeds = seedCells(f, a);
  assert.ok(seeds.length >= 8, 'ein 20×4-Rechteck bei 2-mm-Zellen deckt Zellen: ' + seeds.length);
  for (const idx of seeds) {
    const p = cellAt(f, idx);
    assert.ok(f.data[idx] < 0, 'innen');
    assert.ok(p[0] > 45 && Math.abs(p[1]) <= 11 && Math.abs(p[2]) <= 3, 'dicht unter der +X-Wand im Rechteck: ' + p);
  }
  const far = M.addInlet(plan, [50, 0, 0], [0, 0, 1], { w: 2, h: 2 });  // Rechteck steht quer, trifft nichts
  far.pos = [50, 0, 40];                                                  // in der Luft
  const fb = seedCells(f, far);
  assert.equal(fb.length, 1, 'Rückfall: genau eine Zelle');
  assert.ok(f.data[fb[0]] < 0);
});

test('Frontausbreitung: Ankunft wächst mit dem Weg, das Ende füllt zuletzt, der Füllgrad ist ein Rang', async () => {
  const m = buildModel(S.box(120, 30, 10));
  const f = await buildField(m, { res: 60, band: 5 });
  const plan = M.emptyPlan();
  M.addInlet(plan, [-60, 0, 0], [-1, 0, 0], { w: 20, h: 4 });
  const r = await solveFill(f, plan, { alpha: 0 });
  assert.equal(r.stats.unreached, 0, 'alles erreicht');
  const at = p => r.arrival[idxAt(f, p)];
  assert.ok(at([-50, 0, 0]) < at([0, 0, 0]) && at([0, 0, 0]) < at([50, 0, 0]), 'weiter weg kommt später');
  assert.ok(r.frac[idxAt(f, [56, 0, 0])] > 0.9, 'das ferne Ende füllt zuletzt');
  assert.ok(r.frac[idxAt(f, [-56, 0, 0])] < 0.1, 'der Anschnitt füllt zuerst');
  /* Fließweg: von −60 bis +60 sind es 120 mm; der Rasterweg liegt nah dran. */
  assert.ok(r.stats.maxPath > 105 && r.stats.maxPath < 135, 'Fließweg ≈ Länge: ' + r.stats.maxPath);
  /* Bezugsdicke: doppelter Wandabstand im Mittel — für die Platte die halbe Dicke. */
  assert.ok(r.stats.refThickness > 4 && r.stats.refThickness < 6, 'Bezugsdicke ~ 5 mm: ' + r.stats.refThickness);
  assert.ok(Math.abs(r.stats.wallThickness - 2 * r.stats.refThickness) < 1e-9, 'ohne Vorgabe: doppelte Bezugsdicke');
  const r2 = await solveFill(f, plan, { alpha: 0, wallThickness: 10 });
  assert.ok(Math.abs(r2.stats.flowRatio - r2.stats.maxPath / 10) < 1e-9, 'Fließweg/Wanddicke mit Vorgabe');
  /* Der Füllgrad ist der Volumenrang: Zellen ≤ 0,5 sind die Hälfte. */
  let n = 0, total = 0;
  for (let i = 0; i < r.frac.length; i++) if (!Number.isNaN(r.frac[i])) { total++; if (r.frac[i] <= 0.5) n++; }
  assert.ok(Math.abs(n / total - 0.5) < 0.01, 'Hälfte der Zellen bis 50 %');
  assert.equal(r.stats.inlets.length, 1);
  assert.equal(r.stats.inlets[0].cells, total, 'alles aus dem einen Anschnitt');
});

test('Zwei Anschnitte: der Größere kommt weiter, die Naht liegt jenseits der Mitte', async () => {
  const m = buildModel(S.box(120, 30, 10));
  const f = await buildField(m, { res: 60, band: 5 });
  const plan = M.emptyPlan();
  const big = M.addInlet(plan, [-60, 0, 0], [-1, 0, 0], { w: 30, h: 4 });
  const small = M.addInlet(plan, [60, 0, 0], [1, 0, 0], { w: 10, h: 4 });
  const r = await solveFill(f, plan, { alpha: 0 });
  const bigCells = r.stats.inlets.find(i => i.id === big.id).cells;
  const smallCells = r.stats.inlets.find(i => i.id === small.id).cells;
  assert.ok(bigCells > smallCells * 1.5, 'der große Anschnitt füllt deutlich mehr: ' + bigCells + ' vs ' + smallCells);
  assert.equal(r.source[idxAt(f, [-40, 0, 0])], 0);
  assert.equal(r.source[idxAt(f, [56, 0, 0])], 1);
  /* Die letzte Stelle ist die Naht, nicht ein Ende. */
  const spots = lastSpots(f, r.frac, { minFrac: 0.95, spacing: 10 });
  assert.ok(spots.length >= 1);
  assert.ok(spots[0].x > 0 && spots[0].x < 55, 'Naht rechts der Mitte: ' + spots[0].x);
});

test('Dünnwand-Bremse: eine dünne Rippe füllt mit α > 0 später als ohne', async () => {
  /* Platte 100×40×10 mit einer dünnen Rippe 100×3×20 obenauf. */
  const tris = S.concat([S.box(100, 40, 10), S.translate(S.box(100, 3, 20), 0, 0, 12)]);
  const m = buildModel(tris);
  const f = await buildField(m, { res: 64, band: 5 });
  const plan = M.emptyPlan();
  M.addInlet(plan, [-50, 0, 0], [-1, 0, 0], { w: 30, h: 4 });
  const geo = await solveFill(f, plan, { alpha: 0 });
  const slow = await solveFill(f, plan, { alpha: 0.8 });
  const ribTop = idxAt(f, [30, 0, 20]);
  assert.ok(f.data[ribTop] < 0, 'die Rippe ist im Raster');
  assert.ok(slow.frac[ribTop] > geo.frac[ribTop] + 0.05, 'Rippe füllt später: ' + geo.frac[ribTop].toFixed(2) + ' → ' + slow.frac[ribTop].toFixed(2));
  assert.equal(slow.stats.unreached, 0);
});

test('Füllkörper: bei q = 1 das ganze Bauteil, bei q = 0,5 ein Teil, geschlossen extrahierbar', async () => {
  const m = buildModel(S.box(100, 40, 20));
  const f = await buildField(m, { res: 50, band: 6 });
  const plan = M.emptyPlan();
  M.addInlet(plan, [-50, 0, 0], [-1, 0, 0], { w: 20, h: 4 });
  const r = await solveFill(f, plan, { alpha: 0.5 });
  const full = surfaceNets(fillBodyField(f, r.frac, 1.01), 0);
  const half = surfaceNets(fillBodyField(f, r.frac, 0.5), 0);
  const vFull = volume(full), vHalf = volume(half);
  assert.ok(Math.abs(vFull - 80000) < 80000 * 0.06, 'voll ≈ Bauteil: ' + vFull);
  assert.ok(vHalf > 0.4 * vFull && vHalf < 0.6 * vFull, 'halb ≈ die Hälfte: ' + (vHalf / vFull).toFixed(2));
  /* Die Front bei 50 % steht ungefähr in der Mitte: rechts davon ist nichts. */
  let maxX = -Infinity;
  for (let i = 0; i < half.length; i += 3) if (half[i] > maxX) maxX = half[i];
  assert.ok(maxX > -10 && maxX < 12, 'Front nahe x = 0: ' + maxX);
  /* Der Füllgrad an der Oberfläche: nahe des Anschnitts klein, am Ende groß. */
  const surf = fracToSurface(f, r.frac);
  assert.ok(sampleFrac(f, surf, -50, 0, 10) < 0.2, 'Oberfläche am Anschnitt');
  assert.ok(sampleFrac(f, surf, 50, 0, 10) > 0.85, 'Oberfläche am Ende');
});

test('Anschnittkörper: nach außen gewickelt — das Volumen ist positiv, wie ein STL es braucht', () => {
  const plan = M.emptyPlan();
  for (const [n, rot] of [[[0, 1, 0], 0], [[1, 0, 0], 35], [[0.3, -0.2, 0.9], -70]]) {
    const a = M.addInlet(plan, [3, -4, 5], n, { w: 30, h: 4 });
    M.setRot(plan, a.id, rot);
    const v = volume(inletBody(a));
    assert.ok(Math.abs(v - 30 * 4 * 6) < 1e-6, 'w × h × 2 · 3 mm = 720, nicht −720: ' + v + ' (Normale ' + n + ')');
  }
});

test('Datei: Kennungen geprüft, fehlende eindeutig, Werte in den Grenzen der Felder', () => {
  const base = { format: M.FORMAT, version: 1 };
  for (const id of ['<img src=x onerror=alert(1)>', 'a1"><b>', '7']) {
    assert.throws(() => M.fromJSON({ ...base, items: [{ id, pos: [0, 0, 0], n: [1, 0, 0] }] }), /keine gültige Kennung/, id);
  }
  assert.throws(() => M.fromJSON({ ...base, items: [{ id: 'a1', pos: 'da', n: [1, 0, 0] }] }), /Lage fehlt/);
  const plan = M.fromJSON({ ...base, alpha: 2, items: [
    { pos: [0, 0, 0], n: [1, 0, 0], w: 9999, h: 0, share: 0 },
    { pos: [1, 0, 0], n: [1, 0, 0], share: 250, rot: -999 },
    { id: 'a1', pos: [2, 0, 0], n: [1, 0, 0], share: '' }
  ] });
  assert.equal(plan.alpha, M.ALPHA_RANGE[1], 'α wie der Regler: höchstens 1');
  const it = M.allItems(plan);
  assert.equal(it.length, 3);
  assert.equal(new Set(it.map(x => x.id)).size, 3, 'drei verschiedene Kennungen: ' + it.map(x => x.id));
  assert.equal(it[0].w, M.PARAM_META.w.max);
  assert.equal(it[0].h, M.PARAM_META.h.min);
  assert.equal(it[0].share, M.PARAM_META.share.min, 'ein Anteil liegt zwischen 1 und 100 %');
  assert.equal(it[1].share, M.PARAM_META.share.max);
  assert.equal(it[1].rot, -180);
  assert.equal(plan.items.a1.share, null, 'leer heißt: aus der Fläche');
});

test('Anschnitte, die nichts füllen: neben dem Bauteil oder ohne Anteil am Strom — und die Rechnung sagt es', async () => {
  const m = buildModel(S.box(120, 30, 10));
  const f = await buildField(m, { res: 60, band: 5 });
  const plan = M.emptyPlan();
  const a = M.addInlet(plan, [-60, 0, 0], [-1, 0, 0], { w: 20, h: 4 });
  const off = M.addInlet(plan, [60, 0, 0], [1, 0, 0], { w: 20, h: 4 });
  /* Auf der Wand: kein Abstand. Daneben: mehr als zwei Zellkanten. */
  assert.ok(gateGap(f, a) < 0.5 * f.h, 'auf der Wand: ' + gateGap(f, a));
  off.pos = [60 + 3 * f.h, 0, 0];
  assert.ok(gateGap(f, off) > GAP_CELLS * f.h, 'daneben: ' + gateGap(f, off));
  assert.equal(gateGap(f, { pos: [500, 0, 0] }), Infinity, 'außerhalb des Rasters');
  const r = await solveFill(f, plan, { alpha: 0 });
  const st = id => r.stats.inlets.find(i => i.id === id);
  assert.equal(st(off.id).closed, 'off');
  assert.equal(st(off.id).cells, 0, 'füllt nichts — früher begann seine Front an der nächsten Zelle im Bauteil');
  assert.equal(st(off.id).seeds, 0);
  assert.equal(st(a.id).closed, null);
  assert.equal(st(a.id).cells, r.cells, 'der andere füllt alles');
  assert.equal(r.stats.unreached, 0);
  /* 60 % + 60 % fest, ein dritter aus der Fläche: für ihn bleibt nichts. Früher
     lief er mit dem Boden des Tempos trotzdem und füllte ein paar Prozent. */
  off.pos = [60, 0, 0];
  const b = M.addInlet(plan, [0, 15, 0], [0, 1, 0], { w: 20, h: 4 });
  a.share = 60; off.share = 60;
  assert.equal(M.shares(plan)[b.id], 0);
  const r2 = await solveFill(f, plan, { alpha: 0 });
  const st2 = id => r2.stats.inlets.find(i => i.id === id);
  assert.equal(st2(b.id).closed, 'share');
  assert.equal(st2(b.id).cells, 0);
  assert.equal(st2(a.id).cells + st2(off.id).cells, r2.cells, 'die beiden mit Anteil füllen alles');
  /* Sitzt keiner auf dem Bauteil, gibt es keine Füllung — ohne Absturz. */
  const lone = M.emptyPlan();
  M.addInlet(lone, [0, 500, 0], [0, 1, 0]);
  const r3 = await solveFill(f, lone, {});
  assert.equal(r3.stats.inlets[0].closed, 'off');
  assert.equal(r3.stats.unreached, r3.cells);
  assert.equal(lastSpots(f, r3.frac).length, 0);
});
