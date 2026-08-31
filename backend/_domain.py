"""Eingabedomäne — GENERIERT, nicht von Hand ändern.

Quelle:  web/tools/auslegung/js/config/fields.js
Erzeugt: node scripts/gen-domain-doc.mjs

Damit prüft der Server dieselben Grenzen wie der Browser. Vorher hatte
jede Seite ihre eigene Liste; gemessen kamen sechs Grenzeingaben durch
den Browser, die der Server abwies — der Anwender sah nur "HTTP 422".

LO_KIND: "gt" = echt groesser als LO, "min" = mindestens LO.
"""

from __future__ import annotations

import math

# key -> (lo_kind, lo, max, label)
FIELDS: dict[str, tuple[str, float, float, str]] = {
    "force": ("gt", 0, 100000, "Maschinenkraft"),
    "injForce": ("gt", 0, 20000, "Gießkraft bei Akkudruck max."),
    "vmax": ("gt", 0, 40, "Kolbengeschw. max."),
    "amax": ("min", 0, 5000, "Beschleunigung max."),
    "dmin": ("gt", 0, 500, "Kolben-Ø min."),
    "dmax": ("gt", 0, 500, "Kolben-Ø max."),
    "lmin": ("gt", 0, 3000, "Kammerlänge min."),
    "lmax": ("gt", 0, 3000, "Kammerlänge max."),
    "tieX": ("gt", 0, 6000, "Säulenabstand horizontal"),
    "tieY": ("gt", 0, 6000, "Säulenabstand vertikal"),
    "pAcc": ("gt", 0, 500, "Akkumulatordruck max."),
    "intTime": ("min", 0, 5000, "Nachdruckaufbauzeit"),
    "pAccOp": ("gt", 0, 500, "Akkumulatordruck (eingestellt)"),
    "area": ("gt", 0, 10, "Sprengfläche"),
    "psel": ("gt", 0, 3000, "Nachdruck (metallseitig)"),
    "safety": ("min", 1, 5, "Sicherheitsfaktor"),
    "eccX": ("min", -3000, 3000, "Außermittigkeit Schwerpunkt x"),
    "eccY": ("min", -3000, 3000, "Außermittigkeit Schwerpunkt y"),
    "part": ("gt", 0, 1000, "Bauteilgewicht"),
    "runner": ("gt", 0, 1000, "Angussgewicht"),
    "overflow": ("min", 0, 1000, "Überlaufgewicht"),
    "biscuit": ("gt", 0, 1000, "Pressrestgewicht"),
    "density": ("gt", 0, 20000, "Dichte flüssig"),
    "densitySolid": ("gt", 0, 20000, "Dichte fest"),
    "shrink": ("gt", 0, 5, "Schwindmaß"),
    "Tcast": ("gt", 0, 2000, "Gießtemperatur"),
    "Tflow": ("gt", 0, 2000, "Min. Fließtemp."),
    "Zconst": ("gt", 0, 100, "Z-Konstante"),
    "solK": ("gt", 0, 1000, "Erstarrungskonstante"),
    "Tliq": ("gt", 0, 2000, "Liquidustemperatur"),
    "Tsol": ("gt", 0, 2000, "Solidustemperatur"),
    "hf": ("gt", 0, 2000, "Erstarrungswärme"),
    "cp20": ("gt", 0, 5000, "c_p bei 20 °C"),
    "cpS": ("gt", 0, 5000, "c_p bei Solidus"),
    "cpL": ("gt", 0, 5000, "c_p bei Liquidus"),
    "diam": ("gt", 0, 500, "Gewählter Kolben-Ø"),
    "length": ("gt", 0, 3000, "Gewählte Kammerlänge"),
    "sealStroke": ("gt", 0, 3000, "Einfüllöffnung verschlossen"),
    "gate": ("gt", 0, 100000, "Anschnittfläche"),
    "gateTh": ("gt", 0, 100, "Anschnittdicke"),
    "Cd": ("gt", 0, 1, "Durchflussbeiwert"),
    "vent": ("gt", 0, 100000, "Entlüftungsfläche"),
    "vacPump": ("gt", 0, 1013, "Pumpen-Enddruck"),
    "vacStart": ("min", 0, 3000, "Vakuum ab Kolbenweg"),
    "tmax": ("gt", 0, 10000, "Füllzeit max."),
    "fillMin": ("min", 0, 100, "Füllgrad Ziel min."),
    "fillMax": ("min", 0, 100, "Füllgrad Ziel max."),
    "gateMin": ("min", 0, 200, "Anschnittgeschw. Ziel min."),
    "gateMax": ("min", 0, 200, "Anschnittgeschw. Ziel max."),
    "vAirMax": ("gt", 0, 1000, "Max. Entlüftungsgeschw."),
    "biscuitMin": ("min", 0, 500, "Pressrest min."),
    "JatomMin": ("gt", 0, 100000, "Zerstäubungsfaktor J min."),
    "JatomMax": ("gt", 0, 100000, "Zerstäubungsfaktor J max."),
    "wall": ("gt", 0, 100, "Wandstärke"),
    "wallMin": ("gt", 0, 100, "Wandstärke min."),
    "wallMax": ("gt", 0, 100, "Wandstärke max."),
    "Tdie": ("gt", 0, 2000, "Formtemperatur"),
    "Sfrac": ("min", 0, 100, "Zul. Erstarrung"),
    "kfill": ("gt", 0, 1000, "NADCA-Faktor k"),
}

