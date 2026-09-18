/* ==========================================================================
   31-optimize-plates.js  —  Plate optimizers, layout helpers, status bar, popups
   Extracted verbatim from Index.html (lines 18309–19594 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ============================================================================
// AUTO-OPTIMIZE PLATES — dead simple: each strake.thickness = snapUp(t_required)
// ============================================================================
function autoOptimizePlates() {
  if (!window.Draw || !window.Draw.STRAKES) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }
  const D = window.Draw;
  const S = D.STRAKES;

  // Freeze auto-regen so our writes aren't overwritten
  if (D.setStrakesAuto) D.setStrakesAuto(false);

  // Commercial plate steps (mm)
  const T_STEPS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25];
  // Rounding rule — plates come in whole mm only (no half-mm stock).
  // Decimal < 0.25 → round DOWN (e.g. 5.22 → 5.0)
  // Decimal >= 0.25 → round UP (e.g. 5.26 → 6.0)
  // Then snap the resulting integer to the nearest available T_STEPS value
  // that is >= it (so we never drop below a catalogued commercial size).
  const snapUp = (t) => {
    if (t == null || !isFinite(t) || t <= 0) return null;
    const whole = Math.floor(t);
    const dec = t - whole;
    const t_int = dec < 0.25 ? whole : whole + 1;
    return T_STEPS.find(x => x >= t_int) || T_STEPS[T_STEPS.length - 1];
  };

  // --- Per-strake t_required resolver --------------------------------
  // Returns an array aligned with STRAKES[panelKey]; null entries mean
  // "no calc available, don't touch this strake".
  const getRequired = (panelKey) => {
    const arr = S[panelKey];
    if (!arr || !arr.length) return [];

    try {
      // INNER SIDE — per-strake using the inspector panel's formula.
      // Each strake's outboard compartment determines its region:
      //   Tank (ballast/fuel/freshwater) → LR Table 1.9.1 (1)
      //   Void                            → 7.5 mm min (Sec 9)
      //   Coaming (above UD)              → 10 mm min (Pt 3 Ch 11)
      if (panelKey === 'innerSide') {
        try {
          const getParams = window.getParams || (() => ({ k:1, L:110, T:6.5, le:4, ibLevel:1800, udLevel:12900 }));
          const p = getParams();
          const G = (window.Draw && window.Draw.GEOMETRY) || {};
          const IS_Y = G.IS || 10030;
          const UD_mm = G.UD || p.udLevel || 12900;

          // Walk strakes to compute cumulative z_mid for each
          let cursor = G.IB || p.ibLevel || 1800;
          return arr.map((strake, i) => {
            const z1_mm = cursor;
            const z2_mm = cursor + (strake.width || 0);
            cursor = z2_mm;
            const z_mid_mm = (z1_mm + z2_mm) / 2;
            // Above UD → Coaming
            if (z_mid_mm > UD_mm) return 10;
            // Check outboard compartment
            const is_y = IS_Y + 50;
            const compOutboard = (window.getCompartmentAt ? window.getCompartmentAt(is_y, z_mid_mm) : null);
            if (!compOutboard || (compOutboard.type !== 'ballast' && compOutboard.type !== 'fuel' && compOutboard.type !== 'freshwater')) {
              // Void
              return 7.5;
            }
            // Tank — Table 1.9.1 (1): t = 0.004·s·f·√(ρ·h_4/1.025) + 2.5
            const rho = compOutboard.rho || 1.025;
            const pipe_mm = compOutboard.airpipeZ_mm;
            const tank_top_mm = window._compartmentBoundingBox?.(compOutboard)?.zMax || UD_mm;
            // h_4 reference point — LR Pt 4 Ch 1 Sec 9.2 / Tablo 1.9.1 footnote (b):
            // "from a point one-third of the height of the plate above its
            // lower edge to the top of the tank, or half the distance to the
            // top of the overflow, whichever is the greater"
            const z_ref_mm = z1_mm + (z2_mm - z1_mm) / 3;
            const z_overflow_half = pipe_mm != null ? (z_ref_mm + (pipe_mm - z_ref_mm) / 2) : tank_top_mm;
            const z_upper_mm = Math.max(tank_top_mm, z_overflow_half);
            const h_4 = Math.max((z_upper_mm - z_ref_mm) / 1000, 0.5);
            // Per-strake long spacing (real max-gap)
            let s_strake;
            if (typeof window.strakeLongSpacing === 'function') {
              s_strake = window.strakeLongSpacing('innerSide', i).value;
            } else {
              s_strake = 650;
            }
            // S = primary-member (web frame) spacing, not the per-stiffener l_e
            const f = Math.min(1.0, 1.1 - s_strake / (2500 * (p.le_global || p.le)));
            // Per-strake yield-strength override
            const fam = (typeof window.resolveStrakeFamily === 'function')
                        ? window.resolveStrakeFamily(arr[i])
                        : { k: p.k };
            const k_local = fam.k;
            // LR Table 1.9.1 (1) Deep tank: t = 0.004·s·f·√(ρ·h₄·k/1.025) + 2.5
            // (k is inside the sqrt per Rule text — affects HT steel correctly)
            const t_calc = 0.004 * s_strake * f * Math.sqrt(rho * h_4 * k_local / 1.025) + 2.5;
            return Math.max(t_calc, 7.5);
          });
        } catch (e) {
          console.warn('[autoOptimizePlates] innerSide calc failed:', e);
          // Fallback to calcInnerSide
          const is = window.calcInnerSide?.();
          if (!is?.strakes) return arr.map(() => null);
          return arr.map((_, i) => is.strakes[i]?.t ?? null);
        }
      }

      // SHELL — per-strake (uses real long spacing + position-based formulas,
      // same as inspector panel). calcBottomPlate/calcSidePlate use a single
      // "worst" spacing that over-inflates every strake's t_req.
      if (panelKey === 'shell') {
        try {
          const getParams = window.getParams || (() => ({ k:1, L:110, T:6.5, D:10, FB:0.9, FD:0.9, kL:1 }));
          const p = getParams();
          const Cw = (typeof calcCw === 'function') ? calcCw(p.L) : 0;
          const hT1 = Math.min(p.T + Cw, 1.36 * p.T);
          const hT2 = Math.min(p.T + 0.5 * Cw, 1.2 * p.T);
          const D2 = Math.min(p.D, 1.6 * p.T);
          const L1 = Math.min(p.L, 190);
          const G = (window.Draw && window.Draw.GEOMETRY) || {};
          const R_B_mm = G.R_B || 1800;
          const z_bilge_m = R_B_mm / 1000;
          const z_mid_D2 = D2 / 2;

          // Walk side strakes to know each one's z_mid (for region a/b/c)
          let z_side_cursor = R_B_mm;
          const zMidOfSide = arr.map((s, idx) => {
            if (s.kind !== 'side') return null;
            const z_mid_mm = z_side_cursor + (s.width || 0) / 2;
            z_side_cursor += (s.width || 0);
            return z_mid_mm / 1000;
          });

          return arr.map((s, i) => {
            // Per-strake long spacing
            let s_strake;
            if (typeof window.strakeLongSpacing === 'function') {
              s_strake = window.strakeLongSpacing('shell', i).value;
            } else {
              s_strake = parseFloat(document.getElementById('bottomLongSpacing')?.value || 705);
            }
            const s1 = (typeof s1Limit === 'function') ? s1Limit(s_strake, p.L) : s_strake;
            // Per-strake yield-strength override (Apr 2026)
            const fam = (typeof window.resolveStrakeFamily === 'function')
                        ? window.resolveStrakeFamily(s)
                        : { k: p.k, kL: p.kL };
            const k_local = fam.k, kL_local = fam.kL;

            if (s.kind === 'keel' || s.kind === 'bottom' || s.kind === 'bilge') {
              // BOTTOM formula (Table 1.5.2)
              const t_a = 0.001 * s1 * (0.043 * L1 + 10) * Math.sqrt(p.FB / kL_local);
              const t_b = 0.0052 * s1 * Math.sqrt(hT2 * k_local / (1.8 - p.FB));
              return Math.max(t_a, t_b);
            }
            if (s.kind === 'side') {
              // SIDE formula (Table 1.5.3) — region by z_mid
              const z_m = zMidOfSide[i];
              let t_i, t_ii;
              if (z_m >= z_mid_D2) {
                // Region (a) — above D/2
                t_i  = 0.001 * s1 * (0.059 * L1 + 7) * Math.sqrt(p.FD / kL_local);
                t_ii = 0.0042 * s1 * Math.sqrt(hT1 * k_local);
              } else if (z_m <= z_bilge_m) {
                // Region (b) — at upper turn of bilge
                t_i  = 0.001 * s1 * (0.059 * L1 + 7) * Math.sqrt(p.FB / kL_local);
                t_ii = 0.0054 * s1 * Math.sqrt(hT2 * k_local / (2 - p.FB));
              } else {
                // Region (c) — interpolation
                t_i = 0.001 * s1 * (0.059 * L1 + 7) * Math.sqrt(p.FB / kL_local);
                const t_ii_a = 0.0042 * s1 * Math.sqrt(hT1 * k_local);
                const t_ii_b = 0.0054 * s1 * Math.sqrt(hT2 * k_local / (2 - p.FB));
                const frac = (z_m - z_bilge_m) / (z_mid_D2 - z_bilge_m);
                t_ii = t_ii_b + frac * (t_ii_a - t_ii_b);
              }
              return Math.max(t_i, t_ii);
            }
            return null;
          });
        } catch (e) {
          console.warn('[autoOptimizePlates] shell per-strake calc failed:', e);
          return arr.map(() => null);
        }
      }

      // INNER BOTTOM — per-strake (uses real long spacing for each strake,
      // same formula as the inspector panel). The generic calcIBPlate()
      // reads the form's single ibLongSpacing which is often larger than
      // what any individual strake actually sees → over-sized.
      if (panelKey === 'innerBottom') {
        try {
          const getParams = window.getParams || (() => ({ k:1, L:110, T:6.5, ibLevel:1800 }));
          const p = getParams();
          const loc  = document.getElementById('ibLocation')?.value || 'hold';
          const ceil = document.getElementById('ibCeiling')?.value  || 'yes';
          const grab = document.getElementById('ibGrab')?.value      || 'no';
          const t_min = (loc === 'hatch' && ceil === 'no') ? 7.5 : 6.5;
          let increment = 0;
          if (loc === 'hatch' && ceil === 'no') increment = 2;
          if (grab === 'yes') {
            increment = Math.max(increment, ceil === 'yes' ? 3 : 5);
          }
          return arr.map((strake, i) => {
            let s_strake;
            if (typeof window.strakeLongSpacing === 'function') {
              s_strake = window.strakeLongSpacing('innerBottom', i).value;
            } else {
              s_strake = parseFloat(document.getElementById('ibLongSpacing')?.value || 700);
            }
            // Per-strake yield-strength family override (Apr 2026): if this
            // strake has a `family` field set, use ITS k (not the global p.k).
            // Otherwise fall back to the global Setup material.
            const fam = (typeof window.resolveStrakeFamily === 'function')
                        ? window.resolveStrakeFamily(strake)
                        : { k: p.k };
            const k_local = fam.k;
            const t_base = 0.00136 * (s_strake + 660) * Math.pow(k_local * k_local * p.L * p.T, 0.25);
            return Math.max(t_base, t_min) + increment;
          });
        } catch (e) {
          console.warn('[autoOptimizePlates] innerBottom calc failed:', e);
          const t = window.calcIBPlate?.()?.t_req ?? null;
          return arr.map(() => t);
        }
      }

      // UPPER DECK
      if (panelKey === 'upperDeck') {
        const t = window.calcUpperDeckPlate?.()?.t_req ?? null;
        return arr.map(() => t);
      }

      // STRINGER / TWEEN — per-level groups, same per-strake value.
      // calcLowerDeckPlate expects prefix 'str' or 'twn' (not 'stringer'/'tween').
      if (/^stringer\d*$/.test(panelKey)) {
        const t = window.calcLowerDeckPlate?.('str')?.t_req ?? null;
        return arr.map(() => t);
      }
      if (/^tween\d*$/.test(panelKey)) {
        const t = window.calcLowerDeckPlate?.('twn')?.t_req ?? null;
        return arr.map(() => t);
      }

      // COAMING TOP — use coaming stiff's plate req or 15mm fallback
      if (panelKey === 'coamingTop') {
        const cs = window.calcCoamingStiff?.();
        const t = cs?.t_req_plate ?? cs?.t_req ?? 15;
        return arr.map(() => t);
      }

      // SIDE GIRDERS — no specific local rule; use 10mm minimum
      if (/^sideGirder\d+$/.test(panelKey)) {
        return arr.map(() => 10);
      }
    } catch (e) {
      console.warn('[autoOptimizePlates]', panelKey, 'calc failed:', e);
    }
    return arr.map(() => null);
  };

  // --- Process every panel, every strake ----------------------------
  const changes = [];
  Object.keys(S).forEach(panelKey => {
    if (!Array.isArray(S[panelKey]) || !S[panelKey].length) return;
    const reqs = getRequired(panelKey);
    S[panelKey].forEach((strake, i) => {
      const t_req = reqs[i];
      if (t_req == null) return;
      const t_new = snapUp(t_req);
      if (t_new == null) return;
      const t_old = strake.thickness;
      if (t_new !== t_old) {
        strake.thickness = t_new;
        changes.push({ panel: panelKey, idx: i, from: t_old, to: t_new, req: t_req });
      }
    });
  });

  // Redraw + editor refresh + rule-check — once, at the end
  if (D.render) D.render();
  if (typeof renderEditor === 'function') renderEditor();
  if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();

  console.log('[autoOptimizePlates] changes:', changes);
  showOptimizeResultsModal('Optimize Plates', changes);

  // v37: expose helpers for the Buckling-only optimizer to reuse as a
  // Required-only floor — see autoOptimizePlatesBuckling.
  window._autoOptPlates_getRequired = getRequired;
  window._autoOptPlates_snapUp = snapUp;
  window._autoOptPlates_T_STEPS = T_STEPS;
}
window.autoOptimizePlates = autoOptimizePlates;

// =========================================================================
// BUCKLING-ONLY PLATE OPTIMIZER  (Apr 2026)
// -------------------------------------------------------------------------
// For each strake, iteratively try the available commercial plate
// thicknesses and pick the smallest one that gives buckling UC ≤ 1.0
// (LR Pt 3 Ch 4 Sec 7). Mirrors the inspector's _bucklingPlateResult but
// is standalone so it can be called from the optimize toolbar without a
// node tap. Required-thickness from Pt 4 Ch 1 is IGNORED here; the user
// runs the regular Optimize Plates → Required for that.
//
// Returns nothing (mutates strake.thickness directly + redraws).
// =========================================================================
function autoOptimizePlatesBuckling() {
  if (!window.Draw || !window.Draw.STRAKES) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }
  if (!window.Buckling) {
    alert('Buckling module not loaded.');
    return;
  }
  const D = window.Draw;
  const S = D.STRAKES;
  if (D.setStrakesAuto) D.setStrakesAuto(false);

  // Same commercial plate steps as Required-only optimizer
  const T_STEPS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25];

  // Hull girder context (computed once, reused for every strake)
  const p = (typeof getParams === 'function') ? getParams() : { Ms_design: 0, kL: 0.72, material: 'AH36' };
  const Ms_design = p.Ms_design || parseFloat(document.getElementById('MsDesign')?.value || 0);
  const ls = (typeof runLongStrengthAnalysis === 'function') ? runLongStrengthAnalysis() : null;
  if (!ls || !ls.section || !ls.section.I_NA) {
    alert('Long-strength analysis unavailable. Run regular Optimize Plates first.');
    return;
  }
  const z_NA = ls.section.z_NA;
  const I_NA = ls.section.I_NA;
  const M_max = Math.max(
    Math.abs((Ms_design || 0) + (ls.Mw_hog || 0)),
    Math.abs((Ms_design || 0) + (ls.Mw_sag || 0))
  );
  const G_ = D.GEOMETRY || {};
  const z_deck = (G_.UD || 15300) / 1000;
  const kL = p.kL || 0.72;
  const S_m = 2.1;  // default web-frame spacing (LR Pt 3 Ch 3)

  // Pull σ_A at any z, τ_A at any t — uses the same logic as
  // _bucklingPlateResult inside the inspector.
  const sigmaAt = (z_m) => {
    const is_above = z_m >= z_NA;
    const z_face = is_above ? (z_deck - z_NA) : z_NA;
    const sigma_face = Math.abs(M_max * z_face / I_NA) * 1e-3;  // N/mm²
    return window.Buckling.sigmaADesign(sigma_face, Math.abs(z_m - z_NA), z_face, kL);
  };
  const tauAt = (t_mm, z_m) => {
    try {
      const Qwo_kN = ls.Qwo || ls.F?.Qwo || null;
      const Q_m3 = (typeof window.computeShearFirstMoment === 'function')
        ? window.computeShearFirstMoment(z_m) : null;
      if (Qwo_kN != null && Q_m3 != null && Q_m3 > 0) {
        const F_N = Qwo_kN * 1000;
        const tau_real = (F_N * Q_m3) / (I_NA * t_mm * 1000);
        return Math.max(Math.abs(tau_real), 30 / kL);
      }
    } catch(_) {}
    return window.Buckling.tauADesignInitial(kL);
  };

  // Resolve corrosion category for a given plate group + z_m + Y_mm
  // Falls back to 'DRY_BULK' if classifier returns nothing.
  const corrosionFor = (plateKey, z_m, Y_mm) => {
    try {
      // Try the inspector's _corrosionForPlate if exposed
      if (typeof window._corrosionForPlate === 'function') {
        return window._corrosionForPlate(plateKey, z_m, Y_mm);
      }
    } catch(_) {}
    // Conservative default (matches _bucklingPlateResult fallback)
    return 'DRY_BULK';
  };

  // Map a plateKey to its representative z_m and stiffening direction.
  // plateKey examples: 'shell', 'innerBottom', 'innerSide', 'upperDeck',
  //                    'stringer', 'tween', 'coamingTop', 'coamingWall'
  const _zM = (plateKey, strake, idx) => {
    const G = D.GEOMETRY || {};
    if (plateKey === 'shell') {
      // Shell: depends on strake.kind (keel/bottom/bilge/side)
      // Strakes have z derivation from idx — for buckling we just need an
      // approximate z, so use strake's first-sample z if available, else
      // estimate from idx position along the panel.
      // Simpler: walk samples around the bilge/side.
      // For practical purposes: use the strake.midZ if pre-computed, else
      // fall back to bottom (z=0) for keel/bottom/bilge, midpoint of IB→UD
      // for side.
      if (strake.kind === 'keel' || strake.kind === 'bottom' || strake.kind === 'bilge') {
        return 0;
      }
      // Side strake — distribute from bilge top (R_B) up to UD
      const z_lo = (G.R_B || 1500) / 1000;
      const z_hi = (G.UD || 15300) / 1000;
      const sideStrakes = S.shell.filter(s => s.kind === 'side');
      const sideIdx = sideStrakes.indexOf(strake);
      const f = sideStrakes.length > 1 ? (sideIdx + 0.5) / sideStrakes.length : 0.5;
      return z_lo + f * (z_hi - z_lo);
    }
    if (plateKey === 'innerBottom') return (G.IB || 1800) / 1000;
    if (plateKey === 'innerSide') {
      // v35: walk the IS strakes so each one gets its OWN z_mid, not a single
      // averaged z. Without this every IS strake was checked at ~8.5 m even
      // though the upper IS strakes sit at ~14 m.
      let cursor = G.IB || 1800;
      const arr = S.innerSide || [];
      for (let i2 = 0; i2 < arr.length; i2++) {
        if (i2 === idx) return (cursor + (arr[i2].width || 0) / 2) / 1000;
        cursor += arr[i2].width || 0;
      }
      return ((G.IB || 1800) + (G.UD || 15300)) / 2 / 1000;
    }
    if (plateKey === 'upperDeck')   return (G.UD || 15300) / 1000;
    // v35: stringer + tween strakes carry their actual z in `z_level` set up
    // when the level was created. Use that — the old `(IB+TT)/2` formula
    // returned ~7.35 m for every tween strake (which sits at 12.9 m in the
    // Baltic Laker geometry), and `G.TT = 12900` for every stringer strake
    // (which sits at ~8.59 m). Both wrong → buckling optimizer was solving
    // for the wrong σ_face above 12.9 m AB.
    if (plateKey === 'stringer') {
      const zL = strake && strake.z_level;
      if (zL != null) return zL / 1000;
      return ((G.IB || 1800) + (G.TT || 12900)) / 2 / 1000;
    }
    if (plateKey === 'tween') {
      const zL = strake && strake.z_level;
      if (zL != null) return zL / 1000;
      return (G.TT || 12900) / 1000;
    }
    if (plateKey === 'coamingTop') {
      // Top plate is horizontal at HC, not midway between UD and HC.
      return (G.HC || 16350) / 1000;
    }
    return (G.UD || 15300) / 2 / 1000;  // safe midship default
  };

  // Resolve s (long spacing) for a given plate group — uses the realLongSpacing
  // helper (live drawing, not form input) when available.
  const sForPlate = (plateKey, strake, idx) => {
    if (typeof window.strakeLongSpacing === 'function') {
      // Map plateKey to STRAKES group name
      const groupMap = {
        shell: 'shell', innerBottom: 'innerBottom', innerSide: 'innerSide',
        upperDeck: 'upperDeck', stringer: 'stringer', tween: 'tween',
        coamingTop: 'coamingTop'
      };
      const grp = groupMap[plateKey];
      if (grp && S[grp]) {
        try {
          const r = window.strakeLongSpacing(grp, idx);
          if (r && r.value > 0) return r.value;
        } catch(_) {}
      }
    }
    // Fallback: form input by group
    const formMap = {
      shell: 'bottomLongSpacing', innerBottom: 'ibLongSpacing',
      innerSide: 'isLongSpacing', upperDeck: 'deckLongSpacing',
      stringer: 'strDeckSpacing', tween: 'twnDeckSpacing',
    };
    const inputId = formMap[plateKey];
    if (inputId) {
      const v = parseFloat(document.getElementById(inputId)?.value);
      if (isFinite(v) && v > 0) return v;
    }
    return 700;  // safe default
  };

  // Resolve Y for a strake (used by some corrosion classifiers)
  const yForStrake = (plateKey, strake, idx) => {
    if (plateKey !== 'innerBottom' && plateKey !== 'shell') return null;
    // Approximate Y as cumulative width
    let cursor = 0;
    const arr = S[plateKey];
    for (let i = 0; i < idx; i++) cursor += (arr[i].width || 0);
    return cursor + (strake.width || 0) / 2;
  };

  // Run buckling check for a SINGLE strake at thickness t_mm. Returns
  // { UC, pass } or null if check failed.
  const runCheck = (plateKey, strake, idx, t_mm) => {
    try {
      const z_m = _zM(plateKey, strake, idx);
      const s_mm = sForPlate(plateKey, strake, idx);
      const Y_mm = yForStrake(plateKey, strake, idx);
      const sigma_A = sigmaAt(z_m);
      const tau_A = tauAt(t_mm, z_m);
      const corrosion = corrosionFor(plateKey, z_m, Y_mm);
      // Per-strake material override (yield-class)
      const fam = (typeof window.resolveStrakeFamily === 'function')
                  ? window.resolveStrakeFamily(strake)
                  : { family: p.material || 'AH36' };
      const material = fam.family || p.material || 'AH36';
      const r = window.Buckling.checkPlate({
        s_mm, t_mm, S_m,
        sigma_A, tau_A,
        stiffening: 'LONGITUDINAL',  // most common in this tool's geometry
        corrosion, material,
      });
      if (!r) return null;
      const UC = Math.max(r.UC_comp || 0, r.UC_shear || 0);
      return { UC, pass: UC <= 1.0, dt: r.dt_mm, sigma_A, tau_A };
    } catch (e) {
      console.warn('[autoOptimizePlatesBuckling] check failed:', e);
      return null;
    }
  };

  // v37: Compute the Required-only floor for every panel up-front. The
  // Buckling-only step must never DROP a strake below what Required-only
  // (LR Pt 4 Ch 1 t_req) demands. Two layers of protection:
  //   (1) startIdx already begins at the current t_old, so a strake that
  //       was just sized via Required-only never shrinks here.
  //   (2) Even when the user runs Buckling-only without first running
  //       Required-only, we still enforce t_floor = snapUp(t_req) so
  //       sub-LR thicknesses can't slip through.
  // We resolve the floor lazily — if the helper hasn't been exposed
  // (because Required-only was never run), we leave the floor at 0 and
  // fall back to the t_old guard alone (which is what v36 did).
  const _getReq = window._autoOptPlates_getRequired;
  const _snap   = window._autoOptPlates_snapUp;
  const _useFloor = (typeof _getReq === 'function') && (typeof _snap === 'function');

  // Main loop: for each panel, each strake → find smallest t_step where UC ≤ 1.0
  const changes = [];
  const skipped = [];
  Object.keys(S).forEach(panelKey => {
    if (!Array.isArray(S[panelKey]) || !S[panelKey].length) return;
    // Skip side girders / duct / coamingWall — buckling check meaningful
    // only for primary load-carrying plates
    if (/^sideGirder/.test(panelKey)) return;

    // Required-only floor for this panel (per-strake array of mm values
    // already snapped to commercial T_STEPS). May be empty/undefined for
    // panels with no rule (e.g. coamingWall) or when helper is missing.
    let floorArr = null;
    if (_useFloor) {
      try {
        const reqs = _getReq(panelKey) || [];
        floorArr = reqs.map(t => (t == null ? null : _snap(t)));
      } catch (e) {
        console.warn('[autoOptimizePlatesBuckling] required-floor calc failed for', panelKey, e);
        floorArr = null;
      }
    }

    S[panelKey].forEach((strake, i) => {
      const t_old = strake.thickness;
      // Required-only floor for this strake (if available). Otherwise 0.
      const t_floor = (floorArr && floorArr[i] != null) ? floorArr[i] : 0;
      // Effective starting thickness — never below Required-only minimum,
      // never below current t_old (which is whatever the user had set).
      const t_start = Math.max(t_old || 0, t_floor || 0);
      // Try every commercial step starting from t_start
      // (buckling-only never reduces thickness).
      const startIdx = Math.max(0, T_STEPS.findIndex(t => t >= t_start));
      let chosen = null;
      for (let k = startIdx; k < T_STEPS.length; k++) {
        const t_try = T_STEPS[k];
        const chk = runCheck(panelKey, strake, i, t_try);
        if (!chk) {
          // Check failed (no analysis context) — bail this strake but
          // still respect the Required-only floor: if t_floor > t_old,
          // bump up to t_floor so we don't leave a sub-LR thickness in
          // place.
          if (t_floor > (t_old || 0)) {
            strake.thickness = t_floor;
            changes.push({
              panel: panelKey, idx: i, from: t_old, to: t_floor,
              UC: null,
            });
          }
          skipped.push({ panel: panelKey, idx: i, reason: 'no UC available' });
          return;
        }
        if (chk.pass) { chosen = t_try; break; }
      }
      if (chosen == null) {
        // Even the largest commercial step fails — note it but use max
        chosen = T_STEPS[T_STEPS.length - 1];
        skipped.push({ panel: panelKey, idx: i, reason: 'UC>1.0 even at max t', t_used: chosen });
      }
      if (chosen !== t_old) {
        strake.thickness = chosen;
        const finalChk = runCheck(panelKey, strake, i, chosen);
        changes.push({
          panel: panelKey, idx: i, from: t_old, to: chosen,
          UC: finalChk ? finalChk.UC : null,
        });
      }
    });
  });

  if (D.render) D.render();
  if (typeof renderEditor === 'function') renderEditor();
  if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();

  console.log('[autoOptimizePlatesBuckling] changes:', changes, 'skipped:', skipped);
  showOptimizeResultsModal('Optimize Plates (Buckling)', changes);
}
window.autoOptimizePlatesBuckling = autoOptimizePlatesBuckling;

// =========================================================================
// HULL-GIRDER-ONLY PLATE OPTIMIZER  (Apr 2026)
// -------------------------------------------------------------------------
// For each plate strake, compute σ_hg = M·dz/I_NA at the strake's mid-z and
// compare against σ_perm (LR Pt 3 Ch 4 Sec 5.6.1). If σ_hg/σ_perm > 1.0,
// raise the strake's commercial t step until ratio ≤ 1.0.
//
// Note: every t increase grows I_NA, which lowers σ_hg for ALL strakes
// simultaneously. So we recompute the section after every change and stop
// as soon as every strake passes.
//
// Mirrors autoOptimizePlatesBuckling structure for consistency.
// =========================================================================
function autoOptimizePlatesHullGirder() {
  if (!window.Draw || !window.Draw.STRAKES) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }
  const D = window.Draw;
  const S = D.STRAKES;
  if (D.setStrakesAuto) D.setStrakesAuto(false);

  const T_STEPS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25, 28, 30, 32, 35, 40];

  // Get the mid-z (m) of any strake — used to evaluate σ_hg at its centre.
  const midZForStrake = (panelKey, strake, idx) => {
    const G = D.GEOMETRY || {};
    if (panelKey === 'shell') {
      // Walk samples. For practical use, use the strake.kind:
      if (strake.kind === 'keel' || strake.kind === 'bottom') return 0;
      if (strake.kind === 'bilge') {
        // Bilge spans z=0 to z=R_B, use mid
        return ((G.R_B || 1500) / 2) / 1000;
      }
      // Side strake — distribute uniformly from R_B (top of bilge) to UD
      const z_lo = (G.R_B || 1500) / 1000;
      const z_hi = (G.UD || 15300) / 1000;
      const sideStrakes = S.shell.filter(s => s.kind === 'side');
      const sideIdx = sideStrakes.indexOf(strake);
      if (sideIdx < 0) return (z_lo + z_hi) / 2;
      // Cumulative width
      let cursor = z_lo * 1000;
      for (let i = 0; i < sideIdx; i++) cursor += (sideStrakes[i].width || 0);
      return (cursor + (strake.width || 0) / 2) / 1000;
    }
    if (panelKey === 'innerBottom') return (G.IB || 1800) / 1000;
    if (panelKey === 'innerSide') {
      // Walk IS strakes from IB upward
      const arr = S.innerSide || [];
      let cursor = G.IB || 1800;
      for (let i = 0; i < idx; i++) cursor += (arr[i].width || 0);
      return (cursor + (strake.width || 0) / 2) / 1000;
    }
    if (panelKey === 'upperDeck') return (G.UD || 15300) / 1000;
    // v36 (HG mirror): stringer/tween/coamingWall used the wrong z
    // (G.TT for stringer, IB-TT midpoint for tween, UD-HC midpoint for
    // wall) — see autoOptimizePlatesBuckling fix. Use strake.z_level
    // when available; walk wall strakes for per-strake z.
    if (panelKey === 'stringer') {
      const zL = strake && strake.z_level;
      if (zL != null) return zL / 1000;
      return ((G.IB || 1800) + (G.TT || 12900)) / 2 / 1000;
    }
    if (panelKey === 'tween') {
      const zL = strake && strake.z_level;
      if (zL != null) return zL / 1000;
      return (G.TT || 12900) / 1000;
    }
    if (panelKey === 'coamingTop') return (G.HC || 16350) / 1000;
    return (G.UD || 15300) / 2 / 1000;  // safe default
  };

  // Compute σ_hg at z (m) using current section properties. Returns
  // { sigma_hg, sigma_perm, ratio, pass } or null.
  const sigmaHGAt = (z_m) => {
    try {
      const p = (typeof getParams === 'function') ? getParams() : { Ms_design: 0, kL: 0.72 };
      const ls = (typeof runLongStrengthAnalysis === 'function')
                 ? runLongStrengthAnalysis() : null;
      if (!ls || !ls.section || !ls.section.I_NA) return null;
      const dz_m = z_m - ls.section.z_NA;
      // LR Pt 3 Ch 4 Sec 5.7.1: σ_D and σ_B use "the greater of sagging or
      // hogging stresses". With the Ms_hog/Ms_sag split, that's the larger
      // magnitude of the two condition-totals.
      const M_max = Math.max(Math.abs(ls.M_total_hog || 0), Math.abs(ls.M_total_sag || 0));
      const sigma_hg = Math.abs(M_max * dz_m / ls.section.I_NA) * 1e-3;  // N/mm²
      const sigma_perm = ls.sigma_amid;  // amidships permissible (175/k_L)
      return {
        sigma_hg, sigma_perm,
        ratio: sigma_perm > 0 ? sigma_hg / sigma_perm : Infinity,
        pass: sigma_perm > 0 && sigma_hg <= sigma_perm
      };
    } catch (e) {
      console.warn('[hg-opt] sigmaHGAt failed:', e);
      return null;
    }
  };

  // Check σ_hg for every plate strake. Returns array of failing strakes,
  // each with { panelKey, idx, strake, z_m, ratio, sigma_hg }.
  const collectFailures = () => {
    const failures = [];
    Object.keys(S).forEach(panelKey => {
      // Skip side girders / duct etc — only primary load-carrying plates
      if (/^sideGirder/.test(panelKey)) return;
      const arr = S[panelKey];
      if (!Array.isArray(arr) || !arr.length) return;
      arr.forEach((strake, idx) => {
        const z_m = midZForStrake(panelKey, strake, idx);
        const r = sigmaHGAt(z_m);
        if (r && !r.pass) {
          failures.push({ panelKey, idx, strake, z_m,
                          ratio: r.ratio, sigma_hg: r.sigma_hg,
                          sigma_perm: r.sigma_perm });
        }
      });
    });
    // Sort by extreme fiber first (largest |dz|) — those benefit most
    // from a thickness bump because σ_hg ~ 1/I_NA and I_NA ~ Σ A·dz²,
    // so thickening a far-from-NA plate gives the biggest I_NA gain.
    failures.sort((a, b) => b.ratio - a.ratio);
    return failures;
  };

  // Move a strake to the next commercial t step. Returns true on success,
  // false if already at cap.
  const bumpThickness = (strake) => {
    const t_old = strake.thickness;
    const next = T_STEPS.find(t => t > t_old);
    if (next == null) return false;
    strake.thickness = next;
    return true;
  };

  // Iterative loop: collect failures → bump worst-rated → recompute → repeat.
  // Capped at 200 iterations to prevent runaway.
  const changes = new Map();   // key="panel:idx" → { panel, idx, from, to, finalRatio }
  let iterations = 0;
  const MAX_ITER = 200;
  let cappedStrakes = [];

  while (iterations < MAX_ITER) {
    iterations++;
    const failures = collectFailures();
    if (failures.length === 0) break;
    // Worst strake (highest σ_hg/σ_perm)
    const worst = failures[0];
    const t_old = worst.strake.thickness;
    if (!bumpThickness(worst.strake)) {
      // At cap — record and skip
      cappedStrakes.push({
        panelKey: worst.panelKey, idx: worst.idx,
        ratio: worst.ratio, t_capped: t_old,
      });
      // Mark this strake as "skipped" so we don't loop forever
      // (collectFailures still includes it). To skip it, raise its
      // t to a sentinel beyond max — but cleaner: artificially "pass"
      // it for the loop by removing from consideration. Easiest:
      // strake.thickness = t_old (no-op) and break out; user must handle.
      // Better: skip by tracking which strakes are capped.
      // But since collectFailures will return it again next loop, we
      // need to remove it. Track in a Set:
      worst.strake._hgOptCapped = true;
      // Filter on next iteration is tricky — use early break:
      // Check if ALL remaining failures are capped:
      const remainingNotCapped = failures.filter(f => !f.strake._hgOptCapped);
      if (remainingNotCapped.length === 0) break;
      continue;
    }
    // Record change
    const key = worst.panelKey + ':' + worst.idx;
    if (!changes.has(key)) {
      changes.set(key, { panel: worst.panelKey, idx: worst.idx, from: t_old });
    }
    changes.get(key).to = worst.strake.thickness;
  }

  // Final pass: record final ratio for each changed strake
  changes.forEach((c) => {
    const arr = S[c.panel];
    const strake = arr && arr[c.idx];
    if (strake) {
      const z_m = midZForStrake(c.panel, strake, c.idx);
      const r = sigmaHGAt(z_m);
      if (r) c.finalRatio = r.ratio;
    }
  });

  if (D.render) D.render();
  if (typeof renderEditor === 'function') renderEditor();
  if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();

  const changesArr = Array.from(changes.values());
  console.log('[autoOptimizePlatesHullGirder] iterations:', iterations,
              'changes:', changesArr, 'capped:', cappedStrakes);

  // Clean up sentinel flags
  Object.keys(S).forEach(k => {
    const arr = S[k];
    if (Array.isArray(arr)) arr.forEach(s => { delete s._hgOptCapped; });
  });

  // User feedback
  if (changesArr.length === 0 && cappedStrakes.length === 0) {
    if (typeof showOptimizeResultsModal === 'function') {
      showOptimizeResultsModal('Optimize Plates (Hull Girder)', []);
    } else {
      alert('Hull girder check passed for every plate — no changes needed.');
    }
    return;
  }
  if (typeof showOptimizeResultsModal === 'function') {
    showOptimizeResultsModal('Optimize Plates (Hull Girder)', changesArr);
  }
  if (cappedStrakes.length > 0) {
    console.warn('[autoOptimizePlatesHullGirder] These strakes hit the t cap (' +
                 T_STEPS[T_STEPS.length-1] + ' mm) and still fail σ_hg ≤ σ_perm:',
                 cappedStrakes);
    setTimeout(() => {
      alert(cappedStrakes.length + ' strake(s) reached the maximum t (' +
            T_STEPS[T_STEPS.length-1] + ' mm) but still fail σ_hg ≤ σ_perm.\n' +
            'Consider higher-grade steel (AH36/AH40) or section modulus boost.');
    }, 100);
  }
}
window.autoOptimizePlatesHullGirder = autoOptimizePlatesHullGirder;

// =========================================================================
// SHOW OPTIMIZE MENU  (Apr 2026)
// -------------------------------------------------------------------------
// Tiny popup attached below the Optimize Plates / Optimize Profiles buttons.
// Two options:
//   • Required only — current behaviour (LR Pt 4 Ch 1 t_req / Z_req)
//   • Buckling only — LR Pt 3 Ch 4 Sec 7 UC ≤ 1.0
// kind: 'plates' | 'profiles'
// =========================================================================
window.showOptimizeMenu = function(evt, kind) {
  evt.stopPropagation();
  // Remove any open menu
  document.querySelectorAll('.optimize-menu-popup').forEach(el => el.remove());

  const btn = evt.currentTarget;
  const rect = btn.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'optimize-menu-popup';
  menu.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${rect.left}px;
    min-width: ${Math.max(rect.width, 180)}px;
    background: var(--bg-secondary, #1a1f2e);
    border: 1px solid var(--accent, #3b82f6);
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    padding: 4px;
    z-index: 99999;
    font-family: var(--font-display, system-ui);
  `;

  const reqHandler = kind === 'plates' ? 'autoOptimizePlates'    : 'autoOptimizeAllLocal';
  const bckHandler = kind === 'plates' ? 'autoOptimizePlatesBuckling' : 'autoOptimizeProfilesBuckling';
  const hgHandler  = 'autoOptimizePlatesHullGirder';   // plates only
  const reqLabel = 'Required only';
  const bckLabel = 'Buckling only';
  const hgLabel  = 'Hull Girder only';
  const reqDesc  = kind === 'plates'
    ? 'LR Pt 4 Ch 1 t_req — base LR scantling formulas'
    : 'LR Pt 4 Ch 1 Z_req — base LR scantling formulas';
  const bckDesc  = kind === 'plates'
    ? 'LR Pt 3 Ch 4 Sec 7 plate buckling — UC ≤ 1.0'
    : 'LR Pt 3 Ch 4 Sec 7 long. buckling — UC ≤ 1.0';
  const hgDesc   = 'LR Pt 3 Ch 4 Sec 5.6 — σ_hg ≤ σ_perm at every plate';

  const mkItem = (label, desc, handler, icon) => {
    const item = document.createElement('div');
    item.style.cssText = `
      padding: 8px 12px;
      cursor: pointer;
      border-radius: 4px;
      transition: background 0.12s;
      display: flex; align-items: flex-start; gap: 8px;
    `;
    item.innerHTML = `
      <span style="font-family:var(--font-mono);font-weight:700;color:var(--accent,#3b82f6);font-size:0.78rem;line-height:1.4;min-width:14px">${icon}</span>
      <div>
        <div style="color:var(--text-primary,#fff);font-size:0.78rem;font-weight:600;line-height:1.3">${label}</div>
        <div style="color:var(--text-muted,#94a3b8);font-size:0.66rem;margin-top:2px;line-height:1.3">${desc}</div>
      </div>
    `;
    item.addEventListener('mouseenter', () => item.style.background = 'var(--bg-tertiary, rgba(59,130,246,0.1))');
    item.addEventListener('mouseleave', () => item.style.background = '');
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.remove();
      try {
        const fn = window[handler];
        if (typeof fn === 'function') fn();
        else alert('Handler not available: ' + handler);
      } catch (err) {
        console.error('[showOptimizeMenu]', err);
        alert('Error: ' + err.message);
      }
    });
    return item;
  };

  menu.appendChild(mkItem(reqLabel, reqDesc, reqHandler, 'R'));
  menu.appendChild(mkItem(bckLabel, bckDesc, bckHandler, 'B'));
  // Hull Girder is plates-only (profile changes have negligible effect on I_NA)
  if (kind === 'plates') {
    menu.appendChild(mkItem(hgLabel, hgDesc, hgHandler, 'H'));
  }

  document.body.appendChild(menu);

  // Dismiss on outside click / Escape
  const close = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', escClose, true);
    }
  };
  const escClose = (e) => {
    if (e.key === 'Escape') {
      menu.remove();
      document.removeEventListener('mousedown', close, true);
      document.removeEventListener('keydown', escClose, true);
    }
  };
  // Defer attachment so the click that opened the menu doesn't immediately close it
  setTimeout(() => {
    document.addEventListener('mousedown', close, true);
    document.addEventListener('keydown', escClose, true);
  }, 50);
};

// =========================================================================
// LAYOUT HELPERS  (Apr 2026)
// -------------------------------------------------------------------------
// (1) toggleSidePanel(which, forceOpen)
//     Slides the left or right sidebar panel open/closed by toggling a
//     class on .main-grid. State is persisted in localStorage so the
//     user's preference survives reloads. Keyboard shortcuts: '[' for
//     left, ']' for right.
//
// (2) updateStatusBar()
//     Pushes M_max, mode, rule-min status into the bottom bar. Called
//     by recalcAll and analysis-mode toggle.
//
// (3) openSlidePopup(title, contentEl) / closeSlidePopup()
//     Replaces blocking inline popups (e.g. inner-side strake editor)
//     with a right-edge slide-in panel that doesn't cover the drawing.
// =========================================================================

window.toggleSidePanel = function(which, forceOpen) {
  const grid = document.querySelector('.main-grid');
  if (!grid) return;
  const cls = which === 'left' ? 'left-collapsed' : 'right-collapsed';
  const isCollapsed = grid.classList.contains(cls);
  if (forceOpen) {
    // Always uncollapse (used by status bar "Details" button)
    grid.classList.remove(cls);
  } else {
    grid.classList.toggle(cls);
  }
  // Persist
  try {
    const state = {
      left: grid.classList.contains('left-collapsed'),
      right: grid.classList.contains('right-collapsed'),
    };
    localStorage.setItem('midship_layout', JSON.stringify(state));
  } catch (_) {}
  // Update toggle arrows
  const lt = document.getElementById('leftPanelToggle');
  if (lt) lt.textContent = grid.classList.contains('left-collapsed') ? '›' : '‹';
  const rt = document.getElementById('rightPanelToggle');
  const rt2 = document.getElementById('rightPanelToggleResult');
  const arrow = grid.classList.contains('right-collapsed') ? '‹' : '›';
  if (rt) rt.textContent = arrow;
  if (rt2) rt2.textContent = arrow;
  // Trigger an SVG redraw so the drawing fits the new width
  if (window.Draw && window.Draw.render) {
    setTimeout(() => window.Draw.render(), 250);
  }
};

// Restore layout state on page load
window.addEventListener('DOMContentLoaded', () => {
  try {
    const raw = localStorage.getItem('midship_layout');
    if (raw) {
      const state = JSON.parse(raw);
      const grid = document.querySelector('.main-grid');
      if (grid) {
        if (state.left)  grid.classList.add('left-collapsed');
        if (state.right) grid.classList.add('right-collapsed');
        // Sync arrows
        const lt = document.getElementById('leftPanelToggle');
        if (lt && state.left) lt.textContent = '›';
        const rt = document.getElementById('rightPanelToggle');
        const rt2 = document.getElementById('rightPanelToggleResult');
        if (state.right) {
          if (rt) rt.textContent = '‹';
          if (rt2) rt2.textContent = '‹';
        }
      }
    }
  } catch (_) {}

  // Init ice panel state (button disabled, status text, body collapsed).
  // We DON'T call onIceEnabledChange() here because that triggers recalcAll()
  // which is a heavy table rebuild (~1-2s on this size of page) and is
  // already running once via the rest of the boot path. Instead, set just
  // the UI bits directly — the toggle is already off in HTML.
  try {
    const body = document.getElementById('iceClassBody');
    if (body) body.style.display = 'none';   // start collapsed
    const btn = document.getElementById('ice_insertBtn');
    if (btn) btn.disabled = true;
    const status = document.getElementById('iceClassStatus');
    if (status) status.textContent = 'DISABLED · click to expand';
  } catch (_) {}
});

// Keyboard shortcuts: [ and ] toggle side panels
window.addEventListener('keydown', (e) => {
  // Skip when user is typing in an input / textarea
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === '[') { e.preventDefault(); window.toggleSidePanel('left'); }
  else if (e.key === ']') { e.preventDefault(); window.toggleSidePanel('right'); }
});

// =========================================================================
// STATUS BAR UPDATE
// =========================================================================
window.updateStatusBar = function() {
  try {
    // M_max from the Loading panel (already computed by Bridge)
    const Ms_input = parseFloat(document.getElementById('MsDesign')?.value || 0);
    if (typeof window.runLongStrengthAnalysis === 'function' && Ms_input) {
      const ls = window.runLongStrengthAnalysis();
      if (ls) {
        const M_hog = Math.abs(ls.M_total_hog);
        const M_sag = Math.abs(ls.M_total_sag);
        const M_max = Math.max(M_hog, M_sag);
        const dir = M_hog >= M_sag ? 'hogging' : 'sagging';
        const M_str = M_max >= 1e6 ? (M_max / 1e6).toFixed(2) + ' GN·m'
                    : M_max >= 1e3 ? (M_max / 1e3).toFixed(0) + ' MN·m'
                    : M_max.toFixed(0) + ' kN·m';
        const mEl = document.getElementById('sbMmax');
        if (mEl) mEl.textContent = M_str + ' ' + dir;
      }
    }
    // Mode
    const modeEl = document.getElementById('sbMode');
    if (modeEl) {
      modeEl.textContent = window.ANALYSIS_MODE ? 'Analysis' : 'Draw';
      modeEl.className = 'sb-value ' + (window.ANALYSIS_MODE ? 'warn' : '');
    }
    // Rule check status — same source as the Summary status card and the
    // step-6 badge: the #cntOk / #cntFail counters. Hidden until an analysis
    // has actually run, instead of a "✓ OK" nobody earned.
    const ruleMinEl = document.getElementById('sbRule');
    const ruleWrap = document.getElementById('sbRuleWrap');
    const ruleSep = document.getElementById('sbRuleSep');
    if (ruleMinEl) {
      const okN = parseInt(document.getElementById('cntOk')?.textContent);
      const fail = parseInt(document.getElementById('cntFail')?.textContent);
      const ran = isFinite(okN) || isFinite(fail);
      if (ruleWrap) ruleWrap.style.display = ran ? '' : 'none';
      if (ruleSep) ruleSep.style.display = ran ? '' : 'none';
      if (ran && fail > 0) {
        ruleMinEl.textContent = '✗ ' + fail + ' FAIL';
        ruleMinEl.className = 'sb-value fail';
      } else if (ran) {
        ruleMinEl.textContent = '✓ ' + okN + ' OK';
        ruleMinEl.className = 'sb-value ok';
      } else {
        ruleMinEl.textContent = '—';
        ruleMinEl.className = 'sb-value';
      }
    }
    // Strake count
    const sw = document.getElementById('sbStrakesWrap');
    const sn = document.getElementById('sbStrakes');
    if (sw && sn && window.Draw?.STRAKES) {
      const total = Object.values(window.Draw.STRAKES).reduce(
        (a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
      sn.textContent = total;
      sw.style.display = '';
    }
    // Stiff count
    const tw = document.getElementById('sbStiffsWrap');
    const tn = document.getElementById('sbStiffs');
    if (tw && tn && window.Draw?.profiles) {
      const total = Object.values(window.Draw.profiles).reduce(
        (a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
      tn.textContent = total;
      tw.style.display = '';
    }
  } catch (e) { /* silent */ }
};

