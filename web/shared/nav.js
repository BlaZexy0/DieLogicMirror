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
    ['filltime',  'Füllzeit ab Anschnitt'],
    ['ftwall',    'Empfohlene Füllzeit'],
    ['vent',      'Entlüftungsgeschwindigkeit'],
    ['ventreq',   'Entlüftungsbedarf'],
    ['area',      'Zulässige Sprengfläche'],
    ['machine',   'Erforderliche Maschinengröße'],
    ['pspec',     'Spezifischer Gießdruck'],
    ['yield',     'Materialausbeute'],
  ];

  const NAV_LINKS = [
    { label: 'Dashboard', href: '/tools/auslegung/' },
    { label: 'Diagramme', children: CHARTS.map(([id, title]) => (
      { label: title, href: '/tools/auslegung/chart.html?id=' + id }
    )) },
    { label: 'Sprengflächenanalyse', href: '/tools/sprengflaeche/' },
    { label: 'Teilekosten', href: '/tools/teilekosten/' },
    { label: 'Zyklusanalyse', href: '/tools/zyklus/' },
    { label: 'Theorie', children: [
      { label: 'Das PQ²-Diagramm', href: '/theorie/pq2.html' },
      { label: 'Kritische Kolbengeschwindigkeit', href: '/theorie/kritische-geschwindigkeit.html' },
      { label: 'Kreissegmente der Füllkammer', href: '/theorie/kreissegmente.html' },
      { label: 'Nebenbedingungen der Auslegung', href: '/theorie/nebenbedingungen.html' },
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
        <button type="button" class="dl-nav-group-label" aria-haspopup="true" aria-expanded="false">${item.label}</button>
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
    <p class="dl-footer-desc">Gießtechnische Auslegung für den Druckguss (HPDC): Schusskurve, PQ², Füllkammer, Zyklus und Teilekosten — ein Projekt, alle Werkzeuge.</p>
    <p class="dl-footer-desc" style="margin-top:1rem;color:${C.ondark2};">© 2026 DieLogic</p>
  </div>

  <div class="dl-footer-col">
    <h4>Werkzeuge</h4>
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
    <h4>Wissen</h4>
    <ul>
      <li><a href="${r('/index.html#diagramme')}">Alle 19 Diagramme</a></li>
      <li><a href="${r('/theorie/pq2.html')}">Theorie: PQ²-Diagramm</a></li>
      <li><a href="${r('/theorie/kritische-geschwindigkeit.html')}">Theorie: Kritische Geschwindigkeit</a></li>
      <li><a href="${r('/theorie/kreissegmente.html')}">Theorie: Kreissegmente der Füllkammer</a></li>
      <li><a href="${r('/theorie/nebenbedingungen.html')}">Theorie: Nebenbedingungen der Auslegung</a></li>
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
.dl-nav-logo img { width: 32px; height: 32px; display: block; }
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
.dl-nav-group:focus-within > .dl-nav-group-label { color: white; }
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
  opacity: 0;
  visibility: hidden;
  transform: translateY(-4px);
  transition: all 0.15s;
  z-index: 200;
  box-shadow: 0 8px 24px rgba(0,20,27,.35);
}
/* Aufklappen bei Maus-Hover, per Klick/Touch (.open) und bei
   Tastatur-Fokus im Menü (:focus-within). */
.dl-nav-group:hover .dl-nav-dropdown,
.dl-nav-group.open .dl-nav-dropdown,
.dl-nav-group:focus-within .dl-nav-dropdown {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
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
    <span class="dl-nav-version">${VERSION}</span>
  </a>
  <ul class="dl-nav-links">
    ${buildNavLinks()}
  </ul>
  <div class="dl-nav-cta">
    <a href="${resolveHref('/konto/')}" id="dl-nav-account">Anmelden</a>
  </div>
</nav>`;

    const mount = document.getElementById('nav-mount');
    if (mount) {
      mount.innerHTML = navHTML;
    } else {
      document.body.insertAdjacentHTML('afterbegin', navHTML);
    }
    wireDropdowns();
  }

  /* Aufklapp-Menüs klickbar (Touch) und per Tastatur nutzbar machen —
     :hover allein erreicht weder Touch-Geräte noch Tab-Fokus. */
  function wireDropdowns() {
    const groups = Array.from(document.querySelectorAll('.dl-nav .dl-nav-group'));
    const closeAll = (except) => groups.forEach(g => {
      if (g !== except) {
        g.classList.remove('open');
        g.querySelector('.dl-nav-group-label').setAttribute('aria-expanded', 'false');
      }
    });
    groups.forEach(g => {
      const btn = g.querySelector('.dl-nav-group-label');
      btn.addEventListener('click', () => {
        const open = g.classList.toggle('open');
        btn.setAttribute('aria-expanded', String(open));
        closeAll(g);
      });
    });
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (!(t && t.closest && t.closest('.dl-nav-group'))) closeAll(null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAll(null);
    });
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
        if (a && me && me.user) a.textContent = '👤 ' + (me.user.name || me.user.email);
        a.title = 'Projekte & Konto';
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
