/* Die Eingabedomäne — angewandt, ohne DOM.

   Die Domäne selbst steht in config/fields.js (min/gt/max je Feld plus
   PAIRS). Hier stehen die drei Dinge, die man damit tut:

     checkField    ein Wert gegen die Grenzen seines Feldes
     checkValues   eine ganze Wertemenge, inklusive Paarregeln  → Urteil
     clampToDomain abhängige Werte in einen neu gesetzten Bereich nachführen

   Ohne DOM, damit Tests, Einzelseiten und der Generator dieselbe Funktion
   benutzen. Die Sidebar-Markierung sitzt in ui/inputs.js (validate).

   Warum das eine Datei ist und keine verstreuten Guards: solange eine
   ungültige Zahl gar nicht erst in die Rechnung gelangt, muss sich kein
   Diagramm dagegen wehren. Siehe docs/eingabegrenzen.md.                  */

import { PAIRS, domainFields, hiddenFields } from '../config/fields.js';
import { pMaxMachine, pistonArea, intensStroke } from './physics.js';

/* null = in Ordnung, sonst der Grund im Klartext. */
export function checkField(f, x) {
  if (!isFinite(x)) return 'muss eine Zahl sein';
  if (f.gt !== undefined && !(x > f.gt)) return 'muss größer als ' + f.gt + ' sein';
  if (f.min !== undefined && !(x >= f.min)) return 'darf nicht unter ' + f.min + ' liegen';
  if (f.max !== undefined && !(x <= f.max)) return 'darf nicht über ' + f.max + ' liegen';
  return null;
}

/* { ok, bad:Set der Feldnamen, msgs:[] }

   opt.abgeleitet = false lässt die beiden abgeleiteten Grenzen am Ende weg.
   Nötig für Prüfungen an EINEM Preset: ein Maschinen-Preset sagt nichts über
   das Bauteil — dass eine 200-t-Maschine den Vorgabeschuss von 18 kg nicht
   fasst, ist kein Fehler des Presets, sondern eine Aussage über die
   Kombination. */
export function checkValues(v, opt) {
  const bad = new Set(), msgs = [], grenzen = [];

  /* Ein Feld, das zum gewählten Modell nicht gehört (fields.js `when`),
     ist ausgeblendet und darf die Rechnung nicht sperren — das Backend
     liest es für dieses Modell ebenfalls nicht. */
  const versteckt = hiddenFields(v);
  for (const f of domainFields()) {
    if (versteckt.has(f.key)) continue;
    const grund = checkField(f, v[f.key]);
    if (grund) { bad.add(f.key); grenzen.push(f.label + ' ' + grund); }
  }
  if (grenzen.length) msgs.push(grenzen.slice(0, 3).join(' · ') +
    (grenzen.length > 3 ? ' (+' + (grenzen.length - 3) + ' weitere)' : ''));

  for (const r of PAIRS) {
    if (r.op === 'in') {
      const x = v[r.key], lo = v[r.lo], hi = v[r.hi];
      if (!isFinite(x) || !isFinite(lo) || !isFinite(hi)) continue;
      if (x < lo || x > hi) { bad.add(r.key); msgs.push(r.text); }
      continue;
    }
    const a = v[r.a], b = v[r.b];
    if (!isFinite(a) || !isFinite(b)) continue;   // die Einzelgrenze hat das schon gemeldet
    if (r.op === '<' ? !(a < b) : !(a <= b)) { bad.add(r.a); bad.add(r.b); msgs.push(r.text); }
  }

  /* Abgeleitete Grenze: metallseitiger Nachdruck gegen den spezifischen
     Gießdruck der Maschine (Gießkraft auf Ø dmin). Keine Feldkonstante —
     sie hängt an zwei anderen Eingaben und steht deshalb hier, nicht in
     fields.js. */
  const pM = pMaxMachine(v);
  if (isFinite(pM) && v.psel > pM) {
    bad.add('psel');
    msgs.push('Nachdruck über dem Maschinenmaximum (' + Math.round(pM) + ' bar)');
  }
  /* Zwei abgeleitete Grenzen, die das Backend ebenfalls zieht (convert.py).
     Sie hängen an vier bis sechs Eingaben und lassen sich deshalb nicht als
     Feldgrenze schreiben — hier zu prüfen erspart dem Anwender ein nacktes
     HTTP 422 aus der Simulation. Gemessene Lücke vorher: 6 von 59 Feldern
     hatten Werte, die der Browser durchließ und der Server abwies. */
  if (opt && opt.abgeleitet === false) return { ok: bad.size === 0, bad, msgs };

  const A = pistonArea(v), L = v.length;                 // mm², mm
  if (isFinite(A) && A > 0 && isFinite(L) && L > 0 && v.density > 0) {
    const Vdose = (v.runner + v.part + v.overflow + v.biscuit) / v.density;   // m³
    const phi = Vdose * 1e9 / (A * L);
    if (phi >= 1) {
      ['part', 'runner', 'overflow', 'biscuit', 'diam', 'length'].forEach(k => bad.add(k));
      msgs.push('Dosiervolumen übersteigt das Kammervolumen (Füllgrad ' +
        Math.round(phi * 100) + ' %)');
    }
  }
  /* Feststoffdichte unter der Schmelzedichte: das Gussstück würde beim
     Erstarren GRÖSSER — der Nachverdichtungshub wird negativ. */
  const hub = intensStroke(v);
  if (isFinite(hub) && hub < -1e-6) {
    ['densitySolid', 'density', 'shrink'].forEach(k => bad.add(k));
    msgs.push('Nachverdichtungshub wäre negativ (' + hub.toFixed(1) +
      ' mm): die Feststoffdichte liegt unter der Schmelzedichte');
  }

  return { ok: bad.size === 0, bad, msgs };
}

/* Führt die von einem Preset abhängigen Werte in ihren neuen Bereich nach.

   Ohne das setzte die Wahl einer kleinen Maschine zwar dmin/dmax = 40/70 mm,
   ließ den gewählten Kolben-Ø aber auf 150 mm stehen: gerechnet wurde mit
   einem Querschnitt, den die Maschine nicht hat (Faktor 4,59; Füllgrad
   8522,6 %). Statt diesen Zustand hinterher zu erkennen, kann er nicht
   mehr entstehen.

   Nachgeführt wird ausschließlich, was in PAIRS ein `zieh` trägt — die
   Zielbänder des Anwenders (Füllgrad, Anschnittgeschwindigkeit) bleiben
   unangetastet. Rückgabe: Liste der geänderten Feldnamen.                */
export function clampToDomain(values) {
  const geaendert = [];
  const setz = (k, x) => {
    if (!isFinite(x) || values[k] === x) return;
    values[k] = x; geaendert.push(k);
  };
  for (const r of PAIRS) {
    if (!r.zieh) continue;
    if (r.op === 'in' && r.zieh === 'key') {
      const lo = values[r.lo], hi = values[r.hi];
      if (!isFinite(lo) || !isFinite(hi) || lo > hi) continue;
      setz(r.key, Math.min(hi, Math.max(lo, values[r.key])));
    } else if (r.zieh === 'a') {
      const b = values[r.b];
      if (!isFinite(b)) continue;
      if (values[r.a] > b) setz(r.a, b);
    }
  }
  return geaendert;
}
