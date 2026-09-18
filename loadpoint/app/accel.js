/* LoadPoint - DNV RU-SHIP Pt 3 Ch 4 Sec 3 ship motions / accelerations and
   Ch 4 Sec 2 load combination factors (strength assessment).
   Pure functions; runs in the page and under node (tests/).

   Sec 3 Symbols:  a_0 = (1.58 - 0.47 C_B)(2.4/sqrt(L) + 34/L - 600/L^2)
                   R   = min(D/4 + T_LC/2, D/2)
   [2.1.1] T_theta = 2.3 pi k_r / sqrt(g GM);  theta = 9000(1.4 - 0.035 T_theta) f_p f_BK / ((1.15 B + 55) pi)
   [2.1.2] lambda_phi = 0.6(1 + f_T) L;  T_phi = sqrt(2 pi lambda_phi / g);  phi = 920 f_p L^-0.84 {1 + (2.57/sqrt(gL))^1.2} <= 20
   [2.2]   a_surge, a_sway, a_heave, a_roll, a_pitch (heave/pitch have L < 100 / 100..150 / >= 150 branches, v = 0/5 kt)
   [3.2]   a_X = f_beta[-C_XG g sin phi + C_XS a_surge + C_XP a_pitch (z - R)]
           a_Y = f_beta[ C_YG g sin theta + C_YS a_sway - C_YR a_roll (z - R)]
           a_Z = f_beta[ C_ZH a_heave + C_ZR a_roll y - C_ZP a_pitch (x - 0.45 L)]
   [3.3]   envelopes a_x-env, a_y-env, a_z-env (+ -pitch, -roll variants)
   Sec 2 Tables 4-6: LCFs as functions of f_T (and L_1 = min(L, 250), f_lp). */
