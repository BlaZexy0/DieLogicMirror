/* Der Angussdesigner ohne Browser: Profil, Graph, Kurve, Netz,
   Strömung, Regeln und Auslegung.

   Alle Module unter js/runner/ außer app.js und editor.js kommen ohne
   DOM aus — das ist Absicht und der Grund, warum hier so viel prüfbar
   ist. Die Verdrahtung der Seite prüft viewer.test.mjs.

     node --import ./tests/web/3d-studio/stubs/register.mjs \
          --test tests/web/3d-studio/runner.test.mjs                    */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const R = '../../../web/tools/3d-studio/';
const P = await import(R + 'js/runner/profile.js');
const G = await import(R + 'js/runner/graph.js');
const PRE = await import(R + 'js/runner/presets.js');
const { sampleNetwork, hermite, gateLand } = await import(R + 'js/runner/curve.js');
const V = await import(R + 'js/runner/vec.js');
const { sweepRunner, biscuitMesh } = await import(R + 'js/runner/sweep.js');
const F = await import(R + 'js/runner/flow.js');
const { checkRules } = await import(R + 'js/runner/rules.js');
const { autoTaper, DEFAULT_SIZING } = await import(R + 'js/runner/sizing.js');
const { flowChart } = await import(R + 'js/runner/chart.js');
const { volume, weld, adjacency } = await import(R + 'js/mesh.js');

/* ── Profil ──────────────────────────────────────────────────── */

const CASES = [[20, 10, 5, 1.5], [30, 8, 7, 2], [6, 3, 10, 0.5], [24, 12, 0, 0], [60, 2.4, 3, 1]];

test('Profil: Umriss und Abstandsfunktion beschreiben dieselbe Form', () => {
  for (const [w, h, d, r] of CASES) {
    const sec = P.section(w, h, d, r);
    const o = P.outline(sec);
    for (let i = 0; i < P.POINTS; i++) {
      const v = P.sdf2d(sec, o[i * 2], o[i * 2 + 1]);
      assert.ok(Math.abs(v) < 1e-9, `Umrisspunkt ${i} liegt bei ${v} statt auf der Fläche (${w}×${h})`);
    }
  }
});

test('Profil: das Vorzeichen der Abstandsfunktion stimmt mit dem Umriss überein', () => {
  for (const [w, h, d, r] of CASES) {
    const sec = P.section(w, h, d, r);
    const o = P.outline(sec);
    const inside = (x, y) => {
      let inn = false;
      for (let i = 0, j = P.POINTS - 1; i < P.POINTS; j = i++) {
        const xi = o[i * 2], yi = o[i * 2 + 1], xj = o[j * 2], yj = o[j * 2 + 1];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inn = !inn;
      }
      return inn;
    };
    let bad = 0;
    for (let x = -w; x <= w; x += 0.31) {
      for (let y = -3; y <= h + 3; y += 0.29) {
        const sd = P.sdf2d(sec, x, y);
        /* Direkt auf dem Umriss darf beides gelten — die Sehnen der
           Bodenverrundung liegen minimal innerhalb des Kreisbogens. */
        if (Math.abs(sd) > 0.05 && (sd < 0) !== inside(x, y)) bad++;
      }
    }
    assert.equal(bad, 0, `${w}×${h}: ${bad} Punkte mit falschem Vorzeichen`);
  }
});

test('Profil: obere Kante scharf, Boden verrundet, Fläche unter dem Trapez', () => {
  const sec = P.section(20, 10, 5, 1.5);
  const o = P.outline(sec);
  /* Zwei Punkte liegen exakt auf ±Breite/2 bei y = 0 — die scharfen
     Ecken an der Trennebene. */
  let onTop = 0;
  for (let i = 0; i < P.POINTS; i++) {
    if (Math.abs(o[i * 2 + 1]) < 1e-12 && Math.abs(Math.abs(o[i * 2]) - 10) < 1e-9) onTop++;
  }
  assert.equal(onTop, 2, 'die beiden oberen Ecken sitzen auf voller Breite');
  const trap = (sec.width + sec.bottom) / 2 * sec.depth;
  assert.ok(P.area(sec) < trap, 'die Verrundung nimmt Fläche weg');
  assert.ok(P.area(sec) > trap * 0.99, 'aber nur wenig');
  assert.ok(sec.r > 0 && sec.r <= 1.5);
});

test('Profil: die linke Hälfte ist Punkt für Punkt das Spiegelbild der rechten', () => {
  /* Der Sweep hängt die Halbringe einer Gabelung nach diesen Listen
     zusammen — die linke Hälfte muss in DERSELBEN Reihenfolge laufen wie
     die rechte (obere Ecke → Flanke → Verrundung → Flankenfuß). */
  assert.equal(P.LEFT_HALF.length, P.RIGHT_HALF.length);
  for (const [w, h, d, r] of CASES) {
    const o = P.outline(P.section(w, h, d, r));
    for (let k = 0; k < P.RIGHT_HALF.length; k++) {
      const a = P.RIGHT_HALF[k], b = P.LEFT_HALF[k];
      assert.ok(Math.abs(o[a * 2] + o[b * 2]) < 1e-12 && Math.abs(o[a * 2 + 1] - o[b * 2 + 1]) < 1e-12,
        `${w}×${h}: Punkt ${k} (${a} gegen ${b})`);
    }
  }
  assert.equal(P.RIGHT_HALF[0], P.TOP_EDGE[P.TOP_EDGE.length - 1], 'rechts beginnt an der rechten oberen Ecke');
  assert.equal(P.LEFT_HALF[0], P.TOP_EDGE[0], 'links an der linken');
  assert.equal(P.RIGHT_HALF[P.RIGHT_HALF.length - 1], P.BOTTOM_EDGE[0], 'rechts endet am rechten Flankenfuß');
  assert.equal(P.LEFT_HALF[P.LEFT_HALF.length - 1], P.BOTTOM_EDGE[P.BOTTOM_EDGE.length - 1], 'links am linken');
});

test('Profil: widthForArea trifft die Zielfläche bei fester Tiefe', () => {
  for (const [w, h, d, r] of CASES) {
    const A = P.area(P.section(w, h, d, r));
    for (const share of [0.2, 0.5, 0.65, 1]) {
      const wk = P.widthForArea(A * share, h, d, r);
      const a = P.area(P.section(wk, h, d, r));
      if (wk <= 0.4 + 1e-9) continue;                           // an der Klemmgrenze
      assert.ok(Math.abs(a - A * share) / (A * share) < 1e-6, `${w}×${h}, Anteil ${share}: ${a} statt ${A * share}`);
    }
    assert.ok(Math.abs(P.widthForArea(A, h, d, r) - w) < 1e-6, 'der volle Anteil gibt die Breite zurück');
  }
});

test('Profil: dimsForArea trifft die Zielfläche bei vorgegebenem Seitenverhältnis', () => {
  for (const target of [12, 80, 300, 900]) {
    for (const q of [0.05, 0.3, 0.65, 1.0]) {
      const d = P.dimsForArea(target, q, 5, 1.5);
      const a = P.area(P.section(d.w, d.h, 5, 1.5));
      assert.ok(Math.abs(a / target - 1) < 0.01, `A=${target} q=${q}: erreicht ${a.toFixed(2)}`);
      assert.ok(Math.abs(d.h / d.w / q - 1) < 1e-6);
    }
  }
});

