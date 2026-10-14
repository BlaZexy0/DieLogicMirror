/* Der OpenFOAM-Fall für dieLogicSolFoam (dieLogicSol/solvers, OpenFOAM
   v2606 von openfoam.com): die Erstarrung eines Schusses zusammen mit der
   Form. Aus der Vereinigung der Gusskörper (geometry.js unionSurfaces), der
   Kolbenfläche, dem Formblock, den Kühlkanälen, dem Netz, dem Prozess und
   der Auswertung jede Datei des Falls als Text oder Bytes.

   Vorbild ist der Testfall plateShot3D von dieLogicSol: ein Netz für
   Gussteil und Form, jeder Werkstoff eine Zellzone.

     Formblock    der Quader um das Gussteil (Rand je Seite), Hintergrund
                  von blockMesh, Zellen 2^k-mal so groß wie im Gussteil
     Gussteil     cellZone gussteil (die faceZone heißt casting; „casting"
                  ist bei dieLogicSolFoam die Gruppe — so heißt in
                  solidificationTimes.dat die Zeile für das ganze Gussteil):
                  snappyHexMesh legt die Zellen an die
                  Oberfläche der Vereinigung (faceZone, Flutung ab einem
                  Punkt im Pressrest); innen und in einem Band um das
                  Gussteil in der Zellgröße des Gussteils
     Kühlkanäle   runde Löcher (searchableCylinder), je Kanal ein Rand
                  (kanal1 …) mit eigenem Wasser
     Kolben       cellZone plunger: die Zellen im Zylinder hinter der
                  Kolbenfläche bis zum Rand des Blocks (topoSet), sein Ende
                  der Rand plungerEnd (Wasser)
     Formhälften  cellZone dieMoving: der Stahl auf der beweglichen Seite
                  der Trennebene; die feste Seite ist der Rest (die Seite
                  des Kolbens)

   Der Fall ist ein Ordner mit drei Teilen wie bei „Füllsimulation":

     Allrun, Allclean, bilder.py, bericht.py, auswertung.json, README.md
     simulation/    der OpenFOAM-Fall (0.orig, constant, system)
     auswertung/    entsteht am Ende: bericht.html, bilder, graphiken, daten

   Reine Rechnung, kein DOM. */

import { writeSTL } from '../../../3d-studio/js/part/stlio.js';
import { bounds, volume, shells, edgeCheck } from '../../../simulation/js/core/geometry.js';
import { snapTris } from '../../../simulation/js/core/casegen.js';
import { VIEW_PRESETS } from '../../../simulation/js/core/render.js';
import { ALLOYS, DIE_STEEL, PLUNGER } from './materials.js';
import { SOL_BILDER_PY } from './bilder.js';
import { SOL_BERICHT_PY } from './bericht.js';

export const SOLVER = 'dieLogicSolFoam';
export const SIM = 'simulation/';
const C = SIM;
const K = 273.15;

/* Vorgaben, gegen die die Seite ihre Eingaben prüft */
export const DEFAULTS = {
  die: { margin: 40, parting: 0 },
  mesh: { cell: 2, dieLevel: 2, band: 0, nProc: 6 },
  channel: { d: 10, T: 60, h: 8000 },
  process: {
    alloy: 'AlSi9Cu3', Tcast: 680, Tfill: 660, fillTime: 0.05,
    Tdie: 200, Tplunger: 150, Tplwater: 40, hPlunger: 1e4,
    pInt: 800, tInt: 0.03,
    hLiquid: 4e4, hSolid: 4e3, fsGap: 0.6, hDieDie: 1e4, hOutside: 15,
    mode: 'single', nCycles: 5, cycleTime: 60, dieOpen: 40, spray0: 43, spray1: 46, hSpray: 3000, Tspray: 40, hOpen: 20,
    start: 'uniform', fillCase: ''
  },
  post: { criteria: ['solidTime', 'sequence', 'porosity', 'dieTemp', 'soldering'], frames: 40, views: ['iso'], aspect: '16:9', width: 1600 }
};

/* ── Hilfen ───────────────────────────────────────────────────────── */
const f6 = x => (Math.abs(x) < 1e-12 ? '0' : Number(Number(x).toPrecision(8)).toString());
const vec = v => '(' + v.map(f6).join(' ') + ')';
const head = (cls, obj, loc) => 'FoamFile\n{\n    version     2.0;\n    format      ascii;\n    class       ' + cls + ';\n'
  + (loc ? '    location    "' + loc + '";\n' : '') + '    object      ' + obj + ';\n}\n'
  + '// Erzeugt von DieLogic · Erstarrungssimulation (/tools/erstarrung/)\n\n';
const dict = (obj, loc) => head('dictionary', obj, loc);
const toM = (t, s = 1e-3) => { const o = new Float32Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t[i] * s; return o; };
const table = rows => 'table (' + rows.map(([a, b]) => '(' + f6(a) + ' ' + f6(b) + ')').join(' ') + ')';
const add = (a, b, s = 1) => a.map((x, k) => x + s * b[k]);
const norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };

/** Ein Vektor quer zu n (für Punkte, die nicht auf Symmetrieebenen liegen). */
function perpTo(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const c = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  return norm(c);
}

/** Die Legierung aus dem Prozess: ein Eintrag der Bibliothek oder einer der Auslegung. */
export function alloyOf(P) {
  return (P.alloyData && P.alloyData.fs ? P.alloyData : null) || ALLOYS.find(a => a.id === P.alloy) || ALLOYS[0];
}

/** Was fehlt, damit ein Fall entsteht (Texte für die Seite). */
export function missing(p) {
  const out = [];
  if (!p.bodies || !p.bodies.length) out.push('Es gibt keinen Gusskörper.');
  if (!p.plunger) out.push('Die Kolbenfläche am Pressrest fehlt.');
  const M = Object.assign({}, DEFAULTS.mesh, p.mesh || {});
  if (!(M.cell > 0)) out.push('Die Zellgröße fehlt.');
  return out;
}

