/* Boolesche Operationen auf Dreiecksnetzen (BSP-Verfahren nach csg.js von
   Evan Wallace, MIT — hier eigenständig implementiert, ohne Rekursion und
   ohne Three.js-Abhängigkeit).

   Wozu: die Tests bauen sich damit Prüfteile aus Primitiven (js/solids.js),
   etwa eine Platte mit Bohrung, Tasche oder Rippen. Keine Seite lädt das
   Modul. Die Netze sind klein (Quader, Zylinder mit 32–40 Segmenten),
   dafür reicht ein BSP-Baum bequem aus.

   Datenformat wie in js/mesh.js: Float32Array/Float64Array mit 9 Werten je
   Dreieck. Ein- und Ausgabe sind Dreieckssuppen.

   Voraussetzung: beide Netze sind geschlossen und konsistent orientiert
   (Normalen nach außen). Offene Netze liefern undefinierte Ergebnisse —
   genau wie bei jedem anderen BSP-CSG. */

/* Toleranz in Modelleinheiten (mm). Ein Prüfteil misst höchstens einige
   hundert mm; in doppelter Genauigkeit liegt der Rechenfehler bei ~1e-13 mm,
   1e-5 ist also großzügig und trotzdem weit unter jedem echten Maß. */
const EPS = 1e-5;

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

/* ── Polygone ────────────────────────────────────────────────── */

/* Ein Polygon ist { v: [x,y,z, …], p: [nx,ny,nz,w] } — konvex, in der
   Ebene p, Punkte gegen den Uhrzeigersinn von außen gesehen. */
function planeOf(v) {
  /* Newell: robust auch dann, wenn die ersten drei Punkte fast kollinear
     sind (kommt nach vielen Schnitten vor). */
  let nx = 0, ny = 0, nz = 0;
  const n = v.length / 3;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = v[i * 3], ay = v[i * 3 + 1], az = v[i * 3 + 2];
    const bx = v[j * 3], by = v[j * 3 + 1], bz = v[j * 3 + 2];
    nx += (ay - by) * (az + bz);
    ny += (az - bz) * (ax + bx);
    nz += (ax - bx) * (ay + by);
  }
  const len = Math.hypot(nx, ny, nz);
  if (len < 1e-14) return null;                  // entartet — Polygon verwerfen
  nx /= len; ny /= len; nz /= len;
  let w = 0;
  for (let i = 0; i < n; i++) w += nx * v[i * 3] + ny * v[i * 3 + 1] + nz * v[i * 3 + 2];
  return [nx, ny, nz, w / n];
}

function makePoly(v) {
  const p = planeOf(v);
  return p ? { v, p } : null;
}

function flipPoly(poly) {
  const v = poly.v, n = v.length / 3, out = new Array(v.length);
  for (let i = 0; i < n; i++) {
    const s = (n - 1 - i) * 3;
    out[i * 3] = v[s]; out[i * 3 + 1] = v[s + 1]; out[i * 3 + 2] = v[s + 2];
  }
  poly.v = out;
  poly.p = [-poly.p[0], -poly.p[1], -poly.p[2], -poly.p[3]];
}

/* Polygon an einer Ebene zerlegen; die vier Ausgabelisten entsprechen
   csg.js (koplanar vorne/hinten, davor, dahinter). */
function splitPolygon(plane, poly, coFront, coBack, front, back) {
  const [px, py, pz, pw] = plane;
  const v = poly.v, n = v.length / 3;
  let polyType = 0;
  const types = new Array(n);
  for (let i = 0; i < n; i++) {
    const t = px * v[i * 3] + py * v[i * 3 + 1] + pz * v[i * 3 + 2] - pw;
    const type = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    polyType |= type;
    types[i] = type;
  }

  if (polyType === COPLANAR) {
    (px * poly.p[0] + py * poly.p[1] + pz * poly.p[2] > 0 ? coFront : coBack).push(poly);
    return;
  }
  if (polyType === FRONT) { front.push(poly); return; }
  if (polyType === BACK) { back.push(poly); return; }

  const f = [], b = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ti = types[i], tj = types[j];
    const ax = v[i * 3], ay = v[i * 3 + 1], az = v[i * 3 + 2];
    if (ti !== BACK) f.push(ax, ay, az);
    if (ti !== FRONT) b.push(ax, ay, az);
    if ((ti | tj) === SPANNING) {
      const bx = v[j * 3], by = v[j * 3 + 1], bz = v[j * 3 + 2];
      const da = px * ax + py * ay + pz * az - pw;
      const db = px * bx + py * by + pz * bz - pw;
      const t = da / (da - db);
      const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t;
      f.push(cx, cy, cz); b.push(cx, cy, cz);
    }
  }
  /* Die beiden Hälften erben die Ebene des Originals, statt sie aus den
     neuen Punkten NEU zu rechnen. Newell über einen langen, schmalen
     Splitter liefert eine minimal verkippte Ebene; die nächste Teilung
     schneidet dann an leicht verschobener Stelle, und zwei eigentlich
     identische Punkte laufen um Hundertstelmillimeter auseinander — das
     Netz reißt an genau dieser Stelle auf. Geerbte Ebenen halten alle
     Splitter exakt koplanar. (Die Ebenen-Arrays werden nie an Ort und
     Stelle verändert; flipPoly und invert legen neue an.) */
  if (f.length >= 9) front.push({ v: f, p: poly.p });
  if (b.length >= 9) back.push({ v: b, p: poly.p });
}

