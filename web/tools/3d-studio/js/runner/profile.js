/* Der Querschnitt eines Laufkanals — als Umriss UND als Abstandsfunktion.

   Ein Druckguss-Laufkanal wird in EINE Formhälfte gefräst. Sein
   Querschnitt ist deshalb ein Trapez: an der Trennebene am breitesten,
   nach unten von der Entformschräge verjüngt, mit verrundetem Boden.
   Die Mittellinie des Splines liegt in der Trennebene, das Profil hängt
   darunter — die Tiefe wächst entgegen der Pressrest-Richtung, also in
   dieselbe Formhälfte, in der auch der Pressrest sitzt.

   Profilkoordinaten: x quer zur Laufrichtung (0 = Mitte), y in die
   Tiefe (0 = Trennebene, +depth = Kanalboden).

        -w/2        0        +w/2
          ├──────────┬──────────┤   y = 0   Trennebene, SCHARFE Kante
           \                    /
            \      Schräge     /
             ╰──────────────╯          y = depth   verrundeter Boden

   Die obere Kante bleibt scharf — dort stoßen die beiden Formhälften
   aufeinander; ein Radius wäre dort ein Spalt. Verrundet ist nur der
   Boden. Genau das ist der Grund, warum die Abstandsfunktion nicht
   einfach „Trapez minus Radius" sein kann (das verrundete jede Ecke,
   auch die obere): sie ist der um r nach innen versetzte Kern, um r
   aufgedickt, UND anschließend an der Trennebene abgeschnitten.

   Zwei Darstellungen derselben Form:

   - `outline()` liefert eine FESTE Zahl Punkte in fester Reihenfolge.
     Nur so lassen sich zwei aufeinanderfolgende Schnitte ohne Verdrehen
     zu Vierecken verbinden (js/runner/sweep.js).
   - `sdf2d()` ist derselbe Umriss als vorzeichenbehafteter Abstand. Ihn
     braucht die Verschmelzung (js/runner/sdf.js), die aus allen Kanälen
     EINEN dichten Körper mit weichen Übergängen macht.

   Beide beschreiben dieselbe Form; `tests/web/3d-studio/runner.test.mjs`
   prüft sie gegeneinander. */

import { clamp } from './vec.js';

/* Aufteilung der Umrisspunkte. Die Reihenfolge läuft von der oberen
   rechten Kante nach unten, über den Boden und links wieder herauf. */
const N_FLANK = 4;    // je Flanke (ohne Endpunkt)
const N_ARC = 5;      // je Bodenverrundung (ohne Endpunkt)
const N_BOTTOM = 4;   // Boden (ohne Endpunkt)
const N_TOP = 4;      // Trennebene (ohne Endpunkt)
export const POINTS = 2 * N_FLANK + 2 * N_ARC + N_BOTTOM + N_TOP;

/** Maße eines Querschnitts aufbereiten und auf das Machbare klemmen.
    Ergebnis ist die einzige Beschreibung, mit der outline() und sdf2d()
    arbeiten — beide leiten alles daraus ab. */
export function section(w, h, draftDeg, radius) {
  const width = Math.max(0.4, w);
  const depth = Math.max(0.2, h);
  const t = Math.tan(clamp(draftDeg, 0, 30) * Math.PI / 180);
  /* Die Schräge darf den Boden nicht zuschnüren: mindestens ein Drittel
     der oberen Breite bleibt stehen. Sonst kippt bei tiefen, schmalen
     Kanälen das Trapez in ein Dreieck. */
  const bottom = Math.max(width / 3, width - 2 * depth * t);
  const tanA = (width - bottom) / (2 * depth);
  const cosA = 1 / Math.hypot(1, tanA), sinA = tanA * cosA;
  /* Radius: er muss in die Tiefe passen und darf den flachen Boden nicht
     ganz auffressen (cb ist dessen halbe Breite). */
  let r = clamp(radius, 0, 0.45 * depth);
  const cbOf = rr => bottom / 2 + rr * tanA - rr / cosA;
  if (cbOf(r) < 0.05 * bottom) {
    /* cb(r) ist linear in r — direkt auflösen statt zu suchen. */
    const k = 1 / cosA - tanA;
    r = k > 1e-9 ? Math.max(0, (bottom / 2 - 0.05 * bottom) / k) : 0;
  }
  const cb = Math.max(0, cbOf(r));
  return { width, depth, bottom, r, tanA, cosA, sinA, cb, halfTop: width / 2 };
}

