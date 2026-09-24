/* Farbrollen: jede Farbe der Website kommt aus der Palette und damit aus dem
   gewählten Schema. Seit dem Umbau vom 22.09. gilt ohne Ausnahme:
     · Im Code steht keine Farbe, sondern eine Rolle: ein CSS-Token
       (var(--melt)), ein Schlüssel von window.__PALETTE__ (P.melt,
       pal('melt')), eine Rolle der Diagramme (theme.chart.die) oder eine
       der festen Farbleisten (P.scale('turbo', t)). Ein Farbwert darf nur
       als Rückfall stehen, und dann genau mit dem Standardwert seiner
       Rolle: var(--melt, #008c82), pal('melt', '#008c82'), bei einer
       Farbleiste mit ihren Stützstellen: leiste('draft', [[0, '#b42318'],
       …]) wie in palette.js.
     · Die alten Namen gibt es nicht mehr: --warn (Magenta), --warn-text,
       --warn-border, --note-*, --gold, --cat-* und ihre Schlüssel. Was
       sie bedeuteten, ist jetzt eine Rolle (Ampel, Hervorhebung, Sachfarbe).
     · Text in einer Ampelfarbe nimmt die Textstufe (--ok-text,
       --caution-text, --bad-text): die Signalfarben sind für Linien und
       Flächen gemacht und in manchen Schemata als Schrift zu hell.
     · Die Theorie-Bilder tragen zu jeder Farbe ihre Rolle als Klasse
       (f-melt, s-steel-dark, c-ok), der Farbwert daneben ist der Standard
       dieser Rolle (shared/svgfarben.js setzt die Bilder in die Seite).
   Erlaubt bleiben Licht und Schatten ohne Farbton (Weiß und Schwarz mit
   Deckkraft), `transparent` und das <meta name="theme-color">, das
   schemes.js beim Laden umschreibt.

     node --test tests/web/farbrollen.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
globalThis.window = globalThis;
const P = require(path.join(root, 'web/shared/palette.js'));
/* Was git kennt, neu oder schon eingecheckt; eine gelöschte, aber noch
   nicht ausgetragene Datei fällt heraus. */
const tracked = globs => execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ...globs], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(f => f && existsSync(path.join(root, f)));
const read = f => readFileSync(path.join(root, f), 'utf8');

const DEF = {};                                   // Token-Name → Standardwert
for (const [k, v] of Object.entries(P.colors)) DEF[P.cssName(k).slice(2)] = v;
const KEY = Object.fromEntries(Object.entries(P.colors));   // Schlüssel → Standardwert

const QUELLEN = tracked(['web/*.js', 'web/**/*.js', 'web/*.css', 'web/**/*.css', 'web/*.html', 'web/**/*.html'])
  .filter(f => !/\/vendor\//.test(f) && !/shared\/(palette|schemes)\.js$/.test(f));

/* Kommentare fallen weg: dort darf von Farben die Rede sein. */
function ohneKommentare(src, f) {
  let s = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '));
  if (f.endsWith('.html')) s = s.replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ' '));
  if (/\.(m?js|html)$/.test(f)) s = s.replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
  return s;
}

const ALT = ['warn', 'warn-soft', 'warn-bg', 'warn-text', 'warn-border', 'gold', 'note-bg', 'note-border', 'note-text',
  'cat-purple', 'cat-green', 'cat-slate', 'cat-orange', 'cat-blue'];
const ALT_KEYS = ['warn', 'warnSoft', 'warnBg', 'warnText', 'warnBorder', 'gold', 'noteBg', 'noteBorder', 'noteText',
  'catPurple', 'catGreen', 'catSlate', 'catOrange', 'catBlue'];

test('die alten Farbnamen kommen nirgends mehr vor', () => {
  const tok = new RegExp('var\\(--(' + ALT.join('|') + ')\\s*[,)]');
  const key = new RegExp('(__PALETTE__|\\bP|\\bC|\\bPAL|\\bpalette|\\bc)\\.(' + ALT_KEYS.join('|') + ')\\b|\\bpal\\(\\s*[\'"](' + ALT_KEYS.join('|') + ')[\'"]');
  const falsch = [];
  for (const f of QUELLEN) {
    const s = ohneKommentare(read(f), f);
    s.split('\n').forEach((z, i) => { if (tok.test(z) || key.test(z)) falsch.push(f + ':' + (i + 1) + '  ' + z.trim().slice(0, 100)); });
  }
  assert.deepEqual(falsch, [], falsch.length + ' Stellen mit alten Namen');
});

/* Farbwerte im Code. Erlaubt: Rückfall = Standard der Rolle oder die
   Stützstellen einer Farbleiste, Weiß/Schwarz mit Deckkraft, transparent,
   theme-color. */
