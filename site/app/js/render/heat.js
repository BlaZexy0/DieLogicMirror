/* Heatmaps mit Farbrampe, Konturlinien und Farbbalken. Grenzen kommen wie
   bei den Liniendiagrammen aus d.limits (render/limits.js): Kurven statt
   Pixel-Maskierung — die Ausschlussfläche wird schraffiert, die Grenze als
   Kurve gezeichnet und in der Legende geführt. */

import { frame, heading, axes, marker, text, turbo, contours } from './base.js';
import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { drawLimits, legendItems, drawLegendSwatch } from './limits.js';

const PI = Math.PI;

export function drawHeat(x, w, h, d) {
  heading(x, w, h, d);
  const f = frame(w, h, true);
  const cw = f.pw / d.x.length, ch = f.ph / d.y.length;
  const bx = w - f.R + 18, bw = 17;
  for (let j = 0; j < d.y.length; j++) for (let i = 0; i < d.x.length; i++) {
    x.fillStyle = turbo((d.z[j][i] - d.lo) / (d.hi - d.lo));
    x.fillRect(f.L + i * cw, f.T + f.ph - (j + 1) * ch, cw + 1, ch + 1);
  }
  contours(x, f, d);

  const mx0 = d.x[0], mx1 = d.x[d.x.length - 1], my0 = d.y[0], my1 = d.y[d.y.length - 1];
  const X = a => f.L + (a - mx0) / (mx1 - mx0) * f.pw;
  const Y = a => f.T + (my1 - a) / (my1 - my0) * f.ph;
  drawLimits(x, f, X, Y, d);

  axes(x, w, h, f, mx0, mx1, my0, my1, d);
  for (let i = 0; i < 100; i++) {
    x.fillStyle = turbo(1 - i / 99);
    x.fillRect(bx, f.T + i * f.ph / 100, bw, f.ph / 100 + 1);
  }
  for (let i = 0; i <= 5; i++) text(x, fmt(d.hi - i * (d.hi - d.lo) / 5), bx + bw + 5, f.T + i * f.ph / 5 + 4, 'left');
  x.save(); x.translate(w - 8, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.cl, 0, 0); x.restore();

  /* Legende der Grenzen (Heatmaps haben keine Serien-Legende) */
  const items = legendItems(d.limits);
  if (items.length) {
    let lx = f.L, ly = 70;
    x.font = '10.5px Arial';
    for (const it of items) {
      const tw = x.measureText(it.label).width;
      if (lx + 17 + tw > w - f.R) { lx = f.L; ly += 13; }
      if (ly > f.T - 9) break;
      drawLegendSwatch(x, it, lx, ly);
      x.fillStyle = theme.chart.text; x.textAlign = 'left'; x.font = '10.5px Arial';
      x.fillText(it.label, lx + 17, ly);
      lx += 17 + tw + 14;
    }
  }

  if (d.pt) marker(x, f, X(d.pt[0]), Y(d.pt[1]), d.ptl);
}
