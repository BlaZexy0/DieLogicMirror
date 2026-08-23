/* Preset-Auswahlen (Maschine, Legierung, Bauteiltyp): befüllt je Domäne das
   Select aus der zugehörigen config-Datei und wendet ein gewähltes Preset auf
   die Eingabefelder an. Bei gewähltem Preset ist die zugehörige Feldgruppe
   ausgeblendet; eine Zusammenfassung unter dem Select zeigt die übernommenen
   Werte. Die Domänen sind in js/config/fields.js (PRESET_DOMAINS) definiert. */

import { allFields, PRESET_DOMAINS, FOLLOWS } from '../config/fields.js';
import { state, subscribe, notify } from '../core/state.js';
import { applyValues, updatePresetVisibility } from './inputs.js';

const FIELD_DEFS = {};
allFields().forEach(f => { FIELD_DEFS[f.key] = f; });

const lists = {};   // Domänen-id → Preset-Array aus window[global]

export function presetList(dom) {
  if (!lists[dom.id]) {
    const data = window[dom.global];
    if (!data) throw new Error(dom.config + ' nicht geladen (window.' + dom.global + ' fehlt).');
    lists[dom.id] = data[dom.listKey] || [];
  }
  return lists[dom.id];
}

export function presetById(dom, id) {
  return presetList(dom).find(p => p.id === id) || null;
}

/* Übernommene Werte als Kurzzusammenfassung (Labels + Einheiten aus fields.js). */
function summaryHTML(p) {
  return Object.entries(p.fields).map(([k, val]) => {
    const f = FIELD_DEFS[k];
    return (f ? f.label : k) + ' <b>' + val + (f && f.unit ? '&nbsp;' + f.unit : '') + '</b>';
  }).join(' · ');
}

export function initPresetSelect(dom, sel) {
  presetList(dom).forEach(p => {
    const op = document.createElement('option');
    op.value = p.id;
    op.textContent = p.name;
    sel.appendChild(op);
  });

  const sum = document.createElement('p');
  sum.className = 'group-note';
  sel.insertAdjacentElement('afterend', sum);

  sel.onchange = () => {
    state[dom.stateKey] = sel.value;
    const p = presetById(dom, sel.value);
    if (p) {
      applyValues(p.fields);
      /* Folge-Felder (z. B. eingestellter Akkumulatordruck) auf den neuen Nennwert */
      const fol = {};
      for (const k in FOLLOWS) if (p.fields[FOLLOWS[k]] != null) fol[k] = p.fields[FOLLOWS[k]];
      applyValues(fol);
    }
    notify();
  };

  const sync = () => {
    sel.value = state[dom.stateKey] || '';
    const p = presetById(dom, state[dom.stateKey]);
    sum.hidden = !p;
    sum.innerHTML = p ? summaryHTML(p) : '';
    updatePresetVisibility();
  };
  subscribe(sync);
  sync();
}

/* Alle Domänen initialisieren, deren Select im Dokument existiert. */
export function initPresetSelects() {
  for (const dom of PRESET_DOMAINS) {
    const sel = document.getElementById(dom.selId);
    if (sel) initPresetSelect(dom, sel);
  }
}
