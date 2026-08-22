/* Organisations-Presets (web/shared/orgpresets.js): Überlagerung der
   Beispiel-Presets, Kosten-Mischung, Vergleich.
     node --test tests/web/orgpresets.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const O = require(path.join(site, 'shared/orgpresets.js'));

function globals() {
  const g = {};
  const load = f => { const prev = globalThis.window; globalThis.window = g; require(path.join(site, f)); globalThis.window = prev; };
  delete require.cache[require.resolve(path.join(site, 'shared/examples/machines.js'))];
  ['shared/examples/machines.js', 'shared/examples/alloys.js', 'shared/examples/parts.js', 'shared/examples/kosten.js'].forEach(f => { delete require.cache[require.resolve(path.join(site, f))]; load(f); });
  return g;
}

test('apply: Listen der Organisation ersetzen die Beispiel-Listen, fehlende Schlüssel bleiben', () => {
  const g = globals();
  const nBefore = g.__MACHINES__.machines.length;
  const applied = O.apply({ machines: { data: [{ id: 'm1', name: 'Unsere', fields: { force: 9000 } }] } }, g);
  assert.deepEqual(applied, ['machines']);
  assert.equal(g.__MACHINES__.machines.length, 1);
  assert.equal(g.__MACHINES__.machines[0].fields.force, 9000);
  assert.equal(g.__MACHINES__.source, 'org');
  assert.ok(g.__ALLOYS__.alloys.length > 1, 'Legierungen unverändert');
  assert.ok(nBefore > 1);
});

test('apply: leere Liste zählt nicht, Kosten werden gemischt', () => {
  const g = globals();
  const applied = O.apply({ machines: { data: [] }, kosten: { data: { pAl: 3.1 } } }, g);
  assert.deepEqual(applied, ['kosten']);
  assert.equal(g.__KOSTEN__.defaults.pAl, 3.1);
  assert.equal(g.__KOSTEN__.defaults.pE, 0.18, 'nicht gesetzte Schlüssel bleiben Beispielwerte');
  assert.ok(g.__MACHINES__.machines.length > 1);
});

test('apply: Unsinn wird ignoriert', () => {
  const g = globals();
  assert.deepEqual(O.apply(null, g), []);
  assert.deepEqual(O.apply({ machines: 'x', kosten: 5 }, g), []);
});

test('same: vergleicht nur die Daten, nicht updated_at', () => {
  const a = { machines: { data: [{ id: 'a' }], updated_at: '1' } };
  const b = { machines: { data: [{ id: 'a' }], updated_at: '2' } };
  const c = { machines: { data: [{ id: 'b' }], updated_at: '2' } };
  assert.ok(O.same(a, b));
  assert.ok(!O.same(a, c));
  assert.ok(O.same(null, undefined));
  assert.ok(!O.same(a, null));
});
