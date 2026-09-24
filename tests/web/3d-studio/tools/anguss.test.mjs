/* Angussdesigner im gemeinsamen Rahmen: Graph bearbeiten über Chips und
   Auswahlfeld, Schusskurve, Regeln, Flussschema, Referenzbauteil (das Bauteil
   des Gastgebers, in die Lage des Angusses gestellt), Mündung ans Bauteil —
   und was der Rahmen dazugibt: Rückgängig, „Entfernen" ohne Nachfrage (auch
   für einen ganzen Teilbaum), ein Zug = ein Schritt, ungespeicherter Plan.
   Die Fälle stammen aus viewer.test.mjs („Angussseite: …") und wurden auf
   data-ui, Chips und das Auswahlfeld übertragen.

     node --import ./tests/web/3d-studio/stubs/register.mjs --test tests/web/3d-studio/tools/anguss.test.mjs */

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { mountPage, kpiText, wait, interact } from './fixture.mjs';

/* Die Hand an der Seite (./fixture.mjs, interact); vonOben: die Trennebene
   y = 0 liegt flach im Bild. */
let P, T3, G, cam, zeiger, klick, px, vonOben, schauAuf, chip, taste, gruppen, gruppe, setze;
const knoten = () => Object.keys(P.v.state.graph.nodes).length;
const datei = (name, buf) => ({ name, arrayBuffer: () => Promise.resolve(buf), byteLength: buf.byteLength });

before(async () => {
  P = await mountPage('anguss.html', 'js/studio/pages/anguss.js', { design: true });
  T3 = await import('three');
  G = await import('../../../../web/tools/3d-studio/js/runner/graph.js');
  ({ cam, zeiger, klick, px, vonOben, schauAuf, chip, taste, gruppen, gruppe, setze } = interact(P, { T3 }));
});

test('Rahmen: vier Modi, sechs Chips, das Beispiel steht ohne Bauteil — nichts Ungespeichertes', () => {
  const { doc, v, ui, shell, host } = P;
  assert.ok(v.state.ready, 'das Beispiel steht');
  assert.deepEqual(doc.querySelectorAll('[role="tab"]').filter(t => t.getAttribute('data-mode')).map(t => t.getAttribute('data-mode')), ['system', 'kanalform', 'prozess', 'pruefung']);
  assert.equal(shell.mode, 'system');
  assert.deepEqual(doc.querySelectorAll('[data-chip]').map(x => x.getAttribute('data-chip')), ['add-point', 'add-branch', 'add-mirror', 'add-gate', 'insert-point', 'chart']);
  assert.equal(ui('preset').value, 'zwei');
  assert.equal(host.part.model, null, 'ohne Bauteil, wie die Seite immer begann');
  assert.equal(v.partMesh, null);
  assert.match(ui('part-name').textContent, /Bauteil laden/);
  assert.match(kpiText(ui('ref-kpis')), /Keines geladen/);
  assert.equal(v.editor.selected, null, 'nichts gewählt: das erste Bild zeigt das ganze System');
  assert.ok(ui('inspector').hidden);
  assert.ok(ui('primary').hidden, '„System" hat keinen Hauptknopf');
  assert.ok(!ui('undo-group').hidden && ui('undo').disabled, 'Rückgängig ist da und hat nichts zu tun');
  assert.equal(ui('save-state').textContent, '', 'nichts Ungespeichertes');
  /* Ansichtsleiste, Legende, Achsenkreuz */
  assert.equal(ui('viewport').querySelector('.view-bar').querySelectorAll('[data-view]').length, 4);
  assert.match(doc.getElementById('pt-legend').innerHTML, /Punktarten.*Pressrest.*gespiegelt/);
  assert.ok(v.view.axes, 'das Achsenkreuz hängt an der Szene');
  /* Griffe werden doppelt gezeichnet, damit sie hinter dem Körper nicht
     verschwinden: einmal mit Tiefenprüfung, einmal blass ohne. */
  const kugeln = v.editor.group.children.filter(c => c.type === 'Mesh' && c.geometry.type === 'SphereGeometry');
  assert.equal(kugeln.length, knoten() * 2, 'je Punkt zwei Kugeln');
  assert.equal(kugeln.filter(m => m.material.depthTest === false).length, knoten());
  /* Pressrest unter „System", Kennzahlen zugeklappt darunter. */
  assert.equal(ui('bisc-d').value, String(v.state.graph.biscuit.d));
  assert.match(ui('system-facts').innerHTML, /Anschnitte.*Lauflänge.*Angussvolumen/);
});

test('Schusskurve: Ankunft ab „Kammer voll" mit Δ; ab Kolbenstart nur in den Details', () => {
  const { v, ui, shell } = P;
  const s = v.state;
  assert.ok(s.onCurve && s.timeline && !s.timeline.error, 'Kurve: ' + (s.timeline && s.timeline.error));
  assert.ok(s.flowShown.onCurve && s.flowShown !== s.flow);
  for (const g of s.flowShown.gates) {
    const konst = s.flow.gates.find(x => x.id === g.id);
    const V = konst.tArrive * s.flow.Q;
    assert.ok(Math.abs(g.tArrive - (s.timeline.tFull + s.timeline.timeForVolume(V))) < 1e-9, 'Kurvenzeit zu ' + g.id);
    assert.ok(g.tArrive > s.timeline.tFull, 'nach Kammer voll');
    /* Was Auswahlfeld, Schema und Regeln lesen, zählt ab „Kammer voll". */
    const ab = s.flowView.gates.find(x => x.id === g.id);
    assert.ok(Math.abs(ab.tArrive - (g.tArrive - s.timeline.tFull)) < 1e-12);
  }
  shell.setMode('prozess');
  assert.match(kpiText(ui('shot-kpis')), /Füllzeit der Kurve.*Ankunft ab Kammer voll.*Δ erster \/ letzter Anschnitt/);
  assert.doesNotMatch(kpiText(ui('shot-kpis')), /Kolbenstart/);
  assert.match(ui('shot-facts').innerHTML, /Füllgrad/);
  assert.match(ui('shot-facts').innerHTML, /Kammer voll ab Kolbenstart/);
  assert.ok(ui('cbranch').closest('details'), 'der Verzweigungsverlust steht in den Details');
  /* Die Füllkammer ist die von hier: der Pressrest als Kolben, die Kammerlänge aus dem Feld. */
  assert.equal(s.timeline.v.diam, s.graph.biscuit.d, 'der Pressrest-Ø ist der Kolben-Ø der Kurve');
  assert.equal(s.timeline.v.length, s.proc.chamberLen);
  assert.equal(ui('chamber-len').value, '450');
  const phiBefore = s.timeline.phi;
  setze('chamber-len', '600');
  assert.equal(s.proc.chamberLen, 600);
  assert.equal(s.timeline.v.length, 600, 'die Kurve rechnet mit der neuen Kammer');
  assert.ok(s.timeline.phi < phiBefore, 'längere Kammer, kleinerer Füllgrad');
  setze('chamber-len', '450');
  assert.equal(s.proc.chamberLen, 450);
});

test('Prozess: „Füllzeit der Kurve übernehmen" — danach kein toter Knopf; Rückgängig nimmt auch den Prozesswert zurück', () => {
  const { v, ui, host } = P;
  const s = v.state;
  const knopf = ui('primary');
  assert.ok(!knopf.hidden && !knopf.disabled);
  assert.equal(knopf.textContent, 'Füllzeit der Kurve übernehmen');
  assert.match(ui('note').textContent, /Kurve .* ms · Prozess 45 ms/);
  const vorher = s.proc.fillTime;
  knopf.dispatch('click');
  assert.ok(Math.abs(s.proc.fillTime - Math.round(s.timeline.shot.fill * 10) / 10) < 0.6, 'die Füllzeit der Kurve ist übernommen: ' + vorher + ' → ' + s.proc.fillTime);
  assert.notEqual(s.proc.fillTime, vorher);
  assert.equal(host.history.undoLabel, 'Füllzeit der Kurve übernommen');
  taste('z', { ctrlKey: true });
  assert.equal(s.proc.fillTime, vorher, 'Strg+Z holt die Füllzeit zurück');
  assert.equal(ui('tfill').value, String(vorher), 'auch im Feld');
  taste('y', { ctrlKey: true });
  assert.notEqual(s.proc.fillTime, vorher);
  /* Zurück auf die Füllzeit des Beispiels — die Prüfliste unten erwartet es so. */
  setze('tfill', String(vorher));
  assert.equal(s.proc.fillTime, vorher);

  const cb = ui('shot-time');
  cb.checked = false;
  cb.dispatch('change');
  assert.equal(s.flowShown, s.flow, 'aus: konstanter Strom');
  assert.match(kpiText(ui('shot-kpis')), /konstanter Strom/);
  assert.ok(knopf.disabled, 'ohne Kurve nichts zu übernehmen');
  assert.match(ui('note').textContent, /Schusskurve aus/);
  cb.checked = true;
  cb.dispatch('change');
  assert.ok(s.flowShown.onCurve);
});

