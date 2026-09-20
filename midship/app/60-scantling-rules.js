/* ==========================================================================
   60-scantling-rules.js  —  LR Pt 4 Ch 1 local scantling formulas (plates + longitudinals)
   Extracted verbatim from Index.html (lines 27251–30337 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==================== CORE FORMULAS ====================
// =========================================================================
// LOCAL le OVERRIDE — set by withLocalLe() to temporarily reduce p.le
// for one specific stiff (when brackets attach to that stiff). All
// downstream calc* functions read p.le from getParams(), so a single
// override point is enough.
// =========================================================================
let _LE_OVERRIDE_M = null;

function withLocalLe(le_m, fn) {
  const prev = _LE_OVERRIDE_M;
  _LE_OVERRIDE_M = le_m;
  try { return fn(); }
  finally { _LE_OVERRIDE_M = prev; }
}
window.withLocalLe = withLocalLe;

// =========================================================================
// LOCAL MATERIAL FAMILY OVERRIDE
// -------------------------------------------------------------------------
// Same pattern as _LE_OVERRIDE_M: when a per-strake or per-stiffener family
// is set (e.g. 'AH36' on one stiff while the ship is MS overall), wrap the
// calc call in withLocalFamily('AH36', () => calcBottomLong()) and getParams()
// will return that family's k/kL instead of the global Setup value.
// =========================================================================
let _FAMILY_OVERRIDE = null;

function withLocalFamily(familyKey, fn) {
  const prev = _FAMILY_OVERRIDE;
  _FAMILY_OVERRIDE = (familyKey && MATERIAL[familyKey]) ? familyKey : null;
  try { return fn(); }
  finally { _FAMILY_OVERRIDE = prev; }
}
window.withLocalFamily = withLocalFamily;

// =========================================================================
// LOCAL SPACING OVERRIDE  (Apr 2026 — per-stiff Z fix)
// -------------------------------------------------------------------------
// Same pattern as _LE_OVERRIDE_M: when computing Z_req for an INDIVIDUAL
// stiffener, the LR formulas need that stiff's own effective load width
// s = (gap_above + gap_below)/2 (LR Pt 4 Ch 1 Sec 1.5), NOT the group-wide
// max gap that realLongSpacing() returns by default.
//
// _zReqForStiff() wraps its calc*() call in withLocalSpacing(s_mean, ...)
// so realLongSpacing() returns s_mean for that one call instead of the
// max-gap. This means individual stiffeners are sized by their actual
// tributary width, not the group's worst-case panel — which is correct
// for stiffener Z (the worst panel still governs PLATE thickness, but
// that path doesn't go through _zReqForStiff).
// =========================================================================
let _S_OVERRIDE_MM = null;

function withLocalSpacing(s_mm, fn) {
  const prev = _S_OVERRIDE_MM;
  _S_OVERRIDE_MM = (isFinite(s_mm) && s_mm > 0) ? s_mm : null;
  try { return fn(); }
  finally { _S_OVERRIDE_MM = prev; }
}
window.withLocalSpacing = withLocalSpacing;

// ==================== F_B / F_D MODE TOGGLE ====================
// AUTO   — F_B and F_D are recomputed live from the current section modulus
//          on every recalcAll() (LR Pt 3 Ch 4 Sec 5.7.2: F = σ_actual / σ_perm).
//          The Setup input fields are overwritten to reflect the live value.
// MANUAL — The values typed in the Setup F_B / F_D fields are used as-is.
//          Auto-sync is bypassed. Useful for what-if studies or when the user
//          wants to lock F_B / F_D to a specific target ratio.
function getFBFDMode() {
  const el = document.querySelector('input[name="fbfdMode"]:checked');
  return (el && el.value === 'manual') ? 'manual' : 'auto';
}
window.getFBFDMode = getFBFDMode;

function onFBFDModeChange() {
  const mode = getFBFDMode();
  const FBtag = document.getElementById('FB_modeTag');
  const FDtag = document.getElementById('FD_modeTag');
  const FBin  = document.getElementById('FB');
  const FDin  = document.getElementById('FD');
  const FBlbl = document.getElementById('FB_label');
  const FDlbl = document.getElementById('FD_label');
  if (mode === 'manual') {
    if (FBtag) {
      FBtag.textContent = '· manual';
      FBtag.style.color = '#fbbf24';
      FBtag.style.fontWeight = '600';
      FBtag.style.textTransform = 'uppercase';
      FBtag.style.letterSpacing = '0.05em';
    }
    if (FDtag) {
      FDtag.textContent = '· manual';
      FDtag.style.color = '#fbbf24';
      FDtag.style.fontWeight = '600';
      FDtag.style.textTransform = 'uppercase';
      FDtag.style.letterSpacing = '0.05em';
    }
    // Visual cue: amber border on inputs in manual mode
    if (FBin) { FBin.style.borderColor = '#fbbf24'; FBin.style.background = 'rgba(251,191,36,0.05)'; }
    if (FDin) { FDin.style.borderColor = '#fbbf24'; FDin.style.background = 'rgba(251,191,36,0.05)'; }
    if (FBlbl) FBlbl.title = 'F_B (bottom) — MANUAL MODE: your typed value is used as-is, no auto-sync from section modulus. Switch to Auto in the F_B / F_D Mode selector to re-enable live SM-based computation.';
    if (FDlbl) FDlbl.title = 'F_D (deck) — MANUAL MODE: your typed value is used as-is, no auto-sync from section modulus. Switch to Auto in the F_B / F_D Mode selector to re-enable live SM-based computation.';
  } else {
    if (FBtag) {
      FBtag.textContent = '· auto';
      FBtag.style.color = 'var(--text-muted)';
      FBtag.style.fontWeight = '400';
      FBtag.style.textTransform = '';
      FBtag.style.letterSpacing = '';
    }
    if (FDtag) {
      FDtag.textContent = '· auto';
      FDtag.style.color = 'var(--text-muted)';
      FDtag.style.fontWeight = '400';
      FDtag.style.textTransform = '';
      FDtag.style.letterSpacing = '';
    }
    if (FBin) { FBin.style.borderColor = ''; FBin.style.background = ''; }
    if (FDin) { FDin.style.borderColor = ''; FDin.style.background = ''; }
    if (FBlbl) FBlbl.title = 'F_B (bottom) — auto-synced via LR Pt 3 Ch 4 Sec 5.7.2: F_B = σ_B / σ_perm = (|Ms+Mw|/Z_B) / (175/k_L). Floor 0.75 (longitudinal stiffener); plating relaxes to 0.67. NO upper cap — F > 1.0 means hull girder is overstressed (FAIL). Edit manually only to override; the next recalc will overwrite.';
    if (FDlbl) FDlbl.title = 'F_D (deck) — auto-synced via LR Pt 3 Ch 4 Sec 5.7.2: F_D = σ_D / σ_perm = (|Ms+Mw|/Z_D) / (175/k_L). Floor 0.75 (longitudinal stiffener); plating relaxes to 0.67. NO upper cap — F > 1.0 means hull girder is overstressed (FAIL). Edit manually only to override; the next recalc will overwrite.';
  }
  // Re-run the cascade so downstream formulas pick up either:
  //  - the freshly auto-computed values (mode = auto), OR
  //  - the user's typed values that we now stop overwriting (mode = manual).
  if (typeof recalcAll === 'function') recalcAll();
}
window.onFBFDModeChange = onFBFDModeChange;

// ═══════════════════════════════════════════════════════════════════════════
// LR h₄ HELPERS — single source of truth for deep-tank load head
// ═══════════════════════════════════════════════════════════════════════════
// LR Pt 4 Ch 1 Sec 9 Tablo 1.9.1 — h₄ definition for DEEP TANK BULKHEADS:
//
//   (b) plating       : from a point 1/3 of the plate height above its lower
//                       edge to the top of tank, OR half the distance to the
//                       top of overflow, whichever is the greater
//   (d) stiffeners    : from the middle of the effective length to the top
//                       of tank, OR half the distance to the top of overflow,
//                       whichever is the greater
//
// All compartment data uses airpipeZ_mm in ABSOLUTE mm above baseline (UI
// field labelled "mm AB"). NEVER add tank_top to it.
//
// LR practical minimum head: 0.5 m (per common LR practice in flooded loads).
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve airpipe top elevation (m AB) for a given compartment.
 * Falls back to UD + 0.76 m (LR Pt 4 Sec 6 default for weather-deck venting)
 * if comp.airpipeZ_mm is missing.
 *
 * @param {object} comp        — compartment object (may be null/undefined)
 * @param {number} fallback_mm — fallback in mm AB if comp has no airpipeZ_mm
 * @returns {number} airpipe top elevation in metres above baseline
 */
function _resolveAirpipeTop_m(comp, fallback_mm) {
  if (comp && comp.airpipeZ_mm != null && isFinite(comp.airpipeZ_mm)) {
    return comp.airpipeZ_mm / 1000;
  }
  if (fallback_mm != null && isFinite(fallback_mm)) return fallback_mm / 1000;
  // Last-resort fallback: weather deck + 760 mm
  try {
    const ud_mm = parseFloat(document.getElementById('udLevel')?.value || 15300);
    return (ud_mm + 760) / 1000;
  } catch (_) { return 16.06; }
}

/**
 * LR Tablo 1.9.1 (b)/(d) — design load head h₄ for deep tank scantlings.
 *
 *   h₄ = max( (z_tank_top − z_ref),  (z_overflow − z_ref) / 2,  0.5 m )
 *
 * @param {number} z_ref_mm     — reference point (mm AB)
 *                                 plate: z1 + H/3  (1/3 height above lower edge)
 *                                 stiff: middle of effective length
 * @param {number} z_tank_top_mm — top of tank (mm AB)
 * @param {number} z_overflow_mm — top of overflow / airpipe (mm AB)
 * @returns {{h4:number, h_a:number, h_b:number, governs:'tank'|'overflow'|'min'}}
 */
function _LR_h4(z_ref_mm, z_tank_top_mm, z_overflow_mm) {
  const h_a = (z_tank_top_mm - z_ref_mm) / 1000;          // (a) to top of tank
  const h_b = (z_overflow_mm - z_ref_mm) / 2 / 1000;      // (b) half-overflow
  const h_min = 0.5;                                       // LR practical min
  let h4 = h_a, governs = 'tank';
  if (h_b > h4) { h4 = h_b; governs = 'overflow'; }
  if (h_min > h4) { h4 = h_min; governs = 'min'; }
  return { h4, h_a, h_b, governs };
}
window._LR_h4 = _LR_h4;
window._resolveAirpipeTop_m = _resolveAirpipeTop_m;

/**
 * Find a representative ballast/fuel/freshwater compartment for tank-related
 * scantling formulas that need an airpipe height. This is used by deck-side
 * routines (tween/stringer deck) where the calling context doesn't already
 * know which compartment is at the deck's location.
 *
 * Search order:
 *   1. window.getCompartmentAt(y, z) at a sample point inside the deep tank
 *      (between IS and B_half, midway between IB and TT) — most accurate.
 *   2. First compartment in COMPARTMENTS list whose type matches and
 *      airpipeZ_mm is set.
 *   3. null (caller falls back to TT + 0.76 m default).
 *
 * @returns {object|null} compartment object or null
 */
function _findTankComp() {
  try {
    const G = (window.Draw && window.Draw.GEOMETRY) || {};
    const IB = G.IB || 1800, TT = (G.TT != null ? G.TT : (G.UD || 12900));   // no tween deck: side tank runs to UD
    const IS = G.IS || 10030, Bh = G.B_half || 11880;
    const yMid = (IS + Bh) / 2;
    const zMid = (IB + TT) / 2;
    const c = window.getCompartmentAt?.(yMid, zMid);
    if (c && (c.type === 'ballast' || c.type === 'fuel' || c.type === 'freshwater')
        && c.airpipeZ_mm != null) return c;
  } catch (_) {}
  // Fallback: scan COMPARTMENTS list
  try {
    const list = window.COMPARTMENTS || [];
    for (const c of list) {
      if ((c.type === 'ballast' || c.type === 'fuel' || c.type === 'freshwater')
          && c.airpipeZ_mm != null) return c;
    }
  } catch (_) {}
  return null;
}
window._findTankComp = _findTankComp;

/**
 * LR Pt 3 Ch 1 Tablo 1.9.1 — hydrostatic structural test head for deep tanks.
 *
 * Per LR Tablo 1.9.1 (Testing requirements), the test water column for a
 * deep tank is the GREATER of:
 *   (i)  head of water up to the top of the overflow, OR
 *   (ii) head of water 2.4 m above top of tank.
 *
 * Where (ii) is a fixed minimum and (i) depends on airpipe placement. In most
 * ships the airpipe is below tank_top + 2.4 m, so (ii) governs. If the airpipe
 * is high (e.g. weather-deck venting), (i) governs.
 *
 * @param {object|null} comp           — compartment (for testHead_m override)
 * @param {number}      tank_top_mm    — top of tank (mm AB)
 * @param {number|null} airpipe_top_mm — top of overflow (mm AB), nullable
 * @returns {{h_test_m:number, source:'overflow'|'2.4m'|'user', testH_user_m:number}}
 *          h_test_m is metres above tank_top.
 */
function _LR_testHead_above_TT(comp, tank_top_mm, airpipe_top_mm) {
  const userH = (comp && comp.testHead_m != null && isFinite(comp.testHead_m))
    ? comp.testHead_m : 2.4;
  const minH = Math.max(userH, 2.4);   // never below LR minimum 2.4 m
  let h = minH, src = (userH > 2.4) ? 'user' : '2.4m';
  if (airpipe_top_mm != null && isFinite(airpipe_top_mm)) {
    const h_overflow = (airpipe_top_mm - tank_top_mm) / 1000;
    if (h_overflow > h) { h = h_overflow; src = 'overflow'; }
  }
  return { h_test_m: h, source: src, testH_user_m: userH };
}
window._LR_testHead_above_TT = _LR_testHead_above_TT;

function getParams() {
  // Resolve material — local family override takes precedence over the
  // global Setup #material select. This lets per-stiffener / per-strake
  // calc* calls (wrapped in withLocalFamily) compute t_req / Z_req using
  // their own yield class, regardless of the global Setup value.
  const matKey = (_FAMILY_OVERRIDE && MATERIAL[_FAMILY_OVERRIDE])
    ? _FAMILY_OVERRIDE
    : document.getElementById('material').value;
  const m = MATERIAL[matKey];
  const le_global = parseFloat(document.getElementById('le').value);
  const le_eff = (_LE_OVERRIDE_M != null && isFinite(_LE_OVERRIDE_M))
    ? _LE_OVERRIDE_M
    : le_global;
  return {
    L: parseFloat(document.getElementById('L').value),
    B: parseFloat(document.getElementById('B').value),
    D: parseFloat(document.getElementById('D').value),
    T: parseFloat(document.getElementById('T').value),
    Cb: parseFloat(document.getElementById('Cb')?.value || 0.85),
    // Material: expose BOTH matKey (legacy name) and material (used by the
    // Buckling module and other p.material consumers). Previously p.material
    // was undefined everywhere, so "|| 'AH36'" fallback forced AH36 even when
    // the user selected MS / AH32 / AH40 — silently wrong UCs for every
    // non-AH36 ship.
    k: m.k, kL: m.kL, matKey: matKey, material: matKey,
    FB: parseFloat(document.getElementById('FB').value),
    FD: parseFloat(document.getElementById('FD').value),
    le: le_eff,
    le_global: le_global,    // for UI/debug to show original
    // LR Pt 3 Ch 4 Sec 5.3.1: still-water bending moments are EITHER hogging
    // (positive) OR sagging (negative). The form has TWO inputs:
    //   MsDesign (id) → Ms_hog (positive value, hogging max)
    //   MsSag    (id) → Ms_sag (negative value, sagging max)
    // For backward compatibility with code that reads `Ms_design`, we also
    // expose Ms_design = Ms_hog (the historical name that meant "the one
    // Ms value" before the split). New code should prefer Ms_hog/Ms_sag and
    // pick the one matching the analysis condition (hogging vs sagging).
    // LR Pt 3 Ch 4: service restriction (f1 on M_w and Z_min, K2 on Q_w), still water
    // shear force at the section, and the section's position along L
    serviceRestriction: (document.getElementById('serviceRestriction') || {}).value || 'unrestricted',
    f1: (function () { var sr = (document.getElementById('serviceRestriction') || {}).value; var v = parseFloat((document.getElementById('f1') || {}).value); if (sr !== 'restricted') return 1.0; return isNaN(v) ? 1.0 : Math.max(0.5, Math.min(1, v)); })(),
    Qs_pos:    Math.abs(parseFloat((document.getElementById('QsPos') || {}).value) || 0),
    Qs_neg:   -Math.abs(parseFloat((document.getElementById('QsNeg') || {}).value) || 0),
    x_over_L:  (function () { var v = parseFloat((document.getElementById('sectionXL') || {}).value); return isNaN(v) ? 0.5 : Math.max(0, Math.min(1, v)); })(),
    Ms_hog:    parseFloat(document.getElementById('MsDesign')?.value || 0),
    Ms_sag:    parseFloat(document.getElementById('MsSag')?.value    || 0),
    Ms_design: parseFloat(document.getElementById('MsDesign')?.value || 0),
    ibLevel: parseFloat(document.getElementById('ibLevel').value),
    ttLevel: parseFloat(document.getElementById('ttLevel').value),
    udLevel: parseFloat(document.getElementById('udLevel').value),
    hcLevel: parseFloat(document.getElementById('hcLevel').value)
  };
}

function calcCw(L) {
  const Le = Math.min(L, 227);
  return 7.71e-2 * Le * Math.exp(-0.0044 * Le);
}

// LR Pt 4 Ch 1 Table 1.6.1 / 1.6.3 / 1.6.4 — wave head length correction factor
//   F_λ = 1.0 for L ≤ 200 m
//   F_λ = 1.0 + 0.0023·(L − 200) for L > 200 m
function calcFlambda(L) {
  return L <= 200 ? 1.0 : (1.0 + 0.0023 * (L - 200));
}

function s1Limit(s, L) {
  // LR Pt 4 Ch 1 Sec 6.4: s1 is the greater of the actual stiffener spacing s
  // and (470 + L/0.6) mm, capped at 700 mm.
  //   s1 = min( max(s, 470 + L/0.6) , 700 )
  // Note: Pt 3 Ch 4 Sec 6 uses the opposite (min instead of max); we follow
  // Pt 4 Ch 1 here because this tool sizes merchant-cargo ship scantlings.
  return Math.max(s, Math.min(470 + L/0.6, 700));
}

function roundPlate(t) {
  // Round plate thickness UP to the next 0.5 mm step.
  // Previous logic had special cases for 14.0/14.5/15.0/15.5 that forced
  // any t<14.25 to 14.0 — a serious bug that silently upgraded all
  // thin-plate results (e.g. t=8.5 → 14.0).
  if (!isFinite(t) || t <= 0) return 0;
  return Math.ceil(t * 2) / 2;
}

// ═══ Legacy compatibility shim: old code calls sectionZL(s,t,profName) and L_PROFILES[name].kg ═══
function sectionZL(s_plate, t_plate, profName) {
  const r = sectionZWithPlate(profName, s_plate, t_plate);
  return r.Z_min;
}

// Compat: provide L_PROFILES-like object with .kg auto-computed from SectionPro catalog
const L_PROFILES = new Proxy({}, {
  get(target, name) {
    if (typeof name !== 'string') return undefined;
    const pd = getProfileData(name);
    if (!pd) return undefined;
    return { kg: weightPerM(pd.area), isHP: pd.type === 'HP' };
  },
  has(target, name) {
    return getProfileData(name) !== null;
  },
  ownKeys() {
    return [...L_CATALOG.map(p=>p.name), ...HP_CATALOG.map(p=>p.name), ...FB_CATALOG.map(p=>p.name)];
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true };
  }
});

// Profile list for dropdowns (L only for default, plus HP favorites)
// Get viable profiles (Z sufficient + slenderness OK + within safety margin)
function getViableProfiles(Z_req, s_mm, t_plate_mm, kL, safetyLimitOverride) {
  const preferType = document.getElementById('preferProfileType')?.value || 'L';
  // safetyLimitOverride lets callers relax/tighten the default UI setting.
  // Used for light members (e.g. UD long) where Z_req is small and
  // the default "+100%" band filters out most of the catalog.
  const safetyLimit = (safetyLimitOverride != null)
    ? safetyLimitOverride
    : parseFloat(document.getElementById('safetyUpperLimit')?.value || '100');
  
  let candidates = [];
  const types = preferType.split('+');  // supports "L+HP"
  const useAll = preferType === 'any';
  
  if (useAll || types.includes('L')) L_CATALOG.forEach(p => candidates.push(p.name));
  if (useAll || types.includes('HP')) HP_CATALOG.forEach(p => candidates.push(p.name));
  if (useAll || types.includes('FB')) FB_CATALOG.forEach(p => candidates.push(p.name));
  
  const results = candidates.map(name => {
    const r = sectionZWithPlate(name, s_mm, t_plate_mm);
    const sl = checkProfileSlenderness(name, kL);
    const safety = ((r.Z_min - Z_req) / Z_req * 100);
    return { name, Z: r.Z_min, weight: r.weight, slenderOK: sl.ok, dw_t: sl.ratio, safety };
  });
  
  // Filter: Z >= Z_req, slenderness OK, safety within limit
  const viable = results.filter(r => 
    r.Z >= Z_req && r.slenderOK && r.safety <= safetyLimit
  );
  
  // Sort by weight (lightest first)
  viable.sort((a, b) => a.weight - b.weight);
  
  return viable;
}

