/* Körper der Anschnitte für die Anzeige: ein flacher Quader in der Wand,
   Breite quer, Höhe längs, ein paar Millimeter nach außen und ebenso
   weit ins Bauteil hinein — so sieht man ihn auf jeder Wand, auch wenn
   das Raster die Fläche etwas versetzt. Dreieckssuppe wie überall. */

import { frameOf, allItems } from './model.js';

export const INLET_DEPTH = 3;   // mm nach außen und nach innen

export function inletBody(item, depth = INLET_DEPTH) {
  const f = frameOf(item);
  const hw = item.w / 2, hh = item.h / 2;
  const P = (a, b, c) => [
    f.o[0] + f.u[0] * a + f.v[0] * b + f.n[0] * c,
    f.o[1] + f.u[1] * a + f.v[1] * b + f.n[1] * c,
    f.o[2] + f.u[2] * a + f.v[2] * b + f.n[2] * c
  ];
  /* Acht Ecken: Bit 0 = u, Bit 1 = v, Bit 2 = n. */
  const c = [];
  for (let i = 0; i < 8; i++) c.push(P(i & 1 ? hw : -hw, i & 2 ? hh : -hh, i & 4 ? depth : -depth));
  const quads = [
    [0, 2, 3, 1],   // innen (−n), Wicklung nach außen
    [4, 5, 7, 6],   // außen (+n)
    [0, 1, 5, 4],   // −v
    [2, 6, 7, 3],   // +v
    [0, 4, 6, 2],   // −u
    [1, 3, 7, 5]    // +u
  ];
  const out = [];
  for (const [a, b, cc, d] of quads) out.push(...c[a], ...c[b], ...c[cc], ...c[a], ...c[cc], ...c[d]);
  return out;
}

export function buildAll(plan) {
  const out = [];
  for (const it of allItems(plan)) out.push(...inletBody(it));
  return out;
}
