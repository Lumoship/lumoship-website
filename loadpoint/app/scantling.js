/* LoadPoint - DNV RU-SHIP Pt 3 local scantlings of plating and stiffeners (yield,
   minimum thickness, slenderness). Pure functions.

   Ch 3 Sec 1  material factor k (Table 2), tau_eH = R_eH / sqrt(3)
   Ch 3 Sec 3  corrosion t_c = t_c1 + t_c2 + t_res (0.5); cap 0.2 t_gr
   Ch 3 Sec 7  b_eff = min(200 l, s) [600 if t_p < 8]; d_shr = h_stf + t_p; bulb -> equivalent angle [1.4.1]
   Ch 6 Sec 3  t_min plating = a + b L_2 sqrt(k) (Table 1); stiffener web (Table 2); web >= 0.4 t_plate-req
   Ch 6 Sec 4  t = 0.0158 alpha_p b sqrt(|P| / (C_a R_eH)), C_a = beta_a - alpha_a |sigma_hg| / R_eH <= C_a-max (Table 1)
   Ch 6 Sec 5  Z = f_u |P| s l_bdg^2 / (f_bdg C_s R_eH);  t_w = C_m f_shr |P| s l_shr / (d_shr C_t tau_eH)
   Ch 8 Sec 2  t_p >= b / C; t_w >= h_w / C_w sqrt(R_eH/235); t_f >= b_f-out / C_f sqrt(R_eH/235) */
