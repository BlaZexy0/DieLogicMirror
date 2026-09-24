#!/usr/bin/env python3
"""One-off generator: golden fixtures of the air/vacuum model (fixtures/airsim).

The browser port of `hpdcsim` (web/tools/auslegung/js/core/airsim/) is pinned by the JSON files
this script writes. It runs the reference exactly as the dashboard reached it: dashboard values
-> toSimPayload() (web/tools/auslegung/js/core/simapi.js, mirrored in `sim_payload` below)
-> backend.simcore.run_shot_simulation().

Run from the repository root, at tag v1-final. The tag has the simulator and
backend.convert/simcore but not this script (it was added in a993eb3, which removed them), so copy
it into a worktree of the tag first:

    git worktree add ../dl-v1 v1-final
    git show main:scripts/gen-v2-vacuum-goldens.py > ../dl-v1/scripts/gen-v2-vacuum-goldens.py
    cd ../dl-v1 && .venv/bin/python scripts/gen-v2-vacuum-goldens.py [OUT_DIR]

OUT_DIR defaults to fixtures/airsim of the checkout it runs in; the files of an earlier run are
replaced. Needs `node` on the PATH (the dashboard defaults are read from fields.js, not copied).

Four families of files:

  <fixture>--<variant>.json   the four physics fixtures x vacuum models x opening x valve end
  special--<name>.json        edge cases of the same pipeline (count, curve shapes, regimes)
  invalid--<name>.json        configurations the reference rejects, with its message
  layer--<name>.json          hpdcsim configurations the dashboard cannot produce (pour-hole
                              area, chill vents, pumped tank) — they pin the solver paths the
                              port carries for completeness; the solution is thinned

Nothing is rounded. `T_melt` is dropped: no thermal block is configured, the channel is null in
every sample (asserted below).
"""

import copy
import datetime
import json
import os
import platform
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))                           # backend
sys.path.insert(0, str(ROOT / "packages" / "hpdcsim"))  # hpdcsim, if not installed

import numpy as np  # noqa: E402
import scipy  # noqa: E402  (hpdcsim's critical_crossing() searches with scipy.optimize.brentq)
from hpdcsim import load_process  # noqa: E402

from backend.convert import ConvertError  # noqa: E402
from backend.simcore import run_shot_simulation  # noqa: E402

BASELINE_TAG = "v1-final"
BASELINE_SHA = "6063ac3b5b0d46787666a11f805e8f2c960a183b"
GENERATOR = "scripts/gen-v2-vacuum-goldens.py"
COUNT = 200
LAYER_STRIDE = 20

FIXTURES = ("standard-auslegung", "konstante-geschwindigkeit", "feststoffdichte", "zweiphasen-rampe")
REFERENCE = "standard-auslegung"    # carries the full cross and the special cases


# ----------------------------------------------------------------------------- inputs

def git(*args):
    return subprocess.run(["git", "-C", str(ROOT), *args], check=True, capture_output=True,
                          text=True).stdout.strip()


def check_baseline():
    """The goldens claim a source SHA — refuse to run on anything else."""
    sha = git("rev-parse", f"{BASELINE_TAG}^{{commit}}")
    if sha != BASELINE_SHA:
        sys.exit(f"tag {BASELINE_TAG} is {sha}, expected {BASELINE_SHA}")
    dirty = subprocess.run(["git", "-C", str(ROOT), "diff", "--quiet", BASELINE_TAG, "--", "backend",
                            "packages/hpdcsim/hpdcsim", "fixtures/physics",
                            "web/tools/auslegung/js/config/fields.js",
                            "web/tools/auslegung/js/core/simapi.js"]).returncode
    if dirty:
        sys.exit(f"reference sources differ from {BASELINE_TAG} — check out the tag first")


def dashboard_defaults():
    """Field defaults and the default curve, read from the dashboard's own definition."""
    script = ("import { groups, DEFAULT_CURVE } from " + json.dumps(str(
        ROOT / "web/tools/auslegung/js/config/fields.js")) + ";"
        "const d = {}; for (const g of groups) for (const f of g.fields) d[f.key] = f.def;"
        "console.log(JSON.stringify({ values: d, curve: DEFAULT_CURVE }));")
    out = subprocess.run(["node", "--input-type=module", "-e", script], check=True, text=True,
                         capture_output=True, env={**os.environ, "NODE_NO_WARNINGS": "1"}).stdout
    data = json.loads(out)
    return data["values"], data["curve"]


