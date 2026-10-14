/* bilder.py: die Bilder der Auswertung, ein pvbatch-Skript (ParaView 5.10 …
   5.13) im Hauptordner des Falls. Es liest nicht die Zeitstände des Netzes,
   sondern die Oberflächen, die dieLogicFoam während der Rechnung schreibt
   (Funktionsobjekt `oberflaechen` in simulation/system/auswertung, EnSight):

     schmelze   die Isofläche alpha.melt = 0,5 mit den Werten ihrer Zellen
     wand       alle Randflächen mit den Werten der Zellen dahinter
     luft       die Isofläche gasTrapped = 0,5 (eingeschlossene Gasnester)

   Die Wand bekommt Punktwerte (Mittel der Nachbarn) und wird bei
   alpha = 0,5 punktweise abgeschnitten; mit der Isofläche zusammen ist das
   die geschlossene Hülle der Schmelze — glatt, nicht in Zellblöcken.

   Die Einstellungen kommen aus auswertung.json (render.js, auswertungConfig),
   das Skript selbst ist fester Text: String.raw, damit die Python-Strings
   ihre Rückstriche behalten. */

export const BILDER_PY = String.raw`#!/usr/bin/env pvbatch
# Bilder der Formfüllung — im Hauptordner des Falls:  pvbatch bilder.py
#   → auswertung/bilder/<Ansicht>/<Kennwert>/001.png …, auswertung/bilder/bilder.json
# Erzeugt von DieLogic · Füllsimulation. Die Einstellungen stehen in
# auswertung.json (Kennwerte, Zeitpunkte, Format, Ansichten, Farben).
# Gelesen werden die Oberflächen aus simulation/postProcessing/oberflaechen
# (während der Rechnung geschrieben), die Füllung aus .../fuellung.
import bisect, glob, json, math, os, sys
from paraview.simple import *
from vtk.numpy_interface import dataset_adapter as dsa
import numpy as np

HAUPT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HAUPT, 'auswertung.json'), encoding='utf-8') as fh:
    CONF = json.load(fh)
PP = os.path.join(HAUPT, 'simulation', 'postProcessing')
OUT = os.path.join(HAUPT, 'auswertung', 'bilder')
os.makedirs(OUT, exist_ok=True)


def zahl(s):
    try:
        return float(s)
    except ValueError:
        return None


def reihe(name):
    """Zeitreihe eines Funktionsobjekts → (Spaltennamen, Zeilen). Nach einem
    Neustart schreibt OpenFOAM in einen neuen Ordner (Startzeit); was er
    abdeckt, ersetzt das Ältere."""
    kopf, zeilen = [], []
    ordner = [d for d in glob.glob(os.path.join(PP, name, '*')) if zahl(os.path.basename(d)) is not None]
    for d in sorted(ordner, key=lambda d: zahl(os.path.basename(d))):
        start = zahl(os.path.basename(d))
        for f in sorted(glob.glob(os.path.join(d, '*.dat'))):
            neu = []
            with open(f, encoding='utf-8', errors='replace') as fh:
                zeilen_ = fh.read().splitlines()
            for z in zeilen_:
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


# ── Füllgrad der Form über der Zeit (Funktionsobjekt fuellung) ──────────
_, FU = reihe('fuellung')
FT = [r[0] for r in FU]
FV = [max(0.0, min(1.0, r[1])) for r in FU]


def fuellgrad(t):
    if not FT:
        return float('nan')
    i = bisect.bisect_left(FT, t)
    if i <= 0:
        return FV[0]
    if i >= len(FT):
        return FV[-1]
    a, b = FT[i - 1], FT[i]
    return FV[i - 1] + (FV[i] - FV[i - 1]) * ((t - a) / (b - a) if b > a else 1)


# Kolbenweg je Zeit (Tabelle der Schusskurve: Kurvenzeit [s], Weg [mm])
PST = CONF.get('piston') or []


def kolben(t):
    if not PST:
        return float('nan')
    tc = t + CONF.get('tOffset', 0)
    ts = [r[0] for r in PST]
    i = bisect.bisect_left(ts, tc)
    if i <= 0:
        return PST[0][1]
    if i >= len(PST):
        return PST[-1][1]
    (ta, sa), (tb, sb) = PST[i - 1], PST[i]
    return sa + (sb - sa) * (tc - ta) / (tb - ta) if tb > ta else sb


# ── Die Oberflächen ──────────────────────────────────────────────────────
def ensight(fo, name):
    p = os.path.join(PP, fo, name, name + '.case')
    if not os.path.isfile(p):
        return None
    r = EnSightReader(CaseFileName=p)
    r.UpdatePipelineInformation()
    return r


def zeiten(r):
    if r is None:
        return []
    t = r.TimestepValues
    return list(t) if hasattr(t, '__len__') else [t]


WAND, SCHM, LUFT = ensight('oberflaechen', 'wand'), ensight('oberflaechen', 'schmelze'), ensight('oberflaechen', 'luft')
ENDE_W, ENDE_S = ensight('ende', 'wand'), ensight('ende', 'schmelze')
if WAND is None or SCHM is None:
    sys.exit('Keine Oberflächen in simulation/postProcessing/oberflaechen — ist die Rechnung gelaufen?')
TIMES = zeiten(WAND)
if not TIMES:
    sys.exit('Die Oberflächen haben keine Zeiten.')
FILL = [fuellgrad(t) for t in TIMES]
print('Oberflächen:', len(TIMES), 'Zeiten,', 'Füllgrad bis %.1f %%' % (100 * max(f for f in FILL if f == f)) if FT else 'ohne Füllgrad')

# ── Die Zeitpunkte der Bilder ────────────────────────────────────────────
by, tg = CONF['when']['by'], CONF['targets']
if by == 'fill' and not FT:
    print('Keine Füllung (fuellung) gefunden: Bilder in gleichen Zeitabständen.')
    by = 'time'
start = next((i for i, f in enumerate(FILL) if f > 0.005), 0)     # die Schmelze kommt in der Form an
idx = list(range(start, len(TIMES)))


def naechste(werte, x):
    return min(idx, key=lambda i: abs(werte[i] - x))


picks = []
if by == 'fill':
    erreicht = 100 * max(FILL)
    for p in tg:
        if p > erreicht + 3:
            print('nicht erreicht (Füllgrad bis %.0f %%): %g %%' % (erreicht, p))
            continue
        picks.append(naechste([100 * f for f in FILL], p))
elif by == 'time':
    t0, t1 = TIMES[start], TIMES[-1]
    picks = [naechste(TIMES, t0 + (t1 - t0) * q) for q in tg]
else:
    s = [kolben(t) for t in TIMES]
    s0, s1 = s[start], s[-1]
    picks = [naechste(s, s0 + (s1 - s0) * q) for q in tg]
# dieselbe Zeit zweimal ist ein Bild zu viel
gesehen, BILDER = set(), []
for i in picks:
    if i not in gesehen:
        gesehen.add(i)
        BILDER.append(i)
print('Bilder je Kennwert:', len(BILDER))

# ── Kennwerte: Ausdruck auf den Punktwerten, Leiste, Bereich ─────────────
Tc, Ts = CONF['Tcast'], CONF['Tsol']
t0ms = 1000.0 * CONF.get('fillFrom', 0)       # Füllzeit ab „Kammer voll"
KW = {
  'velocity':    dict(label='Geschwindigkeit', unit='m/s', expr='magU', need=['magU'], map='rainbow', log=False, range=[0, 50]),
  'temperature': dict(label='Temperatur', unit='°C', expr='T-273.15', need=['T'], map='inferno', log=False, range=[Ts - 40, Tc]),
  'air':         dict(label='Lufteinschluss', unit='%', expr='airEntrained*100', need=['airEntrained'], map='bgo', log=False, range=[0, 100]),
  'oxide':       dict(label='Oxide', unit='ppm', expr='max(oxide*1e6,1e-3)', need=['oxide'], map='plasma', log=True, range=[0.1, 1000]),
  'trapped':     dict(label='Eingeschlossene Luft', unit='bar', expr=None, need=['pGas'], map='blues', log=True, range=[1, 50]),
  'fillTime':    dict(label='Füllzeit', unit='ms', expr='max(fillTime*1000-%.6g,0)' % t0ms, need=['fillTime'], map='viridis', log=False, range=None),
  'solid':       dict(label='Erstarrt', unit='–', expr='solidFraction', need=['solidFraction'], map='festanteil', log=False, range=[0, 1]),
}
MAPS = CONF.get('maps') or {}
COL = CONF.get('colors') or {}
INK = COL.get('text', [0.1, 0.12, 0.14])


def faerben(lut, name, lo, hi, log):
    """Leiste „name" auf lo … hi: die Vorgabe von ParaView, wenn die Leiste
    eine nennt (Regenbogen, Blue - Green - Orange), sonst die Stützstellen
    der Palette. Darüber: eigene Farbe (Pink beim Regenbogen) oder die
    oberste der Leiste."""
    m = MAPS.get(name) or {}
    stops = m.get('stops') or CONF.get('heat')
    done = False
    if m.get('preset'):
        try:
            done = bool(lut.ApplyPreset(m['preset'], True))
        except Exception:
            done = False
    if done:
        lut.RescaleTransferFunction(lo, hi)
    else:
        if log:
            a, b = math.log10(lo), math.log10(hi)
            pts = [10 ** (a + (b - a) * s[0]) for s in stops]
        else:
            pts = [lo + (hi - lo) * s[0] for s in stops]
        lut.RGBPoints = [v for s, x in zip(stops, pts) for v in (x, s[1], s[2], s[3])]
        lut.ColorSpace = 'RGB'
    lut.AutomaticRescaleRangeMode = 'Never'
    lut.UseLogScale = 1 if log else 0
    if m.get('over'):
        lut.UseAboveRangeColor = 1
        lut.AboveRangeColor = m['over']
    else:
        lut.UseAboveRangeColor = 0


W, H = CONF['size']
F = CONF['frame']
view = CreateRenderView()
view.ViewSize = [W, H]
view.Background = [1, 1, 1]
try:
    view.UseColorPaletteForBackground = 0
except Exception:
    pass
view.OrientationAxesVisibility = 1


def punkte(src):
    """Zellwerte → Punktwerte (Mittel der Nachbarn), ein Datensatz."""
    c = CellDatatoPointData(Input=MergeBlocks(Input=src))
    c.PassCellData = 0
    return c


def darueber(src, name, wert):
    """punktweise abschneiden: bleibt, wo name ≥ wert."""
    c = Clip(Input=src)
    c.ClipType = 'Scalar'
    c.Scalars = ['POINTS', name]
    c.Value = wert
    c.Invert = 0
    return c


def einfarbig(rep, farbe):
    """ohne Kennwert, in einer Farbe (ColorBy(rep, None) scheitert in
    ParaView 5.13, wenn die Darstellung noch nie gefärbt war)."""
    try:
        ColorBy(rep, None)
    except Exception:
        rep.ColorArrayName = ['POINTS', '']
    rep.DiffuseColor = farbe
    rep.AmbientColor = farbe


def glatt(src):
    s = ExtractSurface(Input=src)
    n = GenerateSurfaceNormals(Input=s)
    n.FeatureAngle = 50
    return n


# die Form als blasse Hülle
huelle = Show(MergeBlocks(Input=WAND), view)
einfarbig(huelle, COL.get('shell', [0.55, 0.6, 0.64]))
huelle.Opacity = 0.12


def schmelze(wand, schm):
    wp = punkte(wand)
    teile = [darueber(wp, 'alphamelt', 0.5)]
    if schm is not None:
        teile.append(punkte(schm))
    return glatt(AppendDatasets(Input=teile))


MELT = schmelze(WAND, SCHM)
ENDE = schmelze(ENDE_W, ENDE_S) if ENDE_W is not None else None


def nester():
    """Eingeschlossene Gasnester: die Wand, wo gasTrapped ≥ 0,5, und die
    Isofläche gasTrapped = 0,5 — je zusammenhängendes Nest der höchste
    Gasdruck darin (das Gasmodell rechnet je Nest einen Druck). Das Maximum
    je Nest rechnet das Skript selbst (numpy) und gibt das Ergebnis über
    einen TrivialProducer weiter: ein ProgrammableFilter importiert seine
    Hilfen (max, min …) in den Namensraum dieses Skripts."""
    teile = [darueber(punkte(WAND), LUFTFELD, 0.5)]
    if LUFT is not None:
        teile.append(punkte(LUFT))
    flaeche = Clean(Input=ExtractSurface(Input=AppendDatasets(Input=teile)))
    con = Connectivity(Input=flaeche)
    con.ColorRegions = 1
    prod = TrivialProducer()

    def zu(t):
        con.UpdatePipeline(t)
        d = con.GetClientSideObject().GetOutputDataObject(0)
        out = d.NewInstance()
        out.DeepCopy(d)
        w = dsa.WrapDataObject(out)
        n = out.GetNumberOfPoints()
        p = np.ones(n)
        if n:
            pg = np.asarray(w.PointData['pGas']) / 1e5
            rid = np.asarray(w.PointData['RegionId'])
            for r in np.unique(rid):
                m = rid == r
                p[m] = np.maximum(1.0001, pg[m].max())
        w.PointData.append(p, 'pNest')
        prod.GetClientSideObject().SetOutput(out)
        prod.MarkModified(prod)
        prod.UpdatePipeline(t)

    return glatt(prod), zu


fs = max(12, int(22 * H / 1000))
titel = Text(Text='')
titelDisp = Show(titel, view)
titelDisp.WindowLocation = 'Upper Right Corner'
titelDisp.FontSize = fs
titelDisp.Color = INK


def rechne(src, name, expr):
    c = Calculator(Input=src)
    c.AttributeType = 'Point Data'
    c.ResultArrayName = name
    c.Function = expr
    return c


def bereich(src, name, zeiten_):
    hi = -float('inf')
    for t in zeiten_:
        src.UpdatePipeline(t)
        a = src.PointData.GetArray(name)
        if a is not None and a.GetNumberOfTuples():
            hi = max(hi, a.GetRange()[1])
    return [0.0, hi if hi > 0 else 1.0]


def kamera(v):
    view.CameraParallelProjection = 0
    if 'pos' in v:
        # genau die Ansicht der Seite: Lage, Ziel, oben, Öffnungswinkel (senkrecht)
        view.CameraPosition, view.CameraFocalPoint, view.CameraViewUp = v['pos'], v['target'], v['up']
        view.CameraViewAngle = v['fov']
        return
    b = MergeBlocks(Input=WAND).GetDataInformation().GetBounds()
    c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]
    d = v['dir']
    n = math.sqrt(sum(x * x for x in d)) or 1
    view.CameraFocalPoint = c
    view.CameraPosition = [c[k] + d[k] / n for k in range(3)]
    view.CameraViewUp = v['up']
    view.ResetCamera(False)
    GetActiveCamera().Dolly(1.25)


def unterzeile(t):
    s = kolben(t)
    tc = 1000 * (t + CONF.get('tOffset', 0))
    txt = 't = %.1f ms · Füllgrad %.0f %%' % (tc, 100 * fuellgrad(t))
    if s == s:
        txt += ' · Kolben %.0f mm' % s
    return txt


ARRAYS = set(WAND.CellArrays.Available) if hasattr(WAND.CellArrays, 'Available') else set(WAND.CellArrays)
ENDE_ARRAYS = set(ENDE_W.CellArrays.Available) if ENDE_W is not None and hasattr(ENDE_W.CellArrays, 'Available') else set()
print('Felder der Wand:', ', '.join(sorted(ARRAYS)))
# eingeschlossene Luft: luftEin (Anteil eingeschlossener Luft je Zelle); ältere Fälle hatten nur gasTrapped
LUFTFELD = 'luftEin' if 'luftEin' in ARRAYS else 'gasTrapped'
liste = {'views': [], 'criteria': [], 'frames': [], 'images': {}}
for k, i in enumerate(BILDER):
    t = TIMES[i]
    liste['frames'].append({'k': k + 1, 't': t, 'tc': t + CONF.get('tOffset', 0), 'fill': FILL[i], 'piston': kolben(t)})

for v in CONF['views']:
    liste['views'].append({'id': v['id'], 'label': v.get('label', v['id'])})
    kamera(v)
    for cid in CONF['criteria']:
        kw = KW.get(cid)
        if not kw:
            continue
        ende = cid == 'fillTime'
        if any(f not in (ENDE_ARRAYS if ende else ARRAYS) for f in kw['need']) or (cid == 'trapped' and LUFTFELD not in ARRAYS):
            print('übersprungen (Feld fehlt):', cid)
            continue
        vorher = None                    # je Bild vorher zu tun (Gasnester)
        if cid == 'trapped':
            quelle, vorher = nester()
            name = 'pNest'
            vorher(TIMES[BILDER[0]] if BILDER else TIMES[-1])
        else:
            quelle, name = rechne(ENDE if ende else MELT, cid, kw['expr']), cid
        schuesse = [(1, zeiten(ENDE_W)[-1])] if ende else [(k + 1, TIMES[i]) for k, i in enumerate(BILDER)]
        if not schuesse:
            continue
        rng = kw['range'] or bereich(quelle, name, [t for _, t in schuesse])
        if rng[1] <= rng[0]:
            rng = [rng[0], rng[0] + 1]
        disp = Show(quelle, view)
        ColorBy(disp, ('POINTS', name))
        lut = GetColorTransferFunction(name)
        faerben(lut, kw['map'], rng[0], rng[1], kw['log'])
        bar = GetScalarBar(lut, view)
        bar.Title = kw['label']
        bar.ComponentTitle = '[' + kw['unit'] + ']' + (' — darüber Pink' if (MAPS.get(kw['map']) or {}).get('over') else '')
        # oben links, mit Rand — wie die Vorschau der Seite (FRAME)
        bar.WindowLocation = 'Any Location'
        bar.Orientation = 'Vertical'
        bar.HorizontalTitle = 1          # Titel waagerecht über der Leiste
        bar.TitleJustification = 'Left'  # linksbündig: lange Titel laufen nicht über den Bildrand
        bar.Position = [F['barX'], 1.0 - F['barTop'] - F['barLen']]
        bar.ScalarBarLength = F['barLen']
        bar.ScalarBarThickness = max(8, int(F['barW'] * W))
        bar.TitleColor = INK
        bar.LabelColor = INK
        bar.TitleFontSize = fs + 2
        bar.LabelFontSize = fs - 2
        bar.RangeLabelFormat = '%-.4g'
        bar.Visibility = 1
        ordner = os.path.join(OUT, v['id'], cid)
        os.makedirs(ordner, exist_ok=True)
        dateien = []
        for k, t in schuesse:
            if vorher:
                vorher(t)
            view.ViewTime = t
            titel.Text = '%s · %s\n%s' % (CONF['title'], kw['label'], unterzeile(t))
            fn = '%03d.png' % k
            SaveScreenshot(os.path.join(ordner, fn), view, ImageResolution=[W, H])
            dateien.append(v['id'] + '/' + cid + '/' + fn)
        print('Bilder', v['id'], cid, len(dateien))
        liste['images'][v['id'] + '/' + cid] = dateien
        if not any(c['id'] == cid for c in liste['criteria']):
            liste['criteria'].append({'id': cid, 'label': kw['label'], 'unit': kw['unit'], 'end': ende})
        Hide(quelle, view)
        bar.Visibility = 0

# ── Die Gasnester am Ende: je Nest Volumen, Druck, Lage ─────────────────
def nestDaten(t):
    """Die Nester zur Zeit t: Wand mit gasTrapped ≥ 0,5 und Isofläche,
    verschweißt, in Dreiecken, je zusammenhängendes Stück einheitlich nach
    außen gerichtet. Volumen aus der Hülle (Gaußscher Satz; wo die Hülle
    nicht ganz schließt, eine Näherung), Druck der höchste darin, Lage der
    Flächenschwerpunkt."""
    from vtkmodules.vtkFiltersCore import vtkPolyDataNormals
    teile = [darueber(punkte(WAND), LUFTFELD, 0.5)]
    if LUFT is not None:
        teile.append(punkte(LUFT))
    fl = Triangulate(Input=Clean(Input=ExtractSurface(Input=AppendDatasets(Input=teile))))
    con = Connectivity(Input=fl)
    con.ColorRegions = 1
    con.UpdatePipeline(t)
    d = con.GetClientSideObject().GetOutputDataObject(0)
    if d is None or d.GetNumberOfCells() == 0:
        return []
    nf = vtkPolyDataNormals()
    nf.SetInputData(d)
    nf.ConsistencyOn()
    nf.AutoOrientNormalsOn()
    nf.SplittingOff()
    nf.ComputePointNormalsOff()
    nf.ComputeCellNormalsOn()
    nf.Update()
    w = dsa.WrapDataObject(nf.GetOutput())
    P = np.asarray(w.Points)
    pg = np.asarray(w.PointData['pGas']) / 1e5
    rid_p = np.asarray(w.PointData['RegionId'])
    polys = w.GetPolys()
    conn = np.asarray(dsa.vtkDataArrayToVTKArray(polys.GetConnectivityArray()))
    tri = conn.reshape(-1, 3)
    a, b, c = P[tri[:, 0]], P[tri[:, 1]], P[tri[:, 2]]
    vol6 = np.einsum('ij,ij->i', a, np.cross(b, c))
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    cen = (a + b + c) / 3
    rid = rid_p[tri[:, 0]]
    nester = []
    for r in np.unique(rid):
        m = rid == r
        A = area[m].sum()
        if A <= 0:
            continue
        V = abs(vol6[m].sum()) / 6
        lage = (cen[m] * area[m][:, None]).sum(0) / A
        nester.append({'v': float(V * 1e6), 'p': float(max(1.0, pg[rid_p == r].max())), 'x': float(lage[0] * 1e3), 'y': float(lage[1] * 1e3), 'z': float(lage[2] * 1e3), 'a': float(A * 1e4)})
    nester.sort(key=lambda n: -n['v'])
    return nester


if LUFTFELD in ARRAYS and 'pGas' in ARRAYS:
    try:
        tE = TIMES[-1]
        liste['nester'] = {'t': tE, 'tc': tE + CONF.get('tOffset', 0), 'fill': FILL[-1], 'liste': nestDaten(tE)}
        print('Gasnester am Ende:', len(liste['nester']['liste']), ' zusammen %.2f cm³' % sum(n['v'] for n in liste['nester']['liste']))
    except Exception as e:
        print('Gasnester nicht ausgewertet:', e)

with open(os.path.join(OUT, 'bilder.json'), 'w', encoding='utf-8') as fh:
    json.dump(liste, fh, ensure_ascii=False, indent=1)
print(sum(len(x) for x in liste['images'].values()), 'Bilder in', OUT)
`;
