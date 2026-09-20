# 3D-Studio

Acht Werkzeuge rund um Bauteil und Form in 3D, unter einem
Navigationsreiter — und die Werkbank, die sie als sechs Schritte an
einem Bauteil aneinanderreiht. Alles rechnet clientseitig — kein Backend, kein
Projekt; die Bauteile kommen als STL oder GLB und verlassen den Browser
nicht. Ein Konto braucht es trotzdem: wie jede Seite unter `/tools/`
liefert das Backend sie nur mit Sitzung aus (`login_gate` in
`backend/app.py`), sonst geht es zur Anmeldung und danach zurück.

Was quer über alle Werkzeuge gilt — Koordinatenrahmen, Beispielteile, die
Beispielform mit ihrem GLB-Vertrag, alle Dateiformate und die
Gestaltungsregeln — steht in `docs/3d-studio-grundlagen.md`.

| Seite           | Inhalt |
|-----------------|--------|
| `index.html`    | Übersicht: die Werkzeuge als Karten, dazu die drei Schritte der Formteilung |
| `werkbank.html` | **Werkbank** — alle Werkzeuge als sechs Schritte an einem Bauteil in einem Viewport: Bauteil (Entformung, Wandstärke), Anguss (Vorschlag aus dem Bauteil), Füllung (von den Anschnitten des Angusses), Überläufe, Temperierung, Auslegung (das Dashboard mit Massen, Anschnitt und Sprengfläche aus dem Modell); Code in `js/werkbank/` |
| `form.html`     | **Formaufbau** — eine beispielhafte Kaltkammer-Druckgießform als Schnittmodell |
| `entformungsanalyse.html` | **Entformungsanalyse** — für ein Bauteil die Zuordnung jedes Dreiecks zu Formhälfte oder Schieber |
| `wandstaerke.html` | **Wandstärkenanalyse** — Abstandsfeld durch Rasterisierung: Wandstärke und Wärmezentrum, Fläche gleichen Abstands (die Frage nach *innen*) |
| `abstand.html`  | **Abstandsanalyse** — kürzester Abstand zwischen zwei Dateien, eingefärbt auf einer selbst gesetzten Skala (die Frage nach *außen*) |
| `anguss.html`   | **Angussdesigner** — das Angusssystem als Graph entwerfen: Pressrest, Laufkanäle als Splines, Verzweigungen mit Zwickelradius, Anschnitte mit geradem Steg — als ein geschlossener Körper; dazu Querschnitt, Krümmung, Bernoulli-Verluste und Füllbalance, Ankunft nach der Schusskurve mit der Füllkammer von hier |
| `angussfuellung.html` | **Angussfüllung** — die Schmelze vom Pressrest bis zu den Anschnitten, gerechnet mit dem Gitter (Lattice-Boltzmann mit freier Oberfläche) oder mit Partikeln (SPH), auf der Grafikkarte oder in JavaScript; Ankunft je Anschnitt Gitter · Partikel · 1D nebeneinander; `?engine=sph` wählt die Partikel vor; Code in `js/simulation/`, Kerne in `js/lbm/` und `js/sph/` |
| `kammerfuellung.html` | **Kammerfüllung** — die Welle in der Füllkammer: Durchmesser, Länge, Füllgrad, Schusskurve (DieLogic oder v₁/v₂), **Metamodell** (die Vorgabe: trainiert auf OpenFOAM-Rechnungen, `js/meta/`, `models/`), Gitter oder Partikel; Kammer voll gegen die Kurve, eingeschlossene Luft, die Verfahren nebeneinander; `?engine=meta` wählt das Modell vor |
| `ueberlauf.html` | **Überlaufdesigner** — Überläufe und Entlüftungen aufs Bauteil setzen: Bohne, Bohne mit Entlüftungskanal, Waschbrett (Chill-Vent), Entlüftungsschlitz; das Volumen fürs Schussgewicht |
| `temperier.html` | **Temperierkanal-Designer** — Kühlstiche und Kanäle auf der Abstandsfläche im gewählten Abstand zur Kavität, Automatik für die Stiche, Wandabstand aus dem Feld |
| `fuellung.html` | **Füllabschätzung** — die Schmelzefront von rechteckigen Anschnitten durch das gerasterte Bauteil: Füllgrad, Füllkörper, zuletzt gefüllte Stellen |

`angussfuellung-sph.html` und `kammerfuellung-sph.html` leiten nur noch auf
`…html?engine=sph` weiter (alte Lesezeichen); der Query-String geht mit.

Erreichbar über den Reiter **3D-Studio** in der Navigation oder direkt
unter `/tools/3d-studio/`.

Three.js liegt lokal in `vendor/` (MIT, LICENSE dort) und wird von keiner
anderen Seite der Website gebraucht, deshalb steht es hier und nicht in
`/shared/vendor/`. Daneben liegt `vendor/onnxruntime/` (onnxruntime-web 1.30.0, MIT) für das eine
trainierte Modell des Studios — das Metamodell der Kammerfüllung in
`models/`. Beides zusammen sind 26 MB; geladen wird es erst, wenn jemand
wirklich mit dem Metamodell rechnet (`js/meta/model.js`), nie beim
Seitenaufbau.

Vier Werkzeuge *messen* an vorhandener Geometrie (Entformung,
Wandstärke, Abstand, Füllung), drei *erzeugen* welche (Anguss, Überläufe,
Temperierung), eines baut die Form zusammen — und die Werkbank hängt sie
aneinander.

## Formaufbau (`form.html`)

Der Formaufbau ist ein Werkzeug für **eigene Formen**: STL-Dateien laden
und in Gruppen einsortieren — Feste Seite, Temperierung fest, Bewegliche
Seite, Temperierung beweglich, Schieber, Gussteil, dazu beliebige eigene
Gruppen —, Teile umbenennen, verschieben, färben und entfernen, und das
Ganze als **eine GLB-Datei** speichern, die der Viewer wieder lädt. Und
er ist der **Heizkühlplan für die Halle**: ein Tipp hebt einen
Temperierkreis oder eine Gruppe hervor, der Rest der Form wird blass. Jede Gruppe hat
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

Bedienung (die Seitenleiste ist für Tablet und Halle gebaut: hohe
Zeilen, das Häufige sichtbar, das Seltene hinter „⋯"):

- **Schnellknöpfe** über der Liste: **Alle zeigen** (alles einblenden,
  Hervorhebung weg), **Temperierung** (alle Kreise beider Hälften
  hervorheben — die Teile in Gruppen der Klassen Temperierung fest /
  beweglich; ein zweiter Tipp nimmt sie wieder heraus) und **Aufheben**
  (mit der Zahl der hervorgehobenen Teile).
- **Gruppen** mit je einer **Glühbirne** im Kopf: leuchtet sie, ist
  mindestens ein Teil sichtbar; ein Tipp schaltet die ganze Gruppe um.
  Ein Tipp auf den **Gruppennamen** hebt alle Teile der Gruppe hervor.
  „⋯" öffnet Umbenennen, STL-Dateien in diese Gruppe laden, eine Farbe
  für alle Teile und Entfernen (nur leer). Je Teil: Schalter, **Farbfeld**
  (tippen öffnet den Farbwähler; Kolben und Stifte behalten ihre festen
  Farben), **Name** (tippen hebt hervor) und „⋯" mit Umbenennen,
  Verschieben in eine andere Gruppe und Entfernen — das Verschieben stand
  früher als Auswahlfeld in jeder Zeile, als Plan in der Halle braucht das
  niemand. „Gruppe anlegen" fragt Name, Seite, Werkstoffklasse und
  Schieber-Richtung samt Weg. Aufgeklappt ist **eine Gruppe zur Zeit**:
  ein Tipp auf den Kopf (Pfeil, Zahl der Teile oder freie Fläche) klappt
  sie auf und die vorige zu, ein zweiter Tipp zu — so bleibt die Leiste
  kurz, auch wenn eine Gruppe dreißig Teile hat; der Kopf sagt, wie viele
  Teile es sind und wie viele ausgeblendet. Eine neue Hervorhebung zieht
  die Gruppe des Teils auf, damit die Zeile zu sehen ist.
- **Hervorheben**: die hervorgehobenen Teile bleiben deckend und leuchten
  leicht, alles andere wird blass (Stahl auf 6 %, Gegossenes auf 14 %),
  auch die Schnittflächen der anderen Klassen (`clip.setClassAlpha`).
  Ein **Tipp ins Bild** hebt das Teil darunter hervor (ein kurzer Tipp
  ohne Ziehen; blasse Teile fangen den Tipp nicht ab), ein Tipp ins
  Leere hebt alles auf. Die Hervorhebung ist Sache der Ansicht und steht
  nicht in der GLB — Farben und Namen schon (`assembly.setColor`,
  Materialfarbe plus Metadatum).
- **Dateien**: „STL laden in" (Zielgruppe wählbar, mehrere Dateien auf
  einmal, auch per Ziehen-und-Ablegen auf den Viewport), „GLB laden"
  ersetzt die ganze Baugruppe, „Als GLB speichern" schreibt sie mit allen
  Metadaten. Eine abgelegte GLB wird ebenfalls als Baugruppe geladen.
- **Stahl-Transparenz** und **Form öffnen** — beides bleibt bei einer
  Hervorhebung erhalten, blass heißt „unter der Transparenz".
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


Die Seite läuft im **gemeinsamen Rahmen** (`js/entformung/`): die Analyse
startet beim Laden als Rechnung mit Fortschritt und **Abbrechen** (ein
abgebrochenes Teil bleibt grau, der Hauptknopf „Entformung rechnen" holt es
nach; kommt währenddessen ein anderes Teil, beginnt die Rechnung für das neue
von vorn). Die Legende der Regionen steht im Viewport unten rechts und nennt
nur, was vorkommt; die Bilanz steht als Kennzahlen mit Urteil in der
Seitenleiste (Hinterschnitt > 0 ist rot, Haftung an der festen Seite auch),
Rechenzeit und Splitter zugeklappt unter „Rechnung", der Grenzwert der
Schräge nur bei der Einfärbung „Schräge". Die Erklärungen der früheren
Textblöcke stehen in der Hilfe (ⓘ).

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
   - **Schieber** — sonst bekommt es ein Schieber, der es frei sieht. Eine
     Fläche *parallel* zur Schieberrichtung (0°) ist erlaubt: eine
     Querbohrung wird von einem Kern ohne Schräge gebildet. *Welcher*
     Schieber, entscheidet der zusammenhängende Fleck, nicht das einzelne
     Dreieck: die Richtung, die die größte Fläche des Flecks sieht,
     bekommt alles, was sie sieht, der Rest wird erneut so verteilt. Ein
     Sensordom auf der Seitenwand geht damit als Ganzes an *einen*
     Schieber; nach der frontalsten Sicht je Dreieck bekämen seine
     Flanken zwei weitere. Sehen zwei Richtungen gleich viel (Querbohrung
     ohne Schräge), gilt je Dreieck die frontalste Sicht, bei Gleichstand
     die nähere Seite — Kerne von beiden Seiten.
   - **Hinterschnitt** — was keine Richtung frei sieht (rot).
   - **Nachbarn** — eine senkrechte Wand, die nur eine Hälfte streifend
     sieht und kein Schieber erreicht, folgt der Mehrheit ihrer Nachbarn.
     Streifend heißt bis 0,5° Gegenschräge: eine senkrecht gebaute Wand
     kommt aus dem Export mit `n·d = −0,00002`, und mit einer harten Grenze
     bei 0 sähe die Hälfte sie nicht — ein 7-mm²-Streifen am Fuß einer
     Rippe wurde so zum Schieber. Eine *hohe* Wand mit Gegenschräge
     verdeckt sich dabei selbst und bleibt Hinterschnitt.
   - **Löcher** — ein Fleck, der ganz von *einer* anderen Region umschlossen
     ist und den diese Richtung ebenfalls sieht, schlägt ihr zu; einer
     Hälfte genügt die streifende Sicht.
   - **Splitter** — ein Schieber- oder Hinterschnittfleck unter 1/100 000
     der Oberfläche, der nur an Hälften grenzt, geht an die Hälfte mit der
     längsten gemeinsamen Kante. Die Fläche wird in den Kennzahlen
     gemeldet, nicht verschwiegen.

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

Das Netz wird genommen, wie es kommt — die Regeln urteilen je Dreieck als
Ganzem. Sieht eine Hälfte ein Dreieck nur zum Teil, gilt es als nicht
gesehen und geht an einen Schieber; bei großen Dreiecken hängt die
Schieberfläche damit an der Zerlegung. Feinere Netze sind Sache des
Exports, nicht der Analyse: die Beispielteile kommen mit Dreiecken bis
100 mm² aus `openscad_parts` (`tools/stl2glb.mjs --max-area 100`, in
`render.sh` voreingestellt — Dreiecke über der Fläche werden an ihrer
längsten Kante geteilt, die Nachbarn mit, damit keine T-Stöße entstehen;
flächengebunden, damit die Dateien klein bleiben: Getriebedeckel +10 %,
Kühlkörper ×2). Der Schatten eines Doms auf der Flanschunterseite ist
damit auf ~10 mm genau beim Schieber statt als ganzes 700-mm²-
Fächerdreieck.

**Bewegliche Seite** ist die +Seite der Formöffnungsachse — im
Bauteilrahmen liegt die Trennebene bei z = 0 und die Form öffnet nach
+z, die +Seite ist die Auswerferseite. Liegt das Teil anders herum,
tauscht der Schalter „Bewegliche Seite" die Rollen: Namen, Blick in die
Hälften, Haftung und der Gleichstand senkrechter Wände folgen ihm.

### Reiter sind Modi

Die Seitenleiste hat vier **Reiter**, und jeder ist ein Modus: er
bestimmt allein, was im Viewport steht, und nimmt es beim Verlassen
wieder mit. Kein Schalter schaltet einen anderen mit. Was man vom Bauteil
selbst wissen will (Dreiecke, Abmessungen, Volumen, Wanddicke 2V/A,
Oberfläche, Hinweise zum Netz), steht in der Bauteil-Klappe der Kopfzeile
unter „Zum Bauteil"; die **Netzkanten** sind Anzeige und stehen unter
*Darstellung ▾* (auf dem Bauteil, das man sieht — bei den Formteilen nicht).
Ein Teil, das geladen wird, während noch gerechnet wird, kommt danach dran.

- **Entformung** — Formöffnung, bewegliche Seite, die Legende und die
  Bilanz Hälften / Schieber / Hinterschnitt, die **Einfärbung**
  (**Regionen**: sechs Farben + Rot für Hinterschnitte; **Schräge**:
  Farbverlauf um einen Grenzwert, Hinterschnitte dunkelrot, mit Farbskala
  links unten im Viewport), die Trennlinie.
