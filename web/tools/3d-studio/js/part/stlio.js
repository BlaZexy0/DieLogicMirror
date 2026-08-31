/* STL lesen und schreiben — dieselbe Konvention wie die
   Sprengflächenanalyse in DieLogic (web/tools/sprengflaeche/stl-math.js):
   Dreiecke als Float-Array mit 9 Werten je Dreieck, Einheiten wie in der
   Datei (üblich mm). STL kennt keine Einheiten und keine Farben — mehr
   als Dreiecke kommt hier also nicht an.

   Die Normalen aus der Datei werden bewusst NICHT übernommen: viele
   Exporte schreiben dort Nullen oder falsch orientierte Vektoren. Sie
   werden aus der Umlaufrichtung der Punkte neu gerechnet (js/mesh.js). */

export function parseSTL(buffer) {
  if (buffer.byteLength >= 84) {
    const dv = new DataView(buffer);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buffer.byteLength) return parseBinary(dv, n);
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (/facet\s+normal/i.test(text) && /vertex/i.test(text)) return parseAscii(text);
  if (buffer.byteLength >= 84) {                    // binär mit Anhang
    const dv = new DataView(buffer);
    const n = dv.getUint32(80, true);
    if (n > 0 && 84 + n * 50 <= buffer.byteLength) return parseBinary(dv, n);
  }
  throw new Error('Kein gültiges STL-Format erkannt');
}

function parseBinary(dv, n) {
  const tris = new Float64Array(n * 9);
  for (let i = 0; i < n; i++) {
    const base = 84 + i * 50 + 12;                  // 12 Byte Normale überspringen
    for (let k = 0; k < 9; k++) tris[i * 9 + k] = dv.getFloat32(base + k * 4, true);
  }
  return tris;
}

function parseAscii(text) {
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const vals = [];
  let m;
  while ((m = re.exec(text)) !== null) vals.push(+m[1], +m[2], +m[3]);
  const nTri = Math.floor(vals.length / 9);
  if (!nTri) throw new Error('Keine Dreiecke in der ASCII-STL gefunden');
  /* Der Ausdruck lässt Formen wie „1e" oder „---9" durch, die +x zu NaN
     machen. Übernommen wurden sie stumm — ein Netz aus NaN-Koordinaten
     rechnet danach überall weiter und liefert Unsinn statt einer Meldung. */
  const kaputt = vals.findIndex(v => !Number.isFinite(v));
  if (kaputt >= 0 && kaputt < nTri * 9) {
    throw new Error('Unlesbare Koordinate in der ASCII-STL (Punkt '
      + (Math.floor(kaputt / 3) + 1) + ') — die Datei ist beschädigt.');
  }
  return Float64Array.from(vals.slice(0, nTri * 9));
}

/** Binäres STL schreiben — für den Export der Offsetfläche (Kavität). */
export function writeSTL(tris, header = 'form3d') {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = new Uint8Array(buf, 0, 80);
  for (let i = 0; i < Math.min(header.length, 79); i++) head[i] = header.charCodeAt(i) & 0x7f;
  dv.setUint32(80, n, true);
  for (let i = 0; i < n; i++) {
    const s = i * 9, o = 84 + i * 50;
    const ux = tris[s + 3] - tris[s], uy = tris[s + 4] - tris[s + 1], uz = tris[s + 5] - tris[s + 2];
    const vx = tris[s + 6] - tris[s], vy = tris[s + 7] - tris[s + 1], vz = tris[s + 8] - tris[s + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / len, true);
    dv.setFloat32(o + 4, ny / len, true);
    dv.setFloat32(o + 8, nz / len, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, tris[s + k], true);
    dv.setUint16(o + 48, 0, true);
  }
  return buf;
}
