/* Ansichtsleiste über dem Viewport — in beiden Viewern dieselbe.

   X · Y · Z · Iso schwenken die Kamera auf die Achse. Ein ZWEITER Klick
   auf denselben Knopf dreht die Blickrichtung um; die Beschriftung
   wechselt dann auf −X, −Y, −Z bzw. Iso'. Rechts daneben steht die
   Projektion: Zentralprojektion (perspektivisch) oder 2D-Parallel-
   projektion (orthografisch, maßstäblich — für Risse und zum Abmessen). */

const VIEW_BUTTONS = [
  { key: 'x', label: 'X', title: 'Blick entlang der X-Achse (nochmal klicken: −X)' },
  { key: 'y', label: 'Y', title: 'Draufsicht (nochmal klicken: Untersicht −Y)' },
  { key: 'z', label: 'Z', title: 'Blick entlang der Maschinenachse (nochmal klicken: −Z)' },
  { key: 'iso', label: 'Iso', title: 'Schrägbild (nochmal klicken: Gegenecke)' }
];

export function mountViewBar(container, view) {
  const bar = document.createElement('div');
  bar.className = 'view-bar';
  bar.innerHTML =
    VIEW_BUTTONS.map(b => '<button type="button" data-view="' + b.key + '" title="' + b.title + '">' + b.label + '</button>').join('')
    + '<div class="sep"></div>'
    + '<button type="button" data-proj="persp" class="active" title="Zentralprojektion (perspektivisch)">Persp</button>'
    + '<button type="button" data-proj="ortho" title="2D-Parallelprojektion (orthografisch, maßstäblich)">Parallel</button>';
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
  return bar;
}
