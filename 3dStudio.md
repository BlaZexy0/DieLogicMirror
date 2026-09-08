# DieLogic 3D Studio — description and fixtures

The 3D Studio is the set of browser tools under `web/tools/3d-studio/`
that work on the geometry of a high pressure die casting: the part, the
die around it, and the things that get designed around the part (runner,
overflows, cooling). Everything runs in the browser; nothing is sent to a
server. Parts come in as STL or GLB in millimetres, results go out as
JSON plans, STL bodies or one GLB for a whole die. Three.js is the only
library and is vendored in `vendor/`.

This file replaces the original runner designer brief. It describes what
exists and, under *Fixtures*, the things every tool relies on and a
future change must keep intact: coordinate frames, example parts, the
example die, file formats, the build pipeline, the tests and the design
rules.

## The tools

| Page | Tool | What it does | Output |
|---|---|---|---|
| `index.html` | Übersicht | The tools as cards. | – |
| `form.html` | Formaufbau | An editable die assembly: groups (fixed side, moving side, cooling fixed/moving, sliders, casting), STL import into a group, rename, move, remove, open/close animation, clip planes. Loads the example die by default. | one GLB (`dielogic-formaufbau`) |
| `entformungsanalyse.html` | Entformungsanalyse | Assigns every triangle of a part to a die half, a slider or an undercut, finds the parting line and the faces without draft. Rule based, no knobs, opening axis chosen automatically (X/Y/Z can be forced). Runs on load. | colours, facts |
| `wandstaerke.html` | Wandstärkenanalyse | Signed distance field by rasterisation: wall thickness, thermal centre, equidistant (offset) surfaces, field sections. | offset surface as STL |
| `abstand.html` | Abstandsanalyse | Shortest distance from every point of one file to another file, coloured on a user set scale. | colours, facts |
| `fuellung.html` | Füllabschätzung | Fill order of the cavity: rectangular gates on the wall, a front runs through the raster cells (Dijkstra, thin walls brake, bigger gates reach further). Fill grade per location, fill body at any grade, last filled spots. | JSON plan (`dielogic-fuellung`), fill body STL |
| `anguss.html` | Angussdesigner | The runner system as a graph: biscuit, spline runners with drafted trapezoid section, branches (optionally mirrored), mirror points, gates with transition types. Cross section, curvature, Bernoulli style losses per millimetre, fill balance, flow chart, rule check, automatic sizing from the gates backwards. Arrival times on the DieLogic shot curve of the current project (`js/runner/shottime.js`; the page loads `shared/project.js` and the example presets for that). | JSON (`dielogic-anguss`), STL |
| `ueberlauf.html` | Überlaufdesigner | Overflows and vents on the part: overflow bean, bean with vent channel (drawn as points in the wall plane from a sphere at the bean end), chill vent, plain vent slot. Volumes for the shot weight. | JSON (`dielogic-luft`), STL |
| `temperier.html` | Temperierkanal-Designer | Cooling drills and channels placed on the offset surface at a chosen distance from the cavity, ends movable with axis arrows, automatic placement of drills. | JSON (`dielogic-temperier`), STL |
| `werkbank.html` | Werkbank | All of the above as six stages in one rail around one part: part analysis (parting + wall thickness), runner (proposed from the part, gates bound to its wall), fill estimate (inlets are the runner's gates), overflows (with the fill's last spots as marks), cooling, and the Auslegung dashboard fed with masses, gate area, wall thickness and projected area from the model. Existing tools are untouched; the stages reuse their modules. | JSON (`dielogic-werkbank`) plus every per-tool file |

Four tools measure existing geometry (Entformung, Wandstärke, Abstand,
Füllung), three create geometry (Anguss, Überlauf, Temperier), one
assembles (Formaufbau).

### How the pages are built

- `js/scene.js`, `js/trackball.js`, `js/ui/viewbar.js`: the viewport with
  quaternion trackball, X/Y/Z/Iso views, perspective and parallel
  projection, fit to object.
- `js/part/partsource.js`: the part loader shared by all part tools
  (example part select, own STL/GLB, facts, busy indicator).
- `js/handles.js`: draggable spheres, direction arrows and the aim mode
  ("click on the part to place") shared by Anguss, Überlauf, Füllung and
  Temperier. Dragging happens in a plane the page defines per handle.
