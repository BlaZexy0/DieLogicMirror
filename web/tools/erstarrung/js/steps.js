/* Die eigenen Schritte der Seite „Erstarrung einrichten" — je Schritt ein
   Werkzeug nach dem Vertrag des 3D-Studios (js/studio/host.js), aus
   denselben Zeilen (js/studio/rows.js) wie „Simulation einrichten". Von
   dort kommen der Schritt Körper und die kleinen Hilfen (Vorschlag,
   Umschalter, Tipp ins Bild); der Plan ist derselbe, die Kolbenfläche
   steht in plan.inlet, alles Übrige der Erstarrung in plan.sol.

   Im Bild (createSolLayer): die Körper aus Dateien, Pickkörper für alle,
   die Kolbenfläche mit dem Kolben dahinter, der Formblock als Kanten in den
   Farben der Formhälften, die Trennebene und die Kühlkanäle. */

import * as T from 'three';
import { esc, numberRow, selectRow, kpis } from '../../3d-studio/js/studio/rows.js';
import { surfaceMaterial, download } from '../../3d-studio/js/ui/common.js';
import { rayAt } from '../../3d-studio/js/viewmath.js';
import { ROLE, onScheme } from '../../3d-studio/js/part/colors.js';
import { neighbours, planarRegion, suggestInlet, depthAlong, volume, thickness, bounds } from '../../simulation/js/core/geometry.js';
import { onTap, segFull, suggBox, paintSugg, onSugg } from '../../simulation/js/steps.js';
import { VIEW_PRESETS, ASPECTS, WIDTHS } from '../../simulation/js/core/render.js';
import { dieBlock, segmentDistance, solidTimeEstimate, missing, DEFAULTS, alloyOf } from './core/solcase.js';
import { ALLOYS, liquidus, solidus } from './core/materials.js';
import { designAlloys, payloadOf } from './payload.js';
import { safe, caseName } from './build.js';

const fmt = (x, d = 0) => (isFinite(x) ? Number(x).toLocaleString('de-DE', { maximumFractionDigits: d, minimumFractionDigits: d }) : '–');
const num = s => Number(String(s).replace(',', '.'));
const roleColor = r => ({ part: ROLE.part, runner: ROLE.runner, biscuit: ROLE.biscuit, overflow: ROLE.overflow })[r] || ROLE.steelDark;

/** Der Formblock zum Plan (null ohne Körper oder Kolben). */
export function blockOf(plan) {
  const bodies = plan.included();
  if (!bodies.length) return null;
  return dieBlock({ bodies, plunger: plan.inlet, die: plan.sol.die, mesh: plan.sol.mesh });
}

/* ── Die Schicht im Bild ──────────────────────────────────────────── */
export function createSolLayer(host, plan) {
  const group = new T.Group();
  group.name = 'erstarrung';
  host.view.scene.add(group);
  const shown = new T.Group(), pick = new T.Group(), marks = new T.Group(), die = new T.Group(), chan = new T.Group();
  group.add(shown, pick, marks, die, chan);
  const hidden = new T.MeshBasicMaterial({ visible: false, side: T.DoubleSide });
  const nbrCache = new Map();
  let highlight = null;
  const geo = tris => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(tris), 3)); g.computeVertexNormals(); return g; };
  const clear = (grp, mats = false) => {
    for (const c of [...grp.children]) {
      grp.remove(c);
      c.traverse(o => { if (o.geometry) o.geometry.dispose(); if (mats && o.material) o.material.dispose(); });
    }
  };
  const mat = {
    face: new T.MeshBasicMaterial({ color: ROLE.mark, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    plunger: surfaceMaterial(ROLE.piston, { flat: false, roughness: 0.5, metalness: 0.2 }),
    channel: surfaceMaterial(ROLE.cool, { flat: false, roughness: 0.45 }),
    channelHi: surfaceMaterial(ROLE.mark, { flat: false, roughness: 0.45 }),
    fix: new T.LineBasicMaterial({ color: ROLE.halfFix }),
    mov: new T.LineBasicMaterial({ color: ROLE.halfMov }),
    plane: new T.LineDashedMaterial({ color: ROLE.steelDark, dashSize: 6, gapSize: 4 })
  };
  onScheme(() => {
    mat.face.color.set(ROLE.mark); mat.plunger.color.set(ROLE.piston); mat.channel.color.set(ROLE.cool); mat.channelHi.color.set(ROLE.mark);
    mat.fix.color.set(ROLE.halfFix); mat.mov.color.set(ROLE.halfMov); mat.plane.color.set(ROLE.steelDark);
    rebuild();
  });

  function rebuild() {
    clear(shown, true); clear(pick);
    for (const b of plan.bodies) {
      if (!b.include || !b.tris || b.tris.length < 36) continue;
      if (b.src === 'file') {
        const m = new T.Mesh(geo(b.tris), surfaceMaterial(roleColor(b.role), { roughness: 0.7 }));
        m.userData.bodyId = b.id;
        shown.add(m);
      }
      const p = new T.Mesh(geo(b.tris), hidden);
      p.userData.bodyId = b.id;
      pick.add(p);
    }
    marksRebuild();
  }
  /** Kanten eines Quaders lo…hi */
  function boxLines(lo, hi, m) {
    const P = (a, b, c) => new T.Vector3(a ? hi[0] : lo[0], b ? hi[1] : lo[1], c ? hi[2] : lo[2]);
    const e = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
    const pts = [];
    for (const [a, b, c, d, f, h] of e) pts.push(P(a, b, c), P(d, f, h));
    return new T.LineSegments(new T.BufferGeometry().setFromPoints(pts), m);
  }
  function cylinder(a, b, r, m) {
    const A = new T.Vector3(...a), B = new T.Vector3(...b), L = A.distanceTo(B);
    const c = new T.Mesh(new T.CylinderGeometry(r, r, Math.max(L, 1e-3), 48, 1), m);
    c.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize());
    c.position.copy(A).add(B).multiplyScalar(0.5);
    return c;
  }
  function faceTris(b, faces) {
    const out = new Float32Array(faces.length * 9);
    faces.forEach((f, i) => out.set(b.tris.subarray(f * 9, f * 9 + 9), i * 9));
    return out;
  }
  function marksRebuild() {
    clear(marks); clear(die); clear(chan);
    const blk = plan.included().length ? blockOf(plan) : null;
    const i = plan.inlet, b = i && plan.body(i.bodyId);
    if (i && b) {
      marks.add(new T.Mesh(geo(faceTris(b, i.faces)), mat.face));
      if (blk && isFinite(blk.plungerLength)) {
        const n = i.normal, c = i.centroid;
        marks.add(cylinder(c.map((x, k) => x + n[k] * 0.3), c.map((x, k) => x + n[k] * blk.plungerLength), i.radius * 0.995, mat.plunger));
      }
    }
    if (blk) {
      /* die beiden Hälften als Kanten in ihren Farben, die Trennebene gestrichelt */
      const zp = Math.min(blk.hi[2], Math.max(blk.lo[2], blk.parting));
      const loU = [blk.lo[0], blk.lo[1], zp], hiL = [blk.hi[0], blk.hi[1], zp];
      const lower = boxLines(blk.lo, hiL, blk.fixedBelow ? mat.fix : mat.mov), upper = boxLines(loU, blk.hi, blk.fixedBelow ? mat.mov : mat.fix);
      die.add(lower, upper);
    }
    for (const c of plan.sol.channels) {
      if (!(c.d > 0)) continue;
      chan.add(cylinder(c.a, c.b, c.d / 2, c.id === highlight ? mat.channelHi : mat.channel));
    }
    host.view.invalidate();
  }
  plan.on(w => { if (w === 'bodies' || w === 'apply' || w === 'include') rebuild(); else marksRebuild(); });
  const ray = new T.Raycaster();
  return {
    group, rebuild, marksRebuild,
    pickAt(ev) {
      rayAt(ray, ev, host.view.renderer.domElement, host.view.camera);
      const hit = ray.intersectObjects(pick.children, false)[0];
      if (!hit) return null;
      const body = plan.body(hit.object.userData.bodyId);
      return body ? { body, face: hit.faceIndex } : null;
    },
    neighbours(b) {
      const k = b.id + ':' + b.stamp;
      if (!nbrCache.has(k)) nbrCache.set(k, neighbours(b.tris));
      return nbrCache.get(k);
    },
    highlightChannel(id) { highlight = id; marksRebuild(); },
    set dieVisible(v) { die.visible = v; host.view.invalidate(); }
  };
}