def fixture_inputs(name, defaults):
    """A physics fixture completed with the dashboard defaults.

    Exception: `densitySolid` and `shrink` are NOT completed when the fixture gives no solid
    density. The defaults (2700 kg/m3, 0.55 %) belong to the default melt density 2400; next to a
    fixture's own melt density (2700, 6800) they describe a casting that grows on solidification,
    and the reference rejects it (see invalid--negative-intens). Without the key both
    implementations fall back to the melt density — the documented path for old projects.
    """
    data = json.loads((ROOT / "fixtures" / "physics" / f"{name}.json").read_text(encoding="utf-8"))
    own = data["inputs"]["values"]
    values = dict(defaults)
    if "densitySolid" not in own:
        del values["densitySolid"], values["shrink"]
    values.update(own)
    return values, data["inputs"]["curve"]


def sim_payload(values):
    """toSimPayload(): numeric values only, plus the vacuum block in browser units. A key whose
    value is missing (undefined in the browser) does not survive JSON.stringify."""
    nums = {k: v for k, v in values.items()
            if isinstance(v, (int, float)) and not isinstance(v, bool)}
    vacuum = None
    if values.get("vacModel") and values["vacModel"] != "aus":
        block = {
            "model": values["vacModel"],
            "pump_mbar": values.get("vacPump"),
            "valve_mm2": values.get("vent"),
            "gap_mm": values.get("ventGap"),
            "channel_mm": values.get("ventLen"),
            "start_mm": values.get("vacStart"),
            "end": values.get("vacEnd") or "fill",
            "end_mm": values.get("vacEndStroke"),
            "duration_ms": values.get("vacEndTime"),
            "tank_l": values.get("vacTank"),
        }
        vacuum = {k: v for k, v in block.items() if v is not None}
    return nums, vacuum


# ----------------------------------------------------------------------------- cases

ORIFICE = {"ventGap": 0, "ventLen": 0}        # no channel: plain orifice
CHANNEL = {"ventGap": 0.5, "ventLen": 80}     # friction-dominated slit
VALVE_END = {                                 # closing stroke (mm) / open time (ms) per fixture
    "standard-auslegung": {"vacEndStroke": 400, "vacEndTime": 500},
    "konstante-geschwindigkeit": {"vacEndStroke": 400, "vacEndTime": 500},  # outlasts the shot
    "feststoffdichte": {"vacEndStroke": 400, "vacEndTime": 100},
    "zweiphasen-rampe": {"vacEndStroke": 300, "vacEndTime": 500},           # closes on the ramp
}


def matrix_variants(full):
    """(name, value overrides). The reference fixture gets the full cross model x opening x valve
    end; the others a thinned one (every model, both openings at 'fill', stroke and time only with
    the channel — and with the orifice for the tank's 'time', so each end mode meets each opening
    at least once per fixture)."""
    out = [("aus", {"vacModel": "aus"})]
    for end in ("fill", "stroke", "time"):
        out.append((f"ideal-{end}", {"vacModel": "ideal", "vacEnd": end}))
    for model in ("conductance", "tank"):
        for opening, fields in (("orifice", ORIFICE), ("channel", CHANNEL)):
            for end in ("fill", "stroke", "time"):
                keep = full or end == "fill" or opening == "channel" or (model, end) == ("tank", "time")
                if keep:
                    out.append((f"{model}-{opening}-{end}",
                                {"vacModel": model, "vacEnd": end, "vacTank": 50, **fields}))
    return out


BRAKE_CURVE = [[60, 0.4], [318, 0.4], [470, 4], [620, 4], [675, 1.5]]   # still decelerating at the end
LONG_CURVE = [[60, 0.4], [318, 0.4], [470, 4], [685, 4]]                # reaches past a smaller biscuit
LONG_BRAKE_CURVE = [[60, 0.4], [318, 0.4], [470, 4], [620, 4], [685, 1.5]]


