/* Die Beispielform: bauen sich alle Baugruppen als geschlossene Körper,
   und stecken die Einbauteile in echten Negativen statt im vollen Stahl?

   Der zweite Punkt ist der eigentliche Prüfstein: früher überschnitten
   sich Kavität, Füllkammer, Stifte und Säulen mit den Formhälften. Hier
   wird für JEDES Paar mit überlappender Bounding-Box das gemeinsame
   Volumen boolesch gerechnet — es muss (bis auf die begründeten
   Ausnahmen unten) null sein. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildParts, buildCastPart, _internals as X } from '../../../web/tools/3d-studio/js/diegeom.js';
import { CFG } from '../../../web/tools/3d-studio/js/config.js';
import { COMPONENTS } from '../../../web/tools/3d-studio/js/registry.js';
import { intersect } from '../../../web/tools/3d-studio/js/csg.js';
import { volume, bounds, weld, adjacency, cleanMesh } from '../../../web/tools/3d-studio/js/mesh.js';

const parts = buildParts();

/* Erlaubte Überschneidungen:
   - Temperierkanäle bilden Bohrung UND Inhalt ab; der Stahl ist dort
     bewusst nicht ausgeschnitten (siehe README).
   - Innerhalb des Gussteils überlappen sich Anschnitt/Überläufe mit dem
     Bauteil um wenige Millimeter, damit die Vereinigung sauber wird —
     diese Flächen liegen im Inneren und sind nie sichtbar. */
const ALLOWED_PAIRS = [['castPart', 'castRunner'], ['castPart', 'castOverflow']];
const allowed = (a, b) =>
  a.startsWith('cool') || b.startsWith('cool')
  || ALLOWED_PAIRS.some(([x, y]) => (a === x && b === y) || (b === x && a === y));

test('alle Baugruppen sind geschlossen und richtig orientiert', () => {
  for (const c of COMPONENTS) {
    const list = parts[c.id];
    assert.ok(list && list.length, c.id + ' fehlt');
    for (const piece of list) {
      assert.ok(volume(piece.tris) > 0, c.id + '/' + piece.mat + ': Volumen muss positiv sein');
      assert.ok(piece.tris.length % 9 === 0, c.id + ': ganze Dreiecke');
    }
  }
});

test('nach dem Aufräumen hat jede Kante einen Nachbarn', () => {
  for (const c of COMPONENTS) {
    for (const piece of parts[c.id]) {
      if (c.id === 'coolFix' || c.id === 'coolMov') continue;   // Rohrzug: Körper berühren sich
      const t = cleanMesh(piece.tris).tris;
      const nbr = adjacency(weld(t).index, t.length / 9);
      let open = 0;
      for (let i = 0; i < nbr.length; i++) if (nbr[i] < 0) open++;
      /* Der bewegliche Einsatz ist mit zehn Schnitten das komplizierteste
         Teil; dort bleiben ein paar Kanten übrig, an denen sich Werkzeug-
         flächen exakt decken. Unter einem halben Prozent ist das optisch
         folgenlos — die Schwelle hält den Rest bei null. */
      const limit = c.id === 'movInsert' ? 0.005 : 0.0005;
      assert.ok(open / nbr.length < limit,
        c.id + '/' + piece.mat + ': ' + (100 * open / nbr.length).toFixed(3) + ' % offene Kanten');
    }
  }
});

test('kein Bauteil steckt im Stahl eines anderen', () => {
  const soup = {};
  for (const c of COMPONENTS) {
    for (const piece of parts[c.id]) soup[c.id + (parts[c.id].length > 1 ? ':' + piece.mat : '')] = piece.tris;
  }
  const keys = Object.keys(soup);
  const bb = Object.fromEntries(keys.map(k => [k, bounds(soup[k])]));
  const idOf = k => k.split(':')[0];
  const hits = (a, b) => {
    for (let i = 0; i < 3; i++) if (bb[a].min[i] > bb[b].max[i] || bb[b].min[i] > bb[a].max[i]) return false;
    return true;
  };
  const bad = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      if (!hits(a, b) || allowed(idOf(a), idOf(b))) continue;
      const v = Math.abs(volume(intersect(soup[a], soup[b])));
      if (v > 1) bad.push(a + ' ∩ ' + b + ' = ' + v.toFixed(1) + ' mm³');
    }
  }
  assert.deepEqual(bad, []);
});

