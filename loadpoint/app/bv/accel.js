/* LoadPoint - BV NR467 Pt B Ch 5 Sec 3 motions / accelerations, Ch 5 Sec 2 Tab 8-13 load combination
   factors (strength assessment). Same API shape as the DNV accel.js.

   [2.1.1] roll: see sea.js derive()   [2.1.2] T_phi = 0.8 sqrt(L); phi = 1970 f_S f_nl H/(L C_W-LC^0.75), alpha 0.56
   [2.2]   a_surge = 115 H/(L f_TL^0.2 C_B-LC^0.6)      alpha = 0.37 / C_W-LC^0.9
           a_sway  = 115 H/(L f_TL^0.15 f_BL^0.5)       alpha = 0.24 / f_BL^0.65
           a_heave = 350 H/(L f_BL^0.5)                 alpha = 0.35 / f_TL^0.35
           a_roll  = theta (pi/180)(2 pi/T_theta)^2
           a_pitch = 6e4 (pi/180) H/(L^2 f_BL^0.5 C_W-LC^1.5)   alpha = 0.24 / f_BL^0.8
           a_yaw   = 200.4e2 (pi/180) H/(L^2 f_BL^0.73)         alpha = 1.14 / C_B-LC^0.7
           (f_S = f_nl = 1 for strength; H with f_p = f_ps)
   Symbols x_G = 0.57 C_B-LC^0.4 L;  z_G = 1.08 (T_LC/2 + B^2/(12 T_LC)) - GM
   [3.2]   a_X = -C_XG g sin(f_beta phi) + f_beta (C_XS a_surge + C_XP a_pitch (z - z_G) - C_XY a_yaw y)
           a_Y =  C_YG g sin theta + f_beta (C_YS a_sway + C_YY a_yaw (x - x_G)) - C_YR a_roll (z - z_G)
           a_Z =  f_beta (C_ZH a_heave - C_ZP a_pitch (x - x_G)) + C_ZR a_roll y */
