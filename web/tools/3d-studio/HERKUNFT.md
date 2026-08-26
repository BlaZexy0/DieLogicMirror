# 3D-Studio — Herkunft

Dieser Ordner ist **erzeugt**. Quelle ist das eigenständige Projekt
`form3d` neben dem DieLogic-Repo (bewusst kein Git-Repo). Neu einspielen:

    cd ../form3d && node tools/integrate.mjs

Von Hand hier zu ändern lohnt nicht — der nächste Lauf überschreibt es.
Änderungen gehören nach `form3d/`, danach das Skript laufen lassen.

Unterschiede zum eigenständigen Stand (und nur diese):

- `css/tokens.css` entfällt; die Farb-Tokens kommen aus `/shared/shared.css`.
- Die Kopfleiste kommt aus `/shared/nav.js`; `js/ui/nav.js` hält sich
  von selbst heraus, sobald es `window.__PALETTE__` sieht.
- Die Übersichtsseite bekommt `page-hero` statt des Landingpage-Kopfes
  und die Site-Fußzeile statt der eigenen.
- `tools/` (GLB-Export, Integration) bleibt drüben.

Die Modelle unter `assets/` sind fertiges binäres glTF; sie werden
drüben mit `node tools/build-glb.mjs` und `node tools/build-parts.mjs`
erzeugt.
