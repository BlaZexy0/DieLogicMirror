# Simulation einrichten (`/tools/simulation/`)

Eine Formfüllung mit dem DieLogic-Solver **dieLogicFoam** (DieLogic_OF,
OpenFOAM v2606 von openfoam.com) im Browser einrichten und als fertigen
OpenFOAM-Fall herunterladen. Die Seite ist ein 3D-Studio-Rahmen
(`/tools/3d-studio/js/studio/`) mit zehn Schritten, die wie ein Ablaufplan
nacheinander frei werden (ein Schritt öffnet sich erst, wenn alle davor
erledigt sind):

| # | Schritt | Werkzeug | erledigt, wenn |
|---|---|---|---|
| 1 | Körper | `steps.js` createKoerperTool — STL/GLB laden, Rollen, ✕ auch für das Bauteil (`app.removePart`) | ein Bauteil da ist |
| 2 | Anguss | Angussdesigner des Studios (`3d-studio/js/runner/tool.js`) — entfällt, wenn Anguss und Pressrest unter „Körper" aus Dateien kommen | Anguss oder Pressrest da ist |
| 3 | Überläufe | Überlaufdesigner (`3d-studio/js/vents/tool.js`) — entfällt bei Überläufen aus Dateien; wahlweise | immer (wahlweise) |
| 4 | Einlass | createFlaechenTool('inlet') — Vorschlag größte Kreisfläche (gilt beim ersten Besuch), „Andere Fläche wählen"; ein Block mit Fläche, Richtung, Tiefe; darunter Gießkammer ohne/mit und Kammerlänge | gewählt |
| 5 | Auslässe | createFlaechenTool('outlet') — je Fläche einmal „Auslass auswählen"; je Zeile Drossel/offen und ✕ | mindestens einer |
| 6 | Netz | createNetzTool — Zellgröße (Vorschlag: zwei Zellen über die dünnste Bauteilwand, höchstens rund 2 Mio. Zellen), Hintergrund, Stufen je Körper, Zelllänge der Kammer | gültig |
| 7 | Schusskurve | createSchussTool — 1. Phase (DieLogic/López/V₁ von Hand), 2. Phase (V₂ automatisch oder von Hand mit a₂, Vorschlag a₂), Kurvenbild | Kurve rechenbar |
| 8 | Prozess | createProzessTool — Schwerkraft, Temperaturen, Werte der Legierung | Temperaturen stimmig, mit Kammer Schwerkraft quer |
| 9 | Auswertung | createAuswertungTool — Kennwerte, Zeitpunkte (Füllgrad/Zeit/Kolbenweg × n), Format, Ansichten, Rahmen im Viewport | etwas gewählt |
| 10 | Fall | createExportTool — Name, Fall (Ordner und ZIP, Vorschlag `JJJJ-MM-TT_Name` mit dem Datum von heute, `build.js` caseName), ZIP im Worker | heruntergeladen |

Über jedem Schritt steht seine Überschrift mit Erklärung (`lead` in `STEPS`,
auch über den Designern); die Leiste zeigt erledigte Schritte getönt statt mit
Punkten — getönt erst, wenn man dort war (Prozess und Auswertung sind mit ihren
Vorgaben sonst schon vorher „fertig"). Einlass und Auslässe werden im Zielmodus
gewählt (Knopf „… auswählen", Hinweis im Bild, Esc beendet); jeder Treffer beendet
ihn. Vorschläge (Einlassfläche, Tiefe, Kammerlänge, Zellgröße, a₂) stehen überall
gleich als Zeile „Vorschlag" unter dem Feld: getönt mit Haken, wenn er gilt, sonst
mit „Übernehmen"; beim ersten Besuch gilt er, was man selbst setzt, bleibt
(`plan.mesh.cellSet`, `plan.shot.lengthSet`). Die Kammerlänge kommt aus der
Auslegung; beim Umschalten auf „mit Kammer" gilt ihr Vorschlag (Mitte des
Füllgrad-Bands), solange man sie nicht selbst eingetragen hat. Das Bauteil des Studios lässt sich entfernen: der Rahmen
behält sein Netz, die Seite nimmt es aus dem Plan und verbirgt es, bis ein neues
geladen ist.

Geladen wird nur unter „Körper". Ein entfallener Schritt verschwindet aus der
Leiste (`skip`), die Nummern zählen die sichtbaren Schritte; die Designer-Schritte
haben ihr „Weiter" im Zusatzstreifen unter dem Hauptknopf des Designers.

Die Designer werden **nicht verändert**: sie kommen mit derselben Fabrik wie in
der Werkbank (`mountStages`), ihre Körper laufen über `host.on('runner'|'vents')`
in den Plan (`js/plan.js`).

Im Bild sind die Körper deckend, auch beim Wählen der Flächen, in der Farbe
ihrer Rolle. Durchscheinend ist nur die Schmelze bei „Kammer voll": im
Pressrest ein Zylinder etwas größer als er (5 % des Radius, mindestens eine
halbe Zelle wie im Fall), so dass man den Pressrest darin sieht. Ein Pfeil in
der Hervorhebung zeigt den Zustrom am Einlass (−n, wie der Kolben schiebt).
Mit Kammer ist die Kammer nur von innen gezeichnet (`BackSide`): die Wand zum
Betrachter fällt weg, man sieht aus jeder Richtung auf die Schmelze darin,
hinten der Kolben.

Unter „Auswertung" stehen die Kennwerte als Liste (Haken = Bilder davon, Auge
= im Rahmen gezeigt); vorgegeben sind 100 Bilder je Kennwert und Ansicht. Der
Fall schreibt doppelt so viele Zeitstände über die Füllung (mindestens 60),
unabhängig von der Zahl der Kennwerte und Ansichten — sie lesen alle dieselben.

