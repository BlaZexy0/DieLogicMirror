/* Attrappe des GLTFLoader: liefert das Modell, das globalThis.__TEST_GLTF
   bereitstellt — so lässt sich js/die.js ohne Datei und ohne XHR prüfen.
   parse() (Laden aus einem Puffer) liefert dasselbe Modell. */
export class GLTFLoader {
  load(url, onLoad, onProgress, onError) {
    const scene = globalThis.__TEST_GLTF;
    if (!scene) { onError(new Error('kein Testmodell hinterlegt')); return; }
    onLoad({ scene });
  }
  parse(data, path, onLoad, onError) { this.load('', onLoad, undefined, onError); }
}
