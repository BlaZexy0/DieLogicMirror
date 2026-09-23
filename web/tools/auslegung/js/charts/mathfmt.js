/* Formeln in den Mathe-Erklärungen der Diagramme: TeX → HTML über KaTeX
   (lokal eingebunden, /shared/vendor/katex — window.katex, vor den
   ES-Modulen geladen). Ohne KaTeX (Tests, Generatoren) bleibt die TeX-
   Quelle als <code> stehen, damit nichts bricht. */

import { subHTML } from '../core/format.js';

const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/* Inline-Formel als HTML-Fragment. */
export function tex(src) {
  const k = globalThis.katex;
  if (!k) return '<code class="tex">' + esc(src) + '</code>';
  return k.renderToString(src, { throwOnError: false, displayMode: false, strict: 'ignore' });
}

/* Abgesetzte Formel im .eq-Kasten. */
export function eq(src) {
  const k = globalThis.katex;
  const body = k ? k.renderToString(src, { throwOnError: false, displayMode: true, strict: 'ignore' })
    : '<code class="tex">' + esc(src) + '</code>';
  return '<div class="eq">' + body + '</div>';
}

/* Die Live-Werte einer Erklärung: set(k, text) füllt den Platzhalter
   <… data-m="k"> in el; Indizes („v_a") laufen durch subHTML. */
export function mathSetter(el) {
  return (k, val) => {
    const s = el.querySelector('[data-m="' + k + '"]');
    if (s) s.innerHTML = subHTML(val);
  };
}
