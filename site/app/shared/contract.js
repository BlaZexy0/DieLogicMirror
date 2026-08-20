/* DieLogic – app/shared/contract.js
   Gemeinsamer Vertrag zwischen STL-Analyse und Dashboard: der Aufbau und
   das Schreiben der Übernahme-Werte stehen nur hier — keine duplizierten
   Literale in den Seiten. Ziel ist der design-Abschnitt des aktuellen
   Projekts (shared/project.js); STORAGE_KEY ist der alte Dashboard-Schlüssel,
   den project.js beim ersten Start migriert.
   Klassisches Script: Browser-Global window.__DASH_CONTRACT__ (nach
   project.js, vor den ES-Modulen laden), CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  /* Alter Dashboard-Schlüssel (bis v0.9): wird von project.js einmalig in
     ein Projekt überführt. Nicht ändern — sonst verlieren Nutzer ihren Stand. */
  var STORAGE_KEY = 'hpdc-dashboard-state-v1';

  /* values-Objekt der STL-Übernahme. Massen in kg, area in m², ecc in mm,
     psel in bar; machineFields = Felder des gewählten Maschinen-Presets.
     Alle Schlüssel müssen Eingabefelder des Dashboards sein
     (js/config/fields.js) — der Frontend-Test prüft das.
     Die Dichte wird bewusst NICHT übernommen: die STL-Seite rechnet die
     Massen mit der Feststoffdichte, das Dashboard rechnet seine Volumina
     mit der Flüssigdichte — die bleibt dort unangetastet. */
  function stlHandoffValues(o, machineFields) {
    return Object.assign({
      part: o.part, runner: o.runner, overflow: o.overflow, biscuit: o.biscuit,
      area: o.area, eccX: o.eccX, eccY: o.eccY,
      safety: o.safety, psel: o.psel
    }, machineFields);
  }

  /* Werte in den design-Abschnitt des aktuellen Projekts mischen — nicht
     betroffene Eingaben und die Schusskurve bleiben erhalten. project ist
     das Projekt-Modul (window.__PROJECT__; Tests übergeben es explizit). */
  function writeDashboardState(project, values, machineId) {
    var P = project || root.__PROJECT__;
    if (!P) throw new Error('shared/project.js nicht geladen (window.__PROJECT__ fehlt).');
    return P.mergeDesign(values, machineId);
  }

  var api = {
    STORAGE_KEY: STORAGE_KEY,
    stlHandoffValues: stlHandoffValues,
    writeDashboardState: writeDashboardState
  };
  root.__DASH_CONTRACT__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
