/* Die Hilfe des Formaufbaus — die Texte, die früher in der Seitenleiste
   standen (Heizkühlplan, Schnitt, Dateien), und was im README über die
   Bedienung steht. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Der Formaufbau zeigt eine Druckgießform als Baugruppe: feste und bewegliche Seite, Temperierung,
Schieber, Gussteil. Eigene Formen entstehen aus STL-Dateien, die in Gruppen einsortiert werden; das Ganze
wird als eine GLB-Datei gespeichert und wieder geöffnet. Voreingestellt ist die Form der Ölwanne.</p>
<p>In der Halle ist er der <b>Heizkühlplan</b>: ein Tipp hebt einen Temperierkreis oder eine Gruppe hervor,
der Rest der Form wird blass.</p>
</section>
<section data-help-anchor="teile">
<h3>Gruppen und Teile</h3>
<ul>
<li><b>Kopf einer Gruppe</b>: der Pfeil, die Zahl der Teile oder die freie Fläche klappt die Gruppe auf und
die vorige zu; aufgeklappt ist eine Gruppe zur Zeit. Die <b>Glühbirne</b> leuchtet, solange ein Teil der
Gruppe sichtbar ist; ein Tipp blendet die ganze Gruppe aus oder ein. Der <b>Name</b> hebt alle Teile der
Gruppe hervor.</li>
<li><b>Zeile eines Teils</b>: der Schalter blendet es aus, das <b>Farbfeld</b> öffnet den Farbwähler (Kolben
und Stifte behalten ihre Farbe), der <b>Name</b> hebt es hervor.</li>
<li><b>⋯</b> an einer Gruppe: umbenennen, STL-Dateien in diese Gruppe laden, eine Farbe für alle Teile,
entfernen (nur eine leere Gruppe). <b>⋯</b> an einem Teil: umbenennen, in eine andere Gruppe verschieben
(es nimmt deren Seite und Werkstoffklasse an), entfernen.</li>
<li><b>Alle zeigen</b> blendet alles wieder ein und hebt die Hervorhebung auf.</li>
</ul>
</section>
<section data-help-anchor="hervorheben">
<h3>Hervorheben: der Heizkühlplan</h3>
<p><b>Temperierung</b> hebt alle Kreise beider Hälften hervor (die Teile in Gruppen der Werkstoffklassen
Temperierung fest und beweglich), ein Tipp auf einen Kreis nur diesen. Hervorgehobenes bleibt deckend und
leuchtet leicht, alles andere wird blass: der Stahl auf 6 %, das Gegossene auf 14 %, auch die Schnittflächen
der übrigen Teile. Ein zweiter Tipp nimmt ein Teil wieder heraus, <b>Aufheben</b> oder Esc räumt alles.</p>
<p>Ein kurzer <b>Tipp ins Bild</b> hebt das Teil darunter hervor, ein Tipp ins Leere hebt alles auf; wer
zieht, dreht nur die Ansicht. Blasse Teile fangen den Tipp nicht ab, und mit Schnittebene gilt, was zu sehen
ist: ein Tipp auf eine Schnittfläche trifft das Teil, dem sie gehört, ein Kreis im Stahl also den Kreis. Die
Hervorhebung ist Sache der Ansicht: sie gilt in jedem Reiter und steht nicht in der Datei.</p>
</section>
<section data-help-anchor="gruppe">
<h3>Gruppe anlegen</h3>
<p>Eine Gruppe hat einen Namen, eine <b>Seite</b> (fest bleibt stehen, beweglich fährt beim Öffnen mit) und
eine <b>Werkstoffklasse</b> für die Teile, die in sie geladen oder verschoben werden: Stahl, Gussteil, Anguss,
Überläufe, Temperierung, Kolben, Stifte. Die Klasse bestimmt, was die Deckkraft Stahl erfasst, dass im
Schnitt der Inhalt vor dem Stahl liegt und was „Temperierung" hervorhebt. Ein <b>Schieber</b> fährt beim
Öffnen zusätzlich in der Trennebene heraus, um seinen Weg in mm. Zahlen werden deutsch gelesen: „1.500"
sind 1500 mm, „1,5" anderthalb.</p>
</section>
<section data-help-anchor="schnitt">
<h3>Schnitt</h3>
<p>Solange der Reiter <b>Schnitt</b> gewählt ist, ist die Form aufgeschnitten: senkrecht zur gewählten Achse,
an der Lage des Reglers; „Seite umkehren" zeigt die andere Hälfte. Die Körper erscheinen
<b>geschlossen</b>: je Teil zeichnet ein Stencil-Durchgang eine massive Schnittfläche in der Farbe des Teils,
ein umgefärbter Kreis zeigt seine neue Farbe, der Inhalt (Gussteil, Temperierung) liegt knapp vor dem Stahl.
Gezeichnet wird nur für Teile, die die Ebene schneidet. Der Weg der Ebene reicht über die geschlossene und
die ganz geöffnete Form, damit sie beim Öffnen nicht springt.</p>
</section>
<section data-help-anchor="oeffnen">
<h3>Öffnen</h3>
<p>Solange der Reiter <b>Öffnen</b> gewählt ist, steht die Form offen: die bewegliche Hälfte fährt entlang
der Maschinenachse um den eingestellten Weg, Schieber fahren zusätzlich in der Trennebene heraus, jeder
um denselben Anteil seines eigenen Wegs. Den ganzen Weg nennt die Datei, sonst gelten 420 mm.</p>
</section>
<section data-help-anchor="darstellung">
<h3>Deckkraft Stahl</h3>
<p>Unter „Darstellung" oben im Bild: wie deckend die Stahlteile gezeichnet werden. Bei einer Hervorhebung
bleibt der Stahl darunter, blass heißt dann noch blasser. Die Deckkraft gehört der Ansicht, nicht der
Datei.</p>
</section>
<section data-help-anchor="dateien">
<h3>Dateien</h3>
<p><b>Öffnen</b> (die Klappe „Form" in der Kopfzeile, oder eine Datei ins Bild ziehen): eine GLB ersetzt die
ganze Form und wird eingepasst; STL-Dateien kommen als Teile in die aufgeklappte Gruppe, mehrere auf einmal.
Dafür gibt es auch den Knopf <b>STL laden</b> oben im Bild und „STL laden" im Menü einer Gruppe.</p>
<p><b>Speichern</b> schreibt die Form als eine GLB: jedes Teil mit seiner Lage, dazu Gruppen, Seiten,
Werkstoffklassen, Schieberwege, Namen und Farben als glTF-<code>extras</code> an der Wurzel (Format
<code>dielogic-formaufbau</code>). Geschrieben wird bei geschlossener Form, deckend und ohne Leuchten;
Deckkraft Stahl, Hervorhebung, Schnitt und Öffnen gehören der Ansicht.</p>
<p>Eine GLB ohne diese Angaben wird über die Namen der Beispielform einsortiert; nötig sind die Knoten
<code>fixedRoot</code> und <code>movingRoot</code>. Knoten mit anderen Namen kommen je Seite in „Sonstige
Teile", mit ihrer Lage aus der Datei.</p>
<p><b>Farben</b>: die voreingestellten Farben sind die des Farbschemas und folgen ihm; eine selbst gewählte
Farbe bleibt, wie sie ist.</p>
</section>
<section data-help-anchor="rueckgaengig">
<h3>Rückgängig und Entwurf</h3>
<p>Umbenennen, Verschieben, Färben, Entfernen, Gruppen anlegen und STL-Dateien laden lassen sich mit
<b>Strg+Z</b> zurücknehmen und mit <b>Strg+Y</b> wiederholen; ein entferntes Teil kommt samt Geometrie
zurück. Ein- und Ausblenden, Hervorheben, Schnitt und Öffnen sind Ansicht und kein Schritt.</p>
<p>Solange nichts gespeichert ist, hebt der Browser einen Entwurf je Form auf (Namen, Gruppen, Zuordnung,
Farben) und bietet ihn beim nächsten Öffnen derselben Datei an. Teile, die aus STL-Dateien dazukamen, stehen
nur in einer gespeicherten GLB.</p>
</section>`;
