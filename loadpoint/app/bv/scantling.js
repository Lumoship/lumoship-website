/* LoadPoint - BV NR467 Pt B local scantlings (yield, minimum thickness, slenderness). Same API shape
   as scantling.js so the page can swap the rule set.

   Ch 4 Sec 1  k: 235 -> 1.0, 315 -> 0.78, 355 -> 0.72, 390 -> 0.68 (0.66 with NI611 fatigue), linear in between
   Ch 4 Sec 3  t_c = t_c1 + t_c2 + 0.5 (t_gr > 10 mm); min(that, 0.2 t_gr) for t_gr <= 10 mm; 0 when t_c1 = t_c2 = 0 (Tab 1)
   Ch 4 Sec 6  b_eff = min(200 l ; s), <= 600 mm if t_p < 8; bulb -> equivalent built-up [1.4.1];
               d_shr = (h_stf - 0.5 t_c-stf + t_p + 0.5 t_c-pl) sin phi_w  [1.4.4]  (t_p = net plate)
   Ch 7 Sec 3  gross thickness of everything >= 5.0 mm
   Ch 7 Sec 4  t = 0.0158 alpha_p b K_R,a sqrt(|P|/(chi C_a R_eH)); C_a = K_corr beta - alpha |sigma_L|/R_eH <= K_corr C_a-max (Tab 1)
               K_corr 1.2 for tank testing; chi 1.15 for watertight boundaries other than the collision bhd in the flooded scenario
   Ch 7 Sec 5  t_w = f_shr K_R,s |P| s l_shr/(d_shr K_corr chi C_t tau_eH), chi C_t <= 1
               Z = K_R,s |P| s l_bdg^2/(f_bdg chi C_s R_eH), chi C_s <= K_corr;  C_s Tab 2 (tension/stiffener side or
               compression/plate side: K_corr beta_s - alpha_s |sigma_L|/R_eH <= K_corr C_s-max; otherwise K_corr C_s-max)
               K_corr 1.1 for tank testing;  f_bdg 12 / 10 (lower end vertical) / 8 (simply supported); f_shr 0.5 / 0.7
   NR615 (Jul 2026) Sec 2 [2.1.1]  t >= 2.32 b 1e-3 sqrt(sigma_Et / K)   (image df22.png, read magnified 2026-09-17)
               sigma_Et = sigma_ct (sigma_ct <= 0.5 R_eH), else R_eH / (4 - 4 sigma_ct / R_eH)   (image df33.png)
               sigma_ct = 0.2 R_eH stiffened plate panels, 0.5 R_eH stiffener webs, 0.9 R_eH flanges and pillars
               K = 4 plate panels / T-, angle-, PSM webs; 1.25 bulb webs; 0.43 flat bar webs and all flanges
               b = s, h_w or b_f-out (mid-thickness of the web to the flange edge)
               [3.1.1] b_f >= 0.2 h_w for angle, T, L2 bars.  [1.1.1] exempt: bilge plates in the cylindrical part,
               radiused gunwale, corrugations, superstructure members not contributing to longitudinal strength.
               Rule text: Rules/BV/NR615/_raw (Rules Explorer harvest). */
