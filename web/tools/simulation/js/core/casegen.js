/* Der OpenFOAM-Fall für dieLogicFoam (DieLogic_OF/solvers/dieLogicFoam,
   OpenFOAM v2606 von openfoam.com): aus den Flächen der Vereinigung
   (geometry.js unionSurfaces), dem Einlass, den Auslässen, dem Netz, dem
   Prozess und der Auswertung jede Datei des Falls als Text oder Bytes.

   Vorbild sind die Validierungsfälle (cases_manual_check/trometer2023:
   snappyHexMesh aus STL; cases/dieFill/plateCore2D: Temperatur und
   Erstarrung). Der Fall rechnet ab „Kammer voll": der Pressrest ist voll
   Schmelze (Zylinder um die Einlassfläche, setFields), der Kolben drückt
   über die Einlassfläche mit der Kolbengeschwindigkeit nach.

   Die Netze kommen als binäre STL in Metern, je Randfläche eine Datei
   (walls, inlet, vent1 …) — so heißt jede Datei wie ihr Patch, und es
   braucht keine ASCII-STL mit benannten Teilen. Was im Innern der
   Vereinigung liegt (Überlappungen, Anschnitte), steht in internal.stl:
   nur ein Verfeinerungsbereich (Abstand), keine Fläche im Netz.

   Reine Rechnung, kein DOM: der Browser lädt den Fall als ZIP herunter,
   die Tests schreiben ihn auf die Platte und lassen ihn laufen. */

import { writeSTL } from '../../../3d-studio/js/part/stlio.js';
import { bounds, volume, shells, edgeCheck } from './geometry.js';
import { renderScript, imageCount } from './render.js';

export const SOLVER = 'dieLogicFoam';
const K = 273.15;

/* Vorgaben, gegen die die Seite ihre Eingaben prüft */
export const DEFAULTS = {
  mesh: { cell: 2, level: 0, nProc: 4 },
  process: {
    vStart: 0.5, v2: 4, tRamp: 0.005,
    Tcast: 660, Tdie: 200, hDie: 2e4, gravity: '-y',
    rho: 2420, mu: 1.3e-3, cp: 1056, kappa: 100, hf: 403, Tliq: 593, Tsol: 521, sigma: 0.9,
    pAmb: 1e5
  }
};

/* ── Hilfen ───────────────────────────────────────────────────────── */
const f6 = x => (Math.abs(x) < 1e-12 ? '0' : Number(x.toPrecision(8)).toString());
const vec = v => '(' + v.map(f6).join(' ') + ')';
const head = (cls, obj, loc) => 'FoamFile\n{\n    version     2.0;\n    format      ascii;\n    class       ' + cls + ';\n'
  + (loc ? '    location    "' + loc + '";\n' : '') + '    object      ' + obj + ';\n}\n'
  + '// Erzeugt von DieLogic · Simulation einrichten (/tools/simulation/)\n\n';
const dict = (obj, loc) => head('dictionary', obj, loc);
const toM = (t, s = 1e-3) => { const o = new Float32Array(t.length); for (let i = 0; i < t.length; i++) o[i] = t[i] * s; return o; };
const GRAV = { '-x': [-9.81, 0, 0], '+x': [9.81, 0, 0], '-y': [0, -9.81, 0], '+y': [0, 9.81, 0], '-z': [0, 0, -9.81], '+z': [0, 0, 9.81], aus: [0, 0, 0] };

/** Patchname des Auslasses i (0-basiert). Der Solver erkennt Entlüftungen
    an ihrem Namen in constant/gasProperties; die Wärmeabgabe gilt für
    "(walls|vent.*)". */
export const ventName = i => 'vent' + (i + 1);

/**
 * Plan prüfen: was fehlt noch? → Liste von Sätzen (leer = bereit).
 */
export function missing(plan) {
  const m = [];
  if (!plan.bodies || !plan.bodies.length) m.push('Es ist noch kein Körper geladen.');
  if (!plan.inlet) m.push('Der Einlass ist noch nicht gewählt.');
  if (!plan.outlets || !plan.outlets.length) m.push('Es ist noch kein Auslass gewählt.');
  if (!(plan.mesh && plan.mesh.cell > 0)) m.push('Die Zellgröße fehlt.');
  return m;
}

/**
 * Den Fall schreiben.
 * @param plan {
 *   title, union: { patches: Map(label → tris mm), internal: tris mm },
 *   bodies: [{ name, tris }] (geschlossen, mm — Ausdehnung, Verfeinerung),
 *   inlet: { centroid, normal (nach außen), radius, depth, area },
 *   outlets: [{ centroid, area, mode: 'open' | 'orifice', Cd }],
 *   mesh: { cell mm, level, nProc }, process: {...DEFAULTS.process},
 *   post: { images, views, size } (render.js)
 * }
 * → { files: { path: string | Uint8Array }, info: { cells, fillTime, endTime } }
 */
