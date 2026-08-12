/* Physik-Fixtures (fixtures/physics/*.json) gegen die Dashboard-Physik:
   dieselben Dateien prüft backend/tests/test_physics_fixtures.py gegen
   hpdcsim — weicht eine Seite von den Sollwerten ab, ist die Implementierung
   auseinandergelaufen.  Aufruf: node --test site/tests/physics-fixtures.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { computeShot } from '../app/js/core/physics.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixDir = path.join(root, 'fixtures', 'physics');
const files = readdirSync(fixDir).filter(f => f.endsWith('.json')).sort();
assert.ok(files.length > 0, 'keine Fixtures in fixtures/physics gefunden');

/* Ereignis-Reihenfolge in computeShot: 0 Kammer voll, 1 Anguss gefüllt,
   2 Bauteil gefüllt, 3 Überlauf gefüllt (= Füllende). */
function quantities(r) {
  return {
    phi: r.phi,
    s_fill_mm: r.sFill * 1000,
    biscuit_mm: r.biscLen * 1000,
    fill_complete_mm: r.totalStroke * 1000,
    v_crit: r.vcrit,
    v_slow_max: r.vSlow,
    t_sleeve_full_s: r.events[0].t,
    v_sleeve_full: r.events[0].v,
    t_part_full_s: r.events[2].t,
    gate_v_part_full: r.events[2].gv,
    fill_time_ms: r.fill
  };
}

for (const file of files) {
  const fx = JSON.parse(readFileSync(path.join(fixDir, file), 'utf8'));
  test(`physik-fixture ${fx.name}: physics.js trifft die Sollwerte`, () => {
    const r = computeShot(fx.inputs.values, fx.inputs.curve);
    assert.ok(!r.error, `computeShot meldet: ${r.error}`);
    const got = quantities(r);
    for (const [key, exp] of Object.entries(fx.expected)) {
      assert.ok(key in got, `unbekannte Fixture-Größe „${key}"`);
      const g = got[key];
      assert.ok(Number.isFinite(g), `${key}: kein endlicher Wert (${g})`);
      const tol = exp.rtol * Math.max(1, Math.abs(exp.value));
      assert.ok(Math.abs(g - exp.value) <= tol,
        `${key}: erwartet ${exp.value}, erhalten ${g} (rtol ${exp.rtol})`);
    }
  });
}
