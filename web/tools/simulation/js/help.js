/* Die Hilfe von „Simulation einrichten": vorn der Ablauf, dann je Designer
   seine eigene Hilfe aus dem Studio (wie in der Werkbank). */

import { HELP as ANGUSS } from '../../3d-studio/js/runner/help.js';
import { HELP as UEBERLAUF } from '../../3d-studio/js/vents/help.js';

const part = (owner, title, body) => '<div data-help-owner="' + owner + '"><h2 class="st-help-part">' + title + '</h2>' + body + '</div>';

const INTRO = `
<section data-help-anchor="simulation">
<h3>Simulation einrichten</h3>
<p>Aus den Körpern der Form entsteht ein OpenFOAM-Fall für den DieLogic-Solver <b>dieLogicFoam</b>: Netz mit
snappyHexMesh, Anfangs- und Randwerte, Solver-Einstellungen, ein <code>Allrun</code>, das alles nacheinander
ausführt, und <code>render.py</code> für die Bilder der Auswertung. Die Schritte links sind ein Ablaufplan: ein
Schritt öffnet sich erst, wenn alle davor erledigt sind.</p>
<p>Gerechnet wird im <b>Bauteilsystem</b> in mm: Trennebene z = 0, die Form öffnet nach +z. Alle Körper müssen
geschlossene Netze sein. Sie dürfen sich überlappen oder berühren (der Anguss steckt im Bauteil, der Anschnitt
liegt auf der Bauteilwand): gerechnet wird die Vereinigung, Wände im Innern eines anderen Körpers werden zu
inneren Flächen, die das Netz nicht trennen.</p>
</section>
<section data-help-anchor="ablauf">
<h3>Die Schritte</h3>
<p><b>Körper</b>: STL oder GLB laden (mehrere auf einmal, auch durch Ablegen ins Bild); eine GLB mit mehreren
Knoten ergibt mehrere Körper. Jeder Körper hat eine Rolle; das erste Bauteil wird das Bauteil des Studios, an
dem die Designer bauen. <b>Anguss</b> und <b>Überläufe</b>: im Designer bauen. Liegen Anguss und
Pressrest (bzw. Überläufe) schon als Dateien unter „Körper", entfällt der Schritt und verschwindet aus der
Leiste. Überläufe sind wahlweise: „Ohne Überläufe weiter" unter dem Knopf des Designers. <b>Einlass</b>: die große Kreisfläche des Pressrests. Der
Pressrest dahinter ist zu Beginn voll Schmelze (Zylinder bis zur gewählten Tiefe), der Kolben drückt über die
Fläche nach. <b>Auslässe</b>: ebene Flächen, durch die die Luft geht: als Drossel (die Schmelze bleibt davor stehen wie am Entlüftungsblock) oder offen (auch die Schmelze tritt aus).
<b>Netz</b>: Zellgröße, Hintergrund, Stufen je Körper (dünne Körper feiner; mit Kammer die Zelllänge der Kammer).
<b>Fall</b>: der ZIP-Download.</p>
</section>
<section data-help-anchor="prozess">
<h3>Prozess: Schusskurve und Gießkammer</h3>
<p>Die Schusskurve ist die der Auslegung (Vorgabe: <b>DieLogic</b>, das fokussierende Kolbengesetz; dazu López und
V₁/V₂), gerechnet auf dieses Modell: Kolben-Ø = Einlass, Massen aus den Körpern, Kammerlänge aus der Auslegung
oder von Hand. Liegt der Füllgrad außerhalb des Zielbands, bietet der Schritt die passende Kammerlänge an.</p>
<p><b>Ohne Kammer</b> beginnt die Rechnung bei „Kammer voll": der Pressrest ist voll Schmelze (ein Zylinder etwas
größer als er), der Kolben drückt mit der Kurve ab dort über den Einlass. <b>Mit Kammer</b> beginnt sie beim
Kolbenstart: die Kammer wird hinter dem Einlass um den Hub angesetzt (extrudeMesh), die Schmelze liegt mit dem
Füllgrad darin (im Bild das Segment in der Kammer), und der Kolben fährt die ganze Kurve als bewegtes Netz
(libshotSleeve). Die Kolbenachse muss dafür waagerecht liegen.</p>
<p>Die Anschnittgeschwindigkeit kommt aus der Kurve und dem gemessenen Anschnitt. Der Angussdesigner legt seine
Anschnitte genau an die Bauteilwand; für das Netz verlängert die Seite sie um zwei Zellen über das Bauteil
(„Anschnittzungen" unter „Körper"), sonst hinge das Bauteil nur an einem Hauch.</p>
</section>
<section data-help-anchor="auswertung">
<h3>Auswertung</h3>
<p>Wann ein Bild entsteht: nach <b>Füllgrad</b> der Form, nach <b>Zeit</b> oder nach <b>Kolbenweg</b>, je n Bilder
gleichmäßig verteilt. Format: Seitenverhältnis und Breite. Solange der Schritt dran ist, zeigt ein Rahmen im Bild
den Ausschnitt, mit Farbleiste und Text an den Stellen der Bilder; „Aktuelle Ansicht übernehmen" nimmt genau
diesen Rahmen (Lage, Ziel und Öffnungswinkel der Kamera). Jeder Kennwert ist mit derselben Leiste gefärbt.</p>
</section>
<section data-help-anchor="lauf">
<h3>Den Fall rechnen</h3>
<pre>unzip Name_openfoam.zip &amp;&amp; cd Name_openfoam
source /usr/lib/openfoam/openfoam2606/etc/bashrc
./Allrun            # NP=8 ./Allrun: 8 Prozesse; ./Allrun -mesh: nur das Netz</pre>
<p>Allrun prüft, ob das Netz dicht ist (sonst schreibt snappyHexMesh den Weg der Leckage nach
<code>postProcessing/constant/leakPath.vtp</code>) und ob jede Randfläche im Netz angekommen ist — ein Körper,
der dünner als zwei Zellen ist, kann fehlen. Danach Anfangswerte, Zerlegung, dieLogicFoam bis zur vollen Form,
Rekonstruktion und die Bilder in <code>images/</code>. Eine abgebrochene Rechnung läuft mit demselben Aufruf weiter.</p>
</section>
`;

export const HELP = '<div data-help-owner="simulation">' + INTRO + '</div>'
  + part('anguss', 'Angussdesigner', ANGUSS)
  + part('ueberlauf', 'Überlaufdesigner', UEBERLAUF);
