# Simulation einrichten (`/tools/simulation/`)

Eine Formfüllung mit dem DieLogic-Solver **dieLogicFoam** (DieLogic_OF,
OpenFOAM v2606 von openfoam.com) im Browser einrichten und als fertigen
OpenFOAM-Fall herunterladen. Die Seite ist ein 3D-Studio-Rahmen
(`/tools/3d-studio/js/studio/`) mit neun Schritten, die wie ein Ablaufplan
nacheinander frei werden (ein Schritt öffnet sich erst, wenn alle davor
erledigt sind):

| # | Schritt | Werkzeug | erledigt, wenn |
|---|---|---|---|
| 1 | Körper | `steps.js` createKoerperTool — STL/GLB laden, Rollen | ein Bauteil da ist |
| 2 | Anguss | Angussdesigner des Studios (`3d-studio/js/runner/tool.js`) — entfällt, wenn Anguss und Pressrest unter „Körper" aus Dateien kommen | Anguss oder Pressrest da ist |
| 3 | Überläufe | Überlaufdesigner (`3d-studio/js/vents/tool.js`) — entfällt bei Überläufen aus Dateien; wahlweise | immer (wahlweise) |
| 4 | Einlass | createFlaechenTool('inlet') — Kreisfläche des Pressrests | gewählt |
| 5 | Auslässe | createFlaechenTool('outlet') — ebene Flächen | mindestens einer |
| 6 | Netz | createNetzTool — Zellgröße, Hintergrund, Stufen je Körper, Zelllänge der Kammer | gültig |
| 7 | Prozess | createProzessTool — Schusskurve (DieLogic/López/V₁V₂), mit/ohne Gießkammer, Kammerlänge, Temperaturen | Kurve rechenbar, Temperaturen stimmig |
| 8 | Auswertung | createAuswertungTool — Kennwerte, Zeitpunkte (Füllgrad/Zeit/Kolbenweg × n), Format, Ansichten, Rahmen im Viewport | etwas gewählt |
| 9 | Fall | createExportTool — ZIP im Worker | heruntergeladen |

Geladen wird nur unter „Körper". Ein entfallener Schritt verschwindet aus der
Leiste (`skip`), die Nummern zählen die sichtbaren Schritte; die Designer-Schritte
haben ihr „Weiter" im Zusatzstreifen unter dem Hauptknopf des Designers.

Die Designer werden **nicht verändert**: sie kommen mit derselben Fabrik wie in
der Werkbank (`mountStages`), ihre Körper laufen über `host.on('runner'|'vents')`
in den Plan (`js/plan.js`).

## Dateien

```
index.html          Seite (Import-Map auf /tools/3d-studio/vendor/three)
css/simulation.css  Leiste als Ablaufplan, Listen
js/app.js           Gastgeber, Schritte, Sperre der Leiste, Dokument (Datei, Verlauf, Entwurf)
js/plan.js          der Plan: Körper, Einlass, Auslässe, Netz, Prozess, Auswertung
js/steps.js         die eigenen Schritte und die Bildschicht (Pickkörper, Marken, Schmelzezylinder)
js/shot.js          Schusskurve der Auslegung auf das Modell (curvegen, computeShot), Kurvenbild
js/payload.js       Plan → Nutzlast für den Worker (Flächenmarken, Kurve, Farben der Palette)
js/build.js         Nutzlast → Vereinigung → Fall → ZIP (Worker und Tests)
js/worker.js        Rechnungen im Hintergrund (Fall, Anschnittfläche)
js/core/geometry.js Vereinigung der Körper, ebene Flächen, Einlassvorschlag, Wandstärke, Anschnittfläche
js/core/casegen.js  alle Dateien des OpenFOAM-Falls (Allrun, Dictionaries, 0.orig, STL in m)
js/core/render.js   render.py für pvbatch (Bilder der Auswertung)
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
Auslegung oder von Hand). **Ohne Kammer** geht der Teil ab „Kammer voll" als
Geschwindigkeitstabelle an den Einlass (`constant/plungerTable`). **Mit
Kammer** wird der Einlass um den Hub zurück extrudiert (`extrudeMesh`), der
Kolben fährt die ganze Kurve (`libshotSleeve`, `system/shotSleeveDict`,
Endplatte = Einlassfläche), die Schmelze liegt mit dem Füllgrad unter einer
waagerechten Ebene (`setAlphaField`) und nur in der Kammer (`topoSet` +
`setFields`); die langsame Phase schreibt selten, ab kurz vor „Kammer voll"
schaltet `timeActivatedFileUpdate` auf `controlDict.shot`.

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
unzip Name_openfoam.zip && cd Name_openfoam
source /usr/lib/openfoam/openfoam2606/etc/bashrc
./Allrun          # NP=8 ./Allrun · ./Allrun -mesh · ./Allrun -prepare
```

`render.py` (pvbatch) schreibt je Kennwert, Zeitpunkt und Ansicht ein Bild nach
`images/`: Zeitpunkte nach Füllgrad der Form, Zeit oder Kolbenweg (n Stück),
Seitenverhältnis und Breite von der Seite, Kameras genau wie im Viewport
übernommen, Farbleiste oben links (alle Kennwerte mit der Leiste `heat` der
Palette). Der Füllgrad zählt nur die Form, nicht den Kammerzylinder.

## Tests

- `tests/web/3d-studio/tools/simulation.test.mjs` — Vereinigung, Einlass,
  Wandstärke, Fall, ZIP, die Seite mit dem Beispiel bis zum ZIP.
- `tests/browser/studio.spec.mjs` „Simulation einrichten" — echter Browser,
  echter Klick ins Bild, Fall im Worker, Download.
- Ob der Fall in OpenFOAM läuft, zeigt ein lokaler Lauf mit einem über die
  Seite gebauten Fall. Kurz und vollständig (Netz, Rechnung bis „Cavity
  filled", Bilder): eine Platte 100 × 60 × 4 mm mit Steg, Pressrest Ø 40 und
  Überlauf als STL-Dateien unter „Körper", Zellgröße „passend" (2 mm, 6300
  Zellen, mit Kammer 11 000) — ohne Kammer rund 17 min, mit Gießkammer
  25 min auf einem Kern.
  Größere Teile brauchen Stunden: dieLogicFoam kostet um 2 s je Schritt
  (240 000 Zellen, 4 Kerne), und den Zeitschritt begrenzen die Spitzen der
  Geschwindigkeit an der freien Oberfläche (1–5 µs).
