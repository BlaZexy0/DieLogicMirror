/* Der Plan der Erstarrung: der Plan von „Füllsimulation" (Körper,
   Einlass — hier die Kolbenfläche am Pressrest) und dazu plan.sol mit
   Formblock, Kühlkanälen, Netz, Prozess und Auswertung der Erstarrung. */

import { createPlan } from '../../simulation/js/plan.js';
import { DEFAULTS } from './core/solcase.js';

const clone = x => JSON.parse(JSON.stringify(x));

export function solDefaults() {
  return {
    die: Object.assign({ marginSet: false }, DEFAULTS.die),
    channels: [],                 // { id, name, a: [mm], b: [mm], d, T, h }
    mesh: Object.assign({ cellSet: false }, DEFAULTS.mesh),
    process: Object.assign({}, DEFAULTS.process),
    post: clone(DEFAULTS.post)
  };
}

export function createSolPlan() {
  const plan = createPlan();
  plan.title = 'Erstarrung';
  plan.sol = solDefaults();
  let seq = 0;
  plan.newChannelId = () => 'k' + (++seq) + '_' + Date.now().toString(36);
  const base = { settings: plan.settings, apply: plan.apply };
  plan.settings = () => Object.assign(base.settings(), { sol: clone(plan.sol) });
  plan.apply = s => {
    if (s && s.sol) {
      const d = solDefaults();
      plan.sol = {
        die: Object.assign(d.die, s.sol.die || {}),
        channels: Array.isArray(s.sol.channels) ? clone(s.sol.channels) : [],
        mesh: Object.assign(d.mesh, s.sol.mesh || {}),
        process: Object.assign(d.process, s.sol.process || {}),
        post: Object.assign(d.post, s.sol.post || {})
      };
    }
    base.apply(s);
  };
  return plan;
}
