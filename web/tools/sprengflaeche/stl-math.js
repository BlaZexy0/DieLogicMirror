/**
 * DieLogic – web/tools/sprengflaeche/stl-math.js
 * STL-Parsing (binär + ASCII) und Netz-Kennwerte, ohne DOM-Abhängigkeiten.
 * Dreiecke werden als Float32Array mit 9 Werten pro Dreieck gehalten
 * (x0,y0,z0, x1,y1,z1, x2,y2,z2) — Einheiten wie in der Datei (üblich: mm).
 */

/** Parst einen STL-ArrayBuffer (binär oder ASCII) zu einem Float32Array. */
function parseSTL(buffer) {
  if (buffer.byteLength >= 84) {
    const dv = new DataView(buffer);
    const n = dv.getUint32(80, true);
    if (84 + n * 50 === buffer.byteLength) return parseBinarySTL(dv, n);
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (/facet\s+normal/i.test(text) && /vertex/i.test(text)) return parseAsciiSTL(text);
  // Fallback: binär mit Anhang hinter den Dreiecksdaten (kommt vor)
  if (buffer.byteLength >= 84) {
    const dv = new DataView(buffer);
    const n = dv.getUint32(80, true);
    if (n > 0 && 84 + n * 50 <= buffer.byteLength) return parseBinarySTL(dv, n);
  }
  throw new Error('Kein gültiges STL-Format erkannt');
}

function parseBinarySTL(dv, n) {
  const tris = new Float32Array(n * 9);
  for (let i = 0; i < n; i++) {
    const base = 84 + i * 50 + 12;           // 12 Bytes Normale überspringen
    for (let k = 0; k < 9; k++) {
      tris[i * 9 + k] = dv.getFloat32(base + k * 4, true);
    }
  }
  return tris;
}

function parseAsciiSTL(text) {
  const re = /vertex\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)\s+([-+0-9.eE]+)/g;
  const vals = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    vals.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  const nTri = Math.floor(vals.length / 9);
  if (nTri === 0) throw new Error('Keine Dreiecke in der ASCII-STL gefunden');
  return Float32Array.from(vals.slice(0, nTri * 9));
}

/** Volumen über die Summe signierter Tetraeder (geschlossenes Netz vorausgesetzt). */
function meshVolume(tris) {
  let v6 = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ax = tris[i],     ay = tris[i + 1], az = tris[i + 2];
    const bx = tris[i + 3], by = tris[i + 4], bz = tris[i + 5];
    const cx = tris[i + 6], cy = tris[i + 7], cz = tris[i + 8];
    v6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  /* SIGNIERT zurückgeben. Der Betrag verdeckte, dass ein Netz nach innen
     zeigt oder inkonsistent gewickelt ist — beides liefert ein plausibles
     Volumen und damit eine plausible, falsche Masse. Der Aufrufer
     entscheidet, was er mit einem nicht-positiven Volumen macht. */
  return v6 / 6;
}

/** Oberfläche als Summe der Dreiecksflächen. */
function meshArea(tris) {
  let a = 0;
  for (let i = 0; i < tris.length; i += 9) {
    const ux = tris[i + 3] - tris[i], uy = tris[i + 4] - tris[i + 1], uz = tris[i + 5] - tris[i + 2];
    const vx = tris[i + 6] - tris[i], vy = tris[i + 7] - tris[i + 1], vz = tris[i + 8] - tris[i + 2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    a += Math.sqrt(cx * cx + cy * cy + cz * cz) / 2;
  }
  return a;
}

/** Bounding-Box des Netzes: { min:[x,y,z], max:[x,y,z] }. */
function meshBounds(tris) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < tris.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      const v = tris[i + k];
      if (v < min[k]) min[k] = v;
      if (v > max[k]) max[k] = v;
    }
  }
  return { min, max };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { parseSTL, meshVolume, meshArea, meshBounds };
}
