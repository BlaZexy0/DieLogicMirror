/* Aus dem Luftbohnen-Plan werden Körper: Dreieckssuppen wie überall im
   Studio (9 Werte je Dreieck), je Element ein oder mehrere geschlossene
   Prismen.

   Alles wird in LOKALEN Koordinaten gebaut — x in Fließrichtung vom
   Bauteil weg, y quer, z auf der Ausstoßachse — und am Ende mit dem
   Dreibein des Elements in die Welt gesetzt. Tiefe ist negatives z: die
   Taschen wachsen ENTGEGEN der Ausstoßrichtung, in dieselbe Formhälfte
   wie die Laufkanäle des Angussdesigners.

   Ein Prisma ist ein ebenes Polygon, um eine Strecke ausgezogen. Die
   Deckel werden per Ohrenabschneiden trianguliert, damit auch das
   Waschbrett (ein Zickzack-Band, nicht konvex) einen dichten Körper
   ergibt. */

import { frameOf, toWorld, TYPES, allItems } from './model.js';
import { volume } from '../mesh.js';

/* ── Polygone ────────────────────────────────────────────────── */

function signedArea(poly) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Ohrenabschneiden für ein einfaches Polygon (gegen den Uhrzeigersinn).
    Liefert Indexdreiecke. */
export function triangulate(poly) {
  const n = poly.length;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(i);
  const out = [];
  const cross2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p, a, b, c) => cross2(a, b, p) >= -1e-12 && cross2(b, c, p) >= -1e-12 && cross2(c, a, p) >= -1e-12;
  let guard = 0;
  while (idx.length > 3 && guard++ < 10000) {
    let cut = false;
    for (let k = 0; k < idx.length; k++) {
      const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
      const a = poly[i0], b = poly[i1], c = poly[i2];
      if (cross2(a, b, c) <= 1e-12) continue;                   // einspringende Ecke
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
    if (!cut) break;                                            // entartet — was da ist, reicht
  }
  if (idx.length === 3) out.push([idx[0], idx[1], idx[2]]);
  return out;
}

/** Prisma: Polygon in (u,v), ausgezogen entlang w von w0 bis w1 (w1 > w0).
    `map(u, v, w)` setzt lokale in Weltkoordinaten (rechtshändig — sonst
    kehrt sich die Wicklung um). Ergebnis: Dreiecke, nach außen gewickelt. */
export function prism(polyIn, w0, w1, map) {
  const poly = signedArea(polyIn) < 0 ? polyIn.slice().reverse() : polyIn;
  const tris = triangulate(poly);
  const out = [];
  const push = (a, b, c) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };
  const at = (i, w) => map(poly[i][0], poly[i][1], w);
  for (const [a, b, c] of tris) {
    push(at(a, w1), at(b, w1), at(c, w1));                     // Deckel oben (+w)
    push(at(a, w0), at(c, w0), at(b, w0));                     // Deckel unten (−w)
  }
  for (let i = 0; i < poly.length; i++) {
    const j = (i + 1) % poly.length;
    const a0 = at(i, w0), b0 = at(j, w0), b1 = at(j, w1), a1 = at(i, w1);
    push(a0, b0, b1);
    push(a0, b1, a1);
  }
  return out;
}

/* Rechteck x ∈ [x0, x1], y ∈ [−w/2, w/2]. */
const rect = (x0, x1, w) => [[x0, -w / 2], [x1, -w / 2], [x1, w / 2], [x0, w / 2]];

/* Stadion: Rechteck mit Halbkreisen an beiden Enden, Gesamtlänge L,
   Breite w, von x0 an. Ist L kürzer als w, wird es ein Kreisbogenpaar
   mit dem Radius L/2. */
