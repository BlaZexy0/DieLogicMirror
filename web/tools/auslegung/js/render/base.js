/* Gemeinsame Canvas-Bausteine: Rahmen, Achsen, Überschrift, Betriebspunkt-
   Marker, Turbo-Farbrampe und Konturlinien. Alle Farben kommen aus dem Theme. */

import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';

const PI = Math.PI;

export function frame(w, h, heatmap) {
  return { L: 75, R: heatmap ? 92 : 50, T: 92, B: 58, pw: w - 75 - (heatmap ? 92 : 50), ph: h - 150 };
}

/* Rahmen für Liniendiagramme: mit rechter Achse (Serien mit axis:'right')
   wird der rechte Rand breiter. Auch von hover.js benutzt, damit Zeichnung
   und Mausauswertung dieselbe Geometrie verwenden. */
export function lineFrame(w, h, d) {
  const f = frame(w, h, false);
  if (d && d.ys && d.ys.some(s => s.axis === 'right')) {
    f.R = 86;
    f.pw = w - f.L - f.R;
  }
  /* Grenzen nur in der Legende benannt (d.limitText === 'legend'): eine
     dritte Legendenzeile darf nicht abgeschnitten werden — Plot rückt ab. */
  if (d && d.limitText === 'legend') {
    f.T += 13;
    f.ph -= 13;
  }
  return f;
}

/* Beschriftung mit Indizes: „v_a", „t_f max", „Q_dry", „P_{acc}" — der
   Teil nach „_" (Wort oder {…}) wird als Tiefindex gezeichnet (78 % Größe,
   abgesenkt). Ohne „_" ein normales fillText. Respektiert x.textAlign, indem
   die Gesamtbreite vorab gemessen wird. Wird von allen Renderern statt
   fillText benutzt — so sehen Canvas und Theorie-SVGs dieselben Indizes. */
export function fillRich(x, s, px, py) {
  s = String(s);
  if (s.indexOf('_') < 0) { x.fillText(s, px, py); return; }
  /* Ein Kontext mit eigener Index-Ausgabe (SVG-Generator: <tspan>) übernimmt */
  if (typeof x.fillRich === 'function') { x.fillRich(s, px, py); return; }
  const parts = [];
  const re = /_(?:\{([^}]*)\}|([A-Za-z0-9]+(?:,[A-Za-z0-9]+)*))/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ t: s.slice(last, m.index), sub: false });
    parts.push({ t: m[1] != null ? m[1] : m[2], sub: true });
    last = re.lastIndex;
  }
  if (last < s.length) parts.push({ t: s.slice(last), sub: false });
  const font = x.font, ms = /([\d.]+)px/.exec(font), size = ms ? parseFloat(ms[1]) : 11;
  const subFont = font.replace(/([\d.]+)px/, (Math.round(size * 0.78 * 10) / 10) + 'px');
  const widths = parts.map(q => { x.font = q.sub ? subFont : font; return x.measureText(q.t).width; });
  const total = widths.reduce((a, b) => a + b, 0);
  const al = x.textAlign;
  let cx = al === 'center' ? px - total / 2 : (al === 'right' || al === 'end') ? px - total : px;
  x.save();
  x.textAlign = 'left';
  parts.forEach((q, i) => { x.font = q.sub ? subFont : font; x.fillText(q.t, cx, q.sub ? py + size * 0.28 : py); cx += widths[i]; });
  x.restore();
  x.font = font;
}

export function text(x, s, a, b, al, font) {
  x.fillStyle = theme.chart.text;
  x.textAlign = al || 'center';
  x.font = font || '11px Arial';
  fillRich(x, s, a, b);
}

export function heading(x, w, h, d) {
  x.fillStyle = theme.chart.surface;
  x.fillRect(0, 0, w, h);
  text(x, d.title, w / 2, 22, 'center', 'bold 15px Arial');
  text(x, d.info || '', w / 2, 42);
  x.strokeStyle = theme.chart.axis;
  x.beginPath(); x.moveTo(40, 55); x.lineTo(w - 40, 55); x.stroke();
}

export function axes(x, w, h, f, x0, x1, y0, y1, d) {
  for (let i = 0; i <= 5; i++) {
    const X = f.L + i * f.pw / 5, Y = f.T + i * f.ph / 5;
    x.strokeStyle = theme.chart.grid;
    x.beginPath(); x.moveTo(X, f.T); x.lineTo(X, h - f.B); x.stroke();
    x.beginPath(); x.moveTo(f.L, Y); x.lineTo(w - f.R, Y); x.stroke();
    /* Winzige Float-Reste (z. B. −1e-13 statt 0) nicht als „-0" anzeigen */
    const tx = x0 + i * (x1 - x0) / 5, ty = y1 - i * (y1 - y0) / 5;
    text(x, fmt(Math.abs(tx) < Math.abs(x1 - x0) * 1e-9 ? 0 : tx), X, h - f.B + 18);
    text(x, fmt(Math.abs(ty) < Math.abs(y1 - y0) * 1e-9 ? 0 : ty), f.L - 7, Y + 4, 'right');
  }
  text(x, d.xl, f.L + f.pw / 2, h - 11);
  x.save(); x.translate(14, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.yl, 0, 0); x.restore();
}

