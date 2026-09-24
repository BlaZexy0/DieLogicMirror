/* Die Seitenpipeline der Auslegung (js/ui/page.js): Dashboard, Einzelseite
   und der Auslegungsschritt der Werkbank rechnen und zeichnen über dieselbe
   Funktion. Vorher trug jede Seite eine Kopie, und die der Werkbank lief
   auseinander — sie blendete die Vakuum-Felder nach einem Modellwechsel
   nicht um und zeichnete beim Farbschema nicht neu.

   Hier läuft das echte Dashboard (index.html, js/main.js) durch das kleine
   DOM des Studios (tests/web/3d-studio/stubs/dom.mjs) mit einem stummen
   2D-Kontext.
   node --test tests/web/seitenpipeline.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildDocument, installGlobals, El } from './3d-studio/stubs/dom.mjs';
import { site, ladeSkripte, SKRIPTE, auslegung, stummerKontext } from './stubs/dashboard.mjs';

const { doc } = buildDocument(readFileSync(path.join(site, 'tools/auslegung/index.html'), 'utf8'));
installGlobals(doc);
ladeSkripte([...SKRIPTE, 'shared/examples/alloys.js', 'shared/examples/parts.js']);

/* Jede Leinwand bekommt einen stummen Kontext; gezählt wird, wie oft eine
   Karte gemalt wurde (paintCard setzt die Transformation genau einmal). */
let gemalt = 0;
El.prototype.getContext = function () {
  if (!this._ctx) {
    this._ctx = stummerKontext();
    this._ctx.setTransform = () => { gemalt++; };
  }
  return this._ctx;
};

const warte = ms => new Promise(r => setTimeout(r, ms));
async function bis(fn, was) {
  for (let i = 0; i < 400; i++) { if (fn()) return; await warte(10); }
  throw new Error(was + ' trat nicht ein');
}

const { state, notify } = await auslegung('core/state.js');
const karten = () => doc.querySelectorAll('.card[data-chart]');
const feld = k => doc.querySelector('.field[data-field="' + k + '"]');

before(async () => {
  await auslegung('main.js');
  await bis(() => karten().length && karten().every(c => c.data), 'Dashboard gezeichnet');
});

test('das Dashboard baut Kammerkarte, Kennzahlen und eine Karte je Diagramm', async () => {
  const { charts } = await auslegung('charts/registry.js');
  assert.equal(doc.getElementById('error').textContent, '', 'Initialisierungsfehler');
  assert.equal(karten().length, charts.length);
  for (const c of karten()) assert.ok(!c.data.err, c.dataset.chart + ': ' + c.data.err);
  assert.match(doc.querySelector('.chamber-draw').innerHTML, /<svg/, 'Füllkammer-Schema');
  assert.match(doc.getElementById('chamber-ruler').innerHTML, /kr-track/, 'Kolbenweg-Lineal');
  assert.match(doc.getElementById('chamber-kpis').innerHTML, /Füllgrad/, 'Kennwerte der Kammer');
  assert.match(doc.getElementById('summary').innerHTML, /Zuhaltung und Maschine/, 'Prüfpanels');
  assert.match(doc.getElementById('checkbar').innerHTML, /Prüfungen erfüllt/, 'Prüfleiste');
});

test('die Vakuum-Felder folgen dem Modell (in der Werkbank fehlte das)', async () => {
  const modell = doc.querySelector('select[data-k="vacModel"]');
  const setze = m => { modell.value = m; modell.oninput(); };
  setze('aus');
  for (const k of ['vacPump', 'vacStart', 'vacTank', 'ventHeight']) assert.ok(feld(k).hidden, k + ' müsste ausgeblendet sein');
  assert.ok(!feld('vent').hidden, 'die Entlüftungsfläche bleibt');
  setze('tank');
  for (const k of ['vacPump', 'vacStart', 'vacTank', 'ventHeight']) assert.ok(!feld(k).hidden, k + ' müsste sichtbar sein');
  setze('conductance');
  assert.ok(feld('vacTank').hidden && !feld('ventHeight').hidden);
});

test('ein Wechsel des Farbschemas malt alle Karten und die Füllkammer neu, ohne zu rechnen', () => {
  const daten = karten().map(c => c.data);
  const svg = doc.querySelector('.chamber-draw');
  svg.innerHTML = '';
  const vorher = gemalt;
  doc.dispatch('dielogic:scheme');
  assert.equal(gemalt - vorher, karten().length, 'jede Karte einmal gemalt');
  assert.ok(karten().every((c, i) => c.data === daten[i]), 'gerechnet wurde nicht');
  assert.match(svg.innerHTML, /<svg/, 'die Füllkammer trägt ihre Farben im SVG und wird neu gebaut');
});

