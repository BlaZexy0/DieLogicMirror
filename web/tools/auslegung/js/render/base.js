/* Gemeinsame Canvas-Bausteine: Rahmen, Achsen, Überschrift, Betriebspunkt-
   Marker, Farbskala der Heatmaps und Konturlinien. Alle Farben sind Rollen
   aus dem Theme (core/theme.js), gelesen zur Zeichenzeit. */

import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';

const PI = Math.PI;

/* Die Fläche des Diagramms mit Alpha: Beschriftungskästen, Aufhellungen,
   Konturlinien. Sie folgt dem Farbschema (theme.chart.surface); ein festes
   Weiß stand sonst als heller Fleck auf dem warmen Papier der Abendschicht. */
export function surfaceA(a) {
  const h = /^#[0-9a-f]{6}$/i.test(theme.chart.surface || '') ? theme.chart.surface : '#ffffff';
  return 'rgba(' + parseInt(h.slice(1, 3), 16) + ',' + parseInt(h.slice(3, 5), 16) + ',' + parseInt(h.slice(5, 7), 16) + ',' + a + ')';
}

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
  /* Die Legende sitzt über dem Plot. Zwei Zeilen passen immer; braucht sie
     mehr, rückt der Plot ab — bis LEGEND_MAX_ROWS. Vorher war es eine feste
     dritte Zeile für d.limitText === 'legend', und alles darüber verschwand
     stillschweigend: gemessen 8 von 12 Einträgen auf einer 517-px-Karte,
     während dieselbe Einstellung jede Beschriftung IM Plot unterdrückt.
     d._legendRows setzt drawLine beim Zeichnen; hover.js liest denselben
     Wert vom selben Objekt, damit Zeichnung und Mausauswertung dieselbe
     Geometrie benutzen. */
  const rows = d && d._legendRows ? Math.min(d._legendRows, LEGEND_MAX_ROWS)
    : (d && d.limitText === 'legend' ? 3 : 2);
  const extra = Math.max(0, rows - 2) * LEGEND_ROW;
  f.T += extra;
  f.ph -= extra;
  return f;
}

export const LEGEND_ROW = 13;
export const LEGEND_MAX_ROWS = 5;
export const LEGEND_TOP = 70;

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

/* Achsenteilung auf glatte Werte: Schritt 1, 2 oder 5 je Zehnerpotenz, so
   gewählt, dass etwa n Striche in den Bereich fallen. Vorher wurde der
   Bereich in fünf gleiche Teile geteilt — die Beschriftung stand dann auf
   Werten wie 2.145,64 bar oder 30,05 l/s, die niemand liest. */
export function ticks(lo, hi, n = 5) {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  const step = (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
  const out = [];
  const k0 = Math.ceil(lo / step - 1e-9), k1 = Math.floor(hi / step + 1e-9);
  for (let k = k0; k <= k1; k++) out.push(k === 0 ? 0 : +(k * step).toPrecision(12));
  return out;
}

export function axes(x, w, h, f, x0, x1, y0, y1, d) {
  x.strokeStyle = theme.chart.grid;
  /* Rahmen des Zeichenfelds — vorher kamen seine Kanten von den Gitter-
     linien an den Enden der Fünfteilung. */
  x.beginPath(); x.rect(f.L, f.T, f.pw, f.ph); x.stroke();
  const X = a => f.L + (a - x0) / ((x1 - x0) || 1) * f.pw;
  const Y = a => f.T + (y1 - a) / ((y1 - y0) || 1) * f.ph;
  for (const t of ticks(x0, x1)) {
    x.beginPath(); x.moveTo(X(t), f.T); x.lineTo(X(t), h - f.B); x.stroke();
    text(x, fmt(t), X(t), h - f.B + 18);
  }
  for (const t of ticks(y0, y1)) {
    x.beginPath(); x.moveTo(f.L, Y(t)); x.lineTo(w - f.R, Y(t)); x.stroke();
    text(x, fmt(t), f.L - 7, Y(t) + 4, 'right');
  }
  text(x, d.xl, f.L + f.pw / 2, h - 11);
  x.save(); x.translate(14, f.T + f.ph / 2); x.rotate(-PI / 2); text(x, d.yl, 0, 0); x.restore();
}

/* Betriebspunkt-Marker mit Führungslinien und Label: der Arbeitspunkt in
   der Rolle `mark` (Hervorhebung, kein Urteil: er ist auch dann derselbe
   Punkt, wenn er in einer verbotenen Fläche liegt), ein Referenzpunkt
   (opts.ref, z. B. der ungedrosselte Schnittpunkt) gedämpft in `ref`. */
export function marker(x, f, px, py, label, opts) {
  /* Liegt der Betriebspunkt außerhalb des Rahmens, verschwand er bisher
     kommentarlos — das Diagramm sah aus, als gäbe es keinen. Statt ihn zu
     verschlucken, wird am Rand ein Pfeil in seine Richtung gesetzt. */
  const außen = px < f.L - 2 || px > f.L + f.pw + 2 || py < f.T - 2 || py > f.T + f.ph + 2;
  if (außen) { offMarker(x, f, px, py, label, opts); return; }
  /* opts.ref: Referenzpunkt (z. B. Schnittpunkt) — gedämpft, Ring gestrichelt */
  const ref = !!(opts && opts.ref);
  const MC = ref ? theme.chart.ref : theme.chart.mark;
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
    x.fillStyle = surfaceA(.88);
    x.fillRect(lx - 4, ly - 11, tw + 8, 15);
    x.fillStyle = MC; fillRich(x, label, lx, ly);
  }
  x.restore();
}

