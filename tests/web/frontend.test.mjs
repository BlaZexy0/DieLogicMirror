/* Frontend-Tests — laufen ohne Framework mit:
     node --test tests/web/frontend.test.mjs

   Geprüft werden:
   1. stl-math.js gegen die Sollwerte der mitgelieferten Beispiel-STLs
      (web/examples/{part,runner,biscuit,overflow}.stl)
   2. das geteilte Zuhaltungs-Modell (shared/clampmodel.js)
   3. die Übernahme STL → Projekt (stl-logic.js handoffValues + project.mergeDesign)
   4. die Konsistenz von Felddefinition und Maschinen-Presets
   5. die Rechenlogik der STL-Seite (tools/sprengflaeche/stl-logic.js)
   6. die Rechenlogik der Teilekosten-Seite (tools/teilekosten/teilekosten-logic.js)
   7. die Zeitleisten-Logik der Zyklusanalyse (zyklus/zyklus-logic.js) */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

const { parseSTL, meshVolume, meshArea, meshBounds } = require(path.join(site, 'tools/sprengflaeche/stl-math.js'));
const logic = require(path.join(site, 'tools/sprengflaeche/stl-logic.js'));
const kosten = require(path.join(site, 'tools/teilekosten/teilekosten-logic.js'));
const zyklus = require(path.join(site, 'tools/zyklus/zyklus-logic.js'));
const clamp = require(path.join(site, 'shared/clampmodel.js'));
const project = require(path.join(site, 'shared/project.js'));

globalThis.window = globalThis;
require(path.join(site, 'shared/examples/machines.js'));
const MACHINES = globalThis.__MACHINES__.machines;

const { allFields, groups, PRESET_KEYS } = await import(
  path.join(site, 'tools/auslegung/js/config/fields.js'));

/* inputs.js/curvegen.js ziehen core/state.js mit — der braucht das Projekt-Modul
   (project.js fällt ohne localStorage auf einen Leerspeicher zurück). */
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
const { POSITIVE_KEYS, NONNEG_KEYS, NEGATIVE_OK } = await import(
  path.join(site, 'tools/auslegung/js/ui/inputs.js'));
const { generateCurve, fillTimeMs } = await import(path.join(site, 'tools/auslegung/js/core/curvegen.js'));
const { computeShot } = await import(path.join(site, 'tools/auslegung/js/core/physics.js'));
const { state, applyData } = await import(path.join(site, 'tools/auslegung/js/core/state.js'));
const { charts } = await import(path.join(site, 'tools/auslegung/js/charts/registry.js'));

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

test('curvegen: López — Rampe der 2. Phase beginnt nie vor „Kammer voll" (Sweep über Ø, L, Masse, a_max)', () => {
  /* Die Plateau-Rundung auf 0,1 mm darf die Rampe nicht vor s_voll starten
     lassen — sonst liegt v(s_voll) über v_krit. */
  let n = 0;
  for (const diam of [80, 100, 120, 150, 180, 220]) for (const length of [600, 800, 1000, 1400])
    for (const part of [2, 6, 12, 25]) for (const amax of [30, 60, 200]) {
      const v = Object.assign(defaultValues(), { diam, length, part, amax, dmin: 50, dmax: 400 });
      const r = generateCurve(v, { mode: 'lopez' }); if (r.error) continue;
      const shot = computeShot(v, r.points); if (shot.error) continue; n++;
      assert.ok(shot.v1 <= shot.vcrit + 1e-9, `Ø${diam} L${length} m${part} a${amax}: v1 ${shot.v1} > v_krit ${shot.vcrit}`);
      assert.ok(shot.checks[0][0], `Ø${diam} L${length} m${part} a${amax}: ` + shot.checks[0][1]);
      const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
      assert.ok(aPk <= amax + 1e-6, `Ø${diam} L${length} m${part}: a ${aPk} > a_max ${amax}`);
    }
  assert.ok(n > 100, 'zu wenige gültige Fälle: ' + n);
});

