# Code-Review DieLogic — Stand nach der Abarbeitung

**Stand:** 2026-08-31 · Version 0.10.0 · Basis der ersten Prüfung war `134ea4f`
**Umfang dieser Fassung:** eine gegnerische Prüfung des *aktuellen* Zustands,
mit besonderem Blick auf Vereinfachungen — dort, wo heute Ausnahmen behandelt
werden, obwohl sich der Zustand von vornherein ausschließen ließe.
**Am Code wurde diesmal geändert**, was die Prüfung an Fehlern fand
(drei Stück, alle in den vorangegangenen Korrekturen entstanden).

---

## Ausgangslage: was seit der ersten Prüfung geschehen ist

| | erste Prüfung | jetzt |
|---|---:|---:|
| CRITICAL | 12 | **0** |
| HIGH | 42 | **4** |
| Echte Fehler aus MEDIUM/LOW | ~40 | **0** |
| Tests | 314 | **516** |
| Testdateien | 33 | **50** |

17 Commits, 6.473 eingefügte und 1.382 gelöschte Zeilen über 100 Dateien.
CI durchgehend grün.

**Test-Aufteilung heute:** 355 Web (`node --test`), 87 Backend (`pytest`),
74 `hpdcsim`. Jeder Fix hat eine Prüfung, die ohne ihn rot ist — das wurde
für jeden einzelnen durch Zurücknehmen der Datei nachgewiesen.

### Die zwölf CRITICAL — alle behoben

| | Befund | Messung vorher → nachher |
|---|---|---|
| C-1 | Zwei Tabs löschen sich die Arbeit | Ganzer Store überschrieben → Merge je Projekt + `storage`-Listener |
| C-2 | Autosave-Endlosschleife | 26 Schreibzugriffe in 15 s ohne Eingabe → einer je Änderung |
| C-3 | Kein Konfliktschutz | Fremder Stand überschrieben (3/3 Runden) → 409 mit `base_draft_at` |
| C-4 | Reload-Sperre griff einmal | Ein Tastendruck schob 555 zurück auf 77 → Inhaltsvergleich, beliebig oft |
| C-5 | Projekte doppelt angelegt | 2/2 Runden zwei gleichnamige → Idempotenz über die lokale id |
| C-6 | Cache nicht kontogebunden | Bob sah Annas Projekte → `bindAccount` verwirft fremden Bestand |
| C-7 | Vakuumdruck = Umgebungsdruck | 1013,25 mbar → **83,93 mbar** (Druck beim Füllende) |
| C-8 | `turbo(NaN)` fror 11 Diagramme ein | 16 von 19 Canvas veraltet → jede Karte isoliert |
| C-9 | Werte ≥ 1000 durch 1000 geteilt | 1500 → 1,5 → Eingabefelder ohne Gruppentrenner |
| C-10 | Kavitäten/Schuss widersprüchlich | −14,5 % Stückkosten, 131,9 % Ausbeute → strukturell unmöglich |
| C-11 | Q_Spr verdoppelt | m₁ 44,6 g → **18,6 g** (Quelle: 20 g) |
| C-12 | Datenschutzerklärung falsch | „nicht an unsere Server" bei laufender Projektdatenbank → richtiggestellt |

### Die HIGH-Befunde

38 von 42 behoben. Bemerkenswerte Messungen:

- **H-22**: Suchgrenze 300 mm ließ das Beschleunigungsgitter von 1300 auf 28
  Zellen fallen — die Rechnung von 91 ms auf **116 437 ms** (Faktor 1282).
  Der Deckel allein brachte nur 116 s → 50 s; die eigentliche Abhilfe ist der
  **Abbruch-Knopf**, den der Befund anmahnte.
- **H-24**: Inkonsistent gewickelter Quader meldete **0,0 cm³** und 77,8 %
  offene Kanten → 240,0 cm³ und 0 % nach der Orientierungsreparatur.
- **H-19**: `series4 #e0a400` erreicht auf Weiß **2,22:1** — exakt die Zahl
  des Reviews.
- **H-35**: `.btn-ghost` **1,968:1** auf hellem Grund → 14,44:1.
- **H-31**: `/\evil.com` bestand die alte Prüfung und löste zu
  `https://evil.com/` auf.
- **H-34**: **kein einziger** Sicherheits-Header; `/docs` öffentlich.

---

## Was diese Prüfung gefunden hat

