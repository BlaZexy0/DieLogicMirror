"""Erstarrungswärme im Wärmemodell und die Grenzen des Isothermengesetzes.

  - latent_heat, liquidus und solidus wurden validiert, aber nie benutzt:
    die Schmelze kühlte durch die Erstarrungszone, als wäre sie durchweg
    flüssig.
  - NoVacuum lieferte am Füllende einen riesigen, aber ENDLICHEN Wert
    (gemessen 541 936 346 mbar), der jeden isfinite()-Schutz überlebte.
"""
import numpy as np

from hpdcsim.components import Melt
from hpdcsim.thermal import LumpedCapacitance, _EulerLumped
from hpdcsim.vacuum import VacuumModel


def _melt(latent=None):
    return Melt(density=2400.0, specific_heat=1050.0, pouring_temperature=660.0,
                latent_heat=latent, liquidus=593.0 if latent else None,
                solidus=521.0 if latent else None)


def test_mushy_zone_slows_the_cooling():
    ohne = _melt()
    mit = _melt(latent=403_000.0)

    # Über Liquidus und unter Solidus verhält sich beides gleich.
    for T in (640.0, 500.0):
        assert _EulerLumped._mushy_factor(mit, T) == 1.0
        assert _EulerLumped._mushy_factor(ohne, T) == 1.0

    # Dazwischen wirkt die Erstarrungswärme wie eine größere Wärmekapazität.
    f = _EulerLumped._mushy_factor(mit, 560.0)
    erwartet = 1.0 + (403_000.0 / (593.0 - 521.0)) / 1050.0
    assert abs(f - erwartet) < 1e-12
    assert f > 5.0, "für Aluminium ist der Effekt groß, nicht kosmetisch"

    # Ohne Angaben bleibt das Modell, wie es war.
    assert _EulerLumped._mushy_factor(ohne, 560.0) == 1.0


def test_mushy_zone_plateau_is_visible_in_a_cooling_curve():
    """Ein Abkühlvorgang muss in der Erstarrungszone langsamer werden."""
    mit, ohne = _melt(latent=403_000.0), _melt()
    modell = LumpedCapacitance(htc=2000.0, wall_temperature=180.0)

    def kuehlrate(melt, T):
        class S:
            total_wetted_area = 0.5
            melt_volume = 0.002
        return modell._loss_rate(S(), T, melt) / _EulerLumped._mushy_factor(melt, T)

    assert kuehlrate(mit, 560.0) < kuehlrate(ohne, 560.0) / 5.0
    assert abs(kuehlrate(mit, 640.0) - kuehlrate(ohne, 640.0)) < 1e-12


def test_isothermal_law_reports_inf_beyond_its_range():
    """Ein riesiger endlicher Wert ist schlimmer als kein Wert: er passiert
    jede Prüfung und wird gezeichnet, als wäre er ein Ergebnis."""
    p0, v0 = 101_325.0, 1.0e-3

    # Im Gültigkeitsbereich unverändert.
    assert VacuumModel._isothermal(p0, v0, v0) == p0
    assert abs(VacuumModel._isothermal(p0, v0, v0 / 100.0) - 100.0 * p0) < 1e-6

    # Jenseits davon: kein Wert.
    assert np.isinf(VacuumModel._isothermal(p0, v0, 0.0))
    assert np.isinf(VacuumModel._isothermal(p0, v0, v0 / 1e6))
    assert np.isinf(VacuumModel._isothermal(p0, v0, 1e-30))


def test_solver_grid_honours_the_requested_count():
    from hpdcsim.vacuum import _solver_times

    class P:
        shot_start_time = 1.0
        total_time = 2.0

    for n in (2, 3, 5, 17, 4000):
        assert len(_solver_times(P(), n)) == n, f"count={n}"
