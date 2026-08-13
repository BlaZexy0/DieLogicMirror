/* Zeichnet die deklarativen Grenzen (core/limits.js) in ein Diagramm:
   Ausschlussflächen als Schraffur, Grenzlinien gestrichelt, Zielbänder
   gefüllt, Referenzlinien nur als Linie — plus Legendeneinträge.
   Von drawLine (Liniendiagramme) und drawHeat (Heatmaps) benutzt, damit
   Grenzen überall gleich aussehen. */

import { theme } from '../core/theme.js';

/* Farbe einer Grenze: explizit (l.c) → Theme-Registry (theme.limits[id])
   → Fallback theme.chart.limit. */
export function limitColor(l) {
  return l.c || (theme.limits && theme.limits[l.id]) || theme.chart.limit;
}

/* Diagonale Schraffur als Canvas-Pattern, je Farbe gecacht. */
const patterns = new Map();
function hatch(color) {
  if (patterns.has(color)) return patterns.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.globalAlpha = 0.5;
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(-2, 6); g.lineTo(6, -2);
  g.moveTo(2, 10); g.lineTo(10, 2);
  g.stroke();
  patterns.set(color, c);   // Kachel cachen; das Pattern entsteht im Ziel-Kontext
  return c;
}

/* Ausschlussfläche füllen: leichter weißer Schleier (dämpft Heatmap-Farben,
   auf weißem Grund unsichtbar) + Schraffur in der Grenzfarbe. */
function fillExcluded(x, path, color) {
  x.save();
  x.fillStyle = 'rgba(255,255,255,.45)';
  x.fill(path);
  x.fillStyle = x.createPattern(hatch(color), 'repeat');
  x.fill(path);
  x.restore();
}

/* Fläche zwischen einer Pixel-Polyline und einer horizontalen Kante. */
function sidePath(pts, edge) {
  const p = new Path2D();
  pts.forEach(([a, b], i) => i ? p.lineTo(a, b) : p.moveTo(a, b));
  p.lineTo(pts[pts.length - 1][0], edge);
  p.lineTo(pts[0][0], edge);
  p.closePath();
  return p;
}

/* Zusammenhängende endliche Abschnitte einer Kurvenschranke:
   [{ pts: [[x, y], …] }] in Datenkoordinaten. */
function finiteRuns(xs, fn) {
  const runs = [];
  let cur = null;
  for (const xv of xs) {
    const yv = fn(xv);
    if (isFinite(yv)) {
      if (!cur) { cur = []; runs.push(cur); }
      cur.push([xv, yv]);
    } else cur = null;
  }
  return runs.filter(r => r.length > 1);
}

/* Grenzen zeichnen. f = Rahmen, X/Y = Daten→Pixel, d.x = Stützstellen für
   Kurvenschranken. Reihenfolge: Zielbänder, Ausschlussflächen, Linien,
   Beschriftung — alles in den Rahmen geclippt. */
