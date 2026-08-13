/* Legierungs-Presets — hier direkt editieren, kein Build nötig.
   Einheiten: density [kg/m³], Tcast = Gießtemperatur [°C], Tflow = minimale
   Fließtemperatur [°C], Zconst = Z-Konstante der NADCA-Füllzeitformel [°C/%],
   solK = Erstarrungskonstante des Anschnitts [ms/mm²].
   Die Schlüssel in 'fields' entsprechen den Eingabefeld-Keys des Dashboards
   (siehe js/config/fields.js). Neue Legierung = neuer Eintrag in der Liste.
   Die Werte sind Richtwerte aus der Literatur — vor Produktivnutzung gegen
   das eigene Datenblatt prüfen. */

window.__ALLOYS__ = {
  "alloys": [
    {
      "id": "alsi9cu3",
      "name": "AlSi9Cu3(Fe) — EN AC-46000 („226“)",
      "fields": { "density": 2750, "Tcast": 660, "Tflow": 580, "Zconst": 4.8, "solK": 10 }
    },
    {
      "id": "alsi10mnmg",
      "name": "AlSi10MnMg — Strukturguss (z. B. Silafont-36)",
      "fields": { "density": 2680, "Tcast": 680, "Tflow": 590, "Zconst": 4.8, "solK": 10 }
    },
    {
      "id": "alsi12",
      "name": "AlSi12(Fe) — EN AC-44300",
      "fields": { "density": 2650, "Tcast": 650, "Tflow": 565, "Zconst": 4.8, "solK": 10 }
    },
    {
      "id": "az91d",
      "name": "AZ91D — Magnesium",
      "fields": { "density": 1810, "Tcast": 650, "Tflow": 560, "Zconst": 3.6, "solK": 7 }
    },
    {
      "id": "zamak5",
      "name": "ZnAl4Cu1 — Zamak 5",
      "fields": { "density": 6700, "Tcast": 420, "Tflow": 390, "Zconst": 3.2, "solK": 12 }
    }
  ]
};
