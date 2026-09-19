/**
 * DieLogic – nav.js
 * Injiziert Site-Navigation und Footer. Vollständig selbstversorgend:
 * alle Nav-/Footer-Styles werden mit injiziert (feste Farbwerte, keine
 * CSS-Variablen) — dadurch funktioniert die Navigation auch auf den
 * Dashboard-Seiten (app/), die nur ihr eigenes main.css laden.
 * Läuft über file:// und http(s).
 *
 * Einbindung von der Startseite:
 *   <script src="/shared/nav.js"></script>
 *
 * Einbindung aus app/ (eine Ebene tiefer, ohne Footer):
 *   <script src="/shared/nav.js" data-footer="none"></script>
 *
 * Schmale Fenster (Tablet, Handy): passen die Links nicht mehr neben Logo
 * und „Anmelden", schaltet nav.js die Leiste auf ein Burger-Menü um. Die
 * Grenze wird gemessen (Naturbreite der Links), nicht als Breakpoint
 * gepflegt — sonst schiebt der nächste neue Nav-Reiter den Anmelde-Knopf
 * wieder aus dem Bild.
 */

(function () {
  /* Farben: shared/palette.js, Version: version.js — beide vor nav.js geladen. */
  const C = window.__PALETTE__;
  const VERSION = 'v' + (window.__DL_VERSION__ || '?');

  /* ── Diagramm-Einzelseiten (Reihenfolge = js/charts/registry.js) ── */
  const CHARTS = [
    ['shotcurve', 'Schusskurve'],
    ['pq2',       'PQ²-Diagramm (Arbeitspunkt)'],
    ['phild',     'Auslegungsfenster (φ, λ)'],
    ['fill',      'Füllgrad der Füllkammer'],
    ['sleeve',    'Füllkammer-Auswahl'],
    ['slowshot',  'Kritische Kolbengeschw. 1. Phase'],
    ['gate',      'Anschnittfläche für Zielgeschwindigkeit'],
    ['window',    'Prozessfenster Anschnitt'],
    ['gvwall',    'Anschnittgeschw. über Wandstärke'],
    ['gatesol',   'Anschnitt-Erstarrungszeit'],
    ['bubble',    'Luftblase unter Nachdruck'],
    ['filltime',  'Füllzeit ab Anschnitt'],
    ['ftwall',    'Empfohlene Füllzeit'],
    ['vent',      'Entlüftungsgeschwindigkeit'],
    ['ventreq',   'Entlüftungsbedarf'],
    ['area',      'Zulässige Sprengfläche'],
    ['machine',   'Erforderliche Maschinengröße'],
    ['pspec',     'Spezifischer Gießdruck'],
    ['yield',     'Materialausbeute'],
  ];

  /* Zwei Gruppen von Werkzeugen, zwei Aufklappmenüs: „Auslegung"
     (Dashboard, Diagramme, Sprengfläche, Teilekosten, Zyklus) und
     „3D-Studio". Die fünf Auslegungs-Reiter standen lange einzeln in der
     Leiste; mit dem Studio daneben war das eine Reihe von neun, in der
     man die zwei Hälften nicht mehr sah. Beide Menüs haben dieselben
     Spalten: links das Ganze (Werkzeuge · Werkbank), rechts die vielen
     Einzelnen (Diagramme · Einzeltools) — die 19 Diagramme und die acht
     Werkzeuge des Studios in je zwei Spalten. */
  const NAV_LINKS = [
    { label: 'Auslegung', columns: [
      { title: 'Werkzeuge', items: [
        { label: 'Dashboard', href: '/tools/auslegung/' },
        { label: 'Sprengflächenanalyse', href: '/tools/sprengflaeche/' },
        { label: 'Teilekosten', href: '/tools/teilekosten/' },
        { label: 'Zyklusanalyse', href: '/tools/zyklus/' },
      ] },
      { title: 'Diagramme', wide: true, items: CHARTS.map(([id, title]) => (
        { label: title, href: '/tools/auslegung/chart.html?id=' + id }
      )) },
    ] },
    { label: '3D-Studio', columns: [
      { title: 'Werkbank', items: [
        { label: 'Werkbank', href: '/tools/3d-studio/werkbank.html' },
        { label: 'Übersicht', href: '/tools/3d-studio/' },
      ] },
      { title: 'Einzeltools', wide: true, items: [
        { label: 'Formaufbau', href: '/tools/3d-studio/form.html' },
        { label: 'Entformungsanalyse', href: '/tools/3d-studio/entformungsanalyse.html' },
        { label: 'Wandstärkenanalyse', href: '/tools/3d-studio/wandstaerke.html' },
        { label: 'Abstandsanalyse', href: '/tools/3d-studio/abstand.html' },
        { label: 'Angussdesigner', href: '/tools/3d-studio/anguss.html' },
        { label: 'Überlaufdesigner', href: '/tools/3d-studio/ueberlauf.html' },
        { label: 'Temperierkanal-Designer', href: '/tools/3d-studio/temperier.html' },
        { label: 'Füllabschätzung', href: '/tools/3d-studio/fuellung.html' },
        { label: 'Angussfüllung', href: '/tools/3d-studio/angussfuellung.html' },
        { label: 'Kammerfüllung', href: '/tools/3d-studio/kammerfuellung.html' },
      ] },
    ] },
    { label: 'Theorie', children: [
      { label: 'Das PQ²-Diagramm', href: '/theorie/pq2.html' },
      { label: 'Kritische Kolbengeschwindigkeit', href: '/theorie/kritische-geschwindigkeit.html' },
      { label: 'Kreissegmente der Füllkammer', href: '/theorie/kreissegmente.html' },
      { label: 'Nebenbedingungen der Auslegung', href: '/theorie/nebenbedingungen.html' },
      { label: 'Entlüftung, Vakuum und die Restblase', href: '/theorie/entlueftung-vakuum.html' },
      { label: 'Zuhaltung und Sprengfläche', href: '/theorie/zuhaltung-sprengflaeche.html' },
    ] },
    { label: 'Preise', href: '/index.html#preise' },
    { label: 'Über uns', href: '/recht/ueber-uns.html' },
    { label: 'Kontakt', href: '/recht/kontakt.html' },
  ];

  /* ── Basispfad auflösen ───────────────────────────────────── */
  const scriptEl = document.currentScript;
  const base = (scriptEl && scriptEl.dataset.base) ? scriptEl.dataset.base.replace(/\/+$/, '') : '';
  const wantFooter = !(scriptEl && scriptEl.dataset.footer === 'none');

  function resolveHref(href) {
    if (!href || href.startsWith('#') || href.startsWith('http')) return href;
    return base + href;
  }

  /* ── Aktiven Link erkennen ────────────────────────────────── */
  function isActive(href) {
    if (!href) return false;
    const clean = href.split('#')[0];
    const [hrefPath, hrefQuery] = clean.split('?');
    if (!hrefPath || hrefPath === '/') return false;
    // Href relativ zur Seite auflösen und Pfade exakt vergleichen —
    // sonst matcht z. B. /index.html#preise auf jeder …/index.html-Seite.
    const norm = (p) => p.replace(/\/$/, '/index.html');
    let target;
    try {
      target = new URL(resolveHref(hrefPath), window.location.href).pathname;
    } catch (e) {
      return false;
    }
    if (norm(target) !== norm(window.location.pathname)) return false;
    if (hrefQuery) return window.location.search === '?' + hrefQuery;
    return true;
  }

  /* ── Logo (assets/logo.svg — Füllkammer + Schusskurve) ────── */
  /* Wortmarke „DiehLogic": zwischen „Die" und „Logic" steht ein H, dessen
     Stämme die Kammerwände sind und dessen Querbalken die Schmelze ist, die
     als Pfeil durch den Anschnitt schießt (Motiv der Logo-Kachel). Das H
     ist dekorativ — vorgelesen bleibt der Name „DieLogic". */
  const H_GLYPH = `<svg class="dl-h-glyph" viewBox="0 0 100 100" aria-hidden="true"><rect x="0" y="0" width="17" height="100" rx="3" fill="${C.surface}"/><rect x="83" y="0" width="17" height="100" rx="3" fill="${C.surface}"/><path d="M17 38 L60 38 L60 26 L83 50 L60 74 L60 62 L17 62 Z" fill="${C.primary}"/></svg>`;
  const WORDMARK = `Die${H_GLYPH}<span style="color:${C.primaryLight}">Logic</span>`;

  /* ── Nav-Links bauen ──────────────────────────────────────── */
  const linkHtml = child => {
    const href = resolveHref(child.href);
    const active = isActive(child.href) ? ' active' : '';
    return `<a href="${href}" class="${active}">${child.label}</a>`;
  };

  function buildNavLinks() {
    return NAV_LINKS.map(item => {
      if (item.children || item.columns) {
        /* Die Gruppe trägt den Reiter-Strich, wenn eine ihrer Seiten die
           aktuelle ist — wie ein einzelner Reiter, der das selbst wäre. */
        const all = item.children || item.columns.flatMap(c => c.items);
        const activeGroup = all.some(c => isActive(c.href)) ? ' active' : '';
        let dropdown;
        if (item.columns) {
          const cols = item.columns.map(col => `<div class="dl-nav-col${col.wide ? ' dl-nav-col--two' : ''}">
            <div class="dl-nav-col-title">${col.title}</div>
            ${col.items.map(linkHtml).join('\n            ')}
          </div>`).join('\n          ');
          dropdown = `<div class="dl-nav-dropdown dl-nav-dropdown--cols">
          ${cols}
        </div>`;
        } else {
          dropdown = `<div class="dl-nav-dropdown">
          ${item.children.map(linkHtml).join('\n          ')}
        </div>`;
        }
        return `<li class="dl-nav-group">
        <button type="button" class="dl-nav-group-label${activeGroup}" aria-haspopup="true" aria-expanded="false">${item.label}</button>
        ${dropdown}
      </li>`;
      }
      const href = resolveHref(item.href);
      const active = isActive(item.href) ? ' class="active"' : '';
      return `<li><a href="${href}"${active}>${item.label}</a></li>`;
    }).join('\n      ');
  }

  /* ── Footer bauen ─────────────────────────────────────────── */
  function buildFooter() {
    const r = resolveHref;
    return `<footer class="dl-footer">
  <div class="dl-footer-col">
    <div class="dl-footer-logo">
      <span class="dl-footer-wordmark">${WORDMARK}</span>
    </div>
    <p class="dl-footer-desc">Gießtechnische Auslegung für den Druckguss (HPDC): Schusskurve, PQ², Füllkammer, Zyklus und Teilekosten — ein Projekt, alle Werkzeuge.</p>
    <p class="dl-footer-desc" style="margin-top:1rem;color:${C.ondark2};">© 2026 DieLogic</p>
  </div>

  <div class="dl-footer-col">
    <h4>Auslegung</h4>
    <ul>
      <li><a href="${r('/tools/auslegung/')}">Dashboard</a></li>
      <li><a href="${r('/tools/auslegung/chart.html?id=shotcurve')}">Schusskurve</a></li>
      <li><a href="${r('/tools/auslegung/chart.html?id=pq2')}">PQ²-Diagramm</a></li>
      <li><a href="${r('/tools/auslegung/chart.html?id=phild')}">Auslegungsfenster (φ, λ)</a></li>
      <li><a href="${r('/tools/sprengflaeche/')}">Sprengflächenanalyse</a></li>
      <li><a href="${r('/tools/teilekosten/')}">Teilekosten-Kalkulation</a></li>
      <li><a href="${r('/tools/zyklus/')}">Zyklusanalyse</a></li>
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>3D-Studio und Wissen</h4>
    <ul>
      <li><a href="${r('/tools/3d-studio/')}">3D-Studio: alle Werkzeuge</a></li>
      <li><a href="${r('/index.html#diagramme')}">Alle 19 Diagramme</a></li>
      <li><a href="${r('/theorie/pq2.html')}">Theorie: PQ²-Diagramm</a></li>
      <li><a href="${r('/theorie/kritische-geschwindigkeit.html')}">Theorie: Kritische Geschwindigkeit</a></li>
      <li><a href="${r('/theorie/kreissegmente.html')}">Theorie: Kreissegmente der Füllkammer</a></li>
      <li><a href="${r('/theorie/nebenbedingungen.html')}">Theorie: Nebenbedingungen der Auslegung</a></li>
      <li><a href="${r('/theorie/entlueftung-vakuum.html')}">Theorie: Entlüftung, Vakuum und die Restblase</a></li>
      <li><a href="${r('/theorie/zuhaltung-sprengflaeche.html')}">Theorie: Zuhaltung und Sprengfläche</a></li>
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>Rechtliches</h4>
    <ul>
      <li><a href="${r('/recht/impressum.html')}">Impressum</a></li>
      <li><a href="${r('/recht/datenschutz.html')}">Datenschutzerklärung</a></li>
      <li><a href="${r('/recht/agb.html')}">AGB</a></li>
      <li><a href="${r('/recht/widerruf.html')}">Widerrufsbelehrung</a></li>
      <li><a href="${r('/recht/ueber-uns.html')}">Über uns</a></li>
      <li><a href="${r('/recht/kontakt.html')}">Kontakt</a></li>
    </ul>
  </div>

  <div class="dl-footer-bottom">
    DieLogic — Auslegungsrechnung und Visualisierung im Browser. Für Gießerei-Ingenieure gebaut.
    &nbsp;·&nbsp; <a href="${r('/recht/impressum.html')}" style="color:${C.ondark2};">Impressum</a>
    &nbsp;·&nbsp; <a href="${r('/recht/datenschutz.html')}" style="color:${C.ondark2};">Datenschutz</a>
  </div>
</footer>`;
  }

  /* ── Styles (selbstversorgend, feste Farbwerte) ───────────── */
  const NAV_CSS = `
.dl-nav {
  height: 56px;
  background: ${C.dark};
  display: flex;
  align-items: center;
  padding: 0 2rem;
  gap: 2rem;
  position: sticky;
  top: 0;
  z-index: 100;
  font-family: -apple-system,'Inter',BlinkMacSystemFont,'Segoe UI',sans-serif;
}
.dl-nav-logo {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  text-decoration: none;
}
.dl-h-glyph { height: 0.78em; width: auto; display: inline-block; margin: 0 0.1em; }
.dl-nav-logo-text {
  font-size: 1.1rem;
  font-weight: 700;
  color: white;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.dl-nav-version {
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255,255,255,.6);
  align-self: flex-end;
  padding-bottom: 0.15rem;
  white-space: nowrap;
}
.dl-nav-links {
  display: flex;
  gap: 0;
  list-style: none;
  margin: 0 0 0 auto;
  padding: 0;
}
.dl-nav-links a {
  color: ${C.ondark};
  font-size: 0.85rem;
  padding: 0 0.9rem;
  text-decoration: none;
  line-height: 56px;
  transition: color 0.15s;
  display: inline-block;
  white-space: nowrap;
}
.dl-nav-links a:hover { color: white; }
.dl-nav-links > li > a.active {
  color: white;
  border-bottom: 2px solid ${C.primary};
}
.dl-nav-cta { display: flex; gap: 0.5rem; margin-left: 1.5rem; }
.dl-nav-cta a {
  display: inline-flex;
  align-items: center;
  padding: 0.3rem 0.7rem;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  background: ${C.primary};
  color: white;
  transition: background 0.15s;
  white-space: nowrap;
}
.dl-nav-cta a:hover { background: ${C.primary2}; }

.dl-nav-group { position: relative; display: inline-block; }
.dl-nav-group > .dl-nav-group-label {
  color: ${C.ondark};
  font-size: 0.85rem;
  font-family: inherit;
  font-weight: 400;
  padding: 0 0.9rem;
  line-height: 56px;
  cursor: pointer;
  display: inline-block;
  transition: color 0.15s;
  background: none;
  border: 0;
}
.dl-nav-group:hover > .dl-nav-group-label,
.dl-nav-group.open > .dl-nav-group-label,
.dl-nav-group > .dl-nav-group-label:focus-visible { color: white; }
.dl-nav-dropdown {
  position: absolute;
  top: 56px;
  left: 0;
  background: ${C.dark2};
  border: 1px solid ${C.dark3};
  border-radius: 6px;
  padding: 0.4rem 0;
  min-width: 280px;
  max-height: min(60vh, 520px);
  overflow-y: auto;
  display: none;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0,20,27,.35);
}
/* Offen ist ein Menü genau dann, wenn es .open trägt — Maus, Klick,
   Touch und Tastatur setzen die Klasse in wireDropdowns(), nicht :hover.
   Zu heißt display: none, nicht visibility: hidden: Firefox trifft beim
   Zeigertest (elementFromPoint) die Einträge eines unsichtbaren Menüs,
   sobald darin eine Spaltenüberschrift über beide Spalten geht
   (column-span: all) — auch mit pointer-events: none, Chromium nicht.
   Auf dem Weg von „Auslegung" nach unten „betrat" der Zeiger so das
   verborgene 3D-Studio-Menü, das darüberliegt, und das Menü schaltete um.
   Ein Menü, das nicht dargestellt wird, kann niemand treffen. */
.dl-nav-group.open .dl-nav-dropdown {
  display: block;
  animation: dl-menu-in 0.15s ease-out;
}
@keyframes dl-menu-in {
  from { opacity: 0; transform: translateY(-4px); }
}
.dl-nav-dropdown a {
  display: block;
  padding: 0.45rem 1rem;
  font-size: 0.82rem;
  line-height: 1.4;
  color: ${C.ondark};
  text-decoration: none;
}
.dl-nav-dropdown a:hover { color: white; background: rgba(255,255,255,.05); }
.dl-nav-dropdown a.active {
  color: white;
  border-left: 2px solid ${C.primary};
  padding-left: calc(1rem - 2px);
}

.dl-footer {
  background: ${C.dark};
  color: ${C.ondark};
  padding: 2.5rem 2rem;
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr;
  gap: 2rem;
  font-family: -apple-system,'Inter',BlinkMacSystemFont,'Segoe UI',sans-serif;
}
.dl-footer-logo {
  color: white;
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
}
.dl-footer-desc { font-size: 0.8rem; line-height: 1.6; max-width: 240px; margin: 0; }
.dl-footer-col h4 {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: white;
  margin: 0 0 0.75rem;
}
.dl-footer-col ul { list-style: none; margin: 0; padding: 0; }
.dl-footer-col li a {
  font-size: 0.8rem;
  color: ${C.ondark};
  text-decoration: none;
  display: block;
  padding: 0.2rem 0;
}
.dl-footer-col li a:hover { color: white; }
.dl-footer-bottom {
  grid-column: 1 / -1;
  border-top: 1px solid ${C.dark2};
  margin-top: 2rem;
  padding-top: 1.5rem;
  font-size: 0.75rem;
  color: ${C.ondark2};
  text-align: center;
}

/* ── Schmale Leiste: Burger-Knopf und Klapp-Panel ───────────────────
   Passen die Links nicht mehr neben Logo und „Anmelden", schaltet
   nav.js die Klasse .dl-nav--compact — gemessen, nicht per fester
   Breakpoint-Grenze, damit ein neuer Nav-Reiter die Leiste nicht
   wieder sprengt. */
.dl-nav-burger {
  display: none;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 40px;
  height: 40px;
  margin-left: 0.4rem;
  padding: 0;
  border: 1px solid rgba(255,255,255,.2);
  border-radius: 8px;
  background: none;
  color: ${C.ondark};
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.dl-nav-burger:hover { color: white; border-color: rgba(255,255,255,.45); }
.dl-nav-burger span,
.dl-nav-burger span::before,
.dl-nav-burger span::after {
  display: block;
  width: 18px;
  height: 2px;
  border-radius: 2px;
  background: currentColor;
  transition: transform 0.18s, background 0.18s;
}
.dl-nav-burger span { position: relative; }
.dl-nav-burger span::before,
.dl-nav-burger span::after { content: ''; position: absolute; left: 0; }
.dl-nav-burger span::before { top: -6px; }
.dl-nav-burger span::after { top: 6px; }
.dl-nav--open .dl-nav-burger span { background: transparent; }
.dl-nav--open .dl-nav-burger span::before { transform: translateY(6px) rotate(45deg); }
.dl-nav--open .dl-nav-burger span::after { transform: translateY(-6px) rotate(-45deg); }

.dl-nav--compact .dl-nav-burger { display: inline-flex; }
.dl-nav--compact .dl-nav-logo { flex: 0 1 auto; min-width: 0; overflow: hidden; }
.dl-nav--compact .dl-nav-cta { margin-left: auto; }
.dl-nav--compact .dl-nav-links {
  display: none;
  position: absolute;
  top: 56px;
  left: 0;
  right: 0;
  flex-direction: column;
  margin: 0;
  padding: 0.25rem 0 0.6rem;
  background: ${C.dark2};
  border-top: 1px solid ${C.dark3};
  box-shadow: 0 12px 28px rgba(0,20,27,.45);
  max-height: calc(100vh - 56px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  overscroll-behavior: contain;
  z-index: 200;
}
.dl-nav--compact.dl-nav--open .dl-nav-links { display: flex; }
.dl-nav--compact .dl-nav-links > li { width: 100%; }
.dl-nav--compact .dl-nav-links > li > a,
.dl-nav--compact .dl-nav-group > .dl-nav-group-label {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-height: 46px;
  padding: 0.5rem 1.25rem;
  font-size: 0.95rem;
  line-height: 1.3;
  text-align: left;
}
.dl-nav--compact .dl-nav-links > li > a.active {
  border-bottom: 0;
  border-left: 3px solid ${C.primary};
  padding-left: calc(1.25rem - 3px);
}
.dl-nav--compact .dl-nav-group { display: block; position: static; }
.dl-nav--compact .dl-nav-group > .dl-nav-group-label { justify-content: space-between; }
.dl-nav--compact .dl-nav-group > .dl-nav-group-label::after {
  content: '';
  flex: 0 0 auto;
  width: 8px;
  height: 8px;
  margin-left: 0.75rem;
  border-right: 2px solid currentColor;
  border-bottom: 2px solid currentColor;
  transform: translateY(-2px) rotate(45deg);
  transition: transform 0.18s;
}
.dl-nav--compact .dl-nav-group.open > .dl-nav-group-label::after {
  transform: translateY(2px) rotate(-135deg);
}
.dl-nav--compact .dl-nav-dropdown {
  display: none;
  position: static;
  animation: none;
  min-width: 0;
  max-height: none;
  overflow: visible;
  padding: 0.1rem 0 0.35rem;
  border: 0;
  border-radius: 0;
  background: rgba(0,0,0,.18);
  box-shadow: none;
}
.dl-nav--compact .dl-nav-group.open > .dl-nav-dropdown { display: block; }
.dl-nav--compact .dl-nav-dropdown a {
  display: flex;
  align-items: center;
  min-height: 40px;
  padding: 0.5rem 1.25rem 0.5rem 2.25rem;
  font-size: 0.88rem;
}
.dl-nav--compact .dl-nav-dropdown a.active {
  border-left: 3px solid ${C.primary};
  padding-left: calc(2.25rem - 3px);
}

/* Messzustand: die Links werden kurz aus dem Fluss genommen und in die
   breite Darstellung gezwungen — so kennt nav.js ihre Naturbreite auch
   dann, wenn die Leiste gerade zusammengeklappt ist. */
.dl-nav--measuring .dl-nav-links {
  display: flex !important;
  position: absolute !important;
  visibility: hidden !important;
  top: 0 !important;
  left: 0 !important;
  right: auto !important;
  flex-direction: row !important;
  width: auto !important;
  max-width: none !important;
  max-height: none !important;
  overflow: visible !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: none !important;
  box-shadow: none !important;
}
.dl-nav--measuring .dl-nav-group { display: inline-block !important; }
.dl-nav--measuring .dl-nav-links > li > a,
.dl-nav--measuring .dl-nav-group > .dl-nav-group-label {
  display: inline-block !important;
  width: auto !important;
  min-height: 0 !important;
  padding: 0 0.9rem !important;
  font-size: 0.85rem !important;
  line-height: 56px !important;
}
.dl-nav--measuring .dl-nav-group > .dl-nav-group-label::after { content: none !important; }
.dl-nav--measuring .dl-nav-dropdown { display: none !important; }
.dl-nav--measuring .dl-nav-cta { margin-left: 1.5rem !important; }
.dl-nav--measuring .dl-nav-burger { display: none !important; }

/* ── Menü mit Spalten („Auslegung"): Werkzeuge links, die Diagramme
   rechts in zwei Spalten. Es hängt mit der rechten Kante am Reiter,
   weil es breiter ist als der Platz rechts davon. ─────────────── */
.dl-nav-group > .dl-nav-group-label.active {
  color: white;
  border-bottom: 2px solid ${C.primary};
}
.dl-nav-group.open .dl-nav-dropdown--cols { display: flex; }
.dl-nav-dropdown--cols {
  align-items: flex-start;
  left: auto;
  right: 0;
  min-width: 0;
  max-height: none;
  overflow: visible;
  padding: 0.5rem 0.4rem 0.6rem;
}
.dl-nav-col { padding: 0 0.3rem; min-width: 200px; }
.dl-nav-col + .dl-nav-col { border-left: 1px solid ${C.dark3}; }
.dl-nav-col-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: ${C.ondark2};
  padding: 0.3rem 1rem 0.4rem;
  column-span: all;
}
.dl-nav-col--two { column-count: 2; column-gap: 0; }
.dl-nav-col--two a { break-inside: avoid; }
.dl-nav--compact .dl-nav-dropdown--cols { display: none; padding: 0.1rem 0 0.35rem; }
.dl-nav--compact .dl-nav-group.open > .dl-nav-dropdown--cols { display: block; }
.dl-nav--compact .dl-nav-col { padding: 0; min-width: 0; column-count: 1; }
.dl-nav--compact .dl-nav-col + .dl-nav-col { border-left: 0; margin-top: 0.25rem; }
.dl-nav--compact .dl-nav-col-title { padding: 0.45rem 1.25rem 0.2rem 2.25rem; }
.dl-nav--compact .dl-nav-group > .dl-nav-group-label.active { border-bottom: 0; }

@media (max-width: 960px) {
  .dl-nav { padding: 0 1rem; gap: 1rem; }
  .dl-footer { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 480px) {
  .dl-nav { padding: 0 0.75rem; gap: 0.5rem; }
  .dl-nav-version { display: none; }
}
`;

  function injectStyles() {
    const style = document.createElement('style');
    style.id = 'dielogic-nav-styles';
    style.textContent = NAV_CSS;
    document.head.appendChild(style);
  }

  function injectNav() {
    const navHTML = `<nav class="dl-nav">
  <a class="dl-nav-logo" href="${resolveHref('/index.html')}">
    <span class="dl-nav-logo-text">${WORDMARK}</span>
    <span class="dl-nav-version">${VERSION}</span>
  </a>
  <ul class="dl-nav-links" id="dl-nav-links">
    ${buildNavLinks()}
  </ul>
  <div class="dl-nav-cta">
    <a href="${resolveHref('/konto/')}" id="dl-nav-account">Anmelden</a>
  </div>
  <button type="button" class="dl-nav-burger" aria-label="Menü öffnen"
          aria-expanded="false" aria-controls="dl-nav-links"><span></span></button>
</nav>`;

    const mount = document.getElementById('nav-mount');
    if (mount) {
      mount.innerHTML = navHTML;
    } else {
      document.body.insertAdjacentHTML('afterbegin', navHTML);
    }
    wireDropdowns();
    wireCompact();
  }

  /* Aufklapp-Menüs: Maus, Klick/Touch und Tastatur schalten dieselbe
     Klasse .open, immer nur ein Menü zur Zeit.
     Mit der Maus reichte :hover nicht. „Auslegung" und „3D-Studio" hängen
     mit der rechten Kante am Reiter und klappen nach links auf; der Weg
     zu „Dashboard" oder „Werkbank" läuft Hunderte Pixel die Leiste entlang
     und nur 30 px hinunter — über die leere Leiste oder quer über den
     Nachbarreiter. :hover schloss das Menü dort (oder schaltete um).
     Ein Zielkorridor (Dreieck vom Reiter zur Menükante) half nur für
     gerade Linien: die Hand zieht erst waagerecht, einen Pixel zu hoch,
     und das Menü war zu. Darum gilt jetzt:
       - Der Streifen der Leiste über dem offenen Menü gehört zum Menü.
         Dort bleibt es offen, egal wie der Zeiger läuft.
       - Ein anderer Reiter in diesem Streifen übernimmt erst, wenn der
         Zeiger auf ihm zur Ruhe kommt (DWELL_MS lang weniger als
         DWELL_PX bewegt) — wer nur darüber hinwegzieht, auch langsam,
         behält sein Menü.
       - Ein anderer Reiter außerhalb schaltet sofort um; sonst schließt
         das Menü GRACE_MS, nachdem der Zeiger Menü und Streifen verlassen hat.
     Ein Klick auf den Reiter hält das Menü fest, bis daneben geklickt,
     weggetabbt oder Escape gedrückt wird. */
  function wireDropdowns() {
    const nav = document.querySelector('.dl-nav');
    const groups = Array.from(document.querySelectorAll('.dl-nav .dl-nav-group'));
    if (!nav || !groups.length) return;
    const GRACE_MS = 250;      // Zeiger neben Menü und Streifen: so lange bleibt es stehen
    const DWELL_MS = 120;      // so lange ruhig auf einem anderen Reiter im Streifen: dann übernimmt er
    const DWELL_PX = 4;        // „ruhig" = weniger bewegt als das (Handzittern)

    let current = null;     // offene Gruppe
    let pinned = false;     // per Klick geöffnet
    let muted = null;       // gerade per Klick/Escape geschlossen: kein Hover-Öffnen, bis der Zeiger sie verlässt
    let lastItem = null;    // Reiter/Link der Leiste unter dem Zeiger (li) oder null
    let dwellOn = null, dwellX = 0, dwellY = 0;
    let timer = 0;

    const compact = () => nav.classList.contains('dl-nav--compact');
    const label = g => g.querySelector('.dl-nav-group-label');
    const cancel = () => { clearTimeout(timer); timer = 0; };
    const later = (ms) => { clearTimeout(timer); timer = setTimeout(settle, ms); };

    function setOpen(g, pin) {
      cancel();
      groups.forEach(o => {
        o.classList.toggle('open', o === g);
        label(o).setAttribute('aria-expanded', String(o === g));
      });
      current = g;
      pinned = !!(g && pin);
      dwellOn = null;
    }

    /* Timer abgelaufen: was unter dem Zeiger liegt, gewinnt. */
    function settle() {
      timer = 0;
      const g = lastItem && lastItem.classList.contains('dl-nav-group') ? lastItem : null;
      if (g && g !== current && g !== muted) setOpen(g, pinned);
      else if (!pinned && g !== current) setOpen(null);
    }

    /* Liegt (x, y) im Leistenstreifen über dem offenen Menü? */
    function inStrip(x, y) {
      const d = current.querySelector('.dl-nav-dropdown').getBoundingClientRect();
      const n = nav.getBoundingClientRect();
      return x >= d.left && x <= d.right && y >= n.top && y < Math.max(d.top, n.bottom);
    }

    document.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch' || compact()) return;
      const t = e.target;
      const item = t && t.closest ? t.closest('.dl-nav-links > li') : null;
      const group = item && item.classList.contains('dl-nav-group') ? item : null;
      lastItem = item;
      if (group !== muted) muted = null;
      if (!current) {
        if (group && group !== muted) setOpen(group, false);
        return;
      }
      if (group === current) { cancel(); dwellOn = null; return; }
      if (inStrip(e.clientX, e.clientY)) {
        if (!item) { cancel(); dwellOn = null; return; }
        if (!group && pinned) { cancel(); return; }
        if (dwellOn !== item || Math.hypot(e.clientX - dwellX, e.clientY - dwellY) >= DWELL_PX) {
          dwellOn = item; dwellX = e.clientX; dwellY = e.clientY;
          later(DWELL_MS);
        }
        return;
      }
      const wasDwelling = dwellOn !== null;
      dwellOn = null;
      if (group && group !== muted) setOpen(group, pinned);
      else if (pinned) cancel();
      else if (wasDwelling || !timer) later(GRACE_MS);
    });
    /* Zeiger verlässt das Fenster */
    document.addEventListener('pointerout', (e) => {
      if (e.relatedTarget || e.pointerType === 'touch' || compact()) return;
      lastItem = null;
      if (current && !pinned) later(GRACE_MS);
    });

    groups.forEach(g => {
      label(g).addEventListener('click', () => {
        if (current === g && (pinned || compact())) {
          setOpen(null);
          muted = g;
        } else {
          setOpen(g, true);
        }
      });
      /* Mit Tab aus dem Menü heraus: zu. (Ein Klick daneben schließt
         über den Dokument-Klick unten.) */
      g.addEventListener('focusout', (e) => {
        const to = e.relatedTarget;
        if (current === g && !compact() && to && !g.contains(to)) setOpen(null);
      });
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (current && !(t && t.closest && t.closest('.dl-nav-group'))) setOpen(null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !current) return;
      const g = current;
      const inside = g.contains(document.activeElement);
      setOpen(null);
      muted = g;
      if (inside) label(g).focus();
    });
  }

  /* ── Schmale Leiste: messen statt raten ───────────────────────
     Die Linkliste wächst mit jedem Werkzeug (zuletzt „3D-Studio"), und
     ab einer gewissen Länge schob sie „Anmelden" aus dem Bild. Statt
     eine feste Breakpoint-Grenze zu pflegen, misst nav.js die
     Naturbreite der Links und klappt die Leiste zum Burger-Menü
     zusammen, sobald sie neben Logo und CTA nicht mehr passt. */
  let recompute = null;

  function wireCompact() {
    const nav = document.querySelector('.dl-nav');
    if (!nav) return;
    const links  = nav.querySelector('.dl-nav-links');
    const logo   = nav.querySelector('.dl-nav-logo');
    const cta    = nav.querySelector('.dl-nav-cta');
    const burger = nav.querySelector('.dl-nav-burger');
    if (!links || !logo || !cta || !burger) return;

    const px = (v) => { const n = parseFloat(v); return isFinite(n) ? n : 0; };

    /* Breite, die die Leiste in voller Darstellung bräuchte. Gemessen
       im Zustand .dl-nav--measuring — dort liegen die Links absolut und
       unsichtbar in Zeilenform, unabhängig davon, ob gerade
       zusammengeklappt ist. */
    function fitsWide() {
      nav.classList.add('dl-nav--measuring');
      const navCs = getComputedStyle(nav);
      const ctaCs = getComputedStyle(cta);
      const gap = px(navCs.columnGap || navCs.gap);
      const need = Math.ceil(Math.max(links.scrollWidth, links.getBoundingClientRect().width))
        + logo.offsetWidth
        + cta.offsetWidth + px(ctaCs.marginLeft)
        + 2 * gap
        + px(navCs.paddingLeft) + px(navCs.paddingRight)
        + 8;                     /* kleine Reserve gegen Rundungsränder */
      const room = nav.clientWidth;
      nav.classList.remove('dl-nav--measuring');
      return need <= room;
    }

    function setOpen(open) {
      nav.classList.toggle('dl-nav--open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Menü schließen' : 'Menü öffnen');
    }

    function update() {
      const compact = !fitsWide();
      nav.classList.toggle('dl-nav--compact', compact);
      if (!compact) setOpen(false);
    }
    recompute = update;

    burger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!nav.classList.contains('dl-nav--open'));
    });
    /* Ein Klick auf einen Link schließt das Panel — bei Sprungzielen
       (#preise) lädt die Seite sonst nicht neu und es bliebe offen. */
    links.addEventListener('click', (e) => {
      if (e.target && e.target.closest && e.target.closest('a')) setOpen(false);
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t && t.closest && t.closest('.dl-nav'))) setOpen(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false);
    });

    let lastWidth = -1, queued = false;
    const onResize = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        const w = Math.round(nav.clientWidth);
        if (w === lastWidth) return;
        lastWidth = w;
        update();
      });
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => update()).catch(() => {});
    }
    lastWidth = Math.round(nav.clientWidth);
    update();
  }

  function injectFooter() {
    document.body.insertAdjacentHTML('beforeend', buildFooter());
  }

  /* Angemeldet? Dann zeigt der Knopf den Namen statt „Anmelden" — nur
     hinter dem Backend (http/https); bei file:// oder statischem Hosting
     bleibt der Link zur Konto-Seite. */
  function showAccount() {
    if (location.protocol === 'file:' || typeof fetch !== 'function') return;
    fetch(resolveHref('/api/auth/me'), { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(me => {
        const a = document.getElementById('dl-nav-account');
        if (!a) return;
        if (me && me.user) a.textContent = '👤 ' + (me.user.name || me.user.email);
        a.title = 'Projekte & Konto';
        if (recompute) recompute();
      })
      .catch(() => {});
  }

  function init() {
    injectStyles();
    injectNav();
    if (wantFooter) injectFooter();
    showAccount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
