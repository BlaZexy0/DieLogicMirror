# Eingabegrenzen

<!-- GENERIERT von scripts/gen-domain-doc.mjs — nicht von Hand ändern.
     Quelle: web/tools/auslegung/js/config/fields.js -->

Diese Datei ist ein **Abbild** der Eingabedomäne, nicht ihre Quelle.
Sie steht vollständig in `web/tools/auslegung/js/config/fields.js` —
`min`/`gt`/`max` an jedem Feld und `PAIRS` für die Regeln zwischen
zwei Feldern. Aus derselben Quelle kommen:

- die Markierung ungültiger Felder in der Seitenleiste (`validate()`),
- die Sperre in `render()` — außerhalb der Domäne wird **nicht gerechnet**,
- die `min`/`max`-Attribute der Eingabefelder im Browser,
- diese Übersicht.

Eine Grenze ändert man an genau einer Stelle. Wer eine neue anlegt und
diese Datei nicht neu erzeugt, bekommt einen roten CI-Lauf.

## Zweierlei Grenzen

| | Bedeutung |
|---|---|
| **hart** | Physikalisch oder definitorisch unmöglich. Ein Durchflussbeiwert über 1 hieße mehr Durchfluss als Antrieb; ein Füllgrad über 100 % ist kein Anteil mehr. |
| plausibel | Schließt nur Absurdes aus, damit die Rechnung nicht mit Unsinn weiterläuft. Großzügig gesetzt — die größte Druckgießmaschine der Welt passt hinein. |

## Felder

### Maschinenwerte

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Maschinenkraft `force` | kN | 16000 | `> 0 … 100000` | plausibel |
| Gießkraft bei Akkudruck max. `injForce` | kN | 1300 | `> 0 … 20000` | plausibel |
| Kolbengeschw. max. `vmax` | m/s | 8,5 | `> 0 … 40` | plausibel |
| Beschleunigung max. `amax` | m/s² | 110 | `0 … 5000` | plausibel |
| Kolben-Ø min. `dmin` | mm | 90 | `> 0 … 500` | plausibel |
| Kolben-Ø max. `dmax` | mm | 150 | `> 0 … 500` | plausibel |
| Kammerlänge min. `lmin` | mm | 450 | `> 0 … 3000` | plausibel |
| Kammerlänge max. `lmax` | mm | 900 | `> 0 … 3000` | plausibel |
| Säulenabstand horizontal `tieX` | mm | 1200 | `> 0 … 6000` | plausibel |
| Säulenabstand vertikal `tieY` | mm | 1200 | `> 0 … 6000` | plausibel |
| Akkumulatordruck max. `pAcc` | bar | 190 | `> 0 … 500` | plausibel |
| Nachdruckaufbauzeit `intTime` | ms | 80 | `0 … 5000` | plausibel |

### Druck und Sprengfläche

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Akkumulatordruck (eingestellt) `pAccOp` | bar | 190 | `> 0 … 500` | plausibel |
| Sprengfläche `area` | m² | 0,15 | `> 0 … 10` | plausibel |
| Nachdruck (metallseitig) `psel` | bar | 600 | `> 0 … 3000` | plausibel |
| Sicherheitsfaktor `safety` | - | 1,3 | `1 … 5` | **hart** |
| Außermittigkeit Schwerpunkt x `eccX` | mm | 0 | `-3000 … 3000` | plausibel |
| Außermittigkeit Schwerpunkt y `eccY` | mm | 0 | `-3000 … 3000` | plausibel |

### Massenbilanz

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Bauteilgewicht `part` | kg | 12 | `> 0 … 1000` | plausibel |
| Angussgewicht `runner` | kg | 3 | `> 0 … 1000` | **hart** |
| Überlaufgewicht `overflow` | kg | 2 | `0 … 1000` | plausibel |
| Pressrestgewicht `biscuit` | kg | 1,2 | `> 0 … 1000` | **hart** |