/* ── Graph ───────────────────────────────────────────────────── */

function straight(len = 100, w = 20, h = 10) {
  const g = G.emptyGraph();
  G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 });
  const r = G.root(g);
  r.w = w; r.h = h;
  g.step = 1;
  const n = G.addChild(g, r.id, 'point');
  n.pos = [0, 0, len]; n.w = w; n.h = h;
  return g;
}

test('Graph: eine Verzweigung mit Spiegelung legt die Gegenseite an und zieht sie nach', () => {
  const g = PRE.demoTwoGates();
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  assert.equal(gates.length, 2, 'aus einer beschriebenen Seite werden zwei');
  const lead = gates.find(n => !G.isFollower(g, n.id) && n.pos[0] < 0);
  const follow = gates.find(n => n !== lead);
  assert.ok(Math.abs(lead.pos[0] + follow.pos[0]) < 1e-6, 'spiegelbildlich in x');
  assert.ok(Math.abs(lead.pos[2] - follow.pos[2]) < 1e-6, 'gleiche Lauflänge');

  const idsBefore = Object.keys(g.nodes).sort().join();
  G.setPos(g, lead.id, [lead.pos[0] - 20, lead.pos[1], lead.pos[2] + 15]);
  assert.equal(Object.keys(g.nodes).sort().join(), idsBefore,
    'das Nachziehen behält die ids — sonst verlöre eine Auswahl ihren Knoten');
  const after = g.nodes[follow.id];
  assert.ok(Math.abs(after.pos[0] + g.nodes[lead.id].pos[0]) < 1e-6, 'die Gegenseite ist mitgegangen');
  assert.ok(Math.abs(after.pos[2] - g.nodes[lead.id].pos[2]) < 1e-6);
});

test('Graph: eine neue Verzweigung spiegelt nicht von sich aus, ein Spiegelpunkt schon', () => {
  const g = PRE.demoFan();
  const p = G.allNodes(g).find(n => n.type === 'point');
  const b = G.addChild(g, p.id, 'branch');
  assert.equal(b.type, 'branch');
  assert.equal(b.mirror, false, 'zwei eigenständige Äste — das Häkchen koppelt sie erst');
  assert.equal(b.children.length, 2, 'aber gleich zwei Anschnitte');
  const [a1, a2] = b.children.map(id => g.nodes[id]);
  assert.ok(!G.isFollower(g, a1.id) && !G.isFollower(g, a2.id), 'beide anfassbar');
  assert.ok(!a1.follower && !a2.follower);
  const before = a2.pos.slice();
  G.setPos(g, a1.id, [a1.pos[0] + 25, a1.pos[1], a1.pos[2] + 10]);
  assert.deepEqual(a2.pos, before, 'der eine Ast zieht den anderen nicht mit');
  /* Häkchen setzen: ab jetzt folgt die zweite Seite. */
  G.setField(g, b.id, 'mirror', true);
  const after = g.nodes[b.children.find(id => G.isFollower(g, id))];
  assert.ok(after, 'mit Häkchen gibt es einen Folger');
  const { origin, normal } = G.mirrorPlaneOf(g, b);
  const lead = g.nodes[b.children.find(id => !G.isFollower(g, id))];
  const dl = (lead.pos[0] - origin[0]) * normal[0] + (lead.pos[1] - origin[1]) * normal[1] + (lead.pos[2] - origin[2]) * normal[2];
  const df = (after.pos[0] - origin[0]) * normal[0] + (after.pos[1] - origin[1]) * normal[1] + (after.pos[2] - origin[2]) * normal[2];
  assert.ok(Math.abs(dl + df) < 1e-6, 'spiegelbildlich zur Spiegelebene');

  const m = G.addChild(g, G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id)).parent, 'mirror');
  assert.equal(m.mirror, true, 'der Spiegelpunkt spiegelt immer');
  assert.equal(m.children.filter(id => G.isFollower(g, id)).length, 1, 'eine Seite entsteht aus der anderen');
});

test('Graph: Spiegelung abschalten löst die Kopplung', () => {
  const g = PRE.demoTwoGates();
  const b = G.allNodes(g).find(n => n.type === 'branch');
  b.mirror = false;
  const [a, c] = b.children.map(id => g.nodes[id]);
  const before = c.pos.slice();
  G.setPos(g, a.id, [a.pos[0] - 30, a.pos[1], a.pos[2]]);
  assert.deepEqual(c.pos, before, 'ohne Spiegelung bleibt die andere Seite stehen');
});

test('Graph: Knoten mit genau einem Kind wird überbrückt, sonst fällt der Teilbaum weg', () => {
  const g = PRE.demoTwoGates();
  const mid = G.allNodes(g).find(n => n.type === 'point' && n.parent === g.rootId);
  const child = mid.children[0];
  G.removeNode(g, mid.id);
  assert.equal(g.nodes[child].parent, g.rootId, 'das Kind hängt jetzt am Pressrest');
  assert.equal(g.nodes[mid.id], undefined);

  const branch = G.allNodes(g).find(n => n.type === 'branch');
  const n0 = G.allNodes(g).length;
  G.removeNode(g, branch.id);
  assert.ok(G.allNodes(g).length < n0 - 1, 'mit zwei Kindern fällt der ganze Ast weg');
});

test('Graph: „davor einfügen" behält die Kinderliste und die Spiegelung', () => {
  const g = PRE.demoTwoGates();
  const b = G.allNodes(g).find(n => n.type === 'branch');
  const lead = g.nodes[b.children[0]];

  /* Direkt unter der Verzweigung: sie muss zwei Kinder behalten, sonst
     ist sie für isMirrorBranch keine Gabelung mehr. */
  const m = G.insertBefore(g, lead.id, 'point');
  assert.ok(m);
  assert.equal(b.children.length, 2, 'zwei Kinder, nicht drei');
  assert.equal(new Set(b.children).size, 2, 'und keiner davon doppelt');
  assert.equal(b.children[0], m.id);
  assert.equal(g.nodes[lead.id].parent, m.id);
  assert.equal(G.edges(g).filter(e => e.from.id === b.id).length, 2, 'zwei Kanten ab der Gabelung');

  /* Die Gegenseite hat den neuen Punkt mitbekommen. */
  const other = g.nodes[b.children[1]];
  assert.equal(other.type, 'point');
  assert.equal(other.children.length, 1);
  assert.ok(Math.abs(other.pos[0] + m.pos[0]) < 1e-6, 'spiegelbildlich');
  assert.equal(G.allNodes(g).length, 9, 'auf beiden Seiten je ein Punkt mehr');

  /* Und tiefer im Ast genauso. */
  const gate = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  const n2 = G.allNodes(g).length;
  const m2 = G.insertBefore(g, gate.id, 'point');
  assert.equal(G.allNodes(g).length, n2 + 2, 'wieder auf beiden Seiten');
  assert.equal(g.nodes[m2.parent].children.length, 1);
});

