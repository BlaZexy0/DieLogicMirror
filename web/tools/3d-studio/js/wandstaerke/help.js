/* Die Hilfe der Wandstärkenanalyse — die Erklärungen, die früher in der
   Seitenleiste standen. Anker je Modus. */

export const HELP = `
<section data-help-anchor="feld">
<h3>Warum ein Raster</h3>
<p>Für jeden Rasterpunkt im Bauteil wird der <b>Abstand zur Oberfläche</b> gespeichert. Sein Betrag
ist der Radius der größten Kugel, die dort noch ins Bauteil passt, bei plattenförmigen Bereichen
also die <b>halbe Wandstärke</b>. Das macht dieselbe Rechnung zur Dickenanalyse: wo der Betrag am
größten ist, liegt die dickste Stelle, und die erstarrt zuletzt. Genau dort sitzen Lunker und
Porosität, und bis dorthin muss der Nachdruck über Anguss und Speiser reichen.</p>
<p>Das Feld reicht nur so weit wie das Bauteil, zwei Zellen Luft darum. Abstandsflächen außen, für
die Temperierung, rechnet der Temperierkanal-Designer selbst.</p>
</section>
<section data-help-anchor="zellkante">
<h3>Zellkante</h3>
<p>Die Kantenlänge einer Rasterzelle in Millimetern. Vorgabe ist die halbe Wanddicke (2V/A des
Bauteils), damit jede Wand mindestens zwei Zellen über ihre Dicke hat. Feiner heißt genauer und
langsamer: Der Speicher wächst mit der dritten Potenz. Was das Raster kosten wird, steht unter dem
Feld, <em>bevor</em> gerechnet wird; ein selbst gesetzter Wert überlebt ein neues Bauteil. Mehr als
16 Mio. Rasterpunkte rechnet die Seite nicht: Wären es mehr, vergrößert sie die Zelle in Schritten von
zehn Prozent, und die Zeile unter den Kosten nennt die Zelle, mit der gerastert wird.</p>
</section>
<section data-help-anchor="isoflaeche">
<h3>Isofläche</h3>
<p>Die Fläche gleichen Abstands nach innen, ein Untermaß von s: alles, was dünner als 2·s ist,
verschwindet, stehen bleiben genau die dicken Bereiche. Der Regler endet an der dicksten Stelle:
Tiefer gibt es nichts mehr. Aus <em>einem</em> Feld lassen sich beliebig viele Untermaße abgreifen,
nur das Feld selbst kostet Zeit. Nach dem Rechnen steht als Vorgabe die halbe größte Tiefe; ein
Minus vor der Zahl ist egal, nach innen geht es ohnehin.</p>
<p>Die Fläche heißt hier Isofläche, nicht „Kern": Das Wort ist in der Form schon vergeben. Sie lässt
sich unter <b>Exportieren</b> als STL speichern.</p>
</section>
<section data-help-anchor="schnitt">
<h3>Feldschnitt</h3>
<p>Ein Schnitt durch das Feld als Rasterbild: innen zeigt die Farbskala die Wandstärke (blau an der
Oberfläche, rot an der dicksten Stelle, die Werte stehen an der Skala), außen steht das Grau des
Bauteils, die Bauteilkontur liegt als Linie in der Farbe der Schrift darüber. Achse und Lage sind
Regler. Im Schnitt steht nur das Bauteil, durchscheinend: Die Isofläche verdeckte die Schnittebene
sonst. Das Bild ist bewusst ungeglättet: man soll das Raster sehen, aus dem die Fläche entsteht.</p>
</section>
<section data-help-anchor="waermezentren">
<h3>Wärmezentren</h3>
<p>Die Rasterpunkte, deren Abstand keinen größeren Nachbarn hat, sind die Mitten der größten Kugeln,
die ins Bauteil passen. Jede Marke ist genau diese Kugel (ihr Durchmesser die Wandstärke) und
trägt die Farbe ihrer Größe auf der Wandstärken-Skala (blau dünn, rot dick). Wahlweise Kreise, zur
Kamera gedreht und ohne Tiefenprüfung, damit sie auch im deckenden Bauteil zu sehen sind. Der Regler
„ab" lässt nur Stellen ab einem Anteil der größten Wandstärke zu; eine Stelle in der Kugel einer
stärkeren fällt weg, sonst säumten Dutzende Punkte jeden Grat.</p>
<p>Der Erstarrungsmodul V/A ist damit nicht identisch. Die Kugelprobe ist sein üblicher
Stellvertreter und für Wände exakt gleich.</p>
</section>
<section data-help-anchor="bedienung">
<h3>Bedienung</h3>
<ul>
<li>Ziehen dreht, rechte Maustaste oder zwei Finger verschieben, das Rad zoomt zum Zeiger.</li>
<li><b>Einpassen</b> (F, Doppelklick ins Leere) holt das Bauteil ins Bild.</li>
<li>Ein Bauteil kommt über den Chip in der Kopfzeile oder durch Ablegen einer STL/GLB im Viewport.</li>
<li>Die Einstellungen merkt sich der Browser je Bauteil und bringt sie beim nächsten Mal zurück (mit „Zurücksetzen"). <b>Speichern</b> schreibt sie als JSON-Datei, etwa zum Weitergeben.</li>
</ul>
</section>`;