test('curvegen: López — 2. Phase trifft die NADCA-Füllzeit, sonst ehrlicher Hinweis', () => {
  const v = defaultValues();
  const tN = v.kfill * v.wall * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / (v.Tflow - v.Tdie);
  /* a_max groß genug: Füllzeit ab Anschnitt = NADCA-Empfehlung, inkl. Rampe */
  const fast = Object.assign({}, v, { amax: 200 });
  const r = generateCurve(fast, { mode: 'lopez' });
  assert.ok(!r.error && !r.warn, r.error || r.warn);
  const shot = computeShot(fast, r.points);
  closeTo(shot.fill, tN, 0.3);
  closeTo(r.tN, tN, 1e-9);
  assert.ok(r.v2 > 1e9 * (v.part + v.overflow) / v.density / (tN * 0.25 * Math.PI * v.diam * v.diam),
    'v₂ muss über dem Wert ohne Rampe liegen, um die Rampe auszugleichen');
  /* a_max = 60 (Preset): NADCA-Zeit physikalisch nicht erreichbar → schnellste 2. Phase + Hinweis */
  const slow = generateCurve(v, { mode: 'lopez' });
  assert.ok(slow.warn && /a_max .* reicht für die NADCA-Füllzeit/.test(slow.warn), 'Hinweis erwartet: ' + slow.warn);
  const s2 = computeShot(v, slow.points);
  assert.ok(s2.fill > tN, 'Füllzeit über NADCA: ' + s2.fill);
  assert.ok(s2.fill < 70, 'schnellste 2. Phase: ' + s2.fill);
  const aPk = Math.max(s2.profile.amax, -s2.profile.amin, 0);
  assert.ok(aPk <= v.amax + 1e-6 && aPk > 0.99 * v.amax, 'volle Beschleunigung erwartet: ' + aPk);
});

test('curvegen: fillTimeMs — Rampe + Plateau, Grenzfälle', () => {
  /* ohne Rampe: reine Plateaufahrt 100 mm bei 5 m/s = 20 ms */
  closeTo(fillTimeMs(1, 5, 0, 500, 600, 700), 20, 1e-9);
  /* Rampe endet vor dem Anschnitt → wieder Plateau: (800−700)/5 = 20 ms */
  closeTo(fillTimeMs(1, 5, 100, 500, 700, 800), 20, 1e-9);   // Rampenweg (25−1)/200 = 0,12 m = 120 mm < 200
  /* Rampe läuft durch die Formfüllung: t = (√(v0²+2aΔs) − v0)/a je Punkt */
  const t = s => (Math.sqrt(1 + 2 * 100 * (s - 500) / 1000) - 1) / 100;
  closeTo(fillTimeMs(1, 10, 100, 500, 550, 600), (t(600) - t(550)) * 1000, 1e-9);
  /* schnelleres v₂ → kürzere Füllzeit */
  assert.ok(fillTimeMs(1, 6, 60, 500, 600, 900) < fillTimeMs(1, 5, 60, 500, 600, 900));
});