export function buildCase(plan) {
  const miss = missing(plan);
  if (miss.length) throw new Error(miss.join(' '));
  const P = Object.assign({}, DEFAULTS.process, plan.process || {});
  const M = Object.assign({}, DEFAULTS.mesh, plan.mesh || {});
  const files = {};
  const outlets = plan.outlets;
  const names = ['walls', 'inlet', ...outlets.map((_, i) => ventName(i))];

  /* ── Geometrie ── */
  const all = plan.bodies.map(b => b.tris);
  const bb = all.map(bounds).reduce((a, b) => ({ lo: a.lo.map((x, k) => Math.min(x, b.lo[k])), hi: a.hi.map((x, k) => Math.max(x, b.hi[k])) }));
  const hSurf = M.cell, level = Math.max(0, Math.round(M.level || 0));
  /* Dünne Körper (Überläufe, Entlüftungskanäle) dürfen feiner werden:
     extra Stufen nur in ihrem Innern (refinementRegions, mode inside). */
  const extra = plan.bodies.map(b => Math.max(0, Math.round(b.extra || 0)));
  const refine = level > 0 || extra.some(x => x > 0);
  const hBg = hSurf * Math.pow(2, level);
  const pad = 2 * hBg;
  /* Der Hintergrund krumm versetzt: CAD-Flächen liegen auf runden Werten
     (die Trennebene z = 0), und eine Zellmitte genau auf einer Fläche lässt
     snappyHexMesh an ihr vorbei ins Freie laufen. Versatz = krummer
     Bruchteil der feinsten Zelle, auf jeder Achse ein anderer. */
  const shift = [0.2317, 0.3141, 0.1789].map(f => f * hSurf);
  const lo = bb.lo.map((x, k) => Math.floor((x - pad) / hSurf) * hSurf - shift[k]);
  const n = bb.hi.map((x, k) => Math.max(1, Math.ceil((x + pad - lo[k]) / hBg)));
  const hi = lo.map((x, k) => x + n[k] * hBg);
  const patchTris = label => plan.union.patches.get(label) || new Float64Array(0);
  for (let i = 0; i < names.length; i++) {
    const t = patchTris(i);
    if (!t.length) throw new Error('Die Fläche „' + names[i] + '" ist leer — liegt sie im Innern eines anderen Körpers?');
    files['constant/triSurface/' + names[i] + '.stl'] = new Uint8Array(writeSTL(toM(t), 'DieLogic ' + names[i]));
  }
  const hasInternal = plan.union.internal && plan.union.internal.length > 0;
  if (hasInternal) files['constant/triSurface/internal.stl'] = new Uint8Array(writeSTL(toM(plan.union.internal), 'DieLogic internal'));
  /* Verfeinerungsbereiche je SCHALE: ein Körper aus mehreren geschlossenen,
     sich durchdringenden Schalen (der Anguss des Designers) ist für
     snappyHexMesh „nicht geschlossen" — seine Schalen sind es. Geschlossene
     Schalen verfeinern innen, offene im Abstand der halben Wand. */
  const regions = [];
  if (refine) plan.bodies.forEach((b, i) => {
    const parts = shells(b.tris).filter(p => p.length >= 4);
    (parts.length ? parts : [null]).forEach((p, k) => {
      let tris = b.tris;
      if (p) { tris = new Float64Array(p.length * 9); p.forEach((f, j) => tris.set(b.tris.subarray(f * 9, f * 9 + 9), j * 9)); }
      const name = 'body' + (i + 1) + (parts.length > 1 ? '_' + (k + 1) : '');
      const closed = edgeCheck(tris).closed;
      files['constant/triSurface/' + name + '.stl'] = new Uint8Array(writeSTL(toM(tris), 'DieLogic ' + b.name));
      regions.push({ name, body: b, i, closed, reach: b.reach > 0 ? b.reach : 2 * hSurf });
    });
  });

  /* Zellen grob: Volumen der Körper (Überlappungen doppelt) durch h³ */
  const vol = plan.bodies.reduce((s, b) => s + Math.abs(volume(b.tris)), 0);
  const cells = Math.round(plan.bodies.reduce((s, b, i) => s + Math.abs(volume(b.tris)) * Math.pow(8, extra[i]), 0) / (hSurf * hSurf * hSurf));

  /* Ein Punkt sicher in der Schmelze: im Pressrest hinter der Einlassfläche,
     nicht auf einer Zellfläche (krumme Bruchteile der Zelle). */
  const inl = plan.inlet, nIn = inl.normal.map(x => -x);
  const depth = inl.depth > 0 ? inl.depth : 2 * hSurf;
  const into = Math.min(depth / 2, Math.max(3 * hSurf, depth / 3));
  const perp = perpTo(nIn);
  const loc = inl.centroid.map((c, k) => c + nIn[k] * into + perp[k] * 0.137 * hSurf * 1.31 + 0.0731 * hSurf);

  files['system/blockMeshDict'] = dict('blockMeshDict', 'system')
    + 'scale 0.001;    // Koordinaten in mm\n\n'
    + 'vertices\n(\n'
    + [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
      .map(s => '    ' + vec(s.map((v, k) => (v ? hi[k] : lo[k])))).join('\n')
    + '\n);\n\nblocks ( hex (0 1 2 3 4 5 6 7) ' + vec(n) + ' simpleGrading (1 1 1) );\n\n'
    + 'boundary ( background { type patch; faces ( (0 3 2 1) (4 5 6 7) (0 1 5 4) (2 3 7 6) (0 4 7 3) (1 2 6 5) ); } );\n';

  const lv = '(' + level + ' ' + level + ')';
  const patchType = name => (name.startsWith('vent') ? 'patch' : 'wall');
  files['system/snappyHexMeshDict'] = dict('snappyHexMeshDict', 'system')
    + 'castellatedMesh true;\nsnap            true;\naddLayers       false;\n\n'
    + 'geometry\n{\n'
    + names.map(nm => '    ' + nm + ' { type triSurfaceMesh; file "' + nm + '.stl"; }\n').join('')
    + (hasInternal ? '    internal { type triSurfaceMesh; file "internal.stl"; }\n' : '')
    + regions.map(r => '    ' + r.name + ' { type triSurfaceMesh; file "' + r.name + '.stl"; }   // ' + r.body.name + '\n').join('')
    + '}\n\n'
    + 'castellatedMeshControls\n{\n'
    + '    maxLocalCells       5000000;\n    maxGlobalCells      50000000;\n    minRefinementCells  0;\n'
    + '    maxLoadUnbalance    0.10;\n    nCellsBetweenLevels 2;\n'
    + '    features\n    (\n' + names.map(nm => '        { file "' + nm + '.eMesh"; level ' + level + '; }\n').join('') + '    );\n'
    + '    refinementSurfaces\n    {\n'
    + names.map(nm => '        ' + nm + ' { level ' + lv + '; patchInfo { type ' + patchType(nm) + '; } }\n').join('')
    + '    }\n'
    + '    resolveFeatureAngle 30;\n'
    + '    refinementRegions\n    {\n'
    /* Überlappungen und Anschnitte: fein wie die Wand, aber keine Fläche.
       Als faceZone schnappte snappyHexMesh Zellen auf jede innere Fläche —
       wo zwei davon nah beieinander liegen (Ende des Angusses 1 mm im
       Pressrest, Abzweig überlappender Kanäle), entstanden Zellscheiben
       (im U-Profil Courant-Faktor ½·Σ|A|/V bis 45/mm statt höchstens 19). */
    + (hasInternal ? '        internal { mode distance; levels ((' + f6(hSurf * 1e-3) + ' ' + level + ')); }   // Überlappungen und Anschnitte: innen, trennt nichts\n' : '')
    + regions.map(r => '        ' + r.name + (r.closed
        ? ' { mode inside; levels ((1e15 ' + (level + extra[r.i]) + ')); }'
        /* offen: im Abstand der halben Wand statt „innen" */
        : ' { mode distance; levels ((' + f6(r.reach * 1e-3) + ' ' + (level + extra[r.i]) + ')); }')
      + (extra[r.i] || !r.closed ? '   // ' + r.body.name + (extra[r.i] ? ': ' + extra[r.i] + ' Stufe(n) feiner, ' + f6(hSurf / Math.pow(2, extra[r.i])) + ' mm' : '')
        + (!r.closed ? ' (offen)' : '') : '') + '\n').join('')
    + '    }\n'
    + '    locationInMesh ' + vec(loc.map(x => x * 1e-3)) + ';   // im Pressrest hinter dem Einlass\n'
    /* Ein Punkt, der draußen bleiben muss: hat die Wand ein Loch, bricht
       snappyHexMesh ab und schreibt den Weg der Leckage (leakPath). */
    + '    locationsOutsideMesh (' + vec(lo.map((x, k) => (x + hBg * (0.5 + 0.137 * (k + 1))) * 1e-3)) + ');\n'
    + '    allowFreeStandingZoneFaces false;\n}\n\n'
    + 'snapControls\n{\n    nSmoothPatch    3;\n    tolerance       2.0;\n    nSolveIter      50;\n    nRelaxIter      5;\n'
    + '    nFeatureSnapIter 10;\n    implicitFeatureSnap  false;\n    explicitFeatureSnap  true;\n    multiRegionFeatureSnap true;\n}\n\n'
    + 'addLayersControls\n{\n    relativeSizes true;\n    layers {}\n    expansionRatio 1.2;\n    finalLayerThickness 0.4;\n'
    + '    minThickness 0.1;\n    nGrow 0;\n    featureAngle 60;\n    nRelaxIter 3;\n    nSmoothSurfaceNormals 1;\n'
    + '    nSmoothNormals 3;\n    nSmoothThickness 10;\n    maxFaceThicknessRatio 0.5;\n    maxThicknessToMedialRatio 0.3;\n'
    + '    minMedialAxisAngle 90;\n    nBufferCellsNoExtrude 0;\n    nLayerIter 50;\n}\n\n'
    + 'meshQualityControls { #include "meshQualityDict" }\n\nmergeTolerance 1e-6;\n';

  files['system/surfaceFeatureExtractDict'] = dict('surfaceFeatureExtractDict', 'system')
    + names.map(nm => nm + '.stl\n{\n    extractionMethod    extractFromSurface;\n    includedAngle       150;\n'
      + '    subsetFeatures { nonManifoldEdges no; openEdges yes; }\n    writeObj            no;\n}\n').join('\n');
  files['system/meshQualityDict'] = dict('meshQualityDict', 'system') + '#includeEtc "caseDicts/mesh/generation/meshQualityDict.cfg"\n';

  /* ── Prozess: Schusskurve, Zeiten ── */
  const g = GRAV[P.gravity] || GRAV['-y'];
  const nu = P.mu / P.rho;
  const SH = plan.shot && plan.shot.points ? plan.shot : null;
  const chamber = !!(SH && SH.chamber);
  const nWrite = Math.max(60, 4 * imageCount(plan.post));
  let tFill, endTime, writeInterval, tSwitch = 0, slowInterval = 0;
  if (SH) {
    tFill = Math.max(SH.tEnd - SH.tFull, 1e-3);                     // „Kammer voll" → Füllende [s]
    /* Die Schmelze folgt dem Kolben (die Drosseln halten sie zurück): nach
       dem Füllende der Kurve wird nur noch eingeschlossene Luft verdichtet —
       ein Viertel der Füllzeit Spiel genügt; stopAtFill endet meist früher */
    if (chamber) {
      endTime = SH.tEnd + 0.25 * tFill;
      tSwitch = Math.max(0, SH.tFull - 0.1 * tFill);
      slowInterval = Math.max(tSwitch / 10, 1e-3);
    } else {
      endTime = 1.25 * tFill;
    }
  } else {
    /* ohne Kurve (alte Aufrufe): Rampe vStart → v2 */
    const Ain = (inl.area || Math.PI * inl.radius * inl.radius) * 1e-6;
    const Vin = Math.PI * inl.radius * inl.radius * depth * 1e-9;
    const Vform = Math.max(vol * 1e-9 - Vin, vol * 1e-9 * 0.2);
    tFill = P.tRamp / 2 + Vform / (Ain * P.v2);
    endTime = 2 * tFill + P.tRamp;
  }
  endTime = Number(endTime.toPrecision(3));
  writeInterval = Number((tFill / nWrite).toPrecision(2));

  if (!chamber) {
    const table = SH ? SH.inletTable.concat([[Math.max(10, 10 * endTime), SH.inletTable[SH.inletTable.length - 1][1]]])
      : [[0, P.vStart], [P.tRamp, P.v2], [Math.max(10, 10 * endTime), P.v2]];
    files['constant/plungerTable'] = '// t [s]   U [m/s]: Kolbengeschwindigkeit ab „Kammer voll", in Richtung Einlassnormale nach innen\n'
      + (SH ? '// Schusskurve ' + (SH.mode || '') + ' ab „Kammer voll" (Kurvenzeit ' + f6(SH.tFull * 1000) + ' ms, Kolbenweg ' + f6(SH.sFull) + ' mm); zwischen den Zeilen linear\n'
        : '// Rampe von ' + f6(P.vStart) + ' auf ' + f6(P.v2) + ' m/s in ' + f6(P.tRamp * 1000) + ' ms, dann konstant\n')
      + table.map(([t, v]) => '(' + f6(t) + ' ' + vec(nIn.map(x => x * v)) + ')').join('\n') + '\n';
  }

  const control = (interval, maxDt, extra = '') => dict('controlDict', 'system')
    + 'application     ' + SOLVER + ';\nstartFrom       latestTime;\nstartTime       0;\nstopAt          endTime;\n'
    + 'endTime         ' + f6(endTime) + ';    // Füllende nach der Kurve ' + f6((chamber ? SH.tEnd : tFill) * 1000) + ' ms; stopAtFill beendet früher\n'
    + 'deltaT          1e-6;\nwriteControl    adjustable;\nwriteInterval   ' + f6(interval) + ';\npurgeWrite      0;\n'
    + 'writeFormat     binary;\nwritePrecision  8;\ntimeFormat      general;\ntimePrecision   6;\nrunTimeModifiable yes;\n'
    + 'adjustTimeStep  yes;\nmaxCo           0.8;\nmaxAlphaCo      0.5;\nmaxDeltaT       ' + f6(maxDt) + ';\n'
    + 'stopAtFill      0.995;   // Schmelzeanteil des ganzen (bei Kammer: des verdichteten) Gebiets\n' + extra;
  if (chamber) {
    /* Langsame Phase: nur Neustartpunkte; ab kurz vor „Kammer voll" so oft
       wie für die Bilder nötig (timeActivatedFileUpdate wie bei Niida). */
    const phase = 'functions\n{\n    shotPhase\n    {\n        type            timeActivatedFileUpdate;\n        libs            (utilityFunctionObjects);\n'
      + '        fileToUpdate    "<system>/controlDict";\n        timeVsFile\n        (\n            (-1 "<system>/controlDict.slow")\n'
      + '            (' + f6(tSwitch) + ' "<system>/controlDict.shot")\n        );\n    }\n}\n';
    files['system/controlDict.slow'] = control(slowInterval, Math.max(slowInterval / 4, 1e-4), phase);
    files['system/controlDict.shot'] = control(writeInterval, 1e-4, phase);
    files['system/controlDict'] = files['system/controlDict.slow'];
  } else {
    files['system/controlDict'] = control(writeInterval, 1e-4);
  }
  files['system/fvSchemes'] = dict('fvSchemes', 'system')
    + 'ddtSchemes      { default Euler; }\ngradSchemes     { default Gauss linear; }\n'
    + 'divSchemes\n{\n    default         none;\n    div(phi,U)      Gauss linearUpwind grad(U);\n'
    + '    div((nuEff*dev2(T(grad(U))))) Gauss linear;\n    div(alphaPhi,T) Gauss upwind;\n    div(alphaPhi,inclusion) Gauss upwind;\n}\n'
    + 'laplacianSchemes { default Gauss linear corrected; }\ninterpolationSchemes { default linear; }\nsnGradSchemes   { default corrected; }\n';

  files['system/fvSolution'] = dict('fvSolution', 'system')
    + 'solvers\n{\n    "alpha.melt.*"\n    {\n        reconstructionScheme plicRDF;\n        nAlphaSubCycles 1;\n        cAlpha          1;\n'
    + '        isoFaceTol      1e-8;\n        surfCellTol     1e-8;\n        nAlphaBounds    3;\n        snapTol         0;\n'
    + '        clip            false;\n        nOverfillPasses 20;\n        nVoidLayers     2;\n'
    /* wie in den Validierungsfällen (Niida 2–5); im Solver ist es aus */
    + '        wallFilmFriction true;  // dünne Filme an der Wand: Schub eines laminaren Films\n'
    + '        thetaMin        0.5;\n    }\n'
    + '    p_rgh { solver GAMG; smoother DIC; tolerance 1e-7; relTol 0.01; }\n'
    + '    p_rghFinal { solver GAMG; smoother DIC; tolerance 1e-7; relTol 0; }\n'
    + '    T { solver PBiCGStab; preconditioner DILU; tolerance 1e-8; relTol 0; }\n'
    + '    inclusions { solver PBiCGStab; preconditioner DILU; tolerance 1e-10; relTol 0; }\n'
    + '    "U.*" { solver smoothSolver; smoother symGaussSeidel; tolerance 1e-8; relTol 0; }\n}\n\n'
    + 'PIMPLE\n{\n    momentumPredictor yes;\n    nOuterCorrectors  1;\n    nCorrectors       3;\n    nNonOrthogonalCorrectors 0;\n}\n\n'
    + 'cache { grad(U); }\n';

  files['system/decomposeParDict'] = dict('decomposeParDict', 'system')
    + 'numberOfSubdomains ' + M.nProc + ';    // Allrun setzt NP\nmethod          scotch;\n';

  /* Die Schmelze zu Beginn. Ohne Kammer: der Pressrest voll — ein Zylinder
     etwas größer als er (eine halbe Zelle rundum), damit keine Zelle am
     Rand leer bleibt. Mit Kammer: die Schmelze liegt in Kammer und
     Pressrest unter einer waagerechten Ebene (Füllgrad φ), außerhalb des
     Kammerzylinders ist nichts. */
  const R = inl.radius, pad1 = 0.5 * hSurf;
  if (!chamber) {
    const p1 = inl.centroid.map((c, k) => (c + inl.normal[k] * pad1) * 1e-3);
    const p2 = inl.centroid.map((c, k) => (c + nIn[k] * (depth + pad1)) * 1e-3);
    files['system/setFieldsDict'] = dict('setFieldsDict', 'system')
      + 'defaultFieldValues ( volScalarFieldValue alpha.melt 0 );\n\n'
      + 'regions\n(\n    // Pressrest bei „Kammer voll": Zylinder Ø ' + f6(2 * (R + pad1)) + ' mm (Pressrest Ø ' + f6(2 * R) + ' mm), ' + f6(depth + 2 * pad1) + ' mm lang\n'
      + '    cylinderToCell\n    {\n        p1     ' + vec(p1) + ';\n        p2     ' + vec(p2) + ';\n'
      + '        radius ' + f6((R + pad1) * 1e-3) + ';\n'
      + '        fieldValues ( volScalarFieldValue alpha.melt 1 );\n    }\n);\n';
  } else {
    const gl = Math.hypot(...g);
    if (!(gl > 0)) throw new Error('Mit Kammer braucht die Rechnung Schwerkraft: die Schmelze liegt in der Kammer.');
    const gh = g.map(x => x / gl);
    const ga = gh[0] * nIn[0] + gh[1] * nIn[1] + gh[2] * nIn[2];
    if (Math.abs(ga) > 0.2) throw new Error('Mit Kammer muss die Kolbenachse waagerecht liegen (quer zur Schwerkraft).');
    const up = gh.map((x, k) => -(x - ga * nIn[k]));
    const ul = Math.hypot(...up);
    const phi = Math.min(0.98, Math.max(0.02, SH.phi));
    const h = segmentHeight(phi) * 2 * R;                              // Füllhöhe vom Boden [mm]
    const level = inl.centroid.map((c, k) => (c + up[k] / ul * (h - R)) * 1e-3);
    const stroke = SH.stroke;
    const hLayer = M.sleeveCell > 0 ? M.sleeveCell : 2 * hSurf;
    const nLayers = Math.max(10, Math.min(3000, Math.round(stroke / hLayer)));
    files['system/extrudeMeshDict'] = dict('extrudeMeshDict', 'system')
      + '// Die Gießkammer: der Einlass (Kolben in der Endlage) um den Hub zurück zum Kolbenstart.\n'
      + '// Kammer Ø ' + f6(2 * R) + ' × ' + f6(SH.length) + ' mm = Hub ' + f6(stroke) + ' mm + Pressrest ' + f6(depth) + ' mm.\n'
      + 'constructFrom   mesh;\nsourceCase      "$FOAM_CASE";\nsourcePatches   (inlet);\nexposedPatchName inlet;\nflipNormals     false;\n'
      + 'extrudeModel    linearDirection;\nnLayers         ' + nLayers + ';   // ' + f6(stroke / nLayers) + ' mm beim Kolbenstart\nexpansionRatio  1.0;\n'
      + 'linearDirectionCoeffs\n{\n    direction   ' + vec(inl.normal) + ';\n    thickness   ' + f6(stroke * 1e-3) + ';\n}\nmergeFaces      false;\n';
    files['constant/dynamicMeshDict'] = dict('dynamicMeshDict', 'constant')
      + '// Der Kolben (Patch inlet) fährt die Schusskurve; die Kammer zwischen Kolben und Endplatte\n'
      + '// (die Einlassfläche, Kolben in der Endlage) wird gleichmäßig verdichtet (libshotSleeve, DieLogic_OF).\n'
      + 'dynamicFvMesh       dynamicMotionSolverFvMesh;\nmotionSolverLibs    (shotSleeve);\nmotionSolver        shotSleeve;\n'
      + 'shotSleeveCoeffs\n{\n    pistonPatch     inlet;\n    axis            ' + vec(nIn) + ';   // Richtung der Kolbenbewegung\n'
      + '    #include "$FOAM_CASE/system/shotSleeveDict"\n}\n';
    const travel = Math.min(stroke * 0.999, Math.max(...SH.points.map(p => p[0])));
    files['system/shotSleeveDict'] = dict('shotSleeveDict', 'system')
      + 'diameter        ' + f6(2 * R) + ';\nlength          ' + f6(stroke) + ';   // Kolbenstart → Endplatte (Einlassfläche)\n'
      + 'fillFraction    ' + f6(phi) + ';   // Füllgrad der Kammer (Auslegung), nur zur Information\n'
      + 'endPosition     ' + f6(travel) + ';\nnCellsD         30;\ninitialFill     no;\n\n'
      + '// Schusskurve ' + (SH.mode || '') + ': Kolbenweg x [mm] ab Kolbenstart, v [m/s]; aus der Ruhe bei x = 0,\n'
      + '// gleichmäßige Beschleunigung zwischen den Zeilen (v² linear in x), die letzte Geschwindigkeit bleibt.\n'
      + '// „Kammer voll" bei x = ' + f6(SH.sFull) + ' mm, t = ' + f6(SH.tFull * 1000) + ' ms; Füllende bei x = ' + f6(SH.sEnd) + ' mm, t = ' + f6(SH.tEnd * 1000) + ' ms\n'
      + 'shotCurve\n{\n    type        positionVelocity;\n    lengthUnit  mm;\n    values\n    (\n'
      + SH.points.map(([x, v]) => '        (' + f6(x) + ' ' + f6(v) + ')').join('\n') + '\n    );\n}\n';
    files['system/setAlphaFieldDict'] = dict('setAlphaFieldDict', 'system')
      + '// Die Schmelze in Ruhe: Füllgrad ' + f6(phi) + ', Füllhöhe ' + f6(h) + ' mm über dem tiefsten Punkt der Kammer.\n'
      + 'field       "alpha.melt";\ntype        plane;\norigin      ' + vec(level) + ';\nnormal      ' + vec(gh) + ';   // gefüllt wird unterhalb\n';
    const c1 = inl.centroid.map((c, k) => (c + inl.normal[k] * (stroke + 2 * hLayer)) * 1e-3);
    const c2 = inl.centroid.map((c, k) => (c + nIn[k] * (depth + pad1)) * 1e-3);
    files['system/topoSetDict'] = dict('topoSetDict', 'system')
      + 'actions\n(\n    // alles außerhalb der Kammer (Hub + Pressrest): dort ist zu Beginn keine Schmelze\n'
      + '    { name notChamber; type cellSet; action new; source cylinderToCell; p1 ' + vec(c1) + '; p2 ' + vec(c2) + '; radius ' + f6((R + pad1) * 1e-3) + '; }\n'
      + '    { name notChamber; type cellSet; action invert; }\n);\n';
    files['system/setFieldsDict'] = dict('setFieldsDict', 'system')
      + 'defaultFieldValues ( );\n\nregions\n(\n    cellToCell { set notChamber; fieldValues ( volScalarFieldValue alpha.melt 0 ); }\n);\n';
  }

  files['constant/g'] = head('uniformDimensionedVectorField', 'g', 'constant') + 'dimensions      [0 1 -2 0 0 0 0];\nvalue           ' + vec(g) + ';\n';
  files['constant/turbulenceProperties'] = dict('turbulenceProperties', 'constant') + 'simulationType  laminar;\n';
  files['constant/transportProperties'] = dict('transportProperties', 'constant')
    + '// Schmelze: Dichte flüssig, Zähigkeit ' + f6(P.mu) + ' Pa s\ntransportModel  Newtonian;\nrho             ' + f6(P.rho) + ';\nnu              ' + f6(nu) + ';\n';
  files['constant/gasProperties'] = dict('gasProperties', 'constant')
    + 'gamma           1.4;\nn               1.4;\npMax            2e7;\npAmb            ' + f6(P.pAmb) + ';\nTGas            300;\n\n'
    + 'vents\n{\n'
    + outlets.map((o, i) => '    ' + ventName(i) + (o.mode === 'open' ? '  { open true; }      // offen (z. B. Vakuumventil offen)\n'
      : '  { Cd ' + f6(o.Cd > 0 ? o.Cd : 0.8) + '; }          // Drossel, Fläche = Patchfläche (' + f6(o.area) + ' mm²)\n')).join('')
    + '}\n';
  files['constant/inclusionProperties'] = dict('inclusionProperties', 'constant')
    + '// Fehlerkennwerte, von der Schmelze mitgetragen (meltInclusions.H)\n'
    + 'oxide\n{\n    active      yes;\n    kp          1e-12;\n    Ckappa      1;\n}\n\n'
    + 'airEntrainment\n{\n    active      yes;\n    Cair        0.5;\n    Cturb       0.05;\n    sigma       ' + f6(P.sigma) + ';\n}\n';
  files['constant/thermalProperties'] = dict('thermalProperties', 'constant')
    + 'solveEnergy     yes;\n\ncp              ' + f6(P.cp) + ';\nkappa           ' + f6(P.kappa) + ';\nL               ' + f6(P.hf * 1000) + ';\n'
    + 'Tliquidus       ' + f6(P.Tliq + K) + ';   // ' + f6(P.Tliq) + ' °C\nTsolidus        ' + f6(P.Tsol + K) + ';   // ' + f6(P.Tsol) + ' °C\nCmush           0;\n\n'
    + 'dieHeatTransfer\n{\n    "(walls|vent.*)" { h ' + f6(P.hDie) + '; Tdie ' + f6(P.Tdie + K) + '; }   // Form ' + f6(P.Tdie) + ' °C\n}\n';

  /* ── Anfangs- und Randwerte (0.orig) ── */
  const vf = (cls, obj, dim, internal, bcs) => head(cls, obj, '0') + 'dimensions      ' + dim + ';\n\ninternalField   ' + internal + ';\n\n'
    + 'boundaryField\n{\n' + bcs.map(b => '    ' + b + '\n').join('') + '}\n';
  /* Die Luft verlässt die Form über das Gasmodell (gasProperties: welche
     Gastaschen an welchem Auslass liegen), nicht über die Randwerte. Für die
     Schmelze ist eine Drossel deshalb Wand — wie ein Entlüftungsblock, in
     dem sie erstarrt; sonst schoss der Strahl durch Bauteil und Überlauf
     hinaus, und die Form wurde nie voll. Ein offener Auslass lässt beides
     hinaus (Vakuumschlauch, Wassermodell). Der Solver endet bei voller Form
     (stopAtFill, keine Gaszelle mehr) und setzt den Druckbezug erst dann. */
  const ventBC = (fn) => outlets.map((o, i) => ventName(i).padEnd(16) + fn(o, i));
  const open = o => o.mode === 'open';
  files['0.orig/alpha.melt'] = vf('volScalarField', 'alpha.melt', '[0 0 0 0 0 0 0]', 'uniform 0', [
    chamber ? 'inlet           { type zeroGradient; }   // Kolben' : 'inlet           { type fixedValue; value uniform 1; }',
    ...ventBC(o => open(o) ? '{ type inletOutlet; inletValue uniform 0; value uniform 0; }   // offen' : '{ type zeroGradient; }   // Drossel: für die Schmelze Wand'),
    'walls           { type zeroGradient; }'
  ]);
  files['0.orig/U'] = vf('volVectorField', 'U', '[0 1 -1 0 0 0 0]', 'uniform (0 0 0)', [
    chamber ? 'inlet           { type movingWallVelocity; value uniform (0 0 0); }   // Kolben (libshotSleeve)'
      : 'inlet\n    {\n        type            uniformFixedValue;\n        uniformValue    table\n        (\n            #include "$FOAM_CASE/constant/plungerTable"\n        );\n        value           uniform (0 0 0);\n    }',
    ...ventBC(o => open(o) ? '{ type pressureInletOutletVelocity; value uniform (0 0 0); }' : '{ type noSlip; }'),
    'walls           { type noSlip; }'
  ]);
  /* p_rgh = p − ρ g·x: an einem offenen Auslass der Umgebungsdruck */
  const prgh = c => P.pAmb - P.rho * (g[0] * c[0] + g[1] * c[1] + g[2] * c[2]) * 1e-3;
  files['0.orig/p_rgh'] = vf('volScalarField', 'p_rgh', '[1 -1 -2 0 0 0 0]', 'uniform ' + f6(P.pAmb), [
    ...ventBC(o => open(o) ? '{ type fixedValue; value uniform ' + f6(prgh(o.centroid || [0, 0, 0])) + '; }' : '{ type fixedFluxPressure; value uniform ' + f6(P.pAmb) + '; }'),
    '"(walls|inlet)" { type fixedFluxPressure; value uniform ' + f6(P.pAmb) + '; }'
  ]);
  files['0.orig/T'] = vf('volScalarField', 'T', '[0 0 0 1 0 0 0]', 'uniform ' + f6(P.Tcast + K), [
    chamber ? 'inlet           { type zeroGradient; }   // Kolben'
      : 'inlet           { type fixedValue; value uniform ' + f6(P.Tcast + K) + '; }   // Gießtemperatur ' + f6(P.Tcast) + ' °C',
    '".*"            { type zeroGradient; }   // Wärme an die Form: constant/thermalProperties'
  ]);

  /* ── Skripte ── */
  files['render.py'] = renderScript(Object.assign({ fields: P }, plan.post || {}, {
    title: plan.title || 'DieLogic',
    /* Kammer (bzw. ohne Kammer: der Pressrest) — was nicht zur Form zählt */
    chamber: { c: inl.centroid.map(x => x * 1e-3), a: nIn, r: (R + pad1) * 1e-3, top: (depth + pad1) * 1e-3 },
    piston: SH ? SH.piston : null, tOffset: SH && !chamber ? SH.tFull : 0, moving: chamber,
    fillFrom: SH && chamber ? SH.tFull : 0
  }));
  /* Volumen der Form nach der Vereinigung (Randflächen, Divergenzsatz), mit
     Kammer dazu der Zylinder des Hubs — Allrun vergleicht es mit dem Netz */
  const vModel = Math.abs([...plan.union.patches.values()].reduce((sum, t) => sum + volume(t), 0)) + (chamber ? inl.area * SH.stroke : 0);
  files['Allrun'] = allrun(M.nProc, names.slice(1), chamber, vModel * 1e-9);
  files['Allclean'] = '#!/bin/sh\ncd "${0%/*}" || exit\n. ${WM_PROJECT_DIR:?}/bin/tools/CleanFunctions\ncleanCase0\n'
    + 'rm -rf constant/extendedFeatureEdgeMesh constant/triSurface/*.eMesh images\n'
    + (chamber ? '[ -f system/controlDict.slow ] && cp system/controlDict.slow system/controlDict\n' : '');
  files['README.md'] = readme(plan, { cells, tFill, endTime, names, M, P, SH, chamber });
  files['case.foam'] = '';
  const sleeveCells = chamber ? Math.round(inl.area / (hSurf * hSurf)) * Math.max(10, Math.round(SH.stroke / (M.sleeveCell > 0 ? M.sleeveCell : 2 * hSurf))) : 0;
  return { files, info: { cells: cells + sleeveCells, sleeveCells, fillTime: tFill, endTime, names, bgCells: n[0] * n[1] * n[2], extra, chamber } };
}

/** Höhe h/D eines Kreissegments mit dem Flächenanteil phi (Bisektion) —
    dieselbe Beziehung wie physics.segHeight der Auslegung. */
export function segmentHeight(phi) {
  if (!(phi > 0)) return 0;
  if (phi >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const f = (Math.acos(1 - 2 * m) - 2 * (1 - 2 * m) * Math.sqrt(Math.max(0, m * (1 - m)))) / Math.PI;
    if (f < phi) lo = m; else hi = m;
  }
  return (lo + hi) / 2;
}

function perpTo(n) {
  const a = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const p = [n[1] * a[2] - n[2] * a[1], n[2] * a[0] - n[0] * a[2], n[0] * a[1] - n[1] * a[0]];
  const l = Math.hypot(...p);
  return p.map(x => x / l);
}

function allrun(nProc, patches, chamber = false, vModel = 0) {
  return `#!/bin/sh
# Simulation der Formfüllung mit ${SOLVER} (DieLogic), erzeugt von DieLogic · Simulation einrichten.
#   ./Allrun              Netz, Anfangswerte, Rechnung (NP Prozesse), Bilder
#   NP=8 ./Allrun         mit 8 Prozessen
#   ./Allrun -mesh        nur das Netz (danach checkMesh ansehen)
#   ./Allrun -prepare     Netz und zerlegter Fall, ohne Rechnung
# Braucht OpenFOAM v2606 (openfoam.com), den Solver ${SOLVER} aus DieLogic_OF/solvers
# (Allwmake) und für die Bilder ParaView (pvbatch). Eine abgebrochene Rechnung läuft
# mit demselben Aufruf ab ihrer letzten Zeit weiter; ./Allclean fängt neu an.
cd "\${0%/*}" || exit
. \${WM_PROJECT_DIR:?}/bin/tools/RunFunctions
PATCHES="${patches.join(' ')}"

command -v ${SOLVER} >/dev/null 2>&1 || {
    echo "${SOLVER} nicht gefunden: DieLogic_OF/solvers/Allwmake bauen und OpenFOAM v2606 laden." >&2
    exit 1
}

# ── Netz ────────────────────────────────────────────────────────────
if [ ! -f constant/polyMesh/owner ]
then
    runApplication surfaceFeatureExtract
    runApplication blockMesh
    runApplication snappyHexMesh -overwrite
    if grep -q "FOAM FATAL" log.snappyHexMesh || grep -qw "background" constant/polyMesh/boundary
    then
        echo "snappyHexMesh ist gescheitert, siehe log.snappyHexMesh." >&2
        [ -f postProcessing/constant/leakPath.vtp ] && echo "Das Netz läuft aus der Form hinaus: die Wand hat ein Loch. Den Weg zeigt postProcessing/constant/leakPath.vtp (ParaView)." >&2
        rm -rf constant/polyMesh
        exit 1
    fi
    for p in \${PATCHES}
    do
        grep -qw "$p" constant/polyMesh/boundary || {
            echo "Die Fläche '$p' ist im Netz verschwunden: der Körper dahinter ist zu dünn für die Zellgröße" >&2
            echo "oder vom Rest getrennt. Kleinere Zellen wählen (Seite: Schritt Netz)." >&2
            rm -rf constant/polyMesh
            exit 1
        }
    done
${chamber ? `    # die Gießkammer: der Einlass um den Hub zurück (system/extrudeMeshDict)
    runApplication extrudeMesh
    grep -q "FOAM FATAL" log.extrudeMesh && { echo "extrudeMesh ist gescheitert: log.extrudeMesh" >&2; rm -rf constant/polyMesh; exit 1; }
` : ''}    runApplication checkMesh
${vModel > 0 ? `    # Volumen des Netzes gegen das Modell: zu grobe Zellen verlieren dünne Wände
    # und Rundungen still (2 mm statt 1,2 mm am U-Profil: 6,7 % weniger)
    awk -v vm=${vModel.toPrecision(6)} 'match($0, /Total volume = [0-9.eE+-]+/) {
        v = substr($0, RSTART + 15, RLENGTH - 15); sub(/\\.$/, "", v); r = v / vm
        printf "Netz: %.1f %% des Modellvolumens\\n", 100 * r
        if (r < 0.97) print "Das Netz hat deutlich weniger Volumen als das Modell: dünne Wände oder Rundungen fehlen teilweise. Kleinere Zellen wählen (Seite: Schritt Netz, „passend“)." > "/dev/stderr"
    }' log.checkMesh
` : ''}fi
[ "$1" = "-mesh" ] && { echo "Netz fertig."; exit 0; }

# ── Anfangswerte, Zerlegung ─────────────────────────────────────────
if [ -d processor0 ]
then
    NP=$(ls -d processor[0-9]* | wc -l)
    echo "weiter auf $NP Prozessen"
else
    NP=\${NP:-${nProc}}
    restore0Dir
${chamber ? `    cp system/controlDict.slow system/controlDict
    runApplication setAlphaField        # Schmelze in Ruhe unter der Füllhöhe
    runApplication topoSet              # Zellen außerhalb der Kammer
    runApplication setFields            # ... dort keine Schmelze` : '    runApplication setFields'}
fi
sed -i "s/^numberOfSubdomains .*/numberOfSubdomains $NP;/" system/decomposeParDict
if [ "$NP" -gt 1 ] && [ ! -d processor0 ]
then
    runApplication decomposePar
fi
[ "$1" = "-prepare" ] && { echo "vorbereitet ($NP Prozesse)"; exit 0; }

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
tail -n 5 log.${SOLVER} | grep -qx "End" || { echo "${SOLVER} ist nicht bis zum Ende gelaufen: log.${SOLVER}" >&2; exit 1; }
[ "$NP" -gt 1 ] && runApplication -o reconstructPar -newTimes

# ── Bilder ──────────────────────────────────────────────────────────
if command -v pvbatch >/dev/null 2>&1
then
    runApplication -o pvbatch render.py .
    echo "Bilder in images/"
else
    echo "pvbatch nicht gefunden: die Bilder mit 'pvbatch render.py .' nachholen."
fi
`;
}

function readme(plan, { cells, tFill, endTime, names, M, P, SH, chamber }) {
  return '# ' + (plan.title || 'DieLogic-Simulation') + '\n\n'
    + 'Formfüllung mit `' + SOLVER + '` (DieLogic_OF), erzeugt von **DieLogic · Simulation einrichten**.\n\n'
    + '```sh\nsource /usr/lib/openfoam/openfoam2606/etc/bashrc\n./Allrun            # Netz, Rechnung, Bilder (NP=' + M.nProc + ')\n```\n\n'
    + '| | |\n|---|---|\n'
    + '| Körper | ' + plan.bodies.map(b => b.name).join(', ') + ' |\n'
    + '| Randflächen | ' + names.join(', ') + ' |\n'
    + '| Zellgröße | ' + M.cell + ' mm' + (M.level > 0 ? ', Hintergrund ' + (M.cell * Math.pow(2, M.level)) + ' mm' : '') + ' |\n'
    + '| Zellen (grob) | ' + cells.toLocaleString('de-DE') + ' |\n'
    + (SH ? '| Schusskurve | ' + (SH.mode || '') + ', Kammer Ø ' + (2 * plan.inlet.radius).toFixed(1) + ' × ' + Math.round(SH.length) + ' mm, Füllgrad ' + (100 * SH.phi).toFixed(1) + ' % |\n'
      + '| Rechnung | ' + (chamber ? 'mit Gießkammer ab Kolbenstart (extrudeMesh + libshotSleeve)' : 'ab „Kammer voll" (Kolben als Geschwindigkeit am Einlass)') + ' |\n'
      : '| Kolben | ' + P.vStart + ' → ' + P.v2 + ' m/s in ' + (P.tRamp * 1000) + ' ms |\n')
    + '| Füllzeit (grob) | ' + (tFill * 1000).toFixed(1) + ' ms, endTime ' + (endTime * 1000).toFixed(0) + ' ms |\n'
    + '| Gießtemperatur / Form | ' + P.Tcast + ' °C / ' + P.Tdie + ' °C |\n\n'
    + (chamber ? 'Die Rechnung beginnt beim Kolbenstart: die Schmelze liegt mit dem Füllgrad in der Kammer '
      + '(`system/setAlphaFieldDict`, außerhalb der Kammer `topoSet` + `setFields`), der Kolben (Patch `inlet`) fährt die '
      + 'Schusskurve (`system/shotSleeveDict`, libshotSleeve). Die Auslässe `vent*` sind die '
      : 'Die Rechnung beginnt bei „Kammer voll": der Pressrest ist voll Schmelze (`system/setFieldsDict`), '
      + 'der Kolben drückt über die Fläche `inlet` nach (`constant/plungerTable`). Die Auslässe `vent*` sind die ')
    + 'Entlüftungen des Gasmodells (`constant/gasProperties`): eine Drossel lässt nur die Luft hinaus und ist für die '
    + 'Schmelze Wand (Entlüftungsblock), ein offener Auslass lässt auch die Schmelze hinaus. Die Rechnung endet bei voller Form '
    + '(`stopAtFill`). Überlappungen der Körper stehen in '
    + '`constant/triSurface/internal.stl`; dort wird nur verfeinert, das Netz läuft durch.\n\n'
    + 'Bilder: `render.py` (pvbatch) schreibt nach `images/`; die Einstellungen stehen oben im Skript.\n';
}
