/* Angussfüllung im gemeinsamen Rahmen: EIN Werkzeug, zwei Rechenverfahren
   (Gitter, Partikel). Unter Node gibt es kein WebGPU — die JavaScript-Kerne
   rechnen, auf grobem Gitter und mit wenigen Partikeln, durch dieselbe Kette
   wie im Browser. Die Fälle stammen aus viewer.test.mjs („Angussfüllung …"
   und „Angussfüllung · Partikel …"); neu sind der erreichbare Abbruch, beide
   Verfahren nebeneinander, die Einstellungen und ?engine=sph.

     systemd-run --user --scope -q -p MemoryMax=4G node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/angussfuellung.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mountPage, wait, kpiText, read, ROOT } from './fixture.mjs';

/* Ergebnisse tragen große Felder — nie mit assert.equal vergleichen
   (eine scheiternde Gegenüberstellung druckt sie aus; siehe wandstaerke.test.mjs). */
const same = (a, b, msg) => assert.ok(a === b, msg);
const seg = (el, value) => el.querySelectorAll('button').find(b => b.dataset.value === value);
const set = (el, val) => { el.value = val; el.dispatch('change'); };
let P;

before(async () => {
  P = await mountPage('angussfuellung.html', 'js/studio/pages/angussfuellung.js', { design: true });
});

test('Vier Modi, der Anguss-Chip statt des Bauteils, Kurve und Aufwand stehen', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.ready && s.graph, 'das Beispiel steht');
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').map(b => b.getAttribute('data-mode')), ['system', 'prozess', 'simulation', 'ergebnis']);
  assert.equal(shell.mode, 'system');
  /* Die Quelle sitzt, wo auf den anderen Seiten das Bauteil sitzt. */
  assert.equal(ui('part').hidden, false, 'der Chip der Kopfzeile ist da');
  assert.equal(ui('part-label').textContent, 'Anguss');
  assert.match(ui('part-name').textContent, /Zwei Anschnitte/);
  assert.ok(doc.getElementById('demo-select').innerHTML.includes('oelwanne'), 'die Beispiele des Angussdesigners');
  assert.match(doc.getElementById('stl-btn').textContent, /Angussdatei/);
  assert.match(kpiText(ui('graph-kpis')), /Anschnitte\s*2.*Pressrest\s*Ø/);
  /* Prozess: die Kurve, „Kammer voll" genau einmal mit Zahl. */
  assert.match(kpiText(ui('curve-kpis')), /Füllkammer.*Kammer voll\s*bei \d+ ms.*2\. Phase/);
  assert.equal(ui('curve-warn').textContent, '');
  /* Simulation: Gitter ist vorgewählt, die Zeile sagt, was es kostet und womit. */
  assert.equal(v.gpu, false, 'unter Node gibt es kein WebGPU');
  assert.equal(s.engine, 'lbm');
  assert.equal(ui('cell-label').textContent, 'Zellkante');
  assert.match(ui('estimate').textContent, /Gitter \d+ × \d+ × \d+ = [\d.,]+ (Mio\.|Tsd\.) Zellen · .* MB · (grob .*|Stunden) · JavaScript/);
  assert.match(ui('engine-note').textContent, /Kein WebGPU/, 'die Seite sagt es');
  assert.equal(ui('engine-warn').textContent, '');
  /* „Simulieren" steht in JEDEM Modus — der Lauf gehört zum Werkzeug, nicht zu einem Reiter. */
  assert.equal(ui('primary').hidden, false);
  assert.equal(ui('primary').textContent, 'Simulieren');
  shell.setMode('simulation');
  assert.equal(ui('primary').textContent, 'Simulieren');
  assert.equal(ui('primary').disabled, false);
  /* Ergebnis ohne Lauf: die 1D-Rechnung steht schon da, die Verfahren fehlen; nichts Totes. */
  shell.setMode('ergebnis');
  assert.match(ui('result-table').textContent, /Gitter.*Partikel.*1D.*Anschnitt k\d+.*—.*—.*\d,\d/);
  assert.equal(ui('result-extra').hidden, true, 'kein „Zeigen" ohne Bild');
  assert.equal(ui('primary').textContent, 'Simulieren', 'im Ergebnis ohne Lauf wird er angeboten');
  assert.equal(ui('note').textContent, 'Noch nicht gerechnet.', 'die Zeile bleibt besetzt — leer wandert der Knopf');
  /* Anzeigeoptionen stehen unter „Darstellung". */
  assert.equal(doc.getElementById('viewport').querySelector('.view-bar [data-darstellung]').hidden, false);
  assert.ok(ui('opacity'));
  shell.setMode('system');
  /* Einpassen (F, Knopf, Doppelklick) fragt, was JETZT im Bild steht: Anguss und Pressrest. */
  v.view.controls.target.set(5000, 5000, 5000);
  shell.fit();
  const t = v.view.controls.target;
  assert.ok(Math.hypot(t.x, t.y, t.z) < 1000, 'zurück beim Anguss: ' + [t.x, t.y, t.z].map(Math.round).join(', '));
});

