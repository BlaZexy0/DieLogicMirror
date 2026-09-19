# Wärmebilanz der Zyklusanalyse — Gleichungen und Abgleich mit den Quellen

Die Zyklusanalyse (`web/tools/zyklus/`) rechnet je Zyklus, wie viel Wärme das
Gussstück in die Form trägt, wie viel die Form von selbst verliert, und was
die Temperierung abführen muss. Dieses Dokument nennt die verwendeten
Gleichungen mit den Nummern der Quellen, hält fest, wo die Umsetzung bewusst
von einem Zahlenbeispiel abweicht, und was nicht umgesetzt ist.

Umsetzung: `web/tools/zyklus/zyklus-logic.js` · Test:
`tests/web/waermebilanz.test.mjs`

## Quellen

- **[A]** *Temperiersystem der Druckgießform*, Kap. 5 — Gleichungen (5.x),
  Tabellen 5.3 und 5.4
- **[B]** *Heizung und Kühlung der Druckgießformen mit Temperiergeräten*,
  Kap. 12 — Gleichungen (12.x), Tabellen 12.1 und 12.7

Die Scans liegen außerhalb des Repositorys (`DieLogic/sources/`). Alle unten
genannten Gleichungen wurden am 2026-08-22 gegen die Seitenbilder geprüft.

## Das Modell

Getrieben wird es von Projektdaten: Schussgewicht, Legierungs-Preset samt
Gießtemperatur, Formtemperatur, Sprengfläche bzw. Gravuroberfläche aus der
STL, Säulenabstand der Maschine, Zeitleiste. Die Erfahrungswerte der Quellen
sind Konstanten (`HEAT`), keine Eingaben. Eingegeben werden nur die
Entformungstemperatur, die Abkühlung der Formhaut beim Sprühen, der Anteil
des Ausblasens an der Phase „Sprühen & Ausblasen" und — wer sie kennt — die
Formabmessungen.

### Wärmeeintrag — `meanHeatCapacities`, `heatInput`

Mittlere Wärmekapazitäten nach [B] 12.4.1:

    c_l = ½·(c_S + c_L)                                       halbflüssig
    c_m = c_20 + (t_S + t_e − 40)/(2·t_S − 40) · (c_S − c_20)  Solidus → Entformung

Wärmeeintrag je Zyklus nach (12.2):

    Q = m · [ h_f + c_l·(t_L − t_S) + c_m·(t_S − t_e) ]

Die Überhitzung `m·c_L·(T_gieß − T_liq)` wird getrennt ausgewiesen: sie geht
laut [B] in Gießkammer und feste Aufspannplatte, nicht in die Formgravur.

Die Entformungstemperatur hat eine Domäne: T_Umgebung < t_e < Solidus.
Entformt wird ein festes Teil; oberhalb von Solidus würde der Abkühlterm
negativ, und das Gussstück entzöge der Form Wärme, die es nie abgegeben hat.

### Natürliche Verluste — `heatLosses`

| Term | Gleichung | Umsetzung |
|---|---|---|
| Außentemperatur der Form | (12.3) | `t_fa = t_luft + 0,6·(t_f − 20 °C)` — erste Näherung aus der Formtemperatur in der Tiefe ([B] S. 691); leitet `t_fa` aus `Tdie` des Projekts ab |
| Konvektion + Strahlung | (12.7) + (12.9) | ein Beiwert 7 + 2,7 = 9,7 W/(m²·K) auf `A_fa = 2·L·(B+H)` |
| Aufspannplatten | (12.10) | α_k = 100 W/(m²·K), beide Platten, `A_k = B·H` je Seite, Platten 55 °C |
| Luft zwischen den Hälften | (12.14) | `V_luft = B·H·min(0,30 m, L)` — siehe Abweichungen |
| Ausblasen | (12.15) | α_bl = 40 W/(m²·K) auf der Gravurfläche, Gravur vor dem Gießen = Formtemperatur + 30 K; τ_bl ist die Dauer des AUSBLASENS allein |
| Trennstoffmasse | (12.21) | `m₁ = 0,744 · A_Gravur · x₀ · Δt` mit x₀ = 10 mm — siehe Abweichungen |
| Sprühen | (12.22) | `Q_Spr = 2594 kJ/kg · m₁` |

[A] (5.14) gibt für die ersten beiden Terme zusätzlich Praxisformen an:
`Q_Kon = 1,8·τz·L·(B+H)` und `Q_Pl = 18·τz·B·H` (kJ; L, B, H in m, τz in s;
[A] S. 303). Umgesetzt sind die ausführlichen Formen aus [B].

