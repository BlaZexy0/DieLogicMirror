/* Icon-Sprite für web/index.html aus web/assets/icons/*.svg erzeugen.

   Warum: die Seite band die Icons über <use href="/assets/icons/x.svg#icon">
   ein — eine EXTERNE Referenz, die Safari nicht auflöst. Dort blieben alle
   elf Icons unsichtbar. Ein Sprite im Dokument selbst funktioniert überall.

   Die SVG-Dateien bleiben die Quelle (sie sind auch einzeln ansehbar); der
   Sprite wird zwischen die Marker in index.html geschrieben. Neu erzeugen:
     node scripts/gen-icon-sprite.mjs
   Die CI prüft mit `git diff --exit-code`, dass er zum Stand passt. */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDir = path.join(root, 'web', 'assets', 'icons');
const page = path.join(root, 'web', 'index.html');

const START = '<!-- ICON-SPRITE:BEGIN — erzeugt von scripts/gen-icon-sprite.mjs, nicht von Hand editieren -->';
const END = '<!-- ICON-SPRITE:END -->';

const files = readdirSync(iconDir).filter(f => f.endsWith('.svg')).sort();
const symbols = files.map(f => {
  const src = readFileSync(path.join(iconDir, f), 'utf8');
  const m = src.match(/<symbol\b([^>]*)>([\s\S]*?)<\/symbol>/);
  if (!m) throw new Error(f + ': kein <symbol> gefunden');
  const attrs = m[1].replace(/\s*id="[^"]*"/, '');
  const id = 'icon-' + f.replace(/\.svg$/, '');
  /* Die Einzeldateien tragen einen Hex-Rückfall (var(--primary, #008c82)),
     damit sie auch außerhalb der Seite ansehbar sind. Im Dokument sind die
     Variablen definiert — dort ist der Rückfall überflüssig und wäre ein
     loses Farbliteral in der Seite (tests/web/palette.test.mjs). */
  const body = m[2].replace(/var\((--[\w-]+),\s*#[0-9a-fA-F]{3,8}\)/g, 'var($1)');
  return `  <symbol id="${id}"${attrs}>${body.replace(/\n\s*/g, '\n    ').trimEnd()}\n  </symbol>`;
});

const sprite = [
  START,
  '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute">',
  ...symbols,
  '</svg>',
  END,
].join('\n');

let html = readFileSync(page, 'utf8');
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < 0) throw new Error('Marker ICON-SPRITE:BEGIN/END fehlen in web/index.html');
html = html.slice(0, a) + sprite + html.slice(b + END.length);

/* Externe Referenzen auf den Sprite umbiegen — dieselbe Regel wie oben. */
html = html.replace(/href="\/assets\/icons\/([\w-]+)\.svg#icon"/g, 'href="#icon-$1"');
writeFileSync(page, html);
console.log(`geschrieben: Icon-Sprite mit ${files.length} Symbolen in web/index.html`);
