/* Die Eingabedomäne der Werkzeuge außerhalb des Dashboards.

   Befund: Teilekosten und Sprengflächenanalyse trugen ihre Grenzen
   ausschließlich als min="…"/max="…" im Markup. Das ist ein Hinweis an den
   Spinner, keine Prüfung — getippt, eingefügt oder aus einem Projekt geladen
   kommt jeder Wert durch. Gemessen: 150 % Ausschuss → NaN, 500 % OEE → eine
   glatte falsche Zahl, 50 % Schwindmaß → Volumenfaktor 3,375 statt 1,017.

   Jetzt steht die Domäne in shared/felddomaene.js und die Seiten fragen sie,
   bevor sie rechnen.

     node --test tests/web/werkzeug-domaene.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');
const read = f => readFileSync(path.join(site, f), 'utf8');
globalThis.window = globalThis;

const DOM = require(path.join(site, 'shared/felddomaene.js'));
const KOSTEN = { mpart: 12, mdose: 18.2, tz: 60, kav: 1, a: 2, oee: 85, pAl: 2.6,
  pRe: 1.2, kr: 5, eKg: 0.8, pE: 0.31, pM: 95, pP: 65, nP: 1, wz: 120000, st: 200000, dg: 10 };
const SPRENG = { shrink: 0.55, ptarget: 600, safety: 1.3, coreArea: 0, coreAngle: 11 };

/* ── Die Tabelle selbst ────────────────────────────────────────────────── */

test('domäne: jedes Feld hat untere und obere Grenze, jede harte eine Begründung', () => {
  for (const [werkzeug, felder] of Object.entries(DOM.FELDER)) {
    assert.ok(felder.length, `${werkzeug}: keine Felder`);
    for (const f of felder) {
      const lo = f.gt !== undefined ? f.gt : f.min;
      assert.ok(lo !== undefined, `${werkzeug}.${f.key}: keine untere Grenze`);
      assert.ok(f.max !== undefined, `${werkzeug}.${f.key}: keine obere Grenze`);
      assert.ok(f.max > lo, `${werkzeug}.${f.key}: max ${f.max} liegt nicht über ${lo}`);
      assert.ok(f.label && f.unit !== undefined, `${werkzeug}.${f.key}: Label oder Einheit fehlt`);
      assert.ok(['hart', 'plaus'].includes(f.bound), `${werkzeug}.${f.key}: bound fehlt`);
      if (f.bound === 'hart') assert.ok(f.why, `${werkzeug}.${f.key}: harte Grenze ohne Begründung`);
    }
  }
});

test('domäne: jede eingetragene Grenze weist den Wert dahinter zurück', () => {
  for (const felder of Object.values(DOM.FELDER)) {
    for (const f of felder) {
      const lo = f.gt !== undefined ? f.gt : f.min;
      if (f.gt !== undefined) assert.ok(DOM.pruefeFeld(f, f.gt), `${f.key}: gt greift nicht`);
      else assert.ok(DOM.pruefeFeld(f, lo - 1), `${f.key}: min greift nicht`);
      assert.ok(DOM.pruefeFeld(f, f.max + 1), `${f.key}: max greift nicht`);
      assert.ok(DOM.pruefeFeld(f, NaN), `${f.key}: NaN kommt durch`);
      assert.ok(DOM.pruefeFeld(f, Infinity), `${f.key}: Infinity kommt durch`);
      assert.equal(DOM.pruefeFeld(f, lo + (f.max - lo) / 2), null, `${f.key}: Mitte wird abgewiesen`);
    }
  }
});

/* H_MONTH: kein Feld einer Werkzeugseite (nur die Kostensätze der
   Organisation, /konto/), darum nicht in FELDER, aber Teil derselben
   Domäne — dieselben Regeln wie jedes andere Feld. */
test('H_MONTH: dieselben Regeln wie ein Feld aus FELDER, nur außerhalb davon', () => {
  const f = DOM.H_MONTH;
  assert.ok(f && f.key === 'hMonth');
  assert.ok(f.label && f.unit !== undefined);
  assert.ok(f.max > f.min);
  assert.ok(['hart', 'plaus'].includes(f.bound));
  assert.ok(DOM.pruefeFeld(f, f.min - 1), 'min greift nicht');
  assert.ok(DOM.pruefeFeld(f, f.max + 1), 'max greift nicht');
  assert.ok(DOM.pruefeFeld(f, NaN), 'NaN kommt durch');
  assert.equal(DOM.pruefeFeld(f, f.min), null, 'die Grenze selbst muss noch gehen');
  assert.equal(DOM.FELDER.teilekosten.some(x => x.key === 'hMonth'), false,
    'hMonth gehört nicht zu FELDER.teilekosten — sonst böte die Teilekosten-Seite es als Eingabe an');
});

