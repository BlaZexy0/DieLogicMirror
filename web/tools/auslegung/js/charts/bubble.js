/* Luftblase unter Nachdruck: Durchmesserverhältnis vor/nach der
   Nachverdichtung über dem Nachdruck (ideales Gas, Zustand friert bei
   Formtemperatur ein). */

import { series, line } from './helpers.js';
import { seq, fmt, subHTML } from '../core/format.js';
import { pistonArea, injForceEff } from '../core/physics.js';
import { sim } from '../core/simstore.js';
import { eq } from './mathfmt.js';

const P_ATM = 1.01325;                                  // Umgebungsdruck bar
const K = 273.15;

/* D_vor/D_nach = ((p_N/p_vor) · (T_liq/T_form))^(1/3), Temperaturen in K.
   p_vor = Druck der eingeschlossenen Luft beim Füllende: ohne Vakuum
   Umgebungsdruck, mit Vakuum der simulierte Restluftdruck.
   Exportiert für den Kennwert im Thermik-Panel (ui/kpis.js). */
export function ratio(v, p, pVor) {
  return Math.cbrt((p / (pVor || P_ATM)) * ((v.Tliq + K) / (v.Tdie + K)));
}

/* Restluftdruck beim Füllende aus der Luftsimulation [bar], oder null
   (Eingabe nicht simulierbar / Vakuum-Modell „aus").

   p_vor ist der Druck der eingeschlossenen Luft in dem Moment, in dem die
   Kavität voll ist — nicht am Ende des Abtastfensters. Danach drückt der
   Kolben das Restluftvolumen auf nahezu null; dort liefert das Vakuum-Modell
   nur noch seinen Rückfallwert (Umgebungsdruck, exakt 1013,25 mbar), weil das
   Ventil längst geschlossen ist. Diese letzte Probe als p_vor zu nehmen ließ
   „ohne Vakuum" und „mit Vakuum" als zwei identische Kurven erscheinen. */
export function vacPressure(v) {
  if (!v.vacModel || v.vacModel === 'aus') return null;
  const sd = sim.data;
  if (!sd || !sd.samples || !Array.isArray(sd.samples.p_air_mbar)) return null;
  const arr = sd.samples.p_air_mbar, fill = sd.samples.part_fill;
  if (Array.isArray(fill)) {
    for (let i = 0; i < arr.length; i++) {
      if (fill[i] >= 1 - 1e-9 && Number.isFinite(arr[i]) && arr[i] > 0) return arr[i] / 1000;  // mbar → bar
    }
  }
  /* Kein part_fill oder Kavität wird nie voll: letzte Probe. */
  for (let i = arr.length - 1; i >= 0; i--) {
    if (Number.isFinite(arr[i]) && arr[i] > 0) return arr[i] / 1000;
  }
  return null;
}

/* Maximaler Nachdruck mit dem montierten Kolben: die wirksame Gießkraft
   beim eingestellten Akkumulatordruck auf der Kolbenfläche (statisch, wie
   p₀ im PQ²-Diagramm). Bis zum 23.09. stand hier die volle Gießkraft; mit
   einem Arbeitsdruck unter dem Nenndruck endete die Achse dann bei einem
   Druck, den PQ² und spezifischer Gießdruck gar nicht zeigen. */
function pMax(v) {
  const A = pistonArea(v), F = injForceEff(v);
  return F > 0 && A > 0 ? F * 1e4 / A : NaN;
}

