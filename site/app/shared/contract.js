/* DieLogic – app/shared/contract.js
   Gemeinsamer Vertrag zwischen STL-Analyse und Dashboard: der
   localStorage-Schlüssel und der Aufbau/das Schreiben der Übernahme-Werte
   stehen nur hier — keine duplizierten Literale in den Seiten.
   Klassisches Script: Browser-Global window.__DASH_CONTRACT__ (vor den
   ES-Modulen laden), CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  /* Nicht ändern, ohne eine Migration bereitzustellen — unter diesem
     Schlüssel liegen die gespeicherten Auslegungen der Nutzer. */
  var STORAGE_KEY = 'hpdc-dashboard-state-v1';

  /* values-Objekt der STL-Übernahme. Massen in kg, area in m², ecc in mm,
     psel in bar; machineFields = Felder des gewählten Maschinen-Presets.
     Alle Schlüssel müssen Eingabefelder des Dashboards sein
     (js/config/fields.js) — der Frontend-Test prüft das. */
  function stlHandoffValues(o, machineFields) {
    return Object.assign({
      part: o.part, runner: o.runner, overflow: o.overflow, biscuit: o.biscuit,
      density: o.density, area: o.area, eccX: o.eccX, eccY: o.eccY,
      safety: o.safety, psel: o.psel
    }, machineFields);
  }

  /* Werte in den gespeicherten Dashboard-Zustand mischen — nicht betroffene
     Eingaben und die Schusskurve bleiben erhalten. storage ist
     localStorage-artig (Tests übergeben einen Stub). */
  function writeDashboardState(storage, values, machineId) {
    var data = {};
    try { data = JSON.parse(storage.getItem(STORAGE_KEY)) || {}; }
    catch (e) { /* korrupt oder leer → neu anlegen */ }
    if (typeof data !== 'object' || data === null || Array.isArray(data)) data = {};
    data.values = Object.assign({}, data.values, values);
    data.machine = machineId;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; /* localStorage voll/deaktiviert */ }
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    stlHandoffValues: stlHandoffValues,
    writeDashboardState: writeDashboardState
  };
  root.__DASH_CONTRACT__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
