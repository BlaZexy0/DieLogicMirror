/* Schritt 6 — Auslegung: das Dashboard mit den Zahlen aus dem Modell.

   Hier läuft die gießtechnische Auslegung (web/tools/auslegung/) selbst,
   nicht ein Abbild davon: derselbe Zustand (js/core/state.js — der
   Auslegungsabschnitt des aktuellen Projekts), dieselben Eingabefelder,
   dieselben Kennzahlen (ui/kpis.js, ui/chamber.js) und dieselben
   Diagramme (charts/registry.js). Das Dashboard legt sich über den
   Viewport, solange dieser Schritt dran ist: links seine Eingaben
   (Presets, Schusskurve, Eingaben), rechts Prüfungen, Füllkammer,
   Kennzahlen und Diagramme. Die Seitenleiste behält nur, was die Werkbank
   dazulegt — die ÜBERNAHME.

   Übernommen werden Bauteil-, Anguss-, Überlauf- und Pressrestgewicht aus
   den Volumen des Modells, die Anschnittfläche und -dicke aus dem
   Angussgraphen, die Wandstärke aus 2V/A und die Sprengfläche aus der
   gerasterten Projektion aller Kavitäten auf die Trennebene. Angehakt und
   übernommen — oder automatisch nachgeführt, sobald sich im Modell etwas
   ändert. Ein Schritt mit einem Modus: er folgt dem Vertrag der Werkzeuge
   (js/studio/host.js), soweit er ihn braucht. */

import { loadTheme } from '../../../auslegung/js/core/theme.js';
import { state as design, notify } from '../../../auslegung/js/core/state.js';
import { rhoSolidus } from '../../../auslegung/js/core/physics.js';
import { buildInputs, applyValues } from '../../../auslegung/js/ui/inputs.js';
import { initPresetSelects } from '../../../auslegung/js/ui/presets.js';
import { renderCurveTable, wireAddPoint } from '../../../auslegung/js/ui/curveTable.js';
import { createRender, buildDashboard, startPage } from '../../../auslegung/js/ui/page.js';
import { PRESET_KEYS, PRESET_DOMAINS } from '../../../auslegung/js/config/fields.js';
import { fmt } from '../studio/format.js';
import { checkRow, warnLine } from '../studio/rows.js';
import { projectedAreaXY, massOf, round } from './measure.js';

/* Die übernehmbaren Größen: Schlüssel im Auslegungszustand, Bezeichnung,
   Einheit, Quelle im Modell. */
const ROWS = [
  { k: 'part', label: 'Bauteilgewicht', unit: 'kg', src: 'Bauteilvolumen × ρ bei Solidus' },
  { k: 'runner', label: 'Angussgewicht', unit: 'kg', src: 'Kanäle des Angussgraphen (ohne Pressrest)' },
  { k: 'overflow', label: 'Überlaufgewicht', unit: 'kg', src: 'alle Überläufe und Entlüftungen' },
  { k: 'biscuit', label: 'Pressrestgewicht', unit: 'kg', src: 'Pressrest des Angusses (Ø × Dicke)' },
  { k: 'gate', label: 'Anschnittfläche', unit: 'mm²', src: 'Summe der Anschnitte im Angussgraphen' },
  { k: 'gateTh', label: 'Anschnittdicke', unit: 'mm', src: 'Anschnitthöhe des Angusses' },
  { k: 'wall', label: 'Wandstärke', unit: 'mm', src: 'Bauteil: 2·V/A' },
  { k: 'wallMax', label: 'Wandstärke max.', unit: 'mm', src: 'dickste Stelle im Abstandsfeld' },
  { k: 'area', label: 'Sprengfläche', unit: 'm²', src: 'Projektion aller Kavitäten auf die Trennebene' }
];

/* Die Seitenleiste: die Übernahmetabelle. Ihre Zeilen tragen data-t, nicht
   data-k: data-k ist in der Auslegung das Eingabefeld eines Werts
   (ui/inputs.js), und dieselbe Seite fand sonst beim Übernehmen die
   Checkbox statt des Felds — das zeigte weiter den alten Wert. */
const PANEL = '<div class="au-transfer" data-ui="au-transfer"></div>'
  + checkRow({ ui: 'au-auto', label: 'automatisch nachführen', help: 'nachfuehren' })
  + warnLine('au-warn');

