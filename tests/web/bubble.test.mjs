/* Luftblase unter Nachdruck: p_vor ist der Luftdruck beim FÜLLENDE, nicht die
   letzte Probe der Simulation. Am Ende des Abtastfensters ist das
   Restluftvolumen fast null und das Vakuum-Modell fällt auf Umgebungsdruck
   zurück — diese Probe als p_vor zu nehmen, machte „mit Vakuum" und „ohne
   Vakuum" zu zwei identischen Kurven (C-7).
     node --test tests/web/bubble.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

globalThis.window = globalThis;
/* Die klassischen Globals, die die ES-Module des Dashboards voraussetzen. */
require(path.join(site, 'shared/palette.js'));
require(path.join(site, 'shared/theme.js'));
require(path.join(site, 'shared/examples/machines.js'));
require(path.join(site, 'shared/project.js'));

const { vacPressure, ratio } = await import('../../web/tools/auslegung/js/charts/bubble.js');
const { sim } = await import('../../web/tools/auslegung/js/core/simstore.js');

/* Gemessene Endprobe der Dashboard-Defaults mit conductance-Modell. */
const SAMPLES = {
  p_air_mbar: [1013.25, 400.0, 120.0, 85.11, 84.67, 83.93, 82.47, 80.0, 1013.25],
  part_fill: [0, 0.2, 0.7, 0.95, 0.9968, 1.0, 1.0, 1.0, 1.0]
};

test('vacPressure liest den Luftdruck beim Füllende, nicht die letzte Probe', () => {
  sim.data = { samples: SAMPLES };
  const p = vacPressure({ vacModel: 'conductance' });
  assert.equal(p, 0.08393, 'erste Probe mit part_fill ≥ 1');
  assert.notEqual(p, 1.01325, 'nicht der Umgebungsdruck der letzten Probe');
});

test('vacPressure: ohne Vakuum-Modell und ohne Simulation → null', () => {
  sim.data = { samples: SAMPLES };
  assert.equal(vacPressure({ vacModel: 'aus' }), null);
  assert.equal(vacPressure({}), null);
  sim.data = null;
  assert.equal(vacPressure({ vacModel: 'conductance' }), null);
});

test('vacPressure: ohne part_fill bleibt es bei der letzten brauchbaren Probe', () => {
  sim.data = { samples: { p_air_mbar: [1013.25, 500, 90] } };
  assert.equal(vacPressure({ vacModel: 'conductance' }), 0.09);
  /* Kavität wird nie voll → kein Füllende, Rückfall */
  sim.data = { samples: { p_air_mbar: [1013.25, 500, 90], part_fill: [0, 0.3, 0.8] } };
  assert.equal(vacPressure({ vacModel: 'conductance' }), 0.09);
});

test('ratio: mit dem korrekten p_vor schrumpft die Blase spürbar stärker', () => {
  const v = { Tliq: 600, Tdie: 200 };
  const mitVakuum = ratio(v, 800, 0.08393);
  const alsUmgebung = ratio(v, 800, 1.01325);
  assert.ok(mitVakuum > alsUmgebung * 2,
    `Vakuum muss durchschlagen: ${mitVakuum.toFixed(2)} vs. ${alsUmgebung.toFixed(2)}`);
});
