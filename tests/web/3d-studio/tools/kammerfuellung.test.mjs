/* Kammerfüllung im gemeinsamen Rahmen: EIN Werkzeug, drei Rechenverfahren
   (Gitter, Partikel, Metamodell). Eine kleine Kammer mit zweistufiger Kurve,
   in JavaScript: Kolben, Welle, Kammer voll, Luft, Regler. Die Fälle stammen
   aus viewer.test.mjs („Kammerfüllung …" und „Kammerfüllung · Partikel …");
   neu sind der erreichbare Abbruch, die Verfahren nebeneinander, die
   Einstellungen und ?engine=sph.

   Das Metamodell rechnet hier mit dem echten Modell (3,6 MB) und
   onnxruntime-web aus vendor/, wie im Browser — nur liest fetch die file:-
   Adressen selbst (siehe meta.test.mjs). Ein Lauf der Vorgabe dauert rund
   drei Sekunden; geprüft sind dazu seine Wahl, sein fehlendes
   Auflösungsfeld und seine Grenzen, auch die der Kurven.

     systemd-run --user --scope -q -p MemoryMax=4G node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/kammerfuellung.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mountPage, wait, kpiText, read, ROOT, same, seg, set } from './fixture.mjs';

const require = createRequire(import.meta.url);

/* Ergebnisse tragen große Felder — nie mit assert.equal vergleichen, deshalb same(). */
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
  assert.match(kpiText(ui('curve-kpis')), /1\. Phase.*krit.*Kammer voll\s*bei \d+ ms.*2\. Phase/, 'die DieLogic-Kurve steht');
  /* v_krit mit tiefgestelltem „krit", wie in der Hilfe — kein Unterstrich. */
  assert.match(ui('curve-kpis').innerHTML, /v<sub>krit<\/sub> [\d,]+ m\/s/);
  assert.doesNotMatch(ui('curve-kpis').innerHTML, /v_krit/);
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
  /* Unter dem Knopf in EINER Zeile (sie steht in jedem Modus), ausführlich im Modus „Simulation". */
  assert.equal(ui('note').textContent, 'Länge/Durchmesser 21,1, gelernt 5 … 20.');
  assert.equal(ui('primary').disabled, true);
  shell.setMode('simulation');
  assert.match(ui('engine-warn').textContent, /^Außerhalb des Trainings: Länge\/Durchmesser 21,1 \(gelernt: 5 … 20\)\. Mit dem Gitter oder mit Partikeln rechnen\.$/);
  shell.setMode('kammer');
  set(ui('sl-len'), '450');
  assert.equal(ui('primary').disabled, false);
  /* Zurück zum Gitter: das Feld ist wieder da, mit dem Wert dieses Verfahrens. */
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'lbm').dispatch('click');
  assert.equal(ui('cell-row').hidden, false);
  assert.equal(ui('cell-label').textContent, 'Zellkante');
  shell.setMode('kammer');
});

