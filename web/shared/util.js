/* DieLogic – web/shared/util.js
   Kleine Hilfen, die projectbar.js, die Konto-Seite und die kleinen
   Werkzeuge (Sprengfläche, Teilekosten, Zyklus) bisher je für sich selbst
   geschrieben hatten — mit der Zeit leicht auseinandergelaufen (esc() ohne
   null-Schutz hier, api() ohne err.status dort). Keine Abhängigkeiten,
   keine Seiteneffekte beim Laden: reine Funktionen, wie palette.js.
   Klassisches Script (file:// und http), CommonJS-Export für Tests.

   web/tools/auslegung/** und web/tools/3d-studio/** haben ihre eigenen
   Abschriften weiterhin (andere Baustelle) — die Funktionen hier sind
   bewusst so gehalten, dass sie dort ebenso passen würden. */
(function (root) {
  'use strict';

  /* HTML-sicher: & < > " ' — fürs Markup UND fürs Attribut. Erlaubt sind
     alle Werte (auch Zahlen, null, undefined), wie es die meisten
     Aufrufer brauchten (die Ausnahmen prüften vorher selbst auf null). */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* fetch mit JSON-Rumpf, 204 = null, ein Fehler wirft mit err.status (aus
     der Antwort) und, wenn vorhanden, dem Klartext aus {detail}. extra für
     Optionen wie keepalive (projectbar.js beim Verlassen der Seite). */
  async function api(method, path, body, extra) {
    var r = await fetch(path, Object.assign({
      method: method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }, extra || {}));
    if (r.status === 204) return null;
    var data = null;
    try { data = await r.json(); } catch (e) { /* keine JSON-Antwort */ }
    if (!r.ok) {
      var msg = data && typeof data.detail === 'string' ? data.detail : 'HTTP ' + r.status;
      var err = new Error(msg); err.status = r.status; throw err;
    }
    return data;
  }

  /* Kurz: Tag.Monat, Stunde:Minute — für einen Zeitpunkt, der ohnehin
     „gerade eben" ist (Sync-Stand der Projektleiste). */
  function fmtZeit(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /* Lang: Tag.Monat.Jahr, Stunde:Minute — für einen Zeitpunkt, der auch
     länger zurückliegen kann (Konto-Seite: zuletzt geändert, Verlauf). */
  function fmtDatum(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  /* Deutsches Zahlenformat, „—" bei nicht endlichen Werten (NaN, ±Infinity
     — leere oder ungültige Eingabefelder). digits = Nachkommastellen
     (toLocaleString-maximumFractionDigits; die Aufrufer setzen ihren
     eigenen Standard, wenn d fehlt — Teilekosten 2, Zyklus 1). */
  function fmtZahl(x, digits) {
    if (!isFinite(x)) return '—';
    return x.toLocaleString('de-DE', { maximumFractionDigits: digits });
  }

  var apiObj = { esc: esc, api: api, fmtZeit: fmtZeit, fmtDatum: fmtDatum, fmtZahl: fmtZahl };
  root.__DL_UTIL__ = apiObj;
  if (typeof module !== 'undefined' && module.exports) module.exports = apiObj;
})(typeof window !== 'undefined' ? window : globalThis);