/* ── 4 Kolben: die Kreisfläche des Pressrests ──────────────────────── */
export function createKolbenTool(g, { plan, layer, app }) {
  const modes = [{
    id: 'kolben', label: 'Kolben',
    html: '<div class="sim-label">Kolbenfläche</div>'
      + suggBox('kol-sugg')
      + '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline sim-pick" data-ui="pick" aria-pressed="false">Fläche auswählen</button></div>'
      + '<div class="sim-card" data-ui="kol-card"><div class="sim-card-head" data-ui="kol-row"></div></div>'
      + '<div class="krows" data-ui="kol-kpis"></div>'
      + '<div class="st-hintline">Hinter der Fläche liegt die Kolbenspitze aus Kupfer, wassergekühlt, bis zum Rand des Formblocks. Der Pressrest speist das Gussteil unter Nachdruck, solange sein Kern flüssig ist.</div>',
    primary: () => app.nextPrimary('kolben'),
    enter: () => { if (!plan.inlet) suggest(true); }
  }];
  let active = false, aiming = false;
  function setAim(on) {
    aiming = on;
    g.aim.onCancel = on ? () => setAim(false) : null;
    g.aim.show(on, 'Auf die Kreisfläche des Pressrests tippen, an der der Kolben anliegt');
    g.viewport.classList.toggle('sim-aiming', on);
    const b = g.ui('pick');
    if (b) { b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? 'Auswahl abbrechen' : plan.inlet ? 'Andere Fläche wählen' : 'Fläche auswählen'; }
  }
  function choose(body, r, how = 'gewählt') {
    plan.inlet = { bodyId: body.id, stamp: body.stamp, faces: r.faces, centroid: r.centroid, normal: r.normal, area: r.area, radius: r.radius, depth: depthAlong(body.tris, r.centroid, r.normal) };
    plan.changed('inlet');
    g.changed('Kolbenfläche ' + how);
    app.refresh();
  }
  let cache = { key: null, val: null };
  function suggestion() {
    const cands = plan.included().filter(b => b.role === 'biscuit');
    const pool = cands.length ? cands : plan.included();
    const key = pool.map(b => b.id + ':' + b.stamp).join('|');
    if (cache.key === key) return cache.val;
    let best = null, bb = null;
    for (const b of pool) { const r = suggestInlet(b.tris, layer.neighbours(b)); if (r && (!best || r.area > best.area)) { best = r; bb = b; } }
    cache = { key, val: best ? { body: bb, r: best } : null };
    return cache.val;
  }
  const isSuggested = s => !!(s && plan.inlet && plan.inlet.bodyId === s.body.id && plan.inlet.faces[0] === s.r.faces[0] && plan.inlet.faces.length === s.r.faces.length);
  function suggest(quiet = false) {
    const s = suggestion();
    if (!s) { if (!quiet) g.shell.toast('Keine kreisrunde ebene Fläche gefunden — „Fläche auswählen" und im Bild tippen.'); return; }
    if (aiming) setAim(false);
    choose(s.body, s.r, 'nach Vorschlag');
  }
  function pickAt(ev) {
    if (!active || !aiming || g.shell.mode !== 'kolben') return;
    const hit = layer.pickAt(ev);
    if (!hit) { g.aim.miss('Daneben: dort liegt kein Körper.', () => aiming); return; }
    const r = planarRegion(hit.body.tris, layer.neighbours(hit.body), hit.face);
    if (r.circularity < 0.6) g.shell.toast('Die Fläche ist nicht kreisrund (' + fmt(100 * r.circularity) + ' %) — der Kolben ist ein Zylinder mit gleicher Fläche.', { ms: 6000 });
    setAim(false);
    choose(hit.body, r);
  }
  function render() {
    const i = plan.inlet, b = i && plan.body(i.bodyId), s = suggestion();
    paintSugg(g.ui('kol-sugg'), s ? { value: 'größte Kreisfläche', why: s.body.name + ', Ø ' + fmt(2 * s.r.radius, 1) + ' mm', on: isSuggested(s) } : null);
    const pk = g.ui('pick');
    if (pk && !aiming) pk.textContent = i ? 'Andere Fläche wählen' : 'Fläche auswählen';
    g.ui('kol-card').classList.toggle('empty', !i);
    g.ui('kol-row').innerHTML = i
      ? '<div class="sim-name">Kolbenfläche<small>' + esc(b ? b.name : '–') + ' · ' + fmt(i.area) + ' mm² · Ø ' + fmt(2 * i.radius, 1) + ' mm</small></div>'
        + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" title="Kolbenfläche entfernen" aria-label="Kolbenfläche entfernen">✕</button>'
      : '<div class="st-hintline">Noch keine Kolbenfläche: den Vorschlag übernehmen oder „Fläche auswählen".</div>';
    const blk = i ? blockOf(plan) : null;
    kpis(g.ui('kol-kpis'), i ? [
      { label: 'Kolben', value: 'Ø ' + fmt(2 * i.radius, 1) + ' mm', note: blk && isFinite(blk.plungerLength) ? fmt(blk.plungerLength) + ' mm lang bis zum Rand des Formblocks (Rand im Schritt Form)' : '' },
      { label: 'Pressrest', value: fmt(i.depth, 1) + ' mm', note: 'Tiefe hinter der Fläche' }
    ] : []);
  }
  plan.on(() => render());
  return {
    id: 'kolben', modes, startMode: 'kolben',
    mounted() {
      onTap(g, pickAt);
      g.ui('pick').addEventListener('click', () => setAim(!aiming));
      onSugg(g.ui('kol-sugg'), () => suggest());
      g.ui('kol-row').addEventListener('click', ev => {
        if (!ev.target.closest('[data-act="remove"]') || !plan.inlet) return;
        plan.inlet = null; plan.changed('inlet'); g.changed('Kolbenfläche entfernt'); app.refresh();
      });
      render();
    },
    setActive(on) { active = on; if (!on && aiming) setAim(false); },
    cancelAim() { if (!aiming) return false; setAim(false); return true; },
    aim: on => setAim(on !== false),
    suggest
  };
}

