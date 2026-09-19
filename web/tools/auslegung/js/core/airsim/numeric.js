/* Die numpy- und scipy-Routinen, auf denen die Python-Referenz der
   Luftsimulation stand — mit exakt deren Semantik.

   Sie sind nicht gegen „die naheliegende Schleife" austauschbar: die
   Referenzfälle (fixtures/airsim) vergleichen mit rtol 1e-8, und an zwei
   Stellen hängt eine ENTSCHEIDUNG am letzten Bit — welcher Rasterpunkt noch
   vor dem Ventilschluss liegt, und bei welcher Iterierten die Nullstellen-
   suche aufhört. Deshalb bleibt die Rechenreihenfolge der Originale:
   numpy linspace/interp/searchsorted/isclose, scipy brentq. */

/* np.linspace(start, stop, num): i·step + start — nicht
   start + (stop − start)·i/(n − 1) — und das letzte Element ist `stop`
   selbst, keine gerundete Summe. */
export function linspace(start, stop, num) {
  const n = Math.max(0, Math.trunc(num));
  const out = new Float64Array(n);
  if (n === 0) return out;
  const div = n - 1;
  const delta = stop - start;
  if (div === 0) {
    out[0] = 0 * delta + start;
    return out;
  }
  const step = delta / div;
  /* numpys Schutz bei denormalen Spannen: ein Schritt, der zu null
     unterläuft, würde das Raster zusammenfallen lassen */
  if (step === 0) for (let i = 0; i < n; i++) out[i] = (i / div) * delta + start;
  else for (let i = 0; i < n; i++) out[i] = i * step + start;
  out[n - 1] = stop;
  return out;
}

/* np.searchsorted(arr, x, side='right'): wie viele Elemente sind ≤ x. */
export function searchSortedRight(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = lo + ((hi - lo) >> 1);
    if (x >= arr[mid]) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/* np.interp(x, xp, fp) für ein x: linear zwischen den Stützstellen, außen
   die Randwerte. `xp` muss steigen. Nicht-endliche Stützwerte wie numpy:
   ein NaN von der einen Seite wird von der anderen her wiederholt, ein
   exakter Treffer liefert den Stützwert ohne jede Arithmetik. */
export function interp(x, xp, fp) {
  const n = xp.length;
  if (Number.isNaN(x)) return x;
  if (n === 1) return fp[0];
  if (x > xp[n - 1]) return fp[n - 1];
  if (x < xp[0]) return fp[0];
  const j = searchSortedRight(xp, x) - 1;   // xp[j] <= x < xp[j + 1], oder n − 1 auf dem letzten Knoten
  if (j === n - 1 || xp[j] === x) return fp[j];
  const slope = (fp[j + 1] - fp[j]) / (xp[j + 1] - xp[j]);
  let y = slope * (x - xp[j]) + fp[j];
  if (Number.isNaN(y)) {
    y = slope * (x - xp[j + 1]) + fp[j + 1];
    if (Number.isNaN(y) && fp[j] === fp[j + 1]) y = fp[j];
  }
  return y;
}

/* np.isclose(a, b) mit numpys Vorgaben — NICHT symmetrisch: die Toleranz
   skaliert mit b. */
export function isClose(a, b, rtol = 1e-5, atol = 1e-8) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return Math.abs(a - b) <= atol + rtol * Math.abs(b);
}

/* Cs signbit: wahr für negative Zahlen und für −0. */
const signBit = x => x < 0 || Object.is(x, -0);

/* scipy.optimize.brentq(f, xa, xb) mit scipys Vorgaben (xtol 2e-12,
   rtol 4·eps, 100 Iterationen), Anweisung für Anweisung. Die Klammer muss
   einen Vorzeichenwechsel enthalten. Jeder korrekte Nullstellensucher
   landete innerhalb von xtol — aber xtol sind 2e-12 m auf einem Hub, der
   1e-4 m sein kann: nur dieselben Iterierten geben dieselben Ziffern. */
export function brentq(f, xa, xb, xtol = 2e-12, rtol = 4 * Number.EPSILON, maxIterations = 100) {
  let xpre = xa, xcur = xb;
  let xblk = 0, fblk = 0, spre = 0, scur = 0;
  let fpre = f(xpre), fcur = f(xcur);
  if (fpre === 0) return xpre;
  if (fcur === 0) return xcur;
  if (signBit(fpre) === signBit(fcur)) throw new RangeError('brentq: f(xa) und f(xb) brauchen verschiedene Vorzeichen');

  for (let i = 0; i < maxIterations; i++) {
    if (fpre !== 0 && fcur !== 0 && signBit(fpre) !== signBit(fcur)) {
      xblk = xpre;
      fblk = fpre;
      spre = scur = xcur - xpre;
    }
    if (Math.abs(fblk) < Math.abs(fcur)) {
      xpre = xcur; xcur = xblk; xblk = xpre;
      fpre = fcur; fcur = fblk; fblk = fpre;
    }

    const delta = (xtol + rtol * Math.abs(xcur)) / 2;   // die Toleranz ist 2·delta
    const sbis = (xblk - xcur) / 2;
    if (fcur === 0 || Math.abs(sbis) < delta) return xcur;

    if (Math.abs(spre) > delta && Math.abs(fcur) < Math.abs(fpre)) {
      let stry;
      if (xpre === xblk) {
        stry = (-fcur * (xcur - xpre)) / (fcur - fpre);           // interpolieren
      } else {
        const dpre = (fpre - fcur) / (xpre - xcur);               // extrapolieren
        const dblk = (fblk - fcur) / (xblk - xcur);
        stry = (-fcur * (fblk * dblk - fpre * dpre)) / (dblk * dpre * (fblk - fpre));
      }
      if (2 * Math.abs(stry) < Math.min(Math.abs(spre), 3 * Math.abs(sbis) - delta)) {
        spre = scur;   // guter kurzer Schritt
        scur = stry;
      } else {
        spre = sbis;   // halbieren
        scur = sbis;
      }
    } else {
      spre = sbis;     // halbieren
      scur = sbis;
    }

    xpre = xcur;
    fpre = fcur;
    if (Math.abs(scur) > delta) xcur += scur;
    else xcur += sbis > 0 ? delta : -delta;
    fcur = f(xcur);
  }
  /* scipy wirft hier „failed to converge". Spätestens jeder zweite Schritt
     ist eine Halbierung, 100 Iterationen drücken jede Klammer des Modells
     weit unter xtol — die beste Schätzung zurückgeben statt aus einem
     Diagramm heraus zu werfen. */
  return xcur;
}