test('Gitter: ein Lauf in JavaScript bis zur Ankunft — Tabelle, Bild, Regler, Ankunftsfarben; der Modus besitzt das Bild', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  shell.setMode('simulation');
  /* Grob, damit der Lauf Sekunden dauert — aber nicht so grob, dass ein
     Kanal von zwei Zellen Breite dichtmacht. */
  set(ui('cell'), '6');
  assert.equal(s.h, 6);
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen', 'während des Laufs heißt der Hauptknopf Abbrechen');
  assert.equal(ui('primary').disabled, false, '… und ist zu erreichen');
  await wait(() => !s.running, 6000);
  const r = s.result;
  assert.ok(r, 'ein Ergebnis');
  assert.equal(r.engine, 'lbm');
  assert.equal(r.kernel, 'cpu');
  assert.equal(r.reason, 'alle Anschnitte erreicht', r.reason);
  assert.equal(r.gates.length, 2);
  for (const gt of r.gates) {
    assert.ok(Number.isFinite(gt.tSim) && gt.tSim > 0.002 && gt.tSim < 0.05, gt.id + ': ' + gt.tSim);
    assert.ok(Number.isFinite(gt.t1d), 'mit 1D-Vergleich');
  }
  assert.ok(r.snapshots.length > 3, 'Bilder des Füllstands');
  assert.ok(r.filled > 0.5, 'der Anguss ist am Ende weitgehend voll: ' + r.filled);
  assert.equal(shell.mode, 'ergebnis', 'wer simuliert, landet beim Ergebnis');
  /* Steht das Ergebnis, lädt der Knopf nicht mehr ein: Umriss statt Farbe, und die Zeile sagt,
     was der Lauf gekostet hat. */
  assert.equal(ui('primary').hidden, false);
  assert.ok(ui('primary').className.includes('btn-outline'), 'Umriss: ' + ui('primary').className);
  assert.match(ui('note').textContent, /^Gerechnet mit [\d,]+ mm in [\d,]+ s\.$/, 'kurz: die Zeile steht in jedem Modus');
  /* Die Tabelle: Gitter mit Zahlen, Partikel noch leer, 1D daneben, unten die Spreizung. */
  const rows = ui('result-table').querySelectorAll('tbody tr').map(tr => tr.querySelectorAll('td').map(td => td.textContent));
  assert.equal(rows.length, 3);
  for (const row of rows.slice(0, 2)) {
    assert.match(row[0], /Anschnitt k\d+/);
    assert.match(row[1], /^\d+,\d$/, 'Gitter: ' + row[1]);
    assert.equal(row[2], '—', 'Partikel: noch nicht gerechnet');
    assert.match(row[3], /^\d+,\d$/, '1D: ' + row[3]);
  }
  assert.match(rows[2][0], /Δ erster/);
  assert.equal(ui('bild-row').hidden, true, 'ein Verfahren — nichts zu wählen');
  assert.match(ui('run-facts').innerHTML, /JavaScript/);
  assert.match(ui('run-facts').innerHTML, /Ende<\/span><span>alle Anschnitte erreicht/);
  /* Die Schmelze: nach Geschwindigkeit gefärbt, mit Skala in m/s. */
  assert.ok(v.meltMesh.visible, 'die Schmelze ist zu sehen');
  assert.ok(r.uScale > 0 && r.vScale > 0.05 && r.vScale < 100, 'Skala der Geschwindigkeit: ' + r.vScale + ' m/s');
  assert.ok(r.snapshots[r.snapshots.length - 1].speed instanceof Uint8Array, 'jedes Bild trägt die Geschwindigkeit');
  const meltCol = v.meltMesh.geometry.getAttribute('color');
  assert.ok(meltCol && meltCol.count === v.meltMesh.geometry.getAttribute('position').count, 'die Schmelze trägt je Ecke eine Farbe');
  assert.ok(doc.getElementById('colorbar').classList.contains('on'), 'mit Skala');
  assert.match(doc.getElementById('cb-title').textContent, /Geschwindigkeit/);
  assert.match(doc.getElementById('cb-ticks').innerHTML, /m\/s/);
  assert.equal(ui('result-extra').hidden, false);
  assert.equal(ui('t-slider').max, String(r.snapshots.length - 1));
  /* Regler zurück: am Anfang steht die Schmelze im Pressrest. */
  const sl = ui('t-slider');
  sl.value = '0';
  sl.dispatch('input');
  assert.equal(s.frame, 0);
  assert.match(doc.getElementById('status').textContent, /0 ms/, 'die Zeit steht im Bild');
  assert.match(doc.getElementById('status').textContent, /Anguss zu .* gefüllt/, 'der Stand steht im Bild');
  /* Ankunftsfarben: das Netz des Angusses trägt Farben, die Skala gehört der Ankunft. */
  seg(ui('show-seg'), 'ankunft').dispatch('click');
  assert.equal(s.show, 'ankunft');
  assert.ok(v.runnerMesh.geometry.getAttribute('color'), 'je Ecke eine Farbe');
  assert.equal(v.meltMesh.visible, false);
  assert.match(doc.getElementById('cb-title').textContent, /Ankunft/);
  assert.equal(ui('t-slider').disabled, true, 'ohne Schmelze ist der Zeitregler stumpf — er bewegte nichts');
  /* Der Modus besitzt sein Bild: woanders steht nur der Anguss, ohne Skala. */
  shell.setMode('prozess');
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'), 'außerhalb des Ergebnisses keine Skala');
  same(v.runnerMesh.material.vertexColors, false, 'und der Anguss ist wieder einfarbig');
  shell.setMode('ergebnis');
  assert.match(doc.getElementById('cb-title').textContent, /Ankunft/, 'zurück im Ergebnis: wie verlassen');
  seg(ui('show-seg'), 'schmelze').dispatch('click');
  assert.match(doc.getElementById('cb-title').textContent, /Geschwindigkeit/);
  assert.ok(v.meltMesh.visible);
  assert.equal(ui('t-slider').disabled, false);
});

