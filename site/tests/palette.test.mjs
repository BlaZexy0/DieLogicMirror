/* Farbsystem: app/config/palette.js ist die Quelle — shared.css, main.css,
   theme.js (ui) sowie die Konstanten in nav.js/projectbar.js müssen
   dieselben Werte tragen. Dazu WCAG-Kontrast der Textfarben.
     node --test site/tests/palette.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
const P = require(path.join(site, 'app/config/palette.js'));
require(path.join(site, 'app/config/theme.js'));
const THEME = globalThis.__THEME__;
const read = f => readFileSync(path.join(site, f), 'utf8');

function rootTokens(css) {
  const m = css.match(/:root \{([^}]*)\}/);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) out[k] = v;
  return out;
}
function constBlock(js, name) {
  const m = js.match(new RegExp(name + ' = \\{([^}]*)\\}'));
  const out = {};
  for (const [, k, v] of m[1].matchAll(/(\w+): '(#[0-9a-f]{6})'/g)) out[k] = v;
  return out;
}
const cssKey = k => k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

test('palette: Werte sind 6-stellige Kleinbuchstaben-Hex, keine Dubletten bis auf text = dark', () => {
  const seen = {};
  for (const [k, v] of Object.entries(P.colors)) {
    assert.match(v, /^#[0-9a-f]{6}$/, k);
    if (seen[v] && !(k === 'text' && seen[v] === 'dark')) assert.fail(`${k} und ${seen[v]} haben denselben Wert ${v}`);
    seen[v] = k;
  }
});

test('shared.css :root spiegelt die Palette vollständig', () => {
  const tok = rootTokens(read('shared.css'));
  for (const [k, v] of Object.entries(P.colors)) assert.equal(tok[cssKey(k)], v, `--${cssKey(k)}`);
});

test('app/css/main.css :root spiegelt die Palette und nutzt keine alten Namen', () => {
  const css = read('app/css/main.css');
  const tok = rootTokens(css);
  for (const [k, v] of Object.entries(P.colors)) assert.equal(tok[cssKey(k)], v, `--${cssKey(k)}`);
  assert.doesNotMatch(css, /var\(--(green|deep|line|blue|header-from|header-to)\)/);
});

test('theme.js ui: Schlüssel sind Palettenschlüssel mit identischen Werten', () => {
  for (const [k, v] of Object.entries(THEME.ui)) {
    assert.ok(k in P.colors, `theme.ui.${k} ist kein Palettenschlüssel`);
    assert.equal(v, P.colors[k], `theme.ui.${k}`);
  }
  for (const k of ['ok', 'bad', 'muted']) assert.ok(THEME.ui[k], `theme.ui.${k} wird von den Renderern gelesen`);
});

test('nav.js und projectbar.js: Konstanten = Palette', () => {
  for (const [file, name] of [['nav.js', 'const C'], ['app/shared/projectbar.js', 'var C']]) {
    const c = constBlock(read(file), name);
    assert.ok(Object.keys(c).length > 3, file);
    for (const [k, v] of Object.entries(c)) assert.equal(v, P.colors[k], `${file}: ${k}`);
  }
});

test('keine losen Hex-Literale mehr in Seiten-Styles und nav/projectbar (außer Konstanten-Block)', () => {
  const pages = ['index.html', 'shared.css', 'kosten/teilekosten.html', 'zyklus/zyklus-analyse.html',
    'stl/stl-analyse.html', 'app/konto.html', 'recht/ueber-uns.html', 'theorie/pq2.html', 'theorie/kreissegmente.html'];
  for (const f of pages) {
    const body = read(f).replace(/:root \{[^}]*\}/, '').replace(/<meta[^>]*theme-color[^>]*>/g, '');
    const hits = [...body.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0]);
    assert.deepEqual(hits, [], `${f}: ${hits.join(', ')}`);
  }
  for (const [f, name] of [['nav.js', 'const C'], ['app/shared/projectbar.js', 'var C']]) {
    const body = read(f).replace(new RegExp(name + ' = \\{[^}]*\\}'), '');
    assert.deepEqual([...body.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0]), [], f);
  }
});

/* ── Kontrast (WCAG 2.x) ── */
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('Kontrast: Textfarben auf Weiß ≥ 4.5:1 (primary ≥ 4 für große/fette Schrift)', () => {
  const onWhite = ['dark', 'dark2', 'dark3', 'primary2', 'primaryDeep', 'textBody', 'muted', 'warn', 'warnText', 'ok', 'bad', 'catSlate'];
  for (const k of onWhite) assert.ok(contrast(P[k], P.surface) >= 4.5, `${k} auf Weiß: ${contrast(P[k], P.surface).toFixed(2)}`);
  assert.ok(contrast(P.primary, P.surface) >= 4.0);
  assert.ok(contrast(P.noteText, P.noteBg) >= 4.5);
});

test('Kontrast: Text auf dunklem Grund ≥ 4.5:1', () => {
  for (const k of ['ondark', 'ondark2', 'primaryLight', 'surface', 'gold', 'warnSoft'])
    assert.ok(contrast(P[k], P.dark) >= 4.5, `${k} auf dark: ${contrast(P[k], P.dark).toFixed(2)}`);
  assert.ok(contrast(P.surface, P.primary) >= 4.0, 'weiß auf primary (Buttons)');
});
