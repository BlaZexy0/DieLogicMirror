/* Die Felder des Überlaufdesigners — je Modus ein Abschnitt, dazu das
   Auswahlfeld im Viewport. Die Texte, die früher in der Seitenleiste
   standen, liegen in help.js. */

import { sliderRow, selectRow, kpiBlock, factsBlock, hintLine } from '../studio/rows.js';

export const MODES = [
  {
    id: 'elemente', label: 'Elemente',
    hint: 'Oben im Bild eine Art wählen, dann aufs Bauteil klicken. Hier steht, was gesetzt ist — ein Klick wählt es.',
    html: '<div class="st-list" data-ui="item-list" data-scroll></div>'
      + hintLine('<span data-ui="item-empty">Noch nichts gesetzt.</span>')
  },
  {
    id: 'volumen', label: 'Volumen',
    hint: 'Was die Überläufe fassen, gehört zum Schussgewicht.',
    html: kpiBlock('plan-kpis')
      + hintLine('„Gesamt" ist das Gussvolumen, das der Angussdesigner unter „Prozess" braucht.', 'volumen')
  }
];

/* Das Auswahlfeld: feste Zeilen, die Maße der Art kommen je Auswahl dazu. */
export const INSPECTOR = selectRow({ ui: 'sel-type', label: 'Art', options: [] })
  + '<div class="row pos"><span>Lage</span><div class="triple">'
  + '<input type="text" data-ui="sel-x" inputmode="decimal" spellcheck="false" aria-label="X">'
  + '<input type="text" data-ui="sel-y" inputmode="decimal" spellcheck="false" aria-label="Y">'
  + '<input type="text" data-ui="sel-z" inputmode="decimal" spellcheck="false" aria-label="Z">'
  + '</div><span class="unit">mm</span></div>'
  + sliderRow({ ui: 'sel-rot', label: 'Drehung', min: -180, max: 180, step: 1, value: 0, help: 'drehung' })
  + '<div class="st-grouptabs" role="tablist" data-ui="sel-groups" aria-label="Maße"></div>'
  + '<div data-ui="sel-params"></div>'
  + factsBlock('sel-facts')
  + '<div data-ui="vent-block" hidden><h2>Entlüftungskanal</h2>'
  + '<div class="st-hintline" data-ui="vent-note"></div>'
  + '<div class="btn-pair"><button type="button" class="btn btn-sm btn-outline" data-ui="vent-add">+ Punkt</button>'
  + '<button type="button" class="btn btn-sm btn-outline" data-ui="vent-del">− Punkt</button></div></div>'
  + '<button type="button" class="btn btn-sm btn-outline block-btn st-danger" data-ui="del-item">Entfernen</button>';

export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Bauteil', min: 5, max: 100, step: 1, value: 100 });