test('Abbruch: der Knopf ist während des Laufs zu erreichen, danach gibt es kein Ergebnis — das andere Verfahren behält seines', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const gitter = s.results.lbm;
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'sph').dispatch('click');
  assert.equal(s.engine, 'sph');
  assert.equal(ui('cell-label').textContent, 'Partikelabstand');
  assert.match(ui('estimate').textContent, /[\d.,]+( Tsd\.)? Partikel \(Pressrest und Säule für \d+ mm Kolbenweg\) · .* · JavaScript/);
  set(ui('cell'), '8');
  assert.equal(s.d, 8);
  same(s.results.lbm, gitter, 'die Auflösung der Partikel lässt das Gitterergebnis stehen');
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  assert.equal(ui('primary').textContent, 'Abbrechen');
  assert.equal(ui('primary').disabled, false, 'der Fehler der alten Seiten: dort war der Knopf während des Laufs gesperrt');
  assert.equal(ui('progress').hidden, false, 'mit Fortschritt');
  /* Erst abbrechen, wenn die Schritte laufen — der Abbruch muss den Kern erreichen. */
  await wait(() => /Rechnet/.test(ui('note').textContent), 2400);
  /* Ein Moduswechsel mitten im Lauf: „Abbrechen" und die Fortschrittszeile
     bleiben — in jedem Modus, auch in dem ohne eigenen Hauptknopf. */
  for (const m of ['system', 'prozess', 'ergebnis']) {
    shell.setMode(m);
    assert.equal(ui('primary').hidden, false, m + ': der Knopf steht');
    assert.equal(ui('primary').textContent, 'Abbrechen', m + ': und heißt Abbrechen');
    assert.equal(ui('primary').disabled, false, m);
    assert.match(ui('note').textContent, /Rechnet/, m + ': die Zeile gehört dem Fortschritt, gleich nach dem Wechsel');
    assert.equal(ui('progress').hidden, false, m + ': mit Balken');
  }
  /* Abgebrochen wird im Ergebnis — nicht dort, wo gestartet wurde. */
  const t0 = performance.now();
  ui('primary').dispatch('click');
  await wait(() => !s.running, 400);
  assert.ok(performance.now() - t0 < 3000, 'der Abbruch wirkt sofort, nicht erst am nächsten Bild: ' + Math.round(performance.now() - t0) + ' ms');
  same(s.result, null, 'kein Ergebnis nach dem Abbruch');
  same(s.results.sph, null);
  same(s.results.lbm, gitter, 'das Gitterergebnis bleibt');
  assert.equal(s.ready, true);
  assert.equal(shell.mode, 'ergebnis', 'wer abbricht, bleibt, wo er ist');
  assert.match(ui('note').textContent, /Abgebrochen/);
  assert.equal(ui('primary').textContent, 'Simulieren');
  assert.equal(ui('progress').hidden, true);
  shell.setMode('simulation');
  assert.match(ui('note').textContent, /Abgebrochen/, 'auch in der Simulation');
  assert.equal(ui('primary').textContent, 'Simulieren');
});

