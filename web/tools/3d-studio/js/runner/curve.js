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
   Laufkanal, Übergang und Anschnitttiefe — der Übergang ist das, was
   `transition` einstellt.

   DIE ANSCHNITTTIEFE IST GERADE. Der Steg vor dem Bauteil — die letzten
   `gate.len` Millimeter — ist ein Prisma entlang der Mündungsrichtung
   (die gebundene Richtung, sonst die Sehne vom Vorgänger): der Bogen
   endet an seinem Anfang, und ab dort laufen die Schnitte parallel mit
   festem Maß. Lag der Steg noch auf der Kurve, hing seine Länge von der
   Krümmung ab — außen länger, innen kürzer —, ein breiter Fächer
   verdrehte sich über den letzten Millimetern, und die Richtung, mit der
   der Anschnitt ins Bauteil zeigte, war die Tangente an einer Stelle
   statt die Achse eines Stücks. */

import {
  add, sub, scale, addScaled, dot, cross, norm, len, dist, clamp
} from './vec.js';
import * as G from './graph.js';
import { section, area, hydraulic, dimsForArea, widthForArea, POINTS } from './profile.js';

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
  /* Ein an das Bauteil gebundener Anschnitt mündet in SEINER Richtung,
     ganz gleich, wo der Punkt davor liegt. */
  if (child.aim && len(child.aim)) return norm(child.aim);
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

/** Hermite-Bogen einer Kante: Punkte, erste und zweite Ableitung.
    `end` ersetzt Endpunkt und Endrichtung (der Bogen vor einem geraden
    Anschnittsteg endet an dessen Anfang) — die Anfangstangente kommt
    weiter aus dem echten Zielknoten, damit sie dieselbe ist wie die
    Endtangente der Kante davor: ein Punkt mit einem Abgang muss auf
    beiden Kanten denselben Ring haben. */
export function hermite(g, from, to, end = null) {
  const P0 = from.pos, P1 = end ? end.pos : to.pos;
  const L = Math.max(dist(P0, P1), 1e-6);
  const k = (g.tension || 1) * L;
  const m0 = scale(outDir(g, from, to), k);
  const m1 = scale(end ? end.dir : inDir(g, to, from), k);
  /* Ausgeschrieben statt über [0,1,2].map: die Kurve wird je Mauszug
     einige tausend Mal ausgewertet, und drei Closures samt Hilfsfeld je
     Aufruf waren der teuerste Posten der ganzen Abtastung. */
  const mix = (a, b, c, d) => [
    a * P0[0] + b * m0[0] + c * P1[0] + d * m1[0],
    a * P0[1] + b * m0[1] + c * P1[1] + d * m1[1],
    a * P0[2] + b * m0[2] + c * P1[2] + d * m1[2]
  ];
  return {
    at: t => {
      const t2 = t * t, t3 = t2 * t;
      return mix(2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2);
    },
    d1: t => {
      const t2 = t * t;
      return mix(6 * t2 - 6 * t, 3 * t2 - 4 * t + 1, -6 * t2 + 6 * t, 3 * t2 - 2 * t);
    },
    d2: t => mix(12 * t - 6, 6 * t - 4, -12 * t + 6, 6 * t - 2)
  };
}

/* ── Querschnitts-Fahrplan einer Kante ───────────────────────── */

/* Querschnitt am ANFANG einer Kante. An einer Verzweigung ist das nicht
   der volle Zulaufquerschnitt: der teilt sich auf die Äste auf. Jeder
   Ast startet mit seinem Anteil daran — die TIEFE läuft durch, die
   Breite teilt sich, so dass die Flächen sich zum Zulauf addieren. So
   fräst man eine Gabelung: ein Boden in einer Tiefe, der sich in zwei
   Nuten teilt. Vorher wurden beide Maße mit der Wurzel des Anteils
   skaliert; dann sprang der Boden an jeder Gabelung um fast ein Drittel
   nach oben, und das Hosenstück des Sweeps (js/runner/sweep.js) musste
   diese Stufe als schiefes Feld ausgleichen. Ohne Aufteilung wüchse der
   Querschnitt an jeder Gabelung auf das Doppelte, und keine Prüfregel
   könnte je erfüllt werden. */
