/* bericht.py: der Endbericht der Simulation, Python 3 ohne weitere Pakete,
   im Hauptordner des Falls. Aus den Zeitreihen, die die Funktionsobjekte
   während der Rechnung schreiben (simulation/postProcessing: fuellung,
   kolbendruck, schmelze, luft, gasdruck, einschluss), werden

     auswertung/graphiken/*.svg   die Verläufe als Bild
     auswertung/daten/*.csv       dieselben Zahlen zum Weiterrechnen
     auswertung/bericht.html      Kennzahlen, Bilder (bilder.py) mit
                                  Zeitregler, Verläufe, die Eingaben

   Farben und Schrift kommen als Zahlen aus auswertung.json (die Rollen der
   Palette). Fester Text wie bilder.js: String.raw, ohne Platzhalter. */

export const BERICHT_PY = String.raw`#!/usr/bin/env python3
# Endbericht der Formfüllung — im Hauptordner des Falls:  python3 bericht.py
#   → auswertung/bericht.html, auswertung/graphiken/*.svg, auswertung/daten/*.csv
# Erzeugt von DieLogic · Simulation einrichten. Braucht nur Python 3; die Bilder
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
COL = CONF.get('colors') or {}
SHOT = CONF.get('shot') or {}
TOFF = CONF.get('tOffset', 0)          # Rechenzeit → Kurvenzeit (ohne Kammer: ab „Kammer voll")


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


def reihe(name):
    """Zeitreihe eines Funktionsobjekts → (Spalten, Zeilen); nach einem
    Neustart ersetzt der neue Ordner, was er abdeckt."""
    kopf, zeilen = [], []
    ordner = [d for d in glob.glob(os.path.join(PP, name, '*')) if zahl(os.path.basename(d)) is not None]
    for d in sorted(ordner, key=lambda d: zahl(os.path.basename(d))):
        start = zahl(os.path.basename(d))
        for f in sorted(glob.glob(os.path.join(d, '*.dat'))):
            neu = []
            for z in lies(f):
                if z.startswith('#'):
                    k = z[1:].split()
                    if k and k[0] == 'Time':
                        kopf = k
                    continue
                w = [zahl(x) for x in z.replace('(', ' ').replace(')', ' ').split()]
                if w and None not in w:
                    neu.append(w)
            if neu:
                zeilen = [r for r in zeilen if r[0] < start] + neu
    return kopf, zeilen


def spalte(kopf, zeilen, feld, faktor=1.0, plus=0.0):
    """Werte der Spalte des Felds „feld": volAverage(form,alpha.melt),
    areaAverage(inlet,p), max(pGas) … → [(Kurvenzeit ms, Wert)]."""
    j = next((i for i, k in enumerate(kopf) if k == feld or re.search(r'[(,]' + re.escape(feld) + r'\)$', k)), None)
    if j is None:
        return []
    return [(1000 * (r[0] + TOFF), r[j] * faktor + plus) for r in zeilen if len(r) > j]


def solverDat(name):
    """Die Protokolle des Solvers (gasPockets.dat …): Allrun hebt sie vor
    einem Neustart als name.<Zeit>.dat auf."""
    zeilen, kopf = [], []
    for f in sorted(glob.glob(os.path.join(PP, name + '*.dat')), key=os.path.getmtime):
        for z in lies(f):
            if z.startswith('#'):
                kopf = z[1:].split()
                continue
            w = [zahl(x) for x in z.split()]
            if w and None not in w:
                zeilen.append(w)
    zeilen.sort(key=lambda r: r[0])
    return kopf, zeilen


# ── Die Zahlen ───────────────────────────────────────────────────────────
k, z = reihe('fuellung');    FUELL = spalte(k, z, 'alpha.melt', 100)
k, z = reihe('kolbendruck'); DRUCK = spalte(k, z, 'p', 1e-5)
k, z = reihe('schmelze')
TEMP = spalte(k, z, 'T', 1, -273.15)
FEST = spalte(k, z, 'solidFraction', 100)
GESCHW = spalte(k, z, 'magU')
k, z = reihe('luft')
LUFT_M = spalte(k, z, 'luftMasse', 1000)          # g
LUFTEIN_V = spalte(k, z, 'luftEin', 1e6)          # cm³
LUFTEIN_M = spalte(k, z, 'luftEinMasse', 1000)     # g
k, z = reihe('gasdruck');    GASDRUCK = spalte(k, z, 'pGas', 1e-5)
k, z = reihe('einschluss')
MITLUFT = spalte(k, z, 'airEntrained', 1e9)        # mm³
OXID = spalte(k, z, 'oxide', 1e9)
k, z = solverDat('gasPockets')
ENTL = [(1000 * (r[0] + TOFF), 1000 * r[6]) for r in z if len(r) > 6]   # g/s


def bis(reihe_, x):
    """erstes x, bei dem die Reihe x erreicht."""
    return next((t for t, v in reihe_ if v >= x), None)


# Mittel über die Schmelze in der Form gibt es erst, wenn Schmelze in der Form
# ist (mit Kammer ist sie bis „Kammer voll" leer: das Mittel wäre 0 K)
tAn = bis(FUELL, 0.5)
if tAn is not None:
    TEMP, FEST, GESCHW = ([(t, v) for t, v in r if t >= tAn] for r in (TEMP, FEST, GESCHW))


def letzter(reihe_):
    return reihe_[-1][1] if reihe_ else None


def hoechster(reihe_):
    return max((v for _, v in reihe_), default=None)


# Schusskurve (geplant): Füllgrad der Form über der Kurvenzeit aus dem Kolbenweg
PST = CONF.get('piston') or []
PLAN = []
if PST and SHOT.get('sEnd', 0) > SHOT.get('sFull', 0):
    sF, sE = SHOT['sFull'], SHOT['sEnd']
    PLAN = [(1000 * t, 100 * max(0.0, min(1.0, (s - sF) / (sE - sF)))) for t, s in PST]

# ── Das Protokoll der Rechnung ───────────────────────────────────────────
LOG = os.path.join(SIM, 'log.dieLogicFoam')
schritte, exe, uhr, gefuellt, ende = 0, None, None, False, False
if os.path.isfile(LOG):
    for z in lies(LOG):
        if z.startswith('Time = '):
            schritte += 1
        elif z.startswith('ExecutionTime'):
            m = re.match(r'ExecutionTime = ([0-9.eE+-]+) s\s+ClockTime = ([0-9.eE+-]+)', z)
            if m:
                exe, uhr = float(m.group(1)), float(m.group(2))
        elif z.startswith('Cavity filled'):
            gefuellt = True
        elif z.strip() == 'End':
            ende = True
zellen = None
CM = os.path.join(SIM, 'log.checkMesh')
if os.path.isfile(CM):
    m = re.search(r'^\s*cells:\s+(\d+)', '\n'.join(lies(CM)), re.M)
    zellen = int(m.group(1)) if m else None

BILD = {}
BJ = os.path.join(AUS, 'bilder', 'bilder.json')
if os.path.isfile(BJ):
    with open(BJ, encoding='utf-8') as fh:
        BILD = json.load(fh)

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


tFull = 1000 * SHOT.get('tFull', 0)
tEnd = 1000 * SHOT.get('tEnd', 0)
EREIG = [(tFull, 'Kammer voll'), (tEnd, 'Füllende (Kurve)')]
# der Ausschnitt: ab kurz vor „Kammer voll" (mit Kammer ist davor nur die langsame Phase)
xs_alle = [t for r in (FUELL, DRUCK, TEMP) for t, _ in r]
xA = min(xs_alle) if xs_alle else 0
xB = max(xs_alle) if xs_alle else 1
if CONF.get('moving') and tEnd > tFull:
    xA = max(xA, tFull - 0.25 * (tEnd - tFull))
XR = (xA, xB) if xB > xA else None
ZEIT = 'Zeit seit Kolbenstart [ms]'

GRAPH = []


def graph(id_, titel, text, *a, **kw):
    r = diagramm(id_, titel, *a, **kw)
    if not r:
        return
    svg, js = r
    with open(os.path.join(AUS, 'graphiken', id_ + '.svg'), 'w', encoding='utf-8') as fh:
        fh.write('<?xml version="1.0" encoding="UTF-8"?>\n' + svg.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" font-family="sans-serif" font-size="12" ', 1))
    GRAPH.append((id_, titel, text, svg, js))


graph('fuellung', 'Füllung der Form', 'Schmelze in der Form (ohne Kammer und Pressrest) — gerechnet und nach der Schusskurve.',
      ZEIT, 'Füllgrad [%]', [('gerechnet', 'primary', FUELL, False), ('Schusskurve', 'steelDark', PLAN, True)], EREIG, y0=0, xr=XR)
graph('druck', 'Druck am Kolben', 'Mittlerer Druck auf der Kolbenfläche (Patch inlet).',
      ZEIT, 'Druck [bar]', [('Kolben', 'die', DRUCK, False)], EREIG, y0=0, xr=XR)
graph('luft', 'Luft in der Form', 'Masse der Luft in allen Gaszellen und in den Nestern ohne Entlüftung.',
      ZEIT, 'Luft [g]', [('gesamt', 'air', LUFT_M, False), ('eingeschlossen', 'mark', LUFTEIN_M, False)], EREIG, y0=0, xr=XR)
graph('eingeschlossen', 'Eingeschlossene Luft', 'Volumen der Gasnester, die keinen Auslass mehr erreichen.',
      ZEIT, 'Volumen [cm³]', [('eingeschlossen', 'mark', LUFTEIN_V, False)], EREIG, y0=0, xr=XR)
graph('gasdruck', 'Höchster Gasdruck', 'Größter Druck in einer Gastasche (Gasmodell).',
      ZEIT, 'Druck [bar]', [('Gas', 'mark', GASDRUCK, False)], EREIG, y0=0, xr=XR)
graph('entlueftung', 'Entlüftung', 'Luftmassenstrom durch alle Auslässe (Protokoll des Gasmodells).',
      ZEIT, 'Massenstrom [g/s]', [('Auslässe', 'air', ENTL, False)], EREIG, y0=0, xr=XR)
graph('einschluesse', 'Mitgerissene Luft und Oxide', 'Von der Schmelze mitgetragen, über die ganze Schmelze summiert.',
      ZEIT, 'Volumen [mm³]', [('mitgerissene Luft', 'air', MITLUFT, False), ('Oxide', 'runner', OXID, False)], EREIG, y0=0, xr=XR)
graph('temperatur', 'Temperatur der Schmelze', 'Mittel über die Schmelze in der Form.',
      ZEIT, 'Temperatur [°C]', [('Schmelze', 'melt', TEMP, False)], EREIG, xr=XR)
graph('festanteil', 'Erstarrt', 'Mittlerer Festanteil der Schmelze in der Form.',
      ZEIT, 'Festanteil [%]', [('Schmelze', 'die', FEST, False)], EREIG, y0=0, xr=XR)
graph('geschwindigkeit', 'Geschwindigkeit der Schmelze', 'Mittlerer Betrag in der Form.',
      ZEIT, 'Geschwindigkeit [m/s]', [('Schmelze', 'primary', GESCHW, False)], EREIG, y0=0, xr=XR)
if SHOT.get('points'):
    sv = [(x, v) for x, v in SHOT['points']]
    graph('schusskurve', 'Schusskurve', 'Kolbengeschwindigkeit über dem Kolbenweg (Eingabe).',
          'Kolbenweg [mm]', 'Geschwindigkeit [m/s]', [('Kolben', 'primary', sv, False)],
          [(SHOT.get('sFull'), 'Kammer voll'), (SHOT.get('sEnd'), 'Füllende')], y0=0)

for name, sp, r in (('fuellung', ['Zeit_ms', 'Fuellgrad_%'], FUELL), ('druck_kolben', ['Zeit_ms', 'Druck_bar'], DRUCK),
                    ('temperatur', ['Zeit_ms', 'T_C'], TEMP), ('festanteil', ['Zeit_ms', 'Festanteil_%'], FEST),
                    ('geschwindigkeit', ['Zeit_ms', 'U_m_s'], GESCHW), ('luft', ['Zeit_ms', 'Luft_g'], LUFT_M),
                    ('eingeschlossen', ['Zeit_ms', 'V_cm3'], LUFTEIN_V), ('gasdruck', ['Zeit_ms', 'p_max_bar'], GASDRUCK),
                    ('mitgerissene_luft', ['Zeit_ms', 'V_mm3'], MITLUFT), ('oxide', ['Zeit_ms', 'V_mm3'], OXID),
                    ('entlueftung', ['Zeit_ms', 'mdot_g_s'], ENTL)):
    if r:
        csv(name, sp, r)

# ── Kennzahlen ───────────────────────────────────────────────────────────
fMax = hoechster(FUELL)
# gefüllt: der Solver endet bei voller Form (stopAtFill, keine Gaszelle mehr) —
# dann ist das Ende der Rechnung das Füllende, sonst die erste Zeit mit 99 %
tVoll = (FUELL[-1][0] if FUELL else None) if gefuellt else bis(FUELL, 99.0)
pGasMax = hoechster(GASDRUCK)
viel = lambda x: de(x, 0 if x is not None and abs(x) >= 100 else 1)
KZ = [
    ('Form gefüllt', (de(tVoll, 1) + ' ms') if tVoll is not None else 'nicht ganz', ('Füllgrad ' + de(fMax, 1) + ' % · Kurve: ' + de(tEnd, 1) + ' ms') if tVoll is not None else 'höchstens ' + de(fMax, 1) + ' %', 'ok' if tVoll is not None else 'caution'),
    ('Füllzeit', (de(tVoll - tFull, 1) + ' ms') if tVoll is not None else '–', 'ab „Kammer voll" (' + de(tFull, 0) + ' ms) · Kurve: ' + de(tEnd - tFull, 1) + ' ms', None),
    ('Druck am Kolben', de(hoechster(DRUCK), 0) + ' bar', 'höchster Wert (am Füllende die Druckspitze)', None),
    ('Eingeschlossene Luft', de(letzter(LUFTEIN_V), 2) + ' cm³', 'am Ende · höchstens ' + de(hoechster(LUFTEIN_V), 2) + ' cm³', None),
    ('Gasdruck', de(pGasMax, 1) + ' bar', 'an der Obergrenze des Gasmodells (pMax)' if pGasMax is not None and pGasMax >= 199.9 else 'höchster in einer Tasche', 'caution' if pGasMax is not None and pGasMax >= 199.9 else None),
    ('Mitgerissene Luft', viel(letzter(MITLUFT)) + ' mm³', 'am Ende, in der Schmelze', None),
    ('Oxide', de(letzter(OXID), 2) + ' mm³', 'am Ende', None),
    ('Schmelze', de(min((v for _, v in TEMP), default=None), 0) + ' °C', 'tiefstes Mittel · Festanteil am Ende ' + de(letzter(FEST), 1) + ' %', None),
]
status = ('ok', 'Form gefüllt') if gefuellt else (('caution', 'Rechnung zu Ende, Form nicht voll') if ende else ('caution', 'Rechnung nicht zu Ende'))
RECHNUNG = []
if zellen:
    RECHNUNG.append(('Zellen', de(zellen, 0)))
if schritte:
    RECHNUNG.append(('Zeitschritte', de(schritte, 0)))
if uhr is not None:
    h, m = int(uhr // 3600), int(uhr % 3600 // 60)
    RECHNUNG.append(('Rechenzeit', ('%d h %02d min' % (h, m)) if h else ('%d min %02d s' % (m, int(uhr % 60)))))

# ── Bericht ──────────────────────────────────────────────────────────────
FALL = CONF.get('fall') or {}


def zeilen_html(paare):
    return ''.join('<tr><th>%s</th><td>%s</td></tr>' % (html.escape(a), html.escape(b)) for a, b in paare)


eingaben = []
if FALL.get('bodies'):
    eingaben.append(('Körper', ', '.join(('%s (%s)' % (b['name'], b['role'])) if b.get('role') else b['name'] for b in FALL['bodies'])))
if FALL.get('mesh'):
    M = FALL['mesh']
    eingaben.append(('Netz', 'Zellgröße %s mm, Hintergrund %s mm, %d Prozesse' % (de(M['cell'], 2), de(M['cell'] * 2 ** M.get('level', 0), 2), M.get('nProc', 1))))
if SHOT:
    eingaben.append(('Schusskurve', '%s · Kolben Ø %s mm · Kammer %s mm · Füllgrad %s %%' % (SHOT.get('label', SHOT.get('mode', '')), de(SHOT.get('diam'), 1), de(SHOT.get('length'), 0), de(100 * SHOT.get('phi', 0), 1))))
    eingaben.append(('Rechnung', 'mit Gießkammer ab Kolbenstart' if CONF.get('moving') else 'ab „Kammer voll"'))
if FALL.get('process'):
    P = FALL['process']
    eingaben.append(('Temperaturen', 'Guss %s °C · Form %s °C · Liquidus %s °C · Solidus %s °C' % (de(P['Tcast'], 0), de(P['Tdie'], 0), de(P['Tliq'], 0), de(P['Tsol'], 0))))
    eingaben.append(('Schmelze', 'ρ %s kg/m³ · μ %s Pa·s · c_p %s J/(kg·K)' % (de(P['rho'], 0), ('%.3g' % P['mu']).replace('.', ','), de(P['cp'], 0))))
if FALL.get('outlets'):
    eingaben.append(('Auslässe', ', '.join(FALL['outlets'])))

css = '''
:root{--ink:%(ink)s;--muted:%(muted)s;--line:%(line)s;--soft:%(soft)s;--bg:%(bg)s;--card:%(card)s;--primary:%(primary)s;--primary-soft:%(primarySoft)s;--ok:%(ok)s;--ok-soft:%(okSoft)s;--caution:%(caution)s;--caution-soft:%(cautionSoft)s;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 16px 60px}
header{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:12px 24px;margin-bottom:22px}
h1{font-size:28px;line-height:1.15;margin:0 0 4px}
.sub{color:var(--muted);margin:0}
.pill{display:inline-block;padding:5px 12px;border-radius:999px;font-weight:600;font-size:13px}
.pill.ok{background:var(--ok-soft);color:var(--ok)}
.pill.caution{background:var(--caution-soft);color:var(--ink);border:1px solid var(--caution)}
section{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 18px 20px;margin:0 0 18px}
h2{font-size:18px;margin:0 0 12px}
.kz{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.kz div{border:1px solid var(--soft);border-left:4px solid var(--primary);border-radius:6px;padding:9px 12px}
.kz div.caution{border-left-color:var(--caution)}
.kz b{display:block;font-size:20px;line-height:1.25}
.kz span{font-size:12.5px;color:var(--muted)}
.kz small{display:block;font-size:12.5px;color:var(--muted);text-transform:none}
.bar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
.bar button{font:inherit;font-size:13.5px;padding:5px 11px;border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:6px;cursor:pointer}
.bar button.on{background:var(--primary);border-color:var(--primary);color:var(--card)}
.bar .lab{font-size:12px;color:var(--muted);align-self:center;margin-right:4px;min-width:62px}
.frame{background:var(--card);border:1px solid var(--soft);border-radius:8px;overflow:hidden}
.frame img{display:block;width:100%%;height:auto}
.ctl{display:flex;align-items:center;gap:10px;margin-top:10px}
.ctl input[type=range]{flex:1;accent-color:var(--primary)}
.ctl button{font:inherit;width:38px;height:34px;border:1px solid var(--line);border-radius:6px;background:var(--card);color:var(--primary);cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.cap{font-size:13.5px;color:var(--muted);margin-top:6px;min-height:20px}
.charts{display:grid;grid-template-columns:repeat(auto-fill,minmax(440px,1fr));gap:16px}
figure{margin:0;position:relative}
figcaption{font-size:13px;color:var(--muted);margin:2px 0 0}
figure h3{font-size:15px;margin:0 0 4px}
.chart{width:100%%;height:auto;display:block;touch-action:none}
.chart .tk{font-size:11px;fill:var(--muted)}
.chart .ax{font-size:12px;fill:var(--ink)}
.chart .lg{font-size:12px;fill:var(--ink)}
.chart .mk{font-size:10.5px;fill:var(--muted)}
.tip{position:absolute;pointer-events:none;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:4px 8px;font-size:12.5px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.12);display:none}
table{border-collapse:collapse;width:100%%}
th,td{text-align:left;vertical-align:top;padding:6px 10px;border-bottom:1px solid var(--soft);font-size:14px}
th{width:170px;color:var(--muted);font-weight:500}
.files a{color:var(--primary)}
footer{color:var(--muted);font-size:12.5px;text-align:center}
.leer{color:var(--muted)}
@media (max-width:560px){.charts{grid-template-columns:1fr}h1{font-size:22px}th{width:110px}.bar .lab{min-width:0;width:100%%}}
''' % {'ink': farbe('text'), 'muted': farbe('muted'), 'line': farbe('border'), 'soft': farbe('borderLight'), 'bg': farbe('viewport'),
       'card': farbe('surface'), 'primary': farbe('primary'), 'primarySoft': farbe('primary', 0.12), 'ok': farbe('ok'), 'okSoft': farbe('ok', 0.14),
       'caution': farbe('caution'), 'cautionSoft': farbe('caution', 0.16)}

kz_html = ''.join('<div class="%s"><span>%s</span><b>%s</b><small>%s</small></div>' % (v or '', html.escape(a), html.escape(b), html.escape(c)) for a, b, c, v in KZ)
if BILD.get('images'):
    bilder_html = ('<div class="bar" id="ansichten"></div><div class="bar" id="kennwerte"></div>'
                   '<div class="frame"><img id="bild" alt="Bild der Formfüllung"></div>'
                   '<div class="ctl" id="ctl"><button type="button" id="play" aria-label="Abspielen"></button>'
                   '<input type="range" id="regler" min="0" value="0" aria-label="Zeitpunkt"></div><div class="cap" id="cap"></div>')
else:
    bilder_html = '<p class="leer">Keine Bilder: <code>pvbatch bilder.py</code> im Hauptordner schreibt sie (braucht ParaView).</p>'
graph_html = ''.join('<figure><h3>%s</h3>%s<figcaption>%s · <a href="graphiken/%s.svg">SVG</a></figcaption><div class="tip"></div></figure>' % (html.escape(t), svg, html.escape(tx), i) for i, t, tx, svg, _ in GRAPH) or '<p class="leer">Keine Zeitreihen gefunden.</p>'
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
    cap.textContent = f ? ('Bild ' + (k + 1) + ' von ' + l.length + ' · t = ' + de(1000 * f.tc, 1) + ' ms · Füllgrad ' + de(100 * f.fill, 0) + ' %' + (isFinite(f.piston) && f.piston !== null ? ' · Kolben ' + de(f.piston, 0) + ' mm' : '')) : 'am Ende der Rechnung';
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
'''.replace('__BILD__', json.dumps(BILD, ensure_ascii=False)).replace('__GRAPH__', json.dumps({i: j for i, _, _, _, j in GRAPH}))

jetzt = datetime.datetime.now().strftime('%d.%m.%Y, %H:%M')
seite = '''<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>__TITEL__ · Bericht</title>
<style>__CSS__</style>
</head>
<body>
<main>
<header>
  <div><h1>__TITEL__</h1><p class="sub">Formfüllung mit dieLogicFoam · Bericht vom __JETZT__</p></div>
  <span class="pill __STATUSK__">__STATUS__</span>
</header>
<section><h2>Kennzahlen</h2><div class="kz">__KZ__</div></section>
<section><h2>Bilder</h2>__BILDER__</section>
<section><h2>Verläufe</h2><div class="charts">__GRAPH__</div></section>
<section><h2>Der Fall</h2><table>__EINGABEN__</table><p class="files">Daten (CSV, Trennzeichen Semikolon): __FILES__</p></section>
<footer>DieLogic · Simulation einrichten · Ordner: simulation (OpenFOAM), auswertung (dieser Bericht, bilder, graphiken, daten)</footer>
</main>
<script>__JS__</script>
</body>
</html>
'''
for a, b in (('__CSS__', css), ('__TITEL__', html.escape(CONF.get('title', 'Simulation'))), ('__JETZT__', jetzt),
             ('__STATUSK__', status[0]), ('__STATUS__', html.escape(status[1])), ('__KZ__', kz_html), ('__BILDER__', bilder_html),
             ('__GRAPH__', graph_html), ('__EINGABEN__', zeilen_html(eingaben + RECHNUNG)), ('__FILES__', files_html or '–'), ('__JS__', js)):
    seite = seite.replace(a, b)
with open(os.path.join(AUS, 'bericht.html'), 'w', encoding='utf-8') as fh:
    fh.write(seite)
print('Bericht:', os.path.join(AUS, 'bericht.html'), '·', len(GRAPH), 'Graphiken')
`;
