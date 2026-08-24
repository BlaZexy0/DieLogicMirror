/* Maschinen-Presets: generische Größenklassen, abgeleitet als Median je
   Klasse aus einer Marktübersicht (172 Kaltkammer-Maschinen von fünf
   Herstellern, Stand 2026) — bewusst keine Herstellerdaten übernommen.
   Produktiv pflegt jede Organisation ihre eigenen Presets auf der
   Konto-Seite (Stammdaten); diese Datei ist Startvorlage und Fallback.
   Einheiten: force = Schließkraft [kN], vmax [m/s], amax [m/s²],
   dmin/dmax = Kolben-Ø-Bereich [mm], lmin/lmax = Kammerlängen-Bereich [mm]
   (lmin = Konvention ≈ lmax/2, nicht aus der Übersicht),
   injForce = Gießkraft bei max. Akkumulatordruck [kN] — hier die
   Multiplikations-/Nachdruck-Einspritzkraft; die rein dynamische Kraft der
   2. Phase liegt marktüblich bei etwa einem Drittel davon,
   tieX/tieY = Säulenabstand [mm], pAcc = Akkumulatordruck max. [bar],
   intTime = Nachdruckaufbauzeit [ms] (Konvention nach Größe).
   Die Schlüssel in 'fields' entsprechen den Eingabefeld-Keys des Dashboards
   (siehe js/config/fields.js). Neue Maschine = neuer Eintrag in der Liste. */

window.__MACHINES__ = {
  "machines": [
    {
      "id": "hcc200",
      "name": "HCC-200 (200 t)",
      "fields": { "force": 2000, "vmax": 8.5, "amax": 300, "dmin": 40, "dmax": 70, "lmin": 200, "lmax": 350, "injForce": 280, "tieX": 470, "tieY": 470, "pAcc": 180, "intTime": 30 }
    },
    {
      "id": "hcc340",
      "name": "HCC-340 (340 t)",
      "fields": { "force": 3400, "vmax": 8.5, "amax": 270, "dmin": 50, "dmax": 85, "lmin": 250, "lmax": 500, "injForce": 410, "tieX": 580, "tieY": 580, "pAcc": 200, "intTime": 40 }
    },
    {
      "id": "hcc800",
      "name": "HCC-800 (800 t)",
      "fields": { "force": 8000, "vmax": 8.5, "amax": 170, "dmin": 70, "dmax": 120, "lmin": 350, "lmax": 700, "injForce": 760, "tieX": 900, "tieY": 900, "pAcc": 190, "intTime": 60 }
    },
    {
      "id": "hcc1600",
      "name": "HCC-1600 (1600 t)",
      "fields": { "force": 16000, "vmax": 8.5, "amax": 110, "dmin": 90, "dmax": 150, "lmin": 450, "lmax": 900, "injForce": 1300, "tieX": 1200, "tieY": 1200, "pAcc": 190, "intTime": 80 }
    },
    {
      "id": "hcc2700",
      "name": "HCC-2700 (2700 t)",
      "fields": { "force": 27000, "vmax": 8.5, "amax": 90, "dmin": 110, "dmax": 180, "lmin": 600, "lmax": 1200, "injForce": 2100, "tieX": 1550, "tieY": 1550, "pAcc": 190, "intTime": 95 }
    },
    {
      "id": "hcc4400",
      "name": "HCC-4400 (4400 t)",
      "fields": { "force": 44000, "vmax": 9, "amax": 80, "dmin": 120, "dmax": 200, "lmin": 700, "lmax": 1400, "injForce": 2400, "tieX": 1750, "tieY": 1750, "pAcc": 190, "intTime": 110 }
    },
    {
      "id": "hcc6100",
      "name": "HCC-6100 (6100 t)",
      "fields": { "force": 61000, "vmax": 9, "amax": 70, "dmin": 140, "dmax": 230, "lmin": 800, "lmax": 1600, "injForce": 3100, "tieX": 2200, "tieY": 2200, "pAcc": 190, "intTime": 125 }
    },
    {
      "id": "hcc9200",
      "name": "HCC-9200 (9200 t)",
      "fields": { "force": 92000, "vmax": 9, "amax": 45, "dmin": 190, "dmax": 300, "lmin": 1000, "lmax": 2000, "injForce": 4400, "tieX": 2500, "tieY": 2500, "pAcc": 190, "intTime": 140 }
    }
  ]
};
