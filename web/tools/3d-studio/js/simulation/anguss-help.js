/* Die Hilfe der Angussfüllung — die Texte, die früher als Hinweiskästen in
   den Seitenleisten der beiden Seiten (Gitter, Partikel) und in ihren
   title-Attributen standen, dazu „Grenzen, die man kennen muss" aus dem
   README. Anker je Feld mit ⓘ. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Der Angussdesigner sagt mit seiner 1D-Rechnung, WANN die Schmelze an jedem Anschnitt ankommt: über
Verluste je Millimeter Mittellinie. Die Angussfüllung rechnet es nach: die Schmelze steht beim Start voll
im Pressrest („Kammer voll" auf der DieLogic-Kurve), der Kolben schiebt mit der Kurve (erst
v<sub>krit</sub>, dann die Rampe der zweiten Phase), und die Front läuft durch die Laufkanäle bis zu den
Anschnitten.</p>
<p>Das Angusssystem wählt man oben im <b>Anguss-Chip</b>: ein Beispiel, oder eine Datei des Angussdesigners
bzw. der Werkbank (JSON). Sie lässt sich auch ins Bild ziehen. Eine Werkbankdatei bringt ihren Prozess mit.</p>
</section>
<section data-help-anchor="prozess">
<h3>Prozess und Schusskurve</h3>
<p>Die Rechnung beginnt bei „Kammer voll": die Schmelze steht im Pressrest, und der Kolben schiebt mit der
DieLogic-Kurve: erst v<sub>krit</sub>, dann die Rampe der zweiten Phase. Maschine und Thermik kommen aus
dem aktuellen Projekt.</p>
<p>Alle Zeiten dieses Werkzeugs zählen <b>ab „Kammer voll"</b>; wann das nach dem Kolbenstart ist, steht
einmal, bei den Kennzahlen der Kurve.</p>
</section>
<section data-help-anchor="gussvolumen">
<h3>Gussvolumen</h3>
<p>Gussvolumen einschließlich Überläufen. Es bestimmt die zweite Phase der Kurve.</p>
</section>
<section data-help-anchor="kammerlaenge">
<h3>Füllkammerlänge</h3>
<p>Länge der Füllkammer; mit dem Pressrest-Ø als Kolben-Ø folgt daraus der Füllgrad und damit die erste
Phase.</p>
</section>
<section data-help-anchor="verfahren">
<h3>Zwei Verfahren</h3>
<p><b>Gitter</b>: Lattice-Boltzmann D3Q19 mit freier Oberfläche nach Körner: nur die Schmelze wird
gerechnet, jede Zelle ist voll, leer oder Front. Zähigkeit auf das Stabile angehoben (ein grobes LES), keine
Schwerkraft, keine Oberflächenspannung: eine <b>schnelle</b> Rechnung für Reihenfolge und Zeiten, keine
Gießsimulation. Die Ankunft steht neben der 1D-Rechnung des Angussdesigners.</p>
<p><b>Partikel</b>: schwach kompressible SPH: die Schmelze als Partikel mit Dichte und Druck (Tait),
künstlicher Zähigkeit und δ-Diffusion der Dichte; die Wände als Abstandsfeld, an dem die Partikel gleiten
(keine Haftung), der Kolben als Säule von Zustrompartikeln hinter dem Pressrest. Keine Schwerkraft, keine
Oberflächenspannung: eine <b>schnelle</b> Rechnung für Reihenfolge und Zeiten, keine Gießsimulation. Die
Ankunft steht neben der 1D-Rechnung und neben der Gitterrechnung.</p>
<p>Beide rechnen auf der Grafikkarte (WebGPU) oder, ohne sie, in JavaScript, dann grob und in Minuten
statt Sekunden; die Zeile unter dem Feld sagt vorher, womit und wie lange ungefähr. <b>Abbrechen</b> beendet
einen Lauf sofort; danach gibt es kein Ergebnis.</p>
</section>
<section data-help-anchor="aufloesung">
<h3>Zellkante und Partikelabstand</h3>
<p><b>Zellkante</b>: die Kante einer Gitterzelle, in Millimetern. Ein Kanal braucht wenigstens vier Zellen über seine
Tiefe; feiner heißt mehr Zellen und mehr Zeitschritte.</p>
<p><b>Partikelabstand</b>: Abstand der Partikel im Pressrest und in der Säule des Zustroms. Ein Kanal
braucht wenigstens vier Partikel über seine Tiefe, sonst klemmt die Front darin; enger heißt mehr Partikel
und kleinere Zeitschritte.</p>
<p>Vorgeschlagen wird, was dieses Gerät in erträglicher Zeit schafft. Ein eigener Wert gilt für dieses
Angusssystem, bis ein anderes geladen wird.</p>
<h3>Grenzen, die man kennen muss</h3>
<p>Die Zellkante muss die Kanäle auflösen: unter vier, fünf Zellen über die Tiefe bremst die Wandhaftung
die Strömung weit stärker als in Wirklichkeit, und die Ankunft wandert nach hinten (das
Zwei-Anschnitte-Beispiel: 13 ms bei 4 mm, 35 ms bei 5 mm, die 1D-Rechnung sagt 16). Der Vorschlag für die
Zellkante zielt auf 400 000 Zellen auf der Grafikkarte, 120 000 in JavaScript; mehr als 1,5 Millionen
(128 MB je Verteilungspuffer) bzw. 250 000 gehen nicht. Ohne WebGPU (Firefox, Safari) rechnet JavaScript:
Minuten statt Sekunden; die Seite sagt es.</p>
<p>Partikel: ein Kanal braucht wenigstens vier Partikel über seine Tiefe. Mit fünf Millimetern im Beispiel
„zwei" (Kanäle 12 mm tief) passen ein bis zwei Reihen hinein, und die Front klemmt dreißig Millimeter vor
den Anschnitten, nicht am Verfahren, an der Packung: zwei Reihen Kugeln fließen nicht wie eine
Flüssigkeit. Der Vorschlag der Seite (40 000 Partikel auf der Grafikkarte) liegt bei zwei Millimetern; in
JavaScript (2 500 Partikel) reicht es nur für grobe Bilder, nicht für Ankunftszeiten.</p>
</section>
<section data-help-anchor="vergleich">
<h3>Gitter und Partikel nebeneinander</h3>
<p>Sind beide Verfahren für dasselbe Angusssystem und denselben Prozess gerechnet, stehen ihre Ankünfte in
einer Tabelle neben der 1D-Rechnung; „Bild" wählt, wessen Schmelze im Viewport zu sehen ist. Ändert sich
System oder Prozess, gehören beide Ergebnisse zum alten Problem und verschwinden.</p>
<p>Die Wände der Partikelrechnung sind Abstandsfelder, keine Partikel: wer näher als d/2 an die Wand
kommt, wird zurückgesetzt und verliert die Geschwindigkeit in die Wand: Gleiten, keine Haftung. Das ist
der Preis gegenüber der Gitterrechnung, die haftet; im Anguss kommt die Partikelfront deshalb eher früher
an. Ihre Ankunft ist außerdem die am Übergang zum Anschnitt, ein paar Millimeter vor der des Gitters;
feinere Partikel rücken sie näher heran.</p>
<p>Zum Vergleich, im kopflosen Chromium mit WebGPU (SwiftShader): das Beispiel „zwei" mit 4 mm Partikeln:
Anschnitte bei 27 und 32 ms (Gitter 5 mm: 34,6 und 33,3 ms; 1D 15,6 ms).</p>
<p>„Δ erster bis letzter" ist der Abstand zwischen dem zuerst und dem zuletzt erreichten Anschnitt, das Maß
für die Füllbalance.</p>
</section>
<section data-help-anchor="anzeige">
<h3>Schmelze oder Ankunft</h3>
<p><b>Schmelze</b>: die Schmelze zur Zeit des Reglers, beim Gitter als Körper (die Fläche des halben
Füllstands), bei den Partikeln als Kugeln vom Partikelabstand, nach Geschwindigkeit gefärbt, der Anguss
durchscheinend. Die Skala gilt für den ganzen Lauf; ihr Ende ist das 99. Perzentil über die Bilder bis zur
ersten Ankunft. Danach herrschen die Anschnitte, und der Weg davor wäre einfarbig blau. Was schneller
ist, bleibt rot.</p>
<p><b>Ankunft</b>: der Anguss nach der Ankunft der Front gefärbt (Turbo, nie erreicht grau). Diese Farben
gibt es nur aus der Gitterrechnung. Steht das Bild der Partikel da, fehlt die Wahl.</p>
<p>Die Rechnung endet, wenn alle Anschnitte gemeldet sind (plus fünf Prozent für das Bild), spätestens am
Ende der Kurve oder beim Dreifachen der 1D-Schätzung. Unter „Rechnung" stehen Schritte, Zellen bzw.
Partikel, Rechenzeit, Zeitschritt und womit gerechnet wurde.</p>
</section>
<section data-help-anchor="zeit">
<h3>Zeit</h3>
<p>Zeit ab „Kammer voll". Die Front wandert mit dem Regler.</p>
</section>
`;
