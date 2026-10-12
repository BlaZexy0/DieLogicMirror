/* Geometrie der Simulation: aus mehreren Körpern (Bauteil, Anguss,
   Pressrest, Überläufe — je ein geschlossenes Dreiecksnetz in mm) die
   Flächen, die snappyHexMesh braucht.

   Die Körper überlappen sich (der Anguss steckt ein paar Millimeter im
   Bauteil und im Pressrest) oder berühren sich (Anschnittfläche des
   Angusses auf der Bauteilwand). Für das Netz zählt nur die VEREINIGUNG:
   ihr Rand ist die Formwand. Ein Stück Körperwand, das in einem anderen
   Körper liegt oder ihn von außen berührt, ist keine Wand — dort fließt die
   Schmelze durch. Statt einer Booleschen Vereinigung wird jedes Dreieck
   eingeordnet:
     wall      liegt außerhalb aller anderen Körper (oder auf deren Rand mit
               gleicher Orientierung: zwei Körper teilen sich die Trennebene)
     internal  liegt in einem anderen Körper oder berührt ihn gegensinnig
               (Anschnitt auf Bauteilwand) — snappyHexMesh bekommt diese
               Dreiecke als faceZone mit faceType internal: sie verfeinern,
               trennen aber nichts
   Dreiecke, die die Oberfläche eines anderen Körpers kreuzen (Ecken innen
   und außen), werden geviertelt, bis ihre Kanten unter einem Bruchteil der
   Zellgröße liegen; ihre Teile werden einzeln eingeordnet. Was dann an der
   Naht übersteht, ist kleiner als eine Zelle.

   Punkt-in-Körper: Strahl in +z mit Paritätszählung über ein xy-Raster der
   Dreiecke, drei leicht versetzte Strahlen, Mehrheit. „Auf dem Rand" (für
   Berührflächen) über ein 3D-Raster und den Abstand zum nächsten Dreieck.
   Alles in mm; reine Rechnung, kein DOM, kein three.js. */

const EPS_ON = 0.05;          // mm: näher am Rand eines anderen Körpers gilt als „auf dem Rand"

/* ── kleine Vektorhelfer auf Float64Array-Suppen (9 Werte je Dreieck) ── */
function triNormal(t, i) {
  const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2];
  const vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz);
  return l > 0 ? [nx / l, ny / l, nz / l, l / 2] : [0, 0, 0, 0];
}
export function bounds(t) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < t.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (t[i + a] < lo[a]) lo[a] = t[i + a];
      if (t[i + a] > hi[a]) hi[a] = t[i + a];
    }
  }
  return { lo, hi };
}
/** Volumen eines geschlossenen Netzes [mm³] (Divergenzsatz). */
export function volume(t) {
  let v = 0;
  for (let i = 0; i < t.length; i += 9) {
    v += (t[i] * (t[i + 4] * t[i + 8] - t[i + 5] * t[i + 7])
      - t[i + 1] * (t[i + 3] * t[i + 8] - t[i + 5] * t[i + 6])
      + t[i + 2] * (t[i + 3] * t[i + 7] - t[i + 4] * t[i + 6])) / 6;
  }
  return v;
}