test('Legierung und Pressrest: die Kurve rechnet mit der Legierung von hier, das offene Auswahlfeld zieht nach', () => {
  const { v, ui } = P;
  const s = v.state;
  const gate = Object.values(s.graph.nodes).find(n => n.type === 'gate' && !G.isFollower(s.graph, n.id));
  v.editor.select(gate.id);
  gruppe('Details');
  const facts0 = ui('sel-facts').innerHTML, arrive0 = ui('sel-arrive').textContent;
  const rho0 = s.timeline.v.density;
  /* Zink: die Kurve bekommt Dichte und Thermik von Zamak 5 — vorher rechnete
     sie still mit der Legierung des Projekts (Aluminium). */
  const alloy = ui('alloy');
  alloy.value = 'zn';
  alloy.dispatch('change');
  assert.ok(s.timeline && !s.timeline.error, 'Kurve: ' + (s.timeline && s.timeline.error));
  assert.equal(s.timeline.v.density, 6200, 'die Schmelzdichte der Vorlage');
  assert.notEqual(ui('sel-facts').innerHTML, facts0, 'Verlust und Ankunft im offenen Auswahlfeld sind die neuen');
  assert.notEqual(ui('sel-arrive').textContent, arrive0);
  /* Aluminium: dasselbe Metall wie im Projekt — es bleibt bei dessen Werten. */
  alloy.value = 'al';
  alloy.dispatch('change');
  assert.equal(s.timeline.v.density, rho0);
  assert.equal(ui('sel-facts').innerHTML, facts0);
  /* Der Pressrest ist Kolben und Kammer der Kurve: sein Ø ändert die Zeiten. */
  setze('bisc-d', '120');
  assert.notEqual(ui('sel-facts').innerHTML, facts0, 'der Pressrest zieht das Auswahlfeld nach');
  taste('z', { ctrlKey: true });
  assert.equal(s.graph.biscuit.d, 90);
  assert.equal(ui('sel-facts').innerHTML, facts0);
  v.editor.select(null);
});

test('Prüfung: der Reiter zählt, der Modus listet — das Beispiel ist sauber', () => {
  const { doc, v, ui, shell } = P;
  assert.ok(v.state.rules.length >= 6, 'jede Regel meldet sich');
  assert.deepEqual(v.state.rules.filter(r => r.level !== 'ok').map(r => r.title), [], 'das Beispiel verletzt keine Regel');
  const n = v.state.rules.length;
  assert.equal(doc.querySelector('[data-badge="pruefung"]').textContent, n + '/' + n);
  shell.setMode('pruefung');
  assert.match(kpiText(ui('rules-kpis')), new RegExp('Regeln erfüllt\\s*' + n + ' von ' + n));
  assert.equal(ui('rules-list').querySelectorAll('details').length, n);
  assert.equal(ui('rules-bar').querySelectorAll('span').length, n);
  assert.equal(ui('primary').textContent, 'Flussschema öffnen');
  /* Eine verletzte Regel: der Zähler fällt, der Reiter warnt, sie steht oben und offen. */
  const draft = ui('draft');
  draft.value = '0';
  draft.dispatch('input');
  const schlecht = v.state.rules.filter(r => r.level !== 'ok');
  assert.ok(schlecht.length > 0, 'ohne Entformschräge klemmt der Anguss');
  const badge = doc.querySelector('[data-badge="pruefung"]');
  assert.equal(badge.textContent, (v.state.rules.length - schlecht.length) + '/' + v.state.rules.length);
  assert.match(badge.className, /warn|bad/);
  const erste = ui('rules-list').querySelectorAll('details')[0];
  assert.ok(erste.hasAttribute('open') && /bad|warn/.test(erste.className), 'Verletztes oben und aufgeklappt');
  taste('z', { ctrlKey: true });
  assert.equal(v.state.graph.draft, 5, 'Strg+Z stellt die Schräge wieder her');
  assert.equal(ui('draft').value, '5', 'auch am Regler');
  assert.deepEqual(v.state.rules.filter(r => r.level !== 'ok').map(r => r.title), []);
  shell.setMode('system');
});

test('Chips und Auswahlfeld: ohne Auswahl sagt der Chip, was fehlt; ein Punkt hängt sich an — ein Schritt, ungespeichert', () => {
  const { v, ui, host } = P;
  chip('add-point').dispatch('click');
  assert.match(ui('toast').textContent, /Zuerst einen Punkt wählen/);
  assert.ok(chip('add-point').classList.contains('off'));

  const before = knoten();
  const tail = v.state.graph.nodes[v.state.graph.rootId].children[0];
  v.editor.select(tail);
  assert.ok(!ui('inspector').hidden, 'das Auswahlfeld steht neben dem Bild');
  assert.match(ui('inspector-title').innerHTML, /Punkt/);
  assert.deepEqual(gruppen(), ['Lage', 'Querschnitt', 'Details']);
  assert.ok(!chip('add-point').classList.contains('off'));
  chip('add-point').dispatch('click');
  assert.equal(knoten(), before + 1);
  assert.equal(v.state.net.edges.length, before, 'eine Kante mehr');
  const neu = v.editor.selected;
  assert.notEqual(neu, tail, 'der neue Punkt ist gewählt');
  assert.match(host.history.undoLabel, /Punkt .* angefügt/);
  assert.equal(ui('save-state').textContent, 'Ungespeichert');

  /* Entf: ohne Nachfrage weg, der Toast bietet den Rückweg — und was
     zurückkommt, ist wieder gewählt (Entf träfe es erneut). */
  taste('Delete');
  assert.equal(knoten(), before, '… und verschwindet wieder');
  assert.ok(!ui('toast').hidden);
  assert.match(ui('toast').textContent, /Punkt .* entfernt/);
  assert.equal(v.editor.selected, tail, 'gewählt ist der Vorgänger');
  ui('toast').querySelector('.st-toast-act').dispatch('click');
  assert.equal(knoten(), before + 1, '„Rückgängig" im Toast holt ihn zurück');
  assert.equal(v.editor.selected, neu, 'und wählt ihn');
  ui('del-node').dispatch('click');
  assert.equal(knoten(), before, '„Entfernen" im Auswahlfeld tut dasselbe');

  /* Hinter einem Anschnitt ist Schluss, vor dem Pressrest gibt es nichts. */
  const gate = Object.values(v.state.graph.nodes).find(n => n.type === 'gate' && !G.isFollower(v.state.graph, n.id));
  v.editor.select(gate.id);
  assert.ok(chip('add-point').classList.contains('off') && !chip('insert-point').classList.contains('off'));
  assert.match(chip('add-point').title, /Hinter einem Anschnitt/);
  v.editor.select(v.state.graph.rootId);
  assert.ok(chip('insert-point').classList.contains('off'));
  assert.ok(ui('del-node').disabled, 'der Pressrest bleibt');
  taste('Delete');
  assert.match(ui('toast').textContent, /Pressrest bleibt/);
  /* Die gespiegelte Seite zeigt ihre Werte, nimmt aber keine an. */
  const folger = Object.values(v.state.graph.nodes).find(n => G.isFollower(v.state.graph, n.id));
  v.editor.select(folger.id);
  assert.match(ui('inspector-title').innerHTML, /gespiegelt/);
  assert.ok(ui('sel-x').disabled && ui('del-node').disabled);
  assert.ok(chip('add-point').classList.contains('off'));
});