/**
 * Der Formblock: Quader um alle Gusskörper mit dem Rand je Seite, auf das
 * Raster der Hintergrundzellen. Der Kolben läuft von der Kolbenfläche
 * entlang n bis zum Rand des Blocks.
 * → { lo, hi, n (Zellen je Achse), hCast, hBg, plungerLength, fixedBelow }
 */
export function dieBlock(p) {
  const M = Object.assign({}, DEFAULTS.mesh, p.mesh || {});
  const D = Object.assign({}, DEFAULTS.die, p.die || {});
  const bb = p.bodies.map(b => bounds(b.tris)).reduce((a, b) => ({ lo: a.lo.map((x, k) => Math.min(x, b.lo[k])), hi: a.hi.map((x, k) => Math.max(x, b.hi[k])) }));
  const hCast = M.cell, hBg = M.cell * Math.pow(2, Math.max(0, Math.round(M.dieLevel)));
  /* krumm versetzt wie bei der Füllung: keine Zellmitte auf einer runden Ebene */
  const shift = [0.2317, 0.3141, 0.1789].map(f => f * hCast);
  const lo = bb.lo.map((x, k) => Math.floor((x - D.margin) / hCast) * hCast - shift[k]);
  const n = bb.hi.map((x, k) => Math.max(1, Math.ceil((x + D.margin - lo[k]) / hBg)));
  const hi = lo.map((x, k) => x + n[k] * hBg);
  let plungerLength = NaN;
  if (p.plunger) {
    const c = p.plunger.centroid, nn = norm(p.plunger.normal);
    plungerLength = Infinity;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(nn[k]) < 1e-9) continue;
      const t = ((nn[k] > 0 ? hi[k] : lo[k]) - c[k]) / nn[k];
      if (t > 0) plungerLength = Math.min(plungerLength, t);
    }
  }
  /* die feste Formhälfte ist die Seite des Kolbens (die Gießkammer geht durch
     die feste Aufspannplatte); liegt der Kolben quer zur Öffnungsrichtung, unten */
  const nz = p.plunger ? norm(p.plunger.normal)[2] : -1;
  const fixedBelow = nz <= 0.3;
  return { lo, hi, n, hCast, hBg, plungerLength, fixedBelow, bb, parting: D.parting, margin: D.margin };
}

/** Kürzester Abstand einer Strecke (a, b) zu den Dreiecken (Stichprobe der
    Ecken und Mitten) — für die Seite: wie nah kommt ein Kanal der Kavität. */
export function segmentDistance(a, b, tris) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
  let best = Infinity;
  const test = (x, y, z) => {
    let t = ((x - a[0]) * ab[0] + (y - a[1]) * ab[1] + (z - a[2]) * ab[2]) / L2;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a[0] + t * ab[0] - x, a[1] + t * ab[1] - y, a[2] + t * ab[2] - z);
    if (d < best) best = d;
  };
  for (let i = 0; i < tris.length; i += 9) {
    test(tris[i], tris[i + 1], tris[i + 2]);
    test((tris[i] + tris[i + 3] + tris[i + 6]) / 3, (tris[i + 1] + tris[i + 4] + tris[i + 7]) / 3, (tris[i + 2] + tris[i + 5] + tris[i + 8]) / 3);
  }
  return best;
}

/** Grobe Erstarrungszeit [s] für die Zeitschritte der Auswertung: Newton
    am Kontakt (hSolid) über den Modul V/A des dicksten Körpers, mal zwei. */
export function solidTimeEstimate(p) {
  const P = Object.assign({}, DEFAULTS.process, p.process || {});
  const A = alloyOf(P);
  let M = 0;
  for (const b of p.bodies) {
    const v = Math.abs(volume(b.tris)) * 1e-9;
    let area = 0;
    const t = b.tris;
    for (let i = 0; i < t.length; i += 9) {
      const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
      area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
    }
    if (area > 0) M = Math.max(M, v / (area * 1e-6));
  }
  const Tl = A.fs[0][0] - K, cpL = A.cp[A.cp.length - 1][1];
  const t = A.rhoLiquid * (A.L + cpL * Math.max(0, P.Tfill - Tl)) * M / (Math.max(P.hSolid, 1000) * Math.max(Tl - P.Tdie, 50));
  return Math.min(600, Math.max(1, 2 * t));
}

/**
 * Alle Dateien des Falls.
 * @param p {
 *   title, union (unionSurfaces der Gusskörper), bodies [{ name, role, tris }],
 *   plunger { centroid, normal (aus dem Gussteil heraus), radius, depth },
 *   die { margin, parting }, channels [{ a, b, d, T, h }] (mm, °C, W/m²K),
 *   mesh { cell, dieLevel, band, nProc }, process {…}, post {…}, colors (Palette als Zahlen)
 * }
 * → { files: { pfad: string | Uint8Array }, info }
 */
