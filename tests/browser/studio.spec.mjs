/* Jede Seite des 3D-Studios kommt im echten Browser hoch: Leinwand da,
   Achsenkreuz da, kein Fehler in der Konsole — und die Werkzeuge melden
   sich bereit. Mehr prüfen die Node-Tests; hier zählt, was nur der Browser
   weiß. */

import { test, expect } from '@playwright/test';

const PAGES = [
  ['form.html', () => window.__formaufbau?.state?.ready],
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

/* Gezeichnet wird nur auf Abruf (js/scene.js): eine ruhende Seite zeichnet
   nicht — bis zum 23.09. zeichnete ein Netz viermal je Sekunde „zur
   Sicherheit" —, und was das Bild bewegt, zeichnet. view.frames zählt die
   Bilder. Die weitergeleiteten Partikelseiten sind dieselben Werkzeuge. */
for (const [page, readyFn] of PAGES.filter(([f]) => !/-sph\.html$/.test(f))) {
  test('3D-Studio: ' + page + ' zeichnet nur auf Abruf', async ({ page: p }) => {
    await p.goto('/tools/3d-studio/' + page);
    if (readyFn) await p.waitForFunction(readyFn, null, { timeout: 60_000 });
    const hook = page === 'werkbank.html' ? '__werkbank' : '__form3d';
    await p.waitForFunction(h => window[h]?.view, hook);
    const frames = () => p.evaluate(h => window[h].view.frames, hook);
    /* Was die Seite nach dem Laden noch rechnet (Analysen, Felder, die
       Schritte der Werkbank), zeichnet danach zu Recht ein Bild. */
    const busy = () => p.evaluate(h => {
      const v = window[h], jobs = v.host && v.host.jobs;
      const states = [v.state, ...Object.values(v.stages || {}).map(st => st.state)].filter(Boolean);
      return !!(jobs && jobs.running) || states.some(s => s.running || s.computing || s.queued || s.ready === false);
    }, hook);
    /* Zur Ruhe kommen: nichts rechnet, und eine Sekunde lang kein neues Bild. */
    const ruhig = async () => {
      let last = -1;
      await expect.poll(async () => { const f = await frames(); const same = f === last && !(await busy()); last = f; return same; },
        { intervals: [1000], timeout: 90_000, message: 'die Seite kommt zur Ruhe' }).toBe(true);
    };
    await ruhig();
    /* Kein Takt mehr: ein spätes Bild (ein Ergebnis, das Layout nach dem
       Laden der Schrift) darf kommen, ein Netz, das „zur Sicherheit"
       zeichnet, brächte in drei Sekunden ein Dutzend. */
    const f0 = await frames();
    await p.waitForTimeout(3000);
    expect(await frames() - f0, 'eine ruhende Seite zeichnet nicht').toBeLessThanOrEqual(1);

    /* Drehen zeichnet, Bild für Bild — und danach ist wieder Ruhe. */
    const box = await p.locator('#viewport canvas').boundingBox();
    const x = box.x + box.width * 0.55, y = box.y + box.height * 0.55;
    await p.mouse.move(x, y);
    await p.mouse.down();
    for (let i = 1; i <= 6; i++) await p.mouse.move(x + 8 * i, y + 4 * i);
    await p.mouse.up();
    await expect.poll(frames, { message: 'Drehen zeichnet' }).toBeGreaterThan(f0 + 1);
    await ruhig();
  });
}

/* Das Metamodell im echten Browser: 3,6 MB ONNX plus 14 MB Rechenwerk
   (onnxruntime-web, WebAssembly). Unter Node rechnen meta.test.mjs und
   tools/kammerfuellung.test.mjs dasselbe Modell; hier zählt, dass die Seite
   es lädt, rechnet und zeigt. */
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
  /* Bauteil: Entformung und Wandstärke, ihre Modi in zwei Zeilen. */
  await expect(page.locator('[data-ui="tabs"] [data-mode]')).toHaveCount(8);
  /* Die Entformung rechnet auf Knopfdruck. */
  await page.click('[data-ui="primary"]');
  await page.waitForFunction(() => window.__werkbank.stages.entformung.state.analysed, null, { timeout: 90_000 });
  /* Gröber rastern: das Feld ist hier Mittel, nicht Gegenstand. */
  await page.click('[data-ui="tabs"] [data-mode="feld"]');
  await page.fill('[data-owner="wandstaerke"] [data-ui="cell"]', '6');
  await page.press('[data-owner="wandstaerke"] [data-ui="cell"]', 'Enter');
  /* Anguss: der Vorschlag hat zwei Anschnitte an der Wand; die Chips des Angussdesigners stehen im Bild. */
  await page.click('[data-stage="anguss"]');
  await expect(page.locator('[data-chip="add-point"]')).toBeVisible();
  /* Der Vorschlag steht im Modus System: vier Reiter in EINER Zeile. */
  await expect(page.locator('[data-ui="tabs"] [data-mode]')).toHaveCount(4);
  const zeilen = await page.$$eval('[data-ui="tabs"] [data-mode]', els => new Set(els.map(e => Math.round(e.getBoundingClientRect().top))).size);
  expect(zeilen).toBe(1);
  await expect(page.locator('[data-ui="primary"]')).toHaveText('Anguss ans Bauteil legen');
  const gates = await page.evaluate(() => Object.values(window.__werkbank.stages.anguss.state.graph.nodes).filter(n => n.type === 'gate' && n.aim).length);
  expect(gates).toBe(2);
  /* Füllung: rechnet beim Betreten, auf dem gemeinsamen Feld, mit genau diesen Anschnitten. */
  await page.click('[data-stage="fuellung"]');
  await page.waitForFunction(() => { const s = window.__werkbank.stages.fuellung.state; return s.result && !s.stale && !s.running; }, null, { timeout: 90_000 });
  expect(await page.evaluate(() => Object.keys(window.__werkbank.stages.fuellung.state.plan.items).length)).toBe(2);
  await page.click('[data-owner="fuellung"] [data-ui="show-seg"] button[data-value="farbe"]');
  await expect(page.locator('#colorbar')).toHaveClass(/on/);
  await expect(page.locator('#colorbar')).toContainText('ab Kammer voll');
  /* Überläufe und Temperierung: ihre Chips, die Abstandsfläche aus demselben Feld. */
  await page.click('[data-stage="ueberlauf"]');
  await expect(page.locator('[data-chip="bohne"]')).toBeVisible();
  await page.click('[data-stage="temperier"]');
  await page.waitForFunction(() => { const s = window.__werkbank.stages.temperier.state; return s.shellDist === 20 && !s.running; }, null, { timeout: 90_000 });
  await expect(page.locator('[data-chip="stich"]')).not.toHaveClass(/off/);
  expect(await page.evaluate(() => window.__werkbank.stages.temperier.state.field === window.__werkbank.field.data)).toBe(true);
  /* Auslegung: das Dashboard liegt über dem Viewport, die Übernahme hat Werte. */
  await page.click('[data-stage="auslegung"]');
  await expect(page.locator('[data-ui="au-dash"]')).toBeVisible();
  await expect(page.locator('#charts .card')).not.toHaveCount(0);
  await expect(page.locator('#checkbar')).toContainText('Prüfungen');
  const vals = await page.evaluate(() => window.__werkbank.stages.auslegung.measure());
  expect(vals.part).toBeGreaterThan(3);
  expect(vals.gate).toBeGreaterThan(100);
  expect(vals.area).toBeGreaterThan(0.1);
  /* Zurück zum Bauteil: das Dashboard geht, der Schritt steht, wie man ihn verließ. */
  await page.click('[data-stage="bauteil"]');
  await expect(page.locator('[data-ui="au-dash"]')).toBeHidden();
  await expect(page.locator('[data-ui="tabs"] [data-mode="feld"]')).toHaveClass(/active/);
  await page.waitForTimeout(500);
  expect(errors, errors.join('\n')).toEqual([]);
});

