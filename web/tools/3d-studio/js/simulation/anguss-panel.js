/* Die Felder der Angussfüllung — je Modus ein Abschnitt, von links nach
   rechts in der Reihenfolge der Arbeit: System (was gefüllt wird) · Prozess
   (womit) · Simulation (wie gerechnet wird) · Ergebnis. Das Angusssystem
   selbst wählt man oben im Anguss-Chip der Kopfzeile; „Deckkraft Anguss"
   steht unter „Darstellung" in der Ansichtsleiste. */

import { numberRow, selectRow, segRow, sliderRow, kpiBlock, warnLine } from '../studio/rows.js';
import { SIMULATION_ROWS, resultRows } from './panel-common.js';

export const MODES = [
  {
    id: 'system', label: 'System',
    hint: 'Das Angusssystem, das gefüllt wird. Ein anderes: oben über den Anguss-Chip, oder eine Angussdatei (JSON) ins Bild ziehen.',
    html: kpiBlock('graph-kpis') + '<div class="st-hintline" data-ui="graph-note"></div>' + warnLine('graph-warn')
  },
  {
    id: 'prozess', label: 'Prozess',
    hint: 'Die Rechnung beginnt bei „Kammer voll": die Schmelze steht im Pressrest, und der Kolben schiebt mit der DieLogic-Kurve.',
    html: selectRow({ ui: 'alloy', label: 'Legierung', help: 'prozess' })
      + numberRow({ ui: 'vol', label: 'Gussvolumen', unit: 'cm³', value: '420', help: 'gussvolumen' })
      + numberRow({ ui: 'chamber-len', label: 'Füllkammerlänge', unit: 'mm', value: '450', help: 'kammerlaenge' })
      + kpiBlock('curve-kpis') + warnLine('curve-warn')
  },
  {
    id: 'simulation', label: 'Simulation',
    hint: 'Zwei Verfahren für dieselbe Frage: eine schnelle Rechnung für Reihenfolge und Zeiten, keine Gießsimulation.',
    html: SIMULATION_ROWS
  },
  {
    id: 'ergebnis', label: 'Ergebnis',
    hint: 'Wann die Schmelze an jedem Anschnitt ankommt, neben der 1D-Rechnung des Angussdesigners.',
    /* „Zeigen" steht nur da, wenn es etwas zu wählen gibt: Ankunftsfarben kennt nur das Gitter. */
    html: resultRows('<div data-ui="show-row">'
      + segRow({ ui: 'show-seg', label: 'Zeigen', value: 'schmelze', options: [['schmelze', 'Schmelze'], ['ankunft', 'Ankunft']], help: 'anzeige' })
      + '</div>')
  }
];

export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Anguss', min: 5, max: 100, step: 1, value: 30 });
