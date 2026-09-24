/* Seite entformungsanalyse.html. */
import { bootPage } from '../host.js';
import { createEntformungTool } from '../../entformung/tool.js';
import { HELP } from '../../entformung/help.js';

export const __viewer = bootPage({
  id: 'entformung', name: 'entformung', title: 'Entformungsanalyse', help: HELP, tool: createEntformungTool,
  sceneOpts: { cameraStart: [260, 200, 260], target: [0, 0, 0], minDistance: 5, maxDistance: 20000 }
});
