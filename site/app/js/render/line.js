/* Liniendiagramme: Serien, Grenzen (d.limits — Ausschlussflächen, Ziel-
   bänder, Referenzlinien), Ereignismarker, Betriebspunkt. */

import { lineFrame, heading, axes, marker, text } from './base.js';
import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { drawLimits, legendItems, drawLegendSwatch } from './limits.js';

const PI = Math.PI;

export function drawLine(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart;
  const f = lineFrame(w, h, d);
  const x0 = d.x[0], x1 = d.x[d.x.length - 1];
  const left = d.ys.filter(s => s.axis !== 'right');
  const right = d.ys.filter(s => s.axis === 'right');
  let all = [];
  for (let i = 0; i < left.length; i++) all = all.concat(left[i].y.filter(isFinite));
  let y0 = d.y0 == null ? Math.min.apply(null, [0].concat(all)) : d.y0;
  let y1 = d.y1 == null ? Math.max.apply(null, all) * 1.08 : d.y1;
  /* y-Skala schließt konstante Grenzen auf der linken Achse mit ein. */
  if (d.limits && d.y1 == null) for (const l of d.limits) {
    if (l.on === 'y' && typeof l.value === 'number') y1 = Math.max(y1, l.value * 1.08);
    if (l.on === 'y' && l.severity === 'target' && typeof l.max === 'number') y1 = Math.max(y1, l.max * 1.08);
  }
  axes(x, w, h, f, x0, x1, y0, y1, d);
  const X = a => f.L + (a - x0) / (x1 - x0) * f.pw;
  const Y = a => f.T + (y1 - a) / (y1 - y0) * f.ph;

  /* rechte Achse: eigene Skala für Serien mit axis:'right' */
  let YR = Y;
  if (right.length) {
    let rall = [];
    for (let i = 0; i < right.length; i++) rall = rall.concat(right[i].y.filter(isFinite));
    if (!rall.length) rall = [1];
    const r0 = d.r0 == null ? 0 : d.r0;
    const r1 = d.r1 == null ? Math.max.apply(null, rall) * 1.08 : d.r1;
    YR = a => f.T + (r1 - a) / (r1 - r0 || 1) * f.ph;
    const rc = right[0].c;
    x.strokeStyle = rc; x.globalAlpha = 0.6;
    x.beginPath(); x.moveTo(f.L + f.pw, f.T); x.lineTo(f.L + f.pw, f.T + f.ph); x.stroke();
    x.globalAlpha = 1;
    for (let i = 0; i <= 5; i++) {
      const yy = f.T + i * f.ph / 5;
      x.fillStyle = rc; x.textAlign = 'left'; x.font = '11px Arial';
      x.fillText(fmt(r1 - i * (r1 - r0) / 5), f.L + f.pw + 7, yy + 4);
    }
    if (d.rl) {
      x.save();
      x.translate(w - 10, f.T + f.ph / 2); x.rotate(PI / 2);
      x.fillStyle = rc; x.textAlign = 'center'; x.font = '11px Arial';
      x.fillText(d.rl, 0, 0);
      x.restore();
    }
  }

  /* Grenzen: Zielbänder, Ausschluss-Schraffuren, Grenz-/Referenzlinien */
  drawLimits(x, f, X, Y, d);

  /* Prozessereignisse (nummerierte Chips + vertikale Linien) */
  if (d.events) for (let i = 0; i < d.events.length; i++) {
    const ev = d.events[i], ex = X(ev.x);
    if (ex < f.L || ex > f.L + f.pw) continue;
    x.strokeStyle = C.event; x.lineWidth = 1; x.globalAlpha = 0.75;
    x.beginPath(); x.moveTo(ex, f.T + 14); x.lineTo(ex, f.T + f.ph); x.stroke();
    x.globalAlpha = 1;
    if (ev.y != null) {
      x.beginPath(); x.arc(ex, Y(ev.y), 4.5, 0, 2 * PI);
      x.fillStyle = C.surface; x.fill();
      x.strokeStyle = C.event; x.lineWidth = 1.5; x.stroke();
    }
    x.beginPath(); x.arc(ex, f.T + 4, 9, 0, 2 * PI);
    x.fillStyle = C.surface; x.fill();
    x.strokeStyle = C.series2; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = C.series2; x.textAlign = 'center'; x.font = 'bold 10px Arial';
    x.fillText('' + ev.n, ex, f.T + 7.5);
  }

  x.save();
  x.beginPath(); x.rect(f.L - 1, f.T - 1, f.pw + 2, f.ph + 2); x.clip();

  /* Flächenfüllung unter der ersten Serie */
  if (d.area) {
    let ad = 'M' + X(d.x[0]).toFixed(1) + ' ' + Y(Math.max(y0, 0)).toFixed(1);
    for (let j = 0; j < d.x.length; j++) ad += 'L' + X(d.x[j]).toFixed(1) + ' ' + Y(d.ys[0].y[j]).toFixed(1);
    ad += 'L' + X(d.x[d.x.length - 1]).toFixed(1) + ' ' + Y(Math.max(y0, 0)).toFixed(1) + 'Z';
    x.fillStyle = C.areaFill;
    x.fill(new Path2D(ad));
  }

  for (let i = 0; i < d.ys.length; i++) {
    const Ys = d.ys[i].axis === 'right' ? YR : Y;
    x.strokeStyle = d.ys[i].c; x.lineWidth = 2;
    if (d.ys[i].axis === 'right') x.setLineDash([7, 4]);
    x.beginPath();
    let started = false;
    for (let j = 0; j < d.x.length; j++) {
      if (!isFinite(d.ys[i].y[j])) { started = false; continue; }
      started ? x.lineTo(X(d.x[j]), Ys(d.ys[i].y[j])) : x.moveTo(X(d.x[j]), Ys(d.ys[i].y[j]));
      started = true;
    }
    x.stroke();
    x.setLineDash([]);
  }

  /* Kurven-Stützpunkte (Schusskurve) */
  if (d.pts) for (let i = 0; i < d.pts.length; i++) {
    const pt = d.pts[i];
    x.beginPath(); x.arc(X(pt.x), Y(pt.y), 4, 0, 2 * PI);
    x.fillStyle = C.series1; x.fill();
    x.strokeStyle = C.surface; x.lineWidth = 2; x.stroke();
  }
  x.restore();

  /* Legende: Serien + Grenzen, mit Umbruch (max. 2 Zeilen — was nicht mehr
     passt, ist weiterhin an seiner Linie im Diagramm beschriftet). */
  const items = d.ys.map(s => ({ label: s.n, sev: 'series', color: s.c }))
    .concat(d.feasible ? [{ label: typeof d.feasible === 'string' ? d.feasible : 'zulässiger Bereich',
      sev: 'target', color: C.okFill || 'rgba(0,140,130,.30)' }] : [])
    .concat(legendItems(d.limits));
  let lx = f.L, ly = 70;
  const maxLy = f.T - 9;
  x.font = '10.5px Arial';
  for (const it of items) {
    const tw = x.measureText(it.label).width;
    if (lx + 17 + tw > w - f.R) { lx = f.L; ly += 13; }
    if (ly > maxLy) break;
    drawLegendSwatch(x, it, lx, ly);
    x.fillStyle = C.text; x.textAlign = 'left'; x.font = '10.5px Arial';
    x.fillText(it.label, lx + 17, ly);
    lx += 17 + tw + 14;
  }

  if (d.pt) marker(x, f, X(d.pt[0]), Y(d.pt[1]), d.ptl);
}
