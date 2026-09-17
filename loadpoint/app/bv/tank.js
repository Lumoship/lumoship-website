/* LoadPoint - BV NR467 Pt B Ch 5 Sec 6 internal loads, Ch 5 Sec 5 [3] green sea. Same API shape as tank.js.

   [1.2.1] P_ls = rho_L g (z_top - z) + P_pv                      (sea and harbour)
   [1.2.3] P_ls = rho_L g (z_top - z + h_OF) + P_drop             (flow-through ballast water exchange, P_drop >= 25 unless overflow area > 2 x pipe)
   [1.3.1] P_ld = rho_L [a_X (x_0 - x) + a_Y (y_0 - y) + a_Z (z_0 - z)], reference point = tank-top point with max V_j
   [10]    P_ST Tab 16: max of 10 (z_top - z + h_OF), 10 (z_top - z + 2.4), 10 (z_bd - z) [double bottom / side tanks];
           fuel oil adds 10 (z_top - z + 0.1 P_pv); cargo oil without z_bd
   [1.4]   P_fs = rho g d_FL  (to the deepest damage waterline or the bulkhead deck at side, whichever greater)
   [6.1]   P_dl = P_dl-s (1 + a_Z/g) per load case, P_dl-s >= Tab 10
   Sec 5 [3.2] P_d = max(P_W,d, chi P_W,d-min) (HVM/FVM, at the ship side y = +-B_x,max/2 at deck height);
           other EDWs: linear interpolation between the port and starboard side values; chi Tab 32 per tier; P_W,d-min Tab 33 */
(function (root) {
  'use strict';
  var Sea = root.BVSea || require('./sea');
  var g = 9.81, rho = 1.025;

  function staticPressures(tank, pt, L) {
    var rho_L = tank.rho_L || 1.025, dz = tank.z_top - pt.z, P_pv = tank.P_pv || 0;
    var P_drop = tank.overflowLarge ? 0 : Math.max(tank.P_drop || 0, 25);
    var h_OF = tank.h_OF !== undefined ? tank.h_OF : (tank.h_air || 0);
    var st = [10 * (dz + h_OF), 10 * (dz + 2.4)];
    if (tank.kind !== 'cargo' && tank.z_bd) st.push(10 * (tank.z_bd - pt.z));
    if (tank.kind === 'fuel' || tank.kind === 'cargo') st.push(10 * (dz + 0.1 * P_pv));
    var P_ST = Math.max.apply(null, st);
    return {
      P_ls1: Math.max(rho_L * g * dz + P_pv, 0),                       /* sea */
      P_ls2: Math.max(rho_L * g * (dz + h_OF) + P_drop, 0),            /* flow-through BWE */
      P_ls3: Math.max(rho_L * g * dz + P_pv, 0),                       /* harbour: same as sea in BV */
      P_ls4: null,
      P_lsST: Math.max(P_ST, 0), z_ST: null, P_0: 0, rho_L: rho_L, P_drop: P_drop, h_OF: h_OF
    };
  }

  function dynamicPressure(tank, pt, acc) {
    var rho_L = tank.rho_L || 1.025;
    var xs = [tank.x_top - 0.5 * tank.l_fs, tank.x_top + 0.5 * tank.l_fs], ys = [tank.y_top - 0.5 * tank.b_top, tank.y_top + 0.5 * tank.b_top];
    var best = null;
    xs.forEach(function (xj) { ys.forEach(function (yj) {
      var V = acc.aX * (xj - tank.x_G) + acc.aY * (yj - tank.y_G) + (acc.aZ + g) * (tank.z_top - tank.z_G);
      if (!best || V > best.V) best = { V: V, x0: xj, y0: yj, z0: tank.z_top };
    }); });
    return { P_ld: rho_L * (acc.aX * (best.x0 - pt.x) + acc.aY * (best.y0 - pt.y) + acc.aZ * (best.z0 - pt.z)), ref: best };
  }

  function floodingPressure(pt, z_fd, dam) {
    var d = z_fd - pt.z;
    if (dam && dam.Z_dam !== undefined) d = Math.max(d, dam.Z_dam - pt.z);
    return Math.max(rho * g * d, 0);
  }

  /* Ch 5 Sec 5 Tab 33 */
  function pDmin(L_LL, x, typeA) {
    var r = x / L_LL;
    if (L_LL < 100) return r <= 0.75 ? 14.9 + 0.195 * L_LL : 15.8 + L_LL / 3 * (1 - 5 / 3 * (L_LL - x) / L_LL) - 3.6 * (L_LL - x) / L_LL;
    var pWP = 49.1 + (typeA ? 0.3560 : 0.0726) * (L_LL - 100);
    return r <= 0.75 ? 34.3 : 34.3 + (pWP - 34.3) / 0.25 * (r - 0.75);
  }
  var CHI = [1.00, 0.75, 0.56, 0.42, 0.32, 0.25, 0.20, 0.15, 0.10];          /* Tab 32 by tier (1 = freeboard deck / lowest tier) */
  function chiTier(tier) { return CHI[Math.min(Math.max((tier || 1) - 1, 0), 8)]; }

  /* Tab 10 minimum distributed loads, kN/m2 */
  var PDL_MIN = { publicSpace: 5.0, muster: 5.0, largeRoom: 3.0, cabin: 3.0, accommodation: 2.5, storage: 5.0, machinery: 10.0, technical: 5.0, otherDeck: 10.0, dryCargo: 10.0 };

  var api = { staticPressures: staticPressures, dynamicPressure: dynamicPressure, floodingPressure: floodingPressure, pDmin: pDmin, chiTier: chiTier, PDL_MIN: PDL_MIN, g: g, rho: rho };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BVTank = api;
})(typeof window !== 'undefined' ? window : this);