/* ── Abfrage-Struktur je Körper ───────────────────────────────────── */
/** Ein Körper zum Abfragen: innen/außen und Abstand zum Rand. */
export function makeSolid(tris) {
  const n = tris.length / 9;
  const { lo, hi } = bounds(tris);
  const ext = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  /* xy-Raster für den Strahl in +z: etwa 4 Dreiecke je Zelle */
  const g2 = Math.max(1, Math.min(256, Math.round(Math.sqrt(n / 4))));
  const cx = Math.max(ext[0], 1e-9) / g2, cy = Math.max(ext[1], 1e-9) / g2;
  const cols = new Map();
  const key2 = (i, j) => i * 4099 + j;
  for (let f = 0; f < n; f++) {
    const o = f * 9;
    const x0 = Math.min(tris[o], tris[o + 3], tris[o + 6]), x1 = Math.max(tris[o], tris[o + 3], tris[o + 6]);
    const y0 = Math.min(tris[o + 1], tris[o + 4], tris[o + 7]), y1 = Math.max(tris[o + 1], tris[o + 4], tris[o + 7]);
    const i0 = Math.max(0, Math.floor((x0 - lo[0]) / cx)), i1 = Math.min(g2 - 1, Math.floor((x1 - lo[0]) / cx));
    const j0 = Math.max(0, Math.floor((y0 - lo[1]) / cy)), j1 = Math.min(g2 - 1, Math.floor((y1 - lo[1]) / cy));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = key2(i, j);
      let a = cols.get(k);
      if (!a) cols.set(k, (a = []));
      a.push(f);
    }
  }
  /* 3D-Raster für „auf dem Rand" */
  const h3 = Math.max(Math.cbrt(ext[0] * ext[1] * Math.max(ext[2], 1e-3) / Math.max(n, 1)) * 2, 0.5);
  const cells = new Map();
  const key3 = (i, j, k) => (i * 73856093) ^ (j * 19349663) ^ (k * 83492791);
  for (let f = 0; f < n; f++) {
    const o = f * 9;
    const b0 = [0, 1, 2].map(a => Math.floor((Math.min(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]) - EPS_ON - lo[a]) / h3));
    const b1 = [0, 1, 2].map(a => Math.floor((Math.max(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]) + EPS_ON - lo[a]) / h3));
    for (let i = b0[0]; i <= b1[0]; i++) for (let j = b0[1]; j <= b1[1]; j++) for (let k = b0[2]; k <= b1[2]; k++) {
      const kk = key3(i, j, k);
      let a = cells.get(kk);
      if (!a) cells.set(kk, (a = []));
      a.push(f);
    }
  }
  const normals = new Float64Array(n * 3);
  for (let f = 0; f < n; f++) { const nn = triNormal(tris, f * 9); normals.set(nn.slice(0, 3), f * 3); }
  const tbox = new Float64Array(n * 6);
  for (let f = 0; f < n; f++) for (let a = 0; a < 3; a++) {
    const o = f * 9;
    tbox[f * 6 + a] = Math.min(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]);
    tbox[f * 6 + 3 + a] = Math.max(tris[o + a], tris[o + 3 + a], tris[o + 6 + a]);
  }

  /* Strahl (px, py, pz) → +z: Anzahl der Durchstoßpunkte oberhalb pz. */
  function crossings(px, py, pz) {
    const i = Math.floor((px - lo[0]) / cx), j = Math.floor((py - lo[1]) / cy);
    if (i < 0 || j < 0 || i >= g2 || j >= g2) return 0;
    const list = cols.get(key2(i, j));
    if (!list) return 0;
    let c = 0;
    for (const f of list) {
      const o = f * 9;
      const ax = tris[o] - px, ay = tris[o + 1] - py, bx = tris[o + 3] - px, by = tris[o + 4] - py, qx = tris[o + 6] - px, qy = tris[o + 7] - py;
      /* Punkt im xy-Schatten des Dreiecks (Vorzeichen der drei Kanten) */
      const d1 = ax * by - ay * bx, d2 = bx * qy - by * qx, d3 = qx * ay - qy * ax;
      if (!((d1 > 0 && d2 > 0 && d3 > 0) || (d1 < 0 && d2 < 0 && d3 < 0))) continue;
      const s = d1 + d2 + d3;
      const z = (d2 * tris[o + 2] + d3 * tris[o + 5] + d1 * tris[o + 8]) / s;
      if (z > pz) c++;
    }
    return c;
  }
  const JIT = [[0.00137, 0.00071], [-0.00093, 0.00119], [0.00061, -0.00147]];
  function inside(p) {
    if (p[0] < lo[0] || p[1] < lo[1] || p[2] < lo[2] || p[0] > hi[0] || p[1] > hi[1] || p[2] > hi[2]) return false;
    let votes = 0;
    for (const [dx, dy] of JIT) if (crossings(p[0] + dx, p[1] + dy, p[2]) % 2 === 1) votes++;
    return votes >= 2;
  }
  /** Die Normalen ALLER Dreiecke näher als EPS_ON (leer: nicht am Rand).
      Nur das nächste zu nehmen, ging an Kanten schief: ein Stück der
      Bauteiloberseite 0,01 mm unter der Angussoberseite lag noch näher an
      der schrägen Seitenwand des Angusses und galt als „gegensinnig". */
  function onSurface(p) {
    const i = Math.floor((p[0] - lo[0]) / h3), j = Math.floor((p[1] - lo[1]) / h3), k = Math.floor((p[2] - lo[2]) / h3);
    const list = cells.get(key3(i, j, k));
    const out = [];
    if (!list) return out;
    for (const f of list) {
      if (onFacet(p, tris, f * 9, normals, f)) out.push([normals[f * 3], normals[f * 3 + 1], normals[f * 3 + 2]]);
    }
    return out;
  }
  /** Kommt die Oberfläche dem Quader (blo, bhi) nahe? Dann kann ein
      Dreieck darin sie kreuzen, auch wenn seine Ecken alle auf einer Seite
      liegen (ein großes Wanddreieck, durch dessen Mitte ein Anschnitt läuft). */
  function nearBox(blo, bhi) {
    for (let a = 0; a < 3; a++) if (bhi[a] < lo[a] - EPS_ON || blo[a] > hi[a] + EPS_ON) return false;
    const i0 = [0, 1, 2].map(a => Math.floor((blo[a] - EPS_ON - lo[a]) / h3));
    const i1 = [0, 1, 2].map(a => Math.floor((bhi[a] + EPS_ON - lo[a]) / h3));
    const nc = (i1[0] - i0[0] + 1) * (i1[1] - i0[1] + 1) * (i1[2] - i0[2] + 1);
    /* Großer Quader: nicht Zellen zählen, sondern die Dreiecke prüfen */
    if (nc > n) {
      for (let f = 0; f < n; f++) if (boxHit(f, blo, bhi)) return true;
      return false;
    }
    for (let i = i0[0]; i <= i1[0]; i++) for (let j = i0[1]; j <= i1[1]; j++) for (let k = i0[2]; k <= i1[2]; k++) {
      const list = cells.get(key3(i, j, k));
      if (list) for (const f of list) if (boxHit(f, blo, bhi)) return true;
    }
    return false;
  }
  /** Berührt oder kreuzt das Dreieck q (9 Werte) die Oberfläche? Exakt:
      Kanten von q durch ein Dreieck der Oberfläche, Kanten der Oberfläche
      durch q, Ecken näher als EPS_ON. */
  function touches(q) {
    const blo = [Math.min(q[0], q[3], q[6]), Math.min(q[1], q[4], q[7]), Math.min(q[2], q[5], q[8])];
    const bhi = [Math.max(q[0], q[3], q[6]), Math.max(q[1], q[4], q[7]), Math.max(q[2], q[5], q[8])];
    for (let a = 0; a < 3; a++) if (bhi[a] < lo[a] - EPS_ON || blo[a] > hi[a] + EPS_ON) return false;
    const i0 = [0, 1, 2].map(a => Math.floor((blo[a] - EPS_ON - lo[a]) / h3));
    const i1 = [0, 1, 2].map(a => Math.floor((bhi[a] + EPS_ON - lo[a]) / h3));
    const nc = (i1[0] - i0[0] + 1) * (i1[1] - i0[1] + 1) * (i1[2] - i0[2] + 1);
    const tested = new Set();
    const test = f => {
      if (tested.has(f)) return false;
      tested.add(f);
      return boxHit(f, blo, bhi) && triTouch(q, 0, tris, f * 9);
    };
    if (nc > n) { for (let f = 0; f < n; f++) if (test(f)) return true; return false; }
    for (let i = i0[0]; i <= i1[0]; i++) for (let j = i0[1]; j <= i1[1]; j++) for (let k = i0[2]; k <= i1[2]; k++) {
      const list = cells.get(key3(i, j, k));
      if (list) for (const f of list) if (test(f)) return true;
    }
    return false;
  }
  function boxHit(f, blo, bhi) {
    for (let a = 0; a < 3; a++) if (tbox[f * 6 + 3 + a] < blo[a] - EPS_ON || tbox[f * 6 + a] > bhi[a] + EPS_ON) return false;
    return true;
  }
  return { tris, lo, hi, inside, onSurface, nearBox, touches, volume: volume(tris) };
}

