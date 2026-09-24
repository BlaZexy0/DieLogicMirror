/* Die Gruppen und Teile einer Form — der Modus „Teile" des Formaufbaus,
   gebaut für die Halle: große Zeilen (unter dem Finger jedes Ziel 44 px,
   css/studio.css), alles Häufige mit einem Fingertipp, alles Seltene
   hinter „⋯".

   Je Gruppe ein Kopf: der Pfeil (auf- und zuklappen), die Glühbirne
   (leuchtet, solange etwas sichtbar ist; ein Tipp schaltet die Gruppe um),
   der Name (ein Tipp hebt die ganze Gruppe hervor), darunter Seite und Zahl
   der Teile — und „⋯" mit Umbenennen, STL-Dateien laden, einer Farbe für
   alle Teile und Entfernen (nur leer). Je Teil: der Schalter, das Farbfeld
   (tippen öffnet den Farbwähler), der Name (ein Tipp hebt das Teil hervor)
   und „⋯" mit Umbenennen, Verschieben in eine andere Gruppe und Entfernen.
   Das Verschieben stand früher als Auswahlfeld in JEDER Zeile — als
   Heizkühlplan in der Halle braucht das niemand, es nahm nur Platz und
   Aufmerksamkeit. Namen sind Knöpfe: mit der Tastatur erreichbar, und
   sie brechen um, statt abgeschnitten zu werden.

   Aufgeklappt ist EINE Gruppe zur Zeit: ihre Zeilen stehen unter dem
   Kopf, die der anderen Gruppen bleiben im Baum, nur unsichtbar — eine
   Form hat schnell dreißig Teile, und wer zwischen den Gruppen wechseln
   will, soll nicht durch alle Zeilen rollen. Ein Tipp auf den Kopf (den
   Pfeil, die Zahl der Teile, die freie Fläche) klappt die Gruppe auf und
   die vorige zu, ein zweiter Tipp klappt sie zu. Glühbirne, Name und „⋯"
   tun weiter ihr Eigenes. Eine NEUE Hervorhebung zieht die Gruppe des
   Teils auf, damit die Zeile zu sehen ist; wer sie danach zuklappt,
   bekommt sie nicht wieder aufgedrängt. Die aufgeklappte Gruppe ist auch
   das Ziel für STL-Dateien (openGroup).

   Was die Liste ändert, meldet sie dem Werkzeug (js/formaufbau/tool.js):
   onEdit(label, info) für eine Änderung an der Form — daraus werden
   Rückgängig und Entwurf —, onView(info) für die Ansicht (Ein- und
   Ausblenden, die Farbe, solange der Wähler noch offen ist), onHighlight(ids)
   für einen Tipp auf einen Namen. Hervorheben ist Sache des Werkzeugs: es
   sagt der Liste mit highlighted(id), was hervorgehoben ist. Die Liste wird
   nach jeder Änderung ganz neu gezeichnet — sie ist klein, das ist billiger
   als jede Zeile einzeln nachzuziehen. Nur der Farbwähler zeichnet während
   des Ziehens nicht neu: ein neu gebautes Eingabefeld unter dem Finger
   schlösse den Wähler.

   Namen und Schlüssel der Gruppen kommen aus der GLB (glTF-extras), also
   von irgendwem: in HTML nur durch esc(), sonst als Text. */

import { esc } from '../studio/rows.js';
import { classColor } from '../materials.js';

const BULB = '<svg class="bulb" viewBox="0 0 24 24" aria-hidden="true">'
  + '<g class="rays"><path d="M12 1v1.8M4.4 4.4l1.3 1.3M19.6 4.4l-1.3 1.3M1.4 12h1.8M20.8 12h1.8"/></g>'
  + '<path class="glass" d="M12 4.1a5.4 5.4 0 0 0-3.2 9.75c.55.4.9 1 .98 1.65l.12.9h4.2l.12-.9c.08-.65.43-1.25.98-1.65A5.4 5.4 0 0 0 12 4.1Z"/>'
  + '<path class="socket" d="M9.9 18.1h4.2M10.6 20.4h2.8"/></svg>';

const SIDE_LABEL = { fix: 'fest', mov: 'beweglich' };

function button(cls, html, title, act) {
  const b = document.createElement('button');
  b.setAttribute('type', 'button');
  b.className = cls;
  b.innerHTML = html;
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  if (act) b.setAttribute('data-act', act);
  return b;
}

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

/* Text an Ort und Stelle bearbeiten: ein Eingabefeld an die Stelle des
   Namens (der Knopf weicht solange), Enter oder Verlassen übernimmt,
   Escape verwirft. */
