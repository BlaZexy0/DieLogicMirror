/* DieLogic – web/tools/sprengflaeche/stl-logic.js
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

  /* Schwindung: lineares Schwindmaß s [%] der Legierung → Volumenfaktor
     (1 + s/100)³. Ein auf Werkzeugmaß gezeichnetes Modell (mit Schwindungs-
     aufmaß) ist um diesen Faktor größer als das kalte, erstarrte Bauteil.
     Ohne oder mit unbrauchbarem Schwindmaß bleibt der Faktor 1. */
  function shrinkVolumeFactor(shrinkPercent) {
    var s = Number(shrinkPercent);
    if (!isFinite(s) || s <= 0) return 1;
    return Math.pow(1 + s / 100, 3);
  }

  /* Massensummen je Rolle über alle zugeordneten Dateien.
     models: [{ volume, role }] mit volume in mm³; volumeFactor teilt die
     STL-Volumina (Modelle auf Werkzeugmaß), Standard 1 = unverändert. */
  function roleSums(models, density, volumeFactor) {
    var f = isFinite(volumeFactor) && volumeFactor > 0 ? volumeFactor : 1;
    var sums = { part: 0, runner: 0, overflow: 0, biscuit: 0 };
    for (var i = 0; i < models.length; i++) {
      var m = models[i];
      if (m.role) sums[m.role] += massKg(m.volume / f, density);
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

  /* values-Objekt der Übernahme ins Dashboard (design-Abschnitt des Projekts).
     Massen in kg, area in m², ecc in mm, psel in bar; machineFields und
     alloyFields = Felder der gewählten Presets (Maschine, Legierung). Alle
     Schlüssel müssen Eingabefelder des Dashboards sein (js/config/fields.js)
     — der Frontend-Test prüft das. Die Legierung bringt beide Dichten mit:
     hier rechnet die Feststoffdichte die Massen, im Dashboard die
     Flüssigdichte die Schmelzevolumina. */
  function handoffValues(o, machineFields, alloyFields) {
    return Object.assign({
      part: o.part, runner: o.runner, overflow: o.overflow, biscuit: o.biscuit,
      area: o.area, eccX: o.eccX, eccY: o.eccY,
      safety: o.safety, psel: o.psel
    }, machineFields, alloyFields);
  }

  var api = {
    handoffValues: handoffValues, ROLES: ROLES, massKg: massKg, shrinkVolumeFactor: shrinkVolumeFactor,
    roleSums: roleSums, missingRoles: missingRoles, sideCoreArea: sideCoreArea, machineRows: machineRows };
  root.__STL_LOGIC__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
