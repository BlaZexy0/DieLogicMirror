/* Die Luftsimulation im Browser (web/tools/auslegung/js/core/airsim/) gegen
   die Referenzfälle des früheren Python-Pakets hpdcsim (fixtures/airsim/,
   siehe README dort): jede Reihe, jedes Ereignis, jede Ablehnung.

   Verglichen wird elementweise und nur die ERSTE Abweichung gemeldet —
   nie ganze Reihen mit assert.deepEqual: der Diff eines fehlschlagenden
   Vergleichs großer Arrays frisst den Arbeitsspeicher. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { simulateAir, SimError } from '../../web/tools/auslegung/js/core/airsim/simulate.js';
import { createShotProcess } from '../../web/tools/auslegung/js/core/airsim/process.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures', 'airsim');
const load = file => JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
const files = readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const invalid = files.filter(f => f.startsWith('invalid--'));
const layer = files.filter(f => f.startsWith('layer--'));
const valid = files.filter(f => !f.startsWith('invalid--') && !f.startsWith('layer--'));

/* Übereinstimmung mit der Python-Referenz: relativ 1e-8, absolut 1e-12 für
   Werte nahe null. */
const RTOL = 1e-8, ATOL = 1e-12;

/* '' wenn die Zahlen übereinstimmen, sonst was abweicht. */
function differs(got, want, where) {
  if (want === null || got === null || got === undefined) {
    return got === want ? '' : where + ': erhalten ' + got + ', erwartet ' + want;
  }
  const diff = Math.abs(got - want);
  return diff <= ATOL + RTOL * Math.abs(want) ? ''
    : where + ': erhalten ' + got + ', erwartet ' + want + ' (rel ' + diff / Math.abs(want) + ')';
}
function firstMismatch(got, want, where) {
  if (!Array.isArray(got)) return where + ': fehlt';
  if (got.length !== want.length) return where + ': ' + got.length + ' Werte, erwartet ' + want.length;
  for (let i = 0; i < want.length; i++) {
    const d = differs(got[i], want[i], where + '[' + i + ']');
    if (d) return d;
  }
  return '';
}

const run = fx => simulateAir(fx.inputs.values, fx.inputs.curve, fx.inputs.count ?? undefined);

test('airsim: die Matrix der Referenzfälle ist vollständig', () => {
  assert.ok(valid.length >= 70, valid.length + ' gültige Fälle');
  assert.ok(invalid.length >= 20, invalid.length + ' abgelehnte Fälle');
  assert.ok(layer.length >= 3, layer.length + ' Schicht-Fälle');
  for (const fixture of ['standard-auslegung', 'konstante-geschwindigkeit', 'feststoffdichte', 'zweiphasen-rampe']) {
    for (const model of ['aus', 'ideal-', 'conductance-', 'tank-']) {
      assert.ok(valid.some(f => f.startsWith(fixture + '--' + model)), fixture + ' × ' + model);
    }
  }
});

for (const file of valid) {
  test('airsim: ' + file.replace('.json', ''), () => {
    const fx = load(file);
    const r = run(fx);
    const want = fx.expected;

    for (const [key, value] of Object.entries(want.meta)) {
      if (typeof value === 'number') assert.equal(differs(r.meta[key], value, 'meta.' + key), '');
      else assert.equal(r.meta[key], value, 'meta.' + key);
    }

    assert.equal(Object.keys(r.samples).sort().join(), Object.keys(want.samples).sort().join(), 'Kanäle');
    for (const [channel, series] of Object.entries(want.samples)) {
      assert.equal(firstMismatch(r.samples[channel], series, channel), '');
    }

    assert.equal(r.events.map(e => e.id).join(), want.events.map(e => e.id).join(), 'Ereignisfolge');
    want.events.forEach((e, i) => {
      assert.equal(differs(r.events[i].t, e.t, e.id + '.t'), '');
      assert.equal(differs(r.events[i].s_mm, e.s_mm, e.id + '.s_mm'), '');
    });

    if (want.critical_crossing === null) assert.equal(r.critical_crossing, null);
    else {
      assert.ok(r.critical_crossing, 'kritischer Übergang fehlt');
      for (const k of ['s_mm', 't', 'v']) {
        assert.equal(differs(r.critical_crossing[k], want.critical_crossing[k], 'critical_crossing.' + k), '');
      }
    }
  });
}

/* ── Eingaben, die die Referenz ablehnt ──
   Die Meldungen sind die der Referenz, Wort für Wort — bis auf jene, die
   das Python-Paket beim Namen nannten, auf Englisch aus dem Paket kamen
   oder einen Schlüssel der früheren HTTP-Schnittstelle trugen. */
