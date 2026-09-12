/* ==========================================================================
   30-optimize-profiles.js  —  Stiffener optimizers (local / buckling / bands / auto-all)
   Extracted verbatim from Index.html (lines 16277–18308 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==========================================================================
// Auto-optimize Inner Side thicknesses based on hull girder stress.
// For each IS strake, compute σ_hg at its midpoint and bump thickness until
// ratio σ_hg/σ_perm ≤ 0.85. Upper strakes (far from NA) end up thicker.
// ==========================================================================
function autoOptimizeISThickness() {
  if (!window.Draw || !window.Draw.STRAKES || !window.Draw.STRAKES.innerSide) {
    alert('Geometry not initialized. Visit the Geometry page first.');
    return;
  }
  const strakes = window.Draw.STRAKES.innerSide;
  const G = window.Draw.GEOMETRY || {};
  const p = getParams();
  
  // Target ratio — conservative: 0.85 means σ_hg stays 15% below permissible
  const TARGET_RATIO = 0.85;
  // Thickness steps: common plate thicknesses in naval industry (mm)
  const T_STEPS = [11, 12, 13, 14, 15, 16, 18, 20, 22, 25];
  
  // For each strake, find midpoint z and bump thickness until ratio OK
  let z_cursor = G.IB || 1800;
  const results = [];
  const changes = [];
  
  // We do it in TWO passes because section properties change when we bump:
  // Pass 1: compute initial σ at each strake's midpoint, pick minimum thickness
  // Pass 2: re-compute with new thicknesses (hopefully σ slightly reduced), verify
  
  // Helper: compute σ_hg at z (m) using CURRENT section properties
  const computeSigma = (z_m) => {
    const ls = window.runLongStrengthAnalysis();
    if (!ls || !ls.section || !ls.section.I_NA) return null;
    const dz_m = z_m - ls.section.z_NA;
    const M_hog = Math.abs(ls.M_total_hog);
    const M_sag = Math.abs(ls.M_total_sag);
    const M_max = Math.max(M_hog, M_sag);
    const sigma_hg = Math.abs(M_max * dz_m / ls.section.I_NA) * 1e-3;
    return { sigma_hg, sigma_perm: ls.sigma_amid, ratio: sigma_hg / ls.sigma_amid };
  };
  
  // Iterate up to 3 times to converge (since bumping t changes I)
  const MAX_PASSES = 3;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let anyChanged = false;
    z_cursor = G.IB || 1800;
    strakes.forEach((s, i) => {
      const z_mid_mm = z_cursor + s.width / 2;
      const z_mid_m = z_mid_mm / 1000;
      const sig = computeSigma(z_mid_m);
      z_cursor += s.width;
      
      if (!sig) return;
      
      // Find smallest thickness in T_STEPS such that ratio ≤ TARGET_RATIO
      // Scaling approximation: bumping t in a plate increases its contribution
      // to I_NA, reducing σ. But since plate contribution is small vs global,
      // we assume ratio stays roughly same and just enforce minimum plate
      // thickness such that LOCAL checks (Table 1.9.1) pass AND hull girder
      // is within limits.
      // For local: t_req from calcInnerSide. Use max(t_req, 11).
      // For hull girder: if ratio > 0.85, step up.
      
      let t_target = s.thickness;
      
      // Step up if over target
      if (sig.ratio > TARGET_RATIO) {
        // Find next thicker step
        const curIdx = T_STEPS.indexOf(s.thickness);
        const idx = curIdx < 0 ? 0 : curIdx;
        // Number of steps to bump roughly proportional to ratio excess
        const excess = sig.ratio - TARGET_RATIO;
        const stepsToBump = excess < 0.1 ? 1 : excess < 0.2 ? 2 : excess < 0.3 ? 3 : 4;
        t_target = T_STEPS[Math.min(idx + stepsToBump, T_STEPS.length - 1)];
      }
      // Also enforce local rule minimum (LR Sec 9) via calcInnerSide
      if (typeof window.calcInnerSide === 'function' && pass === 0) {
        try {
          const isCalc = window.calcInnerSide();
          if (isCalc.strakes[i]) {
            const t_local_req = Math.ceil(isCalc.strakes[i].t);
            // Round UP to a T_STEP value
            let t_local_rounded = T_STEPS.find(t => t >= t_local_req) || t_local_req;
            if (t_target < t_local_rounded) t_target = t_local_rounded;
          }
        } catch (e) {}
      }
      
      if (t_target !== s.thickness) {
        if (pass === 0) {
          changes.push({ idx: i, from: s.thickness, to: t_target, z: z_mid_m, ratio: sig.ratio });
        }
        s.thickness = t_target;
        anyChanged = true;
      }
      
      if (pass === MAX_PASSES - 1) {
        results.push({ idx: i, z_m: z_mid_m, t: s.thickness, ratio: sig.ratio });
      }
    });
    if (!anyChanged) break;
  }
  
  // Final report
  let msg = `Inner Side Auto-Optimize Complete\n\n`;
  msg += `Target ratio: σ_hg/σ_perm ≤ ${TARGET_RATIO}\n\n`;
  if (changes.length > 0) {
    msg += `Thickness changes:\n`;
    changes.forEach(c => {
      msg += `  IS-${c.idx+1} (z=${c.z.toFixed(1)}m): ${c.from} → ${c.to} mm  (was ratio ${c.ratio.toFixed(2)})\n`;
    });
  } else {
    msg += `No changes needed — all strakes already pass.\n`;
  }
  msg += `\nFinal strakes:\n`;
  results.forEach(r => {
    const flag = r.ratio > 1 ? '⚠' : r.ratio > 0.85 ? '!' : '✓';
    msg += `  IS-${r.idx+1}: t=${r.t} mm  (z=${r.z_m.toFixed(2)} m, ratio ${r.ratio.toFixed(2)}) ${flag}\n`;
  });
  
  // Trigger re-render
  if (window.Draw && window.Draw.render) window.Draw.render();
  if (typeof renderEditor === 'function') renderEditor();
  // Also re-run rule checks and panels
  if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();
  
  alert(msg);
}
window.autoOptimizeISThickness = autoOptimizeISThickness;


// ============================================================================
// MASTER AUTO-OPTIMIZE — iterates until all rules PASS (or max iterations)
// ============================================================================
// Strategy: Repeatedly bump plates/profiles in regions that are failing, until
// every LR rule check passes. Hull girder is the hardest — thickening deck-
// region plates and enlarging deck profiles increases I_NA, which reduces σ_hg.
//
// Algorithm:
//   1. Run full analysis, collect all FAIL items.
//   2. For each FAIL:
//      - Plate t too thin → bump thickness
//      - Profile Z too small → pick next bigger profile from catalog
//      - Hull girder σ too high at a plate/profile → increase t or Z at that z
//   3. Re-run analysis. Repeat until all PASS or MAX_ITERATIONS reached.
//
// Profile optimization strategy differs by region:
//   - NA-adjacent (bottom, IB, lower side): minimum weight section that meets
//     local Z_req (hull girder ratio naturally low here).
//   - Deck region (stringer, tween, UD, coaming): pick profile with enough Z
//     AND sufficient area × z contribution to keep σ_hg ratio ≤ 0.85.
// ==========================================================================
// LOCAL OPTIMIZER — single stiff or a band of stiffs
// Finds the smallest profile (from L/HP/FB catalog) that satisfies:
//   (a) Z_sec >= Z_req  (LR Pt 4 Ch 1 local scantling)
//   (b) σ_hg at stiff's z-position does not exceed σ_perm (hull girder)
//   (c) Buckling UC (LR Sec 7 Table 4.7.3) <= 1.0
// Profile preference filter: 'L' | 'HP' | 'FB' | 'any'
// ==========================================================================

// Get Z_req for a specific stiff in a group (using the right LR calc)
// Get Z_req for a specific stiff in a group (using the right LR calc)
//
// BRACKET-AWARE l_e (Apr 2026): if user-defined brackets attach to this
// stiff, l_e is locally reduced via withLocalLe(). The reduction is the
// sum of bracket arm lengths (default 250mm each), capped at LR's
// minimum span of 1.5 m. This affects all Z formulas downstream because
// they all read p.le from getParams().
// Safe accessor for PARAMS — returns the value or 'L' default if PARAMS
// is not in scope (e.g. test contexts where the inline script hasn't run).
function _safePARAMS(key) {
  try {
    if (typeof PARAMS !== 'undefined' && PARAMS && PARAMS[key] != null) return PARAMS[key];
  } catch (_) {}
  try {
    if (window.Draw && window.Draw.PARAMS && window.Draw.PARAMS[key] != null) return window.Draw.PARAMS[key];
  } catch (_) {}
  return 'L';  // profile type default
}

function _iReqForStiff(group, stiff, Z_req) {
  // LR Pt 4 Ch 1 Inertia requirement (applies to all longitudinals):
  //   I ≥ (C_I / k) · l_e · Z   [cm⁴]
  //   Tables 1.4.3, 1.4.4, 1.6.1, 1.9.1 (stiffener): C_I = 2.3
  //   Tables 1.4.6 (deck girders in tank), 1.9.1 (stringer/web): C_I = 2.5 or 2.8
  // For longitudinal stiffeners we use C_I = 2.3 (the broadly applicable value).
  if (!Z_req || Z_req <= 0) return 0;
  const p = getParams();
  const le_eff = Math.max(p.le, 1.5);
  const k = p.k || 1.0;
  return (2.3 / k) * le_eff * Z_req;
}

// LR Pt 4 Ch 1 Note 3 (Table 1.9.1) + Note 1 (Table 1.4.3/1.4.4/1.6.1) —
// Web-thickness minimum for stiffeners:
//   Rolled/built profiles: t_w ≥ d_w / (60·√k_L)
//   Flat bars (continuous at bulkheads): t_w ≥ d_w / (18·√k_L)
//   Flat bars (non-continuous):         t_w ≥ d_w / (15·√k_L)
// Returns { ok, t_w, d_w, t_w_min, ratio } or null if profile data unavailable.
function checkWebMin(profName, kL, continuous) {
  if (!profName || !window.Profile?.allProfiles) return null;
  const pd = window.Profile.allProfiles(['L','HP','FB','T']).find(x => x.name === profName);
  if (!pd) return null;
  const d_w = pd.dimensions?.height_mm || pd.dimensions?.d_mm || 0;
  const t_w = pd.dimensions?.webThickness_mm || pd.dimensions?.t_w_mm || 0;
  if (!d_w || !t_w) return null;
  const sqrtkL = Math.sqrt(kL || 1.0);
  let t_w_min;
  if (pd.type === 'FB') {
    t_w_min = d_w / ((continuous !== false ? 18 : 15) * sqrtkL);
  } else {
    // L, HP, T — all have flange/face plate
    t_w_min = d_w / (60 * sqrtkL);
  }
  return {
    ok: t_w >= t_w_min,
    t_w, d_w, t_w_min,
    ratio: t_w / t_w_min,
    type: pd.type,
  };
}
window.checkWebMin = checkWebMin;

function _resolveStiffLe(group, idx, baseLe_m, opts) {
  // Shared resolver for the "every 4th frame" user study override.
  // Called by both _zReqForStiff (drives Z_req calc, profile filtering and
  // FAIL/PASS) and the inspection panels for long-side / long-is (so the
  // displayed l_e matches the value actually used in the formula).
  //
  // opts (optional):
  //   { plateZ: number }
  //     For stringerStiff / tweenStiff — exact z (mm) of the plate this
  //     stiff sits on. Variant 2A places the same `stringerStiff` index on
  //     3 different stringer plates (z = 8590 / 10435 / 11665); plateZ
  //     disambiguates them, so each stringer can have its own l_e.
  //     When omitted, falls back to the LOWEST plate z (conservative for
  //     bulk calc paths that don't know which plate is being asked about).
  //
  // Returns { applied, le_m, reason }. If override doesn't apply, applied=false
  // and le_m equals baseLe_m (caller continues with the unchanged span).
  //
  // ===========================================================================
  // RULE (user spec v5, May 2026) — Z-COORDINATE BASED, variant-independent:
  //
  //   Z RANGE                                       SUPPORT       l_e
  //   ─────────────────────────────────────────────────────────────────────
  //   z ≤ 8590 mm  (IB → stringer level)            every 2 frames  1.452 m
  //   8590 < z < UD  (stringer → just below UD)     every 4 frames  2.904 m
  //   z = top stiff just below UD (closest neigh.)  every 2 frames  1.452 m
  //   z = UD  (Upper Deck plate stiffeners)         every 2 frames  1.452 m
  //
  //   For deck stiffeners (stringerStiff, tweenStiff): the rule uses the z
  //   of THIS specific plate. In variant 2A, stringer-deck stiffs at
  //   z=8590 stay 2-frame, but the same stiff index on the z=10435 and
  //   z=11665 stringer plates becomes 4-frame.
  // ===========================================================================

  const sTransEl = document.getElementById('transFrameSpacing');
  const sTrans = sTransEl ? (parseFloat(sTransEl.value) || 726) : 726;
  const le_4frames = (4 * sTrans) / 1000;
  const le_2frames = baseLe_m;  // keep the global value (typically 1.452 m)

  // Only these groups participate in the override; all others fall through.
  const PARTICIPATES = ['sideShell','innerSide','stringerStiff','tweenStiff','upperDeck'];
  if (!PARTICIPATES.includes(group)) {
    return { applied: false, le_m: baseLe_m, reason: null };
  }

  // Resolve the geometry & profile arrays from window.Draw (which the
  // rest of the app uses as the single source of truth).
  const D = (typeof window !== 'undefined') ? window.Draw : null;
  const G = (D && D.GEOMETRY) || {};
  const profiles = (D && D.profiles) || {};
  const UD = +G.UD || 15300;
  const STRINGER_Z = 8590;   // stringer deck z (fixed in this hull)

  // Determine the z used for the rule, depending on group.
  let z_eval = null;
  let isClosestBelowUD = false;

  if (group === 'sideShell' || group === 'innerSide') {
    const arr = profiles[group];
    if (!Array.isArray(arr) || idx < 0 || idx >= arr.length) {
      return { applied: false, le_m: baseLe_m, reason: null };
    }
    z_eval = +arr[idx].z;
    if (!isFinite(z_eval)) return { applied: false, le_m: baseLe_m, reason: null };

    // Find the stiffener in this group whose z is the MAX strictly below UD.
    // That stiff is treated as "just below UD" → 2-frame support.
    let zMaxBelowUD = -Infinity;
    let idxMaxBelowUD = -1;
    arr.forEach((s, i) => {
      const z = +s.z;
      if (isFinite(z) && z < UD && z > zMaxBelowUD) {
        zMaxBelowUD = z;
        idxMaxBelowUD = i;
      }
    });
    if (idx === idxMaxBelowUD) {
      isClosestBelowUD = true;
    }
  } else if (group === 'stringerStiff') {
    // Prefer caller-supplied plateZ (which stringer plate exactly).
    // Otherwise fall back to the LOWEST stringer plate z (typically 8590)
    // — this is what bulk calc paths that don't know which plate they're
    // looking at should default to (matches the variant-1B-only case).
    if (opts && opts.plateZ != null && isFinite(+opts.plateZ)) {
      z_eval = +opts.plateZ;
    } else {
      const plates = Array.isArray(profiles.stringer) ? profiles.stringer : [];
      const zs = plates.map(p => +p.z).filter(z => isFinite(z));
      z_eval = zs.length ? Math.min(...zs) : STRINGER_Z;
    }
  } else if (group === 'tweenStiff') {
    if (opts && opts.plateZ != null && isFinite(+opts.plateZ)) {
      z_eval = +opts.plateZ;
    } else {
      const plates = Array.isArray(profiles.tweenDeck) ? profiles.tweenDeck : [];
      const zs = plates.map(p => +p.z).filter(z => isFinite(z));
      z_eval = zs.length ? Math.min(...zs) : 12900;
    }
  } else if (group === 'upperDeck') {
    z_eval = UD;             // UD plate → 2-frame by rule
  }

  if (z_eval == null || !isFinite(z_eval)) {
    return { applied: false, le_m: baseLe_m, reason: null };
  }

  // Apply the rule.
  // Boundary z=8590 is INCLUSIVE in the lower (2-frame) zone per user spec.
  // Boundary z=UD goes to upper deck rule (2-frame).
  if (z_eval <= STRINGER_Z) {
    return { applied: false, le_m: le_2frames, reason: `z=${z_eval}mm ≤ 8590 (lower zone, 2-frame)` };
  }
  if (z_eval >= UD) {
    return { applied: false, le_m: le_2frames, reason: `z=${z_eval}mm ≥ UD=${UD} (upper deck zone, 2-frame)` };
  }
  // z is strictly between STRINGER and UD → 4-frame zone, BUT exclude the
  // closest sideShell/innerSide neighbour just below UD.
  if (isClosestBelowUD) {
    return { applied: false, le_m: le_2frames, reason: `closest stiff just below UD=${UD} (2-frame exception)` };
  }
  return { applied: true, le_m: le_4frames, reason: `every-4th-frame: 8590 < z=${z_eval}mm < UD=${UD}` };
}
window._resolveStiffLe = _resolveStiffLe;

function _zReqForStiff(group, stiff) {
  // Build longInfo for bracket lookup
  const D = window.Draw;
  const G = D?.GEOMETRY || GEOMETRY;
  let longInfo = null;
  if (group === 'bottomShell' && stiff?.y != null) {
    longInfo = { plate: 'shell', y: stiff.y, z: 0 };
  } else if (group === 'innerBottom' && stiff?.y != null) {
    longInfo = { plate: 'innerBottom', y: stiff.y, z: G.IB };
  } else if (group === 'sideShell' && stiff?.z != null) {
    longInfo = { plate: 'shell', z: stiff.z, y: G.B_half };
  } else if (group === 'innerSide' && stiff?.z != null) {
    longInfo = { plate: 'innerSide', z: stiff.z, y: G.IS };
  } else if (group === 'upperDeck' && stiff?.y != null) {
    longInfo = { plate: 'upperDeck', y: stiff.y, z: G.UD };
  } else if ((group === 'stringer' || group === 'stringerStiff') && stiff?.y != null) {
    longInfo = { plate: 'stringer', y: stiff.y, z: stiff.z };
  } else if ((group === 'tweenStiff' || group === 'tweenDeck') && stiff?.y != null) {
    longInfo = { plate: 'tween', y: stiff.y, z: stiff.z };
  } else if (group === 'coamingStiff' && stiff?.y != null) {
    longInfo = { plate: 'coamingTop', y: stiff.y, z: G.HC };
  }

  // Determine the effective l_e for this stiff (LR Pt 4 Ch 1 Sec 1.5)
  let baseLe = parseFloat(document.getElementById('le')?.value) || 1.5;

  // ===== USER OVERRIDE (May 2026, what-if study v4) =========================
  // Z-coordinate based rule (variant-independent):
  //   z ≤ 8590 mm               → 2-frame support (l_e = 1.452 m)
  //   8590 < z < UD             → 4-frame support (l_e = 2.904 m)
  //   closest stiff just below UD → 2-frame support (UD-neighbour exception)
  //   z = UD (Upper Deck stiffs)→ 2-frame support
  // Applies to sideShell, innerSide, stringerStiff, tweenStiff, upperDeck.
  // See _resolveStiffLe() for the full spec.
  // ==========================================================================
  try {
    const D_ = window.Draw;
    const arr_ = D_?.profiles?.[group];
    const idx_ = (arr_ && Array.isArray(arr_)) ? arr_.indexOf(stiff) : -1;
    if (typeof window._resolveStiffLe === 'function') {
      // For linked-deck groups (stringerStiff, tweenStiff), do NOT apply
      // a single l_e override here — _zReqForStiff_core handles per-plate
      // l_e internally and returns the governing (max) Z_req. Applying an
      // override at this level would either double-count (bad) or pin the
      // wrong plate (wrong). Just record metadata for inspection display.
      if (group === 'stringerStiff' || group === 'tweenStiff') {
        // mark whether ANY plate triggers the override (for tooltip / panel)
        const platesArr = group === 'stringerStiff'
          ? (D_?.profiles?.stringer || [])
          : (D_?.profiles?.tweenDeck || []);
        const anyOver = platesArr.some(pl => {
          const o = window._resolveStiffLe(group, idx_, baseLe, { plateZ: +pl.z });
          return o && o.applied;
        });
        if (stiff && typeof stiff === 'object') {
          if (anyOver) stiff._le_override_reason = `multi-plate: some plates 4-frame (see panel for per-plate breakdown)`;
          else delete stiff._le_override_reason;
        }
      } else {
        const over = window._resolveStiffLe(group, idx_, baseLe);
        if (over.applied) {
          baseLe = over.le_m;
          if (stiff && typeof stiff === 'object') stiff._le_override_reason = over.reason;
        } else {
          if (stiff && typeof stiff === 'object') delete stiff._le_override_reason;
        }
      }
    }
  } catch (_) {}

  let le_eff = baseLe;
  if (longInfo && typeof bracketSpanReductionForLong === 'function') {
    le_eff = effectiveLeWithBrackets(baseLe, longInfo);
  }
  // Stash the chosen l_e on the stiff object so the inspection panel can show it
  if (stiff && typeof stiff === 'object') stiff._le_eff_m = le_eff;

  // Per-stiff effective load width (Apr 2026 fix).
  // Group-wide max-gap (default behaviour of realLongSpacing) is correct for
  // PLATE thickness but WRONG for individual stiffener Z: each stiff carries
  // s = (gap_above + gap_below) / 2 of plate (LR Pt 4 Ch 1 Sec 1.5). With
  // uneven layouts, sparse stiffs were being under-sized and dense stiffs
  // over-sized when everyone shared the group's max-gap.
  // Compute the stiff's own mean tributary width once, store it on the stiff
  // object itself (single source of truth — read by withLocalSpacing below
  // and by the inspection panel for display), then run the calc chain.
  if (stiff && typeof stiff === 'object') {
    stiff._s_mean_mm = null;          // start clean each call
    try {
      const D = window.Draw;
      const arr = D?.profiles?.[group];
      const idx = (arr && Array.isArray(arr)) ? arr.indexOf(stiff) : -1;
      if (idx >= 0 && typeof meanStiffSpacing === 'function') {
        const _GS = {
          bottomShell:   { coord:'y', supports:'bottomShell' },
          innerBottom:   { coord:'y', supports:'innerBottom' },
          sideShell:     { coord:'z', supports:'sideShell'   },
          innerSide:     { coord:'z', supports:'innerSide'   },
          upperDeck:     { coord:'y', supports:null          },
          stringerStiff: { coord:'y', supports:null          },
          tweenStiff:    { coord:'y', supports:null          },
          coamingStiff:  { coord:'y', supports:null          },
        };
        const meta = _GS[group];
        if (meta) {
          const xs = (meta.supports && typeof getPlateSupports === 'function')
                     ? getPlateSupports(meta.supports) : [];
          const sm = meanStiffSpacing(group, idx, {
            coord: meta.coord,
            extraSupports: xs,
            defaultFallback: 700
          });
          if (isFinite(sm) && sm > 0) stiff._s_mean_mm = sm;
        }
      }
    } catch (_) {}
  }

  // Wrap in BOTH le and material-family overrides AND per-stiff spacing so
  // the underlying calc*/calcBottomLong/calcSideLong functions compute Z_req
  // with the stiff's own yield class, bracket-corrected l_e, and tributary s.
  // Read s straight from the stiff (single source of truth).
  // Family resolution: pinned (stiff.family) → parent strake's resolved
  // material family → null (let withLocalFamily fall back to global Setup).
  // Pinning is OPT-IN — most longs won't carry stiff.family at all and we
  // need to honour the parent strake's Setup zone even so.
  let stiffFamily = (stiff && stiff.family) ? stiff.family : null;
  if (!stiffFamily && stiff && typeof getInheritedFamilyForLong === 'function') {
    try {
      const idxInArr = Array.isArray(window.Draw?.profiles?.[group])
        ? window.Draw.profiles[group].indexOf(stiff) : -1;
      if (idxInArr >= 0) {
        const inh = getInheritedFamilyForLong(group, idxInArr);
        if (inh) stiffFamily = (inh === 'MS') ? 'Mild' : 'HT';
      }
    } catch (_) {}
  }
  return withLocalSpacing(stiff?._s_mean_mm, () =>
    withLocalLe(le_eff, () =>
      withLocalFamily(stiffFamily, () => _zReqForStiff_core(group, stiff))
    )
  );
}

