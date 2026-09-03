/* Three.js-Grundgerüst aller Viewer: Renderer, Kameras, Licht,
   Steuerwerk, Standardansichten. Bewusst ohne Build-Schritt —
   'three' wird über die Import-Map der HTML-Seiten auf vendor/three/
   aufgelöst.

   Zwei Kameras stehen bereit: Zentralprojektion (perspektivisch) und
   2D-Parallelprojektion (orthografisch, für maßstäbliche Risse). Beim
   Umschalten wird der Bildausschnitt umgerechnet, damit das Modell
   gleich groß bleibt. Das Steuerwerk bekommt die neue Kamera zugewiesen;
   object wird dort bei jedem update() gelesen.

   Zwei Steuerwerke stehen zur Wahl (Option `orbit`): die OrbitControls
   von Three.js und der Quaternionen-Trackball aus js/trackball.js. */

import * as T from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { TrackballControls } from './trackball.js';
import { mountAxes } from './ui/axes.js';

/* Blickrichtung = Standort der Kamera relativ zum Ziel. Ein zweiter Klick
   auf denselben Knopf dreht das Vorzeichen um (X → −X). Die Draufsicht
   ist minimal verkippt, damit die Kamera nicht parallel zum Up-Vektor
   steht. */
const VIEWS = {
  x:   [1, 0, 0],
  y:   [0, 1, -0.04],
  z:   [0, 0, 1],
  iso: [1, 0.75, 1]
};

