/* Grenzen (Ungleichungs-Restriktionen) als Daten: reine Rechenlogik, kein DOM.

   Jedes Diagramm beschreibt seine Grenzen deklarativ als Objekte; die
   Renderer (render/limits.js) zeichnen daraus Grenzlinien, Schraffuren,
   Zielbänder und Legendeneinträge. Eine neue Restriktion ist ein weiteres
   Objekt im limits-Array des Diagramms — Schnittmengen-, Zeichen- und
   Legendenlogik kommen von hier bzw. vom Renderer.

   Objektformen (Erzeuger in charts/helpers.js):

   Harte Grenze   { id, label, on:'x'|'y', kind:'min'|'max', value }        konstante Schranke
                  { id, label, on:'y',     kind:'min'|'max', fn: x=>y }     Kurvenschranke
     kind 'min':  zulässig ist ≥ Schranke (darunter/links ausgeschlossen)
     kind 'max':  zulässig ist ≤ Schranke (darüber/rechts ausgeschlossen)
     fn darf ±Infinity liefern — dort gilt keine Beschränkung (Lücke).
     note: optionale Kurzbeschreibung, wird in die Ausschlussfläche gesetzt.

   Zielband       { id, label, on:'x'|'y', min, max, severity:'target' }
     min/max: Zahlen, bei on:'y' auch Funktionen x→y (Band zwischen Kurven).
     Kein Ausschluss — weiche Empfehlung, gefüllt statt schraffiert.

   Referenzlinie  { id, label, on:'x'|'y', value, severity:'ref' }
     Nur Orientierung (gestrichelte Linie), keine Fläche.

   Maske          { …, fn, mask: true }   (Kurvenschranke auf 'y')
     Ausschlussseite prinzipiell unerreichbar: deckend gefüllt
     (theme.chart.mask), Frontlinie durchgezogen; alle übrigen Grenzen
     werden vom Renderer auf die erreichbare Seite geclippt.

   Die Farbe kommt aus theme.limits[id] (/shared/theme.js): die Familie,
   aus der die Grenze stammt (Maschine, Werkzeug, Prozess, Luft,
   Schmelze). Ohne Eintrag theme.chart.ref; per l.c als Rolle
   überschreibbar (render/limits.js). */

/* Zulässiges Intervall aus konstanten Grenzen EINER Achse: Schnittmenge
   aller kind-min/max-Schranken. Liefert auch die jeweils bindende Grenze
   (die schärfste), z. B. für Beschriftung oder Prüftexte. */
export function feasibleInterval(limits, lo0 = -Infinity, hi0 = Infinity) {
  let lo = lo0, hi = hi0, loLim = null, hiLim = null;
  for (const l of limits || []) {
    if ((l.severity || 'hard') !== 'hard' || typeof l.value !== 'number') continue;
    if (l.kind === 'min' && l.value > lo) { lo = l.value; loLim = l; }
    if (l.kind === 'max' && l.value < hi) { hi = l.value; hiLim = l; }
  }
  return { lo, hi, ok: hi > lo, loLim, hiLim };
}

/* Zulässiges Band zwischen Kurvenschranken: an jeder Stützstelle x gilt
   max(untere Schranken) ≤ y ≤ min(obere Schranken). Liefert geschlossene
   Polygone [[x, y], …] — das Band zerfällt automatisch, wo es sich
   zuschnürt. lowers/uppers: Arrays von Funktionen x → y (±Infinity, wo eine
   Schranke nicht greift). Zusätzlich je Stützstelle die aktive (bindende)
   Schranke als Index in lowers/uppers (−1 = Rand yMin/yMax). */
export function feasibleBand(xs, lowers, uppers, yMin = -Infinity, yMax = Infinity, eps = 1e-9) {
  const polys = [];
  const edges = [];               // { x, lo, hi, loIdx, hiIdx } je zulässiger Stützstelle
  let lo = [], hi = [];
  const flush = () => {
    if (lo.length) polys.push(lo.concat(hi.reverse()));
    lo = []; hi = [];
  };
  for (const x of xs) {
    let a = yMin, ai = -1, b = yMax, bi = -1;
    /* ±Infinity heißt vereinbarungsgemäß „hier keine Schranke" und bleibt
       gültig. NaN heißt dagegen „diese Schranke weiß es an dieser Stelle
       nicht" — sie wurde bisher schlicht übersprungen und das zulässige
       Band damit WEITER gemacht, als es sein darf. An so einer Stelle gilt
       nichts als zulässig. */
    let unbekannt = false;
    for (let i = 0; i < lowers.length; i++) {
      const y = lowers[i](x);
      if (Number.isNaN(y)) { unbekannt = true; break; }
      if (y > a) { a = y; ai = i; }
    }
    for (let i = 0; !unbekannt && i < uppers.length; i++) {
      const y = uppers[i](x);
      if (Number.isNaN(y)) { unbekannt = true; break; }
      if (y < b) { b = y; bi = i; }
    }
    if (unbekannt) { flush(); continue; }
    if (b > a + eps) {
      lo.push([x, a]); hi.push([x, b]);
      edges.push({ x, lo: a, hi: b, loIdx: ai, hiIdx: bi });
    } else {
      flush();
    }
  }
  flush();
  return { polys, edges };
}

/* Verletzt der Punkt die Grenze? Nur harte Grenzen; Zielband/Referenz nie.
   xv/yv in Datenkoordinaten (für Hover und Prüftexte). */
export function violates(l, xv, yv) {
  if ((l.severity || 'hard') !== 'hard') return false;
  const t = l.on === 'x' ? xv : yv;
  const bound = l.fn ? l.fn(xv) : l.value;
  if (!isFinite(bound)) return false;
  return l.kind === 'max' ? t > bound : t < bound;
}
