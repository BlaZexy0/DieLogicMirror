/* Seitenleiste des Formaufbau-Viewers: die Gruppen und Teile einer
   bearbeitbaren Baugruppe (js/assembly.js) — gebaut für die Halle: große
   Zeilen, alles Häufige mit einem Fingertipp, alles Seltene hinter „⋯".

   Je Gruppe ein Kopf: die Glühbirne (leuchtet, solange etwas sichtbar
   ist; ein Tipp schaltet die Gruppe um), der Name (ein Tipp hebt die
   ganze Gruppe hervor), die Seite — und „⋯" mit Umbenennen, STL-Dateien
   laden, einer Farbe für alle Teile und Entfernen (nur leer).
   Je Teil: der Schalter, das Farbfeld (tippen öffnet den Farbwähler), der
   Name (ein Tipp hebt das Teil hervor) und „⋯" mit Umbenennen, Verschieben
   in eine andere Gruppe und Entfernen. Das Verschieben stand früher als
   Auswahlfeld in JEDER Zeile — als Heizkühlplan in der Halle braucht das
   niemand, es nahm nur Platz und Aufmerksamkeit.

   Hervorheben ist Sache des Viewers (js/die.js): er sagt der Leiste mit
   `highlighted(id)`, was hervorgehoben ist, und bekommt mit
   `onHighlight(ids)` die Teile, die der Tipp meint. Die Leiste wird nach
   jeder Änderung ganz neu gezeichnet — sie ist klein, das ist billiger
   als jede Zeile einzeln nachzuziehen. Nur der Farbwähler zeichnet
   während des Ziehens nicht neu: ein neu gebautes Eingabefeld unter dem
   Finger schlösse den Wähler. */

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
  b.title = title;
  if (act) b.setAttribute('data-act', act);
  return b;
}

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

/* Text an Ort und Stelle bearbeiten: Eingabefeld statt Text, Enter oder
   Verlassen übernimmt, Escape verwirft. */
function editInline(target, current, commit) {
  const input = document.createElement('input');
  input.setAttribute('type', 'text');
  input.className = 'inline-edit';
  input.value = current;
  target.textContent = '';
  target.appendChild(input);
  let done = false;
  const finish = ok => {
    if (done) return;
    done = true;
    const v = String(input.value).trim();
    input.remove();
    target.textContent = ok && v ? v : current;
    if (ok && v && v !== current) commit(v);
  };
  input.addEventListener('change', () => finish(true));
  input.addEventListener('blur', () => finish(true));
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  /* Der Tipp auf den Namen hebt sonst hervor — nicht beim Bearbeiten. */
  input.addEventListener('click', e => e.stopPropagation());
  if (input.focus) input.focus();
  if (input.select) input.select();
}

/* Ein Tipp irgendwo sonst schließt das offene Menü — ein Zuhörer für
   alle Leisten, die es je gab (der Viewer baut sie je Modell neu). */
let current = null;
document.addEventListener('pointerdown', e => {
  const t = e.target;
  if (current && !(t && t.closest && t.closest('.row-menu, [data-act="menu"], [data-act="group-menu"]'))) current.closeMenus();
});

