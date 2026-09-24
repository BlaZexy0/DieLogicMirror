/* Seite wandstaerke.html. */
import { bootPage } from '../host.js';
import { createWandstaerkeTool } from '../../wandstaerke/tool.js';
import { HELP } from '../../wandstaerke/help.js';

export const __viewer = bootPage({
  id: 'wandstaerke', name: 'wandstaerke', title: 'Wandstärkenanalyse', help: HELP, tool: createWandstaerkeTool,
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], minDistance: 5, maxDistance: 20000 }
});
