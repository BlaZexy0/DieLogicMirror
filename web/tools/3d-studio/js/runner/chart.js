/* Das Flussschema: der Angussbaum als Diagramm statt als Körper.

   Im Viewport sieht man, wie der Anguss AUSSIEHT. Ob er hydraulisch
   aufgeht, sieht man dort gerade nicht — dafür müsste man Querschnitte
   entlang einer Kurve im Kopf vergleichen. Das Schema klappt den Baum in
   die Ebene: waagerecht die Lauflänge vom Pressrest, senkrecht die
   Verzweigung. Jede Kante ist ein Band, dessen Dicke der Wurzel aus dem
   Querschnitt folgt (nicht dem Querschnitt selbst — sonst verschwinden
   die Anschnitte neben dem Verteiler), und dessen Farbe die
   Geschwindigkeit zeigt.

   So liest man in einem Bild ab, was sonst drei Tabellen bräuchte: wo
   der Querschnitt springt, welcher Ast zu schnell wird, und wie weit
   Soll- und Ist-Aufteilung auseinanderliegen.

   Ausgabe ist SVG als Zeichenkette — kein Zeichenprogramm, keine
   Bibliothek, und im Ausdruck scharf. */

import * as G from './graph.js';
import { ramp } from '../part/colors.js';

/* Geschwindigkeit: ruhig und weit (Hausblau) → schnell und eng (Rot). */
const V_STOPS = ['#2e6da4', '#3fc2b6', '#d4a908', '#b42318'];
const css = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';
export const speedColor = (v, vMax) => css(ramp(V_STOPS, v / Math.max(vMax, 1e-6)));

const fmt = (v, n = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: n });

/**
 * Schema zeichnen.
 *   g, net, flow  wie überall
 *   opts.width    Breite in Bildpunkten
 */
