/* Maschinen-Presets (Beispielwerte). Produktiv pflegt jede Organisation ihre eigenen
   auf der Konto-Seite (Stammdaten); diese Datei ist Startvorlage und Fallback.
   Einheiten: force = Schließkraft [kN], vmax [m/s], amax [m/s²],
   dmin/dmax = Kolben-Ø-Bereich [mm], lmin/lmax = Kammerlängen-Bereich [mm],
   injForce = Gießkraft bei max. Akkumulatordruck [kN], tieX/tieY = Säulenabstand horizontal/vertikal [mm],
   pAcc = Akkumulatordruck max. [bar] (beide zusammen = Antriebskolben A_h = F/P;
   die Gießkraft im Betrieb folgt aus dem eingestellten Druck), intTime = Nachdruckaufbauzeit [ms].
   Die Schlüssel in 'fields' entsprechen den Eingabefeld-Keys des Dashboards
   (siehe js/config/fields.js). Neue Maschine = neuer Eintrag in der Liste. */

window.__MACHINES__ = {
  "machines": [
    {
      "id": "hcc340",
      "name": "HCC-340 (340 t)",
      "fields": { "force": 3400, "vmax": 7, "amax": 60, "dmin": 50, "dmax": 160, "lmin": 450, "lmax": 900, "injForce": 360, "tieX": 560, "tieY": 560, "pAcc": 160, "intTime": 40 }
    },
    {
      "id": "hcc800",
      "name": "HCC-800 (800 t)",
      "fields": { "force": 8000, "vmax": 6, "amax": 50, "dmin": 100, "dmax": 300, "lmin": 750, "lmax": 1500, "injForce": 900, "tieX": 810, "tieY": 810, "pAcc": 160, "intTime": 60 }
    },
    {
      "id": "hcc1600",
      "name": "HCC-1600 (1600 t)",
      "fields": { "force": 16000, "vmax": 8, "amax": 60, "dmin": 140, "dmax": 420, "lmin": 1000, "lmax": 2000, "injForce": 2000, "tieX": 1170, "tieY": 1170, "pAcc": 160, "intTime": 80 }
    },
    {
      "id": "hcc2700",
      "name": "HCC-2700 (2700 t)",
      "fields": { "force": 27000, "vmax": 8, "amax": 55, "dmin": 160, "dmax": 500, "lmin": 1200, "lmax": 2400, "injForce": 3600, "tieX": 1400, "tieY": 1400, "pAcc": 160, "intTime": 95 }
    },
    {
      "id": "hcc4400",
      "name": "HCC-4400 (4400 t)",
      "fields": { "force": 44000, "vmax": 8, "amax": 50, "dmin": 180, "dmax": 560, "lmin": 1400, "lmax": 2800, "injForce": 6100, "tieX": 1700, "tieY": 1700, "pAcc": 160, "intTime": 110 }
    },
    {
      "id": "hcc6100",
      "name": "HCC-6100 (6100 t)",
      "fields": { "force": 61000, "vmax": 8, "amax": 50, "dmin": 200, "dmax": 620, "lmin": 1600, "lmax": 3200, "injForce": 8800, "tieX": 2000, "tieY": 2000, "pAcc": 160, "intTime": 125 }
    },
    {
      "id": "hcc9200",
      "name": "HCC-9200 (9200 t)",
      "fields": { "force": 92000, "vmax": 8, "amax": 45, "dmin": 240, "dmax": 700, "lmin": 1800, "lmax": 3600, "injForce": 13800, "tieX": 2400, "tieY": 2400, "pAcc": 160, "intTime": 140 }
    },
    {
      "id": "hcc12000",
      "name": "HCC-12000 (12000 t)",
      "fields": { "force": 120000, "vmax": 8, "amax": 45, "dmin": 260, "dmax": 750, "lmin": 1900, "lmax": 3800, "injForce": 18000, "tieX": 2800, "tieY": 2800, "pAcc": 160, "intTime": 160 }
    },
    {
      "id": "hcc16000",
      "name": "HCC-16000 (16000 t)",
      "fields": { "force": 160000, "vmax": 8, "amax": 45, "dmin": 280, "dmax": 800, "lmin": 2000, "lmax": 4000, "injForce": 24000, "tieX": 3200, "tieY": 3200, "pAcc": 160, "intTime": 180 }
    }
  ]
};
