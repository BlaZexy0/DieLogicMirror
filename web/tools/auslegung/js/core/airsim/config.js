/* Dashboard-Werte (kg, mm, mm², mbar, L, ms) → SI-Konfiguration des
   Schussprozesses. Prüft die Eingaben, rechnet die Einheiten um und kappt
   die Schusskurve am Füllende. Jede Ablehnung ist ein SimError mit einer
   Meldung für den Anwender; geprüft wird in fester Reihenfolge, gemeldet
   wird das ERSTE Problem.

   Konventionen wie in ../physics.js: Dosiervolumen = (Bauteil + Anguss +
   Überlauf + Pressrest)/ρ flüssig, Füllgrad φ = V_dose/(A·L); Kavitäten
   sind feste Geometrie bei der Dichte an Solidus. Die Rechenreihenfolge ist
   die der Referenz — A ist hier ¼·π·D·D und im Prozess π·D²/4.

   Gelesen werden: part, runner, overflow, biscuit, density, diam, length,
   gate — und, soweit vorhanden: densitySolid, shrink, sealStroke, vent,
   ventGap, ventLen, vacModel, vacPump, vacTank, vacStart, vacEnd,
   vacEndStroke, vacEndTime. Ohne densitySolid rechnen die Kavitäten mit der
   Flüssigdichte, ohne sealStroke schließt die Einfüllöffnung bei 20 % der
   Kammerlänge, ohne vacModel gibt es kein Vakuum. */

import { rhoSolidus } from '../physics.js';
import { SimError } from './errors.js';

/* s — der Kolben ruht, während die Schmelze eingefüllt wird und sich
   beruhigt; das Luftmodell integriert durch beide Phasen, abgetastet wird
   das Ergebnis ab Schussbeginn. */
export const DOSING_TIME = 4;
export const DWELL_TIME = 1;
/* Lage der Einfüllöffnung ohne `sealStroke`: dieser Anteil der Kammerlänge. */
const POUR_HOLE_POSITION_FRACTION = 0.2;
/* m — so weit vor dem Füllende-Hub wird die Kurve gekappt: der Prozess
   verweigert ein Profil, das über das Füllende hinausfährt, und am Füllende
   selbst ist das Luftvolumen null. */
export const CLAMP_MARGIN = 1e-6;

const NO_VACUUM = ['', 'aus', 'none', 'sealed'];
const VACUUM_MODELS = ['ideal', 'conductance', 'tank'];
const VALVE_END_MODES = ['fill', 'stroke', 'time'];

function num(values, key) {
  const x = values[key];
  if (typeof x !== 'number') throw new SimError('Eingabe \'' + key + '\' fehlt oder ist keine Zahl.');
  if (!Number.isFinite(x)) throw new SimError('Eingabe \'' + key + '\' ist nicht endlich.');
  return x;
}
/* Optionaler Wert: fehlt der Schlüssel (oder ist er null), gilt die Vorgabe
   — ist er vorhanden, muss er eine endliche Zahl sein. */
function numOpt(values, key, fallback) {
  return values[key] === undefined || values[key] === null ? fallback : num(values, key);
}

/* Kurvenpunkte [s m, v m/s] aufsteigend, Ursprung ergänzt, bei
   `limit − CLAMP_MARGIN` gekappt (Geschwindigkeit am Kappunkt linear
   interpoliert). Nicht-endliche Punkte werden still übersprungen — wie in
   buildProfile() (leere Tabellenzeilen). */
function clampedCurve(curve, limit) {
  const pts = [];
  for (const p of curve) {
    const s = p?.[0], v = p?.[1];
    if (typeof s !== 'number' || typeof v !== 'number') {
      throw new SimError('Schusskurve: Punkte müssen [s_mm, v_m_s]-Paare sein.');
    }
    if (!(Number.isFinite(s) && Number.isFinite(v))) continue;
    if (v < 0) throw new SimError('Schusskurve: Geschwindigkeiten müssen ≥ 0 sein.');
    pts.push([s / 1000, v]);
  }
  if (!pts.length) throw new SimError('Schusskurve: keine gültigen Punkte.');
  if (pts[0][0] < 0) throw new SimError('Schusskurve: Wege müssen ≥ 0 sein.');
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] <= pts[i - 1][0]) throw new SimError('Schusskurve: Wege müssen streng steigen.');
  }
  if (pts[0][0] > 0) pts.unshift([0, 0]);

  /* Liegt die ganze Kurve hinter dem Kappunkt, bleibt der ergänzte Ursprung
     und der erste Punkt wird auf den Kappunkt interpoliert. */
  const cut = limit - CLAMP_MARGIN;
  if (cut <= 0) throw new SimError('Füllende-Hub ist null — das Pressrestvolumen lässt keinen Kolbenweg zu.');
  let clamped = false;
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1], p = pts[i];
    if (p[0] <= cut) {
      out.push(p);
      continue;
    }
    const f = (cut - prev[0]) / (p[0] - prev[0]);
    out.push([cut, prev[1] + f * (p[1] - prev[1])]);
    clamped = true;
    break;
  }
  if (out.length < 2) throw new SimError('Schusskurve: zu wenige Punkte vor dem Füllende-Hub.');
  return { points: out, clamped };
}

