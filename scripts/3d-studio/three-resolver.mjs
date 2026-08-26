/* Node-Auflöser für den nackten Import 'three'.
   Der Browser bekommt die Zuordnung über die Import-Map in den HTML-
   Seiten des 3D-Studios; unter Node übernimmt das dieser Hook. */
const THREE = new URL('../../web/tools/3d-studio/vendor/three/three.module.js', import.meta.url).href;

export function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: THREE, shortCircuit: true };
  return next(specifier, context);
}
