/* Das Netz: den Querschnitt entlang der abgetasteten Mittellinie ziehen.

   Je Kante entsteht EIN geschlossener Körper — Mantel aus Vierecken
   zwischen zwei benachbarten Schnitten, dazu Deckel an beiden Enden.
   An Verzweigungen stoßen die Körper stumpf aufeinander und
   durchdringen sich; das ist für die Anzeige richtig und schnell, aber
   es ist noch KEIN dichter Körper. Den macht erst die Verschmelzung
   (js/runner/sdf.js), und nur die kommt in die STL.

   Warum überhaupt zwei Wege: der Sweep zeigt den Querschnitt exakt so,
   wie er eingegeben wurde — jede Kante, jeder Radius sitzt auf den
   Zehntelmillimeter. Er ist in Millisekunden fertig und hängt am Regler
   ohne Verzögerung. Die Verschmelzung rundet über ein Raster, kostet
   entsprechend, liefert dafür einen dichten Körper mit den weichen
   Übergängen an den Verzweigungen, die eine Schmelze auch bekommt.

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

function cap(sections, index, atEnd, out, cols, color) {
  const r = ringPoints(sections[index]);
  const c = [0, 0, 0];
  for (let i = 0; i < POINTS; i++) { c[0] += r[i * 3]; c[1] += r[i * 3 + 1]; c[2] += r[i * 3 + 2]; }
  c[0] /= POINTS; c[1] /= POINTS; c[2] /= POINTS;
  const cc = Float64Array.from(c);
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    if (atEnd) tri(out, cc, 0, r, j, r, i);
    else tri(out, cc, 0, r, i, r, j);
    col3(cols, color, color, color);
  }
}

/**
 * Alle Kanäle als Dreieckssuppe (ohne Pressrest).
 * `colorFn(kante, schnittIndex)` liefert wahlweise eine Farbe je Schnitt
 * als [r, g, b] in 0…1; ohne sie bleibt `colors` null.
 */
export function sweepRunner(net, colorFn = null) {
  const out = [];
  const cols = colorFn ? [] : null;
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    const last = e.sections.length - 1;
    shell(e.sections, out, cols, colorFn, e);
    cap(e.sections, 0, false, out, cols, colorFn ? colorFn(e, 0) : null);
    cap(e.sections, last, true, out, cols, colorFn ? colorFn(e, last) : null);
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
