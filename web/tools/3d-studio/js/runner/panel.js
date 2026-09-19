/* Die Felder des Angussdesigners — je Modus ein Abschnitt, dazu das
   Auswahlfeld im Viewport, die Anzeigeoptionen und das Flussschema. Die
   langen Erklärungen, die früher in der Seitenleiste und in den
   title-Attributen standen, liegen in help.js; ein ⓘ führt dorthin.

   Die Reihenfolge der Modi ist die der Arbeit: erst das System (welches,
   an welchem Bauteil, mit welchem Pressrest), dann die Form der Kanäle,
   dann der Prozess, der die Querschnitte bestimmt — und am Ende die
   Prüfung. */

import {
  numberRow, sliderRow, segRow, selectRow, checkRow, kpiBlock, factsBlock, detailsBlock, warnLine, heading
} from '../studio/rows.js';

/* Ein ⓘ hinter einer Zwischenüberschrift — wie das der Zeilen (rows.js), nur
   ohne Feld davor. */
const info = anchor => ' <button type="button" class="st-info" data-help="' + anchor + '" aria-label="Erklärung">ⓘ</button>';

export const MODES = [
  {
    id: 'system', label: 'System',
    hint: 'Einen Punkt anklicken wählt ihn; die Knöpfe über dem Bild hängen den nächsten an.',
    html: selectRow({ ui: 'preset', label: 'Beispiel', options: [] })
      + '<div class="st-hintline" data-ui="graph-note"></div>'
      + warnLine('graph-warn')
      + heading('Referenzbauteil' + info('referenz'))
      + kpiBlock('ref-kpis')
      + heading('Pressrest')
      + numberRow({ ui: 'bisc-d', label: 'Durchmesser', unit: 'mm', value: '90', help: 'pressrest' })
      + numberRow({ ui: 'bisc-t', label: 'Dicke', unit: 'mm', value: '25', help: 'pressrest' })
      + segRow({ ui: 'axis-seg', label: 'Richtung', value: '+y', help: 'richtung', stack: true,
        options: [['+x', 'X'], ['+y', 'Y'], ['+z', 'Z'], ['-x', '−X'], ['-y', '−Y'], ['-z', '−Z']] })
      + detailsBlock('system-details', 'Kennzahlen', factsBlock('system-facts'))
  },
  {
    id: 'kanalform', label: 'Kanalform',
    hint: 'Der Trapezquerschnitt aller Kanäle und die Vorgaben, nach denen „Querschnitte abstufen" sie bemisst.',
    html: sliderRow({ ui: 'draft', label: 'Entformschräge', min: 0, max: 15, step: 0.5, value: 5, help: 'kanalform' })
      + numberRow({ ui: 'radius', label: 'Bodenradius', unit: 'mm', value: '1,5', help: 'kanalform' })
      + numberRow({ ui: 'branch-r', label: 'Zwickelradius', unit: 'mm', value: '4', help: 'zwickel' })
      + numberRow({ ui: 'gate-h', label: 'Anschnitthöhe', unit: 'mm', value: '2', help: 'anschnitthoehe' })
      + heading('Abstufen' + info('abstufen'))
      + sliderRow({ ui: 'taper', label: 'Verjüngung', min: 70, max: 100, step: 1, value: 90 })
      + sliderRow({ ui: 'aspect', label: 'Seitenverhältnis', min: 30, max: 120, step: 5, value: 65 })
      + detailsBlock('form-details', 'Details',
        sliderRow({ ui: 'tension', label: 'Splinestraffheit', min: 30, max: 180, step: 5, value: 100, help: 'spline' })
        + numberRow({ ui: 'step', label: 'Abtastschritt', unit: 'mm', value: '1', help: 'spline' }))
  },
  {
    id: 'prozess', label: 'Prozess',
    hint: 'Volumen und Füllzeit ergeben den Strom; daraus folgt jede Anschnittfläche.',
    html: selectRow({ ui: 'alloy', label: 'Legierung', options: [] })
      + numberRow({ ui: 'vol', label: 'Gussvolumen', unit: 'cm³', value: '420', help: 'gussvolumen' })
      + numberRow({ ui: 'tfill', label: 'Füllzeit', unit: 'ms', value: '45' })
      + numberRow({ ui: 'vgate', label: 'Anschnitt v<sub>Ziel</sub>', unit: 'm/s', value: '40', help: 'vziel' })
      + numberRow({ ui: 'chamber-len', label: 'Füllkammerlänge', unit: 'mm', value: '450', help: 'kammer' })
      + kpiBlock('shot-kpis')
      + warnLine('shot-warn')
      + detailsBlock('proc-details', 'Details',
        checkRow({ ui: 'shot-time', label: 'Ankunft nach der Schusskurve', checked: true, help: 'schusskurve' })
        + sliderRow({ ui: 'cbranch', label: 'Verzweigungs&shy;verlust', min: 10, max: 120, step: 5, value: 50, help: 'verzweigungsverlust' })
        + factsBlock('shot-facts'))
  },
  {
    id: 'pruefung', label: 'Prüfung',
    hint: 'Die Regeln laufen bei jeder Änderung neu über die ganze Geometrie. Verletztes steht oben.',
    html: kpiBlock('rules-kpis')
      + '<div class="an-checkbar" data-ui="rules-bar" aria-hidden="true"></div>'
      + '<div class="rules an-rules" data-ui="rules-list" data-scroll></div>'
  }
];