test('Wegpunkte wie im Dashboard: die Kurve des Projekts kommt mit, Zeilen lassen sich ändern, anhängen, entfernen', () => {
  const { ui, shell, v } = P;
  const s = v.state;
  shell.setMode('kurve');
  assert.deepEqual(ui('curve-seg').querySelectorAll('button').map(b => b.textContent), ['DieLogic', 'v₁ / v₂', 'Punkte']);
  seg(ui('curve-seg'), 'punkte').dispatch('click');
  assert.equal(s.curveMode, 'punkte');
  assert.equal(ui('punkte-block').hidden, false);
  assert.equal(ui('v1v2-block').hidden, true);
  /* Beim ersten Umschalten stehen die Punkte des Projekts da. */
  assert.deepEqual(s.points, [[60, 0.4], [475, 0.4], [640, 4.5], [834, 4.5]]);
  const zeilen = () => ui('punkte-liste').querySelectorAll('.kf-punkt');
  assert.equal(zeilen().length, 4);
  assert.ok(s.curve, 'die Kurve steht: ' + s.curveError);
  const vorher = s.curve.tFull;

  /* Eine Geschwindigkeit ändern — deutsch geschrieben. */
  const feld = ui('punkte-liste').querySelectorAll('input').find(i => i.getAttribute('data-punkt') === '1' && i.getAttribute('data-feld') === '1');
  feld.value = '0,9';
  feld.dispatch('change');
  assert.equal(s.points[1][1], 0.9);
  assert.ok(s.curve.tFull < vorher, 'schneller gefüllt: ' + s.curve.tFull + ' gegen ' + vorher);

  /* Anhängen: 50 mm weiter, dieselbe Geschwindigkeit — wie im Dashboard. */
  ui('punkt-plus').dispatch('click');
  assert.equal(zeilen().length, 5);
  assert.deepEqual(s.points[4], [884, 4.5]);
  /* Entfernen. */
  ui('punkte-liste').querySelectorAll('button').find(b => b.getAttribute('data-loesch') === '4').dispatch('click');
  assert.equal(zeilen().length, 4);

  /* Ein Weg, der nicht zunimmt, ist keine Kurve — und sagt es. */
  const weg = ui('punkte-liste').querySelectorAll('input').find(i => i.getAttribute('data-punkt') === '2' && i.getAttribute('data-feld') === '0');
  weg.value = '10';
  weg.dispatch('change');
  assert.equal(s.curve, null);
  assert.match(ui('curve-warn').textContent, /Weg muss von Punkt zu Punkt zunehmen/);
  weg.value = '640';
  weg.dispatch('change');
  assert.ok(s.curve);

  /* Zurück zur DieLogic-Kurve: die Punkte bleiben gemerkt. */
  seg(ui('curve-seg'), 'dielogic').dispatch('click');
  assert.equal(ui('punkte-block').hidden, true);
  assert.equal(s.points.length, 4);
  shell.setMode('kammer');
});

test('Wegpunkte: geklemmt wie v₁ und v₂, an Ort und Stelle — der Fokus bleibt; eine Datei mit anderen Punkten gilt', () => {
  const { ui, shell, v, doc } = P;
  const s = v.state;
  const gemerkt = v.tool.toJSON();
  shell.setMode('kurve');
  seg(ui('curve-seg'), 'punkte').dispatch('click');
  const felder = () => ui('punkte-liste').querySelectorAll('input');
  const vorher = felder();
  const feld = (i, f) => felder().find(el => el.getAttribute('data-punkt') === String(i) && el.getAttribute('data-feld') === String(f));
  /* Zu schnell: auf 12 m/s geklemmt, und das Feld sagt es wie numberInput. */
  const v1 = feld(1, 1);
  v1.focus();
  v1.value = '99';
  v1.dispatch('change');
  assert.equal(s.points[1][1], 12);
  assert.equal(v1.value, '12');
  const note = v1.parentNode.querySelector('.clamp-note');
  assert.ok(note && note.classList.contains('on'), 'mit Hinweis');
  assert.equal(note.textContent, 'auf 12 m/s begrenzt (0–12 m/s)');
  /* Über die ganze Zeile des Rasters: das steht im Stylesheet, nicht mehr im Element. */
  assert.ok(note.closest('.kf-punkt'), 'der Hinweis sitzt in der Punktzeile');
  assert.match(readFileSync(new URL('../../../../web/tools/3d-studio/css/studio.css', import.meta.url), 'utf8'),
    /\.kf-punkt \.clamp-note \{ grid-column: 1 \/ -1; padding-left: 0; \}/, 'über die ganze Zeile des Rasters');
  /* Die Liste steht noch: dieselben Felder, der Fokus auf demselben — mit Tab
     ginge es von hier zum nächsten, das es noch gibt. */
  const nachher = felder();
  assert.equal(nachher.length, vorher.length);
  for (let k = 0; k < vorher.length; k++) same(nachher[k], vorher[k], 'Feld ' + k + ' ist dasselbe');
  same(doc.activeElement, v1, 'der Fokus bleibt');
  assert.ok(ui('punkte-liste').contains(doc.activeElement));
  /* Zu weit: auf 2000 mm. Unlesbares wird rot, der Wert bleibt. */
  const s3 = feld(3, 0);
  s3.value = '5000'; s3.dispatch('change');
  assert.equal(s.points[3][0], 2000);
  assert.equal(s3.value, '2000');
  s3.value = 'viel'; s3.dispatch('change');
  assert.ok(s3.classList.contains('bad'));
  assert.equal(s.points[3][0], 2000, 'der letzte gültige Wert bleibt');
  s3.value = '900'; s3.dispatch('change');
  assert.ok(!s3.classList.contains('bad'));
  /* Anhängen und Entfernen bauen die Liste neu — der Fokus landet, wo man weitermacht. */
  ui('punkt-plus').dispatch('click');
  same(doc.activeElement, feld(4, 0), 'im Weg des neuen Punkts');
  ui('punkte-liste').querySelectorAll('button').find(b => b.getAttribute('data-loesch') === '4').dispatch('click');
  assert.equal(felder().length, 8);
  same(doc.activeElement, ui('punkte-liste').querySelector('[data-loesch="3"]'), 'beim ✕ davor');

  /* Eine Datei, die sich NUR in den Wegpunkten unterscheidet: ihre Kurve gilt —
     Kennzahlen, Tabelle und der nächste Lauf, nicht nur die Liste. */
  const t12 = s.curve.tFull;
  v.tool.fromJSON({ ...v.tool.toJSON(), points: [[60, 0.4], [475, 0.4], [640, 4.5], [834, 4.5]] });
  assert.equal(feld(1, 1).value, '0,4', 'die Liste zeigt die Punkte der Datei');
  assert.ok(Math.abs(s.curve.tFull - 0.825) < 1e-9, 'und die Kurve ist ihre: ' + s.curve.tFull + ' (vorher ' + t12 + ')');
  assert.match(kpiText(ui('curve-kpis')), /Kammer voll\s*bei 825 ms/);
  assert.equal(cells(ui('result-table'))[0][4], '825');
  v.tool.fromJSON(gemerkt);
  assert.equal(s.curveMode, 'dielogic');
  shell.setMode('kammer');
});

