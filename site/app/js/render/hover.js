/* Hover-Auswertung: zeigt unter jedem Diagramm den Wert an der Mausposition. */

import { frame, lineFrame } from './base.js';
import { donutGeom } from './donut.js';
import { MAP_LABELS } from './map.js';
import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { vCrit } from '../core/physics.js';
import { violates } from '../core/limits.js';

const PI = Math.PI;
export const HOVER_IDLE = 'Bewege die Maus über das Diagramm, um den aktuellen Wert anzuzeigen.';

function interp(xs, ys, xv) {
  if (xv <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (xv <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (xv - xs[i - 1]) / (xs[i] - xs[i - 1]);
  }
  return ys[ys.length - 1];
}

function heatVal(d, xv, yv) {
  const nx = d.x.length, ny = d.y.length;
  let i = 0, j = 0;
  while (i < nx - 2 && d.x[i + 1] < xv) i++;
  while (j < ny - 2 && d.y[j + 1] < yv) j++;
  let tx = (xv - d.x[i]) / (d.x[i + 1] - d.x[i]);
  let ty = (yv - d.y[j]) / (d.y[j + 1] - d.y[j]);
  tx = Math.max(0, Math.min(1, tx)); ty = Math.max(0, Math.min(1, ty));
  const z00 = d.z[j][i], z10 = d.z[j][i + 1], z01 = d.z[j + 1][i], z11 = d.z[j + 1][i + 1];
  return z00 * (1 - tx) * (1 - ty) + z10 * tx * (1 - ty) + z01 * (1 - tx) * ty + z11 * tx * ty;
}

export function showHover(card, ev) {
  const d = card.data, box = card.querySelector('.hover-value'), cv = card.querySelector('canvas');
  const r = cv.getBoundingClientRect(), w = r.width, h = r.height;
  const px = ev.clientX - r.left, py = ev.clientY - r.top;
  if (!d || d.err) { box.textContent = HOVER_IDLE; return; }

  if (d.kind === 'donut') {
    const g = donutGeom(w, h), dx = px - g.cx, dy = py - g.cy, rr = Math.sqrt(dx * dx + dy * dy);
    if (rr < g.r0 || rr > g.R) { box.textContent = HOVER_IDLE; return; }
    const ang = (Math.atan2(dy, dx) + PI / 2 + 2 * PI) % (2 * PI);
    let acc = 0;
    for (let i = 0; i < d.segs.length; i++) {
      acc += 2 * PI * d.segs[i].kg / d.total;
      if (ang <= acc) {
        box.innerHTML = '<b>' + d.segs[i].n + ':</b> ' + fmt(d.segs[i].kg) + ' kg · ' + fmt(100 * d.segs[i].kg / d.total) + ' % vom Dosiergewicht (' + fmt(d.total) + ' kg)';
        return;
      }
    }
    box.textContent = HOVER_IDLE; return;
  }

  const f = d.z ? frame(w, h, true) : lineFrame(w, h, d);
  if (px < f.L || px > w - f.R || py < f.T || py > h - f.B) { box.textContent = HOVER_IDLE; return; }

  if (d.kind === 'map') {
    /* Exakt aus den Formeln ausgewertet — kein Raster-Snapping. */
    const xv = (px - f.L) / f.pw * 100;
    const yv = d.rMax - (py - f.T) / f.ph * (d.rMax - d.rMin);
    const phi = xv / 100, P = d.params;
    if (phi <= 0 || phi >= 1 || yv <= 0) { box.textContent = HOVER_IDLE; return; }
    const D = Math.cbrt(4 * P.V / (PI * phi * yv));       // m
    const L = yv * D;                                     // m
    const b = 4 * P.Vb / (PI * D * D) * 1000;             // mm
    const vc = vCrit(D, phi);                             // m/s
    const bad = [];
    if (D * 1000 < P.dmin || D * 1000 > P.dmax) bad.push('bore');
    if (L * 1000 < P.lmin || L * 1000 > P.lmax) bad.push('len');
    if (b < P.biscuitMin) bad.push('bisc');
    if (P.v1 > vc) bad.push('crit');
    const verdict = bad.length
      ? '<b style="color:' + theme.ui.bad + '">verletzt: ' + bad.map(k => MAP_LABELS[k]).join(', ') + '</b>'
      : '<b style="color:' + theme.ui.ok + '">MACHBAR</b>';
    box.innerHTML = '<b>φ:</b> ' + fmt(xv) + ' % · <b>L/D:</b> ' + fmt(yv) + ' → <b>Ø</b> ' + fmt(D * 1000) + ' mm · <b>L</b> ' + fmt(L * 1000) + ' mm · <b>Pressrest</b> ' + fmt(b) + ' mm · <b>v_krit</b> ' + fmt(vc) + ' m/s · ' + verdict;
    return;
  }

  const x0 = d.x[0], x1 = d.x[d.x.length - 1];
  const xv = x0 + (px - f.L) / f.pw * (x1 - x0);
  if (d.z) {
    const y0 = d.y[0], y1 = d.y[d.y.length - 1];
    const yv = y1 - (py - f.T) / f.ph * (y1 - y0);
    let msg = '<b>' + d.xl + ':</b> ' + fmt(xv) + ' · <b>' + d.yl + ':</b> ' + fmt(yv) + ' · <b>' + d.cl + ':</b> ' + fmt(heatVal(d, xv, yv));
    const bad = (d.limits || []).filter(l => violates(l, xv, yv));
    if (bad.length) msg += ' · <b style="color:' + theme.ui.bad + '">verletzt: ' + bad.map(l => l.label).join(', ') + '</b>';
    box.innerHTML = msg;
  } else {
    let msg = '<b>' + d.xl + ':</b> ' + fmt(xv);
    for (let i = 0; i < d.ys.length; i++) {
      const s = d.ys[i], val = interp(d.x, s.y, xv);
      msg += ' · <b>' + s.n + ':</b> ' + (isFinite(val) ? fmt(val) + (s.u ? ' ' + s.u : '') : '—');
    }
    box.innerHTML = msg + ' <span class="unit">' + d.yl + '</span>';
  }
}
