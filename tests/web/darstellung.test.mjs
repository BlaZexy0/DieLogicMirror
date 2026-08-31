/* Anzeige-Defekte, die etwas verschweigen (MEDIUM/LOW).

     node --test tests/web/darstellung.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const site = path.join(root, 'web');
const read = f => readFileSync(path.join(site, f), 'utf8');

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
for (const f of ['shared/palette.js', 'shared/theme.js']) require(path.join(site, f));
const { theme } = await import(path.join(site, 'tools/auslegung/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);

/* Aufzeichnender Kontext — geprüft wird, WAS gezeichnet wird. */
function rec() {
  const log = { texts: [], calls: 0 };
  const api = {
    log, fillStyle: '#000', strokeStyle: '#000', font: '11px Arial', textAlign: 'left', globalAlpha: 1,
    save() {}, restore() {}, beginPath() { log.calls++; }, closePath() {}, stroke() {}, fill() {},
    clip() {}, setLineDash() {}, translate() {}, rotate() {}, moveTo() {}, lineTo() {}, arc() {},
    rect() {}, fillRect() {}, strokeRect() {}, measureText: s => ({ width: String(s).length * 6 }),
    fillText(s) { log.texts.push(String(s)); }, strokeText() {},
    createPattern: () => ({}), getImageData: (a, b, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  return api;
}

/* ── Betriebspunkt-Marker ─────────────────────────────────────────────── */

test('ein Betriebspunkt außerhalb des Rahmens verschwindet nicht stumm', async () => {
  const { marker } = await import(path.join(site, 'tools/auslegung/js/render/base.js'));
  const f = { L: 75, R: 50, T: 92, B: 58, pw: 700, ph: 400 };

  const drin = rec();
  marker(drin, f, 300, 300, 'Ist 4,2 m/s');
  assert.ok(drin.log.texts.some(t => /Ist 4,2/.test(t)), 'im Rahmen unverändert');

  for (const [px, py, wo] of [[-200, 300, 'links'], [2000, 300, 'rechts'],
    [300, -50, 'oben'], [300, 900, 'unten']]) {
    const x = rec();
    marker(x, f, px, py, 'Ist 4,2 m/s');
    assert.ok(x.log.calls > 0, wo + ': es wurde gar nichts gezeichnet');
    assert.ok(x.log.texts.some(t => /außerhalb/.test(t)),
      wo + ': der Punkt verschwand kommentarlos — das Diagramm sah aus, als gäbe es keinen');
  }
});

/* ── Ringdiagramm ─────────────────────────────────────────────────────── */

test('Ringdiagramm: Zeichnung und Hover benutzen dieselbe Bezugsgröße', async () => {
  const { donutTotal } = await import(path.join(site, 'tools/auslegung/js/render/donut.js'));
  assert.equal(donutTotal({ total: 18.2 }), 18.2);
  for (const bad of [0, -1, NaN, Infinity, undefined]) {
    assert.equal(donutTotal({ total: bad }), 0, 'unbrauchbar → 0: ' + bad);
  }

  const hover = read('tools/auslegung/js/render/hover.js');
  assert.match(hover, /donutTotal/, 'der Hover rechnete mit dem rohen d.total');
  assert.ok(!/kg \/ d\.total/.test(hover), '`kg / d.total` ergab bei 0 „Infinity %"');
});

/* ── PQ²-Theorieseite ─────────────────────────────────────────────────── */

test('pq2.html: bei einem Rechenfehler bleibt die Erklärgrafik stehen', () => {
  const html = read('theorie/pq2.html');
  /* Vorher: `if (d.err) return;` — und danach wurde das SVG trotzdem
     versteckt und ein leeres Canvas gezeigt. */
  assert.ok(!/if \(d\.err\) return;/.test(html), 'der stumme Ausstieg steht noch im Code');
  assert.match(html, /if \(render\(\)\) \{/, 'umgeschaltet wird erst, wenn das Bild steht');
  const block = html.slice(html.indexOf('if (d.err)'), html.indexOf('if (d.err)') + 700);
  assert.match(block, /drawAny/, 'die Fehlermeldung gehört gezeichnet');
});

/* ── Icons ────────────────────────────────────────────────────────────── */

test('Icons kommen aus einem Sprite im Dokument, nicht aus externen Dateien', () => {
  const html = read('index.html');
  /* Safari löst externe Referenzen in <use> nicht auf — dort blieben alle
     elf Icons unsichtbar. */
  assert.ok(!/<use href="\/assets\/icons\//.test(html),
    'externe <use>-Referenz: in Safari unsichtbar');

  const iconDir = path.join(site, 'assets', 'icons');
  const dateien = readdirSync(iconDir).filter(f => f.endsWith('.svg')).sort();
  assert.ok(dateien.length > 0);

  /* Jedes Symbol steht im Sprite, und jede Referenz zeigt auf eines. */
  for (const f of dateien) {
    const id = 'icon-' + f.replace(/\.svg$/, '');
    assert.ok(html.includes('id="' + id + '"'), 'Symbol fehlt im Sprite: ' + id);
  }
  const refs = [...html.matchAll(/<use href="#([\w-]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= dateien.length, `${refs.length} Referenzen, ${dateien.length} Icons`);
  for (const r of refs) assert.ok(html.includes('id="' + r + '"'), 'Referenz ins Leere: #' + r);
});
