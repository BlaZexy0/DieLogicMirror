/* Aus dem Überlaufplan werden Körper: Dreieckssuppen wie überall im
   Studio (9 Werte je Dreieck), je Element ein oder mehrere geschlossene
   Körper.

   Alles wird in LOKALEN Koordinaten gebaut — x längs in der Wandebene,
   y quer, z „oben" entlang der Flächennormalen — und am Ende mit dem
   Dreibein des Elements in die Welt gesetzt. Steg, Kanal und Bohne
   liegen mit ihrer offenen Seite bei z = 0 und wachsen nach −z in die
   Tiefe.

   Die Bohne ist die eigentliche Form: ein D — flach zum Steg hin, damit
   der Steg mit ganzer Stirnfläche an ihr sitzt (an einer runden Bohne
   berührte er sie nur in einer Linie, und da käme keine Schmelze
   hinein), rund am fernen Ende, mit Entformschräge an den Wänden und
   Radius am Boden. Sie entsteht als Loft: derselbe Umriss, Ring für
   Ring nach innen versetzt, unten ein Deckel.

   Prismen und Lofts bekommen ihre Deckel per Ohrenabschneiden — auch
   das Zickzack-Band des Waschbretts ist damit dicht. */

import { frameOf, toWorld, TYPES, allItems, ventExitX, ventPoints } from './model.js';
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

const pushTri = (out, a, b, c) => { out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); };

/** Loft: Ringe gleicher Punktzahl von oben (rings[0], w[0] am größten)
    nach unten, Deckel oben und unten, Mantel dazwischen. `map(u, v, w)`
    setzt lokale in Weltkoordinaten (rechtshändig). Alle Ringe gegen den
    Uhrzeigersinn, dann ist die Wicklung nach außen. */
export function loft(rings, ws, map) {
  const out = [];
  const at = (k, i) => map(rings[k][i][0], rings[k][i][1], ws[k]);
  const n = rings[0].length, last = rings.length - 1;
  for (const [a, b, c] of triangulate(rings[0])) pushTri(out, at(0, a), at(0, b), at(0, c));        // oben, +w
  for (const [a, b, c] of triangulate(rings[last])) pushTri(out, at(last, a), at(last, c), at(last, b)); // unten, −w
  for (let k = 0; k < last; k++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      /* unterer Ring k+1 → oberer Ring k: wie beim Prisma von w0 nach w1 */
      const a0 = at(k + 1, i), b0 = at(k + 1, j), b1 = at(k, j), a1 = at(k, i);
      pushTri(out, a0, b0, b1);
      pushTri(out, a0, b1, a1);
    }
  }
  return out;
}

/** Prisma: Polygon in (u,v), ausgezogen entlang w von w0 bis w1 (w1 > w0). */
export function prism(polyIn, w0, w1, map) {
  const poly = signedArea(polyIn) < 0 ? polyIn.slice().reverse() : polyIn;
  return loft([poly, poly], [w1, w0], map);
}

/* Rechteck x ∈ [x0, x1], y ∈ [−w/2, w/2]. */
const rect = (x0, x1, w) => [[x0, -w / 2], [x1, -w / 2], [x1, w / 2], [x0, w / 2]];

/**
 * Der Umriss der Bohne von oben, um `s` nach innen versetzt: ein D von
 * x0 bis x0+L, Breite W — flach bei x0 (mit Eckenradius rn), rund am
 * fernen Ende. Die Punktzahl hängt nicht von s ab, damit die Ringe des
 * Lofts zueinander passen. Radien werden nicht kleiner als ein
 * Zwanzigstel, sonst fielen Punkte zusammen und der Mantel bekäme
 * Dreiecke ohne Fläche.
 */
export function wellOutline(x0, L, W, rn, s, seg = 10, cseg = 4) {
  const w2 = Math.max(0.05, W / 2 - s);
  const r = Math.max(0.05, Math.min(rn - s, w2 - 0.05));
  const xa = x0 + s, xb = Math.max(xa + 2 * r + 0.1, x0 + L - s);
  const R = Math.min(w2, (xb - xa) / 2);
  const pts = [];
  pts.push([xa + r, -w2]);                                    // Beginn der Unterkante
  const cx = xb - R;
  for (let i = 0; i <= seg; i++) {                              // fernes Ende: −90° → +90°
    const a = -Math.PI / 2 + Math.PI * i / seg;
    pts.push([cx + R * Math.cos(a), R * Math.sin(a)]);
  }
  pts.push([xa + r, w2]);                                       // Ende der Oberkante
  for (let i = 1; i <= cseg; i++) {                             // Ecke oben links: 90° → 180°
    const a = Math.PI / 2 + Math.PI / 2 * i / cseg;
    pts.push([xa + r + r * Math.cos(a), w2 - r + r * Math.sin(a)]);
  }
  /* Die flache Seite: von (xa, w2 − r) hinunter nach (xa, −w2 + r) — der
     Anfang dieser Ecke IST ihr unteres Ende, deshalb ab i = 0. Ohne ihn
     lief der Umriss schräg von der oberen Ecke in die untere, und der
     Steg saß an einer Kante statt an einer Fläche. */
  for (let i = 0; i < cseg; i++) {                              // Ecke unten links: 180° → 270°
    const a = Math.PI + Math.PI / 2 * i / cseg;
    pts.push([xa + r + r * Math.cos(a), -w2 + r + r * Math.sin(a)]);
  }
  return pts;
}

