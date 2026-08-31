"""Legierungsdaten, Domänengrenzen und die g-Konstante (Befunde aus den
MEDIUM-Listen und X2 des Code-Reviews)."""
import json
import math
from pathlib import Path

import pytest

from backend.convert import ConvertError, sim_config_from_browser

VALUES = {"part": 12, "runner": 3, "overflow": 2, "biscuit": 1.2, "density": 2400,
          "diam": 150, "length": 900, "gate": 1800, "vent": 800, "Tcast": 660}
CURVE = [[60, 0.4], [318, 0.4], [470, 4], [675, 4]]


def cfg(**over):
    c, m = sim_config_from_browser(dict(VALUES, **over), CURVE)
    return c, m


def test_alloy_thermal_data_reaches_the_simulation():
    """specific_heat war für JEDE Legierung auf 1050 J/(kg·K) verdrahtet,
    obwohl das Dashboard die vollständige Thermik mitschickt. Über die fünf
    Presets liegt zwischen kleinstem und größtem Wert Faktor 2,2."""
    c, _ = cfg(cpL=1360, Tliq=598, Tsol=468, hf=373)
    melt = c["melt"]
    assert melt["specific_heat"] == 1360
    assert melt["liquidus"] == 598 and melt["solidus"] == 468
    assert melt["latent_heat"] == 373_000        # kJ/kg → J/kg

    # Ohne Angaben bleibt der dokumentierte Rückfall.
    c2, _ = cfg()
    assert c2["melt"]["specific_heat"] == 1050
    assert "latent_heat" not in c2["melt"] and "liquidus" not in c2["melt"]

    # Unsinnige Angaben werden gemeldet, nicht ersetzt.
    with pytest.raises(ConvertError, match="Solidus"):
        cfg(Tliq=500, Tsol=600)
    with pytest.raises(ConvertError, match="Wärmekapazität"):
        cfg(cpL=0)


def test_negative_intensification_stroke_is_refused():
    """Der Nachverdichtungshub ist die Schwindung. Liegt die Feststoffdichte
    unter der Schmelzedichte, wird er negativ — die API lieferte das mit
    200 OK und curve_clamped: false aus (gemessen −94,37 mm)."""
    _, m = cfg(densitySolid=2700, shrink=0.55)
    assert m["intens_mm"] > 0

    for ds in (2400, 2000):
        with pytest.raises(ConvertError, match="Nachverdichtungshub"):
            cfg(densitySolid=ds, shrink=0.55)


def test_vkrit_table_is_denormalised_with_the_constant_it_was_normalised_with():
    """Die Tabelle wird mit g = 9,81 normiert; hpdcsim entnormierte mit
    9,80665. Jeder v_krit-Wert wich dadurch um 1 + 1,708e-4 vom
    JavaScript-Zwilling ab — die Fixture dokumentierte das sogar und
    lockerte ihre Toleranz auf 1e-3."""
    from hpdcsim._vkrit_table import VKRIT_GRAVITY
    from hpdcsim.geometry import GRAVITY, circular_section, critical_velocity_cfd_table

    assert VKRIT_GRAVITY == 9.81, "der Generator normiert mit 9,81"
    assert GRAVITY != VKRIT_GRAVITY, "die physikalische Konstante bleibt die Normkonstante"

    # v = sqrt(VKRIT_GRAVITY * D) * f — unabhängig von section.gravity.
    a = critical_velocity_cfd_table(circular_section(0.15, 0.5))
    b = critical_velocity_cfd_table(circular_section(0.15, 0.5, gravity=9.0))
    assert a == b, "die Entnormierung darf nicht an section.gravity hängen"

    # Und die Fixtures verlangen jetzt Gleichheit statt 0,1 % Toleranz.
    root = Path(__file__).resolve().parents[2]
    for f in sorted((root / "fixtures" / "physics").glob("*.json")):
        d = json.loads(f.read_text(encoding="utf-8"))
        vc = d.get("expected", {}).get("v_crit")
        if vc:
            assert vc["rtol"] <= 1e-9, f"{f.name}: die Toleranz verdeckt wieder eine Abweichung"


def test_cfd_table_extrapolates_downwards_on_the_safe_side():
    """f steigt mit D. Unter Ø 60 mm wurde geklemmt — das meldete ein zu
    HOHES v_krit, also die unsichere Richtung."""
    from hpdcsim.geometry import circular_section, critical_velocity_cfd_table as cv

    v60 = cv(circular_section(0.060, 0.5))
    for D in (0.050, 0.040, 0.030):
        v = cv(circular_section(D, 0.5))
        assert v > 0.0
        assert v < v60, f"Ø {D*1000:.0f} mm: {v:.4f} muss unter dem 60-mm-Wert liegen"
        # Konservativ heißt: unter dem, was reines Klemmen liefern würde.
        geklemmt = math.sqrt(9.81 * D) * (v60 / math.sqrt(9.81 * 0.060))
        assert v <= geklemmt + 1e-12, "die Extrapolation darf nicht über dem Klemmwert liegen"
