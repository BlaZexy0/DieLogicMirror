/* Das Netz: EIN geschlossener Körper aus dem abgetasteten Graphen.

   Jede Kante wird als Schlauch gezogen — Vierecke zwischen benachbarten
   Schnitten. Die Schläuche enden aber nicht mehr in Deckeln, die sich an
   den Gabelungen durchdringen: dort bleiben sie OFFEN, und die Gabelung
   wird als eigenes Flächenstück gebaut, das die drei Ringe verbindet —
   ein Hosenstück aus Streifen und Feldern, alles aus Kurve, Profil und
   Radius konstruiert, nichts gerastert, nichts boolesch gerechnet:

     Außenstreifen   Die rechte Profilhälfte (Flanke samt Boden-
                     verrundung, von der oberen Ecke bis zum Flankenfuß)
                     läuft über einen Hermite-Bogen vom Zulaufring in die
                     rechte Hälfte des rechten Abgangs; die linke ebenso
                     in den linken Abgang. Die Außenwand der Gabelung
                     biegt also stetig vom Zulauf in den Abgang.
     Zwickel         Die einander zugewandten Innenhälften zweier Abgänge
                     gehen ineinander über — entlang der Zwickelkante:
                     die geraden Innenwände beider Abgänge bis zu ihrem
                     Schnittpunkt, dort mit einem KREISBOGEN vom
                     Zwickelradius verrundet, so wie ein Fräser die
                     Innenecke stehen lässt. Das Profil dreht dabei von
                     der einen Wand um die Nase herum in die andere.
     Deckfläche      Das Feld zwischen den oberen Kanten — Trennebene —
                     wird durch Ohrenabschneiden trianguliert;
     Boden           das Feld zwischen den Flankenfüßen ebenso.

   Die Streifen treffen die Ringe der Schläuche Punkt für Punkt, das Netz
   ist geschlossen und einheitlich nach außen orientiert; die Tests
   prüfen das an allen Beispielen (tests/web/3d-studio/runner.test.mjs).

   Ein Punkt mit genau einem Abgang braucht nichts: der letzte Schnitt
   der Kante davor und der erste der Kante danach sind derselbe Ring.
   Einen ebenen Deckel gibt es nur am Anschnitt — die Austrittsfläche
   ins Bauteil.

   AM PRESSREST IST DER KANAL BESCHNITTEN. Der erste Kanal beginnt in
   der Mitte des Pressrests; Anguss und Pressrest sollen aber zwei
   Körper sein, die sich berühren statt zu durchdringen. Jede Kante
   vom Pressrest wird deshalb am Mantel des Zylinders abgeschnitten —
   am selben 64-Eck, aus dem biscuitMesh den Zylinder baut, damit der
   Deckel des Kanals genau auf dessen Facetten liegt: jede Längslinie
   des Schlauchs wird bis zu ihrem Austritt durch den Mantel verfolgt,
   der Ring dieser Austrittspunkte ist der Anfang des Kanals, und das
   Feld darin wird auf dem abgewickelten Mantel facettenweise
   trianguliert. Verlässt ein Kanal den Zylinder nicht durch den Mantel
   (zu kurz, tiefer als der Pressrest, schon draußen), bleibt er wie
   früher mit einem Deckel in der Mitte stehen.

   Ausgabe wie überall im Studio: Dreieckssuppe, 9 Werte je Dreieck. */

import {
  outline, section, area, dimsForArea, POINTS, RIGHT_HALF, LEFT_HALF, TOP_EDGE, BOTTOM_EDGE
} from './profile.js';
import { cyl, place, translate } from '../solids.js';
import { AXES } from './graph.js';
import { add, sub, scale, addScaled, dot, cross, norm, len, dist, clamp } from './vec.js';

const HALF = RIGHT_HALF.length;                 // Punkte je Profilhälfte

/** Weltpunkte eines Schnitts: POINTS Punkte im Umlaufsinn. */
export function ringPoints(sec, out = new Float64Array(POINTS * 3)) {
  const o = outline(sec.sec);
  const { p, u, v } = sec;
  for (let i = 0; i < POINTS; i++) {
    const x = o[i * 2], y = o[i * 2 + 1];
    out[i * 3] = p[0] + u[0] * x + v[0] * y;
    out[i * 3 + 1] = p[1] + u[1] * x + v[1] * y;
    out[i * 3 + 2] = p[2] + u[2] * x + v[2] * y;
  }
  return out;
}

/* Eine Profilhälfte: die Umrisspunkte `idx` um die Mitte c mit den Achsen
   u (quer, +u ist rechts) und v (in die Tiefe). Dieselbe Rechnung wie
   ringPoints — an den Ringen der Schläuche kommen deshalb Bit für Bit
   dieselben Punkte heraus. */
function halfPoints(c, u, v, sec, idx) {
  const o = outline(sec);
  const out = new Float64Array(idx.length * 3);
  for (let k = 0; k < idx.length; k++) {
    const x = o[idx[k] * 2], y = o[idx[k] * 2 + 1];
    out[k * 3] = c[0] + u[0] * x + v[0] * y;
    out[k * 3 + 1] = c[1] + u[1] * x + v[1] * y;
    out[k * 3 + 2] = c[2] + u[2] * x + v[2] * y;
  }
  return out;
}

const pt = (arr, k) => [arr[k * 3], arr[k * 3 + 1], arr[k * 3 + 2]];

/* ── Schreiben ───────────────────────────────────────────────── */

/* Geschrieben wird in ein vorab bemessenes Feld; die Zahl der Dreiecke
   steht fest, sobald die Stücke der Gabelungen gebaut sind. Wächst es
   doch einmal (ein Feld mit mehr Ohren als geschätzt), verdoppelt es
   sich — nicht bei jedem Dreieck. */
function writer(estimate) {
  let a = new Float64Array(Math.max(estimate, 64) * 9);
  let k = 0;
  const room = () => { if (k + 9 > a.length) { const b = new Float64Array(a.length * 2); b.set(a); a = b; } };
  return {
    tri(p, pi, q, qi, r, ri) {
      room();
      const t = a;
      t[k] = p[pi * 3]; t[k + 1] = p[pi * 3 + 1]; t[k + 2] = p[pi * 3 + 2];
      t[k + 3] = q[qi * 3]; t[k + 4] = q[qi * 3 + 1]; t[k + 5] = q[qi * 3 + 2];
      t[k + 6] = r[ri * 3]; t[k + 7] = r[ri * 3 + 1]; t[k + 8] = r[ri * 3 + 2];
      k += 9;
    },
    tri3(p, q, r) {
      room();
      const t = a;
      t[k] = p[0]; t[k + 1] = p[1]; t[k + 2] = p[2];
      t[k + 3] = q[0]; t[k + 4] = q[1]; t[k + 5] = q[2];
      t[k + 6] = r[0]; t[k + 7] = r[1]; t[k + 8] = r[2];
      k += 9;
    },
    done() { return a.subarray(0, k); }
  };
}

