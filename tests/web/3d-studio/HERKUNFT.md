# Tests des 3D-Studios — Herkunft

**Erzeugt** aus `form3d/tests/` (siehe `web/tools/3d-studio/HERKUNFT.md`).
Neu einspielen: `cd ../form3d && node tools/integrate.mjs`.
Angepasst wurden nur die Pfade zum Werkzeugordner.

Ausgeführt werden sie in CI zusammen mit den übrigen Frontend-Tests:

    node --import ./tests/web/3d-studio/stubs/register.mjs \
         --test tests/web/*.test.mjs tests/web/3d-studio/*.test.mjs

Der `--import`-Hook löst nur den nackten Namen `three` und den
GLTFLoader auf; die übrigen Tests merken davon nichts.
