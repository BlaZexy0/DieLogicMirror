/* Binäres glTF lesen — nur so viel, wie die Bauteil-Werkzeuge brauchen:
   die Dreiecke. Materialien, Texturen, Animationen und Erweiterungen
   werden übergangen.

   Warum nicht der GLTFLoader aus vendor/: der braucht DOM und
   XMLHttpRequest. Dieses Modul kommt mit einem ArrayBuffer aus, läuft
   damit auch unter Node — und genau dadurch prüfen die Tests dieselben
   Dateien, die der Browser lädt. Der Formaufbau-Viewer lädt weiterhin
   mit dem GLTFLoader, denn dort werden Materialnamen und Gruppen
   gebraucht.

   Unterstützt: mehrere Meshes, indiziert und nicht indiziert, verteilte
   und verschachtelte (byteStride) Puffer, Knotentransformationen als
   Matrix oder als Translation/Rotation/Skalierung. */

const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const GET = {
  5120: (dv, o) => dv.getInt8(o),
  5121: (dv, o) => dv.getUint8(o),
  5122: (dv, o) => dv.getInt16(o, true),
  5123: (dv, o) => dv.getUint16(o, true),
  5125: (dv, o) => dv.getUint32(o, true),
  5126: (dv, o) => dv.getFloat32(o, true)
};
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

/** Kopf und Blöcke eines GLB zerlegen. */
function chunks(buffer) {
  const dv = new DataView(buffer);
  if (dv.byteLength < 20 || dv.getUint32(0, true) !== 0x46546c67) {
    throw new Error('Keine glTF-Binärdatei (Kennung fehlt)');
  }
  if (dv.getUint32(4, true) !== 2) throw new Error('Nur glTF 2.0 wird gelesen');
  let json = null, bin = null, at = 12;
  const total = dv.getUint32(8, true);
  while (at + 8 <= Math.min(total, dv.byteLength)) {
    const len = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    const start = at + 8;
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, start, len)));
    else if (type === 0x004e4942) bin = { buffer, start, len };
    at = start + len;
  }
  if (!json) throw new Error('glTF ohne JSON-Block');
  return { json, bin };
}

/* Dieser Leser implementiert keine glTF-Erweiterung. Eine Datei, die eine
   VERLANGT (Draco, meshopt, …), liegt komprimiert vor: die Accessoren haben
   dann keinen bufferView, und die Norm-Regel „ohne bufferView ist alles
   null" lieferte stillschweigend ein nullgefülltes Netz — „0 Dreiecke ·
   0 × 0 × 0 mm · 0 cm³", ohne einen Hinweis. */
function checkExtensions(json) {
  const req = (json.extensionsRequired || []).filter(Boolean);
  if (req.length) {
    throw new Error('Diese Datei verlangt glTF-Erweiterungen, die hier nicht '
      + 'gelesen werden (' + req.join(', ') + '). Bitte unkomprimiert exportieren.');
  }
}

function readAccessor(json, bin, idx) {
  const acc = json.accessors[idx];
  const n = NUM[acc.type];
  const out = new Float64Array(acc.count * n);
  /* Sparse-Accessoren tragen ihre Werte in einem eigenen Block; ohne ihn zu
     lesen wäre das Ergebnis wieder ein stilles Nullnetz. */
  if (acc.sparse) throw new Error('Sparse-Accessoren werden nicht gelesen. Bitte unkomprimiert exportieren.');
  if (acc.bufferView === undefined) return out;          // laut Norm: alles null
  const bv = json.bufferViews[acc.bufferView];
  if (!bin) throw new Error('glTF ohne Binärblock');
  const size = SIZE[acc.componentType];
  const stride = bv.byteStride || n * size;
  const base = bin.start + (bv.byteOffset || 0) + (acc.byteOffset || 0);
  const dv = new DataView(bin.buffer);
  const get = GET[acc.componentType];
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) out[i * n + c] = get(dv, base + i * stride + c * size);
  }
  return out;
}

/* ── kleine 4×4-Matrix (spaltenweise wie in glTF) ────────────── */
const IDENT = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}

function fromTRS(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1
  ];
}

const nodeMatrix = node => node.matrix
  ? node.matrix.slice()
  : fromTRS(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);

const apply = (m, x, y, z) => [
  m[0] * x + m[4] * y + m[8] * z + m[12],
  m[1] * x + m[5] * y + m[9] * z + m[13],
  m[2] * x + m[6] * y + m[10] * z + m[14]
];

/* ── öffentliche Schnittstelle ───────────────────────────────── */

/** Alle Dreiecke einer GLB als { name, tris }-Liste (Weltkoordinaten). */
export function readGLBMeshes(buffer) {
  const { json, bin } = chunks(buffer);
  checkExtensions(json);
  const out = [];
  const scene = json.scenes && json.scenes[json.scene || 0];
  const roots = scene ? scene.nodes : (json.nodes || []).map((_, i) => i);
  const stack = roots.map(i => [i, IDENT]);
  while (stack.length) {
    const [ni, parent] = stack.pop();
    const node = json.nodes[ni];
    if (!node) continue;
    const m = mul(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.mode !== undefined && prim.mode !== 4) continue;   // nur Dreiecke
        const pos = readAccessor(json, bin, prim.attributes.POSITION);
        const idx = prim.indices !== undefined
          ? readAccessor(json, bin, prim.indices)
          : null;
        const n = idx ? idx.length : pos.length / 3;
        const tris = new Float64Array(n * 3);
        for (let i = 0; i < n; i++) {
          const v = idx ? idx[i] : i;
          const [x, y, z] = apply(m, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]);
          tris[i * 3] = x; tris[i * 3 + 1] = y; tris[i * 3 + 2] = z;
        }
        out.push({ name: node.name || json.meshes[node.mesh].name || 'mesh', tris });
      }
    }
    for (const c of node.children || []) stack.push([c, m]);
  }
  return out;
}

/** Alles zu EINER Dreieckssuppe zusammenfassen. */
export function readGLB(buffer) {
  const meshes = readGLBMeshes(buffer);
  let n = 0;
  for (const m of meshes) n += m.tris.length;
  const out = new Float64Array(n);
  let k = 0;
  for (const m of meshes) { out.set(m.tris, k); k += m.tris.length; }
  if (!out.length) throw new Error('Die glTF-Datei enthält keine Dreiecke');
  return out;
}

/** Sieht der Puffer nach einer GLB aus? */
export const isGLB = buffer =>
  buffer.byteLength >= 12 && new DataView(buffer).getUint32(0, true) === 0x46546c67;
