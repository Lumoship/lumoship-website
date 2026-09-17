/* LoadPoint - BV NR467 (July 2026) Pt B Ch 5 Sec 3 [1] wave parameter, Ch 5 Sec 5 [1] sea pressure.
   Ported from NR467Local/app/20-loads.js (same author, same rule) and re-checked line by line
   against Rules/DNV/_hesap/_metin/bv-nr467-2026/ptb-ch5-sec5.txt. Same output shape as the DNV
   module (calc.js) so the engine and the page do not care which class is selected.

   Ch 5 Sec 3 [1.1.1]  L_ref = min[alpha f_alpha L_c ; L (L_c/40)]
                       H = f_p A_0 [1 - A_1 (1 - sqrt(L/L_ref))^e1]  (L <= L_ref)
                       H = f_p A_0 [1 - A_2 (sqrt(L/L_ref) - 1)^e2]  (L >  L_ref)     Tab 1 per navigation notation
   Ch 5 Sec 3 [2.1.1]  T_theta = 2.3 pi k_r / sqrt(g GM); theta = 9000 (1.25 - 0.025 T_theta)/((B + 75) pi) f_fa f_BK
                       >= 1862/(B + 75) f_fa f_BK;  f_fa = f_ps max(n ; 0.5)
   Ch 5 Sec 2          T_R = T_theta sqrt(g/L) <= 75/sqrt(L)
   Ch 5 Sec 5 [1.3.3]  P_i = rho g f_nl f_beta H f_k,i,  f_k,i = k + k_T f_TL + k_CB C_B-LC + k_CW C_W-LC + k_B f_BL + k_R T_R
   Ch 5 Sec 5 [1.3.2]  P_EDW by f_yB / f_zT interpolation between CL, BL, WL (and P_M on the far side)
   Ch 5 Sec 5 Tab 2    sign per load case; BR adds P_SR = -rho g y C_YG theta pi/180
   Ch 5 Sec 5 [1.1.1]  P_ex = P_S + P_W >= 2.5 kN/m2 (prescriptive), >= 0 (direct)
   Above the waterline: P_W = P_W,WL - rho g (z - T_LC)/f_nl-g, zero beyond h_W = P_W,WL f_nl-g/(rho g); f_nl-g = 1.33 for BP */
