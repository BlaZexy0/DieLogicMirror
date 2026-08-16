/* Kosten-Preset der Teilekosten-Kalkulation — hier direkt editieren,
   kein Build nötig. Alle Werte sind Richt-/Beispielwerte und vor
   Produktivnutzung zu prüfen (wie bei den Maschinen-Presets dokumentiert).
   Einheiten: pAl = Legierungspreis [€/kg], pRe = Umschmelzkosten Kreislauf [€/kg],
   kr = Schmelzverlust/Krätze [%], eKg = Schmelz- & Warmhalteenergie [kWh/kg],
   pE = Strompreis [€/kWh], pM = Maschinenstundensatz Zelle [€/h],
   pP = Personal [€/h], nP = Bediener je Zelle [−], wz = Werkzeugkosten [€],
   st = Standmenge [Schüsse], tz = Zykluszeit [s], kav = Kavitäten [−],
   a = Ausschuss [%], oee = OEE/Verfügbarkeit [%],
   hMonth = Produktionsstunden je Monat (3-Schicht-Betrieb). */

window.__KOSTEN__ = {
  "defaults": {
    "tz": 52, "kav": 1, "a": 4, "oee": 78,
    "pAl": 2.6, "pRe": 0.35, "kr": 2, "eKg": 0.75, "pE": 0.18,
    "pM": 95, "pP": 48, "nP": 0.5, "wz": 180000, "st": 120000,
    "hMonth": 500
  }
};
