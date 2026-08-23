# KaTeX 0.16.11 (vendored)

Quelle: https://github.com/KaTeX/KaTeX — MIT-Lizenz (LICENSE).
Enthalten: katex.min.js, katex.min.css, contrib/auto-render.min.js (als
auto-render.min.js) und nur die woff2-Schriften (katex.min.css verweist auf
woff2 zuerst; woff/ttf braucht kein aktueller Browser).

Einbinden (Reihenfolge: Stylesheet, dann katex.min.js VOR den ES-Modulen):

    <link rel="stylesheet" href="/shared/vendor/katex/katex.min.css">
    <script defer src="/shared/vendor/katex/katex.min.js"></script>

Dashboard-Diagramme rendern ihre Formeln über tex()/eq() aus
tools/auslegung/js/charts/mathfmt.js (window.katex); statische Seiten
nutzen auto-render.min.js mit $…$ / $$…$$.

Aktualisieren: npm-Tarball laden, dieselben Dateien ersetzen.
