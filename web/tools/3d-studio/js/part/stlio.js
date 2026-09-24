/* STL lesen und schreiben. Lesen (parseSTL, Binär + ASCII) kommt jetzt aus
   DEM einen STL-Parser der Website, web/tools/sprengflaeche/stl-math.js —
   vorher stand hier eine zweite, mit der Zeit abweichende Abschrift ohne
   den Endlichkeits-Test für binäre Dateien (eine STL mit NaN-Koordinaten
   lief dort unbemerkt durch; siehe stl-math.js für den Befund). Dreiecke
   als Float-Array mit 9 Werten je Dreieck, Einheiten wie in der Datei
   (üblich mm); stl-math.js hält sie als Float32Array (die Datei selbst
   ist float32), hier weiter als Float64Array, wie es die Aufrufer dieses
   Moduls erwarten. STL kennt keine Einheiten und keine Farben — mehr als
   Dreiecke kommt hier also nicht an.

   Die Normalen aus der Datei werden bewusst NICHT übernommen: viele
   Exporte schreiben dort Nullen oder falsch orientierte Vektoren. Sie
   werden aus der Umlaufrichtung der Punkte neu gerechnet (js/mesh.js). */

import { parseSTL as parseSTLShared } from '../../../sprengflaeche/stl-math.js';

export function parseSTL(buffer) {
  return Float64Array.from(parseSTLShared(buffer));
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
