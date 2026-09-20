/* Kammerfüllung im gemeinsamen Rahmen: EIN Werkzeug, drei Rechenverfahren
   (Gitter, Partikel, Metamodell). Eine kleine Kammer mit zweistufiger Kurve,
   in JavaScript: Kolben, Welle, Kammer voll, Luft, Regler. Die Fälle stammen
   aus viewer.test.mjs („Kammerfüllung …" und „Kammerfüllung · Partikel …");
   neu sind der erreichbare Abbruch, die Verfahren nebeneinander, die
   Einstellungen und ?engine=sph.

   Das Metamodell RECHNET hier nicht (es braucht onnxruntime und 12 MB Modell,
   beides gibt es nur im Browser — tests/browser/studio.spec.mjs): geprüft
   sind seine Wahl, sein fehlendes Auflösungsfeld und seine Grenzen.

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
  /* Der Auslass ist keine Eingabe mehr: er folgt dem Durchmesser und steht nicht im Bild. */
  assert.equal(ui('sl-ow'), null, 'kein Feld für den Laufkanal');
  assert.equal(ui('sl-oh'), null);
  assert.equal(v.state.spec.outletW, undefined, 'auch nicht im Zustand');
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
  /* Die Vorgabe der Kammerfüllung ist das Metamodell: Sekunden statt Minuten. */
  assert.equal(s.engine, 'meta');
  assert.match(ui('estimate').textContent, /Modellgitter 30 × 30 je Schicht .* · WebAssembly/);
  assert.equal(ui('primary').textContent, 'Simulieren');
  shell.setMode('ergebnis');
  /* Die Spalten stehen wie die Schalter, die Vorgabe zuerst; in der engen
     Spalte heißt das Metamodell „Modell" (ENGINES.meta.short). */
  assert.match(ui('result-table').textContent, /Modell.*Gitter.*Partikel.*Kurve.*Kammer voll, ms.*—.*—.*—.*\d+/);
  assert.equal(ui('result-extra').hidden, true);
  /* Der Zeitregler gehört keinem Reiter: er steht im Streifen unter dem Hauptknopf. */
  assert.equal(ui('t-slider').closest('[data-ui="actions"]') !== null, true, 'Zeitregler unter dem Knopf');
  /* Der Streifen STEHT, auch ohne Lauf: ein Kasten, der erst danach erscheint, schöbe den Knopf. */
  assert.equal(ui('actions-extra').hidden, false, 'der Zeitregler steht von Anfang an da');
  assert.equal(ui('t-slider').disabled, true, '… nur stumpf, solange es nichts abzuspielen gibt');
  assert.equal(ui('play').disabled, true);
  assert.equal(ui('t-slider-val'), null, 'keine Zahl hinter dem Regler — die Zeit steht im Bild');
  shell.setMode('kammer');
  assert.equal(ui('primary').textContent, 'Simulieren', '„Simulieren" steht in jedem Modus');
  assert.equal(ui('primary').hidden, false);
});

