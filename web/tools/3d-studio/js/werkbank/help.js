/* Die Hilfe der Werkbank: vorn, was die Werkbank ist und was zwischen den
   Schritten läuft, dann je Werkzeug seine eigene Hilfe (dieselbe wie auf
   seiner Seite) in einem Abschnitt mit data-help-owner — ein ⓘ öffnet sie
   bei den Ankern SEINES Werkzeugs (js/studio/help.js), „?" beim Werkzeug,
   das gerade dran ist. Was nur auf der Werkbank gilt, steht als eigener
   Abschnitt vor der Hilfe des Werkzeugs. */

import { HELP as ENTFORMUNG } from '../entformung/help.js';
import { HELP as WANDSTAERKE } from '../wandstaerke/help.js';
import { HELP as ANGUSS } from '../runner/help.js';
import { HELP as FUELLUNG } from '../fill/help.js';
import { HELP as UEBERLAUF } from '../vents/help.js';
import { HELP as TEMPERIER } from '../cooling/help.js';

const part = (owner, title, extra, body) =>
  '<div data-help-owner="' + owner + '"><h2 class="st-help-part">' + title + '</h2>' + extra + body + '</div>';

const INTRO = `
<section data-help-anchor="werkbank">
<h3>Die Werkbank</h3>
<p>Ein Bauteil, alle Schritte, ein Viewport: links die Schritte, daneben die Modi des Schritts, der dran
ist. Jeder Schritt ist das Werkzeug der Einzelseite, mit denselben Feldern, Knöpfen und Tasten; die
Werkbank verbindet sie. Was ein Schritt plant (Anguss, Überläufe, Bohrungen), bleibt in den anderen als
Körper im Bild stehen; Griffe, Auswahl und Hilfsflächen gehören ihrem Schritt.</p>
<p>Gerechnet wird im <b>Bauteilsystem</b>: Trennebene z = 0, die Form öffnet nach +z. Der Anguss liegt als
Nut in der beweglichen Hälfte (z &gt; 0). Die Entformung prüft trotzdem alle drei Achsen und sagt, wenn
eine andere die kleinere Schieber- und Hinterschnittfläche hat.</p>
</section>
<section data-help-anchor="zusammenhang">
<h3>Was zwischen den Schritten läuft</h3>
<ul>
<li><b>Ein Abstandsfeld</b> für Wandstärke, Füllung und Temperierung, mit einer Zellkante (Schritt Bauteil,
Modus Feld) und so breit, wie die Abstandsfläche der Temperierung es braucht: gerechnet wird es einmal.</li>
<li>Die <b>Anschnitte der Füllung</b> sind die Mündungen des Angusses: Ort, Richtung, Maße und der Anteil
am Strom. Die Schusskurve unter dem Anguss sagt, wann jeder Anschnitt öffnet.</li>
<li>Das <b>Volumen der Überläufe</b> geht ins Gussvolumen des Angusses und als Überlaufgewicht in die
Auslegung; die <b>zuletzt gefüllten Stellen</b> der Füllung stehen im Schritt Überläufe als Marken.</li>
<li>Die <b>Auslegung</b> übernimmt Massen, Anschnittfläche, Wandstärke und Sprengfläche aus dem Modell.</li>
</ul>
</section>
<section data-help-anchor="datei">
<h3>Datei und Entwurf</h3>
<p><b>Speichern</b> legt alle Pläne in einer Werkbank-Datei ab: Anguss mit Prozess, Füllung, Überläufe und
Temperierung, dazu das Bauteil als Verweis (ein Beispielteil kommt beim Öffnen mit, ein eigenes Netz nicht).
Über den Bauteil-Chip öffnet sich eine Werkbank-Datei, ein Plan eines Einzelwerkzeugs (er geht an seinen
Schritt) oder ein Bauteil. Jede Änderung wird als Entwurf im Browser aufgehoben; Rückgängig und
Wiederholen gelten für alle Schritte zusammen.</p>
</section>`;

