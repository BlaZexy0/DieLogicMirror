/* bilder.py der Erstarrung: ein pvbatch-Skript (ParaView 5.10 … 5.13) im
   Hauptordner des Falls. Es liest

     postProcessing/gussteil/…/oberflaeche   die Oberfläche des Gussteils am
                                             Ende (faceZone casting) mit
                                             Erstarrungszeit, Porosität,
                                             Formtemperatur, Klebeindex
     postProcessing/erstarrung/restschmelze  die Restschmelze (Festanteil 0,7)
                                             als Isofläche über der Zeit,
                                             mit dem Zustand der Speisung
     den letzten Zeitstand (case.foam)       für die Poren im Innern

   und schreibt auswertung/bilder/<Ansicht>/<Kennwert>/NNN.png und
   bilder.json — im selben Aufbau wie bei „Simulation einrichten", damit der
   Bericht denselben Betrachter hat. Fester Text: String.raw. */

export const SOL_BILDER_PY = String.raw`#!/usr/bin/env pvbatch
# Bilder der Erstarrung — im Hauptordner des Falls:  pvbatch bilder.py
#   → auswertung/bilder/<Ansicht>/<Kennwert>/001.png …, auswertung/bilder/bilder.json
# Erzeugt von DieLogic · Erstarrung einrichten. Einstellungen: auswertung.json.
import bisect, glob, json, math, os, sys
from paraview.simple import *
from vtk.numpy_interface import dataset_adapter as dsa
import numpy as np

HAUPT = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HAUPT, 'auswertung.json'), encoding='utf-8') as fh:
    CONF = json.load(fh)
SIM = os.path.join(HAUPT, 'simulation')
PP = os.path.join(SIM, 'postProcessing')
OUT = os.path.join(HAUPT, 'auswertung', 'bilder')
os.makedirs(OUT, exist_ok=True)
POST = CONF['post']
COL = CONF.get('colors') or {}
INK = COL.get('text', [0.1, 0.12, 0.14])
HEAT = CONF.get('heat') or [[0, 0.05, 0.03, 0.2], [0.5, 0.8, 0.2, 0.3], [1, 1, 0.95, 0.6]]


def zahl(s):
    try:
        return float(s)
    except ValueError:
        return None


def ensight(muster):
    f = sorted(glob.glob(os.path.join(PP, muster)))
    if not f:
        return None
    r = EnSightReader(CaseFileName=f[-1])
    r.UpdatePipelineInformation()
    return r


def zeiten(r):
    if r is None:
        return []
    t = r.TimestepValues
    return list(t) if hasattr(t, '__len__') else [t]


# Restschmelze über der Zeit (solidification.dat: liquidFraction)
REST = []
for f in sorted(glob.glob(os.path.join(PP, 'dieLogicSol', 'solidification.dat'))):
    with open(f, encoding='utf-8', errors='replace') as fh:
        for z in fh:
            if z.startswith('#'):
                continue
            w = [zahl(x) for x in z.split()]
            if len(w) > 6 and None not in w:
                REST.append((w[0], w[6]))
RT = [t for t, _ in REST]


def rest(t):
    if not REST:
        return float('nan')
    i = min(max(bisect.bisect_left(RT, t), 1), len(REST) - 1)
    (ta, a), (tb, b) = REST[i - 1], REST[i]
    return a + (b - a) * ((t - ta) / (tb - ta) if tb > ta else 1)


OBER = ensight(os.path.join('gussteil', '*', 'oberflaeche.case')) or ensight(os.path.join('gussteil', 'oberflaeche', 'oberflaeche.case')) \
    or ensight(os.path.join('gussteil', '**', 'oberflaeche.case'))
RESTS = ensight(os.path.join('erstarrung', 'restschmelze', 'restschmelze.case')) or ensight(os.path.join('erstarrung', '*', 'restschmelze.case'))
if OBER is None:
    sys.exit('Keine Oberfläche des Gussteils in simulation/postProcessing/gussteil — ist die Rechnung bis zum Ende gelaufen?')
TEND = zeiten(OBER)[-1] if zeiten(OBER) else 0
print('Oberfläche des Gussteils bei t =', TEND)

W = int(POST.get('width', 1600))
ASP = {'16:9': 16 / 9, '3:2': 1.5, '4:3': 4 / 3, '1:1': 1.0, '9:16': 9 / 16}.get(POST.get('aspect', '16:9'), 16 / 9)
H = 2 * int(round(W / ASP / 2))
view = CreateRenderView()
view.ViewSize = [W, H]
view.Background = [1, 1, 1]
try:
    view.UseColorPaletteForBackground = 0
except Exception:
    pass
view.OrientationAxesVisibility = 1
fs = max(14, int(28 * H / 1000))


def punkte(src):
    c = CellDatatoPointData(Input=MergeBlocks(Input=src))
    c.PassCellData = 1
    return c


def glatt(src):
    s = ExtractSurface(Input=src)
    n = GenerateSurfaceNormals(Input=s)
    n.FeatureAngle = 50
    return n


def einfarbig(rep, farbe):
    try:
        ColorBy(rep, None)
    except Exception:
        rep.ColorArrayName = ['POINTS', '']
    rep.DiffuseColor = farbe
    rep.AmbientColor = farbe


def faerben(lut, lo, hi):
    lut.RGBPoints = [v for s in HEAT for v in (lo + (hi - lo) * s[0], s[1], s[2], s[3])]
    lut.ColorSpace = 'RGB'
    lut.AutomaticRescaleRangeMode = 'Never'
    lut.UseLogScale = 0


def schwelle(src, feld, lo, hi, art='CELLS'):
    t = Threshold(Input=src)
    t.Scalars = [art, feld]
    try:
        t.LowerThreshold, t.UpperThreshold = lo, hi
        try:
            t.ThresholdMethod = 'Between'
        except Exception:
            pass
    except Exception:
        t.ThresholdRange = [lo, hi]
    return t


def rechne(src, name, expr):
    c = Calculator(Input=src)
    c.AttributeType = 'Point Data'
    c.ResultArrayName = name
    c.Function = expr
    return c


def bereich(src, name, t):
    src.UpdatePipeline(t)
    a = src.PointData.GetArray(name) or src.CellData.GetArray(name)
    return list(a.GetRange()) if a is not None and a.GetNumberOfTuples() else [0.0, 1.0]


titel = Text(Text='')
titelDisp = Show(titel, view)
titelDisp.WindowLocation = 'Upper Right Corner'
titelDisp.FontSize = fs
titelDisp.Color = INK
# die Legende der Erstarrungsfolge: zwei Einträge in ihren Farben
LEGENDE = []
for k, (txt, rolle, ersatz) in enumerate((('gespeist vom Pressrest', 'primary', [0, 0.55, 0.51]),
                                         ('abgeschnitten — wird zur Pore', 'melt', [0.91, 0.37, 0.03]))):
    t_ = Text(Text=txt)
    d_ = Show(t_, view)
    d_.WindowLocation = 'Any Location'
    d_.Position = [0.62, 0.09 - 0.05 * k]
    d_.FontSize = fs
    d_.Color = COL.get(rolle, ersatz)
    d_.Visibility = 0
    LEGENDE.append(d_)


def leiste(lut, titel_, einheit):
    bar = GetScalarBar(lut, view)
    bar.Title = titel_
    bar.ComponentTitle = '[' + einheit + ']'
    bar.WindowLocation = 'Any Location'
    bar.Orientation = 'Vertical'
    bar.HorizontalTitle = 1
    bar.TitleJustification = 'Left'
    bar.Position = [0.05, 0.5]
    bar.ScalarBarLength = 0.4
    bar.ScalarBarThickness = max(8, int(0.012 * W))
    bar.TitleColor = INK
    bar.LabelColor = INK
    bar.TitleFontSize = fs + 2
    bar.LabelFontSize = fs - 2
    bar.RangeLabelFormat = '%-.4g'
    bar.Visibility = 1
    return bar


def kamera(v):
    """Blick aus der Richtung der Ansicht auf das ganze Gussteil: Abstand so,
    dass die Kugel um seine Box (Radius r) den Öffnungswinkel füllt — ohne
    ResetCamera, das vor dem ersten Show nichts zum Einpassen hat."""
    b = MergeBlocks(Input=OBER)
    b.UpdatePipeline(TEND)
    bb = b.GetDataInformation().GetBounds()
    c = [(bb[0] + bb[1]) / 2, (bb[2] + bb[3]) / 2, (bb[4] + bb[5]) / 2]
    r = 0.5 * math.sqrt((bb[1] - bb[0]) ** 2 + (bb[3] - bb[2]) ** 2 + (bb[5] - bb[4]) ** 2)
    d = v['dir']
    n = math.sqrt(sum(x * x for x in d)) or 1
    fov = 30.0
    # der senkrechte Öffnungswinkel; bei breiten Bildern zählt die Höhe
    half = math.radians(fov / 2) * min(1.0, W / H)
    dist = 0.92 * r / math.sin(half)
    view.CameraParallelProjection = 0
    view.CameraViewAngle = fov
    view.CameraFocalPoint = c
    view.CameraPosition = [c[k] + dist * d[k] / n for k in range(3)]
    view.CameraViewUp = v['up']


def inselzustand():
    """Die Restschmelze in Inseln (zusammenhängende Stücke der Isofläche),
    je Insel ein Zustand: abgeschnitten (2), sobald eine ihrer Zellen
    abgeschnitten ist, sonst gespeist (1). Auf Punkte gemittelt mischten
    sich 0 (fest), 1 und 2 an der Isofläche. Gerechnet mit numpy, weiter
    über einen TrivialProducer (wie die Gasnester bei der Füllung)."""
    con = Connectivity(Input=MergeBlocks(Input=RESTS))
    con.ColorRegions = 1
    prod = TrivialProducer()

    def zu(t):
        con.UpdatePipeline(t)
        d = con.GetClientSideObject().GetOutputDataObject(0)
        out = d.NewInstance()
        out.DeepCopy(d)
        w = dsa.WrapDataObject(out)
        n = out.GetNumberOfCells()
        z = np.ones(n)
        if n and 'feedingState' in w.CellData.keys() and 'RegionId' in w.CellData.keys():
            fsd = np.asarray(w.CellData['feedingState'])
            rid = np.asarray(w.CellData['RegionId'])
            for r in np.unique(rid):
                m = rid == r
                z[m] = 2.0 if fsd[m].max() > 1.5 else 1.0
        w.CellData.append(z, 'zustand')
        prod.GetClientSideObject().SetOutput(out)
        prod.MarkModified(prod)
        prod.UpdatePipeline(t)

    return prod, zu


OBERP = punkte(OBER)
HUELLE = glatt(OBERP)
# der letzte Zeitstand fürs Innere (Poren)
FOAM = os.path.join(SIM, 'case.foam')
open(FOAM, 'a').close()
VOL = None
try:
    VOL = OpenFOAMReader(FileName=FOAM)
    VOL.MeshRegions = ['internalMesh']
    VOL.CellArrays = ['porosity', 'material']
    VOL.UpdatePipelineInformation()
    TVOL = zeiten(VOL)[-1]
except Exception as e:
    print('Letzter Zeitstand nicht lesbar (Poren ohne Inneres):', e)

KW = {
    'solidTime': dict(label='Erstarrungszeit', unit='s', feld='solidificationTime', expr='solidificationTime'),
    'porosity': dict(label='Porosität', unit='%', feld='porosity', expr='porosity*100'),
    'dieTemp': dict(label='Formtemperatur höchstens', unit='°C', feld='dieSurfaceTmax', expr='dieSurfaceTmax-273.15'),
    'soldering': dict(label='Klebeindex', unit='–', feld='solderingIndex', expr='solderingIndex'),
}
ARR = set(OBER.CellArrays.Available) if hasattr(OBER.CellArrays, 'Available') else set(OBER.CellArrays)
print('Felder der Oberfläche:', ', '.join(sorted(ARR)))
liste = {'views': [], 'criteria': [], 'frames': [], 'images': {}}

# ── Erstarrungsfolge: Zeitpunkte ────────────────────────────────────────
FOLGE = []
if 'sequence' in POST['criteria'] and RESTS is not None:
    alle = zeiten(RESTS)
    m = MergeBlocks(Input=RESTS)
    voll = []
    for t in alle:
        m.UpdatePipeline(t)
        if m.GetDataInformation().GetNumberOfCells() > 0:
            voll.append(t)
    if voll:
        n = max(2, int(POST.get('frames', 40)))
        idx = sorted(set(int(round(i * (len(voll) - 1) / (n - 1))) for i in range(n)))
        FOLGE = [voll[i] for i in idx]
    print('Erstarrungsfolge:', len(FOLGE), 'Bilder von', len(alle), 'Zeiten')
    for k, t in enumerate(FOLGE):
        liste['frames'].append({'k': k + 1, 't': t, 'rest': rest(t)})

for v in CONF['views']:
    liste['views'].append({'id': v['id'], 'label': v.get('label', v['id'])})
    kamera(v)
    for cid in POST['criteria']:
        ordner = os.path.join(OUT, v['id'], cid)
        if cid == 'sequence':
            if not FOLGE:
                continue
            os.makedirs(ordner, exist_ok=True)
            shell = Show(HUELLE, view)
            einfarbig(shell, COL.get('part', [0.75, 0.79, 0.8]))
            shell.Opacity = 0.18
            inseln, zu = inselzustand()
            zu(FOLGE[0])                 # der Producer braucht Daten, bevor er gezeigt wird
            gesp = Show(glatt(schwelle(inseln, 'zustand', 0.5, 1.5)), view)
            einfarbig(gesp, COL.get('primary', [0, 0.55, 0.51]))
            abg = Show(glatt(schwelle(inseln, 'zustand', 1.5, 2.5)), view)
            einfarbig(abg, COL.get('melt', [0.91, 0.37, 0.03]))
            for d_ in LEGENDE:
                d_.Visibility = 1
            dateien = []
            for k, t in enumerate(FOLGE):
                zu(t)
                view.ViewTime = t
                r = rest(t)
                titel.Text = '%s · Restschmelze (Festanteil unter 0,7)\nt = %s s nach Füllende%s' % (CONF['title'], ('%.2f' % t).replace('.', ','), (' · noch %.0f %% flüssig' % (100 * r)) if r == r else '')
                fn = '%03d.png' % (k + 1)
                SaveScreenshot(os.path.join(ordner, fn), view, ImageResolution=[W, H])
                dateien.append(v['id'] + '/' + cid + '/' + fn)
            for d in (shell, gesp, abg):
                d.Visibility = 0
            for d_ in LEGENDE:
                d_.Visibility = 0
            liste['images'][v['id'] + '/' + cid] = dateien
            if not any(c['id'] == cid for c in liste['criteria']):
                liste['criteria'].append({'id': cid, 'label': 'Erstarrungsfolge', 'unit': '', 'end': False})
            print('Bilder', v['id'], cid, len(dateien))
            continue
        kw = KW.get(cid)
        if not kw or kw['feld'] not in ARR:
            print('übersprungen (Feld fehlt):', cid)
            continue
        os.makedirs(ordner, exist_ok=True)
        view.ViewTime = TEND
        zeigt = []
        if cid == 'porosity':
            shell = Show(HUELLE, view)
            einfarbig(shell, COL.get('part', [0.75, 0.79, 0.8]))
            shell.Opacity = 0.2
            zeigt.append(shell)
            if VOL is not None:
                guss = schwelle(VOL, 'material', -0.5, 0.5)
                poren = schwelle(guss, 'porosity', 0.005, 1.0)
                q = rechne(CellDatatoPointData(Input=poren), 'wert', kw['expr'])
                lo, hi = 0.5, max(1.0, bereich(q, 'wert', TVOL)[1])
                view.ViewTime = TVOL
            else:
                q = rechne(OBERP, 'wert', kw['expr'])
                lo, hi = 0.0, max(1.0, bereich(q, 'wert', TEND)[1])
        elif cid == 'dieTemp':
            # nur wo die Form anliegt (der Wert ist sonst 0 K): der Rest blass
            shell = Show(HUELLE, view)
            einfarbig(shell, COL.get('part', [0.75, 0.79, 0.8]))
            zeigt.append(shell)
            q = rechne(schwelle(HUELLE, 'dieSurfaceTmax', 300.0, 5000.0, 'POINTS'), 'wert', kw['expr'])
            lo, hi = CONF.get('Tdie', 200), bereich(q, 'wert', TEND)[1]
            if hi <= lo:
                hi = lo + 1
        else:
            q = rechne(HUELLE, 'wert', kw['expr'])
            lo, hi = bereich(q, 'wert', TEND)
            if cid == 'solidTime':
                lo = 0.0
            if cid == 'soldering':
                lo, hi = 0.0, max(1.5, hi)
            if hi <= lo:
                hi = lo + 1
        disp = Show(q, view)
        ColorBy(disp, ('POINTS', 'wert'))
        lut = GetColorTransferFunction('wert')
        faerben(lut, lo, hi)
        bar = leiste(lut, kw['label'], kw['unit'])
        zeigt.append(disp)
        titel.Text = '%s · %s\n%s' % (CONF['title'], kw['label'], 'am Ende der Rechnung' if cid != 'solidTime' else 'ab Füllbeginn')
        fn = '001.png'
        SaveScreenshot(os.path.join(ordner, fn), view, ImageResolution=[W, H])
        liste['images'][v['id'] + '/' + cid] = [v['id'] + '/' + cid + '/' + fn]
        if not any(c['id'] == cid for c in liste['criteria']):
            liste['criteria'].append({'id': cid, 'label': kw['label'], 'unit': kw['unit'], 'end': True})
        for d in zeigt:
            d.Visibility = 0
        bar.Visibility = 0
        print('Bild', v['id'], cid, '%.4g … %.4g' % (lo, hi))

with open(os.path.join(OUT, 'bilder.json'), 'w', encoding='utf-8') as fh:
    json.dump(liste, fh, ensure_ascii=False, indent=1)
print(sum(len(x) for x in liste['images'].values()), 'Bilder in', OUT)
`;