test('Partikel: ein Lauf in JavaScript — danach stehen Gitter und Partikel nebeneinander, „Bild" wählt', async () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.equal(s.engine, 'sph');
  /* Grob und kurz, damit der Lauf Sekunden dauert: 8 mm Partikel in Kanälen
     von zwei Partikeln Tiefe, 25 ms statt der dreifachen 1D-Zeit. */
  s.tMax = 0.025;
  const r = await v.simulate();
  assert.ok(r, 'ein Ergebnis');
  same(s.result, r);
  assert.equal(r.engine, 'sph');
  assert.equal(r.kernel, 'cpu');
  assert.equal(r.gates.length, 2);
  assert.ok(r.snapshots.length > 3, 'Bilder');
  assert.ok(r.nFluid > 100 && r.nInflow > 100, 'Pressrest ' + r.nFluid + ', Säule ' + r.nInflow);
  for (const gt of r.gates) if (Number.isFinite(gt.tSim)) assert.ok(gt.tSim > 0.002 && gt.tSim < 0.03, gt.id + ': ' + gt.tSim);
  assert.ok(r.filled > 0.1, 'der Anguss füllt sich: ' + r.filled);
  assert.ok(r.snapshots[r.snapshots.length - 1].n > r.nFluid, 'aus der Säule ist Schmelze geworden');
  assert.ok(r.vScale > 0.5 && r.vScale < 200, 'Skala ' + r.vScale + ' m/s');
  assert.equal(shell.mode, 'ergebnis');
  /* Nebeneinander: beide Spalten tragen jetzt Werte, die der Partikel ist die gezeigte. */
  assert.ok(s.results.lbm && s.results.sph, 'beide Verfahren zum selben Problem');
  const head = ui('result-table').querySelectorAll('th').map(th => [th.textContent, th.getAttribute('class') || '']);
  assert.deepEqual(head.map(h => h[0]), ['', 'Gitter', 'Partikel', '1D']);
  assert.equal(head[1][1], '', 'Gitter: gerechnet, nicht gezeigt');
  assert.equal(head[2][1], 'shown');
  const first = ui('result-table').querySelector('tbody tr').querySelectorAll('td').map(td => td.textContent);
  assert.match(first[1], /^\d+,\d$/, 'Gitter ' + first[1]);
  assert.match(first[2], /^(\d+,\d|nie)$/, 'Partikel ' + first[2]);
  assert.equal(ui('bild-row').hidden, false, 'zwei Ergebnisse — „Bild" wählt');
  assert.equal(seg(ui('bild-seg'), 'sph').classList.contains('active'), true);
  assert.match(ui('run-details').querySelector('summary').textContent, /Partikel/);
  assert.match(ui('run-facts').innerHTML, /Pressrest \+ Säule/);
  /* Das Bild: Partikel, Ort und Farbe je Partikel; keine Ankunftsfarben. */
  assert.ok(v.points.visible, 'die Partikel sind zu sehen');
  assert.equal(v.meltMesh.visible, false);
  const pa = v.points.geometry.getAttribute('position'), ca = v.points.geometry.getAttribute('color');
  assert.ok(pa.count > 100 && ca.count === pa.count, 'Ort und Farbe je Partikel');
  assert.match(doc.getElementById('cb-title').textContent, /Geschwindigkeit/);
  assert.equal(ui('show-row').hidden, true, 'Ankunftsfarben kennt nur das Gitter — beim Bild der Partikel gibt es nichts zu wählen');
  const sl = ui('t-slider');
  assert.equal(sl.max, String(r.snapshots.length - 1));
  /* Der Platz reicht für das größte Bild und wird EINMAL angelegt: gezeichnet
     wird, was das Bild hat (setDrawRange). Vorher kam je Bild mit anderer
     Partikelzahl ein neues Feld, und das alte blieb auf der Karte liegen. */
  const most = r.snapshots.reduce((m, sn) => Math.max(m, sn.n), 0);
  const platz = v.points.geometry.getAttribute('position');
  assert.equal(platz.count, most, 'Platz für das größte Bild');
  sl.value = '0';
  sl.dispatch('input');
  same(v.points.geometry.getAttribute('position'), platz, 'dasselbe Feld, auch bei weniger Partikeln');
  assert.equal(v.points.geometry.drawRange.count, r.nFluid, 'am Anfang nur der Pressrest');
  for (const k of [1, 2, r.snapshots.length - 1]) {
    sl.value = String(k); sl.dispatch('input');
    same(v.points.geometry.getAttribute('position'), platz, 'Bild ' + k + ': kein neues Feld');
    assert.equal(v.points.geometry.drawRange.count, r.snapshots[k].n, 'Bild ' + k + ': gezeichnet wird, was es hat');
  }
  sl.value = '0'; sl.dispatch('input');
  /* „Bild": zum Gitter und zurück. */
  seg(ui('bild-seg'), 'lbm').dispatch('click');
  assert.ok(v.meltMesh.visible && !v.points.visible, 'jetzt die Fläche der Gitterrechnung');
  assert.equal(ui('show-row').hidden, false);
  assert.match(ui('run-details').querySelector('summary').textContent, /Gitter/);
  assert.equal(ui('t-slider').max, String(s.results.lbm.snapshots.length - 1));
  /* „Ankunft" gewählt und dann das Bild der Partikel: keine tote Ansicht — dort gilt die Schmelze. */
  seg(ui('show-seg'), 'ankunft').dispatch('click');
  assert.match(doc.getElementById('cb-title').textContent, /Ankunft/);
  seg(ui('bild-seg'), 'sph').dispatch('click');
  assert.ok(v.points.visible && !v.meltMesh.visible);
  assert.match(doc.getElementById('cb-title').textContent, /Geschwindigkeit/);
  assert.equal(seg(ui('show-seg'), 'schmelze').classList.contains('active'), true);
  same(v.runnerMesh.material.vertexColors, false, 'der Anguss ist wieder durchscheinend');
  seg(ui('bild-seg'), 'lbm').dispatch('click');
  assert.match(doc.getElementById('cb-title').textContent, /Ankunft/, 'zurück beim Gitter gilt die Wahl wieder');
  seg(ui('show-seg'), 'schmelze').dispatch('click');
  seg(ui('bild-seg'), 'sph').dispatch('click');
  assert.ok(v.points.visible && !v.meltMesh.visible);
});

