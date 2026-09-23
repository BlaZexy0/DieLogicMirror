/* Ringdiagramm (Materialausbeute). Die Anteile tragen ihre Sachfarben als
   Rolle (s.c = 'melt', 'runner', 'overflow', 'biscuit'): Bauteil,
   Anguss, Überlauf und Pressrest sind überall dieselben Farben, hier wie
   im Kolbenweg-Lineal und in der Füllkammer. */

import { heading, fillRich } from './base.js';
import { fmt } from '../core/format.js';
import { theme, farbe } from '../core/theme.js';

const PI = Math.PI;

export function donutGeom(w, h) {
  const T = 62, B = 24, cy = T + (h - T - B) / 2;
  const R = Math.min(w * 0.27, (h - T - B) * 0.40);
  const cx = Math.max(R + 22, w * 0.32);
  return { cx, cy, R, r0: R * 0.6 };
}

/* Bezugsgröße des Rings. Bei 0 oder unbrauchbarem Wert gibt es keine
   Anteile — die Karte zeigt dann nichts Sinnvolles, aber auch nichts
   Falsches. */
export function donutTotal(d) {
  return d && isFinite(d.total) && d.total > 0 ? d.total : 0;
}

export function drawDonut(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart;
  /* donutTotal statt `d.total || 1`: der Hover rechnete mit dem ROHEN
     d.total weiter und meldete bei 0 „Infinity %", während die Zeichnung
     brav einen Ring zog. Beide benutzen jetzt dieselbe Funktion. */
  const g = donutGeom(w, h), tot = donutTotal(d);
  let a0 = -PI / 2;
  for (let i = 0; i < d.segs.length; i++) {
    const s = d.segs[i], a1 = a0 + 2 * PI * s.kg / tot;
    x.beginPath();
    x.arc(g.cx, g.cy, g.R, a0, a1);
    x.arc(g.cx, g.cy, g.r0, a1, a0, true);
    x.closePath();
    x.fillStyle = farbe(s.c); x.fill();
    x.strokeStyle = C.surface; x.lineWidth = 2; x.stroke();
    a0 = a1;
  }
  x.fillStyle = C.text; x.textAlign = 'center'; x.font = 'bold 26px Arial';
  fillRich(x, fmt(d.share) + ' %', g.cx, g.cy + 2);
  x.fillStyle = C.muted; x.font = '11px Arial';
  fillRich(x, 'Ausbeute', g.cx, g.cy + 20);

  let lx = g.cx + g.R + 24, ly = g.cy - (d.segs.length - 1) * 13;
  x.font = '11.5px Arial';
  for (let i = 0; i < d.segs.length; i++) {
    const s = d.segs[i];
    x.fillStyle = farbe(s.c); x.fillRect(lx, ly - 9, 11, 11);
    x.strokeStyle = C.surface; x.strokeRect(lx, ly - 9, 11, 11);
    x.fillStyle = C.text; x.textAlign = 'left';
    fillRich(x, s.n + '  ' + fmt(s.kg) + ' kg · ' + fmt(100 * s.kg / tot) + ' %', lx + 17, ly);
    ly += 26;
  }
}
