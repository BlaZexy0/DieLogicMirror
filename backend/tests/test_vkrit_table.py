"""Die generierte Python-Tabelle hpdcsim/_vkrit_table.py gegen die
CSV-Quelle (fixtures/vkrit/v_krit_sim.csv) — Gegenstück zu
tests/web/vkrit-table.test.mjs für die JS-Tabelle: beide eingecheckten
Module müssen dieselbe CSV abbilden, sonst rechnen Dashboard und Backend
mit verschiedenen v_krit-Werten.
Neu erzeugen: node scripts/gen-vkrit-table.mjs"""
import csv
import math
from pathlib import Path

from hpdcsim._vkrit_table import VKRIT_D_MM, VKRIT_F, VKRIT_PHI

CSV_PATH = (Path(__file__).resolve().parents[2]
            / "fixtures" / "vkrit" / "v_krit_sim.csv")
G = 9.81  # Normierung der Tabelle (siehe gen-vkrit-table.mjs)


def _csv_rows():
    with open(CSV_PATH, encoding="utf-8") as stream:
        reader = csv.reader(stream, delimiter=";")
        next(reader)  # Kopfzeile D;phi;V_KRIT_SIM
        return [(float(d), float(phi), float(v)) for d, phi, v in reader]


def test_python_table_matches_csv():
    rows = _csv_rows()
    ds = sorted({r[0] for r in rows})
    phis = sorted({r[1] for r in rows})
    assert list(VKRIT_D_MM) == ds, "Ø-Achse weicht von der CSV ab"
    assert len(VKRIT_PHI) == len(phis) and all(
        abs(a - b) < 1e-12 for a, b in zip(VKRIT_PHI, phis)), \
        "φ-Achse weicht von der CSV ab"
    value = {(d, phi): v for d, phi, v in rows}
    for i, d in enumerate(ds):
        for j, phi in enumerate(phis):
            f = value[(d, phi)] / math.sqrt(G * d / 1000.0)
            # Generator rundet auf 5 Nachkommastellen (toFixed(5)).
            assert abs(VKRIT_F[i][j] - f) <= 5.1e-6, \
                f"F[{d} mm, φ={phi}] weicht von der CSV ab"