function _zReqForStiff_core(group, stiff) {
  try {
    if (group === 'bottomShell') {
      return window.calcBottomLong?.().Z_req || 0;
    } else if (group === 'innerBottom') {
      // Sec 8.4.5: "Z ≥ 0.85 × Z_bottom-longitudinal RULE value".
      // The reference Z_bottom must be computed under the BOTTOM long's
      // own spacing (not this IB stiff's spacing). Temporarily clear the
      // local-s override for the bottom calc, then restore for any IB-side
      // formula evaluated downstream.
      const bl = withLocalSpacing(null, () => window.calcBottomLong?.());
      // CORRECT: pass the bottom long's REQUIRED Z (rule value) to calcIBLong,
      // NOT Z_sec (actual profile capacity).
      return window.calcIBLong?.(bl?.Z_req || 0).Z_req || 0;
    } else if (group === 'upperDeck') {
      return window.calcUpperDeckLong?.().Z_req || 0;
    } else if (group === 'sideShell') {
      // calcSideLong returns array per long — pick entry at stiff.z.
      // CRITICAL: r.z is in mm (from L.z in DEFAULT_SIDE_LONGS), stiff.z is also in mm.
      // Do NOT multiply by 1000.
      const arr = window.calcSideLong?.() || [];
      if (Array.isArray(arr) && arr.length > 0 && stiff.z != null) {
        let best = arr[0], bd = Math.abs(arr[0].z - stiff.z);
        arr.forEach(r => {
          const d = Math.abs(r.z - stiff.z);
          if (d < bd) { best = r; bd = d; }
        });
        return best.Z_req || 0;
      }
      return arr?.Z_req || 0;
    } else if (group === 'innerSide') {
      // IS long Z_req computed from the compartment OUTBOARD of the IS wall
      // (tank side). If the compartment is a tank (ballast/fuel/freshwater),
      // use LR Table 1.9.1 (2) Deep Tank formula. If void/cargo, Z_req = 0
      // (stiff sized only by hull-girder + buckling).
      // This matches the inspection panel formula at line ~12966.
      try {
        const p = getParams();
        const G = window.Draw.GEOMETRY;
        const IS_Y = G.IS || 10030;
        const z_m = (stiff?.z || 0) / 1000;
        const z_mm = stiff?.z || 0;
        const compOutboard = window.getCompartmentAt?.(IS_Y + 50, z_mm);
        if (!compOutboard || !['ballast','fuel','freshwater'].includes(compOutboard.type)) return 0;
        const rho = compOutboard.rho || 1.025;
        const pipe_mm = compOutboard.airpipeZ_mm;
        const bb = window._compartmentBoundingBox?.(compOutboard);
        const tank_top_mm = bb?.zMax ?? p.udLevel;
        if (pipe_mm == null) return 0;
        const h_4 = Math.max((Math.max(tank_top_mm, (z_mm + pipe_mm) / 2) - z_mm) / 1000, 0.5);
        // Use the actual IS strake spacing for this stiff, falling back to 650.
        // Find the IS strake whose z-range contains stiff.z, and read its spacing.
        // PRIORITY (Apr 2026): if a per-stiff override is active (set by
        // _zReqForStiff via withLocalSpacing), use that — it's the stiff's
        // own (gap_above + gap_below)/2 effective load width and supersedes
        // the strake's planned spacing.
        let s_is = 650;
        if (_S_OVERRIDE_MM != null && isFinite(_S_OVERRIDE_MM) && _S_OVERRIDE_MM > 0) {
          s_is = _S_OVERRIDE_MM;
        } else {
          try {
            const IS_strakes = window.Draw?.STRAKES?.innerSide || [];
            let cursor = G.IB || 1800;
            for (const st of IS_strakes) {
              if (z_mm >= cursor && z_mm <= cursor + st.width) {
                s_is = st.spacing_mm || s_is;
                break;
              }
              cursor += st.width;
            }
          } catch (_) {}
        }
        const Z_req = rho * s_is * p.k * h_4 * p.le * p.le / (22 * 1.4 * 4);
        return Z_req;
      } catch (e) { return 0; }
    } else if (group === 'stringer' || group === 'stringerStiff') {
      // Variant 2A places the same stringerStiff index on 3 different plates
      // (z = 8590 / 10435 / 11665). Per user spec v5, each plate has its
      // own l_e (8590 → 2-frame, 10435 & 11665 → 4-frame). For the bulk
      // profile-selection path (which has no notion of "which plate"), we
      // must size to the GOVERNING (worst) case: compute Z_req under each
      // plate's l_e and return the maximum. The inspection panel uses
      // plateZ to show the per-plate breakdown.
      const plates = (window.Draw?.profiles?.stringer || []).map(p => +p.z).filter(z => isFinite(z));
      if (plates.length <= 1) {
        return window.calcLowerDeckLong?.('str').Z_req || 0;
      }
      const baseLe = parseFloat(document.getElementById('le')?.value) || 1.5;
      let zMax = 0;
      plates.forEach(pz => {
        const o = window._resolveStiffLe?.('stringerStiff', 0, baseLe, { plateZ: pz });
        const le_use = (o && isFinite(o.le_m)) ? o.le_m : baseLe;
        const z_one = window.withLocalLe?.(le_use, () => window.calcLowerDeckLong?.('str').Z_req) || 0;
        if (z_one > zMax) zMax = z_one;
      });
      return zMax;
    } else if (group === 'tweenStiff' || group === 'tweenDeck') {
      // Same governing-max logic as stringerStiff above, in case variant
      // configurations ever introduce multiple tween-deck plates.
      const plates = (window.Draw?.profiles?.tweenDeck || []).map(p => +p.z).filter(z => isFinite(z));
      if (plates.length <= 1) {
        return window.calcLowerDeckLong?.('twn').Z_req || 0;
      }
      const baseLe = parseFloat(document.getElementById('le')?.value) || 1.5;
      let zMax = 0;
      plates.forEach(pz => {
        const o = window._resolveStiffLe?.('tweenStiff', 0, baseLe, { plateZ: pz });
        const le_use = (o && isFinite(o.le_m)) ? o.le_m : baseLe;
        const z_one = window.withLocalLe?.(le_use, () => window.calcLowerDeckLong?.('twn').Z_req) || 0;
        if (z_one > zMax) zMax = z_one;
      });
      return zMax;
    } else if (group === 'coamingStiff') {
      return window.calcCoamingStiff?.().Z_req || 0;
    }
  } catch (e) {}
  return 0;
}
// Expose to window so the Excel export (defined later in the file) can
// call the rule-check core directly without relying on the implicit
// top-level function → global hoisting.
if (typeof window !== 'undefined') {
  window._zReqForStiff      = _zReqForStiff;
  window._zReqForStiff_core = _zReqForStiff_core;
}