export function buildSolCase(p) {
  const miss = missing(p);
  if (miss.length) throw new Error(miss.join(' '));
  const P = Object.assign({}, DEFAULTS.process, p.process || {});
  const M = Object.assign({}, DEFAULTS.mesh, p.mesh || {});
  const post = Object.assign({}, DEFAULTS.post, p.post || {});
  const A = alloyOf(P);
  const blk = dieBlock(p);
  const { lo, hi, n, hCast, hBg } = blk;
  const L = Math.max(0, Math.round(M.dieLevel));
  const files = {};

  /* ── Geometrie ── */
  const wall = p.union.patches ? [...p.union.patches.values()] : [p.union.wall];
  let nw = 0;
  for (const t of wall) nw += t.length;
  const castTris = new Float64Array(nw);
  let o = 0;
  for (const t of wall) { castTris.set(t, o); o += t.length; }
  if (!castTris.length) throw new Error('Die Oberfläche des Gussteils ist leer.');
  files[C + 'constant/triSurface/casting.stl'] = new Uint8Array(writeSTL(toM(castTris), 'DieLogic casting'));
  /* Verfeinerung innen je Schale (wie bei der Füllung): geschlossene Schalen
     „inside", offene im Abstand der halben Zelle des Hintergrunds */
  const regions = [];
  p.bodies.forEach((b, i) => {
    const parts = shells(b.tris).filter(q => q.length >= 4);
    (parts.length ? parts : [null]).forEach((q, k) => {
      let tris = b.tris;
      if (q) { tris = new Float64Array(q.length * 9); q.forEach((f, j) => tris.set(b.tris.subarray(f * 9, f * 9 + 9), j * 9)); }
      tris = snapTris(tris);
      const name = 'body' + (i + 1) + (parts.length > 1 ? '_' + (k + 1) : '');
      files[C + 'constant/triSurface/' + name + '.stl'] = new Uint8Array(writeSTL(toM(tris), 'DieLogic ' + b.name));
      regions.push({ name, body: b, closed: edgeCheck(tris).closed });
    });
  });

  /* Ein Punkt sicher im Gussteil: im Pressrest hinter der Kolbenfläche */
  const pl = p.plunger, nOut = norm(pl.normal), nIn = nOut.map(x => -x);
  const depth = pl.depth > 0 ? pl.depth : 4 * hCast;
  const perp = perpTo(nIn);
  const inside = add(add(pl.centroid, nIn, Math.min(depth / 2, Math.max(2 * hCast, depth / 3))), perp, 0.137 * pl.radius).map(x => x + 0.0731 * hCast);
  /* Ein Punkt sicher im Stahl: nahe einer Ecke des Blocks, außerhalb der Kanäle */
  const channels = (p.channels || []).filter(c => c && c.d > 0 && Math.hypot(c.b[0] - c.a[0], c.b[1] - c.a[1], c.b[2] - c.a[2]) > 1e-6);
  const inChannel = q => channels.some(c => segmentDistance(c.a, c.b, Float64Array.from([...q, ...q, ...q])) < c.d / 2 + 2 * hBg);
  let steel = null;
  for (const f of [[0.31, 0.27, 0.23], [0.69, 0.27, 0.23], [0.31, 0.73, 0.23], [0.69, 0.73, 0.77], [0.31, 0.27, 0.77], [0.69, 0.73, 0.23]]) {
    const q = lo.map((x, k) => x + (k === 2 ? (f[k] < 0.5 ? 0.5 : n[k] - 0.5) : (f[k] < 0.5 ? 0.5 : n[k] - 0.5)) * hBg + 0.137 * hBg * (k + 1) * 0.31);
    if (!inChannel(q)) { steel = q; break; }
  }
  if (!steel) steel = lo.map((x, k) => x + 0.6137 * hBg);

  files[C + 'system/blockMeshDict'] = dict('blockMeshDict', 'system')
    + 'scale 0.001;    // Koordinaten in mm\n\n'
    + '// der Formblock: Gussteil + ' + f6(blk.margin) + ' mm Rand je Seite, Zellen ' + f6(hBg) + ' mm\n'
    + 'vertices\n(\n'
    + [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
      .map(s => '    ' + vec(s.map((v, k) => (v ? hi[k] : lo[k])))).join('\n')
    + '\n);\n\nblocks ( hex (0 1 2 3 4 5 6 7) ' + vec(n) + ' simpleGrading (1 1 1) );\n\n'
    + 'boundary ( outside { type patch; faces ( (0 3 2 1) (4 5 6 7) (0 1 5 4) (2 3 7 6) (0 4 7 3) (1 2 6 5) ); } );\n';

  const band = M.band > 0 ? M.band : Math.max(3 * hCast, 8);
  const chLevel = c => Math.max(0, Math.min(L, Math.ceil(Math.log2(hBg / (c.d / 4)))));
  const lv = k => '(' + k + ' ' + k + ')';
  files[C + 'system/snappyHexMeshDict'] = dict('snappyHexMeshDict', 'system')
    + 'castellatedMesh true;\nsnap            true;\naddLayers       false;\n\n'
    + 'geometry\n{\n'
    + '    casting { type triSurfaceMesh; file "casting.stl"; }   // Oberfläche des Gussteils (Vereinigung)\n'
    + regions.map(r => '    ' + r.name + ' { type triSurfaceMesh; file "' + r.name + '.stl"; }   // ' + r.body.name + '\n').join('')
    + channels.map((c, i) => '    kanal' + (i + 1) + ' { type searchableCylinder; point1 ' + vec(c.a.map(x => x * 1e-3)) + '; point2 ' + vec(c.b.map(x => x * 1e-3)) + '; radius ' + f6(c.d / 2 * 1e-3) + '; }\n').join('')
    + '}\n\n'
    + 'castellatedMeshControls\n{\n'
    + '    maxLocalCells       10000000;\n    maxGlobalCells      100000000;\n    minRefinementCells  0;\n'
    + '    maxLoadUnbalance    0.10;\n    nCellsBetweenLevels 3;\n'
    + '    features ( { file "casting.eMesh"; level ' + L + '; } );\n'
    + '    refinementSurfaces\n    {\n'
    + '        casting\n        {\n            level ' + lv(L) + ';\n            faceZone casting;\n            cellZone gussteil;\n'
    + '            cellZoneInside insidePoint;\n            insidePoint ' + vec(inside.map(x => x * 1e-3)) + ';   // im Pressrest\n        }\n'
    + channels.map((c, i) => '        kanal' + (i + 1) + ' { level ' + lv(chLevel(c)) + '; patchInfo { type wall; } }   // Ø ' + f6(c.d) + ' mm\n').join('')
    + '    }\n'
    + '    resolveFeatureAngle 30;\n'
    + '    refinementRegions\n    {\n'
    + '        casting { mode distance; levels ((' + f6(band * 1e-3) + ' ' + L + ')); }   // Band im Stahl um das Gussteil\n'
    + regions.map(r => '        ' + r.name + (r.closed ? ' { mode inside; levels ((1e15 ' + L + ')); }' : ' { mode distance; levels ((' + f6(hBg * 1e-3) + ' ' + L + ')); }   // offen') + '\n').join('')
    + '    }\n'
    + '    locationInMesh ' + vec(steel.map(x => x * 1e-3)) + ';   // im Stahl\n'
    + '    allowFreeStandingZoneFaces true;\n}\n\n'
    + 'snapControls\n{\n    nSmoothPatch    3;\n    tolerance       2.0;\n    nSolveIter      50;\n    nRelaxIter      5;\n'
    + '    nFeatureSnapIter 10;\n    implicitFeatureSnap  false;\n    explicitFeatureSnap  true;\n    multiRegionFeatureSnap true;\n}\n\n'
    + 'addLayersControls\n{\n    relativeSizes true;\n    layers {}\n    expansionRatio 1.2;\n    finalLayerThickness 0.4;\n'
    + '    minThickness 0.1;\n    nGrow 0;\n    featureAngle 60;\n    nRelaxIter 3;\n    nSmoothSurfaceNormals 1;\n'
    + '    nSmoothNormals 3;\n    nSmoothThickness 10;\n    maxFaceThicknessRatio 0.5;\n    maxThicknessToMedialRatio 0.3;\n'
    + '    minMedialAxisAngle 90;\n    nBufferCellsNoExtrude 0;\n    nLayerIter 50;\n}\n\n'
    + 'meshQualityControls { #include "meshQualityDict" }\n\nmergeTolerance 1e-6;\n';
  files[C + 'system/surfaceFeatureExtractDict'] = dict('surfaceFeatureExtractDict', 'system')
    + 'casting.stl\n{\n    extractionMethod    extractFromSurface;\n    includedAngle       150;\n'
    + '    subsetFeatures { nonManifoldEdges no; openEdges yes; }\n    writeObj            no;\n}\n';
  files[C + 'system/meshQualityDict'] = dict('meshQualityDict', 'system') + '#includeEtc "caseDicts/mesh/generation/meshQualityDict.cfg"\n';

  /* Kolben, bewegliche Hälfte, Rand am Kolbenende */
  const zAxis = 2, zp = blk.parting;
  const mvLo = lo.slice(), mvHi = hi.slice();
  if (blk.fixedBelow) mvLo[zAxis] = zp; else mvHi[zAxis] = zp;
  const pEnd = add(pl.centroid, nOut, blk.plungerLength + hBg);
  const pStart = add(pl.centroid, nOut, -0.25 * hCast);
  files[C + 'system/topoSetDict'] = dict('topoSetDict', 'system')
    + '// Kolben: die Zellen im Zylinder hinter der Kolbenfläche (ohne Gussteil);\n'
    + '// bewegliche Formhälfte: der Stahl auf der ' + (blk.fixedBelow ? 'oberen' : 'unteren') + ' Seite der Trennebene z = ' + f6(zp) + ' mm\n'
    + 'actions\n(\n'
    /* der Speiser: der Pressrest, die Zellen des Gussteils im Zylinder hinter
       der Kolbenfläche bis zu seiner Tiefe (eine eigene Zone — eine Zelle
       gehört nur zu einer Zone, das Gussteil sind beide). Nur die erste
       Schicht am Kolben war zu wenig: am gekühlten Kolben erstarrt sie in
       Sekundenbruchteilen, und die Speisung riss für das ganze Gussteil ab —
       der Nachdruck wirkt aber durch den flüssigen Kern des Pressrests. */
    + '    { name speiser; type cellSet; action new;      source cylinderToCell; p1 ' + vec(add(pl.centroid, nIn, depth).map(x => x * 1e-3)) + '; p2 ' + vec(add(pl.centroid, nOut, 0.5 * hCast).map(x => x * 1e-3)) + '; radius ' + f6(pl.radius * 1e-3) + '; }\n'
    /* zones (gussteil feeder): topoSet darf auf einem fertigen Netz noch einmal laufen */
    + '    { name speiser; type cellSet; action subset;   source zoneToCell; zones (gussteil feeder); }\n'
    + '    { name guss;    type cellSet; action new;      source zoneToCell; zones (gussteil feeder); }\n'
    + '    { name guss;    type cellSet; action subtract; source cellToCell; sets (speiser); }\n'
    + '    { name feeder;  type cellZoneSet; action new;  source setToCellZone; set speiser; }\n'
    + '    { name gussteil; type cellZoneSet; action new; source setToCellZone; set guss; }\n'
    + '    { name kolben;  type cellSet; action new;      source cylinderToCell; p1 ' + vec(pStart.map(x => x * 1e-3)) + '; p2 ' + vec(pEnd.map(x => x * 1e-3)) + '; radius ' + f6(pl.radius * 1e-3) + '; }\n'
    + '    { name kolben;  type cellSet; action subtract; source zoneToCell; zones (gussteil feeder); }\n'
    + '    { name plunger; type cellZoneSet; action new;  source setToCellZone; set kolben; }\n'
    + '    { name haelfte;  type cellSet; action new;      source boxToCell; box ' + vec(mvLo.map(x => x * 1e-3)) + ' ' + vec(mvHi.map(x => x * 1e-3)) + '; }\n'
    + '    { name haelfte;  type cellSet; action subtract; source zoneToCell; zones (gussteil feeder plunger); }\n'
    + '    { name dieMoving; type cellZoneSet; action new; source setToCellZone; set haelfte; }\n'
    + '    { name kolbenEnde; type faceSet; action new;   source patchToFace; patch outside; }\n'
    + '    { name kolbenEnde; type faceSet; action subset; source cellToFace; sets (kolben); option all; }\n'
    + ');\n';
  files[C + 'system/createPatchDict'] = dict('createPatchDict', 'system')
    + 'pointSync false;\n\npatches\n(\n    { name plungerEnd; patchInfo { type patch; } constructFrom set; set kolbenEnde; }\n);\n';

  /* ── Werkstoffe ── */
  const curve = rows => table(rows);
  files[C + 'constant/materialProperties'] = dict('materialProperties', 'constant')
    + '// ' + A.name + ' in ' + DIE_STEEL.name + ', Kolbenspitze ' + PLUNGER.name + '\n\n'
    + 'casting\n{\n    cellZones   (gussteil feeder);\n'
    + '    rho         ' + f6(A.rho) + ';\n    rhoLiquid   ' + f6(A.rhoLiquid) + ';\n    rhoSolid    ' + f6(A.rhoSolid) + ';\n'
    + '    cp          ' + curve(A.cp) + ';\n    kappa       ' + curve(A.kappa) + ';\n    L           ' + f6(A.L) + ';\n'
    + '    solidFraction\n    {\n        type    table;\n        table   (' + A.fs.map(([t, f]) => '(' + f6(t) + ' ' + f6(f) + ')').join(' ') + ');\n    }\n'
    + '    SDAS        { A ' + f6(A.sdas[0]) + '; n ' + f6(A.sdas[1]) + '; }\n}\n\n'
    + 'dies\n{\n'
    + '    dieFixed     // feste Formhälfte: alle übrigen Zellen\n    {\n        rho         ' + f6(DIE_STEEL.rho) + ';\n        cp          ' + curve(DIE_STEEL.cp) + ';\n        kappa       ' + curve(DIE_STEEL.kappa) + ';\n    }\n'
    + '    dieMoving\n    {\n        cellZones   (dieMoving);\n        rho         ' + f6(DIE_STEEL.rho) + ';\n        cp          ' + curve(DIE_STEEL.cp) + ';\n        kappa       ' + curve(DIE_STEEL.kappa) + ';\n    }\n'
    + '    plunger\n    {\n        cellZones   (plunger);\n        rho         ' + f6(PLUNGER.rho) + ';\n        cp          ' + curve(PLUNGER.cp) + ';\n        kappa       ' + curve(PLUNGER.kappa) + ';\n    }\n'
    + '}\n';

  const contact = '{ hLiquid ' + f6(P.hLiquid) + '; hSolid ' + f6(P.hSolid) + '; fsGap (' + f6(P.fsGap) + ' 1); }';
  files[C + 'constant/heatTransferProperties'] = dict('heatTransferProperties', 'constant')
    + '// Kontakt Gussteil/Form: hoch, solange die Schmelze angepresst ist, niedrig, wenn die\n'
    + '// erstarrte Haut schwindet (Luftspalt, ab Festanteil ' + f6(P.fsGap) + ')\n'
    + 'castingDie\n{\n    dieFixed  ' + contact + '\n    dieMoving ' + contact + '\n    plunger   ' + contact + '\n}\n\n'
    + 'dieDie      { h ' + f6(P.hDieDie) + '; }\n\n'
    + 'boundaries\n{\n'
    + channels.map((c, i) => '    kanal' + (i + 1) + '      { type convective; h ' + f6(c.h) + '; Tinf ' + f6(c.T + K) + '; }   // ' + f6(c.T) + ' °C\n').join('')
    + '    plungerEnd  { type convective; h ' + f6(P.hPlunger) + '; Tinf ' + f6(P.Tplwater + K) + '; }   // Wasser im Kolben ' + f6(P.Tplwater) + ' °C\n'
    + '    outside     { type convective; h ' + f6(P.hOutside) + '; Tinf 300; }   // Außenseiten des Blocks\n}\n';

  const cycles = P.mode === 'cycles';
  const tEst = solidTimeEstimate(p);
  files[C + 'constant/processProperties'] = dict('processProperties', 'constant')
    + (P.start === 'fill' ? '' : 'fillEndTime     ' + f6(P.fillTime) + ';   // [s] Dauer der Füllung (aus einer Füllrechnung: constant/fillState)\n\n')
    + '// Nachdruck auf die Schmelze, die am Pressrest hängt [Pa]: ' + f6(P.pInt) + ' bar nach ' + f6(P.tInt * 1000) + ' ms\n'
    + 'intensificationPressure table ((0 ' + f6(Math.min(P.pInt, 50) * 1e5) + ') (' + f6(P.tInt) + ' ' + f6(P.pInt * 1e5) + ') (100000 ' + f6(P.pInt * 1e5) + '));\n\n'
    + (cycles
      ? '// ' + P.nCycles + ' Schüsse im Takt ' + f6(P.cycleTime) + ' s: Öffnen nach ' + f6(P.dieOpen) + ' s, Sprühen ' + f6(P.spray0) + ' … ' + f6(P.spray1) + ' s\n'
        + 'cycles\n{\n    nCycles         ' + P.nCycles + ';\n    cycleTime       ' + f6(P.cycleTime) + ';\n    dieOpen         ' + f6(P.dieOpen) + ';\n'
        + '    spray           (' + f6(P.spray0) + ' ' + f6(P.spray1) + ');\n'
        + '    open            { h ' + f6(P.hOpen) + '; Tinf 313; }\n    sprayCooling    { h ' + f6(P.hSpray) + '; Tinf ' + f6(P.Tspray + K) + '; }\n}\n'
      : 'stopWhenSolid   yes;\n');
  files[C + 'constant/defectProperties'] = dict('defectProperties', 'constant')
    + 'feeding\n{\n    feederZones     (feeder);   // der Pressrest: dort drückt der Kolben nach\n    fsFeeding       0.7;\n}\n\n'
    + 'microPorosity\n{\n    NyCrit          0.5;\n    pRef            1e5;\n}\n\n'
    + 'solidification\n{\n    niyamaFraction  0.1;\n}\n\n'
    + 'soldering\n{\n    Tcritical       793;\n    Q               1.5e5;\n    k0              4e-3;\n    deltaCritical   2e-6;\n}\n';

  /* ── Zeit, Lösung ── */
  const endTime = cycles ? P.nCycles * P.cycleTime : Math.max(600, 20 * tEst);
  const frameDt = Number((tEst / Math.max(20, 2 * post.frames)).toPrecision(2));
  files[C + 'system/controlDict'] = dict('controlDict', 'system')
    + 'application     ' + SOLVER + ';\n\nstartFrom       latestTime;\nstartTime       0;\nstopAt          endTime;\n'
    + 'endTime         ' + f6(endTime) + ';' + (cycles ? '' : '   // die Rechnung endet, wenn das Gussteil fest ist') + '\n\n'
    + 'deltaT          1e-4;\nwriteControl    adjustableRunTime;\nwriteInterval   ' + f6(cycles ? P.cycleTime : Math.max(1, Number((tEst / 2).toPrecision(2)))) + ';\n'
    + 'purgeWrite      ' + (cycles ? 0 : 2) + ';\nwriteFormat     binary;\nwritePrecision  7;\ntimeFormat      general;\ntimePrecision   6;\nrunTimeModifiable yes;\n\n'
    + 'adjustTimeStep  yes;\nmaxDeltaT       ' + f6(cycles ? 0.5 : Math.min(0.5, frameDt)) + ';\nmaxDeltaTemp    5;\nmaxDeltaFs      0.05;\n\n'
    + 'functions\n{\n    #include "auswertung"\n}\n';
  files[C + 'system/fvSchemes'] = dict('fvSchemes', 'system')
    + 'ddtSchemes      { default Euler; }\ngradSchemes     { default Gauss linear; }\ndivSchemes      { default none; }\n'
    + 'laplacianSchemes { default Gauss linear corrected; }\ninterpolationSchemes { default linear; }\nsnGradSchemes   { default corrected; }\n';
  files[C + 'system/fvSolution'] = dict('fvSolution', 'system')
    + 'solvers\n{\n    T\n    {\n        solver          PCG;\n        preconditioner  DIC;\n        tolerance       1e-10;\n        relTol          0;\n    }\n}\n\n'
    + 'SOLIDIFICATION\n{\n    nOuterCorrectors 30;\n    fsTolerance      1e-5;\n}\n';
  files[C + 'system/decomposeParDict'] = dict('decomposeParDict', 'system') + 'numberOfSubdomains ' + M.nProc + ';\nmethod          scotch;\n';
  files[C + 'system/setFieldsDict'] = dict('setFieldsDict', 'system')
    + 'defaultFieldValues ( volScalarFieldValue T ' + f6(P.Tdie + K) + ' );   // Form ' + f6(P.Tdie) + ' °C\n\nregions\n(\n'
    + '    zoneToCell { zones (plunger); fieldValues ( volScalarFieldValue T ' + f6(P.Tplunger + K) + ' ); }   // Kolbenspitze ' + f6(P.Tplunger) + ' °C\n'
    + '    zoneToCell { zones (gussteil feeder); fieldValues ( volScalarFieldValue T ' + f6(P.Tfill + K) + ' ); }   // Schmelze am Füllende ' + f6(P.Tfill) + ' °C\n);\n';
  files[C + '0.orig/T'] = head('volScalarField', 'T', '0')
    + 'dimensions      [0 0 0 1 0 0 0];\ninternalField   uniform ' + f6(P.Tdie + K) + ';\n\nboundaryField\n{\n    ".*"    { type zeroGradient; }\n}\n';

  /* ── Auswertung während der Rechnung: Restschmelze und Gussteil als Flächen ── */
  files[C + 'system/auswertung'] = dict('auswertung', 'system')
    + '// Für die Bilder der Erstarrungsfolge: die Restschmelze (Festanteil 0,7 = nicht mehr\n'
    + '// speisbar) als Isofläche im Gussteil, alle ' + f6(frameDt) + ' s; die Oberfläche des Gussteils\n'
    + '// einmal. bilder.py und bericht.py im Hauptordner machen daraus Bilder und Bericht.\n'
    + '    erstarrung\n    {\n        type            surfaces;\n        libs            (sampling);\n'
    + '        writeControl    adjustableRunTime;\n        writeInterval   ' + f6(frameDt) + ';\n'
    + (cycles ? '        timeEnd         ' + f6(P.cycleTime) + ';   // der erste Schuss\n' : '')
    + '        surfaceFormat   ensight;\n        formatOptions   { ensight { format binary; collateTimes true; } }\n'
    + '        fields          (solidFraction feedingState T);\n'
    + '        surfaces\n        {\n'
    + '            restschmelze { type isoSurface; isoField solidFraction; isoValue 0.7; isoMethod topo; zones (gussteil feeder); interpolate false; }\n'
    + '        }\n    }\n'
    + '    gussteil\n    {\n        type            surfaces;\n        libs            (sampling);\n        writeControl    onEnd;\n'
    + '        surfaceFormat   ensight;\n        formatOptions   { ensight { format binary; } }\n'
    + '        fields          (solidificationTime porosity dieSurfaceTmax solderingIndex T);\n'
    + '        surfaces\n        {\n            oberflaeche { type faceZone; zones (casting); interpolate false; }\n        }\n    }\n';

  /* ── Hauptordner ── */
  const conf = {
    title: p.title || 'Erstarrung', solver: SOLVER,
    post, frameDt, tEst, cycles, nCycles: cycles ? P.nCycles : 1, cycleTime: P.cycleTime, dieOpen: P.dieOpen,
    alloy: A.name, Tliq: A.fs[0][0] - K, Tsol: A.fs[A.fs.length - 1][0] - K, Tfill: P.Tfill, Tdie: P.Tdie,
    pInt: P.pInt, fillTime: P.fillTime, start: P.start,
    block: { lo, hi, cells: n, hCast, hBg, parting: zp, fixedBelow: blk.fixedBelow },
    plunger: { centroid: pl.centroid, normal: nOut, radius: pl.radius, length: blk.plungerLength },
    channels: channels.map((c, i) => ({ name: 'kanal' + (i + 1), a: c.a, b: c.b, d: c.d, T: c.T, h: c.h })),
    volume: p.bodies.reduce((s, b) => s + Math.abs(volume(b.tris)), 0) / 1000,
    views: (post.views || ['iso']).map(id => VIEW_PRESETS.find(v => v.id === id)).filter(Boolean).map(v => ({ id: v.id, label: v.label, dir: v.dir, up: v.up })),
    heat: p.colors ? p.colors.heat : null,       // [[t, r, g, b]] 0…1, die Leiste heat der Palette
    maps: p.colors ? p.colors.maps : null,       // je Kriterium: Vorgabe von ParaView und Stützstellen
    colors: p.colors ? p.colors.colors : null    // Rollen der Palette als [r, g, b]
  };
  const vCast = conf.volume;
  const vBlock = n.reduce((s, x) => s * x, 1) * hBg * hBg * hBg / 1000;
  const cells = Math.round(vCast * 1000 / (hCast ** 3) * 1.15 + (vBlock - vCast) * 1000 / (hBg ** 3)
    + castArea(castTris) * band / (hCast ** 3));
  files['auswertung.json'] = JSON.stringify(conf, null, 1);
  files['bilder.py'] = SOL_BILDER_PY;
  files['bericht.py'] = SOL_BERICHT_PY;
  files['Allrun'] = allrun(M.nProc, channels.length, P.start === 'fill' ? P.fillCase : '', vCast);
  files['Allclean'] = '#!/bin/sh\n# alles Gerechnete löschen: Netz, Zeitstände, Auswertung\ncd "${0%/*}" || exit\n'
    + '(cd simulation && . ${WM_PROJECT_DIR:?}/bin/tools/CleanFunctions && cleanCase0 && rm -rf constant/polyMesh constant/fillState)\nrm -rf auswertung\n';
  files['README.md'] = readme(p, { cells, tEst, endTime, P, M, A, blk, channels, cycles });
  return { files, info: { cells, tEst, endTime, frameDt, block: { lo, hi, n, hBg }, plungerLength: blk.plungerLength, channels: channels.length } };
}

function castArea(t) {
  let a = 0;
  for (let i = 0; i < t.length; i += 9) {
    const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2];
    a += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2;
  }
  return a;
}

