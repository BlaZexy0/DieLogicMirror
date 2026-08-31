/* Syntax-Check aller JS-Dateien der Website plus der Inline-Scripts aller
   HTML-Seiten (z. B. Theorie-Demos) — läuft in CI vor den Tests:
     node tests/web/syntax-check.mjs
   (aus dem Repo-Root; nutzt git ls-files, prüft also nur eingecheckte Dateien) */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ls = (pattern) => execFileSync('git', ['ls-files', ...pattern], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const files = ls(['web/*.js', 'web/**/*.js']).filter(f => !f.includes('/vendor/'));
if (!files.length) throw new Error('git ls-files fand keine JS-Dateien — aus dem Repo-Root starten.');
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });

const dir = mkdtempSync(path.join(tmpdir(), 'dielogic-syntax-'));
let inlineCount = 0;
for (const page of ls(['web/*.html', 'web/**/*.html']).filter(f => !f.includes('/vendor/'))) {
  const html = readFileSync(page, 'utf8');
  /* Auch <script type="module"> — der alte Ausdruck verlangte ein <script>
     OHNE Attribute und übersprang damit jeden Modul-Block. Auf der
     Konto-Seite steckt der ganze Stammdaten-Editor in einem solchen: dort
     wäre ein Syntaxfehler unbemerkt durchgerutscht.
     Übersprungen wird nur, was gar kein JavaScript ist (src=… lädt eine
     Datei, die oben schon geprüft wurde; type="application/ld+json" &c.). */
  const blocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
    .filter(m => !/\bsrc\s*=/.test(m[1]))
    .filter(m => {
      const t = (m[1].match(/\btype\s*=\s*["']?([^"'\s>]+)/) || [])[1];
      return !t || t === 'module' || /javascript/i.test(t);
    })
    .map(m => ({ module: /\btype\s*=\s*["']?module/.test(m[1]), src: m[2] }));

  blocks.forEach((b, i) => {
    /* Module brauchen die Endung .mjs, sonst prüft Node sie als Skript und
       stolpert über import/export. */
    const tmp = path.join(dir, path.basename(page, '.html') + '-inline-' + i + (b.module ? '.mjs' : '.js'));
    writeFileSync(tmp, b.src);
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
    } catch (e) {
      throw new Error('Syntaxfehler im Inline-Script ' + (i + 1) + ' von ' + page
        + (b.module ? ' (type="module")' : ''));
    }
    inlineCount++;
  });
}

console.log(`${files.length} JS-Dateien + ${inlineCount} Inline-Script(s): Syntax OK`);