## Dateien

```
index.html          Seite (Import-Map auf /tools/3d-studio/vendor/three)
css/simulation.css  Leiste als Ablaufplan, Listen, Abschnitte, Bildrahmen
js/app.js           Gastgeber, Schritte, Sperre der Leiste, Dokument (Datei, Verlauf, Entwurf)
js/plan.js          der Plan: Körper, Einlass, Auslässe, Netz, Prozess, Auswertung
js/steps.js         die eigenen Schritte und die Bildschicht (Pickkörper, Marken, Schmelze, Kammer)
js/shot.js          Schusskurve der Auslegung auf das Modell (curvegen, computeShot), Kurvenbild
js/payload.js       Plan → Nutzlast für den Worker (Flächenmarken, Kurve, Farben der Palette)
js/build.js         Nutzlast → Vereinigung → Fall → ZIP (Worker und Tests)
js/worker.js        Rechnungen im Hintergrund (Fall, Anschnittfläche)
js/core/geometry.js Vereinigung der Körper, ebene Flächen, Einlassvorschlag, Wandstärke, Anschnittfläche
js/core/casegen.js  alle Dateien des Falls: Hauptordner (Allrun …) und simulation/ (Dictionaries,
                    0.orig, STL in m, Funktionsobjekte der Auswertung in system/auswertung)
js/core/render.js   Kennwerte, Leisten, Bildformat, auswertung.json
js/core/bilder.js   bilder.py für pvbatch (Bilder aus den Oberflächen der Rechnung)
js/core/bericht.js  bericht.py für Python 3 (Graphiken, Daten, bericht.html)
js/core/zip.js      ZIP ohne Bibliothek (deflate-raw über CompressionStream, Allrun 755)
```

## Wie aus überlappenden Körpern ein Netz wird

Die Körper überlappen sich (der Anguss steckt im Bauteil) oder berühren sich
(Anschnitt auf der Bauteilwand). Statt einer Booleschen Vereinigung ordnet
`unionSurfaces` jedes Dreieck ein: außerhalb aller anderen Körper (oder
gleichsinnig auf ihrem Rand, die gemeinsame Trennebene) → **Wand**; im
Innern eines anderen oder gegensinnig berührend → **innen**. Dreiecke, die
eine andere Oberfläche berühren oder kreuzen, werden an der längsten Kante
halbiert, bis sie unter der halben (feinsten) Zellgröße liegen. Die Wand geht
als `walls.stl`/`inlet.stl`/`vent*.stl`, das Innere als `internal.stl` nur
als Verfeinerungsbereich (`mode distance`) an snappyHexMesh: dort wird fein
wie an der Wand vernetzt, aber keine Fläche gebildet. (Als faceZone schnappte
snappyHexMesh Zellen auf jede innere Fläche; wo zwei nah beieinander liegen,
etwa das Ende des Angusses 1 mm im Pressrest, entstanden Zellscheiben — im
U-Profil kleinste Zelle halb so groß, Seitenverhältnis 8 statt 6. Den
Zeitschritt bestimmen in den Läufen aber die Geschwindigkeitsspitzen an der
freien Oberfläche, nicht diese Zellen.)

Zwei Fallen, die der Fall abfängt:
- **Zellmitten auf runden Ebenen.** Liegt eine Zellmitte genau auf der
  Trennebene z = 0, läuft snappyHexMesh an ihr vorbei ins Freie. Der
  Hintergrund ist deshalb um krumme Bruchteile der Zelle versetzt.