/* ── Schläuche und Deckel ────────────────────────────────────── */

/* Der Umriss läuft im Profil gegen den Uhrzeigersinn; mit v = −n zeigt
   seine Flächennormale entgegen der Laufrichtung. Damit die Mantelnormalen
   nach AUSSEN zeigen, muss das Viereck andersherum umlaufen als der Ring —
   die Deckel entsprechend (Anfang mit dem Ring, Ende dagegen). */
function shell(sections, i0, i1, w) {
  let a = ringPoints(sections[i0]);
  for (let k = i0 + 1; k <= i1; k++) {
    const b = ringPoints(sections[k]);
    for (let i = 0; i < POINTS; i++) {
      const j = (i + 1) % POINTS;
      w.tri(a, i, b, i, b, j);
      w.tri(a, i, b, j, a, j);
    }
    a = b;
  }
}

const centroid = r => {
  const c = [0, 0, 0];
  for (let i = 0; i < POINTS; i++) { c[0] += r[i * 3]; c[1] += r[i * 3 + 1]; c[2] += r[i * 3 + 2]; }
  return Float64Array.from([c[0] / POINTS, c[1] / POINTS, c[2] / POINTS]);
};

/** Ebener Deckel: Fächer vom Schwerpunkt auf den Umriss. */
function cap(sections, index, atEnd, w) {
  const r = ringPoints(sections[index]);
  const cc = centroid(r);
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    if (atEnd) w.tri(cc, 0, r, j, r, i);
    else w.tri(cc, 0, r, i, r, j);
  }
}

/* Ein Streifen aus Halbringen gleicher Punktzahl. Die rechte Hälfte
   läuft im Ring aufwärts (Index steigt), die linke abwärts — deshalb
   muss die linke andersherum gewickelt werden, sonst zeigten ihre
   Normalen nach innen und die gemeinsame Kante mit dem Schlauch liefe
   in beiden Dreiecken gleich. */
function strip(halves, flip, w) {
  for (let k = 1; k < halves.length; k++) {
    const a = halves[k - 1], b = halves[k];
    for (let i = 0; i < HALF - 1; i++) {
      const j = i + 1;
      if (flip) { w.tri(a, i, b, j, b, i); w.tri(a, i, a, j, b, j); }
      else { w.tri(a, i, b, i, b, j); w.tri(a, i, b, j, a, j); }
    }
  }
}

/* ── Felder: Ohrenabschneiden ────────────────────────────────── */

/* Ein einfaches Polygon (gegen den Uhrzeigersinn) in Indexdreiecke.
   Ein einspringendes Polygon wie die Deckfläche einer Gabelung — ein
   Ypsilon mit Buchten — lässt sich nicht fächern; abgeschnitten wird,
   was ein Ohr ist: eine konvexe Ecke, in deren Dreieck kein anderer
   Punkt liegt. Entartet der Rest (sich kreuzende Kanten), bleibt, was
   da ist — lieber ein kleines Loch als eine Ausnahme mitten im Zug. */
function earClip(poly) {
  const n = poly.length;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const out = [];
  const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross2(a, b, p) >= -1e-12 && cross2(b, c, p) >= -1e-12 && cross2(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = poly[i0], b = poly[i1], c = poly[i2];
      if (cross2(a, b, c) <= 1e-12) continue;                 // einspringende oder gestreckte Ecke
      let ok = true;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (inside(poly[j], a, b, c)) { ok = false; break; }
      }
      if (!ok) continue;
      out.push([i0, i1, i2]);
      idx.splice(k, 1);
      cut = true;
      break;
    }
    if (!cut) break;
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/* Das Ohrenabschneiden liefert IRGENDEINE Triangulation — in der Regel
   Fächer aus langen, spitzen Dreiecken, die von einer Ecke aus das ganze
   Feld überspannen. Auf einer ebenen Deckfläche ist das egal; der Boden
   einer Gabelung ist aber leicht geneigt (die Tiefe nimmt vom Zulauf zu
   den Abgängen ab) oder gar verdreht, und dann hat jedes dieser
   Splitterdreiecke seine eigene Normale: die Flächenschattierung zeigt
   Streifen, die vom Nasenpunkt ausstrahlen. Der Kantentausch nach
   Lawson macht daraus die Delaunay-Triangulation derselben Randpunkte —
   die mit dem größten kleinsten Winkel: Sprossen quer über den Kanal
   statt Strahlen längs, und benachbarte Dreiecke ändern ihre Normale nur
   so viel, wie die Fläche sich wirklich neigt. Getauscht wird nur, wo
   das Viereck aus beiden Dreiecken konvex ist — so bleibt alles im
   Polygon, und der Rand bleibt, wie er ist. */
function delaunay(poly, tris) {
  const n = poly.length;
  const key = (a, b) => (a < b ? a * n + b : b * n + a);
  const edges = new Map();                                    // Kante → [Dreiecke]
  const link = (t, a, b) => { const k = key(a, b); const l = edges.get(k); if (l) l.push(t); else edges.set(k, [t]); };
  const unlink = (t, a, b) => { const k = key(a, b); const l = edges.get(k); if (!l) return; const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); if (!l.length) edges.delete(k); };
  tris.forEach((t, i) => { link(i, t[0], t[1]); link(i, t[1], t[2]); link(i, t[2], t[0]); });
  const cross2 = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  /* d im Umkreis von (a, b, c), gegen den Uhrzeigersinn: Determinante > 0. */
  const inCircle = (a, b, c, d) => {
    const ax = poly[a][0] - poly[d][0], ay = poly[a][1] - poly[d][1];
    const bx = poly[b][0] - poly[d][0], by = poly[b][1] - poly[d][1];
    const cx = poly[c][0] - poly[d][0], cy = poly[c][1] - poly[d][1];
    const det = (ax * ax + ay * ay) * (bx * cy - cx * by)
      - (bx * bx + by * by) * (ax * cy - cx * ay)
      + (cx * cx + cy * cy) * (ax * by - bx * ay);
    /* Relativ zur Größe: vier Punkte auf einem Kreis dürfen nicht hin-
       und hergetauscht werden. */
    const scale = (ax * ax + ay * ay + bx * bx + by * by + cx * cx + cy * cy);
    return det > 1e-9 * scale * scale;
  };
  const apex = (t, a, b) => (t[0] !== a && t[0] !== b ? t[0] : t[1] !== a && t[1] !== b ? t[1] : t[2]);
  const queue = [...edges.keys()];
  let guard = 0;
  while (queue.length && guard++ < 40 * n) {
    const k = queue.pop();
    const l = edges.get(k);
    if (!l || l.length !== 2) continue;                       // Rand oder schon weg
    const [i, j] = l;
    const a = Math.floor(k / n), b = k % n;
    const c = apex(tris[i], a, b), d = apex(tris[j], a, b);
    /* c links von a→b, d rechts — sonst die Rollen tauschen. */
    let A = a, B = b;
    if (cross2(A, B, c) < 0) { A = b; B = a; }
    if (!(cross2(A, B, c) > 0 && cross2(B, A, d) > 0)) continue;
    if (!inCircle(A, B, c, d)) continue;
    /* Konvex: a und b auf verschiedenen Seiten der neuen Kante c–d. */
    const sa = cross2(c, d, A), sb = cross2(c, d, B);
    if (!(sa * sb < 0) || Math.abs(sa) < 1e-12 || Math.abs(sb) < 1e-12) continue;
    unlink(i, A, B); unlink(j, A, B);
    unlink(i, B, c); unlink(j, A, d);
    tris[i] = [A, d, c];
    tris[j] = [B, c, d];
    link(i, A, d); link(i, d, c); link(j, B, c); link(j, c, d);
    queue.push(key(A, d), key(d, B), key(B, c), key(c, A));
  }
  return tris;
}

