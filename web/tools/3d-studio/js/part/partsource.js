/* Bauteilquelle — der Abschnitt „Bauteil" beider Bauteil-Werkzeuge:
   Beispielteil wählen, eigene STL laden (Knopf oder Ziehen-und-Ablegen),
   Netz aufbereiten und die Kennzahlen anzeigen.

   Beide Seiten (Bauteilanalyse und Offsetflächen) brauchen exakt
   dasselbe, deshalb steht es hier einmal. Erwartet werden die ids
   demo-select, stl-btn, stl-input, part-note, model-facts, model-warn.

   Beispielteile kommen als fertige GLB aus assets/parts/ — genauso wie
   eine hochgeladene Datei. Erkannt wird am Dateikopf, nicht an der
   Endung: eine GLB liest js/part/glbio.js, alles andere js/part/stlio.js. */

import { buildModel, openEdgeRatio } from './model.js';
import { DEMO_PARTS, loadDemo } from './demoparts.js';
import { parseSTL } from './stlio.js';
import { readGLB, isGLB } from './glbio.js';
import { $, fmt, facts } from '../ui/controls.js';

/* Auf ein vollständig gezeichnetes Bild warten — sonst steht der
   Fortschrittstext erst da, wenn die Rechnung schon vorbei ist. */
export const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

export function mountPartSource({ busy, viewport, onStart, onLoad }) {
  const sel = $('demo-select');
  sel.innerHTML = DEMO_PARTS.map(p => '<option value="' + p.id + '">' + p.label + '</option>').join('');
  sel.addEventListener('change', () => pickDemo(sel.value));

  $('stl-btn').addEventListener('click', () => $('stl-input').click());
  $('stl-input').addEventListener('change', e => { if (e.target.files[0]) readFile(e.target.files[0]); });

  for (const ev of ['dragenter', 'dragover']) {
    viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.add('dragover'); });
  }
  for (const ev of ['dragleave', 'drop']) {
    viewport.addEventListener(ev, e => { e.preventDefault(); viewport.classList.remove('dragover'); });
  }
  viewport.addEventListener('drop', e => {
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f) readFile(f);
  });

  function readFile(file) {
    const fr = new FileReader();
    fr.onload = () => {
      const glb = isGLB(fr.result);
      try {
        const tris = glb ? readGLB(fr.result) : parseSTL(fr.result);
        sel.selectedIndex = -1;
        load(tris, file.name,
          (glb ? 'GLB-Datei · ' : 'STL-Datei · ') + (fr.result.byteLength / 1024).toFixed(0) + ' kB');
      } catch (err) {
        busy.classList.remove('on');
        $('model-warn').textContent = (glb ? 'GLB' : 'STL')
          + ' konnte nicht gelesen werden: ' + err.message;
      }
    };
    fr.readAsArrayBuffer(file);
  }

  async function load(tris, name, note) {
    if (!tris || tris.length < 36) {
      $('model-warn').textContent = 'Das Netz enthält weniger als vier Dreiecke.';
      return;
    }
    if (onStart) onStart(name);
    $('part-note').textContent = note || '';
    $('model-warn').textContent = '';
    busy.textContent = 'Netz aufbereiten …';
    busy.classList.add('on');
    await frame();
    try {
      const model = buildModel(tris);
      showFacts(model);
      await onLoad(model, name);
    } catch (err) {
      $('model-warn').textContent = 'Das Netz konnte nicht aufbereitet werden: ' + err.message;
      console.error(err);
    } finally {
      busy.classList.remove('on');
    }
  }

  async function pickDemo(id) {
    busy.textContent = 'Beispielteil laden …';
    busy.classList.add('on');
    try {
      const p = await loadDemo(id);
      await load(p.tris, p.label, p.note);
    } catch (err) {
      busy.classList.remove('on');
      $('model-warn').textContent = err.message;
      console.error(err);
    }
  }

  /* Beispielteil aus der Adresszeile (?part=…) oder das erste. */
  function start() {
    const wanted = new URLSearchParams(location.search).get('part');
    const first = DEMO_PARTS.find(p => p.id === wanted) || DEMO_PARTS[0];
    sel.value = first.id;
    return pickDemo(first.id);
  }

  return { load, pickDemo, start };
}

function showFacts(m) {
  const s = m.bounds.size;
  facts('model-facts', [
    ['Dreiecke', fmt(m.faceCount, 0)
      + (m.faceCount !== m.rawFaceCount ? ' (roh ' + fmt(m.rawFaceCount, 0) + ')' : '')],
    ['Abmessungen', s.map(v => fmt(v)).join(' × ') + ' mm'],
    ['Volumen', fmt(Math.abs(m.volume) / 1000) + ' cm³'],
    ['Oberfläche', fmt(m.surface / 100) + ' cm²']
  ]);

  if (m.faceCount > 250000) {
    $('model-warn').textContent = 'Sehr großes Netz (' + fmt(m.faceCount, 0)
      + ' Dreiecke) — jede Rechnung dauert entsprechend.';
    return;
  }
  const openFrac = openEdgeRatio(m);
  $('model-warn').textContent = openFrac > 0.005
    ? 'Achtung: ' + (100 * openFrac).toFixed(1) + ' % der Kanten haben keinen Nachbarn — das Netz ist offen oder nicht mannigfaltig.'
    : '';
}
