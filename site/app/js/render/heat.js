/* Heatmaps mit Farbrampe, Konturlinien und Farbbalken. */

import { frame, heading, axes, marker, text, turbo, contours } from './base.js';
import { fmt } from '../core/format.js';

const PI = Math.PI;

/* Werte über d.hi bei gesetztem d.capHi: außerhalb des zulässigen
   Bereichs — grau statt gesättigter Rampenfarbe. */
const CAP_GRAY = '#b0bcc0';

export function drawHeat(x, w, h, d) {
  heading(x, w, h, d);
  const f = frame(w, h, true);
  const cw = f.pw / d.x.length, ch = f.ph / d.y.length;
  const bx = w - f.R + 18, bw = 17;
  for (let j = 0; j < d.y.length; j++) for (let i = 0; i < d.x.length; i++) {
    const t = (d.z[j][i] - d.lo) / (d.hi - d.lo);
    x.fillStyle = d.capHi && t > 1 ? CAP_GRAY : turbo(t);
    x.fillRect(f.L + i * cw, f.T + f.ph - (j + 1) * ch, cw + 1, ch + 1);
  }
  contours(x, f, d);
  axes(x, w, h, f, d.x[0], d.x[d.x.length - 1], d.y[0], d.y[d.y.length - 1], d);
  for (let i = 0; i < 100; i++) {
    x.fillStyle = turbo(1 - i / 99);
    x.fillRect(bx, f.T + i * f.ph / 100, bw, f.ph / 100 + 1);
  }
  for (let i = 0; i <= 5; i++) text(x, fmt(d.hi - i * (d.hi - d.lo) / 5), bx + bw + 5, f.T + i * f.ph / 5 + 4, 'left');
  if (d.capHi) {
    x.fillStyle = CAP_GRAY;
    x.fillRect(bx, f.T - 16, bw, 9);
    text(x, '> ' + fmt(d.hi), bx + bw + 5, f.T - 8, 'left');
  }
  x.save(); x.translate(w - 8, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.cl, 0, 0); x.restore();
  if (d.pt) {
    const mx0 = d.x[0], mx1 = d.x[d.x.length - 1], my0 = d.y[0], my1 = d.y[d.y.length - 1];
    marker(x, f, f.L + (d.pt[0] - mx0) / (mx1 - mx0) * f.pw, f.T + (my1 - d.pt[1]) / (my1 - my0) * f.ph, d.ptl);
  }
}