def special_cases(defaults, default_curve, ref_values, ref_curve):
    """(name, values, curve, count, note)."""
    def ref(**over):
        return {**ref_values, **over}

    no_seal = ref(vacModel="aus")
    del no_seal["sealStroke"]
    return [
        ("dashboard-defaults", dict(defaults), default_curve, None,
         "untouched dashboard: every field default, DEFAULT_CURVE, count omitted (= 400)"),
        ("tank-default-volume", ref(vacModel="tank"), ref_curve, COUNT,
         "500 L tank, 10 mm gap: the tank barely notices the shot"),
        ("tank-small", ref(vacModel="tank", vacTank=5, **CHANNEL), ref_curve, COUNT,
         "5 L tank fills up until the pressure difference is gone"),
        ("brake-ramp-conductance-orifice", ref(vacModel="conductance", **ORIFICE), BRAKE_CURVE, COUNT,
         "curve ends on a deceleration ramp: the last segment has a != 0"),
        ("brake-ramp-tank-channel", ref(vacModel="tank", vacTank=50, **CHANNEL), BRAKE_CURVE, COUNT,
         "as above, tank and channel"),
        ("vacuum-from-start-ideal", ref(vacModel="ideal", vacStart=0), ref_curve, COUNT,
         "valve open from stroke 0, while the pour hole is still open"),
        ("vacuum-from-start-conductance", ref(vacModel="conductance", vacStart=0, **CHANNEL), ref_curve, COUNT,
         "as above: the open pour hole holds ambient pressure until it is sealed"),
        ("count-50", ref(vacModel="conductance", **CHANNEL), ref_curve, 50, "smallest sample count"),
        ("count-clamped", ref(vacModel="aus"), ref_curve, 10, "count 10 is raised to 50"),
        ("no-overflow", ref(vacModel="conductance", overflow=0, **CHANNEL), ref_curve, COUNT,
         "overflow 0: part full and fill complete coincide"),
        ("seal-stroke-default", no_seal, ref_curve, COUNT, "no sealStroke: 20 % of the sleeve length"),
        ("unclamped-curve", ref(vacModel="conductance", **CHANNEL),
         [[60, 0.4], [318, 0.4], [470, 4], [600, 4]], COUNT, "curve ends before the end of fill"),
        ("start-velocity", ref(vacModel="aus"), [[0, 0.3], [318, 0.4], [470, 4], [675, 4]], COUNT,
         "first waypoint at s = 0 with v > 0: no origin is added"),
        ("fast-first-phase", ref(vacModel="ideal"), [[20, 0.8], [318, 0.8], [470, 4], [675, 4]], COUNT,
         "first phase above v_crit: a critical crossing on the start ramp"),
        ("stroke-beyond-fill", ref(vacModel="conductance", vacEnd="stroke", vacEndStroke=700, **CHANNEL),
         ref_curve, COUNT, "closing stroke behind the end of fill means 'until end of fill'"),
        ("pump-900-orifice", ref(vacModel="conductance", vacPump=900, **ORIFICE), ref_curve, COUNT,
         "weak vacuum: the orifice is not choked"),
        ("pump-900-channel", ref(vacModel="conductance", vacPump=900, **CHANNEL), ref_curve, COUNT,
         "weak vacuum: subsonic channel flow"),
        ("laminar-channel", ref(vacModel="tank", vacTank=50, ventGap=0.05, ventLen=500), ref_curve, COUNT,
         "0.05 mm gap, 500 mm long: viscous slit flow"),
        # The valve is active while stroke < end position, and at the last grid point the stroke IS
        # the end position up to rounding: the last bit decides whether the final step still drains
        # the die or compresses the rest a thousandfold. In these two the clamped end point does not
        # survive a metre -> millimetre -> metre round trip (x*1000/1000 != x), and a motion profile
        # fed in millimetres decides the other way.
        ("end-point-rounding", ref(vacModel="conductance", biscuit=1.13, **CHANNEL), LONG_CURVE, COUNT,
         "the last bit of the end position decides the final sample (constant velocity at the end)"),
        ("end-point-rounding-brake", ref(vacModel="conductance", biscuit=1.0107, **CHANNEL), LONG_BRAKE_CURVE,
         COUNT, "as above, on a deceleration ramp"),
    ]