/* ── 5 Form: Formblock und Trennebene ──────────────────────────────── */
export function createFormTool(g, { plan, app }) {
  const modes = [{
    id: 'form', label: 'Form',
    html: '<div class="sim-label">Formblock</div>'
      + numberRow({ ui: 'die-margin', label: 'Stahl um das Gussteil', unit: 'mm' })
      + suggBox('margin-sugg')
      + '<div class="sim-label">Trennebene</div>'
      + numberRow({ ui: 'die-parting', label: 'Lage z', unit: 'mm' })
      + suggBox('parting-sugg')
      + '<div class="st-hintline" data-ui="die-note"></div>'
      + '<div class="krows" data-ui="die-kpis"></div>',
    primary: () => app.nextPrimary('form')
  }];
  /* Vorschlag Rand: anderthalbmal die Wanddicke des Pressrests, auf 5 mm, 30 … 80 mm */
  function marginSuggestion() {
    const d = plan.inlet ? plan.inlet.depth : 20;
    return Math.min(80, Math.max(30, Math.round(1.5 * Math.max(d, 25) / 5) * 5));
  }
  function render() {
    const D = plan.sol.die;
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    set('die-margin', fmt(D.margin)); set('die-parting', fmt(D.parting, 1));
    const ms = marginSuggestion();
    paintSugg(g.ui('margin-sugg'), { value: fmt(ms) + ' mm', why: 'genug Stahl für die Wärme eines Schusses, nicht zu viele Zellen', on: Math.abs(D.margin - ms) < 0.5 });
    paintSugg(g.ui('parting-sugg'), { value: 'z = 0', why: 'die Trennebene des Bauteilsystems', on: Math.abs(D.parting) < 1e-6 });
    const blk = blockOf(plan);
    if (!blk) { kpis(g.ui('die-kpis'), []); return; }
    const size = blk.hi.map((x, k) => x - blk.lo[k]);
    const vCast = plan.included().reduce((s, b) => s + Math.abs(volume(b.tris)), 0) / 1000;
    const vSteel = size[0] * size[1] * size[2] / 1000 - vCast;
    g.ui('die-note').textContent = 'Feste Formhälfte ist die Seite des Kolbens (' + (blk.fixedBelow ? 'unten, z < ' : 'oben, z > ') + fmt(blk.parting, 1) + ' mm), gelb im Bild; die bewegliche rosa. Beide Warmarbeitsstahl 1.2343.';
    kpis(g.ui('die-kpis'), [
      { label: 'Formblock', value: size.map(x => fmt(x)).join(' × ') + ' mm', note: 'Zellen im Stahl ' + fmt(blk.hBg, 1) + ' mm (Schritt Netz)' },
      { label: 'Stahl', value: fmt(vSteel * 7.8 / 1000, 1) + ' kg', note: fmt(vSteel / 1000, 2) + ' dm³ · Gussteil ' + fmt(vCast, 1) + ' cm³' },
      ...(isFinite(blk.plungerLength) ? [{ label: 'Kolben', value: fmt(blk.plungerLength) + ' mm', note: 'von der Kolbenfläche bis zum Rand', verdict: blk.plungerLength > 5 ? 'ok' : 'warn' }] : [])
    ]);
  }
  plan.on(w => { if (['sol', 'bodies', 'include', 'inlet', 'apply'].includes(w)) render(); });
  return {
    id: 'form', modes, startMode: 'form',
    mounted() {
      g.ui('die-margin').addEventListener('change', ev => { const x = num(ev.target.value); if (x >= 5 && x <= 500) { plan.sol.die.margin = x; plan.sol.die.marginSet = true; plan.changed('sol'); g.changed('Stahl um das Gussteil ' + fmt(x) + ' mm'); } render(); app.refresh(); });
      g.ui('die-parting').addEventListener('change', ev => { const x = num(ev.target.value); if (isFinite(x)) { plan.sol.die.parting = x; plan.changed('sol'); g.changed('Trennebene z = ' + fmt(x, 1) + ' mm'); } render(); app.refresh(); });
      onSugg(g.ui('margin-sugg'), () => { plan.sol.die.margin = marginSuggestion(); plan.sol.die.marginSet = false; plan.changed('sol'); g.changed('Rand nach Vorschlag'); render(); });
      onSugg(g.ui('parting-sugg'), () => { plan.sol.die.parting = 0; plan.changed('sol'); g.changed('Trennebene z = 0'); render(); });
      render();
    },
    /* beim ersten Besuch gilt der Vorschlag für den Rand */
    enter() { if (!plan.sol.die.marginSet) { const m = marginSuggestion(); if (m !== plan.sol.die.margin) { plan.sol.die.margin = m; plan.changed('sol'); } } }
  };
}

/* ── 6 Kühlung: gerade Kanäle ──────────────────────────────────────── */
/** Der Vorschlag: je Formhälfte zwei Kanäle längs der längeren Seite des
    Bauteils, 1,5 Ø + 10 mm hinter seiner äußersten Fläche, auf Drittel der
    Breite, über den ganzen Block. Was der Kavität näher als einen Ø kommt,
    fällt weg. */
