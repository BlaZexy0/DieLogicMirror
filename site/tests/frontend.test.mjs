/* Frontend-Tests — laufen ohne Framework mit:
     node --test site/tests/frontend.test.mjs

   Geprüft werden:
   1. stl-math.js gegen die Sollwerte der mitgelieferten Beispiel-STLs
      (site/assets/{part,runner,biscuit,overflow}.stl)
   2. das geteilte Zuhaltungs-Modell (shared/clampmodel.js)
   3. der Übernahme-Vertrag STL → Dashboard (shared/contract.js)
   4. die Konsistenz von Felddefinition und Maschinen-Presets */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { parseSTL, meshVolume, meshArea, meshBounds } = require(path.join(site, 'stl/stl-math.js'));
const clamp = require(path.join(site, 'app/shared/clampmodel.js'));
const contract = require(path.join(site, 'app/shared/contract.js'));

globalThis.window = globalThis;
require(path.join(site, 'app/config/machines.js'));
const MACHINES = globalThis.__MACHINES__.machines;

const { allFields, groups, PRESET_KEYS } = await import(
  path.join(site, 'app/js/config/fields.js'));

function loadAsset(name) {
  const buf = readFileSync(path.join(site, 'assets', name));
  return parseSTL(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
}

const closeTo = (got, want, rel = 1e-4) =>
  assert.ok(Math.abs(got - want) <= rel * Math.max(1, Math.abs(want)),
    `erwartet ${want}, erhalten ${got}`);

const boundsEqual = (tris, min, max) => {
  const b = meshBounds(tris);
  for (let i = 0; i < 3; i++) { closeTo(b.min[i], min[i]); closeTo(b.max[i], max[i]); }
};

/* ── 1 · Beispiel-STLs gegen Sollwerte aus der Geometrie ─────── */
/* Maße wie beim Erzeugen der Dateien: Quaderflächen/-volumina exakt,
   Zylinder als Prisma mit n = 48 Segmenten (r = 35, h = 25). */

const DENSITY = 2700; // kg/m³, Default der Seite
const massKg = (volMm3) => volMm3 * DENSITY * 1e-9;

test('part.stl: Platte 200×120×4 mit Aufsatz 60×40×10', () => {
  const tris = loadAsset('part.stl');
  closeTo(meshVolume(tris), 200 * 120 * 4 + 60 * 40 * 10);      // 120 000 mm³
  closeTo(meshArea(tris), 50560 + 6800);                        // beide Hüllen voll
  boundsEqual(tris, [-100, -60, 0], [100, 60, 14]);
  closeTo(massKg(meshVolume(tris)), 0.324);
});

test('runner.stl: Balken 60×20×12', () => {
  const tris = loadAsset('runner.stl');
  closeTo(meshVolume(tris), 60 * 20 * 12);                      // 14 400 mm³
  closeTo(meshArea(tris), 2 * (60 * 20 + 60 * 12 + 20 * 12));   // 4 320 mm²
  boundsEqual(tris, [-160, -10, 0], [-100, 10, 12]);
  closeTo(massKg(meshVolume(tris)), 0.03888);
});

test('overflow.stl: drei Blöcke 20×20×10', () => {
  const tris = loadAsset('overflow.stl');
  closeTo(meshVolume(tris), 3 * 20 * 20 * 10);                  // 12 000 mm³
  closeTo(meshArea(tris), 3 * (2 * 20 * 20 + 4 * 20 * 10));     // 4 800 mm²
  boundsEqual(tris, [100, -45, 0], [120, 45, 10]);
  closeTo(massKg(meshVolume(tris)), 0.0324);
});

test('biscuit.stl: Zylinder-Puck r=35 h=25 als 48-Eck-Prisma', () => {
  const tris = loadAsset('biscuit.stl');
  const n = 48, r = 35, h = 25;
  const capArea = 0.5 * n * r * r * Math.sin(2 * Math.PI / n);  // reguläres n-Eck
  const chord = 2 * r * Math.sin(Math.PI / n);
  closeTo(meshVolume(tris), capArea * h);                       // ≈ 95 937 mm³
  closeTo(meshArea(tris), 2 * capArea + n * chord * h);
  boundsEqual(tris, [-230, -35, 0], [-160, 35, 25]);
  closeTo(massKg(meshVolume(tris)), 0.259, 1e-3);
});

/* ── 2 · Zuhaltungs-Modell ───────────────────────────────────── */

test('clampmodel: Hebelfaktor k', () => {
  assert.equal(clamp.leverK(0, 0, 810, 810), 1);
  closeTo(clamp.leverK(40, 25, 810, 810), 1 + 130 / 810);       // 1,16049…
  assert.equal(clamp.leverK(-40, -25, 810, 810), clamp.leverK(40, 25, 810, 810));
});

test('clampmodel: p_max = F / (100·S·k·A)', () => {
  assert.equal(clamp.pMax(8000, 0.1, 1, 1), 800);               // bar
  closeTo(clamp.pMax(8000, 0.1, 1.3, 1 + 130 / 810), 530.28, 1e-4);
  closeTo(clamp.pMax(3400, 0.03, 1.3, 1), 871.79, 1e-4);        // HCC-340-Größenordnung
});

/* ── 3 · Übernahme-Vertrag STL → Dashboard ───────────────────── */

test('contract: STORAGE_KEY bleibt stabil (gespeicherte Nutzer-Zustände)', () => {
  assert.equal(contract.STORAGE_KEY, 'hpdc-dashboard-state-v1');
});

test('contract: alle Übernahme-Schlüssel sind Dashboard-Felder', () => {
  const known = new Set(allFields().map(f => f.key));
  const vals = contract.stlHandoffValues({
    part: 0.324, runner: 0.039, overflow: 0.032, biscuit: 0.259,
    density: 2700, area: 0.03, eccX: 12, eccY: 3, safety: 1.3, psel: 600
  }, MACHINES[0].fields);
  for (const k of Object.keys(vals)) {
    assert.ok(known.has(k), `Übernahme-Schlüssel „${k}" ist kein Dashboard-Feld`);
    assert.ok(Number.isFinite(vals[k]), `Übernahme-Wert „${k}" ist nicht numerisch`);
  }
});

test('contract: writeDashboardState mischt, statt zu überschreiben', () => {
  const mem = new Map([[contract.STORAGE_KEY,
    JSON.stringify({ values: { wall: 9 }, curve: [[60, 0.4]], machine: 'alt' })]]);
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.ok(contract.writeDashboardState(storage, { area: 0.03 }, 'hcc800'));
  const data = JSON.parse(mem.get(contract.STORAGE_KEY));
  assert.equal(data.values.wall, 9);          // fremde Eingabe bleibt
  assert.equal(data.values.area, 0.03);       // Übernahme angekommen
  assert.deepEqual(data.curve, [[60, 0.4]]);  // Schusskurve bleibt
  assert.equal(data.machine, 'hcc800');
});

test('contract: korrupter localStorage-Inhalt wird ersetzt', () => {
  const mem = new Map([[contract.STORAGE_KEY, '{kaputt']]);
  const storage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.ok(contract.writeDashboardState(storage, { area: 0.03 }, 'hcc340'));
  assert.equal(JSON.parse(mem.get(contract.STORAGE_KEY)).values.area, 0.03);
});

/* ── 4 · Felddefinition und Maschinen-Presets ────────────────── */

test('fields: keine doppelten Schlüssel', () => {
  const keys = allFields().map(f => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('fields: Maschinenwerte-Gruppe entspricht exakt PRESET_KEYS', () => {
  const bundle = groups.find(g => g.preset).fields.map(f => f.key).sort();
  assert.deepEqual(bundle, Object.keys(PRESET_KEYS).sort());
});

test('machines: jedes Preset setzt genau die PRESET_KEYS, plausibel', () => {
  assert.ok(MACHINES.length > 0);
  for (const m of MACHINES) {
    assert.deepEqual(Object.keys(m.fields).sort(), Object.keys(PRESET_KEYS).sort(),
      `Preset „${m.id}" weicht von PRESET_KEYS ab`);
    for (const [k, v] of Object.entries(m.fields))
      assert.ok(Number.isFinite(v) && v > 0, `Preset „${m.id}": ${k} muss > 0 sein`);
    assert.ok(m.fields.dmin < m.fields.dmax, `Preset „${m.id}": dmin < dmax verletzt`);
    assert.ok(m.fields.lmin < m.fields.lmax, `Preset „${m.id}": lmin < lmax verletzt`);
    assert.ok(m.id && m.name, `Preset ohne id/name`);
  }
});
