/* DieLogic – web/shared/carousel3d.js
   Ein Ring aus leicht gebogenen Bildkarten in 3D (nach dem pmndrs-Beispiel
   „Cards with border radius"), ohne React: Three.js aus dem 3D-Studio.

   Einbindung:
     <div class="dl-carousel" data-theme="light|dark" data-banner="A · B · C">
       <script type="application/json">
         [{ "img": "/assets/cards/x.png", "title": "…", "href": "/…" }, …]
       </script>
     </div>
     <script type="module" src="/shared/carousel3d.js"></script>

   Verhalten: der Ring dreht langsam von selbst und mit dem Seitenscroll;
   Ziehen (Maus, Finger) dreht ihn direkt, ein Klick ohne Ziehen öffnet
   die Karte. Unter dem Zeiger wächst eine Karte und rundet ihre Ecken.
   Ein Textband läuft um den Ring. Three.js wird erst geladen, wenn der
   Abschnitt ins Bild kommt; bei „Bewegung reduzieren" bleibt der Baustein
   leer (die Seite hat darunter immer ihr normales Raster). */

const THREE_URL = '/tools/3d-studio/vendor/three/three.module.js';
const CARD_W = 1, CARD_H = 2 / 3;      // Seitenverhältnis 3:2 wie die Bilder
const FOV = 15;

function palette() {
  const P = window.__PALETTE__ || {};
  return { dark: P.dark || '#002733', surface: P.surface || '#ffffff', bg: P.bg || '#f3f6f6', primaryLight: P.primaryLight || '#3fc2b6', primary: P.primary || '#008c82', muted: P.muted || '#4c6870' };
}

/* Exponentielle Dämpfung wie maath/easing.damp: tau in Sekunden. */
function damp(cur, target, tau, dt) { return cur + (target - cur) * (1 - Math.exp(-dt / tau)); }

/* Gebogene Fläche (Paul West, three.js-Forum): Breite w, Höhe h, Wölbung r. */
function bentPlane(THREE, r, w, h, sx, sy) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const hw = w * 0.5;
  const a = new THREE.Vector2(-hw, 0), b = new THREE.Vector2(0, r), c = new THREE.Vector2(hw, 0);
  const ab = new THREE.Vector2().subVectors(a, b), bc = new THREE.Vector2().subVectors(b, c), ac = new THREE.Vector2().subVectors(a, c);
  const R = (ab.length() * bc.length() * ac.length()) / (2 * Math.abs(ab.cross(ac)));
  const center = new THREE.Vector2(0, r - R);
  const baseAngle = new THREE.Vector2().subVectors(a, center).angle() - Math.PI * 0.5;
  const arc = baseAngle * 2;
  const uv = g.attributes.uv, pos = g.attributes.position, v = new THREE.Vector2();
  for (let i = 0; i < uv.count; i++) {
    v.copy(c).rotateAround(center, arc * (1 - uv.getX(i)));
    pos.setXYZ(i, v.x, pos.getY(i), -v.y);
  }
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/* Kartenmaterial: Bild mit runden Ecken, Zoom um die Mitte, Nebel zum Hintergrund. */
function cardMaterial(THREE, texture, fogColor) {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    uniforms: {
      map: { value: texture },
      radius: { value: 0.08 },
      zoom: { value: 1.35 },
      aspect: { value: CARD_W / CARD_H },
      fogColor: { value: new THREE.Color(fogColor) },
      fogNear: { value: 8.5 },
      fogFar: { value: 12 }
    },
    vertexShader: `
      varying vec2 vUv; varying float vDepth;
      void main() {
        vUv = uv;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D map; uniform float radius, zoom, aspect, fogNear, fogFar; uniform vec3 fogColor;
      varying vec2 vUv; varying float vDepth;
      float roundedBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main() {
        vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
        float d = roundedBox(p, vec2(aspect * 0.5, 0.5), radius);
        float aa = fwidth(d) * 1.2;
        float alpha = 1.0 - smoothstep(-aa, aa, d);
        if (alpha <= 0.001) discard;
        vec2 uvz = (vUv - 0.5) / zoom + 0.5;
        vec4 c = texture2D(map, uvz);
        float f = smoothstep(fogNear, fogFar, vDepth);
        gl_FragColor = vec4(mix(c.rgb, fogColor, f), c.a * alpha);
      }`
  });
}

