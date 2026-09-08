# 3D-Studio

Fünf Werkzeuge rund um Bauteil und Form in 3D, unter einem
Navigationsreiter. Alles rechnet clientseitig — kein Backend, kein
Projekt; die Bauteile kommen als STL oder GLB und verlassen den Browser
nicht. Ein Konto braucht es trotzdem: wie jede Seite unter `/tools/`
liefert das Backend sie nur mit Sitzung aus (`login_gate` in
`backend/app.py`), sonst geht es zur Anmeldung und danach zurück.

| Seite           | Inhalt |
|-----------------|--------|
| `index.html`    | Übersicht: die Werkzeuge als Karten, dazu die drei Schritte der Formteilung |
| `werkbank.html` | **Werkbank** — alle Werkzeuge als sechs Schritte an einem Bauteil in einem Viewport: Bauteil (Entformung, Wandstärke), Anguss (Vorschlag aus dem Bauteil), Füllung (von den Anschnitten des Angusses), Überläufe, Temperierung, Auslegung (das Dashboard mit Massen, Anschnitt und Sprengfläche aus dem Modell); Code in `js/werkbank/` |
| `form.html`     | **Formaufbau** — eine beispielhafte Kaltkammer-Druckgießform als Schnittmodell |
| `entformungsanalyse.html` | **Entformungsanalyse** — für ein Bauteil die Zuordnung jedes Dreiecks zu Formhälfte oder Schieber |
| `wandstaerke.html` | **Wandstärkenanalyse** — Abstandsfeld durch Rasterisierung: Wandstärke und Wärmezentrum, Fläche gleichen Abstands (die Frage nach *innen*) |
| `abstand.html`  | **Abstandsanalyse** — kürzester Abstand zwischen zwei Dateien, eingefärbt auf einer selbst gesetzten Skala (die Frage nach *außen*) |
| `anguss.html`   | **Angussdesigner** — das Angusssystem als Graph entwerfen: Pressrest, Laufkanäle als Splines, Verzweigungen, Anschnitte; dazu Querschnitt, Krümmung, Bernoulli-Verluste und Füllbalance |

Erreichbar über den Reiter **3D-Studio** in der Navigation oder direkt
unter `/tools/3d-studio/`.

Three.js liegt lokal in `vendor/` (MIT, LICENSE dort) — es ist die
einzige Fremdbibliothek des Studios und wird von keiner anderen Seite der
Website gebraucht, deshalb steht sie hier und nicht in `/shared/vendor/`.

Vier der fünf Seiten *messen* an vorhandener Geometrie; der
Angussdesigner ist der einzige, der welche *erzeugt*.

## Formaufbau (`form.html`)

Der Formaufbau ist ein Werkzeug für **eigene Formen**: STL-Dateien laden
und in Gruppen einsortieren — Feste Seite, Temperierung fest, Bewegliche
Seite, Temperierung beweglich, Schieber, Gussteil, dazu beliebige eigene
Gruppen —, Teile umbenennen, verschieben und entfernen, und das Ganze als
**eine GLB-Datei** speichern, die der Viewer wieder lädt. Jede Gruppe hat
eine Seite (fest bleibt stehen, beweglich fährt beim Öffnen mit), eine
Werkstoffklasse für neu geladene Teile (Stahl, Gussteil, Anguss,
Temperierung …; sie steuert Transparenz und Schnittfarbe) und kann ein
Schieber sein, der beim Öffnen zusätzlich in der Trennebene herausfährt.
Die Gruppen und die Zuordnung der Teile stehen als glTF-`extras` am
Wurzelknoten (`userData.formaufbau`, Schema `dielogic-formaufbau`); eine
GLB ohne diese Metadaten — die ausgelieferte Beispielform oder eine fremd
erzeugte Datei mit den Namen aus `js/registry.js` — wird in die
Standardgruppen einsortiert. Erwartet werden die Knoten `die`,
`fixedRoot` und `movingRoot`, darunter je Teil ein benannter Knoten mit
seinen Meshes (`js/assembly.js`).

Voreingestellt geladen wird die Form der **Ölwanne** (Beispielteil der
Bauteilseiten, aus `openscad_parts`): feste Hälfte mit Kavitätseinsatz
(Wannenaußenseite, Flanschtasche, Nuten der Außenrippen, Kernstift für
den Ablasspilot), Füllkammer bis an die Trennebene — ganz im Einsatz,
mit Bund am Formrücken, Gießloch und Gießkolben —, Pressrest in der
Kammermündung, Anguss (Schräge, gerundeter
Grund) und Fächeranschnitt in der Ebene des Flansches an der unteren
Flanschkante;
bewegliche Hälfte mit Kerneinsatz (Wanneninneres mit Schlitzen für
Schwallbleche und Rippen, Kernstifte für die Flanschbohrungen),
Auswerferkasten mit Platten, 14 Auswerfer- und 4 Rückdrückstiften,
Führungssäulen und -buchsen; an der oberen Flanschkante fünf Überläufe
als gezogene Taschen mit eigenem dünnem Anschnitt, deren
Entlüftungsstiche in einem Sammelkanal und einer schmalen Entlüftungslinie
zu einer runden, geteilten Vakuumentlüftung in den Einsätzen führen,
von der allein die Anschlussbohrung durch die feste Hälfte zum
Formrücken geht;
je Hälfte zwei Temperierkreise (fest: unter dem flachen Boden und unter
dem Sumpf), an Pressrest, Anguss und Auswerferstiften vorbeigeführt.

Bedienung:

- **Gruppen** mit je einer **Glühbirne** im Kopf: leuchtet sie, ist
  mindestens ein Teil sichtbar; ein Klick schaltet die ganze Gruppe um.
  Daneben ✎ (umbenennen), + (STL-Dateien in diese Gruppe laden) und ×
  (eine leere Gruppe entfernen). Je Teil: Schalter, Farbe, Name (✎),
  Gruppenauswahl zum Verschieben und ×. „Gruppe anlegen" fragt Name,
  Seite, Werkstoffklasse und Schieber-Richtung samt Weg.
- **Dateien**: „STL laden in" (Zielgruppe wählbar, mehrere Dateien auf
  einmal, auch per Ziehen-und-Ablegen auf den Viewport), „GLB laden"
  ersetzt die ganze Baugruppe, „Als GLB speichern" schreibt sie mit allen
  Metadaten. Eine abgelegte GLB wird ebenfalls als Baugruppe geladen.
- **Stahl-Transparenz** und **Form öffnen**.
- **Schnittebene** (Achse, Position, Seite) — der Schnitt zeigt die Körper
  *geschlossen*: Stencil-Capping zeichnet je Werkstoffklasse (Stahl,
  Gussteil, Anguss, Überläufe, Temperierung, Kolben, Stifte) massive
  Schnittflächen in Klassenfarbe (`js/clipcaps.js`, nach dem Three.js-
  Beispiel `webgl_clipping_stencil`).
