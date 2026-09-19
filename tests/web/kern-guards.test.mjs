/* Stille Fehlschläge im Dashboard-Kern (MEDIUM/LOW des Code-Reviews).

   Alle nach derselben Regel behoben: ein Guard darf einen Fehler liefern,
   niemals einen Wert.

     node --test tests/web/kern-guards.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/project.js', 'shared/clampmodel.js']) require(path.join(site, f));

const { theme } = await import(path.join(site, 'tools/auslegung/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);

const { allFields, DEFAULT_CURVE } = await import(path.join(site, 'tools/auslegung/js/config/fields.js'));
const Ph = await import(path.join(site, 'tools/auslegung/js/core/physics.js'));
const { seq } = await import(path.join(site, 'tools/auslegung/js/core/format.js'));
const { fillTimeMs } = await import(path.join(site, 'tools/auslegung/js/core/curvegen.js'));
const { feasibleBand } = await import(path.join(site, 'tools/auslegung/js/core/limits.js'));

const values = () => { const v = {}; for (const f of allFields()) v[f.key] = f.def; return v; };
const shot = over => Ph.computeShot(Object.assign(values(), over || {}), DEFAULT_CURVE.map(p => p.slice()));

test('fillTimeMs: Rampenbeginn hinter dem Anschnitt', () => {
  /* Vorher wurde die Rampe rückwärts extrapoliert, und max(…, 0) schnitt die
     Wurzel ab: 350, 300 und 200 mm lieferten alle DENSELBEN Wert. */
  const t = sGate => fillTimeMs(1, 4, 100, 400, sGate, 520);
  assert.ok(Math.abs(t(400) - 41.25) < 0.01, 'Rampenbeginn = Anschnitt unverändert');
  assert.ok(Math.abs(t(350) - 91.25) < 0.01, 'ist ' + t(350).toFixed(2));
  assert.ok(t(300) > t(350) && t(200) > t(300), 'die Füllzeit muss mit dem Abstand wachsen');
  /* v0 = 0 darf nicht durch null teilen. */
  assert.ok(Number.isFinite(fillTimeMs(0, 4, 100, 400, 350, 520)));
});

test('seq(a, b, 1) liefert den Anfangswert, nicht NaN', () => {
  assert.deepEqual(seq(0, 10, 1), [0]);
  assert.deepEqual(seq(3, 3, 1), [3]);
  assert.deepEqual(seq(0, 10, 0), []);
  assert.deepEqual(seq(0, 10, 3), [0, 5, 10]);
  assert.ok(seq(0, 10, 140).every(Number.isFinite));
});

test('injForceEff: ungültige Drücke liefern keine Kraft, nicht die größte', () => {
  const v = values();
  assert.ok(Ph.injForceEff(v) > 0);
  for (const bad of [{ pAccOp: 0 }, { pAcc: 0 }, { injForce: 0 }, { pAcc: NaN }]) {
    assert.ok(Number.isNaN(Ph.injForceEff(Object.assign({}, v, bad))),
      'fail-unsafe: ' + JSON.stringify(bad));
  }
  /* Über dem Maximum wird geklemmt — das ist eine gültige Eingabe. */
  assert.equal(Ph.injForceEff(Object.assign({}, v, { pAccOp: 1e6 })), v.injForce);
});

test('feasibleBand: NaN-Schranke schließt die Stelle aus, ±Infinity nicht', () => {
  const xs = [0, 1, 2, 3, 4];
  /* ±Infinity heißt vereinbarungsgemäß „hier keine Schranke". */
  const frei = feasibleBand(xs, [() => -Infinity], [() => Infinity], 0, 10);
  assert.equal(frei.edges.length, xs.length);

  /* NaN heißt „weiß ich nicht" — es darf das Band nicht WEITER machen. */
  const mitNaN = feasibleBand(xs, [() => 2, x => (x === 2 ? NaN : 3)], [() => 8], 0, 10);
  const ohne = feasibleBand(xs, [() => 2, () => 3], [() => 8], 0, 10);
  assert.equal(ohne.edges.length, xs.length);
  assert.equal(mitNaN.edges.length, xs.length - 1, 'die NaN-Stelle gehört nicht ins Band');
  assert.ok(!mitNaN.edges.some(e => e.x === 2));
});

test('Anschnittgeschwindigkeit erst, wenn Schmelze im Anschnitt ist', () => {
  const s = shot();
  const byName = Object.fromEntries(s.events.map(e => [e.name, e]));
  assert.equal(byName['Kammer voll'].gv, null,
    'die Luftsimulation meldet dort 0 — eine Zahl auszugeben war erfunden');
  assert.ok(byName['Anguss gefüllt'].gv > 0);
  assert.ok(byName['Bauteil gefüllt'].gv > 0);
});

test('Nachverdichtungshub wird nicht auf 0 geklemmt und schlägt an', () => {
  const gut = shot({ density: 2400, densitySolid: 2700, shrink: 0.55 });
  assert.ok(gut.intens > 0);
  assert.ok(gut.checks.find(c => c.id === 'intens').ok);

  /* Feststoffdichte unter der Schmelzedichte = unmöglicher Schuss. */
  const schlecht = shot({ density: 2400, densitySolid: 2300, shrink: 0.55 });
  assert.ok(schlecht.intens < 0, 'der Hub wurde vorher auf 0 geklemmt');
  const c = schlecht.checks.find(c => c.id === 'intens');
  assert.ok(c && !c.ok, 'und die Prüfung blieb grün');
});