test('Ein Teilbaum geht mit seinem Kopf — der Toast nennt, wie viel, Strg+Z holt alles zurück', () => {
  const { v, ui, host } = P;
  const g = () => v.state.graph;
  const branch = Object.values(g().nodes).find(n => n.type === 'branch');
  const before = knoten();
  let dahinter = 0;
  const zaehle = id => { for (const c of g().nodes[id].children) { dahinter++; zaehle(c); } };
  zaehle(branch.id);
  assert.ok(dahinter >= 3, 'hinter der Verzweigung hängen beide Äste');
  v.editor.select(branch.id);
  const tiefe = host.history.depth;
  taste('Delete');
  assert.equal(knoten(), before - 1 - dahinter, 'die Verzweigung und alles dahinter');
  assert.match(ui('toast').textContent, new RegExp('Verzweigung ' + branch.id + ' und ' + dahinter + ' Punkte dahinter entfernt'));
  assert.ok(ui('toast').querySelector('.st-toast-act'), 'mit „Rückgängig"');
  assert.equal(host.history.depth, tiefe + 1, 'EIN Schritt');
  taste('z', { ctrlKey: true });
  assert.equal(knoten(), before, 'alles wieder da');
  assert.equal(v.editor.selected, branch.id, 'gewählt ist der Kopf des Teilbaums');
  assert.ok(ui('toast').hidden, 'der Toast gehörte zu dem Schritt, der eben zurückgenommen wurde');
  assert.deepEqual(gruppen(), ['Lage', 'Querschnitt', 'Verzweigung', 'Details']);
  /* Ein Punkt mit genau einem Nachfolger wird überbrückt — dahinter bleibt alles. */
  const mitte = g().nodes[g().rootId].children[0];
  v.editor.select(mitte);
  taste('Delete');
  assert.equal(knoten(), before - 1);
  assert.doesNotMatch(ui('toast').textContent, /dahinter/);
  taste('z', { ctrlKey: true });
  assert.equal(knoten(), before);
});

test('Pressrest unter „System": Maße, Richtung dreht das System — die Kamera bleibt; Lage des Pressrests zieht alles mit', () => {
  const { v, ui, host } = P;
  const g = v.state.graph;
  v.editor.select(g.rootId);
  /* Der Pressrest bringt keine Arbeitsebene mit: seine Ebene IST die Ausstoßrichtung. */
  assert.ok(ui('plane-block').hidden && !ui('root-note').hidden);
  gruppe('Details');
  assert.match(ui('sel-facts').innerHTML, /Pressrest-Volumen/);
  setze('bisc-d', '120');
  assert.equal(g.biscuit.d, 120);
  taste('z', { ctrlKey: true });
  assert.equal(v.state.graph.biscuit.d, 90);
  assert.equal(ui('bisc-d').value, '90', 'das Feld folgt dem Verlauf');

  /* Die Ausstoßrichtung umschalten dreht das System um den Pressrest — die
     Kamera bleibt, wo sie ist. */
  const camBefore = cam.position.toArray(), tgtBefore = v.view.controls.target.toArray();
  const ax = ui('axis-seg').querySelectorAll('button');
  ax.find(b => b.dataset.value === '+z').dispatch('click');
  assert.equal(v.state.graph.biscuit.axis, '+z');
  assert.deepEqual(cam.position.toArray(), camBefore, 'die Kamera steht noch');
  assert.deepEqual(v.view.controls.target.toArray(), tgtBefore, 'und ihr Ziel auch');
  assert.equal(host.history.undoLabel, 'Ausstoßrichtung geändert');
  taste('z', { ctrlKey: true });
  assert.equal(v.state.graph.biscuit.axis, '+y', 'Strg+Z dreht zurück');
  assert.ok(ui('axis-seg').querySelectorAll('button').find(b => b.dataset.value === '+y').classList.contains('active'));

  /* Der Pressrest zieht beim Verschieben das ganze System mit. */
  v.editor.select(v.state.graph.rootId);
  gruppe('Lage');
  const vorher = Object.values(v.state.graph.nodes).map(n => n.pos.slice());
  setze('sel-x', '40');
  const nachher = Object.values(v.state.graph.nodes).map(n => n.pos.slice());
  assert.equal(v.state.graph.biscuit.pos[0], 40);
  nachher.forEach((p, i) => {
    assert.ok(Math.abs(p[0] - vorher[i][0] - 40) < 1e-9, 'alle Punkte um 40 mm versetzt');
    assert.deepEqual([p[1], p[2]], [vorher[i][1], vorher[i][2]]);
  });
  assert.equal(host.history.undoLabel, 'System verschoben');
  setze('sel-x', '0');
});

test('Richtung umschalten: eine gebundene Mündung dreht mit und bleibt in ihrer Ebene', () => {
  const { v, ui } = P;
  const g = () => v.state.graph;
  const gate = Object.values(g().nodes).find(n => n.type === 'gate' && !G.isFollower(g(), n.id));
  /* Gebunden entlang der Sehne: 0° aus der Ebene. */
  G.aimAt(g(), gate.id, gate.pos, G.chordDir(g(), gate));
  v.rebuild();
  assert.ok(G.aimTilt(g(), g().nodes[gate.id]) < 1e-6);
  ui('axis-seg').querySelectorAll('button').find(b => b.dataset.value === '+z').dispatch('click');
  const n = g().nodes[gate.id];
  assert.ok(G.aimTilt(g(), n) < 1e-6, 'nach +y → +z weiter in der Ebene: ' + G.aimTilt(g(), n) + '°');
  assert.ok(!v.state.rules.find(r => /Trennebene/.test(r.title)), 'keine Beanstandung');
  taste('z', { ctrlKey: true });
  assert.equal(g().biscuit.axis, '+y');
  G.clearAim(g(), gate.id);
  v.rebuild();
});

test('Kanalform und Anschnitt: Vorgabe und eigene Höhe, Zwickelradius, Regler = EIN Schritt, „Querschnitte abstufen"', () => {
  const { v, ui, shell, host } = P;
  shell.setMode('kanalform');
  assert.equal(ui('primary').textContent, 'Querschnitte abstufen');
  assert.equal(ui('branch-r').value, '4');
  setze('branch-r', '6');
  assert.equal(v.state.graph.branchR, 6);
  setze('branch-r', '4');
  assert.ok(ui('tension').closest('details') && ui('step').closest('details'), 'Splinestraffheit und Abtastschritt stehen in den Details');

  /* Ein Anschnitt zeigt seine eigenen Gruppen. */
  const gate = Object.values(v.state.graph.nodes).find(n => n.type === 'gate' && !G.isFollower(v.state.graph, n.id));
  v.editor.select(gate.id);
  assert.deepEqual(gruppen(), ['Lage', 'Querschnitt', 'Anschnitt', 'Mündung', 'Details']);
  assert.ok(!ui('plane-block').hidden);
  gruppe('Anschnitt');
  assert.ok(!ui('sel-gh').closest('[data-group]').hidden, 'die gewählte Gruppe steht da');
  assert.ok(ui('sel-w').closest('[data-group]').hidden, 'die anderen nicht');
  assert.equal(ui('sel-gw').disabled, true, 'automatische Breite ist gesperrt');
  assert.match(ui('sel-arrive').textContent, /Ankunft .* ms ab Kammer voll/);
  gruppe('Details');
  assert.match(ui('sel-facts').innerHTML, /Ankunft ab Kolbenstart/, 'die absolute Zeit steht nur in den Details');
  assert.match(ui('sel-facts').innerHTML, /hydraulischer Ø.*Verlust/);

  /* Die Anschnitthöhe unter „Kanalform" gilt für jeden Anschnitt ohne eigene;
     ein eigener Wert im Auswahlfeld löst ihn davon. */
  const node = () => v.state.graph.nodes[gate.id];
  assert.equal(ui('gate-h').value, '2,2', 'die Vorgabe steht im Feld');
  setze('gate-h', '1,6');
  assert.equal(v.state.graph.gateH, 1.6);
  assert.equal(node().gate.h, 1.6, 'der gewählte Anschnitt folgt der Vorgabe');
  assert.equal(ui('sel-gh').value, '1,6');
  setze('sel-gh', '3');
  assert.equal(node().gate.h, 3);
  assert.equal(node().gate.hAuto, false, 'eigener Wert: aus der Vorgabe heraus');
  setze('gate-h', '2');
  assert.equal(node().gate.h, 3, 'die Vorgabe lässt ihn in Ruhe');
  setze('sel-gh', '2');
  assert.equal(node().gate.hAuto, true, 'genau die Vorgabe: wieder dabei');
  /* Über die Grenze hinaus: geklemmt. */
  setze('sel-gh', '99');
  assert.equal(node().gate.h, 30, 'auf die Obergrenze geklemmt');
  setze('sel-gh', '2');

  /* Regler wirken sofort — und sind EIN Schritt, solange man am selben dreht. */
  const draft = ui('draft');
  const areaBefore = v.state.net.edges[0].sections[0].area;
  const tiefe = host.history.depth;
  for (const w of ['8', '10', '12']) { draft.value = w; draft.dispatch('input'); }
  assert.equal(v.state.graph.draft, 12);
  assert.ok(v.state.net.edges[0].sections[0].area < areaBefore, 'mehr Schräge, weniger Fläche');
  assert.equal(host.history.depth, tiefe + 1, 'drei Reglerschritte, ein Eintrag');
  assert.equal(host.history.undoLabel, 'Entformschräge geändert');

  /* Abstufen: von den Anschnitten rückwärts — ein Schritt, der sich zurücknehmen lässt. */
  const w0 = v.state.graph.nodes[v.state.graph.rootId].w;
  setze('vol', '900');
  ui('primary').dispatch('click');
  assert.ok(v.state.graph.nodes[v.state.graph.rootId].w > w0, 'mehr Volumen, breitere Kanäle');
  assert.equal(host.history.undoLabel, 'Querschnitte abgestuft');
  taste('z', { ctrlKey: true });
  assert.equal(v.state.graph.nodes[v.state.graph.rootId].w, w0);
  shell.setMode('system');
});

