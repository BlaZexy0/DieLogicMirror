/* Die Felder der Abstandsanalyse — je Modus ein Abschnitt. Die beiden
   Dateien wählt man wie überall das Bauteil: oben in der Kopfzeile, je Datei
   ein Chip mit Klappe (shell.header.addPartChips). Anzeigeoptionen (zeigen,
   Deckkraft) stehen unter „Darstellung" in der Ansichtsleiste. */

import { numberRow, sliderRow, segRow, checkRow, kpiBlock, factsBlock, detailsBlock, warnLine, blockButton } from '../studio/rows.js';

/* Was in der Klappe der beiden Datei-Chips unter dem Knopf steht. */
export const CHIP_HINT = 'STL oder GLB. Eine Datei, ins Bild gezogen, fragt, ob sie A oder B sein soll.';

export const MODES = [
  {
    id: 'abstand', label: 'Abstand',
    hint: 'Für jeden Punkt der einen Oberfläche der kürzeste Weg zur anderen — exakt, in beide Richtungen.',
    html: numberRow({ ui: 'reach', label: 'Suchgrenze', unit: 'mm', value: '50', help: 'suchgrenze' })
      + kpiBlock('dist-kpis')
      + warnLine('dist-warn')
      + detailsBlock('dist-details', 'Rechnung', factsBlock('dist-facts'))
  },
  {
    id: 'skala', label: 'Skala',
    hint: 'Die Grenzen der Farbskala färben nur um, sie rechnen nichts neu: erst „zwischen 8 und 20 mm" macht aus der Karte eine Aussage.',
    html: numberRow({ ui: 'scale-min', label: 'Minimum', unit: 'mm', value: '0', help: 'skala' })
      + numberRow({ ui: 'scale-max', label: 'Maximum', unit: 'mm', value: '20', help: 'skala' })
      + blockButton({ ui: 'scale-auto', label: 'Grenzen aus den Messwerten' })
      + segRow({ ui: 'color-seg', label: 'Einfärben', value: 'a', options: [['a', 'nur A'], ['b', 'nur B'], ['both', 'beide']] })
  }
];

export const DARSTELLUNG = checkRow({ ui: 'show-a', label: 'Datei A zeigen', checked: true })
  + checkRow({ ui: 'show-b', label: 'Datei B zeigen', checked: true })
  + sliderRow({ ui: 'opacity', label: 'Deckkraft', min: 15, max: 100, step: 1, value: 100 });