test('die Kavität ist ein echtes Negativ mit Spalt', () => {
  const cast = buildCastPart();
  const vCast = volume(cast);
  assert.ok(vCast > 0);

  /* Das Gussteil darf in keinem der beiden Einsätze stecken … */
  for (const id of ['fixInsert', 'movInsert']) {
    const v = Math.abs(volume(intersect(parts[id][0].tris, cast)));
    assert.ok(v < 1, id + ' überschneidet das Gussteil um ' + v.toFixed(2) + ' mm³');
  }
  /* … und die Tasche muss um den Spalt größer sein als das Gussteil.
     Prüfung: das um fit aufgedickte Gussteil steckt NICHT mehr frei,
     sondern schneidet den Stahl — sonst wäre kein Spalt da. */
  const grown = X.partBody(CFG.fit * 2);
  const cut = Math.abs(volume(intersect(parts['movInsert'][0].tris, grown)));
  assert.ok(cut > 0, 'zwischen Gussteil und Stahl liegt ein Spalt von etwa ' + CFG.fit + ' mm');
});

test('der Kernstift steht als Stahl in der beweglichen Hälfte', () => {
  /* Das Loch im Gussteil und die Stahlsäule im Einsatz gehören zusammen:
     die Säule muss innerhalb des Lochs liegen (Spalt), aber vorhanden sein. */
  const col = X.coreColumn();
  const vCol = volume(col);
  assert.ok(vCol > 0);
  const inInsert = Math.abs(volume(intersect(parts['movInsert'][0].tris, col)));
  assert.ok(inInsert > 0.4 * vCol,
    'der Kern gehört zum beweglichen Einsatz (' + (100 * inInsert / vCol).toFixed(0) + ' %)');
  const inCast = Math.abs(volume(intersect(buildCastPart(), col)));
  assert.ok(inCast < 1, 'der Kern steckt im Loch, nicht im Gussteil');
});

test('die Füllkammer ist ein Rohr mit Gießloch', () => {
  const body = parts['sleeve'].find(p => p.mat === 'steel').tris;
  const b = bounds(body);
  const outer = CFG.sleeve.d / 2 + CFG.sleeve.wall;
  assert.ok(b.size[0] > 2 * outer - 1, 'Außendurchmesser');
  /* Volumen eines Vollzylinders wäre deutlich größer als das des Rohres. */
  const len = CFG.sleeve.len;
  const solid = Math.PI * outer * outer * len;
  assert.ok(volume(body) < 0.55 * solid, 'Kammer ist hohl');
  const plunger = parts['sleeve'].find(p => p.mat === 'plunger').tris;
  assert.ok(Math.abs(volume(intersect(body, plunger))) < 1, 'der Kolben läuft in der Bohrung');
});

test('Registry und Geometrie passen zusammen', () => {
  assert.equal(Object.keys(parts).length, COMPONENTS.length);
  for (const c of COMPONENTS) assert.ok(parts[c.id], 'kein Bauteil für ' + c.id);
  const mats = new Set();
  for (const c of COMPONENTS) for (const p of parts[c.id]) mats.add(p.mat);
  /* Diese Namen steuern im Viewer die Deckkraft und die Schnittflächen. */
  for (const n of ['steel', 'plunger', 'pins', 'castPart', 'castRunner', 'castOverflow', 'coolFix', 'coolMov']) {
    assert.ok(mats.has(n), 'Materialname fehlt: ' + n);
  }
});

/* ── Die ausgelieferte GLB ───────────────────────────────────────
   Der Viewer lädt NUR assets/die.glb und findet alles über Namen. Wenn
   diese Namen nicht stimmen, bleibt die Seitenleiste leer und der
   Schnitt farblos — deshalb wird die Datei hier direkt gelesen (der
   JSON-Block eines binären glTF steht im Klartext im ersten Chunk). */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* Nur EINE Stelle kennt den Werkzeugordner. */
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
  for (const n of ['steel', 'plunger', 'pins', 'castPart', 'castRunner', 'castOverflow', 'coolFix', 'coolMov']) {
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
