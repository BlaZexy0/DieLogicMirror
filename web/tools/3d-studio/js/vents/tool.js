/* Überlaufdesigner — das Werkzeug im gemeinsamen Rahmen.

   Wer oben im Bild eine Art wählt und auf das Bauteil klickt, setzt dort
   ein Element: Ort ist der getroffene Punkt, Achse die nach außen
   gerichtete Flächennormale — dorthin wachsen Steg, Bohne und Kanal.
   Danach: am Punkt ziehen (in der Tangentialebene, also auf der Wand
   entlang; mit Alt von ihr weg), am Pfeil neu setzen, im Auswahlfeld um
   die Achse drehen und bemaßen.

   Der Überlauf mit Entlüftung trägt eine zweite Kugel am Ende der Bohne
   und dahinter je Kanalpunkt eine weitere: die Griffe heißen „<id>:v0"
   (Bohnenende, fest) und „<id>:v1" … (Kanalpunkte, ziehbar in der
   Wandebene des Elements). „+ Punkt" hängt einen an.

   Der Plan (model.js) ist die Quelle; Körper (geom.js), Kennzahlen und
   Liste entstehen daraus bei jeder Änderung neu. Jede abgeschlossene
   Änderung meldet das Werkzeug dem Gastgeber (host.changed) — daraus
   werden Rückgängig, Entwurf und „Ungespeichert". Ein Zug am Griff ist EIN
   Schritt (gemeldet beim Loslassen), ein Regler ebenso (coalesce).

   Die Modi: Bauteil · Elemente (was gesetzt ist) · Volumen. Die Körper und
   ihre Griffe sind der Plan selbst und stehen in jedem Modus im Bild; das
   Setzen sitzt als Chips über dem Viewport, das Bearbeiten im Auswahlfeld
   daneben. Ein neues Bauteil beginnt mit einem leeren Plan — der alte
   bleibt als Entwurf bei seinem Bauteil. */

import * as T from 'three';
import { facts, slider, numberInput } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit } from '../studio/format.js';
import { kpis } from '../studio/rows.js';
import { writeSTL } from '../part/stlio.js';
import { createHandles, SELECTED_RING } from '../handles.js';
import { setTris, download, safeName, dirText, outward } from '../ui/common.js';
import * as M from './model.js';
import { buildByType, buildAll, volumeOf } from './geom.js';
import { MODES, INSPECTOR, DARSTELLUNG } from './panel.js';

const VENT_POINT_COLOR = '#6f9bc9';
const NEEDS_PART = 'Zuerst ein Bauteil laden — der Klick setzt das Element auf seine Wand.';
const HANDLE_HINT = '<b>Punkt</b> ziehen: auf der Wand · <b>Alt</b>: von ihr weg · <b>Pfeil</b>: neu setzen · <b>Entf</b>: entfernen';

/* Auf den Chips steht die Kurzform — die volle Bezeichnung im title, im
   Auswahlfeld und in der Legende. */
const CHIP_LABEL = { bohne: 'Bohne', entlueftet: 'mit Entlüftung', waschbrett: 'Waschbrett', schlitz: 'Schlitz' };
/* Die Maße einer Art in Gruppen, damit das Auswahlfeld kurz bleibt: eine
   Reiterzeile, darunter nur die Zeilen der gewählten Gruppe (höchstens fünf) —
   so scrollt das Feld auch bei 720 px Fensterhöhe nie. Wer in keine Gruppe
   davor fällt, gehört zum Kanal; „Details" sind die abgeleiteten Zahlen. */
const PARAM_GROUPS = [
  ['Steg', k => k.startsWith('steg')],
  ['Bohne', k => k.startsWith('well') || k === 'draft'],
  ['Sammler', k => k.startsWith('pool')],
  ['Kanal', () => true]
];
const DETAILS = 'Details';

/* Griff-Kennung zerlegen: „l3" ist das Element, „l3:v2" sein zweiter
   Kanalpunkt, „l3:v0" das Bohnenende. */