// Check hull girder stress at stiff position (pass if σ_hg <= σ_perm)
function _hgStressAtStiff(group, stiff) {
  try {
    const p = getParams();
    const ls = window.runLongStrengthAnalysis?.();
    if (!ls?.section?.I_NA) return { ok: true, ratio: 0 };
    const G = window.Draw.GEOMETRY;
    // Resolve z_m for the stiff. Prefer the stiff's own z when set; otherwise
    // use the group's canonical z (e.g. IB level for IB longs).
    let z_m;
    if (stiff && stiff.z != null && stiff.z > 0) {
      z_m = stiff.z / 1000;
    } else if (group === 'bottomShell') z_m = 0;
    else if (group === 'innerBottom') z_m = G.IB/1000;
    else if (group === 'upperDeck') z_m = G.UD/1000;
    else if (group === 'coamingStiff') z_m = G.HC/1000;
    else if (group === 'stringerStiff' || group === 'stringer') {
      // Stiff sits on the stringer plate — use the plate's z (first stringer plate)
      const plate = window.Draw.profiles.stringer?.[0];
      z_m = plate ? plate.z / 1000 : (G.IB + 2000) / 1000;
    }
    else if (group === 'tweenStiff' || group === 'tweenDeck') {
      const plate = window.Draw.profiles.tweenDeck?.[0];
      z_m = plate ? plate.z / 1000 : (G.IB + 5000) / 1000;
    }
    else z_m = (stiff.z||0)/1000;
    const M_max = Math.max(Math.abs(ls.M_total_hog), Math.abs(ls.M_total_sag));
    const sigma_hg = Math.abs(M_max * (z_m - ls.section.z_NA) / ls.section.I_NA) * 1e-3;
    const ratio = sigma_hg / ls.sigma_amid;
    return { ok: ratio <= 1.0, ratio, sigma_hg, sigma_perm: ls.sigma_amid };
  } catch (e) {
    return { ok: true, ratio: 0 };
  }
}

// Check buckling at stiff position (LR Sec 7 Table 4.7.3)
function _bucklingForStiff(group, stiff, profName) {
  try {
    if (!window.Buckling) return { ok: true, UC: 0 };
    let d_w=0, t_w=0, b_f=0, t_f=0, prof_type = 'L';

    // ─── CUSTOM PROFILE BRANCH ──────────────────────────────────────────
    // If the stiff was set with a custom profile via the modal, use its
    // dimensions directly. Otherwise the catalog lookup below returns null
    // and buckling silently reports "ok:true, UC:0" for any custom stiff —
    // a serious safety gap that hid failures.
    if (stiff && stiff.customProfile) {
      const cp = stiff.customProfile;
      const d = cp.dims || {};
      if (cp.type === 'L')       { d_w=d.a||0; t_w=d.t||0; b_f=d.b||0; t_f=d.t||0; prof_type='L'; }
      else if (cp.type === 'HP') { d_w=d.b||0; t_w=d.t||0; b_f=d.c||0; t_f=d.c||0; prof_type='BULB'; }
      else if (cp.type === 'FB') { d_w=d.h||0; t_w=d.t||0; prof_type='FLAT_BAR'; }
      else if (cp.type === 'T')  { d_w=d.h||0; t_w=d.tw||0; b_f=d.bf||0; t_f=d.tf||0; prof_type='TEE'; }
    } else {
      if (!window.Profile?.allProfiles) return { ok: true, UC: 0 };
      const pc = window.Profile.allProfiles(['L','HP','FB','T']).find(x => x.name === profName);
      if (!pc) return { ok: true, UC: 0 };
      const dim = pc.dimensions || {};
      if (pc.type === 'L')  { d_w=dim.a||0; t_w=dim.t||0; b_f=dim.b||0; t_f=dim.t||0; }
      else if (pc.type === 'HP') { d_w=dim.b||0; t_w=dim.t||0; b_f=dim.c||0; t_f=dim.c||0; }
      else if (pc.type === 'FB') { d_w=dim.h||dim.a||0; t_w=dim.t||0; }
      else if (pc.type === 'T')  { d_w=dim.a||0; t_w=dim.tw||dim.t||0; b_f=dim.b||0; t_f=dim.tf||dim.t||0; }
      prof_type = pc.type === 'L' ? 'L' : pc.type === 'HP' ? 'BULB' : pc.type === 'FB' ? 'FLAT_BAR' : 'TEE';
    }

    const p = getParams();
    const kL = p.kL || 0.72;
    const material = p.material || 'AH36';
    const ls = window.runLongStrengthAnalysis?.();
    if (!ls?.section?.I_NA) return { ok: true, UC: 0 };
    const G = window.Draw.GEOMETRY;
    let z_m;
    if (group === 'bottomShell') z_m = 0;
    else if (group === 'innerBottom') z_m = G.IB/1000;
    else if (group === 'upperDeck') z_m = G.UD/1000;
    else if (group === 'coamingStiff') z_m = G.HC/1000;
    else if (group === 'stringerStiff' || group === 'stringer') {
      const plate = window.Draw.profiles.stringer?.[0];
      z_m = plate ? plate.z / 1000 : (G.IB + 2000) / 1000;
    }
    else if (group === 'tweenStiff' || group === 'tweenDeck') {
      const plate = window.Draw.profiles.tweenDeck?.[0];
      z_m = plate ? plate.z / 1000 : (G.IB + 5000) / 1000;
    }
    else z_m = (stiff.z||0)/1000;
    const z_deck_m = G.UD/1000;
    const z_face = (z_m >= ls.section.z_NA) ? (z_deck_m - ls.section.z_NA) : ls.section.z_NA;
    const M_max = Math.max(Math.abs(ls.M_total_hog), Math.abs(ls.M_total_sag));
    const sigma_face = Math.abs(M_max * z_face / ls.section.I_NA) * 1e-3;
    const sigma_A = window.Buckling.sigmaADesign(sigma_face, Math.abs(z_m - ls.section.z_NA), z_face, kL);

    // Real spacing for this group (was hardcoded 700 — significant for UC):
    const spacingIds = {
      bottomShell:'bottomLongSpacing', innerBottom:'ibLongSpacing',
      upperDeck:'deckLongSpacing',
      stringerStiff:'strDeckSpacing', tweenStiff:'twnDeckSpacing',
    };
    let s_mm_b = 700;
    const sid_b = spacingIds[group];
    if (sid_b) {
      const v = parseFloat(document.getElementById(sid_b)?.value);
      if (v > 0) s_mm_b = v;
    }
    // Real plate thickness at stiff's z (was hardcoded 14/13 by group).
    // For side/IS we look up the specific strake at the stiff's z rather
    // than using the first one (significant difference for tall side strakes
    // with varying t).
    let t_p_mm = 14;
    const PT = window.Draw.PLATE_THICKNESS || {};
    const G2 = window.Draw.GEOMETRY || {};
    if (group === 'bottomShell') {
      const strakes = window.Draw.STRAKES?.shell || [];
      const bottomS = strakes.find(s => s.kind === 'keel' || s.kind === 'bottom');
      if (bottomS) t_p_mm = bottomS.thickness || t_p_mm;
    } else if (group === 'sideShell') {
      const strakes = window.Draw.STRAKES?.shell || [];
      const R_B = G2.R_B || 1800;
      const z_mm = (stiff?.z || 0);
      let cursor = R_B;
      for (const st of strakes) {
        if (st.kind !== 'side') continue;
        if (z_mm >= cursor && z_mm <= cursor + st.width) { t_p_mm = st.thickness || t_p_mm; break; }
        cursor += st.width;
      }
      // fallback if no hit
      if (t_p_mm === 14) {
        const firstSide = strakes.find(s => s.kind === 'side');
        if (firstSide) t_p_mm = firstSide.thickness || t_p_mm;
      }
    } else if (group === 'innerBottom') {
      t_p_mm = PT.ib || (window.Draw.STRAKES?.innerBottom?.[0]?.thickness) || 13;
    } else if (group === 'innerSide') {
      // Walk IS strakes from IB to find the one containing stiff.z
      const strakes = window.Draw.STRAKES?.innerSide || [];
      const z_mm = (stiff?.z || 0);
      let cursor = G2.IB || 1800;
      let hit = false;
      for (const st of strakes) {
        if (z_mm >= cursor && z_mm <= cursor + st.width) { t_p_mm = st.thickness || t_p_mm; hit = true; break; }
        cursor += st.width;
      }
      if (!hit) t_p_mm = PT.is || strakes[0]?.thickness || 11;
    } else if (group === 'upperDeck') t_p_mm = PT.upperDeck || 15;
    else if (group === 'stringerStiff') t_p_mm = PT.stringer || 11;
    else if (group === 'tweenStiff') t_p_mm = PT.tween || 11;
    else if (group === 'coamingStiff') t_p_mm = PT.coaming || 20;

    const r = window.Buckling.checkLong({
      d_w, t_w, b_f, t_f, s_mm: s_mm_b, t_p_mm, S_m: 2.1,
      prof: prof_type, sigma_A,
      corrosion: 'DRY_BULK', corrosion_plate: 'DRY_BULK', material
    });
    return { ok: r.pass_all, UC: r.UC };
  } catch (e) {
    return { ok: true, UC: 0 };
  }
}

