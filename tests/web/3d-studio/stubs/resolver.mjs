/* Node-Auflöser für die Viewer-Tests:
   'three'       → die Attrappe (echtes Three ohne WebGLRenderer)
   'three-real'  → das echte Modul aus vendor/
   GLTFLoader    → eine Attrappe, die ein vorbereitetes Modell liefert */
const REAL = new URL('../../../../web/tools/3d-studio/vendor/three/three.module.js', import.meta.url).href;
const STUB = new URL('./three-headless.mjs', import.meta.url).href;
const LOADER = new URL('./gltfloader.mjs', import.meta.url).href;

export function resolve(spec, ctx, next) {
  if (spec === 'three') return { url: STUB, shortCircuit: true };
  if (spec === 'three-real') return { url: REAL, shortCircuit: true };
  if (spec.endsWith('vendor/three/GLTFLoader.js')) return { url: LOADER, shortCircuit: true };
  return next(spec, ctx);
}
