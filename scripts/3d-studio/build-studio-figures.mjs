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
async function figure(p, name, { view = 'iso', dir = null, size = [780, 585] } = {}) {
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
  if (dir) {
    /* Eine eigene Blickrichtung statt einer Standardansicht (vom Ziel zur Kamera). */
    await p.evaluate(([k, dir]) => {
      const view = window[k].view, c = view.controls, n = Math.hypot(...dir);
      const d = view.camera.position.distanceTo(c.target);
      view.camera.position.set(c.target.x + dir[0] / n * d, c.target.y + dir[1] / n * d, c.target.z + dir[2] / n * d);
      view.camera.lookAt(c.target);
      c.update();
      view.invalidate();
    }, [k, dir]);
    await pause(p, 900);
  } else if (view) { await p.evaluate(v => document.querySelector(`[data-view="${v}"]`)?.click(), view); await pause(p, 900); }
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
  /* Überläufe sitzen AUSSEN am Bauteil, in der Trennebene: gesetzt auf den
     Flansch, 1 mm vor seiner Außenkante, und nach außen gedreht, damit Steg
     und Bohne über die Kante hinausragen wie in der Form. Früher klickte
     das Skript mitten auf die Deckelfläche, dort lagen die Elemente im
     Bauteil und wiesen nach innen (Rückmeldung vom 24.09.). Die Orte holt
     ein senkrechter Strahl von oben aufs Bauteil, der Plan geht durch die
     Datei-Schnittstelle des Werkzeugs (fromJSON). Oben am Rand (gegenüber
     einem Anschnitt unten) zwei Bohnen und das Waschbrett, an den Seiten je
     ein Überlauf mit Entlüftung. */
  const placed = await p.evaluate(async () => {
    const M = await import(new URL('js/vents/model.js', location.href).href);
    const v = window.__form3d, m = v.host.part.model, t = m.tris, b = m.bounds;
    /* Der oberste Treffer eines Strahls, der bei (x, y) von oben kommt. */
    const hitTop = (x, y) => {
      let best = null;
      for (let f = 0; f < m.faceCount; f++) {
        const o = f * 9;
        const d = (t[o + 4] - t[o + 7]) * (t[o] - t[o + 6]) + (t[o + 6] - t[o + 3]) * (t[o + 1] - t[o + 7]);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((t[o + 4] - t[o + 7]) * (x - t[o + 6]) + (t[o + 6] - t[o + 3]) * (y - t[o + 7])) / d;
        const w = ((t[o + 7] - t[o + 1]) * (x - t[o + 6]) + (t[o] - t[o + 6]) * (y - t[o + 7])) / d;
        if (u < 0 || w < 0 || u + w > 1) continue;
        const z = u * t[o + 2] + w * t[o + 5] + (1 - u - w) * t[o + 8];
        if (!best || z > best.p[2]) best = { p: [x, y, z], f };
      }
      return best;
    };
    const IN = 1;                                   // mm vor der Außenkante
    const spots = [
      ['bohne', -120, b.max[1] - IN, [0, 1, 0]],
      ['waschbrett', 0, b.max[1] - IN, [0, 1, 0]],
      ['bohne', 120, b.max[1] - IN, [0, 1, 0]],
      ['entlueftet', b.min[0] + IN, 90, [-1, 0, 0]],
      ['entlueftet', b.max[0] - IN, 90, [1, 0, 0]]
    ];
    const items = spots.map(([type, x, y, out]) => {
      const hit = hitTop(x, y);
      const n = [0, 0, 1];                          // die Flanschfläche, von oben getroffen
      /* Die Drehung um die Normale, mit der die Längsrichtung nach außen weist. */
      const d0 = M.frameOf({ pos: hit.p, dir: n, rot: 0 }).d;
      const rot = Math.atan2(d0[0] * out[1] - d0[1] * out[0], d0[0] * out[0] + d0[1] * out[1]) * 180 / Math.PI;
      return { type, pos: hit.p, dir: n, rot };
    });
    v.tool.fromJSON({ format: M.FORMAT, version: M.FORMAT_VERSION, items });
    v.handles.group.visible = false;                // nur die Körper, keine Griffe
    v.view.invalidate();
    return M.allItems(v.state.plan).map(it => it.type + ' ' + it.pos.map(q => q.toFixed(0)).join('/') + ' → ' + M.frameOf(it).d.map(q => q.toFixed(2)).join('/'));
  });
  console.log('  ' + placed.join('\n  '));
  await figure(p, 'ueberlauf', { view: 'z' });
  await p.close();
}

