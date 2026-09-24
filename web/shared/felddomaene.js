/* DieLogic – web/shared/felddomaene.js
   Eingabedomäne der Werkzeuge außerhalb des Dashboards (Teilekosten,
   Sprengflächenanalyse).

   Warum es das gibt: die Grenzen dieser Seiten standen ausschließlich als
   min="…"/max="…" im Markup. Ein solches Attribut ist ein Hinweis an den
   Spinner, keine Prüfung — getippt, eingefügt oder aus einem Projekt geladen
   kommt jeder Wert durch. Gemessen lieferte die Kalkulation bei 150 %
   Ausschuss NaN und bei 500 % OEE eine glatte, falsche Zahl ohne jede
   Warnung.

   Jetzt steht die Domäne hier, einmal, und daraus kommen
     - die min/max-Attribute der Felder (attribute()),
     - das Urteil, das die Seite VOR dem Rechnen abfragt (pruefe()),
     - der Abschnitt in docs/eingabegrenzen.md (scripts/gen-domain-doc.mjs).

   Dasselbe Muster wie im Dashboard, wo die Domäne in
   web/tools/auslegung/js/config/fields.js steht. Getrennt bleibt es, weil es
   verschiedene Eingabemengen sind und diese Seiten klassische Scripts laden.

   Grenzen: gt = echt größer als, min = mindestens, max = höchstens.
   bound: 'hart'  physikalisch/definitorisch unmöglich (mit Begründung)
          'plaus' schließt nur Absurdes aus                              */
