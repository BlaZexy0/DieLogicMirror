/* DieLogic – web/shared/clampmodel.js
   Zuhaltungs-Modell — die eine Implementierung für das Dashboard-Diagramm
   „Max. Nachdruck (Zuhaltung)" und die Maschinentabelle der STL-Analyse:
   starre Aufspannplatte auf vier Säulen, lineare Lastverteilung — die
   meistbelastete Säule begrenzt den zulässigen Metalldruck.
   Klassisches Script: Browser-Global window.__CLAMP_MODEL__ (vor den
   ES-Modulen laden), CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  /* Hebelfaktor k: Mehrbelastung der meistbelasteten Säule gegenüber
     zentrischem Kraftangriff. e = Außermittigkeit [mm] (Vorzeichen egal),
     tieX/tieY = Säulenabstände [mm]. Abheben, wenn k − 1 ≥ 1. */
  function leverK(ex, ey, tieX, tieY) {
    return 1 + 2 * Math.abs(ex) / tieX + 2 * Math.abs(ey) / tieY;
  }

  /* Max. Nachdruck [bar]: p = F / (100 · S · k · A) mit F in kN, A in m².
     S = Sicherheitsfaktor, k = Hebelfaktor (je 1 = ohne). */
  function pMax(forceKN, areaM2, safety, k) {
    return forceKN / (100 * areaM2 * safety * k);
  }

  var api = { leverK: leverK, pMax: pMax };
  root.__CLAMP_MODEL__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
