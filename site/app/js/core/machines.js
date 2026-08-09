/* Liest die Maschinen-Presets aus config/machines.js (setzt
   window.__MACHINES__ per klassischem <script>-Tag — funktioniert über
   http UND file://). Das Array wird mutiert, nicht ersetzt, damit importierte
   Referenzen in jedem Lademodus gültig bleiben. */

export const machines = [];

export async function loadMachines() {
  const data = window.__MACHINES__;
  if (!data) throw new Error('config/machines.js nicht geladen (window.__MACHINES__ fehlt).');
  machines.length = 0;
  (data.machines || []).forEach(m => machines.push(m));
  return machines;
}

export function machineById(id) {
  return machines.find(m => m.id === id) || null;
}