- `js/part/field.js` and `js/part/surfacenets.js`: the raster distance
  field and the surface extraction, used by Wandstärke, Füllung and
  Temperier. `js/part/segment.js`, `visibility.js`,
  `visibility-worker.js`: the parting analysis (six directions in Web
  Workers). `js/part/dieview.js` turns its regions into die pieces
  (triangles per direction, seam edges, a skirt extruded from the seam
  into the die), `js/part/dieviewer.js` shows them pulled apart along
  their opening directions and looks into a half from the parting
  plane, clipping the other side — the "Formansicht" of the
  Entformungsanalyse and of the Werkbank's part stage.
- `js/assembly.js`, `js/components.js`, `js/materials.js`, `js/die.js`,
  `js/clipcaps.js`: the die assembly, its registry, materials and the
  cross section caps.
- `js/mesh.js`, `js/solids.js`, `js/csg.js`, `js/part/glbio.js`,
  `js/part/stlio.js`: triangle soups (9 floats per triangle), primitives,
  booleans, GLB and STL reading and writing. None of these import
  Three.js, so they run under Node in the tests.
- Each designer keeps one source of truth (a graph or a plan in
  `model.js`/`graph.js`); geometry (`geom.js`/`sweep.js`), numbers and
  rule checks are derived from it on every change and never stored.