Eine Prüfung, die nichts findet, hat nicht geprüft. Diese fand drei Fehler —
alle **neu entstanden** in den vorangegangenen Korrekturen.

### N-1 · `orientMesh` zerstörte Hohlräume
`web/tools/3d-studio/js/mesh.js` · falsche Zahl

Die Regel „jede geschlossene Komponente auf positives Volumen drehen" ist für
verschachtelte Schalen falsch. Bei einem Hohlteil zeigt die innere Schale
absichtlich nach innen, damit der Hohlraum vom Volumen abgeht.

```
40³-Teil mit 10³-Hohlraum, korrekt modelliert
  Volumen roh                63000 mm³   ← richtig
  nach orientMesh (alt)      65000 mm³   ← der Hohlraum zählt als Material
  nach orientMesh (neu)      63000 mm³
```

Im Druckguss ist das der Normalfall, nicht der Sonderfall. Das
Gesamtvorzeichen wird jetzt **einmal für das ganze Netz** entschieden; die
Schalen behalten ihre Beziehung zueinander. Fünf Fälle abgesichert.

### N-2 · Die optimistische Sperre aus C-3 war nicht atomar
`backend/projects.py` · Datenverlust

Prüfung und Schreiben lagen auseinander. Mehrere Anfragen lasen denselben
Stempel, bestanden alle die Prüfung und schrieben nacheinander.

```
10 gleichzeitige PUT …/draft mit demselben base_draft_at
  vorher:   3 × 200, 7 × 409     ← drei überschreiben einander
  nachher:  1 × 200, 9 × 409
```

Jetzt entscheidet ein bedingtes `UPDATE … WHERE draft_at = :gesehen` in der
Datenbank, nicht der Anwendungscode.

### N-3 · Ungültige Prozentwerte im Markup
`web/tools/auslegung/js/ui/kpis.js` · Anzeige

Ausgelöst von der eigenen `injForceEff`-Änderung (NaN statt Maximalkraft):
die Kennzahlen schrieben `style="width:NaN%"` und `style="width:-12.34%"` —
Werte, die der Browser stillschweigend verwirft.

**Behoben nicht durch weitere Prüfungen an den Schreibstellen**, sondern durch
eine Funktion, durch die jede Prozentangabe läuft. Das ist weniger Code als
vorher, nicht mehr. Nachgemessen über 48 Eingabevarianten: alle sauber.

### Zwei kleinere Befunde derselben Art

- `seq(0, 10, 1.5)` lieferte `[0, 20]` — einen Wert **außerhalb** des
  angeforderten Bereichs. Die Anzahl wird jetzt abgerundet.
- `layoutCycle` meldete ungültige Dauern nur für die Hauptphasen; die
  Parallelvorgänge wurden weiter still zu 0.

---

## Der eigentliche Befund — und was daraus gebaut wurde

Das war der Kern der Prüfung: der Code verteidigte sich an sehr vielen
Stellen gegen Zahlen, die niemals hätten ankommen dürfen. Der Umbau ist
gemacht; dieses Kapitel beschreibt beides — den Befund und den Zustand danach.

### Der Befund

`fields.js` beschrieb 62 Felder — Name, Einheit, Vorgabewert. **Die Domäne
stand dort nicht.** Sie stand stattdessen an vier anderen Orten: drei flache
Namenslisten in `inputs.js` (57 Schlüssel), 45 `min`/`max`-Attribute in
HTML-Seiten, 27 `ConvertError` im Backend und verstreute Guards in Rechenkern
und Diagrammen.

Und entscheidend:

```js
// main.js, render() — vorher
const shot = computeShot(v, state.curve);   // rechnet
validate(v);                                 // markiert nur — Ergebnis verworfen
```

`validate()` gab nichts zurück, lief **nach** der Rechnung, und niemand fragte
das Ergebnis ab. Ungültige Werte flossen ungehindert in `computeShot` und in
alle 19 Diagramme. Jedes Modul dahinter musste sich selbst verteidigen — daher
90 `isFinite`-Prüfungen und 12 `err`-Rückgaben, von denen acht wiederholten,
was `POSITIVE_KEYS` bereits erklärte.

### Was gebaut wurde

**Eine Quelle, eine Sperre, ein Generator.**