(function (root) {
  'use strict';
  var TABLES = root.BV_EDW_TABLES || require('./edw-tables');
  var PI = Math.PI, g = 9.81, rho = 1.025;

  var NAV = {                                  /* Ch 5 Sec 3 Tab 1, strength assessment */
    unrestricted: { A0: 0.9, A1: 1.3, e1: 1.8, A2: 0.9, e2: 1.8, Lc: 552 },
    summer:       { A0: 0.78, A1: 1.3, e1: 1.8, A2: 0.9, e2: 1.8, Lc: 500 },
    tropical:     { A0: 0.61, A1: 1.48, e1: 2.01, A2: 0.43, e2: 1.74, Lc: 319 },
    coastal:      { A0: 0.61, A1: 1.48, e1: 2.01, A2: 0.43, e2: 1.74, Lc: 319 },
    sheltered:    { A0: 0.47, A1: 1.55, e1: 2.13, A2: 0.29, e2: 1.69, Lc: 244 }
  };
  var EDW = [                                  /* Ch 5 Sec 5 Tab 6 (alpha), Tab 7 / Tab 8 (f_nl), Ch 5 Sec 3 (f_beta) */
    { key: 'HVM', wea: 'Table 9 - HVM weather and lee sides', lee: 'Table 9 - HVM weather and lee sides', fbeta: 1, alpha: function (d) { return 0.65 * Math.pow(d.CW_LC, -1.3); }, fnl: { normal: [0.70, 0.90, 0.90, 0.60], bwe: [0.85, 0.95, 0.95, 0.80] } },
    { key: 'FVM', wea: 'Table 10 - FVM weather and lee sides', lee: 'Table 10 - FVM weather and lee sides', fbeta: 1, alpha: function (d) { return 0.65 * Math.pow(d.CW_LC, -1.3); }, fnl: { normal: [0.90, 0.90, 0.90, 0.90], bwe: [0.95, 0.95, 0.95, 0.95] } },
    { key: 'BR', wea: 'Table 11 - BR weather side', lee: 'Table 12 - BR lee side', fbeta: 0.8, roll: true, alpha: function (d) { return 4.6 * Math.pow(d.TR, -2); }, fnl: { normal: [1, 1, 1, 1], bwe: [1, 1, 1, 1] } },
    { key: 'BP', wea: 'Table 13 - BP weather side', lee: 'Table 14 - BP lee side', fbeta: 0.8, tallWave: true, alpha: function (d) { return 0.55 * Math.pow(d.fTL, -0.4); }, fnl: { normal: [0.60, 0.60, 0.60, 0.60], bwe: [0.60, 0.80, 0.80, 0.60] } },
    { key: 'OHM', wea: 'Table 15 - OHM weather side', lee: 'Table 16 - OHM lee side', fbeta: 1, alpha: function (d) { return 0.65 * Math.pow(d.fTL, -0.3); }, fnl: { normal: [0.80, 0.80, 0.80, 0.80], bwe: [0.90, 0.90, 0.90, 0.90] } },
    { key: 'OHS', wea: 'Table 17 - OHS weather side', lee: 'Table 18 - OHS lee side', fbeta: 1, alpha: function (d) { return 0.68 * Math.pow(d.fTL, -0.3); }, fnl: { normal: [0.80, 0.80, 0.80, 0.80], bwe: [0.90, 0.90, 0.90, 0.90] } },
    { key: 'OVA', wea: 'Table 19 - OVA weather side', lee: 'Table 20 - OVA lee side', fbeta: 1, alpha: function (d) { return 0.24 * Math.pow(d.fBL, -0.8); }, fnl: { normal: [0.50, 0.80, 0.80, 0.60], bwe: [0.75, 0.90, 0.90, 0.80] } }
  ];
  /* Ch 5 Sec 5 Tab 2: neg -> -P_EDW. side: which side is the weather side */
  var CASES = [
    { name: 'HVM1', edw: 'HVM', side: '-', neg: true }, { name: 'HVM2', edw: 'HVM', side: '-', neg: false },
    { name: 'FVM1', edw: 'FVM', side: '-', neg: true }, { name: 'FVM2', edw: 'FVM', side: '-', neg: false },
    { name: 'BR1-P', edw: 'BR', side: 'P', neg: true, CYG: -1 }, { name: 'BR2-P', edw: 'BR', side: 'P', neg: false, CYG: 1 },
    { name: 'BR1-S', edw: 'BR', side: 'S', neg: true, CYG: 1 }, { name: 'BR2-S', edw: 'BR', side: 'S', neg: false, CYG: -1 },
    { name: 'BP1-P', edw: 'BP', side: 'P', neg: true }, { name: 'BP2-P', edw: 'BP', side: 'P', neg: false },
    { name: 'BP1-S', edw: 'BP', side: 'S', neg: true }, { name: 'BP2-S', edw: 'BP', side: 'S', neg: false },
    { name: 'OHM1-P', edw: 'OHM', side: 'P', neg: false }, { name: 'OHM2-P', edw: 'OHM', side: 'P', neg: true },
    { name: 'OHM1-S', edw: 'OHM', side: 'S', neg: false }, { name: 'OHM2-S', edw: 'OHM', side: 'S', neg: true },
    { name: 'OHS1-P', edw: 'OHS', side: 'P', neg: false }, { name: 'OHS2-P', edw: 'OHS', side: 'P', neg: true },
    { name: 'OHS1-S', edw: 'OHS', side: 'S', neg: false }, { name: 'OHS2-S', edw: 'OHS', side: 'S', neg: true },
    { name: 'OVA1-P', edw: 'OVA', side: 'P', neg: true }, { name: 'OVA2-P', edw: 'OVA', side: 'P', neg: false },
    { name: 'OVA1-S', edw: 'OVA', side: 'S', neg: true }, { name: 'OVA2-S', edw: 'OVA', side: 'S', neg: false }
  ];

  function navOf(k) { return NAV[k] || NAV.unrestricted; }
  function waveH(alpha, L, fp, nv) {
    var Lref = Math.min(alpha * nv.Lc, L * nv.Lc / 40);
    var H = L <= Lref ? fp * nv.A0 * (1 - nv.A1 * Math.pow(1 - Math.sqrt(L / Lref), nv.e1))
                      : fp * nv.A0 * (1 - nv.A2 * Math.pow(Math.sqrt(L / Lref) - 1, nv.e2));
    return { Lref: Lref, H: H };
  }

  /* Ch 5 Sec 3 Tab 4 defaults: full load k_r 0.35 B, GM 0.12 B (tanker / bulk) or 0.07 B;
     normal ballast k_r 0.45 B, GM 0.33 B (tanker / bulk) or 0.18 B */
  function gmkr(ship, T_LC) {
    var B = ship.B, tk = !!ship.tanker, ballast = ship.T_BAL && Math.abs(T_LC - ship.T_BAL) < 1e-6 && T_LC < ship.T_SC;
    return { GM: ship.GM || (ballast ? (tk ? 0.33 : 0.18) : (tk ? 0.12 : 0.07)) * B, k_r: ship.k_r || (ballast ? 0.45 : 0.35) * B };
  }

  /* ship: {L, B, D, T_SC, T_BAL, C_B, C_W, C_B_BAL?, C_W_BAL?, GM?, k_r?, bilgeKeel, nav, tanker, prescriptive}
     opt: {T_LC, bwe} */
  function derive(ship, opt) {
    opt = opt || {};
    var L = ship.L, B = ship.B, T_SC = ship.T_SC, T_LC = opt.T_LC || T_SC;
    var nav = navOf(ship.nav);
    var ballast = ship.T_BAL && Math.abs(T_LC - ship.T_BAL) < 1e-6 && T_LC < T_SC;
    var d = {
      L: L, B: B, T_SC: T_SC, T_LC: T_LC, nav: nav, navKey: ship.nav || 'unrestricted',
      CB_LC: ballast ? (ship.C_B_BAL || ship.C_B) : ship.C_B, CW_LC: ballast ? (ship.C_W_BAL || ship.C_W) : ship.C_W,
      fTL: T_LC / L, fBL: B / L, fT: Math.min(Math.max(T_LC / T_SC, 0.5), 1),
      fBK: ship.bilgeKeel === false ? 1.2 : 1.0, fps: opt.bwe ? 0.8 : 1.0, bwe: !!opt.bwe,
      PexFloor: ship.prescriptive === false ? 0 : 2.5
    };
    d.fp = d.fps;
    var gk = gmkr(ship, T_LC); d.GM = gk.GM; d.kr = gk.k_r;
    d.Ttheta = 2.3 * PI * d.kr / Math.sqrt(g * d.GM);
    d.TR = Math.min(d.Ttheta * Math.sqrt(g / L), 75 / Math.sqrt(L));
    var alphaRoll = 4.6 * Math.pow(d.TR, -2), unr = NAV.unrestricted;
    var Hu = waveH(alphaRoll, L, d.fp, unr).H;
    d.nRoll = nav === unr ? 1 : (Hu !== 0 ? waveH(alphaRoll, L, d.fp, nav).H / Hu : 1);   /* Tab 2: n = H/H_unrestricted */
    d.ffa = d.fps * Math.max(d.nRoll, 0.5);
    d.theta = Math.max(9000 * (1.25 - 0.025 * d.Ttheta) / ((B + 75) * PI) * d.ffa * d.fBK, 1862 / (B + 75) * d.ffa * d.fBK);
    return d;
  }

  function interp(tableName, row, xL) {
    var t = TABLES[tableName]; if (!t) throw new Error('BV table missing: ' + tableName);
    var r = t[row]; if (!r) throw new Error('BV row missing: ' + tableName + ' / ' + row);
    var i = Math.min(Math.floor(xL / 0.1), 9), f = xL / 0.1 - i;
    return r[i] + f * (r[i + 1] - r[i]);
  }
  function line(tableName, pre, xL, d, H, fnl, fbeta) {
    var k = interp(tableName, pre + ' k', xL) + interp(tableName, pre + ' kT', xL) * d.fTL + interp(tableName, pre + ' kCB', xL) * d.CB_LC
      + interp(tableName, pre + ' kCW', xL) * d.CW_LC + interp(tableName, pre + ' kB', xL) * d.fBL + interp(tableName, pre + ' kR', xL) * d.TR;
    return rho * g * fnl * fbeta * H * k;
  }
  function piecewise(v, xL) {
    if (xL <= 0.3) return v[0] + xL / 0.3 * (v[1] - v[0]);
    if (xL <= 0.7) return v[1] + (xL - 0.3) / 0.4 * (v[2] - v[1]);
    return v[2] + (xL - 0.7) / 0.3 * (v[3] - v[2]);
  }
  function edwAt(d, xL) {
    var out = {};
    EDW.forEach(function (e) {
      var alpha = e.alpha(d), w = waveH(alpha, d.L, d.fp, d.nav);
      var fnl = piecewise(e.fnl[d.bwe ? 'bwe' : 'normal'], xL);
      out[e.key] = { key: e.key, alpha: alpha, Lref: w.Lref, H: w.H, fnl: fnl, fbeta: e.fbeta, roll: !!e.roll, tallWave: !!e.tallWave,
        PCL: line(e.wea, 'CL', xL, d, w.H, fnl, e.fbeta), PBLwea: line(e.wea, 'BL', xL, d, w.H, fnl, e.fbeta), PWLwea: line(e.wea, 'WL', xL, d, w.H, fnl, e.fbeta),
        PBLlee: line(e.lee, 'BL', xL, d, w.H, fnl, e.fbeta), PWLlee: line(e.lee, 'WL', xL, d, w.H, fnl, e.fbeta) };
    });
    return out;
  }

  /* pt: {x, y, z, B_x?} in m (x from the aft end of L). Returns the DNV-shaped result. */
  function seaPressure(ship, pt, opt) {
    var d = derive(ship, opt);
    var xL = Math.max(0, Math.min(1, pt.x / d.L));
    var Bx = pt.B_x || d.B, z = pt.z, y = pt.y;
    var fyB = Bx === 0 ? 1 : Math.min(Math.abs(2 * y / Bx), 1), fzT = Math.max(z / d.T_LC, 0);
    var E = edwAt(d, xL);
    var P_S = z < d.T_LC ? rho * g * (d.T_LC - z) : 0;
    var cases = CASES.map(function (c) {
      var e = E[c.edw];
      var weather = c.side === '-' ? true : (c.side === 'P' ? y >= 0 : y <= 0);
      var PBL = weather ? e.PBLwea : e.PBLlee, PWL = weather ? e.PWLwea : e.PWLlee, PWLo = weather ? e.PWLlee : e.PWLwea;
      var base = fyB >= fzT ? (1 - fyB) * e.PCL + (fyB - fzT) * PBL + fzT * PWL
                            : (1 - fzT) * e.PCL + (fzT - fyB) * 0.5 * (PWL + PWLo) + fyB * PWL;
      var sign = c.neg ? -1 : 1;
      var P_SR = e.roll ? -rho * g * y * c.CYG * d.theta * PI / 180 : 0;                    /* Tab 2 note */
      var P_SRwl = e.roll ? -rho * g * (weather ? Bx / 2 : -Bx / 2) * c.CYG * d.theta * PI / 180 : 0;
      var fg = e.tallWave ? 1.33 : 1;
      var P_WWL = Math.max(sign * PWL + P_SRwl, 0), h_W = P_WWL * fg / (rho * g);
      var P_W;
      if (z <= d.T_LC) P_W = sign * base + P_SR;
      else P_W = z <= d.T_LC + h_W ? Math.max(P_WWL - rho * g * (z - d.T_LC) / fg, 0) : 0;
      var P_ex = Math.max(P_S + P_W, d.PexFloor);
      return { name: c.name, P_W: P_W, P_ex: P_ex, P_WWL: P_WWL, h_W: h_W, k: { H: e.H, f_nl: e.fnl, f_beta: e.fbeta, weather: weather ? 1 : 0, P_EDW: base, P_SR: P_SR } };
    });
    var env = cases.reduce(function (b, r) { return r.P_W > b.P_W ? r : b; }, cases[0]);
    return { ctx: d, xL: xL, f_yB: fyB, f_zT: fzT, P_S: P_S, cases: cases, P_Wmax: env.P_W, governing: env.name,
             P_ex_S: P_S, P_ex_SD: Math.max(P_S + env.P_W, d.PexFloor) };
  }

  var api = { seaPressure: seaPressure, derive: derive, waveH: waveH, navOf: navOf, gmkr: gmkr, EDW: EDW, CASES: CASES, NAV: NAV, g: g, rho: rho };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BVSea = api;
})(typeof window !== 'undefined' ? window : this);
