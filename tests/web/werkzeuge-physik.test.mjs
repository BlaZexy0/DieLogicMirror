/* Rechenfehler in Zyklus, Kosten und Sprengfläche (MEDIUM/LOW).

     node --test tests/web/werkzeuge-physik.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const read = f => readFileSync(path.join(site, f), 'utf8');
/* Für Prüfungen auf tote Muster: Kommentare zählen nicht — dort stehen sie
   absichtlich, um den behobenen Fehler zu erklären. */
const ohneKommentare = src => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

globalThis.window = globalThis;
require(path.join(site, 'shared/examples/kosten.js'));
const Z = require(path.join(site, 'tools/zyklus/zyklus-logic.js'));
const M = await import(pathToFileURL(path.join(site, 'tools/sprengflaeche/stl-math.js')));
const SL = require(path.join(site, 'tools/sprengflaeche/stl-logic.js'));

const O = { tz: 52, tauBl: 6, Tdie: 200, Teject: 300, dTspray: 50,
  Acav: 0.6, B: 0.96, H: 0.96, L: 0.48 };

/* ── Q_Luft ───────────────────────────────────────────────────────────── */

test('Q_Luft rechnet mit dem Öffnungsspalt, nicht mit dem Formvolumen', () => {
  const l = Z.heatLosses(O);
  /* Vorher: V = B·H·L = 0,442 m³ — das ganze Formvolumen, ein Stahlblock.
     (12.13) meint die Luft ZWISCHEN den geöffneten Hälften. */
  const formvolumen = O.B * O.H * O.L;
  assert.ok(l.Vluft < formvolumen, `V_luft ${l.Vluft} darf nicht das Formvolumen ${formvolumen} sein`);
  assert.ok(Math.abs(l.Vluft - O.B * O.H * 0.30) < 1e-9);

  /* Eine dünnere Form kann keinen größeren Spalt haben als sie selbst tief ist. */
  const duenn = Z.heatLosses(Object.assign({}, O, { L: 0.10 }));
  assert.ok(Math.abs(duenn.Vluft - O.B * O.H * 0.10) < 1e-9);
});

/* ── τ_bl ─────────────────────────────────────────────────────────────── */

test('Q_Bl rechnet nur mit der Ausblaszeit — Sprühen steckt in Q_Spr', () => {
  const ganz = Z.heatLosses(Object.assign({}, O, { tauBl: 8 }));
  const halb = Z.heatLosses(Object.assign({}, O, { tauBl: 4 }));
  assert.ok(Math.abs(ganz.Qbl - 2 * halb.Qbl) < 1e-9, 'Q_Bl ist linear in tauBl');

  /* Die Seite reicht jetzt einen Anteil der Phase durch, nicht die ganze. */
  assert.equal(Z.heatDefaults().blowFrac, 50);
  assert.equal(Z.sanitizeHeat({ blowFrac: 30 }).blowFrac, 30);
  for (const bad of [-1, 101, 'x', null]) {
    assert.equal(Z.sanitizeHeat({ blowFrac: bad }).blowFrac, 50, 'ungültig → Standard: ' + bad);
  }
  const html = read('tools/zyklus/index.html');
  assert.match(html, /data-h="blowFrac"/, 'das Eingabefeld fehlt');
  assert.match(html, /h\.blowFrac \/ 100/, 'die ganze Phase zählte Sprühen und Ausblasen doppelt');
});

/* ── neue Hauptphase ──────────────────────────────────────────────────── */

