/* Die Felder des Formaufbaus — je Modus ein Abschnitt, dazu die Zeile unter
   „Darstellung". Die Texte, die früher in der Seitenleiste standen (der
   Heizkühlplan, der Schnitt, die Datei), liegen in help.js.

   Teile     Schnellknöpfe, die Gruppen und Teile (js/formaufbau/list.js),
             das Formular „Neue Gruppe" an ihrer Stelle, solange es offen ist
   Schnitt   besitzt die Schnittebene: aufgeschnitten ist nur hier
   Öffnen    besitzt den Öffnungsweg: offen steht die Form nur hier */

import { sliderRow, segRow, checkRow, selectRow, numberRow, factsBlock, warnLine, hintLine, heading, blockButton, info } from '../studio/rows.js';

export const MODES = [
  {
    id: 'teile', label: 'Teile', help: 'teile',
    hint: 'Name tippen hebt hervor, auch im Bild. Farbfeld: Farbe · ⋯: umbenennen, verschieben, entfernen.',
    html: '<div class="fa-quick" data-ui="quick">'
      + '<button type="button" class="btn btn-outline" data-ui="show-all">Alle zeigen</button>'
      + '<button type="button" class="btn btn-outline" data-ui="hl-cooling">Temperierung</button>'
      + '<button type="button" class="btn btn-outline" data-ui="hl-clear" disabled>Aufheben</button>'
      + '</div>'
      + '<div class="fa-list" data-ui="components"></div>'
      + '<div class="fa-form" data-ui="group-form" hidden>'
      + heading('Neue Gruppe' + info('gruppe'))
      + '<label class="row"><span>Name</span><input type="text" data-ui="group-title" placeholder="z. B. Schieber −X" spellcheck="false" autocomplete="off"></label>'
      + segRow({ ui: 'group-side', label: 'Seite', options: [['fix', 'fest'], ['mov', 'beweglich']], value: 'mov' })
      + selectRow({ ui: 'group-mat', label: 'Werkstoffklasse' })
      + selectRow({ ui: 'group-slide', label: 'Schieber' })
      + '<div data-ui="travel-row" hidden>' + numberRow({ ui: 'group-travel', label: 'Schieberweg', unit: 'mm', value: '120' }) + '</div>'
      + warnLine('group-warn')
      + blockButton({ ui: 'group-cancel', label: 'Abbrechen' })
      + '</div>'
  },
  {
    id: 'schnitt', label: 'Schnitt', help: 'schnitt',
    hint: 'Die Form ist aufgeschnitten, solange dieser Reiter gewählt ist. Ein Tipp auf eine Schnittfläche hebt ihr Teil hervor.',
    html: segRow({ ui: 'clip-axis', label: 'Achse', options: [['x', 'X'], ['y', 'Y'], ['z', 'Z']], value: 'x', help: 'schnitt' })
      + sliderRow({ ui: 'clip-pos', label: 'Lage', min: -100, max: 100, step: 1, value: 0 })
      + checkRow({ ui: 'clip-flip', label: 'Seite umkehren' })
      + hintLine('Jede Schnittfläche trägt die Farbe ihres Teils; bei einer Hervorhebung verblassen die der übrigen.')
  },
  {
    id: 'oeffnen', label: 'Öffnen', help: 'oeffnen',
    hint: 'Die Form steht offen, solange dieser Reiter gewählt ist. Schieber fahren zusätzlich in der Trennebene heraus.',
    html: sliderRow({ ui: 'open', label: 'Weg', min: 0, max: 100, step: 1, value: 60, help: 'oeffnen' })
      + factsBlock('open-facts')
  }
];

/* „Darstellung" oben im Bild: was nur die Ansicht betrifft. */
export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Stahl', min: 10, max: 100, step: 1, value: 40, help: 'darstellung' });