def invalid_cases(ref_values, ref_curve):
    """(name, expected message key of the browser port, values, curve)."""
    def ref(**over):
        return {**ref_values, **over}

    chan = {"vacModel": "conductance", **CHANNEL}
    missing_pump = ref(**chan)
    del missing_pump["vacPump"]
    return [
        ("start-beyond-curve-end", "vacuum.startBeyondEnd", ref(vacStart=680, **chan), ref_curve),
        ("close-before-start", "vacuum.endBeforeStart",
         ref(vacEnd="stroke", vacEndStroke=100, **chan), ref_curve),
        ("pump-pressure-zero", "vacuum.pumpPressureNotPositive", ref(vacPump=0, **chan), ref_curve),
        ("vent-area-zero", "vacuum.ventAreaNotPositive", ref(vent=0, **chan), ref_curve),
        ("start-negative", "vacuum.startNegative", ref(vacStart=-5, **chan), ref_curve),
        ("tank-volume-zero", "vacuum.tankVolumeNotPositive", ref(vacModel="tank", vacTank=0), ref_curve),
        ("duration-zero", "vacuum.durationNotPositive", ref(vacEnd="time", vacEndTime=0, **chan), ref_curve),
        # Only an open time whose square underflows leaves the plunger where it was: from rest
        # s = a*t^2/2. Anything longer moves it by at least one bit and is accepted.
        ("duration-too-short", "vacuum.durationTooShort",
         ref(vacStart=0, vacEnd="time", vacEndTime=1e-200, **chan), ref_curve),
        ("channel-negative", "vacuum.channelNegative", ref(vacModel="conductance", ventGap=-1), ref_curve),
        ("unknown-model", "vacuum.unknownModel", ref(vacModel="turbo"), ref_curve),
        ("unknown-end-mode", "vacuum.unknownEndMode", ref(vacEnd="never", **chan), ref_curve),
        ("missing-pump-pressure", "vacuum.inputMissing", missing_pump, ref_curve),
        ("dose-exceeds-sleeve", "shot.doseExceedsSleeve", ref(vacModel="aus", part=2000), ref_curve),
        ("runner-zero", "vacuum.runnerNotPositive", ref(vacModel="aus", runner=0), ref_curve),
        ("biscuit-zero", "vacuum.biscuitNotPositive", ref(vacModel="aus", biscuit=0), ref_curve),
        ("gate-zero", "vacuum.gateNotPositive", ref(vacModel="aus", gate=0), ref_curve),
        ("negative-intens", "design.negativeIntensStroke",
         ref(vacModel="aus", densitySolid=2700, shrink=0.55), ref_curve),
        ("seal-outside-sleeve", "vacuum.sealStrokeOutsideSleeve", ref(vacModel="aus", sealStroke=800), ref_curve),
        ("curve-not-increasing", "curve.notIncreasing", ref(vacModel="aus"), [[60, 0.4], [60, 0.5], [675, 4]]),
        ("curve-negative-velocity", "curve.negativeVelocity", ref(vacModel="aus"), [[60, 0.4], [675, -1]]),
        ("curve-dead-segment", "curve.deadSegment", ref(vacModel="aus"), [[60, 0], [318, 0.4], [675, 4]]),
    ]


LAYER_BASE = {
    "sleeve": {"diameter": 0.15, "length": 0.7, "fill_fraction": 0.5449255664710162, "pour_hole_position": 0.15},
    "casting": {"runner": {"volume": 3 / 2700, "gate_area": 1.8e-3}, "part": {"volume": 12 / 2700},
                "overflow": {"volume": 2 / 2700}},
    "motion": {"type": "profile", "positions": [0.0, 0.06, 0.318, 0.47, 0.6748], "velocities": [0.0, 0.4, 0.4, 4.0, 4.0]},
    "process": {"dosing_time": 4.0, "dwell_time": 1.0, "critical_velocity_model": "cfd_table"},
}


def layer_cases():
    a = copy.deepcopy(LAYER_BASE)
    a["sleeve"]["pour_hole_area"] = 2.0e-3
    a["casting"]["vent_area"] = 50e-6
    a["vacuum"] = {"start_position": 0.1, "valve_area": 3e-4,
                   "model": {"type": "conductance", "pump_pressure": 8000.0, "discharge_coefficient": 0.7}}

    b = copy.deepcopy(LAYER_BASE)
    b["casting"]["vent_area"] = 80e-6
    b["casting"]["vent_channel"] = {"gap": 2e-4, "length": 0.03}
    b["vacuum"] = {"start_position": 0.15, "end_position": 0.6, "valve_area": 8e-4,
                   "valve_channel": {"gap": 5e-4, "length": 0.08, "entry_loss": 0.8, "roughness": 1e-5},
                   "model": {"type": "tank", "tank_volume": 0.02, "tank_pressure": 8000.0,
                             "pump_speed": 0.5, "ultimate_pressure": 5000.0}}

    c = copy.deepcopy(LAYER_BASE)
    c["environment"] = {"ambient_pressure": 95000.0, "ambient_temperature": 313.15}
    c["vacuum"] = {"start_position": 0.2, "duration": 0.35, "valve_area": 2e-4,
                   "model": {"type": "conductance", "pump_pressure": 20000.0}}
    return [
        ("pour-hole-and-chill-vents", a, "pour hole as an orifice (overpressure while it is open), "
         "chill vents as orifices to ambient, Cd 0.7"),
        ("vent-channel-pumped-tank", b, "chill vents as a slit channel, valve channel with its own "
         "entry loss and roughness, tank with a pump behind it, valve closes at 600 mm"),
        ("environment-duration", c, "own ambient conditions, valve open for 350 ms"),
    ]


# ----------------------------------------------------------------------------- output

def clean(x):
    x = float(x)
    return x if np.isfinite(x) else None


