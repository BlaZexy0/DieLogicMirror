/* Das O-Gitter des Metamodells und die Luft darauf — ohne ONNX.

   Das Modell selbst (12 MB, onnxruntime-web) läuft nur im Browser
   (tests/browser/studio.spec.mjs). Was hier geprüft wird, braucht es nicht:
   die Topologie des Querschnitts aus der Beilage des Modells
   (models/sleeve_surrogate.json) und das Zählen der eingeschlossenen Luft —
   dieselbe Frage wie enclosedGas() des Gitters, nur auf diesem Gitter.

     systemd-run --user --scope -q -p MemoryMax=4G node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/meta.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'tools', '3d-studio');
const load = f => import(pathToFileURL(resolve(ROOT, f)).href);

let meta, topo, graph, ogrid, air, Z, per;

before(async () => {
  meta = JSON.parse(readFileSync(resolve(ROOT, 'models/sleeve_surrogate.json'), 'utf8'));
  ogrid = await load('js/meta/ogrid.js');
  air = await load('js/meta/air.js');
  topo = ogrid.buildTopology(meta);
  graph = air.buildGraph(topo);
  per = meta.nd * meta.nd;
  Z = 6;
});

test('Die Beilage des Modells trägt, was das Gitter beschreibt', () => {
  assert.equal(meta.nd, 30);
  assert.equal(meta.n_curve, 64);
  assert.equal(meta.axial_stretch, 3);
  assert.deepEqual(meta.cond.slice(0, 4), ['lam', 'phi', 'log10_D_mm', 's']);
  assert.equal(meta.cond.length, 4 + meta.n_curve, 'λ, φ, log D, s und die Kurve');
  assert.deepEqual(meta.channels, ['alpha', 'Ux', 'Uy', 'Uz', 'p_rgh']);
  /* Die Fläche der Zellen ist der Kreis: Σ Fläche/D² = π/4. */
  const area = meta.area_D2.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(area - Math.PI / 4) < 1e-3, 'Σ Zellfläche = π/4 D²: ' + area);
});

