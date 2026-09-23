/* Anzeige-Defekte, die etwas verschweigen (MEDIUM/LOW).

     node --test tests/web/darstellung.test.mjs */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { site, ladeSkripte, themeLaden, auslegung, zeichnenderKontext as rec } from './stubs/dashboard.mjs';

const read = f => readFileSync(path.join(site, f), 'utf8');

ladeSkripte(['shared/palette.js', 'shared/theme.js']);
await themeLaden();

/* ── Betriebspunkt-Marker ─────────────────────────────────────────────── */

/* Mit einem aufzeichnenden Kontext — geprüft wird, WAS gezeichnet wird. */
test('ein Betriebspunkt außerhalb des Rahmens verschwindet nicht stumm', async () => {
  const { marker } = await auslegung('render/base.js');
  const f = { L: 75, R: 50, T: 92, B: 58, pw: 700, ph: 400 };

  const drin = rec();
  marker(drin, f, 300, 300, 'Ist 4,2 m/s');
  assert.ok(drin.log.texts.some(t => /Ist 4,2/.test(t.s)), 'im Rahmen unverändert');

  for (const [px, py, wo] of [[-200, 300, 'links'], [2000, 300, 'rechts'],
    [300, -50, 'oben'], [300, 900, 'unten']]) {
    const x = rec();
    marker(x, f, px, py, 'Ist 4,2 m/s');
    assert.ok(x.log.calls > 0, wo + ': es wurde gar nichts gezeichnet');
    assert.ok(x.log.texts.some(t => /außerhalb/.test(t.s)),
      wo + ': der Punkt verschwand kommentarlos — das Diagramm sah aus, als gäbe es keinen');
  }
});

/* ── Ringdiagramm ─────────────────────────────────────────────────────── */

test('Ringdiagramm: Zeichnung und Hover benutzen dieselbe Bezugsgröße', async () => {
  const { donutTotal } = await auslegung('render/donut.js');
  assert.equal(donutTotal({ total: 18.2 }), 18.2);
  for (const bad of [0, -1, NaN, Infinity, undefined]) {
    assert.equal(donutTotal({ total: bad }), 0, 'unbrauchbar → 0: ' + bad);
  }

  const hover = read('tools/auslegung/js/render/hover.js');
  assert.match(hover, /donutTotal/, 'der Hover rechnete mit dem rohen d.total');
  assert.ok(!/kg \/ d\.total/.test(hover), '`kg / d.total` ergab bei 0 „Infinity %"');
});

/* ── PQ²-Theorieseite ─────────────────────────────────────────────────── */

