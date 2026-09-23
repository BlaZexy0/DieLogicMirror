# 3D-Studio — Grundlagen, auf die sich alle Werkzeuge verlassen

Was die einzelnen Werkzeuge tun und wie sie gebaut sind, steht im README des
Studios (`web/tools/3d-studio/README.md`). Dieses Dokument hält fest, was
quer über alle Werkzeuge gilt und was eine Änderung unangetastet lassen muss:
Koordinatenrahmen, Beispielteile, die Beispielform, Dateiformate und die
Gestaltungsregeln.

## Einheiten und Koordinatenrahmen

Alle Geometrie ist in Millimetern, wie modelliert. Nichts wird umskaliert.

| Rahmen | gilt für | Festlegung |
|---|---|---|
| **Bauteilrahmen** | Beispielteile, Entformung, Wandstärke, Abstand, Füllung, Überlauf, Temperier | Trennebene z = 0, die Form öffnet entlang +z. Das Teil liegt auf der Seite, die seine Gestalt verlangt: Getriebedeckel und Ölwanne hängen mit dem Flansch auf der Ebene unter z = 0, Kühlkörper und U-Profil stehen darauf. |
| **Formrahmen** | Formaufbau, `assets/die.glb` | Maschinenachse z, Trennebene z = 0, feste Hälfte z < 0, bewegliche z > 0, y zeigt nach oben. Ein Teil im Bauteilrahmen passt ohne Drehung hinein. |
| **Angussrahmen** | Angussdesigner | Trennebene y = 0, die Kavität liegt nach +y; die Pressrest-Achse ist +y, seine Dicke wächst nach −y. Ein Referenzteil aus dem Bauteilrahmen wird um x um 90° gedreht und an die Anschnitte geschoben (`ref` in `js/runner/presets.js`). |
| **Werkbank** | alle sechs Schritte | alles im Bauteilrahmen. Der Angussvorschlag nimmt die Pressrest-Achse −z: Kanäle und Pressrest wachsen als Nuten nach +z in die bewegliche Hälfte; der Pressrest sitzt vor der Teilkante bei y = min, die Anschnitte liegen auf dieser Kante in der Trennebene und werden mit einem Strahl in +y an die Wand gebunden (`js/werkbank/propose.js`, `gateRays`). Ein geladener Angussdesigner-Plan behält seine Achse; die Seite sagt das. |

## Beispielteile (`assets/parts/`, gelistet in `js/part/demoparts.js`)

Die vier Gussteile entstehen im Schwesterprojekt `openscad_parts/`
(`parts/*.scad` mit `lib/hpdc.scad`), ausgelegt für 1200–1600-t-Maschinen
und als Rohguss modelliert: Schräge an jedem Merkmal, blinde geschrägte
Vorbohrungen statt Durchgangslöchern, Rundungen an Rippen- und Augenfüßen,
gerundete freie Rippenenden.

| id | Bezeichnung | Maße (mm) | Volumen | Wand 2V/A | Dreiecke | Hinweise |
|---|---|---|---|---|---|---|
| `gearbox_cover` | Getriebedeckel mit Schiebern | 424 × 344 × 92 | 1263 cm³ | 4,7 mm | 59 682 | Vorgabe der meisten Werkzeuge; zwei Seitenflächen brauchen Schieber; +X-Wand 1,5° geschrägt (Tests messen gegen x = 190 + z·tan 1,5°) |
| `oil_pan` | Ölwanne | 444 × 334 × 127 | 1334 cm³ | 4,6 mm | 38 648 | das Teil in der Beispielform; das Anguss-Preset „Ölwanne" setzt vier Anschnitte auf die lange Flanschkante |
| `heat_sink` | Kühlkörper | 420 × 300 × 53 | 2007 cm³ | 4,1 mm | 32 032 | Rippenfeld, keine Schieber |
| `u_channel_ribbed` | U-Profil mit Rippen | 38 × 300 × 40 | 144 cm³ | 3,7 mm | 13 460 | das erste Teil; keine Schieber — der Prüffall der Teilungsregeln |
| `coolfix`, `coolmov` | Temperierung fest/beweglich | – | 368/371 cm³ | – | ~1 440 | die Kühlkreise der Beispielform, nur als Gegenstück in der Abstandsanalyse |

Was die Tests daran festhalten: keine Schieber und keine Hinterschnitte an
U-Profil, Kühlkörper und Ölwanne; Schieber, aber keine Hinterschnitte am
Getriebedeckel. Eine Analyse muss auf allen vier Teilen stimmen — jede
Änderung wird gegen sie geprüft.

