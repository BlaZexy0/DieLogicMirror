/* Render-Rauchtest: alle Diagramm-calc()s mit den Dashboard-Defaults durch
   die echten Canvas-Renderer ziehen — mit gestubbtem 2D-Kontext. Fängt
   Laufzeitfehler in der Zeichen-/Grenzen-Pipeline (render/limits.js,
   line/heat/map), die reine Logiktests nicht sehen.
   Aufruf: node --test tests/web/render-smoke.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

/* ── Mini-DOM: gerade genug für die Renderer ── */
globalThis.window = globalThis;

class Path2DStub {
  moveTo() {} lineTo() {} closePath() {} rect() {} arc() {} addPath() {}
}
globalThis.Path2D = Path2DStub;

function makeCtx() {
  const target = {
    measureText: s => ({ width: String(s).length * 6 }),
    createPattern: () => ({}),
    getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (typeof k === 'symbol') return undefined;
      if (k in t) return t[k];
      return () => {};                    // jede Methode ist ein No-Op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => makeCtx() }),
  documentElement: {},
  body: {},
};
globalThis.getComputedStyle = () => ({ fontFamily: 'Arial', getPropertyValue: () => '' });
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

/* Klassische Scripts wie auf der Seite laden (setzen window.__…__) */
require(path.join(site, 'shared/palette.js'));
require(path.join(site, 'shared/theme.js'));
require(path.join(site, 'shared/examples/machines.js'));
require(path.join(site, 'shared/project.js'));
require(path.join(site, 'shared/clampmodel.js'));
const { theme } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/theme.js')));
Object.assign(theme, globalThis.__THEME__);

const { allFields, DEFAULT_CURVE } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/config/fields.js')));
const { computeShot } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/core/physics.js')));
const { drawAny } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/render/draw.js')));
const { charts } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/charts/registry.js')));

const values = {};
for (const f of allFields()) values[f.key] = f.def;
const shot = computeShot(values, DEFAULT_CURVE.map(p => p.slice()));
assert.ok(!shot.error, 'computeShot mit Defaults darf nicht fehlschlagen: ' + shot.error);

/* ── Füllkammer-Schema: SVG-String je Variante prüfen ── */
const { buildSvg } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/ui/chamber.js')));

for (const va of ['A', 'B', 'C']) {
  test('chamber-svg: Variante ' + va + ' vollständig und ohne NaN', () => {
    const svg = buildSvg(values, va);
    for (const t of ['aktive Länge L', 'Füllgrad φ', 'Kammerrohr ≠ L',
      'Einfüllöffnung verschlossen', 'Trennebene', 'Dosiergewicht'])
      assert.ok(svg.includes(t), `Variante ${va}: „${t}" fehlt im SVG`);
    assert.ok(!svg.includes('NaN'), `Variante ${va}: NaN im SVG`);
  });
}

test('chamber-svg: nicht-finite Eingaben lassen keine Elemente verschwinden', () => {
  const svg = buildSvg(Object.assign({}, values,
    { sealStroke: undefined, vacStart: NaN, density: NaN, length: NaN }), 'A');
  assert.ok(!svg.includes('NaN'), 'NaN-Koordinaten im SVG');
  const walls = (svg.match(/url\(#ch-steel\)/g) || []).length;
  assert.equal(walls, 4, 'Kammerwände fehlen (3 Wand-Rechtecke + Ring der Frontansicht)');
});

for (const def of charts) {
  const tabs = def.tabs ? def.tabs.map(t => t[0]) : [null];
  const tabs2 = def.tabs2 ? def.tabs2.map(t => t[0]) : [null];
  for (const tab of tabs) for (const tab2 of tabs2) {
    test(`render-smoke: ${def.id}${tab ? ' [' + tab + ']' : ''}${tab2 ? ' [' + tab2 + ']' : ''}`, () => {
      if (tab) def.tab = tab;
      if (tab2) def.tab2 = tab2;
      const d = def.calc(values, { shot });
      assert.ok(d, def.id + ': calc lieferte nichts');
      if (d.err) return;                  // Fehlermeldung ist ein gültiges Ergebnis
      d.title = d.title || def.title;
      drawAny(makeCtx(), 1000, 800, d, def);
    });
  }
}

/* ── Entartete Eingaben ────────────────────────────────────────────────────
   Die Suite prüfte bisher ausschließlich die Defaults. Genau dort steckte
   C-8: „Anschnittfläche" leeren → gate = 0 → NaN-Feld → turbo(NaN) wirft →
   alle 11 Diagramme NACH window in der Registry behalten still ihr altes
   Bild. Ein Diagramm darf auf jede Eingabe entweder zeichnen oder eine
   Fehlermeldung liefern — werfen darf es nie. */
const DEGENERATE = [
  ['leer (0)', 0],
  ['negativ', -1],
  ['nicht endlich', NaN],
  ['sehr groß', 1e12],
];
const KEYS = ['gate', 'vmax', 'diam', 'length', 'part', 'density', 'vent',
  'injForce', 'gateMin', 'gateMax', 'Tliq', 'Tdie', 'wall'];

for (const [label, bad] of DEGENERATE) {
  for (const key of KEYS) {
    test(`entartet: ${key} = ${label} — kein Diagramm wirft`, () => {
      const v = Object.assign({}, values, { [key]: bad });
      const s = computeShot(v, DEFAULT_CURVE.map(p => p.slice()));
      for (const def of charts) {
        let d;
        assert.doesNotThrow(() => { d = def.calc(v, { shot: s }); },
          `${def.id}.calc() wirft bei ${key} = ${label}`);
        assert.ok(d, `${def.id}: calc lieferte nichts bei ${key} = ${label}`);
        if (d.err) continue;
        d.title = d.title || def.title;
        assert.doesNotThrow(() => drawAny(makeCtx(), 1000, 800, d, def),
          `${def.id}: Zeichnen wirft bei ${key} = ${label}`);
      }
    });
  }
}

test('ramp(): nicht endliche Werte werfen nicht, sondern bleiben leer', async () => {
  const { ramp } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/render/base.js')));
  for (const t of [NaN, Infinity, -Infinity, undefined, null]) {
    assert.doesNotThrow(() => ramp(t), `ramp(${t}) wirft`);
  }
  assert.equal(ramp(NaN), 'rgba(0,0,0,0)');
  assert.match(ramp(0), /^rgb\(/);
  assert.match(ramp(1), /^rgb\(/);
});

/* Die Heatmaps färben mit der festen Farbleiste `heat` der Palette, alle,
   auch v_krit: eine Farbleiste ist ein Maßstab und folgt dem Schema nicht
   (die Leisten von vorher, Wunsch vom 23.09.). */
test('ramp(): die feste Leiste heat, von Dunkelviolett nach Dunkelrot', async () => {
  const { ramp } = await import(pathToFileURL(path.join(site, 'tools/auslegung/js/render/base.js')));
  const P = globalThis.__PALETTE__;
  const rgb = hex => 'rgb(' + P.hexRgb(hex).map(u => Math.round(u * 255)).join(',') + ')';
  const heat = P.leisten.heat;
  assert.equal(ramp(0), 'rgb(48,18,59)');
  assert.equal(ramp(1), 'rgb(122,4,3)');
  heat.forEach(([t, hex]) => assert.equal(ramp(t), rgb(hex), 'Stützstelle bei ' + t.toFixed(3)));
  for (const id of ['fill', 'filltime', 'window', 'slowshot']) {
    const q = charts.find(c => c.id === id).calc(values, { shot });
    assert.equal(q.ramp, undefined, id + ': keine eigene Skala je Diagramm');
  }
});

/* Zusammenfallende Grenzenpaare: gateMin = gateMax, dmin = dmax,
   wallMin = wallMax. Genau hier fehlte der linken y-Achse der
   Null-Spannen-Schutz, den die rechte zwei Zeilen später hat — die
   Diagramme blieben leer (H-17). */
const EQUAL_PAIRS = [
  ['gateMin', 'gateMax', 40],
  ['dmin', 'dmax', 120],
  ['wallMin', 'wallMax', 3],
  ['fillMin', 'fillMax', 50],
];
for (const [a, b, val] of EQUAL_PAIRS) {
  test(`entartet: ${a} = ${b} = ${val} — kein Diagramm wirft`, () => {
    const v = Object.assign({}, values, { [a]: val, [b]: val });
    const s = computeShot(v, DEFAULT_CURVE.map(p => p.slice()));
    for (const def of charts) {
      let d;
      assert.doesNotThrow(() => { d = def.calc(v, { shot: s }); }, `${def.id}.calc() wirft`);
      assert.ok(d, `${def.id}: calc lieferte nichts`);
      if (d.err) continue;
      d.title = d.title || def.title;
      assert.doesNotThrow(() => drawAny(makeCtx(), 1000, 800, d, def), `${def.id}: Zeichnen wirft`);
    }
  });
}
