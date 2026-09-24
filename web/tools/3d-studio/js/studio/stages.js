/* Mehrere Werkzeuge auf EINER Seite — die Werkbank.

   Eine Werkzeugseite hat ein Werkzeug, und das bekommt den ganzen
   Gastgeber (js/studio/host.js, mountTool). Die Werkbank trägt sieben, je
   SCHRITT eines oder zwei (Bauteil: Entformung und Wandstärke), in einer
   Leiste links, über einem Viewport, in einer Seitenleiste. Damit sie sich
   nicht ins Gehege kommen, bekommt jedes Werkzeug einen eigenen GAST-
   Gastgeber: derselbe Vertrag wie auf seiner eigenen Seite, aber was man
   sieht, lässt er nur durch, solange das Werkzeug DRAN ist — solange einer
   seiner Modi auf dem Schirm steht:
     Reiter, Modi   je Schritt eine Gruppe (shell.addModes); die Modi zweier
                    Werkzeuge eines Schritts in zwei Zeilen; shell.mode ist
                    für ein Werkzeug, das nicht dran ist, null — so zeigt
                    seine Anzeige von selbst nichts mehr
     Felder         ui(name) findet zuerst in den eigenen Kästen (Modi,
                    Auswahlfeld, Darstellung — data-owner), dann im Rahmen;
                    die Felder anderer Werkzeuge findet es nie
     Chips, Legende, Farbskala, Hinweiszeile, Auswahlfeld, Einpassen, das
     Aussehen des Bauteils
                    gemerkt und erst gezeigt, wenn das Werkzeug dran ist
     Rechnungen     laufen weiter, auch im nächsten Schritt; ihr Schritt
                    trägt so lange einen Punkt in der Leiste
   Wer dran kommt, steht da, wie er zuletzt war, und hört es mit
   tool.setActive(true); wer geht, mit setActive(false) — dort nimmt er
   Griffe und Hilfsbilder aus dem Bild. Seine Körper (tool.bodies: Anguss,
   Überläufe, Bohrungen) bleiben stehen: im nächsten Schritt sieht man,
   woran man baut. Nur ein Schritt, der das Bauteil für sich zeigt
   (spec.solo: die Analysen), nimmt die Körper der anderen aus dem Bild.

   Verlauf, Entwurf, Speichern, Exportieren und Tasten hängen am DOKUMENT
   der Seite (host.wireDoc) — das stellt die Seite (js/werkbank/app.js), und
   den Verlauf setzt nur sie zurück: ein Werkzeug, das für sich neu anfängt
   (ein neues Bauteil), setzt nicht den Verlauf aller anderen zurück. */

import { esc } from './rows.js';

/**
 * @param host    der Gastgeber der Seite (createHost)
 * @param stages  [{ id, label, title, icon (SVG), done() → bool, solo,
 *                  tools: [{ id, create(gast) → Werkzeug }] }]
 * → { tools, activate(stage, mode), start(stage), refreshRail(),
 *     get stage(), get tool(), get record() }
 */
