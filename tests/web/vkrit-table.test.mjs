/* CFD-Tabelle der kritischen Kolbengeschwindigkeit: vCrit() muss an jedem
   Stützpunkt exakt die Simulationswerte aus fixtures/vkrit/v_krit_sim.csv
   reproduzieren (Tabelle und CSV dürfen nicht auseinanderlaufen — nach
   CSV-Änderungen: node scripts/gen-vkrit-table.mjs). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const { vCrit, vCritTheory, vCritNogowizin } = await import(path.join(site, 'tools/auslegung/js/core/physics.js'));

const rows = readFileSync(path.join(site, '../fixtures/vkrit/v_krit_sim.csv'), 'utf8')
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

test('vkrit: unter Ø 60 mm wird auf der sicheren Seite extrapoliert', () => {
  /* f steigt mit D. Unter dem kleinsten Tabellen-Ø wurde früher geklemmt —
     das meldete ein zu HOHES v_krit, also die unsichere Richtung. */
  const v60 = vCrit(0.060, 0.5);
  for (const D of [0.050, 0.040, 0.030]) {
    const v = vCrit(D, 0.5);
    assert.ok(v > 0 && v < v60, 'Ø ' + D * 1000 + ' mm: ' + v + ' muss unter dem 60-mm-Wert liegen');
    /* Konservativ heißt: unter dem, was reines Klemmen liefern würde. */
    const geklemmt = Math.sqrt(9.81 * D) * (v60 / Math.sqrt(9.81 * 0.060));
    assert.ok(v <= geklemmt + 1e-12, 'die Extrapolation darf nicht über dem Klemmwert liegen');
  }
});

test('vkrit: die Physik-Fixtures verlangen den exakten Wert', () => {
  /* Die Tabelle wird mit g = 9,81 normiert und muss mit derselben Konstante
     entnormiert werden. Eine zweite Implementierung nahm einmal 9,80665;
     die Fixtures lockerten daraufhin ihre Toleranz auf 1e-3 und verdeckten
     die Abweichung, statt sie zu melden. */
  const dir = path.join(site, '../fixtures/physics');
  for (const f of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const vc = JSON.parse(readFileSync(path.join(dir, f), 'utf8')).expected.v_crit;
    if (vc) assert.ok(vc.rtol <= 1e-9, f + ': die Toleranz verdeckt wieder eine Abweichung');
  }
});