export function flowChart(g, net, flow, opts = {}) {
  const W = opts.width || 620;
  const padL = 92, padR = 156, padT = 26, padB = 34;
  const gates = flow.gates;
  if (!gates.length) return '<p class="chart-empty">Ohne Anschnitt gibt es nichts zu verteilen.</p>';

  /* Zeilen: je Anschnitt eine, innere Knoten in die Mitte ihrer Kinder. */
  const row = {};
  let next = 0;
  const place = id => {
    const kids = G.childrenOf(g, id);
    if (!kids.length) { row[id] = next++; return row[id]; }
    let sum = 0;
    for (const k of kids) sum += place(k.id);
    row[id] = sum / kids.length;
    return row[id];
  };
  place(g.rootId);
  const rows = Math.max(next, 1);

  /* Spalten: Lauflänge vom Pressrest. */
  const dist = { [g.rootId]: 0 };
  const edgeOf = new Map(net.edges.map(e => [e.toId, e]));
  G.walk(g, n => {
    for (const c of n.children) {
      const e = edgeOf.get(c);
      if (e) dist[c] = (dist[n.id] || 0) + e.length;
    }
  });
  const maxDist = Math.max(...Object.values(dist), 1);
  const H = padT + padB + rows * 58;
  const X = d => padL + (W - padL - padR) * (d / maxDist);
  const Y = r => padT + (r + 0.5) * (H - padT - padB) / rows;

  const vMax = Math.max(...gates.map(r => r.v), 1);
  const aMax = Math.max(...net.edges.map(e => e.sections[0].area), 1);
  const thick = a => 3 + 16 * Math.sqrt(Math.max(a, 0) / aMax);

  /* Beschriftungen dürfen sich nicht überlagern. Bei kurzen Kanten und
     bei zwei Ästen, die dicht beieinander laufen, stehen sonst zwei
     Zahlen übereinander und keine ist mehr lesbar — dann lieber eine
     weglassen: die Zahl steht ohnehin auch in der Seitenleiste. */
  const placed = [];
  const fits = (x, y, w) => {
    for (const b of placed) {
      if (Math.abs(b.y - y) < 13 && x - w / 2 < b.x + b.w / 2 && x + w / 2 > b.x - b.w / 2) return false;
    }
    placed.push({ x, y, w });
    return true;
  };
  /* Die Beschriftungen der Anschnitte stehen fest — sie werden zuerst
     eingetragen, damit die Kantenbeschriftungen ihnen ausweichen. */
  for (const r of gates) {
    const x = X(dist[r.id] || 0) + 10, y = Y(row[r.id]);
    placed.push({ x: x + 55, y: y - 2, w: 110 });
    placed.push({ x: x + 55, y: y + 11, w: 110 });
  }

  const parts = [];
  parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" '
    + 'aria-label="Flussschema des Angusssystems">');
  parts.push('<style>.cl{font:10px var(--mono,monospace);fill:#557786}'
    + '.cn{font:600 10.5px system-ui,sans-serif;fill:#0d2933}</style>');

  /* Bänder */
  for (const e of net.edges) {
    const a = e.sections[0], b = e.sections[e.sections.length - 1];
    const x1 = X(dist[e.fromId] || 0), x2 = X(dist[e.toId] || 0);
    const y1 = Y(row[e.fromId]), y2 = Y(row[e.toId]);
    const t1 = thick(a.area) / 2, t2 = thick(b.area) / 2;
    const l = flow.losses.get(e.toId) || { vIn: 0, vOut: 0 };
    const col = speedColor((l.vIn + l.vOut) / 2, vMax);
    parts.push('<path d="M' + x1 + ' ' + (y1 - t1) + ' L' + x2 + ' ' + (y2 - t2)
      + ' L' + x2 + ' ' + (y2 + t2) + ' L' + x1 + ' ' + (y1 + t1) + ' Z" fill="' + col
      + '" fill-opacity=".85" stroke="' + col + '" stroke-width=".8"/>');
    /* Die Kante ZUM Anschnitt bekommt keine eigene Beschriftung: Fläche
       und Geschwindigkeit stehen rechts neben dem Anschnitt, und die
       kurzen Anschnittwege liegen sonst übereinander. */
    if (e.to.type === 'gate') continue;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 - Math.max(t1, t2) - 5;
    const label = fmt(b.area, 0) + ' mm² · ' + fmt(l.vOut) + ' m/s';
    if (Math.abs(x2 - x1) > 34 && fits(mx, my, label.length * 6.1)) {
      parts.push('<text class="cl" x="' + mx + '" y="' + my + '" text-anchor="middle">' + label + '</text>');
    }
  }

  /* Knoten */
  for (const n of G.allNodes(g)) {
    const x = X(dist[n.id] || 0), y = Y(row[n.id]);
    const meta = G.TYPES[n.type];
    parts.push('<circle cx="' + x + '" cy="' + y + '" r="' + (n.type === 'gate' ? 5.5 : 4.5)
      + '" fill="' + meta.color + '" stroke="#fff" stroke-width="1.5"/>');
    if (n.type === 'root') {
      parts.push('<text class="cn" x="' + (x - 10) + '" y="' + (y + 3.5) + '" text-anchor="end">Pressrest</text>');
    }
    if ((n.type === 'branch' || n.type === 'mirror') && n.children.length === 2) {
      const t = fmt(n.ratio * 100, 0) + ':' + fmt((1 - n.ratio) * 100, 0);
      if (fits(x, y - 12, t.length * 6.1)) {
        parts.push('<text class="cl" x="' + x + '" y="' + (y - 12) + '" text-anchor="middle">' + t + '</text>');
      }
    }
  }

  /* Anschnitte rechts beschriften */
  for (const r of gates) {
    const x = X(dist[r.id] || 0), y = Y(row[r.id]);
    const dev = r.ist - r.soll;
    const col = Math.abs(dev) > 0.05 ? '#b42318' : '#557786';
    parts.push('<text class="cn" x="' + (x + 10) + '" y="' + (y - 2) + '">'
      + fmt(r.area, 0) + ' mm² · ' + fmt(r.v) + ' m/s</text>');
    parts.push('<text class="cl" x="' + (x + 10) + '" y="' + (y + 11) + '" fill="' + col + '">'
      + 'soll ' + fmt(r.soll * 100, 0) + ' % · ist ' + fmt(r.ist * 100, 0) + ' %</text>');
  }

  /* Maßstab unten */
  parts.push('<line x1="' + padL + '" y1="' + (H - 16) + '" x2="' + X(maxDist)
    + '" y2="' + (H - 16) + '" stroke="#c9d6da"/>');
  for (let i = 0; i <= 4; i++) {
    const d = maxDist * i / 4;
    parts.push('<line x1="' + X(d) + '" y1="' + (H - 20) + '" x2="' + X(d) + '" y2="' + (H - 12) + '" stroke="#c9d6da"/>');
    parts.push('<text class="cl" x="' + X(d) + '" y="' + (H - 3) + '" text-anchor="middle">'
      + fmt(d, 0) + '</text>');
  }
  parts.push('<text class="cl" x="' + (X(maxDist) + 18) + '" y="' + (H - 3) + '">mm Lauflänge</text>');
  parts.push('</svg>');
  return parts.join('');
}
