/* Syntax-Check aller JS-Dateien der Website plus der Inline-Scripts aller
   HTML-Seiten (z. B. Theorie-Demos) — läuft in CI vor den Tests:
     node site/tests/syntax-check.mjs
   (aus dem Repo-Root; nutzt git ls-files, prüft also nur eingecheckte Dateien) */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ls = (pattern) => execFileSync('git', ['ls-files', ...pattern], { encoding: 'utf8' })
  .split('\n').filter(Boolean);

const files = ls(['site/*.js', 'site/**/*.js']);
if (!files.length) throw new Error('git ls-files fand keine JS-Dateien — aus dem Repo-Root starten.');
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });

const dir = mkdtempSync(path.join(tmpdir(), 'dielogic-syntax-'));
let inlineCount = 0;
for (const page of ls(['site/*.html', 'site/**/*.html'])) {
  const html = readFileSync(page, 'utf8');
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  inline.forEach((src, i) => {
    const tmp = path.join(dir, path.basename(page, '.html') + '-inline-' + i + '.js');
    writeFileSync(tmp, src);
    try {
      execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
    } catch (e) {
      throw new Error('Syntaxfehler im Inline-Script ' + (i + 1) + ' von ' + page);
    }
    inlineCount++;
  });
}

console.log(`${files.length} JS-Dateien + ${inlineCount} Inline-Script(s): Syntax OK`);
