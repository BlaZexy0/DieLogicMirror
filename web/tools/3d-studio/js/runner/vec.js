/* Kleine Vektorrechnung für den Angussdesigner.

   Die übrigen Module des Studios rechnen mit rohen Zahlenfeldern (drei
   Werte je Punkt) und schreiben sich die Handgriffe jedes Mal neu hin —
   bei einer Sweep-Geometrie mit Rahmen, Ebenen und Spiegelungen wird
   das unleserlich. Deshalb hier einmal das Nötige, ohne Three.js:
   diese Datei muss auch unter Node laufen (Tests) und wird von den
   Rechenmodulen benutzt, die mit der Anzeige nichts zu tun haben.

   Konvention wie überall im Studio: ein Punkt ist [x, y, z] in mm. */

export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const addScaled = (a, b, s) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
export const len = a => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Normieren. Ein Nullvektor bleibt ein Nullvektor — der Aufrufer prüft. */
export function norm(a) {
  const l = len(a);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0];
}


/** Drehung um eine Achse (Rodrigues), Winkel im Bogenmaß. */
export function rotate(v, axis, ang) {
  const k = norm(axis);
  if (!k[0] && !k[1] && !k[2]) return v.slice();
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [
    v[0] * c + kv[0] * s + k[0] * kd,
    v[1] * c + kv[1] * s + k[1] * kd,
    v[2] * c + kv[2] * s + k[2] * kd
  ];
}

/** Punkt an der Ebene (Ursprung o, Normale n) spiegeln. */
export const mirrorPoint = (p, o, n) => addScaled(p, n, -2 * dot(sub(p, o), n));

/** Richtung an derselben Ebene spiegeln (ohne Verschiebung). */
export const mirrorDir = (d, n) => addScaled(d, n, -2 * dot(d, n));

export const rad = d => d * Math.PI / 180;
export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