const splitId = id => {
  const m = /^(.+?):v(\d+)$/.exec(id || '');
  return m ? { base: m[1], k: +m[2] } : { base: id, k: null };
};

export function createUeberlaufTool(host) {
  const { shell, view } = host;
  const ui = host.ui;
  const state = { plan: M.emptyPlan(), ready: false, placing: null, openGroup: '' };
  let wired = false;

  /* ── Szene: je Art ein Körper in der Artfarbe ────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const meshes = {};
  for (const [type, meta] of Object.entries(M.TYPES)) {
    const mat = new T.MeshStandardMaterial({ color: meta.color, roughness: 0.55, metalness: 0.04, side: T.DoubleSide, flatShading: true });
    meshes[type] = new T.Mesh(new T.BufferGeometry(), mat);
    group.add(meshes[type]);
  }

  /* ── Griffe ──────────────────────────────────────────────── */
  function handleItems() {
    const out = [];
    for (const it of M.allItems(state.plan)) {
      const color = M.TYPES[it.type].color;
      out.push({ id: it.id, pos: it.pos, color, dir: it.dir, planeSize: Math.max(24, (it.p.wellW || it.p.ventW || 12) * 2) });
      if (it.type !== 'entlueftet') continue;
      const vw = M.ventWorld(it);
      out.push({ id: it.id + ':v0', pos: vw.exit, color, planeSize: Math.max(24, it.p.ventW * 2) });
      vw.points.forEach((pos, i) => out.push({ id: it.id + ':v' + (i + 1), pos, color: VENT_POINT_COLOR, planeSize: Math.max(24, it.p.ventW * 2) }));
    }
    return out;
  }

  const handles = createHandles({
    view,
    getRefMesh: () => host.part.mesh,
    markColor: M.TYPES.bohne.color,
    items: handleItems,
    /* Gezogen wird in der Tangentialebene der Wand: der Punkt rutscht auf
       ihr entlang. Mit Alt entlang der Normalen, von der Wand weg. Die
       Kanalpunkte liegen in derselben Ebene wie ihr Element. */
    plane: id => {
      const { base, k } = splitId(id);
      const it = state.plan.items[base];
      if (!it) return null;
      if (k === null) return { origin: it.pos, normal: it.dir };
      const vw = M.ventWorld(it);
      return { origin: k === 0 ? vw.exit : vw.points[k - 1], normal: it.dir };
    },
    move: (id, pos) => {
      const { base, k } = splitId(id);
      if (k === null) M.setPos(state.plan, base, pos);
      else if (k > 0) M.setVentPoint(state.plan, base, k, pos);
      /* k = 0, das Bohnenende, sitzt fest an der Bohne. */
    },
    onSelect: () => { cancelAim(); syncSelection(); },
    onChange: what => {
      if (what === 'drag') { rebuild('drag'); return; }
      rebuild();
      if (what === 'drop') { syncSelection(); host.changed(selPart().k === null ? 'Element verschoben' : 'Kanalpunkt verschoben'); }
    },
    onAim: id => startMove(id)
  });

  /* ── Kette: Plan → Anzeige ───────────────────────────────── */
  function rebuild(mode) {
    const by = buildByType(state.plan);
    for (const type of Object.keys(meshes)) setTris(meshes[type], by[type] || []);
    handles.refresh();
    view.invalidate();
    if (mode === 'drag') return;
    updateKpis();
    updateList();
  }

  const label = it => M.TYPES[it.type].label + ' ' + it.id;

  /* Die Zahlen, um die es geht: was das Bauteil wiegt und was die
     Überläufe dazulegen — zusammen ist das, was durch die Anschnitte muss. */
  function updateKpis() {
    const items = M.allItems(state.plan);
    let added = 0;
    for (const it of items) added += volumeOf(it);
    const part = host.part.model ? host.part.model.volume : 0;
    kpis(ui('plan-kpis'), [
      { label: 'Bauteil', value: fmtUnit(part / 1000, 'cm³') },
      { label: 'Überläufe (' + fmt(items.length, 0) + ')', value: fmtUnit(added / 1000, 'cm³') },
      { label: 'Gesamt', value: fmtUnit((part + added) / 1000, 'cm³'), verdict: 'ok' }
    ]);
    shell.setTabBadge('elemente', items.length ? String(items.length) : '');
  }

  function updateList() {
    const items = M.allItems(state.plan);
    const cur = selPart().base;
    ui('item-list').innerHTML = items.map(it =>
      '<button type="button" class="st-list-row' + (it.id === cur ? ' active' : '') + '" data-item="' + it.id + '">'
      + '<span class="dot" style="background:' + M.TYPES[it.type].color + '"></span>'
      + '<span class="name">' + label(it) + '</span><span class="val">' + fmtUnit(volumeOf(it) / 1000, 'cm³') + '</span></button>').join('');
    ui('item-empty').hidden = items.length > 0;
  }
  /* ── Auswahl ─────────────────────────────────────────────── */
  const selPart = () => splitId(handles.selected);
  const sel = () => (handles.selected ? state.plan.items[selPart().base] : null);

  function syncSelection() {
    const it = sel();
    updateList();
    if (!it) { shell.inspector.hide(); shell.status(''); return; }
    const meta = M.TYPES[it.type];
    const part = selPart();
    const sub = part.k === null ? '' : part.k === 0 ? 'Bohnenende' : 'Kanalpunkt ' + part.k;
    shell.inspector.show({ title: '<span class="dot" style="background:' + meta.color + '"></span>' + meta.label + ' <code>' + it.id + '</code>' + (sub ? ' <em>' + sub + '</em>' : '') });
    shell.status(HANDLE_HINT);
    ui('sel-type').value = it.type;
    /* Lage: das Element — oder, bei einem Kanalpunkt, der Punkt selbst. */
    const shown = part.k === null ? it.pos : part.k === 0 ? M.ventWorld(it).exit : M.ventWorld(it).points[part.k - 1];
    for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) { ui(k).value = fmtPlain(shown[i], 1); ui(k).disabled = part.k === 0; }
    ui('sel-rot').value = String(it.rot || 0);
    ui('sel-rot-val').textContent = fmt(it.rot || 0, 0) + '°';
    syncVent(it, part);

    /* Die Maße der Art als Zeilen — jede Art hat andere, deshalb werden sie
       bei jeder Auswahl neu aufgebaut; welche Gruppe offen steht, bleibt. */
    const keys = Object.keys(it.p);
    const row = k => {
      const m = M.PARAM_META[k] || { label: k };
      return '<label class="row"><span>' + m.label + '</span>'
        + '<input type="text" data-param="' + k + '" inputmode="decimal" spellcheck="false" autocomplete="off" value="' + fmtPlain(it.p[k], 2) + '">'
        + '<span class="unit">' + (m.unit === undefined ? 'mm' : m.unit) + '</span></label>';
    };
    const left = keys.slice();
    const groups = [];
    for (const [name, test] of PARAM_GROUPS) {
      const mine = left.filter(test);
      for (const k of mine) left.splice(left.indexOf(k), 1);
      if (mine.length) groups.push([name, mine]);
    }
    const names = [...groups.map(g => g[0]), DETAILS];
    if (!names.includes(state.openGroup)) state.openGroup = names[0];
    ui('sel-groups').innerHTML = names.map(n => '<button type="button" role="tab" data-group-tab="' + n + '">' + n + '</button>').join('');
    ui('sel-params').innerHTML = groups.map(([name, mine]) => '<div data-group="' + name + '">' + mine.map(row).join('') + '</div>').join('');
    showGroup();
    for (const k of keys) {
      const m = M.PARAM_META[k] || { min: 0, max: 1e6 };
      const el = ui('sel-params').querySelector('[data-param="' + k + '"]');
      if (!el) continue;
      numberInput(el, v => {
        const n = sel();
        if (!n) return v;
        const val = m.step === 1 ? Math.round(v) : v;
        n.p[k] = val;
        rebuild();
        syncFacts(n);
        host.changed((M.PARAM_META[k] || { label: k }).label + ' geändert');
        return val;
      }, { min: m.min, max: m.max, unit: m.unit === undefined ? 'mm' : m.unit });
    }
    syncFacts(it);
    ui('del-item').textContent = part.k !== null ? 'Punkt entfernen' : 'Entfernen';
    ui('del-item').disabled = !(part.k === null || (part.k > 0 && M.ventPoints(it).length > 1));
  }

  /* Der Kanal: Punkte anhängen und entfernen — nur beim Überlauf mit Entlüftung. */
  function syncVent(it, part) {
    const on = !!it && it.type === 'entlueftet';
    ui('vent-block').hidden = !(on && state.openGroup === 'Kanal');
    if (!on) return;
    /* Wer einen Kanalpunkt wählt, will am Kanal arbeiten: seine Gruppe zeigen. */
    if (part && part.k !== null && part.k > 0) state.openGroup = 'Kanal';
    const pts = M.ventPoints(it);
    let len = 0, prev = [0, 0];
    for (const q of pts) { len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
    ui('vent-note').textContent = pts.length + (pts.length === 1 ? ' Punkt' : ' Punkte') + ' · ' + fmtUnit(len, 'mm') + ' in der Wandebene';
    ui('vent-del').disabled = !(part && part.k > 0 && pts.length > 1);
  }

  /* Die gewählte Gruppe zeigen — alle anderen (und die Details) verbergen. */
  function showGroup() {
    for (const b of ui('sel-groups').querySelectorAll('[data-group-tab]')) {
      const on = b.getAttribute('data-group-tab') === state.openGroup;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (const g of ui('sel-params').querySelectorAll('[data-group]')) g.hidden = g.getAttribute('data-group') !== state.openGroup;
    ui('sel-facts').hidden = state.openGroup !== DETAILS;
    const it = sel();
    ui('vent-block').hidden = !(it && it.type === 'entlueftet' && state.openGroup === 'Kanal');
  }

  function syncFacts(it) {
    const rows = [['Volumen', fmtUnit(volumeOf(it) / 1000, 'cm³')]];
    if (it.p.stegW) rows.push(['Stegquerschnitt', fmtUnit(it.p.stegW * it.p.stegH, 'mm²')]);
    if (it.p.ventW) rows.push(['Kanalquerschnitt', fmtUnit(it.p.ventW * it.p.ventH, 'mm²')]);
    rows.push(['Achse', dirText(it.dir)]);
    facts(ui('sel-facts'), rows);
  }

  /* Entfernen trifft, was gewählt ist: einen Kanalpunkt (solange einer
     bleibt — der letzte und das Bohnenende sind nicht zu entfernen), oder
     das ganze Element. Gefragt wird nicht; „Rückgängig" holt es zurück. */
  function removeSelected() {
    const it = sel();
    if (!it) return false;
    const part = selPart();
    if (part.k !== null) {
      if (!(part.k > 0) || !M.removeVentPoint(state.plan, it.id, part.k)) return false;
      rebuild();
      handles.select(it.id + ':v' + Math.min(part.k, M.ventPoints(it).length));
      host.changed('Kanalpunkt entfernt');
      host.toastUndo('Kanalpunkt entfernt.');
      return true;
    }
    const name = label(it);
    M.removeItem(state.plan, it.id);
    handles.select(null);
    rebuild();
    host.changed(name + ' entfernt');
    host.toastUndo(name + ' entfernt.');
    return true;
  }

  /* ── Zielmodus: setzen und neu setzen ────────────────────── */
  const aim = shell.aim;
  function cancelAim() {
    const was = handles.aiming;
    handles.cancelAim();
    aim.hide();
    state.placing = null;
    shell.renderChips();
    return was;
  }
  host.cancelAim = cancelAim;

  /** Ein neues Element der Art `type`: der nächste Klick aufs Bauteil setzt es.
      Der Strahl liefert die nach INNEN gerichtete Normale; das Element wächst nach außen. */
  function startPlace(type) {
    if (!M.TYPES[type]) return;
    if (!host.part.model) { shell.toast(NEEDS_PART); return; }
    if (state.placing === type) { cancelAim(); return; }          // derselbe Chip noch einmal: doch nicht
    handles.select(null);
    state.placing = type;
    aim.show(true, M.TYPES[type].label + ': die Stelle am Bauteil anklicken, wo sie sitzen soll. Ziehen dreht die Ansicht, Esc bricht ab.');
    aim.onCancel = cancelAim;
    handles.armAim({
      onHit: hit => {
        aim.hide();
        state.placing = null;
        const it = M.addItem(state.plan, type, hit.point, outward(hit.dir));
        rebuild();
        handles.select(it.id);
        shell.renderChips();
        host.changed(label(it) + ' gesetzt');
      },
      onMiss: () => aim.miss(null, () => handles.aiming)
    });
    shell.renderChips();
  }

  /** Der Klick auf den Pfeil: ein vorhandenes Element an eine andere Stelle. */
  function startMove(id) {
    const it = state.plan.items[id];
    if (!it) return;
    if (!host.part.model) { shell.toast(NEEDS_PART); return; }
    aim.show(true, label(it) + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.');
    aim.onCancel = cancelAim;
    handles.armAim({
      onHit: hit => {
        aim.hide();
        M.placeAt(state.plan, id, hit.point, outward(hit.dir));
        rebuild();
        syncSelection();
        host.changed(label(it) + ' neu gesetzt');
      },
      onMiss: () => aim.miss(null, () => handles.aiming)
    });
  }

  shell.setChips(Object.entries(M.TYPES).map(([type, meta]) => ({
    id: type, label: CHIP_LABEL[type] || meta.label, icon: meta.color, title: meta.label + ' — ' + meta.hint,
    enabled: () => !!host.part.model, reason: NEEDS_PART,
    active: () => state.placing === type,
    onClick: () => startPlace(type)
  })));

  /* ── Verdrahten: sobald der Rahmen die Felder der Modi eingesetzt hat ── */
  function mounted() {
    shell.inspector.body.innerHTML = INSPECTOR;
    shell.inspector.onClose(() => handles.select(null));

    ui('sel-groups').addEventListener('click', ev => {
      const b = ev.target.closest('[data-group-tab]');
      if (!b) return;
      state.openGroup = b.getAttribute('data-group-tab');
      showGroup();
    });

    ui('item-list').addEventListener('click', ev => {
      const row = ev.target.closest('[data-item]');
      if (row) handles.select(row.getAttribute('data-item'));
    });

    ui('sel-type').innerHTML = Object.entries(M.TYPES).map(([k, v]) => '<option value="' + k + '">' + v.label + '</option>').join('');
    ui('sel-type').addEventListener('change', e => {
      const it = sel();
      if (!it) return;
      M.setType(state.plan, it.id, e.target.value);
      rebuild();
      handles.select(it.id);
      syncSelection();
      host.changed('Art geändert');
    });
    for (const [name, axis] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) {
      numberInput(ui(name), v => {
        const it = sel();
        if (!it) return v;
        const part = selPart();
        if (part.k === 0) return v;                                // das Bohnenende sitzt fest
        const base = part.k === null ? it.pos : M.ventWorld(it).points[part.k - 1];
        const p = base.slice();
        p[axis] = v;
        if (part.k === null) M.setPos(state.plan, it.id, p);
        else M.setVentPoint(state.plan, it.id, part.k, p);        // in die Ebene gelotet
        rebuild();
        syncSelection();
        host.changed('Lage geändert');
        return undefined;                                          // syncSelection hat das Feld schon gesetzt
      });
    }
    ui('vent-add').addEventListener('click', () => {
      const it = sel();
      if (!it || it.type !== 'entlueftet') return;
      const n = M.addVentPoint(state.plan, it.id);
      rebuild();
      handles.select(it.id + ':v' + n);
      host.changed('Kanalpunkt angehängt');
    });
    ui('vent-del').addEventListener('click', () => removeSelected());
    slider(ui('sel-rot'), v => {
      const it = sel();
      if (!it || !wired) return;
      M.setRot(state.plan, it.id, v);
      rebuild();
      syncFacts(it);
      if (host.history) host.history.coalesce('rot:' + it.id, 'Drehung geändert');
      host.changed('', { silent: true });
    }, v => fmt(v, 0) + '°', ui('sel-rot-val'));
    ui('del-item').addEventListener('click', () => removeSelected());

    /* ── Darstellung, Legende ────────────────────────────────── */
    const pop = shell.darstellung(DARSTELLUNG);
    slider(pop.querySelector('[data-ui="opacity"]'), v => host.part.setOpacity(v / 100), v => v + ' %', pop.querySelector('[data-ui="opacity-val"]'));
    shell.legend(Object.values(M.TYPES).map(t => '<div class="lg-row"><span class="dot" style="background:' + t.color + '"></span>' + t.label + '</div>').join('')
      + '<div class="lg-row"><span class="dot" style="background:' + VENT_POINT_COLOR + '"></span>Kanalpunkt</div>'
      + '<div class="lg-row"><span class="dot ring" style="border-color:' + SELECTED_RING + '"></span>gewählt</div>');

    rebuild();
    syncSelection();
    wired = true;
  }

  /* ── Plan laden, Bauteil ─────────────────────────────────── */
  function loadPlan(plan) {
    cancelAim();
    state.plan = plan;
    handles.select(null);
    rebuild();
    syncSelection();
  }

  const tool = {
    id: 'ueberlauf',
    modes: MODES.map(m => ({ ...m, enter() {}, leave() {}, primary: () => null })),
    startMode: 'elemente',
    accepts: [M.FORMAT],
    toJSON: () => M.toJSON(state.plan),
    fromJSON: obj => loadPlan(M.fromJSON(obj)),
    serialize: () => M.toJSON(state.plan),
    /* Rückgängig: der Plan wie er war — die Auswahl bleibt, wenn es sie noch
       gibt. Kommt dabei genau EIN Element zurück (das Entfernen wurde
       zurückgenommen), ist es gewählt: man sieht, was wieder da ist, und Entf
       träfe es wieder. */
    restore(doc) {
      const keep = handles.selected;
      const before = new Set(Object.keys(state.plan.items));
      cancelAim();
      state.plan = M.fromJSON(doc);
      const back = Object.keys(state.plan.items).filter(id => !before.has(id));
      const { base, k } = splitId(keep);
      const it = base ? state.plan.items[base] : null;
      const still = it && (k === null || k === 0 || k <= M.ventPoints(it).length);
      handles.select(still ? keep : back.length === 1 ? back[0] : null);
      rebuild();
      syncSelection();
    },
    exports: [{
      label: 'Körper als STL',
      enabled: () => M.allItems(state.plan).length > 0, reason: 'Noch nichts gesetzt.',
      run: () => download(new Blob([writeSTL(buildAll(state.plan), 'DieLogic Überläufe')], { type: 'model/stl' }), safeName((host.part.name || 'ueberlaeufe') + '-ueberlaeufe') + '.stl')
    }],
    keys: {
      Delete: () => removeSelected(),
      Escape: () => { if (!handles.selected) return false; handles.select(null); return true; }
    },
    onPartStart() { state.ready = false; },
    onPart() {
      /* Ein Element sitzt auf der Wand EINES Bauteils: ein neues beginnt leer.
         Der bisherige Plan bleibt als Entwurf bei seinem Bauteil. */
      loadPlan(M.emptyPlan());
      if (host.history) host.history.reset();
      host.part.setLook({ visible: true, colors: false });
      shell.renderChips();
      state.ready = true;
    },
    mounted
  };

  tool.__viewer = {
    state, view, shell, host, tool, handles, group, rebuild, startPlace, startMove, loadPlan,
    get partMesh() { return host.part.mesh; }, get refMesh() { return host.part.mesh; }
  };
  return tool;
}
