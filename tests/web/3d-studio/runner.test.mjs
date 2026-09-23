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
const { sweepRunner, biscuitMesh, junctionPlan } = await import(R + 'js/runner/sweep.js');
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

test('Graph: Kennungen aus der Datei — nur harmlose; eine Datei mit anderen wird abgewiesen', () => {
  /* Die Kennungen landen in der Seite (Kopfzeile des Auswahlfelds, Prüfliste,
     Tabelle der Angussfüllung). Eine präparierte lief dort als HTML. */
  const good = () => JSON.parse(JSON.stringify(G.toJSON(PRE.demoTwoGates())));
  const swap = (obj, from, to) => {
    for (const n of obj.nodes) {
      if (n.id === from) n.id = to;
      if (n.parent === from) n.parent = to;
      n.children = n.children.map(c => (c === from ? to : c));
    }
    if (obj.rootId === from) obj.rootId = to;
    return obj;
  };
  const gateId = good().nodes.find(n => n.type === 'gate').id;
  const evil = 'k3<img src=x onerror="window.__pwned=1">';
  assert.throws(() => G.fromJSON(swap(good(), gateId, evil)), /der Datei .*ungültige Kennung/);
  const o1 = good();
  o1.nodes.find(n => n.id === gateId).id = evil;
  assert.throws(() => G.fromJSON(o1), /Knoten Nr\. \d+ der Datei hat eine ungültige Kennung/);
  /* Ein Verweis allein genügt: ein Kind, das so heißt. */
  const o2 = good();
  o2.nodes.find(n => n.children.length).children.push(evil);
  assert.throws(() => G.fromJSON(o2), /verweist auf eine ungültige Kennung/);
  const o3 = good();
  o3.rootId = '<b>';
  assert.throws(() => G.fromJSON(o3), /Wurzelknoten der Datei hat eine ungültige Kennung/);
  /* Namen, die jedes Objekt mitbringt, und doppelte Kennungen ebenso. */
  assert.throws(() => G.fromJSON(swap(good(), gateId, 'constructor')), /ungültige Kennung/);
  const o4 = good();
  o4.nodes.push({ ...o4.nodes[o4.nodes.length - 1] });
  assert.throws(() => G.fromJSON(o4), /zweimal/);
  /* Was ein Mensch sinnvoll hineinschreibt, geht. */
  const ok = G.fromJSON(swap(good(), gateId, 'Anschnitt_links-2'));
  assert.equal(ok.nodes['Anschnitt_links-2'].type, 'gate', 'Buchstaben, Ziffern, _ und -');
  const neu = G.addChild(ok, ok.nodes['Anschnitt_links-2'].parent, 'point');
  assert.ok(neu && !['Anschnitt_links-2'].includes(neu.id) && /^k\d+$/.test(neu.id), 'eine neue Kennung kollidiert mit nichts: ' + neu.id);

  /* Die übrigen Werte der Datei: nur Bekanntes, nur Zahlen. */
  const o5 = good();
  const gate = o5.nodes.find(n => n.type === 'gate');
  gate.gate.transition = '<img src=x>';
  gate.gate.w = 'breit';
  o5.nodes.find(n => n.type === 'point').type = 'constructor';
  o5.biscuit.axis = 'toString';
  o5.biscuit.d = '<90>';
  const back = G.fromJSON(o5);
  assert.equal(back.nodes[gate.id].gate.transition, 'ende', 'ein unbekannter Übergang wird der voreingestellte');
  assert.equal(back.nodes[gate.id].gate.w, 20, 'keine Zahl: die Vorgabe');
  assert.ok(G.allNodes(back).every(n => Object.hasOwn(G.TYPES, n.type)), 'nur bekannte Knotenarten');
  assert.equal(back.biscuit.axis, '+y');
  assert.equal(back.biscuit.d, 90);

  /* Ein Kreis in der Datei legt nichts lahm: die Wurzel hat keinen Vorgänger. */
  const ring = G.fromJSON({
    format: 'dielogic-anguss', version: 1, rootId: 'a',
    nodes: [
      { id: 'a', type: 'root', parent: 'b', children: ['b'], pos: [0, 0, 0], w: 20, h: 10 },
      { id: 'b', type: 'point', parent: 'a', children: ['a'], pos: [0, 0, 60], w: 18, h: 9 },
      { id: 'c', type: 'point', parent: 'd', children: ['d'], pos: [0, 0, 90], w: 18, h: 9 },
      { id: 'd', type: 'point', parent: 'c', children: ['c'], pos: [0, 0, 99], w: 18, h: 9 }
    ]
  });
  assert.equal(ring.nodes.a.parent, null);
  assert.deepEqual(Object.keys(ring.nodes).sort(), ['a', 'b'], 'was von der Wurzel aus nicht zu erreichen ist, fällt weg');
  assert.ok(sampleNetwork(ring).edges.length === 1);
});

