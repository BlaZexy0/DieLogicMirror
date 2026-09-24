/* Die Hilfe: eine Lade, die von rechts über den Viewport kommt — je
   Werkzeug ein HTML-Stück mit Abschnitten, die Anker tragen
   (data-help-anchor). ⓘ-Knöpfe in der Seitenleiste öffnen sie an der
   Stelle; „?" in der Kopfzeile ganz oben. Was hier steht, stand vorher
   als Textwand in der Seitenleiste.

   Trägt eine Seite mehrere Werkzeuge (die Werkbank), steht jedes in einem
   Abschnitt mit data-help-owner: ein Anker wird dann zuerst in dem des
   Werkzeugs gesucht, dem das ⓘ gehört — „zellkante" gibt es mehrmals. */

export function mountHelp({ drawer, body, closeBtn, html }) {
  body.innerHTML = html || '<p>Für dieses Werkzeug gibt es noch keine Hilfe.</p>';
  const scopeOf = owner => (owner && body.querySelector('[data-help-owner="' + owner + '"]')) || null;
  const api = {
    get open() { return !drawer.hidden; },
    show(anchor, owner = null) {
      drawer.hidden = false;
      drawer.classList.add('open');
      const scope = scopeOf(owner);
      const el = anchor
        ? (scope && scope.querySelector('[data-help-anchor="' + anchor + '"]')) || body.querySelector('[data-help-anchor="' + anchor + '"]')
        : scope;
      if (!el) return;
      for (const h of body.querySelectorAll('.st-help-hit')) h.classList.remove('st-help-hit');
      if (anchor) el.classList.add('st-help-hit');
      if (el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    },
    hide() { drawer.hidden = true; drawer.classList.remove('open'); },
    toggle(anchor, owner) { if (drawer.hidden) api.show(anchor, owner); else api.hide(); }
  };
  closeBtn.addEventListener('click', () => api.hide());
  return api;
}