- `js/werkbank/`: the combined page. `app.js` owns the scene, the part
  (one mesh, one colour attribute the active stage paints), the shared
  distance field (`ctx.field.ensure({band})`, cell = half wall
  thickness, band sized for the cooling distance, computed once for wall
  thickness, fill and cooling) and the events between stages (`part`,
  `field`, `runner`, `vents`, `fill`, `cooling`). Each stage module
  (`part.js`, `runner.js`, `fill.js`, `vents.js`, `cooling.js`,
  `design.js`) is a port of the matching tool page with prefixed ids
  (`bt-`, `an-`, `fu-`, `ue-`, `te-`, `au-`) and `enter()/leave()`.
  `propose.js` builds the runner proposal from the part's bounds (no
  Three.js), `measure.js` the projected area by rasterising the union of
  all cavities, `js/runner/shottime.js` (shared with the Angussdesigner) maps the runner's constant-flow arrival
  times onto the DieLogic shot curve (arrival × Q = volume past the
  biscuit → plunger travel after "Kammer voll" → time from the profile;
  curve generated for the model's masses with the design state's machine
  and alloy; times absolute from piston start). `filltime.js` gives the
  fill estimate the same clock (cavity inflow = piston flow × open gate
  shares, so fill fraction ↔ time and each later gate's head start), and
  `fillsolve.js` is the fill solver with per-inlet start offsets (two
  passes: map fraction to solver units, then re-solve with offsets). `design.js` runs the real Auslegung modules
  (`state.js` on `window.__PROJECT__`, `ui/inputs.js`, `ui/kpis.js`,
  `charts/registry.js`) in an overlay over the viewport.

## Fixtures

### Units and coordinate frames

- All geometry is in millimetres, as modelled. Nothing is rescaled.
- **Part frame** (example parts, Entformung, Wandstärke, Abstand,
  Füllung, Überlauf, Temperier): the parting plane is z = 0 and the die
  opens along +z. The part lies on whichever side its shape needs (the
  gearbox cover and the oil pan hang below z = 0 with their flange on the
  plane, the heat sink and the U channel stand on it).
- **Die frame** (Formaufbau, `assets/die.glb`): the machine axis is z,
  the parting plane z = 0, the fixed half at z < 0, the moving half at
  z > 0, y is up. A part in the part frame fits the die frame without
  rotation.
- **Runner frame** (Angussdesigner): the parting plane is y = 0 and the
  cavity lies towards +y; the biscuit axis defaults to +y and its
  thickness grows towards −y. A reference part from the part frame is
  rotated about x by 90° and shifted to the gates (see `ref` in
  `js/runner/presets.js`).
- **Werkbank**: everything in the part frame. The runner proposal uses
  biscuit axis `-z` — channels and biscuit grow into +z, the moving
  half, as grooves; the biscuit sits before the part's edge at y = min,
  the gates on that edge in the parting plane, bound to the wall by a
  ray in +y (`js/werkbank/propose.js`, `gateRays`). Loading an
  Angussdesigner JSON keeps its axis; the page says so.

### Example parts (`assets/parts/`, listed in `js/part/demoparts.js`)

The four castings are generated in the sibling project
`openscad_parts/` (`parts/*.scad` with `lib/hpdc.scad`), sized for
1200–1600 t machines, modelled as raw castings: draft on every feature,
blind drafted pilots instead of through holes, fillets at rib and boss
feet, rounded free rib ends.

| id | Label | Size (mm) | Volume | Wall 2V/A | Triangles | Notes |
|---|---|---|---|---|---|---|
| `gearbox_cover` | Getriebedeckel mit Schiebern | 424 × 344 × 92 | 1263 cm³ | 4.7 mm | 52 890 | default part of most tools; two side faces need sliders; +X wall drafted 1.5° (tests measure against x = 190 + z·tan 1.5°) |
| `oil_pan` | Ölwanne | 444 × 334 × 127 | 1334 cm³ | 4.6 mm | 30 884 | the part inside the example die; runner preset "Ölwanne" puts four gates on its long flange edge |
| `heat_sink` | Kühlkörper | 420 × 300 × 53 | 2007 cm³ | 4.1 mm | 15 424 | fin field, no sliders |
| `u_channel_ribbed` | U-Profil mit Rippen | 38 × 300 × 40 | 144 cm³ | 3.7 mm | 12 670 | the first part; no sliders, the check case for the parting rules |
| `coolfix`, `coolmov` | Temperierung fest/beweglich | – | 368/371 cm³ | – | ~1 440 | the cooling circuits of the example die, used as the counterpart in the Abstandsanalyse only |

Expected results that the tests pin: no sliders and no undercuts on the
U channel, heat sink and oil pan; sliders but no undercuts on the gearbox
cover.

### The example die (`assets/die.glb`)

A cold chamber die around the oil pan, generated by
`openscad_parts/dies/oil_pan_die.scad` and assembled by
`scripts/3d-studio/build-die-stl.mjs` from the manifest
`dies/oil_pan_die.json`. Twenty pieces:

| Group | Pieces (registry id · material) |
|---|---|
| fixed side | fixHalf, fixInsert, sleeve, guidePillars, ventBlockFix · steel; sleeve_plunger · plunger |
| cooling fixed | coolFixL, coolFixR · coolFix |
| moving side | movHalf, movInsert, ejBox, ejector, guideBushings, ventBlockMov · steel; ejector_pins · pins |
| cooling moving | coolMovL, coolMovR · coolMov |
| casting | castPart · castPart; castRunner · castRunner; castOverflow · castOverflow |

GLB contract (what `js/assembly.js` reads and writes): a root node
`die` with children `fixedRoot` and `movingRoot`; one group node per
registry id; meshes named `<id>_<material>` with `extras.compId`;
material names `steel`, `plunger`, `pins`, `coolFix`, `coolMov`,
`castPart`, `castRunner`, `castOverflow` (`js/materials.js`); the
assembly metadata in the root's extras as `userData.formaufbau`
(format `dielogic-formaufbau`, version 1: groups with side, material
class, optional slider direction and travel; open travel). Any GLB that
follows this contract loads back into the Formaufbau editor.

### File formats

| Format | Version | Tool | Content |
|---|---|---|---|
| `dielogic-anguss` | 1 | Angussdesigner | biscuit, global section settings, nodes (type, parent, children, position, tilt, section, ratio, mirror flag, gate data, aim direction) |
| `dielogic-luft` | 3 | Überlaufdesigner | items with type, position, outward normal, rotation, dimensions; vented beans carry `vent`, the channel points in wall plane coordinates (version 2 files with a channel length migrate to one point) |
| `dielogic-fuellung` | 1 | Füllabschätzung | gates with position, normal, rotation, width, height, optional share; α (older files may carry a fill time, ignored) |
| `dielogic-temperier` | 1 | Temperierkanal | offset distance; drills with tip, direction, diameter, length and an `auto` flag; channels with both ends and diameter |
| `dielogic-formaufbau` | 1 | Formaufbau | inside the GLB extras, see above |
| `dielogic-werkbank` | 1 | Werkbank | part reference (demo id, name — no geometry), the runner graph (`anguss`) with process values (`prozess`), the fill settings (`fuellung`: α, spot count), the overflow plan (`luft`) and the cooling plan (`temperier`), each in its own format above |

Every loader checks the format key and refuses newer versions with a
clear message. Inputs are STL (ASCII or binary) and GLB (glTF 2.0
binary, no extensions, triangles only). Exports are binary STL and the
GLB above.

### Build pipeline

- `openscad_parts/render.sh --studio`: renders the four parts with
  `openscad-nightly` (manifold backend, binary STL), converts them with
  `tools/stl2glb.mjs` and copies the GLBs into `assets/parts/`.
- `openscad_parts/render_die.sh --studio`: renders the twenty die pieces
  and runs `scripts/3d-studio/build-die-stl.mjs`, which uses the same
  `buildDieFromPieces` as the editor so names, extras and materials
  match; also refreshes `coolfix.glb` and `coolmov.glb`.
- `scripts/3d-studio/build-parts.mjs` rebuilds procedural demo parts;
  entries with a `source` field in `demoparts.js` are skipped because
  they come from OpenSCAD.
- The OpenSCAD snap cannot read or write `/tmp`; all intermediate files
  live under `openscad_parts/build/`.

### Tests and checks

- `npm test` runs a syntax check and the Node test suite
  (`tests/web/*.test.mjs`, `tests/web/3d-studio/*.test.mjs`).
  `werkbank.test.mjs` drives the combined page through the DOM stub and
  needs the dashboard's classic scripts (`shared/project.js`, presets,
  theme) loaded first, like `tests/web/dashboard-kern.test.mjs`; it does
  not enter the Auslegung stage (canvas), but measures and applies. Unit tests cover the geometry and the models; the viewer
  tests load the real pages through a small DOM stub and drive them
  like a user (clicks in the canvas, drags, inputs, file round trips).