test('Der Querschnitt hängt zusammen — auch über die vier Diagonalnähte', () => {
  const masked = [];
  for (let q = 0; q < per; q++) if (topo.inMask[q]) masked.push(q);
  /* Kernblock und vier Ringblöcke füllen das Bild ohne die vier Ecken. */
  assert.ok(masked.length > 0.6 * per && masked.length < per, 'Zellen im Gitter: ' + masked.length);
  assert.equal(masked.length, meta.area_D2.flat().filter(a => a > 0).length, 'Maske = Zellen mit Fläche');
  for (const q of masked) assert.ok(graph.start[q + 1] - graph.start[q] >= 2, 'Zelle ' + q + ' hat Nachbarn');
  /* Eine Flutfüllung über alle Zellen erreicht jede — sonst fehlte eine Naht. */
  const seen = new Set([masked[0]]), stack = [masked[0]];
  while (stack.length) {
    const q = stack.pop();
    for (let e = graph.start[q]; e < graph.start[q + 1]; e++) {
      const n = graph.nb[e];
      if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  assert.equal(seen.size, masked.length, 'ein Stück, keine losen Blöcke');
  /* Ohne die Nähte zerfiele es — die Probe dazu: die Naht-Paare sind im Bild keine Nachbarn. */
  const pairs = ogrid.cellNeighbours(topo);
  const nd = meta.nd;
  let diagonal = 0;
  for (let i = 0; i < pairs.length; i += 2) {
    const a = pairs[i], b = pairs[i + 1];
    const dr = Math.abs(Math.floor(a / nd) - Math.floor(b / nd)), dc = Math.abs((a % nd) - (b % nd));
    if (dr + dc !== 1) diagonal++;
  }
  assert.ok(diagonal >= 4 * topo.ra - 4, 'die Nähte sind dabei: ' + diagonal);
});

/** Sind zwei Zellen des Querschnitts Nachbarn? (Zwei Blasen dürfen sich nicht berühren.) */
const isNeighbour = (a, b) => {
  for (let e = graph.start[a]; e < graph.start[a + 1]; e++) if (graph.nb[e] === b) return true;
  return false;
};

/** Ein Bild: `fn(l, q) → Schmelzeanteil 0 … 1`. */
const frame = fn => {
  const f = new Uint8Array(Z * per);
  for (let l = 0; l < Z; l++) for (let q = 0; q < per; q++) if (topo.inMask[q]) f[l * per + q] = Math.round(fn(l, q) * 255);
  return f;
};

test('Luft: die ruhende Schmelze schließt nichts ein, eine Blase wird gezählt', () => {
  const spec = { d: 90, length: 450, fill: 0.4 };
  const vol = air.cellVolumes(meta, spec, Z, 1);
  const yD = meta.y_D.flat();
  /* Die Schmelze steht unten: alles unter der Sehne voll, darüber leer. */
  const ruhe = frame((l, q) => (yD[q] < -0.1 ? 1 : 0));
  const a0 = air.enclosedAir(graph, topo, ruhe, Z, vol);
  assert.equal(a0.bubbles, 0, 'ein Luftraum über der Schmelze');
  assert.equal(a0.enclosed, 0, 'nichts eingeschlossen');
  assert.ok(a0.total > 0, 'Luft gibt es: ' + a0.total + ' cm³');

  /* Eine Zelle Luft TIEF in der Schmelze, darüber der offene Raum wie eben:
     genau die eine Zelle ist eingeschlossen. (Der größte Raum gilt immer als
     offen — dieselbe Regel wie enclosedGas() des Gitters.) */
  const q0 = [...Array(per).keys()].find(q => topo.inMask[q] && yD[q] < -0.3);
  const offen = (l, q) => (yD[q] < -0.1 ? 1 : 0);
  const blase = frame((l, q) => (l === 2 && q === q0 ? 0 : offen(l, q)));
  const a1 = air.enclosedAir(graph, topo, blase, Z, vol);
  assert.equal(a1.bubbles, 1);
  assert.ok(Math.abs(a1.enclosed - vol[q0]) < 1e-9, 'das Volumen der einen Zelle: ' + a1.enclosed + ' gegen ' + vol[q0]);

  /* Zwei getrennte Blasen unter dem Spiegel: beide zählen, der Raum darüber nicht. */
  const q1 = [...Array(per).keys()].find(q => topo.inMask[q] && yD[q] < -0.3 && q !== q0 && !isNeighbour(q, q0));
  const zwei = frame((l, q) => ((l === 2 && q === q0) || (l === 4 && q === q1) ? 0 : offen(l, q)));
  const a2 = air.enclosedAir(graph, topo, zwei, Z, vol);
  assert.equal(a2.bubbles, 2);
  assert.ok(Math.abs(a2.enclosed - (vol[q0] + vol[q1])) < 1e-9, 'beide Blasen: ' + a2.enclosed);

  /* Teilweise gefüllte Zellen zählen anteilig, volle gar nicht. */
  const halb = frame((l, q) => (l === 2 && q === q0 ? 0.25 : offen(l, q)));
  const a3 = air.enclosedAir(graph, topo, halb, Z, vol);
  assert.ok(Math.abs(a3.enclosed - 0.75 * vol[q0]) < 1e-3 * vol[q0], 'drei Viertel Luft: ' + a3.enclosed);

  /* Der Kolben staucht die Kammer: bei halbem Weg ist jede Schicht dünner. */
  const gestaucht = air.cellVolumes(meta, spec, Z, 0.7);
  assert.ok(Math.abs(gestaucht[q0] - 0.7 * vol[q0]) < 1e-12);
});

test('Die Fläche des halben Schmelzeanteils entsteht auf dem Gitter des Modells', () => {
  const vol = ogrid.buildVolume(topo, Z);
  const yD = meta.y_D.flat();
  const fill = frame((l, q) => (yD[q] < -0.1 ? 1 : 0));
  const speed = new Uint8Array(Z * per).fill(128);
  ogrid.fillFrame(vol, { fill, speed, uMax: 2 }, { d: 90, length: 450, fill: 0.4 }, 0.5, 270);
  const { positions, colors, indices } = ogrid.extractSurface(vol, 2);
  assert.ok(indices.length > 300, 'Dreiecke: ' + indices.length / 3);
  assert.equal(colors.length, positions.length, 'je Ecke eine Farbe');
  let yMin = Infinity, yMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    xMin = Math.min(xMin, positions[i]); xMax = Math.max(xMax, positions[i]);
    yMin = Math.min(yMin, positions[i + 1]); yMax = Math.max(yMax, positions[i + 1]);
  }
  /* Die Fläche liegt in der Kammer: zwischen Kolben (135 mm) und Stirnplatte (450 mm), Radius 45. */
  assert.ok(xMin > 100 && xMax < 460, 'x von ' + xMin + ' bis ' + xMax);
  assert.ok(yMin > -46 && yMax < 46, 'y von ' + yMin + ' bis ' + yMax);
});
