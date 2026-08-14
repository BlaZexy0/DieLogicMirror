/* Baut die Eingabe-Sidebar aus der Felddefinition, validiert Grenzen und
   hebt auf Wunsch die Eingaben eines Diagramms hervor. */

import { groups, PRESET_KEYS, PRESET_DOMAINS } from '../config/fields.js';
import { state, notify } from '../core/state.js';
import { pMaxMachine } from '../core/physics.js';

const DOMAIN_BY_ID = {};
PRESET_DOMAINS.forEach(d => { DOMAIN_BY_ID[d.id] = d; });

function fieldHTML(f) {
  const label = '<label>' + f.label +
    (f.unit ? ' <span class="unit">' + f.unit + '</span>' : '') + '</label>';
  if (f.type === 'select') {
    const opts = f.options.map(o =>
      '<option value="' + o[0] + '"' + (o[0] === f.def ? ' selected' : '') + '>' + o[1] + '</option>').join('');
    return '<div class="field" data-field="' + f.key + '">' + label +
      '<select data-k="' + f.key + '">' + opts + '</select></div>';
  }
  /* Alle Felder außer den Außermittigkeiten (Vorzeichen = Richtung) sind
     physikalische Beträge — min="0" hält Spinner und Browser-Validierung
     im Positiven; validate() prüft zusätzlich hart. */
  const min = NEGATIVE_OK.has(f.key) ? '' : ' min="0"';
  return '<div class="field" data-field="' + f.key + '">' + label +
    '<input data-k="' + f.key + '" type="number" step="any"' + min + ' value="' + f.def + '"></div>';
}

/* onlyKeys: optionales Set von Feldnamen — dann werden nur diese Felder
   gebaut (Einzelseiten-Modus). Leere Gruppen entfallen. */
