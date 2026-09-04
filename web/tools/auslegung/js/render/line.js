/* Liniendiagramme: Serien, Grenzen (d.limits — Ausschlussflächen, Ziel-
   bänder, Referenzlinien), Ereignismarker, Betriebspunkt. */

import { lineFrame, heading, axes, marker, fillRich, LEGEND_ROW, LEGEND_MAX_ROWS, LEGEND_TOP } from './base.js';
import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';
import { drawLimits, legendItems, drawLegendSwatch } from './limits.js';

const PI = Math.PI;

/* Die Einträge der Legende: Serien, machbares Band, Grenzen. */
function legendEntries(d, C) {
  return d.ys.map(s => ({ label: s.n, sev: 'series', color: s.c }))
    .concat(d.feasible ? [{ label: typeof d.feasible === 'string' ? d.feasible : 'machbares Band',
      sev: 'target', color: C.okFill || 'rgba(0,140,130,.30)' }] : [])
    .concat(d.feasible && d.feasibleSplit && d.feasibleSplit.label
      ? [{ label: d.feasibleSplit.label, sev: 'target', color: 'rgba(0,140,130,.13)' }] : [])
    .concat(legendItems(d.limits));
}

/* Wie viele Zeilen braucht die Legende bei dieser Breite? Reine Messung —
   sie legt die Höhe des Plotrahmens fest, muss also vor ihm laufen. */
function legendRows(x, w, d, L, R) {
  const items = legendEntries(d, theme.chart);
  x.save();
  x.font = '10.5px Arial';
  let lx = L, rows = 1;
  for (const it of items) {
    const tw = x.measureText(it.label).width;
    if (lx > L && lx + 17 + tw > w - R) { lx = L; rows++; }
    lx += 17 + tw + 14;
  }
  x.restore();
  return rows;
}

