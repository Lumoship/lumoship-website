/* ============================================================================
   Deckhouse — BV NR467 Pt B, Ch 5 Sec 5 [5.4] and Ch 7.

   Three things live here, in the order the workbook computes them:

     1. The wave envelope hw. This is NOT the per-EDW pressure chain in
        20-loads.js. Ch 5 Sec 5 has two separate paths: [1.1] gives the seven
        equivalent design waves and the 24 load cases (that is 20-loads.js),
        while [1.3.4] gives an ENVELOPE maximum wave pressure built from the
        multiplicative Tab 4 / Tab 5 coefficients. hw = PWL,max/(rho.g) at
        x/L = 0.5, and it is what sets the band boundaries for PW,d-min. Taking
        it from the EDW chain instead gives 4.83 m where the rule gives 5.52 m.

     2. Geometry. Frame number to x, walking the frame-spacing regions from the
        origin frame, then the tier table on top of that.

     3. The [5.4] bulkhead pressure Psd per element, front / side / aft, plate
        and stiffener load points.

     4. The required scantlings for those elements: corrosion additions,
        material factors, net and gross plate thickness, Z_req, and the
        combined section modulus of the selected stiffener with its attached
        plating. The profile library carries only A, cy, I and H — the combined
        modulus is always recomputed for the actual spacing and plate, never
        read from a stored value, since it changes with both.

     5. The exposed deck: the Ch 5 Sec 5 [3] green sea pressure against the Pex
        envelope at the deck load point, then Ch 7 Sec 4 plating and Ch 7 Sec 5
        stiffeners. The Pex term is not computed here — solve() takes a hook so
        the caller supplies it from 20-loads.js, which keeps the two engines
        independently testable.

     6. The primary supporting members (Ch 11 Sec 5 [3.4.1], Ch 7 Sec 6), which
        take their pressure from the panel above them, and the superstructure
        sides (Ch 5 Sec 5 [5.3]), which apply only when the structure
        classifies as a superstructure rather than a deckhouse — the two side
        paths are alternatives, never both.

     7. The results envelope. Which rows belong in it follows from the
        classification rather than being fixed, since the two side paths are
        mutually exclusive.
   ============================================================================ */