test('Ein anderes Problem verwirft beide Ergebnisse', () => {
  const { doc, v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.results.lbm && s.results.sph);
  shell.setMode('prozess');
  set(ui('chamber-len'), '600');
  assert.equal(s.proc.chamberLen, 600);
  assert.equal(s.timeline.v.length, 600);
  same(s.results.lbm, null, 'Gitter');
  same(s.results.sph, null, 'Partikel');
  shell.setMode('ergebnis');
  assert.equal(ui('result-extra').hidden, true);
  assert.equal(ui('bild-row').hidden, true);
  assert.equal(v.points.visible, false);
  assert.ok(!doc.getElementById('colorbar').classList.contains('on'));
  assert.equal(ui('primary').textContent, 'Simulieren');
  /* Zu fein: der Knopf sagt, warum er nicht geht. */
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'lbm').dispatch('click');
  set(ui('cell'), '0,5');
  assert.equal(ui('primary').disabled, true);
  assert.match(ui('note').textContent, /^Zu fein: höchstens [\d,]+ Mio\. Zellen\.$/, 'unter dem Knopf in einer Zeile');
  assert.match(ui('engine-warn').textContent, /^Zu fein: .* Die Zellkante vergrößern\.$/, 'hier mit dem Rat');
  set(ui('cell'), '6');
  assert.equal(ui('primary').disabled, false);
});

