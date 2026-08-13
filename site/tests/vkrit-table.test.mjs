/* CFD-Tabelle der kritischen Kolbengeschwindigkeit: vCrit() muss an jedem
   Stützpunkt exakt die Simulationswerte aus site/assets/v_krit_sim.csv
   reproduzieren (Tabelle und CSV dürfen nicht auseinanderlaufen — nach
   CSV-Änderungen: node site/tools/gen-vkrit-table.mjs). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { vCrit, vCritTheory, vCritNogowizin } = await import(path.join(site, 'app/js/core/physics.js'));

const rows = readFileSync(path.join(site, 'assets/v_krit_sim.csv'), 'utf8')
  .trim().split('\n').slice(1).map(l => l.split(';').map(Number));

test('vkrit: Tabellen-Interpolation trifft jeden CSV-Stützpunkt', () => {
  assert.ok(rows.length > 100, 'CSV unerwartet klein');
  for (const [Dmm, phi, V] of rows) {
    const got = vCrit(Dmm / 1000, phi);
    assert.ok(Math.abs(got - V) <= 1e-4 * Math.max(1, V),
      `D=${Dmm} φ=${phi}: vCrit=${got}, CSV=${V}`);
  }
});

test('vkrit: monoton in D (Bisektionen in phild/slowshot setzen das voraus)', () => {
  for (const phi of [0.1, 0.3, 0.5, 0.7, 0.85, 0.9]) {
    let prev = 0;
    for (let Dmm = 40; Dmm <= 340; Dmm += 5) {
      const v = vCrit(Dmm / 1000, phi);
      assert.ok(v >= prev - 1e-12, `nicht monoton bei φ=${phi}, D=${Dmm}`);
      prev = v;
    }
  }
});

test('vkrit: Randregeln — φ<0,1 konstant, φ>0,9 läuft auf 0, φ=1 → 0', () => {
  assert.ok(Math.abs(vCrit(0.15, 0.05) - vCrit(0.15, 0.1)) < 1e-12);
  assert.ok(vCrit(0.15, 0.95) < vCrit(0.15, 0.9));
  assert.ok(vCrit(0.15, 1) === 0);
});

test('vkrit: Referenzmodelle bleiben verfügbar und plausibel', () => {
  /* Theorie oberhalb der CFD ab mittleren Füllgraden (Brechen vor Decke) */
  assert.ok(vCritTheory(0.15, 0.6) > vCrit(0.15, 0.6));
  assert.ok(vCritNogowizin(0.15, 0.5) > 0);
});
