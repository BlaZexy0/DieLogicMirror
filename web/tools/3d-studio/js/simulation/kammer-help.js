/* Die Hilfe der Kammerfüllung — die Texte, die früher als Hinweiskästen in
   den Seitenleisten der beiden Seiten (Gitter, Partikel) und in ihren
   title-Attributen standen, dazu die Grenzen aus dem README. Anker je Feld
   mit ⓘ. */

export const HELP = `
<section data-help-anchor="kammer">
<h3>Die Füllkammer</h3>
<p>Der liegende Zylinder, in dem die Schmelze vor dem Schuss ruhig unten steht und die Welle entsteht, um
die es in der ersten Phase geht.</p>
<p><b>Durchmesser</b>: Innendurchmesser der Füllkammer = Kolben-Ø.</p>
<p><b>Länge</b>: Länge der Kammer vom Kolben in Startlage bis zur Stirnfläche am Werkzeug.</p>
<p>Neue Maße setzen Zellkante und Partikelabstand auf den Vorschlag zurück und passen das Bild neu ein.</p>
</section>
<section data-help-anchor="fuellgrad">
<h3>Füllgrad</h3>
<p>Anteil des Kammervolumens, der mit Schmelze gefüllt ist. Sie steht ruhig unten in der Kammer. Der Stand
der Schmelze folgt aus dem Kreissegment.</p>
</section>
<section data-help-anchor="laufkanal">
<h3>Der Auslass</h3>
<p>Oben in der Stirnfläche sitzt der Auslass: Was dort ankommt, verlässt die Kammer, und die Zellen davor
melden „Kammer voll". Er ist <b>keine Eingabe</b>, sondern Randbedingung der Rechnung und folgt dem
Durchmesser (Breite D/3, Tiefe D/6); das Metamodell rechnet ohnehin mit dem Fenster seiner Rechnungen
(Sehne bei 0,42 R). Ausgelegt wird der Laufkanal im Angussdesigner, nicht hier; deshalb steht er auch
nicht im Bild.</p>
</section>
<section data-help-anchor="kurve">
<h3>Schusskurve</h3>
<p><b>DieLogic</b>: die DieLogic-Kurve des Projekts: López-Anfahrt bis v<sub>krit</sub>, Plateau bis
Kammer voll, Rampe auf v₂. Sie nimmt Maschine und Thermik aus dem aktuellen Projekt, Kammer und Füllgrad
von hier; die Massen werden so gesetzt, dass die Kurve den gewählten Füllgrad rechnet.</p>
<p><b>v₁ / v₂</b>: zweistufig: Rampe auf v₁, Plateau bis Kammer voll, Rampe auf v₂. Die Beschleunigung
gilt für beide Rampen.</p>
<p>Die Rechnung beginnt beim Kolbenstart und endet, wenn die Schmelze den Laufkanal erreicht hat (plus
ein Stück für das Bild), spätestens am Ende der Kurve. Alle Zeiten zählen ab Kolbenstart.</p>
</section>
<section data-help-anchor="verfahren">
<h3>Drei Verfahren</h3>
<p>Die Kammerfüllung beginnt beim <b>Metamodell</b>: Es antwortet in Sekunden, wo Gitter und Partikel Minuten
rechnen. Wer außerhalb seines Trainings liegt oder den Laufkanal braucht, wechselt auf Gitter oder Partikel.</p>
<p><b>Gitter</b>: Lattice-Boltzmann D3Q19 mit freier Oberfläche nach Körner, Schwerkraft als
Volumenkraft, der Kolben als wandernde Zellschicht. Zähigkeit auf das Stabile angehoben, keine
Oberflächenspannung, kein Gasdruck. <b>Eingeschlossene Luft</b> sind Gaszellen, die nicht mehr mit der
Luftblase über der Schmelze zusammenhängen: die Zahl, um die es in der ersten Phase geht.</p>
<p><b>Partikel</b>: schwach kompressible SPH: die Schmelze als Partikel mit Dichte und Druck (Tait),
künstlicher Zähigkeit und δ-Diffusion der Dichte, Schwerkraft; die Kammer als Abstandsfeld, an dem die
Partikel gleiten, der Kolben als Ebene, die die Kurve fährt. Keine Oberflächenspannung, kein Gasdruck.
<b>Eingeschlossene Luft</b>: das Partikelbild auf ein Raster gelegt, Luftzellen ohne Verbindung zur Blase
über der Schmelze: die Zahl, um die es in der ersten Phase geht. Vor dem Start kommt die Schmelze zur
Ruhe (20 ms mit hoher Zähigkeit, dann v = 0): die hydrostatische Vorgabe passt an der freien Oberfläche nie
ganz, und der Schwapp davon soll nicht in die Welle.</p>
<p><b>Metamodell</b>: kein Löser, sondern ein trainiertes Modell. Es hat aus über tausend
OpenFOAM-Rechnungen derselben Kammer gelernt, wie die Welle aussieht, und gibt sie in Sekunden statt in
Minuten wieder: für 101 Kolbenstellungen je Kammerschicht Schmelzeanteil und Geschwindigkeit. Dafür gilt
es nur da, wo gelernt wurde: Länge/Durchmesser 5 … 20, Füllgrad 30 … 70 %, Durchmesser 60 … 300 mm;
außerhalb sagt der Knopf, woran es liegt, und rechnet nicht. Es hat KEINE Zellkante: das Gitter ist das
der Rechnungen (30 × 30 je Schicht, eine Schicht D · 0,1 hoch). Und es kennt den Laufkanal nicht: alle
Rechnungen hatten dasselbe Auslassfenster in der Stirnplatte (Sehne bei 0,42 R), „Kammer voll" heißt hier,
die Schmelze erreicht dieses Fenster: eine Sehne bei 0,42 R statt des Auslasses, mit dem Gitter und Partikel rechnen.
Beim ersten Lauf lädt die Seite das Modell (12 MB) und sein Rechenwerk nach.</p>
<p>Gitter und Partikel rechnen auf der Grafikkarte (WebGPU) oder, ohne sie, in JavaScript, dann grob, und
die erste Phase dauert Minuten; das Metamodell rechnet in WebAssembly, auch ohne Grafikkarte. Die Zeile
unter dem Feld sagt vorher, womit und wie lange ungefähr. <b>Abbrechen</b> beendet einen Lauf sofort;
danach gibt es kein Ergebnis.</p>
</section>
<section data-help-anchor="aufloesung">
<h3>Zellkante und Partikelabstand</h3>
<p>Das Metamodell hat kein solches Feld: es rechnet auf dem Gitter, das es gelernt hat.</p>
<p><b>Zellkante</b>: die Kante einer Gitterzelle, in Millimetern. Die Welle braucht wenigstens zwanzig Zellen über den
Durchmesser.</p>
<p><b>Partikelabstand</b>: Abstand der Partikel in der ruhenden Schmelze. Die Welle braucht wenigstens
zwanzig Partikel über den Durchmesser.</p>
<h3>Grenzen, die man kennen muss</h3>
<p>Es gibt keinen Gasdruck und keine Oberflächenspannung; eine Welle, die überschlägt, schließt in dieser
Rechnung Luft ein, ob sie im echten Schuss entweicht, sagt sie nicht. Der Zeitschritt folgt aus der
doppelten Kolbengeschwindigkeit (die Welle ist nicht viel schneller als der Kolben). Der Laufkanal wird
schneller, dort klemmt der Kern die Geschwindigkeit; die erste Phase dauert deshalb je nach v₂
Zehntausende Schritte. Der Vorschlag für die Zellkante zielt auf 150 000 Zellen auf der Grafikkarte
(dreißig Zellen über den Durchmesser bei 90 mm), 30 000 in JavaScript; für die Partikel auf 60 000 bzw.
2 000.</p>
</section>
<section data-help-anchor="vergleich">
<h3>Die Verfahren nebeneinander</h3>
<p>Ist mehr als ein Verfahren für dieselbe Kammer und dieselbe Kurve gerechnet, stehen „Kammer voll" und
die eingeschlossene Luft aller in einer Tabelle neben der Kurve; „Bild" wählt, wessen Schmelze im Viewport
zu sehen ist. Ändern sich Kammer, Kurve oder Legierung, gehören alle Ergebnisse zum alten Problem und
verschwinden.</p>
<p>Zum Vergleich, im kopflosen Chromium mit WebGPU (SwiftShader): die Kammer Ø 60 × 200 mm, 45 %, v₁/v₂
0,6/2 m/s, 3 mm Partikel: Kammer voll bei 190 ms und 113 mm (Kurve 186 ms, 110 mm; Gitter 3 mm: 179 ms,
106 mm).</p>
</section>
<section data-help-anchor="zeit">
<h3>Zeit und Bild</h3>
<p>Zeit ab Kolbenstart. Der Regler steht unter „Simulieren" und gilt in jedem Modus: Welle und Kolben
wandern mit ihm, gleich ob gerade Kammer, Kurve oder Ergebnis vor einem liegt. Er steht auch vor dem
ersten Lauf da, nur blass; unten links im Bild stehen Zeit, Kolbenweg und die eingeschlossene Luft zum
gezeigten Bild. Die Schmelze ist nach Geschwindigkeit
gefärbt, die Kammer durchscheinend (ihre Deckkraft steht unter „Darstellung"). Die Skala gilt für den
ganzen Lauf; ihr Ende ist das 99. Perzentil über die Bilder bis „Kammer voll". Danach herrscht der
Laufkanal, und die Welle wäre einfarbig blau. Was schneller ist, bleibt rot.</p>
</section>
`;
