/* Preset-Auswahlen (Maschine, Legierung, Bauteiltyp): befüllt je Domäne das
   Select aus der zugehörigen config-Datei und wendet ein gewähltes Preset auf
   die Eingabefelder an. Bei gewähltem Preset ist die zugehörige Feldgruppe
   ausgeblendet; eine Zusammenfassung unter dem Select zeigt die übernommenen
   Werte. Die Domänen sind in js/config/fields.js (PRESET_DOMAINS) definiert. */

import { allFields, groups, PRESET_DOMAINS, FOLLOWS } from '../config/fields.js';
import { state, subscribe, notify } from '../core/state.js';
import { subHTML } from '../core/format.js';
import { applyValues, updatePresetVisibility } from './inputs.js';
import { clampToDomain } from '../core/domain.js';

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

/* Die Felder, die ein Preset dieser Domäne setzen sollte — die Gruppe, die
   bei gewähltem Preset ausgeblendet wird (fields.js: groups[].preset). */
function domainKeys(dom) {
  const g = groups.find(x => x.preset === dom.id);
  return g ? g.fields.map(f => f.key) : [];
}

/* Übernommene Werte als Kurzzusammenfassung (Labels + Einheiten aus fields.js).

   Setzt ein Preset ein Feld seiner Gruppe NICHT, bleibt stillschweigend der
   Felddefault stehen — und der gehört zu einer anderen Legierung bzw.
   Maschine. Ein Magnesium-Preset ohne densitySolid/shrink rechnet so mit
   Aluminium weiter: gemessen 362 statt 541 mm Kavitätshub. Deshalb werden
   die fehlenden Felder benannt, statt sie zu verschweigen. */
function summaryHTML(dom, p) {
  const set = Object.entries(p.fields).map(([k, val]) => {
    const f = FIELD_DEFS[k];
    return subHTML(f ? f.label : k) + ' <b>' + val + (f && f.unit ? '&nbsp;' + f.unit : '') + '</b>';
  }).join(' · ');
  const missing = domainKeys(dom).filter(k => p.fields[k] == null);
  if (!missing.length) return set;
  const names = missing.map(k => subHTML(FIELD_DEFS[k] ? FIELD_DEFS[k].label : k)).join(', ');
  return set + '<br><span class="preset-gap">⚠ Dieses Preset setzt ' + names
    + ' nicht; es gilt der Standardwert. Auf der Konto-Seite ergänzen oder „manuell" wählen.</span>';
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
      /* Die aus den Preset-Grenzen GEWÄHLTEN Werte nachführen: eine kleinere
         Maschine hat einen kleineren Kolben. Vorher blieb der alte Ø stehen
         und die Rechnung lief auf einer Maschine, die es nicht gibt. */
      const gezogen = clampToDomain(state.values);
      if (gezogen.length) {
        const zeig = {};
        gezogen.forEach(k => { zeig[k] = state.values[k]; });
        applyValues(zeig);
      }
    }
    notify();
  };

  const sync = () => {
    sel.value = state[dom.stateKey] || '';
    const p = presetById(dom, state[dom.stateKey]);
    sum.hidden = !p;
    sum.innerHTML = p ? summaryHTML(dom, p) : '';
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
