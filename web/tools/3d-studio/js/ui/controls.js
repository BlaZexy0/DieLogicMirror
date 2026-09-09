/* Bedienelemente, die auf mehreren Seiten gleich aussehen und sich gleich
   verhalten sollen: Regler mit Wertanzeige, segmentierte Schalter,
   Zahleneingaben, Kennzahlenblöcke, der „Rechnen"-Knopf mit seiner
   Hinweiszeile und die Farbskala im Viewport.

   Vorher stand das in jeder Seite noch einmal — mit dem üblichen
   Ergebnis, dass Kleinigkeiten auseinanderliefen (mal „btn-primary",
   mal nicht; mal mit Tausenderpunkt, mal ohne). Die Entscheidung, WAS
   angezeigt wird, bleibt in der jeweiligen Seite; hier steht nur, WIE. */

export const $ = id => document.getElementById(id);

/** Zahl in deutscher Schreibweise (Komma, Tausenderpunkt) — für Anzeigen. */
export const fmt = (v, max = 2) => v.toLocaleString('de-DE', { maximumFractionDigits: max });

/** Dasselbe ohne Gruppentrenner — für Eingabefelder, deren Inhalt wieder
    eingelesen wird. Mit Tausenderpunkt las parseNumber die eigene Ausgabe
    falsch zurück: „1.500" wurde zu 1,5 und „1.234,5" gar nicht mehr erkannt. */
export const fmtPlain = (v, max = 2) =>
  v.toLocaleString('de-DE', { maximumFractionDigits: max, useGrouping: false });

export const rgbCss = rgb => 'rgb(' + rgb.map(v => Math.round(v * 255)).join(',') + ')';

/** Kennzahlenblock aus [Bezeichnung, Wert]-Paaren. */
export function facts(id, rows) {
  $(id).innerHTML = rows.map(([k, v]) =>
    '<div class="fact"><span>' + k + '</span><span>' + v + '</span></div>').join('');
}

/** Segmentierter Schalter: der Zuhörer sitzt am Rahmen, nicht an jedem
    Knopf — deshalb funktioniert er auch für später eingefügte Knöpfe. */
export function segButtons(id, onPick) {
  const el = $(id);
  el.addEventListener('click', ev => {
    const b = ev.target.closest('button');
    if (!b) return;
    [...el.querySelectorAll('button')].forEach(x => x.classList.toggle('active', x === b));
    onPick(b.dataset.value);
  });
}

/** Den aktiven Knopf eines segmentierten Schalters von außen setzen —
    z. B. nach dem Laden einer Datei, ohne den Rückruf auszulösen. */
export function segButtonSet(id, value) {
  for (const b of $(id).querySelectorAll('button')) b.classList.toggle('active', b.dataset.value === value);
}

/** Regler; die Wertanzeige daneben heißt <id>-val. */
export function slider(id, onChange, format) {
  const el = $(id), out = $(id + '-val');
  const push = () => {
    const v = +el.value;
    if (out) out.textContent = format ? format(v) : String(v);
    onChange(v);
  };
  el.addEventListener('input', push);
  push();
  return el;
}

/* „+10", „-10", „−10" (echtes Minuszeichen), „1,5" und „1.5" gelten alle. */
function parseNumber(txt) {
  const t = String(txt).trim().replace(/\s/g, '').replace(/−/g, '-').replace(',', '.').replace(/^\+/, '');
  if (t === '' || t === '-') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Zahleneingabe: übernommen wird mit der Eingabetaste oder beim
    Verlassen. apply(wert) gibt den tatsächlich gesetzten Wert zurück
    (geklemmt o. ä.), unlesbare Eingaben werden rot markiert und der
    letzte gültige Wert bleibt stehen. */
export function numberInput(id, apply) {
  /* Auch ein Element statt einer id — für Felder, die eine Seite je
     Auswahl neu aufbaut und die deshalb nicht über das Dokument gesucht
     werden sollen. */
  const el = typeof id === 'string' ? $(id) : id;
  const run = () => {
    const v = parseNumber(el.value);
    if (v === null) { el.classList.add('bad'); return; }
    el.classList.remove('bad');
    /* Ohne Gruppentrenner zurückschreiben: was hier steht, liest parseNumber
       beim nächsten „change"/Enter wieder ein (der Zuhörer hängt an beiden). */
    el.value = fmtPlain(apply(v));
  };
  el.addEventListener('change', run);
  el.addEventListener('keydown', ev => { if (ev.key === 'Enter') run(); });
  return el;
}

/** „Rechnen"-Knopf samt Hinweiszeile. Gibt eine Funktion zurück, die den
    Zustand setzt: { label, note, outline, disabled, warn }. */
export function runControl(btnId, noteId) {
  const btn = $(btnId), note = $(noteId);
  return spec => {
    btn.textContent = spec.label;
    btn.disabled = !!spec.disabled;
    btn.className = 'btn ' + (spec.outline ? 'btn-outline' : 'btn-primary') + ' block-btn';
    note.textContent = spec.note || '';
    note.className = 'run-note' + (spec.warn ? ' stale' : '');
  };
}

/* ── Farbskala links unten im Viewport ───────────────────────── */

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
  const el = $('colorbar');
  if (!spec) { el.classList.remove('on'); return; }
  el.classList.add('on');
  $('cb-title').textContent = spec.title;
  $('cb-scale').style.background = 'linear-gradient(to top, ' + spec.stops.join(', ') + ')';
  $('cb-ticks').className = 'cb-ticks' + (spec.bands ? ' bands' : '');
  $('cb-ticks').innerHTML = spec.ticks.map(t => '<span>' + t + '</span>').join('');
  $('cb-extra').innerHTML = spec.extra || '';
}

/** Farbfeld für die Zeile unter der Skala. */
export const chip = color => '<span class="chip" style="background:' + color + '"></span>';
