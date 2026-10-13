/* Die Auswertung: was die Rechnung dafür schreibt und wie sie aussieht.

   Während der Rechnung schreiben Funktionsobjekte (casegen.js,
   simulation/system/auswertung) keine Zeitstände des ganzen Netzes, sondern
   nur die Oberfläche der Schmelze und die Wand mit den Werten dahinter
   (EnSight, die Wand nur einmal als Geometrie) und Zeitreihen: Füllung,
   Druck am Kolben, Luft, Einschlüsse, Temperatur. Danach im Hauptordner:

     bilder.py   (pvbatch)  die Bilder je Ansicht, Kennwert und Zeitpunkt
     bericht.py  (python3)  Graphiken, Daten und bericht.html

   Beide lesen auswertung.json — das baut auswertungConfig aus dem Plan.
   Die Lage von Farbleiste und Text (FRAME) zeigt die Seite im Viewport als
   Vorschau; Bilder und Vorschau lesen dieselben Zahlen. */

import { BILDER_PY } from './bilder.js';
import { BERICHT_PY } from './bericht.js';

export { BILDER_PY, BERICHT_PY };

/** Die Kennwerte, die die Seite anbietet — alle standardmäßig an. Je
    Kennwert eine Farbleiste der Palette (shared/palette.js): `rainbow` für
    die Geschwindigkeit (0 … 50 m/s, darüber Pink), `bgo` für die
    mitgerissene Luft (linear), sonst `heat`. `fields`: was die Oberflächen
    dafür mitschreiben müssen. */
export const CRITERIA = [
  { id: 'velocity', label: 'Geschwindigkeit', unit: 'm/s', map: 'rainbow', hint: 'Betrag der Schmelzegeschwindigkeit, Regenbogen von 0 bis 50 m/s, darüber Pink', range: ['0', '50'], fields: ['magU'] },
  { id: 'temperature', label: 'Temperatur', unit: '°C', map: 'heat', hint: 'Schmelzetemperatur, Wärmeabgabe an die Form', range: ['T_sol − 40', 'T_Guss'], fields: ['T'] },
  { id: 'air', label: 'Lufteinschluss', unit: '%', map: 'bgo', hint: 'mitgerissene Luft (airEntrained) als Anteil der Schmelze, lineare Skala', range: ['0', '100'], fields: ['airEntrained'] },
  { id: 'oxide', label: 'Oxide', unit: 'ppm', map: 'heat', hint: 'Oxidhaut aus Oberflächenalter und Faltung, log. Skala', range: ['0,1', '1000'], fields: ['oxide'] },
  { id: 'trapped', label: 'Eingeschlossene Luft', unit: 'bar', map: 'heat', hint: 'Gasnester ohne Entlüftung, je Nest sein Druck (log. Skala)', range: ['1', '50'], fields: ['luftEin', 'pGas'] },
  { id: 'fillTime', label: 'Füllzeit', unit: 'ms', map: 'heat', hint: 'wann jede Zelle voll war, ab „Kammer voll"; ein Bild am Ende', range: ['0', '…'], fields: [] },
  { id: 'solid', label: 'Erstarrt', unit: '–', map: 'heat', hint: 'Festanteil der Schmelze', range: ['0', '1'], fields: ['solidFraction'] }
];
/** Die Leisten der Bilder: die Vorgabe von ParaView (exakt), die Palette
    hat dieselben Stützstellen für Vorschau und Bericht. */
export const MAP_PRESETS = { rainbow: 'Blue to Red Rainbow', bgo: 'Blue - Green - Orange' };
export const WHEN = [['fill', 'Füllgrad'], ['time', 'Zeit'], ['piston', 'Kolbenweg']];
export const ASPECTS = [['16:9', 16 / 9], ['3:2', 3 / 2], ['4:3', 4 / 3], ['1:1', 1], ['9:16', 9 / 16]];
export const WIDTHS = [1280, 1600, 1920, 2560];
export const VIEW_PRESETS = [
  { id: 'iso', label: 'Schräg', dir: [0.55, -0.6, 0.58], up: [0, 0, 1] },
  { id: 'top', label: 'Von oben (+z)', dir: [0, 0, 1], up: [0, 1, 0] },
  { id: 'bottom', label: 'Von unten (−z)', dir: [0, 0, -1], up: [0, 1, 0] },
  { id: 'front', label: 'Von vorn (−y)', dir: [0, -1, 0], up: [0, 0, 1] }
];
/** Wo im Bild was steht (Anteile von Breite/Höhe, von oben links):
    Farbleiste oben links, Text oben rechts. bilder.py und die Vorschau. */
export const FRAME = { barX: 0.05, barTop: 0.09, barLen: 0.4, barW: 0.012, textRight: 0.015, textTop: 0.02 };