/* Zweiter Durchgang, diesmal im RAUM: ist ein Feld verdreht (die
   Ebenen der Abgänge stehen anders als die des Zulaufs), dann ist jedes
   Viereck aus zwei Nachbardreiecken windschief, und welche Diagonale es
   teilt, entscheidet, wie stark die beiden Normalen gegeneinander
   knicken. Delaunay wählt sie nach der Form in der Ebene und damit
   beliebig — das gab feine Sprossen in der Schattierung. Hier wird die
   Diagonale genommen, bei der die zwei Dreiecke am wenigsten knicken
   (Dyn/Levin/Rippa, „angle between normals"), wieder nur über konvexe
   Vierecke, damit nichts das Polygon verlässt. */
function smoothDiagonals(poly, pts, tris) {
  const n = poly.length;
  const key = (a, b) => (a < b ? a * n + b : b * n + a);
  const edges = new Map();
  const link = (t, a, b) => { const k = key(a, b); const l = edges.get(k); if (l) l.push(t); else edges.set(k, [t]); };
  const unlink = (t, a, b) => { const k = key(a, b); const l = edges.get(k); if (!l) return; const i = l.indexOf(t); if (i >= 0) l.splice(i, 1); if (!l.length) edges.delete(k); };
  tris.forEach((t, i) => { link(i, t[0], t[1]); link(i, t[1], t[2]); link(i, t[2], t[0]); });
  const cross2 = (a, b, c) => (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
  const nrm = (a, b, c) => norm(cross(sub(pts[b], pts[a]), sub(pts[c], pts[a])));
  /* Knick zwischen zwei Dreiecken: 1 − cos des Normalenwinkels. */
  const bend = (a, b, c, d) => 1 - dot(nrm(a, b, c), nrm(a, c, d));
  const apex = (t, a, b) => (t[0] !== a && t[0] !== b ? t[0] : t[1] !== a && t[1] !== b ? t[1] : t[2]);
  const queue = [...edges.keys()];
  let guard = 0;
  while (queue.length && guard++ < 20 * n) {
    const k = queue.pop();
    const l = edges.get(k);
    if (!l || l.length !== 2) continue;
    const [i, j] = l;
    let a = Math.floor(k / n), b = k % n;
    const c = apex(tris[i], a, b), d = apex(tris[j], a, b);
    if (cross2(a, b, c) < 0) { const t = a; a = b; b = t; }
    if (!(cross2(a, b, c) > 0 && cross2(b, a, d) > 0)) continue;
    const sa = cross2(c, d, a), sb = cross2(c, d, b);
    if (!(sa * sb < 0) || Math.abs(sa) < 1e-12 || Math.abs(sb) < 1e-12) continue;
    /* Jetzt: Diagonale a–b teilt in (a,b,c) und (b,a,d); c–d teilte in
       (c,d,a)… — Knick um a–b gegen Knick um c–d. */
    const now = bend(a, b, c, d), then = bend(c, d, b, a);
    if (!(then < now - 1e-4)) continue;
    unlink(i, a, b); unlink(j, a, b);
    unlink(i, b, c); unlink(j, a, d);
    tris[i] = [a, d, c];
    tris[j] = [b, c, d];
    link(i, a, d); link(i, d, c); link(j, b, c); link(j, c, d);
    queue.push(key(a, d), key(d, b), key(b, c), key(c, a));
  }
  return tris;
}

/** Ein geschlossener Punktezug im Raum wird in die Ebene (e1, e2) gelegt,
    dort trianguliert, und jedes Dreieck so gewickelt, dass seine Normale
    in Richtung `out` zeigt. */
function fillLoop(loop, e1, e2, out, w) {
  const poly = loop.map(p => [dot(p, e1), dot(p, e2)]);
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    s += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1];
  }
  const rev = s < 0;
  const p2 = rev ? poly.slice().reverse() : poly;
  const pts = rev ? loop.slice().reverse() : loop;
  const tris = smoothDiagonals(p2, pts, delaunay(p2, earClip(p2)));
  for (const [a, b, c] of tris) {
    const A = pts[a], B = pts[b], C = pts[c];
    const nrm = cross(sub(B, A), sub(C, A));
    if (dot(nrm, out) >= 0) w.tri3(A, B, C); else w.tri3(A, C, B);
  }
}

/* ── Der Pressrest: Beschnitt am Mantel ──────────────────────── */

const BISCUIT_SEG = 64;

/** Der Pressrest als Prisma mit BISCUIT_SEG Facetten — dieselben wie in
    biscuitMesh (über dieselbe Achsenabbildung von js/solids.js), damit
    der beschnittene Kanal genau auf ihnen endet. */
function prismOf(biscuit) {
  const key = biscuit.axis in AXES ? biscuit.axis : '+y';
  const axis = AXES[key];
  const R = Math.max(1, biscuit.d / 2), T = Math.max(0.5, biscuit.t);
  const C = biscuit.pos;
  const dirs = [];
  for (let i = 0; i < BISCUIT_SEG; i++) {
    const a = 2 * Math.PI * i / BISCUIT_SEG;
    const p = place(Float64Array.from([Math.cos(a), Math.sin(a), 0]), key.replace('+', ''), 0, 0, 0);
    dirs.push([p[0], p[1], p[2]]);
  }
  const verts = dirs.map(d => addScaled(C, d, R));
  const normals = dirs.map((d, i) => norm(add(d, dirs[(i + 1) % BISCUIT_SEG])));
  const apothem = R * Math.cos(Math.PI / BISCUIT_SEG);
  return {
    C, axis, R, T, verts, normals, apothem, seg: BISCUIT_SEG,
    Lf: dist(verts[0], verts[1]),
    /* Größter Abstand zu einer Facettenebene und die Facette dazu:
       ≤ 0 heißt seitlich drinnen, 0 heißt auf dem Mantel. */
    support(p) {
      let f = -Infinity, j = 0;
      for (let i = 0; i < BISCUIT_SEG; i++) {
        const d = dot(sub(p, C), normals[i]) - apothem;
        if (d > f) { f = d; j = i; }
      }
      return { f, j };
    },
    /* Austritt der Strecke a→b (a drinnen) durch den Mantel: die erste
       Facettenebene, die die Strecke kreuzt. */
    exit(a, b) {
      let t = Infinity;
      for (let i = 0; i < BISCUIT_SEG; i++) {
        const fa = dot(sub(a, C), normals[i]) - apothem, fb = dot(sub(b, C), normals[i]) - apothem;
        if (fa <= 0 && fb > 0) t = Math.min(t, fa / (fa - fb));
      }
      return Number.isFinite(t) ? addScaled(a, sub(b, a), t) : null;
    },
    height(p) { return dot(sub(p, C), axis); }
  };
}