export function buildInputs(container, onlyKeys = null) {
  const keep = f => !onlyKeys || onlyKeys.has(f.key);
  for (const g of groups) {
    let inner;
    if (g.columns) {
      const cols = g.columns
        .map(c => ({ title: c.title, fields: c.fields.filter(keep) }))
        .filter(c => c.fields.length);
      if (!cols.length) continue;
      inner = '<div class="chamber-grid">' + cols.map(c =>
        '<div class="input-column"><h4>' + c.title + '</h4>' + c.fields.map(fieldHTML).join('') + '</div>'
      ).join('') + '</div>';
    } else {
      const fs = g.fields.filter(keep);
      if (!fs.length) continue;
      /* adv-Felder eingeklappt hinter „Erweiterte Optionen" — außer es gibt
         nur adv-Felder (Einzelseiten-Modus), dann normal anzeigen. */
      const norm = fs.filter(f => !f.adv), adv = fs.filter(f => f.adv);
      inner = '<div class="fields">' + (norm.length ? norm : adv).map(fieldHTML).join('') + '</div>' +
        (norm.length && adv.length
          ? '<details class="adv-fields"><summary>Erweiterte Optionen</summary><div class="fields">' +
            adv.map(fieldHTML).join('') + '</div></details>'
          : '');
    }
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
}

/* Preset-Feldgruppen nur im Modus „manuell" zeigen — bei gewähltem Preset
   der jeweiligen Domäne kommen die Werte aus dem Preset und sind ausgeblendet. */
export function updatePresetVisibility() {
  document.querySelectorAll('.group[data-preset]').forEach(el => {
    const dom = DOMAIN_BY_ID[el.dataset.preset];
    el.hidden = !!(dom && state[dom.stateKey]);
  });
}

/* Werte programmatisch setzen (Preset, JSON-Import) — aktualisiert Zustand
   und sichtbare Eingabefelder. */
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

/* Felder, die zwingend > 0 sein müssen (Divisionen, Achsen, Wurzeln,
   physikalisch zwingend positive Größen). Exportiert für den
   Konsistenz-Test: jedes numerische Feld gehört in genau eine Klasse. */
export const POSITIVE_KEYS = ['density', 'diam', 'length', 'gate', 'vent', 'Cd',
  'force', 'injForce', 'area', 'psel', 'safety', 'vmax', 'tmax', 'vAirMax', 'solK',
  'tieX', 'tieY',
  'dmin', 'dmax', 'lmin', 'lmax', 'part', 'Tcast', 'Tflow', 'Tdie',
  'Zconst', 'wall', 'wallMin', 'wallMax', 'kfill', 'gateTh', 'Jatom', 'pAcc'];

/* Felder, die 0 sein dürfen, aber nicht negativ (amax = 0 heißt „kein
   Limit"; Gewichte, Bandgrenzen und Positionen können 0 sein). Die
   Außermittigkeiten eccX/eccY bleiben bewusst vorzeichenbehaftet. */
export const NONNEG_KEYS = ['runner', 'overflow', 'biscuit', 'amax',
  'fillMin', 'fillMax', 'gateMin', 'gateMax',
  'sealStroke', 'vacStart', 'vacPump', 'biscuitMin', 'intTime', 'Sfrac'];

export const NEGATIVE_OK = new Set(['eccX', 'eccY']);

export function validate(v) {
  const bad = new Set();
  const msgs = [];

  /* min/max-Paare: strict = Gleichheit ebenfalls ungültig (Achsen/Divisionen). */
  const pair = (a, b, label, strict) => {
    if (!isFinite(v[a]) || !isFinite(v[b])) return;
    if (strict ? v[a] >= v[b] : v[a] > v[b]) { bad.add(a); bad.add(b); msgs.push(label); }
  };
  pair('dmin', 'dmax', 'Kolben-Ø min ≥ max', true);
  pair('lmin', 'lmax', 'Kammerlänge min ≥ max', true);
  pair('wallMin', 'wallMax', 'Wandstärke min ≥ max', true);
  pair('fillMin', 'fillMax', 'Füllgrad-Ziel min > max', false);
  pair('gateMin', 'gateMax', 'Anschnittgeschw.-Ziel min > max', false);

  let nonpos = false;
  for (const k of POSITIVE_KEYS) if (!(v[k] > 0)) { bad.add(k); nonpos = true; }
  if (nonpos) msgs.push('rot markierte Felder müssen > 0 sein');

  let neg = false;
  for (const k of NONNEG_KEYS) if (!(v[k] >= 0)) { bad.add(k); neg = true; }
  if (neg) msgs.push('rot markierte Felder dürfen nicht negativ sein');

  /* Gewählte Werte gegen ihre Grenzen. */
  if (v.diam < v.dmin || v.diam > v.dmax) bad.add('diam');
  if (v.length < v.lmin || v.length > v.lmax) bad.add('length');
  /* Auslegungsdruck gegen den max. spezifischen Gießdruck der Maschine
     (Gießkraft auf Ø dmin) — ersetzt das frühere pmin/pmax-Paar. */
  const pM = pMaxMachine(v);
  if (isFinite(pM) && v.psel > pM) bad.add('psel');

  document.querySelectorAll('input[data-k]').forEach(e =>
    e.classList.toggle('invalid', bad.has(e.dataset.k)));

  /* Ungültige Preset-Felder sind bei gewähltem Preset ausgeblendet —
     dann stattdessen die jeweilige Preset-Auswahl markieren. */
  for (const dom of PRESET_DOMAINS) {
    const sel = document.getElementById(dom.selId);
    if (!sel) continue;
    const presetBad = !!state[dom.stateKey] && [...bad].some(k => PRESET_KEYS[k] === dom.id);
    sel.classList.toggle('invalid', presetBad);
    if (presetBad) msgs.push('Werte des gewählten ' + dom.title + 's ungültig — Preset prüfen oder „manuell" wählen');
  }

  const err = document.getElementById('error');
  if (err) err.textContent = msgs.length ? '⚠ ' + msgs.join(' · ') : '';
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
