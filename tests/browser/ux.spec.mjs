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
   Ein DESIGNER (art: 'plan') hat statt Einstellungen einen Plan: der wird
   nie still übernommen, sondern als Entwurf angeboten; die Seite fragt,
   bevor er verloren geht; Entf fragt nicht und lässt sich zurücknehmen —
   und sein Auswahlfeld scrollt so wenig wie die Seitenleiste.

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
/* Designer: ein Chip, dann ein echter Klick aufs Bauteil — rechts der Mitte,
   wo weder Auswahlfeld noch Legende liegen. */
const setzen = async (page, s, chip) => {
  const vorher = await zustand(page, s, s.plan.anzahl);
  await page.click('[data-chip="' + chip + '"]');
  const c = await page.locator('#viewport canvas').boundingBox();
  await page.mouse.click(c.x + c.width * 0.6, c.y + c.height * 0.5);
  await expect.poll(() => zustand(page, s, s.plan.anzahl), { message: 'der Klick aufs Bauteil setzt ein Element' }).toBe(vorher + 1);
};
/* Angussdesigner: gewählt wird mit einem ECHTEN Klick auf den Griff — er liegt
   dort, wohin die Kamera ihn projiziert. */
const griffKlick = async (page, s, wahl) => {
  const at = await page.evaluate(([h, f]) => {
    const v = window[h];
    const id = new Function('v', 'return (' + f + ')(v)')(v);
    const m = v.editor.group.children.find(c => c.userData && c.userData.id === id);
    v.view.camera.updateMatrixWorld(true);
    const q = m.position.clone().project(v.view.camera);
    const r = v.view.renderer.domElement.getBoundingClientRect();
    return { id, x: r.left + (q.x + 1) / 2 * r.width, y: r.top + (1 - q.y) / 2 * r.height };
  }, [s.hook, wahl.toString()]);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => zustand(page, s, v => v.editor.selected), { message: 'der Klick auf den Griff wählt ' + at.id }).toBe(at.id);
};
const SEITEN = [
  {
    page: 'wandstaerke.html', query: '?part=gearbox_cover', hook: '__wandstaerke', datei: /-wandstaerke\.json$/,
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
    page: 'entformungsanalyse.html', query: '?part=gearbox_cover', hook: '__entformung', datei: /-entformung\.json$/,
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
  },
  {
    page: 'ueberlauf.html', query: '', hook: '__ueberlauf', datei: /-ueberlauf\.json$/, art: 'plan',
    /* Ein Waschbrett (die Art mit den meisten Maßen) per Chip und Klick aufs Bauteil — gewählt bleibt es. */
    ergebnis: (page, s) => setzen(page, s, 'waschbrett'),
    plan: { aendern: (page, s) => setzen(page, s, 'bohne'), anzahl: v => Object.keys(v.state.plan.items).length }
  },
  {
    /* ?demo=oelwanne: das Beispiel bringt sein Bauteil mit — so misst die Spec auch das Einpassen (partMesh). */
    page: 'anguss.html', query: '?demo=oelwanne', hook: '__anguss', datei: /-anguss\.json$/, art: 'plan',
    /* Ein Anschnitt hat die meisten Gruppen im Auswahlfeld (Lage · Querschnitt · Anschnitt · Mündung · Details). */
    ergebnis: (page, s) => griffKlick(page, s, v => Object.values(v.state.graph.nodes).find(n => n.type === 'gate' && !n.follower).id),
    plan: {
      /* Ersten Punkt hinter dem Pressrest wählen, „Davor einfügen": EIN Punkt mehr
         (vor der Spiegelung — dahinter kämen zwei); er ist gewählt, Entf träfe ihn. */
      aendern: async (page, s) => {
        const vorher = await zustand(page, s, s.plan.anzahl);
        await griffKlick(page, s, v => v.state.graph.nodes[v.state.graph.rootId].children[0]);
        await page.click('[data-chip="insert-point"]');
        await expect.poll(() => zustand(page, s, s.plan.anzahl)).toBe(vorher + 1);
      },
      anzahl: v => Object.keys(v.state.graph.nodes).length
    }
  },
  {
    page: 'temperier.html', query: '', hook: '__temperier', datei: /-temperier\.json$/, art: 'plan',
    /* Der vollste Stand, mit echter Eingabe: ein Kanal per Chip und zwei Klicks, die Automatik über den
       Hauptknopf, ein eigener Mindest-Wandabstand, der die Liste der Prüfung füllt — zuletzt ein Kühlstich
       per Chip und Klick, der gewählt bleibt (sein Auswahlfeld hat die Reiter Maße · Details). */
    ergebnis: async (page, s) => {
      const c = await page.locator('#viewport canvas').boundingBox();
      await page.click('[data-chip="kanal"]');
      await page.mouse.click(c.x + c.width * 0.5, c.y + c.height * 0.45);
      await page.mouse.click(c.x + c.width * 0.62, c.y + c.height * 0.58);
      await expect.poll(() => zustand(page, s, s.plan.anzahl), { message: 'zwei Klicks setzen einen Kanal' }).toBe(1);
      await page.click('[data-ui="tabs"] [data-mode="setzen"]');
      await page.click('[data-ui="primary"]');
      await expect.poll(() => zustand(page, s, s.plan.anzahl), { message: 'die Automatik setzt acht Kühlstiche' }).toBe(9);
      await page.click('[data-ui="tabs"] [data-mode="flaeche"]');
      await page.click('[data-ui="min-wall-auto"]');
      await page.fill('[data-ui="min-wall"]', '14');
      await page.press('[data-ui="min-wall"]', 'Enter');
      await expect.poll(() => zustand(page, s, v => v.offenders().length), { message: 'unter 14 mm stehen die meisten' }).toBeGreaterThan(5);
      await setzen(page, s, 'stich');
    },
    /* Eine feinere Zellkante rastert das Feld neu: bei 2,5 mm rund 17 s — lang genug zum Abbrechen und
       kurz genug, dass es von selbst beginnt (über 20 s wartet die Seite auf den Knopf). */
    lang: async page => {
      await page.click('[data-ui="tabs"] [data-mode="flaeche"]');
      await page.fill('[data-ui="cell"]', '2,5');
      await page.press('[data-ui="cell"]', 'Enter');
    },
    nachAbbruch: { offen: v => v.state.stale === true && v.state.field.h > 3.5 && v.state.shellDist === 20, knopf: 'Abstandsfläche berechnen' },
    plan: { aendern: (page, s) => setzen(page, s, 'stich'), anzahl: v => Object.keys(v.state.plan.items).length }
  },
  {
    page: 'fuellung.html', query: '', hook: '__fuellung', datei: /-fuellung\.json$/, art: 'plan',
    /* Ein Anschnitt per Chip und Klick aufs Bauteil (gewählt bleibt er), dann im
       Reiter „Füllung" rechnen — bis das Ergebnis steht (die Seite geht dabei von
       selbst zum Ergebnis). */
    ergebnis: async (page, s) => {
      await setzen(page, s, 'anschnitt');
      await page.click('[data-ui="tabs"] [data-mode="fuellung"]');
      await page.click('[data-ui="primary"]');
      await page.waitForFunction(h => { const st = window[h].state; return st.result && !st.running && !st.stale; }, s.hook, { timeout: 120_000 });
    },
    /* Eine feine Zellkante macht schon das Rastern lang genug zum Abbrechen. */
    lang: async (page, s) => {
      await setzen(page, s, 'anschnitt');
      await page.click('[data-ui="tabs"] [data-mode="fuellung"]');
      await page.fill('[data-ui="cell"]', '1');
      await page.press('[data-ui="cell"]', 'Enter');
      await page.click('[data-ui="primary"]');
    },
    nachAbbruch: { offen: v => v.state.result === null, knopf: 'Rechnen' },
    plan: { aendern: (page, s) => setzen(page, s, 'anschnitt'), anzahl: v => Object.keys(v.state.plan.items).length }
  },
  {
    page: 'angussfuellung.html', query: '', hook: '__angussfuellung', datei: /-angussfuellung\.json$/,
    /* Beide Verfahren mit echten Klicks. Ohne WebGPU rechnet JavaScript;
       state.tMax (der Testgriff) kürzt die Laufzeit auf 12 ms. */
    ergebnis: async (page, s) => {
      await page.evaluate(h => { window[h].state.tMax = 0.012; }, s.hook);
      for (const [engine, zelle] of [['lbm', '6'], ['sph', '8']]) {
        await page.click('[data-ui="tabs"] [role="tab"][data-mode="simulation"]');
        await page.click(`[data-ui="engine-seg"] button[data-value="${engine}"]`);
        await page.fill('[data-ui="cell"]', zelle);
        await page.press('[data-ui="cell"]', 'Enter');
        await page.click('[data-ui="primary"]');
        await page.waitForFunction(([h, e]) => window[h].state.results[e] && !window[h].state.running, [s.hook, engine], { timeout: 180_000 });
      }
    },
    /* Der Vorschlag ohne WebGPU rechnet Minuten — lang genug zum Abbrechen. */
    lang: async page => { await page.click('[data-ui="tabs"] [role="tab"][data-mode="simulation"]'); await page.click('[data-ui="primary"]'); },
    nachAbbruch: { offen: v => v.state.result === null, knopf: 'Simulieren' },
    merken: {
      setzen: async page => { await page.click('[data-ui="tabs"] [role="tab"][data-mode="simulation"]'); await page.click('[data-ui="engine-seg"] button[data-value="sph"]'); },
      gemerkt: doc => doc.engine === 'sph',
      wert: page => page.evaluate(() => document.querySelector('[data-ui="engine-seg"] button.active').dataset.value), soll: 'sph'
    }
  },
  {
    /* Der Formaufbau hat eine Form statt eines Bauteils, und sein Plan IST die Form: geändert wird mit einer
       neuen Gruppe (Hauptknopf, Name, „Anlegen"), entfernt über das Menü „⋯" ihres Kopfes — Entf gehört hier
       keinem Teil, die Hervorhebung ist Ansicht, keine Auswahl. Der vollste Stand: die Temperierung
       hervorgehoben (ihre Gruppe aufgeklappt) und das Menü eines Kreises offen. „Speichern" schreibt die GLB. */
    page: 'form.html', query: '', hook: '__formaufbau', datei: /\.glb$/, art: 'plan',
    ergebnis: async page => {
      await page.click('[data-ui="tabs"] [data-mode="teile"]');
      await page.click('[data-ui="hl-cooling"]');
      await page.click('.comp-row.hl [data-act="menu"]');
      await expect(page.locator('.comp-row.hl .row-menu:not(.hidden)')).toHaveCount(1);
    },
    plan: {
      aendern: async (page, s) => {
        const vorher = await zustand(page, s, s.plan.anzahl);
        await page.click('[data-ui="tabs"] [data-mode="teile"]');
        await page.click('[data-ui="primary"]');
        await page.fill('[data-ui="group-title"]', 'Schieber unten');
        await page.click('[data-ui="primary"]');
        await expect.poll(() => zustand(page, s, s.plan.anzahl), { message: 'Anlegen legt eine Gruppe an' }).toBe(vorher + 1);
      },
      anzahl: v => v.asm.groups.length,
      entfernen: async page => {
        const kopf = page.locator('.group-head').last();
        await kopf.locator('[data-act="group-menu"]').click();
        await kopf.locator('[data-act="remove-group"]').click();
      }
    }
  },
  {
    page: 'kammerfuellung.html', query: '', hook: '__kammerfuellung', datei: /-kammerfuellung\.json$/,
    ergebnis: async (page, s) => {
      const tab = m => page.click(`[data-ui="tabs"] [role="tab"][data-mode="${m}"]`);
      const tippen = async (n, w) => { await page.fill(`[data-ui="${n}"]`, w); await page.press(`[data-ui="${n}"]`, 'Enter'); };
      await tab('kammer'); await tippen('sl-d', '40'); await tippen('sl-len', '120');
      await tab('kurve'); await page.click('[data-ui="curve-seg"] button[data-value="v1v2"]');
      for (const engine of ['lbm', 'sph']) {
        await tab('simulation');
        await page.click(`[data-ui="engine-seg"] button[data-value="${engine}"]`);
        await tippen('cell', '5');
        await page.click('[data-ui="primary"]');
        await page.waitForFunction(([h, e]) => window[h].state.results[e] && !window[h].state.running, [s.hook, engine], { timeout: 120_000 });
      }
    },
    /* Die Vorgabe ist das Metamodell und in Sekunden fertig — zum Abbrechen
       braucht es das Gitter, das ohne WebGPU Minuten rechnet. */
    lang: async page => {
      await page.click('[data-ui="tabs"] [role="tab"][data-mode="simulation"]');
      await page.click('[data-ui="engine-seg"] button[data-value="lbm"]');
      await page.click('[data-ui="primary"]');
    },
    nachAbbruch: { offen: v => v.state.result === null, knopf: 'Simulieren' },
    merken: {
      setzen: async page => { await page.click('[data-ui="tabs"] [role="tab"][data-mode="kurve"]'); await page.click('[data-ui="curve-seg"] button[data-value="v1v2"]'); },
      gemerkt: doc => doc.curveMode === 'v1v2',
      wert: page => page.evaluate(() => document.querySelector('[data-ui="curve-seg"] button.active').dataset.value), soll: 'v1v2'
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
    .filter(e => !['tl', 'br', 'bl'].includes(e.dataset.dock) && sichtbar(e) && (e.textContent.trim() || e.children.length));
  const ueber = [];
  for (let i = 0; i < docks.length; i++) for (let j = i + 1; j < docks.length; j++) {
    const a = docks[i].getBoundingClientRect(), b = docks[j].getBoundingClientRect();
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 1 && h > 1) ueber.push(docks[i].dataset.dock + ' × ' + docks[j].dataset.dock);
  }
  const body = q('body'), panel = q('panel');
  /* Abgeschnitten: Text, der breiter ist als sein Kasten; Knöpfe, die aus
     ihrem Schalter oder der Reiterzeile ragen; Felder, die breiter sind als
     die Seitenleiste. Der Bauteilname im Chip darf kürzen — auch in den
     Chips A und B der Abstandsanalyse (der volle steht in der Klappe). */
  const knapp = [];
  const name = el => (el.dataset.ui || el.dataset.mode || el.dataset.value || el.textContent.trim() || el.tagName).slice(0, 28);
  for (const el of document.querySelectorAll('.st-root button, .st-root .klbl, .st-root .kval, .st-root .row > span, .st-root .fact span, .st-root .st-hint, .st-root .st-note, .st-root .st-hintline, .st-root summary, .st-root .st-tool-name, #status')) {
    if (!sichtbar(el) || el.closest('[hidden]') || el.closest('[data-ui^="part-chip"]')) continue;
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
  const feld = q('inspector-body');
  return {
    feld: feld && sichtbar(feld) ? feld.scrollHeight - feld.clientHeight : 0,
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
      const modi = await page.evaluate(() => [...document.querySelectorAll('[data-ui="tabs"] [role="tab"]')].map(b => b.dataset.mode));
      expect(modi.length).toBeGreaterThan(1);

      const pruefen = async wann => {
        for (const m of modi) {
          await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, m]);
          /* Alles aufklappen, was sich aufklappen lässt — der schlimmste Fall. */
          await page.evaluate(() => { for (const d of document.querySelectorAll('.st-mode:not([hidden]) details')) d.open = true; });
          const r = await messen(page);
          expect(r.body, `${m} (${wann}): Inhalt der Seitenleiste läuft über`).toBeLessThanOrEqual(0);
          expect(r.panel, `${m} (${wann}): Seitenleiste läuft über`).toBeLessThanOrEqual(0);
          expect(r.feld, `${m} (${wann}): das Auswahlfeld scrollt`).toBeLessThanOrEqual(0);
          expect(r.seite, `${m} (${wann}): die Seite selbst scrollt`).toBeLessThanOrEqual(0);
          expect(r.ueber, `${m} (${wann}): Aufsätze überdecken sich`).toEqual([]);
          expect(r.knapp, `${m} (${wann}): abgeschnitten`).toEqual([]);
        }
      };
      await pruefen('beim Laden');
      /* Eingepasst heißt: ganz im Bild — auch wenn das Bild hochkant steht
         (js/scene.js passte früher nur in die Höhe ein). Gemessen an den
         Ecken des Hüllquaders, auf den Bildschirm projiziert: |x|, |y| ≤ 1 —
         im ersten Modus, in dem eingepasst wurde (beim Formaufbau fährt der
         Modus „Öffnen" die Form auf). Wer keinen einzelnen Körper hat (die
         Form ist eine Baugruppe), nennt seinen Hüllquader (fitBox). Danach
         geht es im Modus von vorher weiter. */
      const zuletzt = await page.evaluate(h => window[h].shell.mode, s.hook);
      await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, modi[0]]);
      const rand = await page.evaluate(h => {
        const v = window[h], netze = [v.partMesh, v.meshA, v.meshB].filter(Boolean);
        const ecken = [];
        const kasten = (b, m) => {
          for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
            const p = b.min.clone().set(x, y, z);
            ecken.push(m ? p.applyMatrix4(m.matrixWorld) : p);
          }
        };
        for (const m of netze) { m.geometry.computeBoundingBox(); kasten(m.geometry.boundingBox, m); }
        const fb = v.fitBox && v.fitBox();
        if (fb) kasten(fb, null);
        let worst = 0;
        for (const p of ecken) { p.project(v.view.camera); worst = Math.max(worst, Math.abs(p.x), Math.abs(p.y)); }
        return worst;
      }, s.hook);
      expect(rand, 'das Modell ragt aus dem Bild').toBeLessThanOrEqual(1.0);
      await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, zuletzt]);
      await s.ergebnis(page, s);
      await pruefen('mit Ergebnis');
      /* Das Auswahlfeld eines Designers: jede seiner Gruppen einmal aufgeklappt. */
      const schalter = '[data-ui="inspector"]:not([hidden]) :is([data-group-tab], details > summary)';
      const gruppen = await page.locator(schalter).count();
      for (let i = 0; i < gruppen; i++) {
        await page.locator(schalter).nth(i).click();
        const r = await messen(page);
        expect(r.feld, `Auswahlfeld, Gruppe ${i + 1}: scrollt`).toBeLessThanOrEqual(0);
        expect(r.ueber, `Auswahlfeld, Gruppe ${i + 1}: Aufsätze überdecken sich`).toEqual([]);
        expect(r.knapp, `Auswahlfeld, Gruppe ${i + 1}: abgeschnitten`).toEqual([]);
      }
      expect(errors).toEqual([]);
    });
  }

  if (s.lang) test(`${s.page}: eine laufende Rechnung lässt sich abbrechen`, async ({ page }) => {
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

  if (s.merken) test(`${s.page}: Einstellungen kommen nach dem Neuladen zurück — und lassen sich zurücksetzen`, async ({ page }) => {
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

  if (s.plan) test(`${s.page}: der Plan wird als Entwurf angeboten, nie still übernommen; Entf fragt nicht, Strg+Z holt zurück`, async ({ page }) => {
    const errors = watch(page);
    /* Entfernt wird mit Entf, den Zeiger über dem Bild — oder so, wie das
       Werkzeug entfernt (der Formaufbau: über das Menü „⋯"). */
    const entfernen = s.plan.entfernen ? () => s.plan.entfernen(page, s) : async () => {
      const c = await page.locator('#viewport canvas').boundingBox();
      await page.mouse.move(c.x + c.width - 24, c.y + c.height * 0.5);
      await page.keyboard.press('Delete');
    };
    await page.goto(url(s));
    await ready(page, s.hook);
    const leer = await zustand(page, s, s.plan.anzahl);
    await expect(page.locator('[data-ui="undo"]')).toBeDisabled();
    await s.plan.aendern(page, s);
    await expect(page.locator('[data-ui="undo"]')).toBeEnabled();
    await expect(page.locator('[data-ui="save"]')).toHaveClass(/dirty/);
    await page.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('studio:')), null, { timeout: 8_000 });

    /* Verlassen mit ungespeichertem Plan: die Seite fragt. */
    let gefragt = '';
    page.on('dialog', d => { gefragt = d.type(); d.accept(); });
    await page.reload();
    await ready(page, s.hook);
    expect(gefragt, 'beim Verlassen wird gefragt').toBe('beforeunload');
    expect(await zustand(page, s, s.plan.anzahl), 'der Entwurf wird NICHT still übernommen').toBe(leer);
    const streifen = page.locator('[data-ui="banner"]');
    await expect(streifen).toBeVisible();
    await expect(streifen).toContainText('Entwurf');
    expect((await messen(page)).body, 'auch mit dem Streifen scrollt die Seitenleiste nicht').toBeLessThanOrEqual(0);
    await streifen.getByRole('button', { name: 'Wiederherstellen' }).click();
    await expect.poll(() => zustand(page, s, s.plan.anzahl)).toBe(leer + 1);
    await expect(streifen).toBeHidden();

    /* Entf: ohne Nachfrage weg, der Toast bietet den Rückweg, Strg+Z geht ihn auch. */
    await s.plan.aendern(page, s);
    const voll = await zustand(page, s, s.plan.anzahl);
    await entfernen();
    await expect.poll(() => zustand(page, s, s.plan.anzahl)).toBe(voll - 1);
    const toast = page.locator('[data-ui="toast"]');
    await expect(toast).toBeVisible();
    await expect(toast).toContainText('entfernt');
    expect((await messen(page)).ueber, 'der Toast überdeckt nichts').toEqual([]);
    await page.keyboard.press('Control+z');
    await expect.poll(() => zustand(page, s, s.plan.anzahl)).toBe(voll);
    await entfernen();
    await toast.locator('.st-toast-act').click();
    await expect.poll(() => zustand(page, s, s.plan.anzahl), { message: '„Rückgängig" im Toast' }).toBe(voll);
    expect(errors).toEqual([]);
  });

  test(`${s.page}: die Hilfe öffnet an ihrem Anker, Escape schließt sie; Speichern liefert eine Datei`, async ({ page }) => {
    const errors = watch(page);
    await page.goto(url(s));
    await ready(page, s.hook);
    /* Der erste Modus, der ein ⓘ zeigt — eines, das nicht in einem verborgenen
       Teil des Modus steckt (das Formular „Neue Gruppe" des Formaufbaus). */
    const mitInfo = await page.evaluate(() => {
      const b = [...document.querySelectorAll('.st-mode .st-info')].find(x => !x.parentElement.closest('[hidden]:not(.st-mode)'));
      return b ? b.closest('.st-mode').dataset.mode : null;
    });
    expect(mitInfo, 'die Seite hat ein ⓘ').not.toBeNull();
    await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, mitInfo]);
    const info = page.locator('.st-mode:not([hidden]) .st-info:visible').first();
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
      const modi = await page.evaluate(() => [...document.querySelectorAll('[data-ui="tabs"] [role="tab"]')].map(b => b.dataset.mode));
      const klein = [];
      for (const m of modi) {
        await page.evaluate(([hk, id]) => window[hk].shell.setMode(id), [s.hook, m]);
        const r = await messen(page);
        expect(r.body, `${m}: die Seitenleiste läuft unter dem Finger über`).toBeLessThanOrEqual(0);
        expect(r.ueber, `${m}: Aufsätze überdecken sich`).toEqual([]);
        expect(r.knapp, `${m}: abgeschnitten`).toEqual([]);
        klein.push(...await page.evaluate(mode => {
          const out = [];
          for (const el of document.querySelectorAll('.st-root button, .st-root [role="button"], .st-root select, .st-root input, .st-root summary')) {
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

/* Was nur ein echter Browser zeigt (Prüfung vom 22.09.): ein Label gehört
   seinem Feld, nicht dem ⓘ davor; ein Doppelklick auf den Hauptknopf ist
   kein Abbruch; der Entwurfsstreifen geht mit seinem Bauteil. */
test.describe('Rahmen, echte Eingaben', () => {
  test('ein Klick auf die Bezeichnung setzt den Fokus ins Feld und öffnet NICHT die Hilfe', async ({ page }) => {
    await page.goto('/tools/3d-studio/wandstaerke.html');
    await ready(page, '__wandstaerke');
    const wort = page.locator('.st-mode:not([hidden]) label.row > span', { hasText: 'Zellkante' }).first();
    const box = await wort.boundingBox();
    await page.mouse.click(box.x + 6, box.y + box.height / 2);
    await expect(page.locator('[data-ui="help"]')).toBeHidden();
    expect(await page.evaluate(() => document.activeElement && document.activeElement.dataset.ui)).toBe('cell');
    /* Das ⓘ selbst öffnet sie, auch mit der Tastatur. */
    const i = page.locator('.st-mode:not([hidden]) .st-info').first();
    await i.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-ui="help"]')).toBeVisible();
  });

  test('ein Doppelklick auf den Hauptknopf startet die Rechnung und bricht sie nicht gleich wieder ab', async ({ page }) => {
    await page.goto('/tools/3d-studio/wandstaerke.html');
    await ready(page, '__wandstaerke');
    await page.dblclick('[data-ui="primary"]');
    await page.waitForFunction(() => window.__wandstaerke.state.field && !window.__wandstaerke.shell.busy, null, { timeout: 120_000 });
    await expect(page.locator('[data-ui="note"]')).not.toContainText('Abgebrochen');
  });

  test('der Entwurfsstreifen gehört seinem Bauteil: ein Wechsel nimmt ihn mit', async ({ page }) => {
    await page.goto('/tools/3d-studio/ueberlauf.html');
    await ready(page, '__ueberlauf');
    await page.click('[data-chip="bohne"]');
    const c = await page.locator('#viewport canvas').boundingBox();
    await page.mouse.click(c.x + c.width * 0.6, c.y + c.height * 0.5);
    await expect.poll(() => page.evaluate(() => Object.keys(window.__ueberlauf.state.plan.items).length)).toBe(1);
    const teil = async id => {
      await page.click('[data-ui="part-chip"]');
      await page.selectOption('#demo-select', id);
      await page.waitForFunction(i => window.__ueberlauf.state.ready && window.__ueberlauf.host.part.demoId === i, id, { timeout: 60_000 });
      await page.keyboard.press('Escape');
    };
    const streifen = page.locator('[data-ui="banner"]');
    await teil('oil_pan');
    await expect(streifen).toBeHidden();
    await teil('gearbox_cover');
    await expect(streifen).toBeVisible();
    await teil('oil_pan');
    await expect(streifen, 'das Angebot wandert nicht mit').toBeHidden();
  });
});
