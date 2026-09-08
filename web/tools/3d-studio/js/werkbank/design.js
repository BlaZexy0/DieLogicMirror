/* Schritt 6 — Auslegung: das Dashboard mit den Zahlen aus dem Modell.

   Hier läuft die gießtechnische Auslegung (web/tools/auslegung/) selbst,
   nicht ein Abbild davon: derselbe Zustand (js/core/state.js — der
   Auslegungsabschnitt des aktuellen Projekts), dieselben Eingabefelder,
   dieselben Kennzahlen (ui/kpis.js, ui/chamber.js) und dieselben
   Diagramme (charts/registry.js). Die Seite legt sich über den Viewport,
   solange dieser Schritt aktiv ist.

   Was die Werkbank dazulegt, ist die ÜBERNAHME: Bauteil-, Anguss-,
   Überlauf- und Pressrestgewicht aus den Volumen des Modells, die
   Anschnittfläche und -dicke aus dem Angussgraphen, die Wandstärke aus
   2V/A und die Sprengfläche aus der gerasterten Projektion aller
   Kavitäten auf die Trennebene. Angehakt und übernommen — oder
   automatisch nachgeführt, sobald sich im Modell etwas ändert. */

import { loadTheme } from '../../../auslegung/js/core/theme.js';
import { state as design, subscribe, notify } from '../../../auslegung/js/core/state.js';
import { computeShot, rhoSolidus } from '../../../auslegung/js/core/physics.js';
import { applyCurveGen } from '../../../auslegung/js/core/curvegen.js';
import { applyAuto } from '../../../auslegung/js/core/autofit.js';
import { charts } from '../../../auslegung/js/charts/registry.js';
import { buildInputs, validate, highlightInputs, clearHighlights, refreshAuto, applyValues } from '../../../auslegung/js/ui/inputs.js';
import { initPresetSelects } from '../../../auslegung/js/ui/presets.js';
import { renderCurveTable, wireAddPoint } from '../../../auslegung/js/ui/curveTable.js';
import { renderKpis } from '../../../auslegung/js/ui/kpis.js';
import { buildChamberCard, renderChamber } from '../../../auslegung/js/ui/chamber.js';
import { buildCard, renderCard } from '../../../auslegung/js/ui/cards.js';
import { initSim } from '../../../auslegung/js/core/simstore.js';
import { PRESET_KEYS, PRESET_DOMAINS } from '../../../auslegung/js/config/fields.js';
import { $, fmt } from '../ui/controls.js';
import { sweepRunner, biscuitMesh } from '../runner/sweep.js';
import { projectedAreaXY, massOf, round } from './measure.js';

const SUBTITLE = 'Auslegung: Massen, Anschnitt, Wandstärke und Sprengfläche aus dem Modell — Kennzahlen und Diagramme wie im Dashboard.';

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

