/* Der Guss in der Hero der Startseite: Schmelze läuft durch ein Wabennetz,
   wird auf dem Weg kälter und erstarrt, bevor sie die Überschrift erreicht.

   Keine Choreografie, drei Gleichungen:

     1. FLIESSEN   Am Einlauf steht ein Druck an, der Weg bremst:
                   v = p / (R + x), R der Widerstand des Weges bis hierher,
                   x die gefüllte Länge im aktuellen Strang. Daraus folgt
                   x ~ √t: zügig los, dann gleichmäßig träger. Eine
                   Verzweigung bremst NICHT — jeder Zweig sieht denselben
                   Druck und nur seinen eigenen Weg.
     2. WÄRME      Ein neuer Strang bekommt die Temperatur dessen, was ihn
                   speist, nicht die des Ofens; so wird das Metall nach außen
                   kälter. Durchströmtes hält seine Wärme weitgehend,
                   Stehendes kühlt nach Newton ab — dünne Ausläufer schneller
                   als dicke Läufe.
     3. ERSTARREN  Unter Solidus ist der Strang fest und sperrt. Das beendet
                   den Guss: Irgendwann kommt vorn Metall an, das zu kalt zum
                   Weiterlaufen ist. In der Gießerei heißt das Kaltlauf.

   Sparsam gezeichnet: das ruhende Gitter und alles Erstarrte liegen in
   wenigen gebündelten Pfaden, die je Bild mit einem Strich gezeichnet
   werden; einzeln gemalt wird nur, was noch warm ist (meist ein paar
   Dutzend Stränge). Nach dem Erstarren hält die Schleife an — die Seite
   rechnet nichts mehr, während jemand liest. Wer die Hero nicht sieht oder
   weniger Bewegung wünscht, bekommt das Ergebnis in einem Rutsch.

   Die Farben sind die der Schmelze im gewählten Farbschema (Rolle `melt`,
   shared/palette.js), nach Temperatur aufgehellt oder abgedunkelt: so hat
   die Schmelze hier dieselbe Farbe wie in den Werkzeugen. Wechselt das
   Schema, malt die Hero den Stand neu, an dem der Guss gerade ist. */

