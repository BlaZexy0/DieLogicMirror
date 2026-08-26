/* Primitive als Dreieckssuppen (Float64Array, 9 Werte je Dreieck) —
   dieselbe Darstellung wie js/mesh.js und js/csg.js.

   Warum eigene Primitive statt BoxGeometry/CylinderGeometry: die Form
   entsteht in js/components.js aus booleschen Operationen (Kavität,
   Bohrungen, Taschen). Dafür braucht es geschlossene, konsistent
   orientierte Netze und einen „aufgedickten" Zwilling jedes Körpers als
   Schneidwerkzeug (Parameter g = Luftspalt). Beides ist mit eigenen
   Bausteinen einfacher als mit den Three.js-Generatoren — und es läuft
   ohne Three.js, also auch in tests/ und tools/build-glb.mjs.

   Konvention: alles wird entlang +z um den Ursprung gebaut und mit
   place() gedreht/verschoben. Normalen zeigen nach außen. */

/* ── Bausteine ───────────────────────────────────────────────── */

function pushTri(a, p, q, r) {
  a.push(p[0], p[1], p[2], q[0], q[1], q[2], r[0], r[1], r[2]);
}

/** Quader, im Ursprung zentriert. g dickt allseitig auf. */
export function box(w, h, d, g = 0) {
  const x = w / 2 + g, y = h / 2 + g, z = d / 2 + g;
  const v = [
    [-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z],
    [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]
  ];
  const quads = [
    [0, 3, 2, 1],   // -z
    [4, 5, 6, 7],   // +z
    [0, 1, 5, 4],   // -y
    [1, 2, 6, 5],   // +x
    [2, 3, 7, 6],   // +y
    [3, 0, 4, 7]    // -x
  ];
  const out = [];
  for (const q of quads) {
    pushTri(out, v[q[0]], v[q[1]], v[q[2]]);
    pushTri(out, v[q[0]], v[q[2]], v[q[3]]);
  }
  return Float64Array.from(out);
}

/* Endquerschnitt beim Aufdicken mitziehen: wird ein Loft um gz verlängert,
   muss der neue Endquerschnitt auf der Verjüngung WEITERGEFÜHRT werden.
   Sonst wird das aufgedickte Werkzeug in der Mitte schmaler als das
   Original — und beim Ausschneiden bliebe ein hauchdünner Span stehen. */
function extrapolate(levels, i, gz, keys) {
  const cur = levels[i];
  const ref = levels[i === 0 ? 1 : levels.length - 2];
  const dz = cur.z - ref.z;
  const out = { ...cur, z: cur.z + (i === 0 ? -gz : gz) };
  if (Math.abs(dz) < 1e-12 || gz === 0) return out;
  const f = (i === 0 ? -gz : gz) / dz;                 // Anteil der Verlängerung
  for (const k of keys) out[k] = cur[k] + (cur[k] - ref[k]) * f;
  return out;
}

/* Rechteck-Querschnitte über z verbinden (Loft). levels aufsteigend nach
   z: { z, w, h, cx, cy }. Damit entstehen die entformbaren Körper —
   ein Querschnitt an der Trennebene, kleinere Querschnitte in beiden
   Hälften. */
export function rectLoft(levels, g = 0, gz = g) {
  const base = levels.map(s => ({ z: s.z, w: s.w, h: s.h, cx: s.cx || 0, cy: s.cy || 0 }));
  const KEYS = ['w', 'h', 'cx', 'cy'];
  const L = base.map((s, i) => {
    const e = (i === 0 || i === base.length - 1) ? extrapolate(base, i, gz, KEYS) : { ...s };
    return { z: e.z, w: e.w + 2 * g, h: e.h + 2 * g, cx: e.cx, cy: e.cy };
  });
  const ring = s => [
    [s.cx - s.w / 2, s.cy - s.h / 2, s.z],
    [s.cx + s.w / 2, s.cy - s.h / 2, s.z],
    [s.cx + s.w / 2, s.cy + s.h / 2, s.z],
    [s.cx - s.w / 2, s.cy + s.h / 2, s.z]
  ];
  const out = [];
  const first = ring(L[0]), last = ring(L[L.length - 1]);
  const cLo = [L[0].cx, L[0].cy, L[0].z];
  const cHi = [L[L.length - 1].cx, L[L.length - 1].cy, L[L.length - 1].z];
  for (let i = 0; i < 4; i++) {                       // Boden (−z)
    pushTri(out, cLo, first[(i + 1) % 4], first[i]);
  }
  for (let i = 0; i < 4; i++) {                       // Deckel (+z)
    pushTri(out, cHi, last[i], last[(i + 1) % 4]);
  }
  for (let k = 0; k < L.length - 1; k++) {            // Mantel
    const a = ring(L[k]), b = ring(L[k + 1]);
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      pushTri(out, a[i], a[j], b[j]);
      pushTri(out, a[i], b[j], b[i]);
    }
  }
  return Float64Array.from(out);
}

/* Runde Querschnitte über z verbinden: Zylinder, Kegelstumpf, Kernstift
   mit Entformschräge. levels aufsteigend: { z, r, cx, cy }. */
