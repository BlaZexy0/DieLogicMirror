/* DieLogic – web/tools/teilekosten/teilekosten-logic.js
   Reine Rechenlogik der Teilekosten-Kalkulation — Kostenmodell je Gutteil,
   Zykluszeit- und Material-Hebel. Kein DOM: die Seite (index.html)
   ruft nur noch auf und rendert.
   Klassisches Script: Browser-Global window.__TEILEKOSTEN_LOGIC__,
   CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  /* Kostenmodell je Gutteil. Eingaben (v):
       mpart  Bauteilgewicht [kg]        mdose  Schussgewicht [kg]
              — beide für den GANZEN Schuss, also über alle Kavitäten
              zusammen. Das ist dieselbe Bilanz wie im Dashboard, wo
              mdose = part + runner + overflow + biscuit das Volumen ist,
              das in die Gießkammer passen muss (physics.js, Füllgrad φ).
              Damit gilt mpart ≤ mdose bauartbedingt: die Materialausbeute
              kann nicht über 100 % steigen und der Kreislaufanteil nicht
              unter null fallen.
       tz     Zykluszeit [s]             kav    Kavitäten [−]
       a      Ausschuss [%]              oee    OEE/Verfügbarkeit [%]
       pAl    Legierungspreis [€/kg]     pRe    Umschmelzkosten [€/kg]
       kr     Schmelzverlust/Krätze [%]  eKg    Schmelzenergie [kWh/kg]
       pE     Strompreis [€/kWh]         pM     Maschinenstundensatz [€/h]
       pP     Personal [€/h]             nP     Bediener je Zelle [−]
       wz     Werkzeugkosten [€]         st     Standmenge [Schüsse]
     Modellannahmen: Ausschussteile laufen als Kreislaufmaterial zurück
     (Umschmelzen + Durchsatz, kein neues Metall); Energie umfasst Schmelzen
     und Warmhalten des gesamten Schussgewichts. */
  function computeCost(v) {
    var good = 1 - v.a / 100;
    var pph = v.tz > 0 ? 3600 / v.tz * v.kav * (v.oee / 100) * good : NaN; // Gutteile/h
    var perShotGood = v.kav * good;                              // Gutteile je Schuss
    var mCycle = v.mdose - v.mpart;                              // Kreislauf je Schuss (Anguss, Überlauf, Pressrest)
    var matAlloy = (v.kav > 0 ? v.mpart / v.kav : NaN) * v.pAl;  // Neumetall im Gutteil
    var matLoss = v.mdose * (v.kr / 100) * v.pAl / perShotGood;  // Krätzeverlust je Gutteil
    var matRemelt = (mCycle + v.mpart * (v.a / 100)) * v.pRe / perShotGood; // Umschmelzen Kreislauf + Ausschussteile
    var energyKwh = v.mdose * v.eKg / perShotGood;               // kWh je Gutteil
    var energy = energyKwh * v.pE;
    var machine = pph > 0 ? (v.pM + v.nP * v.pP) / pph : NaN;
    var tool = v.st > 0 ? v.wz / (v.st * perShotGood) : NaN;
    return {
      pph: pph, perShotGood: perShotGood, energyKwh: energyKwh,
      matAlloy: matAlloy, matLoss: matLoss, matRemelt: matRemelt,
      energy: energy, machine: machine, tool: tool,
      total: matAlloy + matLoss + matRemelt + energy + machine + tool,
      /* Zykluszeit-Hebel: Ableitung der zeitabhängigen Blöcke nach t_Z, ct je s */
      leverTime: pph > 0 ? (v.pM + v.nP * v.pP) / (v.kav * (v.oee / 100) * good) / 3600 * 100 : NaN,
      leverMass: massLever(v)
    };
  }

  /* Material-Hebel: Ableitung der Stückkosten nach dem Bauteilgewicht,
     mit gekoppeltem Schussgewicht (1 kg weniger Bauteil je Kavität =
     kav kg weniger Schuss; Anguss, Überlauf und Pressrest unverändert).
     Je gespartem kg entfallen Neumetall (p_Leg), anteilig Krätze und
     Schmelzenergie über das Schussgewicht sowie das Umschmelzen des
     Ausschussanteils — alles bezogen auf ein Gutteil, daher /(1 − a).
     Maschine, Personal und Werkzeug hängen nicht an der Masse.
     Rückgabe in €/kg. */
  function massLever(v) {
    var good = 1 - v.a / 100;
    var alloy = v.pAl;
    var dross = good > 0 ? (v.kr / 100) * v.pAl / good : NaN;
    var remelt = good > 0 ? (v.a / 100) * v.pRe / good : NaN;
    var energy = good > 0 ? v.eKg * v.pE / good : NaN;
    return { alloy: alloy, dross: dross, remelt: remelt, energy: energy,
      total: alloy + dross + remelt + energy };
  }

  /* Stückkosten bei anderer Zykluszeit (für die Kurve). */
  function costAtTz(v, tz) {
    var w = {}; for (var k in v) w[k] = v[k];
    w.tz = tz;
    return computeCost(w).total;
  }

  /* Stückkosten bei anderem Gewicht EINES Bauteils — mpart und mdose sind
     Ganzschuss-Größen, ein um Δ leichteres Bauteil senkt beide um kav·Δ
     (Basis der Material-Hebel-Ableitung; der Hebel ist €/kg je Bauteil). */
  function costAtPartMass(v, mpartOne) {
    var w = {}; for (var k in v) w[k] = v[k];
    var all = mpartOne * v.kav;
    w.mdose = v.mdose + (all - v.mpart);
    w.mpart = all;
    return computeCost(w).total;
  }

  var api = { computeCost: computeCost, massLever: massLever,
    costAtTz: costAtTz, costAtPartMass: costAtPartMass };
  root.__TEILEKOSTEN_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
