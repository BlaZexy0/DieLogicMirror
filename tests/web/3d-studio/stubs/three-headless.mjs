/* Das echte Three.js — nur der WebGLRenderer ist ersetzt.
   Alles andere (BufferGeometry, Vektoren, Kameras, Raycaster …) ist reine
   Mathematik und läuft unter Node. Der Renderer braucht einen GL-Kontext,
   den es hier nicht gibt; für den Test genügt eine Attrappe, die eine
   Leinwand anbietet und die Bildschleife nicht startet.
   `export *` holt alle echten Namen, die lokale Klasse überschreibt den
   gleichnamigen Stern-Export. */
export * from 'three-real';

export class WebGLRenderer {
  constructor() {
    this.domElement = globalThis.document.createElement('canvas');
    this.shadowMap = { enabled: false };
    this.calls = 0;
  }
  setPixelRatio() {}
  setSize(w, h) { this.width = w; this.height = h; }
  setAnimationLoop(fn) { this.loop = fn; }
  render() { this.calls++; }
  clearStencil() {}
  dispose() {}
}