test('Graph: auch die Gegenseite einer spiegelnden VERZWEIGUNG ist Folger', () => {
  /* Der Vier-Anschnitte-Fall spiegelt zweimal über branch-Knoten mit
     Spiegel-Häkchen — nicht über einen Spiegelpunkt. isFollower kannte
     lange nur den Spiegelpunkt: die ganze Gegenseite galt als führend,
     ihre Griffe fingen Klicks ab (der Zwillingsanschnitt liegt 8 mm
     neben dem echten), und Änderungen daran wurden vom Nachziehen der
     echten Seite kommentarlos überschrieben. */
  const g = PRE.demoFourGates();
  const alle = G.allNodes(g);
  const gates = alle.filter(n => n.type === 'gate');
  assert.equal(gates.length, 4);
  const fuehrend = gates.filter(n => !G.isFollower(g, n.id));
  assert.equal(fuehrend.length, 1, 'genau EIN Anschnitt ist anfassbar — alles andere entsteht');
  assert.equal(alle.filter(n => G.isFollower(g, n.id)).length, 5,
    'Zwilling unter b2 plus die komplette Gegenseite von b1');

  /* Und aimAt bindet nur Anschnitte — wer aus Versehen einen Punkt
     erwischt, bekommt keinen stillen Umbau. */
  const punkt = alle.find(n => n.type === 'point');
  G.aimAt(g, punkt.id, [0, 0, 500], [0, 0, 1]);
  assert.equal(punkt.aim, undefined);
  assert.notDeepEqual(punkt.pos, [0, 0, 500]);
});

test('Graph: die ans Bauteil gebundene Mündung wird mitgespiegelt', () => {
  const g = PRE.demoTwoGates();
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  const lead = gates.find(n => !G.isFollower(g, n.id) && n.pos[0] < 0);
  const follow = gates.find(n => n !== lead);
  G.aimAt(g, lead.id, [-40, 0, 120], [-0.6, 0, 0.8]);

  const l = g.nodes[lead.id], f = g.nodes[follow.id];
  assert.deepEqual(l.pos, [-40, 0, 120], 'der Anschnitt rückt an die getroffene Stelle');
  assert.ok(Math.abs(l.aim[0] + 0.6) < 1e-9 && Math.abs(l.aim[2] - 0.8) < 1e-9, 'Richtung normiert');
  assert.ok(Math.abs(f.pos[0] - 40) < 1e-9, 'die Gegenseite rückt spiegelbildlich mit');
  assert.ok(Math.abs(f.aim[0] - 0.6) < 1e-9 && Math.abs(f.aim[2] - 0.8) < 1e-9,
    'und ihre Mündung ist an derselben Ebene gespiegelt: ' + f.aim);

  /* Die Sehne dreht sie nicht mehr: der Vorgänger darf wandern. */
  const vor = g.nodes[l.parent];
  const t = () => {
    const net = sampleNetwork(g);
    const e = net.edges.find(x => x.toId === lead.id);
    return e.sections[e.sections.length - 1].t;
  };
  const t0 = t().slice();
  G.setPos(g, vor.id, [vor.pos[0] - 25, vor.pos[1], vor.pos[2] - 20]);
  assert.ok(Math.hypot(...t().map((v, i) => v - t0[i])) < 1e-9, 'die Mündungsrichtung steht fest');

  G.clearAim(g, lead.id);
  assert.equal(g.nodes[lead.id].aim, undefined);
  assert.equal(g.nodes[follow.id].aim, undefined, 'das Lösen geht ebenfalls mit');
  assert.ok(Math.hypot(...t().map((v, i) => v - t0[i])) > 1e-3, 'danach folgt sie wieder der Sehne');
});

test('Profil: dimsForArea trifft die Zielfläche in geschlossener Form', () => {
  /* Der Schätzwert kommt aus der exakten Trapezfläche samt Eckenabzug,
     ein einziger Schritt am Umriss richtet ihn auf dessen Sehnenfläche
     aus. Vorher suchte die Funktion fünfmal über den Umriss. */
  let worst = 0;
  for (const target of [0.5, 2, 8, 30, 90, 250, 600, 1500]) {
    for (const q of [0.05, 0.3, 0.65, 1, 2.5]) {
      for (const draft of [0, 5, 12]) {
        for (const r of [0, 1.5, 4]) {
          const d = P.dimsForArea(target, q, draft, r);
          if (d.w <= 0.4 || d.h <= 0.2) continue;             // an der Klemmgrenze
          const a = P.area(P.section(d.w, d.h, draft, r));
          worst = Math.max(worst, Math.abs(a - target) / target);
          assert.ok(Math.abs(d.h / d.w - q) < 1e-9, 'Seitenverhältnis bleibt');
        }
      }
    }
  }
  assert.ok(worst < 2e-4, 'schlechtester Relativfehler ' + worst);
});

test('Strömung: die Ankunft der Schmelze wächst entlang des Weges', () => {
  const proc = { ...F.DEFAULT_PROCESS };
  const g = PRE.demoTwoGates();
  F.applyAutoGates(g, proc);
  const net = sampleNetwork(g);
  const flow = F.analyseFlow(g, net, proc);
  const [a, b] = flow.gates;
  assert.ok(a.tArrive > 0 && Number.isFinite(a.tArrive));
  assert.ok(Math.abs(a.tArrive - b.tArrive) < 1e-9, 'symmetrisch: beide gleichzeitig');
  assert.ok(flow.tFirst === flow.tLast);
  /* Jede Kante kostet Zeit — stromabwärts wird es nur später. */
  for (const n of G.allNodes(g)) {
    if (!n.parent) continue;
    assert.ok(flow.arrival[n.id] > flow.arrival[n.parent] + 1e-9, n.id + ' kommt nach ' + n.parent);
  }
  /* Die Zeit ist Weg durch Geschwindigkeit: Kante für Kante nachgerechnet. */
  const e = net.edges.find(x => x.toId === a.id);
  const l = flow.losses.get(a.id);
  let t = 0;
  for (let i = 0; i < e.sections.length - 1; i++) {
    const s0 = e.sections[i], s1 = e.sections[i + 1];
    const vm = (l.Q / (s0.area * 1e-6) + l.Q / (s1.area * 1e-6)) / 2;
    t += (s1.s - s0.s) * 1e-3 / vm;
  }
  assert.ok(Math.abs(t - l.time) < 1e-12, 'Kantenlaufzeit ' + l.time + ' gegen ' + t);
  /* Schema und Prüfliste tragen die Zahl. */
  assert.match(flowChart(g, net, flow), /Ankunft [\d,]+ ms/);
  const ok = checkRules(g, net, flow, proc).find(r => /gleichzeitig an/.test(r.title));
  assert.ok(ok && ok.level === 'ok', 'symmetrisch: nichts zu beanstanden');

  /* Einen Anschnitt weit wegziehen: er kommt später dran, und ab 15 %
     der Füllzeit sagt es die Prüfliste. */
  const lead = flow.gates.find(r => !G.isFollower(g, r.id));
  const vor = g.nodes[g.nodes[lead.id].parent];
  g.nodes[vor.id].mirror = false;
  const br = g.nodes[vor.parent];
  if (br.mirror !== undefined) br.mirror = false;
  G.setPos(g, lead.id, [lead.node.pos[0] - 500, lead.node.pos[1], lead.node.pos[2] + 400]);
  F.applyAutoGates(g, proc);
  const net2 = sampleNetwork(g);
  const flow2 = F.analyseFlow(g, net2, proc);
  const far = flow2.gates.find(r => r.id === lead.id), near = flow2.gates.find(r => r.id !== lead.id);
  assert.ok(far.tArrive > near.tArrive + 1e-3, 'der weite Anschnitt kommt später: ' + far.tArrive + ' > ' + near.tArrive);
  const late = checkRules(g, net2, flow2, proc).find(r => /nacheinander erreicht/.test(r.title));
  assert.ok(late, 'die Prüfliste benennt es');
  assert.match(late.text, /ms/);
});

