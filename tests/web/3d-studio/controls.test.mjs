/* Zahleneingaben des 3D-Studios: der Rundlauf Anzeige → Parser.

   numberInput schreibt den übernommenen Wert formatiert zurück, und derselbe
   Zuhörer liest ihn beim nächsten „change"/Enter wieder ein. Mit deutschem
   Tausenderpunkt wurde dabei jeder Wert ≥ 1000 still durch 1000 geteilt:
   „1500" → „1.500" → 1,5 (C-9). Betroffen waren Suchgrenze, Bandbreite,
   Aufmaß und die Skalengrenzen.
     node --test tests/web/3d-studio/controls.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const { fmt, fmtPlain } = await import('../../../web/tools/3d-studio/js/studio/format.js');

/* parseNumber ist modulintern — hier wortgleich nachgebildet, damit der
   Rundlauf ohne DOM prüfbar bleibt. */
function parseNumber(txt) {
  const t = String(txt).trim().replace(/\s/g, '').replace(/−/g, '-').replace(',', '.').replace(/^\+/, '');
  if (t === '' || t === '-') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

test('Rundlauf: was numberInput zurückschreibt, liest der Parser wieder ein', () => {
  for (const v of [0, 0.25, 12, 999, 1000, 1500, 1234.5, 25000, 1e6, -1500]) {
    const shown = fmtPlain(v);
    assert.equal(parseNumber(shown), Math.round(v * 100) / 100,
      `${v} → „${shown}" → ${parseNumber(shown)}`);
  }
});

test('fmtPlain setzt keinen Gruppentrenner, fmt (Anzeige) weiterhin schon', () => {
  assert.equal(fmtPlain(1500), '1500');
  assert.equal(fmtPlain(1234.5), '1234,5');
  assert.equal(fmt(1500), '1.500', 'die reinen Anzeigen bleiben deutsch gruppiert');
});

test('die Eingabeschreibweisen aus der Bedienung gelten unverändert', () => {
  assert.equal(parseNumber('1,5'), 1.5);
  assert.equal(parseNumber('1.5'), 1.5);
  assert.equal(parseNumber('+10'), 10);
  assert.equal(parseNumber('−10'), -10, 'echtes Minuszeichen');
  assert.equal(parseNumber(' 42 '), 42);
  assert.equal(parseNumber(''), null);
  assert.equal(parseNumber('abc'), null);
});
