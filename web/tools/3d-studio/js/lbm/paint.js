/* Die Schmelze nach Geschwindigkeit färben — gemeinsam für Angussfüllung
   und Kammerfüllung.

   Jedes Bild des Laufs (js/lbm/run.js) trägt neben dem Füllstand den
   Betrag der Geschwindigkeit je Schmelzezelle, als Byte auf das Maximum
   des Bildes bezogen. Die Fläche der Schmelze (Surface Nets auf dem
   halben Füllstand) bekommt je Ecke die Geschwindigkeit der acht
   umliegenden Gitterpunkte, trilinear gewichtet — Gaszellen zählen nicht
   mit, sonst zöge die leere Seite der Front die Farbe nach null.

   Die Schmelze an der Wand ist langsam (Haftbedingung), und im vollen
   Kanal IST die Wand die sichtbare Fläche — mit der Geschwindigkeit der
   Ecke selbst wäre der Anguss einfarbig blau, egal wie schnell er innen
   fließt. Darum trägt jede Ecke die schnellste Schmelze im Umkreis einer
   Zelle: ein Maximumfilter 3×3×3 über das Bild, getrennt je Achse
   (3·N statt 27·N), einmal je gezeigtem Bild.

   Die Skala gilt für den ganzen Lauf, damit ein Bild mit dem nächsten
   vergleichbar bleibt; ihr Ende ist das 99. Perzentil über die Bilder,
   die die Seite ihr gibt — bis zur ersten Ankunft, denn danach herrschen
   Anschnitte bzw. Laufkanal, und der Weg davor wäre einfarbig blau.
   Das Maximum wäre ehrlicher, aber unbrauchbar: die schnellsten Zellen
   sind immer die wenigen an der Engstelle. Was schneller ist, bleibt rot. */

import * as T from 'three';
import { turbo } from '../part/colors.js';
import { fmt, gradient, rgbCss } from '../ui/controls.js';

/* Turbo als Tabelle: die Fläche hat Hunderttausende Ecken je Bild. */
const LUT = new Float32Array(256 * 3);
for (let k = 0; k < 256; k++) LUT.set(turbo(k / 255), 3 * k);

/**
 * Das obere Ende der Skala in Gittereinheiten: das q-Quantil der
 * Geschwindigkeit über die Schmelzezellen eines Bildes, das größte über
 * alle Bilder.
 */
export function speedScale(snapshots, q = 0.99) {
  const hist = new Uint32Array(256);
  let best = 0;
  for (const s of snapshots) {
    if (!(s.uMax > 0) || !s.speed) continue;
    hist.fill(0);
    let n = 0;
    for (let i = 0; i < s.fill.length; i++) if (s.fill[i] > 0) { hist[s.speed[i]]++; n++; }
    let acc = 0, b = 255;
    for (let k = 0; k < 256; k++) { acc += hist[k]; if (acc >= q * n) { b = k; break; } }
    best = Math.max(best, b / 255 * s.uMax);
  }
  return best;
}

/** Maximum über 3×3×3 Zellen, je Achse getrennt; Gas und Stahl tragen 0
    und stören das Maximum nicht. */
export function dilate(speed, dims) {
  const [nx, ny, nz] = dims;
  let a = speed, b = new Uint8Array(speed.length);
  const pass = (stride, n, outer) => {
    for (let o = 0; o < outer; o++) {
      /* o zählt die Zeilen quer zur Achse: für x die (j,k)-Zeilen, für y
         die (i,k)-Zeilen (nicht zusammenhängend), für z die (i,j)-Zeilen. */
      let base;
      if (stride === 1) base = o * nx;
      else if (stride === nx) base = (Math.floor(o / nx) * ny) * nx + (o % nx);
      else base = o;
      for (let t = 0; t < n; t++) {
        const idx = base + t * stride;
        let m = a[idx];
        if (t > 0 && a[idx - stride] > m) m = a[idx - stride];
        if (t < n - 1 && a[idx + stride] > m) m = a[idx + stride];
        b[idx] = m;
      }
    }
    const tmp = a === speed ? new Uint8Array(speed.length) : a;
    a = b; b = tmp;
  };
  pass(1, nx, ny * nz);
  pass(nx, ny, nx * nz);
  pass(nx * ny, nz, nx * ny);
  return a;
}

/* Das zuletzt gefilterte Bild — beim Abspielen kommt jedes Bild einmal,
   beim Hin- und Herziehen des Reglers ist der Filter billig genug. */
let last = { snap: null, dil: null };

/**
 * Die Ecken der Schmelzefläche färben. Das Netz ist eine Dreieckssuppe
 * aus surfaceNets auf dem Gitter des Laufs (Punkt i,j,k liegt bei
 * origin + (i,j,k)·h); uScale ist das Ende der Skala in Gittereinheiten.
 */
export function paintMelt(mesh, snap, domain, uScale) {
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position');
  if (!pos) return;
  let col = geo.getAttribute('color');
  if (!col || col.count !== pos.count) {
    col = new T.BufferAttribute(new Float32Array(pos.count * 3), 3);
    geo.setAttribute('color', col);
  }
  const arr = col.array, p = pos.array;
  const [nx, ny, nz] = domain.dims, o = domain.origin, h = domain.h;
  const { fill } = snap;
  if (last.snap !== snap) last = { snap, dil: dilate(snap.speed, domain.dims) };
  const speed = last.dil;
  const scale = uScale > 0 ? snap.uMax / (255 * uScale) : 0;   // Byte → Anteil der Skala
  for (let v = 0; v < pos.count; v++) {
    const x = (p[3 * v] - o[0]) / h, y = (p[3 * v + 1] - o[1]) / h, z = (p[3 * v + 2] - o[2]) / h;
    const i0 = Math.max(0, Math.min(nx - 2, Math.floor(x)));
    const j0 = Math.max(0, Math.min(ny - 2, Math.floor(y)));
    const k0 = Math.max(0, Math.min(nz - 2, Math.floor(z)));
    const fx = Math.max(0, Math.min(1, x - i0)), fy = Math.max(0, Math.min(1, y - j0)), fz = Math.max(0, Math.min(1, z - k0));
    let sum = 0, w = 0;
    for (let c = 0; c < 8; c++) {
      const dx = c & 1, dy = (c >> 1) & 1, dz = c >> 2;
      const idx = ((k0 + dz) * ny + (j0 + dy)) * nx + (i0 + dx);
      if (fill[idx] === 0) continue;
      const wt = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
      sum += wt * speed[idx]; w += wt;
    }
    const t = w > 0 ? sum / w * scale : 0;
    const k = 3 * Math.max(0, Math.min(255, Math.round(t * 255)));
    arr[3 * v] = LUT[k]; arr[3 * v + 1] = LUT[k + 1]; arr[3 * v + 2] = LUT[k + 2];
  }
  col.needsUpdate = true;
}

/** Die Skala für die Leiste (colorbar in js/ui/controls.js); vScale in
    m/s, until sagt, aus welchen Bildern sie stammt. */
export function speedColorbar(vScale, until = 'des Laufs') {
  const v = vScale > 0 ? vScale : 0;
  return {
    title: 'Geschwindigkeit der Schmelze',
    stops: gradient(t => rgbCss(turbo(t))),
    ticks: [fmt(v, 2) + ' m/s', fmt(v / 2, 2) + ' m/s', '0 m/s'],
    extra: 'Skala: 99. Perzentil ' + until + ' · Schnelleres bleibt rot'
  };
}