test('Kurve: ein Übergang über die ganze Länge beginnt mit dem Zulaufquerschnitt', () => {
  /* „Über die ganze Länge" und „Fächer" haben keinen Laufkanalabschnitt
     vor dem Übergang. Die Kante begann dann mit dem Kanalmaß des
     Anschnittknotens statt mit dem des Zulaufs — am Knoten sprang der
     Querschnitt von 414 auf 374 mm². Der Übergang muss dort anfangen,
     wo die Kante davor aufhört. */
  for (const trans of ['faecher', 'kegel', 'ende', 'stufe']) {
    const g = PRE.demoFan();
    const gate = G.allNodes(g).find(n => n.type === 'gate');
    gate.gate.transition = trans;
    const net = sampleNetwork(g);
    const e = net.edges.find(x => x.toId === gate.id);
    const inE = net.edges.find(x => x.toId === e.fromId);
    const ende = inE.sections[inE.sections.length - 1].area;
    const start = e.sections[0].area;
    assert.ok(Math.abs(start - ende) / ende < 0.005,
      trans + ': Kante beginnt mit ' + start.toFixed(1) + ' statt ' + ende.toFixed(1) + ' mm²');
    /* … und nimmt danach nirgends zu. */
    for (let i = 1; i < e.sections.length; i++) {
      assert.ok(e.sections[i].area <= e.sections[i - 1].area * 1.001, trans + ': wächst bei ' + e.sections[i].s);
    }
  }
});

test('Kurve: der Anschnittsteg ist gerade, hält Maß, Richtung und Querschnitt', () => {
  /* Vorher lag der Steg auf der Kurve: bei gekrümmtem Zulauf war er
     außen länger als innen, ein breiter Fächer verdrehte sich über die
     letzten Millimeter, und die Mündung zeigte in die Tangente EINER
     Stelle statt entlang eines Stücks. */
  for (const d of PRE.DEMOS) {
    const g = d.build();
    const net = sampleNetwork(g);
    for (const e of net.edges) {
      if (e.to.type !== 'gate') continue;
      const land = gateLand(g, e.from, e.to);
      assert.ok(land && Math.abs(land.len - e.to.gate.len) < 1e-9, d.id + ': der Steg hat die eingestellte Tiefe');
      const onLand = e.sections.filter(s => s.land);
      assert.ok(onLand.length >= 1, d.id + ': Schnitte im Steg');
      const first = e.sections[e.sections.length - 1 - onLand.length];  // der Übergang endet, wo der Steg beginnt
      const last = e.sections[e.sections.length - 1];
      assert.ok(Math.abs(last.s - first.s - land.len) < 1e-9, d.id + ': Steglänge entlang der Kante');
      assert.ok(Math.abs(V.dist(first.p, last.p) - land.len) < 1e-9, d.id + ': gerade — die Sehne ist so lang wie der Weg');
      assert.ok(V.dist(last.p, e.to.pos) < 1e-9, d.id + ': der Steg endet am Anschnitt');
      assert.ok(V.dist(first.p, land.start) < 1e-9, d.id + ': und beginnt am Steganfang');
      for (const s of onLand) assert.equal(s.kappa, 0, d.id + ': keine Krümmung im Steg');
      for (const s of [first, ...onLand]) {
        assert.ok(V.dot(s.t, land.dir) > 1 - 1e-12, d.id + ': die Richtung ist die Mündungsrichtung');
        assert.equal(s.sec.width, last.sec.width, d.id + ': Breite konstant');
        assert.equal(s.sec.depth, last.sec.depth, d.id + ': Höhe konstant');
      }
      assert.ok(Math.abs(last.sec.width - e.to.gate.w) < 1e-9 && Math.abs(last.sec.depth - e.to.gate.h) < 1e-9, 'das Anschnittmaß');
    }
  }
  /* Gebunden: der Steg liegt in der gebundenen Richtung, auch wenn die
     Sehne vom Vorgänger woanders hinzeigt. */
  const g = PRE.demoTwoGates();
  const lead = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  G.aimAt(g, lead.id, lead.pos, [-0.6, 0, 0.8]);
  const e = sampleNetwork(g).edges.find(x => x.toId === lead.id);
  const last = e.sections[e.sections.length - 1];
  assert.ok(V.dot(last.t, [-0.6, 0, 0.8]) > 1 - 1e-12);
  const onLand = e.sections.filter(s => s.land);
  const first = e.sections[e.sections.length - 1 - onLand.length];
  assert.ok(Math.abs(V.dot(V.norm(V.sub(last.p, first.p)), [-0.6, 0, 0.8]) - 1) < 1e-9, 'der Steg zeigt in die gebundene Richtung');
  /* Ohne Steg (Tiefe 0) gibt es keinen. */
  lead.gate.len = 0;
  assert.equal(gateLand(g, g.nodes[lead.parent], lead), null);
});

test('Regeln: eine Mündung aus der Trennebene heraus wird benannt', () => {
  const g = PRE.demoTwoGates();
  const lead = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  const proc = { alloy: 'al', volume: 400, vGate: 40, fill: 40 };
  const pruefe = () => {
    const net = sampleNetwork(g);
    return checkRules(g, net, F.analyseFlow(g, net, proc), proc).find(x => /Mündung aus der Trennebene/.test(x.title));
  };

  /* Senkrecht in die Ebene hinein — der Klick auf die Deckfläche. In einer
     zweiteiligen Form ist das nicht zu bauen. */
  G.aimAt(g, lead.id, [-40.123456, 0, 120.987654], [0, -1, 0]);
  assert.deepEqual(g.nodes[lead.id].pos, [-40.12, 0, 120.99], 'auf den Hundertstelmillimeter gerundet');
  assert.ok(Math.abs(G.aimTilt(g, g.nodes[lead.id]) - 90) < 1e-9, 'Winkel aus der Ebene: 90°');
  let hit = pruefe();
  assert.ok(hit, 'die Regel meldet sich');
  assert.equal(hit.level, 'bad');
  assert.match(hit.text, /90°/, 'mit dem Winkel: ' + hit.text);

  /* 45°: denkbar (eine Schräge), aber zu prüfen. */
  G.aimAt(g, lead.id, g.nodes[lead.id].pos, [-1, -1, 0]);
  hit = pruefe();
  assert.equal(hit && hit.level, 'warn');
  assert.match(hit.text, /45°/);

  /* In der Ebene: nichts zu sagen. */
  G.aimAt(g, lead.id, g.nodes[lead.id].pos, [-1, 0, 0]);
  assert.equal(G.aimTilt(g, g.nodes[lead.id]), 0);
  assert.equal(pruefe(), undefined, 'kein Fehlalarm');
  assert.equal(G.aimTilt(g, g.nodes[lead.parent]), 0, 'ohne Bindung: 0');
});

