/* Kammerfüllung im gemeinsamen Rahmen: EIN Werkzeug, zwei Rechenverfahren
   (Gitter, Partikel). Eine kleine Kammer mit zweistufiger Kurve, in
   JavaScript: Kolben, Welle, Kammer voll, Luft, Regler. Die Fälle stammen aus
   viewer.test.mjs („Kammerfüllung …" und „Kammerfüllung · Partikel …"); neu
   sind der erreichbare Abbruch, beide Verfahren nebeneinander, die
   Einstellungen und ?engine=sph.

     systemd-run --user --scope -q -p MemoryMax=4G node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/kammerfuellung.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mountPage, wait, kpiText, read, ROOT } from './fixture.mjs';

/* Ergebnisse tragen große Felder — nie mit assert.equal vergleichen. */
const same = (a, b, msg) => assert.ok(a === b, msg);
const seg = (el, value) => el.querySelectorAll('button').find(b => b.dataset.value === value);
const set = (el, val) => { el.value = val; el.dispatch('change'); };
const cells = el => el.querySelectorAll('tbody tr').map(tr => tr.querySelectorAll('td').map(td => td.textContent));
let P;

before(async () => {
  P = await mountPage('kammerfuellung.html', 'js/studio/pages/kammerfuellung.js', { design: true });
});

test('Vier Modi, kein Bauteil-Chip, die Vorgaben stehen in den Feldern, die DieLogic-Kurve steht', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.ready, 'die Seite steht');
  assert.equal(v.gpu, false);
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(b => b.getAttribute('data-mode')), ['kammer', 'kurve', 'simulation', 'ergebnis']);
  assert.equal(shell.mode, 'kammer');
  assert.equal(ui('part').hidden, true, 'keine Quelle — kein Chip');
  /* Die Felder kommen aus dem Zustand: EINE Vorgabe je Größe, deutsch geschrieben. */
  assert.equal(ui('sl-d').value, '90');
  assert.equal(ui('sl-len').value, '450');
  assert.equal(ui('sl-fill').value, '40');
  assert.equal(ui('sl-fill-val').textContent, '40 %');
  assert.equal(ui('sl-ow').value, '30');
  assert.equal(ui('sl-oh').value, '15');
  assert.equal(s.v1, 0.5);
  assert.equal(ui('sl-v1').value, '0,5', 'v₁: 0,5 m/s — im Feld wie im Zustand');
  assert.equal(ui('sl-v2').value, '2');
  assert.equal(ui('sl-a').value, '100');
  assert.match(kpiText(ui('sleeve-kpis')), /Kammervolumen.*cm³.*Kammer voll\s*nach 270 mm/);
  assert.match(kpiText(ui('curve-kpis')), /1\. Phase.*v_krit.*Kammer voll\s*bei \d+ ms.*2\. Phase/, 'die DieLogic-Kurve steht');
  assert.equal(ui('v1v2-block').hidden, true);
  assert.ok(v.sleeveMesh.geometry.getAttribute('position').count > 0 && v.plungerMesh.geometry.getAttribute('position').count > 0);
  /* Einpassen fragt, was JETZT im Bild steht: die Kammer (Mitte bei x = Länge/2). */
  v.view.controls.target.set(-5000, 5000, 0);
  shell.fit();
  assert.ok(Math.abs(v.view.controls.target.x - 225) < 200 && Math.abs(v.view.controls.target.y) < 200, 'zurück bei der Kammer: ' + v.view.controls.target.x);
  shell.setMode('simulation');
  assert.match(ui('estimate').textContent, /Gitter .* (Mio\.|Tsd\.) Zellen · \d+ Zellen über den Durchmesser · .* MB · (grob .*|Stunden) · JavaScript/);
  assert.match(ui('engine-note').textContent, /Kein WebGPU/);
  assert.equal(ui('primary').textContent, 'Simulieren');
  shell.setMode('ergebnis');
  assert.match(ui('result-table').textContent, /Gitter.*Partikel.*Kurve.*Kammer voll, ms.*—.*—.*\d+/);
  assert.equal(ui('playback').hidden, true);
  shell.setMode('kammer');
});

