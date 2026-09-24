/* Heatmaps mit Farbskala, Konturlinien und Farbbalken. Die Skala ist die
   feste Farbleiste `heat` (base.js ramp()), in jedem Schema dieselbe.
   Grenzen kommen wie bei den Liniendiagrammen aus d.limits
   (render/limits.js): Kurven statt Pixel-Maskierung — die Ausschlussfläche
   wird schraffiert, die Grenze als Kurve gezeichnet und in der Legende
   geführt. */

import { frame, heading, axes, marker, text, ramp, contours, scales, LEGEND_TOP } from './base.js';
import { fmt } from '../core/format.js';
import { drawLimits, legendItems, drawLegend } from './limits.js';
import { violates } from '../core/limits.js';

const PI = Math.PI;

export function drawHeat(x, w, h, d) {
  heading(x, w, h, d);
  const f = frame(w, h, true);
  const cw = f.pw / d.x.length, ch = f.ph / d.y.length;
  const bx = w - f.R + 18, bw = 17;
  for (let j = 0; j < d.y.length; j++) for (let i = 0; i < d.x.length; i++) {
    x.fillStyle = ramp((d.z[j][i] - d.lo) / (d.hi - d.lo));
    x.fillRect(f.L + i * cw, f.T + f.ph - (j + 1) * ch, cw + 1, ch + 1);
  }
  /* Kontur-Labels nicht in Ausschlussflächen setzen (dort unlesbar) */
  contours(x, f, d, (xv, yv) =>
    (d.limits || []).some(l => (l.severity || 'hard') === 'hard' && violates(l, xv, yv)));

  const mx0 = d.x[0], mx1 = d.x[d.x.length - 1], my0 = d.y[0], my1 = d.y[d.y.length - 1];
  const { X, Y } = scales(f, mx0, mx1, my0, my1);
  drawLimits(x, f, X, Y, d);

  axes(x, w, h, f, mx0, mx1, my0, my1, d);
  for (let i = 0; i < 100; i++) {
    x.fillStyle = ramp(1 - i / 99);
    x.fillRect(bx, f.T + i * f.ph / 100, bw, f.ph / 100 + 1);
  }
  for (let i = 0; i <= 5; i++) text(x, fmt(d.hi - i * (d.hi - d.lo) / 5), bx + bw + 5, f.T + i * f.ph / 5 + 4, 'left');
  x.save(); x.translate(w - 8, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.cl, 0, 0); x.restore();

  /* Legende der Grenzen (Heatmaps haben keine Serien-Legende). Der Rahmen
     der Heatmap wächst nicht: zwei Zeilen, der Rest wird gezählt. */
  const items = legendItems(d.limits);
  if (items.length) drawLegend(x, items, f.L, w - f.R, LEGEND_TOP, 2);

  if (d.pt) marker(x, f, X(d.pt[0]), Y(d.pt[1]), d.ptl);
}
