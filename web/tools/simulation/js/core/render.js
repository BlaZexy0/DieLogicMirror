/* Die Bilder der Auswertung: ein pvbatch-Skript (ParaView 5.10 … 5.13), das
   der Fall mitbringt (render.py). Die Einstellungen der Seite stehen als
   JSON oben im Skript — wer ein Bild mehr will, ändert dort.

   Je Bild: die Form als blasse Hülle, die Schmelze (alpha.melt ≥ 0,5)
   eingefärbt nach dem Kennwert, die Farbleiste oben links, rechts oben
   Kennwert, Zeit, Füllgrad und Kolbenweg. Die Zeitpunkte wählt die Seite
   nach Füllgrad, Zeit oder Kolbenweg, je n Bilder gleichmäßig verteilt; das
   Skript nimmt die geschriebene Zeit, die am nächsten liegt.

   Füllgrad heißt: Schmelze in der FORM — die Zellen im Kammerzylinder (mit
   Kammer: Kammer und Pressrest; ohne: der Pressrest) zählen nicht. So stimmt
   er auch, wenn das Netz der Kammer sich mit dem Kolben verdichtet.
   Bereiche der Skalen nach den Validierungsbildern (DieLogic_OF/tools/render/renderFill.py).
   Die Lage von Farbleiste und Text (FRAME) zeigt die Seite im Viewport als
   Vorschau — beide lesen dieselben Zahlen. */

/** Die Kennwerte, die die Seite anbietet — alle standardmäßig an. Gefärbt
    wird jeder mit derselben Leiste: `heat` der Palette (shared/palette.js,
    LEISTEN) — die Seite gibt ihre Stützstellen mit (cfg.heat), dazu die
    Rollenfarben für Schmelze, Form und Schrift (cfg.colors). */
export const CRITERIA = [
  { id: 'velocity', label: 'Geschwindigkeit', unit: 'm/s', hint: 'Betrag der Schmelzegeschwindigkeit; die Leiste endet beim 99. Perzentil, Spitzen darüber in der obersten Farbe', range: ['0', '…'] },
  { id: 'temperature', label: 'Temperatur', unit: '°C', hint: 'Schmelzetemperatur, Wärmeabgabe an die Form', range: ['T_sol − 40', 'T_Guss'] },
  { id: 'air', label: 'Lufteinschluss', unit: '%', hint: 'mitgerissene Luft (airEntrained), log. Skala', range: ['0,01', '10'] },
  { id: 'oxide', label: 'Oxide', unit: 'ppm', hint: 'Oxidhaut aus Oberflächenalter und Faltung, log. Skala', range: ['0,1', '1000'] },
  { id: 'trapped', label: 'Eingeschlossene Luft', unit: 'bar', hint: 'Gasnester ohne Entlüftung, nach ihrem Druck', range: ['1', '50'] },
  { id: 'fillTime', label: 'Füllzeit', unit: 'ms', hint: 'wann jede Zelle voll war, ab „Kammer voll"; ein Bild am Ende', range: ['0', '…'] },
  { id: 'solid', label: 'Erstarrt', unit: '–', hint: 'Festanteil der Schmelze', range: ['0', '1'] }
];
export const WHEN = [['fill', 'Füllgrad'], ['time', 'Zeit'], ['piston', 'Kolbenweg']];
export const ASPECTS = [['16:9', 16 / 9], ['3:2', 3 / 2], ['4:3', 4 / 3], ['1:1', 1], ['9:16', 9 / 16]];
export const WIDTHS = [1280, 1600, 1920, 2560];
export const VIEW_PRESETS = [
  { id: 'iso', label: 'Schräg', dir: [0.55, -0.6, 0.58], up: [0, 0, 1] },
  { id: 'top', label: 'Von oben (+z)', dir: [0, 0, 1], up: [0, 1, 0] },
  { id: 'bottom', label: 'Von unten (−z)', dir: [0, 0, -1], up: [0, 1, 0] },
  { id: 'front', label: 'Von vorn (−y)', dir: [0, -1, 0], up: [0, 0, 1] }
];
/** Wo im Bild was steht (Anteile von Breite/Höhe, von oben links):
    Farbleiste oben links, Text oben rechts. render.py und die Vorschau. */
export const FRAME = { barX: 0.05, barTop: 0.09, barLen: 0.4, barW: 0.012, textRight: 0.015, textTop: 0.02 };

