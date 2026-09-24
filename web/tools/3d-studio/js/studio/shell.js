/* Der gemeinsame Rahmen aller Werkzeugseiten des 3D-Studios.

   Eine Seite ist überall gleich gebaut:

     Kopfzeile   Werkzeugname · Bauteil-Chip (öffnet das Laden) ·
                 Rückgängig/Wiederholen · Speicherstand · Speichern ·
                 Exportieren ▾ · Hilfe
     Seitenleiste  Reiter = MODI (einer sichtbar, jeder besitzt, was er
                 im Viewport zeigt), darunter eine Hinweiszeile, der
                 Inhalt des Modus, unten fest der Hauptknopf mit
                 Fortschritt, Zustandszeile und dem, was in JEDEM Modus
                 unter dem Knopf bleibt (setActionsExtra — der Zeitregler
                 der Simulationen)
     Viewport    Ansichtsleiste (mit Einpassen und Darstellung ▾), oben
                 links die Aktions-Chips und das Auswahlfeld, unten rechts
                 Legende und Farbskala, unten links die Bedienhinweise,
                 dazu Zielhinweis, Toast und Hinweisstreifen
     Hilfe       eine Lade von rechts, je Werkzeug ein Text mit Ankern

   Der Rahmen kennt kein Werkzeug. Er baut das Gerüst, verwaltet Modi,
   Knöpfe, Felder und Meldungen und reicht dem Werkzeug Elemente über
   data-ui — ids tragen nur die Einzelstücke, die js/ui/controls.js und
   js/ui/common.js über ids finden (colorbar, status, aim-banner, viewport)
   und die Felder der Bauteil-Klappe (demo-select …). Davon gibt es je
   Seite genau eines; die Felder der Klappe reicht der Rahmen trotzdem als
   Elemente weiter (header.partFields). */

import { colorbar as setColorbar } from '../ui/controls.js';
import { onScheme } from '../part/colors.js';
import { mountViewBar } from '../ui/viewbar.js';
import { createAimUI } from '../ui/common.js';
import { createViewport } from './viewport.js';
import { mountHelp } from './help.js';
import { fmtTime } from './format.js';
import { esc } from './rows.js';

const SKELETON = (title) => `
<header class="st-bar" data-ui="bar">
  <button type="button" class="st-icon st-panel-toggle" data-ui="panel-toggle" title="Einstellungen ein- und ausblenden" aria-label="Einstellungen" aria-expanded="true">☰</button>
  <div class="st-bar-left">
    <span class="st-tool-name" data-ui="tool-name">${esc(title)}</span>
    <div class="st-part" data-ui="part">
      <button type="button" class="st-chip" data-ui="part-chip" aria-haspopup="true" aria-expanded="false" title="Bauteil wählen oder laden">
        <span class="st-chip-label" data-ui="part-label">Bauteil</span> <b data-ui="part-name">—</b><span class="st-chip-warn" data-ui="part-warn-mark" hidden>⚠</span> <span class="st-caret">▾</span>
      </button>
      <div class="st-pop" data-ui="part-pop" hidden>
        <label class="row"><span>Beispielteil</span><select id="demo-select"></select></label>
        <input type="file" id="stl-input" accept=".stl,.glb,.json,model/stl,model/gltf-binary,application/sla,application/json" hidden>
        <button type="button" class="btn btn-outline block-btn" id="stl-btn">Datei öffnen …</button>
        <div class="st-pop-hint">STL oder GLB, oder ein gespeicherter Plan (JSON). Dateien lassen sich auch in den Viewport ziehen.</div>
        <div class="warn-line" id="model-warn"></div>
        <details class="st-details"><summary>Zum Bauteil</summary>
          <div class="hint" id="part-note"></div>
          <div class="facts" id="model-facts"></div>
        </details>
      </div>
    </div>
  </div>
  <div class="st-bar-right">
    <div class="st-undo" data-ui="undo-group" hidden>
      <button type="button" class="st-icon" data-ui="undo" title="Rückgängig (Strg+Z)" aria-label="Rückgängig" disabled>↶</button>
      <button type="button" class="st-icon" data-ui="redo" title="Wiederholen (Strg+Y)" aria-label="Wiederholen" disabled>↷</button>
    </div>
    <span class="st-save-state" data-ui="save-state" title="Entwürfe werden in diesem Browser aufgehoben"></span>
    <button type="button" class="btn btn-sm" data-ui="save" title="Den Plan als JSON-Datei speichern">Speichern</button>
    <div class="st-menu" data-ui="export-menu">
      <button type="button" class="btn btn-sm" data-ui="export" aria-haspopup="true" aria-expanded="false">Exportieren ▾</button>
      <div class="st-menu-list" data-ui="export-list" hidden></div>
    </div>
    <button type="button" class="st-icon" data-ui="help-btn" title="Hilfe zu diesem Werkzeug" aria-label="Hilfe">?</button>
  </div>
</header>
<div class="st-layout" data-ui="layout">
  <aside class="st-panel" data-ui="panel" aria-label="Einstellungen">
    <div class="st-banner" data-ui="banner" role="status" hidden></div>
    <div class="st-tabs seg tabs" role="tablist" data-ui="tabs"></div>
    <div class="st-hint" data-ui="hint"></div>
    <div class="st-body" data-ui="body"></div>
    <div class="st-actions" data-ui="actions">
      <button type="button" class="btn btn-primary block-btn" data-ui="primary" hidden></button>
      <div class="st-progress" data-ui="progress" hidden><div class="st-progress-bar" data-ui="progress-bar"></div></div>
      <div class="st-note" data-ui="note"></div>
      <div class="st-actions-extra" data-ui="actions-extra" hidden></div>
    </div>
  </aside>
  <div id="viewport" class="st-viewport" data-ui="viewport">
    <div class="st-dock-tl" data-dock="tl">
      <div class="st-chips" data-ui="chips" data-dock="chips" hidden></div>
      <div class="aim-banner hidden" id="aim-banner" data-dock="aim"><div class="aim-pill"><span id="aim-text"></span><button type="button" id="aim-cancel">Abbrechen</button></div></div>
      <div class="st-inspector" data-ui="inspector" data-dock="inspector" hidden>
        <div class="st-inspector-head">
          <span class="st-inspector-title" data-ui="inspector-title"></span>
          <button type="button" class="st-icon" data-ui="inspector-toggle" title="Einklappen" aria-label="Einklappen">▾</button>
          <button type="button" class="st-icon" data-ui="inspector-close" title="Auswahl aufheben (Esc)" aria-label="Auswahl aufheben">✕</button>
        </div>
        <div class="st-inspector-body" data-ui="inspector-body"></div>
      </div>
    </div>
    <div class="st-dock-br" data-dock="br">
      <div class="colorbar" id="colorbar" data-dock="colorbar">
        <div class="cb-title" id="cb-title"></div>
        <div class="cb-body"><div class="cb-scale" id="cb-scale"></div><div class="cb-ticks" id="cb-ticks"></div></div>
        <div class="cb-extra" id="cb-extra"></div>
      </div>
      <div class="pt-legend" id="pt-legend" data-dock="legend"></div>
    </div>
    <div class="st-dock-bl" data-dock="bl">
      <div class="st-toast" data-ui="toast" data-dock="toast" hidden role="status"></div>
      <div id="status" class="st-status" data-dock="status"></div>
    </div>
    <div id="busy"></div>
    <div class="drop-hint" data-ui="drop-hint">Datei hier ablegen</div>
  </div>
  <aside class="st-help" data-ui="help" hidden aria-label="Hilfe">
    <div class="st-help-head"><span data-ui="help-title">Hilfe</span><button type="button" class="st-icon" data-ui="help-close" title="Hilfe schließen" aria-label="Hilfe schließen">✕</button></div>
    <div class="st-help-body" data-ui="help-body"></div>
  </aside>
</div>`;

