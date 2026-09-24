/* Der Vorschlag — oben im Modus System des Schritts Anguss auf der Werkbank.

   js/werkbank/propose.js baut aus dem Bauteil die GESTALT eines
   Angusssystems (Pressrest vor der Kante bei −Y, Kanäle in der
   Trennebene, Achse −z). Hier kommt dazu, was einen Strahl braucht und
   darum nicht in das Modul ohne Three.js gehört: die Anschnitte werden an
   die Wand gebunden (dasselbe wie der Klick auf den Pfeil, nur ohne Maus),
   danach stuft autoTaper die Querschnitte, und der Angussdesigner
   (js/runner/tool.js) übernimmt den Graphen als sein System.

   Er steht, wo auf der Seite des Angussdesigners die Beispiele stehen
   (opts.propose): die Frage „welches System" beantwortet hier das Bauteil.
   Ein eigener Modus davor kostete eine zweite Reiterzeile und damit jeden
   Modus des Schritts 34 px. Ein neues Bauteil bekommt beim Laden einen
   Vorschlag (js/werkbank/app.js), der Hauptknopf von System jederzeit
   einen neuen — als Schritt im Verlauf, Strg+Z holt das alte System zurück. */

import * as T from 'three';
import * as G from '../runner/graph.js';
import { autoTaper } from '../runner/sizing.js';
import { proposeRunner, gateRays } from './propose.js';
import { selectRow, warnLine } from '../studio/rows.js';

const RUN = 'Anguss ans Bauteil legen';
const MISSED = 'Kein Anschnitt hat die Wand bei −Y getroffen: die Mündungen über den Pfeil von Hand ans Bauteil setzen.';

/** @param part  das Bauteil der Seite (host.part: model, mesh) */
export function createVorschlag({ part }) {
  let api = null;                        // der Angussdesigner (opts.propose)
  let gates = 2;

  /* Die Anschnitte des Vorschlags mit dem Strahl an die Wand binden: von
     jedem Anschnitt in +Y. An einer aufrechten Wand wird die Richtung in die
     Trennebene gelegt, wie js/handles.js es beim Klick tut; der Strahl lief
     einen Hauch neben der Trennebene, die Mündung gehört in die Arbeitsebene
     des Anschnitts — dorthin, wo der Klick auf den Pfeil sie auch hinlegt. */
  const ray = new T.Raycaster();
  const nmat = new T.Matrix3();
  function aimGatesAtPart(g) {
    const mesh = part.mesh, model = part.model;
    if (!model || !mesh.geometry.attributes.position) return 0;
    mesh.updateMatrixWorld(true);
    let bound = 0;
    for (const r of gateRays(g, model)) {
      ray.set(new T.Vector3(...r.origin), new T.Vector3(...r.dir));
      ray.far = 400;
      const h = ray.intersectObject(mesh, false).find(x => x.face);
      if (!h) continue;
      const n = h.face.normal.clone().applyMatrix3(nmat.getNormalMatrix(mesh.matrixWorld)).normalize();
      if (n.dot(ray.ray.direction) < 0) n.negate();
      const gn = g.nodes[r.id];
      const pn = new T.Vector3(...G.planeNormal(g, gn)).normalize();
      const off = n.dot(pn);
      if (Math.abs(off) <= Math.sin(30 * Math.PI / 180)) n.addScaledVector(pn, -off).normalize();
      const p = h.point.clone();
      p.addScaledVector(pn, -pn.dot(p.clone().sub(new T.Vector3(...gn.pos))));
      G.aimAt(g, r.id, p.toArray(), n.toArray());
      bound++;
    }
    return bound;
  }

  /** Ein neues Angusssystem aus dem Bauteil — mit `label` als Schritt im
      Verlauf (der Knopf), ohne (das Laden eines Bauteils). */
  function propose(n = gates, { label = '', fit = false } = {}) {
    if (!part.model || !api) return false;
    gates = n === 1 || n === 4 ? n : 2;
    const st = api.state;
    const g = proposeRunner(part.model, { gates, proc: st.proc, sizing: st.sizing });
    const bound = aimGatesAtPart(g);
    autoTaper(g, st.proc, st.sizing);
    api.setGraph(g, { label, fit });
    const warn = api.ui('propose-warn'), sel = api.ui('propose-gates');
    if (warn) warn.textContent = bound ? '' : MISSED;
    if (sel) sel.value = String(gates);
    return true;
  }

  const system = {
    html: selectRow({ ui: 'propose-gates', label: 'Anschnitte', value: '2', help: 'vorschlag',
      options: [['2', 'zwei'], ['1', 'einer, als Fächer'], ['4', 'vier']] })
      + warnLine('propose-warn'),
    mounted() {
      api.ui('propose-gates').addEventListener('change', e => { gates = +e.target.value || 2; });
    },
    primary: () => (!part.model
      ? { label: RUN, disabled: true, reason: 'Zuerst ein Bauteil laden.' }
      : { label: RUN, onClick: () => propose(gates, { label: 'Anguss vorgeschlagen' }),
        reason: 'Ersetzt das Angusssystem durch einen neuen Vorschlag; Strg+Z holt das bisherige zurück.' })
  };

  return {
    /** Für opts.propose des Angussdesigners: er reicht seine Schnittstelle,
        Zeilen und Hauptknopf für seinen Modus System kommen zurück. */
    attach: a => { api = a; return system; },
    propose,
    get gates() { return gates; }
  };
}
