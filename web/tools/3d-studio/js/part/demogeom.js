/* QUELLE der Beispielteile — die prozedurale Geometrie hinter
   assets/parts/*.glb.

   Sie sind so gebaut, dass die Analyse etwas zu zeigen hat: saubere
   Entformschrägen in der Hauptrichtung, Flächen, die nur ein Schieber
   bilden kann, und echte Hinterschnitte, die keine der sechs Richtungen
   erreicht. Alle Teile liegen mit ihrem größten Querschnitt auf z = 0 —
   der voreingestellten Trennebene.

   Dieses Modul lädt der Browser NICHT: die Viewer holen die fertigen
   GLB-Dateien (js/part/demoparts.js). Gebraucht wird es nur von
   tools/build-parts.mjs und von den Tests, die prüfen, dass die
   ausgelieferten Dateien noch zur Quelle passen. Dadurch bleiben
   js/csg.js, js/solids.js und js/diegeom.js aus den Bauteil-Seiten
   heraus — die Teile sind fertig, wenn sie ankommen. */

import * as S from '../solids.js';
import { subtract, union } from '../csg.js';
import { buildCastPart } from '../diegeom.js';

const tan = deg => Math.tan(deg * Math.PI / 180);

/* Quader mit Entformschräge in beide Richtungen ab der Trennebene. */
function draftBox(w, h, zBot, zTop, draft, cx = 0, cy = 0, g = 0) {
  const t = tan(draft);
  return S.rectLoft([
    { z: zBot, w: w + 2 * zBot * t, h: h + 2 * zBot * t, cx, cy },
    { z: 0,    w, h, cx, cy },
    { z: zTop, w: w - 2 * zTop * t, h: h - 2 * zTop * t, cx, cy }
  ], g);
}

/* Kegelstumpf mit Entformschräge (r gilt am Fuß z0). */
function draftCyl(r, z0, z1, draft, cx = 0, cy = 0, seg = 40, g = 0) {
  const t = tan(draft);
  return S.circLoft([
    { z: z0, r, cx, cy },
    { z: z1, r: r - Math.abs(z1 - z0) * t, cx, cy }
  ], seg, g);
}

/* ── 1 · Gehäusedeckel — sauber in ±Z entformbar ────────────── */
function coverPart() {
  let g = draftBox(180, 120, -20, 40, 2);
  /* Tasche von oben, 3° Schräge — die Innenwände bildet die bewegliche Seite. */
  g = subtract(g, S.rectLoft([
    { z: 5,  w: 140 - 2 * 35 * tan(3), h: 80 - 2 * 35 * tan(3) },
    { z: 41, w: 140, h: 80 }
  ]));
  /* Dom in der Tasche mit Sackloch. */
  g = union(g, draftCyl(22, 6, 38, 2));
  g = subtract(g, S.circLoft([{ z: 14, r: 7 - 28 * tan(2) }, { z: 42, r: 7 }], 32));
  /* Zwei Rippen quer durch die Tasche. */
  for (const x of [-45, 45]) {
    g = union(g, S.rectLoft([
      { z: 5,  w: 14, h: 80, cx: x },
      { z: 36, w: 14 - 2 * 31 * tan(2), h: 80, cx: x }
    ]));
  }
  /* Flansch an der Trennebene. */
  g = union(g, draftBox(210, 150, -8, 8, 2));
  return g;
}

/* ── 2 · Halter mit Schiebern ───────────────────────────────── */
function bracketPart() {
  let g = draftBox(160, 100, -30, 30, 2);
  /* Dom oben. */
  g = union(g, draftCyl(26, 30, 62, 2));
  g = subtract(g, S.circLoft([{ z: 38, r: 9 - 28 * tan(1.5) }, { z: 66, r: 9 }], 32));
  /* Zwei seitliche Augen mit Sackbohrung: die Bohrungswand kann NUR ein
     Schieber aus ±X bilden — aus ±Z ist sie verdeckt. */
  for (const ax of ['x', '-x']) {
    const sx = ax === 'x' ? 1 : -1;
    g = union(g, S.place(S.circLoft([
      { z: 0,  r: 26 },
      { z: 34, r: 22 }
    ], 40), ax, sx * 78, 0, 0));
    g = subtract(g, S.place(S.circLoft([
      { z: -30, r: 11 - 30 * tan(2) },
      { z: 36,  r: 11 + 6 * tan(2) }
    ], 32), ax, sx * 78, 0, 0));
  }
  /* Fenster quer durch das Teil (Achse Y) — Wände nur von ±Y erreichbar. */
  g = subtract(g, S.place(S.rectLoft([
    { z: -60, w: 44, h: 30, cy: 4 },
    { z: 0,   w: 44 - 2 * 55 * tan(1.5), h: 30 - 2 * 55 * tan(1.5), cy: 4 },
    { z: 60,  w: 44, h: 30, cy: 4 }
  ]), 'y', 0, 0, 4));
  return g;
}

/* ── 3 · Teil mit Hinterschnitt ─────────────────────────────── */
function undercutPart() {
  let g = draftBox(150, 110, -25, 25, 2);
  /* Pilzkopf: die Unterseite des Tellers erreicht KEINE der sechs
     Richtungen — der klassische Fall für Schrägauswerfer oder Umkonstruktion. */
  g = union(g, S.cyl(14, 25, 55, 32));
  g = union(g, S.circLoft([{ z: 55, r: 30 }, { z: 68, r: 26 }], 40));
  /* Umlaufende Nut an der Flanke: von oben und unten verdeckt. */
  g = subtract(g, subtract(S.cyl(92, -6, 6, 48), S.cyl(62, -7, 7, 48)));
  /* Seitlicher Zapfen mit gerader (0°) Stirnfläche. */
  g = union(g, S.place(S.cyl(16, 0, 26, 32), 'x', 60, -30, 0));
  return g;
}

/* Die Beschreibung der Teile (Name, Erklärung, Dateiname) steht in
   js/part/demoparts.js — hier hängt nur die Geometrie daran. */
const BUILDERS = {
  cover: coverPart,
  bracket: bracketPart,
  undercut: undercutPart,
  cast: buildCastPart
};

export function buildDemoGeometry(id) {
  const fn = BUILDERS[id];
  if (!fn) throw new Error('Unbekanntes Beispielteil: ' + id);
  return fn();
}
