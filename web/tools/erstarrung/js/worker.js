/* Der Fall im Hintergrund — die Seite bleibt bedienbar (js/build.js). */
import { build } from './build.js';

self.onmessage = async ev => {
  try {
    const r = await build(ev.data, text => self.postMessage({ progress: text }));
    self.postMessage({ done: true, zip: r.zip, root: r.root, info: r.info, stats: r.stats, files: r.files }, [r.zip.buffer]);
  } catch (err) {
    self.postMessage({ error: err && err.message ? err.message : String(err) });
  }
};