```js
// fields.js — die Domäne steht jetzt am Feld
{ key: 'Cd',   label: 'Durchflussbeiwert', unit: '-', def: 0.5,
  gt: 0, max: 1, bound: 'hart',
  why: 'ein Durchflussbeiwert über 1 hieße mehr Durchfluss als Antrieb' }

// PAIRS — was eine Einzelgrenze nicht ausdrücken kann
{ a: 'Tsol', b: 'Tliq', op: '<', text: 'Liquidus- muss über der Solidustemperatur liegen' }
{ key: 'diam', lo: 'dmin', hi: 'dmax', op: 'in', zieh: 'key', text: '…' }
```

```js
// main.js, render() — jetzt
const urteil = validate(v);
document.body.classList.toggle('inputs-invalid', !urteil.ok);
if (!urteil.ok) { … return; }        // es wird gar nicht gerechnet
const shot = computeShot(v, state.curve);
```

| | |
|---|---|
| `config/fields.js` | 59 numerische Felder, **jedes** mit unterer und oberer Grenze, plus 14 Paarregeln — die vollständige Domäne, an einem Ort |
| `core/domain.js` | wendet sie an: `checkField`, `checkValues`, `clampToDomain` — ohne DOM, damit Tests, Einzelseiten und Server dieselbe Funktion sehen |
| `ui/inputs.js` | nur noch der DOM-Teil: markieren und melden. Die drei Namenslisten sind **weg** |
| `scripts/gen-domain-doc.mjs` | erzeugt `docs/eingabegrenzen.md` **und** `backend/_domain.py` — eine Quelle, beide Sprachen, ein CI-Diff |

Die `min`/`max`-Attribute der Eingabefelder kommen jetzt aus derselben
Tabelle, wie `label` und `unit` es schon taten.

### Zweierlei Grenzen — die Unterscheidung, die den Umbau tragbar macht

Eine Grenze, die zu eng sitzt, verhindert Arbeit. Deshalb tragen alle Felder
ein `bound`:

- **hart** (6 Felder): physikalisch oder definitorisch unmöglich, mit
  Begründung im Code. `Cd ≤ 1`, `vacPump ≤ 1013 mbar`, `fillMin`/`fillMax`/
  `Sfrac ≤ 100 %`, `safety ≥ 1`, dazu `runner > 0` und `biscuit > 0`.
- **plausibel** (53 Felder): schließt nur Absurdes aus. Nachgemessen an drei
  realen Betriebspunkten — 400-kN-Zink-Warmkammer, 44.000-kN-Aluminiumanlage,
  dünnwandiges Magnesium: alle kommen durch.

### Was der Umbau selbst gefunden hat

Sobald die Sperre stand, fielen zwei Fehler heraus, die vorher keiner sah.

**Ein Preset setzte Grenzen, aber nicht die daraus gewählten Werte.**

```
Maschine „HCC-200 (200 t)" gewählt — Kolben-Ø max. laut Maschine: 70 mm
  gewählter Kolben-Ø bleibt      150 mm  → Querschnitt 17671 statt 3848 mm² (Faktor 4,59)
  gewählte Kammerlänge bleibt    900 mm  → Maschine kann 350 mm
  eingestellter Akkudruck bleibt 190 bar → Maschine liefert 180 bar
  Füllgrad daraus                8522,6 %
```

Gerechnet wurde auf einer Maschine, die es nicht gibt — und `validate()`
färbte die Felder rot, ohne irgendetwas aufzuhalten. Behoben nicht durch eine
weitere Prüfung, sondern durch `clampToDomain()`: was der Maschine **folgt**
(Kolben-Ø, Kammerlänge, Verschluss-Hub, eingestellter Druck), wird beim
Wechsel mitgezogen. Was dem Anwender gehört — seine Zielbänder für Füllgrad
und Anschnittgeschwindigkeit — bleibt unangetastet. Der Zustand kann nicht
mehr entstehen, statt hinterher erkannt zu werden.

Was das Nachführen **nicht** repariert und auch nicht soll: der Vorgabeschuss
von 18,2 kg passt nicht in eine 350-mm-Kammer. Das sagt die Anwendung jetzt,
statt 8522 % anzuzeigen.

**Die Stammdaten nahmen alles an** (H-40):

```
Stammdaten-Maschine speichern            vorher            nachher
  Tippfehler 'forcee' statt 'force'      angenommen        422 „ist kein Eingabefeld"
  Durchflussbeiwert 1,8                  angenommen        422 „darf nicht über 1 liegen"
  Kolben-Ø −50 mm                        angenommen        422 „muss größer als 0 sein"
  Pumpen-Enddruck 5000 mbar              angenommen        422 „darf nicht über 1013 liegen"
```