export function drawLine(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart;
  /* Erst mit dem provisorischen Rahmen messen (L und R hängen nicht an der
     Legendenhöhe), dann den endgültigen Rahmen bilden. */
  d._legendRows = legendRows(x, w, d, lineFrame(w, h, d).L, lineFrame(w, h, d).R);
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
  /* Null-Spanne: bei gateMin = gateMax, dmin = dmax oder wallMin = wallMax
     fallen Ober- und Untergrenze zusammen. Die rechte Achse hat den Schutz
     zwei Zeilen weiter unten seit jeher (r1 - r0 || 1); links und auf der
     x-Achse fehlte er — jede Koordinate wurde NaN oder ±Infinity und das
     Diagramm blieb leer. Statt zu klemmen wird ein lesbarer Bereich um den
     Wert aufgespannt; die Achsenbeschriftung zeigt ihn an. */
  if (!(y1 > y0)) { const c = isFinite(y0) ? y0 : 0; y0 = c - 0.5; y1 = c + 0.5; }
  const spanX = (x1 - x0) || 1;
  axes(x, w, h, f, x0, x1, y0, y1, d);
  const X = a => f.L + (a - x0) / spanX * f.pw;
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
      /* Beschriftung in Textfarbe: die Serienfarben erreichen auf Weiß nur
         1,98–4,14:1 (series4 sogar 2,22:1) und verfehlen damit den
         WCAG-Textkontrast. Die Zuordnung trägt die farbige Achse selbst
         und der gestrichelte Kurvenzug. */
      x.fillStyle = C.text; x.textAlign = 'left'; x.font = '11px Arial';
      fillRich(x, fmt(r1 - i * (r1 - r0) / 5), f.L + f.pw + 7, yy + 4);
    }
    if (d.rl) {
      x.save();
      x.translate(w - 10, f.T + f.ph / 2); x.rotate(PI / 2);
      x.fillStyle = C.text; x.textAlign = 'center'; x.font = '11px Arial';
      fillRich(x, d.rl, 0, 0);
      x.restore();
    }
  }

  /* Grenzen: Zielbänder, Ausschluss-Schraffuren, Grenz-/Referenzlinien */
  drawLimits(x, f, X, Y, d);

  /* Prozessereignisse (nummerierte Chips + vertikale Linien). Chips, die
     dichter als eine Chip-Breite liegen, weichen zeilenweise nach unten aus. */
  let lastChipX = -Infinity, chipRow = 0;
  if (d.events) for (let i = 0; i < d.events.length; i++) {
    const ev = d.events[i], ex = X(ev.x);
    if (ex < f.L || ex > f.L + f.pw) continue;
    chipRow = (ex - lastChipX < 20) ? chipRow + 1 : 0;
    lastChipX = ex;
    const cy = f.T + 4 + chipRow * 19;
    x.strokeStyle = C.event; x.lineWidth = 1; x.globalAlpha = 0.75;
    x.beginPath(); x.moveTo(ex, cy + 10); x.lineTo(ex, f.T + f.ph); x.stroke();
    x.globalAlpha = 1;
    if (ev.y != null) {
      x.beginPath(); x.arc(ex, Y(ev.y), 4.5, 0, 2 * PI);
      x.fillStyle = C.surface; x.fill();
      x.strokeStyle = C.event; x.lineWidth = 1.5; x.stroke();
    }
    x.beginPath(); x.arc(ex, cy, 9, 0, 2 * PI);
    x.fillStyle = C.surface; x.fill();
    x.strokeStyle = C.series2; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = C.series2; x.textAlign = 'center'; x.font = 'bold 10px Arial';
    fillRich(x, '' + ev.n, ex, cy + 3.5);
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

  /* Legende: Serien + Grenzen, mit Umbruch. Der Rahmen ist oben bereits auf
     die nötige Zeilenzahl gewachsen; passt selbst dann nicht alles (mehr als
     LEGEND_MAX_ROWS Zeilen), wird der Rest gezählt statt verschwiegen. */
  const items = legendEntries(d, C);
  let lx = f.L, ly = LEGEND_TOP, row = 1, shown = 0;
  x.font = '10.5px Arial';
  for (const it of items) {
    const tw = x.measureText(it.label).width;
    if (lx > f.L && lx + 17 + tw > w - f.R) {
      if (row >= LEGEND_MAX_ROWS) break;
      lx = f.L; ly += LEGEND_ROW; row++;
    }
    drawLegendSwatch(x, it, lx, ly);
    x.fillStyle = C.text; x.textAlign = 'left'; x.font = '10.5px Arial';
    fillRich(x, it.label, lx + 17, ly);
    lx += 17 + tw + 14;
    shown++;
  }
  if (shown < items.length) {
    x.fillStyle = C.text; x.textAlign = 'left'; x.font = 'bold 10.5px Arial';
    fillRich(x, '+ ' + (items.length - shown) + ' weitere', lx, ly);
  }

  /* Freie Segmente (z. B. Drosselung zwischen Werkzeug- und Maschinenlinie) */
  if (d.segs) for (const sg of d.segs) {
    x.save();
    x.strokeStyle = sg.c || C.marker; x.lineWidth = 1.5; x.setLineDash(sg.dash || [5, 4]);
    x.beginPath(); x.moveTo(X(sg.x1), Y(sg.y1)); x.lineTo(X(sg.x2), Y(sg.y2)); x.stroke();
    x.setLineDash([]);
    if (sg.label) {
      x.font = '10.5px Arial'; x.fillStyle = sg.c || C.marker; x.textAlign = 'left';
      fillRich(x, sg.label, X(Math.max(sg.x1, sg.x2)) + 6, (Y(sg.y1) + Y(sg.y2)) / 2 + 4);
    }
    x.restore();
  }
  if (d.pt2) marker(x, f, X(d.pt2[0]), Y(d.pt2[1]), d.ptl2, { ref: true });
  if (d.pt) marker(x, f, X(d.pt[0]), Y(d.pt[1]), d.ptl);
}
