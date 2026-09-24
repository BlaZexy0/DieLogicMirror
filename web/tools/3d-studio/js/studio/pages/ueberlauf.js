/* Seite ueberlauf.html. */
import { bootPage } from '../host.js';
import { createUeberlaufTool } from '../../vents/tool.js';
import { HELP } from '../../vents/help.js';

export const __viewer = bootPage({
  id: 'ueberlauf', name: 'ueberlauf', title: 'Überlaufdesigner', help: HELP, tool: createUeberlaufTool, start: 'gearbox_cover',
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], minDistance: 3, maxDistance: 30000 }
});
