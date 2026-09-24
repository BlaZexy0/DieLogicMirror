/* Die Schemabilder des 3D-Studios für die Startseite (index.html, Abschnitt
   „Das 3D-Studio, Werkzeug für Werkzeug"):
      npm run serve          (in einem zweiten Terminal)
      node scripts/3d-studio/build-studio-figures.mjs [http://127.0.0.1:8765] [nur,diese]
   Ziel: web/assets/studio/<werkzeug>.webp

   Keine abfotografierte Oberfläche, sondern je Werkzeug ein Bild mit einer
   Aussage: das Werkzeug im Ergebniszustand, die Bedienoberfläche
   ausgeblendet, weißer Grund, das Bauteil formatfüllend. Freigestellt wird im
   Browser selbst (Leinwand auf den Inhalt zuschneiden, 5 % Rand, 4:3, WebP).
   Die Legenden stehen als Text in index.html, mit den Farbrollen; gerechnet
   wird im Standardschema, damit Bild und Legende zusammenpassen.
   Die Seiten rechnen mit SwiftShader auf der CPU: einige Minuten. */

import { writeFileSync, mkdirSync } from 'node:fs';
import pw from '../../node_modules/@playwright/test/index.js';

const BASE = (process.argv[2] || 'http://127.0.0.1:8765').replace(/\/$/, '') + '/tools/3d-studio/';
const only = process.argv[3] ? process.argv[3].split(',') : null;
const want = n => !only || only.includes(n);
const OUT = new URL('../../web/assets/studio/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const browser = await pw.chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => { try { localStorage.setItem('dielogic-scheme-v1', 'teal'); } catch (e) { /* egal */ } });

const newPage = async () => {
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('  Fehler:', e.message.slice(0, 120)));
  return p;
};
const hook = p => p.evaluate(() => (window.__werkbank ? '__werkbank' : '__form3d'));
const until = (p, fn, arg, ms = 300_000) => p.waitForFunction(fn, arg, { timeout: ms });
const ready = p => until(p, () => (window.__werkbank ? window.__werkbank.ctx && window.__werkbank.ctx.ready : window.__form3d && window.__form3d.state && window.__form3d.state.ready), null);
const pause = (p, ms) => p.waitForTimeout(ms);
const click = async (p, sel) => { await p.click(sel); await pause(p, 700); };

/* Bedienoberfläche weg, weißer Grund, eine Ansicht, einpassen — dann die
   Leinwand schießen und im Browser freistellen. */
async function figure(p, name, { view = 'iso', size = [780, 585] } = {}) {
  await p.addStyleTag({ content: `
    .st-bar, .st-panel, .st-help, .st-dock-tl, .st-dock-br, .st-dock-bl, .view-bar, .st-viewbar, .axes, .st-axes,
    .drop-hint, #busy, .aim-banner, .st-rail, nav, .dl-nav, footer { display: none !important; }
    .st-layout { grid-template-columns: 1fr !important; }
    #viewport > *:not(canvas) { display: none !important; }
    html, body { background: #fff !important; }` });
  const k = await hook(p);
  await p.evaluate(k => {
    const v = window[k], view = v.view;
    if (view.scene.background && view.scene.background.set) view.scene.background.set(0xffffff);
    else view.scene.background = null;
    if (view.renderer.setClearColor) view.renderer.setClearColor(0xffffff, 1);
    window.dispatchEvent(new Event('resize'));
    view.invalidate();
  }, k);
  await pause(p, 900);
  if (view) { await p.evaluate(v => document.querySelector(`[data-view="${v}"]`)?.click(), view); await pause(p, 900); }
  await p.evaluate(() => document.querySelector('[data-fit]')?.click());
  await pause(p, 1500);
  const png = await p.locator('#viewport canvas').first().screenshot({ timeout: 180_000 });
  const webp = await p.evaluate(async ([b64, w, h]) => {
    const img = new Image();
    img.src = 'data:image/png;base64,' + b64;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      const i = 4 * (y * c.width + x);
      if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const s = Math.min(w * 0.9 / bw, h * 0.9 / bh);
    const o = document.createElement('canvas');
    o.width = w; o.height = h;
    const og = o.getContext('2d');
    og.fillStyle = '#fff'; og.fillRect(0, 0, w, h);
    og.imageSmoothingQuality = 'high';
    og.drawImage(c, x0, y0, bw, bh, (w - bw * s) / 2, (h - bh * s) / 2, bw * s, bh * s);
    return o.toDataURL('image/webp', 0.82).split(',')[1];
  }, [png.toString('base64'), size[0], size[1]]);
  const buf = Buffer.from(webp, 'base64');
  writeFileSync(OUT + name + '.webp', buf);
  console.log(name.padEnd(16), (buf.length / 1024).toFixed(1) + ' kB');
}