(() => {
  const canvas = document.getElementById('hero-guss');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d', { alpha: true });

  /* ── Stellschrauben ──────────────────────────────────────────── */
  const WABE = 34;            // Kantenlänge des ungestörten Gitters, px
  const UNRUHE = 0.3;         // Auslenkung der Knoten (0 = Schablone)
  const LUECKEN = 0.06;       // Anteil fehlender Stränge
  const EINLAEUFE = 3;        // Anschnitte am linken Rand
  const DRUCK = 81000;        // treibt den Fluss (px²/s)
  const R_EIN = 120;          // Widerstand des Einlaufs: bremst den ersten Schwall
  const ABSTAND = 0.28;       // Schutzzone um die Überschrift (Anteil der Breite)
  const T_GIESS = 700, T_SOL = 577, T_FORM = 180;   // °C: Gießhitze, Solidus, Form (AlSi9Cu3)
  const TAU_DUENN = 2.5, TAU_DICK = 9;     // Abkühlzeiten, s
  const V_WARM = 115;         // darunter schiebt der Zulauf keine Wärme mehr nach
  const KLEIN = 640;          // schmaler als das: nur das ruhende Gitter

  /* Der Temperaturverlauf der Schmelze, alles aus der Rolle `melt`: bei
     Gießhitze zur Glut hin aufgehellt, flüssig die Schmelze selbst, nahe
     Solidus zum Dunkel der Seite hin, erstarrt gedämpft zum Ton der Schrift
     auf dunklem Grund. Als Kanäle [r, g, b], weil der Verlauf dazwischen je
     Strang gemischt wird; gelesen beim Start und bei jedem Schemawechsel. */
  const P = window.__PALETTE__;
  if (!P) return;
  const kanaele = h => P.hexRgb(h).map(v => Math.round(v * 255));
  let GIESS, LIQ, SOL, FEST;
  function farbenLesen() {
    GIESS = kanaele(P.mix('melt', '#ffffff', 0.55));
    LIQ = kanaele(P.melt);
    SOL = kanaele(P.mix('melt', 'dark', 0.35));
    FEST = kanaele(P.mix('melt', 'ondark', 0.5));
  }
  farbenLesen();

  /* ── Zustand ─────────────────────────────────────────────────── */
  let W = 0, H = 0, knoten = [], kanten = [], fronten = [], warm = [];
  let zielX = 0, zielY = 0, gitter = null, feste = [], laeuft = false, letzte = 0, fertig = false;

  const ECKEN = [];
  for (let i = 0; i < 6; i++) { const a = Math.PI / 180 * (60 * i - 30); ECKEN.push([Math.cos(a), Math.sin(a)]); }
  /* Immer dieselbe Unruhe an derselben Stelle — sonst flackert es beim Neuaufbau. */
  const streu = (x, y, n) => { const v = Math.sin(x * 12.9898 + y * 78.233 + n * 37.719) * 43758.5453; return v - Math.floor(v); };
  const misch = (a, b, u) => a.map((v, i) => Math.round(v + (b[i] - v) * u));

  function bauen() {
    const r = canvas.getBoundingClientRect();
    W = Math.round(r.width); H = Math.round(r.height);
    /* 1,25 reicht für Linien: jedes Pixel mehr kostet Rasterzeit, und das ist
       der einzige spürbare Posten dieses Hintergrunds. */
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    zielX = W * 0.52; zielY = H * 0.5;

    knoten = []; kanten = []; feste = []; fronten = []; warm = []; fertig = false;
    const index = new Map();
    const ort = (x, y) => (Math.round(x / WABE * 6) + 4096) * 16384 + Math.round(y / WABE * 6) + 4096;
    const knotenAn = (x, y) => {
      const k = ort(x, y);
      let i = index.get(k);
      if (i === undefined) {
        i = knoten.length;
        knoten.push({
          x: x + (streu(x, y, 1) - 0.5) * UNRUHE * WABE * 1.3,
          y: y + (streu(x, y, 2) - 0.5) * UNRUHE * WABE * 1.3,
          an: []
        });
        index.set(k, i);
      }
      return i;
    };
    const kanteZwischen = (a, b, sx, sy) => {
      if (a === b) return;
      for (const e of knoten[a].an) if (kanten[e].a === b || kanten[e].b === b) return;
      if (streu(sx, sy, 3) < LUECKEN) return;
      const A = knoten[a], B = knoten[b];
      kanten.push({ a, b, len: Math.hypot(B.x - A.x, B.y - A.y), x: 0, von: -1, vorher: -1, q: 0, T: 0, fest: false, ruht: false });
      knoten[a].an.push(kanten.length - 1); knoten[b].an.push(kanten.length - 1);
    };

    const bw = Math.sqrt(3) * WABE, bh = 1.5 * WABE;
    for (let zeile = -1; zeile * bh < H + WABE; zeile++) {
      for (let spalte = -1; spalte * bw < W + bw; spalte++) {
        const cx = spalte * bw + (zeile & 1 ? bw / 2 : 0), cy = zeile * bh;
        const ecke = ECKEN.map(([ex, ey]) => knotenAn(cx + WABE * ex, cy + WABE * ey));
        for (let i = 0; i < 6; i++) kanteZwischen(ecke[i], ecke[(i + 1) % 6], cx + i, cy + i * 7);
      }
    }

    /* Das ruhende Gitter als EIN Pfad: ein Strich je Bild statt tausend. */
    gitter = new Path2D();
    for (const k of kanten) {
      gitter.moveTo(knoten[k.a].x, knoten[k.a].y);
      gitter.lineTo(knoten[k.b].x, knoten[k.b].y);
    }
    /* Erstarrtes sammelt sich in drei Pfaden nach Dicke. */
    feste = [{ p: new Path2D(), w: 1.3 }, { p: new Path2D(), w: 2.2 }, { p: new Path2D(), w: 3.2 }];
  }

  /* ── Guss ──────────────────────────────────────────────────── */
  const imText = (x, y) => {
    const dx = (x - zielX) / (W * ABSTAND * 1.55), dy = (y - zielY) / (H * ABSTAND * 1.5);
    return dx * dx + dy * dy < 1;
  };

  function anguss() {
    const rand = knoten.map((n, i) => ({ i, n })).filter(({ n }) => n.x < WABE * 1.2 && n.y > H * 0.08 && n.y < H * 0.92);
    if (!rand.length) return;
    rand.sort((p, q) => p.n.y - q.n.y);
    for (let s = 0; s < EINLAEUFE; s++) {
      const idx = Math.round(((s + 0.5) / EINLAEUFE + (streu(s, 7, 4) - 0.5) * 0.12) * (rand.length - 1));
      speisen(rand[Math.max(0, Math.min(rand.length - 1, idx))].i, 1, R_EIN, -1);
    }
  }

  function speisen(n, q, R, vorher) {
    const frei = knoten[n].an.filter(e => !kanten[e].fest && kanten[e].x === 0);
    if (!frei.length || q < 1e-5) return;
    const TZu = vorher >= 0 ? kanten[vorher].T : T_GIESS;
    if (TZu < T_SOL + 8) return;                            // zu kalt zum Weiterlaufen
    /* Zweige, die zur Überschrift zeigen, bekommen den größeren Anteil. */
    const gew = frei.map(e => {
      const k = kanten[e], b = knoten[k.a === n ? k.b : k.a];
      const dx = b.x - knoten[n].x, dy = b.y - knoten[n].y;
      const zx = zielX - knoten[n].x, zy = zielY - knoten[n].y;
      const l = Math.hypot(dx, dy) * Math.hypot(zx, zy) || 1;
      return 0.14 + 0.86 * Math.pow(Math.max(0, (dx * zx + dy * zy) / l), 1.3);
    });
    const summe = gew.reduce((a, b) => a + b, 0) || 1;
    frei.forEach((e, i) => {
      const k = kanten[e];
      k.von = n; k.x = 0.0001; k.q = q * gew[i] / summe; k.T = TZu; k.vorher = vorher;
      fronten.push({ e, R, v: 0 });
      warm.push(e);
    });
  }

  function schritt(dt) {
    const naechste = [];
    for (const f of fronten) {
      const k = kanten[f.e];
      if (k.fest) continue;                                 // der Kanal ist zugefroren
      f.v = DRUCK / (f.R + k.x);
      k.x = Math.min(k.len, k.x + f.v * dt);
      if (k.x < k.len) { naechste.push(f); continue; }
      const ziel = k.a === k.von ? k.b : k.a;
      if (!imText(knoten[ziel].x, knoten[ziel].y)) speisen(ziel, k.q, f.R + k.len, f.e);
    }
    fronten = naechste;

    /* Wer bekommt Nachschub? Von jeder zügigen Front den Weg zurück. */
    for (const e of warm) kanten[e].ruht = true;
    for (const f of fronten) {
      if (!(f.v > V_WARM)) continue;
      let e = f.e;
      while (e >= 0 && kanten[e].ruht) { kanten[e].ruht = false; e = kanten[e].vorher; }
    }

    const noch = [];
    for (const e of warm) {
      const k = kanten[e];
      /* Abgekühlt wird immer — auch nach dem Erstarren, sonst bliebe die Farbe
         bei Solidus stehen (der dunkle Ton) und der Strang ewig in der
         gezeichneten Liste. */
      const tau = (TAU_DUENN + (TAU_DICK - TAU_DUENN) * k.q) * (k.ruht ? 1 : 5);
      k.T += (T_FORM - k.T) * (1 - Math.exp(-dt / tau));
      if (!k.fest && k.T < T_SOL) k.fest = true;
      if (k.fest && k.T < T_SOL - 120) { ablegen(k); continue; }   // ausgekühlt: in den Sammelpfad
      noch.push(e);
    }
    warm = noch;
    if (!fronten.length && !warm.length) fertig = true;
  }

  /* ── Zeichnen ──────────────────────────────────────────────── */
  const dickeVon = k => 0.3 + 0.7 * Math.pow(Math.min(1, k.q), 0.25);
  const enden = k => {
    const a = knoten[k.von === k.b ? k.b : k.a], b = knoten[k.von === k.b ? k.a : k.b];
    const u = k.x / k.len;
    return [a, b, a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u];
  };

  function ablegen(k) {
    const [a, , x2, y2] = enden(k);
    const d = dickeVon(k);
    const ziel = feste[d > 0.8 ? 2 : d > 0.55 ? 1 : 0].p;
    ziel.moveTo(a.x, a.y); ziel.lineTo(x2, y2);
  }

  function farbe(k) {
    if (k.T >= T_SOL) {
      const u = Math.min(1, Math.max(0, (k.T - T_SOL) / (T_GIESS - T_SOL)));
      return { c: u > 0.55 ? misch(LIQ, GIESS, (u - 0.55) / 0.45) : misch(SOL, LIQ, u / 0.55), glut: 0.35 + 0.65 * u };
    }
    const u = Math.min(1, (T_SOL - k.T) / 120);
    return { c: misch(SOL, FEST, u), glut: 0.35 * (1 - u) };
  }

  function zeichnen() {
    ctx.clearRect(0, 0, W, H);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.stroke(gitter);

    ctx.strokeStyle = 'rgba(' + FEST[0] + ',' + FEST[1] + ',' + FEST[2] + ',.72)';
    for (const f of feste) { ctx.lineWidth = f.w; ctx.stroke(f.p); }

    for (const e of warm) {
      const k = kanten[e], [a, , x2, y2] = enden(k), f = farbe(k), d = dickeVon(k);
      const rgb = f.c[0] + ',' + f.c[1] + ',' + f.c[2];
      if (f.glut > 0.08) {                                  // Glanz aus zwei Strichen, kein shadowBlur
        ctx.strokeStyle = 'rgba(' + rgb + ',' + 0.16 * f.glut + ')';
        ctx.lineWidth = (2.5 + 5 * d) * (0.6 + 0.8 * f.glut);
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(x2, y2); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(' + rgb + ',' + (0.6 + 0.4 * f.glut) + ')';
      ctx.lineWidth = 1.1 + 2.4 * d;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(x2, y2); ctx.stroke();
    }

    /* Die Überschrift bleibt ruhig: das Muster tritt dort weich zurück. */
    ctx.globalCompositeOperation = 'destination-out';
    ctx.save();
    ctx.translate(zielX, zielY);
    ctx.scale(1, 0.58);
    const schleier = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 0.42);
    schleier.addColorStop(0, 'rgba(0,0,0,.92)');
    schleier.addColorStop(0.5, 'rgba(0,0,0,.6)');
    schleier.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = schleier;
    const rw = W * 0.43;                                    // so weit trägt der Verlauf
    ctx.fillRect(-rw, -rw, rw * 2, rw * 2);
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    /* Die Köpfe: wenige, mit weichem Rand, ihr Leuchten aus der Glut. */
    const kern = GIESS.join(','), hof = misch(GIESS, LIQ, 0.5).join(','), rand = LIQ.join(',');
    for (const f of fronten) {
      const k = kanten[f.e], [, , x, y] = enden(k);
      const r = (3 + 4 * Math.pow(Math.min(1, k.q), 0.25)) * 2.2;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + kern + ',.9)');
      g.addColorStop(0.35, 'rgba(' + hof + ',.45)');
      g.addColorStop(1, 'rgba(' + rand + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* ── Lauf ──────────────────────────────────────────────────── */
  /* Ein Hintergrund braucht keine 60 Bilder je Sekunde: die Hälfte spart die
     Hälfte der Rasterarbeit und ist nicht zu sehen. Gerechnet wird weiter mit
     der echten Zeit, nur gezeichnet wird seltener. */
  const BILD_MS = 33;
  function bild(jetzt) {
    const dt = (jetzt - letzte) / 1000;
    if (jetzt - gemalt < BILD_MS && !fertig) { requestAnimationFrame(bild); return; }
    schritt(Math.min(0.05, dt));
    letzte = jetzt;
    gemalt = jetzt;
    zeichnen();
    if (!fertig && !document.hidden) requestAnimationFrame(bild);
    else { if (!fertig) durchrechnen(); laeuft = false; }
  }
  let gemalt = 0;

  /** Alles in einem Rutsch: für „weniger Bewegung", für den Hintergrund-Tab
      und für ein neues Fenstermaß, wenn der Guss schon vorbei war. */
  function durchrechnen() {
    for (let i = 0; i < 1200 && !fertig; i++) schritt(0.02);
    zeichnen();
  }

  function starten(sofort) {
    bauen();
    if (!H) return;
    anguss();
    /* Auf schmalen Schirmen steht das Ergebnis sofort da: dasselbe Bild, aber
       ohne Animation — das schont den Akku und zeigt trotzdem den Guss. */
    if (W < KLEIN) { durchrechnen(); return; }
    if (sofort) { durchrechnen(); return; }
    letzte = performance.now();
    if (!laeuft) { laeuft = true; requestAnimationFrame(bild); }
  }

  /* Anderes Farbschema: neue Farben, und der Stand wird einmal neu gemalt.
     Läuft der Guss noch, übernimmt das nächste Bild ohnehin die neuen
     Farben; ist er fertig, bliebe ohne dies das alte Bild stehen. */
  document.addEventListener('dielogic:scheme', () => {
    farbenLesen();
    if (gitter && W && H) zeichnen();
  });

  const ruhig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let warFertig = false, timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { warFertig = warFertig || fertig; starten(ruhig || warFertig); }, 250);
  });
  /* Der Guss wartet, bis die Seite steht. Er gehört nicht in das Paket, mit
     dem der Browser die Startseite aufbaut — ein Hintergrund darf ein paar
     Zehntel später kommen, die Überschrift nicht später. */
  const los = () => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => starten(ruhig), { timeout: 600 });
    else setTimeout(() => starten(ruhig), 0);
  };
  if (document.readyState === 'complete') setTimeout(los, 250);
  else addEventListener('load', () => setTimeout(los, 250));
})();