- **Formteile** — die Regionen als Formteile auseinandergezogen (unten).
- **Flächen** — die projizierten Flächen mit ihren Silhouetten (unten).
- **Haftung** — das Bauteil nach Haftmaß gefärbt (Turbo, Farbskala; was
  nicht haftet, hellgrau) und die Haftkarten beider Hälften (unten).

### Formteile

Im Reiter Formteile werden die Regionen zu **Formteilen**: die Flächen
jeder Hälfte und jedes Schiebers werden zu einem eigenen Stück und fahren
um den eingestellten **Abstand** entlang ihrer Entformrichtung heraus —
die Form geht auf wie beim Öffnen, das Bauteil bleibt durchscheinend
(oder gar nicht) dazwischen stehen, Hinterschnitte bleiben rot an ihrem
Ort. Entlang der Trennlinie trägt jedes Stück einen **Rand**, um den
gewählten Betrag in die Form hinein gezogen: die Trennfläche in
Andeutung, damit das Stück nicht wie Papier aussieht, sondern wie der
Einsatz, aus dem das Bauteil gerade gezogen wurde (bis 500 mm, dann sieht
das Stück aus wie ein Formblock). Darunter die **sechs möglichen
Formteile** — zwei Hälften, vier Schieber — je mit Farbe, Flächenanteil
und Schalter: anklicken zeigt oder verbirgt das Stück; was kein Dreieck
braucht, steht grau („nicht in der Form") und lässt sich nicht schalten.
Die Stücke baut `js/part/dieview.js` (Dreiecke je Region, Trennkanten,
Rand, Seite; ohne Three.js), gezeichnet und verschoben werden sie in
`js/part/dieviewer.js`; die Werkbank hat dieselbe Formansicht im Schritt
Bauteil, dort mit dem Blick von der Trennebene in eine Hälfte.

### Projizierte Flächen

Für jedes Formteil die Fläche, die es in seiner Öffnungsrichtung dem
Metalldruck entgegenstellt (`pieceProjections` in `js/part/dieview.js`):
die Flächen des Stücks entlang seiner Achse auf ein Raster projiziert
und als **Vereinigung** gezählt — die Summe projizierter Dreiecke zählte
Ober- und Unterseite einer Wand doppelt. Für die Hälften ist das die
Projektion auf die Trennebene (mit Anguss und Überläufen die
Sprengfläche der Auslegung), für einen Schieber die Fläche, gegen die
er verriegelt werden muss; dazu das ganze Bauteil auf die Trennebene.
Nur Flächen, keine Kräfte — der Druck gehört zur Auslegung. Im Reiter
stehen sie als **Silhouetten**: Umriss und Füllung in der Regionsfarbe
auf einer Ebene JENSEITS des Bauteils in der Entformrichtung des Stücks;
**Abstand** (Luft zum Bauteil) und **Deckkraft** der Füllung sind
Regler.

### Haftung

Beim Öffnen muss das Teil auf *einer* Seite bleiben — der mit den
Auswerfern. Es hängt an den Wänden, die eine Hälfte abbildet, umso
fester, je weniger Schräge sie haben — und dort, wo es beim Erstarren auf
die Form **aufschrumpft** (Kerne, Taschen, Bohrungen), nicht an
Außenwänden, von denen es sich wegzieht. `js/part/ejector.js` rechnet je
Dreieck einer Hälfte das Haftmaß

    H = A · max(0, μ·cos α − sin α) · g,   g = min(1, max(0, cos θ + ½))

mit der Fläche A, der Entformschräge α gegen die Hälfte, dem Reibwert μ
(Regler, Vorgabe 0,3; die Klammer ist die Kraft, die eine mit dem Druck
1 angepresste Wand der Entformung entgegensetzt, Menges/Mohren) und dem
Schrumpffaktor g aus dem Winkel θ zwischen Flächennormale und Richtung
zum Volumenschwerpunkt: 1 für Wände, die beim Schrumpfen in die Form
hineinwandern (Innenwand einer Tasche, Bohrung um einen Kern, die dem
Schwerpunkt zugewandte Flanke einer Rippe), 0 für Wände, die sich
zurückziehen (Außenwände, die abgewandte Rippenflanke), ½ für Wände quer
dazu — die Flanken einer Rippe, die auf den Schwerpunkt zuläuft, gleiten
beim Schrumpfen an der Form entlang, werden nicht angepresst, halten aber
mit Reibung. (Ein erster Wurf wog mit dem Betrag der Annäherung und ließ
solche Rippen ganz aus — der Konstrukteur erwartet sie zu Recht auf der
Karte.) Bewusst grob: kein Betrag der Schrumpfung, keine Elastizität,
keine Spannung zwischen Kernen; relativ — die **Summen beider Hälften**
sagen, auf welcher Seite das Teil bleibt (Kennzahlen in Prozent, eine
Warnung, wenn die feste Seite stärker hält).

Die **Haftkarte** verteilt das Haftmaß einer Hälfte auf das Raster
ihrer Projektion und glättet es (σ = 4 mm; senkrechte Wände hätten sonst
nur eine Linie als Spur). Gezeigt werden die Karten **beider Hälften
zugleich** (`ejectorMaps`), ohne Auswahl, auf **gemeinsamer Skala**: die
stärker haftende Seite trägt die 1, die andere bleibt darunter — jede
für sich normiert sähen beide gleich rot aus, und die Frage „welche
Seite hält mehr" wäre aus den Karten nicht zu lesen. Schieber haben
keine Karte; ihr Haftmaß ist 0, sie werden hier vernachlässigt. Die
Karten stehen wie die Silhouetten jenseits des Bauteils, jede in der
Entformrichtung ihrer Hälfte, mit Reglern für Abstand und Deckkraft; im
selben Reiter trägt das Bauteil das Haftmaß als Farbe. Wo Auswerfer
sitzen, entscheidet der Konstrukteur mit der Karte — Stiftvorschläge
macht die Seite nicht.

## Wandstärkenanalyse (`wandstaerke.html`)

Die Frage der Seite: wie dick ist das Bauteil wo, wo liegen seine
dicken Bereiche, und wo erstarrt es zuletzt? Beantwortet wird sie über ein **Rasterfeld**
des Abstands zur Oberfläche. (Offsetflächen nach außen, für die
Temperierung, hat diese Seite nicht mehr — der Temperierkanal-Designer
rechnet seine Abstandsfläche selbst.)

Die Seite läuft als erste im **gemeinsamen Rahmen** (siehe „Der gemeinsame
Rahmen"). Ihre Reiter sind Modi, von links nach rechts die Arbeitsfolge:
**Feld** (Zellkante,
Kosten vorab, „Feld berechnen" mit Fortschritt und Abbrechen) ·
**Isofläche** · **Schnitt** · **Wärmezentren**. Jeder Modus besitzt, was er
im Viewport zeigt — Schnitt und Wärmezentren stellen das Bauteil von selbst
durchscheinend, ein eigener Haken dafür entfällt. Nach dem ersten Feld geht
die Seite von selbst zur Isofläche; ohne Feld zeigen die drei Ergebnis-Modi
den Aufruf zum Rechnen, mit einem veralteten (andere Zellkante) „Feld neu
berechnen". Die Deckkraft des Bauteils steht unter „Darstellung" in der
Ansichtsleiste, die Isofläche als STL unter „Exportieren". Das Werkzeug
liegt in `js/wandstaerke/` (`tool.js`, `panel.js`, `help.js`), die
Erklärungen stehen in der Hilfe (ⓘ, „?").

### Schritt 1 — Feld (auf Knopfdruck)

`js/part/field.js` legt ein Raster über das Bauteil und speichert für
jeden Rasterpunkt den vorzeichenbehafteten Abstand zur Oberfläche (innen
negativ). Drei Durchgänge:

1. **Innen/außen** — für jede Rastersäule (feste x, y) werden alle
   Dreiecke gesucht, die sie überdecken, und ihre z-Durchstoßpunkte
   gesammelt. Aus der Summe der Durchstoßrichtungen oberhalb eines
   Rasterpunktes folgt, ob er im Bauteil liegt. Das ist die eigentliche
   Rasterisierung; sie kostet einen Durchlauf über die Dreiecke. Die
   Säulen liegen um Bruchteile einer Zelle versetzt, damit ein Strahl
   nicht genau eine Netzkante trifft.
2. **Abstandsband** — jedes Dreieck trägt seinen exakten Abstand
   (Punkt-Dreieck nach Ericson) in die Rasterpunkte seiner um drei Zellen
   aufgeweiteten Bounding-Box ein. Eine untere Schranke über die Box
   spart den teuren Test fast überall.
3. **Das Innere** — nach innen gibt es keine Grenze: der Abstand kann nie
   größer werden als die halbe Dicke, und genau dieses Maximum ist die
   Zahl, um die es bei der Wandstärke geht. Zellen jenseits des Bandes
   bekommen deshalb ihren Abstand aus einer exakten euklidischen
   Distanztransformation der Innen/Außen-Maske (Felzenszwalb &
   Huttenlocher, trennbar, O(N)) — auf eine halbe Zelle genau; nahe der
   Oberfläche bleibt der exakt gestempelte Wert. Das Feld ist innen
   immer vollständig.

Das Feld reicht nur so weit wie das Bauteil, zwei Zellen Luft darum —
nach außen wird nichts gespeichert, was diese Seite nicht braucht. Der
einzige Regler ist die **Zellkante** in mm (Vorgabe aus dem Bauteil: die
halbe Wanddicke 2V/A, damit jede Wand mindestens zwei Zellen über ihre
Dicke hat; ein selbst gesetzter Wert überlebt ein neues Bauteil). Was sie
kosten wird — Rasterabmessungen, Punktzahl, Speicher — steht *vor* dem
Rechnen in den Kennzahlen. Gerechnet wird erst auf „Feld berechnen".
Die Werkbank benutzt dasselbe Modul mit einem Band nach außen, weil ihre
Temperierung es braucht.

### Schritt 2 — Isofläche ableiten (sofort)

`js/part/surfacenets.js` zieht die Fläche gleichen Abstands heraus:
je Rasterzelle mit Vorzeichenwechsel ein Punkt (Mittelwert der
Kantenschnittpunkte), je Rasterkante mit Vorzeichenwechsel ein Viereck
zwischen den vier angrenzenden Zellpunkten. Gegenüber Marching Cubes
braucht das keine 256-Zeilen-Tabelle, liefert gleichmäßigere Dreiecke und
ist geschlossen und mannigfaltig.

Abgeleitet wird nur nach innen: das **Untermaß** s hat einen Regler von 0
bis zur dicksten Stelle und daneben ein Feld für die Zahl (`4`, `1,5`
und `1.5` gelten; ein Minus davor ist egal, nach innen geht es ohnehin;
tiefer als das Maximum wird die Zahl festgehalten — dort gibt es keine
Fläche mehr). Stehen bleibt, was dicker ist als 2·s — die Seite nennt
die Fläche **Isofläche** (nicht „Kern": das Wort ist in der Form schon
vergeben). Nach dem Rechnen steht als Vorgabe ein Untermaß von der
halben größten Tiefe — die dicken Bereiche, um die es geht; ein selbst
gesetztes überlebt ein neues Feld, ein neues Bauteil bekommt wieder die
Vorgabe. Jeder andere Wert kostet nur das Ableiten — Millisekunden, kein
neues Feld; am Regler wird höchstens einmal je Bild abgeleitet. Die
Isofläche lässt sich als STL speichern. `tests/field.test.mjs` prüft die Fläche gleichen Abstands
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

Drei Wege, das abzulesen: die **Isofläche** (oben), der **Feldschnitt** — ein
Schnitt durch das Feld als Rasterbild in der Turbo-Skala, blau an der
Oberfläche, rot an der dicksten Stelle, außen grau, mit der Bauteilkontur
als Linie; Achse und Lage sind Regler, im Schnitt steht nur das Bauteil
durchscheinend — und die **Wärmezentren**: `thickMaxima` in
`js/part/field.js` sucht die Rasterpunkte, deren Abstand keinen größeren
Nachbarn hat, behält die ab einem wählbaren Anteil der größten
Wandstärke und lässt nahe einer stärkeren Stelle (näher als das
1,6-fache von deren Radius) nichts weiteres zu. Jede Marke ist die
größte Kugel, die dort ins Bauteil passt — Radius = Feldwert, Durchmesser
= Wandstärke — und trägt die **Farbe ihrer Größe** auf derselben
Wandstärken-Skala wie der Schnitt (blau dünn, rot dick); die Farbskala
im Viewport gilt für beide. Wahlweise Kreise statt Kugeln (zur Kamera
gedreht, ohne Tiefenprüfung, damit sie auch im deckenden Bauteil zu
sehen sind); der Modus nimmt die Isofläche weg und macht das Bauteil
durchscheinend. Die Kennzahlen nennen Zahl der Stellen, größte
und kleinste markierte Wandstärke und den Ort der dicksten.

### Das Feld ansehen

Ein **Feldschnitt** zeigt das Feld selbst als Rasterbild: Achse und
Position wählbar, gefärbt in der **Turbo-Skala** (dunkelblau über Grün
und Gelb nach Rot; `js/part/colors.js`, das Polynom nach Popov) — **innen**
ist es die Wandstärke: an der Oberfläche blau, dick rot, die Skala nennt
das Doppelte des Feldwerts. Außen gibt es nichts zu zeigen (das Feld
reicht nur zwei Zellen über das Bauteil hinaus), dort bleibt das Bild
hellgrau, so hebt sich der Querschnitt ab. Die Skala reicht bis zum
**größten Wert, der im Feld vorkommt**, nicht bis zur Bandbreite — ein
Band von 13 mm bei 6 mm dicksten Wänden ließ sonst die halbe Skala
ungenutzt, und alles Dicke sah gleich grün aus (steht das Innere auf −band,
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
Dutzende Punkte jeden Grat. Damit die Marken zu sehen sind, stellt der
Modus das Bauteil durchscheinend und zeigt die Isofläche nicht — sonst
lagen sie im deckenden Bauteil oder hinter der Fläche. Die Kennzahlen
nennen die Zahl der Stellen, die größte
Wandstärke und den Ort der dicksten.

## Abstandsanalyse (`abstand.html`)

Die Seite läuft im **gemeinsamen Rahmen** (`js/abstand/`) und ist dort das eine
Werkzeug mit zwei Bauteilen: statt des einen Bauteil-Chips stehen in der
Kopfzeile zwei, **A** und **B**, jeder mit derselben Klappe (Beispielteil,
„Datei öffnen …", „Zum Bauteil" mit den Kennzahlen des Netzes;
`shell.header.addPartChips`). Eine ins Bild gezogene STL/GLB fragt, ob sie A
oder B sein soll. Die Seitenleiste hat zwei Modi: **Abstand** trägt
Suchgrenze, Hauptknopf („Abstand berechnen", während der Rechnung „Abbrechen")
und die Kennzahlen — Punkte innerhalb des anderen Netzes sind rot —, **Skala**
die Grenzen der Farben und die Wahl, welche Datei gefärbt wird. Die Karte steht
in beiden. Welche Datei zu sehen ist und die Deckkraft stehen unter
„Darstellung".

Die Wandstärkenanalyse beantwortet die Frage nach innen. Nach außen steht die
andere, und die braucht **zwei Körper**: wie weit ist die
Bauteiloberfläche vom Temperierkanal entfernt, vom Auswerferstift, vom
Nachbarteil? Zu nah heißt Durchbruchgefahr und eine Stelle, die zu
schnell erstarrt; zu weit heißt, die Kühlung greift dort nicht.

Zwei Dateien (Beispielteil, STL oder GLB; voreingestellt die Ölwanne und
die Temperierung der festen Hälfte ihrer Form), dann für jeden Punkt der
einen Oberfläche der kürzeste Weg zur anderen — und umgekehrt, damit sich
beide einfärben lassen. Die Dateien stehen in der Kopfzeile, nicht in der
Seitenleiste — Dreiecke, Abmessungen, Oberfläche und die Beschreibung des
Beispielteils sagen nichts über den Abstand und stehen zugeklappt in der Klappe
des Chips.

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
| grau | **Pressrest** | Ursprung. Durchmesser, Dicke und Ausstoßrichtung stehen im Modus „System"; die Dicke wächst ENTGEGEN der Richtung, also in dieselbe Formhälfte wie die Kanaltiefe. Ihn zu verschieben zieht das GANZE System mit — er ist der Anker, ihn allein zu versetzen hieße nur die erste Kante zu dehnen. |
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
zieht ihn, den Pfeil anklicken schaltet den Zielmodus scharf.** Denselben
Weg geht „Mündung ans Bauteil binden" im Auswahlfeld (Gruppe „Mündung").
Solange gezielt wird, weicht das Auswahlfeld auf seine Kopfzeile zurück — es
läge sonst dort über dem Bauteil, wo man hinklicken will. Über dem
Viewport, in der Spalte zwischen Chips und Auswahlfeld, steht dann, was zu tun ist, und unter dem Zeiger wandert eine
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

**Die Anschnitttiefe ist gerade.** Der Steg — die letzten `gate.len`
Millimeter — ist ein Prisma entlang der Mündungsrichtung (die gebundene,
sonst die Sehne vom Vorgänger): der Bogen endet an seinem Anfang, und ab
dort laufen die Schnitte parallel mit festem Maß (`gateLand` in
`js/runner/curve.js`). Die Tiefe ist damit über die ganze Breite
dieselbe, die Breite ändert sich im Steg nicht mehr, und die Richtung,
mit der der Anschnitt ins Bauteil zeigt, ist die Achse eines Stücks.
Solange der Steg auf der Kurve lag, hing seine Länge von der Krümmung ab
— außen länger, innen kürzer —, ein breiter Fächer verdrehte sich über
die letzten Millimeter, und die Mündung war die Tangente an einer Stelle.

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
seinem ANTEIL am Zulaufquerschnitt — die Tiefe läuft durch, die Breite
teilt sich (`widthForArea` in `profile.js`), so wie man eine Gabelung
fräst: ein Boden in einer Tiefe, der sich in zwei Nuten teilt. Ohne
Aufteilung wüchse der Querschnitt an jeder Gabelung auf das Doppelte;
mit beiden Maßen skaliert (so war es) sprang der Boden an jeder
Gabelung um fast ein Drittel nach oben.

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

`js/runner/sweep.js` zieht das Profil entlang der Mittellinie — je Kante
ein Schlauch, exakt so bemaßt wie eingegeben — und macht daraus **einen
geschlossenen Körper**. Die Schläuche enden nicht in Deckeln, die sich an
den Gabelungen durchdringen: dort bleiben sie offen, und die Gabelung ist
ein eigenes Flächenstück, das die drei Ringe verbindet — ein Hosenstück,
konstruiert aus Kurve, Profil und Radius; nichts gerastert, nichts
boolesch gerechnet:

- **Außenstreifen** — die rechte Profilhälfte (Flanke samt
  Bodenverrundung, von der oberen Ecke bis zum Flankenfuß) läuft über
  einen Hermite-Bogen vom Zulaufring in die rechte Hälfte des rechten
  Abgangs, die linke in den linken. Die Außenwand biegt stetig vom Zulauf
  in den Abgang.
- **Zwickel** — die einander zugewandten Innenhälften zweier Abgänge gehen
  entlang der Zwickelkante ineinander über: die geraden Innenwände beider
  Abgänge bis zu ihrem Schnittpunkt, dort mit einem Kreisbogen vom
  **Zwickelradius** („Kanalform", in der Datei `branchR`) verrundet, so
  wie ein Fräser die Innenecke stehen lässt. Das Profil dreht dabei von
  der einen Wand um die Nase herum in die andere. Schneiden sich die
  Wände nicht (T-Stück, sehr flache Gabel), verbindet ein Hermite-Bogen
  beide Wände stetig.
- **Deckfläche und Boden** — die Felder zwischen den oberen Kanten bzw.
  den Flankenfüßen. Das Ohrenabschneiden liefert nur irgendeine
  Triangulation, meist Fächer aus langen Splitterdreiecken, und auf dem
  leicht geneigten Boden hatte jedes davon seine eigene Normale — die
  Flächenschattierung zeigte Streifen, die vom Nasenpunkt ausstrahlten.
  Deshalb zwei Tauschdurchgänge nach Lawson: erst Delaunay in der Ebene
  (Sprossen quer über den Kanal statt Strahlen längs), dann im Raum die
  Diagonale mit dem kleinsten Normalenknick je Viereck
  (Dyn/Levin/Rippa) — das räumt auch die feinen Sprossen in verdrehten
  Feldern auf. Getauscht wird nur über konvexe Vierecke, der Rand
  bleibt, wie er ist.

Die Streifen treffen die Ringe der Schläuche Punkt für Punkt (die linke
Umrisshälfte ist das Spiegelbild der rechten in derselben Reihenfolge,
`profile.js` führt die Indexlisten); das Netz ist geschlossen und
einheitlich nach außen orientiert. `runner.test.mjs` prüft das an allen
Beispielen, an einem T-Stück, einer dreifachen Gabel, einem geradeaus
abgehenden Ast, einer Verzweigung in gekippter Ebene und ohne
Zwickelradius. Der Zulauf wird für das Hosenstück um etwa drei Viertel
der Kanalbreite gekürzt, jeder Abgang so weit, dass Zwickel und Bogen vor
seinem Ring Platz haben — je flacher die Gabel, desto länger die Hose,
nie mehr als knapp die halbe Kante. Ein Punkt mit einem Abgang braucht
nichts: der letzte Schnitt der Kante davor und der erste der Kante
danach sind derselbe Ring (die Kurve liefert die Endmaße exakt, nicht
über die Umkehrung der Fläche). Deckel gibt es nur am Pressrest (im
Zylinder) und am Anschnitt — die Austrittsfläche ins Bauteil.

**Abgänge, die sich durchdringen.** Liegen zwei Abgänge so eng oder sind
ihre Kanten so kurz, dass ihre Ringe sich noch überschneiden, gibt es
keinen Zwickel: die Kanäle sind dort wirklich ein überlappender Körper,
und den vereinigte nur eine Boolesche Operation. Solche Gabelungen
bleiben Schläuche mit Deckeln übereinander, und die Prüfregel „Abgänge
durchdringen sich" sagt es (`junctionPlan` in `sweep.js`).

**Am Pressrest ist der Kanal beschnitten.** Der erste Kanal beginnt in
der Mitte des Pressrests; Anguss und Pressrest sollen aber zwei Körper
sein, die sich berühren statt zu durchdringen. Jede Kante vom Pressrest
wird deshalb am Mantel des Zylinders abgeschnitten — am selben 64-Eck,
aus dem `biscuitMesh` den Zylinder baut, damit der Deckel des Kanals
genau auf dessen Facetten liegt: jede Längslinie des Schlauchs (ein
Umrisspunkt über alle Schnitte) wird bis zu ihrem Austritt durch den
Mantel verfolgt (`trimAtBiscuit`), der Ring dieser Austrittspunkte ist
der Anfang des Kanals, und das Feld darin wird auf dem abgewickelten
Mantel facettenweise trianguliert (`biscuitCap`) — Ringkanten, die eine
Facettengrenze kreuzen, werden dort geteilt, und die erste Reihe des
Schlauchs benutzt dieselben Teilpunkte, sonst stünde ein T-Stoß im Netz.
Die erste Reihe reicht bis zum übernächsten Schnitt, weil die
Mittellinie bei s = Radius genau an einem Schnitt austritt. Verlässt ein
Kanal den Zylinder nicht durch den Mantel (zu kurz, schon draußen),
bleibt er wie früher mit einem Deckel in der Mitte stehen; ein Pressrest
mit mehreren Abgängen wird je Kante beschnitten.

Geschrieben wird in ein vorab bemessenes Feld: die Stücke der Gabelungen
werden zuerst gebaut, dann steht die Zahl der Dreiecke fest. Der warme
Sweep braucht für die Beispiele 7 bis 14 ms, die ganze Kette von Abtasten
bis Netz bleibt unter 25 ms — der Sweep läuft bei jedem Mausschritt.

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

Die Seite läuft im gemeinsamen Rahmen des Studios (`js/studio/`, siehe unten):
Kopfzeile (Referenzbauteil-Chip, Rückgängig/Wiederholen, Speichern,
Exportieren ▾, Hilfe), Seitenleiste mit vier MODI in der Reihenfolge der
Arbeit, Viewport mit Chips, Auswahlfeld, Legende. Code: `js/runner/tool.js`
(Fabrik `createAngussTool`), `panel.js` (Felder), `help.js` (alle Erklärtexte
— in der Seitenleiste steht je Modus eine Zeile, ein ⓘ öffnet die Hilfe an der
Stelle).

- **System** — Beispiel, Referenzbauteil (Name und Volumen), Pressrest
  (Durchmesser, Dicke, Richtung); Punkte, Anschnitte, Lauflänge,
  Angussvolumen zugeklappt unter „Kennzahlen".
- **Kanalform** — Entformschräge, Bodenradius, Zwickelradius, Anschnitthöhe,
  Verjüngung, Seitenverhältnis; Splinestraffheit und Abtastschritt unter
  „Details". Hauptknopf: „Querschnitte abstufen".
- **Prozess** — Legierung, Gussvolumen, Füllzeit, v_Ziel, Füllkammerlänge; als
  Kennzahlen mit Urteil die Füllzeit der Kurve (mit v₂), die Ankunft ab
  „Kammer voll" und das Δ zwischen erstem und letztem Anschnitt; unter
  „Details" das Häkchen der Schusskurve, der Verzweigungsverlust, Füllgrad und
  „Kammer voll ab Kolbenstart". Hauptknopf: „Füllzeit der Kurve übernehmen" —
  stimmen Prozess und Kurve überein, steht dort nur die Zeile, die es sagt.
- **Prüfung** — am Reiter, wie viele Regeln erfüllt sind („11/12", gelb oder
  rot, wenn etwas verletzt ist); im Modus ein Balken mit einem Feld je Regel
  und die Liste: Verletztes oben und aufgeklappt, Erfülltes als Zeile zum
  Aufklappen. Die Liste scrollt in sich, die Seitenleiste nie. Hauptknopf:
  „Flussschema öffnen".

**Anfügen** sitzt als Chips über dem Bild: + Punkt · + Verzweigung ·
+ Spiegelpunkt · + Anschnitt · Davor einfügen · Flussschema. Ein Chip, der
gerade nicht geht, sagt beim Antippen, warum („Zuerst einen Punkt wählen …",
„Hinter einem Anschnitt ist Schluss …"). Gewählt wird durch Anklicken eines
Griffs — oder des Kanals: der Strahl trifft den Körper, die Mittellinien
(`centerlines`) sagen, zu welcher Kante die Stelle gehört, gewählt wird ihr
näheres Ende (`sweep.js` bleibt dafür unberührt). Beim Laden ist nichts
gewählt: das erste Bild zeigt das ganze System.

Der gewählte Punkt wird im **Auswahlfeld** neben dem Bild bearbeitet. Es zeigt
immer nur EINE Gruppe (Reiterzeile): Lage (mit Ebene längs/quer) ·
Querschnitt · Verzweigung (Aufteilung, Spiegeln) · Anschnitt (Höhe, Tiefe,
Breite) · Mündung (Übergang, „Mündung ans Bauteil binden") · Details
(Querschnitt, hydraulischer Ø, Verlust, Ankunft ab Kolbenstart). Über den
Reitern steht beim Anschnitt seine Ankunft ab „Kammer voll" und wie weit er
hinter dem ersten liegt. Die gespiegelte Seite zeigt ihre Werte, nimmt aber
keine an. Auch der **Pressrest** lässt sich anklicken und ziehen (er zieht
das ganze System mit); seine Maße stehen unter „System". Eine Arbeitsebene
zum Kippen bekommt er nicht — seine Ebene IST die Ausstoßrichtung.

**Alles lässt sich zurücknehmen**: Strg+Z / Strg+Y und die Pfeile der
Kopfzeile. Ein Zug am Griff ist EIN Schritt, ein Regler ebenso; ein bloßer
Klick auf einen Griff ist keiner. **Entf** fragt nicht: ein Punkt mit genau
einem Nachfolger wird überbrückt, sonst fällt alles dahinter mit weg, und der
Toast nennt es („Verzweigung k3 und 4 Punkte dahinter entfernt. ·
Rückgängig"). Was Rückgängig zurückholt, ist danach gewählt. Ein anderes
Beispiel, eine geladene Datei und ein neues Bauteil beginnen den Verlauf neu.
Ungespeichertes hebt der Browser als Entwurf auf und bietet es beim nächsten
Mal an.

**Darstellung ▾** in der Ansichtsleiste: Deckkraft Bauteil, Körper (Kanäle /
nur Linie), Pressrest zeigen, Mittellinie und Griffe zeigen — nichts davon
ändert den Plan.

Das **Flussschema** öffnen der Chip oder der Hauptknopf der Prüfung; es
füllt den ganzen Viewport — ein Kasten in der Ecke zeigte ein System
mit sechs Anschnitten als Briefmarke; jetzt wächst das SVG mit der Fläche,
Schrift eingeschlossen. Esc oder das × schließen es. Die Bänder sind
geschwungen (kubische Bögen mit waagerechten Tangenten an den Knoten):
jeder Ast verlässt seine Gabelung sanft, wie die Schmelze es tut, und die
Bänder liegen an den Knoten bündig übereinander. Die **Kennzahlen**
des Systems stehen dort als Streifen unter dem Kopf: Punkte, Anschnitte,
Lauflänge, Angussvolumen, Volumenstrom, Druckbedarf, Ankunft der Schmelze
ab „Kammer voll" (erster bis letzter Anschnitt, mit Δ). Dort steht nur, was das Schema nicht
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

Unten rechts steht die Legende der Punktarten; die Bedienhinweise unten
links sind eine Zeile, keine vier — sie sind Erinnerung, kein Handbuch.

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

- **Speichern** (Kopfzeile) — der Graph als JSON, Kennung `dielogic-anguss`,
  Fassung 1, unverändert. Dazu drei freiwillige Schlüssel, die ältere Leser
  übergehen: `process` (Prozesswerte), `sizing` (Verjüngung,
  Seitenverhältnis) und `ref` (Lage des Referenzbauteils, gilt nur für das
  Bauteil, zu dem sie gehört). `process` steht im Abzug, weil die
  Anschnittbreiten am Prozess hängen — sonst nähme Rückgängig eine
  Prozessänderung nur halb zurück. Öffnen: „Datei öffnen …" in der
  Bauteil-Klappe oder Ablegen im Viewport; der Inhalt entscheidet, nicht die
  Endung.
- **Exportieren ▾ → STL** — zwei Dateien aus einem Klick: `<name>-anguss.stl`,
  die Kanäle als ein geschlossener Körper, am Mantel des Pressrests
  beschnitten (siehe „Das Netz"), und `<name>-pressrest.stl`, der Zylinder.
  Beide berühren sich, keiner steckt im anderen; der Browser fragt beim
  ersten Mal, ob die Seite mehrere Dateien laden darf.
- **Referenzbauteil** — ist das Bauteil des Rahmens (Bauteil-Chip:
  Beispielteil, Datei, Ablegen). Es kommt im Bauteilrahmen an (Trennebene
  z = 0) und wird in die Lage des Angusses gestellt: +z gegen die
  Ausstoßrichtung gedreht (für „Y" die Drehung um x um 90°), mit seiner
  nächsten Kante an den fernsten Anschnitt, mittig zu allen. Das NETZ bleibt
  unberührt — gedreht wird das Mesh; der Strahl der Bindung rechnet mit der
  Weltmatrix. Ein Beispiel mit eigenem Teil (Ölwanne, `ref` in `presets.js`)
  stellt es genau an seine Mündungen; ein anderes Beispiel lässt ein
  geladenes Teil stehen und stellt es vor seine Anschnitte; „Richtung" dreht
  es mit dem System. Sein **Volumen wird das Gussvolumen**: das ist die Zahl,
  aus der über die Füllzeit der Volumenstrom folgt und daraus die
  Anschnittflächen und damit jeder Querschnitt. Überläufe sind darin nicht
  enthalten — wer sie mitrechnen will, schlägt sie im Feld auf. Ist das Netz
  offen oder überlappend und das Volumen damit unbrauchbar, bleibt der Wert
  stehen und „System" sagt es. Es ist außerdem das Ziel für die **Mündung ans
  Bauteil** (siehe oben): ohne Bauteil sagt der Klick auf den Pfeil, was
  fehlt.

### Ankunft nach der Schusskurve

Die Ankunft der Schmelze an jedem Anschnitt — im Flussschema, im
Auswahlfeld und in der Prüfregel der Spanne — steht nach der
**DieLogic-Schusskurve** der Auslegung (`js/runner/shottime.js`), nicht
nach einem konstanten Strom: die Kurve (López-Anfahrt bis v_krit, Plateau
bis „Kammer voll", Rampe mit a_max auf das v₂ der NADCA-Füllzeit) wird
für dieses System erzeugt — mit der **Füllkammer von hier**: der
Pressrest-Ø ist der Kolben-Ø, die Kammerlänge steht unter „Prozess",
daraus folgt der Füllgrad (die Seitenleiste nennt ihn), und der bestimmt
die ganze erste Phase; dazu Gussvolumen, Anguss und Pressrest von hier.
Maschine (v_max, a_max) und Thermik kommen aus dem aktuellen Projekt
(`shared/project.js`, der Auslegungsabschnitt) — eine Anbindung an die
Auslegung ist das nicht, nur ihre Kurve. Vorher nahm die Kurve auch
Kolben und Kammer aus dem Projekt: ein 150er Kolben mit 900 mm Kammer
unter einem 90er Pressrest, Füllgrad 3 %, und entsprechend seltsame
Zeiten. Die Ankunft bei konstantem
Strom ist ein Volumen, das den Pressrest passiert hat; auf der Kurve ist
das ein Kolbenweg hinter „Kammer voll", und das Profil kennt die Zeit
dazu. Die Zeiten zählen **ab „Kammer voll"** — in Prozess, Auswahlfeld,
Flussschema und im Text der Prüfregel —, daneben das Δ zwischen erstem und
letztem Anschnitt; ab Kolbenstart stehen sie nur in den Details (Prozess:
„Kammer voll ab Kolbenstart"; Auswahlfeld: „Ankunft ab Kolbenstart").
`state.flowShown` trägt weiter die Zeiten ab Kolbenstart, `state.flowView`
dieselbe Strömung ab „Kammer voll"; die Spanne und damit das Urteil der
Regel bleiben gleich. Der Modus „Prozess" nennt v₂ und die Füllzeit der Kurve
gegen die des Prozesses; „Füllzeit der Kurve übernehmen" setzt sie als
Füllzeit des Prozesses. Das Häkchen „Ankunft nach der Schusskurve" (Prozess,
Details) schaltet auf den konstanten Strom zurück. Ohne Projekt gelten die Vorgabewerte der
Auslegung (HCC-1600, AlSi9Cu3).

## Angussfüllung (`angussfuellung.html`)

Der Angussdesigner sagt mit seiner 1D-Rechnung, WANN die Schmelze an
jedem Anschnitt ankommt — über Verluste je Millimeter Mittellinie. Die
Angussfüllung rechnet es nach: die Schmelze steht beim Start voll im
Pressrest („Kammer voll" auf der DieLogic-Kurve), der Kolben schiebt mit
der Kurve — erst v_krit, dann die Rampe der zweiten Phase —, und die
Front läuft durch die Laufkanäle bis zu den Anschnitten. Ein Knopf, auf
der Grafikkarte Sekunden.

### Bedienung

Vier Modi, von links nach rechts: **System** — das Angusssystem; ein anderes
wählt man oben im Anguss-Chip (Beispiel oder „Angussdatei öffnen …", JSON des
Angussdesigners oder der Werkbank — eine Werkbankdatei bringt ihren Prozess
mit; Ablegen im Bild geht auch). **Prozess** — Legierung, Gussvolumen,
Füllkammerlänge und was die Kurve daraus macht; „Kammer voll" steht hier
einmal mit Zeit, alle anderen Zeiten zählen ab dort. **Simulation** — das
Verfahren (Gitter oder Partikel), Zellkante bzw. Partikelabstand (leer
gelassen gilt der Vorschlag) und eine Zeile, was der Lauf kostet: Zellen oder
Partikel, Speicher, grobe Zeit, WebGPU oder JavaScript. **Ergebnis** — die
Tabelle der Ankunft je Anschnitt, Gitter · Partikel · 1D, darunter „Δ erster –
letzter"; „Bild" wählt, wessen Schmelze zu sehen ist, sobald beide gerechnet
sind; „Zeigen" schaltet beim Gitter zwischen Schmelze und Ankunftsfarben;
Zeitregler mit Abspielen.

„Simulieren" startet den Lauf; währenddessen heißt der Knopf „Abbrechen" — in
jedem Modus — und darunter läuft der Fortschritt. Ein Abbruch erreicht den Kern
im nächsten Schritt; danach gibt es kein Ergebnis dieses Verfahrens (das des
anderen bleibt). Ändern sich System oder Prozess, gehen beide Ergebnisse. Die
Einstellungen (Verfahren, Auflösung, Prozess, Anzeige) werden je Angusssystem
im Browser gemerkt und mit „Zurücksetzen" verworfen. Methode und Grenzen
stehen in der Hilfe (?).

### Das Verfahren

**Lattice-Boltzmann D3Q19 mit freier Oberfläche nach Körner (2005)**
(`js/lbm/`). Nur die Schmelze wird gerechnet, das Gas ist ein Druck; jede
Gitterzelle ist voll, leer oder Front. Frontzellen tragen eine Masse,
die sich aus dem Austausch der Verteilungen mit den Nachbarn ändert;
wird sie größer als die Dichte, ist die Zelle voll, wird sie negativ,
leer — und die Nachbarn rücken als neue Front nach. Verteilungen, die
aus dem Gas kämen, werden aus dem Gleichgewicht zur Gasdichte und der
Geschwindigkeit der Zelle rekonstruiert, ebenso die aus der Richtung der
Oberflächennormalen (Thürey), damit die Front druckfrei bleibt.

Ein Zeitschritt sind fünf Durchgänge über alle Zellen, jeder liest nur,
was der vorige geschrieben hat — deshalb laufen sie auf der GPU zellweise
parallel: strömen und stoßen mit Massenaustausch; markieren (Front →
voll / leer, auch die einsamen Frontzellen ohne Gas- oder ohne
Schmelzenachbarn); Nachbarn (leer neben neu voll wird Front, voll neben
neu leer wird Front, Widersprüche zugunsten voll); anlegen und zählen
(neue Frontzellen aus dem Mittel ihrer Nachbarn, Überschuss der
gewandelten Zellen); anwenden (Flaggen, Überschuss gleichmäßig an die
Front-Nachbarn, Ankunft stempeln). Der Kern existiert zweimal mit
gleichen Puffern und gleicher Reihenfolge: `fslbm.js` in JavaScript —
für die Tests und als Notfall ohne WebGPU — und `gpu.js` in WGSL, aus
denselben Tabellen (`lattice.js`) zusammengesetzt. Fünf Compute-Shader
je Schritt, Kolbengeschwindigkeit und Schrittzähler in einem
Uniform-Puffer mit einem Eintrag je Schritt, 32 Schritte je
Befehlspuffer; gelesen wird nur für ein Bild.

**Stoß**: BGK mit Smagorinsky-Zusatz. Aluminium ist so dünnflüssig,
dass die echte Zähigkeit auf dem Gitter Größenordnungen unter dem
Stabilen läge; τ bleibt deshalb bei 0,51 stehen, und der Wirbelzusatz
macht aus dem Rest ein grobes LES. Kein Schwerefeld (in den
Millisekunden der Füllung fällt die Schmelze keinen Millimeter), keine
Oberflächenspannung, kein Gasdruck. Das ist eine SCHNELLE Rechnung für
Reihenfolge und Zeiten, keine Gießsimulation.

**Der Kolben** ist die unterste Zellschicht des Pressrests, mit
Nichtgleichgewichts-Extrapolation (Guo 2002) als Geschwindigkeitsrand —
das nackte Gleichgewicht war halb Druck-, halb Geschwindigkeitsrand, und
der Zustrom lag zehn Prozent unter dem Soll. **Die Anschnitte** sind die
letzte Zellschicht vor der Austrittsfläche: was ankommt, verlässt den
Anguss; die Schicht davor ist ein Melder, und wer ihn benetzt, hat den
Anschnitt erreicht (atomicMin über den Schrittzähler). Auf grobem Gitter
liegt im Steg womöglich keine Zelle — dann rückt der Auslass
stromaufwärts, bis er eine findet.

**Das Gitter** (`domain.js`) kommt aus Angusskörper und Pressrest, mit
dem Rasterer der Bauteilseiten (`js/part/field.js`) auf einem
gemeinsamen Raster, ein Rand aus Wandzellen um alles. **Die
Einheiten** (`piston.js`): der Zeitschritt folgt aus der schnellsten
Stelle — dem Kolbenstrom durch den kleinsten Laufkanalquerschnitt vor
den Übergängen — mit Gittergeschwindigkeit 0,06; der Steg selbst zählt
nicht, er ist eine Zelle hoch und dort hört die Rechnung auf.

### Grenzen, die man kennen muss

Die Zellkante muss die Kanäle auflösen: unter vier, fünf Zellen über die
Tiefe bremst die Wandhaftung die Strömung weit stärker als in
Wirklichkeit, und die Ankunft wandert nach hinten (das Zwei-Anschnitte-
Beispiel: 13 ms bei 4 mm, 35 ms bei 5 mm, die 1D-Rechnung sagt 16). Der
Vorschlag für die Zellkante zielt auf 400 000 Zellen auf der
Grafikkarte, 120 000 in JavaScript; mehr als 1,5 Millionen (128 MB je
Verteilungspuffer) bzw. 250 000 gehen nicht. Ohne WebGPU (Firefox,
Safari) rechnet JavaScript — Minuten statt Sekunden; die Seite sagt es.

### Anzeige und Zahlen

Die Schmelze als Fläche des halben Füllstands (`js/part/surfacenets.js`)
zur Zeit des Reglers, mit Abspielen, je Ecke nach ihrer Geschwindigkeit
gefärbt (Turbo, Skala in m/s — `js/lbm/paint.js`, siehe unten bei der
Kammerfüllung); der Anguss durchscheinend oder nach der Ankunft der
Front gefärbt (Turbo, nie erreicht grau). Je Anschnitt
die Ankunft der Rechnung neben der 1D-Rechnung, dazu Füllstand am Ende,
Schritte, Zellen, Rechenzeit, Zeitschritt und τ. Die Zeiten zählen ab
„Kammer voll"; die Rechnung endet, wenn alle Anschnitte gemeldet sind
(plus fünf Prozent für das Bild), spätestens am Ende der Kurve oder beim
Dreifachen der 1D-Schätzung.

`tests/web/3d-studio/lbm.test.mjs` prüft das Gitter (Gewichte,
Symmetrie, Gegenrichtungen), den JavaScript-Kern (Masse in der
geschlossenen Box exakt, Zustrom und Frontweg am Kolben, ein ganzer Lauf
auf grobem Gitter bis zur Ankunft), Gitterbau, Kolben und Einheiten, und
für die Kammer Füllstand, Gitter, Ruhe unter Schwerkraft und den
wandernden Kolben; `tools/angussfuellung.test.mjs` und
`tools/kammerfuellung.test.mjs` fahren beide Verfahren ohne WebGPU durch. Der WGSL-Kern wurde
im kopflosen Chromium mit WebGPU (SwiftShader-Vulkan) gegen den
JavaScript-Kern auf demselben Gitter geprüft: gleiche Ankünfte auf
wenige Prozent, gleicher Füllstand.

## Kammerfüllung (`kammerfuellung.html`)

Dasselbe Verfahren wie in der Angussfüllung, angewandt auf die
Füllkammer — den liegenden Zylinder, in dem die Schmelze vor dem Schuss
ruhig unten steht und die Welle entsteht, um die es in der ersten Phase
geht. Durchmesser, Länge und Füllgrad wählen (der Stand der Schmelze
folgt aus dem Kreissegment, `fillLevel` in `js/lbm/sleeve.js`), dazu den
Laufkanal oben in der Stirnfläche (Breite × Tiefe) und die Schusskurve:
die DieLogic-Kurve des Projekts, mit Kolben-Ø, Länge und Füllgrad von
hier — die Massen werden so gesetzt, dass die Kurve den gewählten
Füllgrad rechnet —, oder zweistufig v₁/v₂ mit einer Beschleunigung.
Ein Knopf; die Rechnung beginnt beim Kolbenstart und endet, wenn die
Schmelze den Laufkanal erreicht (plus ein Stück für das Bild), spätestens
am Ende der Kurve.

### Bedienung

Vier Modi: **Kammer** (Durchmesser, Länge, Füllgrad, Laufkanal Breite × Tiefe
— die ruhende Schmelze steht bis zum Spiegel im Bild), **Kurve** (DieLogic
oder v₁ / v₂ mit Beschleunigung, Legierung, die Kennzahlen der Kurve),
**Simulation** (Verfahren, Zellkante bzw. Partikelabstand — das Metamodell
hat keine —, Aufwand) und **Ergebnis** (Kammer voll und Kolbenweg, Luft
höchstens und am Ende — Modell · Gitter · Partikel · Kurve nebeneinander).
**Simulieren** steht dabei in JEDEM Modus unten im Streifen des Rahmens,
und darunter der **Zeitregler**: der Lauf gehört zum Werkzeug, nicht zu
einem Reiter — wer an der Kammer oder der Kurve dreht, rechnet gleich dort
neu und sieht das gerechnete Bild dabei (`shell.setActionsExtra`). Der
Kolben fährt mit dem Regler, in jedem Modus. Der Streifen STEHT: Regler,
Fortschritt und Zustandszeile halten ihre Höhe frei, auch wenn sie nichts
zeigen (`.st-actions.steady`), sonst schöbe jeder Lauf den Hauptknopf nach
oben. Was das Bild gerade zeigt — Zeit, Kolbenweg, eingeschlossene Luft —
steht unten links IM Viewport (`shell.status`), neben der Welle und nicht
in der Seitenleiste. Neue Maße setzen die Auflösung
auf den Vorschlag zurück. Abbrechen,
Ergebnisse und gemerkte Einstellungen wie bei der Angussfüllung; die
Vorgaben stehen an EINER Stelle (`DEFAULTS` in `js/simulation/kammer.js`),
v₁ = 0,5 m/s.

Zwei Dinge brauchte der Kern dafür (`js/lbm/fslbm.js`, `gpu.js`, in
beiden gleich):

- **Schwerkraft** als Volumenkraft nach Guo (2002): die Geschwindigkeit
  um die halbe Kraft verschoben, ein Quellterm im Stoß; g in
  Gittereinheiten ist g·Δt²/Δx. Der Start ist hydrostatisch
  (`hydrostatic`: ρ = 1 + 3·g·Tiefe), damit die Schmelze unter
  Schwerkraft still steht statt sich erst zusammenzudrücken — die Tests
  prüfen, dass der Spiegel dreihundert Schritte lang bleibt.
- **Ein wandernder Kolben**: vor jedem Schritt wird die Zellschicht
  `ip` (aus dem Kolbenweg der Kurve) zum Kolben — Einlass, wo Schmelze
  an ihr steht, Wand darüber (eine Kolbenfläche über dem Spiegel darf
  keine Quelle sein, sonst tränkt sie die Luft daneben) —, alles davor zu
  Stahl. Was der Kolben überfährt, hat er vorher als Zustrom
  eingeschoben; die Masse geht im Mittel auf.

Dabei fiel ein Fehler beider Kerne auf: Durchgang 1 las Füllstand,
Dichte und Geschwindigkeit der Nachbarn und schrieb dieselben Felder
für die eigene Zelle in denselben Puffer — in JavaScript sah eine
spätere Zelle schon neue Werte, auf der GPU je nach Thread alte oder
neue, und beide Kerne liefen in der Kammer weit auseinander (im Anguss
war es kaum aufgefallen). Die Zellwerte liegen seitdem doppelt vor;
Durchgang 1 liest den alten Satz und schreibt den neuen. Danach stimmen
beide Kerne im kopflosen Chromium mit WebGPU auf dieselbe Kammer-voll-
Zeit (92 gegen 94 ms bei 113 ms der Kurve) und dieselbe Luft überein.

**Eingeschlossene Luft** (`enclosedGas`): Gaszellen, die nicht mit der
größten Luftblase zusammenhängen — je Bild gezählt, als Höchstwert über
den Lauf und am Ende ausgewiesen. Es gibt keinen Gasdruck und keine
Oberflächenspannung; eine Welle, die überschlägt, schließt in dieser
Rechnung Luft ein, ob sie im echten Schuss entweicht, sagt sie nicht.
Der Zeitschritt folgt aus der doppelten Kolbengeschwindigkeit (die
Welle ist nicht viel schneller als der Kolben) — der Laufkanal wird
schneller, dort klemmt der Kern die Geschwindigkeit; die erste Phase
dauert deshalb je nach v₂ Zehntausende Schritte. Der Vorschlag für die
Zellkante zielt auf 150 000 Zellen auf der Grafikkarte (dreißig Zellen
über den Durchmesser bei 90 mm), 30 000 in JavaScript.

**Die Schmelze nach Geschwindigkeit** (`js/lbm/paint.js`, in beiden
Seiten): jedes Bild des Laufs trägt neben dem Füllstand den Betrag der
Geschwindigkeit je Schmelzezelle — als Byte auf das Maximum des Bildes
bezogen, so bleibt ein Bild zwei Byte je Zelle, und die Skala muss beim
Rechnen noch nicht bekannt sein (`readVelocity` im GPU-Kern,
`velocity()` im JavaScript-Kern, `speedBytes` in `run.js`). Die Fläche
bekommt je Ecke die Geschwindigkeit der acht umliegenden Gitterpunkte,
trilinear gewichtet, Gaszellen ausgenommen — und zwar die **schnellste
Schmelze im Umkreis einer Zelle** (Maximumfilter 3×3×3, `dilate`): an
der Wand haftet die Schmelze, und im vollen Kanal ist die Wand die
sichtbare Fläche; mit der Geschwindigkeit der Ecke selbst bliebe der
Anguss einfarbig blau, wie schnell er innen auch fließt. Die Skala gilt für den
ganzen Lauf, damit die Bilder vergleichbar bleiben; ihr Ende ist das
99. Perzentil (`speedScale`) über die Bilder **bis zur ersten Ankunft**
— im Anguss am ersten Anschnitt, in der Kammer am Laufkanal. Nicht das
Maximum (das wären die paar Zellen an der Engstelle) und nicht die
Bilder danach: dann herrschen Anschnitte bzw. Laufkanal mit dem Zehn-
fachen, und der ganze Weg davor wäre einfarbig blau. Was schneller ist,
bleibt rot; die Leiste sagt es.

## Das Verfahren „Partikel" (SPH)

Dieselben zwei Fragen, mit Partikeln statt Gitter: **schwach kompressible
SPH** (WCSPH nach Monaghan) in `js/sph/`. Beide Werkzeuge rechnen damit, wenn
unter „Simulation" „Partikel" gewählt ist (oder die Seite mit `?engine=sph`
geöffnet wird); der Regler heißt dann **Partikelabstand** statt Zellkante.
Die alten Adressen `…-sph.html` leiten dorthin weiter.

- `wcsph.js` — der JavaScript-Kern: Tait-Druck (p = B((ρ/ρ0)⁷ − 1), B =
  ρ0c0²/7, negative Drücke gekappt), Druckkraft und künstliche Zähigkeit
  (α = 0,1), die Dichte aus der Kontinuitätsgleichung mit δ-Diffusion
  (δ = 0,1); Wendland-C2-Kern (`kernel.js`, Träger 2h, h = 1,2 d);
  Nachbarn über ein Gitter mit Zellkante 2h (`grid.js`). Die Dichte
  kommt NICHT aus der Summe über die Nachbarn: an Wand und Oberfläche
  fehlt der Summe der halbe Träger. Und die δ-Diffusion ist Pflicht:
  ohne sie treibt die Dichte in Ruhe binnen Hunderten Schritten um zehn
  Prozent davon, mit ihr findet sie zu ρ0 zurück — der Vergleich steht
  im Kopf der Datei. XSPH ist aus (bewegt die Partikel mit einer
  anderen Geschwindigkeit als der, die die Kontinuität sieht).
- **Wände sind Abstandsfelder, keine Partikel**: wer näher als d/2 an
  die Wand kommt, wird zurückgesetzt und verliert die Geschwindigkeit
  in die Wand — Gleiten, keine Haftung. Das ist der Preis gegenüber der
  Gitterrechnung, die haftet; im Anguss kommt die Partikelfront deshalb
  eher früher an. Für die Kammer ist das Feld analytisch (Zylinder,
  Kolbenebene, Stirnwand mit dem Laufkanal als Loch). Für den Anguss
  kommt es aus dem **Rollenraster** der Gitterseite (`js/lbm/domain.js`,
  auf dem Partikelabstand, mindestens 2 mm): eine exakte euklidische
  Abstandstransformation über die Nichtwandzellen
  (`signedDistanceFromFlags` in `domain.js`, Felzenszwalb–Huttenlocher,
  drei Durchgänge je Achse), die Fläche eine halbe Zelle vor der Wand.
  Nicht aus den Körpern: der Anguss ist am Pressrestmantel gekappt, und
  das Minimum zweier Körperfelder hätte auf dieser Kappfläche den
  Abstand null — eine unsichtbare Wand genau an der Mündung, die
  Schmelze käme nie in den Anguss (so war es zuerst).
- **Kolben**: in der Kammer eine Ebene, die die Kurve fährt (Partikel
  dahinter werden vor sie gesetzt und bekommen ihre Geschwindigkeit).
  Im Anguss steht hinter dem Pressrest die **Säule des Zustroms**: so
  lang wie der Kolbenweg des Laufs, Partikel, die starr mit der
  Kolbengeschwindigkeit fahren und jenseits der Einlassebene zu
  Schmelze werden — die Füllkammer, ohne dass der Pressrest je leer
  wird. Sie tragen den Druck des Schmelzepartikels, auf das sie wirken
  (gespiegelt, wie Wandpartikel nach Adami): mit Druck null schöbe die
  Schmelze vor ihnen stärker als sie selbst, und der Pressrest liefe
  rückwärts in die Säule statt in den Anguss — auch das war zuerst so.
  Dazu hält die Einlassebene die Schmelze wie die Kolbenebene der
  Kammer. **Auslass und Melder** je Anschnitt liegen dort, wo ein
  Partikel noch hinkommt (`gateZones`): Steg und Übergang sind zwei bis
  wenige Millimeter tief, da passt kein Partikel von d/2 Radius hinein
  — die Front bliebe davor stehen, meldete nie, und der Anguss wäre für
  die Partikel eine Sackgasse mit Druckstau. Je Anschnitt wird die
  vorderste Zelle vor ihm gesucht, die tief genug im Feld liegt; die
  letzte halbe Weite davor ist der Auslass, die zwei Abstände davor der
  Melder. Die Ankunft ist also die am Übergang zum Anschnitt, ein paar
  Millimeter vor der des Gitters; feinere Partikel rücken sie näher
  heran. Der Auslass ist **gedrosselt**: ab seiner Ankunft lässt er je
  Meter Kolbenweg nur so viele Partikel hinaus, wie sein Flächenanteil
  am Kolbenstrom trägt (`gateRate` = Anteil · Kolbenfläche / d³; im
  GPU-Kern je Anschnitt drei Worte: Ankunftsschritt, Kolbenweg bei
  Ankunft, Hinausgelassene). Ein freier Auslass war ein Abfluss ohne
  Widerstand: der zuerst erreichte Anschnitt zog alles, und beim
  Beispiel „zwei" — dessen linker Ast ein flacher Fächer ist, in den
  kein 5-mm-Partikel passt — entleerte sich der Anguss an der Mündung
  des Fächers, und der zweite Anschnitt wurde nie erreicht.
- **Auflösung**: ein Kanal braucht wenigstens vier Partikel über seine
  Tiefe. Mit fünf Millimetern im Beispiel „zwei" (Kanäle 12 mm tief)
  passen ein bis zwei Reihen hinein, und die Front klemmt dreißig
  Millimeter vor den Anschnitten — nicht am Verfahren, an der Packung:
  zwei Reihen Kugeln fließen nicht wie eine Flüssigkeit. Der Vorschlag
  der Seite (40 000 Partikel auf der Grafikkarte) liegt bei zwei
  Millimetern; in JavaScript (2 500 Partikel) reicht es nur für grobe
  Bilder, nicht für Ankunftszeiten.
- **Schall und Zeitschritt**: c0 = 10 · Bezugsgeschwindigkeit (Kammer:
  die größte Kolbengeschwindigkeit; Anguss: der Kolbenstrom durch den
  kleinsten Laufkanalquerschnitt, wie bei der Gitterrechnung), dt =
  0,25 · h/(c0 + v); die Geschwindigkeit ist auf c0/2 geklemmt. Die
  Kammer kommt vor dem Start **zur Ruhe** (20 ms mit hoher Zähigkeit,
  dann v = 0) — die hydrostatische Vorgabe passt an der freien
  Oberfläche nie ganz, und der Schwapp davon soll nicht in die Welle.
- `gpu.js` — derselbe Kern in WGSL: je Schritt das Suchgitter leeren,
  einsortieren (je Zelle ein Zähler und 48 feste Fächer, kein Sortieren),
  dann ein Durchgang mit Druck der Nachbarn aus deren Dichte, Kräften,
  Kontinuität, Wänden, Auslass und Meldern; Ort und Geschwindigkeit
  doppelt gepuffert. Acht Speicherpuffer — mehr erlaubt WebGPU je
  Shader nicht, darum Zähler und Fächer in einem und Rolle und Melder
  in einem Wort. Ohne WebGPU rechnet `wcsph.js` mit wenigen Partikeln.
- **Bilder** (`run.js`): je Bild die Orte der Schmelzepartikel (mm) und
  der Betrag der Geschwindigkeit als Byte auf das Maximum des Bildes —
  wie bei der Gitterrechnung. `points.js` zeichnet sie als beleuchtete
  Kugeln vom Partikelabstand (Punkt-Sprites), nach Geschwindigkeit auf
  derselben Turbo-Skala wie die Fläche der Gitterseiten (99. Perzentil
  bis zur ersten Ankunft). **Eingeschlossene Luft** der Kammer: das
  Partikelbild auf ein Raster von 1,5 d gelegt, belegte Zellen sind
  Schmelze, dann `enclosedGas` aus `js/lbm/sleeve.js`; der Füllgrad des
  Angusses ebenso über die belegten Angusszellen des Rollenrasters.

Zum Vergleich, im kopflosen Chromium mit WebGPU (SwiftShader): die
Kammer Ø 60 × 200 mm, 45 %, v₁/v₂ 0,6/2 m/s, 3 mm Partikel — Kammer
voll bei 190 ms und 113 mm (Kurve 186 ms, 110 mm; Gitter 3 mm: 179 ms,
106 mm). Das Beispiel „zwei" mit 4 mm Partikeln — Anschnitte bei 27 und
32 ms (Gitter 5 mm: 34,6 und 33,3 ms; 1D 15,6 ms); beide Kerne stimmen
auf demselben Partikelsatz Schritt für Schritt überein, bis die
Dynamik nach den ersten Umwandlungen auseinanderläuft (Millimeter nach
600 Schritten — dieselbe Physik, andere Rundung).

`tests/web/3d-studio/sph.test.mjs` prüft Kern (Normierung), Kammer
(Ruhe unter Schwerkraft, Kolben bis Kammer voll, Luft), Anguss
(Partikelsatz, Säule, Abstandsfeld, Melderzonen, Drossel, erste
Schritte) und Bilder; `tools/angussfuellung.test.mjs` und
`tools/kammerfuellung.test.mjs` fahren beide Verfahren ohne WebGPU durch
(grob und kurz — Bilder, keine Ankunftszeiten).

## Das Verfahren „Metamodell" (`js/meta/`, nur Kammerfüllung)

Kein Löser, sondern ein **trainiertes Modell**: ein Netz, das in
`~/DieLogic_OF/incompressible/metamodel` aus über tausend
OpenFOAM-Rechnungen derselben Kammer gelernt hat, wie die Welle aussieht
(Sobol-Plan über λ = Länge/Durchmesser 5 … 20, Füllgrad 0,3 … 0,7,
Durchmesser 60 … 300 mm, dazu eine Familie von Schusskurven bis knapp über
die kritische Geschwindigkeit). Es liegt als ONNX in `models/` (12 MB, dazu
die Beilage `.json` mit Eingabekonvention, Zellflächen und Zellmitten) und
rechnet mit onnxruntime-web in WebAssembly — auch ohne Grafikkarte, für die
Vorgabekammer in rund **drei Sekunden** statt Minuten.

- **Eingabe** je Kolbenstellung: λ, Füllgrad, log₁₀ D, die Stellung s ∈ [0, 1]
  und die Schusskurve als Froude-Zahl Fr(s) = v/√(gD) auf 64 Punkten (aus
  demselben Profil, das Gitter und Partikel fahren). **Ausgabe** je
  Kammerschicht das 30 × 30 Bild des Querschnitts: Schmelzeanteil,
  Geschwindigkeit (in √(gD)) und Druck. 101 Stellungen in Paketen zu sechs,
  mit Atempausen und Abbruch dazwischen (`js/meta/model.js`).
- **Keine Auflösung.** Das Gitter ist das der Rechnungen — ein O-Gitter mit
  Kernblock und vier Ringblöcken, eine Schicht D · 3/30 hoch. Die Zeile
  „Zellkante" verschwindet für dieses Verfahren, und `estimate()` sagt
  stattdessen, was das Gitter IST.
- **Die Fläche** entsteht direkt auf diesem Gitter (`js/meta/ogrid.js`, aus
  der Standalone-Seite des Modells übernommen): Surface Nets auf den
  Dualzellen der Zellmitten, die vier Diagonalnähte der Ringblöcke als eigene
  Dualzellen ergänzt, Wand, Kolben und Stirnplatte durch gespiegelte
  Geisterknoten geschlossen — geprüft geschlossen und orientiert, eingeschlossenes
  Volumen = Zellvolumen ± 2 %.
- **Eingeschlossene Luft** wird gezählt wie beim Gitter (`js/meta/air.js`):
  zusammenhängende Lufträume, alles außer dem größten ist eingeschlossen. Nur
  zählt hier das Volumen statt der Zellzahl (die Zellen sind verschieden groß)
  und die Schichthöhe stauchen sich mit dem Kolben.
- **Grenzen.** Außerhalb der Trainingsbox rechnet es nicht: der Knopf bleibt
  aus und sagt, welche Größe wie weit daneben liegt. Der **Laufkanal** geht
  nicht ein — alle Rechnungen hatten dasselbe Auslassfenster in der
  Stirnplatte (Sehne bei 0,42 R), „Kammer voll" heißt hier, die Schmelze
  erreicht dieses Fenster; Breite und Tiefe gelten für Gitter und Partikel.
  Und es kennt keine Legierung: gerechnet wurde dimensionslos.
- Geprüft im Browser, nicht unter Node: `tests/browser/studio.spec.mjs`
  („das Metamodell rechnet die Welle in Sekunden"). Die Node-Tests prüfen
  seine Wahl, das fehlende Feld und seine Grenzen.

## Drei Verfahren, ein Werkzeug (`js/simulation/`)

`engines/lbm.js`, `engines/sph.js` und `engines/meta.js` haben dieselbe
Gestalt — `label`, `cellLabel` (null: keine Auflösung), `suggest(problem)`,
`estimate(problem, cell)`, `run(problem, { cell, signal, progress })`,
`createDisplay()` — und wickeln die unveränderten Kerne bzw. das Modell ein;
das Werkzeug weiß nie, welches Verfahren es fährt. Welche zur Wahl stehen,
sagt `engineIds(kind)`: das Metamodell kennt nur die Kammer (`kinds`). Die
Reihenfolge dieser Liste ist die der Schalter und der Tabellenspalten, und ihr
erstes Verfahren ist die **Vorgabe** — für die Kammerfüllung das Metamodell,
für die Angussfüllung das Gitter.
`core.js` hält, was beiden Werkzeugen gemeinsam ist: den Schalter, den Lauf als
Arbeit des Rahmens (`host.jobs`), je Verfahren ein Ergebnis zum selben Problem
und das Bild. **Der Hauptknopf steht in jedem Modus**, und der Zeitregler
darunter im Streifen des Rahmens (`shell.setActionsExtra`) statt im Modus
„Ergebnis" — die Kammerfüllung zeigt ihr gerechnetes Bild deshalb überall
(`resultEverywhere: true`), die Angussfüllung behält es bei „Ergebnis", wo auch die
Ankunftsfarben wohnen. Der Abbruch erreicht den Kern im nächsten Schritt: die
Laufschleifen fragen je Schritt nach der Kolbengeschwindigkeit, dort wirft der
Adapter. In der Kammer fährt der Adapter das Zur-Ruhe-Kommen der Partikel
selbst, mit Atempausen — `settle()` liefe am Stück. `engines/env.js` fragt
einmal beim Start, ob WebGPU wirklich einen Adapter herausgibt (sonst gilt der
Vorschlag für JavaScript), merkt sich das gemessene Tempo je Gerät und schätzt
die Laufzeit.

In JavaScript rechnen die Laufschleifen (`js/lbm/run.js`, `js/sph/run.js`) je
40 ms und holen dann ein Bild lang Luft, damit die Seite nicht steht. Bis
2026-09-19 stellten sie danach ihre Uhr nicht zurück und warteten ab den
ersten 40 ms nach JEDEM Schritt auf das nächste Bild: ein Gitterlauf der
Angussfüllung („zwei", 6 mm, 4 163 Schritte) dauerte in Firefox 66–75 s, seit
der Korrektur 14 s — dieselben Schritte, dasselbe Ergebnis.

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

Die Seite läuft im gemeinsamen Rahmen (`js/studio/`, siehe unten): das
**Setzen** sitzt als vier Chips über dem Bild (Bohne · mit Entlüftung ·
Waschbrett · Schlitz), das **Bearbeiten** im Auswahlfeld daneben, die
Seitenleiste hat zwei Modi — *Elemente* (was gesetzt ist, ein Klick wählt
es; der Reiter zählt mit) und *Volumen*. Körper und Griffe sind
der Plan selbst und stehen in jedem Modus im Bild.

Das Bauteil (über den Bauteil-Chip der Kopfzeile: Beispielteil oder eigene
STL/GLB) steht deckend im Viewport — hier wird auf die Wand geklickt, und
die soll aussehen wie eine Wand; „Deckkraft Bauteil" unter *Darstellung ▾*
macht sie durchscheinend. **Einen Chip wählen und auf das Bauteil
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
- jedes **Maß** der Art steht im Auswahlfeld, in Gruppen (Steg · Bohne ·
  Vorkammer · Kanal · Details), von denen immer EINE offen steht — so
  scrollt das Feld nie, gleich welche Art gewählt ist; die Art lässt sich
  wechseln, Maße, die beide Arten haben, bleiben dabei;
- **Entf** entfernt die Auswahl ohne Nachfrage — ein Toast nennt, was weg
  ist, und bietet „Rückgängig"; **Strg+Z / Strg+Y** gehen durch den ganzen
  Verlauf. Ein Zug am Griff ist EIN Schritt, ein Dreh am Regler auch.

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

Der Modus *Volumen* nennt, worum es geht: das **Volumen des Bauteils**,
das der **Überläufe** und die **Summe** — das ist das Gussvolumen, das der
Angussdesigner unter „Prozess" braucht. Eine Prüfliste gibt es hier nicht;
das Auswahlfeld nennt unter „Details" Volumen, Steg- und Kanalquerschnitt
und die Achse des Elements.

Ein Element sitzt auf der Wand EINES Bauteils: ein neues Bauteil beginnt mit
einem leeren Plan. Der bisherige geht dabei nicht verloren — der Browser
hebt je Bauteil einen **Entwurf** auf und bietet ihn beim nächsten Mal an
(nie still übernommen); solange der Plan in keiner Datei steht, ist
„Speichern" der gefüllte Knopf, und die Seite fragt vor dem Verlassen.

- **Speichern** (JSON) — der Plan: je Element Art, Ort, Achse, Drehung, Maße, beim
  Überlauf mit Entlüftung dazu die Kanalpunkte in der Wandebene
  (`dielogic-luft`, Fassung 3; eine Datei der Fassung 2 mit bloßer
  Kanallänge wird zu einem Punkt in Längsrichtung).
- **Exportieren ▾ → Körper als STL** — die Körper aller Elemente.

Die Griffe (`js/handles.js`) sind dieselben wie im Angussdesigner: was
ein Griff ist, sagt jede Seite selbst (Ort, Farbe, Richtung, Ebene), wie
er gezeichnet, gezogen und gezielt wird, steht einmal.

## Temperierkanal-Designer (`temperier.html`)

Die dritte Seite, die Geometrie erzeugt: Kühlstiche und Kanäle um das
Bauteil. Was bei der Temperierung zählt, ist der Abstand zur Kavität — zu
nah heißt Durchbruchgefahr und Risse, zu weit heißt, die Kühlung greift
nicht. Deshalb werden die Elemente auf der **Abstandsfläche** gesetzt: der
Fläche gleichen Abstands (voreingestellt 20 mm) aus dem Abstandsfeld des
Gastgebers (`host.field`, `js/part/field.js`, `js/part/surfacenets.js`).

### Modi

Die Seite läuft im gemeinsamen Rahmen (`js/studio/`, Werkzeug
`js/cooling/tool.js`): das Setzen sitzt als zwei Chips über dem Bild
(Kühlstich · Kanal (2 Punkte)), das Bearbeiten im Auswahlfeld daneben, die
Seitenleiste hat drei Modi:

- *Fläche* — die Abstandsfläche: **Achsabstand zur Kavität** (5–60 mm),
  **Zellkante** in mm (Vorgabe ein 64stel der längsten Bauteilkante — hier
  zählt die Fläche außen, nicht die Wand innen; ein selbst gesetzter Wert
  bleibt auch für das nächste Bauteil), **Mindest-Wandabstand** mit „Auto"
  (siehe unten); zugeklappt das Raster. Der Reiter heißt kurz „Fläche",
  sonst passen die vier nicht in eine Zeile.
- *Setzen* — Richtung, Vorgaben für neue Elemente (Kühlstich Ø × Länge,
  Kanal Ø) und die Automatik; Hauptknopf „Kühlstiche automatisch setzen".
  Hier beginnt die Seite.
- *Prüfung* — Kennzahlen mit Urteil und die Liste derer unter dem
  Mindest-Wandabstand.

Die Fläche wird beim Laden des Bauteils gerechnet — als Rechnung mit
Fortschritt; der Hauptknopf heißt solange „Abbrechen", ein neues Bauteil
bricht eine laufende ab und beginnt von vorn. Ein Achsabstand innerhalb des
gerechneten Bandes kostet nur das Ableiten, ein größerer oder eine andere
Zellkante ein neues Feld, sobald der Regler steht. Was absehbar länger als
20 s dauert (Aufwand ≈ Dreiecke × (2·Band/Zellkante + 1)³ × 17 ns, gemessen
am Getriebedeckel: 6,5 mm 1,5 s, 3 mm 10 s, 2 mm 33 s), beginnt nicht von
selbst: die Zeile am Knopf nennt die Dauer, „Abstandsfläche berechnen"
startet. Nach einem Abbruch bleibt die vorige Fläche stehen und gilt als
veraltet.

Die Fläche gehört den Modi „Fläche" und „Setzen" (auf ihr wird gezielt — ein
Chip oder der Pfeil aus einem anderen Modus führt nach „Setzen"); Bauteil
und Bohrungen stehen in jedem Modus. Unter *Darstellung ▾*: „Deckkraft
Bauteil" und „Abstandsfläche durchscheinend" — abgewählt ist sie deckend und
zeigt ihre Form, wo sie eng wird und wo sie Rippen nachzeichnet, und die
Stiche und Kanäle davor. „Einpassen" (F) nimmt Bauteil, Bohrungen und die
sichtbare Fläche.

### Kühlstiche und Kanäle

- **Kühlstich** — Chip, dann ein Klick auf die Abstandsfläche. Die Spitze
  sitzt am Punkt, der Stich läuft um seine **Länge** vom Bauteil weg, mit
  seinem **Durchmesser** (Vorgaben 20 × 200 mm); die Spitze ist eine
  Halbkugel wie das Ende eines Bohrers. Die **Richtung** wählt man vorher:
  Normale (senkrecht zur Fläche, nach außen), Blick (auf die Kamera zu) oder
  X, Y, Z, jeweils mit dem Vorzeichen vom Bauteil weg. Der Pfeil am Stich
  setzt ihn neu.
- **Kanal (2 Punkte)** — zwei Klicks, ein Ende hier, das andere dort; Esc
  dazwischen bricht ab.

Danach werden die Enden **frei im Raum** bewegt: das gewählte Ende trägt
drei **Achsenpfeile** (X rot, Y grün, Z blau; `js/handles.js`) und bewegt
sich am Pfeil genau entlang dieser Achse, am Punkt selbst gezogen in der
Bildebene. „Beide Enden bewegen" nimmt beim Kanal das andere Ende mit. Das
Auswahlfeld zeigt oben das Urteil über den Wandabstand, darunter zwei
Reiter: *Maße* (Ø, beim Kühlstich Länge und Richtung, Lage, beim Kanal
„Beide Enden bewegen") und *Details* (Länge, Wasserinhalt,
Mindest-Wandabstand). **Entf** entfernt ohne Nachfrage, ein Toast bietet
„Rückgängig"; **Strg+Z / Strg+Y** gehen durch den Verlauf. Ein Zug am Griff
ist EIN Schritt, der Achsabstand-Regler auch.

### Mindest-Wandabstand und Prüfung

Der **Wandabstand** eines Elements ist der kleinste Abstand der
Bohrungswand zur Kavität: der Feldwert entlang der Achse abgetastet, minus
Radius (`wallClearance`, `js/cooling/geom.js`). Geprüft wird er gegen den
**Mindest-Wandabstand**. Mit „Auto" ist das Achsabstand − Ø/2 der dicksten
Vorgabe, mindestens 1 mm (`autoMinWall`, `js/cooling/model.js`): eine
Bohrung mit Vorgabemaßen, deren Achse auf der Fläche sitzt, hält ihn gerade
ein. (Früher wurde gegen „Abstand − Zellkante" geprüft — jede Bohrung, die
das Werkzeug mit seinen eigenen Vorgaben setzte, warnte.) Um ein Viertel der
Zellkante darf ein Wert darunter liegen, so genau ist das Feld. Urteile
(`wallVerdict`): eingehalten · unter dem Mindest-Wandabstand · Durchbruch
(die Bohrung schneidet das Bauteil). Wer darunter liegt, steht in der
Warnfarbe im Bild — in jedem Modus, auch während man zieht; der Reiter
„Prüfung" zählt sie, ihre Liste (das engste zuerst) wählt per Klick und holt
das Element ins Bild (beim Kanal das Ende näher an der Kavität). Ohne Haken
„Auto" gehört der Wert dem Plan.

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
**Stichabstand min.** an einer gesetzten Bohrung scheiden aus — nie enger als
1,5 × Ø, zwei Bohrungen, die sich berühren, sind eine; die Vorgabe steht
deshalb auf 30 mm, und liegt der Regler darunter, sagt die Zeile unter dem
Knopf, womit gerechnet wird. Die Richtung folgt der Wahl unter „Richtung";
bei „Normale" ist es der Feldgradient an der Stelle — dann kann ein Stich
durch eine Tasche des Bauteils laufen; die Prüfung zeigt es. Die Zeile nennt
auch, wie viele gesetzt wurden und ob automatische zu nah stehen; „Letzter
Lauf der Automatik" (Prüfung, zugeklappt) nennt den gewichteten mittleren
und den größten Abstand einer Bauteilzelle zur nächsten Bohrung. Automatisch
gesetzte Stiche sind markiert; der nächste Lauf ersetzt sie (abschaltbar),
von Hand gesetzte bleiben. Ein Lauf ist ein Schritt im Verlauf.

### Dateien

**Speichern**: JSON `dielogic-temperier`, Fassung 1 — Achsabstand und
Elemente, dazu ein selbst eingetragener Mindest-Wandabstand als optionaler
Schlüssel `minWall` (fehlt er, gilt Auto; ältere Dateien laden unverändert).
**Exportieren ▾ → Bohrungen als STL**. Solange nichts gespeichert ist, hebt
der Browser einen Entwurf je Bauteil auf und bietet ihn beim nächsten Mal
an; ein neues Bauteil beginnt mit leerem Plan, Achsabstand und ein eigener
Mindest-Wandabstand bleiben.

## Füllabschätzung (`fuellung.html`)

Die vierte Frage an das Bauteil: **in welcher Reihenfolge füllt es sich?**
Eine Füllsimulation braucht ein Volumennetz und Minuten; diese Seite
braucht eine Sekunde und beantwortet den Teil der Frage, der von der
Geometrie abhängt — wo die Front zuerst hinkommt, wo zuletzt, und wie
sich mehrere Anschnitte das Volumen teilen. Trägheit, Strahlbildung,
Gegendruck der Luft und Erstarrung während der Füllung sind nicht drin;
das steht auch auf der Seite.

### Raster und Anschnitte

Die Seite läuft im gemeinsamen Rahmen (`js/studio/`, siehe unten) mit drei
Modi in Arbeitsreihenfolge: *Anschnitte* · *Füllung* · *Ergebnis*. Anschnitte und ihre Griffe sind der Plan selbst und stehen in
jedem Modus im Bild; das Bild der Füllung gehört dem Modus *Ergebnis*.

**Anschnitte** sind Rechtecke auf der Wand (`js/fill/model.js`): der Chip
„Anschnitt setzen" über dem Bild, dann ein Klick aufs Bauteil — Ort ist der
getroffene Punkt, die Hochachse die nach außen gerichtete Flächennormale,
das Rechteck liegt in der Wandebene mit **Breite** quer und **Höhe** längs.
Die Vorgaben für neue Anschnitte stehen im Modus *Anschnitte*, darunter die
Liste des Gesetzten (Maße, Anteil am Strom, nach dem Rechnen „füllt … %";
ein Klick wählt). Bearbeitet wird im Auswahlfeld neben dem Bild, in drei
Gruppen: *Maße* (Breite, Höhe, **Anteil** — leer heißt „aus der Fläche",
der Platzhalter nennt den Wert), *Lage* (x/y/z, Drehung um die Normale) und
*Details*; darunter „füllt … % des Volumens" und Entfernen. Ziehen am Punkt
verschiebt in der Wandebene (ein Zug ist ein Schritt), der Pfeil setzt neu —
dieselben Griffe wie im Anguss- und Überlaufdesigner (`js/handles.js`).
Entf entfernt ohne Nachfrage, der Toast und Strg+Z holen zurück.

Das **Raster** ist das Abstandsfeld des Gastgebers (`host.field`,
`js/part/field.js`) — eng um das Bauteil, zwei Zellen Rand, vollständiger
Kern. Wie fein, sagt die **Zellkante** in Millimetern (Vorschlag beim Laden:
halbe Wanddicke 2 V/A; eine eigene gilt, bis man sie ändert). Gerastert wird
beim ersten **Rechnen** im Modus *Füllung*, zusammen mit der Front — eine
Rechnung mit Fortschritt, der Knopf heißt solange **Abbrechen**, und der
Abbruch reicht in Raster und Frontausbreitung hinein. Eine andere Zellkante
macht daraus **Neu rastern**; bis dahin zeigt das Bild das vorige Raster.
Mehr als 16 Mio. Rasterpunkte gibt es nicht — die Zeile unter dem Feld sagt
schon beim Eintippen, mit welcher Kante dann gerastert wird. Was das Raster
kostet (Raster, Rasterpunkte, Speicher, Zellen, Rechenzeiten), steht
zugeklappt unter „Raster".

Im Modus *Füllung* stehen die Kennzahlen mit Urteil: **längster Fließweg**,
**Wanddicke 2 V/A** und **Fließweg / Wanddicke** (über etwa 300 : 1 gelb);
nicht erreichte Zellen (abgetrennter Bereich) rot. Nach dem ersten Lauf
rechnet jede Änderung am Plan von selbst nach — nach einem Abbruch wieder
erst auf Knopfdruck.

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
ersten „Rechnen" rechnet jede Änderung am Plan von selbst nach — ohne
Schleier über dem Bild, sie dauert Zehntelsekunden.

### Drei Ansichten

Im Modus *Ergebnis*; voreingestellt ist der **Füllkörper bei 50 %** — die
Front mitten im Teil sagt auf einen Blick, wohin die Schmelze zuerst kommt.

- **Füllgrad** — das Bauteil nach Füllgrad gefärbt (Turbo: früh blau, spät
  rot; der Wert an der Oberfläche kommt aus den Innenzellen daneben). Was
  über dem Regler **Füllgrad** liegt, bleibt grau: so wandert die Front mit
  dem Regler über die Oberfläche. Die Skala steht unten rechts.
- **Füllkörper** — die Schmelze beim eingestellten Füllgrad als Fläche aus
  dem Raster gezogen (`js/part/surfacenets.js` auf dem Feld
  max(Abstand, (Füllgrad − q)·Band)), das Bauteil durchscheinend.
- **Bauteil** — nur das Bauteil und die Anschnitte.

Dazu die **letzten Stellen**: die Innenzellen, deren Füllgrad keinen
größeren Nachbarn hat, als rote Kugeln — der Regler sagt wie viele, 0 heißt
keine. Dort sammelt sich die Luft; dort gehören die Überläufe hin, die der
Überlaufdesigner setzt. „Deckkraft Bauteil" steht unter *Darstellung ▾*.

Ein Anschnitt sitzt auf der Wand EINES Bauteils: ein neues Bauteil beginnt
mit leerem Plan (α bleibt). Der bisherige Plan bleibt als **Entwurf** bei
seinem Bauteil und wird beim nächsten Mal angeboten, nie still übernommen.

- **Speichern** (JSON) — der Plan (`dielogic-fuellung`, Fassung 1:
  Anschnitte mit Ort, Normale, Drehung, Maßen und Anteil, dazu α).
- **Exportieren ▾ → Füllkörper als STL** — der Füllkörper beim eingestellten
  Füllgrad.

## Der gemeinsame Rahmen (`js/studio/`)

Alle Werkzeugseiten bekommen dasselbe Gerüst und denselben Ablauf.
Die drei Analysen (Wandstärke, Entformung, Abstand), die vier Designer
(Anguss, Überlauf, Temperierung, Füllabschätzung) und die beiden Simulationen
(Anguss- und Kammerfüllung) laufen darin; Formaufbau und Werkbank ziehen nach
(bis dahin tragen sie `css/viewer.css` und ihre eigene Seitenleiste).

```
Kopfzeile     Werkzeug · Bauteil-Chip (Beispielteil, Datei öffnen) · ↶ ↷ ·
              Speicherstand · Speichern · Exportieren ▾ · ?
Seitenleiste  Reiter = MODI (links → rechts = Arbeitsfolge) · eine Zeile
              Hinweis · die Felder des Modus · unten fest EIN Hauptknopf
              mit Fortschritt und Zustandszeile
Viewport      Ansichtsleiste (X Y Z Iso · Einpassen · Persp/Parallel ·
              Darstellung ▾) · Aktions-Chips und Auswahlfeld oben links ·
              Farbskala und Legende unten rechts · unten links die
              Hinweiszeile, darüber — wenn es etwas zu melden gibt — der Toast
Hilfe         eine Lade von rechts, je Werkzeug ein Text mit Ankern (ⓘ)
```

Die Regeln, die der Rahmen durchsetzt — und die Tests, die sie halten:

- **Ein Modus besitzt, was er im Viewport zeigt**, und hat höchstens EINEN
  Hauptknopf, benannt nach dem Ergebnis („Feld berechnen"). Läuft die
  Rechnung, heißt derselbe Knopf „Abbrechen" (`job.js`): die Rechenmodule
  bekommen ein `AbortSignal` und prüfen es an ihren Haltepunkten
  (`js/abort.js`; `buildField`, `computeVisibility`, `solveFill`,
  `distanceToMesh`, `runSimulation`, `runSph`). Gibt es nichts zu tun, steht
  kein toter Knopf da — die Zeile sagt, wie es weitergeht.
- **Die Seitenleiste scrollt nicht** (1280 × 720, 1024 × 768, auch unter
  dem Finger und mit aufgeklappten Details): Kennzahlen, die selten
  interessieren, liegen in einem zugeklappten „Details", Erklärungen in
  der Hilfe. Nichts im Viewport überdeckt einander (`[data-dock]`).
- **Das Bauteil hat keinen eigenen Reiter.** Was man von ihm wissen will —
  Dreiecke, Abmessungen, Volumen, Wanddicke 2V/A, Oberfläche, Hinweise zum
  Netz — steht in der Bauteil-Klappe der Kopfzeile unter „Zum Bauteil"; ein
  Hinweis zum Netz setzt ein ⚠ an den Chip. Die Reiter sind die Arbeit am
  Bauteil, nicht das Bauteil. Ein Werkzeug mit mehreren Eingängen (die
  Abstandsanalyse: Datei A gegen Datei B) bekommt je Eingang einen solchen
  Chip mit derselben Klappe (`shell.header.addPartChips`).
- **Setzen über dem Bild, Bearbeiten daneben.** Ein Designer setzt mit
  *Chips* über dem Viewport (kurze Bezeichnung; ein Chip, der gerade nicht
  geht, sagt beim Antippen warum) und bearbeitet die Auswahl im *Auswahlfeld*
  daneben. Das Feld scrollt so wenig wie die Seitenleiste: viele Maße stehen
  hinter einer *Reiterzeile* (`.st-grouptabs`, zuletzt „Details" mit den
  abgeleiteten Zahlen), darunter nur die Zeilen der gewählten Gruppe.
  Zugeklappte Kästen kosteten je Gruppe eine Zeile — bei 720 px Fensterhöhe
  scrollte das Feld. **Entf** fragt nicht: ein Toast nennt, was weg ist, und
  bietet „Rückgängig" (`host.toastUndo`). Der Toast gehört zu GENAU diesem
  Schritt und verschwindet, sobald sich der Verlauf bewegt — sonst nähme sein
  Knopf später einen ganz anderen Schritt zurück als den, von dem er spricht.
  Was durch Rückgängig wiederkommt, ist gewählt. Ein Zug am Griff ist EIN
  Schritt, ein Dreh am Regler auch (`history.coalesce`); ein bloßer Klick auf
  einen Griff ist keiner. Beim **Zielen** (ein Chip, dann ein Klick aufs
  Bauteil) steht der Hinweis in der Spalte oben links, und das Auswahlfeld
  weicht auf seine Kopfzeile zurück — es läge sonst dort, wo man hinklicken
  will.
- **Einpassen** (F, Knopf, Doppelklick ins Leere) legt das Modell in den
  FREIEN Teil des Bildes: neben das Auswahlfeld oder darunter, je nachdem, wo
  mehr Platz ist, und nur so klein wie nötig. Was eingepasst wird, fragt der
  Rahmen jedes Mal beim Werkzeug nach (`shell.setFitTarget`) — der Körper
  eines Designers wächst.
- **Plan oder Einstellungen.** Ein Designer hat einen *Plan*: jeder Schritt
  landet im Verlauf (`history.js`, Strg+Z/Y) und als Entwurf im Browser
  (`store.js`, je Werkzeug und Bauteil); ein Entwurf wird angeboten, nie
  still übernommen, und die Seite fragt, bevor Ungesichertes verloren
  geht. Eine Analyse hat nur *Einstellungen* (`settingsOnly`): die merkt
  sich der Browser still und bringt sie beim nächsten Mal zurück — mit
  einer Meldung und „Zurücksetzen"; kein „Ungespeichert", keine Frage beim
  Verlassen. „Speichern" schreibt in beiden Fällen JSON
  (`<bauteil>-<werkzeug>.json`), „Öffnen" und Ablegen entscheiden nach dem
  Inhalt (Netz oder Plan), nicht nach der Endung.
- **Zahlen sprechen deutsch** (`format.js`): Anzeige mit Komma und
  Tausenderpunkt, Stellen je Einheit, und ein Parser, der `1.500` als 1500
  und `1.5` als 1,5 liest. Eine Eingabe außerhalb der Grenzen wird geklemmt
  und das kurz dazugesagt. Kein `toFixed` in der Oberfläche.
- **Unter dem Finger** (`pointer: coarse`) ist alles Antippbare 44 px hoch.
  Die Seitenleiste STEHT bis 720 px hinunter neben dem Bild (340 px breit,
  unter 1280 px 320) — im halben Fenster eines Full-HD-Schirms (960 px), bei
  125 % Skalierung (768 px), auf dem Tablett hochkant. Erst darunter ist sie
  eine Lade über dem Bild. ☰ in der Kopfzeile nimmt sie bei jeder Breite weg
  und holt sie wieder; ein Klick ins Bild schließt sie nicht. Passt die
  Ansichtsleiste nicht in ein schmales Bild, bricht sie um — und Chips und
  Auswahlfeld rücken dann UNTER sie. Wie weit, wird gemessen, nicht geraten
  (`--bar-bottom`, ein `ResizeObserver` im Rahmen): die Leiste ist je nach
  Schrift, Zeiger und Bildbreite ein- oder zweizeilig. In einem sehr schmalen
  Bild weicht die Legende, solange etwas gewählt ist; in der Kopfzeile weicht
  der Bauteilname, nie wird etwas überdeckt. Unter 600 px gestapelt: Bild,
  dann Felder.
- **Nichts wird abgeschnitten.** Die Seite hat keine eigene Schrift, sie
  nimmt die des Systems — und die ist je Browser verschieden breit (Firefox
  setzt hier Noto Sans, deutlich breiter als Chromiums Wahl). Reiter, die
  nicht in eine Zeile passen, brechen um; ein Schalter, der neben seiner
  Bezeichnung keinen Platz hat, rutscht darunter; Bezeichnungen brechen in
  ihrer Spalte um. `ux.spec.mjs` misst das in jedem Modus, in Chromium UND
  Firefox.
- **Erklärt wird auf Wunsch**: ein ⓘ öffnet die Hilfe an seinem Anker;
  Erklärungen stehen nie nur in einem `title` (den gibt es auf dem Tablett
  nicht).

Ein Werkzeug ist eine Fabrik `createXTool(host)` in seinem Ordner
(`tool.js`, dazu `panel.js` mit den Feldern je Modus und `help.js`). Es
findet seine Felder mit `ui('name')` = `[data-ui="name"]` statt über ids —
auf der Werkbank werden mehrere Werkzeuge auf einer Seite leben. Der
Gastgeber (`host.js`) besitzt Bauteil, Abstandsfeld, Verlauf, Entwurf,
Rechnungen und Dateien und verdrahtet Reiter, Hauptknopf, Speichern,
Exportieren und Tasten; die Seite selbst ist nur noch
`<div id="studio">` und ein Modul unter `js/studio/pages/`.

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
css/viewer.css        Seitenleiste und Viewport der Viewer, die noch nicht im Rahmen laufen
css/studio.css        der gemeinsame Rahmen: Kopfzeile, Modi, Viewport-Aufsätze, Hilfe, Stufen, Touch
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
js/vents/tool.js      Überlaufdesigner im Rahmen (dazu panel.js: Felder je Modus, help.js: Hilfetexte)
js/cooling/model.js   der Temperierplan: Kühlstiche, Kanäle, Richtungen, Datei
js/cooling/geom.js    Rotationskörper: Stich mit Halbkugelspitze, Kanal; Wandabstand aus dem Feld
js/cooling/auto.js    Kühlstiche automatisch: gewichtete Überdeckung des Bauteils (k-center + k-means)
js/cooling/tool.js    Temperierkanal-Designer im Rahmen (dazu panel.js: Felder je Modus, help.js: Hilfetexte)
js/fill/model.js      der Füllplan: rechteckige Anschnitte, Dreibein, Anteile, Datei
js/fill/solve.js      Frontausbreitung (Dijkstra, Dünnwand-Bremse, Anteile), Füllgrad, Füllkörper, letzte Stellen
js/fill/geom.js       Anschnitte als flache Quader für die Anzeige
js/fill/tool.js       Füllabschätzung im Rahmen (dazu panel.js: Felder je Modus, help.js: Hilfetexte)
js/clipcaps.js        Schnittebene mit geschlossenen Schnittflächen (Stencil)
js/die.js             Einstieg Formaufbau-Viewer
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
js/part/glbio.js      GLB lesen ohne Three.js (Beispielteile und Uploads)
js/part/stlio.js      STL lesen und schreiben
js/part/colors.js     Farben der Analyse (aus der DieLogic-Palette)
js/part/ejector.js    Haftmaß je Fläche, Haftkarte
js/abort.js           AbortError für lange Rechnungen (die Rechenmodule prüfen ein AbortSignal)
js/studio/shell.js    DER RAHMEN: Gerüst, Modi, Hauptknopf, Chips, Auswahlfeld, Toast, Tasten
js/studio/host.js     Gastgeber eines Werkzeugs: Bauteil, Feld, Verlauf, Entwurf, Rechnungen, Dateien
js/studio/part.js     das Bauteil des Rahmens (ein Netz, zwei Materialien, Laden über den Chip)
js/studio/viewport.js Szene + Einpassen in den freien Teil des Bildes, Zoom zum Zeiger
js/studio/job.js      lange Rechnungen: Knopf wird „Abbrechen", Fortschritt, AbortSignal
js/studio/history.js  Rückgängig/Wiederholen als Stapel von JSON-Abzügen
js/studio/store.js    Entwürfe und Einstellungen in localStorage, je Werkzeug und Bauteil
js/studio/files.js    Öffnen nach Inhalt, Speichern als JSON, Ablegen auf dem Viewport
js/studio/format.js   Zahlen deutsch schreiben und lesen (fmt, fmtUnit, parseNumber, clamp)
js/studio/rows.js     Bausteine der Seitenleiste (Zahl, Regler, Schalter, Kennzahlen, Details)
js/studio/help.js     die Hilfe-Lade mit Ankern
js/studio/pages/      je Seite ein Modul: Gastgeber bauen, Werkzeug einsetzen
js/wandstaerke/       Wandstärkenanalyse im Rahmen: tool.js, panel.js (Felder je Modus), help.js
js/entformung/        Entformungsanalyse im Rahmen: tool.js, panel.js, help.js
js/abstand/           Abstandsanalyse im Rahmen — das eine Werkzeug mit ZWEI Bauteilen (createHost({ part: false }))
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
js/runner/tool.js     Angussdesigner im Rahmen (dazu panel.js: Felder je Modus, help.js: Hilfetexte)
js/simulation/        Angussfüllung (anguss.js) und Kammerfüllung (kammer.js) im Rahmen; core.js: Schalter, Lauf, Ergebnisse, Bild
js/simulation/engines/ die Verfahren als Adapter: lbm.js (Gitter), sph.js (Partikel), env.js (WebGPU, Tempo, Zeitschätzung)
js/lbm/, js/sph/      die Kerne: Lattice-Boltzmann und SPH, je auf der Grafikkarte (WGSL) und in JavaScript
vendor/three/         three.module.js 0.160, OrbitControls, GLTFLoader/-Exporter, LICENSE (MIT)
vendor/utils/         BufferGeometryUtils, TextureUtils (von den Loadern gebraucht)
```

Außerhalb von `web/`, weil nicht ausgeliefert:

```
scripts/3d-studio/    Generatoren der Formmodelle (build-glb, build-die-stl)
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
```

Die Ölwannen-Form kommt als Satz von STL-Stücken aus `openscad_parts`
(`dies/oil_pan_die.json` nennt je Stück Baugruppe und Material);
`build-die-stl.mjs` setzt sie über denselben Adapter zusammen wie das
prozedurale Modell (`js/components.js`), damit Namen, Normalen und
Materialien identisch sind. `js/diegeom.js` und `js/config.js` beschreiben
weiterhin die ältere prozedurale Beispielform; `CFG.openTravel` gilt
für beide.

Die vier Druckgussteile (Getriebedeckel, Ölwanne, Kühlkörper, U-Profil)
kommen aus dem Schwesterprojekt `openscad_parts` (parametrische
OpenSCAD-Quellen): dort `./render.sh --studio`, dann `build/glb/*.glb`
nach `assets/parts/` kopieren; `source` in `demoparts.js` nennt die Quelle.
Einen prozeduralen Generator für Beispielteile gibt es nicht mehr.

Die Generatoren laufen ohne Browser: `scripts/3d-studio/three-resolver.mjs` löst
den nackten Import `three` auf `vendor/` auf, und `glb-node.mjs` ergänzt
den FileReader, den der GLTFExporter erwartet.

## Tests

Aus dem Repo-Root, zusammen mit den übrigen Frontend-Tests:

```
node --import ./tests/web/3d-studio/stubs/register.mjs \
     --test tests/web/*.test.mjs tests/web/3d-studio/*.test.mjs \
            tests/web/3d-studio/tools/*.test.mjs
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
| `imports.test.mjs` | jeder Import löst auf, jeder exportierte Name existiert, jede angesprochene HTML-id ist vorhanden — und für die Werkzeuge des Rahmens: jedes `ui('name')` steht als `data-ui` in den (dafür gebauten) Feldern oder im Gerüst |
| `studio-core.test.mjs` | der Rahmen ohne Werkzeug: `parseNumber` (`1.500`, `1.5`, `0.500`, `1.234,5`, `−3`), Rundlauf mit `fmtPlain`, Verlauf (Zug = ein Eintrag, Zusammenfassen, Grenze), Entwurf (schreiben, finden, verwerfen, ohne Speicher), Abbruch erreicht `buildField` und `runSimulation` |
| `tools/*.test.mjs` | je Werkzeug des Rahmens die Seite unter dem DOM-Platzhalter (`tools/fixture.mjs`): Modi besitzen ihren Viewport, Hauptknopf und Zustandszeile, Abbrechen, Einstellungen kommen zurück und lassen sich zurücksetzen, Datei |
| `runner.test.mjs` | der Angussdesigner ohne Browser: Profil (Umriss gegen Abstandsfunktion), Graph (Spiegelung, Einfügen, Löschen, JSON), Kurve (Bogenlänge, monotoner Querschnitt), Sweep (Volumen = Fläche × Länge, geschlossen auch mit gerundeten Deckeln), Strömung, Regeln, Auslegung, Flussschema |
| `fill.test.mjs` | die Füllabschätzung ohne Browser: Plan und Anteile, Startzellen unter dem Rechteck, Frontausbreitung (Ankunft wächst mit dem Weg, Füllgrad als Volumenrang, der größere Anschnitt kommt weiter, die Dünnwand-Bremse verzögert eine Rippe), Füllkörper bei 100 % und 50 %, letzte Stellen |
| `viewer.test.mjs` | die Verdrahtung aller Viewer — mit einem winzigen DOM aus der **echten** HTML-Seite und dem echten Three.js ohne WebGL-Renderer (`tests/stubs/`) |

`viewer.test.mjs` und `tools/` sind der Ersatz für den Browser, den es in
der Kommandozeile nicht gibt: sie klicken Knöpfe, ziehen Regler und prüfen,
dass Kamera, Farben, Legende und Kennzahlen wirklich reagieren. Felder und
Modelle dabei nie mit `assert.equal` vergleichen, sondern mit
`assert.ok(a === b)`: schlägt der Vergleich fehl, baut Node einen
Textvergleich beider Objekte — bei Millionen Rasterwerten frisst das den
Arbeitsspeicher.

Was nur ein Layout beantworten kann, prüft Playwright im echten Browser
(`npm run browser`, `tests/browser/`): `studio.spec.mjs` lädt jede Seite,
`ux.spec.mjs` hält die Regeln des Rahmens — keine scrollende Seitenleiste
in keinem Modus, keine überdeckten Aufsätze, Abbrechen, Einstellungen nach
dem Neuladen, Hilfe am Anker, 44-px-Ziele unter dem Finger. Eine Seite, die
in den Rahmen umzieht, kommt dort in die Liste `SEITEN`.

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
  (`js/runner/shottime.js`, dasselbe Modul wie im Angussdesigner): die Kurve der Auslegung (López-Anfahrt bis
  v_krit, Plateau bis „Kammer voll", Rampe mit a_max auf das v₂ der
  NADCA-Füllzeit) wird für dieses Modell erzeugt — Maschine, Kammer,
  Legierung und Thermik aus dem Auslegungszustand, die Massen aus den
  Volumen des Modells. Die Ankunft bei konstantem Strom ist ein Volumen,
  das den Pressrest passiert hat; auf der Kurve ist das ein Kolbenweg
  hinter „Kammer voll", und das Profil kennt die Zeit dazu. Die Zeiten
  zählen ab Kolbenstart; das Häkchen „Ankunft nach der
  DieLogic-Schusskurve" schaltet auf den konstanten Strom zurück.
- **Anguss + Auslegung → Füllung:** die Füllabschätzung bekommt dieselbe
  Uhr (`js/werkbank/filltime.js`): ab dem ersten Anschnitt strömt der
  Kolbenstrom in die Kavität, aber nur der Anteil der schon offenen
  Anschnitte — die übrigen Äste füllen noch den Anguss. Daraus folgt zu
  jedem Füllgrad eine Zeit ab Kolbenstart (Regler, Farbskala, letzte
  Stellen) und zu jedem später öffnenden Anschnitt der **Vorsprung**, den
  die früheren bis dahin haben. Die Frontausbreitung läuft dann zweimal
  (`js/fill/solve.js` mit der Option `offsets`, dem Startversatz je
  Anschnitt): einmal ohne Versatz, um Füllgrad und
  Ankunftseinheit aufeinander abzubilden, dann mit dem Vorsprung an den
  Startzellen der späteren Anschnitte. Die Kennzahlen nennen Öffnen der
  Anschnitte, „Bauteil voll", die Füllzeit des Bauteils und daneben die
  Füllzeit der Auslegung (Anguss → Überlauf gefüllt auf derselben Kurve).
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