(function (root) {
  'use strict';
  var Sea = root.BVSea || require('./sea');
  var g = 9.81, PI = Math.PI, d2r = PI / 180;

  function motions(ship, opt) {
    var d = Sea.derive(ship, opt), L = d.L, nav = d.nav, fp = d.fp;
    var H = function (alpha) { return Sea.waveH(alpha, L, fp, nav).H; };
    var m = {
      L: L, B: d.B, T_LC: d.T_LC, T_SC: d.T_SC, f_TL: d.fTL, f_BL: d.fBL, f_T: d.fT, f_ps: d.fps, GM: d.GM, k_r: d.kr, f_BK: d.fBK,
      C_B_LC: d.CB_LC, C_W_LC: d.CW_LC, T_R: d.TR, n: d.nRoll, navKey: d.navKey, bwe: d.bwe,
      T_theta: d.Ttheta, theta: d.theta, T_phi: 0.8 * Math.sqrt(L)
    };
    m.H_pitchAngle = H(0.56);
    m.phi = 1970 * 1 * 1 * m.H_pitchAngle / (L * Math.pow(d.CW_LC, 0.75));
    m.H_surge = H(0.37 / Math.pow(d.CW_LC, 0.9));
    m.a_surge = 115 * m.H_surge / (L * Math.pow(d.fTL, 0.2) * Math.pow(d.CB_LC, 0.6));
    m.H_sway = H(0.24 / Math.pow(d.fBL, 0.65));
    m.a_sway = 115 * m.H_sway / (L * Math.pow(d.fTL, 0.15) * Math.pow(d.fBL, 0.5));
    m.H_heave = H(0.35 / Math.pow(d.fTL, 0.35));
    m.a_heave = 350 * m.H_heave / (L * Math.pow(d.fBL, 0.5));
    m.a_roll = d.theta * d2r * Math.pow(2 * PI / d.Ttheta, 2);
    m.H_pitch = H(0.24 / Math.pow(d.fBL, 0.8));
    m.a_pitch = 6e4 * d2r * m.H_pitch / (L * L * Math.pow(d.fBL, 0.5) * Math.pow(d.CW_LC, 1.5));
    m.H_yaw = H(1.14 / Math.pow(d.CB_LC, 0.7));
    m.a_yaw = 200.4e2 * d2r * m.H_yaw / (L * L * Math.pow(d.fBL, 0.73));
    m.x_G = 0.57 * Math.pow(d.CB_LC, 0.4) * L;
    m.z_G = 1.08 * (d.T_LC / 2 + d.B * d.B / (12 * d.T_LC)) - d.GM;
    m.omega_R = 2 * PI / d.Ttheta;
    m.a0 = null; m.R = m.z_G;
    return m;
  }

  /* Ch 5 Sec 2 Tab 8 - Tab 13 */
  function lcf(m) {
    var f = m.f_TL, TR = m.T_R, w = m.omega_R, CB = m.C_B_LC, CW = m.C_W_LC, T = {};
    T['HVM1'] = { XS: 0.60 - 10 * f, XP: -0.38, XY: 0, XG: 0.36, YS: 0, YR: 0, YY: 0, YG: 0, ZH: 0.10 + 5.70 * f, ZR: 0, ZP: -0.38, WV: -1 };
    T['HVM2'] = { XS: 10 * f - 0.60, XP: 0.38, XY: 0, XG: -0.36, YS: 0, YR: 0, YY: 0, YG: 0, ZH: -0.10 - 5.70 * f, ZR: 0, ZP: 0.38, WV: 1 };
    T['FVM1'] = { XS: 0.32 - 7.60 * f, XP: 0, XY: 0, XG: 0, YS: 0, YR: 0, YY: 0, YG: 0, ZH: 0.10, ZR: 0, ZP: 0, WV: -1 };
    T['FVM2'] = { XS: 7.60 * f - 0.32, XP: 0, XY: 0, XG: 0, YS: 0, YR: 0, YY: 0, YG: 0, ZH: -0.10, ZR: 0, ZP: 0, WV: 1 };
    /* two sign patterns run through Tab 9-13 over the columns [1-P, 2-P, 1-S, 2-S]:
       a = (1, -1, 1, -1) for the "1 / 2" quantities, s = (1, -1, -1, 1) for the port / starboard mirrored ones */
    var br = function (s, a) { return { XS: 0, XP: 0, XY: 0, XG: 0, YS: s * (1.71 * w - 0.73), YR: s, YY: 0, YG: -s, ZH: a * (0.88 - 0.15 * TR), ZR: s, ZP: 0, WV: 0 }; };
    T['BR1-P'] = br(1, 1); T['BR2-P'] = br(-1, -1); T['BR1-S'] = br(-1, 1); T['BR2-S'] = br(1, -1);
    var bp = function (s, a) { return { XS: 0, XP: 0, XY: 0.10 * s, XG: 0, YS: s * (1.73 - 2.11 * w), YR: s * (0.39 * TR - 1.82), YY: 0.10 * s, YG: s * (1.35 - 0.27 * TR), ZH: -a, ZR: s * (0.39 * TR - 1.82), ZP: 0, WV: 0.2 * a }; };
    T['BP1-P'] = bp(1, 1); T['BP2-P'] = bp(-1, -1); T['BP1-S'] = bp(-1, 1); T['BP2-S'] = bp(1, -1);
    /* Tab 11 OHM: columns 1-P, 2-P, 1-S, 2-S; a = sign of the "P" pattern, b = sign of the mirrored pattern */
    var ohm = function (a, b) { return { XS: 0.23 * a, XP: (6 * f - 0.80) * a, XY: (0.67 - 17.50 * f) * b, XG: 0.37 * a, YS: 0.23 * b, YR: (13.3 * f - 0.80) * b, YY: (0.67 - 17.50 * f) * b, YG: (0.7 - 10.20 * f) * b, ZH: -0.17 * a, ZR: (13.3 * f - 0.80) * b, ZP: (6 * f - 0.80) * a, WV: Math.min(7.70 * f - 0.85, 0) * (a > 0 ? 1 : 0) + Math.max(0.50 - 7.70 * f, 0) * (a < 0 ? 1 : 0) }; };
    T['OHM1-P'] = ohm(1, 1); T['OHM2-P'] = ohm(-1, -1); T['OHM1-S'] = ohm(1, -1); T['OHM2-S'] = ohm(-1, 1);
    var ohs = function (a, b) { return { XS: (0.06 - 0.60 * CB) * a, XP: (1.16 * CB - 0.32) * a, XY: (7.60 * f - 0.43) * b, XG: (0.11 - 0.77 * CB) * a, YS: (1.12 * CW - 0.80) * b, YR: (11.80 * f - 0.65) * b, YY: (7.60 * f - 0.43) * b, YG: (0.60 - 10.20 * f) * b, ZH: -0.15 * a, ZR: (11.80 * f - 0.65) * b, ZP: (1.16 * CB - 0.32) * a, WV: a > 0 ? Math.min(0.41 - CW, 0) : Math.max(CW - 0.76, 0) }; };
    T['OHS1-P'] = ohs(1, 1); T['OHS2-P'] = ohs(-1, -1); T['OHS1-S'] = ohs(1, -1); T['OHS2-S'] = ohs(-1, 1);
    var ova = function (a, b) { return { XS: (8.40 * f - 0.81) * a, XP: a, XY: (0.30 + 13.3 * f) * b, XG: -0.70 * a, YS: -0.36 * b, YR: (0.50 - 1.20 * w) * b, YY: (0.30 + 13.30 * f) * b, YG: (1.20 * w - 0.50) * b, ZH: (-0.17 - 7.40 * f) * a, ZR: (0.50 - 1.20 * w) * b, ZP: a, WV: a > 0 ? Math.max(0.60 - 3.15 * f, 0) : Math.min(3.15 * f - 0.60, 0) }; };
    T['OVA1-P'] = ova(1, 1); T['OVA2-P'] = ova(-1, -1); T['OVA1-S'] = ova(1, -1); T['OVA2-S'] = ova(-1, 1);
    Object.keys(T).forEach(function (k) { T[k].f_beta = /^B[RP]/.test(k) ? 0.8 : 1.0; });
    return T;
  }
  var CASES = Sea.CASES.map(function (c) { return c.name; });

  function caseAccelerations(m, x, y, z) {
    var T = lcf(m), out = {};
    CASES.forEach(function (k) {
      var c = T[k], fb = c.f_beta;
      var ax = -c.XG * g * Math.sin(fb * m.phi * d2r) + fb * (c.XS * m.a_surge + c.XP * m.a_pitch * (z - m.z_G) - c.XY * m.a_yaw * y);
      var ay = c.YG * g * Math.sin(m.theta * d2r) + fb * (c.YS * m.a_sway + c.YY * m.a_yaw * (x - m.x_G)) - c.YR * m.a_roll * (z - m.z_G);
      var az = fb * (c.ZH * m.a_heave - c.ZP * m.a_pitch * (x - m.x_G)) + c.ZR * m.a_roll * y;
      out[k] = { aX: ax, aY: ay, aZ: az, lcf: c };
    });
    return out;
  }

  /* BV has no envelope formulae ([3.3] is guidance): the envelope is the max over the load cases */
  function envelope(m, x, y, z) {
    var ca = caseAccelerations(m, x, y, z), mx = { aX: 0, aY: 0, aZ: 0 };
    CASES.forEach(function (k) { ['aX', 'aY', 'aZ'].forEach(function (q) { if (Math.abs(ca[k][q]) > Math.abs(mx[q])) mx[q] = ca[k][q]; }); });
    return { a_x_env: Math.abs(mx.aX), a_y_env: Math.abs(mx.aY), a_z_env: Math.abs(mx.aZ), a_z_env_pitch: Math.abs(mx.aZ), a_z_env_roll: Math.abs(mx.aZ), fromCases: true };
  }

  var api = { motions: motions, lcf: lcf, caseAccelerations: caseAccelerations, envelope: envelope, CASES: CASES, g: g };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BVAccel = api;
})(typeof window !== 'undefined' ? window : this);
