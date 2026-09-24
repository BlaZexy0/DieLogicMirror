/* Überlaufdesigner — das Werkzeug im gemeinsamen Rahmen.

   Wer oben im Bild eine Art wählt und auf das Bauteil klickt, setzt dort
   ein Element: Ort ist der getroffene Punkt, Hochachse die nach außen
   gerichtete Flächennormale — Steg, Bohne und Kanal liegen in der
   Wandebene (js/vents/model.js). Danach: am Punkt ziehen (in der
   Tangentialebene, also auf der Wand entlang; mit Alt von ihr weg; Esc
   bricht den Zug ab), am Pfeil neu setzen, im Auswahlfeld um die Achse
   drehen und bemaßen.

   Der Überlauf mit Entlüftung trägt eine zweite Kugel am Ende der Bohne
   und dahinter je Kanalpunkt eine weitere: die Griffe heißen „<id>:v0"
   (Bohnenende, fest) und „<id>:v1" … (Kanalpunkte, ziehbar in der
   Wandebene des Elements). „+ Punkt" hängt einen an.

   Der Plan (model.js) ist die Quelle; Körper (geom.js), Kennzahlen und
   Liste entstehen daraus bei jeder Änderung neu. Jede abgeschlossene
   Änderung meldet das Werkzeug dem Gastgeber (host.changed) — daraus
   werden Rückgängig, Entwurf und „Ungespeichert". Ein Zug am Griff ist EIN
   Schritt (gemeldet beim Loslassen), ein Regler ebenso (coalesce).

   Die Modi: Elemente (was gesetzt ist) · Volumen. Die Körper und
   ihre Griffe sind der Plan selbst und stehen in jedem Modus im Bild; das
   Setzen sitzt als Chips über dem Viewport, das Bearbeiten im Auswahlfeld
   daneben. Ein neues Bauteil beginnt mit einem leeren Plan — der alte
   bleibt als Entwurf bei seinem Bauteil. */

import * as T from 'three';
import { facts, slider, numberInput, POS_LIMIT } from '../ui/controls.js';
import { fmt, fmtPlain, fmtUnit, parseNumber } from '../studio/format.js';
import { kpis, esc, selTitle, groupTabs, listRow, onListPick, legendRow, selectedRow } from '../studio/rows.js';
import { saveSTL } from '../studio/files.js';
import { createHandles, createPlacer } from '../handles.js';
import { onScheme, ELEMENT } from '../part/colors.js';
import { setTris, dirText, outward, surfaceMaterial } from '../ui/common.js';
import * as M from './model.js';
import { buildByType, buildAll, volumeOf } from './geom.js';
import { MODES, INSPECTOR, DARSTELLUNG } from './panel.js';

