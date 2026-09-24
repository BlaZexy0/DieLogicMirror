/* Three.js-Grundgerüst aller Viewer: Renderer, Kameras, Licht,
   Steuerwerk, Standardansichten. Bewusst ohne Build-Schritt —
   'three' wird über die Import-Map der HTML-Seiten auf vendor/three/
   aufgelöst.

   Zwei Kameras stehen bereit: Zentralprojektion (perspektivisch) und
   2D-Parallelprojektion (orthografisch, für maßstäbliche Risse). Beim
   Umschalten wird der Bildausschnitt umgerechnet, damit das Modell
   gleich groß bleibt. Das Steuerwerk bekommt die neue Kamera zugewiesen;
   object wird dort bei jedem update() gelesen.

   Gesteuert wird mit dem Quaternionen-Trackball aus js/trackball.js.

   Gezeichnet wird NUR, wenn sich etwas geändert hat. Eine Schleife, die
   sechzigmal je Sekunde ein durchscheinendes Bauteil mit einer Million
   Dreiecken zeichnet, macht die ganze Seite zäh — auch die Felder in der
   Seitenleiste, die damit gar nichts zu tun haben. Zeigergeräte, Rad,
   Größenänderung, Farbschema, Projektion und Ansichten melden sich hier
   selbst, Regler und Schalter der Seite über ihre Ereignisse (unten); wer
   sonst etwas am Bild ändert — ein Ergebnis, eine geladene Datei, ein
   Schnitt, ein Bild der Wiedergabe —, ruft api.invalidate(). Ein Netz
   darunter, das viermal je Sekunde „zur Sicherheit" zeichnete, gibt es
   nicht mehr (bis zum 23.09.): es hielt Grafikkarte und SwiftShader auf
   jeder ruhenden Seite beschäftigt. */