// Optimize a single stiff — returns new profileName (or null if none found)
// Helper: determine real attached-plate width (spacing between longs) and
// thickness for a given stiffener group + stiff. Used by optimizeStiff /
// optimizeBand / findTopCandidates so they all consistently feed the
// correct plate parameters to findBestFit / computeCombinedSection.
// Without this, Z_sec would be computed against hardcoded s=700, t=14, which
// systematically misranks profiles in the optimizer.
function _attachedPlateFor(group, stiff) {
  const D = window.Draw;
  const PT = (D && D.PLATE_THICKNESS) || {};
  const spacingIds = {
    bottomShell:'bottomLongSpacing', innerBottom:'ibLongSpacing',
    upperDeck:'deckLongSpacing',
    stringerStiff:'strDeckSpacing', tweenStiff:'twnDeckSpacing',
  };
  // ── Spacing resolution (Apr 2026 fix) ────────────────────────────────
  // Priority order:
  //   (1) stiff._s_mean_mm — per-stiff tributary width computed by
  //       _zReqForStiff (single source of truth, used by Z_req calc).
  //       This is dynamic: changes when neighbouring stiffs move.
  //   (2) form input (spacingIds[group]) — group-default spacing for
  //       the simpler groups that have a single Long-Spacing field.
  //   (3) 700 mm fallback.
  // The earlier code skipped (1) entirely → optimizer's combined-section
  // calc used 700 mm even for dense layouts (e.g. IS UD-HC at 350 mm),
  // which over-stated Z_provided and let short+thick FBs (100x28) pass
  // a Z_req that was actually computed with 350 mm. Now both checks see
  // the same s.
  let pw_mm = null;
  if (stiff && typeof stiff._s_mean_mm === 'number'
      && isFinite(stiff._s_mean_mm) && stiff._s_mean_mm > 0) {
    pw_mm = stiff._s_mean_mm;
  } else {
    const sid = spacingIds[group];
    if (sid) {
      const v = parseFloat(document.getElementById(sid)?.value);
      if (v > 0) pw_mm = v;
    }
    if (pw_mm == null) pw_mm = 700;
  }
  // plate thickness — look up the strake whose z-range contains the stiff.
  let pt_mm = 14;
  if (!D) return { pw_mm, pt_mm };
  const G = D.GEOMETRY || {};
  if (group === 'bottomShell') {
    const strakes = D.STRAKES?.shell || [];
    const bottomS = strakes.find(s => s.kind === 'keel' || s.kind === 'bottom');
    if (bottomS) pt_mm = bottomS.thickness || pt_mm;
  } else if (group === 'sideShell') {
    const strakes = D.STRAKES?.shell || [];
    const R_B = G.R_B || 1800;
    const z_mm = (stiff?.z || 0);
    let cursor = R_B;
    let hit = false;
    for (const st of strakes) {
      if (st.kind !== 'side') continue;
      if (z_mm >= cursor && z_mm <= cursor + st.width) { pt_mm = st.thickness || pt_mm; hit = true; break; }
      cursor += st.width;
    }
    if (!hit) {
      const firstSide = strakes.find(s => s.kind === 'side');
      if (firstSide) pt_mm = firstSide.thickness || pt_mm;
    }
  } else if (group === 'innerBottom') {
    pt_mm = PT.ib || D.STRAKES?.innerBottom?.[0]?.thickness || 13;
  } else if (group === 'innerSide') {
    const strakes = D.STRAKES?.innerSide || [];
    const z_mm = (stiff?.z || 0);
    let cursor = G.IB || 1800;
    let hit = false;
    for (const st of strakes) {
      if (z_mm >= cursor && z_mm <= cursor + st.width) { pt_mm = st.thickness || pt_mm; hit = true; break; }
      cursor += st.width;
    }
    if (!hit) pt_mm = PT.is || strakes[0]?.thickness || 11;
  } else if (group === 'upperDeck')     pt_mm = PT.upperDeck || 15;
  else if (group === 'stringerStiff') pt_mm = PT.stringer  || 11;
  else if (group === 'tweenStiff')    pt_mm = PT.tween     || 11;
  else if (group === 'coamingStiff')  pt_mm = PT.coaming   || 20;
  return { pw_mm, pt_mm };
}

function optimizeStiff(group, index, preferredType) {
  const D = window.Draw;
  const stiff = D.profiles[group]?.[index];
  if (!stiff) return null;
  // Edge-locked FB (coaming edge) — never touched
  if (stiff.edge && stiff.locked) return stiff.profileName || null;

  // Z_required — panel-specific, may be 0 for voids
  const Z_req = _zReqForStiff(group, stiff);

  // LR inertia requirement: I ≥ (2.3/k)·l_e·Z  [cm⁴]
  // Enforced for all longitudinal stiffeners (Tables 1.4.3, 1.4.4, 1.6.1, 1.9.1).
  const I_req = _iReqForStiff(group, stiff, Z_req);

  // Attached plate (for combined Z_sec calc)
  const { pw_mm, pt_mm } = _attachedPlateFor(group, stiff);

  const families = preferredType === 'any' ? ['L', 'HP', 'FB'] : [preferredType];

  // Resolve k_L and group continuity for slenderness filtering inside findBestFit.
  // Inner side longitudinals are tank boundaries → non-continuous (15·√k_L).
  // All others use the continuous (18·√k_L) limit.
  const _p_kL  = (typeof getParams === 'function') ? getParams() : null;
  const kL_use = (_p_kL && _p_kL.kL) || 0.72;
  const fbContinuous = (group !== 'innerSide');

  // Ask the profile library for every profile in this family with Z_sec >= Z_req AND I >= I_req
  const candidates = window.Profile.findBestFit(Z_req, {
    families, plateWidth_mm: pw_mm, plateThickness_mm: pt_mm,
    margin: 1.0, maxResults: 200,
    Ineeded_cm4: I_req,
    kL: kL_use, fbContinuous
  });

  if (!candidates.length) {
    // Stay in the user's chosen family. If they asked for FB only and no FB
    // profile in the catalogue meets Z_req with the slenderness limit, return
    // null so the UI flags "no FB satisfies the rule" instead of silently
    // handing back an HP. Widening only happens when the user is on 'any'.
    return null;
  }

  // Sort candidates so the picked profile is the LIGHTEST one that meets all
  // requirements. For FB this naturally yields tall+thin sections (FB 190x14)
  // rather than short+thick ones (FB 130x30) — because for the same Z, area
  // scales linearly with t·h while Z scales with t·h², so increasing h while
  // reducing t reduces mass for equivalent stiffness.
  candidates.sort((a, b) => {
    const wA = a.weight_kgm || 0;
    const wB = b.weight_kgm || 0;
    if (wA !== wB) return wA - wB;                  // lightest first
    const dZa = (a.Z_cm3 || 0) - Z_req;
    const dZb = (b.Z_cm3 || 0) - Z_req;
    return dZa - dZb;                               // tighter Z second
  });

  const picked = candidates[0];
  stiff.profileName = picked.name;
  return picked.name;
}
window.optimizeStiff = optimizeStiff;

