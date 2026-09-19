/* Die Felder der Kammerfüllung — je Modus ein Abschnitt: Kammer (der
   liegende Zylinder) · Schusskurve (was der Kolben fährt) · Simulation ·
   Ergebnis. „Deckkraft Kammer" steht unter „Darstellung". */

import { numberRow, selectRow, segRow, sliderRow, kpiBlock, warnLine } from '../studio/rows.js';
import { SIMULATION_ROWS, resultRows, info } from './panel-common.js';

const field = (name, label) => '<input type="text" inputmode="decimal" data-ui="' + name + '" aria-label="' + label + '" spellcheck="false" autocomplete="off">';

export const MODES = [
  {
    id: 'kammer', label: 'Kammer',
    hint: 'Die Füllkammer als liegender Zylinder: Die Schmelze steht beim Start ruhig unten, der Laufkanal sitzt oben in der Stirnfläche.',
    html: numberRow({ ui: 'sl-d', label: 'Durchmesser', unit: 'mm', value: '90', help: 'kammer' })
      + numberRow({ ui: 'sl-len', label: 'Länge', unit: 'mm', value: '450', help: 'kammer' })
      + sliderRow({ ui: 'sl-fill', label: 'Füllgrad', min: 10, max: 90, step: 1, value: 40, help: 'fuellgrad' })
      /* Zwei Maße, eine Zeile — kein <label>, das gehörte nur zum ersten Feld. */
      + '<div class="row"><span>Laufkanal' + info('laufkanal') + '</span><div class="sim-pair">'
      + field('sl-ow', 'Laufkanal Breite') + '<span class="x">×</span>' + field('sl-oh', 'Laufkanal Tiefe') + '</div><span class="unit">mm</span></div>'
      + kpiBlock('sleeve-kpis')
  },
  {
    /* „Kurve", nicht „Schusskurve": vier Reiter sollen in EINE Zeile passen — auch in Firefox' breiterer Schrift. */
    id: 'kurve', label: 'Kurve',
    hint: 'Die Schusskurve: die DieLogic-Kurve des Projekts mit Kammer und Füllgrad von hier, oder zweistufig v₁ / v₂.',
    html: segRow({ ui: 'curve-seg', label: 'Kurve', value: 'dielogic', options: [['dielogic', 'DieLogic'], ['v1v2', 'v₁ / v₂']], help: 'kurve' })
      + '<div data-ui="v1v2-block" hidden>'
      + numberRow({ ui: 'sl-v1', label: 'v₁', unit: 'm/s', value: '0,5' })
      + numberRow({ ui: 'sl-v2', label: 'v₂', unit: 'm/s', value: '2' })
      + numberRow({ ui: 'sl-a', label: 'Beschleunigung', unit: 'm/s²', value: '100', help: 'kurve' })
      + '</div>'
      + selectRow({ ui: 'alloy', label: 'Legierung' })
      + kpiBlock('curve-kpis') + warnLine('curve-warn')
  },
  {
    id: 'simulation', label: 'Simulation',
    hint: 'Zwei Verfahren für dieselbe Welle: vom Kolbenstart, bis die Schmelze den Laufkanal erreicht.',
    html: SIMULATION_ROWS
  },
  {
    id: 'ergebnis', label: 'Ergebnis',
    hint: '„Kammer voll" gegen die Kurve, dazu die eingeschlossene Luft.',
    html: resultRows('', 'zeit')
  }
];

export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Kammer', min: 5, max: 100, step: 1, value: 25 });
