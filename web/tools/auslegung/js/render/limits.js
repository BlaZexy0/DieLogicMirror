/* Zeichnet die deklarativen Grenzen (core/limits.js) in ein Diagramm:
   Ausschlussflächen als Schraffur, Grenzlinien gestrichelt, Zielbänder
   gefüllt, Referenzlinien nur als Linie — plus Legendeneinträge.
   Von drawLine (Liniendiagramme) und drawHeat (Heatmaps) benutzt, damit
   Grenzen überall gleich aussehen.

   Farben (alle aus dem Theme, gelesen beim Zeichnen):
     harte Grenze   die Linie in der Farbe ihrer Herkunft (theme.limits[id]):
                    Maschine, Werkzeug und Anschnitt, Prozess, Luft,
                    Schmelze. Glieder einer Familie unterscheidet das
                    Strichmuster (STRICH).
     Sperrbereich   die Seite, die eine harte Grenze ausschließt: in JEDEM
                    Diagramm gleich, `zone` (die Ampel „schlecht")
                    schraffiert auf einem deckenden Schleier der Fläche, auch
                    über einer Heatmap. Die Farbe sagt „hier nicht", nicht,
                    welche Grenze es ist; das sagt die Linie an der Kante.
     Zielband       `target` + gestrichelte Ränder in `targetLine` — eine
                    Empfehlung, heller als das machbare Band. Ein Band, das
                    kein Ziel ist (eine Streuung), nennt seine Rollen selbst:
                    l.c für die Fläche, l.edge für die Ränder.
     machbar        `feasible`, mit anderem Kolben-Ø `feasibleAlt`.
     unerreichbar   `mask`, die Frontlinie in der Farbe ihrer Grenze.
     Referenz       `ref`, oder die Rolle, die das Diagramm in l.c nennt.
   Beschriftungen stehen in Schriftfarbe: Sachfarben sind Linien und
   Flächen, keine Schrift. */

import { theme, farbe } from '../core/theme.js';
import { fillRich, surfaceA } from './base.js';

/* Farbe einer Grenze: explizit als Rolle (l.c) → Familie der Grenze
   (theme.limits[id]) → Referenz. */
export function limitColor(l) {
  return farbe(l.c) || (theme.limits && theme.limits[l.id]) || theme.chart.ref;
}

/* Strichmuster. Harte Grenzen gestrichelt, Referenzlinien kurz gestrichelt;
   die Zerstäubungsgrenzen punktiert, damit sie neben den gleichfarbigen
   v_a-Grenzen des Werkzeugs (PQ²) als eigene Grenze lesbar bleiben. */
const STRICH = { atom: [2, 3], atomMax: [2, 3] };
const STRICH_HART = [6, 4], STRICH_REF = [4, 3];
export function limitDash(l) {
  if (l.dash) return l.dash;
  if (STRICH[l.id]) return STRICH[l.id];
  return (l.severity || 'hard') === 'ref' ? STRICH_REF : STRICH_HART;
}

/* Diagonale Schraffur der Sperrbereiche als Canvas-Pattern, gecacht je
   Farbe (die Farbe folgt dem Schema). */
const patterns = new Map();
function hatch() {
  const color = theme.chart.zone;
  if (patterns.has(color)) return patterns.get(color);
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const g = c.getContext('2d');
  g.strokeStyle = color;
  g.globalAlpha = 0.55;
  g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(-2, 6); g.lineTo(6, -2);
  g.moveTo(2, 10); g.lineTo(10, 2);
  g.stroke();
  patterns.set(color, c);   // Kachel cachen; das Pattern entsteht im Ziel-Kontext
  return c;
}

/* Sperrbereich füllen: die Fläche deckend, dann die Schraffur. So sieht ein
   Sperrbereich über einer Heatmap genau aus wie auf leerem Grund; ein
   halber Schleier ließ die Skala durchscheinen und färbte jeden Bereich
   anders (über Dunkelrot rosa, über Blau grau). Im Sperrbereich gibt es
   keinen gültigen Wert abzulesen. */
const SCHLEIER = 1;
function fillExcluded(x, path) {
  x.save();
  x.fillStyle = surfaceA(SCHLEIER);
  x.fill(path);
  x.fillStyle = x.createPattern(hatch(), 'repeat');
  x.fill(path);
  x.restore();
}

