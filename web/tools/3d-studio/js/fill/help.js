/* Die Hilfe der Füllabschätzung — die Texte, die früher in der
   Seitenleiste und in den title-Attributen standen. Anker je Frage. */

export const HELP = `
<section data-help-anchor="wozu">
<h3>Was hier gerechnet wird</h3>
<p>In welcher Reihenfolge füllt sich die Kavität? Von den Anschnitten aus breitet sich die Schmelzefront
durch die Rasterzellen des Bauteils aus; jede Zelle wird erreicht, wenn der kürzeste „Weg in Zeit" zu ihr
abgelaufen ist. Heraus kommt je Stelle der <b>Füllgrad</b>, bei dem sie voll wird — eine Abschätzung in
Sekunden, keine Strömung.</p>
<p>Was <b>nicht</b> drin ist: Trägheit, Strahlbildung, Gegendruck der Luft, Erstarrung während der Füllung.
Eine Füllsimulation braucht ein Volumennetz und Minuten; das hier sagt, in welcher Reihenfolge die
Kavität voll wird.</p>
</section>
<section data-help-anchor="setzen">
<h3>Anschnitte setzen, ziehen, neu setzen</h3>
<p>Oben im Bild <b>Anschnitt setzen</b>, dann aufs Bauteil klicken: die Stelle, an der die Schmelze
eintritt. Ort ist der getroffene Punkt, die Hochachse die nach außen gerichtete Flächennormale, das
Rechteck liegt in der Wandebene — <b>Breite</b> quer, <b>Höhe</b> längs.</p>
<ul>
<li><b>Punkt ziehen</b>: der Anschnitt rutscht auf der Wand (in der Wandebene).</li>
<li><b>Pfeil anklicken</b>: den Anschnitt an eine andere Stelle des Bauteils setzen.</li>
<li><b>Entf</b> entfernt die Auswahl, <b>Strg+Z</b> holt sie zurück, <b>Esc</b> bricht das Setzen ab.</li>
</ul>
</section>
<section data-help-anchor="vorgaben">
<h3>Vorgaben für neue Anschnitte</h3>
<p>Vorgaben für neue Anschnitte; jeder lässt sich danach im Auswahlfeld bemaßen, drehen und mit einem
festen Anteil am Strom versehen. Ohne Angabe teilt sich der Strom nach der Anschnittfläche auf.</p>
</section>
<section data-help-anchor="anteil">
<h3>Anteil</h3>
<p>Anteil am Schmelzestrom. Leer: aus der Fläche. Eine eingetragene Zahl setzt ihn fest; der Rest verteilt
sich nach Fläche auf die übrigen Anschnitte. Die Front aus einem Anschnitt läuft mit seinem Anteil,
bezogen auf den Mittelwert, schneller oder langsamer — wer eine Zelle zuerst erreicht, füllt sie.</p>
<p>„füllt … %" im Auswahlfeld ist, was dabei herauskommt: der Anteil des Volumens, den dieser Anschnitt
tatsächlich füllt. Die Naht zwischen zwei Anschnitten liegt dort, wo beide Fronten zugleich ankommen.
Ein Anschnitt mit ⚠ trifft kaum eine Rasterzelle — feiner rastern oder höher machen.</p>
</section>
<section data-help-anchor="drehung">
<h3>Drehung</h3>
<p>Drehung des Rechtecks in der Wand, um die Normale.</p>
</section>
<section data-help-anchor="zellkante">
<h3>Zellkante</h3>
<p>Die Kante der Rasterzellen in Millimetern. Eine Wand braucht mindestens zwei Zellen über ihre Dicke —
die halbe Wanddicke ist ein guter Wert. Feiner dauert länger; beim Laden wird sie aus dem Bauteil
vorgeschlagen (halbe Wanddicke 2V/A), ein selbst gesetzter Wert überlebt ein neues Bauteil.</p>
<p>Das Raster entsteht beim ersten <b>Rechnen</b> — eng um das Teil, zwei Zellen Rand. Wer die Zellkante
danach ändert, bekommt <b>Neu rastern</b>; bis dahin zeigt das Bild das vorige Raster. Nach unten begrenzt
nur der Speicher: mehr als 16 Mio. Rasterpunkte gibt es nicht — dann wird die Kante angehoben, und die
Zeile unter dem Feld sagt es schon beim Eintippen. Was das Raster kosten wird (Rasterpunkte, Speicher),
steht unter <b>Raster</b>, bevor gerechnet wird.</p>
</section>
<section data-help-anchor="alpha">
<h3>Dünnwand-Bremse α</h3>
<p>Dünnwand-Bremse: die Front läuft mit (Wanddicke / mittlere Dicke)^α. 0 ist reine Geometrie, 0,5 die
übliche Wahl, 1 bremst dünne Wände stark.</p>
<p>Mit α um 0,5 sieht man, was Füllbilder zeigen: die Schmelze nimmt erst die dicken Wege und holt dünne
Rippen später nach.</p>
</section>
<section data-help-anchor="kennzahlen">
<h3>Fließweg und Wanddicke</h3>
<p>Der <b>Füllgrad</b> einer Stelle ist der Anteil des Volumens, der voll ist, wenn die Front sie
erreicht — eine Reihenfolge, keine Zeit. <b>Fließweg / Wanddicke</b> ist die klassische Kennzahl der
Füllbarkeit; über etwa 300 : 1 wird es eng. Der Fließweg ist die Weglänge der Front bis zur entferntesten
Zelle, die Wanddicke das 2V/A des Bauteils.</p>
<p>Nach dem ersten <b>Rechnen</b> läuft die Füllung bei jeder Änderung am Plan von selbst nach — bis man
sie abbricht; dann wartet sie wieder auf den Knopf.</p>
</section>
<section data-help-anchor="ansichten">
<h3>Drei Ansichten</h3>
<ul>
<li><b>Füllgrad</b> — Bauteil nach Füllgrad gefärbt (früh blau, spät rot); was über dem Regler liegt,
bleibt grau.</li>
<li><b>Füllkörper</b> — die Schmelze beim gewählten Füllgrad als Körper, das Bauteil durchscheinend.</li>
<li><b>Bauteil</b> — nur das Bauteil und die Anschnitte.</li>
</ul>
</section>
<section data-help-anchor="fuellgrad">
<h3>Füllgrad</h3>
<p>Bis zu welchem Füllgrad gezeigt wird — die Front wandert mit dem Regler. Voreingestellt ist der
Füllkörper bei 50 %: die Front mitten im Teil sagt auf einen Blick, wo die Schmelze zuerst hinkommt.</p>
</section>
<section data-help-anchor="letzte-stellen">
<h3>Letzte Stellen</h3>
<p>Die zuletzt gefüllten Stellen als rote Kugeln — so viele, wie der Regler sagt; bei 0 keine. Wo die
Front zuletzt ankommt, sammelt sich die Luft: dort gehören die Überläufe hin — der
<a href="ueberlauf.html">Überlaufdesigner</a> setzt sie.</p>
</section>
<section data-help-anchor="dateien">
<h3>Dateien</h3>
<p><b>Speichern</b> legt den Plan als JSON ab — Anschnitte und α. <b>Exportieren → Füllkörper als STL</b>
ist der Füllkörper beim eingestellten Füllgrad. Solange nichts gespeichert ist, hebt der Browser einen
Entwurf je Bauteil auf und bietet ihn beim nächsten Mal an. Ein neues Bauteil beginnt mit einem leeren
Plan: ein Anschnitt sitzt auf der Wand <em>eines</em> Bauteils.</p>
</section>`;