/* Die Kante vom Pressrest am Mantel beschneiden: jede Längslinie des
   Schlauchs (ein Umrisspunkt über alle Schnitte) bis zu ihrem Austritt
   verfolgen. Liefert den Ring der Austrittspunkte und den Index des
   ersten Schnitts, der für ALLE Linien draußen liegt — oder null, wenn
   der Kanal nicht durch den Mantel austritt. */
function trimAtBiscuit(prism, sections, iEnd) {
  const rings = [];
  const ring = k => rings[k] || (rings[k] = ringPoints(sections[k]));
  const out = new Float64Array(POINTS * 3);
  let kmax = 0;
  for (let i = 0; i < POINTS; i++) {
    let prev = pt(ring(0), i);
    if (prism.support(prev).f > 0) return { reason: 'beginnt außerhalb' };
    let hit = null, k = 1;
    for (; k <= iEnd; k++) {
      const q = pt(ring(k), i);
      if (prism.support(q).f > 0) { hit = prism.exit(prev, q); break; }
      prev = q;
    }
    if (!hit) return { reason: 'tritt nicht aus' };
    /* Die Höhe des Austritts wird nicht geprüft: wölbt sich der Bogen
       ein wenig über die Trennebene oder reicht der Kanal tiefer als der
       Pressrest, liegt der Deckel eben auf dem verlängerten Mantel —
       immer noch ein geschlossener Körper, der den Zylinder berührt. */
    out[i * 3] = hit[0]; out[i * 3 + 1] = hit[1]; out[i * 3 + 2] = hit[2];
    kmax = Math.max(kmax, k);
  }
  /* Die erste Reihe reicht bis zum ÜBERNÄCHSTEN Schnitt: tritt eine
     Linie genau an einem Schnitt aus (die Mittellinie bei s = Radius,
     wenn der Schritt aufgeht), fiele ihr Austrittspunkt sonst mit dem
     Punkt des nächsten Schnitts zusammen — ein Dreieck ohne Fläche,
     dessen Kanten sich mit nichts paaren. */
  return kmax + 1 < iEnd ? { ring: out, k: kmax + 1 } : { reason: 'zu kurz' };
}

/* Der Deckel des beschnittenen Kanals: das Feld im Austrittsring, auf
   dem ABGEWICKELTEN Mantel (Umfangskoordinate s, Höhe y) facettenweise
   trianguliert, damit jedes Dreieck in einer Facettenebene liegt und
   der Deckel den Zylinder weder durchdringt noch von ihm abhebt. Die
   Nahtstelle der Abwicklung liegt dem Kanal gegenüber. */
function biscuitCap(prism, ring, w) {
  const { seg, Lf, verts, axis } = prism;
  const info = [];
  const mean = [0, 0, 0];
  for (let i = 0; i < POINTS; i++) {
    const p = pt(ring, i);
    info.push({ p, j: prism.support(p).j });
    mean[0] += p[0] / POINTS; mean[1] += p[1] / POINTS; mean[2] += p[2] / POINTS;
  }
  const shift = (seg / 2 - prism.support(mean).j + 2 * seg) % seg;
  /* Ein Punkt dicht an einer Facettengrenze wird in der Abwicklung auf
     sie gerastet: tritt der Kanal genau an einer Prismenecke aus (der
     übliche Fall — die Ecke bei 270° liegt in Laufrichtung), lägen
     sonst Teilpunkte um Bruchteile eines Mikrometers neben Ringpunkten,
     und die Splitter dazwischen fielen beim Verschweißen zusammen. Das
     Raster ändert nur die Zuordnung zur Facette, nicht den Raumpunkt. */
  const SNAP = 1e-3 * Lf;
  const snap = sx => { const k = Math.round(sx / Lf); return Math.abs(sx - k * Lf) < SNAP ? k * Lf : sx; };
  const unroll = (p, j) => {
    const V = verts[j];
    const e = scale(sub(verts[(j + 1) % seg], V), 1 / Lf);
    return [snap(((j + shift) % seg) * Lf + dot(sub(p, V), e)), prism.height(p)];
  };
  const back = (sx, y) => {
    const k = clamp(Math.floor(sx / Lf + 1e-9), 0, seg - 1);
    const j = (k - shift + 2 * seg) % seg;
    const V = verts[j];
    return add(addScaled(V, sub(verts[(j + 1) % seg], V), (sx - k * Lf) / Lf), scale(axis, y));
  };
  /* Polygon in der Abwicklung; die Ringpunkte behalten ihre Raumpunkte.
     Wo eine Ringkante eine Facettengrenze kreuzt, wird sie VORHER
     geteilt — die Teilpunkte gehen als `splits` an die erste Reihe des
     Schlauchs, die dieselben Punkte benutzen muss, sonst stünde dort ein
     T-Stoß und das Netz wäre offen. */
  const ringPoly = info.map(it => { const [sx, y] = unroll(it.p, it.j); return { sx, y, p: it.p }; });
  const poly = [];
  const splits = [];
  for (let i = 0; i < POINTS; i++) {
    const a = ringPoly[i], b = ringPoly[(i + 1) % POINTS];
    poly.push(a);
    const list = [];
    const lo = Math.min(a.sx, b.sx), hi = Math.max(a.sx, b.sx);
    for (let k = Math.floor(lo / Lf) + 1; k * Lf < hi; k++) {
      const bound = k * Lf;
      if (bound <= lo + SNAP || bound >= hi - SNAP) continue;
      const t = (bound - a.sx) / (b.sx - a.sx);
      const y = a.y + (b.y - a.y) * t;
      list.push({ sx: bound, y, p: back(bound, y), t });
    }
    list.sort((x, z) => x.t - z.t);
    for (const q of list) poly.push(q);
    splits.push(list.map(q => q.p));
  }
  if (Array.isArray(prism.capLog)) prism.capLog.push({ poly: poly.map(q => [q.sx, q.y]), splits: splits.map(l => l.length), Lf });
  let sMin = Infinity, sMax = -Infinity;
  for (const q of poly) { sMin = Math.min(sMin, q.sx); sMax = Math.max(sMax, q.sx); }
  /* Sutherland–Hodgman gegen sx ≥ lo und sx ≤ hi. Alle Kreuzungen sind
     schon Ecken, neue Punkte entstehen nicht mehr (Ecken genau auf der
     Grenze zählen für beide Seiten als drinnen). */
  const clip = (pts, lo, hi) => {
    let cur = pts;
    for (const [bound, keepBelow] of [[lo, false], [hi, true]]) {
      const next = [];
      for (let i = 0; i < cur.length; i++) {
        const a = cur[i], b = cur[(i + 1) % cur.length];
        const ina = keepBelow ? a.sx <= bound : a.sx >= bound;
        const inb = keepBelow ? b.sx <= bound : b.sx >= bound;
        if (ina) next.push(a);
        if (ina !== inb) {
          const t = (bound - a.sx) / (b.sx - a.sx);
          if (t > 1e-9 && t < 1 - 1e-9) {
            const y = a.y + (b.y - a.y) * t;
            next.push({ sx: bound, y, p: back(bound, y) });
          }
        }
      }
      cur = next;
      if (cur.length < 3) return [];
    }
    return cur;
  };
  for (let k = Math.max(0, Math.floor(sMin / Lf)); k <= Math.min(seg - 1, Math.floor(sMax / Lf)); k++) {
    const sub2 = clip(poly, k * Lf, (k + 1) * Lf);
    if (sub2.length < 3) continue;
    const j = (k - shift + 2 * seg) % seg;
    const n2 = prism.normals[j];
    let area2 = 0;
    for (let i = 0; i < sub2.length; i++) {
      const a = sub2[i], b = sub2[(i + 1) % sub2.length];
      area2 += a.sx * b.y - b.sx * a.y;
    }
    const ccw = area2 < 0 ? sub2.slice().reverse() : sub2;
    for (const [a, b, c] of earClip(ccw.map(q => [q.sx, q.y]))) {
      const A = ccw[a].p, B = ccw[b].p, Cc = ccw[c].p;
      /* Nach außen heißt hier: in den Pressrest hinein, gegen die Facette. */
      if (dot(cross(sub(B, A), sub(Cc, A)), n2) <= 0) w.tri3(A, B, Cc); else w.tri3(A, Cc, B);
    }
  }
  return splits;
}

