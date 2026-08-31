/* Erzeugt aus der EINEN Quelle der Eingabedomäne
   — web/tools/auslegung/js/config/fields.js (min/gt/max je Feld + PAIRS) —
   zwei Abbilder:

     docs/eingabegrenzen.md   die lesbare Übersicht
     backend/_domain.py       dieselbe Domäne für den Server

   Dasselbe Muster wie bei der v_krit-Tabelle: eine Quelle, ein Generator,
   beide Sprachen, ein CI-Diff. Browser und Server können so nicht mehr
   auseinanderlaufen (H-39).

   Die Datei ist nicht von Hand zu pflegen — sie ist ein Abbild. Die CI
   vergleicht sie gegen den Code (git diff --exit-code); wer eine Grenze
   ändert und nicht regeneriert, bekommt einen roten Lauf.

   Aufruf:  node scripts/gen-domain-doc.mjs                                   */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { groups, PAIRS, domainFields } = await import(
  join(ROOT, 'web/tools/auslegung/js/config/fields.js'));

const num = x => String(x).replace('.', ',');

/* Bereich als lesbares Intervall: „> 0 … 40" bzw. „0 … 100". */
function bereich(f) {
  const lo = f.gt !== undefined ? '> ' + num(f.gt)
    : f.min !== undefined ? num(f.min) : '−∞';
  const hi = f.max !== undefined ? num(f.max) : '∞';
  return lo + ' … ' + hi;
}

const HART = 'hart';
const zeilen = [];
zeilen.push('# Eingabegrenzen');
zeilen.push('');
zeilen.push('<!-- GENERIERT von scripts/gen-domain-doc.mjs — nicht von Hand ändern.');
zeilen.push('     Quelle: web/tools/auslegung/js/config/fields.js -->');
zeilen.push('');
zeilen.push('Diese Datei ist ein **Abbild** der Eingabedomäne, nicht ihre Quelle.');
zeilen.push('Sie steht vollständig in `web/tools/auslegung/js/config/fields.js` —');
zeilen.push('`min`/`gt`/`max` an jedem Feld und `PAIRS` für die Regeln zwischen');
zeilen.push('zwei Feldern. Aus derselben Quelle kommen:');
zeilen.push('');
zeilen.push('- die Markierung ungültiger Felder in der Seitenleiste (`validate()`),');
zeilen.push('- die Sperre in `render()` — außerhalb der Domäne wird **nicht gerechnet**,');
zeilen.push('- die `min`/`max`-Attribute der Eingabefelder im Browser,');
zeilen.push('- diese Übersicht.');
zeilen.push('');
zeilen.push('Eine Grenze ändert man an genau einer Stelle. Wer eine neue anlegt und');
zeilen.push('diese Datei nicht neu erzeugt, bekommt einen roten CI-Lauf.');
zeilen.push('');

/* --- Legende --------------------------------------------------------- */
zeilen.push('## Zweierlei Grenzen');
zeilen.push('');
zeilen.push('| | Bedeutung |');
zeilen.push('|---|---|');
zeilen.push('| **hart** | Physikalisch oder definitorisch unmöglich. Ein Durchflussbeiwert über 1 hieße mehr Durchfluss als Antrieb; ein Füllgrad über 100 % ist kein Anteil mehr. |');
zeilen.push('| plausibel | Schließt nur Absurdes aus, damit die Rechnung nicht mit Unsinn weiterläuft. Großzügig gesetzt — die größte Druckgießmaschine der Welt passt hinein. |');
zeilen.push('');

