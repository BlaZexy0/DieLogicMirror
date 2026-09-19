/* UX-Regeln des gemeinsamen Rahmens (js/studio/) — im echten Browser,
   weil nur der ein Layout hat.

   Für jede Seite, die im Rahmen läuft, und jeden ihrer Modi gilt:
     · die Seitenleiste scrollt nicht (1280 × 720 und 1024 × 768),
       auch nicht mit aufgeklappten Details;
     · die Aufsätze im Viewport ([data-dock]) überdecken einander nicht;
     · NICHTS ist abgeschnitten — kein Reiter, kein Schalter, keine
       Bezeichnung. Die Schrift ist die des Systems und je Browser
       verschieden breit (Firefox nimmt hier Noto Sans, deutlich breiter als
       Chromiums Wahl); deshalb läuft diese Datei in BEIDEN Browsern;
     · die Seite kommt ohne Fehlermeldung hoch.
   Dazu einmal je Seite das, was der Rahmen verspricht: eine laufende
   Rechnung lässt sich abbrechen, Einstellungen kommen nach dem Neuladen
   zurück, die Hilfe öffnet an ihrem Anker, „Speichern" liefert eine Datei,
   und unter dem Finger sind die Ziele 44 px groß.

   Eine Seite, die in den Rahmen umzieht, kommt in SEITEN dazu. */

import { test, expect } from '@playwright/test';

/* Je Seite ein kleiner Adapter: wie kommt sie zu ihrem Ergebnis, wie beginnt
   eine lange Rechnung, woran sieht man den Abbruch, welche Einstellung wird
   gemerkt. Alles andere ist für jede Seite gleich. */
const zustand = (page, s, fn) => page.evaluate(([h, f]) => new Function('v', 'return (' + f + ')(v)')(window[h]), [s.hook, fn.toString()]);
const feld = async (page, s, zelle) => {
  await page.evaluate(h => window[h].shell.setMode('feld'), s.hook);
  await page.fill('[data-ui="cell"]', zelle);
  await page.press('[data-ui="cell"]', 'Enter');
};
const SEITEN = [
  {
    page: 'wandstaerke.html', query: '?part=cover', hook: '__wandstaerke', datei: /-wandstaerke\.json$/,
    ergebnis: async (page, s) => {
      await feld(page, s, '6');
      await page.click('[data-ui="primary"]');
      await page.waitForFunction(h => window[h].state.field && !window[h].state.running, s.hook, { timeout: 120_000 });
    },
    lang: async (page, s) => { await feld(page, s, '1'); await page.click('[data-ui="primary"]'); },
    nachAbbruch: { offen: v => v.state.field === null, knopf: 'Feld berechnen' },
    merken: {
      setzen: (page, s) => feld(page, s, '7'),
      gemerkt: doc => doc.cell === 7,
      wert: page => page.inputValue('[data-ui="cell"]'), soll: '7'
    }
  },
  {
    page: 'entformungsanalyse.html', query: '?part=cover', hook: '__entformung', datei: /-entformung\.json$/,
    ergebnis: (page, s) => page.waitForFunction(h => window[h].state.analysed && !window[h].state.running, s.hook, { timeout: 120_000 }),
    /* Ein anderes Beispielteil wählen: es wird geladen und sofort gerechnet. */
    lang: async page => { await page.click('[data-ui="part-chip"]'); await page.selectOption('#demo-select', 'oil_pan'); },
    nachAbbruch: { offen: v => v.state.analysed === false, knopf: 'Entformung rechnen' },
    merken: {
      setzen: page => page.click('[data-ui="axis-seg"] button[data-value="0"]'),
      gemerkt: doc => doc.axis === 0,
      wert: page => page.evaluate(() => document.querySelector('[data-ui="axis-seg"] button.active').dataset.value), soll: '0'
    }
  },
  {
    page: 'abstand.html', query: '', hook: '__abstand', datei: /-abstand\.json$/,
    ergebnis: async (page, s) => {
      await page.click('[data-ui="primary"]');
      await page.waitForFunction(h => window[h].state.analysed && !window[h].state.running, s.hook, { timeout: 180_000 });
    },
    /* Eine große Suchgrenze macht die Rechnung lang genug zum Abbrechen. */
    lang: async (page, s) => {
      await page.evaluate(h => window[h].shell.setMode('abstand'), s.hook);
      await page.fill('[data-ui="reach"]', '400');
      await page.press('[data-ui="reach"]', 'Enter');
      await page.click('[data-ui="primary"]');
    },
    nachAbbruch: { offen: v => v.state.analysed === false, knopf: 'Abstand berechnen' },
    merken: {
      setzen: async (page, s) => {
        await page.evaluate(h => window[h].shell.setMode('skala'), s.hook);
        await page.click('[data-ui="color-seg"] button[data-value="both"]');
      },
      gemerkt: doc => doc.color === 'both',
      wert: page => page.evaluate(() => document.querySelector('[data-ui="color-seg"] button.active').dataset.value), soll: 'both'
    }
  }
];
/* 1280 × 720 und 1024 × 768 sind die Maße des Plans; 960 × 1000 ist das
   halbe Fenster eines Full-HD-Schirms, 768 × 1024 dasselbe bei 125 %
   Skalierung (oder ein Tablett hochkant) — dort bricht die Ansichtsleiste um. */
