/* KPI-Kacheln oberhalb der Diagramme, gruppiert nach Themen:
   Füllkammer/Massen · Zuhaltung/Maschine · Schusskurve/Anschnitt ·
   Thermik/Qualität. Alle Werte sind dieselben Formeln wie in den Diagrammen.

   Darstellung: Kacheln mit Zielband bekommen eine Bullet-Leiste (Track =
   plausibler Bereich, Band = Ziel, Marker = Ist), Kacheln mit Limit ein
   Auslastungs-Meter (Füllung trägt die Bewertung: ok → knapp ab 80 % →
   verletzt über 100 %). Jede Bewertung trägt ein Text-Tag (✓/!/✕) — nie
   Farbe allein. „Keine Daten" ist ein neutraler Stil, keine Warnung.
   Eine Prüfliste (#checkbar) fasst alle bewerteten Kacheln zusammen. */

import { fmt } from '../core/format.js';
import { total, afterGate, pistonArea, travel, injForceEff } from '../core/physics.js';
import { pqCore } from '../charts/pq2.js';

/* Während eines Renders eingesammelte Prüfungen für die Prüfliste. */
let CHECKS = [];

const ICON = { ok: '✓', warn: '!', bad: '✕', nodata: '' };

function slug(name) {
  return 'kpi-' + name.toLowerCase().replace(/[^a-zäöüß0-9]+/g, '-');
}

/* Eine Kachel. status: 'info' (reine Zahl) · 'ok' · 'warn' · 'bad' ·
   'nodata'. tagText ergänzt das Icon (z. B. 'im Band', '+12 %'). barHtml
   ist eine optionale Bullet-/Meter-Leiste unter dem Wert. */
function kpi(label, value, sub, status = 'info', tagText = '', barHtml = '') {
  const id = slug(label);
  if (status === 'ok' || status === 'warn' || status === 'bad')
    CHECKS.push({ name: label, status, id });
  const tagHtml = status !== 'info'
    ? '<span class="tag">' + (ICON[status] ? ICON[status] + ' ' : '') + (tagText || (status === 'nodata' ? 'keine Daten' : '')) + '</span>'
    : '';
  return '<div class="kpi ' + status + '" id="' + id + '">'
    + '<span>' + label + '</span>'
    + '<b>' + value + tagHtml + '</b>'
    + barHtml
    + '<small>' + sub + '</small></div>';
}

function group(title, tiles) {
  return '<div class="kpi-head">' + title + '</div><div class="kpi-grid">' + tiles + '</div>';
}

const clampPct = x => Math.max(0, Math.min(100, x));

/* Bullet: Track über [lo, hi], Zielband [bandLo, bandHi], Marker bei val.
   Nicht-endliche Anteile (z. B. hi == lo bei Null-Eingaben) → 0 %. */
function bullet(lo, hi, bandLo, bandHi, val, lblL, lblM, lblR) {
  const pct = x => { const p = 100 * (x - lo) / (hi - lo); return isFinite(p) ? clampPct(p) : 0; };
  return '<div class="kpi-bullet">'
    + '<span class="band" style="left:' + pct(bandLo) + '%;width:' + (pct(bandHi) - pct(bandLo)) + '%"></span>'
    + '<span class="mark" style="left:' + pct(val) + '%"></span></div>'
    + '<div class="kpi-scale"><span>' + lblL + '</span><span>' + lblM + '</span><span>' + lblR + '</span></div>';
}

/* Meter: Füllung = Auslastung (Ist/Limit), Limit-Marke bei Überschreitung. */
function meter(util) {
  const fill = clampPct(100 * Math.min(util, 1));
  const lim = util > 1 ? clampPct(100 / util) : 100;
  return '<div class="kpi-meter"><span class="fill" style="width:' + fill + '%"></span>'
    + '<span class="limit" style="left:' + lim + '%"></span></div>';
}

/* Bewertung einer Auslastung: verletzt über 100 %, knapp ab 80 %. */
function utilStatus(util) {
  return util > 1 + 1e-9 ? 'bad' : util >= 0.8 ? 'warn' : 'ok';
}
function utilTag(util) {
  return fmt(100 * util) + ' %' + (util > 1 + 1e-9 ? '' : util >= 0.8 ? ' — knapp' : '');
}
/* Tag für Kacheln, deren Wert selbst die Auslastung in % ist —
   die Zahl nicht wiederholen, nur das Urteil. */
function pctTag(util) {
  return util > 1 + 1e-9 ? 'über Limit' : util >= 0.8 ? 'knapp' : '';
}

