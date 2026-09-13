/* Was die Schmelze im Anguss kostet — eine Bernoulli-Abschätzung entlang
   des Graphen.

   Der Anspruch ist bewusst begrenzt. Eine Füllsimulation ist das hier
   nicht und will es nicht sein; sie bräuchte ein Volumennetz, eine freie
   Oberfläche und eine Rechenzeit, die zum Entwurf am Regler nicht passt.
   Was hier steht, ist die Rohrhydraulik, die jeder Gießer im Kopf
   überschlägt — nur eben über jeden Millimeter der wirklich
   entworfenen Mittellinie statt über eine gedachte Ersatzlänge:

     Reibung      λ · (ds/d_h) · ρ/2 · v²      λ aus Re (laminar / Blasius)
     Krümmung     ζ₉₀ · dθ/(π/2) · ρ/2 · v²    ζ₉₀ = 0,21/√(R/d_h)
     Querschnitt  Verengung 0,04·(1−A₂/A₁), Erweiterung (1−A₁/A₂)²
     Verzweigung  c · ρ/2 · |v₂·t₂ − v₁·t₁|²   (Borda-Carnot, vektoriell)
     Anschnitt    ζ nach Übergangsart
     dazu         ρ/2 · (v² − v₀²)             die reine Beschleunigung

   Die Verzweigung als Geschwindigkeits-SPRUNG zu rechnen (Betrag UND
   Richtung) ist der ehrlichste einfache Ansatz: er bestraft sowohl den
   scharfen Abgang als auch die Querschnittsstufe, und er wird von selbst
   klein, wenn die Abzweigung sanft aufgeht — genau das, was der weiche
   Übergang der Verschmelzung geometrisch tut. Der Beiwert c ist die
   einzige Stellschraube (voreingestellt 0,5).

   FÜLLBALANCE. Die Aufteilungen an den Verzweigungen sind eine ABSICHT
   des Konstrukteurs. Was wirklich fließt, entscheidet der Widerstand:
   bei gleichem Druck am Pressrest teilt sich der Strom so auf, dass
   jeder Weg denselben Druckverlust hat. Beide Zahlen nebeneinander sind
   die eigentliche Aussage dieser Seite — weicht das Ist stark vom Soll
   ab, füllt ein Anschnitt vor, und das Bauteil bekommt Kaltfluss und
   Lufteinschlüsse an der falschen Stelle.

   Alles rechnet in SI (m, s, kg, Pa); die Geometrie kommt in mm herein
   und wird beim Eintritt umgerechnet. */

import { dot, scale, sub } from './vec.js';
import * as G from './graph.js';

export const ALLOYS = {
  al:   { label: 'Aluminium (AlSi9Cu3)', rho: 2450, nu: 5.4e-7 },
  mg:   { label: 'Magnesium (AZ91)', rho: 1650, nu: 7.5e-7 },
  zn:   { label: 'Zink (ZP0410)', rho: 6600, nu: 5.0e-7 }
};

export const DEFAULT_PROCESS = {
  alloy: 'al',
  volume: 420,      // cm³ Gussvolumen einschließlich Überläufen
  fillTime: 45,     // ms
  cBranch: 0.5,     // Beiwert des Verzweigungsverlusts
  vGate: 40,        // m/s Zielgeschwindigkeit am Anschnitt
  /* Länge der Füllkammer, mm. Mit dem Pressrest-Ø als Kolben-Ø ergibt
     sie den Füllgrad, den die Schusskurve braucht (js/runner/shottime.js);
     die Strömungsrechnung selbst braucht sie nicht. */
  chamberLen: 450
};

const lambdaOf = re => (re < 2300 ? 64 / Math.max(re, 1e-3) : 0.316 / Math.pow(re, 0.25));

/** Volumenstrom in m³/s aus Gussvolumen (cm³) und Füllzeit (ms). */
export const flowRate = proc =>
  Math.max(proc.volume, 1e-6) * 1e-6 / Math.max(proc.fillTime, 1) * 1000;

/* ── Verlust einer Kante bei gegebenem Volumenstrom ──────────── */