export function defaultPost() {
  return {
    criteria: CRITERIA.map(c => c.id),
    when: { by: 'fill', count: 100 },
    aspect: '16:9', width: 1600,
    preview: 'velocity',
    views: [{ id: 'iso', label: 'Schräg', dir: VIEW_PRESETS[0].dir, up: VIEW_PRESETS[0].up }]
  };
}
/** Ältere Pläne (fills, size) auf die heutige Form bringen. */
export function normalizePost(p) {
  const d = defaultPost(), src = p || {};
  const out = Object.assign({}, d, src);
  /* nach dem, was der Plan selbst hat — nicht nach den eben gesetzten Vorgaben */
  if (!src.when || !src.when.by) out.when = { by: 'fill', count: Array.isArray(src.fills) && src.fills.length ? src.fills.length : d.when.count };
  if (!ASPECTS.some(a => a[0] === out.aspect)) out.aspect = d.aspect;
  if (!(src.width > 0)) out.width = Array.isArray(src.size) && src.size[0] > 0 ? src.size[0] : d.width;
  delete out.fills; delete out.size;
  return out;
}
export function imageSize(post) {
  const p = normalizePost(post);
  const r = (ASPECTS.find(a => a[0] === p.aspect) || ASPECTS[0])[1];
  return [p.width, 2 * Math.round(p.width / r / 2)];
}
/** Die Zielwerte der Bilder: n gleichmäßig verteilt (Füllgrad in %, sonst Anteile 0…1). */
export function targets(post) {
  const p = normalizePost(post);
  const n = Math.max(1, Math.min(200, Math.round(p.when.count)));
  return Array.from({ length: n }, (_, i) => (p.when.by === 'fill' ? Math.round(1000 * (i + 1) / n) / 10 : (i + 1) / n));
}
/** → Liste der Bilder, die das Skript schreibt (für die Seite). */
export function imageList(post) {
  const p = normalizePost(post);
  const out = [], n = targets(p).length;
  for (const v of p.views) for (const c of p.criteria) {
    if (c === 'fillTime') out.push({ view: v.id, crit: c, i: n });
    else for (let i = 1; i <= n; i++) out.push({ view: v.id, crit: c, i });
  }
  return out;
}
export const imageCount = post => imageList(post).length;

