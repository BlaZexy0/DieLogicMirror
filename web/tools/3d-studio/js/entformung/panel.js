/* Die Felder der Entformungsanalyse — je Modus ein Abschnitt. Die
   Erklärungen, die früher darunter standen, liegen in help.js; die Legende
   der Regionen steht im Viewport (unten rechts), nicht mehr in der Leiste. */

import { sliderRow, segRow, checkRow, kpiBlock, factsBlock, detailsBlock, warnLine } from '../studio/rows.js';

export const MODES = [
  {
    id: 'entformung', label: 'Entformung',
    hint: 'Welche Fläche entformt wohin: Formhälften, Schieber, Hinterschnitt. Sofort beim Laden.',
    html: segRow({ ui: 'axis-seg', label: 'Formöffnung', value: 'auto', help: 'regeln',
      options: [['auto', 'Auto'], ['0', 'X'], ['1', 'Y'], ['2', 'Z']] })
      + segRow({ ui: 'mov-seg', label: 'Bewegliche Seite', value: '1', help: 'bewegliche-seite', options: [['1', '+Z'], ['-1', '−Z']] })
      + '<div class="st-hintline" data-ui="analysis-state"></div>'
      + segRow({ ui: 'mode-seg', label: 'Einfärbung', value: 'regions', options: [['regions', 'Regionen'], ['draft', 'Schräge']] })
      + '<div data-ui="draft-block" hidden>'
      + sliderRow({ ui: 'draft-limit', label: 'Grenzwert', min: 0.5, max: 5, step: 0.1, value: 1.5, help: 'schraege' })
      + '</div>'
      + kpiBlock('seg-kpis')
      + checkRow({ ui: 'show-parting', label: 'Trennlinie zeigen (<span data-ui="parting-count">0</span> Kanten)', checked: true })
      + detailsBlock('seg-details', 'Rechnung', factsBlock('seg-facts'))
  },
  {
    id: 'formteile', label: 'Formteile',
    hint: 'Jede Region wird zum Formteil und rückt entlang ihrer Entformrichtung heraus, wie beim Öffnen der Form.',
    html: sliderRow({ ui: 'die-dist', label: 'Abstand', min: 0, max: 300, step: 1, value: 60, help: 'formteile' })
      + sliderRow({ ui: 'die-skirt', label: 'Rand', min: 0, max: 500, step: 1, value: 8, help: 'formteile' })
      + checkRow({ ui: 'die-part', label: 'Bauteil durchscheinend dazwischen', checked: true })
      + '<div class="pieces" data-ui="die-pieces"></div>'
  },
  {
    id: 'flaechen', label: 'Flächen',
    hint: 'Die projizierte Fläche je Formteil, als Silhouette jenseits des Bauteils, in seiner Entformrichtung.',
    html: kpiBlock('proj-kpis')
      + sliderRow({ ui: 'proj-gap', label: 'Abstand', min: 0, max: 500, step: 1, value: 30, help: 'flaechen' })
      + sliderRow({ ui: 'proj-alpha', label: 'Deckkraft', min: 10, max: 100, step: 5, value: 60 })
  },
  {
    id: 'haftung', label: 'Haftung',
    hint: 'Wo das Teil beim Erstarren auf die Form aufschrumpft, und auf welcher Seite es beim Öffnen bleibt.',
    html: sliderRow({ ui: 'ej-mu', label: 'Reibwert μ', min: 0.1, max: 0.6, step: 0.05, value: 0.3, help: 'haftung' })
      + kpiBlock('ej-kpis')
      + warnLine('ej-warn')
      + sliderRow({ ui: 'ej-gap', label: 'Abstand', min: 0, max: 500, step: 1, value: 30 })
      + sliderRow({ ui: 'ej-alpha', label: 'Deckkraft', min: 10, max: 100, step: 5, value: 70 })
  }
];

/* Das Aufklappfeld „Darstellung" der Ansichtsleiste: was nur die Anzeige
   betrifft. (Die Netzkanten standen im Modus „Bauteil"; den gibt es nicht
   mehr — was er vom Bauteil sagte, steht in der Bauteil-Klappe der Kopfzeile.) */
export const DARSTELLUNG = checkRow({ ui: 'show-edges', label: 'Netzkanten zeigen', help: 'netz' });