/* Den aktuellen Pfad strichen; auf einer Heatmap (halo) liegt darunter ein
   Rand in der Fläche. Die Skala der Heatmap läuft durch alle Helligkeiten
   und trägt teils denselben Farbton wie eine Grenze (die Schmelze auf der
   Füllgrad-Karte) — ohne Rand verschwände die Linie dort. */
function strokeLine(x, color, width, dash, halo) {
  if (halo) {
    x.save();
    x.strokeStyle = surfaceA(.85); x.lineWidth = width + 2.4; x.setLineDash([]);
    x.stroke();
    x.restore();
  }
  x.strokeStyle = color; x.lineWidth = width; x.setLineDash(dash);
  x.stroke();
  x.setLineDash([]);
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
  const halo = !!d.z;                                 // Grenzen auf einer Heatmap

  x.save();
  x.beginPath(); x.rect(left, top, f.pw, f.ph); x.clip();

  /* Maske (l.mask, Kurvenschranke on:'y'): die ausgeschlossene Seite ist
     prinzipiell unerreichbar (z. B. oberhalb der Hüllkurve im PQ²). Alle
     übrigen Grenzen werden auf die erreichbare Seite geclippt, die Maske
     selbst wird zuletzt als deckende Fläche (`mask`) mit durchgezogener
     Frontlinie gezeichnet. */
  /* Zulässiger Bereich (d.feasible): Schnittmenge der erlaubten Seiten
     aller harten Grenzen, gefüllt in `feasible` wie das machbare Band im
     (φ, λ)-Auslegungsfenster. Liegt unter Schraffuren und Linien. */
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
      /* Trennkurve (d.feasibleSplit.fn, z. B. Maschinenlinie des aktuellen
         Kolbens): darunter `feasible`, darüber `feasibleAlt` — Fenster
         erfüllt, aber mit dem aktuellen Kolben-Ø nicht erreichbar. Beide
         Teile haben genau die Farbe ihres Legendeneintrags. */
      const pts = d.feasibleSplit && d.feasibleSplit.fn
        ? d.x.map(xv => [X(xv), Y(d.feasibleSplit.fn(xv))]).filter(pt => isFinite(pt[1])) : [];
      if (pts.length > 1) {
        x.save();
        x.clip(sidePath(pts, bot + 1));
        x.fillStyle = C.feasible;
        x.fillRect(left, top, f.pw, f.ph);
        x.restore();
        x.save();
        x.clip(sidePath(pts, top - 1));
        x.fillStyle = C.feasibleAlt;
        x.fillRect(left, top, f.pw, f.ph);
        x.restore();
      } else {
        x.fillStyle = C.feasible;
        x.fillRect(left, top, f.pw, f.ph);
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
    const dash = limitDash(l);

    /* ── Zielband: weiche Füllung zwischen min und max, Ränder gestrichelt
       (sonst geht das Band auf Heatmaps optisch unter) ── */
    if (sev === 'target') {
      const edge = farbe(l.edge) || C.targetLine;
      const dashEdge = (fn) => {
        x.beginPath();
        fn();
        strokeLine(x, edge, 1.2, [4, 4], halo);
      };
      x.fillStyle = farbe(l.c) || C.target;
      if (l.on === 'x') {
        const a = X(l.min), b = X(l.max);
        x.fillRect(Math.min(a, b), top, Math.abs(b - a), f.ph);
        dashEdge(() => { x.moveTo(a, top); x.lineTo(a, bot); x.moveTo(b, top); x.lineTo(b, bot); });
        notes.push({ px: (a + b) / 2, py: top + 13, l: l.label });
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
        dashEdge(() => {
          loP.forEach(([xv, yv], i) => i ? x.lineTo(X(xv), Y(yv)) : x.moveTo(X(xv), Y(yv)));
          hiP.forEach(([xv, yv], i) => i ? x.lineTo(X(xv), Y(yv)) : x.moveTo(X(xv), Y(yv)));
        });
        /* Label bei ~30 % der Breite — die Mitte kollidiert oft mit dem Marker */
        const at = loP[Math.floor(loP.length * 0.3)];
        notes.push({ px: X(at[0]), py: (Y(fLo(at[0])) + Y(fHi(at[0]))) / 2, l: l.label });
      } else {
        const a = Y(l.max), b = Y(l.min);
        x.fillRect(left, a, f.pw, b - a);
        dashEdge(() => { x.moveTo(left, a); x.lineTo(right, a); x.moveTo(left, b); x.lineTo(right, b); });
        notes.push({ px: right - 4, py: a + 13, l: l.label, align: 'right' });
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
          fillExcluded(x, path);
          if (l.note) {
            const m = px[Math.floor(px.length / 2)];
            notes.push({ px: m[0], py: (m[1] + edge) / 2, l: l.note });
          }
        }
        x.beginPath();
        px.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b));
        strokeLine(x, col, 1.4, dash, halo);
        /* Label mit hellem Rücken auf ~40 % der sichtbaren Kurve */
        const at = px[Math.floor(px.length * 0.4)];
        if (showText && at && at[1] > top + 8 && at[1] < bot - 4) {
          x.font = '10px Arial';
          const tw = x.measureText(l.label).width;
          x.fillStyle = surfaceA(.88);
          x.fillRect(at[0] + 4, at[1] - 16, tw + 6, 13);
          x.fillStyle = C.text; x.textAlign = 'left';
          fillRich(x, l.label, at[0] + 7, at[1] - 6);
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
          fillExcluded(x, path);
          if (l.note && b - a > 68) notes.push({ px: (a + b) / 2, py: top + 13, l: l.note });
        }
      }
      if (px >= left - 1 && px <= right + 1) {
        x.beginPath(); x.moveTo(px, top); x.lineTo(px, bot);
        strokeLine(x, col, 1.3, dash, halo);
        if (showText) {
          x.save();
          x.fillStyle = C.text; x.font = '10px Arial'; x.textAlign = 'left';
          x.translate(px - 4, bot - 8); x.rotate(-Math.PI / 2); fillRich(x, l.label, 0, 0);
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
          fillExcluded(x, path);
          if (l.note && b - a > 26) notes.push({ px: left + f.pw / 2, py: (a + b) / 2 + 4, l: l.note });
        }
      }
      if (py >= top - 1 && py <= bot + 1) {
        x.beginPath(); x.moveTo(left, py); x.lineTo(right, py);
        strokeLine(x, col, 1.4, dash, halo);
        if (showText) {
          x.fillStyle = C.text; x.textAlign = 'right'; x.font = '11px Arial';
          fillRich(x, l.label, right - 4, py - 4);
        }
      }
    }
  }

  /* Flächen-Kurzlabels zuletzt (über den Schraffuren), in Schrift */
  if (showText) {
    x.font = '10px Arial';
    for (const n of notes) {
      x.fillStyle = C.text; x.textAlign = n.align || 'center';
      fillRich(x, n.l, n.px, n.py);
    }
  }

  /* Maske über allem: deckende Fläche + durchgezogene Frontlinie */
  if (maskPts) {
    x.restore();                          // Clip auf die erreichbare Seite aufheben
    const col = limitColor(mask);
    const edgeEx = mask.kind === 'max' ? top : bot;
    const p = new Path2D();
    maskPts.forEach(([a, b], i) => i ? p.lineTo(a, b) : p.moveTo(a, b));
    p.lineTo(maskPts[maskPts.length - 1][0], edgeEx);
    p.lineTo(maskPts[0][0], edgeEx);
    p.closePath();
    x.fillStyle = C.mask;
    x.fill(p);
    x.beginPath();
    maskPts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b));
    strokeLine(x, col, 1.8, [], halo);
    const mid = maskPts[Math.floor(maskPts.length / 2)];
    if (showText && mask.note) {
      const py = (mid[1] + edgeEx) / 2;
      if (Math.abs(mid[1] - edgeEx) > 26) {
        x.fillStyle = C.muted; x.textAlign = 'center'; x.font = '10px Arial';
        fillRich(x, mask.note, mid[0], py + 4);
      }
    }
    const at = maskPts[Math.floor(maskPts.length * 0.4)];
    if (showText && at && at[1] > top + 8 && at[1] < bot - 4) {
      x.font = '10px Arial';
      const tw = x.measureText(mask.label).width;
      x.fillStyle = surfaceA(.88);
      x.fillRect(at[0] + 4, at[1] - 16, tw + 6, 13);
      x.fillStyle = C.text; x.textAlign = 'left';
      fillRich(x, mask.label, at[0] + 7, at[1] - 6);
    }
  }
  x.restore();
}

