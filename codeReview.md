# Code-Review DieLogic — Stand nach der Abarbeitung

**Stand:** 2026-08-31 · Commit `6dfab2f` · Version 0.10.0 · Basis der ersten
Prüfung war `134ea4f`
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
| HIGH | 42 | **6** |
| Echte Fehler aus MEDIUM/LOW | ~40 | **0** |
| Tests | 314 | **486** |
| Testdateien | 33 | **48** |

17 Commits, 6.473 eingefügte und 1.382 gelöschte Zeilen über 100 Dateien.
CI durchgehend grün.

**Test-Aufteilung heute:** 338 Web (`node --test`), 74 Backend (`pytest`),
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

36 von 42 behoben. Bemerkenswerte Messungen:

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

## Der eigentliche Befund: die Abwehrschicht ersetzt eine fehlende Grenze

Das ist der Kern dieser Prüfung. Der Code verteidigt sich an sehr vielen
Stellen gegen Zahlen, die niemals ankommen dürften.

### Gemessen

| | |
|---|---:|
| `isFinite`-Prüfungen in `js/auslegung` | **90** |
| davon in `charts/` + `render/` (Anzeige, nicht Rechnung) | **55** |
| `return { err: … }` in Diagrammen | **12** |
| `ConvertError`-Stellen im Backend | **27** |
| `min=`/`max=` von Hand in HTML-Seiten | **45** |
| Schlüssel in `POSITIVE_KEYS`/`NONNEG_KEYS` | **57** |
| Felder in `fields.js` mit `min:`/`max:` | **0** |

### Warum das so ist

`fields.js` beschreibt 62 Felder — Name, Einheit, Vorgabewert. **Die Domäne
steht dort nicht.** Sie steht stattdessen an vier anderen Orten:

1. `inputs.js` als drei flache Namenslisten (57 Schlüssel plus sechs
   Paar-Regeln),
2. 45 `min`/`max`-Attribute in den HTML-Seiten,
3. 27 `ConvertError` im Backend — eine **eigene**, vollständige Domäne,
4. verstreute Guards in Rechenkern und Diagrammen.

Und entscheidend:

```js
// main.js, render()
const shot = computeShot(v, state.curve);   // rechnet
validate(v);                                 // markiert nur — Ergebnis wird verworfen
charts.forEach(def => renderCard(…, v, shot));
```

`validate()` gibt nichts zurück, wird **nach** der Rechnung aufgerufen, und
niemand fragt das Ergebnis ab. Ungültige Werte fließen ungehindert in
`computeShot` und in alle 19 Diagramme. Jedes Modul dahinter muss sich selbst
verteidigen — daher die 90 Prüfungen.

### Was das konkret kostet

Von den 12 `err`-Rückgaben in den Diagrammen wiederholen **acht**, was
`POSITIVE_KEYS` bereits erklärt:

| Datei | Prüfung | schon in `POSITIVE_KEYS` |
|---|---|---|
| `window.js` ×3 | `gate > 0`, `vmax > 0`, `Ap > 0` | ja (`gate`, `vmax`, `diam`) |
| `filltime.js` | `vmax > 0` | ja |
| `pq2.js` ×2 | `gate`, `Cd`, `vmax`, `injForce`, `pAcc` > 0 | ja |
| `area.js`, `machine.js` | `pMax > 0` (aus `injForce`, `dmin`) | ja |

Nur drei kodieren **Paar**-Regeln, die `validate()` nicht kennt
(`bubble.js` ×2, `ftwall.js`), und eine reicht einen Fehler der Schusskurve
durch.

### Der Vorschlag

**Ein Ort für die Domäne, eine Sperre, dann fällt die halbe Abwehr weg.**

1. **Die Domäne wandert in `fields.js`**, neben `def`:
   ```js
   { key: 'gate', label: 'Anschnittfläche', unit: 'mm²', def: 1800, min: 1, max: 50000 }
   { key: 'amax', label: 'Beschleunigung max.', unit: 'm/s²', def: 110, min: 0 }
   ```
   plus die Paar-Regeln als Liste (`['dmin','dmax','<']`, `['Tflow','Tdie','>']`).
   Damit verschwinden die drei Listen in `inputs.js` und die 45 HTML-Attribute
   — letztere werden von `buildInputs()` aus derselben Quelle gesetzt, wie es
   `label` und `unit` heute schon tut.

2. **`validate()` liefert ein Urteil, und `render()` fragt es.** Ist die
   Eingabe außerhalb der Domäne, wird nicht gerechnet: die Seitenleiste zeigt
   die verletzten Felder, die Karten behalten sichtbar ihren letzten gültigen
   Stand mit dem Hinweis, warum. Heute rechnen sie mit Unsinn weiter.