/* Das Auswahlfeld: Kopf und Ankunft stehen fest, darunter eine Reiterzeile —
   es ist immer nur EINE Gruppe zu sehen, sonst scrollte das Feld bei 720 px
   Fensterhöhe. Welche Gruppen es gibt, hängt von der Art des Punktes ab
   (js/runner/tool.js, groupsFor). */
const num = (ui, label, unit, help) => numberRow({ ui, label, unit, help });
export const INSPECTOR = '<div class="st-hintline an-arrive" data-ui="sel-arrive"></div>'
  + '<div class="st-grouptabs" role="tablist" data-ui="sel-groups" aria-label="Gruppen"></div>'
  + '<div data-ui="sel-params">'
  + '<div data-group="Lage">'
  + '<div class="row pos"><span>Lage</span><div class="triple">'
  + '<input type="text" data-ui="sel-x" inputmode="decimal" spellcheck="false" aria-label="X">'
  + '<input type="text" data-ui="sel-y" inputmode="decimal" spellcheck="false" aria-label="Y">'
  + '<input type="text" data-ui="sel-z" inputmode="decimal" spellcheck="false" aria-label="Z">'
  + '</div><span class="unit">mm</span></div>'
  + '<div data-ui="plane-block">'
  + sliderRow({ ui: 'sel-roll', label: 'Ebene längs', min: -60, max: 60, step: 1, value: 0, help: 'ebene' })
  + sliderRow({ ui: 'sel-pitch', label: 'Ebene quer', min: -60, max: 60, step: 1, value: 0, help: 'ebene' })
  + '</div>'
  + '<div class="st-hintline" data-ui="root-note">Der Pressrest zieht beim Verschieben das ganze System mit. Seine Maße stehen unter „System".</div>'
  + '</div>'
  + '<div data-group="Querschnitt">'
  + num('sel-w', 'Breite', 'mm', 'querschnitt')
  + num('sel-h', 'Tiefe', 'mm', 'querschnitt')
  + '</div>'
  + '<div data-group="Verzweigung">'
  + sliderRow({ ui: 'sel-ratio', label: 'Aufteilung', min: 10, max: 90, step: 1, value: 50, help: 'aufteilung' })
  + checkRow({ ui: 'sel-mirror', label: 'Äste spiegelsymmetrisch halten', help: 'spiegel' })
  + '</div>'
  + '<div data-group="Anschnitt">'
  + num('sel-gh', 'Höhe', 'mm', 'anschnitthoehe')
  + num('sel-glen', 'Tiefe (Steg)', 'mm', 'anschnitt')
  + num('sel-gw', 'Breite', 'mm', 'anschnitt')
  + checkRow({ ui: 'sel-gauto', label: 'Breite aus v<sub>Ziel</sub> rechnen', checked: true })
  + '</div>'
  + '<div data-group="Mündung">'
  + selectRow({ ui: 'sel-gtrans', label: 'Übergang', options: [], help: 'anschnitt' })
  + '<div class="st-hintline" data-ui="sel-aim-note"></div>'
  + '<button type="button" class="btn btn-sm btn-outline block-btn" data-ui="sel-aim">Mündung ans Bauteil binden</button>'
  + '</div>'
  + '</div>'
  + factsBlock('sel-facts')
  + '<button type="button" class="btn btn-sm btn-outline block-btn st-danger" data-ui="del-node">Entfernen</button>';

/* Anzeigeoptionen: nichts davon ändert den Plan. */
export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Bauteil', min: 5, max: 100, step: 1, value: 30 })
  + segRow({ ui: 'show-seg', label: 'Körper', value: 'sweep', options: [['sweep', 'Kanäle'], ['line', 'nur Linie']] })
  + checkRow({ ui: 'show-biscuit', label: 'Pressrest zeigen', checked: true })
  + checkRow({ ui: 'show-line', label: 'Mittellinie und Griffe zeigen', checked: true });

/* Das Flussschema füllt den Viewport, solange es offen ist. */
export const CHART = '<div class="chart-panel" data-ui="chart-panel"><div class="chart-head">Flussschema<button type="button" data-ui="chart-close" aria-label="Flussschema schließen (Esc)">×</button></div>'
  + '<div class="chart-facts" data-ui="chart-facts"></div>'
  + '<div class="chart-body" data-ui="chart-body"></div></div>';
