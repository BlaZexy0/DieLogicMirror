/* Statische Prüfung aller ES-Module: löst jeder Import auf eine Datei
   auf, und exportiert diese Datei die verlangten Namen wirklich?

   Der Grund: die Viewer laufen im Browser, ein Tippfehler in einem
   Import fällt hier sonst erst beim Klicken auf. Node kann die
   DOM-Module nicht ausführen — den Namensabgleich schafft es aber. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'vendor') walk(p, out); }
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(p);
  }
  return out;
}

/* Exportierte Namen einer Datei (regex-basiert — reicht für den Stil
   dieses Projekts: keine dynamischen Re-Exporte). */
function exportsOf(file) {
  const src = readFileSync(file, 'utf8');
  const names = new Set();
  for (const m of src.matchAll(/^\s*export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
    for (const part of m[1].split(',')) {
      const t = part.trim();
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/^\s*export\s+default/m.test(src)) names.add('default');
  return names;
}

/* Statische Imports einer Quelle: [{ spec, names, star }] */
function importsOf(src) {
  const out = [];
  const re = /import\s+([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const clause = m[1].trim(), spec = m[2];
    const names = [];
    let star = false;
    if (/^\*\s+as\s+/.test(clause)) star = true;
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(',')) {
        const t = part.trim();
        if (!t) continue;
        names.push(t.split(/\s+as\s+/)[0].trim());
      }
    }
    const def = clause.replace(/\{[^}]*\}/, '').replace(/\*\s+as\s+[\w$]+/, '').replace(/,/g, '').trim();
    if (def) names.push('default');
    out.push({ spec, names, star });
  }
  for (const mm of src.matchAll(/import\s*['"]([^'"]+)['"]/g)) out.push({ spec: mm[1], names: [], star: false });
  return out;
}

const cache = new Map();
const exportsCached = f => {
  if (!cache.has(f)) cache.set(f, exportsOf(f));
  return cache.get(f);
};

function checkSource(src, fromFile, label) {
  const problems = [];
  for (const imp of importsOf(src)) {
    if (imp.spec === 'three') continue;                    // Import-Map / Node-Hook
    if (!imp.spec.startsWith('.') && !imp.spec.startsWith('/')) continue;
    if (imp.spec.startsWith('node:')) continue;
    const target = resolve(dirname(fromFile), imp.spec);
    if (!existsSync(target)) { problems.push(label + ': Datei fehlt — ' + imp.spec); continue; }
    if (imp.star) continue;
    const have = exportsCached(target);
    for (const n of imp.names) {
      if (!have.has(n)) problems.push(label + ': ' + relative(ROOT, target) + ' exportiert kein „' + n + '"');
    }
  }
  return problems;
}

test('alle Imports der JS-Module lösen auf', () => {
  const problems = [];
  /* tools/ gehört zum eigenständigen Stand; im Einbau bei DieLogic
     bleiben die Bauwerkzeuge drüben. */
  const roots = [join(ROOT, 'js')];
  if (existsSync(join(ROOT, 'tools'))) roots.push(join(ROOT, 'tools'));
  for (const f of roots.flatMap(r => walk(r))) {
    problems.push(...checkSource(readFileSync(f, 'utf8'), f, relative(ROOT, f)));
  }
  assert.deepEqual(problems, []);
});

test('alle Imports der HTML-Seiten lösen auf', () => {
  const problems = [];
  const htmls = [];
  for (const f of ['index.html', 'form.html', 'bauteilanalyse.html', 'wandstaerke.html',
    'abstand.html', 'anguss.html', 'ueberlauf.html', 'temperier.html', 'fuellung.html']) htmls.push(join(ROOT, f));
  for (const f of htmls) {
    assert.ok(existsSync(f), 'fehlt: ' + f);
    const src = readFileSync(f, 'utf8');
    /* Wurzel-absolute Pfade (/shared/…) zeigen auf die umgebende
       Website, nicht auf dieses Werkzeug — die prüft dort deren eigene
       Test-Suite. Hier zählt, dass die EIGENEN Dateien stimmen. */
    const own = href => !href.startsWith('/') && !href.startsWith('http');
    for (const m of src.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) {
      if (!own(m[1])) continue;
      const t = resolve(dirname(f), m[1]);
      if (!existsSync(t)) problems.push(relative(ROOT, f) + ': Skript fehlt — ' + m[1]);
    }
    for (const m of src.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)) {
      if (!m[1].trim()) continue;
      problems.push(...checkSource(m[1], f, relative(ROOT, f) + ' (inline)'));
    }
    for (const m of src.matchAll(/<link[^>]*href="([^"]+\.css)"/g)) {
      if (!own(m[1])) continue;
      const t = resolve(dirname(f), m[1]);
      if (!existsSync(t)) problems.push(relative(ROOT, f) + ': Stylesheet fehlt — ' + m[1]);
    }
    for (const m of src.matchAll(/"three"\s*:\s*"([^"]+)"/g)) {
      const t = resolve(dirname(f), m[1]);
      if (!existsSync(t)) problems.push(relative(ROOT, f) + ': Import-Map zeigt ins Leere — ' + m[1]);
    }
  }
  assert.deepEqual(problems, []);
});

test('jede id, die ein Viewer-Modul anspricht, steht im HTML', () => {
  const pairs = [
    ['bauteilanalyse.html', [join('js', 'part', 'app.js'), join('js', 'part', 'partsource.js')]],
    ['wandstaerke.html', [join('js', 'part', 'offsetapp.js'), join('js', 'part', 'partsource.js')]],
    ['abstand.html', [join('js', 'part', 'distanceapp.js')]],
    ['form.html', [join('js', 'die.js'), join('js', 'ui', 'sidebar.js')]],
    ['anguss.html', [join('js', 'runner', 'app.js')]]
  ];
  const problems = [];
  for (const [html, jsList] of pairs) {
    const page = readFileSync(join(ROOT, html), 'utf8');
    const ids = new Set([...page.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    const src = jsList.map(j => readFileSync(join(ROOT, j), 'utf8')).join('\n');
    const used = new Set();
    for (const m of src.matchAll(/\$\('([^']+)'\)/g)) used.add(m[1]);
    for (const m of src.matchAll(/getElementById\('([^']+)'\)/g)) used.add(m[1]);
    /* Werte-Anzeigen heißen <id>-val und werden im Regler-Helfer gebaut. */
    for (const m of src.matchAll(/slider\('([^']+)'/g)) { used.add(m[1]); used.add(m[1] + '-val'); }
    for (const m of src.matchAll(/seg3\('([^']+)'/g)) used.add(m[1]);
    for (const m of src.matchAll(/numberInput\('([^']+)'/g)) used.add(m[1]);
    /* Zusammengesetzte ids (Suffix, Schleifen über 'a'/'b') lassen sich
       statisch nicht auflösen — sie prüft der Verdrahtungstest. */
    for (const id of [...used]) if (/'|\+|\$\{/.test(id)) used.delete(id);
    for (const id of used) if (!ids.has(id)) problems.push(html + ': keine id „' + id + '"');
  }
  assert.deepEqual(problems, []);
});