/* Die erste Reihe des beschnittenen Schlauchs: vom Austrittsring (mit
   den Teilpunkten des Deckels auf seinen Kanten) zum ersten ganzen
   Schnitt. Je Viereck ein Fächer von der Ecke des nächsten Rings über
   die geteilte Ringkante — dieselbe Wicklung wie in shell(). */
function firstRow(ring, splits, next, w) {
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    w.tri(ring, i, next, i, next, j);
    let prev = pt(ring, i);
    const nj = pt(next, j);
    for (const x of splits[i]) { w.tri3(prev, nj, x); prev = x; }
    w.tri3(prev, nj, pt(ring, j));
  }
}

/* ── Zwischenschnitte und Kurven ─────────────────────────────── */

const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/* Querschnitt zwischen zwei Schnitten: die Fläche wird linear geführt,
   das Seitenverhältnis daneben (wie in js/runner/curve.js); an den
   Enden die Schnitte selbst, damit die Ringe exakt getroffen werden. */
function lerpSec(net, sa, sb, t) {
  if (t <= 0) return sa;
  if (t >= 1) return sb;
  const draft = Number.isFinite(net.draft) ? net.draft : Math.atan(sa.tanA) * 180 / Math.PI;
  const radius = Number.isFinite(net.radius) ? net.radius : Math.max(sa.r, sb.r);
  const A0 = area(sa), A1 = area(sb);
  const q0 = sa.depth / sa.width, q1 = sb.depth / sb.width;
  const d = dimsForArea(A0 + (A1 - A0) * t, q0 + (q1 - q0) * t, draft, radius);
  return section(d.w, d.h, draft, radius);
}

/* Normale zwischen zwei Schnitten, senkrecht zur Laufrichtung gestellt. */
function frameN(na, nb, t, tan) {
  let n = lerp(na, nb, t);
  if (len(n) < 1e-6) n = na;
  const perp = addScaled(n, tan, -dot(n, tan));
  return len(perp) > 1e-6 ? norm(perp) : norm(addScaled(na, tan, -dot(na, tan)));
}

/* Kubischer Hermite-Bogen zwischen zwei Punkten mit Tangenten (Beträge
   schon gesetzt). */
function hermite(P0, m0, P1, m1) {
  const mix = (a, b, c, d) => [
    a * P0[0] + b * m0[0] + c * P1[0] + d * m1[0],
    a * P0[1] + b * m0[1] + c * P1[1] + d * m1[1],
    a * P0[2] + b * m0[2] + c * P1[2] + d * m1[2]
  ];
  return {
    at: t => { const t2 = t * t, t3 = t2 * t; return mix(2 * t3 - 3 * t2 + 1, t3 - 2 * t2 + t, -2 * t3 + 3 * t2, t3 - t2); },
    d1: t => { const t2 = t * t; return mix(6 * t2 - 6 * t, 3 * t2 - 4 * t + 1, -6 * t2 + 6 * t, 3 * t2 - 2 * t); }
  };
}

/* m + 1 Proben einer Kurve in gleichen Schritten der BOGENLÄNGE. */
function arcSamples(cur, m) {
  const M = 64;
  const arc = new Float64Array(M + 1);
  let prev = cur.at(0);
  for (let i = 1; i <= M; i++) { const p = cur.at(i / M); arc[i] = arc[i - 1] + dist(p, prev); prev = p; }
  const L = arc[M];
  const paramAt = s => {
    if (s <= 0) return 0;
    if (s >= L) return 1;
    let lo = 0, hi = M;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (arc[mid] <= s) lo = mid; else hi = mid; }
    return (lo + (s - arc[lo]) / Math.max(arc[hi] - arc[lo], 1e-12)) / M;
  };
  const out = [];
  for (let i = 0; i <= m; i++) {
    const t = paramAt(L * i / m);
    const d = cur.d1(t);
    out.push({ p: cur.at(t), t: len(d) > 1e-9 ? norm(d) : null });
  }
  return { samples: out, length: L };
}

/* ── Die Gabelung ────────────────────────────────────────────── */

/** Außenstreifen: die Profilhälfte `idx` vom Ring a (Zulauf) zum Ring b
    (Abgang) über einen Hermite-Bogen mit den Tangenten beider Ringe. */
function outerStrip(net, a, b, idx, step) {
  const k = Math.max(dist(a.p, b.p), 1e-6);
  const cur = hermite(a.p, scale(a.t, k), b.p, scale(b.t, k));
  const m = Math.max(3, Math.round(dist(a.p, b.p) / step));
  const { samples } = arcSamples(cur, m);
  return samples.map((s, i) => {
    if (i === 0) return halfPoints(a.p, a.u, a.v, a.sec, idx);
    if (i === m) return halfPoints(b.p, b.u, b.v, b.sec, idx);
    const tau = i / m;
    const tan = s.t || norm(sub(b.p, a.p));
    const n = frameN(a.n, b.n, tau, tan);
    return halfPoints(s.p, norm(cross(n, tan)), scale(n, -1), lerpSec(net, a.sec, b.sec, tau), idx);
  });
}

