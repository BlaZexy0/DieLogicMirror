/* Farbschemata (web/shared/schemes.js): ein Schema belegt die ROLLEN der
   Palette mit eigenen Werten (Flächen, Schrift, Ampel, Hervorhebung,
   Sachfarben). Es darf keine Rolle erfinden, die es in palette.js nicht
   gibt, und jedes Schema muss dieselben Regeln einhalten: lesbare Ampel,
   keine Sachfarbe, die wie ein Urteil aussieht, unterscheidbare
   Sachfarben. Die Farbleisten (Heatmaps, Felder) erreicht kein Schema: sie
   sind in jedem gleich. Dazu die Einbindung: jede Seite, die palette.js
   lädt, lädt schemes.js direkt danach und vor nav.js.

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
require(path.join(site, 'shared/theme.js'));
const T = globalThis.__THEME__;
const read = f => readFileSync(path.join(site, f), 'utf8');

/* Kontrast (WCAG) und ΔE_ok (Abstand im OK-Lab-Raum, ×100): aus
   shared/palette.js — dort für den Standard, hier für jedes Schema gegen
   SEINE eigenen Flächen. */
const contrast = P.contrast, oklab = P.oklab, dE = P.deltaE;
/* Abstand einer Farbe zum Ampelverlauf gut → knapp → schlecht (in OK-Lab
   gemischt, wie P.mix mischt). */
function zurAmpel(x, c) {
  let best = Infinity;
  for (const [a, b] of [[c.ok, c.caution], [c.caution, c.bad]]) {
    for (let k = 0; k <= 20; k++) best = Math.min(best, dE(x, P.mix(a, b, k / 20)));
  }
  return best;
}
/* Die Farben eines Schemas, ohne es anzuwenden. */
const farben = id => S.colors(id);