const GROESSEN = [[1280, 720], [1024, 768], [960, 1000], [768, 1024]];
const url = s => '/tools/3d-studio/' + s.page + s.query;

function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    if (/\/api\//.test(m.location().url || '')) return;      // der statische Server hat kein Backend
    errors.push('console: ' + m.text());
  });
  return errors;
}

const ready = (page, hook) => page.waitForFunction(h => window[h]?.state?.ready, hook, { timeout: 60_000 });

/* Was im Browser gemessen wird: Überlauf der Seitenleiste, Überdeckungen. */
const messen = page => page.evaluate(() => {
  const q = n => document.querySelector('[data-ui="' + n + '"]');
  const sichtbar = el => {
    if (!el || el.hidden) return false;
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.01;
  };
  const docks = [...document.querySelectorAll('[data-dock]')]
    .filter(e => !['tl', 'br'].includes(e.dataset.dock) && sichtbar(e) && (e.textContent.trim() || e.children.length));
  const ueber = [];
  for (let i = 0; i < docks.length; i++) for (let j = i + 1; j < docks.length; j++) {
    const a = docks[i].getBoundingClientRect(), b = docks[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 1 && h > 1) ueber.push(docks[i].dataset.dock + ' × ' + docks[j].dataset.dock);
  }
  const body = q('body'), panel = q('panel');
  /* Abgeschnitten: Text, der breiter ist als sein Kasten; Knöpfe, die aus
     ihrem Schalter oder der Reiterzeile ragen; Felder, die breiter sind als
     die Seitenleiste. Der Bauteilname im Chip darf kürzen (der volle steht
     in der Klappe). */
  const knapp = [];
  const name = el => (el.dataset.ui || el.dataset.mode || el.dataset.value || el.textContent.trim() || el.tagName).slice(0, 28);
  for (const el of document.querySelectorAll('.st-root button, .st-root .klbl, .st-root .kval, .st-root .row > span, .st-root .fact span, .st-root .st-hint, .st-root .st-note, .st-root .st-hintline, .st-root summary, .st-root .st-tool-name, #status')) {
    if (!sichtbar(el) || el.closest('[hidden]') || el.closest('[data-ui="part-chip"]')) continue;
    if (el.scrollWidth > el.clientWidth + 1) knapp.push('Text: ' + name(el) + ' (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
  }
  for (const box of document.querySelectorAll('.st-root .seg, .st-root .view-bar, .st-root .st-bar')) {
    if (!sichtbar(box) || box.closest('[hidden]')) continue;
    const r = box.getBoundingClientRect();
    for (const k of box.querySelectorAll('button')) {
      if (!sichtbar(k)) continue;
      const b = k.getBoundingClientRect();
      if (b.right > r.right + 1 || b.left < r.left - 1) knapp.push('ragt hinaus: ' + name(k));
    }
  }
  if (body.scrollWidth > body.clientWidth + 1) knapp.push('Seitenleiste läuft seitlich über (' + body.scrollWidth + ' > ' + body.clientWidth + ')');
  return {
    body: body.scrollHeight - body.clientHeight, panel: panel.scrollHeight - panel.clientHeight,
    seite: document.documentElement.scrollHeight - innerHeight, ueber, knapp
  };
});


for (const s of SEITEN) {
  for (const [w, h] of GROESSEN) {
    test(`${s.page} @ ${w}×${h}: die Seitenleiste scrollt in keinem Modus, nichts überdeckt sich`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      const errors = watch(page);
      await page.goto(url(s));
      await ready(page, s.hook);
      const modi = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map(b => b.dataset.mode));
      expect(modi.length).toBeGreaterThan(1);

      const pruefen = async wann => {
        for (const m of modi) {
          await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, m]);
          /* Alles aufklappen, was sich aufklappen lässt — der schlimmste Fall. */
          await page.evaluate(() => { for (const d of document.querySelectorAll('.st-mode:not([hidden]) details')) d.open = true; });
          const r = await messen(page);
          expect(r.body, `${m} (${wann}): Inhalt der Seitenleiste läuft über`).toBeLessThanOrEqual(0);
          expect(r.panel, `${m} (${wann}): Seitenleiste läuft über`).toBeLessThanOrEqual(0);
          expect(r.seite, `${m} (${wann}): die Seite selbst scrollt`).toBeLessThanOrEqual(0);
          expect(r.ueber, `${m} (${wann}): Aufsätze überdecken sich`).toEqual([]);
          expect(r.knapp, `${m} (${wann}): abgeschnitten`).toEqual([]);
        }
      };
      await pruefen('beim Laden');
      /* Eingepasst heißt: ganz im Bild — auch wenn das Bild hochkant steht
         (js/scene.js passte früher nur in die Höhe ein). Gemessen an den
         Ecken des Hüllquaders, auf den Bildschirm projiziert: |x|, |y| ≤ 1. */
      const rand = await page.evaluate(h => {
        const v = window[h], netze = [v.partMesh, v.meshA, v.meshB].filter(Boolean);
        let worst = 0;
        for (const m of netze) {
          m.geometry.computeBoundingBox();
          const b = m.geometry.boundingBox;
          for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
            const p = b.min.clone().set(x, y, z).applyMatrix4(m.matrixWorld).project(v.view.camera);
            worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y));
          }
        }
        return worst;
      }, s.hook);
      expect(rand, 'das Modell ragt aus dem Bild').toBeLessThanOrEqual(1.0);
      await s.ergebnis(page, s);
      await pruefen('mit Ergebnis');
      expect(errors).toEqual([]);
    });
  }

  test(`${s.page}: eine laufende Rechnung lässt sich abbrechen`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(url(s));
    await ready(page, s.hook);
    await s.lang(page, s);
    const knopf = page.locator('[data-ui="primary"]');
    await expect(knopf).toHaveText('Abbrechen');
    await expect(knopf).toBeEnabled();
    await knopf.click();
    await page.waitForFunction(hk => !window[hk].state.running && window[hk].state.ready, s.hook, { timeout: 20_000 });
    expect(await zustand(page, s, s.nachAbbruch.offen), 'nach dem Abbruch gibt es kein Ergebnis').toBe(true);
    await expect(page.locator('[data-ui="note"]')).toContainText('Abgebrochen');
    await expect(knopf).toHaveText(s.nachAbbruch.knopf);
    expect(errors).toEqual([]);
  });

  test(`${s.page}: Einstellungen kommen nach dem Neuladen zurück — und lassen sich zurücksetzen`, async ({ page }) => {
    await page.goto(url(s));
    await ready(page, s.hook);
    const vorgabe = await s.merken.wert(page);          // was die Seite von sich aus vorschlägt
    await s.ergebnis(page, s);
    await s.merken.setzen(page, s);
    await page.waitForFunction(f => Object.keys(localStorage).some(k => k.startsWith('studio:') && new Function('d', 'return (' + f + ')(d)')(JSON.parse(localStorage[k]).doc)),
      s.merken.gemerkt.toString(), { timeout: 8_000 });
    /* Nur Einstellungen: die Seite fragt beim Verlassen nicht. */
    let gefragt = false;
    page.on('dialog', d => { gefragt = true; d.accept(); });
    await page.reload();
    await ready(page, s.hook);
    expect(gefragt).toBe(false);
    expect(await s.merken.wert(page)).toBe(s.merken.soll);
    const toast = page.locator('[data-ui="toast"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('übernommen');
    await toast.locator('.st-toast-act').click();
    expect(await s.merken.wert(page)).toBe(vorgabe);
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('studio:')))).toEqual([]);
  });

  test(`${s.page}: die Hilfe öffnet an ihrem Anker, Escape schließt sie; Speichern liefert eine Datei`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(url(s));
    await ready(page, s.hook);
    /* Der erste Modus, der ein ⓘ hat (bei den Dateien der Abstandsanalyse gibt es keines). */
    const mitInfo = await page.evaluate(() => { const b = document.querySelector('.st-mode .st-info'); return b ? b.closest('.st-mode').dataset.mode : null; });
    expect(mitInfo, 'die Seite hat ein ⓘ').not.toBeNull();
    await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, mitInfo]);
    const info = page.locator('.st-mode:not([hidden]) .st-info').first();
    const anker = await info.getAttribute('data-help');
    await info.click();
    const lade = page.locator('[data-ui="help"]');
    await expect(lade).toBeVisible();
    await expect(lade.locator(`[data-help-anchor="${anker}"]`)).toHaveClass(/st-help-hit/);
    await page.keyboard.press('Escape');
    await expect(lade).toBeHidden();
    const [datei] = await Promise.all([page.waitForEvent('download'), page.click('[data-ui="save"]')]);
    expect(datei.suggestedFilename()).toMatch(s.datei);
    expect(errors).toEqual([]);
  });
}