/* Die Zwickelkante zwischen dem rechten Abgang a und dem linken Abgang b,
   in der Ebene des Zulaufs: von der Innenwand des einen zur Innenwand des
   anderen — Gerade, Kreisbogen, Gerade. Liefert eine Bahn nach
   Bogenlänge mit Punkt und der nach außen (in den Stahl des Zwickels)
   gerichteten Normale, oder null, wenn die Wände sich nicht vor den
   Ringen schneiden: zwei Abgänge, die sich noch an ihren Ringen
   durchdringen, haben keinen Zwickel, den man verrunden könnte. */
function filletPath(pa, da, pb, db, rho) {
  const det = da[0] * db[1] - da[1] * db[0];
  const theta = Math.acos(clamp(da[0] * db[0] + da[1] * db[1], -1, 1));
  if (Math.abs(det) < 1e-6 || theta < 0.03 || theta > Math.PI - 0.03) return null;
  const dx = pb[0] - pa[0], dz = pb[1] - pa[1];
  const lam = (dx * db[1] - dz * db[0]) / det;              // Wand a: pa + lam·da
  const mu = (dx * da[1] - dz * da[0]) / det;               // Wand b: pb + mu·db
  if (lam >= -1e-9 || mu >= -1e-9) return null;             // Schnittpunkt liegt nicht stromaufwärts
  const X = [pa[0] + lam * da[0], pa[1] + lam * da[1]];
  const tanHalf = Math.tan(theta / 2);
  /* Der Radius darf die Tangentenpunkte nicht über die Ringe hinausschieben. */
  const r = Math.min(rho, 0.85 * Math.min(-lam, -mu) * tanHalf);
  if (!(r > 0.05)) return null;
  const bl = Math.hypot(da[0] + db[0], da[1] + db[1]);
  const bis = [(da[0] + db[0]) / bl, (da[1] + db[1]) / bl];
  const C = [X[0] + bis[0] * r / Math.sin(theta / 2), X[1] + bis[1] * r / Math.sin(theta / 2)];
  const tp = r / tanHalf;
  const Ta = [X[0] + da[0] * tp, X[1] + da[1] * tp], Tb = [X[0] + db[0] * tp, X[1] + db[1] * tp];
  const la = Math.hypot(Ta[0] - pa[0], Ta[1] - pa[1]);
  const lb = Math.hypot(pb[0] - Tb[0], pb[1] - Tb[1]);
  const larc = r * (Math.PI - theta);
  const ra = [Ta[0] - C[0], Ta[1] - C[1]], rb = [Tb[0] - C[0], Tb[1] - C[1]];
  const ang0 = Math.atan2(ra[1], ra[0]);
  /* Der kürzere der beiden Bögen (π − θ) ist der um die Nase. */
  const sweep = Math.atan2(ra[0] * rb[1] - ra[1] * rb[0], ra[0] * rb[0] + ra[1] * rb[1]);
  const fa = [(C[0] - Ta[0]) / r, (C[1] - Ta[1]) / r], fb = [(C[0] - Tb[0]) / r, (C[1] - Tb[1]) / r];
  return {
    length: la + larc + lb, r,
    at(s) {
      if (s <= la) {
        const q = la > 1e-12 ? s / la : 1;
        return { w: [pa[0] + (Ta[0] - pa[0]) * q, pa[1] + (Ta[1] - pa[1]) * q], f: fa };
      }
      if (s <= la + larc) {
        const phi = ang0 + sweep * ((s - la) / larc);
        const c = Math.cos(phi), sn = Math.sin(phi);
        return { w: [C[0] + r * c, C[1] + r * sn], f: [-c, -sn] };
      }
      const q = lb > 1e-12 ? (s - la - larc) / lb : 1;
      return { w: [Tb[0] + (pb[0] - Tb[0]) * q, Tb[1] + (pb[1] - Tb[1]) * q], f: fb };
    }
  };
}

/** Der Zwickel zwischen zwei benachbarten Abgängen: die linke Hälfte des
    rechten Abgangs a geht in die rechte Hälfte des linken Abgangs b
    über. Das Profil (Flanke und Verrundung) wird an die Zwickelkante
    gehängt und dreht mit ihr: an der Wand von a zeigt es nach −u_a, um
    die Nase herum stromabwärts, an der Wand von b nach +u_b. `frame` ist
    der Zulaufring — seine Ebene ist die der Konstruktion. */
function crotch(net, N, a, b, frame, rho, step) {
  const Pa = addScaled(a.p, a.u, -a.sec.halfTop);            // obere linke Ecke von a
  const Pb = addScaled(b.p, b.u, b.sec.halfTop);             // obere rechte Ecke von b
  const e1 = frame.u, e2 = frame.t, n0 = frame.n;
  const to2 = P => [dot(sub(P, N), e1), dot(sub(P, N), e2)];
  const dir2 = d => { const x = dot(d, e1), z = dot(d, e2), l = Math.hypot(x, z); return l > 0.2 ? [x / l, z / l] : null; };
  const da = dir2(a.t), db = dir2(b.t);
  const path = da && db ? filletPath(to2(Pa), da, to2(Pb), db, rho) : null;
  const ha = dot(sub(Pa, N), n0), hb = dot(sub(Pb, N), n0);

  let samples;                                                // [{ W, f }]
  if (path) {
    const m = Math.max(6, Math.round(path.length / step));
    samples = [];
    for (let i = 0; i <= m; i++) {
      const tau = i / m;
      const { w, f } = path.at(path.length * tau);
      samples.push({
        W: add(add(N, addScaled(scale(e1, w[0]), e2, w[1])), scale(n0, ha + (hb - ha) * tau)),
        f: norm(addScaled(scale(e1, f[0]), e2, f[1]))
      });
    }
  } else {
    /* Kein Zwickel zu verrunden: ein Hermite-Bogen, der beide Innenwände
       stetig verbindet; die Normale dreht über die Mitte stromabwärts. */
    const k = Math.max(0.6 * dist(Pa, Pb), 1e-6);
    const cur = hermite(Pa, scale(a.t, -k), Pb, scale(b.t, k));
    const m = Math.max(6, Math.round(dist(Pa, Pb) * 1.2 / step));
    let mid = norm(add(a.t, b.t));
    if (!len(mid)) mid = frame.t;
    samples = arcSamples(cur, m).samples.map((s, i) => {
      const tau = i / m, q = 1 - tau;
      const f = norm(add(addScaled(scale(a.u, -q * q), mid, 2 * q * tau), scale(b.u, tau * tau)));
      return { W: s.p, f: len(f) ? f : mid };
    });
  }

  const last = samples.length - 1;
  return samples.map((s, i) => {
    if (i === 0) return halfPoints(a.p, a.u, a.v, a.sec, LEFT_HALF);
    if (i === last) return halfPoints(b.p, b.u, b.v, b.sec, RIGHT_HALF);
    const tau = i / last;
    const sec = lerpSec(net, a.sec, b.sec, tau);
    const n = frameN(a.n, b.n, tau, s.f);
    return halfPoints(addScaled(s.W, s.f, -sec.halfTop), s.f, scale(n, -1), sec, RIGHT_HALF);
  });
}