- **Lecks und verschwundene Flächen.** `locationsOutsideMesh` lässt
  snappyHexMesh bei einem Loch abbrechen und den Weg nach
  `postProcessing/constant/leakPath.vtp` schreiben; Allrun prüft danach, ob
  jede Randfläche im Netz angekommen ist (ein Körper dünner als zwei Zellen
  fehlt sonst still). Dünne Körper bekommen im Schritt Netz eigene Stufen
  (`refinementRegions … mode inside`), vorgeschlagen aus der Wandstärke.

## Schusskurve und Gießkammer

`js/shot.js` rechnet die Kurve mit den Generatoren der Auslegung auf das Modell
(Kolben-Ø = Einlass, Massen = Volumen × ρ_sol je Rolle, Kammerlänge aus der
Auslegung oder von Hand). Die 2. Phase setzt die Auslegung bei DieLogic und
López selbst (V₂ für die NADCA-Füllzeit, a<sub>max</sub>); von Hand ersetzt die Seite
alles ab „Kammer voll" durch eine Rampe mit a₂ auf V₂ (`rampTo`, wie `ramp` der
Auslegung) und nennt das a₂, das V₂ bis zum Füllende erreicht. **Ohne Kammer** geht der Teil ab „Kammer voll" als
Geschwindigkeitstabelle an den Einlass (`constant/plungerTable`). **Mit
Kammer** wird der Einlass um den Hub zurück extrudiert (`extrudeMesh`), der
Kolben fährt die ganze Kurve (`libshotSleeve`, `system/shotSleeveDict`,
Endplatte = Einlassfläche), die Schmelze liegt mit dem Füllgrad unter einer
waagerechten Ebene (`setAlphaField`) und nur in der Kammer (`topoSet` +
`setFields`); die langsame Phase schreibt selten, ab kurz vor „Kammer voll"
schaltet `timeActivatedFileUpdate` auf `controlDict.shot`. Bewegt wird nur die
`cellZone kammer` (`dynamicMultiMotionSolverFvMesh`, Zone aus `topoSet`):
libshotSleeve verdichtet jeden Punkt zwischen Endplatte und Kolben, gleich wie
weit von der Achse — ein Bauteil neben der Kammer, das hinter die Einlassfläche
reicht (die Gusstraube 107 mm), wurde mitgestaucht (Kammer6: 127 → 61 mm Tiefe
bei „Kammer voll"). Die Verfeinerungskörper (`body*.stl`) liegen auf dem Raster
von `edgeCheck` (0,1 µm, `snapTris`): zwei Ecken 0,07 µm nebeneinander in den
Überläufen der Gusstraube ließen snappyHexMesh „not closed" melden.

Anschnitte des Angussdesigners liegen genau an der Bauteilwand, die Nut über
der Trennebene — im Netz hinge das Bauteil nur an 0,05 mm. Die Seite legt je
Mündung eine **Anschnittzunge** (Querschnitt w × h, zwei Zellen über das
Bauteil) als eigenen Körper dazu.

## Der Fall

Rechnet ab „Kammer voll": der Pressrest ist voll Schmelze
(`setFieldsDict`, `cylinderToCell` hinter der Einlassfläche), der Kolben
drückt über `inlet` mit der Kolbengeschwindigkeit aus `constant/plungerTable`
nach. Auslässe sind Entlüftungen des Gasmodells (`constant/gasProperties`:
Drossel `Cd` mit der Patchfläche, oder `open`). Die Luft verlässt die Form
über das Gasmodell, nicht über die Randwerte; für die Schmelze ist eine
Drossel deshalb Wand (wie ein Entlüftungsblock), ein offener Auslass lässt
auch sie hinaus. Ohne das schoss der Strahl einer kleinen Platte durch
Bauteil und Überlauf zur Entlüftung hinaus, drei Viertel des Zuflusses
gingen verloren, und die Form wurde nie voll. Die Rechnung endet bei voller
Form (`stopAtFill`). Temperatur und Erstarrung
mit der Wärmeabgabe an die Form (`constant/thermalProperties`), Oxide und
mitgerissene Luft (`constant/inclusionProperties`).

```sh
unzip JJJJ-MM-TT_Name.zip && cd JJJJ-MM-TT_Name
source /usr/lib/openfoam/openfoam2606/etc/bashrc
./Allrun          # NP=8 ./Allrun · ./Allrun -mesh · ./Allrun -prepare · ./Allrun -auswertung
```

Der Fall ist ein Hauptordner mit den Skripten (`Allrun`, `Allclean`,
`bilder.py`, `bericht.py`, `auswertung.json`), dem OpenFOAM-Fall in
`simulation/` und am Ende `auswertung/` (`bericht.html`, `bilder/`,
`graphiken/`, `daten/`).

Während der Rechnung schreiben Funktionsobjekte (`simulation/system/auswertung`)
nur, was die Auswertung braucht — volle Zeitstände gibt es nur zum
Weiterrechnen (`purgeWrite 2`) und am Ende. Gemessen an der Gusstraube
(255 000 Zellen): ein voller Zeitstand 49 MB, die Oberflächen je Bild etwa ein
Fünftel davon, die Wand nur einmal als Geometrie (EnSight, `collateTimes`).

- `oberflaechen`: Isofläche alpha.melt = 0,5 (`schmelze`), alle Randflächen
  mit den Werten der Zellen dahinter (`wand`, patchInternalField), mit dem
  Kennwert „Eingeschlossene Luft" die Isofläche gasTrapped = 0,5 (`luft`) —
  in gleichen Zeitabständen, doppelt so oft wie Bilder je Kennwert.
- `ende`: die Wand mit der Füllzeit bei jedem vollen Zeitstand.
- Zeitreihen (400 über die Füllung): `fuellung` (Form = cellZone `form`
  aus `topoSet`, ohne Kammer und Pressrest), `schmelze` (mittlere
  Temperatur, Festanteil, Geschwindigkeit), `luft` (Luftmasse, eingeschlossenes
  Volumen und Masse über `exprField`), `gasdruck`, `einschluss` (mitgerissene
  Luft, Oxide), `kolbendruck`.

`bilder.py` (pvbatch) macht aus den Oberflächen je Kennwert, Zeitpunkt und
Ansicht ein Bild: die Wand bekommt Punktwerte und wird bei alpha = 0,5
punktweise abgeschnitten, mit der Isofläche zusammen die glatte Hülle der
Schmelze. Zeitpunkte nach Füllgrad, Zeit oder Kolbenweg (n Stück), Kameras
genau wie im Viewport, Farbleiste oben links. Je Kriterium eine Leiste, in
allen Bildern der Simulation dieselbe (`MAP_PRESETS` in `js/core/render.js`,
Stützstellen in `shared/palette.js`): Geschwindigkeit „Blue to Red Rainbow“
0–50 m/s, darüber Pink; Temperatur „Inferno (matplotlib)“ (wie eine
Wärmebildkamera); Lufteinschluss „Blue - Green - Orange“ linear 0–100 %; Oxide
„Plasma (matplotlib)“; Gasdruck „Blues“; Füllzeit „Viridis (matplotlib)“;
Erstarrt `festanteil` (flüssig orange, fest grau). Eingeschlossene Gasnester je zusammenhängendes Nest
mit seinem Druck (ohne die Schmelze), dazu am Ende je Nest Volumen, Druck und
Lage (`nester` in `bilder.json`). Die Nester sind die Isofläche von `luftEin`
(gasTrapped·(1 − alpha)): auf `gasTrapped` selbst blieb die Isofläche „topo"
leer, wenn die Rechnung ohne eingeschlossene Luft begann. `bericht.py` (nur
Python 3) schreibt die Graphiken (SVG), die Daten (CSV) und `bericht.html`:
über die ganze Breite, links ein Menü (Abschnitte, „Als PDF speichern" =
Drucken mit eigenem Drucklayout: je Kennwert vier Bilder statt des
Betrachters, A4), Kennzahlen, Bilder mit Zeitregler, „Eingeschlossene Luft"
(Bild am Ende, Tabelle der Nester, Verläufe von Luft, Gasdruck und
Entlüftung), die übrigen Verläufe mit Messwert unter dem Zeiger, die Eingaben.

## Tests

- `tests/web/3d-studio/tools/simulation.test.mjs` — Vereinigung, Einlass,
  Wandstärke, Fall, ZIP, die Seite mit dem Beispiel bis zum ZIP.
- `tests/browser/studio.spec.mjs` „Simulation einrichten" — echter Browser,
  echter Klick ins Bild, Fall im Worker, Download.
- Ob der Fall in OpenFOAM läuft, zeigt ein lokaler Lauf mit einem über die
  Seite gebauten Fall. Kurz und vollständig (Netz, Rechnung bis „Cavity
  filled", Bilder): eine Platte 100 × 60 × 4 mm mit Steg, Pressrest Ø 40 und
  Überlauf als STL-Dateien unter „Körper", Zellgröße 2 mm (6300
  Zellen, mit Kammer 11 000) — ohne Kammer rund 17 min, mit Gießkammer
  25 min auf einem Kern; Abbruch und Weiterrechnen geprüft (Oberflächen
  und Zeitreihen setzen nahtlos fort).
  Größere Teile brauchen Stunden: dieLogicFoam kostet um 2 s je Schritt
  (240 000 Zellen, 4 Kerne), und den Zeitschritt begrenzen die Spitzen der
  Geschwindigkeit an der freien Oberfläche (1–5 µs).