(function (root) {
  'use strict';
  var g = 9.81, d2r = Math.PI / 180;
  var F_R = { R0: 1.0, R1: 0.9, R2: 0.8, R3: 0.7, R4: 0.6, RE: 0.5 };

  /* ship: {L, B, D, T_SC, C_B, GM?, k_r?, bilgeKeel?, service?, tanker?}
     opt:  {T_LC?, bwe?}  -> motion amplitudes and CoG accelerations (strength assessment) */
  function motions(ship, opt) {
    opt = opt || {};
    var L = ship.L, B = ship.B, C_B = ship.C_B, T_SC = ship.T_SC;
    var T_LC = opt.T_LC || T_SC;
    var f_r = F_R[ship.service || 'R0'] || 1.0;
    var f_ps = (opt.bwe ? 0.8 : 1.0) * f_r, f_p = f_ps;
    var f_T = Math.min(Math.max(T_LC / T_SC, 0.5), 1.0);
    /* GM and k_r of the considered loading condition. Ch 4 Sec 3 [2.1.1] gives only the general
       defaults 0.07 B / 0.39 B (tankers 0.12 B, 0.35 B in ballast); for the ballast draught Nauticus
       applies the normal-ballast values of Pt 5 Ch 1 Sec 2 Tab 4, GM 0.33 B and k_r 0.45 B, and the
       tool follows that so both agree. Ship inputs GM / k_r (loaded) and GM_BAL / k_r_BAL override. */
    var ballast = !!opt.ballast || (T_LC < T_SC - 1e-9);
    var GM = ballast ? (ship.GM_BAL || 0.33 * B) : (ship.GM || (ship.tanker ? 0.12 : 0.07) * B);
    var k_r = ballast ? (ship.k_r_BAL || (ship.tanker ? 0.35 : 0.45) * B) : (ship.k_r || 0.39 * B);
    GM = Math.max(GM, 0.05 * B);
    var f_BK = ship.bilgeKeel === false ? 1.2 : 1.0;
    var v = L < 100 ? 0 : (L >= 150 ? 5 : 5 * (L - 100) / 50);
    var a0 = (1.58 - 0.47 * C_B) * (2.4 / Math.sqrt(L) + 34 / L - 600 / (L * L));
    var sgl = Math.sqrt(g * L);
    var R = Math.min(ship.D / 4 + T_LC / 2, ship.D / 2);

    var T_th = 2.3 * Math.PI * k_r / Math.sqrt(g * GM);
    var theta1 = 9000 * (1.4 - 0.035 * T_th) * 1.0 * f_BK / ((1.15 * B + 55) * Math.PI);   /* f_p = 1 */
    var theta = theta1 * f_p;
    var lam_phi = 0.6 * (1 + f_T) * L;
    var T_ph = Math.sqrt(2 * Math.PI * lam_phi / g);
    var phiCap = 20 * (f_r < 1 ? f_r : 1);
    var phi1 = Math.min(920 * 1.0 * Math.pow(L, -0.84) * (1 + Math.pow(2.57 / sgl, 1.2)), phiCap);
    var phi = Math.min(phi1 * f_p, phiCap);

    var a_surge = 0.2 * (1.6 + 1.5 / sgl) * f_p * a0 * g;
    var a_sway = 0.3 * (2.25 - 20 / sgl) * f_p * a0 * g;
    var a_roll = f_p * theta1 * d2r * Math.pow(2 * Math.PI / T_th, 2);
    var kh = 1.15 - 6.5 / sgl, kp = 1.75 - 22 / sgl, pitchTerm = phi1 * d2r * Math.pow(2 * Math.PI / T_ph, 2);
    var a_heave, a_pitch;
    if (L < 100) {
      a_heave = 0.8 * (1 + 0.03 * v) * (0.72 + 2 * L / 700) * kh * f_p * a0 * g;
      a_pitch = 0.8 * (1 + 0.05 * v) * f_p * (0.72 + 2 * L / 700) * kp * pitchTerm;
    } else if (L < 150) {
      a_heave = (0.4 + L / 250) * (1 + 0.03 * v * (3 - L / 50)) * kh * f_p * a0 * g;
      a_pitch = (0.4 + L / 250) * (1 + 0.05 * v * (3 - L / 50)) * f_p * kp * pitchTerm;
    } else {
      a_heave = kh * f_p * a0 * g;
      a_pitch = f_p * kp * pitchTerm;
    }
    return { L: L, B: B, D: ship.D, C_B: C_B, T_SC: T_SC, T_LC: T_LC, f_T: f_T, f_r: f_r, f_ps: f_ps, GM: GM, k_r: k_r, f_BK: f_BK, v: v, ballast: ballast,
             a0: a0, R: R, T_theta: T_th, theta: theta, T_phi: T_ph, lambda_phi: lam_phi, phi: phi,
             a_surge: a_surge, a_sway: a_sway, a_heave: a_heave, a_roll: a_roll, a_pitch: a_pitch, bwe: !!opt.bwe };
  }

  /* Sec 2 Tables 4-6. Each case: {XS, XP, XG, YS, YR, YG, ZH, ZR, ZP, WV, QW, WH} as functions of f_T.
     f_beta: 0.8 for BSR/BSP (extreme sea loads), 1.0 otherwise (Sec 3 Symbols). */
  function lcf(m) {
    var f = m.f_T, L1 = Math.min(m.L, 250);
    var T = {};
    T['HSM-1'] = { XS: 0.6 - 0.2 * f, XP: -0.15 - L1 / 300, XG: 0.6, YS: 0, YR: 0, YG: 0, ZH: 0.5 * f - 0.15, ZR: 0, ZP: -0.7, WV: -1, WH: 0 };
    T['HSM-2'] = { XS: 0.2 * f - 0.6, XP: 0.15 + L1 / 300, XG: -0.6, YS: 0, YR: 0, YG: 0, ZH: 0.15 - 0.5 * f, ZR: 0, ZP: 0.7, WV: 1, WH: 0 };
    T['HSA-1'] = { XS: 0.2, XP: -1.0, XG: 0.4 * f + 0.1, YS: 0, YR: 0, YG: 0, ZH: 0.4, ZR: 0, ZP: -1.0, WV: -0.7, WH: 0 };
    T['HSA-2'] = { XS: -0.2, XP: 1.0, XG: -0.4 * f - 0.1, YS: 0, YR: 0, YG: 0, ZH: -0.4, ZR: 0, ZP: 1.0, WV: 0.7, WH: 0 };
    T['FSM-1'] = { XS: 0.2 - 0.4 * f, XP: 0.15, XG: -0.2, YS: 0, YR: 0, YG: 0, ZH: 0, ZR: 0, ZP: 0.15, WV: -0.4 * f - 0.6, WH: 0 };
    T['FSM-2'] = { XS: 0.4 * f - 0.2, XP: -0.15, XG: 0.2, YS: 0, YR: 0, YG: 0, ZH: 0, ZR: 0, ZP: -0.15, WV: 0.4 * f + 0.6, WH: 0 };
    T['BSR-1P'] = { XS: 0, XP: 0, XG: 0, YS: 0.2 - 0.2 * f, YR: 1, YG: -1, ZH: 0.7 - 0.4 * f, ZR: 1, ZP: 0, WV: 0.1 - 0.2 * f, WH: 1.2 - 1.1 * f };
    T['BSR-2P'] = { XS: 0, XP: 0, XG: 0, YS: 0.2 * f - 0.2, YR: -1, YG: 1, ZH: 0.4 * f - 0.7, ZR: -1, ZP: 0, WV: 0.2 * f - 0.1, WH: 1.1 * f - 1.2 };
    T['BSR-1S'] = { XS: 0, XP: 0, XG: 0, YS: 0.2 * f - 0.2, YR: -1, YG: 1, ZH: 0.7 - 0.4 * f, ZR: -1, ZP: 0, WV: 0.1 - 0.2 * f, WH: 1.1 * f - 1.2 };
    T['BSR-2S'] = { XS: 0, XP: 0, XG: 0, YS: 0.2 - 0.2 * f, YR: 1, YG: -1, ZH: 0.4 * f - 0.7, ZR: 1, ZP: 0, WV: 0.2 * f - 0.1, WH: 1.2 - 1.1 * f };
    T['BSP-1P'] = { XS: 0, XP: 0.1 - 0.3 * f, XG: 0.3 * f - 0.1, YS: -0.9, YR: 0.3, YG: -0.2, ZH: 1, ZR: 0.3, ZP: 0.1 - 0.3 * f, WV: 0.3 - 0.8 * f, WH: 0.7 - 0.7 * f };
    T['BSP-2P'] = { XS: 0, XP: 0.3 * f - 0.1, XG: 0.1 - 0.3 * f, YS: 0.9, YR: -0.3, YG: 0.2, ZH: -1, ZR: -0.3, ZP: 0.3 * f - 0.1, WV: 0.8 * f - 0.3, WH: 0.7 * f - 0.7 };
    T['BSP-1S'] = { XS: 0, XP: 0.1 - 0.3 * f, XG: 0.3 * f - 0.1, YS: 0.9, YR: -0.3, YG: 0.2, ZH: 1, ZR: -0.3, ZP: 0.1 - 0.3 * f, WV: 0.3 - 0.8 * f, WH: 0.7 * f - 0.7 };
    T['BSP-2S'] = { XS: 0, XP: 0.3 * f - 0.1, XG: 0.1 - 0.3 * f, YS: -0.9, YR: 0.3, YG: -0.2, ZH: -1, ZR: 0.3, ZP: 0.3 * f - 0.1, WV: 0.8 * f - 0.3, WH: 0.7 - 0.7 * f };
    T['OST-1P'] = { XS: 0.1 * f - 0.15, XP: 0.7 - 0.3 * f, XG: 0.2 * f - 0.45, YS: 0, YR: 0.4 * f - 0.25, YG: 0.1 - 0.2 * f, ZH: 0.2 * f - 0.05, ZR: 0.4 * f - 0.25, ZP: 0.7 - 0.3 * f, WV: -0.3 - 0.2 * f, WH: -1 };
    T['OST-2P'] = { XS: 0.15 - 0.1 * f, XP: 0.3 * f - 0.7, XG: 0.45 - 0.2 * f, YS: 0, YR: 0.25 - 0.4 * f, YG: 0.2 * f - 0.1, ZH: 0.05 - 0.2 * f, ZR: 0.25 - 0.4 * f, ZP: 0.3 * f - 0.7, WV: 0.3 + 0.2 * f, WH: 1 };
    T['OST-1S'] = { XS: 0.1 * f - 0.15, XP: 0.7 - 0.3 * f, XG: 0.2 * f - 0.45, YS: 0, YR: 0.25 - 0.4 * f, YG: 0.2 * f - 0.1, ZH: 0.2 * f - 0.05, ZR: 0.25 - 0.4 * f, ZP: 0.7 - 0.3 * f, WV: -0.3 - 0.2 * f, WH: 1 };
    T['OST-2S'] = { XS: 0.15 - 0.1 * f, XP: 0.3 * f - 0.7, XG: 0.45 - 0.2 * f, YS: 0, YR: 0.4 * f - 0.25, YG: 0.1 - 0.2 * f, ZH: 0.05 - 0.2 * f, ZR: 0.4 * f - 0.25, ZP: 0.3 * f - 0.7, WV: 0.3 + 0.2 * f, WH: -1 };
    T['OSA-1P'] = { XS: -0.45, XP: 0.5, XG: -0.8, YS: -0.2 - 0.1 * f, YR: 0.3 - 0.2 * f, YG: 0.1 * f - 0.2, ZH: -0.2 * f, ZR: 0.3 - 0.2 * f, ZP: 1.0, WV: 0.75 - 0.5 * f, WH: 0.55 + 0.2 * f };
    T['OSA-2P'] = { XS: 0.45, XP: -0.5, XG: 0.8, YS: 0.2 + 0.1 * f, YR: 0.2 * f - 0.3, YG: 0.2 - 0.1 * f, ZH: 0.2 * f, ZR: 0.2 * f - 0.3, ZP: -1.0, WV: -0.75 + 0.5 * f, WH: -0.55 - 0.2 * f };
    T['OSA-1S'] = { XS: -0.45, XP: 0.5, XG: -0.8, YS: 0.2 + 0.1 * f, YR: 0.2 * f - 0.3, YG: 0.2 - 0.1 * f, ZH: -0.2 * f, ZR: 0.2 * f - 0.3, ZP: 1.0, WV: 0.75 - 0.5 * f, WH: -0.55 - 0.2 * f };
    T['OSA-2S'] = { XS: 0.45, XP: -0.5, XG: 0.8, YS: -0.2 - 0.1 * f, YR: 0.3 - 0.2 * f, YG: 0.1 * f - 0.2, ZH: 0.2 * f, ZR: 0.3 - 0.2 * f, ZP: -1.0, WV: -0.75 + 0.5 * f, WH: 0.55 + 0.2 * f };
    Object.keys(T).forEach(function (k) { T[k].f_beta = (/^BS/.test(k) && !m.bwe) ? 0.8 : 1.0; });
    return T;
  }
  var CASES = ['HSM-1', 'HSM-2', 'HSA-1', 'HSA-2', 'FSM-1', 'FSM-2', 'BSR-1P', 'BSR-2P', 'BSR-1S', 'BSR-2S',
               'BSP-1P', 'BSP-2P', 'BSP-1S', 'BSP-2S', 'OST-1P', 'OST-2P', 'OST-1S', 'OST-2S', 'OSA-1P', 'OSA-2P', 'OSA-1S', 'OSA-2S'];

  /* [3.2] accelerations at (x, y, z) for every dynamic load case */
  function caseAccelerations(m, x, y, z) {
    var T = lcf(m), out = {};
    var sphi = Math.sin(m.phi * d2r), sth = Math.sin(m.theta * d2r);
    CASES.forEach(function (k) {
      var c = T[k], fb = c.f_beta;
      out[k] = {
        aX: fb * (-c.XG * g * sphi + c.XS * m.a_surge + c.XP * m.a_pitch * (z - m.R)),
        aY: fb * (c.YG * g * sth + c.YS * m.a_sway - c.YR * m.a_roll * (z - m.R)),
        aZ: fb * (c.ZH * m.a_heave + c.ZR * m.a_roll * y - c.ZP * m.a_pitch * (x - 0.45 * m.L)),
        lcf: c
      };
    });
    return out;
  }

  /* [3.3] envelope accelerations at (x, y, z) */
  function envelope(m, x, y, z) {
    var L = m.L, L0 = Math.max(L, 110);
    var f_L = L < 90 ? 1 : (L < 150 ? 1.3 - L / 300 : 0.8);
    var a_pitch_x = m.a_pitch * (z - m.R);
    var a_x = 0.7 * f_L * (0.65 + 2 * z / (7 * m.T_SC)) * Math.sqrt(m.a_surge * m.a_surge + L0 / 325 * Math.pow(g * Math.sin(m.phi * d2r) + a_pitch_x, 2));
    var a_roll_y = m.a_roll * (z - m.R);
    var a_y = (1 - Math.exp(-m.B * L / (215 * m.GM))) * Math.sqrt(m.a_sway * m.a_sway + Math.pow(g * Math.sin(m.theta * d2r) + a_roll_y, 2));
    var a_pitch_z = m.a_pitch * (1.08 * x - 0.45 * L);
    var a_roll_z = m.a_roll * y;
    var kp = (0.95 + Math.exp(-L / 15)) * a_pitch_z, kr = 1.2 * a_roll_z;
    return {
      a_x_env: a_x, a_y_env: a_y,
      a_z_env: Math.sqrt(m.a_heave * m.a_heave + kp * kp + kr * kr),
      a_z_env_pitch: Math.sqrt(m.a_heave * m.a_heave + kp * kp),
      a_z_env_roll: Math.sqrt(m.a_heave * m.a_heave + kr * kr),
      a_pitch_x: a_pitch_x, a_roll_y: a_roll_y, a_pitch_z: a_pitch_z, a_roll_z: a_roll_z, f_L: f_L
    };
  }

  var api = { motions: motions, lcf: lcf, caseAccelerations: caseAccelerations, envelope: envelope, CASES: CASES, g: g };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoadPointAccel = api;
})(typeof window !== 'undefined' ? window : this);
