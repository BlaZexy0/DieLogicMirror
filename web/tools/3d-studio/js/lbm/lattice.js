/* Das Gitter der Strömungsrechnung: D3Q19.

   Neunzehn Richtungen je Zelle — Ruhe, sechs Achsen, zwölf Flächen-
   diagonalen —, so angeordnet, dass Gegenrichtungen PAARWEISE
   nebeneinanderliegen (1↔2, 3↔4, …): die Gegenrichtung zu i ist damit
   i+1 bzw. i−1, ohne Tabelle. Gewichte 1/3, 1/18, 1/36; Schallgeschwin-
   digkeit c_s² = 1/3.

   Diese Datei ist die EINE Quelle für beide Kerne: den JavaScript-Kern
   (js/lbm/fslbm.js — Tests und Notfall ohne WebGPU) und den WGSL-Kern
   (js/lbm/gpu.js schreibt die Tabellen aus diesen Feldern in den
   Shader). Zwei Abschriften derselben Zahlen liefen auseinander. */

export const Q = 19;

export const C = [
  [0, 0, 0],
  [1, 0, 0], [-1, 0, 0],
  [0, 1, 0], [0, -1, 0],
  [0, 0, 1], [0, 0, -1],
  [1, 1, 0], [-1, -1, 0],
  [1, -1, 0], [-1, 1, 0],
  [1, 0, 1], [-1, 0, -1],
  [1, 0, -1], [-1, 0, 1],
  [0, 1, 1], [0, -1, -1],
  [0, 1, -1], [0, -1, 1]
];

export const W = [
  1 / 3,
  1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18, 1 / 18,
  1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36,
  1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36, 1 / 36
];

/** Gegenrichtung. */
export const OPP = C.map((c, i) => (i === 0 ? 0 : (i % 2 === 1 ? i + 1 : i - 1)));

/** Zellarten. Die ersten sechs sind Zustände, die letzten vier
    Übergänge, die ein Schritt in seinen Zwischenfeldern vermerkt. */
export const FLAG = {
  WALL: 0,        // Stahl — außerhalb des Kanals
  GAS: 1,         // leer (Luft)
  INTERFACE: 2,   // die Front: teilgefüllt
  FLUID: 3,       // voll Schmelze
  INLET: 4,       // Kolbenfläche: Schmelze mit vorgegebener Geschwindigkeit
  OUTLET: 5,      // Anschnitt: was hier ankommt, verlässt den Anguss
  TO_FLUID: 6,    // Front → voll
  TO_GAS: 7,      // Front → leer
  TO_IF_GAS: 8,   // leer → Front (neben einer neu vollen Zelle)
  TO_IF_FLUID: 9  // voll → Front (neben einer neu leeren Zelle)
};

/** Ankunft „nie" im Feld der Ankunftsschritte. */
export const NEVER = 0xFFFFFFFF;

/* Lage der Felder im gemeinsamen Gleitkomma- und Ganzzahlpuffer je
   Zelle — der GPU-Kern bindet einen Puffer je Typ (WebGPU erlaubt nur
   acht Speicherpuffer je Shader), der JavaScript-Kern hält dieselbe
   Anordnung, damit Tests beide vergleichen können. */
export const FF = { MASS: 0, RHO: 1, UX: 2, UY: 3, UZ: 4, EPS: 5, EXCESS: 6, COUNT_F: 7 };
export const FU = { FLAG: 0, NEW1: 1, NEW2: 2, COUNT: 3, ARRIVAL: 4, SENSOR: 5, COUNT_U: 6 };

/** Gleichgewichtsverteilung. */
export function feq(i, rho, ux, uy, uz) {
  const c = C[i];
  const cu = c[0] * ux + c[1] * uy + c[2] * uz;
  return W[i] * rho * (1 + 3 * cu + 4.5 * cu * cu - 1.5 * (ux * ux + uy * uy + uz * uz));
}
