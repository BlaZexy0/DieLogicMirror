/* DieLogic – web/shared/svgfarben.js
   Die Bilder der Theorie (und das Team-Bild) folgen dem Farbschema.

   Ein SVG, das als <img> eingebunden ist, sieht die CSS-Variablen der Seite
   nicht: es bliebe in jedem Schema in den Standardfarben. Die Bilder unter
   /assets/theorie/ tragen darum zu jeder Farbe ihre ROLLE als Klasse:
   `f-melt` (Füllung in der Farbe der Schmelze), `s-steel-dark` (Strich),
   `c-ok` (Farbe eines Verlaufsstopps) — der Name ist das CSS-Token ohne
   „--". Die Farbe selbst steht als gewöhnliches Attribut daneben, im
   Standardwert: als Datei geöffnet (Browser, Inkscape) zeigt das Bild den
   Standard. Dieses Script holt die Bilder beim Laden der Seite und setzt sie
   an die Stelle des <img>; dann gelten die Regeln unten (CSS schlägt ein
   Attribut), und ein Wechsel des Schemas färbt die Bilder ohne Neuladen um.

   Geht etwas schief (file://, Netz, kein SVG), bleibt das <img> stehen:
   dann eben in den Standardfarben, aber nie ein leerer Platz. Ein Bild mit
   `data-live` lässt es aus (die Seite zeichnet es selbst, etwa das
   PQ²-Grundbild).

   Die Dateien sind unsere eigenen; trotzdem fliegt heraus, was ausgeführt
   werden könnte (script, foreignObject, on…-Attribute). Kennungen im Bild
   (Muster, Verläufe, Pfeilspitzen) bekommen einen Vorsatz je Bild, damit
   zwei Bilder auf einer Seite sich nicht gegenseitig die Muster nehmen.

   Klassisches Script, lädt nach nav.js. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || typeof fetch !== 'function' || typeof DOMParser !== 'function') return;
  if (location.protocol === 'file:') return;

  /* Die Theorie-Bilder und das Team-Bild auf „Über uns"; wer sonst ein
     Bild mit Rollenklassen einbinden will, setzt data-farben. */
  var WAHL = 'img[src^="/assets/theorie/"][src$=".svg"]:not([data-live]), img[src="/assets/team-mockup.svg"], img[data-farben]';
  var zaehler = 0;

  /* Die Regeln für alle Rollen der Palette, einmal je Seite. */
  function regeln() {
    var P = window.__PALETTE__;
    if (!P || document.getElementById('svgfarben-regeln')) return;
    var css = '';
    for (var k in P.colors) {
      var t = P.cssName(k).slice(2);
      css += '.svg-bild .f-' + t + '{fill:var(--' + t + ')}'
        + '.svg-bild .s-' + t + '{stroke:var(--' + t + ')}'
        + '.svg-bild .c-' + t + '{stop-color:var(--' + t + ')}';
    }
    var st = document.createElement('style');
    st.id = 'svgfarben-regeln';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function saeubern(svg) {
    var weg = svg.querySelectorAll('script, foreignObject');
    for (var i = 0; i < weg.length; i++) weg[i].parentNode.removeChild(weg[i]);
    var alle = svg.querySelectorAll('*');
    for (var j = -1; j < alle.length; j++) {
      var n = j < 0 ? svg : alle[j];
      for (var k = n.attributes.length - 1; k >= 0; k--) {
        var a = n.attributes[k];
        if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
      }
    }
  }

  /* Kennungen eindeutig machen: id="x" → id="svgf3-x", und jede Verweisform
     darauf (url(#x) in Attributen und Stilen, href="#x"). */
  function kennungen(svg, vorsatz) {
    var mitId = svg.querySelectorAll('[id]');
    if (!mitId.length) return;
    var alt = {};
    for (var i = 0; i < mitId.length; i++) {
      var id = mitId[i].getAttribute('id');
      alt[id] = vorsatz + id;
      mitId[i].setAttribute('id', vorsatz + id);
    }
    var umschreiben = function (wert) {
      return wert.replace(/url\(\s*#([^)\s]+)\s*\)/g, function (m, id) { return alt[id] ? 'url(#' + alt[id] + ')' : m; });
    };
    var alle = svg.querySelectorAll('*');
    for (var j = 0; j < alle.length; j++) {
      var n = alle[j];
      for (var k = 0; k < n.attributes.length; k++) {
        var a = n.attributes[k];
        if ((a.name === 'href' || a.name === 'xlink:href') && a.value.charAt(0) === '#' && alt[a.value.slice(1)]) {
          n.setAttribute(a.name, '#' + alt[a.value.slice(1)]);
        } else if (a.value.indexOf('url(') >= 0) {
          n.setAttribute(a.name, umschreiben(a.value));
        }
      }
      if (n.tagName && n.tagName.toLowerCase() === 'style') n.textContent = umschreiben(n.textContent);
    }
  }

  function einbinden(img) {
    if (img.dataset.svgfarben) return;
    img.dataset.svgfarben = 'laedt';
    fetch(img.getAttribute('src'), { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(function (text) {
        var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        var svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) throw new Error('kein SVG');
        saeubern(svg);
        kennungen(svg, 'svgf' + (++zaehler) + '-');
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', img.getAttribute('alt') || '');
        svg.removeAttribute('width');
        svg.removeAttribute('height');
        var klasse = ((svg.getAttribute('class') || '') + ' svg-bild ' + (img.getAttribute('class') || '')).trim();
        svg.setAttribute('class', klasse);
        if (img.id) svg.setAttribute('id', img.id);
        var neu = document.importNode(svg, true);
        if (img.parentNode) img.parentNode.replaceChild(neu, img);
      })
      .catch(function () { img.dataset.svgfarben = 'bild'; });
  }

  /* Erst holen, wenn ein Bild in die Nähe kommt (wie loading="lazy"); ohne
     IntersectionObserver alle gleich. */
  function start() {
    var bilder = document.querySelectorAll(WAHL);
    if (!bilder.length) return;
    regeln();
    if (typeof IntersectionObserver !== 'function') {
      for (var i = 0; i < bilder.length; i++) einbinden(bilder[i]);
      return;
    }
    var io = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        einbinden(e.target);
      });
    }, { rootMargin: '600px 0px' });
    for (var j = 0; j < bilder.length; j++) io.observe(bilder[j]);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