/* Betriebspunkt außerhalb des Rahmens: Pfeil am Rand in seiner Richtung,
   mit dem Hinweis, dass er außerhalb der Skala liegt. */
function offMarker(x, f, px, py, label, opts) {
  const ref = !!(opts && opts.ref);
  const MC = ref ? theme.chart.ref : theme.chart.mark;
  const cx = Math.min(Math.max(px, f.L + 8), f.L + f.pw - 8);
  const cy = Math.min(Math.max(py, f.T + 8), f.T + f.ph - 8);
  const dx = px - cx, dy = py - cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  x.save();
  x.fillStyle = MC; x.globalAlpha = ref ? 0.55 : 0.85;
  x.beginPath();
  x.moveTo(cx + ux * 8, cy + uy * 8);
  x.lineTo(cx - uy * 5 - ux * 3, cy + ux * 5 - uy * 3);
  x.lineTo(cx + uy * 5 - ux * 3, cy - ux * 5 - uy * 3);
  x.closePath(); x.fill();
  x.globalAlpha = 1;
  if (label) {
    x.font = 'bold 10.5px Arial'; x.textAlign = 'left';
    const txt = label + ' (außerhalb)';
    const tw = x.measureText(txt).width;
    let lx = cx + 12, ly = cy + 4;
    if (lx + tw + 6 > f.L + f.pw) lx = cx - tw - 12;
    x.fillStyle = surfaceA(.88);
    x.fillRect(lx - 4, ly - 11, tw + 8, 15);
    x.fillStyle = MC; fillRich(x, txt, lx, ly);
  }
  x.restore();
}

/* Farbskala der Heatmaps: die feste Farbleiste `heat` der Palette
   (theme.heatStops, sieben Stützstellen aus Turbo), in jedem Schema
   dieselbe. Eine Farbleiste ist ein Maßstab; sie folgt dem Schema nicht. */
export function rampRgb(t) {
  if (!Number.isFinite(t)) return null;
  t = Math.max(0, Math.min(1, t));
  const k = theme.heatStops;
  const u = t * (k.length - 1), i = Math.min(k.length - 2, Math.floor(u)), q = u - i;
  const a = k[i], b = k[i + 1];
  return [0, 1, 2].map(j => Math.round(a[j] + (b[j] - a[j]) * q));
}

/* Dieselbe Skala als CSS-Farbe. NaN überlebt beide Klemmungen und machte
   k[NaN] undefined — der Wurf riss bisher jede Karte nach der werfenden mit.
   Ein Feld ohne Wert bleibt durchsichtig: sichtbar leer statt einer
   plausiblen Farbe. */
export function ramp(t) {
  const c = rampRgb(t);
  return c ? 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')' : 'rgba(0,0,0,0)';
}

/* Relative Leuchtdichte (WCAG) eines RGB-Tripels 0 … 255. */
function leuchte(c) {
  const v = c.map(u => { u /= 255; return u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4); });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}

/* Marching-Squares-Konturen mit Wertelabels. Die Skala ist an den Enden
   dunkel und in der Mitte hell (Grün, Gelb); eine Linie in der Farbe der
   Fläche verschwände dort. Jede Kontur liegt auf genau einem Wert, also
   kennt sie ihren Grund: auf hellen Stufen zeichnet sie in Schrift, auf
   dunklen in der Fläche. Die Labels stehen auf einem Kästchen der Fläche. */
export function contours(ctx, f, d, skipLabel) {
  const nx = d.x.length, ny = d.y.length, cw = f.pw / (nx - 1), ch = f.ph / (ny - 1);
  const C = theme.chart;
  ctx.save();
  ctx.lineWidth = 1.15;
  ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
  for (let li = 0; li < d.levels.length; li++) {
    const L = d.levels[li];
    const grund = rampRgb((L - d.lo) / (d.hi - d.lo));
    const hell = grund && leuchte(grund) > 0.2;
    ctx.strokeStyle = hell ? C.text : surfaceA(.95);
    ctx.globalAlpha = hell ? 0.45 : 1;
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
    ctx.globalAlpha = 1;
    if (label) {
      ctx.fillStyle = surfaceA(.92);
      ctx.fillRect(label[0] - 14, label[1] - 8, 28, 14);
      ctx.fillStyle = C.text;
      ctx.fillText(fmt(L), label[0], label[1] + 3);
    }
  }
  ctx.restore();
}