### Legierungswerte

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Dichte flüssig `density` | kg/m³ | 2400 | `> 0 … 20000` | plausibel |
| Dichte fest `densitySolid` | kg/m³ | 2700 | `> 0 … 20000` | plausibel |
| Schwindmaß `shrink` | % | 0,55 | `> 0 … 5` | plausibel |
| Gießtemperatur `Tcast` | °C | 660 | `> 0 … 2000` | plausibel |
| Min. Fließtemp. `Tflow` | °C | 580 | `> 0 … 2000` | plausibel |
| Z-Konstante `Zconst` | °C/% | 4,8 | `> 0 … 100` | plausibel |
| Erstarrungskonstante `solK` | ms/mm² | 10 | `> 0 … 1000` | plausibel |
| Liquidustemperatur `Tliq` | °C | 593 | `> 0 … 2000` | plausibel |
| Solidustemperatur `Tsol` | °C | 521 | `> 0 … 2000` | plausibel |
| Erstarrungswärme `hf` | kJ/kg | 403 | `> 0 … 2000` | plausibel |
| c_p bei 20 °C `cp20` | J/(kg·K) | 846 | `> 0 … 5000` | plausibel |
| c_p bei Solidus `cpS` | J/(kg·K) | 1034 | `> 0 … 5000` | plausibel |
| c_p bei Liquidus `cpL` | J/(kg·K) | 1056 | `> 0 … 5000` | plausibel |

### Füllkammer und Kolben

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Gewählter Kolben-Ø `diam` | mm | 150 | `> 0 … 500` | plausibel |
| Gewählte Kammerlänge `length` | mm | 900 | `> 0 … 3000` | plausibel |
| Einfüllöffnung verschlossen `sealStroke` | mm | 150 | `> 0 … 3000` | plausibel |

### Anschnitt

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Anschnittfläche `gate` | mm² | 1800 | `> 0 … 100000` | plausibel |
| Anschnittdicke `gateTh` | mm | 3 | `> 0 … 100` | plausibel |
| Durchflussbeiwert `Cd` | - | 0,5 | `> 0 … 1` | **hart** |

### Vakuum und Entlüftung

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Entlüftungsfläche `vent` | mm² | 800 | `> 0 … 100000` | plausibel |
| Entlüftungsspalt `ventGap` | mm | 0,5 | `> 0 … 50` | plausibel |
| Entlüftungskanal Länge `ventLen` | mm | 80 | `> 0 … 5000` | plausibel |
| Enddruck Pumpe / Tank vor Schuss `vacPump` | mbar | 80 | `> 0 … 1013` | **hart** |
| Vakuumtank-Volumen `vacTank` | L | 500 | `> 0 … 100000` | plausibel |
| Vakuum ab Kolbenweg `vacStart` | mm | 150 | `0 … 3000` | plausibel |
| Ventil zu bei Kolbenweg `vacEndStroke` | mm | 700 | `0 … 3000` | plausibel |
| Ventil-Offenzeit `vacEndTime` | ms | 500 | `> 0 … 10000` | plausibel |

### Prozessfenster

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Füllzeit max. `tmax` | ms | 100 | `> 0 … 10000` | plausibel |
| Füllgrad Ziel min. `fillMin` | % | 40 | `0 … 100` | **hart** |
| Füllgrad Ziel max. `fillMax` | % | 60 | `0 … 100` | **hart** |
| Anschnittgeschw. Ziel min. `gateMin` | m/s | 30 | `0 … 200` | plausibel |
| Anschnittgeschw. Ziel max. `gateMax` | m/s | 50 | `0 … 200` | plausibel |
| Max. Entlüftungsgeschw. `vAirMax` | m/s | 150 | `> 0 … 1000` | plausibel |
| Pressrest min. `biscuitMin` | mm | 25 | `0 … 500` | plausibel |
| Zerstäubungsfaktor J min. `JatomMin` | - | 750 | `> 0 … 100000` | plausibel |
| Zerstäubungsfaktor J max. `JatomMax` | - | 6000 | `> 0 … 100000` | plausibel |

### Bauteilgeometrie und Thermik

| Feld | Einheit | Vorgabe | Zulässig | Art |
|---|---|---:|---|---|
| Wandstärke `wall` | mm | 3,5 | `> 0 … 100` | plausibel |
| Wandstärke min. `wallMin` | mm | 1,5 | `> 0 … 100` | plausibel |
| Wandstärke max. `wallMax` | mm | 8 | `> 0 … 100` | plausibel |
| Formtemperatur `Tdie` | °C | 200 | `> 0 … 2000` | plausibel |
| Zul. Erstarrung `Sfrac` | % | 20 | `0 … 100` | **hart** |
| NADCA-Faktor k `kfill` | ms/mm | 35 | `> 0 … 1000` | plausibel |