test('eine neue Hauptphase bringt weder Logik noch Seite zum Absturz', () => {
  /* defaultState leitet die Dauern aus MAIN_PHASES ab statt aus einer
     zweiten handgepflegten Liste. */
  const src = readFileSync(path.join(site, 'tools/zyklus/zyklus-logic.js'), 'utf8');
  assert.match(src, /MAIN_PHASES\.forEach\(function \(p\) \{ durs\[p\.id\]/,
    'die Dauern müssen aus MAIN_PHASES kommen');

  const st = Z.defaultState();
  for (const id of ['dosieren', 'schuss', 'halten', 'oeffnen', 'entnahme', 'spruehen', 'schliessen', 'neben']) {
    assert.ok(Number.isFinite(st.durs[id]), 'Phase ohne Dauer: ' + id);
  }

  /* Und die Seite hat einen Rückfall für Phasen ohne Farbeintrag. */
  const html = read('tools/zyklus/index.html');
  assert.match(html, /function mainStyle\(id\)/, 'MAIN_STYLE[id].fill warf auf undefined');
  assert.ok(!/MAIN_STYLE\[(it|p)\.id\]\./.test(ohneKommentare(html)),
    'direkter Zugriff ohne Rückfall steht noch im Code');
});

/* ── 2,5×-Faktor ──────────────────────────────────────────────────────── */

test('Gravurfläche aus der Sprengfläche rundet nicht auf null', () => {
  const html = read('tools/zyklus/index.html');
  assert.ok(!/Math\.round\(2\.5 \* D\.area \* 100\) \/ 100/.test(html),
    'unter rund 0,002 m² ergab die Rundung 0 m² Gravurfläche — und Q_Bl wie Q_Spr null');
  assert.match(html, /Acav = 2\.5 \* D\.area;/);
  /* Vorbedingung des Befunds, zur Erinnerung im Test: */
  assert.equal(Math.round(2.5 * 0.001 * 100) / 100, 0);
});

/* ── Netzvolumen ──────────────────────────────────────────────────────── */

test('meshVolume liefert das Vorzeichen — der Betrag verdeckte invertierte Netze', () => {
  /* Ein Würfel, sauber gewickelt und einmal umgedreht. */
  const w = 10;
  const box = [
    [0, 0, 0, w, 0, 0, w, w, 0], [0, 0, 0, w, w, 0, 0, w, 0],
    [0, 0, w, w, w, w, w, 0, w], [0, 0, w, 0, w, w, w, w, w],
    [0, 0, 0, 0, w, 0, 0, w, w], [0, 0, 0, 0, w, w, 0, 0, w],
    [w, 0, 0, w, w, w, w, w, 0], [w, 0, 0, w, 0, w, w, w, w],
    [0, 0, 0, w, 0, w, w, 0, 0], [0, 0, 0, 0, 0, w, w, 0, w],
    [0, w, 0, w, w, 0, w, w, w], [0, w, 0, w, w, w, 0, w, w],
  ].flat();
  const v = M.meshVolume(box);
  assert.ok(Math.abs(Math.abs(v) - w ** 3) < 1e-9, 'Volumen ' + v);

  const invert = box.slice();
  for (let f = 0; f < invert.length / 9; f++) {
    const o = f * 9;
    for (let a = 0; a < 3; a++) {
      const t = invert[o + 3 + a]; invert[o + 3 + a] = invert[o + 6 + a]; invert[o + 6 + a] = t;
    }
  }
  assert.equal(Math.sign(M.meshVolume(invert)), -Math.sign(v),
    'das Vorzeichen muss kippen — der Betrag lieferte zweimal dieselbe plausible Zahl');

  /* Und die Seite meldet es. */
  const app = read('tools/sprengflaeche/stl-app.js');
  assert.match(app, /volumeSigned/);
  assert.match(app, /kein positives Volumen/);
});

/* ── Rückfall-Defaults ────────────────────────────────────────────────── */

test('eine getippte 0 wird nicht still zum Standardwert', () => {
  const app = ohneKommentare(read('tools/sprengflaeche/stl-app.js'));
  assert.ok(!/\|\| 600/.test(app), '`|| 600` machte aus 0 still 600 bar');
  assert.ok(!/\|\| 1\.3/.test(app), '`|| 1.3` machte aus 0 still den Sicherheitsfaktor 1,3');
  /* Auch nicht still auf den erlaubten Bereich geklemmt: der frühere
     Math.max(…, 0) beim Schwindmaß machte aus −1 stillschweigend 0, und die
     Obergrenze aus dem Markup (5 %) las überhaupt niemand. */
  assert.ok(!/Math\.max\(parseFloat\(document\.getElementById/.test(app),
    'Eingaben werden still auf den erlaubten Bereich geklemmt');
  assert.match(app, /function pruefeEingaben\(\)/, 'die Prüfung fehlt');
  assert.match(app, /__DOMAENE__/, 'die Grenzen kommen nicht aus der Domäne');
});

/* ── handoffValues ────────────────────────────────────────────────────── */

test('die Übernahme trägt die Analysewerte, nicht die Preset-Felder', () => {
  const o = { part: 12, runner: 3, overflow: 2, biscuit: 1.2,
    area: 0.15, eccX: 5, eccY: 3, safety: 1.3, psel: 600 };
  /* Ein Preset mit gleichnamigem Feld darf das Ergebnis nicht überschreiben. */
  const v = SL.handoffValues(o, { area: 0.99, force: 16000 }, { psel: 999, density: 2400 });
  assert.equal(v.area, 0.15, 'das Preset gewann über das Analyseergebnis');
  assert.equal(v.psel, 600);
  assert.equal(v.force, 16000, 'Rahmenwerte der Presets kommen weiterhin mit');
  assert.equal(v.density, 2400);
});

/* ── Materialausbeute ─────────────────────────────────────────────────── */

test('beide Werkzeuge definieren die Materialausbeute gleich', () => {
  const mpart = 12, mdose = 18.2;
  /* Dashboard-Ringdiagramm: Bauteil / Dosiergewicht. */
  const dash = 100 * mpart / mdose;
  /* Kostenseite nach der Ganzschuss-Bilanz (C-10): dieselbe Formel. */
  const kosten = 100 * mpart / mdose;
  assert.ok(Math.abs(dash - kosten) < 1e-9);

  const html = read('tools/teilekosten/index.html');
  assert.match(html, /100 \* v\.mpart \/ v\.mdose/,
    'die Kostenseite multiplizierte zusätzlich mit kav — zwei widersprechende Definitionen');
});