export function createDesignStage(ctx) {
  const state = { active: false, built: false, auto: false, values: {}, shot: null, dirty: true, checked: {} };
  for (const r of ROWS) state.checked[r.k] = r.k !== 'wallMax';
  const cards = {};
  let chamberCard = null, activeHl = null, letzterGueltigerStand = false;

  /* ── Übernahme ────────────────────────────────────────────── */
  function buildTransfer() {
    const el = $('au-transfer');
    el.innerHTML = ROWS.map(r =>
      '<input type="checkbox" data-k="' + r.k + '"' + (state.checked[r.k] ? ' checked' : '') + ' title="' + r.label + ' übernehmen">'
      + '<span class="k" data-k="' + r.k + '">' + r.label + '</span>'
      + '<span class="v na" data-v="' + r.k + '">—</span><span class="u">' + r.unit + '</span>'
      + '<small>' + r.src + '</small>').join('');
    for (const cb of el.querySelectorAll('input[data-k]')) {
      cb.addEventListener('change', () => { state.checked[cb.dataset.k] = cb.checked; });
    }
  }

  /* Die Geometrie wird nur gemessen, wenn sich im Modell etwas geändert
     hat — die Projektion rastert alle Kavitäten, und das soll nicht bei
     jedem Tastendruck in der Seitenleiste laufen. Die Massen folgen der
     Dichte und kommen bei jedem Aufruf frisch aus den Volumen. */
  let geom = null;
  function measureGeometry() {
    if (geom) return geom;
    const g = { volumes: {}, soups: [] };
    const model = ctx.part.model;
    if (model) {
      g.volumes.part = Math.abs(model.volume);
      g.wall = model.totalArea > 0 ? 2 * Math.abs(model.volume) / model.totalArea : NaN;
      g.soups.push(model.tris);
    }
    if (ctx.field.stats) g.wallMax = 2 * ctx.field.stats.maxIn;
    const r = ctx.stages.anguss;
    if (r && r.state.net && r.state.flow) {
      const vol = r.volumes();
      g.volumes.runner = vol.runner;
      g.volumes.biscuit = vol.biscuit;
      g.gate = r.state.flow.gateArea;
      g.gateTh = r.state.graph.gateH;
      g.soups.push(sweepRunner(r.state.net), biscuitMesh(r.state.graph.biscuit));
    }
    const ve = ctx.stages.ueberlauf;
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

  function refreshTransfer() {
    const vals = measure();
    const el = $('au-transfer');
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
  }

  /** Die angehakten Werte in die Auslegung schreiben. */
  function apply() {
    const vals = measure();
    const put = {};
    for (const r of ROWS) {
      if (!state.checked[r.k]) continue;
      const x = vals[r.k];
      if (!Number.isFinite(x) || x <= 0) continue;
      if (design.values[r.k] === x) continue;
      put[r.k] = x;
    }
    /* Wandstärke max. darf nicht unter das Minimum rutschen. */
    if (put.wallMax !== undefined && Number.isFinite(design.values.wallMin) && put.wallMax <= design.values.wallMin) delete put.wallMax;
    if (put.wall !== undefined) {
      const lo = design.values.wallMin, hi = put.wallMax !== undefined ? put.wallMax : design.values.wallMax;
      if (Number.isFinite(hi) && put.wall > hi) put.wallMax = round(put.wall * 1.5, 1);
      if (Number.isFinite(lo) && put.wall < lo) put.wallMin = round(put.wall / 2, 2);
    }
    if (!Object.keys(put).length) { refreshTransfer(); return 0; }
    applyValues(put);
    /* Ein von Hand (hier: vom Modell) gesetztes Preset-Feld nimmt die
       Domäne aus dem Preset heraus — wie beim Tippen in der Seitenleiste. */
    for (const k of Object.keys(put)) {
      const dom = PRESET_DOMAINS.find(d => d.id === PRESET_KEYS[k]);
      if (!dom) continue;
      design[dom.stateKey] = '';
      const sel = document.getElementById(dom.selId);
      if (sel) sel.value = '';
    }
    notify();
    refreshTransfer();
    $('au-warn').textContent = '';
    return Object.keys(put).length;
  }

  buildTransfer();
  $('au-apply').addEventListener('click', () => { ensureBuilt(); apply(); });
  $('au-auto').addEventListener('change', e => { state.auto = e.target.checked; if (state.auto) { ensureBuilt(); apply(); } });

  /* ── Das Dashboard ────────────────────────────────────────── */
  async function ensureBuilt() {
    if (state.built) return;
    state.built = true;
    try {
      await loadTheme();
      initPresetSelects();
      buildInputs($('groups'));
      renderCurveTable();
      wireAddPoint($('addPoint'));
      chamberCard = buildChamberCard($('chamber'));
      const chartsEl = $('charts');
      charts.forEach(def => { cards[def.id] = buildCard(def, chartsEl, { link: true, onHighlight }); });
      initSim();
      subscribe(() => { state.dirty = true; if (state.active) render(); refreshTransfer(); });
      refreshTransfer();
    } catch (err) {
      $('au-warn').textContent = 'Die Auslegung konnte nicht aufgebaut werden: ' + err.message;
      console.error(err);
    }
  }

  function onHighlight(def, btn) {
    document.querySelectorAll('.hl-btn.active').forEach(b => { if (b !== btn) b.classList.remove('active'); });
    if (activeHl === def) {
      activeHl = null;
      btn.classList.remove('active');
      clearHighlights();
      return;
    }
    activeHl = def;
    btn.classList.add('active');
    highlightInputs(def.inputs, { curve: def.usesCurve });
  }

  /* Wie main.js: prüfen, dann rechnen; ungültige Eingaben lassen den
     letzten gültigen Stand stehen. */
  function render() {
    if (!state.built || !state.active) return;
    state.dirty = false;
    const v = design.values;
    const genErr = applyCurveGen(v);
    applyAuto(v);
    refreshAuto();
    if (design.curveGen.mode !== 'points') renderCurveTable(genErr);
    const urteil = validate(v);
    document.body.classList.toggle('inputs-invalid', !urteil.ok);
    if (!urteil.ok) {
      if (letzterGueltigerStand) return;
      const grund = 'Eingaben außerhalb des zulässigen Bereichs: ' + (urteil.msgs[0] || 'siehe Seitenleiste') + '.';
      charts.forEach(def => renderCard(cards[def.id], def, v, null, grund));
      return;
    }
    letzterGueltigerStand = true;
    const shot = computeShot(v, design.curve);
    state.shot = shot;
    renderChamber(chamberCard, v);
    renderKpis($('summary'), v, shot, $('chamber-kpis'));
    charts.forEach(def => renderCard(cards[def.id], def, v, shot));
    ctx.markDone('auslegung', true);
  }

  /* Die Karten messen ihre Breite beim Zeichnen — ändert sich die des
     Dashboards, wird neu gezeichnet. */
  let rt = 0;
  new ResizeObserver(() => { if (!state.active || !state.built) return; clearTimeout(rt); rt = setTimeout(render, 120); }).observe($('au-dash'));

  /* ── Ereignisse ───────────────────────────────────────────── */
  let tt = 0;
  function modelChanged() {
    geom = null;
    clearTimeout(tt);
    tt = setTimeout(() => {
      if (state.auto) apply();
      else refreshTransfer();
    }, 250);
  }
  for (const ev of ['part', 'runner', 'vents', 'field']) ctx.on(ev, modelChanged);

  /** Für den Anguss-Schritt: die Werte und der letzte Schuss. */
  function designValues() {
    if (!state.shot) {
      try { state.shot = computeShot(design.values, design.curve); } catch { state.shot = null; }
    }
    return { values: design.values, shot: state.shot };
  }

  return {
    id: 'auslegung', state,
    async enter() {
      state.active = true;
      ctx.subtitle(SUBTITLE);
      ctx.status('');
      $('pt-legend').innerHTML = '';
      $('au-dash').classList.remove('hidden');
      await ensureBuilt();
      refreshTransfer();
      render();
    },
    leave() {
      state.active = false;
      $('au-dash').classList.add('hidden');
    },
    measure, apply, refreshTransfer, designValues, render, ensureBuilt,
    values: () => design.values
  };
}
