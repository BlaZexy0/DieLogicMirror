/* Rechnungen im Hintergrund — die Seite bleibt bedienbar:
     { task: 'case', … }  der Fall als ZIP (js/build.js)
     { task: 'gate', parts, runners, maxEdge }  die Anschnittfläche (core/geometry.js) */
import { build } from './build.js';
import { gateArea } from './core/geometry.js';

self.onmessage = async ev => {
  const m = ev.data;
  try {
    if (m.task === 'gate') {
      self.postMessage({ done: true, area: gateArea(m.parts, m.runners, m.maxEdge) });
      return;
    }
    const r = await build(m, text => self.postMessage({ progress: text }));
    self.postMessage({ done: true, zip: r.zip, root: r.root, info: r.info, stats: r.stats, files: r.files }, [r.zip.buffer]);
  } catch (err) {
    self.postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
