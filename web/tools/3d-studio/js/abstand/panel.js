/* Die Felder der Abstandsanalyse — je Modus ein Abschnitt. Die beiden
   Dateien wählt man wie überall das Bauteil: oben in der Kopfzeile, je Datei
   ein Chip mit Klappe (shell.header.addPartChips). Anzeigeoptionen (zeigen,
   Deckkraft) stehen unter „Darstellung" in der Ansichtsleiste. */

import { numberRow, sliderRow, segRow, checkRow, warnLine, blockButton } from '../studio/rows.js';

/* Was in der Klappe der beiden Datei-Chips unter dem Knopf steht. */
export const CHIP_HINT = 'STL oder GLB. Eine Datei, ins Bild gezogen, fragt, ob sie A oder B sein soll.';

/* Ein Menü (Rückmeldung vom 24.09.): die Suchgrenze der Rechnung und die
   Skala, die nur umfärbt, stehen untereinander; die Abstände selbst zeigt
   die Farbe im Viewport mit ihrer Skala, keine Kennzahlen daneben. */
export const MODES = [
  {
    id: 'abstand', label: 'Abstand',
    hint: 'Für jeden Punkt der einen Oberfläche der kürzeste Weg zur anderen, in beide Richtungen. Die Grenzen der Skala färben nur um.',
    html: numberRow({ ui: 'reach', label: 'Suchgrenze', unit: 'mm', value: '50', help: 'suchgrenze' })
      + warnLine('dist-warn')
      + numberRow({ ui: 'scale-min', label: 'Skala Minimum', unit: 'mm', value: '0', help: 'skala' })
      + numberRow({ ui: 'scale-max', label: 'Skala Maximum', unit: 'mm', value: '20', help: 'skala' })
      + blockButton({ ui: 'scale-auto', label: 'Grenzen aus den Messwerten' })
      + segRow({ ui: 'color-seg', label: 'Einfärben', value: 'a', options: [['a', 'nur A'], ['b', 'nur B'], ['both', 'beide']] })
  }
];

export const DARSTELLUNG = checkRow({ ui: 'show-a', label: 'Datei A zeigen', checked: true })
  + checkRow({ ui: 'show-b', label: 'Datei B zeigen', checked: true })
  + sliderRow({ ui: 'opacity', label: 'Deckkraft', min: 15, max: 100, step: 1, value: 100 });
