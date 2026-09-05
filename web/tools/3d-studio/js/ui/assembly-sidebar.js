/* Seitenleiste des Formaufbau-Viewers: die Gruppen und Teile einer
   bearbeitbaren Baugruppe (js/assembly.js).

   Je Gruppe ein Kopf mit Glühbirne (leuchtet, solange etwas sichtbar
   ist; ein Klick schaltet die Gruppe um), Namen zum Umbenennen (✎),
   „+" zum Laden von STL-Dateien in diese Gruppe und × zum Entfernen
   (nur leer). Je Teil ein Schalter, die Farbe, der Name (✎), eine
   Auswahl der Gruppe zum Verschieben und ×. Die Leiste wird nach jeder
   Änderung ganz neu gezeichnet — sie ist klein, das ist billiger als
   jede Zeile einzeln nachzuziehen. */

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
  if (input.focus) input.focus();
  if (input.select) input.select();
}

export function mountAssemblySidebar(el, asm, { onChanged, onAddFiles, targetSelect }) {
  function render() {
    el.innerHTML = '';
    const refreshers = [];
    const refreshAll = () => { for (const f of refreshers) f(); };

    for (const g of asm.groups) {
      const mine = asm.items.filter(i => i.group === g.key);

      const head = document.createElement('div');
      head.className = 'group-head';
      head.setAttribute('data-group', g.key);
      const title = document.createElement('h3');
      title.textContent = g.title;
      head.appendChild(title);
      const tag = document.createElement('span');
      tag.className = 'side-tag';
      tag.textContent = SIDE_LABEL[g.side] + (g.slide ? ' · Schieber ' + (g.slide.sign > 0 ? '+' : '−') + g.slide.axis.toUpperCase() : '');
      head.appendChild(tag);
      const tools = document.createElement('div');
      tools.className = 'head-tools';
      const bulb = button('bulb-btn', BULB, g.title + ' ein- oder ausblenden');
      bulb.setAttribute('aria-pressed', 'true');
      const rename = button('row-btn', '&#9998;', 'Gruppe umbenennen', 'rename-group');
      const add = button('row-btn', '+', 'STL-Dateien in diese Gruppe laden', 'add-stl');
      const del = button('row-btn danger', '&times;',
        mine.length ? 'Nur eine leere Gruppe lässt sich entfernen' : 'Gruppe entfernen', 'remove-group');
      del.disabled = mine.length > 0;
      tools.append(bulb, rename, add, del);
      head.appendChild(tools);
      el.appendChild(head);

      const boxes = mine.map(it => addRow(it, refreshAll));
      if (!mine.length) {
        const empty = document.createElement('div');
        empty.className = 'comp-empty';
        empty.textContent = 'keine Teile — mit + laden oder ein Teil hierher verschieben';
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
      rename.addEventListener('click', () => editInline(title, g.title, v => { if (asm.renameGroup(g.key, v)) render(); }));
      add.addEventListener('click', () => onAddFiles(g.key));
      del.addEventListener('click', () => { if (asm.removeGroup(g.key)) { render(); onChanged({ visibility: true }); } });
    }
    refreshAll();
    syncTargets();
  }

  function addRow(it, refreshAll) {
    const row = document.createElement('div');
    row.className = 'comp-row';
    row.setAttribute('data-item', it.id);
    const cb = document.createElement('input');
    cb.setAttribute('type', 'checkbox');
    cb.setAttribute('data-comp', it.id);
    cb.checked = it.object.visible !== false;
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = it.color;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = it.label;
    name.title = it.id;
    const move = document.createElement('select');
    move.className = 'row-move';
    move.title = 'In eine andere Gruppe verschieben';
    move.setAttribute('data-act', 'move');
    move.innerHTML = asm.groups.map(g => '<option value="' + g.key + '"' + (g.key === it.group ? ' selected' : '') + '>' + g.title + '</option>').join('');
    move.value = it.group;
    const ren = button('row-btn', '&#9998;', 'Teil umbenennen', 'rename');
    const del = button('row-btn danger', '&times;', 'Teil entfernen', 'remove');
    row.append(cb, dot, name, move, ren, del);
    el.appendChild(row);

    cb.addEventListener('change', () => { asm.setVisible(it.id, cb.checked); refreshAll(); onChanged({ visibility: true }); });
    move.addEventListener('change', () => { if (asm.moveItem(it.id, move.value)) { render(); onChanged(); } });
    ren.addEventListener('click', () => editInline(name, it.label, v => { if (asm.renameItem(it.id, v)) render(); }));
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

  render();
  return { render };
}
