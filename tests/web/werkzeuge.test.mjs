/* Werkzeugseiten: Kosten, Zyklus, Sprengfläche (H-26 bis H-30).

   Alle fünf Befunde haben dieselbe Form — die Seite nimmt eine Eingabe an,
   die sie laut ihrer eigenen Beschriftung nicht annehmen dürfte, und
   rechnet damit still weiter.

     node --test tests/web/werkzeuge.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const read = f => readFileSync(path.join(site, f), 'utf8');

globalThis.window = globalThis;
require(path.join(site, 'shared/examples/kosten.js'));
const kosten = require(path.join(site, 'tools/teilekosten/teilekosten-logic.js'));
const zyklus = require(path.join(site, 'tools/zyklus/zyklus-logic.js'));

/* ── H-26 ─────────────────────────────────────────────────────────────── */

test('Kostenseite: jedes Eingabefeld wird gegen sein eigenes min/max geprüft', () => {
  const html = read('tools/teilekosten/index.html');

  /* Vorbedingung: die Grenzen stehen im Markup. */
  const felder = [...html.matchAll(/id="i-(\w+)"([^>]*)/g)]
    .map(m => ({ key: m[1], attrs: m[2] }))
    .filter(f => /\bmin=|\bmax=/.test(f.attrs));
  assert.ok(felder.length >= 15, 'Testaufbau: es sollten viele Felder Grenzen tragen, sind ' + felder.length);

  /* Und sie werden gelesen — vorher war val() nur parseFloat(…) || 0. */
  assert.match(html, /function checkInputs\(\)/, 'die Prüfung fehlt');
  assert.match(html, /el\.min/, 'die min-Grenze des Feldes wird nicht gelesen');
  assert.match(html, /el\.max/, 'die max-Grenze des Feldes wird nicht gelesen');
  assert.match(html, /checkInputs\(\);/, 'die Prüfung wird nicht aufgerufen');
  assert.match(html, /id="input-warn"/, 'es fehlt der Ort für die Meldung');

  /* Nicht geklemmt: eine verbotene Eingabe wird benannt, nicht ersetzt. */
  assert.ok(!/Math\.max\(parseFloat\(document\.getElementById\('i-/.test(html),
    'Eingaben dürfen nicht still auf den erlaubten Bereich geklemmt werden');
});

test('Kostenseite: verbotene Eingaben liefern weiterhin auffällige Zahlen', () => {
  /* Der Rechenkern bleibt absichtlich unbeschnitten — der Fehler wird an
     der Eingabe gemeldet, nicht in der Formel versteckt. Der Test hält
     fest, dass genau diese Eingaben ohne Prüfung durchgingen. */
  const K = window.__KOSTEN__.defaults;
  const base = Object.assign({}, K, { mpart: 12, mdose: 18.2 });
  const negativ = kosten.computeCost(Object.assign({}, base, { mpart: -12 }));
  assert.ok(Number.isFinite(negativ.total) && negativ.total < 0,
    'ein negatives Bauteilgewicht liefert eine endliche, sinnlose Zahl — deshalb die Eingabeprüfung');
});

/* ── H-30 ─────────────────────────────────────────────────────────────── */

test('Kostenkurve: der Betriebspunkt bleibt im Bild', () => {
  const html = read('tools/teilekosten/index.html');
  const m = html.match(/var t0 = ([^;]+);\s*var t1 = ([^;]+);/);
  assert.ok(m, 'Achsenbereich der Kostenkurve nicht gefunden');
  assert.ok(/tz/.test(m[1]) && /tz/.test(m[2]),
    'der Bereich muss dem Betriebspunkt folgen — fest [25, 90] ließ den Marker aus dem Bild laufen');

  /* Dieselbe Formel wie in der Seite, gegen die Zeichenfläche geprüft. */
  const W = 620, L = 58, R = 20;
  for (const tz of [5, 15, 25, 52, 90, 120, 400]) {
    const t0 = Math.max(1, Math.min(25, Math.floor(tz * 0.8)));
    const t1 = Math.max(90, Math.ceil(tz * 1.2));
    const x = L + (tz - t0) / (t1 - t0) * (W - L - R);
    assert.ok(x >= L - 0.5 && x <= W - R + 0.5, `τ_z = ${tz} s: Marker bei x = ${x.toFixed(1)}`);
  }
});

/* ── H-27 ─────────────────────────────────────────────────────────────── */

const heatArgs = extra => Object.assign({
  mdose: 18.2, Tcast: 660, alloy: zyklus.ALLOY_FALLBACK, Tdie: 200, Teject: 300,
  dTspray: 50, Acav: 0.6, die: { B: 960, H: 960, L: 480 }, tz: 52, tauBl: 6
}, extra);

test('Entformungstemperatur muss zwischen Umgebung und Solidus liegen', () => {
  const al = zyklus.ALLOY_FALLBACK;
  const r = zyklus.ejectRange(al);
  assert.equal(r.max, al.Tsol, 'die Obergrenze ist der Solidus — darüber ist das Teil nicht fest');

  /* Gültig: die Bilanz steht. */
  const ok = zyklus.computeHeat(heatArgs({ Teject: 300 }));
  assert.ok(ok.input && ok.input.Qcool > 0 && ok.PT > 0);

  /* Ungültig: kein Ergebnis statt einer Bilanz mit falschem Vorzeichen.
     Vorher: T_e = 650 °C → Q_cool −2485 kJ, T_e = 900 °C → P_T −7,75 kW. */
  for (const Te of [al.Tsol, al.Tsol + 1, 650, 900, 20, -50, NaN]) {
    assert.equal(zyklus.computeHeat(heatArgs({ Teject: Te })).input, null,
      `T_e = ${Te} °C darf keine Wärmebilanz liefern`);
  }
});

/* ── H-28 ─────────────────────────────────────────────────────────────── */

test('negative Phasendauer: live und nach dem Neuladen dieselbe Zykluszeit', () => {
  const st = zyklus.defaultState();
  const kaputt = Object.assign({}, st.durs, { schuss: -15 });

  const live = zyklus.layoutCycle(kaputt, []);
  const nachLaden = zyklus.layoutCycle(zyklus.sanitizeState({ durs: kaputt }).durs, []);
  assert.equal(live.total, nachLaden.total,
    `vorher sprang τ_z zwischen ${live.total} s (live, cleanDur → 0) und ${nachLaden.total} s (Neuladen, Default)`);

  /* Und der Fehler bleibt nicht stumm. */
  assert.ok(live.errors.some(e => /Ungültige Dauer/.test(e)), live.errors.join(' | '));

  /* Ein FEHLENDER Schlüssel ist etwas anderes als ein ungültiger. */
  assert.equal(zyklus.sanitizeState({ durs: {} }).durs.schuss, st.durs.schuss, 'fehlend → Default');
  assert.equal(zyklus.sanitizeState({ durs: kaputt }).durs.schuss, 0, 'ungültig → 0');

  /* Die Seite nimmt eine negative Dauer gar nicht erst an. */
  const html = read('tools/zyklus/index.html');
  const handler = html.slice(html.indexOf("getElementById('main-grid').addEventListener('input'"));
  const body = handler.slice(0, handler.indexOf('\n  });'));
  assert.match(body, /classList\.toggle\('bad'/, 'das Feld wird nicht markiert');
  assert.ok(!/st\.durs\[el\.dataset\.id\] = parseFloat\(el\.value\) \|\| 0;/.test(body),
    'der alte Pfad übernahm negative Werte unverändert');
});

/* ── H-29 ─────────────────────────────────────────────────────────────── */

test('Sprengflächenanalyse liest ihren eigenen Abschnitt zurück', () => {
  const src = read('tools/sprengflaeche/stl-app.js');
  assert.match(src, /getSection\('geometry'\)/,
    'die Seite schrieb den Abschnitt, las ihn aber nie — jeder Besuch begann bei den Beispieldateien');
  assert.match(src, /restoreGeometry\(\)/, 'die Wiederherstellung wird nicht aufgerufen');

  /* Alles, was geschrieben wird und sich wiederherstellen lässt, muss auch
     zurückgelesen werden. */
  for (const key of ['alloy', 'shrink', 'toolScale', 'safety', 'psel', 'core']) {
    assert.ok(new RegExp('g\\.' + key).test(src), `restoreGeometry liest ${key} nicht zurück`);
  }

  /* Und der Abschnitt wird erst geschrieben, wenn es ein Projekt gibt. */
  const fn = src.slice(src.indexOf("setSection('geometry'") - 800, src.indexOf("setSection('geometry'"));
  assert.match(fn, /if \(!window\.__PROJECT__\.current\(\)\)/,
    'der Abschnitt wurde geschrieben, bevor überhaupt geprüft war, ob ein Projekt existiert');
});
