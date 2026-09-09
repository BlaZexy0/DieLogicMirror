/* Regler und Schalter der Darstellung des Formaufbau-Viewers (ohne die
   Ansichtsleiste — die sitzt im Viewport, js/ui/viewbar.js). Die
   Baugruppenliste mit ihren Glühbirnen zeichnet js/ui/assembly-sidebar.js. */

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
