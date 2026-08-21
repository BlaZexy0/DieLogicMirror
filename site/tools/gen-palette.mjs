/* Farbtafel aus app/config/palette.js → assets/palette.svg
   (deterministisch; CI prüft, dass die eingecheckte Datei aktuell ist):
     node site/tools/gen-palette.mjs
   Je Farbe: Quadrat, Name, CSS-Variable, Hex, Rolle, Kontrast auf Weiß und
   auf Petrol (WCAG), mit Markierung, ob die Farbe als Text taugt. */

import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
const P = require(path.join(site, 'app/config/palette.js'));

/* Rollen-Kommentare aus der Quelle lesen (// hinter dem Wert) */
const src = readFileSync(path.join(site, 'app/config/palette.js'), 'utf8');
const roles = {};
for (const [, k, note] of src.matchAll(/^\s*(\w+):\s*'#[0-9a-f]{6}',?\s*\/\/\s*(.*)$/gm)) roles[k] = note.trim();
const groups = [];
for (const line of src.split('\n')) {
  const g = line.match(/^\s*\/\* (.+?) \*\/\s*$/);
  if (g && !/Zuordnung|DIE Farbquelle/.test(g[1])) groups.push({ title: g[1], keys: [] });
  const k = line.match(/^\s*(\w+):\s*'#[0-9a-f]{6}'/);
  if (k && groups.length) groups[groups.length - 1].keys.push(k[1]);
}

function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const cssName = k => '--' + k.replace(/[A-Z]/g, c => '-' + c.toLowerCase());

const COLS = 4, CW = 300, CH = 118, SQ = 56, PAD = 28, HEAD = 64, GAP = 34;
const rows = groups.reduce((n, g) => n + Math.ceil(g.keys.length / COLS), 0);
const W = PAD * 2 + COLS * CW;
const H = HEAD + PAD + groups.length * GAP + rows * CH + PAD;
const font = 'font-family="-apple-system,Inter,Segoe UI,Helvetica,Arial,sans-serif"';
const mono = 'font-family="JetBrains Mono,Fira Code,Menlo,monospace"';

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${font} role="img" aria-label="DieLogic Farbpalette">
<rect width="${W}" height="${H}" fill="${P.surface}"/>
<text x="${PAD}" y="38" font-size="22" font-weight="700" fill="${P.dark}">DieLogic — Farbpalette</text>
<text x="${PAD}" y="56" font-size="11.5" fill="${P.muted}">Quelle: site/app/config/palette.js · Spiegel in shared.css, app/css/main.css (:root) und config/theme.js (ui) · Kontrast nach WCAG 2.x, T = als Text geeignet (≥ 4,5:1), t = nur groß/fett (≥ 3:1)</text>
`;
let y = HEAD + PAD;
for (const g of groups) {
  s += `<text x="${PAD}" y="${y + 14}" font-size="11" font-weight="700" letter-spacing="1.2" fill="${P.muted}">${esc(g.title.toUpperCase())}</text>\n`;
  y += GAP;
  g.keys.forEach((k, i) => {
    const x = PAD + (i % COLS) * CW, yy = y + Math.floor(i / COLS) * CH;
    const hex = P[k];
    const cw = contrast(hex, P.surface), cd = contrast(hex, P.dark);
    const tag = c => (c >= 4.5 ? 'T' : c >= 3 ? 't' : '–');
    const stroke = lum(hex) > 0.85 ? P.border : 'none';
    s += `<rect x="${x}" y="${yy}" width="${SQ}" height="${SQ}" rx="8" fill="${hex}" stroke="${stroke}"/>\n`;
    /* Textprobe auf dem Quadrat: Aa in Weiß und in Petrol, je nach Helligkeit */
    s += `<text x="${x + SQ / 2}" y="${yy + SQ / 2 + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${cw >= cd ? P.surface : P.dark}">Aa</text>\n`;
    const tx = x + SQ + 12;
    s += `<text x="${tx}" y="${yy + 15}" font-size="13.5" font-weight="700" fill="${P.dark}">${esc(k)}</text>\n`;
    s += `<text x="${tx}" y="${yy + 31}" font-size="11" ${mono} fill="${P.muted}">${esc(cssName(k))} · ${esc(hex)}</text>\n`;
    const role = roles[k] || '';
    const lines = role.length > 38 ? [role.slice(0, role.lastIndexOf(' ', 38)), role.slice(role.lastIndexOf(' ', 38) + 1)] : [role];
    lines.forEach((ln, j) => { s += `<text x="${tx}" y="${yy + 47 + j * 13}" font-size="10.5" fill="${P.textBody}">${esc(ln)}</text>\n`; });
    s += `<text x="${tx}" y="${yy + 76}" font-size="10" ${mono} fill="${P.muted}">auf Weiß ${cw.toFixed(1)}:1 ${tag(cw)}   auf Petrol ${cd.toFixed(1)}:1 ${tag(cd)}</text>\n`;
  });
  y += Math.ceil(g.keys.length / COLS) * CH;
}
s += '</svg>\n';
writeFileSync(path.join(site, 'assets/palette.svg'), s);
console.log(`assets/palette.svg: ${Object.keys(P.colors).length} Farben in ${groups.length} Gruppen`);