/* Ergebnis in Pa, aufgeschlüsselt. `dyn` ist keine Verlustgröße,
   sondern die Druckabsenkung durch die Beschleunigung — sie gehört in
   den Gesamtbedarf, aber nicht in die Verlustbilanz. */
function edgeLoss(edge, Q, mat, cBranch, inState) {
  const { rho, nu } = mat;
  const secs = edge.sections;
  const out = { friction: 0, bend: 0, area: 0, branch: 0, gate: 0, dyn: 0,
    vIn: 0, vOut: 0, vMax: 0, aMin: Infinity, aMax: 0, time: 0 };
  if (secs.length < 2) return out;

  const vAt = i => Q / (secs[i].area * 1e-6);
  const v0 = vAt(0), vN = vAt(secs.length - 1);
  out.vIn = v0; out.vOut = vN;

  /* Verzweigung: Sprung der Geschwindigkeit nach Betrag UND Richtung. */
  if (inState && inState.v > 0) {
    const d = sub(scale(secs[0].t, v0), scale(inState.t, inState.v));
    out.branch = cBranch * rho / 2 * dot(d, d);
  }

  let landDone = false;
  for (let i = 0; i < secs.length - 1; i++) {
    const a = secs[i], b = secs[i + 1];
    const ds = (b.s - a.s) * 1e-3;
    if (ds <= 0) continue;
    const va = vAt(i), vb = vAt(i + 1);
    const vm = (va + vb) / 2, dh = (a.dh + b.dh) / 2 * 1e-3;
    out.vMax = Math.max(out.vMax, va, vb);
    out.aMin = Math.min(out.aMin, a.area, b.area);
    out.aMax = Math.max(out.aMax, a.area, b.area);

    const re = vm * dh / nu;
    out.friction += lambdaOf(re) * (ds / Math.max(dh, 1e-6)) * rho / 2 * vm * vm;
    /* Laufzeit der Front durch diesen Schritt: die Schmelze füllt den
       Kanal mit dem Strom, der in diesem Ast fließt — je enger, desto
       schneller ist sie durch. */
    if (vm > 1e-9) out.time += ds / vm;

    const kappa = (a.kappa + b.kappa) / 2;
    if (kappa > 1e-9) {
      const rBend = 1 / kappa;                                  // mm
      const rel = Math.max(rBend / Math.max(a.dh, 1e-6), 1);
      const z90 = 0.21 / Math.sqrt(rel);
      out.bend += z90 * (kappa * (b.s - a.s)) / (Math.PI / 2) * rho / 2 * vm * vm;
    }

    if (b.area < a.area) out.area += 0.04 * (1 - b.area / a.area) * rho / 2 * vb * vb;
    else if (b.area > a.area) out.area += Math.pow(1 - a.area / b.area, 2) * rho / 2 * va * va;

    /* Eintritt in den Anschnitt: einmal, beim ersten Schnitt der
       Anschnittlänge. */
    if (!landDone && b.land) {
      landDone = true;
      const t = (G.TRANSITIONS[(edge.to.gate || {}).transition] || G.TRANSITIONS.ende);
      out.gate = t.zeta * rho / 2 * vb * vb;
    }
  }
  out.dyn = rho / 2 * (vN * vN - v0 * v0);
  out.loss = out.friction + out.bend + out.area + out.branch + out.gate;
  out.total = out.loss + out.dyn;
  return out;
}

/* ── Widerstände zusammenfassen ──────────────────────────────── */

/* Bei quadratischem Widerstand (Δp = R·Q²) gilt für die Parallelschaltung
   1/√R = Σ 1/√Rᵢ — dieselbe Regel wie bei Blenden, nicht wie bei
   ohmschen Widerständen. */
const parallel = list => {
  let s = 0;
  for (const r of list) s += 1 / Math.sqrt(Math.max(r, 1e-12));
  return s > 0 ? 1 / (s * s) : 1e12;
};