export function initScene(container, opts = {}) {
  const {
    background = 0xe8eef0,
    gridSize = 3000, gridY = -470, grid: wantGrid = true,
    cameraStart = [1500, 680, -1350], target = [0, 0, 20],
    minDistance = 60, maxDistance = 8000,
    /* 'trackball' dreht frei mit Quaternionen um den Zielpunkt
       (js/trackball.js) — das ist seit dem Angussdesigner der Griff aller
       Viewer: kein Pol, keine Sperre, von unten ansehen geht. 'orbit'
       (Azimut und Höhenwinkel um eine feste Hochachse) bleibt wählbar. */
    orbit = 'trackball',
    /* Mitgeführtes Licht. Ortsfeste Lichter setzen voraus, dass es ein
       „oben" und eine bevorzugte Blickrichtung gibt. Wer frei um einen
       Körper dreht, schaut ständig auf die abgewandte Seite, und die
       liegt dann im Dunkeln. Ein Licht, das mit der Kamera wandert
       (leicht nach oben und zur Seite versetzt, damit es nicht flach
       wird), beleuchtet immer das, was man gerade ansieht. */
    headlight = true,
    /* Nur zeichnen, wenn sich etwas geändert hat. Eine Schleife, die
       sechzigmal je Sekunde ein durchscheinendes Bauteil mit einer
       Million Dreiecken zeichnet, macht die ganze Seite zäh — auch die
       Felder in der Seitenleiste, die damit gar nichts zu tun haben.
       Zeigergeräte, Rad, Größenänderung, Regler und die Ansichtsfunktionen
       melden sich selbst; nach jeder Meldung wird eine Sekunde lang
       jedes Bild gezeichnet (Ergebnisse aus Workern kommen kurz danach),
       die Seite ruft api.invalidate() nach jeder eigenen Änderung, und
       als Netz darunter wird viermal je Sekunde gezeichnet, damit eine
       vergessene Meldung nichts einfriert. */
    renderOnDemand = true,
    /* Das Achsenkreuz unter der Ansichtsleiste (js/ui/axes.js). */
    axes = true
  } = opts;

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.background = new T.Color(background);

  const persp = new T.PerspectiveCamera(40, 1, 5, 40000);
  persp.position.set(...cameraStart);
  const ortho = new T.OrthographicCamera(-1, 1, 1, -1, -40000, 40000);
  ortho.position.copy(persp.position);

  let dirty = true, lastFrame = 0, warmUntil = 0;
  const invalidate = () => { dirty = true; warmUntil = performance.now() + 1000; };
  const api = { scene, renderer, camera: persp, projection: 'persp', invalidate };

  const controls = orbit === 'trackball'
    ? new TrackballControls(persp, renderer.domElement)
    : new OrbitControls(persp, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.minZoom = 0.02;
  controls.maxZoom = 200;
  api.controls = controls;

  /* Mit mitgeführtem Licht tragen die ortsfesten nur noch die Grundform;
     sonst wäre die zugewandte Seite überstrahlt. */
  scene.add(new T.HemisphereLight(0xffffff, headlight ? 0xc6d2d7 : 0x8fa3ad, headlight ? 0.85 : 1.0));
  const key = new T.DirectionalLight(0xffffff, headlight ? 0.5 : 1.4);
  key.position.set(700, 1000, 900);
  scene.add(key);
  const fill = new T.DirectionalLight(0xdfeaee, headlight ? 0.22 : 0.5);
  fill.position.set(-800, 300, -700);
  scene.add(fill);

  let head = null;
  if (headlight) {
    head = new T.DirectionalLight(0xffffff, 0.95);
    scene.add(head);
    scene.add(head.target);
  }
  /* Nur die RICHTUNG eines Richtungslichts zählt, deshalb genügen
     Einheitsbeträge um den Zielpunkt herum. */
  const camRight = new T.Vector3(), camUp = new T.Vector3(), toCam = new T.Vector3();
  function aimHeadlight() {
    if (!head) return;
    const cam = api.camera;
    const m = cam.matrixWorld.elements;
    camRight.set(m[0], m[1], m[2]).normalize();
    camUp.set(m[4], m[5], m[6]).normalize();
    toCam.copy(cam.position).sub(controls.target).normalize();
    head.position.copy(controls.target).add(toCam)
      .addScaledVector(camRight, -0.4).addScaledVector(camUp, 0.5);
    head.target.position.copy(controls.target);
    head.target.updateMatrixWorld();
  }

  let grid = null;
  if (wantGrid) {
    grid = new T.GridHelper(gridSize, 30, 0xb8c4c9, 0xd3dcdf);
    grid.position.y = gridY;
    scene.add(grid);
  }

  /* Halbe Bildhöhe in Modelleinheiten — die gemeinsame Größe beider
     Projektionen. Bei der Parallelprojektion steckt sie im Frustum, bei
     der Zentralprojektion im Kameraabstand. */
  let orthoHalfH = 600;

  function aspect() {
    return Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1);
  }
  function applyOrthoFrustum() {
    const a = aspect();
    ortho.top = orthoHalfH; ortho.bottom = -orthoHalfH;
    ortho.left = -orthoHalfH * a; ortho.right = orthoHalfH * a;
    ortho.updateProjectionMatrix();
  }

  function resize() {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h);
    persp.aspect = aspect();
    persp.updateProjectionMatrix();
    applyOrthoFrustum();
  }
  new ResizeObserver(() => { resize(); dirty = true; }).observe(container);
  resize();

  if (renderOnDemand) {
    const el = renderer.domElement;
    el.addEventListener('pointerdown', invalidate);
    el.addEventListener('pointerup', invalidate);
    el.addEventListener('pointermove', e => { if (e.buttons) dirty = true; });
    el.addEventListener('wheel', invalidate, { passive: true });
    /* Regler und Schalter der Seitenleiste ändern fast immer das Bild —
       so muss nicht jeder einzelne Zuhörer daran denken. */
    for (const ev of ['input', 'change', 'click', 'keydown']) document.addEventListener(ev, invalidate, true);
  }

  let axesGizmo = null;
  if (axes && container.appendChild) {
    axesGizmo = mountAxes(container);
    scene.onBeforeRender = (renderer, scene, camera) => axesGizmo.update(camera);
  }

  renderer.setAnimationLoop(now => {
    if (renderOnDemand && !dirty && now > warmUntil && now - lastFrame < 250) return;
    dirty = false;
    lastFrame = now;
    controls.update();
    aimHeadlight();
    renderer.render(scene, api.camera);
  });

  /* ── Projektion umschalten ──────────────────────────────────── */
  const halfFov = () => persp.fov * Math.PI / 360;

  function setProjection(kind) {
    if (kind === api.projection) return api.projection;
    if (kind === 'ortho') {
      const d = persp.position.distanceTo(controls.target);
      orthoHalfH = d * Math.tan(halfFov());
      ortho.position.copy(persp.position);
      ortho.quaternion.copy(persp.quaternion);
      ortho.zoom = 1;
      applyOrthoFrustum();
      api.camera = ortho;
    } else {
      /* Zurück: Abstand so wählen, dass das Bild gleich groß bleibt. */
      const halfH = orthoHalfH / ortho.zoom;
      const d = halfH / Math.tan(halfFov());
      const dir = ortho.position.clone().sub(controls.target).normalize();
      persp.position.copy(controls.target).addScaledVector(dir, d);
      persp.quaternion.copy(ortho.quaternion);
      api.camera = persp;
    }
    api.projection = kind;
    controls.object = api.camera;
    controls.update();
    dirty = true;
    return kind;
  }

  /* ── Standardansichten ──────────────────────────────────────── */
  let last = { name: null, sign: 1 };

  function setView(name) {
    if (!VIEWS[name]) return last;
    last = { name, sign: last.name === name ? -last.sign : 1 };
    const dir = new T.Vector3(...VIEWS[name]).normalize().multiplyScalar(last.sign);
    const cam = api.camera;
    const d = cam.isOrthographicCamera
      ? Math.max(cam.position.distanceTo(controls.target), orthoHalfH * 4)
      : cam.position.distanceTo(controls.target);
    cam.position.copy(controls.target).addScaledVector(dir, d);
    /* Beim freien Drehen steht „oben" irgendwo — vor einer
       Standardansicht muss es zurück auf die Weltachse, sonst steht die
       Draufsicht schief. */
    if (controls.resetUp) controls.resetUp();
    cam.lookAt(controls.target);
    controls.update();
    dirty = true;
    return last;
  }

  /* Modell einpassen: Ziel auf die Mitte, Abstand bzw. Zoom aus der
     Bounding-Box. Wird vom Teile-Viewer nach jedem Import gebraucht. */
  function fitTo(boxOrObject, margin = 1.25) {
    const box = boxOrObject.isBox3 ? boxOrObject : new T.Box3().setFromObject(boxOrObject);
    if (box.isEmpty()) return;
    const size = box.getSize(new T.Vector3());
    const center = box.getCenter(new T.Vector3());
    const radius = Math.max(size.length() / 2, 1);
    const dir = api.camera.position.clone().sub(controls.target).normalize();
    if (dir.lengthSq() < 0.5) dir.set(1, 0.75, 1).normalize();

    controls.target.copy(center);
    orthoHalfH = radius * margin;
    const d = (orthoHalfH / Math.tan(halfFov()));
    persp.position.copy(center).addScaledVector(dir, d);
    persp.near = Math.max(radius / 500, 0.01);
    /* far muss die Zoomgrenze abdecken: controls.maxDistance ist radius·40,
       far war d + radius·20 — beim Herauszoomen über etwa die halbe
       erlaubte Strecke verschwand das Modell in der Ferne (gemessen bei
       Radius 100: far 2290, maxDistance 4000). */
    persp.far = Math.max(d, radius * 40) + radius * 20;
    persp.updateProjectionMatrix();
    ortho.position.copy(center).addScaledVector(dir, Math.max(d, radius * 4));
    ortho.zoom = 1;
    applyOrthoFrustum();
    controls.minDistance = radius / 20;
    controls.maxDistance = radius * 40;
    dirty = true;
    if (grid) {
      /* Das Raster mitwachsen lassen — sonst liegt es bei einem großen
         Bauteil als Briefmarke darunter und bei einem kleinen bis zum
         Horizont. */
      grid.scale.setScalar(Math.max(0.02, radius * 3 / gridSize));
      grid.position.set(center.x, box.min.y - radius * 0.12, center.z);
    }
    controls.update();
    return { center, radius };
  }

  /* Der Schnitt (inkl. geschlossener Schnittflächen) lebt in clipcaps.js —
     hier bleibt nur localClippingEnabled gesetzt. */
  return Object.assign(api, { setView, setProjection, fitTo, axes: axesGizmo });
}
