/* Die Hilfe des Überlaufdesigners — die Texte, die früher in der
   Seitenleiste und in den title-Attributen standen. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Wozu</h3>
<p>Wo die Schmelze zuletzt ankommt, muss die Luft hinaus: dort sitzen die Überläufe. Sie sammeln die
erste, kalte und oxidhaltige Schmelze und geben der Luft einen Weg aus der Kavität.</p>
</section>
<section data-help-anchor="setzen">
<h3>Setzen, ziehen, neu setzen</h3>
<p>Oben im Bild eine <b>Art</b> wählen, dann auf das Bauteil klicken: der getroffene Punkt ist der Ort,
die nach außen gerichtete Flächennormale die Hochachse. Steg, Bohne und Kanal liegen in der Wandebene, ihre
offene Seite an der Wandfläche, die Tiefe wächst entgegen der Normalen; wohin das Element in der Ebene weist,
sagt die Drehung.</p>
<ul>
<li><b>Punkt ziehen</b>: er rutscht auf der Wand entlang (in ihrer Tangentialebene); mit <b>Alt</b> von ihr weg.</li>
<li><b>Pfeil anklicken</b>: das Element an eine andere Stelle des Bauteils setzen.</li>
<li><b>Entf</b> entfernt die Auswahl, <b>Strg+Z</b> holt sie zurück, <b>Esc</b> bricht das Setzen oder einen
Zug ab (der Punkt springt zurück).</li>
</ul>
</section>
<section data-help-anchor="arten">
<h3>Die vier Arten</h3>
<ul>
<li><b>Überlaufbohne</b>: Tasche am Ende des Fließwegs; sammelt die erste, kalte und oxidhaltige Schmelze.</li>
<li><b>Überlauf mit Entlüftung</b>: Bohne mit flachem Entlüftungskanal, ab der Kugel am Bohnenende Punkt
für Punkt in der Wandebene gezogen. „+ Punkt" hängt einen an, in der Richtung des letzten Stücks weiter;
„− Punkt" entfernt den gewählten (der letzte bleibt, das Bohnenende sitzt fest).</li>
<li><b>Waschbrett</b>: gewellter Kanal; die Schmelze erstarrt in den Wellen, die Luft kommt hindurch.</li>
<li><b>Entlüftungsschlitz</b>: nur der flache Kanal, ohne Bohne, wo Luft hinaus muss, aber nichts
gesammelt wird.</li>
</ul>
</section>
<section data-help-anchor="drehung">
<h3>Drehung</h3>
<p>Drehung um die Hochachse des Elements (die Wandnormale): Das Element schwenkt in der Wand um seinen
Ort, die Längsrichtung dreht sich mit, die Hochachse bleibt die Normale.</p>
</section>
<section data-help-anchor="volumen">
<h3>Volumen</h3>
<p>Was das Bauteil wiegt und was die Überläufe dazulegen; zusammen ist das, was durch die Anschnitte
muss. <b>Gesamt</b> ist das Gussvolumen, das der Angussdesigner unter „Prozess" braucht.</p>
</section>
<section data-help-anchor="dateien">
<h3>Dateien</h3>
<p><b>Speichern</b> legt den Plan als JSON ab: Orte, Richtungen, Maße. <b>Exportieren → STL</b> sind die
Körper: je Element Steg, Bohne und Kanal als geschlossene Körper. Solange nichts gespeichert ist, hebt der
Browser einen Entwurf je Bauteil auf und bietet ihn beim nächsten Mal an.</p>
</section>`;
