/* Fläche gleichen Abstands aus dem Rasterfeld ziehen — „Surface Nets".

   Aus dem Feld (js/part/field.js) wird die Fläche herausgeholt, auf der
   der gespeicherte Abstand genau δ beträgt. Verfahren: je Rasterzelle,
   deren acht Ecken nicht alle auf derselben Seite von δ liegen, entsteht
   EIN Punkt — der Mittelwert der Schnittpunkte auf den zwölf Kanten.
   Anschließend spannt jede Rasterkante mit Vorzeichenwechsel ein Viereck
   zwischen den vier Punkten der angrenzenden Zellen auf.

   Gegenüber Marching Cubes braucht das keine 256-Zeilen-Tabelle, liefert
   gleichmäßigere Dreiecke und ist geschlossen und mannigfaltig — für
   eine Offsetfläche genau richtig. Der Preis: scharfe Kanten werden
   leicht gerundet. Das ist bei einem Aufmaß ohnehin physikalisch
   richtig, denn ein Offset erzeugt an konvexen Kanten einen Radius in
   Höhe des Aufmaßes.

   Ausgabe: Dreieckssuppe wie überall im Projekt (9 Werte je Dreieck). */

/* Ecken der Zelle: Bit 0 = x, Bit 1 = y, Bit 2 = z. */
const CORNER = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]
];
const EDGES = [
  [0, 1], [2, 3], [4, 5], [6, 7],       // entlang x
  [0, 2], [1, 3], [4, 6], [5, 7],       // entlang y
  [0, 4], [1, 5], [2, 6], [3, 7]        // entlang z
];

export function surfaceNets(field, iso = 0) {
  const [nx, ny, nz] = field.dims;
  const d = field.data, h = field.h, o = field.origin;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  if (cx < 1 || cy < 1 || cz < 1) return new Float64Array(0);

  const cell = new Int32Array(cx * cy * cz).fill(-1);
  const vx = [], vy = [], vz = [];
  const g = new Float64Array(8);

  /* ── Punkte ── */
  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = d[((k + CORNER[c][2]) * ny + (j + CORNER[c][1])) * nx + (i + CORNER[c][0])];
          g[c] = v;
          if (v < iso) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;

        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
          const t = (iso - g[a]) / (g[b] - g[a]);
          sx += CORNER[a][0] + (CORNER[b][0] - CORNER[a][0]) * t;
          sy += CORNER[a][1] + (CORNER[b][1] - CORNER[a][1]) * t;
          sz += CORNER[a][2] + (CORNER[b][2] - CORNER[a][2]) * t;
          n++;
        }
        cell[(k * cy + j) * cx + i] = vx.length;
        vx.push(o[0] + (i + sx / n) * h);
        vy.push(o[1] + (j + sy / n) * h);
        vz.push(o[2] + (k + sz / n) * h);
      }
    }
  }
  if (!vx.length) return new Float64Array(0);

  /* ── Vierecke ──
     Jede Rasterkante mit Vorzeichenwechsel wird von vier Zellen umringt.
     Die Umlaufrichtung folgt dem Vorzeichen, damit die Normalen nach
     außen zeigen (wachsender Feldwert = außen). */
  const out = [];
  const at = (i, j, k) => cell[(k * cy + j) * cx + i];
  const quad = (a, b, c2, dd, flip) => {
    if (a < 0 || b < 0 || c2 < 0 || dd < 0) return;
    const p = [a, b, c2, dd];
    const q = flip ? [p[0], p[2], p[1]] : [p[0], p[1], p[2]];
    const r = flip ? [p[0], p[3], p[2]] : [p[0], p[2], p[3]];
    for (const tri of [q, r]) {
      for (const v of tri) out.push(vx[v], vy[v], vz[v]);
    }
  };

  for (let k = 0; k < cz; k++) {
    for (let j = 0; j < cy; j++) {
      for (let i = 0; i < cx; i++) {
        const v0 = d[(k * ny + j) * nx + i] < iso;
        if (i + 1 < nx && j > 0 && k > 0) {
          const v1 = d[(k * ny + j) * nx + i + 1] < iso;
          if (v0 !== v1) quad(at(i, j - 1, k - 1), at(i, j, k - 1), at(i, j, k), at(i, j - 1, k), !v0);
        }
        if (j + 1 < ny && i > 0 && k > 0) {
          const v1 = d[(k * ny + j + 1) * nx + i] < iso;
          if (v0 !== v1) quad(at(i - 1, j, k - 1), at(i, j, k - 1), at(i, j, k), at(i - 1, j, k), v0);
        }
        if (k + 1 < nz && i > 0 && j > 0) {
          const v1 = d[((k + 1) * ny + j) * nx + i] < iso;
          if (v0 !== v1) quad(at(i - 1, j - 1, k), at(i, j - 1, k), at(i, j, k), at(i - 1, j, k), !v0);
        }
      }
    }
  }
  return Float64Array.from(out);
}
