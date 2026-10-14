# Erstarrung einrichten (`/tools/erstarrung/`)

Die Erstarrung eines Schusses mit dem DieLogic-Solver **dieLogicSolFoam**
(dieLogicSol, OpenFOAM v2606) im Browser einrichten und als fertigen
OpenFOAM-Fall herunterladen — der zweite Assistent unter „Simulation", neben
„Simulation einrichten" (Füllung, dieLogicFoam). Derselbe Rahmen des
3D-Studios, dieselbe Leiste als Ablaufplan:

| # | Schritt | Werkzeug | erledigt, wenn |
|---|---|---|---|
| 1 | Körper | `createKoerperTool` aus `../simulation/js/steps.js` | ein Bauteil da ist |
| 2 | Anguss | Angussdesigner des Studios — entfällt bei Dateien | Anguss oder Pressrest da ist |
| 3 | Überläufe | Überlaufdesigner — entfällt bei Dateien; wahlweise | immer |
| 4 | Kolben | `createKolbenTool` — die Kreisfläche des Pressrests (Vorschlag: die größte), dahinter die Kolbenspitze bis zum Rand des Blocks | gewählt |
| 5 | Form | `createFormTool` — Stahl um das Gussteil (Vorschlag 1,5 × Tiefe des Pressrests, 30 … 80 mm), Trennebene z (Vorschlag 0); feste Hälfte = Seite des Kolbens | immer |
| 6 | Kühlung | `createKuehlungTool` — gerade Kanäle (von, bis, Ø, Wasser, h), „Vorschlag setzen" (je Hälfte zwei längs des Bauteils), Abstand zur Kavität je Kanal; wahlweise | immer |
| 7 | Netz | `createNetzTool` — Zellgröße im Gussteil (Vorschlag: zwei Zellen über die dünnste Wand, Budget 3 Mio.), Zellen im Stahl 2×/4×/8×, Prozesse | gültig |
| 8 | Prozess | `createProzessTool` — Legierung (Bibliothek von dieLogicSol oder die der Auslegung mit linearer Kurve), Temperaturen, Füllzeit, Nachdruck, ein Schuss oder Zyklen, Zustand am Füllende gleichmäßig oder aus einer Füllrechnung | Temperaturen und Takt stimmig |
| 9 | Auswertung | `createAuswertungTool` — Kennwerte, Bilder der Erstarrungsfolge, Ansichten, Format | etwas gewählt |
| 10 | Fall | `createExportTool` — Name, Fall `JJJJ-MM-TT_Name_Erstarrung`, ZIP im Worker | heruntergeladen |

Der Plan ist der von „Simulation einrichten" (`../simulation/js/plan.js`):
Körper und die Kolbenfläche in `plan.inlet`; alles Übrige der Erstarrung in
`plan.sol` (`js/plan.js`). Im Bild (`createSolLayer`): die Körper, die
Kolbenfläche (Markierung) mit dem Kolben dahinter, ab dem Schritt Kolben der
Formblock als Kanten in den Farben der Hälften (fest gelb, beweglich rosa)
und die Kühlkanäle (gewählt: hervorgehoben).

## Der Fall (`js/core/solcase.js`)

Vorbild ist plateShot3D von dieLogicSol: ein Netz für Gussteil und Form.

- **Formblock**: Quader um alle Gusskörper mit dem Rand je Seite, blockMesh
  mit den Zellen des Stahls (Gussteil × 2^k), krumm versetzt.
- **Gussteil**: die Vereinigung der Körper (`unionSurfaces`) als
  `casting.stl`, in snappyHexMesh die faceZone `casting` mit der cellZone `gussteil`
  (nicht `casting`: so heißt bei dieLogicSolFoam die Gruppe, in
  `solidificationTimes.dat` die Zeile für das ganze Gussteil)
  (Flutung ab einem Punkt im Pressrest); innen und in einem Band um das
  Gussteil die Zellgröße des Gussteils.
- **Kühlkanäle**: `searchableCylinder`, je Kanal ein Rand `kanalN` mit seinem
  Wasser (convective h, Tinf).
- **topoSet**: der Speiser (cellZone `feeder`: der Pressrest, die Zellen im
  Zylinder hinter der Kolbenfläche bis zu seiner Tiefe; eine Zelle gehört
  nur einer Zone, das Gussteil sind `gussteil` und `feeder`; nur die erste
  Schicht am gekühlten Kolben fror sofort ein und schnitt die Speisung ab),
  der Kolben (`plunger`, Zylinder hinter der Fläche bis zum Rand), die
  bewegliche Hälfte (`dieMoving`), der Rand `plungerEnd`. Die Zonen werden
  aus `zones (gussteil feeder)` gebildet: topoSet darf noch einmal laufen.
- **Allrun**: snappyHexMesh auf NP Prozessen (decomposePar,
  reconstructParMesh), setFields, wahlweise `dieLogicSolMapFill -source
  $FUELLUNG` (dann ohne `fillEndTime`), dieLogicSolFoam, Auswertung.
- **Auswertung während der Rechnung** (`system/auswertung`): die Restschmelze
  (Festanteil 0,7) als Isofläche im Gussteil mit `feedingState`, und am Ende
  die Oberfläche des Gussteils (faceZone) mit Erstarrungszeit, Porosität,
  Formtemperatur, Klebeindex. `bilder.py` (pvbatch, `core/bilder.js`) und
  `bericht.py` (Python 3, `core/bericht.js`; Aufbau, Graphiken und
  Betrachter wie der Bericht der Füllung) machen daraus Bilder und
  `auswertung/bericht.html`.

## Dateien

```
index.html          Seite (Import-Map auf /tools/3d-studio/vendor/three)
css/erstarrung.css  Kanäle, Häkchenlisten (dazu ../simulation/css/simulation.css)
js/app.js           Gastgeber, Schritte, Sperre der Leiste, Dokument
js/plan.js          createSolPlan: der Plan der Füllung + plan.sol
js/steps.js         die eigenen Schritte und die Bildschicht
js/payload.js       Plan → Nutzlast (Legierung, Farben der Palette)
js/build.js         Nutzlast → Vereinigung → Fall → ZIP (Worker und Tests)
js/worker.js        der Fall im Hintergrund
js/core/materials.js Legierungen (dieLogicSol materials/), Stahl, Kolben
js/core/solcase.js  alle Dateien des Falls
js/core/bilder.js   bilder.py (pvbatch)
js/core/bericht.js  bericht.py (Python 3)
```

Geprüft mit echten Läufen (Gusstraube 2 mm, 1,3 Mio. Zellen; Platte mit Dom 1 mm,
0,4 Mio. Zellen, snappyHexMesh auf 6 Prozessen) und
`tests/web/3d-studio/tools/erstarrung.test.mjs`.