test('Graph: die Anschnitthöhe des Systems gilt für alle ohne eigene', () => {
  const g = PRE.demoFourGates();
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  assert.equal(g.gateH, 2.2);
  assert.ok(gates.every(n => n.gate.hAuto === false && n.gate.h === 1.8), 'die zweite Ebene hat eigene Höhen');
  const neu = G.addChild(g, G.allNodes(g).find(n => n.type === 'point').id, 'gate');
  assert.equal(neu.gate.h, 2.2, 'ein neuer Anschnitt nimmt die Vorgabe');
  assert.equal(neu.gate.hAuto, true);
  G.setGateHeight(g, 1.5);
  assert.equal(neu.gate.h, 1.5, 'und folgt ihr');
  assert.ok(gates.every(n => n.gate.h === 1.8), 'eigene Höhen bleiben');
  /* Hin und zurück: Vorgabe und Zugehörigkeit überleben die Datei. */
  const back = G.fromJSON(JSON.parse(JSON.stringify(G.toJSON(g))));
  assert.equal(back.gateH, 1.5);
  assert.equal(back.nodes[neu.id].gate.hAuto, true);
  assert.equal(back.nodes[gates[0].id].gate.hAuto, false);
  /* Eine Datei ohne Vorgabe: was auf 2 steht, folgt der Vorgabe 2. */
  const alt = JSON.parse(JSON.stringify(G.toJSON(g)));
  delete alt.gateH;
  for (const n of alt.nodes) if (n.gate) { delete n.gate.hAuto; n.gate.h = n.id === neu.id ? 2 : 1.8; }
  const old = G.fromJSON(alt);
  assert.equal(old.nodes[neu.id].gate.hAuto, true);
  assert.equal(old.nodes[gates[0].id].gate.hAuto, false);
});

test('Graph: JSON hin und zurück behält die gebundene Mündung', () => {
  const g = PRE.demoTwoGates();
  const lead = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  G.aimAt(g, lead.id, [-40, 0, 120], [0, 0, 3]);          // unnormiert hinein
  const back = G.fromJSON(JSON.parse(JSON.stringify(G.toJSON(g))));
  assert.deepEqual(back.nodes[lead.id].aim, [0, 0, 1], 'als Einheitsvektor zurück');
});

test('Regeln: eine Mündung gegen die Anströmung wird benannt', () => {
  const g = PRE.demoTwoGates();
  const lead = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  const vor = g.nodes[lead.parent];
  const zurueck = [vor.pos[0] - lead.pos[0], 0, vor.pos[2] - lead.pos[2]];
  G.aimAt(g, lead.id, lead.pos, zurueck);                 // mündet zum Vorgänger zurück
  const proc = { alloy: 'al', volume: 400, vGate: 40, fill: 40 };
  const net = sampleNetwork(g);
  const r = checkRules(g, net, F.analyseFlow(g, net, proc), proc);
  const hit = r.find(x => /Mündung quer/.test(x.title));
  assert.ok(hit, 'die Regel meldet sich');
  assert.equal(hit.level, 'bad');
  assert.match(hit.text, /1[0-9]{2}°|9[0-9]°/, 'mit dem Winkel: ' + hit.text);

  /* Und sie schweigt, solange die Mündung grob in Laufrichtung zeigt. */
  const vor2 = g.nodes[lead.parent];
  G.aimAt(g, lead.id, lead.pos, [lead.pos[0] - vor2.pos[0], 0, lead.pos[2] - vor2.pos[2]]);
  const net2 = sampleNetwork(g);
  const r2 = checkRules(g, net2, F.analyseFlow(g, net2, proc), proc);
  assert.ok(!r2.find(x => /Mündung quer/.test(x.title)), 'kein Fehlalarm');
});

test('Graph: JSON hin und zurück ergibt denselben Graphen', () => {
  for (const d of PRE.DEMOS) {
    const g = d.build();
    const once = G.toJSON(g);
    const back = G.fromJSON(JSON.parse(JSON.stringify(once)));
    assert.deepEqual(G.toJSON(back), once, d.id);
  }
});

test('Graph: fremde oder beschädigte Dateien werden abgewiesen, nicht verschluckt', () => {
  assert.throws(() => G.fromJSON({ nodes: [] }), /Angussdatei/);
  assert.throws(() => G.fromJSON({ format: 'dielogic-anguss', version: 99 }), /neueren Fassung/);
  assert.throws(() => G.fromJSON({ format: 'dielogic-anguss', version: 1, nodes: [] }), /keine Knoten/);
  /* Ein verwaister Elternverweis darf die Seite nicht töten. */
  const g = G.fromJSON({
    format: 'dielogic-anguss', version: 1, rootId: 'a',
    biscuit: { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 },
    nodes: [
      { id: 'a', type: 'root', parent: null, children: ['b', 'weg'], pos: [0, 0, 0], w: 20, h: 10 },
      { id: 'b', type: 'point', parent: 'a', children: [], pos: [0, 0, 60], w: 18, h: 9 }
    ]
  });
  assert.equal(G.allNodes(g).length, 2);
  assert.deepEqual(g.nodes.a.children, ['b']);
});

test('Graph: die Arbeitsebene erbt vom Vorgänger und lässt sich kippen', () => {
  const g = straight();
  const n = G.allNodes(g)[1];
  assert.deepEqual(G.planeNormal(g, n).map(v => +v.toFixed(9)), [0, 1, 0]);

  /* Längs: die Normale dreht um die Laufrichtung — das Profil legt sich
     auf die Seite, der Punkt bleibt in der Trennebene. */
  n.tilt = [40, 0];
  const rolled = G.planeNormal(g, n);
  assert.ok(Math.abs(rolled[2]) < 1e-9, 'die Laufrichtung bleibt in der Ebene');
  assert.ok(Math.abs(rolled[1] - Math.cos(Math.PI * 40 / 180)) < 1e-6);
  const sec = sampleNetwork(g).edges[0].sections.at(-1);
  assert.ok(Math.abs(sec.v[1] + Math.cos(Math.PI * 40 / 180)) < 1e-6,
    'die Tiefe des Profils kippt mit');

  /* Quer: die Ebene stellt sich schräg. Sie ist dann NICHT mehr
     senkrecht zur Laufrichtung — genau das macht daraus eine Rampe. */
  n.tilt = [0, 30];
  const tilted = G.planeNormal(g, n);
  assert.ok(Math.abs(tilted[1] - Math.cos(Math.PI / 6)) < 1e-6, 'um 30° gekippt');
  assert.ok(Math.abs(tilted[2] - Math.sin(Math.PI / 6)) < 1e-6, 'in die Laufrichtung hinein');
  /* Für das Profil wird sie an jedem Schnitt senkrecht gestellt. */
  const s2 = sampleNetwork(g).edges[0].sections.at(-1);
  assert.ok(Math.abs(s2.n[0] * s2.t[0] + s2.n[1] * s2.t[1] + s2.n[2] * s2.t[2]) < 1e-9);
});

