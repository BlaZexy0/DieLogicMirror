/* (φ, λ)-Auslegungskarte, geometrisch: das machbare Band wird als Polygon
   gefüllt, die Grenzen als analytische Kurven mit Beschriftung gezeichnet.
   Labels werden kollisionsfrei platziert: Grenzkurven-Labels haben Vorrang,
   Iso-Labels weichen aus oder entfallen. */

import { frame, heading, axes, marker, fillRich } from './base.js';
import { fmt } from '../core/format.js';
import { theme } from '../core/theme.js';

/* Texte der Verletzungsarten — auch vom Hover verwendet. */
export const MAP_LABELS = {
  ok: 'machbar',
  bore: 'Kolben-Ø-Bereich verletzt',
  len: 'Kammerlängen-Bereich verletzt',
  bisc: 'Pressrest zu dünn',
  crit: 'v 1. Phase > v_krit'
};

const LEGEND = [
  ['ok', 'machbares Band'],
  ['bore', 'Kolben-Ø-Grenzen'],
  ['len', 'Kammerlängen-Grenzen'],
  ['bisc', 'Pressrest-Grenze (max. Ø)'],
  ['crit', 'v_krit-Grenze (1. Phase)']
];

const LINE_FALLBACK = { bore: '#123a6b', len: '#7b5cd6', bisc: '#b28000', crit: '#c2447e' };

function lineColor(t) { return (theme.mapLines && theme.mapLines[t]) || LINE_FALLBACK[t]; }

