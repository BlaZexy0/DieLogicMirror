/* Nachbarsuche in JavaScript: ein gleichmäßiges Gitter über den
   Rechenraum, Zellkante = Trägerradius 2h, die Partikel je Zelle
   zählend einsortiert (Counting Sort — zwei Durchläufe, keine
   Listen). Die 27 Zellen um ein Partikel enthalten alle Nachbarn
   im Träger. Partikel außerhalb des Quaders landen in der Randzelle.

   Das Gitter auf der Grafikkarte (js/sph/gpu.js) macht dasselbe mit
   festen Fächern je Zelle; die Zellen beider sind gleich geschnitten,
   damit Tests die Kerne vergleichen können. */

export function createGrid(min, max, cell) {
  const dims = [0, 1, 2].map(a => Math.max(1, Math.ceil((max[a] - min[a]) / cell) + 1));
  const [nx, ny, nz] = dims;
  const cells = nx * ny * nz;
  const start = new Uint32Array(cells + 1);
  let list = new Uint32Array(0);
  let cellOfP = new Int32Array(0);

  const cellIndex = (x, y, z) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - min[0]) / cell)));
    const j = Math.min(ny - 1, Math.max(0, Math.floor((y - min[1]) / cell)));
    const k = Math.min(nz - 1, Math.max(0, Math.floor((z - min[2]) / cell)));
    return (k * ny + j) * nx + i;
  };

  /** Einsortieren: pos als [x,y,z,kind] je Partikel, kind 0 = tot. */
  function build(pos, n) {
    if (list.length < n) { list = new Uint32Array(n); cellOfP = new Int32Array(n); }
    start.fill(0);
    for (let p = 0; p < n; p++) {
      if (pos[4 * p + 3] === 0) { cellOfP[p] = -1; continue; }
      const c = cellIndex(pos[4 * p], pos[4 * p + 1], pos[4 * p + 2]);
      cellOfP[p] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < cells; c++) start[c + 1] += start[c];
    const fill = new Uint32Array(cells);
    for (let p = 0; p < n; p++) {
      const c = cellOfP[p];
      if (c < 0) continue;
      list[start[c] + fill[c]++] = p;
    }
  }

  /** Alle Partikel in den 27 Zellen um (x,y,z): fn(j) je Kandidat. */
  function around(x, y, z, fn) {
    const i0 = Math.min(nx - 1, Math.max(0, Math.floor((x - min[0]) / cell)));
    const j0 = Math.min(ny - 1, Math.max(0, Math.floor((y - min[1]) / cell)));
    const k0 = Math.min(nz - 1, Math.max(0, Math.floor((z - min[2]) / cell)));
    for (let k = Math.max(0, k0 - 1); k <= Math.min(nz - 1, k0 + 1); k++) {
      for (let j = Math.max(0, j0 - 1); j <= Math.min(ny - 1, j0 + 1); j++) {
        for (let i = Math.max(0, i0 - 1); i <= Math.min(nx - 1, i0 + 1); i++) {
          const c = (k * ny + j) * nx + i;
          for (let s = start[c]; s < start[c + 1]; s++) fn(list[s]);
        }
      }
    }
  }

  return {
    dims, cells, cell, min, build, around, cellIndex,
    get start() { return start; },
    get list() { return list; }
  };
}
