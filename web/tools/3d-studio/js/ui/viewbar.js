/* Ansichtsleiste über dem Viewport — in allen Viewern dieselbe.

   X · Y · Z · Iso schwenken die Kamera auf die Achse. Ein ZWEITER Klick
   auf denselben Knopf dreht die Blickrichtung um; die Beschriftung
   wechselt dann auf −X, −Y, −Z bzw. Iso'. Rechts daneben steht die
   Projektion: Zentralprojektion (perspektivisch) oder 2D-Parallel-
   projektion (orthografisch, maßstäblich — für Risse und zum Abmessen).

   Der gemeinsame Rahmen (js/studio/) gibt zwei Dinge dazu: „Einpassen"
   (opts.fit) und ein Aufklappfeld „Darstellung" für die Anzeigeoptionen
   des Werkzeugs (opts.popover: true) — beides fehlt auf den Seiten ohne
   den Rahmen (Formaufbau, Werkbank), die die Leiste ohne opts aufrufen. */

const VIEW_BUTTONS = [
  { key: 'x', label: 'X', title: 'Blick entlang der X-Achse (nochmal klicken: −X)' },
  { key: 'y', label: 'Y', title: 'Draufsicht (nochmal klicken: Untersicht −Y)' },
  { key: 'z', label: 'Z', title: 'Blick entlang der Maschinenachse (nochmal klicken: −Z)' },
  { key: 'iso', label: 'Iso', title: 'Schrägbild (nochmal klicken: Gegenecke)' }
];

export function mountViewBar(container, view, opts = {}) {
  const bar = document.createElement('div');
  bar.className = 'view-bar';
  bar.setAttribute('data-dock', 'viewbar');
  bar.innerHTML =
    VIEW_BUTTONS.map(b => '<button type="button" data-view="' + b.key + '" title="' + b.title + '">' + b.label + '</button>').join('')
    + (opts.fit ? '<button type="button" data-fit title="Einpassen: alles ins Bild (F, Doppelklick)">Einpassen</button>' : '')
    + '<div class="sep"></div>'
    + '<button type="button" data-proj="persp" class="active" title="Zentralprojektion (perspektivisch)">Persp</button>'
    + '<button type="button" data-proj="ortho" title="2D-Parallelprojektion (orthografisch, maßstäblich)">Parallel</button>'
    + (opts.popover ? '<div class="sep" data-darstellung-sep></div><button type="button" data-darstellung aria-haspopup="true" aria-expanded="false" title="Anzeigeoptionen">Darstellung ▾</button>' : '');
  container.appendChild(bar);

  const viewBtns = [...bar.querySelectorAll('[data-view]')];
  const label = (b, sign) => {
    const base = VIEW_BUTTONS.find(v => v.key === b.dataset.view).label;
    b.textContent = sign < 0 ? (base === 'Iso' ? "Iso'" : '−' + base) : base;
  };
  for (const b of viewBtns) {
    b.addEventListener('click', () => {
      const state = view.setView(b.dataset.view);
      for (const other of viewBtns) {
        other.classList.toggle('active', other === b);
        if (other !== b) label(other, 1);
      }
      label(b, state.sign);
    });
  }

  const projBtns = [...bar.querySelectorAll('[data-proj]')];
  for (const b of projBtns) {
    b.addEventListener('click', () => {
      view.setProjection(b.dataset.proj);
      for (const other of projBtns) other.classList.toggle('active', other === b);
    });
  }

  const fitBtn = bar.querySelector('[data-fit]');
  if (fitBtn) fitBtn.addEventListener('click', () => opts.fit());

  /* Das Aufklappfeld „Darstellung": ein Kasten unter der Leiste, den das
     Werkzeug mit seinen Zeilen füllt (bar.pop), und sein Knopf
     (bar.popChip). Öffnen und Schließen verwaltet der Rahmen wie seine
     übrigen Klappen (studio/shell.js, popover): höchstens eine offen, ein
     Klick daneben und Esc schließen sie. Vorher hatte der Kasten eigene
     Zuhörer; Esc schloss ihn und hob danach noch die Auswahl auf, und neben
     ihm konnte die Bauteil-Klappe offen stehen. */
  bar.pop = null;
  const toggleBtn = bar.querySelector('[data-darstellung]');
  if (toggleBtn) {
    const popover = document.createElement('div');
    popover.className = 'view-pop';
    popover.setAttribute('data-ui', 'darstellung');
    popover.setAttribute('data-dock', 'darstellung');
    popover.hidden = true;
    container.appendChild(popover);
    bar.pop = popover;
    bar.popChip = toggleBtn;
  }
  return bar;
}