- Über dem Viewport: **X · Y · Z · Iso** — ein zweiter Klick auf denselben
  Knopf dreht die Blickrichtung um (die Beschriftung wechselt auf −X, −Y,
  −Z bzw. Iso'). Daneben **Persp / Parallel**: Zentralprojektion oder
  2D-Parallelprojektion (orthografisch, maßstäblich); beim Umschalten
  bleibt der Bildausschnitt gleich groß.
- Hover zeigt die Baugruppe unter der Maus.

### Die Kavität ist ein echtes Negativ

Die Stahlteile sind keine Quader mehr, die sich mit den Einbauteilen
überschneiden. `js/csg.js` (BSP-Verfahren) schneidet heraus:

- die **Kavität** aus beiden Formeinsätzen — mit `CFG.fit` Luftspalt, damit
  Stahl und Gussteil nicht deckungsgleich aufeinanderliegen,
- den **Kernstift**, der als Stahlsäule im beweglichen Einsatz stehen
  bleibt und im festen Einsatz eine Auflage hat,
- **Angusskanal, Anschnitt, Überläufe, Entlüftungskanal** als Nuten in der
  beweglichen Hälfte,
- die **Kammerbohrung** in der festen Hälfte, den **Angusskegel** im festen
  Einsatz sowie Bohrung und **Gießloch** der Füllkammer selbst,
- **Auswerfer- und Rückdrückstifte** (mit abgesetzter Kopfsenkung in der
  Halteplatte), **Führungssäulen** und **Buchsensitze**,
- die Lamellennuten des **Vakuumblocks** und den Durchbruch der
  Aufspannplatte.

Die Kavität hat ihren größten Querschnitt an der Trennebene und verjüngt
sich mit `CFG.part.draft` in beide Hälften — das Gussteil ist also
tatsächlich entformbar (in der Entformungsanalyse als Beispielteil nachprüfbar).

**Bewusst nicht ausgeschnitten** sind die Temperierkanäle: das Rohrmodell
*ist* die Bohrung samt Inhalt. Im Schnitt zeichnet die Klassen-Deckfläche
den Kanalquerschnitt korrekt, und bei transparentem Stahl sieht man die
Kreise wie in einer CAD-Ansicht. `tests/die.test.mjs` prüft alle anderen
Paarungen auf gemeinsames Volumen — es muss null sein.

## Entformungsanalyse (`entformungsanalyse.html`)

Für ein Bauteil (Beispielteil oder eine eigene **STL oder GLB** per
Knopf/Drag-and-drop) wird berechnet, **welche Formhälfte oder welcher
Schieber jedes Dreieck abbildet** — ohne dass Hälften oder Schieber im
Modell vorhanden sein müssen, ohne Regler, sofort beim Laden. Welches
Format eine hochgeladene Datei hat, entscheidet der Dateikopf, nicht die
Endung.

### Der Weg dahin

1. **Sichtbarkeit** (`js/part/visibility.js`) — für jede der sechs
   Hauptrichtungen ±X ±Y ±Z wird je Dreieck geprüft: zeigt die Normale
   dorthin (`n·d ≥ 0`), und ist der Weg frei? Der zweite Teil ist die
   eigentliche Arbeit, denn er entscheidet über Hinterschnitte. Weil die
   Richtungen achsparallel sind, bleibt ein Strahl in *einer* Zelle eines
   Rasters über die beiden Querachsen — es genügt, die Dreiecke einmal je
   Richtung einzusortieren und pro Abtastpunkt nur die Dreiecke seiner
   Zelle zu prüfen. Das ist der teure Teil; er hängt nur am Netz. Im
   Browser rechnen die sechs Richtungen parallel in Web-Workern
   (`js/part/visibility-worker.js`), unter Node im selben Faden. Die
   Abtastpunkte liegen um einen Hauch vor der Fläche: genau auf ihr träfe
   ein streifender Strahl die Kante eines Nachbarn, der in derselben Ebene
   endet, und eine Querbohrung gälte als verdeckt vom Rand ihrer eigenen
   Mündung.
2. **Zuordnung nach festen Regeln** (`js/part/segment.js`), je Dreieck:
   - **Hälfte** — sieht eine der beiden Formhälften das Dreieck frei und
     mit mindestens 0,5° Schräge, gehört es ihr (bei beiden: der mit der
     größeren Schräge).
   - **Schieber** — sonst bekommt es der Schieber, der es frei sieht, der
     mit der frontalsten Sicht. Eine Fläche *parallel* zur Schieberrichtung
     (0°) ist erlaubt: eine Querbohrung wird von einem Kern ohne Schräge
     gebildet. Bei Gleichstand nimmt sie der Schieber von der näheren Seite.
   - **Hinterschnitt** — was keine Richtung frei sieht (rot).
   - **Nachbarn** — eine senkrechte Wand, die nur eine Hälfte streifend
     sieht und kein Schieber erreicht, folgt der Mehrheit ihrer Nachbarn.
   - **Löcher** — ein Fleck, der ganz von *einer* anderen Region umschlossen
     ist und den diese Richtung ebenfalls sieht, schlägt ihr zu.

   Die Regeln gelten **je Dreieck**, nicht als Optimierung über das Netz.
   Der Vorgänger wuchs Regionen mit Kosten je Dreieck über das Netz — und
   eine große ebene Wand aus neun Dreiecken war dann für einen Schieber
   billiger zu erreichen als für die Hälfte, die erst vierzig kleine
   Verrundungsdreiecke überqueren musste. Das Ergebnis hing an der
   Zerlegung, nicht an der Geometrie; das U-Profil bekam so 26 % Schieber.
3. **Formöffnung** — wenn nicht vorgegeben (Auto), die Achse mit der
   kleinsten Fläche aus Schiebern und Hinterschnitten (Hinterschnitt
   zählt doppelt). Die drei Zuordnungen kosten zusammen Millisekunden;
   X/Y/Z lassen sich zum Vergleich auch fest wählen.
4. **Entformschrägen** (`js/part/draft.js`) — `α = arcsin(n · d)` gegen die
   *zugewiesene* Richtung; eine Schieberfläche wird also gegen den
   Schieber bewertet, nicht gegen die Formöffnungsrichtung.

Wo zwei Regionen aufeinandertreffen, liegt die **Trennlinie**.

### Einfärbungen

**Regionen** (sechs Farben + Rot für Hinterschnitte), **Schräge**
(Farbverlauf um einen Grenzwert, Hinterschnitte dunkelrot) und **Grau**.
Die Legende nennt je Eintrag den Flächenanteil, die Kennzahlen die
Bilanz Hälften / Schieber / Hinterschnitt, die gewählte Formöffnung und
die Rechenzeit. Bei der Schräge steht links unten im Viewport eine
**Farbskala** mit den Zahlenwerten; bei den Regionen bleibt sie aus, dort
gibt es keine Reihenfolge.

## Wandstärkenanalyse (`wandstaerke.html`)

Eine Offsetfläche dadurch zu bauen, dass man jeden Punkt des Netzes
entlang seiner Normale nach außen schiebt, geht nur bei kleinen Beträgen
gut. Sobald das Aufmaß in die Größenordnung von Verrundungen und Taschen
kommt, durchdringen sich die verschobenen Flächen selbst: eine Innenecke
klappt um, ein schmaler Steg wächst durch sich hindurch. Deshalb läuft
das hier über ein **Rasterfeld**.

### Schritt 1 — Feld (auf Knopfdruck)

`js/part/field.js` legt ein Raster über das Bauteil und speichert für
jeden Rasterpunkt den vorzeichenbehafteten Abstand zur Oberfläche (innen
negativ). Zwei Durchgänge:

1. **Innen/außen** — für jede Rastersäule (feste x, y) werden alle
   Dreiecke gesucht, die sie überdecken, und ihre z-Durchstoßpunkte
   gesammelt. Aus der Summe der Durchstoßrichtungen oberhalb eines
   Rasterpunktes folgt, ob er im Bauteil liegt. Das ist die eigentliche
   Rasterisierung; sie kostet einen Durchlauf über die Dreiecke. Die
   Säulen liegen um Bruchteile einer Zelle versetzt, damit ein Strahl
   nicht genau eine Netzkante trifft.
2. **Abstandsband** — jedes Dreieck trägt seinen exakten Abstand
   (Punkt-Dreieck nach Ericson) in die Rasterpunkte seiner um `band`
   aufgeweiteten Bounding-Box ein. Eine untere Schranke über die Box
   spart den teuren Test fast überall. Außerhalb des Bandes bleibt der
   Wert nach außen bei +band stehen — das hält Speicher und Rechenzeit
   im Rahmen.
3. **Der Kern** — nach innen gibt es keine solche Grenze: der Abstand
   kann nie größer werden als die halbe Dicke, und genau dieses Maximum
   ist die Zahl, um die es bei der Wandstärke geht. Zellen jenseits des
   Bandes bekommen deshalb ihren Abstand aus einer exakten euklidischen
   Distanztransformation der Innen/Außen-Maske (Felzenszwalb &
   Huttenlocher, trennbar, O(N)) — auf eine halbe Zelle genau; nahe der
   Oberfläche bleibt der exakt gestempelte Wert. Das Feld ist innen
   immer vollständig, ein abgeschnittener Kern kommt nicht mehr vor.

**Auflösung** (Zellen entlang der längsten Kante) und **Bandbreite
außen** stehen als Regler daneben; was sie kosten werden — Zellgröße,
Rasterabmessungen, Punktzahl, Speicher — steht *vor* dem Rechnen in den
Kennzahlen. Gerechnet wird erst auf „Feld berechnen".

### Schritt 2 — Fläche ableiten (sofort)

`js/part/surfacenets.js` zieht die Fläche gleichen Abstands heraus:
je Rasterzelle mit Vorzeichenwechsel ein Punkt (Mittelwert der
Kantenschnittpunkte), je Rasterkante mit Vorzeichenwechsel ein Viereck
zwischen den vier angrenzenden Zellpunkten. Gegenüber Marching Cubes
braucht das keine 256-Zeilen-Tabelle, liefert gleichmäßigere Dreiecke und
ist geschlossen und mannigfaltig.

Das **Aufmaß** hat einen Regler und daneben ein Feld für die Zahl
(`+10`, `-10`, `−10`, `1,5` und `1.5` gelten alle; nach oben auch
jenseits des Reglers, der bleibt dann an seinem Ende stehen). Nach innen
endet der Regler an der **dicksten Stelle** — tiefer gibt es nichts
mehr, was eine Fläche gleichen Abstands haben könnte; auch die Zahl
wird dort festgehalten. Nach oben reicht er bis +40 mm. Beide zeigen
denselben Wert. Nach dem Rechnen steht als **Vorgabe ein Untermaß von
der halben größten Tiefe**: stehen bleibt, was dicker ist als die halbe
größte Wandstärke — die Kerne, um die es geht. Ein selbst gesetztes
Aufmaß überlebt ein neues Feld; ein neues Bauteil bekommt wieder die
Vorgabe. Solange er in der Bandbreite liegt, kostet ein
anderer Wert nur das Ableiten — Millisekunden, kein neues Feld; am
Regler wird höchstens einmal je Bild abgeleitet. Verlangt es mehr, zieht
die Bandbreite automatisch mit und die Seite bittet um ein neues Feld.

Was dabei herauskommt, ist geometrisch richtig statt nur verschoben:
an konvexen Kanten entsteht ein Radius in Höhe des Aufmaßes, enge Spalte
wachsen zu, statt sich zu durchdringen. `tests/field.test.mjs` prüft das
gegen die geschlossene Formel für den Offset eines Quaders
(V = abc + 2r(ab+bc+ca) + πr²(a+b+c) + 4/3 πr³) und gegen die Kugel.

### Wandstärke und Wärmezentrum

Das Feld beantwortet nebenbei eine zweite Frage. **Innen** ist der Betrag
des Feldwertes der Radius der größten Kugel, die an dieser Stelle noch
ins Bauteil passt — bei plattenförmigen Bereichen also die halbe
Wandstärke. Wo dieser Betrag am größten ist, liegt die dickste Stelle des
Bauteils; und die erstarrt zuletzt. Genau dort entstehen Lunker und
Porosität, und bis dorthin muss der Nachdruck über Anguss und Speiser
reichen.

Zwei Wege, das abzulesen:

- **Untermaß −s am Regler** — alles, was dünner als 2·s ist, verschwindet;
  stehen bleiben genau die Kerne, die dicker sind. Der Betrag, bei dem
  der Körper zerfällt, ist die halbe größte Wandstärke.
- **Feldschnitt einschalten** — mit der Skala „innen" sind die roten
  Bereiche die dicken Stellen, die Farbskala nennt die Wandstärke in mm.

Der Erstarrungsmodul V/A ist damit nicht identisch; die Kugelprobe ist
sein üblicher Stellvertreter und für Wände exakt gleich (bei einer Platte
der Dicke t sind beide t/2, bei einem Zylinder mit Ø d ergibt die Kugel
d/2, der Modul d/4).

### Das Feld ansehen

Ein **Feldschnitt** zeigt das Feld selbst als Rasterbild: Achse und
Position wählbar, gefärbt in der **Turbo-Skala** (dunkelblau über Grün
und Gelb nach Rot; `js/part/colors.js`, das Polynom nach Popov) über den
Bereich, den man wählt — **innen** (dann ist es die Wandstärke: an der
Oberfläche blau, dick rot, die Skala nennt das Doppelte des Feldwerts),
**außen** (der Abstand vom Bauteil) oder **beides** (innen rot über Grün
an der Oberfläche nach Blau außen). Was nicht zum Bereich gehört, bleibt
hellgrau, so hebt sich der Querschnitt ab. Die Skala reicht bis zum
**größten Wert, der im Feld vorkommt**, nicht bis zur Bandbreite — ein
Band von 13 mm bei 6 mm dicksten Wänden ließ sonst die halbe Skala
ungenutzt, und alles Dicke sah gleich grün aus (steht der Kern auf −band,
sagt der Titel „≥ Band"). Darüber liegt nur die Höhenlinie der
Bauteilfläche; das gewählte Aufmaß hat im Schnitt nichts zu suchen, er
zeigt das Feld, nicht die Wahl. Im Schnitt steht **nur das Bauteil,
durchscheinend** — die Offsetfläche legte sich sonst über die
Schnittebene. Das Bild wird bewusst ungeglättet dargestellt — man soll
das Raster sehen, aus dem die Fläche entsteht.

### Wärmezentren markieren

„Dickste Stellen markieren" sucht im Feld die Rasterpunkte, deren
Betrag innen keinen größeren Nachbarn hat (`thickMaxima` in
`js/part/field.js`): die Mitten der größten Kugeln, die dort ins Bauteil
passen. Jede wird als **Kugel** mit genau diesem Radius gezeichnet — das
ist die Kugelprobe selbst, ihr Durchmesser die Wandstärke — oder als
**Kreis** gleichen Radius, zur Kamera gedreht und ohne Tiefenprüfung,
damit er auch im deckenden Bauteil zu sehen ist. Der Regler „ab" lässt
nur Stellen ab einem Anteil der größten Wandstärke zu, und eine Stelle,
die in der Kugel einer stärkeren liegt, fällt weg — sonst säumten
Dutzende Punkte jeden Grat. Damit die Marken zu sehen sind, schaltet
„Frei sichtbar" (voreingestellt an) das Bauteil durchscheinend und die
Offsetfläche aus — sonst lagen sie im deckenden Bauteil oder hinter der
Fläche. Die Kennzahlen nennen die Zahl der Stellen, die größte
Wandstärke und den Ort der dicksten.

## Abstandsanalyse (`abstand.html`)

Die Wandstärkenanalyse beantwortet die Frage nach innen. Nach außen steht die
andere, und die braucht **zwei Körper**: wie weit ist die
Bauteiloberfläche vom Temperierkanal entfernt, vom Auswerferstift, vom
Nachbarteil? Zu nah heißt Durchbruchgefahr und eine Stelle, die zu
schnell erstarrt; zu weit heißt, die Kühlung greift dort nicht.

Zwei Dateien (Beispielteil, STL oder GLB), dann für jeden Punkt der einen
Oberfläche der kürzeste Weg zur anderen — und umgekehrt, damit sich beide
einfärben lassen.

- **Exakt, nicht gerastert.** Gerechnet wird der echte
  Punkt-Dreieck-Abstand (`js/part/distance.js`). Ein Würfelraster
  beschleunigt nur die Suche: sie wächst in Schalen um die Zelle des
  Abfragepunktes und hört auf, sobald das bisher Abgesuchte weiter reicht
  als der beste Fund. Zusätzlich fällt jede Zelle weg, die als Ganzes
  schon weiter weg liegt — ohne diese Prüfung dauerte eine Messung das
  Dreifache.
- **Suchgrenze.** Weiter als bis dorthin wird nicht gesucht; alles
  darüber wird als „≥ Grenze" ausgewiesen. Das begrenzt die Rechenzeit
  und ist ehrlicher, als eine Zahl zu nennen, die niemanden interessiert.
- **Farbskala aus den Messwerten.** Nach jeder Rechnung reicht die
  Skala von der kleinsten zur größten gemessenen Entfernung beider
  Seiten — eine Skala 0 bis 20 bei Messwerten von 8 bis 45 zeigte die
  Hälfte des Bildes in einer Farbe. Danach lassen sich Minimum und
  Maximum von Hand einengen: erst „interessant ist der Bereich zwischen
  8 und 20 mm" macht aus der Karte eine Aussage; der Knopf holt die
  Messwerte zurück. Die Grenzen färben nur um; nur die Suchgrenze
  verlangt eine neue Rechnung. Der Verlauf ist die Turbo-Skala wie in
  der Wandstärkenanalyse, nah rot (kritisch), fern blau.
- **Beide Teile** lassen sich einzeln aus- und einblenden, und wahlweise
  wird A, B oder beides eingefärbt; das jeweils andere bleibt einfarbig,
  damit nicht zwei Skalen um dieselbe Aufmerksamkeit konkurrieren.

**Grobe Netze werden vorher verfeinert.** Eine ebene Wand aus zwei
Dreiecken hat vier Eckpunkte; zwischen ihnen würde linear interpoliert
und der wahre Abstandsverlauf ginge verloren — und genau so eine Wand
liegt dem Temperierkanal gegenüber. `refine()` teilt zu große Dreiecke an
den Kantenmitten, die Punkte bleiben exakt auf der Fläche.
`tests/distance.test.mjs` zeigt den Unterschied: eine 200er-Platte 10 mm
über einem Quader meldet ohne Verfeinerung über 50 mm, mit Verfeinerung
die richtigen 10 mm.

## Angussdesigner (`anguss.html`)

Die einzige Seite des Studios, die Geometrie **erzeugt** statt sie zu
messen. Entworfen wird das Angusssystem: vom Pressrest laufen Kanäle mit
Trapezquerschnitt über Verzweigungen zu den Anschnitten.

### Der Graph ist die Quelle, alles andere ist abgeleitet

Gespeichert wird ein Baum aus Knoten (`js/runner/graph.js`) — Lage,
Querschnitt, Arbeitsebene, Verzweigungsverhältnis, Anschnittmaße. Kurve,
Netz, Verluste und Prüfregeln entstehen daraus bei jeder Änderung neu.
Ein Spline mit Stützpunkten UND ein Netz nebeneinander liefen
unweigerlich auseinander, sobald man eine Verzweigung verschiebt.

Der Ablauf ist immer derselbe:

    Graph → Anschnittbreiten → Abtasten → Strömung → Anzeige

Er kostet bei einem üblichen System wenige Millisekunden und läuft
deshalb bei jedem Zug am Griff. Es gibt nichts, was auf Bestätigung
wartet — aber drei Dinge sorgen dafür, dass es sich auch so anfühlt:

- Ein Zug wird **höchstens einmal je Bild** angewandt. Eine Maus meldet
  sich hundert- bis tausendmal je Sekunde; jede Meldung ließ früher die
  ganze Kette laufen, die Meldungen stauten sich, und der Griff hing dem
  Zeiger hinterher. Jetzt zählt der letzte Zeigerort vor dem nächsten
  Bild, und während des Zuges laufen nur Abtasten, Sweep und Griffe —
  Regeln, Kennzahlen und Schema kommen beim Loslassen.
- **Gezeichnet wird auf Abruf** (`renderOnDemand` in `js/scene.js`): nur
  wenn sich Kamera oder Szene geändert haben, sonst viermal je Sekunde
  als Netz. Eine Schleife, die sechzigmal je Sekunde ein durchscheinendes
  Bauteil mit einer Million Dreiecken zeichnet, machte die ganze Seite
  zäh, auch die Felder in der Seitenleiste.
- Die Umkehrung „Maße zu einer Fläche" (`dimsForArea`) kommt aus der
  exakten Trapezfläche samt Eckenabzug in geschlossener Form und macht
  nur noch einen Schritt am Umriss statt fünf — sie lief für jeden
  abgetasteten Schnitt und war der größte Posten der Abtastung.

### Knotenarten

| Farbe | Art | Bedeutung |
|-------|-----|-----------|
| grau | **Pressrest** | Ursprung. Durchmesser, Dicke und Ausstoßrichtung stehen in seinem Auswahlfeld wie bei jedem anderen Punkt auch; die Dicke wächst ENTGEGEN der Richtung, also in dieselbe Formhälfte wie die Kanaltiefe. Ihn zu verschieben zieht das GANZE System mit — er ist der Anker, ihn allein zu versetzen hieße nur die erste Kante zu dehnen. |
| türkis | **Punkt** | Stützpunkt des Laufkanals mit eigenem Querschnitt. |
| gold | **Verzweigung** | Gabelung mit Aufteilung (50:50 …), beide Äste eigenständig; das Häkchen „spiegelsymmetrisch halten" koppelt sie. |
| violett | **Spiegelpunkt** | dasselbe fest auf 50:50, aber nur EIN Ast wird bearbeitet — der andere entsteht. |
| orange | **Anschnitt** | Endpunkt mit Höhe, Tiefe (in Fließrichtung), Breite und der Art des Übergangs. Seine Mündung lässt sich ans Referenzbauteil binden (siehe unten). |

Die **Anschnitthöhe** — die dünnste Stelle des ganzen Systems — steht
einmal unter „Kanalform" als Vorgabe und gilt für jeden Anschnitt, dem
im Auswahlfeld keine eigene Höhe gegeben wurde (`gate.hAuto`); ein
eigener Wert nimmt ihn aus der Vorgabe heraus, der Wert steht dann
kräftig statt blass im Feld. Sie zehnmal einzutippen war Arbeit ohne
Gewinn. Die **Anschnitttiefe** ist die Strecke in Fließrichtung mit
unverändertem Querschnitt (der Steg); sie hieß „Anschnittlänge", und
das ließ sich als Breite lesen.

### Mündung ans Bauteil

Ein Anschnitt zeigt dorthin, wo das Bauteil ist — bei jedem anderen Punkt
folgt die Richtung der Sehne zum Vorgänger, und beim Anschnitt ist genau
das falsch: wer den Punkt davor verschiebt, um das System auszubalancieren,
dreht damit die Mündung mit.

Jeder führende Anschnitt trägt deshalb im Viewport einen **Pfeil** in
seiner Mündungsrichtung — dorthin tritt die Schmelze ins Bauteil. Der
Pfeil ist zugleich der Griff für die Bindung: **den Punkt anklicken
zieht ihn, den Pfeil anklicken schaltet den Zielmodus scharf.** Oben im
Viewport steht dann, was zu tun ist, und unter dem Zeiger wandert eine
Marke über das Bauteil — ein Ring in der Austrittsfläche, ein Strich in
Mündungsrichtung —, die zeigt, wo der Anschnitt landen würde, bevor man
klickt. Der nächste Klick auf das Bauteil legt beides auf einmal fest:

- der Anschnitt **rückt an die getroffene Stelle** — seine Austrittsfläche
  liegt damit auf der Bauteilwand, und
- seine **Richtung wird festgehalten**: senkrecht in die Wand hinein.

Gebunden ist die RICHTUNG, nicht der Punkt: der Anschnitt lässt sich
weiter ziehen, seine Mündung zeigt danach noch dorthin, wohin sie gesetzt
wurde. Das Auswahlfeld sagt es in der Kopfzeile („ans Bauteil gebunden")
und in der Zeile „Mündung" der Kennzahlen; ohne Bindung steht dort
„folgt dem Kanal". Eine andere Stelle bekommt der Anschnitt mit einem
neuen Klick auf den Pfeil — einen Knopf zum Lösen gibt es nicht, weil es
nichts zu lösen gibt, was man nicht durch Neusetzen besser täte. Ohne
geladenes Bauteil sagt der Klick auf den Pfeil, was fehlt.

**Der Ort ist der geklickte Punkt** — auch in der Höhe. Liegt er über
oder unter der Arbeitsebene, wird die Kante davor zur Rampe; so setzt man
die Tiefe eines Anschnitts am Bauteil, nicht am Regler. (Ihn in die Ebene
zu legen lag nahe und war falsch: dann ließ sich die Tiefe gar nicht mehr
setzen.) Nur die **Richtung** wird in die Arbeitsebene gelegt, wenn die
Wand aufrecht steht — Normale höchstens 30° aus der Ebene —, denn die
Entformschräge der Bauteilwand soll den Anschnitt nicht um zwei Grad
kippen. Ein Treffer auf einer Fläche, die in der Ebene liegt (Deckfläche),
bleibt roh; die Prüfliste meldet dann **„Mündung aus der Trennebene"** mit
dem Winkel — so ein Anschnitt ist in einer zweiteiligen Form nicht zu
bauen. Die Kennzahlen sagen es ebenfalls („−Y · gebunden, 90° aus der
Ebene").

Die Normale wird nicht aus dem Wickelsinn der STL gelesen — bei
importierten Netzen ist der unzuverlässig —, sondern so gedreht, dass sie
vom Betrachter weg zeigt: getroffen wurde die sichtbare Seite, also führt
der Blickstrahl an dieser Stelle ins Material. Der Strahl selbst ist
billig (50 ms für eine halbe Million Dreiecke); die Vorschau läuft
höchstens einmal je Bild und setzt bei riesigen Netzen aus, der Klick
nicht.

Ein Klick DANEBEN bricht den Modus nicht ab, sondern wird kurz als
Fehlschuss benannt; Ziehen dreht wie sonst die Ansicht — man muss die
Stelle erst suchen dürfen. Ein zweiter Klick auf den Pfeil schaltet NICHT
ab. Abgebrochen wird mit Esc, mit „Abbrechen" im Hinweis oder durch
Auswahl eines anderen Punktes.

Bei einem gespiegelten Ast wird die Bindung mitgespiegelt: Lage an der
Spiegelebene, Richtung ebenso. Weil eine gebundene Richtung stärker ist
als die Sehne — die Kurve kommt so an, notfalls mit einer Schleife —,
meldet die Prüfliste, wenn die Mündung mehr als 60° gegen die Richtung
steht, aus der der Kanal kommt.

### Arbeitsebene

Jeder Knoten hat eine Ebene, in der er sich verschieben lässt;
voreingestellt ist die des Vorgängers, beim Pressrest die Trennebene.
Zwei Kippungen, und sie tun Unterschiedliches:

- **längs** dreht die Normale um die Laufrichtung — der Kanal legt sich
  auf die Seite, das Profil kippt mit.
- **quer** stellt die Ebene schräg. Wer den Punkt jetzt zieht, hebt ihn
  aus der Trennebene heraus: das ist die Rampe im Verteiler. Für das
  Profil wird die Normale an jedem Schnitt wieder senkrecht zur
  Laufrichtung gestellt.

Gezogen wird mit der Maus IN der Ebene (der Mausstrahl wird mit ihr
geschnitten, nicht mit dem Bildschirm) — mit gedrückter **Alt**-Taste
stattdessen entlang der Normalen.

### Querschnitt

Das Profil ist ein Trapez: an der Trennebene am breitesten, nach unten
von der Entformschräge verjüngt, mit verrundetem Boden. Die obere Kante
bleibt **scharf** — dort stoßen die Formhälften aufeinander, ein Radius
wäre ein Spalt. `js/runner/profile.js` beschreibt dieselbe Form zweimal:
als Umriss mit fester Punktzahl (für den Sweep) und als
Abstandsfunktion; die Tests prüfen sie gegeneinander.

Vor einem Anschnitt zerfällt die Kante in Laufkanal, Übergang und
Anschnitttiefe; welcher Anteil auf den Übergang entfällt, sagt seine Art.
Nimmt er die ganze Länge ein („über die ganze Länge", Fächer), gibt es
keinen Laufkanalabschnitt mehr — dann führt der Übergang unmittelbar vom
Zulaufquerschnitt zum Anschnitt. Vorher begann die Kante in diesem Fall
mit dem Kanalmaß des Anschnittknotens, und am Knoten sprang der
Querschnitt (414 → 374 mm² im Fächerbeispiel).

Zwischen zwei Knoten wird die **Fläche** geführt, nicht Breite und Tiefe
einzeln. Bei einem Fächeranschnitt (26 × 17 → 97 × 2,4) stünde sonst in
der Mitte 35 × 6,8 — und das sind 238 mm² gegenüber 374 am Anfang und
233 am Ende: der Querschnitt wüchse mittendrin, obwohl beide Enden
stimmen.

**Querschnitte abstufen** rechnet von den Anschnitten rückwärts:
A = Q·Anteil / v_Ziel am Anschnitt, das `runnerRatio`-fache davon im
zuführenden Kanal, und weiter stromaufwärts jeweils die Summe der
Abgänge geteilt durch die Verjüngung. Danach nimmt der Querschnitt
garantiert nirgends zu. An einer Verzweigung startet jeder Ast mit
seinem ANTEIL am Zulaufquerschnitt (beide Maße mit der Wurzel des
Anteils skaliert) — ohne das wüchse der Querschnitt an jeder Gabelung
auf das Doppelte.

### Strömung und Füllbalance

`js/runner/flow.js` rechnet über jeden abgetasteten Millimeter:

    Reibung      λ · (ds/d_h) · ρ/2 · v²      λ aus Re (laminar / Blasius)
    Krümmung     ζ₉₀ · dθ/(π/2) · ρ/2 · v²    ζ₉₀ = 0,21/√(R/d_h)
    Querschnitt  Verengung 0,04·(1−A₂/A₁), Erweiterung (1−A₁/A₂)²
    Verzweigung  c · ρ/2 · |v₂·t₂ − v₁·t₁|²   (Borda-Carnot, vektoriell)
    Anschnitt    ζ nach Übergangsart
    dazu         ρ/2 · (v² − v₀²)             die reine Beschleunigung

Eine Füllsimulation ist das nicht und will es nicht sein — es ist die
Rohrhydraulik, die jeder Gießer überschlägt, nur über die wirklich
entworfene Mittellinie statt über eine gedachte Ersatzlänge.

Die eigentliche Aussage ist die **Füllbalance**: die Aufteilungen an den
Verzweigungen sind eine ABSICHT, was wirklich fließt, entscheidet der
Widerstand. Bei gleichem Druck am Pressrest teilt sich der Strom so auf,
dass jeder Weg denselben Druckverlust hat (Widerstände quadratisch,
1/√R addiert sich). Soll und Ist stehen im Flussschema nebeneinander;
weichen sie stark ab, füllt ein Anschnitt vor.

Dazu die **Ankunft der Schmelze**: je Kante die Laufzeit der Front,
Schritt für Schritt Weg durch Geschwindigkeit bei dem Strom, der in
diesem Ast fließt; vom Pressrest aus aufsummiert ergibt das für jeden
Anschnitt, wann die Schmelze dort ist. Das ist die Ankunft bei dem Strom
der Füllphase (Gussvolumen durch Füllzeit), keine Simulation der
Kolbenbewegung — aber genau die Zahl, an der man abliest, welcher
Anschnitt zuerst bedient wird und wie weit die anderen hinterherhinken.
Das Schema schreibt sie an jeden Anschnitt, die Kennzahlen nennen die
Spanne, und ab 15 % der Füllzeit meldet sich die Prüfliste.

### Prüfregeln

`js/runner/rules.js` prüft die Lehrbuchregeln über die WIRKLICHE
Geometrie: Querschnitt nimmt ab, Summe der Abgänge, Anschnitt- und
Kanalgeschwindigkeit, Seitenverhältnis, Krümmungsradius ≥ 2·d_h,
Entformschräge, Füllbalance, Kanal gegen Anschnitt, Materialausbeute,
Mündung gegen die Anströmung, Mündung aus der Trennebene, Ankunft der
Schmelze an den Anschnitten.
Jede Meldung nennt Ort und Zahl — eine Meldung ohne Zahl hilft niemandem.
Alle Beispiele sind ohne Beanstandung; `runner.test.mjs` prüft das.

### Das Netz

`js/runner/sweep.js` zieht das Profil entlang der Mittellinie: je Kante
ein geschlossener Schlauch, exakt so bemaßt wie eingegeben, in
Millisekunden fertig. An den Verzweigungen durchdringen sich die
Schläuche — die Vereinigung entsteht nicht durch Rechnen, sondern durch
Überlappung.

**An den Gabelungen sind die Deckel gerundet.** Ein flacher Deckel endet
mit einer scharfen Kante, und weil der Zulaufkanal genau in der Gabelung
aufhört, klafft zwischen den beiden Abgängen ein Keil — die Stelle, an
der eine Schmelze abreißt und ein Fräser nie hinkommt. Der gerundete
Deckel füllt genau diesen Keil: der Umriss des Profils wird über einen
Viertelkreis auf null zusammengezogen und dabei in Laufrichtung
vorgeschoben. Er hat damit die Form des QUERSCHNITTS, nicht die einer
Kugel — ein flacher breiter Kanal bekommt eine flache breite Kuppe, und
seine Höhe ist das kleinere der beiden Profilmaße.

Gerundet wird nur an Gabelungen. Am Anschnitt bleibt der Deckel eben:
das ist die Austrittsfläche ins Bauteil. Am Pressrest ebenfalls, dort
steckt er ohnehin im Zylinder.

Die **Auflösung der Kuppe** richtet sich am Umriss aus, damit sie nicht
die schwächste Stelle des Netzes ist: dessen Bodenverrundung wird mit
fünf Sehnen über etwa 85° angenähert, also mit rund 0,017 mm
Sehnenfehler. Sechzehn Ringe über den Viertelkreis (5,6° je Schritt)
treffen denselben Wert. Vier Ringe waren es anfangs — 22,5° je Schritt,
0,26 mm Fehler auf einer 13,7 mm hohen Kuppe, deren Umriss damit aus
vier geraden Stücken bestand und genau so aussah.

Bezahlt wird das nicht mit Rechenzeit, sondern mit einer Zeile weniger
Bequemlichkeit: die Dreiecke gehen in ein **vorab bemessenes** Feld statt
in ein wachsendes Array (`triCount` weiß die Zahl vorher). Der Sweep läuft
bei jedem Mausschritt eines Zuges neu, und ein Array, das
340.000-mal wächst und am Ende noch einmal kopiert wird, war dabei die
Hälfte der Zeit: 10,0 → 3,1 ms bei vierfacher Kuppenauflösung, die ganze
Kette von Abtasten bis Sweep 16,9 → 10,7 ms.

### Freies Drehen — in allen Viewern

Seit dem Angussdesigner ist sein Viewport der Maßstab für alle Seiten des
Studios: der Quaternionen-Trackball, das mitgeführte Licht, das
Achsenkreuz unter der Ansichtsleiste, das Zeichnen auf Abruf und KEIN
Bodenraster sind die Voreinstellungen von `initScene` (js/scene.js) — ein
Körper, den man frei von allen Seiten ansieht, hat kein „unten", und das
Raster lag bei jeder schrägen Ansicht im Bild. Der Formaufbau und die drei
Bauteilseiten bekommen das ohne eigenes Zutun; wer die alte
Azimut-Höhenwinkel-Steuerung oder das Raster will, verlangt
`orbit: 'orbit'` bzw. `grid: true`.

Die OrbitControls drehen um eine feste Hochachse. Für ein Bauteil auf
einem Raster ist das richtig, für einen Anguss hinderlich: er liegt in
der Trennebene, die je nach Ausstoßrichtung überall liegen kann, und die
Draufsicht auf sie ist genau der Pol, an dem eine Kugelsteuerung klemmt.
`js/trackball.js` dreht deshalb mit Quaternionen um eine Achse in der
Bildebene — kein Pol, keine Sperre.

Aus demselben Grund wandert **das Licht mit der Kamera** (Option
`headlight` in js/scene.js). Ortsfeste Lichter setzen ein „oben" und eine
bevorzugte Blickrichtung voraus; wer frei um einen freistehenden Körper
dreht, schaut ständig auf die abgewandte Seite, und die lag vorher im
Dunkeln. Das mitgeführte Licht steht leicht über und neben der Kamera,
damit es nicht flach wird; die ortsfesten tragen nur noch die Grundform.
Dazu haben die Materialien fast keinen Metallanteil mehr — ohne
Umgebungskarte hat ein metallisches Material nichts zu spiegeln, es wird
nur dunkel, wo kein Licht hinfällt.

Das Anklicken eines Punktes lässt die Kamera dabei in Ruhe. Den Drehpunkt
auf die Auswahl zu setzen lag nahe, war beim Benutzen aber lästig: jeder
Klick rückte das Bild. Ein Bodenraster gibt es auch nicht — der Anguss ist
ein freistehender Körper, den man von allen Seiten ansieht, auch von unten.

### Wo was steht

Der gewählte Punkt wird VOLLSTÄNDIG im Viewport bearbeitet: Kopfzeile mit
Artfarbe und id, Lage, Kanalmaße, Kippung der Arbeitsebene, die
Anschnittfelder, die Kennzahlen und die Knöpfe zum Anfügen — alles in dem
einen Feld oben links. Vorher lag die Hälfte davon in der Seitenleiste, und
der Blick sprang beim Bearbeiten eines Punktes zwischen zwei Orten hin und
her.

Auch der **Pressrest** ist so ein Punkt: sein Durchmesser, seine Dicke und
die Ausstoßrichtung erscheinen im Auswahlfeld, sobald man ihn anklickt.
Eine Arbeitsebene zum Kippen bekommt er nicht — seine Ebene IST die
Ausstoßrichtung.

Die Seitenleiste behält, was für das GANZE System gilt, von oben nach
unten in der Reihenfolge, in der man es braucht: Beispiel und Dateien,
Referenzbauteil (es liefert das Gussvolumen, also gleich nach oben),
Kanalform, Prozess, Darstellung, Import und Export — und ganz unten die
Prüfliste, die das Ergebnis von allem beurteilt. Die Hinweiskästen sind
absichtlich kurz gehalten: ein Erklärkasten von sechs Zeilen schiebt den
nächsten Regler aus dem Bild und wird beim zweiten Mal ohnehin nicht mehr
gelesen.

Das **Flussschema** öffnet der große Knopf rechts unten im Viewport und
füllt dann den ganzen Viewport — ein Kasten in der Ecke zeigte ein System
mit sechs Anschnitten als Briefmarke; jetzt wächst das SVG mit der Fläche,
Schrift eingeschlossen. Esc oder das × schließen es. Die Bänder sind
geschwungen (kubische Bögen mit waagerechten Tangenten an den Knoten):
jeder Ast verlässt seine Gabelung sanft, wie die Schmelze es tut, und die
Bänder liegen an den Knoten bündig übereinander. Die **Kennzahlen**
des Systems stehen dort als Streifen unter dem Kopf: Punkte, Anschnitte,
Lauflänge, Angussvolumen, Volumenstrom, Druckbedarf, Ankunft der Schmelze
(erster bis letzter Anschnitt). Dort steht nur, was das Schema nicht
ohnehin zeigt —
Anschnittfläche, Geschwindigkeit und die Aufteilung soll/ist hängen im Bild
an den Ästen selbst. Sie daneben noch einmal als Summe zu setzen hieße
dieselbe Sache zweimal zu sagen und dabei die interessante Hälfte
wegzulassen: welcher Ast?

Der Pressrest ist deckend wie die Kanäle — durchscheinend sah er aus wie
etwas, das noch nicht entschieden ist. Das Achsenkreuz oben rechts hat
keinen Kasten: es ist eine Marke im Bild, kein Bedienfeld.

Aus demselben Grund ist der Körper im Viewport einfarbig. Es gab
Einfärbungen nach Geschwindigkeit und nach Querschnitt; beide sagen
dasselbe (v = Q/A) und beide sagen es ungenauer als das Schema, das
neben jeden Ast die Zahl schreibt. Ein Farbton, den man an einer Skala
ablesen muss, ist kein Ersatz für „207 mm² · 22,5 m/s".

Unten rechts stehen übereinander der Knopf zum Flussschema und die
Legende der Punktarten; die Bedienhinweise unten links sind eine Zeile,
keine vier — sie sind Erinnerung, kein Handbuch.

Oben rechts, unter der Ansichtsleiste, steht das **Achsenkreuz**. Es ist
kein zweiter Renderdurchgang, sondern SVG über dem Bild: die
Bildschirmrichtung einer Weltachse ist ihr Skalarprodukt mit den ersten
beiden Spalten der Kameramatrix, die Tiefe das mit der dritten (daraus die
Deckkraft — was nach hinten zeigt, wird blasser). Angehängt ist es an
`scene.onBeforeRender`, das Three.js vor jedem Bild mit der gerade
benutzten Kamera ruft; damit stimmt es auch in der Parallelprojektion.

Die **Griffe sind immer zu sehen**, auch hinter dem Körper: jeder wird
zweimal gezeichnet, einmal mit Tiefenprüfung und voll deckend, davor
einmal ohne und blass. Wo der Punkt frei liegt, deckt die volle Kugel die
blasse exakt ab; wo er hinter dem Anguss steckt, bleibt die blasse übrig —
man sieht alle Punkte und trotzdem, welcher vorn liegt. Angeklickt werden
konnten sie ohnehin schon durch den Körper hindurch: der Strahl trifft nur
die Griffe, nicht das Netz.

### Dateien

- **JSON** — der Graph selbst, mit Kennung und Fassungsnummer. Nur damit
  lässt sich weiterarbeiten. Laden und Speichern über die beiden Knöpfe
  unter „Import und Export" oder per Ziehen-und-Ablegen über dem
  Viewport; was für eine Datei es ist, entscheidet der Inhalt, nicht die
  Endung.
- **STL** — was im Viewport steht: je Kanal ein geschlossener Schlauch,
  dazu der Pressrest, wenn er eingeblendet ist. An den Gabelungen
  durchdringen sich die Schläuche — das ist ein Satz sauberer Körper,
  kein einzelner verschmolzener. Zum Anschauen, Messen und Drucken
  genügt das; im CAD vereinigt man sie mit einem Klick.
- **Referenzbauteil (STL/GLB)** — wird durchscheinend dazugestellt, damit
  die Anschnitte dorthin zeigen, wo sie hingehören. Sein **Volumen wird
  als Gussvolumen übernommen**: das ist die Zahl, aus der über die
  Füllzeit der Volumenstrom folgt und daraus die Anschnittflächen und
  damit jeder Querschnitt. Sie von Hand einzutippen, während das Bauteil
  daneben liegt, ist eine Fehlerquelle ohne Gewinn. Überläufe sind darin
  nicht enthalten — wer sie mitrechnen will, schlägt sie im Feld auf. Ist
  das Netz offen oder überlappend und das Volumen damit unbrauchbar,
  bleibt die Einstellung stehen und die Seite sagt, warum. Die geladene
  Datei steht mit Namen und Volumen in einer Zeile, mit einem × zum
  Wegnehmen — die Zahl der Dreiecke interessiert hier niemanden, das ist
  die Frage der Entformungsanalyse. Es ist außerdem das Ziel für die
  **Mündung ans Bauteil** (siehe oben): ohne geladenes Bauteil ist der
  Knopf gesperrt.


## Überlaufdesigner (`ueberlauf.html`)

Die zweite Seite, die Geometrie **erzeugt**: Überläufe und Entlüftungen
am Bauteil. Eine Druckgießform füllt sich in Millisekunden, und die Luft
der Kavität muss in derselben Zeit hinaus — dort, wo die Schmelze
zuletzt ankommt, sitzen Überlaufbohnen: Taschen, über einen dünnen Steg
mit dem Bauteil verbunden. Sie nehmen die erste, kalte und oxidhaltige
Front auf; die Entlüftung dahinter führt die Luft zum Formrand oder ins
Waschbrett (Chill-Vent), in dessen Wellen die Schmelze erstarrt, bevor
sie hinaus kann.

### Setzen, ziehen, drehen, neu setzen

Das Bauteil (Beispielteil oder eigene STL/GLB, dieselbe Quelle wie in der
Entformungsanalyse) steht deckend im Viewport — hier wird auf die Wand
geklickt, und die soll aussehen wie eine Wand; der Regler „Deckkraft"
macht sie durchscheinend. **Eine Art wählen und auf das Bauteil
klicken:** dort sitzt das Element. Ort ist der getroffene Punkt, die nach
außen gerichtete Flächennormale seine Hochachse — der Pfeil im Viewport
zeigt sie. Das Element selbst **liegt in der Wandebene**: Steg, Bohne und
Kanal haben ihre offene Seite an der Wandfläche und wachsen von dort in
die Tiefe, ihre Länge weist in der Ebene. (Entlang der Normalen von der
Wand abstehen wäre ein Turm, kein Überlauf — die Bohne liegt in der
Trennebene, und die ist hier die Wand.) Eine Trennebene braucht das
Werkzeug deshalb nicht. Wohin die Länge in der Ebene weist, kommt von der
Weltachse, die am wenigsten mit der Normalen zusammenfällt, in die Ebene
gelegt (so kippt nichts um, und Nachbarn auf derselben Wand liegen
gleich), und lässt sich mit der **Drehung** im Auswahlfeld um die
Normale schwenken — das ist das Drehen um den Punkt. Der Zielmodus ist
derselbe wie beim Angussdesigner: Hinweis oben im Viewport, Marke unter
dem Zeiger, Fehlklick benannt, Esc bricht ab. Danach:

- **den Punkt ziehen** verschiebt in der Tangentialebene der Wand — der
  Punkt rutscht auf ihr entlang; mit Alt von ihr weg;
- **den Pfeil anklicken** setzt das Element an eine andere Stelle des
  Bauteils, samt neuer Achse — die Drehung bleibt;
- jedes **Maß** der Art steht im Auswahlfeld; die Art lässt sich
  wechseln, Maße, die beide Arten haben, bleiben dabei.

Vier Arten: **Überlaufbohne** (Steg und Tasche), **Überlauf mit
Entlüftung** (dazu ein flacher Kanal, der ab dem Ende der Bohne
gezogen wird — siehe unten), **Waschbrett** (Steg, dann ein kurzer,
dickerer **Sammelkanal**, in dem sich die Front beruhigt, bevor sie in
den Zickzack-Kanal läuft, dessen Spalt senkrecht zur Welle überall
gleich misst) und **Entlüftungsschlitz** (nur der flache Kanal).

Die **Vorgaben** der Maße passen zu den Beispielteilen — Aluminiumteile
der 1200-bis-1600-t-Klasse mit 4 mm Wand: Bohnen 28 mm breit, 40 mm
lang, 10 mm tief, an einem 20 mm breiten und 1,2 mm dicken Steg;
Entlüftungskanäle 25 mm breit; das Waschbrett 80 mm breit. Nur die
**Kanalhöhe** (0,15 mm) hängt nicht am Teil, sondern an der Legierung:
so dünn, dass Aluminium darin erstarrt, bevor es hinaus kann. Für
kleinere Teile werden die Maße im Auswahlfeld kleiner gesetzt.

### Der Entlüftungskanal

Der Überlauf mit Entlüftung trägt eine **zweite Kugel am Ende der
Bohne**. Von dort aus wird der Kanal gezogen: hinter der Kugel sitzt je
Kanalpunkt eine weitere, hellere Kugel, und die rechteckigen Kanalstücke
laufen von Punkt zu Punkt — mit Gehrung an den Knicken, immer in der
Breite und Höhe, die im Auswahlfeld stehen. **+ Punkt** hängt einen
Punkt an (in der Richtung des letzten Stücks weiter), **− Punkt** oder
Entf nimmt den gewählten wieder weg; der letzte bleibt, sonst hätte der
Kanal kein Ende. Die Kugel am Bohnenende sitzt fest: sie gehört zur
Bohne und wandert mit ihr.

Die Punkte **bleiben in der Wandebene** des Elements — der Ebene durch
den Ort des Überlaufs, senkrecht zu seiner Achse. Sie sind in den
Koordinaten dieser Ebene gespeichert (längs und quer, gemessen vom
Bohnenende), nicht als Weltpunkte: was man zieht oder ins Lagefeld
tippt, wird in die Ebene gelotet, und wer die Bohne dreht oder versetzt,
nimmt den ganzen Kanal mit. Ein Kanal, der die Ebene verließe, wäre kein
Entlüftungskanal in der Trennebene mehr, sondern ein Schlitz in die Form
hinein. Damit der Kanal die Bohne nicht nur in einem Punkt berührt — am
Scheitel des runden Endes wäre das so —, beginnt er so weit in ihr, dass
das runde Ende seine ganze Breite trifft; dieses Stück zählt beim
Volumen nicht mit.

### Die Bohne

Die Tasche ist ein **D**: flach zum Steg hin, rund am fernen Ende. An
einer rundum runden Bohne berührte der Steg sie nur in einer Linie — da
käme keine Schmelze hinein; an der flachen Seite sitzt er mit ganzer
Stirnfläche, und die flache Seite ist immer mindestens so breit wie er.
Die Wände haben **Entformschräge**, der Boden einen **Radius** (beide
Maße am Element, Vorgabe 5° und 2,5 mm): die Bohne entsteht als Loft aus
demselben Umriss, Ring für Ring nach innen versetzt, unten über einen
Viertelkreis in den Boden. Weil die Wand mit der Schräge zurückweicht,
reicht der Steg ein Stück in die Bohne hinein — ein Steg, der genau an
der Oberkante endete, hinge darunter in der Luft; das Stück wird beim
Volumen wieder herausgerechnet — ebenso das Stück Steg und Band, das in
den Sammelkanal des Waschbretts ragt. Alle Körper sind geschlossen
(Deckel per Ohrenabschneiden, damit auch das nicht konvexe Zickzack-Band
dicht ist); Steg, Kanal und Bohne liegen mit ihrer offenen Seite an der
Wandfläche und wachsen von dort in die Tiefe.

### Zahlen und Dateien

Die Seitenleiste nennt, worum es geht: Elemente, das **Volumen des
Bauteils**, das der **Überläufe** und die **Summe** — das ist das
Gussvolumen, das der Angussdesigner unter „Prozess" braucht. Eine
Prüfliste gibt es hier nicht; das Auswahlfeld nennt Volumen, Steg- und
Kanalquerschnitt und die Achse des Elements.

- **JSON** — der Plan: je Element Art, Ort, Achse, Drehung, Maße, beim
  Überlauf mit Entlüftung dazu die Kanalpunkte in der Wandebene
  (`dielogic-luft`, Fassung 3; eine Datei der Fassung 2 mit bloßer
  Kanallänge wird zu einem Punkt in Längsrichtung).
- **STL** — die Körper aller Elemente.

Die Griffe (`js/handles.js`) sind dieselben wie im Angussdesigner: was
ein Griff ist, sagt jede Seite selbst (Ort, Farbe, Richtung, Ebene), wie
er gezeichnet, gezogen und gezielt wird, steht einmal.

## Temperierkanal-Designer (`temperier.html`)

Die dritte Seite, die Geometrie erzeugt: Kühlstiche und Kanäle um das
Bauteil. Was bei der Temperierung zählt, ist der Abstand zur Kavität — zu
nah heißt Durchbruchgefahr und Risse, zu weit heißt, die Kühlung greift
nicht. Deshalb werden die Elemente auf der **Abstandsfläche** gesetzt:
der Fläche gleichen Abstands (voreingestellt 20 mm), die aus demselben
Rasterfeld kommt wie die Wandstärkenanalyse (`js/part/field.js`,
`js/part/surfacenets.js`) und beim Laden des Bauteils gerechnet wird;
der Regler „Abstand" leitet sie neu ab, nur ein Abstand jenseits des
Bandes kostet ein neues Feld. Sie liegt durchscheinend um das Bauteil und
ist das Ziel des Zielmodus; das Häkchen „Durchscheinend" macht sie
deckend — dann zeigt sie ihre Form, wo sie eng wird und wo sie Rippen
nachzeichnet, und die Stiche und Kanäle davor, ohne dass das Bauteil
durchscheint. „Abstandsfläche zeigen" blendet sie ganz aus.

### Kühlstiche und Kanäle

- **Kühlstich** — ein Klick auf die Abstandsfläche. Die Spitze sitzt am
  Punkt (dort hat sie genau den Abstand der Fläche), der Stich läuft um
  seine **Länge** vom Bauteil weg, mit seinem **Durchmesser**; die
  Spitze ist eine Halbkugel wie das Ende eines Bohrers. Die **Richtung**
  wählt man vorher: die Flächennormale (senkrecht zur Abstandsfläche,
  nach außen), der Blick (auf die Kamera zu — so, wie man gerade schaut)
  oder X, Y, Z, jeweils mit dem Vorzeichen, das vom Bauteil weg zeigt.
  Der Pfeil am Stich setzt ihn an eine andere Stelle.
- **Kanal** — zwei Klicks, ein Ende hier, das andere dort; ein gerader
  Zylinder mit ebenen Enden und seinem Durchmesser.

Danach werden die Enden **frei im Raum** bewegt. Eine Arbeitsebene gibt
es hier nicht, deshalb trägt das gewählte Ende drei **Achsenpfeile**
(X rot, Y grün, Z blau; `js/handles.js`): am Pfeil gezogen, bewegt sich
der Punkt genau entlang dieser Achse — der Mausstrahl wird dafür auf die
Achse gelotet (nächster Punkt zweier Geraden). Am Punkt selbst gezogen,
rutscht er in der Bildebene durch die Kamera. „Beide Enden bewegen"
nimmt beim Kanal das andere Ende mit demselben Versatz mit: der Kanal
behält Länge und Richtung.

### Automatisch setzen

„Kühlstiche automatisch setzen" (`js/cooling/auto.js`) löst eine
Überdeckungsaufgabe: wo müssen N Bohrungen auf der Abstandsfläche
sitzen, damit jede Stelle im Bauteil eine Bohrung in der Nähe hat — und
dicke Stellen eher als dünne, denn dort steckt die Wärme. Die Zellen des
Bauteils sind die Masse, jede mit ihrer halben Wandstärke |v| aus dem
Feld als Gewicht; die Kandidaten sind Punkte der Abstandsfläche. Gesucht
sind N Kandidaten, die die gewichtete Summe der Abstandsquadrate jeder
Zelle zu ihrer nächsten Bohrung klein machen — das Abstandsfeld, das die
Bohrungen im Bauteil erzeugen, soll überall gleichmäßig klein sein.

Zwei Schritte, beides Lehrbuch: ein **gieriger Start** (k-center — die
Zelle mit dem größten gewichteten Abstand zur nächsten gesetzten Bohrung
bestimmt die nächste, so bekommt jede Ecke zuerst eine, bevor irgendwo
eine zweite steht) und ein **Verfeinern** wie k-means auf der Fläche
(jede Zelle gehört zur nächsten Bohrung, jede Bohrung rückt an den
Kandidaten, der dem gewichteten Schwerpunkt ihrer Zellen am nächsten
liegt, bis nichts mehr wandert). Kandidaten näher als der
**Mindestabstand** an einer gesetzten Bohrung scheiden aus. Die Richtung
folgt der Wahl unter „Kühlstiche"; bei „Normale" ist es der Feldgradient
an der Stelle. Die Kennzahlen nennen den gewichteten mittleren und den
größten Abstand einer Bauteilzelle zur nächsten Bohrung. Automatisch
gesetzte Stiche sind als solche markiert; der nächste Lauf ersetzt sie
(abschaltbar), von Hand gesetzte bleiben.

### Zahlen und Dateien

Das Auswahlfeld nennt Länge, Volumen und den **Wandabstand**: den
kleinsten Abstand der Bohrungswand zur Kavität, aus dem Feld entlang der
Achse abgetastet, minus Radius — liegt er unter dem gewählten Abstand,
steht ein ⚠ davor. Die Übersicht zählt Stiche und Kanäle, die
Gesamtlänge und den kleinsten Wandabstand. Dateien: **JSON** ist der Plan
(`dielogic-temperier`, Fassung 1, mit dem Abstand), **STL** sind die
Bohrungen als Körper.

## Füllabschätzung (`fuellung.html`)

Die vierte Frage an das Bauteil: **in welcher Reihenfolge füllt es sich?**
Eine Füllsimulation braucht ein Volumennetz und Minuten; diese Seite
braucht eine Sekunde und beantwortet den Teil der Frage, der von der
Geometrie abhängt — wo die Front zuerst hinkommt, wo zuletzt, und wie
sich mehrere Anschnitte das Volumen teilen. Trägheit, Strahlbildung,
Gegendruck der Luft und Erstarrung während der Füllung sind nicht drin;
das steht auch auf der Seite.

### Raster und Anschnitte

Beim Laden wird das Bauteil gerastert — dasselbe Abstandsfeld wie in der
Wandstärkenanalyse (`js/part/field.js`), mit schmalem Band nach außen
und vollständigem Kern nach innen. Wie fein, sagt die **Kantenlänge**
der Zellen in Millimetern — nicht eine Zellenzahl: der Anwender kennt
die Wanddicke seines Teils, und die muss das Raster auflösen, mit
mindestens zwei Zellen über die Dicke. Beim Laden wird deshalb die halbe
Wanddicke 2 V/A des Bauteils vorgeschlagen; eine eigene Kante gilt, bis
man sie ändert, „Neu rastern" übernimmt sie. Nach unten ist nur der
Speicher die Grenze (16 Mio. Rasterpunkte; darüber hebt die Seite die
Kante an und sagt es). Das Raster liegt eng um das Bauteil, zwei Zellen
Rand — die Wandstärkenanalyse braucht außen ein breites Band für die
Offsetfläche, hier zählt nur das Innere, und bei einem flachen Teil
wäre ein breiter Rand mehr Luft als Metall.

**Anschnitte** sind Rechtecke auf der Wand (`js/fill/model.js`): Klick auf
„Anschnitt setzen", dann auf das Bauteil — Ort ist der getroffene Punkt,
die Hochachse die nach außen gerichtete Flächennormale, das Rechteck
liegt in der Wandebene mit **Breite** quer und **Höhe** längs, gedreht um
die Normale. Ziehen am Punkt verschiebt in der Wandebene, der Pfeil setzt
neu — dieselben Griffe wie im Anguss- und Überlaufdesigner
(`js/handles.js`). Jeder Anschnitt hat einen **Anteil** am Schmelzestrom:
ohne Angabe nach seiner Fläche, sonst die eingetragene Zahl (der Rest
verteilt sich nach Fläche auf die übrigen).

### Die Rechnung

`js/fill/solve.js` lässt die Front von den Startzellen der Anschnitte
(den Innenzellen unter dem Rechteck) durch die Innenzellen laufen: ein
Dijkstra über die 26er-Nachbarschaft mit euklidischen Kantenlängen. Zwei
Dinge machen daraus mehr als eine Geodäte:

- **Dünnwand-Bremse α.** In einer Zelle läuft die Front mit
  (Dicke / Bezugsdicke)^α; „Dicke" ist der doppelte Wandabstand aus dem
  Feld, Bezug der Mittelwert darüber. α = 0 ist reine Geometrie; 0,5
  (voreingestellt) ist, was man in Füllbildern sieht — die Schmelze nimmt
  erst die dicken Wege und holt dünne Rippen später nach; 1 bremst stark.
- **Anteile.** Die Front aus einem Anschnitt läuft mit seinem Anteil,
  bezogen auf den Mittelwert, schneller oder langsamer. Wer eine Zelle
  zuerst erreicht, füllt sie — die Quelle wandert im Dijkstra mit.

Aus den Ankunftszeiten wird der **Füllgrad**: nach Ankunft sortiert ist
jede Zelle bei dem Anteil des Volumens voll, der vor ihr kam. Das ist die
Zahl, die man abliest („diese Ecke füllt bei 92 %") — eine Reihenfolge,
keine Zeit. Die Rechnung kennt keine, und eine Füllzeit, die den
Füllgrad in Millisekunden umrechnete, änderte an der Reihenfolge nichts;
darum steht keine dran. Dazu der **Fließweg** (die Weglänge der Front bis zur
entferntesten Zelle) und **Fließweg / Wanddicke** mit der Wanddicke
2 V/A des Bauteils; über etwa 300 : 1 steht ein ⚠. Je Anschnitt steht,
welchen Anteil des Volumens er tatsächlich füllt — die Naht zwischen zwei
Anschnitten liegt dort, wo beide Fronten zugleich ankommen. Nach dem
ersten Anschnitt rechnet jede Änderung am Plan von selbst nach.

### Drei Ansichten

- **Füllgrad** — das Bauteil nach Füllgrad gefärbt (Turbo: früh blau,
  spät rot; der Wert an der Oberfläche kommt aus den Innenzellen daneben).
  Was über dem Regler **Füllgrad** liegt, bleibt grau: so wandert die
  Front mit dem Regler über die Oberfläche.
- **Füllkörper** — die Schmelze beim eingestellten Füllgrad als Fläche
  aus dem Raster gezogen (`js/part/surfacenets.js` auf dem Feld
  max(Abstand, (Füllgrad − q)·Band)), das Bauteil durchscheinend. Der
  Körper lässt sich als STL speichern.
- **Zuletzt gefüllte Stellen** — die Innenzellen, deren Füllgrad keinen
  größeren Nachbarn hat, als rote Kugeln (Anzahl einstellbar). Dort
  sammelt sich die Luft; dort gehören die Überläufe hin, die der
  Überlaufdesigner setzt.

Dateien: **JSON** ist der Plan (`dielogic-fuellung`, Fassung 1: Anschnitte
mit Ort, Normale, Drehung, Maßen und Anteil, dazu α).

## Struktur

```
index.html            Übersicht (Karten der Werkzeuge)
form.html             Viewer 1: Formaufbau
entformungsanalyse.html   Viewer 2: Entformungsanalyse
wandstaerke.html      Viewer 3: Wandstärkenanalyse
abstand.html          Viewer 4: Abstandsanalyse
anguss.html           Viewer 5: Angussdesigner
ueberlauf.html        Viewer 6: Überlaufdesigner (Überläufe und Entlüftungen)
temperier.html        Viewer 7: Temperierkanal-Designer (Kühlstiche und Kanäle)
fuellung.html         Viewer 8: Füllabschätzung (Frontausbreitung von Anschnitten)
css/site.css          Übersichtsseite und Karten
css/viewer.css        Seitenleiste und Viewport aller Viewer
assets/die.glb        DAS Formmodell — binäres glTF, vom Viewer geladen
assets/parts/*.glb    die Beispielteile — ebenfalls fertiges glTF

js/solids.js          Primitive als Dreieckssuppen (Quader, Loft, Zylinder, Kugel, Rohr)
js/csg.js             boolesche Operationen (BSP), ohne Three.js
js/mesh.js            Netz-Werkzeuge: verschweißen, Nachbarschaft, T-Stöße, Normalen, Verfeinern
js/config.js          alle Maße der Beispielform (mm) an einer Stelle
js/registry.js        Baugruppen-Metadaten (id, Label, Seite, Farbe)
js/diegeom.js         Geometrie der Form inkl. aller Negative — die Quelle des Modells
js/components.js      Three.js-Adapter: Suppen → benannte Gruppen mit Materialien
js/scene.js           Renderer, Kameras (Zentral + Parallel), Licht, Ansichten, Zeichnen auf Abruf, Achsenkreuz
js/trackball.js       Quaternionen-Trackball: freies Drehen um einen Punkt
js/handles.js         Griffe im Viewport: auswählen, in der Ebene ziehen, Pfeile, Zielmodus aufs Bauteil
js/ui/axes.js         das Achsenkreuz (SVG über dem Bild)
js/vents/model.js     der Überlaufplan: Arten, Maße, Dreibein, Datei, Prüfregeln
js/vents/geom.js      Prismen aus dem Plan: Steg, Bohne, Kanal, Waschbrett
js/vents/app.js       Einstieg Überlaufdesigner
js/cooling/model.js   der Temperierplan: Kühlstiche, Kanäle, Richtungen, Datei
js/cooling/geom.js    Rotationskörper: Stich mit Halbkugelspitze, Kanal; Wandabstand aus dem Feld
js/cooling/auto.js    Kühlstiche automatisch: gewichtete Überdeckung des Bauteils (k-center + k-means)
js/cooling/app.js     Einstieg Temperierkanal-Designer
js/fill/model.js      der Füllplan: rechteckige Anschnitte, Dreibein, Anteile, Datei
js/fill/solve.js      Frontausbreitung (Dijkstra, Dünnwand-Bremse, Anteile), Füllgrad, Füllkörper, letzte Stellen
js/fill/geom.js       Anschnitte als flache Quader für die Anzeige
js/fill/app.js        Einstieg Füllabschätzung
js/clipcaps.js        Schnittebene mit geschlossenen Schnittflächen (Stencil)
js/die.js             Einstieg Formaufbau-Viewer
js/ui/nav.js          Kopfleiste — hält sich heraus, sobald /shared/nav.js da ist
js/ui/sidebar.js      Baugruppen-Schalter und Regler des Formaufbaus
js/ui/viewbar.js      Ansichtsleiste (X/Y/Z/Iso mit Vorzeichen, Projektion)
js/ui/controls.js     Regler, Schalter, Zahleneingabe, Kennzahlen, Farbskala
js/part/model.js      Arbeitsmodell der Analyse (aufräumen, Topologie)
js/part/visibility.js Sichtbarkeit in den sechs Hauptrichtungen
js/part/segment.js    Saat → Inseln → Ausbreiten, Trennlinie
js/part/draft.js      Entformschrägen und Kennzahlen
js/part/field.js      Abstandsfeld durch Rasterisierung (zwei Durchgänge)
js/part/surfacenets.js Fläche gleichen Abstands aus dem Feld
js/part/distance.js   exakter Abstand zwischen zwei Netzen (Rastersuche in Schalen)
js/part/partsource.js Abschnitt „Bauteil" — Beispielteile, STL/GLB, Kennzahlen
js/part/demoparts.js  Beispielteile: Beschreibung + Laden der GLB
js/part/demogeom.js   QUELLE der Beispielteile (prozedural; nur für den Export)
js/part/glbio.js      GLB lesen ohne Three.js (Beispielteile und Uploads)
js/part/stlio.js      STL lesen und schreiben
js/part/colors.js     Farben der Analyse (aus der DieLogic-Palette)
js/part/app.js        Einstieg Entformungsanalyse
js/part/offsetapp.js  Einstieg Wandstärkenanalyse
js/part/distanceapp.js Einstieg Abstandsanalyse-Viewer
js/runner/vec.js      kleine Vektorrechnung (ohne Three.js, unter Node lauffähig)
js/runner/graph.js    DAS Datenmodell: Knoten, Arbeitsebenen, Spiegelung, JSON
js/runner/presets.js  Beispielsysteme (durch die Auslegung gelaufen)
js/runner/profile.js  Trapezquerschnitt — als Umriss UND als Abstandsfunktion
js/runner/curve.js    Hermite-Bögen, Abtastung nach Bogenlänge, Querschnitts-Fahrplan
js/runner/sweep.js    Netz: Profil entlang der Mittellinie, gerundete Deckel, Pressrest
js/runner/flow.js     Bernoulli-Verluste und Füllbalance
js/runner/sizing.js   Querschnitte von den Anschnitten rückwärts abstufen
js/runner/rules.js    gießtechnische Prüfregeln
js/runner/chart.js    Flussschema als SVG
js/runner/editor.js   Griffe im Viewport: auswählen, in der Ebene ziehen
js/runner/app.js      Einstieg Angussdesigner
vendor/three/         three.module.js 0.160, OrbitControls, GLTFLoader/-Exporter, LICENSE (MIT)
vendor/utils/         BufferGeometryUtils, TextureUtils (von den Loadern gebraucht)
```

Außerhalb von `web/`, weil nicht ausgeliefert:

```
scripts/3d-studio/    Generatoren der Modelle (build-glb, build-parts)
tests/web/3d-studio/  Tests, laufen mit den übrigen Frontend-Tests
```


Der Formaufbau-Viewer kennt die Geometrie **nur über die GLB**: die
Zuordnung läuft über Gruppennamen (= Registry-id, z. B. `movingRoot`,
`coolFix`) und `userData.compId` (glTF-extras); Materialnamen (`steel`,
`castPart`, …) steuern Stahl-Transparenz und die Farben der
Schnittflächen. Eine extern erzeugte GLB (CAD-Export) funktioniert,
solange sie diese Namen trägt.

## Modelle neu erzeugen

Alle Modelle liegen als fertiges binäres glTF unter `assets/` — die
Viewer rechnen beim Laden keine Geometrie mehr. Nach Änderungen an der
jeweiligen Quelle, aus dem Repo-Root:

```
(in openscad_parts) ./render_die.sh --studio      # assets/die.glb ← dies/oil_pan_die.scad
node scripts/3d-studio/build-die-stl.mjs <manifest> # dasselbe von Hand, aus den STL-Stücken
node scripts/3d-studio/build-glb.mjs <ziel.glb>    # die ältere prozedurale Form aus js/diegeom.js
node scripts/3d-studio/build-parts.mjs             # assets/parts/*.glb ← js/part/demogeom.js
```

Die Ölwannen-Form kommt als Satz von STL-Stücken aus `openscad_parts`
(`dies/oil_pan_die.json` nennt je Stück Baugruppe und Material);
`build-die-stl.mjs` setzt sie über denselben Adapter zusammen wie das
prozedurale Modell (`js/components.js`), damit Namen, Normalen und
Materialien identisch sind. `js/diegeom.js` und `js/config.js` beschreiben
weiterhin die ältere prozedurale Beispielform; `CFG.openTravel` gilt
für beide.

Die vier Druckgussteile (Getriebedeckel, Ölwanne, Kühlkörper, U-Profil)
kommen nicht aus `demogeom.js`, sondern aus dem Schwesterprojekt
`openscad_parts` (parametrische OpenSCAD-Quellen): dort `./render.sh`,
dann `build/glb/*.glb` nach `assets/parts/` kopieren. `build-parts.mjs`
überspringt sie (Feld `source` in `demoparts.js`). Gussteil und
Temperierkreise der Beispielform entstehen weiterhin prozedural.

Die prozeduralen Beispielteile werden dabei schon aufgeräumt (entartete Dreiecke weg,
T-Stöße zu) und indiziert, ohne Normalen — die rechnet der Viewer neu,
und die Analyse arbeitet allein mit den Punkten. Vorher entstanden sie
bei jedem Seitenaufruf neu; das kostete pro Teil bis zu einer halben
Sekunde und zog `js/csg.js`, `js/solids.js` und `js/diegeom.js` in
Seiten, die damit nichts zu tun haben.

Beides läuft ohne Browser: `scripts/3d-studio/three-resolver.mjs` löst
den nackten Import `three` auf `vendor/` auf, und `glb-node.mjs` ergänzt
den FileReader, den der GLTFExporter erwartet.

## Tests

Aus dem Repo-Root, zusammen mit den übrigen Frontend-Tests:

```
node --import ./tests/web/3d-studio/stubs/register.mjs \
     --test tests/web/*.test.mjs tests/web/3d-studio/*.test.mjs
```

Der `--import`-Hook löst nur `three` und den GLTFLoader auf und ersetzt
den WebGL-Renderer durch eine Attrappe; die übrigen Tests merken davon
nichts. Die Dateien liegen unter `tests/web/3d-studio/`:

| Datei | prüft |
|-------|-------|
| `geometry.test.mjs` | Primitive (Volumen, Orientierung, Aufdicken), CSG, Verschweißen, T-Stöße, weiche Normalen |
| `part.test.mjs` | Sichtbarkeit und Teilung an Körpern mit bekannter Antwort (Würfel, gedrafteter Quader, Pilzkopf, Querbohrung), Entformschrägen, STL, und ob die ausgelieferten `assets/parts/*.glb` noch zur Quelle passen |
| `field.test.mjs` | Abstandsfeld und Offsetfläche gegen die geschlossene Formel (Quader, Kugel), Untermaß, Geschlossenheit, verschmelzende Spalte |
| `distance.test.mjs` | Punkt-Netz-Abstand gegen Fläche, Kante, Ecke und Innenraum, Symmetrie, Unabhängigkeit von der Rasterweite, Verfeinern |
| `die.test.mjs` | jede Baugruppe geschlossen und richtig orientiert, **kein Bauteil steckt im Stahl eines anderen**, Kavität als Negativ mit Spalt, Kernstift, Füllkammer |
| `imports.test.mjs` | jeder Import löst auf, jeder exportierte Name existiert, jede angesprochene HTML-id ist vorhanden |
| `runner.test.mjs` | der Angussdesigner ohne Browser: Profil (Umriss gegen Abstandsfunktion), Graph (Spiegelung, Einfügen, Löschen, JSON), Kurve (Bogenlänge, monotoner Querschnitt), Sweep (Volumen = Fläche × Länge, geschlossen auch mit gerundeten Deckeln), Strömung, Regeln, Auslegung, Flussschema |
| `fill.test.mjs` | die Füllabschätzung ohne Browser: Plan und Anteile, Startzellen unter dem Rechteck, Frontausbreitung (Ankunft wächst mit dem Weg, Füllgrad als Volumenrang, der größere Anschnitt kommt weiter, die Dünnwand-Bremse verzögert eine Rippe), Füllkörper bei 100 % und 50 %, letzte Stellen |
| `viewer.test.mjs` | die Verdrahtung aller Viewer — mit einem winzigen DOM aus der **echten** HTML-Seite und dem echten Three.js ohne WebGL-Renderer (`tests/stubs/`) |

Der letzte Test ist der Ersatz für den Browser, den es in der
Kommandozeile nicht gibt: er klickt Knöpfe, zieht Regler und prüft, dass
Kamera, Farben, Legende und Kennzahlen wirklich reagieren.

**Was er NICHT ersetzt, ist das Bild.** Ohne WebGL wird nichts
gezeichnet, und dabei bleibt genau eine Klasse Fehler unsichtbar: die
Kamera schaut in die falsche Richtung, das Modell liegt außerhalb des
Sichtkegels, alle Kennzahlen stimmen — und der Viewport ist leer. Genau
das ist beim Angussdesigner passiert (der Trackball richtete die Kamera
nach `fitTo()` nicht neu aus). Nach Änderungen an Kamera, Steuerwerk
oder Sichtbarkeit lohnt deshalb ein Blick in einen echten Browser;
`renderer.info.render.triangles` sagt in einem Satz, ob überhaupt etwas
gezeichnet wurde.

## Anbindung an das Projekt

Die Seiten rechnen rein clientseitig und tragen deshalb keine
Projektleiste — sie lesen und schreiben kein Projekt. Naheliegende
Verknüpfungen, die noch nicht verdrahtet sind:

- Der Angussdesigner rechnet mit Gussvolumen, Füllzeit und
  Zielgeschwindigkeit am Anschnitt — dieselben Größen, die das
  [Auslegungs-Dashboard](/tools/auslegung/) führt. Sie von dort zu
  übernehmen und den errechneten Druckbedarf als Formwiderstand ins
  PQ²-Diagramm zurückzugeben, wäre die naheliegendste Verbindung im
  ganzen Studio.
- `js/config.js` aus dem Projektabschnitt `design` speisen (Kolben-Ø ↔
  `sleeve.d`, Kammerlänge ↔ `sleeve.len`, Bauteil-/Anguss-Maße aus der
  Massenbilanz) und die GLB pro Projekt erzeugen — oder direkt eine
  CAD-GLB mit den vereinbarten Namen hinterlegen.
- Die Entformungsanalyse liest dasselbe Dreiecksformat wie die
  [Sprengflächenanalyse](/tools/sprengflaeche/) (9 Werte je Dreieck): die
  STL aus dem Abschnitt `geometry` ließe sich unmittelbar übernehmen und
  die Entformschrägen-Bilanz dorthin zurückschreiben.
- Das Schwindmaß der Legierung ließe sich in der Wandstärkenanalyse als zweiter
  Anteil neben dem Aufmaß führen — eine Skalierung des Bauteils vor dem
  Rastern genügt.

## Herkunft

Entstanden als eigenständiges Projekt `form3d` neben dem Repo und im
August 2026 hierher übernommen, samt Generatoren und Tests. Der
eigenständige Stand existiert nicht mehr; dieser Ordner ist die einzige
Quelle.

## Werkbank (`werkbank.html`)

Die Werkbank reiht die Werkzeuge als **Schritte** an einem Bauteil auf —
links eine schmale Leiste (1 Bauteil · 2 Anguss · 3 Füllung · 4 Überläufe ·
5 Temperierung · 6 Auslegung), daneben das Feld des aktiven Schritts, rechts
ein Viewport für alles. Die Einzelseiten bleiben, wie sie sind; die
Schritte sind Portierungen davon (`js/werkbank/`) über denselben
Rechenmodulen. Rahmen ist das Bauteilsystem der Analyseseiten (Trennebene
z = 0, die Form öffnet nach +z).

Was zwischen den Schritten wandert:

- **Bauteil → Anguss:** beim Laden liegt ein Vorschlag vor dem Bauteil
  (`js/werkbank/propose.js`): Pressrest vor der Kante bei −Y, Kanäle in der
  Trennebene als Nut in der beweglichen Hälfte (Achse −z), ein, zwei oder
  vier Anschnitte an der Kante, mit einem Strahl an die Wand gebunden. Das
  Gussvolumen des Angusses ist Bauteil plus Überläufe.
- **Anguss → Füllung:** die Anschnitte der Füllabschätzung *sind* die
  Mündungen des Angussgraphen — Ort, Richtung, Breite, Höhe, Ist-Anteil aus
  der Strömungsrechnung; niemand setzt sie von Hand.
- **Füllung → Überläufe:** die zuletzt gefüllten Stellen bleiben als Marken
  stehen, während man die Überläufe setzt.
- **Ein Abstandsfeld für drei Schritte:** Wandstärke (Wärmezentren,
  Feldschnitt), Füllung (Raster) und Temperierung (Abstandsfläche) rechnen
  auf demselben Feld (`ctx.field` in `js/werkbank/app.js`; Zellkante = halbe
  Wanddicke, Band nach außen für den Temperierabstand).
- **Auslegung → Anguss:** die Ankunft der Schmelze an jedem Anschnitt (im
  Flussschema, im Auswahlfeld und in der Prüfregel der Spanne) steht nach der
  **DieLogic-Schusskurve** statt nach einem konstanten Strom
  (`js/werkbank/shottime.js`): die Kurve der Auslegung (López-Anfahrt bis
  v_krit, Plateau bis „Kammer voll", Rampe mit a_max auf das v₂ der
  NADCA-Füllzeit) wird für dieses Modell erzeugt — Maschine, Kammer,
  Legierung und Thermik aus dem Auslegungszustand, die Massen aus den
  Volumen des Modells. Die Ankunft bei konstantem Strom ist ein Volumen,
  das den Pressrest passiert hat; auf der Kurve ist das ein Kolbenweg
  hinter „Kammer voll", und das Profil kennt die Zeit dazu. Die Zeiten
  zählen ab „Kammer voll"; das Häkchen „Ankunft nach der
  DieLogic-Schusskurve" schaltet auf den konstanten Strom zurück.
- **Modell → Auslegung:** Bauteil-, Anguss-, Überlauf- und Pressrestgewicht
  (Volumen × Dichte bei Solidus), Anschnittfläche und -dicke, Wandstärke
  (2V/A, dickste Stelle) und die Sprengfläche (Projektion aller Kavitäten
  auf die Trennebene, als Vereinigung gerastert — `js/werkbank/measure.js`)
  stehen zur Übernahme in den Auslegungszustand; „automatisch nachführen"
  hält sie aktuell. Der Schritt selbst ist das echte Dashboard (dieselben
  Module wie `/tools/auslegung/`) über dem Viewport. Zurück geht die
  Legierung (nach Dichte), die Füllzeit der Schusskurve und die
  Zielgeschwindigkeit ins „Prozess"-Feld des Angusses.

Dateien: jeder Schritt lädt und speichert seine gewohnte JSON (Anguss,
Überläufe, Temperierung); „Speichern" in der Leiste schreibt alles zusammen
als `dielogic-werkbank` (das Bauteil als Verweis auf das Beispielteil, nicht
als Netz). Ablegen auf dem Viewport nimmt Bauteile (STL/GLB), Plandateien
und Werkbank-Dateien entgegen — was es ist, sagt der Inhalt.
`?schritt=anguss` öffnet die Seite in einem bestimmten Schritt.