// Hook updateStatusBar into recalcAll-like flows
(function() {
  // Periodically refresh the status bar (cheap, no recompute)
  setInterval(() => {
    if (document.querySelector('.ea-page#page-3.active')) window.updateStatusBar();
  }, 1500);
})();

// =========================================================================
// SLIDE-IN POPUP — replaces blocking modal that covered the drawing
// =========================================================================
window.openSlidePopup = function(title, contentHtmlOrEl) {
  // Remove existing popup
  document.querySelectorAll('.slide-popup').forEach(el => el.remove());
  const popup = document.createElement('div');
  popup.className = 'slide-popup';
  const header = document.createElement('div');
  header.className = 'slide-popup-header';
  const tEl = document.createElement('div');
  tEl.className = 'slide-popup-title';
  tEl.textContent = title || 'Details';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'slide-popup-close';
  closeBtn.innerHTML = '×';
  closeBtn.onclick = () => window.closeSlidePopup();
  header.appendChild(tEl);
  header.appendChild(closeBtn);
  popup.appendChild(header);
  const body = document.createElement('div');
  body.className = 'slide-popup-body';
  if (contentHtmlOrEl instanceof HTMLElement) body.appendChild(contentHtmlOrEl);
  else body.innerHTML = contentHtmlOrEl || '';
  popup.appendChild(body);
  document.body.appendChild(popup);
  // Animate in (rAF available in browsers, fallback to setTimeout for jsdom)
  const raf = (typeof requestAnimationFrame === 'function')
              ? requestAnimationFrame
              : (cb) => setTimeout(cb, 16);
  raf(() => popup.classList.add('open'));
  // ESC closes
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      window.closeSlidePopup();
      window.removeEventListener('keydown', escHandler, true);
    }
  };
  window.addEventListener('keydown', escHandler, true);
  return popup;
};

