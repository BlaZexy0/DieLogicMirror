/* Die Hilfe von „Füllsimulation": vorn der Ablauf, dann je Designer
   seine eigene Hilfe aus dem Studio (wie in der Werkbank). */

import { HELP as ANGUSS } from '../../3d-studio/js/runner/help.js';
import { HELP as UEBERLAUF } from '../../3d-studio/js/vents/help.js';

const part = (owner, title, body) => '<div data-help-owner="' + owner + '"><h2 class="st-help-part">' + title + '</h2>' + body + '</div>';

const INTRO = `
<section data-help-anchor="simulation">
<h3>Füllsimulation</h3>
<p>Aus den Körpern der Form entsteht ein OpenFOAM-Fall für den DieLogic-Solver <b>dieLogicFoam</b>: Netz mit
snappyHexMesh, Anfangs- und Randwerte, Solver-Einstellungen, ein <code>Allrun</code>, das alles nacheinander
ausführt, und die Skripte der Auswertung (Bilder, Graphiken, Bericht). Die Schritte links sind ein Ablaufplan: ein
Schritt öffnet sich erst, wenn alle davor erledigt sind.</p>
<p>Gerechnet wird im <b>Bauteilsystem</b> in mm: Trennebene z = 0, die Form öffnet nach +z. Alle Körper müssen
geschlossene Netze sein. Sie dürfen sich überlappen oder berühren (der Anguss steckt im Bauteil, der Anschnitt
liegt auf der Bauteilwand): gerechnet wird die Vereinigung, Wände im Innern eines anderen Körpers werden zu
inneren Flächen, die das Netz nicht trennen.</p>
</section>
<section data-help-anchor="ablauf">
<h3>Die Schritte</h3>
<p>Die Schritte kommen der Reihe nach: über jedem stehen sein Name und was er tut, in der Leiste ist ein
erledigter Schritt getönt, der aktuelle kräftiger, gesperrte sind blass.</p>
<p><b>Körper</b>: STL oder GLB laden (mehrere auf einmal, auch durch Ablegen ins Bild); eine GLB mit mehreren
Knoten ergibt mehrere Körper. Jeder Körper hat eine Rolle; das erste Bauteil wird das Bauteil des Studios, an
dem die Designer bauen. ✕ entfernt einen Körper, auch das Bauteil — ohne Bauteil geht es nicht weiter. <b>Anguss</b> und <b>Überläufe</b>: im Designer bauen. Liegen Anguss und
Pressrest (bzw. Überläufe) schon als Dateien unter „Körper", entfällt der Schritt und verschwindet aus der
Leiste. Überläufe sind wahlweise: „Ohne Überläufe weiter" unter dem Knopf des Designers. <b>Einlass</b>: vorgeschlagen ist die
größte Kreisfläche des Pressrests; „Andere Fläche wählen", dann auf die Fläche tippen, nimmt eine andere. Im Block
des Einlasses stehen Fläche, Richtung und die Tiefe, bis zu der der Pressrest zu Beginn voll Schmelze ist (im Bild
ein durchscheinender Zylinder), der Pfeil zeigt, wie die Schmelze einströmt. Es gibt nur einen Einlass, ✕ entfernt
ihn. Darunter die <b>Gießkammer</b>: ohne oder mit, und die Kammerlänge (sie gibt den Füllgrad und damit die
Schusskurve). <b>Auslässe</b>: je Fläche einmal „Auslass auswählen" und auf eine ebene Fläche tippen, durch die die
Luft geht (Esc bricht ab): als Drossel (die Schmelze bleibt davor stehen wie am Entlüftungsblock) oder offen (auch
die Schmelze tritt aus). <b>Netz</b>: Zellgröße, Hintergrund, Stufen je Körper (dünne Körper feiner; mit Kammer die
Zelllänge der Kammer). <b>Schusskurve</b> und <b>Prozess</b>: unten. <b>Fall</b>: der ZIP-Download; Ordner und ZIP heißen nach Vorschlag <code>JJJJ-MM-TT_Name</code> (Datum von heute).</p>
<p><b>Vorschläge</b> sehen überall gleich aus: eine Zeile mit dem Etikett „Vorschlag" direkt unter dem Feld, mit dem
Wert und warum. Gilt er, ist sie getönt und hat einen Haken; sonst steht „Übernehmen" daneben. Beim ersten Besuch
eines Schritts gilt der Vorschlag (die größte Kreisfläche als Einlass, ihre Tiefe, zwei Zellen über die dünnste
Bauteilwand, der Name des Falls mit dem Datum von heute); was man selbst einträgt oder wählt, bleibt. Die Kammerlänge kommt aus der Auslegung; mit Kammer gilt
ihr Vorschlag (Mitte des Füllgrad-Bands), solange man sie nicht selbst einträgt, ohne Kammer erst mit „Übernehmen".</p>
</section>
<section data-help-anchor="prozess">
<h3>Schusskurve, Gießkammer und Prozess</h3>
<p>Die Schusskurve ist die der Auslegung, gerechnet auf dieses Modell: Kolben-Ø = Einlass, Massen aus den
Körpern, Kammerlänge aus der Auslegung oder von Hand (unter „Einlass", mit dem Vorschlag für die Mitte des
Füllgrad-Bands). Die <b>1. Phase</b> bis „Kammer voll": <b>DieLogic</b> (das fokussierende
Kolbengesetz, Vorgabe), López oder V₁ von Hand. Die <b>2. Phase</b>: V₂ automatisch (die Auslegung wählt es für
die NADCA-Füllzeit, Rampe mit ihrem a<sub>max</sub>) oder V₂ von Hand mit a₂. Reicht a₂ bis zum Füllende nicht, schlägt
der Schritt das a₂ vor, mit dem V₂ erreicht wird. Der Schritt <b>Prozess</b> danach: Schwerkraft,
Temperaturen und die Werte der Legierung. Das Bild zeigt den ganzen Schuss oder nur die
Formfüllung, die Ereignisse nummeriert wie in der Legende, den gerechneten Teil als Balken auf der Achse; unter
der Maus stehen Weg, Geschwindigkeit und Zeit.</p>
<p><b>Ohne Kammer</b> beginnt die Rechnung bei „Kammer voll": der Pressrest ist voll Schmelze (ein Zylinder etwas
größer als er), der Kolben drückt mit der Kurve ab dort über den Einlass. <b>Mit Kammer</b> beginnt sie beim
Kolbenstart: die Kammer wird hinter dem Einlass um den Hub angesetzt (extrudeMesh), die Schmelze liegt mit dem
Füllgrad darin (im Bild liegt sie in der aufgeschnittenen Kammer, hinten der Kolben), und der Kolben fährt die ganze Kurve als bewegtes Netz
(libshotSleeve). Die Kolbenachse muss dafür waagerecht liegen.</p>
<p>Die Anschnittgeschwindigkeit kommt aus der Kurve und dem gemessenen Anschnitt. Der Angussdesigner legt seine
Anschnitte genau an die Bauteilwand; für das Netz verlängert die Seite sie um zwei Zellen über das Bauteil
(„Anschnittzungen" unter „Körper"), sonst hinge das Bauteil nur an einem Hauch.</p>
</section>
<section data-help-anchor="auswertung">
<h3>Auswertung</h3>
<p>Während der Rechnung schreibt der Fall keine vollen Zeitstände mehr (die gibt es nur zum Weiterrechnen und am
Ende), sondern mit Funktionsobjekten nur, was die Auswertung braucht: die Oberfläche der Schmelze (Isofläche
alpha = 0,5) und die Wand mit den Werten der Zellen dahinter, dazu Zeitreihen von Füllung, Druck am Kolben, Luft in
der Form, eingeschlossener Luft, Gasdruck, mitgerissener Luft und Oxiden, Temperatur und Festanteil. Die Bilder
schneiden die Wand punktweise bei alpha = 0,5 ab — die Schmelze ist glatt, nicht aus Zellblöcken.</p>
<p>Die Kennwerte stehen als Liste: der Haken nimmt einen in die Bilder, das Auge zeigt ihn im Rahmen. Die
<b>Geschwindigkeit</b> ist im Regenbogen von 0 bis 50 m/s gefärbt, darüber Pink; der <b>Lufteinschluss</b>
linear mit „Blue - Green - Orange" von 0 bis 100 %; die übrigen mit der Leiste der Auslegung. Wann ein
Bild entsteht: nach <b>Füllgrad</b> der Form, nach <b>Zeit</b> oder nach <b>Kolbenweg</b>, je n Bilder
gleichmäßig verteilt (Vorgabe 100 je Kennwert; der Fall schreibt dafür doppelt so viele Oberflächen). Format:
Seitenverhältnis und Breite. Solange der Schritt dran ist, zeigt ein Rahmen im Bild den Ausschnitt, mit Farbleiste
und Text an den Stellen der Bilder; „Aktuelle Ansicht übernehmen" nimmt genau diesen Rahmen (Lage, Ziel und
Öffnungswinkel der Kamera).</p>
</section>
<section data-help-anchor="lauf">
<h3>Den Fall rechnen</h3>
<pre>unzip JJJJ-MM-TT_Name.zip &amp;&amp; cd JJJJ-MM-TT_Name
source /usr/lib/openfoam/openfoam2606/etc/bashrc
./Allrun            # NP=8 ./Allrun: 8 Prozesse; ./Allrun -mesh: nur das Netz
./Allrun -auswertung   # nur Bilder und Bericht neu</pre>
<p>Im Hauptordner liegen die Skripte: <code>Allrun</code>, <code>Allclean</code>, <code>bilder.py</code>
(ParaView), <code>bericht.py</code> (Python 3) und ihre Einstellungen <code>auswertung.json</code>; im Ordner
<code>simulation</code> der OpenFOAM-Fall. Allrun prüft, ob das Netz dicht ist (sonst schreibt snappyHexMesh den Weg
der Leckage nach <code>simulation/postProcessing/constant/leakPath.vtp</code>) und ob jede Randfläche im Netz
angekommen ist — ein Körper, der dünner als zwei Zellen ist, kann fehlen. Danach Anfangswerte, Zerlegung,
dieLogicFoam bis zur vollen Form und die Auswertung: <code>auswertung/bericht.html</code> mit den Kennzahlen, den
Bildern (mit Zeitregler), der eingeschlossenen Luft (je Nest Volumen, Druck und Lage am Ende), den Verläufen, dazu
<code>bilder</code>, <code>graphiken</code> (SVG) und <code>daten</code> (CSV). Das Menü links springt zu den
Abschnitten; „Als PDF speichern" druckt den Bericht mit je vier Bildern je Kennwert. Eine abgebrochene Rechnung läuft mit demselben Aufruf weiter.</p>
</section>
`;

export const HELP = '<div data-help-owner="simulation">' + INTRO + '</div>'
  + part('anguss', 'Angussdesigner', ANGUSS)
  + part('ueberlauf', 'Überlaufdesigner', UEBERLAUF);
