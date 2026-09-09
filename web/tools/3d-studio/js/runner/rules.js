/* Gießtechnische Prüfregeln für das Angusssystem.

   Die Regeln sind bewusst die, die in jedem Lehrbuch und in jeder
   Konstruktionsrichtlinie stehen — sie sollen nicht überraschen, sondern
   den Entwurf gegen das prüfen, was der Anwender ohnehin im Kopf hat.
   Neu ist nur, dass sie über die WIRKLICHE Geometrie laufen: über jeden
   abgetasteten Millimeter statt über die Maße an den Stützpunkten. Ein
   Querschnitt, der zwischen zwei Punkten kurz anwächst, fällt hier auf;
   in der Maßtabelle fiele er nicht auf.

   Jede Regel liefert eine Stufe und einen Satz. Die Stufe entscheidet
   über die Farbe, der Satz nennt Ort und Zahl — eine Meldung ohne Zahl
   hilft niemandem. */

import * as G from './graph.js';
import { ALLOYS } from './flow.js';
import { sub, norm, len, dot } from './vec.js';

/* Fenster der Anschnittgeschwindigkeit je Werkstoff, m/s. */
const V_GATE = { al: [20, 60], mg: [30, 100], zn: [20, 50] };
/* Ab hier wäscht der Strahl den Stahl des Laufkanals aus. */
const V_RUNNER_MAX = 30;

const fmt = (v, n = 1) => v.toLocaleString('de-DE', { maximumFractionDigits: n });