export function suggestChannels(plan) {
  const blk = blockOf(plan);
  if (!blk) return [];
  const parts = plan.included().filter(b => b.role === 'part');
  const src = parts.length ? parts : plan.included();
  const pb = src.map(b => bounds(b.tris)).reduce((a, b) => ({ lo: a.lo.map((x, k) => Math.min(x, b.lo[k])), hi: a.hi.map((x, k) => Math.max(x, b.hi[k])) }));
  const d = DEFAULTS.channel.d, off = 1.5 * d + 10;
  const along = pb.hi[0] - pb.lo[0] >= pb.hi[1] - pb.lo[1] ? 0 : 1, across = 1 - along;
  const out = [];
  const tris = plan.included().map(b => b.tris);
  for (const z of [Math.max(pb.hi[2], blk.parting) + off, Math.min(pb.lo[2], blk.parting) - off]) {
    if (z <= blk.lo[2] + d || z >= blk.hi[2] - d) continue;
    for (const f of [1 / 3, 2 / 3]) {
      const c = pb.lo[across] + f * (pb.hi[across] - pb.lo[across]);
      const a = [0, 0, z], b = [0, 0, z];
      a[along] = blk.lo[along] - 5; b[along] = blk.hi[along] + 5;
      a[across] = c; b[across] = c;
      const near = Math.min(...tris.map(t => segmentDistance(a, b, t))) - d / 2;
      if (near < d) continue;
      out.push({ id: plan.newChannelId(), a, b, d, T: DEFAULTS.channel.T, h: DEFAULTS.channel.h });
    }
  }
  return out;
}

export function createKuehlungTool(g, { plan, layer, app }) {
  const modes = [{
    id: 'kuehlung', label: 'Kühlung',
    html: '<div class="sim-actions"><button type="button" class="btn btn-sm btn-outline" data-ui="ch-sugg">Vorschlag setzen</button>'
      + '<button type="button" class="btn btn-sm btn-outline" data-ui="ch-add">Kanal hinzufügen</button></div>'
      + '<div class="st-list sim-channels" data-ui="ch-list" data-scroll></div>'
      + '<div class="st-hintline" data-ui="ch-note"></div>',
    primary: () => app.nextPrimary('kuehlung')
  }];
  const dist = new Map();
  function distOf(c) {
    const key = c.a.join(',') + '|' + c.b.join(',') + '|' + plan.included().map(b => b.stamp).join(',');
    if (!dist.has(key)) dist.set(key, Math.min(...plan.included().map(b => segmentDistance(c.a, c.b, b.tris))) - c.d / 2);
    return dist.get(key);
  }
  const P3 = (ui, v) => '<span class="sim-xyz">' + v.map((x, k) => '<input type="text" inputmode="decimal" data-f="' + ui + k + '" value="' + fmt(x, 1) + '" aria-label="' + ui + ' ' + 'xyz'[k] + '">').join('') + '</span>';
  function render() {
    const list = g.ui('ch-list');
    if (!list) return;
    list.innerHTML = plan.sol.channels.map((c, k) => {
      const dd = distOf(c);
      const warn = dd < c.d;
      return '<div class="sim-channel' + (warn ? ' warn' : '') + '" data-id="' + c.id + '">'
        + '<div class="sim-chhead"><span class="sim-name">kanal' + (k + 1) + '<small>' + (dd < 0 ? 'schneidet das Gussteil!' : fmt(dd, 1) + ' mm Stahl bis zur Kavität') + '</small></span>'
        + '<button type="button" class="btn btn-sm btn-outline sim-x" data-act="remove" aria-label="kanal' + (k + 1) + ' entfernen">✕</button></div>'
        + '<div class="sim-chrow"><label>von</label>' + P3('a', c.a) + '</div>'
        + '<div class="sim-chrow"><label>bis</label>' + P3('b', c.b) + '</div>'
        + '<div class="sim-chrow sim-chvals"><label>Ø</label><input type="text" inputmode="decimal" data-f="d" value="' + fmt(c.d, 1) + '"><span>mm</span>'
        + '<label>Wasser</label><input type="text" inputmode="decimal" data-f="T" value="' + fmt(c.T) + '"><span>°C</span>'
        + '<label>h</label><input type="text" inputmode="decimal" data-f="h" value="' + fmt(c.h) + '"><span>W/m²K</span></div></div>';
    }).join('') || '<div class="st-hintline">Keine Kühlkanäle: die Form gibt ihre Wärme nur nach außen ab. „Vorschlag setzen" legt zwei Kanäle je Formhälfte.</div>';
    const bad = plan.sol.channels.filter(c => distOf(c) < 0);
    g.ui('ch-note').textContent = bad.length ? bad.length + ' Kanal/Kanäle schneiden das Gussteil — verschieben oder entfernen.'
      : 'Gerade Bohrungen von „von" nach „bis" (mm, Bauteilsystem); was über den Formblock hinausgeht, tritt dort aus. Je Kanal Wasser und Wärmeübergang.';
    g.ui('ch-note').classList.toggle('warn', bad.length > 0);
  }
  plan.on(w => { if (['sol', 'bodies', 'include', 'apply', 'inlet'].includes(w)) render(); });
  return {
    id: 'kuehlung', modes, startMode: 'kuehlung',
    mounted() {
      g.ui('ch-sugg').addEventListener('click', () => {
        const s = suggestChannels(plan);
        if (!s.length) { g.shell.toast('Kein Platz für Kanäle im Vorschlag — den Rand im Schritt Form vergrößern.'); return; }
        plan.sol.channels = s; plan.changed('sol'); g.changed(s.length + ' Kühlkanäle nach Vorschlag'); app.refresh();
      });
      g.ui('ch-add').addEventListener('click', () => {
        const blk = blockOf(plan);
        if (!blk) return;
        const c = blk.hi.map((x, k) => (x + blk.lo[k]) / 2);
        const z = blk.fixedBelow ? (blk.lo[2] + blk.parting) / 2 : (blk.hi[2] + blk.parting) / 2;
        plan.sol.channels.push({ id: plan.newChannelId(), a: [blk.lo[0] - 5, c[1], z], b: [blk.hi[0] + 5, c[1], z], d: DEFAULTS.channel.d, T: DEFAULTS.channel.T, h: DEFAULTS.channel.h });
        plan.changed('sol'); g.changed('Kühlkanal hinzugefügt'); app.refresh();
      });
      const list = g.ui('ch-list');
      list.addEventListener('click', ev => {
        const row = ev.target.closest('[data-id]');
        if (!row) return;
        if (ev.target.closest('[data-act="remove"]')) {
          plan.sol.channels = plan.sol.channels.filter(c => c.id !== row.getAttribute('data-id'));
          plan.changed('sol'); g.changed('Kühlkanal entfernt'); app.refresh();
        } else layer.highlightChannel(row.getAttribute('data-id'));
      });
      list.addEventListener('focusin', ev => { const row = ev.target.closest('[data-id]'); if (row) layer.highlightChannel(row.getAttribute('data-id')); });
      list.addEventListener('change', ev => {
        const row = ev.target.closest('[data-id]'), f = ev.target.getAttribute('data-f');
        const c = row && plan.sol.channels.find(x => x.id === row.getAttribute('data-id'));
        if (!c || !f) return;
        const x = num(ev.target.value);
        if (!isFinite(x)) { render(); return; }
        if (f === 'd' && x >= 2 && x <= 60) c.d = x;
        else if (f === 'T' && x >= 0 && x <= 350) c.T = x;
        else if (f === 'h' && x > 0 && x <= 1e5) c.h = x;
        else if (/^[ab][012]$/.test(f)) c[f[0]][Number(f[1])] = x;
        plan.changed('sol'); g.changed('Kühlkanal geändert'); app.refresh();
      });
      render();
    },
    setActive(on) { if (!on) layer.highlightChannel(null); }
  };
}

