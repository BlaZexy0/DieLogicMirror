/* Das Netz: den Querschnitt entlang der abgetasteten Mittellinie ziehen.

   Je Kante entsteht EIN geschlossener Körper — Mantel aus Vierecken
   zwischen zwei benachbarten Schnitten, dazu Deckel an beiden Enden. An
   Verzweigungen durchdringen sich die Körper; die Vereinigung entsteht
   nicht durch Rechnen, sondern durch Überlappung.

   AN DEN VERZWEIGUNGEN SIND DIE DECKEL GERUNDET. Ein flacher Deckel
   endet dort mit einer scharfen Kante, und weil der Zulaufkanal genau in
   der Gabelung endet, klafft zwischen den beiden Abgängen ein Keil —
   die Stelle, an der eine Schmelze abreißt und ein Fräser nie hinkommt.
   Der gerundete Deckel füllt genau diesen Keil: der Umriss des Profils
   wird über einen Viertelkreis auf null zusammengezogen und dabei in
   Laufrichtung vorgeschoben. Er hat damit die Form des Querschnitts,
   nicht die einer Kugel — ein flacher breiter Kanal bekommt eine flache
   breite Kuppe.

   Gerundet wird NUR an Gabelungen. Am Anschnitt bleibt der Deckel eben:
   das ist die Austrittsfläche ins Bauteil. Am Pressrest ebenfalls, dort
   steckt der Deckel ohnehin im Zylinder.

   Ausgabe wie überall im Studio: Dreieckssuppe, 9 Werte je Dreieck. */

import { outline, POINTS } from './profile.js';
import { cyl, place, translate } from '../solids.js';
import { AXES } from './graph.js';

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

const tri = (out, a, ai, b, bi, c, ci) => {
  out.push(a[ai * 3], a[ai * 3 + 1], a[ai * 3 + 2],
    b[bi * 3], b[bi * 3 + 1], b[bi * 3 + 2],
    c[ci * 3], c[ci * 3 + 1], c[ci * 3 + 2]);
};

/* Farben laufen in derselben Reihenfolge mit wie die Punkte — je Dreieck
   drei Farben. Sie ZUSAMMEN mit den Punkten zu schreiben ist der einzige
   Weg, der nicht auseinanderlaufen kann; zwei getrennte Durchläufe wären
   ein Fehler, der beim ersten geänderten Dreieck unsichtbar zuschlägt. */
const col3 = (out, a, b, c) => {
  if (!out) return;
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
};

/* Der Umriss läuft im Profil gegen den Uhrzeigersinn; mit v = −n zeigt
   seine Flächennormale entgegen der Laufrichtung. Damit die Mantelnormalen
   nach AUSSEN zeigen, muss das Viereck andersherum umlaufen als der Ring —
   die Deckel entsprechend (Anfang mit dem Ring, Ende dagegen). */
function shell(sections, out, cols, colorFn, edge) {
  let a = ringPoints(sections[0]);
  let ca = colorFn ? colorFn(edge, 0) : null;
  for (let k = 1; k < sections.length; k++) {
    const b = ringPoints(sections[k]);
    const cb = colorFn ? colorFn(edge, k) : null;
    for (let i = 0; i < POINTS; i++) {
      const j = (i + 1) % POINTS;
      tri(out, a, i, b, i, b, j);
      col3(cols, ca, cb, cb);
      tri(out, a, i, b, j, a, j);
      col3(cols, ca, cb, ca);
    }
    a = b; ca = cb;
  }
}

const centroid = r => {
  const c = [0, 0, 0];
  for (let i = 0; i < POINTS; i++) { c[0] += r[i * 3]; c[1] += r[i * 3 + 1]; c[2] += r[i * 3 + 2]; }
  return Float64Array.from([c[0] / POINTS, c[1] / POINTS, c[2] / POINTS]);
};

/** Ebener Deckel: Fächer vom Schwerpunkt auf den Umriss. */
function cap(sections, index, atEnd, out, cols, color) {
  const r = ringPoints(sections[index]);
  const cc = centroid(r);
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    if (atEnd) tri(out, cc, 0, r, j, r, i);
    else tri(out, cc, 0, r, i, r, j);
    col3(cols, color, color, color);
  }
}

/* Ringe der Kuppe. Mehr als vier sieht man nicht, weniger knickt. */
const DOME_RINGS = 4;

/** Gerundeter Deckel: der Umriss schrumpft über einen Viertelkreis auf
    einen Punkt und wandert dabei in Laufrichtung vor. Die Höhe ist das
    kleinere der beiden Profilmaße — so bleibt die Kuppe im Verhältnis
    zum Kanal und wächst einem flachen Kanal nicht davon. */
function domeCap(sections, index, atEnd, out, cols, color) {
  const sec = sections[index];
  const base = ringPoints(sec);
  const c = centroid(base);
  const dir = atEnd ? 1 : -1;
  const h = Math.min(sec.sec.halfTop, sec.sec.depth);
  const ring = k => {
    const a = Math.PI / 2 * k / DOME_RINGS;
    const s = Math.cos(a), d = h * Math.sin(a) * dir;
    const out2 = new Float64Array(POINTS * 3);
    for (let i = 0; i < POINTS; i++) {
      for (let x = 0; x < 3; x++) {
        out2[i * 3 + x] = c[x] + (base[i * 3 + x] - c[x]) * s + sec.t[x] * d;
      }
    }
    return out2;
  };

  let a = base;
  for (let k = 1; k < DOME_RINGS; k++) {
    const b = ring(k);
    for (let i = 0; i < POINTS; i++) {
      const j = (i + 1) % POINTS;
      if (atEnd) { tri(out, a, i, b, i, b, j); tri(out, a, i, b, j, a, j); }
      else { tri(out, a, i, b, j, b, i); tri(out, a, i, a, j, b, j); }
      col3(cols, color, color, color);
      col3(cols, color, color, color);
    }
    a = b;
  }
  const apex = Float64Array.from([c[0] + sec.t[0] * h * dir, c[1] + sec.t[1] * h * dir,
    c[2] + sec.t[2] * h * dir]);
  /* Der Fächer zur Spitze muss GEGEN den letzten Ring umlaufen, sonst
     zeigt die gemeinsame Kante in beiden Dreiecken in dieselbe Richtung
     und das Netz ist dort offen. */
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    if (atEnd) tri(out, apex, 0, a, j, a, i);
    else tri(out, apex, 0, a, i, a, j);
    col3(cols, color, color, color);
  }
}

/**
 * Alle Kanäle als Dreieckssuppe (ohne Pressrest).
 * `colorFn(kante, schnittIndex)` liefert wahlweise eine Farbe je Schnitt
 * als [r, g, b] in 0…1; ohne sie bleibt `colors` null.
 */
/* Eine Gabelung ist ein Knoten mit mehr als einem Abgang. */
const isJunction = n => n.children.length > 1;

export function sweepRunner(net, colorFn = null) {
  const out = [];
  const cols = colorFn ? [] : null;
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    const last = e.sections.length - 1;
    shell(e.sections, out, cols, colorFn, e);
    const c0 = colorFn ? colorFn(e, 0) : null;
    const c1 = colorFn ? colorFn(e, last) : null;
    (isJunction(e.from) ? domeCap : cap)(e.sections, 0, false, out, cols, c0);
    (isJunction(e.to) ? domeCap : cap)(e.sections, last, true, out, cols, c1);
  }
  return { tris: Float64Array.from(out), colors: cols ? Float32Array.from(cols) : null };
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