test('Eine Kurve, die vor „Kammer voll" endet: es wird nie erreicht, und gerechnet wird nicht', () => {
  const { ui, shell, v } = P;
  const s = v.state;
  const gemerkt = v.tool.toJSON();
  shell.setMode('kurve');
  v.tool.fromJSON({ ...gemerkt, curveMode: 'punkte', points: [[60, 0.4], [208, 0.4]] });
  assert.ok(s.curve, 'die Kurve selbst steht');
  assert.ok(Number.isNaN(s.curve.tFull), 'Kammer voll: nie');
  /* Bis 2026-09-22 stand hier „bei 625 ms" — die Zeit des letzten Punkts. */
  assert.match(kpiText(ui('curve-kpis')), /Kammer voll\s*wird nicht erreicht\s*die Kurve müsste bis 270 mm reichen/);
  assert.doesNotMatch(kpiText(ui('curve-kpis')), /Kammer voll\s*bei/);
  const kurve = cells(ui('result-table')).map(r => r[4]);
  assert.deepEqual(kurve.slice(0, 2), ['nie', 'nie'], 'die Spalte der Kurve sagt es auch');
  const grund = 'Die Kurve endet vor „Kammer voll" (208 mm).';
  for (const id of ['meta', 'lbm', 'sph']) {
    shell.setMode('simulation');
    seg(ui('engine-seg'), id).dispatch('click');
    assert.equal(ui('primary').disabled, true, id + ': gesperrt');
    assert.equal(ui('note').textContent, grund, id);
  }
  v.tool.fromJSON(gemerkt);
  assert.equal(ui('primary').disabled, false);
  shell.setMode('kammer');
});

