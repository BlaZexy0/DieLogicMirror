/* Maschinen-Preset-Auswahl: befüllt das Select aus config/machines.json und
   wendet ein gewähltes Preset auf die Eingabefelder an. */

import { loadMachines, machines, machineById } from '../core/machines.js';
import { state, notify } from '../core/state.js';
import { applyValues } from './inputs.js';

export async function initPresetSelect(sel) {
  await loadMachines();
  machines.forEach(m => {
    const op = document.createElement('option');
    op.value = m.id;
    op.textContent = m.name;
    sel.appendChild(op);
  });
  sel.value = state.machine || '';
  sel.onchange = () => {
    state.machine = sel.value;
    const m = machineById(sel.value);
    if (m) applyValues(m.fields);
    notify();
  };
}