/* Legendeneinträge der Grenzen. Eine harte Grenze nennt die Seite, die sie
   ausschließt (oben, unten, links, rechts): der Eintrag zeigt die Linie an
   der Kante und die Schraffur dahinter, so wie im Diagramm. ascX: läuft
   die x-Achse aufsteigend (im t_f-Modus des PQ² nicht). */
export function legendItems(limits, ascX = true) {
  return (limits || []).map(l => {
    const sev = l.severity || 'hard';
    let side = null;
    if (sev === 'hard') {
      if (l.on === 'x') side = ((l.kind === 'max') === ascX) ? 'right' : 'left';
      else side = l.kind === 'max' ? 'top' : 'bottom';
    }
    return {
      label: l.label, sev, mask: !!l.mask, side,
      dash: l.mask ? [] : limitDash(l),
      edge: sev === 'target' ? farbe(l.edge) : undefined,
      /* Zielband: Swatch in der Farbe des Bandes, nicht der Grenzlinien */
      color: sev === 'target' ? (farbe(l.c) || theme.chart.target) : limitColor(l)
    };
  });
}

/* Einen Legenden-Swatch zeichnen (bei lx, ly-Grundlinie), gibt Breite zurück. */
export function drawLegendSwatch(x, item, lx, ly) {
  const C = theme.chart;
  const w = 12, h = 9, t = ly - 8;
  if (item.mask) {
    /* Unerreichbar: deckende Fläche, die Frontlinie an ihrer unteren Kante */
    x.fillStyle = C.mask;
    x.fillRect(lx, t, w, h);
    x.beginPath(); x.moveTo(lx, t + h); x.lineTo(lx + w, t + h);
    x.strokeStyle = item.color; x.lineWidth = 1.8; x.setLineDash([]); x.stroke();
  } else if (item.sev === 'feasible') {
    x.fillStyle = item.color;
    x.fillRect(lx, t, w, h);
    x.strokeStyle = C.axis; x.lineWidth = 1; x.strokeRect(lx, t, w, h);
  } else if (item.sev === 'target') {
    x.fillStyle = item.color || C.target;
    x.fillRect(lx, t, w, h);
    x.strokeStyle = item.edge || C.targetLine; x.lineWidth = 1; x.setLineDash([2, 2]);
    x.strokeRect(lx, t, w, h);
    x.setLineDash([]);
  } else if (item.sev === 'hard') {
    x.fillStyle = surfaceA(SCHLEIER);
    x.fillRect(lx, t, w, h);
    x.fillStyle = x.createPattern(hatch(), 'repeat');
    x.fillRect(lx, t, w, h);
    /* Die Grenzlinie an der Kante zum erlaubten Bereich */
    const s = item.side || 'top';
    x.beginPath();
    if (s === 'top') { x.moveTo(lx, t + h); x.lineTo(lx + w, t + h); }
    else if (s === 'bottom') { x.moveTo(lx, t); x.lineTo(lx + w, t); }
    else if (s === 'right') { x.moveTo(lx, t); x.lineTo(lx, t + h); }
    else { x.moveTo(lx + w, t); x.lineTo(lx + w, t + h); }
    x.strokeStyle = item.color; x.lineWidth = 1.6; x.setLineDash(item.dash || STRICH_HART);
    x.stroke();
    x.setLineDash([]);
  } else {                              // Referenz / Serie als Linie
    x.save();
    x.strokeStyle = item.color; x.lineWidth = item.sev === 'series' ? 2 : 1.4;
    x.globalAlpha = item.alpha || 1;
    x.setLineDash(item.dash || (item.sev === 'ref' ? STRICH_REF : []));
    x.beginPath(); x.moveTo(lx, ly - 4); x.lineTo(lx + w, ly - 4); x.stroke();
    x.restore();
  }
  return w;
}
