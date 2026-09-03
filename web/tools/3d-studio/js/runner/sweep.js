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

/* Eine Gabelung ist ein Knoten mit mehr als einem Abgang. */
const isJunction = n => n.children.length > 1;

/* Ringe der Kuppe, also Schritte über den Viertelkreis. Die Zahl richtet
   sich am Umriss aus, damit die Kuppe nicht die schwächste Stelle des
   Netzes ist: dessen Bodenverrundung wird mit fünf Sehnen über etwa 85°
   angenähert, das sind rund 0,017 mm Sehnenfehler. Sechzehn Ringe (5,6°)
   treffen denselben Wert. Vier waren es anfangs — 22,5° je Schritt und
   0,26 mm Fehler auf einer 13,7 mm hohen Kuppe, deren Umriss damit aus
   vier geraden Stücken bestand und genau so aussah. */
const DOME_RINGS = 16;

/* Geschrieben wird in ein VORAB BEMESSENES Feld, nicht in ein wachsendes
   Array. Die Zahl der Dreiecke steht vorher fest (triCount), und der
   Sweep läuft bei jedem Mausschritt eines Zuges neu — ein Array, das
   340.000 Mal wächst und am Ende noch einmal kopiert wird, ist dort die
   Hälfte der Rechenzeit. */
const tri = (w, a, ai, b, bi, c, ci) => {
  const t = w.a;
  let o = w.k;
  t[o] = a[ai * 3]; t[o + 1] = a[ai * 3 + 1]; t[o + 2] = a[ai * 3 + 2];
  t[o + 3] = b[bi * 3]; t[o + 4] = b[bi * 3 + 1]; t[o + 5] = b[bi * 3 + 2];
  t[o + 6] = c[ci * 3]; t[o + 7] = c[ci * 3 + 1]; t[o + 8] = c[ci * 3 + 2];
  w.k = o + 9;
};

/* Deckel: eben POINTS Dreiecke, gerundet (DOME_RINGS−1) Ringe plus Fächer. */
const capTris = round => (round ? (DOME_RINGS - 1) * POINTS * 2 + POINTS : POINTS);

function triCount(net) {
  let n = 0;
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    n += (e.sections.length - 1) * POINTS * 2
      + capTris(isJunction(e.from)) + capTris(isJunction(e.to));
  }
  return n;
}

/* Der Umriss läuft im Profil gegen den Uhrzeigersinn; mit v = −n zeigt
   seine Flächennormale entgegen der Laufrichtung. Damit die Mantelnormalen
   nach AUSSEN zeigen, muss das Viereck andersherum umlaufen als der Ring —
   die Deckel entsprechend (Anfang mit dem Ring, Ende dagegen). */
function shell(sections, w) {
  let a = ringPoints(sections[0]);
  for (let k = 1; k < sections.length; k++) {
    const b = ringPoints(sections[k]);
    for (let i = 0; i < POINTS; i++) {
      const j = (i + 1) % POINTS;
      tri(w, a, i, b, i, b, j);
      tri(w, a, i, b, j, a, j);
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
    if (atEnd) tri(w, cc, 0, r, j, r, i);
    else tri(w, cc, 0, r, i, r, j);
  }
}


/** Gerundeter Deckel: der Umriss schrumpft über einen Viertelkreis auf
    einen Punkt und wandert dabei in Laufrichtung vor. Die Höhe ist das
    kleinere der beiden Profilmaße — so bleibt die Kuppe im Verhältnis
    zum Kanal und wächst einem flachen Kanal nicht davon. */
function domeCap(sections, index, atEnd, w) {
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
      if (atEnd) { tri(w, a, i, b, i, b, j); tri(w, a, i, b, j, a, j); }
      else { tri(w, a, i, b, j, b, i); tri(w, a, i, a, j, b, j); }
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
    if (atEnd) tri(w, apex, 0, a, j, a, i);
    else tri(w, apex, 0, a, i, a, j);
  }
}

/** Alle Kanäle als Dreieckssuppe (ohne Pressrest). */
export function sweepRunner(net) {
  const w = { a: new Float64Array(triCount(net) * 9), k: 0 };
  for (const e of net.edges) {
    if (e.sections.length < 2) continue;
    const last = e.sections.length - 1;
    shell(e.sections, w);
    (isJunction(e.from) ? domeCap : cap)(e.sections, 0, false, w);
    (isJunction(e.to) ? domeCap : cap)(e.sections, last, true, w);
  }
  return w.a;
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