export function defaultPost() {
  return {
    criteria: CRITERIA.map(c => c.id),
    when: { by: 'fill', count: 100 },
    aspect: '16:9', width: 1600,
    preview: 'velocity',
    views: [{ id: 'iso', label: 'Schräg', dir: VIEW_PRESETS[0].dir, up: VIEW_PRESETS[0].up }]
  };
}
/** Ältere Pläne (fills, size) auf die heutige Form bringen. */
export function normalizePost(p) {
  const d = defaultPost(), src = p || {};
  const out = Object.assign({}, d, src);
  /* nach dem, was der Plan selbst hat — nicht nach den eben gesetzten Vorgaben */
  if (!src.when || !src.when.by) out.when = { by: 'fill', count: Array.isArray(src.fills) && src.fills.length ? src.fills.length : d.when.count };
  if (!ASPECTS.some(a => a[0] === out.aspect)) out.aspect = d.aspect;
  if (!(src.width > 0)) out.width = Array.isArray(src.size) && src.size[0] > 0 ? src.size[0] : d.width;
  delete out.fills; delete out.size;
  return out;
}
export function imageSize(post) {
  const p = normalizePost(post);
  const r = (ASPECTS.find(a => a[0] === p.aspect) || ASPECTS[0])[1];
  return [p.width, 2 * Math.round(p.width / r / 2)];
}
/** Die Zielwerte der Bilder: n gleichmäßig verteilt (Füllgrad in %, sonst Anteile 0…1). */
export function targets(post) {
  const p = normalizePost(post);
  const n = Math.max(1, Math.min(200, Math.round(p.when.count)));
  return Array.from({ length: n }, (_, i) => (p.when.by === 'fill' ? Math.round(1000 * (i + 1) / n) / 10 : (i + 1) / n));
}
/** → Liste der Bilder, die bilder.py schreibt (auswertung/bilder/…). */
export function imageList(post) {
  const p = normalizePost(post);
  const out = [], n = targets(p).length;
  for (const v of p.views) for (const c of p.criteria) {
    if (c === 'fillTime') out.push({ view: v.id, crit: c, i: 1, file: v.id + '/' + c + '/001.png' });
    else for (let i = 1; i <= n; i++) out.push({ view: v.id, crit: c, i, file: v.id + '/' + c + '/' + String(i).padStart(3, '0') + '.png' });
  }
  return out;
}
export const imageCount = post => imageList(post).length;

/** Welche Felder die Oberflächen während der Rechnung mitschreiben: immer
    alpha.melt (zum Abschneiden), dazu je gewähltem Kennwert seine. */
export function surfaceFields(post) {
  const p = normalizePost(post);
  const f = ['alpha.melt'];
  for (const c of CRITERIA) if (p.criteria.includes(c.id)) for (const x of c.fields) if (!f.includes(x)) f.push(x);
  return f;
}

/**
 * auswertung.json: alles, was bilder.py und bericht.py wissen müssen.
 * @param cfg {
 *   post (Plan: criteria, when, views …) + heat, maps, colors (payload.js, Zahlen),
 *   title, piston [[t s, mm]], tOffset s, moving, fillFrom s, shot {…}, fields {Tcast, Tsol}, fall {…}
 * }
 */
export function auswertungConfig(cfg) {
  const post = normalizePost(cfg);
  const maps = {};
  for (const [k, preset] of Object.entries(MAP_PRESETS)) {
    const m = cfg.maps && cfg.maps[k];
    maps[k] = Object.assign({ preset }, m ? { stops: m.stops, over: m.over || null } : {});
  }
  return {
    title: cfg.title || 'DieLogic',
    criteria: post.criteria,
    when: post.when, targets: targets(post),
    size: imageSize(post),
    views: post.views.map(v => (v.pos ? { id: v.id, label: v.label, pos: v.pos.map(x => x * 1e-3), target: v.target.map(x => x * 1e-3), up: v.up, fov: v.fov } : { id: v.id, label: v.label, dir: v.dir, up: v.up })),
    frame: FRAME,
    piston: cfg.piston || null, tOffset: cfg.tOffset || 0, moving: !!cfg.moving,
    fillFrom: cfg.fillFrom || 0,      // Rechenzeit von „Kammer voll" [s]: die Füllzeit zählt ab dort
    shot: cfg.shot || null,
    heat: cfg.heat || null,          // [[t, r, g, b]] 0…1, die Leiste heat der Palette
    maps,                            // rainbow, bgo: Vorgabe von ParaView, Stützstellen, Farbe darüber
    colors: cfg.colors || null,      // Rollen der Palette als [r, g, b]
    Tcast: cfg.fields ? cfg.fields.Tcast : 660,
    Tsol: cfg.fields ? cfg.fields.Tsol : 520,
    fall: cfg.fall || null
  };
}