/* Liegt p AUF dem Dreieck: höchstens EPS_ON vor oder hinter seiner Ebene
   und mit dem Lot innerhalb des Dreiecks? Nur die Nähe zu einer Kante
   reicht nicht: an der Kante, wo das Ende des Angusses auf die gebogene Wand
   des Pressrests trifft, galt sonst ein Stück Pressrestwand neben dem
   Anguss als „berührt" — es wurde innen, und die Wand hatte ein Loch. */
function onFacet(p, t, o, normals, f) {
  const nx = normals[f * 3], ny = normals[f * 3 + 1], nz = normals[f * 3 + 2];
  const dx = p[0] - t[o], dy = p[1] - t[o + 1], dz = p[2] - t[o + 2];
  const h = dx * nx + dy * ny + dz * nz;
  if (Math.abs(h) > EPS_ON) return false;
  const q = [p[0] - h * nx, p[1] - h * ny, p[2] - h * nz];
  /* baryzentrisch, mit einem Hauch Spiel für Punkte auf gemeinsamen Kanten */
  const e1 = [t[o + 3] - t[o], t[o + 4] - t[o + 1], t[o + 5] - t[o + 2]], e2 = [t[o + 6] - t[o], t[o + 7] - t[o + 1], t[o + 8] - t[o + 2]];
  const w = [q[0] - t[o], q[1] - t[o + 1], q[2] - t[o + 2]];
  const d00 = e1[0] * e1[0] + e1[1] * e1[1] + e1[2] * e1[2], d01 = e1[0] * e2[0] + e1[1] * e2[1] + e1[2] * e2[2], d11 = e2[0] * e2[0] + e2[1] * e2[1] + e2[2] * e2[2];
  const d20 = w[0] * e1[0] + w[1] * e1[1] + w[2] * e1[2], d21 = w[0] * e2[0] + w[1] * e2[1] + w[2] * e2[2];
  const den = d00 * d11 - d01 * d01;
  if (!(den > 0)) return false;
  const v = (d11 * d20 - d01 * d21) / den, u = (d00 * d21 - d01 * d20) / den;
  const tol = 1e-6;
  return v >= -tol && u >= -tol && v + u <= 1 + tol;
}

