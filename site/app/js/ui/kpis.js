/* KPI-Kacheln oberhalb der Diagramme, gruppiert nach Themen:
   Füllkammer/Massen · Zuhaltung/Maschine · Schusskurve/Anschnitt ·
   Thermik/Qualität. Alle Werte sind dieselben Formeln wie in den Diagrammen. */

import { fmt } from '../core/format.js';
import { total, afterGate, pistonArea, travel } from '../core/physics.js';

function kpi(a, b, c, s) {
  return '<div class="kpi' + (s ? ' ' + s : '') + '"><span>' + a + '</span><b>' + b + '</b><small>' + c + '</small></div>';
}
function band(x, lo, hi) { return x < lo || x > hi ? 'warn' : 'ok'; }
function cap(x, lim) { return x > lim ? 'bad' : 'ok'; }
function group(title, tiles) {
  return '<div class="kpi-head">' + title + '</div><div class="kpi-grid">' + tiles + '</div>';
}

/* chamberEl: Ziel für die Füllkammer-Gruppe (links neben dem Schema);
   el bekommt die übrigen Gruppen. Ohne chamberEl landet alles in el. */
export function renderKpis(el, v, shot, chamberEl) {
  const A = pistonArea(v);
  const mdos = total(v) + v.biscuit;
  const Vdos = mdos / v.density;                                   // m³
  const req = v.area * v.safety * v.psel / 0.01;
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
  const pSpec = v.injForce * 1e4 / A;

  /* PQ²-Arbeitspunkt (gleiche Rechnung wie im PQ²-Diagramm) */
  let Qs = null, ps = null;
  if (v.gate > 0 && v.Cd > 0 && v.vmax > 0 && v.injForce > 0 && v.density > 0 && v.diam > 0) {
    const Ap = A * 1e-6, p0 = v.injForce * 1e4 / A, Qmax = Ap * v.vmax, Ag = v.gate * 1e-6;
    const Cdie = v.density / (2 * v.Cd * v.Cd * Ag * Ag) / 1e5;
    Qs = Math.sqrt(p0 / (Cdie + p0 / (Qmax * Qmax)));
    ps = Cdie * Qs * Qs;
  }
  /* Hüllkurven-Konstante a = (2√3/9)·F_G·v_dry (PQ²) und Leistung am Arbeitspunkt */
  const aMPE = (v.injForce > 0 && v.vmax > 0)
    ? (2 * Math.sqrt(3) / 9) * v.injForce * 1e3 * v.vmax / 1e6 : null;   // MW
  const pwOp = Qs !== null ? ps * 1e5 * Qs / 1e6 : null;                 // MW

  /* Anschnittgeschwindigkeit: bevorzugt aus der Schusskurve (Bauteil gefüllt);
     sonst mit v2 = mittlerer Kolbengeschw. nach Anschnitt (ebenfalls Kurve) */
  const v2 = !shot.error && shot.v2 != null ? shot.v2 : NaN;
  const gvMean = v.gate > 0 ? v2 * A / v.gate : NaN;
  const evPart = !shot.error && shot.events && shot.events[2];
  const gvShot = evPart && evPart.inP && evPart.gv != null ? evPart.gv : null;
  const gvShown = gvShot != null ? gvShot : gvMean;

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
      + kpi('Füllgrad', fmt(fill) + ' %', 'Ziel ' + fmt(v.fillMin) + '–' + fmt(v.fillMax) + ' % · inkl. Pressrest', band(fill, v.fillMin, v.fillMax))
      + kpi('Kammerverhältnis λ', fmt(ratioLD), 'λ = L/D · gewählte Kammer · Ø ' + fmt(v.diam) + ' × L ' + fmt(v.length) + ' mm')
      + kpi('Kammer voll bei', fmt(sFill) + ' mm', 'Füllgrad inkl. Pressrest ' + fmt(fill) + ' %', cap(fill, 100))
      + kpi('Anschnitt erreicht', fmt(p1) + ' mm', 'nur Angussvolumen')
      + kpi('Gesamtschuss gefüllt', fmt(p3) + ' mm', 'inkl. Pressrest · Kammer ' + fmt(v.length) + ' mm' + (p3 > v.length ? ' · Überlauf!' : ''), cap(p3, v.length))
      + kpi('Pressrest', fmt(biscLen) + ' mm', 'min ' + fmt(v.biscuitMin) + ' mm', biscLen < v.biscuitMin ? 'bad' : 'ok'));

  const restHtml =
    group('Zuhaltung und Maschine',
      kpi('Benötigte Schließkraft', fmt(req / 10) + ' t', fmt(req) + ' kN / ' + fmt(v.force) + ' kN verfügbar', cap(req, v.force))
      + kpi('Max. Nachdruck', fmt(pMaxClamp) + ' bar', 'Zuhaltung · e = (' + fmt(v.eccX) + ', ' + fmt(v.eccY) + ') mm · k = ' + fmt(kClamp) + ' · S = ' + fmt(v.safety), cap(v.psel, pMaxClamp))
      + kpi('Spez. Gießdruck', fmt(pSpec) + ' bar', 'Gießkraft / Kolbenfläche · Band Bedarf ' + fmt(v.psel) + ' – Zuhaltung ' + fmt(pMaxClamp) + ' bar', band(pSpec, v.psel, pMaxClamp))
      + kpi('Hüllkurven-Konstante a', aMPE === null ? '—' : fmt(aMPE) + ' MW',
        'Akku-Leistung (2√3/9)·F_G·v_dry (PQ²)'
        + (pwOp === null ? '' : ' · Arbeitspunkt nutzt ' + fmt(pwOp) + ' MW'),
        aMPE === null ? 'warn' : undefined))

    + group('Schusskurve und Anschnitt',
      kpi('Anschnittgeschwindigkeit', fmt(gvShown) + ' m/s',
        (gvShot != null
          ? 'aus Schusskurve (Bauteil gefüllt) · Mittel v₂ → ' + fmt(gvMean) + ' m/s'
          : 'aus v₂ (Mittel nach Anschnitt)')
        + ' · Ziel ' + fmt(v.gateMin) + '–' + fmt(v.gateMax) + ' m/s', band(gvShown, v.gateMin, v.gateMax))
      + kpi('PQ²-Arbeitspunkt', Qs === null ? '—' : fmt(Qs * 1000) + ' l/s',
        Qs === null ? 'Eingaben unvollständig' : 'Metalldruck p_s ' + fmt(ps) + ' bar · Schnittpunkt Maschine × Werkzeug', Qs === null ? 'warn' : undefined)
      + (shot.error
        ? kpi('Schusskurve', 'Fehler', shot.error, 'bad')
        : kpi('Schusszeit', fmt(shot.profile.endTime) + ' s', 'Kurvenhub ' + fmt(shot.profile.travel * 1000) + ' mm')
        + kpi('Füllzeit ab Anschnitt', shot.fill === null ? '—' : fmt(shot.fill) + ' ms', 'aus Schusskurve · max ' + fmt(v.tmax) + ' ms', shot.fill === null ? 'warn' : cap(shot.fill, v.tmax))
        + kpi('v₁ / v₂ aus Kurve', fmt(shot.v1) + ' / ' + (shot.v2 == null ? '—' : fmt(shot.v2)) + ' m/s',
          'v₁ = max. bis Kammer voll · v₂ = Mittel nach Anschnitt')
        + kpi('v_krit 1. Phase', fmt(shot.vcrit) + ' m/s', 'Ist max. v₁ ' + fmt(shot.v1) + ' m/s (CFD-Tabelle)', cap(shot.v1, shot.vcrit))))

    + group('Thermik und Qualität',
      kpi('Empf. Füllzeit (NADCA)', fmt(tNadca) + ' ms',
        'bei s = ' + fmt(v.wall) + ' mm · Ist ' + (shot.error || shot.fill === null ? '—' : fmt(shot.fill)) + ' ms aus Schusskurve',
        (shot.error || shot.fill === null || !isFinite(tNadca)) ? 'warn' : cap(shot.fill, tNadca))
      + kpi('Entlüftungsbedarf', fmt(Areq) + ' mm²',
        'bei t_f ' + fmt(tOp) + ' ms (v₂-Mittel) · vorhanden ' + fmt(v.vent) + ' mm²', isFinite(Areq) ? cap(Areq, v.vent) : 'warn')
      + kpi('Anschnitt-Erstarrung', fmt(tErst) + ' ms',
        'k·s² bei s = ' + fmt(v.gateTh) + ' mm · Nachdruckaufbau ' + fmt(v.intTime) + ' ms', tErst < v.intTime ? 'bad' : 'ok')
      + (shot.error
        ? kpi('Kurve vs. Maschinenlimits', '—', 'Schusskurve ungültig', 'warn')
        : (() => {
          const aPk = Math.max(shot.profile.amax, -shot.profile.amin, 0);
          const ok = shot.profile.vmax <= v.vmax + 1e-9 && (!(v.amax > 0) || aPk <= v.amax + 1e-9);
          return kpi('Kurve vs. Maschinenlimits', fmt(shot.profile.vmax) + ' m/s · ' + fmt(aPk) + ' m/s²',
            'Spitzen v/a · Limits ' + fmt(v.vmax) + ' m/s · ' + fmt(v.amax) + ' m/s²', ok ? 'ok' : 'bad');
        })()));

  if (chamberEl) {
    chamberEl.innerHTML = chamberHtml;
    el.innerHTML = restHtml;
  } else {
    el.innerHTML = chamberHtml + restHtml;
  }
}