def header():
    return {
        "source": f"dielogic@{BASELINE_SHA}",
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "generated": datetime.date.today().isoformat(),
        "generator": GENERATOR,
    }


def write(out_dir, name, body):
    path = out_dir / f"{name}.json"
    text = json.dumps({"header": header(), **body}, ensure_ascii=False, allow_nan=False,
                      separators=(",", ":"))
    data = (text + "\n").encode("utf-8")
    path.write_bytes(data)
    return len(data)


def simulate(values, curve, count):
    nums, vacuum = sim_payload(values)
    kwargs = {} if count is None else {"count": count}
    result = run_shot_simulation(nums, curve, vacuum=vacuum, **kwargs)
    samples = result["samples"]
    assert all(x is None for x in samples.pop("T_melt")), "T_melt is expected to be an empty channel"
    inputs = {"values": values, "curve": curve, "count": count, "vacuum": vacuum}
    return inputs, result


def describe(name, result):
    s = result["samples"]
    ev = {e["id"]: e for e in result["events"]}
    end = ev.get("vacuum_end")
    finite = [p for p in s["p_air_mbar"] if p is not None]
    tank = s.get("p_tank_mbar")
    print(f"  {name:58s} n={len(s['t']):4d} p_min={min(finite):10.3f} p_last={s['p_air_mbar'][-1]!s:>22}"
          f" nulls={len(s['p_air_mbar']) - len(finite):3d}"
          + (f" valve {ev['vacuum_start']['s_mm']:.1f}->{end['s_mm']:.3f} mm" if end else "")
          + (f" tank->{tank[-1]:.2f}" if tank else "")
          + (f" crossing@{result['critical_crossing']['s_mm']:.4f} mm" if result["critical_crossing"] else ""))


def main():
    check_baseline()
    out_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "fixtures" / "airsim"
    out_dir.mkdir(parents=True, exist_ok=True)
    # Replace what an earlier run wrote — and nothing else, should OUT_DIR ever be the wrong directory.
    families = (*FIXTURES, "special", "invalid", "layer")
    for old in out_dir.glob("*--*.json"):
        if old.name.split("--")[0] in families:
            old.unlink()

    defaults, default_curve = dashboard_defaults()
    total, files = 0, 0

    print("matrix")
    for fixture in FIXTURES:
        base, curve = fixture_inputs(fixture, defaults)
        for variant, over in matrix_variants(fixture == REFERENCE):
            values = {**base, **VALVE_END[fixture], **over}
            inputs, result = simulate(values, curve, COUNT)
            describe(f"{fixture}--{variant}", result)
            total += write(out_dir, f"{fixture}--{variant}", {"inputs": inputs, "expected": result})
            files += 1

    ref_values, ref_curve = fixture_inputs(REFERENCE, defaults)
    print("special")
    for name, values, curve, count, note in special_cases(defaults, default_curve, ref_values, ref_curve):
        inputs, result = simulate(values, curve, count)
        describe(f"special--{name}", result)
        total += write(out_dir, f"special--{name}", {"note": note, "inputs": inputs, "expected": result})
        files += 1

    print("invalid")
    for name, key, values, curve in invalid_cases(ref_values, ref_curve):
        nums, vacuum = sim_payload(values)
        try:
            run_shot_simulation(nums, curve, count=COUNT, vacuum=vacuum)
        except ConvertError as error:
            message = str(error)
        else:
            sys.exit(f"invalid--{name}: the reference accepted it")
        print(f"  {name:28s} {key:34s} {message}")
        body = {"inputs": {"values": values, "curve": curve, "count": COUNT, "vacuum": vacuum},
                "expected": {"error": {"key": key, "message": message}}}
        total += write(out_dir, f"invalid--{name}", body)
        files += 1

    print("layer")
    for name, config, note in layer_cases():
        process = load_process(copy.deepcopy(config))
        solution = process.air_solution()
        n = len(solution["time"])
        index = sorted(set(range(0, n, LAYER_STRIDE)) | {n - 2, n - 1})
        expected = {"count": n, "index": index,
                    "vacuum_end_position": clean(process.vacuum.end_position)}
        for channel in ("time", "pressure", "tank_pressure"):
            if channel in solution:
                expected[channel] = [clean(solution[channel][i]) for i in index]
        print(f"  {name:28s} n={n} p_min={min(solution['pressure']):.2f} p_last={solution['pressure'][-1]:.2f}")
        total += write(out_dir, f"layer--{name}", {"note": note, "inputs": {"config": config}, "expected": expected})
        files += 1

    print(f"{files} files, {total / 1e6:.3f} MB -> {out_dir}")


if __name__ == "__main__":
    main()
