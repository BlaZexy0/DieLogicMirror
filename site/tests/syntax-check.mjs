/* Syntax-Check aller JS-Dateien der Website plus des Inline-Scripts der
   STL-Seite — läuft in CI vor den Tests:  node site/tests/syntax-check.mjs
   (aus dem Repo-Root; nutzt git ls-files, prüft also nur eingecheckte Dateien) */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const files = execFileSync('git', ['ls-files', 'site/*.js', 'site/**/*.js'], { encoding: 'utf8' })
  .split('\n').filter(Boolean);
if (!files.length) throw new Error('git ls-files fand keine JS-Dateien — aus dem Repo-Root starten.');
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });

const html = readFileSync('site/stl/stl-analyse.html', 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (!inline.length) throw new Error('Kein Inline-Script in stl-analyse.html gefunden.');
const dir = mkdtempSync(path.join(tmpdir(), 'dielogic-syntax-'));
inline.forEach((src, i) => {
  const tmp = path.join(dir, `stl-inline-${i}.js`);
  writeFileSync(tmp, src);
  execFileSync(process.execPath, ['--check', tmp], { stdio: 'inherit' });
});

console.log(`${files.length} JS-Dateien + ${inline.length} Inline-Script(s): Syntax OK`);