/* ── 7 Netz ───────────────────────────────────────────────────────── */
const CELL_BUDGET = 3e6;
export function createNetzTool(g, { plan, app }) {
  const modes = [{
    id: 'netz', label: 'Netz',
    html: '<div class="sim-label">Gussteil</div>'
      + numberRow({ ui: 'm-cell', label: 'Zellgröße', unit: 'mm' })
      + suggBox('m-sugg')
      + '<div class="sim-label">Form</div>'
      + segFull('m-level', 'Zellen im Stahl', [['1', '2×'], ['2', '4×'], ['3', '8×']], String(plan.sol.mesh.dieLevel))
      + '<div class="st-hintline">Im Stahl größere Zellen; in einem Band um das Gussteil so fein wie im Gussteil, dazwischen in Stufen.</div>'
      + numberRow({ ui: 'm-np', label: 'Prozesse', unit: '' })
      + '<div class="krows" data-ui="m-kpis"></div>',
    primary: () => app.nextPrimary('netz'),
    enter: () => measure()
  }];
  const thick = new Map();
  function suggestion() {
    const parts = plan.included().filter(b => b.role === 'part');
    const wall = Math.min(...parts.map(b => (thick.get(b.stamp) || {}).p10).filter(isFinite));
    if (!isFinite(wall)) return null;
    const vol = plan.included().reduce((s, b) => s + Math.abs(volume(b.tris)), 0);
    /* Wärmeleitung braucht weniger als die Strömung: zwei Zellen über die Wand reichen, das Budget gilt für alles */
    const byWall = Math.floor(wall / 2 * 20) / 20, byBudget = Math.ceil(Math.cbrt(vol * 1.5 / CELL_BUDGET) * 20) / 20;
    const cell = Math.min(4, Math.max(0.5, byWall, byBudget));
    return { cell, why: byBudget > byWall ? 'sonst über ' + fmt(CELL_BUDGET / 1e6) + ' Mio. Zellen im Gussteil' : 'zwei Zellen über die dünnste Bauteilwand (' + fmt(wall, 1) + ' mm)' };
  }
  function measure() {
    for (const b of plan.included()) if (!thick.has(b.stamp)) thick.set(b.stamp, thickness(b.tris));
    const s = suggestion();
    if (s && !plan.sol.mesh.cellSet && Math.abs(plan.sol.mesh.cell - s.cell) > 1e-9) { plan.sol.mesh.cell = s.cell; plan.changed('sol'); }
    render();
  }
  function cells() {
    const blk = blockOf(plan);
    if (!blk) return NaN;
    const M = plan.sol.mesh;
    const vCast = plan.included().reduce((s, b) => s + Math.abs(volume(b.tris)), 0);
    const vBlock = blk.n.reduce((s, x) => s * x, 1) * blk.hBg ** 3;
    let area = 0;
    for (const b of plan.included()) { const t = b.tris; for (let i = 0; i < t.length; i += 9) { const ux = t[i + 3] - t[i], uy = t[i + 4] - t[i + 1], uz = t[i + 5] - t[i + 2], vx = t[i + 6] - t[i], vy = t[i + 7] - t[i + 1], vz = t[i + 8] - t[i + 2]; area += Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx) / 2; } }
    const band = Math.max(3 * M.cell, 8);
    return vCast * 1.15 / M.cell ** 3 + (vBlock - vCast) / blk.hBg ** 3 + area * band / M.cell ** 3 * 0.5;
  }
  function render() {
    const M = plan.sol.mesh;
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    set('m-cell', fmt(M.cell, 2)); set('m-np', String(M.nProc));
    const seg = g.ui('m-level');
    if (seg) for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === String(M.dieLevel));
    const s = suggestion();
    paintSugg(g.ui('m-sugg'), s ? { value: fmt(s.cell, 2) + ' mm', why: s.why, on: Math.abs(M.cell - s.cell) < 1e-9 } : null);
    const n = cells();
    kpis(g.ui('m-kpis'), [
      { label: 'Zellen (grob)', value: fmt(n), verdict: n > 8e6 ? 'bad' : n > 3e6 ? 'warn' : 'ok', note: n > 3e6 ? 'lange Rechnung' : '' },
      { label: 'Stahl', value: fmt(M.cell * Math.pow(2, M.dieLevel), 2) + ' mm', note: 'Zellen weit weg vom Gussteil' }
    ]);
  }
  plan.on(w => { if (['sol', 'bodies', 'include', 'apply', 'inlet'].includes(w)) render(); });
  return {
    id: 'netz', modes, startMode: 'netz',
    mounted() {
      g.ui('m-cell').addEventListener('change', ev => { const x = num(ev.target.value); if (x >= 0.2 && x <= 20) { plan.sol.mesh.cell = x; plan.sol.mesh.cellSet = true; plan.changed('sol'); g.changed('Zellgröße ' + fmt(x, 2) + ' mm'); } render(); app.refresh(); });
      onSugg(g.ui('m-sugg'), () => { const s = suggestion(); if (!s) return; plan.sol.mesh.cell = s.cell; plan.sol.mesh.cellSet = false; plan.changed('sol'); g.changed('Zellgröße nach Vorschlag'); render(); });
      g.ui('m-level').addEventListener('click', ev => { const b = ev.target.closest('[data-value]'); if (!b) return; plan.sol.mesh.dieLevel = Number(b.getAttribute('data-value')); plan.changed('sol'); g.changed('Zellen im Stahl ' + b.textContent); render(); });
      g.ui('m-np').addEventListener('change', ev => { const x = Math.round(num(ev.target.value)); if (x >= 1 && x <= 512) { plan.sol.mesh.nProc = x; plan.changed('sol'); g.changed(x + ' Prozesse'); } render(); });
      render();
    },
    measure
  };
}