const NEEDS_PART = 'Zuerst ein Bauteil laden; der Klick setzt das Element auf seine Wand.';
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
  let placer = null;
  const state = {
    plan: M.emptyPlan(), ready: false,
    /** Welche Art gerade gesetzt wird (ihr Chip ist aktiv) — oder null. */
    get placing() { return placer ? placer.placing : null; }
  };

  /* ── Szene: je Art ein Körper in der Artfarbe ────────────── */
  const group = new T.Group();
  view.scene.add(group);
  const meshes = {};
  for (const [type, meta] of Object.entries(M.TYPES)) {
    meshes[type] = new T.Mesh(new T.BufferGeometry(), surfaceMaterial(meta.color, { roughness: 0.55, metalness: 0.04 }));
    group.add(meshes[type]);
  }
  /* Die Artfarben folgen dem Farbschema (js/part/colors.js): die Körper
     umfärben, Liste, Auswahlfeld und Legende neu. Die Griffe gleicht
     js/handles.js selbst ab, die Chips der Rahmen. */
  onScheme(() => {
    for (const [type, meta] of Object.entries(M.TYPES)) meshes[type].material.color.set(meta.color);
    syncSelection();
    updateLegend();
    view.invalidate();
  });

  /* ── Griffe ──────────────────────────────────────────────── */
  function handleItems() {
    const out = [];
    for (const it of M.allItems(state.plan)) {
      const color = M.TYPES[it.type].color;
      out.push({ id: it.id, pos: it.pos, color, dir: it.dir, planeSize: Math.max(24, (it.p.wellW || it.p.ventW || 12) * 2) });
      if (it.type !== 'entlueftet') continue;
      const vw = M.ventWorld(it);
      out.push({ id: it.id + ':v0', pos: vw.exit, color, planeSize: Math.max(24, it.p.ventW * 2) });
      vw.points.forEach((pos, i) => out.push({ id: it.id + ':v' + (i + 1), pos, color: ELEMENT.kanalpunkt, planeSize: Math.max(24, it.p.ventW * 2) }));
    }
    return out;
  }

  const handles = createHandles({
    view,
    getRefMesh: () => host.part.mesh,
    /* Die Marke beim Zielen in der Farbe der Art, die gesetzt oder
       versetzt wird. */
    markColor: () => M.TYPES[state.placing || (sel() ? sel().type : 'bohne')].color,
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
    onSelect: () => { placer.cancel(); syncSelection(); },
    onChange: what => {
      if (what === 'drag') { rebuild('drag'); return; }
      /* Esc mitten im Zug: zurück zum Stand davor — der Zug war nie ein Schritt. */
      if (what === 'cancel') { if (!host.revert()) { rebuild(); syncSelection(); } return; }
      rebuild();
      if (what === 'drop') { syncSelection(); host.changed(selPart().k === null ? 'Element verschoben' : 'Kanalpunkt verschoben'); }
    },
    onAim: id => startMove(id)
  });
  placer = createPlacer({ aim: shell.aim, handles, onEnd: () => shell.renderChips() });

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
    ui('item-list').innerHTML = items.map(it => listRow({
      id: it.id, color: M.TYPES[it.type].color, name: esc(label(it)),
      value: fmtUnit(volumeOf(it) / 1000, 'cm³'), active: it.id === cur
    })).join('');
    ui('item-empty').hidden = items.length > 0;
  }
  /* ── Auswahl ─────────────────────────────────────────────── */
  const selPart = () => splitId(handles.selected);
  const sel = () => (handles.selected ? state.plan.items[selPart().base] : null);
  /* Die Gruppen des Auswahlfelds (js/studio/rows.js) und der Drehregler —
     beide gibt es, sobald der Rahmen das Feld eingesetzt hat (mounted). */
  let groups = null, rot = null;

  function syncSelection() {
    if (!groups) return;
    const it = sel();
    updateList();
    if (!it) { shell.inspector.hide(); shell.status(''); return; }
    const meta = M.TYPES[it.type];
    const part = selPart();
    const sub = part.k === null ? '' : part.k === 0 ? 'Bohnenende' : 'Kanalpunkt ' + part.k;
    shell.inspector.show({ title: selTitle({ color: meta.color, label: meta.label, id: it.id, extra: sub ? ' <em>' + sub + '</em>' : '' }) });
    shell.status(HANDLE_HINT);
    ui('sel-type').value = it.type;
    /* Lage: das Element — oder, bei einem Kanalpunkt, der Punkt selbst. */
    const shown = part.k === null ? it.pos : part.k === 0 ? M.ventWorld(it).exit : M.ventWorld(it).points[part.k - 1];
    for (const [k, i] of [['sel-x', 0], ['sel-y', 1], ['sel-z', 2]]) { ui(k).value = fmtPlain(shown[i], 1); ui(k).disabled = part.k === 0; }
    rot.set(it.rot || 0);

    /* Die Maße der Art als Zeilen — jede Art hat andere, deshalb werden sie
       bei jeder Auswahl neu aufgebaut; welche Gruppe offen steht, bleibt.
       Wer einen Kanalpunkt wählt, will am Kanal arbeiten: dessen Gruppe. */
    const keys = Object.keys(it.p);
    const row = k => {
      const m = M.PARAM_META[k] || { label: k };
      return '<label class="row"><span>' + m.label + '</span>'
        + '<input type="text" data-param="' + k + '" inputmode="decimal" spellcheck="false" autocomplete="off" value="' + fmtPlain(it.p[k], 2) + '">'
        + '<span class="unit">' + (m.unit === undefined ? 'mm' : m.unit) + '</span></label>';
    };
    const left = keys.slice();
    const list = [];
    for (const [name, test] of PARAM_GROUPS) {
      const mine = left.filter(test);
      for (const k of mine) left.splice(left.indexOf(k), 1);
      if (mine.length) list.push([name, mine]);
    }
    ui('sel-params').innerHTML = list.map(([name, mine]) => '<div data-group="' + name + '">' + mine.map(row).join('') + '</div>').join('');
    groups.set([...list.map(g => g[0]), DETAILS], part.k > 0 ? 'Kanal' : '');
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
    syncVent(it, part);
    syncFacts(it);
    ui('del-item').textContent = part.k !== null ? 'Punkt entfernen' : 'Entfernen';
    ui('del-item').disabled = !(part.k === null || (part.k > 0 && M.ventPoints(it).length > 1));
  }

  /* Die gewählte Gruppe zeigt ihre Maße (groupTabs); dazu gehören die
     abgeleiteten Zahlen zu „Details" und der Kanal zu „Kanal". */
  function showExtras(open) {
    const it = sel();
    ui('sel-facts').hidden = open !== DETAILS;
    ui('vent-block').hidden = !(it && it.type === 'entlueftet' && open === 'Kanal');
  }

  /* Der Kanal: Punkte anhängen und entfernen — nur beim Überlauf mit Entlüftung. */
  function syncVent(it, part) {
    if (it.type !== 'entlueftet') return;
    const pts = M.ventPoints(it);
    let len = 0, prev = [0, 0];
    for (const q of pts) { len += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q; }
    ui('vent-note').textContent = pts.length + (pts.length === 1 ? ' Punkt' : ' Punkte') + ' · ' + fmtUnit(len, 'mm') + ' in der Wandebene';
    ui('vent-del').disabled = !(part && part.k > 0 && pts.length > 1);
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
      host.removed('Kanalpunkt');
      return true;
    }
    const name = label(it);
    M.removeItem(state.plan, it.id);
    handles.select(null);
    rebuild();
    host.removed(name);
    return true;
  }

  /* ── Zielmodus: setzen und neu setzen (js/handles.js, createPlacer) ── */
  /** Ein neues Element der Art `type`: der nächste Klick aufs Bauteil setzt es.
      Der Strahl liefert die nach INNEN gerichtete Normale; das Element wächst nach außen. */
  function startPlace(type) {
    if (!M.TYPES[type]) return;
    if (!host.part.model) { shell.toast(NEEDS_PART); return; }
    if (state.placing === type) { placer.cancel(); return; }       // derselbe Chip noch einmal: doch nicht
    handles.select(null);
    placer.aim({
      what: type,
      text: M.TYPES[type].label + ': die Stelle am Bauteil anklicken, wo sie sitzen soll. Ziehen dreht die Ansicht, Esc bricht ab.',
      onHit: hit => {
        const it = M.addItem(state.plan, type, hit.point, outward(hit.dir));
        rebuild();
        handles.select(it.id);
        host.changed(label(it) + ' gesetzt');
      }
    });
    shell.renderChips();
  }

  /** Der Klick auf den Pfeil: ein vorhandenes Element an eine andere Stelle. */
  function startMove(id) {
    const it = state.plan.items[id];
    if (!it) return;
    if (!host.part.model) { shell.toast(NEEDS_PART); return; }
    placer.aim({
      text: label(it) + ': die neue Stelle am Bauteil anklicken. Esc bricht ab.',
      onHit: hit => {
        M.placeAt(state.plan, id, hit.point, outward(hit.dir));
        rebuild();
        syncSelection();
        host.changed(label(it) + ' neu gesetzt');
      }
    });
  }

  shell.setChips(Object.entries(M.TYPES).map(([type, meta]) => ({
    id: type, label: CHIP_LABEL[type] || meta.label, icon: () => meta.color, title: meta.label + ': ' + meta.hint,
    enabled: () => !!host.part.model, reason: NEEDS_PART,
    active: () => state.placing === type,
    onClick: () => startPlace(type)
  })));

  /* ── Verdrahten: sobald der Rahmen die Felder der Modi eingesetzt hat ── */
  function mounted() {
    shell.inspector.body.innerHTML = INSPECTOR;
    shell.inspector.onClose(() => handles.select(null));
    groups = groupTabs({ tabs: ui('sel-groups'), box: ui('sel-params'), onShow: showExtras });
    onListPick(ui('item-list'), id => handles.select(id));

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
        /* Ins Feld gehört, wo der Punkt jetzt IST: ein Kanalpunkt wird in die
           Wandebene gelotet und landet selten beim eingetippten Wert — und
           numberInput schriebe sonst den getippten zurück. Mit einer Stelle
           wie in syncSelection. */
        const now = part.k === null ? it.pos : M.ventWorld(it).points[part.k - 1];
        return parseNumber(fmtPlain(now[axis], 1));
      }, POS_LIMIT);
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
    rot = slider(ui('sel-rot'), v => {
      const it = sel();
      if (!it) return;
      M.setRot(state.plan, it.id, v);
      rebuild();
      syncFacts(it);
      host.changed('Drehung geändert', { coalesce: 'rot:' + it.id });
    }, v => fmt(v, 0) + '°', ui('sel-rot-val'), { fire: false });
    ui('del-item').addEventListener('click', () => removeSelected());

    /* ── Darstellung, Legende ────────────────────────────────── */
    const pop = shell.darstellung(DARSTELLUNG);
    slider(pop.querySelector('[data-ui="opacity"]'), v => host.part.setOpacity(v / 100), v => v + ' %', pop.querySelector('[data-ui="opacity-val"]'));
    updateLegend();

    rebuild();
    syncSelection();
  }

  function updateLegend() {
    shell.legend(Object.values(M.TYPES).map(t => legendRow(t.color, t.label)).join('')
      + legendRow(ELEMENT.kanalpunkt, 'Kanalpunkt') + selectedRow());
  }

  /* ── Plan laden, Bauteil ─────────────────────────────────── */
  function loadPlan(plan) {
    placer.cancel();
    state.plan = plan;
    handles.select(null);
    rebuild();
    syncSelection();
  }

  const tool = {
    id: 'ueberlauf',
    modes: MODES,
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
      placer.cancel();
      state.plan = M.fromJSON(doc);
      const back = Object.keys(state.plan.items).filter(id => !before.has(id));
      const { base, k } = splitId(keep);
      const it = base ? state.plan.items[base] : null;
      /* Einen Kanalpunkt — auch das Bohnenende — gibt es nur beim Überlauf mit
         Entlüftung: nahm Rückgängig die Art oder den Punkt zurück, geht die
         Auswahl ans Element selbst. Früher blieb sie an einem Griff hängen,
         den es nicht mehr gab (kein Ring, Lage und Entfernen gesperrt). */
      const still = it && (k === null || (it.type === 'entlueftet' && k <= M.ventPoints(it).length));
      handles.select(still ? keep : it ? base : back.length === 1 ? back[0] : null);
      rebuild();
      syncSelection();
    },
    exports: [{
      label: 'Körper als STL',
      enabled: () => M.allItems(state.plan).length > 0, reason: 'Noch nichts gesetzt.',
      run: () => saveSTL(buildAll(state.plan), 'DieLogic Überläufe', host.part.name, 'ueberlaeufe')
    }],
    keys: {
      Delete: () => removeSelected(),
      /* Esc hebt die Auswahl auf. Einen laufenden Zug und das Zielen bricht
         der Rahmen vorher ab (cancelDrag, cancelAim). */
      Escape: () => {
        if (!handles.selected) return false;
        handles.select(null);
        return true;
      }
    },
    cancelDrag: () => !!handles.cancelDrag(),
    cancelAim: () => placer.cancel(),
    onPartStart() { state.ready = false; },
    onPart() {
      /* Ein Element sitzt auf der Wand EINES Bauteils: ein neues beginnt leer.
         Der bisherige Plan bleibt als Entwurf bei seinem Bauteil. */
      loadPlan(M.emptyPlan());
      host.resetHistory();
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
