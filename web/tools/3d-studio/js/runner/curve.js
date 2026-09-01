/* Aus dem Graphen wird eine Kurve: je Kante ein kubischer Hermite-Bogen,
   abgetastet in gleichen Schritten der BOGENLÄNGE.

   Warum nach Bogenlänge und nicht nach dem Kurvenparameter: alles, was
   danach kommt, rechnet in Millimetern — Querschnitt je mm, Krümmung je
   mm, Reibungsverlust je mm. Ein Parameterschritt ist am Bogenanfang
   kürzer als in der Mitte; die Verlustrechnung wäre dann von der
   Punktverteilung abhängig statt von der Geometrie.

   Die Tangenten stellen die Stetigkeit her, um die es beim Gießen
   wirklich geht: der Strahl soll die Richtung nicht springen. In einer
   Kette ist die Tangente die Catmull-Rom-Tangente (Richtung vom Vor- zum
   Nachfolger), an einer Verzweigung liegt sie zwischen Zulauf und
   Sehne — die Abzweigung öffnet sich also allmählich, statt rechtwinklig
   abzuknicken. Am Anschnitt zeigt die Tangente auf den Anschnitt zu:
   die letzten Millimeter vor dem Anschnitt sollen gerade sein.

   Der Querschnitt zwischen zwei Knoten wird linear über die Bogenlänge
   geführt. Vor einem Anschnitt teilt sich die Kante in drei Abschnitte:
   Laufkanal, Übergang und Anschnittlänge — der Übergang ist das, was
   `transition` einstellt. */

import {
  add, sub, scale, addScaled, dot, cross, norm, len, dist, clamp
} from './vec.js';
import * as G from './graph.js';
import { section, area, hydraulic, dimsForArea, POINTS } from './profile.js';

/* ── Tangenten ───────────────────────────────────────────────── */

function outDir(g, n, child) {
  const chord = norm(sub(child.pos, n.pos));
  const p = G.parentOf(g, n.id);
  if (!p) return chord;
  const inDir = norm(sub(n.pos, p.pos));
  if (!len(inDir)) return chord;
  if (n.children.length === 1) {
    const d = norm(sub(child.pos, p.pos));
    return len(d) ? d : chord;
  }
  const d = norm(add(inDir, chord));
  return len(d) ? d : chord;
}

function inDir(g, child, parent) {
  const chord = norm(sub(child.pos, parent.pos));
  const kids = G.childrenOf(g, child.id);
  if (!kids.length) return chord;                       // Anschnitt: gerade hinein
  if (kids.length === 1) {
    const d = norm(sub(kids[0].pos, parent.pos));
    return len(d) ? d : chord;
  }
  let mean = [0, 0, 0];
  for (const k of kids) mean = add(mean, norm(sub(k.pos, child.pos)));
  mean = norm(mean);
  const d = len(mean) ? norm(add(chord, mean)) : chord;
  return len(d) ? d : chord;
}

/** Hermite-Bogen einer Kante: Punkte, erste und zweite Ableitung. */
export function hermite(g, from, to) {
  const L = Math.max(dist(from.pos, to.pos), 1e-6);
  const k = (g.tension || 1) * L;
  const m0 = scale(outDir(g, from, to), k);
  const m1 = scale(inDir(g, to, from), k);
  const P0 = from.pos, P1 = to.pos;
  return {
    at: t => {
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      return [0, 1, 2].map(i => h00 * P0[i] + h10 * m0[i] + h01 * P1[i] + h11 * m1[i]);
    },
    d1: t => {
      const t2 = t * t;
      const a = 6 * t2 - 6 * t, b = 3 * t2 - 4 * t + 1, c = -6 * t2 + 6 * t, d = 3 * t2 - 2 * t;
      return [0, 1, 2].map(i => a * P0[i] + b * m0[i] + c * P1[i] + d * m1[i]);
    },
    d2: t => {
      const a = 12 * t - 6, b = 6 * t - 4, c = -12 * t + 6, d = 6 * t - 2;
      return [0, 1, 2].map(i => a * P0[i] + b * m0[i] + c * P1[i] + d * m1[i]);
    }
  };
}

/* ── Querschnitts-Fahrplan einer Kante ───────────────────────── */

/* Querschnitt am ANFANG einer Kante. An einer Verzweigung ist das nicht
   der volle Zulaufquerschnitt: der teilt sich auf die Äste auf. Jeder
   Ast startet mit seinem Anteil daran — beide Seitenmaße mit der Wurzel
   des Anteils skaliert, damit das Seitenverhältnis bleibt und die
   Flächen sich zum Zulauf addieren. Ohne das wüchse der Querschnitt an
   jeder Gabelung auf das Doppelte, und keine Prüfregel könnte je
   erfüllt werden. */
function startDims(g, from, to) {
  const kids = from.children.filter(c => g.nodes[c]);
  if (kids.length < 2) return { w: from.w, h: from.h };
  const f = Math.sqrt(G.branchShare(g, from, to.id));
  return { w: from.w * f, h: from.h * f };
}

/* Vor einem Anschnitt zerfällt die Kante in drei Abschnitte. `share`
   sagt, welcher Anteil des Rests auf den Übergang entfällt — bei
   „Absatz" fast nichts, bei „über die ganze Länge" alles.

   Geführt wird dabei die FLÄCHE, nicht Breite und Tiefe einzeln. Der
   Unterschied ist keine Feinheit: ein Fächeranschnitt geht von einem
   tiefen schmalen Kanal (26 × 17) auf einen breiten flachen Anschnitt
   (97 × 2,4). Interpoliert man beide Maße für sich, steht in der Mitte
   35 × 6,8 — und das sind 238 mm² gegenüber 374 am Anfang und 233 am
   Ende. Der Querschnitt WÜCHSE also mittendrin, obwohl beide Enden
   stimmen. Deshalb wird die Fläche geführt und das Seitenverhältnis
   daneben; die Maße folgen daraus. */