(function (root) {
  'use strict';

  var MATERIALS = { 'NS (A/B/D/E)': 235, 'HS32 (AH32..)': 315, 'HS36 (AH36..)': 355, 'HS40 (AH40..)': 390 };
  function kFactor(R) {            /* Ch 3 Sec 1 Table 2, linear in between; 235/R below 235 */
    if (R <= 235) return R < 235 ? 235 / R : 1.0;
    var n = [235, 315, 355, 390], k = [1.0, 0.78, 0.72, 0.68];
    for (var i = 0; i < 3; i++) if (R <= n[i + 1]) return k[i] + (k[i + 1] - k[i]) * (R - n[i]) / (n[i + 1] - n[i]);
    return 0.68;
  }

  /* Ch 3 Sec 3 Table 1: one-side corrosion for a compartment type */
  var TC1 = { sea: 0.5, ballast: 1.0, fresh: 0.0, fuel: 0.0, cargoOil: 0.0, cargoOilIB: 0.5, dryHold: 0.5, dryHoldLower: 1.0,
              accommodation: 0.0, void: 0.0, voidDeck: 0.5, other: 0.5, none: 0.0 };
  function corrosion(comp1, comp2, t_gross) {
    var t = (TC1[comp1] || 0) + (TC1[comp2] || 0) + 0.5;
    return t_gross ? Math.min(t, 0.2 * t_gross) : t;
  }

  /* Ch 6 Sec 3 Table 1 (a, b) by member; ship: {L, T_SC, decksAbove07D} pt.z for side shell bands */
  function minPlate(member, ship, z, k, x) {
    var L2 = Math.min(ship.L, 300), a = 4.5, b = 0.01, row = 'other';
    var kk = Math.min(k, 1.0);
    switch (member) {
      case 'bottom': case 'bilge': case 'keel': a = 4.5; b = 0.035; row = 'keel, bottom shell, bilge'; break;
      case 'sternShell': a = 4.0; b = 0.06; row = 'shell at stern frame / boss / heel'; break;          /* Ch 6 Sec 4 [2.2.3]: shell connected with stern frame, boss, heel plate */
      case 'side': case 'sside':
        a = 4.0;
        if (z <= ship.T_SC + 4.6) { b = 0.035; row = 'side shell, z <= T_SC + 4.6 m'; } else if (z <= ship.T_SC + 6.9) { b = 0.025; row = 'side shell, T_SC + 4.6 < z <= T_SC + 6.9 m'; } else if (z <= ship.T_SC + 9.2) { b = 0.015; row = 'side shell, T_SC + 6.9 < z <= T_SC + 9.2 m'; } else { b = 0.01; row = 'side shell, z > T_SC + 9.2 m'; }
        if (member === 'sside' && z > ship.T_SC + 4.6 && ship.service && ship.service !== 'R0') { b = Math.min(b, 0.01); row = 'superstructure side, restricted service (note 6)'; }   /* note 6 */
        if (member === 'sside' && ship.decksAbove07D >= 2 && z > ship.T_SC + 1.7 * waveCoefL(ship.L)) { b = 0; row = 'superstructure side above T_SC + 1.7 C_W, 2+ decks (note 7)'; }                /* note 7 */
        break;
      case 'weatherDeck': case 'strengthDeck':
        a = 4.5; b = 0.02; row = member === 'weatherDeck' ? 'weather deck' : 'strength deck';
        if (ship.decksAbove07D === 2) { b -= 0.01; row += ', 2 decks above 0.7 D (note 2)'; } else if (ship.decksAbove07D > 2) { b = 0; row += ', > 2 decks above 0.7 D (note 3)'; }   /* notes 2, 3 */
        if (member === 'weatherDeck' && x !== undefined && x > 0.8 * ship.L) { b = Math.max(b, 0.01); row += ', forward of 0.2 L from FE (note 1)'; }   /* note 1 */
        break;
      case 'tankDeck': a = 4.5; b = 0.015; row = 'deck bounding tank / bulk hold'; break;
      case 'otherDeck': a = 4.5; b = ship.decksAbove07D > 2 ? 0 : 0.01; row = 'other deck'; break;
      case 'nonStrengthDeck': a = 4.5; b = 0; row = 'deck not contributing to hull girder'; break;
      case 'innerBottomHold': a = 5.5; b = 0.025; row = 'inner bottom, hold loaded through hatches'; break;
      case 'innerBottom': a = 4.5; b = 0.02; row = 'inner bottom'; break;
      case 'tankBhd': a = 4.5; b = 0.015; row = 'tank bulkhead'; break;
      case 'wtBhd': case 'peakBhd': a = 4.5; b = 0.01; row = 'watertight / peak bulkhead'; break;
      case 'nonTightTank': a = 5.0; b = 0.005; row = 'non-tight bulkhead in tank'; break;
      case 'nonTight': a = 5.0; b = 0; row = 'other non-tight bulkhead'; break;
      case 'accWall': a = 4.5; b = 0; row = 'wall in accommodation'; break;
    }
    return { t: a + b * L2 * Math.sqrt(kk), a: a, b: b, row: row };
  }

  function waveCoefL(L) { return L < 90 ? 0.0856 * L : (L <= 300 ? 10.75 - Math.pow((300 - L) / 100, 1.5) : 10.75); }

  /* Ch 6 Sec 3 Table 2 stiffener web/flange minimum. tankBoundary: the element bounds a tank or a dry bulk hold */
  function minStiffener(member, ship, tankBoundary) {
    var L1 = Math.min(ship.L, 250);
    if (/^(sside|accWall)$/.test(member)) return { t: 4.0, row: 'structures in deckhouse and superstructure' };
    if (ship.decksAbove07D > 2 && /Deck/.test(member)) return { t: 4.0, row: 'decks, vessel with more than 2 continuous decks above 0.7 D' };
    if (tankBoundary || /^(strengthDeck|keel|bottom|bilge|side|sternShell)$/.test(member)) return { t: 4.5 + 0.01 * L1, row: tankBoundary ? 'tank / dry bulk hold boundary' : 'single strength deck and shell up to freeboard deck' };
    return { t: 4.5 + 0.005 * L1, row: 'other structure' };
  }

  /* Ch 6 Sec 4 Table 1. member: structural member key; stiffening 'long'|'trv';
     flood: the load set is flooding (FD-1) - only then the "watertight boundaries" rows apply */
  function plateCoef(AC, member, stiffening, flood) {
    var longit = /^(bottom|bilge|keel|side|sside|sternShell|strengthDeck|weatherDeck|tankDeck|otherDeck|innerBottom|innerBottomHold|longBhd)$/.test(member);
    var L = stiffening === 'long', al = L ? 0.50 : 1.00, r;
    if (AC === 'AC-I') r = longit ? [0.90, al, 0.80] : [0.80, 0, 0.80];
    else if (AC === 'AC-II') r = longit ? [1.05, al, 0.95] : [0.95, 0, 0.95];
    else {
      if (flood && member === 'longBhd') r = L ? [1.25, 0.50, 1.15] : [1.15, 1.00, 1.15];          /* longitudinal watertight boundaries */
      else if (flood && /Bhd|innerBottom|tankDeck/.test(member)) r = [1.15, 0, 1.15];                 /* other watertight boundaries */
      else if (member === 'longBhd') r = L ? [1.25, 0.50, 1.15] : [1.15, 1.00, 1.15];                 /* longitudinal bulkhead members */
      else if (longit) r = [1.10, al, 1.00];                                                          /* other longitudinal members */
      else if (member === 'tankBhd') r = [1.15, 0, 1.15];                                             /* transverse boundaries of WB tanks / tank-dry */
      else r = [1.00, 0, 1.00];
    }
    return { beta: r[0], alpha: r[1], Cmax: r[2], longitudinal: longit };
  }
  function plateThickness(P, a, b, R_eH, AC, member, stiffening, sigma_hg, flood) {
    var c = plateCoef(AC, member, stiffening, flood);
    var C_a = Math.min(c.beta - c.alpha * Math.abs(sigma_hg || 0) / R_eH, c.Cmax);
    var alpha_p = Math.min(1.2 - b / (2.1 * a), 1.0);
    return { t: 0.0158 * alpha_p * b * Math.sqrt(Math.abs(P) / (C_a * R_eH)), C_a: C_a, alpha_p: alpha_p, coef: c };
  }

  /* Ch 6 Sec 5 Tables 3-5 */
  function stiffCoef(AC, longitudinal, fixity, vertLower, flood) {
    var T = { 'AC-I': [[0.95, 1.0, 0.85], [0.85, 0, 0.85]], 'AC-II': [[1.10, 1.0, 0.95], [0.95, 0, 0.95]], 'AC-III': [[1.20, 1.0, 1.00], [1.00, 0, 1.00]] }[AC];
    var r = longitudinal ? T[0] : T[1];
    if (AC === 'AC-III' && flood) r = longitudinal ? [1.20, 1.0, 1.15] : [1.15, 0, 1.15];   /* on watertight boundaries, flooding only */
    var f_bdg = fixity === 'fixed' ? (vertLower ? 10 : 12) : (fixity === 'one' ? 8 : 8);
    var f_m = fixity === 'fixed' ? (AC === 'AC-I' ? (vertLower ? 2.33 : 2.0) : (vertLower ? 1.86 : 1.6)) : (fixity === 'one' ? (AC === 'AC-I' ? 1.77 : 1.42) : 1.0);
    var f_shr = fixity === 'ss' ? 0.5 : (vertLower ? 0.7 : 0.5);
    var C_t = { 'AC-I': 0.75, 'AC-II': 0.90, 'AC-III': 0.95 }[AC];
    return { beta: r[0], alpha: r[1], Cmax: r[2], f_bdg: f_bdg, f_m: f_m, f_shr: f_shr, C_t: C_t };
  }
  /* Table 3: C_s depends on sign of sigma_hg and which side the pressure acts on.
     pressureSide 'stiffener' | 'plate'; fixity 'fixed' | 'one' | 'ss' */
  function stiffCs(c, R_eH, sigma_hg, pressureSide, fixity) {
    var base = c.beta - c.alpha * Math.abs(sigma_hg) / R_eH;
    var tension = sigma_hg >= 0;
    if (fixity === 'ss') {
      var a = (tension && pressureSide === 'plate') || (!tension && pressureSide === 'stiffener');
      return a ? Math.min(base, c.Cmax) : c.Cmax;
    }
    var direct = (tension && pressureSide === 'stiffener') || (!tension && pressureSide === 'plate');
    return Math.min(direct ? base : c.f_m * base, c.Cmax);
  }
  function stiffenerReq(P, s, l_bdg, l_shr, d_shr, R_eH, C_s, C_t, f_u, f_bdg, f_shr, C_m) {
    var tau = R_eH / Math.sqrt(3);
    return {
      Z: f_u * Math.abs(P) * s * l_bdg * l_bdg / (f_bdg * C_s * R_eH),
      t_w: (C_m || 1) * f_shr * Math.abs(P) * s * l_shr / (d_shr * C_t * tau)
    };
  }

  /* ---- profiles: net section with attached plate b_eff x t_p (all mm; output cm units) ----
     prof: {type: 'FB'|'HP'|'L'|'T', h, t, bf?, tf?}  (gross dims); tc: corrosion deduction (mm), tp: NET plate thk */
  function equivalentAngle(hw, tw) {          /* Ch 3 Sec 7 [1.4.1] on NET bulb dims */
    var alpha = hw <= 120 ? 1.1 + Math.pow(120 - hw, 2) / 3000 : 1.0;
    return { hw: hw - hw / 9.2 + 2, tw: tw, bf: alpha * (tw + hw / 6.7 - 2), tf: hw / 9.2 - 2 };
  }
  /* Net section of stiffener + attached plate (b_eff x t_p, both net). All mm in, cm out.
     Corrosion is a THICKNESS deduction: web/flange thickness - t_c. For bulb profiles the
     rule's equivalent angle is built from the NET bulb height and thickness ([1.4.1]);
     the net height is taken as h - t_c (the bulb tip corrodes too). Web height of L/T = h - t_f. */
  function sectionProps(prof, tc, tp, beff, phi_w) {
    var hw, tw, bf = 0, tf = 0;
    if (prof.type === 'HP') {
      var e = equivalentAngle(prof.h - tc, prof.t - tc); hw = e.hw; tw = e.tw; bf = e.bf; tf = e.tf;
    } else if (prof.type === 'FB') {
      hw = prof.h; tw = prof.t - tc;
    } else {
      hw = prof.h - prof.tf; tw = prof.t - tc; bf = prof.bf; tf = prof.tf - tc;
    }
    /* [area mm2, centroid z from plate mid-thickness mm, own I mm4] */
    var parts = [[beff * tp, 0, beff * tp * tp * tp / 12], [hw * tw, tp / 2 + hw / 2, tw * hw * hw * hw / 12]];
    if (bf > 0 && tf > 0) parts.push([bf * tf, tp / 2 + hw + tf / 2, bf * tf * tf * tf / 12]);
    var A = 0, Sz = 0; parts.forEach(function (p) { A += p[0]; Sz += p[0] * p[1]; });
    var zc = Sz / A, I = 0; parts.forEach(function (p) { I += p[2] + p[0] * (p[1] - zc) * (p[1] - zc); });
    var ztop = tp / 2 + hw + tf, zbot = -tp / 2;
    var sinw = (phi_w !== undefined && phi_w < 75) ? Math.sin(phi_w * Math.PI / 180) : 1.0;   /* [1.4.4]: Z, I x sin(phi_w) when phi_w < 75 deg */
    I *= sinw;
    return { A: A / 100, I: I / 1e4, Z: I / (ztop - zc) / 1e3, Zplate: I / (zc - zbot) / 1e3, zc: zc, sinw: sinw,
             hw: hw, tw: tw, bf: bf, tf: tf, h_stf: hw + tf, Astf: (hw * tw + bf * tf) / 100 };
  }
  var HP = [
// >>> HP_KATALOG - TEK KAYNAK: Apps/_standart/hp-katalog.json (hp-yay.py yazar, elle duzenleme)
  ["HP60x4",60,4],["HP60x5",60,5],["HP60x6",60,6],["HP80x5",80,5],["HP80x6",80,6],["HP80x7",80,7],["HP80x8",80,8],["HP100x6",100,6],["HP100x7",100,7],
  ["HP100x8",100,8],["HP120x6",120,6],["HP120x7",120,7],["HP120x8",120,8],["HP140x6.5",140,6.5],["HP140x7",140,7],["HP140x8",140,8],["HP140x9",140,9],
  ["HP140x10",140,10],["HP160x7",160,7],["HP160x8",160,8],["HP160x9",160,9],["HP160x10",160,10],["HP160x11",160,11],["HP160x11.5",160,11.5],
  ["HP180x8",180,8],["HP180x9",180,9],["HP180x10",180,10],["HP180x11",180,11],["HP180x11.5",180,11.5],["HP200x8.5",200,8.5],["HP200x9",200,9],
  ["HP200x10",200,10],["HP200x11",200,11],["HP200x11.5",200,11.5],["HP200x12",200,12],["HP220x9",220,9],["HP220x10",220,10],["HP220x11",220,11],
  ["HP220x11.5",220,11.5],["HP220x12",220,12],["HP240x9.5",240,9.5],["HP240x10",240,10],["HP240x10.5",240,10.5],["HP240x11",240,11],
  ["HP240x11.5",240,11.5],["HP240x12",240,12],["HP260x10",260,10],["HP260x11",260,11],["HP260x12",260,12],["HP260x13",260,13],["HP280x10.5",280,10.5],
  ["HP280x11",280,11],["HP280x12",280,12],["HP280x13",280,13],["HP300x11",300,11],["HP300x12",300,12],["HP300x13",300,13],["HP300x14",300,14],
  ["HP320x11.5",320,11.5],["HP320x12",320,12],["HP320x12.5",320,12.5],["HP320x13",320,13],["HP320x13.5",320,13.5],["HP320x14",320,14],
  ["HP320x15",320,15],["HP340x12",340,12],["HP340x12.5",340,12.5],["HP340x13",340,13],["HP340x14",340,14],["HP340x15",340,15],["HP370x12.5",370,12.5],
  ["HP370x13",370,13],["HP370x14",370,14],["HP370x15",370,15],["HP370x16",370,16],["HP400x13",400,13],["HP400x14",400,14],["HP400x15",400,15],
  ["HP400x16",400,16],["HP400x17",400,17],["HP430x14",430,14],["HP430x15",430,15],["HP430x17",430,17],["HP430x18",430,18],["HP430x19",430,19],
  ["HP430x20",430,20],["HP430x21",430,21]
// <<< HP_KATALOG
  ];

  /* Ch 8 Sec 2 [3.1.1] */
  function slenderness(prof, net, R_eH, flatBarLateral) {
    var C = { FB: flatBarLateral ? 26 : 22, HP: 45, L: 75, T: 75 }[prof.type], Cf = 12;
    var r = Math.sqrt(R_eH / 235);
    var out = { tw_req: net.hw / C * r, C_w: C };
    if (prof.type === 'L' || prof.type === 'T') {
      var bout = prof.type === 'L' ? net.bf - net.tw : (net.bf - net.tw) / 2;
      out.tf_req = bout / Cf * r; out.C_f = Cf; out.bf_out = bout;
      out.bf_min = 0.2 * prof.h;
    }
    return out;
  }

  var api = { MATERIALS: MATERIALS, kFactor: kFactor, TC1: TC1, corrosion: corrosion, minPlate: minPlate, minStiffener: minStiffener,
              plateCoef: plateCoef, plateThickness: plateThickness, stiffCoef: stiffCoef, stiffCs: stiffCs, stiffenerReq: stiffenerReq,
              equivalentAngle: equivalentAngle, sectionProps: sectionProps, HP: HP, slenderness: slenderness };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoadPointScant = api;
})(typeof window !== 'undefined' ? window : this);
