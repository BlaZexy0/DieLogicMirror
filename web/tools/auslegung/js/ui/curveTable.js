/* Schusskurven-UI: Modus-Umschalter (Punkte / DieLogic / V₁-V₂), die
   V₁/V₂-Parameterfelder und die Wegpunkt-Tabelle. In den generierten Modi
   ist die Tabelle schreibgeschützt — die Punkte kommen aus core/curvegen.js. */

import { state, notify } from '../core/state.js';

const MODES = [['points', 'Punkte'], ['lopez', 'DieLogic'], ['v1v2', 'V₁ / V₂']];

const NOTES = {
  points: 'Wegpunkte als Weg s [mm] / Kolbengeschwindigkeit v [m/s]. Zwischen den Punkten wird konstant beschleunigt; der Ursprung (0 mm, 0 m/s) wird automatisch ergänzt.',
  lopez: 'DieLogic-Kurve: Anfahrt nach López-Faura-Hernández (Profil P5 der Theorie „Nebenbedingungen") bis v_krit, Plateau bis „Kammer voll", dann Rampe mit a_max auf v₂ — so gewählt, dass die Füllzeit ab Anschnitt samt Rampe die empfohlene NADCA-Füllzeit trifft (höchstens v_max; reicht a_max nicht, fährt die Kurve die schnellste mögliche 2. Phase und sagt es). Die Punkte werden aus den Eingaben erzeugt.',
  v1v2: 'Rampe mit a₁ auf V₁, Plateau bis „Kammer voll", Rampe mit a₂ auf V₂ bis zum Schussende. Die Punkte werden aus den Eingaben erzeugt.'
};

const PARAMS = [
  ['v1', 'V₁', 'm/s'], ['a1', 'a₁', 'm/s²'],
  ['v2', 'V₂', 'm/s'], ['a2', 'a₂', 'm/s²']
];

/* Modus-Tabs + Parameterfelder einmalig in die Kurven-Gruppe einbauen. */
function ensureModeUI() {
  const group = document.getElementById('curve-group');
  if (!group || group.querySelector('#curveModeTabs')) return;

  const tabs = document.createElement('div');
  tabs.className = 'tabs cgen-tabs';
  tabs.id = 'curveModeTabs';
  MODES.forEach(([m, label]) => {
    const b = document.createElement('button');
    b.dataset.mode = m;
    b.textContent = label;
    b.onclick = () => {
      state.curveGen.mode = m;
      renderCurveTable();
      notify();
    };
    tabs.appendChild(b);
  });

  const params = document.createElement('div');
  params.className = 'cgen-fields';
  params.id = 'curveGenParams';
  PARAMS.forEach(([k, label, unit]) => {
    const f = document.createElement('div');
    f.className = 'field';
    f.innerHTML = '<label>' + label + ' <span class="unit">' + unit + '</span></label>';
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = 'any'; inp.min = '0';
    inp.dataset.gen = k;
    inp.oninput = () => {
      state.curveGen[k] = parseFloat(inp.value);
      notify();
    };
    f.appendChild(inp);
    params.appendChild(f);
  });

  const note = group.querySelector('.curve-note');
  group.insertBefore(tabs, note);
  group.insertBefore(params, note);
}

/* genError: Fehlertext des Generators (nur generierte Modi). */
export function renderCurveTable(genError = null) {
  const body = document.getElementById('curveBody');
  if (!body) return;
  ensureModeUI();

  const mode = state.curveGen.mode;
  const generated = mode !== 'points';

  const tabs = document.getElementById('curveModeTabs');
  if (tabs) tabs.querySelectorAll('button').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));

  const params = document.getElementById('curveGenParams');
  if (params) {
    params.style.display = mode === 'v1v2' ? '' : 'none';
    params.querySelectorAll('input[data-gen]').forEach(inp => {
      if (document.activeElement !== inp) inp.value = state.curveGen[inp.dataset.gen];
    });
  }

  const note = document.querySelector('#curve-group .curve-note');
  if (note) note.innerHTML = NOTES[mode]
    + (genError ? ' <span class="cgen-error">⚠ ' + genError + '</span>' : '');

  const addBtn = document.getElementById('addPoint');
  if (addBtn) addBtn.style.display = generated ? 'none' : '';

  body.textContent = '';
  state.curve.forEach((p, i) => {
    const tr = document.createElement('tr');
    const td1 = document.createElement('td'), td2 = document.createElement('td'), td3 = document.createElement('td');
    const i1 = document.createElement('input'), i2 = document.createElement('input');
    i1.type = 'number'; i1.step = '10'; i1.value = p[0];
    i2.type = 'number'; i2.step = '0.1'; i2.value = p[1];
    if (generated) {
      i1.disabled = i2.disabled = true;
    } else {
      i1.oninput = () => { state.curve[i][0] = parseFloat(i1.value); notify(); };
      i2.oninput = () => { state.curve[i][1] = parseFloat(i2.value); notify(); };
      const del = document.createElement('button');
      del.className = 'row-del'; del.title = 'Punkt entfernen'; del.textContent = '✕';
      del.onclick = () => { state.curve.splice(i, 1); renderCurveTable(); notify(); };
      td3.appendChild(del);
    }
    td1.appendChild(i1); td2.appendChild(i2);
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