window.closeSlidePopup = function() {
  document.querySelectorAll('.slide-popup').forEach(el => {
    el.classList.remove('open');
    setTimeout(() => el.remove(), 280);
  });
};

// ============================================================================
// MODERN OPTIMIZE RESULTS MODAL — dark theme, per-panel color-coded table.
// Replaces the native browser alert() for a polished, professional look.
// ============================================================================
function showOptimizeResultsModal(title, changes) {
  // Clean up any existing modal first
  const existing = document.getElementById('optResultsModal');
  if (existing) existing.remove();

  // Panel display names + color from DEFAULT_PALETTE
  const PALETTE = (typeof DEFAULT_PALETTE !== 'undefined') ? DEFAULT_PALETTE : {};
  const panelMeta = (pk) => {
    const map = {
      shell:       { name: '1. Shell',              color: PALETTE.shell       || '#ef4444' },
      innerBottom: { name: '2. Inner Bottom',       color: PALETTE.ib          || '#3b82f6' },
      innerSide:   { name: '3. Inner Side',         color: PALETTE.is          || '#22c55e' },
      sideGirder0: { name: '5. Side Girder I',      color: PALETTE.sideGirder  || '#a855f7' },
      sideGirder1: { name: '6. Side Girder II',     color: PALETTE.sideGirder  || '#a855f7' },
      sideGirder2: { name: '7. Side Girder III',    color: PALETTE.sideGirder  || '#a855f7' },
      upperDeck:   { name: '10. Upper Deck',        color: PALETTE.upperDeck   || '#94a3b8' },
      coamingTop:  { name: '11. Hatch Coaming Top', color: PALETTE.coamingTop  || '#f59e0b' },
      coamingWall: { name: '12. Hatch Coaming Wall',color: PALETTE.coamingWall || '#d946ef' },
    };
    if (map[pk]) return map[pk];
    if (/^stringer\d+$/.test(pk)) return { name: '8. Stringer Deck ' + (pk.slice(8) || ''), color: PALETTE.stringer || '#a855f7' };
    if (/^tween\d+$/.test(pk))    return { name: '9. Tween Deck ' + (pk.slice(5) || ''),    color: PALETTE.tween    || '#06b6d4' };
    if (pk === 'stringer') return { name: '8. Stringer Deck', color: PALETTE.stringer || '#a855f7' };
    if (pk === 'tween')    return { name: '9. Tween Deck',    color: PALETTE.tween    || '#06b6d4' };
    return { name: pk, color: '#64748b' };
  };

  // Group changes by panel
  const byPanel = {};
  (changes || []).forEach(c => { (byPanel[c.panel] = byPanel[c.panel] || []).push(c); });

  // Build rows
  let tableHtml = '';
  const panels = Object.keys(byPanel);
  if (panels.length === 0) {
    tableHtml = `<div style="padding:32px;text-align:center;color:#64748b;font-size:0.85rem">
      <div style="font-size:2.4rem;margin-bottom:8px">✓</div>
      <div>Every strake already matches its required thickness.</div>
      <div style="margin-top:6px;font-size:0.72rem;color:#475569">No changes made.</div>
    </div>`;
  } else {
    panels.forEach(pk => {
      const meta = panelMeta(pk);
      const list = byPanel[pk];
      tableHtml += `
        <div style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:8px;padding:4px 10px;border-left:3px solid ${meta.color};background:${meta.color}1a;border-radius:4px;margin-bottom:6px">
            <span style="font-family:var(--font-display, monospace);font-weight:700;font-size:0.78rem;color:${meta.color};letter-spacing:0.3px">${meta.name}</span>
            <span style="margin-left:auto;font-size:0.68rem;color:#64748b;font-family:monospace">${list.length} strake${list.length > 1 ? 's' : ''}</span>
          </div>
          <div style="display:grid;grid-template-columns:60px 1fr 1fr 1fr;gap:2px;font-size:0.72rem;font-family:monospace">
            <div style="padding:4px 8px;color:#64748b;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.4px">Strake</div>
            <div style="padding:4px 8px;color:#64748b;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.4px">Required</div>
            <div style="padding:4px 8px;color:#64748b;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.4px">From</div>
            <div style="padding:4px 8px;color:#64748b;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.4px">To</div>`;
      list.forEach(c => {
        const dir = c.to > c.from ? '↑' : '↓';
        const dirColor = c.to > c.from ? '#ef4444' : '#22c55e';
        tableHtml += `
            <div style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:3px;color:${meta.color};font-weight:600">#${c.idx + 1}</div>
            <div style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:3px;color:#94a3b8">${(+c.req).toFixed(1)} mm</div>
            <div style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:3px;color:#64748b">${c.from} mm</div>
            <div style="padding:6px 8px;background:rgba(255,255,255,0.02);border-radius:3px;color:#e2e8f0;font-weight:700">${c.to} mm <span style="color:${dirColor};margin-left:4px">${dir}</span></div>`;
      });
      tableHtml += `</div></div>`;
    });
  }

  const totalChanges = changes?.length || 0;
  const modal = document.createElement('div');
  modal.id = 'optResultsModal';
  modal.style.cssText = `
    position:fixed;inset:0;z-index:10000;background:rgba(2,6,23,0.78);
    backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;
    font-family:var(--font-body,system-ui);animation:optFadeIn 0.18s ease-out;
  `;
  modal.innerHTML = `
    <style>
      @keyframes optFadeIn { from { opacity:0; transform:scale(0.96) } to { opacity:1; transform:scale(1) } }
      #optResultsModal .opt-close-btn { transition:all 0.15s }
      #optResultsModal .opt-close-btn:hover { background:#1e40af; transform:translateY(-1px) }
    </style>
    <div style="
      background:linear-gradient(180deg,#0f172a 0%,#0b1220 100%);
      border:1px solid #1e293b;border-radius:12px;
      box-shadow:0 20px 60px rgba(0,0,0,0.6),0 0 0 1px rgba(148,163,184,0.06) inset;
      width:min(640px,90vw);max-height:85vh;display:flex;flex-direction:column;
      animation:optFadeIn 0.22s ease-out">
      <!-- Header -->
      <div style="padding:16px 22px;border-bottom:1px solid #1e293b;display:flex;align-items:center;gap:12px">
        <div style="width:8px;height:8px;background:#22c55e;border-radius:50%;box-shadow:0 0 8px #22c55e"></div>
        <div style="flex:1">
          <div style="font-family:var(--font-display,system-ui);font-weight:700;font-size:0.92rem;color:#e2e8f0;letter-spacing:0.3px">${title}</div>
          <div style="font-size:0.68rem;color:#64748b;margin-top:2px">${totalChanges > 0 ? totalChanges + ' strake(s) updated to meet rule-required thickness' : 'No updates needed'}</div>
        </div>
        <button onclick="document.getElementById('optResultsModal').remove()" style="
          background:transparent;border:1px solid #1e293b;color:#64748b;
          width:28px;height:28px;border-radius:6px;cursor:pointer;font-size:1rem;
          display:flex;align-items:center;justify-content:center">×</button>
      </div>
      <!-- Body -->
      <div style="padding:18px 22px;overflow-y:auto;flex:1">
        ${tableHtml}
      </div>
      <!-- Footer -->
      <div style="padding:12px 22px;border-top:1px solid #1e293b;display:flex;justify-content:flex-end;gap:8px">
        <button class="opt-close-btn" onclick="document.getElementById('optResultsModal').remove()" style="
          background:#2563eb;color:#fff;border:none;padding:8px 18px;
          border-radius:6px;cursor:pointer;font-size:0.78rem;font-weight:600;
          font-family:var(--font-display,system-ui);letter-spacing:0.3px">
          OK
        </button>
      </div>
    </div>
  `;
  // Click outside to close
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}
window.showOptimizeResultsModal = showOptimizeResultsModal;