/**
 * Vollständige Auswertung.
 *   g    Graph
 *   net  abgetastetes Netz (js/runner/curve.js)
 *   proc Prozessgrößen (DEFAULT_PROCESS)
 */
export function analyseFlow(g, net, proc) {
  const mat = ALLOYS[proc.alloy] || ALLOYS.al;
  const Q = flowRate(proc);
  const byTo = new Map();
  for (const e of net.edges) byTo.set(e.toId, e);

  const gates = G.allNodes(g).filter(n => n.type === 'gate');

  /* Soll-Aufteilung aus den eingestellten Verhältnissen. */
  const shareSoll = nominalShares(g);

  /* Iteration: Widerstände hängen über λ(Re) und die Verzweigung schwach
     vom Strom ab, deshalb ein paar Durchgänge. Start ist die
     Soll-Aufteilung. */
  let share = { ...shareSoll };
  let losses = new Map();
  for (let iter = 0; iter < 8; iter++) {
    losses = new Map();
    /* 1. Verluste aller Kanten beim aktuellen Strom. */
    const state = new Map();                        // Knoten → { v, t } am Zulauf
    for (const e of net.edges) {
      const q = Q * (share[e.toId] || 0);
      const p = state.get(e.fromId) || null;
      const l = edgeLoss(e, q, mat, proc.cBranch, e.from.type === 'root' ? null : p);
      l.Q = q;
      losses.set(e.toId, l);
      const last = e.sections[e.sections.length - 1];
      state.set(e.toId, { v: l.vOut, t: last.t });
    }
    /* 2. Widerstände von unten nach oben. */
    const R = new Map();
    const resistOf = id => {
      const kids = g.nodes[id].children.filter(c => g.nodes[c] && byTo.has(c));
      if (!kids.length) return 0;
      const paths = kids.map(c => {
        const l = losses.get(c);
        const q = Math.max(l.Q, 1e-12);
        return Math.max(l.total, 0) / (q * q) + resistOf(c);
      });
      kids.forEach((c, i) => R.set(c, paths[i]));
      return parallel(paths);
    };
    resistOf(g.rootId);
    /* 3. Ströme von oben nach unten neu aufteilen. */
    const next = { [g.rootId]: 1 };
    const push = id => {
      const kids = g.nodes[id].children.filter(c => g.nodes[c] && byTo.has(c));
      const s = next[id] || 0;
      if (kids.length === 1) next[kids[0]] = s;
      else if (kids.length > 1) {
        const inv = kids.map(c => 1 / Math.sqrt(Math.max(R.get(c) || 1e-9, 1e-12)));
        const sum = inv.reduce((a, b) => a + b, 0) || 1;
        kids.forEach((c, i) => { next[c] = s * inv[i] / sum; });
      }
      for (const c of kids) push(c);
    };
    push(g.rootId);
    /* Gedämpft übernehmen — sonst schwingt die Aufteilung bei stark
       unterschiedlichen Ästen. */
    let move = 0;
    for (const k of Object.keys(next)) {
      const before = share[k] === undefined ? next[k] : share[k];
      const after = before + (next[k] - before) * 0.6;
      move = Math.max(move, Math.abs(after - before));
      share[k] = after;
    }
    if (move < 1e-5) break;
  }

  /* Wann die Front wo ankommt: vom Pressrest aus Kante für Kante
     aufsummiert. Das ist die Ankunft bei dem Strom der Füllphase, also
     Gussvolumen durch Füllzeit — keine Simulation der Kolbenbewegung,
     aber genau die Zahl, an der man abliest, welcher Anschnitt zuerst
     bedient wird und wie weit die anderen hinterherhinken. */
  const arrival = { [g.rootId]: 0 };
  G.walk(g, n => {
    for (const c of n.children) {
      const l = losses.get(c);
      if (l) arrival[c] = (arrival[n.id] || 0) + l.time;
    }
  });

  /* Ergebnis je Anschnitt: den Weg vom Pressrest aufsummieren. */
  const gateRows = gates.map(n => {
    const path = G.pathTo(g, n.id).slice(1);
    let loss = 0, dyn = 0;
    const parts = { friction: 0, bend: 0, area: 0, branch: 0, gate: 0 };
    for (const p of path) {
      const l = losses.get(p.id);
      if (!l) continue;
      loss += l.loss; dyn += l.dyn;
      for (const k of Object.keys(parts)) parts[k] += l[k];
    }
    const gArea = (net.nodeArea[n.id + ':gate'] || {}).area || 1;
    return {
      id: n.id, node: n,
      area: gArea,
      soll: shareSoll[n.id] || 0,
      ist: share[n.id] || 0,
      v: (Q * (share[n.id] || 0)) / (gArea * 1e-6),
      vSoll: (Q * (shareSoll[n.id] || 0)) / (gArea * 1e-6),
      dp: loss + dyn, loss, dyn, parts,
      tArrive: arrival[n.id] || 0,
      zeta: (loss + dyn) / Math.max(mat.rho / 2 * Math.pow((Q * (share[n.id] || 0)) / (gArea * 1e-6), 2), 1e-9)
    };
  });

  const dpList = gateRows.map(r => r.dp);
  const totalArea = gateRows.reduce((a, r) => a + r.area, 0);
  const tList = gateRows.map(r => r.tArrive);
  return {
    Q, mat, share, shareSoll, losses, arrival,
    fillTime: proc.fillTime,
    tFirst: tList.length ? Math.min(...tList) : 0,
    tLast: tList.length ? Math.max(...tList) : 0,
    gates: gateRows,
    gateArea: totalArea,
    /* Wie weit weicht die tatsächliche Aufteilung von der gewollten ab? */
    imbalance: gateRows.reduce((m, r) => Math.max(m, Math.abs(r.ist - r.soll)), 0),
    dp: dpList.length ? Math.max(...dpList) : 0,
    dpMin: dpList.length ? Math.min(...dpList) : 0,
    vGateMean: totalArea > 0 ? Q / (totalArea * 1e-6) : 0,
    runnerVolume: net.edges.reduce((a, e) => {
      let v = 0;
      for (let i = 0; i < e.sections.length - 1; i++) {
        v += (e.sections[i].area + e.sections[i + 1].area) / 2 * (e.sections[i + 1].s - e.sections[i].s);
      }
      return a + v;
    }, 0)
  };
}

