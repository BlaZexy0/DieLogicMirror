/* Seite form.html: ohne Bauteil des Rahmens — das Werkzeug lädt eine ganze
   Form (GLB) und hält sie selbst. Die Kamera schaut von der festen Seite
   (−z): beim Öffnen fährt die bewegliche Hälfte vom Betrachter weg und gibt
   die Kavität frei; eingepasst wird in dieser Blickrichtung. */
import { bootPage } from '../host.js';
import { createFormaufbauTool } from '../../formaufbau/tool.js';
import { HELP } from '../../formaufbau/help.js';

export const __viewer = bootPage({
  id: 'formaufbau', name: 'formaufbau', title: 'Formaufbau', help: HELP, tool: createFormaufbauTool, part: false,
  sceneOpts: { cameraStart: [2000, 900, -1900], target: [0, 0, 20], minDistance: 3, maxDistance: 30000 }
});
