/* Die Felder, die Angussfüllung und Kammerfüllung teilen: der Modus
   „Simulation" (Verfahren, Auflösung, was es kostet) und der untere Teil des
   Modus „Ergebnis" (Bild, Zeit, Abspielen, Kennzahlen des Laufs). Verdrahtet
   werden sie in core.js. */

import { segRow, detailsBlock, factsBlock, warnLine } from '../studio/rows.js';

/* Gezeichnet, nicht geschrieben: „▶" und „⏸" zeigen Firefox und Chrome je nach
   Schrift als buntes Emoji — auch mit U+FE0E dahinter. */
const icon = d => '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="' + d + '" fill="currentColor"/></svg>';
export const PLAY = icon('M2.5 1l8.5 5-8.5 5z');
export const PAUSE = icon('M2 1h3v10H2zM7 1h3v10H7z');

/* Das ⓘ wie in js/studio/rows.js — für die Zeilen, die es dort nicht gibt
   (Bezeichnung wechselt, Abspielen in der Zeile, zwei Felder). */
export const info = help => ' <button type="button" class="st-info" data-help="' + help + '" aria-label="Erklärung">ⓘ</button>';

/* Die Bezeichnung des Felds wechselt mit dem Verfahren (Zellkante oder
   Partikelabstand) — deshalb eine eigene Zeile statt numberRow. */
export const SIMULATION_ROWS =
  segRow({ ui: 'engine-seg', label: 'Verfahren', value: 'lbm', options: [['lbm', 'Gitter'], ['sph', 'Partikel']], help: 'verfahren' })
  + '<label class="row"><span><span data-ui="cell-label">Zellkante</span>' + info('aufloesung') + '</span>'
  + '<input type="text" inputmode="decimal" data-ui="cell" value="" spellcheck="false" autocomplete="off"><span class="unit">mm</span></label>'
  + '<div class="st-hintline" data-ui="estimate"></div>'
  + '<div class="st-hintline" data-ui="engine-note"></div>'
  + warnLine('engine-warn');

/* `between`: was das Werkzeug zwischen „Bild" und Zeitregler stellt
   (die Angussfüllung: Schmelze oder Ankunft). */
export const resultRows = (between = '', timeHelp = 'zeit') =>
  '<div class="sim-table" data-ui="result-table"></div>'
  + '<div data-ui="bild-row" hidden>'
  + segRow({ ui: 'bild-seg', label: 'Bild', value: 'lbm', options: [['lbm', 'Gitter'], ['sph', 'Partikel']], help: 'vergleich' })
  + '</div>'
  + '<div data-ui="playback" hidden>' + between
  /* Abspielen sitzt IN der Zeitzeile: ein eigener Knopf in Blockbreite kostete
     die Zeile, die der Tabelle fehlt (die Seitenleiste scrollt nie). */
  + '<div data-ui="time-row"><div class="row sim-time"><span>Zeit' + info(timeHelp) + '</span>'
  + '<button type="button" class="sim-play" data-ui="play" aria-label="Abspielen">' + PLAY + '</button>'
  + '<input type="range" data-ui="t-slider" aria-label="Zeit" min="0" max="0" step="1" value="0"><span class="val" data-ui="t-slider-val"></span></div>'
  + '<div class="st-hintline" data-ui="t-info"></div></div>'
  + '</div>'
  + detailsBlock('run-details', 'Rechnung', factsBlock('run-facts'));