export function mountStages(host, { stages }) {
  const { shell } = host;
  const recs = [];                      // je Werkzeug: { id, stage, tool, guest, active, busy, own, sections }
  const byStage = new Map();            // Schritt → { spec, recs, modes }
  let current = null;                   // das Werkzeug, das gerade dran ist

  /* ── Die Leiste der Schritte ─────────────────────────────── */
  const layout = shell.ui('layout');
  const rail = document.createElement('nav');
  rail.className = 'st-rail';
  rail.setAttribute('data-ui', 'rail');
  rail.setAttribute('aria-label', 'Arbeitsschritte');
  rail.innerHTML = stages.map((s, i) => '<button type="button" class="st-step" data-stage="' + s.id + '" title="' + esc(s.title || '') + '">'
    + '<span class="st-step-num">' + (i + 1) + '</span><i class="st-step-dot" aria-hidden="true"></i>'
    + (s.icon || '') + '<span class="st-step-label">' + s.label + '</span></button>').join('');
  layout.insertBefore(rail, layout.firstChild);
  layout.classList.add('has-rail');
  rail.addEventListener('click', ev => {
    const b = ev.target.closest && ev.target.closest('[data-stage]');
    if (b) activate(b.getAttribute('data-stage'));
  });
  /* Pfeiltasten wie in jeder Leiste: auf, ab, Pos1, Ende. */
  rail.addEventListener('keydown', ev => {
    const list = [...rail.querySelectorAll('[data-stage]')];
    const i = list.indexOf(ev.target.closest && ev.target.closest('[data-stage]'));
    if (i < 0) return;
    const j = ev.key === 'ArrowDown' ? (i + 1) % list.length : ev.key === 'ArrowUp' ? (i - 1 + list.length) % list.length
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? list.length - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    activate(list[j].getAttribute('data-stage'));
    list[j].focus();
  });
  /** Punkte an den Schritten: hat einer schon ein Ergebnis (done), rechnet
      er gerade (busy)? Beides ist Bedienung, kein Urteil. */
  function refreshRail() {
    for (const b of rail.querySelectorAll('[data-stage]')) {
      const id = b.getAttribute('data-stage');
      const st = byStage.get(id);
      if (!st) continue;
      let done;
      try { done = !!(st.spec.done && st.spec.done()); } catch { done = false; }
      b.classList.toggle('done', done);
      b.classList.toggle('busy', st.recs.some(r => r.busy > 0));
      const on = id === shell.group;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    }
  }

  /* ── Je Werkzeug ein Gast-Gastgeber ──────────────────────── */
  function guestFor(rec) {
    const own = rec.own = {
      chips: [], legend: '', colorbar: null, status: '', fit: null,
      inspector: { visible: false, title: '', onClose: null },
      look: { visible: true, colors: false }, lookOpacity: undefined, opacity: 1
    };
    const on = () => rec.active;
    const hp = host.part;

    /* Zuerst die eigenen Kästen, dann der Rahmen — was einem anderen
       Werkzeug gehört, zählt nie (zwei Werkzeuge kennen beide „cell"). */
    const ui = name => {
      const sel = '[data-ui="' + name + '"]';
      for (const box of rec.boxes()) {
        if (box.matches && box.matches(sel)) return box;
        const el = box.querySelector(sel);
        if (el) return el;
      }
      for (const el of shell.root.querySelectorAll(sel)) {
        const o = el.closest('[data-owner]');
        if (!o) return el;
      }
      return null;
    };

    const inspector = {
      get el() { return shell.inspector.el; },
      get body() { return (rec.inspBox = shell.inspector.boxFor(rec.id)); },
      show({ title, html }) {
        own.inspector.visible = true;
        own.inspector.title = title || '';
        const box = inspector.body;
        if (html !== undefined) box.innerHTML = html;
        if (on()) shell.inspector.show({ title: own.inspector.title });
        return box;
      },
      hide() { own.inspector.visible = false; if (on()) shell.inspector.hide(); },
      get visible() { return own.inspector.visible; },
      collapse(v) { if (on()) shell.inspector.collapse(v); },
      onClose(fn) { own.inspector.onClose = fn; if (on()) shell.inspector.onClose(fn); }
    };

    const gShell = {
      get root() { return shell.root; }, ui,
      get viewport() { return shell.viewport; }, get view() { return shell.view; }, get vp() { return shell.vp; },
      get viewbar() { return shell.viewbar; }, get aim() { return shell.aim; }, get help() { return shell.help; },
      fit: (box, margin) => (on() ? shell.fit(box, margin) : null),
      setFitTarget(fn) { own.fit = fn; if (on()) shell.setFitTarget(own.fit || partTarget); },
      get mode() { return on() ? shell.mode : null; },
      setMode(id) { if (on()) shell.setMode(id); },
      onMode: fn => shell.onMode((id, prev, info) => { if (info.group === rec.stage) fn(id, prev, info); }),
      modeSection: id => shell.modeSection(id, rec.stage),
      setTabBadge: (id, text, kind) => shell.setTabBadge(id, text, kind, rec.stage),
      setPrimary(spec) { if (on()) shell.setPrimary(spec); },
      setNote(text, kind) { if (on()) shell.setNote(text, kind); },
      setBusy: (...a) => shell.setBusy(...a),
      progress: (...a) => shell.progress(...a),
      get busy() { return shell.busy; },
      setActionsExtra: html => shell.setActionsExtra(html),
      setChips(list) { own.chips = list || []; if (on()) shell.setChips(own.chips); },
      renderChips() { if (on()) shell.renderChips(); },
      inspector,
      legend(html) { own.legend = html || ''; if (on()) shell.legend(own.legend); },
      status(html) { own.status = html || ''; if (on()) shell.status(own.status); },
      colorbar(spec) { own.colorbar = spec || null; if (on()) shell.colorbar(own.colorbar); },
      darstellung(html) { return (rec.darstBox = shell.darstellung(html, rec.id)); },
      toast: (...a) => shell.toast(...a), hideToast: () => shell.hideToast(), banner: spec => shell.banner(spec),
      get header() { return shell.header; },
      onKey: fn => shell.onKey(fn),
      loading: text => shell.loading(text)
    };

    /* Das Bauteil gehört der Seite; wie es aussehen soll, sagt jedes
       Werkzeug für sich — gezeigt wird, was das Werkzeug will, das dran ist. */
    const applyLook = () => hp.setLook({ visible: own.look.visible, colors: own.look.colors, opacity: own.lookOpacity !== undefined ? own.lookOpacity : own.opacity });
    rec.applyLook = applyLook;
    const gPart = {
      get model() { return hp.model; }, get name() { return hp.name; }, get warning() { return hp.warning; },
      get demoId() { return hp.demoId; }, get key() { return hp.key; }, get mesh() { return hp.mesh; },
      get cellSuggestion() { return hp.cellSuggestion; }, get opacity() { return own.opacity; },
      setLook(o = {}) {
        if (o.visible !== undefined) own.look.visible = o.visible;
        if (o.colors !== undefined) own.look.colors = o.colors;
        own.lookOpacity = o.opacity;
        if (on()) applyLook();
      },
      setOpacity(v) { own.opacity = v; own.lookOpacity = undefined; if (on()) applyLook(); },
      colors: () => hp.colors(),
      fit(margin) { if (on()) hp.fit(margin); },
      load: (...a) => hp.load(...a), pickDemo: id => hp.pickDemo(id), start: () => hp.start(),
      deselect: () => hp.deselect(), warn: t => hp.warn(t)
    };

    /* Rechnungen: eine Reihe für alle (host.jobs). Eine neue überholt nur
       die eigene laufende; die eines anderen Werkzeugs läuft zu Ende, die
       neue wartet so lange (js/studio/job.js, spec.owner). Solange eine
       läuft oder wartet, trägt ihr Schritt einen Punkt in der Leiste. */
    const gJobs = {
      get running() { return host.jobs.running; },
      async run(spec) {
        spec.owner = rec.id;
        rec.busy++;
        refreshRail();
        /* Die Leiste noch einmal, wenn das Werkzeug sein Ergebnis übernommen
           hat — das geschieht erst nach dem Ende der Rechnung. */
        try { return await host.jobs.run(spec); } finally { rec.busy--; refreshRail(); setTimeout(refreshRail, 0); }
      },
      cancel: () => { if (host.jobs.owner === rec.id) host.jobs.cancel(); },
      supersede: () => host.jobs.supersede(rec.id)
    };

    return {
      id: rec.id, shell: gShell, ui,
      get view() { return host.view; }, get viewport() { return host.viewport; }, get aim() { return host.aim; },
      part: gPart, get field() { return host.field; }, jobs: gJobs,
      changed: (label, opts) => host.changed(label, opts),
      toastUndo: text => host.toastUndo(text), dropUndoToast: () => host.dropUndoToast(),
      removed: (what, text) => host.removed(what, text),
      revert: () => host.revert(), undo: () => host.undo(), redo: () => host.redo(),
      /* Den Verlauf setzt die Seite zurück, nicht ein Werkzeug für alle. */
      resetHistory: () => {},
      refreshActions: () => host.refreshActions(),
      settingsFor: () => {},
      openFile: file => host.openFile(file),
      on: (ev, fn) => host.on(ev, fn), emit: (ev, ...args) => host.emit(ev, ...args),
      get active() { return rec.active; },
      get store() { return host.store; }, get history() { return host.history; }
    };
  }
  /* Wer nichts Eigenes einzupassen hat, passt das Bauteil ein. */
  const partTarget = () => (host.part && host.part.model ? host.part.mesh : null);

  /* ── Die Werkzeuge anlegen, ihre Modi in Gruppen ─────────── */
  for (const spec of stages) {
    const entry = { spec, recs: [], modes: [] };
    byStage.set(spec.id, entry);
    for (const t of spec.tools) {
      const rec = { id: t.id, stage: spec.id, active: false, busy: 0, sections: [], inspBox: null, darstBox: null };
      rec.boxes = () => [...rec.sections, rec.inspBox, rec.darstBox].filter(Boolean);
      rec.guest = guestFor(rec);
      rec.tool = t.create(rec.guest);
      recs.push(rec);
      entry.recs.push(rec);
      rec.tool.modes.forEach((m, i) => entry.modes.push({
        id: m.id, label: m.label, hint: m.hint, html: m.html, owner: rec.id,
        breakBefore: i === 0 && entry.modes.length > 0, mode: m, rec
      }));
    }
    shell.addModes(spec.id, entry.modes);
    for (const rec of entry.recs) rec.sections = rec.tool.modes.map(m => shell.modeSection(m.id, spec.id)).filter(Boolean);
  }
  const findMode = (group, id) => {
    const st = byStage.get(group);
    return st && id ? st.modes.find(m => m.id === id) || null : null;
  };

  /* ── Dran kommen, gehen ──────────────────────────────────── */
  function enter(rec) {
    rec.active = true;
    current = rec;
    const own = rec.own;
    /* data-tool am Rahmen: die Regeln in css/studio.css, die nur EIN Werkzeug
       betreffen, gelten für das, das dran ist. */
    shell.root.setAttribute('data-tool', rec.id);
    shell.setChips(own.chips);
    shell.darstellungOwner(rec.id);
    shell.inspector.setOwner(rec.id);
    shell.inspector.onClose(own.inspector.onClose);
    if (own.inspector.visible) shell.inspector.show({ title: own.inspector.title }); else shell.inspector.hide();
    shell.legend(own.legend);
    shell.colorbar(own.colorbar);
    shell.status(own.status);
    shell.setFitTarget(own.fit || partTarget);
    shell.setHelpOwner(rec.id);
    rec.applyLook();
    if (rec.tool.setActive) rec.tool.setActive(true);
  }
  function leave(rec) {
    rec.active = false;
    if (current === rec) current = null;
    if (rec.tool.cancelAim) rec.tool.cancelAim();
    if (rec.tool.setActive) rec.tool.setActive(false);
  }

  shell.onMode((id, prev, info) => {
    const from = findMode(info.prevGroup, prev), to = findMode(info.group, id);
    if (from && from.mode.leave) from.mode.leave();
    const other = !from || !to || from.rec !== to.rec;
    if (other && from) leave(from.rec);
    /* Die Zeile unter dem Hauptknopf gehört dem Modus (wie in host.js). */
    shell.setNote('');
    if (other && to) enter(to.rec);
    if (to && to.mode.enter) to.mode.enter();
    host.refreshActions();
    if (info.group !== info.prevGroup) { showBodies(info.group); refreshRail(); }
  });
  /* Die Körper der anderen Schritte: als Zusammenhang im Bild — außer in
     einem Schritt, der das Bauteil für sich zeigt. */
  function showBodies(stage) {
    const st = byStage.get(stage);
    const solo = !!(st && st.spec.solo);
    for (const r of recs) if (r.tool.bodies) r.tool.bodies.visible = !solo || r.stage === stage;
    shell.view.invalidate();
  }
  host.refreshActions = () => {
    const m = findMode(shell.group, shell.mode);
    shell.setPrimary(m && m.mode.primary ? m.mode.primary() : null);
  };

  /** Einen Schritt zeigen — in dem Modus, in dem man ihn verließ (oder
      `mode`); zum ersten Mal im Startmodus seines ersten Werkzeugs. */
  function activate(stage, mode) {
    const st = byStage.get(stage);
    if (!st) return;
    if (stage === shell.group && (!mode || mode === shell.mode)) return;
    const want = mode || (st.shown ? null : st.recs[0].tool.startMode);
    st.shown = true;
    shell.showGroup(stage, want);
    refreshRail();
  }

  const tools = Object.fromEntries(recs.map(r => [r.id, r.tool]));
  return {
    tools, activate, refreshRail,
    /** Die Werkzeuge verdrahten sich (ihre Felder stehen jetzt), dann der
        erste Schritt — in seinem ersten Modus. */
    start(stage) {
      for (const r of recs) if (r.tool.mounted) r.tool.mounted();
      /* Auf ihrer eigenen Seite ist ein Werkzeug immer dran; hier zuerst
         keines — dran kommt nur, wessen Modus gezeigt wird. */
      for (const r of recs) if (r.tool.setActive) r.tool.setActive(false);
      activate(byStage.has(stage) ? stage : stages[0].id);
    },
    get stage() { return shell.group; },
    get tool() { return current ? current.tool : null; },
    get record() { return current; },
    guest: id => (recs.find(r => r.id === id) || {}).guest || null
  };
}