window.NR467DH = (function () {
  'use strict';

  var TABLES = null;
  function setTables(json) { TABLES = json; }
  function ready() { return !!TABLES; }

  /* The profile library and the combined-modulus maths are shared with the
     fore module and live in 15-sections.js. These pass straight through so
     callers that already hold NR467DH keep working. */
  function setSections(json) { NR467SEC.setSections(json); }
  function profiles() { return NR467SEC.profiles(); }
  function profile(name) { return NR467SEC.profile(name); }
  function sectionModulus(prof, s_mm, t_mm) { return NR467SEC.sectionModulus(prof, s_mm, t_mm); }

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }

  /* ------------------------------------------------------ table lookup ----
     Tab 4 and Tab 5 are given at x/L = 0, 0.1 ... 1.0. Read linearly between
     the two bracketing columns, holding the end values outside the range. */
  function atX(row, xL) {
    var x = Math.min(Math.max(n(xL), 0), 1) * 10;
    var i = Math.min(Math.floor(x), 9);
    return row[i] + (x - i) * (row[i + 1] - row[i]);
  }

  /* The multiplicative form both tables share:
       coef = k_f . CW^kCW . CB^kCB . (T/L)^kT/L . (B/L)^kB/L . TR^kTR      */
  function multiplicative(g, d, xL, keys) {
    return atX(g[keys[0]], xL)
      * Math.pow(d.CW, atX(g[keys[1]], xL))
      * Math.pow(d.CB, atX(g[keys[2]], xL))
      * Math.pow(d.T / d.L, atX(g[keys[3]], xL))
      * Math.pow(d.B / d.L, atX(g[keys[4]], xL))
      * Math.pow(d.TR, atX(g[keys[5]], xL));
  }
  var K5 = ['kf', 'kCW', 'kCB', 'kTL', 'kBL', 'kTR'];
  var K4 = ['ff', 'fCW', 'fCB', 'fTL', 'fBL', 'fTR'];

  /* fnl for the envelope — Ch 5 Sec 5 [1.3.4], 0.9 at the ends falling to 0.6
     by x/L = 0.3 and flat thereafter. Not the same fnl as the EDW chain. */
  function fnlEnv(xL) {
    if (xL <= 0) return 0.9;
    return xL < 0.3 ? 0.9 + (0.6 - 0.9) / 0.3 * xL : 0.6;
  }

  /* ------------------------------------------------ wave envelope [1.3.4] --
     `d` carries L, B, T, CW, CB, TR and the navigation wave constants A0, A1,
     e1 and Lc; fps is the design-scenario factor. Returns one entry per load
     point location with its own alpha, Lref, H, fk,max and Pmax. */
  function envelopeAt(d, xL) {
    var out = {};
    ['CL', 'BL', 'WL'].forEach(function (loc) {
      var alpha = multiplicative(TABLES.tab5[loc], d, xL, K5);
      var Lref = Math.min(alpha * d.Lc, d.L * d.Lc / 40);
      var H = 0;
      if (Lref > 0) {
        H = d.L <= Lref
          ? d.fps * d.A0 * (1 - d.A1 * Math.pow(1 - Math.sqrt(d.L / Lref), d.e1))
          : d.fps * d.A0 * (1 - 0.9 * Math.pow(Math.sqrt(d.L / Lref) - 1, 1.8));
      }
      var fkMax = multiplicative(TABLES.tab4[loc], d, xL, K4);
      out[loc] = {
        loc: loc, alpha: alpha, Lref: Lref, H: H, fnl: fnlEnv(xL), fkMax: fkMax,
        Pmax: d.rho * d.g * fnlEnv(xL) * H * fkMax
      };
    });
    return out;
  }

  /* hw is read at midship: the wave band is a property of the ship, not of the
     bulkhead being checked. */
  function hwMax(d) {
    var e = envelopeAt(d, 0.5);
    return e.WL.Pmax / (d.rho * d.g);
  }

  /* ------------------------------------------------------- geometry -------
     Frame number to x, in metres forward of the origin frame. Each region
     carries its own spacing and the walk accumulates whole regions before the
     part-region remainder. Regions must be given aft to fore. */
  function frameToX(frame, setup) {
    var f = n(frame), x = 0, prev = n(setup.originFrame);
    for (var i = 0; i < setup.regions.length; i++) {
      var r = setup.regions[i], end = n(r.endFrame), s = n(r.spacing);
      if (f <= end) return (x + (f - prev) * s) / 1000;
      x += (end - prev) * s;
      prev = end;
    }
    /* Beyond the last region, carry on at the last region's spacing rather
       than clamping — a frame forward of the fore end is a data error, not a
       reason to silently return the fore perpendicular. */
    var last = setup.regions[setup.regions.length - 1];
    return (x + (f - prev) * n(last.spacing)) / 1000;
  }

  /* One row per tier. A tier with no frame is disabled, matching the
     workbook's "leave the Frame blank to disable that row". */
  function tiers(geo, L) {
    return (geo.tiers || []).map(function (t, i) {
      if (t.frame === '' || t.frame === null || t.frame === undefined) return null;
      var xAft = frameToX(t.frame, geo);
      var len = n(t.length);
      var xMid = xAft + len / 2;
      return {
        index: i + 1, name: t.name || ('Tier ' + (i + 1)),
        frame: n(t.frame), xAft: xAft, xMid: xMid, xFront: xAft + len,
        xLaft: L > 0 ? xAft / L : 0,
        xLmid: L > 0 ? xMid / L : 0,
        xLfront: L > 0 ? (xAft + len) / L : 0,
        z: n(t.z), width: n(t.width), length: len, height: n(t.height),
        b1: n(t.b1), s: n(t.s)
      };
    });
  }

  /* --------------------------------------------- coefficient a · Tab 36 ---
     Aft ends are a closed form in x/L. Fronts and sides read the table by
     effective tier, which is the tier number plus the [5.2.3] shift when that
     applies. Protected fronts share the side column down to the third tier. */
  function coefA(loc, xL, tier, protectedFront, L) {
    if (loc === 'aft') {
      return xL <= 0.5
        ? Math.min(0.7 + L / 1000 - 0.8 * xL, 1 - 0.8 * xL)
        : Math.min(0.5 + L / 1000 - 0.4 * xL, 0.8 - 0.4 * xL);
    }
    if (loc === 'front' && !protectedFront) {
      if (tier === 1) return Math.min(2 + L / 120, 4.5);
      if (tier === 2) return Math.min(1 + L / 120, 3.5);
      if (tier === 3) return Math.min(0.5 + L / 150, 2.5);
      if (tier === 4) return Math.min(0.9 * (0.5 + L / 150), 2.25);
      return Math.min(0.8 * (0.5 + L / 150), 2);
    }
    /* protected front, and every side */
    if (tier <= 3) return Math.min(0.5 + L / 150, 2.5);
    if (tier === 4) return Math.min(0.9 * (0.5 + L / 150), 2.25);
    return Math.min(0.8 * (0.5 + L / 150), 2);
  }

  /* coefficient b · Tab 38 — CB clamped to [0,6 ; 0,8] by Note 1. */
  function coefB(xL, CB) {
    var cb = Math.min(Math.max(n(CB), 0.6), 0.8);
    var q = (xL - 0.45) / (cb + 0.2);
    return xL <= 0.45 ? 1 + q * q : 1 + 1.5 * q * q;
  }

  /* coefficient c · Tab 36 note — the loaded breadth, floored at a quarter
     of the ship's breadth. */
  function coefC(b1, B) {
    return B > 0 ? 0.3 + 0.7 * Math.max(n(b1), 0.25 * B) / B : 0;
  }

  /* coefficient f · Tab 37 */
  function coefF(L) {
    if (L < 150) return (L / 10) * Math.exp(-L / 300) - (1 - Math.pow(L / 150, 2));
    if (L < 300) return (L / 10) * Math.exp(-L / 300);
    return 11.03;
  }

  /* Psd-min · Tab 39. Three bands in z: below the wave crest, one wave height
     above it (linear across), and clear of the wave altogether. An unprotected
     lowest-tier front is a special case above all of them. */
  function psdMin(loc, tier, protectedFront, z, T, hw, L) {
    var lowestFront = Math.min(Math.max(25 + 0.1 * L, 30), 50);
    var band = Math.min(Math.max(12.5 + 0.05 * L, 15), 25);
    var far = 2.5;
    if (loc === 'front' && tier === 1 && !protectedFront) return lowestFront;
    if (z <= T + hw) return band;
    if (z <= T + 2 * hw) return band + (far - band) * (z - T - hw) / hw;
    return far;
  }

  /* --------------------------------------------------- Psd · [5.4] --------
     Psd = 10 . nD . a . c . (b.f - (z - T)), never negative. */
  function psdAt(z, C) {
    return Math.max(10 * C.nD * C.a * C.c * (C.b * C.f - (z - C.T)), 0);
  }

  /* The stiffener load point is not the same as the plate's. The rule takes
     the greater of the pressure at mid-span and the span average, and the span
     average itself changes form once the span runs out through the top of the
     loaded zone: below that, average the two ends; above it, only the wetted
     fraction of the span carries load. */
  function psdStiff(z, span, C) {
    var mid = psdAt(z + span / 2, C);
    var zTop = z + span;
    var avg;
    if (zTop < C.T + C.b * C.f) {
      avg = (psdAt(zTop, C) + psdAt(z, C)) / 2;
    } else {
      var wet = span > 0 ? Math.min(Math.max(C.T + C.b * C.f - z, 0), span) / span : 0;
      avg = wet * psdAt(z, C) / 2;
    }
    return Math.max(mid, avg);
  }

  /* ------------------------------------------------ corrosion · Ch 4 Sec 3
     Two exposures per element, one each side of the plate, plus the reserve
     thickness. Under 10 mm gross the total is capped at a fifth of the plate,
     and a plate with no corrosive face either side gets nothing at all. */
  /* One shared Ch 4 Sec 3 Tab 1, read from the rule — see 10-inputs.js. */
  function tcOf(exposure) { return NRIN.tcOf(exposure); }
  function tcTotal(exp1, exp2, tGross, tRes) {
    var a = tcOf(exp1), b = tcOf(exp2);
    if (a === 0 && b === 0) return 0;
    var sum = a + b + n(tRes);
    return tGross <= 10 ? Math.min(sum, 0.2 * tGross) : sum;
  }

  /* fbdg · Tab 2 — the lowest effective tier is always 12; above it the value
     depends on how both ends of the vertical stiffener are attached. */
  function fbdgOf(effTier, endLow, endUp) {
    if (effTier === 1) return 12;
    var row = TABLES.fbdgUpper[String(endLow || 'welded').toLowerCase()];
    if (!row) return 12;
    var v = row[String(endUp || 'welded').toLowerCase()];
    return v === undefined ? 12 : v;
  }

  function median3(a, b, c) {
    var v = [a, b, c].sort(function (x, y) { return x - y; });
    return v[1];
  }

  /* Net plate thickness · Ch 7 Sec 4 — the pressure form against the rule
     minimum, whichever governs. Both are quoted net, so the corrosion total
     comes off each before they are compared. */
  function plateThickness(s_mm, kp, Pplate, tc, effTier, L) {
    var fromP = 0.95 * n(s_mm) * Math.sqrt(kp * Math.max(Pplate, 0)) / 1000 - tc;
    var floor = effTier === 1
      ? (5 + 0.01 * Math.min(L, 300)) * Math.sqrt(kp) - tc
      : (4 + 0.01 * median3(100, L, 300)) * Math.sqrt(kp) - tc;
    return Math.max(fromP, floor);
  }

  /* ------------------------------------------------------- elements -------
     One row per bulkhead element. `el` carries tier index, location
     ('front' | 'side' | 'aft'), protection and the stiffener span; the tier
     supplies z, s, b1 and the x/L the location asks for. */
  function element(el, tier, C, hw) {
    var loc = String(el.location || 'front').toLowerCase();
    var xL = loc === 'aft' ? tier.xLaft : (loc === 'front' ? tier.xLfront : tier.xLmid);
    var effTier = tier.index + n(C.tierShift);
    var prot = String(el.protection || 'No').toLowerCase() === 'yes';

    var K = {
      nD: C.nD, T: C.T,
      a: coefA(loc, xL, effTier, prot, C.L),
      b: coefB(xL, C.CB),
      c: coefC(tier.b1, C.B),
      f: C.f
    };
    /* Span is the tier height, floored at 2 m the way the workbook does. */
    var span = Math.max(tier.height, 2);
    var z = tier.z;

    var Pcalc = psdAt(z, K);
    var Pmin = psdMin(loc, effTier, prot, z, C.T, hw, C.L);
    var Pplate = Math.max(Pcalc, Pmin);
    var Pstiff = Math.max(psdStiff(z, span, K), Pmin);

    /* ---- corrosion, material and the required scantlings ---------------- */
    var tGross = n(el.tGross);
    var tc = tcTotal(el.exposure1, el.exposure2, tGross, C.tRes);
    var kp = NRIN.kOf(n(el.ReHplate, 235));
    var kst = NRIN.kOf(n(el.ReHstiff, 235));
    var fbdg = fbdgOf(effTier, el.endLow, el.endUp);

    var tNet = plateThickness(tier.s, kp, Pplate, tc, effTier, C.L);
    var tReq = tNet + tc;
    var Zreq = fbdg > 0 ? kst * Pstiff * tier.s * span * span / (fbdg * 235) : 0;

    var sec = sectionModulus(profile(el.stiffener), tier.s, tGross);
    var Zsel = sec ? sec.Zgov : 0;

    return {
      name: el.name || (tier.name + ' ' + loc),
      tier: tier.index, effTier: effTier, location: loc, protection: prot ? 'Yes' : 'No',
      z: z, xL: xL, s: tier.s, span: span, b1: tier.b1,
      a: K.a, b: K.b, c: K.c, f: K.f,
      Pcalc: Pcalc, Pmin: Pmin, Pplate: Pplate, Pstiff: Pstiff,
      tGross: tGross, exposure1: el.exposure1, exposure2: el.exposure2, tc: tc,
      ReHplate: n(el.ReHplate, 235), kp: kp, ReHstiff: n(el.ReHstiff, 235), kst: kst,
      fbdg: fbdg, tNet: tNet, tReq: tReq, Zreq: Zreq,
      stiffener: el.stiffener || '', section: sec, Zsel: Zsel,
      /* These are MINIMA, so utilisation is required/selected — the same sense
         as the machinery module and the opposite of a buckling check. */
      UCt: tGross > 0 ? tReq / tGross : null,
      UCz: Zsel > 0 ? Zreq / Zsel : null
    };
  }

  /* ==================================================== exposed deck ======
     Ch 5 Sec 5 [3] for the load, Ch 7 Sec 4 for the plating and Ch 7 Sec 5 for
     the stiffener. Three things differ from the bulkhead elements, and each is
     easy to get wrong:

       - x/L here is measured against the LOAD LINE length LLL, not the rule
         length L. Every other x/L in this module uses L.
       - The tier that sets chi is the one the deck lies WITHIN, one above the
         tier it caps: tier + shift + 1.
       - t_req comes out gross directly, with the corrosion total added to the
         pressure form rather than taken off it as in the bulkhead net
         formulation.
     ------------------------------------------------------------------- */

  /* Green sea pressure on an exposed deck · Ch 5 Sec 5 [3]. Short ships have
     their own pair of forms; from LLL = 100 m up it is flat to x/L = 0.75 and
     then rises, more steeply for a type-A vessel. */
  function greenSea(LLL, xLL, typeA) {
    if (LLL < 100) {
      return xLL <= 0.75
        ? 14.9 + 0.195 * LLL
        : 15.8 + (LLL / 3) * (1 - (5 / 3) * (1 - xLL)) - 3.6 * (1 - xLL);
    }
    if (xLL <= 0.75) return 34.3;
    var top = 49.1 + (typeA ? 0.356 : 0.0726) * (LLL - 100);
    return 34.3 + ((top - 34.3) / 0.25) * (xLL - 0.75);
  }

  /* chi · Tab 32, by the tier the deck lies within, flat from the ninth up. */
  function chiOf(effTierDeck) {
    var i = Math.max(Math.round(effTierDeck), 1);
    var v = TABLES.tab32chi[i >= 9 ? '9+' : String(i)];
    return v === undefined ? 0.1 : v;
  }

  /* Plate aspect coefficient · Ch 7 Sec 4 — never above 1. */
  function alphaP(s_mm, span_m) {
    return Math.min(1.2 - n(s_mm) / (2.1 * n(span_m) * 1000), 1);
  }

  /* The deck load point for the Pex envelope · Ch 5 Sec 5 [3.2.3] and
     [3.2.4]: the top of the tier, at the tier's mid-length, on both sides at
     y = +/- Bx,max/2. Handed out as a point pair for a caller that holds the
     loads engine — this module does not reach into it itself, so the two stay
     independently testable. */
  function deckLoadPoints(tier, Bx, B) {
    var half = (n(Bx) > 0 ? n(Bx) : n(B)) / 2;
    var z = tier.z + tier.height;
    return [
      { x: tier.xMid * 1000, y: half, z: z, xL: tier.xLmid },
      { x: tier.xMid * 1000, y: -half, z: z, xL: tier.xLmid }
    ];
  }

  function deckRow(dk, tier, C, pexEnv) {
    var effTier = tier.index + n(C.tierShift) + 1;
    var xLL = C.LLL > 0 ? tier.xMid / C.LLL : 0;
    var chi = chiOf(effTier);
    var PWdmin = greenSea(C.LLL, xLL, C.typeA);
    var Pd = Math.max(chi * PWdmin, n(pexEnv));

    var s = tier.s, span = tier.length;
    var ap = alphaP(s, span);
    var ac = TABLES.acSuper[C.acSet] || TABLES.acSuper['AC-2'];

    var tSel = n(dk.tSel);
    var tc = tcTotal(dk.exposure1, dk.exposure2, tSel, C.tRes);
    var ReHp = n(dk.ReHplate, 235), ReHs = n(dk.ReHstiff, 235);
    var fbdg = n(dk.fbdg, 12);

    var tReq = 0.0158 * ap * s * Math.sqrt(Pd / (ac.Ca * ReHp)) + tc;
    var Zreq = fbdg > 0 ? 1000 * Pd * (s / 1000) * span * span / (fbdg * ac.Cs * ReHs) : 0;

    var sec = sectionModulus(profile(dk.stiffener), s, tSel);
    var Zsel = sec ? sec.Zgov : 0;

    return {
      name: dk.name || (tier.name + ' deck'),
      tier: tier.index, effTier: effTier, xLL: xLL, s: s, span: span,
      chi: chi, PWdmin: PWdmin, pexEnv: n(pexEnv), Pd: Pd,
      alphaP: ap, Ca: ac.Ca, Cs: ac.Cs,
      exposure1: dk.exposure1, exposure2: dk.exposure2, tc: tc,
      ReHplate: ReHp, kp: NRIN.kOf(ReHp), ReHstiff: ReHs, kst: NRIN.kOf(ReHs),
      fbdg: fbdg, tReq: tReq, Zreq: Zreq,
      tSel: tSel, stiffener: dk.stiffener || '', section: sec, Zsel: Zsel,
      UCt: tSel > 0 ? tReq / tSel : null,
      UCz: Zsel > 0 ? Zreq / Zsel : null
    };
  }

  /* ================================================ structure check =======
     Ch 1 Sec 3 [2.2]. What the structure IS decides which pressure rule its
     sides follow: a superstructure's sides take the Pex path of [5.3], a
     deckhouse's take the Psd path of [5.4]. It comes down to how far the side
     is set in from the ship's side. */
  function structCheck(dh, B) {
    var limit = 0.04 * n(B);
    var offset = n(dh.inboardOffset);
    var ruled = offset <= limit ? 'superstructure' : 'deckhouse';
    var declared = String(dh.declaredType || 'deckhouse').toLowerCase();
    return {
      declared: declared, ruled: ruled,
      agreement: declared === ruled ? 'MATCH' : 'CHECK',
      lowestTierWidth: n(dh.lowestTierWidth), inboardOffset: offset,
      limit: limit, minWidthForSuperstructure: n(B) - 2 * limit
    };
  }

  /* ========================================= primary supporting members ===
     Ch 11 Sec 5 [3.4.1] and Ch 7 Sec 6. The PSM carries the pressure of the
     panel it supports, so `Pcalc` comes in from the deck or bulkhead row above
     it rather than being recomputed here.

     Two things differ from the panels: the corrosion total has NO under-10 mm
     cap (a PSM web is not a plate panel), and the attached plating is the
     effective breadth b_eff, not the stiffener spacing — so the section
     modulus is taken over b_eff. */

  /* Effective breadth of attached plating · Ch 7 Sec 6. */
  function beff(S_m, span_m) {
    var S = n(S_m), span = n(span_m);
    if (S <= 0 || span <= 0) return 0;
    if (span / S >= 1) {
      return S * Math.min(1 / (1 / 3 + 1.7 * Math.pow(S / span, 1.6)), (span / S) / 7.5, 1);
    }
    return 0.407 * span;
  }

  function psmRow(pm, C, Pcalc, span) {
    var model = TABLES.psmModel[pm.model || 'A'] || TABLES.psmModel.A;
    var ac = TABLES.acPSM[pm.acSet || C.acSet] || TABLES.acPSM['AC-2'];
    var S = n(pm.S), P = n(Pcalc), sp = n(span);
    var ReH = n(pm.ReH, 235);

    var a = tcOf(pm.exposure1), b = tcOf(pm.exposure2);
    /* No 0.2 t cap here — that cap is a plate-panel rule. */
    var tc = (a === 0 && b === 0) ? 0 : a + b + n(C.tRes);

    var Zreq = (ac.chi * model.fbdg * ac.Cs * ReH) > 0
      ? 1000 * P * S * sp * sp / (ac.chi * model.fbdg * ac.Cs * ReH) : 0;
    var tauAllow = ReH / Math.sqrt(3);
    var AshrReq = (ac.chi * ac.Ct * tauAllow) > 0
      ? 10 * model.fshr * P * S * sp / (ac.chi * ac.Ct * tauAllow) : 0;

    var be = beff(S, sp);
    var sec = sectionModulus(profile(pm.stiffener), be * 1000, n(pm.tSel));
    var Zeff = sec ? sec.Zgov : 0;

    return {
      name: pm.name || 'PSM', Pcalc: P, S: S, span: sp,
      model: pm.model || 'A', acSet: pm.acSet || C.acSet,
      fbdg: model.fbdg, fshr: model.fshr, Cs: ac.Cs, Ct: ac.Ct, chi: ac.chi,
      exposure1: pm.exposure1, exposure2: pm.exposure2, tc: tc, tcPSM: 0.5 * tc,
      ReH: ReH, Zreq: Zreq, AshrReq: AshrReq,
      sigmaAllow: ReH, tauAllow: tauAllow,
      beff: be, tSel: n(pm.tSel), stiffener: pm.stiffener || '',
      section: sec, Zeff: Zeff,
      UCz: Zeff > 0 ? Zreq / Zeff : null
    };
  }

  /* ==================================== superstructure sides · [5.3] ======
     Only for a structure that classifies as a SUPERSTRUCTURE. Its sides are
     wetted, so they take Pex = Ps + Pw rather than the [5.4] bulkhead form the
     deckhouse sides use — the two are alternatives, never both.

     The wave term is the per-tier PWL,max from the same [1.3.4] envelope that
     gives hw, read at the tier's own x/L rather than at midship. It applies in
     full up to the draught, decays linearly over the wave height above it, and
     is gone beyond that. The whole thing has a 2.5 kN/m2 floor. */
  function pexSide(z, T, hw, PWLmax, rho, g) {
    var hydro = z < T ? rho * g * (T - z) : 0;
    var wave;
    if (z <= T) wave = PWLmax;
    else if (z <= T + hw) wave = PWLmax - rho * g * (z - T);
    else wave = 0;
    return Math.max(hydro + wave, 2.5);
  }

  function superSideRow(ss, tier, C, hw, PWLmax) {
    var zPlate = tier.z, zStiff = tier.z + tier.height / 2;
    var Pplate = pexSide(zPlate, C.T, hw, PWLmax, C.rho, C.g);
    var Pstiff = pexSide(zStiff, C.T, hw, PWLmax, C.rho, C.g);

    var s = tier.s, span = tier.height;
    var ac = TABLES.acSuper[C.acSet] || TABLES.acSuper['AC-2'];
    var end = TABLES.stiffEnd[C.stiffEnd] || TABLES.stiffEnd['lower vertical'];
    var ReHp = n(ss.ReHplate, 235), ReHs = n(ss.ReHstiff, 235);
    var tSel = n(ss.tSel);
    var tc = tcTotal(ss.exposure1 || 'atmosphere', ss.exposure2 || 'dry', tSel, C.tRes);

    var tReq = 0.0158 * alphaP(s, span) * s * Math.sqrt(Pplate / (ac.Ca * ReHp)) + tc;
    var Zreq = (end.fbdg * ac.Cs * ReHs) > 0
      ? 1000 * Pstiff * (s / 1000) * span * span / (end.fbdg * ac.Cs * ReHs) : 0;

    var prof = profile(ss.stiffener);
    var sec = sectionModulus(prof, s, tSel);
    var Zsel = sec ? sec.Zgov : 0;

    /* Web shear. The web height and thickness come from the library rather
       than from parsing the profile name at run time. */
    var twReq = null, twSel = null;
    if (prof && prof.hw > 0) {
      twReq = end.fshr * Pstiff * s * span
        / (0.9 * prof.hw * ac.Ct * (ReHs / Math.sqrt(3)));
      twSel = prof.tw;
    }
    /* Minimum thickness — 5 mm, or 40 % of the net required, whichever is more. */
    var tMinReq = Math.max(5, 0.4 * Math.max(tReq - tc, 0));

    return {
      name: ss.name || (tier.name + ' side'), tier: tier.index,
      zPlate: zPlate, zStiff: zStiff, PWLmax: PWLmax,
      Pplate: Pplate, Pstiff: Pstiff, s: s, span: span,
      ReHplate: ReHp, kp: NRIN.kOf(ReHp), ReHstiff: ReHs, kst: NRIN.kOf(ReHs),
      fbdg: end.fbdg, fshr: end.fshr, Ca: ac.Ca, Cs: ac.Cs, Ct: ac.Ct,
      tc: tc, tReq: tReq, Zreq: Zreq, tSel: tSel,
      stiffener: ss.stiffener || '', section: sec, Zsel: Zsel,
      twReq: twReq, twSel: twSel, tMinReq: tMinReq,
      UCt: tSel > 0 ? tReq / tSel : null,
      UCz: Zsel > 0 ? Zreq / Zsel : null,
      UCtw: (twReq !== null && twSel > 0) ? twReq / twSel : null,
      UCtmin: tSel > 0 ? tMinReq / tSel : null
    };
  }

  /* ==================================================== results envelope ==
     Which rows belong in the roll-up follows from the classification, and the
     two side paths are mutually exclusive:

       deckhouse       front, side and aft bulkheads, plus the decks
       superstructure  front and aft bulkheads, the [5.3] sides, plus the decks

     The workbook hard-codes the deckhouse case and leaves a note to re-check
     if the structure is ever reclassified. Doing it from the classification
     removes that footgun.

     The PSM does not appear as a row — it has no plating check — but its worst
     modulus utilisation still decides the overall verdict. */
  function envelope(R) {
    var superstructure = R.structure.ruled === 'superstructure';
    var rows = [];
    R.elements.forEach(function (e) {
      if (superstructure && e.location === 'side') return;
      rows.push({ name: e.name, kind: 'element', UCt: e.UCt, UCz: e.UCz,
        tReq: e.tReq, Zreq: e.Zreq });
    });
    if (superstructure) {
      R.superSides.forEach(function (e) {
        rows.push({ name: e.name, kind: 'side', UCt: e.UCt, UCz: e.UCz,
          tReq: e.tReq, Zreq: e.Zreq });
      });
    }
    R.decks.forEach(function (e) {
      rows.push({ name: e.name, kind: 'deck', UCt: e.UCt, UCz: e.UCz,
        tReq: e.tReq, Zreq: e.Zreq });
    });
    rows.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
    rows.forEach(function (r) {
      r.status = (r.UCt !== null && r.UCt <= 1 && r.UCz !== null && r.UCz <= 1) ? 'PASS' : 'FAIL';
    });

    var worstUCt = -Infinity, governing = '';
    rows.forEach(function (r) {
      if (r.UCt !== null && r.UCt > worstUCt) { worstUCt = r.UCt; governing = r.name; }
    });
    var worstUCz = -Infinity, governingZ = '';
    rows.forEach(function (r) {
      if (r.UCz !== null && r.UCz > worstUCz) { worstUCz = r.UCz; governingZ = r.name; }
    });
    var psmWorst = -Infinity, psmGov = '';
    R.psm.forEach(function (p) {
      if (p.UCz !== null && p.UCz > psmWorst) { psmWorst = p.UCz; psmGov = p.name; }
    });

    var maxZreq = 0, maxTreq = 0;
    rows.forEach(function (r) {
      if (r.Zreq > maxZreq) maxZreq = r.Zreq;
      if (r.tReq > maxTreq) maxTreq = r.tReq;
    });

    var allPass = rows.every(function (r) { return r.status === 'PASS'; });
    var psmOK = !(psmWorst > 1);
    return {
      superstructure: superstructure, rows: rows,
      worstUCt: worstUCt === -Infinity ? null : worstUCt, governing: governing,
      worstUCz: worstUCz === -Infinity ? null : worstUCz, governingZ: governingZ,
      psmWorst: psmWorst === -Infinity ? null : psmWorst, psmGoverning: psmGov,
      maxZreq: maxZreq, maxTreq: maxTreq,
      overall: (allPass && psmOK) ? 'PASS' : 'FAIL'
    };
  }

  /* ---------------------------------------------------------- solve -------
     `I` is the shared input model and `dh` the deckhouse block. `hooks.pexEnv`
     is optional: given a point pair from deckLoadPoints it returns the Pex
     envelope there, so the deck can take the greater of the green sea load and
     the wave load. Without it the wave term is zero, which is what it is
     wherever the deck sits clear of the wave. */
  function solve(I, dh, hooks) {
    var S = I.ship, L = n(S.L);
    /* The roll period TR and the navigation wave constants are ship-level and
       20-loads.js already derives them, so prefer its output when the caller
       hands it over rather than keeping a second copy on the deckhouse block. */
    var dv = (hooks && hooks.derived) || null;
    var d = {
      L: L, B: n(S.B), T: n(S.TSC), CW: n(S.CW_LC), CB: n(S.CB_LC, n(S.CB)),
      TR: dv ? n(dv.TR) : n(dh.TR),
      rho: n(S.rho, 1.025), g: n(S.g, 9.81),
      A0: dv ? n(dv.A0) : n(dh.A0, 0.9),
      A1: dv ? n(dv.A1) : n(dh.A1, 1.3),
      e1: dv ? n(dv.e1) : n(dh.e1, 1.8),
      Lc: dv ? n(dv.Lc) : n(dh.Lc, 552),
      fps: dv ? n(dv.fps) : n(dh.fps, 1)
    };
    var hw = hwMax(d);
    var TI = tiers(dh.geometry || { tiers: [] }, L);
    var C = {
      L: L, B: n(S.B), T: n(S.TSC), CB: n(S.CB_LC, n(S.CB)),
      /* A blank or zero LLL means "not entered", not "zero metres" — the field
         says so on the Ship page. Falling through to L keeps the deck x/L
         sane instead of pinning it at zero. */
      LLL: n(S.LLL) > 0 ? n(S.LLL) : L,
      typeA: String(dh.shipTypeA || 'No').toLowerCase() === 'yes',
      acSet: dh.acSet || 'AC-2', stiffEnd: dh.stiffEnd || 'lower vertical',
      rho: n(S.rho, 1.025), g: n(S.g, 9.81),
      nD: n(dh.nD, 1), tierShift: n(dh.tierShift), f: coefF(L), tRes: n(S.t_res)
    };
    var rows = (dh.elements || []).map(function (el) {
      var t = TI[n(el.tier) - 1];
      return t ? element(el, t, C, hw) : null;
    }).filter(Boolean);

    var pexOf = hooks && hooks.pexEnv;
    var decks = (dh.decks || []).map(function (dk) {
      var t = TI[n(dk.tier) - 1];
      if (!t) return null;
      var pts = deckLoadPoints(t, dh.Bx, S.B);
      return deckRow(dk, t, C, pexOf ? pexOf(pts, t) : 0);
    }).filter(Boolean);

    /* Superstructure sides. Read the wave envelope again at each tier's own
       x/L — hw is a midship quantity, this is not. */
    var sides = (dh.superSides || []).map(function (ss) {
      var t = TI[n(ss.tier) - 1];
      if (!t) return null;
      return superSideRow(ss, t, C, hw, envelopeAt(d, t.xLmid).WL.Pmax);
    }).filter(Boolean);

    /* PSM rows draw their pressure from the panel they support. */
    var byName = {};
    decks.forEach(function (x) { byName[x.name] = x.Pd; });
    rows.forEach(function (x) { byName[x.name] = x.Pplate; });
    var psm = (dh.psm || []).map(function (pm) {
      var t = TI[n(pm.tier) - 1];
      var P = pm.Pcalc !== undefined ? pm.Pcalc : byName[pm.from];
      return psmRow(pm, C, P, pm.span !== undefined ? pm.span : (t ? t.length : 0));
    });

    var R = {
      d: d, hw: hw, envelope: envelopeAt(d, 0.5), f: C.f,
      structure: structCheck(dh, S.B),
      tiers: TI.filter(Boolean), elements: rows, decks: decks,
      psm: psm, superSides: sides
    };
    R.results = envelope(R);
    return R;
  }

  return {
    setTables: setTables, setSections: setSections, ready: ready,
    profiles: profiles, profile: profile,
    tcOf: tcOf, tcTotal: tcTotal, sectionModulus: sectionModulus,
    fbdgOf: fbdgOf, plateThickness: plateThickness,
    envelopeAt: envelopeAt, hwMax: hwMax,
    frameToX: frameToX, tiers: tiers,
    coefA: coefA, coefB: coefB, coefC: coefC, coefF: coefF,
    psdMin: psdMin, psdAt: psdAt, psdStiff: psdStiff,
    greenSea: greenSea, chiOf: chiOf, alphaP: alphaP,
    structCheck: structCheck, beff: beff, psmRow: psmRow,
    pexSide: pexSide, superSideRow: superSideRow, envelope: envelope,
    deckLoadPoints: deckLoadPoints, deckRow: deckRow,
    element: element, solve: solve
  };
})();