Die Dreieckszahlen gelten nach dem Export mit `--max-area 100` (siehe
„Modelle neu erzeugen" im README des Studios). Die Seiten verfeinern ein Netz
nie selbst: feine Tessellierung ist Sache des Exports.

## Die Beispielform (`assets/die.glb`)

Eine Kaltkammer-Form um die Ölwanne, erzeugt von
`openscad_parts/dies/oil_pan_die.scad` und zusammengesetzt von
`scripts/3d-studio/build-die-stl.mjs` aus dem Manifest
`dies/oil_pan_die.json`. Zwanzig Teile:

| Gruppe | Teile (Registry-id · Material) |
|---|---|
| feste Seite | fixHalf, fixInsert, sleeve, guidePillars, ventBlockFix · steel; sleeve_plunger · plunger |
| Temperierung fest | coolFixL, coolFixR · coolFix |
| bewegliche Seite | movHalf, movInsert, ejBox, ejector, guideBushings, ventBlockMov · steel; ejector_pins · pins |
| Temperierung beweglich | coolMovL, coolMovR · coolMov |
| Guss | castPart · castPart; castRunner · castRunner; castOverflow · castOverflow |

**GLB-Vertrag** (was `js/assembly.js` liest und schreibt): ein Wurzelknoten
`die` mit den Kindern `fixedRoot` und `movingRoot`; ein Gruppenknoten je
Registry-id; Netze heißen `<id>_<material>` und tragen `extras.compId`;
Materialnamen `steel`, `plunger`, `pins`, `coolFix`, `coolMov`, `castPart`,
`castRunner`, `castOverflow` (`js/materials.js`); die Metadaten des Aufbaus
stehen in den extras der Wurzel als `userData.formaufbau` (Format
`dielogic-formaufbau`: Gruppen mit Seite, Materialklasse, wahlweise
Schieberrichtung und -weg; Öffnungsweg). Jede GLB, die diesem Vertrag folgt,
lässt sich im Formaufbau wieder öffnen.

Beim Lesen genügen `fixedRoot` und `movingRoot`. Knoten, die weder die
Metadaten noch die Registry kennen (ein CAD-Export mit eigenen Namen),
werden je Seite Teile der Gruppen „Sonstige Teile fest" bzw. „Sonstige
Teile beweglich" (`otherFix`, `otherMov`) und so mit der Datei gespeichert.
Jeder Knoten behält seine Lage aus der Datei. Geschrieben wird immer bei
geschlossener Form, jeder Knoten mit seiner ganzen Lage relativ zu dem,
woran er in der Datei hängt (die Wurzeln zu `die`, ein Teil zu seiner
Wurzel, ein Netz zu seinem Teil), und mit sauberen Materialien: deckend,
ohne Leuchten, in der Farbe des Teils. Deckkraft Stahl, Hervorhebung und
Schnitt gehören der Ansicht, nicht der Datei.

## Dateiformate

Jede gespeicherte Datei trägt `format` und `version`. Jeder Lader prüft den
Formatschlüssel und lehnt neuere Versionen mit einer klaren Meldung ab. Eine
Datei enthält den Plan oder die Einstellungen — nie das Netz.

Die Kennungen der Knoten und Elemente in den Plänen (`dielogic-anguss`,
`-luft`, `-temperier`, `-fuellung`, auch in einer Werkbankdatei) landen in
der Seite (Liste, Auswahlfeld, Prüfsätze, Tabellen) und müssen
`^[A-Za-z][A-Za-z0-9_-]{0,31}$` genügen: vorn ein Buchstabe, dann
Buchstaben, Ziffern, `_` und `-`, höchstens 32 Zeichen. Eine Datei mit einer
anderen wird abgewiesen, nicht umgeschrieben. Die Designer mit Elementen
(`dielogic-luft`, `-temperier`, `-fuellung`) vergeben fehlende oder doppelte
Kennungen neu, weisen ein Element ohne Lage aus drei Zahlen ab und klemmen
Maße und Werte auf die Grenzen ihrer Felder. Der Angussdesigner weist auch
doppelte Kennungen ab, setzt für unlesbare Zahlen die Vorgabe und lässt
fallen, was die Wurzel nicht erreicht.

| Format | Version | Werkzeug | Inhalt |
|---|---|---|---|
| `dielogic-anguss` | 1 | Angussdesigner | Pressrest, globale Querschnittswerte (Schräge, Bodenradius, Zwickelradius `branchR` — fehlt in Dateien vor dem 2026-09-12, dann 4 mm —, Spannung, Schrittweite, Anschnitthöhe), Knoten (Art, Eltern, Kinder, Lage, Neigung, Querschnitt, Verhältnis, Spiegelmarke, Anschnittdaten, Zielrichtung) |
| `dielogic-luft` | 3 | Überlaufdesigner | Elemente mit Art, Lage, Außennormale, Drehung, Maßen; Bohnen mit Entlüftung tragen `vent`, die Kanalpunkte in Koordinaten der Wandebene (Dateien der Version 2 mit einer Kanallänge werden auf einen Punkt umgestellt; Dateien der Version 1 werden umgerechnet: ihre Ausstoßachse `axis` wird die Hochachse `dir`, die Drehung `rot` so, dass die Längsrichtung bleibt) |
| `dielogic-fuellung` | 1 | Füllabschätzung | Anschnitte mit Lage, Normale, Drehung, Breite, Höhe, wahlweise Anteil; α (ältere Dateien können eine Füllzeit tragen — sie wird ignoriert) |
| `dielogic-temperier` | 1 | Temperierkanal-Designer | Abstand der Offsetfläche (5 bis 60 mm); die Vorgaben `defaults` `{d, len, kd}` (Ø und Länge des Kühlstichs, Ø des Kanals; fehlen sie, gelten 20, 200 und 10 mm); wahlweise ein eigener Mindest-Wandabstand `minWall`; Kühlstiche mit Spitze, Richtung, Durchmesser, Länge und `auto`-Marke; Kanäle mit beiden Enden und Durchmesser |
| `dielogic-formaufbau` | 1 | Formaufbau | in den extras der GLB, siehe oben |
| `dielogic-werkbank` | 1 | Werkbank | Verweis aufs Teil (Demo-id, Name — keine Geometrie), der Angussgraph (`anguss`) mit Prozesswerten (`prozess`), die Fülleinstellungen (`fuellung`: α, Zahl der Stellen), der Überlaufplan (`luft`) und der Temperierplan (`temperier`), jeder in seinem Format oben |
| `dielogic-wandstaerke` | 1 | Wandstärkenanalyse | Einstellungen: Zellkante, Untermaß, Anzeige, Deckkraft, Schnitt (Achse, Lage), Wärmezentren (Form, Mindestgröße) |
| `dielogic-entformung` | 1 | Entformungsanalyse | Einstellungen: Öffnungsachse und bewegliche Seite, Reiter, Schrägengrenze, Anzeige von Trennlinie und Kanten, Formansicht, Flächenansicht, Haftung (Reibwert, Abstand, Deckkraft) |
| `dielogic-abstand` | 1 | Abstandsanalyse | Einstellungen: Reichweite der Farbskala, gefärbte Datei, Deckkraft, Sichtbarkeit beider Dateien |

Die letzten drei sind Einstellungsdateien der Werkzeuge im gemeinsamen Rahmen
(`js/studio/`): „merken, laden, zurücksetzen" — ein Ergebnis steckt nicht
darin, es entsteht beim Laden des Teils neu.

Eingaben sind STL (ASCII oder binär) und GLB (glTF 2.0 binär, ohne
Erweiterungen, nur Dreiecke). Exporte sind binäre STL und die GLB oben.

## Gestaltungsregeln

- Eine Quelle der Wahrheit je Werkzeug (ein Graph oder ein Plan in
  `model.js`/`graph.js`); Geometrie, Zahlen und Prüfregeln werden bei jeder
  Änderung daraus abgeleitet und nie gespeichert.
- Werkzeuge sind schnell und haben keine Stellschrauben zum Nachjustieren
  eines Verfahrens. Eine Analyse läuft beim Laden.
- Teile sind Rohguss: gekernte Löcher sind blinde geschrägte Vorbohrungen,
  freie Rippenenden laufen gerundet aus, Rippenenden an einer Wand laufen in
  sie hinein.
- Geometrie wird als Dreieckssuppe ausgetauscht (9 Floats je Dreieck);
  Vereinigungen entstehen durch Überlappung, nicht durch Boolesche
  Operationen — außer wo `csg.js` bewusst eingesetzt wird. Der Angusskörper
  ist die Ausnahme in die andere Richtung: EIN geschlossener Körper aus
  konstruierten Gabelungsflächen (`js/runner/sweep.js`), analytisch, ohne
  Boolesche Operationen, ohne Raster.
- Deckungsgleiche Flächen überlappender Körper löst das Material
  (Polygon-Offset), nicht das Beschneiden der Geometrie.
- Gezeichnet wird mit WebGL über Three.js. WebGPU rechnet nur, wo es sich
  lohnt: die Gitter-Boltzmann- und Partikel-Kerne von Anguss- und
  Kammerfüllung, jeweils mit JavaScript als Rückfall.
- Fremdbibliotheken liegen in `vendor/`: Three.js überall, dazu
  onnxruntime-web für das eine trainierte Modell (`models/`, das Metamodell
  der Kammerfüllung, `js/meta/`). Beides (das Modell 3,6 MB, das
  Rechenwerk 14 MB) lädt die Kammerfüllung erst beim ersten Lauf mit dem
  Metamodell: rund 18 MB gehören auf keine andere Seite.
- `mesh.js`, `solids.js`, `csg.js`, `part/glbio.js`, `part/stlio.js`
  importieren Three.js nicht und laufen deshalb unter Node in den Tests.
- Oberfläche und Dokumentation des Studios sind deutsch.
