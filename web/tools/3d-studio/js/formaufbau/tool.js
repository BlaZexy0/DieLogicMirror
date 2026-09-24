/* Formaufbau — das Werkzeug im gemeinsamen Rahmen (form.html).

   Eine Form als bearbeitbare Baugruppe (js/assembly.js): voreingestellt
   kommt assets/die.glb, dazu lassen sich STL-Dateien in Gruppen laden,
   Teile umbenennen, verschieben, färben und entfernen, Gruppen anlegen —
   und das Ganze als eine GLB speichern und wieder laden. Die Liste der
   Gruppen und Teile zeichnet js/formaufbau/list.js; hier läuft die
   Verdrahtung: Dateien, Modi, Schnitt, Öffnen, Hover — und das
   HERVORHEBEN.

   Die Modi: Teile (die Liste) · Schnitt (besitzt die Schnittebene) ·
   Öffnen (besitzt den Weg). Ein Modus nimmt, was er im Bild zeigt, beim
   Verlassen mit: aufgeschnitten ist die Form nur im Schnitt, offen steht
   sie nur beim Öffnen. Achse, Lage und Weg bleiben eingestellt und gelten
   beim nächsten Besuch wieder. Die Deckkraft Stahl steht unter
   „Darstellung" im Bild — sie gilt in jedem Modus.

   Hervorheben ist der Heizkühlplan für die Halle: ein Tipp auf ein Teil
   (in der Liste oder im Bild), auf eine Gruppe oder auf „Temperierung",
   und genau das bleibt deckend, alles andere wird blass — der Stahl unter
   seine Deckkraft, Gussteil und Anguss ebenso. Ein zweiter Tipp nimmt es
   wieder heraus, „Aufheben" und Esc räumen alles. Die Hervorhebung ist eine
   Sache der Ansicht, nicht der Baugruppe: sie gilt in jedem Modus und
   steht nicht in der GLB.

   Die Form ist das Dokument. Umbenennen, Verschieben, Färben, Entfernen,
   Gruppen und STL-Teile meldet das Werkzeug dem Gastgeber
   (host.changed); der Verlauf zieht dabei die Metadaten ab
   (assembly.metadata), Rückgängig bringt die Baugruppe auf einen Abzug
   zurück (assembly.apply), und der Entwurf im Browser ist derselbe Abzug.
   „Speichern" schreibt die GLB (save), kein JSON. Dateien liest das
   Werkzeug selbst (openFiles): eine GLB ist eine ganze Form, mehrere STL
   kommen auf einmal in die aufgeklappte Gruppe.

   Die Zuordnung Modell ↔ Liste läuft über Knotennamen und userData
   (glTF-extras) — beides überlebt den GLB-Roundtrip. Der Formaufbau kennt
   die Geometrie NUR über die GLB; eine extern erzeugte Datei (CAD-Export)
   funktioniert, solange sie die Knoten „fixedRoot" und „movingRoot" mit
   Teil-Knoten darunter trägt (Namen, die die Registry nicht kennt, landen
   in „Sonstige Teile"). */

import * as T from 'three';
import { GLTFLoader } from '../../vendor/three/GLTFLoader.js';
import { initClipCaps } from '../clipcaps.js';
import { createAssembly, SLIDE_DIRS } from '../assembly.js';
import { MATERIAL_CLASSES } from '../materials.js';
import { parseSTL } from '../part/stlio.js';
import { isGLB } from '../part/glbio.js';
import { onScheme } from '../part/colors.js';
import { readBuffer, looksLikeJSON } from '../ui/common.js';
import { slider, segButtons, facts } from '../ui/controls.js';
import { fmt, fmtUnit, parseNumber } from '../studio/format.js';
import { esc } from '../studio/rows.js';
import { saveGLB, baseName } from '../studio/files.js';
import { rayAt } from '../viewmath.js';
import { createPartList } from './list.js';
import { MODES, DARSTELLUNG } from './panel.js';

/* Die Beispielform: die Kaltkammerform der Ölwanne (openscad_parts). Ihr
   Entwurf heißt nach `key`, gespeichert wird sie als `file`.glb. */
const EXAMPLE = { url: 'assets/die.glb', name: 'Ölwanne (Beispielform)', key: 'beispielform', file: 'formaufbau' };
/* Was sich als Form laden lässt, in einem Satz für die Meldungen. */
const LOADABLE = 'Laden lässt sich eine GLB, die der Formaufbau gespeichert hat, oder eine mit den Knoten „fixedRoot" und „movingRoot".';
const ACCEPT = '.glb,.stl,model/gltf-binary,model/stl,application/sla';

