/* Die Felder der Füllabschätzung — je Modus ein Abschnitt, dazu das
   Auswahlfeld im Viewport. Die Texte, die früher unter den Feldern und in
   den title-Attributen standen, liegen in help.js.

   Die Reiter von links nach rechts sind die Arbeit: das Bauteil ansehen,
   Anschnitte setzen, rechnen, das Ergebnis lesen. */

import { numberRow, sliderRow, segRow, kpiBlock, factsBlock, detailsBlock, warnLine, heading, hintLine } from '../studio/rows.js';
import { fmtPlain } from '../studio/format.js';
import { DEFAULTS, ALPHA_RANGE } from './model.js';

export const MODES = [
  {
    id: 'anschnitte', label: 'Anschnitte',
    hint: 'Oben im Bild „Anschnitt setzen", dann aufs Bauteil klicken. Hier steht, was gesetzt ist; ein Klick wählt es.',
    html: heading('Vorgaben für neue Anschnitte')
      + numberRow({ ui: 'def-w', label: 'Breite', unit: 'mm', value: fmtPlain(DEFAULTS.w), help: 'vorgaben' })
      + numberRow({ ui: 'def-h', label: 'Höhe', unit: 'mm', value: fmtPlain(DEFAULTS.h) })
      /* Wie viele gesetzt sind, steht hier — nicht als Zahl am Reiter: vier
         Reiter mit Zahl passen in Firefox nicht mehr in eine 320 px breite
         Seitenleiste, und „Ergebnis" stünde allein in einer zweiten Zeile. */
      + heading('Gesetzt <span class="fu-count" data-ui="item-count"></span>')
      + '<div class="st-list" data-ui="item-list" data-scroll></div>'
      + hintLine('<span data-ui="item-empty">Noch kein Anschnitt gesetzt.</span>')
  },
  {
    id: 'fuellung', label: 'Füllung',
    hint: 'Das Bauteil wird gerastert, die Front läuft von den Anschnitten durch die Zellen: eine Abschätzung, keine Strömung.',
    html: numberRow({ ui: 'cell', label: 'Zellkante', unit: 'mm', value: '3', help: 'zellkante' })
      + warnLine('cell-note')
      + sliderRow({ ui: 'alpha', label: 'Dünnwand-Bremse α', min: ALPHA_RANGE[0], max: ALPHA_RANGE[1], step: 0.1, value: 0.5, help: 'alpha' })
      + kpiBlock('fill-kpis')
      + warnLine('fill-warn')
      + detailsBlock('grid-details', 'Raster', factsBlock('grid-facts'))
  },
  {
    id: 'ergebnis', label: 'Ergebnis',
    hint: 'Der Füllgrad einer Stelle ist der Anteil des Volumens, der voll ist, wenn die Front sie erreicht: eine Reihenfolge, keine Zeit.',
    html: segRow({ ui: 'show-seg', label: 'Anzeige', value: 'koerper', help: 'ansichten',
      options: [['farbe', 'Füllgrad'], ['koerper', 'Füllkörper'], ['grau', 'Bauteil']] })
      + sliderRow({ ui: 'q', label: 'Füllgrad', min: 0, max: 100, step: 1, value: 50, help: 'fuellgrad' })
      + sliderRow({ ui: 'spots-count', label: 'Letzte Stellen', min: 0, max: 20, step: 1, value: 5, help: 'letzte-stellen' })
      + kpiBlock('result-kpis')
      + hintLine('Wo die Front zuletzt ankommt, sammelt sich die Luft: dort gehören die Überläufe hin; der <a href="ueberlauf.html">Überlaufdesigner</a> setzt sie.')
  }
];

/* Das Auswahlfeld des gewählten Anschnitts: drei Gruppen als Reiter
   (js/studio/rows.js, groupTabs) — es steht immer nur eine da, so bleibt
   das Feld kurz genug, um nie zu scrollen.
   „füllt … %" und „Entfernen" stehen darunter, gleich welche Gruppe offen ist.
   Der Anteil sieht aus wie jede Zahlenzeile, wird aber vom Werkzeug selbst
   gelesen: ein LEERES Feld ist hier eine Angabe („aus der Fläche"), keine
   Fehleingabe — was dann gilt, steht als Platzhalter im Feld („auto 63"). */
export const GROUPS = ['Maße', 'Lage', 'Details'];
/* Die Reiter selbst setzt das Werkzeug ein, sobald es eine Auswahl gibt: ohne
   Auswahl trägt die Seite nur die Reiter der Modi. */
export const INSPECTOR = '<div class="st-grouptabs" role="tablist" data-ui="sel-groups" aria-label="Anschnitt"></div>'
  + '<div data-ui="sel-params">'
  + '<div data-group="Maße">'
  + numberRow({ ui: 'sel-w', label: 'Breite', unit: 'mm' })
  + numberRow({ ui: 'sel-h', label: 'Höhe', unit: 'mm' })
  + numberRow({ ui: 'sel-share', label: 'Anteil', unit: '%', value: '', help: 'anteil' })
  + '</div><div data-group="Lage" hidden>'
  + '<div class="row pos"><span>Lage</span><div class="triple">'
  + '<input type="text" data-ui="sel-x" inputmode="decimal" spellcheck="false" aria-label="X">'
  + '<input type="text" data-ui="sel-y" inputmode="decimal" spellcheck="false" aria-label="Y">'
  + '<input type="text" data-ui="sel-z" inputmode="decimal" spellcheck="false" aria-label="Z">'
  + '</div><span class="unit">mm</span></div>'
  + sliderRow({ ui: 'sel-rot', label: 'Drehung', min: -180, max: 180, step: 1, value: 0, help: 'drehung' })
  + '</div><div data-group="Details" hidden>' + factsBlock('sel-facts') + '</div>'
  + '</div>'
  + kpiBlock('sel-kpis')
  + '<button type="button" class="btn btn-sm btn-outline block-btn st-danger" data-ui="del-item">Entfernen</button>';

export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Bauteil', min: 5, max: 100, step: 1, value: 100 });