test('ungültige Eingaben: der letzte gültige Stand bleibt stehen, abgeblendet', () => {
  const eingabe = doc.querySelector('input[data-k="gate"]');
  const alt = eingabe.value, daten = karten().map(c => c.data);
  eingabe.value = '0'; eingabe.oninput();
  assert.ok(doc.body.classList.contains('inputs-invalid'));
  assert.ok(eingabe.classList.contains('invalid'), 'das Feld ist markiert');
  assert.match(doc.getElementById('error').textContent, /Anschnittfläche/);
  assert.ok(karten().every((c, i) => c.data === daten[i]), 'die Karten behalten ihren Stand');
  eingabe.value = alt; eingabe.oninput();
  assert.ok(!doc.body.classList.contains('inputs-invalid'));
  assert.ok(karten().every((c, i) => c.data !== daten[i]), 'wieder gültig: neu gerechnet');
});

test('Kurve und Auto-Flächen rechnet notify() einmal je Eingabe, nicht noch einmal beim Zeichnen', async () => {
  const { curveGenMessage } = await auslegung('core/curvegen.js');
  const alt = { mode: state.curveGen.mode, part: state.values.part };
  state.curveGen.mode = 'lopez';
  notify();
  const kurve = state.curve;
  assert.equal(curveGenMessage(), null, 'die Vorgaben lassen sich generieren');
  /* Ohne notify() geändert (das tut keine Seite): ein Neuzeichnen durch die
     Fenstergröße erzeugt die Kurve nicht noch einmal — vorher tat es das. */
  state.values.part += 1;
  globalThis.dispatchEvent({ type: 'resize' });
  await warte(200);
  assert.ok(state.curve === kurve, 'render() hat die Kurve neu erzeugt');
  notify();
  assert.ok(state.curve !== kurve, 'notify() erzeugt sie');
  state.values.part = alt.part; state.curveGen.mode = alt.mode;
  notify();
});

test('gesperrt ohne gültigen Stand: die Karten nennen den Grund, danach bleibt der letzte Stand', async () => {
  const { createRender } = await auslegung('ui/page.js');
  const log = [];
  const render = createRender({ curve: false, blocked: (v, grund) => log.push(['gesperrt', grund]), draw: (v, shot) => log.push(['gezeichnet', shot]) });
  const gate = state.values.gate;
  state.values.gate = 0;
  assert.equal(render(), null);
  assert.equal(log.length, 1);
  assert.match(log[0][1], /^Eingaben außerhalb des zulässigen Bereichs: .*Anschnittfläche/);
  state.values.gate = gate;
  const shot = render();
  assert.ok(shot && !shot.error && log[1][0] === 'gezeichnet' && log[1][1] === shot);
  state.values.gate = 0;
  assert.equal(render(), null);
  assert.equal(log.length, 2, 'nach einem gültigen Stand wird nicht mehr gesperrt gezeichnet');
  state.values.gate = gate;
  render();
});

test('Dashboard, Einzelseite und Werkbank nehmen dieselbe Pipeline', () => {
  const lies = f => readFileSync(path.join(site, f), 'utf8');
  const main = lies('tools/auslegung/js/main.js'), single = lies('tools/auslegung/js/single.js');
  const werkbank = lies('tools/3d-studio/js/werkbank/design.js');
  for (const [name, src] of [['main.js', main], ['single.js', single], ['werkbank/design.js', werkbank]]) {
    assert.match(src, /createRender\(/, name + ' rechnet nicht über ui/page.js');
    assert.match(src, /startPage\(/, name + ' startet nicht über ui/page.js');
    assert.ok(!/computeShot\(v, (state|design)\.curve\)|classList\.toggle\('inputs-invalid'|applyCurveGen|applyAuto/.test(src),
      name + ': eine eigene Kopie der Pipeline');
  }
  assert.match(werkbank, /buildDashboard\(/, 'die Werkbank baut das Dashboard wie index.html');
  assert.match(werkbank, /repaint:/, 'die Werkbank malt beim Farbschema neu');
  /* data-k bezeichnet in der Auslegung das Eingabefeld eines Werts; die
     Übernahmetabelle der Werkbank trug es auch, und applyValues fand beim
     Übernehmen die Checkbox statt des Felds der Seitenleiste. */
  assert.ok(!/data-k=/.test(werkbank), 'die Übernahmetabelle darf kein data-k tragen');
});