/* Das Dashboard über dem Viewport. Die ids sind die der Auslegung — ihre
   Module finden ihre Felder daran (ui/presets.js, ui/curveTable.js,
   ui/page.js). */
const DASH = '<div class="wb-dash" data-ui="au-dash" hidden>'
  + '<aside class="wb-dash-inputs" aria-label="Eingaben der Auslegung">'
  + '<h2>Presets</h2><div class="au-fields">'
  + '<div class="field"><label for="machineSel">Maschine</label><select id="machineSel"><option value="">manuell</option></select></div>'
  + '<div class="field"><label for="alloySel">Legierung</label><select id="alloySel"><option value="">manuell</option></select></div>'
  + '<div class="field"><label for="partSel">Bauteiltyp</label><select id="partSel"><option value="">manuell</option></select></div>'
  + '</div>'
  + '<h2>Schusskurve</h2><div class="group" id="curve-group"><p class="curve-note">Wegpunkte als Weg s [mm] / Kolbengeschwindigkeit v [m/s].</p>'
  + '<table class="ctab"><thead><tr><th style="width:40%">s [mm]</th><th style="width:44%">v [m/s]</th><th></th></tr></thead><tbody id="curveBody"></tbody></table>'
  + '<button type="button" id="addPoint" class="row-add">+ Punkt hinzufügen</button></div>'
  + '<h2>Eingaben</h2><div id="groups" class="groups"></div>'
  + '<div class="wb-dash-note"><span class="hint-mark" aria-hidden="true">◉</span> Der Ring mit Führungslinien zeigt in jedem Diagramm den '
  + 'Arbeitspunkt. Ein markiertes Feld liegt außerhalb seiner Grenzen. <span id="error"></span></div>'
  + '</aside>'
  + '<div class="wb-dash-main">'
  + '<div id="checkbar"></div><div id="chamber"></div><div id="summary" class="summary"></div>'
  + '<h2>Auslegungsdiagramme</h2>'
  + '<p class="sub">Schusskurve · PQ² · (φ, λ)-Auslegungsfenster · Diagramme der gießtechnischen Auslegung · 🎯 hebt die Eingaben eines Diagramms hervor · ↗ öffnet die Einzelseite</p>'
  + '<section id="charts" class="charts"></section>'
  + '</div></div>';

/**
 * @param host    der Gast-Gastgeber (js/studio/stages.js)
 * @param opts.runner  () → link des Angussdesigners (volumes, gate, soups)
 * @param opts.vents   () → link des Überlaufdesigners (volume, tris)
 */
