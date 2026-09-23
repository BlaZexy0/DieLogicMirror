/* Achsen, Legende und Kontrast der Liniendiagramme (H-16 bis H-19).

   Der Rauchtest (render-smoke) bildet jede Canvas-Methode auf () => {} ab —
   er bliebe auch bei völlig leeren Diagrammen grün. Hier zeichnet ein
   AUFZEICHNENDER Kontext: geprüft wird, welche Koordinaten und welche
   Farben tatsächlich gesetzt werden.

     node --test tests/web/render-achsen.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ladeSkripte, themeLaden, auslegung, defaults as values, canvasGlobals, zeichnenderKontext as rec
} from './stubs/dashboard.mjs';

/* Aufzeichnender 2D-Kontext (tests/web/stubs/dashboard.mjs): merkt sich jede
   Koordinate und jeden Text samt der Farbe, mit der er gesetzt wurde. */
canvasGlobals(rec);
ladeSkripte();
const theme = await themeLaden();

const { drawLine } = await auslegung('render/line.js');
const { lineFrame, LEGEND_MAX_ROWS } = await auslegung('render/base.js');
const windowChart = (await auslegung('charts/window.js')).default;

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

test('Null-Spanne in der Heatmap (Ø min = Ø max) liefert keine NaN-Koordinaten', async () => {
  /* Die Heatmap rechnete ihre Pixelachsen ohne den Schutz, den axes() und
     die Linien hatten: mit Ø min = Ø max wurden Grenzkurve und Marker
     ±Infinity/NaN. Seit alle Renderer render/base.js scales() nehmen, gilt
     der Schutz überall (die Domäne sperrt den Fall auf den Seiten ohnehin). */
  const { drawAny } = await auslegung('render/draw.js');
  const fill = (await auslegung('charts/fill.js')).default;
  const d = fill.calc(Object.assign(values(), { dmin: 120, dmax: 120, diam: 120 }));
  d.title = fill.title;
  const x = rec();
  assert.doesNotThrow(() => drawAny(x, 900, 700, d));
  const bad = x.log.coords.filter(c => !Number.isFinite(c));
  assert.equal(bad.length, 0, `${bad.length} nicht-endliche Koordinaten von ${x.log.coords.length}`);
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
  /* Die Vorbedingung des Befunds: die Sachfarbe der Luft (rechte Achse der
     Schusskurve) reicht als Schrift nicht. */
  assert.ok(contrast(C.air, C.surface) < 4.5,
    'die Luft wäre als Textfarbe kontrastschwach — sonst prüft dieser Test nichts');

  const x = rec();
  drawLine(x, 900, 700, {
    title: 'T', x: [0, 1, 2], xl: 'x', yl: 'links', rl: 'rechts',
    ys: [{ n: 'a', c: 'ink', y: [1, 2, 3] },
         { n: 'b', c: 'air', y: [10, 20, 30], axis: 'right' }]
  });
  const schwach = x.log.texts.filter(t => contrast(t.fill, C.surface) < 4.5);
  assert.deepEqual(schwach.map(t => t.s + ' (' + t.fill + ')'), [],
    'jeder gezeichnete Text muss 4,5:1 gegen den Diagrammgrund erreichen');
});

/* ── H-16 ─────────────────────────────────────────────────────────────── */

test('Legende wächst mit, statt still abzubrechen', () => {
  const many = n => ({
    title: 'T', x: [0, 1, 2], xl: 'x', yl: 'y', limitText: 'legend',
    ys: Array.from({ length: n }, (_, i) => ({ n: 'Eine ziemlich lange Serienbezeichnung ' + i, c: 'ink', y: [1, 2, 3] }))
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

/* Eine Legende für alle Renderer (render/limits.js drawLegend): die Heatmap
   brach nach zwei Zeilen still ab, das (φ, λ)-Fenster lief ohne Grenze in
   den Plot hinein. */
test('Legende der Heatmap: was nicht passt, wird gezählt statt verschwiegen', async () => {
  const { drawAny } = await auslegung('render/draw.js');
  const { limit } = await auslegung('charts/helpers.js');
  const fill = (await auslegung('charts/fill.js')).default;
  const d = fill.calc(values());
  d.title = fill.title;
  d.limits = Array.from({ length: 12 }, (_, i) => limit('x' + i, 'Eine ziemlich lange Grenzbezeichnung ' + i, 'y', 'min', 100 + i));
  const x = rec();
  drawAny(x, 700, 600, d);
  assert.ok(x.log.texts.some(t => /^\+ \d+ weitere$/.test(t.s)), 'der Rest muss ausgewiesen werden');
});

test('Legende des (φ, λ)-Fensters: wie bei den Liniendiagrammen rückt der Plot ab', async () => {
  const { drawAny } = await auslegung('render/draw.js');
  const phild = (await auslegung('charts/phild.js')).default;
  const { computeShot } = await auslegung('core/physics.js');
  const { DEFAULT_CURVE } = await auslegung('config/fields.js');
  const v = values();
  const d = phild.calc(v, { shot: computeShot(v, DEFAULT_CURVE.map(p => p.slice())) });
  d.title = phild.title;
  const x = rec();
  drawAny(x, 340, 520, d);
  assert.ok(d._legendRows > 2, 'Testaufbau: auf der schmalsten Karte braucht die Legende mehr als zwei Zeilen');
  const f = lineFrame(340, 520, d);
  const eintraege = x.log.texts.filter(t => ['machbares Band', 'Kolben-Ø-Grenzen', 'Kammerlängen-Grenzen'].includes(t.s));
  assert.equal(eintraege.length, 3);
  assert.ok(eintraege.every(t => t.y < f.T - 5), 'eine Legendenzeile liegt im Plot: ' + eintraege.map(t => t.y) + ' / ' + f.T);
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