export function drawLimits(x, f, X, Y, d) {
  const limits = d.limits;
  if (!limits || !limits.length) return;
  const C = theme.chart;
  const left = f.L, right = f.L + f.pw, top = f.T, bot = f.T + f.ph;
  const ascX = X(d.x[d.x.length - 1]) >= X(d.x[0]);
  /* d.limitText === 'legend': keine Texte im Diagramm — die Grenzen sind
     ausschließlich über die Legende benannt (z. B. PQ²). */
  const showText = d.limitText !== 'legend';

  x.save();
  x.beginPath(); x.rect(left, top, f.pw, f.ph); x.clip();

  /* Maske (l.mask, Kurvenschranke on:'y'): die ausgeschlossene Seite ist
     prinzipiell unerreichbar (z. B. oberhalb der Hüllkurve im PQ²). Alle
     übrigen Grenzen werden auf die erreichbare Seite geclippt, die Maske
     selbst wird zuletzt als deckende graue Fläche mit durchgezogener
     Frontlinie gezeichnet. */
  /* Zulässiger Bereich (d.feasible): Schnittmenge der erlaubten Seiten
     aller harten Grenzen, grün gefüllt wie das machbare Band im
     (φ, L/D)-Auslegungsfenster. Liegt unter Schraffuren und Linien. */
  if (d.feasible) {
    x.save();
    let any = false;
    for (const l of limits) {
      if ((l.severity || 'hard') !== 'hard') continue;
      let p = null;
      if (l.fn) {
        const pts = d.x.map(xv => [X(xv), Y(l.fn(xv))]).filter(pt => isFinite(pt[1]));
        if (pts.length > 1) p = sidePath(pts, l.kind === 'max' ? bot + 1 : top - 1);
      } else if (l.on === 'x') {
        const px = X(l.value);
        const keepRight = (l.kind === 'min') === ascX;   // erlaubte Pixelseite
        p = new Path2D();
        if (keepRight) p.rect(px, top - 1, right - px + 1, f.ph + 2);
        else p.rect(left - 1, top - 1, px - left + 1, f.ph + 2);
      } else if (typeof l.value === 'number') {
        const py = Y(l.value);
        p = new Path2D();
        if (l.kind === 'max') p.rect(left - 1, py, f.pw + 2, bot - py + 1);
        else p.rect(left - 1, top - 1, f.pw + 2, py - top + 1);
      }
      if (p) { x.clip(p); any = true; }
    }
    if (any) {
      x.fillStyle = C.okFill || 'rgba(0,140,130,.30)';
      x.fillRect(left, top, f.pw, f.ph);
      /* Oberhalb der Trennkurve (d.feasibleSplit.fn, z. B. Maschinenlinie
         des aktuellen Kolbens) wird das Grün aufgehellt: Fenster erfüllt,
         aber mit dem aktuellen Kolben-Ø nicht erreichbar. */
      if (d.feasibleSplit && d.feasibleSplit.fn) {
        const pts = d.x.map(xv => [X(xv), Y(d.feasibleSplit.fn(xv))]).filter(pt => isFinite(pt[1]));
        if (pts.length > 1) {
          x.clip(sidePath(pts, top - 1));
          x.fillStyle = 'rgba(255,255,255,.6)';
          x.fillRect(left, top, f.pw, f.ph);
        }
      }
    }
    x.restore();
  }

  const mask = limits.find(l => l.mask && l.fn && l.on === 'y');
  const rest = mask ? limits.filter(l => l !== mask) : limits;
  let maskPts = null;
  if (mask) {
    maskPts = d.x.map(xv => [X(xv), Y(mask.fn(xv))]).filter(p => isFinite(p[1]));
    if (maskPts.length > 1) {
      x.save();
      x.clip(sidePath(maskPts, mask.kind === 'max' ? bot : top));   // erlaubte Seite
    } else maskPts = null;
  }

  const notes = [];   // Flächen-Kurzlabels, nach den Linien gezeichnet

  for (const l of rest) {
    const sev = l.severity || 'hard';
    const col = limitColor(l);

    /* ── Zielband: weiche Füllung zwischen min und max ── */
    if (sev === 'target') {
      x.fillStyle = l.c || C.band;
      if (l.on === 'x') {
        const a = X(l.min), b = X(l.max);
        x.fillRect(Math.min(a, b), top, Math.abs(b - a), f.ph);
        notes.push({ px: (a + b) / 2, py: top + 13, l: l.label, c: C.text });
      } else if (typeof l.min === 'function' || typeof l.max === 'function') {
        const fLo = typeof l.min === 'function' ? l.min : () => l.min;
        const fHi = typeof l.max === 'function' ? l.max : () => l.max;
        const loP = d.x.map(xv => [xv, fLo(xv)]);
        const hiP = d.x.map(xv => [xv, fHi(xv)]).reverse();
        const path = new Path2D();
        loP.concat(hiP).forEach(([xv, yv], i) => {
          const px = X(xv), py = Y(yv);
          i ? path.lineTo(px, py) : path.moveTo(px, py);
        });
        path.closePath();
        x.fill(path);
        const mid = loP[Math.floor(loP.length / 2)];
        notes.push({ px: X(mid[0]), py: (Y(fLo(mid[0])) + Y(fHi(mid[0]))) / 2, l: l.label, c: C.text });
      } else {
        const a = Y(l.max), b = Y(l.min);
        x.fillRect(left, a, f.pw, b - a);
        notes.push({ px: right - 4, py: a + 13, l: l.label, c: C.text, align: 'right' });
      }
      continue;
    }

    /* ── Referenzlinie / harte Grenze: Linie + ggf. Ausschlussfläche ── */
    if (l.fn) {
      /* Kurvenschranke (nur on:'y'): je endlichem Abschnitt Fläche + Linie */
      for (const run of finiteRuns(d.x, l.fn)) {
        const px = run.map(([xv, yv]) => [X(xv), Y(yv)]);
        if (sev === 'hard') {
          const edge = l.kind === 'max' ? top : bot;
          const path = new Path2D();
          px.forEach(([a, b], i) => i ? path.lineTo(a, b) : path.moveTo(a, b));
          path.lineTo(px[px.length - 1][0], edge);
          path.lineTo(px[0][0], edge);
          path.closePath();
          fillExcluded(x, path, col);
          if (l.note) {
            const m = px[Math.floor(px.length / 2)];
            notes.push({ px: m[0], py: (m[1] + edge) / 2, l: l.note, c: col });
          }
        }
        x.strokeStyle = col; x.lineWidth = 1.4; x.setLineDash([5, 4]);
        x.beginPath();
        px.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b));
        x.stroke();
        x.setLineDash([]);
        /* Label mit hellem Rücken auf ~40 % der sichtbaren Kurve */
        const at = px[Math.floor(px.length * 0.4)];
        if (showText && at && at[1] > top + 8 && at[1] < bot - 4) {
          x.font = '10px Arial';
          const tw = x.measureText(l.label).width;
          x.fillStyle = 'rgba(255,255,255,.88)';
          x.fillRect(at[0] + 4, at[1] - 16, tw + 6, 13);
          x.fillStyle = col; x.textAlign = 'left';
          x.fillText(l.label, at[0] + 7, at[1] - 6);
        }
      }
    } else if (l.on === 'x') {
      const px = X(l.value);
      if (sev === 'hard') {
        /* Ausschluss: kind 'max' → größere Werte, kind 'min' → kleinere */
        const beyond = (l.kind === 'max') === ascX;   // Pixelrichtung des Ausschlusses
        const a = beyond ? px : left, b = beyond ? right : px;
        if (b - a > 1) {
          const path = new Path2D();
          path.rect(a, top, b - a, f.ph);
          fillExcluded(x, path, col);
          if (l.note && b - a > 68) notes.push({ px: (a + b) / 2, py: top + 13, l: l.note, c: col });
        }
      }
      if (px >= left - 1 && px <= right + 1) {
        x.strokeStyle = col; x.lineWidth = 1.3; x.setLineDash([5, 4]);
        x.beginPath(); x.moveTo(px, top); x.lineTo(px, bot); x.stroke();
        x.setLineDash([]);
        if (showText) {
          x.save();
          x.fillStyle = col; x.font = '10px Arial'; x.textAlign = 'left';
          x.translate(px - 4, bot - 8); x.rotate(-Math.PI / 2); x.fillText(l.label, 0, 0);
          x.restore();
        }
      }
    } else {
      const py = Y(l.value);
      if (sev === 'hard') {
        const a = l.kind === 'max' ? top : py, b = l.kind === 'max' ? py : bot;
        if (b - a > 1) {
          const path = new Path2D();
          path.rect(left, a, f.pw, b - a);
          fillExcluded(x, path, col);
          if (l.note && b - a > 26) notes.push({ px: left + f.pw / 2, py: (a + b) / 2 + 4, l: l.note, c: col });
        }
      }
      if (py >= top - 1 && py <= bot + 1) {
        x.strokeStyle = col; x.lineWidth = 1.4; x.setLineDash([6, 4]);
        x.beginPath(); x.moveTo(left, py); x.lineTo(right, py); x.stroke();
        x.setLineDash([]);
        if (showText) {
          x.fillStyle = col; x.textAlign = 'right'; x.font = '11px Arial';
          x.fillText(l.label, right - 4, py - 4);
        }
      }
    }
  }

  /* Flächen-Kurzlabels zuletzt (über den Schraffuren) */
  if (showText) {
    x.font = '10px Arial';
    for (const n of notes) {
      x.fillStyle = n.c; x.textAlign = n.align || 'center';
      x.fillText(n.l, n.px, n.py);
    }
  }

  /* Maske über allem: graue Deckfläche + durchgezogene Frontlinie */
  if (maskPts) {
    x.restore();                          // Clip auf die erreichbare Seite aufheben
    const col = limitColor(mask);
    const edgeEx = mask.kind === 'max' ? top : bot;
    const p = new Path2D();
    maskPts.forEach(([a, b], i) => i ? p.lineTo(a, b) : p.moveTo(a, b));
    p.lineTo(maskPts[maskPts.length - 1][0], edgeEx);
    p.lineTo(maskPts[0][0], edgeEx);
    p.closePath();
    x.fillStyle = C.maskFill || 'rgba(226,231,233,.93)';
    x.fill(p);
    x.strokeStyle = col; x.lineWidth = 1.8;
    x.beginPath();
    maskPts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b));
    x.stroke();
    const mid = maskPts[Math.floor(maskPts.length / 2)];
    if (showText && mask.note) {
      const py = (mid[1] + edgeEx) / 2;
      if (Math.abs(mid[1] - edgeEx) > 26) {
        x.fillStyle = C.iso || col; x.textAlign = 'center'; x.font = '10px Arial';
        x.fillText(mask.note, mid[0], py + 4);
      }
    }
    const at = maskPts[Math.floor(maskPts.length * 0.4)];
    if (showText && at && at[1] > top + 8 && at[1] < bot - 4) {
      x.font = '10px Arial';
      const tw = x.measureText(mask.label).width;
      x.fillStyle = 'rgba(255,255,255,.88)';
      x.fillRect(at[0] + 4, at[1] - 16, tw + 6, 13);
      x.fillStyle = col; x.textAlign = 'left';
      x.fillText(mask.label, at[0] + 7, at[1] - 6);
    }
  }
  x.restore();
}

