/* GLB-Export unter Node — die zwei Kunstgriffe, die dafür nötig sind,
   an einer Stelle: ein Auflöser für den nackten Import 'three'
   (scripts/3d-studio/three-resolver.mjs) und ein winziger FileReader, den der
   GLTFExporter für den Binärblock erwartet. Beides gibt es im Browser
   von Haus aus.

   Wird von build-glb.mjs (Formmodell) und build-parts.mjs
   (Beispielteile) daneben benutzt. */

import { register } from 'node:module';

register(new URL('./three-resolver.mjs', import.meta.url));

globalThis.FileReader = class FileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then(
      buf => { this.result = buf; this.onloadend && this.onloadend(); },
      err => { this.error = err; this.onerror && this.onerror(err); });
  }
};

const { GLTFExporter } = await import('../../web/tools/3d-studio/vendor/three/GLTFExporter.js');

/** Szene als binäres glTF serialisieren. */
export function exportGLB(root) {
  return new Promise((resolve, reject) => {
    new GLTFExporter().parse(root, resolve, reject, { binary: true });
  });
}

export const three = await import('three');
