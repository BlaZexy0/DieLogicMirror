/* Farben der Formteilungs-Analyse — aus der DieLogic-Palette
   (css/tokens.css), damit die Legende zum Rest der Website passt.

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

/** Farbe für die Anzahl entformbarer Richtungen. */
export const COUNT_COLORS = ['#b42318', '#008c82', '#3fc2b6', '#8cbee6', '#b8ddd2', '#d7e3e6', '#e8eef0'];
