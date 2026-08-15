/* Frontend-Tests — laufen ohne Framework mit:
     node --test site/tests/frontend.test.mjs

   Geprüft werden:
   1. stl-math.js gegen die Sollwerte der mitgelieferten Beispiel-STLs
      (site/assets/{part,runner,biscuit,overflow}.stl)
   2. das geteilte Zuhaltungs-Modell (shared/clampmodel.js)
   3. der Übernahme-Vertrag STL → Dashboard (shared/contract.js)
   4. die Konsistenz von Felddefinition und Maschinen-Presets
   5. die Rechenlogik der STL-Seite (stl/stl-logic.js) */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { parseSTL, meshVolume, meshArea, meshBounds } = require(path.join(site, 'stl/stl-math.js'));
const logic = require(path.join(site, 'stl/stl-logic.js'));
const clamp = require(path.join(site, 'app/shared/clampmodel.js'));
const contract = require(path.join(site, 'app/shared/contract.js'));

globalThis.window = globalThis;
require(path.join(site, 'app/config/machines.js'));
const MACHINES = globalThis.__MACHINES__.machines;

const { allFields, groups, PRESET_KEYS } = await import(
  path.join(site, 'app/js/config/fields.js'));

/* inputs.js/curvegen.js ziehen core/state.js mit — der braucht localStorage. */
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { POSITIVE_KEYS, NONNEG_KEYS, NEGATIVE_OK } = await import(
  path.join(site, 'app/js/ui/inputs.js'));
const { generateCurve } = await import(path.join(site, 'app/js/core/curvegen.js'));
const { computeShot } = await import(path.join(site, 'app/js/core/physics.js'));
const { state, applyData } = await import(path.join(site, 'app/js/core/state.js'));
const { charts } = await import(path.join(site, 'app/js/charts/registry.js'));

function defaultValues() {
  const v = {};
  for (const f of allFields()) v[f.key] = f.def;
  return v;
}

/* ── Schusskurven-Generatoren (core/curvegen.js) ─────────────── */

test('curvegen: López-Modus — gültige Kurve, v1 ≤ v_krit, Hub bis Schussende', () => {
  const v = defaultValues();
  const r = generateCurve(v, { mode: 'lopez' });
  assert.ok(!r.error, r.error);
  assert.ok(r.points.length >= 4);
  for (let i = 1; i < r.points.length; i++)
    assert.ok(r.points[i][0] > r.points[i - 1][0], 'Wegpunkte müssen streng steigen');
  const shot = computeShot(v, r.points);
  assert.ok(!shot.error, shot.error);
  assert.ok(shot.v1 <= shot.vcrit + 1e-6, `v1 ${shot.v1} > v_krit ${shot.vcrit}`);
  assert.ok(shot.checks[0][0], 'v_krit-Prüfung muss bestehen: ' + shot.checks[0][1]);
  // Kurvenende = Kammer − Pressrest (deckt den Gesamthub ab)
  assert.ok(shot.profile.travel >= shot.totalStroke - 1e-9, 'Kurvenhub deckt Gesamthub nicht ab');
  assert.ok(shot.profile.travel <= v.length / 1000 - shot.biscLen + 2e-3, 'Kurve läuft in den Pressrest');
});

test('curvegen: V1/V2-Modus — Plateau bei V1, Fehler bei zu flacher Rampe', () => {
  const v = defaultValues();
  const ok = generateCurve(v, { mode: 'v1v2', v1: 0.4, a1: 5, v2: 4, a2: 30 });
  assert.ok(!ok.error, ok.error);
  assert.ok(!ok.warn, ok.warn);
  const shot = computeShot(v, ok.points);
  assert.ok(!shot.error, shot.error);
  closeTo(shot.v1, 0.4, 1e-3);
  closeTo(shot.profile.vmax, 4, 1e-3);
  const bad = generateCurve(v, { mode: 'v1v2', v1: 4, a1: 0.01, v2: 5, a2: 30 });
  assert.ok(bad.error, 'zu flache Rampe muss einen Fehler liefern');
});

test('curvegen: V1/V2 — zu kleines a₂ kappt V₂, statt a₂ zu überschreiten', () => {
  const v = defaultValues();
  const r = generateCurve(v, { mode: 'v1v2', v1: 0.4, a1: 5, v2: 6.5, a2: 8 });
  assert.ok(!r.error, r.error);
  assert.ok(r.warn, 'Hinweis auf gekappte Rampe erwartet');
  const shot = computeShot(v, r.points);
  assert.ok(!shot.error, shot.error);
  const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
  assert.ok(aPk <= 8 + 1e-6, 'Beschleunigung über a₂: ' + aPk);
  assert.ok(shot.profile.vmax < 6.5, 'V₂ darf nicht erreicht werden');
  assert.ok(shot.profile.travel >= shot.totalStroke - 1e-9, 'Kurvenhub deckt Gesamthub nicht ab');
});

