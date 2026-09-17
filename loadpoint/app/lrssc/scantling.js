/* LoadPoint - LR SSC Part 6 (steel, mono-hull) local scantlings of plating and stiffeners.
   Gross scantlings: the SSC rules carry no corrosion deduction (Pt 6 Ch 3 2.2.1).

   Pt 6 Ch 2 2.4.4    k_s = 235 / sigma_s, not less than 0.66
   Pt 6 Ch 3 1.10.3   b_e = 2 t_p sqrt(E / sigma_s) <= s   (sigma_s <= 235 mild, 340 HTS)
   Pt 6 Ch 3 1.14-15  gamma = 1 - h/s >= 0.7 (convex curvature); beta = A_R (1 - 0.25 A_R), A_R <= 2
   Pt 6 Ch 3 1.16     t_p = 22.4 s gamma beta sqrt(p k_s / (f_sigma 235)) 10^-3
   Pt 6 Ch 3 1.17     Z = Phi_Z p s l_e^2 k_s / (f_sigma 235); I = Phi_I f_delta p s l_e^3 / E x 100;
                      A_w = Phi_A p s l k_s / (100 f_tau 235/sqrt3)
   Pt 6 Ch 3 Tab 3.1.1  load model coefficients; Tab 3.1.2 stiffener proportions
   Pt 6 Ch 3 Tab 3.2.1  minimum thickness omega sqrt(k_ms) (a sqrt(L_R) + b) >= c omega, k_ms = 635 / (sigma_s + sigma_u)
   Pt 6 Ch 7 Tab 7.2.1  f_delta; Tab 7.3.1 f_sigma / f_tau by item and load (impact / hydrodynamic) */