test('Graph: die Ausstoßrichtung umstellen dreht auch die gebundenen Mündungen mit', () => {
  /* Vorher drehten Lagen und Bauteil, die Mündungen nicht: ein entlang seiner
     Sehne gebundener Anschnitt zeigte nach „+y → +z" 90° aus seiner Ebene. */
  const g = PRE.demoTwoGates();
  const lead = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  G.aimAt(g, lead.id, lead.pos, G.chordDir(g, lead));
  assert.ok(G.aimTilt(g, g.nodes[lead.id]) < 1e-6, 'gebunden in der Ebene');
  const before = G.allNodes(g).map(n => n.pos.slice());
  const { ang } = G.turnSystem(g, '+z');
  assert.ok(Math.abs(ang - Math.PI / 2) < 1e-12);
  assert.equal(g.biscuit.axis, '+z');
  for (const n of G.allNodes(g).filter(x => x.type === 'gate')) {
    assert.ok(G.aimTilt(g, n) < 1e-6, n.id + ' bleibt in seiner Ebene: ' + G.aimTilt(g, n) + '°');
    assert.ok(Math.abs(V.dot(n.aim, G.chordDir(g, n)) - 1) < 1e-9, n.id + ' zeigt weiter entlang der Sehne');
  }
  /* Und zurück: alles wie vorher. */
  G.turnSystem(g, '+y');
  G.allNodes(g).forEach((n, i) => assert.ok(V.dist(n.pos, before[i]) < 1e-9, n.id));
  assert.equal(G.turnSystem(g, '+y').ang, 0, 'dieselbe Richtung: nichts zu drehen');
});

test('Graph: Spiegeln — eine neue Gabelung ist sofort auf beiden Seiten, ein wiederverwendeter Knoten behält nichts Altes', () => {
  /* (a) Eine Verzweigung auf der führenden Seite: die Gegenseite hatte sie
     erst nach der nächsten Änderung — und so wurde der Plan gespeichert. */
  const g = PRE.demoTwoGates();
  const b = G.allNodes(g).find(n => n.type === 'branch' && n.mirror);
  const lead = G.allNodes(g).find(n => n.type === 'gate' && !G.isFollower(g, n.id));
  const n0 = G.allNodes(g).length;
  assert.ok(G.addChild(g, lead.parent, 'branch'));
  assert.equal(G.allNodes(g).length, n0 + 6, 'Verzweigung und zwei Anschnitte auf jeder Seite');
  /* Beide Seiten Knoten für Knoten: gleiche Art, gleiche Aufteilung. */
  const pairs = (x, y, out = []) => {
    out.push([x, y]);
    x.children.forEach((c, i) => pairs(g.nodes[c], g.nodes[y.children[i]], out));
    return out;
  };
  const same = () => {
    const [l, f] = [b.children.find(id => !G.isFollower(g, id)), b.children.find(id => G.isFollower(g, id))].map(id => g.nodes[id]);
    for (const [x, y] of pairs(l, f)) {
      assert.equal(y.type, x.type, x.id + ' / ' + y.id);
      assert.equal(y.children.length, x.children.length, x.id + ' / ' + y.id);
      assert.equal(y.ratio, x.ratio, 'Aufteilung ' + x.id + ' / ' + y.id);
      assert.equal(y.mirror, x.mirror, 'Spiegelung ' + x.id + ' / ' + y.id);
    }
  };
  same();

  /* (b) Der Weg aus der Oberfläche: davor einfügen, eine Verzweigung anhängen
     und 80:20 stellen, einen ihrer Anschnitte entfernen, einen Punkt anfügen
     — die Gegenseite teilte danach 80:20, die führende 50:50. */
  const g2 = PRE.demoTwoGates();
  const b2 = G.allNodes(g2).find(n => n.type === 'branch' && n.mirror);
  const lead2 = G.allNodes(g2).find(n => n.type === 'gate' && !G.isFollower(g2, n.id));
  const m = G.insertBefore(g2, lead2.id, 'point');
  const nb = G.addChild(g2, m.id, 'branch');
  G.setField(g2, nb.id, 'ratio', 0.8);
  G.removeNode(g2, nb.children[0]);
  assert.equal(g2.nodes[nb.id].type, 'point');
  const twin = () => {
    const l = g2.nodes[b2.children.find(id => !G.isFollower(g2, id))], f = g2.nodes[b2.children.find(id => G.isFollower(g2, id))];
    const walkBoth = (x, y) => (x.id === nb.id ? y : x.children.map((c, i) => walkBoth(g2.nodes[c], g2.nodes[y.children[i]])).find(Boolean));
    return walkBoth(l, f);
  };
  assert.equal(twin().ratio, undefined, 'die Gegenseite hat kein Verhältnis mehr');
  G.addChild(g2, nb.id, 'point');
  const t = twin();
  assert.equal(t.type, g2.nodes[nb.id].type);
  assert.equal(G.branchShare(g2, t, t.children[0]), G.branchShare(g2, g2.nodes[nb.id], g2.nodes[nb.id].children[0]), 'beide Seiten teilen gleich');
});