/* Die Seitenleiste STEHT neben dem Bild — im halben Full-HD-Fenster (960 px)
   wie bei 800 px; erst unter 720 px ist sie eine Lade über dem Bild. In beiden
   Fällen ist sie da, bis man sie mit ☰ wegnimmt: ein Klick ins Bild schließt
   sie nicht. */
for (const s of SEITEN) {
  test(`${s.page}: die Seitenleiste steht neben dem Bild, ☰ nimmt sie weg und holt sie wieder — bei jeder Breite`, async ({ page }) => {
    const lage = () => page.evaluate(() => {
      const p = document.querySelector('[data-ui="panel"]').getBoundingClientRect();
      const v = document.querySelector('[data-ui="viewport"]').getBoundingClientRect();
      const t = document.querySelector('[data-ui="panel-toggle"]');
      return { da: p.width > 50 && p.right > 5, links: Math.round(p.left), rechts: Math.round(p.right), breite: Math.round(p.width),
        bildLinks: Math.round(v.left), bildBreite: Math.round(v.width), knopf: !!(t.offsetWidth || t.offsetHeight) };
    });
    const knopf = page.locator('[data-ui="panel-toggle"]');
    const insBild = async () => { const c = await page.locator('#viewport canvas').boundingBox(); await page.mouse.click(c.x + c.width * 0.8, c.y + c.height * 0.6); };

    for (const breite of [960, 800]) {
      await page.setViewportSize({ width: breite, height: 900 });
      if (breite === 960) { await page.goto(url(s)); await ready(page, s.hook); }
      await page.waitForTimeout(300);
      let l = await lage();
      expect(l.da && l.links === 0, `${breite} px: sichtbar`).toBe(true);
      expect(l.breite).toBeGreaterThanOrEqual(300);
      expect(l.bildLinks, `${breite} px: das Bild beginnt NEBEN der Seitenleiste`).toBeGreaterThanOrEqual(l.rechts - 1);
      expect((await messen(page)).body, 'und sie scrollt nicht').toBeLessThanOrEqual(0);
      await insBild();
      expect((await lage()).da, `${breite} px: ein Klick ins Bild lässt sie stehen`).toBe(true);
    }
    /* Wegnehmen: das Bild bekommt den Platz. */
    await knopf.click();
    await expect.poll(async () => (await lage()).da, { timeout: 8000 }).toBe(false);
    await expect(knopf).toHaveAttribute('aria-expanded', 'false');
    expect((await lage()).bildBreite, 'das Bild ist so breit wie das Fenster').toBe(800);
    await knopf.click();
    await expect.poll(async () => (await lage()).da, { timeout: 8000 }).toBe(true);

    /* Unter 720 px: eine Lade ÜBER dem Bild — offen, bis man sie schließt. */
    await page.setViewportSize({ width: 680, height: 900 });
    await page.waitForTimeout(400);
    let l = await lage();
    expect(l.da && l.links === 0, 'die Lade ist offen').toBe(true);
    expect(l.bildLinks, 'sie liegt über dem Bild').toBe(0);
    await insBild();
    await page.waitForTimeout(300);
    expect((await lage()).da, 'ein Klick ins Bild lässt sie stehen').toBe(true);
    /* Die Lade gleitet — abwarten, bis sie angekommen ist (unter Software-WebGL dauert das). */
    await knopf.click();
    await expect.poll(async () => (await lage()).rechts, { message: 'der Knopf schiebt sie weg', timeout: 8000 }).toBeLessThanOrEqual(0);
    await knopf.click();
    await expect.poll(async () => (await lage()).links, { message: 'und holt sie wieder', timeout: 8000 }).toBe(0);
  });
}