test('Kleine Kammer, zweistufige Kurve — Gitter: ein Lauf in JavaScript bis Kammer voll, Luft, Regler, der Kolben wandert mit', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  set(ui('sl-d'), '40'); set(ui('sl-len'), '120');
  /* Kammer UND Kolben folgen dem Durchmesser (der Kolben blieb einmal bei Ø 90 stehen). */
  for (const m of [v.sleeveMesh, v.plungerMesh]) { m.geometry.computeBoundingBox(); assert.ok(Math.abs(m.geometry.boundingBox.max.y - 20) < 1e-6, 'Radius 20: ' + m.geometry.boundingBox.max.y); }
  /* Der Füllgrad ist zu SEHEN: die ruhende Schmelze steigt mit dem Regler. */
  const spiegel = () => { v.restMesh.geometry.computeBoundingBox(); return v.restMesh.geometry.boundingBox.max.y; };
  const vorher = spiegel();
  ui('sl-fill').value = '45'; ui('sl-fill').dispatch('input');
  assert.equal(s.spec.fill, 0.45);
  assert.ok(v.restMesh.visible && spiegel() > vorher + 0.5 && spiegel() < 0, 'Spiegel bei 45 %: ' + spiegel() + ' (vorher ' + vorher + ')');
  shell.setMode('kurve');
  seg(ui('curve-seg'), 'v1v2').dispatch('click');
  assert.equal(s.curveMode, 'v1v2');
  assert.equal(ui('v1v2-block').hidden, false);
  set(ui('sl-v1'), '0,6'); set(ui('sl-v2'), '2'); set(ui('sl-a'), '100');
  assert.ok(s.curve && s.curve.sFill > 0, 'die zweistufige Kurve steht');
  assert.ok(Math.abs(s.curve.sFill - 0.55 * 120) < 1e-9, 'Kammer voll nach (1 − Füllgrad) · Länge');
  shell.setMode('simulation');
  set(ui('cell'), '5');
  assert.equal(s.h, 5);
  assert.equal(ui('primary').disabled, false);
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen');
  assert.equal(ui('primary').disabled, false);
  await wait(() => !s.running, 4000);
  const r = s.result;
  assert.ok(r, 'ein Ergebnis');
  assert.equal(r.engine, 'lbm');
  assert.equal(r.kernel, 'cpu');
  assert.ok(r.full, 'Kammer voll: ' + r.reason);
  assert.ok(r.full.t > 0.02 && r.full.t < 0.5, 'Kammer voll nach ' + r.full.t + ' s');
  assert.ok(r.full.s > 40 && r.full.s < 120, 'bei ' + r.full.s + ' mm');
  assert.ok(r.snapshots.length > 5, 'Bilder');
  assert.ok(Number.isFinite(r.airMax.air) && r.airMax.air >= 0, 'Luft');
  assert.equal(shell.mode, 'ergebnis');
  const t = cells(ui('result-table'));
  assert.match(t[0][0], /Kammer voll, ms/);
  assert.match(t[0][1], /^\d+$/, 'Gitter: ' + t[0][1]);
  assert.equal(t[0][2], '—', 'Partikel: noch nicht gerechnet');
  assert.match(t[0][3], /^\d+$/, 'die Kurve daneben');
  assert.match(t[2][0], /Luft höchstens/);
  assert.match(t[2][1], /^\d+,\d$/);
  assert.match(t[3][0], /Luft am Ende/);
  assert.match(ui('run-facts').innerHTML, /Ende<\/span><span>Kammer voll/);
  assert.match(ui('note').textContent, /ab Kolbenstart/);
  assert.ok(v.meltMesh.visible, 'die Schmelze ist zu sehen');
  assert.equal(v.restMesh.visible, false, 'die ruhende Schmelze weicht dem Bild des Laufs');
  /* … nach Geschwindigkeit gefärbt: die Skala des Laufs liegt in der Größenordnung des Kolbens. */
  assert.ok(r.vScale > 0.1 && r.vScale < 20, 'Skala der Geschwindigkeit: ' + r.vScale + ' m/s');
  const meltCol = v.meltMesh.geometry.getAttribute('color');
  assert.ok(meltCol && meltCol.count === v.meltMesh.geometry.getAttribute('position').count, 'die Schmelze trägt je Ecke eine Farbe');
  assert.ok(doc.getElementById('colorbar').classList.contains('on'), 'mit Skala');
  assert.match(doc.getElementById('cb-title').textContent, /Geschwindigkeit/);
  /* Der Kolben steht, wo das Bild ist; am Regler zurück fährt er zurück. */
  const xMax = () => { v.plungerMesh.geometry.computeBoundingBox(); return v.plungerMesh.geometry.boundingBox.max.x; };
  assert.ok(xMax() > 30, 'am Ende des Laufs ist der Kolben weit vorn: ' + xMax());
  const sl = ui('t-slider');
  assert.equal(sl.max, String(r.snapshots.length - 1));
  sl.value = '0';
  sl.dispatch('input');
  assert.equal(s.frame, 0);
  assert.match(ui('t-slider-val').textContent, /^0 ms/);
  assert.match(ui('t-info').textContent, /Kolben bei 0 mm · eingeschlossene Luft/);
  assert.ok(Math.abs(xMax()) < 1e-6, 'Bild 0: Kolben in Startlage');
  /* Der Modus besitzt das Bild: woanders keine Schmelze, keine Skala, Kolben in Startlage. */
  sl.value = sl.max; sl.dispatch('input');
  shell.setMode('kammer');
  assert.equal(v.meltMesh.visible, false);
  assert.equal(v.restMesh.visible, true, 'außerhalb des Ergebnisses steht wieder die ruhende Schmelze');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), 'ohne Schmelze keine Skala');
  assert.ok(Math.abs(xMax()) < 1e-6);
  shell.setMode('ergebnis');
  assert.ok(v.meltMesh.visible && doc.getElementById('colorbar').classList.contains('on'));
});

