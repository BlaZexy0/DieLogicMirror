/* Tests für core/limits.js — das deklarative Grenzen-Modell der Diagramme.
   Aufruf: node --test tests/web/limits.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const { feasibleInterval, feasibleBand, violates } = await import(
  path.join(site, 'tools/auslegung/js/core/limits.js'));

/* ── feasibleInterval: Schnittmenge konstanter Schranken ─────── */

test('feasibleInterval: leer → unbeschränkt', () => {
  const r = feasibleInterval([]);
  assert.equal(r.lo, -Infinity);
  assert.equal(r.hi, Infinity);
  assert.equal(r.ok, true);
});

test('feasibleInterval: schärfste Schranke bindet', () => {
  const a = { id: 'a', kind: 'min', value: 2 };
  const b = { id: 'b', kind: 'min', value: 5 };
  const c = { id: 'c', kind: 'max', value: 9 };
  const r = feasibleInterval([a, b, c]);
  assert.equal(r.lo, 5);
  assert.equal(r.hi, 9);
  assert.equal(r.loLim, b);     // bindende Untergrenze ist die schärfere
  assert.equal(r.hiLim, c);
  assert.equal(r.ok, true);
});

test('feasibleInterval: widersprüchliche Grenzen → ok false', () => {
  const r = feasibleInterval([
    { id: 'a', kind: 'min', value: 10 },
    { id: 'b', kind: 'max', value: 3 }
  ]);
  assert.equal(r.ok, false);
});

test('feasibleInterval: Zielband und Referenz zählen nicht', () => {
  const r = feasibleInterval([
    { id: 't', kind: 'min', value: 8, severity: 'target' },
    { id: 'r', kind: 'max', value: 1, severity: 'ref' }
  ]);
  assert.equal(r.lo, -Infinity);
  assert.equal(r.hi, Infinity);
});

/* ── feasibleBand: Scanline-Hüllkurven → Polygone ────────────── */

const xs = [0, 1, 2, 3, 4];

test('feasibleBand: konstante Schranken → ein Rechteck-Polygon', () => {
  const { polys, edges } = feasibleBand(xs, [() => 1], [() => 3]);
  assert.equal(polys.length, 1);
  // Hinweg auf der Unterkante, Rückweg auf der Oberkante
  assert.deepEqual(polys[0].slice(0, 5), xs.map(x => [x, 1]));
  assert.deepEqual(polys[0].slice(5), xs.slice().reverse().map(x => [x, 3]));
  assert.equal(edges.length, xs.length);
  assert.equal(edges[0].loIdx, 0);
  assert.equal(edges[0].hiIdx, 0);
});

test('feasibleBand: max(untere) und min(obere) bilden die Hüllkurven', () => {
  const { edges } = feasibleBand(xs,
    [x => x, () => 1.5],          // untere: erst konstant 1,5, dann x
    [() => 10, x => 8 - x]);      // obere: erst 10, dann 8−x
  assert.equal(edges.find(e => e.x === 0).lo, 1.5);
  assert.equal(edges.find(e => e.x === 0).loIdx, 1);
  assert.equal(edges.find(e => e.x === 3).lo, 3);
  assert.equal(edges.find(e => e.x === 3).loIdx, 0);
  assert.equal(edges.find(e => e.x === 3).hi, 5);   // 8−x unterbietet 10
  assert.equal(edges.find(e => e.x === 3).hiIdx, 1);
  assert.equal(edges.find(e => e.x === 4), undefined);   // bei x=4 schnürt sich das Band zu
});

test('feasibleBand: zugeschnürtes Band zerfällt in zwei Polygone', () => {
  // Untere Schranke buckelt in der Mitte über die obere → Lücke bei x=2
  const lower = x => (x === 2 ? 5 : 0);
  const { polys } = feasibleBand(xs, [lower], [() => 3]);
  assert.equal(polys.length, 2);
});

test('feasibleBand: ±Infinity heißt „keine Schranke hier"', () => {
  const { polys, edges } = feasibleBand(xs, [() => -Infinity], [() => Infinity], 0, 10);
  assert.equal(polys.length, 1);
  assert.equal(edges[0].lo, 0);      // Ränder yMin/yMax greifen
  assert.equal(edges[0].hi, 10);
  assert.equal(edges[0].loIdx, -1);  // −1 = Rand, keine Schranke aktiv
});

/* Absicherung des phild-Refactors: die alte handgeschriebene Scanline
   (vor dem Umbau) und feasibleBand liefern identische Polygone. */
test('feasibleBand: identisch zur alten phild-Scanline', () => {
  const PI = Math.PI;
  const V = 18.2 / 2700 / 1000 * 1e3;              // ≈ Dosiervolumen m³
  const k = 4 * V / PI;
  const rD = (phi, D) => k / (phi * D * D * D);
  const rL = (phi, L) => Math.sqrt(PI * L * L * L * phi / (4 * V));
  const lowers = [phi => rD(phi, 0.2), phi => rL(phi, 0.5)];
  const uppers = [phi => rD(phi, 0.12), phi => rL(phi, 0.9)];
  const phis = [];
  for (let i = 0; i < 481; i++) phis.push(0.02 + (0.98 - 0.02) * i / 480);

  // alte Implementierung (wörtlich aus phild.js vor dem Refactor)
  const band = [];
  let lo = [], hi = [];
  for (const phi of phis) {
    const rlo = Math.max(lowers[0](phi), lowers[1](phi));
    const rhi = Math.min(uppers[0](phi), uppers[1](phi));
    const a = Math.max(rlo, 1), b = Math.min(rhi, 12);
    if (b > a + 1e-9) { lo.push([phi, a]); hi.push([phi, b]); }
    else if (lo.length) { band.push(lo.concat(hi.reverse())); lo = []; hi = []; }
  }
  if (lo.length) band.push(lo.concat(hi.reverse()));

  const { polys } = feasibleBand(phis, lowers, uppers, 1, 12);
  assert.deepEqual(polys, band);
  assert.ok(polys.length >= 1, 'Testfall soll ein nichtleeres Band liefern');
});

/* ── violates: Punktprüfung für Hover und Prüftexte ──────────── */

test('violates: konstante und Kurvenschranken, x und y', () => {
  const ymax = { id: 'a', on: 'y', kind: 'max', value: 5 };
  const xmin = { id: 'b', on: 'x', kind: 'min', value: 2 };
  const curve = { id: 'c', on: 'y', kind: 'min', fn: x => x * 10 };
  assert.equal(violates(ymax, 0, 6), true);
  assert.equal(violates(ymax, 0, 5), false);
  assert.equal(violates(xmin, 1, 0), true);
  assert.equal(violates(xmin, 3, 0), false);
  assert.equal(violates(curve, 2, 15), true);   // y < 20 verletzt
  assert.equal(violates(curve, 1, 15), false);
});

test('violates: Infinity-Schranke gilt als nicht beschränkt', () => {
  const l = { id: 'a', on: 'y', kind: 'max', fn: x => (x > 1 ? Infinity : 3) };
  assert.equal(violates(l, 0, 9), true);
  assert.equal(violates(l, 2, 9), false);
});

test('violates: Zielband und Referenz verletzen nie', () => {
  assert.equal(violates({ id: 't', on: 'y', min: 1, max: 2, severity: 'target' }, 0, 99), false);
  assert.equal(violates({ id: 'r', on: 'y', value: 1, severity: 'ref' }, 0, 99), false);
});