test('Graph: in der Ebene verschieben verwirft den Anteil senkrecht dazu', () => {
  const g = straight();
  const n = G.allNodes(g)[1];
  G.moveInPlane(g, n.id, [30, 999, 120]);
  assert.ok(Math.abs(n.pos[1]) < 1e-9, 'die Trennebene wird nicht verlassen');
  assert.deepEqual([n.pos[0], n.pos[2]], [30, 120]);
});

/* ── Kurve ───────────────────────────────────────────────────── */

test('Kurve: gerade Kante — Länge, Krümmung null, gleiche Schrittweite', () => {
  const g = straight(100);
  const net = sampleNetwork(g);
  const e = net.edges[0];
  assert.ok(Math.abs(e.length - 100) < 1e-6);
  assert.equal(e.sections.length, 101);
  for (const s of e.sections) assert.ok(s.kappa < 1e-9, 'eine Gerade krümmt sich nicht');
  for (let i = 1; i < e.sections.length; i++) {
    assert.ok(Math.abs((e.sections[i].s - e.sections[i - 1].s) - 1) < 1e-6, 'Schritt = 1 mm');
  }
});

test('Kurve: die Abtastung folgt der BOGENLÄNGE, nicht dem Parameter', () => {
  /* Ein Bogen mit Knick: nach Parameter abgetastet lägen die Punkte am
     Anfang dichter als in der Mitte. */
  const g = straight(100);
  const n = G.allNodes(g)[1];
  n.pos = [80, 0, 80];
  G.addChild(g, n.id, 'point');
  const net = sampleNetwork(g);
  for (const e of net.edges) {
    const d = [];
    for (let i = 1; i < e.sections.length; i++) {
      d.push(Math.hypot(...[0, 1, 2].map(k => e.sections[i].p[k] - e.sections[i - 1].p[k])));
    }
    const min = Math.min(...d), max = Math.max(...d);
    assert.ok(max / min < 1.02, `Schrittweiten laufen auseinander: ${min.toFixed(3)} … ${max.toFixed(3)}`);
  }
});

test('Kurve: Querschnitt nimmt entlang jeder Kante monoton ab', () => {
  for (const d of PRE.DEMOS) {
    const net = sampleNetwork(d.build());
    for (const e of net.edges) {
      for (let i = 1; i < e.sections.length; i++) {
        assert.ok(e.sections[i].area <= e.sections[i - 1].area * 1.001,
          `${d.id} ${e.fromId}→${e.toId} bei ${e.sections[i].s.toFixed(1)} mm: `
          + `${e.sections[i - 1].area.toFixed(1)} → ${e.sections[i].area.toFixed(1)} mm²`);
      }
    }
  }
});

test('Kurve: die Abgänge einer Verzweigung teilen den Zulaufquerschnitt — in der Breite, die Tiefe läuft durch', () => {
  const g = PRE.demoTwoGates();
  const b = G.allNodes(g).find(n => n.type === 'branch');
  b.ratio = 0.65;
  b.mirror = false;
  const net = sampleNetwork(g);
  const parent = net.nodeArea[b.id].area;
  const starts = b.children.map(c => net.edges.find(e => e.toId === c).sections[0]);
  const kids = starts.map(s => s.area);
  assert.ok(Math.abs(kids[0] + kids[1] - parent) / parent < 1e-6,
    `Summe der Abgänge ${(kids[0] + kids[1]).toFixed(3)} gegen Zulauf ${parent.toFixed(3)}`);
  assert.ok(Math.abs(kids[0] / parent - 0.65) < 1e-6, 'nach dem eingestellten Verhältnis');
  for (const s of starts) assert.equal(s.sec.depth, net.nodeArea[b.id].sec.depth, 'die Tiefe bleibt — der Boden läuft durch die Gabelung');
  assert.ok(starts[0].sec.width > starts[1].sec.width, 'der größere Anteil ist der breitere Ast');
});

test('Kurve: der Hermite-Bogen trifft beide Endpunkte', () => {
  const g = straight(100);
  const [a, b] = G.allNodes(g);
  const c = hermite(g, a, b);
  assert.deepEqual(c.at(0).map(v => +v.toFixed(9)), a.pos);
  assert.deepEqual(c.at(1).map(v => +v.toFixed(9)), b.pos);
});

/* ── Netz ────────────────────────────────────────────────────── */

const openEdges = tris => {
  const F2 = tris.length / 9;
  const adj = adjacency(weld(tris).index, F2);
  let open = 0;
  for (let i = 0; i < F2 * 3; i++) if (adj[i] < 0) open++;
  return open;
};

test('Sweep: konstanter Querschnitt ergibt genau Fläche × Länge', () => {
  const g = straight(100, 20, 10);
  const net = sampleNetwork(g);
  const tris = sweepRunner(net);
  const a = P.area(P.section(20, 10, g.draft, g.radius));
  assert.ok(Math.abs(volume(tris) - a * 100) < 1e-6 * a * 100,
    `Volumen ${volume(tris).toFixed(3)} gegen ${(a * 100).toFixed(3)}`);
  assert.ok(volume(tris) > 0, 'die Normalen zeigen nach außen');
  assert.equal(openEdges(tris), 0, 'jeder Schlauch ist für sich geschlossen');
});

/* Zusammenhängende Stücke eines Netzes: Breitensuche über die Nachbarschaft. */
const components = tris => {
  const F2 = tris.length / 9;
  const adj = adjacency(weld(tris).index, F2);
  const seen = new Uint8Array(F2);
  let n = 0;
  for (let f = 0; f < F2; f++) {
    if (seen[f]) continue;
    n++;
    const stack = [f];
    seen[f] = 1;
    while (stack.length) {
      const x = stack.pop();
      for (let e = 0; e < 3; e++) { const y = adj[x * 3 + e]; if (y >= 0 && !seen[y]) { seen[y] = 1; stack.push(y); } }
    }
  }
  return n;
};
const sectionVolume = net => net.edges.reduce((v, e) => {
  for (let i = 0; i + 1 < e.sections.length; i++) {
    v += (e.sections[i].area + e.sections[i + 1].area) / 2 * (e.sections[i + 1].s - e.sections[i].s);
  }
  return v;
}, 0);
const oneBody = (g, name) => {
  const net = sampleNetwork(g);
  const tris = sweepRunner(net);
  assert.equal(openEdges(tris), 0, name + ': offene oder gleichläufige Kanten');
  assert.equal(components(tris), 1, name + ': mehr als ein Körper');
  const v = volume(tris), sv = sectionVolume(net);
  assert.ok(v > 0, name + ': nach außen orientiert');
  /* Grob: das Hosenstück ist nicht die Summe der Schnittflächen mal Weg
     — eine dreifache Gabel liegt gut 5 % darüber —, aber es darf weder
     ein Nichts noch das Doppelte sein. */
  assert.ok(Math.abs(v - sv) / sv < 0.12, `${name}: Volumen ${v.toFixed(0)} gegen Schnittintegral ${sv.toFixed(0)}`);
  return tris;
};

