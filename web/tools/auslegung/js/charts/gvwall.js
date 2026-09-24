/* Empfohlene Anschnittgeschwindigkeit über Wandstärke mit Zielband. */

import { series, line, target } from './helpers.js';
import { seq, fmt } from '../core/format.js';
import { eq, mathSetter } from './mathfmt.js';

/* Die Empfehlung bei der Wandstärke s: linear von v_a,max bei s_min auf
   v_a,min bei s_max — für die Kurve und die Erklärung dieselbe Zeile. */
function vaAt(v, s) {
  return v.gateMax - (v.gateMax - v.gateMin) * (s - v.wallMin) / (v.wallMax - v.wallMin);
}

export default {
  id: 'gvwall',
  title: 'Anschnittgeschw. über Wandstärke',
  desc: 'Empfehlung mit Zielband',
  inputs: ['wallMin', 'wallMax', 'gateMin', 'gateMax', 'wall'],

  calc(v) {
    const x = seq(v.wallMin, v.wallMax, 140);
    const f = s => vaAt(v, s);
    const q = line(x, [series('Empfehlung', 'ink', x, f)],
      'Wandstärke in mm', 'Anschnittgeschwindigkeit in m/s', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
    q.limits = [target('gateBand', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s', 'y', v.gateMin, v.gateMax)];
    q.y0 = 0;
    q.pt = [v.wall, f(v.wall)];
    q.ptl = fmt(v.wall) + ' mm → ' + fmt(f(v.wall)) + ' m/s';
    return q;
  },

  mathHTML() {
    return `
<h4>Anschnittgeschwindigkeit über Wandstärke</h4>
<p class="math-note">Dünne Wände erstarren in Millisekunden: die Schmelze muss fein zerstäubt und schnell
eingebracht werden, bevor die Front ansteht; dicke Wände vertragen (und wollen) eine ruhigere Füllung, weil
hohe Geschwindigkeit dort nur Lufteinschluss und Formverschleiß kauft. Das ist eine Erfahrungs-Empfehlung,
keine Naturkonstante: zwischen den Stützstellen des Wandstärkenbereichs (v<sub>a,max</sub> bei
s<sub>min</sub>, v<sub>a,min</sub> bei s<sub>max</sub>) wird schlicht linear interpoliert:</p>
${eq('v_{a}(s) = v_{a,\\max} - \\left( v_{a,\\max} - v_{a,\\min} \\right) \\cdot \\frac{s - s_{\\min}}{s_{\\max} - s_{\\min}}')}
<p class="math-note">Bei s = s<sub>min</sub> gilt v<sub>a,max</sub>, bei s = s<sub>max</sub> gilt
v<sub>a,min</sub>. Aktuell: v<sub>a</sub>(s = <span data-m="s"></span>) = <b data-m="va"></b> ·
Zielband <span data-m="band"></span></p>`;
  },

  renderMath(el, v) {
    const set = mathSetter(el);
    /* Ohne Spanne (s_min = s_max) ist die Empfehlung nicht bestimmt: dann „—" */
    const va = vaAt(v, v.wall);
    set('s', fmt(v.wall) + ' mm');
    set('va', isFinite(va) ? fmt(va) + ' m/s' : '—');
    set('band', fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s');
  }
};
