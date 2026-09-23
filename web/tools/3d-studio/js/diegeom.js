/* Geometrie der Beispiel-Druckgießform als Dreieckssuppen: die ältere,
   prozedurale Form. assets/die.glb kommt heute aus den openscad-Teilen;
   diese Datei nutzen nur noch scripts/3d-studio/build-glb.mjs und die
   Tests. Bewusst ohne Three.js, damit sie unter Node läuft.

   Der Unterschied zur ersten Fassung: die Stahlteile sind keine Quader
   mehr, die sich mit Kavität, Füllkammer, Stiften und Säulen
   überschneiden — jedes Negativ wird mit js/csg.js herausgeschnitten.
   Dadurch ist das Gussteil ein echter Hohlraum in den Einsätzen, die
   Auswerferstifte laufen in Bohrungen, die Säulen in Führungsbohrungen
   und die Füllkammer ist ein Rohr mit Gießloch.

   Entformbarkeit: die Kavität hat ihren größten Querschnitt an der
   Trennebene (z = 0) und verjüngt sich mit CFG.part.draft in beide
   Hälften; der Kernstift wird zum Fuß hin dicker. Alle Schneidwerkzeuge
   sind um CFG.fit aufgedickt, damit zwischen Stahl und Einbauteil ein
   sichtbarer Spalt bleibt statt deckungsgleicher Flächen. */

import { CFG } from './config.js';
import * as S from './solids.js';
import { subtract, union } from './csg.js';

const tan = deg => Math.tan(deg * Math.PI / 180);

const D = CFG.die, I = CFG.insert, P = CFG.part, B = CFG.boss, K = CFG.core,
      FL = CFG.flange, SL = CFG.sleeve, PL = CFG.plunger, SP = CFG.sprue,
      RU = CFG.runner, GA = CFG.gate, OV = CFG.overflow, VE = CFG.vent,
      VB = CFG.ventBlock, CO = CFG.cool, EJ = CFG.ejector, GU = CFG.guide,
      FIT = CFG.fit;

/* ── abgeleitete Lagen ───────────────────────────────────────── */
const partTop   = P.y + P.H / 2;                 //  125  Oberkante Bauteil
const partBot   = P.y - P.H / 2;                 //  −45  Unterkante Bauteil
const flangeBot = partBot - FL.H;                //  −75  Unterkante Flansch
const bossTop   = P.tMov + B.h;                  //   94  Domdach (tiefste Stelle bewegl.)
const coreBot   = -P.tFix - K.seat;              //  −30  Auflage des Kernstifts
const rCoreTop  = K.d / 2;
const rCoreBot  = rCoreTop - (bossTop - coreBot) * tan(K.draft);
const sleeveZ1  = -I.tFix;                       // −100  Kammermündung am Einsatzrücken
const sleeveZ0  = sleeveZ1 - SL.len;             // −650  Kammerende
const biscuitZ0 = sleeveZ1 - PL.rest;            // −125  Stirnfläche des Pressrests
const tipZ0     = biscuitZ0 - PL.tipT;           // −195  Kolbenkopf hinten
const gateY0    = flangeBot - GA.h;              // −101  Anschnitt am Anguss
const gateY1    = flangeBot + 2;                 //  −73  2 mm in den Flansch hinein
const ovY0      = partTop - 1;                   //  124  Überläufe 1 mm ins Bauteil
const ventY0    = ovY0 + OV.h;                   //  150
const ventY1    = D.H / 2 + 20;                  //  430  bis in den Vakuumblock
const ejZ0      = D.tMov;                        //  280  Kastenboden
const plateZ0   = ejZ0 + EJ.railGap;             //  310  Halteplatte vorn
const plateZ1   = plateZ0 + EJ.plateT;           //  340
const plateZ2   = plateZ1 + EJ.plateT;           //  370  Grundplatte hinten
const boxZ1     = ejZ0 + EJ.boxLen;              //  440
const pinZ1     = plateZ1;                       //  340  Stiftende (Kopf in der Halteplatte)
const pinHead0  = pinZ1 - EJ.headT;              //  332
const guidePos  = [[-1, -1], [1, -1], [-1, 1], [1, 1]]
  .map(([sx, sy]) => [sx * (D.W / 2 - GU.insetX), sy * (D.H / 2 - GU.insetY)]);

/* ── Kavität: Gussteil, Kernstift, Gießsystem ────────────────── */