const REWORDED = {
  'invalid--biscuit-zero.json': 'Pressrestgewicht muss > 0 sein.',
  'invalid--runner-zero.json': 'Angussgewicht muss > 0 sein.',
  'invalid--curve-dead-segment.json': /Abschnitt steht an beiden Enden still/,
  'invalid--duration-too-short.json': /Ventil-Offenzeit zu kurz/,
  'invalid--missing-pump-pressure.json': 'Eingabe \'vacPump\' fehlt oder ist keine Zahl.'
};

for (const file of invalid) {
  test('airsim: abgelehnt — ' + file.replace('.json', '').replace('invalid--', ''), () => {
    const fx = load(file);
    let error = null;
    try { run(fx); } catch (e) { error = e; }
    assert.ok(error instanceof SimError, 'kein SimError: ' + (error && error.stack || 'lief durch'));
    const want = REWORDED[file] ?? fx.expected.error.message;
    if (want instanceof RegExp) assert.match(error.message, want);
    else assert.equal(error.message, want);
  });
}

test('airsim: jede Umformulierung gehört zu einem vorhandenen Fall', () => {
  for (const file of Object.keys(REWORDED)) assert.ok(invalid.includes(file), file);
});

/* ── Löserpfade, die das Dashboard nicht erreicht (Fläche der Einfüll-
   öffnung, Entlüftung gegen Umgebung, Tank mit Pumpe, eigene Umgebung) ── */

const channel = c => (c ? { gap: c.gap, length: c.length, entryLoss: c.entry_loss, roughness: c.roughness } : null);
const opening = (area, c) => ({ area: area ?? null, channel: channel(c) });

function processConfig(py) {
  const m = py.vacuum.model;
  const model = m.type === 'tank'
    ? {
      type: 'tank', tankVolume: m.tank_volume, tankPressure: m.tank_pressure, pumpSpeed: m.pump_speed,
      ultimatePressure: m.ultimate_pressure, dischargeCoefficient: m.discharge_coefficient
    }
    : { type: 'conductance', pumpPressure: m.pump_pressure, dischargeCoefficient: m.discharge_coefficient };
  return {
    sleeve: {
      diameter: py.sleeve.diameter, length: py.sleeve.length, fillFraction: py.sleeve.fill_fraction,
      pourHolePosition: py.sleeve.pour_hole_position, pourHoleArea: py.sleeve.pour_hole_area
    },
    casting: {
      runnerVolume: py.casting.runner.volume, gateArea: py.casting.runner.gate_area,
      partVolume: py.casting.part.volume, overflowVolume: py.casting.overflow.volume,
      vent: opening(py.casting.vent_area, py.casting.vent_channel)
    },
    motion: py.motion,
    dosingTime: py.process.dosing_time,
    dwellTime: py.process.dwell_time,
    environment: {
      ambientPressure: py.environment?.ambient_pressure,
      ambientTemperature: py.environment?.ambient_temperature
    },
    vacuum: {
      startPosition: py.vacuum.start_position, endPosition: py.vacuum.end_position, duration: py.vacuum.duration,
      valve: opening(py.vacuum.valve_area, py.vacuum.valve_channel), model
    }
  };
}

for (const file of layer) {
  test('airsim: Löser — ' + file.replace('.json', '').replace('layer--', ''), () => {
    const golden = load(file);
    const process = createShotProcess(processConfig(golden.inputs.config));
    const solution = process.airSolution();
    const want = golden.expected;
    assert.equal(solution.time.length, want.count);
    assert.equal(process.valve.endPosition, want.vacuum_end_position);

    for (const [name, got, expected] of [
      ['time', solution.time, want.time],
      ['pressure', solution.pressure, want.pressure],
      ['tank_pressure', solution.tankPressure, want.tank_pressure]
    ]) {
      assert.equal(got === undefined, expected === undefined, name + ' veröffentlicht');
      if (!got || !expected) continue;
      want.index.forEach((at, k) => {
        const w = expected[k], g = got[at];
        const ok = w === null ? !Number.isFinite(g) : Math.abs(g - w) <= ATOL + RTOL * Math.abs(w);
        assert.ok(ok, name + '[' + at + ']: erhalten ' + g + ', erwartet ' + w);
      });
    }
  });
}

test('airsim: eine Simulation bleibt weit unter einem Bild', () => {
  /* Sie läuft synchron bei jeder Eingabe (core/simstore.js). Das teuerste
     Modell — Tank hinter einem Kanal mit Wandreibung — muss das hergeben. */
  const fx = load('standard-auslegung--tank-channel-fill.json');
  const values = fx.inputs.values, curve = fx.inputs.curve;
  simulateAir(values, curve);   // warm
  const t0 = performance.now();
  for (let i = 0; i < 5; i++) simulateAir(values, curve);
  const ms = (performance.now() - t0) / 5;
  assert.ok(ms < 100, ms.toFixed(1) + ' ms je Simulation');
});
