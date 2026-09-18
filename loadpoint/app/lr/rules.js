/* LoadPoint - LR Rules and Regulations for the Classification of Ships (July 2026),
   local scantlings of a GENERAL CARGO SHIP (Pt 4 Ch 1) with the fore / aft end and
   erection rules of Pt 3. Head-based rules: the design load is a head in metres and the
   plating / stiffener requirement is the table formula for the position. Gross
   scantlings (no corrosion deduction in these rules). Pure functions.

   Pt 3 Ch 2 1.2.3    k = 235 / sigma_o >= 0.66; Tab 2.1.1 k_L
   Pt 3 Ch 3 Sec 2    Tab 3.2.1 taper of shell and strength deck plating to the ends
   Pt 3 Ch 3 Sec 3    attached plating 600 mm or 40 t_p, <= s (3.2.3)
   Pt 3 Ch 3 Sec 5    Tab 3.5.1 design heads h_1 (weather), h_2 (cargo), h_3 (accommodation),
                      superstructure decks 0.9 / 0.6 / 0.45, E factor, inner bottom 1.39 T
   Pt 3 Ch 4 5.7      F_D, F_B local reduction factors (inputs; >= 0.67 plating, 0.75 stiffeners)
   Pt 3 Ch 5 Sec 3-4  fore end shell plating Tab 5.3.1, framing Tab 5.4.1 / 5.4.2
   Pt 3 Ch 6 Sec 3-4  aft end shell plating Tab 6.3.1, framing Tab 6.4.1 / 6.4.2
   Pt 3 Ch 8 Sec 1-2  erections: h = alpha delta (beta lambda - gamma), t = 0.003 s sqrt(k h),
                      Z = 0.0035 h s l_s^2 k, deck plating Tab 8.2.2, deck beams 2.4.3
   Pt 4 Ch 1 Sec 4    decks: Tab 1.4.1 / 1.4.2 plating, 1.4.3 / 1.4.4 longitudinals, 1.4.5 beams
   Pt 4 Ch 1 Sec 5    shell: Tab 1.5.1 keel, 1.5.2 bottom / bilge, 1.5.3 side / sheerstrake
   Pt 4 Ch 1 Sec 6    shell framing: Tab 1.6.1 longitudinals, 1.6.3 transverse frames
   Pt 4 Ch 1 8.4      inner bottom plating
   Pt 4 Ch 1 Sec 9    Tab 1.9.1 watertight / deep tank bulkheads, Tab 1.9.3 end constraint

   ship: L, B, D, T, C_B, k_L, F_D, F_B, fbType 'B'|'B60', H_b (bow height, blank = D - T),
         rho, decks (number of decks for K_1), x_FP (= L when x is measured from AP)
   point: x from the aft end of L (A.P.), z above baseline (m) */
