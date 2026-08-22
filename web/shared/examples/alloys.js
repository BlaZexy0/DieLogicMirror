/* Legierungs-Presets (Beispielwerte). Produktiv pflegt jede Organisation ihre eigenen
   auf der Konto-Seite (Stammdaten); diese Datei ist Startvorlage und Fallback.
   Einheiten: density = Dichte der SCHMELZE bei Gießtemperatur [kg/m³] —
   nicht die Raumtemperatur-Dichte, denn alle Volumina im Dashboard
   (Füllkammer, Füllgrad, Anschnitt-Strömung) sind flüssige Schmelze.
   Tcast = Gießtemperatur [°C], Tflow = minimale
   Fließtemperatur [°C], Zconst = Z-Konstante der NADCA-Füllzeitformel [°C/%],
   solK = Erstarrungskonstante des Anschnitts [ms/mm²].
   Thermik für die Wärmebilanz der Zyklusanalyse: Tliq/Tsol = Liquidus-/
   Solidustemperatur [°C], hf = Erstarrungswärme [kJ/kg], cp20/cpS/cpL =
   spezifische Wärmekapazität bei 20 °C, Solidus, Liquidus [J/(kg·K)]
   (AlSi9Cu3 nach Quelle [B] 12.4.1; übrige Legierungen Literatur-Richtwerte).
   Die Schlüssel in 'fields' entsprechen den Eingabefeld-Keys des Dashboards
   (siehe js/config/fields.js). Neue Legierung = neuer Eintrag in der Liste.
   Die Werte sind Richtwerte aus der Literatur — vor Produktivnutzung gegen
   das eigene Datenblatt prüfen. */

window.__ALLOYS__ = {
  "alloys": [
    {
      "id": "alsi9cu3",
      "name": "AlSi9Cu3(Fe) — EN AC-46000 („226“)",
      "fields": { "density": 2420, "Tcast": 660, "Tflow": 580, "Zconst": 4.8, "solK": 10 , "Tliq": 593, "Tsol": 521, "hf": 403, "cp20": 846, "cpS": 1034, "cpL": 1056 }
    },
    {
      "id": "alsi10mnmg",
      "name": "AlSi10MnMg — Strukturguss (z. B. Silafont-36)",
      "fields": { "density": 2360, "Tcast": 680, "Tflow": 590, "Zconst": 4.8, "solK": 10 , "Tliq": 595, "Tsol": 555, "hf": 400, "cp20": 900, "cpS": 1050, "cpL": 1100 }
    },
    {
      "id": "alsi12",
      "name": "AlSi12(Fe) — EN AC-44300",
      "fields": { "density": 2340, "Tcast": 650, "Tflow": 565, "Zconst": 4.8, "solK": 10 , "Tliq": 580, "Tsol": 575, "hf": 400, "cp20": 880, "cpS": 1030, "cpL": 1060 }
    },
    {
      "id": "az91d",
      "name": "AZ91D — Magnesium",
      "fields": { "density": 1660, "Tcast": 650, "Tflow": 560, "Zconst": 3.6, "solK": 7 , "Tliq": 595, "Tsol": 470, "hf": 370, "cp20": 1020, "cpS": 1180, "cpL": 1250 }
    },
    {
      "id": "zamak5",
      "name": "ZnAl4Cu1 — Zamak 5",
      "fields": { "density": 6200, "Tcast": 420, "Tflow": 390, "Zconst": 3.2, "solK": 12 , "Tliq": 386, "Tsol": 380, "hf": 110, "cp20": 420, "cpS": 470, "cpL": 500 }
    }
  ]
};
