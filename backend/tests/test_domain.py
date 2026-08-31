"""Die Eingabedomäne auf der Serverseite.

_domain.py wird aus web/tools/auslegung/js/config/fields.js erzeugt
(scripts/gen-domain-doc.mjs). Die CI vergleicht das Erzeugnis gegen den Code;
diese Tests prüfen, dass es auch angewandt wird.

Vorher nahm PUT /api/org/settings/machines jeden Schlüssel an, der wie ein
Bezeichner aussah: ein vertipptes 'forcee' wurde gespeichert, wirkte nie, und
die Maschinenkraft blieb still auf dem Vorgabewert (H-40).
"""

from __future__ import annotations

import json
import pathlib
import re

import pytest
from fastapi import HTTPException

from backend._domain import FIELDS, PAIRS, check_field
from backend.orgsettings import clean_setting

ROOT = pathlib.Path(__file__).resolve().parents[2]


def test_domaene_ist_vollstaendig():
    """Jedes Feld hat eine untere und eine obere Grenze und ein Label."""
    assert len(FIELDS) >= 55, f"nur {len(FIELDS)} Felder — Generator gelaufen?"
    for key, (kind, lo, hi, label) in FIELDS.items():
        assert kind in ("gt", "min"), f"{key}: unbekannte Art '{kind}'"
        assert hi > lo, f"{key}: Obergrenze {hi} liegt nicht über {lo}"
        assert label, f"{key}: kein Label"
    assert PAIRS, "keine Paarregeln erzeugt"


def test_check_field_grenzen():
    assert check_field("Cd", 0.5) is None
    assert check_field("Cd", 1.0) is None            # 1 ist erlaubt, darüber nicht
    assert "über 1" in check_field("Cd", 1.2)
    assert "größer als 0" in check_field("dmin", 0)
    assert check_field("amax", 0) is None            # 0 heißt "kein Limit"
    assert "unter 0" in check_field("amax", -1)
    assert "keine gültige JSON-Zahl" in check_field("force", float("inf"))
    assert "muss eine Zahl sein" in check_field("force", "16000")
    assert "muss eine Zahl sein" in check_field("force", True)


def test_unbekanntes_feld_wird_nicht_still_geschluckt():
    """H-40: der Kern des Befunds."""
    assert check_field("forcee", 16000) == "ist kein Eingabefeld"
    assert check_field("zauberzahl", 42) == "ist kein Eingabefeld"


@pytest.mark.parametrize(
    "fields,muster",
    [
        ({"forcee": 16000}, "kein Eingabefeld"),
        ({"Cd": 1.8}, "über 1"),
        ({"dmin": -50}, "größer als 0"),
        ({"vacPump": 5000}, "über 1013"),
        ({"runner": 0}, "größer als 0"),
    ],
)
def test_stammdaten_weisen_unmoegliche_werte_ab(fields, muster):
    with pytest.raises(HTTPException) as e:
        clean_setting("machines", [{"id": "x", "name": "X", "fields": fields}])
    assert e.value.status_code == 422
    assert muster in e.value.detail


def test_stammdaten_nehmen_gueltige_maschinen_an():
    out = clean_setting("machines", [
        {"id": "x", "name": "X", "fields": {"force": 16000, "dmin": 90, "dmax": 150}},
    ])
    assert out[0]["fields"] == {"force": 16000, "dmin": 90, "dmax": 150}


def test_kosten_bleiben_ausgenommen():
    """Sätze und Preise sind keine Auslegungsfelder — sonst wäre die
    Kostenseite nach dieser Änderung nicht mehr speicherbar."""
    out = clean_setting("kosten", {"alloyPrice": 2.8, "kwhPrice": 0.31})
    assert out == {"alloyPrice": 2.8, "kwhPrice": 0.31}


def _presets(datei: str, global_name: str, list_key: str):
    """Die mitgelieferten Beispiel-Presets aus dem klassischen JS-Script lesen."""
    text = (ROOT / "web/shared/examples" / datei).read_text(encoding="utf-8")
    roh = text[text.index("{", text.index(global_name)):]
    roh = roh[: roh.rindex("}") + 1]
    return json.loads(roh)[list_key]


@pytest.mark.parametrize(
    "datei,global_name,list_key",
    [
        ("machines.js", "__MACHINES__", "machines"),
        ("alloys.js", "__ALLOYS__", "alloys"),
        ("parts.js", "__PARTS__", "parts"),
    ],
)
def test_mitgelieferte_presets_bestehen_die_eigene_pruefung(datei, global_name, list_key):
    """Was die Anwendung ausliefert, muss sie auch wieder annehmen — sonst
    könnte ein Administrator die Beispiele nicht als Stammdaten übernehmen."""
    presets = _presets(datei, global_name, list_key)
    assert presets, f"{datei}: keine Presets gelesen"
    clean_setting(list_key, presets)
