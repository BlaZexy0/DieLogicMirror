/* DieLogic – stl/stl-logic.js
   Reine Rechenlogik der STL-Analyse — Zuordnung, Massenbilanz und die
   Maschinentabelle (max. Nachdruck, Empfehlung, Abheben). Kein DOM, kein
   Canvas: die Seite (stl-app.js) ruft nur noch auf und rendert.
   Klassisches Script: Browser-Global window.__STL_LOGIC__ (nach clampmodel.js
   laden), CommonJS-Export für Tests. */
(function (root) {
  'use strict';

  /* Zuordnung der Dateien zu den Massenbilanz-Feldern des Dashboards. */
  var ROLES = [['part', 'Bauteil'], ['runner', 'Anguss'], ['overflow', 'Überlauf'], ['biscuit', 'Pressrest']];

  /* Masse in kg: Volumen [mm³] · Dichte [kg/m³] · 1e-9 */
  function massKg(volumeMm3, density) { return volumeMm3 * density * 1e-9; }

  /* Massensummen je Rolle über alle zugeordneten Dateien.
     models: [{ volume, role }] mit volume in mm³. */
  function roleSums(models, density) {
    var sums = { part: 0, runner: 0, overflow: 0, biscuit: 0 };
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (m.role) sums[m.role] += massKg(m.volume, density);
    }
    return sums;
  }

  /* Labels der Rollen, die noch keiner Datei zugeordnet sind. */
  function missingRoles(models) {
    var have = {};
    for (var i = 0; i < models.length; i++) if (models[i].role) have[models[i].role] = true;
    var out = [];
    for (var j = 0; j < ROLES.length; j++) if (!have[ROLES[j][0]]) out.push(ROLES[j][1]);
    return out;
  }

  /* Seitenschieber: Beitrag zur Sprengfläche in Öffnungsrichtung.
     Der Metalldruck wirkt auf die in Zugrichtung projizierte Schieberfläche;
     die Abstützschräge mit Sperrwinkel α leitet davon den Anteil tan(α) in
     die Öffnungsrichtung — wirksame Fläche = A_S · tan(α), üblich 15–25°.
     Ungültige oder nicht-positive Eingaben ergeben 0; α ≥ 90° ist
     physikalisch sinnlos und ergibt NaN (die Seite begrenzt die Eingabe). */
  function sideCoreArea(areaMm2, angleDeg) {
    if (!isFinite(areaMm2) || !isFinite(angleDeg) || areaMm2 <= 0 || angleDeg <= 0) return 0;
    if (angleDeg >= 90) return NaN;
    return areaMm2 * Math.tan(angleDeg * Math.PI / 180);
  }

  /* Maschinentabelle: max. Nachdruck je Preset in drei Stufen (nur
     Schließkraft, mit Sicherheitsfaktor, mit Sicherheit + Außermittigkeit)
     plus Eignung. clamp = Zuhaltungs-Modell (shared/clampmodel.js).
     opts: { areaMm2, ex, ey (mm), safety, pTarget (bar) }.
     Eine Maschine ist geeignet (ok), wenn sie den Auslegungsdruck erreicht
     und die Form nicht abhebt (k − 1 ≥ 1 → meistentlastete Säule bei 0);
     empfohlen (pref) ist die geeignete Maschine mit der kleinsten
     Schließkraft. */
  function machineRows(machines, clamp, opts) {
    var A_m2 = opts.areaMm2 * 1e-6;
    var rows = [];
    var pref = null;
    for (var i = 0; i < machines.length; i++) {
      var mc = machines[i], f = mc.fields;
      var k = clamp.leverK(opts.ex, opts.ey, f.tieX, f.tieY);
      var lift = k - 1 >= 1;
      var row = {
        mc: mc, f: f,
        p0: clamp.pMax(f.force, A_m2, 1, 1),
        pS: clamp.pMax(f.force, A_m2, opts.safety, 1),
        k: k,
        pK: clamp.pMax(f.force, A_m2, opts.safety, k),
        lift: lift
      };
      row.ok = row.pK >= opts.pTarget && !lift;
      rows.push(row);
      if (row.ok && (!pref || f.force < pref.f.force)) pref = row;
    }
    return { rows: rows, pref: pref };
  }

  var api = { ROLES: ROLES, massKg: massKg, roleSums: roleSums, missingRoles: missingRoles, sideCoreArea: sideCoreArea, machineRows: machineRows };
  root.__STL_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
