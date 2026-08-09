#!/usr/bin/env python3
"""Mini-Bundler ohne Abhängigkeiten: bündelt die ES-Module aus js/ zu einem
klassischen Skript dist/app.js, das auch über file:// läuft.

Aufruf:  python3 build.py          (im Projektordner)

Nach jeder Änderung an Dateien unter js/ einmal ausführen, damit die
file://-Fassung aktuell bleibt. Über einen Webserver geladen verwenden die
Seiten weiterhin direkt die ES-Module — dort ist kein Build nötig.

Unterstützte Syntax (mehr wird im Projekt nicht verwendet):
  import { a, b } from './x.js';     import def from './x.js';
  export function / export async function / export const / export default
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ENTRIES = ["js/main.js", "js/single.js"]

IMPORT_RE = re.compile(
    r"^import\s+(?:\{([^}]*)\}|(\w+))\s+from\s+['\"]([^'\"]+)['\"];?\s*$", re.M)
EXPORT_FN_RE = re.compile(r"^export\s+(async\s+)?function\s+(\w+)", re.M)
EXPORT_VAR_RE = re.compile(r"^export\s+(const|let|var)\s+(\w+)", re.M)

PRELUDE = """/* Automatisch generiert von build.py — NICHT von Hand bearbeiten.
   Quelle sind die ES-Module unter js/. */
(function () {
'use strict';
var __registry = {}, __cache = {};
function __define(id, fn) { __registry[id] = fn; }
function __require(id) {
  if (__cache[id]) return __cache[id].exports;
  if (!__registry[id]) throw new Error('Modul fehlt im Bundle: ' + id);
  var m = __cache[id] = { exports: {} };
  __registry[id](m.exports, __require);
  return m.exports;
}
"""

EPILOGUE = """
var __el = document.currentScript;
var __entry = (__el && __el.getAttribute('data-entry')) || 'main';
__require('js/' + __entry + '.js');
})();
"""


def module_id(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def transform(path: Path, seen: set, out: list) -> None:
    mid = module_id(path)
    if mid in seen:
        return
    seen.add(mid)
    src = path.read_text(encoding="utf-8")
    deps = []

    def repl_import(m):
        named, default, spec = m.group(1), m.group(2), m.group(3)
        target = (path.parent / spec).resolve()
        if not target.is_file():
            sys.exit(f"FEHLER: {mid}: Import '{spec}' nicht gefunden.")
        deps.append(target)
        tid = module_id(target)
        if named is not None:
            names = ", ".join(
                n.strip().replace(" as ", ": ") for n in named.split(",") if n.strip())
            return f"const {{ {names} }} = __require('{tid}');"
        return f"const {default} = __require('{tid}').default;"

    body = IMPORT_RE.sub(repl_import, src)

    exported = []

    def repl_fn(m):
        exported.append(m.group(2))
        return f"{'async ' if m.group(1) else ''}function {m.group(2)}"

    def repl_var(m):
        exported.append(m.group(2))
        return f"{m.group(1)} {m.group(2)}"

    body = EXPORT_FN_RE.sub(repl_fn, body)
    body = EXPORT_VAR_RE.sub(repl_var, body)
    body = re.sub(r"^export default ", "exports.default = ", body, flags=re.M)

    if "export " in "\n".join(l for l in body.splitlines() if l.startswith("export ")):
        sys.exit(f"FEHLER: {mid}: nicht unterstützte export-Syntax übrig.")

    for d in deps:
        transform(d, seen, out)

    epilog = "".join(f"\nexports.{n} = {n};" for n in exported)
    out.append(f"__define('{mid}', function (exports, __require) {{\n{body}{epilog}\n}});\n")


def main() -> None:
    out: list = []
    seen: set = set()
    for entry in ENTRIES:
        transform(ROOT / entry, seen, out)
    bundle = PRELUDE + "".join(out) + EPILOGUE
    dist = ROOT / "dist"
    dist.mkdir(exist_ok=True)
    (dist / "app.js").write_text(bundle, encoding="utf-8")
    print(f"dist/app.js geschrieben — {len(seen)} Module, {len(bundle)} Bytes")


if __name__ == "__main__":
    main()