/* ── 8 Prozess ────────────────────────────────────────────────────── */
/* [Schlüssel, Bezeichnung, Einheit, Stellen, min, max] */
const T_ROWS = [['Tcast', 'Gießtemperatur', '°C', 0, 300, 1000], ['Tfill', 'Schmelze am Füllende', '°C', 0, 300, 1000], ['Tdie', 'Form', '°C', 0, 20, 500], ['Tplunger', 'Kolbenspitze', '°C', 0, 20, 500]];
const S_ROWS = [['fillTime', 'Füllzeit', 'ms', 0, 1, 5000, 1000], ['pInt', 'Nachdruck', 'bar', 0, 1, 3000], ['tInt', 'Druckaufbau', 'ms', 0, 1, 1000, 1000]];
const Z_ROWS = [['nCycles', 'Schüsse', '', 0, 2, 100], ['cycleTime', 'Takt', 's', 0, 5, 600], ['dieOpen', 'Öffnen nach', 's', 0, 1, 600], ['spray0', 'Sprühen von', 's', 0, 0, 600], ['spray1', 'bis', 's', 0, 0, 600]];
const H_ROWS = [['hLiquid', 'Kontakt flüssig', 'W/m²K', 0, 100, 2e5], ['hSolid', 'Kontakt fest', 'W/m²K', 0, 100, 2e5], ['hDieDie', 'Formteil an Formteil', 'W/m²K', 0, 100, 1e5], ['Tplwater', 'Wasser im Kolben', '°C', 0, 5, 200], ['hSpray', 'Sprühen', 'W/m²K', 0, 10, 2e4]];
const ALL_ROWS = [...T_ROWS, ...S_ROWS, ...Z_ROWS, ...H_ROWS];

export function alloyChoices() {
  return [...ALLOYS.map(a => [a.id, a.name]), ...designAlloys().map(a => [a.id, a.name])];
}

export function createProzessTool(g, { plan, app }) {
  const row = r => numberRow({ ui: 'p-' + r[0], label: r[1], unit: r[2] });
  const modes = [{
    id: 'prozess', label: 'Prozess',
    html: '<div class="sim-label">Legierung</div>'
      + selectRow({ ui: 'p-alloy', label: 'Legierung', options: alloyChoices(), value: plan.sol.process.alloy })
      + '<div class="st-hintline" data-ui="p-alloynote"></div>'
      + '<div class="sim-label">Temperaturen</div>' + T_ROWS.map(row).join('')
      + '<div class="sim-label">Füllung und Nachdruck</div>'
      + segFull('p-start', 'Zustand am Füllende', [['uniform', 'gleichmäßig'], ['fill', 'aus Füllrechnung']], plan.sol.process.start)
      + '<div data-ui="p-fillrow"><label class="row sim-textrow sim-stack"><span>Füllrechnung (Pfad von simulation/ aus)</span><input type="text" data-ui="p-fillcase" spellcheck="false" autocomplete="off" placeholder="../../2026-10-12_Platte/simulation"></label></div>'
      + '<div class="st-hintline" data-ui="p-startnote"></div>'
      + S_ROWS.map(row).join('')
      + '<div class="sim-label">Betrieb</div>'
      + segFull('p-mode', 'Betrieb', [['single', 'ein Schuss'], ['cycles', 'Zyklen']], plan.sol.process.mode)
      + '<div data-ui="p-cycles">' + Z_ROWS.map(row).join('') + '</div>'
      + '<details class="st-details" data-ui="p-more"><summary>Wärmeübergang</summary>' + H_ROWS.map(row).join('') + '</details>'
      + '<div class="krows" data-ui="p-kpis"></div>',
    primary: () => app.nextPrimary('prozess')
  }];
  function scaleOf(r) { return r[6] || 1; }
  function render() {
    const P = plan.sol.process;
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    for (const r of ALL_ROWS) set('p-' + r[0], fmt(P[r[0]] * scaleOf(r), r[3]));
    const al = g.ui('p-alloy');
    if (al) al.value = P.alloy;
    const A = alloyOf(Object.assign({}, P, { alloyData: String(P.alloy).startsWith('auslegung:') ? designAlloys().find(a => a.id === P.alloy) : null }));
    g.ui('p-alloynote').textContent = 'Liquidus ' + fmt(liquidus(A)) + ' °C, Solidus ' + fmt(solidus(A)) + ' °C, Schwindung ' + fmt(100 * (1 - A.rhoLiquid / A.rhoSolid), 1) + ' %'
      + (A.linear ? ' — Festanteil linear zwischen beiden (Werte der Auslegung)' : ' — Festanteil nach der Bibliothek von dieLogicSol');
    for (const [ui, v] of [['p-start', P.start], ['p-mode', P.mode]]) {
      const seg = g.ui(ui);
      if (seg) for (const b of seg.querySelectorAll('button')) b.classList.toggle('active', b.getAttribute('data-value') === v);
    }
    g.ui('p-fillrow').hidden = P.start !== 'fill';
    set('p-fillcase', P.fillCase || '');
    g.ui('p-startnote').textContent = P.start === 'fill'
      ? 'dieLogicSolMapFill übernimmt Temperatur, eingeschlossene Luft und Füllzeit vom letzten Zeitstand der Füllrechnung (Allrun, Variable FUELLUNG).'
      : 'Die Schmelze ist am Füllende überall gleich warm; die Füllzeit zählt nur für die Zeiten ab Füllbeginn.';
    g.ui('p-cycles').hidden = P.mode !== 'cycles';
    const Tl = liquidus(A), Ts = solidus(A);
    const ok = P.Tcast >= P.Tfill && P.Tfill > Ts && P.Tdie < Ts && P.Tplunger < Ts;
    const cyc = P.mode !== 'cycles' || (P.dieOpen < P.cycleTime && P.spray0 >= P.dieOpen && P.spray1 > P.spray0 && P.spray1 <= P.cycleTime);
    const tEst = plan.included().length ? solidTimeEstimate({ bodies: plan.included(), process: P }) / 2 : NaN;
    kpis(g.ui('p-kpis'), [
      { label: 'Überhitzung am Füllende', value: fmt(P.Tfill - Tl) + ' K', verdict: P.Tfill > Tl ? 'ok' : 'warn' },
      { label: 'Temperaturen', value: ok ? 'stimmig' : 'prüfen', verdict: ok ? 'ok' : 'bad', note: 'Guss ≥ Füllende > Solidus > Form, Kolben' },
      ...(P.mode === 'cycles' ? [{ label: 'Zeiten im Takt', value: cyc ? 'stimmig' : 'prüfen', verdict: cyc ? 'ok' : 'bad', note: 'Öffnen < Sprühen < Takt' }] : []),
      ...(isFinite(tEst) ? [{ label: 'Erstarrung (grob)', value: fmt(tEst, 0) + ' s', note: 'Newton am Kontakt über den Modul — die Rechnung weiß es genauer' }] : [])
    ]);
  }
  plan.on(w => { if (['sol', 'apply', 'bodies'].includes(w)) render(); });
  const tool = {
    id: 'prozess', modes, startMode: 'prozess',
    mounted() {
      for (const r of ALL_ROWS) {
        g.ui('p-' + r[0]).addEventListener('change', ev => {
          const x = num(ev.target.value) / scaleOf(r);
          if (isFinite(x) && x * scaleOf(r) >= r[4] && x * scaleOf(r) <= r[5]) { plan.sol.process[r[0]] = r[0] === 'nCycles' ? Math.round(x) : x; plan.changed('sol'); g.changed(r[1] + ' ' + fmt(x * scaleOf(r), r[3])); }
          render(); app.refresh();
        });
      }
      g.ui('p-alloy').addEventListener('change', ev => {
        const P = plan.sol.process;
        P.alloy = ev.target.value;
        const A = alloyOf(Object.assign({}, P, { alloyData: String(P.alloy).startsWith('auslegung:') ? designAlloys().find(a => a.id === P.alloy) : null }));
        /* die Gießtemperatur der Legierung, die Schmelze am Füllende 20 K darunter */
        if (A.Tcast > 0) { P.Tcast = A.Tcast; P.Tfill = A.Tcast - 20; }
        plan.changed('sol'); g.changed('Legierung ' + A.name); render(); app.refresh();
      });
      for (const ui of ['p-start', 'p-mode']) {
        g.ui(ui).addEventListener('click', ev => {
          const b = ev.target.closest('[data-value]');
          if (!b) return;
          plan.sol.process[ui === 'p-start' ? 'start' : 'mode'] = b.getAttribute('data-value');
          plan.changed('sol'); g.changed(b.textContent); render(); app.refresh();
        });
      }
      g.ui('p-fillcase').addEventListener('change', ev => { plan.sol.process.fillCase = String(ev.target.value).trim(); plan.changed('sol'); g.changed('Füllrechnung ' + plan.sol.process.fillCase); render(); app.refresh(); });
      render();
    },
    valid() {
      const P = plan.sol.process, A = alloyOf(P), Ts = solidus(A);
      if (!(P.Tcast >= P.Tfill && P.Tfill > Ts && P.Tdie < Ts && P.Tplunger < Ts)) return false;
      if (P.mode === 'cycles' && !(P.dieOpen < P.cycleTime && P.spray0 >= P.dieOpen && P.spray1 > P.spray0 && P.spray1 <= P.cycleTime)) return false;
      if (P.start === 'fill' && !P.fillCase) return false;
      return true;
    },
    why() {
      const P = plan.sol.process;
      if (P.start === 'fill' && !P.fillCase) return 'Der Pfad zur Füllrechnung fehlt.';
      if (P.mode === 'cycles') return 'Die Temperaturen oder die Zeiten im Takt passen nicht zusammen.';
      return 'Die Temperaturen passen nicht zusammen (Guss ≥ Füllende > Solidus > Form, Kolben).';
    }
  };
  return tool;
}