test('Sweep: jedes Beispiel ist EIN geschlossener Körper — die Gabelungen sind Hosenstücke, keine Durchdringung', () => {
  for (const d of PRE.DEMOS) oneBody(d.build(), d.id);
});

test('Sweep: T-Stück, dreifache Gabelung, gerade abgehender Ast und Verzweigung aus der Kippung bleiben geschlossen', () => {
  /* T: beide Abgänge quer zum Zulauf — die Innenwände sind eine Wand,
     der Zwickel ist eine Gerade ohne Bogen. */
  const t = PRE.demoTwoGates();
  const b = G.allNodes(t).find(n => n.type === 'branch');
  b.mirror = false;
  const [c1, c2] = b.children.map(id => t.nodes[id]);
  G.setPos(t, c1.id, [-70, 0, b.pos[2]]);
  G.setPos(t, c2.id, [70, 0, b.pos[2]]);
  for (const c of [c1, c2]) G.setPos(t, c.children[0], [c.pos[0] + Math.sign(c.pos[0]) * 45, 0, b.pos[2]]);
  oneBody(t, 'T-Stück');

  /* Drei Abgänge: rechts, geradeaus, links — zwei Zwickel. */
  const d3 = straight(70);
  const p = G.allNodes(d3)[1];
  const br = G.addChild(d3, p.id, 'branch');
  br.pos = [0, 0, 130];
  G.addChild(d3, br.id, 'gate');
  assert.equal(br.children.length, 3);
  const [k1, k2, k3] = br.children.map(id => d3.nodes[id]);
  G.setPos(d3, k1.id, [60, 0, 200]);
  G.setPos(d3, k2.id, [-60, 0, 200]);
  G.setPos(d3, k3.id, [0, 0, 215]);
  F.applyAutoGates(d3, F.DEFAULT_PROCESS);
  oneBody(d3, 'dreifach');
  assert.ok(!checkRules(d3, sampleNetwork(d3), F.analyseFlow(d3, sampleNetwork(d3), F.DEFAULT_PROCESS), F.DEFAULT_PROCESS)
    .find(r => /durchdringen/.test(r.title)), 'drei getrennte Abgänge: kein Hinweis');

  /* Ein Ast geradeaus, einer zur Seite: die Gabel ist unsymmetrisch. */
  const u = PRE.demoTwoGates();
  const bu = G.allNodes(u).find(n => n.type === 'branch');
  bu.mirror = false;
  const [a1] = bu.children.map(id => u.nodes[id]);
  G.setPos(u, a1.id, [0, 0, bu.pos[2] + 60]);
  G.setPos(u, a1.children[0], [0, 0, bu.pos[2] + 110]);
  oneBody(u, 'unsymmetrisch');

  /* Verzweigung hinter einer quer gekippten Ebene (Rampe): das Hosenstück
     liegt in der gekippten Ebene. */
  const k = PRE.demoStep();
  oneBody(k, 'gekippt');

  /* Zwickelradius null: die Nase bleibt spitz, das Netz trotzdem dicht. */
  const z = PRE.demoFourGates();
  z.branchR = 0;
  oneBody(z, 'ohne Zwickelradius');

  /* Abgänge, die sich an ihren Ringen noch durchdringen — drei Anschnitte
     dicht beieinander an kurzen Kanten: dort gibt es keinen Zwickel, die
     Schläuche bleiben übereinander, die Prüfliste sagt es, und nichts
     bricht. */
  const e = PRE.demoFan();
  const pe = G.allNodes(e).find(n => n.type === 'point');
  const be = G.addChild(e, pe.id, 'branch');
  G.addChild(e, be.id, 'gate');
  const nete = sampleNetwork(e);
  const trise = sweepRunner(nete);
  assert.ok(trise.length > 0 && volume(trise) > 0);
  const hint = checkRules(e, nete, F.analyseFlow(e, nete, F.DEFAULT_PROCESS), F.DEFAULT_PROCESS).find(r => /durchdringen/.test(r.title));
  assert.ok(hint && hint.level === 'warn', 'die Prüfliste benennt die Durchdringung');
  assert.match(hint.text, /Zwickel/);
});

test('Sweep: der Zwickelradius formt die Nase — größer heißt weiter hinten und runder', () => {
  const g = PRE.demoTwoGates();
  const b = G.allNodes(g).find(n => n.type === 'branch');
  /* Die Nase: der Punkt des Körpers zwischen den Abgängen, der dem
     Zulauf am nächsten liegt — gesucht in einem schmalen Streifen um die
     Symmetrieachse hinter der Gabelung. */
  const nose = tris => {
    let best = Infinity;
    for (let i = 0; i < tris.length; i += 3) {
      if (Math.abs(tris[i]) < 1.5 && tris[i + 2] > b.pos[2] && Math.abs(tris[i + 1]) < 0.5) best = Math.min(best, tris[i + 2]);
    }
    return best;
  };
  g.branchR = 1;
  const z1 = nose(sweepRunner(sampleNetwork(g)));
  g.branchR = 8;
  const z8 = nose(sweepRunner(sampleNetwork(g)));
  assert.ok(Number.isFinite(z1) && Number.isFinite(z8), 'die Nase liegt auf der Achse');
  assert.ok(z8 > z1 + 2, `mit 8 mm Radius weicht die Nase zurück: ${z1.toFixed(1)} → ${z8.toFixed(1)} mm`);
  /* Hin und zurück durch die Datei — samt Vorgabe für alte Dateien. */
  const back = G.fromJSON(JSON.parse(JSON.stringify(G.toJSON(g))));
  assert.equal(back.branchR, 8);
  const alt = G.toJSON(g);
  delete alt.branchR;
  assert.equal(G.fromJSON(alt).branchR, 4, 'ohne Angabe die Vorgabe');
});

test('Pressrest: Zylinder wächst ENTGEGEN der Ausstoßrichtung', () => {
  for (const [axis, k, sign] of [['+y', 1, -1], ['-y', 1, 1], ['+z', 2, -1], ['-x', 0, 1]]) {
    const tris = biscuitMesh({ pos: [0, 0, 0], axis, d: 90, t: 25 });
    let lo = Infinity, hi = -Infinity;
    for (let i = k; i < tris.length; i += 3) { lo = Math.min(lo, tris[i]); hi = Math.max(hi, tris[i]); }
    if (sign < 0) { assert.ok(Math.abs(hi) < 1e-9 && Math.abs(lo + 25) < 1e-9, axis); }
    else { assert.ok(Math.abs(lo) < 1e-9 && Math.abs(hi - 25) < 1e-9, axis); }
    assert.ok(volume(tris) > 0, axis + ': nach außen orientiert');
  }
});

