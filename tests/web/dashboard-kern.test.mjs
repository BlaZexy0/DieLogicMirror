/* Dashboard-Kern: drei HIGH-Befunde, die falsche Zahlen ANZEIGEN, ohne dass
   etwas rot wird.

     H-12  „flüssig am Füllende" zeigte die Flüssigsäule der Pressrestmasse
           statt des Schmelzerests in der Kammer — Faktor ~2,4.
     H-13  Ein Preset ohne densitySolid/shrink rechnet still mit Aluminium
           weiter, egal welche Legierung gewählt ist.
     H-14  Ein einziger Wegpunkt bei s = 0 lieferte NaN-Proben statt eines
           Fehlers.

     node --test tests/web/dashboard-kern.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/examples/alloys.js', 'shared/project.js', 'shared/clampmodel.js']) require(path.join(site, f));

const { allFields, groups, PRESET_DOMAINS, DEFAULT_CURVE } =
  await import(pathToFileURL(path.join(site, 'tools/auslegung/js/config/fields.js')));
const Ph = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/physics.js')));

const defaults = () => { const v = {}; for (const f of allFields()) v[f.key] = f.def; return v; };

/* ── H-14 ─────────────────────────────────────────────────────────────── */

test('buildProfile: ein Wegpunkt bei s = 0 ist ein Fehler, keine NaN-Kurve', () => {
  assert.throws(() => Ph.buildProfile([[0, 4]]), /mindestens einen Wegpunkt/);
  assert.throws(() => Ph.buildProfile([]), /Keine gültigen Kurvenpunkte/);
  assert.throws(() => Ph.buildProfile([[NaN, 4], [Infinity, 2]]), /Keine gültigen Kurvenpunkte/);

  /* Ein Punkt bei s > 0 bleibt gültig — der Nullpunkt wird ergänzt. */
  const prof = Ph.buildProfile([[300, 4]]);
  assert.equal(prof.travel, 0.3);
  const sm = prof.samples(5);
  for (const key of ['t', 's', 'v', 'a']) {
    assert.ok(sm[key].length > 1, `Reihe ${key} ist leer`);
    assert.ok(sm[key].every(Number.isFinite), `NaN in Reihe ${key}`);
  }
});

/* ── H-12 ─────────────────────────────────────────────────────────────── */

test('biscLiquid: Schmelzerest am Füllende ist nicht die Säule der Pressrestmasse', () => {
  const v = defaults();
  const shot = Ph.computeShot(v, DEFAULT_CURVE.map(p => p.slice()));
  assert.ok(!shot.error, shot.error);

  const rest = shot.biscLiquid * 1000;           // L − Gesamthub
  const saeule = Ph.travel(v.biscuit, v);        // Flüssigsäule der Pressrestmasse
  assert.ok(rest > 1.8 * saeule,
    `die beiden Größen dürfen nicht verwechselt werden: ${rest.toFixed(2)} vs ${saeule.toFixed(2)} mm`);

  /* Der Nachverdichtungshub setzt auf dem Schmelzerest auf — die KPI muss
     dieselbe Größe zeigen, sonst widersprechen sich zwei Zeilen derselben
     Karte. */
  const biscLen = Ph.biscuitSolid(v);
  assert.ok(Math.abs((rest - biscLen) - shot.intens * 1000) < 1e-6,
    'intens = biscLiquid − biscLen muss mit der angezeigten Größe aufgehen');
});

test('die Kammer-KPI zeigt den Schmelzerest, nicht die Pressrestsäule (H-12)', async () => {
  /* renderKpis schreibt innerHTML — ein Objekt mit dieser einen Eigenschaft
     genügt, um den erzeugten Text zu lesen. */
  const stubs = [];
  globalThis.document = {
    getElementById: () => null,
    querySelectorAll: () => [],
  };
  const { renderKpis } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/ui/kpis.js')));

  const v = defaults();
  const shot = Ph.computeShot(v, DEFAULT_CURVE.map(p => p.slice()));
  const el = { innerHTML: '', closest: () => null, querySelectorAll: () => [] };
  renderKpis(el, v, shot, null);

  const m = el.innerHTML.match(/flüssig am Füllende ([\d.,]+) mm/);
  assert.ok(m, 'die KPI-Zeile fehlt im gerenderten Text');
  const shown = Number(m[1].replace(/\./g, '').replace(',', '.'));
  const rest = shot.biscLiquid * 1000;
  assert.ok(Math.abs(shown - rest) < 0.05,
    `angezeigt ${shown} mm, richtig wäre der Schmelzerest ${rest.toFixed(2)} mm`);
  assert.ok(Math.abs(shown - Ph.travel(v.biscuit, v)) > 1,
    'angezeigt wurde vorher die Flüssigsäule der Pressrestmasse');
  stubs.length = 0;
});

/* ── H-13 ─────────────────────────────────────────────────────────────── */

test('Preset-Lücke: densitySolid/shrink verschieben jeden Kavitätshub', () => {
  const base = defaults();
  const voll = Object.assign({}, base, { density: 1650, densitySolid: 1810, shrink: 0.6 });
  const luecke = Object.assign({}, base, { density: 1650 });   // Felddefaults bleiben stehen

  const a = Ph.cavityTravel(Ph.total(voll), voll);
  const b = Ph.cavityTravel(Ph.total(luecke), luecke);
  assert.ok(Math.abs(a - b) / a > 0.2,
    `die Lücke ist folgenreich, nicht kosmetisch: ${a.toFixed(1)} vs ${b.toFixed(1)} mm`);
  assert.equal(luecke.densitySolid, base.densitySolid, 'ohne Preset-Wert gilt der Aluminium-Default');
});

test('Preset-Zusammenfassung benennt die Felder, die ein Preset nicht setzt', async () => {
  /* summaryHTML ist modulintern; geprüft wird die Regel, auf der sie fußt:
     zu jeder Preset-Domäne gehört genau eine Feldgruppe, und deren Schlüssel
     sind die, die ein Preset setzen sollte. */
  for (const dom of PRESET_DOMAINS) {
    const g = groups.find(x => x.preset === dom.id);
    assert.ok(g, `zur Domäne ${dom.id} fehlt die Feldgruppe`);
    assert.ok(g.fields.length, `Feldgruppe ${g.id} ist leer`);
  }
  const alloy = PRESET_DOMAINS.find(d => d.id === 'alloy');
  const keys = groups.find(x => x.preset === alloy.id).fields.map(f => f.key);
  assert.ok(keys.includes('densitySolid') && keys.includes('shrink'),
    'genau diese beiden Schlüssel fehlten in Org-Presets unbemerkt');

  /* Die mitgelieferten Beispiel-Presets müssen vollständig sein — sonst
     wäre die Warnung schon im Auslieferungszustand zu sehen. */
  for (const p of window.__ALLOYS__.alloys) {
    const missing = keys.filter(k => p.fields[k] == null);
    assert.deepEqual(missing, [], `Beispiel-Preset „${p.name}" setzt ${missing.join(', ')} nicht`);
  }
});