// =========================================================================
// BUCKLING-ONLY STIFFENER OPTIMIZER  (Apr 2026)
// -------------------------------------------------------------------------
// Same flow as optimizeStiff but the selection criterion is Buckling UC ≤ 1.0
// (LR Pt 3 Ch 4 Sec 7) — Z_req from Pt 4 Ch 1 is IGNORED.
//
// For each candidate profile in the preferred family (L / HP / FB / any),
// temporarily set stiff.profileName, call window.Buckling.checkLong,
// and pick the SMALLEST profile whose UC ≤ 1.0.
//
// We don't iterate by "profile size order" because catalogs aren't strictly
// monotone in section capacity — instead we sort all candidates by weight
// (lightest first) and walk through.
// =========================================================================
function optimizeStiffBuckling(group, index, preferredType) {
  const D = window.Draw;
  const stiff = D.profiles[group]?.[index];
  if (!stiff) return null;
  if (stiff.edge && stiff.locked) return stiff.profileName || null;
  if (!window.Buckling || !window.Profile) return null;

  // Hull girder context — needed for σ_A
  // NOTE (v37): The σ_A / z_m / sigma_face / corrosion / s_mm bookkeeping
  // below is LEGACY — it is no longer fed into the buckling check itself,
  // because we now route every candidate through `_bucklingForStiff` (the
  // inspector function), which computes all of these internally and is
  // the single source of truth. The block is kept here only to (a) bail
  // early if hull-girder analysis is unavailable, and (b) compute the
  // attached-plate dimensions (pw_mm / pt_mm) that the Z_req / I_req
  // candidate filter uses. The other locals are dead but harmless.
  const p = (typeof getParams === 'function') ? getParams() : { Ms_design: 0, kL: 0.72 };
  const Ms_design = p.Ms_design || parseFloat(document.getElementById('MsDesign')?.value || 0);
  const ls = (typeof runLongStrengthAnalysis === 'function') ? runLongStrengthAnalysis() : null;
  if (!ls || !ls.section || !ls.section.I_NA) return null;

  // Determine the stiff's z (m above baseline) for σ_A calc
  const G = D.GEOMETRY || {};
  const groupToZ = (g, st) => {
    if (g === 'bottomShell')   return 0;
    if (g === 'innerBottom')   return (G.IB || 1800) / 1000;
    if (g === 'sideShell')     return (st.z || 0) / 1000;
    if (g === 'innerSide')     return (st.z || 0) / 1000;
    if (g === 'upperDeck')     return (G.UD || 15300) / 1000;
    // v36: stringer/tween/coaming stiff z values were derived from G.TT
    // and an averaged formula that put stringer at 12.9 m (actually
    // ~8.59 m) and tween at 7.35 m (actually 12.9 m). That gave the
    // optimizer a wildly wrong σ_face → wrong UC → it was happy with
    // tiny profiles (HP 60x5) for tween deck even though the real
    // compressive stress at z=12.9 m needs much bigger sections.
    // Read the live form fields (`strDeckZ`, `twnDeckZ`) instead — same
    // source the inspector uses.
    if (g === 'stringerStiff') {
      const zv = parseFloat(document.getElementById('strDeckZ')?.value);
      return (isFinite(zv) && zv > 0 ? zv : 8590) / 1000;
    }
    if (g === 'tweenStiff') {
      const zv = parseFloat(document.getElementById('twnDeckZ')?.value);
      return (isFinite(zv) && zv > 0 ? zv : 12900) / 1000;
    }
    if (g === 'coamingStiff') {
      // Coaming stiff sits ON the coaming top plate at HC, not midway UD-HC
      return (G.HC || 16350) / 1000;
    }
    return (G.UD || 15300) / 2 / 1000;
  };
  const z_m = groupToZ(group, stiff);
  const z_NA = ls.section.z_NA;
  const I_NA = ls.section.I_NA;
  const M_max = Math.max(
    Math.abs((Ms_design || 0) + (ls.Mw_hog || 0)),
    Math.abs((Ms_design || 0) + (ls.Mw_sag || 0))
  );
  const z_deck = (G.UD || 15300) / 1000;
  const is_above = z_m >= z_NA;
  const z_face = is_above ? (z_deck - z_NA) : z_NA;
  const sigma_face = Math.abs(M_max * z_face / I_NA) * 1e-3;
  const kL = p.kL || 0.72;
  const sigma_A = window.Buckling.sigmaADesign(sigma_face, Math.abs(z_m - z_NA), z_face, kL);

  // ── Compute Z_req FIRST so the per-stiff tributary spacing (_s_mean_mm)
  // is set on the stiff object. _attachedPlateFor() reads that value to
  // build the attached-plate dimensions; without this ordering it would
  // fall back to a 700 mm group default and the optimizer's combined-Z
  // would be inconsistent with the Z_req it has to satisfy. (Bug fix
  // Apr 2026: side shell / IS / coaming groups had no per-group spacing
  // input, so _attachedPlateFor was always returning 700 mm and the
  // combined section was over-stated → 100x28-style FBs slipped through.)
  const Z_req = (typeof _zReqForStiff === 'function') ? _zReqForStiff(group, stiff) : 0;
  const I_req = (typeof _iReqForStiff === 'function') ? _iReqForStiff(group, stiff, Z_req) : 0;

  // Attached plate parameters — must come AFTER _zReqForStiff
  const { pw_mm, pt_mm } = _attachedPlateFor(group, stiff);
  const S_m = 2.1;
  // Per-stiff yield-class override
  const fam = (typeof window.resolveStiffFamily === 'function')
              ? window.resolveStiffFamily(stiff)
              : { family: p.material || 'AH36' };
  const material = fam.family || p.material || 'AH36';

  // Corrosion category — same logic as inspector
  let corrosion = 'DRY_BULK';
  try {
    if (typeof window._corrosionForPlate === 'function') {
      const Y_mm = (group === 'sideShell' || group === 'innerSide') ? null : stiff.y;
      corrosion = window._corrosionForPlate(group === 'innerSide' || group === 'sideShell'
                                            ? group : 'innerBottom', z_m, Y_mm) || 'DRY_BULK';
    }
  } catch(_) {}

  // ---------------------------------------------------------------------
  // v37 fix: Required-only is the FLOOR. Buckling-only must never pick a
  // profile smaller than what Required-only (Z_req / I_req from LR Pt 4
  // Ch 1) would demand. Earlier behaviour walked the catalogue from
  // lightest to heaviest and returned the first profile with UC ≤ 1.0,
  // which could downsize a stiffener that the user had just sized via
  // Required-only. Now we filter the candidate list to Z_sec ≥ Z_req AND
  // I_sec ≥ I_req before picking the smallest one whose buckling UC ≤ 1.
  // ---------------------------------------------------------------------
  // (Z_req and I_req are computed earlier — see the ordering note above.)

  // ---------------------------------------------------------------------
  // EARLY EXIT: only skip the optimization if the CURRENT profile passes
  // BOTH the Z_req/I_req floor AND buckling UC ≤ 1.0.
  //
  // Earlier we exited on buckling alone, which was wrong for two reasons:
  //   (a) a stocky FB (e.g. 100x28) could pass buckling but still be a
  //       silly choice — Required-only would have picked something slim
  //       like 190x14 with the same weight. If a previous run had baked
  //       in a stocky profile, Buckling-only would never replace it.
  //   (b) Z_req is the LR Pt 4 Ch 1 floor; a profile failing it is
  //       non-compliant regardless of how nicely it buckles.
  // ---------------------------------------------------------------------
  try {
    if (typeof _bucklingForStiff === 'function' && stiff.profileName) {
      const bk_curr = _bucklingForStiff(group, stiff, stiff.profileName);
      const bk_ok = bk_curr && bk_curr.ok === true && bk_curr.UC != null
                  && bk_curr.UC > 0 && bk_curr.UC <= 1.0;
      // Check Z/I floor for current profile
      let z_ok = true, i_ok = true;
      try {
        const pd_curr = (typeof getProfileData === 'function')
                        ? getProfileData(stiff.profileName, stiff) : null;
        if (pd_curr && window.Profile?.computeCombinedSection) {
          // Wrap in a fake pd-ish object compatible with computeCombinedSection
          const pd_lookup = window.Profile.allProfiles(['L','HP','FB','T'])
                              .find(p => p.name === stiff.profileName);
          if (pd_lookup) {
            const cs_curr = window.Profile.computeCombinedSection(
                              pd_lookup, true, pw_mm, pt_mm, 90);
            const Z_curr = Math.min(cs_curr.WxxBot || 0, cs_curr.WxxTop || 0);
            const I_curr = cs_curr.combinedIxx || 0;
            z_ok = (Z_req <= 0) || (Z_curr >= Z_req);
            i_ok = (I_req <= 0) || (I_curr >= I_req);
          }
        }
      } catch (_) { /* leave z_ok/i_ok true on error → don't block exit */ }
      if (bk_ok && z_ok && i_ok) {
        return stiff.profileName;   // already fine — leave as-is
      }
    }
  } catch (_) { /* fall through to full optimize */ }

  // Build candidate list — every profile in the preferred family that:
  //   (1) Passes LR slenderness (d_w/t ≤ limit) — strict LR upper bound
  //   (2) Has combined Z_sec ≥ Z_req AND I_sec ≥ I_req — Required-only floor
  //   (3) Lightest first (combined weight), tighter Z as tiebreak
  //
  // We build this list by routing through Profile.findBestFit — the SAME
  // call Required-only uses. This guarantees the candidate list and order
  // are identical between the two optimizers, so Buckling-only can never
  // pick a profile that Required-only would have rejected (e.g. a stocky
  // FB 100x28 when a slim FB 190x14 of equal weight is available).
  const families = preferredType === 'any' ? ['L', 'HP', 'FB'] : [preferredType];
  const reqList = window.Profile.findBestFit(Z_req, {
    families, plateWidth_mm: pw_mm, plateThickness_mm: pt_mm,
    margin: 1.0, maxResults: 500,
    Ineeded_cm4: I_req,
    kL: kL, fbContinuous: (group !== 'innerSide')
  }) || [];

  // Lookup full pd objects (with dimensions) — findBestFit returns a
  // simplified record. Reattach pd from allProfiles so _bucklingForStiff
  // and the slot-filling logic below have everything they need.
  const allPdMap = new Map();
  window.Profile.allProfiles(families).forEach(pd => allPdMap.set(pd.name, pd));

  const allCands = reqList.map(r => {
    const pd = allPdMap.get(r.name);
    if (!pd) return null;
    const dim = pd.dimensions || {};
    let prof_type, d_w = 0, t_w = 0, b_f = 0, t_f = 0;
    if (pd.type === 'L') {
      prof_type = 'L';
      d_w = dim.a || 0; t_w = dim.t || 0; b_f = dim.b || 0; t_f = dim.t || 0;
    } else if (pd.type === 'HP') {
      prof_type = 'BULB';
      d_w = dim.b || 0; t_w = dim.t || 0; b_f = dim.c || 0; t_f = dim.t || 0;
    } else if (pd.type === 'FB') {
      prof_type = 'FLAT_BAR';
      d_w = dim.h || 0; t_w = dim.t || 0; b_f = 0; t_f = 0;
    } else if (pd.type === 'T') {
      prof_type = 'TEE';
      d_w = dim.a || 0; t_w = dim.tw || 0; b_f = dim.b || 0; t_f = dim.tf || 0;
    } else {
      return null;
    }
    return { pd, prof_type, d_w, t_w, b_f, t_f,
             weight_kgm: r.weight_kgm || 0,
             Z_cm3: r.Z_cm3 || 0, I_cm4: r.I_cm4 || 0 };
  }).filter(Boolean);
  // findBestFit already returns sorted by weight ASC (with Z tiebreak).
  // No further sorting needed.

  // Walk lightest → heaviest, return first that passes buckling.
  //
  // v37 fix: route every candidate through `_bucklingForStiff` — the SAME
  // function the inspector panel uses — so the optimizer's UC is identical
  // to what the user sees in the inspector. The earlier path called
  // `Buckling.checkLong` directly with optimizer-local z_m / t_p / spacing
  // resolution, which diverged from the inspector for tween / stringer /
  // coaming stiffeners (different z source: form input vs plate.z) and
  // for plate thickness (default vs PT.tween / PT.stringer / PT.coaming).
  // The result was that buckling appeared to "not work" on tween-deck and
  // coaming stiffs — the optimizer would happily pick a tiny profile that
  // the inspector then flagged FAIL.
  // Walk lightest → heaviest. v37b: track every candidate's UC so we
  // can fall back to the best-buckling-resistance profile when nothing
  // outright passes. The earlier "pick heaviest in family" fallback was
  // wrong on Upper Deck / Tween / IS stiffeners — heaviest doesn't
  // imply strongest in buckling (an HP with a heavy bulb often has a
  // worse UC than a lighter L profile because the bulb is far from the
  // plate and lateral-torsional buckling dominates). The right fallback
  // is the candidate with the LOWEST UC among Z_req-satisfying profiles.
  const _origProfName = stiff.profileName;
  const _origCustom = stiff.customProfile;
  let bestFallback = null;          // { cand, UC, ok }
  for (const c of allCands) {
    try {
      // Temporarily install this candidate so _bucklingForStiff sees it
      // (it reads stiff.profileName / stiff.customProfile internally).
      stiff.profileName = c.pd.name;
      stiff.customProfile = null;  // ensure catalog branch is taken
      const bk = (typeof _bucklingForStiff === 'function')
                 ? _bucklingForStiff(group, stiff, c.pd.name)
                 : null;
      if (!bk) continue;
      // Reject the silent-pass sentinel: _bucklingForStiff returns
      // { ok: true, UC: 0 } from its catch handler when its internal
      // chain (window.Buckling, hull-girder analysis, profile lookup,
      // etc.) throws. UC of literally 0 is non-physical for a stress
      // ratio — treat it as "evaluation failed" rather than as a pass.
      // This caused the optimizer to pick the LIGHTEST profile for
      // every stiff in groups where a downstream throw was happening
      // (then later the inspector flagged FAIL).
      if (bk.ok === true && (bk.UC == null || bk.UC === 0)) continue;
      const UC = (bk.UC != null && isFinite(bk.UC)) ? bk.UC : Infinity;
      // First profile that fully passes — done.
      if (bk.ok && UC <= 1.0) {
        // Keep this profile assigned and return — no need to restore.
        return c.pd.name;
      }
      // Track best (lowest UC) among non-passing candidates as a
      // fallback. Tiebreak on weight ASC so we don't unnecessarily
      // bulk up the structure.
      if (bestFallback == null
          || UC < bestFallback.UC
          || (Math.abs(UC - bestFallback.UC) < 1e-9
              && (c.weight_kgm || 0) < (bestFallback.cand.weight_kgm || 0))) {
        bestFallback = { cand: c, UC, ok: bk.ok };
      }
    } catch (e) { /* try next */ }
  }
  // Restore original before deciding fallback / widening
  stiff.profileName = _origProfName;
  stiff.customProfile = _origCustom;
  // Nothing in the preferred family passes buckling.
  // BEHAVIOUR: stay in the user's chosen family. If they asked for FB only
  // and no FB profile passes, install the best-UC fallback in THAT family —
  // do NOT silently widen to other families. Widening only happens when
  // the user is already on 'any'.
  if (bestFallback) {
    stiff.profileName = bestFallback.cand.pd.name;
    stiff.customProfile = null;
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[optimizeStiffBuckling] no profile passes buckling for',
                   group, '#'+(index+1),
                   '— installed best-UC fallback in family', preferredType,
                   bestFallback.cand.pd.name, 'UC='+bestFallback.UC.toFixed(2));
    }
    return bestFallback.cand.pd.name;
  }
  return null;
}
window.optimizeStiffBuckling = optimizeStiffBuckling;