/* Wo ein Schlauch für eine Gabelung aufhört bzw. anfängt: der letzte
   Schnitt vor bzw. der erste nach der Trimmlänge; ein Stück Schlauch
   bleibt immer stehen. */
const lastBelow = (secs, s) => { let i = secs.length - 1; while (i > 1 && secs[i].s > s) i--; return i; };
const firstAbove = (secs, s) => { let i = 0; while (i < secs.length - 2 && secs[i].s < s) i++; return i; };

/* Alle Gabelungen mit ihren Trimmstellen. Der Zulauf wird um rund drei
   Viertel der Kanalbreite gekürzt, jeder Abgang so weit, dass der
   Zwickel samt Verrundung vor seinem Ring Platz hat: die Innenwände
   zweier Abgänge, die sich unter dem Winkel θ öffnen, schneiden sich
   etwa (halbe Breite)/tan(θ/2) hinter dem Knoten, der Bogen braucht
   noch r/tan(θ/2) — je flacher die Gabel, desto länger die Hose. Nie
   mehr als knapp die halbe Kante; ist die zu kurz, wird der Radius
   kleiner (filletPath) oder der Zwickel ein Hermite-Bogen.

   DURCHDRINGENDE ABGÄNGE. Liegen zwei Abgänge so eng oder sind ihre
   Kanten so kurz, dass ihre Ringe sich noch überschneiden (die linke
   obere Ecke des rechten liegt links von der rechten oberen Ecke des
   linken), gibt es keinen Zwickel, den man bauen könnte — die Kanäle
   sind dort wirklich EIN überlappender Körper, und der ließe sich nur
   boolesch vereinigen. Solche Gabelungen bleiben, was sie waren:
   Schläuche mit Deckeln, die sich durchdringen. Die Prüfregeln sagen
   es (js/runner/rules.js über junctionPlan). */
function planJunctions(net) {
  const byTo = new Map(), byFrom = new Map();
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    byTo.set(e.toId, e);
    if (!byFrom.has(e.fromId)) byFrom.set(e.fromId, []);
    byFrom.get(e.fromId).push(e);
  }
  const cut = new Map();
  const at = e => { if (!cut.has(e)) cut.set(e, { a: 0, b: e.sections.length - 1 }); return cut.get(e); };
  const junctions = [];
  const rho = Number.isFinite(net.branchR) ? Math.max(0, net.branchR) : 4;
  for (const [id, kids] of byFrom) {
    if (kids.length < 2) continue;
    const inlet = byTo.get(id);
    if (!inlet) continue;                                     // Pressrest mit mehreren Abgängen
    const R = inlet.sections[inlet.sections.length - 1];
    const w0 = R.sec.width;
    /* Von rechts nach links, nach dem Winkel des Abgangs in der Zulaufebene. */
    const sorted = kids.map(e => {
      const t = e.sections[0].t;
      return { e, ang: Math.atan2(dot(t, R.u), dot(t, R.t)), t, half: e.sections[0].sec.halfTop };
    }).sort((x, y) => y.ang - x.ang);
    const need = sorted.map(() => 0.6 * w0);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const th = Math.acos(clamp(dot(sorted[i].t, sorted[i + 1].t), -1, 1));
      const l = (sorted[i].half + sorted[i + 1].half) / 2 + rho;
      const d = th > 0.03 ? l / Math.tan(th / 2) + 0.3 * w0 : Infinity;
      need[i] = Math.max(need[i], d);
      need[i + 1] = Math.max(need[i + 1], d);
    }
    const bIn = lastBelow(inlet.sections, inlet.length - Math.min(0.75 * w0, 0.45 * inlet.length));
    const parts = sorted.map((k, i) => {
      const a = firstAbove(k.e.sections, Math.min(need[i], 0.45 * k.e.length));
      return { edge: k.e, a, ring: k.e.sections[a] };
    });
    /* Benachbarte Abgänge müssen an ihren Ringen getrennt sein. */
    let clear = true;
    for (let i = 0; i + 1 < parts.length && clear; i++) {
      const ra = parts[i].ring, rb = parts[i + 1].ring;
      const Pa = addScaled(ra.p, ra.u, -ra.sec.halfTop), Pb = addScaled(rb.p, rb.u, rb.sec.halfTop);
      if (dot(sub(Pa, Pb), R.u) <= 0.02 * w0) clear = false;
    }
    junctions.push({ node: inlet.to, inlet, bIn, ring: inlet.sections[bIn], kids: parts, rho, degenerate: !clear });
  }
  /* EINE KURZE KANTE ZWISCHEN ZWEI GABELUNGEN. Die obere Gabelung nimmt
     sich bis zu 45 % der Kante für ihr Hosenstück, die untere ebenso vom
     anderen Ende her. Liegt zwischen beiden Marken kein Schnitt (der
     Abtastschritt ist größer als die Lücke, bei 16 bis 30 mm langen
     Kanten ab 2 mm), begann das Stück der oberen HINTER dem Ring, an dem
     das der unteren schon anfing: der Schlauch dazwischen hatte keine
     Länge und fiel weg, und zwischen den beiden Ringen stand ein Loch
     (104 offene Kanten, keine Prüfregel sagte etwas). Dann teilen sich
     beide Stücke EINEN Ring — den der oberen: ihr Zwickel ist an ihm
     geprüft; das Hosenstück der unteren wird dafür um einen Schritt kürzer. */
  const upper = new Map();
  for (const jn of junctions) if (!jn.degenerate) for (const k of jn.kids) upper.set(k.edge, k);
  for (const jn of junctions) {
    const up = upper.get(jn.inlet);
    if (!jn.degenerate && up && up.a > jn.bIn) { jn.bIn = up.a; jn.ring = up.ring; }
  }
  for (const jn of junctions) {
    if (jn.degenerate) continue;
    const inl = at(jn.inlet);
    inl.b = Math.min(inl.b, jn.bIn);
    for (const k of jn.kids) at(k.edge).a = Math.max(at(k.edge).a, k.a);
  }
  return { cut, junctions };
}

/** Die Gabelungen des Netzes, wie der Sweep sie sieht — für die
    Prüfregeln: { id, kids: [ids], degenerate } je Verzweigung mit Zulauf;
    `degenerate` heißt: die Abgänge durchdringen sich noch an ihren
    Ringen, dort bleiben die Schläuche übereinander. */