/* --- Felder je Gruppe ------------------------------------------------ */
zeilen.push('## Felder');
zeilen.push('');
let nHart = 0, nFelder = 0;
const hart = [];
for (const g of groups) {
  const fs = (g.columns ? g.columns.flatMap(c => c.fields) : g.fields)
    .filter(f => f.type !== 'select');
  if (!fs.length) continue;
  zeilen.push('### ' + g.title);
  zeilen.push('');
  zeilen.push('| Feld | Einheit | Vorgabe | Zulässig | Art |');
  zeilen.push('|---|---|---:|---|---|');
  for (const f of fs) {
    nFelder++;
    if (f.bound === HART) nHart++;
    if (f.bound === HART) hart.push([f, f.why]);
    zeilen.push('| ' + f.label.replace(/\|/g, '\\|') + ' `' + f.key + '` | ' +
      (f.unit || '—') + ' | ' + num(f.def) + ' | `' + bereich(f) + '` | ' +
      (f.bound === HART ? '**hart**' : 'plausibel') + ' |');
  }
  zeilen.push('');
}

/* --- Harte Grenzen ---------------------------------------------------- */
zeilen.push('## Die harten Grenzen im Einzelnen');
zeilen.push('');
zeilen.push('| Feld | Grenze | Warum sie hart ist |');
zeilen.push('|---|---|---|');
for (const [f, why] of hart) {
  zeilen.push('| ' + f.label + ' `' + f.key + '` | `' + bereich(f) + '` | ' + (why || '—') + ' |');
}
zeilen.push('');
zeilen.push('Alle übrigen Grenzen sind Plausibilitätsgrenzen. Sie sind so weit');
zeilen.push('gesetzt, dass kein reales Werkzeug und keine reale Maschine an sie');
zeilen.push('stößt — ihre Aufgabe ist allein, Tippfehler und leere Felder daran zu');
zeilen.push('hindern, in die Rechnung zu gelangen.');
zeilen.push('');

/* --- Paarregeln ------------------------------------------------------ */
const byKey = Object.fromEntries(domainFields().map(f => [f.key, f]));
const nm = k => (byKey[k] ? byKey[k].label : k);
zeilen.push('## Regeln zwischen zwei Feldern');
zeilen.push('');
zeilen.push('Bedingungen, die eine Einzelgrenze nicht ausdrücken kann.');
zeilen.push('');
zeilen.push('| Bedingung | in Worten |');
zeilen.push('|---|---|');
for (const r of PAIRS) {
  const b = r.op === 'in'
    ? '`' + r.lo + '` ≤ `' + r.key + '` ≤ `' + r.hi + '`'
    : '`' + r.a + '` ' + (r.op === '<' ? '<' : '≤') + ' `' + r.b + '`';
  zeilen.push('| ' + b + ' | ' + r.text + ' |');
}
zeilen.push('| `psel` ≤ p_max(Maschine) | Nachdruck über dem spezifischen Gießdruck auf Ø `dmin` — abgeleitet, keine Feldkonstante |');
zeilen.push('');

/* --- Was daraus folgt ------------------------------------------------ */
zeilen.push('## Was die Sperre erspart');
zeilen.push('');
zeilen.push('`render()` fragt das Urteil, bevor gerechnet wird. Damit sind die');
zeilen.push('folgenden Zustände **hinter** der Sperre unerreichbar — die Diagramme');
zeilen.push('müssen sich nicht mehr einzeln dagegen wehren:');
zeilen.push('');
zeilen.push('| unerreichbar, weil | betraf bisher |');
zeilen.push('|---|---|');
zeilen.push('| kein Feld ist `NaN` oder `Infinity` | die Guards in allen 19 Diagrammen |');
zeilen.push('| `gate`, `vmax`, `Cd`, `injForce`, `pAcc`, `diam` > 0 | `window.js` (3×), `filltime.js`, `pq2.js` (2×), `area.js`, `machine.js` |');
zeilen.push('| `Tflow` > `Tdie`, `Tliq` > `Tdie`, `Tliq` > `Tsol` | `ftwall.js`, `bubble.js` (2×) |');
zeilen.push('| `dmin` < `dmax`, `lmin` < `lmax`, `wallMin` < `wallMax` | Achsen mit Länge null in `render/` |');
zeilen.push('');
zeilen.push('Was **bleibt**: Prüfungen an *abgeleiteten* Größen. `p_max`, φ, `v₂`, `p₀`');
zeilen.push('können auch aus gültigen Eingaben unbrauchbar werden — dort ist ein Guard');
zeilen.push('kein Duplikat, sondern die einzige Stelle, die es merken kann.');
zeilen.push('');


