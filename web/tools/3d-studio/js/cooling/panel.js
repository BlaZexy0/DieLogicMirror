/* Die Felder des Temperierkanal-Designers — je Modus ein Abschnitt, dazu
   das Auswahlfeld im Viewport und die Darstellung. Die Texte, die früher in
   der Seitenleiste und in den title-Attributen standen, liegen in help.js. */

import { numberRow, sliderRow, segRow, checkRow, kpiBlock, factsBlock, detailsBlock, heading, hintLine, warnLine } from '../studio/rows.js';
import { DIRECTIONS } from './model.js';

export const MODES = [
  {
    /* Der Reiter heißt kurz „Fläche": mit „Abstandsfläche" passten die vier
       Reiter in keiner Breite in eine Zeile, und „Prüfung" stand allein in
       einer zweiten — das kostete jeden Modus eine Zeile. Die Hinweiszeile
       darunter sagt, welche Fläche. */
    id: 'flaeche', label: 'Fläche',
    hint: 'Die Abstandsfläche: überall derselbe Abstand zur Kavität; auf ihr sitzen die Spitzen der Kühlstiche und die Achsen der Kanäle.',
    html: sliderRow({ ui: 'dist', label: 'Achsabstand zur Kavität', min: 5, max: 60, step: 1, value: 20, help: 'achsabstand' })
      + numberRow({ ui: 'cell', label: 'Zellkante', unit: 'mm', value: '6', help: 'zellkante' })
      + numberRow({ ui: 'min-wall', label: 'Mindest-Wandabstand', unit: 'mm', value: '10', help: 'mindestabstand' })
      + checkRow({ ui: 'min-wall-auto', label: 'Auto: Achsabstand − Ø/2', checked: true })
      + kpiBlock('shell-kpis')
      + warnLine('shell-warn')
      + detailsBlock('shell-details', 'Raster', factsBlock('shell-facts'))
  },
  {
    id: 'setzen', label: 'Setzen',
    hint: 'Oben im Bild „Kühlstich" oder „Kanal" wählen, dann auf die Abstandsfläche klicken, oder die Automatik verteilt die Stiche.',
    /* Knapp gehalten: mit 44-px-Zeilen unter dem Finger und umbrochenen Reitern
       bleiben hier sieben Zeilen — deshalb Ø und Länge in einer. */
    html: segRow({ ui: 'dir-seg', label: 'Richtung', value: 'normal', help: 'richtung',
      options: Object.entries(DIRECTIONS).map(([k, v]) => [k, v.label]) })
      + '<div class="row"><span>Kühlstich Ø × Länge</span><div class="triple tc-pair">'
      + '<input type="text" data-ui="def-d" inputmode="decimal" spellcheck="false" autocomplete="off" value="20" aria-label="Durchmesser neuer Kühlstiche">'
      + '<span class="tc-x">×</span>'
      + '<input type="text" data-ui="def-len" inputmode="decimal" spellcheck="false" autocomplete="off" value="200" aria-label="Länge neuer Kühlstiche">'
      + '</div><span class="unit">mm</span></div>'
      + numberRow({ ui: 'def-kd', label: 'Kanal Ø', unit: 'mm', value: '10' })
      + heading('Automatik')
      + sliderRow({ ui: 'auto-count', label: 'Anzahl', min: 1, max: 40, step: 1, value: 8, help: 'automatik' })
      + sliderRow({ ui: 'auto-spacing', label: 'Stichabstand min.', min: 10, max: 80, step: 5, value: 30 })
      + checkRow({ ui: 'auto-replace', label: 'Vorherige automatische ersetzen', checked: true })
  },
  {
    id: 'pruefung', label: 'Prüfung',
    hint: 'Was gesetzt ist, und ob überall genug Stahl zwischen Bohrung und Kavität bleibt.',
    html: kpiBlock('plan-kpis')
      + heading('Unter dem Mindest-Wandabstand')
      + '<div class="st-list" data-ui="offender-list" data-scroll></div>'
      /* Unter der Liste steht immer ein Satz (was ein Klick tut — oder warum
         sie leer ist), damit das ⓘ nicht allein dasteht. */
      + hintLine('<span data-ui="offender-note">Noch nichts gesetzt.</span>', 'pruefung')
      + detailsBlock('auto-details', 'Letzter Lauf der Automatik', factsBlock('auto-facts'))
  }
];

/* Das Auswahlfeld: oben das Urteil über den Wandabstand — darum geht es —,
   darunter zwei Gruppen als Reiter (nur eine steht im Feld, so scrollt es
   nie): die Maße und die abgeleiteten Zahlen. Länge und Richtung hat nur der
   Kühlstich, „beide Enden" nur der Kanal. */
export const GROUPS = ['Maße', 'Details'];
export const INSPECTOR = kpiBlock('sel-kpis')
  + '<div class="st-grouptabs" role="tablist" data-ui="sel-groups" aria-label="Auswahl">'
  + GROUPS.map(n => '<button type="button" role="tab" data-group-tab="' + n + '">' + n + '</button>').join('') + '</div>'
  + '<div data-group="Maße">'
  + numberRow({ ui: 'sel-d', label: 'Durchmesser', unit: 'mm', value: '20' })
  + '<div data-ui="sel-len-row">' + numberRow({ ui: 'sel-len', label: 'Länge', unit: 'mm', value: '200' }) + '</div>'
  + '<div class="row" data-ui="sel-dir-row"><span>Richtung</span><span class="tc-dir" data-ui="sel-dir">—</span></div>'
  + '<div class="row pos tc-lage"><span>Lage<small>mm</small></span><div class="triple">'
  + '<input type="text" data-ui="sel-x" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="X in mm">'
  + '<input type="text" data-ui="sel-y" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Y in mm">'
  + '<input type="text" data-ui="sel-z" inputmode="decimal" spellcheck="false" autocomplete="off" aria-label="Z in mm">'
  + '</div></div>'
  + '<div data-ui="sel-both-row">' + checkRow({ ui: 'sel-both', label: 'Beide Enden bewegen' }) + '</div>'
  + '</div>'
  + '<div data-group="Details">' + factsBlock('sel-facts') + '</div>'
  + '<button type="button" class="btn btn-sm btn-outline block-btn st-danger" data-ui="del-item">Entfernen</button>';

/* Anzeigeoptionen: wie deckend das Bauteil steht, und ob man durch die
   Abstandsfläche hindurchsieht. */
export const DARSTELLUNG = sliderRow({ ui: 'opacity', label: 'Deckkraft Bauteil', min: 5, max: 100, step: 1, value: 100 })
  + checkRow({ ui: 'shell-clear', label: 'Abstandsfläche durchscheinend', checked: true, help: 'darstellung' });