3. **Dann sind acht `err`-Rückgaben und ein großer Teil der 55 Prüfungen in
   `charts/`/`render/` tot** — nicht weil sie „wegoptimiert" wurden, sondern
   weil der Zustand nicht mehr eintreten kann. Was bleibt, sind die
   **abgeleiteten** Größen: `pMax`, `phi`, `v2`, `p0`. Die brauchen weiterhin
   eine Prüfung, weil sie aus gültigen Eingaben unbrauchbar werden können.

4. **Dieselbe Tabelle erzeugt die Backend-Domäne** (H-39). Das Muster steht
   schon im Repo und wird im Bericht ausdrücklich gelobt: eine CSV → ein
   Generator → beide Sprachen → ein CI-Diff. Für `VKRIT_GRAVITY` wurde es in
   dieser Runde genau so gemacht, und der Unterschied zwischen den Sprachen
   fiel von 1,708e-4 auf **0,000e+00**.

### Ein Beleg, dass es funktioniert

N-3 ist der Beweis im Kleinen. Statt an zehn Schreibstellen zu prüfen, läuft
jede Prozentangabe durch **eine** Funktion:

```js
const clampPct = x => (isFinite(x) ? Math.max(0, Math.min(100, x)) : 0);
const pctStr = x => clampPct(x).toFixed(2) + '%';
```

Eine Länge in Prozent ist per Definition endlich und liegt in [0, 100]. Das
an einer Stelle sicherzustellen ist **weniger Code** als die vorherigen
verstreuten `isFinite`- und `Math.max`-Prüfungen — und deckt 48 von 48
Eingabevarianten ab statt der zwei, an die jemand gedacht hatte.

### Zwei weitere Stellen mit demselben Muster

- **Zeit-Achsen und Zellgrößen.** `filltime.js` legte je 1 m/s eine
  Konturstufe an; bei vertipptem `vmax` war das eine Milliarden-Allokation.
  Behoben durch einen Deckel — aber ein `vmax`-Feld mit `max: 40` hätte den
  Fall gar nicht erst zugelassen.
- **Die Suchgrenze im 3D-Studio** (H-22). Sie darf 100 000 mm sein; sinnvoll
  ist höchstens die Diagonale der beiden Teile. Eine an die Netze gebundene
  Obergrenze wäre wirksamer als Deckel, Warnung und Abbruch zusammen.

---

## Was bleibt

### Vier echte Fehler (HIGH)

| # | Befund | Wirkung |
|---|---|---|
| **H-39** | Die JS-Eingabedomäne ist eine Obermenge der Backend-Domäne | 8 von 17 Grenzeingaben rechnen im Browser durch, der Server antwortet 422; der Anwender sieht nur „HTTP 422" |
| **H-40** | `orgsettings.py:42` nimmt jeden Schlüssel `^[A-Za-z][A-Za-z0-9]{0,31}$` | Ein vertipptes `forcee` lässt `force` still bei 16000 kN |
| **H-41** | `curve_clamped` wird gesetzt, aber von **keiner** Frontend-Datei gelesen | Das Backend kürzt die Schusskurve still — schon mit den Defaults |
| **H-42** | `IdealVacuum` ignoriert `pour_hole_open` | Meldet Pumpendruck, während das Gießloch offen zur Atmosphäre steht |

H-39 und H-40 lösen sich beide mit dem Vorschlag oben auf: eine Domäne,
generiert in beide Sprachen und gegen das Feldschema geprüft.

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

**Vier Tests zementierten aktiv einen Defekt** und wurden umgestellt:

- `waermebilanz.test.mjs` schrieb die eigene Ausgabe (0,04464 kg) statt der
  Quellenzahl (0,02 kg) fest und hielt C-11 dauerhaft grün.
- `pq2.test.mjs` sicherte ausdrücklich zu: *„fehlende/ungültige Drücke →
  Maximalkraft"* — genau das fail-unsafe Verhalten.
- `project.test.mjs` prüfte *„negativ → Standard"* — die H-28-Inkonsistenz
  selbst.
- `frontend.test.mjs` griff über `checks[2]` auf die Beschleunigungsprüfung
  zu; bei `a_max = 0` ist das die Kurvenhub-Prüfung.

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
Schätzung. Der Vorschlag in Abschnitt „Der eigentliche Befund" ist nicht
umgesetzt — er ist die Empfehlung, mit der sich H-39, H-40 und ein
erheblicher Teil der verbleibenden Abwehr gemeinsam erledigen ließen.