test('Das Metamodell ist die Vorgabe: kein Feld für die Auflösung, und außerhalb des Trainings rechnet es nicht', () => {
  const { ui, shell, v } = P;
  const s = v.state;
  shell.setMode('simulation');
  assert.deepEqual(ui('engine-seg').querySelectorAll('button').map(b => b.textContent), ['Metamodell', 'Gitter', 'Partikel']);
  assert.equal(seg(ui('engine-seg'), 'meta').classList.contains('active'), true, 'ohne Zutun gewählt');
  assert.equal(s.engine, 'meta');
  /* Das Gitter des Modells STEHT — es gibt nichts einzustellen. */
  assert.equal(ui('cell-row').hidden, true, 'keine Zellkante beim Metamodell');
  assert.match(ui('estimate').textContent, /Modellgitter 30 × 30 je Schicht · 50 Schichten · 101 Kolbenstellungen .* · WebAssembly/);
  assert.equal(ui('engine-warn').textContent, '', 'Ø 90 × 450 mm bei 40 % liegt im Trainingsbereich');
  assert.equal(ui('primary').disabled, false);
  /* Eine Kammer außerhalb der Trainingsbox: der Knopf sagt, woran es liegt, statt zu raten. */
  shell.setMode('kammer');
  set(ui('sl-len'), '1900');                       // λ = 21,1 — das Modell hat bis 20 gesehen
  assert.match(ui('note').textContent, /Außerhalb des Trainings.*Länge\/Durchmesser 21,1 \(gelernt: 5 … 20\).*Gitter oder mit Partikeln/);
  assert.equal(ui('primary').disabled, true);
  set(ui('sl-len'), '450');
  assert.equal(ui('primary').disabled, false);
  /* Zurück zum Gitter: das Feld ist wieder da, mit dem Wert dieses Verfahrens. */
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'lbm').dispatch('click');
  assert.equal(ui('cell-row').hidden, false);
  assert.equal(ui('cell-label').textContent, 'Zellkante');
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
  /* Die Vorgabe ist das Metamodell — für diesen Lauf das Gitter wählen. */
  seg(ui('engine-seg'), 'lbm').dispatch('click');
  assert.equal(s.engine, 'lbm');
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
  assert.equal(t[0][1], '—', 'Metamodell: im Knotentest nicht gerechnet');
  assert.match(t[0][2], /^\d+$/, 'Gitter: ' + t[0][2]);
  assert.equal(t[0][3], '—', 'Partikel: noch nicht gerechnet');
  assert.match(t[0][4], /^\d+$/, 'die Kurve daneben');
  assert.match(t[2][0], /Luft höchstens/);
  assert.match(t[2][2], /^\d+,\d$/, 'die Luft steht in der Gitterspalte');
  assert.match(t[3][0], /Luft am Ende/);
  assert.match(ui('run-facts').innerHTML, /Ende<\/span><span>Kammer voll/);
  assert.match(ui('note').textContent, /^Gerechnet mit [\d,]+ mm in [\d,]+ s\.$/, 'kurz: die Zeile steht in jedem Modus');
  assert.equal(ui('t-slider').disabled, false, 'jetzt gibt es etwas abzuspielen');
  assert.equal(ui('play').disabled, false);
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
  /* Was das Bild zeigt, steht IM Bild (unten links), nicht in der Seitenleiste:
     Zeit, Kolbenweg, seine Geschwindigkeit aus der Kurve und die Luft. */
  const stand = doc.getElementById('status').textContent;
  assert.match(stand, /Kolben 0 mm · v [\d,]+ m\/s · Luft [\d,]+ cm³/, 'Stand im Bild: ' + stand);
  assert.match(stand, /0 ms/, 'mit der Zeit: ' + stand);
  assert.ok(Math.abs(xMax()) < 1e-6, 'Bild 0: Kolben in Startlage');
  /* Der Lauf gehört keinem Reiter: in „Kammer" steht dasselbe Bild, und der
     Regler unter dem Knopf bewegt es dort genauso. */
  sl.value = sl.max; sl.dispatch('input');
  const xEnde = xMax();
  shell.setMode('kammer');
  assert.ok(v.meltMesh.visible, 'die gerechnete Schmelze bleibt sichtbar');
  assert.equal(v.restMesh.visible, false, 'die ruhende Schmelze weicht ihr auch hier');
  assert.ok(doc.getElementById('colorbar').classList.contains('on'), 'mit ihrer Skala');
  assert.ok(Math.abs(xMax() - xEnde) < 1e-6, 'der Kolben steht, wo der Regler steht');
  assert.equal(ui('primary').textContent, 'Simulieren');
  sl.value = '0'; sl.dispatch('input');
  assert.ok(Math.abs(xMax()) < 1e-6, 'Bild 0 auch in „Kammer"');
  /* ▶ läuft DORT, wo der Regler steht — nicht nur unter „Ergebnis". (Solange
     das Abspielen an shell.mode === 'ergebnis' hing, hielt es in jedem anderen
     Modus sofort wieder an: der Knopf tat scheinbar nichts.) */
  ui('play').dispatch('click');
  assert.ok(s.playing, 'es läuft, obwohl „Kammer" offen ist');
  await wait(() => s.frame > 0, 100, 20);
  const gelaufen = s.frame;
  ui('play').dispatch('click');
  assert.equal(s.playing, null, 'ein zweiter Klick hält an');
  await new Promise(r => setTimeout(r, 120));
  assert.equal(s.frame, gelaufen, 'und es bleibt stehen');
  /* Vom Ende aus fängt ▶ wieder vorn an, sonst bewegte sich nichts. */
  sl.value = sl.max; sl.dispatch('input');
  ui('play').dispatch('click');
  assert.ok(s.frame < +sl.max, 'vom Ende springt es zurück an den Anfang');
  ui('play').dispatch('click');
  shell.setMode('ergebnis');
  sl.value = sl.max; sl.dispatch('input');
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
  assert.equal(t[0][1], '—', 'Metamodell: im Knotentest nicht gerechnet');
  assert.match(t[0][2], /^\d+$/, 'Gitter');
  assert.match(t[0][3], /^\d+$/, 'Partikel');
  assert.match(t[0][4], /^\d+$/, 'Kurve');
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
  assert.match(doc.getElementById('status').textContent, /\b0 ms/);
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
  assert.equal(ui('result-extra').hidden, true);
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
  assert.deepEqual(s.spec, { d: 90, length: 450, fill: 0.4 });
  assert.equal(s.curveMode, 'dielogic');
  assert.equal(s.v1, 0.5);
  assert.equal(ui('sl-v1').value, '0,5');
  assert.equal(ui('sl-d').value, '90');
  assert.equal(ui('v1v2-block').hidden, true);
  assert.equal(s.engine, 'meta', 'zurückgesetzt wird auf die Vorgabe');
  assert.equal(ui('cell-row').hidden, true, '… und die hat kein Auflösungsfeld');
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
