/* Farbschemata (web/shared/schemes.js): ein Schema ist eine Liste von
   Abweichungen von der Palette — es darf keine Farbe erfinden, die es in
   palette.js nicht gibt, und es muss dieselben Kontrastregeln einhalten wie
   der Standard. Dazu die Einbindung: jede Seite, die palette.js lädt, muss
   schemes.js direkt danach und vor nav.js laden.

     node --test tests/web/schemes.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const site = path.join(root, 'web');
globalThis.window = globalThis;
const P = require(path.join(site, 'shared/palette.js'));
const S = require(path.join(site, 'shared/schemes.js'));
const read = f => readFileSync(path.join(site, f), 'utf8');

/* Kontrast wie in palette.test.mjs — dort für den Standard, hier für jedes
   Schema gegen SEINE eigenen Flächen. */
function lum(hex) {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('jedes Schema kennt nur Farbnamen der Palette und schreibt sie als Hex', () => {
  const ids = new Set();
  const gruppen = new Set(S.groups.map(g => g.id));
  assert.ok(S.list.length >= 12, 'es sollen mehrere Schemata zur Wahl stehen');
  for (const s of S.list) {
    assert.match(s.id, /^[a-z]+$/, 'id');
    assert.ok(!ids.has(s.id), 'doppelte id ' + s.id);
    ids.add(s.id);
    assert.ok(gruppen.has(s.group), s.id + ': unbekannte Gruppe ' + s.group);
    assert.ok(s.name && s.note, s.id + ': Name und Beschreibung');
    for (const [k, v] of Object.entries(s.colors)) {
      assert.ok(k in P.colors, `${s.id}: „${k}" gibt es in palette.js nicht`);
      assert.match(v, /^#[0-9a-f]{6}$/, `${s.id}.${k}`);
    }
    for (const k of Object.keys(s.css || {})) assert.match(k, /^--[a-z-]+$/, `${s.id}: ${k}`);
  }
});

test('der Standard ist die Palette selbst — unverändert', () => {
  assert.equal(S.default, S.list[0].id);
  assert.deepEqual(S.list[0].colors, {});
  assert.deepEqual(S.colors(S.default), P.colors);
  /* Und er lässt die Diagrammfarben aus theme.js in Ruhe. */
  assert.equal(S.chartFor(S.default), null);
});

test('ein unbekannter Name fällt auf den Standard zurück', () => {
  assert.deepEqual(S.colors('gibtsnicht'), P.colors);
});

test('Kontrast: jedes Schema erfüllt dieselben Regeln wie die Palette', () => {
  const onSurface = ['dark', 'dark2', 'dark3', 'primary2', 'primaryDeep', 'textBody', 'muted',
    'warn', 'warnText', 'ok', 'bad', 'catSlate'];
  const onDark = ['ondark', 'ondark2', 'primaryLight', 'surface', 'gold', 'warnSoft'];
  for (const s of S.list) {
    const c = S.colors(s.id);
    const v = (a, b) => contrast(c[a], c[b]);
    for (const k of onSurface) assert.ok(v(k, 'surface') >= 4.5, `${s.id}: ${k} auf surface = ${v(k, 'surface').toFixed(2)}`);
    assert.ok(v('primary', 'surface') >= 4.0, `${s.id}: primary auf surface = ${v('primary', 'surface').toFixed(2)}`);
    assert.ok(v('noteText', 'noteBg') >= 4.5, `${s.id}: noteText auf noteBg`);
    for (const k of onDark) assert.ok(v(k, 'dark') >= 4.5, `${s.id}: ${k} auf dark = ${v(k, 'dark').toFixed(2)}`);
    assert.ok(v('surface', 'primary') >= 4.0, `${s.id}: weiß auf primary (Knöpfe)`);
    /* Karten müssen sich vom Grund abheben und Rahmen sichtbar bleiben —
       sonst zerfließt die Seite, auch wenn jeder Text lesbar ist. */
    assert.ok(v('surface', 'bg') >= 1.05, `${s.id}: Karte gegen Grund = ${v('surface', 'bg').toFixed(3)}`);
    assert.ok(v('border', 'surface') >= 1.35, `${s.id}: Rahmen auf Karte = ${v('border', 'surface').toFixed(2)}`);
  }
});

test('Diagrammfarben folgen dem Schema, nicht dem Standard', () => {
  for (const s of S.list.filter(x => x.id !== S.default)) {
    const c = S.colors(s.id), chart = S.chartFor(s.id);
    assert.equal(chart.series2, c.primary, s.id);
    assert.equal(chart.text, c.text, s.id);
    assert.equal(chart.axis, c.border, s.id);
    assert.match(chart.band, /^rgba\(\d+,\d+,\d+,0?\.3\)$/, s.id + ': band');
  }
  /* theme.js ruft den Rückruf auf — sonst behielten die Diagramme ihre
     Teal-Serien, während die Seite umschaltet. */
  assert.match(read('shared/theme.js'), /__SCHEMES__\.applyChart\(window\.__THEME__\)/);
});

test('applyChart schreibt in das übergebene Objekt und lässt den Rest stehen', () => {
  const theme = { chart: { series2: '#008c82', limit: '#8c5a00' }, limits: { vmax: '#8c5a00' } };
  S.applyChart(theme, 'kupfer');
  assert.equal(theme.chart.series2, S.colors('kupfer').primary);
  assert.equal(theme.chart.limit, '#8c5a00', 'semantische Grenzfarben bleiben');
  assert.deepEqual(theme.limits, { vmax: '#8c5a00' });
});

test('jede Seite lädt schemes.js — nach palette.js und vor nav.js', () => {
  const pages = execFileSync('git', ['ls-files', 'web/*.html', 'web/**/*.html'],
    { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  let geprüft = 0;
  for (const page of pages) {
    const html = readFileSync(path.join(root, page), 'utf8');
    const at = src => html.indexOf('/shared/' + src + '.js');
    if (at('palette') < 0) { assert.ok(at('nav') < 0, page + ': nav.js ohne palette.js'); continue; }
    assert.ok(at('schemes') > at('palette'), page + ': schemes.js fehlt oder steht vor palette.js');
    if (at('nav') >= 0) assert.ok(at('schemes') < at('nav'), page + ': schemes.js steht hinter nav.js');
    geprüft++;
  }
  assert.ok(geprüft >= 30, 'es sollten alle Seiten der Website geprüft werden, gezählt: ' + geprüft);
});

test('die Konto-Seite baut den Umschalter aus schemes.js, nicht aus eigenen Werten', () => {
  const konto = read('konto/index.html');
  assert.match(konto, /id="sch-grid"/);
  assert.match(konto, /window\.__SCHEMES__/);
  assert.match(konto, /S\.set\(s\.id\)/, 'die Kachel schaltet wirklich um');
  /* Keine zweite Farbliste in der Seite: der Test „keine losen Hex-Literale"
     in palette.test.mjs deckt das ab, hier die Gegenprobe auf die Namen. */
  for (const s of S.list) assert.ok(!konto.includes("'" + s.colors.primary + "'"), s.id);
});

test('nav.js und projectbar.js bauen ihr Stylesheet neu, wenn das Schema wechselt', () => {
  for (const f of ['shared/nav.js', 'shared/projectbar.js']) {
    const src = read(f);
    assert.match(src, /addEventListener\('dielogic:scheme'/, f);
  }
  /* Und sie tragen ihre Farben nicht mehr ins Markup: was einmal im
     HTML steht, färbt sich beim Wechsel nicht mit. */
  const nav = read('shared/nav.js');
  assert.doesNotMatch(nav, /style="color:\$\{C\./, 'nav.js: Farbe im Markup statt im Stylesheet');
  assert.doesNotMatch(nav, /fill="\$\{C\./, 'nav.js: fill-Attribut statt Klasse');
});

test('die Fläche des 3D-Viewports folgt dem Schema, der Standard behält seine', () => {
  for (const s of S.list) {
    if (s.id === S.default) { assert.equal(s.viewport, undefined, 'Standard ohne eigene Fläche'); continue; }
    /* Eigene Fläche nur, wo der Grund der Seite sich ändert — „Rot-Grün-sicher"
       behält die Marke und damit auch die Fläche des Standards. */
    if (s.viewport !== undefined) assert.match(s.viewport, /^#[0-9a-f]{6}$/, s.id + ': viewport');
    else assert.equal(s.colors.bg, undefined, s.id + ': eigener Grund, aber keine eigene Fläche');
  }
  assert.ok(S.list.filter(s => s.viewport).length >= 8, 'die Farbwelten bringen ihre eigene Fläche mit');
  /* Und die Szene fragt wirklich nach — sonst bliebe das kühle Grau stehen. */
  const scene = readFileSync(path.join(site, 'tools/3d-studio/js/scene.js'), 'utf8');
  assert.match(scene, /__SCHEMES__\.viewport\(\)/);
  assert.match(scene, /0xe8eef0/, 'der Wert des Standards bleibt der Rückfall');
});

test('die Schemata unterscheiden sich sichtbar voneinander', () => {
  /* Zwei Schemata, die fast dieselbe Marke tragen, sind keine Wahl, sondern
     eine Falle: in der Kachelvorschau sähen sie gleich aus. Gemessen wird der
     Abstand im OK-Lab-nahen Raum über die drei Kanäle von primary und dark. */
  const abstand = (a, b) => {
    const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const [x, y] = [rgb(a), rgb(b)];
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
  };
  /* Gemessen an dem, was die Kachel zeigt UND was die Seite bedeutet: zwei
     Schemata dürfen dieselbe Marke tragen, wenn ihre Prüffarben verschieden
     sind (so unterscheidet sich „Rot-Grün-sicher" vom Standard). */
  const signatur = ['primary', 'dark', 'bg', 'ok', 'bad', 'accent'];
  for (let i = 0; i < S.list.length; i++) {
    for (let j = i + 1; j < S.list.length; j++) {
      const a = S.colors(S.list[i].id), b = S.colors(S.list[j].id);
      const d = signatur.reduce((sum, k) => sum + abstand(a[k], b[k]), 0);
      assert.ok(d >= 60, `${S.list[i].id} und ${S.list[j].id} liegen zu dicht beieinander (${d.toFixed(0)})`);
    }
  }
});

test('der Umschalter stellt die Gruppen hin, die es wirklich gibt', () => {
  const konto = read('konto/index.html');
  assert.match(konto, /S\.groups\.forEach/, 'die Gruppen kommen aus schemes.js');
  assert.match(konto, /ziele\[s\.group\]/, 'jede Kachel landet in ihrer Gruppe');
  for (const g of S.groups) assert.ok(S.list.some(s => s.group === g.id), g.id + ': Gruppe ohne Schema');
});
