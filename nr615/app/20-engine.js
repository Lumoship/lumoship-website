/* ============================================================================
   NR615 buckling engine — BV NR615 R07 (07/2026).

   One pure function, NR615.solve(inp), runs the whole rule chain and returns
   every intermediate value. The Excel workbook this replaces had to spread the
   same chain over fifteen sheets and, for the batch check, fall back to a
   simplified stiffener model because the exact one could not be repeated per
   row. Here the batch and the single panel call this identical function, so
   there is only one model and no "indicative" column.

   Sign convention, Sec 1 [1.2.3]: compression and shear POSITIVE, tension
   NEGATIVE. All scantlings are NET, Sec 1 [1.2.2] — solve() deducts the
   corrosion additions itself when the basis says gross.
   ============================================================================ */

window.NR615 = (function () {
  'use strict';

  var PI = Math.PI, SQ3 = Math.sqrt(3);

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }
  function median(a, b, c) { return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); }
  /* Excel returns #NUM! for a negative base with a fractional exponent. Per
     Sec 5 Tab 1 that case cannot arise — e0 is exactly 2 whenever a stress is
     tensile — but guard anyway so one odd input cannot poison a whole batch. */
  function powr(base, exp) {
    if (base < 0 && Math.abs(exp - Math.round(exp)) > 1e-12) return NaN;
    return Math.pow(base, exp);
  }

  /* ---- Tab 4 case catalogue -------------------------------------------- */
  var CASES_X = ['Case 1', 'Case 3', 'Case 4', 'Case 5', 'Case 9', 'Case 11', 'Case 13'];
  var CASES_Y = ['Case 2', 'Case 6', 'Case 7', 'Case 8', 'Case 10', 'Case 12', 'Case 14'];
  var CASES_T = ['Case 15', 'Case 16', 'Case 17', 'Case 18', 'Case 19'];

  /* Cases 3-8 carry two reduction curves; Tab 4 lets the Society pick which. */
  function reduceUP(lambda, model) {
    if (model === 'UP-A') return lambda <= 0.75 ? 1 : Math.min(1, 0.75 / lambda);
    return lambda <= 0.7 ? 1 : Math.min(1, 1 / (lambda * lambda + 0.51));
  }
  /* The 0.83 curve used by the clamped-edge cases 9-14. */
  function reduce083(lambda) {
    return lambda <= 0.83 ? 1 : Math.min(1, 1.13 * (1 / lambda - 0.22 / (lambda * lambda)));
  }

  /* ============================ MAIN SOLVER ============================== */
  function solve(I) {
    var R = { warn: [], inp: I };

    /* ---------------- Sec 1 [1.2.2] net scantlings ---------------------- */
    var gross = I.thickBasis !== 'Net (corrosion deducted)';
    var tp = Math.max(0.1, gross ? n(I.tp) - n(I.tcP) : n(I.tp));
    var tw = Math.max(0.1, gross ? n(I.tw) - n(I.tcS) : n(I.tw));
    var tf = n(I.tf) <= 0 ? 0 : Math.max(0.1, gross ? n(I.tf) - n(I.tcS) : n(I.tf));

    var E = n(I.E, 206000), nu = n(I.nu, 0.3);
    var ReHP = n(I.ReHP, 235), ReHS = n(I.ReHS, 235);
    var a = n(I.a), b = n(I.b), l = n(I.l), S = n(I.S, 1);
    var hw = n(I.hw), bf = n(I.bf), df = n(I.df);
    var sx = n(I.sx), sy = n(I.sy), tau = n(I.tau);
    var psix = n(I.psix, 1), psiy = n(I.psiy, 1);
    var flat = I.profile === 'Flat bar', utype = I.profile === 'U-type';

    /* ---------------- Sec 5 Symbols · Tab 1/2/3 coefficients ------------ */
    var alpha = b > 0 ? a / b : 0;
    var omega = Math.min(3, alpha);
    var betaC2 = alpha > 0 ? (1 - psiy) / alpha : 0;           // Tab 4 Case 2 only
    var betaP = tp > 0 ? b / tp * Math.sqrt(ReHP / E) : 0;
    var sigmaE = b > 0 ? PI * PI * E / (12 * (1 - nu * nu)) * Math.pow(tp / b, 2) : 0;
    var sUsed = utype ? n(I.b1u) + n(I.b2u) : n(I.s);          // Sec 5 [2.1.2]

    var methodB = I.method === 'SP-B' || I.method === 'UP-B';
    var c1 = methodB ? 1 : Math.max(0, 1 - 1 / alpha);         // Tab 2
    var cTab3 = flat ? 0.1 : (I.profile === 'Bulb' ? 0.3 : (I.profile === 'T-bar' ? 0.3 : 0.4));
    var Flong;                                                  // Tab 3
    if (I.edgeFixity === 'Unstiffened panel' || I.edgeFixity === 'Not fixed both ends') Flong = 1;
    else if (I.edgeFixity === 'Girder high rigidity') Flong = 1.4;
    else Flong = (tw / tp > 1) ? cTab3 + 1 : cTab3 * Math.pow(tw / tp, 3) + 1;
    var Ftran = n(I.Ftran, 1);                                  // Sec 5 [2.2.5]

    var Aw = utype ? 2 * hw * tw : hw * tw;
    var Af = bf * tf;
    var As = Aw + Af;
    var Ap = sUsed * tp;
    var bfOut = I.flangeType === 'Manual' ? n(I.bfOutManual)
      : (I.flangeType === 'Symmetric (T-bar)' ? bf / 2 : bf);   // Sec 2 Fig 1
    var ef = flat ? hw : (I.profile === 'Bulb' ? hw - 0.5 * tf : hw + 0.5 * tf);
    var w0 = l / 1000;                                          // Sec 5 [2.3.3]

    var C_SI = I.pressureSide === 'Opposite to stiffener' ? -1 : 1;
    var C_PI = I.pressureSide === 'Opposite to stiffener' ? 1 : -1;
    var cont = I.stiffEnds === 'Continuous';
    var Csnip_SI = cont ? 0 : -1.2;
    var Csnip_PI = cont ? 0 : 1.2;
    var M1div = cont ? 24000 : (I.stiffEnds === 'Sniped one end' ? 14200 : 8000);
    var l_eff = I.endRestraint === 'Fixed both ends' ? l / SQ3
      : (I.endRestraint === 'One end fixed' ? 0.75 * l : l);     // Sec 5 [2.3.4]

    /* ================= Sec 5 [2.2] PLATE CAPACITY ======================= */
    var cx_c = Math.min(1.25, 1.25 - 0.12 * psix);
    var lamC_x = cx_c / 2 * (1 + Math.sqrt(1 - 0.88 / cx_c));

    var Kx;
    switch (I.caseX) {
      case 'Case 3':
        Kx = psix >= 0 ? 4 * (0.425 + 1 / (alpha * alpha)) / (3 * psix + 1)
          : 4 * (0.425 + 1 / (alpha * alpha)) * (1 + psix) - 5 * psix * (1 - 3.42 * psix); break;
      case 'Case 4': Kx = (0.425 + 1 / (alpha * alpha)) * (3 - psix) / 2; break;
      case 'Case 5': Kx = alpha >= 1.64 ? 1.28 : 1 / (alpha * alpha) + 0.56 + 0.13 * alpha * alpha; break;
      case 'Case 9': Kx = 6.97; break;
      case 'Case 11': Kx = alpha >= 4 ? 4 : 4 + 2.74 * Math.pow((4 - alpha) / 3, 4); break;
      case 'Case 13': Kx = alpha >= 4 ? 6.97 : 6.97 + 3.1 * Math.pow((4 - alpha) / 3, 4); break;
      default:                                                    // Case 1
        Kx = psix >= 0 ? Flong * 8.4 / (psix + 1.1)
          : (psix > -1 ? Flong * (7.63 - psix * (6.26 - 10 * psix))
            : Flong * 5.975 * Math.pow(1 - psix, 2));
    }
    var lam_x = Math.sqrt(ReHP / (Kx * sigmaE));
    var Cx;
    if (sx <= 0) Cx = 1;
    else if (I.caseX === 'Case 3' || I.caseX === 'Case 4' || I.caseX === 'Case 5') Cx = reduceUP(lam_x, I.upModel);
    else if (I.caseX === 'Case 9' || I.caseX === 'Case 11' || I.caseX === 'Case 13') Cx = reduce083(lam_x);
    else Cx = lam_x <= lamC_x ? 1 : Math.min(1, cx_c * (1 / lam_x - 0.22 / (lam_x * lam_x)));

    /* Tab 4 Case 2 auxiliary factors f1, f2, f3 (f4 is a shared sub-term). */
    var f4 = Math.pow(1.5 - Math.min(1.5, alpha), 2);
    var f1;
    if (psiy >= 0) {
      f1 = alpha <= 6 ? (1 - psiy) * (alpha - 1)
        : Math.min(14.5 - 0.35 / (alpha * alpha), 0.6 * (1 - 6 * psiy / alpha) * (alpha + 14 / alpha));
    } else if (alpha > 6 * (1 - psiy)) {
      f1 = Math.min(14.5 - 0.35 * betaC2 * betaC2, 0.6 * (1 / betaC2 + 14 * betaC2));
    } else if (alpha >= 3 * (1 - psiy)) {
      f1 = 1 / betaC2 - 1;
    } else if (alpha >= 1.5 * (1 - psiy)) {
      f1 = 1 / betaC2 - Math.pow(2 - omega * betaC2, 4) - 9 * (omega * betaC2 - 1) * (2 / 3 - betaC2);
    } else if (alpha >= 1 - psiy) {
      f1 = alpha > 1.5 ? 2 * (1 / betaC2 - 16 * Math.pow(1 - omega / 3, 4)) * (1 / betaC2 - 1)
        : 2 * (1.5 / (1 - psiy) - 1) * (1 / betaC2 - 1);
    } else f1 = 0;
    var f2;
    if (psiy >= 0) f2 = 0;
    else if (alpha >= 1.5 * (1 - psiy)) f2 = 0;
    else if (alpha >= 1 - psiy) {
      f2 = alpha > 1.5 ? 3 * betaC2 - 2 : psiy * (1 - 16 * f4 * f4) / (1 - alpha);
    } else if (alpha >= 0.75 * (1 - psiy)) {
      f2 = 1 + 2.31 * (betaC2 - 1) - 48 * (4 / 3 - betaC2) * f4 * f4;
    } else f2 = 0;
    var f3;
    if (psiy >= 1 - 4 * alpha / 3) {
      f3 = (psiy < 0 && alpha < 1 - psiy && alpha >= 0.75 * (1 - psiy))
        ? 3 * f4 * (betaC2 - 1) * (f4 / 1.81 - (alpha - 1) / 1.31) : 0;
    } else {
      var q = 9 / 16 * Math.pow(1 + Math.max(-1, psiy), 2);
      f3 = q * (q / 1.81 + (1 + 3 * psiy) / 5.24);
    }

    var Ky;
    switch (I.caseY) {
      case 'Case 6':
        Ky = psiy >= 0 ? 4 * (0.425 + alpha * alpha) / ((3 * psiy + 1) * alpha * alpha)
          : 4 * (0.425 + alpha * alpha) * (1 + psiy) / (alpha * alpha) - 5 * psiy * (1 - 3.42 * psiy) / (alpha * alpha); break;
      case 'Case 7': Ky = (0.425 + alpha * alpha) * (3 - psiy) / (2 * alpha * alpha); break;
      case 'Case 8': Ky = 1 + 0.56 / Math.pow(alpha, 2) + 0.13 / Math.pow(alpha, 4); break;
      case 'Case 10': Ky = 4 + 2.07 / Math.pow(alpha, 2) + 0.67 / Math.pow(alpha, 4); break;
      case 'Case 14': Ky = 6.97 / (alpha * alpha) + (3.1 / (alpha * alpha)) * Math.pow((4 - 1 / alpha) / 3, 4); break;
      default:                                                    // Case 2
        if (psiy >= 1 - 4 * alpha / 3) {
          Ky = psiy >= 0
            ? Ftran * 2 * Math.pow(1 + 1 / (alpha * alpha), 2) / (1 + psiy + (1 - psiy) / 100 * (2.4 / (alpha * alpha) + 6.9 * f1))
            : 200 * Ftran * Math.pow(1 + betaC2 * betaC2, 2) / ((1 - f3) * (100 + 2.4 * betaC2 * betaC2 + 6.9 * f1 + 23 * f2));
        } else {
          Ky = 5.972 * Ftran * betaC2 * betaC2 / (1 - f3);
        }
    }
    var lam_y = Math.sqrt(ReHP / (Ky * sigmaE));
    var lamP2 = median(1, lam_y * lam_y - 0.5, 3);
    var cy_c = Math.min(1.25, 1.25 - 0.12 * psiy);
    var lamC_y = cy_c / 2 * (1 + Math.sqrt(1 - 0.88 / cy_c));
    var Rf = lam_y < lamC_y ? lam_y * (1 - lam_y / cy_c) : 0.22;
    var Ff = Math.max(0, (1 - (Ky / 0.91 - 1) / lamP2) * c1);
    var Tf = lam_y + 14 / (15 * lam_y) + 1 / 3;
    var Hf = Math.max(Rf, lam_y - 2 * lam_y / (cy_c * (Tf + Math.sqrt(Math.max(0, Tf * Tf - 4)))));
    var CyBase = Math.min(1, cy_c * (1 / lam_y - (Rf + Ff * Ff * (Hf - Rf)) / (lam_y * lam_y)));
    var Cy;
    if (sy <= 0) Cy = 1;
    else if (I.caseY === 'Case 6' || I.caseY === 'Case 7' || I.caseY === 'Case 8') Cy = reduceUP(lam_y, I.upModel);
    else if (I.caseY === 'Case 10' || I.caseY === 'Case 14') Cy = reduce083(lam_y);
    else if (I.caseY === 'Case 12') Cy = alpha < 2 ? CyBase : (1.06 + 1 / (10 * alpha)) * CyBase;
    else Cy = CyBase;

    var Ktau;
    switch (I.caseT) {
      case 'Case 16': Ktau = SQ3 * (5.34 + Math.max(4 / (alpha * alpha), 7.15 / Math.pow(alpha, 2.5))); break;
      case 'Case 17': Ktau = SQ3 * (5.34 + 4 / (alpha * alpha))
        * (1 - Math.min(0.7, n(I.openDa))) * (1 - Math.min(0.7, n(I.openDb))); break;
      case 'Case 18': Ktau = SQ3 * (0.6 + 4 / (alpha * alpha)); break;
      case 'Case 19': Ktau = 8; break;
      default: Ktau = SQ3 * (5.34 + 4 / (alpha * alpha));         // Case 15
    }
    var lam_t = Math.sqrt(ReHP / (Ktau * sigmaE));
    var Ctau = lam_t <= 0.84 ? 1 : 0.84 / lam_t;

    var scx = Cx * ReHP, scy = Cy * ReHP, tc = Ctau * ReHP / SQ3;  // Sec 5 [2.2.3]

    /* Sec 5 [2.2.1] limit state. Tab 1: a tensile stress switches B to 1.0 and
       e0 to exactly 2, and Sec 5 [2.2.3] then measures against yield rather
       than the reduced buckling stress. */
    var tensile = sx < 0 || sy < 0;
    var B = tensile ? 1 : 0.7 - 0.3 * betaP / (alpha * alpha);
    var e0 = tensile ? 2 : 2 / Math.pow(betaP, 0.25);
    var L1x = tensile ? ReHP : scx, L1y = tensile ? ReHP : scy, L1t = tensile ? ReHP / SQ3 : tc;
    var ux1 = L1x === 0 ? 0 : sx * S / L1x;
    var uy1 = L1y === 0 ? 0 : sy * S / L1y;
    var ut1 = L1t === 0 ? 0 : Math.abs(tau) * S / L1t;
    var ux = scx === 0 ? 0 : sx * S / scx;
    var uy = scy === 0 ? 0 : sy * S / scy;
    var ut = tc === 0 ? 0 : Math.abs(tau) * S / tc;

    var den1 = powr(ux1, e0) + powr(uy1, e0) + powr(ut1, e0)
      - B * Math.pow(Math.abs(ux1), e0 / 2) * Math.pow(Math.abs(uy1), e0 / 2);
    var gc1 = (!isFinite(den1) || den1 <= 0) ? 999 : Math.pow(1 / den1, 1 / e0);
    var ep = 2 / Math.pow(betaP, 0.25);
    var d2 = powr(ux, ep) + powr(ut, ep);
    var gc2 = sx < 0 ? 999 : ((!isFinite(d2) || d2 <= 0) ? 999 : Math.pow(1 / d2, 1 / ep));
    var d3 = powr(uy, ep) + powr(ut, ep);
    var gc3 = sy < 0 ? 999 : ((!isFinite(d3) || d3 <= 0) ? 999 : Math.pow(1 / d3, 1 / ep));
    var gc4 = ut <= 0 ? 999 : 1 / ut;
    var gcPlate = Math.min(gc1, gc2, gc3, gc4);
    var etaPlate = gcPlate >= 999 ? 0 : 1 / gcPlate;
    var plateGov = gcPlate === gc1 ? 'Eq.1 combined' : gcPlate === gc2 ? 'Eq.2 x + shear'
      : gcPlate === gc3 ? 'Eq.3 y + shear' : 'Eq.4 pure shear';

    /* Sec 5 Symbols · [2.3.4] effective widths. The prescriptive branch works
       from the two EPP half-widths either side of the stiffener and always
       uses the Case 1 reduction curve. */
    var chi_s = (l_eff / sUsed) >= 1
      ? Math.min(1, 1.12 / (1 + 1.75 / Math.pow(l_eff / sUsed, 1.6)))
      : 0.407 * l_eff / sUsed;
    function CxOf(width) {
      var sE = PI * PI * E / (12 * (1 - nu * nu)) * Math.pow(tp / width, 2);
      var lam = Math.sqrt(ReHP / (Kx * sE));
      return lam <= lamC_x ? 1 : Math.min(1, cx_c * (1 / lam - 0.22 / (lam * lam)));
    }
    var beff1;
    if (sx <= 0) beff1 = b;
    else if (I.analysis === 'Prescriptive') {
      var w1 = n(I.beffB1) > 0 ? n(I.beffB1) : b;
      var w2 = n(I.beffB2) > 0 ? n(I.beffB2) : b;
      beff1 = (CxOf(w1) * w1 + CxOf(w2) * w2) / 2;
    } else beff1 = Cx * b;
    var beff = sx <= 0 ? chi_s * sUsed : Math.min(Cx * b, chi_s * sUsed);

    /* tw_red closes the loop back onto the coefficients: only flat bars have a
       reduced web, and it needs beff1, which is why it lands here. */
    var tw_red = !flat ? tw
      : Math.max(0.05 * tw, tw * (1 - 2 * PI * PI / 3 * Math.pow(hw / sUsed, 2) * (1 - beff1 / sUsed)));
    var As_eff = flat ? hw * tw_red : As;

    /* ================= Sec 5 [2.3] stiffener section ==================== */
    var A_tot = beff * tp + As_eff;
    var w_na = flat
      ? (hw * tw_red * (tp / 2 + hw / 2)) / A_tot
      : (Aw * (tp / 2 + hw / 2) + Af * (tp / 2 + ef)) / A_tot;
    var Istem = flat
      ? tw_red * Math.pow(hw, 3) / 12 + hw * tw_red * Math.pow(tp / 2 + hw / 2 - w_na, 2)
      : tw * Math.pow(hw, 3) / 12 + Aw * Math.pow(tp / 2 + hw / 2 - w_na, 2)
      + bf * Math.pow(tf, 3) / 12 + Af * Math.pow(tp / 2 + ef - w_na, 2);
    var I_eff = Math.max(sUsed * Math.pow(tp, 3) / (12 * 1e4),
      (beff * Math.pow(tp, 3) / 12 + beff * tp * w_na * w_na + Istem) / 1e4);
    var zTop = tp / 2 + ef + (flat ? 0 : tf / 2) - w_na;
    var Z_SI = zTop <= 0 ? 0.001 : I_eff * 1e4 / zTop / 1e3;
    var zBot = w_na + tp / 2;
    var Z_PI = zBot <= 0 ? 0.001 : I_eff * 1e4 / zBot / 1e3;

    /* Tab 6 torsional properties. */
    var I_P = flat ? Math.pow(hw, 3) * tw / (3e4)
      : (Aw * Math.pow(ef - 0.5 * tf, 2) / 3 + Af * ef * ef) * 1e-4;
    var I_T = flat
      ? hw * Math.pow(tw, 3) / (3e4) * (1 - 0.63 * tw / hw)
      : (ef - 0.5 * tf) * Math.pow(tw, 3) / (3e4) * (1 - 0.63 * tw / (ef - 0.5 * tf))
      + bf * Math.pow(tf, 3) / (3e4) * (1 - 0.63 * tf / Math.max(bf, 0.001));
    var I_w;
    if (flat) I_w = Math.pow(hw, 3) * Math.pow(tw, 3) / (36e6);
    else if (I.profile === 'T-bar') I_w = Math.pow(bf, 3) * tf * ef * ef / (12e6);
    else I_w = (Math.pow(Af, 3) + Math.pow(Aw, 3)) / (36e6)
      + ef * ef / 1e6 * ((Af * bf * bf + Aw * tw * tw) / 3
        - Math.pow(Af * (bf - 2 * df) + Aw * tw, 2) / (4 * (Af + Aw)) - Af * df * (bf - df));
    var eps = flat ? Math.pow(tp, 3) / (3 * b)
      : 1 / (3 * b / Math.pow(tp, 3) + 2 * hw / Math.pow(tw, 3));
    var l_tor = (I.brackets === 'Fitted' && n(I.bracketSpacing) > 0)
      ? Math.min(l, n(I.bracketSpacing)) : l;

    /* sigma_ET is minimised over the torsional half-wave number. Excel had to
       stop at ten hardcoded rows; here the sweep runs as far as it needs to. */
    var mMax = Math.max(10, n(I.mTorMax, 40));
    var sET = Infinity, m_tor = 1, sETrows = [];
    for (var m = 1; m <= mMax; m++) {
      var v = E / I_P * (Math.pow(m * PI / l_tor, 2) * I_w * 1e2
        + 1 / (2 * (1 + nu)) * I_T + Math.pow(l_tor / (m * PI), 2) * eps * 1e-4);
      sETrows.push({ m: m, v: v });
      if (v < sET) { sET = v; m_tor = m; }
    }
    if (m_tor >= mMax) R.warn.push('sigma_ET minimum reached the last half-wave (m = ' + mMax + '); raise the sweep limit.');
    var Phi0 = l_tor / (m_tor * hw) * 1e-4;
    var y_w;
    if (flat) y_w = tw / 2;
    else if (I.profile === 'T-bar') y_w = bf / 2;
    else if (I.profile === 'L2') y_w = bfOut + 0.5 * tw - (hw * tw * tw + tf * (bf * bf - 2 * bf * df)) / (2 * As);
    else y_w = bf - (hw * tw * tw + tf * bf * bf) / (2 * As);

    /* ============ Sec 5 [2.1] overall stiffened panel =================== */
    var cPsi = psiy >= 0 ? 0.5 * (1 + psiy) : 1 / (2 * (1 - psiy));
    var syPanel = (I.stiffArr === 'Transverse' && I.analysis === 'Prescriptive' && n(I.syStiffPlating) !== 0)
      ? n(I.syStiffPlating) : sy;                                 // Sec 5 [2.2.7]
    var sxav = (sx > 0 && syPanel > 0)
      ? Math.max(0, sx - nu * cPsi * syPanel * As_eff / (Ap + As_eff)) : sx;
    var Nx = Math.max(0, sxav) * (Ap + As_eff) / sUsed;
    var Ny = cPsi * Math.max(0, syPanel) * tp;
    var Nxy = Math.abs(tau) * tp;
    var LB1 = I.panelLocation === 'Vertically stiffened SSS bulk carrier side shell' ? 0.8 * l : l;
    var LB2 = 6 * sUsed;

    var D11 = E * I_eff * 1e4 / sUsed;
    var D22 = utype
      ? E * Math.pow(tp, 3) / (12 * (1 - nu * nu))
      * (1.2 + 4.8 * Math.min(1, Math.pow(n(I.b1u), 2) / (hw * (n(I.b1u) + n(I.b2u))))
        * Math.min(1, Math.pow(tw / tp, 3)))
      : E * Math.pow(tp, 3) / (12 * (1 - nu * nu));
    var D12 = utype ? nu * D22 : E * Math.pow(tp, 3) * nu / (12 * (1 - nu * nu));
    var D33 = E * Math.pow(tp, 3) / (12 * (1 + nu));

    var nMax = Math.max(30, n(I.nMax, 60));
    var gBi = Infinity, nGov = 0, nAny = false;
    for (var k = 1; k <= nMax; k++) {
      var den = LB2 * LB2 * Nx + k * k * LB1 * LB1 * Ny;
      if (den <= 0) continue;
      nAny = true;
      var g = PI * PI / (LB1 * LB1 * LB2 * LB2)
        * (D11 * Math.pow(LB2, 4) + 2 * (D12 + D33) * k * k * LB1 * LB1 * LB2 * LB2
          + Math.pow(k, 4) * D22 * Math.pow(LB1, 4)) / den;
      if (g < gBi) { gBi = g; nGov = k; }
    }
    if (!nAny) gBi = 999;
    if (nAny && nGov >= nMax) R.warn.push('gamma_GEB,bi minimum reached the last half-wave (n = ' + nMax + '); raise the sweep limit.');

    var gTau;
    if (Nxy <= 0) gTau = 999;
    else if (D11 * D22 >= Math.pow(D12 + D33, 2)) {
      var r = Math.pow(D12 + D33, 2) / (D11 * D22);
      gTau = Math.pow(Math.pow(D11, 3) * D22, 0.25) / (Math.pow(LB1 / 2, 2) * Nxy)
        * (8.125 + 5.64 * Math.sqrt(r) - 0.6 * r);
    } else {
      var q2 = Math.pow(D12 + D33, 2);
      gTau = Math.sqrt(2 * D11 * (D12 + D33)) / (Math.pow(LB1 / 2, 2) * Nxy)
        * (8.3 + 1.525 * D11 * D22 / q2 - 0.493 * D11 * D11 * D22 * D22 / (q2 * q2));
    }
    var gBiTau = (Nx <= 0 && Ny <= 0) ? 999
      : (gTau >= 999 ? gBi : 0.5 * gTau * gTau * (-1 / gBi + Math.sqrt(1 / (gBi * gBi) + 4 / (gTau * gTau))));
    var gGEB;
    if (Nxy > 0 && (Nx > 0 || Ny > 0)) gGEB = gBiTau;
    else if (Nxy === 0 && (Nx > 0 || Ny > 0)) gGEB = gBi;
    else if (Nxy > 0 && Nx <= 0 && Ny <= 0) gGEB = gTau;
    else gGEB = 999;
    var etaPanel = gGEB >= 999 ? 0 : 1 / gGEB;

    /* ============ Sec 5 [2.3.3] stiffener ultimate capacity ============= */
    var sxavSt = (sx > 0 && sy > 0)
      ? Math.max(0, sx - nu * cPsi * sy * As_eff / (Ap + As_eff)) : sx;
    var gReH = Math.min(ReHP, ReHS)
      / Math.sqrt(Math.max(0.001, sxavSt * sxavSt + sy * sy - sxavSt * sy + 3 * tau * tau));
    var lamG = Math.sqrt(gReH / gGEB);
    var C_sl = lamG <= 1.56 ? 1 - Math.pow(lamG, 4) / 12 : 3 / Math.pow(lamG, 4);
    var F_E = Math.pow(PI / l, 2) * E * I_eff * 1e4;

    /* Sec 5 [2.3.5]: only under FE, and only with both stresses compressive,
       is sigma_x corrected by the Poisson term. */
    var sx1 = (I.analysis === 'FE' && sx > 0 && sy > 0)
      ? (sx < nu * sy ? 0 : sx - nu * sy) : sx;
    var sigma_a = sx1 * (sUsed * tp + As_eff) / (beff1 * tp + As_eff);
    var P = n(I.P), MCL = n(I.MCL);
    var M1_SI = C_SI * Math.abs(P) * sUsed * l * l / M1div - Math.abs(MCL) * 1e6;
    var M1_PI = C_PI * Math.abs(P) * sUsed * l * l / M1div + Math.abs(MCL) * 1e6;

    function stiffMode(mode) {
      var SI = mode === 'SI';
      var Zm = SI ? Z_SI : Z_PI;
      var M1 = SI ? M1_SI : M1_PI;
      var Csnip = SI ? Csnip_SI : Csnip_PI;
      var ReH = SI ? ReHS : ReHP;
      var pole = SI ? Math.min(gGEB, sigma_a > 0 ? sET / sigma_a : gGEB) : gGEB;

      function parts(g) {
        var M0 = F_E * C_sl * g / (gGEB - g) * w0;
        var M2 = Csnip * w_na * g * Math.max(0, sx) * (Ap + As_eff);
        var sb = (M0 + M1 + M2) / (1000 * Zm);
        var sw = 0;
        if (SI && !utype && sigma_a > 0) sw = E * y_w * ef * Phi0 * Math.pow(m_tor * PI / l_tor, 2)
          * (1 / (1 - g * sigma_a / sET) - 1);
        return { M0: M0, M1: M1, M2: M2, sb: sb, sw: sw, sum: sigma_a + sb + sw };
      }
      function residual(g) { return parts(g).sum * g * S / ReH - 1; }

      var hi0 = pole * 0.999999, lo = 1e-4;
      if (!(hi0 > lo) || !isFinite(hi0)) {
        return { na: true, reason: SI ? 'gamma_GEB or sigma_ET/sigma_a is already at or below gamma' : 'gamma_GEB is already at or below gamma' };
      }
      var hi = hi0;
      /* Bisection, not fixed-point: for sniped stiffeners M2 is large and
         negative, so the residual is not monotonic and the governing root is
         the one nearest the pole. Sec 5 [1.1.3]. */
      for (var it = 0; it < 80; it++) {
        var mid = (lo + hi) / 2;
        if (residual(mid) < 0) lo = mid; else hi = mid;
      }
      var converged = (hi - lo) <= 1e-4 * Math.max(0.001, hi);
      var gc = residual(hi0) < 0 ? 999 : (lo + hi) / 2;
      var pr = parts(Math.min(gc, hi0));
      return {
        na: false, gamma: gc, eta: gc >= 999 ? 0 : 1 / gc, converged: converged,
        pole: pole, ReH: ReH, Z: Zm, M0: pr.M0, M1: pr.M1, M2: pr.M2,
        sb: pr.sb, sw: pr.sw, sum: pr.sum
      };
    }
    var SIm = stiffMode('SI'), PIm = stiffMode('PI');
    var stiffCheck = SIm.na || PIm.na;
    var etaStiff = stiffCheck ? null : Math.max(SIm.eta, PIm.eta);
    var stiffGov = stiffCheck ? 'CHECK' : (SIm.eta >= PIm.eta ? 'SI — stiffener induced' : 'PI — plate induced');

    /* ==================== Sec 2 slenderness ============================= */
    var slen = slenderness(I, {
      tp: tp, tw: tw, tf: tf, hw: hw, bf: bf, bfOut: bfOut, sUsed: sUsed, l: l,
      ReHP: ReHP, ReHS: ReHS, As: As, sx: sx, sy: sy, flat: flat
    });

    /* ==================== Sec 5 [3] and the special panels =============== */
    var pillar = pillarCheck(I, E, ReHS);
    var corr = corrugation(I, E, nu, ReHP, ReHS, S);
    var uT = utypeCheck(I, { E: E, nu: nu, ReHP: ReHP, S: S, tp: tp, tw: tw, tf: tf, hw: hw, bf: bf, a: a, sx: sx, sy: sy, tau: tau, psix: psix, psiy: psiy, cx_c: cx_c, lamC_x: lamC_x, cy_c: cy_c, alpha: alpha });
    var curved = curvedCheck(I, E, nu, ReHP, S);
    var openings = openingCheck(I, E, nu, ReHP, S);

    /* ==================== Envelope ====================================== */
    var etaAll = n(I.etaAll, 0.8);
    var rows = [
      { key: 'panel', name: 'Overall stiffened panel', ref: 'Sec 3 [3.1.1] · Sec 5 [2.1]', eta: etaPanel, mode: 'n = ' + (nGov || '—') },
      { key: 'plate', name: 'Elementary plate panel', ref: 'Sec 3 [3.2.1] · Sec 5 [2.2]', eta: etaPlate, mode: plateGov },
      { key: 'stiffSI', name: 'Stiffener — SI mode', ref: 'Sec 3 [3.3.1] · Sec 5 [2.3]', eta: SIm.na ? null : SIm.eta, mode: SIm.na ? SIm.reason : 'gamma_c = ' + SIm.gamma.toFixed(4) },
      { key: 'stiffPI', name: 'Stiffener — PI mode', ref: 'Sec 3 [3.3.1] · Sec 5 [2.3]', eta: PIm.na ? null : PIm.eta, mode: PIm.na ? PIm.reason : 'gamma_c = ' + PIm.gamma.toFixed(4) },
      { key: 'pillar', name: 'Struts / pillars / cross ties', ref: 'Sec 3 [3.6.1] · Sec 5 [3.1]', eta: pillar.active ? pillar.eta : undefined, mode: pillar.active ? '' : 'not entered' },
      { key: 'corrLocal', name: 'Corrugated bulkhead — local', ref: 'Sec 4 [3.4.1] · Sec 5 [3.2.1]', eta: corr.active ? corr.eta : undefined, mode: corr.active ? corr.gov : 'not entered' },
      { key: 'corrCol', name: 'Corrugation — overall column', ref: 'Sec 4 [3.3.2]', eta: corr.colActive ? corr.etaCol : undefined, mode: corr.colActive ? '' : 'not entered' },
      { key: 'utype', name: 'U-type stiffener — local plate', ref: 'Sec 5 [2.5.1]', eta: uT.active ? uT.eta : undefined, mode: uT.active ? uT.gov : 'profile is not U-type' },
      { key: 'curved', name: 'Curved plate panel', ref: 'Sec 5 [2.2.6] · Tab 5', eta: curved.active ? curved.eta : undefined, mode: curved.active ? '' : curved.reason },
      { key: 'opening', name: 'PSM web in way of openings', ref: 'Sec 5 [2.4.1] · Tab 7', eta: openings.active ? openings.eta : undefined, mode: openings.active ? openings.gov : 'not entered' }
    ];
    rows.forEach(function (r) {
      if (r.eta === undefined) r.status = 'na';
      else if (r.eta === null) r.status = 'check';
      else r.status = r.eta <= etaAll ? 'pass' : 'fail';
    });
    var live = rows.filter(function (r) { return typeof r.eta === 'number'; });
    var worst = live.length ? Math.max.apply(null, live.map(function (r) { return r.eta; })) : 0;
    var govRow = live.filter(function (r) { return r.eta === worst; })[0];
    var anyCheck = rows.some(function (r) { return r.status === 'check'; });
    var overall = anyCheck ? 'CHECK'
      : (worst <= etaAll && slen.status === 'PASS' ? 'PASS' : 'FAIL');

    R.net = { tp: tp, tw: tw, tf: tf, gross: gross };
    R.coef = {
      alpha: alpha, omega: omega, betaC2: betaC2, betaP: betaP, sigmaE: sigmaE, sUsed: sUsed,
      c1: c1, cTab3: cTab3, Flong: Flong, Ftran: Ftran, Aw: Aw, Af: Af, As: As, Ap: Ap,
      bfOut: bfOut, ef: ef, tw_red: tw_red, As_eff: As_eff, w0: w0, l_eff: l_eff,
      C_SI: C_SI, C_PI: C_PI, Csnip_SI: Csnip_SI, Csnip_PI: Csnip_PI, M1div: M1div, chi_s: chi_s
    };
    R.plate = {
      Kx: Kx, lam_x: lam_x, c: cx_c, lamC: lamC_x, Cx: Cx, f1: f1, f2: f2, f3: f3, f4: f4,
      Ky: Ky, lam_y: lam_y, lamP2: lamP2, cy: cy_c, lamCy: lamC_y, R: Rf, F: Ff, T: Tf, H: Hf, Cy: Cy,
      Ktau: Ktau, lam_t: lam_t, Ctau: Ctau, scx: scx, scy: scy, tc: tc,
      B: B, e0: e0, ep: ep, ux: ux, uy: uy, ut: ut, tensile: tensile,
      gc1: gc1, gc2: gc2, gc3: gc3, gc4: gc4, gamma: gcPlate, eta: etaPlate, gov: plateGov,
      beff1: beff1, beff: beff
    };
    R.panel = {
      c: cPsi, sxav: sxav, syUsed: syPanel, Nx: Nx, Ny: Ny, Nxy: Nxy, LB1: LB1, LB2: LB2,
      D11: D11, D12: D12, D22: D22, D33: D33, gBi: gBi, nGov: nGov, nMax: nMax,
      gTau: gTau, gBiTau: gBiTau, gGEB: gGEB, eta: etaPanel
    };
    R.stiff = {
      A_tot: A_tot, w_na: w_na, I_eff: I_eff, Z_SI: Z_SI, Z_PI: Z_PI,
      I_P: I_P, I_T: I_T, I_w: I_w, eps: eps, l_tor: l_tor, sET: sET, m_tor: m_tor, mMax: mMax,
      Phi0: Phi0, y_w: y_w, sxav: sxavSt, gReH: gReH, lamG: lamG, C_sl: C_sl, F_E: F_E,
      sx1: sx1, sigma_a: sigma_a, SI: SIm, PI: PIm, eta: etaStiff, gov: stiffGov, check: stiffCheck
    };
    R.slen = slen;
    R.pillar = pillar; R.corr = corr; R.utype = uT; R.curved = curved; R.openings = openings;
    R.env = {
      rows: rows, etaAll: etaAll, worst: worst,
      governing: govRow ? govRow.name : '—', overall: overall,
      slenderness: slen.status, anyCheck: anyCheck
    };
    R.valid = validate(I, { alpha: alpha, sUsed: sUsed });
    return R;
  }

  /* ======================= Sec 2 slenderness ============================ */
  function slenderness(I, g) {
    var out = { rows: [] };
    var cap = I.applyCtCap !== 'Yes' ? Infinity
      : (I.stiffArr === 'Longitudinal' ? (g.sx > 0 ? g.sx : Infinity) : (g.sy > 0 ? g.sy : Infinity));
    /* Sec 2 [2.1.1]: sigma_ct is capped at the applied compressive stress when
       that is known, and the required thickness inverts through ReH/(4-4x/ReH)
       above half yield. */
    function ct(frac, ReH) {
      var v = Math.min(frac * ReH, cap);
      return v <= 0.5 * ReH ? v : ReH / (4 - 4 * v / ReH);
    }
    function req(bDim, frac, ReH, K) { return 2.32 * bDim * 1e-3 * Math.sqrt(ct(frac, ReH) / K); }

    function add(name, required, actual, unit, ref, invert) {
      var st;
      if (required === null || actual === null) st = 'na';
      else st = (invert ? actual <= required : actual >= required) ? 'PASS' : 'FAIL';
      out.rows.push({ name: name, req: required, act: actual, unit: unit, ref: ref, status: st });
      return st;
    }

    add('Plate panel (stiffened)', req(g.sUsed, 0.2, g.ReHP, 4), g.tp, 'mm',
      'K = 4 · sigma_ct = 0.2 ReH_P · Sec 2 [2.1.1]');
    add('Stiffener web', req(g.hw, 0.5, g.ReHS, g.flat ? 0.43 : (I.profile === 'Bulb' ? 1.25 : 4)), g.tw, 'mm',
      'K = 0.43 flat · 1.25 bulb · 4 otherwise · sigma_ct = 0.5 ReH_S · Sec 2 [2.1.1]');
    add('Stiffener flange', g.flat ? null : req(g.bfOut, 0.9, g.ReHS, 0.43), g.flat ? null : g.tf, 'mm',
      'K = 0.43 · b = bf_out · sigma_ct = 0.9 ReH_S · Sec 2 [2.1.1]');
    var propNA = g.flat || I.profile === 'Bulb';
    add('Flange breadth', propNA ? null : 0.2 * g.hw, propNA ? null : g.bf, 'mm',
      'bf >= 0.2 hw for angle, T-bar, L2 · Sec 2 [3.1.1]');

    /* Primary supporting members, Sec 2 [4.1.1]. */
    var A_eff = (g.As + 0.8 * g.sUsed * g.tp) / 100;
    var I_st = 1.43 * Math.pow(g.l / 1000, 2) * A_eff * g.ReHP / 235;
    var psmReq = 300 * Math.pow(n(I.lBdg), 4) / (Math.pow(n(I.sPsm), 3) * g.sUsed) * I_st;
    out.A_eff = A_eff; out.I_st = I_st;
    add('PSM stiffness', psmReq, n(I.iPsm), 'cm4',
      'I >= 300 l_bdg^4 / (S^3 s) I_st · Sec 2 [4.1.1]');

    /* Web stiffeners on PSM, Sec 2 Tab 1. */
    var wsReq = I.wsArrangement === 'A - along PSM span'
      ? 0.72 * Math.pow(n(I.lWs), 2) * n(I.aEffWs) * g.ReHS / 235
      : 1.14 * n(I.lWs) * Math.pow(n(I.sWs), 2) * n(I.twPsm)
      * (2.5 * 1000 * n(I.lWs) / n(I.sWs) - 2 * n(I.sWs) / (1000 * n(I.lWs))) * g.ReHS / 235 * 1e-5;
    add('Web stiffener stiffness', wsReq, n(I.iWs), 'cm4', 'Sec 2 Tab 1 arrangement A / B');

    /* Brackets, Sec 2 [5]. The whole block can be switched off when the
       bracket entries do not describe the assessed structure. */
    var bOn = I.bracketsApplicable !== 'No';
    var db = n(I.db), lb = n(I.lb), tb = n(I.tb);
    if (bOn) {
      var sbReq = Math.max(n(I.bfPsm) * (I.flangeSym === 'Symmetrical' ? 0.022 : 0.033)
        * Math.sqrt(n(I.afPsm) / (n(I.afPsm) + n(I.awPsm) / 3)) * (235 / g.ReHS),
        I.bracketLocation === 'Tank/hold boundary' ? 3 : 4);
      add('Tripping bracket spacing', sbReq, n(I.sbActual), 'm', 'Sb <= max[...] · Sec 2 [5.1.1]', true);
      var C = I.edgeStiffFitted === 'Yes' ? 70 : 20 * median(0.25, db / lb, 1) + 16;
      add('Bracket web thickness', db / C * Math.sqrt(g.ReHS / 235), tb, 'mm',
        'tb >= db/C sqrt(ReH/235) · Sec 2 [5.1.2] and Tab 2');
      var needEdge = lb > 75 * tb;
      out.rows.push({
        name: 'Edge stiffening required?', req: 75 * tb, act: lb, unit: 'mm',
        ref: 'l_b > 75 tb triggers an edge stiffener · Sec 2 [5.1.2]',
        status: !needEdge ? 'NOT REQUIRED' : (I.edgeStiffFitted === 'Yes' ? 'REQUIRED - FITTED' : 'REQUIRED - MISSING')
      });
      add('Edge stiffener web depth',
        I.edgeStiffFitted !== 'Yes' ? null
          : Math.max((I.bracketType === 'End bracket' ? 75 : 50) * lb * Math.sqrt(g.ReHS / 235) * 1e-3, 50),
        I.edgeStiffFitted !== 'Yes' ? null : n(I.hwEdge), 'mm',
        'hw >= max[C l_b sqrt(ReH/235) 1e-3 ; 50] · Sec 2 [5.3.1]');
    } else {
      ['Tripping bracket spacing', 'Bracket web thickness', 'Edge stiffening required?', 'Edge stiffener web depth']
        .forEach(function (nm) {
          out.rows.push({ name: nm, req: null, act: null, unit: '', ref: 'Bracket block switched off', status: 'na' });
        });
    }

    out.fails = out.rows.filter(function (r) { return r.status === 'FAIL' || r.status === 'REQUIRED - MISSING'; }).length;
    out.status = out.fails === 0 ? 'PASS' : 'FAIL';
    return out;
  }

  /* ================= Sec 5 [3.1] struts, pillars, cross ties ============ */
  function pillarCheck(I, E, ReHS) {
    var A = n(I.pillarA), Ip = n(I.pillarI), lp = n(I.pillarL), sav = n(I.pillarSigma);
    var active = A > 0 && Ip > 0 && lp > 0;
    var fEnd = I.pillarEnd === 'Both simply supported' ? 1
      : (I.pillarEnd === 'One end fixed' || I.pillarEnd === 'Cross tie') ? 2 : 4;
    var sEC = active ? PI * PI * E * fEnd * Ip / (A * lp * lp) * 1e-4 : 0;
    var sET = n(I.pillarSigmaET), sETF = n(I.pillarSigmaETF);
    var sE = active ? Math.min(sEC, sETF > 0 ? sETF : (sET > 0 ? sET : sEC)) : 0;
    var scr = sE <= 0.5 * ReHS ? sE : (1 - ReHS / (4 * sE)) * ReHS;
    var eta = scr <= 0 ? 0 : sav / scr;
    var r = n(I.pillarR), tOff = n(I.pillarT);
    return {
      active: active, fEnd: fEnd, sEC: sEC, sE: sE, scr: scr, eta: active ? eta : 0,
      circActive: r > 0, tReq: r > 0 ? r / 50 : null, tOff: tOff,
      circStatus: r > 0 ? (tOff >= r / 50 ? 'PASS' : 'FAIL') : 'na'
    };
  }

  /* ============ Sec 5 [3.2.1] corrugation local + Sec 4 [3.3.2] column === */
  function corrugation(I, E, nu, ReHP, ReHS, S) {
    /* Local buckling of a corrugation member is the plate limit state with the
       Tab 2 corrugation entry (c1 = 1) and a fixed aspect ratio of 2. */
    function one(bC, tC, sx, sy, tau) {
      if (!(bC > 0 && tC > 0)) return null;
      var sE = PI * PI * E / (12 * (1 - nu * nu)) * Math.pow(tC / bC, 2);
      var Kx = 8.4 / (1 + 1.1);
      var lx = Math.sqrt(ReHP / (Kx * sE));
      var lamC = 1.13 / 2 * (1 + Math.sqrt(1 - 0.88 / 1.13));
      var Cx = sx <= 0 ? 1 : (lx <= lamC ? 1 : Math.min(1, 1.13 * (1 / lx - 0.22 / (lx * lx))));
      var Ky = 2 * Math.pow(1 + 1 / 4, 2) / 2;
      var ly = Math.sqrt(ReHP / (Ky * sE));
      var Rf = ly < lamC ? ly * (1 - ly / 1.13) : 0.22;
      var Ff = Math.max(0, (1 - (Ky / 0.91 - 1) / median(1, ly * ly - 0.5, 3)) * Math.max(0, 1 - 1 / 2));
      var Tf = ly + 14 / (15 * ly) + 1 / 3;
      var Hf = Math.max(Rf, ly - 2 * ly / (1.13 * (Tf + Math.sqrt(Math.max(0, Tf * Tf - 4)))));
      var Cy = sy <= 0 ? 1 : Math.min(1, 1.13 * (1 / ly - (Rf + Ff * Ff * (Hf - Rf)) / (ly * ly)));
      var Kt = SQ3 * (5.34 + 4 / 4);
      var lt = Math.sqrt(ReHP / (Kt * sE));
      var Ct = lt <= 0.84 ? 1 : 0.84 / lt;
      var scx = Cx * ReHP, scy = Cy * ReHP, tc = Ct * ReHP / SQ3;
      var bp = bC / tC * Math.sqrt(ReHP / E);
      var tens = sx < 0 || sy < 0;
      var B = tens ? 1 : 0.7 - 0.3 * bp / 4;
      var e0 = tens ? 2 : 2 / Math.pow(bp, 0.25);
      var ux = scx === 0 ? 0 : sx * S / scx, uy = scy === 0 ? 0 : sy * S / scy,
        ut = tc === 0 ? 0 : Math.abs(tau) * S / tc;
      var d1 = powr(ux, e0) + powr(uy, e0) + powr(ut, e0)
        - B * Math.pow(Math.abs(ux), e0 / 2) * Math.pow(Math.abs(uy), e0 / 2);
      var g1 = (!isFinite(d1) || d1 <= 0) ? 999 : Math.pow(1 / d1, 1 / e0);
      var ep = 2 / Math.pow(bp, 0.25);
      var d2 = powr(ux, ep) + powr(ut, ep);
      var g2 = sx < 0 ? 999 : ((!isFinite(d2) || d2 <= 0) ? 999 : Math.pow(1 / d2, 1 / ep));
      var d3 = powr(uy, ep) + powr(ut, ep);
      var g3 = sy < 0 ? 999 : ((!isFinite(d3) || d3 <= 0) ? 999 : Math.pow(1 / d3, 1 / ep));
      var g4 = ut <= 0 ? 999 : 1 / ut;
      var gc = Math.min(g1, g2, g3, g4);
      return { sE: sE, Cx: Cx, Cy: Cy, Ct: Ct, gamma: gc, eta: gc >= 999 ? 0 : 1 / gc };
    }
    var c1 = one(n(I.corrB1), n(I.corrT1), n(I.corrSx1), n(I.corrSy1), n(I.corrTau1));
    var c2 = one(n(I.corrB2), n(I.corrT2), n(I.corrSx2), n(I.corrSy2), n(I.corrTau2));
    var active = !!(c1 || c2);
    var e1 = c1 ? c1.eta : 0, e2 = c2 ? c2.eta : 0;
    var eta = Math.max(e1, e2);

    /* Sec 4 [3.3.2]: the corrugation unit checked as a pillar over its length. */
    var bF = n(I.corrBf), bW = n(I.corrBw), tF = n(I.corrTf), tW = n(I.corrTw),
      phi = n(I.corrPhi), lc = n(I.corrL), sav = n(I.corrSigmaAv);
    var colActive = bF > 0 && bW > 0 && tF > 0 && tW > 0 && lc > 0;
    var depth = bW * Math.sin(phi * PI / 180);
    var Aunit = (bF * tF + bW * tW) / 100;
    var yna = Aunit <= 0 ? 0 : (bW * tW * (depth / 2)) / (bF * tF + bW * tW);
    var Iunit = ((bF * tF * yna * yna) + (tW * Math.pow(bW, 3) * Math.pow(Math.sin(phi * PI / 180), 2) / 12)
      + (bW * tW * Math.pow(depth / 2 - yna, 2))) / 1e4;
    var fEnd = I.corrStool === 'Yes' ? 4 : 1;
    var sEC = colActive ? PI * PI * E * fEnd * Iunit / (Aunit * lc * lc) * 1e-4 : 0;
    var scr = sEC <= 0.5 * ReHS ? sEC : (1 - ReHS / (4 * sEC)) * ReHS;
    return {
      active: active, c1: c1, c2: c2, eta: eta,
      gov: e1 >= e2 ? 'Comb 1 (max sigma_x)' : 'Comb 2 (max tau)',
      colActive: colActive, depth: depth, Aunit: Aunit, yna: yna, Iunit: Iunit,
      fEnd: fEnd, sEC: sEC, scr: scr, etaCol: colActive && scr > 0 ? sav / scr : 0
    };
  }

  /* ================= Sec 5 [2.5.1] U-type local plate =================== */
  function utypeCheck(I, g) {
    if (I.profile !== 'U-type') return { active: false, panels: [] };
    var b1 = n(I.b1u), b2 = n(I.b2u), a = g.a, tp = g.tp, tw = g.tw, tf = g.tf, hw = g.hw, bf = g.bf;
    var cU = n(I.cUtype, 0.4);
    function ftran0(bA, bB) {
      if (bA <= 0 || bB <= 0) return null;
      return Math.min(bA / bB + 6 * bA * bA / (PI * PI * hw * (bA + bB)) * Math.pow(tw / tp, 3), 6);
    }
    function ftran(f0) { return f0 === null ? null : Math.min(2.25, Math.max(3 - 0.08 * Math.pow(f0 - 6, 2), 1)); }
    var Ft1 = ftran(ftran0(b1, b2)), Ft2 = ftran(ftran0(b2, b1));
    var FlongU = (b1 <= 0 || b2 <= 0) ? null
      : (b2 < b1 ? 1 : (1.55 - 0.55 * b1 / b2) * (1 + cU * Math.pow(tw / tp, 3)));

    /* Sec 5 [2.5.1]: the two attached-plate panels use the U-type Flong/Ftran;
       the face plate and web use the UP-B model with Flong = Ftran = 1. */
    function panel(name, width, thk, Fl, Ft, upb) {
      if (!(width > 0)) return { name: name, active: false };
      var al = a / width;
      var sE = PI * PI * g.E / (12 * (1 - g.nu * g.nu)) * Math.pow(thk / width, 2);
      var Kx = (upb ? 1 : Fl) * 8.4 / (g.psix + 1.1);
      var lx = Math.sqrt(g.ReHP / (Kx * sE));
      var Cx = g.sx <= 0 ? 1 : (upb ? (lx <= 0.7 ? 1 : Math.min(1, 1 / (lx * lx + 0.51)))
        : (lx <= g.lamC_x ? 1 : Math.min(1, g.cx_c * (1 / lx - 0.22 / (lx * lx)))));
      var Ky = (upb ? 1 : Ft) * 2 * Math.pow(1 + 1 / (al * al), 2)
        / (1 + g.psiy + (1 - g.psiy) / 100 * (2.4 / (al * al)));
      var ly = Math.sqrt(g.ReHP / (Ky * sE));
      var Cy;
      if (g.sy <= 0) Cy = 1;
      else if (upb) Cy = ly <= 0.7 ? 1 : Math.min(1, 1 / (ly * ly + 0.51));
      else {
        var Rf = ly < g.lamC_x ? ly * (1 - ly / g.cy_c) : 0.22;
        var Ff = Math.max(0, (1 - (Ky / (0.91 * Ft) - 1) / median(1, ly * ly - 0.5, 3)) * Math.max(0, 1 - 1 / al));
        var Tf = ly + 14 / (15 * ly) + 1 / 3;
        var Hf = Math.max(Rf, ly - 2 * ly / (g.cy_c * (Tf + Math.sqrt(Math.max(0, Tf * Tf - 4)))));
        Cy = Math.min(1, g.cy_c * (1 / ly - (Rf + Ff * Ff * (Hf - Rf)) / (ly * ly)));
      }
      var Kt = SQ3 * (5.34 + 4 / (al * al));
      var lt = Math.sqrt(g.ReHP / (Kt * sE));
      var Ct = lt <= 0.84 ? 1 : 0.84 / lt;
      var scx = Cx * g.ReHP, scy = Cy * g.ReHP, tc = Ct * g.ReHP / SQ3;
      var bp = width / thk * Math.sqrt(g.ReHP / g.E);
      var tens = g.sx < 0 || g.sy < 0;
      var B = tens ? 1 : 0.7 - 0.3 * bp / (al * al);
      var e0 = tens ? 2 : 2 / Math.pow(bp, 0.25);
      var ux = scx === 0 ? 0 : g.sx * g.S / scx, uy = scy === 0 ? 0 : g.sy * g.S / scy,
        ut = tc === 0 ? 0 : Math.abs(g.tau) * g.S / tc;
      var d1 = powr(ux, e0) + powr(uy, e0) + powr(ut, e0)
        - B * Math.pow(Math.abs(ux), e0 / 2) * Math.pow(Math.abs(uy), e0 / 2);
      var g1 = (!isFinite(d1) || d1 <= 0) ? 999 : Math.pow(1 / d1, 1 / e0);
      var ep = 2 / Math.pow(bp, 0.25);
      var d2 = powr(ux, ep) + powr(ut, ep);
      var g2 = g.sx < 0 ? 999 : ((!isFinite(d2) || d2 <= 0) ? 999 : Math.pow(1 / d2, 1 / ep));
      var d3 = powr(uy, ep) + powr(ut, ep);
      var g3 = g.sy < 0 ? 999 : ((!isFinite(d3) || d3 <= 0) ? 999 : Math.pow(1 / d3, 1 / ep));
      var g4 = ut <= 0 ? 999 : 1 / ut;
      var gc = Math.min(g1, g2, g3, g4);
      return {
        name: name, active: true, b: width, alpha: al, sE: sE, Cx: Cx, Cy: Cy, Ctau: Ct,
        gamma: gc, eta: gc >= 999 ? 0 : 1 / gc
      };
    }
    var panels = [
      panel('EPP b1', b1, tp, FlongU, Ft1, false),
      panel('EPP b2', b2, tp, FlongU, Ft2, false),
      panel('EPP bf', bf, tf, 1, 1, true),
      panel('EPP hw', hw, tw, 1, 1, true)
    ];
    var live = panels.filter(function (p) { return p.active; });
    var eta = live.length ? Math.max.apply(null, live.map(function (p) { return p.eta; })) : 0;
    var gov = live.filter(function (p) { return p.eta === eta; })[0];
    return {
      active: true, panels: panels, Ftran1: Ft1, Ftran2: Ft2, Flong: FlongU,
      eta: eta, gov: gov ? gov.name : '—'
    };
  }

  /* ================= Sec 5 [2.2.6] curved plate panels ================== */
  function curvedCheck(I, E, nu, ReHP, S) {
    var Rr = n(I.curvR), tp = n(I.curvT), d = n(I.curvD);
    if (!(Rr > 0 && tp > 0 && d > 0)) return { active: false, reason: 'geometry not entered' };
    var ratio = Rr / tp;
    if (ratio > 2500) return { active: false, reason: 'R/tp > 2500 — treat as a plane panel', ratio: ratio };
    var sax = Math.max(0, n(I.curvSax)), stg = Math.max(0, n(I.curvStg)), tau = n(I.curvTau);
    var sE = PI * PI * E / (12 * (1 - nu * nu)) * Math.pow(tp / d, 2);
    var dR = d / Rr, sq = Math.sqrt(ratio);
    var Kax = dR <= 0.5 * sq ? 1 + 2 / 3 * d * d / (Rr * tp)
      : Math.max(0.267 * d * d / (Rr * tp) * (3 - d / Rr * Math.sqrt(tp / Rr)), 0.4 * d * d / (Rr * tp));
    var lax = Math.sqrt(ReHP / (Kax * sE));
    var Cax = sax <= 0 ? 1 : (lax <= 0.25 ? 1 : lax <= 1 ? 1.233 - 0.933 * lax
      : lax <= 1.5 ? 0.3 / Math.pow(lax, 3) : 0.2 / (lax * lax));
    var Ktg = dR <= 1.63 * sq ? d / Math.sqrt(Rr * tp) + 3 * Math.pow(Rr * tp, 0.175) / Math.pow(d, 0.35)
      : 0.3 * d * d / (Rr * Rr) + 2.25 * Math.pow(Rr * Rr / (d * tp), 2);
    var ltg = Math.sqrt(ReHP / (Ktg * sE));
    var Ctg = stg <= 0 ? 1 : (ltg <= 0.4 ? 1 : ltg <= 1.2 ? 1.274 - 0.686 * ltg : 0.65 / (ltg * ltg));
    var Kt = dR <= 8.7 * sq ? SQ3 * Math.sqrt(28.3 + 0.67 * Math.pow(d, 3) / (Math.pow(Rr, 1.5) * Math.pow(tp, 1.5)))
      : SQ3 * 0.28 * d * d / (Rr * Math.sqrt(Rr * tp));
    var lt = Math.sqrt(ReHP / (Kt * sE));
    var Ct = tau === 0 ? 1 : (lt <= 0.4 ? 1 : lt <= 1.2 ? 1.274 - 0.686 * lt : 0.65 / (lt * lt));

    function res(gm) {
      var ua = gm * sax * S / (Cax * ReHP), ug = gm * stg * S / (Ctg * ReHP),
        uu = gm * Math.abs(tau) * SQ3 * S / (Ct * ReHP);
      return Math.pow(ua, 1.25) + Math.pow(ug, 1.25) + uu * uu - 0.5 * ua * ug - 1;
    }
    var hi = Math.min(
      sax > 0 ? Cax * ReHP / (sax * S) : 1e9,
      stg > 0 ? Ctg * ReHP / (stg * S) : 1e9,
      Math.abs(tau) > 0 ? Ct * ReHP / (Math.abs(tau) * SQ3 * S) : 1e9);
    var lo = 1e-6;
    for (var i = 0; i < 80; i++) { var mid = (lo + hi) / 2; if (res(mid) < 0) lo = mid; else hi = mid; }
    var gc = (lo + hi) / 2;
    return {
      active: true, ratio: ratio, sE: sE, Kax: Kax, Cax: Cax, Ktg: Ktg, Ctg: Ctg, Ktau: Kt, Ctau: Ct,
      gamma: gc, eta: gc <= 0 ? 0 : 1 / gc
    };
  }

  /* ================= Sec 5 [2.4] PSM web in way of openings ============= */
  function openingCheck(I, E, nu, ReHP, S) {
    var h = n(I.opH), h0 = n(I.opH0);
    function one(name, a, b, tw, sav, tav, da, db) {
      if (!(a > 0 && b > 0 && tw > 0)) return { name: name, active: false };
      var tauUsed;
      if (I.opModelled === 'Yes') tauUsed = tav;
      else if (I.opConfig === '(a) without edge reinforcement' && I.opCase17 === 'Yes') tauUsed = tav;
      else if (h - h0 <= 0) return { name: name, active: false, err: 'h0 >= h' };
      else tauUsed = tav * (h / (h - h0));

      var al = a / b;
      var sE = PI * PI * E / (12 * (1 - nu * nu)) * Math.pow(tw / b, 2);
      var edge = I.opConfig === '(b) with edge reinforcement';
      var Kx = edge ? 8.4 / (1 + 1.1) : 4 * (0.425 + 1 / (al * al)) / 4;
      var lx = Math.sqrt(ReHP / (Kx * sE));
      var cc = Math.min(1.25, 1.25 - 0.12);
      var lamC = cc / 2 * (1 + Math.sqrt(1 - 0.88 / cc));
      var Cx;
      if (sav <= 0) Cx = 1;
      else if (edge) Cx = lx <= lamC ? 1 : Math.min(1, cc * (1 / lx - 0.22 / (lx * lx)));
      else Cx = I.opMethod === 'Method A' ? (lx <= 0.75 ? 1 : Math.min(1, 0.75 / lx))
        : (lx <= 0.7 ? 1 : Math.min(1, 1 / (lx * lx + 0.51)));
      var Kt;
      if (edge) Kt = SQ3 * (5.34 + 4 / (al * al));
      else if (I.opModelled === 'No' && I.opCase17 === 'Yes') {
        Kt = SQ3 * (5.34 + 4 / (al * al))
          * (1 - Math.min(0.7, a > 0 ? da / a : 0)) * (1 - Math.min(0.7, b > 0 ? db / b : 0));
      } else Kt = SQ3 * (0.6 + 4 / (al * al));
      var lt = Math.sqrt(ReHP / (Kt * sE));
      var Ct = lt <= 0.84 ? 1 : Math.min(1, 0.84 / lt);
      var scx = Cx * ReHP, tc = Ct * ReHP / SQ3;
      var bp = b / tw * Math.sqrt(ReHP / E);
      var ep = 2 / Math.pow(bp, 0.25);
      var ux = scx === 0 ? 0 : sav * S / scx;
      var ut = tc === 0 ? 0 : Math.abs(tauUsed) * S / tc;
      var d1 = powr(ux, ep) + powr(ut, ep);
      var g1 = (!isFinite(d1) || d1 <= 0) ? 999 : Math.pow(1 / d1, 1 / ep);
      var g2 = ut <= 0 ? 999 : 1 / ut;
      var gc = Math.min(g1, g2);
      return {
        name: name, active: true, tauUsed: tauUsed, alpha: al, sE: sE, Kx: Kx, Cx: Cx,
        Ktau: Kt, Ctau: Ct, gamma: gc, eta: gc >= 999 ? 0 : 1 / gc
      };
    }
    var p1 = one('Panel P1', n(I.opA1), n(I.opB1), n(I.opTw1), n(I.opSav1), n(I.opTav1), n(I.opDa), n(I.opDb));
    var p2 = one('Panel P2', n(I.opA2), n(I.opB2), n(I.opTw2), n(I.opSav2), n(I.opTav2), n(I.opDa), n(I.opDb));
    var live = [p1, p2].filter(function (p) { return p.active; });
    if (!live.length) return { active: false, panels: [p1, p2] };
    var eta = Math.max.apply(null, live.map(function (p) { return p.eta; }));
    var gov = live.filter(function (p) { return p.eta === eta; })[0];
    return { active: true, panels: [p1, p2], eta: eta, gov: gov.name };
  }

  /* ======================= Input validation ============================= */
  function validate(I, g) {
    var v = [];
    function add(label, state, value, why) { v.push({ label: label, state: state, value: value, why: why }); }
    add('a >= b', n(I.a) >= n(I.b) ? 'ok' : 'warn', n(I.a) >= n(I.b) ? 'OK' : 'SWAP a AND b',
      'Tab 4 evaluates every buckling factor for a as the LONGER side.');
    var longi = I.stiffArr === 'Longitudinal';
    var same = Math.abs(n(I.s) - n(I.b)) <= 0.001 * Math.max(1, n(I.b));
    add('s vs b consistency', (longi ? same : !same) ? 'ok' : 'warn', (longi ? same : !same) ? 'OK' : 'CHECK',
      'Longitudinal stiffening expects s = b; transverse expects s <> b.');
    add('l vs a consistency', n(I.l) === n(I.a) ? 'ok' : 'warn', n(I.l) === n(I.a) ? 'OK' : 'CHECK',
      'The stiffener span normally equals the long side — both are the PSM spacing.');
    if (I.profile === 'Flat bar') {
      add('Flat bar geometry', (n(I.bf) === 0 && n(I.tf) === 0) ? 'ok' : 'warn',
        (n(I.bf) === 0 && n(I.tf) === 0) ? 'OK' : 'SET bf = tf = 0',
        'A flat bar has no flange; non-zero bf or tf corrupts ef, I_w and y_w.');
    } else if (I.profile === 'U-type') {
      add('U-type geometry', (n(I.b1u) > 0 && n(I.b2u) > 0) ? 'ok' : 'warn',
        (n(I.b1u) > 0 && n(I.b2u) > 0) ? 'OK' : 'ENTER b1 AND b2',
        'U-type stiffeners need b1 and b2; the spacing becomes s = b1 + b2.');
    } else {
      add('Flange geometry', (n(I.bf) > 0 && n(I.tf) > 0) ? 'ok' : 'warn',
        n(I.bf) <= 0 ? 'ENTER bf' : (n(I.tf) <= 0 ? 'ENTER tf' : 'OK'),
        'Angle, bulb, T-bar and L2 profiles need both bf and tf.');
    }
    var noComp = n(I.sx) <= 0 && n(I.sy) <= 0 && n(I.tau) === 0;
    add('Stress sign convention', noComp ? 'warn' : 'ok', noComp ? 'NO COMPRESSION' : 'OK',
      'Compression and shear are POSITIVE, tension NEGATIVE — Sec 1 [1.2.3].');
    var psiBad = n(I.psix) > 1 || n(I.psiy) > 1;
    add('Edge stress ratio range', psiBad ? 'warn' : 'ok', psiBad ? 'psi > 1' : 'OK',
      'psi is the ratio of the minimum to the maximum edge stress, so it cannot exceed 1.0.');
    var netOk = I.thickBasis === 'Net (corrosion deducted)';
    add('Net thickness basis', 'ok', netOk ? 'NET' : 'GROSS — tc deducted',
      'NR615 works on net scantlings; gross entries have the corrosion additions deducted here.');
    if (I.analysis === 'Prescriptive') {
      var bad = longi ? n(I.sy) !== 0 : n(I.sx) !== 0;
      add('Prescriptive stress combination', bad ? 'warn' : 'ok',
        bad ? (longi ? 'sigma_y SHOULD BE 0' : 'sigma_x SHOULD BE 0') : 'OK',
        'Sec 3 [2.1.1]: longitudinal takes sigma_y = 0, transverse takes sigma_x = 0.');
    } else {
      add('Prescriptive stress combination', 'na', 'n/a — FE', 'FE assessment is exempt from Sec 3 [2.1.1].');
    }
    if (I.stiffArr === 'Transverse' && I.analysis === 'Prescriptive') {
      var reuse = n(I.syStiffPlating) === 0;
      add('Sec 5 [2.2.7] carve-out', reuse ? 'warn' : 'ok', reuse ? 'USING EPP VALUE' : 'OK',
        'The overall panel capacity wants the transverse stress at the stiffener attached-plating LCP.');
    }
    return v;
  }

  return {
    solve: solve, CASES_X: CASES_X, CASES_Y: CASES_Y, CASES_T: CASES_T, median: median, num: n
  };
})();