## Die harten Grenzen im Einzelnen

| Feld | Grenze | Warum sie hart ist |
|---|---|---|
| Sicherheitsfaktor `safety` | `1 … 5` | ein Sicherheitsfaktor unter 1 ist keiner |
| Angussgewicht `runner` | `> 0 … 1000` | ohne Anguss erreicht die Schmelze die Kavität nicht — die Simulation weist es ab |
| Pressrestgewicht `biscuit` | `> 0 … 1000` | ohne Pressrest führte der Kolben bis in die Form — die Simulation weist es ab |
| Durchflussbeiwert `Cd` | `> 0 … 1` | ein Durchflussbeiwert über 1 hieße mehr Durchfluss als Antrieb |
| Enddruck Pumpe / Tank vor Schuss `vacPump` | `> 0 … 1013` | ein Enddruck über dem Umgebungsdruck ist kein Vakuum |
| Füllgrad Ziel min. `fillMin` | `0 … 100` | ein Füllgrad ist ein Anteil und liegt in 0…100 % |
| Füllgrad Ziel max. `fillMax` | `0 … 100` | ein Füllgrad ist ein Anteil und liegt in 0…100 % |
| Zul. Erstarrung `Sfrac` | `0 … 100` | ein Erstarrungsanteil ist ein Anteil und liegt in 0…100 % |

Alle übrigen Grenzen sind Plausibilitätsgrenzen. Sie sind so weit
gesetzt, dass kein reales Werkzeug und keine reale Maschine an sie
stößt — ihre Aufgabe ist allein, Tippfehler und leere Felder daran zu
hindern, in die Rechnung zu gelangen.

## Regeln zwischen zwei Feldern

Bedingungen, die eine Einzelgrenze nicht ausdrücken kann.

| Bedingung | in Worten |
|---|---|
| `dmin` < `dmax` | Kolben-Ø min. muss unter dem Maximum liegen |
| `lmin` < `lmax` | Kammerlänge min. muss unter dem Maximum liegen |
| `wallMin` < `wallMax` | Wandstärke min. muss unter dem Maximum liegen |
| `fillMin` ≤ `fillMax` | Füllgrad-Ziel min. darf das Maximum nicht überschreiten |
| `gateMin` ≤ `gateMax` | Anschnittgeschw.-Ziel min. darf das Maximum nicht überschreiten |
| `JatomMin` < `JatomMax` | Zerstäubungsfaktor min. muss unter dem Maximum liegen |
| `pAccOp` ≤ `pAcc` | Eingestellter Akkumulatordruck über dem Maximum der Maschine |
| `sealStroke` ≤ `length` | Verschluss-Hub muss in der Kammer liegen |
| `Tdie` < `Tflow` | Min. Fließtemperatur muss über der Formtemperatur liegen |
| `Tdie` < `Tliq` | Liquidustemperatur muss über der Formtemperatur liegen |
| `Tsol` < `Tliq` | Liquidus- muss über der Solidustemperatur liegen |
| `Tliq` ≤ `Tcast` | Gießtemperatur darf nicht unter der Liquidustemperatur liegen |
| `dmin` ≤ `diam` ≤ `dmax` | Gewählter Kolben-Ø außerhalb der Maschinengrenzen |
| `lmin` ≤ `length` ≤ `lmax` | Gewählte Kammerlänge außerhalb der Maschinengrenzen |
| `psel` ≤ p_max(Maschine) | Nachdruck über dem spezifischen Gießdruck auf Ø `dmin` — abgeleitet, keine Feldkonstante |

## Was die Sperre erspart

`render()` fragt das Urteil, bevor gerechnet wird. Damit sind die
folgenden Zustände **hinter** der Sperre unerreichbar — die Diagramme
müssen sich nicht mehr einzeln dagegen wehren:

| unerreichbar, weil | betraf bisher |
|---|---|
| kein Feld ist `NaN` oder `Infinity` | die Guards in allen 19 Diagrammen |
| `gate`, `vmax`, `Cd`, `injForce`, `pAcc`, `diam` > 0 | `window.js` (3×), `filltime.js`, `pq2.js` (2×), `area.js`, `machine.js` |
| `Tflow` > `Tdie`, `Tliq` > `Tdie`, `Tliq` > `Tsol` | `ftwall.js`, `bubble.js` (2×) |
| `dmin` < `dmax`, `lmin` < `lmax`, `wallMin` < `wallMax` | Achsen mit Länge null in `render/` |