/* Simulation einrichten (/tools/simulation/): das Beispiel mit allen Körpern,
   der Ablaufplan sperrt, der Einlass kommt als Vorschlag, ein Klick ins Bild
   auf den Pressrest trifft eine Fläche, und der Fall entsteht im Worker. */
test('Simulation einrichten: Beispiel, Ablaufplan, Fall im Worker', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error' || /\/api\//.test(m.location().url || '')) return;
    errors.push('console: ' + m.text() + ' @ ' + (m.location().url || ''));
  });
  await page.goto('/tools/simulation/');
  await page.waitForFunction(() => window.__simulation?.state.ready && window.__simulation.plan.bodies.length === 4, null, { timeout: 60_000 });
  await expect(page.locator('[data-stage="fall"]')).toHaveClass(/locked/);
  /* Einlass: beim ersten Besuch gilt der Vorschlag (getönt, mit Haken);
     darunter die Gießkammer mit dem Vorschlag für die Kammerlänge */
  await page.click('[data-stage="einlass"]');
  await expect(page.locator('[data-ui="inlet-sugg"]')).toHaveClass(/\bon\b/);
  await expect(page.locator('[data-ui="inlet-card"]')).toContainText('Richtung');
  await expect(page.locator('[data-ui="pick"]:visible')).toHaveText('Andere Fläche wählen');
  await expect(page.locator('[data-ui="primary"]')).toHaveText('Weiter: Auslässe');
  await page.click('[data-ui="p-chamber"] [data-value="1"]');
  await page.click('[data-ui="length-sugg"] [data-act="apply"]');
  await expect(page.locator('[data-ui="length-sugg"]')).toHaveClass(/\bon\b/);
  /* die Länge für die Mitte des Zielbands (40–60 %): 50 % Füllgrad */
  await expect(page.locator('[data-ui="chamber-kpis"]')).toContainText(/Füllgrad\s*(49|50|51),\d %/);
  await page.click('[data-ui="primary"]');
  /* Ohne Zielmodus wählt ein Tipp nichts; nach „Auslass auswählen" trifft ein
     echter Tipp ins Bild eine Fläche: die Oberseite des Pressrests (z = 0, von
     oben sichtbar) wird Auslass, und das Wählen endet; noch einmal gewählt,
     nimmt der Tipp sie heraus. */
  const at = await page.evaluate(() => {
    const v = window.__simulation, cam = v.host.view.camera, el = v.host.view.renderer.domElement;
    v.host.view.controls.target.set(0, -280, 0);
    cam.position.set(0, -280, 600); cam.up.set(0, 1, 0); cam.lookAt(0, -280, 0); cam.updateMatrixWorld();
    v.host.view.controls.update && v.host.view.controls.update();
    const p = cam.position.clone().set(10, -275, 0).project(cam), r = el.getBoundingClientRect();
    return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height };
  });
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__simulation.plan.outlets.length)).toBe(0);
  const pick = page.locator('[data-ui="pick"]:visible');
  await pick.click();
  await expect(page.locator('#aim-banner')).not.toHaveClass(/hidden/);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => window.__simulation.plan.outlets.length)).toBe(1);
  expect(await page.evaluate(() => Math.abs(window.__simulation.plan.outlets[0].centroid[2]))).toBeLessThan(0.01);
  await expect(page.locator('#aim-banner')).toHaveClass(/hidden/);
  await expect(pick).toHaveText('Auslass auswählen');
  await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => window.__simulation.plan.outlets.length)).toBe(1);
  await pick.click();
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => page.evaluate(() => window.__simulation.plan.outlets.length)).toBe(0);
  await pick.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#aim-banner')).toHaveClass(/hidden/);
  await page.evaluate(() => {
    const v = window.__simulation, b = v.plan.bodies.find(x => x.role === 'overflow'), t = b.tris;
    for (let f = 0; f < t.length / 9; f++) { const o = f * 9; if ((t[o + 1] + t[o + 4] + t[o + 7]) / 3 > 330 && Math.abs((t[o + 2] + t[o + 5] + t[o + 8]) / 3 + 3) < 0.01) return v.tools.auslass.pickFace(b.id, f); }
    return false;
  });
  await expect(page.locator('[data-stage="fall"]')).not.toHaveClass(/locked/);
  /* Netz: die Zellgröße nach Vorschlag */
  await page.click('[data-stage="netz"]');
  await expect(page.locator('[data-ui="mesh-sugg"]')).toHaveClass(/\bon\b/);
  /* Schusskurve: die DieLogic-Kurve als Bild, mit Kammer rechnet der Fall ab Kolbenstart */
  await page.click('[data-stage="schuss"]');
  await expect(page.locator('[data-ui="p-curve"] svg.sim-curve path.v')).toBeVisible();
  await expect(page.locator('[data-ui="p-mode"] [data-value="focus"]')).toHaveClass(/active/);
  /* 2. Phase von Hand: V₂ und a₂ erscheinen, die Kurve endet bei V₂ */
  await page.click('[data-ui="p-v2mode"] [data-value="manual"]');
  await page.fill('[data-ui="p-v2"]', '3');
  await page.fill('[data-ui="p-a2"]', '1000');
  await page.locator('[data-ui="p-a2"]').press('Tab');
  await expect(page.locator('[data-ui="p-curve"] .v2l')).toHaveText('V₂ 3,00');
  /* zu kleines a₂: der Vorschlag nennt das nötige, Übernehmen erreicht V₂ */
  await page.fill('[data-ui="p-a2"]', '5');
  await page.locator('[data-ui="p-a2"]').press('Tab');
  await expect(page.locator('[data-ui="a2-sugg"]')).toBeVisible();
  await page.click('[data-ui="a2-sugg"] [data-act="apply"]');
  await expect(page.locator('[data-ui="a2-sugg"]')).toBeHidden();
  await page.click('[data-ui="p-v2mode"] [data-value="auto"]');
  await expect(page.locator('[data-ui="p-v2"]')).toBeHidden();
  await expect(page.locator('[data-ui="p-shot"]')).toContainText('ab Kolbenstart');
  /* Prozess: Schwerkraft quer zur Kammer, Temperaturen */
  await page.click('[data-stage="prozess"]');
  await expect(page.locator('[data-ui="p-gravity"]')).toBeVisible();
  await expect(page.locator('[data-ui="p-kpis"]')).toContainText('stimmig');
  /* Auswertung: der Bildrahmen im Viewport, im gewählten Seitenverhältnis */
  await page.click('[data-stage="auswertung"]');
  await expect(page.locator('.sim-frame')).toBeVisible();
  await page.click('[data-ui="post-aspect"] [data-value="1:1"]');
  const r = await page.locator('.sim-frame-box').boundingBox();
  expect(Math.abs(r.width / r.height - 1)).toBeLessThan(0.02);
  await page.click('[data-ui="post-addview"]');
  expect(await page.evaluate(() => window.__simulation.plan.post.views.some(v => v.id === 'cam1' && v.fov > 0))).toBe(true);
  await page.click('[data-stage="fall"]');
  await expect(page.locator('.sim-frame')).toBeHidden();
  const download = page.waitForEvent('download', { timeout: 120_000 });
  await page.click('[data-ui="primary"]');
  /* Ordner und ZIP nach Vorschlag: Datum von heute und Name */
  await expect(page.locator('[data-ui="case-sugg"]')).toHaveClass(/\bon\b/);
  expect((await download).suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}_Gusstraube\.zip$/);
  expect(errors, errors.join('\n')).toEqual([]);
});

