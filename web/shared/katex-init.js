/* DieLogic – web/shared/katex-init.js
   Ruft renderMathInElement (KaTeX auto-render) mit der einen Konfiguration
   der Website auf — vorher stand das je Seite als onload= am Script-Tag,
   in drei leicht verschiedenen Varianten (mal ohne throwOnError/strict,
   einmal ohne errorColor, dort dann im KaTeX-eigenen Rot statt der Rolle
   „schlecht").

   Einbindung (nach katex.min.js und auto-render.min.js, alle drei defer —
   sie laufen dann in dieser Reihenfolge, vor DOMContentLoaded):
     <link rel="stylesheet" href="/shared/vendor/katex/katex.min.css">
     <script defer src="/shared/vendor/katex/katex.min.js"></script>
     <script defer src="/shared/vendor/katex/auto-render.min.js"></script>
     <script defer src="/shared/katex-init.js"></script>

   $$…$$ ist eine abgesetzte Formel, $…$ eine im Fließtext (auto-render
   durchsucht dafür document.body). Ein Tippfehler in der Formel wirft
   nicht (throwOnError:false) und färbt sich in --bad-text statt KaTeX'
   eigenem Rot; strict:'ignore' lässt harmlose LaTeX-Eigenheiten durch,
   ohne die Konsole mit Warnungen zu füllen. Klassisches Script. */
(function () {
  'use strict';
  function init() {
    if (typeof renderMathInElement !== 'function') return;
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false }
      ],
      throwOnError: false,
      errorColor: 'var(--bad-text)',
      strict: 'ignore'
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