if (want('temperier')) {
  const p = await newPage();
  await p.goto(BASE + 'temperier.html', { waitUntil: 'load' });
  await ready(p);
  await click(p, '[data-ui="primary"]');                   // die Abstandsfläche
  await until(p, () => !window.__form3d.state.running && window.__form3d.state.field, null);
  await click(p, '[data-mode="setzen"]');
  /* Kühlstiche bohrt man von der Rückseite der Formhälfte, parallel zur
     Formöffnung: Richtung Z. Mit der Vorgabe „Normale" stand jeder Stich
     senkrecht auf der Abstandsfläche, schräg in alle Richtungen
     (Rückmeldung vom 24.09.). 100 mm lang statt 200, damit sie das Bild
     nicht füllen. */
  await click(p, '[data-ui="dir-seg"] button[data-value="z"]');
  await p.fill('[data-ui="def-len"]', '100');
  await p.press('[data-ui="def-len"]', 'Enter');
  /* Dazu zwei gerade Kanäle unter dem großen, flachen Wannenboden, in der
     festen Hälfte: auf der Abstandsfläche (Achsabstand unter der
     Außenfläche des Bodens), neben der Nabe vorbei und durch die ganze
     Form gebohrt. Sie stehen, bevor die Automatik läuft: die setzt ihre
     Stiche um sie herum. Beide halten den Mindest-Wandabstand. */
  const tight = await p.evaluate(async () => {
    const M = await import(new URL('js/cooling/model.js', location.href).href);
    const v = window.__form3d, s = v.state, m = v.host.part.model, t = m.tris, b = m.bounds;
    /* Der unterste Treffer eines senkrechten Strahls bei (x, y): die Außenfläche des Bodens. */
    const lowest = (x, y) => {
      let z0 = Infinity;
      for (let f = 0; f < m.faceCount; f++) {
        const o = f * 9;
        const d = (t[o + 4] - t[o + 7]) * (t[o] - t[o + 6]) + (t[o + 6] - t[o + 3]) * (t[o + 1] - t[o + 7]);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((t[o + 4] - t[o + 7]) * (x - t[o + 6]) + (t[o + 6] - t[o + 3]) * (y - t[o + 7])) / d;
        const w = ((t[o + 7] - t[o + 1]) * (x - t[o + 6]) + (t[o] - t[o + 6]) * (y - t[o + 7])) / d;
        if (u < 0 || w < 0 || u + w > 1) continue;
        z0 = Math.min(z0, u * t[o + 2] + w * t[o + 5] + (1 - u - w) * t[o + 8]);
      }
      return z0;
    };
    const y = 70, z = lowest(100, y) - s.plan.dist, x = b.max[0] + 40;
    for (const sy of [1, -1]) M.addKanal(s.plan, [-x, sy * y, z], [x, sy * y, z], { d: s.defaults.kd });
    v.rebuild();
    return v.offenders().length;
  });
  if (tight) console.log('  Achtung: ' + tight + ' Kanäle unter dem Mindest-Wandabstand');
  await click(p, '[data-ui="primary"]');                   // die Automatik
  await until(p, () => !window.__form3d.state.running, null);
  await pause(p, 1500);
  await p.keyboard.press('Escape');
  await p.evaluate(() => { const v = window.__form3d; v.handles.group.visible = false; v.view.invalidate(); });
  /* Von unten, auf die feste Hälfte: dort stehen die Kanäle und die
     meisten Stiche vor dem Bauteil, alle parallel. */
  await figure(p, 'temperier', { dir: [0.9, 0.6, -0.8] });
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