/* Legendeneinträge der Grenzen: Swatch-Art je severity. */
export function legendItems(limits) {
  return (limits || []).map(l => ({
    label: l.label,
    sev: l.severity || 'hard',
    mask: !!l.mask,
    color: limitColor(l)
  }));
}

/* Einen Legenden-Swatch zeichnen (bei lx, ly-Grundlinie), gibt Breite zurück. */
export function drawLegendSwatch(x, item, lx, ly) {
  if (item.mask) {
    x.fillStyle = theme.chart.maskFill || 'rgba(226,231,233,.93)';
    x.fillRect(lx, ly - 8, 12, 9);
    x.strokeStyle = item.color; x.strokeRect(lx, ly - 8, 12, 9);
  } else if (item.sev === 'target') {
    x.fillStyle = item.color || theme.chart.band;
    x.fillRect(lx, ly - 8, 12, 9);
    x.strokeStyle = theme.chart.axis; x.strokeRect(lx, ly - 8, 12, 9);
  } else if (item.sev === 'hard') {
    x.fillStyle = 'rgba(255,255,255,.45)';
    x.fillRect(lx, ly - 8, 12, 9);
    x.fillStyle = x.createPattern(hatch(item.color), 'repeat');
    x.fillRect(lx, ly - 8, 12, 9);
    x.strokeStyle = item.color; x.strokeRect(lx, ly - 8, 12, 9);
  } else {                              // ref / Serie als Linie
    x.strokeStyle = item.color; x.lineWidth = 1.4;
    x.setLineDash(item.sev === 'ref' ? [4, 3] : []);
    x.beginPath(); x.moveTo(lx, ly - 4); x.lineTo(lx + 12, ly - 4); x.stroke();
    x.setLineDash([]);
  }
  return 12;
}
