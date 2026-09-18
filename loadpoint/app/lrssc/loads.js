/* LoadPoint - LR Rules for Special Service Craft (July 2026), Part 5 local design loads
   for MONO-HULL craft. Pure functions; usable in the browser and in node.

   Pt 5 Ch 2 Sec 2   symbols, H_s minimum per service group (Tab 2.2.1), f_Hs = 0.18 H_s >= 0.5
   Pt 5 Ch 2 Sec 3   H_rm relative motion (3.1.1); a_v / a_x non-displacement (3.2.4, 3.2.6);
                     displacement-mode accelerations (Tab 2.3.2)
   Pt 5 Ch 2 Sec 4   P_h (4.3.1); non-displacement P_m, P_p, H_w, P_s distribution (4.2, 4.4);
                     displacement P_W with Tab 2.4.2 factors (4.5.1), h_w (4.5.2);
                     decks: P_wh / P_d-min (4.6.2), P_wl (4.6.3)
   Pt 5 Ch 2 Sec 5   impact: P_dh slamming / pitching (5.1.3-4), P_dhs (5.1.5), P_f (5.4, 5.5),
                     non-displacement P_dlb / P_dls (5.2)
   Pt 5 Ch 2 Sec 7   P_dhp = C_1 P_d (7.1), P_bh (7.2), P_cd (7.4)
   Pt 5 Ch 3 / Ch 4  design factors (H_f, G_f, omega, C_f, delta_f) and the design-pressure
                     tables 3.3.1 (non-displacement) and 4.3.1 (displacement)
   Pt 5 Ch 5 Sec 2   L_f wave coefficient (2.2.1)

   ship fields used: L (L_R), L_WL, B, D, T, C_B, disp (t), V (knots), mode 'disp'|'nondisp',
   H_s, group 'G0'..'G6', stype (service type key), hull 'none'|'HSC'|'LDC', craft (C_f key),
   GM, k_r, bilgeKeel, x_LCG (from aft end of L_WL), z_k, theta_D, theta_trim, B_c, B_W, chines.
   Point: x from the aft end of L_WL, y from centreline, z above baseline (m).

   The location factor f_L of 4.6.3 refers to 4.6.2, where the July 2026 text no longer
   defines it; the values are taken from the July 2014 edition, 4.5.2: 1.0 aft of 0.88 L_R,
   1.25 to 0.925 L_R, 1.5 forward, 1.0 for interior decks. */
