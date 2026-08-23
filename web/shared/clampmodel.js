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

  /* Kraftbilanz an der Trennebene, eine Umrechnung in drei Richtungen:
       F [kN] = 100 · p [bar] · A [m²] · S · k       (1 bar · 1 m² = 100 kN)
     S = Sicherheitsfaktor, k = Hebelfaktor (je 1 = ohne). */
  var KN_PER_BAR_M2 = 100;
  /* Max. Nachdruck [bar] bei gegebener Schließkraft und Sprengfläche. */
  function pMax(forceKN, areaM2, safety, k) {
    return forceKN / (KN_PER_BAR_M2 * areaM2 * safety * k);
  }
  /* Erforderliche Schließkraft [kN] bei Druck und Sprengfläche. */
  function forceKN(pBar, areaM2, safety, k) {
    return KN_PER_BAR_M2 * pBar * areaM2 * safety * k;
  }
  /* Zulässige Sprengfläche [m²] bei Schließkraft und Druck. */
  function areaMax(forceKN, pBar, safety, k) {
    return forceKN / (KN_PER_BAR_M2 * pBar * safety * k);
  }

  var api = { leverK: leverK, pMax: pMax, forceKN: forceKN, areaMax: areaMax, KN_PER_BAR_M2: KN_PER_BAR_M2 };
  root.__CLAMP_MODEL__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
