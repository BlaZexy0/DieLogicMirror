/* Formeln: jede TeX-Quelle der Site rendert mit dem lokal eingebundenen
   KaTeX (web/shared/vendor/katex) fehlerfrei —
   1. die mathHTML()-Erklärungen aller Diagramme (eq()/tex() aus
      charts/mathfmt.js, window.katex wie auf der Seite),
   2. alle $$…$$ / $…$ der statischen Seiten (Theorie, Zyklusanalyse),
      die auto-render im Browser übersetzt,
   3. kein Rest des alten HTML-Formelmarkups (.frac/.sqrt-Spans, frac()-Aufrufe)
      und keine CDN-Einbindung mehr. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'web');

globalThis.katex = require(path.join(site, 'shared/vendor/katex/katex.min.js'));
globalThis.window = globalThis;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
require(path.join(site, 'shared/palette.js'));
require(path.join(site, 'shared/theme.js'));
require(path.join(site, 'shared/examples/machines.js'));
require(path.join(site, 'shared/project.js'));
require(path.join(site, 'shared/clampmodel.js'));
const { theme } = await import(path.join(site, 'tools/auslegung/js/core/theme.js'));
Object.assign(theme, globalThis.__THEME__);
const { charts } = await import(path.join(site, 'tools/auslegung/js/charts/registry.js'));
const { eq, tex } = await import(path.join(site, 'tools/auslegung/js/charts/mathfmt.js'));

const render = (src, display) => globalThis.katex.renderToString(src, { throwOnError: true, displayMode: display, strict: 'ignore' });

test('mathfmt: eq()/tex() rendern über KaTeX, ohne KaTeX bleibt die Quelle lesbar', () => {
  assert.match(eq('\\frac{a}{b}'), /^<div class="eq"><span class="katex-display">/);
  assert.match(tex('x^2'), /^<span class="katex">/);
  assert.doesNotMatch(eq('\\frac{a}{b}'), /katex-error/);
  const k = globalThis.katex; delete globalThis.katex;
  assert.equal(eq('\\frac{a}{b}'), '<div class="eq"><code class="tex">\\frac{a}{b}</code></div>');
  assert.equal(tex('a<b'), '<code class="tex">a&lt;b</code>');
  globalThis.katex = k;
});

test('Diagramme: jede Formel der Mathe-Erklärungen rendert fehlerfrei', () => {
  let blocks = 0;
  for (const def of charts) {
    assert.equal(typeof def.mathHTML, 'function', def.id + ' ohne mathHTML()');
    const html = def.mathHTML();
    const n = (html.match(/<div class="eq">/g) || []).length;
    assert.ok(n > 0, def.id + ': keine Formel');
    assert.ok(html.includes('katex-display'), def.id + ': Formeln nicht über KaTeX gerendert');
    assert.doesNotMatch(html, /katex-error/, def.id + ': KaTeX-Fehler in der Erklärung');
    assert.doesNotMatch(html, /class="(frac|sqrt|num|den|rad)"/, def.id + ': altes HTML-Formelmarkup');
    blocks += n;
  }
  assert.ok(blocks >= 56, 'Formelblöcke: ' + blocks);
});

test('Statische Seiten: alle $…$ / $$…$$ rendern fehlerfrei, kein CDN', () => {
  const pages = ['theorie/pq2.html', 'theorie/kritische-geschwindigkeit.html', 'theorie/kreissegmente.html',
    'theorie/nebenbedingungen.html', 'tools/zyklus/index.html'];
  let total = 0;
  for (const f of pages) {
    const html = readFileSync(path.join(site, f), 'utf8');
    assert.ok(html.includes('/shared/vendor/katex/katex.min.js'), f + ': KaTeX nicht lokal eingebunden');
    assert.ok(html.includes('/shared/vendor/katex/auto-render.min.js'), f + ': auto-render fehlt');
    assert.doesNotMatch(html, /cdn\.jsdelivr|unpkg\.com|cdnjs/, f + ': CDN-Referenz');
    assert.doesNotMatch(html, /class="(frac|sqrt)"/, f + ': altes HTML-Formelmarkup');
    /* Script-Blöcke ausklammern (dort stehen $ als JS); Entities wie im DOM auflösen */
    const body = html.replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
    const display = [...body.matchAll(/\$\$([\s\S]+?)\$\$/g)].map(m => m[1]);
    const inline = [...body.replace(/\$\$[\s\S]+?\$\$/g, '').matchAll(/\$([^$\n]+?)\$/g)].map(m => m[1]);
    for (const src of display) { try { render(src, true); } catch (e) { assert.fail(f + ' $$…$$: ' + e.message + '\n  ' + src); } }
    for (const src of inline) { try { render(src, false); } catch (e) { assert.fail(f + ' $…$: ' + e.message + '\n  ' + src); } }
    total += display.length + inline.length;
  }
  assert.ok(total > 200, 'Formeln gefunden: ' + total);
});

test('Vendor-Paket: Schriften, auf die katex.min.css verweist, liegen bei', () => {
  const dir = path.join(site, 'shared/vendor/katex');
  const css = readFileSync(path.join(dir, 'katex.min.css'), 'utf8');
  const have = new Set(readdirSync(path.join(dir, 'fonts')));
  const need = new Set([...css.matchAll(/fonts\/(KaTeX_[A-Za-z-]+\.woff2)/g)].map(m => m[1]));
  for (const f of need) assert.ok(have.has(f), 'Schrift fehlt: ' + f);
  assert.doesNotMatch(css, /https?:\/\//, 'katex.min.css lädt extern nach');
});
