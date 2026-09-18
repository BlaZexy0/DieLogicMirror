/* Achsen, Legende und Kontrast der Liniendiagramme (H-16 bis H-19).

   Der Rauchtest (render-smoke) bildet jede Canvas-Methode auf () => {} ab —
   er bliebe auch bei völlig leeren Diagrammen grün. Hier zeichnet ein
   AUFZEICHNENDER Kontext: geprüft wird, welche Koordinaten und welche
   Farben tatsächlich gesetzt werden.

     node --test tests/web/render-achsen.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.Path2D = class { moveTo() {} lineTo() {} closePath() {} rect() {} arc() {} addPath() {} };
globalThis.document = { createElement: () => ({ getContext: () => rec() }), documentElement: {}, body: {} };
globalThis.getComputedStyle = () => ({ fontFamily: 'Arial', getPropertyValue: () => '' });

for (const f of ['shared/palette.js', 'shared/theme.js', 'shared/examples/machines.js',
  'shared/project.js', 'shared/clampmodel.js']) require(path.join(site, f));
const { theme } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/theme.js')));
Object.assign(theme, globalThis.__THEME__);

const { drawLine } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/render/line.js')));
const { lineFrame, LEGEND_MAX_ROWS } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/render/base.js')));
const { allFields } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/config/fields.js')));
const windowChart = (await import(pathToFileURL(path.join(site, 'tools/auslegung/js/charts/window.js')))).default;

/* Aufzeichnender 2D-Kontext: merkt sich jede Koordinate und jeden Text
   samt der Farbe, mit der er gesetzt wurde. */