test('curvegen: López — kleines a_max wird nicht überschritten (2. Phase gekappt)', () => {
  const v = Object.assign(defaultValues(), { amax: 3 });
  const r = generateCurve(v, { mode: 'lopez' });
  assert.ok(!r.error, r.error);
  assert.ok(r.warn, 'Hinweis auf gekappte Rampe erwartet');
  const shot = computeShot(v, r.points);
  assert.ok(!shot.error, shot.error);
  const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
  assert.ok(aPk <= 3 + 1e-6, 'Beschleunigung über a_max: ' + aPk);
  assert.ok(shot.checks[2][0], 'Beschleunigungs-Prüfung muss bestehen: ' + shot.checks[2][1]);
});

/* ── Zustands-Übernahme (core/state.js) ──────────────────────── */

test('state: applyData verwirft ungültige Kurvenpunkte statt NaN zu übernehmen', () => {
  const before = state.curve.map(p => p.slice());
  applyData({ curve: [['x', 'y'], [null, {}], [NaN, 1]] });
  assert.deepEqual(state.curve, before, 'nur ungültige Punkte → Kurve unverändert');
  applyData({ curve: [[10, 0.2], ['kaputt', 1], [500, 3]] });
  assert.deepEqual(state.curve, [[10, 0.2], [500, 3]], 'gültige Punkte bleiben, kaputte fliegen raus');
});

/* ── Navigation (site/nav.js) ────────────────────────────────── */

test('nav: CHARTS-Liste entspricht der Registry (Ids, Titel, Reihenfolge)', () => {
  const src = readFileSync(path.join(site, 'nav.js'), 'utf8');
  const m = src.match(/const CHARTS = \[([\s\S]*?)\n  \];/);
  assert.ok(m, 'CHARTS-Array in nav.js nicht gefunden');
  const navCharts = new Function('return [' + m[1] + ']')();
  assert.deepEqual(navCharts, charts.map(c => [c.id, c.title]),
    'nav.js CHARTS muss js/charts/registry.js entsprechen (Reihenfolge = Registry)');
});

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

/* Vorzeichen-Klassen der Validierung dürfen nicht von der Felddefinition
   wegdriften: jedes numerische Feld gehört in genau eine der Klassen
   > 0 (POSITIVE_KEYS), ≥ 0 (NONNEG_KEYS) oder vorzeichenbehaftet
   (NEGATIVE_OK) — und jeder Klassen-Eintrag muss ein echtes Feld sein. */