/* ── Was vorher durchkam ───────────────────────────────────────────────── */

test('kosten: die Werte, die vorher NaN oder eine falsche Zahl lieferten', () => {
  assert.ok(DOM.pruefe('teilekosten', KOSTEN).ok, 'die Vorgabewerte gelten als ungültig');
  const faelle = [
    ['a', 150, 'lieferte NaN'],
    ['oee', 0, 'lieferte NaN'],
    ['kav', 0, 'lieferte NaN'],
    ['tz', 0, 'lieferte NaN'],
    ['oee', 500, 'lieferte 47,262 € — glatt und falsch'],
    ['kr', 80, 'lieferte 86,134 € — glatt und falsch'],
  ];
  for (const [k, x, was] of faelle) {
    const u = DOM.pruefe('teilekosten', { ...KOSTEN, [k]: x });
    assert.equal(u.ok, false, `${k} = ${x} kommt durch (${was})`);
    assert.ok(u.bad.includes(k), `${k} = ${x} wird nicht markiert`);
  }
});

test('kosten: das Bauteil kann nicht schwerer sein als der Schuss', () => {
  const u = DOM.pruefe('teilekosten', { ...KOSTEN, mpart: 20 });
  assert.equal(u.ok, false);
  assert.match(u.msgs.join(' '), /Materialausbeute wäre über 100/);
});

test('sprengfläche: das Schwindmaß hat jetzt auch eine Obergrenze', () => {
  assert.ok(DOM.pruefe('sprengflaeche', SPRENG).ok, 'die Vorgabewerte gelten als ungültig');
  /* 50 % Schwindmaß ergaben klaglos den Volumenfaktor (1+s/100)³ = 3,375 —
     das Markup sagte max="5", gelesen hat es niemand. */
  assert.equal(DOM.pruefe('sprengflaeche', { ...SPRENG, shrink: 50 }).ok, false);
  assert.equal(DOM.pruefe('sprengflaeche', { ...SPRENG, shrink: -1 }).ok, false);
  assert.equal(DOM.pruefe('sprengflaeche', { ...SPRENG, safety: 0.5 }).ok, false);
  assert.equal(DOM.pruefe('sprengflaeche', { ...SPRENG, coreAngle: 90 }).ok, false,
    'tan(90°) ist unendlich');
  assert.equal(DOM.pruefe('sprengflaeche', { ...SPRENG, shrink: 5 }).ok, true,
    'genau an der Grenze muss es noch gehen');
});

/* ── Die Verdrahtung ───────────────────────────────────────────────────── */

test('verdrahtung: die Grenzen stehen nirgends mehr von Hand im Markup', () => {
  for (const [datei, muster] of [
    ['tools/teilekosten/index.html', /id="i-\w+"[^>]*\b(?:min|max)=/],
    ['tools/sprengflaeche/index.html', /id="(?:shrink|ptarget|safety|core-area|core-angle)-input"[^>]*\b(?:min|max)=/],
  ]) {
    assert.ok(!muster.test(read(datei)),
      `${datei}: eine Grenze steht wieder von Hand im Markup — sie gehört in die Domäne`);
  }
});

