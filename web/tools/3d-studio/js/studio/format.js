/* Zahlen im Studio — eine Sprache für alle Seiten.

   Anzeige immer deutsch (Komma, Tausenderpunkt), Eingabefelder ohne
   Gruppentrenner (was da steht, wird wieder eingelesen), und ein
   Parser, der deutsche Schreibweisen richtig versteht:

     „1,5"      → 1,5        Komma ist das Dezimalzeichen
     „1.5"      → 1,5        ein Punkt vor 1–2 Ziffern ist ein Dezimalpunkt
     „1.500"    → 1500       ein Punkt vor genau drei Ziffern gruppiert Tausender
     „0.500"    → 0,5        … außer nach einer führenden Null
     „1.234,5"  → 1234,5     stehen beide, ist das letzte Zeichen das Dezimalzeichen
     „1,234.5"  → 1234,5
     „−3", „+4" → −3, 4      echtes Minus und ein Plus gelten

   Vorher stand der Parser in js/ui/controls.js und las „1.500" als 1,5 —
   die Anzeige schreibt deutsch, also musste er auch deutsch lesen. */

/** Anzeige: deutsch gruppiert, höchstens `max` Nachkommastellen. */
export const fmt = (v, max = 2) => Number(v).toLocaleString('de-DE', { maximumFractionDigits: max });

/** Feste Nachkommastellen — für Spalten, in denen Werte untereinander
    stehen („1,0 %" über „0,6 %", nicht „1 %"). */
export const fmtFixed = (v, digits = 1) =>
  Number(v).toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Für Eingabefelder: ohne Gruppentrenner, damit der Wert wieder
    eingelesen werden kann. */
export const fmtPlain = (v, max = 2) =>
  Number(v).toLocaleString('de-DE', { maximumFractionDigits: max, useGrouping: false });

/* Nachkommastellen je Einheit, damit dieselbe Größe überall gleich aussieht. */
const DIGITS = { mm: 1, 'mm²': 0, 'cm²': 0, 'cm³': 1, '%': 0, ms: 0, s: 1, 'm/s': 2, '°': 1, bar: 2, kg: 2, MB: 1, 'Mio.': 2 };

/** Wert mit Einheit: „12,5 mm", „1.263 cm³", „42 %" — die Stellen folgen
    der Einheit; Millisekunden unter 10 bekommen eine Stelle. */
export function fmtUnit(v, unit, max) {
  if (!Number.isFinite(v)) return '—';
  let d = max !== undefined ? max : (unit in DIGITS ? DIGITS[unit] : 2);
  if (unit === 'ms' && Math.abs(v) < 10 && max === undefined) d = 1;
  return fmt(v, d) + (unit ? (unit === '°' || unit === '%' ? (unit === '%' ? ' %' : ' °') : ' ' + unit) : '');
}

/** Eingabe lesen. null, wenn es keine Zahl ist. */
export function parseNumber(txt) {
  let t = String(txt ?? '').trim().replace(/\s/g, '').replace(/−/g, '-').replace(/^\+/, '');
  if (t === '' || t === '-') return null;
  const hasDot = t.includes('.'), hasComma = t.includes(',');
  if (hasDot && hasComma) {
    /* Das letzte der beiden ist das Dezimalzeichen, das andere gruppiert. */
    const dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    const grp = dec === '.' ? ',' : '.';
    t = t.split(grp).join('');
    if (dec === ',') t = t.replace(',', '.');
  } else if (hasComma) {
    if ((t.match(/,/g) || []).length > 1) return null;
    t = t.replace(',', '.');
  } else if (hasDot) {
    /* Nur Punkte: Tausenderpunkte, wenn jede Gruppe drei Ziffern hat und
       vorn keine führende Null steht — sonst ein Dezimalpunkt. */
    if (/^-?\d{1,3}(\.\d{3})+$/.test(t) && !/^-?0\d*\./.test(t)) t = t.replace(/\./g, '');
    else if ((t.match(/\./g) || []).length > 1) return null;
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** In Grenzen halten und sagen, ob es nötig war. */
export function clamp(v, { min = -Infinity, max = Infinity } = {}) {
  const value = Math.max(min, Math.min(max, v));
  return { value, clamped: value !== v };
}

/** Bereich als Text für Hinweise: „0,3–30 mm". */
export function rangeText(min, max, unit) {
  const lo = Number.isFinite(min) ? fmtPlain(min) : null;
  const hi = Number.isFinite(max) ? fmtPlain(max) : null;
  const u = unit ? ' ' + unit : '';
  if (lo !== null && hi !== null) return lo + '–' + hi + u;
  if (lo !== null) return 'ab ' + lo + u;
  if (hi !== null) return 'bis ' + hi + u;
  return '';
}

/** Uhrzeit für den Speicherstand: „14:02". */
export const fmtTime = (when = Date.now()) => new Date(when).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Datum und Zeit für den Entwurfshinweis: „17.09., 14:02". */
export const fmtWhen = (when = Date.now()) => {
  const d = new Date(when);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ', ' + fmtTime(when);
};
