/* ESLint für DieLogic — Fehler finden, die der Syntaxcheck nicht sieht.

   Zwei Sorten JavaScript liegen im Repo: ES-Module (das 3D-Studio, die
   Werkzeugseiten, die Tests) und klassische Skripte, die sich über
   window-Globale unterhalten (web/shared, Sprengfläche, Teilekosten,
   Zyklus). Für Module gilt no-undef streng — genau das hätte den Aufruf
   einer beim Umbau gelöschten Funktion sofort gemeldet, den die
   Node-Tests nicht erreichten. Bei den klassischen Skripten kennt ESLint
   die Globale der Nachbardateien nicht; dort bleibt no-undef aus, der
   Rest der Empfehlungen gilt.

     npm run lint            alles
     npx eslint web/tools/3d-studio/js   einen Teil */

import js from '@eslint/js';
import globals from 'globals';

const CLASSIC = [
  'web/shared/*.js', 'web/shared/examples/*.js',
  'web/tools/sprengflaeche/*.js', 'web/tools/teilekosten/*.js', 'web/tools/zyklus/*.js'
];

const rules = {
  ...js.configs.recommended.rules,
  /* Ungenutzte Parameter sind in Rückrufen (renderer, scene, camera) Alltag. */
  'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
  /* Leere catch-Blöcke sind hier immer kommentiert und gewollt. */
  'no-empty': ['error', { allowEmptyCatch: true }],
  /* Fehler werden hier mit eigenen, deutschen Meldungen neu geworfen; der
     Auslöser steht in der Meldung, nicht in `cause`. */
  'preserve-caught-error': 'off'
};

export default [
  {
    ignores: [
      'node_modules/**', '.venv/**', 'build/**', 'data/**',
      'web/**/vendor/**', 'tests/browser/.results/**', 'tests/browser/report/**'
    ]
  },
  {
    files: ['web/**/*.js'],
    ignores: CLASSIC,
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser } },
    rules
  },
  {
    files: CLASSIC,
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser } },
    rules: { ...rules, 'no-undef': 'off' }
  },
  {
    files: ['tests/**/*.mjs', 'tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules
  }
];
