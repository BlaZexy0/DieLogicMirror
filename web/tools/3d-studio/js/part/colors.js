/* Farben der Formteilungs-Analyse — aus der DieLogic-Palette
   (/shared/palette.js), damit die Legende zum Rest der Website passt.

   Die sechs Richtungen brauchen Farben, die sich nebeneinander sicher
   unterscheiden lassen: die beiden Hälften bekommen die Hausfarbe Teal
   und ein kräftiges Blau, die vier Schieber die vier Kategorienfarben.
   Rot bleibt für Hinterschnitte reserviert und wird sonst nicht benutzt. */

export const REGION_COLORS = [
  '#9a77e8',   // +X  cat-purple
  '#e07b39',   // −X  cat-orange
  '#4c9f70',   // +Y  cat-green
  '#d4a908',   // −Y  gold
  '#008c82',   // +Z  primary
  '#2e6da4'    // −Z  Blau (dieselbe Farbe wie die bewegliche Temperierung)
];
export const UNDERCUT_COLOR = '#b42318';    // bad
export const OPEN_COLOR = '#9aacb4';        // muted-light — noch unentschieden

/* Entformschräge: unter dem Grenzwert von Rot nach Gold, darüber von
   hellem zu sattem Grün. */
const DRAFT_BAD = '#b42318';
const DRAFT_WARN = '#d4a908';
const DRAFT_OK = '#7cc4a0';
const DRAFT_GOOD = '#0d7a3c';
export const UNDERCUT_DARK = '#6e130c';

export const hex2rgb = h => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255
];

export function mix(a, b, t) {
  const A = hex2rgb(a), B = hex2rgb(b);
  const s = Math.max(0, Math.min(1, t));
  return [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s, A[2] + (B[2] - A[2]) * s];
}

/** Farbe für einen Entformwinkel in Grad. */
export function draftColor(deg, limit) {
  const l = Math.max(limit, 0.01);
  if (deg < l) return mix(DRAFT_BAD, DRAFT_WARN, deg / l);
  return mix(DRAFT_OK, DRAFT_GOOD, (deg - l) / (2 * l));
}

/** Mehrstufiger Verlauf: t von 0 bis 1 über die Stützstellen. */
export function ramp(stops, t) {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

/** Farbe für die Anzahl entformbarer Richtungen. */
export const COUNT_COLORS = ['#b42318', '#008c82', '#3fc2b6', '#8cbee6', '#b8ddd2', '#d7e3e6', '#e8eef0'];

/* Turbo (Google, 2019) als Polynom fünften Grades nach Mikhail Popov —
   die Standardskala für Felder: dunkelblau über Grün und Gelb nach
   Dunkelrot, in der Helligkeit fast monoton und ohne die Streifen des
   alten Regenbogens. t von 0 bis 1. */
export function turbo(t) {
  const x = Math.max(0, Math.min(1, t));
  const x2 = x * x, x3 = x2 * x, x4 = x3 * x, x5 = x4 * x;
  const c = v => Math.max(0, Math.min(1, v));
  return [
    c(0.13572138 + 4.61539260 * x - 42.66032258 * x2 + 132.13108234 * x3 - 152.94239396 * x4 + 59.28637943 * x5),
    c(0.09140261 + 2.19418839 * x + 4.84296658 * x2 - 14.18503333 * x3 + 4.27729857 * x4 + 2.82956604 * x5),
    c(0.10667330 + 12.64194608 * x - 60.58204836 * x2 + 110.36276771 * x3 - 89.90310912 * x4 + 27.34824973 * x5)
  ];
}