test('verdrahtung: beide Seiten setzen die Attribute aus der Domäne', () => {
  const kosten = read('tools/teilekosten/index.html');
  const spreng = read('tools/sprengflaeche/stl-app.js');
  for (const [name, src] of [['Teilekosten', kosten], ['Sprengfläche', spreng]]) {
    assert.match(src, /__DOMAENE__/, `${name}: die Domäne wird nicht geladen`);
    assert.match(src, /attribute\('(?:teilekosten|sprengflaeche)'/, `${name}: attribute() wird nicht gerufen`);
    assert.match(src, /setzeGrenzen\(\)/, `${name}: setzeGrenzen() wird nicht gerufen`);
  }
  assert.match(read('tools/teilekosten/index.html'), /src="\/shared\/felddomaene\.js"/,
    'Teilekosten lädt shared/felddomaene.js nicht');
  assert.match(read('tools/sprengflaeche/index.html'), /src="\/shared\/felddomaene\.js"/,
    'Sprengfläche lädt shared/felddomaene.js nicht');
});

/* Die Kostensätze der Organisation (/konto/, Reiter „Kosten & Sätze"): eine
   dritte Seite mit derselben Domäne wie die Teilekosten-Seite (plus
   H_MONTH), aber ohne attribute()/setzeGrenzen() — das Formular baut sich
   hier bei jedem Aufruf aus KOSTEN_FIELDS neu, die Grenzen kommen direkt
   beim Bauen mit. */
test('verdrahtung: die Kostensätze der Organisation (/konto/) laden die Domäne und prüfen vor dem Speichern', () => {
  const konto = read('konto/index.html');
  assert.match(konto, /src="\/shared\/felddomaene\.js"/, 'lädt shared/felddomaene.js nicht');
  assert.match(konto, /__DOMAENE__/, 'die Domäne wird nicht gelesen');
  assert.match(konto, /DOMAENE\.H_MONTH/, 'hMonth bekommt keine eigene Grenze (H_MONTH)');
  assert.match(konto, /DOMAENE\.pruefeFeld\(/, 'die Grenzen werden nicht geprüft');
  /* Jedes Feld, das renderKosten() zeigt, bekommt min/max am Element — vor
     dem Umbau standen dort keine Attribute und keine Prüfung vor dem PUT. */
  assert.match(konto, /min="\s*'\s*\+\s*lo\s*\+\s*'"|min=" \+ lo \+ "/, 'renderKosten() setzt kein min=');
  assert.match(konto, /max="\s*'\s*\+\s*b\.max\s*\+\s*'"|max=" \+ b\.max \+ "/, 'renderKosten() setzt kein max=');
  /* Speichern bricht bei einer verletzten Grenze ab, statt zu senden. */
  const save = konto.slice(konto.indexOf("$('sd-save').addEventListener"));
  const vorDemFetch = save.slice(0, save.indexOf("await api('PUT'"));
  assert.match(vorDemFetch, /pruefeKosten\(data\)/, "pruefeKosten() steht nicht vor dem PUT");
  assert.match(vorDemFetch, /if \(!check\.ok\) \{[^}]*return/, 'eine verletzte Grenze bricht nicht ab');
});

test('verdrahtung: kein Rechenweg läuft an der Sperre vorbei', () => {
  const spreng = read('tools/sprengflaeche/stl-app.js')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /* renderTable/renderMachines/renderAlloyInfo dürfen nur aus renderAll und
     aus dem gesperrten Block in update() heraus gerufen werden. Genau das
     ging vorher schief: die vier Zahlenfelder hingen direkt an
     renderMachines und umgingen die Prüfung, für die sie da sind. */
  const direkt = [...spreng.matchAll(/^\s*renderMachines\(\);/gm)].length;
  assert.equal(direkt, 1,
    `renderMachines() wird ${direkt}× direkt gerufen — erwartet genau einmal (im gesperrten Block)`);
  assert.match(spreng, /addEventListener\('input', pruefeGefolgtVon\(renderMachines\)\)/,
    'die Zahlenfelder hängen nicht an der Prüfung');

  const kosten = read('tools/teilekosten/index.html');
  assert.match(kosten, /var gueltig = checkInputs\(\);/, 'das Urteil wird nicht abgefragt');
  assert.match(kosten, /if \(!gueltig && letzterGueltigerStand\) return;/,
    'bei ungültiger Eingabe wird weitergerechnet');
});

test('verdrahtung: die Abblend-Regel trifft Elemente, die es gibt', () => {
  for (const [seite, css] of [
    ['tools/teilekosten/index.html', read('tools/teilekosten/index.html')],
    ['tools/sprengflaeche/index.html', read('tools/sprengflaeche/index.html')],
  ]) {
    const html = read(seite);
    const regel = css.match(/body\.inputs-invalid[^{]*\{/);
    assert.ok(regel, `${seite}: keine .inputs-invalid-Regel`);
    for (const m of regel[0].matchAll(/#([\w-]+)/g))
      assert.ok(html.includes(`id="${m[1]}"`), `${seite}: .inputs-invalid zeigt auf #${m[1]} — gibt es nicht`);
    for (const m of regel[0].matchAll(/\.(?!inputs-invalid)([\w-]+)/g))
      assert.ok(html.includes(`class="${m[1]}"`) || html.includes(` ${m[1]}"`) || html.includes(`"${m[1]} `),
        `${seite}: .inputs-invalid zeigt auf .${m[1]} — kommt im Markup nicht vor`);
  }
  assert.match(read('tools/sprengflaeche/index.html'), /id="input-warn"/,
    'Sprengfläche: es fehlt der Ort für die Meldung');
});

/* ── attribute() setzt wirklich ────────────────────────────────────────── */

test('attribute(): min und max landen am Element', () => {
  const elemente = {};
  const doc = { getElementById: id => (elemente[id] = elemente[id] || { id }) };
  const n = DOM.attribute('teilekosten', k => 'i-' + k, doc);
  assert.equal(n, DOM.FELDER.teilekosten.length, 'nicht alle Felder wurden gesetzt');
  assert.equal(elemente['i-a'].min, '0');
  assert.equal(elemente['i-a'].max, '99');
  assert.equal(elemente['i-oee'].min, '1');
  assert.equal(elemente['i-mpart'].min, '0', 'gt: 0 muss als min="0" am Feld landen');
});
