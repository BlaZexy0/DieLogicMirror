# Mockups — Funktionsentwürfe (nicht verdrahtet)

Designentwürfe für geplante Funktionen: vollständige, live rechnende Seiten
im DieLogic-Look, aber **bewusst ohne Verdrahtung** — kein Eintrag in
`nav.js`, keine Kachel auf der Startseite, keine Tests, kein Backend.
Jede Seite trägt oben einen gelben `draft-note`-Hinweis (Muster der
Rechtsseiten). Die gespeicherte Dashboard-Auslegung wird über den
gemeinsamen Vertrag (`app/shared/contract.js`, `STORAGE_KEY`) **nur
gelesen**, nie geschrieben; ohne gespeicherten Stand gelten die
Dashboard-Defaults aus `app/js/config/fields.js` (als Fallback dupliziert).

| Seite | Inhalt |
|---|---|
| `zyklus-analyse.html` | Wärmebilanz je Zyklus (Überhitzung + Erstarrungsenthalpie + Abkühlung bis Entnahme), Zykluszeit-Bausteine, mittlere Wärmeleistung, Aufteilung Temperierung/Sprühen/Verluste, Kühlwasser- und Sprühwasserbedarf, Haltezeit-Prüfung k·s² |
| `istkurven-vergleich.html` | Messschrieb (CSV s_mm;v) über die Soll-Schusskurve der Auslegung legen; automatische Kennwerte: Umschaltpunkt, v₁ vs. v_krit, v₂-Mittel, Füllzeit vs. t_max, RMS-Abweichung; Demo-Messschrieb mit typischen Fehlerbildern |

Ehemals hier: `teilekosten.html` — nach diesem Plan verdrahtet und nach
`site/kosten/teilekosten.html` umgezogen (Rechenkern
`kosten/teilekosten-logic.js`, Preise als Preset `app/config/kosten.js`).

## Aufbau (bei beiden gleich)

- Kopf wie `stl/stl-analyse.html`: `shared.css` + `nav.js` (`data-base=".."`),
  `page-hero` mit `hero-tags`, Inhalt in einer 1100-px-Spalte.
- Inline-`<script>` in zwei klar getrennten Teilen: **Rechenkern**
  (reine Funktionen, kein DOM) und **Verdrahtung** (Eingaben lesen,
  KPI-Kacheln/SVGs schreiben). Diagramme sind handgezeichnetes SVG ohne
  Abhängigkeiten.
- Formeln im `.eq`-Markup mit Live-Werten (`data-m`), wie die
  Mathe-Panels der Einzelseiten.

## Verdrahtungsplan (wenn eine Seite ernst wird)

1. **Rechenkern extrahieren und testen:** den Logik-Block in eine eigene
   Datei heben (`zyklus-logic.js` usw., klassisches Script mit
   CommonJS-Export wie `stl/stl-logic.js`) und in
   `site/tests/frontend.test.mjs` mit Sollwerten testen.
2. **Physik nicht duplizieren:** `istkurven-vergleich` ersetzt seine
   Minimal-Kopien (`sampleProfile`, Ereignislagen, Nogowizin-Näherung)
   durch `app/js/core/physics.js` (buildProfile, computeShot) und die
   CFD-Tabelle (`core/vkritTable.js`) — dafür wird die Seite ein
   ES-Modul-Einstieg wie `app/js/single.js` oder bekommt einen kleinen
   Port der Tabelle.
3. **Neue Felder an ihren Ort:** Stoffwerte T_L, c_p,fl, c_p,f, ΔH_S
   gehören in die Legierungs-Presets (`app/config/alloys.js`) —
   `hpdcsim.Melt` kennt `liquidus`/`solidus`/`latent_heat` bereits;
   Zyklus-Bausteine und Kostensätze als eigene Preset-Dateien
   (`config/zyklus.js`, `config/kosten.js`) nach dem Muster von
   `machines.js`.
4. **Navigation und Startseite:** Eintrag in `nav.js` (`NAV_LINKS`) und
   eine `tool-card` auf `index.html#werkzeuge`; die Diagrammliste
   `CHARTS` bleibt unberührt (dafür wacht der Konsistenztest
   nav ↔ registry).
5. **Übernahme statt Duplikat:** Werte, die aus dem Dashboard kommen
   (Massen, T_gieß, Wandstärke, Kurve), bleiben dort die Quelle; eine
   Rückgabe (z. B. Zykluszeit → Teilekosten) läuft wie die STL-Übernahme
   über `app/shared/contract.js` — neue Schlüssel zuerst dort ergänzen
   und den Vertragstest erweitern.
6. **Aufräumen:** verdrahtete Seiten wandern aus `mockups/` an ihren
   endgültigen Ort (`site/zyklus/…`), der `draft-note`-Kasten wird
   gelöscht, dieser Ordner-README-Eintrag ebenso.

Alle Zahlenwerte (Stoffwerte, Preise, Erfahrungsanteile) sind
Richt-/Beispielwerte und vor Produktivnutzung zu prüfen — wie bei den
Legierungs-Presets dokumentiert.