import * as T from 'three';
import { TrackballControls } from './trackball.js';
import { mountAxes } from './ui/axes.js';
import { ROLE, onScheme } from './part/colors.js';
import { cameraAxes } from './viewmath.js';

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
    cameraStart = [1500, 680, -1350], target = [0, 0, 20],
    minDistance = 60, maxDistance = 8000
  } = opts;

  const renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  /* Die Fläche hinter dem Körper ist die Rolle `viewport` des Farbschemas
     und folgt einem Wechsel sofort (unten). Kein Bodenraster: ein Körper,
     den man frei von allen Seiten ansieht, hat kein „unten". */
  const scene = new T.Scene();
  scene.background = new T.Color(ROLE.viewport);

  const persp = new T.PerspectiveCamera(40, 1, 5, 40000);
  persp.position.set(...cameraStart);
  const ortho = new T.OrthographicCamera(-1, 1, 1, -1, -40000, 40000);
  ortho.position.copy(persp.position);

  let dirty = true;
  const invalidate = () => { dirty = true; };
  const api = { scene, renderer, camera: persp, projection: 'persp', invalidate };

  /* Der Trackball dreht frei mit Quaternionen um den Zielpunkt: kein Pol,
     keine Sperre, von unten ansehen geht. */
  const controls = new TrackballControls(persp, renderer.domElement);
  controls.target.set(...target);
  controls.minDistance = minDistance;
  controls.maxDistance = maxDistance;
  controls.minZoom = 0.02;
  controls.maxZoom = 200;
  api.controls = controls;

  /* Mitgeführtes Licht. Ortsfeste Lichter setzen voraus, dass es ein „oben"
     und eine bevorzugte Blickrichtung gibt. Wer frei um einen Körper dreht,
     schaut ständig auf die abgewandte Seite, und die liegt dann im Dunkeln.
     Ein Licht, das mit der Kamera wandert (leicht nach oben und zur Seite
     versetzt, damit es nicht flach wird), beleuchtet immer das, was man
     gerade ansieht; die ortsfesten tragen daneben nur die Grundform, sonst
     wäre die zugewandte Seite überstrahlt. Alle Lichter sind weiß, der
     Boden des Himmelslichts ein neutrales Grau: ein getöntes Licht färbte
     jeden Körper mit, auch die Sachfarben und die Skalen. */
  const neutral = k => new T.Color(0xffffff).multiplyScalar(k);
  scene.add(new T.HemisphereLight(0xffffff, neutral(0.8), 0.85));
  const key = new T.DirectionalLight(0xffffff, 0.5);
  key.position.set(700, 1000, 900);
  scene.add(key);
  const fill = new T.DirectionalLight(0xffffff, 0.2);
  fill.position.set(-800, 300, -700);
  scene.add(fill);
  const head = new T.DirectionalLight(0xffffff, 0.95);
  scene.add(head);
  scene.add(head.target);
  /* Nur die RICHTUNG eines Richtungslichts zählt, deshalb genügen
     Einheitsbeträge um den Zielpunkt herum. */
  const camRight = new T.Vector3(), camUp = new T.Vector3(), toCam = new T.Vector3();
  function aimHeadlight() {
    const cam = api.camera;
    cameraAxes(cam, camRight, camUp);
    toCam.copy(cam.position).sub(controls.target).normalize();
    head.position.copy(controls.target).add(toCam)
      .addScaledVector(camRight, -0.4).addScaledVector(camUp, 0.5);
    head.target.position.copy(controls.target);
    head.target.updateMatrixWorld();
  }

  /* Ein Wechsel des Farbschemas: die Fläche dahinter sofort nachziehen,
     nicht erst beim nächsten Laden — und neu zeichnen, was die Werkzeuge
     dabei umfärben. */
  onScheme(() => {
    scene.background.set(ROLE.viewport);
    invalidate();
  });

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
  new ResizeObserver(() => { resize(); invalidate(); }).observe(container);
  resize();

  /* Was die Kamera bewegt (der Trackball dreht, schiebt und zoomt in seinen
     Zuhörern, ohne Nachlauf), meldet sich hier. Regler und Schalter der
     Seitenleiste ändern fast immer das Bild — so muss nicht jeder einzelne
     Zuhörer daran denken. Ein Bild je Ereignis, nicht eine Sekunde lang. */
  const el = renderer.domElement;
  el.addEventListener('pointerdown', invalidate);
  el.addEventListener('pointerup', invalidate);
  el.addEventListener('pointermove', e => { if (e.buttons) invalidate(); });
  el.addEventListener('wheel', invalidate, { passive: true });
  for (const ev of ['input', 'change', 'click', 'keydown']) document.addEventListener(ev, invalidate, true);

  /* Das Achsenkreuz unter der Ansichtsleiste (js/ui/axes.js). */
  const axesGizmo = mountAxes(container);
  scene.onBeforeRender = (renderer, scene, camera) => axesGizmo.update(camera);

  /* Was sich nach der Kamera richtet — Griffe und Marken in Bildgröße
     (js/handles.js, die Fundstellen der Füllung), zur Kamera gedrehte
     Ringe —, setzt Maß und Drehung in onBeforeRender. Three.js rechnet die
     Weltmatrizen aber VOR diesem Aufruf: das neue Maß käme erst mit dem
     nächsten Bild, und das kommt beim Zeichnen auf Abruf nicht (nach dem
     Rad, einer Ansicht, einer Größenänderung standen die Griffe im alten
     Maß da). Deshalb laufen diese Aufrufe hier einmal VOR dem Zeichnen;
     beim Zeichnen setzen sie dasselbe noch einmal, ohne Wirkung. */
  const plain = T.Object3D.prototype.onBeforeRender;
  function followCamera(cam) {
    cam.updateMatrixWorld();
    scene.traverseVisible(o => {
      if (o !== scene && o.onBeforeRender !== plain) o.onBeforeRender(renderer, scene, cam, o.geometry, o.material, null);
    });
  }

  renderer.setAnimationLoop(() => {
    if (!dirty) return;
    dirty = false;
    controls.update();
    aimHeadlight();
    followCamera(api.camera);
    renderer.render(scene, api.camera);
    api.frames++;
  });
  /* Gezeichnete Bilder seit dem Start — tests/browser/studio.spec.mjs prüft
     daran, dass eine ruhende Seite nicht mehr zeichnet. */
  api.frames = 0;

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
    invalidate();
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
    invalidate();
    return last;
  }

  /* Modell einpassen: Ziel auf die Mitte, Abstand bzw. Zoom aus der
     Bounding-Box — nach jedem Laden und für „Einpassen". */
  function fitTo(boxOrObject, margin = 1.25) {
    const box = boxOrObject.isBox3 ? boxOrObject : new T.Box3().setFromObject(boxOrObject);
    if (box.isEmpty()) return;
    const size = box.getSize(new T.Vector3());
    const center = box.getCenter(new T.Vector3());
    const radius = Math.max(size.length() / 2, 1);
    const dir = api.camera.position.clone().sub(controls.target).normalize();
    if (dir.lengthSq() < 0.5) dir.set(1, 0.75, 1).normalize();

    controls.target.copy(center);
    /* Das Modell muss in BEIDE Richtungen ins Bild passen. Die halbe Bildhöhe
       allein genügte, solange das Bild breiter als hoch ist; in einem
       hochkant stehenden Viewport (schmales Fenster, Tablett hochkant) ist die
       halbe Breite nur Höhe × Seitenverhältnis — das Modell ragte seitlich
       hinaus. */
    orthoHalfH = radius * margin / Math.min(1, aspect());
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
    invalidate();
    controls.update();
    return { center, radius };
  }

  /* Der Schnitt (inkl. geschlossener Schnittflächen) lebt in clipcaps.js —
     hier bleibt nur localClippingEnabled gesetzt. */
  return Object.assign(api, { setView, setProjection, fitTo, axes: axesGizmo });
}