/* Abstand Punkt–Dreieck (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTriDist(p, t, o) {
  const a = [t[o], t[o + 1], t[o + 2]], b = [t[o + 3], t[o + 4], t[o + 5]], c = [t[o + 6], t[o + 7], t[o + 8]];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) q = b;
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]; }
      else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c;
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              q = [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])];
            } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
            }
          }
        }
      }
    }
  }
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/* Zwei Dreiecke berühren oder schneiden sich (Toleranz EPS_ON). Zwei
   gleichsinnig aufeinanderliegende zählen nicht: ein Stück auf dem Rand
   eines anderen Körpers mit gleicher Orientierung bleibt ohnehin Wand
   (die gemeinsame Trennebene). */
function triTouch(a, oa, b, ob) {
  const na = triNormal(a, oa), nb = triNormal(b, ob);
  if (na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2] > 0.999) {
    const off = (b[ob] - a[oa]) * na[0] + (b[ob + 1] - a[oa + 1]) * na[1] + (b[ob + 2] - a[oa + 2]) * na[2];
    if (Math.abs(off) <= EPS_ON) return false;
  }
  for (let v = 0; v < 3; v++) {
    if (pointTriDist([a[oa + v * 3], a[oa + v * 3 + 1], a[oa + v * 3 + 2]], b, ob) <= EPS_ON) return true;
    if (pointTriDist([b[ob + v * 3], b[ob + v * 3 + 1], b[ob + v * 3 + 2]], a, oa) <= EPS_ON) return true;
  }
  for (let e = 0; e < 3; e++) {
    const e1 = (e + 1) % 3;
    if (segTri(a, oa + e * 3, oa + e1 * 3, b, ob)) return true;
    if (segTri(b, ob + e * 3, ob + e1 * 3, a, oa)) return true;
  }
  return false;
}
/* Strecke p→q (Punkte in s ab ip, iq) durch das Dreieck t ab ot? */
function segTri(s, ip, iq, t, ot) {
  const ax = t[ot], ay = t[ot + 1], az = t[ot + 2];
  const e1 = [t[ot + 3] - ax, t[ot + 4] - ay, t[ot + 5] - az], e2 = [t[ot + 6] - ax, t[ot + 7] - ay, t[ot + 8] - az];
  const d = [s[iq] - s[ip], s[iq + 1] - s[ip + 1], s[iq + 2] - s[ip + 2]];
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(det) < 1e-12) return false;
  const inv = 1 / det;
  const w = [s[ip] - ax, s[ip + 1] - ay, s[ip + 2] - az];
  const u = (w[0] * h[0] + w[1] * h[1] + w[2] * h[2]) * inv;
  if (u < 0 || u > 1) return false;
  const qv = [w[1] * e1[2] - w[2] * e1[1], w[2] * e1[0] - w[0] * e1[2], w[0] * e1[1] - w[1] * e1[0]];
  const v = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) * inv;
  if (v < 0 || u + v > 1) return false;
  const tt = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) * inv;
  return tt >= 0 && tt <= 1;
}

/* ── Einordnen ────────────────────────────────────────────────────── */
const OUT = 0, IN = 1, ON_SAME = 2, ON_OPP = 3, ON_EDGE = 4;
/* Am Rand eines anderen Körpers entscheidet die Orientierung: liegt eines
   der nahen Dreiecke gleichsinnig (gemeinsame Trennebene), bleibt es Wand;
   liegt eines deutlich gegensinnig (Anschnitt auf der Bauteilwand), ist es
   Durchgang; nur quer stehende Nachbarn (eine Kante) entscheiden nichts —
   dann zählt innen/außen. */
const SAME = 0.7;
function classify(p, n, others) {
  let res = OUT;
  for (const s of others) {
    const near = s.onSurface(p);
    if (near.length) {
      let same = false, opp = false;
      for (const sn of near) {
        const d = sn[0] * n[0] + sn[1] * n[1] + sn[2] * n[2];
        if (d > SAME) same = true; else if (d < -SAME) opp = true;
      }
      if (same) { res = ON_SAME; continue; }   // gemeinsamer Außenrand
      if (opp) return ON_OPP;                   // gegensinnig berührt: Durchgang
      /* nur quer liegende Flächen: der Punkt liegt AUF dem Rand des anderen
         Körpers (die Ecke einer Anschnittöffnung auf Ober- oder Unterseite
         des Angusses) — nicht außen; die Strahlprobe wäre hier Zufall */
      if (res === OUT) res = ON_EDGE;
      continue;
    }
    if (s.inside(p)) return IN;
  }
  return res;
}