/* ── BSP-Baum ────────────────────────────────────────────────── */

const newNode = () => ({ plane: null, front: null, back: null, polygons: [] });

function build(node, polys) {
  const stack = [[node, polys]];
  while (stack.length) {
    const [n, ps] = stack.pop();
    if (!ps.length) continue;
    /* Teilerebene aus der Mitte der Liste — bei Zylindermänteln wird der
       Baum damit deutlich flacher als mit dem ersten Polygon. */
    if (!n.plane) n.plane = ps[ps.length >> 1].p;
    const front = [], back = [];
    for (const p of ps) splitPolygon(n.plane, p, n.polygons, n.polygons, front, back);
    if (front.length) { if (!n.front) n.front = newNode(); stack.push([n.front, front]); }
    if (back.length)  { if (!n.back)  n.back  = newNode(); stack.push([n.back, back]); }
  }
}

/* Polygone am Baum beschneiden: was im Volumen des Baums liegt, fällt weg. */
function clipPolygons(node, polys) {
  const out = [];
  const stack = [[node, polys]];
  while (stack.length) {
    const [n, ps] = stack.pop();
    if (!ps.length) continue;
    if (!n.plane) { for (const p of ps) out.push(p); continue; }
    const front = [], back = [];
    for (const p of ps) splitPolygon(n.plane, p, front, back, front, back);
    if (n.front) stack.push([n.front, front]);
    else for (const p of front) out.push(p);
    if (n.back) stack.push([n.back, back]);       // ohne Rückseite: verwerfen
  }
  return out;
}

function clipTo(node, other) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    n.polygons = clipPolygons(other, n.polygons);
    if (n.front) stack.push(n.front);
    if (n.back) stack.push(n.back);
  }
}

function invert(node) {
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const p of n.polygons) flipPoly(p);
    if (n.plane) n.plane = [-n.plane[0], -n.plane[1], -n.plane[2], -n.plane[3]];
    const t = n.front; n.front = n.back; n.back = t;
    if (n.front) stack.push(n.front);
    if (n.back) stack.push(n.back);
  }
}

function allPolygons(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    for (const p of n.polygons) out.push(p);
    if (n.front) stack.push(n.front);
    if (n.back) stack.push(n.back);
  }
  return out;
}

/* ── Umwandlung Dreieckssuppe ↔ Polygone ─────────────────────── */

function toPolys(tris) {
  const out = [];
  for (let i = 0; i < tris.length; i += 9) {
    const p = makePoly([
      tris[i], tris[i + 1], tris[i + 2],
      tris[i + 3], tris[i + 4], tris[i + 5],
      tris[i + 6], tris[i + 7], tris[i + 8]
    ]);
    if (p) out.push(p);
  }
  return out;
}

function toTris(polys) {
  let n = 0;
  for (const p of polys) n += p.v.length / 3 - 2;
  const out = new Float64Array(n * 9);
  let k = 0;
  for (const p of polys) {
    const v = p.v, m = v.length / 3;
    for (let i = 1; i < m - 1; i++) {            // Fächer-Triangulierung (konvex)
      out[k++] = v[0]; out[k++] = v[1]; out[k++] = v[2];
      out[k++] = v[i * 3]; out[k++] = v[i * 3 + 1]; out[k++] = v[i * 3 + 2];
      out[k++] = v[(i + 1) * 3]; out[k++] = v[(i + 1) * 3 + 1]; out[k++] = v[(i + 1) * 3 + 2];
    }
  }
  return out.subarray(0, k);
}

/* Bewusst werden hier KEINE dünnen Splitter weggeworfen: jedes entfernte
   Dreieck reißt drei Kanten auf, und ein fehlendes Dreieck lässt sich
   später nicht mehr als T-Stoß reparieren. Das Aufräumen (entartete
   Dreiecke, T-Stöße) macht cleanMesh() in js/mesh.js, dort ist es
   topologisch sicher. */

/* ── Öffentliche Operationen ─────────────────────────────────── */

function op(a, b, kind) {
  const A = newNode(), B = newNode();
  build(A, toPolys(a));
  build(B, toPolys(b));

  if (kind === 'subtract') {
    invert(A);
    clipTo(A, B); clipTo(B, A);
    invert(B); clipTo(B, A); invert(B);
    build(A, allPolygons(B));
    invert(A);
  } else if (kind === 'union') {
    clipTo(A, B); clipTo(B, A);
    invert(B); clipTo(B, A); invert(B);
    build(A, allPolygons(B));
  } else {                                        // intersect
    invert(A);
    clipTo(B, A); invert(B);
    clipTo(A, B); clipTo(B, A);
    build(A, allPolygons(B));
    invert(A);
  }
  return toTris(allPolygons(A));
}

export const subtract  = (a, b) => op(a, b, 'subtract');
export const union     = (a, b) => op(a, b, 'union');
export const intersect = (a, b) => op(a, b, 'intersect');

