/* Maschinen-Preset-Auswahl: befüllt das Select aus config/machines.json und
   wendet ein gewähltes Preset auf die Eingabefelder an. Bei gewähltem Preset
   sind die Preset-Feldgruppen ausgeblendet; eine Zusammenfassung unter dem
   Select zeigt die übernommenen Werte. */

import { loadMachines, machines, machineById } from '../core/machines.js';
import { state, subscribe, notify } from '../core/state.js';
import { applyValues, updatePresetVisibility } from './inputs.js';

function summaryHTML(m) {
  const f = m.fields;
  return 'F<sub>s</sub> ' + f.force + ' kN · F<sub>gieß</sub> ' + f.injForce + ' kN · ' +
    'v<sub>max</sub> ' + f.vmax + ' m/s · a<sub>max</sub> ' + f.amax + ' m/s² · ' +
    'Ø ' + f.dmin + '–' + f.dmax + ' mm · L ' + f.lmin + '–' + f.lmax + ' mm · ' +
    'Säulen ' + f.tieX + ' × ' + f.tieY + ' mm';
}

function syncUI(sel, sum) {
  sel.value = state.machine || '';
  const m = machineById(state.machine);
  sum.hidden = !m;
  sum.innerHTML = m ? summaryHTML(m) : '';
  updatePresetVisibility();
}

export async function initPresetSelect(sel) {
  await loadMachines();
  machines.forEach(m => {
    const op = document.createElement('option');
    op.value = m.id;
    op.textContent = m.name;
    sel.appendChild(op);
  });

  const sum = document.createElement('p');
  sum.className = 'group-note';
  sum.id = 'presetSummary';
  sel.insertAdjacentElement('afterend', sum);

  sel.onchange = () => {
    state.machine = sel.value;
    const m = machineById(sel.value);
    if (m) applyValues(m.fields);
    notify();
  };

  subscribe(() => syncUI(sel, sum));
  syncUI(sel, sum);
}
