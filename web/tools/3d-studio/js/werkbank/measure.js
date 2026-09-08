/* Messgrößen aus Dreieckssuppen für die Auslegung — ohne Three.js, damit
   die Tests sie unter Node prüfen.

   Die SPRENGFLÄCHE ist die Projektion aller Kavitäten auf die Trennebene
   (hier z = 0). Die Summe der projizierten Dreiecksflächen taugt dafür
   nicht: eine geschlossene Hülle wirft jede Stelle zweimal (Ober- und
   Unterseite), und wo Bauteil, Anguss und Überläufe sich überlappen,
   zählte man doppelt. Deshalb wird die Projektion GERASTERT: jedes
   Dreieck malt seine Zellen in eine Maske, und die Fläche ist die Zahl
   der gesetzten Zellen mal Zellfläche — eine Vereinigung, keine Summe. */

/**
 * Projizierte Fläche der Vereinigung aller Suppen in der xy-Ebene, in mm².
 *   soups  Liste von Dreieckssuppen (9 Zahlen je Dreieck)
 *   cell   Zellkante in mm (wird angehoben, wenn das Raster zu groß würde)
 */
export function projectedAreaXY(soups, cell = 1) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const t of soups) {
    if (!t) continue;
    for (let i = 0; i < t.length; i += 3) {
      const x = t[i], y = t[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (!Number.isFinite(x0) || x1 <= x0 || y1 <= y0) return 0;
  const MAX = 4e6;
  let h = Math.max(cell, 1e-3);
  while (((x1 - x0) / h + 2) * ((y1 - y0) / h + 2) > MAX) h *= 1.5;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1;
  const mask = new Uint8Array(nx * ny);
  let count = 0;
  for (const t of soups) {
    if (!t) continue;
    for (let i = 0; i < t.length; i += 9) {
      const ax = t[i], ay = t[i + 1], bx = t[i + 3], by = t[i + 4], cx = t[i + 6], cy = t[i + 7];
      const area2 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area2) < 1e-12) continue;                   // steht senkrecht: keine Fläche in xy
      const s = area2 > 0 ? 1 : -1;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / h));
      const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / h));
      const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / h));
      const j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - y0) / h));
      for (let j = j0; j <= j1; j++) {
        const py = y0 + (j + 0.5) * h;
        for (let ii = i0; ii <= i1; ii++) {
          const idx = j * nx + ii;
          if (mask[idx]) continue;
          const px = x0 + (ii + 0.5) * h;
          const e0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * s;
          const e1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * s;
          const e2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * s;
          if (e0 >= 0 && e1 >= 0 && e2 >= 0) { mask[idx] = 1; count++; }
        }
      }
    }
  }
  return count * h * h;
}

/** Volumen eines Zylinders (Pressrest) in mm³. */
export const cylinderVolume = (d, t) => Math.PI * d * d / 4 * t;

/** Masse in kg aus einem Kavitätsvolumen in mm³ und einer Dichte in kg/m³. */
export const massOf = (mm3, rho) => (Number.isFinite(mm3) && Number.isFinite(rho) && rho > 0 ? mm3 * 1e-9 * rho : NaN);

/** Auf eine sinnvolle Stellenzahl runden — Eingabefelder wollen keine 14 Nachkommastellen. */
export function round(v, digits = 3) {
  if (!Number.isFinite(v)) return v;
  const k = Math.pow(10, digits);
  return Math.round(v * k) / k;
}