/* Die Vakuum-Felder → Vakuumsystem des Prozesses, oder null für „kein
   Vakuum".

   Die Entlüftungsfläche IST der Ventilquerschnitt — ein eigenes Feld gibt
   es nicht. Spalt und Kanallänge machen aus der Blende einen Kanal mit
   Wandreibung (beide > 0); fehlt eines, bleibt es bei der Blende. Das
   Sofort-Modell kennt weder Fläche noch Kanal und liest die Kanalfelder gar
   nicht erst (das Dashboard blendet sie dort aus). */
function vacuumSystem(values, fillComplete, travel) {
  const model = String(values.vacModel ?? '').trim();
  if (!values.vacModel || NO_VACUUM.includes(model)) return null;
  if (!VACUUM_MODELS.includes(model)) {
    throw new SimError('Vakuum-Modell \'' + model + '\' unbekannt — erlaubt: ' + VACUUM_MODELS.join(', ') + ' oder \'aus\'.');
  }

  const pump = num(values, 'vacPump') * 100;        // mbar → Pa
  if (pump <= 0) throw new SimError('Pumpen-Enddruck muss > 0 mbar sein.');
  const valveArea = num(values, 'vent') / 1e6;      // mm² → m²
  if (valveArea <= 0) throw new SimError('Entlüftungsfläche muss > 0 mm² sein.');
  const start = num(values, 'vacStart') / 1000;     // mm → m
  if (start < 0) throw new SimError('Vakuum-Start muss ≥ 0 mm sein.');
  const limit = Math.min(fillComplete, travel);
  if (start >= limit) {
    throw new SimError('Vakuum-Start (' + (start * 1000).toFixed(0) + ' mm) muss vor dem Kurvenende/Füllende ('
      + (limit * 1000).toFixed(0) + ' mm) liegen.');
  }

  /* Ventilschluss: am Füllende (Vorgabe), bei einem Kolbenweg oder nach
     einer Offenzeit ab Ventilöffnung. Ein Schließweg hinter dem Füllende
     heißt schlicht „bis zum Füllende". */
  const endMode = String(values.vacEnd || 'fill').trim();
  if (!VALVE_END_MODES.includes(endMode)) {
    throw new SimError('Ventilschluss \'' + endMode + '\' unbekannt — erlaubt: ' + VALVE_END_MODES.join(', ') + '.');
  }
  let endPosition = null, duration = null;
  if (endMode === 'stroke') {
    const end = num(values, 'vacEndStroke') / 1000;
    if (end <= start) {
      throw new SimError('Ventil-Schließweg (' + (end * 1000).toFixed(0) + ' mm) muss hinter dem Vakuum-Start ('
        + (start * 1000).toFixed(0) + ' mm) liegen.');
    }
    endPosition = Math.min(end, limit);
  } else if (endMode === 'time') {
    duration = num(values, 'vacEndTime') / 1000;
    if (duration <= 0) throw new SimError('Ventil-Offenzeit muss > 0 ms sein.');
  }

  let channel = null;
  if (model !== 'ideal') {
    const gap = numOpt(values, 'ventGap', 0) / 1000;
    const length = numOpt(values, 'ventLen', 0) / 1000;
    if (gap < 0 || length < 0) throw new SimError('Entlüftungsspalt und Kanallänge dürfen nicht negativ sein.');
    if (gap > 0 && length > 0) channel = { gap, length };
  }
  const valve = { area: valveArea, channel };

  let vacuumModel;
  if (model === 'tank') {
    const tankVolume = num(values, 'vacTank') / 1000;   // L → m³
    if (tankVolume <= 0) throw new SimError('Tankvolumen muss > 0 L sein.');
    vacuumModel = { type: 'tank', tankVolume, tankPressure: pump };
  } else {
    vacuumModel = { type: model, pumpPressure: pump };
  }
  return { startPosition: start, endPosition, duration, valve, model: vacuumModel };
}

/* Dashboard-Zustand → { config, meta }: die Prozesskonfiguration und die
   abgeleiteten Zahlen, die das Dashboard neben der Simulation zeigt. */
