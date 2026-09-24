/* Pläne und Einstellungen aus einer Datei lesen — was jedes Werkzeug dabei
   gleich prüft: die Kennung des Formats und die Fassung, die Kennungen der
   Elemente, Punkte und Zahlen. Vorher stand das in drei Plänen Wort für
   Wort, die Prüfung von Kennung und Fassung in sieben Werkzeugen.

   Kein Three.js und keine Seite: die Pläne (js/vents/model.js,
   js/cooling/model.js, js/fill/model.js) und der Graph des Angussdesigners
   laufen damit auch in den Tests unter Node. */

/** Stammt die Datei von hier und aus keiner neueren Fassung? Sonst ein
    Fehler — `wrong` sagt, was sie hätte sein sollen. */
export function checkFormat(obj, format, version, wrong) {
  if (!obj || obj.format !== format) throw new Error(wrong);
  if (!(obj.version <= version)) throw new Error('Die Datei stammt aus einer neueren Fassung (Version ' + obj.version + ').');
}

/* Kennungen aus einer Datei: vorn ein Buchstabe, dann Buchstaben, Ziffern,
   _ oder -, höchstens 32 Zeichen. Sie stehen im Auswahlfeld und in der
   Liste — eine Datei mit anderen stammt nicht von hier und wird abgelehnt,
   nicht umgeschrieben: eine Kennung mit spitzen Klammern ist kein
   Tippfehler. */
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
export const isId = id => typeof id === 'string' && ID.test(id);
export const ID_RULE = 'erlaubt sind Buchstaben, Ziffern, „_" und „-", vorn ein Buchstabe, höchstens 32 Zeichen';

/**
 * Die Kennungen der Elemente einer Datei. Wer keine hat (oder eine, die
 * schon vergeben ist), bekommt eine neue, die keiner anderen gleicht: sonst
 * überschrieben sich die Elemente (früher wurde jedes Element ohne Kennung
 * zu „t1" und überschrieb das vorige). `noun` nennt ein Element in der
 * Meldung („Element", „Anschnitt").
 *   → { ids, seq }  seq: die höchste Nummer, weiterzuzählen ab hier
 */
export function fileIds(list, prefix, noun = 'Element') {
  const ids = [], taken = new Set();
  let seq = 0;
  list.forEach((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(noun + ' ' + (i + 1) + ' der Datei ist unlesbar.');
    const id = raw.id !== undefined && raw.id !== null && raw.id !== '' ? String(raw.id) : null;
    if (id !== null && !isId(id)) throw new Error(noun + ' ' + (i + 1) + ' der Datei hat keine gültige Kennung: ' + ID_RULE + '.');
    ids.push(id !== null && !taken.has(id) ? id : null);
    if (id === null) return;
    taken.add(id);
    const num = +id.replace(/\D/g, '');
    if (Number.isSafeInteger(num)) seq = Math.max(seq, num);
  });
  for (let i = 0; i < ids.length; i++) {
    if (ids[i]) continue;
    let id;
    do id = prefix + (++seq); while (taken.has(id));
    taken.add(id);
    ids[i] = id;
  }
  return { ids, seq };
}

/** Ein Punkt aus der Datei: drei Zahlen — sonst ist die Datei beschädigt. */
export function filePoint(v, what) {
  const p = Array.isArray(v) && v.length >= 3 ? v.slice(0, 3).map(Number) : null;
  if (!p || !p.every(Number.isFinite)) throw new Error(what + ': Die Lage fehlt oder ist keine Zahl.');
  return p;
}

/** Eine Zahl aus der Datei in den Grenzen ihres Feldes ({ min, max }) —
    oder die Vorgabe, wenn keine dasteht: was im Feld nicht einzugeben
    wäre, soll auch aus einer Datei nicht kommen. */
export function fileNumber(v, meta, fallback) {
  const x = v === null || v === '' || v === undefined ? NaN : Number(v);
  return Number.isFinite(x) ? Math.max(meta.min, Math.min(meta.max, x)) : fallback;
}