export function createDesignTool(host, opts = {}) {
  const { shell, part } = host;
  const ui = host.ui;
  const state = { active: false, built: false, auto: false, values: {}, shot: null, dirty: true, drawn: false, ready: true, checked: {} };
  for (const r of ROWS) state.checked[r.k] = r.k !== 'wallMax';
  let renderDash = null;                            // ui/page.js createRender, nach dem Aufbau
  let dash = null;                                  // das Dashboard im Viewport (mounted)

  /* ── Übernahme ────────────────────────────────────────────── */
  function buildTransfer() {
    const el = ui('au-transfer');
    el.innerHTML = ROWS.map(r =>
      '<input type="checkbox" data-t="' + r.k + '"' + (state.checked[r.k] ? ' checked' : '') + ' aria-label="' + r.label + ' übernehmen">'
      + '<span class="k" data-t="' + r.k + '">' + r.label + '</span>'
      + '<span class="v na" data-v="' + r.k + '">—</span><span class="u">' + r.unit + '</span>'
      + '<small>' + r.src + '</small>').join('');
    el.addEventListener('change', e => {
      const cb = e.target;
      if (!cb || !cb.dataset || !cb.dataset.t) return;
      state.checked[cb.dataset.t] = cb.checked;
      host.refreshActions();
    });
  }

  /* Die Geometrie wird nur gemessen, wenn sich im Modell etwas geändert
     hat — die Projektion rastert alle Kavitäten, und das soll nicht bei
     jedem Tastendruck in der Seitenleiste laufen. Die Massen folgen der
     Dichte und kommen bei jedem Aufruf frisch aus den Volumen. */
  let geom = null;
  function measureGeometry() {
    if (geom) return geom;
    const g = { volumes: {}, soups: [] };
    const model = part.model;
    if (model) {
      g.volumes.part = Math.abs(model.volume);
      g.wall = model.totalArea > 0 ? 2 * Math.abs(model.volume) / model.totalArea : NaN;
      g.soups.push(model.tris);
    }
    if (host.field.stats) g.wallMax = 2 * host.field.stats.maxIn;
    const r = opts.runner && opts.runner();
    const gate = r && r.gate();
    if (gate) {
      const vol = r.volumes();
      g.volumes.runner = vol.runner;
      g.volumes.biscuit = vol.biscuit;
      g.gate = gate.area;
      g.gateTh = gate.th;
      g.soups.push(...r.soups());
    }
    const ve = opts.vents && opts.vents();
    if (ve) {
      g.volumes.overflow = ve.volume();
      g.soups.push(ve.tris());
    }
    if (g.soups.length) g.area = projectedAreaXY(g.soups, 1) * 1e-6;
    geom = g;
    return g;
  }

  /** Die Werte aus dem Modell — nur die, die es gerade gibt. */
  function measure() {
    const g = measureGeometry();
    const rho = rhoSolidus(design.values);
    const out = {};
    for (const k of ['part', 'runner', 'biscuit', 'overflow']) {
      if (g.volumes[k] !== undefined) out[k] = round(massOf(g.volumes[k], rho));
    }
    if (g.wall !== undefined) out.wall = round(g.wall, 2);
    if (g.wallMax !== undefined) out.wallMax = round(g.wallMax, 1);
    if (g.gate !== undefined) { out.gate = round(g.gate, 0); out.gateTh = round(g.gateTh, 2); }
    if (g.area !== undefined) out.area = round(g.area, 4);
    state.values = out;
    return out;
  }

  /* Was „Übernehmen" jetzt schriebe: die angehakten Werte, die es gibt und
     die in der Auslegung anders stehen. */
  function pending(vals) {
    const put = {};
    for (const r of ROWS) {
      if (!state.checked[r.k]) continue;
      const x = vals[r.k];
      if (!Number.isFinite(x) || x <= 0) continue;
      if (design.values[r.k] === x) continue;
      put[r.k] = x;
    }
    return put;
  }

  function refreshTransfer() {
    const vals = measure();
    const el = ui('au-transfer');
    for (const r of ROWS) {
      const span = el.querySelector('[data-v="' + r.k + '"]');
      if (!span) continue;
      const x = vals[r.k];
      const ok = Number.isFinite(x);
      span.textContent = ok ? fmt(x, r.k === 'area' ? 4 : 2) : '—';
      span.classList.toggle('na', !ok);
      const differs = ok && Number.isFinite(design.values[r.k]) && Math.abs(design.values[r.k] - x) > 1e-9 * Math.max(1, Math.abs(x));
      span.classList.toggle('changed', differs);
    }
    host.refreshActions();
  }

  /** Die angehakten Werte in die Auslegung schreiben. → wie viele. */
  function apply() {
    const put = pending(measure());
    /* Wandstärke max. darf nicht unter das Minimum rutschen. */
    if (put.wallMax !== undefined && Number.isFinite(design.values.wallMin) && put.wallMax <= design.values.wallMin) delete put.wallMax;
    if (put.wall !== undefined) {
      const lo = design.values.wallMin, hi = put.wallMax !== undefined ? put.wallMax : design.values.wallMax;
      if (Number.isFinite(hi) && put.wall > hi) put.wallMax = round(put.wall * 1.5, 1);
      if (Number.isFinite(lo) && put.wall < lo) put.wallMin = round(put.wall / 2, 2);
    }
    if (!Object.keys(put).length) { refreshTransfer(); return 0; }
    applyValues(put);
    /* Ein vom Modell gesetztes Preset-Feld nimmt die Domäne aus dem Preset
       heraus — wie beim Tippen in den Eingaben. */
    for (const k of Object.keys(put)) {
      const dom = PRESET_DOMAINS.find(d => d.id === PRESET_KEYS[k]);
      if (!dom) continue;
      design[dom.stateKey] = '';
      const sel = document.getElementById(dom.selId);
      if (sel) sel.value = '';
    }
    notify();
    refreshTransfer();
    ui('au-warn').textContent = '';
    return Object.keys(put).length;
  }

  /* ── Das Dashboard ────────────────────────────────────────── */
  /* Dieselbe Pipeline wie das Dashboard selbst (auslegung/js/ui/page.js):
     prüfen, dann rechnen; ungültige Eingaben lassen den letzten gültigen
     Stand stehen; die Vakuum-Felder folgen dem Modell, und ein Wechsel des
     Farbschemas malt Diagramme und Füllkammer neu. Gezeichnet wird nur,
     solange der Schritt dran ist — beim Betreten rechnet setActive neu. */
  async function ensureBuilt() {
    if (state.built) return;
    state.built = true;
    try {
      await loadTheme();
      initPresetSelects();
      buildInputs(document.getElementById('groups'));
      renderCurveTable();
      wireAddPoint(document.getElementById('addPoint'));
      const d = buildDashboard({ chamber: document.getElementById('chamber'), summary: document.getElementById('summary'), charts: document.getElementById('charts') });
      renderDash = createRender({
        blocked: d.block,
        draw: (v, shot) => {
          state.shot = shot;
          d.draw(v, shot);
          state.drawn = true;
        }
      });
      startPage(() => { state.dirty = true; if (state.active) render(); refreshTransfer(); host.emit('design'); },
        { resize: false, repaint: () => { if (state.active) d.repaint(); } });
      refreshTransfer();
    } catch (err) {
      ui('au-warn').textContent = 'Die Auslegung konnte nicht aufgebaut werden: ' + err.message;
      console.error(err);
    }
  }

  function render() {
    if (!state.built || !state.active || !renderDash) return;
    state.dirty = false;
    renderDash();
  }

  /* ── Das Modell hat sich geändert ─────────────────────────── */
  let tt = 0;
  function modelChanged() {
    geom = null;
    clearTimeout(tt);
    tt = setTimeout(() => {
      if (state.auto) apply();
      else refreshTransfer();
    }, 250);
  }

  function primary() {
    if (!part.model) return { label: 'In die Auslegung übernehmen', disabled: true, reason: 'Zuerst ein Bauteil laden.' };
    const n = Object.keys(pending(state.values)).length;
    if (!n) return { hidden: true, noteKind: 'ok', reason: 'Die Auslegung rechnet mit den angehakten Werten des Modells.' };
    return { label: 'In die Auslegung übernehmen', onClick: async () => { await ensureBuilt(); apply(); },
      reason: n === 1 ? 'Ein Wert weicht von der Auslegung ab.' : n + ' Werte weichen von der Auslegung ab.' };
  }

  function mounted() {
    buildTransfer();
    shell.viewport.insertAdjacentHTML('beforeend', DASH);
    dash = ui('au-dash');
    ui('au-auto').addEventListener('change', async e => {
      state.auto = e.target.checked;
      if (state.auto) { await ensureBuilt(); apply(); }
    });
    /* Die Karten messen ihre Breite beim Zeichnen — ändert sich die des
       Dashboards, wird neu gezeichnet. */
    let rt = 0;
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => { if (!state.active || !state.built) return; clearTimeout(rt); rt = setTimeout(render, 120); }).observe(dash);
    }
    refreshTransfer();
  }

  /* Dran: das Dashboard liegt über dem Viewport und rechnet; nicht dran: weg. */
  async function setActive(on) {
    state.active = on;
    dash.hidden = !on;
    if (!on) return;
    await ensureBuilt();
    refreshTransfer();
    render();
  }

  const tool = {
    id: 'auslegung',
    modes: [{ id: 'uebernahme', label: 'Übernahme', hint: 'Massen, Anschnitt, Wandstärke und Sprengfläche aus dem Modell: angehakt gehen sie in die Auslegung.', html: PANEL, primary }],
    mounted, setActive, exports: [],
    onPart: () => modelChanged(),
    link: { modelChanged, measure, apply, values: () => design.values }
  };
  tool.__viewer = {
    state, tool, measure, apply, refreshTransfer, render, ensureBuilt,
    values: () => design.values
  };
  return tool;
}