Ein vertipptes `forcee` wurde gespeichert, wirkte nie, und die Maschinenkraft
blieb still auf dem Vorgabewert. `backend/_domain.py` kommt aus derselben
Tabelle wie das Frontend, also kann die Prüfung nicht wegdriften.
Sätze und Preise (`kosten`) bleiben ausgenommen — sie sind keine
Auslegungsfelder.

### Die Lücke zwischen Browser und Server ist zu (H-39)

```
140 vom Browser akzeptierte Grenzeingaben gegen die Simulation geprüft
  vorher:  6 kamen durch den Browser und wurden vom Server abgewiesen
  nachher: 0
```

Die sechs waren zweierlei. Zwei Feldgrenzen, bei denen der Server strenger
war — `runner > 0` und `biscuit > 0`, jetzt auch im Browser hart, mit
Begründung. Und vier abgeleitete Grenzen, die an mehreren Eingaben hängen und
sich deshalb nicht als Feldgrenze schreiben lassen: das Dosiervolumen muss in
die Kammer passen, und der Nachverdichtungshub darf nicht negativ werden.
Die stehen jetzt in `checkValues` neben der Maschinendruckgrenze — der
Anwender liest den Grund auf Deutsch in der Seitenleiste, statt ein nacktes
HTTP 422 zu bekommen.

### Auch die Auto-Felder sind jetzt gebunden

`applyAuto` schreibt berechnete Werte in den Zustand. Verließe einer die
Domäne, bliebe die Anwendung an etwas hängen, das der Anwender nie eingetippt
hat — und könnte es nicht korrigieren, weil das Feld schreibgeschützt ist.
Über 81 gültigen Kombinationen trat das nicht auf; bei Zielgeschwindigkeit
gegen null geht die ideale Anschnittfläche aber gegen unendlich. Eine Zeile
klemmt das Ergebnis an der Quelle, statt auf den Normalfall zu vertrauen.

### Ehrliche Bilanz der Guards

Die Guards in den Diagrammen sind **nicht** entfernt worden. Sie geben einen
Fehler zurück, nie einen Wert — das ist nach dem Leitsatz des Berichts
richtiges Verhalten und für die Theorieseiten, die `pq2.calc` direkt
importieren, die einzige Absicherung. Was sich geändert hat: sie sind nicht
mehr die erste Linie, und aus der Anwendung heraus **unerreichbar**.

Die Zahl der `isFinite`-Aufrufe ist dabei nicht gefallen, sondern von 90 auf
101 gestiegen — 14 davon in `core/domain.js`. Das ist der Preis dafür, die
Prüfung an einem Ort zu konzentrieren, und er ist es wert: vorher war die
Domäne nirgends nachlesbar, jetzt steht sie in einer Tabelle und in einem
generierten Dokument. Wer eine Grenze ändern will, ändert **eine** Zeile.

### Der Beleg im Kleinen

N-3 war schon vor dem Umbau derselbe Gedanke: statt an zehn Schreibstellen zu
prüfen, läuft jede Prozentangabe durch **eine** Funktion.

```js
const clampPct = x => (isFinite(x) ? Math.max(0, Math.min(100, x)) : 0);
const pctStr = x => clampPct(x).toFixed(2) + '%';
```

Eine Länge in Prozent ist per Definition endlich und liegt in [0, 100]. Das an
einer Stelle sicherzustellen ist weniger Code als die vorherigen verstreuten
Prüfungen — und deckt 48 von 48 Eingabevarianten ab statt der zwei, an die
jemand gedacht hatte.

### Die Übersicht

`docs/eingabegrenzen.md` zeigt alle Grenzen und Regeln in Tabellenform, nach
Feldgruppen sortiert, mit den harten Grenzen und ihrer Begründung in einem
eigenen Abschnitt. Sie ist ein **Abbild**, keine Quelle: die CI erzeugt sie neu
und vergleicht — wer eine Grenze ändert und nicht regeneriert, bekommt einen
roten Lauf.

### Was noch offen ist

Die 43 handgeschriebenen `min`/`max`-Attribute in den **anderen** Werkzeugen
(Teilekosten, Zyklus, Sprengfläche, 3D-Studio) sind nicht angefasst. Die haben
eigene Eingabemengen und eine eigene Tabelle. Das Muster steht jetzt, die
Übertragung ist Arbeit für später.

