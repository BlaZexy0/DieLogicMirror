/* Bedienelemente, die auf mehreren Seiten gleich aussehen und sich gleich
   verhalten sollen: Regler mit Wertanzeige, segmentierte Schalter,
   Zahleneingaben, Kennzahlenblöcke, der „Rechnen"-Knopf mit seiner
   Hinweiszeile und die Farbskala im Viewport.

   Jeder Helfer nimmt ein ELEMENT oder eine id — die alten Seiten reichen
   ids, die Werkzeuge des gemeinsamen Rahmens (js/studio/) ihre über
   data-ui gefundenen Elemente. Zahlen kommen aus js/studio/format.js
   (deutsch lesen und schreiben); die Namen bleiben hier exportiert, weil
   die Rechenmodule und Tests sie von hier holen. */

import { fmt, fmtPlain, parseNumber, clamp, rangeText } from '../studio/format.js';

export { fmt, fmtPlain, parseNumber };

export const $ = id => document.getElementById(id);

/** Element oder id → Element. */
export const el = x => (typeof x === 'string' ? $(x) : x);

export const rgbCss = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';

/** Kennzahlenblock aus [Bezeichnung, Wert]-Paaren. Ohne das Element
    passiert nichts — nicht jede Seite zeigt jeden Block (die
    Abstandsanalyse verzichtet auf die Netz-Kennzahlen). Jede Zeile ist
    ein Raster mit fester Spalte für die Bezeichnung, damit lange Werte
    nie die Bezeichnung umbrechen. */
export function facts(id, rows) {
  const e = el(id);
  if (!e) return;
  e.innerHTML = rows.map(([k, v]) =>
    '<div class="fact"><span>' + k + '</span><span>' + v + '</span></div>').join('');
}

/** Segmentierter Schalter: der Zuhörer sitzt am Rahmen, nicht an jedem
    Knopf — deshalb funktioniert er auch für später eingefügte Knöpfe.
    Der Rahmen ist eine Radiogruppe für Hilfstechnik. */
export function segButtons(id, onPick) {
  const e = el(id);
  e.setAttribute('role', 'radiogroup');
  const mark = () => { for (const b of e.querySelectorAll('button')) { b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', b.classList.contains('active') ? 'true' : 'false'); } };
  mark();
  e.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    [...e.querySelectorAll('button')].forEach(x => x.classList.toggle('active', x === b));
    mark();
    onPick(b.dataset.value);
  });
}

/** Den aktiven Knopf eines segmentierten Schalters von außen setzen —
    z. B. nach dem Laden einer Datei, ohne den Rückruf auszulösen. */
export function segButtonSet(id, value) {
  for (const b of el(id).querySelectorAll('button')) {
    const on = b.dataset.value === value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  }
}

/** Regler; die Wertanzeige daneben heißt <id>-val — oder wird als
    `out` mitgegeben. */
export function slider(id, onChange, format, out) {
  const e = el(id);
  const o = out || (typeof id === 'string' ? $(id + '-val') : (e.parentNode && e.parentNode.querySelector('.val')));
  const push = () => {
    const v = +e.value;
    if (o) o.textContent = format ? format(v) : String(v);
    onChange(v);
  };
  e.addEventListener('input', push);
  push();
  return e;
}

/** Zahleneingabe: übernommen wird mit der Eingabetaste oder beim
    Verlassen. apply(wert) gibt den tatsächlich gesetzten Wert zurück
    (geklemmt o. ä.), unlesbare Eingaben werden rot markiert und der
    letzte gültige Wert bleibt stehen. Mit `min`/`max` klemmt der Helfer
    selbst und sagt es kurz dazu („auf 30 mm begrenzt"). */
export function numberInput(id, apply, opts = {}) {
  const e = el(id);
  const { min, max, unit = '' } = opts;
  const run = () => {
    const v = parseNumber(e.value);
    if (v === null) { e.classList.add('bad'); return; }
    e.classList.remove('bad');
    let use = v;
    if (min !== undefined || max !== undefined) {
      const c = clamp(v, { min, max });
      use = c.value;
      if (c.clamped) clampNote(e, 'auf ' + fmtPlain(use) + (unit ? ' ' + unit : '') + ' begrenzt (' + rangeText(min, max, unit) + ')');
    }
    /* Ohne Gruppentrenner zurückschreiben: was hier steht, liest parseNumber
       beim nächsten „change"/Enter wieder ein (der Zuhörer hängt an beiden). */
    const set = apply(use);
    e.value = fmtPlain(set === undefined ? use : set);
  };
  e.addEventListener('change', run);
  e.addEventListener('keydown', ev => { if (ev.key === 'Enter') { run(); ev.preventDefault(); } });
  return e;
}

/* Der Hinweis unter einem geklemmten Feld: kurz, dann weg. */
const noteTimers = new WeakMap();
export function clampNote(input, text) {
  const row = input.closest('.row') || input.parentNode;
  if (!row) return;
  let note = row.querySelector('.clamp-note');
  if (!note) {
    note = document.createElement('small');
    note.className = 'clamp-note';
    row.appendChild(note);
  }
  note.textContent = text;
  note.classList.add('on');
  clearTimeout(noteTimers.get(input));
  noteTimers.set(input, setTimeout(() => { note.classList.remove('on'); note.textContent = ''; }, 2500));
}

/** „Rechnen"-Knopf samt Hinweiszeile (die Seiten ohne Rahmen). Gibt eine
    Funktion zurück, die den Zustand setzt: { label, note, outline,
    disabled, warn }. */
export function runControl(btnId, noteId) {
  const btn = el(btnId), note = el(noteId);
  return spec => {
    btn.textContent = spec.label;
    btn.disabled = !!spec.disabled;
    btn.className = 'btn ' + (spec.outline ? 'btn-outline' : 'btn-primary') + ' block-btn';
    note.textContent = spec.note || '';
    note.className = 'run-note' + (spec.warn ? ' stale' : '');
  };
}

/* ── Farbskala im Viewport ───────────────────────────────────── */

/** Stetiger Verlauf: fn(t) mit t von 0 (unten) bis 1 (oben) liefert die
    Farbe als CSS-Zeichenkette. */
export const gradient = (fn, n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => fn(i / n) + ' ' + (100 * i / n).toFixed(1) + '%');

/** Abgestufter Verlauf: harte Kanten zwischen gleich breiten Bändern. */
export const steps = colors => colors.map((c, i) =>
  c + ' ' + (100 * i / colors.length).toFixed(0) + '% ' + (100 * (i + 1) / colors.length).toFixed(0) + '%');

/** Skala setzen — oder mit null ausblenden. ticks laufen von oben nach
    unten, extra ist eine Zeile darunter (z. B. „Hinterschnitt"). */
export function colorbar(spec) {
  const e = $('colorbar');
  if (!e) return;
  if (!spec) { e.classList.remove('on'); return; }
  e.classList.add('on');
  $('cb-title').textContent = spec.title;
  $('cb-scale').style.background = 'linear-gradient(to top, ' + spec.stops.join(', ') + ')';
  $('cb-ticks').className = 'cb-ticks' + (spec.bands ? ' bands' : '');
  $('cb-ticks').innerHTML = spec.ticks.map(t => '<span>' + t + '</span>').join('');
  $('cb-extra').innerHTML = spec.extra || '';
}

/** Farbfeld für die Zeile unter der Skala. */
export const chip = color => '<span class="chip" style="background:' + color + '"></span>';