export function checkRules(g, net, flow, proc) {
  const out = [];
  const add = (level, title, text) => out.push({ level, title, text });
  const alloy = ALLOYS[proc.alloy] ? proc.alloy : 'al';

  /* ── 1. Der Querschnitt darf nicht wachsen ── */
  let grow = null;
  for (const e of net.edges) {
    for (let i = 1; i < e.sections.length; i++) {
      const a = e.sections[i - 1].area, b = e.sections[i].area;
      if (b > a * 1.02) {
        const rel = b / a - 1;
        if (!grow || rel > grow.rel) grow = { rel, edge: e, s: e.sections[i].s, a, b };
      }
    }
  }
  /* Auch über die Knoten hinweg: was aus einer Kante herauskommt, darf
     in der nächsten nicht wieder größer werden. */
  for (const e of net.edges) {
    const inEdge = net.edges.find(x => x.toId === e.fromId);
    if (!inEdge) continue;
    const a = inEdge.sections[inEdge.sections.length - 1].area;
    const b = e.sections[0].area;
    if (b > a * 1.02 && (!grow || b / a - 1 > grow.rel)) {
      grow = { rel: b / a - 1, edge: e, s: 0, a, b, atNode: true };
    }
  }
  if (grow) {
    add('bad', 'Der Querschnitt wächst',
      'Zwischen ' + label(g, grow.edge.fromId) + ' und ' + label(g, grow.edge.toId)
      + (grow.atNode ? ' schon am Übergang' : ' bei ' + fmt(grow.s, 0) + ' mm')
      + ' nimmt der Querschnitt um ' + fmt(grow.rel * 100) + ' % zu (' + fmt(grow.a, 0)
      + ' → ' + fmt(grow.b, 0) + ' mm²). Wo sich der Kanal erweitert, löst sich der Strahl '
      + 'von der Wand ab und reißt Luft mit; der Querschnitt muss vom Pressrest bis zum '
      + 'Anschnitt stetig abnehmen.');
  } else {
    add('ok', 'Der Querschnitt nimmt durchgehend ab',
      'Vom Pressrest bis zu jedem Anschnitt wird der Kanal enger — der Strahl bleibt an der Wand.');
  }

  /* ── 2. Verzweigungen: Summe der Abgänge ── */
  for (const n of G.allNodes(g)) {
    const kids = G.childrenOf(g, n.id);
    if (kids.length < 2) continue;
    const parent = net.nodeArea[n.id];
    const sum = kids.reduce((a, k) => a + (net.nodeArea[k.id] ? areaAtStart(net, k.id) : 0), 0);
    const ratio = sum / Math.max(parent.area, 1e-6);
    if (ratio > 1.02) {
      add('bad', 'Verzweigung öffnet sich',
        'An ' + label(g, n.id) + ' ist die Summe der Abgänge ' + fmt(ratio * 100, 0)
        + ' % des Zulaufs (' + fmt(sum, 0) + ' statt höchstens ' + fmt(parent.area, 0) + ' mm²).');
    } else if (ratio < 0.7) {
      add('warn', 'Verzweigung schnürt stark ein',
        'An ' + label(g, n.id) + ' bleiben nur ' + fmt(ratio * 100, 0)
        + ' % des Zulaufquerschnitts übrig. Üblich sind 85 bis 100 % — darunter '
        + 'beschleunigt der Strahl im Verteiler stärker als nötig.');
    } else {
      add('ok', 'Verzweigung ' + label(g, n.id),
        fmt(ratio * 100, 0) + ' % des Zulaufquerschnitts gehen weiter — im üblichen Band.');
    }
  }

  /* ── 3. Anschnittgeschwindigkeit ── */
  const [vLo, vHi] = V_GATE[alloy];
  const bad = flow.gates.filter(r => r.v < vLo || r.v > vHi);
  if (!flow.gates.length) {
    add('warn', 'Kein Anschnitt', 'Ohne Anschnitt endet der Kanal im Nichts — es lässt sich nichts füllen.');
  } else if (bad.length) {
    const worst = bad.reduce((a, b) => (Math.abs(b.v - (vLo + vHi) / 2) > Math.abs(a.v - (vLo + vHi) / 2) ? b : a));
    add(worst.v > vHi * 1.4 || worst.v < vLo * 0.6 ? 'bad' : 'warn', 'Anschnittgeschwindigkeit außerhalb',
      bad.length + ' von ' + flow.gates.length + ' Anschnitten liegen außerhalb von '
      + vLo + '–' + vHi + ' m/s; der stärkste Ausreißer ist ' + label(g, worst.id)
      + ' mit ' + fmt(worst.v) + ' m/s. Zu langsam heißt Kaltfluss, zu schnell heißt '
      + 'Sprühfüllung, Lufteinschluss und ausgewaschene Anschnitte.');
  } else {
    add('ok', 'Anschnittgeschwindigkeit im Fenster',
      'Alle Anschnitte liegen zwischen ' + vLo + ' und ' + vHi + ' m/s.');
  }

  /* ── 4. Geschwindigkeit im Laufkanal ── */
  let vRunner = 0, vRunnerAt = null;
  for (const e of net.edges) {
    const l = flow.losses.get(e.toId);
    if (!l) continue;
    const v = e.to.type === 'gate' ? l.vIn : l.vMax;     // im Anschnitt selbst zählt Regel 3
    if (v > vRunner) { vRunner = v; vRunnerAt = e; }
  }
  if (vRunner > V_RUNNER_MAX) {
    add('warn', 'Laufkanal zu schnell',
      'Im Kanal ' + label(g, vRunnerAt.fromId) + ' → ' + label(g, vRunnerAt.toId)
      + ' erreicht die Schmelze ' + fmt(vRunner) + ' m/s. Über etwa ' + V_RUNNER_MAX
      + ' m/s wäscht der Strahl den Stahl aus; der Querschnitt sollte weiter vorn großzügiger sein.');
  } else {
    add('ok', 'Laufkanal ruhig',
      'Höchste Kanalgeschwindigkeit ' + fmt(vRunner) + ' m/s — der Strahl bleibt unter der Auswaschgrenze.');
  }

  /* ── 5. Seitenverhältnis ── */
  let ar = null;
  for (const n of G.allNodes(g)) {
    if (n.type === 'gate' || n.type === 'root') continue;
    const q = n.h / Math.max(n.w, 1e-6);
    if (!ar || Math.abs(Math.log(q / 0.7)) > Math.abs(Math.log(ar.q / 0.7))) ar = { q, n };
  }
  if (ar && (ar.q < 0.35 || ar.q > 1.1)) {
    add('warn', 'Ungünstiges Seitenverhältnis',
      'Bei ' + label(g, ar.n.id) + ' ist Tiefe/Breite = ' + fmt(ar.q, 2)
      + '. Ein flacher, breiter Kanal kühlt zu schnell aus, ein schmaler tiefer lässt sich '
      + 'schlecht entformen; bewährt hat sich 0,5 bis 1,0.');
  } else if (ar) {
    add('ok', 'Seitenverhältnis in Ordnung',
      'Tiefe/Breite liegt überall nahe an dem, was sich gut fräsen und entformen lässt (schlechtester Wert ' + fmt(ar.q, 2) + ').');
  }

  /* ── 6. Krümmungsradius ── */
  let tight = null;
  for (const e of net.edges) {
    for (const s of e.sections) {
      if (s.kappa < 1e-9) continue;
      const rel = (1 / s.kappa) / Math.max(s.dh, 1e-6);
      if (!tight || rel < tight.rel) tight = { rel, e, s };
    }
  }
  if (tight && tight.rel < 2) {
    add(tight.rel < 1 ? 'bad' : 'warn', 'Zu enger Bogen',
      'Zwischen ' + label(g, tight.e.fromId) + ' und ' + label(g, tight.e.toId)
      + ' beträgt der Krümmungsradius nur das ' + fmt(tight.rel, 1)
      + '-fache des hydraulischen Durchmessers. Unter dem Doppelten löst sich die Strömung '
      + 'an der Innenseite ab — Punkte weiter auseinanderziehen oder den Knick entschärfen.');
  } else if (tight) {
    add('ok', 'Bögen weit genug',
      'Engster Bogen: ' + fmt(tight.rel, 1) + '·d_h (empfohlen ≥ 2).');
  }

  /* ── 7. Entformschräge ── */
  if (g.draft < 2) {
    add('warn', 'Wenig Entformschräge',
      'Mit ' + fmt(g.draft) + '° klemmt der erstarrte Anguss beim Auswerfen. '
      + 'Üblich sind 3 bis 7° je Seite.');
  } else {
    add('ok', 'Entformschräge ' + fmt(g.draft) + '°', 'Der Anguss löst sich aus der Formhälfte.');
  }

  /* ── 8. Füllbalance ── */
  if (flow.gates.length > 1) {
    const im = flow.imbalance;
    add(im > 0.12 ? 'bad' : im > 0.05 ? 'warn' : 'ok', 'Füllbalance',
      im <= 0.05
        ? 'Die tatsächliche Aufteilung weicht um höchstens ' + fmt(im * 100) + ' Prozentpunkte von der gewollten ab.'
        : 'Die Widerstände teilen den Strom anders auf als eingestellt — bis zu '
          + fmt(im * 100) + ' Prozentpunkte Abweichung. Der Anschnitt mit dem geringsten '
          + 'Widerstand füllt vor; am anderen Ende entstehen Kaltfluss und Lufteinschlüsse.');
  }

  /* ── 9. Anschnitt gegen zuführenden Kanal ── */
  for (const r of flow.gates) {
    const feed = areaBeforeGate(net, r.id);
    const q = feed / Math.max(r.area, 1e-6);
    if (q < 1.2) {
      add('warn', 'Anschnitt zu groß gegenüber dem Kanal',
        'Bei ' + label(g, r.id) + ' ist der zuführende Kanal nur das ' + fmt(q, 2)
        + '-fache der Anschnittfläche. Damit der Anschnitt zuletzt gefüllt wird und der '
        + 'Nachdruck ihn erreicht, sollte der Kanal mindestens das 1,2-fache haben.');
    }
  }

  /* ── 10. Materialausbeute ── */
  const yieldPct = 100 * proc.volume / Math.max(proc.volume + flow.runnerVolume / 1000, 1e-6);
  add(yieldPct < 55 ? 'warn' : 'ok', 'Materialausbeute ' + fmt(yieldPct, 0) + ' %',
    'Der Anguss wiegt ' + fmt(flow.runnerVolume / 1000) + ' cm³ gegenüber ' + fmt(proc.volume, 0)
    + ' cm³ Gussvolumen. Jeder Kubikzentimeter Anguss wird eingeschmolzen und nochmal bezahlt.');

  /* ── 11. Gebundene Mündung gegen die Anströmung ──
     Eine ans Bauteil gebundene Richtung ist stärker als die Sehne: die
     Kurve kommt in JEDEM Fall so an, notfalls mit einer Schleife. Steht
     die Mündung quer zu der Richtung, aus der der Kanal kommt, sieht man
     das erst an der Geometrie — hier steht es als Satz. */
  let hook = null;
  for (const n of G.allNodes(g)) {
    if (n.type !== 'gate' || !n.aim || !n.parent) continue;
    const chord = norm(sub(n.pos, g.nodes[n.parent].pos));
    if (!len(chord)) continue;
    const c = dot(norm(n.aim), chord);
    if (!hook || c < hook.c) hook = { c, id: n.id };
  }
  if (hook && hook.c < 0.5) {
    const deg = Math.acos(Math.max(-1, Math.min(1, hook.c))) * 180 / Math.PI;
    add(hook.c < 0 ? 'bad' : 'warn', 'Mündung quer zur Anströmung',
      label(g, hook.id) + ' mündet ' + fmt(deg, 0) + '° gegen die Richtung, aus der '
      + 'der Kanal kommt' + (hook.c < 0 ? ' — der Kanal muss dafür eine Schleife schlagen. ' : '. ')
      + 'Den Punkt davor auf die Zuströmseite legen oder eine andere Stelle am Bauteil wählen.');
  }

  /* ── 12. Gebundene Mündung aus der Trennebene heraus ──
     Der Anschnitt liegt in der Trennebene (genauer: in seiner
     Arbeitsebene) und kann nur in ihr ins Bauteil münden. Wer auf die
     Deckfläche des Bauteils klickt, bekommt eine Richtung senkrecht zur
     Ebene — die Geometrie zeigt das, gebaut werden kann es nicht. */
  let lift = null;
  for (const n of G.allNodes(g)) {
    if (n.type !== 'gate' || !n.aim) continue;
    const deg = G.aimTilt(g, n);
    if (!lift || deg > lift.deg) lift = { deg, id: n.id };
  }
  if (lift && lift.deg > 30) {
    add(lift.deg > 60 ? 'bad' : 'warn', 'Mündung aus der Trennebene',
      label(g, lift.id) + ' mündet ' + fmt(lift.deg, 0) + '° aus seiner Arbeitsebene heraus. '
      + 'Der Anschnitt liegt in der Trennebene und kann nur in ihr ins Bauteil münden — '
      + 'eine Stelle an der Bauteilwand wählen, nicht auf einer Fläche in der Ebene.');
  }

  /* ── 13. Ankunft der Schmelze ──
     Was die Balance über den Strom sagt, sagt die Laufzeit über die
     Reihenfolge: welcher Anschnitt zuerst bedient wird und wie lange die
     anderen warten. Ein Anschnitt, der spät dran ist, sieht Schmelze,
     die schon Wärme an den Kanal verloren hat — bei kurzer Füllzeit ist
     die Spanne dazwischen kein Detail. */
  if (flow.gates.length > 1 && Number.isFinite(flow.tLast)) {
    const spread = (flow.tLast - flow.tFirst) * 1000;                      // ms
    const rel = spread / Math.max(proc.fillTime, 1e-6);
    const late = flow.gates.reduce((a, b) => (b.tArrive > a.tArrive ? b : a));
    const early = flow.gates.reduce((a, b) => (b.tArrive < a.tArrive ? b : a));
    if (rel > 0.15) {
      add(rel > 0.3 ? 'bad' : 'warn', 'Anschnitte werden nacheinander erreicht',
        label(g, early.id) + ' bekommt die Schmelze nach ' + fmt(early.tArrive * 1000) + ' ms, '
        + label(g, late.id) + ' erst nach ' + fmt(late.tArrive * 1000) + ' ms — die Spanne von '
        + fmt(spread) + ' ms ist ' + fmt(rel * 100, 0) + ' % der Füllzeit. Der frühe Anschnitt füllt vor; '
        + 'den Weg zum späten kürzen oder dessen Kanal öffnen.');
    } else {
      add('ok', 'Schmelze kommt gleichzeitig an',
        'Alle Anschnitte werden innerhalb von ' + fmt(spread) + ' ms erreicht (erster nach '
        + fmt(early.tArrive * 1000) + ' ms, letzter nach ' + fmt(late.tArrive * 1000) + ' ms).');
    }
  }

  return out;
}

const label = (g, id) => {
  const n = g.nodes[id];
  if (!n) return id;
  return (G.TYPES[n.type] || {}).label + ' ' + id;
};

const areaAtStart = (net, id) => {
  const e = net.edges.find(x => x.toId === id);
  return e ? e.sections[0].area : 0;
};

/* Querschnitt kurz VOR dem Anschnitt: der letzte Schnitt, der noch zum
   Laufkanal gehört (vor Übergang und Anschnittlänge). */
function areaBeforeGate(net, id) {
  const e = net.edges.find(x => x.toId === id);
  if (!e) return 0;
  for (let i = 0; i < e.sections.length; i++) {
    if (e.sections[i].trans || e.sections[i].land) return e.sections[Math.max(0, i - 1)].area;
  }
  return e.sections[e.sections.length - 1].area;
}