/* ── Die übrigen Werkzeuge (shared/felddomaene.js) ─────────────────────── */
const WERKZEUG_TITEL = {
  teilekosten: 'Teilekosten-Kalkulation',
  sprengflaeche: 'Sprengflächenanalyse',
};
const wz = createRequire(import.meta.url)(join(ROOT, 'web/shared/felddomaene.js'));

zeilen.push('---');
zeilen.push('');
zeilen.push('# Die übrigen Werkzeuge');
zeilen.push('');
zeilen.push('Teilekosten und Sprengflächenanalyse haben eigene Eingabemengen und');
zeilen.push('laden klassische Scripts. Ihre Domäne steht deshalb in einer eigenen');
zeilen.push('Datei — `web/shared/felddomaene.js` — nach demselben Muster: eine');
zeilen.push('Quelle, aus der die `min`/`max`-Attribute, die Sperre und dieser');
zeilen.push('Abschnitt kommen.');
zeilen.push('');

for (const [key, titel] of Object.entries(WERKZEUG_TITEL)) {
  const felder = wz.FELDER[key] || [];
  zeilen.push('## ' + titel);
  zeilen.push('');
  zeilen.push('| Feld | Einheit | Zulässig | Art |');
  zeilen.push('|---|---|---|---|');
  for (const f of felder) {
    const lo = f.gt !== undefined ? '> ' + num(f.gt) : f.min !== undefined ? num(f.min) : '−∞';
    const hi = f.max !== undefined ? num(f.max) : '∞';
    zeilen.push('| ' + f.label.replace(/\|/g, '\\|') + ' `' + f.key + '` | ' +
      (f.unit || '—') + ' | `' + lo + ' … ' + hi + '` | ' +
      (f.bound === HART ? '**hart**' : 'plausibel') + ' |');
    nFelder++;
    if (f.bound === HART) nHart++;
  }
  zeilen.push('');
  const hartHier = felder.filter(f => f.bound === HART);
  if (hartHier.length) {
    zeilen.push('Harte Grenzen: ' + hartHier.map(f =>
      '`' + f.key + '` — ' + (f.why || '')).join(' · ') + '.');
    zeilen.push('');
  }
  const paare = wz.PAARE[key] || [];
  if (paare.length) {
    zeilen.push('| Bedingung | in Worten |');
    zeilen.push('|---|---|');
    for (const r of paare)
      zeilen.push('| `' + r.a + '` ' + (r.op === '<' ? '<' : '≤') + ' `' + r.b + '` | ' + r.text + ' |');
    zeilen.push('');
  }
}

zeilen.push('Beide Seiten fragen das Urteil, bevor sie rechnen, und lassen bei');
zeilen.push('Verletzung den letzten gültigen Stand abgeblendet stehen. Vorher stand');
zeilen.push('die Kalkulation bei 150 % Ausschuss auf `NaN` und lieferte bei 500 %');
zeilen.push('OEE eine glatte, falsche Zahl — mit einem Hinweis darunter, dass die');
zeilen.push('Zahlen „nicht belastbar" seien.');
zeilen.push('');

/* --- Kennzahlen ------------------------------------------------------ */
zeilen.push('---');
zeilen.push('');
zeilen.push('_' + nFelder + ' Felder, davon ' + nHart + ' mit harter Grenze · ' +
  (PAIRS.length + 1 + Object.values(wz.PAARE).reduce((a, p) => a + p.length, 0)) +
  ' Regeln zwischen Feldern · erzeugt aus `config/fields.js` und ' +
  '`shared/felddomaene.js`._');
