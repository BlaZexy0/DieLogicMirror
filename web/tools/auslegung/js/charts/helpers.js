/* Kleine Bau-Helfer für Diagrammdaten (Serien, Linien-Spezifikation, Heatmap-Raster).

   Konvention Achsenlabels (xl, yl, cl): „Größe in Einheit", z. B.
   'Kolben-Ø in mm' — der Hover (render/hover.js) löst die Einheit daraus
   und hängt sie an die Werte. Zusätze nach „ — " oder in Klammern hinter
   der Einheit sind erlaubt; einheitenlose Größen kommen ohne „ in " aus. */

import { seq } from '../core/format.js';

/* Eine Serie. c ist eine Rolle der Diagrammfarben ('ink' für die eine
   Größe, um die es geht, sonst die Sachfarbe: 'machine', 'die', 'air' …),
   aufgelöst erst beim Zeichnen (render/line.js). o: { dash, alpha, w } für
   Varianten derselben Größe — Strichmuster oder Deckkraft, keine
   Mischfarbe. */
export function series(n, c, x, fn, o) { return Object.assign({ n, c, y: x.map(fn) }, o); }

export function line(x, ys, xl, yl, info) { return { x, ys, xl, yl, info }; }

export function heat(x0, x1, y0, y1, fn, xl, yl, cl, lo, hi, levels) {
  const x = seq(x0, x1, 81), y = seq(y0, y1, 61), z = [];
  for (let j = 0; j < y.length; j++) {
    z[j] = [];
    for (let i = 0; i < x.length; i++) z[j][i] = fn(x[i], y[j]);
  }
  return { x, y, z, xl, yl, cl, lo, hi, levels };
}

/* ── Grenzen (siehe core/limits.js für das Objektmodell) ──────────
   Diagramme sammeln ihre Restriktionen in q.limits = [ … ]; die Renderer
   zeichnen Linien, Schraffuren, Zielbänder und Legende daraus. Eine neue
   Restriktion = ein weiterer Eintrag. Farbe über theme.limits[id] (die
   Familie der Grenze), explizit als Rolle in o.c. */

/* Harte Grenze: bound ist eine Zahl (konstante Schranke auf Achse `on`)
   oder eine Funktion x→y (Kurvenschranke, nur on:'y').
   kind 'min': zulässig ≥ Schranke · kind 'max': zulässig ≤ Schranke.
   o: optionale Extras ({ note, c }). */
export function limit(id, label, on, kind, bound, o) {
  const l = { id, label, on, kind, severity: 'hard' };
  if (typeof bound === 'function') l.fn = bound; else l.value = bound;
  return Object.assign(l, o);
}

/* Zielband zwischen min und max (Zahlen; bei on:'y' auch Funktionen x→y). */
export function target(id, label, on, min, max, o) {
  return Object.assign({ id, label, on, min, max, severity: 'target' }, o);
}

/* Referenzlinie ohne Ausschluss-Semantik. */
export function refline(id, label, on, value, o) {
  return Object.assign({ id, label, on, value, severity: 'ref' }, o);
}