function rec() {
  const state = { fillStyle: '#000', strokeStyle: '#000', font: '11px Arial', textAlign: 'left' };
  const log = { coords: [], texts: [] };
  const num = (...xs) => { for (const x of xs) if (typeof x === 'number') log.coords.push(x); };
  const api = {
    log, save() {}, restore() {}, beginPath() {}, closePath() {}, stroke() {}, fill() {}, clip() {},
    setLineDash() {}, translate: num, rotate() {}, scale() {}, setTransform() {},
    moveTo: num, lineTo: num, arc: num, rect: num, fillRect: num, strokeRect: num,
    createPattern: () => ({}), createLinearGradient: () => ({ addColorStop() {} }),
    getImageData: (a, b, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {}, drawImage() {},
    measureText: s => ({ width: String(s).length * 6 }),
    fillText(s, x, y) { log.texts.push({ s: String(s), x, y, fill: api.fillStyle, font: api.font }); num(x, y); },
    strokeText(s, x, y) { num(x, y); }
  };
  Object.assign(api, state);
  return api;
}

const values = () => { const v = {}; for (const f of allFields()) v[f.key] = f.def; return v; };

/* ── H-17 ─────────────────────────────────────────────────────────────── */

test('Null-Spanne auf der linken y-Achse liefert keine NaN-Koordinaten', () => {
  for (const [name, d] of [
    ['konstante Serie', { title: 'T', x: [0, 1, 2], xl: 'x', yl: 'y', ys: [{ n: 'a', c: '#000', y: [5, 5, 5] }] }],
    ['fest gesetzte Null-Spanne', { title: 'T', x: [0, 1, 2], xl: 'x', yl: 'y', y0: 5, y1: 5, ys: [{ n: 'a', c: '#000', y: [5, 5, 5] }] }],
    ['x-Achse ohne Spanne', { title: 'T', x: [3, 3], xl: 'x', yl: 'y', ys: [{ n: 'a', c: '#000', y: [1, 2] }] }],
    ['alles null', { title: 'T', x: [0, 0], xl: 'x', yl: 'y', ys: [{ n: 'a', c: '#000', y: [0, 0] }] }],
  ]) {
    const x = rec();
    assert.doesNotThrow(() => drawLine(x, 900, 700, d), name + ': wirft');
    const bad = x.log.coords.filter(c => !Number.isFinite(c));
    assert.equal(bad.length, 0, `${name}: ${bad.length} nicht-endliche Koordinaten von ${x.log.coords.length}`);
    assert.ok(x.log.coords.length > 20, name + ': es wurde praktisch nichts gezeichnet');
  }
});

/* ── H-19 ─────────────────────────────────────────────────────────────── */

function contrast(a, b) {
  const lum = hex => {
    const c = String(hex).replace('#', '');
    const v = [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16) / 255)
      .map(u => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const l1 = lum(a), l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

test('Beschriftung der rechten Achse erfüllt den WCAG-Textkontrast', () => {
  const C = theme.chart;
  /* Die Vorbedingung des Befunds: die Serienfarben allein reichen nicht. */
  assert.ok(contrast(C.series4, C.surface) < 4.5,
    'series4 wäre als Textfarbe kontrastschwach — sonst prüft dieser Test nichts');

  const x = rec();
  drawLine(x, 900, 700, {
    title: 'T', x: [0, 1, 2], xl: 'x', yl: 'links', rl: 'rechts',
    ys: [{ n: 'a', c: C.series1, y: [1, 2, 3] },
         { n: 'b', c: C.series4, y: [10, 20, 30], axis: 'right' }]
  });
  const schwach = x.log.texts.filter(t => contrast(t.fill, C.surface) < 4.5);
  assert.deepEqual(schwach.map(t => t.s + ' (' + t.fill + ')'), [],
    'jeder gezeichnete Text muss 4,5:1 gegen den Diagrammgrund erreichen');
});

/* ── H-16 ─────────────────────────────────────────────────────────────── */

test('Legende wächst mit, statt still abzubrechen', () => {
  const C = theme.chart;
  const many = n => ({
    title: 'T', x: [0, 1, 2], xl: 'x', yl: 'y', limitText: 'legend',
    ys: Array.from({ length: n }, (_, i) => ({ n: 'Eine ziemlich lange Serienbezeichnung ' + i, c: C.series1, y: [1, 2, 3] }))
  });

  const d2 = many(2), d12 = many(12);
  const x2 = rec(); drawLine(x2, 560, 700, d2);
  const x12 = rec(); drawLine(x12, 560, 700, d12);

  assert.ok(d12._legendRows > d2._legendRows, 'die gemessene Zeilenzahl muss der Legende folgen');
  assert.ok(lineFrame(560, 700, d12).T > lineFrame(560, 700, d2).T,
    'der Plot muss abrücken, statt die Legende abzuschneiden');

  /* Was selbst dann nicht passt, wird gezählt — nicht verschwiegen. */
  const d40 = many(40);
  const x40 = rec(); drawLine(x40, 560, 700, d40);
  assert.ok(d40._legendRows > LEGEND_MAX_ROWS, 'Testaufbau: 40 Einträge müssen die Obergrenze reißen');
  assert.ok(x40.log.texts.some(t => /^\+ \d+ weitere$/.test(t.s)),
    'der Rest muss ausgewiesen werden: ' + x40.log.texts.map(t => t.s).slice(-3).join(' | '));
});

/* ── H-18 ─────────────────────────────────────────────────────────────── */

test('Prozessfenster: Farbskala folgt dem Zielband und meldet die Sättigung', () => {
  const v = values();
  const q = windowChart.calc(v, {});
  assert.equal(q.lo, 0);
  assert.ok(q.hi >= v.gateMax, 'die Skala muss das Zielband einschließen');
  assert.match(q.info, /Farbskala 0–/, 'die Skala gehört benannt');
  assert.match(q.info, /% des Feldes liegen darüber/,
    'Sättigung darf nicht stumm bleiben — mit den Defaults sind es rund 16 %');

  /* Ein viertelgroßer Anschnitt sättigt das Feld massiv — genau der Fall,
     in dem die Farbe nichts mehr aussagt. */
  const eng = windowChart.calc(Object.assign({}, v, { gate: v.gate / 4 }), {});
  const pct = s => Number((s.match(/([\d,]+) % des Feldes/) || [0, '0'])[1].replace(',', '.'));
  assert.ok(pct(eng.info) > 50, 'der Anteil oberhalb der Skala muss mitwachsen: ' + eng.info);

  /* Ein engeres Zielband bekommt eine feinere Skala — vorher stand dort
     immer 80 m/s, unabhängig von der Auslegung. */
  const schmal = windowChart.calc(Object.assign({}, v, { gateMin: 10, gateMax: 20 }), {});
  assert.ok(schmal.hi < q.hi, `engeres Band → feinere Skala (${schmal.hi} vs ${q.hi})`);
});
