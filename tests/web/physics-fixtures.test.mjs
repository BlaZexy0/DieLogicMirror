/* Physik-Fixtures (fixtures/physics/*.json) gegen BEIDE Rechenwege des
   Dashboards: die Auslegung (core/physics.js, computeShot) und die
   Luftsimulation (core/airsim/, eigene Kinematik in SI). Beide leiten Hübe,
   Zeiten und Anschnittgeschwindigkeit unabhängig voneinander her — weicht
   eine Seite von den Sollwerten ab, sind sie auseinandergelaufen.
   Aufruf: node --test tests/web/physics-fixtures.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { computeShot } from '../../web/tools/auslegung/js/core/physics.js';
import { processConfigFromDesign } from '../../web/tools/auslegung/js/core/airsim/config.js';
import { createShotProcess } from '../../web/tools/auslegung/js/core/airsim/process.js';

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
    biscuit_mm: r.biscLiquid * 1000,          // Schmelzerest beim Füllende (= biscuitLength der Luftsimulation)
    fill_complete_mm: r.totalStroke * 1000,
    v_crit: r.vcrit,
    v_slow_max: r.v1,
    t_sleeve_full_s: r.events[0].t,
    v_sleeve_full: r.events[0].v,
    t_part_full_s: r.events[2].t,
    gate_v_part_full: r.events[2].gv,
    fill_time_ms: r.fill
  };
}

/* Dieselben Größen aus dem Prozess der Luftsimulation. */
function airsimQuantities(proc) {
  const m = proc.motion;
  const sFill = proc.sleeveFullStroke;
  const slow = m.positions.map((s, i) => (s <= sFill ? m.velocities[i] : -Infinity));
  /* Beim Kappen endet das Profil 1 µm vor dem Füllende — dort auswerten. */
  const fillEnd = Math.min(proc.fillCompleteStroke, m.endPosition);
  return {
    phi: proc.phi,
    s_fill_mm: sFill * 1000,
    biscuit_mm: proc.biscuitLength * 1000,
    fill_complete_mm: proc.fillCompleteStroke * 1000,
    v_crit: proc.criticalVelocity,
    v_slow_max: Math.max(...slow, m.sampleAtPosition(sFill).velocity),
    t_sleeve_full_s: m.sampleAtPosition(sFill).time,
    v_sleeve_full: m.sampleAtPosition(sFill).velocity,
    t_part_full_s: m.sampleAtPosition(proc.partFullStroke).time,
    gate_v_part_full: proc.stateAtStroke(proc.partFullStroke).gateVelocity,
    fill_time_ms: (m.sampleAtPosition(fillEnd).time - m.sampleAtPosition(proc.runnerFullStroke).time) * 1000
  };
}

function check(got, expected) {
  for (const [key, exp] of Object.entries(expected)) {
    assert.ok(key in got, `unbekannte Fixture-Größe „${key}"`);
    const g = got[key];
    assert.ok(Number.isFinite(g), `${key}: kein endlicher Wert (${g})`);
    const tol = exp.rtol * Math.max(1, Math.abs(exp.value));
    assert.ok(Math.abs(g - exp.value) <= tol,
      `${key}: erwartet ${exp.value}, erhalten ${g} (rtol ${exp.rtol})`);
  }
}

for (const file of files) {
  const fx = JSON.parse(readFileSync(path.join(fixDir, file), 'utf8'));
  test(`physik-fixture ${fx.name}: physics.js trifft die Sollwerte`, () => {
    const r = computeShot(fx.inputs.values, fx.inputs.curve);
    assert.ok(!r.error, `computeShot meldet: ${r.error}`);
    check(quantities(r), fx.expected);
  });
  test(`physik-fixture ${fx.name}: die Luftsimulation trifft die Sollwerte`, () => {
    const { config, meta } = processConfigFromDesign(fx.inputs.values, fx.inputs.curve);
    const proc = createShotProcess(config);
    check(airsimQuantities(Object.assign(proc, { phi: meta.phi })), fx.expected);
  });
}
