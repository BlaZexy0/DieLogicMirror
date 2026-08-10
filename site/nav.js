/**
 * DieLogic – nav.js
 * Injiziert Site-Navigation und Footer. Vollständig selbstversorgend:
 * alle Nav-/Footer-Styles werden mit injiziert (feste Farbwerte, keine
 * CSS-Variablen) — dadurch funktioniert die Navigation auch auf den
 * Dashboard-Seiten (app/), die nur ihr eigenes main.css laden.
 * Läuft über file:// und http(s).
 *
 * Einbindung von der Startseite:
 *   <script src="nav.js" data-base="."></script>
 *
 * Einbindung aus app/ (eine Ebene tiefer, ohne Footer):
 *   <script src="../nav.js" data-base=".." data-footer="none"></script>
 */

(function () {
  /* ── Diagramm-Einzelseiten (Reihenfolge = js/charts/registry.js) ── */
  const CHARTS = [
    ['shotcurve', 'Schusskurve'],
    ['pq2',       'PQ²-Diagramm (Arbeitspunkt)'],
    ['phild',     'Auslegungsfenster (φ, L/D)'],
    ['area',      'Zulässige Sprengfläche'],
    ['machine',   'Erforderliche Maschinengröße'],
    ['filltime',  'Füllzeit ab Anschnitt'],
    ['fill',      'Füllgrad der Füllkammer'],
    ['vent',      'Entlüftungsgeschwindigkeit'],
    ['sleeve',    'Füllkammer-Auswahl'],
    ['gate',      'Anschnittfläche für Zielgeschwindigkeit'],
    ['slowshot',  'Kritische Kolbengeschw. 1. Phase'],
    ['pspec',     'Spezifischer Gießdruck'],
    ['window',    'Prozessfenster Anschnitt'],
    ['ftwall',    'Empfohlene Füllzeit'],
    ['gvwall',    'Anschnittgeschw. über Wandstärke'],
    ['ventreq',   'Entlüftungsbedarf'],
    ['yield',     'Materialausbeute'],
    ['gatesol',   'Anschnitt-Erstarrungszeit'],
  ];

  const NAV_LINKS = [
    { label: 'Dashboard', href: '/app/index.html' },
    { label: 'Diagramme', children: CHARTS.map(([id, title]) => (
      { label: title, href: '/app/chart.html?id=' + id }
    )) },
    { label: 'STL-Analyse', href: '/stl/stl-analyse.html' },
    { label: 'Theorie', children: [
      { label: 'Das PQ²-Diagramm', href: '/theorie/pq2.html' },
      { label: 'Kritische Kolbengeschwindigkeit', href: '/theorie/kritische-geschwindigkeit.html' },
    ] },
    { label: 'Preise', href: '/index.html#preise' },
    { label: 'Über uns', href: '/ueber-uns.html' },
    { label: 'Kontakt', href: '/kontakt.html' },
  ];

  /* ── Basispfad auflösen ───────────────────────────────────── */
  const scriptEl = document.currentScript;
  const base = (scriptEl && scriptEl.dataset.base) ? scriptEl.dataset.base.replace(/\/+$/, '') : '.';
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
  const LOGO_IMG = `<img src="${base}/assets/logo.svg" alt="" width="32" height="32" aria-hidden="true">`;

  /* ── Nav-Links bauen ──────────────────────────────────────── */
  function buildNavLinks() {
    return NAV_LINKS.map(item => {
      if (item.children) {
        const dropdownItems = item.children.map(child => {
          const href = resolveHref(child.href);
          const active = isActive(child.href) ? ' active' : '';
          return `<a href="${href}" class="${active}">${child.label}</a>`;
        }).join('\n          ');

        return `<li class="dl-nav-group">
        <span class="dl-nav-group-label">${item.label}</span>
        <div class="dl-nav-dropdown">
          ${dropdownItems}
        </div>
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
      ${LOGO_IMG}
      DieLogic
    </div>
    <p class="dl-footer-desc">Gießtechnische Auslegung + Schusskurve für den Druckguss (HPDC) — komplett im Browser, ohne Abhängigkeiten.</p>
    <p class="dl-footer-desc" style="margin-top:1rem;color:#5a7a86;">© 2026 DieLogic</p>
  </div>

  <div class="dl-footer-col">
    <h4>Werkzeuge</h4>
    <ul>
      <li><a href="${r('/app/index.html')}">Dashboard</a></li>
      <li><a href="${r('/app/chart.html?id=shotcurve')}">Schusskurve</a></li>
      <li><a href="${r('/app/chart.html?id=pq2')}">PQ²-Diagramm</a></li>
      <li><a href="${r('/app/chart.html?id=phild')}">Auslegungsfenster (φ, L/D)</a></li>
      <li><a href="${r('/stl/stl-analyse.html')}">STL-Analyse</a></li>
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>Wissen</h4>
    <ul>
      <li><a href="${r('/index.html#diagramme')}">Alle 19 Diagramme</a></li>
      <li><a href="${r('/theorie/pq2.html')}">Theorie: PQ²-Diagramm</a></li>
      <li><a href="${r('/theorie/kritische-geschwindigkeit.html')}">Theorie: Kritische Geschwindigkeit</a></li>
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>Rechtliches</h4>
    <ul>
      <li><a href="${r('/recht/impressum.html')}">Impressum</a></li>
      <li><a href="${r('/recht/datenschutz.html')}">Datenschutzerklärung</a></li>
      <li><a href="${r('/recht/agb.html')}">AGB</a></li>
      <li><a href="${r('/recht/widerruf.html')}">Widerrufsbelehrung</a></li>
      <li><a href="${r('/ueber-uns.html')}">Über uns</a></li>
      <li><a href="${r('/kontakt.html')}">Kontakt</a></li>
    </ul>
  </div>

  <div class="dl-footer-bottom">
    DieLogic — Auslegungsrechnung und Visualisierung im Browser. Für Gießerei-Ingenieure gebaut.
    &nbsp;·&nbsp; <a href="${r('/recht/impressum.html')}" style="color:#5a7a86;">Impressum</a>
    &nbsp;·&nbsp; <a href="${r('/recht/datenschutz.html')}" style="color:#5a7a86;">Datenschutz</a>
  </div>
</footer>`;
  }

  /* ── Styles (selbstversorgend, feste Farbwerte) ───────────── */
  const NAV_CSS = `
.dl-nav {
  height: 56px;
  background: #002733;
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
.dl-nav-logo img { width: 32px; height: 32px; display: block; }
.dl-nav-logo-text {
  font-size: 1.1rem;
  font-weight: 700;
  color: white;
  letter-spacing: -0.02em;
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
  color: #8fb8c4;
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
  border-bottom: 2px solid #008c82;
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
  background: #008c82;
  color: white;
  transition: background 0.15s;
  white-space: nowrap;
}
.dl-nav-cta a:hover { background: #00726a; }

.dl-nav-group { position: relative; display: inline-block; }
.dl-nav-group > .dl-nav-group-label {
  color: #8fb8c4;
  font-size: 0.85rem;
  padding: 0 0.9rem;
  line-height: 56px;
  cursor: default;
  display: inline-block;
  transition: color 0.15s;
}
.dl-nav-group:hover > .dl-nav-group-label { color: white; }
.dl-nav-dropdown {
  position: absolute;
  top: 56px;
  left: 0;
  background: #0a3945;
  border: 1px solid #1b4a57;
  border-radius: 6px;
  padding: 0.4rem 0;
  min-width: 280px;
  max-height: min(60vh, 520px);
  overflow-y: auto;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.15s;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0,20,27,0.35);
}
.dl-nav-group:hover .dl-nav-dropdown {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}
.dl-nav-dropdown a {
  display: block;
  padding: 0.45rem 1rem;
  font-size: 0.82rem;
  line-height: 1.4;
  color: #8fb8c4;
  text-decoration: none;
}
.dl-nav-dropdown a:hover { color: white; background: rgba(255,255,255,0.05); }
.dl-nav-dropdown a.active {
  color: white;
  border-left: 2px solid #008c82;
  padding-left: calc(1rem - 2px);
}

.dl-footer {
  background: #002733;
  color: #8fb8c4;
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
.dl-footer-logo img { width: 26px; height: 26px; display: block; }
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
  color: #8fb8c4;
  text-decoration: none;
  display: block;
  padding: 0.2rem 0;
}
.dl-footer-col li a:hover { color: white; }
.dl-footer-bottom {
  grid-column: 1 / -1;
  border-top: 1px solid #0a3945;
  margin-top: 2rem;
  padding-top: 1.5rem;
  font-size: 0.75rem;
  color: #5a7a86;
  text-align: center;
}

@media (max-width: 960px) {
  .dl-nav { padding: 0 1rem; gap: 1rem; overflow-x: auto; }
  .dl-footer { grid-template-columns: 1fr 1fr; }
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
    ${LOGO_IMG}
    <span class="dl-nav-logo-text">DieLogic</span>
  </a>
  <ul class="dl-nav-links">
    ${buildNavLinks()}
  </ul>
  <div class="dl-nav-cta">
    <a href="${resolveHref('/app/index.html')}">Dashboard öffnen</a>
  </div>
</nav>`;

    const mount = document.getElementById('nav-mount');
    if (mount) {
      mount.innerHTML = navHTML;
    } else {
      document.body.insertAdjacentHTML('afterbegin', navHTML);
    }
  }

  function injectFooter() {
    document.body.insertAdjacentHTML('beforeend', buildFooter());
  }

  function init() {
    injectStyles();
    injectNav();
    if (wantFooter) injectFooter();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
