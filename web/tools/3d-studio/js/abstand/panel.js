/* Die Felder der Abstandsanalyse — je Modus ein Abschnitt. Die beiden
   Dateiquellen tragen ids mit Suffix („-a", „-b"): js/part/partsource.js
   findet seine Felder darüber. Anzeigeoptionen (zeigen, Deckkraft) stehen
   unter „Darstellung" in der Ansichtsleiste. */

import { numberRow, sliderRow, segRow, checkRow, kpiBlock, factsBlock, detailsBlock, warnLine, heading, blockButton } from '../studio/rows.js';

const ACCEPT = '.stl,.glb,model/stl,model/gltf-binary,application/sla';
const fileBlock = (k, K) => heading('Datei ' + K)
  + '<label class="row"><span>Beispielteil</span><select id="demo-select-' + k + '"></select></label>'
  + '<input type="file" id="stl-input-' + k + '" accept="' + ACCEPT + '" hidden>'
  + '<button type="button" class="btn btn-outline block-btn" id="stl-btn-' + k + '">Datei ' + K + ' öffnen …</button>'
  + '<div class="warn-line" id="model-warn-' + k + '"></div>';

export const MODES = [
  {
    id: 'dateien', label: 'Dateien',
    hint: 'Zwei Dateien, ein Abstand. Eine STL oder GLB, ins Bild gezogen, fragt, ob sie A oder B sein soll.',
    html: fileBlock('a', 'A') + fileBlock('b', 'B')
  },
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
