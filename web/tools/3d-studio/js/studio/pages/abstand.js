/* Seite abstand.html: ohne das Bauteil des Gastgebers — das Werkzeug hat zwei. */
import { bootPage } from '../host.js';
import { createAbstandTool } from '../../abstand/tool.js';
import { HELP } from '../../abstand/help.js';

export const __viewer = bootPage({
  id: 'abstand', name: 'abstand', title: 'Abstandsanalyse', help: HELP, tool: createAbstandTool, part: false,
  sceneOpts: { cameraStart: [320, 240, 320], target: [0, 0, 0], minDistance: 5, maxDistance: 20000 }
});