/* Grundkörper: größter Querschnitt an der Trennebene, Verjüngung in
   beide Hälften — dadurch löst sich das Teil aus beiden Einsätzen. */
function partBody(g = 0) {
  const t = tan(P.draft);
  return S.rectLoft([
    { z: -P.tFix, w: P.W - 2 * P.tFix * t, h: P.H - 2 * P.tFix * t, cy: P.y },
    { z: 0,       w: P.W,                  h: P.H,                  cy: P.y },
    { z: P.tMov,  w: P.W - 2 * P.tMov * t, h: P.H - 2 * P.tMov * t, cy: P.y }
  ], g);
}

/* Dom auf der beweglichen Seite (verjüngt sich nach hinten). */
function partBoss(g = 0) {
  const t = tan(B.draft);
  return S.circLoft([
    { z: P.tMov - 1, r: B.d / 2,            cy: P.y },   // 1 mm in den Grundkörper
    { z: P.tMov,     r: B.d / 2,            cy: P.y },
    { z: bossTop,    r: B.d / 2 - B.h * t,  cy: P.y }
  ], 32, g);
}

/* Flansch an der Unterkante: die Oberkante folgt exakt der Bauteilkante,
   nur die Unterseite bekommt die Schräge. */
function partFlange(g = 0) {
  const t = tan(FL.draft);
  const H = FL.H + 0.5;                                  // 0,5 mm ins Bauteil
  const cy = z => partBot - FL.H / 2 + 0.25 + Math.abs(z) * t;
  return S.rectLoft([
    { z: -FL.tFix, w: FL.W - 2 * FL.tFix * t, h: H, cy: cy(FL.tFix) },
    { z: 0,        w: FL.W,                   h: H, cy: cy(0) },
    { z: FL.tMov,  w: FL.W - 2 * FL.tMov * t, h: H, cy: cy(FL.tMov) }
  ], g);
}

/* Kernstift durch Dom und Grundkörper; zum Fuß (z = bossTop) hin dicker,
   damit sich das Gussteil beim Auswerfen davon löst. g < 0 liefert den
   etwas dünneren Stahlkern, g > 0 die Aufnahme im festen Einsatz. */
function coreCone(g = 0, gz = 1) {
  return S.circLoft([
    { z: coreBot, r: rCoreBot, cy: P.y },
    { z: bossTop, r: rCoreTop, cy: P.y }
  ], 24, g, gz);
}

/* Der Stahlkern selbst: dünner als das Loch (Spalt) und mit Fuß, der im
   beweglichen Einsatz steckt. */
function coreColumn() {
  const t = tan(K.draft);
  const rAt = z => rCoreTop - (bossTop - z) * t;
  return S.circLoft([
    { z: coreBot, r: rAt(coreBot) - FIT - 0.05, cy: P.y },
    { z: 5,       r: rAt(5) - FIT - 0.05,       cy: P.y }   // oberhalb steht der Einsatz selbst
  ], 24);
}

/* Angusskegel im festen Einsatz — an der Trennebene weiter, damit er
   beim Öffnen herauskommt. */
function sprue(g = 0) {
  return S.circLoft([
    { z: sleeveZ1, r: SP.dBack / 2,  cy: SL.y },
    { z: 0,        r: SP.dPlane / 2, cy: SL.y }
  ], 32, g);
}

/* Pressrest in der Kammermündung. */
const biscuit = (g = 0) =>
  S.translate(S.cyl(SL.d / 2, biscuitZ0, sleeveZ1 + 1, 32, g), 0, SL.y, 0);

/* Angusskanal (Nut in der beweglichen Hälfte) vom Kegel zum Anschnitt. */
const runnerBar = (g = 0) => {
  const y0 = SL.y, y1 = gateY0 + 2;
  return S.place(S.box(RU.w, y1 - y0, RU.t, g), 'z', 0, (y0 + y1) / 2, RU.t / 2);
};

/* Anschnitt: Fächer von der Angussbreite auf die Anschnittbreite, dabei
   von RU.t auf GA.t dünner werdend. Loft entlang y. */
const gateFan = (g = 0) => S.place(S.rectLoft([
  { z: gateY0, w: RU.w,  h: RU.t, cy: -RU.t / 2 },
  { z: gateY1, w: GA.w,  h: GA.t, cy: -GA.t / 2 }
], g), 'y', 0, 0, 0);