/* Die Legierung von hier gilt auch für die Kurve, wie im Angussdesigner:
   bis zum 23.09. rechnete die Angussfüllung die Kolbenkurve (und die
   1D-Spalte) still mit der Legierung des Projekts. */
test('Legierung: die Kurve rechnet mit der Legierung von hier, wie im Angussdesigner', () => {
  const { v, ui, shell } = P;
  const s = v.state;
  shell.setMode('prozess');
  const rho0 = s.timeline.v.density;
  set(ui('alloy'), 'zn');
  assert.ok(s.timeline && !s.timeline.error, 'Kurve: ' + s.curveError);
  assert.equal(s.timeline.v.density, 6200, 'die Schmelzdichte von Zamak 5');
  set(ui('alloy'), 'al');
  assert.equal(s.timeline.v.density, rho0, 'Aluminium: es bleibt bei den Werten des Projekts');
});

test('Eine Angussdatei als Quelle; Fremdes wird abgewiesen', async () => {
  const { v, ui, host } = P;
  const s = v.state;
  const G = await import(pathToFileURL(resolve(ROOT, 'js/runner/graph.js')));
  const { DEMOS } = await import(pathToFileURL(resolve(ROOT, 'js/runner/presets.js')));
  const obj = G.toJSON(DEMOS.find(d => d.id === 'vier').build());
  host.openJSON(obj, 'mein-anguss.json');
  assert.equal(s.name, 'mein-anguss');
  assert.equal(ui('part-name').textContent, 'mein-anguss');
  assert.match(ui('graph-note').textContent, /Geladen: mein-anguss\.json/);
  assert.match(kpiText(ui('graph-kpis')), /Anschnitte\s*4/);
  assert.equal(ui('result-table').querySelectorAll('tbody tr').length, 5, 'vier Anschnitte und die Spreizung');
  /* Eine Werkbankdatei bringt ihren Prozess mit. */
  host.openJSON({ format: 'dielogic-werkbank', anguss: obj, prozess: { volume: 777 } }, 'bank.json');
  assert.equal(s.proc.volume, 777);
  assert.equal(ui('vol').value, '777');
  assert.throws(() => host.openJSON({ format: 'dielogic-ueberlauf', version: 1 }, 'falsch.json'), /keine Angussdatei/);
  assert.match(ui('graph-warn').textContent, /falsch\.json/);
  v.pickDemo('zwei');
  assert.equal(ui('graph-warn').textContent, '');
  /* Zum Beispiel gehören SEINE gemerkten Einstellungen — samt Prozess; der der Datei galt der Datei. */
  assert.equal(s.proc.volume, 420);
  assert.equal(ui('vol').value, '420');
  assert.match(ui('toast').textContent, /Einstellungen vom .* übernommen/);
});

/* Was aus einer Datei kommt, ist Text. Eine Angussdatei mit dem Anschnitt
   „<img src=x onerror=…>" lief am 2026-09-22 in Firefox als Skript: die Zeile
   „Anschnitt …" der Tabelle ging roh in innerHTML. js/runner/graph.js weist
   solche Namen inzwischen ab — hier wird der Graph deshalb von Hand gebaut. */