/**
 * Die Körper zur Formwand der Vereinigung.
 * @param bodies [{ name, tris (Float64Array, mm), labels? (Int32Array je Dreieck: 0 = Wand,
 *               1 = Einlass, 2… = Auslass i−1) }]
 * @param opts   { maxEdge: mm — Kantenlänge, bis zu der kreuzende Dreiecke geteilt werden }
 * → { patches: Map(label → Float64Array), internal: Float64Array, stats }
 */
/**
 * Die Schalen eines Netzes: zusammenhängend über Kanten mit genau zwei
 * Dreiecken. Ein Körper aus mehreren geschlossenen, sich überlappenden
 * Schalen (der Anguss des Designers: Äste, die sich an der Verzweigung
 * durchdringen; zwei Anschnittzungen nebeneinander) ist für die
 * Innen-Probe per Strahlparität kein Körper — ein Punkt in zwei Schalen
 * zählt vier Durchstöße und gilt als außen. Als einzelne Schalen
 * eingeordnet, ist die Überlappung eine wie zwischen zwei Körpern.
 * → [Int32Array der Dreiecke je Schale]
 */
export function shells(t) {
  const n = t.length / 9;
  const key = o => Math.round(t[o] * 1e4) + ',' + Math.round(t[o + 1] * 1e4) + ',' + Math.round(t[o + 2] * 1e4);
  const edges = new Map();
  for (let f = 0; f < n; f++) for (let c = 0; c < 3; c++) {
    const a = key(f * 9 + c * 3), b = key(f * 9 + ((c + 1) % 3) * 3);
    if (a === b) continue;
    const k = a < b ? a + '|' + b : b + '|' + a;
    let l = edges.get(k);
    if (!l) edges.set(k, (l = []));
    l.push(f);
  }
  const parent = Int32Array.from({ length: n }, (_, i) => i);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const l of edges.values()) if (l.length === 2) { const a = find(l[0]), b = find(l[1]); if (a !== b) parent[a] = b; }
  const groups = new Map();
  for (let f = 0; f < n; f++) { const r = find(f); let g = groups.get(r); if (!g) groups.set(r, (g = [])); g.push(f); }
  return [...groups.values()].map(g => Int32Array.from(g));
}