- The stubs (`tests/web/3d-studio/stubs/`): `dom.mjs` parses the page's
  HTML flat (use `setAttribute`/`getAttribute`; `querySelector` knows
  tag, `.class`, `#id`, `[attr]`, `[attr="v"]`; the document dispatches
  keyboard events), `three-headless.mjs` and `gltfloader.mjs` replace the
  WebGL renderer and the loader (`globalThis.__TEST_GLTF`), `register.mjs`
  wires the resolver. A subset runs with
  `node --import ./tests/web/3d-studio/stubs/register.mjs --test --test-name-pattern="…" tests/web/3d-studio/viewer.test.mjs`.
- `npm run lint` runs eslint over everything.
- Visual checks run in headless Chromium with SwiftShader through
  Playwright (`openscad_parts/tools/studio_shots.mjs` for the die; the
  same pattern works for any page via its `window.__<tool>` hook).

### Design rules

- One source of truth per tool; everything else is derived. A saved
  file contains the plan, never the mesh.
- Tools are quick and have no tuning knobs. An analysis runs on load and
  must be right on all four example parts; a change is tested against
  them.
- Parts are raw castings. Cored holes are blind drafted pilots, free rib
  ends run out rounded, rib ends that meet a wall run into it.
- Geometry is exchanged as triangle soups (9 floats per triangle);
  unions come from overlap, not from booleans, except where `csg.js` is
  used deliberately.
- Coplanar faces of overlapping bodies are handled in the material
  (polygon offset), not by trimming geometry.
- Rendering uses WebGL through Three.js; WebGPU from the original brief
  was not adopted, the sizes involved (tens of thousands of triangles,
  raster fields of a few million cells) do not need it.
- UI text and documentation of the studio are German; the tool pages
  share the compact page header with one line of subtitle.

## Open points

- The Werkbank's Auslegung stage shares the design section of the
  current project through `shared/project.js` (localStorage cache), but
  carries no project bar: values typed there are pushed to the server
  the next time a page with the project bar (the dashboard) is open.
  Teilekosten and Zyklusanalyse are not stages yet; the projected area
  (Sprengfläche) covers what the Sprengflächenanalyse would compute.

- The tool table at the top of `web/tools/3d-studio/README.md` still
  lists six pages; the per tool sections below it are current.
- The fill estimate allocates its working arrays for the whole raster,
  not only the interior cells; at very fine cell edges this is the
  memory limit the page enforces.
