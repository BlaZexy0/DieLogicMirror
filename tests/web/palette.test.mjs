/* Farbsystem: web/shared/palette.js ist die Quelle — shared.css, main.css,
   theme.js (ui) sowie die Konstanten in nav.js/projectbar.js müssen
   dieselben Werte tragen. Dazu WCAG-Kontrast der Textfarben.
     node --test tests/web/palette.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
globalThis.window = globalThis;
const P = require(path.join(site, 'shared/palette.js'));
require(path.join(site, 'shared/theme.js'));
const THEME = globalThis.__THEME__;
const read = f => readFileSync(path.join(site, f), 'utf8');

function rootTokens(css) {
  const m = css.match(/:root \{([^}]*)\}/);
  const out = {};
  for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})/g)) out[k] = v;
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
  const tok = rootTokens(read('shared/shared.css'));
  for (const [k, v] of Object.entries(P.colors)) assert.equal(tok[cssKey(k)], v, `--${cssKey(k)}`);
});

test('tools/auslegung/css/main.css hat keinen eigenen :root und keine alten Token-Namen', () => {
  const css = read('tools/auslegung/css/main.css');
  assert.doesNotMatch(css, /:root \{/);
  assert.doesNotMatch(css, /var\(--(green|deep|line|blue|header-from|header-to)\)/);
});

test('theme.js hat keinen ui-Block mehr (UI-Farben = palette.js)', () => {
  assert.equal(THEME.ui, undefined);
});

test('keine losen Hex-Literale mehr in Seiten-Styles und nav/projectbar', () => {
  const pages = ['index.html', 'shared/shared.css', 'tools/teilekosten/index.html', 'tools/zyklus/index.html',
    'tools/sprengflaeche/index.html', 'konto/index.html', 'recht/ueber-uns.html', 'theorie/pq2.html', 'theorie/kreissegmente.html'];
  for (const f of pages) {
    const body = read(f).replace(/:root \{[^}]*\}/, '').replace(/<meta[^>]*theme-color[^>]*>/g, '');
    const hits = [...body.matchAll(/#[0-9a-f]{6}\b/gi)].map(m => m[0]);
    assert.deepEqual(hits, [], `${f}: ${hits.join(', ')}`);
  }
  for (const [f, name] of [['shared/nav.js', 'const C'], ['shared/projectbar.js', 'var C']]) {
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

/* Piktogramme der Startseite (web/assets/icons/*.svg): per <use href="…#icon">
   eingebunden — die Datei muss wohlgeformtes XML sein (kein „--" in Kommentaren,
   sonst bleibt die Kachel leer), ein <symbol id="icon"> tragen und ihre
   Farb-Fallbacks müssen den Palettenwerten entsprechen. */
test('assets/icons: wohlgeformt, Symbol „icon", Fallback-Farben = Palette', () => {
  const { readdirSync } = require('node:fs');
  const dir = path.join(site, 'assets/icons');
  const files = readdirSync(dir).filter(f => f.endsWith('.svg'));
  assert.ok(files.length >= 10, 'Icons fehlen');
  for (const f of files) {
    const svg = read('assets/icons/' + f);
    for (const [, c] of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.doesNotMatch(c, /--/, `${f}: „--" im XML-Kommentar`);
    assert.match(svg, /<symbol id="icon"/, `${f}: <symbol id="icon"> fehlt`);
    assert.doesNotMatch(svg, /var\(--[a-z-]+\)/, `${f}: var() ohne Fallback`);
    for (const [, name, hex] of svg.matchAll(/var\(--([a-z-]+), (#[0-9a-f]{6})\)/g))
      assert.equal(hex, P.colors[name.replace(/-([a-z])/g, (m, ch) => ch.toUpperCase())], `${f}: Fallback für --${name}`);
  }
});
