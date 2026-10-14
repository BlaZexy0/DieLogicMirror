/* Die Hilfe von „Erstarrung einrichten": vorn der Ablauf, dann je Designer
   seine eigene Hilfe aus dem Studio (wie in der Werkbank). */

import { HELP as ANGUSS } from '../../3d-studio/js/runner/help.js';
import { HELP as UEBERLAUF } from '../../3d-studio/js/vents/help.js';

const part = (owner, title, body) => '<div data-help-owner="' + owner + '"><h2 class="st-help-part">' + title + '</h2>' + body + '</div>';

const INTRO = `
<section data-help-anchor="erstarrung">
<h3>Erstarrung einrichten</h3>
<p>Aus den Gusskörpern entsteht ein OpenFOAM-Fall für den DieLogic-Solver <b>dieLogicSolFoam</b>: die Erstarrung
des Schusses zusammen mit der Form — Gussteil, Formhälften, Kolbenspitze und Kühlkanäle sind ein Netz, jeder
Werkstoff eine Zellzone. Heraus kommen Erstarrungszeiten, die Erstarrungsfolge mit gespeisten und abgeschnittenen
Bereichen, Porosität, die Temperatur der Formoberfläche und das Kleben, über einen Schuss oder über mehrere Zyklen.
Die Schritte links sind ein Ablaufplan wie bei „Simulation einrichten".</p>
<p>Gerechnet wird im <b>Bauteilsystem</b> in mm: Trennebene z = 0, die Form öffnet nach +z. Die Körper dürfen sich
überlappen oder berühren; das Gussteil ist ihre Vereinigung.</p>
</section>
<section data-help-anchor="ablauf">
<h3>Die Schritte</h3>
<p><b>Körper</b>, <b>Anguss</b> und <b>Überläufe</b> wie bei der Füllung. <b>Kolben</b>: die Kreisfläche des
Pressrests, an der der Kolben anliegt — vorgeschlagen ist die größte; dahinter liegt die wassergekühlte Kolbenspitze
aus Kupfer bis zum Rand des Formblocks; der Pressrest speist das Gussteil unter Nachdruck, solange sein Kern flüssig ist.
<b>Form</b>: wie viel Stahl um das Gussteil liegt (der Formblock) und wo die Trennebene ist; die feste Hälfte ist
die Seite des Kolbens (im Bild gelb), die bewegliche rosa. <b>Kühlung</b>: gerade Kanäle mit Ø, Wassertemperatur
und Wärmeübergang; „Vorschlag setzen" legt je Hälfte zwei längs des Bauteils, die Liste zeigt je Kanal, wie viel
Stahl bis zur Kavität bleibt. Der Schritt ist wahlweise. <b>Netz</b>: die Zellgröße im Gussteil (Vorschlag: zwei
Zellen über die dünnste Wand) und wie viel größer die Zellen weit draußen im Stahl sind. <b>Prozess</b>: Legierung
(die Bibliothek von dieLogicSol mit Kurven des Festanteils, oder eine der Auslegung mit linearer Kurve),
Temperaturen, Füllzeit, Nachdruck, ein Schuss oder Zyklen mit Öffnen und Sprühen, und ob der Zustand am Füllende
gleichmäßig ist oder aus einer Füllrechnung von „Simulation einrichten" kommt. <b>Auswertung</b>: welche Bilder.
<b>Fall</b>: der ZIP-Download.</p>
</section>
<section data-help-anchor="modell">
<h3>Was gerechnet wird</h3>
<p>Nach der Füllung nur Wärmeleitung, in Gussteil und Form in einer Matrix. Der Kontakt Gussteil/Form ist hoch,
solange die Schmelze angepresst ist, und fällt, wenn die erstarrte Haut schwindet. Wo die Schmelze noch mit dem
Pressrest verbunden ist, wird sie gespeist; ein abgeschnittener Bereich sammelt seine Schwindung als Pore dort, wo er
zuletzt erstarrt. Die Modellkonstanten sind Werte in der Größenordnung der Literatur, nicht kalibriert: zum Vergleich
von Formen und Prozessvarianten. Mehr auf der Seite <a href="/simulation/dielogicsolfoam.html">dieLogicSolFoam</a>.</p>
</section>
<section data-help-anchor="lauf">
<h3>Den Fall rechnen</h3>
<pre>unzip JJJJ-MM-TT_Name_Erstarrung.zip &amp;&amp; cd JJJJ-MM-TT_Name_Erstarrung
source /usr/lib/openfoam/openfoam2606/etc/bashrc
./Allrun                    # NP=8 ./Allrun: 8 Prozesse; ./Allrun -mesh: nur das Netz
FUELLUNG=../../Fuellung/simulation ./Allrun   # Zustand am Füllende aus einer Füllrechnung
./Allrun -auswertung        # nur Bilder und Bericht neu</pre>
<p>Braucht dieLogicSolFoam und dieLogicSolMapFill (dieLogicSol/solvers/Allwmake), für die Bilder ParaView
(pvbatch), für den Bericht Python 3 mit numpy und matplotlib. Am Ende liegt <code>auswertung/bericht.html</code>
mit Kennzahlen, Bildern und Verläufen.</p>
</section>
`;

export const HELP = '<div data-help-owner="erstarrung">' + INTRO + '</div>'
  + part('anguss', 'Angussdesigner', ANGUSS)
  + part('ueberlauf', 'Überlaufdesigner', UEBERLAUF);