// =========================================================================
// BUCKLING-ONLY: bulk version that walks every group / band / stiff
// (Mirrors _autoOptimizeStiffsWithPref but uses optimizeStiffBuckling.)
// =========================================================================
function autoOptimizeProfilesBuckling() {
  if (!window.Draw || !window.Draw.profiles) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }
  if (!window.Buckling) { alert('Buckling module not loaded.'); return; }
  _showOptimizeModal((pref) => {
    if (pref === null) return;
    const D = window.Draw;
    if (D.setStrakesAuto) D.setStrakesAuto(false);
    if (typeof autoBandGroups === 'function') autoBandGroups();
    const groups = ['bottomShell', 'innerBottom', 'sideShell', 'innerSide',
                    'upperDeck', 'stringerStiff', 'tweenStiff', 'coamingStiff'];
    const report = { groups: {}, totalOK: 0, totalFail: 0, failedStiffs: [] };
    groups.forEach(group => {
      const arr = D.profiles[group];
      if (!arr || !arr.length) return;
      let okCount = 0, failCount = 0, unchangedCount = 0, changedCount = 0;
      const assigned = {};
      arr.forEach((stiff, idx) => {
        if (stiff.edge && stiff.locked) return;
        const before = stiff.profileName;
        const result = optimizeStiffBuckling(group, idx, pref);
        if (result) {
          okCount++;
          if (result === before) {
            unchangedCount++;
            // Don't tally unchanged profiles in `assigned` — they're not
            // new assignments, just confirmations that the existing
            // scantling was already buckling-OK.
          } else {
            changedCount++;
            assigned[result] = (assigned[result] || 0) + 1;
          }
        } else {
          failCount++;
          report.failedStiffs.push(`${group} #${idx+1}`);
        }
      });
      report.groups[group] = { ok: okCount, fail: failCount, unchanged: unchangedCount, changed: changedCount, assigned };
      report.totalOK += okCount;
      report.totalFail += failCount;
    });
    if (D.render) D.render();
    if (typeof renderEditor === 'function') renderEditor();
    if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();
    console.log('[autoOptimizeProfilesBuckling] report:', report);
    // Reuse showOptimizeResultsModal — convert report.groups into a flat
    // changes list for that helper.
    const changes = [];
    Object.entries(report.groups).forEach(([grp, d]) => {
      Object.entries(d.assigned || {}).forEach(([profName, n]) => {
        changes.push({ panel: grp, idx: '×' + n, from: '—', to: profName });
      });
    });
    if (typeof showOptimizeResultsModal === 'function') {
      showOptimizeResultsModal('Optimize Profiles (Buckling)', changes);
    } else {
      alert('Buckling optimize: ' + report.totalOK + ' OK, ' + report.totalFail + ' failed');
    }
  });
}
window.autoOptimizeProfilesBuckling = autoOptimizeProfilesBuckling;

// ==========================================================================
// findTopCandidates — returns 3 profile candidates for a stiff:
//   [smallerPassing | failing, OPTIMUM, largerPassing]
// For the preferred type (L/HP/FB). If the optimum fails for Z alone, still
// show candidates so user can understand why. Includes full pass/fail detail.
// ==========================================================================
function findTopCandidates(group, index, preferredType) {
  const D = window.Draw;
  const stiff = D.profiles[group]?.[index];
  if (!stiff) return null;
  // Z_req may legitimately be 0 for void compartments — treat as no local requirement.
  const Z_req = _zReqForStiff(group, stiff);

  const family = preferredType === 'any' ? ['L','HP','FB'] : [preferredType];
  const { pw_mm, pt_mm } = _attachedPlateFor(group, stiff);
  if (!window.Profile?.allProfiles) return null;

  // Compute section properties for every profile, then sort by WEIGHT ascending.
  // The OPTIMUM is the LIGHTEST profile that passes all rule checks — for FB
  // this naturally yields tall+thin sections (FB 190x14) instead of short+thick
  // ones (FB 130x30) because for the same Z, area scales as t·h (linear) but
  // Z scales as t·h² (quadratic) — so increasing h while reducing t cuts mass.
  //
  // Slenderness-failing profiles (d_w/t > limit) are removed entirely, so
  // SMALLER/LARGER neighbours don't show physically-invalid sections.
  const _p_kL_ftc  = (typeof getParams === 'function') ? getParams() : null;
  const kL_ftc = (_p_kL_ftc && _p_kL_ftc.kL) || 0.72;
  const fbContinuous_ftc = (group !== 'innerSide');
  const dwt_LHP    = 60 * Math.sqrt(kL_ftc);
  const dwt_FBcont = 18 * Math.sqrt(kL_ftc);
  const dwt_FBnon  = 15 * Math.sqrt(kL_ftc);
  const slenderOK_ftc = (pd) => {
    const d = pd.dimensions || {};
    if (pd.type === 'L')  return (d.a||0)/(d.t||1)         <= dwt_LHP;
    if (pd.type === 'HP') return (d.b||0)/(d.t||1)         <= dwt_LHP;
    if (pd.type === 'T')  return (d.h||d.a||0)/(d.tw||d.t||1) <= dwt_LHP;
    if (pd.type === 'FB') return (d.h||d.a||0)/(d.t||1)
                              <= (fbContinuous_ftc ? dwt_FBcont : dwt_FBnon);
    return true;
  };

  const all = window.Profile.allProfiles(family)
    .filter(slenderOK_ftc)
    .map(pd => {
    const r = window.Profile.computeCombinedSection(pd, true, pw_mm, pt_mm, 90);
    return {
      name: pd.name,
      type: pd.type,
      Z_cm3: Math.min(r.WxxBot, r.WxxTop),
      weight_kgm: r.weight,
      A_cm2: r.totalArea,
      dimensions: pd.dimensions
    };
  }).sort((a, b) => {
    if (a.weight_kgm !== b.weight_kgm) return a.weight_kgm - b.weight_kgm;
    return a.Z_cm3 - b.Z_cm3;   // tiebreaker: closer-to-Z_req first
  });

  const evaluate = (pc) => {
    const reasons = [];
    const zPass = pc.Z_cm3 >= Z_req;
    if (!zPass) reasons.push(`Z_req fail: ${pc.Z_cm3.toFixed(0)} < ${Z_req.toFixed(0)} cm³`);
    const origName = stiff.profileName;
    stiff.profileName = pc.name;
    const bk = _bucklingForStiff(group, stiff, pc.name);
    const hg = _hgStressAtStiff(group, stiff);
    stiff.profileName = origName;
    if (!bk.ok) reasons.push(`Buckling fail: UC=${bk.UC.toFixed(2)}`);
    if (!hg.ok) reasons.push(`HG fail: σ/σ_perm=${hg.ratio.toFixed(2)}`);

    // Slenderness check (LR Pt 4 Ch 1 Tablo 1.4.4 / 1.6.1 / 1.9.1 Notes)
    let sl_pass = true;
    let sl_ratio = 0, sl_limit = 0;
    try {
      const sl = checkProfileSlenderness(pc.name, kL_ftc, stiff);
      sl_pass = sl.ok;
      sl_ratio = sl.ratio;
      sl_limit = sl.limit;
      if (!sl_pass) {
        reasons.push(`Slenderness fail: d_w/t=${sl.ratio.toFixed(2)} > ${sl.limit.toFixed(2)}`);
      }
    } catch (e) { /* if slenderness check unavailable, don't block */ }

    return {
      ...pc, Z_req, z_ratio: pc.Z_cm3 / Z_req,
      bk_UC: bk.UC, hg_ratio: hg.ratio,
      sl_ratio, sl_limit,
      z_pass: zPass, bk_pass: bk.ok, hg_pass: hg.ok, sl_pass,
      all_pass: zPass && bk.ok && hg.ok && sl_pass,
      fail_reasons: reasons
    };
  };

  // Find optimum — first profile in WEIGHT-sorted list that passes ALL checks
  let optIdx = -1;
  const evalCache = new Array(all.length);
  for (let i = 0; i < all.length; i++) {
    const ev = evaluate(all[i]);
    evalCache[i] = ev;
    if (ev.all_pass && optIdx === -1) { optIdx = i; break; }
  }

  if (optIdx === -1) {
    // Nothing passes — show 3 lightest as fallback
    const showIdx = [0, Math.min(1, all.length-1), Math.min(2, all.length-1)].filter((v,i,a) => v >= 0 && a.indexOf(v) === i);
    return {
      optimum_idx: -1, Z_req,
      candidates: showIdx.map(i => ({ ...(evalCache[i] || evaluate(all[i])), slot: 'fallback' })),
      note: 'No profile in this family passes all checks.'
    };
  }

  // Neighbour selection by WEIGHT (matches the new sort order):
  //   smaller = profile immediately LIGHTER than optimum (one step down in mass)
  //   larger  = profile immediately HEAVIER than optimum (one step up in mass)
  // BUT skip near-duplicates (within ~2% mass) so the user sees a meaningful
  // alternative, not the same physical section with a 5 mm dimension tweak.
  const nearlySameMass = (a, b) =>
    Math.abs(a.weight_kgm - b.weight_kgm) / Math.max(a.weight_kgm, b.weight_kgm) < 0.02;

  const candidates = [];
  // Smaller (lighter)
  let smallerIdx = optIdx - 1;
  while (smallerIdx >= 0 && nearlySameMass(all[smallerIdx], all[optIdx])) smallerIdx--;
  if (smallerIdx >= 0) {
    const ev = evalCache[smallerIdx] || evaluate(all[smallerIdx]);
    candidates.push({ ...ev, slot: 'smaller' });
  }
  // Optimum
  candidates.push({ ...evalCache[optIdx], slot: 'optimum' });
  // Larger (heavier)
  let largerIdx = optIdx + 1;
  while (largerIdx < all.length && nearlySameMass(all[largerIdx], all[optIdx])) largerIdx++;
  if (largerIdx < all.length) {
    const ev = evalCache[largerIdx] || evaluate(all[largerIdx]);
    candidates.push({ ...ev, slot: 'larger' });
  }

  return {
    optimum_idx: optIdx,
    Z_req,
    candidates,
    note: null
  };
}
window.findTopCandidates = findTopCandidates;

// Optimize a band (range of stiffs) — every stiff in the band gets the
// SAME profile (the smallest one whose Z_sec meets the band's max Z_req).
function optimizeBand(group, startIdx, endIdx, preferredType) {
  const D = window.Draw;
  const arr = D.profiles[group];
  if (!arr) return null;
  const bandStiffs = arr.slice(startIdx, endIdx + 1).filter(s => !(s.edge && s.locked));
  if (!bandStiffs.length) return null;

  // Strictest Z_req in the band (voids contribute 0 and are ignored)
  let Z_req_max = 0;
  bandStiffs.forEach(s => {
    const z = _zReqForStiff(group, s);
    if (z > Z_req_max) Z_req_max = z;
  });

  const families = preferredType === 'any' ? ['L', 'HP', 'FB'] : [preferredType];
  const { pw_mm, pt_mm } = _attachedPlateFor(group, bandStiffs[0]);

  // Slenderness filter parameters (LR Pt 4 Ch 1)
  const _p_kL_band  = (typeof getParams === 'function') ? getParams() : null;
  const kL_band = (_p_kL_band && _p_kL_band.kL) || 0.72;
  const fbContinuous_band = (group !== 'innerSide');

  let candidates;
  if (Z_req_max > 0) {
    candidates = window.Profile.findBestFit(Z_req_max, {
      families, plateWidth_mm: pw_mm, plateThickness_mm: pt_mm,
      margin: 1.0, maxResults: 200,
      kL: kL_band, fbContinuous: fbContinuous_band
    });
  } else {
    // No local Z requirement (void) — build the full family list so we can
    // still pick a reasonable default (smallest available).
    candidates = window.Profile.allProfiles(families).map(pd => {
      const r = window.Profile.computeCombinedSection(pd, true, pw_mm, pt_mm, 90);
      return { name: pd.name, type: pd.type, Z_cm3: Math.min(r.WxxBot, r.WxxTop), weight_kgm: r.weight };
    });
  }

  if (!candidates.length) {
    // Stay in user's chosen family — same rationale as optimizeStiff.
    return null;
  }

  // Lightest profile that satisfies all rules. Same rationale as optimizeStiff:
  // for FB this naturally yields tall+thin sections.
  candidates.sort((a, b) => {
    const wA = a.weight_kgm || 0;
    const wB = b.weight_kgm || 0;
    if (wA !== wB) return wA - wB;
    const dZa = (a.Z_cm3 || 0) - Z_req_max;
    const dZb = (b.Z_cm3 || 0) - Z_req_max;
    return dZa - dZb;
  });

  const picked = candidates[0];
  // Apply the same profile to every stiff in the band (skip edge-locked)
  arr.slice(startIdx, endIdx + 1).forEach(s => {
    if (s.edge && s.locked) return;
    s.profileName = picked.name;
  });
  return picked.name;
}
window.optimizeBand = optimizeBand;

