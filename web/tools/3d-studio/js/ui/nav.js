/* Schmale Kopfleiste im DieLogic-Look — der Platzhalter für
   /shared/nav.js.

   In DieLogic liefert die echte nav.js Navigation und Fußzeile für die
   ganze Website. Sie meldet sich über window.__PALETTE__ an (gesetzt von
   /shared/palette.js, einem klassischen Skript im <head> — also lange
   bevor dieses Modul läuft). Ist die Palette da, hält sich diese Leiste
   heraus. Dadurch bleiben die Skripte in beiden Ständen identisch und
   laufen nicht auseinander. */

const LINKS = [
  { href: 'index.html', label: 'Übersicht' },
  { href: 'form.html', label: 'Formaufbau' },
  { href: 'bauteilanalyse.html', label: 'Bauteilanalyse' },
  { href: 'offset.html', label: 'Offsetflächen' },
  { href: 'abstand.html', label: 'Abstandsanalyse' }
];

const H_GLYPH = '<svg viewBox="0 0 100 100" aria-hidden="true" style="height:.78em;vertical-align:-.02em;margin:0 .06em">'
  + '<rect x="0" y="0" width="17" height="100" rx="3" fill="#fff"/>'
  + '<rect x="83" y="0" width="17" height="100" rx="3" fill="#fff"/>'
  + '<path d="M17 38 L60 38 L60 26 L83 50 L60 74 L60 62 L17 62 Z" fill="#008c82"/></svg>';

export function mountNav(active) {
  if (window.__PALETTE__) return null;      // DieLogic bringt seine eigene
  const el = document.createElement('nav');
  el.className = 'f3-nav';
  el.innerHTML =
    '<a class="f3-brand" href="index.html">Die' + H_GLYPH
      + '<span style="color:#3fc2b6">Logic</span>'
      + '<span class="f3-sub">Druckgießform 3D</span></a>'
    + '<div class="f3-links">'
    + LINKS.map(l => '<a href="' + l.href + '"'
        + (l.href === active ? ' class="active"' : '') + '>' + l.label + '</a>').join('')
    + '</div>';
  document.body.prepend(el);
  return el;
}