test('inputs: jedes numerische Feld hat genau eine Vorzeichen-Klasse', () => {
  const numeric = allFields().filter(f => f.type !== 'select');
  for (const f of numeric) {
    const n = (POSITIVE_KEYS.includes(f.key) ? 1 : 0)
      + (NONNEG_KEYS.includes(f.key) ? 1 : 0)
      + (NEGATIVE_OK.has(f.key) ? 1 : 0);
    assert.equal(n, 1,
      `Feld „${f.key}" ist in ${n} Vorzeichen-Klassen — erwartet genau 1 von POSITIVE_KEYS / NONNEG_KEYS / NEGATIVE_OK (inputs.js)`);
  }
  const known = new Set(numeric.map(f => f.key));
  for (const k of [...POSITIVE_KEYS, ...NONNEG_KEYS, ...NEGATIVE_OK])
    assert.ok(known.has(k), `Klassen-Eintrag „${k}" ist kein Eingabefeld`);
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

test('fields: Preset-Gruppen entsprechen exakt PRESET_KEYS (key → Domäne)', () => {
  const expected = {};
  for (const g of groups) {
    if (g.preset) for (const f of g.fields) expected[f.key] = g.preset;
  }
  assert.deepEqual(PRESET_KEYS, expected);
  /* Jede Preset-Domäne hat genau eine Feldgruppe. */
  const domains = groups.filter(g => g.preset).map(g => g.preset).sort();
  assert.deepEqual(domains, ['alloy', 'machine', 'part']);
});

test('presets: Alle Legierungs-/Bauteil-Preset-Felder sind Felder ihrer Domäne', () => {
  const require2 = createRequire(import.meta.url);
  require2(path.join(site, 'app/config/alloys.js'));
  require2(path.join(site, 'app/config/parts.js'));
  for (const [list, dom] of [[globalThis.__ALLOYS__.alloys, 'alloy'], [globalThis.__PARTS__.parts, 'part']]) {
    assert.ok(list.length > 0);
    for (const p of list) {
      for (const k of Object.keys(p.fields)) {
        assert.equal(PRESET_KEYS[k], dom, `Preset „${p.id}": Feld „${k}" gehört nicht zur Domäne ${dom}`);
        assert.ok(Number.isFinite(p.fields[k]), `Preset „${p.id}": Feld „${k}" nicht numerisch`);
      }
    }
  }
});

/* ── 5 · Rechenlogik der STL-Seite ───────────────────────────── */

test('stl-logic: roleSums summiert Massen je Rolle', () => {
  const models = [
    { volume: 120000, role: 'part' },     // 0,324 kg bei 2700 kg/m³
    { volume: 14400, role: 'runner' },
    { volume: 6000, role: 'overflow' },
    { volume: 6000, role: 'overflow' },   // zwei Dateien derselben Rolle addieren
    { volume: 95937, role: 'biscuit' },
    { volume: 99999, role: '' },          // ohne Zuordnung: zählt nicht
  ];
  const sums = logic.roleSums(models, 2700);
  closeTo(sums.part, 0.324);
  closeTo(sums.runner, 0.03888);
  closeTo(sums.overflow, 0.0324);
  closeTo(sums.biscuit, 0.2590299);
});

test('stl-logic: missingRoles nennt fehlende Zuordnungen', () => {
  assert.deepEqual(logic.missingRoles([]), ['Bauteil', 'Anguss', 'Überlauf', 'Pressrest']);
  assert.deepEqual(
    logic.missingRoles([{ role: 'part' }, { role: 'biscuit' }, { role: '' }]),
    ['Anguss', 'Überlauf']);
  assert.deepEqual(
    logic.missingRoles([{ role: 'part' }, { role: 'runner' }, { role: 'overflow' }, { role: 'biscuit' }]),
    []);
});

test('stl-logic: machineRows empfiehlt die kleinste geeignete Maschine', () => {
  // A = 0,15 m² (150 000 mm²), zentrisch: pK = F/(100·0,15·1,3)
  // → HCC-340 174 bar, HCC-800 410 bar (zu klein), HCC-1600 821 bar (empfohlen).
  const { rows, pref } = logic.machineRows(MACHINES, clamp,
    { areaMm2: 150000, ex: 0, ey: 0, safety: 1.3, pTarget: 600 });
  assert.equal(rows.length, MACHINES.length);
  closeTo(rows[0].pK, 3400 / (100 * 0.15 * 1.3));
  assert.deepEqual(rows.map(r => r.ok), [false, false, true]);
  assert.equal(pref.mc.id, 'hcc1600');
  // Ohne Sicherheitsfaktor/Außermittigkeit: p0 = F/(100·A)
  closeTo(rows[2].p0, 16000 / (100 * 0.15));
  assert.equal(rows[2].k, 1);
});

test('stl-logic: machineRows markiert Abheben (k − 1 ≥ 1) als ungeeignet', () => {
  // e = 300 mm: HCC-340 (Säulenabstand 560) hebt ab (2·300/560 ≥ 1),
  // die größeren Maschinen nicht.
  const { rows, pref } = logic.machineRows(MACHINES, clamp,
    { areaMm2: 20000, ex: 300, ey: 0, safety: 1.3, pTarget: 600 });
  assert.equal(rows[0].lift, true);
  assert.equal(rows[0].ok, false);      // trotz ausreichenden Drucks
  assert.ok(rows[0].pK >= 600);
  assert.equal(rows[1].lift, false);
  assert.equal(pref.mc.id, 'hcc800');
});

test('stl-logic: keine geeignete Maschine → pref null', () => {
  const { pref } = logic.machineRows(MACHINES, clamp,
    { areaMm2: 1e6, ex: 0, ey: 0, safety: 1.3, pTarget: 600 });
  assert.equal(pref, null);
});

test('machines: jedes Preset setzt genau die Maschinen-PRESET_KEYS, plausibel', () => {
  const machineKeys = Object.keys(PRESET_KEYS).filter(k => PRESET_KEYS[k] === 'machine').sort();
  assert.ok(MACHINES.length > 0);
  for (const m of MACHINES) {
    assert.deepEqual(Object.keys(m.fields).sort(), machineKeys,
      `Preset „${m.id}" weicht von den Maschinen-PRESET_KEYS ab`);
    for (const [k, v] of Object.entries(m.fields))
      assert.ok(Number.isFinite(v) && v > 0, `Preset „${m.id}": ${k} muss > 0 sein`);
    assert.ok(m.fields.dmin < m.fields.dmax, `Preset „${m.id}": dmin < dmax verletzt`);
    assert.ok(m.fields.lmin < m.fields.lmax, `Preset „${m.id}": lmin < lmax verletzt`);
    assert.ok(m.id && m.name, `Preset ohne id/name`);
  }
});