const VORSCHLAG = `
<section data-help-anchor="vorschlag">
<h3>Der Vorschlag</h3>
<p>Aus dem Bauteil entsteht ein Angusssystem: der Pressrest vor der Kante bei −Y, ein Anlauf von etwa der
halben Bauteilgröße, eine oder zwei gespiegelte Verzweigungen, die Anschnitte auf der Kante und an die Wand
gebunden (ein Strahl in +Y je Anschnitt). Breiten und Tiefen stuft der Vorschlag aus dem Gussvolumen ab.
Ein neues Bauteil bekommt beim Laden einen neuen Vorschlag. Im Modus System, wo auf der Seite des
Angussdesigners die Beispiele stehen, wählt man die Zahl der Anschnitte; „Anguss ans Bauteil legen" ersetzt
das System dann jederzeit, und Strg+Z holt das bisherige zurück.</p>
<p>Die Kurve unter dem Anguss rechnet mit dem Pressrest als Kolben und der Füllkammerlänge aus
„Prozess"; Maschine und Thermik kommen aus der Auslegung. „Prozess aus der Auslegung" setzt
Legierung, Füllzeit und Zielgeschwindigkeit nach ihr.</p>
</section>`;

const FUELLUNG_WB = `
<section data-help-anchor="werkbank-fuellung">
<h3>Auf der Werkbank</h3>
<p>Die Anschnitte setzt hier niemand von Hand: sie sind die Mündungen des Angusses. Ändert sich der Anguss,
rechnet die Füllung nach, sobald dieser Schritt dran ist. Mit der Schusskurve bekommt sie eine Uhr: jeder
Anschnitt öffnet, wenn ihn die Schmelze im Anguss erreicht; bis dahin füllen nur die früheren, und ein
späterer startet mit ihrem Vorsprung. Gezeigt wird ab „Kammer voll", die Zeiten ab Kolbenstart stehen im
Modus Ergebnis unter „Ab Kolbenstart".</p>
</section>`;

const AUSLEGUNG = `
<section data-help-anchor="uebernahme">
<h3>Übernahme aus dem Modell</h3>
<p>Massen aus Volumen × Dichte bei Solidus (die Dichte fest, um das Schwindmaß verkleinert; so rechnet auch
das Dashboard die Kavität). Die Anschnittfläche und -dicke kommen aus dem Angussgraphen, die Wandstärke aus
2V/A, die größte aus dem Abstandsfeld. Die <b>Sprengfläche</b> ist die Projektion von Bauteil, Anguss,
Pressrest und Überläufen auf die Trennebene, als Vereinigung gerastert.</p>
<p>Links im Dashboard stehen die Eingaben: der Auslegungsabschnitt des aktuellen Projekts, dieselben wie im
Dashboard der Auslegung.</p>
</section>
<section data-help-anchor="nachfuehren">
<h3>Automatisch nachführen</h3>
<p>Mit dem Häkchen werden die angehakten Werte neu übernommen, sobald sich Bauteil, Anguss, Überläufe oder
das Feld ändern.</p>
</section>`;

export const HELP = INTRO
  + part('entformung', 'Schritt 1 · Bauteil: Entformung', '', ENTFORMUNG)
  + part('wandstaerke', 'Schritt 1 · Bauteil: Wandstärke', '', WANDSTAERKE)
  + part('anguss', 'Schritt 2 · Anguss', VORSCHLAG, ANGUSS)
  + part('fuellung', 'Schritt 3 · Füllung', FUELLUNG_WB, FUELLUNG)
  + part('ueberlauf', 'Schritt 4 · Überläufe', '', UEBERLAUF)
  + part('temperier', 'Schritt 5 · Temperierung', '', TEMPERIER)
  + part('auslegung', 'Schritt 6 · Auslegung', AUSLEGUNG, '');