/* Zielband-Bewertung. */
function bandStatus(x, lo, hi) { return x < lo ? 'bad' : x > hi ? 'bad' : 'ok'; }
function bandTag(x, lo, hi) { return x < lo ? 'unter Band' : x > hi ? 'über Band' : 'im Band'; }

/* Mindestwert-Bewertung (Ist muss über min liegen): Marge als Tag. */
function minStatus(x, min) { return x < min ? 'bad' : x < 1.1 * min ? 'warn' : 'ok'; }
function minTag(x, min) {
  return x < min ? fmt(100 * (1 - x / min)) + ' % unter min'
    : '+' + fmt(100 * (x / min - 1)) + ' %';
}

/* Prüfliste über allen Gruppen. */
function checklistHTML() {
  const rated = CHECKS;
  if (!rated.length) return '';
  const failed = rated.filter(c => c.status === 'bad');
  const tight = rated.filter(c => c.status === 'warn');
  const dots = rated.map(c =>
    '<span class="dot ' + c.status + '" title="' + c.name + '"></span>').join('');
  const links = list => list.map(c =>
    '<button class="ck-link" data-target="' + c.id + '">' + c.name + '</button>').join(' · ');
  let msg = '';
  if (failed.length) msg += '<span class="fails">verletzt: ' + links(failed) + '</span>';
  if (tight.length) msg += '<span class="tights">knapp: ' + links(tight) + '</span>';
  return '<div class="checkbar">'
    + '<span class="verdict">' + (rated.length - failed.length) + ' von ' + rated.length + ' Prüfungen erfüllt</span>'
    + '<span class="dotrow">' + dots + '</span>' + msg + '</div>';
}

function wireChecklist(bar) {
  bar.querySelectorAll('.ck-link').forEach(b => {
    b.onclick = () => {
      const t = document.getElementById(b.dataset.target);
      if (!t) return;
      t.scrollIntoView({ behavior: 'smooth', block: 'center' });
      t.classList.add('flash');
      setTimeout(() => t.classList.remove('flash'), 1200);
    };
  });
}

/* chamberEl: Ziel für die Füllkammer-Gruppe (links neben dem Schema);
   el bekommt die übrigen Gruppen. Ohne chamberEl landet alles in el.
   Die Prüfliste landet in #checkbar, falls vorhanden. */
