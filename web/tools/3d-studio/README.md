# 3D-Studio

Fünf Werkzeuge rund um Bauteil und Form in 3D, unter einem
Navigationsreiter. Alles rechnet clientseitig — kein Backend, kein
Projekt, keine Anmeldung; die Bauteile kommen als STL oder GLB und
verlassen den Browser nicht.

| Seite           | Inhalt |
|-----------------|--------|
| `index.html`    | Übersicht: die Werkzeuge als Karten, dazu die drei Schritte der Formteilung |
| `form.html`     | **Formaufbau** — eine beispielhafte Kaltkammer-Druckgießform als Schnittmodell |
| `bauteilanalyse.html` | **Bauteilanalyse** — für ein Bauteil die Zuordnung jedes Dreiecks zu Formhälfte oder Schieber |
| `offset.html`   | **Offsetflächen** — Abstandsfeld durch Rasterisierung: Fläche gleichen Abstands, Wandstärke und Wärmezentrum (die Frage nach *innen*) |
| `abstand.html`  | **Abstandsanalyse** — kürzester Abstand zwischen zwei Dateien, eingefärbt auf einer selbst gesetzten Skala (die Frage nach *außen*) |
| `anguss.html`   | **Angussdesigner** — das Angusssystem als Graph entwerfen: Pressrest, Laufkanäle als Splines, Verzweigungen, Anschnitte; dazu Verluste, Füllbalance und ein dichter Körper als STL |

Erreichbar über den Reiter **3D-Studio** in der Navigation oder direkt
unter `/tools/3d-studio/`.

Three.js liegt lokal in `vendor/` (MIT, LICENSE dort) — es ist die
einzige Fremdbibliothek des Studios und wird von keiner anderen Seite der
Website gebraucht, deshalb steht sie hier und nicht in `/shared/vendor/`.

Vier der fünf Seiten *messen* an vorhandener Geometrie; der
Angussdesigner ist der einzige, der welche *erzeugt*.

## Formaufbau (`form.html`)

Die Beispielform: feste und bewegliche Hälfte mit Einsätzen, Kavität
(Bauteil mit Dom, Kernloch und Flansch), Gießsystem (Pressrest,
Angusskegel, Anguss, Anschnitt), Überläufe und Entlüftungskanal,
Temperierkreise beider Hälften, Füllkammer mit Gießloch und Gießkolben,
Auswerferkasten mit Platten, Auswerfer- und Rückdrückstiften, Führung
und geteilter Vakuumblock.

Bedienung:

- Baugruppen gruppiert nach **Feste Seite · Bewegliche Seite · Gussteil**,
  je Gruppe eine **Glühbirne** im Kopf: leuchtet sie, ist mindestens eine
  Baugruppe sichtbar; ein Klick schaltet die ganze Gruppe um. Die
  Temperierung steht je Hälfte als eigene **Untergruppe** mit den beiden
  Kreisen (links/rechts) und eigener Glühbirne.
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
tatsächlich entformbar (im Teilungs-Viewer als Beispielteil nachprüfbar).

**Bewusst nicht ausgeschnitten** sind die Temperierkanäle: das Rohrmodell
*ist* die Bohrung samt Inhalt. Im Schnitt zeichnet die Klassen-Deckfläche
den Kanalquerschnitt korrekt, und bei transparentem Stahl sieht man die
Kreise wie in einer CAD-Ansicht. `tests/die.test.mjs` prüft alle anderen
Paarungen auf gemeinsames Volumen — es muss null sein.

## Bauteilanalyse (`bauteilanalyse.html`)

Für ein Bauteil (Beispielteil, das Gussteil der Beispielform oder eine
eigene **STL oder GLB** per Knopf/Drag-and-drop) wird berechnet, **welche
Formhälfte oder welcher Schieber jedes Dreieck abbildet** — ohne dass
Hälften oder Schieber im Modell vorhanden sein müssen. Welches Format
eine hochgeladene Datei hat, entscheidet der Dateikopf, nicht die
Endung.