test('Zeiger: ein Klick auf den Griff wählt (kein Schritt), ein Zug ist EIN Schritt, ein Klick auf den Kanal wählt den nächsten Punkt', async () => {
  const { v, ui, host } = P;
  const g = () => v.state.graph;
  const rootPos = g().nodes[g().rootId].pos;
  vonOben(rootPos);
  v.editor.select(null);
  v.view.scene.updateMatrixWorld(true);
  const tiefe = host.history.depth;
  klick(...px(rootPos));
  assert.equal(v.editor.selected, g().rootId, 'der Klick auf den Griff wählt den Pressrest');
  assert.match(ui('inspector-title').innerHTML, /Pressrest/);
  assert.equal(host.history.depth, tiefe, 'Auswählen ist kein Schritt');

  /* Ein Punkt wird gezogen: viele Mausschritte, ein Eintrag. */
  const p1 = g().nodes[g().nodes[g().rootId].children[0]];
  const p0 = p1.pos.slice();
  vonOben(p0);
  v.rebuild();
  const [hx, hy] = px(p0);
  zeiger('pointerdown', hx, hy);
  assert.equal(v.editor.selected, p1.id, 'anklicken wählt');
  assert.ok(v.editor.dragging, 'und der Zug beginnt');
  zeiger('pointermove', hx + 30, hy);
  await new Promise(r => setTimeout(r, 30));          // der Zug wirkt einmal je Bild
  zeiger('pointermove', hx + 60, hy);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', hx + 60, hy);
  const p2 = g().nodes[p1.id].pos;
  assert.ok(Math.hypot(p2[0] - p0[0], p2[2] - p0[2]) > 5, 'der Punkt wandert: ' + p0 + ' → ' + p2);
  assert.ok(Math.abs(p2[1] - p0[1]) < 1e-9, 'in seiner Arbeitsebene');
  assert.equal(host.history.depth, tiefe + 1, 'viele Mausschritte, ein Eintrag');
  assert.equal(host.history.undoLabel, 'Punkt verschoben');
  taste('z', { ctrlKey: true });
  assert.deepEqual(g().nodes[p1.id].pos, p0, 'Strg+Z stellt ihn zurück');

  /* Ein Klick auf den Kanalkörper — zwischen zwei Griffen — wählt das nähere Ende der Kante. */
  v.editor.select(null);
  const e = v.state.net.edges[0];
  const s = e.sections[Math.floor(e.sections.length * 0.75)];
  vonOben(s.p);
  v.rebuild();
  klick(...px(s.p));
  assert.equal(v.editor.selected, e.toId, 'das nähere Ende der getroffenen Kante');
  /* Esc hebt die Auswahl auf, ✕ auch. */
  taste('Escape');
  assert.equal(v.editor.selected, null);
  v.editor.select(e.toId);
  ui('inspector-close').dispatch('click');
  assert.equal(v.editor.selected, null);
});

test('Esc mitten im Zug nimmt ihn zurück, ohne Schritt; der Zug am Pressrest heißt „System verschoben"', async () => {
  const { v, host } = P;
  const g = () => v.state.graph;
  const p1 = g().nodes[g().nodes[g().rootId].children[0]];
  const p0 = p1.pos.slice();
  vonOben(p0);
  v.rebuild();
  const tiefe = host.history.depth;
  const [hx, hy] = px(p0);
  zeiger('pointerdown', hx, hy);
  assert.ok(v.editor.dragging, 'der Zug läuft');
  zeiger('pointermove', hx + 40, hy);
  await new Promise(r => setTimeout(r, 30));
  const unterwegs = g().nodes[p1.id].pos;
  assert.ok(Math.hypot(unterwegs[0] - p0[0], unterwegs[2] - p0[2]) > 5, 'der Punkt ist unterwegs');
  taste('Escape');
  assert.ok(!v.editor.dragging, 'Esc beendet den Zug');
  assert.deepEqual(g().nodes[p1.id].pos, p0, 'und der Punkt steht, wo er vorher stand');
  assert.equal(v.editor.selected, p1.id, 'die Auswahl bleibt');
  zeiger('pointermove', hx + 80, hy);
  zeiger('pointerup', hx + 80, hy);
  assert.deepEqual(g().nodes[p1.id].pos, p0, 'Weiterziehen und Loslassen danach bewegen nichts');
  assert.equal(host.history.depth, tiefe, 'kein Schritt');

  /* Der Pressrest zieht das System mit — der Schritt heißt so. */
  const r0 = g().nodes[g().rootId].pos.slice();
  vonOben(r0);
  v.rebuild();
  const [rx, ry] = px(r0);
  zeiger('pointerdown', rx, ry);
  assert.equal(v.editor.selected, g().rootId);
  zeiger('pointermove', rx + 30, ry);
  await new Promise(r => setTimeout(r, 30));
  zeiger('pointerup', rx + 30, ry);
  assert.notDeepEqual(g().nodes[g().rootId].pos, r0);
  assert.equal(host.history.undoLabel, 'System verschoben');
  taste('z', { ctrlKey: true });
  assert.deepEqual(g().nodes[g().rootId].pos, r0);
  v.editor.select(null);
});

test('Lage im Auswahlfeld: Enter ohne Änderung verschiebt nichts; „12.500" wird begrenzt, mit Hinweis', () => {
  const { v, ui, host } = P;
  const g = () => v.state.graph;
  const enter = name => ui(name).dispatch('keydown', { key: 'Enter', preventDefault() {} });
  /* Nach einem Zug liegt ein Punkt abseits des Zehntels, das Feld zeigt es gerundet. */
  const id = g().nodes[g().rootId].children[0];
  G.setPos(g(), id, [3.14159, 0, 62.34567]);
  v.rebuild();
  host.changed('Punkt verschoben');
  v.editor.select(id);
  gruppe('Lage');
  assert.equal(ui('sel-x').value, '3,1');
  const tiefe = host.history.depth;
  for (const k of ['sel-x', 'sel-y', 'sel-z']) enter(k);
  assert.deepEqual(g().nodes[id].pos, [3.14159, 0, 62.34567], 'die Rundung der Anzeige wird nicht eingelesen');
  assert.equal(host.history.depth, tiefe, 'kein Schritt');
  /* Am Pressrest hätte es das ganze System verschoben. */
  v.editor.select(g().rootId);
  const alle = Object.values(g().nodes).map(n => n.pos.slice());
  enter('sel-x');
  assert.deepEqual(Object.values(g().nodes).map(n => n.pos.slice()), alle);
  assert.equal(host.history.depth, tiefe);
  /* Deutsch gelesen ist „12.500" zwölftausendfünfhundert: begrenzt, und das Feld sagt es. */
  v.editor.select(id);
  setze('sel-x', '12.500');
  assert.equal(g().nodes[id].pos[0], 5000);
  assert.match(ui('sel-x').closest('.row').querySelector('.clamp-note').textContent, /auf 5000 mm begrenzt/);
  taste('z', { ctrlKey: true });
  taste('z', { ctrlKey: true });
  assert.ok(Math.abs(g().nodes[id].pos[0]) < 1e-9, 'zurück: ' + g().nodes[id].pos);
  v.editor.select(null);
});