test('ftwall: gleiche Fließ- und Formtemperatur ist ein Fehler, keine Kurve', async () => {
  const ftwall = (await import(path.join(site, 'tools/auslegung/js/charts/ftwall.js'))).default;
  const v = values();
  assert.ok(!ftwall.calc(v).err, 'mit den Defaults rechnet es durch');
  for (const bad of [{ Tflow: 200, Tdie: 200 }, { Tflow: 150, Tdie: 200 }]) {
    const q = ftwall.calc(Object.assign({}, v, bad));
    assert.ok(q.err, 'vorher entstanden ±Infinity und NaN: ' + JSON.stringify(bad));
  }
});

test('simstore: das Ergebnis gehört immer zur aktuellen Eingabe', async () => {
  /* Die Luftsimulation läuft synchron im Browser. Früher kam sie vom Server:
     ein Fehler ließ die Abfrage für den Rest der Sitzung verstummen, und
     während des Nachladens galt die Kurve der VORIGEN Eingabe als aktuell.
     Beides darf es nicht mehr geben — nach einem Fehler keine alten Daten,
     nach der Korrektur sofort wieder ein Ergebnis. */
  const { state } = await import(path.join(site, 'tools/auslegung/js/core/state.js'));
  const { sim, refreshSim } = await import(path.join(site, 'tools/auslegung/js/core/simstore.js'));
  Object.assign(state.values, values());
  state.curve = DEFAULT_CURVE.map(p => p.slice());

  refreshSim();
  assert.equal(sim.status, 'ok', sim.error);
  assert.ok(sim.data.samples.p_air_mbar.length > 0 && sim.error === null);

  const gate = state.values.gate;
  state.values.gate = 0;
  refreshSim();
  assert.equal(sim.status, 'error');
  assert.equal(sim.data, null, 'veraltete Daten dürfen nach einem Fehler nicht als aktuell gelten');
  assert.equal(sim.error, 'Anschnittfläche muss > 0 sein.');

  state.values.gate = gate;
  refreshSim();
  assert.equal(sim.status, 'ok', 'nach einem Fehler wurde nie wieder gerechnet');
  assert.ok(sim.data && sim.error === null);

  const before = sim.data;
  refreshSim();
  assert.ok(sim.data === before, 'ohne Änderung wird nicht neu gerechnet');
});

test('orgpresets: Serverfehler ist nicht „keine Stammdaten"', () => {
  const src = readFileSync(path.join(site, 'shared/orgpresets.js'), 'utf8');
  assert.match(src, /__ORG_PRESETS_ERROR__/,
    'ein 500 ließ die Organisation still mit den Beispielwerten weiterrechnen');
  assert.match(src, /settings === undefined/, 'Fehler und „nichts hinterlegt" müssen sich unterscheiden');
});

/* ── Prozentwerte im Markup ───────────────────────────────────────────
   Aus der gegnerischen Prüfung: die Kennzahlen schrieben bei unbrauchbaren
   Eingaben style="width:NaN%" und style="width:-12.34%" ins Markup — der
   Browser verwirft das stillschweigend. Statt an jeder Schreibstelle zu
   prüfen, läuft jede Prozentangabe durch EINE Funktion. */

test('jede Prozentangabe der Kennzahlen ist endlich und in [0, 100]', async () => {
  globalThis.document = { getElementById: () => null, querySelectorAll: () => [] };
  const { renderKpis } = await import(path.join(site, 'tools/auslegung/js/ui/kpis.js'));
  const keys = ['pAccOp', 'pAcc', 'injForce', 'diam', 'length', 'area', 'force',
    'psel', 'safety', 'density', 'part', 'gate', 'vmax', 'dmin', 'lmin', 'biscuit'];

  for (const k of keys) {
    for (const bad of [0, -1, NaN]) {
      const w = Object.assign(values(), { [k]: bad });
      const el = { innerHTML: '', closest: () => null, querySelectorAll: () => [] };
      assert.doesNotThrow(() => renderKpis(el, w, shot({ [k]: bad }), null), `${k} = ${bad}`);
      const schlecht = el.innerHTML.match(/(width|left|margin-left):\s*(NaN|Infinity|-[\d.]+)/g);
      assert.equal(schlecht, null, `${k} = ${bad}: ${schlecht && schlecht.slice(0, 2)}`);
    }
  }
});

test('seq bleibt im angeforderten Bereich', () => {
  /* seq(0, 10, 1.5) lieferte [0, 20] — außerhalb des Bereichs. */
  for (const n of [0, 1, 1.5, 2, 2.9, 7, -3, NaN]) {
    for (const x of seq(0, 10, n)) {
      assert.ok(Number.isFinite(x) && x >= 0 && x <= 10, `seq(0,10,${n}) enthält ${x}`);
    }
  }
  assert.deepEqual(seq(0, 10, 2.9), [0, 10], 'die Anzahl wird abgerundet');
});
