/* Maschinen-Presets — hier direkt editieren, kein Build nötig.
   Einheiten: force = Schließkraft [kN], vmax [m/s], amax [m/s²],
   dmin/dmax = Kolben-Ø-Bereich [mm], lmax = Kammerlänge max. [mm],
   injForce = dyn. Gießkraft [kN], tieX/tieY = Säulenabstand horizontal/vertikal [mm].
   Die Schlüssel in 'fields' entsprechen den Eingabefeld-Keys des Dashboards
   (siehe js/config/fields.js). Neue Maschine = neuer Eintrag in der Liste. */

window.__MACHINES__ = {
  "machines": [
    {
      "id": "hcc340",
      "name": "HCC-340 (340 t)",
      "fields": { "force": 3400, "vmax": 7, "amax": 60, "dmin": 50, "dmax": 160, "lmax": 900, "injForce": 360, "tieX": 560, "tieY": 560 }
    },
    {
      "id": "hcc800",
      "name": "HCC-800 (800 t)",
      "fields": { "force": 8000, "vmax": 6, "amax": 50, "dmin": 100, "dmax": 300, "lmax": 1500, "injForce": 900, "tieX": 810, "tieY": 810 }
    },
    {
      "id": "hcc1600",
      "name": "HCC-1600 (1600 t)",
      "fields": { "force": 16000, "vmax": 8, "amax": 60, "dmin": 140, "dmax": 420, "lmax": 2000, "injForce": 2000, "tieX": 1170, "tieY": 1170 }
    }
  ]
};
