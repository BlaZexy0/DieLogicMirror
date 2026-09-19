/* Browser-Tests des 3D-Studios mit Playwright.

   Die Node-Tests ersetzen DOM und Renderer durch Platzhalter; was sie
   nicht sehen, ist der echte Browser: WebGL, Zeigerereignisse mit
   Fang, Ereignisreihenfolge, Layout. Diese Tests laden jede Seite des
   Studios in einem kopflosen Chromium und prüfen, dass sie ohne Fehler
   hochkommt und antwortet.

   Ein Bauteil auf dem Rechner ohne GPU: Chromium zeichnet WebGL über
   SwiftShader nur mit den Flaggen unten — ohne sie bleibt die Leinwand
   still leer, während alle Werte stimmen.

     npm run browser                 alle
     npx playwright test --config tests/browser/playwright.config.mjs -g Anguss */

import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/* Der Webserver läuft aus der Repo-Wurzel, nicht aus tests/browser — sonst
   findet http.server kein web/. */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  outputDir: '.results',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:8130',
    viewport: { width: 1400, height: 900 },
    launchOptions: {
      args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox']
    }
  },
  /* Die Kopfleiste zusätzlich in Firefox: der trifft die Einträge eines
     unsichtbaren Menüs beim Zeigertest, Chromium nicht — ein Fehler, den
     nur Chromium-Tests zweimal durchgelassen haben. Braucht einmal
     `npx playwright install firefox`. */
  /* … und die UX-Regeln des Studio-Rahmens ebenfalls: Firefox setzt die
     Systemschrift breiter als Chromium, abgeschnittene Reiter und Schalter
     zeigten sich nur dort. */
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'firefox-nav', testMatch: /nav\.spec\.mjs/, use: { browserName: 'firefox', launchOptions: {} } },
    { name: 'firefox-ux', testMatch: /ux\.spec\.mjs/, use: { browserName: 'firefox', launchOptions: {} } }
  ],
  webServer: {
    command: 'python3 -m http.server 8130 --bind 127.0.0.1 --directory web',
    cwd: ROOT,
    url: 'http://127.0.0.1:8130/tools/3d-studio/',
    reuseExistingServer: true,
    timeout: 20_000
  }
});