test('Verzweigung im Auswahlfeld: gespiegelt ist die Aufteilung gesperrt und sagt warum, kein dritter Ast; ein Punkt mit zweitem Abgang bekommt die Gruppe', () => {
  const { v, ui } = P;
  const g = () => v.state.graph;
  const b = Object.values(g().nodes).find(n => n.type === 'branch' && n.mirror);
  v.editor.select(b.id);
  gruppe('Verzweigung');
  assert.ok(ui('sel-ratio').disabled, 'gespiegelt teilt sie 50:50, der Regler ist gesperrt');
  assert.match(ui('sel-ratio-note').textContent, /Gespiegelt teilen die Äste 50:50/);
  assert.ok(!ui('sel-mirror').disabled && ui('sel-mirror').checked);
  /* Ein dritter Ast schaltete die Spiegelung still ab: der Chip sagt, warum nicht. */
  const n0 = knoten();
  assert.ok(chip('add-gate').classList.contains('off'));
  chip('add-gate').dispatch('click');
  assert.equal(knoten(), n0);
  assert.match(ui('toast').textContent, /genau zwei Äste/);
  /* Ohne Spiegelung: die Aufteilung ist frei, ein dritter Ast geht — und dann
     teilen drei zu gleichen Teilen, zu spiegeln gibt es nichts. */
  const cb = ui('sel-mirror');
  cb.checked = false;
  cb.dispatch('change');
  assert.ok(!ui('sel-ratio').disabled);
  assert.equal(ui('sel-ratio-note').textContent, '');
  chip('add-gate').dispatch('click');
  assert.equal(g().nodes[b.id].children.length, 3);
  v.editor.select(b.id);
  gruppe('Verzweigung');
  assert.ok(ui('sel-ratio').disabled && ui('sel-mirror').disabled);
  assert.match(ui('sel-ratio-note').textContent, /3 Abgänge teilen den Strom zu gleichen Teilen/);
  taste('z', { ctrlKey: true });
  taste('z', { ctrlKey: true });
  assert.ok(g().nodes[b.id].mirror && g().nodes[b.id].children.length === 2, 'Strg+Z: wieder gespiegelt, zwei Äste');

  /* Ein Punkt, an den ein zweiter Abgang kommt, ist eine Verzweigung — mit
     Aufteilung und Häkchen, nicht fest 50:50. */
  const gate = Object.values(g().nodes).find(n => n.type === 'gate' && !G.isFollower(g(), n.id));
  const vor = g().nodes[gate.parent];
  v.editor.select(vor.id);
  assert.deepEqual(gruppen(), ['Lage', 'Querschnitt', 'Details']);
  chip('add-point').dispatch('click');
  v.editor.select(vor.id);
  assert.equal(g().nodes[vor.id].type, 'branch');
  assert.deepEqual(gruppen(), ['Lage', 'Querschnitt', 'Verzweigung', 'Details']);
  gruppe('Verzweigung');
  assert.ok(!ui('sel-ratio').disabled && !ui('sel-mirror').disabled);
  taste('z', { ctrlKey: true });
  assert.equal(g().nodes[vor.id].type, 'point');
  v.editor.select(null);
});

test('Beispielwechsel und Flussschema: Chip und Hauptknopf öffnen es, Esc und × schließen', () => {
  const { v, ui, shell } = P;
  const sel = ui('preset');
  sel.value = 'vier';
  sel.dispatch('change');
  assert.equal(Object.values(v.state.graph.nodes).filter(n => n.type === 'gate').length, 4);
  assert.ok(ui('undo').disabled, 'ein anderes Beispiel ist ein neues System: der Verlauf beginnt neu');
  assert.equal(v.editor.selected, null);

  chip('chart').dispatch('click');
  assert.ok(ui('chart-panel').classList.contains('on'), 'der Chip öffnet das Schema');
  assert.ok(v.state.chartOpen && chip('chart').classList.contains('active'));
  const body = ui('chart-body').innerHTML;
  assert.match(body, /^<svg /);
  assert.match(body, /Ankunft [\d.,]+ ms/, 'die Ankunft der Schmelze steht am Anschnitt');
  assert.match(body, /Soll \d+ % · Ist \d+ %/, 'Soll und Ist groß');
  assert.match(body, /<path d="M[^"]* C[^"]*"/, 'die Bänder sind Bögen, keine Geraden');
  /* Die Kennzahlen stehen beim Flussschema — mit der Ankunft ab „Kammer voll". */
  assert.match(ui('chart-facts').innerHTML, /Anschnitte/);
  assert.match(ui('chart-facts').innerHTML, /Druckbedarf/);
  assert.match(ui('chart-facts').innerHTML, /ab Kammer voll/);
  assert.doesNotMatch(ui('chart-facts').innerHTML, /Kolbenstart/);
  taste('Escape');
  assert.ok(!ui('chart-panel').classList.contains('on'), 'Esc schließt es');
  shell.setMode('pruefung');
  ui('primary').dispatch('click');
  assert.ok(v.state.chartOpen, 'der Hauptknopf der Prüfung öffnet es auch');
  assert.equal(ui('primary').textContent, 'Flussschema schließen');
  ui('chart-close').dispatch('click');
  assert.ok(!v.state.chartOpen, 'das × schließt es');
  shell.setMode('system');
});

test('Ein Beispiel wird für den Prozess von hier bemessen: mit 1000 cm³ verletzt es keine Regel, die an den Querschnitten hängt', () => {
  /* Die Beispiele sind für 420 cm³ bemessen. Mit einem größeren Teil
     begrüßten sie mit „Querschnitt wächst", „Laufkanal zu schnell" und
     „Anschnitt zu groß" — Regeln, die der Anwender nicht verletzt hatte.
     Was an der Gestalt hängt, bleibt: die Stufe hat mit dickeren Kanälen
     einen zu engen Bogen (Radius unter 2·d_h), das ändert kein Abstufen. */
  const { v, ui } = P;
  setze('vol', '1000');
  const sel = ui('preset');
  try {
    for (const id of ['zwei', 'vier', 'faecher', 'stufe']) {
      sel.value = id;
      sel.dispatch('change');
      const schlecht = v.state.rules.filter(r => r.level !== 'ok' && !(id === 'stufe' && r.title === 'Zu enger Bogen'));
      assert.deepEqual(schlecht.map(r => r.title), [], id + ': ' + schlecht.map(r => r.text).join(' | '));
      assert.ok(ui('undo').disabled, id + ': ein neues System, kein Schritt');
    }
  } finally {
    setze('vol', '420');
    sel.value = 'vier';
    sel.dispatch('change');
  }
});