test('Abbruch der Partikelrechnung — auch das Zur-Ruhe-Kommen lässt sich unterbrechen; danach kein Ergebnis', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const gitter = s.results.lbm;
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'sph').dispatch('click');
  assert.equal(ui('cell-label').textContent, 'Partikelabstand');
  set(ui('cell'), '5');
  assert.equal(s.d, 5);
  assert.match(ui('estimate').textContent, /[\d.,]+( Tsd\.)? Partikel · \d+ Partikel über den Durchmesser · .* · JavaScript/);
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen');
  assert.equal(ui('primary').disabled, false);
  /* Mitten im Zur-Ruhe-Kommen den Modus wechseln: Abbrechen und Zeile bleiben. */
  await wait(() => /Ruhe|Rechnet/.test(ui('note').textContent), 400, 5);
  shell.setMode('kammer');
  assert.equal(ui('primary').textContent, 'Abbrechen', 'auch in „Kammer"');
  assert.match(ui('note').textContent, /Ruhe|Rechnet|Partikel/, 'die Zeile gehört dem Fortschritt: ' + ui('note').textContent);
  shell.setMode('simulation');
  ui('primary').dispatch('click');
  await wait(() => !s.running, 400);
  same(s.result, null, 'kein Ergebnis nach dem Abbruch');
  same(s.results.lbm, gitter, 'das Gitterergebnis bleibt');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.equal(ui('primary').textContent, 'Simulieren');
  assert.equal(s.ready, true);
});

test('Partikel: ein Lauf bis Kammer voll — danach stehen Gitter, Partikel und Kurve nebeneinander', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  const r = await v.simulate();
  assert.ok(r, 'ein Ergebnis');
  assert.equal(r.engine, 'sph');
  assert.equal(r.kernel, 'cpu');
  assert.ok(r.settleSteps > 0, 'vorher zur Ruhe gekommen');
  assert.ok(r.full, 'Kammer voll: ' + r.reason);
  assert.ok(r.full.t > 0.02 && r.full.t < 0.5, 'nach ' + r.full.t + ' s');
  assert.ok(r.full.s > 40 && r.full.s < 120, 'bei ' + r.full.s + ' mm');
  assert.ok(r.snapshots.length > 5);
  assert.ok(Number.isFinite(r.airMax.air) && r.airMax.air >= 0);
  assert.ok(r.vScale > 0.1 && r.vScale < 20, 'Skala ' + r.vScale);
  assert.equal(shell.mode, 'ergebnis');
  const t = cells(ui('result-table'));
  assert.match(t[0][1], /^\d+$/, 'Gitter');
  assert.match(t[0][2], /^\d+$/, 'Partikel');
  assert.match(t[0][3], /^\d+$/, 'Kurve');
  /* Beide Verfahren treffen „Kammer voll" in der Nähe der Kurve. */
  const curve = s.curve.tFull;
  for (const id of ['lbm', 'sph']) assert.ok(Math.abs(s.results[id].full.t - curve) < 0.4 * curve, id + ': ' + s.results[id].full.t + ' gegen ' + curve);
  assert.equal(ui('bild-row').hidden, false);
  assert.match(ui('run-facts').innerHTML, /Partikel<\/span>/);
  assert.match(ui('run-facts').innerHTML, /Zur Ruhe/);
  assert.ok(v.points.visible, 'die Partikel sind zu sehen');
  assert.equal(v.meltMesh.visible, false);
  assert.ok(doc.getElementById('colorbar').classList.contains('on'));
  const sl = ui('t-slider');
  assert.equal(sl.max, String(r.snapshots.length - 1));
  sl.value = '0';
  sl.dispatch('input');
  assert.match(ui('t-slider-val').textContent, /^0 ms/);
  seg(ui('bild-seg'), 'lbm').dispatch('click');
  assert.ok(v.meltMesh.visible && !v.points.visible);
  seg(ui('bild-seg'), 'sph').dispatch('click');
  assert.ok(v.points.visible && !v.meltMesh.visible);
});

