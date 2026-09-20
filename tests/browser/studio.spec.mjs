/* Jede Seite des 3D-Studios kommt im echten Browser hoch: Leinwand da,
   Achsenkreuz da, kein Fehler in der Konsole — und die beiden
   Entwurfsseiten melden sich bereit. Mehr prüfen die Node-Tests; hier
   zählt, was nur der Browser weiß. */

import { test, expect } from '@playwright/test';

const PAGES = [
  ['form.html', null],
  ['entformungsanalyse.html', () => window.__form3d?.state?.model],
  ['wandstaerke.html', () => window.__form3d?.state?.ready],
  ['abstand.html', null],
  ['anguss.html', () => window.__anguss?.state?.ready],
  ['ueberlauf.html', () => window.__ueberlauf?.state?.ready],
  ['temperier.html', () => window.__temperier?.state?.ready],
  ['fuellung.html', () => window.__fuellung?.state?.ready],
  ['angussfuellung.html', () => window.__angussfuellung?.state?.ready],
  ['kammerfuellung.html', () => window.__kammerfuellung?.state?.ready],
  /* Die früheren Partikelseiten leiten weiter — auf dasselbe Werkzeug, mit „Partikel" gewählt. */
  ['angussfuellung-sph.html', () => window.__angussfuellung?.state?.ready && window.__angussfuellung.state.engine === 'sph'],
  ['kammerfuellung-sph.html', () => window.__kammerfuellung?.state?.ready && window.__kammerfuellung.state.engine === 'sph'],
  ['werkbank.html', () => window.__werkbank?.ctx?.ready]
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

/* Das Metamodell rechnet nur im Browser: 12 MB ONNX und onnxruntime-web
   (WebAssembly) — die Node-Tests prüfen nur seine Wahl und seine Grenzen. */
test('Kammerfüllung: das Metamodell rechnet die Welle in Sekunden — Bild, Zeiten und Luft', async ({ page }) => {
  await page.goto('/tools/3d-studio/kammerfuellung.html');
  await page.waitForFunction(() => window.__kammerfuellung?.state?.ready);
  await page.click('[role="tab"][data-mode="simulation"]');
  await page.click('[data-ui="engine-seg"] button[data-value="meta"]');
  /* Das Gitter des Modells steht — kein Feld für die Auflösung. */
  await expect(page.locator('[data-ui="cell-row"]')).toBeHidden();
  await expect(page.locator('[data-ui="estimate"]')).toContainText('WebAssembly');
  await page.click('[data-ui="primary"]');
  await page.waitForFunction(() => !window.__kammerfuellung.state.running, null, { timeout: 120_000 });

  const r = await page.evaluate(() => {
    const v = window.__kammerfuellung, s = v.state, res = s.results.meta;
    return {
      failed: s.failed,
      frames: res && res.snapshots.length,
      fullMs: res && res.full && res.full.t * 1000,
      curveMs: s.curve.tFull * 1000,
      air: res && res.airMax.air,
      vScale: res && res.vScale,
      verts: v.core.displays.meta.object.geometry.getAttribute('position').count
    };
  });
  expect(r.failed).toBe('');
  expect(r.frames).toBe(101);
  /* „Kammer voll" trifft die Kurve auf ein Viertel genau, die Fläche steht im Bild. */
  expect(r.fullMs).toBeGreaterThan(0.6 * r.curveMs);
  expect(r.fullMs).toBeLessThan(1.2 * r.curveMs);
  expect(r.air).toBeGreaterThanOrEqual(0);
  expect(r.vScale).toBeGreaterThan(0.2);
  expect(r.verts).toBeGreaterThan(500);

  /* Knopf und Zeitregler gehören keinem Reiter: beides steht auch unter „Kammer". */
  await page.click('[role="tab"][data-mode="kammer"]');
  await expect(page.locator('[data-ui="primary"]')).toHaveText('Simulieren');
  await expect(page.locator('[data-ui="time-row"]')).toBeVisible();
  await page.locator('[data-ui="t-slider"]').fill('0');
  await page.locator('[data-ui="t-slider"]').dispatchEvent('input');
  /* Zeit, Kolbenweg, Kolbengeschwindigkeit und Luft stehen IM Bild. */
  await expect(page.locator('#status')).toContainText('Kolben 0 mm');
  await expect(page.locator('#status')).toContainText('m/s');
  /* ▶ spielt ab, auch hier — und ein zweiter Klick hält an. */
  await page.click('[data-ui="play"]');
  await expect.poll(() => page.evaluate(() => window.__kammerfuellung.state.frame), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.click('[data-ui="play"]');
  const halt = await page.evaluate(() => window.__kammerfuellung.state.frame);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__kammerfuellung.state.frame)).toBe(halt);
});

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
    const v = window.__ueberlauf; const b = v.host.part.model.bounds;
    const c = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
    v.view.controls.target.set(c[0], c[1], c[2]);
    v.view.camera.position.set(b.max[0] + 400, c[1], c[2]);
    v.view.camera.up.set(0, 1, 0);
    v.view.invalidate();
  });
  await page.waitForTimeout(300);
  await page.click('[data-chip="bohne"]');
  await expect(page.locator('#aim-banner')).toBeVisible();
  const box = await page.locator('#viewport canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => Object.keys(window.__ueberlauf.state.plan.items).length)).toBe(1);
  const it = await page.evaluate(() => Object.values(window.__ueberlauf.state.plan.items)[0]);
  expect(it.type).toBe('bohne');
  expect(it.dir[0]).toBeGreaterThan(0.9);
  /* Gewählt ist sie auch: das Auswahlfeld steht neben dem Bild, der Reiter zählt mit. */
  await expect(page.locator('[data-ui="inspector"]')).toBeVisible();
  await expect(page.locator('[data-badge="elemente"]')).toHaveText('1');
  await page.click('[role="tab"][data-mode="volumen"]');
  await expect(page.locator('[data-ui="plan-kpis"]')).toContainText('Gesamt');
});