// Handle optimize button click (stiff or band) — prompt for profile type preference
// mode: 'stiff' | 'band'
// For stiff: id = stiff index. For band: id = band index in window.BAND_ASSIGNMENTS[group].
function _handleOptimizeClick(group, id, mode) {
  const D = window.Draw;
  // Ensure bands are initialized
  if (!window.BAND_ASSIGNMENTS[group] || window.BAND_ASSIGNMENTS[group].length === 0) {
    if (typeof autoBandGroups === 'function') autoBandGroups();
  }
  // Step 1: ask user for profile type
  _showOptimizeModal((pref) => {
    if (pref === null) return;
    // Step 2: find 3 candidates for that type, show detailed comparison panel
    _showCandidatesPanel(group, id, mode, pref);
  });
}
window._handleOptimizeClick = _handleOptimizeClick;

// =====================================================================
// TOP-BAR OPTIMIZE BUTTON HANDLERS
// =====================================================================

// "Optimize Stiff" — active when a stiffener is selected in the drawing.
// Shows the same Local Optimize dialog as the old inspector inline button.
function optimizeSelectedStiff() {
  const sel = window.SELECTED_STIFF;
  if (!sel || !sel.group || sel.index == null) {
    alert('Please click a stiffener in the drawing first.\n\nThen press "Optimize Stiff" to find the smallest profile that still passes Z_req, hull-girder stress, and buckling checks.');
    return;
  }
  // Default to 'stiff' mode (optimize this specific stiffener, not the whole band).
  // The candidates dialog shows which band the stiff belongs to, and the user
  // can always re-open to optimize the band if needed.
  _handleOptimizeClick(sel.group, sel.index, 'stiff');
}
window.optimizeSelectedStiff = optimizeSelectedStiff;

// Enable / disable the "Optimize Stiff" + "Custom Profile" buttons based
// on current selection. Called by onStiffClick and whenever selection changes.
window._updateOptimizeStiffBtn = function() {
  const sel = window.SELECTED_STIFF;
  const enabled = !!(sel && sel.group && sel.index != null);

  const btn = document.getElementById('optimizeStiffBtn');
  if (btn) {
    btn.disabled = !enabled;
    const lbl = btn.querySelector('.opt-tool-label');
    if (lbl) lbl.textContent = enabled ? `Optimize Stiff #${sel.index + 1}` : 'Optimize Stiff';
  }

  const btnCustom = document.getElementById('customProfileBtn');
  if (btnCustom) {
    btnCustom.disabled = !enabled;
    const lbl = btnCustom.querySelector('.opt-tool-label');
    if (lbl) lbl.textContent = enabled ? `Custom Profile #${sel.index + 1}` : 'Custom Profile';
  }
};

// Apply selected profile to a stiff or band, re-render everything
function _applyProfile(group, id, mode, profileName) {
  const D = window.Draw;
  if (!D || !D.profiles) {
    console.warn('[_applyProfile] Draw.profiles unavailable');
    return;
  }
  let changed = 0;
  if (mode === 'stiff') {
    const stiff = D.profiles[group]?.[id];
    if (stiff) { stiff.profileName = profileName; changed = 1; }
  } else {
    const band = window.BAND_ASSIGNMENTS?.[group]?.[id];
    if (band) {
      for (let i = band.start; i <= band.end; i++) {
        if (D.profiles[group]?.[i]) {
          D.profiles[group][i].profileName = profileName;
          changed++;
        }
      }
    } else {
      console.warn(`[_applyProfile] band not found: group=${group} id=${id}`);
    }
  }
  if (window._APPLY_DEBUG) {
    console.log(`[_applyProfile] group=${group} id=${id} mode=${mode} name=${profileName} changed=${changed}`);
  }

  // Also update the scantling-page group default dropdown (source of truth for
  // section modulus + populateFilteredDropdown). Without this, recalcAll()
  // will revert profileName back to the group default on next sync.
  // Map group → scantling-page select id
  const SEL = {
    bottomShell:   'bottomLongProfile',
    innerBottom:   'ibLongProfile',
    sideShell:     'sideLongProfile',
    innerSide:     'isLongProfile',
    stringerStiff: 'strDeckProfile',
    tweenStiff:    'twnDeckProfile',
    coamingStiff:  'coamingProfile',
    upperDeck:     'deckLongProfile'
  };
  // NOTE: we do NOT change the group default — the per-stiff profileName
  // overrides the group default. But we DO need to refresh the scantling
  // calc in case some downstream depends on profile-by-band.

  if (window.Draw?.render) window.Draw.render();
  // Run recalcAll so section modulus / Z_sec panels update
  if (typeof recalcAll === 'function') {
    try { recalcAll(); } catch(e) {}
  }
  if (typeof renderAnalysisStatusPanel === 'function') renderAnalysisStatusPanel();
  if (typeof renderBucklingStatusPanel === 'function') renderBucklingStatusPanel();
  if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel(); if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel();
  if (typeof renderEditor === 'function') renderEditor();
}
window._applyProfile = _applyProfile;

