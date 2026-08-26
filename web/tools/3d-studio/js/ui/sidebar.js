/* Seitenleiste des Formaufbau-Viewers: Baugruppen-Schalter, gruppiert
   nach Seite (Registry-GROUPS) und optional in Untergruppen (sub —
   z. B. die Temperierkreise je Hälfte).

   Statt „alle aus"/„alle ein" steht im Kopf jeder Gruppe eine
   GLÜHBIRNE: leuchtet sie, ist mindestens eine Baugruppe sichtbar; ein
   Klick schaltet die ganze Gruppe um. Der Zustand ist damit auf einen
   Blick lesbar, ohne dass die Beschriftung zwischen zwei Bedeutungen
   hin- und herspringt. Untergruppen haben eine eigene Glühbirne. */

const BULB = '<svg class="bulb" viewBox="0 0 24 24" aria-hidden="true">'
  + '<g class="rays"><path d="M12 1v1.8M4.4 4.4l1.3 1.3M19.6 4.4l-1.3 1.3M1.4 12h1.8M20.8 12h1.8"/></g>'
  + '<path class="glass" d="M12 4.1a5.4 5.4 0 0 0-3.2 9.75c.55.4.9 1 .98 1.65l.12.9h4.2l.12-.9c.08-.65.43-1.25.98-1.65A5.4 5.4 0 0 0 12 4.1Z"/>'
  + '<path class="socket" d="M9.9 18.1h4.2M10.6 20.4h2.8"/></svg>';

function makeHead(el, title, cls) {
  const head = document.createElement('div');
  head.className = cls;
  head.innerHTML = '<h3>' + title + '</h3>'
    + '<button type="button" class="bulb-btn" aria-pressed="true" title="'
    + title + ' ein- oder ausblenden">' + BULB + '</button>';
  el.appendChild(head);
  return head.querySelector('button');
}

function addRow(el, it, onToggle, onChanged) {
  const row = document.createElement('label');
  row.className = 'comp-row' + (it.sub ? ' sub' : '');
  row.innerHTML = '<input type="checkbox" checked data-comp="' + it.id + '">'
    + '<span class="dot" style="background:' + it.color + '"></span>'
    + '<span>' + it.label + '</span>';
  const cb = row.querySelector('input');
  cb.addEventListener('change', () => { onToggle(it.id, cb.checked); onChanged(); });
  el.appendChild(row);
  return cb;
}

function wireBulb(btn, boxes, onToggle, refreshAll) {
  const refresh = () => {
    const on = boxes.some(b => b.checked);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };
  btn.addEventListener('click', () => {
    const show = !boxes.some(b => b.checked);
    for (const b of boxes) { b.checked = show; onToggle(b.dataset.comp, show); }
    refreshAll();
  });
  return refresh;
}

export function buildComponentList(el, groups, items, onToggle) {
  const refreshers = [];
  const refreshAll = () => { for (const f of refreshers) f(); };

  for (const g of groups) {
    const mine = items.filter(i => i.side === g.key);
    if (!mine.length) continue;

    const all = [];
    const groupBtn = makeHead(el, g.title, 'group-head');

    for (const it of mine.filter(i => !i.sub)) all.push(addRow(el, it, onToggle, refreshAll));

    /* Untergruppen in der Reihenfolge ihres ersten Auftretens. */
    const subs = [];
    for (const it of mine) {
      if (!it.sub) continue;
      let s = subs.find(x => x.title === it.sub);
      if (!s) subs.push(s = { title: it.sub, items: [] });
      s.items.push(it);
    }
    for (const sub of subs) {
      const subBtn = makeHead(el, sub.title, 'group-head sub-head');
      const subBoxes = sub.items.map(it => addRow(el, it, onToggle, refreshAll));
      all.push(...subBoxes);
      refreshers.push(wireBulb(subBtn, subBoxes, onToggle, refreshAll));
    }
    refreshers.push(wireBulb(groupBtn, all, onToggle, refreshAll));
  }
  refreshAll();
}

/** Regler und Schalter der Darstellung (ohne die Ansichtsleiste — die
    sitzt im Viewport, js/ui/viewbar.js). */
export function wireViewControls({ onOpacity, onOpen, onClip }) {
  const $ = id => document.getElementById(id);

  const opacity = $('opacity');
  const showOpacity = () => { $('opacity-val').textContent = opacity.value + ' %'; };
  opacity.addEventListener('input', () => { onOpacity(opacity.value / 100); showOpacity(); });
  showOpacity();

  const open = $('open');
  const showOpen = () => { $('open-val').textContent = open.value + ' %'; };
  open.addEventListener('input', () => { onOpen(open.value / 100); showOpen(); });
  showOpen();

  const clipState = { on: false, axis: 'x', pos: 0, flip: false };
  const push = () => {
    $('clip-detail').classList.toggle('disabled', !clipState.on);
    $('clip-pos-val').textContent = (clipState.pos * 100).toFixed(0) + ' %';
    onClip(clipState);
  };
  $('clip-on').addEventListener('change', e => { clipState.on = e.target.checked; push(); });
  for (const b of document.querySelectorAll('[data-axis]')) {
    b.addEventListener('click', () => {
      clipState.axis = b.dataset.axis;
      document.querySelectorAll('[data-axis]').forEach(x => x.classList.toggle('active', x === b));
      push();
    });
  }
  $('clip-pos').addEventListener('input', e => { clipState.pos = e.target.value / 100; push(); });
  $('clip-flip').addEventListener('change', e => { clipState.flip = e.target.checked; push(); });
  push();
}
