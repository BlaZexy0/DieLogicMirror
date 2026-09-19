/* Die Felder der Wandstärkenanalyse — je Modus ein Abschnitt. Die Texte,
   die früher darunter standen, liegen in help.js. */

import { numberRow, sliderRow, segRow, kpiBlock, factsBlock, detailsBlock, warnLine } from '../studio/rows.js';

export const MODES = [
  {
    id: 'feld', label: 'Feld',
    hint: 'Ein Raster über das Bauteil, je Punkt der Abstand zur Oberfläche: die Grundlage für alles Weitere.',
    html: numberRow({ ui: 'cell', label: 'Zellkante', unit: 'mm', value: '3', help: 'zellkante' })
      + '<div class="st-hintline" data-ui="field-cost"></div>'
      + warnLine('field-warn')
      + kpiBlock('field-kpis')
      + detailsBlock('field-details', 'Raster', factsBlock('field-facts'))
  },
  {
    id: 'isoflaeche', label: 'Isofläche',
    hint: 'Die Fläche gleichen Abstands nach innen: was dicker ist als das doppelte Untermaß, bleibt stehen.',
    html: numberRow({ ui: 'under', label: 'Untermaß', unit: 'mm', value: '2', help: 'isoflaeche' })
      + '<div class="row"><span></span><input type="range" data-ui="under-slider" min="0" max="40" step="0.5" value="2" aria-label="Untermaß"></div>'
      + segRow({ ui: 'show-seg', label: 'Anzeige', value: 'both', options: [['both', 'beide'], ['offset', 'Isofläche'], ['part', 'Bauteil']] })
      + kpiBlock('offset-kpis')
      + detailsBlock('offset-details', 'Zahlen', factsBlock('offset-facts'))
  },
  {
    id: 'schnitt', label: 'Schnitt',
    hint: 'Ein Schnitt durch das Feld: innen die Wandstärke in der Turbo-Skala, außen grau.',
    html: segRow({ ui: 'slice-seg', label: 'Achse', value: '2', options: [['0', 'X'], ['1', 'Y'], ['2', 'Z']] })
      + sliderRow({ ui: 'slice-pos', label: 'Position', min: 0, max: 100, step: 1, value: 50 })
  },
  {
    id: 'waermezentren', label: 'Wärmezentren',
    hint: 'Die dicksten Stellen als Kugeln: Dort erstarrt das Teil zuletzt.',
    html: segRow({ ui: 'hot-seg', label: 'Form', value: 'kugeln', options: [['kugeln', 'Kugeln'], ['kreise', 'Kreise']] })
      + sliderRow({ ui: 'hot-min', label: 'ab', min: 20, max: 100, step: 5, value: 75, help: 'waermezentren' })
      + kpiBlock('hot-kpis')
      + warnLine('hot-note')
  }
];

/* Das Aufklappfeld „Darstellung" der Ansichtsleiste — der Knopf trägt den
   Namen schon, eine Überschrift braucht es darin nicht. */
export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Bauteil', min: 10, max: 100, step: 1, value: 35 });
