/* Render-Rauchtest: alle Diagramm-calc()s mit den Dashboard-Defaults durch
   die echten Canvas-Renderer ziehen — mit gestubbtem 2D-Kontext. Fängt
   Laufzeitfehler in der Zeichen-/Grenzen-Pipeline (render/limits.js,
   line/heat/map), die reine Logiktests nicht sehen.
   Aufruf: node --test site/tests/render-smoke.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
  body: {},
};
globalThis.getComputedStyle = () => ({ fontFamily: 'Arial' });
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

/* Klassische Scripts wie auf der Seite laden (setzen window.__…__) */
require(path.join(site, 'app/config/theme.js'));
require(path.join(site, 'app/config/machines.js'));
require(path.join(site, 'app/shared/contract.js'));
require(path.join(site, 'app/shared/clampmodel.js'));
const { theme } = await import(path.join(site, 'app/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);

const { allFields, DEFAULT_CURVE } = await import(path.join(site, 'app/js/config/fields.js'));
const { computeShot } = await import(path.join(site, 'app/js/core/physics.js'));
const { drawAny } = await import(path.join(site, 'app/js/render/draw.js'));
const { charts } = await import(path.join(site, 'app/js/charts/registry.js'));

const values = {};
for (const f of allFields()) values[f.key] = f.def;
const shot = computeShot(values, DEFAULT_CURVE.map(p => p.slice()));
assert.ok(!shot.error, 'computeShot mit Defaults darf nicht fehlschlagen: ' + shot.error);

for (const def of charts) {
  const tabs = def.tabs ? def.tabs.map(t => t[0]) : [null];
  for (const tab of tabs) {
    test(`render-smoke: ${def.id}${tab ? ' [' + tab + ']' : ''}`, () => {
      if (tab) def.tab = tab;
      const d = def.calc(values, { shot });
      assert.ok(d, def.id + ': calc lieferte nichts');
      if (d.err) return;                  // Fehlermeldung ist ein gültiges Ergebnis
      d.title = d.title || def.title;
      drawAny(makeCtx(), 1000, 800, d, def);
    });
  }
}