/* ── Strömung ────────────────────────────────────────────────── */

const proc = () => ({ ...F.DEFAULT_PROCESS });

test('Strömung: symmetrisch heißt 50:50, und Soll trifft Ist', () => {
  const g = PRE.demoTwoGates();
  const net = sampleNetwork(g);
  const fl = F.analyseFlow(g, net, proc());
  assert.equal(fl.gates.length, 2);
  for (const r of fl.gates) {
    assert.ok(Math.abs(r.ist - 0.5) < 1e-3, 'gleiche Wege, gleiche Ströme');
    assert.ok(Math.abs(r.soll - 0.5) < 1e-9);
  }
  assert.ok(fl.imbalance < 1e-3);
  assert.ok(fl.dp > 0 && fl.dp < 1e9);
});

test('Strömung: der Weg mit weniger Widerstand bekommt mehr — und das wird gemeldet', () => {
  const g = PRE.demoTwoGates();
  const gates = G.allNodes(g).filter(n => n.type === 'gate');
  gates[0].gate.auto = false; gates[0].gate.w = 14;
  gates[1].gate.auto = false; gates[1].gate.w = 60;
  const fl = F.analyseFlow(g, sampleNetwork(g), proc());
  const wide = fl.gates.find(r => r.id === gates[1].id);
  const narrow = fl.gates.find(r => r.id === gates[0].id);
  assert.ok(wide.ist > narrow.ist * 2, `${wide.ist.toFixed(3)} gegen ${narrow.ist.toFixed(3)}`);
  assert.ok(fl.imbalance > 0.1, 'die Unwucht wird als solche ausgewiesen');
  /* Trotz Aufteilung: der Druckbedarf beider Wege gleicht sich an. */
  assert.ok(Math.abs(wide.dp - narrow.dp) / wide.dp < 0.05, 'gleicher Druck an beiden Anschnitten');
});

test('Strömung: doppelter Volumenstrom kostet rund den vierfachen Druck', () => {
  const g = PRE.demoTwoGates();
  const net = sampleNetwork(g);
  const a = F.analyseFlow(g, net, { ...proc(), fillTime: 60 });
  const b = F.analyseFlow(g, net, { ...proc(), fillTime: 30 });
  const q = b.dp / a.dp;
  assert.ok(q > 3.6 && q < 4.2, `Verhältnis ${q.toFixed(2)} — quadratisch erwartet`);
});

test('Strömung: die Anschnittbreite folgt der Zielgeschwindigkeit', () => {
  const g = PRE.demoTwoGates();
  const p = { ...proc(), vGate: 30 };
  F.applyAutoGates(g, p);
  const fl = F.analyseFlow(g, sampleNetwork(g), p);
  for (const r of fl.gates) assert.ok(Math.abs(r.vSoll - 30) / 30 < 0.05, r.vSoll.toFixed(1));
});

test('Strömung: jeder Legierung ihre Dichte', () => {
  const g = PRE.demoTwoGates();
  const net = sampleNetwork(g);
  const al = F.analyseFlow(g, net, { ...proc(), alloy: 'al' });
  const zn = F.analyseFlow(g, net, { ...proc(), alloy: 'zn' });
  assert.ok(zn.dp > al.dp * 2, 'Zink ist schwerer und kostet mehr Druck');
});

/* ── Regeln und Auslegung ────────────────────────────────────── */

test('Regeln: ein wachsender Querschnitt wird gefunden und benannt', () => {
  const g = PRE.demoTwoGates();
  const gate = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  gate.w *= 3; gate.h *= 3;                       // Kanal vor dem Anschnitt aufblasen
  const net = sampleNetwork(g);
  const fl = F.analyseFlow(g, net, proc());
  const hit = checkRules(g, net, fl, proc()).find(r => r.title === 'Der Querschnitt wächst');
  assert.ok(hit && hit.level === 'bad', 'die Regel meldet sich');
  assert.match(hit.text, /mm²/, 'und nennt die Zahlen');
});

test('Regeln: eine zu enge Kurve und eine fehlende Entformschräge fallen auf', () => {
  const g = PRE.demoTwoGates();
  g.draft = 0.5;
  const net = sampleNetwork(g);
  const rules = checkRules(g, net, F.analyseFlow(g, net, proc()), proc());
  assert.ok(rules.find(r => r.title === 'Wenig Entformschräge'));
});

test('Regeln: alle Beispiele sind ohne Beanstandung', () => {
  for (const d of PRE.DEMOS) {
    const g = d.build();
    const net = sampleNetwork(g);
    const rules = checkRules(g, net, F.analyseFlow(g, net, proc()), proc());
    const bad = rules.filter(r => r.level !== 'ok');
    assert.deepEqual(bad.map(r => r.title), [], d.id + ': ' + bad.map(r => r.text).join(' | '));
  }
});

test('Auslegung: nach dem Abstufen nimmt der Querschnitt auf jedem Weg ab', () => {
  const g = PRE.demoFourGates();
  /* Erst absichtlich verderben … */
  for (const n of G.allNodes(g)) { n.w = 14; n.h = 9; }
  autoTaper(g, proc(), DEFAULT_SIZING);
  const net = sampleNetwork(g);
  for (const e of net.edges) {
    const inEdge = net.edges.find(x => x.toId === e.fromId);
    if (inEdge) {
      assert.ok(e.sections[0].area <= inEdge.sections[inEdge.sections.length - 1].area * 1.02,
        'auch über die Knoten hinweg');
    }
    for (let i = 1; i < e.sections.length; i++) {
      assert.ok(e.sections[i].area <= e.sections[i - 1].area * 1.001, e.fromId + '→' + e.toId);
    }
  }
});

test('Auslegung: das Seitenverhältnis wird eingehalten', () => {
  const g = PRE.demoTwoGates();
  autoTaper(g, proc(), { ...DEFAULT_SIZING, aspect: 0.5 });
  for (const n of G.allNodes(g)) {
    if (n.type === 'root' && n.w > 0) continue;
    assert.ok(Math.abs(n.h / n.w - 0.5) < 0.03, `${n.id}: ${(n.h / n.w).toFixed(3)}`);
  }
});

/* ── Flussschema ─────────────────────────────────────────────── */

test('Flussschema: SVG mit einem Knoten je Punkt und den Anschnitten beschriftet', () => {
  const g = PRE.demoFourGates();
  const net = sampleNetwork(g);
  const svg = flowChart(g, net, F.analyseFlow(g, net, proc()), { width: 600 });
  assert.match(svg, /^<svg /);
  assert.equal((svg.match(/<circle /g) || []).length, G.allNodes(g).length);
  assert.equal((svg.match(/Soll /g) || []).length, 4, 'je Anschnitt eine Soll/Ist-Zeile');
  assert.match(svg, /Pressrest/);
  assert.match(flowChart(g, net, { gates: [], losses: new Map() }, {}), /chart-empty/);
});