export function junctionPlan(net) {
  return planJunctions(net).junctions.map(j => ({
    id: j.node.id, kids: j.kids.map(k => k.edge.toId), degenerate: j.degenerate
  }));
}

/* Die Flächenstücke einer Gabelung bauen: Streifen und die beiden
   Randzüge von Deckfläche und Boden. Geschrieben wird später. */
function buildJunction(net, jn, step) {
  const R0 = jn.ring, rings = jn.kids.map(k => k.ring);
  const right = outerStrip(net, R0, rings[0], RIGHT_HALF, step);
  const left = outerStrip(net, R0, rings[rings.length - 1], LEFT_HALF, step);
  const crotches = [];
  for (let i = 0; i + 1 < rings.length; i++) crotches.push(crotch(net, jn.node.pos, rings[i], rings[i + 1], R0, jn.rho, step));

  const r0 = ringPoints(R0);
  const rp = rings.map(r => ringPoints(r));
  /* Deckfläche: rechte obere Ecke des Zulaufs, rechter Streifen, dann je
     Abgang seine obere Kante von rechts nach links und der Zwickel zum
     nächsten, zurück über den linken Streifen und die obere Kante des
     Zulaufs. Boden: dasselbe entlang der Flankenfüße. */
  const topBack = TOP_EDGE.slice(0, -1).reverse();           // Abgang: rechts → links, ohne die rechte Ecke
  const top = [pt(r0, TOP_EDGE[TOP_EDGE.length - 1])];
  for (let i = 1; i < right.length; i++) top.push(pt(right[i], 0));
  for (let i = 0; i < rings.length; i++) {
    for (const k of topBack) top.push(pt(rp[i], k));
    if (i < crotches.length) for (let j = 1; j < crotches[i].length; j++) top.push(pt(crotches[i][j], 0));
  }
  for (let i = left.length - 2; i >= 0; i--) top.push(pt(left[i], 0));
  for (const k of TOP_EDGE.slice(1, -1)) top.push(pt(r0, k));

  const foot = HALF - 1;
  const floor = [pt(r0, BOTTOM_EDGE[0])];
  for (let i = 1; i < right.length; i++) floor.push(pt(right[i], foot));
  for (let i = 0; i < rings.length; i++) {
    for (const k of BOTTOM_EDGE.slice(1)) floor.push(pt(rp[i], k));
    if (i < crotches.length) for (let j = 1; j < crotches[i].length; j++) floor.push(pt(crotches[i][j], foot));
  }
  for (let i = left.length - 2; i >= 0; i--) floor.push(pt(left[i], foot));
  for (const k of BOTTOM_EDGE.slice(1, -1).reverse()) floor.push(pt(r0, k));

  return { right, left, crotches, top, floor, frame: R0 };
}

/** Alle Kanäle als ein Körper (ohne Pressrest). */
export function sweepRunner(net) {
  const step = Math.max(0.2, net.step || 1);
  const { cut, junctions } = planJunctions(net);
  const built = junctions.filter(jn => !jn.degenerate).map(jn => buildJunction(net, jn, step));
  /* An einer entarteten Gabelung enden die Schläuche wie früher in Deckeln. */
  const capped = new Set(junctions.filter(jn => jn.degenerate).map(jn => jn.node.id));

  let estimate = 0;
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    const c = cut.get(e) || { a: 0, b: e.sections.length - 1 };
    estimate += Math.max(0, c.b - c.a) * POINTS * 2 + 8 * POINTS;
  }
  for (const b of built) {
    for (const s of [b.right, b.left, ...b.crotches]) estimate += (s.length - 1) * (HALF - 1) * 2;
    estimate += b.top.length + b.floor.length;
  }
  const w = writer(estimate);

  const prism = net.biscuit ? prismOf(net.biscuit) : null;
  if (prism && Array.isArray(net.capLog)) prism.capLog = net.capLog;
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    const c = cut.get(e) || { a: 0, b: e.sections.length - 1 };
    if (c.b <= c.a) continue;
    const fromRoot = e.from.type === 'root' || !e.from.parent;
    /* Vom Pressrest: am Mantel beschnitten, der Deckel liegt auf ihm. */
    const trim = fromRoot && prism && c.a === 0 ? trimAtBiscuit(prism, e.sections, c.b) : null;
    if (Array.isArray(net.trimLog)) net.trimLog.push({ edge: e.toId, k: trim && trim.ring ? trim.k : null, reason: trim && trim.reason });
    if (trim && trim.ring) {
      const splits = biscuitCap(prism, trim.ring, w);
      firstRow(trim.ring, splits, ringPoints(e.sections[trim.k]), w);
      shell(e.sections, trim.k, c.b, w);
    } else {
      shell(e.sections, c.a, c.b, w);
      /* Ebener Deckel nur am Pressrest ohne Beschnitt; ein Punkt mit
         einem Abgang teilt seinen Ring mit der nächsten Kante, eine
         Gabelung bekommt ihr Hosenstück. */
      if (fromRoot || capped.has(e.fromId)) cap(e.sections, c.a, false, w);
    }
    if (!e.to.children.length || capped.has(e.toId)) cap(e.sections, c.b, true, w);
  }
  /* Für Tests und die Fehlersuche: die Randzüge der Felder. */
  if (Array.isArray(net.junctionLoops)) net.junctionLoops.push(...built.map(b => ({ top: b.top, floor: b.floor })));
  for (const b of built) {
    strip(b.right, false, w);
    strip(b.left, true, w);
    for (const cr of b.crotches) strip(cr, false, w);
    fillLoop(b.top, b.frame.u, b.frame.t, b.frame.n, w);
    fillLoop(b.floor, b.frame.u, b.frame.t, scale(b.frame.n, -1), w);
  }
  return w.done();
}

/** Der Pressrest: Zylinder, dessen Dicke ENTGEGEN der Ausstoßrichtung
    wächst — er sitzt in derselben Formhälfte wie die Kanaltiefe. */
export function biscuitMesh(biscuit, seg = 64) {
  const r = Math.max(1, biscuit.d / 2);
  const t = Math.max(0.5, biscuit.t);
  const local = cyl(r, -t, 0, seg);
  /* js/solids.js kennt die Achsen ohne Pluszeichen ('y', nicht '+y'). */
  const axis = (biscuit.axis in AXES ? biscuit.axis : '+y').replace('+', '');
  const placed = place(local, axis, 0, 0, 0);
  return translate(placed, biscuit.pos[0], biscuit.pos[1], biscuit.pos[2]);
}

/** Mittellinien als Polygonzüge — für die dünne Linie im Viewport. */
export function centerlines(net) {
  return net.edges.map(e => {
    const pts = new Float32Array(e.sections.length * 3);
    e.sections.forEach((s, i) => { pts[i * 3] = s.p[0]; pts[i * 3 + 1] = s.p[1]; pts[i * 3 + 2] = s.p[2]; });
    return pts;
  });
}

export { POINTS };
