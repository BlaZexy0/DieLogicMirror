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

/* Indizes in Texten: „v_a", „t_f max", „P_{acc}" — der Teil nach „_" (ein
   Wort, Wörter mit Komma, oder {…}) ist Tiefindex. subParts zerlegt einen
   Text in Stücke [{ t, sub }]; subHTML setzt daraus <sub>…</sub>, und
   render/base.js fillRich zeichnet dieselben Stücke auf den Canvas. */
const SUB = /_(?:\{([^}]*)\}|([A-Za-z0-9]+(?:,[A-Za-z0-9]+)*))/g;
export function subParts(s) {
  s = String(s);
  const parts = [];
  let last = 0, m;
  SUB.lastIndex = 0;
  while ((m = SUB.exec(s))) {
    if (m.index > last) parts.push({ t: s.slice(last, m.index), sub: false });
    parts.push({ t: m[1] != null ? m[1] : m[2], sub: true });
    last = SUB.lastIndex;
  }
  if (last < s.length) parts.push({ t: s.slice(last), sub: false });
  return parts;
}
export function subHTML(s) {
  return subParts(s).map(q => (q.sub ? '<sub>' + q.t + '</sub>' : q.t)).join('');
}
