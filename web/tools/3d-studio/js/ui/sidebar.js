/* Regler und Schalter der Darstellung des Formaufbau-Viewers (ohne die
   Ansichtsleiste — die sitzt im Viewport, js/ui/viewbar.js). Die
   Baugruppenliste mit ihren Glühbirnen zeichnet js/ui/assembly-sidebar.js.

   Der Anfangszustand kommt aus den Feldern selbst, nicht aus Konstanten:
   ein Browser, der beim Neuladen die letzten Werte wieder einsetzt,
   zeigte sonst „Schnittebene zeigen" angehakt, und geschnitten war nichts.
   form.html schaltet das Wiedereinsetzen zusätzlich ab (autocomplete). */

import { fmtUnit } from '../studio/format.js';

export function wireViewControls({ onOpacity, onOpen, onClip }) {
  const $ = id => document.getElementById(id);

  const opacity = $('opacity');
  const showOpacity = () => { $('opacity-val').textContent = fmtUnit(Number(opacity.value), '%'); };
  opacity.addEventListener('input', () => { onOpacity(opacity.value / 100); showOpacity(); });
  showOpacity();

  const open = $('open');
  const showOpen = () => { $('open-val').textContent = fmtUnit(Number(open.value), '%'); };
  open.addEventListener('input', () => { onOpen(open.value / 100); showOpen(); });
  showOpen();
  if (Number(open.value)) onOpen(open.value / 100);

  const axisBtn = document.querySelector('[data-axis].active');
  const clipState = {
    on: !!$('clip-on').checked, axis: axisBtn ? axisBtn.dataset.axis : 'x',
    pos: Number($('clip-pos').value) / 100 || 0, flip: !!$('clip-flip').checked
  };
  const push = () => {
    $('clip-detail').classList.toggle('disabled', !clipState.on);
    $('clip-pos-val').textContent = fmtUnit(clipState.pos * 100, '%');
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
