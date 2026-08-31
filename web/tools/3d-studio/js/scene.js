/* Three.js-Grundgerüst beider Viewer: Renderer, Kameras, Licht,
   OrbitControls, Standardansichten. Bewusst ohne Build-Schritt —
   'three' wird über die Import-Map der HTML-Seiten auf vendor/three/
   aufgelöst.

   Zwei Kameras stehen bereit: Zentralprojektion (perspektivisch) und
   2D-Parallelprojektion (orthografisch, für maßstäbliche Risse). Beim
   Umschalten wird der Bildausschnitt umgerechnet, damit das Modell
   gleich groß bleibt. OrbitControls bekommt die neue Kamera zugewiesen;
   scope.object wird dort bei jedem update() gelesen. */

import * as T from 'three';
import { OrbitControls } from '../vendor/three/OrbitControls.js';

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
    minDistance = 60, maxDistance = 8000
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

  const api = { scene, renderer, camera: persp, projection: 'persp' };

  const controls = new OrbitControls(persp, renderer.domElement);
  controls.target.set(...target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.minZoom = 0.02;
  controls.maxZoom = 200;
  api.controls = controls;

  scene.add(new T.HemisphereLight(0xffffff, 0x8fa3ad, 1.0));
  const key = new T.DirectionalLight(0xffffff, 1.4);
  key.position.set(700, 1000, 900);
  scene.add(key);
  const fill = new T.DirectionalLight(0xdfeaee, 0.5);
  fill.position.set(-800, 300, -700);
  scene.add(fill);

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
  new ResizeObserver(resize).observe(container);
  resize();

  renderer.setAnimationLoop(() => {
    controls.update();
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
    cam.lookAt(controls.target);
    controls.update();
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
  return Object.assign(api, { setView, setProjection, fitTo });
}
