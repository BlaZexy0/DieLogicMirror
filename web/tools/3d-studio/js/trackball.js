/* Freies Drehen um einen Punkt — mit Quaternionen statt Kugelkoordinaten.

   Die OrbitControls von Three.js drehen in Azimut und Höhenwinkel um
   eine feste Hochachse. Für ein Bauteil auf einem Raster ist das genau
   richtig: es steht nie auf dem Kopf. Für ein Angusssystem ist es
   hinderlich. Der Anguss liegt in der Trennebene, und die Trennebene
   liegt je nach Ausstoßrichtung anders; man will ihn von unten ansehen
   (dort wird gefräst), man will ihn kippen, und man will am Pol nicht
   klemmen — genau dort steht die Draufsicht auf die Trennebene.

   Deshalb hier eine Drehung ohne bevorzugte Achse: aus dem Mausweg
   entsteht eine Achse IN der Bildebene, daraus ein Quaternion, und damit
   werden Kameraversatz UND Kamera-Oben gemeinsam gedreht. Es gibt keinen
   Pol, keine Sperre und keine Umkehr der Drehrichtung an den Polen.

   Gedreht wird immer um `target`. Der Punkt wandert nur beim Verschieben
   (rechte Maustaste) und beim Einpassen mit, nicht beim Auswählen eines
   Punktes — ein Bild, das bei jedem Klick springt, hilft niemandem.

   Die Schnittstelle ist die der OrbitControls, soweit js/scene.js sie
   benutzt (object, target, update, minDistance/maxDistance, minZoom/
   maxZoom, dispose) — die Ansichtsleiste und die Projektionsumschaltung
   funktionieren dadurch unverändert. */

import * as T from 'three';

const ROTATE = 0, PAN = 1;

export class TrackballControls {
  constructor(object, domElement) {
    this.object = object;
    this.domElement = domElement;
    this.target = new T.Vector3();
    this.enabled = true;
    /* Beide Felder gibt es nur, weil js/scene.js sie bei jedem Steuerwerk
       setzt; hier werden sie entgegengenommen und nicht beachtet. Es wird
       bewusst NICHT nachgelaufen: beim Setzen eines Punktes auf den
       Zehntelmillimeter ist eine Kamera, die nach dem Loslassen noch
       weiterdreht, keine Hilfe, sondern ein Ärgernis. */
    this.enableDamping = false;
    this.dampingFactor = 0;
    this.rotateSpeed = 1.0;
    this.zoomSpeed = 1.0;
    this.minDistance = 1;
    this.maxDistance = 1e5;
    this.minZoom = 0.01;
    this.maxZoom = 500;

    this._mode = -1;
    this._last = { x: 0, y: 0 };
    this._pointers = new Map();
    this._pinch = 0;

    this._onDown = e => this._down(e);
    this._onMove = e => this._move(e);
    this._onUp = e => this._up(e);
    this._onWheel = e => this._wheel(e);
    this._onMenu = e => e.preventDefault();

    domElement.style.touchAction = 'none';
    domElement.addEventListener('pointerdown', this._onDown);
    domElement.addEventListener('pointermove', this._onMove);
    domElement.addEventListener('pointerup', this._onUp);
    domElement.addEventListener('pointercancel', this._onUp);
    domElement.addEventListener('wheel', this._onWheel, { passive: false });
    domElement.addEventListener('contextmenu', this._onMenu);
  }

  dispose() {
    const d = this.domElement;
    d.removeEventListener('pointerdown', this._onDown);
    d.removeEventListener('pointermove', this._onMove);
    d.removeEventListener('pointerup', this._onUp);
    d.removeEventListener('pointercancel', this._onUp);
    d.removeEventListener('wheel', this._onWheel);
    d.removeEventListener('contextmenu', this._onMenu);
  }

