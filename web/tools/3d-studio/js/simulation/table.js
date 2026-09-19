/* Die Vergleichstabelle im Modus „Ergebnis": je Zeile eine Größe, je Spalte
   eine Quelle — Gitter, Partikel und die Vergleichsrechnung (1D bzw.
   Schusskurve). Darum sind aus vier Seiten zwei geworden: beide Verfahren
   zum selben Problem NEBENEINANDER. Eine Spalte ohne Lauf bleibt stehen
   (blass, „—"): man sieht, dass es das andere Verfahren gibt.

     cols  [{ label, off (kein Lauf), shown (dessen Bild ist zu sehen) }]
     rows  [{ label, cells: [Text je Spalte], sum (abgesetzte Schlusszeile) }]

   Viele Anschnitte: die Tabelle scrollt in sich (css/studio-simulation.css),
   die Seitenleiste nie. */

export function compareTable(el, { caption = '', cols, rows }) {
  if (!el) return;
  const cls = c => (c.off ? ' class="off"' : c.shown ? ' class="shown"' : '');
  el.innerHTML = '<table>' + (caption ? '<caption>' + caption + '</caption>' : '')
    + '<thead><tr><th></th>' + cols.map(c => '<th' + cls(c) + '>' + c.label + '</th>').join('') + '</tr></thead><tbody>'
    + rows.map(r => '<tr' + (r.sum ? ' class="sum"' : '') + '><td>' + r.label + '</td>'
      + r.cells.map((v, i) => '<td' + cls(cols[i]) + '>' + v + '</td>').join('') + '</tr>').join('')
    + '</tbody></table>';
}
