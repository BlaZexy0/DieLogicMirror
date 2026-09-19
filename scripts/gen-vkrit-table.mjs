/* Erzeugt aus fixtures/vkrit/v_krit_sim.csv (OpenFOAM-CFD: kritische
   Kolbengeschwindigkeit über ein (Ø, φ)-Raster) das eingecheckte
   Tabellen-Modul des Dashboards:

     web/tools/auslegung/js/core/vkritTable.js

   Gespeichert wird der dimensionslose Faktor f = V/√(g·D) mit g = 9,81 —
   die Interpolation (bilinear, mit Randregeln) lebt in physics.js.
   Nach Änderungen an der CSV: node scripts/gen-vkrit-table.mjs */
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web');
const G = 9.81;

const rows = readFileSync(path.join(site, '../fixtures/vkrit/v_krit_sim.csv'), 'utf8')
  .trim().split('\n').slice(1).map(l => l.split(';').map(Number));

const Ds = [...new Set(rows.map(r => r[0]))].sort((a, b) => a - b);
const phis = [...new Set(rows.map(r => r[1]))].sort((a, b) => a - b);
const F = Ds.map(() => phis.map(() => NaN));
for (const [D, phi, V] of rows) {
  const i = Ds.indexOf(D), j = phis.indexOf(phi);
  F[i][j] = V / Math.sqrt(G * D / 1000);
}
for (let i = 0; i < Ds.length; i++) for (let j = 0; j < phis.length; j++) {
  if (!isFinite(F[i][j])) throw new Error('Lücke im Raster: D=' + Ds[i] + ' φ=' + phis[j]);
}

const fRows = F.map(r => '[' + r.map(v => v.toFixed(5)).join(', ') + ']');

writeFileSync(path.join(site, 'tools/auslegung/js/core/vkritTable.js'), `/* GENERIERT aus fixtures/vkrit/v_krit_sim.csv — nicht von Hand editieren.
   Neu erzeugen: node scripts/gen-vkrit-table.mjs
   OpenFOAM-CFD-Tabelle der kritischen Kolbengeschwindigkeit:
   VKRIT_F[i][j] = v_krit/√(9,81·D) für VKRIT_D_MM[i], VKRIT_PHI[j]. */

/* Die Konstante, mit der die Tabelle normiert WURDE. Wer die Tabelle liest,
   muss mit derselben entnormieren — sonst weicht jeder v_krit-Wert
   systematisch ab (mit der Normfallbeschleunigung 9,80665 um den Faktor
   1 + 1,708e-4 auf jedem Wert). */
export const VKRIT_GRAVITY = ${G};

export const VKRIT_D_MM = [${Ds.join(', ')}];
export const VKRIT_PHI = [${phis.map(p => p.toFixed(2)).join(', ')}];
export const VKRIT_F = [
${fRows.map(r => '  ' + r).join(',\n')}
];
`);

console.log('geschrieben: vkritTable.js (' + Ds.length + ' Ø × ' + phis.length + ' φ)');