  /* ── Zeigergeräte ──────────────────────────────────────────── */
  _down(e) {
    if (!this.enabled) return;
    this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      this._mode = PAN;
      this._pinch = this._pinchDistance();
      return;
    }
    this._mode = (e.button === 0 && !e.shiftKey) ? ROTATE : PAN;
    this._last = { x: e.clientX, y: e.clientY };
    if (this.domElement.setPointerCapture) this.domElement.setPointerCapture(e.pointerId);
  }

  _move(e) {
    if (!this.enabled || this._mode < 0) return;
    if (this._pointers.has(e.pointerId)) this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this._pointers.size === 2) {
      const d = this._pinchDistance();
      if (this._pinch > 0) this.dolly(Math.pow(0.995, (d - this._pinch)));
      this._pinch = d;
      return;
    }
    const dx = e.clientX - this._last.x, dy = e.clientY - this._last.y;
    this._last = { x: e.clientX, y: e.clientY };
    if (this._mode === ROTATE) this.rotateByPixels(dx, dy);
    else this.panByPixels(dx, dy);
  }

  _up(e) {
    this._pointers.delete(e.pointerId);
    if (this._pointers.size < 1) this._mode = -1;
    if (this.domElement.releasePointerCapture && this.domElement.hasPointerCapture
        && this.domElement.hasPointerCapture(e.pointerId)) {
      this.domElement.releasePointerCapture(e.pointerId);
    }
  }

  _pinchDistance() {
    const p = [...this._pointers.values()];
    return p.length === 2 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0;
  }

  _wheel(e) {
    if (!this.enabled) return;
    e.preventDefault();
    this.dolly(Math.pow(0.95, -Math.sign(e.deltaY) * this.zoomSpeed));
  }

  /* ── Bewegungen ────────────────────────────────────────────── */

  /** Mausweg in Bildpunkten → Drehung um eine Achse in der Bildebene. */
  rotateByPixels(dx, dy) {
    if (!dx && !dy) return;
    const el = this.domElement;
    const size = Math.max(Math.min(el.clientWidth || 800, el.clientHeight || 600), 1);
    const angle = Math.hypot(dx, dy) / size * Math.PI * this.rotateSpeed;
    const m = this.object.matrixWorld.elements;
    const right = new T.Vector3(m[0], m[1], m[2]).normalize();
    const up = new T.Vector3(m[4], m[5], m[6]).normalize();
    const axis = up.multiplyScalar(dx).add(right.multiplyScalar(dy));
    if (axis.lengthSq() < 1e-12) return;
    axis.normalize();
    this._apply(new T.Quaternion().setFromAxisAngle(axis, -angle));
  }

  _apply(q) {
    const off = this.object.position.clone().sub(this.target).applyQuaternion(q);
    this.object.position.copy(this.target).add(off);
    this.object.up.applyQuaternion(q).normalize();
    this.object.lookAt(this.target);
    this.object.updateMatrixWorld();
  }

  panByPixels(dx, dy) {
    const el = this.domElement;
    const h = Math.max(el.clientHeight || 600, 1);
    let scale;
    if (this.object.isOrthographicCamera) {
      scale = (this.object.top - this.object.bottom) / this.object.zoom / h;
    } else {
      const dist = this.object.position.distanceTo(this.target);
      scale = 2 * dist * Math.tan(this.object.fov * Math.PI / 360) / h;
    }
    const m = this.object.matrixWorld.elements;
    const right = new T.Vector3(m[0], m[1], m[2]).normalize().multiplyScalar(-dx * scale);
    const up = new T.Vector3(m[4], m[5], m[6]).normalize().multiplyScalar(dy * scale);
    const move = right.add(up);
    this.target.add(move);
    this.object.position.add(move);
    this.object.updateMatrixWorld();
  }

  dolly(factor) {
    if (this.object.isOrthographicCamera) {
      this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom * factor));
      this.object.updateProjectionMatrix();
      return;
    }
    const off = this.object.position.clone().sub(this.target);
    const d = Math.max(this.minDistance, Math.min(this.maxDistance, off.length() / factor));
    this.object.position.copy(this.target).addScaledVector(off.normalize(), d);
    this.object.updateMatrixWorld();
  }

  /** Kamera-Oben wieder auf die Weltachse stellen — nach einer
      Standardansicht, damit „Draufsicht" auch aufrecht steht. */
  resetUp(up = [0, 1, 0]) {
    this.object.up.set(up[0], up[1], up[2]);
    const dir = this.object.position.clone().sub(this.target);
    if (Math.abs(dir.clone().normalize().dot(this.object.up)) > 0.999) this.object.up.set(0, 0, 1);
    this.object.lookAt(this.target);
    this.object.updateMatrixWorld();
  }

  /**
   * Von der Bildschleife bei jedem Bild gerufen. Nachgeführt wird nur
   * die BLICKRICHTUNG: die Kamera schaut immer auf `target`.
   *
   * Das ist nicht bloß Kosmetik. js/scene.js verschiebt Kamera und
   * Zielpunkt auch von außen — beim Einpassen (fitTo), beim Umschalten
   * der Projektion, bei jeder Standardansicht. Die OrbitControls richten
   * die Kamera in ihrem update() neu aus; täte das hier niemand, behielte
   * sie ihre alte Ausrichtung. Genau das ist passiert: nach fitTo() stand
   * die Kamera richtig, schaute aber noch in die Ursprungsrichtung — das
   * Modell lag außerhalb des Sichtkegels und wurde weggeschnitten. Zu
   * sehen war ein leerer Viewport mit tadellosen Kennzahlen.
   */
  update() {
    const off = this.object.position.clone().sub(this.target);
    if (off.lengthSq() < 1e-12) return false;
    if (Math.abs(off.normalize().dot(this.object.up)) > 0.9999) this.resetUp();
    this.object.lookAt(this.target);
    this.object.updateMatrixWorld();
    return true;
  }
}