function stadium(x0, L, w, seg = 10) {
  const r = Math.min(w / 2, L / 2);
  const cx1 = x0 + r, cx2 = x0 + L - r;
  const pts = [];
  for (let i = 0; i <= seg; i++) {                              // rechter Bogen, −90° → +90°
    const a = -Math.PI / 2 + Math.PI * i / seg;
    pts.push([cx2 + r * Math.cos(a), r * Math.sin(a)]);
  }
  for (let i = 0; i <= seg; i++) {                              // linker Bogen, 90° → 270°
    const a = Math.PI / 2 + Math.PI * i / seg;
    pts.push([cx1 + r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

/* ── Elemente ────────────────────────────────────────────────── */

/** Die Körper eines Elements in Weltkoordinaten, als Liste von Dreieckssuppen. */
export function buildItem(plan, item) {
  const f = frameOf(plan, item);
  const p = item.p;
  /* Polygon in (x, y), ausgezogen in z: map(u=x, v=y, w=z). (d, r, n)
     ist rechtshändig, die Wicklung bleibt. */
  const flat = (u, v, w) => toWorld(f, u, v, w);
  /* Polygon in (x, z), ausgezogen quer in y: (d, n, r) wäre linkshändig —
     w läuft deshalb gegen r, dann stimmt die Wicklung wieder. */
  const side = (u, v, w) => toWorld(f, u, -w, v);
  const parts = [];
  const t = item.type;
  if (t === 'bohne' || t === 'entlueftet' || t === 'waschbrett') {
    parts.push(prism(rect(0, p.stegL, p.stegW), -p.stegH, 0, flat));
  }
  if (t === 'bohne' || t === 'entlueftet') {
    parts.push(prism(stadium(p.stegL, p.wellL, p.wellW), -p.wellD, 0, flat));
  }
  if (t === 'entlueftet') {
    const x0 = p.stegL + p.wellL;
    parts.push(prism(rect(x0, x0 + p.ventL, p.ventW), -p.ventH, 0, flat));
  }
  if (t === 'schlitz') {
    parts.push(prism(rect(0, p.ventL, p.ventW), -p.ventH, 0, flat));
  }
  if (t === 'waschbrett') {
    /* Das Band: die Oberkante springt je halbe Welle zwischen 0 und
       −amp, von der Trennebene aus nach unten. Die Unterkante liegt so
       weit darunter, dass der Spalt SENKRECHT zur Welle überall ventH
       misst — ein lotrechter Versatz um ventH machte den Kanal auf den
       Flanken um cos(Steigung) dünner, und gerade der Spalt ist die
       Zahl, um die es beim Waschbrett geht. */
    const n = Math.max(1, Math.round(p.waves));
    const half = p.waveL / 2;
    const drop = p.ventH * Math.hypot(half, p.amp) / half;
    const top = [], bottom = [];
    for (let k = 0; k <= 2 * n; k++) {
      const x = p.stegL + k * half;
      const z = k % 2 ? -p.amp : 0;
      top.push([x, z]);
      bottom.push([x, z - drop]);
    }
    const band = top.concat(bottom.reverse());
    parts.push(prism(band, -p.ventW / 2, p.ventW / 2, side));
  }
  return parts;
}

/** Alle Elemente, nach Art getrennt (je Art ein Material im Viewport). */
export function buildByType(plan) {
  const out = {};
  for (const it of allItems(plan)) {
    const tris = buildItem(plan, it).flat();
    out[it.type] = out[it.type] ? out[it.type].concat(tris) : tris;
  }
  return out;
}

/** Alles zusammen — für die STL. */
export function buildAll(plan) {
  const list = [];
  for (const it of allItems(plan)) for (const part of buildItem(plan, it)) list.push(part);
  const n = list.reduce((a, t) => a + t.length, 0);
  const out = new Float64Array(n);
  let k = 0;
  for (const t of list) { out.set(t, k); k += t.length; }
  return out;
}

/** Volumen je Element (mm³) — die Überläufe gehen ins Schussgewicht. */
export function volumeOf(plan, item) {
  let v = 0;
  for (const part of buildItem(plan, item)) v += volume(part);
  return v;
}

export { TYPES };
