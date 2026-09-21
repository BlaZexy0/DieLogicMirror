/* Die Aufklappmenüs der Kopfleiste mit der Maus (shared/nav.js).

   „Auslegung" und „3D-Studio" klappen vom Reiter nach links auf; der Weg
   zu „Dashboard" oder „Werkbank" läuft erst die Leiste entlang, dann
   hinunter — und eine Hand zieht nicht gerade. Zweimal ging das schief:
   mit :hover schloss das Menü, sobald der Zeiger den Reiter verließ; mit
   einem Zielkorridor, sobald er einen Pixel zu hoch lief. Hier laufen
   Zeigerwege mit Zittern, so wie eine Hand sie zieht. */

import { test, expect } from '@playwright/test';

const openMenus = page => page.evaluate(() =>
  [...document.querySelectorAll('.dl-nav-group.open > .dl-nav-group-label')].map(b => b.textContent));

async function center(locator) {
  const b = await locator.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}

/* Zeigerweg über Stützpunkte, 125 Ereignisse je Sekunde, ±1 px Zittern. */
async function stroke(page, pts, speed) {
  let seed = 11;
  const jitter = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  for (let k = 1; k < pts.length; k++) {
    const [a, b] = [pts[k - 1], pts[k]];
    const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / speed * 125));
    for (let i = 1; i <= n; i++) {
      const w = i < n ? 1 : 0;
      await page.mouse.move(a[0] + (b[0] - a[0]) * i / n + jitter() * w, a[1] + (b[1] - a[1]) * i / n + jitter() * w);
      await page.waitForTimeout(8);
    }
  }
}

const label = (page, text) => page.locator('.dl-nav-group-label', { hasText: text });
const entry = (page, text) => page.locator('.dl-nav-dropdown a', { hasText: text }).first();

for (const [menu, item] of [['Auslegung', 'Dashboard'], ['3D-Studio', 'Werkbank'], ['3D-Studio', 'Formaufbau']]) {
  test(`Kopfleiste: ${menu} → ${item} erst die Leiste entlang, dann hinunter`, async ({ page }) => {
    await page.goto('/index.html');
    const s = await center(label(page, menu));
    await page.mouse.move(s[0] + 30, s[1]);
    await page.mouse.move(...s, { steps: 4 });
    await expect.poll(() => openMenus(page)).toEqual([menu]);
    const z = await center(entry(page, item));
    /* Waagerecht bis fast über das Ziel, dabei 3 px über der Reitermitte,
       dann hinunter zum Eintrag. Der 3D-Studio-Weg kreuzt den Reiter „Auslegung". */
    await stroke(page, [s, [z[0] + 20, s[1] - 3], z], 500);
    expect(await openMenus(page)).toEqual([menu]);
    await expect(entry(page, item)).toBeVisible();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.textContent, z);
    expect(hit).toBe(item);
  });
}

/* Der Weg, der in Firefox scheiterte: gerade hinunter in die Diagramme.
   Dort liegt das verborgene 3D-Studio-Menü über dem offenen — Firefox
   traf dessen Einträge trotz visibility: hidden (Spaltenüberschrift mit
   column-span: all), und das Menü schaltete um. Chromium traf nie. */
for (const item of ['Luftblase unter Nachdruck', 'Schusskurve', 'Materialausbeute']) {
  test(`Kopfleiste: Auslegung → ${item} gerade hinunter, über dem verborgenen 3D-Studio-Menü`, async ({ page }) => {
    await page.goto('/index.html');
    const s = await center(label(page, 'Auslegung'));
    await page.mouse.move(s[0] + 30, s[1]);
    await page.mouse.move(...s, { steps: 4 });
    await expect.poll(() => openMenus(page)).toEqual(['Auslegung']);
    const z = await center(entry(page, item));
    await stroke(page, [s, [s[0], z[1]], z], 500);
    expect(await openMenus(page)).toEqual(['Auslegung']);
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('a')?.textContent, z);
    expect(hit).toBe(item);
  });
}

