/* Das Bauteil gehört dem Rahmen, nicht dem Werkzeug.

   EIN Netz mit zwei Materialien — grau für alle, die auf die Wand
   klicken, mit Punktfarben für Analyse und Füllung — und das Laden
   (Beispielteil, Datei) über js/part/partsource.js, dessen Felder in der
   Bauteil-Klappe der Kopfzeile stehen. Werkzeuge hängen ihre eigenen
   Körper daneben und sagen dem Bauteil nur, wie es gerade aussehen soll
   (setLook). */

import * as T from 'three';
import { mountPartSource } from '../part/partsource.js';
import { suggestCell } from '../part/field.js';
import { ROLE, onScheme } from '../part/colors.js';
import { surfaceMaterial } from '../ui/common.js';

export function createPart({ shell, onStart, onLoad, onFail = null, onFile = null, start = null, fit = true }) {
  let loading = null;     // ein Laden läuft: { name } des Teils davor
  const { view } = shell;
  /* Das Bauteil im Grau seiner Rolle (part): es trägt die Farben der
     Analysen, selbst ist es neutral — und folgt dem Farbschema. */
  const plainMat = surfaceMaterial(ROLE.part, { roughness: 0.7, metalness: 0.05 });
  onScheme(() => { plainMat.color.set(ROLE.part); view.invalidate(); });
  const colorMat = surfaceMaterial(0xffffff, { vertexColors: true, roughness: 0.62, metalness: 0.08 });
  const mesh = new T.Mesh(new T.BufferGeometry(), plainMat);
  mesh.visible = false;
  mesh.name = 'part';
  view.scene.add(mesh);

  const part = {
    model: null, name: '', warning: '', demoId: null, mesh, plainMat, colorMat,
    opacity: 1,
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
    fields: shell.header.partFields, setBusy: shell.loading, onFile, start,
    /* Die Meldung steht auch in der Klappe — gesehen wird sie im Toast. Ist
       ein Laden schon angelaufen und scheitert dann, gilt wieder das Teil, das
       noch da ist: der Name stünde sonst auf dem gescheiterten. */
    onError: text => {
      shell.toast(text, { ms: 8000 });
      if (loading) { part.name = loading.name; loading = null; if (onFail) onFail(); }
    },
    onStart: name => { loading = { name: part.name }; part.name = name; if (onStart) onStart(name); },
    onLoad: async (model, name, info) => {
      loading = null;
      part.model = model;
      part.name = name;
      part.demoId = info.demoId;
      /* Was partsource.js zum Netz meldet (offen, gegenläufig, riesig), steht
         in der Klappe — das Bauteil trägt es weiter: ein ⚠ am Chip. */
      part.warning = info.warning;
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(Float32Array.from(model.tris), 3));
      /* Das Farb-Attribut ist der Malgrund der Analysen: sie bemalen jede
         Ecke, bevor sie auf das Material mit Punktfarben schalten. */
      geo.setAttribute('color', new T.BufferAttribute(new Float32Array(model.tris.length), 3));
      geo.computeVertexNormals();
      mesh.geometry.dispose();
      mesh.geometry = geo;
      mesh.visible = true;
      mesh.material = plainMat;
      shell.header.setPart(name, null, part.warning);
      if (fit) shell.fit(mesh);
      if (onLoad) await onLoad(model, name);
    }
  });

  /** Ein Netz aus einer Datei (geöffnet oder abgelegt): das Beispielteil der
      Liste gilt erst als abgewählt, wenn es geladen ist. */
  part.load = (tris, name, note) => source.loadFile(tris, name, note);
  part.pickDemo = id => source.pickDemo(id);
  part.start = () => source.start();
  /** Keines gewählt zeigen (der Angussdesigner beginnt ohne Bauteil). */
  part.deselect = () => source.deselect();
  part.warn = text => source.warn(text);
  return part;
}