function overflows(g = 0) {
  const span = P.W - OV.w;
  const parts = [];
  for (let i = 0; i < OV.n; i++) {
    const x = -span / 2 + (span / (OV.n - 1)) * i;
    parts.push(S.place(S.box(OV.w, OV.h, OV.t, g), 'z', x, ovY0 + OV.h / 2, OV.t / 2));
  }
  return S.concat(parts);
}

const ventChannel = (g = 0) =>
  S.place(S.box(VE.w, ventY1 - ventY0, VE.t, g), 'z', 0, (ventY0 + ventY1) / 2, VE.t / 2);

/* ── Bohrungsbilder ──────────────────────────────────────────── */

function ejectorPinBores() {
  const parts = [];
  for (const x of EJ.pinX) for (const y of EJ.pinY) {
    parts.push(S.translate(S.cyl(EJ.pinD / 2 + FIT, P.tMov - 1, D.tMov + 1, 16), x, y, 0));
  }
  return S.concat(parts);
}

/* Abgesetzte Bohrung in der Halteplatte: Schaft + Kopfsenkung als EIN
   geschlossener Körper (zwei Ebenen auf gleicher Höhe bilden die
   Schulter) — überlappende Einzelkörper würden den BSP-Baum verwirren. */
function steppedBores(list, rShaft, rHead) {
  const parts = list.map(([x, y]) => S.translate(S.circLoft([
    { z: plateZ0 - 1,  r: rShaft + FIT },
    { z: pinHead0,     r: rShaft + FIT },
    { z: pinHead0,     r: rHead + FIT },
    { z: plateZ1 + 1,  r: rHead + FIT }
  ], 16), x, y, 0));
  return S.concat(parts);
}

const returnPinBores = () => S.concat(EJ.returnPos.map(([x, y]) =>
  S.translate(S.cyl(EJ.returnD / 2 + FIT, -1, D.tMov + 1, 16), x, y, 0)));

const pillarBores = () => S.concat(guidePos.map(([x, y]) =>
  S.translate(S.cyl(GU.d / 2 + FIT, GU.z0 - 1, 1, 24), x, y, 0)));

/* Der Sitz nimmt die Buchse auf UND lässt die Säulenspitze durchlaufen. */
const bushingSeats = () => S.concat(guidePos.map(([x, y]) =>
  S.translate(S.cyl(GU.bushOD / 2 + FIT, -1, GU.z1 + 11, 24), x, y, 0)));

const ventGrooves = () => {
  const parts = [];
  for (let i = 0; i < VB.grooves; i++) {
    parts.push(S.place(S.box(VB.W - 30, VB.grooveH, VB.grooveT), 'z',
      0, D.H / 2 + 16 + i * 18, 0));
  }
  return S.concat(parts);
};

/* ── Temperierkreis ──────────────────────────────────────────── */
function oneCircuit(xs, z) {
  const pts = [[xs[0], -D.H / 2 - 40, z]];
  for (let i = 0; i < xs.length; i++) {
    const top = i % 2 === 0;
    pts.push([xs[i], top ? -CO.span : CO.span, z]);
    pts.push([xs[i], top ? CO.span : -CO.span, z]);
  }
  const lastTop = (xs.length - 1) % 2 === 0;
  pts.push([xs[xs.length - 1], lastTop ? D.H / 2 + 40 : -D.H / 2 - 40, z]);
  return S.pipe(pts, CO.d, 14);
}



/* ── Zusammenbau ─────────────────────────────────────────────── */

/* Wird einmal gebaut und von mehreren Bauteilen benutzt. */
function cavityTool() {
  const outer = union(union(partBody(FIT), partBoss(FIT)), partFlange(FIT));
  return subtract(outer, coreCone(-FIT, 1));
}

