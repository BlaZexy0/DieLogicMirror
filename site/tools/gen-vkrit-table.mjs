/* Erzeugt aus site/assets/v_krit_sim.csv (OpenFOAM-CFD: kritische
   Kolbengeschwindigkeit über ein (Ø, φ)-Raster) die eingecheckten
   Tabellen-Module für beide Physik-Implementierungen:

     site/app/js/core/vkritTable.js        (Dashboard)
     packages/hpdcsim/hpdcsim/_vkrit_table.py  (Backend)

   Gespeichert wird der dimensionslose Faktor f = V/√(g·D) mit g = 9,81 —
   die Interpolation (bilinear, mit Randregeln) lebt in physics.js bzw.
   geometry.py. Nach Änderungen an der CSV: node site/tools/gen-vkrit-table.mjs */
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const G = 9.81;

const rows = readFileSync(path.join(site, 'assets/v_krit_sim.csv'), 'utf8')
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

writeFileSync(path.join(site, 'app/js/core/vkritTable.js'), `/* GENERIERT aus site/assets/v_krit_sim.csv — nicht von Hand editieren.
   Neu erzeugen: node site/tools/gen-vkrit-table.mjs
   OpenFOAM-CFD-Tabelle der kritischen Kolbengeschwindigkeit:
   VKRIT_F[i][j] = v_krit/√(9,81·D) für VKRIT_D_MM[i], VKRIT_PHI[j]. */

export const VKRIT_D_MM = [${Ds.join(', ')}];
export const VKRIT_PHI = [${phis.map(p => p.toFixed(2)).join(', ')}];
export const VKRIT_F = [
${fRows.map(r => '  ' + r).join(',\n')}
];
`);

writeFileSync(path.join(site, '../packages/hpdcsim/hpdcsim/_vkrit_table.py'), `"""GENERATED from site/assets/v_krit_sim.csv - do not edit by hand.
Regenerate: node site/tools/gen-vkrit-table.mjs
OpenFOAM CFD table of the critical slow-shot velocity:
VKRIT_F[i][j] = v_krit / sqrt(9.81 * D) at VKRIT_D_MM[i], VKRIT_PHI[j]."""

VKRIT_D_MM = [${Ds.join(', ')}]
VKRIT_PHI = [${phis.map(p => p.toFixed(2)).join(', ')}]
VKRIT_F = [
${fRows.map(r => '    ' + r).join(',\n')}
]
`);

console.log('geschrieben: vkritTable.js + _vkrit_table.py (' + Ds.length + ' Ø × ' + phis.length + ' φ)');