### Bilanz — `computeHeat`

    Q_T = Q − Q_U          (12.1) / (5.19)
    P_T = Q_T / τz         (5.4)
    k   = Q_T / Q

`Q_T < 0` heißt: die Form verliert mehr, als der Guss einträgt — sie muss
beheizt werden (`deficit`).

### Formabmessungen — `dieFromMachine`

Ohne eigene Angabe geschätzt: B = H = 0,8 × Säulenabstand, L = 0,5·B.

## Zahlenbeispiel [B] S. 705–708 — der Testfall

V = 300 cm³, ρ_L = 2445 kg/m³, c_20 = 846, c_S = 1034, c_L = 1056 J/(kg·K),
h_f = 403 kJ/kg, t_S = 521, t_L = 593, t_e = 320 °C → **Q = 496,63 kJ**.

Verluste mit τz = 60 s, τ_bl = 10 s, A_fa = 0,34, A_k1 = 0,18, A_k2 = 0,2,
A_fgr = 0,05 m², t_f = 200, t_fomin = 240, t_fa = 140, t_fa1 = 130,
t_fa2 = 120, t_pl1 = 60, t_pl2 = 50, t_luft = 20, t_luft1 = 80,
t_luft2 = 20 °C, V_luft = 0,06 m³, m₁ = 0,02 kg, α_kon = 7, α_str = 2,7,
α_k = 100, α_bl = 40 W/(m²·K) →

| Q_Kon+Str | Q_Pl | Q_Luft | Q_Bl | Q_Spr | Q_U | Q_Ts |
|---|---|---|---|---|---|---|
| 23,75 | 159,6 | 3,6 | 5,2 | 52 | 244,15 | 252,48 kJ |

## Wo die Umsetzung bewusst abweicht

- **c_m.** Das Beispiel nennt `c_m = 989,21 J/(kg·K)`; die gedruckte Formel
  ergibt mit den Beispieldaten 996,29. Q wird damit 497,68 kJ (+0,2 %). Die
  Umsetzung folgt der gedruckten Formel.
- **Q_Spr.** Das Beispiel rechnet `2600·m₁`, obwohl (12.22) 2594 nennt. Die
  Umsetzung nimmt 2594 (→ 51,88 kJ).
- **Δt in (12.21)** ist der Abfall der besprühten FORMHAUT (t_spr1 − t_spr2):
  ρ_f, c_f und x₀ sind Formstoffgrößen (12.19). Eine frühere Fassung setzte
  Entformungs- minus Formtemperatur ein — die liegt bei 100–120 K und
  verdoppelte Q_Spr. Beide Zahlenbeispiele der Quelle arbeiten mit ≈ 50 K
  (S. 705: A = 0,4 m², Δ = 50 K → 0,15 kg). Vorgabe 50 K, als Eingabe
  überschreibbar, weil sie am Sprühregime hängt.
- **V_luft in (12.13/12.14)** ist die Luft ZWISCHEN den geöffneten Hälften.
  Eine frühere Fassung nahm B·H·L — das ganze Formvolumen, also einen
  Stahlblock. Maßgeblich ist die Formfläche mal dem Öffnungsspalt (0,30 m,
  höchstens die Formtiefe).

## Zum Gegenprüfen

Tabelle 12.1 (Q/V je Legierung und Entformungstemperatur) und Tabelle 5.3
(q je Legierung) stimmen mit (12.2) auf wenige Prozent überein. Mit ihnen
wurden die Thermikdaten der Beispiellegierungen geprüft
(`web/shared/examples/alloys.js`: Tliq, Tsol, hf, cp20, cpS, cpL).

## Nicht umgesetzt

Die Bilanz endet bei der erforderlichen Temperierleistung P_T = Q_T/τz.
Nicht umgesetzt sind die Kapazitätsprüfung des Temperierkreises (5.8–5.9,
5.20–5.26), Druckverlust und Pumpenprüfung (5.27–5.29, 5.10) und der
Aufwärmvorgang (5.31–5.37).

Für ein späteres Temperierkreis-Modell ist das Beispiel [A] S. 298–299
festgehalten: G = 2 kg, q = 700 kJ/kg, k = 0,5, τz = 70 s → P_T = 10 kW (5.4);
d = 10 mm, w = 2 m/s, n₁ = 4, n₂ = 2 → V̇₁ = 37,68, V̇₂ = 18,84 l/min (5.9);
mit Marlotherm SH bei 140 °C (ρ = 958 kg/m³, c = 1990 J/(kg·K)) und ΔT = 6 K
→ P_T1 = 7,18 kW, P_T2 = 3,59 kW (5.5).
