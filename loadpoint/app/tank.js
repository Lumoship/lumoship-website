/* LoadPoint - DNV RU-SHIP Pt 3 Ch 4 Sec 6 internal loads (tanks, deck loads) and
   Ch 4 Sec 5 [2.2]-[2.3] exposed deck loads. Pure functions.

   [1.2.1] P_ls-1 = f_cd rho_L g (z_top - z) + P_PV          (sea, S)
   [1.2.2] P_ls-2 = rho_L g (z_top - z + h_drop) + P_drop-1   (ballast water exchange, P_drop-1 >= 25)
   [1.2.3] P_ls-3 = rho_L g (z_top - z) + P_0                 (harbour; P_0 = 25 for L >= 100, 0.3L - 5, 10)
   [1.2.4] P_ls-4 = rho_L g (z_top - z + h_air) + P_drop-2    (overfilling, P_drop-2 = 25 ballast/fresh water)
   [1.2.5] P_ls-ST = 10 (z_ST - z),  z_ST = max(z_top + h_air, z_top + 2.4 [, z_bd])
   [1.2.7] P_fs = rho g h_fs                                 (flooding)
   [1.3.1] P_ld = f_cd rho_L [a_Z (z_0 - z) + f_ull-l a_X (x_0 - x) + f_ull-t a_Y (y_0 - y)]
           reference point (x_0, y_0, z_0): the tank-top point with the highest
           V_j = a_X (x_j - x_G) + a_Y (y_j - y_G) + (a_Z + g)(z_j - z_G); rectangular top:
           x_j = x_top +- 0.5 l_fs, y_j = y_top +- 0.5 b_top. Accelerations at the tank CoG (Sec 3 [3.2]).
   Sec 5 [2.3.1] P_dl = P_dl-s (1 + a_z/g) with a_z = envelope a_z-env (or per-case a_Z)
   Sec 6 [2.2]   P_dl-s >= 2.5 (accommodation/tween/platforms), 3.5 (wheelhouse), 8 (machinery platforms)
   Sec 6 [3.1]   P_int = 12 (internal structures in tanks) */
(function (root) {
  'use strict';
  var g = 9.81, rho = 1.025;

  /* tank: {z_top, h_air, x_top, y_top, l_fs, b_top, x_G, y_G, z_G, rho_L?, P_PV?, cargoTank?, prv?, h_drop?, z_bd?, kind}
     kind: 'ballast' | 'fresh' | 'fuel' | 'cargo' | 'other' */
  function staticPressures(tank, pt, L) {
    var rho_L = tank.rho_L || 1.025, dz = tank.z_top - pt.z;
    var f_cd = tank.f_cd || 1.0;
    var P_PV = tank.P_PV || 0;
    var P_0 = L <= 50 ? 10 : (L < 100 ? 0.3 * L - 5 : 25);
    var overfill = (tank.kind === 'ballast' || tank.kind === 'fresh');
    var P_drop2 = tank.noOverfill ? 0 : 25;
    var z_ST = Math.max(tank.z_top + (tank.h_air || 0), tank.z_top + 2.4, tank.z_bd || 0);
    if (tank.kind === 'cargo' && tank.P_PV) z_ST = Math.max(tank.z_top + (tank.h_air || 0), tank.z_top + 2.4, tank.z_top + 0.1 * tank.P_PV);
    return {
      P_ls1: Math.max((tank.prv ? f_cd : 1) * rho_L * g * dz + (tank.prv ? P_PV : 0), 0),
      P_ls2: Math.max(rho_L * g * (dz + (tank.h_drop || 0)) + Math.max(tank.P_drop1 || 0, 25), 0),
      P_ls3: Math.max(rho_L * g * dz + (tank.prv ? P_PV : P_0), 0),
      P_ls4: overfill ? Math.max(rho_L * g * (dz + (tank.h_air || 0)) + P_drop2, 0) : null,
      P_lsST: Math.max(10 * (z_ST - pt.z), 0),
      z_ST: z_ST, P_0: P_0, rho_L: rho_L
    };
  }

  /* dynamic pressure for one load case; acc = {aX, aY, aZ} at the tank CoG */
  function dynamicPressure(tank, pt, acc) {
    var rho_L = tank.rho_L || 1.025, f_cd = tank.f_cd || 1.0;
    var cargo = tank.cargoTank;                       /* cargo tanks (incl. water ballast in cargo tanks): 0.62 / 0.67 */
    var f_ull_l = cargo ? 0.62 : 1.0, f_ull_t = cargo ? 0.67 : 1.0;
    var xs = [tank.x_top - 0.5 * tank.l_fs, tank.x_top + 0.5 * tank.l_fs];
    var ys = [tank.y_top - 0.5 * tank.b_top, tank.y_top + 0.5 * tank.b_top];
    var best = null;
    xs.forEach(function (xj) { ys.forEach(function (yj) {
      var V = acc.aX * (xj - tank.x_G) + acc.aY * (yj - tank.y_G) + (acc.aZ + g) * (tank.z_top - tank.z_G);
      if (!best || V > best.V) best = { V: V, x0: xj, y0: yj, z0: tank.z_top };
    }); });
    var P = f_cd * rho_L * (acc.aZ * (best.z0 - pt.z) + f_ull_l * acc.aX * (best.x0 - pt.x) + f_ull_t * acc.aY * (best.y0 - pt.y));
    return { P_ld: P, ref: best };
  }

  function floodingPressure(pt, z_fd, dam) {
    var h = z_fd - pt.z;
    if (dam && dam.Z_dam !== undefined) {
      var th = (dam.theta_dam || 0) * Math.PI / 180;
      h = Math.max(h, Math.abs(pt.y) * Math.sin(th) + (dam.Z_dam - pt.z) * Math.cos(th));
    }
    return Math.max(rho * g * h, 0);
  }

  /* Sec 5 [2.2.3] minimum green sea pressure P_D-min (Table 31) */
  function pDmin(L_LL, x_LL, typeA) {
    var r = x_LL / L_LL, a = typeA ? 0.356 : 0.0726;
    if (L_LL >= 100) return r <= 0.75 ? 34.3 : 34.3 + (14.8 + a * (L_LL - 100)) * (4 * r - 3);
    return r <= 0.75 ? 14.9 + 0.195 * L_LL : 12.2 + L_LL / 9 * (5 * r - 2) + 3.6 * r;
  }

  var api = { staticPressures: staticPressures, dynamicPressure: dynamicPressure, floodingPressure: floodingPressure, pDmin: pDmin, g: g, rho: rho };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoadPointTank = api;
})(typeof window !== 'undefined' ? window : this);
