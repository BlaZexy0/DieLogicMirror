/* Farbtafel aus web/shared/palette.js → web/assets/palette.svg
   (deterministisch; CI prüft, dass die eingecheckte Datei aktuell ist):
     node scripts/gen-palette.mjs
   Dokumentiert die ROLLEN der Palette im Standardschema (DieLogic Teal):
   je Rolle ein Quadrat, Name, CSS-Token, Wert, wofür sie steht und der
   Kontrast auf surface und auf dark (WCAG), mit Markierung, ob die Farbe
   als Text taugt. Die Familien (Marke, Flächen, Text, Ampel, Hervorhebung,
   Sachfarben) sind die Blockkommentare in palette.js, die Rollen die
   Kommentare hinter den Werten. Am Ende die festen Farbleisten (LEISTEN):
   keine Rollen, in jedem Schema dieselben. Andere Schemata belegen die
   Rollen anders (shared/schemes.js); sie zeigt die Seite „Projekte &
   Konto" als Kacheln. */

import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
globalThis.window = globalThis;
const P = require(path.join(site, 'shared/palette.js'));

/* Rollen-Kommentare aus der Quelle lesen (// hinter dem Wert). Ein
   Gedankenstrich im Kommentar wird zum Doppelpunkt: die Tafel ist
   sichtbarer Text. */
const src = readFileSync(path.join(site, 'shared/palette.js'), 'utf8');
const roles = {};
for (const [, k, note] of src.matchAll(/^\s*(\w+):\s*'#[0-9a-f]{6}',?\s*\/\/\s*(.*)$/gm))
  roles[k] = note.trim().replace(/\s+[—–]\s+/g, ': ');
/* Rollen ohne eigenen Kommentar (die Stufen der Ampel) aus ihrem Namen:
   Schrift, Grund und Rand einer Ampelstufe. */
const STUFE = { ok: '„gut"', caution: '„knapp"', bad: '„schlecht"' };
function rolleAusName(k) {
  let m = k.match(/^(ok|caution|bad)(Text|Bg|Border)$/);
  if (m) return STUFE[m[1]] + (m[2] === 'Text' ? ' als Text' : m[2] === 'Bg' ? ': Grund eines Kastens' : ': Rand eines Kastens');
  return '';
}

/* Familien: die einzeiligen Blockkommentare im Objekt der Farben. Nur
   Gruppen mit Farben zählen (weiter unten stehen Kommentare zum Rechnen). */
const groups = [];
for (const line of src.split('\n')) {
  const g = line.match(/^\s*\/\* (.+?) \*\/\s*$/);
  if (g && !/Zuordnung|DIE Farbquelle/.test(g[1])) groups.push({ title: g[1].replace(/\s+[—–]\s+/g, ': '), keys: [] });
  const k = line.match(/^\s*(\w+):\s*'#[0-9a-f]{6}'/);
  if (k && groups.length) groups[groups.length - 1].keys.push(k[1]);
}
const familien = groups.filter(g => g.keys.length);

const lum = P.luminance, contrast = P.contrast, cssName = P.cssName;
/* Kein shared/util.js esc(): das SVG hier ist Textinhalt, kein Attribut —
   ' und " brauchen kein Escaping, und ein zusätzliches &#39; im
   generierten SVG wäre nur unnötiges Rauschen im Diff. */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const zahl = x => x.toFixed(1).replace('.', ',');

const COLS = 4, CW = 300, CH = 118, SQ = 56, PAD = 28, HEAD = 78, GAP = 34;
const VERLAEUFE = [
  ['heat', 'Jeder Messwert: Heatmaps der Auslegung, Felder im 3D-Studio, Flussschema', 'scale(\'heat\', t), theme.heatStops, sieben Stützstellen aus Turbo'],
  ['draft', 'Entformschräge: bis zum Grenzwert (t = 1/3) Rot nach Gold, darüber hell- nach sattgrün', 'scale(\'draft\', t), t = Winkel / 3·Grenzwert']
];
const VH = 58;                                     // Höhe je Verlauf
const rows = familien.reduce((n, g) => n + Math.ceil(g.keys.length / COLS), 0);
const W = PAD * 2 + COLS * CW;
const H = HEAD + PAD + familien.length * GAP + rows * CH + GAP + VERLAEUFE.length * VH + PAD;
const font = 'font-family="-apple-system,Inter,Segoe UI,Helvetica,Arial,sans-serif"';
const mono = 'font-family="JetBrains Mono,Fira Code,Menlo,monospace"';