export function renderKpis(el, v, shot, chamberEl) {
  CHECKS = [];
  const A = pistonArea(v);
  const mdos = total(v) + v.biscuit;
  const Vdos = mdos / v.density;                                   // m³
  const req = window.__CLAMP_MODEL__.forceKN(v.psel, v.area, v.safety, 1);
  const fill = 100e9 * Vdos / (v.length * A);
  const p1 = travel(v.runner, v);
  const p3 = travel(mdos, v);
  const sFill = (1 - fill / 100) * v.length;
  const biscLen = travel(v.biscuit, v);
  const ratioLD = v.length / v.diam;
  const eta = mdos > 0 ? 100 * v.part / mdos : NaN;

  /* Zuhaltung + spezifischer Gießdruck (Rechenkern: shared/clampmodel.js) */
  const kClamp = (v.tieX > 0 && v.tieY > 0)
    ? window.__CLAMP_MODEL__.leverK(v.eccX, v.eccY, v.tieX, v.tieY) : 1;
  const pMaxClamp = window.__CLAMP_MODEL__.pMax(v.force, v.area, v.safety, kClamp);
  const Feff = injForceEff(v);
  const pSpec = Feff * 1e4 / A;

  /* PQ²-Arbeitspunkt (gleiche Rechnung wie im PQ²-Diagramm) */
  /* PQ²-Arbeitspunkt und Hüllkurve: dieselbe Rechnung wie im PQ²-Diagramm (pqCore) */
  const pq = pqCore(v);
  const Qs = pq ? pq.Qs : null, ps = pq ? pq.ps : null;
  const aMPE = (Feff > 0 && v.vmax > 0)
    ? (2 * Math.sqrt(3) / 9) * Feff * 1e3 * v.vmax / 1e6 : null;   // MW
  const pwOp = pq ? pq.ps * 1e5 * pq.Qs / 1e6 : null;                    // MW

  /* Anschnittgeschwindigkeit: bevorzugt aus der Schusskurve (Bauteil gefüllt);
     sonst mit v2 = mittlerer Kolbengeschw. nach Anschnitt (ebenfalls Kurve) */
  const v2 = !shot.error && shot.v2 != null ? shot.v2 : NaN;
  const gvMean = v.gate > 0 ? v2 * A / v.gate : NaN;
  const evPart = !shot.error && shot.events && shot.events[2];
  const gvShot = evPart && evPart.inP && evPart.gv != null ? evPart.gv : null;
  const gvShown = gvShot != null ? gvShot : gvMean;

  /* Zerstäubung: Ist-J aus der Anschnittgeschwindigkeit (Herman/NADCA,
     UPCT Gl. 2.38) — Umkehrung der v_a-Grenze im PQ²-Diagramm, dieselben
     Zoll-Einheiten: J = (v_a/0,0254)^1,71 · (t/25,4) · (ρ·3,6127e-5). */
  const Jist = (isFinite(gvShown) && gvShown > 0 && v.gateTh > 0 && v.density > 0)
    ? Math.pow(gvShown / 0.0254, 1.71) * (v.gateTh / 25.4) * (v.density * 3.6127e-5) : NaN;

  /* Thermik und Qualität */
  const denN = v.Tflow - v.Tdie;
  const tNadca = denN !== 0 ? v.kfill * v.wall * (v.Tcast - v.Tflow + v.Sfrac * v.Zconst) / denN : NaN;
  const Vm = total(v) / v.density;
  const tOp = 1e9 * (afterGate(v) / v.density) / (v2 * A);
  const Areq = tOp > 0 && v.vAirMax > 0 ? Vm / (tOp / 1000) / v.vAirMax * 1e6 : NaN;
  const tErst = v.solK * v.gateTh * v.gateTh;

  const chamberHtml =
    group('Füllkammer und Massenbilanz',
      kpi('Dosiergewicht', fmt(mdos) + ' kg', 'Bauteil + Anguss + Überlauf + Pressrest ' + fmt(v.biscuit) + ' kg')
      + kpi('Dosiervolumen', fmt(Vdos * 1e6) + ' cm³', 'inkl. Pressrest · Flüssigdichte ' + fmt(v.density) + ' kg/m³')
      + kpi('Materialausbeute', fmt(eta) + ' %', 'Bauteil / Dosiergewicht · Rest ist Kreislaufmaterial')
      + kpi('Füllgrad', fmt(fill) + ' %', 'inkl. Pressrest',
        bandStatus(fill, v.fillMin, v.fillMax), bandTag(fill, v.fillMin, v.fillMax),
        bullet(0, 100, v.fillMin, v.fillMax, fill,
          '0 %', 'Ziel ' + fmt(v.fillMin) + '–' + fmt(v.fillMax), '100 %'))
      + kpi('Kammerverhältnis λ', fmt(ratioLD), 'λ = L/D · gewählte Kammer · Ø ' + fmt(v.diam) + ' × L ' + fmt(v.length) + ' mm')
      + kpi('Kammer voll bei', fmt(sFill) + ' mm', 'Füllgrad inkl. Pressrest ' + fmt(fill) + ' %')
      + kpi('Anschnitt erreicht', fmt(p1) + ' mm', 'nur Angussvolumen')
      + kpi('Gesamtschuss gefüllt', fmt(p3) + ' mm', 'inkl. Pressrest · Kammer ' + fmt(v.length) + ' mm',
        p3 > v.length ? 'bad' : 'ok', p3 > v.length ? 'Überlauf' : 'passt')
      + kpi('Pressrest', fmt(biscLen) + ' mm', 'Minimum ' + fmt(v.biscuitMin) + ' mm',
        minStatus(biscLen, v.biscuitMin), minTag(biscLen, v.biscuitMin),
        bullet(0, Math.max(1.6 * v.biscuitMin, 1.15 * biscLen), v.biscuitMin, Math.max(1.6 * v.biscuitMin, 1.15 * biscLen), biscLen,
          '0 mm', 'min ' + fmt(v.biscuitMin), fmt(Math.max(1.6 * v.biscuitMin, 1.15 * biscLen)) + ' mm')));

  const uClamp = v.force > 0 ? req / v.force : NaN;
  const uHold = pMaxClamp > 0 ? v.psel / pMaxClamp : NaN;
  const uPw = (aMPE !== null && pwOp !== null && aMPE > 0) ? pwOp / aMPE : null;

  const restHtml =
    group('Zuhaltung und Maschine',
      (isFinite(uClamp)
        ? kpi('Schließkraft-Auslastung', fmt(100 * uClamp) + ' %',
          fmt(req) + ' von ' + fmt(v.force) + ' kN (' + fmt(req / 10) + ' t) · S = ' + fmt(v.safety) + ' eingerechnet',
          utilStatus(uClamp), pctTag(uClamp), meter(uClamp))
        : kpi('Schließkraft-Auslastung', '—', 'braucht Maschinenkraft', 'nodata'))
      + (isFinite(uHold)
        ? kpi('Nachdruck-Auslastung', fmt(100 * uHold) + ' %',
          'Auslegung ' + fmt(v.psel) + ' von max. ' + fmt(pMaxClamp) + ' bar (Zuhaltung · e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · k = ' + fmt(kClamp) + ')',
          utilStatus(uHold), pctTag(uHold), meter(uHold))
        : kpi('Nachdruck-Auslastung', '—', 'Zuhaltungsmodell unvollständig', 'nodata'))
      + kpi('Spez. Gießdruck', fmt(pSpec) + ' bar', 'Gießkraft ' + fmt(Feff) + ' kN bei ' + fmt(v.pAccOp) + ' bar / Kolbenfläche',
        bandStatus(pSpec, v.psel, pMaxClamp), bandTag(pSpec, v.psel, pMaxClamp),
        bullet(0, 1.1 * Math.max(pSpec, pMaxClamp), v.psel, pMaxClamp, pSpec,
          '0', 'Band ' + fmt(Math.round(v.psel)) + '–' + fmt(Math.round(pMaxClamp)), fmt(Math.round(1.1 * Math.max(pSpec, pMaxClamp))) + ' bar'))
      + (uPw !== null
        ? kpi('PQ²-Leistungsauslastung', fmt(100 * uPw) + ' %',
          'Arbeitspunkt ' + fmt(pwOp) + ' von ' + fmt(aMPE) + ' MW Hüllkurve (2√3/9)·F_G·v_dry',
          utilStatus(uPw), pctTag(uPw), meter(uPw))
        : kpi('PQ²-Leistungsauslastung', '—', 'Eingaben unvollständig (Gießkraft, v_max, Anschnitt)', 'nodata')))

    + group('Schusskurve und Anschnitt',
      (isFinite(gvShown)
        ? kpi('Anschnittgeschwindigkeit', fmt(gvShown) + ' m/s',
          (gvShot != null ? 'aus Schusskurve (Bauteil gefüllt) · Mittel v₂ → ' + fmt(gvMean) + ' m/s' : 'aus v₂ (Mittel nach Anschnitt)'),
          bandStatus(gvShown, v.gateMin, v.gateMax), bandTag(gvShown, v.gateMin, v.gateMax),
          bullet(0, Math.max(1.2 * v.gateMax, 1.05 * gvShown), v.gateMin, v.gateMax, gvShown,
            '0 m/s', 'Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax), fmt(Math.max(1.2 * v.gateMax, 1.05 * gvShown)) + ' m/s'))
        : kpi('Anschnittgeschwindigkeit', '—', 'braucht v₂ aus der Schusskurve', 'nodata'))
      + (isFinite(Jist) && v.JatomMin > 0
        ? kpi('Zerstäubung (J-Faktor)', fmt(Jist),
          'Ist-J bei v_a ' + fmt(gvShown) + ' m/s · Band ' + fmt(v.JatomMin) + '–' + fmt(v.JatomMax) + ' (Herman/NADCA)',
          bandStatus(Jist, v.JatomMin, v.JatomMax), bandTag(Jist, v.JatomMin, v.JatomMax),
          bullet(0, Math.max(1.2 * v.JatomMax, 1.05 * Jist), v.JatomMin, v.JatomMax, Jist,
            '0', 'Band ' + fmt(v.JatomMin) + '–' + fmt(v.JatomMax), fmt(Math.max(1.2 * v.JatomMax, 1.05 * Jist))))
        : kpi('Zerstäubung (J-Faktor)', '—', 'braucht Anschnittgeschwindigkeit, -dicke und Dichte', 'nodata'))
      + kpi('PQ²-Arbeitspunkt', Qs === null ? '—' : fmt(Qs * 1000) + ' l/s',
        Qs === null ? 'Eingaben unvollständig' : 'Metalldruck p_s ' + fmt(ps) + ' bar · Schnittpunkt Maschine × Werkzeug',
        Qs === null ? 'nodata' : 'info')
      + (shot.error
        ? kpi('Schusskurve', 'Fehler', shot.error, 'bad', 'ungültig')
        : kpi('Schusszeit', fmt(shot.profile.endTime) + ' s', 'Kurvenhub ' + fmt(shot.profile.travel * 1000) + ' mm')
        + (shot.fill === null
          ? kpi('Füllzeit ab Anschnitt', '—', 'Kurve endet vor „Überlauf gefüllt" — Kurvenhub verlängern', 'nodata')
          : kpi('Füllzeit ab Anschnitt', fmt(shot.fill) + ' ms', 'aus Schusskurve · max ' + fmt(v.tmax) + ' ms',
            utilStatus(shot.fill / v.tmax), utilTag(shot.fill / v.tmax), meter(shot.fill / v.tmax)))
        + kpi('v₁ vs. v_krit (1. Phase)', fmt(shot.v1) + ' m/s',
          'v_krit ' + fmt(shot.vcrit) + ' m/s (CFD-Tabelle) · max. bis „Kammer voll" · v₂ ' + (shot.v2 == null ? '—' : fmt(shot.v2) + ' m/s'),
          utilStatus(shot.v1 / shot.vcrit), utilTag(shot.v1 / shot.vcrit), meter(shot.v1 / shot.vcrit))))

    + group('Thermik und Qualität',
      (!isFinite(tNadca) || shot.error || shot.fill === null
        ? kpi('NADCA-Füllzeit', isFinite(tNadca) ? fmt(tNadca) + ' ms' : '—',
          'empfohlen bei s = ' + fmt(v.wall) + ' mm · Ist-Füllzeit fehlt', 'nodata')
        : kpi('NADCA-Füllzeit', fmt(shot.fill) + ' ms',
          'empfohlen ≤ ' + fmt(tNadca) + ' ms bei s = ' + fmt(v.wall) + ' mm',
          utilStatus(shot.fill / tNadca),
          fmt(100 * shot.fill / tNadca) + ' % der Empfehlung', meter(shot.fill / tNadca)))
      + (isFinite(Areq) && v.vent > 0
        ? kpi('Entlüftungsbedarf', fmt(Areq) + ' mm²',
          'vorhanden ' + fmt(v.vent) + ' mm² · bei t_f ' + fmt(tOp) + ' ms (v₂-Mittel)',
          utilStatus(Areq / v.vent), utilTag(Areq / v.vent), meter(Areq / v.vent))
        : kpi('Entlüftungsbedarf', '—', 'braucht v₂ aus der Schusskurve und Entlüftungsfläche', 'nodata'))
      + kpi('Anschnitt-Erstarrung', fmt(tErst) + ' ms',
        'k·s² bei s = ' + fmt(v.gateTh) + ' mm · Nachdruckaufbau ' + fmt(v.intTime) + ' ms',
        minStatus(tErst, v.intTime), minTag(tErst, v.intTime),
        bullet(0, Math.max(1.5 * v.intTime, 1.15 * tErst), v.intTime, Math.max(1.5 * v.intTime, 1.15 * tErst), tErst,
          '0 ms', 'min ' + fmt(v.intTime) + ' (Nachdruckaufbau)', fmt(Math.max(1.5 * v.intTime, 1.15 * tErst)) + ' ms'))
      + (shot.error
        ? kpi('Kurve vs. Maschinenlimits', '—', 'Schusskurve ungültig', 'nodata')
        : (() => {
          const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
          const uV = v.vmax > 0 ? shot.profile.vmax / v.vmax : 0;
          const uA = v.amax > 0 ? aPk / v.amax : 0;
          const worst = Math.max(uV, uA);
          const rows =
            '<div class="meter-row"><span class="mlbl">v</span>' + meter(uV)
            + '<span class="mval">' + fmt(shot.profile.vmax) + '/' + fmt(v.vmax) + '</span></div>'
            + '<div class="meter-row"><span class="mlbl">a</span>' + meter(uA)
            + '<span class="mval">' + fmt(aPk) + '/' + fmt(v.amax) + '</span></div>';
          return kpi('Kurve vs. Maschinenlimits', fmt(100 * worst) + ' %',
            'Spitzen v/a gegen Maschinenlimits m/s · m/s²',
            utilStatus(worst),
            utilStatus(worst) === 'ok' ? '' : (uV >= uA ? 'v ' : 'a ') + pctTag(worst),
            rows);
        })()));

  if (chamberEl) {
    chamberEl.innerHTML = chamberHtml;
    el.innerHTML = restHtml;
  } else {
    el.innerHTML = chamberHtml + restHtml;
  }

  const bar = document.getElementById('checkbar');
  if (bar) {
    bar.innerHTML = checklistHTML();
    wireChecklist(bar);
  }
}