/* ── 9 Auswertung ─────────────────────────────────────────────────── */
export const SOL_CRITERIA = [
  { id: 'solidTime', label: 'Erstarrungszeit', hint: 'wann jede Stelle des Gussteils fest ist, ab Füllbeginn — die Erstarrungsfolge auf einen Blick' },
  { id: 'sequence', label: 'Erstarrungsfolge', hint: 'die Restschmelze (Festanteil unter 0,7) als Körper über der Zeit, gespeist oder abgeschnitten' },
  { id: 'porosity', label: 'Porosität', hint: 'Schwindungs-, Gas- und Mikroporosität, wo sie über 0,5 % liegt' },
  { id: 'dieTemp', label: 'Formtemperatur', hint: 'die höchste Temperatur der Formoberfläche an jeder Stelle der Kavität' },
  { id: 'soldering', label: 'Klebeneigung', hint: 'Klebeindex an der Formoberfläche (über 1: Kleben wahrscheinlich)' }
];
export function createAuswertungTool(g, { plan, app }) {
  const modes = [{
    id: 'auswertung', label: 'Auswertung',
    html: '<div class="sim-label">Kennwerte</div><div class="st-list" data-ui="a-crit"></div>'
      + numberRow({ ui: 'a-frames', label: 'Bilder der Erstarrungsfolge', unit: '' })
      + '<div class="sim-label">Ansichten</div><div class="st-list" data-ui="a-views"></div>'
      + '<div class="sim-label">Format</div>'
      + selectRow({ ui: 'a-aspect', label: 'Seitenverhältnis', options: ASPECTS.map(a => [a[0], a[0]]), value: plan.sol.post.aspect })
      + selectRow({ ui: 'a-width', label: 'Breite', options: WIDTHS.map(w => [String(w), w + ' px']), value: String(plan.sol.post.width) })
      + '<div class="krows" data-ui="a-kpis"></div>',
    primary: () => app.nextPrimary('auswertung')
  }];
  const VIEWS = VIEW_PRESETS.map(v => [v.id, v.label]);
  function render() {
    const S = plan.sol.post;
    const crit = g.ui('a-crit');
    if (crit) crit.innerHTML = SOL_CRITERIA.map(c => '<label class="sim-check"><input type="checkbox" data-c="' + c.id + '"' + (S.criteria.includes(c.id) ? ' checked' : '') + '><span>' + esc(c.label) + '<small>' + esc(c.hint) + '</small></span></label>').join('');
    const vw = g.ui('a-views');
    if (vw) vw.innerHTML = VIEWS.map(([id, l]) => '<label class="sim-check"><input type="checkbox" data-v="' + id + '"' + (S.views.includes(id) ? ' checked' : '') + '><span>' + esc(l) + '</span></label>').join('');
    const set = (ui, v) => { const el = g.ui(ui); if (el && document.activeElement !== el) el.value = v; };
    set('a-frames', String(S.frames)); set('a-aspect', S.aspect); set('a-width', String(S.width));
    const n = S.views.length * (S.criteria.filter(c => c !== 'sequence').length + (S.criteria.includes('sequence') ? S.frames : 0));
    kpis(g.ui('a-kpis'), [
      { label: 'Bilder', value: fmt(n), note: S.views.length + ' Ansicht(en) · dazu Graphiken der Erstarrung, Temperaturen und Porosität im Bericht' }
    ]);
  }
  plan.on(w => { if (['sol', 'apply'].includes(w)) render(); });
  return {
    id: 'auswertung', modes, startMode: 'auswertung',
    mounted() {
      g.ui('a-crit').addEventListener('change', ev => {
        const id = ev.target.getAttribute('data-c');
        if (!id) return;
        const S = plan.sol.post;
        S.criteria = ev.target.checked ? [...new Set([...S.criteria, id])] : S.criteria.filter(c => c !== id);
        S.criteria = SOL_CRITERIA.map(c => c.id).filter(c => S.criteria.includes(c));
        plan.changed('sol'); g.changed('Kennwerte'); render(); app.refresh();
      });
      g.ui('a-views').addEventListener('change', ev => {
        const id = ev.target.getAttribute('data-v');
        if (!id) return;
        const S = plan.sol.post;
        S.views = ev.target.checked ? [...new Set([...S.views, id])] : S.views.filter(v => v !== id);
        S.views = VIEWS.map(v => v[0]).filter(v => S.views.includes(v));
        plan.changed('sol'); g.changed('Ansichten'); render(); app.refresh();
      });
      g.ui('a-frames').addEventListener('change', ev => { const x = Math.round(num(ev.target.value)); if (x >= 2 && x <= 200) { plan.sol.post.frames = x; plan.changed('sol'); g.changed(x + ' Bilder der Erstarrungsfolge'); } render(); });
      g.ui('a-aspect').addEventListener('change', ev => { plan.sol.post.aspect = ev.target.value; plan.changed('sol'); g.changed('Format ' + ev.target.value); render(); });
      g.ui('a-width').addEventListener('change', ev => { plan.sol.post.width = Number(ev.target.value); plan.changed('sol'); g.changed('Breite ' + ev.target.value + ' px'); render(); });
      render();
    }
  };
}