(function (root) {
  'use strict';

  var FELDER = {
    teilekosten: [
      { key: 'mpart', label: 'Bauteilgewicht je Schuss', unit: 'kg', gt: 0, max: 1000, bound: 'plaus' },
      { key: 'mdose', label: 'Schussgewicht', unit: 'kg', gt: 0, max: 1000, bound: 'plaus' },
      { key: 'tz', label: 'Zykluszeit', unit: 's', min: 1, max: 3600, bound: 'plaus' },
      { key: 'kav', label: 'Kavitäten', unit: '−', min: 1, max: 200, bound: 'plaus' },
      { key: 'a', label: 'Ausschuss', unit: '%', min: 0, max: 99, bound: 'hart',
        why: 'bei 100 % Ausschuss gibt es kein Gutteil, auf das sich Kosten beziehen könnten' },
      { key: 'oee', label: 'OEE / Verfügbarkeit', unit: '%', min: 1, max: 100, bound: 'hart',
        why: 'eine Verfügbarkeit ist ein Anteil; bei 0 % entsteht kein Teil' },
      { key: 'pAl', label: 'Legierungspreis', unit: '€/kg', min: 0, max: 1000, bound: 'plaus' },
      { key: 'pRe', label: 'Umschmelzkosten Kreislauf', unit: '€/kg', min: 0, max: 1000, bound: 'plaus' },
      { key: 'kr', label: 'Schmelzverlust (Krätze)', unit: '%', min: 0, max: 20, bound: 'plaus' },
      { key: 'eKg', label: 'Schmelz- & Warmhalteenergie', unit: 'kWh/kg', min: 0, max: 20, bound: 'plaus' },
      { key: 'pE', label: 'Strompreis', unit: '€/kWh', min: 0, max: 10, bound: 'plaus' },
      { key: 'pM', label: 'Maschinenstundensatz Zelle', unit: '€/h', min: 0, max: 10000, bound: 'plaus' },
      { key: 'pP', label: 'Personal', unit: '€/h', min: 0, max: 1000, bound: 'plaus' },
      { key: 'nP', label: 'Bediener je Zelle', unit: '−', min: 0, max: 20, bound: 'plaus' },
      { key: 'wz', label: 'Werkzeugkosten', unit: '€', min: 0, max: 10000000, bound: 'plaus' },
      { key: 'st', label: 'Standmenge', unit: 'Schüsse', min: 1, max: 10000000, bound: 'plaus' },
      { key: 'dg', label: 'Eingesparte Masse je Bauteil', unit: 'g', min: 0, max: 100000, bound: 'plaus' }
    ],
    sprengflaeche: [
      { key: 'shrink', label: 'Schwindmaß s', unit: '%', min: 0, max: 5, bound: 'plaus' },
      { key: 'ptarget', label: 'Nachdruck (metallseitig)', unit: 'bar', min: 1, max: 3000, bound: 'plaus' },
      { key: 'safety', label: 'Sicherheitsfaktor S', unit: '−', min: 1, max: 5, bound: 'hart',
        why: 'ein Sicherheitsfaktor unter 1 ist keiner' },
      { key: 'coreArea', label: 'Seitenschieber A_S', unit: 'mm²', min: 0, max: 1000000, bound: 'plaus' },
      { key: 'coreAngle', label: 'Sperrwinkel α', unit: '°', min: 0, max: 89, bound: 'hart',
        why: 'A·tan(α) wächst bei 90° über alle Grenzen' }
    ]
  };

  /* Produktionsstunden je Monat: kein Feld einer Werkzeugseite — es steht
     nur bei den Kostensätzen der Organisation (/konto/) — aber Teil
     derselben Domäne; scripts/gen-domain-doc.mjs hängt es an
     FELDER.teilekosten an, bevor es nach backend/_domain.py (KOSTEN)
     geschrieben wird. Eigens gehalten, statt in FELDER.teilekosten: dort
     würde es auch der Teilekosten-Seite als Eingabefeld angeboten. */
  var H_MONTH = { key: 'hMonth', label: 'Produktionsstunden je Monat', unit: 'h', min: 1, max: 744, bound: 'plaus' };

  /* Regeln zwischen zwei Feldern. */
  var PAARE = {
    teilekosten: [
      { a: 'mpart', b: 'mdose', op: '<=',
        text: 'Bauteilgewicht kann das Schussgewicht nicht übersteigen: Die Materialausbeute wäre über 100 %' }
    ],
    sprengflaeche: []
  };

  function feld(werkzeug, key) {
    var list = FELDER[werkzeug] || [];
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return null;
  }

  /* null = in Ordnung, sonst der Grund im Klartext. */
  function pruefeFeld(f, x) {
    if (!f) return 'ist kein Eingabefeld';
    if (typeof x !== 'number' || !isFinite(x)) return 'muss eine Zahl sein';
    if (f.gt !== undefined && !(x > f.gt)) return 'muss größer als ' + f.gt + ' sein';
    if (f.min !== undefined && !(x >= f.min)) return 'darf nicht unter ' + f.min + ' liegen';
    if (f.max !== undefined && !(x <= f.max)) return 'darf nicht über ' + f.max + ' liegen';
    return null;
  }

  /* Eine Wertemenge gegen die Domäne eines Werkzeugs.
     Rückgabe: { ok, bad: [Feldnamen], msgs: [Klartext] } */
  function pruefe(werkzeug, werte) {
    var bad = [], msgs = [];
    (FELDER[werkzeug] || []).forEach(function (f) {
      if (!(f.key in werte)) return;            // Feld auf dieser Seite nicht vorhanden
      var grund = pruefeFeld(f, werte[f.key]);
      if (grund) { bad.push(f.key); msgs.push(f.label + ' ' + grund); }
    });
    (PAARE[werkzeug] || []).forEach(function (r) {
      var a = werte[r.a], b = werte[r.b];
      if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) return;
      var ok = r.op === '<' ? a < b : a <= b;
      if (!ok) { bad.push(r.a); bad.push(r.b); msgs.push(r.text); }
    });
    return { ok: bad.length === 0, bad: bad, msgs: msgs };
  }

  /* Setzt min/max an den Eingabefeldern aus der Tabelle. idOf(key) liefert
     die Element-id. Damit stehen die Grenzen nicht mehr von Hand im Markup
     und können nicht mehr von der Prüfung abweichen. */
  function attribute(werkzeug, idOf, doc) {
    var d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d) return 0;
    var n = 0;
    (FELDER[werkzeug] || []).forEach(function (f) {
      var el = d.getElementById(idOf(f.key));
      if (!el) return;
      var lo = f.gt !== undefined ? f.gt : f.min;
      if (lo !== undefined) el.min = String(lo);
      if (f.max !== undefined) el.max = String(f.max);
      n++;
    });
    return n;
  }

  var api = { FELDER: FELDER, PAARE: PAARE, H_MONTH: H_MONTH, feld: feld,
    pruefeFeld: pruefeFeld, pruefe: pruefe, attribute: attribute };
  root.__DOMAENE__ = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
