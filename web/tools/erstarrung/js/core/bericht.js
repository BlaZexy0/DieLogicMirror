/* bericht.py der Erstarrung: der Endbericht, Python 3 ohne weitere Pakete,
   im Hauptordner des Falls. Aus den Tabellen, die dieLogicSolFoam schreibt
   (simulation/postProcessing/dieLogicSol: solidification, porosity,
   soldering, solidificationTimes), werden

     auswertung/graphiken/*.svg   die Verläufe als Bild
     auswertung/daten/*.csv       dieselben Zahlen zum Weiterrechnen
     auswertung/bericht.html      Kennzahlen, Bilder (bilder.py) mit
                                  Zeitregler, Verläufe, die Eingaben

   Aufbau, Graphiken, Stil und Betrachter wie der Bericht von „Simulation
   einrichten" (simulation/js/core/bericht.js, von dort übernommen). Fester
   Text: String.raw. */

export const SOL_BERICHT_PY = String.raw`#!/usr/bin/env python3
# Endbericht der Erstarrung — im Hauptordner des Falls:  python3 bericht.py
#   → auswertung/bericht.html, auswertung/graphiken/*.svg, auswertung/daten/*.csv
# Erzeugt von DieLogic · Erstarrung einrichten. Braucht nur Python 3; die Bilder
# kommen von bilder.py (pvbatch) und werden eingebunden, wenn es sie gibt.
import datetime, glob, html, json, math, os, re

HAUPT = os.path.dirname(os.path.abspath(__file__))


def lies(f):
    with open(f, encoding='utf-8', errors='replace') as fh:
        return fh.read().splitlines()


with open(os.path.join(HAUPT, 'auswertung.json'), encoding='utf-8') as fh:
    CONF = json.load(fh)
SIM = os.path.join(HAUPT, 'simulation')
PP = os.path.join(SIM, 'postProcessing')
AUS = os.path.join(HAUPT, 'auswertung')
for d in ('graphiken', 'daten'):
    os.makedirs(os.path.join(AUS, d), exist_ok=True)
# die Rollen der Palette (von der Seite als Zahlen); fehlen sie, die Vorgaben der Rollen
ROLLEN = {'text': [0, 0.153, 0.2], 'muted': [0.298, 0.408, 0.439], 'border': [0.8, 0.831, 0.839], 'borderLight': [0.898, 0.914, 0.922],
          'surface': [1, 1, 1], 'viewport': [0.91, 0.933, 0.941], 'primary': [0, 0.549, 0.51], 'primaryLight': [0.247, 0.761, 0.714],
          'ok': [0.082, 0.604, 0.298], 'caution': [0.878, 0.643, 0], 'melt': [0.91, 0.373, 0.031], 'air': [0.408, 0.655, 0.8],
          'die': [0.18, 0.396, 0.627], 'runner': [0.624, 0.392, 0.012], 'steelDark': [0.482, 0.565, 0.588], 'mark': [0.698, 0.216, 0.592]}
COL = dict(ROLLEN, **(CONF.get('colors') or {}))
K = 273.15


def farbe(name, alpha=None):
    c = COL.get(name) or [0.3, 0.35, 0.4]
    r, g, b = (int(round(255 * x)) for x in c[:3])
    return ('rgba(%d,%d,%d,%.3g)' % (r, g, b, alpha)) if alpha is not None else ('rgb(%d,%d,%d)' % (r, g, b))


def de(x, d=1):
    if x is None or not (x == x) or x in (float('inf'), -float('inf')):
        return '–'
    s = ('%.' + str(d) + 'f') % x
    ganz, _, rest = s.partition('.')
    neg = ganz.startswith('-')
    ganz = ganz.lstrip('-')
    gruppen = []
    while len(ganz) > 3:
        gruppen.insert(0, ganz[-3:])
        ganz = ganz[:-3]
    gruppen.insert(0, ganz)
    return ('-' if neg else '') + '.'.join(gruppen) + (',' + rest if rest else '')



def zahl(s):
    try:
        return float(s)
    except ValueError:
        return None


def tabelle(name):
    """postProcessing/dieLogicSol/<name>.dat → Zeilen (Zahlen); Kopf aus der #-Zeile."""
    f = os.path.join(PP, 'dieLogicSol', name + '.dat')
    if not os.path.isfile(f):
        return []
    out = []
    for z in lies(f):
        if z.startswith('#') or not z.strip():
            continue
        out.append(z.split())
    return out


SOL = [[zahl(x) for x in r] for r in tabelle('solidification')]
SOL = [r for r in SOL if len(r) >= 17 and None not in r]
POR = [[zahl(x) for x in r] for r in tabelle('porosity')]
POR = [r for r in POR if len(r) >= 10 and None not in r]
KLE = [[zahl(x) for x in r] for r in tabelle('soldering')]
KLE = [r for r in KLE if len(r) >= 5 and None not in r]
ZEITEN = [(int(r[0]), r[1], zahl(r[2]), zahl(r[3])) for r in tabelle('solidificationTimes') if len(r) >= 4]
# je Zyklus eine Zeile je Zone und zuletzt „casting": die Gruppe, das ganze Gussteil
ZONE = {'gussteil': 'Gussteil ohne Pressrest', 'feeder': 'Pressrest', 'casting': 'Ganz fest'}

BILD = {}
bj = os.path.join(AUS, 'bilder', 'bilder.json')
if os.path.isfile(bj):
    try:
        with open(bj, encoding='utf-8') as fh:
            BILD = json.load(fh)
    except ValueError as e:
        print('bilder.json nicht lesbar, Bericht ohne Bilder:', e)

# ── Kennzahlen ───────────────────────────────────────────────────────────
KZ = []
fill = CONF.get('fillTime') or 0
erster = [z for z in ZEITEN if z[0] == 1]
if erster:
    # je Bereich: das Gussteil ohne den Pressrest, dann der Pressrest (der Speiser)
    reihe_ = {'gussteil': 0, 'feeder': 1, 'casting': 2}
    for c, region, a, b in sorted(erster, key=lambda z: reihe_.get(z[1], 3)):
        name = ZONE.get(region, region)
        KZ.append((name if region == 'casting' else name + ' fest', de(a, 1) + ' s', 'nach Füllende · %s s ab Füllbeginn' % de(b, 1), None))
elif SOL:
    KZ.append(('Restschmelze am Ende', de(100 * SOL[-1][6], 1) + ' %', 'die Rechnung hat vor dem Ende aufgehört', 'caution'))
if POR:
    letzte = POR[-1]
    nIso = max(r[4] for r in POR)
    isoMax = max(r[5] for r in POR)
    KZ.append(('Abgeschnittene Schmelze', de(isoMax, 1) + ' cm³', 'höchstens, in bis zu %d Bereichen' % nIso if nIso else 'keine — alles gespeist bis zum Erstarren', 'caution' if isoMax > 0 else None))
    KZ.append(('Schwindungsporen', de(letzte[6], 2) + ' cm³', 'Gas %s cm³ · Mikro %s cm³' % (de(letzte[7], 2), de(letzte[8], 2)), 'caution' if letzte[6] > 0.05 else None))
    KZ.append(('Porosität höchstens', de(100 * max(r[9] for r in POR), 1) + ' %', 'in einer Zelle', None))
if KLE:
    TdieMax = max(r[1] for r in KLE) - K
    iMax = max(r[3] for r in KLE)
    aMax = max(r[4] for r in KLE)
    KZ.append(('Formoberfläche höchstens', de(TdieMax, 0) + ' °C', 'über %s cm² über der kritischen Temperatur' % de(max(r[2] for r in KLE), 1), None))
    KZ.append(('Klebeindex höchstens', de(iMax, 2), ('über 1 auf %s cm²' % de(aMax, 1)) if aMax > 0 else 'unter 1: Kleben unwahrscheinlich', 'caution' if iMax >= 1 else None))
if SOL:
    KZ.append(('Form höchstens', de(max(r[10] for r in SOL) - K, 0) + ' °C', 'im Stahl, über die ganze Rechnung', None))
uhr = None
for z in reversed(lies(os.path.join(SIM, 'log.dieLogicSolFoam')) if os.path.isfile(os.path.join(SIM, 'log.dieLogicSolFoam')) else []):
    m = re.search(r'ClockTime = ([0-9.]+)', z)
    if m:
        uhr = float(m.group(1))
        break
zellen = None
if os.path.isfile(os.path.join(SIM, 'log.checkMesh')):
    for z in lies(os.path.join(SIM, 'log.checkMesh')):
        m = re.match(r'\s*cells:\s+(\d+)', z)
        if m:
            zellen = int(m.group(1))
            break
fertig = bool(erster) or CONF.get('cycles')
status = ('ok', 'Erstarrung gerechnet') if fertig else ('caution', 'Rechnung nicht zu Ende')

# ── Graphiken ────────────────────────────────────────────────────────────
def stufen(lo, hi, n=5):
    span = (hi - lo) or abs(hi) or 1.0
    roh = span / n
    p = 10 ** math.floor(math.log10(roh))
    for m in (1, 2, 2.5, 5, 10):
        if roh <= m * p:
            schritt = m * p
            break
    a = math.floor(lo / schritt) * schritt
    b = math.ceil(hi / schritt) * schritt
    werte, x = [], a
    while x <= b + 1e-9 * span:
        werte.append(round(x, 10))
        x += schritt
    return werte, schritt


def ausduennen(pkte, n=1200):
    if len(pkte) <= n:
        return pkte
    s = len(pkte) / n
    return [pkte[int(i * s)] for i in range(n)] + [pkte[-1]]


GW, GH = 640, 300
L, R, O, U = 62, 18, 34, 46


def diagramm(id_, titel, xlabel, ylabel, linien, marken=(), y0=None, xr=None):
    """linien: [(Name, Farbrolle, [(x, y)], gestrichelt)] → (SVG, Daten fürs JS)."""
    linien = [(n, f, ausduennen(p), s) for n, f, p, s in linien if p]
    if not linien:
        return None
    xs = [x for _, _, p, _ in linien for x, _ in p]
    ys = [y for _, _, p, _ in linien for _, y in p]
    x0, x1 = (xr if xr else (min(xs), max(xs)))
    lo, hi = min(ys), max(ys)
    if y0 is not None:
        lo = min(lo, y0)
        if lo < y0 and y0 - lo < 1e-3 * (hi - y0):     # Rundungsrauschen unter null
            lo = y0
    if hi - lo < 1e-12:
        hi = lo + 1
    xt, xs_ = stufen(x0, x1, 6)
    yt, ys_ = stufen(lo, hi, 5)
    stellen = lambda st: max(0, int(math.ceil(-math.log10(st) - 1e-9)) + (1 if abs(st / 10 ** math.floor(math.log10(st)) - 2.5) < 1e-6 else 0))
    x0 = min(x0, xt[0]) if xr is None else x0
    x1 = max(x1, xt[-1]) if xr is None else x1
    lo, hi = yt[0], yt[-1]
    X = lambda x: L + (GW - L - R) * (x - x0) / ((x1 - x0) or 1)
    Y = lambda y: GH - U - (GH - U - O) * (y - lo) / ((hi - lo) or 1)
    d = []
    d.append('<svg class="chart" data-chart="%s" viewBox="0 0 %d %d" role="img" aria-label="%s">' % (id_, GW, GH, html.escape(titel)))
    d.append('<rect x="%d" y="%d" width="%d" height="%d" fill="%s" stroke="%s"/>' % (L, O, GW - L - R, GH - U - O, farbe('surface'), farbe('borderLight')))
    for y in yt:
        d.append('<line x1="%d" x2="%d" y1="%.1f" y2="%.1f" stroke="%s"/>' % (L, GW - R, Y(y), Y(y), farbe('borderLight')))
        d.append('<text x="%d" y="%.1f" class="tk" text-anchor="end">%s</text>' % (L - 6, Y(y) + 4, de(y, stellen(ys_))))
    for x in xt:
        if x0 - 1e-9 <= x <= x1 + 1e-9:
            d.append('<line x1="%.1f" x2="%.1f" y1="%d" y2="%d" stroke="%s"/>' % (X(x), X(x), O, GH - U, farbe('borderLight')))
            d.append('<text x="%.1f" y="%d" class="tk" text-anchor="middle">%s</text>' % (X(x), GH - U + 16, de(x, stellen(xs_))))
    for x, text in marken:
        if x is not None and x0 <= x <= x1:
            d.append('<line x1="%.1f" x2="%.1f" y1="%d" y2="%d" stroke="%s" stroke-dasharray="3 3"/>' % (X(x), X(x), O, GH - U, farbe('steelDark')))
            d.append('<text x="%.1f" y="%d" class="mk" text-anchor="start">%s</text>' % (X(x) + 3, O + 12, html.escape(text)))
    for name, rolle, p, strich in linien:
        sicht = [(x, y) for x, y in p if x0 - 1e-9 <= x <= x1 + 1e-9]
        if not sicht:
            continue
        pfad = ' '.join(('M' if i == 0 else 'L') + '%.1f %.1f' % (X(x), Y(y)) for i, (x, y) in enumerate(sicht))
        d.append('<path d="%s" fill="none" stroke="%s" stroke-width="2"%s stroke-linejoin="round"/>' % (pfad, farbe(rolle), ' stroke-dasharray="6 4"' if strich else ''))
    d.append('<text x="%d" y="%d" class="ax" text-anchor="middle">%s</text>' % ((L + GW - R) // 2, GH - 8, html.escape(xlabel)))
    d.append('<text x="14" y="%d" class="ax" text-anchor="middle" transform="rotate(-90 14 %d)">%s</text>' % ((O + GH - U) // 2, (O + GH - U) // 2, html.escape(ylabel)))
    lx = L
    for name, rolle, _, strich in linien:
        d.append('<line x1="%d" x2="%d" y1="18" y2="18" stroke="%s" stroke-width="2.5"%s/>' % (lx, lx + 18, farbe(rolle), ' stroke-dasharray="5 3"' if strich else ''))
        d.append('<text x="%d" y="22" class="lg">%s</text>' % (lx + 23, html.escape(name)))
        lx += 34 + 7 * len(name)
    d.append('<g class="cur" visibility="hidden"><line y1="%d" y2="%d" stroke="%s"/></g>' % (O, GH - U, farbe('text', 0.5)))
    d.append('</svg>')
    svg = '\n'.join(d)
    js = {'x0': x0, 'x1': x1, 'lo': lo, 'hi': hi, 'L': L, 'R': R, 'O': O, 'U': U, 'W': GW, 'H': GH, 'xl': xlabel,
          'lines': [{'name': n, 'pts': [[round(x, 4), round(y, 5)] for x, y in p]} for n, _, p, _ in linien]}
    return svg, js


def csv(name, spalten, reihen_):
    with open(os.path.join(AUS, 'daten', name + '.csv'), 'w', encoding='utf-8') as fh:
        fh.write(';'.join(spalten) + '\n')
        for r in reihen_:
            fh.write(';'.join('%.6g' % x for x in r) + '\n')



GRAPH = []


def graph(id_, titel, text, *a, **kw):
    r = diagramm(id_, titel, *a, **kw)
    if not r:
        return
    svg, js = r
    with open(os.path.join(AUS, 'graphiken', id_ + '.svg'), 'w', encoding='utf-8') as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n' + svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="12" ', 1))
    GRAPH.append((id_, titel, text, svg, js))


ZEIT = 'Zeit nach Füllende [s]'
t = [r[0] for r in SOL]
graph('restschmelze', 'Restschmelze im Gussteil', 'Anteil der Schmelze, der noch nicht fest ist.', ZEIT, 'Restschmelze [%]',
      [('Restschmelze', 'melt', [(r[0], 100 * r[6]) for r in SOL], False)], y0=0)
graph('temperaturen', 'Temperaturen', 'Höchste und tiefste Temperatur im Gussteil, höchste in der Form.', ZEIT, 'Temperatur [°C]',
      [('Gussteil höchstens', 'melt', [(r[0], r[8] - K) for r in SOL], False), ('Gussteil tiefstens', 'runner', [(r[0], r[7] - K) for r in SOL], True),
       ('Form höchstens', 'die', [(r[0], r[10] - K) for r in SOL], False)])
graph('speisung', 'Speisung', 'Schmelze, die noch mit dem Pressrest verbunden ist (gespeist), und abgeschnittene Bereiche.', ZEIT, 'Schmelze [cm³]',
      [('gespeist', 'melt', [(r[0], r[3]) for r in POR], False), ('abgeschnitten', 'mark', [(r[0], r[5]) for r in POR], False)], y0=0)
graph('poren', 'Poren', 'Volumen der Poren im Gussteil über der Zeit.', ZEIT, 'Poren [cm³]',
      [('Schwindung', 'melt', [(r[0], r[6]) for r in POR], False), ('Gas', 'air', [(r[0], r[7]) for r in POR], False), ('Mikro', 'steelDark', [(r[0], r[8]) for r in POR], True)], y0=0)
graph('waerme', 'Wärmeströme', 'Vom Gussteil in die Form und über die Ränder (Kühlkanäle, Kolben, außen) hinaus.', ZEIT, 'Wärmestrom [kW]',
      [('Gussteil → Form', 'melt', [(r[0], r[12] / 1000) for r in SOL], False), ('über die Ränder', 'cool' if COL.get('cool') else 'die', [(r[0], r[11] / 1000) for r in SOL], False)], y0=0)
csv('erstarrung', ['t_s', 'restschmelze', 'guss_Tmin_C', 'guss_Tmax_C', 'form_Tmax_C', 'Q_guss_form_W', 'Q_raender_W'],
    [[r[0], r[6], r[7] - K, r[8] - K, r[10] - K, r[12], r[11]] for r in SOL])
csv('porositaet', ['t_s', 'gespeist_cm3', 'bereiche_abgeschnitten', 'abgeschnitten_cm3', 'schwindung_cm3', 'gas_cm3', 'mikro_cm3', 'porositaet_max'],
    [[r[0], r[3], r[4], r[5], r[6], r[7], r[8], r[9]] for r in POR])
if ZEITEN:
    with open(os.path.join(AUS, 'daten', 'erstarrungszeiten.csv'), 'w', encoding='utf-8') as fh:
        fh.write('zyklus;bereich;fest_nach_fuellende_s;fest_ab_fuellbeginn_s\n')
        for c, r, a, b in ZEITEN:
            fh.write('%d;%s;%.6g;%.6g\n' % (c, r, a, b))

# ── Der Fall ─────────────────────────────────────────────────────────────
def zeilen_html(paare):
    return ''.join('<tr><th>%s</th><td>%s</td></tr>' % (html.escape(a), html.escape(b)) for a, b in paare)


B = CONF.get('block') or {}
eingaben = [('Legierung', '%s · Liquidus %s °C, Solidus %s °C' % (CONF.get('alloy', ''), de(CONF.get('Tliq'), 0), de(CONF.get('Tsol'), 0)))]
eingaben.append(('Am Füllende', 'aus einer Füllrechnung (dieLogicSolMapFill)' if CONF.get('start') == 'fill' else '%s °C überall, Füllung %s ms' % (de(CONF.get('Tfill'), 0), de(1000 * fill, 0))))
eingaben.append(('Form', 'Block %s mm, 1.2343, %s °C · Trennebene z = %s mm, feste Hälfte %s' % (
    ' × '.join(de(B['hi'][k] - B['lo'][k], 0) for k in range(3)) if B else '–', de(CONF.get('Tdie'), 0), de(B.get('parting', 0), 1), 'unten' if B.get('fixedBelow') else 'oben')))
PL = CONF.get('plunger') or {}
if PL:
    eingaben.append(('Kolben', 'CuCoBe Ø %s mm, %s mm lang' % (de(2 * PL.get('radius', 0), 1), de(PL.get('length', 0), 0))))
CH = CONF.get('channels') or []
eingaben.append(('Kühlkanäle', '; '.join('%s Ø %s mm, %s °C' % (c['name'], de(c['d'], 1), de(c['T'], 0)) for c in CH) if CH else 'keine'))
eingaben.append(('Nachdruck', '%s bar' % de(CONF.get('pInt'), 0)))
if CONF.get('cycles'):
    eingaben.append(('Betrieb', '%d Schüsse im Takt %s s, Öffnen nach %s s' % (CONF.get('nCycles', 1), de(CONF.get('cycleTime'), 0), de(CONF.get('dieOpen'), 0))))
else:
    eingaben.append(('Betrieb', 'ein Schuss, bis das Gussteil fest ist'))
eingaben.append(('Netz', 'Gussteil %s mm, Stahl %s mm%s' % (de(B.get('hCast'), 2), de(B.get('hBg'), 2), (', %s Zellen' % de(zellen, 0)) if zellen else '')))
if uhr is not None:
    h, m = int(uhr // 3600), int(uhr % 3600 // 60)
    eingaben.append(('Rechenzeit', ('%d h %02d min' % (h, m)) if h else ('%d min %02d s' % (m, int(uhr % 60)))))

if len(set(z[0] for z in ZEITEN)) > 1:
    zyk = {}
    for c, r, a, b in ZEITEN:
        if r == 'casting':          # die Gruppe: das ganze Gussteil
            zyk[c] = a
    eingaben.append(('Erstarrung je Schuss', ' · '.join('%d: %s s' % (c, de(a, 1)) for c, a in sorted(zyk.items()))))

css = '''
:root{--ink:%(ink)s;--muted:%(muted)s;--line:%(line)s;--soft:%(soft)s;--bg:%(bg)s;--card:%(card)s;--primary:%(primary)s;--primary-soft:%(primarySoft)s;--primary-side:%(primarySide)s;--ok:%(ok)s;--ok-soft:%(okSoft)s;--caution:%(caution)s;--caution-soft:%(cautionSoft)s;--side-ink:%(sideInk)s;--side-muted:%(sideMuted)s;}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.app{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh}
.side{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--ink);color:var(--side-ink);padding:22px 18px;display:flex;flex-direction:column;gap:18px}
.side .kicker{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--primary-side)}
.side .name{font-size:20px;font-weight:700;line-height:1.2;margin:4px 0 2px;word-break:break-word}
.side .sub{font-size:12.5px;color:var(--side-muted)}
.side nav{display:flex;flex-direction:column;gap:2px}
.side nav a{color:var(--side-ink);text-decoration:none;padding:7px 10px;border-radius:6px;font-size:14px;border-left:3px solid transparent}
.side nav a:hover,.side nav a.on{background:rgba(255,255,255,.08);border-left-color:var(--primary-side)}
.side .lab{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--side-muted);margin-bottom:6px}
.side button{width:100%%;font:inherit;font-weight:600;font-size:14px;padding:10px 12px;border:0;border-radius:7px;background:var(--primary);color:var(--card);cursor:pointer;display:flex;align-items:center;gap:8px;justify-content:center}
.side button:hover{filter:brightness(1.08)}
.side p{font-size:12px;color:var(--side-muted);margin:6px 0 0}
.side .files a{display:inline-block;margin:0 10px 4px 0;color:var(--primary-side);font-size:13.5px}
main{padding:26px 30px 60px;min-width:0}
.pill{display:inline-block;padding:4px 11px;border-radius:999px;font-weight:600;font-size:12.5px}
.pill.ok{background:var(--ok-soft);color:var(--ok)}
.side .pill.ok{background:rgba(255,255,255,.1);color:var(--primary-side)}
.pill.caution{background:var(--caution-soft);color:var(--ink);border:1px solid var(--caution)}
.side .pill.caution{color:var(--side-ink)}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px 22px;margin:0 0 20px;scroll-margin-top:12px}
h2{font-size:19px;margin:0 0 12px}
h3{font-size:15px;margin:18px 0 6px}
.intro{color:var(--muted);margin:-4px 0 14px;max-width:900px}
.kz{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.kz div{border:1px solid var(--soft);border-left:4px solid var(--primary);border-radius:6px;padding:9px 12px}
.kz div.caution{border-left-color:var(--caution)}
.kz b{display:block;font-size:20px;line-height:1.25}
.kz span{font-size:12.5px;color:var(--muted)}
.kz small{display:block;font-size:12.5px;color:var(--muted)}
.bar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.bar button{font:inherit;font-size:13.5px;padding:5px 11px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;cursor:pointer}
.bar button.on{background:var(--primary);border-color:var(--primary);color:var(--card)}
.bar .lab{font-size:12px;color:var(--muted);align-self:center;margin-right:4px;min-width:62px}
.frame{display:flex;justify-content:center;background:var(--card);border:1px solid var(--soft);border-radius:8px;overflow:hidden}
.frame img{display:block;max-width:100%%;max-height:calc(100vh - 230px);width:auto;height:auto}
.ctl{display:flex;align-items:center;gap:10px;margin-top:10px}
.ctl input[type=range]{flex:1;accent-color:var(--primary)}
.ctl button{font:inherit;width:38px;height:34px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--primary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.cap{font-size:13.5px;color:var(--muted);margin-top:6px;min-height:20px}
.charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:18px}
.zwei{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%%,460px),1fr));gap:20px;align-items:start}
.zwei img{width:100%%;height:auto;border:1px solid var(--soft);border-radius:8px;display:block}
figure{margin:0;position:relative;break-inside:avoid}
figcaption{font-size:13px;color:var(--muted);margin:3px 0 0}
figure h3{font-size:15px;margin:0 0 4px}
.chart{width:100%%;height:auto;display:block;touch-action:none}
.chart .tk{font-size:11px;fill:var(--muted)}
.chart .ax{font-size:12px;fill:var(--ink)}
.chart .lg{font-size:12px;fill:var(--ink)}
.chart .mk{font-size:10.5px;fill:var(--muted)}
.tip{position:absolute;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:12.5px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.12);display:none}
table{border-collapse:collapse;width:100%%}
th,td{text-align:left;vertical-align:top;padding:6px 10px;border-bottom:1px solid var(--soft);font-size:14px}
.fall th{width:170px;color:var(--muted);font-weight:500}
.tabelle{overflow-x:auto}
.zwei>div{min-width:0}
.nester th{font-size:12px;color:var(--muted);font-weight:600;letter-spacing:.02em}
.nester td.r{white-space:nowrap}
.nester td{font-variant-numeric:tabular-nums}
.nester td.r,.nester th.r{text-align:right}
.hinweis{font-size:12.5px;color:var(--muted);margin:8px 0 0}
.files a{color:var(--primary)}
footer{color:var(--muted);font-size:12.5px;text-align:center}
.leer{color:var(--muted)}
.nur-druck{display:none}
@media (max-width:900px){
  .app{grid-template-columns:1fr}
  .side{position:static;height:auto;padding:16px}
  .side nav{flex-direction:row;flex-wrap:wrap}
  .side .side-hilfe{display:none}
  main{padding:16px 16px 40px}
  .zwei{grid-template-columns:1fr}
}
@media (max-width:560px){.charts{grid-template-columns:1fr}.fall th{width:110px}.bar .lab{min-width:0;width:100%%}}
@media print{
  @page{size:A4;margin:12mm}
  body{background:white;font-size:11pt}
  .app{display:block}
  .side,.ctl,.bar,#bilder .frame,#bilder .cap,.tip,.nur-schirm{display:none!important}
  .nur-druck{display:block!important}
  main{padding:0}
  section{border:0;padding:0;margin:0 0 9mm;border-radius:0}
  .charts{grid-template-columns:1fr 1fr;gap:5mm}
  .zwei{grid-template-columns:1fr 1fr}
  .druckraster{display:grid;grid-template-columns:1fr 1fr;gap:3mm;margin-bottom:5mm}
  .druckraster img{width:100%%;height:auto;border:1px solid var(--soft)}
  .druckkopf h1{font-size:20pt;margin:0}
  .druckkopf p{margin:2pt 0 8mm;color:var(--muted)}
  h2,h3{break-after:avoid}
  .druckblock{break-inside:avoid}
  table,tr,figure,.kz div{break-inside:avoid}
}
''' % {'ink': farbe('text'), 'muted': farbe('muted'), 'line': farbe('border'), 'soft': farbe('borderLight'), 'bg': farbe('viewport'),
       'card': farbe('surface'), 'primary': farbe('primary'), 'primarySoft': farbe('primary', 0.12), 'ok': farbe('ok'), 'okSoft': farbe('ok', 0.14),
       'caution': farbe('caution'), 'cautionSoft': farbe('caution', 0.16), 'primarySide': farbe('primary', None) if not COL.get('primaryLight') else farbe('primaryLight'),
       'sideInk': farbe('surface'), 'sideMuted': farbe('border')}


kz_html = ''.join('<div class="%s"><span>%s</span><b>%s</b><small>%s</small></div>' % (v or '', html.escape(a), html.escape(b), html.escape(c)) for a, b, c, v in KZ)

druck_html = ''
if BILD.get('images'):
    bilder_html = ('<div class="bar" id="ansichten"></div><div class="bar" id="kennwerte"></div>'
                   '<div class="frame"><img id="bild" alt="Bild der Erstarrung"></div>'
                   '<div class="ctl" id="ctl"><button type="button" id="play" aria-label="Abspielen"></button>'
                   '<input type="range" id="regler" min="0" value="0" aria-label="Zeitpunkt"></div><div class="cap" id="cap"></div>')
    frames = BILD.get('frames') or []
    teile = []
    for v in BILD.get('views', []):
        for c in BILD.get('criteria', []):
            liste = BILD['images'].get(v['id'] + '/' + c['id']) or []
            if not liste:
                continue
            if c.get('end'):
                wahl = [(len(liste) - 1, 'Erstarrungszeit ab Füllbeginn' if c['id'] == 'solidTime' else 'am Ende der Rechnung')]
            else:
                ks = sorted(set(min(len(liste) - 1, int(round(q * (len(liste) - 1)))) for q in (0.1, 0.4, 0.7, 0.95)))
                wahl = [(k, 't = %s s nach Füllende' % de(frames[k]['t'], 2)) for k in ks if k < len(frames)]
            teile.append('<div class="druckblock"><h3>%s%s</h3><div class="druckraster">%s</div></div>' % (
                html.escape(c['label']) + (' [%s]' % html.escape(c['unit']) if c.get('unit') else ''), (' · ' + html.escape(v['label'])) if len(BILD['views']) > 1 else '',
                ''.join('<figure><img src="bilder/%s" alt=""><figcaption>%s</figcaption></figure>' % (html.escape(liste[k]), html.escape(tx)) for k, tx in wahl)))
    druck_html = '<div class="nur-druck">%s</div>' % ''.join(teile)
else:
    bilder_html = '<p class="leer">Keine Bilder: <code>pvbatch bilder.py</code> im Hauptordner schreibt sie (braucht ParaView).</p>'

graph_html = ''.join('<figure><h3>%s</h3>%s<figcaption>%s · <a href="graphiken/%s.svg">SVG</a></figcaption><div class="tip"></div></figure>' % (html.escape(t_), svg, html.escape(tx), i)
                     for i, t_, tx, svg, _ in GRAPH) or '<p class="leer">Keine Zeitreihen gefunden.</p>'
dateien = sorted(os.path.relpath(p, AUS) for p in glob.glob(os.path.join(AUS, 'daten', '*.csv')))
files_html = ' · '.join('<a href="%s">%s</a>' % (html.escape(p), html.escape(os.path.basename(p))) for p in dateien)

js = r'''
var B = __BILD__, G = __GRAPH__;
var PLAY = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 2.5 L13 8 L4 13.5 Z" fill="currentColor"/></svg>';
var PAUSE = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><rect x="3.5" y="2.5" width="3" height="11" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" fill="currentColor"/></svg>';
function de(x, d) { return isFinite(x) ? x.toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–'; }
(function () {
  if (!B.images) return;
  var view = B.views[0] && B.views[0].id, crit = B.criteria[0] && B.criteria[0].id, k = 0, timer = null;
  var img = document.getElementById('bild'), reg = document.getElementById('regler'), cap = document.getElementById('cap'), play = document.getElementById('play');
  function knoepfe(id, liste, wahl, setze) {
    var el = document.getElementById(id);
    el.innerHTML = '<span class="lab">' + (id === 'ansichten' ? 'Ansicht' : 'Kennwert') + '</span>';
    liste.forEach(function (x) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = x.label + (x.unit ? ' [' + x.unit + ']' : '');
      b.className = x.id === wahl ? 'on' : ''; b.onclick = function () { setze(x.id); }; el.appendChild(b);
    });
  }
  function liste() { return B.images[view + '/' + crit] || []; }
  function zeige() {
    var l = liste(); if (!l.length) { img.removeAttribute('src'); cap.textContent = 'Kein Bild für diese Wahl.'; return; }
    k = Math.max(0, Math.min(k, l.length - 1));
    img.src = 'bilder/' + l[k];
    reg.max = String(l.length - 1); reg.value = String(k);
    var c = B.criteria.find(function (x) { return x.id === crit; }) || {};
    document.getElementById('ctl').style.visibility = l.length > 1 ? 'visible' : 'hidden';
    var f = c.end ? null : B.frames[k];
    cap.textContent = f ? ('Bild ' + (k + 1) + ' von ' + l.length + ' · t = ' + de(f.t, 2) + ' s nach Füllende' + (isFinite(f.rest) && f.rest !== null ? ' · Restschmelze ' + de(100 * f.rest, 0) + ' %' : '')) : (c.id === 'solidTime' ? 'Erstarrungszeit ab Füllbeginn' : 'am Ende der Rechnung');
    if (l[k + 1]) { var n = new Image(); n.src = 'bilder/' + l[k + 1]; }
  }
  function neu() {
    knoepfe('ansichten', B.views, view, function (v) { view = v; neu(); });
    knoepfe('kennwerte', B.criteria, crit, function (c) { crit = c; neu(); });
    zeige();
  }
  reg.oninput = function () { k = Number(reg.value); zeige(); };
  function halt() { clearInterval(timer); timer = null; play.innerHTML = PLAY; play.setAttribute('aria-label', 'Abspielen'); }
  play.innerHTML = PLAY;
  play.onclick = function () {
    if (timer) { halt(); return; }
    if (k >= liste().length - 1) k = 0;
    play.innerHTML = PAUSE; play.setAttribute('aria-label', 'Anhalten');
    timer = setInterval(function () { if (k >= liste().length - 1) { halt(); return; } k++; zeige(); }, 120);
  };
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.tagName === 'INPUT' && e.target !== reg) return;
    if (e.key === 'ArrowRight') { k++; zeige(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { k--; zeige(); e.preventDefault(); }
  });
  neu();
})();
(function () {
  document.querySelectorAll('svg.chart').forEach(function (svg) {
    var g = G[svg.getAttribute('data-chart')]; if (!g) return;
    var tip = svg.parentNode.querySelector('.tip'), cur = svg.querySelector('.cur'), ln = cur.querySelector('line');
    function an(ev) {
      var r = svg.getBoundingClientRect(), sx = (ev.clientX - r.left) * g.W / r.width;
      if (sx < g.L || sx > g.W - g.R) { aus(); return; }
      var x = g.x0 + (sx - g.L) / (g.W - g.L - g.R) * (g.x1 - g.x0);
      var zeilen = g.lines.map(function (l) {
        var p = l.pts, i = 0, j = p.length - 1;
        if (!p.length || x < p[0][0] || x > p[j][0]) return null;
        while (j - i > 1) { var m = (i + j) >> 1; if (p[m][0] < x) i = m; else j = m; }
        var y = p[i][1] + (p[j][1] - p[i][1]) * ((x - p[i][0]) / ((p[j][0] - p[i][0]) || 1));
        return l.name + ': ' + de(y, Math.abs(y) >= 100 ? 0 : Math.abs(y) >= 10 ? 1 : 2);
      }).filter(Boolean);
      ln.setAttribute('x1', sx); ln.setAttribute('x2', sx); cur.setAttribute('visibility', 'visible');
      tip.innerHTML = de(x, 1) + ' ' + g.xl.replace(/^.*\[(.*)\]$/, '$1') + '<br>' + zeilen.join('<br>');
      tip.style.display = 'block';
      var px = (ev.clientX - r.left), w = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(px + 12, 0), r.width - w) + 'px'; tip.style.top = (svg.offsetTop + 30) + 'px';
    }
    function aus() { cur.setAttribute('visibility', 'hidden'); tip.style.display = 'none'; }
    svg.addEventListener('pointermove', an); svg.addEventListener('pointerleave', aus);
  });
})();
(function () {
  var pdf = document.getElementById('pdf');
  if (pdf) pdf.onclick = function () { window.print(); };
  /* der Abschnitt, in dem man liest, ist im Menü markiert */
  var links = Array.prototype.slice.call(document.querySelectorAll('#inhalt a'));
  if (!('IntersectionObserver' in window) || !links.length) return;
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      if (!e.isIntersecting) return;
      links.forEach(function (a) { a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id); });
    });
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('main section[id]').forEach(function (s) { io.observe(s); });
})();
'''.replace('__BILD__', json.dumps(BILD, ensure_ascii=False)).replace('__GRAPH__', json.dumps({i: j for i, _, _, _, j in GRAPH}))


jetzt = datetime.datetime.now().strftime('%d.%m.%Y, %H:%M')
seite = """<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITEL__ · Bericht</title>
<style>__CSSX__</style>
</head>
<body>
<div class="app">
<aside class="side">
  <div><div class="kicker">Bericht</div><div class="name">__TITEL__</div><div class="sub">Erstarrung mit dieLogicSolFoam · __JETZT__</div></div>
  <span class="pill __STATUSK__">__STATUS__</span>
  <nav id="inhalt">
    <a href="#kennzahlen">Kennzahlen</a>
    <a href="#bilder">Bilder</a>
    <a href="#verlaeufe">Verläufe</a>
    <a href="#fall">Der Fall</a>
  </nav>
  <div>
    <button type="button" id="pdf"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 9.5h5M6 12h5" stroke="currentColor" stroke-width="1.4"/></svg>Als PDF speichern</button>
    <p class="side-hilfe">Öffnet den Druck: im Dialog „Als PDF speichern" wählen. Gedruckt werden Kennzahlen, die Bilder (die Erstarrungsfolge mit vier Zeitpunkten) und alle Verläufe.</p>
  </div>
  <div class="files"><div class="lab">Ordner</div><a href="bilder/">bilder</a><a href="graphiken/">graphiken</a><a href="daten/">daten</a></div>
</aside>
<main>
<header class="nur-druck druckkopf"><h1>__TITEL__</h1><p>Erstarrung mit dieLogicSolFoam · Bericht vom __JETZT__ · __STATUS__</p></header>
<section id="kennzahlen"><h2>Kennzahlen</h2><p class="intro">Zeiten ab dem Ende der Füllung. Die Modellkonstanten (Kontakt, Speisung, Kleben) sind Werte in der Größenordnung der Literatur, nicht kalibriert: zum Vergleich von Formen und Prozessvarianten.</p><div class="kz">__KZ__</div></section>
<section id="bilder"><h2>Bilder</h2>__BILDER____DRUCK__</section>
<section id="verlaeufe"><h2>Verläufe</h2><div class="charts">__GRAPH__</div></section>
<section id="fall"><h2>Der Fall</h2><table class="fall">__EINGABEN__</table><p class="files">Daten (CSV, Trennzeichen Semikolon): __FILES__</p></section>
<footer>DieLogic · Erstarrung einrichten · Ordner: simulation (OpenFOAM), auswertung (dieser Bericht, bilder, graphiken, daten)</footer>
</main>
</div>
<script>__JSX__</script>
</body>
</html>
"""
for a, b in (('__CSSX__', css), ('__TITEL__', html.escape(CONF.get('title', 'Erstarrung'))), ('__JETZT__', jetzt),
             ('__STATUSK__', status[0]), ('__STATUS__', html.escape(status[1])), ('__KZ__', kz_html), ('__BILDER__', bilder_html), ('__DRUCK__', druck_html),
             ('__GRAPH__', graph_html), ('__EINGABEN__', zeilen_html(eingaben)), ('__FILES__', files_html or '–'), ('__JSX__', js)):
    seite = seite.replace(a, b)
with open(os.path.join(AUS, 'bericht.html'), 'w', encoding='utf-8') as fh:
    fh.write(seite)
print('Bericht:', os.path.join(AUS, 'bericht.html'), '·', len(GRAPH), 'Graphiken')
`;