/**
 * Der Entlüftungskanal als Umriss um den Punktezug: Breite W, Gehrung an
 * den Knicken (bei sehr spitzen Knicken abgeschrägt), am Anfang so weit
 * in die Bohne hinein, dass er ihr rundes Ende über seine ganze Breite
 * trifft — am Scheitel allein berührte er sie nur in einem Punkt.
 * Liefert das Polygon (gegen den Uhrzeigersinn) und das Stück `pen`, das
 * in der Bohne liegt.
 */
export function ventOutline(item) {
  const p = item.p;
  const W = p.ventW, w = W / 2;
  const x0 = ventExitX(item);
  const pts = [[x0, 0]].concat(ventPoints(item).map(q => [x0 + q[0], q[1]]));
  /* Doppelte Punkte fallen weg — ein Stück ohne Länge hat keine Richtung. */
  const path = [pts[0]];
  for (const q of pts.slice(1)) if (Math.hypot(q[0] - path[path.length - 1][0], q[1] - path[path.length - 1][1]) > 1e-6) path.push(q);
  if (path.length < 2) path.push([x0 + 1, 0]);
  const u0 = [path[1][0] - path[0][0], path[1][1] - path[0][1]];
  const l0 = Math.hypot(u0[0], u0[1]);
  u0[0] /= l0; u0[1] /= l0;
  /* Rundes Ende der Bohne: Radius R = halbe Breite; die Sehne der Kanalbreite
     liegt R − √(R² − w²) hinter dem Scheitel. */
  const R = p.wellW / 2;
  const pen = (w < R ? R - Math.sqrt(R * R - w * w) : R) + 0.2;
  path[0] = [path[0][0] - u0[0] * pen, path[0][1] - u0[1] * pen];

  const n = path.length;
  const dirs = [], nrms = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = path[i + 1][0] - path[i][0], dy = path[i + 1][1] - path[i][1];
    const l = Math.hypot(dx, dy);
    dirs.push([dx / l, dy / l]);
    nrms.push([-dy / l, dx / l]);
  }
  const side = sgn => {
    const out = [];
    const off = (i, k) => [path[i][0] + nrms[k][0] * w * sgn, path[i][1] + nrms[k][1] * w * sgn];
    out.push(off(0, 0));
    for (let i = 1; i < n - 1; i++) {
      const a = nrms[i - 1], b = nrms[i];
      const m = [a[0] + b[0], a[1] + b[1]];
      const ml = Math.hypot(m[0], m[1]);
      const cos = ml > 1e-9 ? (m[0] / ml) * b[0] + (m[1] / ml) * b[1] : 0;
      if (cos > 0.35) {                                       // Gehrung
        const k = w * sgn / cos;
        out.push([path[i][0] + m[0] / ml * k, path[i][1] + m[1] / ml * k]);
      } else {                                                // zu spitz: abgeschrägt
        out.push(off(i, i - 1), off(i, i));
      }
    }
    out.push(off(n - 1, n - 2));
    return out;
  };
  const poly = side(1).concat(side(-1).reverse());
  return { poly, pen, path };
}

/** Die Bohne als Loft: Wand mit Entformschräge, Boden mit Radius. */
function wellBody(x0, p, map) {
  const D = p.wellD;
  const tanA = Math.tan(Math.min(Math.max(p.draft || 0, 0), 20) * Math.PI / 180);
  const R = Math.min(p.wellR || 0, 0.45 * D, 0.4 * p.wellW);
  /* Eckenradius zum Steg hin: klein, und so, dass die flache Seite
     mindestens die Stegbreite hat — dort sitzt der Steg mit ganzer
     Stirnfläche. */
  const rn = Math.max(0.3, Math.min(2, (p.wellW - p.stegW) / 2, p.wellW / 4));
  const rings = [], ws = [];
  const ring = (s, z) => { rings.push(wellOutline(x0, p.wellL, p.wellW, rn, s)); ws.push(z); };
  ring(0, 0);
  const wallD = D - R;
  const Dw = wallD * tanA;
  if (wallD > 1e-6 && R > 1e-6) ring(Dw, -wallD);
  if (R > 1e-6) {
    /* Viertelkreis von der Wand in den Boden: Mitte bei (Dw + R, −wallD). */
    const m = 6;
    for (let i = 1; i <= m; i++) {
      const t = Math.PI / 2 * i / m;
      ring(Dw + R * (1 - Math.cos(t)), -wallD - R * Math.sin(t));
    }
  } else {
    ring(D * tanA, -D);
  }
  return loft(rings, ws, map);
}

