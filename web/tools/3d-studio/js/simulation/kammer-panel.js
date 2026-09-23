/* Die Felder der Kammerfüllung — je Modus ein Abschnitt: Kammer (der
   liegende Zylinder) · Schusskurve (was der Kolben fährt) · Simulation ·
   Ergebnis. „Deckkraft Kammer" steht unter „Darstellung", der Zeitregler
   unter dem Hauptknopf (panel-common.js, PLAYBACK_ROWS). */

import { numberRow, selectRow, segRow, sliderRow, kpiBlock, warnLine } from '../studio/rows.js';
import { simulationRows, resultRows } from './panel-common.js';
import { ENGINES, engineIds } from './core.js';

/* Die Verfahren dieses Werkzeugs, in der Reihenfolge von core.js (ALL_IDS):
   Metamodell, Gitter, Partikel — das erste ist die Vorgabe. */
const ENGINE_OPTIONS = engineIds('kammer').map(id => [id, ENGINES[id].label]);

export const MODES = [
  {
    id: 'kammer', label: 'Kammer',
    hint: 'Die Füllkammer als liegender Zylinder: Die Schmelze steht beim Start ruhig unten, der Auslass sitzt oben in der Stirnfläche.',
    html: numberRow({ ui: 'sl-d', label: 'Durchmesser', unit: 'mm', value: '90', help: 'kammer' })
      + numberRow({ ui: 'sl-len', label: 'Länge', unit: 'mm', value: '450', help: 'kammer' })
      + sliderRow({ ui: 'sl-fill', label: 'Füllgrad', min: 10, max: 90, step: 1, value: 40, help: 'fuellgrad' })
      /* Der Auslass ist keine Eingabe: er folgt dem Durchmesser (kammer.js). */
      + kpiBlock('sleeve-kpis')
  },
  {
    /* „Kurve", nicht „Schusskurve": vier Reiter sollen in EINE Zeile passen — auch in Firefox' breiterer Schrift. */
    id: 'kurve', label: 'Kurve',
    hint: 'Die Schusskurve: aus dem Projekt, zweistufig v₁ / v₂ oder eigene Wegpunkte.',
    html: segRow({ ui: 'curve-seg', label: 'Kurve', value: 'dielogic', options: [['dielogic', 'DieLogic'], ['v1v2', 'v₁ / v₂'], ['punkte', 'Punkte']], help: 'kurve' })
      /* Wegpunkte wie im Dashboard: Weg s [mm] und Kolbengeschwindigkeit v [m/s],
         dazwischen konstant beschleunigt; (0 mm, 0 m/s) kommt von selbst dazu. */
      + '<div data-ui="punkte-block" hidden>'
      + '<div class="kf-punkt kf-kopf"><span>Weg</span><span>mm</span><span>v</span><span>m/s</span><span></span></div>'
      + '<div data-ui="punkte-liste"></div>'
      + '<button type="button" class="btn btn-outline block-btn kf-plus" data-ui="punkt-plus">+ Punkt</button>'
      + '</div>'
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
    hint: 'Drei Verfahren für dieselbe Welle: vom Kolbenstart, bis die Schmelze den Auslass erreicht.',
    html: simulationRows(ENGINE_OPTIONS)
  },
  {
    id: 'ergebnis', label: 'Ergebnis',
    hint: '„Kammer voll" gegen die Kurve, dazu die eingeschlossene Luft.',
    html: resultRows(ENGINE_OPTIONS)
  }
];

export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Kammer', min: 5, max: 100, step: 1, value: 25 });