test('Namen aus der Datei sind Text: ein Anschnitt „<img …>" steht als Text in der Tabelle', async () => {
  const { v, ui, host } = P;
  const s = v.state;
  const { DEMOS } = await import(pathToFileURL(resolve(ROOT, 'js/runner/presets.js')));
  const { compareTable } = await import(pathToFileURL(resolve(ROOT, 'js/simulation/table.js')));
  const boese = '<img src=x onerror="globalThis.__xss = 1">';
  const g = DEMOS.find(d => d.id === 'zwei').build();
  const gate = Object.values(g.nodes).find(n => n.type === 'gate');
  const alt = gate.id;
  delete g.nodes[alt];
  gate.id = boese;
  g.nodes[boese] = gate;
  for (const n of Object.values(g.nodes)) n.children = n.children.map(c => (c === alt ? boese : c));
  v.adoptGraph(g, 'boese', null, 'test-boese');
  const tab = ui('result-table');
  assert.equal(tab.querySelectorAll('img').length, 0, 'kein Bild, kein Skript');
  assert.ok(tab.innerHTML.includes('&lt;img src=x onerror=&quot;'), 'maskiert: ' + tab.innerHTML.slice(0, 200));
  assert.ok(tab.textContent.includes('Anschnitt ' + boese), 'der Name steht, wie er heißt');
  assert.equal(globalThis.__xss, undefined);
  /* Die Tabelle selbst nimmt nur Text — Bezeichnung, Spalte, Zelle, Überschrift. */
  const el = globalThis.document.createElement('div');
  compareTable(el, { caption: '<b>c</b>', cols: [{ label: '<i>x</i>' }], rows: [{ label: 'a & b', cells: ['<script>1</script>'] }] });
  assert.equal(el.querySelectorAll('b, i, script').length, 0);
  assert.match(el.innerHTML, /&lt;b&gt;c&lt;\/b&gt;.*&lt;i&gt;x&lt;\/i&gt;.*a &amp; b.*&lt;script&gt;1&lt;\/script&gt;/);
  /* Der Dateiname steht nur als Text (Hinweiszeile, Chip). */
  const G = await import(pathToFileURL(resolve(ROOT, 'js/runner/graph.js')));
  host.openJSON(G.toJSON(DEMOS.find(d => d.id === 'zwei').build()), '<img src=y>.json');
  assert.equal(ui('graph-note').querySelectorAll('img').length, 0);
  assert.equal(ui('graph-note').textContent, 'Geladen: <img src=y>.json');
  assert.equal(ui('part-name').querySelectorAll('img').length, 0);
  v.pickDemo('zwei');
  assert.equal(s.name, DEMOS.find(d => d.id === 'zwei').label);
});

test('Eine Änderung während des Laufs bricht ihn ab — und die Zeile sagt, warum', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'lbm').dispatch('click');
  set(ui('cell'), '6');
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  await wait(() => /Rechnet/.test(ui('note').textContent), 2400);
  shell.setMode('prozess');
  const vorher = s.proc.volume;
  set(ui('vol'), '500');
  await wait(() => !s.running, 400);
  same(s.results.lbm, null, 'kein Ergebnis zum alten Problem');
  assert.equal(ui('note').textContent, 'Abgebrochen: „Gussvolumen" wurde geändert.');
  assert.equal(ui('primary').textContent, 'Simulieren');
  /* „Abbrechen" gedrückt heißt weiter nur so. */
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  await wait(() => /Rechnet/.test(ui('note').textContent), 2400);
  ui('primary').dispatch('click');
  await wait(() => !s.running, 400);
  assert.equal(ui('note').textContent, 'Abgebrochen: es gibt kein Ergebnis.');
  set(ui('vol'), String(vorher));
});

/* Im Hintergrund kommt requestAnimationFrame nie: bis 2026-09-22 stand ein
   Lauf dort still, bis man zurückkam, und lernte danach die Wartezeit als
   Tempo (engines/env.js). Hier ruft die Attrappe ihre Bilder nie auf. */
test('Im verborgenen Reiter rechnet der Lauf weiter — und lehrt kein Tempo', async () => {
  const { v, ui, shell, doc } = P;
  const s = v.state;
  const env = await import(pathToFileURL(resolve(ROOT, 'js/simulation/engines/env.js')));
  const tempo = env.tempo('lbm', 'cpu');
  const raf = globalThis.requestAnimationFrame, liegen = [];
  globalThis.requestAnimationFrame = fn => { liegen.push(fn); return liegen.length; };
  doc.hidden = true; doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange');
  try {
    shell.setMode('simulation');
    seg(ui('engine-seg'), 'lbm').dispatch('click');
    set(ui('cell'), '6');
    s.tMax = 0.006;
    ui('primary').dispatch('click');
    await wait(() => s.running, 100, 5);
    await wait(() => !s.running, 800);
    assert.ok(s.results.lbm, 'fertig, obwohl kein Bild kam: ' + (s.failed || ui('note').textContent));
    assert.ok(s.results.lbm.steps > 10, 'Schritte: ' + s.results.lbm.steps);
    assert.equal(env.tempo('lbm', 'cpu'), tempo, 'verborgen gelernt wird nichts');
  } finally {
    doc.hidden = false; doc.visibilityState = 'visible';
    doc.dispatch('visibilitychange');
    globalThis.requestAnimationFrame = raf;
    for (const fn of liegen) raf(fn);
  }
});

