/* ==========================================================================
   23-long-strength.js  —  LR Pt 3 Ch 4 longitudinal strength + section-property bridge
   Extracted verbatim from Index.html (lines 15774–16276 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// =============================================================================
// BRIDGE — Scantling ↔ Drawing integration
// =============================================================================
// ==========================================================================
// LR Pt 3 Ch 4 — LONGITUDINAL STRENGTH
// Rule-based longitudinal strength calculator (July 2025 LR Rules).
// Ported from Python reference module `lr_pt3_ch4.py`.
//
// APPROACH:
//   • Principal particulars + section properties → rule-based Mw, Z_min, I_min, σ_perm
//   • Ms_design input (defaults 0 = wave-only) — user can later plug real Ms
//   • F_D, F_B computed from section + Mw (replacing the user's 0.85 assumption)
//   • Compliance check: actual Z_B/Z_D vs Z_min, actual I vs I_min
//
// All formulas per LR Pt 3 Ch 4 Section 5.2, 5.4.1, 5.7, 5.8.1, 6.3.1.
// ==========================================================================
const LongStrength = (function() {
  // C1 — Table 4.5.1 wave factor
  function calcC1(L) {
    // LR Pt 3 Ch 4 Sec 5.2.1 / Table 4.5.1 — C1 wave coefficient:
    //   L < 90 m:            C1 = 0.065·L + 1.857
    //   90 ≤ L ≤ 300:        C1 = 10.75 − ((300−L)/100)^1.5
    //   300 < L ≤ 350:       C1 = 10.75
    //   350 < L ≤ 500:       C1 = 10.75 − ((L−350)/150)^1.5
    // (L>500 is out of rule scope — clamp to 10.75 as a guard.)
    // Note: Formula joins continuously: at L=90, both 0.065·90+1.857 = 7.707
    // and 10.75−((300−90)/100)^1.5 = 10.75−3.043 = 7.707 ✓
    if (L < 90) return 0.065 * L + 1.857;
    if (L <= 300) return 10.75 - Math.pow((300 - L) / 100, 1.5);
    if (L <= 350) return 10.75;
    if (L <= 500) return 10.75 - Math.pow((L - 350) / 150, 1.5);
    return 10.75;  // extrapolation guard
  }
  
  // Cb_rule — 5.2 note: Cb ≥ 0.60 for rule
  function calcCbRule(Cb) { return Math.max(Cb, 0.60); }
  
  // Mwo (kN·m) — 5.2.1: Mwo = 0.1 · C1 · C2 · L² · B · (Cb+0.7) (C2=1 amidships)
  function calcMwo(C1, L, B, Cb) {
    const Cb_r = calcCbRule(Cb);
    return 0.1 * C1 * 1.0 * L * L * B * (Cb_r + 0.7);
  }
  
  // f2 factors
  function calcF2Sag() { return -1.1; }
  function calcF2Hog(Cb) { const Cb_r = calcCbRule(Cb); return 1.9 * Cb_r / (Cb_r + 0.7); }
  
  // Service scaling (5.2.3)
  function serviceScale(serviceType) {
    if (serviceType === 'short_voyage') return 0.8;
    if (serviceType === 'sheltered')    return 0.5;
    return 1.0;  // unrestricted default
  }
  
  // Z_min (m³) — LR Pt 3 Ch 4 Sec 5.4.1:
  //   Z_min = f1 · kL · C1 · L² · B · (Cb + 0.7) × 10⁻⁶    [m³]
  //   "f1 is to be taken not less than 0.5" — enforce lower bound.
  function calcZmin(f1, kL, C1, L, B, Cb) {
    const Cb_r = calcCbRule(Cb);
    const f1_eff = Math.max(f1, 0.5);  // LR floor
    return f1_eff * kL * C1 * L * L * B * (Cb_r + 0.7) * 1e-6;
  }
  
  // I_min (m⁴) — LR Pt 3 Ch 4 Sec 5.8.1
  // TWO requirements; the larger of (a) and (b) governs.
  //
  // (a) Stress-based (every L):
  //       I_min = 3·L·|Ms+Mw| / (k_L · σ) × 10⁻⁵    [m⁴]
  //       Where σ = 175/k_L (Sec 5.6.1, amidships).
  //       This simplifies to: I_min = 3·L·|Ms+Mw| · 10⁻⁵ / 175 = (3/175)·L·|Ms+Mw|·10⁻⁵
  //       (k_L cancels because σ = 175/k_L.)
  //
  // (b) Empirical (L ≥ 90 m only):
  //       I_min = 3·C1·L³·B·(Cb+0.7) × 10⁻⁸          [m⁴]
  //
  // Returns: { req_m4, formula_a_m4, formula_b_m4, governing }
  // (req_m4 = max of the two; formula_b_m4 = null when L < 90)
  function calcImin(C1, L, B, Cb, Ms_kNm, Mw_kNm, kL) {
    const Cb_r = calcCbRule(Cb);
    // (a) stress-based — needs Ms + Mw (kN·m)
    const M_total = Math.abs((Ms_kNm || 0)) + Math.abs((Mw_kNm || 0));
    const sigma = 175 / (kL || 0.72);   // amidships permissible
    const Ia = (sigma > 0 && L > 0)
      ? (3 * L * M_total) / ((kL || 0.72) * sigma) * 1e-5
      : 0;
    // (b) empirical (only L ≥ 90)
    const Ib = (L >= 90)
      ? 3 * C1 * L * L * L * B * (Cb_r + 0.7) * 1e-8
      : null;
    let req, gov;
    if (Ib != null) {
      req = Math.max(Ia, Ib);
      gov = (Ia >= Ib) ? '(a) stress' : '(b) empirical';
    } else {
      req = Ia;
      gov = '(a) stress';
    }
    return { req_m4: req, formula_a_m4: Ia, formula_b_m4: Ib, governing: gov };
  }
  
  // Permissible bending stress (Sec 5.6.1)
  //   a. Within 0.4L amidships: σ = 175/k_L
  //   b. Outside 0.4L for continuous longitudinal members:
  //      σ = (75 + 543·d/L − 699·(d/L)²) / k_L
  //      where d = distance from F.P. (forward region) or A.P. (aft region)
  //
  // x_over_L: position from AFT end, 0..1 (default 0.5 = amidships).
  // Returns σ in N/mm². Caller decides whether to apply the local
  // floor or take 175/k_L for conservative midship analysis.
  function sigmaPermAt(kL, x_over_L) {
    const x = (x_over_L != null) ? Math.max(0, Math.min(1, x_over_L)) : 0.5;
    // Within 0.4L amidships (i.e. |x − 0.5| ≤ 0.2): use 175/k_L
    if (Math.abs(x - 0.5) <= 0.2) return 175 / (kL || 0.72);
    // Outside 0.4L: compute d/L (distance to nearest end)
    const dOverL = (x < 0.5) ? x : (1 - x);   // distance from A.P. or F.P.
    const sigma_outside = (75 + 543 * dOverL - 699 * dOverL * dOverL) / (kL || 0.72);
    // The Rule allows special consideration to use 175/k_L outside 0.4L
    // provided buckling is checked. We return the formula value here;
    // it is always ≤ 175/k_L within 0..0.5L range.
    return sigma_outside;
  }

  // Permissible bending stress amidships (5.6.1) — kept for backward compat
  function sigmaAmid(kL) { return 175.0 / kL; }
  
  // Permissible shear stress (6.6.1)
  function tauPerm(kL) { return 110.0 / kL; }
  
  // Local reduction factors F_D, F_B (5.7)
  // F = σ_actual / σ_perm
  //   σ_D = |Ms + Mw| / Z_D (kPa) × 10⁻³ → N/mm²
  //   σ_B = |Ms + Mw| / Z_B
  // Plating floor = 0.67, longitudinal floor = 0.75
  function calcF(Ms_kNm, Mw_hog, Mw_sag, Z_B_m3, Z_D_m3, sigma_amid) {
    const Ms = Math.abs(Ms_kNm || 0);
    // Use max magnitude of Mw for worst case
    const Mw_worst = Math.max(Math.abs(Mw_hog || 0), Math.abs(Mw_sag || 0));
    const M_total = Ms + Mw_worst;
    // σ in N/mm² (Z in m³, M in kN·m): σ = M·1000 / (Z·10⁶) = M/(Z·1000)
    const sigma_D_raw = Z_D_m3 > 0 ? (M_total * 1e-3) / Z_D_m3 : 0;
    const sigma_B_raw = Z_B_m3 > 0 ? (M_total * 1e-3) / Z_B_m3 : 0;
    const F_D_raw = sigma_amid > 0 ? sigma_D_raw / sigma_amid : 0;
    const F_B_raw = sigma_amid > 0 ? sigma_B_raw / sigma_amid : 0;
    // Plating floor 0.67
    const F_D_plating = Math.max(F_D_raw, 0.67);
    const F_B_plating = Math.max(F_B_raw, 0.67);
    // Longitudinal floor 0.75
    const F_D_long = Math.max(F_D_raw, 0.75);
    const F_B_long = Math.max(F_B_raw, 0.75);
    return {
      sigma_D: sigma_D_raw, sigma_B: sigma_B_raw,
      F_D_raw, F_B_raw,
      F_D_plating, F_B_plating,
      F_D_long, F_B_long
    };
  }
  
  // Wave shear force Qwo (6.3.1) — base value at amidships envelope
  function calcQwo(C1, L, B, Cb) {
    const Cb_r = calcCbRule(Cb);
    return 0.3 * Math.max(C1, 0.6) * L * B * (Cb_r + 0.7);
  }

  // K1 longitudinal distribution factor (LR Pt 3 Ch 4 Sec 6.3.1, Fig 4.6.1)
  // x_over_L: position from AFT end, 0 → 1.0
  // sign: 'positive' or 'negative' (envelope to use)
  // Returns K1 value at that position via linear interpolation between
  // tabulated breakpoints.
  function calcK1(x_over_L, sign, Cb) {
    const Cb_r = calcCbRule(Cb);
    // Breakpoints from Tablo 4.6.1 (positive shear):
    //   x/L=0      → K1 = 0
    //   x/L=0.2-0.3→ K1 = 1.589·Cb/(Cb+0.7)
    //   x/L=0.4-0.6→ K1 = 0.7
    //   x/L=0.7-0.85→K1 = 1.0
    //   x/L=1.0    → K1 = 0
    // Breakpoints (negative shear):
    //   x/L=0      → K1 = 0
    //   x/L=0.2-0.3→ K1 = -0.92
    //   x/L=0.4-0.6→ K1 = -0.7
    //   x/L=0.7-0.85→K1 = -1.727·Cb/(Cb+0.7)
    //   x/L=1.0    → K1 = 0
    const x = Math.max(0, Math.min(1, x_over_L));
    let bp;
    if (sign === 'negative') {
      bp = [
        [0.00, 0],
        [0.20, -0.92],
        [0.30, -0.92],
        [0.40, -0.70],
        [0.60, -0.70],
        [0.70, -1.727 * Cb_r / (Cb_r + 0.7)],
        [0.85, -1.727 * Cb_r / (Cb_r + 0.7)],
        [1.00, 0]
      ];
    } else {
      const peak_aft = 1.589 * Cb_r / (Cb_r + 0.7);
      bp = [
        [0.00, 0],
        [0.20, peak_aft],
        [0.30, peak_aft],
        [0.40, 0.70],
        [0.60, 0.70],
        [0.70, 1.0],
        [0.85, 1.0],
        [1.00, 0]
      ];
    }
    // Linear interpolation between breakpoints
    for (let i = 0; i < bp.length - 1; i++) {
      const [x1, y1] = bp[i], [x2, y2] = bp[i+1];
      if (x >= x1 && x <= x2) {
        if (x2 === x1) return y1;
        return y1 + (y2 - y1) * (x - x1) / (x2 - x1);
      }
    }
    return 0;  // out of range
  }

  // K2 service factor (LR Sec 6.3.1)
  function calcK2(serviceType) {
    if (serviceType === 'short_voyage') return 0.8;
    if (serviceType === 'sheltered')    return 0.5;
    return 1.0;  // unrestricted (default)
  }

  // Design wave shear force Qw (Sec 6.3.1): Qw = K1 · K2 · Qwo (kN)
  // Magnitude only — sign chosen by caller (positive or negative envelope).
  function calcQw(C1, L, B, Cb, x_over_L, sign, serviceType) {
    const Qwo = calcQwo(C1, L, B, Cb);
    const K1 = calcK1(x_over_L != null ? x_over_L : 0.5, sign || 'positive', Cb);
    const K2 = calcK2(serviceType || 'unrestricted');
    return Math.abs(K1 * K2 * Qwo);
  }
  
  // Full analysis
  function analyze(ship, section, options) {
    options = options || {};
    // LR Pt 3 Ch 4 Sec 5.3.1 — TWO still-water moments:
    //   Ms_hog = positive (hogging condition's max)
    //   Ms_sag = negative (sagging condition's max)
    // Backward compat: if only `Ms_design` is given, treat it as Ms_hog and
    // assume Ms_sag = -|Ms_design| (symmetric pair, conservative).
    let Ms_hog, Ms_sag;
    if (options.Ms_hog != null || options.Ms_sag != null) {
      Ms_hog = options.Ms_hog != null ? options.Ms_hog : 0;
      Ms_sag = options.Ms_sag != null ? options.Ms_sag : 0;
    } else {
      // Old single-value API
      Ms_hog = options.Ms_design || 0;
      Ms_sag = -Math.abs(options.Ms_design || 0);
    }
    // Internal "Ms_design" preserved for legacy fields below — picks the
    // larger magnitude as a single representative value (used by Sec 5.7.1
    // hull-girder σ_actual = |Ms+Mw|/Z which takes "the greater of sagging
    // or hogging stresses", so we use the worst-case combination).
    const Ms_design = Math.abs(Ms_hog) >= Math.abs(Ms_sag) ? Ms_hog : Ms_sag;

    const C1 = calcC1(ship.L);
    const Cb_r = calcCbRule(ship.Cb);
    const f2_sag = calcF2Sag();
    const f2_hog = calcF2Hog(ship.Cb);
    const Mwo = calcMwo(C1, ship.L, ship.B, ship.Cb);
    const svScale = serviceScale(ship.service_type || 'unrestricted');
    const f1 = ship.f1 || 1.0;
    const Mw_sag = svScale * f1 * f2_sag * Mwo;
    const Mw_hog = svScale * f1 * f2_hog * Mwo;

    // Total bending moments per condition (LR Sec 5.3 / 5.7.1):
    //   Hogging: M_total_hog = Ms_hog + Mw_hog  (both positive; bottom comp)
    //   Sagging: M_total_sag = Ms_sag + Mw_sag  (both negative; deck comp)
    // Magnitudes drive σ at extreme fibres. Z_B uses |M_total_hog|, Z_D uses
    // |M_total_sag| in Sec 5.7.1's "greater of" rule (per side).
    const M_total_hog = Ms_hog + Mw_hog;
    const M_total_sag = Ms_sag + Mw_sag;

    const Z_min = calcZmin(f1, ship.kL, C1, ship.L, ship.B, ship.Cb);
    // I_min — Sec 5.8.1.a uses |Ms+Mw| with the worst-case combination.
    //   Worst case = max(|Ms_hog+Mw_hog|, |Ms_sag+Mw_sag|).
    const M_worst_for_I = Math.max(Math.abs(M_total_hog), Math.abs(M_total_sag));
    // Pass M_worst as Ms+Mw bundled (the formula uses |Ms|+|Mw| as a sum).
    // Older calcImin signature: (C1, L, B, Cb, Ms, Mw, kL) where it takes
    //   |Ms|+|Mw|. To preserve that interface we split worst back into a
    //   pseudo Ms+Mw pair whose magnitudes sum to M_worst_for_I.
    const I_min_result = calcImin(C1, ship.L, ship.B, ship.Cb, M_worst_for_I, 0, ship.kL);
    const I_min = I_min_result.req_m4;
    const sigma_amid = sigmaAmid(ship.kL);
    const sigma_perm = sigmaPermAt(ship.kL, ship.x_over_L);
    const tau = tauPerm(ship.kL);

    // F factors (Sec 5.7.2) — σ_D = |M_total_sag|/Z_D, σ_B = |M_total_hog|/Z_B.
    // Each side uses ITS OWN moment, not the cross-side max. This matches the
    // physical loading: deck is compressed in sagging, bottom in hogging.
    const sigma_D = section.Z_D > 0 ? Math.abs(M_total_sag) * 1e-3 / section.Z_D : 0;
    const sigma_B = section.Z_B > 0 ? Math.abs(M_total_hog) * 1e-3 / section.Z_B : 0;
    const F_D_raw = sigma_amid > 0 ? sigma_D / sigma_amid : 0;
    const F_B_raw = sigma_amid > 0 ? sigma_B / sigma_amid : 0;
    const F = {
      sigma_D, sigma_B,
      F_D_raw, F_B_raw,
      F_D_plating: Math.max(F_D_raw, 0.67),
      F_B_plating: Math.max(F_B_raw, 0.67),
      F_D_long:    Math.max(F_D_raw, 0.75),
      F_B_long:    Math.max(F_B_raw, 0.75),
      // Legacy aliases used by calcF callers
      F_D: F_D_raw, F_B: F_B_raw,
    };
    
    const Qwo = calcQwo(C1, ship.L, ship.B, ship.Cb);
    // Design wave shear at the section's longitudinal position (Sec 6.3.1).
    // ship.x_over_L (0..1, default 0.5 = amidships) and ship.service_type
    // are used. We return the worst-case |Qw| of positive and negative
    // envelopes so all downstream consumers see the conservative value.
    const x_over_L = (ship.x_over_L != null) ? ship.x_over_L : 0.5;
    const Qw_pos = calcQw(C1, ship.L, ship.B, ship.Cb, x_over_L, 'positive', ship.service_type);
    const Qw_neg = calcQw(C1, ship.L, ship.B, ship.Cb, x_over_L, 'negative', ship.service_type);
    const Qw_design = Math.max(Qw_pos, Qw_neg);
    // design hull shear force at the section: still water + wave of the same sign (Sec 6.7)
    const Q_design = Math.max(Math.abs((ship.Qs_pos || 0) + Qw_pos), Math.abs((ship.Qs_neg || 0) - Qw_neg));
    
    // Compliance
    const compliance = {
      Z_B: {
        actual_m3: section.Z_B,
        required_m3: Z_min,
        ratio: section.Z_B / Z_min,
        pass: section.Z_B >= Z_min
      },
      Z_D: {
        actual_m3: section.Z_D,
        required_m3: Z_min,
        ratio: section.Z_D / Z_min,
        pass: section.Z_D >= Z_min
      },
      I: I_min > 0 ? {
        actual_m4: section.I_NA,
        required_m4: I_min,
        ratio: section.I_NA / I_min,
        pass: section.I_NA >= I_min,
        breakdown: I_min_result        // {formula_a_m4, formula_b_m4, governing}
      } : null
    };
    
    return {
      ship, section,
      C1, Cb_rule: Cb_r,
      Mwo, f2_sag, f2_hog, Mw_sag, Mw_hog, svScale,
      // Two-Ms split (Sec 5.3.1) and the resulting per-condition totals.
      // Downstream code MUST use M_total_hog for hogging-condition checks
      // (bottom buckling, σ_B, Z_B compliance) and M_total_sag for sagging
      // (deck buckling, σ_D, Z_D compliance). Older callers reading
      // ls.Ms_design + ls.Mw_hog/sag get the single-value approximation;
      // they should migrate.
      Ms_hog, Ms_sag, M_total_hog, M_total_sag,
      Z_min, I_min, sigma_amid, sigma_perm, tau,
      Ms_design,
      ...F,
      Qwo, Qw_pos, Qw_neg, Qw_design, Q_design, Qs_pos: ship.Qs_pos || 0, Qs_neg: ship.Qs_neg || 0,
      x_over_L,
      compliance
    };
  }
  
  return {
    analyze, calcC1, calcMwo, calcZmin, calcImin, 
    calcF, calcQwo, calcQw, calcK1, calcK2,
    sigmaAmid, sigmaPermAt, tauPerm,
    serviceScale
  };
})();
window.LongStrength = LongStrength;

// Helper: fetch section properties from the drawing (computed there).
// Returns { Z_B_m3, Z_D_m3, I_NA_m4, NA_m, Z_coaming_m3, A_total_cm2 } or null.
function getSectionProperties() {
  if (!window.Draw || typeof window.Draw.computeSectionProperties !== 'function') {
    return null;
  }
  const sp = window.Draw.computeSectionProperties();
  if (!sp) return null;
  return {
    Z_B:  sp.Z_bottom    / 1e9,  // mm³ → m³
    Z_D:  sp.Z_upperDeck / 1e9,
    Z_c:  sp.Z_hatchCoaming / 1e9,
    I_NA: sp.I_NA / 1e12,        // mm⁴ → m⁴
    z_NA: sp.NA / 1000,           // mm → m
    A_total: sp.totalArea / 100   // mm² → cm²
  };
}
window.getSectionProperties = getSectionProperties;

// Run a full longitudinal strength analysis using current tool state.
// Two call signatures supported:
//   runLongStrengthAnalysis()                      — read both Ms_hog/Ms_sag from form
//   runLongStrengthAnalysis()             — legacy: single Ms (treated as
//                                                     Ms_hog, Ms_sag = -|Ms_design|)
//   runLongStrengthAnalysis({Ms_hog, Ms_sag})      — explicit pair
function runLongStrengthAnalysis(arg) {
  const p = getParams();
  const section = getSectionProperties();
  if (!section) return null;
  const ship = {
    L: p.L, B: p.B, D: p.D, T: p.T,
    Cb: p.Cb || 0.85,
    kL: p.kL,
    f1: p.f1 != null ? p.f1 : 1.0,
    service_type: p.serviceRestriction === 'short_voyage' || p.serviceRestriction === 'sheltered' ? p.serviceRestriction : 'unrestricted',
    x_over_L: p.x_over_L != null ? p.x_over_L : 0.5,
    Qs_pos: p.Qs_pos || 0, Qs_neg: p.Qs_neg || 0
  };
  // Resolve Ms pair from argument or form
  let Ms_hog, Ms_sag;
  if (arg && typeof arg === 'object' && (arg.Ms_hog != null || arg.Ms_sag != null)) {
    Ms_hog = arg.Ms_hog != null ? arg.Ms_hog : 0;
    Ms_sag = arg.Ms_sag != null ? arg.Ms_sag : 0;
  } else if (typeof arg === 'number') {
    // Legacy: single Ms_design value. Use it for hogging, mirror to sagging.
    Ms_hog = arg;
    Ms_sag = -Math.abs(arg);
  } else {
    // Default: read from form (via getParams)
    Ms_hog = p.Ms_hog || 0;
    Ms_sag = p.Ms_sag || 0;
  }
  return LongStrength.analyze(ship, section, { Ms_hog, Ms_sag });
}
window.runLongStrengthAnalysis = runLongStrengthAnalysis;

// Wire up the "Compute F from LR Ch 4" button.
// Runs LR Pt 3 Ch 4 analysis and overrides F_B, F_D inputs with computed values
// (longitudinal floor = 0.75, which is what IB/side longs should use).
function applyComputedFfactors() {
  // Step 1: ensure drawing is initialized so section properties are available
  if (!window.Draw || typeof window.Draw.computeSectionProperties !== 'function') {
    // Try to auto-initialize the drawing
    if (window.Draw && typeof window.Draw.init === 'function') {
      try { window.Draw.init(); } catch (e) {}
    }
  }
  
  const sp = getSectionProperties();
  
  // Step 2: sanity check — if section properties look wrong (e.g. drawing not yet
  // rendered), warn the user instead of applying nonsense F factors.
  if (!sp || sp.Z_B < 5 || sp.Z_D < 3 || sp.I_NA < 20) {
    alert(
      'Section properties are not ready yet.\n\n' +
      'Please visit the Geometry page first (which initializes the midship drawing), ' +
      'then come back to Setup and click this button again.\n\n' +
      `Current values:\n` +
      `  Z_B  = ${sp ? sp.Z_B.toFixed(3) : '—'} m³ (expected ~10 m³)\n` +
      `  Z_D  = ${sp ? sp.Z_D.toFixed(3) : '—'} m³ (expected ~5 m³)\n` +
      `  I_NA = ${sp ? sp.I_NA.toFixed(3) : '—'} m⁴ (expected ~50 m⁴)`
    );
    return;
  }
  
  const p = getParams();
  const res = runLongStrengthAnalysis();
  if (!res) {
    alert('Analysis could not run. Check inputs.');
    return;
  }
  
  // Apply longitudinal floor (0.75) per LR Sec 5.7.2.
  // No upper clamp: if raw F > 1.0 the hull girder is overstressed (σ_actual
  // > σ_perm) — writing 1.0 to the input would mask the failure. We pass
  // the raw value through so the downstream plate / stiffener formulas
  // demand a thicker scantling, which is the correct response. The user
  // is also alerted via the message below.
  const FB_new = Math.max(res.F_B_long, 0.75);
  const FD_new = Math.max(res.F_D_long, 0.75);
  document.getElementById('FB').value = FB_new.toFixed(3);
  document.getElementById('FD').value = FD_new.toFixed(3);
  recalcAll();
  
  // User feedback
  const compliance = res.compliance;
  const hg_overstress = res.F_B_raw > 1.0 || res.F_D_raw > 1.0;
  const msg = `LR Pt 3 Ch 4 Analysis Complete\n\n`
    + `Section properties used (from midship drawing):\n`
    + `  Z_B  = ${sp.Z_B.toFixed(3)} m³\n`
    + `  Z_D  = ${sp.Z_D.toFixed(3)} m³\n`
    + `  I_NA = ${sp.I_NA.toFixed(3)} m⁴\n`
    + `  z_NA = ${sp.z_NA.toFixed(2)} m\n\n`
    + `Hull girder stresses (Ms = ${p.Ms_design} kN·m):\n`
    + `  σ_D = ${res.sigma_D.toFixed(1)} N/mm²  (deck)\n`
    + `  σ_B = ${res.sigma_B.toFixed(1)} N/mm²  (keel)\n`
    + `  σ_perm = ${res.sigma_amid.toFixed(1)} N/mm²\n\n`
    + `Reduction factors (raw → applied):\n`
    + `  F_D = ${res.F_D_raw.toFixed(3)} → ${FD_new.toFixed(3)}  (long. floor 0.75, no upper cap)\n`
    + `  F_B = ${res.F_B_raw.toFixed(3)} → ${FB_new.toFixed(3)}\n\n`
    + (hg_overstress 
        ? `⚠ WARNING: Hull girder is OVERSTRESSED (raw F > 1.0).\n`
        + `This means σ_actual > σ_permissible at the strength deck or keel.\n`
        + `The section modulus is insufficient for the current Ms + Mw.\n`
        + `Plate / stiffener formulas downstream will demand thicker scantlings\n`
        + `accordingly. To fix the hull girder itself, increase Z_B or Z_D.\n\n`
        : ``)
    + `Compliance:\n`
    + `  Z_B ${compliance.Z_B.pass ? '✓ OK' : '✗ FAIL'} (ratio ${compliance.Z_B.ratio.toFixed(3)})\n`
    + `  Z_D ${compliance.Z_D.pass ? '✓ OK' : '✗ FAIL'} (ratio ${compliance.Z_D.ratio.toFixed(3)})\n`
    + (compliance.I ? `  I_NA ${compliance.I.pass ? '✓ OK' : '✗ FAIL'} (ratio ${compliance.I.ratio.toFixed(3)})\n` : '');
  alert(msg);
}
window.applyComputedFfactors = applyComputedFfactors;

