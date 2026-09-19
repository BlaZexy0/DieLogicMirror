/* Die Hilfe der Entformungsanalyse — die Erklärungen, die früher als
   Textblöcke in der Seitenleiste standen. Anker je Modus und Feld. */

export const HELP = `
<section data-help-anchor="regeln">
<h3>Was hier gerechnet wird</h3>
<p>Für jedes Dreieck wird in allen sechs Hauptrichtungen geprüft, ob die Normale dorthin zeigt und ob
der Weg frei ist — verdeckungsgenau, nicht nur über den Winkel. Dann gelten feste Regeln: eine
<b>Formhälfte</b>, die das Dreieck mit mindestens 0,5° Schräge sieht, bekommt es; eine senkrechte Wand
(bis 0,5° Gegenschräge) bleibt bei den Hälften; sonst ein <b>Schieber</b> — je zusammenhängendem Fleck
die Richtung, die am meisten davon sieht, auch parallel (0°); was niemand sieht, ist
<b>Hinterschnitt</b>. Splitter ohne Schräge, die keine Hälfte sieht, gehen an die Hälften und werden
als Fläche gemeldet. Weder Formhälften noch Schieber müssen dafür vorhanden sein.</p>
<p>Gerechnet wird sofort beim Laden — es gibt keine Regler, die eine Bestätigung bräuchten. Die
<b>Formöffnung</b> wird automatisch so gewählt, dass Schieber und Hinterschnitte zusammen die kleinste
Fläche haben; X, Y, Z lassen sich zum Vergleich fest setzen, das rechnet nur die Zuordnung neu
(Millisekunden). Die Sichtbarkeit selbst — der teure Teil — hängt nur am Netz und lässt sich
abbrechen.</p>
</section>
<section data-help-anchor="bewegliche-seite">
<h3>Bewegliche Seite</h3>
<p>Welche der beiden Hälften auf der Formöffnungsachse die bewegliche ist (Auswerferseite). Im
Bauteilrahmen liegt die Trennebene bei z = 0 und die Form öffnet nach +z — die +Seite ist die
bewegliche. Liegt das Teil anders herum, hier tauschen; die Namen in Legende und Kennzahlen wandern
mit.</p>
</section>
<section data-help-anchor="schraege">
<h3>Entformschräge</h3>
<p>Die Entformschräge ist <code>arcsin(n · d)</code> gegen die <em>zugewiesene</em> Richtung; eine
Schieberfläche wird also gegen den Schieber bewertet. Der Grenzwert teilt die Farbskala: darunter
rot, bis zum Dreifachen der Übergang, darüber unkritisch. Hinterschnitte bleiben dunkelrot.
Wandstärken haben eine <a href="wandstaerke.html">eigene Seite</a>.</p>
</section>
<section data-help-anchor="netz">
<h3>Das Netz</h3>
<p>Das Netz wird genommen, wie es kommt — die Analyse urteilt je Dreieck als Ganzem. Große Dreiecke
(die Fächer ebener Flächen aus dem CAD) machen die Zuordnung an Schattengrenzen grob: ein Dreieck, das
eine Hälfte nur zum Teil sieht, geht ganz an einen Schieber. Feinere Netze sind Sache des Exports; die
Beispielteile sind mit Dreiecken bis 100 mm² exportiert. Das Kantenbild gibt es bis 60 000
Dreiecke.</p>
</section>
<section data-help-anchor="formteile">
<h3>Formteile</h3>
<p>Jede Region wird zum Formteil: die Flächen einer Hälfte oder eines Schiebers rücken entlang ihrer
Entformrichtung auseinander, wie beim Öffnen der Form. Jedes Formteil zeigt genau die Flächen, die es
abbildet — von der Seite, von der man in die offene Form sieht. Der <b>Rand</b> ist die Trennlinie,
ein Stück in die Form hinein gezogen: die Trennfläche in Andeutung, damit das Stück nicht wie Papier
aussieht. Sechs Formteile sind möglich, zwei Hälften und vier Schieber; was kein Dreieck braucht,
steht grau und kommt in der Form nicht vor. Hinterschnitte bleiben rot an ihrem Ort.</p>
</section>
<section data-help-anchor="flaechen">
<h3>Projizierte Flächen</h3>
<p>Jedes Formteil projiziert in seine Öffnungsrichtung, gerastert als Vereinigung (nicht als Summe der
Dreiecke): bei den Hälften die Fläche auf der Trennebene, bei einem Schieber die Fläche, gegen die er
verriegelt werden muss. Die Silhouetten stehen jenseits des Bauteils in der jeweiligen
Entformrichtung — Umriss und Füllung in der Regionsfarbe. Es sind Flächen, keine Kräfte.</p>
</section>
<section data-help-anchor="haftung">
<h3>Haftung</h3>
<p>Das Teil hängt an den Wänden, die eine Hälfte abbildet, umso fester, je weniger Schräge sie haben —
und dort, wo es beim Erstarren auf die Form <b>aufschrumpft</b> (Kerne, Taschen, Bohrungen), nicht an
Außenwänden, von denen es sich wegzieht. Haftmaß je Fläche: <code>A · (μ·cos α − sin α) · g</code> —
Fläche, Reibung gegen Schräge, und <code>g</code> aus dem Winkel zwischen Flächennormale und Richtung
zum Schwerpunkt: 1 zum Schwerpunkt hin (Innenwand, Bohrung, die zugewandte Rippenflanke), 0 davon weg
(Außenwand), ½ quer dazu (Flanken, die an der Form entlanggleiten).</p>
<p>Die Summen beider Hälften sagen, auf welcher Seite das Teil bleibt. Das Bauteil trägt das Maß als
Farbe; je Hälfte verteilt eine Karte es auf ihre Trennebene, beide auf derselben Skala, jenseits des
Bauteils in ihrer Entformrichtung. Schieber und Hinterschnitte bleiben außen vor — sie tragen nichts
zur Haftung an den Hälften bei. Eine grobe Näherung ohne Elastizität — sie sagt WO im Verhältnis zu
wo, keine Kraft in Newton.</p>
</section>
<section data-help-anchor="bedienung">
<h3>Bedienung</h3>
<ul>
<li>Die Reiter sind Modi: jeder bestimmt allein, was im Bild steht, und nimmt es beim Verlassen mit.</li>
<li>Der Zeiger über dem Bauteil nennt unten links Region, Entformschräge, freie Richtungen und Haftung
des Dreiecks darunter.</li>
<li>Ziehen dreht, rechte Maustaste oder zwei Finger verschieben, das Rad zoomt zum Zeiger;
<b>Einpassen</b> (F, Doppelklick ins Leere) holt das Bauteil ins Bild.</li>
<li>Die Einstellungen merkt sich der Browser je Bauteil; <b>Speichern</b> schreibt sie als JSON-Datei.</li>
</ul>
</section>`;
