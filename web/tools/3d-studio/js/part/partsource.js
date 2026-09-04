/* Bauteilquelle — der Abschnitt „Bauteil" beider Bauteil-Werkzeuge:
   Beispielteil wählen, eigene STL laden (Knopf oder Ziehen-und-Ablegen),
   Netz aufbereiten und die Kennzahlen anzeigen.

   Alle Bauteil-Seiten brauchen exakt dasselbe, deshalb steht es hier
   einmal. Erwartet werden die ids demo-select, stl-btn, stl-input,
   part-note, model-facts, model-warn — mit `suffix` auch mehrfach auf
   einer Seite (die Abstandsanalyse hat zwei Quellen: „-a" und „-b").

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

export function mountPartSource({ busy, viewport, onStart, onLoad, suffix = '',
                                  filter = p => !p.pairOnly, start: startId = null }) {
  const id = name => name + suffix;
  const list = DEMO_PARTS.filter(filter);
  const sel = $(id('demo-select'));
  sel.innerHTML = list.map(p => '<option value="' + p.id + '">' + p.label + '</option>').join('');
  sel.addEventListener('change', () => pickDemo(sel.value));

  $(id('stl-btn')).addEventListener('click', () => $(id('stl-input')).click());
  $(id('stl-input')).addEventListener('change', e => { if (e.target.files[0]) readFile(e.target.files[0]); });

  if (viewport) {
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
  }

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
        $(id('model-warn')).textContent = (glb ? 'GLB' : 'STL')
          + ' konnte nicht gelesen werden: ' + err.message;
      }
    };
    /* Ohne onerror blieb ein gescheiterter Lesevorgang (Datei entfernt,
       Rechte, Lesefehler) völlig stumm — die Busy-Anzeige lief weiter und
       nichts sagte, warum nichts passiert. */
    fr.onerror = () => {
      busy.classList.remove('on');
      $(id('model-warn')).textContent = 'Die Datei „' + file.name + '" konnte nicht gelesen werden'
        + (fr.error && fr.error.name ? ' (' + fr.error.name + ')' : '') + '.';
    };
    fr.onabort = fr.onerror;
    fr.readAsArrayBuffer(file);
  }

  async function load(tris, name, note) {
    if (!tris || tris.length < 36) {
      $(id('model-warn')).textContent = 'Das Netz enthält weniger als vier Dreiecke.';
      return;
    }
    if (onStart) onStart(name);
    /* Nicht jede Seite will die Beschreibung des Beispielteils sehen. */
    const pn = $(id('part-note'));
    if (pn) pn.textContent = note || '';
    /* Die Größenwarnung stand bisher in showFacts — also NACH buildModel,
       das bei 197k Dreiecken rund 1,5 s den Hauptthread blockiert. Sie kam
       damit an, wenn die Arbeit längst getan war. Jetzt vorher, aus der
       Rohzahl der Dreiecke. */
    const raw = tris.length / 9;
    $(id('model-warn')).textContent = raw > BIG_MESH
      ? 'Großes Netz (' + fmt(raw, 0) + ' Dreiecke) — Aufbereitung und jede Rechnung dauern entsprechend.'
      : '';
    busy.textContent = raw > BIG_MESH
      ? 'Netz aufbereiten (' + fmt(raw, 0) + ' Dreiecke) …'
      : 'Netz aufbereiten …';
    busy.classList.add('on');
    await frame();
    try {
      const model = buildModel(tris);
      showFacts(model, id);
      await onLoad(model, name);
    } catch (err) {
      $(id('model-warn')).textContent = 'Das Netz konnte nicht aufbereitet werden: ' + err.message;
      console.error(err);
    } finally {
      busy.classList.remove('on');
    }
  }

  /* partId, nicht id: der Parameter verdeckte sonst den Suffix-Helfer
     `const id = name => name + suffix` — und $('model-warn') traf auf
     abstand.html ins Leere (dort heißen die Felder model-warn-a/-b). Ein
     fehlgeschlagenes Beispielteil warf dann einen TypeError, statt die
     Meldung zu zeigen: die Seite blieb tot. */
  async function pickDemo(partId) {
    busy.textContent = 'Beispielteil laden …';
    busy.classList.add('on');
    try {
      const p = await loadDemo(partId);
      await load(p.tris, p.label, p.note);
    } catch (err) {
      busy.classList.remove('on');
      $(id('model-warn')).textContent = 'Beispielteil „' + partId + '" konnte nicht geladen werden: ' + err.message;
      console.error(err);
    }
  }

  /* Beispielteil aus der Adresszeile (?part=…) oder das vorgegebene. */
  function start() {
    const wanted = new URLSearchParams(location.search).get('part' + suffix);
    const first = list.find(p => p.id === wanted) || list.find(p => p.id === startId) || list[0];
    sel.value = first.id;
    return pickDemo(first.id);
  }

  return { load, pickDemo, start };
}

/* Ab hier gilt ein Netz als groß: Aufbereitung und Rechnungen sind dann
   spürbar, und der Anwender soll das VOR der Wartezeit erfahren. */
const BIG_MESH = 150000;

function showFacts(m, id) {
  const s = m.bounds.size;
  facts(id('model-facts'), [
    ['Dreiecke', fmt(m.faceCount, 0)
      + (m.faceCount !== m.rawFaceCount ? ' (roh ' + fmt(m.rawFaceCount, 0) + ')' : '')],
    ['Abmessungen', s.map(v => fmt(v)).join(' × ') + ' mm'],
    ['Volumen', fmt(m.volume / 1000) + ' cm³'],
    ['Oberfläche', fmt(m.surface / 100) + ' cm²']
  ]);

  /* Alle Hinweise sammeln statt beim ersten aufzuhören: die Größenwarnung
     stand vorher mit return vor der Mannigfaltigkeitsprüfung — bei einem
     großen UND offenen Netz erfuhr man nur das Erste. */
  const notes = [];
  if (m.faceCount > BIG_MESH) {
    notes.push('Großes Netz (' + fmt(m.faceCount, 0) + ' Dreiecke) — jede Rechnung dauert entsprechend.');
  }
  if (m.flippedFaces) {
    notes.push(fmt(m.flippedFaces, 0) + ' Dreiecke waren gegenläufig gewickelt und wurden ausgerichtet.');
  }
  const openFrac = openEdgeRatio(m);
  if (openFrac > 0.005) {
    notes.push('Achtung: ' + (100 * openFrac).toFixed(1)
      + ' % der Kanten haben keinen Nachbarn — das Netz ist offen oder nicht mannigfaltig.');
  }
  if (m.volume <= 0 && openFrac <= 0.005) {
    notes.push('Das Volumen ist nicht positiv — die Dreiecke zeigen nach innen oder das Netz überlappt sich.');
  }
  $(id('model-warn')).textContent = notes.join(' ');
}