test('Ein anderes Problem verwirft beide Ergebnisse — auch die Legierung gehört dazu; die Auflösung nicht', () => {
  const { v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.results.lbm && s.results.sph);
  shell.setMode('simulation');
  set(ui('cell'), '6');
  assert.ok(s.results.lbm && s.results.sph, 'ein anderer Partikelabstand lässt die Ergebnisse stehen');
  shell.setMode('kurve');
  ui('alloy').value = 'mg';
  ui('alloy').dispatch('change');
  assert.equal(s.alloy, 'mg');
  same(s.results.lbm, null);
  same(s.results.sph, null);
  shell.setMode('ergebnis');
  assert.equal(ui('playback').hidden, true);
  assert.equal(v.points.visible, false);
  /* Neue Maße: die Auflösung folgt wieder dem Vorschlag. */
  shell.setMode('kammer');
  set(ui('sl-len'), '200');
  assert.equal(s.cell.sph, null);
  assert.equal(s.cell.lbm, null);
  /* Grenzen melden sich selbst. */
  set(ui('sl-d'), '5');
  assert.equal(s.spec.d, 20, 'auf 20 mm begrenzt');
  assert.equal(ui('sl-d').value, '20');
});

test('Einstellungen: gemerkt, zurückzusetzen auf die eine Vorgabe', async () => {
  const { v, ui } = P;
  const s = v.state;
  const KEY = 'studio:kammerfuellung:kammer';
  await wait(() => { const d = globalThis.localStorage.getItem(KEY); return d && JSON.parse(d).doc.spec.d === 20 && JSON.parse(d).doc.alloy === 'mg'; }, 200);
  const doc = v.tool.toJSON();
  assert.equal(doc.format, 'dielogic-kammerfuellung');
  assert.equal(doc.curveMode, 'v1v2');
  assert.equal(doc.v1, 0.6);
  v.tool.resetSettings();
  assert.deepEqual(s.spec, { d: 90, length: 450, fill: 0.4, outletW: 30, outletH: 15 });
  assert.equal(s.curveMode, 'dielogic');
  assert.equal(s.v1, 0.5);
  assert.equal(ui('sl-v1').value, '0,5');
  assert.equal(ui('sl-d').value, '90');
  assert.equal(ui('v1v2-block').hidden, true);
  assert.equal(s.engine, 'lbm');
  assert.equal(ui('cell-label').textContent, 'Zellkante');
  v.tool.fromJSON(doc);
  assert.equal(s.spec.d, 20);
  assert.equal(s.curveMode, 'v1v2');
  assert.equal(ui('sl-v1').value, '0,6');
  assert.equal(s.engine, 'sph');
  assert.throws(() => v.tool.fromJSON({ format: 'dielogic-angussfuellung', version: 1 }), /keine Datei der Kammerfüllung/);
  v.tool.resetSettings();
  globalThis.localStorage.removeItem(KEY);
});

test('?engine=sph wählt die Partikel vor; die alte Partikelseite leitet dorthin; jedes angesprochene Feld gibt es', async () => {
  const Q = await mountPage('kammerfuellung.html', 'js/studio/pages/kammerfuellung.js', { design: true, search: '?engine=sph', variant: 'sph' });
  assert.equal(Q.v.state.engine, 'sph');
  assert.equal(Q.ui('cell-label').textContent, 'Partikelabstand');
  assert.equal(seg(Q.ui('engine-seg'), 'sph').classList.contains('active'), true);
  const html = read('kammerfuellung-sph.html');
  assert.match(html, /http-equiv="refresh" content="0; url=kammerfuellung\.html\?engine=sph"/);
  assert.match(html, /<a href="kammerfuellung\.html\?engine=sph">/);
  assert.doesNotMatch(html, /type="module"/);
  const src = f => readFileSync(resolve(ROOT, f), 'utf8');
  const have = new Set();
  for (const f of ['js/simulation/panel-common.js', 'js/simulation/kammer-panel.js', 'js/studio/shell.js']) {
    for (const m of src(f).matchAll(/data-ui="([^"]+)"/g)) have.add(m[1]);
    for (const m of src(f).matchAll(/ui: '([^']+)'/g)) { have.add(m[1]); have.add(m[1] + '-val'); }
    for (const m of src(f).matchAll(/(?:kpiBlock|warnLine|factsBlock|detailsBlock|field)\('([^']+)'/g)) have.add(m[1]);
  }
  const missing = [];
  for (const f of ['js/simulation/kammer.js', 'js/simulation/core.js']) {
    for (const m of src(f).matchAll(/\bui\('([^']+)'\)/g)) if (!have.has(m[1])) missing.push(f + ': ' + m[1]);
  }
  assert.deepEqual(missing, []);
});
