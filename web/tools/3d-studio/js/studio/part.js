/* Das Bauteil gehört dem Rahmen, nicht dem Werkzeug.

   EIN Netz mit zwei Materialien — grau für alle, die auf die Wand
   klicken, mit Punktfarben für Analyse und Füllung — und das Laden
   (Beispielteil, Datei, Ablegen) über js/part/partsource.js, dessen
   Felder in der Bauteil-Klappe der Kopfzeile stehen. Werkzeuge hängen
   ihre eigenen Körper daneben und sagen dem Bauteil nur, wie es gerade
   aussehen soll (setLook). So laufen dieselben Werkzeuge allein auf
   ihrer Seite und zu sechst auf der Werkbank. */

import * as T from 'three';
import { mountPartSource } from '../part/partsource.js';
import { suggestCell } from '../part/field.js';
import { ROLE, hex2rgb, onScheme } from '../part/colors.js';

export function createPart({ shell, onStart, onLoad, onFail = null, start = null, fit = true }) {
  let loading = null;     // ein Laden läuft: { name } des Teils davor
  const { view } = shell;
  /* Das Bauteil im Grau seiner Rolle (part): es trägt die Farben der
     Analysen, selbst ist es neutral — und folgt dem Farbschema. */
  const plainMat = new T.MeshStandardMaterial({ color: ROLE.part, roughness: 0.7, metalness: 0.05, side: T.DoubleSide, flatShading: true });
  onScheme(() => { plainMat.color.set(ROLE.part); view.invalidate(); });
  const colorMat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.62, metalness: 0.08, side: T.DoubleSide, flatShading: true });
  const mesh = new T.Mesh(new T.BufferGeometry(), plainMat);
  mesh.visible = false;
  mesh.name = 'part';
  view.scene.add(mesh);

  const part = {
    model: null, name: '', note: '', warning: '', demoId: null, mesh, plainMat, colorMat,
    opacity: 1, ready: false,
    /** Schlüssel für Entwürfe: Beispiel-id oder Dateiname. */
    get key() { return part.demoId || part.name || ''; },
    get cellSuggestion() { return part.model ? suggestCell(part.model) : 3; },

    /** Wie das Bauteil aussieht: Deckkraft, sichtbar, mit Punktfarben. */
    setLook({ opacity, visible, colors } = {}) {
      if (visible !== undefined) mesh.visible = visible && !!part.model;
      if (colors !== undefined) mesh.material = colors ? colorMat : plainMat;
      const o = opacity !== undefined ? opacity : part.opacity;
      for (const m of [plainMat, colorMat]) {
        m.opacity = o;
        m.transparent = o < 0.999;
        m.depthWrite = o >= 0.999;
        m.needsUpdate = true;
      }
      view.invalidate();
    },
    /** Die Grund-Deckkraft (Regler „Deckkraft Bauteil"). */
    setOpacity(v) { part.opacity = v; part.setLook({}); },
    /** Das Farb-Attribut zum Bemalen (Analyse, Füllung). */
    colors() { return mesh.geometry.getAttribute('color'); },
    fit(margin) { if (part.model) shell.fit(mesh, margin); }
  };

  const source = mountPartSource({
    busy: shell.busyEl, viewport: null, start,
    /* Die Meldung steht auch in der Klappe — gesehen wird sie im Toast. Ist
       ein Laden schon angelaufen und scheitert dann, gilt wieder das Teil, das
       noch da ist: Name und „bereit" stünden sonst auf dem gescheiterten. */
    onError: text => {
      shell.toast(text, { ms: 8000 });
      if (loading) { part.name = loading.name; part.ready = !!part.model; loading = null; if (onFail) onFail(); }
    },
    onStart: name => { loading = { name: part.name }; part.ready = false; part.name = name; if (onStart) onStart(name); },
    onLoad: async (model, name) => {
      loading = null;
      part.model = model;
      part.name = name;
      const sel = document.getElementById('demo-select');
      part.demoId = sel && sel.selectedIndex >= 0 && sel.value ? sel.value : null;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
      /* Vor dem ersten Bemalen trägt jede Ecke das Grau des Bauteils. */
      const grey = hex2rgb(ROLE.part), cols = new Float32Array(model.tris.length);
      for (let i = 0; i < cols.length; i += 3) { cols[i] = grey[0]; cols[i + 1] = grey[1]; cols[i + 2] = grey[2]; }
      geo.setAttribute('color', new T.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      mesh.geometry.dispose();
      mesh.geometry = geo;
      mesh.visible = true;
      mesh.material = plainMat;
      const opt = part.demoId ? [...sel.options].find(o => o.value === part.demoId) : null;
      /* Was partsource.js zum Netz meldet (offen, gegenläufig, riesig), steht
         in der Klappe — das Bauteil trägt es weiter: ein ⚠ am Chip, die Zeile
         im Modus „Bauteil". */
      const warnEl = document.getElementById('model-warn'), noteEl = document.getElementById('part-note');
      part.warning = warnEl ? warnEl.textContent : '';
      part.note = noteEl ? noteEl.textContent : '';
      shell.header.setPart(opt ? opt.textContent : name, null, part.warning);
      if (fit) shell.fit(mesh);
      part.ready = true;
      if (onLoad) await onLoad(model, name);
    }
  });

  part.load = (tris, name, note) => source.load(tris, name, note);
  part.pickDemo = id => source.pickDemo(id);
  part.start = () => source.start();
  return part;
}