export function circLoft(levels, seg = 40, g = 0, gz = g) {
  const base = levels.map(s => ({ z: s.z, r: s.r, cx: s.cx || 0, cy: s.cy || 0 }));
  const KEYS = ['r', 'cx', 'cy'];
  const L = base.map((s, i) => {
    const e = (i === 0 || i === base.length - 1) ? extrapolate(base, i, gz, KEYS) : { ...s };
    return { z: e.z, r: e.r + g, cx: e.cx, cy: e.cy };
  });
  const ring = s => {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = 2 * Math.PI * i / seg;
      pts.push([s.cx + Math.cos(a) * s.r, s.cy + Math.sin(a) * s.r, s.z]);
    }
    return pts;
  };
  const out = [];
  const first = ring(L[0]), last = ring(L[L.length - 1]);
  const cLo = [L[0].cx, L[0].cy, L[0].z];
  const cHi = [L[L.length - 1].cx, L[L.length - 1].cy, L[L.length - 1].z];
  for (let i = 0; i < seg; i++) {
    pushTri(out, cLo, first[(i + 1) % seg], first[i]);
    pushTri(out, cHi, last[i], last[(i + 1) % seg]);
  }
  for (let k = 0; k < L.length - 1; k++) {
    const a = ring(L[k]), b = ring(L[k + 1]);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      pushTri(out, a[i], a[j], b[j]);
      pushTri(out, a[i], b[j], b[i]);
    }
  }
  return Float64Array.from(out);
}

/** Gerader Zylinder von z0 bis z1. */
export const cyl = (r, z0, z1, seg = 40, g = 0, gz = g) =>
  circLoft([{ z: z0, r }, { z: z1, r }], seg, g, gz);

/** Kugel im Ursprung (Verbinder der Rohrzüge). */
export function sphere(r, seg = 20, rings = 12, g = 0) {
  const R = r + g;
  const p = (i, j) => {
    const phi = Math.PI * j / rings, th = 2 * Math.PI * i / seg;
    return [R * Math.sin(phi) * Math.cos(th), R * Math.sin(phi) * Math.sin(th), R * Math.cos(phi)];
  };
  const out = [];
  for (let j = 0; j < rings; j++) {
    for (let i = 0; i < seg; i++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      if (j < rings - 1) pushTri(out, a, d, c);   // am Südpol entartet
      if (j > 0) pushTri(out, a, c, b);           // am Nordpol entartet
    }
  }
  return Float64Array.from(out);
}

/* ── Platzieren ──────────────────────────────────────────────── */

/* Lokales +z auf eine Weltachse drehen (echte Drehungen, Determinante
   +1 — sonst kippte die Orientierung der Normalen) und verschieben. */
const AXIS_MAP = {
  z:    (x, y, z) => [x, y, z],
  y:    (x, y, z) => [x, z, -y],
  x:    (x, y, z) => [z, y, -x],
  '-z': (x, y, z) => [x, -y, -z],
  '-y': (x, y, z) => [x, -z, y],
  '-x': (x, y, z) => [-z, y, x]
};

export function place(tris, axis = 'z', cx = 0, cy = 0, cz = 0) {
  const m = AXIS_MAP[axis];
  const out = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    const [x, y, z] = m(tris[i], tris[i + 1], tris[i + 2]);
    out[i] = x + cx; out[i + 1] = y + cy; out[i + 2] = z + cz;
  }
  return out;
}

export function translate(tris, dx, dy, dz) {
  const out = new Float64Array(tris.length);
  for (let i = 0; i < tris.length; i += 3) {
    out[i] = tris[i] + dx; out[i + 1] = tris[i + 1] + dy; out[i + 2] = tris[i + 2] + dz;
  }
  return out;
}

/** Mehrere Suppen aneinanderhängen (ohne boolesche Verschmelzung). */
export function concat(list) {
  const parts = list.filter(t => t && t.length);
  let n = 0;
  for (const t of parts) n += t.length;
  const out = new Float64Array(n);
  let k = 0;
  for (const t of parts) { out.set(t, k); k += t.length; }
  return out;
}

/* ── Rohrzug ─────────────────────────────────────────────────── */

/* Zylinder zwischen aufeinanderfolgenden Punkten, Kugeln an den Knicken —
   die Temperierkreise. Arbeitet direkt in Weltkoordinaten. */
export function pipe(points, d, seg = 20) {
  const r = d / 2;
  const parts = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const dir = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 1e-9) continue;
    const w = [dir[0] / len, dir[1] / len, dir[2] / len];
    /* Hilfsachse, die nicht parallel zu w liegt. */
    const h = Math.abs(w[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [w[1] * h[2] - w[2] * h[1], w[2] * h[0] - w[0] * h[2], w[0] * h[1] - w[1] * h[0]];
    const ul = Math.hypot(u[0], u[1], u[2]);
    u = [u[0] / ul, u[1] / ul, u[2] / ul];
    const v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const local = cyl(r, 0, len, seg);
    const out = new Float64Array(local.length);
    for (let k = 0; k < local.length; k += 3) {
      const lx = local[k], ly = local[k + 1], lz = local[k + 2];
      out[k]     = a[0] + u[0] * lx + v[0] * ly + w[0] * lz;
      out[k + 1] = a[1] + u[1] * lx + v[1] * ly + w[1] * lz;
      out[k + 2] = a[2] + u[2] * lx + v[2] * ly + w[2] * lz;
    }
    parts.push(out);
    if (i < points.length - 2) parts.push(translate(sphere(r, seg, 8), b[0], b[1], b[2]));
  }
  return concat(parts);
}