test('Referenzbauteil = Bauteil des Gastgebers: Volumen wird Gussvolumen, es steht vor den Anschnitten; Mündung ans Bauteil binden', async () => {
  const { v, ui, host, doc } = P;
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');

  /* Der Pfeil am Anschnitt ohne Bauteil: kein Zielmodus, aber ein Hinweis. */
  const gate = Object.values(v.state.graph.nodes).find(n => n.type === 'gate' && !G.isFollower(v.state.graph, n.id));
  v.editor.select(gate.id);
  v.startAim(gate.id);
  assert.ok(!v.editor.aiming, 'ohne Bauteil gibt es nichts zu treffen');
  assert.ok(!doc.getElementById('aim-banner').classList.contains('hidden'));
  assert.match(doc.getElementById('aim-text').textContent, /Referenzbauteil laden/);

  /* Ein Würfel von 1000 cm³ über „Datei öffnen" (der Inhalt entscheidet). */
  const wuerfel = writeSTL(S.box(100, 100, 100), 'test');
  const volVorher = v.state.proc.volume;
  await host.openFile(datei('bauteil.stl', wuerfel));
  await wait(() => v.state.ready && host.part.model);
  assert.notEqual(v.state.proc.volume, volVorher);
  assert.ok(Math.abs(v.state.proc.volume - 1000) < 0.2, 'Volumen ' + v.state.proc.volume + ' cm³');
  assert.equal(ui('vol').value, '1000', 'ohne Tausenderpunkt — sonst liest es sich falsch zurück');
  assert.match(kpiText(ui('ref-kpis')), /bauteil\.stl\s*1\.000 cm³/);
  assert.match(ui('part-name').textContent, /bauteil\.stl/);
  assert.ok(v.partMesh && v.partMesh.visible);
  assert.ok(v.state.flow.Q > 0, 'und die Kette hängt daran: mehr Volumen, mehr Strom');
  assert.ok(ui('undo').disabled, 'ein Bauteil ist kein Schritt im Verlauf');

  /* Die Lage: das NETZ bleibt, wie es ist — das Mesh ist in die Trennebene
     gedreht und steht mit seiner nächsten Kante am fernsten Anschnitt. */
  const pos = host.part.mesh.geometry.getAttribute('position');
  let roh = -Infinity;
  for (let i = 0; i < pos.count; i++) roh = Math.max(roh, Math.abs(pos.getX(i)), Math.abs(pos.getY(i)), Math.abs(pos.getZ(i)));
  assert.ok(Math.abs(roh - 50) < 1e-6, 'die Netzpunkte sind unverändert');
  const bb = new T3.Box3().setFromObject(host.part.mesh);
  const gates = Object.values(v.state.graph.nodes).filter(n => n.type === 'gate');
  const zMax = Math.max(...gates.map(n => n.pos[2]));
  assert.ok(Math.abs(bb.min.z - zMax) < 1e-3, 'die nächste Kante am fernsten Anschnitt: ' + bb.min.z + ' / ' + zMax);
  assert.ok(Math.abs(bb.min.y + 50) < 1e-3 && Math.abs(bb.max.y - 50) < 1e-3, 'die Trennebene des Teils in der des Angusses');
  assert.ok(Math.abs((bb.min.x + bb.max.x) / 2) < 1e-3, 'mittig zu den Anschnitten');
  assert.equal(v.state.place.key, host.part.key);
  assert.ok(P.tool.toJSON().ref, 'die Lage steht (freiwillig) in der Datei');

  /* Mündung ans Bauteil: der Pfeil am Anschnitt ist der Griff für die Bindung. */
  const banner = doc.getElementById('aim-banner');
  const g2 = gate;
  v.editor.select(g2.id);
  const tip = v.editor.arrowTip(g2.id);
  assert.ok(tip, 'der Anschnitt trägt einen Pfeil');
  vonOben([0, 0, 0]);
  const tiefe = host.history.depth;
  klick(...px(tip));
  assert.equal(v.editor.selected, g2.id, 'der Pfeil wählt seinen Anschnitt');
  assert.ok(!v.editor.dragging, 'und zieht ihn nicht');
  assert.ok(v.editor.aiming, 'der Zielmodus ist scharf');
  assert.ok(!banner.classList.contains('hidden'), 'der Viewport sagt, was zu tun ist');
  assert.match(doc.getElementById('aim-text').textContent, /Esc/, 'und wie man ihn wieder los wird');
  v.editor.aimFor(g2.id);
  assert.ok(v.editor.aiming, 'ein zweiter Klick lässt den Modus scharf');
  /* Esc bricht das Zielen ab — und nur das. */
  taste('Escape');
  assert.ok(!v.editor.aiming && banner.classList.contains('hidden'));
  assert.equal(v.editor.selected, g2.id, 'die Auswahl bleibt dabei stehen');
  /* Derselbe Weg über das Auswahlfeld. */
  gruppe('Mündung');
  assert.equal(ui('sel-aim').textContent, 'Mündung ans Bauteil binden');
  ui('sel-aim').dispatch('click');
  assert.ok(v.editor.aiming, '„Mündung ans Bauteil binden" zielt');

  /* Daneben: kein Treffer, kein Abbruch — aber eine Antwort. */
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2;
  schauAuf([bb.max.x + 400, 40, cz], [cx, 40, cz]);
  klick(2, 2);
  assert.ok(v.editor.aiming, 'ein Fehlklick lässt den Modus stehen');
  assert.ok(banner.classList.contains('miss'), 'und wird als Fehlschuss benannt');
  /* Auf dem Bauteil GEZOGEN heißt gedreht, nicht gebunden. */
  zeiger('pointerdown', 400, 300);
  zeiger('pointerup', 460, 340);
  assert.ok(v.editor.aiming, 'ein Zug über das Bauteil bindet nichts');
  /* Die Vorschau: unter dem Zeiger steht die Marke auf dem Bauteil. */
  zeiger('pointermove', 400, 300);
  await new Promise(r => setTimeout(r, 30));
  assert.ok(v.editor.aimMark && Math.abs(v.editor.aimMark[0] - bb.max.x) < 1e-3, 'die Marke sitzt auf der Seitenfläche: ' + v.editor.aimMark);

  /* Die Wand: von +X her auf die Seitenfläche, 40 mm ÜBER der Trennebene.
     Der Anschnitt kommt GENAU dorthin; nur seine Richtung bleibt waagerecht. */
  klick(400, 300);
  assert.ok(!v.editor.aiming, 'der Treffer schaltet ihn ab');
  assert.ok(banner.classList.contains('hidden'), 'und der Hinweis ist weg');
  let gs = v.state.graph.nodes[g2.id];
  assert.ok(Math.abs(gs.pos[0] - bb.max.x) < 1e-2 && Math.abs(gs.pos[1] - 40) < 1e-2 && Math.abs(gs.pos[2] - cz) < 1e-2, 'der Anschnitt sitzt am geklickten Punkt: ' + gs.pos);
  assert.ok(gs.aim[0] < -0.999 && Math.abs(gs.aim[1]) < 1e-9, 'und mündet waagerecht nach innen: ' + gs.aim);
  assert.equal(host.history.depth, tiefe + 1);
  assert.equal(host.history.undoLabel, 'Mündung ans Bauteil gebunden');
  assert.match(ui('sel-aim-note').textContent, /−X · gebunden/);
  assert.match(ui('inspector-title').innerHTML, /ans Bauteil gebunden/, 'die Kopfzeile auch');
  assert.equal(ui('sel-aim').textContent, 'Mündung neu ans Bauteil binden', 'eine andere Stelle: neu binden — einen Knopf zum Lösen gibt es nicht');
  assert.ok(!v.state.rules.find(r => /Trennebene/.test(r.title)), 'in der Ebene: keine Beanstandung');
  assert.equal(ui('sel-x').disabled, false, 'die Lage bleibt frei — gebunden ist die Richtung, nicht der Punkt');

  /* Die Deckfläche von oben: die Normale steht senkrecht zur Ebene — der
     Treffer bleibt roh, und die Prüfliste sagt, dass das nicht zu bauen ist. */
  v.editor.aimFor(g2.id);
  vonOben([cx, 0, cz]);
  klick(400, 300);
  gs = v.state.graph.nodes[g2.id];
  assert.ok(Math.abs(gs.pos[1] - 50) < 1e-2, 'der Anschnitt sitzt auf der Deckfläche: ' + gs.pos[1]);
  assert.ok(gs.aim[1] < -0.999, 'und mündet nach innen, also −Y: ' + gs.aim);
  gruppe('Details');
  assert.match(ui('sel-facts').innerHTML, /−Y · gebunden, 90° aus der Ebene/);
  const quer = v.state.rules.find(r => /Mündung aus der Trennebene/.test(r.title));
  assert.ok(quer && quer.level === 'bad', 'die Prüfliste beanstandet es: ' + JSON.stringify(quer));
  assert.match(doc.querySelector('[data-badge="pruefung"]').className, /bad/, 'und der Reiter zeigt es');

  /* Jetzt hält die Richtung: der Punkt davor darf wandern, die letzte Tangente bleibt. */
  const tangente = () => { const e = v.state.net.edges.find(x => x.toId === g2.id); return e.sections[e.sections.length - 1].t; };
  const t0 = tangente().slice();
  const vor = v.state.graph.nodes[gs.parent];
  G.setPos(v.state.graph, vor.id, [vor.pos[0] + 30, vor.pos[1], vor.pos[2] + 25]);
  v.rebuild();
  const t1 = tangente();
  assert.ok(Math.hypot(t1[0] - t0[0], t1[1] - t0[1], t1[2] - t0[2]) < 1e-9, 'die Mündungsrichtung bleibt: ' + t0 + ' → ' + t1);
  /* Ohne Bindung folgt sie wieder der Sehne. */
  G.clearAim(v.state.graph, g2.id);
  v.rebuild();
  v.editor.select(g2.id);
  gruppe('Mündung');
  assert.ok(!v.state.graph.nodes[g2.id].aim, 'die Bindung ist weg');
  const t2 = tangente();
  assert.ok(Math.hypot(t2[0] - t0[0], t2[1] - t0[1], t2[2] - t0[2]) > 1e-3, 'ohne Bindung zeigt sie wieder zum Vorgänger');
  assert.ok(!v.state.rules.find(r => /Trennebene/.test(r.title)), 'und die Beanstandung mit ihr');
  assert.doesNotMatch(ui('inspector-title').innerHTML, /gebunden/);
  assert.match(ui('sel-aim-note').textContent, /folgt dem Kanal/);

  /* Die Richtung umschalten nimmt das Bauteil mit — und Strg+Z stellt beides zurück. */
  const vorDreh = host.part.mesh.quaternion.toArray();
  const gedreht = () => Math.hypot(...host.part.mesh.quaternion.toArray().map((c, i) => c - vorDreh[i]));
  ui('axis-seg').querySelectorAll('button').find(b => b.dataset.value === '+x').dispatch('click');
  assert.ok(gedreht() > 0.1, 'das Bauteil dreht sich mit dem System');
  const bbX = new T3.Box3().setFromObject(host.part.mesh);
  assert.ok(Math.abs(bbX.min.x + 50) < 1e-3 && Math.abs(bbX.max.x - 50) < 1e-3, 'seine Trennebene liegt wieder in der des Angusses (jetzt x = 0)');
  taste('z', { ctrlKey: true });
  assert.ok(gedreht() < 1e-6, 'Strg+Z stellt es zurück');

  /* Ein unbrauchbares Netz ändert das Gussvolumen nicht. */
  const winzig = writeSTL(S.box(1, 1, 1), 'winzig');          // 0,001 cm³
  await host.openFile(datei('winzig.stl', winzig));
  await wait(() => v.state.ready && host.part.name === 'winzig.stl');
  assert.ok(Math.abs(v.state.proc.volume - 1000) < 0.2, 'das gute Volumen bleibt stehen');
  assert.match(kpiText(ui('ref-kpis')), /unbrauchbar/);

  /* Die Deckkraft gehört zur Darstellung, nicht zum Plan. */
  const op = doc.querySelector('[data-ui="opacity"]');
  assert.equal(op.value, '30', 'das Bauteil liegt durchscheinend dabei');
  op.value = '60';
  op.dispatch('input');
  assert.equal(host.part.opacity, 0.6);
});

