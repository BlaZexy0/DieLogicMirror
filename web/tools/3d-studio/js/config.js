/* Maße der Beispiel-Druckgießform in mm. Alles Prozedurale (components.js)
   liest nur aus diesem Objekt — bei einer späteren Integration in DieLogic
   können die Werte aus dem Projektzustand gespeist werden (Kolben-Ø,
   Kammerlänge, Bauteilmaße …), ohne die Geometrie-Bausteine anzufassen.

   Koordinaten: Maschinenachse = z, Trennebene bei z = 0.
   Feste Formhälfte z < 0, bewegliche Hälfte z > 0 (öffnet nach +z), y = oben.

   Entformbarkeit: die Kavität hat ihren größten Querschnitt an der
   Trennebene und verjüngt sich in beide Hälften (Schrägen in Grad). Alle
   Stahlteile bekommen die Kavität, die Füllkammer, die Stifte und die
   Säulen in components.js als echtes Negativ ausgeschnitten. */

export const CFG = {
  die:    { W: 700, H: 820, tFix: 250, tMov: 280 },      // Formhälften (Breite × Höhe × Dicke)
  insert: { W: 420, H: 540, tFix: 100, tMov: 120 },      // Formeinsätze, bündig zur Trennebene

  /* ── Gussteil ── */
  part:   { W: 260, H: 170, tFix: 18, tMov: 52, y: 40, draft: 2 },   // Grundkörper (Anteil je Hälfte)
  boss:   { d: 96, h: 42, draft: 2 },                                // Dom auf der beweglichen Seite
  core:   { d: 40, draft: 1.5, seat: 12 },                           // Kernstift durch Dom + Grundkörper
  flange: { W: 300, H: 30, tFix: 8, tMov: 12, draft: 2 },            // Flansch an der Unterkante

  /* ── Gießsystem ── */
  sleeve: { d: 130, wall: 25, len: 550, y: -200, pourD: 90, pourZ: -450 }, // Füllkammer + Gießloch
  plunger: { rodD: 45, tipT: 70, rest: 25 },             // Gießkolben, rest = Dicke des Pressrests
  sprue:  { dPlane: 134, dBack: 130 },                   // Angusskegel im festen Einsatz (konisch)
  runner: { w: 60, t: 14 },                              // Anguss (Kanal in der beweglichen Hälfte)
  gate:   { w: 170, t: 5, h: 26 },                       // Anschnitt (Fächer zum Flansch)
  overflow: { n: 4, w: 36, h: 26, t: 12 },               // Überläufe an der Bauteil-Oberkante
  vent:   { w: 180, t: 3 },                              // Entlüftungskanal zum Vakuumblock
  ventBlock: { W: 140, H: 90, T: 45, grooves: 4, grooveH: 6, grooveT: 8 },  // Vakuumblock (Waschbrett)

  /* ── Temperierung ── */
  /* Je Hälfte zwei getrennte Kreise (links/rechts) — ein durchgehender
     Serpentinenkreis müsste unten quer durch den Angusskegel laufen.
     Die x-Lagen halten Abstand zu Kegel, Dom, Kernstift und
     Auswerferstiften. */
  cool:   { d: 12, zFix: -60, zMov: 70, span: 230,
            xFix: [[-160, -80], [80, 160]], xMov: [[-170, -85], [85, 170]] },

  /* ── Auswerfer ── */
  ejector: { plateW: 540, plateH: 700, plateT: 30, boxLen: 160, backT: 45, boxRail: 70,
             pinD: 12, pinX: [-100, 0, 100], pinY: [-18, 98],
             returnD: 22, returnPos: [[-250, -250], [250, -250], [-250, 250], [250, 250]],
             railGap: 30, headT: 8, rodD: 160 },   // rodD = Durchbruch der Aufspannplatte

  /* ── Führung ── */
  guide:  { d: 55, insetX: 70, insetY: 70, z0: -200, z1: 150,
            bushOD: 77, bushZ0: 0, bushZ1: 130 },

  fit: 0.15,          // Luftspalt zwischen Einbauteil/Gussteil und Stahl (Negativ wird so viel größer)
  openTravel: 420     // max. Öffnungsweg des Schiebers „Form öffnen"
};
