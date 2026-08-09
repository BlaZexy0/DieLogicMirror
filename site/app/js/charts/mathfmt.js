/* Hilfsfunktionen für sauber formatierte Formeln in den Mathe-Erklärungen:
   echte Brüche (Zähler über Nenner) und Wurzeln mit Überstrich — reines
   HTML/CSS (Styles in css/main.css), keine externe Mathe-Bibliothek. */

export const frac = (num, den) =>
  '<span class="frac"><span class="num">' + num + '</span><span class="den">' + den + '</span></span>';

/* tall: größeres Wurzelzeichen, wenn der Radikand ein Bruch ist. */
export const sqrt = (rad, tall) =>
  '<span class="sqrt' + (tall ? ' tall' : '') + '"><span class="rad">' + rad + '</span></span>';

export const cbrt = (rad, tall) =>
  '<span class="sqrt cbrt' + (tall ? ' tall' : '') + '"><span class="rad">' + rad + '</span></span>';
