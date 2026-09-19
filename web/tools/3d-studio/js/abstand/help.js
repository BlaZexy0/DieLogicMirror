/* Die Hilfe der Abstandsanalyse — der Text, der früher unter der
   Seitenleiste stand, dazu die Erklärungen aus den title-Attributen. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Die Wandstärkenanalyse beantwortet die Frage nach innen — wie dick ist das Bauteil, wo erstarrt es
zuletzt. Nach außen steht die andere Frage, und die braucht zwei Körper: <b>wie weit ist die
Bauteiloberfläche vom Temperierkanal entfernt</b>, vom Auswerferstift, vom Nachbarteil? Zu nah heißt
Durchbruchgefahr und eine Stelle, die zu schnell erstarrt; zu weit heißt, die Kühlung greift dort
nicht.</p>
<p>Gerechnet wird <b>exakt</b>: für jeden Punkt der einen Oberfläche der echte Abstand zum nächsten
Dreieck der anderen — kein Raster, keine Näherung. Ein Würfelraster beschleunigt nur die Suche. Grobe
Netze (eine ebene Wand aus zwei Dreiecken) werden vorher verfeinert, sonst hätte die Einfärbung dort
nichts zu interpolieren.</p>
</section>
<section data-help-anchor="suchgrenze">
<h3>Suchgrenze</h3>
<p>Weiter als bis hierher wird nicht gesucht — das begrenzt die Rechenzeit und ist das obere Ende
dessen, was gemessen werden kann (ein Wert an der Grenze heißt „mindestens so weit"). Die Rechenzeit
wächst steil mit der Suchgrenze: gemessen an 235 000 Dreiecken 20 mm → 90 ms, 300 mm → 50 s. Ist sie
groß gegenüber den Teilen, warnt die Zeile unter dem Knopf, bevor gerechnet wird; die Rechnung lässt
sich jederzeit abbrechen. Die Suchgrenze gehört zur <em>Rechnung</em> — wer sie ändert, rechnet neu.</p>
<p>Die Kennzahlen nennen je Richtung den kleinsten und größten gemessenen Abstand und das Mittel; das
Mittel ist <b>flächengewichtet</b> — ein fein vernetzter Bereich zählt nicht mehr als ein grober.</p>
</section>
<section data-help-anchor="skala">
<h3>Farbskala</h3>
<p>Alles unter dem Minimum bekommt die Farbe des unteren Endes (rot, nah, kritisch), alles über dem
Maximum die des oberen (blau, fern). Nach jeder Rechnung reicht die Skala vom kleinsten zum größten
gemessenen Abstand; von Hand lässt sie sich danach einengen — das färbt nur um. Ungefärbt bleibt ein
Netz schlicht grau, sonst konkurrieren zwei Karten um dieselbe Aufmerksamkeit.</p>
</section>
<section data-help-anchor="durchdringung">
<h3>Innen oder außen</h3>
<p>Der Abstand ist vorzeichenlos: ein Kanal 5 mm <em>unter</em> der Oberfläche und einer 5 mm
<em>innen</em> im Bauteil liefern denselben Wert. Für Gussteil ↔ Temperierung ist das die gefährliche
Verwechslung — deshalb wird der Anteil der Punkte gemessen, die <b>innerhalb</b> des anderen Netzes
liegen, und rot gemeldet: dort durchdringen sich die Teile, der Abstand ist kein Freiraum.</p>
</section>
<section data-help-anchor="bedienung">
<h3>Bedienung</h3>
<ul>
<li>Der Zeiger über einem Netz nennt unten links den gemessenen Abstand am Dreieck darunter.</li>
<li>Welche Datei zu sehen ist und wie deckend, steht unter <b>Darstellung</b> in der Ansichtsleiste.</li>
<li>Ziehen dreht, rechte Maustaste oder zwei Finger verschieben, das Rad zoomt zum Zeiger;
<b>Einpassen</b> (F, Doppelklick ins Leere) holt beide Teile ins Bild.</li>
<li>Suchgrenze, Einfärbung und Darstellung merkt sich der Browser je Dateipaar.</li>
</ul>
</section>`;
