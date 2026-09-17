/* LoadPoint - DNV RU-SHIP Pt 3 Ch 4 Sec 5 [1] external sea pressure at a load point.
   Pure functions, no DOM: the same file runs in the page and under node (tests/).
   Reference: Rules/DNV/_hesap/borda-basinci.py (same formulas, checked against each other).

   Symbols (Ch 1 Sec 4, Ch 4 Sec 2-5):
     L0  = max(L, 110)                        f_xL = x/L clamped 0..1
     f_yB = |2y|/B_x  (B_x waterline breadth at the section, <= 1)   f_yB1 = |2y|/B
     f_T  = T_LC/T_SC clamped 0.5..1         C_w Sec 4      f_beta = 0.8 BSR/BSP (extreme), else 1
     f_ps = 1.0 extreme (x f_r service), 0.8 ballast water exchange
   Coordinates: x from the aft end of L (AE) forward, y from CL (+ port), z from baseline, all in m. */
(function (root) {
  'use strict';
  var g = 9.81, rho = 1.025, d2r = Math.PI / 180;
  var F_R = { R0: 1.0, R1: 0.9, R2: 0.8, R3: 0.7, R4: 0.6 };

  function interp(nodes, vals, t) {
    for (var i = 0; i < nodes.length - 1; i++)
      if (nodes[i] <= t && t <= nodes[i + 1])
        return vals[i] + (vals[i + 1] - vals[i]) * (t - nodes[i]) / (nodes[i + 1] - nodes[i]);
    return t < nodes[0] ? vals[0] : vals[vals.length - 1];
  }

  function waveCoef(L) {
    if (L < 90) return 0.0856 * L;
    if (L <= 300) return 10.75 - Math.pow((300 - L) / 100, 1.5);
    if (L <= 350) return 10.75;
    return 10.75 - Math.pow((L - 350) / 150, 1.5);
  }

  /* ship: {L, B, T_SC, C_B, GM?, k_r?, service?}
     pt:   {x, y, z, B_x?}  (m)
     opt:  {T_LC?, bwe?, partial?} */
  function context(ship, pt, opt) {
    opt = opt || {};
    var L = ship.L, B = ship.B, T_SC = ship.T_SC, C_B = ship.C_B;
    var T_LC = opt.T_LC || T_SC;
    var B_x = pt.B_x || B;
    var f_r = F_R[ship.service || 'R0'] || 1.0;
    var GM = ship.GM || 0.07 * B, k_r = ship.k_r || 0.39 * B;
    var c = {
      L: L, B: B, T_SC: T_SC, C_B: C_B, T_LC: T_LC, B_x: B_x, x: pt.x, y: pt.y, z: pt.z,
      L0: Math.max(L, 110), bwe: !!opt.bwe, partial: !!opt.partial,
      f_r: f_r, f_ps: (opt.bwe ? 0.8 : 1.0) * f_r,
      f_T: Math.min(Math.max(T_LC / T_SC, 0.5), 1.0),
      f_xL: Math.min(Math.max(pt.x / L, 0), 1),
      f_yB: B_x > 0 ? Math.min(Math.abs(2 * pt.y) / B_x, 1) : 1,
      f_yB1: Math.min(Math.abs(2 * pt.y) / B, 1),
      GM: GM, k_r: k_r, T_th: 2.3 * Math.PI * k_r / Math.sqrt(g * GM),
      C_w: waveCoef(L), f_beta_bs: opt.bwe ? 1.0 : 0.8,
      C_x: 1.5 - Math.abs(pt.x - 0.5 * L) / L
    };
    return c;
  }

  var fnl = function (c, tbl) { return interp([0, 0.3, 0.7, 1.0], tbl, c.f_xL); };
  var sq = function (c, lam, den) { return Math.sqrt((c.L0 + lam - 125) / den); };

  /* --- amplitudes at (fyb, z); sign conventions handled by the caller --- */
  function hsmHsa(c, kind, fyb, zz) {
    var f_T = c.f_T, f_xL = c.f_xL;
    var C_fT = f_T + 0.5 - (0.7 * f_T - 0.2) * c.C_B;
    var f_nl = fnl(c, c.bwe ? [0.85, 0.95, 0.95, 0.80] : [0.7, 0.9, 0.9, 0.6]);
    var f_yz = c.C_x * zz / c.T_LC + (2 - c.C_x) * fyb + 1;
    var f_h = (kind === 'HSM' ? 3.0 : 2.4) * (1.21 - 0.66 * f_T);
    var k_a;
    if (f_xL < 0.15) k_a = (0.5 + f_T) * ((3 - 2 * Math.sqrt(fyb)) - 20 / 9 * f_xL * (7 - 6 * Math.sqrt(fyb))) + 2 / 3 * (1 - f_T);
    else if (f_xL < 0.7) k_a = 1.0;
    else k_a = 1 + (f_xL - 0.7) * ((40 / 3 * f_T - 5) + 2 * (1 - fyb) * (18 / c.C_B * f_T * (f_xL - 0.7) - 0.25 * (2 - f_T)));
    var lam = 0.6 * (1 + f_T) * c.L;
    var k_p = kind === 'HSM'
      ? interp([0, 0.3 - 0.1 * f_T, 0.35 - 0.1 * f_T, 0.8 - 0.2 * f_T, 0.9 - 0.2 * f_T, 1.0], [-0.25 * f_T * (1 + fyb), -1, 1, 1, -1, -1], f_xL)
      : interp([0, 0.3 - 0.1 * f_T, 0.5 - 0.2 * f_T, 0.8 - 0.2 * f_T, 0.9 - 0.2 * f_T, 1.0], [1.5 - f_T - 0.5 * fyb, -1, 1, 1, -1, -1], f_xL);
    var P = C_fT * c.f_ps * f_nl * f_h * k_a * k_p * f_yz * c.C_w * sq(c, lam, c.L);
    return { P: P, k: { C_fT: C_fT, f_nl: f_nl, f_h: f_h, k_a: k_a, k_p: k_p, f_yz: f_yz, lam: lam } };
  }

  function fsm(c, fyb, zz) {
    var f_T = c.f_T, f_xL = c.f_xL;
    var C_fT = (1 + (1.5 - f_T) * (c.C_B - 1)) * (0.6 - 0.55 * (c.L - 400) / 300);
    var f_nl = c.bwe ? 0.95 : 0.9;
    var f_yz = (c.C_x - 0.2) * zz / c.T_LC + (2 - c.C_x) * fyb + 1.2;
    var f_h = 2.6, k_a;
    if (f_xL < 0.2) k_a = 1 + (3.75 - 2 * f_T) * (1 - 5 * f_xL) * (1 - fyb);
    else if (f_xL < 0.9) k_a = 1.0;
    else k_a = 1 + 20 * (1 - fyb) * (f_xL - 0.9);
    var lam = 0.6 * (1 + 2 / 3 * f_T) * c.L;
    var k_p = interp([0, 0.35 - 0.1 * f_T, 0.5 - 0.2 * f_T, 0.75, 0.8, 1.0], [-0.75 - 0.25 * fyb, -1, 1, 1, -1, -0.75 - 0.25 * fyb], f_xL);
    var P = C_fT * c.f_ps * f_nl * f_h * k_a * k_p * f_yz * c.C_w * sq(c, lam, c.L);
    return { P: P, k: { C_fT: C_fT, f_nl: f_nl, f_h: f_h, k_a: k_a, k_p: k_p, f_yz: f_yz, lam: lam } };
  }

  function bsr(c, side, yy, fyb1) {
    var lam = g / (2 * Math.PI) * c.T_th * c.T_th;
    var th1 = 9000 * (1.4 - 0.035 * c.T_th) / ((1.15 * c.B + 55) * Math.PI);
    var s = side === 'P' ? 1 : -1;
    var roll = s * 10 * yy * Math.sin(th1 * d2r);
    var P = c.f_beta_bs * 1.0 * (roll + 0.88 * c.f_ps * c.C_w * sq(c, lam, c.L0) * (fyb1 + 1));
    return { P: P, k: { lam: lam, theta1: th1, T_theta: c.T_th, roll_term: roll } };
  }

  function bsp(c, fyb1, zz, weather) {
    var f_T = c.f_T, L = c.L;
    var lam = 0.2 * (1 + 2 * f_T) * c.L0;
    var f_nl = fnl(c, [0.6, 0.8, 0.8, 0.6]);
    var f_c1 = (0.9 + (2 * c.T_LC / c.T_SC - 1.05) * (c.C_B / 0.85 - 0.85)) * (1.03 - 0.16 * f_T);
    var f_c2 = L < 110 ? 1 + 0.25 * 110 / L : (L < 150 ? 1.25 - 0.25 * (L - 110) / 40 : 1.0);
    var f_c3 = c.partial ? 0.9 : 1.0;
    var f_yz = weather ? 2 * zz / c.T_LC + 2.5 * fyb1 + 0.5 : 2 / 3 * zz / c.T_LC + 0.5 * fyb1 + 0.5;
    var P = 4.5 * f_c1 * f_c2 * f_c3 * c.f_beta_bs * c.f_ps * f_nl * f_yz * c.C_w * sq(c, lam, c.L0);
    return { P: P, k: { lam: lam, f_nl: f_nl, f_corr1: f_c1, f_corr2: f_c2, f_corr3: f_c3, f_yz: f_yz } };
  }

  function ost(c, fyb, zz, weather) {
    var f_T = c.f_T, f_xL = c.f_xL;
    var lam = 0.45 * c.L;                                   /* image ts304-equ196.png, read magnified */
    var f_nl = c.bwe ? 0.9 : 0.8;
    var f_c = c.L <= 150 ? (1.15 - 0.3 * f_T) * (1 + (f_T + 0.55) * (150 - c.L0) / 80) : 1.15 - 0.3 * f_T;
    var f_yz = weather ? 5 * zz / c.T_LC + 3.5 * fyb + 1.5 : 1.5 * zz / c.T_LC + 1.5;
    var k_a;
    if (f_xL <= 0.2) k_a = weather ? 1 + 3.5 * (1 - fyb) * (1 - 5 * f_xL) : 1 + (3.5 - (4 * f_T - 0.5) * fyb) * (1 - 5 * f_xL);
    else if (f_xL <= 0.8) k_a = 1.0;
    else k_a = weather ? 1.0 : 1 + 4 * (1 - f_T) * (5 * f_xL - 4) * fyb;
    var nodes = [0, 0.2, 0.4, 0.5, 0.7, 0.9, 1.0];
    var kw = [1, 1, -1, -1, -0.1 + (1.6 * f_T - 1.5) * fyb, 0.8 + 0.2 * fyb, -1 + fyb];
    var kl = [1, 1 + (0.75 - 1.5 * f_T) * fyb, -1 + (1.75 - 0.5 * f_T) * fyb, -1 + (1.75 - 0.5 * f_T) * fyb,
              -0.1 + (0.25 - 0.3 * f_T) * fyb, 0.8 - (0.9 * f_T + 0.85) * fyb, -1 + (0.5 - 0.5 * f_T) * fyb];
    var k_p = interp(nodes, weather ? kw : kl, f_xL);
    var P = 1.38 * f_c * c.f_ps * f_nl * k_a * k_p * f_yz * c.C_w * sq(c, lam, c.L);
    return { P: P, k: { lam: lam, f_nl: f_nl, f_corr: f_c, k_a: k_a, k_p: k_p, f_yz: f_yz } };
  }

  function osa(c, fyb, zz, weather) {
    var f_T = c.f_T, f_xL = c.f_xL, L = c.L;
    var lam = 0.7 * L;
    var f_nl = fnl(c, c.bwe ? [0.75, 0.9, 0.9, 0.8] : [0.5, 0.8, 0.8, 0.6]);
    var alpha = 25 * c.T_LC / L;                            /* rad (rule gives degrees; same sine) */
    var base = (1.08 - 0.18 * f_T) * (1.25 + Math.log(c.C_B));
    var f_c = L < 80 ? base : (L < 100 ? base * (1 - (L / 20 - 4) * (1 - Math.sin(alpha))) : base * Math.sin(alpha));
    var f_yz = weather ? 5.5 * zz / c.T_LC + 5.3 * fyb + 2.2 : 0.9 * zz / c.T_LC + 0.4 * fyb + 2.2;
    var ka1 = 1 + 0.2 * (2 - f_T) * fyb * (Math.sin((180 * (0.5 + (f_xL - 0.275) / 0.425)) * d2r) + 0.09);
    var ka2 = 1 - 2 * (f_T - 0.75) * fyb * (3.75 - 5 * f_xL) * Math.sin((60 * (10 * f_xL - 5)) * d2r);
    var ka3 = ka1 + (0.3 * f_T - 1.15) * fyb * Math.cos((180 * (f_xL - 0.05) / 0.45) * d2r);
    var k_a;
    if (weather) {
      if (f_xL < 0.275) k_a = Math.min(ka3, 1.05);
      else if (f_xL <= 0.7) k_a = Math.min(ka1, 1.05);
      else k_a = ka1 + (1.9 * f_T - 2.05) * fyb * Math.cos((180 * (f_xL - 0.4) / 0.6) * d2r);
    } else {
      if (f_xL < 0.35) k_a = 1 + 4 * (f_T - 0.75) * fyb + 1.2 * fyb * Math.cos((90 * (5 * f_xL - 0.75)) * d2r);
      else if (f_xL <= 0.65) k_a = ka2;
      else k_a = ka2 + 36 * Math.pow(f_xL - 0.65, 2) * fyb;
    }
    var nodes = [0, 0.1, 0.35, 0.4, 0.55, 0.85, 1.0];
    var kw = [0.75 - 0.5 * fyb, f_T - 0.25 + (1.25 - f_T) * fyb, 1.0, 1.25 - 0.5 * f_T + (0.5 * f_T - 0.25) * fyb,
              1.5 - f_T + (f_T - 1.07) * fyb, 0.5 * f_T - 1.25 + (0.25 - 0.5 * f_T) * fyb, 0.5 * f_T - 1.25 + (0.25 - 0.5 * f_T) * fyb];
    var kl = [0.75, f_T - 0.25 + (0.35 * f_T - 0.47) * fyb, 1 + (2.7 * f_T - 3.2) * fyb, 1.25 - 0.5 * f_T + (2.7 * f_T - 3.2) * fyb,
              1.5 - f_T + (2.7 * f_T - 3.2) * fyb, 0.5 * f_T - 1.25 + (0.2 - 0.1 * f_T) * fyb, 0.5 * f_T - 1.25 + (0.2 - 0.1 * f_T) * fyb];
    var k_p = Math.min(Math.max(interp(nodes, weather ? kw : kl, f_xL), -1), 1);
    var P = 0.81 * f_c * c.f_ps * f_nl * k_a * k_p * f_yz * c.C_w * sq(c, lam, c.L) * (1 + 0.5 * f_T);
    return { P: P, k: { lam: lam, f_nl: f_nl, f_corr: f_c, k_a: k_a, k_p: k_p, f_yz: f_yz } };
  }

  /* Signed amplitude of every load case at (y, z). Tables 10/12/16 have a "y >= 0"
     row whose first column is the P case: 'weather' = that first column. */
  function amplitudes(c, yy, zz, fyb, fyb1) {
    var out = [], r;
    r = hsmHsa(c, 'HSM', fyb, zz); out.push({ n: 'HSM-1', A: -r.P, k: r.k }, { n: 'HSM-2', A: r.P, k: r.k });
    r = hsmHsa(c, 'HSA', fyb, zz); out.push({ n: 'HSA-1', A: -r.P, k: r.k }, { n: 'HSA-2', A: r.P, k: r.k });
    r = fsm(c, fyb, zz);           out.push({ n: 'FSM-1', A: -r.P, k: r.k }, { n: 'FSM-2', A: r.P, k: r.k });
    var w = yy >= 0;
    [['P', w], ['S', !w]].forEach(function (sw) {
      var side = sw[0], wea = sw[1];
      r = bsr(c, side, yy, fyb1);   out.push({ n: 'BSR-1' + side, A: r.P, k: r.k }, { n: 'BSR-2' + side, A: -r.P, k: r.k });
      r = bsp(c, fyb1, zz, wea);    out.push({ n: 'BSP-1' + side, A: r.P, k: r.k }, { n: 'BSP-2' + side, A: -r.P, k: r.k });
      r = ost(c, fyb, zz, wea);     out.push({ n: 'OST-1' + side, A: r.P, k: r.k }, { n: 'OST-2' + side, A: -r.P, k: r.k });
      r = osa(c, fyb, zz, wea);     out.push({ n: 'OSA-1' + side, A: r.P, k: r.k }, { n: 'OSA-2' + side, A: -r.P, k: r.k });
    });
    return out;
  }

  function seaPressure(ship, pt, opt) {
    var c = context(ship, pt, opt);
    var z = c.z, T = c.T_LC;
    var P_S = z <= T ? rho * g * (T - z) : 0;
    var amp = amplitudes(c, c.y, z, c.f_yB, c.f_yB1);
    /* same case at the waterline on the same side: z = T_LC, y = +-B_x/2 (f_yB = 1) */
    var ampWL = amplitudes(c, c.y >= 0 ? c.B_x / 2 : -c.B_x / 2, T, 1.0, Math.min(c.B_x / c.B, 1));
    var cases = amp.map(function (a, i) {
      var P_WWL = Math.max(ampWL[i].A, 0), P_W, h_W = P_WWL / (rho * g);
      if (z <= T) P_W = Math.max(a.A, rho * g * (z - T));
      else P_W = z <= T + h_W ? P_WWL - rho * g * (z - T) : 0;
      return { name: a.n, P_W: P_W, P_ex: Math.max(P_S + P_W, 0), P_WWL: P_WWL, h_W: h_W, k: a.k };
    });
    var env = cases.reduce(function (b, r) { return r.P_W > b.P_W ? r : b; }, cases[0]);
    return { ctx: c, P_S: P_S, cases: cases, P_Wmax: env.P_W, governing: env.name, P_ex_S: P_S, P_ex_SD: Math.max(P_S + env.P_W, 0) };
  }

  /* Frame table -> x. zones: [{from: frame, s: spacing m}] ascending by frame; x0 = x of frame 0 (m).
     Frames below the first zone's 'from' use that zone's spacing. */
  function frameX(table, fr) {
    var zones = (table.zones || []).slice().sort(function (a, b) { return a.from - b.from; });
    if (!zones.length) return table.x0 + fr * (table.s || 0);
    var x = table.x0, f = 0, step = fr >= 0 ? 1 : -1;
    var spacingAt = function (k) {         /* spacing of the bay between frame k and k+1 */
      var s = zones[0].s;
      for (var i = 0; i < zones.length; i++) if (zones[i].from <= k) s = zones[i].s;
      return s;
    };
    while (f !== fr) { x += step * spacingAt(step > 0 ? f : f - 1); f += step; }
    return x;
  }

  var api = { seaPressure: seaPressure, frameX: frameX, waveCoef: waveCoef, context: context, rho: rho, g: g };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoadPoint = api;
})(typeof window !== 'undefined' ? window : this);