export function mountAssemblySidebar(el, asm, {
  onChanged, onAddFiles, targetSelect, onHighlight = () => {}, highlighted = () => false
}) {
  let openMenu = null;
  const closeMenus = () => { if (openMenu) { openMenu.classList.add('hidden'); openMenu = null; } };
  const toggleMenu = menu => {
    const wasOpen = openMenu === menu;
    closeMenus();
    if (!wasOpen) { menu.classList.remove('hidden'); openMenu = menu; }
  };
  const dots = new Map();          // Teil-id → Farbfeld, für das Nachfärben ohne Neuzeichnen

  function render() {
    el.innerHTML = '';
    openMenu = null;
    dots.clear();
    const refreshers = [];
    const refreshAll = () => { for (const f of refreshers) f(); };

    for (const g of asm.groups) {
      const mine = asm.items.filter(i => i.group === g.key);
      const allHl = mine.length > 0 && mine.every(i => highlighted(i.id));

      const head = document.createElement('div');
      head.className = 'group-head' + (allHl ? ' hl' : '');
      head.setAttribute('data-group', g.key);
      const bulb = button('bulb-btn', BULB, g.title + ' ein- oder ausblenden');
      bulb.setAttribute('aria-pressed', 'true');
      const title = document.createElement('h3');
      title.className = 'group-title';
      title.textContent = g.title;
      title.title = 'Tippen: ' + g.title + ' hervorheben';
      title.setAttribute('data-act', 'hl-group');
      const tag = span('side-tag', SIDE_LABEL[g.side]
        + (g.slide ? ' · Schieber ' + (g.slide.sign > 0 ? '+' : '−') + g.slide.axis.toUpperCase() : ''));
      const more = button('row-btn more', '&#8943;', 'Umbenennen, STL laden, Farbe, entfernen', 'group-menu');
      head.append(bulb, title, tag, more);

      /* Das Menü der Gruppe — zu, bis „⋯" es öffnet. */
      const menu = document.createElement('div');
      menu.className = 'row-menu hidden';
      const rename = button('menu-btn', '&#9998; Umbenennen', 'Gruppe umbenennen', 'rename-group');
      const add = button('menu-btn', '+ STL laden', 'STL-Dateien in diese Gruppe laden', 'add-stl');
      const colorWrap = document.createElement('label');
      colorWrap.className = 'menu-color';
      colorWrap.title = 'Eine Farbe für alle Teile der Gruppe';
      const colorIn = document.createElement('input');
      colorIn.setAttribute('type', 'color');
      colorIn.setAttribute('data-act', 'group-color');
      colorIn.value = g.color || '#8d9aa1';
      colorWrap.append(colorIn, span('', 'Farbe für alle'));
      const del = button('menu-btn danger', '&times; Gruppe entfernen',
        mine.length ? 'Nur eine leere Gruppe lässt sich entfernen' : 'Gruppe entfernen', 'remove-group');
      del.disabled = mine.length > 0;
      menu.append(rename, add, colorWrap, del);
      head.appendChild(menu);
      el.appendChild(head);

      const boxes = mine.map(it => addRow(it, refreshAll));
      if (!mine.length) {
        const empty = document.createElement('div');
        empty.className = 'comp-empty';
        empty.textContent = 'keine Teile — über ⋯ laden oder ein Teil hierher verschieben';
        el.appendChild(empty);
      }

      const refresh = () => {
        const on = !boxes.length || boxes.some(b => b.checked);
        bulb.classList.toggle('on', on);
        bulb.setAttribute('aria-pressed', on ? 'true' : 'false');
      };
      refreshers.push(refresh);
      bulb.addEventListener('click', () => {
        const show = !boxes.some(b => b.checked);
        for (const b of boxes) { b.checked = show; asm.setVisible(b.getAttribute('data-comp'), show); }
        refreshAll();
        onChanged({ visibility: true });
      });
      title.addEventListener('click', () => { if (mine.length) onHighlight(mine.map(i => i.id)); });
      more.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu); });
      rename.addEventListener('click', () => { closeMenus(); editInline(title, g.title, v => { if (asm.renameGroup(g.key, v)) render(); }); });
      add.addEventListener('click', () => { closeMenus(); onAddFiles(g.key); });
      colorIn.addEventListener('input', () => {
        if (!asm.setGroupColor(g.key, colorIn.value)) return;
        for (const it of mine) paintDot(it);
        onChanged({ color: true });
      });
      colorIn.addEventListener('change', () => render());
      del.addEventListener('click', () => { if (asm.removeGroup(g.key)) { render(); onChanged({ visibility: true }); } });
    }
    refreshAll();
    syncTargets();
  }

  function paintDot(it) {
    const dot = dots.get(it.id);
    if (dot) dot.style.background = it.color;
  }

  function addRow(it, refreshAll) {
    const row = document.createElement('div');
    row.className = 'comp-row' + (highlighted(it.id) ? ' hl' : '');
    row.setAttribute('data-item', it.id);
    const cb = document.createElement('input');
    cb.setAttribute('type', 'checkbox');
    cb.setAttribute('data-comp', it.id);
    cb.title = it.label + ' ein- oder ausblenden';
    cb.checked = it.object.visible !== false;

    /* Das Farbfeld IST der Farbwähler: das echte Eingabefeld liegt
       unsichtbar darüber, so öffnet ein Tipp den Wähler des Systems. */
    const swatch = document.createElement('label');
    swatch.className = 'swatch';
    swatch.title = 'Farbe ändern';
    const colorIn = document.createElement('input');
    colorIn.setAttribute('type', 'color');
    colorIn.setAttribute('data-act', 'color');
    colorIn.value = it.color;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = it.color;
    swatch.append(colorIn, dot);
    dots.set(it.id, dot);

    const name = span('name', it.label);
    name.title = 'Tippen: hervorheben · ' + it.id;
    name.setAttribute('data-act', 'hl');
    const more = button('row-btn more', '&#8943;', 'Umbenennen, verschieben, entfernen', 'menu');
    row.append(cb, swatch, name, more);

    const menu = document.createElement('div');
    menu.className = 'row-menu hidden';
    const ren = button('menu-btn', '&#9998; Umbenennen', 'Teil umbenennen', 'rename');
    const moveWrap = document.createElement('label');
    moveWrap.className = 'menu-move';
    const move = document.createElement('select');
    move.className = 'row-move';
    move.title = 'In eine andere Gruppe verschieben';
    move.setAttribute('data-act', 'move');
    move.innerHTML = asm.groups.map(g => '<option value="' + g.key + '"' + (g.key === it.group ? ' selected' : '') + '>' + g.title + '</option>').join('');
    move.value = it.group;
    moveWrap.append(span('', 'Verschieben nach'), move);
    const del = button('menu-btn danger', '&times; Entfernen', 'Teil entfernen', 'remove');
    menu.append(ren, moveWrap, del);
    row.appendChild(menu);
    el.appendChild(row);

    cb.addEventListener('change', () => { asm.setVisible(it.id, cb.checked); refreshAll(); onChanged({ visibility: true }); });
    colorIn.addEventListener('input', () => { if (asm.setColor(it.id, colorIn.value)) { paintDot(it); onChanged({ color: true }); } });
    colorIn.addEventListener('change', () => render());
    name.addEventListener('click', () => onHighlight([it.id]));
    more.addEventListener('click', e => { e.stopPropagation(); toggleMenu(menu); });
    move.addEventListener('change', () => { if (asm.moveItem(it.id, move.value)) { render(); onChanged(); } });
    ren.addEventListener('click', () => { closeMenus(); editInline(name, it.label, v => { if (asm.renameItem(it.id, v)) render(); }); });
    del.addEventListener('click', () => { if (asm.removeItem(it.id)) { render(); onChanged(); } });
    return cb;
  }

  /* Die Zielauswahl „STL laden in" folgt den Gruppen. */
  function syncTargets() {
    if (!targetSelect) return;
    const keep = targetSelect.value;
    targetSelect.innerHTML = asm.groups.map(g => '<option value="' + g.key + '">' + g.title + '</option>').join('');
    targetSelect.value = asm.groups.some(g => g.key === keep) ? keep : asm.groups[0].key;
  }

  const api = { render, closeMenus };
  current = api;
  render();
  return api;
}