function ramp2(g, aw, ah, bw, bh) {
  const A0 = area(section(aw, ah, g.draft, g.radius));
  const A1 = area(section(bw, bh, g.draft, g.radius));
  const q0 = ah / Math.max(aw, 1e-6), q1 = bh / Math.max(bw, 1e-6);
  return q => dimsForArea(A0 + (A1 - A0) * q, q0 + (q1 - q0) * q, g.draft, g.radius);
}

function schedule(g, from, to, L) {
  const a = startDims(g, from, to);
  if (to.type !== 'gate' || !to.gate) return ramp2(g, a.w, a.h, to.w, to.h);

  const gt = G.TRANSITIONS[to.gate.transition] || G.TRANSITIONS.ende;
  const land = clamp(to.gate.len, 0, L * 0.4);
  const trans = Math.max(L * 0.01, (L - land) * gt.share);
  const runEnd = Math.max(0, L - land - trans);
  const gw = Math.max(0.4, to.gate.w), gh = Math.max(0.2, to.gate.h);
  const runRamp = ramp2(g, a.w, a.h, to.w, to.h);
  const transRamp = ramp2(g, to.w, to.h, gw, gh);
  return u => {
    const s = u * L;
    if (s <= runEnd) return runRamp(runEnd > 1e-9 ? s / runEnd : 1);
    if (s <= runEnd + trans) {
      const d = transRamp(trans > 1e-9 ? (s - runEnd) / trans : 1);
      return { w: d.w, h: d.h, trans: true };
    }
    return { w: gw, h: gh, land: true };
  };
}

/* ── Abtasten ────────────────────────────────────────────────── */

/** Normale der Arbeitsebene zwischen zwei Knoten mischen und gegen die
    Laufrichtung senkrecht stellen. */
function frameNormal(nA, nB, u, t) {
  let n = [nA[0] + (nB[0] - nA[0]) * u, nA[1] + (nB[1] - nA[1]) * u, nA[2] + (nB[2] - nA[2]) * u];
  if (len(n) < 1e-6) n = nA;
  const perp = addScaled(n, t, -dot(n, t));
  return len(perp) > 1e-6 ? norm(perp) : norm(addScaled(nA, t, -dot(nA, t)));
}

/** Eine Kante abtasten. Ergebnis sind Schnitte in gleichen mm-Schritten. */
export function sampleEdge(g, from, to) {
  const cur = hermite(g, from, to);
  /* Bogenlänge über eine feine Hilfsabtastung; daraus die Umkehrung
     Bogenlänge → Parameter. */
  const M = 200;
  const ts = new Float64Array(M + 1), arc = new Float64Array(M + 1);
  let prev = cur.at(0);
  for (let i = 1; i <= M; i++) {
    const t = i / M;
    const p = cur.at(t);
    arc[i] = arc[i - 1] + dist(p, prev);
    ts[i] = t;
    prev = p;
  }
  const L = arc[M];
  const paramAt = s => {
    if (s <= 0) return 0;
    if (s >= L) return 1;
    let lo = 0, hi = M;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    const f = (s - arc[lo]) / Math.max(arc[hi] - arc[lo], 1e-12);
    return (lo + f) / M;
  };

  const step = Math.max(0.2, g.step || 1);
  const n = Math.max(2, Math.round(L / step));
  const sched = schedule(g, from, to, L);
  const nA = G.planeNormal(g, from), nB = G.planeNormal(g, to);
  const sections = [];
  for (let i = 0; i <= n; i++) {
    const s = L * i / n;
    const t = paramAt(s);
    const p = cur.at(t);
    const d1 = cur.d1(t), d2 = cur.d2(t);
    const sp = Math.max(len(d1), 1e-9);
    const tan = scale(d1, 1 / sp);
    const kappa = len(cross(d1, d2)) / (sp * sp * sp);
    const nrm = frameNormal(nA, nB, i / n, tan);
    let u = cross(nrm, tan);
    if (len(u) < 1e-9) u = cross(nrm, [tan[1], tan[2], tan[0]]);
    u = norm(u);
    const dims = sched(i / n);
    const sec = section(dims.w, dims.h, g.draft, g.radius);
    sections.push({
      s, p, t: tan, n: nrm, u, v: scale(nrm, -1),
      kappa, sec, area: area(sec), dh: hydraulic(sec),
      land: !!dims.land, trans: !!dims.trans
    });
  }
  return { fromId: from.id, toId: to.id, from, to, length: L, sections };
}

/** Das ganze Netz abtasten. */
export function sampleNetwork(g) {
  const out = { edges: [], step: g.step, points: 0 };
  for (const e of G.edges(g)) {
    const s = sampleEdge(g, e.from, e.to);
    out.edges.push(s);
    out.points += s.sections.length;
  }
  /* Querschnitt am Knoten selbst — für die Regelprüfung und die Anzeige. */
  out.nodeArea = {};
  for (const n of G.allNodes(g)) {
    const sec = section(n.w, n.h, g.draft, g.radius);
    out.nodeArea[n.id] = { sec, area: area(sec), dh: hydraulic(sec) };
  }
  for (const e of out.edges) {
    if (e.to.type === 'gate' && e.sections.length) {
      const last = e.sections[e.sections.length - 1];
      out.nodeArea[e.to.id + ':gate'] = { sec: last.sec, area: last.area, dh: last.dh };
    }
  }
  out.length = out.edges.reduce((a, e) => a + e.length, 0);
  out.profilePoints = POINTS;
  return out;
}