## Was bleibt

### Zwei echte Fehler (HIGH)

| # | Befund | Wirkung |
|---|---|---|
| **H-41** | `curve_clamped` wird gesetzt, aber von **keiner** Frontend-Datei gelesen | Das Backend kürzt die Schusskurve still — schon mit den Defaults |
| **H-42** | `IdealVacuum` ignoriert `pour_hole_open` | Meldet Pumpendruck, während das Gießloch offen zur Atmosphäre steht |

H-39 (Domänenlücke Browser/Server) und H-40 (Stammdaten ohne Feldschema) sind
mit dem Umbau oben erledigt — beide durch dieselbe Tabelle.

### Zwei Betriebsentscheidungen — keine Fehler

| # | Sache |
|---|---|
| H-37 | Kein Migrationspfad (nur `create_all`, kein Alembic). Heute ist nichts kaputt; die erste Schemaänderung gegen die laufende Postgres wäre ein stiller No-Op. |
| H-38 | Kundendaten auf Free-Postgres mit 90-Tage-Ablauf, ohne Backup. |

### Offene Aufgabe

`samples.T_melt` ist in jeder Antwort `null`, weil `convert.py` keinen
`thermal`-Block konfiguriert. Die Legierungsdaten kommen inzwischen
vollständig an; den Kanal zu füllen braucht Wärmeübergangszahlen und
Wandtemperaturen. Das sind Modellparameter, die entschieden und nicht geraten
gehören — als TODO in `convert.py` notiert, wo die Entscheidung hingehört.

### Geprüft und bewusst nicht geändert

| Sache | Grund |
|---|---|
| `dTsurf` 30 statt 40 K | Die 40 K stehen **nicht** im Quelldokument des Repos; `t_f0min` ist dort nirgends beziffert. Eine physikalische Konstante auf eine unbelegbare Behauptung hin zu ändern wäre schlimmer, als sie zu lassen. |
| `ProcessState.critical_velocity` als Konstante | Dokumentiert als Kriterium am *dosierten* Füllgrad, und `physics.js` macht es genauso. Umzustellen wäre eine Modelländerung, die Python vom Dashboard trennt. |
| `ConductanceVacuum` „nicht gitterkonvergent" (+53 %) | Gemessen am Kollapspunkt, also am Artefakt aus C-7. Bei „Bauteil gefüllt" liefert das Modell über alle Gitterweiten **exakt 80,00 mbar**. |
| „Materialausbeute" doppelt definiert | Mit C-10 aufgelöst; beide Werkzeuge zeigen nachgerechnet 65,93 %. |
| Globale E-Mail-Eindeutigkeit | Die Sondierung über Mandantengrenzen ist gemildert, die Ursache bleibt ein eigener MEDIUM-Befund. |

### Nicht angefasst: rund 185 Befunde ohne Fehlverhalten

Duplikate und Architektur (der 19-fach kopierte `set()`-Helfer, der 21-fach
kopierte Seitenkopf, drei Legenden-Implementierungen), veraltete Kommentare
und Pfade, Testlücken, Barrierefreiheit und Politur, Performance ohne
falsches Ergebnis, toter Code, Benennung, Betrieb und Deployment. Das ist
Arbeit, aber kein Fehlverhalten.

---

## Was sich an der Testsuite geändert hat

Der ursprüngliche Bericht nannte als schärfste Lücke: *„`web/shared/projectbar.js`
(377 Zeilen) — 0 Verhaltenstests — 5 CRITICAL."* Und: *„`render-smoke.test.mjs`
bliebe auch bei komplett leeren Diagrammen grün."*

Beides ist adressiert:

| neu | was es prüft |
|---|---|
| `projectbar.test.mjs` | Die echte Datei gegen DOM-Attrappe, Papier-Server und steuerbare Uhr: **welche** Requests in welcher Reihenfolge rausgehen |
| `render-achsen.test.mjs` | Ein **aufzeichnender** Canvas statt der No-Op-Attrappe: welche Koordinaten und welche Farben tatsächlich gesetzt werden |
| Entartungs-Matrix in `render-smoke` | 4 Werte × 13 Felder × 19 Diagramme, plus vier Gleichpaar-Fälle — der in Abschnitt 10 vorgeschlagene „billigste Hebel" |
| `kern-guards`, `werkzeuge`, `werkzeuge-physik`, `darstellung`, `dashboard-kern`, `seiten-konto`, `bubble`, `robustheit`, `controls` | je ein Fall pro behobenem Fehler |
| `test_security.py` | inkl. einer echten Zeitmessung gegen das Login-Orakel |
| `domaene.test.mjs` (15) | die Sperre: fängt sie, was sie soll — und steht sie nie im Weg? Presets, drei reale Betriebspunkte, das Nachführen, die Auto-Klemme, die Verdrahtung des abgeblendeten Stands |
| `test_domain.py` (13) | dieselbe Domäne auf der Serverseite, inklusive: die mitgelieferten Presets bestehen die eigene Prüfung |