/* Roter Betriebspunkt-Marker mit Führungslinien und Label. */
export function marker(x, f, px, py, label, opts) {
  if (px < f.L - 2 || px > f.L + f.pw + 2 || py < f.T - 2 || py > f.T + f.ph + 2) return;
  /* opts.ref: Referenzpunkt (z. B. Schnittpunkt) — gedämpft, Ring gestrichelt */
  const ref = !!(opts && opts.ref);
  const MC = ref ? (theme.chart.iso || theme.chart.muted) : theme.chart.marker;
  x.save();
  x.strokeStyle = MC; x.lineWidth = 1; x.setLineDash([4, 3]);
  x.beginPath(); x.moveTo(f.L, py); x.lineTo(px, py); x.moveTo(px, f.T + f.ph); x.lineTo(px, py); x.stroke();
  x.setLineDash([]);
  x.beginPath(); x.arc(px, py, 6, 0, 2 * PI); x.fillStyle = theme.chart.surface; x.fill();
  x.lineWidth = ref ? 1.6 : 2.2; x.strokeStyle = MC; if (ref) x.setLineDash([3, 2]); x.stroke(); x.setLineDash([]);
  x.beginPath(); x.arc(px, py, 2, 0, 2 * PI); x.fillStyle = MC; x.fill();
  if (label) {
    x.font = 'bold 11px Arial'; x.textAlign = 'left';
    const tw = x.measureText(label).width;
    let lx = px + 11, ly = py - 9;
    if (lx + tw + 6 > f.L + f.pw) lx = px - tw - 19;
    if (ly < f.T + 12) ly = py + 22;
    x.fillStyle = 'rgba(255,255,255,.88)';
    x.fillRect(lx - 4, ly - 11, tw + 8, 15);
    x.fillStyle = MC; fillRich(x, label, lx, ly);
  }
  x.restore();
}

/* Farbrampe für Heatmaps; Stützstellen aus theme.heatStops. */
export function turbo(t) {
  /* NaN überlebt beide Klemmungen und macht k[NaN] undefined — der Wurf riss
     bisher jede Karte nach der werfenden mit. Ein Feld ohne Wert bleibt
     durchsichtig: sichtbar leer statt einer plausiblen Farbe. */
  if (!Number.isFinite(t)) return 'rgba(0,0,0,0)';
  t = Math.max(0, Math.min(1, t));
  const k = theme.heatStops;
  const u = t * (k.length - 1), i = Math.min(k.length - 2, Math.floor(u)), q = u - i;
  const a = k[i], b = k[i + 1];
  return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * q) + ',' + Math.round(a[1] + (b[1] - a[1]) * q) + ',' + Math.round(a[2] + (b[2] - a[2]) * q) + ')';
}

/* Marching-Squares-Konturen mit Wertelabels. */
export function contours(ctx, f, d, skipLabel) {
  const nx = d.x.length, ny = d.y.length, cw = f.pw / (nx - 1), ch = f.ph / (ny - 1);
  ctx.save();
  ctx.lineWidth = 1.15; ctx.strokeStyle = 'rgba(255,255,255,.95)';
  ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
  for (let li = 0; li < d.levels.length; li++) {
    const L = d.levels[li];
    ctx.beginPath();
    let label = null;
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const v = [d.z[j][i], d.z[j][i + 1], d.z[j + 1][i + 1], d.z[j + 1][i]];
      const p = [];
      const X = a => f.L + a * cw, Y = a => f.T + f.ph - a * ch;
      const cut = (a, b) => b === a ? 0.5 : (L - a) / (b - a);
      if ((v[0] - L) * (v[1] - L) < 0) p.push([X(i + cut(v[0], v[1])), Y(j)]);
      if ((v[1] - L) * (v[2] - L) < 0) p.push([X(i + 1), Y(j + cut(v[1], v[2]))]);
      if ((v[2] - L) * (v[3] - L) < 0) p.push([X(i + 1 - cut(v[2], v[3])), Y(j + 1)]);
      if ((v[3] - L) * (v[0] - L) < 0) p.push([X(i), Y(j + 1 - cut(v[3], v[0]))]);
      if (p.length >= 2) {
        ctx.moveTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]);
        if (!label && i > nx * 0.35 && i < nx * 0.65 && j > ny * 0.2 && j < ny * 0.8
          && !(skipLabel && skipLabel(d.x[i], d.y[j]))) label = p[0];
      }
    }
    ctx.stroke();
    if (label) {
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.fillRect(label[0] - 14, label[1] - 8, 28, 14);
      ctx.fillStyle = theme.chart.text;
      ctx.fillText(fmt(L), label[0], label[1] + 3);
    }
  }
  ctx.restore();
}
