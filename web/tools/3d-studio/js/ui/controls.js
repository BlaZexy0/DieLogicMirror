/* Bedienelemente, die auf mehreren Seiten gleich aussehen und sich gleich
   verhalten sollen: Regler mit Wertanzeige, segmentierte Schalter,
   Zahleneingaben, Kennzahlenblöcke und die Farbskala im Viewport.

   Jeder Helfer nimmt ein ELEMENT oder eine id; die Werkzeuge des Rahmens
   (js/studio/) reichen ihre über data-ui gefundenen Elemente. Zahlen kommen
   aus js/studio/format.js (deutsch lesen und schreiben); fmt steht nur noch
   für js/lbm/paint.js auch hier. */

import { fmt, fmtPlain, parseNumber, clamp, rangeText } from '../studio/format.js';

export { fmt };

export const $ = id => document.getElementById(id);

/** Element oder id → Element. */
export const el = x => (typeof x === 'string' ? $(x) : x);

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
    `out` mitgegeben. onChange(v) kommt bei jedem Zug — und einmal beim
    Einbau mit dem Anfangswert, außer mit { fire: false }: dann ist der
    Einbau keine Änderung, und niemand braucht ein „schon verdrahtet?".
    Zurück kommt { el, set(v) }: set stellt Regler und Anzeige auf einen
    Wert (nach dem Laden einer Datei, nach Rückgängig), ohne onChange. */
export function slider(id, onChange, format, out, { fire = true } = {}) {
  const e = el(id);
  const o = out || (typeof id === 'string' ? $(id + '-val') : (e.parentNode && e.parentNode.querySelector('.val')));
  const show = v => { if (o) o.textContent = format ? format(v) : String(v); };
  e.addEventListener('input', () => { const v = +e.value; show(v); onChange(v); });
  show(+e.value);
  if (fire) onChange(+e.value);
  return { el: e, set(v) { e.value = String(v); show(v); } };
}

/** Grenzen einer Lage im Auswahlfeld der Designer (mm): „12.500" liest sich
    deutsch als 12 500 mm und läge ohne Hinweis zwölf Meter neben dem
    Bauteil. */
export const POS_LIMIT = { min: -5000, max: 5000, unit: 'mm' };

/** Zahleneingabe: übernommen wird mit der Eingabetaste oder beim
    Verlassen. apply(wert) gibt den tatsächlich gesetzten Wert zurück
    (geklemmt o. ä.), unlesbare Eingaben werden als „schlecht" markiert und der
    letzte gültige Wert bleibt stehen. Mit `min`/`max` klemmt der Helfer
    selbst und sagt es kurz dazu („auf 30 mm begrenzt"). */
export function numberInput(id, apply, opts = {}) {
  const e = el(id);
  const { min, max, unit = '' } = opts;
  /* Derselbe Text ist keine Eingabe. Ein Feld zeigt gerundet (die Lage auf
     das Zehntel); ein Enter ohne Änderung las die Rundung wieder ein,
     verschob das Element und legte einen Schritt in den Verlauf (Überlauf-
     und Füllungsdesigner, 23.09.). Gemerkt wird der Text, solange das Feld
     den Fokus hat: beim Hineingehen und nach jedem Übernehmen, so übernimmt
     auch das „change", das der Browser nach einem Enter noch schickt,
     nichts zweimal. Beim Verlassen verfällt er; was danach von außen ins
     Feld geschrieben wird (Auswahl, Rückgängig), zählt beim nächsten Mal. */
  let held = null;
  e.addEventListener('focus', () => { held = e.value; });
  e.addEventListener('blur', () => { held = null; });
  const run = () => {
    if (held !== null && e.value === held) return;
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
    if (held !== null) held = e.value;
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

/* ── Farbskala im Viewport ───────────────────────────────────── */

/** Stetiger Verlauf: fn(t) mit t von 0 (unten) bis 1 (oben) liefert die
    Farbe als CSS-Zeichenkette. */
export const gradient = (fn, n = 24) =>
  Array.from({ length: n + 1 }, (_, i) => fn(i / n) + ' ' + (100 * i / n).toFixed(1) + '%');

/** Skala setzen — oder mit null ausblenden. ticks laufen von oben nach
    unten, extra ist eine Zeile darunter (z. B. „Hinterschnitt"). */
export function colorbar(spec) {
  const e = $('colorbar');
  if (!e) return;
  if (!spec) { e.classList.remove('on'); return; }
  e.classList.add('on');
  $('cb-title').textContent = spec.title;
  const scale = $('cb-scale');
  scale.style.background = 'linear-gradient(to top, ' + spec.stops.join(', ') + ')';
  /* Der Verlauf reicht unter den Rahmen: sonst wiederholt er sich dort, und
     oben stünde ein Streifen vom unteren Ende (bei der Schräge ein Strich
     „schlecht" über „gut"). */
  scale.style.backgroundOrigin = 'border-box';
  $('cb-ticks').className = 'cb-ticks' + (spec.bands ? ' bands' : '');
  $('cb-ticks').innerHTML = spec.ticks.map(t => '<span>' + t + '</span>').join('');
  $('cb-extra').innerHTML = spec.extra || '';
}

/** Farbfeld für die Zeile unter der Skala. */
export const chip = color => '<span class="chip" style="background:' + color + '"></span>';
