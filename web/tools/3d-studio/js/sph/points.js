/* Die Partikel im Bild: Punkte als beleuchtete Kugeln, je Partikel nach
   Geschwindigkeit gefärbt — dieselbe Turbo-Skala wie die Fläche der
   Gitterrechnung (js/lbm/paint.js), damit beide Seiten gleich lesen. Der
   eigene Shader wandelt keine Farbräume: die Tafel kommt mit den Werten
   der Farbleiste (lutFloat), nicht linear.

   Ein Punkt ist eine Kugel vom Partikelabstand: der Vertex-Shader setzt
   die Punktgröße aus Projektion und Abstand (perspektivisch mit dem
   Abstand, parallel fest), der Fragment-Shader verwirft die Ecken des
   Punktquadrats und schattiert die Kugel aus der Punktkoordinate. */

import * as T from 'three';
import { lutFloat } from '../part/colors.js';

const VERT = /* glsl */`
uniform float uSize;
uniform float uHeight;
attribute vec3 color;
varying vec3 vColor;
void main() {
  vColor = color;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float persp = projectionMatrix[2][3] != 0.0 ? -mv.z : 1.0;
  gl_PointSize = uSize * uHeight * projectionMatrix[1][1] * 0.5 / persp;
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = /* glsl */`
varying vec3 vColor;
void main() {
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(c, c);
  if (r2 > 1.0) discard;
  vec3 n = vec3(c.x, -c.y, sqrt(1.0 - r2));
  float l = 0.38 + 0.62 * max(0.0, dot(n, normalize(vec3(0.35, 0.6, 0.72))));
  gl_FragColor = vec4(vColor * l, 1.0);
}`;

/** Die Punktwolke anlegen; `size` ist der Kugeldurchmesser in mm. */
export function createPoints(size) {
  const geo = new T.BufferGeometry();
  geo.setAttribute('position', new T.BufferAttribute(new Float32Array(0), 3));
  geo.setAttribute('color', new T.BufferAttribute(new Float32Array(0), 3));
  const mat = new T.ShaderMaterial({
    uniforms: { uSize: { value: size }, uHeight: { value: 600 } },
    vertexShader: VERT, fragmentShader: FRAG, transparent: false
  });
  const pts = new T.Points(geo, mat);
  pts.frustumCulled = false;
  pts.onBeforeRender = renderer => { mat.uniforms.uHeight.value = renderer.domElement.height || 600; };
  return pts;
}

/** Das Ende der Skala: das q-Quantil der Geschwindigkeit über die
    Partikel, das größte über die Bilder (m/s). */
export function speedScaleParticles(snapshots, q = 0.99) {
  const hist = new Uint32Array(256);
  let best = 0;
  for (const s of snapshots) {
    if (!(s.uMax > 0) || !s.n) continue;
    hist.fill(0);
    for (let i = 0; i < s.n; i++) hist[s.speed[i]]++;
    let acc = 0, b = 255;
    for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= q * s.n) { b = k; break; } }
    best = Math.max(best, b / 255 * s.uMax);
  }
  return best;
}

/** Ein Bild in die Punktwolke: Orte (mm) und Farben nach Geschwindigkeit
    auf der Skala vScale (m/s). `capacity`: so viele Partikel hat das größte
    Bild des Laufs — dafür wird der Platz EINMAL angelegt, gezeichnet wird mit
    setDrawRange nur, was dieses Bild hat. Bis 2026-09-22 kamen neue Felder,
    sobald sich die Zahl änderte (beim Abspielen fast jedes Bild), und die
    alten Puffer blieben auf der Grafikkarte liegen. */
export function showParticles(pts, snap, vScale, capacity = snap.n) {
  const geo = pts.geometry;
  const n = snap.n;
  let pa = geo.getAttribute('position'), ca = geo.getAttribute('color');
  if (pa.count < n) {
    const cap = Math.max(n, capacity);
    geo.dispose();                                   // gibt die zu kleinen Puffer der Karte frei
    pa = new T.BufferAttribute(new Float32Array(3 * cap), 3).setUsage(T.DynamicDrawUsage);
    ca = new T.BufferAttribute(new Float32Array(3 * cap), 3).setUsage(T.DynamicDrawUsage);
    geo.setAttribute('position', pa);
    geo.setAttribute('color', ca);
  }
  pa.array.set(snap.pos);
  const k = vScale > 0 ? snap.uMax / (255 * vScale) : 0;
  const col = ca.array, LUT = lutFloat('turbo');
  for (let i = 0; i < n; i++) {
    const t = Math.max(0, Math.min(255, Math.round(snap.speed[i] * k * 255)));
    col[3 * i] = LUT[3 * t]; col[3 * i + 1] = LUT[3 * t + 1]; col[3 * i + 2] = LUT[3 * t + 2];
  }
  /* Hochgeladen wird nur der Teil, der gezeichnet wird. */
  for (const a of [pa, ca]) { a.clearUpdateRanges(); a.addUpdateRange(0, 3 * n); a.needsUpdate = true; }
  geo.setDrawRange(0, n);
  geo.boundingSphere = null;
  pts.visible = n > 0;
}
