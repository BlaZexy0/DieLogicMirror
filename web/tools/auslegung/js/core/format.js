/* Zahlformatierung und kleine numerische Helfer. */

export function fmt(x) {
  return (x === null || x === undefined || !isFinite(x))
    ? '—'
    : Number(x).toLocaleString('de-DE', { maximumFractionDigits: 2 });
}

/* n gleichmäßig verteilte Werte von a bis b (inklusive). */
export function seq(a, b, n) {
  const r = [];
  for (let i = 0; i < n; i++) r.push(a + (b - a) * i / (n - 1));
  return r;
}

/* Indizes in HTML-Texten: „v_a", „t_f max", „P_{acc}" → <sub>…</sub>
   (dieselbe Grammatik wie render/base.js fillRich für den Canvas). */
export function subHTML(s) {
  return String(s).replace(/_(?:\{([^}]*)\}|([A-Za-z0-9]+(?:,[A-Za-z0-9]+)*))/g, (m, a, b) => '<sub>' + (a != null ? a : b) + '</sub>');
}