(function (root) {
  'use strict';
  var g = 9.81, rho = 1.025, PI = Math.PI;
  var clamp = function (v, a, b) { return Math.min(Math.max(v, a), b); };
  var lerp = function (xs, ys, x) {              /* piecewise linear, clamped at the ends */
    if (x <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
  };
  var tan = function (deg) { return Math.tan(deg * PI / 180); }, sin = function (deg) { return Math.sin(deg * PI / 180); };

  /* ---- Pt 5 Ch 2 Sec 2 / Ch 3-4 factor tables ---- */
  var HS_MIN = { G0: 0.3, G1: 0.6, G2: 1.0, G2A: 1.5, G3: 2.0, G4: 4.0, G5: 4.8, G6: 5.5 };          /* Tab 2.2.1 */
  var HS_MAX = { G0: 0.5, G1: 1.0, G2: 1.7, G2A: 2.5, G3: 3.3, G4: 4.0, G5: 4.8, G6: 5.5 };          /* non-displacement restriction */
  var GF = { G0: 0.6, G1: 0.6, G2: 0.75, G2A: 0.8, G3: 0.85, G4: 1.0, G5: 1.2, G6: 1.25 };          /* Tab 3.2.2 (G0 taken as G1) */
  var OMEGA = { cargoA: 1.0, cargoB: 1.1, crew: 1.1, passenger: 1.0, passengerA: 1.0, passengerB: 1.1, patrol: 1.2, pilot: 1.25, yacht: 1.1, workboat: 1.25 };   /* Tab 3.2.3 / 4.2.1 */
  var OMEGA_LABEL = { cargoA: 'Cargo (A)', cargoB: 'Cargo (B)', crew: 'Crew boat', passenger: 'Passenger', passengerA: 'Passenger (A)', passengerB: 'Passenger (B)', patrol: 'Patrol', pilot: 'Pilot', yacht: 'Yacht', workboat: 'Workboat' };
  var HF = { none: 1.0, HSC: 1.0, LDC: 0.95 };                                                     /* Tab 3.2.1 */
  var CF = { Mono: 1.0, RIB: 1.15, Hydrofoil: 1.1 };                                                /* Tab 3.2.4, mono-hull entries */
  var DELTA = { plate: 1.0, secondary: 0.8, primary: 0.5 };                                         /* Tab 3.2.5 / 4.2.2 */
  var KR = { nondisp: 2.25, disp: 1.95 };                                                            /* Tab 2.3.1 mono-hull */
  var FF = { nondisp: 0.94, disp: 0.89 };                                                            /* Tab 2.5.1 / 2.5.3 mono-hull */

  /* wave coefficient L_f, Pt 5 Ch 5 2.2.1 */
  function waveCoef(L_R) { return L_R < 90 ? 0.065 * L_R + 1.857 : 10.75 - Math.pow(3 - 0.01 * L_R, 1.5); }

  /* ship-level parameters shared by every load */
  function params(ship) {
    var mode = ship.mode === 'nondisp' ? 'nondisp' : 'disp';
    var Hs_min = HS_MIN[ship.group] || HS_MIN.G4;
    var H_s = Math.max(ship.H_s || 0, Hs_min);
    if (mode === 'nondisp') H_s = Math.min(H_s, HS_MAX[ship.group] || HS_MAX.G4);          /* 2.3.4 */
    var V = ship.V || 0, L_WL = ship.L_WL || ship.L;
    return {
      mode: mode, L_R: ship.L, L_WL: L_WL, H_s: H_s, Hs_min: Hs_min,
      f_Hs: Math.max(0.18 * H_s, 0.5),                                                             /* 2.4.1 */
      Gamma: L_WL > 0 ? V / Math.sqrt(L_WL) : 0,                                                  /* 2.1.17 */
      F_n: L_WL > 0 ? 0.515 * V / Math.sqrt(g * L_WL) : 0,                                        /* 2.1.7 with V_m = V */
      F_n_rm: L_WL > 0 ? 0.515 * (2 / 3) * V / Math.sqrt(g * L_WL) : 0,                            /* 3.1.1: V_m = 2/3 V */
      H_f: HF[ship.hull] || 1.0, G_f: GF[ship.group] || 1.0, omega: OMEGA[ship.stype] || 1.0, C_f: CF[ship.craft] || 1.0,
      L_f: waveCoef(ship.L), k_r: KR[mode], f_f: FF[mode],
      x_LCG: ship.x_LCG === undefined || ship.x_LCG === null || ship.x_LCG === '' ? 0.45 * L_WL : +ship.x_LCG,
      z_k: +ship.z_k || 0, T: ship.T
    };
  }

  /* ---- Pt 5 Ch 2 Sec 3 ---- */
  /* 3.1.1 relative vertical motion at x (from aft end of L_WL) */
  function relativeMotion(ship, x) {
    var p = params(ship), L = p.L_WL, Cb = ship.C_B;
    var C_w = 0.0771 * L * Math.pow(Cb + 0.2, 0.3) * Math.exp(-0.0044 * L);
    var x_m = Math.max(0.45 - 0.6 * p.F_n_rm, 0.2);
    var k_m = 1 + p.k_r * Math.pow(0.5 - x_m, 2) / (Cb + 0.2);
    var C_wmin = C_w / k_m;
    var H_rm = C_wmin * (1 + (p.k_r / (Cb + 0.2)) * Math.pow(x / L - x_m, 2));
    return { H_rm: H_rm, C_w: C_w, C_wmin: C_wmin, k_m: k_m, x_m: x_m, k_r: p.k_r };
  }

  /* 3.2.4 vertical acceleration at LCG (g) and 3.2.6 at x, non-displacement mono-hull */
  function accelNonDisp(ship, x) {
    var p = params(ship), L = p.L_WL;
    var B_W = ship.B_W || ship.B, B_c = ship.B_c || B_W;
    var L1 = Math.max(L / B_W, 3) * Math.pow(B_c, 3) / (ship.disp || 1);                    /* L_WL B_c^3 / (B_W Delta) with L_WL / B_W >= 3 */
    var H1 = clamp(p.H_s / B_W, 0.2, 0.7);
    var thD = Math.min(ship.theta_D || 0, 30), thB = Math.max(ship.theta_trim || 0, 3);
    var a_v = 1.5 * thB * L1 * (H1 + 0.084) * (5 - 0.1 * thD) * p.Gamma * p.Gamma * 1e-3;
    var xi = 0.14 + 0.32 * p.x_LCG / L - 1.76 * Math.pow(p.x_LCG / L, 2);
    var a_x = a_v * (0.86 - 0.32 * x / L + 1.76 * Math.pow(x / L, 2) + xi);
    return { a_v: a_v, a_x: a_x, L1: L1, H1: H1, xi: xi, theta_D: thD, theta_trim: thB, Gamma: p.Gamma, over6g: a_v > 6 };
  }

  /* Tab 2.3.2 motions (displacement mode) */
  function motionsDisp(ship) {
    var p = params(ship), L = p.L_WL, B = ship.B, Cb = ship.C_B, f_st = 0.8;
    var GM = ship.GM || 0.10 * B; GM = Math.max(GM, 0.05 * B);
    var k_r = ship.k_r || 0.39 * B;
    var f_BK = ship.bilgeKeel ? 1.0 : 1.2;
    var a0 = p.f_Hs * f_st * (1.58 - 0.47 * Cb) * (2.4 / Math.sqrt(L) + 34 / L - 600 / (L * L));
    var T_theta = 2.3 * PI * k_r / Math.sqrt(g * GM);
    var theta = 9000 * (1.25 - 0.021 * T_theta) * f_BK / ((70 + 1.15 * B) * PI);
    var T_phi = 0.547 * Math.sqrt((1 + 1.2 * Cb) * L);
    var phi = 38.9 * Math.exp(-0.0075 * L);
    var R = Math.min(ship.D / 4 + ship.T / 2, ship.D / 2);
    return {
      a0: a0, f_Hs: p.f_Hs, f_st: f_st, GM: GM, k_r: k_r, f_BK: f_BK, T_theta: T_theta, theta: theta, T_phi: T_phi, phi: phi, R: R, L_CG: p.x_LCG,
      a_surge: 0.2 * a0 * g * (1.1 + 75 / L) * (0.0035 * L + 0.475),
      a_sway: 0.5 * a0 * g * (0.0025 * L + 0.625),
      a_heave: a0 * g * (0.0022 * L + 0.67),
      a_roll: p.f_Hs * f_st * 0.69 * theta / (T_theta * T_theta),                                 /* deg/s^2 in the rule's units */
      a_pitch: p.f_Hs * f_st * 0.69 * (phi / (T_phi * T_phi)) * (1.4 - 5.62 / Math.sqrt(L))
    };
  }
  /* Tab 2.3.2 accelerations at a point (m/s^2). The roll / pitch terms multiply the
     angular acceleration (deg/s^2) by a lever in m as the table writes it. */
  function accelDisp(ship, m, x, y, z) {
    var L = params(ship).L_WL;
    var f_ax = Math.min(0.006 * L, 0.5), f_av = x <= L / 2 ? 0 : 0.7;
    var a_pitch_x = m.a_pitch * (z - m.R), a_roll_y = m.a_roll * (z - m.R), a_roll_z = m.a_roll * y, a_pitch_z = m.a_pitch * (x - m.L_CG);
    return {
      a_x: f_ax * Math.sqrt(m.a_surge * m.a_surge + Math.pow((L / 325) * (g * sin(m.phi) + a_pitch_x), 2)),
      a_y: Math.sqrt(m.a_sway * m.a_sway + Math.pow(g * sin(m.theta) + a_roll_y, 2)),
      a_z: Math.sqrt(m.a_heave * m.a_heave + Math.pow((f_av + L / 325) * a_pitch_z, 2) + Math.pow(1.2 * a_roll_z, 2)),
      f_ax: f_ax, f_av: f_av, a_pitch_x: a_pitch_x, a_roll_y: a_roll_y, a_roll_z: a_roll_z, a_pitch_z: a_pitch_z
    };
  }

  /* ---- Pt 5 Ch 2 Sec 4 ---- */
  /* 4.3.1 hydrostatic pressure; T_x local draught (blank = T) */
  function P_h(ship, z, T_x) { var p = params(ship); return Math.max(10 * ((T_x || ship.T) - (z - p.z_k)), 0); }

  /* 4.5.1 displacement-mode hydrodynamic pressure. side: 'bottom' (Tab 2.4.2 rows 1-2 across y) or
     'side' (rows 2-4 up the side). Returns P_W at the point plus the waterline value and h_w. */
  function hydroDisp(ship, pt, side, B_x, T_x) {
    var p = params(ship), L = p.L_WL, B = ship.B, Bx = B_x || B, Tx = T_x || ship.T;
    var m = motionsDisp(ship), xs = [0.1 * L, 0.5 * L, 0.9 * L];
    var r = Bx > 0 ? B / Bx : 1;
    /* Tab 2.4.2 rows: [f_C x3], [f_theta x3], [f_phi x3] */
    var rows = {
      cl:   { fC: [0.3, 0.2, 0.3],    fth: [0, 0, 0.3 * r],                fph: [0.03, 0, 0.1] },
      bilge:{ fC: [0.35, 0.35, 0.35], fth: [0.48 * r, 0.5 * r, 0.35 * r], fph: [0.032, 0, 0.132] },
      wl:   { fC: [0.68, 0.68, 0.68], fth: [0.3 * r, 0.6 * r, 0.3 * r],   fph: [0.048, 0, 0.17] }
    };
    var at = function (row) {
      var fC = lerp(xs, row.fC, pt.x), fth = lerp(xs, row.fth, pt.x), fph = lerp(xs, row.fph, pt.x);
      return { P: 0.5 * p.f_Hs * g * Math.sqrt(Math.pow(fC * p.L_f, 2) + Math.pow(fth * Bx * sin(m.theta), 2) + Math.pow(fph * L * sin(m.phi), 2)), fC: fC, fth: fth, fph: fph };
    };
    var Pcl = at(rows.cl), Pbl = at(rows.bilge), Pwl = at(rows.wl);
    var h_w = 2 * Pwl.P / (rho * g);                                                               /* 4.5.2 */
    var P, where;
    if (side === 'bottom') { var fy = clamp(Math.abs(pt.y) / (Bx / 2), 0, 1); P = Pcl.P + (Pbl.P - Pcl.P) * fy; where = 'bottom row, y/(B_x/2) = ' + fy.toFixed(2); }
    else {
      var zz = pt.z - p.z_k;
      if (zz <= 0) { P = Pbl.P; where = 'bilge (z = 0)'; }
      else if (zz <= Tx) { P = Pbl.P + (Pwl.P - Pbl.P) * zz / Tx; where = 'side below waterline, z/T_x = ' + (zz / Tx).toFixed(2); }
      else { P = h_w > 0 ? Math.max(Pwl.P * (1 - (zz - Tx) / h_w), 0) : 0; where = 'side above waterline, (z - T_x)/h_w = ' + (h_w > 0 ? ((zz - Tx) / h_w).toFixed(2) : '-'); }
    }
    return { P_W: P, P_WL: Pwl.P, P_bilge: Pbl.P, P_cl: Pcl.P, h_w: h_w, where: where, f: side === 'bottom' ? Pbl : Pwl, theta: m.theta, phi: m.phi, L_f: p.L_f, f_Hs: p.f_Hs };
  }

  /* 4.6.2 weather deck pressure, displacement mode. opt: {sheltered, ssAft (superstructure deck aft of fwd quarter), z_deck, B_x} */
  function deckDisp(ship, pt, opt) {
    opt = opt || {};
    var p = params(ship);
    var f_Hs = Math.max(p.f_Hs, 0.18 * 4.0);                                                      /* Tab 4.3.1 note 1: H_s >= 4.0 m */
    var E = (opt.sheltered || opt.ssAft) ? 0 : Math.min((0.7 + 0.08 * p.L_WL) / Math.max(ship.D - ship.T, 0.01), 3);
    var Pdmin = f_Hs * (6 + 0.0195 * p.L_R) + E;
    var hd = hydroDisp(ship, { x: pt.x, y: (opt.B_x || ship.B) / 2, z: opt.z_deck !== undefined ? opt.z_deck : pt.z }, 'side', opt.B_x);
    var PWd = hd.P_W * f_Hs / p.f_Hs;                                                               /* P_W is linear in f_Hs */
    return { P_wh: Math.max(PWd, Pdmin), P_Wd: PWd, P_dmin: Pdmin, E: E, f_Hs: f_Hs, h_w: hd.h_w * f_Hs / p.f_Hs };
  }
  /* f_L location factor (see header note) */
  function f_L(ship, x, interior) {
    if (interior) return 1.0;
    var L = ship.L; return x < 0.88 * L ? 1.0 : (x < 0.925 * L ? 1.25 : 1.5);
  }
  /* 4.6.3 deck pressure, non-displacement mode */
  function deckNonDisp(ship, pt, opt) {
    opt = opt || {};
    var p = params(ship), a = accelNonDisp(ship, pt.x);
    var a_v = opt.interior ? Math.min(a.a_v, 1.0) : clamp(a.a_v, 1.0, 4.0);
    var E = (opt.sheltered || opt.ssAft) ? 0 : Math.min((0.7 + 0.08 * p.L_WL) / Math.max(ship.D - ship.T, 0.01), 3);
    var fL = f_L(ship, pt.x, opt.interior);
    return { P_wl: fL * (5 + 0.01 * p.L_WL) * (1 + 0.5 * a_v) + E, f_L: fL, a_v: a_v, E: E };
  }

  /* 4.4 non-displacement hydrodynamic pressure up to the waterline and the P_s distribution (Tab 2.4.1) */
  function hydroNonDisp(ship, pt, T_x, P_d) {
    var p = params(ship), L = Math.min(p.L_WL, 150), Tx = T_x || ship.T, zz = pt.z - p.z_k;
    var rm = relativeMotion(ship, pt.x);
    var u = 2 * PI * Tx / p.L_WL, k_z = Math.exp(-u);
    var f_z = k_z + (1 - k_z) * clamp(zz, 0, Tx) / Tx;
    var P_m = 10 * f_z * rm.H_rm;
    var fL = p.L_WL < 60 ? 0.6 : (p.L_WL <= 80 ? 1.5 - 0.015 * p.L_WL : 0.3);
    var H_pm = Math.max(1.1 * (2 * pt.x / p.L_WL - 1) * Math.sqrt(L), fL * Math.sqrt(L));
    var P_p = 10 * H_pm;
    var P_w = Math.max(P_m, P_p);
    var H_w = 2 * rm.H_rm;                                                                        /* 4.4.4 */
    var Ph = P_h(ship, pt.z, Tx);
    var P_s, where;
    if (zz <= Tx) { P_s = Ph + P_w; where = 'below waterline: P_h + P_w'; }
    else {
      var PwWL = Math.max(10 * rm.H_rm, P_p);                                                     /* P_w at the waterline (f_z = 1) */
      if (zz <= Tx + H_w) { P_s = PwWL + ((P_d || 0) - PwWL) * (zz - Tx) / H_w; where = 'waterline to T_x + H_w: P_w,WL -> P_d'; }
      else if (zz <= Tx + 1.5 * H_w) { P_s = (P_d || 0) * (1 - 0.5 * (zz - Tx - H_w) / (0.5 * H_w)); where = 'T_x + H_w to T_x + 1.5 H_w: P_d -> 0.5 P_d'; }
      else { P_s = 0.5 * (P_d || 0); where = 'above T_x + 1.5 H_w: 0.5 P_d'; }
    }
    return { P_s: P_s, P_h: Ph, P_w: P_w, P_m: P_m, P_p: P_p, H_rm: rm.H_rm, H_w: H_w, f_z: f_z, k_z: k_z, H_pm: H_pm, where: where };
  }

  /* ---- Pt 5 Ch 2 Sec 5 impact ---- */
  /* 5.1.3-5.1.4 bottom impact, displacement mode. P_w: hydrodynamic pressure at the point (floor) */
  function bottomImpactDisp(ship, pt, P_w) {
    var p = params(ship), L = p.L_WL, Lc = Math.min(L, 150);
    var Tx = Math.min(ship.T, 0.08 * L);
    var Phi = lerp([0.5 * L, 0.8 * L, 0.9 * L, L], [0, 0.18, 0.18, 0.09], pt.x);
    var slam = p.f_Hs * 1.3 * Phi * (19 - 2720 * Math.pow(Tx / L, 2)) * Math.sqrt(L) * (ship.V || 0);
    var H_pm = pt.x / L < 0.5 ? 0 : Math.max(1.1 * (2 * pt.x / L - 1) * Math.sqrt(Lc), 0.3 * Math.sqrt(Lc));
    var pitch = 10 * p.f_Hs * H_pm;
    var P_dh = Math.max(slam, pitch, P_w || 0);
    /* 5.1.3: at 0.8-0.9 L need not exceed P_f at FP */
    var PfFP = p.f_f * L * Math.pow(0.8 + 0.15 * p.Gamma, 2);
    var capped = false;
    if (pt.x >= 0.8 * L && pt.x <= 0.9 * L && P_dh > PfFP) { P_dh = PfFP; capped = true; }
    return { P_dh: P_dh, slam: slam, pitch: pitch, Phi_dh: Phi, H_pm: H_pm, T_x: Tx, PfFP: PfFP, capped: capped, governing: capped ? 'P_f at FP (cap)' : (P_dh === slam ? 'slamming 5.1.3' : (P_dh === pitch ? 'pitching 5.1.4' : 'P_w floor')) };
  }
  /* 5.1.5 side impact: ratio tan(40 - theta_B) / tan(theta_S - 40) with both angles' terms >= 10 deg;
     P_dhs = P_dh * ratio at the waterline (<= P_dh), 0.4 x at the weather deck; linear between */
  function sideImpactRatio(theta_B, theta_S) {
    var a = Math.max(40 - (theta_B || 0), 10), b = Math.max((theta_S || 90) - 40, 10);
    return Math.min(tan(a) / tan(b), 1.0);
  }
  function sideImpactDisp(ship, pt, P_dh, theta_B, theta_S, z_deck, T_x) {
    var p = params(ship), Tx = T_x || ship.T, zwl = p.z_k + Tx, zd = z_deck || ship.D;
    var r = sideImpactRatio(theta_B, theta_S);
    var Pwl = Math.min(P_dh * r, P_dh), Pdk = Math.min(0.4 * P_dh * r, 0.4 * P_dh);
    var f = zd > zwl ? clamp((pt.z - zwl) / (zd - zwl), 0, 1) : 0;
    return { P_dhs: Pwl + (Pdk - Pwl) * f, ratio: r, P_wl: Pwl, P_deck: Pdk, f: f };
  }
  /* 5.4.1 forebody impact at the waterline, displacement mode; P_dh at 0.9 L, P_m (= P_w,WL) at 0.75 L */
  function forebodyDisp(ship, x, P_dh09, P_m075) {
    var p = params(ship), L = p.L_WL;
    var PfFP = p.f_f * L * Math.pow(0.8 + 0.15 * p.Gamma, 2);
    return { P_f: x < 0.75 * L ? 0 : lerp([0.75 * L, 0.9 * L, L], [P_m075 || 0, P_dh09 || 0, PfFP], x), PfFP: PfFP, f_f: p.f_f };
  }
  /* 5.2.2-5.2.3 non-displacement impact. G_o: support girth at LCG (m); continuous: craft in continuous contact with water */
  function impactNonDisp(ship, pt, a_v, theta_B, theta_S, G_o, continuous) {
    var p = params(ship), L = p.L_WL;
    var Phi = continuous === false ? 1.0 : lerp([0, 0.5 * L, 0.75 * L, L], [0.5, 1.0, 1.0, 0.5], pt.x);
    var P_dlb = 54 * (ship.disp || 0) * Phi * (1 + a_v) / (L * (G_o || ship.B));
    var r = sideImpactRatio(theta_B, theta_S);
    return { P_dlb: P_dlb, P_dls: Math.min(P_dlb * r, P_dlb), Phi: Phi, ratio: r, f_d: 54 };
  }
  /* 5.5.1 forebody impact, non-displacement */
  function forebodyNonDisp(ship, x, P_dls, P_m) {
    var p = params(ship), L = p.L_WL;
    var PfFP = Math.max(P_dls || 0, p.f_f * L * Math.pow(0.8 + 0.15 * p.Gamma, 2));
    var P_f = x < 0.5 * L ? 0 : lerp([0.5 * L, 0.75 * L, L], [P_m || 0, P_dls || 0, PfFP], x);
    return { P_f: P_f, PfFP: PfFP, f_f: p.f_f };
  }

  /* ---- Pt 5 Ch 2 Sec 7 ---- */
  /* 7.1.1 C_1 for deckhouse / superstructure plating by position */
  var C1 = { dhFront1: function (ship, x) { return x > 2 / 3 * ship.L ? 1.25 : 1.15; }, dhFrontUp: function () { return 1.0; }, sside: function (ship, x, stepped) { return stepped ? 0.64 : 0.8; }, dhOther: function () { return 0.5; } };
  function deckhousePressure(ship, key, x, P_d, stepped) {
    var fn = C1[key] || C1.dhOther, c = fn(ship, x, stepped);
    return { P_dhp: c * P_d, C_1: c };
  }
  /* 7.2.1 bulkhead pressure from the load head h_b (m) */
  function bulkheadPressure(kind, h_b) { return (kind === 'deepTank' || kind === 'wtDoor') ? 11.2 * (h_b || 0) : 7.2 * (h_b || 0); }
  /* 7.4.1 cargo deck pressure */
  function cargoDeck(ship, W, a_z_over_g, a_x_nd) {
    return params(ship).mode === 'nondisp' ? W * (1 + 0.5 * Math.max(a_x_nd || 0, 1.0)) : W * (1 + Math.max(a_z_over_g || 0, 0.5));
  }

  /* ---- design pressures for a position (Tab 3.3.1 / 4.3.1) ----
     pos: position key of position.js; opt: {B_x, T_x, theta_B, theta_S, z_deck, h_b, W_cdp, sheltered, ssAft,
     interior, stepped, G_o, continuous}. Every set: {set, load: 'hyd'|'imp'|'deck'|'bhd'|'cargo', P (plating),
     P_sec, P_pri, min (kN/m^2 floor for plating), kase, detail} */
  function designPressures(ship, pt, pos, opt) {
    opt = opt || {};
    var p = params(ship), nd = p.mode === 'nondisp', w = p.omega, out = [];
    var kind = posKind(pos);
    var Bx = opt.B_x || ship.B, Tx = opt.T_x || ship.T;
    var D = DELTA;
    var push = function (set, load, P, min, kase, detail, base) {
      var Pp = Math.max(P, 0);
      out.push({ set: set, load: load, P: Math.max(Pp, min || 0), P_sec: Math.max(Pp * D.secondary + (base || 0) * (1 - D.secondary), min || 0), P_pri: Math.max(Pp * D.primary + (base || 0) * (1 - D.primary), min || 0),
                 min: min || 0, kase: kase || '-', detail: detail, scenario: nd ? 'Non-displacement' : 'Displacement', AC: '-' });
    };
    var fac = nd ? p.H_f * w : w;                          /* delta_f applied per member above */
    if (kind === 'bottom' || kind === 'side') {
      if (!nd) {
        var hd = hydroDisp(ship, pt, kind, Bx, Tx), Ph = P_h(ship, pt.z, Tx);
        push('HYD', 'hyd', w * (Ph + hd.P_W), 0, hd.where, { P_h: Ph, P_W: hd.P_W, P_WL: hd.P_WL, h_w: hd.h_w, theta: hd.theta, phi: hd.phi, L_f: hd.L_f, f_Hs: hd.f_Hs, f: hd.f });
        var bi = bottomImpactDisp(ship, pt, hd.P_W);
        if (kind === 'bottom') {
          var hd09 = hydroDisp(ship, { x: 0.9 * p.L_WL, y: 0, z: 0 }, 'bottom', Bx, Tx), bi09 = bottomImpactDisp(ship, { x: 0.9 * p.L_WL, y: 0, z: 0 }, hd09.P_W);
          var hdWL075 = hydroDisp(ship, { x: 0.75 * p.L_WL, y: Bx / 2, z: p.z_k + Tx }, 'side', Bx, Tx);
          var fb = forebodyDisp(ship, pt.x, bi09.P_dh, hdWL075.P_WL);
          var Pimp = Math.max(bi.P_dh, fb.P_f);
          push('IMP', 'imp', w * Pimp, 0, Pimp === bi.P_dh ? 'P_dh · ' + bi.governing : 'P_f forebody 5.4.1', { P_dh: bi.P_dh, P_f: fb.P_f, slam: bi.slam, pitch: bi.pitch, Phi_dh: bi.Phi_dh, PfFP: fb.PfFP });
        } else {
          var si = sideImpactDisp(ship, pt, bi.P_dh, opt.theta_B, opt.theta_S, opt.z_deck, Tx);
          push('IMP', 'imp', w * si.P_dhs, 0, 'P_dhs 5.1.5 · ratio ' + si.ratio.toFixed(3), { P_dh: bi.P_dh, P_dhs: si.P_dhs, P_wl: si.P_wl, P_deck: si.P_deck, ratio: si.ratio });
        }
      } else {
        var dk = deckNonDisp(ship, pt, {}), hn = hydroNonDisp(ship, pt, Tx, dk.P_wl);
        push('HYD', 'hyd', p.H_f * w * hn.P_s, 0, hn.where, hn);
        var an = accelNonDisp(ship, pt.x), im = impactNonDisp(ship, pt, an.a_v, opt.theta_B, opt.theta_S, opt.G_o, opt.continuous);
        var fbn = forebodyNonDisp(ship, pt.x, im.P_dls, hn.P_m);
        var Pi1 = p.H_f * w * p.C_f * (kind === 'bottom' ? im.P_dlb : im.P_dls), Pi2 = p.H_f * w * p.G_f * p.C_f * fbn.P_f;
        push('IMP', 'imp', Math.max(Pi1, Pi2), 0, Pi1 >= Pi2 ? (kind === 'bottom' ? 'P_dlb 5.2.2' : 'P_dls 5.2.3') : 'P_f 5.5.1', { P_dlb: im.P_dlb, P_dls: im.P_dls, P_f: fbn.P_f, a_v: an.a_v, Phi: im.Phi });
      }
    }
    if (kind === 'weatherDeck' || kind === 'ssDeck' || kind === 'coachroof' || kind === 'interior') {
      var interior = kind === 'interior';
      var min = kind === 'weatherDeck' ? 7.0 : kind === 'ssDeck' ? 2.26 : kind === 'coachroof' ? (opt.crowd ? 5.0 : 2.5) : (nd ? 3.5 : (opt.interiorMin || 2.5));
      if (!nd) {
        if (interior) push('CARGO', 'cargo', cargoDeck(ship, opt.W_cdp || 0, opt.a_z_g), min, 'P_cd 7.4.1', {});
        else if (kind === 'coachroof') { var hc = hydroDisp(ship, { x: pt.x, y: Bx / 2, z: pt.z }, 'side', Bx, Tx); push('HYD', 'deck', w * hc.P_W, min, 'P_w at the coachroof height', hc); }
        else { var dd = deckDisp(ship, pt, { sheltered: opt.sheltered, ssAft: kind === 'ssDeck' && opt.ssAft, B_x: Bx }); push('DECK', 'deck', w * dd.P_wh, min, dd.P_wh === dd.P_dmin ? 'P_d-min 4.6.2' : 'P_w,d at deck edge', dd); }
        if (!interior && opt.W_cdp) push('CARGO', 'cargo', cargoDeck(ship, opt.W_cdp, opt.a_z_g), min, 'P_cd 7.4.1 (note 2)', {});
      } else {
        var dn = deckNonDisp(ship, pt, { interior: interior, sheltered: opt.sheltered, ssAft: kind === 'ssDeck' && opt.ssAft });
        push('DECK', 'deck', p.H_f * w * Math.max(p.G_f, 1.0) * p.C_f * dn.P_wl, min, 'P_wl 4.6.3 · f_L ' + dn.f_L + ' · a_v ' + dn.a_v.toFixed(2), dn);
        if (opt.W_cdp) push('CARGO', 'cargo', cargoDeck(ship, opt.W_cdp, 0, accelNonDisp(ship, pt.x).a_x), min, 'P_cd 7.4.1', {});
      }
    }
    if (kind === 'deckhouse') {
      var Pd = nd ? deckNonDisp(ship, pt, {}).P_wl : deckDisp(ship, pt, { B_x: Bx, z_deck: opt.z_deck }).P_wh;
      var dh = deckhousePressure(ship, pos, pt.x, Pd, opt.stepped);
      push('DHP', 'deck', (nd ? p.H_f * w * Math.max(p.G_f, 1.0) * p.C_f : w) * dh.P_dhp, 0, 'C_1 ' + dh.C_1 + ' × P_d ' + Pd.toFixed(2), { P_d: Pd, C_1: dh.C_1 });
    }
    if (kind === 'innerBottom') {
      var Tmin = 10 * ship.T;
      if (!nd) { var hi = hydroDisp(ship, pt, 'bottom', Bx, Tx), Phi = P_h(ship, pt.z, Tx); push('HYD', 'hyd', Phi + w * hi.P_W, Tmin, 'P_h + δ_f ω P_w', { P_h: Phi, P_W: hi.P_W }, Phi); }
      else { var hni = hydroNonDisp(ship, pt, Tx, 0); push('HYD', 'hyd', p.H_f * w * hni.P_m + hni.P_h, Tmin, 'δ_f (H_f ω P_m + P_h)', hni); }
    }
    if (kind === 'wtBhd' || kind === 'deepTank') {
      var Pb = bulkheadPressure(kind, opt.h_b);
      out.push({ set: 'BHD', load: 'bhd', P: Pb, P_sec: Pb, P_pri: Pb, min: 0, kase: (kind === 'deepTank' ? '11.2' : '7.2') + ' × h_b ' + (opt.h_b || 0), detail: { h_b: opt.h_b }, scenario: 'Static', AC: '-' });
    }
    return out;
  }
  /* position key -> rule row */
  function posKind(pos) {
    if (/^(keel|bottom|bilge)$/.test(pos)) return 'bottom';
    if (/^(side|sternShell)$/.test(pos)) return 'side';
    if (/^(strengthDeck|weatherDeck)$/.test(pos)) return 'weatherDeck';
    if (pos === 'ssDeck') return 'ssDeck';
    if (pos === 'coachroof') return 'coachroof';
    if (/^(otherDeck|nonStrengthDeck|accDeck)$/.test(pos)) return 'interior';
    if (/^(sside|dhFront1|dhFrontUp|dhOther)$/.test(pos)) return 'deckhouse';
    if (/^(innerBottom|innerBottomHold)$/.test(pos)) return 'innerBottom';
    if (/^(wtBhd|peakBhd)$/.test(pos)) return 'wtBhd';
    if (/^(longBhd|tankBhd|tankDeck)$/.test(pos)) return 'deepTank';
    return 'none';
  }

  var api = { HS_MIN: HS_MIN, HS_MAX: HS_MAX, GF: GF, OMEGA: OMEGA, OMEGA_LABEL: OMEGA_LABEL, HF: HF, CF: CF, DELTA: DELTA, waveCoef: waveCoef, params: params,
              relativeMotion: relativeMotion, accelNonDisp: accelNonDisp, motionsDisp: motionsDisp, accelDisp: accelDisp, P_h: P_h, hydroDisp: hydroDisp, deckDisp: deckDisp, deckNonDisp: deckNonDisp, f_L: f_L,
              hydroNonDisp: hydroNonDisp, bottomImpactDisp: bottomImpactDisp, sideImpactRatio: sideImpactRatio, sideImpactDisp: sideImpactDisp, forebodyDisp: forebodyDisp, impactNonDisp: impactNonDisp, forebodyNonDisp: forebodyNonDisp,
              deckhousePressure: deckhousePressure, bulkheadPressure: bulkheadPressure, cargoDeck: cargoDeck, designPressures: designPressures, posKind: posKind, lerp: lerp };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LRSSCLoads = api;
})(typeof window !== 'undefined' ? window : this);