/* Textband: Canvas-Textur mit dem Bannertext, läuft um den Ring, wellt beim Drehen. */
function bannerMesh(THREE, text, color) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = 96;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.font = '700 54px Inter, system-ui, sans-serif';
  g.fillStyle = color;
  g.textBaseline = 'middle';
  const unit = text + '   ·   ';
  const uw = g.measureText(unit).width;
  for (let x = 0; x < cv.width + uw; x += uw) g.fillText(unit, x, cv.height / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(2, Math.round(cv.width / uw) * 3), 1);
  tex.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, toneMapped: false, depthWrite: false });
  const time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.time = time;
    sh.vertexShader = 'uniform float time;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      'vec3 transformed = vec3(position.x, position.y + sin(time + uv.x * PI * 4.0) / 4.0 * 0.35, position.z);');
  };
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.16, 128, 1, true), mat);
  mesh.userData.time = time;
  return mesh;
}

async function mount(host) {
  let items;
  try { items = JSON.parse(host.querySelector('script[type="application/json"]').textContent); } catch (e) { return; }
  if (!Array.isArray(items) || !items.length) return;
  const THREE = await import(THREE_URL);
  const C = palette();
  const dark = host.dataset.theme === 'dark';
  /* data-fog nennt einen Palettennamen (bg, surface, dark …): die Farbe, in
     die die hinteren Karten verschwinden, muss der Abschnittshintergrund sein. */
  const fogColor = C[host.dataset.fog] || (dark ? C.dark : C.surface);

  const canvas = document.createElement('canvas');
  canvas.className = 'dl-carousel-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);
  const rig = new THREE.Group();
  rig.rotation.z = 0.12;
  scene.add(rig);

  const n = items.length;
  /* Ringradius aus der Kartenzahl (Karten stehen mit etwas Luft nebeneinander);
     die Kamera fährt so weit zurück, dass der Ring ins Bild passt. */
  const radius = Math.max(1.2, n * CARD_W / (2 * Math.PI) * 1.25);
  let camZ = 10;
  const loader = new THREE.TextureLoader();
  const cards = [];
  const geo = bentPlane(THREE, 0.12, CARD_W, CARD_H, 24, 8);
  items.forEach((it, i) => {
    const tex = loader.load(it.img);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const m = new THREE.Mesh(geo, cardMaterial(THREE, tex, fogColor));
    const a = (i / n) * Math.PI * 2;
    m.position.set(Math.sin(a) * radius, 0, Math.cos(a) * radius);
    /* Vorderseite nach außen zur Kamera; das Original dreht die Karten nach
       innen, was bei Fotos nicht auffällt, bei Diagrammen aber alles spiegelt. */
    m.rotation.y = a;
    m.userData = { item: it, hover: 0 };
    rig.add(m);
    cards.push(m);
  });
  if (host.dataset.banner) {
    const b = bannerMesh(THREE, host.dataset.banner, dark ? C.primaryLight : C.primary);
    b.scale.set(radius + 0.35, 1, radius + 0.35);
    b.position.y = -CARD_H * 0.5 - 0.2;
    rig.add(b);
    rig.userData.banner = b;
  }

  /* Zustand: Drehung aus Auto-Lauf, Seitenscroll und Ziehen; Zeiger für Kamera und Hover. */
  let spin = 0, spinVel = 0, dragging = false, dragX = 0, dragMoved = 0, lastScrollY = window.scrollY;
  const pointer = new THREE.Vector2(-10, -10), rc = new THREE.Raycaster();
  let hovered = null, needRay = false, visible = false, last = performance.now();
  const rect = () => canvas.getBoundingClientRect();
  const setPointer = (e) => { const r = rect(); pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); needRay = true; };

  canvas.addEventListener('pointermove', (e) => {
    setPointer(e);
    if (dragging) { const dx = e.clientX - dragX; dragX = e.clientX; dragMoved += Math.abs(dx); spinVel = dx * 0.004; spin += dx * 0.004; }
  });
  canvas.addEventListener('pointerdown', (e) => { dragging = true; dragX = e.clientX; dragMoved = 0; canvas.setPointerCapture(e.pointerId); setPointer(e); });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    if (dragMoved < 6 && hovered && hovered.userData.item.href) window.location.href = hovered.userData.item.href;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* schon frei */ }
  };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => { pointer.set(-10, -10); needRay = true; });

  function resize() {
    const r = rect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    /* Abstand: der Ring (Radius + halbe Karte) soll etwa 92 % der Bildbreite
       füllen, aber nicht näher als das Original (7,5 je 1,4 Radius), sonst
       kippt die Perspektive der vorderen Karten zu stark. */
    const halfW = radius + CARD_W * 0.6;
    const tanH = Math.tan(FOV * Math.PI / 360) * camera.aspect;
    camZ = Math.max(7.5 * radius / 1.4, halfW / (tanH * 0.92));
    for (const c of cards) { c.material.uniforms.fogNear.value = camZ - radius * 1.07; c.material.uniforms.fogFar.value = camZ + radius * 1.43; }
  }
  new ResizeObserver(resize).observe(host);
  resize();

  const io = new IntersectionObserver((es) => { visible = es.some(e => e.isIntersecting); if (visible) { last = performance.now(); requestAnimationFrame(frame); } }, { threshold: 0.05 });
  io.observe(host);

  const camTarget = new THREE.Vector3();
  function frame(now) {
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    /* Drehung: Auto-Lauf, Seitenscroll, Nachlauf des Ziehens */
    const sy = window.scrollY; spin += (sy - lastScrollY) * 0.0012; lastScrollY = sy;
    if (!dragging) { spinVel = damp(spinVel, 0, 0.6, dt); spin += spinVel + 0.08 * dt; }
    rig.rotation.y = -spin;
    /* Kamera folgt dem Zeiger */
    const px = pointer.x > -5 ? pointer.x : 0, py = pointer.y > -5 ? pointer.y : 0;
    const k = camZ / 10;
    camTarget.set(-px * 1.6 * k, (py * 0.8 + 1.5) * k, camZ);
    camera.position.x = damp(camera.position.x, camTarget.x, 0.3, dt);
    camera.position.y = damp(camera.position.y, camTarget.y, 0.3, dt);
    camera.position.z = camZ;
    camera.lookAt(0, 0, 0);
    /* Hover */
    if (needRay || dragging) {
      rc.setFromCamera(pointer, camera);
      const hit = rc.intersectObjects(cards, false)[0];
      const h = hit ? hit.object : null;
      if (h !== hovered) { hovered = h; canvas.style.cursor = h ? 'pointer' : (dragging ? 'grabbing' : 'grab'); }
      needRay = false;
    }
    for (const c of cards) {
      const t = c === hovered ? 1 : 0;
      c.userData.hover = damp(c.userData.hover, t, 0.12, dt);
      const s = 1 + 0.15 * c.userData.hover;
      c.scale.set(s, s, s);
      c.material.uniforms.radius.value = 0.08 + 0.14 * c.userData.hover;
      c.material.uniforms.zoom.value = 1.35 - 0.35 * c.userData.hover;
    }
    const b = rig.userData.banner;
    if (b) { b.userData.time.value += Math.abs(spinVel) * 8 + dt * 0.6; b.material.map.offset.x += dt / 6; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  host.classList.add('is-ready');
}

function init() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const hosts = document.querySelectorAll('.dl-carousel');
  if (!hosts.length) return;
  const io = new IntersectionObserver((es, obs) => {
    es.forEach(e => { if (e.isIntersecting) { obs.unobserve(e.target); mount(e.target).catch(err => console.warn('carousel3d:', err.message)); } });
  }, { rootMargin: '400px 0px' });
  hosts.forEach(h => io.observe(h));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