test('drei Schemata, jedes kennt nur Rollen der Palette und schreibt sie als Hex', () => {
  /* Seit 23.09. nur noch Teal (der Standard), Stahlblau und Graphit. */
  assert.deepEqual(S.list.map(s => s.id), ['teal', 'stahl', 'graphit']);
  for (const s of S.list) {
    assert.ok(s.name && s.note, s.id + ': Name und Beschreibung');
    for (const [k, v] of Object.entries(s.colors)) {
      assert.ok(k in P.colors, `${s.id}: „${k}" gibt es in palette.js nicht`);
      assert.match(v, /^#[0-9a-f]{6}$/, `${s.id}.${k}`);
    }
    for (const k of Object.keys(s.css || {})) assert.match(k, /^--[a-z-]+$/, `${s.id}: ${k}`);
    assert.equal(s.chart, undefined, s.id + ': Diagrammfarben leitet theme.js ab, kein eigener Block');
  }
});

test('der Standard ist die Palette selbst, unverändert', () => {
  assert.equal(S.default, S.list[0].id);
  assert.deepEqual(S.list[0].colors, {});
  assert.deepEqual(farben(S.default), P.colors);
});

test('ein unbekannter Name fällt auf den Standard zurück, ein entfallener auf das nächste Schema', () => {
  assert.deepEqual(farben('gibtsnicht'), P.colors);
  /* Wer ein entfallenes Schema gewählt hatte, bekommt das nächste der drei,
     nicht stillschweigend irgendeins: Blaupause, Aluminium, Messing gingen
     am 22.09. auf, die übrigen sechs fielen am 23.09. weg. */
  assert.deepEqual(S.alias, {
    kontrast: 'teal', sicht: 'teal', oliv: 'teal',
    anlass: 'stahl', blaupause: 'stahl',
    abend: 'graphit', kupfer: 'graphit', messing: 'graphit', aluminium: 'graphit'
  });
  for (const [alt, neu] of Object.entries(S.alias)) {
    assert.ok(S.list.some(x => x.id === neu), alt + ' → ' + neu + ': Ziel fehlt');
    assert.ok(!S.list.some(x => x.id === alt), alt + ' steht noch in der Liste');
    assert.deepEqual(farben(alt), farben(neu), alt);
  }
});

test('Kontrast: Schrift, Ampeltexte und Hervorhebung sind in jedem Schema lesbar', () => {
  const onSurface = ['dark', 'dark2', 'dark3', 'primary2', 'primaryDeep', 'text', 'textBody', 'muted',
    'okText', 'cautionText', 'badText', 'mark'];
  const onDark = ['ondark', 'ondark2', 'primaryLight', 'surface', 'caution'];
  for (const s of S.list) {
    const c = farben(s.id);
    const v = (a, b) => contrast(c[a], c[b]);
    for (const k of onSurface) assert.ok(v(k, 'surface') >= 4.5, `${s.id}: ${k} auf surface = ${v(k, 'surface').toFixed(2)}`);
    for (const l of ['ok', 'caution', 'bad']) {
      assert.ok(v(l + 'Text', l + 'Bg') >= 4.5, `${s.id}: ${l}Text auf ${l}Bg = ${v(l + 'Text', l + 'Bg').toFixed(2)}`);
    }
    assert.ok(v('primary', 'surface') >= 4.0, `${s.id}: primary auf surface = ${v('primary', 'surface').toFixed(2)}`);
    for (const k of onDark) assert.ok(v(k, 'dark') >= 4.5, `${s.id}: ${k} auf dark = ${v(k, 'dark').toFixed(2)}`);
    assert.ok(v('surface', 'primary') >= 4.0, `${s.id}: weiß auf primary (Knöpfe)`);
    /* Karten müssen sich vom Grund abheben und Rahmen sichtbar bleiben —
       sonst zerfließt die Seite, auch wenn jeder Text lesbar ist. */
    assert.ok(v('surface', 'bg') >= 1.05, `${s.id}: Karte gegen Grund = ${v('surface', 'bg').toFixed(3)}`);
    assert.ok(v('border', 'surface') >= 1.35, `${s.id}: Rahmen auf Karte = ${v('border', 'surface').toFixed(2)}`);
  }
});

test('Ampel: gut, knapp und schlecht liegen in jedem Schema klar auseinander', () => {
  for (const s of S.list) {
    const c = farben(s.id);
    assert.ok(dE(c.ok, c.bad) >= 20, `${s.id}: gut/schlecht ΔE ${dE(c.ok, c.bad).toFixed(1)}`);
    assert.ok(dE(c.ok, c.caution) >= 15, `${s.id}: gut/knapp ΔE ${dE(c.ok, c.caution).toFixed(1)}`);
    assert.ok(dE(c.caution, c.bad) >= 15, `${s.id}: knapp/schlecht ΔE ${dE(c.caution, c.bad).toFixed(1)}`);
  }
});

const DATEN = ['mark', 'melt', 'die', 'machine', 'air', 'cool', 'process'];

test('keine Sachfarbe und nicht die Hervorhebung sieht aus wie ein Urteil', () => {
  /* Der Abstand zum ganzen Verlauf gut → knapp → schlecht, nicht nur zu den
     drei Stufen: ein Orange liegt zwischen „knapp" und „schlecht" und würde
     als „fast schlecht" gelesen. Die eine Ausnahme ist die Schmelze mit
     ihrer Familie: sie ist Orange, heißes Metall (Wunsch vom 24.09.), und
     liegt damit auf dem Verlauf. Dafür hält sie zu den beiden Stufen selbst
     Abstand, ΔE ≥ 14; der Anguss (Kupferbraun) und der Überlauf (Apricot)
     ≥ 11. */
  for (const s of S.list) {
    const c = farben(s.id);
    for (const k of DATEN.filter(k => k !== 'melt')) {
      const d = zurAmpel(c[k], c);
      assert.ok(d >= 13, `${s.id}: ${k} liegt nur ΔE ${d.toFixed(1)} vom Ampelverlauf`);
    }
    for (const [k, min] of [['melt', 14], ['runner', 11], ['overflow', 11]]) {
      for (const stufe of ['caution', 'bad']) {
        const d = dE(c[k], c[stufe]);
        assert.ok(d >= min, `${s.id}: ${k} liegt nur ΔE ${d.toFixed(1)} von ${stufe}`);
      }
    }
    /* Die abgeleitete Sachfarbe Vakuum auch nicht. */
    for (const k of ['vacuum']) {
      const d = zurAmpel(c[k], c);
      assert.ok(d >= 8, `${s.id}: ${k} liegt nur ΔE ${d.toFixed(1)} vom Ampelverlauf`);
    }
    /* Die Marke auch nicht: ein Knopf in „erfüllt"-Grün sagte etwas, das er
       nicht meint. */
    assert.ok(dE(c.primary, c.ok) >= 9, `${s.id}: Marke ≈ „erfüllt" (ΔE ${dE(c.primary, c.ok).toFixed(1)})`);
    assert.ok(dE(c.primary, c.bad) >= 8, `${s.id}: Marke ≈ „verletzt" (ΔE ${dE(c.primary, c.bad).toFixed(1)})`);
  }
});

test('die Sachfarben sind untereinander unterscheidbar', () => {
  for (const s of S.list) {
    const c = farben(s.id);
    for (let i = 0; i < DATEN.length; i++) {
      for (let j = i + 1; j < DATEN.length; j++) {
        const d = dE(c[DATEN[i]], c[DATEN[j]]);
        assert.ok(d >= 12, `${s.id}: ${DATEN[i]}/${DATEN[j]} ΔE ${d.toFixed(1)}`);
      }
      if (DATEN[i] !== 'mark') {
        assert.ok(contrast(c[DATEN[i]], c.surface) >= 2.6, `${s.id}: ${DATEN[i]} als Linie zu blass`);
      }
    }
    /* Was aus der Schmelze wird, ist eine Familie: unterscheidbar über die
       Helligkeit, im selben Ton. */
    const fam = ['melt', 'runner', 'overflow', 'biscuit'];
    for (let i = 0; i < fam.length; i++) {
      for (let j = i + 1; j < fam.length; j++) {
        assert.ok(dE(c[fam[i]], c[fam[j]]) >= 7, `${s.id}: ${fam[i]}/${fam[j]} ΔE ${dE(c[fam[i]], c[fam[j]]).toFixed(1)}`);
      }
    }
    /* Vakuum steht neben Luft (Schusskurve) und darf nicht wie „gut"
       aussehen. */
    assert.ok(dE(c.vacuum, c.air) >= 12, `${s.id}: vacuum/air ΔE ${dE(c.vacuum, c.air).toFixed(1)}`);
    assert.ok(dE(c.vacuum, c.ok) >= 12, `${s.id}: vacuum ≈ „gut" (ΔE ${dE(c.vacuum, c.ok).toFixed(1)})`);
    /* Die Achsen sind die Sachfarben von Maschine, Luft und Werkzeug. */
    assert.deepEqual([c.axisX, c.axisY, c.axisZ], [c.machine, c.air, c.die], s.id + ': Achsen');
  }
});

/* Diagramme: was im selben Diagramm als Linie steht, muss man
   auseinanderhalten (Rückmeldung vom 23.09.: im PQ² lagen Maschine und
   Werkzeug so nah, dass unklar war, was wofür gilt; „ohne" und „mit Vakuum"
   in der Luftblase ebenso). Die Paare stammen aus den Diagrammen selbst:
   PQ² Maschine, Werkzeug, Luft, Prozess; Schusskurve und Luftblase Kolben
   (Schrift), Luft, Vakuum, Prozess; Auslegungsfenster Maschine, Pressrest,
   Prozess. Der Arbeitspunkt (mark) steht in allen. */
test('Diagramme: Linien, die zusammen stehen, sind klar verschieden', () => {
  const PAARE = { 'machine/die': 21, 'air/vacuum': 22, 'machine/air': 18, 'die/air': 18, 'machine/process': 18,
    'die/process': 18, 'air/process': 18, 'vacuum/process': 15, 'machine/biscuit': 16, 'biscuit/process': 16,
    'vacuum/text': 16, 'air/text': 16, 'die/text': 16, 'process/text': 16 };
  for (const s of S.list) {
    const c = farben(s.id);
    for (const [paar, min] of Object.entries(PAARE)) {
      const [a, b] = paar.split('/'), d = dE(c[a], c[b]);
      assert.ok(d >= min, `${s.id}: ${paar} nur ΔE ${d.toFixed(1)}, im Diagramm verlangt ${min}`);
    }
    for (const k of ['machine', 'die', 'air', 'process', 'vacuum']) {
      assert.ok(dE(c.mark, c[k]) >= 15, `${s.id}: Arbeitspunkt/${k} nur ΔE ${dE(c.mark, c[k]).toFixed(1)}`);
    }
  }
});

/* Teal ist die Farbe des Standards. In Stahlblau und Graphit wirkte die
   Schmelze in Teal wie ein vergessener Rest (Rückmeldung vom 23.09.); keine
   Rolle darf dort ins Teal rutschen. Gemessen am Farbton in OK-LCh; fast
   graue Farben haben keinen. Die Schmelze selbst ist seit 24.09. überall
   Orange. */
test('Teal gehört dem Standard, die Schmelze ist überall Orange', () => {
  const lch = h => { const [l, a, b] = oklab(h); return [l, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360]; };
  for (const s of S.list.filter(x => x.id !== S.default)) {
    for (const [k, v] of Object.entries(farben(s.id))) {
      const [, ch, h] = lch(v);
      assert.ok(ch < 0.03 || h <= 160 || h >= 212, `${s.id}: ${k} ${v} liegt im Teal (h ${h.toFixed(0)}°)`);
    }
  }
  /* Die Schmelze ist in jedem Schema Orange (Wunsch vom 24.09.: Teal und
     Stahlblau fühlten sich für Metall falsch an), der Anguss ein
     Kupferbraun, der Überlauf ein Apricot: dieselbe Familie überall. */
  for (const s of S.list) {
    const c = farben(s.id), [, ch, h] = lch(c.melt);
    assert.ok(ch > 0.12 && h > 35 && h < 60, `${s.id}: Schmelze ${c.melt} (h ${h.toFixed(0)}°) ist kein Orange`);
    for (const k of ['runner', 'overflow']) {
      const hk = lch(c[k])[2];
      assert.ok(hk > 35 && hk < 70, `${s.id}: ${k} ${c[k]} (h ${hk.toFixed(0)}°) gehört nicht zur Familie der Schmelze`);
    }
  }
});

/* Die Farbleisten sind ein Maßstab: in jedem Schema dieselben (Wunsch vom
   23.09.: keine eigene Gestaltung je Schema, die Leisten von vorher). Kein
   Schema hat einen Schlüssel dafür, und ein Wechsel ändert keine Farbe
   auf einer Leiste. */
test('die Farbleisten sind in jedem Schema dieselben', () => {
  const T01 = [0, 0.1, 0.25, 1 / 3, 0.5, 0.66, 0.8, 1];
  const probe = () => Object.keys(P.leisten).map(n => T01.map(t => P.scale(n, t)).join()).join('|');
  /* seit 13.10. dazu rainbow und bgo, seit 14.10. je Kriterium eine Leiste
     für die Simulationsbilder — auch sie fest */
  assert.deepEqual(Object.keys(P.leisten).sort(), ['bgo', 'blues', 'coolwarm', 'draft', 'festanteil', 'heat', 'inferno', 'plasma', 'porositaet', 'rainbow', 'viridis']);
  for (const s of S.list) {
    for (const k of Object.keys(s.colors)) assert.doesNotMatch(k, /^seq|heat|turbo|leiste/i, s.id + ': ' + k);
  }
  const vorher = probe();
  try {
    for (const s of S.list) { S.set(s.id); assert.equal(probe(), vorher, s.id); }
  } finally { S.set(S.default); }
});

test('Diagramme: theme.js leitet jede Farbe aus der Palette ab und folgt dem Wechsel an Ort und Stelle', () => {
  const chart = T.chart, stops = T.heatStops;
  const heat = JSON.stringify(P.leisten.heat.map(([, h]) => P.hexRgb(h).map(v => Math.round(v * 255))));
  try {
    for (const s of S.list) {
      S.set(s.id);
      const c = farben(s.id);
      assert.equal(chart.die, c.die, s.id);
      assert.equal(chart.machine, c.machine, s.id);
      assert.equal(chart.mark, c.mark, s.id);
      assert.equal(chart.ink, c.text, s.id);
      assert.equal(chart.feasible, P.rgba(c.ok, 0.26), s.id);
      assert.equal(T.limits.hydr, c.machine, s.id + ': Maschinengrenze');
      assert.equal(T.limits.gateMax, c.die, s.id + ': Anschnittgrenze');
      assert.equal(T.limits.tmax, c.process, s.id + ': Prozessgrenze');
      assert.equal(T.limits.vent, c.air, s.id + ': Luftgrenze');
      assert.equal(T.chart, chart, 'dasselbe Objekt, nicht ersetzt');
      assert.equal(T.heatStops, stops, 'dasselbe Feld, nicht ersetzt');
      assert.equal(JSON.stringify(stops), heat, s.id + ': die Heatmaps behalten ihre feste Leiste');
    }
  } finally { S.set(S.default); }
  /* Kein fester Farbwert in theme.js: alles kommt aus der Palette. */
  assert.doesNotMatch(read('shared/theme.js').replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,6}\b|rgba?\(\s*\d/i);
});

test('jede Seite lädt schemes.js nach palette.js und vor nav.js', () => {
  const pages = execFileSync('git', ['ls-files', 'web/*.html', 'web/**/*.html'],
    { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  let geprüft = 0;
  for (const page of pages) {
    const html = readFileSync(path.join(root, page), 'utf8');
    const at = src => html.indexOf('/shared/' + src + '.js');
    if (at('palette') < 0) { assert.ok(at('nav') < 0, page + ': nav.js ohne palette.js'); continue; }
    assert.ok(at('schemes') > at('palette'), page + ': schemes.js fehlt oder steht vor palette.js');
    if (at('nav') >= 0) assert.ok(at('schemes') < at('nav'), page + ': schemes.js steht hinter nav.js');
    if (at('theme') >= 0) assert.ok(at('theme') > at('schemes'), page + ': theme.js steht vor schemes.js');
    geprüft++;
  }
  assert.ok(geprüft >= 30, 'es sollten alle Seiten der Website geprüft werden, gezählt: ' + geprüft);
});

test('die Konto-Seite baut den Umschalter aus schemes.js, nicht aus eigenen Werten', () => {
  const konto = read('konto/index.html');
  assert.match(konto, /id="sch-grid"/);
  assert.match(konto, /window\.__SCHEMES__/);
  assert.match(konto, /S\.list\.forEach/, 'eine Kachel je Schema aus schemes.js');
  assert.match(konto, /S\.set\(s\.id\)/, 'die Kachel schaltet wirklich um');
  for (const s of S.list) assert.ok(!konto.includes("'" + farben(s.id).primary + "'"), s.id);
  /* Die Vorschau zeigt, was sich mit dem Schema ändert: keine Farbleiste. */
  assert.doesNotMatch(konto, /seq[1-5]|S\.groups/);
});

test('nav.js und projectbar.js färben sich über CSS-Variablen mit, ohne beim Schemawechsel etwas neu zu bauen', () => {
  const nav = read('shared/nav.js');
  const pb = read('shared/projectbar.js');
  /* Ihre Regeln liegen in shared.css und benutzen var(--rolle): ein
     Schemawechsel (schemes.js schreibt die Tokens am Wurzelelement um)
     erreicht Leiste und Fußzeile darüber von selbst — nav.js und
     projectbar.js brauchen dafür weder ein eigenes Stylesheet noch einen
     Listener auf „dielogic:scheme". */
  for (const [label, src] of [['nav.js', nav], ['projectbar.js', pb]]) {
    assert.doesNotMatch(src, /dielogic:scheme/, label + ': kein Listener mehr nötig');
    assert.doesNotMatch(src, /__PALETTE__/, label + ': keine Farblogik mehr in JS');
  }
  const css = read('shared/shared.css');
  assert.match(css, /\.dl-nav\s*\{[^}]*var\(--dark\)/, 'shared.css: .dl-nav benutzt var(--dark)');
  assert.match(css, /\.dl-pb\s*\{[^}]*var\(--surface\)/, 'shared.css: .dl-pb benutzt var(--surface)');
  /* Und sie tragen ihre Farben nicht ins Markup: was einmal im HTML steht,
     färbt sich beim Wechsel nicht mit. */
  assert.doesNotMatch(nav, /style="color:\$\{/, 'nav.js: Farbe im Markup statt im Stylesheet');
  assert.doesNotMatch(nav, /fill="\$\{/, 'nav.js: fill-Attribut statt Klasse');
});

test('die Fläche des 3D-Viewports ist eine Rolle, jedes Schema bringt seine eigene mit', () => {
  assert.ok('viewport' in P.colors, 'Rolle viewport');
  for (const s of S.list) {
    const c = farben(s.id);
    assert.equal(S.colors(s.id).viewport, c.viewport, s.id);
    /* Eigener Grund, eigene Fläche: sonst stünde das kühle Grau des
       Standards im warmen Papier. */
    if (s.colors.bg) assert.ok(s.colors.viewport, s.id + ': eigener Grund, aber keine eigene Fläche');
  }
});

test('die Schemata unterscheiden sich sichtbar voneinander', () => {
  /* Zwei Schemata mit fast derselben Marke sind keine Wahl, sondern eine
     Falle: in der Kachel sähen sie gleich aus (Stahlblau und Blaupause
     lagen ΔE 6 auseinander). */
  const welt = S.list;
  for (let i = 0; i < welt.length; i++) {
    for (let j = i + 1; j < welt.length; j++) {
      const d = dE(farben(welt[i].id).primary, farben(welt[j].id).primary);
      assert.ok(d >= 12, `${welt[i].id} und ${welt[j].id}: Marke nur ΔE ${d.toFixed(1)} auseinander`);
    }
  }
});