(function (root) {
  'use strict';
  var D = root.LoadPointScant || require('../scantling');     /* shared: materials, k, equivalent angle, HP list, section props */

  var TC1 = { sea: 1.0, atmosphere: 1.0, ballast: 1.0, fresh: 0.5, fuel: 0.5, cargoOil: 0.5, dryHold: 1.0, dryHoldLower: 1.75, dryHoldStiff: 1.0,
              void: 0.5, dry: 0.5, containerBhd: 0.5, container: 1.0, accommodation: 0.0, other: 0.5, none: 0.0 };
  function corrosion(c1, c2, t_gross) {
    var a = TC1[c1] || 0, b = TC1[c2] || 0;
    if (a === 0 && b === 0) return 0;
    var t = a + b + 0.5;
    return (t_gross && t_gross <= 10) ? Math.min(t, 0.2 * t_gross) : t;
  }

  function minPlate() { return { t: 5.0, a: 5.0, b: 0, gross: true }; }        /* Ch 7 Sec 3 [1.1.1]: gross */
  function minStiffener() { return 5.0; }                                       /* gross */

  /* Ch 7 Sec 4 Tab 1 */
  function plateCoef(AC, member, stiffening, flood) {
    var longit = /^(bottom|bilge|keel|side|sside|sternShell|strengthDeck|weatherDeck|tankDeck|otherDeck|innerBottom|innerBottomHold|longBhd)$/.test(member);
    var al = stiffening === 'long' ? 0.5 : 1.0, r;
    if (AC === 'AC-I') r = longit ? [0.9, al, 0.8] : [0.8, 0, 0.8];
    else if (AC === 'AC-II') r = longit ? [1.05, al, 0.95] : [1.0, 0, 1.0];
    else r = longit ? [1.1, al, 1.0] : [1.0, 0, 1.0];
    return { beta: r[0], alpha: r[1], Cmax: r[2], longitudinal: longit };
  }
  /* opt: {testing, flood, collision, R (m, curved panel)} */
  function plateThickness(P, a, b, R_eH, AC, member, stiffening, sigma, flood, opt) {
    opt = opt || {};
    var c = plateCoef(AC, member, stiffening, flood);
    var Kc = opt.testing ? 1.2 : 1.0;
    var chi = flood && !opt.collision ? 1.15 : 1.0;
    var C_a = Math.min(Kc * c.beta - c.alpha * Math.abs(sigma || 0) / R_eH, Kc * c.Cmax);
    var alpha_p = Math.min(1.2 - b / (2.1 * a), 1.0);
    var KR = opt.R > 0 ? Math.max(1 - b / (2 * opt.R) * 1e-3, 0.5) : 1.0;
    return { t: 0.0158 * alpha_p * b * KR * Math.sqrt(Math.abs(P) / (chi * C_a * R_eH)), C_a: C_a, alpha_p: alpha_p, coef: c, chi: chi, K_corr: Kc, K_R: KR };
  }

  /* Ch 7 Sec 5 Tab 1 / Symbols */
  function stiffCoef(AC, longitudinal, fixity, vertLower, flood) {
    var T = { 'AC-I': [[0.85, 1.0, 0.75, 0.75], [0.75, 0, 0.75, 0.75]], 'AC-II': [[1.00, 1.0, 0.9, 0.9], [0.90, 0, 0.9, 0.9]], 'AC-III': [[1.10, 1.0, 1.0, 1.0], [1.00, 0, 1.0, 1.0]] }[AC];
    var r = longitudinal ? T[0] : T[1];
    return { beta: r[0], alpha: r[1], Cmax: r[2], C_t: r[3], f_bdg: fixity === 'fixed' ? (vertLower ? 10 : 12) : 8, f_m: 1, f_shr: vertLower ? 0.7 : 0.5 };   /* other end fixities: [1.7] direct calculation - 8 taken as the safe side */
  }
  function stiffCs(c, R_eH, sigma, pressureSide, fixity, Kc) {
    Kc = Kc || 1;
    var tension = sigma >= 0;
    var direct = (tension && pressureSide === 'stiffener') || (!tension && pressureSide === 'plate');
    return direct ? Math.min(Kc * c.beta - c.alpha * Math.abs(sigma) / R_eH, Kc * c.Cmax) : Kc * c.Cmax;
  }
  /* opt: {testing, flood, collision, KR (K_R,s)} */
  function stiffenerReq(P, s, l_bdg, l_shr, d_shr, R_eH, C_s, C_t, f_u, f_bdg, f_shr, C_m, opt) {
    opt = opt || {};
    var Kc = opt.testing ? 1.1 : 1.0, chi = opt.flood && !opt.collision ? 1.15 : 1.0, KR = opt.KR || 1.0;
    var tau = R_eH / Math.sqrt(3);
    return {
      Z: KR * Math.abs(P) * s * l_bdg * l_bdg / (f_bdg * Math.min(chi * C_s, Kc) * R_eH),
      t_w: f_shr * KR * Math.abs(P) * s * l_shr / (d_shr * Kc * Math.min(chi * C_t, 1.0) * tau)
    };
  }
  /* K_R,s for curved attached plating: exp(-(6e-8 (s^2/(2 R t_p,gr))^2)) >= 0.7  (s mm, R m, t mm) */
  function KRs(s, R, t_gr) { return R > 0 ? Math.max(Math.exp(-Math.pow(6e-8 * s * s / (2 * R * t_gr), 2)), 0.7) : 1.0; }

  /* NR615 Sec 2 [2.1.1] */
  function slenderness(prof, net, R_eH) {
    var sigE = function (frac) { var v = frac * R_eH; return v <= 0.5 * R_eH ? v : R_eH / (4 - 4 * v / R_eH); };
    var req = function (b, frac, K) { return 2.32 * b * 1e-3 * Math.sqrt(sigE(frac) / K); };
    var K = prof.type === 'FB' ? 0.43 : (prof.type === 'HP' ? 1.25 : 4);
    var out = { tw_req: req(net.hw, 0.5, K), C_w: 'K ' + K, plateK: 4 };
    if (prof.type === 'L' || prof.type === 'T') {
      var bout = prof.type === 'L' ? net.bf - net.tw / 2 : net.bf / 2;       /* b_f-out from the web mid-thickness */
      out.tf_req = req(bout, 0.9, 0.43); out.C_f = 'K 0.43'; out.bf_out = bout; out.bf_min = 0.2 * net.hw;
    }
    return out;
  }
  function plateSlenderness(b, R_eH) { var v = 0.2 * R_eH; return 2.32 * b * 1e-3 * Math.sqrt(v / 4); }

  var api = { MATERIALS: D.MATERIALS, kFactor: D.kFactor, TC1: TC1, corrosion: corrosion, minPlate: minPlate, minStiffener: minStiffener,
              plateCoef: plateCoef, plateThickness: plateThickness, stiffCoef: stiffCoef, stiffCs: stiffCs, stiffenerReq: stiffenerReq, KRs: KRs,
              equivalentAngle: D.equivalentAngle, sectionProps: D.sectionProps, HP: D.HP, slenderness: slenderness, plateSlenderness: plateSlenderness };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BVScant = api;
})(typeof window !== 'undefined' ? window : this);