test('Das Metamodell kennt nur die Kurven seines Trainings: der Knopf nennt Größe und Grenze', async () => {
  const { ui, shell, v } = P;
  const s = v.state;
  const { ENGINES } = await import(pathToFileURL(resolve(ROOT, 'js/simulation/core.js')));
  const { buildProfile } = await import(pathToFileURL(resolve(ROOT, '../auslegung/js/core/physics.js')));
  const problem = (spec, pts) => {
    const sFill = (1 - spec.fill) * spec.length, profile = buildProfile(pts);
    return { kind: 'kammer', spec, curve: { profile, sFill, tFull: profile.atPos(sFill / 1000).t } };
  };
  const ø90 = { d: 90, length: 450, fill: 0.4 };
  /* Ausführlich (Modus „Simulation") — und kurz für unter den Knopf: höchstens 46 Zeichen,
     so viele passen in Firefox wie in Chromium in EINE Zeile. */
  const kurz = [];
  const why = (pts, spec = ø90) => {
    const est = ENGINES.meta.estimate(problem(spec, pts));
    if (est.blocked) { kurz.push(est.blockedShort); assert.ok(est.blockedShort.length <= 46, 'eine Zeile: ' + est.blockedShort); }
    return est.blocked;
  };
  /* Die Wegpunkte des Projekts liegen im Training (a ≈ 0,14 g, bis 0,53 Fr_c). */
  assert.equal(why([[60, 0.4], [475, 0.4], [640, 4.5]]), '');
  /* Zu schnell: gelernt bis 1,05 · Fr_c(φ) · √(gD) = 0,79 m/s bei Ø 90 und 40 %. */
  assert.match(why([[250, 1], [300, 1]]), /^Außerhalb des Trainings: Kolbengeschwindigkeit 1 m\/s \(gelernt: bis 0,79 m\/s\)\. Mit dem Gitter oder mit Partikeln rechnen\.$/);
  /* Zu steil: jede Rampe höchstens 0,5 g. */
  assert.match(why([[1.3, 0.5], [300, 0.5]]), /Beschleunigung 96 m\/s² \(gelernt: bis 4,9 m\/s²\)/);
  /* Langsamer werden kam nicht vor. */
  assert.match(why([[100, 0.6], [200, 0.3], [300, 0.3]]), /Kolben bremst von 0,6 auf 0,3 m\/s \(gelernt: nie langsamer\)/);
  /* Aus dem Stand, nicht fliegend. */
  assert.match(why([[0, 0.5], [300, 0.5]]), /Start mit 0,5 m\/s \(gelernt: aus dem Stand\)/);
  /* Zu langsam: ab 5 % des Wegs wenigstens 0,1 · Fr_c. */
  assert.match(why([[250, 0.1], [300, 0.5]]), /^Außerhalb des Trainings: Kolben bei 14 mm 0,02 m\/s \(gelernt: ab 0,08 m\/s\)\./);
  /* Zu lang: bis Kammer voll höchstens t·√(g/D) = 60 (Ø 60 × 1200 bei 30 %: 4,7 s). */
  assert.match(why([[10, 0.1], [900, 0.1]], { d: 60, length: 1200, fill: 0.3 }), /^Außerhalb des Trainings: Kammer voll nach 8,5 s \(gelernt: bis 4,7 s\)\./);
  assert.deepEqual(kurz, [
    '1. Phase bis 1 m/s, gelernt bis 0,79 m/s.', 'Beschleunigung 96 m/s², gelernt bis 4,9 m/s².', 'Kolben bremst auf 0,3 m/s: nie gelernt.',
    'Start mit 0,5 m/s, gelernt aus dem Stand.', 'Bei 14 mm erst 0,02 m/s, gelernt ab 0,08 m/s.', 'Kammer voll nach 8,5 s, gelernt bis 4,7 s.'
  ]);
  /* Wer run() selbst ruft, bekommt dieselbe Antwort — ohne dass das Modell lädt. */
  await assert.rejects(ENGINES.meta.run(problem(ø90, [[250, 1], [300, 1]]), {}), /Außerhalb des Trainings: Kolbengeschwindigkeit/);

  /* Im Werkzeug: v₁ = 1,5 m/s (der Fall vom 2026-09-22: „Kammer voll 0 ms"). */
  const gemerkt = v.tool.toJSON();
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'meta').dispatch('click');
  shell.setMode('kurve');
  seg(ui('curve-seg'), 'v1v2').dispatch('click');
  set(ui('sl-a'), '4');
  assert.equal(ui('primary').disabled, false, 'v₁ = 0,5 m/s mit 4 m/s²: gelernt');
  /* So sanft erreicht die 2. Phase v₂ nicht mehr vor dem Schussende: das sagt die Kennzahl, keine
     eigene Warnzeile (für drei Zeilen mehr hat der Modus mit v₁ / v₂ keinen Platz). */
  assert.equal(ui('curve-warn').textContent, '');
  assert.match(kpiText(ui('curve-kpis')), /2\. Phase\s*v₂ 1,16 m\/s\s*statt 2 m\/s: a erhöhen oder v₂ senken/);
  assert.equal(ui('curve-kpis').querySelectorAll('.krow.warn').length, 1);
  /* Die Vorgabe der zweistufigen Kurve (100 m/s²) ist steiler, als das Modell es
     kennt: die Rampe auf v₁ liegt auf 1,3 mm (die Kurve rundet auf 0,1 mm). */
  set(ui('sl-a'), '100');
  assert.equal(ui('note').textContent, 'Beschleunigung 96 m/s², gelernt bis 4,9 m/s².');
  set(ui('sl-v1'), '1,5');
  assert.equal(ui('primary').disabled, true);
  assert.equal(ui('note').textContent, '1. Phase bis 1,5 m/s, gelernt bis 0,79 m/s.', 'die erste Grenze, in einer Zeile');
  shell.setMode('simulation');
  assert.equal(ui('engine-warn').textContent, 'Außerhalb des Trainings: Kolbengeschwindigkeit 1,5 m/s (gelernt: bis 0,79 m/s); Beschleunigung 100 m/s² (gelernt: bis 4,9 m/s²). Mit dem Gitter oder mit Partikeln rechnen.', 'hier alle');
  v.tool.fromJSON(gemerkt);
  assert.equal(s.curveMode, 'dielogic');
  assert.equal(ui('primary').disabled, false, 'die DieLogic-Kurve liegt im Training');
  shell.setMode('kammer');
});

