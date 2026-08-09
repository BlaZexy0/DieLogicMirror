/* Kleine Bau-Helfer für Diagrammdaten (Serien, Linien-Spezifikation, Heatmap-Raster). */

import { seq } from '../core/format.js';

export function series(n, c, x, fn) { return { n, c, y: x.map(fn) }; }

export function line(x, ys, xl, yl, info) { return { x, ys, xl, yl, info }; }

export function heat(x0, x1, y0, y1, fn, xl, yl, cl, lo, hi, levels) {
  const x = seq(x0, x1, 81), y = seq(y0, y1, 61), z = [];
  for (let j = 0; j < y.length; j++) {
    z[j] = [];
    for (let i = 0; i < x.length; i++) z[j][i] = fn(x[i], y[j]);
  }
  return { x, y, z, xl, yl, cl, lo, hi, levels };
}