test('Einstellungen: je Angusssystem gemerkt, still übernommen, zurückzusetzen', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const KEY = 'studio:angussfuellung:beispiel-zwei';
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'sph').dispatch('click');
  set(ui('cell'), '7');
  await wait(() => { const d = globalThis.localStorage.getItem(KEY); return d && JSON.parse(d).doc.cell.sph === 7 && JSON.parse(d).doc.engine === 'sph'; }, 200);
  const doc = v.tool.toJSON();
  assert.equal(doc.format, 'dielogic-angussfuellung');
  assert.deepEqual(doc.cell, { lbm: 6, sph: 7 });
  /* Ein anderes System beginnt mit dem Vorschlag; zurück beim ersten kommt das Gemerkte wieder. */
  v.pickDemo('vier');
  assert.equal(s.cell.sph, null, 'neues System: die Auflösung folgt dem Vorschlag');
  v.pickDemo('zwei');
  assert.equal(s.cell.sph, 7);
  assert.equal(s.engine, 'sph');
  assert.equal(ui('cell').value, '7');
  assert.match(ui('toast').textContent, /Einstellungen vom .* übernommen/);
  ui('toast').querySelector('.st-toast-act').dispatch('click');
  assert.equal(s.cell.sph, null, 'zurückgesetzt');
  assert.equal(s.engine, 'lbm');
  assert.equal(ui('cell-label').textContent, 'Zellkante');
  same(globalThis.localStorage.getItem(KEY), null, 'und das Gemerkte ist weg');
  assert.throws(() => v.tool.fromJSON({ format: 'dielogic-anguss', version: 1 }), /keine Datei der Angussfüllung/);
});

test('?engine=sph wählt die Partikel vor — auch gegen gemerkte Einstellungen', async () => {
  globalThis.localStorage.setItem('studio:angussfuellung:beispiel-zwei', JSON.stringify({
    v: 1, when: Date.now(), part: 'beispiel-zwei',
    doc: { format: 'dielogic-angussfuellung', version: 1, engine: 'lbm', cell: { lbm: 9, sph: null }, proc: { alloy: 'al', volume: 420, chamberLen: 450 }, show: 'schmelze', opacity: 0.3 }
  }));
  const Q = await mountPage('angussfuellung.html', 'js/studio/pages/angussfuellung.js', { design: true, search: '?engine=sph', variant: 'sph' });
  assert.equal(Q.v.state.engine, 'sph', 'die Adresse gewinnt');
  assert.equal(Q.v.state.cell.lbm, 9, 'der Rest des Gemerkten kommt');
  assert.equal(Q.ui('cell-label').textContent, 'Partikelabstand');
  assert.equal(seg(Q.ui('engine-seg'), 'sph').classList.contains('active'), true);
  assert.match(Q.ui('estimate').textContent, /Partikel/);
  globalThis.localStorage.removeItem('studio:angussfuellung:beispiel-zwei');
});

test('Die alte Partikelseite leitet weiter; jedes angesprochene Feld gibt es', () => {
  const html = read('angussfuellung-sph.html');
  assert.match(html, /http-equiv="refresh" content="0; url=angussfuellung\.html\?engine=sph"/);
  assert.match(html, /<a href="angussfuellung\.html\?engine=sph">/, 'ein schlichter Link für den Fall, dass nichts weiterleitet');
  assert.doesNotMatch(html, /type="module"/, 'kein Werkzeug mehr auf dieser Seite');
  /* ui('x') ↔ data-ui="x": in den eigenen Feldern oder im Gerüst des Rahmens. */
  const src = f => readFileSync(resolve(ROOT, f), 'utf8');
  const have = new Set();
  for (const f of ['js/simulation/panel-common.js', 'js/simulation/anguss-panel.js', 'js/studio/shell.js', 'js/studio/rows.js']) {
    for (const m of src(f).matchAll(/data-ui="([^"]+)"/g)) have.add(m[1]);
    for (const m of src(f).matchAll(/ui: '([^']+)'/g)) { have.add(m[1]); have.add(m[1] + '-val'); }
    for (const m of src(f).matchAll(/(?:kpiBlock|warnLine|factsBlock|detailsBlock)\('([^']+)'/g)) have.add(m[1]);
  }
  const missing = [];
  for (const f of ['js/simulation/anguss.js', 'js/simulation/core.js']) {
    for (const m of src(f).matchAll(/\bui\('([^']+)'\)/g)) if (!have.has(m[1])) missing.push(f + ': ' + m[1]);
  }
  assert.deepEqual(missing, []);
});
