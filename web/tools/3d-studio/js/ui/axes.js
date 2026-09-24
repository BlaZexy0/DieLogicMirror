/* Das Achsenkreuz in der Ecke — wohin zeigen X, Y und Z?

   Beim Angussdesigner ist das keine Zierde: die Ausstoßrichtung ist eine
   Achse, die Arbeitsebene steht senkrecht darauf, die Koordinaten der
   Punkte werden von Hand eingetippt. Wer frei dreht (js/trackball.js),
   verliert ohne Anhaltspunkt sofort, welche Richtung welche ist.

   Gezeichnet wird es NICHT in der 3D-Szene, sondern als SVG über dem
   Bild. Ein zweiter Renderdurchgang mit eigener Kamera wäre der übliche
   Weg und hier unnötig teuer: die drei Achsen sind drei Striche, und
   ihre Lage folgt allein aus der Drehung der Kamera. Als SVG bleiben sie
   in jeder Auflösung scharf, kosten kein WebGL und funktionieren für
   beide Projektionen gleich.

   Rechnung: die Spalten der Kameramatrix sind Rechts, Oben und (nach
   hinten) die Blickachse. Das Skalarprodukt einer Weltachse mit den
   ersten beiden gibt die Bildschirmrichtung, mit der dritten die Tiefe —
   daraus die Verkürzung (von selbst, weil die Bildschirmanteile kürzer
   werden) und die Deckkraft: was nach hinten zeigt, wird blasser. */

/* Die Farben sind die Achsenrollen als Tokens (shared.css): das SVG steht
   im Dokument, ein Farbschema erreicht es also ohne Neuzeichnen. Dieselben
   Farben wie die Achsenpfeile der Griffe und die Entformrichtungen
   (js/part/colors.js); keine davon ist eine Ampelfarbe, X ist also kein
   Fehler und Y kein „gut". */
const AXES = [
  { label: 'X', dir: [1, 0, 0], color: 'var(--axis-x, #ac6eef)' },
  { label: 'Y', dir: [0, 1, 0], color: 'var(--axis-y, #68a7cc)' },
  { label: 'Z', dir: [0, 0, 1], color: 'var(--axis-z, #2e65a0)' }
];

const SIZE = 74, C = SIZE / 2, R = 22;

export function mountAxes(container) {
  const el = document.createElement('div');
  el.className = 'axis-gizmo';
  el.title = 'Achsenkreuz: wohin X, Y und Z zeigen';
  el.innerHTML = '<svg viewBox="0 0 ' + SIZE + ' ' + SIZE + '" width="' + SIZE + '" height="' + SIZE
    + '" aria-hidden="true">'
    + AXES.map(a => '<line x1="' + C + '" y1="' + C + '" x2="' + C + '" y2="' + C
      + '" style="stroke:' + a.color + '" stroke-width="1.8" stroke-linecap="round"/>').join('')
    + AXES.map(a => '<circle cx="' + C + '" cy="' + C + '" r="7.5" style="fill:' + a.color + '"/>').join('')
    + AXES.map(a => '<text x="' + C + '" y="' + C + '" text-anchor="middle" dominant-baseline="central" '
      + 'fill="#fff" font-size="9" font-weight="700" font-family="system-ui,sans-serif">'
      + a.label + '</text>').join('')
    + '</svg>';
  container.appendChild(el);

  /* Vom Rahmen aus gesucht, nicht vom <svg> aus: das winzige DOM der
     Tests hängt die Kinder flach nebeneinander, ein Browser
     verschachtelt sie. So findet beides dieselben drei Achsen. */
  const lines = el.querySelectorAll('line');
  const dots = el.querySelectorAll('circle');
  const labels = el.querySelectorAll('text');
  let last = null;

  /** Vor jedem Bild aufgerufen; rechnet nur, wenn sich die Kamera dreht. */
  function update(camera) {
    const m = camera.matrixWorld.elements;
    const key = m[0] + ',' + m[1] + ',' + m[2] + ',' + m[4] + ',' + m[5] + ',' + m[6]
      + ',' + m[8] + ',' + m[9] + ',' + m[10];
    if (key === last) return;
    last = key;
    AXES.forEach((a, i) => {
      const sx = a.dir[0] * m[0] + a.dir[1] * m[1] + a.dir[2] * m[2];
      const sy = a.dir[0] * m[4] + a.dir[1] * m[5] + a.dir[2] * m[6];
      const sz = a.dir[0] * m[8] + a.dir[1] * m[9] + a.dir[2] * m[10];
      const x = C + sx * R, y = C - sy * R;
      lines[i].setAttribute('x2', x.toFixed(2));
      lines[i].setAttribute('y2', y.toFixed(2));
      dots[i].setAttribute('cx', x.toFixed(2));
      dots[i].setAttribute('cy', y.toFixed(2));
      labels[i].setAttribute('x', x.toFixed(2));
      labels[i].setAttribute('y', y.toFixed(2));
      /* sz > 0: die Achse zeigt zum Betrachter. */
      const dim = (0.45 + 0.55 * (sz + 1) / 2).toFixed(2);
      dots[i].setAttribute('opacity', dim);
      lines[i].setAttribute('opacity', dim);
    });
  }
  return { element: el, update };
}