**Vier Tests zementierten aktiv einen Defekt** und wurden umgestellt:

- `waermebilanz.test.mjs` schrieb die eigene Ausgabe (0,04464 kg) statt der
  Quellenzahl (0,02 kg) fest und hielt C-11 dauerhaft grün.
- `pq2.test.mjs` sicherte ausdrücklich zu: *„fehlende/ungültige Drücke →
  Maximalkraft"* — genau das fail-unsafe Verhalten.
- `project.test.mjs` prüfte *„negativ → Standard"* — die H-28-Inkonsistenz
  selbst.
- `frontend.test.mjs` griff über `checks[2]` auf die Beschleunigungsprüfung
  zu; bei `a_max = 0` ist das die Kurvenhub-Prüfung.

Ein Wächter wurde dabei durch einen **einfacheren und zugleich schärferen**
ersetzt. Vorher: „jedes numerische Feld gehört in genau eine von drei
Vorzeichen-Klassen." Jetzt: „jedes numerische Feld hat eine untere und eine
obere Grenze, jede harte Grenze eine Begründung, und jede eingetragene Grenze
weist den Wert dahinter auch wirklich ab." Der neue Wächter braucht keine
Listenpflege — ein Feld ohne Domäne fällt auf, bevor es ein Diagramm erreicht.

Dazu drei Wächter, die in dieser Runde selbst angeschlagen haben und dabei
echte Fehler fingen: der Generatoren-Diff (Theorie-SVGs nach H-16), der
Paletten-Test (Hex-Literale im neuen Icon-Sprite) und der
id-Verdrahtungstest des 3D-Studios (`die-warn` gab es nicht).

Der Syntax-Check übersprang jeden `type="module"`-Block — auf der Konto-Seite
den ganzen Stammdaten-Editor. Nachgestellt: ein Syntaxfehler dort rutschte
unbemerkt durch die CI. Geprüfte Inline-Scripts: 5 → 8.

---

## Anhang · Methode dieser Fassung

Gegen den *aktuellen* Stand gearbeitet, mit dem Auftrag, die eigenen
Korrekturen für fehlerhaft zu halten, bis das Gegenteil gezeigt ist. Jeder
Befund wurde ausgeführt, nicht gelesen: `orientMesh` gegen fünf
Netztopologien (leer, Einzeldreieck, Mehrkörper, offen, verschachtelt), die
Draft-Sperre gegen zehn gleichzeitige Schreibversuche, die Kennzahlen gegen
48 Eingabevarianten, der Projektspeicher gegen sechs entartete
Speicherinhalte einschließlich `__proto__`.

Die Zahlen zur Abwehrschicht stammen aus `grep` über den Quellbaum, nicht aus
Schätzung.

Der Umbau der Eingabedomäne ist **umgesetzt**, nicht nur vorgeschlagen. Er
wurde gegen dieselbe Härte geprüft wie alles andere: 140 Grenzeingaben gegen
die Simulation, 81 Auto-Kombinationen, jedes mitgelieferte Preset auf beiden
Seiten, drei reale Betriebspunkte von der Zink-Warmkammer bis zur
44.000-kN-Anlage. Zwei Fehler, die er dabei selbst aufdeckte — das nicht
nachgeführte Preset und die ungeprüften Stammdaten — sind mitbehoben.

Ein Fehler in dieser Runde ging auf das Konto der Prüfung selbst: die
Abblend-Regel landete zuerst in einer Datei, die es nicht gab und die niemand
einband, und zeigte danach auf ein `#chamber-card`, das es ebenfalls nicht
gibt. Beides fiel erst auf, als die Verdrahtung geprüft statt angenommen
wurde — deshalb steht diese Prüfung jetzt als Test in `domaene.test.mjs`.
