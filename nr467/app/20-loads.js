/* ============================================================================
   NR467 external pressure engine — BV NR467 Pt B, Ch 5, Sec 5.

   This is the piece all four modules share. Fore, Aft, Machinery and Deckhouse
   each lived in their own workbook with their own copy of the ship particulars;
   here the particulars are entered once and this engine turns them into Ps, Pw
   and Pex at any load point, for all 24 strength load cases, with the envelope
   and the governing case.

   The Tab 9-20 coefficient tables are data, not code: they live in
   app/data/edw-coefficients.json, extracted from the workbook's own Coefficients
   sheet, and are injected with setTables() before anything else is called.
   ============================================================================ */

window.NR467LOADS = (function () {
  'use strict';

  var PI = Math.PI;
  var TABLES = null;

  function setTables(json) { TABLES = json && json.tables ? json.tables : json; }
  function ready() { return !!TABLES; }

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }

  /* ---- the seven equivalent design waves ------------------------------- */
  /* alpha gives the reference length coefficient; fnl is piecewise linear in
     x/L through the four break points 0, 0.3, 0.7 and 1.0. */
  var EDW = [
    {
      key: 'HVM', label: 'Head, vertical bending', wea: 'Table 9 - HVM weather and lee sides',
      lee: 'Table 9 - HVM weather and lee sides', fbeta: 1,
      alpha: function (d) { return 0.65 * Math.pow(d.CW_LC, -1.3); },
      fnl: { normal: [0.70, 0.90, 0.90, 0.60], bwe: [0.85, 0.95, 0.95, 0.80] }
    },
    {
      key: 'FVM', label: 'Following, vertical bending', wea: 'Table 10 - FVM weather and lee sides',
      lee: 'Table 10 - FVM weather and lee sides', fbeta: 1,
      alpha: function (d) { return 0.65 * Math.pow(d.CW_LC, -1.3); },
      fnl: { normal: [0.90, 0.90, 0.90, 0.90], bwe: [0.95, 0.95, 0.95, 0.95] }
    },
    {
      key: 'BR', label: 'Beam, roll', wea: 'Table 11 - BR weather side', lee: 'Table 12 - BR lee side',
      fbeta: 0.8, roll: true,
      alpha: function (d) { return 4.6 * Math.pow(d.TR, -2); },
      fnl: { normal: [1, 1, 1, 1], bwe: [1, 1, 1, 1] }
    },
    {
      key: 'BP', label: 'Beam, pressure', wea: 'Table 13 - BP weather side', lee: 'Table 14 - BP lee side',
      fbeta: 0.8, tallWave: true,
      alpha: function (d) { return 0.55 * Math.pow(d.fTL, -0.4); },
      fnl: { normal: [0.60, 0.60, 0.60, 0.60], bwe: [0.60, 0.80, 0.80, 0.60] }
    },
    {
      key: 'OHM', label: 'Oblique, hull girder mid', wea: 'Table 15 - OHM weather side',
      lee: 'Table 16 - OHM lee side', fbeta: 1,
      alpha: function (d) { return 0.65 * Math.pow(d.fTL, -0.3); },
      fnl: { normal: [0.80, 0.80, 0.80, 0.80], bwe: [0.90, 0.90, 0.90, 0.90] }
    },
    {
      key: 'OHS', label: 'Oblique, hull girder shear', wea: 'Table 17 - OHS weather side',
      lee: 'Table 18 - OHS lee side', fbeta: 1,
      alpha: function (d) { return 0.68 * Math.pow(d.fTL, -0.3); },
      fnl: { normal: [0.80, 0.80, 0.80, 0.80], bwe: [0.90, 0.90, 0.90, 0.90] }
    },
    {
      key: 'OVA', label: 'Oblique, vertical acceleration', wea: 'Table 19 - OVA weather side',
      lee: 'Table 20 - OVA lee side', fbeta: 1,
      alpha: function (d) { return 0.24 * Math.pow(d.fBL, -0.8); },
      fnl: { normal: [0.50, 0.80, 0.80, 0.60], bwe: [0.75, 0.90, 0.90, 0.80] }
    }
  ];

  /* The 24 strength load cases of Ch 5 Sec 5. `neg` flips the sign of the wave
     pressure; `side` picks the weather or lee table through the sign of y. */
  var CASES = [
    { name: 'HVM1', edw: 'HVM', side: '-', neg: true }, { name: 'HVM2', edw: 'HVM', side: '-', neg: false },
    { name: 'FVM1', edw: 'FVM', side: '-', neg: true }, { name: 'FVM2', edw: 'FVM', side: '-', neg: false },
    { name: 'BR1-P', edw: 'BR', side: 'Port', neg: true }, { name: 'BR2-P', edw: 'BR', side: 'Port', neg: false },
    { name: 'BR1-S', edw: 'BR', side: 'Stbd', neg: true }, { name: 'BR2-S', edw: 'BR', side: 'Stbd', neg: false },
    { name: 'BP1-P', edw: 'BP', side: 'Port', neg: true }, { name: 'BP2-P', edw: 'BP', side: 'Port', neg: false },
    { name: 'BP1-S', edw: 'BP', side: 'Stbd', neg: true }, { name: 'BP2-S', edw: 'BP', side: 'Stbd', neg: false },
    { name: 'OHM1-P', edw: 'OHM', side: 'Port', neg: false }, { name: 'OHM2-P', edw: 'OHM', side: 'Port', neg: true },
    { name: 'OHM1-S', edw: 'OHM', side: 'Stbd', neg: false }, { name: 'OHM2-S', edw: 'OHM', side: 'Stbd', neg: true },
    { name: 'OHS1-P', edw: 'OHS', side: 'Port', neg: false }, { name: 'OHS2-P', edw: 'OHS', side: 'Port', neg: true },
    { name: 'OHS1-S', edw: 'OHS', side: 'Stbd', neg: false }, { name: 'OHS2-S', edw: 'OHS', side: 'Stbd', neg: true },
    { name: 'OVA1-P', edw: 'OVA', side: 'Port', neg: true }, { name: 'OVA2-P', edw: 'OVA', side: 'Port', neg: false },
    { name: 'OVA1-S', edw: 'OVA', side: 'Stbd', neg: true }, { name: 'OVA2-S', edw: 'OVA', side: 'Stbd', neg: false }
  ];

  /* Navigation notation drives the wave-height law — Ch 5 Sec 2. */
  var NAV = {
    'unrestricted navigation': { A0: 0.9, A1: 1.3, e1: 1.8, A2: 0.9, e2: 1.8, Lc: 552 },
    'summer zone': { A0: 0.78, A1: 1.3, e1: 1.8, A2: 0.9, e2: 1.8, Lc: 500 },
    'tropical zone': { A0: 0.61, A1: 1.48, e1: 2.01, A2: 0.43, e2: 1.74, Lc: 319 },
    'coastal area': { A0: 0.61, A1: 1.48, e1: 2.01, A2: 0.43, e2: 1.74, Lc: 319 },
    'sheltered area': { A0: 0.47, A1: 1.55, e1: 2.13, A2: 0.29, e2: 1.69, Lc: 244 }
  };

  /* ---- the wave parameter H · Ch 5 Sec 3 [1.1.1] ----------------------
     Every wave-driven load in the rule reaches H the same way: a reference
     length from its own alpha, then one of two branches depending on whether
     the ship is shorter or longer than that reference.

        Lref = min[ alpha . f_alpha . Lc ; L . (Lc/40) ]
        H    = fp.A0.(1 - A1.(1 - sqrt(L/Lref))^e1)   for L <= Lref
        H    = fp.A0.(1 - A2.(sqrt(L/Lref) - 1)^e2)   for L >  Lref

     Only alpha changes between them — per EDW here, per roll notation in
     derive(), and per impact type in the fore and aft modules. It lives in one
     place so the three cannot drift apart. `nv` supplies A0, A1, e1, A2, e2
     and Lc; f_alpha is 1,0 for strength assessment. */
  function waveH(alpha, L, fp, nv, fAlpha) {
    var Lref = Math.min(alpha * (fAlpha === undefined ? 1 : fAlpha) * nv.Lc, L * nv.Lc / 40);
    if (!(Lref > 0)) return { Lref: 0, H: 0 };
    var H = L <= Lref
      ? fp * nv.A0 * (1 - nv.A1 * Math.pow(1 - Math.sqrt(L / Lref), nv.e1))
      : fp * nv.A0 * (1 - nv.A2 * Math.pow(Math.sqrt(L / Lref) - 1, nv.e2));
    return { Lref: Lref, H: H };
  }

  function navOf(notation) {
    return NAV[String(notation || 'unrestricted navigation').toLowerCase()]
      || NAV['unrestricted navigation'];
  }

  /* ---- ship-level derived quantities · Ch 5 Sec 2 ---------------------- */
  function derive(p) {
    var L = n(p.L), B = n(p.B), TSC = n(p.TSC), TLC = n(p.TLC, n(p.TSC));
    var rho = n(p.rho, 1.025), g = n(p.g, 9.81);
    var nav = navOf(p.navigation);
    var d = {
      L: L, B: B, TSC: TSC, TLC: TLC, rho: rho, g: g,
      /* CB falls back to the scantling-draught value, which is a real input.
         CW has no such partner — there is one waterplane coefficient on the
         Ship page and it is the one the rule asks for. */
      CB_LC: n(p.CB_LC, n(p.CB)), CW_LC: n(p.CW_LC),
      fTL: L > 0 ? TLC / L : 0,
      fBL: L > 0 ? B / L : 0,
      fT: Math.min(Math.max(TSC > 0 ? TLC / TSC : 1, 0.5), 1),
      fBK: String(p.bilgeKeel || 'Yes').toLowerCase() === 'yes' ? 1 : 1.2,
      fps: String(p.scenario || 'extreme sea').toLowerCase() === 'extreme sea' ? 1 : 0.8,
      A0: nav.A0, A1: nav.A1, e1: nav.e1, A2: nav.A2, e2: nav.e2, Lc: nav.Lc,
      bwe: String(p.scenario || '').toLowerCase() === 'ballast water exchange',
      PexFloor: String(p.assessment || 'direct strength').toLowerCase() === 'prescriptive' ? 2.5 : 0
    };
    d.fp = d.fps;
    /* Roll period and angle — Ch 5 Sec 3 [2.1]. GM and kr default to the
       fractions of B the rule allows when they are not entered. */
    d.GM = String(p.gmMode || 'Auto').toLowerCase() === 'auto'
      ? (String(p.shipGroup || 'other').toLowerCase() === 'tanker/bulker' ? 0.12 : 0.07) * B
      : n(p.GM);
    d.kr = String(p.krMode || 'Auto').toLowerCase() === 'auto' ? 0.35 * B : n(p.kr);
    d.Ttheta = d.GM > 0 ? 2.3 * PI * d.kr / Math.sqrt(g * d.GM) : 0;
    d.TR = L > 0 ? Math.min(d.Ttheta * Math.sqrt(g / L), 75 / Math.sqrt(L)) : 0;
    /* n is 1 under unrestricted navigation; otherwise the ratio of the roll
       wave height for the notation to the unrestricted one. */
    var alphaRoll = 4.6 * Math.pow(d.TR, -2);
    function Hroll(nv) { return waveH(alphaRoll, L, d.fp, nv).H; }
    var unr = NAV['unrestricted navigation'];
    d.nRoll = (nav === unr) ? 1 : (Hroll(unr) !== 0 ? Hroll(nav) / Hroll(unr) : 1);
    d.ffa = d.fps * Math.max(d.nRoll, 0.5);
    d.theta = Math.max(9000 * (1.25 - 0.025 * d.Ttheta) / ((B + 75) * PI) * d.ffa * d.fBK,
      1862 / (B + 75) * d.ffa * d.fBK);
    return d;
  }

  /* ---- table lookup: linear interpolation in x/L ----------------------- */
  function interp(tableName, rowLabel, xL) {
    var t = TABLES[tableName];
    if (!t) throw new Error('coefficient table missing: ' + tableName);
    var row = t[rowLabel];
    if (!row) throw new Error('coefficient row missing: ' + tableName + ' / ' + rowLabel);
    var i = Math.min(Math.floor(xL / 0.1), 9);
    var f = xL / 0.1 - i;
    return row[i] + f * (row[i + 1] - row[i]);
  }

  /* One tabulated pressure line (CL, BL or WL) for one EDW side. */
  function line(tableName, prefix, xL, d, H, fnl, fbeta) {
    var k = interp(tableName, prefix + ' k', xL)
      + interp(tableName, prefix + ' kT', xL) * d.fTL
      + interp(tableName, prefix + ' kCB', xL) * d.CB_LC
      + interp(tableName, prefix + ' kCW', xL) * d.CW_LC
      + interp(tableName, prefix + ' kB', xL) * d.fBL
      + interp(tableName, prefix + ' kR', xL) * d.TR;
    return d.rho * d.g * fnl * fbeta * H * k;
  }

  function piecewise(vals, xL) {
    if (xL <= 0.3) return vals[0] + (xL / 0.3) * (vals[1] - vals[0]);
    if (xL <= 0.7) return vals[1] + ((xL - 0.3) / 0.4) * (vals[2] - vals[1]);
    return vals[2] + ((xL - 0.7) / 0.3) * (vals[3] - vals[2]);
  }

  /* ---- per-EDW wave parameters and the five reference pressures -------- */
  function edwAt(d, xL) {
    var out = {};
    EDW.forEach(function (e) {
      var alpha = e.alpha(d);
      var w = waveH(alpha, d.L, d.fp, d);
      var Lref = w.Lref, H = w.H;
      var fnl = piecewise(e.fnl[d.bwe ? 'bwe' : 'normal'], xL);
      out[e.key] = {
        key: e.key, label: e.label, alpha: alpha, Lref: Lref, H: H, fnl: fnl, fbeta: e.fbeta,
        roll: !!e.roll, tallWave: !!e.tallWave,
        PCL: line(e.wea, 'CL', xL, d, H, fnl, e.fbeta),
        PBLwea: line(e.wea, 'BL', xL, d, H, fnl, e.fbeta),
        PWLwea: line(e.wea, 'WL', xL, d, H, fnl, e.fbeta),
        PBLlee: line(e.lee, 'BL', xL, d, H, fnl, e.fbeta),
        PWLlee: line(e.lee, 'WL', xL, d, H, fnl, e.fbeta)
      };
    });
    return out;
  }

  /* ---- Pex at a load point, all 24 cases · Ch 5 Sec 5 [1.1] and [1.3] -- */
  function solve(p, pt) {
    if (!ready()) throw new Error('coefficient tables have not been loaded');
    var d = derive(p);
    var x = n(pt.x), y = n(pt.y), z = n(pt.z), x0 = n(p.x0);
    var xL = Math.max(0, Math.min(1, (x - x0) / 1000 / d.L));
    var Bx = n(pt.Bx) > 0 ? n(pt.Bx) : d.B;
    var fyB = Bx === 0 ? 1 : Math.min(Math.abs(2 * y / Bx), 1);
    var fzT = Math.max(d.TLC > 0 ? z / d.TLC : 0, 0);
    var E = edwAt(d, xL);

    /* Static pressure — nothing above the waterline. */
    var Ps = z < d.TLC ? d.rho * d.g * (d.TLC - z) : 0;

    var cases = CASES.map(function (c) {
      var e = E[c.edw];
      /* Which side of the ship is the weather side is set by the load case, not
         by the point: a -P case has the wave coming onto the port side, a -S
         case onto starboard. With +y to portside, the point is on the weather
         side when its side matches the case's. */
      var weather = c.side === '-' ? true : (c.side === 'Port' ? y >= 0 : y <= 0);
      var PBL = weather ? e.PBLwea : e.PBLlee;
      var PWL = weather ? e.PWLwea : e.PWLlee;
      var PWLother = weather ? e.PWLlee : e.PWLwea;

      /* Interpolation between the centreline, bilge and waterline values —
         which two apply depends on whether the point is further out
         transversely (fyB) or further up (fzT). */
      var base = fyB >= fzT
        ? (1 - fyB) * e.PCL + (fyB - fzT) * PBL + fzT * PWL
        : (1 - fzT) * e.PCL + (fzT - fyB) * (0.5 * (PWL + PWLother)) + fyB * PWL;

      var sign = c.neg ? -1 : 1;
      /* The roll wave adds the transverse head from the roll angle. It sits
         OUTSIDE the wave sign and carries its own: the ship heels towards the
         weather side in case 1 and away from it in case 2. */
      var rollSign = (c.side === 'Port' ? 1 : -1) * (c.neg ? -1 : 1);
      var rollTerm = e.roll ? (-d.rho * d.g * y * rollSign * d.theta / 180 * PI) : 0;
      var rollAtWL = e.roll
        ? (-d.rho * d.g * (weather ? Bx / 2 : -Bx / 2) * rollSign * d.theta / 180 * PI) : 0;

      var Pw;
      if (z <= d.TLC) {
        Pw = sign * base + rollTerm;
      } else {
        /* Above the waterline the wave pressure decays linearly to zero, over
           a taller wave for the BP case. */
        var f = e.tallWave ? 1.33 : 1;
        var atWL = Math.max(sign * PWL + rollAtWL, 0);
        Pw = (z <= d.TLC + atWL / (d.rho * d.g) * f)
          ? Math.max(atWL - d.rho * d.g * (z - d.TLC) / f, 0) : 0;
      }
      var Pex = Math.max(Ps + Pw, d.PexFloor);
      return {
        name: c.name, edw: c.edw, side: c.side, weather: weather,
        H: e.H, fnl: e.fnl, fbeta: e.fbeta, Ps: Ps, Pw: Pw, Pex: Pex
      };
    });

    var maxPex = -Infinity, gov = null;
    cases.forEach(function (c) { if (c.Pex > maxPex) { maxPex = c.Pex; gov = c.name; } });
    return {
      d: d, xL: xL, fyB: fyB, fzT: fzT, Bx: Bx, edw: E,
      cases: cases, Ps: Ps, PexMax: maxPex, governing: gov
    };
  }

  return {
    setTables: setTables, ready: ready, derive: derive, edwAt: edwAt, solve: solve,
    waveH: waveH, navOf: navOf,
    EDW: EDW, CASES: CASES, NAV: NAV
  };
})();
