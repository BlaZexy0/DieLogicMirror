/* DieLogic – web/tools/sprengflaeche/stl-app.js
   Seiten-Code der STL-Analyse: Dateien laden, Projektion zeichnen, Tabellen
   rendern, Ereignisse. Rechenlogik liegt in stl-math.js (Netz-Kennwerte),
   stl-logic.js (Zuordnung/Maschinentabelle), shared/clampmodel.js und
   stl-logic.js (handoffValues) — dieses Script ist reine Ansicht und Verdrahtung. */
(function () {
  'use strict';

  /* Achszuordnung der Projektion: entlang `dir` blicken, (u,v) spannen die Bildebene auf */
  const AXES = {
    X: { u: 1, v: 2, uName: 'Y', vName: 'Z' },
    Y: { u: 0, v: 2, uName: 'X', vName: 'Z' },
    Z: { u: 0, v: 1, uName: 'X', vName: 'Y' },
  };
  const PAL = window.__PALETTE__;
  const COLORS = [PAL.primary, PAL.catGreen, PAL.catOrange, PAL.catPurple, PAL.warn, PAL.accent, PAL.gold, PAL.catSlate];
  const PAD = 36;

  const models = [];      // { name, tris, color, volume, area, role, proj: {X,Y,Z} }
  let dir = 'Z';
  let colorIdx = 0;

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

  async function addFiles(fileList) {
    const errors = [];
    for (const file of fileList) {
      try {
        const tris = parseSTL(await file.arrayBuffer());
        models.push({
          name: file.name,
          tris,
          color: COLORS[colorIdx++ % COLORS.length],
          volume: meshVolume(tris),
          area: meshArea(tris),
          role: file.role || '',
          proj: {},
        });
      } catch (e) {
        errors.push(file.name + ': ' + e.message);
      }
    }
    statusEl.textContent = errors.length ? 'Nicht lesbar — ' + errors.join(' · ') : '';
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

    /* dezentes Raster */
    ctx.strokeStyle = 'rgba(0,39,51,0.06)';
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
      ctx.fillStyle = m.color;
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
    ctx.strokeStyle = PAL.dark;
    ctx.fillStyle = PAL.dark;
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
      ctx.fillStyle = PAL.warn;
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

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

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
  function getShrink() { return Math.max(parseFloat(document.getElementById('shrink-input').value) || 0, 0); }
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
      ? 'Aus dem Legierungs-Preset ' + a.name + ' — Eingabe von Hand löst die Vorbelegung.'
      : 'Von Hand gesetzt (bauteilspezifisch).';
    const s = getShrink(), vf = volumeFactor(), af = areaFactor();
    const dens = a
      ? 'Dichte (fest) <strong>' + fmt(getDensity()) + ' kg/m³</strong>'
      : 'Keine Legierungs-Presets geladen — Dichte (fest) <strong>2.700 kg/m³</strong>';
    const src = !a ? ''
      : shrinkLinked ? ' (aus dem Preset)'
      : ' (von Hand — Preset: ' + fmt(alloyShrink()) + ' % <a href="#" id="shrink-reset">zurücksetzen</a>)';
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
  function renderAll() { renderTable(); renderMachines(); renderAlloyInfo(); }

  /* Seitenschieber-Zuschlag A_S·tan(α) in mm² — Winkel auf [0, 89°] begrenzt,
     Rechnung in stl-logic.js. */
  function getCoreAdd() {
    const areaS = Math.max(parseFloat(document.getElementById('core-area-input').value) || 0, 0);
    const deg = Math.min(Math.max(parseFloat(document.getElementById('core-angle-input').value) || 0, 0), 89);
    return LOGIC.sideCoreArea(areaS, deg);
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
        <td class="name" title="${escapeHtml(m.name)}"><span class="dot" style="background:${m.color}"></span>${escapeHtml(m.name)}</td>
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
    const S = Math.max(parseFloat(document.getElementById('safety-input').value) || 1.3, 1);
    const pTarget = Math.max(parseFloat(document.getElementById('ptarget-input').value) || 600, 1);
    const has = totP > 0 && cog && MACHINES.length > 0;
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
        ? ' · Dashboard-Übernahme bereit — alle vier Zuordnungen vorhanden.'
        : ' · Für die Dashboard-Übernahme fehlt die Zuordnung: <strong>' + missing.join(', ') + '</strong>.');

    const { rows, pref } = LOGIC.machineRows(MACHINES, CLAMP, {
      areaMm2: totP, ex: Math.abs(cog.cu), ey: Math.abs(cog.cv), safety: S, pTarget,
    });

    document.getElementById('machine-body').innerHTML = rows.map((r) => {
      const cls = r === pref ? ' class="row-pref"' : (!r.ok ? ' class="row-toosmall"' : '');
      const badge = r === pref
        ? '<span class="badge badge-pref" title="Kleinste Maschine, die den Auslegungsdruck von ' + fmt(pTarget) + ' bar erreicht">empfohlen</span>'
        : (!r.ok ? '<span class="badge badge-toosmall" title="Erreicht den Auslegungsdruck von ' + fmt(pTarget) + ' bar nicht">zu klein</span>' : '');
      return `<tr${cls}>
        <td class="name">${escapeHtml(r.mc.name)}${badge}</td>
        <td>${fmt(r.f.force)} kN</td>
        <td>${fmt(r.p0)} bar</td>
        <td>${fmt(r.pS)} bar</td>
        <td>${fmt(r.pK)} bar <span class="sub">(k ${r.k.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 })})</span>${r.lift ? ' <span class="warn-lift" title="Schwerpunkt zu weit außermittig — die Form klafft an der gegenüberliegenden Ecke">⚠ Abheben</span>' : ''}</td>
        <td><button class="dash-btn" data-id="${escapeHtml(r.mc.id)}"${ready ? '' : ' disabled'} title="${ready
          ? 'Werte übernehmen und Dashboard öffnen'
          : 'Erst jeder Datei eine Zuordnung geben — es fehlt: ' + missing.join(', ')}">→ Dashboard</button></td>
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
    const S = Math.max(parseFloat(document.getElementById('safety-input').value) || 1.3, 1);
    const pTarget = Math.max(parseFloat(document.getElementById('ptarget-input').value) || 600, 1);
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
    window.__PROJECT__.setSection('geometry', {
      alloy: alloy ? alloy.id : null, density: getDensity(), toolScale: onToolScale(),
      shrink: getShrink(), shrinkFromAlloy: shrinkLinked, safety: S, psel: pTarget, coreAdd: getCoreAdd(),
      machine: mc.id, areaTotal: totP, cog: { u: cog.cu, v: cog.cv },
      files: models.map(m => ({ name: m.name, role: m.role, volume: partVolume(m.volume), area: cavityArea(m.area),
        proj: { X: cavityArea(getProjection(m, 'X').area), Y: cavityArea(getProjection(m, 'Y').area),
          Z: cavityArea(getProjection(m, 'Z').area) } })),
      analysedAt: new Date().toISOString()
    });
    if (!window.__PROJECT__.current()) { alert('Kein Projekt aktiv — bitte zuerst anmelden.'); return; }
    window.__PROJECT__.mergeDesign(values, mc.id, alloy ? alloy.id : null);
    window.location.href = '/tools/auslegung/';
  }

  /* ── Projektionsbild kopieren ──────────────────────────────── */
  /* Verhalten und Optik wie die PNG-Buttons der Dashboard-Karten
     (tools/auslegung/js/ui/export.js): in die Zwischenablage kopieren, ohne
     Clipboard-API oder bei verweigerter Berechtigung als Download —
     Quittung ist in beiden Fällen das Häkchen. Die Zeichenfläche ist
     transparent, daher vor dem Export auf weißen Grund zusammensetzen. */
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
      'Projektion entlang <strong>' + dir + '</strong> auf die ' + a.uName + '–' + a.vName + '-Ebene';
    const cog = unionSilhouette();
    document.getElementById('cog-label').innerHTML = cog
      ? 'Schwerpunkt S vom Ursprung: <strong>' + a.uName + '</strong> ' + fmt(cog.cu) +
        ' mm · <strong>' + a.vName + '</strong> ' + fmt(cog.cv) + ' mm'
      : '';
    document.getElementById('canvas-empty').hidden = models.length > 0;
    copyBtn.disabled = models.length === 0;
    renderTable();
    renderMachines();
    renderAlloyInfo();
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
    if (m) m.role = sel.value;
    renderMachines();
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
    const files = [...e.dataTransfer.files].filter(f => /\.stl$/i.test(f.name));
    if (files.length) addFiles(files);
  });

  copyBtn.addEventListener('click', copyProjectionImage);
  document.getElementById('safety-input').addEventListener('input', renderMachines);
  document.getElementById('ptarget-input').addEventListener('input', renderMachines);
  document.getElementById('core-area-input').addEventListener('input', renderMachines);
  document.getElementById('core-angle-input').addEventListener('input', renderMachines);
  document.getElementById('alloy-select').addEventListener('change', () => {
    if (shrinkLinked) setShrinkFromAlloy();
    renderAll();
  });
  document.getElementById('shrink-input').addEventListener('input', () => { shrinkLinked = false; renderAll(); });
  document.getElementById('shrink-toggle').addEventListener('change', renderAll);

  window.addEventListener('resize', draw);

  /* ── Beispieldateien aus assets/ als Startbelegung ───────────
     Minimaler Gießlauf mit fertiger Zuordnung: Pressrest — Anguss —
     Bauteil — Überläufe, damit die Dashboard-Übernahme sofort geht. */
  async function loadDefaults() {
    const defaults = [
      ['/examples/biscuit.stl',  'biscuit'],
      ['/examples/runner.stl',   'runner'],
      ['/examples/part.stl',     'part'],
      ['/examples/overflow.stl', 'overflow'],
    ];
    const files = [];
    for (const [url, role] of defaults) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        files.push({ name: url.split('/').pop(), role, arrayBuffer: async () => buf });
      } catch (e) { /* z. B. file:// — dann ohne Beispieldateien starten */ }
    }
    if (files.length) addFiles(files);
  }

  fillAlloySelect();
  setShrinkFromAlloy();
  renderAlloyInfo();
  update();
  loadDefaults();
})();