export function buildParts(log = () => {}) {
  const t0 = Date.now();
  const out = {};
  const step = (name, fn) => { out[name] = fn(); log(name, Date.now() - t0); };

  const cavity = cavityTool();
  log('cavityTool', Date.now() - t0);
  const pinBores = ejectorPinBores();
  const vent = ventChannel(FIT);

  /* ── feste Seite ── */
  step('fixHalf', () => {
    let g = S.place(S.box(D.W, D.H, D.tFix), 'z', 0, 0, -D.tFix / 2);
    g = subtract(g, S.place(S.box(I.W, I.H, I.tFix, FIT), 'z', 0, 0, -I.tFix / 2));
    g = subtract(g, S.translate(S.cyl(SL.d / 2 + SL.wall + FIT, sleeveZ0, sleeveZ1 + 1, 32), 0, SL.y, 0));
    g = subtract(g, pillarBores());
    return [{ tris: g, mat: 'steel' }];
  });

  step('fixInsert', () => {
    let g = S.place(S.box(I.W, I.H, I.tFix), 'z', 0, 0, -I.tFix / 2);
    g = subtract(g, cavity);
    g = subtract(g, coreCone(FIT, FIT));
    g = subtract(g, sprue(FIT));
    return [{ tris: g, mat: 'steel' }];
  });

  step('sleeve', () => {
    let body = S.translate(S.cyl(SL.d / 2 + SL.wall, sleeveZ0, sleeveZ1, 32), 0, SL.y, 0);
    body = union(body, S.translate(S.cyl(SL.d / 2 + SL.wall + 13, sleeveZ0, sleeveZ0 + 18, 32), 0, SL.y, 0));
    body = subtract(body, S.translate(S.cyl(SL.d / 2, sleeveZ0 - 1, sleeveZ1 + 1, 32), 0, SL.y, 0));
    body = subtract(body, S.place(S.cyl(SL.pourD / 2, 0, SL.d / 2 + SL.wall + 20, 24), 'y', 0, SL.y, SL.pourZ));
    const tip = S.translate(S.cyl(SL.d / 2 - 2, tipZ0, biscuitZ0, 32), 0, SL.y, 0);
    const rod = S.translate(S.cyl(PL.rodD / 2, tipZ0 - 260, tipZ0, 32), 0, SL.y, 0);
    return [{ tris: body, mat: 'steel' }, { tris: S.concat([tip, rod]), mat: 'plunger' }];
  });

  step('guidePillars', () => [{
    tris: S.concat(guidePos.map(([x, y]) => S.translate(S.cyl(GU.d / 2, GU.z0, GU.z1, 24), x, y, 0))),
    mat: 'steel'
  }]);

  step('coolFixL', () => [{ tris: oneCircuit(CO.xFix[0], CO.zFix), mat: 'coolFix' }]);
  step('coolFixR', () => [{ tris: oneCircuit(CO.xFix[1], CO.zFix), mat: 'coolFix' }]);

  step('ventBlockFix', () => {
    let g = S.place(S.box(VB.W, VB.H, VB.T), 'z', 0, D.H / 2 + VB.H / 2, -VB.T / 2);
    g = subtract(g, ventGrooves());
    g = subtract(g, vent);
    return [{ tris: g, mat: 'steel' }];
  });

  /* ── bewegliche Seite ── */
  step('movHalf', () => {
    let g = S.place(S.box(D.W, D.H, D.tMov), 'z', 0, 0, D.tMov / 2);
    g = subtract(g, S.place(S.box(I.W, I.H, I.tMov, FIT), 'z', 0, 0, I.tMov / 2));
    g = subtract(g, vent);
    g = subtract(g, bushingSeats());
    g = subtract(g, pinBores);
    g = subtract(g, returnPinBores());
    return [{ tris: g, mat: 'steel' }];
  });

  step('movInsert', () => {
    let g = S.place(S.box(I.W, I.H, I.tMov), 'z', 0, 0, I.tMov / 2);
    g = union(g, coreColumn());
    g = subtract(g, cavity);
    g = subtract(g, runnerBar(FIT));
    g = subtract(g, gateFan(FIT));
    g = subtract(g, overflows(FIT));
    g = subtract(g, vent);
    g = subtract(g, pinBores);
    return [{ tris: g, mat: 'steel' }];
  });

  step('guideBushings', () => [{
    tris: S.concat(guidePos.map(([x, y]) => subtract(
      S.translate(S.cyl(GU.bushOD / 2, GU.bushZ0, GU.bushZ1, 24), x, y, 0),
      S.translate(S.cyl(GU.d / 2 + FIT, GU.bushZ0 - 1, GU.bushZ1 + 1, 24), x, y, 0)))),
    mat: 'steel'
  }]);

  step('coolMovL', () => [{ tris: oneCircuit(CO.xMov[0], CO.zMov), mat: 'coolMov' }]);
  step('coolMovR', () => [{ tris: oneCircuit(CO.xMov[1], CO.zMov), mat: 'coolMov' }]);

  step('ventBlockMov', () => {
    let g = S.place(S.box(VB.W, VB.H, VB.T), 'z', 0, D.H / 2 + VB.H / 2, VB.T / 2);
    g = subtract(g, ventGrooves());
    g = subtract(g, vent);
    return [{ tris: g, mat: 'steel' }];
  });

  step('ejBox', () => {
    const rails = [-1, 1].map(s => S.place(S.box(EJ.boxRail, D.H, EJ.boxLen), 'z',
      s * (D.W / 2 - EJ.boxRail / 2), 0, ejZ0 + EJ.boxLen / 2));
    let back = S.place(S.box(D.W, D.H, EJ.backT), 'z', 0, 0, boxZ1 + EJ.backT / 2);
    back = subtract(back, S.cyl(EJ.rodD / 2, boxZ1 - 1, boxZ1 + EJ.backT + 1, 32));
    return [{ tris: S.concat([...rails, back]), mat: 'steel' }];
  });

  step('ejector', () => {
    const pinList = [];
    for (const x of EJ.pinX) for (const y of EJ.pinY) pinList.push([x, y]);
    let hold = S.place(S.box(EJ.plateW, EJ.plateH, EJ.plateT), 'z', 0, 0, (plateZ0 + plateZ1) / 2);
    hold = subtract(hold, steppedBores(pinList, EJ.pinD / 2, EJ.pinD / 2 + 3));
    hold = subtract(hold, steppedBores(EJ.returnPos, EJ.returnD / 2, EJ.returnD / 2 + 3));
    const base = S.place(S.box(EJ.plateW, EJ.plateH, EJ.plateT), 'z', 0, 0, (plateZ1 + plateZ2) / 2);
    const pins = [];
    for (const [x, y] of pinList) {
      pins.push(S.translate(S.cyl(EJ.pinD / 2, P.tMov, pinHead0, 16), x, y, 0));
      pins.push(S.translate(S.cyl(EJ.pinD / 2 + 3, pinHead0, pinZ1, 16), x, y, 0));
    }
    for (const [x, y] of EJ.returnPos) {
      pins.push(S.translate(S.cyl(EJ.returnD / 2, 0, pinHead0, 16), x, y, 0));
      pins.push(S.translate(S.cyl(EJ.returnD / 2 + 3, pinHead0, pinZ1, 16), x, y, 0));
    }
    return [{ tris: S.concat([hold, base]), mat: 'steel' },
            { tris: S.concat(pins), mat: 'pins' }];
  });

  /* ── Gussteil ── */
  step('castPart', () => {
    let g = union(union(partBody(), partBoss()), partFlange());
    g = subtract(g, coreCone(0, 1));
    return [{ tris: g, mat: 'castPart' }];
  });

  step('castRunner', () => {
    let g = union(biscuit(), sprue());
    g = union(g, runnerBar());
    g = union(g, gateFan());
    return [{ tris: g, mat: 'castRunner' }];
  });

  step('castOverflow', () => {
    const g = union(overflows(), ventChannel());
    return [{ tris: g, mat: 'castOverflow' }];
  });

  return out;
}

/* Beide Temperierkreise einer Hälfte. Die Abstandsanalyse braucht sie
   als Gegenstück zum Gussteil: „wie weit ist die Kavität vom Kanal?" */
export function buildCooling(side) {
  const groups = side === 'mov' ? CO.xMov : CO.xFix;
  const z = side === 'mov' ? CO.zMov : CO.zFix;
  return S.concat(groups.map(xs => oneCircuit(xs, z)));
}

/* Nur das Gussteil — der Teilungs-Viewer bietet es als Beispielteil an,
   ohne die ganze Form zu bauen. */
export function buildCastPart() {
  let g = union(union(partBody(), partBoss()), partFlange());
  return subtract(g, coreCone(0, 1));
}

/* Für Tests und Prüfungen: die Kavitäts-Werkzeuge einzeln. */
export const _internals = {
  partBody, partBoss, partFlange, coreCone, coreColumn, sprue, biscuit,
  runnerBar, gateFan, overflows, ventChannel, cavityTool,
  levels: { partTop, partBot, flangeBot, bossTop, coreBot, sleeveZ0, sleeveZ1, biscuitZ0, ejZ0, boxZ1 }
};
