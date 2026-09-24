/* DieLogic – web/tools/sprengflaeche/stl-app.js
   Seiten-Code der Sprengflächenanalyse: Dateien laden (STL oder GLB),
   Projektion zeichnen, Tabellen rendern, Ereignisse. Gelesen wird mit
   denselben Modulen wie im 3D-Studio: STL mit stl-math.js (das 3D-Studio
   nutzt es auch), GLB mit dessen part/glbio.js (ohne three.js; die Seite
   zeichnet nur 2D-Projektionen und braucht keine 3D-Bibliothek).
   Rechenlogik liegt in stl-math.js (Netz-Kennwerte),
   stl-logic.js (Zuordnung/Maschinentabelle), shared/clampmodel.js und
   stl-logic.js (handoffValues) — dieses Script ist reine Ansicht und Verdrahtung.
   ES-Modul wegen des Imports aus stl-math.js (<script type="module">);
   stl-logic.js, clampmodel.js & Co. bleiben klassische Scripts und stehen
   wie zuvor auf window.__STL_LOGIC__ / window.__CLAMP_MODEL__ / … bereit. */
import { parseSTL, meshVolume, meshArea } from './stl-math.js';
import { readGLBMeshes, isGLB } from '../3d-studio/js/part/glbio.js';

(function () {
  'use strict';

  /* Achszuordnung der Projektion: entlang `dir` blicken, (u,v) spannen die Bildebene auf */
  const AXES = {
    X: { u: 1, v: 2, uName: 'Y', vName: 'Z' },
    Y: { u: 0, v: 2, uName: 'X', vName: 'Z' },
    Z: { u: 0, v: 1, uName: 'X', vName: 'Y' },
  };
  const PAL = window.__PALETTE__;
  /* Die Farbe einer Datei ist die Sachfarbe dessen, was sie zeigt: das
     Bauteil in der Farbe der Schmelze, Anguss, Überlauf und Pressrest in
     ihren Tönen daneben, dieselben wie im Dashboard und im 3D-Studio.
     Dateien ohne Zuordnung bekommen reihum eine Sachfarbe AUSSERHALB der
     Schmelze-Familie, damit sie nicht wie ein Teil des Gusses aussehen.
     Gemerkt wird der NAME der Rolle, der Wert wird erst beim Zeichnen
     gelesen: so folgt das Bild einem Wechsel des Farbschemas. */
  const ROLLENFARBE = { part: 'melt', runner: 'runner', overflow: 'overflow', biscuit: 'biscuit' };
  const FREIE_FARBEN = ['die', 'machine', 'air', 'process', 'cool', 'piston'];
  const PAD = 36;

  const models = [];      // { name, tris, farbe, volume, area, role, proj: {X,Y,Z} }
  let dir = 'Z';
  let freiIdx = 0;

  /* Rolle der Palette, in der eine Datei gezeichnet wird. Wer keine
     Zuordnung hat (auch nach dem Löschen einer), behält seine Ersatzfarbe
     aus der Reihe; vergeben wird sie beim ersten Bedarf. */
  function farbeVon(m) {
    if (ROLLENFARBE[m.role]) return ROLLENFARBE[m.role];
    if (!m.farbe) m.farbe = FREIE_FARBEN[freiIdx++ % FREIE_FARBEN.length];
    return m.farbe;
  }

  const canvas = document.getElementById('proj-canvas');
  const fileInput = document.getElementById('file-input');
  const statusEl = document.getElementById('status');

  /* ── Projektion: Silhouette als Path2D + gerasterte Fläche ── */

  function buildProjection(tris, axis) {
    const { u, v } = AXES[axis];
    const path = new Path2D();
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    for (let i = 0; i < tris.length; i += 9) {
      const u0 = tris[i + u], v0 = tris[i + v];
      const u1 = tris[i + 3 + u], v1 = tris[i + 3 + v];
      const u2 = tris[i + 6 + u], v2 = tris[i + 6 + v];
      if (u0 < minU) minU = u0; if (u0 > maxU) maxU = u0;
      if (u1 < minU) minU = u1; if (u1 > maxU) maxU = u1;
      if (u2 < minU) minU = u2; if (u2 > maxU) maxU = u2;
      if (v0 < minV) minV = v0; if (v0 > maxV) maxV = v0;
      if (v1 < minV) minV = v1; if (v1 > maxV) maxV = v1;
      if (v2 < minV) minV = v2; if (v2 > maxV) maxV = v2;
      const cross = (u1 - u0) * (v2 - v0) - (v1 - v0) * (u2 - u0);
      if (cross === 0) continue;                 // degeneriert in dieser Ansicht
      path.moveTo(u0, v0);
      if (cross > 0) { path.lineTo(u1, v1); path.lineTo(u2, v2); }
      else           { path.lineTo(u2, v2); path.lineTo(u1, v1); }  // Umlaufsinn vereinheitlichen
      path.closePath();
    }
    const w = maxU - minU, h = maxV - minV;
    return { path, minU, minV, w, h, ...rasterProps(path, minU, minV, w, h) };
  }

  /* Silhouette rastern: Fläche als Pixeldeckung, Schwerpunkt (cu,cv) deckungsgewichtet. */
  function rasterProps(path, minU, minV, w, h) {
    if (!(w > 0) || !(h > 0)) return { area: 0, cu: minU + (w || 0) / 2, cv: minV + (h || 0) / 2 };
    const MAXPX = 1500;
    const scale = MAXPX / Math.max(w, h);
    const pw = Math.max(1, Math.round(w * scale));
    const ph = Math.max(1, Math.round(h * scale));
    const off = document.createElement('canvas');
    off.width = pw; off.height = ph;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(scale, 0, 0, scale, -minU * scale, -minV * scale);
    ctx.fillStyle = '#000';
    ctx.fill(path, 'nonzero');
    const data = ctx.getImageData(0, 0, pw, ph).data;
    let cover = 0, su = 0, sv = 0;
    for (let py = 0, i = 3; py < ph; py++) {
      for (let px = 0; px < pw; px++, i += 4) {
        const a = data[i];
        if (a) { cover += a; su += a * (px + 0.5); sv += a * (py + 0.5); }
      }
    }
    if (!cover) return { area: 0, cu: minU + w / 2, cv: minV + h / 2 };
    return {
      area: (cover / 255) / (scale * scale),
      cu: minU + (su / cover) / scale,
      cv: minV + (sv / cover) / scale,
    };
  }

  /* Vereinigte Silhouette aller Dateien in der aktuellen Richtung:
     alle Pfade in einem Path2D gerastert (nonzero, Umlaufsinn ist je
     Dreieck vereinheitlicht) — Überdeckungen zwischen Dateien zählen
     dadurch nur einfach, der Schwerpunkt ist deckungsgewichtet. */
  const unionCache = {};   // je Richtung: { area, cu, cv }

  function invalidateUnion() { for (const k in unionCache) delete unionCache[k]; }

  function unionSilhouette() {
    if (unionCache[dir]) return unionCache[dir];
    let minU = Infinity, minV = Infinity, maxU = -Infinity, maxV = -Infinity;
    const all = new Path2D();
    for (const m of models) {
      const p = getProjection(m, dir);
      if (!(p.w > 0) || !(p.h > 0)) continue;
      all.addPath(p.path);
      if (p.minU < minU) minU = p.minU;
      if (p.minV < minV) minV = p.minV;
      if (p.minU + p.w > maxU) maxU = p.minU + p.w;
      if (p.minV + p.h > maxV) maxV = p.minV + p.h;
    }
    if (!(maxU > minU) || !(maxV > minV)) return null;
    const props = rasterProps(all, minU, minV, maxU - minU, maxV - minV);
    if (!(props.area > 0)) return null;
    unionCache[dir] = props;
    return props;
  }

  function getProjection(model, axis) {
    if (!model.proj[axis]) model.proj[axis] = buildProjection(model.tris, axis);
    return model.proj[axis];
  }

  /* ── Dateien laden ─────────────────────────────────────────── */

  /* Teile einer GLB, deren Knotenname die Rolle sagt — so heißen die Teile
     der Gusstraube (web/examples/gusstraube.glb, wie in der Beispielform des
     3D-Studios). Andere Namen bekommen keine Rolle, die wählt der Anwender. */
  const ROLLE_AUS_NAME = { Bauteil: 'part', Anguss: 'runner', 'Überläufe': 'overflow', 'Überlauf': 'overflow', Pressrest: 'biscuit' };
  const ROLLEN_REIHE = ['part', 'runner', 'overflow', 'biscuit'];

  /* Eine Datei → ihre Teile { name, tris, role }: eine STL ist ein Teil,
     eine GLB so viele, wie sie Netze hat (in der Reihenfolge der Rollen). */
  function teileAus(file, buf) {
    if (!isGLB(buf)) return [{ name: file.name, tris: parseSTL(buf), role: file.role || '' }];
    const netze = readGLBMeshes(buf).filter(m => m.tris.length);
    if (!netze.length) throw new Error('Die GLB enthält keine Dreiecke.');
    const rang = m => { const i = ROLLEN_REIHE.indexOf(ROLLE_AUS_NAME[m.name]); return i < 0 ? ROLLEN_REIHE.length : i; };
    return netze
      .map((m, i) => ({ m, i })).sort((a, b) => rang(a.m) - rang(b.m) || a.i - b.i)
      .map(({ m }) => ({ name: netze.length > 1 ? m.name : file.name, tris: m.tris, role: ROLLE_AUS_NAME[m.name] || '' }));
  }

  async function addFiles(fileList) {
    const errors = [];
    for (const file of fileList) {
      try {
        for (const { name, tris, role } of teileAus(file, await file.arrayBuffer())) {
          models.push({
            name,
            tris,
            farbe: null,          // Ersatzfarbe (Rollenname), vergeben von farbeVon()
            volume: Math.abs(meshVolume(tris)),
            volumeSigned: meshVolume(tris),
            area: meshArea(tris),
            role,
            proj: {},
          });
        }
      } catch (e) {
        errors.push(file.name + ': ' + e.message);
      }
    }
    /* Ein nicht-positives signiertes Volumen heißt: die Dreiecke zeigen nach
       innen oder das Netz ist inkonsistent gewickelt. Der Betrag lieferte in
       beiden Fällen eine plausible Zahl — und damit eine plausible, falsche
       Masse. Das gehört gesagt. */
    const gewendet = models.filter(m => !(m.volumeSigned > 0)).map(m => m.name);
    statusEl.textContent = [
      errors.length ? 'Nicht lesbar: ' + errors.join(' · ') : '',
      gewendet.length ? 'Achtung: ' + gewendet.join(', ')
        + (gewendet.length === 1 ? ' hat' : ' haben')
        + ' kein positives Volumen: die Dreiecke zeigen nach innen oder das Netz ist '
        + 'inkonsistent gewickelt. Die Massen daraus sind nicht belastbar.' : ''
    ].filter(Boolean).join(' · ');
    invalidateUnion();
    update();
  }

  /* ── Zeichnen ──────────────────────────────────────────────── */

  function draw() {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    /* dezentes Raster in der Schrift des Farbschemas */
    ctx.strokeStyle = PAL.rgba('text', 0.06);
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    if (!models.length) return;

    let minU = 0, minV = 0, maxU = 0, maxV = 0;   // Ursprung immer im Bild
    for (const m of models) {
      const p = getProjection(m, dir);
      if (p.minU < minU) minU = p.minU;
      if (p.minV < minV) minV = p.minV;
      if (p.minU + p.w > maxU) maxU = p.minU + p.w;
      if (p.minV + p.h > maxV) maxV = p.minV + p.h;
    }
    const w = Math.max(maxU - minU, 1e-9);
    const h = Math.max(maxV - minV, 1e-9);
    const s = Math.min((W - 2 * PAD) / w, (H - 2 * PAD) / h);
    if (!isFinite(s) || s <= 0) return;
    const tx = (W - w * s) / 2 - minU * s;
    const ty = (H + h * s) / 2 + minV * s;   // v-Achse zeigt im Bild nach oben

    for (const m of models) {
      ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * tx, dpr * ty);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = PAL[farbeVon(m)];
      ctx.fill(getProjection(m, dir).path, 'nonzero');
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;

    /* Ursprung (0) und Gesamtschwerpunkt (S) der projizierten Fläche */
    const toX = (u) => tx + u * s, toY = (v) => ty - v * s;
    const cog = unionSilhouette();
    const font = '700 11px ' + getComputedStyle(document.body).fontFamily;
    if (cog) {
      ctx.strokeStyle = PAL.muted;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(toX(0), toY(0)); ctx.lineTo(toX(cog.cu), toY(cog.cv)); ctx.stroke();
      ctx.setLineDash([]);
    }
    /* Der Ursprung ist die Werkzeugmitte, ein Bezug, kein Urteil: in der
       Schrift. Der Schwerpunkt S ist der Kennpunkt des Bildes, er trägt die
       Hervorhebung (mark), wie der Betriebspunkt in den Diagrammen. */
    ctx.strokeStyle = PAL.text;
    ctx.fillStyle = PAL.text;
    ctx.lineWidth = 1.4;
    ctx.font = font;
    ctx.beginPath(); ctx.arc(toX(0), toY(0), 4, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(toX(0) - 8, toY(0)); ctx.lineTo(toX(0) + 8, toY(0));
    ctx.moveTo(toX(0), toY(0) - 8); ctx.lineTo(toX(0), toY(0) + 8);
    ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('0', toX(0) + 7, toY(0) + 7);
    if (cog) {
      const gx = toX(cog.cu), gy = toY(cog.cv);
      ctx.fillStyle = PAL.mark;
      ctx.beginPath(); ctx.arc(gx, gy, 5, 0, 2 * Math.PI); ctx.fill();
      ctx.strokeStyle = PAL.surface;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(gx, gy, 5, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillText('S', gx + 8, gy + 7);
    }

    /* Achsenkreuz der Bildebene, unten links */
    const a = AXES[dir], ox = 18, oy = H - 18, len = 34;
    ctx.strokeStyle = PAL.muted;
    ctx.fillStyle = PAL.muted;
    ctx.lineWidth = 1.4;
    ctx.font = '600 11px ' + getComputedStyle(document.body).fontFamily;
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + len, oy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy - len); ctx.stroke();
    ctx.textAlign = 'left';    ctx.textBaseline = 'middle'; ctx.fillText(a.uName, ox + len + 5, oy);
    ctx.textAlign = 'center';  ctx.textBaseline = 'bottom'; ctx.fillText(a.vName, ox, oy - len - 4);
  }

  /* ── Tabelle ───────────────────────────────────────────────── */

  function fmt(v) {
    if (!isFinite(v)) return '–';
    const av = Math.abs(v);
    const opts = av >= 1000 ? { maximumFractionDigits: 0 }
               : av >= 1    ? { maximumFractionDigits: 2 }
               :              { maximumSignificantDigits: 3 };
    return v.toLocaleString('de-DE', opts);
  }

  /* shared/util.js, vor diesem Script geladen. */
  const escapeHtml = window.__DL_UTIL__.esc;

  /* Rechenkerne: Netz-Kennwerte aus stl-math.js, Zuordnung/Maschinentabelle
     aus stl-logic.js, Zuhaltung aus shared/clampmodel.js, Übernahme (ins Projekt) aus
     stl-logic.js — hier wird nur gerendert. */
  const MACHINES = (window.__MACHINES__ && window.__MACHINES__.machines) || [];
  const ALLOYS = (window.__ALLOYS__ && window.__ALLOYS__.alloys) || [];
  const CLAMP = window.__CLAMP_MODEL__;
  const LOGIC = window.__STL_LOGIC__;

  /* Legierung der Seite (Preset-Liste, ggf. Stammdaten der Organisation).
     Vorbelegt mit der Legierung des Projekts, sonst der erste Eintrag. */
  function currentAlloy() {
    const id = document.getElementById('alloy-select').value;
    return ALLOYS.find(a => a.id === id) || null;
  }
  const num = (x, def) => { const v = Number(x); return isFinite(v) && v > 0 ? v : def; };
  /* Feststoffdichte [kg/m³] für die Massen — die Flüssigdichte (density) des
     Presets rechnet dagegen im Dashboard die Schmelzevolumina. */
  function getDensity() { const a = currentAlloy(); return a ? num(a.fields.densitySolid, 2700) : 2700; }
  /* Schwindmaß [%]: Vorgabe des Legierungs-Presets, bis es von Hand
     überschrieben wird (bauteilspezifisch). */
  let shrinkLinked = true;
  function alloyShrink() { const a = currentAlloy(); return a ? num(a.fields.shrink, 0) : 0; }
  /* Ohne eigene Klemme: pruefeEingaben() lässt nur zu, was in der Domäne
     liegt (0…5 %). Vorher stand hier nur die Untergrenze — 50 % Schwindmaß
     ergaben klaglos den Volumenfaktor 3,375. */
  function getShrink() { return parseFloat(document.getElementById('shrink-input').value); }
  function setShrinkFromAlloy() {
    document.getElementById('shrink-input').value = alloyShrink();
    shrinkLinked = true;
  }
  function onToolScale() { return document.getElementById('shrink-toggle').checked; }
  /* Werkzeug (Kavität) und kaltes Bauteil unterscheiden sich linear um s.
     Der Schalter sagt, was die STL-Dateien zeigen; daraus folgen beide
     Richtungen: Volumen/Massen gelten für das Bauteil, Flächen für die
     Kavität. */
  function volumeFactor() { return onToolScale() ? LOGIC.shrinkVolumeFactor(getShrink()) : 1; }
  function areaFactor() { return onToolScale() ? 1 : LOGIC.shrinkAreaFactor(getShrink()); }
  /* Kaltes Bauteilvolumen [mm³] und Kavitätsfläche [mm²] aus den STL-Werten. */
  function partVolume(v) { return v / volumeFactor(); }
  function cavityArea(a) { return a * areaFactor(); }

  function fillAlloySelect() {
    const sel = document.getElementById('alloy-select');
    if (!ALLOYS.length) { sel.innerHTML = '<option value="">– keine Presets –</option>'; sel.disabled = true; return; }
    const D = window.__PROJECT__ ? window.__PROJECT__.derived() : null;
    const pre = D && D.alloy ? D.alloy.id : null;
    sel.innerHTML = ALLOYS.map(a =>
      `<option value="${a.id}"${a.id === pre ? ' selected' : ''}>${escapeHtml(a.name)}</option>`).join('');
    if (!pre) sel.selectedIndex = 0;
  }

  /* Zeile unter der Kopfzeile: was aus der Legierung in die Massen eingeht. */
  const de4 = (x) => x.toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  function renderAlloyInfo() {
    const el = document.getElementById('alloy-info');
    const inp = document.getElementById('shrink-input');
    const a = currentAlloy();
    inp.classList.toggle('linked', shrinkLinked && !!a);
    inp.title = shrinkLinked && a
      ? 'Aus dem Legierungs-Preset ' + a.name + '. Eingabe von Hand löst die Vorbelegung.'
      : 'Von Hand gesetzt (bauteilspezifisch).';
    const s = getShrink(), vf = volumeFactor(), af = areaFactor();
    const dens = a
      ? 'Dichte (fest) <strong>' + fmt(getDensity()) + ' kg/m³</strong>'
      : 'Keine Legierungs-Presets geladen, Dichte (fest) <strong>2.700 kg/m³</strong>';
    const src = !a ? ''
      : shrinkLinked ? ' (aus dem Preset)'
      : ' (von Hand; Preset: ' + fmt(alloyShrink()) + ' % <a href="#" id="shrink-reset">zurücksetzen</a>)';
    const conv = s <= 0
      ? ' · ohne Schwindung: Flächen und Volumen wie geladen'
      : onToolScale()
        ? ' · Modelle auf Werkzeugmaß: Flächen wie geladen, Bauteilvolumen = Volumen / ' + de4(vf)
          + ' (−' + fmt((1 - 1 / vf) * 100) + ' %)'
        : ' · Modelle als fertiges Bauteil: Volumen wie geladen, Kavitätsflächen = Flächen × '
          + de4(af) + ' (+' + fmt((af - 1) * 100) + ' %)';
    el.innerHTML = dens + ' · Schwindmaß ' + fmt(s) + ' %' + src + conv
      + (window.__ALLOYS__ && window.__ALLOYS__.source === 'org' ? ' · Stammdaten der Organisation' : '');
    const rst = document.getElementById('shrink-reset');
    if (rst) rst.addEventListener('click', (e) => { e.preventDefault(); setShrinkFromAlloy(); renderAll(); });
  }

  /* Legierung/Schwindmaß wirken auf Massen (Tabelle) und Flächen (Tabelle,
     Maschinentabelle, Übernahme). */
  let letzterGueltigerStand = false;
  /* Hüllt ein Neuzeichnen in die Prüfung — dieselbe Sperre, kleinerer Umfang. */
  function pruefeGefolgtVon(fn) {
    return () => {
      const gueltig = pruefeEingaben();
      if (!gueltig && letzterGueltigerStand) return;
      letzterGueltigerStand = gueltig;
      fn();
    };
  }
  function renderAll() {
    /* Erst prüfen, dann rechnen. Beim Tippen ist ein Wert kurzzeitig
       ungültig — dann bleibt der letzte gültige Stand abgeblendet stehen. */
    const gueltig = pruefeEingaben();
    if (!gueltig && letzterGueltigerStand) return;
    letzterGueltigerStand = gueltig;
    renderTable(); renderMachines(); renderAlloyInfo();
  }

  /* Seitenschieber-Zuschlag A_S·tan(α) in mm² — Winkel auf [0, 89°] begrenzt,
     Rechnung in stl-logic.js. */
  /* Rohwerte der Schieberangabe — sie gehören mit in den gespeicherten
     Abschnitt, sonst lässt sich die Einstellung nicht wiederherstellen. */
  /* `|| 1.3` bzw. `|| 600` machten aus einer getippten 0 still den
     Standardwert — die Rechnung lief mit einer Zahl weiter, die niemand
     eingegeben hatte. Eine unbrauchbare Eingabe liefert jetzt NaN, und die
     Seite sagt das. */
  /* Die Grenzen stehen in shared/felddomaene.js, nicht im Markup und nicht
     verstreut im Code. Vorher gab es drei verschiedene Arten, damit umzugehen:
     numInput lieferte NaN, coreInputs klemmte mit Math.min/max, und getShrink
     kannte nur die Untergrenze — das Schwindmaß von 50 % (HTML sagte max=5)
     ging als Volumenfaktor 3,375 durch. */
  const DOM = window.__DOMAENE__;
  const FELD_ID = {
    shrink: 'shrink-input', ptarget: 'ptarget-input', safety: 'safety-input',
    coreArea: 'core-area-input', coreAngle: 'core-angle-input'
  };

  function setzeGrenzen() {
    DOM.attribute('sprengflaeche', k => FELD_ID[k]);
  }

  /* Rohwerte der fünf Zahlenfelder. */
  function domaeneWerte() {
    const v = {};
    for (const k in FELD_ID) {
      const el = document.getElementById(FELD_ID[k]);
      if (el) v[k] = parseFloat(el.value);
    }
    return v;
  }

  /* Prüft, markiert und meldet. Rückgabe: true = es darf gerechnet werden. */
  function pruefeEingaben() {
    const v = domaeneWerte();
    const urteil = DOM.pruefe('sprengflaeche', v);
    const schlecht = new Set(urteil.bad);
    for (const k in FELD_ID) {
      const el = document.getElementById(FELD_ID[k]);
      if (el) el.classList.toggle('bad', schlecht.has(k));
    }
    const box = document.getElementById('input-warn');
    if (box) {
      box.textContent = urteil.ok ? '' : 'Unzulässige Eingaben: ' + urteil.msgs.join(' · ')
        + '. Es wird erst wieder gerechnet, wenn sie im zulässigen Bereich liegen.';
      box.classList.toggle('hidden', urteil.ok);
    }
    document.body.classList.toggle('inputs-invalid', !urteil.ok);
    return urteil.ok;
  }

  function numInput(id) { return parseFloat(document.getElementById(id).value); }
  function safetyInput() { return numInput('safety-input'); }
  function ptargetInput() { return numInput('ptarget-input'); }

  function coreInputs() {
    return {
      areaS: numInput('core-area-input'),
      deg: numInput('core-angle-input')
    };
  }
  function getCoreAdd() {
    const c = coreInputs();
    return LOGIC.sideCoreArea(c.areaS, c.deg);
  }

  function renderTable() {
    const table = document.getElementById('result-table');
    const empty = document.getElementById('table-empty');
    table.hidden = models.length === 0;
    empty.hidden = models.length > 0;
    document.getElementById('proj-col-head').textContent = 'Proj. Fläche (' + dir + ')';
    if (!models.length) return;

    const density = getDensity();
    let totV = 0, totA = 0;
    document.getElementById('result-body').innerHTML = models.map((m, i) => {
      const p = getProjection(m, dir);
      const vol = partVolume(m.volume);
      totV += vol; totA += cavityArea(m.area);
      const opts = '<option value="">– wählen –</option>' + LOGIC.ROLES.map(([key, label]) =>
        `<option value="${key}"${m.role === key ? ' selected' : ''}>${label}</option>`).join('');
      return `<tr>
        <td class="name" title="${escapeHtml(m.name)}"><span class="dot" style="background:var(${PAL.cssName(farbeVon(m))})"></span>${escapeHtml(m.name)}</td>
        <td style="text-align:left"><select class="role-sel" data-idx="${i}" aria-label="Zuordnung für ${escapeHtml(m.name)}">${opts}</select></td>
        <td>${fmt(vol)} mm³ <span class="sub">(${fmt(vol / 1000)} cm³)</span></td>
        <td>${fmt(LOGIC.massKg(vol, density))} kg</td>
        <td>${fmt(cavityArea(m.area))} mm²</td>
        <td>${fmt(cavityArea(p.area))} mm²</td>
        <td><button class="remove-btn" data-idx="${i}" title="Entfernen" aria-label="${escapeHtml(m.name)} entfernen">✕</button></td>
      </tr>`;
    }).join('');
    const un = unionSilhouette();
    document.getElementById('result-foot').innerHTML = `<tr>
      <td class="name">Summe (${models.length} ${models.length === 1 ? 'Datei' : 'Dateien'})</td>
      <td></td>
      <td>${fmt(totV)} mm³ <span class="sub">(${fmt(totV / 1000)} cm³)</span></td>
      <td>${fmt(LOGIC.massKg(totV, density))} kg</td>
      <td>${fmt(totA)} mm²</td>
      <td>${fmt(un ? cavityArea(un.area) : 0)} mm² <span class="sub">(vereinigt)</span></td>
      <td></td>
    </tr>`;
  }

  /* ── Max. Nachdruck je Maschinen-Preset ────────────────────── */

  function renderMachines() {
    const table = document.getElementById('machine-table');
    const empty = document.getElementById('machine-empty');
    const info = document.getElementById('machine-info');
    const a = AXES[dir];
    const cog = unionSilhouette();
    const coreAdd = getCoreAdd();
    const projA = cog ? cavityArea(cog.area) : 0;
    const totP = projA + coreAdd;
    const S = safetyInput(), pTarget = ptargetInput();
    const has = totP > 0 && cog && MACHINES.length > 0 && isFinite(S) && isFinite(pTarget);
    table.hidden = !has;
    empty.hidden = has;
    if (!has) { info.textContent = ''; return; }

    const missing = LOGIC.missingRoles(models);
    const ready = missing.length === 0;
    info.innerHTML = 'Sprengfläche A = vereinigte proj. Fläche (' + dir + ')' +
      (coreAdd > 0
        ? ' ' + fmt(projA) + ' mm² + Seitenschieber A<sub>S</sub>·tan α ' + fmt(coreAdd) + ' mm² = <strong>' + fmt(totP) + ' mm²</strong>'
        : ' = <strong>' + fmt(totP) + ' mm²</strong>') +
      ' · Außermittigkeit e = Schwerpunkt vom Ursprung: <strong>' +
      a.uName + '</strong> ' + fmt(cog.cu) + ' mm · <strong>' + a.vName + '</strong> ' + fmt(cog.cv) + ' mm' +
      (ready
        ? ' · Dashboard-Übernahme bereit, alle vier Zuordnungen vorhanden.'
        : ' · Für die Dashboard-Übernahme fehlt die Zuordnung: <strong>' + missing.join(', ') + '</strong>.');

    const { rows, pref } = LOGIC.machineRows(MACHINES, CLAMP, {
      areaMm2: totP, ex: Math.abs(cog.cu), ey: Math.abs(cog.cv), safety: S, pTarget,
    });

    document.getElementById('machine-body').innerHTML = rows.map((r) => {
      const cls = r === pref ? ' class="row-pref"' : (!r.ok ? ' class="row-toosmall"' : '');
      const badge = r === pref
        ? '<span class="badge badge-pref" title="Kleinste Maschine, die den metallseitigen Nachdruck von ' + fmt(pTarget) + ' bar erreicht">empfohlen</span>'
        : (!r.ok ? '<span class="badge badge-toosmall" title="Erreicht den metallseitigen Nachdruck von ' + fmt(pTarget) + ' bar nicht">zu klein</span>' : '');
      return `<tr${cls}>
        <td class="name">${escapeHtml(r.mc.name)}${badge}</td>
        <td>${fmt(r.f.force)} kN</td>
        <td>${fmt(r.p0)} bar</td>
        <td>${fmt(r.pS)} bar</td>
        <td>${fmt(r.pK)} bar <span class="sub">(k ${r.k.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })})</span>${r.lift ? ' <span class="warn-lift" title="Schwerpunkt zu weit außermittig: die Form klafft an der gegenüberliegenden Ecke">⚠ Abheben</span>' : ''}</td>
        <td><button class="dash-btn" data-id="${escapeHtml(r.mc.id)}"${ready ? '' : ' disabled'} title="${ready
          ? 'Werte übernehmen und Dashboard öffnen'
          : 'Erst jeder Datei eine Zuordnung geben. Es fehlt: ' + missing.join(', ')}">→ Dashboard</button></td>
      </tr>`;
    }).join('');
  }

  /* ── Übernahme ins Dashboard ───────────────────────────────── */
  /* Schlüssel aus stl-logic.js (handoffValues); geschrieben wird in den
     design-Abschnitt des Projekts — nicht betroffene Eingaben und die
     Schusskurve bleiben erhalten. */
  function openDashboard(mc) {
    const cog = unionSilhouette();
    const totP = (cog ? cavityArea(cog.area) : 0) + getCoreAdd();
    if (!(totP > 0) || !cog) return;
    const S = safetyInput(), pTarget = ptargetInput();
    if (!isFinite(S) || !isFinite(pTarget)) {
      alert('Sicherheitsfaktor und Nachdruck müssen gültige Zahlen sein.');
      return;
    }
    const alloy = currentAlloy();
    const sums = LOGIC.roleSums(models, getDensity(), volumeFactor());
    const kg = (x) => Math.round(x * 1000) / 1000;

    const values = LOGIC.handoffValues({
      part: kg(sums.part),
      runner: kg(sums.runner),
      overflow: kg(sums.overflow),
      biscuit: kg(sums.biscuit),
      area: Number((totP * 1e-6).toPrecision(4)),
      eccX: Math.round(Math.abs(cog.cu) * 10) / 10,
      eccY: Math.round(Math.abs(cog.cv) * 10) / 10,
      safety: S,
      psel: pTarget,
    }, mc.fields, alloy ? alloy.fields : null);
    /* Geometrie-Abschnitt des Projekts: was analysiert wurde, mit Ergebnis —
       die Netze selbst bleiben in den Dateien (zu groß für den Speicher). */
    if (!window.__PROJECT__.current()) { alert('Kein Projekt aktiv. Bitte zuerst anmelden.'); return; }
    window.__PROJECT__.setSection('geometry', {
      alloy: alloy ? alloy.id : null, density: getDensity(), toolScale: onToolScale(),
      shrink: getShrink(), shrinkFromAlloy: shrinkLinked, safety: S, psel: pTarget,
      coreAdd: getCoreAdd(), core: coreInputs(),
      machine: mc.id, areaTotal: totP, cog: { u: cog.cu, v: cog.cv },
      files: models.map(m => ({ name: m.name, role: m.role, volume: partVolume(m.volume), area: cavityArea(m.area),
        proj: { X: cavityArea(getProjection(m, 'X').area), Y: cavityArea(getProjection(m, 'Y').area),
          Z: cavityArea(getProjection(m, 'Z').area) } })),
      analysedAt: new Date().toISOString()
    });
    window.__PROJECT__.mergeDesign(values, mc.id, alloy ? alloy.id : null);
    window.location.href = '/tools/auslegung/';
  }

  /* ── Projektionsbild kopieren ──────────────────────────────── */
  /* Verhalten und Optik wie die PNG-Buttons der Dashboard-Karten
     (tools/auslegung/js/ui/export.js): in die Zwischenablage kopieren, ohne
     Clipboard-API oder bei verweigerter Berechtigung als Download —
     Quittung ist in beiden Fällen das Häkchen. Die Zeichenfläche ist
     transparent, daher vor dem Export auf die Fläche des Blatts (surface
     des Farbschemas) zusammensetzen. */
  const copyBtn = document.getElementById('copy-img-btn');
  const CHECK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';

  function flashCopied() {
    const old = copyBtn.innerHTML;
    copyBtn.classList.add('copied');
    copyBtn.innerHTML = CHECK_SVG;
    setTimeout(() => { copyBtn.classList.remove('copied'); copyBtn.innerHTML = old; }, 1400);
  }

  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  function copyProjectionImage() {
    const off = document.createElement('canvas');
    off.width = canvas.width;
    off.height = canvas.height;
    const ctx = off.getContext('2d');
    ctx.fillStyle = PAL.surface;
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(canvas, 0, 0);
    off.toBlob((blob) => {
      if (!blob) return;
      const name = 'DieLogic_Sprengflaeche_' + dir + '.png';
      if (navigator.clipboard && window.ClipboardItem)
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(flashCopied, () => { downloadBlob(blob, name); flashCopied(); });
      else { downloadBlob(blob, name); flashCopied(); }
    }, 'image/png');
  }

  function update() {
    const a = AXES[dir];
    document.getElementById('proj-label').innerHTML =
      'Formöffnungsrichtung <strong>' + dir + '</strong> · Silhouette in der ' + a.uName + '–' + a.vName + '-Ebene';
    const cog = unionSilhouette();
    document.getElementById('cog-label').innerHTML = cog
      ? 'Schwerpunkt S vom Ursprung: <strong>' + a.uName + '</strong> ' + fmt(cog.cu) +
        ' mm · <strong>' + a.vName + '</strong> ' + fmt(cog.cv) + ' mm'
      : '';
    document.getElementById('canvas-empty').hidden = models.length > 0;
    copyBtn.disabled = models.length === 0;
    /* Auch hier über die Sperre: update() lief bisher an ihr vorbei, und
       genau dieser Weg wird beim Laden eines Projekts gegangen. */
    const gueltig = pruefeEingaben();
    if (gueltig || !letzterGueltigerStand) {
      letzterGueltigerStand = gueltig;
      renderTable();
      renderMachines();
      renderAlloyInfo();
    }
    draw();
  }

  /* ── Ereignisse ────────────────────────────────────────────── */

  document.getElementById('upload-btn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) addFiles([...fileInput.files]);
    fileInput.value = '';
  });

  document.getElementById('dir-seg').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-dir]');
    if (!btn) return;
    dir = btn.dataset.dir;
    for (const b of e.currentTarget.querySelectorAll('button')) b.classList.toggle('active', b === btn);
    update();
  });

  document.getElementById('result-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.remove-btn');
    if (!btn) return;
    models.splice(Number(btn.dataset.idx), 1);
    invalidateUnion();
    update();
  });

  document.getElementById('result-body').addEventListener('change', (e) => {
    const sel = e.target.closest('.role-sel');
    if (!sel) return;
    const m = models[Number(sel.dataset.idx)];
    if (m) {
      m.role = sel.value;
      /* Die Farbe hängt an der Rolle: Punkt in der Zeile und Bild folgen. */
      const dot = sel.closest('tr').querySelector('.dot');
      if (dot) dot.style.background = 'var(' + PAL.cssName(farbeVon(m)) + ')';
      draw();
    }
    pruefeGefolgtVon(renderMachines)();
  });

  document.getElementById('machine-body').addEventListener('click', (e) => {
    const btn = e.target.closest('.dash-btn');
    if (!btn || btn.disabled) return;
    const mc = MACHINES.find((m) => m.id === btn.dataset.id);
    if (mc) openDashboard(mc);
  });

  const card = document.getElementById('canvas-card');
  for (const ev of ['dragenter', 'dragover']) {
    card.addEventListener(ev, (e) => { e.preventDefault(); card.classList.add('dragover'); });
  }
  card.addEventListener('dragleave', () => card.classList.remove('dragover'));
  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('dragover');
    const files = [...e.dataTransfer.files].filter(f => /\.(stl|glb)$/i.test(f.name));
    if (files.length) addFiles(files);
  });

  copyBtn.addEventListener('click', copyProjectionImage);
  /* Über pruefeGefolgtVon(): sonst umgingen genau die vier Zahlenfelder die
     Prüfung, für die sie da ist. */
  for (const id of ['safety-input', 'ptarget-input', 'core-area-input', 'core-angle-input'])
    document.getElementById(id).addEventListener('input', pruefeGefolgtVon(renderMachines));
  document.getElementById('alloy-select').addEventListener('change', () => {
    if (shrinkLinked) setShrinkFromAlloy();
    renderAll();
  });
  document.getElementById('shrink-input').addEventListener('input', () => { shrinkLinked = false; renderAll(); });
  document.getElementById('shrink-toggle').addEventListener('change', renderAll);

  window.addEventListener('resize', draw);
  /* Anderes Farbschema: das Bild neu malen. Die Punkte der Tabelle stehen
     als CSS-Token und folgen von selbst. */
  document.addEventListener('dielogic:scheme', draw);

  /* ── Beispiel als Startbelegung ──────────────────────────────
     Die Gusstraube der Beispielform aus dem 3D-Studio (Ölwanne mit Anguss,
     Überläufen und Pressrest, scripts/3d-studio/build-gusstraube.mjs), die
     Rollen stehen in den Knotennamen: die Dashboard-Übernahme geht sofort. */
  async function loadDefaults() {
    try {
      const res = await fetch('/examples/gusstraube.glb');
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      addFiles([{ name: 'gusstraube.glb', arrayBuffer: async () => buf }]);
    } catch (e) { /* z. B. file:// — dann ohne Beispiel starten */ }
  }

  /* ── Gespeicherten Stand zurücklesen ─────────────────────────
     Die Seite schrieb ihren geometry-Abschnitt, las ihn aber nie zurück:
     jeder Besuch startete mit den Beispieldateien und den Standardwerten,
     und „Ins Dashboard übernehmen" überschrieb damit eine vorhandene,
     mühsam eingestellte Massenbilanz. Die Netze selbst stehen nicht im
     Abschnitt (zu groß) — die Einstellungen und die Herkunft schon. */
  function restoreGeometry() {
    const g = window.__PROJECT__ && window.__PROJECT__.getSection('geometry');
    if (!g) return;
    const setNum = (id, v) => { if (isFinite(v)) document.getElementById(id).value = v; };
    if (g.alloy) {
      const sel = document.getElementById('alloy-select');
      if ([...sel.options].some(o => o.value === g.alloy)) sel.value = g.alloy;
    }
    if (isFinite(g.shrink)) {
      document.getElementById('shrink-input').value = g.shrink;
      shrinkLinked = !!g.shrinkFromAlloy;
    }
    if (typeof g.toolScale === 'boolean') document.getElementById('shrink-toggle').checked = g.toolScale;
    setNum('safety-input', g.safety);
    setNum('ptarget-input', g.psel);
    if (g.core && isFinite(g.core.areaS)) setNum('core-area-input', g.core.areaS);
    if (g.core && isFinite(g.core.deg)) setNum('core-angle-input', g.core.deg);

    const note = document.getElementById('restored-note');
    if (!note) return;
    const when = g.analysedAt ? new Date(g.analysedAt) : null;
    const files = Array.isArray(g.files) ? g.files.map(f => f.name).filter(Boolean) : [];
    note.innerHTML = 'Einstellungen aus der letzten Analyse dieses Projekts übernommen'
      + (when && !isNaN(when) ? ' (' + when.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) + ')' : '')
      + (files.length ? '. Damals geladen: ' + files.map(escapeHtml).join(', ') + '. Die Netze müssen erneut geladen werden.' : '.');
    note.classList.remove('hidden');
  }


  setzeGrenzen();
  fillAlloySelect();
  setShrinkFromAlloy();
  restoreGeometry();
  renderAlloyInfo();
  update();
  loadDefaults();
})();