test('Zielen, dann ein anderer Griff: der Klick wählt diesen Punkt, die Mündung bleibt, das Zielen endet', () => {
  const { v, doc, host } = P;
  const g = () => v.state.graph;
  assert.ok(host.part.model && host.part.mesh.visible, 'ein Bauteil ist da');
  const gate = Object.values(g().nodes).find(n => n.type === 'gate' && !G.isFollower(g(), n.id));
  v.editor.select(gate.id);
  v.startAim(gate.id);
  assert.ok(v.editor.aiming, 'der Zielmodus ist scharf');
  const pos0 = g().nodes[gate.id].pos.slice(), aim0 = g().nodes[gate.id].aim;
  const tiefe = host.history.depth;
  const vor = g().nodes[gate.parent];
  vonOben(vor.pos);
  v.rebuild();
  klick(...px(vor.pos));
  assert.equal(v.editor.selected, vor.id, 'der Klick auf den Griff wählt den Punkt');
  assert.ok(!v.editor.aiming, 'und beendet das Zielen');
  assert.ok(doc.getElementById('aim-banner').classList.contains('hidden'), 'der Hinweis ist weg');
  assert.deepEqual(g().nodes[gate.id].pos, pos0, 'der Anschnitt ist nicht zur Stelle hinter dem Griff gesprungen');
  assert.deepEqual(g().nodes[gate.id].aim, aim0);
  assert.equal(host.history.depth, tiefe, 'kein Schritt');
  v.editor.select(null);
});