export function drawMap(x, w, h, d) {
  heading(x, w, h, d);
  const C = theme.chart, MAPC = theme.map;
  const f = frame(w, h, false);
  const x0 = 0, x1 = 100, y0 = d.rMin, y1 = d.rMax;
  const X = a => f.L + (a - x0) / (x1 - x0) * f.pw;
  const Y = a => f.T + (y1 - a) / (y1 - y0) * f.ph;
  axes(x, w, h, f, x0, x1, y0, y1, d);

  /* Kollisionsfreie Label-Platzierung: belegte Rechtecke merken; ein Label,
     das nirgendwo Platz findet, entfällt. Gibt die Position zurück oder null. */
  const placed = [];
  function tryLabel(bx, by, lw, lh) {
    if (bx < f.L + 1) bx = f.L + 1;
    if (bx + lw > f.L + f.pw - 1) bx = f.L + f.pw - 1 - lw;
    if (by < f.T + 1 || by + lh > f.T + f.ph - 1) return null;
    for (const r of placed) {
      if (bx < r[0] + r[2] && bx + lw > r[0] && by < r[1] + r[3] && by + lh > r[1]) return null;
    }
    placed.push([bx, by, lw, lh]);
    return [bx, by];
  }

  x.save();
  x.beginPath(); x.rect(f.L, f.T, f.pw, f.ph); x.clip();

  /* Machbares Band als gefüllte Polygone */
  x.fillStyle = MAPC.ok;
  d.band.forEach(poly => {
    if (poly.length < 3) return;
    x.beginPath();
    x.moveTo(X(poly[0][0]), Y(poly[0][1]));
    for (let i = 1; i < poly.length; i++) x.lineTo(X(poly[i][0]), Y(poly[i][1]));
    x.closePath();
    x.fill();
  });

  /* Zielband-Text vormerken (wird unten gezeichnet, reserviert aber Platz) */
  let zielRect = null;
  if (d.fillMin > 0) {
    x.font = '10px Arial';
    const zl = 'Ziel φ ' + fmt(d.fillMin) + '–' + fmt(d.fillMax) + ' %';
    const tw = x.measureText(zl).width;
    const cx = X((d.fillMin + d.fillMax) / 2);
    const pos = tryLabel(cx - tw / 2 - 2, f.T + f.ph - 17, tw + 4, 13);
    if (pos) zielRect = { l: zl, x: pos[0] + 2 + tw / 2, y: pos[1] + 11 };
  }

  /* Dezente Iso-Hilfslinien zeichnen, Labels erst nach den Kurvenlabels platzieren */
  const isoLabels = [];
  x.strokeStyle = C.isoLine; x.lineWidth = 0.8;
  x.globalAlpha = 0.55;
  d.iso.forEach(iso => {
    x.beginPath();
    const vis = [];
    for (let i = 0; i < iso.p.length; i++) {
      const ax = X(iso.p[i][0]), ay = Y(iso.p[i][1]);
      vis.push([ax, ay]);
      vis.length === 1 ? x.moveTo(ax, ay) : x.lineTo(ax, ay);
    }
    x.stroke();
    if (vis.length > 1) {
      const anchor = iso.end ? vis[vis.length - 1] : vis[0];
      isoLabels.push({ l: iso.l, cands: [anchor, vis[Math.floor(vis.length / 2)]] });
    }
  });
  x.globalAlpha = 1;

  /* Grenzkurven mit Beschriftung (Vorrang bei der Platzierung) */
  d.curves.forEach((c, idx) => {
    const col = lineColor(c.t);
    x.strokeStyle = col; x.lineWidth = 1.8;
    x.beginPath();
    let started = false;
    for (let i = 0; i < c.p.length; i++) {
      const ax = X(c.p[i][0]), ay = Y(c.p[i][1]);
      started ? x.lineTo(ax, ay) : x.moveTo(ax, ay);
      started = true;
    }
    x.stroke();

    const visPts = c.p.filter(p => p[1] > y0 + 0.1 && p[1] < y1 - 0.1);
    if (visPts.length > 3) {
      x.font = 'bold 10px Arial';
      const tw = x.measureText(c.l).width;
      const base = 0.25 + (idx % 3) * 0.22;
      const cands = [base, base + 0.15, base - 0.15, base + 0.3, base - 0.3, 0.5, 0.75];
      for (const fr of cands) {
        const at = visPts[Math.max(0, Math.min(visPts.length - 1, Math.floor(visPts.length * fr)))];
        const pos = tryLabel(X(at[0]) - tw / 2 - 3, Y(at[1]) - 16, tw + 6, 13);
        if (pos) {
          x.fillStyle = 'rgba(255,255,255,.88)';
          x.fillRect(pos[0], pos[1], tw + 6, 13);
          x.fillStyle = col; x.textAlign = 'left';
          fillRich(x, c.l, pos[0] + 3, pos[1] + 10);
          break;
        }
      }
    }
  });

  /* Iso-Labels in die verbleibenden Lücken */
  x.font = '9.5px Arial'; x.fillStyle = C.iso; x.globalAlpha = 0.8;
  isoLabels.forEach(il => {
    const tw = x.measureText(il.l).width;
    for (const a2 of il.cands) {
      const pos = tryLabel(a2[0] + 2, a2[1] - 13, tw + 4, 11);
      if (pos) { x.textAlign = 'left'; fillRich(x, il.l, pos[0] + 2, pos[1] + 9); break; }
    }
  });
  x.globalAlpha = 1;

  /* Füllgrad-Zielband */
  x.strokeStyle = C.series1; x.setLineDash([5, 4]); x.lineWidth = 1.2;
  [d.fillMin, d.fillMax].forEach(fv => {
    if (fv > 0 && fv < 100) { x.beginPath(); x.moveTo(X(fv), f.T); x.lineTo(X(fv), f.T + f.ph); x.stroke(); }
  });
  x.setLineDash([]);
  if (zielRect) {
    x.fillStyle = C.series1; x.font = '10px Arial'; x.textAlign = 'center';
    fillRich(x, zielRect.l, zielRect.x, zielRect.y);
  }

  x.restore();

  /* Legende */
  let lx = f.L, ly = 64;
  x.font = '10.5px Arial';
  for (const [key, lab] of LEGEND) {
    if (key === 'bisc' && !d.curves.some(c => c.t === 'bisc')) continue;
    if (key === 'crit' && !d.curves.some(c => c.t === 'crit')) continue;
    const tw = x.measureText(lab).width;
    if (lx + tw + 22 > w - f.R) { lx = f.L; ly += 13; }
    if (key === 'ok') {
      x.fillStyle = theme.map.ok; x.fillRect(lx, ly - 8, 11, 9);
      x.strokeStyle = C.axis; x.strokeRect(lx, ly - 8, 11, 9);
    } else {
      x.fillStyle = lineColor(key); x.fillRect(lx, ly - 6, 11, 3);
    }
    x.fillStyle = C.text; x.textAlign = 'left'; fillRich(x, lab, lx + 15, ly);
    lx += tw + 30;
  }

  if (d.cur) marker(x, f, X(d.cur.phi), Y(d.cur.r), d.cur.l);
}