Was **bleibt**: Prüfungen an *abgeleiteten* Größen. `p_max`, φ, `v₂`, `p₀`
können auch aus gültigen Eingaben unbrauchbar werden — dort ist ein Guard
kein Duplikat, sondern die einzige Stelle, die es merken kann.

---

# Die übrigen Werkzeuge

Teilekosten und Sprengflächenanalyse haben eigene Eingabemengen und
laden klassische Scripts. Ihre Domäne steht deshalb in einer eigenen
Datei — `web/shared/felddomaene.js` — nach demselben Muster: eine
Quelle, aus der die `min`/`max`-Attribute, die Sperre und dieser
Abschnitt kommen.

## Teilekosten-Kalkulation

| Feld | Einheit | Zulässig | Art |
|---|---|---|---|
| Bauteilgewicht je Schuss `mpart` | kg | `> 0 … 1000` | plausibel |
| Schussgewicht `mdose` | kg | `> 0 … 1000` | plausibel |
| Zykluszeit `tz` | s | `1 … 3600` | plausibel |
| Kavitäten `kav` | − | `1 … 200` | plausibel |
| Ausschuss `a` | % | `0 … 99` | **hart** |
| OEE / Verfügbarkeit `oee` | % | `1 … 100` | **hart** |
| Legierungspreis `pAl` | €/kg | `0 … 1000` | plausibel |
| Umschmelzkosten Kreislauf `pRe` | €/kg | `0 … 1000` | plausibel |
| Schmelzverlust (Krätze) `kr` | % | `0 … 20` | plausibel |
| Schmelz- & Warmhalteenergie `eKg` | kWh/kg | `0 … 20` | plausibel |
| Strompreis `pE` | €/kWh | `0 … 10` | plausibel |
| Maschinenstundensatz Zelle `pM` | €/h | `0 … 10000` | plausibel |
| Personal `pP` | €/h | `0 … 1000` | plausibel |
| Bediener je Zelle `nP` | − | `0 … 20` | plausibel |
| Werkzeugkosten `wz` | € | `0 … 10000000` | plausibel |
| Standmenge `st` | Schüsse | `1 … 10000000` | plausibel |
| Eingesparte Masse je Bauteil `dg` | g | `0 … 100000` | plausibel |

Harte Grenzen: `a` — bei 100 % Ausschuss gibt es kein Gutteil, auf das sich Kosten beziehen könnten · `oee` — eine Verfügbarkeit ist ein Anteil; bei 0 % entsteht kein Teil.

| Bedingung | in Worten |
|---|---|
| `mpart` ≤ `mdose` | Bauteilgewicht kann das Schussgewicht nicht übersteigen — die Materialausbeute wäre über 100 % |

## Sprengflächenanalyse

| Feld | Einheit | Zulässig | Art |
|---|---|---|---|
| Schwindmaß s `shrink` | % | `0 … 5` | plausibel |
| Nachdruck (metallseitig) `ptarget` | bar | `1 … 3000` | plausibel |
| Sicherheitsfaktor S `safety` | − | `1 … 5` | **hart** |
| Seitenschieber A_S `coreArea` | mm² | `0 … 1000000` | plausibel |
| Sperrwinkel α `coreAngle` | ° | `0 … 89` | **hart** |

Harte Grenzen: `safety` — ein Sicherheitsfaktor unter 1 ist keiner · `coreAngle` — A·tan(α) wächst bei 90° über alle Grenzen.

Beide Seiten fragen das Urteil, bevor sie rechnen, und lassen bei
Verletzung den letzten gültigen Stand abgeblendet stehen. Vorher stand
die Kalkulation bei 150 % Ausschuss auf `NaN` und lieferte bei 500 %
OEE eine glatte, falsche Zahl — mit einem Hinweis darunter, dass die
Zahlen „nicht belastbar" seien.

---

_86 Felder, davon 12 mit harter Grenze · 16 Regeln zwischen Feldern · erzeugt aus `config/fields.js` und `shared/felddomaene.js`._