// Show candidates side-by-side — 3 profile cards with detail + apply buttons
function _showCandidatesPanel(group, id, mode, pref) {
  // For band mode, find the driving (max Z_req) stiff — show candidates for it
  let targetIdx = id;
  if (mode === 'band') {
    const band = window.BAND_ASSIGNMENTS[group]?.[id];
    if (!band) { alert('Band not found.'); return; }
    let maxZ = 0;
    for (let i = band.start; i <= band.end; i++) {
      const s = window.Draw.profiles[group]?.[i];
      const z = _zReqForStiff(group, s);
      if (z > maxZ) { maxZ = z; targetIdx = i; }
    }
  }

  const result = findTopCandidates(group, targetIdx, pref);
  if (!result || !result.candidates.length) {
    alert('Could not find any candidates for ' + pref);
    return;
  }

  // Remove existing
  const existing = document.getElementById('candidatesPanel');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'candidatesPanel';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';

  const bandInfo = (mode === 'band') ? window.BAND_ASSIGNMENTS[group]?.[id] : null;
  const target = (mode === 'band')
    ? `Band #${bandInfo.start+1}–#${bandInfo.end+1} (driver: stiff #${targetIdx+1})`
    : `Stiff #${id+1}`;

  const typeLabel = pref === 'L' ? 'L Angle' : pref === 'HP' ? 'HP Bulb' : pref === 'FB' ? 'FB Flat' : 'Any';

  // Card for each candidate
  const cardHTML = (cand) => {
    const slotLabel = cand.slot === 'optimum' ? 'OPTIMUM' :
                      cand.slot === 'smaller' ? 'ONE SIZE SMALLER' :
                      cand.slot === 'larger' ? 'ONE SIZE LARGER' : 'OPTION';
    const slotColor = cand.slot === 'optimum' ? '#10b981' :
                      cand.slot === 'smaller' ? '#f59e0b' :
                      cand.slot === 'larger' ? '#3b82f6' : '#6b7280';
    const passColor = cand.all_pass ? '#10b981' : '#ef4444';
    const bg = cand.slot === 'optimum' ? 'rgba(16,185,129,0.12)' :
               cand.all_pass ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.08)';
    const border = cand.slot === 'optimum' ? '2.5px solid #10b981' :
                   cand.all_pass ? '1.5px solid rgba(16,185,129,0.4)' : '1.5px solid rgba(239,68,68,0.4)';
    const checkRow = (label, pass, val) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;font-size:0.72rem;border-bottom:1px dashed var(--border)">
        <span style="color:var(--text-muted)">${label}</span>
        <span style="color:${pass ? '#10b981' : '#ef4444'};font-family:var(--font-mono);font-weight:600">${val} ${pass ? 'OK' : 'FAIL'}</span>
      </div>`;
    return `<div style="flex:1;min-width:0;background:${bg};border:${border};border-radius:8px;padding:14px;display:flex;flex-direction:column;gap:8px">
      <div style="font-size:0.62rem;font-weight:800;color:${slotColor};text-transform:uppercase;letter-spacing:0.6px;text-align:center">${slotLabel}</div>
      <div style="font-family:var(--font-display);font-size:1rem;font-weight:700;color:var(--text-primary);text-align:center">${cand.name}</div>
      <div style="text-align:center;font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${cand.weight_kgm.toFixed(1)} kg/m · A=${cand.A_cm2.toFixed(1)} cm²</div>
      <div style="margin-top:4px">
        ${checkRow('Z_req', cand.z_pass, `${cand.Z_cm3.toFixed(0)} / ${cand.Z_req.toFixed(0)}`)}
        ${checkRow('Buckling', cand.bk_pass, `UC=${cand.bk_UC.toFixed(2)}`)}
        ${checkRow('HG stress', cand.hg_pass, `${cand.hg_ratio.toFixed(2)}`)}
      </div>
      ${cand.fail_reasons.length ? `
        <div style="font-size:0.6rem;color:#fca5a5;background:rgba(239,68,68,0.1);border-left:2px solid #ef4444;padding:6px 8px;border-radius:3px;margin-top:4px">
          <strong>Why fail:</strong><br>${cand.fail_reasons.join('<br>')}
        </div>
      ` : `
        <div style="font-size:0.62rem;color:#86efac;text-align:center;padding:4px;background:rgba(16,185,129,0.08);border-radius:3px;margin-top:4px">
          All checks pass
        </div>
      `}
      <button class="apply-cand-btn" data-name="${cand.name}" ${cand.all_pass ? '' : 'disabled'}
              style="margin-top:6px;padding:8px;background:${cand.all_pass ? (cand.slot === 'optimum' ? 'linear-gradient(135deg,#10b981,#059669)' : 'var(--accent)') : 'var(--bg-tertiary)'};color:${cand.all_pass ? '#fff' : 'var(--text-muted)'};border:none;border-radius:4px;font-size:0.74rem;font-weight:700;cursor:${cand.all_pass ? 'pointer' : 'not-allowed'};font-family:var(--font-display)">
        ${cand.all_pass ? 'Apply' : 'Cannot Apply (FAIL)'}
      </button>
    </div>`;
  };

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:2px solid var(--accent);border-radius:10px;padding:22px;max-width:880px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:1.05rem">Local Optimize — ${typeLabel}</div>
          <div style="font-size:0.74rem;color:var(--text-muted);margin-top:3px">${target} · Z_req = ${result.Z_req.toFixed(0)} cm³ · Group: ${group}</div>
        </div>
        <button id="candPanelClose" style="background:transparent;color:var(--text-muted);border:1px solid var(--border);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:0.78rem">Close</button>
      </div>
      ${result.note ? `<div style="padding:10px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.4);border-radius:6px;margin-bottom:12px;color:#fbbf24;font-size:0.74rem">${result.note}</div>` : ''}
      <div style="display:flex;gap:12px;align-items:stretch">
        ${result.candidates.map(cardHTML).join('')}
      </div>
      <div style="margin-top:14px;padding:10px;background:var(--bg-input);border-radius:5px;font-size:0.66rem;color:var(--text-muted);line-height:1.5">
        <strong style="color:var(--text-secondary)">Criteria:</strong> Z_req (LR Pt 4 Ch 1), Buckling UC &le; 1.0 (LR Pt 3 Ch 4 Sec 7), σ_hg &le; σ_perm (hull girder).
        ${mode === 'band' ? '<br><strong>Band mode:</strong> selected profile applied to all stiffs in band. Driver stiff shown above.' : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#candPanelClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay.querySelectorAll('.apply-cand-btn').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      _applyProfile(group, id, mode, btn.dataset.name);
      overlay.remove();
    });
  });
}
window._showCandidatesPanel = _showCandidatesPanel;

// Modal dialog: ask user for preferred profile type (L / HP / FB / Any)
function _showOptimizeModal(callback) {
  // Remove existing modal
  const existing = document.getElementById('optimizeModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'optimizeModal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:10000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:2px solid var(--accent);border-radius:8px;padding:24px;min-width:340px;max-width:420px;box-shadow:0 16px 48px rgba(0,0,0,0.6)">
      <div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:1rem;margin-bottom:4px">Local Optimize</div>
      <div style="font-size:0.74rem;color:var(--text-muted);margin-bottom:18px">Choose preferred profile type. Will find the smallest profile that passes Z_req + HG + Buckling.</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px">
        <button class="opt-mod-btn" data-pref="L"   style="padding:12px;background:rgba(74,222,128,0.15);color:#86efac;border:1.5px solid rgba(74,222,128,0.5);border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:var(--font-display)">L Angle</button>
        <button class="opt-mod-btn" data-pref="HP"  style="padding:12px;background:rgba(167,139,250,0.15);color:#c4b5fd;border:1.5px solid rgba(167,139,250,0.5);border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:var(--font-display)">HP Bulb</button>
        <button class="opt-mod-btn" data-pref="FB"  style="padding:12px;background:rgba(251,191,36,0.15);color:#fcd34d;border:1.5px solid rgba(251,191,36,0.5);border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:var(--font-display)">FB Flat</button>
        <button class="opt-mod-btn" data-pref="any" style="padding:12px;background:var(--bg-tertiary);color:var(--text-primary);border:1.5px solid var(--border);border-radius:6px;font-size:0.85rem;font-weight:600;cursor:pointer;font-family:var(--font-display)">Any (Smallest)</button>
      </div>
      <button id="optModalCancel" style="width:100%;padding:8px;background:transparent;color:var(--text-muted);border:1px solid var(--border);border-radius:4px;font-size:0.74rem;cursor:pointer">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelectorAll('.opt-mod-btn').forEach(b => {
    b.addEventListener('click', () => {
      const pref = b.dataset.pref;
      overlay.remove();
      callback(pref);
    });
  });
  overlay.querySelector('#optModalCancel').addEventListener('click', () => {
    overlay.remove();
    callback(null);
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { overlay.remove(); callback(null); }
  });
}
window._showOptimizeModal = _showOptimizeModal;

// Auto-generate bands for groups.
// Bottom/IB/UD/Stringer/Tween: simple fixed-size chunks (BAND_SIZE).
// Side Shell / Inner Side: DECK-AWARE banding — segmented at IB, stringers,
// tween decks, UD (runtime values, not hardcoded). Each deck segment is
// split into BAND_SIZE groups. If a segment's last chunk would have only 1
// stiff, it is merged into the previous band (so bands have 2-4 stiffs).
function autoBandGroups() {
  const D = window.Draw;
  const bsz = window.BAND_SIZE || 3;
  const G = D.GEOMETRY || {};
  window.BAND_ASSIGNMENTS = window.BAND_ASSIGNMENTS || {};

  // Simple grouped banding for non-vertical groups
  ['bottomShell', 'innerBottom', 'upperDeck', 'stringerStiff', 'tweenStiff', 'coamingStiff'].forEach(group => {
    const arr = D.profiles[group] || [];
    const n = arr.length;
    if (n === 0) { window.BAND_ASSIGNMENTS[group] = []; return; }
    const bands = [];
    for (let start = 0; start < n; start += bsz) {
      bands.push({ start, end: Math.min(start + bsz - 1, n - 1) });
    }
    window.BAND_ASSIGNMENTS[group] = bands;
  });

  // Side Shell and Inner Side — deck-aware segmented banding.
  // Build deck boundary list (Z values, mm, sorted ascending) from runtime
  // geometry — this way the approach works even when user changes IB/UD
  // or adds/removes stringers/tweens.
  const deckZs = [G.IB || 1800];
  (D.profiles.stringer || []).forEach(p => { if (p.z > (G.IB||1800) && p.z < (G.UD||15300)) deckZs.push(p.z); });
  (D.profiles.tweenDeck || []).forEach(p => { if (p.z > (G.IB||1800) && p.z < (G.UD||15300)) deckZs.push(p.z); });
  deckZs.push(G.UD || 15300);
  deckZs.sort((a, b) => a - b);

  ['sideShell', 'innerSide'].forEach(group => {
    const arr = D.profiles[group] || [];
    const n = arr.length;
    if (n === 0) { window.BAND_ASSIGNMENTS[group] = []; return; }

    // Group stiff indices by which deck segment they belong to.
    // Segment k = [ deckZs[k], deckZs[k+1] )  (inclusive start, exclusive end,
    // except last segment is inclusive on both ends).
    const segments = [];
    for (let k = 0; k < deckZs.length - 1; k++) {
      const lo = deckZs[k], hi = deckZs[k + 1];
      const isLast = (k === deckZs.length - 2);
      const indices = [];
      arr.forEach((stiff, i) => {
        const z = stiff.z;
        if (z == null) return;
        const inSeg = isLast ? (z >= lo && z <= hi) : (z >= lo && z < hi);
        if (inSeg) indices.push(i);
      });
      if (indices.length) segments.push({ lo, hi, indices });
    }

    // Also collect any stiffs that fall outside (e.g. above UD in coaming wall
    // — none now, but safe fallback) as a single extra segment
    const allInSeg = new Set();
    segments.forEach(s => s.indices.forEach(i => allInSeg.add(i)));
    const leftover = [];
    arr.forEach((s, i) => { if (!allInSeg.has(i) && s.z != null) leftover.push(i); });
    if (leftover.length) segments.push({ lo: null, hi: null, indices: leftover });

    // Within each segment, split into BAND_SIZE chunks. Merge trailing 1-stiff
    // chunk into previous band. So:
    //   n=1 → [1]
    //   n=2 → [2]
    //   n=3 → [3]
    //   n=4 → [3, 1] → merge → [4]    (want to avoid solo stiff)
    //   n=5 → [3, 2]                   (keep 2-group)
    //   n=6 → [3, 3]
    //   n=7 → [3, 3, 1] → merge → [3, 4]
    //   n=8 → [3, 3, 2]
    const bands = [];
    segments.forEach(seg => {
      const idx = seg.indices;
      const m = idx.length;
      if (m === 0) return;
      const chunks = [];
      for (let start = 0; start < m; start += bsz) {
        chunks.push(idx.slice(start, start + bsz));
      }
      // If last chunk has 1 item and there's a previous chunk, merge them.
      if (chunks.length >= 2 && chunks[chunks.length - 1].length === 1) {
        const last = chunks.pop();
        chunks[chunks.length - 1] = chunks[chunks.length - 1].concat(last);
      }
      chunks.forEach(ch => {
        bands.push({ start: ch[0], end: ch[ch.length - 1], segLo: seg.lo, segHi: seg.hi });
      });
    });

    window.BAND_ASSIGNMENTS[group] = bands;
  });
}
window.autoBandGroups = autoBandGroups;

// Which band does a given stiff index belong to?
function _findBand(group, index) {
  const bands = window.BAND_ASSIGNMENTS[group] || [];
  for (let i = 0; i < bands.length; i++) {
    if (index >= bands[i].start && index <= bands[i].end) return { bandIdx: i, ...bands[i] };
  }
  return null;
}
window._findBand = _findBand;

// ==========================================================================
// AUTO OPTIMIZE ALL (local-style) — uses the same logic as the per-stiff
// optimizer, applied to every stiffener in the ship. Asks user for a single
// profile type preference (L / HP / FB / Any), then processes each stiff.
// ==========================================================================
function autoOptimizeAllLocal() {
  if (!window.Draw || !window.Draw.profiles) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }
  _showOptimizeModal((pref) => {
    if (pref === null) return;
    _autoOptimizeStiffsWithPref(pref);
  });
}
window.autoOptimizeAllLocal = autoOptimizeAllLocal;

// Actually do the optimization with a chosen profile preference
function _autoOptimizeStiffsWithPref(pref) {
  const D = window.Draw;
  // Disable auto-strake regen
  if (D.setStrakesAuto) D.setStrakesAuto(false);

  // Ensure bands exist
  if (typeof autoBandGroups === 'function') autoBandGroups();

  const groups = ['bottomShell', 'innerBottom', 'sideShell', 'innerSide',
                  'upperDeck', 'stringerStiff', 'tweenStiff', 'coamingStiff'];

  const report = { groups: {}, totalOK: 0, totalFail: 0, failedStiffs: [] };

  groups.forEach(group => {
    const arr = D.profiles[group];
    if (!arr || !arr.length) return;
    const bands = window.BAND_ASSIGNMENTS[group] || [];
    let okCount = 0, failCount = 0;
    const assigned = {};
    // BAND-level optimize: every band gets one profile.
    bands.forEach(band => {
      const result = optimizeBand(group, band.start, band.end, pref);
      const bandSize = band.end - band.start + 1;
      if (result) {
        okCount += bandSize;
        assigned[result] = (assigned[result] || 0) + bandSize;
      } else {
        failCount += bandSize;
        for (let i = band.start; i <= band.end; i++) {
          // Skip coaming edge FB (locked)
          const s = arr[i];
          if (s && s.edge && s.locked) continue;
          report.failedStiffs.push(`${group} #${i+1}`);
        }
      }
    });
    // Handle any stiffs not covered by bands (safety)
    const coveredIdxs = new Set();
    bands.forEach(b => { for (let i = b.start; i <= b.end; i++) coveredIdxs.add(i); });
    arr.forEach((stiff, idx) => {
      if (coveredIdxs.has(idx)) return;
      if (stiff.edge && stiff.locked) return;
      const result = optimizeStiff(group, idx, pref);
      if (result) { okCount++; assigned[result] = (assigned[result] || 0) + 1; }
      else { failCount++; report.failedStiffs.push(`${group} #${idx+1}`); }
    });
    report.groups[group] = { ok: okCount, fail: failCount, assigned };
    report.totalOK += okCount;
    report.totalFail += failCount;
  });

  // Redraw
  if (D.render) D.render();
  if (typeof renderAnalysisStatusPanel === 'function') renderAnalysisStatusPanel();
  if (typeof renderBucklingStatusPanel === 'function') renderBucklingStatusPanel();
  if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel(); if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel();
  if (typeof renderEditor === 'function') renderEditor();

  // Build summary and show modal report
  _showOptimizationReport(report, pref);
}

// Nicely-formatted modal report of what was changed
function _showOptimizationReport(report, pref) {
  const existing = document.getElementById('optReportModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'optReportModal';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.75);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px';

  const typeLabel = pref === 'L' ? 'L Angle' : pref === 'HP' ? 'HP Bulb' : pref === 'FB' ? 'FB Flat' : 'Any (smallest)';

  const groupRows = Object.entries(report.groups).map(([g, d]) => {
    const profCounts = Object.entries(d.assigned || {})
      .sort((a, b) => b[1] - a[1])
      .map(([name, n]) => `<span style="color:var(--text-secondary)">${name}</span> <span style="color:var(--text-muted)">×${n}</span>`)
      .join(', ');
    const allOK = d.fail === 0;
    const bg = allOK ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.08)';
    const border = allOK ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.4)';
    return `<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:8px 10px;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-primary)">${g}</td>
      <td style="padding:8px 10px;text-align:center;font-family:var(--font-mono);font-size:0.72rem;color:${allOK ? '#10b981' : '#f59e0b'}">${d.ok}</td>
      <td style="padding:8px 10px;text-align:center;font-family:var(--font-mono);font-size:0.72rem;color:${d.fail > 0 ? '#ef4444' : 'var(--text-muted)'}">${d.fail}</td>
      <td style="padding:8px 10px;font-size:0.68rem;font-family:var(--font-mono)">${profCounts || '—'}</td>
    </tr>`;
  }).join('');

  const failedList = report.failedStiffs.length
    ? `<div style="margin-top:14px;padding:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.3);border-radius:5px">
        <div style="font-size:0.72rem;font-weight:700;color:#fca5a5;margin-bottom:4px">Failed (${report.failedStiffs.length}):</div>
        <div style="font-size:0.66rem;color:var(--text-muted);font-family:var(--font-mono);line-height:1.6">${report.failedStiffs.join(', ')}</div>
        <div style="font-size:0.66rem;color:var(--text-muted);margin-top:6px;font-style:italic">No profile in the selected family passed all checks. Try a different type (HP if you chose L, or "Any"), or accept these stiffs remain at their current profile.</div>
      </div>`
    : '';

  overlay.innerHTML = `
    <div style="background:var(--bg-secondary);border:2px solid var(--accent);border-radius:10px;padding:22px;max-width:720px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.6)">
      <div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:1.05rem">Auto-Optimize — Report</div>
        <div style="font-size:0.74rem;color:var(--text-muted);margin-top:4px">Type preference: <span style="color:var(--text-secondary);font-weight:600">${typeLabel}</span> · Each stiff checked against Z_req + HG + Buckling</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div style="padding:10px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:5px;text-align:center">
          <div style="font-size:1.4rem;font-weight:700;color:#10b981;font-family:var(--font-mono)">${report.totalOK}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Optimized</div>
        </div>
        <div style="padding:10px;background:${report.totalFail > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)'};border:1px solid ${report.totalFail > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border)'};border-radius:5px;text-align:center">
          <div style="font-size:1.4rem;font-weight:700;color:${report.totalFail > 0 ? '#ef4444' : 'var(--text-muted)'};font-family:var(--font-mono)">${report.totalFail}</div>
          <div style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Failed</div>
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:5px;overflow:hidden">
        <thead>
          <tr style="background:var(--bg-input)">
            <th style="padding:8px 10px;text-align:left;font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Group</th>
            <th style="padding:8px 10px;text-align:center;font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">OK</th>
            <th style="padding:8px 10px;text-align:center;font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Fail</th>
            <th style="padding:8px 10px;text-align:left;font-size:0.66rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Assigned profiles</th>
          </tr>
        </thead>
        <tbody>${groupRows}</tbody>
      </table>
      ${failedList}
      <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">
        <button id="optReportClose" style="padding:8px 18px;background:var(--accent);color:#fff;border:none;border-radius:4px;font-size:0.78rem;font-weight:600;cursor:pointer">Close</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#optReportClose').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}




