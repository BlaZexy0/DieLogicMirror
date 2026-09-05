/* Jede Seite des 3D-Studios kommt im echten Browser hoch: Leinwand da,
   Achsenkreuz da, kein Fehler in der Konsole — und die beiden
   Entwurfsseiten melden sich bereit. Mehr prüfen die Node-Tests; hier
   zählt, was nur der Browser weiß. */

import { test, expect } from '@playwright/test';

const PAGES = [
  ['form.html', null],
  ['bauteilanalyse.html', () => window.__form3d?.state?.model],
  ['wandstaerke.html', () => window.__form3d?.state?.ready],
  ['abstand.html', null],
  ['anguss.html', () => window.__anguss?.state?.ready],
  ['ueberlauf.html', () => window.__ueberlauf?.state?.ready],
  ['temperier.html', () => window.__temperier?.state?.ready],
  ['fuellung.html', () => window.__fuellung?.state?.ready]
];

for (const [page, readyFn] of PAGES) {
  test('3D-Studio: ' + page + ' kommt fehlerfrei hoch', async ({ page: p }) => {
    const errors = [];
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    /* Die Kopfleiste fragt das Backend nach dem Konto (/api/auth/me); vom
       statischen Testserver bekommt sie 404 — das ist hier kein Fehler. */
    p.on('console', m => {
      if (m.type() !== 'error') return;
      if (/\/api\//.test(m.location().url || '')) return;
      errors.push('console: ' + m.text() + ' @ ' + (m.location().url || ''));
    });
    await p.goto('/tools/3d-studio/' + page);
    await expect(p.locator('#viewport canvas')).toBeVisible();
    await expect(p.locator('.axis-gizmo')).toHaveCount(1);
    if (readyFn) await p.waitForFunction(readyFn, null, { timeout: 60_000 });
    /* Ein paar Bilder zeichnen lassen, damit Fehler aus der Schleife noch ankommen. */
    await p.waitForTimeout(800);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('Angussdesigner: der Pfeil eines Anschnitts schaltet den Zielmodus scharf', async ({ page }) => {
  await page.goto('/tools/3d-studio/anguss.html?demo=zwei');
  await page.waitForFunction(() => window.__anguss?.state?.ready);
  /* Ohne Bauteil sagt der Klick, was fehlt. */
  const gate = await page.evaluate(() => Object.values(window.__anguss.state.graph.nodes).find(n => n.type === 'gate').id);
  await page.evaluate(id => window.__anguss.startAim(id), gate);
  await expect(page.locator('#aim-banner')).toBeVisible();
  await expect(page.locator('#aim-text')).toContainText('Referenzbauteil laden');
});

test('Überlaufdesigner: eine Bohne landet auf der Wand', async ({ page }) => {
  await page.goto('/tools/3d-studio/ueberlauf.html');
  await page.waitForFunction(() => window.__ueberlauf?.state?.ready, null, { timeout: 60_000 });
  /* Kamera von +X waagerecht auf die Bauteilmitte, dann Art wählen und in die Bildmitte klicken. */
  await page.evaluate(() => {
    const v = window.__ueberlauf; const b = v.state.model.bounds;
    const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    v.view.controls.target.set(c[0], c[1], c[2]);
    v.view.camera.position.set(b.max[0] + 400, c[1], c[2]);
    v.view.camera.up.set(0, 1, 0);
    v.view.invalidate();
  });
  await page.waitForTimeout(300);
  await page.click('#add-bohne');
  await expect(page.locator('#aim-banner')).toBeVisible();
  const box = await page.locator('#viewport canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => Object.keys(window.__ueberlauf.state.plan.items).length)).toBe(1);
  const it = await page.evaluate(() => Object.values(window.__ueberlauf.state.plan.items)[0]);
  expect(it.type).toBe('bohne');
  expect(it.dir[0]).toBeGreaterThan(0.9);
  await expect(page.locator('#plan-facts')).toContainText('Gesamt');
});
