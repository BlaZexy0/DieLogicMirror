/* Die Hilfe des Angussdesigners — die Texte, die früher in der
   Seitenleiste (.hint) und in den title-Attributen der Felder standen,
   dazu das, was der gemeinsame Rahmen neu mitbringt (Chips, Auswahlfeld,
   Rückgängig). Jeder Abschnitt hat einen Anker; die ⓘ der Felder öffnen
   die Lade dort. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Pressrest, Laufkanäle, Verzweigungen und Anschnitte als Graph entwerfen, mit Querschnitt, Verlusten und
Füllbalance. Alles hängt am Graphen; nach jeder Änderung läuft die ganze Kette neu: Graph → Anschnittbreiten →
Abtasten → Strömung → Anzeige. Es gibt hier nichts, was auf Knopfdruck wartet.</p>
</section>
<section data-help-anchor="bedienung">
<h3>Punkte setzen, ziehen, entfernen</h3>
<ul>
<li>Einen <b>Punkt</b> anklicken wählt ihn; ein Klick auf den <b>Kanal</b> wählt den Punkt, der der Stelle am nächsten liegt.</li>
<li><b>Punkt ziehen</b>: in seiner Arbeitsebene; mit <b>Alt</b> aus ihr heraus. Der Pressrest zieht das ganze System mit.</li>
<li>Die <b>Knöpfe über dem Bild</b> hängen hinter der Auswahl an: <b>+ Punkt</b> einen regulären Punkt,
<b>+ Verzweigung</b> eine Gabelung mit zwei eigenständigen Ästen (das Häkchen im Auswahlfeld koppelt sie
spiegelsymmetrisch), <b>+ Spiegelpunkt</b> einen Punkt, bei dem ein Ast bearbeitet wird und zwei entstehen,
<b>+ Anschnitt</b> einen Anschnitt als Endpunkt. <b>Davor einfügen</b> setzt einen Punkt zwischen Auswahl und
Vorgänger. Ein Knopf, der gerade nicht geht, sagt beim Antippen, warum.</li>
<li><b>Pfeil</b> am Anschnitt (oder „Mündung ans Bauteil binden"): danach eine Stelle auf dem Bauteil anklicken.</li>
<li><b>Entf</b> entfernt die Auswahl ohne Nachfrage: Ein Punkt mit genau einem Nachfolger wird überbrückt, sonst
fällt alles dahinter mit weg; die Meldung nennt, wie viel. <b>Strg+Z</b> holt es zurück, <b>Strg+Y</b> wiederholt,
<b>Esc</b> bricht einen Zug ab (der Punkt springt zurück, es entsteht kein Schritt) und hebt sonst Zielmodus und
Auswahl auf, <b>F</b> passt das Bild ein.</li>
<li>Die <b>Lage</b> im Auswahlfeld nimmt Werte bis 5000 mm in jede Richtung; wer ein Feld unverändert mit Eingabe
verlässt, verschiebt nichts.</li>
<li>Blasse Punkte sind die <b>gespiegelte Seite</b> einer Verzweigung: sie folgen; bearbeitet wird die andere.</li>
</ul>
</section>
<section data-help-anchor="referenz">
<h3>Referenzbauteil</h3>
<p>Liegt durchscheinend dabei, damit die Anschnitte dorthin zeigen, wo sie hingehören. Sein Volumen wird das
<b>Gussvolumen</b>, ohne Überläufe: Die schlägt man unter „Prozess" auf. Geladen wird es oben über den
Bauteil-Chip (Beispielteil, Datei) oder durch Ablegen einer STL/GLB im Bild.</p>
<p>Ein Bauteil liegt im Studio mit der Trennebene bei z = 0; der Anguss liegt in der Trennebene des Pressrests.
Deshalb wird das Bauteil hier gedreht und vor die Anschnitte gestellt: seine Trennebene in die des Angusses, seine
nächste Kante an die Anschnitte. Das Netz selbst bleibt, wie es ist. Ein Beispiel, das sein Bauteil mitbringt
(Ölwanne), stellt es genau an seine Mündungen. Ein Plan aus einer Datei, der die Lage für dieses Bauteil kennt,
stellt es dorthin; kennt er keine, kommt es vor seine Anschnitte. Die Deckkraft steht unter „Darstellung".</p>
</section>
<section data-help-anchor="pressrest">
<h3>Pressrest</h3>
<p><b>Durchmesser</b> des Pressrests, also der Füllkammer. <b>Dicke</b> des Pressrests: sie wächst ENTGEGEN der
Ausstoßrichtung, also in dieselbe Formhälfte wie die Kanaltiefe. Der Pressrest ist ein Punkt wie jeder andere, nur
trägt er statt einer Arbeitsebene seine eigenen Maße; seine Ebene IST die Ausstoßrichtung, kippen lässt sie sich nicht.</p>
</section>
<section data-help-anchor="richtung">
<h3>Richtung</h3>
<p>Ausstoßrichtung: die Normale der Trennebene. Alle Arbeitsebenen leiten sich daraus ab. Beim Umschalten dreht
sich das System um den Pressrest mit: Die Trennebene kippt, und der Anguss liegt weiter in ihr; ein geladenes
Referenzbauteil dreht sich mit. Die Kamera bleibt stehen.</p>
</section>
<section data-help-anchor="kanalform">
<h3>Entformschräge und Bodenradius</h3>
<p><b>Entformschräge</b> je Flanke. Ohne sie klemmt der erstarrte Anguss. <b>Bodenradius</b>: Radius am Kanalboden.
An der Trennebene bleibt die Kante scharf: Dort stoßen die Formhälften aufeinander.</p>
</section>
<section data-help-anchor="zwickel">
<h3>Zwickelradius</h3>
<p>Radius der Innenkante an jeder Gabelung: die Nase des Zwickels zwischen zwei Abgängen, so groß wie der Fräser,
der sie stehen lässt. Die Außenwände gehen ohnehin stetig vom Zulauf in die Abgänge über.</p>
</section>
<section data-help-anchor="anschnitthoehe">
<h3>Anschnitthöhe</h3>
<p>Höhe aller Anschnitte, die dünnste Stelle des ganzen Systems. Gilt für jeden Anschnitt, dem im Auswahlfeld
keine eigene Höhe gegeben wurde. Im Auswahlfeld: ohne eigenen Wert gilt die Vorgabe unter „Kanalform"; ein eigener
Wert löst den Anschnitt davon, es sei denn, er ist genau die Vorgabe.</p>
</section>
<section data-help-anchor="abstufen">
<h3>Querschnitte abstufen</h3>
<p>Von den Anschnitten rückwärts: A = Q·Anteil / v<sub>Ziel</sub>, der zuführende Kanal das 1,6-fache, davor je die
Summe der Abgänge durch die Verjüngung. Danach wächst der Querschnitt nirgends mehr, auch nicht hinter dem
Anschluss am Pressrest, der höchstens 0,9 seines Durchmessers breit wird. Ein gewähltes Beispiel wird ebenso für
den Prozess von hier bemessen.</p>
<p><b>Verjüngung</b> je Abschnitt: der Kanal ist um diesen Faktor größer als die Summe seiner Abgänge.
<b>Seitenverhältnis</b>: Tiefe geteilt durch Breite. Bewährt sind 0,5 bis 1,0.</p>
</section>
<section data-help-anchor="spline">
<h3>Splinestraffheit und Abtastschritt</h3>
<p><b>Straffheit</b> der Splines. Klein heißt eckig, groß heißt ausholend. <b>Abtastschritt</b>: Abstand der
Schnitte entlang der Mittellinie. Alles (Querschnitt, Krümmung, Verlust) wird je Schritt gerechnet.</p>
</section>
<section data-help-anchor="gussvolumen">
<h3>Gussvolumen</h3>
<p>Gussvolumen einschließlich Überläufen: das, was durch die Anschnitte muss. Ein Referenzbauteil trägt sein
Volumen hier ein; die Überläufe (Überlaufdesigner, „Volumen") schlägt man auf.</p>
</section>
<section data-help-anchor="vziel">
<h3>Anschnitt v<sub>Ziel</sub></h3>
<p>Zielgeschwindigkeit am Anschnitt. Sie legt die Anschnittflächen fest.</p>
</section>
<section data-help-anchor="kammer">
<h3>Füllkammerlänge</h3>
<p>Länge der Füllkammer vom Kolben in Startlage bis zum Pressrest. Mit dem Durchmesser des Pressrests als Kolben-Ø
folgt daraus der Füllgrad, den die Schusskurve braucht.</p>
</section>
<section data-help-anchor="schusskurve">
<h3>Ankunft nach der DieLogic-Schusskurve</h3>
<p>Die Ankunft der Schmelze an jedem Anschnitt nach der DieLogic-Schusskurve der Auslegung (fokussierendes
Kolbengesetz bis 0,95·U<sub>H</sub> bzw. v<sub>krit</sub>, Plateau bis Kammer voll, Rampe auf das v₂ der NADCA-Füllzeit), erzeugt mit der Füllkammer von hier
(Pressrest-Ø als Kolben-Ø, Kammerlänge von oben), der Legierung und den Volumen von hier; Maschine und Thermik aus
dem aktuellen Projekt. Ist die Legierung des Projekts dasselbe Metall wie die von hier, gelten ihre Werte, sonst die
der Vorlage (AlSi9Cu3, AZ91D, Zamak 5). Ohne Häkchen: ein konstanter Strom aus Gussvolumen und Füllzeit.</p>
<p>Die Zeiten zählen <b>ab „Kammer voll"</b>: Dann steht die Schmelze am Mantel des Pressrests, und von da an füllt
sich der Anguss in der Rampe der zweiten Phase; wie weit erster und letzter Anschnitt auseinanderliegen, steht
daneben. Das Stück des ersten Kanals im Pressrest zählt als Pressrest, nicht als Anguss. Die Zeiten ab Kolbenstart
(erst die langsame erste Phase bis „Kammer voll") stehen in den Details. Die Kammer ist die von hier: Pressrest-Ø und Kammerlänge,
daraus der Füllgrad; Maschine (v<sub>max</sub>, a<sub>max</sub>) und Thermik nimmt die Kurve aus dem aktuellen Projekt.</p>
<p><b>Füllzeit der Kurve übernehmen</b>: die Füllzeit ab Anschnitt, die die Kurve braucht, als Füllzeit des
Prozesses übernehmen; dann passen Ströme und Zeiten zusammen.</p>
</section>
<section data-help-anchor="verzweigungsverlust">
<h3>Verzweigungsverlust</h3>
<p>Beiwert des Verzweigungsverlusts. 1,0 = scharfe Gabel, 0,3 = sehr sanft aufgehend.</p>
</section>
<section data-help-anchor="ebene">
<h3>Arbeitsebene</h3>
<p><b>Ebene längs</b>: Arbeitsebene um die Laufrichtung kippen: Der Kanal legt sich auf die Seite.
<b>Ebene quer</b>: Arbeitsebene quer zur Laufrichtung kippen: Daraus wird eine Stufe im Verteiler.</p>
</section>
<section data-help-anchor="querschnitt">
<h3>Kanalbreite und Kanaltiefe</h3>
<p><b>Breite</b> des Kanals an der Trennebene. Mehr als der Pressrest-Durchmesser ergibt keinen Sinn.
<b>Tiefe</b> des Kanals: sie wächst entgegen der Ausstoßrichtung, also in die Formhälfte hinein.</p>
</section>
<section data-help-anchor="aufteilung">
<h3>Aufteilung</h3>
<p>Wie viel des Stroms in den ersten Ast gehen SOLL. Was wirklich fließt, entscheidet der Widerstand; beides steht
im Flussschema nebeneinander. Gespiegelt teilen die Äste immer 50:50, mit drei und mehr Abgängen teilen sie zu
gleichen Teilen; der Regler ist dann gesperrt, die Zeile darunter sagt es. Ein Punkt, an den ein zweiter Abgang
kommt, wird eine Verzweigung.</p>
</section>
<section data-help-anchor="spiegel">
<h3>Spiegeln</h3>
<p>Mit dem Häkchen bleiben beide Äste spiegelsymmetrisch: eine Seite wird bearbeitet, die andere zieht nach (blass,
nicht anfassbar). Ein Spiegelpunkt spiegelt immer. Gespiegelt wird eine Gabelung mit genau zwei Ästen: einen dritten
gibt es erst, wenn die Spiegelung gelöst ist.</p>
</section>
<section data-help-anchor="anschnitt">
<h3>Anschnitt</h3>
<p><b>Anschnitttiefe</b>: Tiefe des Anschnitts in Fließrichtung (Steg): ein gerades Stück mit unverändertem
Querschnitt vor dem Bauteil, entlang der Mündungsrichtung. Nicht die Breite; die steht darunter.
<b>Übergang</b>: wie der Querschnitt vom Kanal auf den Anschnitt übergeht.</p>
<p><b>Mündung ans Bauteil binden</b>: ein Anschnitt, dessen Richtung aus der Sehne zum Vorgänger kommt, dreht sich
mit, sobald der Vorgänger wandert. Wer stattdessen die Stelle am Bauteil anklickt, legt beides auf einmal fest: den
Ort der Mündung und die Richtung, in der die Schmelze das Bauteil betritt. Gebunden ist die Richtung, nicht der
Punkt; er lässt sich weiter ziehen. Eine andere Stelle bekommt der Anschnitt mit einem neuen Klick auf den Pfeil;
<b>Strg+Z</b> nimmt die Bindung zurück. Ein Klick auf einen anderen Punkt während des Zielens wählt diesen und
beendet das Zielen. Beim Umschalten der Richtung dreht die gebundene Mündung mit.</p>
</section>
<section data-help-anchor="flussschema">
<h3>Flussschema</h3>
<p>Der Angussbaum als Schema: Querschnitte, Geschwindigkeiten, Soll gegen Ist und die Ankunft der Schmelze an
jedem Anschnitt. Lauflänge, Angussvolumen, Volumenstrom und Druckbedarf stehen darüber: dort, wo auch Fläche,
Geschwindigkeit und Aufteilung an jedem Ast hängen. Die Dicke eines Bandes folgt dem Querschnitt, seine Farbe
der Geschwindigkeit: von Blau (ruhig) über Teal und Gold nach Rot (schnell), bis zum schnellsten Anschnitt
dieses Angusses. Ein Urteil ist das nicht; geurteilt wird in der Prüfung.</p>
</section>
<section data-help-anchor="pruefung">
<h3>Prüfung</h3>
<p>Die Regeln sind die, die in jedem Lehrbuch stehen, nur laufen sie über die wirkliche Geometrie, über jeden
abgetasteten Millimeter. Am Reiter steht, wie viele erfüllt sind; verletzte Regeln stehen oben, mit Ort und Zahl.</p>
</section>
<section data-help-anchor="dateien">
<h3>Dateien</h3>
<p><b>Speichern</b> legt den Graphen als JSON ab; nur damit lässt sich weiterarbeiten. Dateien nimmt auch der
Viewport per Ablegen entgegen; was für eine es ist, entscheidet der Inhalt.</p>
<p><b>Exportieren → STL</b> sind zwei Dateien: der <b>Anguss</b> als ein geschlossener Körper (an den Gabelungen
gehen die Kanäle mit Zwickelradius ineinander über, am Pressrest ist der erste Kanal an dessen Mantel beschnitten)
und der <b>Pressrest</b> als Zylinder. Beide berühren sich, keiner steckt im anderen. Mit Referenzbauteil stehen sie
in dessen Koordinaten und liegen im CAD genau an seiner Datei; ohne in denen des Angusses. Sie heißen wie der Plan:
<i>bauteil</i>-anguss.stl und <i>bauteil</i>-pressrest.stl neben <i>bauteil</i>-anguss.json. Der Browser fragt beim
ersten Mal, ob die Seite mehrere Dateien laden darf.</p>
<p>Solange nichts gespeichert ist, hebt der Browser einen Entwurf auf und bietet ihn beim nächsten Mal an.</p>
</section>`;
