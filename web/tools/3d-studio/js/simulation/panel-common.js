/* Die Felder, die Angussfüllung und Kammerfüllung teilen: der Modus
   „Simulation" (Verfahren, Auflösung, was es kostet), der untere Teil des
   Modus „Ergebnis" (Tabelle, Bild, Kennzahlen des Laufs) — und der Zeitregler,
   der in KEINEM Modus steht, sondern unten unter dem Hauptknopf. Verdrahtet
   werden sie in core.js.

   Welche Verfahren zur Wahl stehen, weiß das Werkzeug (core.js: engineIds) —
   die Kammerfüllung hat neben Gitter und Partikeln das Metamodell, die
   Angussfüllung nicht. Deshalb bekommen die Zeilen die Liste übergeben. */

import { segRow, detailsBlock, factsBlock, warnLine, info } from '../studio/rows.js';

/* Gezeichnet, nicht geschrieben: „▶" und „⏸" zeigen Firefox und Chrome je nach
   Schrift als buntes Emoji — auch mit U+FE0E dahinter. */
const icon = d => '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="' + d + '" fill="currentColor"/></svg>';
export const PLAY = icon('M2.5 1l8.5 5-8.5 5z');
export const PAUSE = icon('M2 1h3v10H2zM7 1h3v10H7z');

/* Das ⓘ aus js/studio/rows.js — auch für die Zeilen, die es dort nicht gibt
   (Bezeichnung wechselt, Abspielen in der Zeile, zwei Felder). */
export { info };

/* Die Bezeichnung des Felds wechselt mit dem Verfahren (Zellkante oder
   Partikelabstand) — deshalb eine eigene Zeile statt numberRow. Das Metamodell
   hat gar keine: es rechnet auf dem Gitter, das es gelernt hat, und die Zeile
   verschwindet (core.js, syncEngine). */
export const simulationRows = options =>
  segRow({ ui: 'engine-seg', label: 'Verfahren', value: options[0][0], options, help: 'verfahren' })
  + '<div data-ui="cell-row">'
  + '<label class="row"><span><span data-ui="cell-label">Zellkante</span>' + info('aufloesung') + '</span>'
  + '<input type="text" inputmode="decimal" data-ui="cell" value="" spellcheck="false" autocomplete="off"><span class="unit">mm</span></label>'
  + '</div>'
  + '<div class="st-hintline" data-ui="estimate"></div>'
  + '<div class="st-hintline" data-ui="engine-note"></div>'
  + warnLine('engine-warn');

/* `between`: was das Werkzeug unter „Bild" stellt (die Angussfüllung: Schmelze
   oder Ankunft) — es gehört zum Ergebnis und steht nur da, wenn es eines gibt. */
export const resultRows = (options, between = '') =>
  '<div class="sim-table" data-ui="result-table"></div>'
  + '<div data-ui="bild-row" hidden>'
  + segRow({ ui: 'bild-seg', label: 'Bild', value: options[0][0], options, help: 'vergleich' })
  + '</div>'
  + '<div data-ui="result-extra" hidden>' + between + '</div>'
  + detailsBlock('run-details', 'Rechnung', factsBlock('run-facts'));

/* Zeit und Abspielen: unten unter dem Hauptknopf (js/studio/shell.js,
   setActionsExtra), nicht im Modus „Ergebnis". Der Regler gehört zum LAUF —
   wer an der Kammer oder der Kurve dreht, will das gerechnete Bild dazu sehen,
   ohne erst den Reiter zu wechseln. Abspielen sitzt IN der Zeile: ein eigener
   Knopf in Blockbreite kostete eine Zeile, die der Tabelle fehlt.

   EINE Zeile, mehr nicht: was das Bild gerade zeigt (Kolben, Luft, Füllstand),
   steht unten links IM Viewport (shell.status) — neben dem Bild, auf das es
   sich bezieht, und nicht in der Seitenleiste, wo es unter dem Finger die
   Zeilen der Modi verdrängte. */
export const PLAYBACK_ROWS =
  '<div data-ui="time-row" class="off"><div class="row sim-time"><span>Zeit' + info('zeit') + '</span>'
  + '<button type="button" class="sim-play" data-ui="play" aria-label="Abspielen" disabled>' + PLAY + '</button>'
  + '<input type="range" data-ui="t-slider" aria-label="Zeit" min="0" max="0" step="1" value="0" disabled></div></div>';