const WERT = /#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F-])|\b0x[0-9a-fA-F]{6}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)|hsla?\([^)]*\)/g;
const NEUTRAL = /^(#fff|#ffffff|#000|#000000|0xffffff|0x000000|rgba?\(\s*(255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*(,[^)]*)?\))$/i;
const norm = h => {
  h = h.toLowerCase();
  if (/^0x/.test(h)) return '#' + h.slice(2);
  if (/^#[0-9a-f]{3}$/.test(h)) return '#' + h.slice(1).split('').map(c => c + c).join('');
  return h;
};

test('keine Farbwerte im Code außer Rückfällen, die dem Standard ihrer Rolle gleichen', () => {
  const falsch = [];
  for (const f of QUELLEN) {
    const s = ohneKommentare(read(f), f).replace(/<meta[^>]*theme-color[^>]*>/g, ' ');
    s.split('\n').forEach((z, i) => {
      /* Die Tokens selbst (shared.css :root) und Rückfälle auf ihre Rolle
         prüfen und herausnehmen */
      let rest = z.replace(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g, (m, t, h) => {
        if (DEF[t] !== norm(h)) falsch.push(`${f}:${i + 1}  Token --${t}: ${h}, die Palette sagt ${DEF[t] || '(keine Rolle)'}`);
        return ' ';
      });
      rest = rest.replace(/var\(--([a-z0-9-]+)\s*,\s*(#[0-9a-fA-F]{3,8})\s*\)/g, (m, t, h) => {
        if (DEF[t] !== norm(h)) falsch.push(`${f}:${i + 1}  Rückfall ${h} für --${t}, Standard ist ${DEF[t] || '(keine Rolle)'}`);
        return ' ';
      });
      rest = rest.replace(/\bpal\(\s*'([A-Za-z0-9]+)'\s*,\s*'(#[0-9a-fA-F]{3,8})'\s*\)/g, (m, k, h) => {
        if (KEY[k] !== norm(h)) falsch.push(`${f}:${i + 1}  Rückfall ${h} für pal('${k}'), Standard ist ${KEY[k] || '(keine Rolle)'}`);
        return ' ';
      });
      rest = rest.replace(/\bleiste\(\s*'([a-z]+)'\s*,\s*(\[\[.*?\]\])\s*\)/g, (m, k, arr) => {
        const soll = Array.isArray(P.leisten[k]) ? P.leisten[k].map(st => st[1]).join() : '(keine Leiste mit Stützstellen)';
        const ist = (arr.match(/#[0-9a-fA-F]{6}/g) || []).map(norm).join();
        if (ist !== soll) falsch.push(`${f}:${i + 1}  Rückfall der Leiste ${k}: ${ist}, die Palette sagt ${soll}`);
        return ' ';
      });
      for (const m of rest.match(WERT) || []) {
        if (NEUTRAL.test(m.trim())) continue;
        falsch.push(`${f}:${i + 1}  ${m}   ${z.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(falsch, [], falsch.length + ' Farbwerte ohne Rolle');
});

test('Text in Ampelfarben nimmt die Textstufe', () => {
  const falsch = [];
  for (const f of QUELLEN.filter(f => /\.(css|html)$/.test(f))) {
    const s = ohneKommentare(read(f), f);
    s.split('\n').forEach((z, i) => {
      if (/(^|[;{\s"])color\s*:\s*var\(--(ok|caution|bad)\)/.test(z)) falsch.push(`${f}:${i + 1}  ${z.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(falsch, []);
});

test('Theorie-Bilder: jede Farbe trägt ihre Rolle, der Wert ist deren Standard', () => {
  const falsch = [];
  for (const f of tracked(['web/assets/theorie/*.svg', 'web/assets/team-mockup.svg'])) {
    const svg = read(f);
    for (const m of svg.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)) {
      const attrs = m[2];
      const klassen = ((attrs.match(/\bclass="([^"]*)"/) || [])[1] || '').split(/\s+/);
      for (const [attr, pre] of [['fill', 'f'], ['stroke', 's'], ['stop-color', 'c']]) {
        const w = (attrs.match(new RegExp('\\s' + attr + '="([^"]*)"')) || [])[1];
        if (!w || w === 'none' || w.startsWith('url(')) continue;
        if (NEUTRAL.test(w)) continue;
        const rolle = klassen.find(k => k.startsWith(pre + '-'));
        if (!rolle) { falsch.push(`${f}: <${m[1]} ${attr}="${w}"> ohne Rollenklasse ${pre}-…`); continue; }
        const t = rolle.slice(2);
        if (DEF[t] !== norm(w)) falsch.push(`${f}: ${rolle} mit ${w}, Standard ist ${DEF[t] || '(keine Rolle)'}`);
      }
      if (/\bstyle="[^"]*(#[0-9a-f]{3,6}|rgba?\()/i.test(attrs)) falsch.push(`${f}: Farbe im style-Attribut von <${m[1]}>`);
    }
  }
  assert.deepEqual(falsch, [], falsch.length + ' Farben ohne Rolle in den Theorie-Bildern');
});
