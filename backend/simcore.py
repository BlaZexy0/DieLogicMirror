"""Simulationskern: Konfig übersetzen, hpdcsim lösen, Schussphase abtasten.
JSON-tauglich (NaN/Inf → None). Kein FastAPI-Import — direkt testbar."""

import math

import numpy as np
from hpdcsim import ConfigError, load_process

from .convert import ConvertError, sim_config_from_browser

MAX_COUNT = 2000


def _clean(x):
    """float → JSON-tauglich (NaN/Inf → None)."""
    x = float(x)
    return x if math.isfinite(x) else None


def run_shot_simulation(values, curve, *, count=400, process=None, vacuum=None):
    """Dashboard-Zustand → hpdcsim → Ergebnis-Dict für den Browser.

    Wirft ConvertError bei fachlich ungültigen Eingaben (→ HTTP 422).
    """
    count = max(50, min(int(count), MAX_COUNT))
    config, meta = sim_config_from_browser(values, curve, process=process, vacuum=vacuum)

    try:
        proc = load_process(config)
    except (ConfigError, ValueError) as error:
        raise ConvertError(str(error)) from error

    # Nur die Schussphase abtasten (Dosieren/Beruhigen: Kolben steht).
    t0 = proc.shot_start_time
    times = np.linspace(t0, proc.total_time, count)
    samples = {"t": [], "s_mm": [], "v": [], "gate_v": [], "p_air_mbar": [],
               "T_melt": [], "part_fill": []}
    for t in times:
        st = proc.state_at_time(float(t))
        samples["t"].append(_clean(st.time - t0))
        samples["s_mm"].append(_clean(st.stroke * 1000.0))
        samples["v"].append(_clean(st.plunger_velocity))
        samples["gate_v"].append(_clean(st.gate_velocity))
        samples["p_air_mbar"].append(_clean(st.air_pressure / 100.0))
        samples["T_melt"].append(_clean(st.melt_temperature))
        samples["part_fill"].append(_clean(st.part_fill))

    # Tankmodell: der Tankdruck steigt mit jeder abgesaugten Luftmasse —
    # als eigener Kanal, damit die Schusskurve ihn neben dem Kammerdruck
    # zeigen kann. Andere Modelle veröffentlichen keinen zweiten Kanal.
    if proc.vacuum is not None:
        solution = proc.air_solution()
        if "tank_pressure" in solution:
            tank = np.interp(times, solution["time"], solution["tank_pressure"])
            samples["p_tank_mbar"] = [_clean(x / 100.0) for x in tank]

    events = []
    for key, ev in proc.events().items():
        events.append({
            "id": key,
            "t": _clean(ev.time - t0),
            "s_mm": _clean(ev.stroke * 1000.0),
        })

    meta["critical_velocity_model"] = proc.critical_velocity_model
    meta["v_crit"] = _clean(proc.critical_velocity)

    crossing = proc.critical_crossing(count=800)
    critical = None
    if crossing is not None:
        critical = {
            "s_mm": _clean(crossing.stroke * 1000.0),
            "t": _clean(crossing.time - t0),
            "v": _clean(crossing.plunger_velocity),
        }

    return {
        "meta": meta,
        "samples": samples,
        "events": events,
        "critical_crossing": critical,
    }