/** Umriss als flaches Feld [x0,y0, x1,y1, …] mit POINTS Punkten. */
export function outline(sec) {
  const { halfTop, depth, r, cb, cosA, sinA } = sec;
  const out = new Float64Array(POINTS * 2);
  let k = 0;
  const push = (x, y) => { out[k++] = x; out[k++] = y; };

  /* Tangentenpunkt: dort geht die Flanke in die Bodenverrundung über.
     Kreismittelpunkt C = (cb, depth − r); der Bogen läuft vom Winkel A
     (Flanke) bis 90° (Boden). */
  const cy = depth - r;
  const tx = cb + r * cosA, ty = cy + r * sinA;
  const angA = Math.atan2(sinA, cosA), angB = Math.PI / 2;

  for (let i = 0; i < N_FLANK; i++) {                       // rechte Flanke
    const t = i / N_FLANK;
    push(halfTop + (tx - halfTop) * t, ty * t);
  }
  for (let i = 0; i < N_ARC; i++) {                         // Verrundung rechts
    const a = angA + (angB - angA) * (i / N_ARC);
    push(cb + r * Math.cos(a), cy + r * Math.sin(a));
  }
  for (let i = 0; i < N_BOTTOM; i++) {                      // Boden rechts → links
    push(cb - 2 * cb * (i / N_BOTTOM), depth);
  }
  for (let i = 0; i < N_ARC; i++) {                         // Verrundung links
    const a = angB + (angA - angB) * (i / N_ARC);
    push(-(cb + r * Math.cos(a)), cy + r * Math.sin(a));
  }
  for (let i = 0; i < N_FLANK; i++) {                       // linke Flanke herauf
    const t = i / N_FLANK;
    push(-tx + (tx - halfTop) * t, ty * (1 - t));
  }
  for (let i = 0; i < N_TOP; i++) {                         // Trennebene links → rechts
    push(-halfTop + 2 * halfTop * (i / N_TOP), 0);
  }
  return out;
}

/** Flächeninhalt (Gaußsche Trapezformel über den Umriss). */
export function area(sec) {
  const p = outline(sec);
  let a = 0;
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    a += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
  }
  return Math.abs(a) / 2;
}

/** Benetzter Umfang. */
export function perimeter(sec) {
  const p = outline(sec);
  let u = 0;
  for (let i = 0; i < POINTS; i++) {
    const j = (i + 1) % POINTS;
    u += Math.hypot(p[j * 2] - p[i * 2], p[j * 2 + 1] - p[i * 2 + 1]);
  }
  return u;
}

/** Hydraulischer Durchmesser 4A/U — Bezugslänge aller Verlustbeiwerte. */
export const hydraulic = sec => 4 * area(sec) / Math.max(perimeter(sec), 1e-9);

/** Die Umkehrung: Breite und Tiefe zu einer Zielfläche bei gegebenem
    Seitenverhältnis h/w. Die Fläche wächst fast quadratisch mit der
    Breite (nur der Eckenradius skaliert nicht mit), deshalb ist der
    Schätzwert nach zwei, drei Schritten auf Rundungsgenauigkeit. */
export function dimsForArea(target, aspect, draftDeg, radius) {
  const q = clamp(aspect, 0.02, 4);
  let w = Math.sqrt(Math.max(target, 0.2) / q);
  for (let i = 0; i < 5; i++) {
    const a = area(section(w, q * w, draftDeg, radius));
    if (!(a > 0)) break;
    const f = Math.sqrt(target / a);
    w *= f;
    if (Math.abs(f - 1) < 1e-5) break;
  }
  return { w: Math.max(0.4, w), h: Math.max(0.2, q * w) };
}

/* ── Dieselbe Form als Abstandsfunktion ──────────────────────────
   Der „Kern" ist der um r nach innen versetzte Keil aus Flanke und
   Boden. Er ist nach oben OFFEN — die Trennebene schneidet ihn erst
   danach ab. Diese Trennung ist kein Selbstzweck: beim Verschmelzen
   mehrerer Kanäle (js/runner/sdf.js) wird nur der Kern weich vereinigt,
   und der Schnitt an der Trennebene kommt zuletzt und scharf. Täte man
   es andersherum, zöge der Übergangsradius den Körper über die
   Trennebene hinaus — gemessen 1,2 mm bei 3 mm Übergang, und ein Anguss,
   der über die Trennebene ragt, passt in keine Formhälfte.

   Innen ist der Wert exakt. Außen ist er in der Nähe der oberen Kante
   um weniger als eine Rasterzelle zu klein (Maximum zweier konvexer
   Abstände) — die Nullfläche selbst bleibt exakt, und mehr braucht die
   Flächenextraktion nicht. */

/** Der nach oben offene Kern: verrundetes Trapez ohne den Schnitt an
    der Trennebene. */
export function sdf2dCore(sec, x, y) {
  const { depth, r, cb, cosA, sinA, halfTop } = sec;
  const ax = Math.abs(x);
  const yb = depth - r;
  /* Flanke des Kerns: Gerade durch (halfTop − r/cosA, 0), Normale
     (cosA, sinA) nach außen. */
  const dA = cosA * (ax - halfTop + r / cosA) + sinA * y;
  const dB = y - yb;
  let core;
  if (dA <= 0 && dB <= 0) {
    core = Math.max(dA, dB);
  } else if (dB <= 0) {
    core = dA;
  } else if (ax <= cb) {
    core = dB;
  } else if (y - dA * sinA <= yb) {
    core = dA;
  } else {
    core = Math.hypot(ax - cb, y - yb);
  }
  return core - r;
}

/** Der fertige Querschnitt: Kern, an der Trennebene abgeschnitten. */
export const sdf2d = (sec, x, y) => Math.max(-y, sdf2dCore(sec, x, y));