if (want('entformung')) {
  const p = await newPage();
  await p.goto(BASE + 'entformungsanalyse.html', { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-ui="primary"]');
  await until(p, () => window.__form3d.state.analysed && !window.__form3d.state.running, null);
  await figure(p, 'entformung');
  await p.close();
}

if (want('wandstaerke')) {
  const p = await newPage();
  await p.goto(BASE + 'wandstaerke.html', { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-ui="primary"]');
  await until(p, () => window.__form3d.state.field && !window.__form3d.state.running, null);
  await click(p, '[data-mode="waermezentren"]');
  await figure(p, 'wandstaerke');
  await p.close();
}

if (want('abstand')) {
  const p = await newPage();
  await p.goto(BASE + 'abstand.html', { waitUntil: 'load' });
  await until(p, () => window.__form3d.state.a.model && window.__form3d.state.b.model, null);
  await click(p, '[data-ui="primary"]');
  await until(p, () => window.__form3d.state.analysed && !window.__form3d.state.running, null);
  /* Nur das eingefärbte Bauteil: die langen Kanäle nähmen sonst das Bild ein. */
  await p.evaluate(() => { const b = document.querySelector('[data-ui="show-b"]'); b.checked = false; b.dispatchEvent(new Event('change', { bubbles: true })); });
  await figure(p, 'abstand');
  await p.close();
}

if (want('fuellung')) {
  const p = await newPage();
  await p.goto(BASE + 'fuellung.html', { waitUntil: 'load' });
  await ready(p);
  await p.click('[data-view="iso"]'); await p.click('[data-fit]'); await pause(p, 800);
  const box = await p.locator('#viewport canvas').first().boundingBox();
  for (const [dx, dy] of [[-0.10, 0.06], [0.10, -0.04]]) {
    await click(p, '[data-chip="anschnitt"]');
    await p.mouse.click(box.x + box.width * (0.5 + dx), box.y + box.height * (0.5 + dy));
    await pause(p, 900);
  }
  await click(p, '[data-mode="fuellung"]');
  await click(p, '[data-ui="primary"]');
  await until(p, () => window.__form3d.state.result && !window.__form3d.state.running, null);
  await click(p, '[data-mode="ergebnis"]');
  await click(p, '[data-ui="show-seg"] button[data-value="farbe"]');
  await figure(p, 'fuellung');
  await p.close();
}

if (want('anguss')) {
  const p = await newPage();
  await p.goto(BASE + 'anguss.html?demo=oelwanne', { waitUntil: 'load' });
  await ready(p);
  await pause(p, 3000);
  await figure(p, 'anguss');
  await p.close();
}

if (want('ueberlauf')) {
  const p = await newPage();
  await p.goto(BASE + 'ueberlauf.html', { waitUntil: 'load' });
  await ready(p);
  await p.click('[data-view="z"]'); await p.click('[data-fit]'); await pause(p, 900);
  const box = await p.locator('#viewport canvas').first().boundingBox();
  for (const [chip, dx, dy] of [['bohne', -0.12, -0.2], ['bohne', 0.12, -0.2], ['entlueftet', 0.12, 0.2], ['waschbrett', -0.12, 0.2]]) {
    await click(p, `[data-chip="${chip}"]`);
    await p.mouse.click(box.x + box.width * (0.5 + dx), box.y + box.height * (0.5 + dy));
    await pause(p, 800);
  }
  await p.keyboard.press('Escape');
  await figure(p, 'ueberlauf', { view: 'z' });
  await p.close();
}

if (want('temperier')) {
  const p = await newPage();
  await p.goto(BASE + 'temperier.html', { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-ui="primary"]');
  await until(p, () => !window.__form3d.state.running && window.__form3d.state.field, null);
  await click(p, '[data-mode="setzen"]');
  await click(p, '[data-ui="primary"]');
  await until(p, () => !window.__form3d.state.running, null);
  await pause(p, 1500);
  await p.keyboard.press('Escape');
  await figure(p, 'temperier');
  await p.close();
}

if (want('form')) {
  const p = await newPage();
  await p.goto(BASE + 'form.html', { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-mode="schnitt"]');
  await pause(p, 4000);
  await figure(p, 'form');
  await p.close();
}

for (const [name, page, frac] of [['angussfuellung', 'angussfuellung.html', 0.6], ['kammerfuellung', 'kammerfuellung.html', 0.75]]) {
  if (!want(name)) continue;
  const p = await newPage();
  await p.goto(BASE + page, { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-ui="primary"]');
  await until(p, () => { const s = document.querySelector('[data-ui="t-slider"]'); return s && Number(s.max) > 3 && !window.__form3d.state.running; }, null, 600_000);
  await click(p, '[data-mode="ergebnis"]');                // dort steht das Ergebnis im Bild
  await p.evaluate(f => {
    const s = document.querySelector('[data-ui="t-slider"]');
    s.value = String(Math.round(Number(s.max) * f));
    s.dispatchEvent(new Event('input', { bubbles: true }));
  }, frac);
  await pause(p, 2500);
  /* Die Füllkammer ist flach und steht auf der Startseite in einer breiten Karte. */
  await figure(p, name, { view: null, size: name === 'kammerfuellung' ? [1100, 440] : [780, 585] });
  await p.close();
}

if (want('werkbank')) {
  const p = await newPage();
  await p.goto(BASE + 'werkbank.html', { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-stage="anguss"]');
  await click(p, '[data-ui="primary"]');                  // „Anguss ans Bauteil legen"
  await pause(p, 3000);
  await click(p, '[data-stage="ueberlauf"]');              // Bauteil und Anguss, ohne Griffe
  await pause(p, 2000);
  await figure(p, 'werkbank', { size: [1100, 825] });
  await p.close();
}

await ctx.close();
await browser.close();