# (a, b, op, text) mit op "<" oder "<=";  ("in", key, lo, hi, text)
PAIRS: list[tuple] = [
    ("dmin", "dmax", "<", "Kolben-Ø min. muss unter dem Maximum liegen"),
    ("lmin", "lmax", "<", "Kammerlänge min. muss unter dem Maximum liegen"),
    ("wallMin", "wallMax", "<", "Wandstärke min. muss unter dem Maximum liegen"),
    ("fillMin", "fillMax", "<=", "Füllgrad-Ziel min. darf das Maximum nicht überschreiten"),
    ("gateMin", "gateMax", "<=", "Anschnittgeschw.-Ziel min. darf das Maximum nicht überschreiten"),
    ("JatomMin", "JatomMax", "<", "Zerstäubungsfaktor min. muss unter dem Maximum liegen"),
    ("pAccOp", "pAcc", "<=", "Eingestellter Akkumulatordruck über dem Maximum der Maschine"),
    ("sealStroke", "length", "<=", "Verschluss-Hub muss in der Kammer liegen"),
    ("Tdie", "Tflow", "<", "Min. Fließtemperatur muss über der Formtemperatur liegen"),
    ("Tdie", "Tliq", "<", "Liquidustemperatur muss über der Formtemperatur liegen"),
    ("Tsol", "Tliq", "<", "Liquidus- muss über der Solidustemperatur liegen"),
    ("Tliq", "Tcast", "<=", "Gießtemperatur darf nicht unter der Liquidustemperatur liegen"),
    ("in", "diam", "dmin", "dmax", "Gewählter Kolben-Ø außerhalb der Maschinengrenzen"),
    ("in", "length", "lmin", "lmax", "Gewählte Kammerlänge außerhalb der Maschinengrenzen"),
]


def check_field(key: str, x) -> str | None:
    """None = in Ordnung, sonst der Grund.

    Ein unbekannter Schlüssel ist ein Fehler, kein Durchlass: ein
    vertipptes "forcee" ließ die Maschinenkraft bisher still auf dem
    Vorgabewert stehen (H-40).
    """
    spec = FIELDS.get(key)
    if spec is None:
        return "ist kein Eingabefeld"
    kind, lo, hi, _label = spec
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return "muss eine Zahl sein"
    if not math.isfinite(x):
        return "ist keine gültige JSON-Zahl (NaN/Infinity)"
    if kind == "gt" and not x > lo:
        return f"muss größer als {lo:g} sein"
    if kind == "min" and not x >= lo:
        return f"darf nicht unter {lo:g} liegen"
    if not x <= hi:
        return f"darf nicht über {hi:g} liegen"
    return None