/* ── 10 Fall ──────────────────────────────────────────────────────── */
export function createExportTool(g, { plan, app }) {
  let busy = false, last = null;
  const miss = () => missing({ bodies: plan.included(), plunger: plan.inlet, mesh: plan.sol.mesh });
  const modes = [{
    id: 'export', label: 'Fall',
    html: '<label class="row sim-textrow"><span>Name</span><input type="text" data-ui="exp-title" spellcheck="false" autocomplete="off"></label>'
      + '<div class="st-hintline">Steht in den Bildern und im Bericht.</div>'
      + '<label class="row sim-textrow sim-stack"><span>Fall (Ordner und ZIP)</span><input type="text" data-ui="exp-case" spellcheck="false" autocomplete="off"></label>'
      + suggBox('case-sugg')
      + '<div class="krows" data-ui="exp-kpis"></div>'
      + '<div class="sim-cmdbox"><div class="sim-cmdhead"><span>Im Terminal</span><button type="button" class="sim-copy" data-ui="exp-copy">Kopieren</button></div>'
      + '<pre class="sim-cmd" data-ui="exp-cmd"></pre></div>'
      + '<div class="st-hintline">Mit mehreren Prozessen: <code>NP=8 ./Allrun</code>. Den Zustand einer Füllrechnung übernimmt <code>FUELLUNG=&lt;pfad&gt; ./Allrun</code>. Am Ende liegt der Bericht in <code>auswertung/bericht.html</code>.</div>'
      + '<div class="sim-label">Im ZIP</div><ul class="sim-tree" data-ui="exp-tree"></ul>',
    primary: () => ({ label: busy ? 'Fall wird gebaut …' : 'Fall herunterladen (ZIP)', onClick: run, disabled: busy || miss().length > 0, reason: miss().join(' ') })
  }];
  function render() {
    const t = g.ui('exp-title');
    if (t && document.activeElement !== t) t.value = plan.title;
    const sug = caseName(plan.title), root = plan.caseName ? safe(plan.caseName) : sug;
    const c = g.ui('exp-case');
    if (c && document.activeElement !== c) c.value = root;
    paintSugg(g.ui('case-sugg'), { value: sug, why: 'Datum von heute und Name — Ordner und ZIP', on: root === sug });
    const cmd = g.ui('exp-cmd');
    if (cmd) cmd.textContent = 'unzip ' + root + '.zip\ncd ' + root + '\nsource \\\n  /usr/lib/openfoam/openfoam2606/etc/bashrc\n./Allrun';
    const tree = g.ui('exp-tree');
    if (tree) tree.innerHTML = [
      ['Allrun', 'Netz, Rechnung, Auswertung'], ['bilder.py · bericht.py', 'Bilder (ParaView), Bericht (Python 3)'],
      ['auswertung.json', 'Einstellungen der Auswertung'], ['simulation/', 'der OpenFOAM-Fall für dieLogicSolFoam'], ['auswertung/', 'entsteht am Ende: bericht.html, bilder, graphiken, daten']
    ].map(([f, x]) => '<li><code>' + esc(root + '/' + f) + '</code><span>' + esc(x) + '</span></li>').join('');
    kpis(g.ui('exp-kpis'), [
      { label: 'Gussteil', value: plan.included().length + ' Körper', note: plan.included().map(b => b.name).join(' · ') },
      { label: 'Kühlkanäle', value: String(plan.sol.channels.length) },
      { label: 'Solver', value: 'dieLogicSolFoam', note: 'OpenFOAM v2606' },
      ...(last ? [{ label: 'Zuletzt gebaut', value: last.root + '.zip', note: fmt(last.size / 1e6, 1) + ' MB · rund ' + fmt(last.info.cells) + ' Zellen', verdict: 'ok' }] : [])
    ]);
  }
  async function run() {
    if (busy) return;
    busy = true; app.refresh();
    try {
      const r = await app.build(payloadOf(plan), text => g.shell.setNote(text));
      const name = r.root + '.zip';
      download(new Blob([r.zip], { type: 'application/zip' }), name);
      last = { root: r.root, size: r.zip.length, info: r.info };
      plan.exported = true;
      g.shell.toast('Heruntergeladen: ' + name + ' — entpacken und ./Allrun.', { ms: 7000 });
      g.shell.setNote('Heruntergeladen: ' + name + ' (' + fmt(r.zip.length / 1e6, 1) + ' MB).', 'ok');
    } catch (err) {
      g.shell.setNote(err.message, 'bad');
      console.error(err);
    } finally {
      busy = false; render(); app.refresh();
    }
  }
  plan.on(() => render());
  return {
    id: 'export', modes, startMode: 'export',
    mounted() {
      g.ui('exp-copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(g.ui('exp-cmd').textContent); g.shell.toast('Befehle kopiert.'); }
        catch { g.shell.toast('Kopieren ging nicht — die Befehle bitte markieren.'); }
      });
      g.ui('exp-title').addEventListener('change', ev => { const s = String(ev.target.value).trim(); if (s) { plan.title = s; plan.changed('title'); g.changed('Name „' + s + '"'); } render(); });
      g.ui('exp-case').addEventListener('change', ev => {
        const s = safe(String(ev.target.value).trim());
        plan.caseName = s && s !== caseName(plan.title) ? s : null;
        plan.changed('title'); g.changed('Fall „' + (plan.caseName || caseName(plan.title)) + '"'); render();
      });
      onSugg(g.ui('case-sugg'), () => { plan.caseName = null; plan.changed('title'); g.changed('Fall nach Vorschlag'); render(); });
      render();
    },
    exports: [{ label: 'OpenFOAM-Fall der Erstarrung (ZIP)', enabled: () => !miss().length, run }],
    run, get last() { return last; }
  };
}