function allrun(nProc, nChannels, fillCase, vCast) {
  return `#!/bin/sh
# Erstarrung mit ${SOLVER} (DieLogic), erzeugt von DieLogic · Erstarrungssimulation.
#   ./Allrun              Netz, Rechnung (NP Prozesse), Auswertung
#   NP=8 ./Allrun         mit 8 Prozessen
#   ./Allrun -mesh        nur das Netz (danach simulation/log.checkMesh ansehen)
#   ./Allrun -auswertung  nur die Auswertung: Bilder (pvbatch bilder.py) und Bericht (python3 bericht.py)
#   FUELLUNG=../../2026-10-12_Platte/simulation ./Allrun
#                         den Zustand am Ende einer Füllrechnung (dieLogicFoam, „Simulation
#                         einrichten") übernehmen statt gleichmäßig warmer Schmelze; der Pfad
#                         gilt von simulation/ aus
# simulation/ ist der OpenFOAM-Fall, auswertung/ entsteht am Ende (bericht.html, bilder, graphiken, daten).
# Braucht OpenFOAM v2606 (openfoam.com), ${SOLVER} und dieLogicSolMapFill aus dieLogicSol/solvers
# (Allwmake), für die Bilder ParaView (pvbatch), für den Bericht Python 3 mit numpy und matplotlib.
cd "\${0%/*}" || exit
HAUPT=$PWD
FUELLUNG=\${FUELLUNG:-${fillCase}}

auswertung() {
    cd "$HAUPT" || exit
    mkdir -p auswertung
    if command -v pvbatch >/dev/null 2>&1
    then
        echo "Bilder: pvbatch bilder.py"
        pvbatch bilder.py > auswertung/log.bilder 2>&1 || echo "bilder.py ist gescheitert: auswertung/log.bilder" >&2
    else
        echo "pvbatch nicht gefunden: ohne Bilder (nachholen mit 'pvbatch bilder.py')."
    fi
    python3 bericht.py > auswertung/log.bericht 2>&1 || { echo "bericht.py ist gescheitert: auswertung/log.bericht" >&2; return 1; }
    echo "Bericht: $HAUPT/auswertung/bericht.html"
}
[ "$1" = "-auswertung" ] && { auswertung; exit $?; }

cd simulation || exit
. \${WM_PROJECT_DIR:?}/bin/tools/RunFunctions

command -v ${SOLVER} >/dev/null 2>&1 || {
    echo "${SOLVER} nicht gefunden: dieLogicSol/solvers/Allwmake bauen und OpenFOAM v2606 laden." >&2
    exit 1
}

if [ -d processor0 ] && [ -f constant/polyMesh/owner ]
then
    NP=$(ls -d processor[0-9]* | wc -l)
    echo "weiter auf $NP Prozessen"
else
    NP=\${NP:-${nProc}}
fi
sed -i "s/^numberOfSubdomains .*/numberOfSubdomains $NP;/" system/decomposeParDict

# ── Netz: Formblock, Gussteil (cellZone gussteil), Kühlkanäle, Kolben, Formhälften ──
if [ ! -f constant/polyMesh/owner ]
then
    runApplication surfaceFeatureExtract
    runApplication blockMesh
    if [ "$NP" -gt 1 ]
    then
        # snappyHexMesh auf NP Prozessen, danach wieder ein Netz
        rm -rf processor[0-9]*
        runApplication -s mesh decomposePar
        mpirun --bind-to none -n "$NP" snappyHexMesh -parallel -overwrite > log.snappyHexMesh 2>&1
        runApplication reconstructParMesh -constant
        rm -rf processor[0-9]*
    else
        runApplication snappyHexMesh -overwrite
    fi
    if grep -q "FOAM FATAL" log.snappyHexMesh
    then
        echo "snappyHexMesh ist gescheitert, siehe simulation/log.snappyHexMesh." >&2
        rm -rf constant/polyMesh
        exit 1
    fi
    grep -qw gussteil constant/polyMesh/cellZones 2>/dev/null || {
        echo "Das Gussteil fehlt im Netz (cellZone gussteil): seine Oberfläche ist nicht dicht," >&2
        echo "oder der Punkt im Pressrest liegt außerhalb. Siehe simulation/log.snappyHexMesh." >&2
        rm -rf constant/polyMesh
        exit 1
    }
    for k in $(seq 1 ${nChannels})
    do
        grep -qw "kanal$k" constant/polyMesh/boundary || echo "Kühlkanal $k fehlt im Netz: liegt er außerhalb des Formblocks?" >&2
    done
    runApplication topoSet
    runApplication createPatch -overwrite
    runApplication checkMesh
fi
[ "$1" = "-mesh" ] && { echo "Netz fertig."; exit 0; }

# ── Anfangswerte ────────────────────────────────────────────────────
if [ ! -f log.setFields ]
then
    restore0Dir
    runApplication setFields
    if [ -n "$FUELLUNG" ]
    then
        # der Zustand am Füllende aus der Füllrechnung: Temperatur, Luft, Füllzeit, Oxid
        sed -i '/^fillEndTime/d' constant/processProperties
        runApplication dieLogicSolMapFill -source "$FUELLUNG" -entrainedAirScale 0.01 || {
            echo "Die Füllrechnung $FUELLUNG ließ sich nicht übernehmen: simulation/log.dieLogicSolMapFill" >&2
            exit 1
        }
    fi
fi
[ "$NP" -gt 1 ] && [ ! -d processor0 ] && runApplication decomposePar

# ── Rechnung ────────────────────────────────────────────────────────
if ! tail -n 5 log.${SOLVER} 2>/dev/null | grep -qx "End"
then
    if [ "$NP" -gt 1 ]
    then
        mpirun --bind-to none -n "$NP" ${SOLVER} -parallel >> log.${SOLVER} 2>&1
    else
        ${SOLVER} >> log.${SOLVER} 2>&1
    fi
fi
tail -n 5 log.${SOLVER} | grep -qx "End" || { echo "${SOLVER} ist nicht bis zum Ende gelaufen: simulation/log.${SOLVER}" >&2; exit 1; }
[ "$NP" -gt 1 ] && runApplication -o reconstructPar -latestTime
# Modellvolumen ${vCast.toFixed(2)} cm³
# ── Auswertung ──────────────────────────────────────────────────────
auswertung
`;
}