export default {
  id: 'bubble',
  title: 'Luftblase unter Nachdruck',
  desc: 'Durchmesserverhältnis vor/nach Nachdruck',
  inputs: ['injForce', 'pAcc', 'pAccOp', 'diam', 'psel', 'Tliq', 'Tdie', 'vacModel', 'vent', 'ventGap', 'ventLen', 'vacPump', 'vacTank', 'vacStart', 'vacEnd', 'vacEndStroke', 'vacEndTime'],
  usesCurve: true,
  usesSim: true,

  calc(v) {
    const p0 = pMax(v);
    if (!(p0 > P_ATM)) return { err: 'braucht Gießkraft, Akkumulatordrücke und Kolben-Ø (max. Nachdruck ≤ Umgebungsdruck).' };
    if (!(v.Tliq > v.Tdie) || !(v.Tdie > -K)) return { err: 'braucht Liquidus- über Formtemperatur.' };
    const x = seq(P_ATM, p0, 200);
    const pVac = vacPressure(v);
    /* Mit dem Vergleich trägt jede Kurve die Sache, die in der Kammer steht:
       Luft bei Atmosphärendruck, Vakuum bei abgesaugter Kammer. Allein ist
       die Kurve ohne Vakuum die Hauptgröße des Diagramms (Schrift). */
    const ys = [series('ohne Vakuum (p_vor 1013 mbar)', pVac !== null ? 'air' : 'ink', x, p => ratio(v, p))];
    if (pVac !== null) {
      ys.push(series('mit Vakuum (p_vor ' + fmt(pVac * 1000) + ' mbar, Simulation)', 'vacuum', x, p => ratio(v, p, pVac)));
    }
    const q = line(x, ys,
      'Nachdruck p_N in bar', 'Blasen-Ø-Verhältnis D_vor/D_nach',
      'T_liq ' + fmt(v.Tliq) + ' °C · T_Form ' + fmt(v.Tdie) + ' °C · max. Nachdruck (Ø ' + fmt(v.diam) + ') ' + fmt(p0) + ' bar'
      + (pVac === null && v.vacModel && v.vacModel !== 'aus' ? ' · Vakuum nicht simulierbar, nur ohne Vakuum' : ''));
    q.y0 = 0;
    if (v.psel >= P_ATM && v.psel <= p0) {
      const r = ratio(v, v.psel, pVac !== null ? pVac : undefined);
      q.pt = [v.psel, r];
      q.ptl = 'Gewählter Nachdruck ' + fmt(v.psel) + ' bar → Ø-Verhältnis ' + fmt(r) + (pVac !== null ? ' (mit Vakuum)' : '');
    }
    return q;
  },

  mathHTML() {
    return `
<h4>Warum der Nachdruck Poren schrumpft</h4>
<p class="math-note">Trotz Entlüftung bleibt Luft in der Füllung eingeschlossen. Beim Füllende steht sie
als Blase unter dem Druck p<sub>vor</sub> in der noch flüssigen Schmelze (T ≈ T<sub>liq</sub>):
ohne Vakuum ist das der Umgebungsdruck, mit Vakuum der <em>simulierte Restluftdruck</em> der Kammer
beim Füllende (Luftdruck-Kurve der Schusskurve). Der Nachdruck presst die Blase zusammen,
bevor das Gefüge erstarrt; ihr Zustand friert etwa bei Formtemperatur ein. Für die eingeschlossene
Luft als ideales Gas gilt zwischen „vor" (p<sub>vor</sub>, T<sub>liq</sub>) und „nach"
(p<sub>N</sub>, T<sub>Form</sub>):</p>
${eq('\\frac{p_{\\text{vor}} \\cdot V_{\\text{vor}}}{T_{\\text{liq}}} = \\frac{p_{\\text{N}} \\cdot V_{\\text{nach}}}{T_{\\text{Form}}} \\qquad (T\\ \\text{in K})')}
<p class="math-note">Volumen geht mit der dritten Potenz des Durchmessers. Auflösen und Wurzel ziehen
liefert das Durchmesserverhältnis, das die Kurven zeigen (eine je p<sub>vor</sub>):</p>
${eq('\\frac{D_{\\text{vor}}}{D_{\\text{nach}}} = \\left( \\frac{p_{\\text{N}}}{p_{\\text{vor}}} \\cdot \\frac{T_{\\text{liq}}}{T_{\\text{Form}}} \\right)^{1/3}')}
<p class="math-note">Mit Vakuum liegt p<sub>vor</sub> weit unter Umgebungsdruck: dieselbe Blase wird
stärker komprimiert (höhere Kurve), und vor allem ist von vornherein weniger Luft eingeschlossen,
die Ausgangsblasen sind kleiner. Ohne Simulationsdaten (Modell „ohne Vakuum" oder nicht simulierbare Eingaben)
zeigt das Diagramm nur die Kurve für Umgebungsdruck.</p>
<p class="math-note">Die Kubikwurzel ist der Grund, warum viel Nachdruck nötig ist: das <em>Volumen</em>
schrumpft proportional zum Druck, der sichtbare Poren-Ø aber nur mit p<sup>1/3</sup>. Eine Verzehnfachung
des Ø-Verhältnisses kostet das Tausendfache an Druck. Die x-Achse endet beim maximalen Nachdruck des
montierten Kolbens p<sub>max</sub> = F<sub>G,eff</sub>/A<sub>K</sub> (wirksame Gießkraft beim eingestellten
Akkumulatordruck, statisch, wie p₀ im PQ²-Diagramm). Annahmen: ideales Gas, keine Lösung der Luft in der Schmelze, Blase bleibt kugelig.</p>
<p class="math-note">Aktuell: p<sub>max</sub>(Ø <span data-m="D"></span>) = <b data-m="pmax"></b> ·
T<sub>liq</sub>/T<sub>Form</sub> = <b data-m="Tratio"></b> (in K) · p<sub>vor</sub> = <b data-m="pvor"></b> ·
beim gewählten Nachdruck p<sub>N</sub> = <span data-m="psel"></span>: D<sub>vor</sub>/D<sub>nach</sub> = <b data-m="r"></b>
(Blasenvolumen auf <b data-m="vol"></b>)<span data-m="rvac"></span></p>`;
  },

  renderMath(el, v) {
    const set = (k, val) => { const s = el.querySelector('[data-m="' + k + '"]'); if (s) s.innerHTML = subHTML(val); };
    const p0 = pMax(v);
    set('D', fmt(v.diam) + ' mm');
    set('pmax', isFinite(p0) ? fmt(p0) + ' bar' : '—');
    set('Tratio', fmt((v.Tliq + K) / (v.Tdie + K)));
    set('psel', fmt(v.psel) + ' bar');
    const pVac = vacPressure(v);
    set('pvor', pVac !== null ? fmt(pVac * 1000) + ' mbar (Vakuum-Simulation)' : '1013 mbar (ohne Vakuum)');
    const r = ratio(v, v.psel, pVac !== null ? pVac : undefined);
    set('r', isFinite(r) ? fmt(r) : '—');
    set('vol', isFinite(r) ? fmt(100 / (r * r * r)) + ' %' : '—');
    const r0 = ratio(v, v.psel);
    set('rvac', pVac !== null && isFinite(r0) ? ' · ohne Vakuum wäre es ' + fmt(r0) : '');
  }
};
