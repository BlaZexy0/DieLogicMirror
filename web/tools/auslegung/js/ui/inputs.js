/* Baut die Eingabe-Sidebar aus der Felddefinition, validiert Grenzen und
   hebt auf Wunsch die Eingaben eines Diagramms hervor. */

import { AUTO_KEYS, groups, PRESET_KEYS, PRESET_DOMAINS, hiddenFields } from '../config/fields.js';
import { state, notify } from '../core/state.js';
import { subHTML } from '../core/format.js';
import { checkValues } from '../core/domain.js';

const DOMAIN_BY_ID = {};
PRESET_DOMAINS.forEach(d => { DOMAIN_BY_ID[d.id] = d; });

function fieldHTML(f) {
  const label = '<label>' + subHTML(f.label) +
    (f.unit ? ' <span class="unit">' + f.unit + '</span>' : '') + '</label>';
  if (f.type === 'select') {
    const opts = f.options.map(o =>
      '<option value="' + o[0] + '"' + (o[0] === f.def ? ' selected' : '') + '>' + o[1] + '</option>').join('');
    return '<div class="field" data-field="' + f.key + '">' + label +
      '<select data-k="' + f.key + '">' + opts + '</select></div>';
  }
  /* Grenzen kommen aus der Felddefinition — dieselbe Quelle, aus der
     validate() und docs/eingabegrenzen.md gespeist werden. Der Browser hält
     damit Spinner und Pfeiltasten von vornherein im gültigen Bereich; die
     harte Prüfung macht validate(). */
  const lo = f.gt !== undefined ? f.gt : f.min;
  const min = lo === undefined ? '' : ' min="' + lo + '"';
  const max = f.max === undefined ? '' : ' max="' + f.max + '"';
  /* Auto-Schalter: Feld folgt core/autofit.js und ist dann schreibgeschützt */
  const auto = f.auto
    ? '<label class="auto-toggle" title="' + f.auto.replace(/"/g, '&quot;') + '"><input type="checkbox" data-auto="' + f.key + '"> Auto</label>'
    : '';
  /* Reihenfolge in der Flex-Zeile: Name … [Auto] Einheit — der Schalter
     nimmt den Platz vor der Einheit ein, die Einheit bleibt rechts */
  const lab = auto
    ? (f.unit ? label.replace(' <span class="unit">', auto + ' <span class="unit">') : label.replace('</label>', auto + '</label>'))
    : label;
  return '<div class="field" data-field="' + f.key + '">' + lab +
    '<input data-k="' + f.key + '" type="number" step="any"' + min + max + ' value="' + f.def + '"></div>';
}

/* onlyKeys: optionales Set von Feldnamen — dann werden nur diese Felder
   gebaut (Einzelseiten-Modus). Leere Gruppen entfallen. */
export function buildInputs(container, onlyKeys = null) {
  const keep = f => !onlyKeys || onlyKeys.has(f.key);
  for (const g of groups) {
    const fs = g.fields.filter(keep);
    if (!fs.length) continue;
    /* adv-Felder eingeklappt hinter „Erweiterte Optionen" — außer es gibt
       nur adv-Felder (Einzelseiten-Modus), dann normal anzeigen. */
    const norm = fs.filter(f => !f.adv), adv = fs.filter(f => f.adv);
    const inner = '<div class="fields">' + (norm.length ? norm : adv).map(fieldHTML).join('') + '</div>' +
      (norm.length && adv.length
        ? '<details class="adv-fields"><summary>Erweiterte Optionen</summary><div class="fields">' +
          adv.map(fieldHTML).join('') + '</div></details>'
        : '');
    const el = document.createElement('div');
    el.className = 'group' + (g.wide ? ' wide' : '');
    el.dataset.group = g.id;
    if (g.preset) el.dataset.preset = g.preset;
    el.innerHTML = '<h3>' + g.title + '</h3>' + inner +
      (g.note ? '<p class="group-note">' + g.note + '</p>' : '');
    container.appendChild(el);
  }
  updatePresetVisibility();

  container.querySelectorAll('input[data-k], select[data-k]').forEach(e => {
    e.value = state.values[e.dataset.k];
    e.oninput = () => {
      state.values[e.dataset.k] = e.tagName === 'SELECT' ? e.value : Number(e.value);
      /* Handänderung eines Preset-Felds → zugehörige Domäne auf „manuell" */
      const dom = DOMAIN_BY_ID[PRESET_KEYS[e.dataset.k]];
      if (dom) {
        state[dom.stateKey] = '';
        const sel = document.getElementById(dom.selId);
        if (sel) sel.value = '';
      }
      notify();
    };
  });

  /* Auto-Schalter: Zustand spiegeln, Felder schreibgeschützt halten */
  container.querySelectorAll('input[data-auto]').forEach(cb => {
    cb.checked = !!state.auto[cb.dataset.auto];
    cb.onchange = () => { state.auto[cb.dataset.auto] = cb.checked; notify(); };
  });
  refreshAuto(container);
  updateFieldVisibility(container);
}

/* Felder mit `when` (fields.js) nur zeigen, solange das gewählte Modell sie
   braucht — nach jeder Zustandsänderung, wie refreshAuto. */
export function updateFieldVisibility(root = document) {
  const hidden = hiddenFields(state.values);
  root.querySelectorAll('.field[data-field]').forEach(el => {
    const hide = hidden.has(el.dataset.field);
    if (el.hidden !== hide) el.hidden = hide;
  });
}

/* Auto-Felder nach jeder Zustandsänderung auf den berechneten Wert setzen. */
export function refreshAuto(root = document) {
  for (const k in AUTO_KEYS) {
    const on = !!state.auto[k];
    root.querySelectorAll('input[data-k="' + k + '"]').forEach(e => {
      e.readOnly = on;
      e.classList.toggle('auto-on', on);
      if (on && document.activeElement !== e) e.value = state.values[k];
    });
    root.querySelectorAll('input[data-auto="' + k + '"]').forEach(cb => { cb.checked = on; });
  }
}

/* Preset-Feldgruppen nur im Modus „manuell" zeigen — bei gewähltem Preset
   der jeweiligen Domäne kommen die Werte aus dem Preset und sind ausgeblendet. */
export function updatePresetVisibility() {
  document.querySelectorAll('.group[data-preset]').forEach(el => {
    const dom = DOMAIN_BY_ID[el.dataset.preset];
    el.hidden = !!(dom && state[dom.stateKey]);
  });
}

/* Werte programmatisch setzen (Preset, Übernahme aus dem Modell in der
   Werkbank) — aktualisiert Zustand und sichtbare Eingabefelder. */
export function applyValues(fields) {
  for (const k in fields) {
    if (fields[k] == null) continue;
    /* String-Felder (Selects, z. B. vacModel) unverändert übernehmen. */
    state.values[k] = typeof state.values[k] === 'string'
      ? String(fields[k]) : Number(fields[k]);
    const e = document.querySelector('[data-k="' + k + '"]');
    if (e) e.value = fields[k];
  }
}

/* Die Eingabedomäne steht in config/fields.js und wird in core/domain.js
   angewandt (checkValues). Hier bleibt nur, was das DOM braucht: markieren
   und melden. Wie checkValues, markiert zusätzlich die Sidebar; der
   Rückgabewert ist das Urteil — die Seite (ui/page.js) rechnet nur weiter,
   wenn es ok ist. */
export function validate(v) {
  const res = checkValues(v);
  const { bad } = res;
  const msgs = res.msgs.slice();

  document.querySelectorAll('input[data-k]').forEach(e =>
    e.classList.toggle('invalid', bad.has(e.dataset.k)));

  /* Ungültige Preset-Felder sind bei gewähltem Preset ausgeblendet —
     dann stattdessen die jeweilige Preset-Auswahl markieren. */
  for (const dom of PRESET_DOMAINS) {
    const sel = document.getElementById(dom.selId);
    if (!sel) continue;
    const presetBad = !!state[dom.stateKey] && [...bad].some(k => PRESET_KEYS[k] === dom.id);
    sel.classList.toggle('invalid', presetBad);
    if (presetBad) msgs.push('Werte des gewählten ' + dom.title + 's ungültig: Preset prüfen oder „manuell" wählen');
  }

  const err = document.getElementById('error');
  if (err) err.textContent = msgs.length ? '⚠ ' + msgs.join(' · ') : '';
  return { ok: res.ok, bad, msgs };
}

/* Hervorhebung der Eingaben eines Diagramms. */
export function highlightInputs(keys, opts = {}) {
  clearHighlights();
  const set = new Set(keys);
  let first = null;
  document.querySelectorAll('.field[data-field]').forEach(el => {
    if (set.has(el.dataset.field)) {
      el.classList.add('hl');
      const det = el.closest('details');
      if (det) det.open = true;
      const grp = el.closest('.group');
      if (grp) grp.classList.add('hl');
      if (!first) first = el;
    }
  });
  if (opts.curve) {
    const cg = document.getElementById('curve-group');
    if (cg) { cg.classList.add('hl'); if (!first) first = cg; }
  }
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function clearHighlights() {
  document.querySelectorAll('.hl').forEach(el => el.classList.remove('hl'));
}