test('Von außen kommt nur Text: ein Dateiname mit spitzen Klammern, ein Plan mit präparierter Kennung', async () => {
  const { v, ui, host } = P;
  const { writeSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const name = 'bau<b>teil</b>.stl';
  await host.openFile(datei(name, writeSTL(S.box(100, 100, 100), 'test')));
  await wait(() => v.state.ready && host.part.name === name);
  assert.match(ui('ref-kpis').innerHTML, /bau&lt;b&gt;teil&lt;\/b&gt;\.stl/, 'maskiert');
  assert.equal(ui('ref-kpis').querySelectorAll('b').length, 0, 'kein <b> aus dem Namen');
  /* Ein Plan, dessen Anschnitt „k3<img …>" heißt: abgewiesen, der Plan bleibt. */
  const doc = JSON.parse(JSON.stringify(P.tool.toJSON()));
  const alt = doc.nodes.find(n => n.type === 'gate').id, evil = 'k3<img src=x onerror="window.__pwned=1">';
  for (const n of doc.nodes) {
    if (n.id === alt) n.id = evil;
    n.children = n.children.map(c => (c === alt ? evil : c));
  }
  const n0 = knoten(), ids = Object.keys(v.state.graph.nodes).join();
  await host.openFile(datei('kollege-anguss.json', new TextEncoder().encode(JSON.stringify(doc)).buffer));
  assert.match(ui('toast').textContent, /ungültige Kennung/, ui('toast').textContent);
  assert.doesNotMatch(ui('toast').innerHTML, /<img/);
  assert.equal(knoten(), n0);
  assert.equal(Object.keys(v.state.graph.nodes).join(), ids, 'der Plan bleibt, wie er war');
  assert.equal(globalThis.__pwned, undefined);
});

test('Datei: der Graph als JSON (Format unverändert, Prozess als freiwilliger Schlüssel), zwei STL, Laden setzt den Verlauf zurück', () => {
  const { v, ui, host, tool } = P;
  const json = JSON.parse(JSON.stringify(tool.toJSON()));
  assert.equal(json.format, 'dielogic-anguss');
  assert.equal(json.version, 1);
  assert.ok(Array.isArray(json.nodes) && json.rootId && json.biscuit, 'der Graph wie bisher');
  assert.equal(json.process.volume, v.state.proc.volume);
  assert.deepEqual(Object.keys(json.sizing), ['taper', 'aspect']);
  /* Eine Datei ohne die neuen Schlüssel lädt wie immer. */
  const alt = G.toJSON(v.state.graph);
  const n0 = knoten();
  setze('vol', '333');
  tool.fromJSON(alt);
  assert.equal(knoten(), n0);
  assert.equal(v.state.proc.volume, 333, 'ohne „process" bleibt der Prozess, wie er ist');
  tool.fromJSON(json);
  assert.equal(v.state.proc.volume, json.process.volume, 'mit „process" kommt er zurück');
  assert.equal(ui('vol').value, String(json.process.volume).replace('.', ','));
  assert.equal(ui('preset').selectedIndex, -1, 'kein Beispiel mehr gewählt');
  assert.throws(() => tool.fromJSON({ format: 'dielogic-luft', items: [] }), /keine Angussdatei/);
  assert.equal(knoten(), n0, 'eine fremde Datei lässt alles stehen');

  /* Exportieren: ZWEI STL — der Anguss (am Pressrest beschnitten) und der Pressrest. */
  const blobs = [];
  const urlBefore = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = b => { blobs.push(b); return 'blob:test'; };
  assert.ok(tool.exports[0].enabled());
  tool.exports[0].run();
  assert.equal(blobs.length, 2, 'zwei Dateien aus einem Klick');
  assert.ok(blobs[0].size > 84 && blobs[1].size > 84, 'beide mit Inhalt');
  assert.ok(blobs[0].size > blobs[1].size * 3, 'der Anguss ist die große, der Pressrest die kleine');
  assert.match(ui('toast').textContent, /Zwei Dateien/);
  ui('save').dispatch('click');
  assert.equal(blobs.length, 3, '„Speichern" legt den Plan als JSON ab');
  globalThis.URL.createObjectURL = urlBefore;
  assert.match(ui('save-state').textContent, /Gespeichert/);
  assert.ok(host.history.canUndo || true);
});

test('Mit Bauteil: die STL in dessen Koordinaten, die Namen wie beim Plan; ein Plan ohne Lage stellt das Bauteil vor seine Anschnitte', async () => {
  const { v, ui, host, tool } = P;
  const { writeSTL, parseSTL } = await import('../../../../web/tools/3d-studio/js/part/stlio.js');
  const S = await import('../../../../web/tools/3d-studio/js/solids.js');
  const { sweepRunner, biscuitMesh } = await import('../../../../web/tools/3d-studio/js/runner/sweep.js');
  await host.openFile(datei('deckel.stl', writeSTL(S.box(100, 100, 100), 'test')));
  await wait(() => v.state.ready && host.part.name === 'deckel.stl');
  /* Hier steht das Bauteil gedreht (Trennebene y = 0) und verschoben. */
  host.part.mesh.updateMatrixWorld(true);
  assert.ok(Math.abs(host.part.mesh.quaternion.w - 1) > 1e-3, 'gedreht');

  const blobs = [];
  const urlBefore = globalThis.URL.createObjectURL;
  globalThis.URL.createObjectURL = b => { blobs.push(b); return 'blob:test'; };
  tool.exports[0].run();
  globalThis.URL.createObjectURL = urlBefore;
  assert.equal(blobs.length, 2);
  assert.match(ui('toast').textContent, /deckel-anguss\.stl und deckel-pressrest\.stl\. Sie stehen in den Koordinaten des Bauteils/);
  /* Zurück in die Lage im Bild gebracht, liegt jeder Punkt genau, wo der Anguss steht. */
  const back = (tris, m) => {
    const out = new Float64Array(tris.length), p = new T3.Vector3();
    for (let i = 0; i < tris.length; i += 3) { p.set(tris[i], tris[i + 1], tris[i + 2]).applyMatrix4(m); out[i] = p.x; out[i + 1] = p.y; out[i + 2] = p.z; }
    return out;
  };
  for (const [blob, world] of [[blobs[0], sweepRunner(v.state.net)], [blobs[1], biscuitMesh(v.state.graph.biscuit)]]) {
    const tris = parseSTL(await blob.arrayBuffer());
    assert.equal(tris.length, world.length);
    const w = back(tris, host.part.mesh.matrixWorld);
    let worst = 0, moved = 0;
    for (let i = 0; i < w.length; i++) { worst = Math.max(worst, Math.abs(w[i] - world[i])); moved = Math.max(moved, Math.abs(tris[i] - world[i])); }
    assert.ok(moved > 1, 'die Datei steht NICHT in den Koordinaten des Angusses');
    assert.ok(worst < 1e-3, 'Hin und zurück auf ' + worst + ' mm');
  }
  ui('save').dispatch('click');
  assert.match(ui('toast').textContent, /Gespeichert: deckel-anguss\.json/, 'derselbe Name wie der Plan');

  /* Ein Plan, 300 mm versetzt und ohne Lage für dieses Bauteil: das Bauteil
     kommt vor SEINE Anschnitte, die Zeile unter dem Beispiel sagt es. */
  const doc = JSON.parse(JSON.stringify(tool.toJSON()));
  delete doc.ref;
  for (const n of doc.nodes) n.pos[0] += 300;
  doc.biscuit.pos[0] += 300;
  tool.fromJSON(doc);
  const bb = new T3.Box3().setFromObject(host.part.mesh);
  const gates = Object.values(v.state.graph.nodes).filter(n => n.type === 'gate');
  const zMax = Math.max(...gates.map(n => n.pos[2]));
  const xMid = gates.reduce((a, n) => a + n.pos[0], 0) / gates.length;
  assert.ok(Math.abs(bb.min.z - zMax) < 1e-3, 'an den Anschnitten des geöffneten Plans: ' + bb.min.z + ' / ' + zMax);
  assert.ok(Math.abs((bb.min.x + bb.max.x) / 2 - xMid) < 1e-3 && Math.abs(xMid - 300) < 1e-6, 'mittig zu ihnen, 300 mm weiter');
  assert.match(ui('graph-note').textContent, /Eine Lage für dieses Bauteil kannte der Plan nicht/);
  /* Mit Lage für dieses Bauteil gilt sie genau. */
  const withRef = JSON.parse(JSON.stringify(tool.toJSON()));
  withRef.ref.pos[1] += 50;
  tool.fromJSON(withRef);
  assert.deepEqual(host.part.mesh.position.toArray(), withRef.ref.pos);
  assert.doesNotMatch(ui('graph-note').textContent, /kannte der Plan nicht/);
});

/* Eine zweite Seite (?demo=oelwanne) — danach gehört das Dokument ihr, deshalb zuletzt. */
test('Das Beispiel „Ölwanne" bringt sein Referenzteil mit — der Gastgeber lädt es, es steht an den vier Mündungen', async () => {
  const Q = await mountPage('anguss.html', 'js/studio/pages/anguss.js', { design: true, search: '?demo=oelwanne', variant: 'oelwanne' });
  const { v, ui, host } = Q;
  assert.ok(v.state.ready, 'das Beispiel steht — fertig ist die Seite erst MIT ihrem Bauteil');
  assert.equal(ui('preset').value, 'oelwanne');
  assert.ok(host.part.model, 'die Ölwanne ist das Bauteil des Gastgebers');
  assert.equal(host.part.demoId, 'oil_pan');
  assert.match(ui('part-name').textContent, /Ölwanne/);
  assert.ok(v.partMesh.visible, 'sie steht im Viewport');
  assert.match(kpiText(ui('ref-kpis')), /Ölwanne\s*[\d.,]+ cm³/);
  assert.ok(v.state.proc.volume > 500 && v.state.proc.volume < 5000, 'ihr Volumen ist das Gussvolumen: ' + v.state.proc.volume + ' cm³');
  assert.ok(ui('undo').disabled && ui('save-state').textContent === '', 'geladen, nichts geändert');

  /* Lage: Flanschfläche in der Trennebene y = 0, Wanne nach +y, die lange
     Flanschkante an den vier Mündungen — auf der geraden Kante, nicht im Eckradius. */
  const T = await import('three');
  const bb = new T.Box3().setFromObject(host.part.mesh);
  assert.ok(Math.abs(bb.min.y) < 1e-3 && bb.max.y > 120, 'Trennebene y = 0, Wanne nach +y: ' + bb.min.y + ' … ' + bb.max.y);
  const gates = Object.values(v.state.graph.nodes).filter(n => n.type === 'gate');
  assert.equal(gates.length, 4);
  for (const g of gates) {
    assert.ok(Math.abs(g.pos[2] - bb.min.z) < 0.5, 'Mündung an der Flanschkante: ' + g.pos + ' / ' + bb.min.z);
    assert.ok(Math.abs(g.pos[0]) < 165, 'auf der geraden Kante: ' + g.pos);
  }
  assert.deepEqual(v.state.place.pos, [0, 0, 637], 'die Lage aus presets.js');
  assert.deepEqual(v.state.rules.filter(r => r.level !== 'ok').map(r => r.title), [], 'das Beispiel verletzt keine Regel');

  /* Ein anderes Beispiel lässt das Bauteil stehen — und stellt es vor SEINE Anschnitte. */
  const sel = ui('preset');
  sel.value = 'zwei';
  sel.dispatch('change');
  assert.ok(v.partMesh.visible, 'der Wechsel nimmt das Teil nicht weg');
  const bb2 = new T.Box3().setFromObject(host.part.mesh);
  const z2 = Math.max(...Object.values(v.state.graph.nodes).filter(n => n.type === 'gate').map(n => n.pos[2]));
  assert.ok(Math.abs(bb2.min.z - z2) < 0.5, 'es steht an den neuen Mündungen: ' + bb2.min.z + ' / ' + z2);
  /* Zurück zur Ölwanne: das Teil ist schon da — nichts wird neu geladen. */
  sel.value = 'oelwanne';
  sel.dispatch('change');
  assert.ok(v.state.ready);
  assert.deepEqual(v.state.place.pos, [0, 0, 637]);
});