test('pq2.html: bei einem Rechenfehler bleibt die Erklärgrafik stehen', () => {
  const html = read('theorie/pq2.html');
  /* Vorher: `if (d.err) return;` — und danach wurde das SVG trotzdem
     versteckt und ein leeres Canvas gezeigt. */
  assert.ok(!/if \(d\.err\) return;/.test(html), 'der stumme Ausstieg steht noch im Code');
  assert.match(html, /if \(render\(\)\) \{/, 'umgeschaltet wird erst, wenn das Bild steht');
  const block = html.slice(html.indexOf('if (d.err)'), html.indexOf('if (d.err)') + 700);
  assert.match(block, /drawAny/, 'die Fehlermeldung gehört gezeichnet');
});

test('pq2.html: die Druckkette zeigt die vier Stationen, ohne Druckverlauf im Bild', () => {
  /* Seit 22.09. auf Wunsch: nur das Schema, kein Verlauf von Druck und
     Geschwindigkeit darunter (die Formeln stehen in der Bildunterschrift).
     Der Druckspeicher sitzt über dem Antriebszylinder, die Füllkammer endet
     bündig an der Trennebene, der Anguss steigt ins Gussteil. */
  const svg = read('assets/theorie/pq2-druckkette.svg');
  for (const s of ['Druckspeicher', 'Drossel', 'Antriebszylinder', 'Gießkolben', 'Füllkammer', 'Anschnitt', 'Anguss', 'Gussteil', 'Trennebene']) {
    assert.ok(svg.includes(s), 'Station ' + s);
  }
  assert.ok(!/Entlang des Wegs|statischer Druck|Geschwindigkeit v/i.test(svg), 'kein Druckverlauf mehr im Bild');
  const html = read('theorie/pq2.html');
  assert.match(html, /Das Bild zeigt den Weg des Öls\s+und der Schmelze/, 'die Einleitung beschreibt das Bild, wie es ist');
  assert.ok(!/Verlauf unten|unteren Streifen/.test(html), 'die Bildunterschrift spricht von keinem Verlauf mehr');
});

/* ── Theorie-Seiten: die Bilder folgen dem Farbschema ────────────────── */

const THEORIE = readdirSync(path.join(site, 'theorie')).filter(f => f.endsWith('.html')).sort();

test('Theorie: jede Seite setzt ihre Bilder über svgfarben.js ein, nach nav.js', () => {
  /* Als <img> sieht ein SVG die CSS-Tokens der Seite nicht und bliebe in
     jedem Schema in den Standardfarben. */
  for (const f of THEORIE) {
    const html = read('theorie/' + f);
    const nav = html.indexOf('/shared/nav.js'), sf = html.indexOf('/shared/svgfarben.js');
    assert.ok(sf > 0, f + ': svgfarben.js fehlt');
    assert.ok(nav > 0 && sf > nav, f + ': svgfarben.js steht vor nav.js');
  }
});

test('Theorie: CSS für Bilder gilt auch für die eingesetzten SVGs', () => {
  /* svgfarben.js ersetzt das <img> durch <svg class="svg-bild">; eine Regel
     nur für img (Breite, Mindestbreite auf dem Handy, schmale Abbildung)
     griffe danach ins Leere. */
  for (const f of THEORIE) {
    const css = (read('theorie/' + f).match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1]
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const [, sel] of css.matchAll(/([^{}]+)\{/g)) {
      if (!/\bimg\b/.test(sel) || /@media/.test(sel)) continue;
      assert.match(sel, /\.svg-bild|\bsvg\b/, f + ': „' + sel.trim() + '" trifft nur <img>');
    }
    for (const [, sel] of css.matchAll(/@media[^{]*\{\s*([^{}]+)\{/g)) {
      if (/\bimg\b/.test(sel)) assert.match(sel, /\.svg-bild|\bsvg\b/, f + ': „' + sel.trim() + '" trifft nur <img>');
    }
  }
});

test('Theorie: die live gezeichneten Bilder zeichnen beim Schemawechsel neu', () => {
  const pq2 = read('theorie/pq2.html');
  assert.match(pq2, /<img id="grundImg" data-live /, 'das Grundbild zeichnet die Seite selbst (svgfarben.js lässt es aus)');
  assert.match(pq2, /addEventListener\('dielogic:scheme'[^\n]*render\(\)/, 'PQ²-Grundbild: kein Neuzeichnen beim Wechsel');

  const ks = read('theorie/kreissegmente.html');
  assert.match(ks, /addEventListener\('dielogic:scheme', draw\)/, 'Iso-D/Iso-L: kein Neuzeichnen beim Wechsel');
  /* Farben werden beim Zeichnen gelesen, nicht einmal beim Laden festgehalten */
  assert.doesNotMatch(ks, /const C_\w+\s*=\s*window\.__PALETTE__/, 'Farbwerte in Konstanten: ein Wechsel malte mit den alten');
  assert.match(ks, /function draw\(\) \{\s*const P = window\.__PALETTE__;/);
});

test('Theorie: Bildunterschriften nennen Rollen, keine Farben', () => {
  /* Die Farben wechseln mit dem Schema: „die blaue Linie" ist in Graphit
     ein anderes Blau, in einem künftigen Schema vielleicht keins mehr. Die
     Bildunterschrift nennt darum die Rolle (Werkzeug, Maschine, zulässig). */
  const FARBE = /\b(rot|rote[nmrs]?|grün|grüne[nmrs]?|gelb\w*|blau\w*|grau|graue[nmrs]?|gold\w*|türkis\w*|pink\w*|karmin\w*|schwarz\w*|weiß\w*|magenta|orange\w*|violett\w*|lila|petrol)\b/i;
  for (const f of THEORIE) {
    const html = read('theorie/' + f).replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    const alt = [...html.matchAll(/\b(?:alt|aria-label)="([^"]*)"/g)].map(m => m[1]);
    const text = html.replace(/<[^>]+>/g, ' ');
    for (const s of [text, ...alt]) {
      const m = FARBE.exec(s);
      assert.ok(!m, f + ': Farbwort „' + (m && m[0]) + '" in: …' + (m ? s.slice(Math.max(0, m.index - 50), m.index + 30).replace(/\s+/g, ' ') : '') + '…');
    }
  }
});

/* ── Icons ────────────────────────────────────────────────────────────── */

test('Icons kommen aus einem Sprite im Dokument, nicht aus externen Dateien', () => {
  const html = read('index.html');
  /* Safari löst externe Referenzen in <use> nicht auf — dort blieben alle
     elf Icons unsichtbar. */
  assert.ok(!/<use href="\/assets\/icons\//.test(html),
    'externe <use>-Referenz: in Safari unsichtbar');

  const iconDir = path.join(site, 'assets', 'icons');
  const dateien = readdirSync(iconDir).filter(f => f.endsWith('.svg')).sort();
  assert.ok(dateien.length > 0);

  /* Jedes Symbol steht im Sprite, und jede Referenz zeigt auf eines. */
  for (const f of dateien) {
    const id = 'icon-' + f.replace(/\.svg$/, '');
    assert.ok(html.includes('id="' + id + '"'), 'Symbol fehlt im Sprite: ' + id);
  }
  const refs = [...html.matchAll(/<use href="#([\w-]+)"/g)].map(m => m[1]);
  assert.ok(refs.length >= dateien.length, `${refs.length} Referenzen, ${dateien.length} Icons`);
  for (const r of refs) assert.ok(html.includes('id="' + r + '"'), 'Referenz ins Leere: #' + r);
});