(function (root) {
  'use strict';
  var E = 200000;
  /* yield / ultimate of the steel grades (Pt 6 Ch 2 Tab 2.2.x): key -> [sigma_s, sigma_u] */
  var MATERIALS = { 'MS (A/B/D/E)': [235, 400], 'HT32 (AH32..)': [315, 440], 'HT36 (AH36..)': [355, 490], 'HT40 (AH40..)': [390, 510] };
  function kS(sigma_s) { return Math.max(235 / sigma_s, 0.66); }
  function kMS(sigma_s, sigma_u) { return 635 / (sigma_s + sigma_u); }
  function gamma(h, s) { return s > 0 ? Math.max(1 - (h || 0) / s, 0.7) : 1.0; }
  function beta(a, b) { var AR = b > 0 ? a / b : 99; return AR <= 2 ? AR * (1 - 0.25 * AR) : 1.0; }
  function bEff(t_p, s, sigma_s, hts) { return Math.min(2 * t_p * Math.sqrt(E / Math.min(sigma_s, hts ? 340 : 235)), s); }

  /* 1.16.1 plate thickness (mm); s in mm, p kN/m^2 */
  function plateThickness(p, s, gam, bet, k_s, f_sigma) {
    return { t: 22.4 * s * gam * bet * Math.sqrt(Math.abs(p) * k_s / (f_sigma * 235)) * 1e-3, gamma: gam, beta: bet, k_s: k_s, f_sigma: f_sigma };
  }

  /* Tab 3.1.1: the governing (largest) coefficient of each load model over the positions 1-3 */
  var MODELS = {
    a: { Phi_A: 1 / 2, Phi_Z: 1 / 12, Phi_I: 1 / 384, name: '(a) both ends fixed' },
    b: { Phi_A: 1 / 2, Phi_Z: 1 / 10, Phi_I: 1 / 288, name: '(b) one end fixed, one simply supported' },
    c: { Phi_A: 5 / 8, Phi_Z: 1 / 8, Phi_I: 1 / 185, name: '(c) one end fixed, free end supported' },
    d: { Phi_A: 1, Phi_Z: 1 / 2, Phi_I: 1 / 8, name: '(d) cantilever' },
    e: { Phi_A: 1 / 2, Phi_Z: 1 / 8, Phi_I: 5 / 384, name: '(e) simply supported' }
  };
  /* 1.17.1 stiffener requirements: s mm, l_e / l m, p kN/m^2 -> Z cm^3, I cm^4, A_w cm^2 */
  function stiffenerReq(p, s, l_e, l, k_s, f_sigma, f_tau, f_delta, model) {
    var m = MODELS[model] || MODELS.b, P = Math.abs(p);
    return {
      Z: m.Phi_Z * P * s * l_e * l_e * k_s / (f_sigma * 235),
      I: m.Phi_I * f_delta * P * s * l_e * l_e * l_e / E * 100,
      A_w: m.Phi_A * P * s * (l || l_e) * k_s / (100 * f_tau * 235 / Math.sqrt(3)),
      model: m
    };
  }
  /* Tab 3.1.2 proportions: FB t_w >= d_w/18 (>= 2.5); rolled / built t_w >= d_w/65 (>= 2.5); b_f <= 16 t_f */
  function proportions(prof) {
    var fb = prof.type === 'FB';
    return { tw_min: Math.max(prof.h / (fb ? 18 : 65), 2.5), bf_max: fb ? undefined : 16 * (prof.tf || 0), row: fb ? 'flat bar d_w/18' : 'rolled / built d_w/65, b_f <= 16 t_f' };
  }

  /* Tab 3.2.1 minimum thickness by position (mono-hull column) */
  var TMIN = {
    bottom:     [0.40, 1.8, 3.0, 'bottom shell plating'],
    side:       [0.38, 1.2, 2.5, 'side shell plating'],
    innerBottom:[0.50, 1.0, 2.5, 'inner bottom plating'],
    wtBhd:      [0.33, 1.0, 2.5, 'watertight bulkhead plating'],
    deepTank:   [0.38, 1.2, 3.0, 'deep tank bulkhead plating'],
    strengthDeck:[0.38, 1.2, 3.0, 'strength / main deck plating'],
    lowerDeck:  [0.18, 1.7, 2.0, 'lower deck / inside deckhouse'],
    ssDeck:     [0.18, 1.7, 2.0, 'superstructure / deckhouse external deck'],
    sside:      [0.30, 1.0, 2.0, 'superstructure side plating'],
    dhFront1:   [0.47, 1.5, 3.0, 'deckhouse front, 1st tier'],
    dhFrontUp:  [0.42, 1.3, 3.0, 'deckhouse front, upper tiers'],
    dhAft:      [0.20, 0.6, 2.0, 'deckhouse aft']
  };
  function tminRow(pos) {
    if (/^(keel|bottom|bilge)$/.test(pos)) return 'bottom';
    if (/^(side|sternShell)$/.test(pos)) return 'side';
    if (/^(innerBottom|innerBottomHold)$/.test(pos)) return 'innerBottom';
    if (/^(wtBhd|peakBhd)$/.test(pos)) return 'wtBhd';
    if (/^(longBhd|tankBhd|tankDeck)$/.test(pos)) return 'deepTank';
    if (/^(strengthDeck|weatherDeck)$/.test(pos)) return 'strengthDeck';
    if (/^(otherDeck|nonStrengthDeck|accWall|nonTight|nonTightTank)$/.test(pos)) return 'lowerDeck';
    if (/^(ssDeck|coachroof)$/.test(pos)) return 'ssDeck';
    if (pos === 'sside') return 'sside';
    if (pos === 'dhFront1') return 'dhFront1';
    if (pos === 'dhFrontUp') return 'dhFrontUp';
    if (pos === 'dhOther') return 'dhAft';
    return 'side';
  }
  function minPlate(pos, L_R, omega, k_ms) {
    var key = tminRow(pos), r = TMIN[key];
    var t = omega * Math.sqrt(k_ms) * (r[0] * Math.sqrt(L_R) + r[1]);
    return { t: Math.max(t, r[2] * omega), a: r[0], b: r[1], floor: r[2], row: r[3], formula: 'ω √k_ms (' + r[0] + ' √L_R + ' + r[1] + ') ≥ ' + r[2] + ' ω' };
  }

  /* Tab 7.3.1 limiting stress coefficients. item by position; load 'imp' | 'hyd' | other; member 'plate' | 'secondary' | 'primary' */
  function limits(pos, load, member) {
    var imp = load === 'imp', r;
    var pick = function (plate, sec, pri, name) { return { f_sigma: member === 'plate' ? plate : member === 'primary' ? pri : sec, f_tau: member === 'primary' ? pri : sec, row: name }; };
    if (/^(keel|bottom|bilge)$/.test(pos)) r = pick(imp ? 0.85 : 0.75, imp ? 0.75 : 0.65, 0.65, 'bottom shell / structure, ' + (imp ? 'impact' : 'hydrodynamic'));
    else if (/^(side|sternShell)$/.test(pos)) r = pick(imp ? 0.85 : 0.75, imp ? 0.75 : 0.65, 0.65, 'side shell / structure, ' + (imp ? 'impact' : 'hydrodynamic'));
    else if (/^(strengthDeck|weatherDeck|tankDeck)$/.test(pos)) r = pick(0.75, 0.65, 0.65, 'main / strength deck');
    else if (/^(otherDeck|nonStrengthDeck|ssDeck)$/.test(pos)) r = pick(0.75, 0.60, 0.60, 'lower / inner decks and house top subject to personnel loading');
    else if (pos === 'dhFront1') r = pick(0.65, 0.60, 0.60, 'deckhouse front 1st tier');
    else if (pos === 'dhFrontUp') r = pick(0.75, 0.65, 0.65, 'deckhouse front upper tiers');
    else if (/^(sside|dhOther)$/.test(pos)) r = pick(0.75, 0.75, 0.75, 'deckhouse aft and sides');
    else if (pos === 'coachroof') r = pick(0.65, 0.65, 0.65, 'coachroof');
    else if (/^(wtBhd|peakBhd)$/.test(pos)) r = pick(1.0, 0.95, 0.90, 'watertight bulkhead');
    else if (/^(longBhd|tankBhd)$/.test(pos)) r = pick(0.65, 0.65, 0.75, 'deep tank bulkhead');
    else if (/^(nonTight|nonTightTank|accWall)$/.test(pos)) r = pick(0.65, 0.65, 0.65, 'minor bulkhead');
    else if (/^(innerBottom|innerBottomHold)$/.test(pos)) r = pick(imp ? 0.85 : 0.75, imp ? 0.75 : 0.65, 0.65, 'bottom structure (inner bottom)');
    else r = pick(0.75, 0.65, 0.65, 'other');
    return r;
  }
  /* Tab 7.2.1 limiting deflection ratio f_delta */
  function deflection(pos, member) {
    var pri = member === 'primary', r;
    if (/^(keel|bottom|bilge|innerBottom|innerBottomHold)$/.test(pos)) r = [pri ? 1000 : 800, 'bottom structure'];
    else if (/^(side|sternShell)$/.test(pos)) r = [pri ? 1000 : 800, 'side structure'];
    else if (/^(strengthDeck|weatherDeck|tankDeck)$/.test(pos)) r = [pri ? 1250 : 1000, 'main / strength deck'];
    else if (pos === 'coachroof') r = [pri ? 1000 : 800, 'coachroof'];
    else if (/^(sside|dhFront1|dhFrontUp|dhOther)$/.test(pos)) r = [pri ? 750 : 600, 'superstructures / deckhouses'];
    else if (/^(otherDeck|nonStrengthDeck|ssDeck)$/.test(pos)) r = [pri ? 1000 : 800, 'lower / inner decks'];
    else if (/^(longBhd|tankBhd)$/.test(pos)) r = [pri ? 1250 : 1000, 'deep tank structures'];
    else if (/^(wtBhd|peakBhd|nonTight|nonTightTank|accWall)$/.test(pos)) r = [pri ? 750 : 600, 'watertight bulkhead structures'];
    else r = [pri ? 1000 : 800, 'other'];
    return { f_delta: r[0], row: r[1] };
  }
  /* load model per element type (Pt 6 Ch 3 Sec 4, 7, 8): secondary (b), primary (a) */
  function loadModel(member) { return member === 'primary' ? 'a' : 'b'; }

  var api = { E: E, MATERIALS: MATERIALS, kS: kS, kMS: kMS, gamma: gamma, beta: beta, bEff: bEff, plateThickness: plateThickness, MODELS: MODELS, stiffenerReq: stiffenerReq,
              proportions: proportions, TMIN: TMIN, tminRow: tminRow, minPlate: minPlate, limits: limits, deflection: deflection, loadModel: loadModel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LRSSCScant = api;
})(typeof window !== 'undefined' ? window : this);