// Legacy wrapper - returns name only (kept for backward compat, uses default lightest)
// Populate a dropdown with viable profiles
// Returns the first (lightest) as default selection if current selection invalid
// safetyLimitOverride: optional — relaxes the default UI "safety upper limit"
// for this specific dropdown (e.g. UD long where Z_req is small).
function populateFilteredDropdown(selectId, Z_req, s_mm, t_plate_mm, kL, safetyLimitOverride) {
  const sel = document.getElementById(selectId);
  if (!sel) return null;
  
  const currentValue = sel.value;
  const viable = getViableProfiles(Z_req, s_mm, t_plate_mm, kL, safetyLimitOverride);

  // Default profile preferences (Baltic Laker). Used when no value is set yet
  // AND the default passes the filter. Falls back to lightest otherwise.
  const DEFAULT_PROFILES = {
    bottomLongProfile: 'L 250x90x12',
    deckLongProfile:   'L 150x75x9',
    twnDeckProfile:    'L 125x75x10',
    ibLongProfile:     'L 250x90x12',
    strDeckProfile:    '',   // stringer non-WT: user chooses
  };

  sel.innerHTML = '';
  
  if (viable.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— No profile meets Z_req + constraints —';
    opt.disabled = true;
    sel.appendChild(opt);
    return null;
  }
  
  // Group by type
  const byType = { 'L':[], 'HP':[], 'FB':[] };
  viable.forEach(v => {
    if (v.name.startsWith('L ')) byType.L.push(v);
    else if (v.name.startsWith('HP ')) byType.HP.push(v);
    else if (v.name.startsWith('FB ')) byType.FB.push(v);
  });
  
  const labels = { 'L':'L Profile', 'HP':'HP Bulb', 'FB':'Flat Bar' };
  Object.keys(byType).forEach(type => {
    if (byType[type].length === 0) return;
    const og = document.createElement('optgroup');
    og.label = labels[type];
    byType[type].forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.name;
      opt.textContent = `${v.name}  ·  Z=${v.Z.toFixed(0)} cm³  ·  ${v.weight.toFixed(1)} kg/m  ·  +${v.safety.toFixed(0)}%`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  
  // Restore selection if still valid, otherwise try default profile,
  // otherwise pick lightest.
  const stillValid = viable.some(v => v.name === currentValue);
  if (stillValid) {
    sel.value = currentValue;
  } else {
    const defaultName = DEFAULT_PROFILES[selectId];
    const defaultValid = defaultName && viable.some(v => v.name === defaultName);
    sel.value = defaultValid ? defaultName : viable[0].name;
  }
  
  return sel.value;
}

// Resolve profile name (keep user selection if valid, else fallback)
function resolveProfileName(selectVal, Z_req, s_mm, t_plate, kL) {
  if (selectVal && getProfileData(selectVal)) {
    const r = sectionZWithPlate(selectVal, s_mm, t_plate);
    if (r.Z_min >= Z_req) return selectVal;  // user selection valid
  }
  // Fallback to lightest viable
  const v = getViableProfiles(Z_req, s_mm, t_plate, kL);
  return v.length > 0 ? v[0].name : 'L 180x100x10';
}

// Populate all profile dropdowns - called on recalc
function populateProfileDropdowns() {
  // Helper to read real spacing from drawing for a profile group
  const realS = (group, inputId, fallback, withSupports) => {
    if (typeof realLongSpacing !== 'function') {
      const el = document.getElementById(inputId);
      const v = el ? parseFloat(el.value) : NaN;
      return isFinite(v) ? v : fallback;
    }
    return realLongSpacing(group, {
      coord: (group === 'sideShell' || group === 'innerSide') ? 'z' : 'y',
      inputId, defaultFallback: fallback,
      extraSupports: withSupports && (typeof getPlateSupports === 'function')
                     ? getPlateSupports(group) : []
    });
  };
  // Bottom long
  const p = getParams();
  const bl = calcBottomLongCore();  // helper without profile resolution
  const bt = parseFloat(document.getElementById('bottomT').value);
  const bs = realS('bottomShell', 'bottomLongSpacing', 700, true);
  populateFilteredDropdown('bottomLongProfile', bl.Z_req, bs, bt, p.kL);
  
  // Upper Deck long - real Z_req from Table 1.4.3
  // UD is a light member — use a generous safety upper limit (≤ +500%)
  // so the user sees the full range of reasonable profiles, not just
  // the 5-6 that fit the default ≤+100% band.
  const ds = realS('upperDeck', 'deckLongSpacing', 700, true);
  const dt = parseFloat(document.getElementById('deckT').value);
  const udL = calcUpperDeckLong();
  populateFilteredDropdown('deckLongProfile', udL.Z_req, ds, dt, p.kL, 500);
  
  // Stringer deck long  — light member, use generous safety limit
  const strS = realS('stringerStiff', 'strDeckSpacing', 700, false);
  const strT = parseFloat(document.getElementById('strDeckT').value);
  const strL = calcLowerDeckLong('str');
  populateFilteredDropdown('strDeckProfile', strL.Z_req, strS, strT, p.kL, 500);
  
  // Tween deck long — light member, use generous safety limit
  const twnS = realS('tweenStiff', 'twnDeckSpacing', 700, false);
  const twnT = parseFloat(document.getElementById('twnDeckT').value);
  const twnL = calcLowerDeckLong('twn');
  populateFilteredDropdown('twnDeckProfile', twnL.Z_req, twnS, twnT, p.kL, 500);
  
  // Side groups - dropdowns for each of G1..G5
  const sideGroups = calcSideGroupsBase();  // helper that computes Z_max, s_max, t_plate per group
  Object.keys(sideGroups).forEach(k => {
    const g = sideGroups[k];
    populateFilteredDropdown('sideGroupProfile_' + k, g.Z_max, g.s_max, g.t_plate, p.kL);
  });
  
  // Inner side groups
  const isGroups = calcInnerSideGroupsBase();
  Object.keys(isGroups).forEach(k => {
    const g = isGroups[k];
    populateFilteredDropdown('innerSideGroupProfile_' + k, g.Z_max, g.s_is, 10, p.kL);
  });
}

// LR Table 1.6.1 coefficients
function c1Interp(FB, FD, z, D2) {
  // Guard against denominators going ≤0 for out-of-range F_B / F_D values.
  // Realistic F_B, F_D are in [0.5, 1.0]; we clamp so the formulas don't
  // produce NaN / Infinity.
  const denom_b = Math.max(225 - 150 * FB, 1);   // avoid ÷0 / negative
  const denom_d = Math.max(225 - 165 * FD, 1);
  const c1_b = 75 / denom_b;
  const c1_m = 1.0;
  const c1_d = 60 / denom_d;
  if (z <= 0) return c1_b;
  if (z >= D2) return c1_d;
  if (z <= D2/2) return c1_b + z/(D2/2)*(c1_m - c1_b);
  return c1_m + (z-D2/2)/(D2/2)*(c1_d - c1_m);
}

function F1calc(D2, c1, h5, aboveMid) {
  let F1_raw;
  if (aboveMid) F1_raw = D2*c1/(4*D2 + 20*h5);
  else F1_raw = D2*c1/(25*D2 - 20*h5);
  return Math.max(F1_raw, 0.14);
}

// LR Pt 4 Ch 1 Table 1.6.1 — Fatigue factor F_s for side longitudinals
//   F_S = 1.0 at D2 and above
//   F_S = (1.1/k)·[1 − 2·(b_f1/b_f)·(1 − k)] at 0.6·D2 above baseline
//   F_S = F_SB at the baseline, where F_SB = 0.5·(1 + F_s at 0.6·D2)
//   Intermediate values by linear interpolation.
// For FB / bulb plates: b_f1/b_f may be taken as 0.5 (LR Table 1.6.1 Note b).
// For rolled/built angles (L), b_f1/b_f depends on profile orientation (PDF Fig. 9.5.1);
// 0.5 is used as a conservative default unless the caller provides the actual ratio.
//
// BUG FIX (Apr 2026): Previous revision mistakenly used F₁ (bending-moment
// coefficient, 0.14…1.0) in place of b_f1/b_f (geometry ratio, ~0.5).
// These are completely different quantities; the old code produced nonsensical
// F_s values away from mid-depth. Corrected to use b_f1/b_f with default 0.5.
function FsInterp(k, z, D2, bf1_over_bf) {
  const r = (bf1_over_bf != null && isFinite(bf1_over_bf)) ? bf1_over_bf : 0.5;
  const Fs_06 = (1.1/k) * (1 - 2*r*(1-k));
  const FSB = 0.5 * (1 + Fs_06);   // Rule: F_SB = 0.5·(1 + Fs@0.6D2)
  const z06 = 0.6 * D2;
  if (z >= D2) return 1.0;
  if (z <= 0) return FSB;
  if (z <= z06) return FSB + z/z06 * (Fs_06 - FSB);
  return Fs_06 + (z - z06)/(D2 - z06) * (1 - Fs_06);
}

function FsbCalc(Fs_06) { return 0.5 * (1 + Fs_06); }

function gammaCalc(le) {
  const le1 = Math.max(2.5, Math.min(le, 5.0));
  return 0.002*le1 + 0.046;
}

// ==================== BOTTOM LONG - CORE (profile-agnostic) ====================
// LR Pt 4 Ch 1 Table 1.6.1 (3) — Bottom and bilge longitudinals:
//   The GREATER of:
//     (a) Z = γ·s·k·h_T2·l_e²·F₁             [wave-based, no F_sb]
//     (b) Z = γ·s·k·h_T3·l_e²·F₁·F_sb        [tank-based, with F_sb]
//   where h_T2 = min(T + 0.5·Cw, 1.2·T)   [wave head at bottom]
//         h_T3 = h₄ − 0.25·T                [deep-tank head, Sec 1.6.1 note]
//         γ    = 0.002·l_e1 + 0.046
//         F_sb = 0.5·(1 + F_s@0.6D₂)
//
// For dry-cargo ships with no deep tank directly above the bottom, h_T3 is
// not applicable and (a) alone governs. If ballast water / fuel is carried
// in the double bottom, (b) is evaluated too.
function calcBottomLongCore() {
  const p = getParams();
  const Cw = calcCw(p.L);
  const hT2 = Math.min(p.T + 0.5*Cw, 1.2*p.T);
  const D2 = Math.min(p.D, 1.6*p.T);
  // Real long spacing: max gap between consecutive bottom-shell longitudinals
  // in the live drawing. Falls back to form input if profile array is empty.
  // Side girders + duct wall count as supports (they break apparent gaps).
  let s;
  if (typeof realLongSpacing === 'function') {
    s = realLongSpacing('bottomShell', {
      coord: 'y',
      inputId: 'bottomLongSpacing',
      defaultFallback: 700,
      extraSupports: (typeof getPlateSupports === 'function')
                     ? getPlateSupports('bottomShell') : []
    });
  } else {
    s = parseFloat(document.getElementById('bottomLongSpacing').value);
  }
  const c1 = 75/(225 - 150*p.FB);
  const F1 = F1calc(D2, c1, D2, false);
  // LR Pt 4 Ch 1 Table 1.6.1 symbols: l_e "is not to be taken less than 1,5 m",
  // except in way of the centre girder brackets of 8.5.3 where 1,25 m may be
  // used (that exception is not auto-detected). The deck / coaming longitudinal
  // calcs already floor l_e the same way.
  const le_eff = Math.max(p.le, 1.5);
  const gamma = gammaCalc(le_eff);
  // F_sb uses b_f1/b_f = 0.5 (LR Note b: default for FB/bulb, conservative
  // default for rolled/built when geometry not available)
  const Fs_06 = (1.1/p.k)*(1 - 2*0.5*(1-p.k));
  const Fsb = FsbCalc(Fs_06);
  const le2 = Math.pow(le_eff, 2);

  // ── (a) Wave-based bottom long Z — always applies ──
  const Z_a = gamma * s * p.k * hT2 * le2 * F1;

  // ── (b) Tank-based bottom long Z — only if DB contains tank above ──
  // Determine h_4 (tank head to top of tank or overflow) above the bottom.
  // Heuristic: if IB common with side tank (user flag), use that tank head;
  // otherwise if there's a DB ballast tank (inferred from compartments above
  // the baseline), use tank-top − 0 + overflow head; else skip (b).
  let h4_tank = 0;
  try {
    // Check if an "ibSideTank = yes" flag tells us the DB is a deep-tank region
    const ibSideTank = document.getElementById('ibSideTank')?.value;
    if (ibSideTank === 'yes') {
      h4_tank = parseFloat(document.getElementById('ibSideTankH')?.value) || 0;
    } else if (typeof window.getCompartmentAt === 'function') {
      // Sample a point just above the centreline at z ≈ 10 mm
      const comp = window.getCompartmentAt(100, 10);
      if (comp && ['ballast','fuel','freshwater'].includes(comp.type)) {
        const bb = window._compartmentBoundingBox?.(comp);
        const tank_top_mm = bb ? bb.zMax : p.ibLevel;
        const airpipe_m = _resolveAirpipeTop_m(comp, tank_top_mm + 760);
        // LR Tablo 1.9.1 (d): from baseline (z_ref = 0) up to top_of_tank
        // or half the distance to overflow, whichever is greater.
        const lr = _LR_h4(0, tank_top_mm, airpipe_m * 1000);
        h4_tank = lr.h4;
      }
    }
  } catch (_) { /* fall through to Z_a only */ }

  const hT3 = Math.max(h4_tank - 0.25 * p.T, 0);
  const Z_b = hT3 > 0
    ? gamma * s * p.k * hT3 * le2 * F1 * Fsb
    : 0;

  const Z_req = Math.max(Z_a, Z_b);
  const governing = Z_b > Z_a ? 'b (tank, h_T3)' : 'a (wave, h_T2)';
  return { Z_req, Z_a, Z_b, governing, gamma, F1, Fsb, hT2, hT3, c1, s, le: le_eff };
}

function calcBottomLong() {
  const p = getParams();
  const core = calcBottomLongCore();
  const t_plate = parseFloat(document.getElementById('bottomT').value);
  let profName = document.getElementById('bottomLongProfile').value;
  profName = resolveProfileName(profName, core.Z_req, core.s, t_plate, p.kL);
  const Z_sec = sectionZL(core.s, t_plate, profName);
  return { ...core, Z_sec, resolvedProfile: profName, passFail: Z_sec >= core.Z_req };
}

// ==================== INNER BOTTOM PLATE (LR Sec 8.4) ====================
// Sec 8.4.1 — Base formula:
//   t = 0.00136·(s + 660)·⁴√(k²·L·T)   [mm]
//   Min: 6.5 mm (holds), 7.5 mm (under hatchways, no ceiling)
// Sec 8.4.2 — Under hatchway + no ceiling → +2 mm
// Sec 2.2.2 — Grab discharge:
//   + ceiling present      → +3 mm
//   + ceiling omitted (alt)→ +5 mm (alternative allowance for omission of ceiling)
// Sec 8.4.4 — DB common w/ side tank or cofferdam → deep tank formula (greater governs):
//   t_deep = 0.004·s·f·√(ρ·h/1.025) + 2.5 mm  (K1 = 2.5 "elsewhere")
//   Min deep tank: 6.5 (L<90), 7.5 (L≥90)
function calcIBPlate() {
  const p = getParams();
  // Governing s across all inner-bottom strakes (worst-case per-strake max gap)
  let s = 700;
  if (typeof window.strakeLongSpacing === 'function' && window.Draw?.STRAKES?.innerBottom) {
    const ibArr = window.Draw.STRAKES.innerBottom;
    let maxS = 0;
    for (let i = 0; i < ibArr.length; i++) {
      const r = window.strakeLongSpacing('innerBottom', i);
      if (r && isFinite(r.value) && r.value > maxS) maxS = r.value;
    }
    if (maxS > 0) s = maxS;
  } else {
    s = realLongSpacing('innerBottom', { inputId: 'ibLongSpacing', coord: 'y', extraSupports: window.getPlateSupports?.('innerBottom') || [] });
  }
  const t_ib = parseFloat(document.getElementById('ibT').value);
  const location = document.getElementById('ibLocation').value;      // 'hold' / 'hatch'
  const ceiling = document.getElementById('ibCeiling').value;        // 'yes' / 'no'
  const grab = document.getElementById('ibGrab').value;              // 'yes' / 'no'
  const sideTank = document.getElementById('ibSideTank').value;      // 'yes' / 'no'
  
  // --- 8.4.1 Base formula ---
  const t_base = 0.00136 * (s + 660) * Math.pow(p.k * p.k * p.L * p.T, 0.25);
  
  // --- Minimum (hold vs hatch) ---
  const under_hatch = (location === 'hatch');
  const ceiling_omitted = (ceiling === 'no');
  const t_min = (under_hatch && ceiling_omitted) ? 7.5 : 6.5;
  
  // --- 8.4.2 & 2.2.2 Increments ---
  // Priority: grab+no-ceiling = +5, grab+ceiling = +3, hatch+no-ceiling = +2
  let increment = 0;
  let incRule = '—';
  let incDesc = 'No increment';
  if (grab === 'yes' && ceiling_omitted) {
    increment = 5.0;
    incRule = 'Sec 2.2.2 alt.';
    incDesc = 'Grab discharge + ceiling omitted (+5 mm)';
  } else if (grab === 'yes' && !ceiling_omitted) {
    increment = 3.0;
    incRule = 'Sec 2.2.2';
    incDesc = 'Grab discharge + ceiling (+3 mm)';
  } else if (under_hatch && ceiling_omitted) {
    increment = 2.0;
    incRule = 'Sec 8.4.2';
    incDesc = 'Under hatchway + ceiling omitted (+2 mm)';
  }
  
  const t_nominal = Math.max(t_base, t_min);
  const t_with_incr = t_nominal + increment;
  
  // --- 8.4.4 Deep tank formula (if DB common w/ side tank) ---
  let t_deep = null;
  if (sideTank === 'yes') {
    const h = parseFloat(document.getElementById('ibSideTankH').value);
    const rho = parseFloat(document.getElementById('ibRho').value);
    const f = 1.0;  // simplified (proper f requires geometry; user can adjust)
    // LR Table 1.9.1 (1) via Sec 8.4.4: t = 0.004·s·f·√(ρ·h·k/1.025) + 2.5
    // (k inside sqrt per Rule text)
    const t_deep_calc = 0.004 * s * f * Math.sqrt(rho * h * p.k / 1.025) + 2.5;
    const t_deep_min = p.L >= 90 ? 7.5 : 6.5;
    t_deep = Math.max(t_deep_calc, t_deep_min);
  }
  
  // --- Governing ---
  // Per LR Pt 4 Ch 1 Section 8 (verified against reference implementation):
  // Section 8 considers ONLY t_base + increment + deep tank for IB plate.
  // Cargo stowage pressure is NOT part of Section 8 thickness rules —
  // bulk cargo is implicitly covered by the grab increment (Sec 2.2.2).
  const candidates = { "8.4.1+incr": t_with_incr };
  if (t_deep !== null) candidates["8.4.4 deep"] = t_deep;
  const t_req = Math.max(...Object.values(candidates));
  const gov = Object.keys(candidates).reduce((a,b) => candidates[a] >= candidates[b] ? a : b);
  
  return {
    t_ib,               // as-built
    t_base,             // 8.4.1 raw
    t_min,              // minimum (6.5 or 7.5)
    t_nominal,          // max(t_base, t_min)
    increment,          // 0/+2/+3/+5
    incRule, incDesc,
    t_with_incr,        // nominal + increment
    t_deep,             // 8.4.4 deep tank (null if not applicable)
    t_req,              // final governing
    gov,                // which governs
    s,
    passFail: t_ib >= t_req,
    formula_base: '0.00136·(s+660)·⁴√(k²·L·T)',
    location: under_hatch ? 'Under hatchway' : 'In hold',
    ceiling: ceiling_omitted ? 'Omitted' : 'Fitted',
    grab: grab === 'yes' ? 'Yes' : 'No',
    sideTank: sideTank === 'yes' ? 'Connected' : 'Independent'
  };
}

// ==================== INNER BOTTOM LONGITUDINAL (LR Sec 8.4.5) ====================
// Sec 8.4.5:
//   - Z ≥ 0.85 × Z_bottom_long (Table 1.6.1)
//   - If DB common w/ side tank/cofferdam → Z ≥ deep tank Z (greater governs)
//   - Unsupported span ≤ 2.5 m
//   - For HT steel: additional Sec 6.2.2 requirements apply (not automated here)
function calcIBLong(Z_bottom_long) {
  const p = getParams();
  const sideTank = document.getElementById('ibSideTank').value;
  // Real long spacing: max gap between IB longitudinals in the drawing.
  // Side girders + duct wall act as supports (same as bottom shell).
  let s;
  if (typeof realLongSpacing === 'function') {
    s = realLongSpacing('innerBottom', {
      coord: 'y',
      inputId: 'ibLongSpacing',
      defaultFallback: 700,
      extraSupports: (typeof getPlateSupports === 'function')
                     ? getPlateSupports('innerBottom') : []
    });
  } else {
    s = parseFloat(document.getElementById('ibLongSpacing').value);
  }
  const le = p.le;  // span (bottom long span as proxy; IB span assumed similar)
  
  const Z_85 = 0.85 * Z_bottom_long;
  
  // Deep tank Z check (LR Pt 4 Ch 1 Sec 9, Table 1.9.1 item (2)):
  //   Z = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2))  [cm³]
  //
  // h_4 definition (LR Pt 4 Ch 1 Sec 1): distance from point considered to
  // TOP OF OVERFLOW (airpipe), minimum 0.5 m.
  //
  // For IB longs in a double-bottom BALLAST/FUEL tank, the overflow pipe
  // vents on the weather deck = UD + 0.76 m typical. When the user declares
  // the DB is "common with side tank", that side tank's air-pipe head is
  // entered via the 'ibSideTankH' field (e.g. 16.06 m for UD+0.76).
  //
  // h_4 = max(head_from_user - z_ib, 0.5 m)
  //   where head_from_user is airpipe z (m above baseline) from ibSideTankH.
  //   z_ib = IB level (structure point).
  //
  // γ: material factor (LR Table 1.9.2). For rolled/built-up longitudinals
  // with bracketed ends, γ = 1.0 for MS, scaled by k for HT. Current code
  // used γ=1.4 (conservative) — keeping that until LR table confirmation.
  //
  // Cross-check: if user does NOT declare side-tank connection, the DB tank
  // still has an airpipe (on deck), so we still compute Z_dt using UD+0.76
  // as a sensible default.

  let Z_dt = null, h_4_dt = null, airpipe_m = null, airpipe_src = null,
      tank_top_m = null;

  // Resolve airpipe top (m above baseline) for the DB tank (below IB)
  if (sideTank === 'yes') {
    const h_user = parseFloat(document.getElementById('ibSideTankH')?.value);
    if (!isNaN(h_user) && h_user > 0) {
      airpipe_m = h_user;
      airpipe_src = 'user-entered (side-tank air-pipe top)';
    }
  }
  if (airpipe_m == null) {
    // Try DB compartment lookup first — sample just below IB at centreline.
    try {
      const compDB = window.getCompartmentAt?.(100, Math.max(p.ibLevel - 200, 100));
      if (compDB && compDB.airpipeZ_mm != null) {
        airpipe_m = compDB.airpipeZ_mm / 1000;
        airpipe_src = `DB compartment ${compDB.name || ''} airpipe`;
      }
    } catch (_) {}
  }
  if (airpipe_m == null) {
    airpipe_m = (p.udLevel / 1000) + 0.76;
    airpipe_src = 'UD + 0.76 m (weather-deck overflow, default)';
  }

  // Tank top — for DB the IB is the tank crown, i.e. tank_top = IB level
  tank_top_m = p.ibLevel / 1000;
  const z_ib = p.ibLevel / 1000;   // structure point = IB level

  // h_4 per LR Pt 4 Ch 1 Tablo 1.9.1 note (d), via central helper:
  //   h_4 = max( (z_TT − z_mid) , (z_OF − z_mid)/2 , 0.5 m )
  // For an IB long sitting AT the tank crown (z_mid = z_ib = tank_top), the
  // first term is zero, so the half-overflow term governs.
  const _lr_iblong = _LR_h4(p.ibLevel, tank_top_m * 1000, airpipe_m * 1000);
  const h4_a = _lr_iblong.h_a;
  const h4_b = _lr_iblong.h_b;
  h_4_dt = _lr_iblong.h4;

  // Density: user-specified (ballast 1.025 default)
  const rho_el = document.getElementById('ibRho');
  const rho = rho_el ? (parseFloat(rho_el.value) || 1.025) : 1.025;

  // γ and ω per LR Table 1.9.1 symbols block:
  //   γ = 1.4 for rolled or built sections (IB longs are typically rolled HP)
  //   γ = 1.6 for flat bars
  //   ω = end constraint factor (Table 1.9.3) — use 1.0 for standard bracketed ends
  const gamma = 1.4;         // rolled/built — confirmed from PDF Table 1.9.1
  const omega = 1.0;         // standard bracketed ends
  const denom = 22 * gamma * (omega + omega + 2);

  // Z = ρ · s · k · h_4 · l_e² / (22·γ·(ω₁+ω₂+2))   [cm³]
  // (Units in LR formula are already consistent to return cm³.)
  Z_dt = rho * s * p.k * h_4_dt * le * le / denom;

  // ==========================================================================
  // Cargo load check — LR Pt 3 Ch 3 Sec 5, Table 3.5.1 (inner_bottom row)
  // ==========================================================================
  // Table 3.5.1 inner_bottom (heavy cargo notation column):
  //   C ≤ 0.865 m³/tonne  (stowage rate)
  //   p = H/C  [kN/m²]
  //   h_i = H  [m]
  //
  // When the user defines a cargo compartment directly above IB with
  // cargoLoad (t/m²), we convert to equivalent hydrostatic head:
  //   p_cargo  = cargoLoad × 9.81   [kN/m²]
  //   h_cargo_eq = p_cargo / (9.81 × ρ_ref) = cargoLoad / ρ_ref   [m]
  //     (ρ_ref = 1.025 t/m³ is LR's seawater reference)
  //
  // We then apply the same Sec 9 Table 1.9.1(2) formula, treating cargo
  // as an equivalent hydrostatic column. This is LR-consistent:
  // Pt 4 Ch 1 Sec 8.4.5 ties IB long scantlings to deep-tank rules when a
  // head acts on the structure; Pt 3 Ch 3 Sec 5 Table 3.5.1 provides the
  // equivalent head from cargo loading for ships with heavy cargo notation.
  //
  // If the ship has no heavy cargo notation, Table 3.5.1 gives a fixed
  // permissible p = 9.82·T kN/m² (h = 1.39·T m). We compare against this
  // minimum when the user has NOT set a compartment cargoLoad.
  //
  // SAFETY: the IB long must satisfy the largest of:
  //   (a) 0.85 × Z_bottom  (local rule — Sec 8.4.5)
  //   (b) Z_deep_tank      (deep tank from below — Sec 9, when applicable)
  //   (c) Z_cargo          (cargo head from above — Sec 5 Table 3.5.1)

  let Z_cargo = null, h_cargo_eq = null, cargoSource = null, cargoLoad_tm2 = null,
      C_stowage = null;

  try {
    const G = (window.Draw && window.Draw.GEOMETRY) || {};
    const B_half = G.B_half || 11880;
    // Sample just above the IB surface, mid-ship transversely
    const sample_y = B_half / 2;
    const sample_z = (p.ibLevel + 100);

    if (window.getCompartmentAt) {
      const comp = window.getCompartmentAt(sample_y, sample_z);
      if (comp && comp.type === 'cargo' && (comp.cargoLoad || 0) > 0) {
        cargoLoad_tm2 = comp.cargoLoad;
        // Equivalent head (m) — seawater reference per LR convention
        h_cargo_eq = cargoLoad_tm2 / 1.025;
        // Stowage rate back-check: C = H / (cargoLoad / ρ_water) ≈ hold-height × ρ / load
        // Here H is the cargo-space height above IB — use UD−IB as proxy
        const H_cargo = (p.udLevel - p.ibLevel) / 1000;  // m
        C_stowage = H_cargo / h_cargo_eq;
        // Heavy cargo notation check (LR Table 3.5.1): C ≤ 0.865 m³/tonne
        const needsHeavyCargoNotation = C_stowage < 0.865;
        cargoSource = `compartment '${comp.name}' · ${cargoLoad_tm2} t/m²` +
                      ` (C = ${C_stowage.toFixed(2)} m³/t — ${needsHeavyCargoNotation ? 'heavy cargo notation required' : 'light cargo'})`;
        // Apply the same Sec 9 formula with h_cargo_eq as the head
        Z_cargo = 1.025 * s * p.k * h_cargo_eq * le * le / denom;
      } else {
        // No cargo compartment defined above IB → fallback to Table 3.5.1
        // "ship_without_heavy_cargo_notation" default: p_permissible = 9.82·T
        // h_permissible = 1.39·T   (head in m, T = draught)
        const h_table = 1.39 * p.T;
        cargoSource = `default Table 3.5.1 (no heavy cargo notation) · h = 1.39·T = ${h_table.toFixed(2)} m`;
        h_cargo_eq = h_table;
        Z_cargo = 1.025 * s * p.k * h_cargo_eq * le * le / denom;
      }
    }
  } catch (e) {}
  
  // === Governing Z ===
  // Per LR Pt 4 Ch 1 Sec 8.4.5:
  //   Z ≥ 0.85 × Z_bottom          (local — Sec 8.4.5)
  //   Z ≥ Z_deep_tank              (deep tank from below — Sec 9)
  //   Z ≥ Z_cargo                  (cargo head from above — Pt 3 Ch 3 Sec 5)
  let Z_req = Z_85;
  let gov = '0.85 × Z_bottom (Sec 8.4.5)';
  if (Z_dt != null && Z_dt > Z_req) {
    Z_req = Z_dt;
    gov = 'deep tank (Sec 9 Table 1.9.1(2))';
  }
  if (Z_cargo != null && Z_cargo > Z_req) {
    Z_req = Z_cargo;
    gov = 'cargo load (Pt 3 Ch 3 Sec 5 Table 3.5.1)';
  }
  
  // Unsupported span check
  const spanOK = le <= 2.5;
  
  // HT steel flag
  const htSteel = p.matKey !== 'MS';
  
  return {
    Z_85,
    Z_dt,
    Z_cargo,
    h_4_dt,
    h_cargo_eq,
    cargoLoad_tm2,
    cargoSource,
    C_stowage,
    airpipe_m,
    airpipe_src,
    rho,
    gamma,
    Z_req,
    gov,
    le,
    spanOK,
    spanLimit: 2.5,
    htSteel,
    htNote: htSteel ? `HT steel (${p.matKey}, k=${p.k}) — Sec 6.2.2 may apply` : null
  };
}

// ==================== DECKS (LR Pt 4 Ch 1 Sec 4 — Tables 1.4.1 – 1.4.4) ====================

// Common derived quantities
function _L1(L) { return Math.min(L, 190); }
function _L2(L) { return Math.min(L, 215); }
function _s1(s, L) {
  const lower = Math.min(470 + L/0.6, 700);
  return Math.max(s, lower);
}
function _f(s_mm, S_m) {
  return Math.min(1.0, 1.1 - s_mm / (2500 * S_m));
}
function _f1(s_mm, S_m) {
  const r = s_mm / (1000 * S_m);
  return 1.0 / (1.0 + r*r);
}
function _hT1(L, shipType) {
  const L1v = _L1(L);
  if (shipType === 'B-60') return L1v / 56;
  return Math.max(L1v / 70, 1.20);
}
function _c1_deck(FD) {
  const d = 225 - 165 * FD;
  if (d <= 0) return 0;
  return 60 / d;
}
function _F1_deck(FD) { return 0.25 * _c1_deck(FD); }

// ---------- LR Pt 3 Ch 3 Table 3.5.1 — design heads from deck loads ----------
// Deck loads live on the section-model panels (deckLoad {type, p kN/m²}); the
// adapter exposes the governing one per position. Heads follow Table 3.5.1
// with the standard stowage rate C = 1,39 m³/t (9,82/C = 7,07 kN/m² per metre):
//   weather deck aft of 0,12L, beams/longs:  h1 = 1,2 + 2,04E (min) or 0,14·p_a + 2,04E
//   cargo deck, standard loads:              h2 = H_td (tween height);  specified: h2 = C·p_a/9,82
//   machinery / workshop / stores: 2,6 m;  ship stores: 2,0 m;  accommodation: h3 = 1,2 m
//   E = (0,0914 + 0,003L)/(D − T) − 0,15, 0 ≤ E ≤ 0,147
function _E_platform(p) {
  if (!(p.D > p.T)) return 0;
  const E = (0.0914 + 0.003 * p.L) / (p.D - p.T) - 0.15;
  return Math.max(0, Math.min(0.147, E));
}
function _deckLoadFor(position) {
  return (window.SectionAdapter && SectionAdapter.deckLoadFor) ? SectionAdapter.deckLoadFor(position) : null;
}
// Weather-deck head h1 (m) for the strength deck longitudinals, Table 3.5.1 (a)/(b)
function _weatherHead_h1(p, position) {
  const E = _E_platform(p);
  const hMin = 1.2 + 2.04 * E;
  const dl = _deckLoadFor(position || 'upperDeck');
  if (dl && dl.p > 0 && (dl.type === 'cargo' || dl.type === 'custom' || dl.type === 'vehicles')) {
    return { h1: Math.max(hMin, 0.14 * dl.p + 2.04 * E), E, src: `specified p_a=${dl.p} kN/m² → 0,14·p_a+2,04E`, pa: dl.p };
  }
  return { h1: hMin, E, src: 'general cargo minimum 1,2+2,04E', pa: null };
}
// Cargo / accommodation deck head (m) for Table 1.4.4, from the panel's deck load
function _lowerDeckHead(p, position, deckZ_mm) {
  const dl = _deckLoadFor(position);
  const udZ = (window.Draw && window.Draw.GEOMETRY) ? window.Draw.GEOMETRY.UD : null;
  const Htd = (udZ != null && deckZ_mm != null && udZ > deckZ_mm) ? Math.max(0.5, (udZ - deckZ_mm) / 1000) : null;
  const std = { h: Htd != null ? Htd : 2.0, src: Htd != null ? `standard loads, h₂ = H_td = ${Htd.toFixed(2)} m` : 'default 2,0 m (H_td unknown)', p: Htd != null ? 7.07 * Htd : null };
  if (!dl || !dl.type || dl.type === 'none' || dl.type === 'weather') return std;
  switch (dl.type) {
    case 'cargo': case 'custom': case 'vehicles':
      if (dl.p > 0) return { h: 1.39 * dl.p / 9.82, src: `specified p_a=${dl.p} kN/m² → C·p_a/9,82 (C=1,39)`, p: dl.p };
      return std;
    case 'machinery': return { h: 2.6, src: 'machinery space / workshop 18,37 kN/m²', p: 18.37 };
    case 'stores': return { h: 2.0, src: 'ship stores 14,14 kN/m²', p: 14.14 };
    case 'accommodation': return { h: 1.2, src: 'accommodation 8,5 kN/m²', p: 8.5 };
  }
  return std;
}
window._weatherHead_h1 = _weatherHead_h1; window._lowerDeckHead = _lowerDeckHead;

// ---------- Tablo 1.4.1 — Upper deck plating (strength/weather) ----------
function calcUpperDeckPlate() {
  // Resolve this plate's effective material family (pin → Setup zone → global)
  // and run the actual calc inside a withLocalFamily wrapper so getParams()
  // picks up the right k / kL automatically. Same pattern is applied to all
  // whole-plate calcs (side girder, duct, stringer, tween, coamingTop).
  const fam = (typeof resolveWholePlateFamily === 'function')
              ? resolveWholePlateFamily('upperDeck') : null;
  const famKey = fam ? (fam === 'MS' ? 'Mild' : 'HT') : null;
  return withLocalFamily(famKey, () => _calcUpperDeckPlate_core());
}
function _calcUpperDeckPlate_core() {
  const p = getParams();
  const s = realLongSpacing('upperDeck', { inputId: 'deckLongSpacing', coord: 'y' });
  const t_ud = parseFloat(document.getElementById('deckT').value);
  const loc = document.getElementById('udLocation').value;
  const framing = document.getElementById('udFraming').value;
  const S_primary = 3.0;  // assumed transverse spacing (m), default project value
  
  const L1v = _L1(p.L);
  const s1v = _s1(s, p.L);
  const f = _f(s, S_primary);
  const f1 = _f1(s, S_primary);
  const FD = p.FD || 1.0;
  
  let t_req, formula, gov;
  if (loc === 'outside_openings') {
    if (framing === 'longitudinal') {
      const t_a = 0.001 * s1v * (0.059 * L1v + 7) * Math.sqrt(FD / p.kL);
      const t_b = 0.00083 * s1v * Math.sqrt(p.L * p.k) + 2.5;
      t_req = Math.max(t_a, t_b);
      formula = `max[0.001·s₁·(0.059·L₁+7)·√(F_D/k_L)=${t_a.toFixed(2)}, 0.00083·s₁·√(L·k)+2.5=${t_b.toFixed(2)}]`;
      gov = t_a >= t_b ? '(a)' : '(b)';
    } else {
      const t_a = 0.001 * s1v * f1 * (0.083 * L1v + 10) * Math.sqrt(FD / p.kL);
      const t_b = 0.001 * s1v * Math.sqrt(p.L * p.k) + 2.5;
      t_req = Math.max(t_a, t_b);
      formula = `max[0.001·s₁·f₁·(0.083·L₁+10)·√(F_D/k_L)=${t_a.toFixed(2)}, 0.001·s₁·√(L·k)+2.5=${t_b.toFixed(2)}]`;
      gov = t_a >= t_b ? '(a)' : '(b)';
    }
  } else {
    // inside openings
    const plus = framing === 'longitudinal' ? 2.5 : 1.5;
    const t_calc = 0.00083 * s1v * Math.sqrt(p.L * p.k) + plus;
    t_req = Math.max(t_calc, 6.5);
    formula = `0.00083·s₁·√(L·k) + ${plus} = ${t_calc.toFixed(2)} (min 6.5)`;
    gov = t_calc >= 6.5 ? 'formula' : 'min';
  }
  
  return {
    t_ud, t_req, formula, gov,
    s1: s1v, L1: L1v, f, f1,
    loc, framing,
    passFail: t_ud >= t_req
  };
}

// ---------- Tablo 1.4.3 — Upper deck long (strength/weather) ----------
function calcUpperDeckLong() {
  const p = getParams();
  // Real long spacing from drawing (UD profile array max-gap). Falls back
  // to form input if profile array is empty.
  let s;
  if (typeof realLongSpacing === 'function') {
    s = realLongSpacing('upperDeck', {
      coord: 'y',
      inputId: 'deckLongSpacing',
      defaultFallback: 700,
      extraSupports: (typeof getPlateSupports === 'function')
                     ? getPlateSupports('upperDeck') : []
    });
  } else {
    s = parseFloat(document.getElementById('deckLongSpacing').value);
  }
  const loc = document.getElementById('udLocation').value;
  const le = p.le;  // effective span (use bottom long le as proxy)
  
  const L1v = _L1(p.L);
  const L2v = _L2(p.L);
  const hT1 = _hT1(p.L, 'B');  // assume Type B
  const FD = p.FD || 1.0;
  const F1 = _F1_deck(FD);
  const le_eff = Math.max(le, 1.5);
  
  let Z_req, formula;
  if (loc === 'outside_openings') {
    // Table 1.4.3 (1)(a): Z = 0.043·s·k·h_T1·l_e²·F₁
    Z_req = 0.043 * s * p.k * hT1 * le_eff * le_eff * F1;
    formula = `0.043·s·k·h_T1·l_e²·F₁ (h_T1=${hT1.toFixed(3)}, F₁=${F1.toFixed(4)})`;
  } else if (loc === 'tank_crown') {
    // Table 1.4.3 (2) — In way of the crown or bottom of a tank:
    //   Z = 0.0113·ρ·s·k·h_4·l_e² / b
    //   b = 1.4 rolled/built; 1.6 flat bars
    //   OR Z from (1)(a) or (1)(b) (whichever greater) — take the greater.
    const h4 = parseFloat(document.getElementById('udTankH')?.value) || 2.5;
    const rho = 1.025;
    const profUD = _safePARAMS('profTypeDeck');
    const b_ud = (profUD === 'FB') ? 1.6 : 1.4;
    const Z_tank = 0.0113 * rho * s * p.k * h4 * le_eff * le_eff / b_ud;
    // Also evaluate (1)(a) as baseline
    const Z_1a = 0.043 * s * p.k * hT1 * le_eff * le_eff * F1;
    Z_req = Math.max(Z_tank, Z_1a);
    formula = `max[0.0113·ρ·s·k·h₄·l_e²/b=${Z_tank.toFixed(1)} (1.4.3(2), h₄=${h4.toFixed(2)}m, b=${b_ud}), Z_1a=${Z_1a.toFixed(1)}]`;
  } else {
    // Table 1.4.3 (1)(b): Z = s·k·(400·h₁ + 0.005·(l_e·L₂)²)·10⁻⁴
    // h₁ = weather head from Pt 3 Ch 3 Table 3.5.1 (aft of 0,12L): 1,2+2,04E,
    // or 0,14·p_a+2,04E when the deck panel carries a specified load.
    const wh = _weatherHead_h1(p, 'upperDeck');
    const h1 = wh.h1;
    Z_req = s * p.k * (400 * h1 + 0.005 * Math.pow(le_eff * L2v, 2)) * 1e-4;
    formula = `s·k·(400·h₁+0.005·(l_e·L₂)²)·10⁻⁴ (h₁=${h1.toFixed(2)} m [Pt 3 Ch 3 Table 3.5.1: ${wh.src}, E=${wh.E.toFixed(3)}], L₂=${L2v})`;
  }
  
  return {
    Z_req, formula, hT1, F1, le: le_eff, loc, s,
    inputs: [
      { label:'s (mm)', value: s.toFixed(0) },
      { label:'l_e (m)', value: le_eff.toFixed(2) },
      { label:'k (material)', value: p.k },
      { label:'h_T1 (m)', value: hT1.toFixed(3) },
      { label:'F₁', value: F1.toFixed(4) },
      { label:'Location', value: loc }
    ]
  };
}

// ---------- Tablo 1.4.2 / 1.9.1 — Lower deck plating (Stringer / Tween) ----------
function calcLowerDeckPlate(prefix) {
  // Resolve effective family for this whole plate, then run calc under it.
  const key = prefix === 'str' ? 'stringer' : 'tween';
  const fam = (typeof resolveWholePlateFamily === 'function')
              ? resolveWholePlateFamily(key) : null;
  const famKey = fam ? (fam === 'MS' ? 'Mild' : 'HT') : null;
  return withLocalFamily(famKey, () => _calcLowerDeckPlate_core(prefix));
}
function _calcLowerDeckPlate_core(prefix) {
  const p = getParams();
  // Real max spacing between adjacent stiffeners. `prefix` is 'str' for
  // stringer or 'twn' for tween; the profile group and form-input id differ.
  const groupName = prefix === 'str' ? 'stringerStiff' : 'tweenStiff';
  const inputId = prefix + 'DeckSpacing';
  const s = realLongSpacing(groupName, { inputId, coord: 'y' });
  const t_as = parseFloat(document.getElementById(prefix + 'DeckT').value);
  const deckType = document.getElementById(prefix + 'DeckType').value;
  const fn = document.getElementById(prefix + 'DeckFunction').value;
  
  const s1v = _s1(s, p.L);
  
  let t_req, formula, gov;
  
  if (fn === 'non_wt_same_tank') {
    // Non-WT stringer — no Δp. Plate sized by structural minimum:
    //   Table 1.4.2 third/platform: t = 0.010·s₁·√k, min 6.5 mm
    //   Table 1.4.8 (non-WT pillar bulkhead, 'tween category): min 6.5 mm (L≥90)
    // t = max(Table 1.4.2 formula, Table 1.4.8 min).
    // Ref: Python baltic_laker_decks.py, stringer_deck_plate().
    const t_142 = Math.max(0.010 * s1v * Math.sqrt(p.k), 6.5);
    const t_148 = p.L >= 90 ? 6.5 : 5.5;  // 'tween category
    t_req = Math.max(t_142, t_148);
    gov = t_142 >= t_148 ? 'Table 1.4.2' : 'Table 1.4.8 (non-WT \'tween min)';
    formula = `max(0.010·s₁·√k [1.4.2, min 6.5], non-WT min [1.4.8, ${t_148}mm]) — no Δp`;
  } else if (fn === 'deep_tank_crown') {
    // Deep tank TOP (crown plate) — tank below, cargo/void above.
    // LR Table 1.9.1 (1): t = 0.004·s·f·√(ρ·h₄·k/1.025) + 2.5, min 7.5 (L≥90) or 6.5.
    // (k inside the sqrt per Rule text; affects HT steel correctly.)
    // h₄ from LR Tablo 1.9.1 footnote (b): max(z_TT−z_ref, (z_OF−z_ref)/2, 0.5)
    const level_m = parseFloat(document.getElementById(prefix + 'DeckLevel').value) / 1000;
    const tank_top_m = p.ttLevel / 1000;
    const tankComp = _findTankComp();
    const airpipe_m = _resolveAirpipeTop_m(tankComp, p.ttLevel + 760);
    const lr = _LR_h4(level_m * 1000, tank_top_m * 1000, airpipe_m * 1000);
    const h4 = lr.h4;
    const rho = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
    // f = 1,1 − s/(2500·S); S = primary-member (web frame) spacing, in metres
    const f = _f(s, p.le_global || p.le);
    const t_calc = 0.004 * s * f * Math.sqrt(rho * h4 * p.k / 1.025) + 2.5;
    const t_min = p.L >= 90 ? 7.5 : 6.5;
    t_req = Math.max(t_calc, t_min);
    gov = t_calc >= t_min ? 'formula' : `min ${t_min}`;
    formula = `0.004·s·f·√(ρ·h₄·k/1.025)+2.5 [Tablo 1.9.1 crown, h₄=${h4.toFixed(2)}m (gov: ${lr.governs}, airpipe ${airpipe_m.toFixed(2)}m), min ${t_min}]`;
  } else if (fn === 'deep_tank') {
    // LR Table 1.9.1 (1) Deep Tank plating
    // t = 0.004·s·f·√(ρ·h₄·k/1.025) + 2.5 mm, min 7.5 (L≥90) or 6.5 (L<90)
    // h_4 = max(z_TT − z_ref, (z_OF − z_ref)/2, 0.5) per LR Tablo 1.9.1 (b).
    const level_m = parseFloat(document.getElementById(prefix + 'DeckLevel').value) / 1000;
    const tank_top_m = p.ttLevel / 1000;
    const tankComp = _findTankComp();
    const airpipe_m = _resolveAirpipeTop_m(tankComp, p.ttLevel + 760);
    const lr = _LR_h4(level_m * 1000, tank_top_m * 1000, airpipe_m * 1000);
    const h4 = lr.h4;
    const rho = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
    // f = 1,1 − s/(2500·S); S = primary-member (web frame) spacing, in metres
    const f = _f(s, p.le_global || p.le);
    const t_calc = 0.004 * s * f * Math.sqrt(rho * h4 * p.k / 1.025) + 2.5;
    const t_min = p.L >= 90 ? 7.5 : 6.5;
    t_req = Math.max(t_calc, t_min);
    gov = t_calc >= t_min ? 'formula' : `min ${t_min}`;
    formula = `0.004·s·f·√(ρ·h₄·k/1.025)+2.5 [Tablo 1.9.1, h₄=${h4.toFixed(2)}m (gov: ${lr.governs}, airpipe ${airpipe_m.toFixed(2)}m), min ${t_min}]`;
  } else if (fn === 'void') {
    // Void — no load, use Table 1.4.8 non-WT bulkhead minimum (or Pt 3 Ch 3 platform min)
    t_req = p.L >= 90 ? 6.5 : 5.5;
    gov = 'void minimum';
    formula = `Void space — Table 1.4.8 min: ${t_req} mm (L${p.L >= 90 ? '≥' : '<'}90)`;
  } else {
    // Table 1.4.2 lower deck plating
    const coeff = deckType === 'second' ? 0.012 : 0.010;
    const t_calc = coeff * s1v * Math.sqrt(p.k);
    t_req = Math.max(t_calc, 6.5);
    gov = t_calc >= 6.5 ? 'formula' : 'min 6.5';
    formula = `${coeff}·s₁·√k [Table 1.4.2 ${deckType}]`;
    // Table 1.4.2 Note: a deck loading above 43,2 kN/m² is specially considered.
    const _dlp = _deckLoadFor(prefix === 'str' ? 'stringer' : 'tweenDeck');
    if (_dlp && _dlp.p > 43.2) formula += ` — deck load ${_dlp.p} kN/m² > 43,2: plating to be specially considered (Table 1.4.2 Note)`;
  }
  
  return { t_as, t_req, formula, gov, s1: s1v, deckType, fn, passFail: t_as >= t_req };
}

// ---------- Pt 3 Ch 11 — Hatch Coaming Longitudinal Stiffener ----------
// The coaming top & vertical coaming longs are exposed to weather loading.
// LR Pt 3 Ch 11 ties coaming stiffener scantlings to the UD long formulae
// using a nominal weather head h = 2.5 m (Pt 3 Ch 11 Sec 2):
//   Z_req = 0.043·s·k·h·l_e²·F₁   [cm³]
// where F₁ comes from Pt 4 Ch 1 Table 1.6.1 (same as UD, F_D driven).
// Returns { Z_req, formula, h } for use by _zReqForStiff and the inspector.
function calcCoamingStiff() {
  const p = getParams();
  // Real spacing from drawing's coamingStiff profiles (max-gap). Coaming
  // stiffeners run along the coaming top, so we use 'y' coordinate. If
  // there's only one profile (or none), fall back to form input.
  let s;
  if (typeof realLongSpacing === 'function') {
    s = realLongSpacing('coamingStiff', {
      coord: 'y',
      inputId: 'coamingLongSpacing',
      defaultFallback: 600
    });
  } else {
    const sEl = document.getElementById('coamingLongSpacing');
    s = sEl ? (parseFloat(sEl.value) || 600) : 600;  // typical 500-700 mm
  }
  const h  = 2.5;                    // weather head on coaming (Pt 3 Ch 11)
  const le_eff = Math.max(p.le, 1.5);
  const FD = p.FD || 1.0;
  const F1 = _F1_deck(FD);
  const Z_req = 0.043 * s * p.k * h * le_eff * le_eff * F1;
  return {
    Z_req,
    formula: `0.043·s·k·h·l_e²·F₁ (h=${h} m, F₁=${F1.toFixed(4)})`,
    h, F1, s, le: le_eff,
    inputs: [
      { label:'s (mm)', value: s.toFixed(0) },
      { label:'l_e (m)', value: le_eff.toFixed(2) },
      { label:'k (material)', value: p.k },
      { label:'h (m)', value: h.toFixed(2) },
      { label:'F₁', value: F1.toFixed(4) }
    ]
  };
}
window.calcCoamingStiff = calcCoamingStiff;

// ---------- Tablo 1.4.4 / 1.9.1 — Lower deck long (cargo / accommodation / deep tank / void) ----------
function calcLowerDeckLong(prefix) {
  const p = getParams();
  // Real spacing from the live profile array (stringerStiff or tweenStiff).
  // Falls back to form input if profile array is empty.
  const groupKey = (prefix === 'str') ? 'stringerStiff' : 'tweenStiff';
  let s;
  if (typeof realLongSpacing === 'function') {
    s = realLongSpacing(groupKey, {
      coord: 'y',
      inputId: prefix + 'DeckSpacing',
      defaultFallback: 700
    });
  } else {
    s = parseFloat(document.getElementById(prefix + 'DeckSpacing').value);
  }
  const fn = document.getElementById(prefix + 'DeckFunction').value;
  const le = p.le;
  
  const L1v = _L1(p.L);
  const le_eff = Math.max(le, 1.5);
  
  // Heads — Pt 3 Ch 3 Table 3.5.1 via the deck load on the section-model panel;
  // standard cargo loads → h₂ = H_td (tween height up to the deck above).
  const _deckZ = parseFloat((document.getElementById(prefix + 'DeckLevel') || {}).value);
  const _pos = (prefix === 'str') ? 'stringer' : 'tweenDeck';
  const _hd = _lowerDeckHead(p, _pos, isFinite(_deckZ) ? _deckZ : null);
  const h2 = _hd.h;   // cargo head
  const h3 = 1.2;     // accommodation head, Table 3.5.1 (8,5 kN/m²)
  
  let Z_req, formula;
  
  if (fn === 'non_wt_same_tank') {
    // Non-watertight stringer — both sides of plate open to the SAME tank.
    // Same fluid level on both sides → Δp = 0 → no hydrostatic load.
    // Only structural minimum (Table 1.4.8: min depth 100 mm, max spacing 1500 mm,
    // slenderness d_w/t ≤ 60·√k_L). No Z_req formula.
    // Ref: Python baltic_laker_decks.py, stringer_deck_longitudinal().
    Z_req = 0;
    formula = `Non-WT (both sides same tank) — no hydrostatic Δp. Structural minimum only (Table 1.4.8).`;
  } else if (fn === 'deep_tank_crown') {
    // Deep tank TOP (crown plate) — tank below, cargo/void above.
    // LR Table 1.4.4 (3): Z = 0.0113·ρ·s·k·h₄·l_e² / γ
    //   γ = 1.4 for rolled/built sections, 1.6 for flat bars
    // h_4 from LR Tablo 1.9.1 (d): max(z_TT−z_mid, (z_OF−z_mid)/2, 0.5)
    const level_m = parseFloat(document.getElementById(prefix + 'DeckLevel').value) / 1000;
    const tank_top_m = p.ttLevel / 1000;
    const tankComp = _findTankComp();
    const airpipe_m = _resolveAirpipeTop_m(tankComp, p.ttLevel + 760);
    const lr = _LR_h4(level_m * 1000, tank_top_m * 1000, airpipe_m * 1000);
    const h4 = lr.h4;
    const rho = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
    const profType = _safePARAMS('profType' + (prefix === 'str' ? 'Stringer' : 'Tween'));
    const gamma_deck = (profType === 'FB') ? 1.6 : 1.4;
    Z_req = 0.0113 * rho * s * p.k * h4 * le_eff * le_eff / gamma_deck;
    formula = `0.0113·ρ·s·k·h₄·l_e²/γ [Tablo 1.4.4 (3), h₄=${h4.toFixed(2)}m (gov: ${lr.governs}, airpipe ${airpipe_m.toFixed(2)}m), γ=${gamma_deck}]`;
  } else if (fn === 'deep_tank') {
    // Stringer deck INSIDE a deep tank (acts like a bulkhead stringer).
    // LR Table 1.9.1 (2): Z = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2))
    // γ = 1.4 (rolled/built), ω₁ = ω₂ = 1.0 (standard bracketed) → denom = 22·1.4·4
    // h_4 from LR Tablo 1.9.1 (d): max(z_TT−z_mid, (z_OF−z_mid)/2, 0.5)
    const level_m = parseFloat(document.getElementById(prefix + 'DeckLevel').value) / 1000;
    const tank_top_m = p.ttLevel / 1000;
    const tankComp = _findTankComp();
    const airpipe_m = _resolveAirpipeTop_m(tankComp, p.ttLevel + 760);
    const lr = _LR_h4(level_m * 1000, tank_top_m * 1000, airpipe_m * 1000);
    const h4 = lr.h4;
    const rho = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
    const profType = _safePARAMS('profType' + (prefix === 'str' ? 'Stringer' : 'Tween'));
    const gamma_bulk = (profType === 'FB') ? 1.6 : 1.4;
    Z_req = rho * s * p.k * h4 * le_eff * le_eff / (22 * gamma_bulk * 4.0);
    formula = `ρ·s·k·h₄·l_e²/(22·γ·(ω₁+ω₂+2)) [Tablo 1.9.1 (2), h₄=${h4.toFixed(2)}m (gov: ${lr.governs}, airpipe ${airpipe_m.toFixed(2)}m), γ=${gamma_bulk}]`;
  } else if (fn === 'void') {
    // Void — no cargo/tank load. Sec 9 non-WT min (Table 1.4.8) or Pt 3 Ch 3.
    // Minimum stiffener requirement; use a nominal small Z so profile filter passes.
    Z_req = 30;  // placeholder min Z — no design load
    formula = `Void — no load (minimum stiffening per Sec 9/Table 1.4.8)`;
  } else if (fn === 'cargo') {
    if (p.L >= 90) {
      Z_req = s * p.k * (5.9 * L1v + 25 * h2 * le_eff * le_eff) * 1e-4;
      formula = `s·k·(5.9·L₁+25·h₂·l_e²)·10⁻⁴ [Table 1.4.4 1(a), h₂=${h2.toFixed(2)} m — ${_hd.src}]`;
    } else {
      Z_req = 0.005 * s * p.k * h2 * le_eff * le_eff;
      formula = `0.005·s·k·h₂·l_e² [Table 1.4.4 1(b), L<90, h₂=${h2.toFixed(2)} m — ${_hd.src}]`;
    }
  } else if (fn === 'accommodation') {
    let Z_calc;
    if (p.L >= 90) {
      Z_calc = s * p.k * (5.1 * L1v + 25 * h3 * le_eff * le_eff) * 1e-4;
      formula = `s·k·(5.1·L₁+25·h₃·l_e²)·10⁻⁴ [Table 1.4.4 2(a), h₃=${h3} m (Table 3.5.1 accommodation)]`;
    } else {
      Z_calc = 0.00425 * s * p.k * h3 * le_eff * le_eff;
      formula = `0.00425·s·k·h₃·l_e² [Table 1.4.4 2(b), L<90]`;
    }
    const hT1 = _hT1(p.L, 'B');
    const F1 = _F1_deck(p.FD || 1.0);
    const Z_cap = 0.043 * s * p.k * hT1 * le_eff * le_eff * F1;
    Z_req = Math.min(Z_calc, Z_cap);
    if (Z_calc > Z_cap) formula += ` (capped by Table 1.4.3 1(a) = ${Z_cap.toFixed(1)})`;
  } else {
    // platform — use cargo as default
    Z_req = s * p.k * (5.9 * L1v + 25 * h2 * le_eff * le_eff) * 1e-4;
    formula = `s·k·(5.9·L₁+25·h₂·l_e²)·10⁻⁴ [platform → as cargo, h₂=${h2.toFixed(2)} m — ${_hd.src}]`;
  }
  
  return {
    Z_req, formula, le: le_eff, fn, s,
    inputs: [
      { label:'s (mm)', value: s.toFixed(0) },
      { label:'l_e (m)', value: le_eff.toFixed(2) },
      { label:'k (material)', value: p.k },
      { label:'Function', value: fn }
    ]
  };
}


// Core Z values per side group (profile-agnostic)
function calcSideGroupsBase() {
  const longs = calcSideLong();
  const strakes = calcSidePlate();
  const groups = {
    G1: { longs: [1,2,3], desc:'Alt (bilge üstü)' },
    G2: { longs: [4,5,6,7], desc:'Alt-orta' },
    G3: { longs: [8,9,10,11], desc:'Orta' },
    G4: { longs: [12,13,14,15], desc:'Üst (Strake 5)' },
    G5: { longs: [16,17,18], desc:'Void' }
  };
  Object.keys(groups).forEach(k => {
    const g = groups[k];
    const items = longs.filter(l => g.longs.includes(l.n));
    g.Z_max = Math.max(...items.map(i => i.Z_req));
    g.s_max = Math.max(...items.map(i => i.s));
    const strakeNums = [...new Set(items.map(i => i.strake))];
    g.t_plate = Math.max(...strakeNums.map(n => strakes.find(s=>s.n===n)?.t_sy || 14));
    g.count = g.longs.length;
  });
  return groups;
}

// Core Z values per inner side group (profile-agnostic)
function calcInnerSideGroupsBase() {
  const p = getParams();
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  // IB and tank-top levels — read from current state, not hardcoded.
  const IB_mm = G.IB || p.ibLevel || 1800;
  const TT_mm = (G.TT != null ? G.TT : (p.ttLevel || G.UD || 12900));   // tank top = tween deck, or UD without one
  // Find representative tank compartment outboard of IS (rho + airpipe).
  let tankComp = null;
  try {
    const IS_Y = G.IS || 10030;
    tankComp = window.getCompartmentAt?.(IS_Y + 50, (IB_mm + TT_mm) / 2) || null;
    if (tankComp && !(tankComp.type === 'ballast' || tankComp.type === 'fuel' || tankComp.type === 'freshwater')) {
      tankComp = null;
    }
  } catch (_) { tankComp = null; }
  const rho = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
  const airpipe_mm = _resolveAirpipeTop_m(tankComp, TT_mm + 760) * 1000;
  // Innerside long spacing — try STRAKES, else default 650.
  let s_is = 650;
  const ISstrakes = window.Draw?.STRAKES?.innerSide;
  if (ISstrakes && ISstrakes.length > 0 && ISstrakes[0].spacing_mm) s_is = ISstrakes[0].spacing_mm;
  const innerLongs = [];
  let z = IB_mm;
  while (z + s_is < TT_mm) { z += s_is; innerLongs.push(z); }
  const longResults = innerLongs.map((zmm, i) => {
    // LR Tablo 1.9.1 (d): h₄ = max(z_TT−z_mid, (z_OF−z_mid)/2, 0.5)
    const lr = _LR_h4(zmm, TT_mm, airpipe_mm);
    // LR Table 1.9.1 (2) Deep Tank: Z = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2))
    // γ = 1.4 (rolled/built); ω₁ = ω₂ = 1.0 (both bracketed) → denom = 4.0
    const Z_req = rho * s_is * p.k * lr.h4 * Math.pow(p.le,2) / (22 * 1.4 * 4.0);
    return { n: i+1, z: zmm, Z: Z_req };
  });
  const n_total = longResults.length;
  const groupSize = Math.ceil(n_total / 4);
  const groups = {};
  for (let g = 0; g < 4; g++) {
    const items = longResults.slice(g*groupSize, (g+1)*groupSize);
    if (items.length === 0) continue;
    const key = 'IS-G' + (g+1);
    groups[key] = {
      z_range: `${items[0].z}–${items[items.length-1].z}`,
      count: items.length,
      Z_max: Math.max(...items.map(i => i.Z)),
      s_is
    };
  }
  return groups;
}


// =========================================================================
// realLongSpacing(group, options)
// -------------------------------------------------------------------------
// Returns the effective longitudinal spacing (mm) used in LR plate scantling
// formulas for a given group of stiffeners.
//
// LR Pt 4 Ch 1 Table 1.5 / 1.6 / 1.9 plate formulas use `s` = stiffener
// spacing. When profiles are laid out unevenly, the governing spacing for
// plate thickness is the LARGEST gap between adjacent profiles — because
// the plate panel between the two widest-apart longitudinals is the one
// that carries the most pressure per unit width.
//
// Behaviour:
//   - If the group has ≥ 2 profiles: returns MAX gap between sorted
//     neighbours (along the group's coordinate axis).
//   - If the group has 0 or 1 profiles: falls back to the form input
//     (inputId). A lone profile has no "spacing to a neighbour".
//   - If no form input (or invalid): falls back to `defaultFallback` (700).
//
// opts = {
//   inputId: 'bottomLongSpacing',   // scantling form input to use as fallback
//   coord:   'y',                   // which axis to measure (y for bottom/IB,
//                                   //    z for side/IS, y for decks, y for coaming)
//   defaultFallback: 700,           // final fallback if everything else fails
//   trace: false,                   // optional: also return {n, sorted, gaps}
// }
// =========================================================================
function realLongSpacing(group, opts) {
  opts = opts || {};
  // Local override (set by withLocalSpacing wrapper, used by per-stiff Z calc).
  // When active, ALL realLongSpacing calls within fn() return the override —
  // this is the right behaviour because a single stiff's Z is calculated by
  // exactly one calc*() chain and we want that chain's `s` to be the stiff's
  // own tributary width.
  if (_S_OVERRIDE_MM != null) {
    if (opts.trace) {
      return { value: _S_OVERRIDE_MM, n: -1, reason: 'local-spacing-override' };
    }
    return _S_OVERRIDE_MM;
  }
  const coord = opts.coord || 'y';
  const inputId = opts.inputId || null;
  const fallback = opts.defaultFallback || 700;
  // Optional boundary positions — off by default. When passed as
  // {bounds: [lo, hi]}, the list used to compute max-gap becomes
  // [lo, ...profile coords, hi]. Only use this when the plate panel
  // truly extends to a rigid boundary (e.g. a decked bulkhead, a
  // transverse web, or the keel centreline). For most cases leave
  // bounds unset — the plain "max gap between profiles" captures the
  // governing panel width.
  const bounds = Array.isArray(opts.bounds) ? opts.bounds.slice() : null;
  // Extra intermediate supports — e.g. side girders on bottom/IB plates.
  // These act like "longitudinal stiffeners" structurally: they carry the
  // adjacent plate panel the same way a HP profile does, so they must be
  // included when computing the max-gap between consecutive supports.
  // Without this, a 3000–4400 "gap" in bottom profiles (which actually has
  // a side girder at y=3700 bridging it) would look like a 1400-mm panel
  // and demand absurdly thick plate. With extraSupports = [3700, 6500, ...]
  // it correctly becomes two ~700-mm panels.
  const extraSupports = Array.isArray(opts.extraSupports) ? opts.extraSupports : [];
  // Profile arrays live on window.Draw.profiles (and the local `profiles` var
  // inside the Draw module — but callers run outside it and use the window
  // reference).
  const profArr = (window.Draw && window.Draw.profiles && window.Draw.profiles[group])
                || (typeof profiles !== 'undefined' && profiles[group])
                || null;
  // Read form-input fallback once
  const formEl = inputId ? document.getElementById(inputId) : null;
  const formVal = formEl ? parseFloat(formEl.value) : NaN;
  const formSpacing = (isFinite(formVal) && formVal > 0) ? formVal : fallback;
  if (!profArr || !Array.isArray(profArr) || profArr.length < 2) {
    if (opts.trace) return { value: formSpacing, n: profArr ? profArr.length : 0, reason: 'form-fallback' };
    return formSpacing;
  }

  // Sort by coord, compute gaps
  let coords = profArr.map(p => p[coord] || 0);
  // Side girders, decks, and other intermediate supports count as longitudinals
  // for max-gap computation — a side girder at y=3700 between profiles at 3000
  // and 4400 breaks the 1400 mm "gap" into two 700 mm panels.
  extraSupports.forEach(s => {
    if (isFinite(s)) coords.push(+s);
  });
  if (bounds && bounds.length === 2 && isFinite(bounds[0]) && isFinite(bounds[1])) {
    coords.push(bounds[0]);
    coords.push(bounds[1]);
  }
  coords = coords.filter(x => isFinite(x)).sort((a, b) => a - b);
  const uniq = [];
  for (const c of coords) {
    if (uniq.length === 0 || Math.abs(c - uniq[uniq.length - 1]) > 0.5) uniq.push(c);
  }
  if (uniq.length < 2) {
    if (opts.trace) return { value: formSpacing, n: profArr.length, reason: 'degenerate' };
    return formSpacing;
  }

  let maxGap = 0;
  const gaps = [];
  for (let i = 1; i < uniq.length; i++) {
    const gap = uniq[i] - uniq[i-1];
    gaps.push(gap);
    if (gap > maxGap) maxGap = gap;
  }
  if (maxGap <= 0) {
    if (opts.trace) return { value: formSpacing, n: profArr.length, reason: 'zero-gap' };
    return formSpacing;
  }
  if (opts.trace) return {
    value: maxGap, n: profArr.length,
    sorted: uniq.map(v => ({ [coord]: v })),
    gaps, reason: bounds ? 'real-max-with-bounds' : 'real-max'
  };
  return maxGap;
}
window.realLongSpacing = realLongSpacing;

// =========================================================================
// STIFFENER SPACING (mean) — for individual stiffener Z calculations
// -------------------------------------------------------------------------
// Unlike `realLongSpacing` (which returns the MAX gap between supports —
// the panel width that governs PLATE thickness), this helper returns the
// MEAN spacing for one specific stiffener:
//
//        s_mean = (gap_above + gap_below) / 2
//
// This represents the stiffener's "effective load width" — the slice of
// plate area that a stiffener carries, which is what enters its Z formula.
//
// Edge case (first/last stiff in panel): if there's no neighbour on one
// side, we use 2× the gap on the other side as a symmetric estimate, so
// that an interior stiffener and an edge stiffener both get the same s
// in a uniform layout (typical case).
//
// Optionally accepts `extraSupports` (deck levels, side girders, etc.)
// which act as "virtual neighbours" on either side, just like in
// realLongSpacing.
//
// Returns mean spacing in mm for the stiffener at `idx` within `group`.
// =========================================================================
function meanStiffSpacing(group, idx, opts) {
  opts = opts || {};
  const coord = opts.coord || 'y';
  const fallback = opts.defaultFallback || 700;
  const extraSupports = Array.isArray(opts.extraSupports) ? opts.extraSupports : [];
  const profArr = (window.Draw && window.Draw.profiles && window.Draw.profiles[group]) || null;
  if (!profArr || !Array.isArray(profArr) || profArr.length < 1) return fallback;
  const target = profArr[idx];
  if (!target || target[coord] == null) return fallback;
  const targetCoord = +target[coord];
  if (!isFinite(targetCoord)) return fallback;

  // Build sorted, unique list of all neighbour coordinates: own profiles +
  // extra structural supports.
  let coords = profArr.map(p => +p[coord]).filter(c => isFinite(c));
  extraSupports.forEach(s => { if (isFinite(s)) coords.push(+s); });
  coords = coords.sort((a, b) => a - b);
  // Deduplicate (within 0.5 mm)
  const uniq = [];
  for (const c of coords) {
    if (uniq.length === 0 || Math.abs(c - uniq[uniq.length - 1]) > 0.5) uniq.push(c);
  }
  // Find target's position in unique list
  const ix = uniq.findIndex(c => Math.abs(c - targetCoord) < 0.5);
  if (ix < 0) return fallback;

  const hasBelow = ix > 0;
  const hasAbove = ix < uniq.length - 1;
  const gapBelow = hasBelow ? targetCoord - uniq[ix - 1] : null;
  const gapAbove = hasAbove ? uniq[ix + 1] - targetCoord : null;

  if (gapBelow != null && gapAbove != null) {
    // Interior — classic mean: (d_below + d_above) / 2
    return (gapBelow + gapAbove) / 2;
  }
  if (gapBelow != null) return gapBelow;          // edge: same as the only gap
  if (gapAbove != null) return gapAbove;
  return fallback;
}
window.meanStiffSpacing = meanStiffSpacing;

// Returns the array of intermediate structural supports for a plate group.
// These are structures that act like longitudinals for plate-panel sizing
// even though they're not in the `profiles` array:
//   - bottom shell & inner bottom: side girders (from SIDE_GIRDERS) + duct wall
//   - side shell & inner side:     stringer deck + tween deck + upper deck
// Other groups: empty (they rely on profiles alone).
//
// Coordinates are in mm, using the same axis as the group's profile coord
// ('y' for bottom/IB, 'z' for side/IS).
function getPlateSupports(group) {
  const D = window.Draw || {};
  const G = D.GEOMETRY || {};
  const SGs = D.SIDE_GIRDERS || [];
  if (group === 'bottomShell' || group === 'innerBottom') {
    // Side girders sit at fixed y positions; include duct wall too
    const supports = SGs.map(sg => sg.y).filter(y => isFinite(y));
    if (isFinite(G.duct_half) && G.duct_half > 0) supports.push(G.duct_half);
    return supports;
  }
  if (group === 'sideShell' || group === 'innerSide') {
    // Horizontal decks provide vertical support: stringer(s), tween(s), upper deck, IB.
    // Prefer the LIVE profiles arrays (Draw.profiles.stringer / tweenDeck) over
    // form inputs — the form may be out of sync if the user moved decks in the
    // drawing editor. Each stringer/tween level contributes its own support.
    const supports = [];
    try {
      (D.profiles?.stringer || []).forEach(p => {
        if (isFinite(p?.z) && p.z > 0) supports.push(p.z);
      });
      (D.profiles?.tweenDeck || []).forEach(p => {
        if (isFinite(p?.z) && p.z > 0) supports.push(p.z);
      });
    } catch(_) {}
    // Fall back to form inputs ONLY if live arrays are empty
    if (supports.length === 0) {
      const strLvl = parseFloat(document.getElementById('strDeckLevel')?.value);
      const twnLvl = parseFloat(document.getElementById('twnDeckLevel')?.value);
      if (isFinite(strLvl) && strLvl > 0) supports.push(strLvl);
      if (isFinite(twnLvl) && twnLvl > 0) supports.push(twnLvl);
    }
    if (isFinite(G.UD) && G.UD > 0) supports.push(G.UD);
    if (isFinite(G.IB) && G.IB > 0) supports.push(G.IB);  // lower boundary
    return supports;
  }
  return [];
}
window.getPlateSupports = getPlateSupports;


// =========================================================================
// strakeLongSpacing(group, strakeIdx)
// -------------------------------------------------------------------------
// Returns the governing "s" (max gap between longitudinal supports) for a
// SINGLE strake, not the whole plate group. This matches the user's
// requirement that every strake is sized by its own local spacing:
//
//   * Collect profiles + supports whose coord falls INSIDE the strake range
//   * Add the one closest neighbour profile/support on each side of the
//     strake (so cross-boundary gaps are counted)
//   * Sort them and return the max consecutive gap
//
// Returns: { value, range, coords, gaps, reason }
//   value  — max gap (mm)
//   range  — [start, end] strake coord bounds
//   coords — the merged sorted position list used for the computation
//   gaps   — array of consecutive differences
//   reason — 'strake-local' | 'bilge-transverse' | 'degenerate-fallback'
//
// Special cases:
//   * Bilge strake (kind='bilge'): has no longitudinals; supported every
//     transverse frame spacing. Returns s = transFrameSpacing directly.
//   * Empty strake (no profiles/supports): falls back to form input or 700.
// =========================================================================
function strakeLongSpacing(group, strakeIdx) {
  const D = window.Draw || {};
  const S = D.STRAKES || {};
  const G = D.GEOMETRY || {};
  const PA = D.PARAMS || {};

  const arr = S[group];
  if (!Array.isArray(arr) || !arr[strakeIdx]) {
    return { value: 700, range: [0, 0], coords: [], gaps: [], reason: 'no-strake' };
  }
  const strake = arr[strakeIdx];

  // --- Special case: bilge strake — no longitudinals on the arc, supported
  //     every transverse frame. s = transverse frame spacing. If user-added
  //     trans stiffs are in the bilge bracket area, they reduce the support
  //     spacing further (each acts as an extra trans frame).
  if (group === 'shell' && strake.kind === 'bilge') {
    const sT_global = +(PA.transFrameSpacing) || 726;
    let sT = sT_global;
    try {
      if (typeof localTransSpacing === 'function') {
        const sT_local = localTransSpacing('shell', strakeIdx, sT_global);
        if (sT_local > 0 && sT_local < sT) sT = sT_local;
      }
    } catch (_) {}
    return { value: sT, range: [null, null], coords: [], gaps: [sT], reason: 'bilge-transverse' };
  }

  // --- Determine strake's coordinate range along its path ------------------
  // Different groups use different axes:
  //   shell:       path coordinate (cumulative along keel→bottom→bilge→side)
  //                — we use the group's coord axis directly for bottom/side
  //                sections. For mixed shell strakes, we translate via the
  //                shell-path cursor, but profiles also live in sub-arrays
  //                (profiles.bottomShell for bottom, profiles.sideShell for side)
  //                so we actually need group-specific handling.
  //   innerBottom: y, cumulative from duct_half or 0
  //   innerSide:   z, cumulative from IB
  //   upperDeck:   y, cumulative from IS
  //   coamingTop:  y, cumulative from IS
  //
  // To keep the logic clean, each shell strake is mapped to ONE of the
  // per-axis profile arrays:
  //   kind='keel'|'bottom' → profiles.bottomShell, coord 'y'
  //   kind='side'          → profiles.sideShell,   coord 'z'
  //   kind='bilge'         → already handled above

  let coord, profGroupKey, range;
  if (group === 'shell') {
    const k = strake.kind;
    if (k === 'keel' || k === 'bottom') {
      coord = 'y';
      profGroupKey = 'bottomShell';
      // y range: cumulative width of preceding keel/bottom strakes from y=0
      let yStart = 0;
      for (let i = 0; i < strakeIdx; i++) {
        const s = arr[i];
        if (s.kind === 'keel' || s.kind === 'bottom') yStart += s.width;
      }
      range = [yStart, yStart + strake.width];
    } else if (k === 'side') {
      coord = 'z';
      profGroupKey = 'sideShell';
      // z range: cumulative width of preceding side strakes, starting at z = R_B (bilge end)
      let zStart = G.R_B || 1800;
      for (let i = 0; i < strakeIdx; i++) {
        const s = arr[i];
        if (s.kind === 'side') zStart += s.width;
      }
      range = [zStart, zStart + strake.width];
    } else {
      // Unknown kind — fall back to form input
      return { value: 700, range: [0, 0], coords: [], gaps: [], reason: 'unknown-shell-kind' };
    }
  } else if (group === 'innerBottom') {
    coord = 'y';
    profGroupKey = 'innerBottom';
    // y range: cumulative width from duct_half (or 0 if no duct)
    let yStart = +(G.duct_half) || 0;
    for (let i = 0; i < strakeIdx; i++) yStart += arr[i].width;
    range = [yStart, yStart + strake.width];
  } else if (group === 'innerSide') {
    coord = 'z';
    profGroupKey = 'innerSide';
    // z range: cumulative from IB
    let zStart = +(G.IB) || 0;
    for (let i = 0; i < strakeIdx; i++) zStart += arr[i].width;
    range = [zStart, zStart + strake.width];
  } else if (group === 'upperDeck') {
    coord = 'y';
    profGroupKey = 'upperDeck';
    // y range: cumulative from IS (inboard side of upper deck)
    let yStart = +(G.IS) || 0;
    for (let i = 0; i < strakeIdx; i++) yStart += arr[i].width;
    range = [yStart, yStart + strake.width];
  } else if (group === 'coamingTop') {
    coord = 'y';
    profGroupKey = 'coamingStiff';
    // y range: cumulative from IS (inboard) to IS+coamingTop_width
    let yStart = +(G.IS) || 0;
    for (let i = 0; i < strakeIdx; i++) yStart += arr[i].width;
    range = [yStart, yStart + strake.width];
  } else if (group === 'coamingWall') {
    coord = 'z';
    profGroupKey = null;  // no specific longitudinal profiles usually
    // z range: UD to HC (only one strake typically)
    range = [+(G.UD) || 0, +(G.HC) || 0];
  } else if (group === 'stringer' || group === 'tween') {
    coord = 'y';
    profGroupKey = (group === 'stringer') ? 'stringerStiff' : 'tweenStiff';
    // y range: IS → strake extent
    let yStart = +(G.IS) || 0;
    for (let i = 0; i < strakeIdx; i++) yStart += arr[i].width;
    range = [yStart, yStart + strake.width];
  } else {
    return { value: 700, range: [0, 0], coords: [], gaps: [], reason: 'unknown-group' };
  }

  // --- Gather all global positions (profiles + supports) on this axis ------
  const D_prof = (D.profiles || {})[profGroupKey] || [];
  // Map 'shell' + side to sideShell group key for supports
  const supportsSourceGroup = (group === 'shell' && strake.kind === 'side')
      ? 'sideShell'
      : (group === 'shell' ? 'bottomShell' : group);
  const supports = (typeof getPlateSupports === 'function')
      ? getPlateSupports(supportsSourceGroup) || []
      : [];

  // Full sorted global list of positions on this axis.
  // Separate profiles (from D.profiles, unexpected on boundaries) from
  // supports (SG / decks, routinely land ON strake boundaries by design —
  // that's why strakes are split there in the first place).
  const profilePositions = D_prof
      .map(p => p[coord])
      .filter(v => isFinite(v));
  const supportPositions = supports.filter(v => isFinite(v));
  const globalPositions = profilePositions
      .concat(supportPositions)
      .sort((a, b) => a - b);

  // --- Pick positions strictly inside the strake range ---------------------
  // Half-open range: [range[0], range[1]) — profile/support exactly on the
  // lower edge belongs to this strake; one exactly on the upper edge belongs
  // to the NEXT strake.
  //
  // Only PROFILES (not supports) warrant a warning when they sit on a
  // boundary — supports (side girders, decks, duct walls) define those
  // boundaries by construction, so coincidence with strake edges is normal.
  // Half-open range logic. EPS tolerance needs to be generous enough that
  // a support/long sitting ~a few mm inside the boundary is still classified
  // correctly. Using 10mm tolerance (was 0.5mm which was too tight when
  // strake boundaries aren't exact round numbers, e.g. 8593.2 instead of
  // 8590, causing a support at 8590 to be silently dropped from both
  // strakes because it fell in a narrow dead zone).
  const EPS = 10;
  const insideStrake = [];
  for (const p of globalPositions) {
    const onLowerEdge = Math.abs(p - range[0]) < EPS;
    const onUpperEdge = Math.abs(p - range[1]) < EPS;
    const isSupport = supportPositions.some(s => Math.abs(s - p) < EPS);
    if ((onLowerEdge || onUpperEdge) && !isSupport) {
      console.warn(`[strakeLongSpacing] Profile at ${p} lies on strake boundary ` +
                   `(${group}[${strakeIdx}] range=${JSON.stringify(range)}). ` +
                   `This is unusual — profiles shouldn't land on boundaries.`);
    }
    // Half-open: include lower edge, exclude upper edge.
    // Use EPS tolerance so a value EPS mm above range[0] still counts as
    // "inside", and one within EPS of range[1] counts as "outside" (goes to
    // next strake via nearestRight instead).
    if (p >= range[0] - EPS && p < range[1] - EPS) insideStrake.push(p);
  }

  // --- Find one nearest neighbour on each outside side --------------------
  let nearestLeft = null, nearestRight = null;
  for (const p of globalPositions) {
    if (p < range[0] - EPS) nearestLeft = p;   // keep last (biggest that's still left)
  }
  for (const p of globalPositions) {
    if (p > range[1] - EPS) { nearestRight = p; break; }  // first one bigger
  }

  // --- Build the final merged list ----------------------------------------
  const merged = [];
  if (nearestLeft  != null) merged.push(nearestLeft);
  merged.push(...insideStrake);
  if (nearestRight != null) merged.push(nearestRight);

  if (merged.length < 2) {
    // Degenerate — strake has no profiles and no neighbours found.
    // Fall back to form input or 700.
    const fallbackId = {
      'shell':      strake.kind === 'side' ? 'sideLongSpacing' : 'bottomLongSpacing',
      'innerBottom':'ibLongSpacing',
      'innerSide':  'isLongSpacing',
      'upperDeck':  'deckLongSpacing',
      'stringer':   'strDeckSpacing',
      'tween':      'twnDeckSpacing',
      'coamingTop': 'coamingLongSpacing',
    }[group] || null;
    const formVal = fallbackId ? parseFloat(document.getElementById(fallbackId)?.value) : NaN;
    const fb = isFinite(formVal) && formVal > 0 ? formVal : 700;
    return { value: fb, range, coords: merged, gaps: [], reason: 'degenerate-fallback' };
  }

  // --- Max gap -------------------------------------------------------------
  let maxGap = 0;
  const gaps = [];
  for (let i = 1; i < merged.length; i++) {
    const g = merged[i] - merged[i-1];
    gaps.push(g);
    if (g > maxGap) maxGap = g;
  }

  // --- LOCAL TRANSVERSE STIFFENERS (Apr 2026) ------------------------------
  // If user-added trans stiffs cross this strake, they provide a transverse
  // support that reduces the effective panel size. LR plate t formulas use
  // the SHORT panel side as `s`, so when the trans direction becomes shorter
  // than the long-direction max gap, the trans direction governs.
  //
  // Mapping group → plate name used by findCrossingTransStiffs:
  let plateName = group;
  if (group === 'shell') plateName = 'shell';
  else if (group === 'tween') plateName = 'tween';
  else if (group === 'stringer') plateName = 'stringer';
  // Other group names (innerBottom, innerSide, upperDeck, coamingTop) match.
  let s_eff = maxGap;
  let trans_local_mm = null;
  try {
    if (typeof findCrossingTransStiffs === 'function' &&
        typeof localTransSpacing === 'function') {
      const globalTransSp = parseFloat(document.getElementById('transFrameSpacing')?.value) || 700;
      trans_local_mm = localTransSpacing(plateName, strakeIdx, globalTransSp);
      // Only apply when the trans direction is the SMALLER one (panel short side)
      if (trans_local_mm > 0 && trans_local_mm < maxGap) {
        s_eff = trans_local_mm;
      }
    }
  } catch (_) { /* fall back to long-direction max gap */ }

  return { value: s_eff, maxGap_long: maxGap, trans_local_mm,
           range, coords: merged, gaps, reason: 'strake-local' };
}
window.strakeLongSpacing = strakeLongSpacing;



function calcBottomPlate() {
  const p = getParams();
  const Cw = calcCw(p.L);
  const L1 = Math.min(p.L, 190);
  const hT2 = Math.min(p.T + 0.5*Cw, 1.2*p.T);
  // Governing s for the bottom shell: maximum of per-strake s across all
  // keel + bottom strakes (each strake is sized by its own local max gap,
  // but the scantling page shows one t_req — we use the worst strake).
  let s = 700;  // safe default
  if (typeof window.strakeLongSpacing === 'function' && window.Draw?.STRAKES?.shell) {
    const shellArr = window.Draw.STRAKES.shell;
    let maxS = 0;
    for (let i = 0; i < shellArr.length; i++) {
      if (shellArr[i].kind === 'keel' || shellArr[i].kind === 'bottom') {
        const r = window.strakeLongSpacing('shell', i);
        if (r && isFinite(r.value) && r.value > maxS) maxS = r.value;
      }
    }
    if (maxS > 0) s = maxS;
  } else {
    s = realLongSpacing('bottomShell', { inputId: 'bottomLongSpacing', coord: 'y', extraSupports: window.getPlateSupports?.('bottomShell') || [] });
  }
  const s1 = s1Limit(s, p.L);
  const t_a = 0.001 * s1 * (0.043*L1 + 10) * Math.sqrt(p.FB/p.kL);
  const t_b = 0.0052 * s1 * Math.sqrt(hT2*p.k/(1.8-p.FB));
  const t_net = Math.max(t_a, t_b);
  return { t_a, t_b, t_net, t_sy: roundPlate(t_net), gov: t_a >= t_b ? 'a (hull girder)' : 'b (local)', s };
}

// ==================== SIDE SHELL PLATE ====================
// LR Pt 4 Ch 1 Table 1.5.3 — Side shell plating, longitudinal framing
//   (a) Above D/2 from base:     t_ii = 0.0042·s1·√(h_T1·k)                — uses F_D in (i)
//   (b) At upper turn of bilge:  t_ii = 0.0054·s1·√(h_T2·k / (2 − F_B))    — uses F_B in (i)
//   (c) Between bilge and D/2:   t_i  from (b)(i) — F_B;
//                                t_ii  = linear interpolation between (a)(ii) and (b)(ii)
function calcSidePlate() {
  const p = getParams();
  const Cw = calcCw(p.L);
  const L1 = Math.min(p.L, 190);
  const hT1 = Math.min(p.T + Cw, 1.36*p.T);
  const hT2 = Math.min(p.T + 0.5*Cw, 1.2*p.T);

  // Upper turn of bilge — use bilge radius from PARAMS if available, else assume R_B
  const R_B_mm = (typeof window !== 'undefined' && window.Draw && window.Draw.GEOMETRY && window.Draw.GEOMETRY.R_B) 
                 ? window.Draw.GEOMETRY.R_B : 1800;
  const z_bilge_m = R_B_mm / 1000;       // upper turn of bilge
  // Table 1.5.3 splits the longitudinally-framed side shell at "D/2 from base"
  // — plain D. D_2 = min(D, 1,6T) is a Section 6 symbol and is not defined in
  // Section 5 at all, so it must not be used for this boundary.
  const z_mid_m = p.D / 2;               // D/2 from base

  // Real side longs — prefer the live profile array so plate sizing reflects
  // what the user actually laid out (including uneven spacing / deletions).
  // Fall back to the static DEFAULT_SIDE_LONGS only if no live data exists.
  let sideLongsZs = [];
  try {
    const liveSide = (window.Draw && window.Draw.profiles && window.Draw.profiles.sideShell) || null;
    if (liveSide && liveSide.length > 0) {
      sideLongsZs = liveSide.map(l => l.z).filter(z => z != null).sort((a,b) => a-b);
    } else {
      sideLongsZs = DEFAULT_SIDE_LONGS.map(l => l.z);
    }
  } catch (e) {
    sideLongsZs = DEFAULT_SIDE_LONGS.map(l => l.z);
  }
  if (window.__DEBUG_SIDE_PLATE) console.log('[calcSidePlate] sideLongsZs:', sideLongsZs, 'count:', sideLongsZs.length);

  // Strake boundaries — prefer live STRAKES.shell (side strakes only).
  // A shell strake with kind='side' contributes a vertical span to the side
  // plate region. Walk shell strakes from R_B upward to get real boundaries.
  // Falls back to STRAKE_BOUNDARIES (hardcoded legacy list) if none.
  let sideBoundaries = [];
  try {
    const shellArr = (window.Draw && window.Draw.STRAKES && window.Draw.STRAKES.shell) || null;
    if (shellArr && shellArr.length > 0) {
      let z = R_B_mm;
      sideBoundaries.push(z);
      shellArr.forEach(s => {
        if (s.kind === 'side') {
          z += s.width;
          sideBoundaries.push(z);
        }
      });
    }
    if (sideBoundaries.length < 2) {
      sideBoundaries = STRAKE_BOUNDARIES.slice();
    }
  } catch (e) {
    sideBoundaries = STRAKE_BOUNDARIES.slice();
  }

  const strakes = [];
  for (let i = 0; i < sideBoundaries.length - 1; i++) {
    const z1 = sideBoundaries[i];
    const z2 = sideBoundaries[i+1];
    const mid_m = (z1 + z2) / 2 / 1000;

    // Max spacing: includes tank top as ring support for strake 5
    const longs_in = sideLongsZs.filter(z => z > z1 && z < z2);
    let points = [z1, ...longs_in, z2];
    // Strake that crosses the tank-top level: tank-top acts as a ring support
    // so it subdivides the panel. Use the live IB/TT levels if present.
    const G_tt = (window.Draw && window.Draw.GEOMETRY) ? window.Draw.GEOMETRY.TT : 12900;
    if (G_tt != null && z1 < G_tt && z2 > G_tt) points.push(G_tt);
    points.sort((a,b)=>a-b);
    let max_sp = 0;
    for (let j = 1; j < points.length; j++) max_sp = Math.max(max_sp, points[j]-points[j-1]);
    if (window.__DEBUG_SIDE_PLATE) console.log(`[calcSidePlate] strake #${i+1} z1=${z1} z2=${z2} longs_in=[${longs_in.join(',')}] max_sp=${max_sp}`);

    const s1 = s1Limit(max_sp, p.L);
    
    // Region identification
    let region;
    if (mid_m >= z_mid_m)        region = 'a';   // above D/2 from base
    else if (mid_m <= z_bilge_m) region = 'b';   // at/below upper turn of bilge
    else                         region = 'c';   // interpolation zone
    
    // Per-region t_i (hull girder) and t_ii (local pressure)
    let t_i, t_ii;
    if (region === 'a') {
      t_i  = 0.001 * s1 * (0.059*L1 + 7) * Math.sqrt(p.FD/p.kL);
      t_ii = 0.0042 * s1 * Math.sqrt(hT1*p.k);
    } else if (region === 'b') {
      t_i  = 0.001 * s1 * (0.059*L1 + 7) * Math.sqrt(p.FB/p.kL);
      t_ii = 0.0054 * s1 * Math.sqrt(hT2*p.k/(2-p.FB));
    } else { // region 'c' — interpolate t_ii between (a)(ii) and (b)(ii)
      t_i = 0.001 * s1 * (0.059*L1 + 7) * Math.sqrt(p.FB/p.kL);   // (c)(i) = (b)(i)
      const t_ii_a = 0.0042 * s1 * Math.sqrt(hT1*p.k);
      const t_ii_b = 0.0054 * s1 * Math.sqrt(hT2*p.k/(2-p.FB));
      // Linear interpolation: at z_bilge use t_ii_b, at z_mid use t_ii_a
      const frac = (mid_m - z_bilge_m) / (z_mid_m - z_bilge_m);
      t_ii = t_ii_b + frac * (t_ii_a - t_ii_b);
    }
    const t_net = Math.max(t_i, t_ii);
    
    strakes.push({
      n: i+1, z1, z2, H: z2-z1, mid: mid_m, max_sp,
      t_net, t_sy: roundPlate(t_net), gov: t_i >= t_ii ? '(i)' : '(ii)',
      region
    });
  }
  return strakes;
}

// ==================== SIDE LONGITUDINAL BANDING ====================
// The side longitudinals are reported and profiled in five contiguous bands,
// bottom-up. Both calcSideLong() (for the display label) and calcSideGroups()
// (for the profile pick) must agree, so both go through these two helpers —
// they used to carry separate hardcoded ordinal lists covering only 1..18.
function _sideBands(total) {
  const bands = [];
  let cut = 0;
  for (let gi = 0; gi < 5; gi++) {
    // Remainder goes to the lowest bands, so sizes differ by at most 1.
    const size = Math.floor(total / 5) + (gi < (total % 5) ? 1 : 0);
    const band = [];
    for (let j = 0; j < size; j++) band.push(++cut);
    bands.push(band);
  }
  return bands;
}
// 1-based ordinal → band number 1..5.
function _sideBandOf(n, total) {
  const bands = _sideBands(total);
  for (let i = 0; i < 5; i++) if (bands[i].includes(n)) return i + 1;
  return 5;
}

// ==================== SIDE SHELL LONGITUDINAL ====================
function calcSideLong() {
  const p = getParams();
  const Cw = calcCw(p.L);
  const Flambda = calcFlambda(p.L);
  const D2 = Math.min(p.D, 1.6*p.T);
  const hT2 = Math.min(p.T + 0.5*Cw, 1.2*p.T);  // used for (b) base-line check
  // Find tank compartment (outboard of inner side at mid-depth) for airpipe.
  let tankComp_side = null;
  try {
    const G_ = (window.Draw && window.Draw.GEOMETRY) || {};
    const IS_Y_ = G_.IS || 10030;
    const z_mid_ = ((G_.IB || 1800) + (p.ttLevel || 12900)) / 2;
    tankComp_side = window.getCompartmentAt?.(IS_Y_ + 50, z_mid_) || null;
    if (tankComp_side && !(tankComp_side.type === 'ballast' || tankComp_side.type === 'fuel' || tankComp_side.type === 'freshwater')) {
      tankComp_side = null;
    }
  } catch (_) {}
  const rho = (tankComp_side && tankComp_side.rho) ? tankComp_side.rho : 1.025;
  const airpipe_mm_side = _resolveAirpipeTop_m(tankComp_side, p.ttLevel + 760) * 1000;
  const tank_top_m = p.ttLevel/1000;
  
  const results = [];
  const strakes = calcSidePlate();

  // Build the live side-long list. Each entry needs { z, s }.
  //   z = long position (mm above baseline)
  //   s = local spacing (mm) — half-distance to neighbour above + half-distance below
  //
  // Live profiles preferred. If empty, fall back to the static
  // DEFAULT_SIDE_LONGS list so older configs still work.
  //
  // IMPORTANT: stringer & tween deck Z's act as SUPPORTS for the side-shell
  // panel — a side longitudinal does not span across a deck level, the deck
  // itself supports the plate. So we add their Z values to the fence (along
  // with IB and UD bounds) before computing per-long spacing. Without this,
  // a long sitting just above a stringer deck would erroneously use the
  // big gap between itself and the next long above, ignoring that the deck
  // breaks the panel into two shorter spans.
  let liveSideLongs;
  try {
    const arr = (window.Draw && window.Draw.profiles && window.Draw.profiles.sideShell)
                || (typeof profiles !== 'undefined' ? profiles.sideShell : null);
    if (Array.isArray(arr) && arr.length >= 1) {
      const sortedZ = arr.map(p => +p.z).filter(z => isFinite(z)).sort((a, b) => a - b);
      const G = (window.Draw && window.Draw.GEOMETRY) || GEOMETRY || {};
      const z_lo = (G.IB || 1800);
      const z_hi = (G.UD || 15300);
      // Collect deck z's that act as supports
      const fenceSet = new Set([z_lo, z_hi, ...sortedZ]);
      const stringers = (window.Draw?.profiles?.stringer) || [];
      const tweens    = (window.Draw?.profiles?.tweenDeck) || [];
      stringers.forEach(d => { if (d.z != null && isFinite(d.z)) fenceSet.add(d.z); });
      tweens.forEach(d    => { if (d.z != null && isFinite(d.z)) fenceSet.add(d.z); });
      // Also add TT level if defined (some configs use TT marker without
      // an explicit tweenDeck profile entry)
      if (G.TT != null && isFinite(G.TT)) fenceSet.add(G.TT);
      const fenceSorted = Array.from(fenceSet).sort((a, b) => a - b);
      // For each long, find the largest gap between its neighbouring fence
      // points on either side.
      liveSideLongs = sortedZ.map((z_mm, li) => {
        const ix = fenceSorted.indexOf(z_mm);
        const below = ix > 0 ? z_mm - fenceSorted[ix - 1] : 0;
        const above = ix < fenceSorted.length - 1 ? fenceSorted[ix + 1] - z_mm : 0;
        // Stiffener spacing = mean of half-distances to neighbours on each side.
        // (The classic naval-architecture "tributary width" for a long: the
        // stiffener carries half the panel above and half below.)
        // For an interior long: s = (below + above) / 2.
        // For an edge long (one side bounded by IB/UD/deck which IS in the
        // fence), the same formula applies — the bound counts as a neighbour.
        let s_local;
        if (below > 0 && above > 0) s_local = (below + above) / 2;
        else if (below > 0)         s_local = below;
        else if (above > 0)         s_local = above;
        else                        s_local = 0;
        // `n` is the 1-based ordinal from the bottom up. DEFAULT_SIDE_LONGS
        // carries it, and calcSideGroups() filters its G1..G5 bands by it —
        // without it every long fell into G5, calcSideGroups matched nothing,
        // and Math.max() over the empty band returned -Infinity, which turned
        // Z_sec, kg and the reported longitudinal weight into Infinity.
        return { n: li + 1, z: z_mm, s: s_local };
      });
    }
  } catch (_) { /* fall through to defaults */ }
  const sideLongList = (liveSideLongs && liveSideLongs.length > 0)
                       ? liveSideLongs : DEFAULT_SIDE_LONGS;

  // Hoist FSICR context out of the per-long forEach: same inputs across
  // the loop, no point computing N times. Memoization in FSICR.compute()
  // also covers this, but hoisting saves the function-call overhead too.
  const _iceCtxLong = (typeof FSICR !== 'undefined') ? FSICR.compute() : null;
  const _leMm_long  = (parseFloat((document.getElementById('le') || {}).value) || 1.452) * 1000;

  // LR Pt 4 Ch 1 Table 1.6.1 symbols: l_e "is not to be taken less than 1,5 m".
  // Same floor the deck / coaming longitudinal calcs already apply.
  const le_eff = Math.max(p.le, 1.5);
  const le2 = Math.pow(le_eff, 2);

  sideLongList.forEach(L => {
    const z = L.z / 1000;
    const s = L.s;
    // h_5 is a *distance* from the longitudinal up to the deck at depth D_2,
    // so it is never negative. Longitudinals can sit above D_2 whenever
    // D > 1,6T; without this clamp the F_1 denominator (4D_2 + 20h_5) passes
    // through zero at h_5 = −0,2D_2 (i.e. D/T = 1,92) and Z_req blows up.
    const h5 = Math.max(D2 - z, 0);
    const h6 = Math.abs(z - p.T);
    const above_wl = z > p.T;
    const above_mid = z > D2/2;
    
    // h_T1 side long (LR Table 1.6.1)
    //   above WL:  h_T1 = Cw·(1 − h6/(D2−T))·F_λ
    //              where Cw·(1 − h6/(D2−T)) ≥ L1/56 (B-60) or max(L1/70, 1.20) (Type B)
    //   below WL:  h_T1 = [h6 + Cw·(1 − h6/(2T))]·F_λ
    // Minimum applies to the Cw(...) term BEFORE F_λ multiplication.
    const L1 = Math.min(p.L, 190);
    const hT1_min_Cw = Math.max(L1/70, 1.20);  // Type B assumed
    
    let hT1_base;
    if (above_wl) {
      const cwTerm = Math.max(Cw * (1 - h6/(D2 - p.T)), hT1_min_Cw);
      hT1_base = cwTerm * Flambda;
    } else {
      hT1_base = (h6 + Cw * (1 - h6/(2*p.T))) * Flambda;
    }
    
    // Upper limit check (PDF Table 1.6.1): h_T1 need not exceed
    //   0.86·(h5 + D1/8)  for F1 ≤ 0.14
    //   (h5 + D1/8)       for F1 > 0.14
    const D1 = Math.max(10, Math.min(D2, 16));
    const F1_val = F1calc(D2, c1Interp(p.FB,p.FD,z,D2), h5, above_mid);
    const upper = F1_val <= 0.14 ? 0.86*(h5 + D1/8) : (h5 + D1/8);
    const hT1 = Math.min(hT1_base, upper);
    
    const c1 = c1Interp(p.FB, p.FD, z, D2);
    const F1 = F1calc(D2, c1, h5, above_mid);
    // F_s uses b_f1/b_f (geometry ratio) — 0.5 is LR default for FB/bulb,
    // conservative for rolled/built when profile face-plate geometry is not
    // available at this scope.
    const Fs = FsInterp(p.k, z, D2, 0.5);
    
    // ── Location (1) — Side longs in dry spaces — the LESSER of: ──
    //   (a) Z = 0.056·s·k·h_T1·l_e²·F₁·F_s         [side formula]
    //   (b) Z from (3)(a) with this long's s,k,l_e but other params at base line
    //       = γ·s·k·h_T2·l_e²·F₁_base  evaluated at z=0
    const Z_a = 0.056 * s * p.k * hT1 * le2 * F1 * Fs;
    // (b) — evaluate bottom formula (3)(a) at baseline: F₁ computed with h₅=D₂
    //      (distance to deck at D₂), c₁ = 75/(225 − 150·F_B)
    const c1_base = 75 / (225 - 150*p.FB);
    const F1_base = F1calc(D2, c1_base, D2, false);   // below-mid form, h₅=D₂
    const gamma_bot = gammaCalc(le_eff);
    const Z_b = gamma_bot * s * p.k * hT2 * le2 * F1_base;
    const Z_1 = Math.min(Z_a, Z_b);   // LR "lesser of (a) and (b)" for dry spaces

    // Tank load (only if z < tank_top) - LR Table 1.9.1 (2) Deep Tank
    //   Z = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2)),  γ=1.4, ω₁=ω₂=1.0 → denom=4.0
    //   h_4 from LR Tablo 1.9.1 (d): max(z_TT−z_mid, (z_OF−z_mid)/2, 0.5)
    let Z_tank = 0;
    if (z < tank_top_m) {
      const lr_side = _LR_h4(L.z, p.ttLevel, airpipe_mm_side);
      Z_tank = rho * s * p.k * lr_side.h4 * Math.pow(p.le,2) / (22 * 1.4 * 4.0);
    }
    
    // LR Table 1.6.1 (2): side longs in tanks = GREATER of (1)-result and tank
    let Z_req = z < tank_top_m ? Math.max(Z_1, Z_tank) : Z_1;

    // FSICR governance: if this long sits in the Frame Ice Strengthening zone,
    // take max(LR, FSICR). The FSICR check is no-op when ice is disabled.
    // Note: in this scope `s` is already in millimetres (carried from L.s
    // which is computed from fence-sorted z gaps in mm). Pass directly.
    // _iceCtxLong + _leMm_long are hoisted out of forEach (same for every iter).
    let Z_ice = null, A_ice = null, A_web = null, tw_min_ice = null, tw_act = null, iceShearOK = null, iceWebOK = null;
    let iceGoverns = false;
    if (_iceCtxLong && FSICR.inFrameStrengthening(L.z, _iceCtxLong)) {
      try {
        const smr = _iceCtxLong.sm_req(s, _leMm_long);  // s already in mm
        Z_ice = smr.Z_req; A_ice = smr.A_req;
        if (Z_ice > Z_req) {
          Z_req = Z_ice;
          iceGoverns = true;
        }
        // shear area (Eq 4.10) and web thickness (4.4.4.2) of the fitted profile
        const pd = _iceProfileDims(L);
        if (pd) {
          A_web = pd.hw * pd.tw / 100;                       // cm²
          iceShearOK = A_ice == null ? null : A_web >= A_ice;
          const wt = _iceCtxLong.web_t_min(pd.hw, pd.type === 'FB', s);
          tw_min_ice = wt.t_min; tw_act = pd.tw; iceWebOK = pd.tw >= wt.t_min - 1e-9;
        }
      } catch (_) { /* keep LR-only */ }
    }
    
    // Find strake
    let strake_n = 0;
    strakes.forEach(s => { if (L.z >= s.z1 && L.z < s.z2) strake_n = s.n; });
    
    // Assign group — same five contiguous bands calcSideGroups() uses, sized
    // from the actual longitudinal count (was hardcoded to ordinals 1..18, so
    // every long past 15 in a real 43-long layout was labelled G5).
    const grp = 'G' + _sideBandOf(L.n, sideLongList.length);
    
    // Governing descriptor
    let gov;
    if (iceGoverns) gov = 'FSICR Ice';
    else if (z < tank_top_m && Z_tank > Z_1) gov = 'Tank';
    else gov = Z_b < Z_a ? '(b) base-line' : '(a) side';

    results.push({
      n: L.n, z: L.z, z_m: z, s: s, strake: strake_n, region: L.note,
      loc: z < tank_top_m ? '(2)' : '(1)',
      hT1, c1, F1, Fs, Z_a, Z_b, Z_tank, Z_req, Z_ice, iceGoverns,
      A_ice, A_web, iceShearOK, tw_min_ice, tw_act, iceWebOK,
      gov,
      group: grp
    });
  });
  return results;
}

// Web height (mm) and web thickness (mm) of the profile fitted at a side longitudinal,
// from the drawing's profile name ("FB 160x11", "L 200x90x10", "HP 200x10", "T 300x10/150x15").
function _iceProfileDims(L) {
  try {
    const arr = (window.Draw && window.Draw.profiles && window.Draw.profiles.sideShell) || [];
    const hit = arr.find(p => Math.abs((+p.z) - (+L.z)) < 1) || null;
    const name = hit && hit.profileName; if (!name) return null;
    const m = /^(HP|L|T|FB)\s*([\d.]+)x([\d.]+)(?:[x\/]([\d.]+))?(?:x([\d.]+))?/i.exec(name); if (!m) return null;
    const type = m[1].toUpperCase();
    if (type === 'FB') return { type, hw: +m[2], tw: +m[3] };
    if (type === 'HP') return { type, hw: +m[2], tw: +m[3] };
    if (type === 'L')  return { type, hw: +m[2], tw: +m[4] };
    if (type === 'T')  return { type, hw: +m[2], tw: +m[3] };
  } catch (_) {}
  return null;
}

// ==================== SIDE LONG GROUPS ====================
function calcSideGroups() {
  const p = getParams();
  const longs = calcSideLong();
  const strakes = calcSidePlate();
  // Five contiguous bands, bottom-up, over however many side longitudinals the
  // drawing actually carries. This used to be hardcoded to ordinals 1..18 (the
  // size of DEFAULT_SIDE_LONGS); with a real layout of 43 longs, bands 19+ were
  // covered by nothing and every band that matched no long produced
  // Math.max() === -Infinity, poisoning Z_sec, kg and the reported weight.
  const DESCS = ['Alt (bilge üstü)', 'Alt-orta', 'Orta', 'Üst (Strake 5)', 'Void'];
  const groups = {};
  _sideBands(longs.length).forEach((band, gi) => {
    groups['G' + (gi + 1)] = { longs: band, desc: DESCS[gi] };
  });

  // Preferred profile type per group (user can override in UI)
  const preferType = document.getElementById('preferProfileType')?.value || 'L';

  Object.keys(groups).forEach(k => {
    const g = groups[k];
    const items = longs.filter(l => g.longs.includes(l.n));
    if (items.length === 0) {
      // Empty band (fewer than 5 longitudinals in the model) — report it as
      // empty rather than letting Math.max() of nothing become -Infinity.
      g.Z_max = 0; g.s_max = 0; g.t_plate = 14; g.count = 0;
      g.profile = null; g.Z_sec = 0; g.kg = 0; g.safety = 0;
      g.slenderness = null; g.autoWarning = null;
      return;
    }
    g.Z_max = Math.max(...items.map(i => i.Z_req));
    g.s_max = Math.max(...items.map(i => i.s));
    const strakeNums = [...new Set(items.map(i => i.strake))];
    g.t_plate = Math.max(...strakeNums.map(n => strakes.find(s=>s.n===n)?.t_sy || 14));

    // Check if user has manual override
    const overrideSel = document.getElementById('sideGroupProfile_' + k);
    let pickedName = overrideSel ? overrideSel.value : '';
    let autoWarning = null;
    
    if (!pickedName || pickedName === 'AUTO') {
      // Auto-select lightest compliant profile
      const picked = autoSelectProfile(g.Z_max, g.s_max, g.t_plate, preferType, p.kL);
      pickedName = picked ? picked.name : 'L 150x90x10';
      // Surface FAIL warnings ('Z insufficient' / 'Slenderness FAIL') instead
      // of silently accepting an under-strength profile.
      if (picked && picked.warning) autoWarning = picked.warning;
    }
    
    const res = sectionZWithPlate(pickedName, g.s_max, g.t_plate);
    const sl = checkProfileSlenderness(pickedName, p.kL);
    g.profile = pickedName;
    g.Z_sec = res.Z_min;
    g.kg = res.weight;
    g.safety = ((g.Z_sec - g.Z_max)/g.Z_max*100);
    g.count = g.longs.length;
    g.slenderness = sl;
    g.autoWarning = autoWarning;
  });
  return groups;
}

// ==================== INNER SIDE ====================
function calcInnerSide() {
  const p = getParams();
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  // IB / TT / B_half — read live state instead of hardcoded 1800 / 12900 / etc.
  const IB_mm = G.IB || p.ibLevel || 1800;
  const TT_mm = (G.TT != null ? G.TT : (p.ttLevel || G.UD || 12900));
  const HC_mm = G.HC || p.hcLevel || 16350;
  // Find tank compartment outboard of IS for rho + airpipe top.
  let tankComp = null;
  try {
    const IS_Y = G.IS || 10030;
    tankComp = window.getCompartmentAt?.(IS_Y + 50, (IB_mm + TT_mm) / 2) || null;
    if (tankComp && !(tankComp.type === 'ballast' || tankComp.type === 'fuel' || tankComp.type === 'freshwater')) {
      tankComp = null;
    }
  } catch (_) { tankComp = null; }
  const rho = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
  const airpipe_mm = _resolveAirpipeTop_m(tankComp, TT_mm + 760) * 1000;
  // Innerside long spacing — prefer the REAL max gap between consecutive
  // IS longs (profiles.innerSide), with stringer / tween-deck Z's added
  // as supports (decks act as primary supports for IS plate panels —
  // an IS long doesn't span across a deck level).
  // If there are <2 longs, fall back to the first strake's spacing_mm,
  // then to 650.
  let s_is;
  let s_is_breakdown = null;
  try {
    const IS_longs = window.Draw?.profiles?.innerSide || [];
    if (IS_longs.length >= 1) {
      // Collect all z values: IS longs + decks (stringer/tween/UD/IB) as fence
      const fenceZ = new Set();
      // IS longs themselves
      IS_longs.forEach(p => { if (p.z != null && isFinite(p.z)) fenceZ.add(p.z); });
      // Add stringer & tween deck Z's as supports — same approach as
      // bottomShell's getPlateSupports() helper.
      const G_ = window.Draw?.GEOMETRY || {};
      const stringers = window.Draw?.profiles?.stringer || [];
      const tweens    = window.Draw?.profiles?.tweenDeck || [];
      stringers.forEach(d => { if (d.z != null && isFinite(d.z)) fenceZ.add(d.z); });
      tweens.forEach(d    => { if (d.z != null && isFinite(d.z)) fenceZ.add(d.z); });
      // Also add IB and TT (start/end of the IS tank panel)
      if (G_.IB != null) fenceZ.add(G_.IB);
      if (G_.TT != null) fenceZ.add(G_.TT);
      const sorted = Array.from(fenceZ).sort((a, b) => a - b);
      let maxGap = 0;
      let maxGapPair = null;
      for (let i = 1; i < sorted.length; i++) {
        const gap = sorted[i] - sorted[i-1];
        if (gap > maxGap) { maxGap = gap; maxGapPair = [sorted[i-1], sorted[i]]; }
      }
      s_is = maxGap > 0 ? maxGap : 650;
      s_is_breakdown = { maxGap, maxGapPair, fenceCount: sorted.length };
    } else {
      const IS_STR0 = window.Draw?.STRAKES?.innerSide?.[0];
      s_is = (IS_STR0 && IS_STR0.spacing_mm) ? IS_STR0.spacing_mm : 650;
    }
  } catch (_) { s_is = 650; }
  const IS_STR = window.Draw?.STRAKES?.innerSide;

  // Generate longs evenly spaced from IB to TT at s_is intervals.
  const innerLongs = [];
  let z = IB_mm;
  while (z + s_is < TT_mm) { z += s_is; innerLongs.push(z); }

  // Plate strakes (tank region) — derive z1/z2 from STRAKES.innerSide if
  // present, else fall back to a 5-equal + 1-coaming partition.
  let strakes;
  if (IS_STR && IS_STR.length > 0) {
    strakes = [];
    let cursor = IB_mm;
    IS_STR.forEach((st, i) => {
      const z1 = cursor;
      const z2 = cursor + (st.width || 0);
      cursor = z2;
      // Region: strakes whose midpoint is below TT are tank, above = coaming/void
      const mid = (z1 + z2) / 2;
      let region = 'Tank';
      if (mid >= TT_mm) region = (mid >= HC_mm - 100) ? 'Coaming' : 'Void';
      strakes.push({
        n: i + 1, z1, z2, region,
        rule: region === 'Tank' ? 'Table 1.9.1'
            : region === 'Coaming' ? 'Pt 3 Ch 11'
            : 'Sec 9 min'
      });
    });
  } else {
    // Fallback: split IB→TT into 5 equal strakes + 1 coaming strake IB→HC
    const span = TT_mm - IB_mm;
    const step = span / 5;
    strakes = [
      { n:1, z1:IB_mm,          z2:IB_mm+step,   region:'Tank',    rule:'Table 1.9.1' },
      { n:2, z1:IB_mm+step,     z2:IB_mm+2*step, region:'Tank',    rule:'Table 1.9.1' },
      { n:3, z1:IB_mm+2*step,   z2:IB_mm+3*step, region:'Tank',    rule:'Table 1.9.1' },
      { n:4, z1:IB_mm+3*step,   z2:IB_mm+4*step, region:'Tank',    rule:'Table 1.9.1' },
      { n:5, z1:IB_mm+4*step,   z2:TT_mm,        region:'Tank',    rule:'Table 1.9.1' },
      { n:6, z1:TT_mm,          z2:HC_mm,        region:'Coaming', rule:'Table 1.9.1 + Pt 3 Ch 11' }
    ];
  }
  
  strakes.forEach(s => {
    const H = s.z2 - s.z1;
    const mid = (s.z1 + s.z2)/2/1000;
    let max_sp = s_is;  // default
    
    // h_4 (tank)
    if (s.region === 'Tank') {
      // LR Tablo 1.9.1 (b): z_ref = z1 + H/3 (1/3 height above lower edge),
      //   h₄ = max(z_TT − z_ref, (z_OF − z_ref)/2, 0.5)
      const z_ref_mm = s.z1 + H/3;
      const lr = _LR_h4(z_ref_mm, TT_mm, airpipe_mm);
      s.h4 = lr.h4;
      
      // Plate formula Tablo 1.9.1 (1): t = 0.004·s·f·√(ρ·h·k/1.025) + 2.5
      // (k inside the sqrt per Rule text — affects HT steel correctly)
      //
      // f = 1,1 − s/(2500·S), capped at 1,0, where S (Pt 4 Ch 1 1.5.1) is the
      // spacing of PRIMARY members in metres — the web-frame spacing typed in
      // the l_e field. Use le_global, not p.le: a bracket that shortens one
      // stiffener's effective span must not change the plate thickness.
      const f = _f(s_is, p.le_global || p.le);
      const t = 0.004 * s_is * f * Math.sqrt(rho * s.h4 * p.k / 1.025) + 2.5;
      s.t = Math.max(Math.ceil(t*2)/2, 7.5);
    } else if (s.region === 'Void') {
      s.h4 = 0;
      s.t = 7.5; // LR min for non-WT bulkhead
    } else {
      s.h4 = 0;
      s.t = 10; // Hatch coaming min (Pt 3 Ch 11 approx)
    }
    s.max_sp = max_sp;
  });
  
  // Inner side long Z values — LR Table 1.9.1 (2) Deep Tank
  //   Z = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2))   [cm³]
  //   γ = 1.4 (rolled/built section)
  //   ω₁ = ω₂ = 1.0 assumed (standard bracketed both ends) → denom = 4.0
  //   h_4 is the load head directly (no 0.25·T reduction — that's Sec 8 only)
  const gamma_dt = 1.4;
  const omega_sum_plus_2 = 4.0;  // ω₁=ω₂=1.0 (both bracketed); user can override for sniped ends
  const longResults = innerLongs.map((zmm, i) => {
    // LR Tablo 1.9.1 (d): h₄ = max(z_TT−z_mid, (z_OF−z_mid)/2, 0.5)
    const lr = _LR_h4(zmm, TT_mm, airpipe_mm);
    const Z_req = rho * s_is * p.k * lr.h4 * Math.pow(p.le,2) / (22 * gamma_dt * omega_sum_plus_2);
    return { n: i+1, z: zmm, Z: Z_req, h4: lr.h4 };
  });
  
  // Groups
  const n_total = longResults.length;
  const groupSize = Math.ceil(n_total / 4);
  const groups = {};
  const preferType = document.getElementById('preferProfileType')?.value || 'L';
  for (let g = 0; g < 4; g++) {
    const items = longResults.slice(g*groupSize, (g+1)*groupSize);
    if (items.length === 0) continue;
    const key = 'IS-G' + (g+1);
    const Z_max = Math.max(...items.map(i => i.Z));
    
    const overrideSel = document.getElementById('innerSideGroupProfile_' + key);
    let pickedName = overrideSel ? overrideSel.value : '';
    let autoWarning = null;
    if (!pickedName || pickedName === 'AUTO') {
      const picked = autoSelectProfile(Z_max, s_is, 10, preferType, p.kL);
      pickedName = picked ? picked.name : 'L 125x75x8';
      if (picked && picked.warning) autoWarning = picked.warning;
    }
    const res = sectionZWithPlate(pickedName, s_is, 10);
    
    groups[key] = {
      z_range: `${items[0].z}–${items[items.length-1].z}`,
      count: items.length,
      region: 'Tank',
      Z_max,
      profile: pickedName,
      Z_sec: res.Z_min,
      kg: res.weight,
      autoWarning
    };
  }
  
  return { strakes, longs: longResults, groups, s_is };
}
window.calcInnerSide = calcInnerSide;

// Expose other calculators for global access (e.g. autoOptimizeAll)
if (typeof calcBottomLong === 'function')    window.calcBottomLong = calcBottomLong;
if (typeof calcIBLong === 'function')        window.calcIBLong = calcIBLong;
if (typeof calcSideLong === 'function')      window.calcSideLong = calcSideLong;
if (typeof calcUpperDeckLong === 'function') window.calcUpperDeckLong = calcUpperDeckLong;
if (typeof calcLowerDeckLong === 'function') window.calcLowerDeckLong = calcLowerDeckLong;
if (typeof calcIBPlate === 'function')       window.calcIBPlate = calcIBPlate;
if (typeof calcUpperDeckPlate === 'function') window.calcUpperDeckPlate = calcUpperDeckPlate;
if (typeof calcBottomPlate === 'function')   window.calcBottomPlate = calcBottomPlate;
if (typeof calcSidePlate === 'function')     window.calcSidePlate = calcSidePlate;
if (typeof calcLowerDeckPlate === 'function') window.calcLowerDeckPlate = calcLowerDeckPlate;
if (typeof calcCoamingStiff === 'function')  window.calcCoamingStiff = calcCoamingStiff;

// ==================== DB INTERNALS (LR Pt 4 Ch 1 Sec 8) ====================
// All formulas cross-verified against LR-RU-001 Part 4 Ch 1 Section 8 (July 2025).
// d_DB is in mm (rule depth of centre girder). Thickness formulas take d_DB in mm
// and return thickness in mm (dimensional constants are NOT SI).
function calcDB() {
  const p = getParams();
  const sqk = Math.sqrt(p.k);
  const rows = [];
  
  // -------- 8.3.1 Centre girder minimum depth d_DB --------
  // d_DB = max of:
  //   (a) 28·B + 205·√T  [mm]
  //   (b) min(50·B, 2000) [mm]
  //   (c) 760 mm
  const dDB_a = 28.0 * p.B + 205.0 * Math.sqrt(p.T);
  const dDB_b = Math.min(50.0 * p.B, 2000.0);
  const dDB_c = 760.0;
  const dDB_req = Math.max(dDB_a, dDB_b, dDB_c);
  const gov = dDB_req === dDB_a ? 'a' : (dDB_req === dDB_b ? 'b' : 'c');
  
  // Actual d_DB = max(ibLevel, rule minimum) — designer's IB height must at least
  // satisfy the rule; thickness formulas use the actual (as-built) depth.
  const dDB_actual = Math.max(p.ibLevel, dDB_req);

  // Sec 8.3.2 last sentence carries an explicit relaxation:
  //   "The thickness may be determined using the value for d_DB without
  //    applying the minimum depths specified in 8.3.1.(b) and 8.3.1.(c)."
  // It sits inside 8.3.2 and is worded for the CENTRE GIRDER thickness only.
  // Sec 8 defines d_DB as the "Rule depth of centre girder" (with d_DBA as the
  // separate symbol for the actual depth), so every other thickness formula —
  // 8.3.5 side girder, 8.3.8 duct keel, 8.5.1/8.5.2 floors, 8.5.3 brackets —
  // takes the full Rule depth, the greater of (a), (b) and (c).
  //
  // This used to apply the 8.3.2 relaxation everywhere, which made all of those
  // members thinner than required whenever (b) or (c) governed the depth (i.e.
  // beamy shallow ships, B ≳ 9,3·√T). Formula (a) governs for the current ship,
  // so the numbers here do not move.
  const dDB_centreGirder_t = dDB_a;    // 8.3.2 only — the explicit relaxation
  const dDB_for_thickness  = dDB_req;  // every other Sec 8 thickness formula

  const dbConfig = document.getElementById('dbConfig')?.value || 'duct_keel';
  const hasCentreGirder = dbConfig === 'centre_girder';
  const hasDuctKeel = dbConfig === 'duct_keel';
  
  // -------- Row 1: d_DB depth check --------
  rows.push({
    elem: 'Centre Girder Depth d_DB',
    count: '—',
    t: `${p.ibLevel} (IB height)`,
    dim: `a=${dDB_a.toFixed(0)}, b=${dDB_b.toFixed(0)}, c=760`,
    rule: 'Sec 8.3.1',
    formula: 'max(28·B+205·√T, min(50·B,2000), 760)',
    t_req: dDB_req.toFixed(0),
    unit: 'mm depth',
    status: p.ibLevel >= dDB_req ? 'OK' : 'FAIL',
    note: `gov by (${gov})`
  });
  
  // -------- 8.3.2 Centre girder thickness --------
  // t = (0.008·d_DB + 4)·√k  mm, min 6.0 mm
  // d_DB here is the full Rule depth (8.3.1 a/b/c) — the 8.3.2 relaxation is
  // written for the centre girder only.
  if (hasCentreGirder) {
    const t_cg_req = Math.max((0.008 * dDB_centreGirder_t + 4.0) * sqk, 6.0);
    const t_cg = parseFloat(document.getElementById('cgT').value);
    rows.push({
      elem: 'Centre Girder',
      count: 1,
      t: t_cg.toFixed(1),
      dim: `d_DB=${dDB_centreGirder_t.toFixed(0)} mm (a) [actual ${dDB_actual.toFixed(0)}]`,
      rule: 'Sec 8.3.2',
      formula: '(0.008·d_DB + 4)·√k',
      t_req: t_cg_req.toFixed(2),
      unit: 'mm',
      status: t_cg >= t_cg_req ? 'OK' : 'FAIL',
      note: 'min 6.0 mm; d_DB per Sec 8.3.2 last sentence = formula (a)'
    });
  }
  
  // -------- 8.3.8 Duct keel side plate --------
  // Sec 8.3.8: thickness = greater of:
  //   (a) t = (0.008·d_DB + 2)·√k  mm
  //   (b) deep-tank formula (Tablo 1.9.1) if duct connected to side tank / cofferdam,
  //       with h measured to the highest point of the side tank or cofferdam.
  // Min: 6.0 mm (Sec 8.3.8); also Tablo 1.9.1 min 7.5 (L≥90) / 6.5 (L<90) when (b) governs.
  // d_DB here is the full Rule depth (8.3.1 a/b/c) — the 8.3.2 relaxation is
  // written for the centre girder only.
  if (hasDuctKeel) {
    // (a) classic formula
    const t_dk_a = (0.008 * dDB_for_thickness + 2.0) * sqk;

    // (b) deep-tank check (only if interconnected)
    const dkInterconnect = document.getElementById('dkInterconnect')?.value || 'yes';
    let t_dk_b = 0, h4_dk = 0, f_dk = 0, s_dk = 0, S_dk = 0, rho_dk = 0;
    let dt_note = '';
    if (dkInterconnect === 'yes') {
      // Tablo 1.9.1 (1) deep-tank plate:
      //   t = 0.004·s·f·√(ρ·h_4·k/1.025) + 2.5
      // h_4 per Sec 9.2.1 (b) for plating: distance from (z_bot + H/3) to top of
      // the connected side tank, OR half distance to overflow, whichever is greater.
      // Here: duct side plate spans z=0 (BL) to z=IB. Top of side tank = TT level.
      s_dk = parseFloat(document.getElementById('dkStiffS')?.value || 700);
      S_dk = parseFloat(document.getElementById('dkPrimaryS')?.value || 2.5);
      rho_dk = parseFloat(document.getElementById('dkRho')?.value || 1.025);
      const z_plate_top = p.ibLevel;     // mm — duct side top
      const z_plate_bot = 0;             // mm — duct side bottom
      const H_panel = z_plate_top - z_plate_bot;
      const z_ref_dk = z_plate_bot + H_panel / 3;   // mm — 1/3 above lower edge

      // Side tank top = TT level (mm); overflow = airpipe (UD + 760 mm typical)
      const z_TT_mm = p.ttLevel;
      const z_OF_mm = p.udLevel + 760;
      const h_a_dk = (z_TT_mm - z_ref_dk) / 1000;       // m, to highest point of side tank
      const h_b_dk = (z_OF_mm - z_ref_dk) / 2 / 1000;   // m, half to overflow
      h4_dk = Math.max(h_a_dk, h_b_dk, 0.5);

      // f factor — Tablo 1.9.1 footnote: f = 1.1 − s/(2500·S), capped at 1.0
      f_dk = Math.min(1.0, 1.1 - s_dk / (2500 * S_dk));
      if (f_dk < 0) f_dk = 0;

      t_dk_b = 0.004 * s_dk * f_dk * Math.sqrt(rho_dk * h4_dk * p.k / 1.025) + 2.5;

      dt_note = `(b) DT: s=${s_dk} mm, S=${S_dk} m, ρ=${rho_dk}, h₄=${h4_dk.toFixed(2)} m (z_ref=${(z_ref_dk/1000).toFixed(2)} m → TT=${(z_TT_mm/1000).toFixed(2)} m), f=${f_dk.toFixed(3)} → t_b=${t_dk_b.toFixed(2)} mm`;
    } else {
      dt_note = '(b) skipped — duct independent (no DT)';
    }

    // Tablo 1.9.1 absolute minimums when (b) considered:
    const t_table191_min = (p.L >= 90) ? 7.5 : 6.5;

    const t_dk_req = Math.max(t_dk_a, t_dk_b, 6.0,
      (dkInterconnect === 'yes' ? t_table191_min : 0));
    const t_dk = parseFloat(document.getElementById('dkT').value);

    // Which one governs?
    let gov;
    if (t_dk_b > t_dk_a && t_dk_b >= t_table191_min && t_dk_b >= 6) gov = '(b) DT';
    else if (t_dk_a >= t_table191_min && t_dk_a >= 6) gov = '(a)';
    else if (dkInterconnect === 'yes' && t_table191_min >= 6) gov = `Tablo 1.9.1 min (${t_table191_min})`;
    else gov = '6.0 mm min';

    rows.push({
      elem: 'Duct Keel Side Plate',
      count: 2,
      t: t_dk.toFixed(1),
      dim: `d_DB=${dDB_for_thickness.toFixed(0)} mm (a) [actual ${dDB_actual.toFixed(0)}]`,
      rule: 'Sec 8.3.8',
      formula: `(a) (0.008·d_DB+2)·√k = ${t_dk_a.toFixed(2)};  ${dt_note}`,
      t_req: t_dk_req.toFixed(2),
      unit: 'mm',
      status: t_dk >= t_dk_req ? 'OK' : 'FAIL',
      note: `gov: ${gov}; min 6.0 mm (Sec 8.3.8) & ${t_table191_min} mm (Tablo 1.9.1)`
    });
    
    // -------- 8.3.9 Duct keel spacing check --------
    const dkSp = parseFloat(document.getElementById('dkSpacing').value);
    rows.push({
      elem: 'Duct Keel Spacing',
      count: '—',
      t: dkSp.toFixed(2) + ' m',
      dim: 'sides spacing',
      rule: 'Sec 8.3.9',
      formula: '≤ 2.0 m',
      t_req: '2.00',
      unit: 'm',
      status: dkSp <= 2.0 ? 'OK' : 'FAIL',
      note: 'if symmetric, each side ≤ 2.0 m from CL/girder'
    });
  }
  
  // -------- 8.3.5 Side girder — LONGITUDINAL framing --------
  // Rule text (verbatim paraphrase): "In longitudinally framed ships one side
  // girder is to be fitted where B exceeds 14 m, and two girders are to be fitted
  // on each side of the centreline where B exceeds 21 m. The girders are to
  // extend as far forward and aft as practicable..."
  // Thickness: t = (0.0075·d_DB + 1)·√k mm, min 6.0 mm.
  // Additional: vertical stiffener midway between floors, depth ≥ 100 mm, 
  // thickness = girder thickness.
  let sg_count_per_side;
  let sg_count_rule;
  if (p.B <= 14.0) { 
    sg_count_per_side = 0; 
    sg_count_rule = 'B ≤ 14 m → 0 per side';
  } else if (p.B <= 21.0) { 
    sg_count_per_side = 1; 
    sg_count_rule = '14 < B ≤ 21 m → 1 per side';
  } else { 
    sg_count_per_side = 2; 
    sg_count_rule = 'B > 21 m → 2 per side';
  }
  
  if (sg_count_per_side > 0) {
    const t_sg_req = Math.max((0.0075 * dDB_for_thickness + 1.0) * sqk, 6.0);
    const t_sg = parseFloat(document.getElementById('sgT').value);
    const sg_total = 2 * sg_count_per_side;
    rows.push({
      elem: `Side Girder (${sg_count_per_side}/side, total ${sg_total})`,
      count: sg_total,
      t: t_sg.toFixed(1),
      dim: `d_DB=${dDB_for_thickness.toFixed(0)} mm (a) [actual ${dDB_actual.toFixed(0)}], B=${p.B} m → ${sg_count_rule}`,
      rule: 'Sec 8.3.5',
      formula: '(0.0075·d_DB + 1)·√k',
      t_req: t_sg_req.toFixed(2),
      unit: 'mm',
      status: t_sg >= t_sg_req ? 'OK' : 'FAIL',
      note: 'extend fwd/aft as far as practicable; vert. stiff. midway (≥100 mm, = girder t); min 6.0 mm; d_DB = Rule depth (8.3.1)'
    });
  } else {
    rows.push({
      elem: 'Side Girder',
      count: 0,
      t: '—',
      dim: `B=${p.B} m → ${sg_count_rule}`,
      rule: 'Sec 8.3.5',
      formula: 'not required',
      t_req: '—',
      unit: '—',
      status: 'N/A',
      note: 'B ≤ 14 m → no side girder required'
    });
  }
  
  // -------- 8.5.1 Floor non-WT (LONGITUDINAL framing) --------
  // t = (0.009·d_DB + 1)·√k mm, min 6, max 15
  // Check: d_DB/t ≤ 130·√k (else extra stiffening)
  // Thickness formula uses the full Rule depth (8.3.1 a/b/c).
  // Ratio check: uses ACTUAL floor depth (=IB level) — that's the geometric ratio.
  const t_fl_raw = (0.009 * dDB_for_thickness + 1.0) * sqk;
  const t_fl_req = Math.max(6.0, Math.min(t_fl_raw, 15.0));
  const t_fl = parseFloat(document.getElementById('floorNonWtT').value);
  const ratio = dDB_actual / t_fl;
  const ratio_limit = 130.0 * sqk;
  const ratioNote = ratio <= ratio_limit 
    ? `d_DB/t=${ratio.toFixed(1)} ≤ ${ratio_limit.toFixed(1)} ✓` 
    : `d_DB/t=${ratio.toFixed(1)} > ${ratio_limit.toFixed(1)} — extra stiffening req'd`;
  rows.push({
    elem: 'Floor (non-WT)',
    count: '—',
    t: t_fl.toFixed(1),
    dim: `d_DB=${dDB_for_thickness.toFixed(0)} mm (a) [actual ${dDB_actual.toFixed(0)}], spacing ≤3.8 m`,
    rule: 'Sec 8.5.1',
    formula: '(0.009·d_DB + 1)·√k',
    t_req: t_fl_req.toFixed(2),
    unit: 'mm',
    status: (t_fl >= t_fl_req && ratio <= ratio_limit) ? 'OK' : 'FAIL',
    note: `min 6, max 15; ${ratioNote}; thickness uses d_DB(a), ratio uses actual depth`
  });
  
  // -------- 8.5.2 Floor WT (LONGITUDINAL framing) --------
  // t = max[(0.008·d_DB + 3)·√k, (0.009·d_DB + 1)·√k], cap 15 mm
  const t_wt_a = (0.008 * dDB_for_thickness + 3.0) * sqk;
  const t_wt_b = (0.009 * dDB_for_thickness + 1.0) * sqk;
  const t_wt_req = Math.min(Math.max(t_wt_a, t_wt_b), 15.0);
  const t_wt_gov = t_wt_a >= t_wt_b ? '(a)' : '(b)';
  const t_wt = parseFloat(document.getElementById('floorWtT').value);
  rows.push({
    elem: 'Floor (WT)',
    count: '—',
    t: t_wt.toFixed(1),
    dim: `d_DB=${dDB_for_thickness.toFixed(0)} mm (a) [actual ${dDB_actual.toFixed(0)}]`,
    rule: 'Sec 8.5.2',
    formula: 'max[(0.008·d_DB+3)·√k, (0.009·d_DB+1)·√k]',
    t_req: t_wt_req.toFixed(2),
    unit: 'mm',
    status: t_wt >= t_wt_req ? 'OK' : 'FAIL',
    note: `gov ${t_wt_gov}; max 15 mm; also ≥ deep tank if connected; d_DB = Rule depth (8.3.1)`
  });
  
  // -------- 8.5.3 Transverse bracket between floors --------
  // t ≥ 0.009·d_DB mm
  const t_brk_req = 0.009 * dDB_for_thickness;
  const t_brk = parseFloat(document.getElementById('brkT').value);
  rows.push({
    elem: 'Transverse Bracket',
    count: '—',
    t: t_brk.toFixed(1),
    dim: `d_DB=${dDB_for_thickness.toFixed(0)} mm (a) [actual ${dDB_actual.toFixed(0)}]`,
    rule: 'Sec 8.5.3',
    formula: '0.009·d_DB',
    t_req: t_brk_req.toFixed(2),
    unit: 'mm',
    status: t_brk >= t_brk_req ? 'OK' : 'FAIL',
    note: "edge stiff; CL ≤ 1.25 m, margin every frame; d_DB = Rule depth (8.3.1)"
  });
  
  // -------- 8.4.3 Margin plate (info only) --------
  const t_ib = parseFloat(document.getElementById('ibT').value);
  const t_mp_req = 1.20 * t_ib;
  rows.push({
    elem: 'Margin Plate (if fitted)',
    count: '—',
    t: '—',
    dim: `t_IB = ${t_ib} mm`,
    rule: 'Sec 8.4.3',
    formula: '1.20 × t_IB',
    t_req: t_mp_req.toFixed(2),
    unit: 'mm',
    status: 'INFO',
    note: '20% thicker than inner bottom'
  });
  
  // -------- 8.5.7 Bracket floor geometry --------
  const brk_breadth = 0.75 * dDB_actual;
  rows.push({
    elem: 'Bracket Floor Geometry',
    count: '—',
    t: '—',
    dim: `d_DB=${dDB_actual.toFixed(0)} mm`,
    rule: 'Sec 8.5.7',
    formula: '¾·d_DB (bracket breadth)',
    t_req: brk_breadth.toFixed(0),
    unit: 'mm',
    status: 'INFO',
    note: 'frame span ≤ 2.5 m; bracket flanged'
  });

  // ─────────────────────────────────────────────────────────────────────
  // BUCKLING + HULL-GIRDER CHECKS for DB internals (v80)
  // Sec 8.3.10 / 8.4.6 explicitly require Pt 3 Ch 4 Sec 7 buckling.
  // We use window.Buckling.checkPlate (same module as the SVG overlay).
  // ─────────────────────────────────────────────────────────────────────
  try {
    const _B = window.Buckling;
    const _D = window.Draw;
    let _sp = null;
    if (_D && typeof _D.computeSectionProperties === 'function') {
      try { _sp = _D.computeSectionProperties(); } catch(_e) {}
    }
    const _haveSection = !!(_B && _sp && _sp.I_NA && _sp.z_NA);

    if (_haveSection) {
      const _z_NA = _sp.z_NA;
      const _I_NA = _sp.I_NA;
      const _z_db_mid_m = (p.ibLevel / 2) / 1000;
      const _z_deck_mm = p.udLevel;
      const _M_kNm = parseFloat(document.getElementById('MsDesign')?.value || 0) || 0;
      // Add wave moment if available
      let _M_max = Math.abs(_M_kNm);
      try {
        const _ls = window.runLongStrengthAnalysis?.(_M_kNm);
        if (_ls && _ls.Mw_hog != null && _ls.Mw_sag != null) {
          _M_max = Math.max(Math.abs((_M_kNm) + _ls.Mw_hog), Math.abs(_M_kNm + _ls.Mw_sag));
        }
      } catch(_e) {}

      const _z_face_mm = (_z_db_mid_m * 1000 >= _z_NA) ? (_z_deck_mm - _z_NA) : _z_NA;
      let _sigma_A = null;
      let _tau_A = 0;
      try {
        const _sigma_face = _z_face_mm > 0 ? Math.abs(_M_max * 1e6 * _z_face_mm / _I_NA) * 1e-3 : 0;
        _sigma_A = _B.sigmaADesign(_sigma_face, Math.abs(_z_db_mid_m * 1000 - _z_NA), _z_face_mm, p.kL || p.k);
        _tau_A = _B.tauADesignInitial(p.kL || p.k);
      } catch(_e) {}

      // Hull girder σ row
      if (_sigma_A != null) {
        const _sigma_perm = 235 / (p.kL || p.k);
        const _ratio = _sigma_A / _sigma_perm;
        rows.push({
          elem: 'Hull Girder σ @ DB (z=IB/2)',
          count: '—',
          t: `${_sigma_A.toFixed(1)} N/mm²`,
          dim: `z=${_z_db_mid_m.toFixed(2)} m, z_NA=${(_z_NA/1000).toFixed(2)} m`,
          rule: 'Pt 3 Ch 4 Sec 5.7',
          formula: 'σ_A from M·(z−z_NA)/I_NA',
          t_req: `${_sigma_perm.toFixed(0)} N/mm²`,
          unit: 'σ',
          status: _ratio <= 1.0 ? 'OK' : 'FAIL',
          note: `σ_A/σ_perm = ${_ratio.toFixed(3)}`
        });
      }

      const _S_floor = (p.le && p.le > 0) ? p.le : 2.5;
      const _material = p.material || 'AH36';
      const _ucCheck = (label, t_mm, s_mm, ruleRef) => {
        if (!isFinite(t_mm) || t_mm <= 0 || _sigma_A == null) {
          rows.push({
            elem: label, count:'—', t: (isFinite(t_mm) ? t_mm.toFixed(1) : '—') + ' mm',
            dim: `s=${s_mm} mm, S=${_S_floor.toFixed(2)} m`, rule: ruleRef,
            formula: 'UC = max(UC_comp, UC_shear)', t_req: '—', unit: 'UC',
            status: 'INFO', note: 'Run Analysis to compute buckling UC.'
          });
          return;
        }
        let _uc = null;
        try {
          const _r = _B.checkPlate({
            s_mm: s_mm || 700, t_mm, S_m: _S_floor,
            sigma_A: _sigma_A, tau_A: _tau_A,
            stiffening: 'LONGITUDINAL',
            corrosion: 'TWO_WB_HORIZ',
            material: _material
          });
          _uc = Math.max(_r.UC_comp || 0, _r.UC_shear || 0);
        } catch(_e) {}
        rows.push({
          elem: label, count:'—', t: t_mm.toFixed(1) + ' mm',
          dim: `s=${s_mm} mm, S=${_S_floor.toFixed(2)} m, z_mid=${_z_db_mid_m.toFixed(2)} m`,
          rule: ruleRef,
          formula: 'UC = max(UC_comp, UC_shear)',
          t_req: _uc != null ? _uc.toFixed(3) : '—',
          unit: 'UC',
          status: _uc == null ? 'INFO' : (_uc <= 1.0 ? 'OK' : 'FAIL'),
          note: _uc == null ? 'Buckling UC unavailable.' : `UC = ${_uc.toFixed(3)} ${_uc > 1.0 ? '> 1.0 — increase t' : '≤ 1.0'}`
        });
      };

      if (hasCentreGirder) {
        const _t_cg = parseFloat(document.getElementById('cgT').value);
        _ucCheck('Centre Girder — Buckling', _t_cg, 700, 'Pt 3 Ch 4 Sec 7');
      }
      if (hasDuctKeel) {
        const _t_dk = parseFloat(document.getElementById('dkT').value);
        const _s_dk = parseFloat(document.getElementById('dkStiffS')?.value || 700);
        _ucCheck('Duct Keel Side — Buckling', _t_dk, _s_dk, 'Pt 3 Ch 4 Sec 7');
      }
      if (sg_count_per_side > 0) {
        const _t_sg = parseFloat(document.getElementById('sgT').value);
        // YATAY destek: tool'da vertical stiff yok → s_horiz = full web frame
        // DİKEY destek: long intercostal stiff sayısına göre
        const _wf_mm_db = (p.le && p.le > 0) ? p.le * 1000 : 1452;
        const _s_horiz_db = _wf_mm_db;     // full (no vert stiff)
        // Take min long stiffeners across all girders (most critical = fewest stiffeners)
        let _N_long_min = Infinity;
        for (let _sgI = 0; _sgI < (window.Draw?.SIDE_GIRDERS?.length || 0); _sgI++) {
          const _sgLongs_db = window.Draw?.profiles?.['sideGirder' + _sgI];
          if (_sgLongs_db) _N_long_min = Math.min(_N_long_min, _sgLongs_db.length);
        }
        if (!isFinite(_N_long_min)) _N_long_min = 0;
        const _s_vert_db = p.ibLevel / (_N_long_min + 1);
        const _s_sg_db = Math.min(_s_vert_db, _s_horiz_db);
        _ucCheck('Side Girder — Buckling', _t_sg, _s_sg_db,
                 `Pt 3 Ch 4 Sec 7 (${_N_long_min} long. intercostal: vert s=${_s_vert_db.toFixed(0)}, horiz s=${_s_horiz_db.toFixed(0)} full web)`);
      }
      const _t_fl = parseFloat(document.getElementById('floorNonWtT').value);
      _ucCheck('Floor non-WT — Buckling', _t_fl, 700, 'Pt 3 Ch 4 Sec 7');
      const _t_wt = parseFloat(document.getElementById('floorWtT').value);
      _ucCheck('Floor WT — Buckling', _t_wt, 700, 'Pt 3 Ch 4 Sec 7');
    } else {
      rows.push({
        elem: 'Buckling / HG checks (DB internals)',
        count:'—', t:'—', dim:'—',
        rule: 'Pt 3 Ch 4 Sec 7',
        formula: '—', t_req:'—', unit:'—',
        status: 'INFO',
        note: 'Run Analysis to compute hull-girder σ and buckling UC for DB internals.'
      });
    }
  } catch (_e) {
    console.warn('[calcDB] buckling/HG check error:', _e);
  }

  return rows;
}

// ==================== WEIGHT ====================
function calcWeight() {
  const p = getParams();
  const L_eff = 0.80 * p.L;
  const rho_steel = 7.85;
  
  // Plate weight
  let W_plate = 0;
  // Bottom: (B - 2*R_B - keel_w) × L_eff × t × 2(no, just flat)
  const R_B = 1.8; // bilge radius m
  const B = p.B;
  const keel_w = parseFloat(document.getElementById('keelWidth').value)/1000;
  const t_bot = parseFloat(document.getElementById('bottomT').value);
  const t_keel = parseFloat(document.getElementById('keelT').value);
  const t_bilge = parseFloat(document.getElementById('bilgeT').value);
  const t_ib = parseFloat(document.getElementById('ibT').value);
  const t_deck = parseFloat(document.getElementById('deckT').value);
  
  const A_flat_bot = (B - 2*R_B - keel_w) * L_eff;
  const A_keel = keel_w * L_eff;
  const A_bilge = (Math.PI/2) * R_B * L_eff * 2;
  const A_ib = (B - 2*R_B) * L_eff;  // approximate
  const H_side = p.udLevel/1000 - p.ibLevel/1000;
  
  const strakes = calcSidePlate();
  let A_side_total = 0, W_side_plate = 0;
  strakes.forEach(s => {
    const A = (s.z2-s.z1)/1000 * L_eff * 2;  // 2 sides
    A_side_total += A;
    W_side_plate += A * s.t_sy/1000 * rho_steel;
  });
  
  const W_bot_plate = A_flat_bot * t_bot/1000 * rho_steel;
  const W_keel = A_keel * t_keel/1000 * rho_steel;
  const W_bilge = A_bilge * t_bilge/1000 * rho_steel;
  const W_ib = A_ib * t_ib/1000 * rho_steel;
  const A_deck = B * L_eff;
  const W_deck = A_deck * t_deck/1000 * rho_steel;
  
  // Inner side
  const is_data = calcInnerSide();
  let W_inner = 0;
  is_data.strakes.forEach(s => {
    const H = (s.z2 - s.z1)/1000;
    const A = H * L_eff * 2;
    W_inner += A * s.t/1000 * rho_steel;
  });
  
  W_plate = W_bot_plate + W_keel + W_bilge + W_ib + W_deck + W_inner + W_side_plate;
  
  // Long weight
  let W_long = 0;
  const bCount = parseInt(document.getElementById('bottomLongCount').value);
  const bl_weight = calcBottomLong();  // has resolvedProfile
  const bProf = bl_weight.resolvedProfile;
  const bProf_kg = weightPerM(getProfileData(bProf)?.area || 0);
  W_long += 2 * bCount * L_eff * bProf_kg / 1000;
  
  const ibCount = parseInt(document.getElementById('ibLongCount').value);
  W_long += 2 * ibCount * L_eff * bProf_kg / 1000;
  
  const sideGroups = calcSideGroups();
  Object.values(sideGroups).forEach(g => {
    W_long += 2 * g.count * L_eff * g.kg / 1000;
  });
  
  Object.values(is_data.groups).forEach(g => {
    W_long += 2 * g.count * L_eff * g.kg / 1000;
  });
  
  const deckCount = parseInt(document.getElementById('deckLongCount').value);
  const deckProfSel = document.getElementById('deckLongProfile').value;
  const deckSpacing = parseFloat(document.getElementById('deckLongSpacing').value);
  const deckT_val = parseFloat(document.getElementById('deckT').value);
  // Placeholder Z_req for deck long (Pt 4 Ch 1 Sec 7 — approx 150 cm³)
  const deckProf = resolveProfileName(deckProfSel, 150, deckSpacing, deckT_val, p.kL);
  const deckProf_kg = weightPerM(getProfileData(deckProf)?.area || 0);
  W_long += 2 * deckCount * L_eff * deckProf_kg / 1000;
  
  return { W_plate, W_long, total: W_plate + W_long, bottomProf: bProf, deckProf };
}

