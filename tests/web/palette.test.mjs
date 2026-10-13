/* Farbsystem: web/shared/palette.js ist die Quelle. shared.css spiegelt
   jede Rolle als Token; theme.js und alles andere leiten ab. Dazu der
   WCAG-Kontrast der Textfarben, die Rechenhilfen der Palette (mix, rgba)
   und die festen Farbleisten (scale, lut, gradient). Dass nirgends sonst
   ein Farbwert steht, prüft tests/web/farbrollen.test.mjs; die Regeln je
   Schema schemes.test.mjs.
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

/* Gewollte Gleichstände im Standard: eine Rolle, die dort einer anderen
   gleicht, in anderen Schemata aber nicht (die Schmelze ist im Standard die
   Marke, die Achsen sind die Sachfarben von Maschine, Luft und Werkzeug). */
const GLEICH = { text: 'dark', melt: 'primary', badText: 'bad', axisX: 'machine', axisY: 'air', axisZ: 'die' };

test('palette: Werte sind 6-stellige Kleinbuchstaben-Hex, keine Dubletten außer den gewollten', () => {
  const seen = {};
  for (const [k, v] of Object.entries(P.colors)) {
    assert.match(v, /^#[0-9a-f]{6}$/, k);
    if (seen[v] && GLEICH[k] !== seen[v]) assert.fail(`${k} und ${seen[v]} haben denselben Wert ${v}`);
    if (!seen[v]) seen[v] = k;
  }
});

test('palette: die Rechenhilfen mischen im OK-Lab-Raum und folgen den Rollen', () => {
  assert.equal(P.mix('ok', 'ok', 0.5), P.ok);
  assert.equal(P.mix('#000000', '#ffffff', 0), '#000000');
  assert.equal(P.mix('#000000', '#ffffff', 1), '#ffffff');
  assert.equal(P.rgba('ok', 0.5), 'rgba(21,154,76,0.5)');
});

/* Die Farbleisten, fest und ohne Rolle: `heat`, sieben Stützstellen aus
   Turbo, für jeden Messwert (Heatmaps der Auslegung, Felder im 3D-Studio,
   Flussschema) und die Entformschräge mit ihrer Stufe am Grenzwert. Seit
   24.09. nur diese zwei: vorher las das 3D-Studio Turbo als Polynom
   (`turbo`) und das Flussschema eine eigene Leiste (`speed`). */
test('palette: die Farbleisten, heat und die Entformschräge', () => {
  /* seit 13.10. dazu rainbow und bgo, nur für die Bilder der Simulation */
  assert.deepEqual(Object.keys(P.leisten).sort(), ['bgo', 'draft', 'heat', 'rainbow']);
  assert.equal(P.scale('heat', 0), '#30123b');
  assert.equal(P.scale('heat', 0.5), '#67eb73');
  assert.equal(P.scale('heat', 1), '#7a0403');
  assert.equal(P.scale('draft', 0), '#b42318', 'unter 0° und bei 0°: Rot');
  assert.equal(P.scale('draft', 1 / 3 - 1e-9), '#d4a908', 'knapp unter dem Grenzwert: Gold');
  assert.equal(P.scale('draft', 1 / 3), '#7cc4a0', 'am Grenzwert: die Stufe ins helle Grün');
  assert.equal(P.scale('draft', 1), '#0d7a3c', 'beim Dreifachen: sattes Grün');
  assert.equal(P.scale('heat', NaN), null, 'ohne Wert keine Farbe');
  assert.equal(P.scale('heat', -1), P.scale('heat', 0), 'geklemmt');
  const t = P.lut('heat', 7);
  assert.equal(t.length, 21);
  assert.deepEqual([...t], [48, 18, 59, 55, 117, 197, 29, 172, 213, 103, 235, 115, 245, 194, 37, 250, 126, 29, 122, 4, 3]);
  assert.match(P.gradient('heat'), /^linear-gradient\(90deg, #/);
  /* Keine Rolle: kein Token, kein Schlüssel in colors. */
  for (const n of Object.keys(P.leisten)) assert.ok(!(n in P.colors), n);
});

/* Die Leisten der Simulationsbilder sind die Vorgaben von ParaView (render
   färbt mit deren Namen): Regenbogen in HSV von Blau nach Rot, darüber
   Pink; Blue - Green - Orange mit ihren 50 Stützstellen. */
test('palette: Leisten der Simulationsbilder wie in ParaView', () => {
  assert.equal(P.scale('rainbow', 0), '#0000ff');
  assert.equal(P.scale('rainbow', 0.5), '#00ff00');
  assert.equal(P.scale('rainbow', 1), '#ff0000');
  assert.equal(P.scale('rainbow', 0.125), '#0080ff', 'zwischen Blau und Cyan wie in HSV');
  assert.equal(P.ueber.rainbow, '#ff69b4');
  assert.equal(P.leisten.bgo.length, 50);
  assert.equal(P.scale('bgo', 0), '#d4e8fa');
  assert.equal(P.scale('bgo', 1), '#730200');
  for (const n of ['rainbow', 'bgo']) {
    const l = P.leisten[n];
    for (let i = 1; i < l.length; i++) assert.ok(l[i][0] > l[i - 1][0], n + ': steigend');
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

/* ── Kontrast (WCAG 2.x) ── */
const contrast = P.contrast;

test('Kontrast: Textfarben auf Weiß ≥ 4.5:1 (primary ≥ 4 für große/fette Schrift)', () => {
  const onWhite = ['dark', 'dark2', 'dark3', 'primary2', 'primaryDeep', 'textBody', 'muted', 'okText', 'cautionText', 'badText', 'mark'];
  for (const k of onWhite) assert.ok(contrast(P[k], P.surface) >= 4.5, `${k} auf Weiß: ${contrast(P[k], P.surface).toFixed(2)}`);
  assert.ok(contrast(P.primary, P.surface) >= 4.0);
  for (const l of ['ok', 'caution', 'bad']) assert.ok(contrast(P[l + 'Text'], P[l + 'Bg']) >= 4.5, l + 'Text auf ' + l + 'Bg');
});

test('Kontrast: Text auf dunklem Grund ≥ 4.5:1', () => {
  for (const k of ['ondark', 'ondark2', 'primaryLight', 'surface', 'caution'])
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
