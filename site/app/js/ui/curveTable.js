/* Editierbare Tabelle der Schusskurven-Wegpunkte. */

import { state, notify } from '../core/state.js';

export function renderCurveTable() {
  const body = document.getElementById('curveBody');
  if (!body) return;
  body.textContent = '';
  state.curve.forEach((p, i) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'), td2 = document.createElement('td'), td3 = document.createElement('td');
    const i1 = document.createElement('input'), i2 = document.createElement('input');
    const del = document.createElement('button');
    i1.type = 'number'; i1.step = '10'; i1.value = p[0];
    i1.oninput = () => { state.curve[i][0] = parseFloat(i1.value); notify(); };
    i2.type = 'number'; i2.step = '0.1'; i2.value = p[1];
    i2.oninput = () => { state.curve[i][1] = parseFloat(i2.value); notify(); };
    del.className = 'row-del'; del.title = 'Punkt entfernen'; del.textContent = '✕';
    del.onclick = () => { state.curve.splice(i, 1); renderCurveTable(); notify(); };
    td1.appendChild(i1); td2.appendChild(i2); td3.appendChild(del);
    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3);
    body.appendChild(tr);
  });
}

export function wireAddPoint(btn) {
  btn.onclick = () => {
    const last = state.curve[state.curve.length - 1] || [0, 0];
    state.curve.push([last[0] + 50, last[1]]);
    renderCurveTable();
    notify();
  };
}
