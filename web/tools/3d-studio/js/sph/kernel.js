/* Der Glättungskern der Partikelrechnung: Wendland C2 in drei
   Dimensionen, Träger 2h.

   Wendland statt kubischem Spline, weil er gegen das „Paaren" der
   Partikel gefeit ist (bei einem Kern, dessen Ableitung nahe null
   abflacht, rücken Partikel paarweise zusammen). W(q) mit q = r/h:
   W = 21/(16πh³) · (1 − q/2)⁴ · (2q + 1) für q < 2, sonst 0; die
   Ableitung nach r: dW/dr = 21/(16πh³) · (−5q(1 − q/2)³)/h. Kein DOM,
   keine Abhängigkeiten — Tests prüfen die Normierung. */

/** Trägerradius in Einheiten von h. */
export const SUPPORT = 2;

/** Normierung 21/(16πh³). */
function kernelNorm(h) {
  return 21 / (16 * Math.PI * h * h * h);
}

/** W(r) — Kernwert im Abstand r. */
export function W(r, h) {
  const q = r / h;
  if (q >= SUPPORT) return 0;
  const t = 1 - q / 2;
  return kernelNorm(h) * t * t * t * t * (2 * q + 1);
}

/** dW/dr — Ableitung nach dem Abstand (≤ 0). */
export function dW(r, h) {
  const q = r / h;
  if (q >= SUPPORT || r <= 0) return 0;
  const t = 1 - q / 2;
  return kernelNorm(h) * (-5 * q * t * t * t) / h;
}
