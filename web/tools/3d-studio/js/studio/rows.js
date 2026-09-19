/* Die Zeilen der Seitenleiste als Bausteine — jedes Werkzeug setzt seine
   Felder daraus zusammen (panel.js), und sie sehen überall gleich aus:
   Bezeichnung · Bedienelement · Einheit. Jedes Eingabefeld sitzt in
   seinem <label>, ist also für Hilfstechnik beschriftet, ohne dass ids
   nötig wären (auf der Werkbank leben mehrere Werkzeuge auf einer Seite).
   Ein ⓘ hinter der Bezeichnung öffnet die Hilfe an der Stelle — Erklärungen
   stehen DORT, nicht in einem title: den gibt es auf dem Tablett nicht. */

const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

const info = help => (help ? ' <button type="button" class="st-info" data-help="' + esc(help) + '" title="Erklärung" aria-label="Erklärung">ⓘ</button>' : '');

/** Zahleneingabe. */
export function numberRow({ ui, label, unit = '', value = '', help = '' }) {
  return '<label class="row"><span>' + label + info(help) + '</span>'
    + '<input type="text" inputmode="decimal" data-ui="' + ui + '" value="' + esc(value) + '" spellcheck="false" autocomplete="off">'
    + '<span class="unit">' + unit + '</span></label>';
}

/** Regler mit Wertanzeige (die Anzeige ist das .val daneben). */
export function sliderRow({ ui, label, min, max, step = 1, value, help = '' }) {
  return '<label class="row"><span>' + label + info(help) + '</span>'
    + '<input type="range" data-ui="' + ui + '" min="' + min + '" max="' + max + '" step="' + step + '" value="' + value + '">'
    + '<span class="val" data-ui="' + ui + '-val"></span></label>';
}

/** Segmentierter Schalter. options: [[value, label, title?], …] */
export function segRow({ ui, label, options, value, help = '', stack = false }) {
  return '<div class="row"><span>' + (label || '') + info(help) + '</span>'
    + '<div class="seg' + (stack ? ' stack' : '') + '" data-ui="' + ui + '" aria-label="' + esc(label || '') + '">'
    + options.map(([v, l, t]) => '<button type="button" data-value="' + esc(v) + '"' + (v === value ? ' class="active"' : '') + (t ? ' title="' + esc(t) + '"' : '') + '>' + l + '</button>').join('')
    + '</div></div>';
}

/** Häkchen. */
export function checkRow({ ui, label, checked = false, help = '' }) {
  return '<label class="inline"><input type="checkbox" data-ui="' + ui + '"' + (checked ? ' checked' : '') + '> <span>' + label + info(help) + '</span></label>';
}

/** Auswahlliste; options: [[value, label], …] */
export function selectRow({ ui, label, options = [], value, help = '' }) {
  return '<label class="row"><span>' + label + info(help) + '</span><select data-ui="' + ui + '">'
    + options.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + l + '</option>').join('')
    + '</select></label>';
}

/** Kennzahlen mit Urteil: ein Block, der später mit kpis() gefüllt wird. */
export const kpiBlock = ui => '<div class="krows" data-ui="' + ui + '"></div>';

/** Kennzahlen füllen: rows = [{ label, value, verdict: 'ok'|'warn'|'bad'|'', note }] */
export function kpis(el, rows) {
  if (!el) return;
  el.innerHTML = rows.map(r =>
    '<div class="krow' + (r.verdict ? ' ' + r.verdict : '') + '"><span class="klbl">' + r.label + '</span>'
    + '<span class="kval">' + r.value + '</span>' + (r.note ? '<span class="knote">' + r.note + '</span>' : '') + '</div>').join('');
}

/** Ein zugeklappter Kasten für das, was selten interessiert. */
export const detailsBlock = (ui, title = 'Details', body = '') =>
  '<details class="st-details" data-ui="' + ui + '"><summary>' + title + '</summary><div class="st-details-body">' + body + '</div></details>';

/** Ein Kennzahlenblock (Details) — gefüllt mit facts() aus js/ui/controls.js. */
export const factsBlock = ui => '<div class="facts" data-ui="' + ui + '"></div>';

/** Eine Warnzeile. */
export const warnLine = ui => '<div class="warn-line" data-ui="' + ui + '"></div>';

/** Eine Zwischenüberschrift in der Seitenleiste. */
export const heading = text => '<h2>' + text + '</h2>';

/** Ein Hinweis in einer Zeile. */
export const hintLine = text => '<div class="st-hintline">' + text + '</div>';

/** Ein Knopf in Blockbreite (Sekundäraktion in der Seitenleiste). */
export const blockButton = ({ ui, label, primary = false, title = '' }) =>
  '<button type="button" class="btn ' + (primary ? 'btn-primary' : 'btn-outline') + ' block-btn" data-ui="' + ui + '"' + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '</button>';