### Der Weg dahin

1. **Sichtbarkeit** (`js/part/visibility.js`) — für jede der sechs
   Hauptrichtungen ±X ±Y ±Z wird je Dreieck geprüft: zeigt die Normale
   dorthin (`n·d > 0`), und ist der Weg frei? Der zweite Teil ist die
   eigentliche Arbeit, denn er entscheidet über Hinterschnitte. Weil die
   Richtungen achsparallel sind, bleibt ein Strahl in *einer* Zelle eines
   Rasters über die beiden Querachsen — es genügt, die Dreiecke einmal je
   Richtung einzusortieren und pro Abtastpunkt nur die Dreiecke seiner
   Zelle zu prüfen.
2. **Saat** (`js/part/segment.js`) — Dreiecke, die aus *genau einer*
   Richtung entformbar sind, sind eindeutig und werden festgesetzt.
   Dreiecke, die aus *keiner* Richtung entformbar sind, sind
   Hinterschnitte (rot) und bleiben es.
3. **Inseln** — zwei Sorten Restflecken werden aufgeräumt: Löcher, die
   komplett von einer einzigen Region umschlossen sind, schlagen dieser
   Region zu; winzige Splitter einer Region mitten in einer anderen
   werden aufgelöst.
4. **Ausbreiten bis zur Trennlinie** — von der Saat aus wachsen die
   Regionen über die mehrdeutigen Dreiecke (Dijkstra): gut anliegende
   Flächen sind billig, scharfe Knicke teuer, Schieber teurer als die
   Hauptrichtung (Aufschlag je Dreieck, siehe „Schieber-Kosten"). Dadurch
   legt sich die Trennlinie von selbst auf scharfe Kanten, und Schieber
   bekommen nur, was sie bekommen müssen. Wo zwei
   Regionen aufeinandertreffen, liegt die **Trennlinie**. Flecken, die nur
   aus mehrdeutigen Dreiecken bestehen (etwa der Mantel eines quer
   liegenden Zapfens), bekommen eine Nachsaat und wachsen von dort.
5. **Entformschrägen** (`js/part/draft.js`) — `α = arcsin(n · d)` gegen die
   *zugewiesene* Richtung; eine Schieberfläche wird also gegen den
   Schieber bewertet, nicht gegen die Formöffnungsrichtung.

Die Stufen 2–4 lassen sich in der Seitenleiste einzeln anzeigen.

**Gerechnet wird auf Bestätigung.** Ein geladenes Bauteil erscheint
zunächst grau; „Analyse starten" rechnet Sichtbarkeit und Zuordnung.
Jede Änderung an den Teilungs-Reglern lässt das bisherige Bild stehen und
meldet „Einstellungen geändert" — erst der Knopf rechnet neu. Reine
Darstellungsschalter (Einfärbung, Stufe, Grenzwert, Deckkraft, Offset)
wirken dagegen sofort, sie rechnen die Analyse nicht neu. Die
Sichtbarkeit hängt nur am Netz und wird je Bauteil nur einmal gerechnet;
ein Aktualisieren kostet danach Millisekunden.

### Regler

- **Formöffnung** X/Y/Z — legt fest, welche zwei Richtungen die
  Formhälften sind und welche vier die Schieber.
- **Mindestschräge** — darunter gilt eine Fläche nicht als entformbar.
  Bei 0° zählen auch senkrechte Wände (0° Schräge) als entformbar; steht
  sie höher als die tatsächliche Schräge, wandern Flächen zu den
  Schiebern oder werden zu Hinterschnitten. Ein direkter Test der
  Konstruktion.
- **Schieber-Kosten** — Aufschlag **je Dreieck** für Schieberrichtungen,
  nicht einmalig beim Start. Das ist der Unterschied zwischen „ein
  Schieber kostet etwas" und „ein Schieber kostet, was er abdeckt": eine
  lange, flach anliegende Wand (etwa ein Flansch mit 2° Schräge) wäre
  sonst für den Schieber, der sie mit 90° sieht, immer billiger als für
  die Formhälfte, die sie völlig korrekt mit 2° entformt. Voreingestellt
  ist 1,2 — über 1,0 bekommen die Schieber genau das, was **keine**
  Hauptrichtung entformen kann. Herunterdrehen zeigt, was sie sich sonst
  noch nehmen würden.
- **Kantenschärfe** — wie teuer das Überschreiten scharfer Kanten ist;
  höher heißt: die Trennlinie sucht die Kanten.

### Einfärbungen

**Regionen** (sechs Farben + Rot für Hinterschnitte + Grau für „Stufe noch
nicht erreicht"), **Schräge** (Farbverlauf um einen Grenzwert, Hinterschnitte
dunkelrot), **Sichtbarkeit** (aus wie vielen Richtungen ist das Dreieck
entformbar?) und **Grau**. Die Legende nennt je Eintrag den Flächenanteil.

Bei den beiden geordneten Größen — Schräge und Sichtbarkeit — steht
links unten im Viewport eine **Farbskala** mit den Zahlenwerten. Bei den
Regionen bleibt sie aus: dort gibt es keine Reihenfolge, eine Skala wäre
irreführend.

## Offsetflächen (`offset.html`)

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
   Wert bei ±band stehen — das hält Speicher und Rechenzeit im Rahmen.

**Auflösung** (Zellen entlang der längsten Kante) und **Bandbreite**
stehen als Regler daneben; was sie kosten werden — Zellgröße,
Rasterabmessungen, Punktzahl, Speicher — steht *vor* dem Rechnen in den
Kennzahlen. Gerechnet wird erst auf „Feld berechnen".

### Schritt 2 — Fläche ableiten (sofort)

`js/part/surfacenets.js` zieht die Fläche gleichen Abstands heraus:
je Rasterzelle mit Vorzeichenwechsel ein Punkt (Mittelwert der
Kantenschnittpunkte), je Rasterkante mit Vorzeichenwechsel ein Viereck
zwischen den vier angrenzenden Zellpunkten. Gegenüber Marching Cubes
braucht das keine 256-Zeilen-Tabelle, liefert gleichmäßigere Dreiecke und
ist geschlossen und mannigfaltig.

Das **Aufmaß** wird als Zahl eingetippt und mit der Eingabetaste
bestätigt (`+10`, `-10`, `−10`, `1,5` und `1.5` gelten alle). Solange es
in der Bandbreite liegt, kostet ein anderer Wert nur das Ableiten —
Millisekunden, kein neues Feld. Verlangt es mehr, zieht die Bandbreite
automatisch mit und die Seite bittet um ein neues Feld.

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

- **Untermaß −s eintippen** — alles, was dünner als 2·s ist, verschwindet;
  stehen bleiben genau die Kerne, die dicker sind. Der Betrag, bei dem
  der Körper zerfällt, ist die halbe größte Wandstärke.
- **Feldschnitt einschalten** — die tiefroten Bereiche sind die dicken
  Stellen, die Farbskala nennt den Wert in mm.

Der Erstarrungsmodul V/A ist damit nicht identisch; die Kugelprobe ist
sein üblicher Stellvertreter und für Wände exakt gleich (bei einer Platte
der Dicke t sind beide t/2, bei einem Zylinder mit Ø d ergibt die Kugel
d/2, der Modul d/4).

### Das Feld ansehen

Ein **Feldschnitt** zeigt das Feld selbst als Rasterbild: Achse und
Position wählbar, gefärbt nach Abstand (innen warm, außen kühl, an der
Oberfläche weiß), mit den Höhenlinien der Bauteilfläche und der aktuellen
Offsetfläche. Die Farbskala links unten nennt die Werte. Das Bild wird
bewusst ungeglättet dargestellt — man soll das Raster sehen, aus dem die
Fläche entsteht.

## Abstandsanalyse (`abstand.html`)

Die Offsetflächen beantworten die Frage nach innen. Nach außen steht die
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
- **Farbskala mit eigenen Grenzen.** Minimum und Maximum werden
  eingetippt — erst „interessant ist der Bereich zwischen 8 und 20 mm"
  macht aus der Karte eine Aussage. Ein Knopf übernimmt die Grenzen aus
  den Messwerten. Die Grenzen färben nur um; nur die Suchgrenze verlangt
  eine neue Rechnung. Der Verlauf wird über vier Stützstellen monoton
  heller, damit die Reihenfolge auch im Graudruck stimmt — anders als bei
  einem Regenbogenverlauf.
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
deshalb bei jedem Mausschritt. Nur EINE Sache wartet auf Bestätigung:
das Verschmelzen zum dichten Körper.

### Knotenarten

| Farbe | Art | Bedeutung |
|-------|-----|-----------|
| grau | **Pressrest** | Ursprung. Durchmesser, Dicke und Ausstoßrichtung; die Dicke wächst ENTGEGEN der Richtung, also in dieselbe Formhälfte wie die Kanaltiefe. |
| türkis | **Punkt** | Stützpunkt des Laufkanals mit eigenem Querschnitt. |
| gold | **Verzweigung** | Gabelung mit Aufteilung (50:50 …) und wahlweise erzwungener Spiegelsymmetrie. |
| violett | **Spiegelpunkt** | dasselbe fest auf 50:50, aber nur EIN Ast wird bearbeitet — der andere entsteht. |
| orange | **Anschnitt** | Endpunkt mit Höhe, Länge, Breite und der Art des Übergangs. |

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
Abstandsfunktion (für die Verschmelzung); die Tests prüfen sie
gegeneinander.

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

### Prüfregeln

`js/runner/rules.js` prüft die Lehrbuchregeln über die WIRKLICHE
Geometrie: Querschnitt nimmt ab, Summe der Abgänge, Anschnitt- und
Kanalgeschwindigkeit, Seitenverhältnis, Krümmungsradius ≥ 2·d_h,
Entformschräge, Füllbalance, Kanal gegen Anschnitt, Materialausbeute.
Jede Meldung nennt Ort und Zahl — eine Meldung ohne Zahl hilft niemandem.
Alle Beispiele sind ohne Beanstandung; `runner.test.mjs` prüft das.

### Zwei Körper, und warum

**Kanäle** (Sweep, `js/runner/sweep.js`) zieht das Profil entlang der
Mittellinie: je Kante ein geschlossener Schlauch, exakt so bemaßt wie
eingegeben, in Millisekunden fertig. An den Verzweigungen stecken die
Schläuche nur ineinander — kein dichter Körper, keine Übergänge.

**Verschmolzen** (`js/runner/sdf.js`) rechnet ein Abstandsfeld und zieht
mit `js/part/surfacenets.js` — demselben Verfahren wie die
Offsetflächen — die Nullfläche heraus. Jeder abgetastete Millimeter ist
ein kurzes Prisma; die Prismen werden weich vereinigt:

    smin(a, b, k) = min(a, b) − h²·k/4,   h = max(k − |a−b|, 0)/k

Zwei Feinheiten entscheiden über brauchbar oder unbrauchbar:

1. **Geblendet wird nur zwischen ZÜGEN** (Ketten von Kanten ohne
   Gabelung), innerhalb eines Zuges scharf. Denn smin(a, a, k) ist
   a − k/4, und bei hundert überlappenden Prismen eines geraden Kanals
   läuft der Wert davon — gemessen +56 % Volumen bei k = 3 mm. Züge
   treffen sich genau dort, wo der Übergang hingehört: an den
   Verzweigungen und am Pressrest.
2. **Weich vereinigt wird nur der KERN des Profils**; der Schnitt an der
   Trennebene kommt zuletzt und scharf, mit der Ebene des nächstgelegenen
   Kanals. Sonst zöge der Übergang den Körper über die Trennebene hinaus
   (gemessene 1,2 mm bei 3 mm Übergang), und so ein Anguss passt in keine
   Formhälfte. Der Hals wächst nach unten und zur Seite, nie nach oben.

Nur der verschmolzene Körper ist geschlossen, und nur er kommt in die
STL.

### WebGPU

Das Feld ist die einzige Stelle, die wirklich rechnet: für jeden
Rasterpunkt der Abstand zu jedem Prisma in Reichweite. Auf der CPU sind
das bei 0,8 mm Zellweite einige Sekunden — zu lang, um am Regler zu
ziehen. Die Aufgabe ist die denkbar günstigste für eine Grafikkarte:
Millionen Rasterpunkte, die nichts voneinander wissen, je Punkt dieselben
zwei Dutzend Schritte. `js/runner/gpu.js` macht daraus einen
Compute-Shader; ohne WebGPU (Firefox ohne Flag, Safari älter als 18,
jeder Test unter Node) fällt alles auf `js/runner/sdf.js` zurück. Die
Kennzahlen sagen, welcher Weg gelaufen ist.

Der Shader ist eine **Handkopie** derselben Formel, und Node kann ihn
nicht ausführen — keine Testsuite fängt ihn. Deshalb drei Vorkehrungen:

- Übersetzungsfehler werden abgefragt (`getCompilationInfo`), die
  Pipeline asynchron gebaut und Fehlerbereiche ausgewertet. WGSL meldet
  nichts über Ausnahmen: ohne diese Abfragen bekommt man anstandslos ein
  Feld aus lauter Nullen. Genau so ist es beim ersten Lauf im Browser
  passiert (`meta` ist ein reserviertes Wort in WGSL).
- Nach jeder Rechnung prüft `verifyField()` einige hundert Rasterpunkte
  gegen `fieldAt()` — dieselbe Rechnung in JavaScript. Weicht etwas ab,
  wird geworfen und auf der CPU weitergerechnet, statt still eine falsche
  Geometrie zu liefern.
- `runner.test.mjs` prüft `fieldAt()` Punkt für Punkt gegen den
  Feldaufbau; damit hängen beide Wege an derselben Beschreibung.

Alle Abkürzungen (Hüllkugeln je Zug und je Prisma) sind EXAKT: ein
übersprungenes Prisma hätte den Wert nicht geändert. Deshalb liefern
beide Wege dasselbe Feld — gemessen über alle Beispiele höchstens
2·10⁻⁵ mm Unterschied (einfache gegen doppelte Genauigkeit), null
Vorzeichenwechsel.

### Freies Drehen

Die OrbitControls drehen um eine feste Hochachse. Für ein Bauteil auf
einem Raster ist das richtig, für einen Anguss hinderlich: er liegt in
der Trennebene, die je nach Ausstoßrichtung überall liegen kann, und die
Draufsicht auf sie ist genau der Pol, an dem eine Kugelsteuerung klemmt.
`js/trackball.js` dreht deshalb mit Quaternionen um eine Achse in der
Bildebene — kein Pol, keine Sperre.

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

Die Seitenleiste behält, was für das GANZE System gilt: Beispiel und
Dateien, Pressrest, Kanalform, Prozess, Prüfliste, Darstellung,
Referenzbauteil, Verschmelzen und Export.

Unten rechts stehen übereinander das Flussschema, die Farbskala und die
Legende der Punktarten — auf den übrigen Seiten des Studios sitzt die
Farbskala links unten, hier liegt dort das Auswahlfeld.

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

- **Angussdatei (JSON)** — der Graph selbst, mit Kennung und
  Fassungsnummer. Laden und Speichern über die Knöpfe oder per
  Ziehen-und-Ablegen; was für eine Datei es ist, entscheidet der Inhalt,
  nicht die Endung.
- **STL** — der verschmolzene Körper.
- **Referenzbauteil (STL/GLB)** — wird nur durchscheinend dazugestellt,
  damit die Anschnitte dorthin zeigen, wo sie hingehören; es wird nicht
  gerechnet.


## Struktur

```
index.html            Übersicht (Karten der Werkzeuge)
form.html             Viewer 1: Formaufbau
bauteilanalyse.html   Viewer 2: Bauteilanalyse
offset.html           Viewer 3: Offsetflächen
abstand.html          Viewer 4: Abstandsanalyse
anguss.html           Viewer 5: Angussdesigner
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
js/scene.js           Renderer, Kameras (Zentral + Parallel), Licht, Ansichten
js/trackball.js       Quaternionen-Trackball: freies Drehen um einen Punkt
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
js/part/app.js        Einstieg Bauteilanalyse-Viewer
js/part/offsetapp.js  Einstieg Offsetflächen-Viewer
js/part/distanceapp.js Einstieg Abstandsanalyse-Viewer
js/runner/vec.js      kleine Vektorrechnung (ohne Three.js, unter Node lauffähig)
js/runner/graph.js    DAS Datenmodell: Knoten, Arbeitsebenen, Spiegelung, JSON
js/runner/presets.js  Beispielsysteme (durch die Auslegung gelaufen)
js/runner/profile.js  Trapezquerschnitt — als Umriss UND als Abstandsfunktion
js/runner/curve.js    Hermite-Bögen, Abtastung nach Bogenlänge, Querschnitts-Fahrplan
js/runner/sweep.js    Netz: Profil entlang der Mittellinie, Pressrest
js/runner/sdf.js      Abstandsfeld, weiche Vereinigung, Schnitt an der Trennebene
js/runner/gpu.js      dasselbe Feld als WebGPU-Compute-Shader (+ Stichprobe)
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
node scripts/3d-studio/build-glb.mjs     # assets/die.glb    ← js/diegeom.js, js/config.js
node scripts/3d-studio/build-parts.mjs   # assets/parts/*.glb ← js/part/demogeom.js
```

Die Beispielteile werden dabei schon aufgeräumt (entartete Dreiecke weg,
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
| `runner.test.mjs` | der Angussdesigner ohne Browser: Profil (Umriss gegen Abstandsfunktion), Graph (Spiegelung, Löschen, JSON), Kurve (Bogenlänge, monotoner Querschnitt), Sweep (Volumen = Fläche × Länge, geschlossen), Feld (Übergang bläht nicht auf, Feldaufbau gegen Einzelpunkt-Fassung), Strömung, Regeln, Auslegung, Flussschema |
| `viewer.test.mjs` | die Verdrahtung aller fünf Viewer — mit einem winzigen DOM aus der **echten** HTML-Seite und dem echten Three.js ohne WebGL-Renderer (`tests/stubs/`) |

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

Die vier Seiten rechnen rein clientseitig und tragen deshalb keine
Projektleiste — ohne Konto funktionieren sie vollständig. Naheliegende
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
- Die Bauteilanalyse liest dasselbe Dreiecksformat wie die
  [Sprengflächenanalyse](/tools/sprengflaeche/) (9 Werte je Dreieck): die
  STL aus dem Abschnitt `geometry` ließe sich unmittelbar übernehmen und
  die Entformschrägen-Bilanz dorthin zurückschreiben.
- Das Schwindmaß der Legierung ließe sich auf der Offsetseite als zweiter
  Anteil neben dem Aufmaß führen — eine Skalierung des Bauteils vor dem
  Rastern genügt.

## Herkunft

Entstanden als eigenständiges Projekt `form3d` neben dem Repo und im
August 2026 hierher übernommen, samt Generatoren und Tests. Der
eigenständige Stand existiert nicht mehr; dieser Ordner ist die einzige
Quelle.