zeilen.push('');

writeFileSync(join(ROOT, 'docs/eingabegrenzen.md'), zeilen.join('\n'), 'utf8');

/* ── backend/_domain.py ────────────────────────────────────────────────── */
const Q = '"' + '"' + '"';
const py = [];
py.push(Q + 'Eingabedomäne — GENERIERT, nicht von Hand ändern.');
py.push('');
py.push('Quelle:  web/tools/auslegung/js/config/fields.js');
py.push('Erzeugt: node scripts/gen-domain-doc.mjs');
py.push('');
py.push('Damit prüft der Server dieselben Grenzen wie der Browser. Vorher hatte');
py.push('jede Seite ihre eigene Liste; gemessen kamen sechs Grenzeingaben durch');
py.push('den Browser, die der Server abwies — der Anwender sah nur "HTTP 422".');
py.push('');
py.push('LO_KIND: "gt" = echt groesser als LO, "min" = mindestens LO.');
py.push(Q);
py.push('');
py.push('from __future__ import annotations');
py.push('');
py.push('import math');
py.push('');
py.push('# key -> (lo_kind, lo, max, label)');
py.push('FIELDS: dict[str, tuple[str, float, float, str]] = {');
for (const f of domainFields()) {
  const kind = f.gt !== undefined ? 'gt' : 'min';
  const lo = f.gt !== undefined ? f.gt : f.min;
  py.push('    ' + JSON.stringify(f.key) + ': (' + JSON.stringify(kind) + ', ' +
    lo + ', ' + f.max + ', ' + JSON.stringify(f.label) + '),');
}
py.push('}');
py.push('');
py.push('# (a, b, op, text) mit op "<" oder "<=";  ("in", key, lo, hi, text)');
py.push('PAIRS: list[tuple] = [');
for (const r of PAIRS) {
  py.push(r.op === 'in'
    ? '    ("in", ' + JSON.stringify(r.key) + ', ' + JSON.stringify(r.lo) + ', ' +
      JSON.stringify(r.hi) + ', ' + JSON.stringify(r.text) + '),'
    : '    (' + JSON.stringify(r.a) + ', ' + JSON.stringify(r.b) + ', ' +
      JSON.stringify(r.op) + ', ' + JSON.stringify(r.text) + '),');
}
py.push(']');
py.push('');
py.push('');
py.push('def check_field(key: str, x) -> str | None:');
py.push('    ' + Q + 'None = in Ordnung, sonst der Grund.');
py.push('');
py.push('    Ein unbekannter Schlüssel ist ein Fehler, kein Durchlass: ein');
py.push('    vertipptes "forcee" ließ die Maschinenkraft bisher still auf dem');
py.push('    Vorgabewert stehen (H-40).');
py.push('    ' + Q);
py.push('    spec = FIELDS.get(key)');
py.push('    if spec is None:');
py.push('        return "ist kein Eingabefeld"');
py.push('    kind, lo, hi, _label = spec');
py.push('    if isinstance(x, bool) or not isinstance(x, (int, float)):');
py.push('        return "muss eine Zahl sein"');
py.push('    if not math.isfinite(x):');
py.push('        return "ist keine gültige JSON-Zahl (NaN/Infinity)"');
py.push('    if kind == "gt" and not x > lo:');
py.push('        return f"muss größer als {lo:g} sein"');
py.push('    if kind == "min" and not x >= lo:');
py.push('        return f"darf nicht unter {lo:g} liegen"');
py.push('    if not x <= hi:');
py.push('        return f"darf nicht über {hi:g} liegen"');
py.push('    return None');
py.push('');
writeFileSync(join(ROOT, 'backend/_domain.py'), py.join('\n'), 'utf8');

console.log('docs/eingabegrenzen.md + backend/_domain.py: ' +
  nFelder + ' Felder, ' + PAIRS.length + ' Paarregeln');
