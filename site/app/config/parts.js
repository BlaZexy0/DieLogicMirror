/* Bauteiltyp-Presets — hier direkt editieren, kein Build nötig.
   Einheiten: wall = charakteristische Wandstärke [mm], wallMin/wallMax =
   Wandstärkenbereich [mm], Tdie = Formtemperatur [°C], Sfrac = zulässiger
   Feststoffanteil am Ende der Füllung [%], kfill = NADCA-Faktor k [ms/mm].
   Die Schlüssel in 'fields' entsprechen den Eingabefeld-Keys des Dashboards
   (siehe js/config/fields.js). Neuer Bauteiltyp = neuer Eintrag in der Liste.
   Die Werte sind Richtwerte — an die eigene Anwendung anpassen. */

window.__PARTS__ = {
  "parts": [
    {
      "id": "struktur",
      "name": "Strukturgussteil (dünnwandig)",
      "fields": { "wall": 2.5, "wallMin": 1.5, "wallMax": 4, "Tdie": 220, "Sfrac": 20, "kfill": 30 }
    },
    {
      "id": "gehaeuse",
      "name": "Gehäuseteil (Standard)",
      "fields": { "wall": 3.5, "wallMin": 2, "wallMax": 8, "Tdie": 200, "Sfrac": 20, "kfill": 35 }
    },
    {
      "id": "dickwandig",
      "name": "Dickwandiges Teil (z. B. Getriebegehäuse)",
      "fields": { "wall": 6, "wallMin": 3, "wallMax": 12, "Tdie": 180, "Sfrac": 25, "kfill": 40 }
    }
  ]
};
