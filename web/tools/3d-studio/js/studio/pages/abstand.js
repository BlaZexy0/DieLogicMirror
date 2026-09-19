/* Seite abstand.html: ein Gastgeber ohne eigenes Bauteil — das Werkzeug hat zwei. */
import { createHost } from '../host.js';
import { createAbstandTool } from '../../abstand/tool.js';
import { HELP } from '../../abstand/help.js';

const host = createHost({
  mount: document.getElementById('studio'), id: 'abstand', title: 'Abstandsanalyse', help: HELP, part: false,
  sceneOpts: { cameraStart: [320, 240, 320], target: [0, 0, 0], minDistance: 5, maxDistance: 20000 }
});
const tool = host.mountTool(createAbstandTool);
export const __viewer = tool.__viewer;
window.__form3d = window.__abstand = __viewer;
await host.start();