function readme(p, { cells, tEst, endTime, P, M, A, blk, channels, cycles }) {
  const fmt = (x, d = 0) => Number(x).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d });
  return `# ${p.title || 'Erstarrung'} — Erstarrung mit ${SOLVER}

Erzeugt von DieLogic · Erstarrungssimulation (/tools/erstarrung/).

    ./Allrun                      Netz, Rechnung, Auswertung
    NP=8 ./Allrun                 mit 8 Prozessen
    FUELLUNG=<pfad> ./Allrun      Zustand am Füllende aus einer Füllrechnung (dieLogicFoam)
    ./Allrun -auswertung          nur Bilder und Bericht

Am Ende: \`auswertung/bericht.html\`.

## Was gerechnet wird

- Gussteil: ${p.bodies.map(b => b.name).join(', ')} — ${A.name}, ${P.start === 'fill' ? 'Zustand am Füllende aus der Füllrechnung' : 'am Füllende ' + fmt(P.Tfill) + ' °C, Füllung ' + fmt(P.fillTime * 1000) + ' ms'}
- Form: Block ${blk.n.map((x, k) => fmt(blk.hi[k] - blk.lo[k])).join(' × ')} mm aus 1.2343, ${fmt(P.Tdie)} °C, Trennebene z = ${fmt(blk.parting, 1)} mm,
  feste Hälfte ${blk.fixedBelow ? 'unten' : 'oben'} (Seite des Kolbens)
- Kolbenspitze CuCoBe Ø ${fmt(2 * p.plunger.radius, 1)} mm, ${fmt(blk.plungerLength)} mm lang, Wasser ${fmt(P.Tplwater)} °C
- Kühlkanäle: ${channels.length ? channels.map((c, i) => 'kanal' + (i + 1) + ' Ø ' + fmt(c.d, 1) + ' mm, ' + fmt(c.T) + ' °C') .join('; ') : 'keine'}
- Nachdruck ${fmt(P.pInt)} bar nach ${fmt(P.tInt * 1000)} ms
- ${cycles ? P.nCycles + ' Schüsse im Takt ' + fmt(P.cycleTime) + ' s (Öffnen ' + fmt(P.dieOpen) + ' s, Sprühen ' + fmt(P.spray0) + '–' + fmt(P.spray1) + ' s)' : 'ein Schuss bis das Gussteil fest ist (geschätzt ' + fmt(tEst / 2, 0) + ' s, höchstens ' + fmt(endTime) + ' s)'}
- Netz: Gussteil ${fmt(M.cell, 2)} mm, Form ${fmt(blk.hBg, 2)} mm, rund ${fmt(cells)} Zellen

## Ordner

    Allrun, Allclean          Ablauf
    bilder.py                 Bilder (pvbatch) aus simulation/postProcessing und dem letzten Zeitstand
    bericht.py                Graphiken, Daten, bericht.html (Python 3, numpy, matplotlib)
    auswertung.json           was die beiden wissen müssen
    simulation/               der OpenFOAM-Fall
    auswertung/               entsteht am Ende

## Grenzen

Die Modellkonstanten (Kontakt, Speisung, Niyama, Kleben) sind Werte in der
Größenordnung der Literatur, nicht an Gussteilen kalibriert: zum Vergleich
von Formen und Prozessvarianten. Nach der Füllung nur Wärmeleitung.
`;
}
