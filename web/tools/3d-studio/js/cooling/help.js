/* Die Hilfe des Temperierkanal-Designers — die Texte, die früher in der
   Seitenleiste und in den title-Attributen standen. Anker je Thema. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Eine Druckgießform wird temperiert, indem Bohrungen im Stahl von Wasser oder Öl durchströmt werden —
<b>Kanäle</b>, die durch den Einsatz laufen, und <b>Kühlstiche</b>, Sacklöcher, die von der Rückseite bis
kurz vor die Kavität reichen. Was zählt, ist der Abstand zur Kavität: zu nah heißt Durchbruchgefahr und
Risse, zu weit heißt, die Kühlung greift nicht. Deshalb wird hier auf der <b>Abstandsfläche</b> gesetzt —
der Fläche, die überall denselben Abstand zum Bauteil hat.</p>
</section>
<section data-help-anchor="achsabstand">
<h3>Achsabstand zur Kavität</h3>
<p>Abstand der Fläche zur Kavität — dort sitzen die Spitzen der Kühlstiche und die Achsen der Kanäle.
Gemeint ist die <b>Achse</b> der Bohrung: zwischen Bohrungswand und Kavität bleibt der halbe Durchmesser
weniger (siehe Mindest-Wandabstand).</p>
<p>Die Fläche entsteht beim Laden des Bauteils von selbst und nach jeder Änderung des Abstands neu. Ein
Abstand innerhalb des gerechneten Bandes kostet nur das Ableiten, ein größerer ein neues Feld — das läuft
mit Fortschritt und lässt sich abbrechen. Schon gesetzte Elemente bleiben, wo sie sind.</p>
</section>
<section data-help-anchor="zellkante">
<h3>Zellkante</h3>
<p>Kantenlänge einer Zelle des Abstandsfelds in mm. Vorgabe beim Laden: ein 64stel der längsten
Bauteilkante. Feiner heißt glatter und langsamer — der Speicher wächst mit der dritten Potenz. Wert
eingeben und mit der Eingabetaste bestätigen; einmal gesetzt, bleibt er auch für das nächste Bauteil
stehen.</p>
<p>Nicht die halbe Wanddicke wie bei Wandstärke und Füllung: das Feld reicht hier weit nach außen, und die
Fläche im Abstand braucht keine Zellen, die eine Wand auflösen.</p>
</section>
<section data-help-anchor="mindestabstand">
<h3>Mindest-Wandabstand</h3>
<p>Wie viel Stahl zwischen <b>Bohrungswand</b> und Kavität mindestens stehen soll. Dagegen wird jedes
Element geprüft: sein <b>Wandabstand</b> ist der kleinste Abstand der Bohrungswand zur Kavität, aus dem Feld
entlang der Achse abgetastet (Feldwert minus halber Durchmesser).</p>
<p>Mit <b>Auto</b> folgt der Wert den Einstellungen: Achsabstand minus der halbe Durchmesser der dicksten
Vorgabe (Kühlstich oder Kanal), mindestens 1 mm. Eine Bohrung mit Vorgabemaßen, deren Achse auf der
Abstandsfläche sitzt, hält ihn also gerade ein — was mit den Vorgaben gesetzt wird, gilt nie als zu nah,
solange die Bohrung auf ihrem Weg nach außen keiner anderen Wand des Bauteils nahekommt. Wer eine eigene
Regel hat (etwa 1,5 × Ø), nimmt den Haken heraus und trägt sie ein.</p>
<p>Das Feld kennt den Abstand nur auf einen Bruchteil der Zellkante genau; um so viel darf ein Element
darunter liegen, ohne als zu nah zu gelten.</p>
</section>
<section data-help-anchor="setzen">
<h3>Setzen, ziehen, neu setzen</h3>
<ul>
<li><b>Kühlstich</b>: ein Klick auf die Abstandsfläche — dort sitzt die Spitze, der Stich läuft vom Bauteil
weg.</li>
<li><b>Kanal (2 Punkte)</b>: zwei Klicks auf die Abstandsfläche, ein Ende hier, das andere dort.</li>
<li>Danach an den <b>Achsenpfeilen</b> ziehen — oder am Punkt, dann rutscht er in der Bildebene. Es gibt
keine Arbeitsebene: die Enden bewegen sich frei im Raum. Beim Kanal wandern auf Wunsch beide Enden
zugleich, er behält dann Länge und Richtung.</li>
<li>Der <b>Pfeil</b> am Kühlstich setzt Spitze und Richtung neu: anklicken, dann die neue Stelle auf der
Abstandsfläche.</li>
<li><b>Entf</b> entfernt die Auswahl, <b>Strg+Z</b> holt sie zurück, <b>Esc</b> bricht das Setzen ab.</li>
</ul>
<p>Gesetzt wird im Modus „Setzen" — dort steht die Abstandsfläche im Bild. Wer in einem anderen Modus
einen Chip oder den Pfeil wählt, landet dort.</p>
</section>
<section data-help-anchor="richtung">
<h3>Richtung</h3>
<p>Wohin der Stich von der Spitze aus läuft:</p>
<ul>
<li><b>Normale</b> — senkrecht zur Abstandsfläche, vom Bauteil weg</li>
<li><b>Blick</b> — auf die Kamera zu, so, wie man gerade schaut</li>
<li><b>X</b>, <b>Y</b>, <b>Z</b> — entlang der Achse, mit dem Vorzeichen, das vom Bauteil weg zeigt</li>
</ul>
<p>Die Wahl gilt für neu gesetzte Stiche und für die Automatik; bei „Normale" nimmt die Automatik den
Feldgradienten an der Stelle. In der Form laufen Kühlstiche meist entlang der Öffnungsrichtung — die
Normale führt in einer Tasche quer durch den Hohlraum und auf der anderen Seite wieder ins Bauteil.
Solche Stiche zeigt die Prüfung.</p>
</section>
<section data-help-anchor="automatik">
<h3>Automatik</h3>
<p>Jede Stelle im Bauteil soll eine Bohrung in der Nähe haben, dicke Stellen zuerst: die Zellen des
Bauteils zählen mit ihrer Wandstärke, die Bohrungen wandern auf der Abstandsfläche so, dass die
gewichteten Abstände im Bauteil gleichmäßig klein werden. Richtung und Maße kommen von den
Kühlstich-Vorgaben oben; von Hand gesetzte Stiche bleiben.</p>
<p><b>Stichabstand min.</b>: näher kommen sich zwei Bohrungen nicht. Er ist nie kleiner als
1,5 × Durchmesser — zwei Bohrungen, die sich berühren, sind eine. Liegt der Regler darunter, sagt die
Zeile unter dem Knopf, womit gerechnet wird.</p>
<p>„Letzter Lauf der Automatik" (im Modus „Prüfung") nennt den gewichteten mittleren und den größten
Abstand einer Bauteilzelle zur nächsten Bohrungsspitze.</p>
</section>
<section data-help-anchor="pruefung">
<h3>Prüfung</h3>
<p>Der <b>Wandabstand</b> ist der kleinste Abstand der Bohrungswand zur Kavität, aus dem Feld entlang der
Achse abgetastet. Die Liste nennt jedes Element, das den Mindest-Wandabstand unterschreitet, das engste
zuerst — ein Klick wählt es und holt es ins Bild. Im Viewport stehen diese Elemente in der Warnfarbe,
in jedem Modus, auch während man zieht.</p>
<ul>
<li><b>unter dem Mindest-Wandabstand</b> — näher an der Kavität als eingestellt</li>
<li><b>Durchbruch</b> — die Bohrung schneidet das Bauteil</li>
</ul>
<p>Abhilfe: das Element wegziehen, den Durchmesser verkleinern, den Stich kürzen oder ihm über den Pfeil
eine andere Richtung geben.</p>
</section>
<section data-help-anchor="darstellung">
<h3>Darstellung</h3>
<p><b>Abstandsfläche durchscheinend</b>: durchscheinend sieht man das Bauteil in der Fläche; deckend zeigt
ihre Form — Taschen, Rippenschatten, wo die Fläche eng wird — und die Stiche und Kanäle davor.</p>
<p>Die Abstandsfläche steht in den Modi „Abstandsfläche" und „Setzen" im Bild; „Bauteil" und „Prüfung"
zeigen Bauteil und Bohrungen ohne sie.</p>
</section>
<section data-help-anchor="dateien">
<h3>Dateien</h3>
<p><b>Speichern</b> legt den Plan als JSON ab — Achsabstand, Elemente mit Ort, Richtung und Maßen, dazu ein
selbst eingetragener Mindest-Wandabstand. <b>Exportieren → STL</b> sind die Bohrungen als geschlossene
Körper, etwa zum Abziehen vom Formeinsatz im CAD. Solange nichts gespeichert ist, hebt der Browser einen
Entwurf je Bauteil auf und bietet ihn beim nächsten Mal an.</p>
</section>`;
