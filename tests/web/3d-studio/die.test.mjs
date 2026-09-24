/* Die ausgelieferte Beispielform assets/die.glb. Sie entsteht im
   Schwesterprojekt openscad_parts (./render_die.sh --studio, das
   scripts/3d-studio/build-die-stl.mjs aufruft). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMPONENTS } from '../../../web/tools/3d-studio/js/registry.js';

/* Der Viewer lädt NUR assets/die.glb und findet alles über Namen. Wenn
   diese Namen nicht stimmen, bleibt die Seitenleiste leer und der
   Schnitt farblos — deshalb wird die Datei hier direkt gelesen (der
   JSON-Block eines binären glTF steht im Klartext im ersten Chunk). */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');
const GLB = join(ROOT, 'assets', 'die.glb');

function readGlbJson(path) {
  const buf = readFileSync(path);
  assert.equal(buf.toString('ascii', 0, 4), 'glTF', 'GLB-Kennung');
  assert.equal(buf.readUInt32LE(4), 2, 'glTF 2.0');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.toString('ascii', 16, 20), 'JSON');
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}

test('assets/die.glb enthält alle Namen, über die der Viewer sucht', { skip: !existsSync(GLB) && 'die.glb fehlt — in openscad_parts ./render_die.sh --studio' }, () => {
  const g = readGlbJson(GLB);
  const names = new Set(g.nodes.map(n => n.name));
  for (const n of ['die', 'fixedRoot', 'movingRoot']) assert.ok(names.has(n), 'Knoten fehlt: ' + n);
  for (const c of COMPONENTS) assert.ok(names.has(c.id), 'Baugruppe fehlt: ' + c.id);

  /* compId überlebt als glTF-extras — daran hängt der Hover. */
  const withExtras = g.nodes.filter(n => n.extras && n.extras.compId);
  assert.ok(withExtras.length >= COMPONENTS.length, 'compId in den extras');

  /* Materialnamen steuern die Deckkraft und die Schnittflächen. */
  const mats = new Set(g.materials.map(m => m.name));
  for (const n of ['steel', 'plunger', 'pins', 'castPart', 'castRunner', 'castBiscuit', 'castOverflow', 'coolFix', 'coolMov']) {
    assert.ok(mats.has(n), 'Material fehlt: ' + n);
  }

  /* Indizierte Geometrie — sonst wäre die Datei um ein Vielfaches größer. */
  for (const mesh of g.meshes) {
    for (const prim of mesh.primitives) {
      assert.ok(prim.indices !== undefined, 'Geometrie ist indiziert');
      assert.ok(prim.attributes.POSITION !== undefined && prim.attributes.NORMAL !== undefined);
    }
  }
});