test('Eine Änderung während des Laufs: abgebrochen, und die Zeile nennt das Feld', async () => {
  const { ui, shell, v } = P;
  const s = v.state;
  const gemerkt = v.tool.toJSON();
  shell.setMode('simulation');
  seg(ui('engine-seg'), 'lbm').dispatch('click');
  ui('primary').dispatch('click');
  await wait(() => s.running, 100, 5);
  await wait(() => /Rechnet/.test(ui('note').textContent), 400);
  shell.setMode('kammer');
  ui('sl-fill').value = '45'; ui('sl-fill').dispatch('input');
  await wait(() => !s.running, 400);
  same(s.results.lbm, null);
  assert.equal(ui('note').textContent, 'Abgebrochen: „Füllgrad" wurde geändert.');
  v.tool.fromJSON(gemerkt);
  assert.equal(s.spec.fill, 0.4);
  assert.equal(ui('note').textContent, 'Noch nicht gerechnet.', 'ein neues Problem: die alte Meldung geht');
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

/* Das echte Modell durch die Seite: onnxruntime-web aus vendor/ (unter Node
   mit dem WebAssembly aus der Datei), Beilage und Modell über fetch — hier
   hinter einem Tor, damit „Abbrechen" beim ersten Laden zu prüfen ist. */
test('Metamodell mit dem echten Modell: „Abbrechen" wartet nicht aufs Laden, dann die Welle der Vorgabe', async () => {
  const { v, ui, shell } = P;
  const s = v.state;
  const VENDOR = resolve(ROOT, 'vendor/onnxruntime');
  const ort = require(resolve(VENDOR, 'ort.wasm.min.js'));
  ort.env.wasm.wasmBinary = readFileSync(resolve(VENDOR, 'ort-wasm-simd-threaded.wasm'));
  globalThis.ort = ort;
  const base = globalThis.fetch;
  let auf;
  const tor = new Promise(r => { auf = r; });
  globalThis.fetch = async url => {
    if (!String(url).startsWith('file:')) return base(url);
    await tor;
    const buf = readFileSync(fileURLToPath(url));
    return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  };
  try {
    v.tool.resetSettings();
    shell.setMode('simulation');
    assert.equal(s.engine, 'meta');
    assert.equal(ui('engine-note').textContent, 'Das Modell (3,6 MB) und sein Rechenwerk (14 MB) werden beim ersten Lauf geladen.');
    /* Abbrechen, während Beilage und Modell noch kommen: das Warten endet sofort. */
    ui('primary').dispatch('click');
    await wait(() => s.running && /Modell laden/.test(s.progressText), 100, 5);
    const t0 = performance.now();
    ui('primary').dispatch('click');
    await wait(() => !s.running, 100, 10);
    assert.ok(performance.now() - t0 < 1000, 'sofort: ' + Math.round(performance.now() - t0) + ' ms');
    assert.equal(ui('note').textContent, 'Abgebrochen: es gibt kein Ergebnis.');
    same(s.results.meta, null);
    /* Das Laden lief weiter; der nächste Lauf nimmt es. */
    auf();
    ui('primary').dispatch('click');
    await wait(() => s.running, 100, 5);
    await wait(() => !s.running, 2400);
    const r = s.results.meta;
    assert.ok(r, 'ein Ergebnis: ' + s.failed);
    assert.equal(r.engine, 'meta');
    assert.equal(r.snapshots.length, 101);
    /* Das Fenster der Stirnplatte meldet „Kammer voll" nahe der Kurve (Ø 90 × 450, 40 %, DieLogic). */
    const cv = s.curve;
    assert.ok(r.full, 'Kammer voll: ' + r.reason);
    assert.ok(r.full.t > 0.6 * cv.tFull && r.full.t < 1.2 * cv.tFull, 'Kammer voll bei ' + r.full.t + ' s, Kurve ' + cv.tFull);
    assert.ok(r.full.s > 0.6 * cv.sFill && r.full.s <= cv.sFill, 'bei ' + r.full.s + ' mm, Kurve ' + cv.sFill);
    /* Die Zeit steht nie still: jede Stellung hat ihre (die Kurve reicht bis „Kammer voll"). */
    for (let k = 1; k < r.snapshots.length; k++) assert.ok(r.snapshots[k].t > r.snapshots[k - 1].t, 'Stellung ' + k);
    assert.ok(Number.isFinite(r.airMax.air) && r.airMax.air >= 0, 'Luft ' + r.airMax.air);
    /* Die Skala: das 99. Perzentil über die Schmelze (α ≥ ½), nicht über jede Zelle mit etwas α. */
    const { speedScale } = await import(pathToFileURL(resolve(ROOT, 'js/lbm/paint.js')));
    const bisVoll = r.snapshots.filter(sn => sn.t <= r.full.t);
    assert.ok(Math.abs(r.vScale - speedScale(bisVoll, 0.99, 128)) < 1e-12, 'Skala ' + r.vScale);
    assert.ok(r.vScale < speedScale(bisVoll, 0.99), 'ohne die Luft kleiner: ' + r.vScale + ' gegen ' + speedScale(bisVoll, 0.99));
    assert.ok(r.vScale > 0.2 && r.vScale < 3, 'in der Größe des Kolbens: ' + r.vScale + ' m/s');
    /* Die Zahl der Rechnungen kommt aus der Beilage. */
    assert.match(ui('run-facts').innerHTML, /Gelernt aus<\/span><span>285 OpenFOAM-Rechnungen/);
    const t = cells(ui('result-table'));
    assert.match(t[0][1], /^\d+$/, 'Modell: ' + t[0][1]);
    assert.match(t[2][1], /^\d+,\d$/, 'Luft: ' + t[2][1]);
    /* Danach steht die Aufwandszeile neu (core.js vergisst die Schätzung nach
       jedem Lauf): kein „wird geladen" mehr, und „grob …" mit dem gelernten Tempo. */
    shell.setMode('simulation');
    assert.equal(ui('engine-note').textContent, '', 'das Modell ist da');
    assert.match(ui('estimate').textContent, /Modellgitter .* · grob \d+ s · WebAssembly/);
  } finally {
    globalThis.fetch = base;
  }
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