function editInline(anchor, current, commit) {
  const input = document.createElement('input');
  input.setAttribute('type', 'text');
  input.setAttribute('spellcheck', 'false');
  input.setAttribute('autocomplete', 'off');
  input.className = 'inline-edit';
  input.value = current;
  anchor.hidden = true;
  anchor.after(input);
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    const v = String(input.value).trim();
    input.remove();
    anchor.hidden = false;
    if (ok && v && v !== current) commit(v);
  };
  input.addEventListener('change', () => finish(true));
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  /* Der Tipp auf den Kopf klappt sonst — nicht beim Bearbeiten. */
  input.addEventListener('click', e => e.stopPropagation());
  if (input.focus) input.focus();
  if (input.select) input.select();
}

export function createPartList(el, {
  onEdit, onView, onAddFiles, onHighlight = () => {}, highlighted = () => false
}) {
  let asm = null;
  let openMenu = null;
  let openGroup;                   // Schlüssel der aufgeklappten Gruppe; null = alle zu
  let lastHl = '';                 // die Hervorhebung beim letzten Zeichnen
  const firstWithItems = () => { const g = asm.groups.find(x => asm.items.some(i => i.group === x.key)) || asm.groups[0]; return g ? g.key : null; };
  const closeMenus = () => {
    if (!openMenu) return false;
    openMenu.classList.add('hidden');
    const more = openMenu.parentNode && openMenu.parentNode.querySelector('[aria-expanded][data-act$="menu"]');
    if (more) more.setAttribute('aria-expanded', 'false');
    openMenu = null;
    return true;
  };
  const toggleMenu = (menu, more) => {
    const wasOpen = openMenu === menu;
    closeMenus();
    if (!wasOpen) { menu.classList.remove('hidden'); more.setAttribute('aria-expanded', 'true'); openMenu = menu; }
  };
  const dots = new Map();          // Teil-id → Farbfeld, für das Nachfärben ohne Neuzeichnen

  /* Ein Tipp irgendwo sonst schließt das offene Menü. */
  document.addEventListener('pointerdown', e => {
    const t = e.target;
    if (openMenu && !(t && t.closest && t.closest('.row-menu, [data-act="menu"], [data-act="group-menu"]'))) closeMenus();
  });

  /* Wo die Tastatur stand: ein neu gezeichneter Knopf verlöre den Fokus
     sonst bei jedem Tipp (Hervorheben, Aufklappen), und wer mit Tab und
     Eingabe arbeitet, begänne jedes Mal von vorn. */
  function focusKey() {
    const a = document.activeElement;
    if (!a || !el.contains(a) || !a.getAttribute || !a.getAttribute('data-act')) return null;
    const row = a.closest('[data-item]'), head = a.closest('[data-group]');
    return { act: a.getAttribute('data-act'), attr: row ? 'data-item' : 'data-group', key: (row || head) ? (row || head).getAttribute(row ? 'data-item' : 'data-group') : null };
  }
  function refocus(was) {
    if (!was || was.key === null) return;
    const box = [...el.querySelectorAll('[' + was.attr + ']')].find(x => x.getAttribute(was.attr) === was.key);
    const target = box && box.querySelector('[data-act="' + was.act + '"]');
    if (target && target.focus) target.focus();
  }

  function render() {
    const was = focusKey();
    el.innerHTML = '';
    openMenu = null;
    dots.clear();
    if (!asm) return;
    const refreshers = [];
    const refreshAll = () => { for (const f of refreshers) f(); };

    if (openGroup === undefined || (openGroup !== null && !asm.groups.some(g => g.key === openGroup))) openGroup = firstWithItems();
    const hlNow = asm.items.filter(i => highlighted(i.id)).map(i => i.id).sort().join(' ');
    if (hlNow !== lastHl) {
      lastHl = hlNow;
      if (hlNow && !asm.items.some(i => i.group === openGroup && highlighted(i.id))) openGroup = asm.items.find(i => highlighted(i.id)).group;
    }

    for (const g of asm.groups) {
      const mine = asm.items.filter(i => i.group === g.key);
      const allHl = mine.length > 0 && mine.every(i => highlighted(i.id));
      const open = g.key === openGroup;

      const head = document.createElement('div');
      head.className = 'group-head' + (allHl ? ' hl' : '') + (open ? '' : ' folded');
      head.setAttribute('data-group', g.key);
      const fold = button('fold-btn', open ? '&#9662;' : '&#9656;', g.title + (open ? ' zuklappen' : ' aufklappen'), 'fold');
      fold.setAttribute('aria-expanded', open ? 'true' : 'false');
      const bulb = button('bulb-btn', BULB, g.title + ' ein- oder ausblenden');
      bulb.setAttribute('aria-pressed', 'true');
      /* Der Name hebt die Gruppe hervor; Seite und Zahl der Teile stehen klein
         darunter und klappen wie der Rest des Kopfes. */
      const title = button('group-title', '', 'Tippen: ' + g.title + ' hervorheben', 'hl-group');
      title.removeAttribute('aria-label');
      title.textContent = g.title;
      const tag = span('side-tag', SIDE_LABEL[g.side]
        + (g.slide ? ' · Schieber ' + (g.slide.sign > 0 ? '+' : '−') + g.slide.axis.toUpperCase() : ''));
      const count = span('count', '');
      const more = button('row-btn more', '&#8943;', 'Gruppe: umbenennen, STL laden, Farbe, entfernen', 'group-menu');
      more.setAttribute('aria-expanded', 'false');
      const line = document.createElement('div');
      line.className = 'group-line';
      const text = document.createElement('div');
      text.className = 'group-text';
      const meta = document.createElement('div');
      meta.className = 'group-meta';
      meta.append(tag, span('sep', ' · '), count);
      text.append(title, meta);
      line.append(fold, bulb, text, more);
      head.appendChild(line);

      /* Das Menü der Gruppe — zu, bis „⋯" es öffnet. */
      const menu = document.createElement('div');
      menu.className = 'row-menu hidden';
      const rename = button('menu-btn', '&#9998; Umbenennen', '', 'rename-group');
      const add = button('menu-btn', '+ STL laden', '', 'add-stl');
      const colorWrap = document.createElement('label');
      colorWrap.className = 'menu-color';
      const colorIn = document.createElement('input');
      colorIn.setAttribute('type', 'color');
      colorIn.setAttribute('data-act', 'group-color');
      colorIn.value = g.color || classColor(g.mat);
      colorWrap.append(colorIn, span('', 'Farbe für alle'));
      const del = button('menu-btn danger', '&times; Gruppe entfernen', '', 'remove-group');
      del.disabled = mine.length > 0;
      if (del.disabled) del.title = 'Nur eine leere Gruppe lässt sich entfernen';
      menu.append(rename, add, colorWrap, del);
      head.appendChild(menu);
      el.appendChild(head);

      /* Die Zeilen der Gruppe — zu, wenn eine andere aufgeklappt ist. */
      const body = document.createElement('div');
      body.className = 'group-body' + (open ? '' : ' folded');
      body.setAttribute('data-body', g.key);
      el.appendChild(body);
      const boxes = mine.map(it => addRow(it, refreshAll, body));
      if (!mine.length) {
        const empty = document.createElement('div');
        empty.className = 'comp-empty';
        empty.textContent = 'keine Teile: über ⋯ laden oder ein Teil hierher verschieben';
        body.appendChild(empty);
      }

      const refresh = () => {
        const shown = boxes.filter(b => b.checked).length;
        const on = !boxes.length || shown > 0;
        bulb.classList.toggle('on', on);
        bulb.setAttribute('aria-pressed', on ? 'true' : 'false');
        count.textContent = !mine.length ? 'leer'
          : mine.length + (mine.length === 1 ? ' Teil' : ' Teile') + (shown < mine.length ? ' · ' + (mine.length - shown) + ' aus' : '');
      };
      refreshers.push(refresh);
      const toggleFold = () => { openGroup = open ? null : g.key; render(); };
      fold.addEventListener('click', e => { e.stopPropagation(); toggleFold(); });
      head.addEventListener('click', e => {
        const t = e.target;
        if (t && t.closest && t.closest('button, .row-menu, input, label, .inline-edit')) return;
        toggleFold();
      });
      bulb.addEventListener('click', () => {
        const show = !boxes.some(b => b.checked);
        for (const b of boxes) { b.checked = show; asm.setVisible(b.getAttribute('data-comp'), show); }
        refreshAll();
        onView({ visibility: true });
      });
      title.addEventListener('click', () => { if (mine.length) onHighlight(mine.map(i => i.id)); });
      more.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu, more); });
      rename.addEventListener('click', () => {
        closeMenus();
        const was = g.title;
        editInline(title, was, v => { if (asm.renameGroup(g.key, v)) { render(); onEdit('Gruppe „' + was + '" umbenannt', { names: true }); } });
      });
      add.addEventListener('click', () => { closeMenus(); onAddFiles(g.key); });
      /* Der Wähler färbt, solange er offen ist (Ansicht); ein Schritt wird es,
         wenn er sich schließt. */
      colorIn.addEventListener('input', () => {
        if (!asm.setGroupColor(g.key, colorIn.value)) return;
        for (const it of mine) paintDot(it);
        onView({ color: true });
      });
      colorIn.addEventListener('change', () => {
        if (asm.setGroupColor(g.key, colorIn.value)) onEdit('Farbe der Gruppe „' + g.title + '"', { color: true });
        render();
      });
      del.addEventListener('click', () => { if (asm.removeGroup(g.key)) { render(); onEdit('Gruppe „' + g.title + '"', { removed: true, names: true }); } });
    }
    refreshAll();
    refocus(was);
  }

  function paintDot(it) {
    const dot = dots.get(it.id);
    if (dot) dot.style.background = it.color;
  }

  function addRow(it, refreshAll, parent) {
    const row = document.createElement('div');
    row.className = 'comp-row' + (highlighted(it.id) ? ' hl' : '');
    row.setAttribute('data-item', it.id);
    /* Der Schalter sitzt in einem Label: das ist das Ziel für den Finger. */
    const vis = document.createElement('label');
    vis.className = 'vis';
    vis.title = it.label + ' ein- oder ausblenden';
    const cb = document.createElement('input');
    cb.setAttribute('type', 'checkbox');
    cb.setAttribute('data-comp', it.id);
    cb.setAttribute('aria-label', it.label + ' sichtbar');
    cb.checked = it.object.visible !== false;
    vis.appendChild(cb);

    /* Das Farbfeld IST der Farbwähler: das echte Eingabefeld liegt
       unsichtbar darüber, so öffnet ein Tipp den Wähler des Systems. */
    const swatch = document.createElement('label');
    swatch.className = 'swatch';
    swatch.title = 'Farbe ändern';
    const colorIn = document.createElement('input');
    colorIn.setAttribute('type', 'color');
    colorIn.setAttribute('data-act', 'color');
    colorIn.setAttribute('aria-label', 'Farbe von ' + it.label);
    colorIn.value = it.color;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = it.color;
    swatch.append(colorIn, dot);
    dots.set(it.id, dot);

    const name = button('name', '', 'Tippen: hervorheben · ' + it.id, 'hl');
    name.removeAttribute('aria-label');
    name.textContent = it.label;
    const more = button('row-btn more', '&#8943;', it.label + ': umbenennen, verschieben, entfernen', 'menu');
    more.setAttribute('aria-expanded', 'false');
    row.append(vis, swatch, name, more);

    const menu = document.createElement('div');
    menu.className = 'row-menu hidden';
    const ren = button('menu-btn', '&#9998; Umbenennen', '', 'rename');
    const moveWrap = document.createElement('label');
    moveWrap.className = 'menu-move';
    const move = document.createElement('select');
    move.className = 'row-move';
    move.setAttribute('data-act', 'move');
    move.innerHTML = asm.groups.map(g => '<option value="' + esc(g.key) + '"' + (g.key === it.group ? ' selected' : '') + '>' + esc(g.title) + '</option>').join('');
    move.value = it.group;
    moveWrap.append(span('', 'Verschieben nach'), move);
    const del = button('menu-btn danger', '&times; Entfernen', '', 'remove');
    menu.append(ren, moveWrap, del);
    row.appendChild(menu);
    parent.appendChild(row);

    cb.addEventListener('change', () => { asm.setVisible(it.id, cb.checked); refreshAll(); onView({ visibility: true }); });
    colorIn.addEventListener('input', () => { if (asm.setColor(it.id, colorIn.value)) { paintDot(it); onView({ color: true }); } });
    colorIn.addEventListener('change', () => {
      if (asm.setColor(it.id, colorIn.value)) onEdit('Farbe von „' + it.label + '"', { color: true });
      render();
    });
    name.addEventListener('click', () => onHighlight([it.id]));
    more.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu, more); });
    move.addEventListener('change', () => {
      const g = asm.groupOf(move.value);
      if (!asm.moveItem(it.id, move.value)) return;
      openGroup = move.value;
      render();
      onEdit('„' + it.label + '" nach „' + (g ? g.title : move.value) + '" verschoben');
    });
    ren.addEventListener('click', () => {
      closeMenus();
      const was = it.label;
      editInline(name, was, v => { if (asm.renameItem(it.id, v)) { render(); onEdit('„' + was + '" umbenannt', { names: true }); } });
    });
    del.addEventListener('click', () => { if (asm.removeItem(it.id)) { render(); onEdit('„' + it.label + '"', { removed: true }); } });
    return cb;
  }

  return {
    render,
    /** Das offene Menü schließen — true, wenn eines offen war (Esc). */
    closeMenus,
    /** Eine neue Form: alles zu bis auf die erste Gruppe mit Teilen. */
    setAssembly(next) { asm = next; openGroup = undefined; lastHl = ''; render(); },
    /** Die Gruppe eines Teils oder eine Gruppe aufklappen — nach dem Laden
        einer STL, nach Rückgängig: man sieht, was wiederkam. */
    reveal({ item, group } = {}) {
      if (!asm) return;
      const key = group || (item && asm.itemOf(item) ? asm.itemOf(item).group : null);
      if (key && asm.groupOf(key)) openGroup = key;
      render();
    },
    /** Die aufgeklappte Gruppe (null: keine) — das Ziel für STL-Dateien. */
    get openGroup() { return openGroup === undefined ? null : openGroup; }
  };
}