/* Unter dem Finger: was man antippt, ist 44 px hoch (Regler: ihre Zeile) —
   und die Seitenleiste scrollt auch mit den höheren Zeilen nicht. */
test.describe('grober Zeiger', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'die Touch-Emulation (isMobile) gibt es nur in Chromium');
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 1024, height: 768 } });
  for (const s of SEITEN) {
    test(`${s.page}: Ziele in Seitenleiste, Kopfzeile und Ansichtsleiste sind mindestens 44 px hoch`, async ({ page }) => {
      await page.goto(url(s));
      await ready(page, s.hook);
      expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches), 'die Emulation meldet einen groben Zeiger').toBe(true);
      await s.ergebnis(page, s);
      const modi = await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].map(b => b.dataset.mode));
      const klein = [];
      for (const m of modi) {
        await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, m]);
        const r = await messen(page);
        expect(r.body, `${m}: die Seitenleiste läuft unter dem Finger über`).toBeLessThanOrEqual(0);
        expect(r.ueber, `${m}: Aufsätze überdecken sich`).toEqual([]);
        expect(r.knapp, `${m}: abgeschnitten`).toEqual([]);
        klein.push(...await page.evaluate(mode => {
          const out = [];
          for (const el of document.querySelectorAll('.st-root button, .st-root select, .st-root input, .st-root summary')) {
            if (el.hidden || el.closest('[hidden]') || el.type === 'file') continue;
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            /* Ein Regler oder Textfeld ist so hoch wie seine Zeile. */
            const box = (el.matches('input') ? el.closest('.row, label') || el : el).getBoundingClientRect();
            if (box.height < 43.5) out.push(mode + ': ' + (el.dataset.ui || el.dataset.view || el.dataset.proj || el.textContent.trim() || el.tagName).slice(0, 24) + ' ' + Math.round(box.height) + ' px');
          }
          return out;
        }, m));
      }
      expect([...new Set(klein)]).toEqual([]);
    });
  }
});