test('state: Folge-Felder — eingestellter Akkumulatordruck folgt dem Nennwert des Presets', async () => {
  const { FOLLOWS } = await import(path.join(site, 'tools/auslegung/js/config/fields.js'));
  assert.deepEqual(FOLLOWS, { pAccOp: 'pAcc' });
  const { state, applyData, applyFollows } = await import(path.join(site, 'tools/auslegung/js/core/state.js'));
  /* Defaults: Preset hcc1600 hat 160 bar → Betriebsdruck 160 */
  assert.equal(state.values.pAccOp, state.values.pAcc);
  /* Preset mit anderem Nennwert → Folge-Feld zieht nach */
  state.values.pAcc = 180; applyFollows();
  assert.equal(state.values.pAccOp, 180);
  /* Altes Projekt ohne pAccOp: Vorgabe = Nennwert aus dem Projekt */
  applyData({ values: { pAcc: 200, injForce: 2500 } });
  assert.equal(state.values.pAccOp, 200);
  /* Projekt mit eigenem Betriebsdruck behält ihn */
  applyData({ values: { pAcc: 200, pAccOp: 120 } });
  assert.equal(state.values.pAccOp, 120);
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

/* ── Navigation (web/shared/nav.js) ────────────────────────────────── */

test('nav: CHARTS-Liste entspricht der Registry (Ids, Titel, Reihenfolge)', () => {
  const src = readFileSync(path.join(site, 'shared/nav.js'), 'utf8');
  const m = src.match(/const CHARTS = \[([\s\S]*?)\n  \];/);
  assert.ok(m, 'CHARTS-Array in nav.js nicht gefunden');
  const navCharts = new Function('return [' + m[1] + ']')();
  assert.deepEqual(navCharts, charts.map(c => [c.id, c.title]),
    'nav.js CHARTS muss js/charts/registry.js entsprechen (Reihenfolge = Registry)');
});

function loadAsset(name) {
  const buf = readFileSync(path.join(site, 'examples', name));
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

test('clampmodel: forceKN und areaMax sind die Umkehrungen von pMax (1 bar·m² = 100 kN)', () => {
  assert.equal(clamp.KN_PER_BAR_M2, 100);
  assert.equal(clamp.forceKN(600, 0.15, 1, 1), 9000);            // 600 bar auf 0,15 m² → 9.000 kN
  closeTo(clamp.forceKN(600, 0.15, 1.3, 1), 11700);
  closeTo(clamp.areaMax(16000, 600, 1.3, 1), 16000 / (100 * 600 * 1.3));
  /* Rundreise über alle drei Richtungen */
  const F = 8000, A = 0.1, S = 1.3, k = 1 + 130 / 810;
  const p = clamp.pMax(F, A, S, k);
  closeTo(clamp.forceKN(p, A, S, k), F, 1e-9);
  closeTo(clamp.areaMax(F, p, S, k), A, 1e-12);
});

/* ── 3 · Übernahme STL → Projekt ─────────────────────────────── */

test('handoff: alle Übernahme-Schlüssel sind Dashboard-Felder', () => {
  const known = new Set(allFields().map(f => f.key));
  const require3 = createRequire(import.meta.url);
  require3(path.join(site, 'shared/examples/alloys.js'));
  const ALLOYS = globalThis.__ALLOYS__.alloys;
  const vals = logic.handoffValues({
    part: 0.324, runner: 0.039, overflow: 0.032, biscuit: 0.259,
    density: 2700, area: 0.03, eccX: 12, eccY: 3, safety: 1.3, psel: 600
  }, MACHINES[0].fields, ALLOYS[0].fields);
  for (const k of Object.keys(vals)) {
    assert.ok(known.has(k), `Übernahme-Schlüssel „${k}" ist kein Dashboard-Feld`);
    assert.ok(Number.isFinite(vals[k]), `Übernahme-Wert „${k}" ist nicht numerisch`);
  }
  /* Beide Presets kommen an, ohne sich zu überschreiben */
  assert.equal(vals.force, MACHINES[0].fields.force);
  assert.equal(vals.density, ALLOYS[0].fields.density, 'Flüssigdichte der Legierung für das Dashboard');
  assert.equal(vals.densitySolid, ALLOYS[0].fields.densitySolid);
  /* Ohne Legierung bleibt die Übernahme wie bisher */
  assert.equal(logic.handoffValues({ part: 1 }, MACHINES[0].fields).densitySolid, undefined);
});

/* Vorzeichen-Klassen der Validierung dürfen nicht von der Felddefinition
   wegdriften: jedes numerische Feld gehört in genau eine der Klassen
   > 0 (POSITIVE_KEYS), ≥ 0 (NONNEG_KEYS) oder vorzeichenbehaftet
   (NEGATIVE_OK) — und jeder Klassen-Eintrag muss ein echtes Feld sein. */
test('presets: jede Legierung hat plausible Feststoffdichte und Schwindmaß', () => {
  const require4 = createRequire(import.meta.url);
  require4(path.join(site, 'shared/examples/alloys.js'));
  for (const a of globalThis.__ALLOYS__.alloys) {
    const f = a.fields;
    assert.ok(f.densitySolid > 1000 && f.densitySolid < 9000, `${a.id}: Feststoffdichte ${f.densitySolid}`);
    assert.ok(f.densitySolid > f.density, `${a.id}: fest muss dichter sein als flüssig`);
    assert.ok(f.shrink > 0 && f.shrink < 2, `${a.id}: Schwindmaß ${f.shrink} % unplausibel`);
  }
});

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

function memStorage(init) {
  const mem = new Map(Object.entries(init || {}));
  return { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k), mem };
}

test('mergeDesign: mischt in den design-Abschnitt, statt zu überschreiben', () => {
  project._reset();
  project.init(memStorage());
  project.create({ name: 'T' });
  project.setSection('design', { values: { wall: 9 }, curve: [[60, 0.4]], machine: 'alt' });
  assert.ok(project.mergeDesign({ area: 0.03 }, 'hcc800'));
  const data = project.getSection('design');
  assert.equal(data.values.wall, 9);          // fremde Eingabe bleibt
  assert.equal(data.values.area, 0.03);       // Übernahme angekommen
  assert.deepEqual(data.curve, [[60, 0.4]]);  // Schusskurve bleibt
  assert.equal(data.machine, 'hcc800');
  /* Legierung optional: ohne Angabe bleibt die bisherige stehen */
  assert.ok(project.mergeDesign({ psel: 700 }, 'hcc800', 'alsi12'));
  assert.equal(project.getSection('design').alloy, 'alsi12');
  assert.ok(project.mergeDesign({ psel: 650 }, null));
  assert.equal(project.getSection('design').alloy, 'alsi12', 'Legierung bleibt');
  assert.equal(project.getSection('design').machine, 'hcc800', 'Maschine bleibt');
  project._reset();
});

test('mergeDesign: Projekt ohne design-Abschnitt bekommt einen', () => {
  project._reset();
  project.init(memStorage());
  project.create({ name: 'T' });
  assert.ok(project.mergeDesign({ area: 0.03 }, 'hcc340'));
  assert.equal(project.getSection('design').values.area, 0.03);
  assert.equal(project.getSection('design').machine, 'hcc340');
  project._reset();
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
  require2(path.join(site, 'shared/examples/alloys.js'));
  require2(path.join(site, 'shared/examples/parts.js'));
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

test('stl-logic: Schwindungsfaktoren (1 + s/100)³ und ², Randfälle abgesichert', () => {
  closeTo(logic.shrinkVolumeFactor(0.55), Math.pow(1.0055, 3));
  closeTo(logic.shrinkVolumeFactor(0.55), 1.016591, 1e-6);   // Bauteil ≈ 1,63 % kleiner als das Werkzeugmaß
  closeTo(logic.shrinkAreaFactor(0.55), Math.pow(1.0055, 2));
  closeTo(logic.shrinkAreaFactor(0.55), 1.011030, 1e-6);     // Kavität ≈ 1,10 % größer als das Bauteil
  /* beide beschreiben dieselbe lineare Schwindung */
  for (const s of [0.4, 0.55, 0.8]) closeTo(Math.pow(logic.shrinkAreaFactor(s), 3), Math.pow(logic.shrinkVolumeFactor(s), 2), 1e-12);
  for (const f of [logic.shrinkVolumeFactor, logic.shrinkAreaFactor]) {
    assert.equal(f(0), 1);            // kein Schwindmaß → unverändert
    assert.equal(f(-1), 1);
    assert.equal(f(NaN), 1);
    assert.equal(f(undefined), 1);
  }
  assert.ok(logic.shrinkVolumeFactor(0.65) > logic.shrinkVolumeFactor(0.45));
  assert.ok(logic.shrinkAreaFactor(0.65) > logic.shrinkAreaFactor(0.45));
});

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
  /* Werkzeugmaß: Volumenfaktor teilt alle Volumina (Masse sinkt entsprechend) */
  const f = logic.shrinkVolumeFactor(0.55);
  const shrunk = logic.roleSums(models, 2700, f);
  for (const k of Object.keys(sums)) closeTo(shrunk[k], sums[k] / f, 1e-9);
  /* unbrauchbarer Faktor → unverändert */
  for (const bad of [1, 0, -2, NaN, undefined]) {
    const r = logic.roleSums(models, 2700, bad);
    for (const k of Object.keys(sums)) closeTo(r[k], sums[k], 1e-9);
  }
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
  // → HCC-340 174 bar, HCC-800 410 bar (zu klein); ab HCC-1600 (821 bar)
  // erreichen alle den Zieldruck — empfohlen ist die kleinste davon.
  const { rows, pref } = logic.machineRows(MACHINES, clamp,
    { areaMm2: 150000, ex: 0, ey: 0, safety: 1.3, pTarget: 600 });
  assert.equal(rows.length, MACHINES.length);
  closeTo(rows[0].pK, 3400 / (100 * 0.15 * 1.3));
  assert.deepEqual(rows.map(r => r.ok), MACHINES.map(m => m.fields.force >= 600 * 100 * 0.15 * 1.3));
  assert.deepEqual(rows.slice(0, 3).map(r => r.ok), [false, false, true]);
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

test('stl-logic: sideCoreArea = A_S·tan(α), Randfälle abgesichert', () => {
  closeTo(logic.sideCoreArea(5000, 45), 5000);            // tan 45° = 1
  closeTo(logic.sideCoreArea(5000, 20), 5000 * Math.tan(20 * Math.PI / 180));
  assert.equal(logic.sideCoreArea(0, 20), 0);             // kein Schieber
  assert.equal(logic.sideCoreArea(5000, 0), 0);           // α = 0: selbsthemmend abgestützt
  assert.equal(logic.sideCoreArea(-1, 20), 0);
  assert.equal(logic.sideCoreArea(NaN, 20), 0);
  assert.ok(Number.isNaN(logic.sideCoreArea(5000, 90)));  // physikalisch sinnlos
});

test('stl-logic: keine geeignete Maschine → pref null', () => {
  // 6 m² Sprengfläche: selbst die HCC-16000 schafft nur 160 000/(100·6·1,3) ≈ 205 bar.
  const { pref } = logic.machineRows(MACHINES, clamp,
    { areaMm2: 6e6, ex: 0, ey: 0, safety: 1.3, pTarget: 600 });
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

/* ── 6 · Rechenlogik der Teilekosten-Seite ───────────────────── */

/* Beispielwerte des Kosten-Presets (shared/examples/kosten.js) mit den
   Dashboard-Default-Massen (12 kg Bauteil, 18,2 kg Schuss). */
const KOSTEN_V = {
  mpart: 12, mdose: 18.2, tz: 52, kav: 1, a: 4, oee: 78,
  pAl: 2.6, pRe: 0.35, kr: 2, eKg: 0.75, pE: 0.18,
  pM: 95, pP: 48, nP: 0.5, wz: 180000, st: 120000,
};

test('teilekosten: computeCost — Sollwerte mit den Preset-Defaults', () => {
  const r = kosten.computeCost(KOSTEN_V);
  closeTo(r.pph, 51.84);                       // 3600/52 · 0,78 · 0,96
  closeTo(r.matAlloy, 31.2);                   // 12 kg · 2,60 €/kg
  closeTo(r.matLoss, 18.2 * 0.02 * 2.6 / 0.96);
  closeTo(r.matRemelt, (6.2 + 12 * 0.04) * 0.35 / 0.96);
  closeTo(r.energyKwh, 18.2 * 0.75 / 0.96);
  closeTo(r.machine, (95 + 0.5 * 48) / 51.84);
  closeTo(r.tool, 180000 / (120000 * 0.96));
  closeTo(r.total,
    r.matAlloy + r.matLoss + r.matRemelt + r.energy + r.machine + r.tool);
  closeTo(r.total, 41.03865, 1e-4);
});

test('teilekosten: Zykluszeit-Hebel = Ableitung der Stückkosten nach t_Z', () => {
  const r = kosten.computeCost(KOSTEN_V);
  const d = 0.5;
  const fd = (kosten.costAtTz(KOSTEN_V, KOSTEN_V.tz + d)
    - kosten.costAtTz(KOSTEN_V, KOSTEN_V.tz - d)) / (2 * d);
  closeTo(r.leverTime, fd * 100, 1e-6);        // €/s → ct/s; Modell ist linear in t_Z
});

test('teilekosten: Material-Hebel = Ableitung nach Bauteilgewicht (Schuss gekoppelt)', () => {
  const r = kosten.computeCost(KOSTEN_V);
  // analytisch: p_Leg + (k_r·p_Leg + a·p_Um + e·p_E)/(1 − a)
  closeTo(r.leverMass.total,
    2.6 + (0.02 * 2.6 + 0.04 * 0.35 + 0.75 * 0.18) / 0.96);
  closeTo(r.leverMass.total,
    r.leverMass.alloy + r.leverMass.dross + r.leverMass.remelt + r.leverMass.energy);
  const d = 0.01;                              // ±10 g
  const fd = (kosten.costAtPartMass(KOSTEN_V, KOSTEN_V.mpart + d)
    - kosten.costAtPartMass(KOSTEN_V, KOSTEN_V.mpart - d)) / (2 * d);
  closeTo(r.leverMass.total, fd, 1e-6);
  // Maschine, Personal, Werkzeug hängen nicht an der Masse:
  const light = kosten.computeCost(Object.assign({}, KOSTEN_V,
    { mpart: KOSTEN_V.mpart - d, mdose: KOSTEN_V.mdose - d * KOSTEN_V.kav }));
  closeTo(light.machine, r.machine);
  closeTo(light.tool, r.tool);
});

test('teilekosten: Mehrfach-Kavität koppelt Schussgewicht je Kavität', () => {
  const v4 = Object.assign({}, KOSTEN_V, { kav: 4, mpart: 3, mdose: 18.2 });
  const d = 0.004;
  const fd = (kosten.costAtPartMass(v4, v4.mpart + d)
    - kosten.costAtPartMass(v4, v4.mpart - d)) / (2 * d);
  closeTo(kosten.computeCost(v4).leverMass.total, fd, 1e-6);
});

test('teilekosten: 100 % Ausschuss und t_Z = 0 liefern keine endlichen Kosten', () => {
  const r = kosten.computeCost(Object.assign({}, KOSTEN_V, { a: 100 }));
  assert.ok(!Number.isFinite(r.total));
  assert.ok(!Number.isFinite(r.leverMass.total));
  assert.ok(!Number.isFinite(kosten.computeCost(
    Object.assign({}, KOSTEN_V, { tz: 0 })).total));
});

/* ── 7 · Zeitleisten-Logik der Zyklusanalyse ─────────────────── */

const ZDURS = {
  dosieren: 8, schuss: 4, halten: 15, oeffnen: 5,
  entnahme: 6, spruehen: 8, schliessen: 4, neben: 2,
};

test('zyklus: layoutCycle — feste Kette, Werkzeugzustand und Zyklusende', () => {
  const r = zyklus.layoutCycle(ZDURS, []);
  assert.deepEqual(r.errors, []);
  const by = Object.fromEntries(r.items.map(i => [i.id, i]));
  assert.equal(by.schuss.start, 8);
  assert.equal(by.halten.start, 12);   // Erstarren folgt immer auf den Schuss
  assert.equal(by.oeffnen.start, 27);
  assert.equal(by.schliessen.end, 50);
  assert.equal(r.mainEnd, 52);
  assert.equal(r.total, 52);
  // Form offen zwischen Ende „öffnen" und Beginn „schließen"
  assert.deepEqual(r.die, { openStart: 27, open: 32, closeStart: 46, closed: 50 });
});

test('zyklus: Parallelvorgänge ankern am Phasenbeginn, klemmen bei 0, strecken den Zyklus', () => {
  const r = zyklus.layoutCycle(ZDURS, [
    { label: 'Kernzüge einfahren', track: 'kern', anchor: 'schliessen', lag: -3, dur: 3 },
    { label: 'Früh', track: 'cooling', anchor: 'start', lag: -10, dur: 2 },
    { label: 'Nachlauf', track: 'cooling', anchor: 'mainEnd', lag: 0, dur: 4 },
  ]);
  assert.deepEqual(r.errors, []);
  const kern = r.items.find(i => i.label === 'Kernzüge einfahren');
  assert.equal(kern.start, 43);
  assert.equal(kern.end, 46);          // endet genau am Beginn „Form schließen"
  assert.equal(r.items.find(i => i.label === 'Früh').start, 0);  // Versatz vor Zyklusstart gekappt
  assert.equal(r.mainEnd, 52);
  assert.equal(r.total, 56);           // Nachlauf streckt den Zyklus
});

test('zyklus: unbekannter Bezugspunkt und ungültige Dauer → Fehler, endliche Lagen', () => {
  const r = zyklus.layoutCycle(Object.assign({}, ZDURS, { halten: -5 }), [
    { label: 'X', track: 'handling', anchor: 'gibtsnicht', lag: 0, dur: 2 },
  ]);
  assert.equal(r.errors.length, 1);
  assert.equal(r.items.find(i => i.label === 'X').start, 0);
  const by = Object.fromEntries(r.items.map(i => [i.id, i]));
  assert.equal(by.halten.dur, 0);      // ungültige Dauer zählt als 0
  assert.equal(by.oeffnen.start, 12);  // Kette rückt nach
  r.items.forEach(i => assert.ok(Number.isFinite(i.start) && Number.isFinite(i.end)));
});
