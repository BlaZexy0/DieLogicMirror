/* Die Hilfe: eine Lade, die von rechts über den Viewport kommt — je
   Werkzeug ein HTML-Stück mit Abschnitten, die Anker tragen
   (data-help-anchor). ⓘ-Knöpfe in der Seitenleiste öffnen sie an der
   Stelle; „?" in der Kopfzeile ganz oben. Was hier steht, stand vorher
   als Textwand in der Seitenleiste. */

export function mountHelp({ drawer, body, closeBtn, html }) {
  body.innerHTML = html || '<p>Für dieses Werkzeug gibt es noch keine Hilfe.</p>';
  const api = {
    get open() { return !drawer.hidden; },
    show(anchor) {
      drawer.hidden = false;
      drawer.classList.add('open');
      if (anchor) {
        const el = body.querySelector('[data-help-anchor="' + anchor + '"]');
        if (el) {
          for (const h of body.querySelectorAll('.st-help-hit')) h.classList.remove('st-help-hit');
          el.classList.add('st-help-hit');
          if (el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }
      }
    },
    hide() { drawer.hidden = true; drawer.classList.remove('open'); },
    toggle(anchor) { if (drawer.hidden) api.show(anchor); else api.hide(); }
  };
  closeBtn.addEventListener('click', () => api.hide());
  return api;
}