/** Anschnittbreite aus Zielgeschwindigkeit und Soll-Anteil — die
    Auslegung, die man von Hand mit A = Q/v macht. */
export function autoGateWidth(g, proc, gateNode, shareSoll) {
  const Q = flowRate(proc) * shareSoll;
  const A = Q / Math.max(proc.vGate, 1) * 1e6;         // mm²
  return Math.max(2, A / Math.max(gateNode.gate.h, 0.2));
}

/** Alle Anschnitte mit „Breite automatisch" auf die Zielgeschwindigkeit
    einstellen. Läuft vor jeder Abtastung — die Breite ist damit eine
    abgeleitete Größe wie alles andere, keine zweite Wahrheit. */
export function applyAutoGates(g, proc) {
  const share = nominalShares(g);
  for (const n of G.allNodes(g)) {
    if (n.type === 'gate' && n.gate && n.gate.auto) {
      n.gate.w = Math.round(autoGateWidth(g, proc, n, share[n.id] || 0) * 10) / 10;
    }
  }
  return g;
}

/** Soll-Anteile allein aus den Verhältnissen — ohne Strömungsrechnung.
    Braucht die automatische Anschnittbreite, bevor es Querschnitte gibt. */
export function nominalShares(g) {
  const share = { [g.rootId]: 1 };
  G.walk(g, n => {
    const kids = n.children.filter(c => g.nodes[c]);
    const s = share[n.id] || 0;
    if (kids.length === 1) share[kids[0]] = s;
    else if (kids.length > 1) {
      const r = n.ratio === undefined ? 0.5 : n.ratio;
      kids.forEach((c, i) => {
        share[c] = s * (kids.length === 2 ? (i === 0 ? r : 1 - r) : 1 / kids.length);
      });
    }
  });
  return share;
}