/* Blass, aber noch da: so viel bleibt von einem nicht hervorgehobenen
   Teil — der Stahl fast weg, das Gegossene als Schemen, damit die Lage
   des Kreises im Teil lesbar bleibt. */
const GHOST = { steel: 0.06, other: 0.14 };

export function createFormaufbauTool(host) {
  const { shell, view } = host;
  const ui = host.ui;
  const state = {
    ready: false,
    /** Die hervorgehobenen Teile (ids) — Ansicht, nicht Form. */
    highlight: new Set(),
    opacity: 0.4,                         // Deckkraft Stahl
    open: 0.6,                            // Weg im Modus Öffnen, Anteil am ganzen
    clip: { axis: 'x', pos: 0, flip: false },
    formOpen: false,                      // „Neue Gruppe" steht an der Stelle der Liste
    source: null                          // { name, key, example }
  };
  let asm = null, clip = null, list = null;
  const sliders = {};
  const source = shell.header.partFields;
  let target = null;                      // die Gruppe für die nächsten STL (⋯ → STL laden)
  let formSide = 'mov';
  /* Eine Meldung, die stehen bleibt (eine Datei ging nicht): der Hover
     schreibt die Zeile unten links, und die Meldung ist, was dort ohne
     Hover steht. Früher überschrieb das erste Zucken der Maus die Meldung,
     bevor jemand sie gelesen hatte. */
  let problem = '';

  /* ── Darstellung ─────────────────────────────────────────── */
  /* Deckkraft Stahl und Hervorhebung in einem Durchgang: ein Material je
     Teil (js/assembly.js sorgt dafür), also Deckkraft je Teil. Hervor-
     gehobene Teile leuchten leicht aus sich heraus, damit auch ein dunkler
     Kreis vor dem blassen Stahl steht. Das alles ändert nur das Bild: die
     GLB bekommt saubere Kopien der Materialien (js/assembly.js). */
  function applyLook() {
    if (!asm) return;
    const hl = state.highlight, any = hl.size > 0;
    for (const it of asm.items) {
      const on = hl.has(it.id);
      it.object.traverse(o => {
        if (!o.isMesh || o.userData.stencilTwin || !o.material) return;
        const m = o.material;
        const steel = m.name === 'steel';
        let a = steel ? state.opacity : 1;
        if (any) a = on ? 1 : Math.min(a, steel ? GHOST.steel : GHOST.other);
        m.opacity = a;
        m.transparent = a < 0.999;
        m.depthWrite = a >= 0.999;   // vermeidet Sortier-Artefakte, solange es durchscheint
        if (m.emissive) {
          if (any && on) m.emissive.copy(m.color).multiplyScalar(0.22); else m.emissive.setHex(0);
        }
        m.needsUpdate = true;
      });
    }
    /* Die Schnittflächen der hervorgehobenen Teile bleiben kräftig. */
    if (clip) clip.setActive(any ? hl : null);
    view.invalidate();
  }

  function setSteelOpacity(o) {
    state.opacity = o;
    if (sliders.opacity) sliders.opacity.set(Math.round(o * 100));
    applyLook();
  }

  /* Was der Modus im Bild zeigt: aufgeschnitten nur im Schnitt, offen nur
     beim Öffnen — beides nimmt der Modus beim Verlassen mit. */
  const openNow = () => (shell.mode === 'oeffnen' ? state.open : 0);
  function applyMode() {
    if (!asm) return;
    asm.setOpen(openNow());
    clip.setClip({ on: shell.mode === 'schnitt', ...state.clip });
    view.invalidate();
  }

  /* ── Hervorheben ─────────────────────────────────────────── */
  /** Genau diese Teile hervorheben (leer = keins). */
  function setHighlight(ids) {
    state.highlight = new Set([...ids].filter(id => asm && asm.itemOf(id)));
    afterHighlight();
  }

  /** Teile umschalten: sind alle schon hervorgehoben, gehen sie heraus,
      sonst kommen sie dazu — so wirkt ein Tipp auf ein Teil, auf eine
      Gruppe und auf „Temperierung" gleich. */
  function toggleHighlight(ids) {
    if (!asm) return;
    const sel = [...ids].filter(id => asm.itemOf(id));
    if (!sel.length) return;
    const all = sel.every(id => state.highlight.has(id));
    for (const id of sel) { if (all) state.highlight.delete(id); else state.highlight.add(id); }
    afterHighlight();
  }

  function clearHighlight() {
    if (!state.highlight.size) return;
    state.highlight.clear();
    afterHighlight();
  }

  function afterHighlight() {
    applyLook();
    if (list) list.render();
    syncQuick();
  }

  /* Die Temperierung: alle Teile in Gruppen der Klassen coolFix/coolMov. */
  function coolingIds() {
    if (!asm) return [];
    const cool = new Set(asm.groups.filter(g => g.mat === 'coolFix' || g.mat === 'coolMov').map(g => g.key));
    return asm.items.filter(i => cool.has(i.group)).map(i => i.id);
  }

  /* Die Schnellknöpfe über der Liste. */
  function syncQuick() {
    if (!list) return;
    const n = state.highlight.size;
    const cool = coolingIds();
    ui('hl-clear').disabled = !n;
    ui('hl-clear').textContent = n ? 'Aufheben (' + fmt(n, 0) + ')' : 'Aufheben';
    ui('hl-cooling').disabled = !cool.length;
    ui('hl-cooling').classList.toggle('active', n > 0 && n === cool.length && cool.every(id => state.highlight.has(id)));
  }

  /* ── Nach einer Änderung ─────────────────────────────────── */
  /* Schnitt-Zwillinge neu, Deckkraft Stahl auf neue Materialien, Weg
     nachziehen. Ein Farbwechsel färbt nur die Schnittflächen nach; wer nur
     ein- und ausblendet oder umbenennt, sagt dem Schnitt nur, was zu sehen
     ist. */
  function afterEdit(info = {}) {
    if (!asm) return;
    /* Ein entferntes Teil bleibt nicht hervorgehoben: sonst bliebe die ganze
       Form blass, und „Aufheben (1)" zählte ein Teil, das es nicht mehr gibt. */
    let pruned = false;
    for (const id of [...state.highlight]) if (!asm.itemOf(id)) { state.highlight.delete(id); pruned = true; }
    if (info.color) {
      clip.recolor();
      applyLook();
    } else if (info.visibility || info.names) {
      clip.update();
      if (pruned) applyLook();
    } else {
      asm.setOpen(openNow());
      clip.refresh(asm.scene, asm.bounds());
      applyLook();
    }
    syncQuick();
    syncOpen();
    host.refreshActions();
    view.invalidate();
  }

  /** Eine Änderung an der Form: Bild, dann der Schritt im Verlauf — ein
      Entfernen mit „Rückgängig" im Toast. */
  function edited(label, info = {}) {
    afterEdit(info);
    if (info.removed) host.removed(label); else host.changed(label);
  }

  /* ── Meldungen ───────────────────────────────────────────── */
  /* Ein Fehler steht in der Klappe der Form, im Toast und unten links im
     Bild: wer eine Datei ins Bild gezogen hat, schaut dorthin. */
  function report(text) {
    problem = text;
    if (source.warn) source.warn.textContent = text;
    shell.status(esc(text));
    shell.toast(text, { ms: 8000 });
  }
  function clearProblem() {
    if (!problem) return;
    problem = '';
    if (source.warn) source.warn.textContent = '';
    shell.status('');
  }
  const showHover = label => shell.status(label ? esc(label) : (problem ? esc(problem) : ''));

  /* ── Modell übernehmen ───────────────────────────────────── */
  /* Jede Form kommt ins Bild (eingepasst in Blickrichtung der Kamera), und
     die Zoomgrenzen richten sich nach ihr. Eine neue Form ist ein neues
     Dokument: der Verlauf beginnt neu, und liegt für sie ein Entwurf bereit,
     bietet der Rahmen ihn an. */
  function adopt(scene, name, { key = name, example = false } = {}) {
    let next;
    try {
      next = createAssembly(scene);
    } catch (err) {
      report(err.message + ' ' + LOADABLE);
      console.error(err);
      state.ready = !!asm;
      return false;
    }
    if (asm) { view.scene.remove(asm.scene); asm.dispose(); }
    asm = next;
    state.highlight.clear();                   // eine Hervorhebung gehört zum alten Modell
    view.scene.add(scene);
    if (!clip) clip = initClipCaps(view.scene, scene, asm.bounds()); else clip.refresh(scene, asm.bounds());
    applyMode();
    list.setAssembly(asm);
    applyLook();
    syncQuick();
    syncOpen();
    sliders.clip.set(Math.round(state.clip.pos * 100));
    shell.fit(scene);
    clearProblem();
    state.source = { name, key, example };
    if (example) source.select.value = 'beispiel'; else source.select.selectedIndex = -1;
    shell.header.setPart(name, 'Form');
    ui('part-chip').title = 'Form wählen oder öffnen';
    shell.renderChips();
    state.ready = true;
    host.resetHistory();
    host.settingsFor(key);                     // ein Entwurf dieser Form?
    host.refreshActions();
    view.invalidate();
    return true;
  }

  function loadExample() {
    state.ready = false;
    shell.loading('Beispielform lädt …');
    return new Promise(res => {
      new GLTFLoader().load(EXAMPLE.url, gltf => {
        shell.loading();
        res(adopt(gltf.scene, EXAMPLE.name, { key: EXAMPLE.key, example: true }));
      }, undefined, err => {
        shell.loading();
        report('Die Beispielform (' + EXAMPLE.url + ') ließ sich nicht laden. Eine eigene Form öffnet „Datei öffnen …" in der Klappe „Form".');
        console.error(err);
        state.ready = !!asm;
        res(false);
      });
    });
  }

  function loadGLB(buf, name) {
    state.ready = false;
    shell.loading('Form lädt …');
    return new Promise(res => {
      new GLTFLoader().parse(buf, '', gltf => { shell.loading(); res(adopt(gltf.scene, name)); },
        err => {
          shell.loading();
          report('Die Datei „' + name + '" konnte nicht gelesen werden: ' + err.message);
          state.ready = !!asm;
          res(false);
        });
    });
  }

  /* Wohin STL-Dateien kommen: in die Gruppe aus dem Menü, sonst in die
     aufgeklappte, sonst in die erste. */
  function targetGroup(key) {
    for (const k of [key, list.openGroup]) if (k && asm.groupOf(k)) return k;
    return asm.groups[0] ? asm.groups[0].key : null;
  }

  /** Dateien öffnen (Klappe, Ablegen, Chip, Menü einer Gruppe): eine GLB
      ersetzt die ganze Form — die letzte gewinnt —, STL-Dateien kommen
      danach als Teile hinein, alle zusammen EIN Schritt. */
  async function openFiles(files, into = null) {
    clearProblem();
    const read = [];
    for (const f of [...files]) {
      try { read.push({ f, buf: await readBuffer(f) }); }
      catch (err) { report(err.message); console.error(err); }
    }
    const glbs = read.filter(r => isGLB(r.buf));
    if (glbs.length) { const last = glbs[glbs.length - 1]; await loadGLB(last.buf, last.f.name); }
    const added = [];
    let group = null;
    for (const { f, buf } of read) {
      if (isGLB(buf)) continue;
      try {
        if (looksLikeJSON(buf)) throw new Error('eine JSON-Datei ist keine Form; geöffnet werden GLB und STL');
        if (!asm) throw new Error('zuerst eine Form laden (GLB)');
        const tris = parseSTL(buf);
        if (!tris.length) throw new Error('keine Dreiecke');
        group = group || targetGroup(into);
        added.push(asm.addItem({ group, label: f.name.replace(/\.stl$/i, ''), tris }));
      } catch (err) {
        report('Die Datei „' + f.name + '" konnte nicht gelesen werden: ' + err.message);
        console.error(err);
      }
    }
    if (!added.length) return;
    list.reveal({ group });
    afterEdit();
    const what = added.length === 1 ? '„' + added[0].label + '"' : fmt(added.length, 0) + ' Teile';
    host.changed(what + ' geladen');
    if (!problem) shell.toast(what + ' in „' + asm.groupOf(group).title + '" geladen.');
  }

  function pickFiles(key = null) {
    target = key;
    source.input.click();
  }

  /* ── Rückgängig, Entwurf ─────────────────────────────────── */
  /* Die Baugruppe auf einen Abzug ihrer Metadaten. Was dabei wiederkommt,
     zeigt die Liste (seine Gruppe klappt auf). Aus einem Entwurf fehlen
     womöglich Teile aus STL-Dateien: ihre Geometrie steht nur in einer GLB. */
  function restoreDoc(doc, draft) {
    if (!asm || !doc) return;
    const before = new Set(asm.items.map(i => i.id));
    const { missing } = asm.apply(doc);
    const back = asm.items.find(i => !before.has(i.id));
    list.reveal(back ? { item: back.id } : {});
    afterEdit();
    if (draft && missing.length) {
      report(missing.length === 1
        ? 'Aus dem Entwurf fehlt ein Teil aus einer STL-Datei: es steht nur in einer gespeicherten GLB.'
        : 'Aus dem Entwurf fehlen ' + fmt(missing.length, 0) + ' Teile aus STL-Dateien: sie stehen nur in einer gespeicherten GLB.');
    }
  }

  /* ── Speichern ───────────────────────────────────────────── */
  const docName = () => (!state.source || state.source.example ? EXAMPLE.file : baseName(state.source.name));
  const countText = (withHidden = true) => {
    if (!asm) return 'Die Form lädt …';
    const n = asm.items.length, k = asm.groups.length;
    const hidden = withHidden ? asm.items.filter(i => i.object.visible === false).length : 0;
    return fmt(n, 0) + (n === 1 ? ' Teil' : ' Teile') + ' in ' + fmt(k, 0) + (k === 1 ? ' Gruppe' : ' Gruppen')
      + (hidden ? ' · ' + fmt(hidden, 0) + ' ausgeblendet' : '');
  };
  /** Die ganze Baugruppe als binäres glTF, Metadaten als extras.
      → was der Rahmen nach „Gespeichert:" meldet */
  async function save() {
    if (!asm) return null;
    const { GLTFExporter } = await import('../../vendor/three/GLTFExporter.js');
    const root = asm.toExportRoot();
    const buf = await new Promise((res, rej) => new GLTFExporter().parse(root, res, rej, { binary: true }));
    __viewer.lastExport = buf;
    const name = saveGLB(buf, docName());
    return name + ' · ' + fmtUnit(buf.byteLength / 1024, 'kB', 0) + ' · ' + countText(false);
  }

  /* ── Gruppe anlegen ──────────────────────────────────────── */
  /* Das Formular steht an der Stelle der Liste; der Hauptknopf heißt
     solange „Anlegen", Esc und „Abbrechen" schließen es. Ein Fehler steht im
     Formular, wo man gerade ist. */
  function openForm() {
    if (!asm) return;
    list.closeMenus();
    state.formOpen = true;
    ui('group-title').value = '';
    ui('group-warn').textContent = '';
    ui('quick').hidden = true;
    ui('components').hidden = true;
    ui('group-form').hidden = false;
    host.refreshActions();
    if (ui('group-title').focus) ui('group-title').focus();
  }
  function closeForm() {
    if (!state.formOpen) return false;
    state.formOpen = false;
    ui('group-warn').textContent = '';
    ui('group-form').hidden = true;
    ui('quick').hidden = false;
    ui('components').hidden = false;
    host.refreshActions();
    return true;
  }
  function addGroup() {
    if (!asm) return;
    const warn = text => { ui('group-warn').textContent = text; };
    const title = String(ui('group-title').value).trim();
    if (!title) { warn('Die Gruppe braucht einen Namen.'); return; }
    const dir = SLIDE_DIRS.find(d => d.key === ui('group-slide').value);
    const slides = !!(dir && dir.axis);
    /* Deutsch gelesen: „1.500" sind 1500 mm, „1,5" anderthalb. */
    const travel = parseNumber(ui('group-travel').value);
    if (slides && (travel === null || travel < 0)) { warn('Der Schieberweg braucht eine Zahl in mm, 0 oder mehr.'); return; }
    const g = asm.addGroup({ title, side: formSide, mat: ui('group-mat').value, slide: slides ? { axis: dir.axis, sign: dir.sign, travel } : null });
    if (!g) { warn('Die Gruppe braucht einen Namen.'); return; }
    closeForm();
    list.reveal({ group: g.key });
    edited('Gruppe „' + g.title + '" angelegt', { names: true });
  }

  /* ── Öffnen: der Weg und was er bewegt ───────────────────── */
  const openText = v => fmtUnit(v / 100 * (asm ? asm.openTravel : 420), 'mm');
  function syncOpen() {
    if (sliders.open) sliders.open.set(Math.round(state.open * 100));
    if (!asm) { facts(ui('open-facts'), []); return; }
    const t = state.open;
    const of = travel => fmt(t * travel, 0) + ' von ' + fmtUnit(travel, 'mm');
    const rows = [['Bewegliche Hälfte', of(asm.openTravel)]];
    for (const g of asm.groups) {
      if (g.slide) rows.push([esc(g.title) + ' (' + (g.slide.sign > 0 ? '+' : '−') + g.slide.axis.toUpperCase() + ')', of(g.slide.travel)]);
    }
    facts(ui('open-facts'), rows);
  }
  /* Die Lage der Schnittebene in mm entlang ihrer Achse — der Regler geht
     über den halben Weg der Ebene (js/clipcaps.js). */
  const clipText = v => (clip ? fmtUnit(v / 100 * clip.extent(state.clip.axis), 'mm') : fmtUnit(v, '%'));

  /* ── Modi ────────────────────────────────────────────────── */
  const teilePrimary = () => (state.formOpen
    ? { label: 'Anlegen', onClick: addGroup, reason: 'Name, Seite und Werkstoffklasse; ein Schieber fährt beim Öffnen zusätzlich heraus.' }
    : { label: 'Gruppe anlegen', kind: 'outline', onClick: openForm, disabled: !asm, reason: countText() });
  const modes = MODES.map(m => ({
    ...m,
    enter: () => applyMode(),
    leave: m.id === 'teile' ? () => { closeForm(); if (list) list.closeMenus(); } : undefined,
    primary: m.id === 'teile' ? teilePrimary : null
  }));

  /* ── Verdrahten: sobald der Rahmen die Felder der Modi eingesetzt hat ── */
  function mounted() {
    /* Die Klappe der Kopfzeile ist die der FORM: Beispielform, Datei öffnen
       (GLB oder STL, mehrere auf einmal). */
    shell.header.setPartSource({
      list: 'Beispielform', button: 'Datei öffnen …', accept: ACCEPT,
      hint: 'Eine GLB ersetzt die Form (sie braucht die Knoten fixedRoot und movingRoot); STL-Dateien kommen als Teile in die aufgeklappte Gruppe. Beides lässt sich auch ins Bild ziehen.'
    });
    shell.header.setPart('…', 'Form');
    source.select.innerHTML = '<option value="beispiel">' + EXAMPLE.name + '</option>';
    source.select.addEventListener('change', () => loadExample());
    source.input.setAttribute('multiple', '');
    source.button.addEventListener('click', () => { target = null; source.input.click(); });
    source.input.addEventListener('change', e => {
      const files = [...(e.target.files || [])];
      e.target.value = '';
      const into = target;
      target = null;
      if (files.length) __viewer.pending = openFiles(files, into);
    });
    ui('drop-hint').textContent = 'GLB oder STL hier ablegen';

    list = createPartList(ui('components'), {
      onEdit: edited,
      onView: info => afterEdit(info),
      onAddFiles: key => pickFiles(key),
      onHighlight: toggleHighlight,
      highlighted: id => state.highlight.has(id)
    });

    ui('hl-cooling').addEventListener('click', () => toggleHighlight(coolingIds()));
    ui('hl-clear').addEventListener('click', clearHighlight);
    ui('show-all').addEventListener('click', () => {
      if (!asm) return;
      for (const it of asm.items) asm.setVisible(it.id, true);
      state.highlight.clear();
      afterHighlight();
      afterEdit({ visibility: true });
    });

    ui('group-mat').innerHTML = MATERIAL_CLASSES.map(m => '<option value="' + m.key + '">' + m.label + '</option>').join('');
    ui('group-slide').innerHTML = SLIDE_DIRS.map(d => '<option value="' + d.key + '">' + d.label + '</option>').join('');
    segButtons(ui('group-side'), v => { formSide = v; });
    ui('group-slide').addEventListener('change', () => { ui('travel-row').hidden = !ui('group-slide').value; });
    ui('group-cancel').addEventListener('click', () => closeForm());
    ui('group-title').addEventListener('keydown', e => { if (e.key === 'Enter') addGroup(); });

    segButtons(ui('clip-axis'), v => { state.clip.axis = v; sliders.clip.set(Math.round(state.clip.pos * 100)); applyMode(); });
    sliders.clip = slider(ui('clip-pos'), v => { state.clip.pos = v / 100; applyMode(); }, clipText, ui('clip-pos-val'), { fire: false });
    ui('clip-flip').addEventListener('change', e => { state.clip.flip = !!e.target.checked; applyMode(); });
    sliders.open = slider(ui('open'), v => {
      state.open = v / 100;
      if (asm) { asm.setOpen(openNow()); clip.update(); syncOpen(); view.invalidate(); }
    }, openText, ui('open-val'), { fire: false });

    const pop = shell.darstellung(DARSTELLUNG);
    sliders.opacity = slider(pop.querySelector('[data-ui="opacity"]'), v => setSteelOpacity(v / 100), v => fmtUnit(v, '%'),
      pop.querySelector('[data-ui="opacity-val"]'), { fire: false });

    shell.setChips([{
      id: 'stl', label: 'STL laden', title: 'STL-Dateien in die aufgeklappte Gruppe laden',
      enabled: () => !!asm, reason: 'Die Form lädt noch.', onClick: () => pickFiles()
    }]);
    shell.setFitTarget(() => (asm ? new T.Box3().setFromObject(asm.scene) : null));
    syncOpen();
  }

  /* Ein Wechsel des Farbschemas: die voreingestellten Farben der Teile folgen
     ihm (js/assembly.js, recolor), die gewählten bleiben. Danach die Liste,
     die Schnittflächen und die Hervorhebung, die aus den Farben leuchtet. */
  onScheme(() => {
    if (!asm) return;
    asm.recolor();
    if (list) list.render();
    if (clip) clip.recolor();
    applyLook();
  });

  /* ── Hover und Tipp im Bild ──────────────────────────────── */
  const canvas = view.renderer.domElement;
  const ray = new T.Raycaster();
  const BOTH = new T.MeshBasicMaterial({ side: T.DoubleSide });
  const nm = new T.Matrix3(), nw = new T.Vector3(), cross = new T.Vector3();

  /* Alle Treffer entlang des Strahls, Vorder- UND Rückseiten, nach Abstand.
     Die Rückseiten braucht der Schnitt (unten): an ihnen sieht man, ob die
     Schnittebene gerade in einem Körper liegt. Dafür trägt jedes Mesh für
     die Dauer des Tests ein beidseitiges Material — gezeichnet wird damit
     nie. Die Stencil-Zwillinge des Schnitts (dieselbe Geometrie noch zweimal)
     bleiben draußen. */
  function hitsAlong(objects) {
    const out = [];
    for (const root of objects) {
      root.traverseVisible(o => {
        if (!o.isMesh || o.userData.stencilTwin || !o.userData.compId) return;
        const m = o.material;
        o.material = BOTH;
        try { o.raycast(ray, out); } finally { o.material = m; }
      });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }
  /* Zeigt die getroffene Fläche zur Kamera? */
  function facing(h) {
    nm.getNormalMatrix(h.object.matrixWorld);
    return nw.copy(h.face.normal).applyMatrix3(nm).dot(ray.ray.direction) < 0;
  }
  /* Zu sehen ist eine Vorderseite — oder jede Seite, die ihr Material zeigt. */
  function seen(h) {
    const side = h.object.material.side;
    return side === T.DoubleSide || (side === T.BackSide) !== facing(h);
  }

  /** Das Teil unter dem Zeiger (Teil-id) oder null. */
  function pick(ev) {
    if (!asm) return null;
    asm.scene.updateMatrixWorld();
    rayAt(ray, ev, canvas, view.camera);
    const hits = hitsAlong(asm.items.filter(i => i.object.visible).map(i => i.object));
    /* Blasse Teile zählen nicht — sonst träfe der Tipp auf einen Kreis den
       Stahl davor. */
    const counts = h => !state.highlight.size || state.highlight.has(h.object.userData.compId);
    const idOf = h => (h ? h.object.userData.compId : null);
    const plane = clip && clip.activePlane();
    if (!plane) return idOf(hits.find(h => counts(h) && seen(h)));

    /* Mit Schnittebene: was im weggeschnittenen Halbraum liegt, ist nicht zu
       sehen — der Raycaster von Three.js kennt die Ebene nicht und träfe die
       Platte davor, der Tipp auf einen Kreis im Schnitt hob den Stahl hervor.
       Steht die Kamera auf der stehenden Seite, zählt die erste Fläche vor der
       Ebene. Sonst (der übliche Blick in den Schnitt) zeigt sich dort, wo der
       Strahl die Ebene durchstößt, die Schnittfläche des Körpers, in dem der
       Punkt liegt: dessen erster Treffer dahinter ist eine Rückseite. Liegt
       er in mehreren — ein Kreis steckt im Stahl —, liegt die Schnittfläche
       des Inhalts vorn, wie beim Zeichnen (js/clipcaps.js). Liegt er in
       keinem, zählt die erste Fläche dahinter. */
    if (plane.distanceToPoint(ray.ray.origin) >= 0) {
      return idOf(hits.find(h => plane.distanceToPoint(h.point) >= 0 && counts(h) && seen(h)));
    }
    if (!ray.ray.intersectPlane(plane, cross)) return null;
    const at = cross.distanceTo(ray.ray.origin);
    const behind = hits.filter(h => h.distance > at);
    const first = new Map();
    for (const h of behind) if (!first.has(h.object)) first.set(h.object, h);
    let inside = null;
    for (const h of first.values()) {
      if (!counts(h) || facing(h)) continue;
      if (!inside || (inside.object.material.name === 'steel' && h.object.material.name !== 'steel')) inside = h;
    }
    return idOf(inside || behind.find(h => counts(h) && seen(h)));
  }

  /* Hover: ein Treffertest geht über alle Dreiecke der Form (die Beispiel-
     form hat 153 000). Deshalb höchstens einer je Bild und keiner, solange
     eine Taste gedrückt ist — beim Drehen und Verschieben will niemand
     wissen, was gerade unter dem Zeiger vorbeizieht. */
  let hoverAt = null;
  canvas.addEventListener('pointermove', ev => {
    if (!asm || ev.buttons) { hoverAt = null; return; }
    const queued = hoverAt !== null;
    hoverAt = { clientX: ev.clientX, clientY: ev.clientY };
    if (queued) return;
    requestAnimationFrame(() => {
      const at = hoverAt;
      hoverAt = null;
      if (!at || !asm) return;
      const id = pick(at);
      showHover(id ? asm.labelOf(id) : null);
    });
  });
  canvas.addEventListener('pointerleave', () => { hoverAt = null; showHover(null); });

  /* Ein Tipp (kein Ziehen: kaum bewegt, kurz) hebt das Teil darunter
     hervor oder nimmt es heraus; ein Tipp ins Leere hebt alles auf. So
     lässt sich der Kreis direkt im Bild wählen — in der Halle am Tablet. */
  let press = null;
  canvas.addEventListener('pointerdown', ev => {
    press = ev.button === 0 || ev.button === undefined ? { x: ev.clientX, y: ev.clientY, t: performance.now() } : null;
  });
  canvas.addEventListener('pointerup', ev => {
    if (!press || !asm) return;
    const moved = Math.hypot(ev.clientX - press.x, ev.clientY - press.y);
    const dt = performance.now() - press.t;
    press = null;
    if (moved > 6 || dt > 700) return;
    const id = pick(ev);
    if (id) toggleHighlight([id]); else clearHighlight();
  });

  /* ── Der Vertrag mit dem Gastgeber ───────────────────────── */
  const tool = {
    id: 'formaufbau',
    modes,
    startMode: 'teile',
    accepts: [],
    exports: [],
    saveTitle: 'Die Form als GLB-Datei speichern',
    toJSON: () => (asm ? asm.metadata() : null),
    fromJSON: obj => restoreDoc(obj, true),
    serialize: () => (asm ? asm.metadata() : null),
    restore: doc => restoreDoc(doc, false),
    keys: {
      /* Esc schließt der Reihe nach: ein offenes Menü, das Formular, die
         Hervorhebung. */
      Escape: () => {
        if (list && list.closeMenus()) return true;
        if (closeForm()) return true;
        if (state.highlight.size) { clearHighlight(); return true; }
        return false;
      }
    },
    openFiles: files => (__viewer.pending = openFiles(files)),
    save: () => (__viewer.pending = save()),
    docName,
    start: () => loadExample(),
    mounted
  };

  const __viewer = {
    state, view, shell, host, tool,
    get asm() { return asm; }, get clip() { return clip; }, get list() { return list; },
    setSteelOpacity, applyLook, setHighlight, toggleHighlight, clearHighlight, adopt, openFiles, save, pick,
    pending: null, lastExport: null,
    /** Der Hüllquader der Form, wie sie im Bild steht — tests/browser/ux.spec.mjs
        prüft daran, dass sie ganz im Bild liegt. */
    fitBox: () => (asm ? new T.Box3().setFromObject(asm.scene) : null)
  };
  tool.__viewer = __viewer;
  return tool;
}