export function renderScript(cfg) {
  const post = normalizePost(cfg);
  const conf = {
    title: cfg.title || 'DieLogic',
    criteria: post.criteria,
    when: post.when, targets: targets(post),
    size: imageSize(post),
    views: post.views.map(v => (v.pos ? { id: v.id, label: v.label, pos: v.pos.map(x => x * 1e-3), target: v.target.map(x => x * 1e-3), up: v.up, fov: v.fov } : { id: v.id, label: v.label, dir: v.dir, up: v.up })),
    frame: FRAME,
    chamber: cfg.chamber || null,
    piston: cfg.piston || null, tOffset: cfg.tOffset || 0, moving: !!cfg.moving,
    fillFrom: cfg.fillFrom || 0,      // Rechenzeit von „Kammer voll" [s]: die Füllzeit zählt ab dort
    heat: cfg.heat || null,          // [[t, r, g, b]] 0…1, die Leiste der Palette
    colors: cfg.colors || null,      // { melt, shell, text: [r, g, b] }, Rollen der Palette
    Tcast: cfg.fields ? cfg.fields.Tcast : 660,
    Tsol: cfg.fields ? cfg.fields.Tsol : 520
  };
  return `#!/usr/bin/env pvbatch
# Bilder der Formfüllung: pvbatch render.py [Fall]  → <Fall>/images/
# Erzeugt von DieLogic · Simulation einrichten. Die Einstellungen stehen in CONF:
#   when.by      fill (Füllgrad der Form in %) | time | piston (Kolbenweg), when.count Bilder je Kennwert
#   views        pos/target/up/fov (Kamera wie im Viewport der Seite, m) oder dir/up (eingepasst)
import bisect, json, math, os, sys
from paraview.simple import *
from vtk.numpy_interface import dataset_adapter as dsa
import numpy as np

CONF = json.loads(r'''${JSON.stringify(conf, null, 1)}''')

case = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(case, 'images')
os.makedirs(out, exist_ok=True)
foam = os.path.join(case, 'case.foam')
open(foam, 'a').close()

reader = OpenFOAMReader(FileName=foam)
reader.MeshRegions = ['internalMesh']
reader.CaseType = 'Reconstructed Case'
reader.Createcelltopointfiltereddata = 0
reader.UpdatePipelineInformation()
times = [t for t in reader.TimestepValues] if hasattr(reader.TimestepValues, '__len__') else [reader.TimestepValues]
arrays = list(reader.CellArrays.Available) if hasattr(reader.CellArrays, 'Available') else list(reader.CellArrays)
reader.CellArrays = arrays
print('Zeiten:', len(times), ' Felder:', ', '.join(arrays))
if not times or 'alpha.melt' not in arrays:
    sys.exit('Keine Ergebnisse mit alpha.melt gefunden — ist die Rechnung gelaufen (und rekonstruiert)?')

# ── Füllgrad der Form je Zeit: Schmelze außerhalb des Kammerzylinders ──
merged = MergeBlocks(Input=reader)
sizes = CellSize(Input=merged)
centres = CellCenters(Input=merged)
ch = CONF['chamber']
def formFill(t):
    sizes.UpdatePipeline(t)
    d = dsa.WrapDataObject(servermanager.Fetch(sizes))
    vol = np.asarray(d.CellData['Volume']); a = np.asarray(d.CellData['alpha.melt'])
    if ch:
        centres.UpdatePipeline(t)
        P = np.asarray(dsa.WrapDataObject(servermanager.Fetch(centres)).Points)
        rel = P - np.asarray(ch['c']); ax = rel.dot(np.asarray(ch['a']))
        rad = np.linalg.norm(rel - np.outer(ax, ch['a']), axis=1)
        form = ~((ax <= ch['top']) & (rad <= ch['r']))
    else:
        form = np.ones_like(vol, dtype=bool)
    V = vol[form].sum()
    return float((a[form] * vol[form]).sum() / V) if V > 0 else 0.0
fill = [formFill(t) for t in times]
f0 = fill[0] if not ch else 0.0
fill = [max(0.0, min(1.0, (f - f0) / (1.0 - f0))) for f in fill]
print('Füllgrad der Form:', ' '.join('%.0f%%' % (100 * f) for f in fill))

# Kolbenweg je Zeit (Tabelle der Schusskurve: Kurvenzeit, mm)
pst = CONF['piston']
def pistonAt(t):
    if not pst:
        return float('nan')
    tc = t + CONF['tOffset']
    ts = [r[0] for r in pst]
    i = bisect.bisect_left(ts, tc)
    if i <= 0:
        return pst[0][1]
    if i >= len(pst):
        return pst[-1][1]
    (ta, sa), (tb, sb) = pst[i - 1], pst[i]
    return sa + (sb - sa) * (tc - ta) / (tb - ta) if tb > ta else sb

# ── Die Zeitpunkte der Bilder ─────────────────────────────────────────
by, tg = CONF['when']['by'], CONF['targets']
start = next((i for i, f in enumerate(fill) if f > 0.005), 0)     # die Schmelze kommt in der Form an
idx = list(range(start, len(times)))
def nearest(vals, x):
    return min(idx, key=lambda i: abs(vals[i] - x))
picks = []
if by == 'fill':
    reached = 100 * max(fill)
    for p in tg:
        if p > reached + 3:
            print('nicht erreicht (Füllgrad bis %.0f %%): %g %%' % (reached, p)); continue
        picks.append(nearest([100 * f for f in fill], p))
elif by == 'time':
    t0, t1 = times[start], times[-1]
    picks = [nearest(times, t0 + (t1 - t0) * q) for q in tg]
else:
    s = [pistonAt(t) for t in times]
    s0, s1 = s[start], s[-1]
    picks = [nearest(s, s0 + (s1 - s0) * q) for q in tg]
# dieselbe geschriebene Zeit zweimal ist ein Bild zu viel
seen, frames = set(), []
for k, i in enumerate(picks):
    if i in seen:
        continue
    seen.add(i); frames.append((k + 1, i))
print('Bilder je Kennwert:', len(frames), ' Zeiten:', ', '.join('%.4f' % times[i] for _, i in frames))

# ── Kennwerte: Ausdruck, Feld, Farbskala ─────────────────────────────
Tc, Ts = CONF['Tcast'], CONF['Tsol']
# Füllzeit ab „Kammer voll" — mit Kammer beginnt die Rechnung beim Kolbenstart
t0ms = 1000.0 * CONF.get('fillFrom', 0)
CRIT = {
  'velocity':    dict(label='Geschwindigkeit', unit='m/s', expr='mag(U)', need=['U'], log=False, range=None, pct=99),
  'temperature': dict(label='Temperatur', unit='°C', expr='T-273.15', need=['T'], log=False, range=[Ts - 40, Tc]),
  'air':         dict(label='Lufteinschluss', unit='%', expr='max(airEntrained*100,1e-4)', need=['airEntrained'], log=True, range=[0.01, 10]),
  'oxide':       dict(label='Oxide', unit='ppm', expr='max(oxide*1e6,1e-3)', need=['oxide'], log=True, range=[0.1, 1000]),
  'trapped':     dict(label='Eingeschlossene Luft', unit='bar', expr='max(pGas/1e5,1.0001)', need=['gasTrapped', 'pGas'], log=True, range=[1, 50]),
  'fillTime':    dict(label='Füllzeit', unit='ms', expr='max(fillTime*1000-%.6g,0)' % t0ms, need=['fillTime'], log=False, range=None),
  'solid':       dict(label='Erstarrt', unit='–', expr='solidFraction', need=['solidFraction'], log=False, range=[0, 1]),
}
# eine Leiste für jeden Kennwert: heat der Palette (ohne Angabe die verwandte ParaView-Vorgabe Turbo)
HEAT = CONF['heat']
COL = CONF['colors'] or {}
INK = COL.get('text', [0.1, 0.12, 0.14])
def paint(lut, lo, hi, log):
    if HEAT:
        if log:
            a, b = math.log10(lo), math.log10(hi)
            pts = [10 ** (a + (b - a) * t) for t, *_ in HEAT]
        else:
            pts = [lo + (hi - lo) * t for t, *_ in HEAT]
        lut.RGBPoints = [v for (t, r, g, b), x in zip(HEAT, pts) for v in (x, r, g, b)]
        lut.ColorSpace = 'RGB'
    else:
        lut.ApplyPreset('Turbo', True)
        lut.RescaleTransferFunction(lo, hi)
    lut.AutomaticRescaleRangeMode = 'Never'
    lut.UseLogScale = 1 if log else 0

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

shell = ExtractSurface(Input=reader)
shellDisp = Show(shell, view)
ColorBy(shellDisp, None)
shellDisp.DiffuseColor = COL.get('shell', [0.55, 0.6, 0.64])
shellDisp.AmbientColor = shellDisp.DiffuseColor
shellDisp.Opacity = 0.12

def threshold(src, name, lo, hi):
    th = Threshold(Input=src)
    th.Scalars = ['CELLS', name]
    try:
        th.LowerThreshold, th.UpperThreshold = lo, hi
        th.ThresholdMethod = 'Between'
    except Exception:
        th.ThresholdRange = [lo, hi]
    return th
melt = threshold(reader, 'alpha.melt', 0.5, 2.0)
void = threshold(reader, 'alpha.melt', -1.0, 0.4999)
trapped = threshold(void, 'gasTrapped' if 'gasTrapped' in arrays else 'alpha.melt', 0.5, 2.0)

fs = max(12, int(22 * H / 1000))
title = Text(Text='')
titleDisp = Show(title, view)
titleDisp.WindowLocation = 'Upper Right Corner'
titleDisp.FontSize = fs
titleDisp.Color = INK

def calc(src, name, expr):
    c = Calculator(Input=src)
    c.AttributeType = 'Cell Data'
    c.ResultArrayName = name
    c.Function = expr
    return c

def dataRange(src, name, ids, pct=None):
    # pct: obere Grenze als Perzentil der Zellwerte — einzelne Spitzen an der
    # freien Oberfläche (100 m/s und mehr) sollen die Leiste nicht bestimmen
    lo, hi = float('inf'), -float('inf')
    vals = []
    mb = MergeBlocks(Input=src) if pct else None
    for i in ids:
        src.UpdatePipeline(times[i])
        a = src.CellData.GetArray(name)
        if a is None:
            continue
        r = a.GetRange()
        lo, hi = min(lo, r[0]), max(hi, r[1])
        if pct:
            mb.UpdatePipeline(times[i])
            try:
                vals.append(np.asarray(dsa.WrapDataObject(servermanager.Fetch(mb)).CellData[name]).ravel())
            except Exception:
                pass
    vals = [v for v in vals if v.size]
    if pct and vals:
        hi = min(hi, float(np.percentile(np.concatenate(vals), pct)))
    return [lo, hi] if hi >= lo else [0, 1]

def setCamera(v):
    view.CameraParallelProjection = 0
    if 'pos' in v:
        # genau die Ansicht der Seite: Lage, Ziel, oben, Öffnungswinkel (senkrecht)
        view.CameraPosition, view.CameraFocalPoint, view.CameraViewUp = v['pos'], v['target'], v['up']
        view.CameraViewAngle = v['fov']
        return
    b = reader.GetDataInformation().GetBounds()
    c = [(b[0] + b[1]) / 2, (b[2] + b[3]) / 2, (b[4] + b[5]) / 2]
    d = v['dir']
    n = math.sqrt(sum(x * x for x in d)) or 1
    view.CameraFocalPoint = c
    view.CameraPosition = [c[k] + d[k] / n for k in range(3)]
    view.CameraViewUp = v['up']
    view.ResetCamera(False)
    GetActiveCamera().Dolly(1.25)

def label(i):
    t = times[i]
    s = pistonAt(t)
    txt = 't = %.1f ms · Füllgrad %.0f %%' % (1000 * t, 100 * fill[i])
    if s == s:
        txt += ' · Kolben %.0f mm' % s
    return txt

written = []
for v in CONF['views']:
    for cid in CONF['criteria']:
        cr = CRIT.get(cid)
        if not cr or any(f not in arrays for f in cr['need']):
            print('übersprungen (Feld fehlt):', cid)
            continue
        src = trapped if cid == 'trapped' else melt
        col = calc(src, cid, cr['expr'])
        shots = [(len(CONF['targets']), len(times) - 1)] if cid == 'fillTime' else frames
        if not shots:
            continue
        # ohne feste Grenzen: 0 bis zum größten Wert (wie auf der Seite „0 … ")
        rng = cr['range'] or [0.0, dataRange(col, cid, [i for _, i in shots], cr.get('pct'))[1]]
        if rng[1] <= rng[0]:
            rng = [rng[0], rng[0] + 1]
        disp = Show(col, view)
        ColorBy(disp, ('CELLS', cid))
        lut = GetColorTransferFunction(cid)
        paint(lut, rng[0], rng[1], cr['log'])
        bar = GetScalarBar(lut, view)
        bar.Title = cr['label']
        bar.ComponentTitle = '[' + cr['unit'] + ']'
        # oben links, mit Rand — wie die Vorschau der Seite (FRAME)
        bar.WindowLocation = 'Any Location'
        bar.Orientation = 'Vertical'
        bar.HorizontalTitle = 1          # Titel waagerecht über der Leiste, nicht über den Zahlen
        bar.TitleJustification = 'Left'  # linksbündig ab der Leiste: lange Titel laufen nicht über den Bildrand
        bar.Position = [F['barX'], 1.0 - F['barTop'] - F['barLen']]
        bar.ScalarBarLength = F['barLen']
        bar.ScalarBarThickness = max(8, int(F['barW'] * W))
        bar.TitleColor = INK
        bar.LabelColor = INK
        bar.TitleFontSize = fs + 2
        bar.LabelFontSize = fs - 2
        bar.RangeLabelFormat = '%-.4g'   # 481 statt „481.", 1000 statt „1e+03", 0.1 bleibt 0.1
        bar.Visibility = 1
        if cid == 'trapped':
            mDisp = Show(melt, view)
            ColorBy(mDisp, None)
            mDisp.DiffuseColor = COL.get('melt', [0.95, 0.55, 0.2])
            mDisp.Opacity = 0.25
        setCamera(v)
        for k, i in shots:
            view.ViewTime = times[i]
            title.Text = '%s · %s\\n%s' % (CONF['title'], cr['label'], label(i))
            fn = '%s_%s_%02d.png' % (v['id'], cid, k)
            SaveScreenshot(os.path.join(out, fn), view, ImageResolution=[W, H])
            written.append(fn)
            print('Bild', fn, ' t = %.4f s' % times[i])
        Hide(col, view)
        if cid == 'trapped':
            Hide(melt, view)
        bar.Visibility = 0

with open(os.path.join(out, 'index.txt'), 'w') as fh:
    fh.write('\\n'.join(written) + '\\n')
print(len(written), 'Bilder in', out)
`;
}