let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" ${font} role="img" aria-label="DieLogic Farbrollen">
<rect width="${W}" height="${H}" fill="${P.surface}"/>
<text x="${PAD}" y="38" font-size="22" font-weight="700" fill="${P.text}">DieLogic: Farbrollen im Standardschema „DieLogic Teal"</text>
<text x="${PAD}" y="56" font-size="11.5" fill="${P.muted}">Quelle: web/shared/palette.js · CSS-Tokens in shared/shared.css (:root) · Diagrammrollen abgeleitet in shared/theme.js · die anderen Schemata belegen dieselben Rollen (shared/schemes.js)</text>
<text x="${PAD}" y="71" font-size="11.5" fill="${P.muted}">Kontrast nach WCAG 2.x auf surface und auf dark: T = als Text geeignet (≥ 4,5:1), t = nur groß oder fett (≥ 3:1). Ampel nur für Urteile, Sachfarben für Dinge, mark für den Betriebspunkt.</text>
`;
let y = HEAD + PAD;
for (const g of familien) {
  s += `<text x="${PAD}" y="${y + 14}" font-size="11" font-weight="700" letter-spacing="1.2" fill="${P.muted}">${esc(g.title.toUpperCase())}</text>\n`;
  y += GAP;
  g.keys.forEach((k, i) => {
    const x = PAD + (i % COLS) * CW, yy = y + Math.floor(i / COLS) * CH;
    const hex = P[k];
    const cw = contrast(hex, P.surface), cd = contrast(hex, P.dark);
    const tag = c => (c >= 4.5 ? 'T' : c >= 3 ? 't' : '–');
    const stroke = lum(hex) > 0.85 ? P.border : 'none';
    s += `<rect x="${x}" y="${yy}" width="${SQ}" height="${SQ}" rx="8" fill="${hex}" stroke="${stroke}"/>\n`;
    /* Textprobe auf dem Quadrat: Aa in surface oder in dark, je nachdem, was liest */
    s += `<text x="${x + SQ / 2}" y="${yy + SQ / 2 + 6}" text-anchor="middle" font-size="17" font-weight="700" fill="${cw >= cd ? P.surface : P.dark}">Aa</text>\n`;
    const tx = x + SQ + 12;
    s += `<text x="${tx}" y="${yy + 15}" font-size="13.5" font-weight="700" fill="${P.text}">${esc(k)}</text>\n`;
    s += `<text x="${tx}" y="${yy + 31}" font-size="11" ${mono} fill="${P.muted}">${esc(cssName(k))} · ${esc(hex)}</text>\n`;
    const role = roles[k] || rolleAusName(k);
    const lines = role.length > 38 ? [role.slice(0, role.lastIndexOf(' ', 38)), role.slice(role.lastIndexOf(' ', 38) + 1)] : [role];
    lines.forEach((ln, j) => { s += `<text x="${tx}" y="${yy + 47 + j * 13}" font-size="10.5" fill="${P.textBody}">${esc(ln)}</text>\n`; });
    s += `<text x="${tx}" y="${yy + 76}" font-size="10" ${mono} fill="${P.muted}">auf surface ${zahl(cw)}:1 ${tag(cw)}   auf dark ${zahl(cd)}:1 ${tag(cd)}</text>\n`;
  });
  y += Math.ceil(g.keys.length / COLS) * CH;
}

/* Die Farbleisten: Stützstellen, mit genau diesen gezeichnet (zwei an
   einer Stelle sind die Stufe der Entformschräge). Eine Leiste als
   Funktion bekäme dichte Stützen, zwischen denen die lineare Mischung
   nicht auffällt; zur Zeit sind beide Leisten Stützstellen. */
s += `<text x="${PAD}" y="${y + 14}" font-size="11" font-weight="700" letter-spacing="1.2" fill="${P.muted}">FARBLEISTEN (FEST, IN JEDEM SCHEMA GLEICH, KEINE ROLLEN)</text>\n`;
y += GAP;
const N = 33, BW = COLS * CW - 40;
for (const [name, was, wie] of VERLAEUFE) {
  const l = P.leisten[name];
  const stuetzen = Array.isArray(l) ? l : Array.from({ length: N }, (_, i) => [i / (N - 1), P.scale(name, i / (N - 1))]);
  s += `<linearGradient id="verlauf-${name}" x1="0" y1="0" x2="1" y2="0">`;
  for (const [t, hex] of stuetzen) s += `<stop offset="${t.toFixed(4)}" stop-color="${hex}"/>`;
  s += '</linearGradient>\n';
  s += `<rect x="${PAD}" y="${y}" width="${BW}" height="22" rx="4" fill="url(#verlauf-${name})"/>\n`;
  s += `<text x="${PAD}" y="${y + 38}" font-size="12" font-weight="700" fill="${P.text}">${esc(name)}</text>\n`;
  s += `<text x="${PAD + 60}" y="${y + 38}" font-size="11" fill="${P.textBody}">${esc(was)} · <tspan ${mono} fill="${P.muted}">${esc(wie)}</tspan></text>\n`;
  y += VH;
}
s += '</svg>\n';
writeFileSync(path.join(site, 'assets/palette.svg'), s);
console.log(`assets/palette.svg: ${Object.keys(P.colors).length} Rollen in ${familien.length} Familien, ${VERLAEUFE.length} Farbleisten`);
