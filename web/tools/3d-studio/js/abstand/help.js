/* Die Hilfe der Abstandsanalyse — der Text, der früher unter der
   Seitenleiste stand, dazu die Erklärungen aus den title-Attributen. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Die Wandstärkenanalyse beantwortet die Frage nach innen: Wie dick ist das Bauteil, wo erstarrt es
zuletzt. Nach außen steht die andere Frage, und die braucht zwei Körper: <b>wie weit ist die
Bauteiloberfläche vom Temperierkanal entfernt</b>, vom Auswerferstift, vom Nachbarteil? Zu nah heißt
Durchbruchgefahr und eine Stelle, die zu schnell erstarrt; zu weit heißt, die Kühlung greift dort
nicht.</p>
<p>Gerechnet wird <b>exakt</b>: für jeden Punkt der einen Oberfläche der echte Abstand zum nächsten
Dreieck der anderen, kein Raster, keine Näherung. Ein Würfelraster beschleunigt nur die Suche. Die
Punkte sind die Ecken des Netzes, so wie es geladen wurde; dazwischen wird die Farbe linear
übergeblendet. Eine ebene Wand aus zwei Dreiecken hat also nur ihre vier Ecken: Wer dort eine feinere
Karte braucht, exportiert das Bauteil feiner vernetzt. Verändert wird das Netz hier nicht.</p>
</section>
<section data-help-anchor="suchgrenze">
<h3>Suchgrenze</h3>
<p>Weiter als bis hierher wird nicht gesucht: Das begrenzt die Rechenzeit und ist das obere Ende
dessen, was gemessen werden kann (ein Wert an der Grenze heißt „mindestens so weit"). Die Rechenzeit
wächst steil mit der Suchgrenze: gemessen an 235 000 Dreiecken 20 mm → 90 ms, 300 mm → 50 s. Ist sie
groß gegenüber den Teilen, warnt die Zeile unter dem Knopf, bevor gerechnet wird; die Rechnung lässt
sich jederzeit abbrechen. Die Suchgrenze gehört zur <em>Rechnung</em>: Wer sie ändert, rechnet neu.
Eine neue Datei, A oder B, verwirft die Messwerte beider Seiten: Sie waren gegen das alte Gegenstück
gemessen.</p>
<p>Die Abstände zeigt die Farbe im Viewport mit ihrer Skala; über einem Punkt nennt die Statuszeile
den Abstand dort zur Gegenseite. Kennzahlen daneben gibt es nicht: Erst die Grenzen der Skala machen
aus der Karte eine Aussage.</p>
</section>
<section data-help-anchor="skala">
<h3>Farbskala</h3>
<p>Alles unter dem Minimum bekommt die Farbe des unteren Endes (rot, nah, kritisch), alles über dem
Maximum die des oberen (blau, fern). Nach jeder Rechnung reicht die Skala vom kleinsten zum größten
gemessenen Abstand; von Hand lässt sie sich danach einengen; das färbt nur um. Das Minimum bleibt
unter dem Maximum: Wer eines über das andere hinaus setzt, schiebt das andere mit, und dessen Zeile
sagt es. Ungefärbt bleibt ein Netz schlicht im Grau des Bauteils (B etwas dunkler), sonst
konkurrieren zwei Karten um dieselbe Aufmerksamkeit.</p>
</section>
<section data-help-anchor="durchdringung">
<h3>Innen oder außen</h3>
<p>Der Abstand ist vorzeichenlos: ein Kanal 5 mm <em>unter</em> der Oberfläche und einer 5 mm
<em>innen</em> im Bauteil liefern denselben Wert. Für Gussteil ↔ Temperierung ist das die gefährliche
Verwechslung. Deshalb wird der Anteil der Punkte gemessen, die <b>innerhalb</b> des anderen Netzes
liegen, und als „schlecht" gemeldet: dort durchdringen sich die Teile, der Abstand ist kein Freiraum.</p>
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