export function unionSurfaces(input, { maxEdge = 0.5 } = {}) {
  /* Jeder Körper in seine Schalen (shells); eingeordnet wird je Schale,
     gezählt wird je Körper (owner). Splitter-Schalen unter vier Dreiecken
     (lose Dreiecke) bleiben beim größten Teil ihres Körpers. */
  const bodies = [], owner = [];
  input.forEach((b, bi) => {
    const parts = shells(b.tris);
    const big = parts.filter(p => p.length >= 4);
    const use = big.length > 1 ? big : [null];
    for (const p of use) {
      if (!p) { bodies.push(b); owner.push(bi); continue; }
      const tris = new Float64Array(p.length * 9), labels = b.labels ? new Int32Array(p.length) : null;
      p.forEach((f, i) => { tris.set(b.tris.subarray(f * 9, f * 9 + 9), i * 9); if (labels) labels[i] = b.labels[f]; });
      bodies.push(Object.assign({}, b, { tris, labels }));
      owner.push(bi);
    }
  });
  const solids = bodies.map(b => makeSolid(b.tris));
  /* Feinheit je Körper (body.maxEdge, sonst die gemeinsame): an einer Naht
     zweier Körper zählt die feinere — die Naht Überlauf/Bauteil braucht die
     Zelle des Überlaufs, die Naht Anguss/Bauteil nicht. */
  bodies.forEach((b, i) => { solids[i].maxEdge = b.maxEdge > 0 ? b.maxEdge : maxEdge; });
  const out = new Map();                       // label → number[]
  const internal = [];
  const stats = { wall: 0, internal: 0, split: 0, touching: 0, internalArea: input.map(() => 0), shells: bodies.length };
  const push = (label, t, o) => {
    let a = out.get(label);
    if (!a) out.set(label, (a = []));
    for (let k = 0; k < 9; k++) a.push(t[o + k]);
  };
  bodies.forEach((b, bi) => {
    const others = solids.filter((_, j) => j !== bi);
    const t = b.tris, n = t.length / 9;
    /* Ohne andere Körper in Reichweite ist alles Wand. */
    const near = others.filter(s => overlaps(solids[bi], s));
    for (let f = 0; f < n; f++) {
      const label = b.labels ? b.labels[f] : 0;
      if (!near.length) { push(label, t, f * 9); stats.wall++; continue; }
      place(t.subarray(f * 9, f * 9 + 9), label, near, 0, bi);
    }
  });
  function place(tri, label, near, depth, bi) {
    const nn = triNormal(tri, 0);
    if (nn[3] === 0) return;
    const nrm = nn.slice(0, 3);
    const v = [0, 3, 6].map(o => classify([tri[o], tri[o + 1], tri[o + 2]], nrm, near));
    const hasIn = v.some(c => c === IN), hasOut = v.some(c => c === OUT);
    const edge = Math.max(dist(tri, 0, 3), dist(tri, 3, 6), dist(tri, 6, 0));
    /* Teilen, wo das Dreieck eine andere Oberfläche kreuzen KANN: gemischte
       Ecken, oder eine andere Oberfläche, die es berührt — bis zur Feinheit
       der feineren Seite dieser Naht. */
    const own = solids[bi].maxEdge;
    let limit = Infinity;
    if (edge > Math.min(own, ...near.map(s => s.maxEdge)) && depth < 40) {
      if (hasIn && hasOut) limit = Math.min(own, ...near.map(s => s.maxEdge));
      else for (const s of near) { const l = Math.min(own, s.maxEdge); if (edge > l && l < limit && s.touches(tri)) limit = l; }
    }
    const split = edge > limit;
    if (split) {
      stats.split++;
      for (const sub of bisect(tri)) place(sub, label, near, depth + 1, bi);
      return;
    }
    const c = classify([(tri[0] + tri[3] + tri[6]) / 3, (tri[1] + tri[4] + tri[7]) / 3, (tri[2] + tri[5] + tri[8]) / 3], nrm, near);
    /* Innen nur, was GANZ innen liegt (Mitte und alle Ecken). Ein Stück, das
       über den Rand eines anderen Körpers ragt, bleibt Wand: eine Finne von
       Bruchteilen der Zelle schadet nicht, ein Schlitz in der Wand schon —
       snappyHexMesh läuft durch jeden Spalt, durch den eine Verbindung
       zweier Zellmitten passt. */
    /* Mitte innen (oder gegensinnig berührt), keine Ecke außen — Ecken auf
       dem Rand des anderen Körpers zählen nicht als außen (sonst blieben an
       Ober- und Unterseite eines Anschnitts Wandstreifen stehen, und ein
       4 mm hoher Anschnitt schloss sich bei 2 mm Zellen ganz) */
    if ((c === IN || c === ON_OPP) && v.every(x => x !== OUT)) {
      /* Ein Einlass/Auslass im Innern eines anderen Körpers wäre keiner. */
      for (let k = 0; k < 9; k++) internal.push(tri[k]);
      stats.internal++;
      stats.internalArea[owner[bi]] += nn[3];
      if (c === ON_OPP) stats.touching++;
    } else {
      push(label, tri, 0);
      stats.wall++;
    }
  }
  const patches = new Map([...out].map(([k, a]) => [k, Float64Array.from(a)]));
  return { patches, internal: Float64Array.from(internal), stats };
}
function overlaps(a, b) {
  for (let k = 0; k < 3; k++) if (a.hi[k] < b.lo[k] - EPS_ON || b.hi[k] < a.lo[k] - EPS_ON) return false;
  return true;
}
function dist(t, i, j) { return Math.hypot(t[i] - t[j], t[i + 1] - t[j + 1], t[i + 2] - t[j + 2]); }
/* An der längsten Kante halbieren: aus einem Splitter werden so Stücke
   seiner Länge nach, nicht 4ⁿ Splitter. */
function bisect(t) {
  const l = [dist(t, 0, 3), dist(t, 3, 6), dist(t, 6, 0)];
  const e = l[0] >= l[1] && l[0] >= l[2] ? 0 : l[1] >= l[2] ? 1 : 2;
  const i = e * 3, j = ((e + 1) % 3) * 3, k = ((e + 2) % 3) * 3;
  const m = [(t[i] + t[j]) / 2, (t[i + 1] + t[j + 1]) / 2, (t[i + 2] + t[j + 2]) / 2];
  const P = o => [t[o], t[o + 1], t[o + 2]];
  return [Float64Array.from([...P(i), ...m, ...P(k)]), Float64Array.from([...m, ...P(j), ...P(k)])];
}

/* ── Flächen auswählen ───────────────────────────────────────────── */
/** Kantennachbarn je Dreieck über gemeinsame Eckpunkte (auf 1e-4 mm gerundet). */
export function neighbours(t) {
  const n = t.length / 9;
  const key = (o) => Math.round(t[o] * 1e4) + ',' + Math.round(t[o + 1] * 1e4) + ',' + Math.round(t[o + 2] * 1e4);
  const vid = new Map();
  const tv = new Int32Array(n * 3);
  for (let f = 0; f < n; f++) for (let c = 0; c < 3; c++) {
    const k = key(f * 9 + c * 3);
    let id = vid.get(k);
    if (id === undefined) vid.set(k, (id = vid.size));
    tv[f * 3 + c] = id;
  }
  const edges = new Map();
  const nbr = Array.from({ length: n }, () => []);
  for (let f = 0; f < n; f++) for (let c = 0; c < 3; c++) {
    const a = tv[f * 3 + c], b = tv[f * 3 + (c + 1) % 3];
    const k = a < b ? a + '_' + b : b + '_' + a;
    const g = edges.get(k);
    if (g === undefined) edges.set(k, f);
    else { nbr[f].push(g); nbr[g].push(f); }
  }
  return nbr;
}

