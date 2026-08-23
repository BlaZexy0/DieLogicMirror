/* Auto-Schalter für Anschnitt- und Entlüftungsfläche (config/fields.js
   AUTO_KEYS, Zustand state.auto): die idealen Flächen aus Projekt und
   Schusskurve, vor jedem Rendern neu gesetzt — nach dem Kurven-Generator,
   damit v₂ und Füllzeit der aktuellen Kurve gelten.

   Anschnittfläche: Kontinuität A_a = A_K·v_p/v_a,Ziel mit v_a,Ziel in der
     Mitte des Zielbands (gateMin–gateMax) und v_p = Kolbengeschwindigkeit
     bei „Bauteil gefüllt" — dieselbe Stelle, an der KPI und Prüfung die
     Anschnittgeschwindigkeit bewerten (sonst v₂-Mittel, ohne Kurve der
     NADCA-Volumenstrom Q = V_a/t_N). Auf 10 mm² gerundet.
   Entlüftungsfläche: Bedarf A_ent = V_luft/(t_f·v_luft,max) (Diagramm
     „Entlüftungsbedarf") bei der Füllzeit der Kurve, sonst NADCA; auf 10 mm²
     aufgerundet.
   Reine Rechenlogik (idealGate/idealVent) + state-Wrapper (applyAuto). */

import './curvegen.js';                        // Preparer-Reihenfolge: erst Kurve, dann Auto
import { state, addPreparer } from './state.js';
import { total, afterGate, pistonArea, computeShot } from './physics.js';

/* Empfohlene NADCA-Füllzeit [ms] (wie ftwall/curvegen). */
function nadcaMs(v) {
  const den = v.Tflow - v.Tdie;
  const t = den !== 0 ? v.kfill * v.wall * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / den : NaN;
  return t > 0 ? t : NaN;
}

/* Ideale Anschnittfläche [mm²] oder NaN. shot optional (computeShot-Ergebnis). */
export function idealGate(v, shot) {
  const lo = v.gateMin > 0 ? v.gateMin : NaN, hi = v.gateMax > 0 ? v.gateMax : NaN;
  const target = isFinite(lo) && isFinite(hi) ? (lo + hi) / 2 : (isFinite(lo) ? lo : hi);
  if (!(target > 0)) return NaN;
  const A = pistonArea(v);
  let Q;                                        // mm³/s
  const evPart = shot && !shot.error && shot.events && shot.events[2];
  if (evPart && evPart.inP && evPart.v > 0) Q = A * evPart.v * 1000;
  else if (shot && !shot.error && shot.v2 > 0) Q = A * shot.v2 * 1000;
  else { const tN = nadcaMs(v); Q = 1e9 * (afterGate(v) / v.density) / (tN / 1000); }
  if (!(Q > 0) || !isFinite(Q)) return NaN;
  return Math.max(10, Math.round(Q / (target * 1000) / 10) * 10);
}

/* Ideale Entlüftungsfläche [mm²] oder NaN. */
export function idealVent(v, shot) {
  if (!(v.vAirMax > 0) || !(v.density > 0)) return NaN;
  const tf = shot && !shot.error && shot.fill > 0 ? shot.fill : nadcaMs(v);
  if (!(tf > 0)) return NaN;
  const Vm = total(v) / v.density;              // m³ verdrängte Luft
  const A = Vm / (tf / 1000) / v.vAirMax * 1e6; // mm²
  return Math.max(10, Math.ceil(A / 10) * 10);
}

/* Eingeschaltete Auto-Felder im Zustand setzen. Rückgabe: Liste der
   gesetzten Schlüssel (für die UI). */
export function applyAuto(values) {
  const on = Object.keys(state.auto).filter(k => state.auto[k]);
  if (!on.length) return [];
  const shot = computeShot(values, state.curve);
  const set = [];
  for (const k of on) {
    const x = k === 'gate' ? idealGate(values, shot) : k === 'vent' ? idealVent(values, shot) : NaN;
    if (isFinite(x)) { values[k] = x; set.push(k); }
  }
  return set;
}

addPreparer(() => { applyAuto(state.values); });