test('Kopfleiste: ein Reiter übernimmt sofort daneben, im Streifen erst in Ruhe; wer geht, schließt', async ({ page }) => {
  await page.goto('/index.html');
  const aus = await center(label(page, 'Auslegung'));
  const studio = await center(label(page, '3D-Studio'));
  await page.mouse.move(...aus);
  await expect.poll(() => openMenus(page)).toEqual(['Auslegung']);
  /* 3D-Studio liegt rechts neben dem Auslegungsmenü: schaltet sofort. */
  await page.mouse.move(...studio);
  expect(await openMenus(page)).toEqual(['3D-Studio']);
  /* Auslegung liegt im Streifen über dem 3D-Studio-Menü: erst in Ruhe. */
  await page.mouse.move(...aus);
  expect(await openMenus(page)).toEqual(['3D-Studio']);
  await expect.poll(() => openMenus(page), { timeout: 1000 }).toEqual(['Auslegung']);
  /* Weg von Menü und Leiste: schließt nach kurzer Frist. */
  await page.mouse.move(aus[0], 700);
  await expect.poll(() => openMenus(page), { timeout: 1000 }).toEqual([]);
});

test('Kopfleiste: Klick hält fest, zweiter Klick schließt, Escape auch', async ({ page }) => {
  await page.goto('/index.html');
  const studio = await center(label(page, '3D-Studio'));
  await page.mouse.move(...studio);
  await page.mouse.click(...studio);
  await page.mouse.move(studio[0], 700);
  await page.waitForTimeout(500);
  expect(await openMenus(page)).toEqual(['3D-Studio']);
  await page.keyboard.press('Escape');
  expect(await openMenus(page)).toEqual([]);
  await page.mouse.move(...studio);
  await page.mouse.click(...studio);
  await page.mouse.click(...studio);
  await page.mouse.move(studio[0] + 2, studio[1] + 1);
  await page.waitForTimeout(300);
  expect(await openMenus(page)).toEqual([]);
});

/* ── Farbschema (shared/schemes.js) ─────────────────────────────────
   Die Kopfleiste bringt ihre Farben als eingespritztes Stylesheet mit,
   nicht als CSS-Variablen — sie muss beim Umschalten also aktiv neu
   gebaut werden. Genau das prüft dieser Test: Ein Klick auf die Kachel
   färbt die Leiste sofort um, ohne Neuladen, und die Wahl überlebt den
   Seitenwechsel. */

const leiste = page => page.evaluate(() => ({
  scheme: document.documentElement.getAttribute('data-scheme'),
  nav: getComputedStyle(document.querySelector('.dl-nav')).backgroundColor,
  logic: getComputedStyle(document.querySelector('.dl-word-logic')).color,
  primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  palette: window.__PALETTE__.primary,
  gespeichert: localStorage.getItem('dielogic-scheme-v1')
}));

test('Farbschema: die Kachel färbt Seite und Kopfleiste sofort um', async ({ page }) => {
  await page.goto('/konto/');
  const vorher = await leiste(page);
  expect(vorher.scheme).toBe('teal');
  expect(vorher.primary).toBe('#008c82');

  await page.locator('#sch-grid label:has(input[value="kupfer"])').click();
  const nachher = await leiste(page);
  expect(nachher.scheme).toBe('kupfer');
  expect(nachher.gespeichert).toBe('kupfer');
  expect(nachher.primary).toBe('#a25325');
  expect(nachher.palette).toBe('#a25325');
  expect(nachher.nav).not.toBe(vorher.nav);      // Leiste ohne Neuladen umgefärbt
  expect(nachher.logic).not.toBe(vorher.logic);  // auch die Wortmarke

  /* Und der Hinweis nennt, was gilt. */
  await expect(page.locator('#sch-hint')).toContainText('Kupfer');

  /* Über den Seitenwechsel hinaus — auch dort, wo es kein shared.css gibt. */
  await page.goto('/tools/auslegung/');
  const dashboard = await leiste(page);
  expect(dashboard.scheme).toBe('kupfer');
  expect(dashboard.nav).toBe(nachher.nav);
  /* Die Diagramme rechnen mit denselben Farben. */
  expect(await page.evaluate(() => window.__THEME__.chart.series2)).toBe('#a25325');
});

test('Farbschema: ohne Wahl bleibt der Standard, und er lässt sich zurückwählen', async ({ page }) => {
  await page.goto('/konto/');
  await page.locator('#sch-grid label:has(input[value="kontrast"])').click();
  expect((await leiste(page)).scheme).toBe('kontrast');
  await page.locator('#sch-grid label:has(input[value="teal"])').click();
  const zurück = await leiste(page);
  expect(zurück.scheme).toBe('teal');
  expect(zurück.primary).toBe('#008c82');
  expect(zurück.nav).toBe('rgb(0, 39, 51)');
  /* Der Standard schreibt keine Diagrammfarben um. */
  await page.goto('/theorie/pq2.html');
  expect(await page.evaluate(() => window.__THEME__.chart.event)).toBe('#9aacb2');
});