/* ── Elemente ────────────────────────────────────────────────── */

/** Die Körper eines Elements in Weltkoordinaten, als Liste von Dreieckssuppen. */
export function buildItem(item) {
  const f = frameOf(item);
  const p = item.p;
  /* Polygon in (x, y), ausgezogen in z: map(u=x, v=y, w=z). */
  const flat = (u, v, w) => toWorld(f, u, v, w);
  /* Polygon in (x, z), ausgezogen quer in y: (d, n, r) wäre linkshändig —
     w läuft deshalb gegen r, dann stimmt die Wicklung wieder. */
  const side = (u, v, w) => toWorld(f, u, -w, v);
  const parts = [];
  const t = item.type;
  if (t === 'bohne' || t === 'entlueftet') {
    /* Der Steg reicht ein Stück in die Bohne hinein: ihre Wand weicht
       mit der Schräge zurück, und ein Steg, der genau an der Oberkante
       endete, hinge darunter in der Luft. */
    const pen = p.wellD * Math.tan((p.draft || 0) * Math.PI / 180) + 0.2;
    parts.push(prism(rect(0, p.stegL + pen, p.stegW), -p.stegH, 0, flat));
    parts.push(wellBody(p.stegL, p, flat));
  }
  if (t === 'waschbrett') {
    /* Steg, dann der Sammelkanal: kurz und dicker als der Spalt, so
       breit wie das Brett. Hier beruhigt sich die Front, bevor sie in
       die Wellen läuft — ohne ihn schösse sie aus dem 1-mm-Steg direkt
       in den halben Millimeter Spalt. */
    parts.push(prism(rect(0, p.stegL + 0.2, p.stegW), -p.stegH, 0, flat));
    parts.push(prism(rect(p.stegL, p.stegL + p.poolL, p.ventW), -p.poolH, 0, flat));
  }
  if (t === 'entlueftet') {
    parts.push(prism(ventOutline(item).poly, -p.ventH, 0, flat));
  }
  if (t === 'schlitz') {
    parts.push(prism(rect(0, p.ventL, p.ventW), -p.ventH, 0, flat));
  }
  if (t === 'waschbrett') {
    /* Das Band: die Oberkante springt je halbe Welle zwischen 0 und
       −amp. Die Unterkante liegt so weit darunter, dass der Spalt
       SENKRECHT zur Welle überall ventH misst — ein lotrechter Versatz
       um ventH machte den Kanal auf den Flanken dünner, und gerade der
       Spalt ist die Zahl, um die es beim Waschbrett geht. */
    const n = Math.max(1, Math.round(p.waves));
    const half = p.waveL / 2;
    const drop = p.ventH * Math.hypot(half, p.amp) / half;
    const top = [], bottom = [];
    const x0 = p.stegL + p.poolL - 0.2;                       // ein Stück in den Sammelkanal hinein
    for (let k = 0; k <= 2 * n; k++) {
      const x = x0 + k * half;
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
    const tris = buildItem(it).flat();
    out[it.type] = out[it.type] ? out[it.type].concat(tris) : tris;
  }
  return out;
}

/** Alles zusammen — für die STL. */
export function buildAll(plan) {
  const list = [];
  for (const it of allItems(plan)) for (const part of buildItem(it)) list.push(part);
  const n = list.reduce((a, t) => a + t.length, 0);
  const out = new Float64Array(n);
  let k = 0;
  for (const t of list) { out.set(t, k); k += t.length; }
  return out;
}

/** Volumen eines Elements (mm³) — die Überläufe gehen ins Schussgewicht.
    Der Steg ragt ein wenig in die Bohne; das Stück wird herausgerechnet. */
export function volumeOf(item) {
  let v = 0;
  for (const part of buildItem(item)) v += volume(part);
  const p = item.p;
  if (item.type === 'bohne' || item.type === 'entlueftet') {
    v -= p.stegW * p.stegH * (p.wellD * Math.tan((p.draft || 0) * Math.PI / 180) + 0.2);
    if (item.type === 'entlueftet') v -= p.ventW * p.ventH * ventOutline(item).pen;   // das Stück in der Bohne
  }
  if (item.type === 'waschbrett') {
    const half = p.waveL / 2;
    const drop = p.ventH * Math.hypot(half, p.amp) / half;     // lotrechte Dicke des Bandes
    v -= p.stegW * p.stegH * 0.2;                              // Steg im Sammelkanal
    v -= p.ventW * Math.min(drop, p.poolH) * 0.2;              // Band im Sammelkanal
  }
  return v;
}

export { TYPES };