export function processConfigFromDesign(values, curve) {
  for (const key of ['part', 'runner', 'overflow', 'biscuit', 'density', 'diam', 'length', 'gate']) num(values, key);

  const rho = num(values, 'density');
  if (rho <= 0) throw new SimError('Dichte muss > 0 sein.');
  /* Kavitäten sind feste Geometrie (ρ an Solidus), die Dosierung liegt
     flüssig in der Kammer (ρ). */
  const solid = numOpt(values, 'densitySolid', 0);
  const shrink = solid > 0 ? numOpt(values, 'shrink', 0) : 0;
  const rhoSol = rhoSolidus({ density: rho, densitySolid: solid, shrink });
  const D = num(values, 'diam') / 1000;
  const L = num(values, 'length') / 1000;
  if (D <= 0 || L <= 0) throw new SimError('Kolben-Ø und Kammerlänge müssen > 0 sein.');
  const A = 0.25 * Math.PI * D * D;

  const runner = num(values, 'runner');
  const part = num(values, 'part');
  const overflow = num(values, 'overflow');
  const biscuit = num(values, 'biscuit');
  const Vr = runner / rhoSol;
  const Vp = part / rhoSol;
  const Vo = overflow / rhoSol;
  const Vb = biscuit / rhoSol;                        // der Pressrest ist in der Endlage fest
  if (Vr <= 0) throw new SimError('Angussgewicht muss > 0 sein.');
  if (Vp <= 0) throw new SimError('Bauteilgewicht muss > 0 sein.');
  if (Vo < 0) throw new SimError('Überlaufgewicht darf nicht negativ sein.');
  if (Vb <= 0) throw new SimError('Pressrestgewicht muss > 0 sein.');
  const Vdose = (runner + part + overflow + biscuit) / rho;
  const phi = Vdose / (A * L);
  if (phi >= 1) {
    throw new SimError('Dosiervolumen (' + (Vdose * 1e6).toFixed(0) + ' cm³) übersteigt das Kammervolumen — Füllgrad ≥ 100 %.');
  }
  if (phi <= 0) throw new SimError('Dosiervolumen ist null.');

  /* Füllende = Kammer voll + Kavität; danach Nachverdichtung bis zur Endlage
     L − Pressrest fest. Dieser Hub ist die Schwindung: flüssig dosiertes
     Volumen minus fester Kavität minus festem Pressrest. Er wird negativ,
     sobald die Dichte an Solidus unter der Schmelzedichte liegt — ein
     physikalisch unmöglicher Schuss. Ohne Feststoffdichte ist er exakt null,
     bis auf Rundungsreste — die Toleranz ist ein Mikrometer, nicht null. */
  const biscuitLength = Vb / A;
  const fillComplete = L - Vdose / A + (Vr + Vp + Vo) / A;
  const intens = L - biscuitLength - fillComplete;
  if (intens < -1e-6) {
    throw new SimError('Nachverdichtungshub wäre negativ (' + (intens * 1000).toFixed(1) + ' mm): die Feststoffdichte ('
      + rhoSol.toFixed(0) + ' kg/m³ nach Schwindung) liegt unter der Schmelzedichte (' + rho.toFixed(0)
      + ' kg/m³) — das Gussstück würde beim Erstarren größer.');
  }
  const { points, clamped } = clampedCurve(curve, fillComplete);

  const gateArea = num(values, 'gate') / 1e6;
  if (gateArea <= 0) throw new SimError('Anschnittfläche muss > 0 sein.');
  const ventArea = numOpt(values, 'vent', 0) / 1e6;

  /* Einfüllöffnung: Verschluss-Hub aus dem Dashboard (sealStroke, mm) —
     derselbe Wert wie im Füllkammer-Schema. */
  const seal = numOpt(values, 'sealStroke', POUR_HOLE_POSITION_FRACTION * L * 1000) / 1000;
  if (!(seal > 0 && seal <= L)) {
    throw new SimError('Einfüllöffnung-Verschlusshub (' + (seal * 1000).toFixed(0) + ' mm) muss > 0 mm sein und in der Kammer ('
      + (L * 1000).toFixed(0) + ' mm) liegen.');
  }

  /* Mit Vakuum ist die Entlüftungsfläche der Weg zum Ventil und sonst
     nichts: der Kanal endet am Ventil, vor dem Öffnen und nach dem Schließen
     ist er eine Sackgasse. Dieselbe Fläche zusätzlich als Entlüftung gegen
     die Umgebung zu führen, zählte sie doppelt, sobald der Druck über
     Umgebung stiege. Ohne Vakuum bleibt sie Entlüftung (die das dichte
     Modell nicht nutzt). */
  const vacuum = vacuumSystem(values, fillComplete, points[points.length - 1][0]);
  const vent = { area: vacuum === null && ventArea > 0 ? ventArea : null, channel: null };

  return {
    config: {
      sleeve: { diameter: D, length: L, fillFraction: phi, pourHolePosition: seal },
      casting: { runnerVolume: Vr, partVolume: Vp, overflowVolume: Vo, gateArea, vent },
      motion: { positions: points.map(p => p[0]), velocities: points.map(p => p[1]) },
      dosingTime: DOSING_TIME,
      dwellTime: DWELL_TIME,
      vacuum
    },
    meta: {
      phi,
      fill_complete_mm: fillComplete * 1000,
      biscuit_mm: biscuitLength * 1000,
      intens_mm: intens * 1000,
      curve_clamped: clamped
    }
  };
}