/**
 * Die ebene Fläche um ein Dreieck: Nachbarn mit (fast) gleicher Normale in
 * (fast) derselben Ebene. → { faces: number[], area mm², centroid, normal
 * (nach außen), radius (Kreis gleicher Fläche), circularity (0…1: Fläche
 * zum Umkreis um den Schwerpunkt) }
 */
export function planarRegion(t, nbr, seed, { angleDeg = 2, planeTol = 0.05 } = {}) {
  const n0 = triNormal(t, seed * 9);
  const cos = Math.cos(angleDeg * Math.PI / 180);
  const d0 = n0[0] * t[seed * 9] + n0[1] * t[seed * 9 + 1] + n0[2] * t[seed * 9 + 2];
  const seen = new Set([seed]);
  const stack = [seed];
  const faces = [];
  while (stack.length) {
    const f = stack.pop();
    faces.push(f);
    for (const g of nbr[f]) {
      if (seen.has(g)) continue;
      seen.add(g);
      const ng = triNormal(t, g * 9);
      if (ng[0] * n0[0] + ng[1] * n0[1] + ng[2] * n0[2] < cos) continue;
      let off = 0;
      for (let c = 0; c < 3; c++) off = Math.max(off, Math.abs(n0[0] * t[g * 9 + c * 3] + n0[1] * t[g * 9 + c * 3 + 1] + n0[2] * t[g * 9 + c * 3 + 2] - d0));
      if (off > planeTol) continue;
      stack.push(g);
    }
  }
  return describeRegion(t, faces, n0.slice(0, 3));
}
export function describeRegion(t, faces, normal) {
  let A = 0;
  const c = [0, 0, 0];
  for (const f of faces) {
    const a = triNormal(t, f * 9)[3];
    A += a;
    for (let k = 0; k < 3; k++) c[k] += a * (t[f * 9 + k] + t[f * 9 + 3 + k] + t[f * 9 + 6 + k]) / 3;
  }
  if (A > 0) for (let k = 0; k < 3; k++) c[k] /= A;
  let rmax = 0;
  for (const f of faces) for (let v = 0; v < 3; v++) {
    const o = f * 9 + v * 3;
    rmax = Math.max(rmax, Math.hypot(t[o] - c[0], t[o + 1] - c[1], t[o + 2] - c[2]));
  }
  const radius = Math.sqrt(A / Math.PI);
  return { faces, area: A, centroid: c, normal, radius, rmax, circularity: rmax > 0 ? A / (Math.PI * rmax * rmax) : 0 };
}

/**
 * Der Vorschlag für den Einlass: die größte ebene, annähernd kreisrunde
 * Fläche eines Körpers (beim Pressrest die große Kreisfläche zur Kammer).
 */
export function suggestInlet(t, nbr = neighbours(t)) {
  const n = t.length / 9, used = new Uint8Array(n);
  let best = null;
  for (let f = 0; f < n; f++) {
    if (used[f]) continue;
    const r = planarRegion(t, nbr, f);
    for (const g of r.faces) used[g] = 1;
    if (r.circularity < 0.8) continue;
    if (!best || r.area > best.area) best = r;
  }
  return best;
}

/** Tiefe eines Körpers ab einer Fläche entgegen ihrer Außennormale [mm]:
    so weit reicht der Schmelzezylinder hinein (der Pressrest). */
export function depthAlong(t, centroid, normal) {
  let dmax = 0;
  for (let i = 0; i < t.length; i += 3) {
    const d = -((t[i] - centroid[0]) * normal[0] + (t[i + 1] - centroid[1]) * normal[1] + (t[i + 2] - centroid[2]) * normal[2]);
    if (d > dmax) dmax = d;
  }
  return dmax;
}

/**
 * Wandstärke eines Körpers [mm], grob: von Stichproben-Dreiecken ein Strahl
 * nach innen bis zur Gegenwand. → { p10, median } — die dünnen Stellen
 * zählen fürs Netz (zwei, besser drei Zellen über die Dicke).
 */