function startDims(g, from, to) {
  const kids = from.children.filter(c => g.nodes[c]);
  if (kids.length < 2) return { w: from.w, h: from.h };
  const A = area(section(from.w, from.h, g.draft, g.radius)) * G.branchShare(g, from, to.id);
  return { w: widthForArea(A, from.h, g.draft, g.radius), h: from.h };
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
  /* An den Enden die Maße selbst, nicht die Umkehrung über die Fläche:
     die trifft auf 1e-7, und um genau so viel unterschieden sich sonst
     der letzte Schnitt der einen Kante und der erste der nächsten. Der
     Sweep verlässt sich darauf, dass beide DERSELBE Ring sind. */
  return q => (q <= 0 ? { w: aw, h: ah } : q >= 1 ? { w: bw, h: bh }
    : dimsForArea(A0 + (A1 - A0) * q, q0 + (q1 - q0) * q, g.draft, g.radius));
}

/* Der Fahrplan nimmt die BOGENLÄNGE s in mm, nicht den Anteil an der
   Kante: der Steganfang muss exakt getroffen werden, und ein Anteil,
   der hin- und zurückgerechnet wird, verfehlt ihn um eine Rundung. */
function schedule(g, from, to, L, land = 0) {
  const a = startDims(g, from, to);
  if (to.type !== 'gate' || !to.gate) {
    const r = ramp2(g, a.w, a.h, to.w, to.h);
    return s => r(s / L);
  }

  const gt = G.TRANSITIONS[to.gate.transition] || G.TRANSITIONS.ende;
  const trans = Math.max(L * 0.01, (L - land) * gt.share);
  const runEnd = Math.max(0, L - land - trans);
  const transEnd = L - land;                                 // der Steganfang
  const gw = Math.max(0.4, to.gate.w), gh = Math.max(0.2, to.gate.h);
  const runRamp = ramp2(g, a.w, a.h, to.w, to.h);
  /* Nimmt der Übergang die ganze Länge („über die ganze Länge", Fächer),
     gibt es keinen Laufkanalabschnitt, in dem das Kanalmaß des
     Anschnittknotens liegen könnte. Dann führt der Übergang direkt vom
     Zulauf zum Anschnitt. Vorher begann die Kante mit diesem kleineren
     Knotenmaß — ein Sprung am Knoten: 414 mm² am Ende der Kante davor,
     374 am Anfang dieser. */
  const t0 = runEnd > 1e-9 ? { w: to.w, h: to.h } : a;
  const transRamp = ramp2(g, t0.w, t0.h, gw, gh);
  return s => {
    if (runEnd > 1e-9 && s <= runEnd) return runRamp(s / runEnd);
    if (s <= transEnd + 1e-9) {
      const d = transRamp(trans > 1e-9 ? Math.min(1, (s - runEnd) / trans) : 1);
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

/** Der gerade Steg vor einem Anschnitt: Richtung, Länge und sein Anfang
    — oder null, wenn die Kante nicht in einem Anschnitt endet oder der
    Steg keine Länge hat. Der Steg kann höchstens die halbe Sehne lang
    sein; was darüber liegt, wäre keine Kante mehr, sondern ein Balken. */
export function gateLand(g, from, to) {
  if (to.type !== 'gate' || !to.gate) return null;
  const dir = to.aim && len(to.aim) ? norm(to.aim) : norm(sub(to.pos, from.pos));
  if (!len(dir)) return null;
  const length = clamp(to.gate.len || 0, 0, dist(from.pos, to.pos) * 0.5);
  if (length <= 1e-9) return null;
  return { dir, len: length, start: addScaled(to.pos, dir, -length) };
}

/** Eine Kante abtasten. Ergebnis sind Schnitte in gleichen mm-Schritten
    entlang des Bogens; ein gerader Anschnittsteg hängt mit eigenen
    Schritten daran, der erste Schnitt des Stegs ist der letzte des Bogens. */
export function sampleEdge(g, from, to) {
  const land = gateLand(g, from, to);
  /* Mit Steg endet der Bogen an dessen Anfang, mit der Richtung des Stegs. */
  const cur = hermite(g, from, to, land ? { pos: land.start, dir: land.dir } : null);
  /* Bogenlänge über eine feine Hilfsabtastung; daraus die Umkehrung
     Bogenlänge → Parameter. */
  const M = 200;
  const arc = new Float64Array(M + 1);
  let prev = cur.at(0);
  for (let i = 1; i <= M; i++) {
    const p = cur.at(i / M);
    arc[i] = arc[i - 1] + dist(p, prev);
    prev = p;
  }
  const Lc = arc[M];
  const paramAt = s => {
    if (s <= 0) return 0;
    if (s >= Lc) return 1;
    let lo = 0, hi = M;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    const f = (s - arc[lo]) / Math.max(arc[hi] - arc[lo], 1e-12);
    return (lo + f) / M;
  };

  const step = Math.max(0.2, g.step || 1);
  const L = Lc + (land ? land.len : 0);
  const sched = schedule(g, from, to, L, land ? land.len : 0);
  const nA = G.planeNormal(g, from), nB = G.planeNormal(g, to);
  const sections = [];
  const push = (s, p, tan, kappa, nrm, dims) => {
    let u = cross(nrm, tan);
    if (len(u) < 1e-9) u = cross(nrm, [tan[1], tan[2], tan[0]]);
    u = norm(u);
    const sec = section(dims.w, dims.h, g.draft, g.radius);
    sections.push({
      s, p, t: tan, n: nrm, u, v: scale(nrm, -1),
      kappa, sec, area: area(sec), dh: hydraulic(sec),
      land: !!dims.land, trans: !!dims.trans
    });
  };

  const n = Math.max(land ? 1 : 2, Math.round(Lc / step));
  for (let i = 0; i <= n; i++) {
    const s = Lc * i / n;
    const t = paramAt(s);
    const p = cur.at(t);
    const d1 = cur.d1(t), d2 = cur.d2(t);
    const sp = Math.max(len(d1), 1e-9);
    const tan = scale(d1, 1 / sp);
    const kappa = len(cross(d1, d2)) / (sp * sp * sp);
    /* An den Enden die Normale des Knotens selbst, nicht die Mischung
       an der Stelle 0 bzw. 1 — die weicht um Rundungsfehler ab, und
       der Sweep braucht an einem Punkt mit einem Abgang auf beiden
       Kanten denselben Ring. */
    const nrm = i === 0 ? frameNormal(nA, nA, 0, tan) : i === n ? frameNormal(nB, nB, 0, tan)
      : frameNormal(nA, nB, i / n, tan);
    push(s, p, tan, kappa, nrm, sched(s));
  }
  if (land) {
    const nrm = frameNormal(nB, nB, 0, land.dir);
    const m = Math.max(1, Math.round(land.len / step));
    for (let j = 1; j <= m; j++) {
      const s = Lc + land.len * j / m;
      push(s, addScaled(land.start, land.dir, land.len * j / m), land.dir, 0, nrm, sched(s));
    }
  }
  return { fromId: from.id, toId: to.id, from, to, length: L, sections };
}

/** Das ganze Netz abtasten. */
export function sampleNetwork(g) {
  /* Kanalform mitgeben: der Sweep rechnet an den Gabelungen eigene
     Zwischenschnitte und braucht dafür Schräge, Bodenradius und den
     Zwickelradius. */
  const out = { edges: [], step: g.step, draft: g.draft, radius: g.radius, branchR: g.branchR, points: 0 };
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