test('Werkbank: alle sechs Schritte kommen ohne Fehler hoch und hängen zusammen', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error' || /\/api\//.test(m.location().url || '')) return;
    errors.push('console: ' + m.text() + ' @ ' + (m.location().url || ''));
  });
  await page.goto('/tools/3d-studio/werkbank.html');
  await page.waitForFunction(() => window.__werkbank?.ctx?.ready, null, { timeout: 60_000 });
  /* Anguss: der Vorschlag hat zwei Anschnitte an der Wand. */
  await page.click('[data-stage="anguss"]');
  await expect(page.locator('#an-menu')).toBeVisible();
  const gates = await page.evaluate(() => Object.values(window.__werkbank.stages.anguss.state.graph.nodes).filter(n => n.type === 'gate' && n.aim).length);
  expect(gates).toBe(2);
  /* Füllung: rechnet auf dem gemeinsamen Feld mit genau diesen Anschnitten. */
  await page.click('[data-stage="fuellung"]');
  await page.waitForFunction(() => { const s = window.__werkbank.stages.fuellung.state; return s.result && !s.stale && !s.computing; }, null, { timeout: 90_000 });
  expect(await page.evaluate(() => Object.keys(window.__werkbank.stages.fuellung.state.plan.items).length)).toBe(2);
  await expect(page.locator('#colorbar')).toHaveClass(/on/);
  /* Überläufe und Temperierung: Auswahlfelder da, Abstandsfläche aus demselben Feld. */
  await page.click('[data-stage="ueberlauf"]');
  await expect(page.locator('#ue-menu')).toBeVisible();
  await page.click('[data-stage="temperier"]');
  await page.waitForFunction(() => { const s = window.__werkbank.stages.temperier.state; return s.shellDist === 20 && !s.computing; }, null, { timeout: 90_000 });
  await expect(page.locator('#te-add-stich')).toBeEnabled();
  /* Auslegung: das Dashboard liegt über dem Viewport, die Übernahme hat Werte. */
  await page.click('[data-stage="auslegung"]');
  await expect(page.locator('#au-dash')).toBeVisible();
  await expect(page.locator('#charts .card')).not.toHaveCount(0);
  await expect(page.locator('#checkbar')).toContainText('Prüfungen');
  const vals = await page.evaluate(() => window.__werkbank.stages.auslegung.measure());
  expect(vals.part).toBeGreaterThan(3);
  expect(vals.gate).toBeGreaterThan(100);
  expect(vals.area).toBeGreaterThan(0.1);
  await page.waitForTimeout(500);
  expect(errors, errors.join('\n')).toEqual([]);
});