(function (root) {
  'use strict';
  var clamp = function (v, a, b) { return Math.min(Math.max(v, a), b); };
  var lerp = function (x0, y0, x1, y1, x) { return x <= x0 ? y0 : (x >= x1 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0)); };

  var MATERIALS = { 'MS (A/B/D/E)': 235, 'HT32 (AH32..)': 315, 'HT36 (AH36..)': 355, 'HT40 (AH40..)': 390 };
  function kFactor(sigma_o) { return Math.max(235 / sigma_o, 0.66); }                          /* Pt 3 Ch 2 1.2.3 */
  function kL(sigma_o) {                                                                      /* Tab 2.1.1, linear between */
    var n = [235, 265, 315, 355, 390], k = [1.0, 0.92, 0.78, 0.72, 0.68];
    if (sigma_o <= 235) return 1.0;
    for (var i = 0; i < 4; i++) if (sigma_o <= n[i + 1]) return k[i] + (k[i + 1] - k[i]) * (sigma_o - n[i]) / (n[i + 1] - n[i]);
    return 0.68;
  }

  /* ---- ship-level parameters ---- */
  function params(ship) {
    var L = ship.L, Lc = Math.min(L, 227);
    var C_w = 7.71e-2 * Lc * Math.exp(-0.0044 * Lc);
    if (L > 227) C_w = Math.max(C_w, 6.446);
    var F_D = ship.F_D === undefined || ship.F_D === null || ship.F_D === '' ? 1.0 : +ship.F_D;
    var F_B = ship.F_B === undefined || ship.F_B === null || ship.F_B === '' ? 1.0 : +ship.F_B;
    return {
      L: L, L_1: Math.min(L, 190), L_2: Math.min(L, 215), L_3: Math.min(L, 300), L_8: clamp(L, 50, 250),
      C_w: C_w, F_lambda: L <= 200 ? 1.0 : 1 + 0.0023 * (L - 200),
      k_L: ship.k_L || 1.0, F_D: F_D, F_B: F_B,
      F_Dp: Math.max(F_D, 0.67), F_Bp: Math.max(F_B, 0.67), F_Ds: Math.max(F_D, 0.75), F_Bs: Math.max(F_B, 0.75),
      E: clamp((0.0914 + 0.003 * L) / (ship.D - ship.T) - 0.15, 0, 0.147),                    /* Ch 3 Sec 5 */
      D_2: Math.min(ship.D, 1.6 * ship.T), D_1mid: clamp(Math.min(ship.D, 1.6 * ship.T), 10, 16),
      H_b: ship.H_b || (ship.D - ship.T), rho: Math.max(ship.rho || 1.025, 1.025),
      s_bMid: Math.min(470 + L / 0.6, 700)
    };
  }
  /* longitudinal region of a point: x from A.P. */
  function region(ship, x) {
    var L = ship.L, dF = L - x, dA = x;
    if (x >= 0.3 * L && x <= 0.7 * L) return { key: 'mid', name: 'midship region (0.4 L amidships)', dF: dF, dA: dA, d: 0 };
    /* d: distance from 0.2 L forward / aft of amidships to the point (Tab 3.2.1 taper) */
    if (x > 0.7 * L) return { key: dF < 0.075 * L ? 'fwd1' : (dF < 0.2 * L ? 'fwd2' : (dF < 0.25 * L ? 'fwd3' : 'fwdT')), name: 'fore end, ' + (dF / L).toFixed(3) + ' L from F.P.', dF: dF, dA: dA, d: x - 0.7 * L, fwd: true };
    return { key: dA < 0.075 * L ? 'aft1' : (dA < 0.15 * L ? 'aft2' : 'aftT'), name: 'aft end, ' + (dA / L).toFixed(3) + ' L from A.P.', dF: dF, dA: dA, d: 0.3 * L - x, aft: true };
  }
  /* standard frame spacing s_b at the ends (Tab 5.3.1 / 6.3.1) */
  function sB(ship, r, side) {
    var L = ship.L;
    if (r.fwd) { if (r.dF < 0.05 * L) return Math.min(470 + L / 0.6, 600); if (r.dF < 0.2 * L) return Math.min(470 + L / 0.6, 700); return 510 + Math.min(L, 215) / 0.6; }
    if (r.aft) { if (r.dA < 0.05 * L) return Math.min(470 + L / 0.6, side === 'sideUpper' ? 700 : 600); return Math.min(510 + L / 0.6, 850); }
    return Math.min(470 + L / 0.6, 700);
  }
  function f2(ship) { return Math.min(Math.pow(15 / Math.min(ship.L / ship.T, 25), 0.2), 1.0); }     /* Tab 5.3.1 */

  /* ---- design heads (Pt 3 Ch 3 Tab 3.5.1 and the shell heads of Pt 4 Ch 1) ---- */
  /* weather deck head h_1 (general cargo, minimum scantlings or specified p_a) */
  function weatherHead(ship, x, member, p_a) {
    var p = params(ship), dF = ship.L - x, L = ship.L;
    var pri = member === 'primary', h, p_kN, row;
    if (dF < 0.075 * L) { h = pri ? 4.2 + 2.04 * p.E : 1.8; p_kN = pri ? 29.64 + 14.41 * p.E : 12.73; row = 'forward of 0.075 L from F.P.'; if (p_a) { var hs = pri ? 0.5 * p_a + 2.04 * p.E : 0.35 * p_a + 2.04 * p.E; if (hs > h) { h = hs; p_kN = pri ? 3.5 * p_a + 14.41 * p.E : 2.47 * p_a + 14.41 * p.E; row += ', specified cargo p_a'; } } }
    else if (dF < 0.12 * L) { h = pri ? 3.2 + 2.04 * p.E : 1.5; p_kN = pri ? 22.59 + 14.41 * p.E : 10.61; row = 'between 0.12 L and 0.075 L from F.P.'; if (p_a) { var hs2 = pri ? 0.38 * p_a + 2.04 * p.E : 0.28 * p_a + 2.04 * p.E; if (hs2 > h) { h = hs2; p_kN = pri ? 2.67 * p_a + 14.41 * p.E : 1.98 * p_a + 14.41 * p.E; row += ', specified cargo p_a'; } } }
    else { h = 1.2 + 2.04 * p.E; p_kN = 8.5 + 14.41 * p.E; row = 'aft of 0.12 L from F.P.'; if (p_a) { var hs3 = 0.14 * p_a + 2.04 * p.E; if (hs3 > h) { h = hs3; p_kN = p_a + 14.41 * p.E; row += ', specified cargo p_a'; } } }
    return { h_1: h, p: p_kN, E: p.E, row: row };
  }
  /* cargo deck head h_2 (standard 1.39 m3/t): H_td tween-deck cargo height; special cargo p_a with stowage C */
  function cargoHead(H_td, p_a, C) { return p_a ? { h_2: (C || 1.39) * p_a / 9.82, p: p_a, row: 'specified cargo loading' } : { h_2: H_td, p: 7.07 * H_td, row: 'general cargo, standard stowage 1.39' }; }
  /* superstructure deck head h_3 by tier (Tab 3.5.1); exposed decks add 2.04 E */
  function tierHead(ship, tier, exposed) { var h = tier <= 1 ? 0.9 : (tier === 2 ? 0.6 : 0.45); return { h_3: h + (exposed ? 2.04 * params(ship).E : 0), row: 'superstructure deck tier ' + tier + (exposed ? ' exposed (+ 2.04 E)' : '') }; }
  /* erection bulkhead head, Pt 3 Ch 8 1.4: h = alpha delta (beta lambda - gamma) >= minimum */
  function erectionHead(ship, opt) {
    var p = params(ship), L = ship.L, X = opt.X === undefined ? opt.x : opt.X, tier = opt.tier || 1;
    var face = opt.face || 'front';                       /* 'front' | 'frontProtected' | 'side' | 'aft' */
    var alpha = face === 'front' ? (tier <= 1 ? 2.0 + 0.0083 * p.L_3 : (tier === 2 ? 1.0 + 0.0083 * p.L_3 : 0.5 + 0.0067 * p.L_3))
              : face === 'aft' ? (X / L <= 0.5 ? 0.7 + 0.001 * p.L_3 - 0.8 * X / L : 0.5 + 0.001 * p.L_3 - 0.4 * X / L)
              : 0.5 + 0.0067 * p.L_3;
    var Cb = clamp(ship.C_B, 0.6, 0.8); if (face === 'aft' && X / L > 0.5) Cb = Math.max(Cb, 0.8);
    var xr = X / L, beta = xr <= 0.45 ? 1 + Math.pow((xr - 0.45) / (Cb + 0.2), 2) : 1 + 1.5 * Math.pow((xr - 0.45) / (Cb + 0.2), 2);
    var lambda = L >= 300 ? 11.03 : (L <= 150 ? (L / 10) * Math.exp(-L / 300) - (1 - Math.pow(L / 150, 2)) : (L / 10) * Math.exp(-L / 300));
    var delta = opt.casing ? 1.0 : Math.max(0.3 + 0.7 * (opt.b || ship.B) / (opt.B_1 || ship.B), 0.475);
    var gamma = opt.gamma !== undefined ? opt.gamma : (opt.z - ship.T);
    var h = alpha * delta * (beta * lambda - gamma);
    var hmin = (face === 'front' && tier <= 1) ? 2.5 + 0.01 * p.L_8 : 1.25 + 0.005 * p.L_8;
    return { h: Math.max(h, hmin), h_calc: h, h_min: hmin, alpha: alpha, beta: beta, lambda: lambda, delta: delta, gamma: gamma, row: face + ' tier ' + tier };
  }
  /* side shell heads for longitudinals / frames: h_6 from the waterline to the point (positive above),
     h_5 from the point to the deck at depth D_2. Tab 1.6.1 (with the type B / B-60 floor) or Tab 1.6.3 / 5.4.x / 6.4.x (0.7 floor) */
  function sideHead(ship, z, opt) {
    var p = params(ship), T = ship.T, D2 = opt.D_1 || p.D_2, f_w = opt.f_w || 1.0, T1 = opt.T_1 || T;
    var h6 = z - T1, h;
    if (h6 >= 0) {
      var fac = f_w * (1 - h6 / (D2 - T1));
      if (opt.floor === 'B60') fac = Math.max(fac, p.L_1 / 56 / p.C_w); else if (opt.floor === 'B') fac = Math.max(fac, Math.max(p.L_1 / 70, 1.2) / p.C_w); else fac = Math.max(fac, 0.7);
      h = p.C_w * fac * p.F_lambda;
    } else h = (-h6 + f_w * p.C_w * (1 + h6 / (2 * T1))) * p.F_lambda;   /* h_6 below WL: h_6 + C_w (1 - h_6/(2T)) with |h_6| */
    return { h_T1: h, h_6: h6, above: h6 >= 0 };
  }

  /* ---- plating: returns [{row, formula, t}] with the governing marked ---- */
  function shellPlating(ship, pt, pos, opt) {
    var p = params(ship), r = region(ship, pt.x), L = ship.L, k = opt.k, s = opt.s, S = opt.S || 2.5, out = [];
    var s1 = Math.max(s, p.s_bMid), f1 = 1 / (1 + Math.pow(s / (1000 * S), 2)), longit = opt.framing !== 'trv';
    var hT1 = Math.min(ship.T + p.C_w, 1.36 * ship.T), hT2 = Math.min(ship.T + 0.5 * p.C_w, 1.2 * ship.T);
    var bottom = /^(keel|bottom|bilge)$/.test(pos), sheer = pos === 'sheerstrake';
    var add = function (row, formula, t) { out.push({ row: row, formula: formula, t: t }); };
    if (r.key === 'mid') {
      if (bottom) {
        if (longit) { add('Tab 1.5.2 (1)(a) longitudinal', 't = 0.001 s_1 (0.043 L_1 + 10) √(F_B / k_L)', 0.001 * s1 * (0.043 * p.L_1 + 10) * Math.sqrt(p.F_Bp / p.k_L)); add('Tab 1.5.2 (1)(b)', 't = 0.0052 s_1 √(h_T2 k / (1.8 − F_B))', 0.0052 * s1 * Math.sqrt(hT2 * k / (1.8 - p.F_Bp))); }
        else { add('Tab 1.5.2 (1)(a) transverse', 't = 0.001 s_1 f_1 (0.056 L_1 + 16.7) √(F_B / k_L)', 0.001 * s1 * f1 * (0.056 * p.L_1 + 16.7) * Math.sqrt(p.F_Bp / p.k_L)); add('Tab 1.5.2 (1)(b)', 't = 0.0063 s_1 √(h_T2 k / (1.8 − F_B))', 0.0063 * s1 * Math.sqrt(hT2 * k / (1.8 - p.F_Bp))); }
        if (pos === 'keel') { var tk = Math.max.apply(null, out.map(function (o) { return o.t; })) + 2; add('Tab 1.5.1 plate keel', 't = t_1 + 2, b = 70 B = ' + (70 * ship.B).toFixed(0) + ' mm (750..1800)', tk); }
      } else if (sheer) {
        if (longit) { add('Tab 1.5.3 (2)(i) sheerstrake', 't = 0.001 s_1 (0.059 L_1 + 7) √(F_D / k_L)', 0.001 * s1 * (0.059 * p.L_1 + 7) * Math.sqrt(p.F_Dp / p.k_L)); add('Tab 1.5.3 (2)(ii)', 't = 0.00083 s_1 √(L k) + 2.5', 0.00083 * s1 * Math.sqrt(L * k) + 2.5); }
        else { add('Tab 1.5.3 (2)(i) sheerstrake, transverse', 't = 0.001 s_1 f_1 (0.083 L_1 + 10) √(F_D / k_L)', 0.001 * s1 * f1 * (0.083 * p.L_1 + 10) * Math.sqrt(p.F_Dp / p.k_L)); add('Tab 1.5.3 (2)(ii)', 't = 0.001 s_1 √(L k) + 2.5', 0.001 * s1 * Math.sqrt(L * k) + 2.5); }
      } else {
        var D = ship.D, z = pt.z, zb = opt.z_bilge || 0;                        /* z_bilge: upper turn of bilge */
        if (longit) {
          var tA1 = 0.001 * s1 * (0.059 * p.L_1 + 7) * Math.sqrt(p.F_Dp / p.k_L), tA2 = 0.0042 * s1 * Math.sqrt(hT1 * k);
          var tB1 = 0.001 * s1 * (0.059 * p.L_1 + 7) * Math.sqrt(p.F_Bp / p.k_L), tB2 = 0.0054 * s1 * Math.sqrt(hT2 * k / (2 - p.F_Bp));
          if (z >= D / 2) { add('Tab 1.5.3 (1)(a)(i) above D/2, longitudinal', 't = 0.001 s_1 (0.059 L_1 + 7) √(F_D / k_L)', tA1); add('Tab 1.5.3 (1)(a)(ii)', 't = 0.0042 s_1 √(h_T1 k)', tA2); }
          else if (z <= zb) { add('Tab 1.5.3 (1)(b)(i) at upper turn of bilge', 't = 0.001 s_1 (0.059 L_1 + 7) √(F_B / k_L)', tB1); add('Tab 1.5.3 (1)(b)(ii)', 't = 0.0054 s_1 √(h_T2 k / (2 − F_B))', tB2); }
          else { add('Tab 1.5.3 (1)(c)(i) between bilge and D/2', 't from (b)(i)', tB1); add('Tab 1.5.3 (1)(c)(ii)', 'interpolation between (a)(ii) and (b)(ii)', lerp(zb, tB2, D / 2, tA2, z)); }
        } else {
          var FM = Math.max(p.F_Dp, p.F_Bp);
          if (z >= 0.75 * D) { add('Tab 1.5.3 (1)(a)(i) within D/4 from gunwale, transverse', 't = 0.00085 s_1 f_1 (0.083 L_1 + 10) √(F_D / k_L)', 0.00085 * s1 * f1 * (0.083 * p.L_1 + 10) * Math.sqrt(p.F_Dp / p.k_L)); add('Tab 1.5.3 (1)(a)(ii)', 't = 0.0042 s_1 √(h_T1 k)', 0.0042 * s1 * Math.sqrt(hT1 * k)); }
          else if (z >= 0.25 * D) { add('Tab 1.5.3 (1)(b)(i) within D/4 from mid-depth', 't = 0.001 s_1 (0.059 L_1 + 7) √(F_M / k_L)', 0.001 * s1 * (0.059 * p.L_1 + 7) * Math.sqrt(FM / p.k_L)); add('Tab 1.5.3 (1)(b)(ii)', 't = 0.0051 s_1 √(h_T1 k)', 0.0051 * s1 * Math.sqrt(hT1 * k)); }
          else { add('Tab 1.5.3 (1)(c)(i) within D/4 from base', 't = 0.00085 s_1 f_1 (0.083 L_1 + 10) √(F_B / k_L)', 0.00085 * s1 * f1 * (0.083 * p.L_1 + 10) * Math.sqrt(p.F_Bp / p.k_L)); add('Tab 1.5.3 (1)(c)(ii)', 't = 0.0056 s_1 √(h_T2 k / (1.8 − F_B))', 0.0056 * s1 * Math.sqrt(hT2 * k / (1.8 - p.F_Bp))); }
        }
      }
    } else {
      /* ends: Tab 5.3.1 / 6.3.1 and the taper of Tab 3.2.1 */
      var sb = sB(ship, r, !bottom && pt.z > ship.T ? 'sideUpper' : 'lower'), s1e = Math.max(s, sb), fx = f2(ship);
      var tEnd = (6.5 + 0.033 * L) * fx * Math.sqrt(k * s1e / sb), tE1 = (6.5 + 0.033 * L) * fx * Math.sqrt(k);
      var tap = opt.t_c ? (opt.t_c - tE1) * (1 - r.d / (0.225 * L)) + tE1 : null;
      var tab = r.fwd ? 'Tab 5.3.1' : 'Tab 6.3.1', near = r.fwd ? r.dF < 0.075 * L : r.dA < 0.075 * L, midB = r.fwd ? (bottom ? r.dF < 0.25 * L : r.dF < 0.2 * L) : r.dA < 0.15 * L;
      if (sheer && ship.T / ship.D <= 0.7) tEnd = (r.fwd ? (7.0 + 0.02 * L) : (6.5 + 0.017 * L)) * fx * Math.sqrt(k * s1e / sb);
      if (near) add(tab + (sheer ? ' (3)(a) sheerstrake' : bottom ? ' (1)(a) bottom' : ' (2)(a) side') + (sheer && ship.T / ship.D <= 0.7 ? ' as forecastle / poop' : ''), 't = (6.5 + 0.033 L) f_2 √(k s_1 / s_b)' + (L <= 70 ? ' (L ≤ 70: may be reduced 1 mm, ≥ 6)' : ''), tEnd);
      else if (midB) { add(tab + ' (b) as (a)', 't = (6.5 + 0.033 L) f_2 √(k s_1 / s_b)', tEnd); if (tap !== null) add('Tab 3.2.1 taper', 't_1 = (t_c − t_e1)(1 − d/(0.225 L)) + t_e1', tap); }
      else { if (tap !== null) add('Tab 3.2.1 taper', 't_1 = (t_c − t_e1)(1 − d/(0.225 L)) + t_e1', tap); add('Tab 3.2.1 (b) basic end thickness', 't_1 = (6.5 + 0.033 L) f_2 √(k s_1 / s_b)', tEnd); }
    }
    return finish(out, { region: r, s_1: s1, f_1: f1, h_T1: hT1, h_T2: hT2 });
  }
  function deckPlating(ship, pt, pos, opt) {
    var p = params(ship), r = region(ship, pt.x), L = ship.L, k = opt.k, s = opt.s, S = opt.S || 2.5, out = [];
    var s1 = Math.max(s, p.s_bMid), f1 = 1 / (1 + Math.pow(s / (1000 * S), 2)), f = Math.min(1.1 - s / (2500 * S), 1.0), longit = opt.framing !== 'trv';
    var add = function (row, formula, t) { out.push({ row: row, formula: formula, t: t }); };
    var strength = /^(strengthDeck|weatherDeck)$/.test(pos);
    if (strength) {
      if (r.key === 'mid') {
        if (opt.insideOpenings) add('Tab 1.4.1 (2) inside line of openings', longit ? 't = 0.00083 s_1 √(L k) + 2.5 ≥ 6.5' : 't = 0.00083 s_1 √(L k) + 1.5 ≥ 6.5', Math.max(0.00083 * s1 * Math.sqrt(L * k) + (longit ? 2.5 : 1.5), 6.5));
        else if (longit) { add('Tab 1.4.1 (1)(a) longitudinal', 't = 0.001 s_1 (0.059 L_1 + 7) √(F_D / k_L)', 0.001 * s1 * (0.059 * p.L_1 + 7) * Math.sqrt(p.F_Dp / p.k_L)); add('Tab 1.4.1 (1)(b)', 't = 0.00083 s_1 √(L k) + 2.5', 0.00083 * s1 * Math.sqrt(L * k) + 2.5); }
        else { add('Tab 1.4.1 (1)(a) transverse', 't = 0.001 s_1 f_1 (0.083 L_1 + 10) √(F_D / k_L)', 0.001 * s1 * f1 * (0.083 * p.L_1 + 10) * Math.sqrt(p.F_Dp / p.k_L)); add('Tab 1.4.1 (1)(b)', 't = 0.001 s_1 √(L k) + 2.5', 0.001 * s1 * Math.sqrt(L * k) + 2.5); }
      } else {
        var sb = sB(ship, r, 'sideUpper'), s1e = Math.max(s, sb), tE2 = (5.5 + 0.02 * L) * Math.sqrt(k);
        if (opt.t_c) add('Tab 3.2.1 (2)(a) taper', 't_1 = (t_c − t_e2)(1 − d/(0.225 L)) + t_e2', (opt.t_c - tE2) * (1 - r.d / (0.225 * L)) + tE2);
        add('Tab 3.2.1 (2)(b) basic deck end thickness', 't_1 = (5.5 + 0.02 L) √(k s_1 / s_b)', (5.5 + 0.02 * L) * Math.sqrt(k * s1e / sb));
      }
      if (opt.h_4) add('Tab 1.4.1 (3) crown of a tank', 't = 0.004 s f √(ρ k h_4 / 1.025) + 3.5 ≥ ' + (L >= 90 ? 7.5 : 6.5), Math.max(0.004 * s * f * Math.sqrt(p.rho * k * opt.h_4 / 1.025) + 3.5, L >= 90 ? 7.5 : 6.5));
    } else if (pos === 'ssDeck' || pos === 'coachroof') {
      var tier = opt.tier || 1, sb8 = erectionSb(ship, pt.x);
      var c = tier <= 1 ? [5.5, 7.5] : (tier === 2 ? [5.0, 7.0] : [4.5, 6.5]);
      add('Tab 8.2.2 top of tier ' + tier + ' erection', L <= 100 ? 't = (' + c[0] + ' + 0.02 L) √(k s / s_b)' : 't = ' + c[1] + ' √(k s / s_b)', Math.max(L <= 100 ? (c[0] + 0.02 * L) * Math.sqrt(k * s / sb8) : c[1] * Math.sqrt(k * s / sb8), tier >= 3 ? 5.0 : 0));
    } else {
      var third = opt.deckLevel === 'third';
      if (opt.insideOpenings || third) add('Tab 1.4.2 ' + (third ? 'third / platform deck' : '(2) inside line of openings'), 't = 0.01 s_1 √k ≥ 6.5', Math.max(0.01 * s1 * Math.sqrt(k), 6.5));
      else add('Tab 1.4.2 (1) second deck, outside line of openings', 't = 0.012 s_1 √k ≥ 6.5', Math.max(0.012 * s1 * Math.sqrt(k), 6.5));
      if (opt.h_4) { var K1 = opt.tankBottom ? 2.5 : 3.5; add('Tab 1.4.2 (3) ' + (opt.tankBottom ? 'bottom' : 'crown') + ' of a tank', 't = 0.004 s f √(ρ k h_4 / 1.025) + K_1 ≥ ' + (L >= 90 ? 7.5 : 6.5), Math.max(0.004 * s * f * Math.sqrt(p.rho * k * opt.h_4 / 1.025) + K1, L >= 90 ? 7.5 : 6.5)); }
    }
    return finish(out, { region: r, s_1: s1, f_1: f1, f: f });
  }
  function erectionSb(ship, x) { var L = ship.L, p = params(ship); var sb = (x < 0.05 * L || x > 0.95 * L) ? Math.min(610, 470 + 1.67 * p.L_8) : 470 + 1.67 * p.L_8; if (L - x < 0.2 * L) sb = Math.min(sb, 700); return sb; }
  function innerBottomPlating(ship, opt) {
    var L = ship.L, k = opt.k, s = opt.s, out = [];
    out.push({ row: 'Pt 4 Ch 1 8.4.1 inner bottom in holds', formula: 't = 0.00136 (s + 660) ⁴√(k² L T) ≥ 6.5 (7.5 under hatchways without ceiling, + 2 mm)', t: Math.max(0.00136 * (s + 660) * Math.pow(k * k * L * ship.T, 0.25) + (opt.underHatch ? 2 : 0), opt.underHatch ? 7.5 : 6.5) });
    if (opt.h_4) { var p = params(ship), f = Math.min(1.1 - s / (2500 * (opt.S || 2.5)), 1.0); out.push({ row: '8.4.4 double bottom common with side tanks: deep tank plating (K_1 elsewhere = 3.5)', formula: 't = 0.004 s f √(ρ h_4 k / 1.025) + 3.5', t: 0.004 * s * f * Math.sqrt(p.rho * opt.h_4 * k / 1.025) + 3.5 }); }
    return finish(out, {});
  }
  function bulkheadPlating(ship, opt) {
    var p = params(ship), k = opt.k, s = opt.s, S = opt.S || 2.5, f = Math.min(1.1 - s / (2500 * S), 1.0), out = [], h4 = opt.h_4 || 0;
    if (opt.deepTank) out.push({ row: 'Tab 1.9.1 (1) deep tank bulkhead', formula: 't = 0.004 s f √(ρ h_4 k / 1.025) + 2.5 ≥ ' + (ship.L < 90 ? 6.5 : 7.5), t: Math.max(0.004 * s * f * Math.sqrt(p.rho * h4 * k / 1.025) + 2.5, ship.L < 90 ? 6.5 : 7.5) });
    else out.push({ row: 'Tab 1.9.1 (1) watertight bulkhead', formula: 't = 0.004 s f √(h_4 k) ≥ 5.5', t: Math.max(0.004 * s * f * Math.sqrt(h4 * k), 5.5) });
    return finish(out, { f: f });
  }
  function erectionPlating(ship, pt, pos, opt) {
    var p = params(ship), k = opt.k, s = opt.s, out = [], L = ship.L;
    var eh = erectionHead(ship, { x: pt.x, X: opt.X, z: pt.z, tier: opt.tier, face: pos === 'dhFront1' ? 'front' : pos === 'dhFrontUp' ? 'front' : pos === 'dhOther' ? (opt.face || 'aft') : 'side', b: opt.b, casing: opt.casing });
    out.push({ row: 'Pt 3 Ch 8 2.1.1 erection plating, h = ' + eh.h.toFixed(2) + ' m', formula: 't = 0.003 s √(k h)', t: 0.003 * s * Math.sqrt(k * eh.h) });
    var tier = opt.tier || 1;
    if (p.L_3 >= 65) out.push({ row: '2.1.1 minimum, ' + (tier <= 1 ? 'lowest tier' : 'upper tiers'), formula: (tier <= 1 ? 't = (5.0 + 0.01 L_3) √k' : 't = (4.0 + 0.01 L_3) √k') + ' ≥ 5.0', t: Math.max((tier <= 1 ? 5.0 : 4.0) + 0.01 * p.L_3, 5.0) * Math.sqrt(k) });
    else out.push({ row: '2.1.1 minimum, L_3 < 65 m', formula: tier <= 1 && pos === 'dhFront1' ? 't = 5 mm' : 't = 4 mm', t: tier <= 1 && pos === 'dhFront1' ? 5 : 4 });
    return finish(out, { head: eh });
  }
  function finish(out, extra) {
    var best = out.reduce(function (b, o) { return !b || o.t > b.t ? o : b; }, null);
    out.forEach(function (o) { o.best = o === best; });
    extra.rows = out; extra.t = best ? best.t : 0; extra.governing = best ? best.row : '-';
    return extra;
  }

  /* ---- stiffeners: Z (cm3) and I (cm4) with the table row ---- */
  /* Tab 1.6.1 factors for a longitudinal at height z */
  function longitudinalFactors(ship, z, opt) {
    var p = params(ship), D2 = p.D_2, k = opt.k;
    var c1 = z >= D2 / 2 ? lerp(D2 / 2, 1.0, D2, 60 / (225 - 165 * p.F_Ds), z) : lerp(0, 75 / (225 - 150 * p.F_Bs), D2 / 2, 1.0, z);
    var h5 = Math.max(D2 - z, 0);
    var F1 = Math.max(z >= D2 / 2 ? D2 * c1 / (4 * D2 + 20 * h5) : D2 * c1 / (25 * D2 - 20 * h5), 0.14);
    var ratio = opt.profType === 'FB' || opt.profType === 'HP' ? 0.5 : (opt.bf1_bf || 0.5);
    var Fs06 = (1.1 / k) * (1 - 2 * ratio * (1 - k)), Fsb = 0.5 * (1 + Fs06);
    var Fs = z >= D2 ? 1.0 : (z >= 0.6 * D2 ? lerp(0.6 * D2, Fs06, D2, 1.0, z) : lerp(0, Fsb, 0.6 * D2, Fs06, z));
    return { c_1: c1, F_1: F1, h_5: h5, F_s: Fs, F_sb: Fsb, D_2: D2 };
  }
  function shellStiffener(ship, pt, pos, opt) {
    var p = params(ship), r = region(ship, pt.x), k = opt.k, s = opt.s, le = Math.max(opt.l_e, 1.5), out = [], T = ship.T, L = ship.L;
    var bottom = /^(keel|bottom|bilge)$/.test(pos), longit = opt.framing !== 'trv';
    var add = function (row, formula, Z, I) { out.push({ row: row, formula: formula, Z: Z, I: I }); };
    if (longit) {
      var le1 = clamp(le, 2.5, 5.0), gam = 0.002 * le1 + 0.046, lf = longitudinalFactors(ship, pt.z, opt);
      if (r.key === 'mid' || (r.fwd && r.dF >= 0.2 * L) || (r.aft && r.dA >= 0.2 * L) || bottom) {
        if (bottom) {
          var hT2 = Math.min(T + 0.5 * p.C_w, 1.2 * T), lf0 = longitudinalFactors(ship, 0, opt);
          add('Tab 1.6.1 (3)(a) bottom / bilge longitudinal', 'Z = γ s k h_T2 l_e² F_1', gam * s * k * hT2 * le * le * lf0.F_1);
          if (opt.h_4) add('Tab 1.6.1 (3)(b) with tank head', 'Z = γ s k h_T3 l_e² F_1 F_sb, h_T3 = h_4 − 0.25 T', gam * s * k * Math.max(opt.h_4 - 0.25 * T, 0) * le * le * lf0.F_1 * lf0.F_sb);
        } else {
          var sh = sideHead(ship, pt.z, { floor: ship.fbType === 'B60' ? 'B60' : 'B' });
          var cap = lf.F_1 <= 0.14 ? 0.86 * (lf.h_5 + p.D_1mid / 8) : lf.h_5 + p.D_1mid / 8;
          var hT1 = Math.min(sh.h_T1, cap);
          var Z1 = 0.056 * s * k * hT1 * le * le * lf.F_1 * lf.F_s;
          var hT2b = Math.min(T + 0.5 * p.C_w, 1.2 * T), lf0b = longitudinalFactors(ship, 0, opt), Z3 = gam * s * k * hT2b * le * le * lf0b.F_1;
          add('Tab 1.6.1 (1)(a) side longitudinal, dry space', 'Z = 0.056 s k h_T1 l_e² F_1 F_s (h_T1 ' + hT1.toFixed(2) + ' m, F_1 ' + lf.F_1.toFixed(3) + ', F_s ' + lf.F_s.toFixed(3) + ')', Math.min(Z1, Z3));
          if (Z3 < Z1) out[out.length - 1].formula += ' - limited by (1)(b): (3)(a) at the base line = ' + Z3.toFixed(1);
          if (opt.h_4) add('Tab 1.6.1 (2)(b) deep tank: Tab 1.9.1 (2)', 'Z = ρ s k h_4 l_e² / (22 γ (ω_1 + ω_2 + 2))', p.rho * s * k * opt.h_4 * le * le / (22 * (opt.profType === 'FB' ? 1.6 : 1.4) * ((opt.w1 || 1) + (opt.w2 || 1) + 2)));
        }
      } else {
        /* ends: Tab 5.4.1 / 6.4.1 */
        var D1e = r.fwd ? T + p.H_b : Math.min(ship.D, T + p.H_b), T1 = Math.max(T, 0.65 * D1e);
        var fw = r.fwd ? lerp(0.15 * L, 1.71, 0.2 * L, 1.0, r.dF) : (opt.aftPeak ? 1.32 : lerp(0, 1.32, 0.2 * L, 1.0, r.dA));   /* aft: 1.32 at the peak bulkhead - taken at the A.P. when its position is not given */
        var she = sideHead(ship, pt.z, { D_1: D1e, T_1: T1, f_w: fw });
        var ratio = opt.profType === 'FB' || opt.profType === 'HP' ? 0.5 : (opt.bf1_bf || 0.5);
        var Fs06 = (1.1 / k) * (1 - 2 * ratio * (1 - k)), Fsb = 0.5 * (1 + Fs06);
        var Fs = pt.z >= D1e ? 1.0 : (pt.z >= 0.6 * D1e ? lerp(0.6 * D1e, Fs06, D1e, 1.0, pt.z) : lerp(0, Fsb, 0.6 * D1e, Fs06, pt.z));
        var coef = r.fwd ? 0.007 : (opt.aftPeak ? 0.0085 : 0.007);
        add((r.fwd ? 'Tab 5.4.1 (2)' : 'Tab 6.4.1 (2)') + ' side longitudinal, dry space', 'Z = ' + coef + ' s k h_T1 l_e² F_s (h_T1 ' + she.h_T1.toFixed(2) + ', f_w ' + fw.toFixed(2) + ', F_s ' + Fs.toFixed(3) + ')', coef * s * k * she.h_T1 * le * le * Fs);
        var Dm = r.fwd ? D1e : Math.min(D1e, 20);
        add((r.fwd ? 'Tab 5.4.1 (1) forecastle' : 'Tab 6.4.1 (1) poop') + ' minimum', (r.fwd ? 'Z = 0.0075' : 'Z = 0.0065') + ' s k l_e² (0.6 + 0.167 D_1)', (r.fwd ? 0.0075 : 0.0065) * s * k * le * le * (0.6 + 0.167 * Dm));
        if (!(r.fwd ? opt.forePeak : opt.aftPeak)) {          /* (2)(b): between the peak bulkhead and 0.2 L also the midship row */
          var shm = sideHead(ship, pt.z, { floor: ship.fbType === 'B60' ? 'B60' : 'B' }), lfm = longitudinalFactors(ship, pt.z, opt);
          var capm = lfm.F_1 <= 0.14 ? 0.86 * (lfm.h_5 + p.D_1mid / 8) : lfm.h_5 + p.D_1mid / 8, hT1m = Math.min(shm.h_T1, capm);
          add((r.fwd ? 'Tab 5.4.1' : 'Tab 6.4.1') + ' (2)(b): midship requirement Tab 1.6.1 (1)(a)', 'Z = 0.056 s k h_T1 l_e² F_1 F_s (h_T1 ' + hT1m.toFixed(2) + ', F_1 ' + lfm.F_1.toFixed(3) + ', F_s ' + lfm.F_s.toFixed(3) + ')', 0.056 * s * k * hT1m * le * le * lfm.F_1 * lfm.F_s);
        }
        if (opt.h_4) add('deep tank: Tab 1.9.1 (2)', 'Z = ρ s k h_4 l_e² / (22 γ (ω_1 + ω_2 + 2))', p.rho * s * k * opt.h_4 * le * le / (22 * (opt.profType === 'FB' ? 1.6 : 1.4) * ((opt.w1 || 1) + (opt.w2 || 1) + 2)));
      }
    } else {
      if (bottom) {                                          /* Tab 1.6.3 (4) bottom frames of double bottom bracket floors */
        var Zbf = 2.15 * s * k * T * le * 1e-2;
        add('Tab 1.6.3 (4) bottom frame of double bottom bracket floor', 'Z = 2.15 s k T l_e 10⁻²', Zbf);
        return finishZ(out, { region: r });
      }
      /* transverse frames: Tab 1.6.3 midship, 5.4.2 / 6.4.2 at the ends */
      var H = Math.max(opt.H || 3.5, opt.tween ? 2.5 : 3.5), C = bracketC(opt), zmid = opt.z_mid !== undefined ? opt.z_mid : pt.z;
      var D1 = Math.min(ship.D, 1.6 * T), fwT = 1.0, D1t = D1, T1t = T, tab = 'Tab 1.6.3';
      if (r.fwd && r.dF < 0.2 * L) { D1t = T + p.H_b; T1t = Math.max(T, 0.65 * D1t); fwT = lerp(0.15 * L, 1.71, 0.2 * L, 1.0, r.dF); tab = 'Tab 5.4.2'; }
      if (r.aft && r.dA < 0.2 * L) { D1t = Math.min(ship.D, T + p.H_b); T1t = Math.max(T, 0.65 * D1t); fwT = opt.aftPeak ? 1.32 : lerp(0, 1.32, 0.2 * L, 1.0, r.dA); tab = 'Tab 6.4.2'; }
      var sh2 = sideHead(ship, zmid, { D_1: D1t, T_1: T1t, f_w: fwT });
      var Za = C * s * k * sh2.h_T1 * H * H * 1e-3, Zb = 9.1 * s * k * (tab === 'Tab 1.6.3' ? D1 : D1t) * 1e-3;
      var Ifac = tab === 'Tab 5.4.2' && r.dF < 0.15 * L ? 3.5 : 3.2;
      add(tab + ' (1)(a) frame, dry space', 'Z = C s k h_T1 H² 10⁻³ (C ' + C.toFixed(2) + ', h_T1 ' + sh2.h_T1.toFixed(2) + ', H ' + H.toFixed(2) + ')', Za, Ifac / k * H * Za);
      add(tab + ' (1)(b) minimum', 'Z = 9.1 s k D_1 10⁻³', Zb, Ifac / k * H * Zb);
      if (opt.h_4 || opt.tankSide) { var hh = Math.max(opt.h_4 || 0, D1 - zmid); add('Tab 1.6.3 (2) frame in way of tank', 'greater of 1.15 × (1) and Z = 6.7 s k h H_2² 10⁻³', Math.max(1.15 * Math.max(Za, Zb), 6.7 * s * k * hh * Math.max(H, 2.5) * Math.max(H, 2.5) * 1e-3)); }
      if (opt.peak) { var S1 = opt.S_1 || H, Kp = r.fwd ? (opt.tween ? 1.87 : 2.3) : 1.85, D2p = clamp(D1t, 6, 16); add((r.fwd ? 'Tab 5.4.2' : 'Tab 6.4.2') + ' (1) peak frame', 'Z = ' + Kp + ' s k T D_2 S_1 10⁻³', Kp * s * k * T * D2p * S1 * 1e-3, (r.fwd ? 3.5 : 3.2) / k * S1 * Kp * s * k * T * D2p * S1 * 1e-3); }
    }
    return finishZ(out, { region: r });
  }
  function bracketC(opt) {
    var b = opt.brackets || 'two';
    if (b === 'two') return 3.4; if (b === 'one') return 6.1; if (b === 'none') return 7.3;
    if (b === 'oneReduced') return 6.1 * (1.2 - 0.2 * (opt.la_l || 1)); if (b === 'twoReduced') return 3.4 * (2.15 - 1.15 * (opt.la_l || 1)); if (b === 'stdReduced') return 3.4 * (1.8 - 0.8 * (opt.la_l || 1));
    return 3.4;
  }
  function deckStiffener(ship, pt, pos, opt) {
    var p = params(ship), k = opt.k, s = opt.s, le = Math.max(opt.l_e, opt.framing === 'trv' ? 1.83 : 1.5), out = [], L = ship.L;
    var add = function (row, formula, Z, I) { out.push({ row: row, formula: formula, Z: Z, I: I }); };
    var strength = /^(strengthDeck|weatherDeck)$/.test(pos), longit = opt.framing !== 'trv';
    var gam = opt.profType === 'FB' ? 1.6 : 1.4;
    if (strength) {
      var wh = weatherHead(ship, pt.x, 'secondary', opt.p_a), h1 = wh.h_1;
      if (longit) {
        if (opt.insideOpenings) add('Tab 1.4.3 (1)(b) inside line of openings', 'Z = s k (400 h_1 + 0.005 (l_e L_2)²) 10⁻⁴ (h_1 ' + h1.toFixed(2) + ')', s * k * (400 * h1 + 0.005 * Math.pow(le * p.L_2, 2)) * 1e-4);
        else { var c1 = 60 / (225 - 165 * p.F_Ds), F1 = 0.25 * c1, hT1 = ship.fbType === 'B60' ? p.L_1 / 56 : Math.max(p.L_1 / 70, 1.2); add('Tab 1.4.3 (1)(a) outside line of openings', 'Z = 0.043 s k h_T1 l_e² F_1 (h_T1 ' + hT1.toFixed(2) + ', F_1 ' + F1.toFixed(3) + ')', 0.043 * s * k * hT1 * le * le * F1); }
        if (opt.p_a && opt.p_a > 8.5) add('Tab 1.4.3 note 1: cargo deck row with the specified-cargo head', L >= 90 ? 'Z = s k (5.9 L_1 + 25 h_2 l_e²) 10⁻⁴' : 'Z = 0.005 s k h_2 l_e²', L >= 90 ? s * k * (5.9 * p.L_1 + 25 * h1 * le * le) * 1e-4 : 0.005 * s * k * h1 * le * le);
      } else {
        var K1 = [20.0, 13.3, 10.5, 9.3][clamp((ship.decks || 1) - 1, 0, 3)], K2 = opt.shortErection ? 133 : 530, K3 = opt.sideSpan ? 3.6 : 3.3, B1 = Math.min(ship.B, 21.5);
        var Za = (K1 * K2 * ship.T * ship.D + K3 * B1 * s * h1 * le * le) * k * 1e-4, Zb = 2 * K3 * B1 * s * k * h1 * le * le * 1e-4;
        add('Tab 1.4.5 (1) strength / weather deck beam', 'lesser of (a) (K_1 K_2 T D + K_3 B_1 s h_1 l_e²) k 10⁻⁴ and (b) 2 K_3 B_1 s k h_1 l_e² 10⁻⁴', Math.min(Za, Zb));
      }
      if (opt.h_4) add('Tab 1.4.3 (2) crown of a tank', 'Z = 0.0113 ρ s k h_4 l_e² / γ', 0.0113 * p.rho * s * k * opt.h_4 * le * le / gam, 2.3 / k * le * 0.0113 * p.rho * s * k * opt.h_4 * le * le / gam);
    } else if (pos === 'ssDeck' || pos === 'coachroof') {
      var th = tierHead(ship, opt.tier || 1, !opt.sheltered), h3 = th.h_3;
      if (opt.deckhouse) add('Pt 3 Ch 8 2.4.3 deckhouse deck beam / longitudinal', 'Z = 0.0048 h_2 s l_e² k ≥ 0.025 s (h_2 ' + h3.toFixed(2) + ')', Math.max(0.0048 * h3 * s * le * le * k, 0.025 * s));
      else if (longit) add('Pt 3 Ch 8 2.4.2 → Tab 1.4.4 (2) accommodation deck longitudinal', L >= 90 ? 'Z = s k (5.1 L_1 + 25 h_3 l_e²) 10⁻⁴' : 'Z = 0.00425 s k h_3 l_e²', L >= 90 ? s * k * (5.1 * p.L_1 + 25 * h3 * le * le) * 1e-4 : 0.00425 * s * k * h3 * le * le);
      else add('Pt 3 Ch 8 2.4.2 → Tab 1.4.5 (3) accommodation deck beam', 'Z = (530 K_1 T D + 38.8 s h_3 l_e²) k 10⁻⁴', (530 * [20.0, 13.3, 10.5, 9.3][clamp((ship.decks || 1) - 1, 0, 3)] * ship.T * ship.D + 38.8 * s * h3 * le * le) * k * 1e-4);
    } else {
      var acc = opt.accommodation, ch = acc ? { h: 1.2, row: 'accommodation h_3 = 1.2 m' } : cargoHead(opt.H_td || 2.5, opt.p_a, opt.C), h = acc ? 1.2 : ch.h_2;
      if (longit) add(acc ? 'Tab 1.4.4 (2) accommodation deck longitudinal' : 'Tab 1.4.4 (1) cargo deck longitudinal', L >= 90 ? 'Z = s k (' + (acc ? 5.1 : 5.9) + ' L_1 + 25 h l_e²) 10⁻⁴ (h ' + h.toFixed(2) + ')' : 'Z = ' + (acc ? 0.00425 : 0.005) + ' s k h l_e²', L >= 90 ? s * k * ((acc ? 5.1 : 5.9) * p.L_1 + 25 * h * le * le) * 1e-4 : (acc ? 0.00425 : 0.005) * s * k * h * le * le);
      else add(acc ? 'Tab 1.4.5 (3) accommodation deck beam' : 'Tab 1.4.5 (2) cargo deck beam', 'Z = (' + (acc ? 530 : 400) + ' K_1 T D + 38.8 s h l_e²) k 10⁻⁴', ((acc ? 530 : 400) * [20.0, 13.3, 10.5, 9.3][clamp((ship.decks || 1) - 1, 0, 3)] * ship.T * ship.D + 38.8 * s * h * le * le) * k * 1e-4);
      if (opt.h_4) add('Tab 1.4.4 (3) crown / bottom of a tank', 'Z = 0.0113 ρ s k h_4 l_e² / γ', 0.0113 * p.rho * s * k * opt.h_4 * le * le / gam, 2.3 / k * le * 0.0113 * p.rho * s * k * opt.h_4 * le * le / gam);
    }
    return finishZ(out, {});
  }
  function bulkheadStiffener(ship, opt) {
    var p = params(ship), k = opt.k, s = opt.s, le = Math.max(opt.l_e, 0.1), gam = opt.profType === 'FB' ? 1.6 : 1.4, w = (opt.w1 || 0) + (opt.w2 || 0) + 2, out = [], h4 = opt.h_4 || 0;
    if (opt.deepTank) { var Zd = p.rho * s * k * h4 * le * le / (22 * gam * w); out.push({ row: 'Tab 1.9.1 (2) deep tank bulkhead stiffener', formula: 'Z = ρ s k h_4 l_e² / (22 γ (ω_1 + ω_2 + 2))', Z: Zd, I: 2.3 / k * le * Zd }); }
    else out.push({ row: 'Tab 1.9.1 (2) watertight bulkhead stiffener', formula: 'Z = s k h_4 l_e² / (71 γ (ω_1 + ω_2 + 2))', Z: s * k * h4 * le * le / (71 * gam * w) });
    return finishZ(out, {});
  }
  function erectionStiffener(ship, pt, pos, opt) {
    var k = opt.k, s = opt.s, ls = Math.max(opt.l_s || opt.l_e, 2.0);
    var eh = erectionHead(ship, { x: pt.x, X: opt.X, z: pt.z, tier: opt.tier, face: pos === 'dhFront1' || pos === 'dhFrontUp' ? 'front' : pos === 'dhOther' ? (opt.face || 'aft') : 'side', b: opt.b, casing: opt.casing });
    return finishZ([{ row: 'Pt 3 Ch 8 2.2.1 erection stiffener, h = ' + eh.h.toFixed(2) + ' m, l_s ' + ls.toFixed(2), formula: 'Z = 0.0035 h s l_s² k', Z: 0.0035 * eh.h * s * ls * ls * k }], { head: eh });
  }
  function innerBottomStiffener(ship, pt, opt) {
    var r = shellStiffener(ship, { x: pt.x, z: 0 }, 'bottom', opt);
    var out = r.rows.map(function (o) { return { row: '8.4.5 inner bottom: 85 % of ' + o.row, formula: '0.85 × ' + o.formula, Z: 0.85 * o.Z }; });
    return finishZ(out, {});
  }
  function finishZ(out, extra) {
    var best = out.reduce(function (b, o) { return !b || o.Z > b.Z ? o : b; }, null);
    out.forEach(function (o) { o.best = o === best; });
    extra.rows = out; extra.Z = best ? best.Z : 0; extra.I = out.reduce(function (m, o) { return Math.max(m, o.I || 0); }, 0); extra.governing = best ? best.row : '-';
    return extra;
  }
  /* web proportions (Tab 1.6.1 note 1 / Tab 1.9.1 note 3) */
  function webLimit(prof, k_L, continuous) { return prof.type === 'FB' ? (continuous === false ? 15 : 18) * Math.sqrt(k_L) : 60 * Math.sqrt(k_L); }
  /* attached plating for the actual modulus, Pt 3 Ch 3 3.2.3 */
  function attachedWidth(t_p, s) { return Math.min(Math.max(600, 40 * t_p), s); }

  /* position key -> rule family */
  function posKind(pos) {
    if (/^(keel|bottom|bilge)$/.test(pos)) return 'bottom';
    if (/^(side|sternShell)$/.test(pos)) return 'side';
    if (pos === 'sheerstrake') return 'sheer';
    if (/^(strengthDeck|weatherDeck)$/.test(pos)) return 'sdeck';
    if (/^(otherDeck|nonStrengthDeck|tankDeck)$/.test(pos)) return 'ldeck';
    if (/^(ssDeck|coachroof)$/.test(pos)) return 'ssDeck';
    if (/^(innerBottom|innerBottomHold)$/.test(pos)) return 'ib';
    if (/^(wtBhd|peakBhd)$/.test(pos)) return 'wtBhd';
    if (/^(longBhd|tankBhd)$/.test(pos)) return 'deepTank';
    if (/^(sside|dhFront1|dhFrontUp|dhOther)$/.test(pos)) return 'erection';
    return 'none';
  }
  /* design heads at a point for the Pressure board: [{set, head (m), P (kN/m2), kase, detail}] */
  function pointLoads(ship, pt, pos, opt) {
    opt = opt || {};
    var p = params(ship), kind = posKind(pos), out = [], r = region(ship, pt.x);
    var push = function (set, head, P, kase, detail) { out.push({ set: set, head: head, P: P, kase: kase, detail: detail || {}, scenario: r.name, AC: '-', P_sec: P, P_pri: P }); };
    if (kind === 'bottom' || kind === 'side' || kind === 'sheer') {
      var hT1 = Math.min(ship.T + p.C_w, 1.36 * ship.T), hT2 = Math.min(ship.T + 0.5 * p.C_w, 1.2 * ship.T);
      push('h_T2 bottom plating head', hT2, 10.07 * hT2, 'T + 0.5 C_w ≤ 1.2 T (Tab 1.5.2)', { C_w: p.C_w });
      if (kind !== 'bottom') push('h_T1 side plating head', hT1, 10.07 * hT1, 'T + C_w ≤ 1.36 T (Tab 1.5.3)', { C_w: p.C_w });
      var sh = sideHead(ship, pt.z, { floor: ship.fbType === 'B60' ? 'B60' : 'B' });
      if (kind !== 'bottom') push('h_T1 side longitudinal head at z', sh.h_T1, 10.07 * sh.h_T1, sh.above ? 'C_w (1 − h_6/(D_2 − T)) F_λ, h_6 ' + sh.h_6.toFixed(2) : '[h_6 + C_w (1 − h_6/(2T))] F_λ, h_6 ' + sh.h_6.toFixed(2), { h_6: sh.h_6 });
      var sf = sideHead(ship, pt.z, {}); if (kind !== 'bottom') push('h_T1 frame / transverse head at z (0.7 floor)', sf.h_T1, 10.07 * sf.h_T1, 'Tab 1.6.3 / 1.6.4', {});
    }
    if (kind === 'sdeck' || kind === 'ssDeck') {
      var wh = weatherHead(ship, pt.x, 'secondary', opt.p_a), wp = weatherHead(ship, pt.x, 'primary', opt.p_a);
      if (kind === 'sdeck') { push('h_1 weather deck, beams and longitudinals', wh.h_1, wh.p, wh.row, { E: wh.E }); push('h_1 weather deck, primary structure', wp.h_1, wp.p, wp.row, { E: wp.E }); }
      else { var th = tierHead(ship, opt.tier || 1, !opt.sheltered); push('h_3 superstructure deck', th.h_3, 7.07 * th.h_3, th.row, {}); }
      if (opt.h_4) push('h_4 tank crown', opt.h_4, 9.82 * p.rho * opt.h_4 / 1.025, 'Tab 3.5.1 deck forming crown of tank', {});
    }
    if (kind === 'ldeck') {
      if (opt.accommodation) push('h_3 accommodation deck', 1.2, 8.5, 'Tab 3.5.1: 8.5 kN/m², h_3 1.2 m', {});
      else { var ch = cargoHead(opt.H_td || 2.5, opt.p_a, opt.C); push('h_2 cargo deck', ch.h_2, ch.p, ch.row, {}); }
      if (opt.h_4) push('h_4 tank crown / bottom', opt.h_4, 9.82 * p.rho * opt.h_4 / 1.025, 'Tab 3.5.1', {});
    }
    if (kind === 'ib') { push('H inner bottom (no heavy cargo notation)', 1.39 * ship.T, 9.82 * ship.T, 'Tab 3.5.1: 9.82 T permissible, head 1.39 T', {}); if (opt.h_4) push('h_4 double bottom tank', opt.h_4, 9.82 * p.rho * opt.h_4 / 1.025, '8.4.4', {}); }
    if (kind === 'wtBhd') push('h_4 watertight bulkhead head', opt.h_4 || 0, 10.07 * (opt.h_4 || 0), 'to 0.91 m above bulkhead deck or z_FD (Tab 1.9.1)', {});
    if (kind === 'deepTank') push('h_4 deep tank head', opt.h_4 || 0, 9.82 * p.rho * (opt.h_4 || 0) / 1.025, 'to tank top or half to overflow, greater (Tab 1.9.1)', {});
    if (kind === 'erection') {
      var eh = erectionHead(ship, { x: pt.x, X: opt.X, z: pt.z, tier: opt.tier, face: pos === 'dhFront1' || pos === 'dhFrontUp' ? 'front' : pos === 'dhOther' ? (opt.face || 'aft') : 'side', b: opt.b, casing: opt.casing });
      push('h erection bulkhead head', eh.h, 10.07 * eh.h, 'α ' + eh.alpha.toFixed(3) + ' δ ' + eh.delta.toFixed(3) + ' (β λ ' + (eh.beta * eh.lambda).toFixed(2) + ' − γ ' + eh.gamma.toFixed(2) + ')' + (eh.h > eh.h_calc ? ' → minimum ' + eh.h_min.toFixed(2) : ''), eh);
    }
    return out;
  }

  var api = { posKind: posKind, pointLoads: pointLoads, MATERIALS: MATERIALS, kFactor: kFactor, kL: kL, params: params, region: region, sB: sB, f2: f2, weatherHead: weatherHead, cargoHead: cargoHead, tierHead: tierHead, erectionHead: erectionHead, sideHead: sideHead,
              shellPlating: shellPlating, deckPlating: deckPlating, innerBottomPlating: innerBottomPlating, bulkheadPlating: bulkheadPlating, erectionPlating: erectionPlating,
              longitudinalFactors: longitudinalFactors, shellStiffener: shellStiffener, deckStiffener: deckStiffener, bulkheadStiffener: bulkheadStiffener, erectionStiffener: erectionStiffener, innerBottomStiffener: innerBottomStiffener,
              bracketC: bracketC, webLimit: webLimit, attachedWidth: attachedWidth, erectionSb: erectionSb };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LRShips = api;
})(typeof window !== 'undefined' ? window : this);