export function createShell({ mount, title, help = '', sceneOpts = {} }) {
  mount.innerHTML = SKELETON(title);
  mount.classList.add('st-root');
  const ui = name => mount.querySelector('[data-ui="' + name + '"]');
  const viewport = ui('viewport');
  const vp = createViewport(viewport, sceneOpts);
  const view = vp.view;
  const viewbar = mountViewBar(viewport, view, { fit: () => vp.fit(), popover: true });
  const aim = createAimUI();
  /* Solange gezielt wird, weicht das Auswahlfeld auf seine Kopfzeile zurück:
     es läge sonst gerade dort über dem Bauteil, wo man hinklicken will. Der
     Zielhinweis selbst ist ein Glied der Spalte oben links (zwischen Chips und
     Auswahlfeld) — frei im Bild überdeckte er Chips und Ansichtsleiste, sobald
     die Chips in mehreren Reihen stehen. */
  let foldedForAim = false;
  const aimShow = aim.show;
  aim.show = (on, msg) => {
    aimShow(on, msg);
    const el = mount.querySelector('[data-ui="inspector"]');
    if (!el) return;
    if (on && !el.hidden && !el.classList.contains('collapsed')) { el.classList.add('collapsed'); foldedForAim = true; }
    else if (!on && foldedForAim) { el.classList.remove('collapsed'); foldedForAim = false; }
    const t = mount.querySelector('[data-ui="inspector-toggle"]');
    if (t) t.textContent = el.classList.contains('collapsed') ? '▸' : '▾';
  };
  aim.hide = () => aim.show(false);
  const helpApi = mountHelp({ drawer: ui('help'), body: ui('help-body'), closeBtn: ui('help-close'), html: help });
  ui('help-title').textContent = 'Hilfe · ' + title;

  /* ── Modi ─────────────────────────────────────────────────── */
  let modes = [];
  let current = null;
  const modeListeners = [];
  const tabs = ui('tabs'), body = ui('body'), hint = ui('hint');

  function setModes(list) {
    modes = list;
    /* ids nur für aria-controls/-labelledby — ein Rahmen je Seite. */
    const tid = m => 'st-tab-' + m.id, pid = m => 'st-mode-' + m.id;
    tabs.innerHTML = list.map(m => '<button type="button" role="tab" id="' + tid(m) + '" aria-controls="' + pid(m) + '" data-mode="' + m.id + '" aria-selected="false" tabindex="-1" title="' + esc(m.hint || '') + '">'
      + '<span class="st-tab-label">' + m.label + '</span><span class="st-tab-badge" data-badge="' + m.id + '" hidden></span></button>').join('');
    body.innerHTML = list.map(m => '<section class="st-mode" id="' + pid(m) + '" aria-labelledby="' + tid(m) + '" data-mode="' + m.id + '" role="tabpanel" hidden>' + (m.html || '') + '</section>').join('');
    current = null;
  }
  tabs.addEventListener('click', ev => {
    const b = ev.target.closest('[data-mode]');
    if (b) setMode(b.getAttribute('data-mode'));
  });
  /* Reiter mit den Pfeiltasten wie jede Reiterleiste: links/rechts wechselt
     (und wählt gleich, die Modi sind billig), Pos1/Ende springen. */
  tabs.addEventListener('keydown', ev => {
    const list = [...tabs.querySelectorAll('[data-mode]')];
    const i = list.indexOf(ev.target.closest && ev.target.closest('[data-mode]'));
    if (i < 0) return;
    const j = ev.key === 'ArrowRight' ? (i + 1) % list.length : ev.key === 'ArrowLeft' ? (i - 1 + list.length) % list.length
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? list.length - 1 : -1;
    if (j < 0) return;
    ev.preventDefault();
    setMode(list[j].getAttribute('data-mode'));
    list[j].focus();
  });
  function setMode(id) {
    const m = modes.find(x => x.id === id);
    if (!m || id === current) return;
    const prev = current;
    current = id;
    for (const b of tabs.querySelectorAll('[data-mode]')) {
      const on = b.getAttribute('data-mode') === id;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
    }
    for (const s of body.querySelectorAll('.st-mode')) s.hidden = s.getAttribute('data-mode') !== id;
    hint.textContent = m.hint || '';
    hint.hidden = !m.hint;
    for (const fn of modeListeners) fn(id, prev);
    view.invalidate();
  }
  const modeSection = id => body.querySelector('.st-mode[data-mode="' + id + '"]');
  function setTabBadge(id, text, kind = '') {
    const b = tabs.querySelector('[data-badge="' + id + '"]');
    if (!b) return;
    b.textContent = text || '';
    b.hidden = !text;
    b.className = 'st-tab-badge' + (kind ? ' ' + kind : '');
  }

  /* ── Hauptknopf, Fortschritt, Zustandszeile ──────────────── */
  const primary = ui('primary'), note = ui('note'), progress = ui('progress'), progressBar = ui('progress-bar');
  const actions = ui('actions'), actionsExtra = ui('actions-extra');
  /* Ohne Knopf, Fortschritt, Zeile und Zusatz bleibt kein leerer Streifen stehen. */
  const syncActions = () => { actions.hidden = primary.hidden && note.hidden && progress.hidden && actionsExtra.hidden; };
  let lastPrimary = null, busy = false, busyClick = null;
  let primaryHandler = null;
  /* Ein Doppelklick auf „Simulieren" war Start UND Abbruch: der erste Klick
     macht den Knopf synchron zu „Abbrechen", der zweite traf ihn schon. Der
     zweite Klick eines Doppelklicks (detail > 1, auch beim doppelten Tippen)
     bricht deshalb nichts ab — wer abbrechen will, klickt eigens. */
  primary.addEventListener('click', ev => {
    if (busy) {
      if (ev && ev.detail > 1) return;
      if (busyClick) busyClick();
    } else if (primaryHandler) primaryHandler();
  });
  function renderPrimary() {
    const spec = lastPrimary;
    if (busy) {
      primary.hidden = false;
      primary.disabled = false;
      primary.className = 'btn btn-outline block-btn st-cancel';
      primary.textContent = 'Abbrechen';
      return;
    }
    if (!spec || spec.hidden) { primary.hidden = true; return; }
    primary.hidden = false;
    primary.disabled = !!spec.disabled;
    primary.className = 'btn ' + (spec.kind === 'outline' ? 'btn-outline' : 'btn-primary') + ' block-btn';
    primary.textContent = spec.label || '';
    primaryHandler = spec.onClick || null;
  }
  function setPrimary(spec) {
    lastPrimary = spec;
    renderPrimary();
    if (!spec) setNote('');
    else if (spec.reason !== undefined) setNote(spec.reason, spec.disabled ? 'muted' : (spec.noteKind || ''));
    syncActions();
  }
  function setNote(text, kind = '') {
    note.textContent = text || '';
    note.className = 'st-note' + (kind ? ' ' + kind : '');
    note.hidden = !text;
    syncActions();
  }
  const busyEl = mount.querySelector('#busy');
  /* Der Schleier über dem Bild gehört zwei Dingen: einer Rechnung (setBusy)
     und dem Laden eines Bauteils (loading). Er steht, solange eines von
     beiden ihn will — das Laden nimmt ihn einer laufenden Rechnung nicht
     mehr weg. veil: eine kurze Nachrechnung, die das Werkzeug von selbst
     startet (nach einem Zug am Griff), braucht ihn nicht — er blitzte sonst
     bei jedem Zug auf und sperrte das Auswahlfeld. */
  let veil = true, loadingText = null;
  const paintVeil = () => busyEl.classList.toggle('on', loadingText !== null || (busy && veil));
  function setBusy(on, text, onCancel, opts = {}) {
    busy = !!on;
    veil = on ? opts.veil !== false : true;
    busyClick = on ? (onCancel || busyClick) : null;
    if (text !== undefined && on) busyEl.textContent = text;
    paintVeil();
    renderPrimary();
    syncActions();
  }
  /** Ein Bauteil lädt: der Text auf dem Schleier — null, wenn es fertig ist
      (js/part/partsource.js, setBusy). */
  function loading(text) {
    loadingText = text === undefined ? null : text;
    if (loadingText !== null) busyEl.textContent = loadingText;
    paintVeil();
  }
  function setProgress(p, text) {
    if (p === null || p === undefined) {
      progress.hidden = true; progressBar.style.width = '0%';
      primary.style.removeProperty('--progress');
      syncActions();
      return;
    }
    progress.hidden = false;
    const pct = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
    progressBar.style.width = pct;
    /* In einem festen Streifen (steady) zeichnet der KNOPF den Fortschritt —
       als Füllung in sich selbst. Ein eigener Balken bräuchte dort zwölf Pixel,
       die der Seitenleiste unter dem Finger fehlen (css/studio.css). */
    primary.style.setProperty('--progress', pct);
    if (text) { setNote(text, 'busy'); busyEl.textContent = text; }
    syncActions();
  }

  /** Was unter dem Hauptknopf STEHEN BLEIBT, gleich in welchem Modus und
      gleich ob es gerade etwas zu tun gibt: der Zeitregler der Simulationen
      (js/simulation/panel-common.js). Er verschwindet NICHT, wenn nichts
      abzuspielen ist — sonst schöbe er den Hauptknopf bei jedem Lauf nach
      oben; er ist dann nur nicht scharf. */
  function setActionsExtra(html) {
    actionsExtra.innerHTML = html || '';
    actionsExtra.hidden = !html;
    /* „steady": ein Streifen mit festem Zusatz hält auch die Höhe von
       Fortschritt und Zeilen frei (css/studio.css) — sonst wandert der
       Hauptknopf bei jedem Lauf und bei jeder Meldung. */
    actions.classList.toggle('steady', !!html);
    syncActions();
    return actionsExtra;
  }

  /* ── Aktions-Chips ───────────────────────────────────────── */
  const chipsEl = ui('chips');
  let chips = [];
  /* Das Farbfeld eines Chips ist die Farbe der Art, die er setzt: eine
     Farbe oder eine Funktion, die sie beim Zeichnen nennt — dann folgt es
     einem Wechsel des Farbschemas (unten). */
  const iconOf = c => (typeof c.icon === 'function' ? c.icon() : c.icon);
  function setChips(list) {
    chips = list || [];
    chipsEl.hidden = !chips.length;
    chipsEl.innerHTML = chips.map(c => '<button type="button" class="st-chipbtn" data-chip="' + c.id + '">'
      + (c.icon ? '<span class="st-chip-icon" style="background:' + iconOf(c) + '"></span>' : '') + '<span>' + c.label + '</span></button>').join('');
    renderChips();
  }
  onScheme(() => {
    for (const c of chips) {
      const b = c.icon && chipsEl.querySelector('[data-chip="' + c.id + '"]');
      const dot = b && b.querySelector('.st-chip-icon');
      if (dot) dot.style.background = iconOf(c);
    }
  });
  function renderChips() {
    for (const c of chips) {
      const b = chipsEl.querySelector('[data-chip="' + c.id + '"]');
      if (!b) continue;
      const enabled = typeof c.enabled === 'function' ? c.enabled() : c.enabled !== false;
      const reason = !enabled && c.reason ? (typeof c.reason === 'function' ? c.reason() : c.reason) : '';
      b.classList.toggle('off', !enabled);
      b.classList.toggle('active', !!(typeof c.active === 'function' ? c.active() : c.active));
      b.setAttribute('aria-disabled', enabled ? 'false' : 'true');
      b.title = reason || c.title || '';
    }
  }
  chipsEl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-chip]');
    if (!b) return;
    const c = chips.find(x => x.id === b.getAttribute('data-chip'));
    if (!c) return;
    const enabled = typeof c.enabled === 'function' ? c.enabled() : c.enabled !== false;
    if (!enabled) { toast(c.reason ? (typeof c.reason === 'function' ? c.reason() : c.reason) : 'Geht gerade nicht.'); return; }
    c.onClick();
    renderChips();
  });

  /* ── Auswahlfeld ─────────────────────────────────────────── */
  const inspectorEl = ui('inspector'), inspTitle = ui('inspector-title'), inspBody = ui('inspector-body');
  let onInspectorClose = null;
  const inspector = {
    el: inspectorEl, body: inspBody,
    show({ title: t, html }) {
      inspTitle.innerHTML = t || '';
      if (html !== undefined) inspBody.innerHTML = html;
      inspectorEl.hidden = false;
      return inspBody;
    },
    hide() { inspectorEl.hidden = true; },
    get visible() { return !inspectorEl.hidden; },
    collapse(on) { inspectorEl.classList.toggle('collapsed', on === undefined ? !inspectorEl.classList.contains('collapsed') : !!on); ui('inspector-toggle').textContent = inspectorEl.classList.contains('collapsed') ? '▸' : '▾'; },
    onClose(fn) { onInspectorClose = fn; }
  };
  ui('inspector-toggle').addEventListener('click', () => inspector.collapse());
  /* ⓘ-Knöpfe öffnen die Hilfe an ihrem Anker — in der Seitenleiste, im
     Auswahlfeld und unter „Darstellung", auch in Kennzahlen und Feldern, die ein Werkzeug erst später
     schreibt: EIN Zuhörer je Kasten statt einer je Knopf beim Einsetzen. */
  for (const box of [body, inspBody, viewbar.pop].filter(Boolean)) {
    box.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('[data-help]');
      if (!b) return;
      /* preventDefault ist hier nötig: das ⓘ sitzt im <label> seiner Zeile,
         und ohne Abbruch setzte das Label danach noch den Fokus ins Feld
         (oder schaltete ein Häkchen um). */
      ev.preventDefault(); ev.stopPropagation();
      helpApi.show(b.getAttribute('data-help'));
    });
    /* Das ⓘ ist ein <span role="button"> (rows.js) — Eingabe und Leertaste
       lösen es aus wie einen Knopf. */
    box.addEventListener('keydown', ev => {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      const b = ev.target.closest && ev.target.closest('[data-help]');
      if (!b || b !== ev.target) return;
      ev.preventDefault(); ev.stopPropagation();
      helpApi.show(b.getAttribute('data-help'));
    });
  }
  ui('inspector-close').addEventListener('click', () => { if (onInspectorClose) onInspectorClose(); else inspector.hide(); });

  /* Freies Rechteck für das Einpassen: rechts vom Auswahlfeld — oder, in
     einem hochkant stehenden Bild, UNTER der Spalte oben links, wenn dort mehr
     Platz ist. Bei 768 px Fensterbreite blieb rechts ein Streifen von 150 px:
     das Modell wurde winzig, während die untere Bildhälfte leer stand. */
  vp.setClearRect(() => {
    const w = viewport.clientWidth, h = viewport.clientHeight;
    const dock = mount.querySelector('[data-dock="tl"]');
    const r = dock ? dock.getBoundingClientRect() : null;
    const vr = viewport.getBoundingClientRect();
    if (inspectorEl.hidden || !r || r.width <= 0) return { left: 0, top: 0, width: w, height: h };
    const left = Math.min(w * 0.7, r.right - vr.left + 12);
    const top = Math.min(h * 0.7, r.bottom - vr.top + 12);
    const beside = { left, top: 0, width: w - left, height: h };
    /* Unter der Spalte endet das Freie an der Hinweiszeile unten links — in
       einem schmalen Bild ist sie mehrzeilig und läge sonst auf dem Modell. */
    const bl = mount.querySelector('[data-dock="bl"]');
    const br = bl ? bl.getBoundingClientRect() : null;
    const foot = br && br.height > 0 ? Math.max(0, vr.bottom - br.top + 8) : 0;
    const below = { left: 0, top, width: w, height: Math.max(1, h - top - foot) };
    /* Maß ist die kürzere Seite: in sie muss das Modell passen. */
    return Math.min(below.width, below.height) > Math.min(beside.width, beside.height) ? below : beside;
  });

  /* ── Legende, Farbskala, Hinweise ────────────────────────── */
  const legendEl = mount.querySelector('#pt-legend');
  const statusEl = mount.querySelector('#status');
  const legend = html => { legendEl.innerHTML = html || ''; };
  /* Die Hinweiszeile unten links. Zum Einstieg steht dort, wie man das Bild
     bewegt — auf jeder Seite dasselbe, deshalb gehört der Text dem Rahmen;
     nach dem ersten Griff in den Viewport verblasst er. Was ein Werkzeug
     später meldet (status), steht wieder voll da. */
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const INTRO = coarse
    ? 'Ein Finger dreht · zwei Finger schieben und zoomen'
    : 'Ziehen: drehen · rechte Maustaste: verschieben · Rad: zoomen · F: einpassen';
  /* In einem schmalen Bild die kurze Fassung (css/studio.css, @container). */
  const INTRO_SHORT = coarse ? 'Ein Finger dreht · zwei zoomen' : 'Ziehen dreht · Rad zoomt · F passt ein';
  let intro = true;
  statusEl.innerHTML = '<span class="st-intro-long">' + INTRO + '</span><span class="st-intro-short">' + INTRO_SHORT + '</span>';
  /* Ein leerer Status zum Einstieg (ein Werkzeug räumt beim Einbau auf) nimmt
     den Bedienhinweis nicht weg — erst, wenn ein Werkzeug wirklich etwas sagt. */
  const status = html => { if (!html && intro) return; intro = false; statusEl.classList.remove('seen'); statusEl.innerHTML = html || ''; };
  const introSeen = () => { if (intro) statusEl.classList.add('seen'); };
  viewport.addEventListener('pointerdown', introSeen);
  viewport.addEventListener('wheel', introSeen, { passive: true });
  /* „Darstellung ▾" gibt es nur, wenn das Werkzeug Anzeigeoptionen hat. */
  const darstellungBtn = viewbar.querySelector('[data-darstellung]'), darstellungSep = viewbar.querySelector('[data-darstellung-sep]');
  const darstellung = html => {
    if (viewbar.pop) viewbar.pop.innerHTML = html || '';
    if (darstellungBtn) darstellungBtn.hidden = !html;
    if (darstellungSep) darstellungSep.hidden = !html;
    return viewbar.pop;
  };
  darstellung('');

  /* Wo die Ansichtsleiste endet, MISST der Rahmen: sie ist je nach Schrift
     (Firefox setzt breiter), Zeiger (44 px unter dem Finger) und Bildbreite ein-
     oder zweizeilig. Chips und Auswahlfeld rücken in einem schmalen Bild genau
     darunter (css/studio.css, --bar-bottom) — geraten statt gemessen lagen sie
     unter dem Finger wieder unter der Leiste. */
  if (typeof ResizeObserver === 'function') {
    const measureBar = () => viewport.style.setProperty('--bar-bottom', (viewbar.offsetTop + viewbar.offsetHeight + 8) + 'px');
    const ro = new ResizeObserver(measureBar);
    ro.observe(viewbar);
    ro.observe(viewport);
    measureBar();
  }

  /* ── Toast und Streifen ──────────────────────────────────── */
  const toastEl = ui('toast');
  let toastTimer = 0;
  function toast(text, { action, onAction, ms = 6000 } = {}) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = '<span>' + esc(text) + '</span>' + (action ? '<button type="button" class="st-toast-act">' + esc(action) + '</button>' : '');
    toastEl.hidden = false;
    const act = toastEl.querySelector('.st-toast-act');
    if (act) act.addEventListener('click', () => { toastEl.hidden = true; if (onAction) onAction(); });
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
  }
  const hideToast = () => { clearTimeout(toastTimer); toastEl.hidden = true; };
  const bannerEl = ui('banner');
  function banner(spec) {
    if (!spec) { bannerEl.hidden = true; bannerEl.innerHTML = ''; return; }
    /* Der Streifen steht in der Seitenleiste: ist sie weggenommen (☰), holt
       er sie zurück — sonst fragte die Abstandsanalyse beim Ablegen einer
       Datei („als A oder als B?") ins Leere. */
    const lay = ui('layout');
    if (lay && lay.classList.contains('panel-closed')) {
      lay.classList.remove('panel-closed');
      const t = ui('panel-toggle');
      if (t) t.setAttribute('aria-expanded', 'true');
      view.invalidate();
    }
    bannerEl.innerHTML = '<div class="st-banner-text">' + esc(spec.text) + '</div><div class="st-banner-actions">'
      + (spec.actions || []).map((a, i) => '<button type="button" class="btn btn-sm ' + (a.primary ? 'btn-primary' : 'btn-outline') + '" data-banner="' + i + '">' + esc(a.label) + '</button>').join('') + '</div>';
    bannerEl.hidden = false;
    for (const b of bannerEl.querySelectorAll('[data-banner]')) {
      b.addEventListener('click', () => { const a = spec.actions[+b.getAttribute('data-banner')]; banner(null); if (a.onClick) a.onClick(); });
    }
  }

  /* ── Kopfzeile ───────────────────────────────────────────── */
  /* Die Klappen der Kopfzeile: immer höchstens eine offen, ein Klick
     daneben schließt sie. */
  const closers = [];
  const closeAll = except => { for (const c of closers) if (c !== except) c(false); };
  /* Eine Klappe hängt links an ihrem Chip — auf dem Telefon reichte sie damit
     bis zu 140 px über den rechten Rand. Beim Öffnen gemessen und, wenn
     nötig, nach links gerückt. */
  const keepInside = pop => {
    pop.style.left = '';
    const r = pop.getBoundingClientRect(), over = r.right - (innerWidth - 8);
    if (r.width > 0 && over > 0) pop.style.left = -Math.min(over, Math.max(0, r.left - 8)) + 'px';
  };
  function popover(chip, pop, { keep = true } = {}) {
    const open = on => { pop.hidden = !on; chip.setAttribute('aria-expanded', on ? 'true' : 'false'); chip.classList.toggle('active', on); if (on && keep) keepInside(pop); };
    open.isOpen = () => !pop.hidden;
    closers.push(open);
    chip.addEventListener('click', ev => { ev.stopPropagation(); const on = pop.hidden; closeAll(open); open(on); });
    pop.addEventListener('click', ev => ev.stopPropagation());
    return open;
  }
  const partChip = ui('part-chip');
  const partOpen = popover(partChip, ui('part-pop'));
  /* Das Aufklappfeld „Darstellung" der Ansichtsleiste und das Menü
     „Exportieren" sind Klappen wie diese (ui/viewbar.js baut nur Kasten und
     Knopf). Das Menü hängt rechts an seinem Knopf und reicht nie über den
     Rand — es rückt nicht. */
  if (viewbar.pop) popover(viewbar.popChip, viewbar.pop);
  const exportBtn = ui('export'), exportList = ui('export-list');
  const exportOpen = popover(exportBtn, exportList, { keep: false });
  document.addEventListener('click', () => closeAll(null));
  /* Die Felder einer Bauteil-Klappe — js/part/partsource.js bekommt sie als
     Elemente, nicht als ids. */
  const fieldsIn = (box, key = '') => {
    const q = name => box.querySelector('#' + name + (key ? '-' + key : ''));
    return { select: q('demo-select'), input: q('stl-input'), button: q('stl-btn'), warn: q('model-warn'), note: q('part-note'), facts: q('model-facts') };
  };
  const partFields = fieldsIn(ui('part-pop'));

  /* Mehrere Eingänge statt eines Bauteils (die Abstandsanalyse misst Datei A
     gegen Datei B): je Eingang ein Chip mit derselben Klappe wie der
     Bauteil-Chip — Beispielteil, „Datei öffnen …", „Zum Bauteil". Die Felder
     tragen ids mit Suffix („-a") und gehen als Elemente an
     js/part/partsource.js (fields). */
  const ACCEPT_PARTS = '.stl,.glb,model/stl,model/gltf-binary,application/sla';
  function addPartChips(list, hint = '') {
    const partChipsApi = {};
    const html = list.map(({ key, label, title: t = '' }) => '<div class="st-part" data-ui="part-' + key + '">'
      + '<button type="button" class="st-chip" data-ui="part-chip-' + key + '" aria-haspopup="true" aria-expanded="false" title="' + esc(t || label + ' wählen oder laden') + '">'
      + '<span class="st-chip-key">' + esc(label) + '</span> <b data-ui="part-name-' + key + '">—</b><span class="st-chip-warn" data-ui="part-warn-mark-' + key + '" hidden>⚠</span> <span class="st-caret">▾</span></button>'
      + '<div class="st-pop" data-ui="part-pop-' + key + '" hidden>'
      + '<label class="row"><span>Beispielteil</span><select id="demo-select-' + key + '"></select></label>'
      + '<input type="file" id="stl-input-' + key + '" accept="' + ACCEPT_PARTS + '" hidden>'
      + '<button type="button" class="btn btn-outline block-btn" id="stl-btn-' + key + '">Datei öffnen …</button>'
      + (hint ? '<div class="st-pop-hint">' + hint + '</div>' : '')
      + '<div class="warn-line" id="model-warn-' + key + '"></div>'
      + '<details class="st-details"><summary>Zum Bauteil</summary><div class="hint" id="part-note-' + key + '"></div><div class="facts" id="model-facts-' + key + '"></div></details>'
      + '</div></div>').join('');
    /* In der Reihenfolge der Liste hinter den (verborgenen) Bauteil-Chip. */
    ui('part').insertAdjacentHTML('afterend', html);
    for (const { key, label, title: t = '' } of list) {
      const chip = ui('part-chip-' + key);
      const open = popover(chip, ui('part-pop-' + key));
      const plain = t || label + ' wählen oder laden';
      partChipsApi[key] = {
        chip, open, fields: fieldsIn(ui('part-pop-' + key), key),
        set(name, warning = '') {
          ui('part-name-' + key).textContent = name || '—';
          ui('part-warn-mark-' + key).hidden = !warning;
          chip.title = warning ? 'Hinweis zum Netz: ' + warning : plain;
          open(false);
        }
      };
    }
    return partChipsApi;
  }
  let exportsList = [];
  function setExports(list) {
    exportsList = list || [];
    exportBtn.hidden = !exportsList.length;
    exportList.innerHTML = exportsList.map((e, i) => '<button type="button" data-export="' + i + '">' + esc(e.label) + '</button>').join('');
    for (const b of exportList.querySelectorAll('[data-export]')) {
      b.addEventListener('click', ev => {
        ev.stopPropagation();
        const e = exportsList[+b.getAttribute('data-export')];
        const ok = typeof e.enabled === 'function' ? e.enabled() : e.enabled !== false;
        exportOpen(false);
        if (!ok) { toast(e.reason ? (typeof e.reason === 'function' ? e.reason() : e.reason) : 'Dafür gibt es noch nichts.'); return; }
        e.run();
      });
    }
  }
  const header = {
    setPart(name, label, warning = '') {
      ui('part-name').textContent = name || '—';
      if (label) ui('part-label').textContent = label;
      ui('part-warn-mark').hidden = !warning;
      partChip.title = warning ? 'Hinweis zum Netz: ' + warning : 'Bauteil wählen oder laden';
      partOpen(false);
    },
    /** Die Felder der Bauteil-Klappe: { select, input, button, warn, note, facts }. */
    partFields,
    setSave({ state, when }) {
      const el = ui('save-state');
      const t = when ? fmtTime(when) : '';
      const text = state === 'dirty' ? 'Ungespeichert' : state === 'draft' ? 'Entwurf ' + t : state === 'saved' ? 'Gespeichert ' + t : '';
      el.textContent = text;
      el.className = 'st-save-state' + (state ? ' ' + state : '');
      /* Solange etwas nicht in einer Datei steht, ist Speichern der gefüllte Knopf. */
      ui('save').classList.toggle('dirty', state === 'dirty' || state === 'draft');
    },
    setUndo({ visible = true, canUndo = false, canRedo = false, undoLabel = '', redoLabel = '' }) {
      ui('undo-group').hidden = !visible;
      const u = ui('undo'), r = ui('redo');
      u.disabled = !canUndo; r.disabled = !canRedo;
      u.title = 'Rückgängig (Strg+Z)' + (undoLabel ? ': ' + undoLabel : '');
      r.title = 'Wiederholen (Strg+Y)' + (redoLabel ? ': ' + redoLabel : '');
    },
    onSave(fn) { ui('save').addEventListener('click', fn); },
    onUndo(fn) { ui('undo').addEventListener('click', fn); },
    onRedo(fn) { ui('redo').addEventListener('click', fn); },
    setExports,
    /** Für Werkzeuge mit eigenen Dateien (die Abstandsanalyse hat zwei). */
    hidePart() { ui('part').hidden = true; },
    /** Der Bauteil-Chip für eine andere Quelle (die Angussfüllung lädt
        Angusssysteme): wie die Liste heißt, was der Knopf öffnet (`accept`)
        und der Hinweis darunter; „Zum Bauteil" entfällt. Die Felder bleiben
        partFields — die Quelle verdrahtet sie selbst. */
    setPartSource({ list, button, accept, hint }) {
      const pop = ui('part-pop');
      pop.querySelector('label.row span').textContent = list;
      partFields.button.textContent = button;
      partFields.input.setAttribute('accept', accept);
      pop.querySelector('.st-pop-hint').textContent = hint;
      pop.querySelector('details').hidden = true;
      ui('part').hidden = false;
    },
    /** Je Eingang ein Chip mit Bauteil-Klappe: [{ key, label, title }] → { key: { set(name, warning), open, fields } } */
    addPartChips
  };
  ui('help-btn').addEventListener('click', ev => { ev.stopPropagation(); helpApi.toggle(); });
  /* ☰ nimmt die Seitenleiste weg und holt sie wieder — bei jeder Breite: wo
     sie neben dem Bild steht, bekommt das Bild den Platz; unter 720 px, wo sie
     als Lade darüber liegt, gleitet sie hinaus (css/studio.css). Sie ist DA,
     bis man sie wegnimmt: ein Klick ins Bild schließt sie nicht, sonst wäre
     sie für jeden, der mit schmalem Fenster arbeitet, ständig verschwunden. */
  const layoutEl = ui('layout'), toggleEl = ui('panel-toggle');
  toggleEl.addEventListener('click', ev => {
    ev.stopPropagation();
    const closed = layoutEl.classList.toggle('panel-closed');
    toggleEl.setAttribute('aria-expanded', closed ? 'false' : 'true');
    view.invalidate();
  });

  /* ── Tastatur: ein Zuhörer, das Werkzeug bekommt die Taste ─ */
  const keyListeners = [];
  /* Wer TIPPT, dem gehören die Tasten: Textfelder (dort machen Strg+Z und
     Entf, was sie im Text tun) und Auswahllisten (Buchstaben springen dort
     zu Einträgen). Ein Regler, ein Häkchen oder ein Knopf mit Fokus ist kein
     Tippen: nach einem Zug am Regler gingen Strg+Z und Entf sonst ins
     Leere, bis man irgendwo anders hinklickte. */
  const TEXT_TYPES = new Set(['text', 'search', 'number', 'email', 'password', 'tel', 'url', '']);
  document.addEventListener('keydown', ev => {
    const t = ev.target;
    const tag = t && t.tagName ? t.tagName : '';
    const inText = (tag === 'INPUT' && TEXT_TYPES.has(String(t.type || '').toLowerCase())) || tag === 'TEXTAREA' || !!(t && t.isContentEditable);
    const inSelect = tag === 'SELECT';
    const inInput = inText || inSelect;
    if (ev.key === 'Escape' && helpApi.open) { helpApi.hide(); return; }
    /* Eine offene Klappe der Kopfzeile schließt Esc zuerst. */
    if (ev.key === 'Escape' && closers.some(c => c.isOpen && c.isOpen())) { closeAll(null); return; }
    for (const fn of keyListeners) { if (fn(ev, { inInput, inText, inSelect }) === true) { ev.preventDefault(); return; } }
  });

  return {
    root: mount, ui, viewport, view, vp, viewbar, aim, help: helpApi,
    fit: (box, margin) => vp.fit(box, margin),
    /** Worauf F, „Einpassen" und der Doppelklick einpassen: eine Funktion, die
        den Hüllquader JETZT liefert — der Körper eines Designers wächst. */
    setFitTarget: fn => vp.setFitTarget(fn),
    setModes, setMode, get mode() { return current; }, onMode(fn) { modeListeners.push(fn); }, modeSection, setTabBadge,
    setPrimary, setNote, setBusy, progress: setProgress, get busy() { return busy; },
    setActionsExtra, actionsExtra,
    setChips, renderChips,
    inspector,
    legend, status, colorbar: setColorbar, darstellung,
    toast, hideToast, banner,
    header,
    onKey(fn) { keyListeners.push(fn); },
    loading
  };
}