test('Graph: eine gespiegelte Gabelung bekommt keinen dritten Ast; ein Punkt mit zweitem Abgang wird Verzweigung', () => {
  /* (c) Ein dritter Ast schaltete die Spiegelung still ab; entfernte man ihn
     später, spiegelte sie wieder und überschrieb die Gegenseite. */
  const g = PRE.demoTwoGates();
  const b = G.allNodes(g).find(n => n.type === 'branch' && n.mirror);
  assert.equal(G.addChild(g, b.id, 'gate'), null, 'verweigert');
  assert.equal(b.children.length, 2);
  assert.ok(G.isMirrorBranch(b), 'sie spiegelt weiter');
  b.mirror = false;
  assert.ok(G.addChild(g, b.id, 'gate'), 'ohne Spiegelung geht es');
  assert.equal(b.children.length, 3);
  /* Eine Datei mit „gespiegelter" Gabel aus drei Ästen spiegelt nicht — und
     springt nicht zurück, wenn einer wegfällt. */
  const o = JSON.parse(JSON.stringify(G.toJSON(g)));
  o.nodes.find(n => n.id === b.id).mirror = true;
  const back = G.fromJSON(o);
  assert.equal(back.nodes[b.id].mirror, false);

  /* Ein Punkt mit einem zweiten Abgang: geometrisch schon eine Gabelung —
     jetzt auch mit Aufteilung und Spiegel-Häkchen. */
  const s = straight(100);
  const p = G.allNodes(s)[1];
  G.addChild(s, p.id, 'gate');
  assert.equal(p.type, 'point', 'ein Abgang: ein Punkt');
  G.addChild(s, p.id, 'branch');
  assert.equal(p.type, 'branch', 'zwei: eine Verzweigung');
  assert.equal(p.ratio, 0.5);
  assert.equal(p.mirror, false);
  G.removeNode(s, p.children[1]);
  assert.equal(p.type, 'point', 'und mit einem Abgang wieder ein Punkt');
  /* Aus einer Datei ebenso. */
  const f = JSON.parse(JSON.stringify(G.toJSON(s)));
  const fp = f.nodes.find(n => n.id === p.id);
  f.nodes.push({ id: 'z1', type: 'gate', parent: p.id, children: [], pos: [30, 0, 140], w: 8, h: 3, gate: { h: 2, len: 4, w: 20, auto: true, transition: 'ende' } });
  fp.children.push('z1');
  const fb = G.fromJSON(f);
  assert.equal(fb.nodes[p.id].type, 'branch');
  assert.equal(fb.nodes[p.id].ratio, 0.5);
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

test('Sweep: konstanter Querschnitt ergibt genau Fläche × Länge — und beschnitten Fläche × Länge außerhalb des Pressrests', () => {
  const g = straight(100, 20, 10);
  const net = sampleNetwork(g);
  const a = P.area(P.section(20, 10, g.draft, g.radius));
  /* Ohne Pressrest im Netz: der nackte Schlauch. */
  const raw = sweepRunner({ ...net, biscuit: null });
  assert.ok(Math.abs(volume(raw) - a * 100) < 1e-6 * a * 100,
    `Volumen ${volume(raw).toFixed(3)} gegen ${(a * 100).toFixed(3)}`);
  assert.ok(volume(raw) > 0, 'die Normalen zeigen nach außen');
  assert.equal(openEdges(raw), 0, 'jeder Schlauch ist für sich geschlossen');
  /* Mit Pressrest (Ø 90): der Kanal beginnt am Mantel. Die Seitenlinien
     treten früher aus als die Mitte (√(R² − x²)), das gibt im Mittel
     w²/(24R) mehr Länge als L − R. */
  const R = g.biscuit.d / 2;
  const trimmed = sweepRunner(net);
  const expect = a * (100 - R + 20 * 20 / (24 * R));
  assert.ok(Math.abs(volume(trimmed) - expect) < a * 0.3,
    `beschnitten ${volume(trimmed).toFixed(1)} gegen ${expect.toFixed(1)}`);
  assert.equal(openEdges(trimmed), 0, 'auch beschnitten geschlossen');
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
     — eine dreifache Gabel liegt gut 5 % darüber —, und der Beschnitt
     am Pressrest nimmt das Stück im Zylinder weg; es darf aber weder
     ein Nichts noch das Doppelte sein. */
  assert.ok(v > sv * 0.6 && v < sv * 1.15, `${name}: Volumen ${v.toFixed(0)} gegen Schnittintegral ${sv.toFixed(0)}`);
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

test('Sweep: eine kurze Kante zwischen zwei Gabelungen bleibt geschlossen, auch bei grobem Abtastschritt', () => {
  /* Zwei gespiegelte Gabelungen 18 bis 29 mm auseinander, Abtastschritt ab
     2,5 mm: zwischen den Trimmstellen beider Hosenstücke lag kein Schnitt,
     der Schlauch dazwischen fiel weg — 104 offene Kanten, das STL war nicht
     dicht, und keine Regel sagte etwas. */
  const forks = (gap, deg) => {
    const g = G.emptyGraph();
    G.setBiscuit(g, { pos: [0, 0, 0], axis: '+y', d: 90, t: 25 });
    const p1 = G.makeNode(g, 'point', G.root(g), [0, 0, 60]);
    const b1 = G.makeNode(g, 'branch', p1, [0, 0, 110]);
    b1.mirror = true;
    const a = deg * Math.PI / 180;
    const b2 = G.makeNode(g, 'branch', b1, [-gap * Math.sin(a), 0, 110 + gap * Math.cos(a)]);
    b2.mirror = true;
    const gt = G.makeNode(g, 'gate', b2, [b2.pos[0] - 45, 0, b2.pos[2] + 30]);
    gt.gate = { h: 2.2, hAuto: false, len: 4, w: 26, auto: true, transition: 'ende' };
    G.normalizeMirrors(g);
    F.applyAutoGates(g, F.DEFAULT_PROCESS);
    autoTaper(g, F.DEFAULT_PROCESS, DEFAULT_SIZING);
    return g;
  };
  for (const [step, gap, deg] of [[2.5, 18, 40], [3, 22, 40], [3, 28, 30], [4, 20, 40], [4, 29, 30]]) {
    const g = forks(gap, deg);
    g.step = step;
    const name = `Gabeln ${gap} mm auseinander, Schritt ${step} mm`;
    assert.ok(!junctionPlan(sampleNetwork(g)).some(j => j.degenerate), name + ': Hosenstücke, keine Durchdringung');
    oneBody(g, name);
  }
});

test('Sweep: der Anguss ist am Pressrest beschnitten — nichts steckt im Zylinder, der Deckel liegt auf seinen Facetten', () => {
  /* Der Pressrest als 64-Eck, so wie biscuitMesh ihn baut: ein Punkt ist
     drinnen, wenn er innerhalb des Apothems liegt. */
  const inside = (tris, b) => {
    const seg = 64, R = b.d / 2, apothem = R * Math.cos(Math.PI / seg);
    let deepest = -Infinity, onMantle = 0, count = 0;
    for (let i = 0; i < tris.length; i += 3) {
      const x = tris[i] - b.pos[0], z = tris[i + 2] - b.pos[2];      // Achse +y
      /* Abstand zur nächsten Facettenebene (Prismenecken bei 2πk/64 in
         der x/−z-Ebene der Achsenabbildung von js/solids.js). */
      let f = -Infinity;
      for (let k = 0; k < seg; k++) {
        const a = 2 * Math.PI * (k + 0.5) / seg;
        f = Math.max(f, x * Math.cos(a) - z * Math.sin(a) - apothem);
      }
      deepest = Math.max(deepest, -f);
      if (Math.abs(f) < 1e-6) onMantle++;
      count++;
    }
    return { deepest, onMantle, count };
  };
  for (const d of PRE.DEMOS) {
    const g = d.build();
    const net = sampleNetwork(g);
    const tris = sweepRunner(net);
    const r = inside(tris, g.biscuit);
    assert.ok(r.deepest < 1e-6, `${d.id}: ein Punkt liegt ${r.deepest.toFixed(3)} mm im Pressrest`);
    assert.ok(r.onMantle > P.POINTS, `${d.id}: der Deckel liegt auf dem Mantel (${r.onMantle} Punkte)`);
    assert.equal(openEdges(tris), 0, d.id + ': geschlossen');
    assert.equal(components(tris), 1, d.id + ': ein Körper');
    /* Und das Volumen fehlt genau um das Stück im Zylinder — grob: die
       Schnitte innerhalb des Radius. */
    let inner = 0, all = 0;
    for (const e of net.edges) {
      for (let i = 0; i + 1 < e.sections.length; i++) {
        const dv = (e.sections[i].area + e.sections[i + 1].area) / 2 * (e.sections[i + 1].s - e.sections[i].s);
        all += dv;
        if (e.from.type === 'root' && e.sections[i + 1].s <= g.biscuit.d / 2) inner += dv;
      }
    }
    const v = volume(tris);
    assert.ok(inner > 0 && Math.abs(v - (all - inner)) / (all - inner) < 0.12,
      `${d.id}: Volumen ${v.toFixed(0)} gegen ${(all - inner).toFixed(0)} außerhalb des Pressrests`);
  }
  /* Ein Kanal, der den Zylinder nicht verlässt, bleibt mit Deckel in der
     Mitte stehen — und der Körper trotzdem dicht. */
  const short = straight(30, 20, 10);
  G.addChild(short, G.allNodes(short)[1].id, 'gate');
  const net2 = sampleNetwork(short);
  net2.trimLog = [];
  const tris2 = sweepRunner(net2);
  assert.equal(net2.trimLog[0].reason, 'tritt nicht aus');
  assert.equal(openEdges(tris2), 0);
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

test('Strömung: das Stück im Pressrest ist Pressrest — kein Angussvolumen, keine Laufzeit', () => {
  /* Der erste Kanal beginnt in der Mitte des Pressrests. Bis zu dessen
     Mantel zählte er als Anguss (und in der Kurve ein zweites Mal als
     Pressrest), und die Laufzeit begann dort, wo bei „Kammer voll" längst
     Schmelze steht. Gerade Kante, 100 mm, Pressrest Ø 90: 55 mm zählen. */
  const g = straight(100, 20, 10);
  const net = sampleNetwork(g);
  const e = net.edges[0];
  assert.ok(Math.abs(e.s0 - 45) < 1e-9, 'der Weg verlässt den Pressrest bei 45 mm: ' + e.s0);
  const A = P.area(P.section(20, 10, g.draft, g.radius));
  const fl = F.analyseFlow(g, net, proc());
  assert.ok(Math.abs(fl.runnerVolume - A * 55) < 1e-9 * A * 55, fl.runnerVolume + ' gegen ' + A * 55);
  assert.ok(Math.abs(F.runnerVolume(net) - fl.runnerVolume) < 1e-12);
  /* Der Körper sagt dasselbe: beschnitten am Mantel. */
  assert.ok(Math.abs(volume(sweepRunner(net)) - fl.runnerVolume) / fl.runnerVolume < 0.01);
  /* Die Laufzeit: 55 mm mit der Geschwindigkeit im Kanal. */
  const l = fl.losses.get(e.toId);
  const v = l.Q / (A * 1e-6);
  assert.ok(Math.abs(fl.arrival[e.toId] - 0.055 / v) < 1e-9, fl.arrival[e.toId] + ' s gegen ' + 0.055 / v);

  /* Eine Kante, die den Pressrest nicht verlässt: sie zählt gar nicht, und
     die nächste beginnt drinnen. */
  const s = straight(30, 20, 10);
  const gate = G.addChild(s, G.allNodes(s)[1].id, 'gate');
  gate.pos = [0, 0, 80];
  const ns = sampleNetwork(s);
  assert.equal(ns.edges[0].s0, ns.edges[0].length, 'ganz im Pressrest');
  assert.ok(Math.abs(ns.edges[1].s0 - 15) < 0.05, 'die nächste tritt bei 45 mm aus: ' + ns.edges[1].s0);

  /* Die Beispiele: Angussvolumen und Körper liegen jetzt beieinander (vorher
     ein Viertel auseinander) — der Rest ist das Hosenstück. */
  for (const d of PRE.DEMOS) {
    const gd = d.build(), nd = sampleNetwork(gd);
    const rv = F.analyseFlow(gd, nd, proc()).runnerVolume, body = volume(sweepRunner(nd));
    assert.ok(Math.abs(rv - body) / body < 0.05, d.id + ': ' + (rv / 1000).toFixed(1) + ' gegen ' + (body / 1000).toFixed(1) + ' cm³');
  }
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

test('Regeln: ein Querschnitt, der allmählich aufgeht, wächst — gemessen an der engsten Stelle davor', () => {
  /* Auf 62 mm auf das Doppelte: je Schnitt kaum mehr als anderthalb
     Prozent, und der Vergleich mit dem Nachbarn (2 %) sah es nie. */
  const g = straight(100, 20, 10);
  const p = G.allNodes(g)[1];
  const q = G.addChild(g, p.id, 'point');
  q.pos = [0, 0, 162];
  const A = P.area(P.section(20, 10, g.draft, g.radius));
  const d = P.dimsForArea(2 * A, 0.5, g.draft, g.radius);
  q.w = d.w; q.h = d.h;
  const net = sampleNetwork(g);
  const e = net.edges.find(x => x.toId === q.id);
  let step = 0;
  for (let i = 1; i < e.sections.length; i++) step = Math.max(step, e.sections[i].area / e.sections[i - 1].area - 1);
  assert.ok(step < 0.02, 'je Schnitt ' + (step * 100).toFixed(2) + ' %');
  const hit = checkRules(g, net, F.analyseFlow(g, net, proc()), proc()).find(r => r.title === 'Der Querschnitt wächst');
  assert.ok(hit && hit.level === 'bad', 'die Regel meldet sich');
  assert.match(hit.text, /um 100 % größer als an der engsten Stelle davor/, hit.text);
  /* Gleich dick bleiben ist kein Wachsen. */
  q.w = 20; q.h = 10;
  const net2 = sampleNetwork(g);
  assert.ok(checkRules(g, net2, F.analyseFlow(g, net2, proc()), proc()).find(r => r.title === 'Der Querschnitt nimmt durchgehend ab'));
});

test('Regeln: die Summe der Abgänge einer Verzweigung — aufgehend, stark einschnürend, im Band', () => {
  /* Die Regel summierte den ERSTEN Schnitt jedes Abgangs, und den baut
     curve.js als Anteil am Zulauf: die Summe war immer genau der Zulauf.
     Jetzt zählt der eigene Querschnitt jedes Abgangs. */
  const pruefe = f => {
    const g = PRE.demoTwoGates();
    const b = G.allNodes(g).find(n => n.type === 'branch');
    b.mirror = false;
    const Ab = P.area(P.section(b.w, b.h, g.draft, g.radius));
    for (const id of b.children) {
      const k = g.nodes[id];
      const d = P.dimsForArea(f * Ab, k.h / k.w, g.draft, g.radius);
      k.w = d.w; k.h = d.h;
    }
    const net = sampleNetwork(g);
    return checkRules(g, net, F.analyseFlow(g, net, proc()), proc()).find(r => /Verzweigung|Abgänge an/.test(r.title));
  };
  const auf = pruefe(1.5);
  assert.equal(auf.title, 'Verzweigung öffnet sich');
  assert.equal(auf.level, 'bad');
  assert.match(auf.text, /300 % des Zulaufs/);
  const eng = pruefe(0.3);
  assert.equal(eng.title, 'Verzweigung schnürt stark ein');
  assert.equal(eng.level, 'warn');
  assert.match(eng.text, /nur 60 %/);
  /* Das Beispiel, wie es abgestuft ist: 90 % gehen weiter — und der Titel
     nennt die Art nur einmal. */
  const g = PRE.demoTwoGates();
  const net = sampleNetwork(g);
  const ok = checkRules(g, net, F.analyseFlow(g, net, proc()), proc()).find(r => /Abgänge an/.test(r.title));
  assert.equal(ok.level, 'ok');
  assert.match(ok.title, /^Abgänge an Verzweigung k\d+$/);
  assert.match(ok.text, /^90 % des Zulaufquerschnitts/);
  for (const d of PRE.DEMOS) {
    const gd = d.build(), nd = sampleNetwork(gd);
    for (const r of checkRules(gd, nd, F.analyseFlow(gd, nd, proc()), proc())) {
      const w = r.title.split(/\s+/);
      assert.ok(!w.some((x, i) => i > 0 && x === w[i - 1]), d.id + ': ein Wort doppelt in „' + r.title + '"');
    }
  }
});

test('Auslegung: auch hinter einem geklemmten Pressrest wächst nichts — 4000 cm³ an Ø 90', () => {
  /* Der Anschluss am Pressrest wird auf 0,9·Ø geklemmt; vorher schrumpfte
     nur er (4025 mm²), der Punkt dahinter blieb bei 4878 mm². */
  const g = PRE.demoTwoGates();
  assert.equal(g.biscuit.d, 90);
  const p = { ...proc(), volume: 4000 };
  F.applyAutoGates(g, p);
  autoTaper(g, p, DEFAULT_SIZING);
  assert.ok(G.root(g).w <= g.biscuit.d * 0.9 + 1e-9, 'der Anschluss ist geklemmt: ' + G.root(g).w);
  const net = sampleNetwork(g);
  const walk = (id, min) => {
    for (const e of net.edges.filter(x => x.fromId === id)) {
      let m = min;
      for (const s of e.sections) {
        assert.ok(s.area <= m * 1.0001, `${e.fromId}→${e.toId} bei ${s.s.toFixed(1)} mm: ${s.area.toFixed(0)} nach ${m.toFixed(0)} mm²`);
        m = Math.min(m, s.area);
      }
      walk(e.toId, m);
    }
  };
  walk(g.rootId, Infinity);
  const rules = checkRules(g, net, F.analyseFlow(g, net, p), p);
  assert.ok(!rules.find(r => r.title === 'Der Querschnitt wächst'), 'die Prüfung sieht es genauso');
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
  /* Die Klassenregel im <style> schlägt ein fill-Attribut: „Soll/Ist
     weicht ab" und „späteste Ankunft" blieben so grau. Rot kommt darum
     über die Klasse, und die Schrift liest die Farben des Schemas. */
  assert.doesNotMatch(svg, /<text class="c[ln][^"]*"[^>]*\sfill=/, 'keine fill-Attribute an Beschriftungen');
  assert.match(svg, /\.cl\.bad\{fill:var\(--bad/);
  assert.match(svg, /\.cl\{[^}]*fill:var\(--muted/);
  assert.match(flowChart(g, net, { gates: [], losses: new Map() }, {}), /chart-empty/);
});
