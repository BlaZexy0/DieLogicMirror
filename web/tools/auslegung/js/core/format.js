/* Zahlformatierung und kleine numerische Helfer. */

export function fmt(x) {
  return (x === null || x === undefined || !isFinite(x))
    ? '—'
    : Number(x).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/* n gleichmäßig verteilte Werte von a bis b (inklusive).
   n = 1 ergab [NaN] (Division durch n − 1 = 0) — ein einzelner Wert ist der
   Anfangswert, und n < 1 hat keinen. */
export function seq(a, b, n) {
  /* Ganzzahlig: seq(0, 10, 1.5) lieferte [0, 20] — einen Wert AUSSERHALB
     des angeforderten Bereichs, weil (n − 1) dann kein ganzer Schritt ist. */
  n = Math.floor(n);
  if (!(n >= 1)) return [];
  if (n === 1) return [a];
  const r = [];
  for (let i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1));
  return r;
}

/* Indizes in HTML-Texten: „v_a", „t_f max", „P_{acc}" → <sub>…</sub>
   (dieselbe Grammatik wie render/base.js fillRich für den Canvas). */
export function subHTML(s) {
  return String(s).replace(/_(?:\{([^}]*)\}|([A-Za-z0-9]+(?:,[A-Za-z0-9]+)*))/g, (m, a, b) => '<sub>' + (a != null ? a : b) + '</sub>');
}