/* Nur ein Bauteil, kein Anguss als Datei: dann gibt es die Designer-Schritte.
   Der Anguss kommt aus dem Designer, sein „Weiter" steht unter dessen
   Hauptknopf; Überläufe sind wahlweise. Mit Anguss und Pressrest als Datei
   (das Beispiel oben) stehen beide Schritte nicht in der Leiste. */
test('Simulation einrichten: Anguss im Designer, Überläufe wahlweise', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error' || /\/api\//.test(m.location().url || '')) return;
    errors.push('console: ' + m.text() + ' @ ' + (m.location().url || ''));
  });
  await page.goto('/tools/simulation/?part=gearbox_cover');
  await page.waitForFunction(() => window.__simulation?.state.ready && window.__simulation.plan.bodies.length === 1, null, { timeout: 60_000 });
  await expect(page.locator('[data-stage="anguss"]')).toBeVisible();
  await expect(page.locator('[data-stage="ueberlauf"]')).toHaveClass(/locked/);
  await page.click('[data-stage="anguss"]');
  await expect(page.locator('[data-ui="sim-next"]')).toBeDisabled();
  await page.click('[data-ui="primary"]');
  await expect(page.locator('[data-ui="sim-next"]')).toBeEnabled({ timeout: 30_000 });
  await expect(page.locator('[data-ui="sim-next"]')).toHaveText('Weiter: Überläufe');
  await page.click('[data-ui="sim-next"]');
  await expect(page.locator('[data-ui="sim-next"]')).toHaveText('Ohne Überläufe weiter: Einlass');
  await page.click('[data-ui="sim-next"]');
  expect(await page.evaluate(() => window.__simulation.state.stage)).toBe('einlass');
  /* der Vorschlag gilt: die Kreisfläche des Pressrests aus dem Designer */
  await expect.poll(() => page.evaluate(() => { const p = window.__simulation.plan; return p.inlet && p.body(p.inlet.bodyId).src; })).toBe('biscuit');
  expect(errors, errors.join('\n')).toEqual([]);
});