export function thickness(t, samples = 400) {
  const n = t.length / 9;
  if (!n) return { p10: NaN, median: NaN };
  /* Stichproben nach Fläche: große ebene Wände (die dünne Richtung einer
     Platte) zählen, wie sie im Körper vorkommen, nicht nach Dreieckszahl. */
  const cum = new Float64Array(n);
  let A = 0;
  for (let f = 0; f < n; f++) { A += triNormal(t, f * 9)[3]; cum[f] = A; }
  const d = [];
  for (let k = 0; k < samples; k++) {
    const target = (k + 0.5) / samples * A;
    let lo = 0, hi = n - 1;
    while (lo < hi) { const m = (lo + hi) >> 1; if (cum[m] < target) lo = m + 1; else hi = m; }
    const f = lo, nn = triNormal(t, f * 9);
    if (nn[3] === 0) continue;
    /* ein Punkt im Dreieck (nicht der Schwerpunkt: bei Fächern liegen viele gleich) */
    const a = ((k * 0.618034) % 1) * 0.8 + 0.1, b = (1 - a) * (((k * 0.414214) % 1) * 0.8 + 0.1);
    const c = [0, 1, 2].map(i => t[f * 9 + i] * (1 - a - b) + t[f * 9 + 3 + i] * a + t[f * 9 + 6 + i] * b);
    const dir = [-nn[0], -nn[1], -nn[2]];
    let best = Infinity;
    for (let g = 0; g < n; g++) {
      if (g === f) continue;
      const hit = rayTri(c, dir, t, g * 9);
      if (hit > 1e-6 && hit < best) best = hit;
    }
    if (isFinite(best)) d.push(best);
  }
  d.sort((x, y) => x - y);
  /* p02: die dünnsten 2 % — beim Anguss der Anschnitt, der wenig Fläche hat,
     aber die Geschwindigkeit bestimmt */
  return { p02: d[Math.floor(d.length * 0.02)] || NaN, p10: d[Math.floor(d.length * 0.1)] || NaN, median: d[Math.floor(d.length / 2)] || NaN };
}
function rayTri(o, d, t, ot) {
  const e1 = [t[ot + 3] - t[ot], t[ot + 4] - t[ot + 1], t[ot + 5] - t[ot + 2]], e2 = [t[ot + 6] - t[ot], t[ot + 7] - t[ot + 1], t[ot + 8] - t[ot + 2]];
  const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
  const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2];
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det, s = [o[0] - t[ot], o[1] - t[ot + 1], o[2] - t[ot + 2]];
  const u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) * inv;
  if (u < 0 || u > 1) return -1;
  const q = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
  const v = (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]) * inv;
  if (v < 0 || u + v > 1) return -1;
  return (e2[0] * q[0] + e2[1] * q[1] + e2[2] * q[2]) * inv;
}
/** Zusätzliche Verfeinerungsstufen, damit zwei Zellen über die Dicke passen. */
export function extraLevels(t10, cell) {
  if (!(t10 > 0) || !(cell > 0)) return 0;
  return Math.max(0, Math.min(3, Math.ceil(Math.log2(2 * cell / t10) - 1e-9)));
}

/**
 * Anschnittfläche [mm²]: die Bauteilwand, die im Anguss liegt oder ihn
 * gegensinnig berührt — dort tritt die Schmelze ins Bauteil. Aus der
 * Vereinigung von Bauteil(en) und Anguss allein (Überläufe zählen nicht).
 */
export function gateArea(parts, runners, maxEdge = 0.5) {
  if (!parts.length || !runners.length) return NaN;
  const r = unionSurfaces([...parts, ...runners].map(t => ({ tris: t })), { maxEdge });
  return r.stats.internalArea.slice(0, parts.length).reduce((a, b) => a + b, 0);
}

/** Kanten eines Netzes prüfen (Ecken auf 1e-4 mm gerundet): offen (ein
    Dreieck) und nicht-mannigfaltig (mehr als zwei). Geschlossen im Sinn von
    snappyHexMesh (refinementRegions mode inside) ist ein Netz nur ohne
    beide — der Angussdesigner liefert an Verzweigungen manchmal Kanten mit
    vier Dreiecken. → { open, nonManifold, closed } */
export function edgeCheck(t) {
  const key = o => Math.round(t[o] * 1e4) + ',' + Math.round(t[o + 1] * 1e4) + ',' + Math.round(t[o + 2] * 1e4);
  const m = new Map();
  for (let f = 0; f < t.length / 9; f++) for (let c = 0; c < 3; c++) {
    const a = key(f * 9 + c * 3), b = key(f * 9 + ((c + 1) % 3) * 3);
    if (a === b) continue;
    const k = a < b ? a + '|' + b : b + '|' + a;
    m.set(k, (m.get(k) || 0) + 1);
  }
  let open = 0, nonManifold = 0;
  for (const c of m.values()) { if (c === 1) open++; else if (c > 2) nonManifold++; }
  return { open, nonManifold, closed: open === 0 && nonManifold === 0 };
}
