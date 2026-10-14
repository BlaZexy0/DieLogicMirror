/**
 * DieLogic – nav.js
 * Injiziert Site-Navigation und Footer. Ihre Styles liegen in
 * shared/shared.css (Abschnitt „Navigation"), nicht mehr in diesem Skript:
 * die Farben sind dort CSS-Variablen aus shared/palette.js, ein
 * Farbschemawechsel (shared/schemes.js) schreibt sie um, ohne dass nav.js
 * etwas neu bauen muss.
 * Pfade sind root-absolut (/tools/…) und brauchen darum http(s), nicht
 * file://.
 *
 * Einbindung von der Startseite:
 *   <script src="/shared/nav.js"></script>
 *
 * Einbindung ohne Footer (die Werkzeugseiten):
 *   <script src="/shared/nav.js" data-footer="none"></script>
 *
 * Schmale Fenster (Tablet, Handy): passen die Links nicht mehr neben Logo
 * und „Anmelden", schaltet nav.js die Leiste auf ein Burger-Menü um. Die
 * Grenze wird gemessen (Naturbreite der Links), nicht als Breakpoint
 * gepflegt — sonst schiebt der nächste neue Nav-Reiter den Anmelde-Knopf
 * wieder aus dem Bild.
 */

(function () {
  /* Version: shared/version.js, vor nav.js geladen. */
  const VERSION = 'v' + (window.__DL_VERSION__ || '?');

  /* ── Eine Anfrage für /api/auth/me, für die ganze Seite ──────
     Sonst fragen orgpresets.js, projectbar.js und (auf /konto/) die Seite
     selbst je einzeln — bis zu dreimal derselbe Request. nav.js lädt auf
     jeder Seite zuerst (im <head>) und legt das Ergebnis hier ab, noch vor
     DOMContentLoaded; die anderen greifen darauf zu, statt selbst zu
     fragen. Löst IMMER auf (kein reject): { status, ok, me }. status 0 =
     kein Netz/Backend erreicht (fetch warf oder file://), sonst der
     HTTP-Status; me ist der geparste Rumpf nur bei ok, sonst null. */
  function fetchAuthMe() {
    if (location.protocol === 'file:' || typeof fetch !== 'function') {
      return Promise.resolve({ status: 0, ok: false, me: null });
    }
    return fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) return { status: r.status, ok: false, me: null };
      return r.json().then(
        function (me) { return { status: r.status, ok: true, me: me }; },
        function () { return { status: r.status, ok: false, me: null }; }
      );
    }, function () { return { status: 0, ok: false, me: null }; });
  }
  const authMe = window.__DL_AUTH_ME__ = fetchAuthMe();

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
     Einzelnen (Diagramme · Einzeltools) — die 19 Diagramme und die
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
    /* Die Simulation: links das Werkzeug (wie Dashboard und Werkbank in den
       Menüs daneben), hervorgehoben — alles rechts davon sind Artikel: die
       OpenFOAM-Solver und ihre Validierung an Messungen, noch ein Entwurf
       (Seiten aus handover/website/solver/publish.py in DieLogic_OF). */
    { label: 'Simulation', columns: [
      { title: 'Werkzeug', items: [
        { label: 'Simulation einrichten', href: '/tools/simulation/', feature: true,
          desc: 'Fall für dieLogicFoam im Browser bauen: Körper, Einlass, Netz, Schusskurve — als ZIP mit Allrun und Bericht' },
        { label: 'Erstarrung einrichten', href: '/tools/erstarrung/', feature: true,
          desc: 'Fall für dieLogicSolFoam: Form, Kolben, Kühlkanäle, Legierung, Zyklen — Erstarrung, Porosität und Formtemperatur als ZIP mit Bericht' },
      ] },
      { title: 'Solver', items: [
        { label: 'Übersicht', href: '/simulation/' },
        { label: 'dieLogicFoam', href: '/simulation/dielogicfoam.html' },
        { label: 'dieLogicSolFoam', href: '/simulation/dielogicsolfoam.html' },
        { label: 'shotSleeveFoam', href: '/simulation/shotsleevefoam.html' },
        { label: 'Netzbewegung', href: '/simulation/netzbewegung.html' },
      ] },
      { title: 'Validierung', items: [
        { label: 'Methode', href: '/simulation/validierung.html' },
        { label: 'Niida und Maeda 2020', href: '/simulation/validierung-niida.html' },
        { label: 'Trometer et al. 2023', href: '/simulation/validierung-trometer.html' },
        { label: 'Zamora und López', href: '/simulation/validierung-zamora.html' },
        { label: 'Guo und Xiong 2008', href: '/simulation/validierung-guo.html' },
        { label: 'Randschale in der Kammer', href: '/simulation/validierung-randschale.html' },
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

  /* ── Einbindung ───────────────────────────────────────────── */
  const scriptEl = document.currentScript;
  const wantFooter = !(scriptEl && scriptEl.dataset.footer === 'none');

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
      target = new URL(hrefPath, window.location.href).pathname;
    } catch (e) {
      return false;
    }
    if (norm(target) !== norm(window.location.pathname)) return false;
    if (hrefQuery) return window.location.search === '?' + hrefQuery;
    return true;
  }

  /* ── Logo (assets/logo.svg — Füllkammer + Schusskurve) ────── */
  /* Wortmarke „DiehLogic": zwischen „Die" und „Logic" steht das Zeichen der
     Marke — zwei Formhälften, zur Teilung hin abgesetzt, dazwischen schießt
     die Schmelze als Pfeil durch den Spalt. Die Silhouette bleibt ein H, aber
     die Blöcke lesen sich als Werkzeug und nicht als Buchstabe im Wort
     (dasselbe Zeichen trägt die Kachel in assets/logo.svg). Es ist
     dekorativ — vorgelesen bleibt der Name „DieLogic".
     Die Farben stehen als Klasse im Stylesheet, nicht als fill-Attribut:
     wechselt das Farbschema (shared/schemes.js), wird nur das Stylesheet
     neu gesetzt — das Markup bleibt stehen und färbt sich mit. */
  const H_GLYPH = '<svg class="dl-h-glyph" viewBox="0 0 100 100" aria-hidden="true">'
    + '<path class="dl-h-form" d="M0 0 H34 V34 H22 V66 H34 V100 H0 Z"/>'
    + '<path class="dl-h-form" d="M100 0 H66 V34 H78 V66 H66 V100 H100 Z"/>'
    + '<path class="dl-h-strahl" d="M22 40 L57 40 L57 27 L80 50 L57 73 L57 60 L22 60 Z"/></svg>';
  const WORDMARK = `Die${H_GLYPH}<span class="dl-word-logic">Logic</span>`;

  /* ── Nav-Links bauen ──────────────────────────────────────── */
  const linkHtml = child => {
    const active = isActive(child.href) ? ' active' : '';
    /* ein hervorgehobener Eintrag (das Werkzeug unter „Simulation"): Name und eine Zeile, was es tut */
    if (child.feature) return `<a href="${child.href}" class="dl-nav-feature${active}"><span class="dl-nav-feature-title">${child.label}</span><span class="dl-nav-feature-desc">${child.desc || ''}</span></a>`;
    return `<a href="${child.href}" class="${active}">${child.label}</a>`;
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
      const active = isActive(item.href) ? ' class="active"' : '';
      return `<li><a href="${item.href}"${active}>${item.label}</a></li>`;
    }).join('\n      ');
  }

  /* ── Footer bauen ─────────────────────────────────────────── */
  /* Die Fußzeile baut ihre Auslegungs- und Theorie-Spalte aus denselben
     Listen wie die Kopfleiste (NAV_LINKS, CHARTS) — vorher standen Werkzeuge
     und Theorieseiten hier ein zweites bzw. drittes Mal von Hand, und die
     Titel liefen auseinander (z. B. „Kritische Geschwindigkeit" hier gegen
     „Kritische Kolbengeschwindigkeit" oben). Nur die Kartentexte ohne
     Entsprechung in NAV_LINKS (Marketing-Zeile, Rechtliches, Fußzeile
     unten) bleiben hier ausgeschrieben. */
  function buildFooter() {
    const [dashboard, ...auslegungTools] = NAV_LINKS[0].columns[0].items;
    const footerCharts = ['shotcurve', 'pq2', 'phild'].map(id => CHARTS.find(c => c[0] === id));
    const theorie = NAV_LINKS.find(g => g.label === 'Theorie').children;
    /* Die Simulation aus derselben Liste wie oben: das Werkzeug zuerst, die
       Solver-Spalte wie sie ist, die Validierung mit Vorsilbe (wie „Theorie: …"),
       die Methode als „Validierung". */
    const [simTool, simSolver, simVal] = NAV_LINKS.find(g => g.label === 'Simulation').columns;
    const simulation = [...simTool.items, ...simSolver.items,
      ...simVal.items.map((t, i) => ({ href: t.href, label: i === 0 ? 'Validierung' : 'Validierung: ' + t.label }))];
    return `<footer class="dl-footer">
  <div class="dl-footer-col">
    <div class="dl-footer-logo">
      <span class="dl-footer-wordmark">${WORDMARK}</span>
    </div>
    <p class="dl-footer-desc">Gießtechnische Auslegung für den Druckguss (HPDC): Schusskurve, PQ², Füllkammer, Zyklus und Teilekosten: ein Projekt, alle Werkzeuge.</p>
    <p class="dl-footer-desc dl-footer-copy">© 2026 DieLogic</p>
  </div>

  <div class="dl-footer-col">
    <h4>Auslegung</h4>
    <ul>
      <li><a href="${dashboard.href}">${dashboard.label}</a></li>
      ${footerCharts.map(([id, title]) => `<li><a href="/tools/auslegung/chart.html?id=${id}">${title}</a></li>`).join('\n      ')}
      ${auslegungTools.map(t => `<li><a href="${t.href}">${t.label}</a></li>`).join('\n      ')}
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>3D-Studio und Wissen</h4>
    <ul>
      <li><a href="/tools/3d-studio/">3D-Studio: alle Werkzeuge</a></li>
      <li><a href="/index.html#diagramme">Alle ${CHARTS.length} Diagramme</a></li>
      ${theorie.map(t => `<li><a href="${t.href}">Theorie: ${t.label}</a></li>`).join('\n      ')}
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>Simulation</h4>
    <ul>
      ${simulation.map(t => `<li><a href="${t.href}">${t.label}</a></li>`).join('\n      ')}
    </ul>
  </div>

  <div class="dl-footer-col">
    <h4>Rechtliches</h4>
    <ul>
      <li><a href="/recht/impressum.html">Impressum</a></li>
      <li><a href="/recht/datenschutz.html">Datenschutzerklärung</a></li>
      <li><a href="/recht/agb.html">AGB</a></li>
      <li><a href="/recht/widerruf.html">Widerrufsbelehrung</a></li>
      <li><a href="/recht/ueber-uns.html">Über uns</a></li>
      <li><a href="/recht/kontakt.html">Kontakt</a></li>
    </ul>
  </div>

  <div class="dl-footer-bottom">
    DieLogic: Auslegungsrechnung und Visualisierung im Browser. Für Gießerei-Ingenieure gebaut.
    &nbsp;·&nbsp; <a href="/recht/impressum.html">Impressum</a>
    &nbsp;·&nbsp; <a href="/recht/datenschutz.html">Datenschutz</a>
  </div>
</footer>`;
  }

  function injectNav() {
    const navHTML = `<nav class="dl-nav">
  <a class="dl-nav-logo" href="/index.html">
    <span class="dl-nav-logo-text">${WORDMARK}</span>
    <span class="dl-nav-version">${VERSION}</span>
  </a>
  <ul class="dl-nav-links" id="dl-nav-links">
    ${buildNavLinks()}
  </ul>
  <div class="dl-nav-cta">
    <a href="/konto/" id="dl-nav-account">Anmelden</a>
  </div>
  <button type="button" class="dl-nav-burger" aria-label="Menü öffnen"
          aria-expanded="false" aria-controls="dl-nav-links"><span></span></button>
</nav>`;

    document.body.insertAdjacentHTML('afterbegin', navHTML);
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

  /* Auf den Seiten unter /simulation/ (Artikel: Solver, Validierung) steht
     das passende Werkzeug links ganz oben, über dem Inhalt der Seite: bei der
     Erstarrung (dieLogicSolFoam, ihre Validierung) „Erstarrung einrichten",
     sonst „Simulation einrichten", auf der Übersicht beide. Die Seiten baut
     publish.py in DieLogic_OF und kopiert sie hierher — darum setzt nav.js
     den Kasten ein, nicht das HTML: so bleibt er, wenn die Artikel neu
     kommen. Name und Ziel aus NAV_LINKS. */
  function injectToolCta() {
    const path = window.location.pathname;
    if (!/^\/simulation\//.test(path)) return;
    const side = document.querySelector('.toc-sidebar');
    if (!side || side.querySelector('.dl-tool-cta')) return;
    const [fill, sol] = NAV_LINKS.find(g => g.label === 'Simulation').columns[0].items;
    const solPage = /dielogicsolfoam|validierung-guo|validierung-randschale/.test(path);
    const overview = /^\/simulation\/(index\.html)?$/.test(path);
    const tools = overview ? [fill, sol] : [solPage ? sol : fill];
    side.insertAdjacentHTML('afterbegin', tools.map(tool => `<a class="dl-tool-cta" href="${tool.href}">
      <span class="dl-tool-cta-kicker">Werkzeug</span>
      <span class="dl-tool-cta-title">${tool.label}</span>
      <span class="dl-tool-cta-desc">${tool.desc}</span>
      <span class="dl-tool-cta-go">Öffnen →</span>
    </a>`).join(''));
  }

  /* Angemeldet? Dann zeigt der Knopf den Namen statt „Anmelden" — nur
     hinter dem Backend (http/https); bei file:// oder statischem Hosting
     bleibt der Link zur Konto-Seite. Meldet das Ergebnis zusätzlich als
     Ereignis „dielogic:auth": die Konto-Seite braucht dieselbe Antwort für
     ihre eigene Anzeige und schrieb den Knopf bisher ein zweites Mal selbst
     — ohne recompute() danach aufzurufen (die Leiste konnte dadurch zu
     breit für „Anmelden" bleiben, statt aufs Burger-Menü umzuschalten). */
  function showAccount() {
    authMe.then(r => {
      const a = document.getElementById('dl-nav-account');
      if (a) {
        if (r.ok && r.me && r.me.user) a.textContent = '👤 ' + (r.me.user.name || r.me.user.email);
        a.title = 'Projekte & Konto';
      }
      if (recompute) recompute();
      if (typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('dielogic:auth', { detail: r }));
    });
  }

  function init() {
    injectNav();
    if (wantFooter) injectFooter();
    injectToolCta();
    showAccount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
