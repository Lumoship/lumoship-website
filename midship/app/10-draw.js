/* ==========================================================================
   10-draw.js  —  Drawing / geometry engine (window.Draw) + FSICR ice engine
   Extracted verbatim from Index.html (lines 2294–14198 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */

// =============================================================================
// === DRAWING MODULE (IIFE, exports to window.Draw) ===
// =============================================================================
window.Draw = window.Draw || {};
(function(){

// Ship geometry — editable from the editor panel; render reads from here
let GEOMETRY = {
  B_half: 11880,      // half beam in mm
  IB: 1800,           // inner bottom z
  TT: 12900,          // tank top z
  UD: 15300,          // upper deck z
  HC: 16350,          // hatch coaming top z
  R_B: 1800,          // bilge radius
  keel_half: 900,     // keel plate half-width
  duct_half: 900,     // duct keel half-width
  IS: 10030,          // inner side from CL
};

// Design parameters (spacing, starting positions, profile types)
let PARAMS = {
  dbSpacing: 700,
  sideSpacing: 705,
  sideZ0: 2375,
  coamingTop: 950,          // Width of horizontal plate above HC (from IS toward shell)
  coamingEdgeH: 200,        // Height of vertical FB at coaming edge (mm, ALWAYS FB, default 200)
  coamingEdgeT: 20,         // Thickness of vertical FB at coaming edge (ALWAYS 20 mm)
  profTypeBottom:   'L',    // Bottom Shell profile type
  profTypeIB:       'L',    // Inner Bottom profile type
  profTypeStringer: 'L',    // Stringer Deck stiffener profile type
  profTypeTween:    'L',    // Tween Deck stiffener profile type
  profTypeCoaming:  'FB',   // Coaming Top Plate stiffener — ALWAYS FB (flat bar)
  profTypeSide:     'L',    // Side Shell profile type
  profTypeIS:       'L',    // Inner Side profile type
  profTypeDeck:     'L',    // Upper Deck profile type
};

// Side Girders — editable list. All behave as normal SGs (no locks).
let SIDE_GIRDERS = [
  { y: 3700 },
  { y: 6500 },
  { y: 10030 },
];

// Geometry editor metadata
const GEOMETRY_META = [
  { key:'B_half',    label:'Half Beam (B/2)',     min:5000, max:30000, step:100 },
  { key:'IB',        label:'Inner Bottom Z',      min:500,  max:5000,  step:50  },
  { key:'TT',        label:'Tween Deck Z',        min:3000, max:20000, step:100 },
  { key:'UD',        label:'Upper Deck Z',        min:5000, max:25000, step:100 },
  { key:'HC',        label:'Hatch Coaming Z',     min:5000, max:28000, step:50  },
  { key:'R_B',       label:'Bilge Radius',        min:200,  max:5000,  step:50  },
  { key:'keel_half', label:'Keel plate half',     min:200,  max:2000,  step:50  },
  { key:'duct_half', label:'Duct keel half',      min:200,  max:3000,  step:50  },
  { key:'IS',        label:'Inner Side Y (from CL)', min:3000, max:15000, step:50 },
];
const PARAMS_META = [
  { key:'dbSpacing',    label:'DB stiff spacing (target)',    min:400, max:1500, step:25 },
  { key:'sideSpacing',  label:'Side stiff spacing (target)',  min:400, max:1500, step:5  },
  { key:'coamingTop',   label:'Coaming top width',      min:0,    max:2000, step:50 },
  { key:'coamingEdgeH', label:'Coaming edge FB height', min:0,    max:500,  step:10 },
  { key:'coamingEdgeT', label:'Coaming edge FB thick',  min:0,    max:60,   step:2  },
];

const SCALE = 0.033;
const BASELINE_Y = 620;
function X(y) { return y * SCALE; }
function Y(z) { return BASELINE_Y - z * SCALE; }

// =========================================================================
// FSICR ICE CLASS ENGINE — Apr 2026
// Embedded from A3098_ice_scantling_v2_1_.html and adapted to read shared
// inputs from the main scantling tool. When iceEnabled=true:
//   - Side-shell plate t becomes max(LR, FSICR) within the Plate Ice Belt zone.
//   - Side-shell longitudinal Z becomes max(LR, FSICR) within the Frame Ice
//     Strengthening zone (Reg. 4.4.1 — wider than plate ice belt).
//   - Intermediate longitudinals can be inserted (button) at the midpoint
//     of every adjacent side-shell pair whose midpoint falls in the Frame
//     Ice Strengthening zone. They are tagged {ice:true} for identification.
//   - SM, inertia, slenderness etc. all see ice intermediates automatically
//     because they live in profiles.sideShell.
//
// FSICR rule tables (PDF references kept verbatim):
//   Reg. 4.2.1 — load patch h0/h
//   Reg. 4.2.2 — pressure: p = cd·c1·ca·po, po=5.6 MPa constant
//   Reg. 4.3.1 — plate ice belt vertical extent (midbody)
//   Reg. 4.3.2 — plate thickness formula
//   Reg. 4.4.1 — frame strengthening vertical extent (midship)
//   Reg. 4.4.2.1 / 4.4.3 — frame Z and shear A
// =========================================================================
const FSICR = (function () {
  const ICE_BELT_EXTENT_MIDBODY = {
    '1AS': { up: 0.60, dn: 0.75 },
    '1A':  { up: 0.50, dn: 0.60 },
    '1B':  { up: 0.40, dn: 0.50 },
    '1C':  { up: 0.40, dn: 0.50 }
  };
  const FRAME_EXTENT_MIDBODY = {
    '1AS': { up: 1.20, dn: 1.60 },
    '1A':  { up: 1.00, dn: 1.30 },
    '1B':  { up: 1.00, dn: 1.30 },
    '1C':  { up: 1.00, dn: 1.30 }
  };
  const ICE_LOAD = {
    '1AS': { h0: 1.00, h: 0.35 },
    '1A':  { h0: 0.80, h: 0.30 },
    '1B':  { h0: 0.60, h: 0.25 },
    '1C':  { h0: 0.40, h: 0.22 }
  };
  // c1 midship column from FSICR Reg. 4.2.2 table
  const C1_MIDSHIP = {
    '1AS': 1.00, '1A': 0.85, '1B': 0.70, '1C': 0.50
  };
  const PO_NOMINAL = 5.6; // MPa, constant per Reg. 4.2.2

  // ca per Reg. 4.2.2: ca = (47 − 5·la)/44 capped [0.6, 1.0]
  function ca_from_la(la_m) {
    return Math.max(0.6, Math.min(1.0, (47 - 5 * la_m) / 44));
  }

  // Returns the full FSICR computation for current inputs, or null if disabled.
  // Reads steel grade k/sy from the existing main-tool 'material' selector
  // (which already drives the rest of the tool) so that ice and LR share
  // the same material assumption.
  // Memoization cache: same inputs → return cached result.
  // Cleared by FSICR.invalidate() when any ice-related input changes.
  let _cache = null;
  let _cacheKey = null;

  function compute() {
    const onEl = document.getElementById('iceEnabledOn');
    if (!onEl || !onEl.checked) return null;

    const iceClass = (document.getElementById('iceClass') || {}).value || '1A';
    const T_uiwl   = parseFloat((document.getElementById('ice_T_uiwl') || {}).value) || 0;
    const T_liwl   = parseFloat((document.getElementById('ice_T_liwl') || {}).value) || 0;
    const Disp     = parseFloat((document.getElementById('ice_Disp') || {}).value) || 0;
    const tc       = parseFloat((document.getElementById('ice_tc') || {}).value) || 0;
    const t_floor  = parseFloat((document.getElementById('ice_t_floor') || {}).value) || 0;
    const P0       = parseFloat((document.getElementById('ice_P0') || {}).value) || 0;
    const P0_req   = parseFloat((document.getElementById('ice_P0_required') || {}).value) || 0;
    const framing  = (document.getElementById('ice_framing') || {}).value || 'LONG';
    const mo       = parseFloat((document.getElementById('ice_mo') || {}).value) || 7;

    // Cache key — material is read below, but it's also part of the key.
    const matEl0 = document.getElementById('zoneMaterialSide') || document.getElementById('material');
    const matKey = matEl0 ? matEl0.value : 'AH36';
    const key = `${iceClass}|${T_uiwl}|${T_liwl}|${Disp}|${tc}|${t_floor}|${P0}|${P0_req}|${framing}|${mo}|${matKey}`;
    if (_cacheKey === key && _cache) return _cache;

    // Steel: read from main-tool 'material' selector (shared) → translate to (k, sy)
    // The tool's k values: MS=1.00, AH32=0.78, AH36=0.72, AH40=0.68
    // FSICR uses σy: MS=235, AH32=315, AH36=355, AH40=390
    const matEl = document.getElementById('zoneMaterialSide') || document.getElementById('material');
    const matVal = matEl ? matEl.value : 'AH36';
    const SY_MAP = { MS: 235, AH32: 315, AH36: 355, AH40: 390 };
    const sy = SY_MAP[matVal] || 355;

    // Vertical extents (mm)
    const belt = ICE_BELT_EXTENT_MIDBODY[iceClass];
    const z_top_plate = (T_uiwl + belt.up) * 1000;
    const z_bot_plate = (T_liwl - belt.dn) * 1000;
    const frExt = FRAME_EXTENT_MIDBODY[iceClass];
    const z_top_frame = (T_uiwl + frExt.up) * 1000;
    const z_bot_frame = (T_liwl - frExt.dn) * 1000;

    // Ice load
    const ice = ICE_LOAD[iceClass];
    const h0 = ice.h0;
    const h  = ice.h;

    // Pressure: cd, c1, p (before ca)
    const k_v = Math.sqrt(Disp * P0) / 1000;
    let cd_a, cd_b;
    if (k_v <= 12) { cd_a = 8; cd_b = 214; } else { cd_a = 2; cd_b = 286; }
    const cd = (cd_a * k_v + cd_b) / 1000;
    const c1 = C1_MIDSHIP[iceClass];
    const p_unfactored = cd * c1 * PO_NOMINAL;

    // P0 status
    const P0_absoluteMin = (iceClass === '1AS') ? 2800 : 1000;
    let P0_status = 'OK';
    if (P0 < P0_absoluteMin) P0_status = `BELOW ABS MIN (${P0_absoluteMin} kW)`;
    else if (P0 < P0_req)    P0_status = `BELOW CALC MIN (${P0_req} kW)`;

    // Plate thickness (mm) for a given spacing (mm)
    function plate_t(s_mm, useFloor) {
      const s = s_mm / 1000;
      const ratio = h / s;
      const la_plate = (framing === 'LONG') ? 2 * s : s;
      const ca = ca_from_la(la_plate);
      const pPL = 0.75 * p_unfactored * ca;
      let f_factor, t_net;
      if (framing === 'LONG') {
        let f2;
        if (ratio <= 1.0) f2 = 0.6 + 0.4 / Math.max(ratio, 1e-6);
        else if (ratio < 1.8) f2 = 1.4 - 0.4 * ratio;
        else f2 = 0.68;
        f_factor = f2;
        t_net = 667 * s * Math.sqrt(pPL / (f2 * sy));
      } else {
        let f1 = 1.3 - 4.2 / Math.pow(ratio + 1.8, 2);
        f1 = Math.min(1.0, f1);
        f_factor = f1;
        t_net = 667 * s * Math.sqrt(f1 * pPL / sy);
      }
      const t_total = t_net + tc;
      const t_final = useFloor ? Math.max(t_total, t_floor) : t_total;
      return { s_mm, t_net, t_total, t_final, ca, pPL, f: f_factor };
    }

    // Section modulus (cm³) for a given spacing (mm) and span (mm)
    function sm_req(s_mm, l_mm) {
      const s = s_mm / 1000;
      const l = l_mm / 1000;
      let Z_req, A_req, ca, p_st;
      if (framing === 'LONG') {
        ca = ca_from_la(l);
        p_st = p_unfactored * ca;
        const f3 = 1 - 0.2 * (h / s);
        const f4 = 0.6;
        const m = 13.3;
        Z_req = (f3 * f4 * p_st * h * l * l) / (m * sy) * 1e6;
        A_req = (Math.sqrt(3) * f3 * p_st * h * l) / (2 * sy) * 1e4;
      } else {
        ca = ca_from_la(s);
        p_st = p_unfactored * ca;
        const m_t = (7 * mo) / (7 - 5 * (h / l));
        Z_req = (p_st * s * h * l) / (m_t * sy) * 1e6;
        A_req = null;
      }
      return { s_mm, l_mm, Z_req, A_req, ca, p_st };
    }

    const result = {
      iceClass, framing, sy, tc, t_floor, h0, h, k_v, cd, c1,
      p_unfactored, P0, P0_status,
      z_top_plate, z_bot_plate,
      z_top_frame, z_bot_frame,
      plate_t, sm_req,
    };
    _cache = result;
    _cacheKey = key;
    return result;
  }

  // Public invalidator — called whenever an ice input changes so the next
  // compute() rebuilds from scratch.
  function invalidate() { _cache = null; _cacheKey = null; }

  // Is z-coord (mm above baseline) inside the FSICR Plate Ice Belt zone?
  function inPlateIceBelt(z_mm, ctx) {
    if (!ctx) return false;
    return z_mm >= ctx.z_bot_plate && z_mm <= ctx.z_top_plate;
  }
  // Is z-coord inside the FSICR Frame Ice Strengthening zone?
  function inFrameStrengthening(z_mm, ctx) {
    if (!ctx) return false;
    return z_mm >= ctx.z_bot_frame && z_mm <= ctx.z_top_frame;
  }

  return {
    compute,
    invalidate,
    inPlateIceBelt,
    inFrameStrengthening,
    ICE_BELT_EXTENT_MIDBODY,
    FRAME_EXTENT_MIDBODY,
  };
})();
window.FSICR = FSICR;

// UI — toggle ice panel body collapse
function toggleIcePanelBody() {
  const body = document.getElementById('iceClassBody');
  if (!body) return;
  body.style.display = (body.style.display === 'none') ? '' : 'none';
}
window.toggleIcePanelBody = toggleIcePanelBody;

// Refresh ice display + redraw geometry (waterline overlay) whenever any
// ice-related input changes. recalcAll already covers tables; Draw.render
// repaints the section drawing with the new UIWL/LIWL band positions.
function onIceInputChange() {
  // Clear the FSICR memo cache so the next compute() rebuilds from new inputs
  if (window.FSICR && typeof window.FSICR.invalidate === 'function') {
    window.FSICR.invalidate();
  }
  if (typeof recalcAll === 'function') recalcAll();
  if (window.Draw && typeof window.Draw.render === 'function') {
    try { window.Draw.render(); } catch (_) {}
  }
}
window.onIceInputChange = onIceInputChange;

// UI — react to enable/disable; refresh button state and trigger recalc
function onIceEnabledChange() {
  // Clear the FSICR memo cache (toggle off → next compute returns null;
  // toggle on → first compute rebuilds fresh from inputs)
  if (window.FSICR && typeof window.FSICR.invalidate === 'function') {
    window.FSICR.invalidate();
  }
  const onEl = document.getElementById('iceEnabledOn');
  const enabled = !!(onEl && onEl.checked);
  const btn = document.getElementById('ice_insertBtn');
  if (btn) btn.disabled = !enabled;
  const status = document.getElementById('iceClassStatus');
  if (status) status.textContent = enabled ? 'ENABLED · LR + FSICR governance' : 'DISABLED · click to expand';
  const icon = document.getElementById('iceClassIcon');
  if (icon) icon.style.background = enabled ? 'var(--success)' : 'var(--cyan)';
  if (typeof recalcAll === 'function') recalcAll();
  // Repaint section drawing so the ice waterline overlay appears/disappears
  if (window.Draw && typeof window.Draw.render === 'function') {
    try { window.Draw.render(); } catch (_) {}
  }
}
window.onIceEnabledChange = onIceEnabledChange;

// Refresh the four FSICR display rows in the Setup panel calc-box
function refreshIceDisplay() {
  const ctx = FSICR.compute();
  const setT = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
  if (!ctx) {
    setT('ice_plateExtent_disp', '— mm  (disabled)');
    setT('ice_frameExtent_disp', '— mm  (disabled)');
    setT('ice_p_disp', '— MPa');
    setT('ice_P0_status', '—');
    setT('ice_t_req_disp', '— mm');
    setT('ice_Z_req_disp', '— cm³');
    setT('ice_Z_req_inter_disp', '— cm³');
    setT('ice_governs_disp', '—');
    return;
  }
  setT('ice_plateExtent_disp', `${ctx.z_bot_plate.toFixed(0)} → ${ctx.z_top_plate.toFixed(0)} mm  (Δ=${(ctx.z_top_plate-ctx.z_bot_plate).toFixed(0)})`);
  setT('ice_frameExtent_disp', `${ctx.z_bot_frame.toFixed(0)} → ${ctx.z_top_frame.toFixed(0)} mm  (Δ=${(ctx.z_top_frame-ctx.z_bot_frame).toFixed(0)})`);
  setT('ice_p_disp', `${ctx.p_unfactored.toFixed(3)} MPa  (×c_a per element)`);
  const P0el = document.getElementById('ice_P0_status');
  if (P0el) {
    P0el.textContent = ctx.P0_status;
    P0el.style.color = (ctx.P0_status === 'OK') ? 'var(--success)' : 'var(--error)';
  }

  // Use the current side-shell longitudinal spacing as the reference s.
  // Compute it as the smallest gap among adjacent stiffeners that fall in
  // the Frame zone (a rough but practical proxy).
  const sList = (window.Draw && window.Draw.profiles && window.Draw.profiles.sideShell) || [];
  let s_ref = 705; // sensible fallback
  if (sList.length >= 2) {
    const sortedZ = sList.map(p => p.z).sort((a,b) => a-b);
    const gaps = [];
    for (let i = 1; i < sortedZ.length; i++) {
      const mid = (sortedZ[i] + sortedZ[i-1]) / 2;
      if (FSICR.inFrameStrengthening(mid, ctx)) {
        gaps.push(sortedZ[i] - sortedZ[i-1]);
      }
    }
    if (gaps.length) s_ref = gaps.reduce((a,b)=>a+b,0) / gaps.length;
  }
  // Span: read main-tool web-frame spacing l_e (m → mm)
  const leEl = document.getElementById('le');
  const l_mm = leEl ? (parseFloat(leEl.value) || 1.452) * 1000 : 1452;

  const t = ctx.plate_t(s_ref, true);
  const sm = ctx.sm_req(s_ref, l_mm);
  const sm_inter = ctx.sm_req(s_ref / 2, l_mm);
  setT('ice_t_req_disp', `${t.t_final.toFixed(2)} mm  @ s=${s_ref.toFixed(0)}`);
  setT('ice_Z_req_disp', `${sm.Z_req.toFixed(2)} cm³  @ s=${s_ref.toFixed(0)}`);
  setT('ice_Z_req_inter_disp', `${sm_inter.Z_req.toFixed(2)} cm³  @ s=${(s_ref/2).toFixed(1)}`);

  // "Governs over LR?" — simple heuristic: compare against tool's current
  // bottom long Z_req (a rough sibling proxy). Just informational.
  const lrZreqEl = document.getElementById('bottomZreq');
  const Z_LR = lrZreqEl ? parseFloat(lrZreqEl.value) || 0 : 0;
  const govEl = document.getElementById('ice_governs_disp');
  if (govEl) {
    if (sm.Z_req > Z_LR) {
      govEl.textContent = `YES (Z: ${sm.Z_req.toFixed(0)} > ${Z_LR.toFixed(0)})`;
      govEl.style.color = 'var(--warning)';
    } else {
      govEl.textContent = `NO (Z: ${sm.Z_req.toFixed(0)} ≤ ${Z_LR.toFixed(0)})`;
      govEl.style.color = 'var(--success)';
    }
  }
}
window.refreshIceDisplay = refreshIceDisplay;

// ── INSERT ICE INTERMEDIATE LONGITUDINALS ───────────────────────────────
// For every adjacent pair of side-shell longitudinals whose midpoint falls
// inside the FSICR Frame Ice Strengthening zone, insert a new longitudinal
// at the midpoint. New stiffener inherits profileName from the LOWER neighbour
// (so visual size + section modulus match the adjacent zone). New stiffeners
// are tagged with {ice:true} for later identification (e.g. removal/re-insert).
//
// Re-running the button cleanly removes prior {ice:true} stiffeners first,
// so the user can adjust ice class / waterlines / spacing and click again.
function insertIceIntermediates() {
  const ctx = FSICR.compute();
  if (!ctx) {
    alert('Enable Ice Class Rules first.');
    return;
  }

  // Locate the side-shell profile array. Drawing module exposes it as
  // window.Draw.profiles.sideShell.
  let arr = null;
  if (window.Draw && window.Draw.profiles && Array.isArray(window.Draw.profiles.sideShell)) {
    arr = window.Draw.profiles.sideShell;
  }

  // Lazy-init: if profiles haven't been seeded yet (user clicked the button
  // before the Geometry page activated), trigger a seed.
  if (arr && Array.isArray(arr) && arr.length === 0) {
    if (window.Draw && typeof window.Draw.computeProfiles === 'function') {
      try {
        window.Draw.computeProfiles();
        if (window.Draw.profiles && Array.isArray(window.Draw.profiles.sideShell)) {
          arr = window.Draw.profiles.sideShell;
        }
      } catch (e) { console.error('[ICE] computeProfiles seed failed:', e); }
    }
  }

  if (!arr || !Array.isArray(arr) || arr.length < 2) {
    alert('Need at least 2 side-shell longitudinals to insert intermediates.');
    return;
  }

  // 1) Strip prior ice intermediates
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] && arr[i].ice === true) arr.splice(i, 1);
  }

  // 2) Sort by z
  arr.sort((a, b) => a.z - b.z);

  // 3) Build the "support points" list = side shell stiffeners + horizontal
  //    plates (stringer decks, tween decks) that cross the side shell. These
  //    horizontal plates are NOT stiffeners — they are full-width plates —
  //    but they act as primary supports for the side-shell longitudinal
  //    panel and so create new pair gaps that need to be checked for
  //    ice intermediates.
  //
  //    NOTE: We collect coords only; we DO NOT push intermediates onto the
  //    stringer/tween arrays. The intermediates always go on profiles.sideShell.
  const Pdraw = (window.Draw && window.Draw.profiles) || {};
  const supportZs = arr.map(p => ({ z: p.z, kind: 'stiff', src: p }));
  if (Array.isArray(Pdraw.stringer)) {
    Pdraw.stringer.forEach(p => {
      if (p && typeof p.z === 'number') supportZs.push({ z: p.z, kind: 'stringer', src: p });
    });
  }
  if (Array.isArray(Pdraw.tweenDeck)) {
    Pdraw.tweenDeck.forEach(p => {
      if (p && typeof p.z === 'number') supportZs.push({ z: p.z, kind: 'tween', src: p });
    });
  }
  // De-duplicate exact-match z's (a stiff sometimes sits right on a deck Z;
  // we keep one entry to avoid zero-length midpoints). Tolerance 1 mm.
  supportZs.sort((a, b) => a.z - b.z);
  const dedup = [];
  for (let i = 0; i < supportZs.length; i++) {
    if (i === 0 || Math.abs(supportZs[i].z - supportZs[i-1].z) > 1) {
      dedup.push(supportZs[i]);
    }
  }

  // 4) For every adjacent support pair whose midpoint falls inside the
  //    Frame Strengthening zone, insert an intermediate longitudinal on
  //    the side shell.
  const inserts = [];
  for (let i = 1; i < dedup.length; i++) {
    const lo = dedup[i-1], hi = dedup[i];
    const mid = (lo.z + hi.z) / 2;
    if (FSICR.inFrameStrengthening(mid, ctx)) {
      // Inherit profileName from the lower neighbour if it is a stiffener;
      // Ice intermediates are STRENGTHENING members per FSICR / LR Pt 8 Ch 2;
      // their dimensions are governed by the ice rule, NOT by inheriting the
      // ordinary side-shell stiff above/below. Force FB 160x11 here so the
      // insert never picks up a lighter ordinary-zone profile (e.g. FB 120x10)
      // when the surrounding shell uses a smaller section in the upper bays.
      // If a different section is required, the user can edit the profile
      // dropdown on the stiff after insertion.
      let inheritName = 'FB 160x11';
      inserts.push({
        z: mid,
        profileName: inheritName,
        ice: true,
        // metadata for transparency in the summary
        _between: `${lo.kind}@${lo.z.toFixed(0)} ↔ ${hi.kind}@${hi.z.toFixed(0)}`,
      });
    }
  }

  // 5) Insert into profiles.sideShell ONLY (stringer/tween are unchanged)
  arr.push(...inserts);
  arr.sort((a, b) => a.z - b.z);

  // 5) Update summary
  const summary = document.getElementById('ice_insertSummary');
  if (summary) {
    if (inserts.length === 0) {
      summary.innerHTML = '<strong>No intermediates inserted.</strong>  No adjacent pair midpoint falls inside the Frame Ice Strengthening zone <code>' + ctx.z_bot_frame.toFixed(0) + '–' + ctx.z_top_frame.toFixed(0) + ' mm</code>. Check the ice class and waterline inputs.';
    } else {
      const list = inserts.map(p => `z=${p.z.toFixed(0)} mm (${p.profileName})`).join(' · ');
      summary.innerHTML = `<strong>${inserts.length} ice intermediate longitudinal${inserts.length===1?'':'s'} inserted</strong> on the side shell within Frame Ice Strengthening zone (<code>${ctx.z_bot_frame.toFixed(0)}–${ctx.z_top_frame.toFixed(0)} mm</code>):<br>${list}<br><span style="color:var(--text-muted)">These are now part of profiles.sideShell and will appear in section modulus, slenderness, drawing, and reports automatically.</span>`;
    }
  }

  // 6) Trigger full pipeline rebuild so new intermediates participate in
  //    section properties, strakes, all tables, and the SVG drawing.
  //    Order matters:
  //      a) Switch to Geometry page → mounts SVG, calls Bridge.syncFromScantling
  //         which in turn invokes Draw.sync() → computeStrakes + computeProfiles
  //         + render. Our preserved-ice logic in computeProfiles + applyExcel
  //         keeps the inserted intermediates intact through the rebuild.
  //      b) recalcAll() updates Page-2 tables + Z_req with FSICR governance.
  //      c) Force one extra render pass on a tick after page transition to
  //         catch any deferred SVG mount.
  try {
    if (typeof goToPage === 'function') {
      goToPage(3);
    } else if (typeof window.goToPage === 'function') {
      window.goToPage(3);
    }
  } catch (_) {}
  try { if (typeof recalcAll === 'function') recalcAll(); } catch (_) {}
  // Bridge.syncFromScantling runs on a 50 ms timeout inside goToPage(3);
  // wait slightly longer then force one final render pass.
  try {
    setTimeout(() => {
      if (window.Draw && typeof window.Draw.render === 'function') {
        try { window.Draw.render(); } catch (_) {}
      }
    }, 250);
  } catch (_) {}
}
window.insertIceIntermediates = insertIceIntermediates;

// =========================================================================
// PROFILE STATE — 7 grup
// By default bottom-shell ↔ inner-bottom share the same Y, side-shell ↔ inner-side share the same Z
// (DXF / web frame practice). The '🔗 Linked' toggle in the editor enables/disables
// this alignment. When linked, a change on one side updates the other.
// Stringer (Z=8590) ve Tween Deck (Z=12900) yatay plate'lerdir — bu Z'lerde side/IS stiff
// are automatically SKIPPED (no clashes allowed).
// =========================================================================
const CLASH_TOL = 100;  // mm — side/IS stiffs within this tolerance are treated as clashing with stringer/tween

let profiles = {
  bottomShell:   [],  // [{y}]
  innerBottom:   [],  // [{y}]
  stringerStiff: [],  // [{y}] — stiffeners ON the stringer deck plate (IS → shell horizontal)
  tweenStiff:    [],  // [{y}] — stiffeners ON the tween deck plate (IS → shell horizontal)
  coamingStiff:  [],  // [{y}] — stiffeners ON the coaming top plate (IS → IS+coamingTop)
  sideShell:     [],  // [{z}]
  innerSide:     [],  // [{z}]
  stringer:      [],  // [{z}] — the stringer plate itself
  tweenDeck:     [],  // [{z}] — the tween deck plate itself
  upperDeck:     [],  // [{y}]
  // Side Girder longitudinal intercostal stiffeners — each entry is {z, profileName}
  // representing a horizontal flat-bar running along ship at a given Z on the
  // vertical girder plate. Used for plate-buckling sub-panel division.
  sideGirder0:   [],  // [{z, profileName}] — at Y = SIDE_GIRDERS[0].y
  sideGirder1:   [],  // [{z, profileName}] — at Y = SIDE_GIRDERS[1].y
  sideGirder2:   [],  // [{z, profileName}] — at Y = SIDE_GIRDERS[2].y
};

// Linked alignment: Bottom Shell ↔ Inner Bottom, Side Shell ↔ Inner Side
let linkBS_IB = true;
let linkSS_IS = true;
// Note: Stringer Deck stiff. / Tween Deck stiff. / IB (after-IS) share the same Y positions
// via auto-compute only — they are NOT linked for user edits. User changes each independently.

// =========================================================================
// VIEW MODE — which annotation layer is shown on the drawing
// Options: 'general', 'thickness', 'profile', 'position', 'wt', 'compartment'
// =========================================================================
let VIEW_MODE = 'general';

// ── Measure Tool State ─────────────────────────────────────────────
// When in 'measure' view mode, user clicks two points on the drawing.
// Each point snaps to the nearest: stiff / girder / strake boundary / node / deck line.
// MEASURE.p1 and p2 are in REAL mm coordinates {y, z}.
let MEASURE = { p1: null, p2: null, hover: null };
window.MEASURE = MEASURE;

// ── Band configuration for local optimizer ───────────────────────
// Groups bottom/IB/UD/sideShell/innerSide stiffeners into bands of 3.
// Each band gets its own profile via band-level optimize; users can
// also optimize a single stiffener. Stored per-group as array of
// {start, end} index ranges (inclusive, zero-based).
let BAND_SIZE = 3;               // default stiffeners per band
window.BAND_SIZE = BAND_SIZE;
let BAND_ASSIGNMENTS = {};       // { 'bottomShell': [{start:0,end:2},...], ... }
window.BAND_ASSIGNMENTS = BAND_ASSIGNMENTS;

// Active editor tab
let EDITOR_TAB = 'geometry';  // 'geometry' | 'params' | 'profiles' | 'layers' | 'compartments'

// =========================================================================
// STRAKES — plate width subdivisions (shipbuilding practice)
// Plates are treated as a single continuous surface, divided into strakes.
// Each strake has: width (mm), thickness (mm). Watertightness is a
// panel-level property, not a per-strake one — see WT_FLAGS / Layers tab.
// Shell is ONE continuous plate from keel plate, across bottom, bilge, and side,
// ending at UD. The bilge arc is a single strake.
// =========================================================================
const STRAKE_MIN_CLEAR = 100;                         // mm clearance from any stiff/girder

// Auto-compute state: true = strakes auto-regenerated on recalc, false = preserved
let STRAKES_AUTO = true;

// Currently selected strake (clicked in drawing) — for inspector panel
// { plate: 'shell' | 'innerBottom' | 'innerSide', index: number } or null
let SELECTED_STRAKE = null;

// Currently selected whole plate (non-strake-subdivided plates like decks, girders, coaming, duct)
// String key (e.g. 'stringer', 'tween', 'upperDeck', 'coaming', 'duct', 'sg0', 'sg1'...) or null
let SELECTED_WHOLE_PLATE = null;

// Currently selected stiffener — for stiff inspector panel
// { group: 'bottomShell'|'innerBottom'|'sideShell'|'innerSide'|'stringerStiff'|'tweenStiff'|'coamingStiff'|'upperDeck', index: number } or null
let SELECTED_STIFF = null;

// Currently selected node — for node inspector
// { id: number } or null. Node id corresponds to NODES_CACHE index + 1.
let SELECTED_NODE = null;

// Cache of nodes computed in last render (for click/selection/compartment UI)
let NODES_CACHE = [];

// Selected transverse element — index into TRANSVERSE_STIFFS / BRACKETS
let SELECTED_TRANSVERSE = null;
let SELECTED_BRACKET = null;

// Mirror body toggle — when true, the half-body drawing is mirrored across CL
// to show the full midship section. Purely cosmetic (state/geometry stay half).
let MIRROR_BODY = false;

let strakeWarnings = [];

// Per-plate strakes array. Each strake is { width, thickness, kind? }
// 'kind' can be 'keel' | 'bilge' for special shell strakes, or undefined for regular ones.
let STRAKES = {
  shell:       [],  // keel → UD continuous
  innerBottom: [],  // CL → B_half
  innerSide:   [],  // IB → UD (coaming walls moved to their own group below)
  // ─── Additional plate groups (added so the Profile Editor can list them
  //     and the user can see/edit them as "strakes" even when only one
  //     strake exists per plate). computeSectionProperties iterates these
  //     arrays so future multi-strake subdivision works without rewiring.
  upperDeck:   [],  // IS → B_half horizontal at Z=UD      (typically 1 strake)
  stringer:    [],  // IS → B_half horizontal per stringer plate (one group of strakes per stringer level)
  tween:       [],  // IS → B_half horizontal per tween plate    (one group of strakes per tween level)
  coamingTop:  [],  // IS → IS+coamingTop horizontal at Z=HC  (typically 1 strake)
  // ─── Side Girders — one strake list per girder, panel height = IB (Z=0 → Z=IB).
  sideGirder0: [],  // SG1 — at Y = SIDE_GIRDERS[0].y
  sideGirder1: [],  // SG2 — at Y = SIDE_GIRDERS[1].y
  sideGirder2: [],  // SG3 — at Y = SIDE_GIRDERS[2].y
};

// =========================================================================
// Compute the total "span" of the shell surface along its perimeter.
// Shell = keel plate (half width) + bottom run + bilge arc + side run.
// Returns { total, keel, bottom, bilge, side } where all are mm along the plate.
// =========================================================================
function shellGeometryLengths() {
  const g = GEOMETRY;
  return {
    keel:   g.keel_half,                       // keel plate from CL to keel_half
    bottom: (g.B_half - g.R_B) - g.keel_half,  // keel_half → bilge_start
    bilge:  Math.PI * g.R_B / 2,               // bilge quarter-arc
    side:   g.UD - g.R_B,                      // bilge_end (Z=R_B) → UD
    get total() { return this.keel + this.bottom + this.bilge + this.side; }
  };
}

// =========================================================================
// WT / NON-WT CLASSIFICATION — per structural element
// Only editable for side girders and horizontal decks/plates;
// all other elements (shell, inner bottom, inner side, etc.) are WT by default.
// Keys for girders are indexed ('sg0','sg1',...). Keys for decks use stable names.
// =========================================================================
let WT_FLAGS = {
  // Decks / horizontal plates
  stringerPlate: 'Non-WT',   // Stringer plate at Z=8590
  tweenDeckPlate:'WT',       // Tween deck plate at Z=12900
  upperDeckPlate:'WT',       // Upper deck
  // Side girders — indexed by their array index sg0, sg1, sg2, ...
  sg0: 'Non-WT',
  sg1: 'Non-WT',
  sg2: 'Non-WT',
};

// =========================================================================
// COMPARTMENTS — user-defined regions with label, bounding box, and fluid/load properties.
// Used for "Compartments" view mode + to supply head/pressure to rule checks.
//
// Each compartment carries:
//   name          — display name
//   type          — 'ballast'|'cargo'|'fuel'|'freshwater'|'void'|'cofferdam'
//   rho           — contents density (t/m³). Seawater ballast = 1.025.
//                   For cargo: stowage load (t/m²) is stored in `cargoLoad` instead.
//   airpipeZ_mm   — air pipe / overflow height, mm above BL (tanks only).
//                   Governs h_4 for plate/stiffener deep-tank formulas.
//   testHead_m    — hydrostatic test head (m of water above compartment top),
//                   required by IACS / LR for tanks. Typical = 2.4 m above tank top
//                   or airpipe top, whichever is greater.
//   cargoLoad     — for cargo compartments: stowage pressure in t/m² on IB.
// Geometric fields (either node-based or Y/Z box):
//   yMin, yMax, zMin, zMax  — bounding box (for legacy rect compartments)
//   nodes[]                 — node IDs defining polygon (preferred for 3+ sided shapes)
// =========================================================================
let COMPARTMENTS = [
  { name:'DUCT', type:'void', rho:0, airpipeZ_mm:null, testHead_m:null, cargoLoad:0,
    yMin:0, yMax:900, zMin:0, zMax:1800 },
  { name:'VOID', type:'void', rho:0, airpipeZ_mm:null, testHead_m:null, cargoLoad:0,
    nodes: [16, 18, 17, 15] },
  { name:'CARGO', type:'cargo', rho:0.80, airpipeZ_mm:null, testHead_m:null, cargoLoad:20.0,
    yMin:0, yMax:10030, zMin:1800, zMax:15300 },
  // Ballast tank — explicit user-specified node order (v30).
  // Path: 2 → 3 → 4 → 5 → 6 → 12 → 14 → 16 → 15 → 13 → 11 → 10 → 9 → 8.
  { name:'Ballast', type:'ballast', rho:1.025, airpipeZ_mm:16060, testHead_m:2.4, cargoLoad:0,
    nodes: [2, 3, 4, 5, 6, 12, 14, 16, 15, 13, 11, 10, 9, 8] },
];

// Get compartment at point (y, z). Priority:
//   1. Node-polygon compartments use point-in-polygon (ray casting), NOT bounding box
//      — otherwise L-shaped tanks (DB wing + side tank) would "cover" the cargo hold
//   2. Rect compartments use yMin/yMax/zMin/zMax
//   3. When multiple match, smallest area wins (tightest shape)
function getCompartmentAt(y_mm, z_mm) {
  const matches = [];
  for (let i = 0; i < COMPARTMENTS.length; i++) {
    const c = COMPARTMENTS[i];
    const hasNodes = Array.isArray(c.nodes) && c.nodes.length >= 3;

    let inside = false;
    let bb = null;

    if (hasNodes) {
      // Exact polygon test (ray casting) — NOT bounding box
      const poly = _compartmentPolygonPoints(c);
      if (!poly || poly.length < 3) continue;
      inside = _pointInPolygon(y_mm, z_mm, poly);
      if (!inside) continue;
      bb = _compartmentBoundingBox(c);
    } else if (c.yMin != null) {
      bb = { yMin:c.yMin, yMax:c.yMax, zMin:c.zMin, zMax:c.zMax };
      inside = (y_mm >= bb.yMin && y_mm <= bb.yMax && z_mm >= bb.zMin && z_mm <= bb.zMax);
      if (!inside) continue;
    } else {
      continue;
    }

    const area = bb ? (bb.yMax - bb.yMin) * (bb.zMax - bb.zMin) : Infinity;
    matches.push({ c, area, hasNodes });
  }
  if (!matches.length) return null;
  // Prefer node-polygon matches (more specific); within same type, smallest area
  matches.sort((a, b) => {
    if (a.hasNodes !== b.hasNodes) return a.hasNodes ? -1 : 1;
    return a.area - b.area;
  });
  return matches[0].c;
}

// Resolve polygon vertices (ordered) from a node-based compartment
function _compartmentPolygonPoints(c) {
  if (!Array.isArray(c.nodes) || c.nodes.length < 3) return null;
  const source = (typeof NODES_CACHE !== 'undefined' && NODES_CACHE.length)
    ? NODES_CACHE
    : (window.__NODES_CACHE || []);
  if (!source.length) return null;
  const pts = [];
  for (const id of c.nodes) {
    const n = source.find(x => x.id === id);
    if (!n) continue;
    if (n.realY == null || n.realZ == null) continue;
    pts.push({ y: n.realY, z: n.realZ });
  }
  return pts.length >= 3 ? pts : null;
}

// Ray-casting point-in-polygon test.
// Polygon is an array of {y, z}. Point is (y_mm, z_mm).
function _pointInPolygon(y, z, poly) {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = poly[i].y, zi = poly[i].z;
    const yj = poly[j].y, zj = poly[j].z;
    // Check if the horizontal ray from (y, z) crosses the edge (i-j)
    const intersect = ((zi > z) !== (zj > z)) &&
                      (y < (yj - yi) * (z - zi) / ((zj - zi) || 1e-12) + yi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function _compartmentBoundingBox(c) {
  if (c.yMin != null) return { yMin:c.yMin, yMax:c.yMax, zMin:c.zMin, zMax:c.zMax };
  if (!Array.isArray(c.nodes) || !c.nodes.length) return null;
  // NODES_CACHE is an array of {id, realY, realZ, ...} populated during drawing render
  const source = (typeof NODES_CACHE !== 'undefined' && NODES_CACHE.length)
    ? NODES_CACHE
    : (window.__NODES_CACHE || []);
  if (!source.length) return null;
  let yMin=Infinity, yMax=-Infinity, zMin=Infinity, zMax=-Infinity;
  for (const id of c.nodes) {
    const n = source.find(x => x.id === id);
    if (!n) continue;
    const y = n.realY;
    const z = n.realZ;
    if (y == null || z == null) continue;
    if (y < yMin) yMin = y; if (y > yMax) yMax = y;
    if (z < zMin) zMin = z; if (z > zMax) zMax = z;
  }
  if (!isFinite(yMin)) return null;
  return { yMin, yMax, zMin, zMax };
}
window.getCompartmentAt = getCompartmentAt;
window._compartmentBoundingBox = _compartmentBoundingBox;
window._compartmentPolygonPoints = _compartmentPolygonPoints;
window._pointInPolygon = _pointInPolygon;
// Expose COMPARTMENTS to scantling scope (live binding)
Object.defineProperty(window, 'COMPARTMENTS', { get: () => COMPARTMENTS, configurable: true });

// Transverse structural members — stiffeners spanning between two nodes.
// { n1, n2, size: "120x10", profile: "FB"|"L"|"HP", name?: string }
// Default transverse stiffeners (per user spec, Apr 2026):
//   N2-N8   = Duct wall stiff (FB 120x10)
//   N3-N9   = SG1 stiff       (FB 120x10)
//   N4-N10  = SG2 stiff       (FB 120x10)
// Node numbering (default geometry, after sort: bottom-up, left-to-right):
//   N1=CL/BL, N2=Duct/BL, N3=SG1/BL, N4=SG2/BL, N5=IS/BL, N6=Bilge start,
//   N7=CL/IB, N8=Duct/IB, N9=SG1/IB, N10=SG2/IB, N11=IS/IB, N12=Shell/IB(Bilge end), ...
// User can edit n1/n2 directly in the Trans tab.
// Transverse stiffeners — start empty. Users add their own via the
// Trans tab "+ stiff" button (pick 2 nodes). Previous versions seeded
// three default vertical stiffs (Duct N2-N8, SG1 N3-N9, SG2 N4-N10);
// removed Apr 2026 per user request — defaults now empty so the user
// has full control.
let TRANSVERSE_STIFFS = [];

// Brackets — start empty. Users add their own via the Trans tab
// "+ bracket" button (pick 3+ nodes). Previously seeded with the bilge
// bracket [N6, N12, N11]; removed Apr 2026 per user request.
let BRACKETS = [];

// Pending pick state for adding a transverse element.
// null when idle. Otherwise:
//   { kind: 'stiff', picks: number[] (up to 2) }
//   { kind: 'bracket', picks: number[] (3..8) }
let TRANSVERSE_PICK = null;

// Pending compartment creation/edit state. null = not picking.
// { mode: 'new' | 'edit', editIdx?: number, picks: number[] }  (picks = node IDs, up to 4)
let COMPARTMENT_PICK = null;

// v25+: When the user clicks "✎ Edit Nodes" on a compartment row, that
// compartment's node list expands into an editable, per-node interface
// (rename / replace by ID, swap order, +/- a node, click-pick a single node
// from the drawing). Single integer = COMPARTMENTS index whose row is open.
// `null` = no row is in inline-edit mode. Only one row can be open at a time.
let COMPARTMENT_NODE_EDIT = null;

// When the user is replacing one specific node by clicking on the drawing
// (single-node pick within a row's edit panel), this records which slot to
// fill. Shape: { compIdx, slot } where slot is the array index inside
// COMPARTMENTS[compIdx].nodes / [n1..n4]. Cleared on next click.
let COMPARTMENT_NODE_PICK_SLOT = null;

// Resolve compartment to bounding box { yMin, yMax, zMin, zMax }.
// Supports both node-based (n1..n4) and legacy coord-based compartments.
// Resolve compartment to either a polygon-nodes list or a legacy bounding box.
// Returns { kind:'polygon', nodes:[{x,y,realY,realZ},...] } or
//         { kind:'bbox', yMin, yMax, zMin, zMax } or null.
function compartmentBounds(c) {
  // New-style: array of node IDs (any length 3+)
  if (Array.isArray(c.nodes) && c.nodes.length >= 3) {
    const ns = c.nodes.map(id => NODES_CACHE.find(n => n.id === id)).filter(Boolean);
    if (ns.length < 3) return null;
    return { kind:'polygon', nodes: ns };
  }
  // Legacy: 4 explicit node IDs (n1..n4) → treat as ordered polygon
  if (c.n1 != null && c.n2 != null && c.n3 != null && c.n4 != null) {
    const ids = [c.n1, c.n2, c.n3, c.n4];
    const ns = ids.map(id => NODES_CACHE.find(n => n.id === id)).filter(Boolean);
    if (ns.length !== 4) return null;
    return { kind:'polygon', nodes: ns };
  }
  // Legacy: raw bbox coords
  if (c.yMin != null && c.yMax != null && c.zMin != null && c.zMax != null) {
    return { kind:'bbox', yMin: c.yMin, yMax: c.yMax, zMin: c.zMin, zMax: c.zMax };
  }
  return null;
}

function clashesWithHorizontal(z) {
  // Used to skip side/IS stiffs that are very close to stringer / tween deck Zs
  for (const p of profiles.stringer)   if (Math.abs(p.z - z) <= CLASH_TOL) return true;
  for (const p of profiles.tweenDeck)  if (Math.abs(p.z - z) <= CLASH_TOL) return true;
  return false;
}

// =========================================================================
// STRAKE BOUNDS — plate boundary for each profile group (exclusive: cannot go outside)
// If the user tries to enter a value outside this range, validateStrake() returns false.
// =========================================================================
function strakeBounds(grpKey) {
  const g = GEOMETRY;
  const bilgeStart = g.B_half - g.R_B;
  switch (grpKey) {
    case 'bottomShell':    return { coord:'y', min:g.duct_half, max:bilgeStart,  label:`Bottom Shell (${g.duct_half} < Y < ${bilgeStart})` };
    case 'innerBottom':    return { coord:'y', min:g.duct_half, max:g.B_half,    label:`Inner Bottom (${g.duct_half} < Y < ${g.B_half})` };
    case 'stringerStiff':  return { coord:'y', min:g.IS,        max:g.B_half,    label:`Stringer Deck Stiff. (${g.IS} < Y < ${g.B_half})` };
    case 'tweenStiff':     return { coord:'y', min:g.IS,        max:g.B_half,    label:`Tween Deck Stiff. (${g.IS} < Y < ${g.B_half})` };
    case 'coamingStiff':   return { coord:'y', min:g.IS,        max:g.IS + PARAMS.coamingTop, label:`Coaming Top Stiff. (${g.IS} < Y < ${g.IS + PARAMS.coamingTop})` };
    case 'sideShell':      return { coord:'z', min:g.IB,        max:g.UD,        label:`Side Shell (${g.IB} < Z < ${g.UD})` };
    case 'innerSide':      return { coord:'z', min:g.IB,        max:g.HC,        label:`Inner Side (${g.IB} < Z < ${g.HC})` };
    case 'upperDeck':      return { coord:'y', min:g.IS,        max:g.B_half,    label:`Upper Deck (${g.IS} < Y < ${g.B_half})` };
    case 'stringer':       return { coord:'z', min:g.IB,        max:g.UD,        label:`Stringer Plate (${g.IB} < Z < ${g.UD})` };
    case 'tweenDeck':      return { coord:'z', min:g.IB,        max:g.UD,        label:`Tween Deck Plate (${g.IB} < Z < ${g.UD})` };
    default: return null;
  }
}
function validateStrake(grpKey, value) {
  const b = strakeBounds(grpKey);
  if (!b) return { ok:true };
  if (value <= b.min || value >= b.max) {
    return { ok:false, msg:`${b.label} — out of strake bounds. Value not accepted.` };
  }
  return { ok:true };
}
function validateSideGirder(y) {
  const g = GEOMETRY;
  const bilgeStart = g.B_half - g.R_B;
  if (y <= g.duct_half || y >= bilgeStart) {
    return { ok:false, msg:`Side Girder must be within ${g.duct_half} < Y < ${bilgeStart}. Value not accepted.` };
  }
  return { ok:true };
}

let errToastTimer = null;
function showError(msg, inputEl) {
  const toast = document.getElementById('errToast');
  toast.innerHTML = icon('error','14px') + ' ' + escapeXml(msg);
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '8px';
  toast.classList.add('show');
  if (errToastTimer) clearTimeout(errToastTimer);
  errToastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  if (inputEl) {
    inputEl.classList.add('err');
    setTimeout(() => inputEl.classList.remove('err'), 600);
  }
}

// =========================================================================
// SPACING HELPER — equal stiff distribution within a segment
// Kurallar:
//   • Preferred max: 700mm (segment span/spacing = n gap count)
//   • Acceptable absolute: 550..750 (warnings issued for <550 and >750)
//   • Spacing must be multiple of 5mm (rounded DOWN → small gap left at segment end)
//   • n = ceil(span / target) → at least n gaps
//   • stiff count = n - 1 (excluding boundaries)
// =========================================================================
const SPACING_MIN_WARN = 550;
const SPACING_MAX_WARN = 750;
const SPACING_STEP     = 5;

function divideSegment(start, end, targetSpacing) {
  // Generate stiff Y/Z positions within the segment.
  // Rules (user-confirmed):
  //   - Spacing must be multiple of 5mm — round DOWN (small gap remains at segment end)
  //   - Hard min 550mm → ihlal = HATA
  //   - Hard max 750mm → ihlal = HATA
  //   - Preferred range: 600-700mm
  //   - Last gap (near the girder) is always ≤ step (thanks to down-rounding)
  const result = {
    positions: [], actualSpacing: 0, lastGap: 0, nGaps: 0,
    warnings: [], errors: []
  };
  const span = end - start;
  if (span <= 0) return result;
  if (span < 550) return result;  // Can't fit one spacing, no stiff

  // A zero / missing / non-finite target makes span/targetSpacing infinite,
  // which makes nGaps infinite, and `nGaps--` on Infinity never terminates -
  // the whole app hangs with no error. Reject it up front instead.
  if (!isFinite(targetSpacing) || targetSpacing <= 0) {
    console.error('[divideSegment] bad targetSpacing:', targetSpacing,
                  'for segment', start, '..', end, '- no stiffeners placed');
    result.errors.push('Invalid stiffener spacing (' + targetSpacing + ')');
    return result;
  }

  // nGaps: rounded span/target — gives spacing closest to target
  let nGaps = Math.max(1, Math.round(span / targetSpacing));
  if (!isFinite(nGaps)) {
    console.error('[divideSegment] non-finite nGaps from span', span, 'target', targetSpacing);
    return result;
  }
  // Adjust so spacing stays within hard limits. Both loops are bounded: the
  // span can never need more gaps than one per 5 mm of it.
  const NG_MAX = Math.ceil(span / SPACING_STEP) + 2;
  let ngGuard = 0;
  while (nGaps > 1 && span / nGaps < 550 && ngGuard++ < NG_MAX) nGaps--;   // spacing too small → decrease nGaps
  ngGuard = 0;
  while (span / nGaps > 750 && ngGuard++ < NG_MAX) nGaps++;                 // spacing too large → increase nGaps

  // Spacing: round DOWN (small gap at end, boundary never exceeded)
  const rawStep = span / nGaps;
  const step = Math.floor(rawStep / SPACING_STEP) * SPACING_STEP;
  if (step <= 0) return result;

  // Stiff positions
  for (let k = 1; k < nGaps; k++) {
    result.positions.push(Math.round(start + k * step));
  }
  const lastGap = end - (start + (nGaps - 1) * step);
  result.actualSpacing = step;
  result.nGaps = nGaps;
  result.lastGap = Math.round(lastGap);

  // Hard limit checks
  if (step < 550) {
    result.errors.push(`Spacing ${step}mm < 550mm (hard min violation)`);
  }
  if (step > 750) {
    result.errors.push(`Spacing ${step}mm > 750mm (hard max violation)`);
  }
  if (lastGap < 550 && lastGap > 0) {
    result.errors.push(`Last gap ${Math.round(lastGap)}mm < 550mm`);
  }
  if (lastGap > 750) {
    result.errors.push(`Last gap ${Math.round(lastGap)}mm > 750mm`);
  }

  // Preferred range warnings (600–700)
  if (step >= 550 && step < 600) {
    result.warnings.push(`Spacing ${step}mm — preferred min is 600mm`);
  }
  if (step > 700 && step <= 750) {
    result.warnings.push(`Spacing ${step}mm — preferred max is 700mm`);
  }
  return result;
}

let spacingWarnings = [];  // Populated by computeProfiles, displayed in the editor

  // ════════════════════════════════════════════════════════════════════════
  // EXCEL DEFAULT VALUES (Wagenborg Baltic Laker GC midship 2026-04-29)
  // -----------------------------------------------------------------------
  // Imported from final optimized state. Applied AFTER algorithmic seed so
  // the profile lists / strake widths reflect the as-built design rather
  // than spacing-rule defaults. Geometry-dependent (Y/Z keys must match
  // the algorithmic positions); if a position doesn't match (e.g. user
  // changed sideSpacing), the stiff keeps its algorithmic profile.
  // ════════════════════════════════════════════════════════════════════════
  const EXCEL_DEFAULT_PROFILES = {
    bottomShell: [
      { y: 300, profileName: 'FB 180x13' },   // #1 — offset 300 mm from CL (May 2026, user spec)
      { y: 1600, profileName: 'FB 180x13' },
      { y: 2300, profileName: 'FB 180x13' },
      { y: 3000, profileName: 'FB 165x12' },
      { y: 4400, profileName: 'FB 165x12' },
      { y: 5100, profileName: 'FB 165x12' },
      { y: 5800, profileName: 'FB 165x12' },
      { y: 7205, profileName: 'FB 165x12' },
      { y: 7910, profileName: 'FB 165x12' },
      { y: 8615, profileName: 'FB 165x12' },
      { y: 9320, profileName: 'FB 165x12' },
    ],
    innerBottom: [
      { y: 300, profileName: 'FB 210x15' },   // #1 — offset 300 mm from CL (May 2026, user spec)
      { y: 1600, profileName: 'FB 190x14' },
      { y: 2300, profileName: 'FB 190x14' },
      { y: 3000, profileName: 'FB 190x14' },
      { y: 4400, profileName: 'FB 190x14' },
      { y: 5100, profileName: 'FB 190x14' },
      { y: 5800, profileName: 'FB 190x14' },
      { y: 7205, profileName: 'FB 190x14' },
      { y: 7910, profileName: 'FB 190x14' },
      { y: 8615, profileName: 'FB 195x14' },
      { y: 9320, profileName: 'FB 195x14' },
      { y: 10645, profileName: 'FB 195x14' },
      { y: 11260, profileName: 'FB 185x13' },
    ],
    sideShell: [
      // Synced from Excel export (Wagenborg Baltic Laker GC, 2026-05-15).
      // Variant 1B reference (43 raw rows in Excel; dedup'd to 31 unique z's
      // — the Excel duplicates were an export quirk where each ice
      // intermediate row appeared twice with the same z).
      //
      // FSICR ice strengthening zone (4200..11743 mm) is fully FB 160x11
      // on both ordinary main stiffs AND the {ice:true} intermediates.
      // Outside the ice zone, z=12280 carries FB 170x14 (per Excel),
      // remaining upper stiffs are FB 160x11.
      { z:  2375, profileName: 'FB 160x11' },
      { z:  2950, profileName: 'FB 160x11' },
      { z:  3575, profileName: 'FB 160x11' },
      { z:  4200, profileName: 'FB 160x11' },
      { z:  4512, profileName: 'FB 160x11', ice: true },   // 4200 ↔ 4825
      { z:  4825, profileName: 'FB 160x11' },
      { z:  5137, profileName: 'FB 160x11', ice: true },   // 4825 ↔ 5450
      { z:  5450, profileName: 'FB 160x11' },
      { z:  5762, profileName: 'FB 160x11', ice: true },   // 5450 ↔ 6075
      { z:  6075, profileName: 'FB 160x11' },
      { z:  6387, profileName: 'FB 160x11', ice: true },   // 6075 ↔ 6700
      { z:  6700, profileName: 'FB 160x11' },
      { z:  7012, profileName: 'FB 160x11', ice: true },   // 6700 ↔ 7325
      { z:  7325, profileName: 'FB 160x11' },
      { z:  7637, profileName: 'FB 160x11', ice: true },   // 7325 ↔ 7950
      { z:  7950, profileName: 'FB 160x11' },
      { z:  8270, profileName: 'FB 160x11', ice: true },   // 7950 ↔ 8590 (stringer)
      // stringer @ 8590 — horizontal plate, not a stiffener
      { z:  8897, profileName: 'FB 160x11', ice: true },   // 8590 (stringer) ↔ 9205
      { z:  9205, profileName: 'FB 160x11' },
      { z:  9512, profileName: 'FB 160x11', ice: true },   // 9205 ↔ 9820
      { z:  9820, profileName: 'FB 160x11' },
      { z: 10127, profileName: 'FB 160x11', ice: true },   // 9820 ↔ 10435
      { z: 10435, profileName: 'FB 160x11' },
      { z: 10742, profileName: 'FB 160x11', ice: true },   // 10435 ↔ 11050
      { z: 11050, profileName: 'FB 160x11' },
      { z: 11357, profileName: 'FB 160x11', ice: true },   // 11050 ↔ 11665
      { z: 11665, profileName: 'FB 160x11' },
      { z: 12280, profileName: 'FB 170x14' },
      { z: 13500, profileName: 'FB 160x11' },
      { z: 14100, profileName: 'FB 160x11' },
      { z: 14700, profileName: 'FB 160x11' },
    ],
    innerSide: [
      // Synced from Excel export (Wagenborg Baltic Laker GC, 2026-05-15).
      // Variant 1B reference. Variant 2A keeps the same list but the 2A
      // override block below removes z=10435 and z=11665 (replaced by
      // extra stringer plates).
      { z:  2375, profileName: 'FB 160x11' },
      { z:  2950, profileName: 'FB 140x12' },
      { z:  3575, profileName: 'FB 145x12' },
      { z:  4200, profileName: 'FB 145x12' },
      { z:  4825, profileName: 'FB 145x12' },
      { z:  5450, profileName: 'FB 145x12' },
      { z:  6075, profileName: 'FB 130x11' },
      { z:  6700, profileName: 'FB 130x11' },
      { z:  7325, profileName: 'FB 130x11' },
      { z:  7950, profileName: 'FB 130x11' },
      { z:  9205, profileName: 'FB 170x14' },
      { z:  9820, profileName: 'FB 170x14' },
      { z: 10435, profileName: 'FB 160x11' },
      { z: 11050, profileName: 'FB 160x11' },
      { z: 11665, profileName: 'FB 145x12' },
      { z: 12280, profileName: 'FB 145x12' },
      { z: 13500, profileName: 'FB 145x12' },
      { z: 14100, profileName: 'FB 145x12' },
      { z: 14700, profileName: 'FB 145x12' },
      { z: 15650, profileName: 'FB 200x30' },
      { z: 16000, profileName: 'FB 200x30' },
    ],
    upperDeck: [
      { y: 10647, profileName: 'FB 160x11' },
      { y: 11263, profileName: 'FB 160x11' },
    ],
    stringerStiff: [
      { y: 10645, profileName: 'FB 100x8' },
      { y: 11260, profileName: 'FB 100x8' },
    ],
    tweenStiff: [
      { y: 10645, profileName: 'FB 120x10' },
      { y: 11260, profileName: 'FB 120x10' },
    ],
    coamingStiff: [
      { y: 10980, profileName: 'FB 250x40' },
    ],
    // Side girder longitudinal intercostal stiffeners — 2× FB 100×10 per girder
    // at z = 600 and z = 1200 mm (sub-panel = 600 mm, IB=1800 mm)
    // Sniped-end intercostal: per-bay, frame'lere 25 mm gap.
    sideGirder0: [
      { z: 600,  profileName: 'FB 100x10' },
      { z: 1200, profileName: 'FB 100x10' },
    ],
    sideGirder1: [
      { z: 600,  profileName: 'FB 100x10' },
      { z: 1200, profileName: 'FB 100x10' },
    ],
    sideGirder2: [
      { z: 600,  profileName: 'FB 100x10' },
      { z: 1200, profileName: 'FB 100x10' },
    ],
  };
  const EXCEL_DEFAULT_STRAKES = {
    shell: [
      { width: 900, thickness: 16, kind: 'keel' },
      { width: 2480, thickness: 14, kind: 'bottom' },
      { width: 2280, thickness: 14, kind: 'bottom' },
      { width: 2480, thickness: 14, kind: 'bottom' },
      { width: 1980, thickness: 14, kind: 'bottom' },
      { width: 3100, thickness: 14, kind: 'bilge' },
      { width: 2480, thickness: 14, kind: 'side' },
      { width: 2400, thickness: 14, kind: 'side' },
      { width: 2480, thickness: 16, kind: 'side' },
      { width: 2260, thickness: 16, kind: 'side' },
      { width: 1980, thickness: 16, kind: 'side' },
      { width: 1587, thickness: 20, kind: 'side' },
    ],
    innerBottom: [
      { width: 1240, thickness: 16, kind: 'ibPlate' },
      { width: 2280, thickness: 16, kind: 'ibPlate' },
      { width: 2400, thickness: 16, kind: 'ibPlate' },
      { width: 2480, thickness: 16, kind: 'ibPlate' },
      { width: 2440, thickness: 16, kind: 'ibPlate' },
      { width: 1040, thickness: 16, kind: 'ibPlate' },
    ],
    innerSide: [
      { width: 2380, thickness: 11, kind: 'isPlate' },
      { width: 2480, thickness: 11, kind: 'isPlate' },
      { width: 2480, thickness: 11, kind: 'isPlate' },
      { width: 2480, thickness: 11, kind: 'isPlate' },
      { width: 2280, thickness: 15, kind: 'isPlate' },
      { width: 2450, thickness: 40, kind: 'isPlate' },
    ],
    upperDeck: [
      { width: 1850, thickness: 25, kind: 'upperDeck' },
    ],
    coamingTop: [
      { width: 950, thickness: 40, kind: 'coamingTop' },
    ],
    stringer: [
      { width: 1850, thickness: 10, kind: 'stringer' },
    ],
    tween: [
      { width: 1850, thickness: 12, kind: 'tween' },
    ],
  };

  // ─── VARIANT 2A SHELL THICKNESS OVERRIDES ────────────────────────────
  // Per user spec: 2A uses thicker keel (17), thicker bottom (15) and
  // thicker bilge (15). Side strake thicknesses stay identical to 1B
  // (14/14/16/16/16/20). All non-shell groups (innerBottom, innerSide,
  // decks, coaming, stringer, tween) are also identical to 1B.
  // Widths come from auto-compute (NOT from this Excel pin) for variant 2A
  // because 2A's geometry differs (UD=15500); widths are intentionally NOT
  // overridden here so that getEffectiveDefaultStrakes() falls back to
  // computeStrakes() for 2A — see applyExcelDefaultStrakes().
  const EXCEL_DEFAULT_STRAKES_2A_SHELL_THICKNESS = {
    keel:   17,
    bottom: 15,
    bilge:  15,
    // side: not specified — keep 1B values (14/14/16/16/16/20)
  };

  // ═══════════════════════════════════════════════════════════════════════
  // 2A NON-SHELL STRAKE THICKNESS OVERRIDES (user Excel sheet, May 2026)
  // ───────────────────────────────────────────────────────────────────────
  // 1B uses Excel pin values (innerBottom=16, innerSide=11/15/40, upperDeck=25,
  // coamingTop=40, stringer=10, tween=12). 2A scales everything up per the
  // user's as-built spec sheet. Strake INDEX order is bottom-up:
  //   innerBottom: IB01..IB06 (all 20 mm)
  //   innerSide:   IS01..IS03 = 15 mm, IS04 = 20 mm, IS05 = 25 mm, IS06 (top) = 45 mm
  //   upperDeck:   UD01 = 45 mm (single strake)
  //   coamingTop:  CT01 = 50 mm
  //   stringer0/1/2 (z=8590/10435/11665): all 20 mm
  //   tween:       TD01 = 35 mm
  // Note: stringer0/1/2 entries OVERRIDE the legacy
  // EXCEL_DEFAULT_STRAKES.stringer flat list (10 mm) for 2A — the override
  // block runs after the default loop replaces STRAKES.stringer0/1/2 with
  // their seeded 10 mm.
  // ═══════════════════════════════════════════════════════════════════════
  const EXCEL_DEFAULT_STRAKES_2A_OVERRIDES = {
    // Per-group thickness — index-positional. Use a single number to apply
    // the same thickness to every strake; use an array for per-strake values.
    innerBottom: 20,                       // all 6 strakes → 20 mm
    innerSide:   [15, 15, 15, 20, 25, 45], // bottom→top: IS01-03=15, IS04=20, IS05=25, IS06=45
    upperDeck:   45,                       // single strake
    coamingTop:  50,                       // single strake
    tween:       35,                       // single strake (legacy + per-level)
    // Stringer thickness handled in the per-level block at end of
    // applyExcelDefaultStrakes (STRAKES.stringer0/1/2 = 20 each).
    stringer0:   20,
    stringer1:   20,
    stringer2:   20,
  };


// =========================================================================
// EXCEL DEFAULT APPLIERS
// -------------------------------------------------------------------------
// applyExcelDefaultProfiles(): replace profiles[group] ENTIRELY with the
// Excel list. Each stiff gets its exact y/z coordinate AND profileName from
// the optimized as-built design. Algorithmic seed values are discarded.
// applyExcelDefaultStrakes(): replace STRAKES[group] entirely with the
// Excel list (widths + thicknesses + kinds).
// =========================================================================
// =========================================================================
// _SKIP_EXCEL_DEFAULTS — when true, applyExcelDefaultProfiles/Strakes are
// no-ops. Currently kept false for ALL variants: the Excel pin (profile
// names + ice intermediates) is shared between 1B and 2A because the only
// geometric difference is UD level (15300 vs 15500), and every pinned
// side-shell z is below both UD values. This keeps 2A's profile layout
// identical to 1B's instead of falling back to a bare algorithmic seed.
//
// Exposed on window so the global-scope updateVariantParticulars (defined
// outside the Draw IIFE) can mutate it if a future variant needs the
// algorithmic seed instead of the Excel pin.
// =========================================================================
window._SKIP_EXCEL_DEFAULTS = false;

// =========================================================================
// VARIANT_TWEEN_UD_PROFILES — how many equally-spaced IS longitudinals to
// place in the Tank-Top → Upper-Deck segment. 3 for 1B (default), 4 for 2A.
// Set by updateVariantParticulars(); read by computeProfiles().
// On window for the same cross-IIFE access reason.
// =========================================================================
window.VARIANT_TWEEN_UD_PROFILES = 3;

function applyExcelDefaultProfiles() {
  if (window._SKIP_EXCEL_DEFAULTS) return;
  // Excel pin'i 1B geometrisine (UD=15300, HC=16350) göre kayıtlı sabit
  // z koordinatları taşıyor. Variant 2A (UD=15500) için TT üstündeki ve
  // UD üstündeki sabit z'ler artık eşit aralık vermiyor — bu yüzden
  // sideShell ve innerSide gruplarında Excel pin'i kopyalarken TT üstü
  // stiff'leri güncel UD/HC geometrisine göre yeniden hizalıyoruz.
  // Profil isimleri (FB 120x10 vb.) korunur, sadece z değerleri ölçeklenir.
  //   • TT  → UD : N stiff, step = (UD-TT)/(N+1)   (1B'de 3 stiff, 600 mm;
  //                                                  2A'da 3 stiff, 650 mm)
  //   • UD  → HC : M stiff, step = (HC-UD)/(M+1)   (innerSide only)
  const TT = (typeof GEOMETRY !== 'undefined' && GEOMETRY.TT) || 12900;
  const UD = (typeof GEOMETRY !== 'undefined' && GEOMETRY.UD) || 15300;
  const HC = (typeof GEOMETRY !== 'undefined' && GEOMETRY.HC) || 16350;

  // Variant detection — used at the end of this function to apply 2A-only
  // structural overrides (extra stringer decks replacing side/IS longs).
  const _variantEl = document.getElementById('variant');
  const _variant = (_variantEl && _variantEl.value) ? _variantEl.value : '1B';

  for (const grp in EXCEL_DEFAULT_PROFILES) {
    const ref = EXCEL_DEFAULT_PROFILES[grp];
    if (!Array.isArray(ref)) continue;
    // PRESERVE ICE INTERMEDIATES — see computeProfiles() for context.
    const preservedIce = (Array.isArray(profiles[grp])
      ? profiles[grp].filter(p => p && p.ice === true).map(p => Object.assign({}, p))
      : []);
    // Deep-copy so the global default object isn't mutated by later edits
    let copy = ref.map(p => Object.assign({}, p));

    // Variant-aware re-spacing for sideShell / innerSide upper segments.
    if (grp === 'sideShell' || grp === 'innerSide') {
      // Split the pinned list at TT and UD.
      const below_TT = copy.filter(p => p.z != null && p.z <= TT);
      const ttToUD   = copy.filter(p => p.z != null && p.z >  TT && p.z <  UD);
      const aboveUD  = copy.filter(p => p.z != null && p.z >= UD);

      // Re-distribute the TT→UD stiffeners over the *current* UD level.
      if (ttToUD.length > 0 && UD > TT) {
        const N = ttToUD.length;
        const step = (UD - TT) / (N + 1);
        ttToUD.sort((a, b) => a.z - b.z);
        for (let k = 0; k < N; k++) {
          ttToUD[k].z = Math.round(TT + (k + 1) * step);
        }
      }

      // innerSide carries 2 extra stiffs in the UD→HC span. Re-distribute
      // them so they stay equally spaced regardless of UD level. sideShell
      // doesn't have UD-above pins (it tops out at UD), so this branch
      // only fires for innerSide.
      if (grp === 'innerSide' && aboveUD.length > 0 && HC > UD) {
        const M = aboveUD.length;
        const step = (HC - UD) / (M + 1);
        aboveUD.sort((a, b) => a.z - b.z);
        for (let k = 0; k < M; k++) {
          aboveUD[k].z = Math.round(UD + (k + 1) * step);
        }
      }

      copy = [...below_TT, ...ttToUD, ...aboveUD].sort((a, b) => a.z - b.z);
    }

    profiles[grp] = copy;

    if (preservedIce.length) {
      profiles[grp].push(...preservedIce);
      // Sort by primary coord — y for horizontal groups, z for vertical
      const coordKey = (grp === 'sideShell' || grp === 'innerSide') ? 'z' : 'y';
      profiles[grp].sort((a, b) => (a[coordKey] || 0) - (b[coordKey] || 0));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VARIANT 2A — STRUCTURAL OVERRIDE (user-specified, May 2026)
  // ───────────────────────────────────────────────────────────────────────
  // For variant 2A, the side-shell and inner-side longitudinals at z=10435
  // and z=11665 are removed and replaced by TWO additional horizontal
  // stringer deck plates at those z's (15 mm thick each — see
  // applyExcelDefaultStrakes 2A block). Stiffener layout on each new
  // stringer is identical to the original z=8590 stringer (uses
  // stringerStiff list, same Y positions: y=10645, y=11260).
  //
  // 1B is unaffected and keeps its original side/IS longitudinal layout
  // and a single stringer at z=8590.
  // ═══════════════════════════════════════════════════════════════════════
  if (_variant === '2A') {
    const REMOVE_ZS = [10435, 11665];
    const ZTOL = 1; // mm — exact-match z removal, no fuzzy
    // Drop main (non-ice) stiffeners at z=10435 and z=11665 from sideShell.
    // Ice intermediates carry {ice:true}; they stay in place because the
    // newly-added stringer plates (added below) become their support
    // neighbours instead of the removed main stiffs — geometrically the
    // ice intermediates sit at the exact midpoints between the new
    // stringer z and the next remaining main stiff. See:
    //   (9820 ↔ 10435-stringer) midpoint = 10127  ← existing ice intermediate
    //   (10435-stringer ↔ 11050) midpoint = 10742 ← existing ice intermediate
    //   (11050 ↔ 11665-stringer) midpoint = 11357 ← existing ice intermediate
    if (Array.isArray(profiles.sideShell)) {
      profiles.sideShell = profiles.sideShell.filter(p => {
        if (p.ice === true) return true;  // keep ice intermediates as-is
        return !REMOVE_ZS.some(zr => Math.abs((p.z || 0) - zr) <= ZTOL);
      });
    }
    if (Array.isArray(profiles.innerSide)) {
      profiles.innerSide = profiles.innerSide.filter(p => {
        if (p.ice === true) return true;
        return !REMOVE_ZS.some(zr => Math.abs((p.z || 0) - zr) <= ZTOL);
      });
    }
    // Inject 2 new stringer levels (in addition to the original z=8590).
    // stringerStiff (the per-level stiff layout) is untouched — it already
    // carries the 2 Y positions and the render loop replays them on every
    // stringer plate, so 3 plates × 2 stiffs = 6 stiffs total.
    profiles.stringer = [{ z: 8590 }, { z: 10435 }, { z: 11665 }];
  }
}

function applyExcelDefaultStrakes() {
  if (window._SKIP_EXCEL_DEFAULTS) return;

  // Detect current variant. Default to 1B if the dropdown is missing.
  const variantEl = document.getElementById('variant');
  const variant = (variantEl && variantEl.value) ? variantEl.value : '1B';

  for (const grp in EXCEL_DEFAULT_STRAKES) {
    const ref = EXCEL_DEFAULT_STRAKES[grp];
    if (!Array.isArray(ref) || ref.length === 0) continue;

    // VARIANT 2A — for the shell group, the Excel pin's WIDTHS belong to 1B
    // geometry (UD=15300, side span=13500). For 2A (UD=15500, side span=13700)
    // those pinned side widths sum to 13187 mm which leaves a ~513 mm gap that
    // would render as a stray short strake. Two options:
    //   (a) skip the Excel pin entirely for 2A.shell — algorithmic widths
    //       (computeStrakes()) handle 2A geometry correctly with the new
    //       MIN_LAST_WIDTH=1800 rule.
    //   (b) keep the pinned widths but apply the 2A thickness overrides.
    // We pick (a): on 2A.shell we DO NOT replace STRAKES.shell from the Excel
    // pin — we let computeStrakes() seed it instead. Then we apply the 2A
    // thickness overrides (keel=17, bottom=15, bilge=15) to whatever
    // computeStrakes() produced. Side thicknesses stay at 14 (algorithmic
    // default) because the user wants 1B side values, and 1B's side values
    // (14/14/16/16/16/20) come from the Excel pin which we're skipping.
    // To preserve the 1B side thickness pattern on 2A as well, we apply that
    // pattern manually below.
    if (grp === 'shell' && variant === '2A') {
      // Make sure STRAKES.shell exists with algorithmic widths. If
      // computeStrakes() hasn't run yet or produced an empty list, fall
      // back to the Excel pin layout but with 2A thickness overrides.
      if (!Array.isArray(STRAKES.shell) || STRAKES.shell.length === 0) {
        STRAKES.shell = ref.map(s => Object.assign({}, s));
      }
      // Apply 2A shell thickness overrides by `kind`.
      const TH_2A = EXCEL_DEFAULT_STRAKES_2A_SHELL_THICKNESS;
      STRAKES.shell.forEach((s, idx) => {
        if (TH_2A[s.kind] != null) s.thickness = TH_2A[s.kind];
        // Side strakes: replicate 1B Excel pattern (14, 14, 16, 16, 16, 20)
        // by side-strake index (not overall index).
      });
      // Walk side strakes in order and apply the variant-specific thickness
      // pattern. 1B uses the as-built Excel pattern (14/14/16/16/16/20).
      // 2A uses a thicker upper-half pattern to lift NA + boost Z_D / I_NA
      // for the larger L=216 rule minimums.
      // 2A SIDE_PATTERN updated May 2026 per user Excel sheet:
      // SS07=15, SS08=15, SS09=20, SS10=20, SS11=20, SS12=45.
      const SIDE_PATTERN_1B = [14, 14, 16, 16, 16, 20];
      const SIDE_PATTERN_2A = [15, 15, 20, 20, 20, 45];
      const SIDE_PATTERN = (variant === '2A') ? SIDE_PATTERN_2A : SIDE_PATTERN_1B;
      let sideIdx = 0;
      STRAKES.shell.forEach(s => {
        if (s.kind === 'side') {
          // If the algorithmic side strake count differs from 6 (the pattern
          // length), repeat the last value for any extras and skip any
          // missing trailing values (shorter list ⇒ truncate pattern).
          const t = SIDE_PATTERN[Math.min(sideIdx, SIDE_PATTERN.length - 1)];
          s.thickness = t;
          sideIdx++;
        }
      });
      continue;
    }

    // Default behaviour (1B + all non-shell groups for 2A): replace from pin.
    STRAKES[grp] = ref.map(s => Object.assign({}, s));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VARIANT 2A — NON-SHELL STRAKE THICKNESS OVERRIDES (user Excel, May 2026)
  // ───────────────────────────────────────────────────────────────────────
  // Walks EXCEL_DEFAULT_STRAKES_2A_OVERRIDES and applies the user-specified
  // 2A thicknesses on top of whatever the default loop seeded. Index-positional
  // — if override is a single number it applies to ALL strakes of that group;
  // if it's an array, it applies element-by-index (last value repeats for
  // any trailing strakes beyond the array length, mirroring SIDE_PATTERN).
  // ═══════════════════════════════════════════════════════════════════════
  if (variant === '2A') {
    const OV = EXCEL_DEFAULT_STRAKES_2A_OVERRIDES;
    for (const grp in OV) {
      const arr = STRAKES[grp];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const spec = OV[grp];
      if (typeof spec === 'number') {
        arr.forEach(s => { s.thickness = spec; });
      } else if (Array.isArray(spec)) {
        arr.forEach((s, i) => {
          s.thickness = spec[Math.min(i, spec.length - 1)];
        });
      }
    }
    // Refresh the legacy flat union of stringer levels so any old code path
    // reading STRAKES.stringer (instead of per-level keys) sees the new
    // 20 mm thicknesses too. Same reference-sharing pattern as before.
    if (Array.isArray(STRAKES.stringer0) || Array.isArray(STRAKES.stringer1) || Array.isArray(STRAKES.stringer2)) {
      STRAKES.stringer = [
        ...(STRAKES.stringer0 || []),
        ...(STRAKES.stringer1 || []),
        ...(STRAKES.stringer2 || []),
      ];
    }
  }
}


function computeProfiles() {
  // Clear and regenerate from state (GEOMETRY, PARAMS, SIDE_GIRDERS)
  const g = GEOMETRY;
  const dbSpacing   = PARAMS.dbSpacing;
  const sideSpacing = PARAMS.sideSpacing;
  const warnings = [];

  // ---- BOTTOM SHELL -----------------------------------------------------
  // Boundaries: duct_half (or 0 = CL) + all Side Girders + bilge_start
  // CL stiff (Y=0): always added — acts as centerline keel longitudinal.
  // If there's no duct (duct_half === 0), the auto-spacing starts from CL and
  // the CL stiff is part of the first segment; otherwise CL stiff is separate
  // and the first distributed segment starts at duct_half.
  const sgYs = SIDE_GIRDERS.map(s => s.y).filter(v => !isNaN(v));
  const bilgeStart = g.B_half - g.R_B;
  const bsStart = g.duct_half === 0 ? 0 : g.duct_half;
  const bsBoundaries = [...new Set([bsStart, ...sgYs, bilgeStart])].sort((a,b)=>a-b);

  // CL stiff: previously seeded at Y=0 (on centerline, inside the duct).
  // Per user spec (May 2026), the first Bottom Shell stiffener is offset
  // 300 mm from CL — still inside the duct half-width (900 mm), no longer
  // sitting exactly on the centerline. Applies to BOTH variants (1B, 2A).
  // Same offset is applied to Inner Bottom #1 below.
  const CL_OFFSET = 300;
  const bsYs = [CL_OFFSET];
  bsBoundaries.forEach((b0, i) => {
    if (i === bsBoundaries.length - 1) return;
    const b1 = bsBoundaries[i+1];
    const seg = divideSegment(b0, b1, dbSpacing);
    seg.positions.forEach(p => { if (p > CL_OFFSET) bsYs.push(p); });  // avoid clash with offset CL stiff
    seg.errors.forEach(w => warnings.push({ level:'error', msg:`Bottom Shell [${b0}..${b1}]: ${w}` }));
    seg.warnings.forEach(w => warnings.push({ level:'warn', msg:`Bottom Shell [${b0}..${b1}]: ${w}` }));
  });
  // De-duplicate
  profiles.bottomShell = [...new Set(bsYs)].sort((a,b)=>a-b).map(y => ({ y }));

  // ---- INNER BOTTOM ------------------------------------------------------
  // Shares same Y with Bottom Shell (web frame alignment) in duct..IS range.
  // CL stiff also offset 300 mm from CL (matches Bottom Shell — see above).
  // After IS (IS..B_half side tank tabanı) — aynı segmenti stringer/tween deck stiff'leri
  // de kullanır. Hepsi aynı Y konumlarında hizalı başlar (auto-compute).
  const ibYs = [CL_OFFSET, ...bsYs.filter(y => y > CL_OFFSET && y < g.IS)];
  // IS..B_half segment — deck stiff'leriyle ortak, dbSpacing target
  const afterIS_seg = divideSegment(g.IS, g.B_half, dbSpacing);
  afterIS_seg.positions.forEach(p => ibYs.push(p));
  afterIS_seg.errors.forEach(w => warnings.push({ level:'error', msg:`After-IS deck stiff. [${g.IS}..${g.B_half}]: ${w}` }));
  afterIS_seg.warnings.forEach(w => warnings.push({ level:'warn', msg:`After-IS deck stiff. [${g.IS}..${g.B_half}]: ${w}` }));
  profiles.innerBottom = [...new Set(ibYs)].sort((a,b)=>a-b).map(y => ({ y }));

  // ---- STRINGER & TWEEN DECK (horizontal plates) -------------------------
  // 1B (default): one stringer at z=8590.
  // 2A: three stringers — z=8590 (original) plus z=10435 and z=11665, which
  // replace the side-shell/inner-side longitudinals that previously lived
  // at those z's (user spec, May 2026). Excel pin (applyExcelDefaultProfiles)
  // also applies this same 2A override, so the two paths agree.
  {
    const _variantEl = (typeof document !== 'undefined') ? document.getElementById('variant') : null;
    const _variant = (_variantEl && _variantEl.value) ? _variantEl.value : '1B';
    if (_variant === '2A') {
      profiles.stringer = [{ z: 8590 }, { z: 10435 }, { z: 11665 }];
    } else {
      profiles.stringer = [{ z: 8590 }];
    }
  }
  profiles.tweenDeck = [{ z: 12900 }];
  // ---- STRINGER DECK & TWEEN DECK STIFFENERS ----------------------------
  // Same Y positions as the IB after-IS segment (plates span IS..shell).
  // Render will filter per-plate strake bounds.
  profiles.stringerStiff = afterIS_seg.positions.map(y => ({ y }));
  profiles.tweenStiff    = afterIS_seg.positions.map(y => ({ y }));

  // ---- SIDE SHELL --------------------------------------------------------
  // Boundaries: IB + stringer Zs + tween deck Zs + UD
  // First two profiles in the IB→first-horizontal segment are placed at
  // FIXED positions z=2375 and z=2950 (default user preference), and the
  // remainder of that segment from 2950 to the first horizontal is filled
  // with divideSegment using the standard sideSpacing target. All other
  // segments use divideSegment as usual.
  const horizontalZs = [
    ...profiles.stringer.map(p => p.z),
    ...profiles.tweenDeck.map(p => p.z),
  ];
  const ssBoundaries = [...new Set([g.IB, ...horizontalZs, g.UD])].sort((a,b)=>a-b);
  const ssZs = [];
  const FIXED_LO = 2375, FIXED_HI = 2950;
  ssBoundaries.forEach((b0, i) => {
    if (i === ssBoundaries.length - 1) return;
    const b1 = ssBoundaries[i+1];
    // Detect TT → UD segment (last segment, ending at UD with TT or a tween
    // level as start). User-specified variant override: place exactly
    // window.VARIANT_TWEEN_UD_PROFILES equally-spaced internal stiffeners
    // here so 2A (taller depth) gets the denser layout the user asked for.
    const isTT_UD_segment = (b1 === g.UD) && (b0 < g.UD);
    const N_tween = (typeof window !== 'undefined' && window.VARIANT_TWEEN_UD_PROFILES) || 0;
    if (isTT_UD_segment && N_tween > 0) {
      const N = N_tween;
      const span = b1 - b0;
      const step = span / (N + 1);
      for (let k = 1; k <= N; k++) {
        ssZs.push(b0 + k * step);
      }
    } else if (i === 0 && b0 < FIXED_LO && b1 > FIXED_HI + 100) {
      // First segment (IB→first horizontal): inject the two fixed positions
      // before letting divideSegment handle the rest.
      ssZs.push(FIXED_LO);
      ssZs.push(FIXED_HI);
      const seg = divideSegment(FIXED_HI, b1, sideSpacing);
      seg.positions.forEach(p => ssZs.push(p));
      seg.errors.forEach(w => warnings.push({ level:'error', msg:`Side Shell [${FIXED_HI}..${b1}]: ${w}` }));
      seg.warnings.forEach(w => warnings.push({ level:'warn', msg:`Side Shell [${FIXED_HI}..${b1}]: ${w}` }));
    } else {
      const seg = divideSegment(b0, b1, sideSpacing);
      seg.positions.forEach(p => ssZs.push(p));
      seg.errors.forEach(w => warnings.push({ level:'error', msg:`Side Shell [${b0}..${b1}]: ${w}` }));
      seg.warnings.forEach(w => warnings.push({ level:'warn', msg:`Side Shell [${b0}..${b1}]: ${w}` }));
    }
  });
  // PRESERVE ICE INTERMEDIATES (Apr 2026)
  // Ice intermediate longitudinals carry an {ice:true} tag. They were
  // inserted by the FSICR ice-class panel and are NOT part of the rule-
  // based seed. Save them before reseeding profiles.sideShell so they
  // don't get wiped out by Draw.sync() / Bridge.syncFromScantling().
  const _preservedIce_SS = (Array.isArray(profiles.sideShell)
    ? profiles.sideShell.filter(p => p && p.ice === true).map(p => Object.assign({}, p))
    : []);
  profiles.sideShell = ssZs.map(z => ({ z }));
  // Re-insert preserved ice intermediates and re-sort
  if (_preservedIce_SS.length) {
    profiles.sideShell.push(..._preservedIce_SS);
    profiles.sideShell.sort((a, b) => a.z - b.z);
  }

  // ---- INNER SIDE --------------------------------------------------------
  // Inner Side runs from IB to HC. Below UD it shares longitudinal Z positions
  // with Side Shell (same transverse frame spacing). Between UD and HC the IS
  // wall has TWO equally-spaced longitudinals — i.e. the UD→HC span (1050 mm
  // for HC=16350, UD=15300) is divided into 3 equal segments by 2 stiffs.
  const isZs = ssZs.filter(z => z < g.UD).slice();
  // UD → HC segment: TWO longitudinals between them so the upper part of
  // the IS wall is supported. Force exactly 2 internal positions by
  // dividing the span into 3 equal pieces.
  if (g.HC > g.UD) {
    const span = g.HC - g.UD;
    const step = span / 3;            // 1050/3 = 350 mm for typical geometry
    isZs.push(g.UD + step);           // first internal stiff
    isZs.push(g.UD + 2 * step);       // second internal stiff
  }
  profiles.innerSide = isZs.sort((a,b)=>a-b).map(z => ({ z }));
  // Debug: log final IS profile Z values so we can verify the seed in
  // the browser console. If the count drops from N to fewer later, some
  // other code path is mutating profiles.innerSide post-seed.
  try {
    if (typeof console !== 'undefined') {
      const upStiffs = profiles.innerSide.filter(p => p.z >= g.UD);
      console.log('[IS seed] total=', profiles.innerSide.length,
                  '  UD..HC count=', upStiffs.length,
                  '  zs=', upStiffs.map(p => p.z));
    }
  } catch(_) {}

  // ---- COAMING TOP PLATE STIFFENERS --------------------------------------
  // Coaming top plate (Z=HC, Y=IS..IS+coamingTop).
  // Outboard wall has been removed → top plate is now a cantilever from the
  // inner-side wall. The most critical point is the FREE OUTBOARD EDGE, so a
  // single longitudinal is placed there (Y = IS + coamingTop) — exactly where
  // the outboard wall used to land. No intermediate stiffeners.
  profiles.coamingStiff = [];
  const coamingTopEnd = g.IS + PARAMS.coamingTop;
  if (PARAMS.coamingTop > 0) {
    profiles.coamingStiff.push({ y: coamingTopEnd });
  }

  // ---- UPPER DECK --------------------------------------------------------
  // Upper deck runs from IS to B_half. We place 2 stiffeners with equal
  // spacing, dividing the UD plate into 3 equal segments. The coaming top
  // wall provides additional support inboard, so 2 evenly-spaced longs
  // between IS and B_half cover the panel adequately.
  //
  // Layout:   IS─────┬─────┬─────B_half
  //                s1     s2   (equal spacing = (B_half - IS) / 3)
  profiles.upperDeck = [];
  const udWidth = g.B_half - g.IS;
  if (udWidth > 0) {
    const udSpacing = udWidth / 3;
    for (let k = 1; k <= 2; k++) {
      profiles.upperDeck.push({ y: g.IS + k * udSpacing });
    }
  }

  spacingWarnings = warnings;

  // Apply Excel-default profile names to algorithmically-seeded stiffeners
  // (position-matched within ±10mm tolerance). This pins the as-built
  // scantling so the design opens with the optimized state on every load.
  try { applyExcelDefaultProfiles(); } catch (e) { console.warn('applyExcelDefaultProfiles:', e); }

  // Compute strake seams after profiles are finalized (obstacles include all stiffs and girders)
  computeStrakes();

  // Apply Excel-default strake widths/thicknesses AFTER computeStrakes has
  // built the seam list. This overrides the auto-computed widths with the
  // as-built values.
  try { applyExcelDefaultStrakes(); } catch (e) { console.warn('applyExcelDefaultStrakes:', e); }

  // Clear the profile-property cache. Excel defaults may have changed the
  // profileName for any stiff (e.g. previous session's HP profiles got
  // overwritten by FB), so the cache could hold props for a profile that's
  // no longer used. computeSectionProperties() will repopulate as needed.
  if (typeof window._clearPropsCache === 'function') {
    try { window._clearPropsCache(); } catch (_) {}
  }

  // After Excel defaults are pinned, force a recalc + analysis refresh on
  // next tick so HG stress / buckling UC values shown in the inspector
  // match the as-built section. Without this the inspector renders once
  // before applyExcelDefaultStrakes runs and shows stale σ/σp ratios until
  // the user manually edits something. setTimeout(0) defers until the
  // current call stack unwinds, so the rest of the page initialization
  // (event wiring, render, etc.) finishes first.
  if (typeof window !== 'undefined') {
    setTimeout(() => {
      try {
        if (window.Draw && window.Draw.computeSectionProperties) {
          window.Draw.computeSectionProperties();
        }
        if (typeof recalcAll === 'function') recalcAll();
        if (typeof forceRefreshAnalysis === 'function') forceRefreshAnalysis();
      } catch (_) { /* silent — initial-load refresh is best effort */ }
    }, 50);
  }
}

// =========================================================================
// STRAKE COMPUTATION — compute seams for each plate, using current stiffs/girders
// as obstacles. Fills STRAKE_SEAMS and populates strakeWarnings.
// =========================================================================
// =========================================================================
// Convert a list of strake widths to absolute cumulative position list
// (starting from 'start', values are [start, start+w1, start+w1+w2, ...])
// =========================================================================
function strakeSeamsFromWidths(strakes, start) {
  const seams = [];
  let cursor = start;
  for (let i = 0; i < strakes.length - 1; i++) {
    cursor += strakes[i].width;
    seams.push(cursor);
  }
  return seams;
}

// Map a linear "shell path length" s (0..total) to an {x, y} in SVG coords.
// Shell path: keel plate (Y 0→keel_half along BL), bottom (keel_half→bilge_start along BL),
// bilge quarter-arc, then side (Z R_B→UD along shell line at Y=B_half).
function shellPathPointAt(s) {
  const g = GEOMETRY;
  const L = shellGeometryLengths();
  // Keel segment: along BL from x=0 to x=X(keel_half), Z constant 0
  if (s <= L.keel) {
    const t = s / L.keel;
    return { x: X(t * g.keel_half), y: BASELINE_Y };
  }
  s -= L.keel;
  // Bottom segment: along BL from x=X(keel_half) to x=X(bilge_start)
  if (s <= L.bottom) {
    const t = s / L.bottom;
    const yCoord = g.keel_half + t * (g.B_half - g.R_B - g.keel_half);
    return { x: X(yCoord), y: BASELINE_Y };
  }
  s -= L.bottom;
  // Bilge quarter-arc: from (X(bilge_start), BASELINE_Y) to (X(B_half), Y(R_B))
  // Parametrize angle from 0 (at bottom tangent) to π/2 (at side tangent)
  if (s <= L.bilge) {
    const theta = (s / L.bilge) * (Math.PI / 2);
    const yCoord = (g.B_half - g.R_B) + g.R_B * Math.sin(theta);
    const zCoord = g.R_B - g.R_B * Math.cos(theta);
    return { x: X(yCoord), y: Y(zCoord) };
  }
  s -= L.bilge;
  // Side segment: along Y=B_half from Z=R_B to Z=UD
  if (s <= L.side) {
    const t = s / L.side;
    const zCoord = g.R_B + t * (g.UD - g.R_B);
    return { x: X(g.B_half), y: Y(zCoord) };
  }
  // Past UD — clamp
  return { x: X(g.B_half), y: Y(g.UD) };
}

// =========================================================================
// LOCAL TRANSVERSE STRUCTURE — geometric helpers
// -------------------------------------------------------------------------
// These helpers map user-defined transverse stiffeners (TRANSVERSE_STIFFS)
// and brackets (BRACKETS) to their effect on plate panels and longitudinals.
//
// Per LR Pt 4 Ch 1 Section 1.5:
//   s  = spacing of SECONDARY stiffeners (mm)        — affected by trans stiffs
//   S  = spacing of PRIMARY members (m)              — NOT affected here
//   l_e = effective length of stiffening member (m)  — reduced by brackets
//
// User decision (Apr 2026): "transverse stiffener" = small profile between
// longitudinals, intended to subdivide a panel and reduce s locally.
// Brackets affect stiffener spans (l_e) and bilge-area plate thickness.
// =========================================================================

// Resolve a node ID to its real coordinates {realY, realZ} from NODES_CACHE.
// Returns null if not found or NODES_CACHE is empty.
function resolveNode(id) {
  if (!NODES_CACHE || NODES_CACHE.length === 0) return null;
  return NODES_CACHE.find(n => n.id === id) || null;
}

// Determine which plate (and segment for shell) a (realY, realZ) point lies on.
// Returns { plate: 'shell'|'innerBottom'|'innerSide'|'upperDeck'|'stringer'|'tween'|'coamingTop'|null,
//           segment?: 'bottom'|'side'|'bilge',  // shell only
//           coord: number,    // coordinate in plate's local frame
//           level?: number }  // for stringer/tween — Z level
// Tolerance ~10mm; a point exactly on a plate boundary returns the plate it
// most likely belongs to (preference: bottom>side for shell intersection).
function classifyPointOnPlates(realY, realZ) {
  const g = GEOMETRY;
  const TOL = 10;
  // Inner Bottom (Z = IB, 0 <= Y <= IS)
  if (Math.abs(realZ - g.IB) <= TOL && realY >= -TOL && realY <= g.IS + TOL) {
    return { plate: 'innerBottom', coord: realY };
  }
  // Inner Side (Y = IS, IB <= Z <= HC)
  if (Math.abs(realY - g.IS) <= TOL && realZ >= g.IB - TOL && realZ <= g.HC + TOL) {
    return { plate: 'innerSide', coord: realZ };
  }
  // Upper Deck (Z = UD, IS <= Y <= B_half)
  if (Math.abs(realZ - g.UD) <= TOL && realY >= g.IS - TOL && realY <= g.B_half + TOL) {
    return { plate: 'upperDeck', coord: realY };
  }
  // Coaming Top (Z = HC, IS <= Y <= IS+coamingTop)
  if (Math.abs(realZ - g.HC) <= TOL && PARAMS.coamingTop > 0 &&
      realY >= g.IS - TOL && realY <= g.IS + PARAMS.coamingTop + TOL) {
    return { plate: 'coamingTop', coord: realY };
  }
  // Stringer / Tween decks (any horizontal level between IB and UD, IS<=Y<=B_half)
  for (let i = 0; i < (profiles.stringer || []).length; i++) {
    const z = profiles.stringer[i].z;
    if (Math.abs(realZ - z) <= TOL && realY >= g.IS - TOL && realY <= g.B_half + TOL) {
      return { plate: 'stringer', coord: realY, level: z, levelIdx: i };
    }
  }
  for (let i = 0; i < (profiles.tweenDeck || []).length; i++) {
    const z = profiles.tweenDeck[i].z;
    if (Math.abs(realZ - z) <= TOL && realY >= g.IS - TOL && realY <= g.B_half + TOL) {
      return { plate: 'tween', coord: realY, level: z, levelIdx: i };
    }
  }
  // Shell — bottom (Z ≈ 0, Y from 0 to bilge_start)
  const bilgeStartY = g.B_half - g.R_B;
  if (Math.abs(realZ - 0) <= TOL && realY >= -TOL && realY <= bilgeStartY + TOL) {
    return { plate: 'shell', segment: 'bottom', coord: realY };
  }
  // Shell — side (Y ≈ B_half, Z from R_B to UD)
  if (Math.abs(realY - g.B_half) <= TOL && realZ >= g.R_B - TOL && realZ <= g.UD + TOL) {
    return { plate: 'shell', segment: 'side', coord: realZ };
  }
  // Bilge arc — check radial distance from bilge centre
  const bilgeCY = bilgeStartY;
  const bilgeCZ = g.R_B;
  const dy = realY - bilgeCY;
  const dz = realZ - bilgeCZ;
  if (dy >= -TOL && dz <= TOL) {
    const r = Math.sqrt(dy*dy + dz*dz);
    if (Math.abs(r - g.R_B) <= TOL) {
      return { plate: 'shell', segment: 'bilge', coord: 0 };  // arc — no scalar coord
    }
  }
  return null;
}

// For a transverse stiffener (n1, n2), return the list of plates it crosses
// and where on each plate. A trans stiff is a 1D line between two nodes; if
// both endpoints lie on the same plate type, it acts as a perpendicular
// support that subdivides the panel in the longitudinal direction. If the two
// endpoints lie on different plates, the stiff doesn't subdivide a single
// plate panel (it's a "spanning" element — handled differently or ignored
// for s_eff purposes).
//
// Returns an array of { plate, segment?, level?, coord1, coord2 } entries.
// Empty array if endpoints don't share a plate or NODES_CACHE not built.
function transStiffPlateSegments(ts) {
  const n1 = resolveNode(ts.n1);
  const n2 = resolveNode(ts.n2);
  if (!n1 || !n2) return [];
  const c1 = classifyPointOnPlates(n1.realY, n1.realZ);
  const c2 = classifyPointOnPlates(n2.realY, n2.realZ);
  if (!c1 && !c2) return [];

  // Case A — both endpoints on the SAME plate (same type AND same deck level
  // for stringer/tween, same shell segment for shell). The stiff spans a
  // 1D segment that ACTUALLY subdivides the plate panel.
  if (c1 && c2 && c1.plate === c2.plate) {
    const sameLevel = !(c1.plate === 'stringer' || c1.plate === 'tween') || c1.levelIdx === c2.levelIdx;
    const sameSeg   = (c1.plate !== 'shell') || (c1.segment === c2.segment);
    if (sameLevel && sameSeg) {
      return [{
        plate: c1.plate,
        segment: c1.segment,
        level: c1.level,
        levelIdx: c1.levelIdx,
        coord1: Math.min(c1.coord, c2.coord),
        coord2: Math.max(c1.coord, c2.coord),
        kind: 'span',
      }];
    }
  }

  // Case B — endpoints on DIFFERENT plates (or one endpoint not on any plate).
  // Each endpoint that DOES sit on a plate provides a POINT support to that
  // plate at its (Y,Z) location. This covers the very common case of a
  // VERTICAL trans stiff connecting a bottom-shell node to an IB node
  // (e.g. Duct stiff N2-N8, SG1 stiff N3-N9, SG2 stiff N4-N10): each end
  // contributes a transverse support to the panel it touches.
  //
  // We model the point as a thin segment of width ε so the existing range-
  // overlap test in findCrossingTransStiffs() picks it up. ε = 1 mm.
  const out = [];
  [c1, c2].forEach(c => {
    if (!c) return;
    out.push({
      plate: c.plate,
      segment: c.segment,
      level: c.level,
      levelIdx: c.levelIdx,
      coord1: c.coord - 1,
      coord2: c.coord + 1,
      kind: 'point',
    });
  });
  return out;
}

// For a given (plate, strakeIndex), find all transverse stiffeners that
// cross this strake. Returns: array of { ts, segment, coord_at_strake }.
// "coord_at_strake" is meaningful for the shell side-segment (Z) vs bottom
// (Y); we just return the trans stiff's representative coord on the plate.
//
// The key idea: a trans stiff that crosses a strake means a transverse
// support exists locally at that strake — IF the stiff's path enters or
// touches the strake's range in the strake's coordinate system.
//
// However, since trans stiffs span ACROSS longitudinals (from Long N to
// Long N+1 typically), they don't sit "inside" the strake along the
// longitudinal direction; they sit ACROSS it. Their effect is on the
// SHORT (transverse) direction spacing, NOT on the longitudinal supports.
//
// → Local interpretation: a trans stiff between Long_a and Long_b reduces
//   the effective s for the panel between Long_a and Long_b by acting as a
//   transverse support BETWEEN the two main transverse frames.
//
// For panel-level s_eff calculation, what matters is:
//   "Is there a trans stiff crossing this strake's range?"  If yes,
//   the local trans-direction spacing is reduced.
function findCrossingTransStiffs(plate, strakeIndex) {
  if (!TRANSVERSE_STIFFS || TRANSVERSE_STIFFS.length === 0) return [];
  const range = strakeAbsoluteRange(plate, strakeIndex);
  if (!range) return [];
  const result = [];
  TRANSVERSE_STIFFS.forEach(ts => {
    const segs = transStiffPlateSegments(ts);
    segs.forEach(seg => {
      if (seg.plate !== plate) return;
      // Convert seg coords to strake's coordinate frame
      let s1 = seg.coord1, s2 = seg.coord2;
      if (plate === 'shell') {
        if (seg.segment === 'bottom') {
          // strake range is path coord; bottom path coord = realY (since keel starts at 0)
          // Already in realY. Keep as-is (range coords are also in realY for bottom segment).
        } else if (seg.segment === 'side') {
          // strake range is path coord on side; side path coord = sideStart + (z - IB)
          // ... but seg.coord1/2 are realZ values for side. We need to convert.
          const L = shellGeometryLengths();
          const sideStart = L.keel + L.bottom + L.bilge;
          const g = GEOMETRY;
          const toPath = z => sideStart + (z - g.IB);
          s1 = toPath(seg.coord1);
          s2 = toPath(seg.coord2);
        } else {
          return;  // bilge — skip
        }
      } else if (plate === 'innerSide') {
        // IS strake coord = Z (already matches seg.coord)
      }
      // Check if [s1, s2] overlaps strake range [range.start, range.end]
      const lo = Math.min(s1, s2), hi = Math.max(s1, s2);
      if (hi >= range.start - 5 && lo <= range.end + 5) {
        result.push({ ts, seg, coord1: s1, coord2: s2 });
      }
    });
  });
  return result;
}

// =========================================================================
// LOCAL EFFECTIVE TRANSVERSE SPACING
// -------------------------------------------------------------------------
// The global s_trans (from the input box) is the spacing of the main
// transverse web frames. If user adds local transverse stiffeners between
// two main frames, the effective trans-direction spacing for the panels
// they subdivide becomes smaller.
//
// Simplified model (per LR practice): if there are N user trans stiffs
// uniformly distributed between main frames, s_trans_local = s_trans / (N+1).
// We treat each trans stiff that crosses a given strake as one subdivision.
// If the user adds trans stiffs ONLY in some panels of a strake, the most-
// loaded panel still governs — so we conservatively keep using the global
// s_trans for strakes that have NO crossing trans stiffs, and reduce only
// for strakes that DO.
// =========================================================================
function localTransSpacing(plate, strakeIndex, globalTransSpacing) {
  const crossings = findCrossingTransStiffs(plate, strakeIndex);
  if (crossings.length === 0) return globalTransSpacing;
  // Count UNIQUE trans stiffs (a stiff might appear multiple times if it
  // crosses through different segments — unlikely, but dedupe by ts ref).
  const uniqueStiffs = new Set(crossings.map(c => c.ts));
  const n = uniqueStiffs.size;
  // n local stiffs between two main frames → divides the bay into (n+1) parts
  return globalTransSpacing / (n + 1);
}

// =========================================================================
// BRACKET → STIFFENER SPAN REDUCTION
// -------------------------------------------------------------------------
// A bracket attached to the end of a longitudinal stiffener reduces the
// effective length l_e per LR Pt 3 Ch 3 (Structural idealisation). The
// reduction depends on the bracket arm length la (LR uses the concept of
// "equivalent arm length" — see Pt 3, Ch 10, 3.4.1).
//
// Simplified rule used here (consistent with LR Table 1.6.3 C-coefficients):
//   • One Rule-standard bracket: l_e ≈ l - la/1000  (la in mm, l_e in m)
//   • Two Rule-standard brackets: l_e ≈ l - 2·la/1000
//   • Bracket "arm" defaults to 250 mm if not specified per bracket.
//
// A bracket is associated with a longitudinal if one of the bracket's
// nodes coincides (within tolerance) with a longitudinal's location AND
// another node lies on a transverse member (giving the bracket its arm
// orientation along the longitudinal).
//
// To stay practical and avoid spurious matches, we use a pragmatic rule:
// a bracket "applies" to a longitudinal if it has at least one node within
// ±50mm of the longitudinal's (Y or Z) coordinate on the appropriate plate.
// =========================================================================

// Default bracket arm in mm (LR Rule standard)
const BRACKET_DEFAULT_ARM_MM = 250;

// For a given longitudinal profile (object with .y or .z plus a plate
// designation), find all brackets that connect to it and return total
// equivalent span reduction in metres.
function bracketSpanReductionForLong(longInfo) {
  // longInfo: { plate, y?, z?, level? }
  if (!BRACKETS || BRACKETS.length === 0) return { reduction_m: 0, count: 0 };
  const TOL = 50;
  let count = 0;
  let totalArm_mm = 0;
  BRACKETS.forEach(br => {
    if (!Array.isArray(br.nodes)) return;
    const ns = br.nodes.map(id => resolveNode(id)).filter(Boolean);
    if (ns.length < 3) return;
    // Test if any node sits on/near the longitudinal
    const matches = ns.some(n => {
      const c = classifyPointOnPlates(n.realY, n.realZ);
      if (!c) return false;
      if (c.plate !== longInfo.plate) return false;
      // Check coordinate match
      if (longInfo.y != null && Math.abs(n.realY - longInfo.y) < TOL) return true;
      if (longInfo.z != null && Math.abs(n.realZ - longInfo.z) < TOL) return true;
      return false;
    });
    if (matches) {
      count++;
      totalArm_mm += br.arm_mm || BRACKET_DEFAULT_ARM_MM;
    }
  });
  return { reduction_m: totalArm_mm / 1000, count };
}

// Apply bracket-derived l_e reduction to a base span (m). Enforces LR
// minimum of 1.5 m so we don't underestimate the local design load.
function effectiveLeWithBrackets(baseLe_m, longInfo) {
  const { reduction_m, count } = bracketSpanReductionForLong(longInfo);
  if (count === 0) return baseLe_m;
  const reduced = baseLe_m - reduction_m;
  return Math.max(reduced, 1.5);
}

// =========================================================================
// BILGE BRACKET SPACING CHECK (LR Table 1.5.2 location 3)
// -------------------------------------------------------------------------
// The bilge plating thickness formula is valid only IF transverses or
// adequate bilge brackets are spaced not more than:
//   max_spacing_mm = (8 * t² / (D * R_B)) * sqrt(t / R_B) * 1e6
// apart. We compute this limit and compare with actual bilge bracket spacing.
// Returns { limit_mm, actual_mm, ok, count }.
// =========================================================================
function bilgeBracketCheck(t_mm) {
  const g = GEOMETRY;
  const D = g.D || g.UD / 1000;     // depth in m (UD is in mm)
  const D_m = D > 100 ? D / 1000 : D;  // ensure metres
  const R_B = g.R_B;                // bilge radius in mm
  if (!R_B || !D_m) return null;
  // Convert: t in mm, R_B in mm — formula uses consistent units; LR text gives result in mm
  const limit_mm = (8 * t_mm * t_mm / (D_m * R_B)) * Math.sqrt(t_mm / R_B) * 1e6;
  // Find brackets in the bilge region (any node with a bilge-arc location)
  const bilgeBrackets = BRACKETS.filter(br => {
    if (!Array.isArray(br.nodes)) return false;
    const ns = br.nodes.map(id => resolveNode(id)).filter(Boolean);
    return ns.some(n => {
      const c = classifyPointOnPlates(n.realY, n.realZ);
      return c && c.plate === 'shell' && c.segment === 'bilge';
    });
  });
  // Use global s_trans as a proxy for the actual spacing along the ship's
  // longitudinal axis (since brackets in the cross-section repeat every
  // frame). If no bilge brackets fitted, use just s_trans.
  const transSpacing = parseFloat(document.getElementById('transFrameSpacing')?.value) || 700;
  const actual_mm = transSpacing;  // brackets repeat at every transverse frame
  return {
    limit_mm: Math.round(limit_mm),
    actual_mm,
    ok: actual_mm <= limit_mm,
    count: bilgeBrackets.length,
  };
}

// =========================================================================
// EXPOSE local-structure helpers on window so external modules / tests can
// call them. (They're already in scope for the inline code that needs them,
// but exposing on window also helps with debugging.)
// =========================================================================
window.resolveNode = resolveNode;
window.classifyPointOnPlates = classifyPointOnPlates;
window.transStiffPlateSegments = transStiffPlateSegments;
window.findCrossingTransStiffs = findCrossingTransStiffs;
window.localTransSpacing = localTransSpacing;
window.bracketSpanReductionForLong = bracketSpanReductionForLong;
window.effectiveLeWithBrackets = effectiveLeWithBrackets;
window.bilgeBracketCheck = bilgeBracketCheck;

// =========================================================================
// Compute the actual plate spacing (s) within a strake per LR rules.
// LR defines `s` = max unsupported plate panel width between SUPPORTS, where
// supports include:
//   • Longitudinal stiffeners in this strake
//   • Rigid structural members crossing/touching the strake:
//     - keel edge, duct wall, side girders (for shell/IB)
//     - inner side wall, shell (for IB)
//     - IB level, tank top, stringer/tween decks, upper deck, coaming top (for IS)
//     - IB level (for side-segment shell)
//   • The strake's own boundary seams (end-of-strake)
//
// Algorithm:
//   1. Collect all support positions in strake's coordinate system.
//   2. Clip to strake range (supports strictly inside + both boundaries).
//   3. Return the MAX gap between consecutive supports.
//
// LOCAL TRANSVERSE STIFFENERS (added Apr 2026):
// If user-added trans stiffs cross this strake, the trans-direction
// spacing is locally reduced via localTransSpacing(). This shrinks the
// short-direction support distance, which often becomes the governing
// dimension for plate thickness (LR uses the smaller of the two panel
// dimensions as `s`).
// =========================================================================
function strakeObstacleSpacing(plate, strakeIndex) {
  const g = GEOMETRY;
  const arr = STRAKES[plate];
  if (!arr || !arr[strakeIndex]) return null;
  const range = strakeAbsoluteRange(plate, strakeIndex);
  if (!range) return null;
  
  // Build the list of supports in strake's coordinate system
  let supports_in = [];  // supports STRICTLY inside the strake
  const EPS = 5;  // mm — anything within ±5 mm of a boundary is a boundary itself
  const inside = (c) => (c > range.start + EPS && c < range.end - EPS);
  
  if (plate === 'shell') {
    const L = shellGeometryLengths();
    const bilgeStart = L.keel + L.bottom;
    const sideStart  = bilgeStart + L.bilge;
    
    // On which segment does this strake live?
    if (range.end <= bilgeStart + 0.01) {
      // BOTTOM segment (keel + flat bottom). Coord = Y from CL (path ≈ Y here since keel starts at CL).
      // Supports: bottom longitudinals, keel edge, duct wall, side girders, bilge start
      const candidates = [
        g.keel_half,                                    // keel edge
        g.duct_half || 0,                               // duct wall (if any)
        ...SIDE_GIRDERS.map(sg => sg.y),                // side girders
        g.B_half - g.R_B,                               // bilge tangent point
        ...profiles.bottomShell.map(p => p.y),          // bottom shell longs
      ];
      supports_in = candidates.filter(inside);
    }
    else if (range.start >= sideStart - 0.01) {
      // SIDE segment. Path coord in strake range: [sideStart .. sideStart+L.side]
      // Translate structural deck levels (Z) to path coord: path = sideStart + (z - IB)
      const toPath = z => sideStart + (z - g.IB);
      const candidates = [
        toPath(g.IB),         // IB level (= sideStart, usually boundary)
        toPath(g.TT),         // tank top
        toPath(g.UD),         // upper deck
        toPath(g.HC),         // coaming top
        ...profiles.stringer.map(p => toPath(p.z)),     // stringer deck plates
        ...profiles.tweenDeck.map(p => toPath(p.z)),    // tween deck plates
        ...profiles.sideShell.map(p => toPath(p.z)),    // side shell longs
      ];
      supports_in = candidates.filter(inside);
    }
    else {
      // BILGE segment (arc). Typically no longitudinals but bilge boundaries matter.
      // The strake spans an arc; no intermediate supports. s = full arc length.
      supports_in = [];
    }
  }
  else if (plate === 'innerBottom') {
    // IB coord = Y from CL. Supports: CL, duct wall, side girders, IS, inner-bottom longs.
    const candidates = [
      0,                                              // CL (boundary)
      g.duct_half || 0,                               // duct wall
      ...SIDE_GIRDERS.map(sg => sg.y),                // side girders
      g.IS,                                           // inner side wall (boundary)
      ...profiles.innerBottom.map(p => p.y),          // IB longitudinals
    ];
    supports_in = candidates.filter(inside);
  }
  else if (plate === 'innerSide') {
    // IS coord = Z from BL. Supports: IB, TT, UD, HC, stringer/tween decks, IS longs.
    const candidates = [
      g.IB,                                           // IB (boundary usually)
      g.TT,                                           // tank top
      g.UD,                                           // upper deck
      g.HC,                                           // coaming top (boundary)
      ...profiles.stringer.map(p => p.z),             // stringer decks
      ...profiles.tweenDeck.map(p => p.z),            // tween decks
      ...profiles.innerSide.map(p => p.z),            // IS longitudinals
    ];
    supports_in = candidates.filter(inside);
  }
  
  // Deduplicate (two different kinds of support can share a coordinate)
  supports_in = [...new Set(supports_in.map(v => Math.round(v)))].sort((a, b) => a - b);
  
  // Build full support list including strake boundaries
  const supports = [range.start, ...supports_in, range.end];
  
  // Max gap between consecutive supports in the LONG (longitudinal) direction
  let maxGap = 0;
  for (let i = 1; i < supports.length; i++) {
    const gap = supports[i] - supports[i-1];
    if (gap > maxGap) maxGap = gap;
  }
  
  // SHORT (transverse) direction support: transverse frames/stiffeners support
  // the plate in the other direction. LR's plate formula uses the SMALLER of
  // the two panel dimensions as `s`. If the long-direction max gap exceeds
  // the transverse frame spacing, the transverse frames govern.
  //
  // Example: Bilge strake (no longs inside, long-dir gap = 2827 mm) is still
  // supported by transverse frames every ~700 mm — so s_effective = 700 mm.
  //
  // LOCAL TRANSVERSE STIFFENERS (Apr 2026): if user-added trans stiffs cross
  // this strake, divide the global s_trans by (n+1). Conservative: applies
  // only to strakes where stiffs actually cross.
  const globalTransSpacing = parseFloat(document.getElementById('transFrameSpacing')?.value) || 700;
  const transSpacing = localTransSpacing(plate, strakeIndex, globalTransSpacing);
  const effectiveSpacing = Math.min(maxGap, transSpacing);
  return Math.round(effectiveSpacing);
}

function computeStrakes() {
  const g = GEOMETRY;
  strakeWarnings = [];

  // ─── Schema migration — coaming wall no longer lives in innerSide ──
  // Previous versions stored the inboard coaming wall as a trailing
  // STRAKES.innerSide entry with kind='coamingWall'. Now Inner Side is a
  // single uniform panel IB → HC. Strip any legacy coamingWall entries
  // from innerSide and snap the last strake to fit IS_target exactly.
  if (Array.isArray(STRAKES.innerSide)) {
    const IS_target = g.HC - g.IB;
    // (1) strip coamingWall kind
    STRAKES.innerSide = STRAKES.innerSide.filter(s => s && s.kind !== 'coamingWall');
    // (2) trim trailing strakes while total > target + tolerance
    let guard = 0;
    let total = STRAKES.innerSide.reduce((a, x) => a + (x.width || 0), 0);
    while (total > IS_target + 50 && STRAKES.innerSide.length > 1 && guard++ < 10) {
      const last = STRAKES.innerSide.pop();
      total -= (last.width || 0);
    }
    // (3) if we've got strakes and sum is off by <=50mm, snap last strake exactly
    if (STRAKES.innerSide.length > 0) {
      let sumEarlier = 0;
      for (let k = 0; k < STRAKES.innerSide.length - 1; k++) sumEarlier += (STRAKES.innerSide[k].width || 0);
      const newLast = Math.max(10, Math.round(IS_target - sumEarlier));
      STRAKES.innerSide[STRAKES.innerSide.length - 1].width = newLast;
    }
  }
  // Drop any STRAKES.coamingWall left over from a saved file — outboard wall
  // is no longer part of the section.
  delete STRAKES.coamingWall;

  // If user has disabled auto-compute, don't regenerate — preserve manual edits
  if (STRAKES_AUTO) {
    // Preserve previously assigned thicknesses by (index, kind) when regenerating.
    // Without this, any optimize-run result is silently wiped whenever Draw.sync
    // re-triggers computeStrakes (e.g. geometry-param change, render refresh).
    const prevShell = Array.isArray(STRAKES.shell) ? STRAKES.shell.slice() : null;
    const prevIB    = Array.isArray(STRAKES.innerBottom) ? STRAKES.innerBottom.slice() : null;

    const shellLen = shellGeometryLengths();
    const shellStrakes = [];
    shellStrakes.push({ width: shellLen.keel, thickness: 16, kind:'keel' });
    const bottomWidths = autoComputeWidthList(shellLen.bottom, 2480);
    bottomWidths.forEach(w => shellStrakes.push({ width: w, thickness: 14, kind:'bottom' }));
    shellStrakes.push({ width: Math.round(shellLen.bilge), thickness: 14, kind:'bilge' });
    const sideWidths = autoComputeWidthList(shellLen.side, 2480);
    sideWidths.forEach(w => shellStrakes.push({ width: w, thickness: 14, kind:'side' }));

    // Overlay any previously set thicknesses, grades, and manual flags by
    // matching index+kind. Without this, regenerating strakes (e.g. on a
    // geometry-param change) silently wipes user grade/family overrides.
    if (prevShell) {
      shellStrakes.forEach((s, idx) => {
        const p = prevShell[idx];
        if (p && p.kind === s.kind) {
          if (p.thickness != null) s.thickness = p.thickness;
          if (p.grade) s.grade = p.grade;
          if (p.gradeManual) s.gradeManual = p.gradeManual;
          if (p.materialFamily) s.materialFamily = p.materialFamily;
          if (p.materialClass != null) s.materialClass = p.materialClass;
        }
      });
    }
    STRAKES.shell = shellStrakes;

    const ibWidths = autoWidthListHalfStart(g.B_half, 2480);
    const newIB = ibWidths.map((w, i) => ({
      width: w,
      thickness: 13,
      kind: i === 0 ? 'half' : undefined
    }));
    if (prevIB) {
      newIB.forEach((s, idx) => {
        const p = prevIB[idx];
        if (p) {
          if (p.thickness != null) s.thickness = p.thickness;
          if (p.grade) s.grade = p.grade;
          if (p.gradeManual) s.gradeManual = p.gradeManual;
          if (p.materialFamily) s.materialFamily = p.materialFamily;
          if (p.materialClass != null) s.materialClass = p.materialClass;
        }
      });
    }
    STRAKES.innerBottom = newIB;

    // IS span: IB → HC (total = target panel size).
    // Split evenly into N strakes, last one absorbs the remainder.
    // No special coaming-wall handling — it's just a regular panel.
    const isSpanTotal = g.HC - g.IB;     // full panel size
    const TARGET_STRAKE = 2700;
    let N_IS = Math.max(1, Math.round(isSpanTotal / TARGET_STRAKE));
    const mainEach = Math.round(isSpanTotal / N_IS / 10) * 10;  // round to 10mm
    const isWidths = [];
    let covered = 0;
    for (let i = 0; i < N_IS - 1; i++) {
      isWidths.push(mainEach);
      covered += mainEach;
    }
    // Last strake absorbs the remainder so sum exactly matches panel size
    isWidths.push(isSpanTotal - covered);

    STRAKES.innerSide = isWidths.map((w, i) => {
      const isLast = (i === N_IS - 1);
      let t;
      // Last strake (top of inner side, near HC) is upgraded to 40 mm —
      // this is the strake that takes the highest hull-girder stress
      // (furthest from NA) and also forms the seat for the coaming top
      // plate cantilever now that the outboard coaming wall is gone.
      if (isLast) {
        t = 40;
      } else {
        const frac = i / Math.max(N_IS - 1, 1);
        if (frac < 0.4)      t = 11;
        else if (frac < 0.7) t = 11;
        else                 t = 13;
      }
      return { width: w, thickness: t };
    });

    // ─── NEW STRAKE GROUPS ─────────────────────────────────────────────
    // Seed coamingTop, upperDeck and dynamic stringer/tween groups from the
    // current geometry. Only regenerate if the group is empty (preserve any
    // user edits on subsequent calls).
    //
    // Coaming wall (outboard, UD → HC) was REMOVED. The horizontal coaming-top
    // plate at Z=HC is still seeded — it's now structurally a cantilever from
    // the inner-side wall (which is unchanged).
    // Coaming top: single horizontal strake at Z=HC, IS → IS+coamingTop.
    if (STRAKES.coamingTop.length === 0 && PARAMS.coamingTop > 0) {
      STRAKES.coamingTop = [
        { width: PARAMS.coamingTop, thickness: (PLATE_THICKNESS.coaming || 20), kind: 'coamingTop' },
      ];
    }
    // Upper Deck: single horizontal strake at Z=UD, IS → B_half.
    if (STRAKES.upperDeck.length === 0) {
      STRAKES.upperDeck = [
        { width: Math.max(0, g.B_half - g.IS), thickness: (PLATE_THICKNESS.upperDeck || 15), kind: 'upperDeck' },
      ];
    }
    // Stringer plates: one strake per stringer level in profiles.stringer.
    // We store them as a flat array; each strake carries its level z in `z_level` so
    // the section loop + editor can display it.
    // Regenerate every call because stringer count is user-editable (add/remove).
    // Stringer decks — one strake list per level. Panel: Y=IS → Y=B_half.
    // Each level lives in STRAKES['stringer' + i]. Legacy STRAKES.stringer
    // (flat array) is kept in sync for backward compat with old section-prop
    // code and saved projects.
    {
      const desired = (profiles.stringer || []).filter(p => p.z > g.IB && p.z < g.UD);
      const panelWidth = Math.max(0, g.B_half - g.IS);
      // Purge any stringer* keys that no longer correspond to a current level
      Object.keys(STRAKES).forEach(k => {
        const m = k.match(/^stringer(\d+)$/);
        if (m && parseInt(m[1]) >= desired.length) delete STRAKES[k];
      });
      const flat = [];
      desired.forEach((p, i) => {
        const key = 'stringer' + i;
        const prevLevel = STRAKES[key];
        if (!prevLevel || prevLevel.length === 0) {
          // Seed a single full-width strake
          STRAKES[key] = [{
            width: panelWidth,
            thickness: (PLATE_THICKNESS.stringer || 10),
            kind: 'stringer',
            z_level: p.z,
          }];
        } else {
          // Preserve user edits; just refresh z_level in case the level moved
          prevLevel.forEach(s => { s.z_level = p.z; });
        }
        flat.push(...STRAKES[key]);
      });
      // Keep the flat legacy array as a union for any old code paths
      STRAKES.stringer = flat;
    }
    // Tween deck plates: one strake list per level (STRAKES.tween0, tween1, ...).
    // Legacy STRAKES.tween flat array kept in sync for backward compat.
    {
      const desired = (profiles.tweenDeck || []).filter(p => p.z > g.IB && p.z < g.UD);
      const panelWidth = Math.max(0, g.B_half - g.IS);
      // Purge stale tweenN keys
      Object.keys(STRAKES).forEach(k => {
        const m = k.match(/^tween(\d+)$/);
        if (m && parseInt(m[1]) >= desired.length) delete STRAKES[k];
      });
      const flat = [];
      desired.forEach((p, i) => {
        const key = 'tween' + i;
        const prevLevel = STRAKES[key];
        if (!prevLevel || prevLevel.length === 0) {
          STRAKES[key] = [{
            width: panelWidth,
            thickness: (PLATE_THICKNESS.tween || 10),
            kind: 'tween',
            z_level: p.z,
          }];
        } else {
          prevLevel.forEach(s => { s.z_level = p.z; });
        }
        flat.push(...STRAKES[key]);
      });
      STRAKES.tween = flat;
    }

    // Side Girders — one strake list per girder. Panel height = IB (Z=0 → Z=IB).
    // Each girder is at Y = SIDE_GIRDERS[i].y. Seed with a single full-height
    // strake; the user can add / edit strakes via the Profile Editor.
    for (let sgIdx = 0; sgIdx < 3; sgIdx++) {
      const key = 'sideGirder' + sgIdx;
      const girder = SIDE_GIRDERS[sgIdx];
      if (!girder) { STRAKES[key] = []; continue; }
      // Only seed if empty (preserve user edits on subsequent recompute calls)
      if (!STRAKES[key] || STRAKES[key].length === 0) {
        STRAKES[key] = [{
          width: g.IB,
          thickness: (PLATE_THICKNESS.sideGirder || PLATE_THICKNESS.sg || 11),
          kind: 'sideGirder',
          y_position: girder.y,
        }];
      }
    }
  }

  // Adjust strake widths so boundaries don't fall within 100mm of any stiff/girder/deck
  adjustShellStrakes();
  adjustIBStrakes();
  adjustISStrakes();
  
  // Assign names, IDs and per-strake spacings
  _assignStrakeNamesAndSpacing();
}

// Assign each strake a canonical name (e.g. "Shell-1 (Keel)", "IB-3", "IS-2"),
// a stable ID, and a computed spacing_mm based on nearest obstacles.
// Preserves user-edited spacing_manual if set.
function _assignStrakeNamesAndSpacing() {
  // Kind → human label map
  const kindLabel = {
    keel:   'Keel',
    bottom: 'Bottom',
    bilge:  'Bilge',
    side:   'Side',
    half:   'Centre',
  };
  
  ['shell', 'innerBottom', 'innerSide'].forEach(plate => {
    const arr = STRAKES[plate];
    if (!arr) return;
    const prefix = plate === 'shell' ? 'SH' : (plate === 'innerBottom' ? 'IB' : 'IS');
    arr.forEach((s, i) => {
      const num = i + 1;
      s.id = s.id || `${prefix}-${num}`;
      const kindTag = s.kind ? ` (${kindLabel[s.kind] || s.kind})` : '';
      s.name = `${prefix}-${num}${kindTag}`;
      // Compute spacing from nearest obstacles (unless user manually set)
      if (s.spacing_manual == null) {
        const auto = strakeObstacleSpacing(plate, i);
        s.spacing_mm = auto != null ? auto : s.width;
        s.spacing_auto = true;
      } else {
        s.spacing_mm = s.spacing_manual;
        s.spacing_auto = false;
      }
    });
  });
}

// --- Apply clearance adjustment to Shell strakes ---
// Shell has multiple segments; boundaries of bottom strakes are Y coords on BL,
// boundaries of side strakes are Z coords on the shell line. We process them
// separately since obstacles differ per segment.
function adjustShellStrakes() {
  const g = GEOMETRY;
  const L = shellGeometryLengths();

  // Find segment boundaries within STRAKES.shell
  // Segment order: keel (1 strake) | bottom (N strakes) | bilge (1 strake) | side (M strakes)
  const kinds = STRAKES.shell.map(s => s.kind);
  const bottomStart  = kinds.indexOf('bottom');
  const bottomEnd    = kinds.lastIndexOf('bottom');
  const sideStart    = kinds.indexOf('side');
  const sideEnd      = kinds.lastIndexOf('side');

  // Bottom strake obstacles: SG Y positions + bottom stiff Y positions
  if (bottomStart >= 0) {
    const obstacles = [
      ...SIDE_GIRDERS.map(s => s.y),
      ...profiles.bottomShell.map(p => p.y),
    ];
    const segment = STRAKES.shell.slice(bottomStart, bottomEnd + 1);
    // Start offset for bottom segment = end of keel strake = L.keel
    adjustStrakeWidthsForClearance(segment, L.keel, obstacles, 'Shell (bottom)');
    for (let i = 0; i < segment.length; i++) STRAKES.shell[bottomStart + i] = segment[i];
  }

  // Side strake obstacles: side stiff Z positions + stringer/tween Z
  // ICE INTERMEDIATE EXCLUSION (Apr 2026): {ice:true} stiffeners are tagged
  // by the FSICR ice-class panel and represent intermediate buckling supports.
  // Plate seams may cross over them in shipbuilding practice, so they are
  // NOT obstacles for strake seam placement. The plate strake list stays
  // unchanged when ice intermediates are added/removed; only the section
  // properties + Z_req calculations consume the ice stiffs.
  if (sideStart >= 0) {
    const obstacles = [
      ...profiles.sideShell.filter(p => p && p.ice !== true).map(p => p.z),
      ...profiles.stringer.map(p => p.z),
      ...profiles.tweenDeck.map(p => p.z),
    ];
    const segment = STRAKES.shell.slice(sideStart, sideEnd + 1);
    adjustStrakeWidthsForClearance(segment, g.R_B, obstacles, 'Shell (side)');
    for (let i = 0; i < segment.length; i++) STRAKES.shell[sideStart + i] = segment[i];
  }
}

function adjustIBStrakes() {
  const obstacles = [
    GEOMETRY.duct_half,
    GEOMETRY.IS,
    ...SIDE_GIRDERS.map(s => s.y),
    ...profiles.innerBottom.map(p => p.y),
  ];
  adjustStrakeWidthsForClearance(STRAKES.innerBottom, 0, obstacles, 'Inner Bottom');
}

function adjustISStrakes() {
  // Ice-tagged intermediates excluded from seam clearance — see adjustShellStrakes.
  const obstacles = [
    GEOMETRY.UD,
    ...profiles.innerSide.filter(p => p && p.ice !== true).map(p => p.z),
    ...profiles.stringer.map(p => p.z),
    ...profiles.tweenDeck.map(p => p.z),
  ];
  adjustStrakeWidthsForClearance(STRAKES.innerSide, GEOMETRY.IB, obstacles, 'Inner Side');
}

// =========================================================================
// STRAKE WIDTH GENERATOR — USER RULE:
//   - All strakes = 2480 (preferred) fixed width.
//   - Last strake is the remainder. If remainder < 1980 (too narrow), shrink
//     previous strake to 1980, give extra to last. If remainder > 2980 (too wide),
//     split into two.
//   - After initial generation, if any strake BOUNDARY falls within MIN_CLEAR
//     of a stiff/girder, adjust that strake's width so the boundary clears.
// =========================================================================

function autoComputeWidthList(span, target) {
  // USER RULE (v85+ updated):
  //   Fill with 2480 + 1980 combinations to cover span.
  //   Priority: MAXIMIZE 2480 count (prefer larger strakes).
  //   HARD CONSTRAINT: last strake (the leftover) must be >= MIN_LAST_WIDTH (1800 mm)
  //     OR exactly 0 (i.e. span divisible by 2480/1980 combo). Tiny end strakes
  //     (<1800 mm) are no longer permitted — they get absorbed into the
  //     previous strake by dropping one big-strake count, which yields a
  //     larger leftover that meets the minimum.
  //   Trade-off: when the only feasible combo is "drop one 2480, leftover
  //     becomes 2480 + small_remainder", the last strake becomes larger than
  //     2480 (e.g. 3580 mm for 1B side span 13500). This is acceptable per
  //     user spec — a single oversized last strake is preferable to a
  //     too-narrow one for stiffener spacing and clearance reasons.
  if (span <= 0) return [];
  if (span < 1500) return [Math.round(span)];

  const S_BIG = 2480;
  const S_SMALL = 1980;
  const MIN_LAST_WIDTH = 1800;  // user requirement: last strake >= 1800 mm

  let best = null;
  const maxA = Math.floor(span / S_BIG);
  // Explore all (a, b) combinations where a*2480 + b*1980 <= span
  for (let a = 0; a <= maxA; a++) {
    const afterA = span - a * S_BIG;
    const maxB = Math.floor(afterA / S_SMALL);
    for (let b = 0; b <= maxB; b++) {
      const covered = a * S_BIG + b * S_SMALL;
      const leftover = span - covered;
      // Skip combinations whose leftover would be a too-narrow last strake.
      // Leftover of exactly 0 (span perfectly covered) is allowed.
      if (leftover > 0 && leftover < MIN_LAST_WIDTH) continue;
      // Score: prefer more 'a', then less leftover, slight penalty for 'b'
      const score = -a * 100000 + b + leftover / 10;
      if (!best || score < best.score) best = { a, b, covered, score };
    }
  }
  // Safety fallback if no combo satisfies the MIN_LAST_WIDTH constraint —
  // divide span evenly into roughly target-sized strakes.
  if (!best) {
    const n = Math.max(1, Math.round(span / S_BIG));
    const w = Math.round(span / n);
    const widths = [];
    for (let i = 0; i < n - 1; i++) widths.push(w);
    widths.push(span - w * (n - 1));
    return widths;
  }

  // Build widths: 2480s first, then 1980s, then the remainder
  const widths = [];
  for (let i = 0; i < best.a; i++) widths.push(S_BIG);
  for (let i = 0; i < best.b; i++) widths.push(S_SMALL);
  const remainder = span - best.covered;
  if (remainder > 0) widths.push(Math.round(remainder));
  return widths;
}

// Half-strake start for CL symmetric plates (first strake = target/2)
function autoWidthListHalfStart(span, target) {
  const half = Math.round(target / 2 / 10) * 10;  // e.g. 1240 for 2480
  if (span < half + 1500) {
    return [Math.round(span)];
  }
  const remaining = span - half;
  const fullStrakes = autoComputeWidthList(remaining, target);
  return [half, ...fullStrakes];
}

// =========================================================================
// Adjust strake widths so no strake boundary falls within MIN_CLEAR of any
// obstacle (stiff, girder, deck). Boundaries are shifted by modifying adjacent
// strake widths.
// =========================================================================
function adjustStrakeWidthsForClearance(strakes, startOffset, obstacles, label) {
  if (!strakes.length) return;
  const sortedObstacles = [...new Set(obstacles)].filter(o => o > 0).sort((a,b)=>a-b);
  // Compute cumulative boundaries
  let changed = true, pass = 0;
  while (changed && pass < 20) {
    changed = false;
    pass++;
    let cursor = startOffset;
    for (let i = 0; i < strakes.length - 1; i++) {
      cursor += strakes[i].width;
      const boundary = cursor;
      // Find nearest obstacle
      let nearest = null, minD = Infinity;
      sortedObstacles.forEach(o => {
        const d = Math.abs(o - boundary);
        if (d < minD) { minD = d; nearest = o; }
      });
      if (nearest === null || minD >= STRAKE_MIN_CLEAR) continue;
      // Boundary too close to obstacle — shift it away
      const targetBoundary = boundary >= nearest
        ? nearest + STRAKE_MIN_CLEAR
        : nearest - STRAKE_MIN_CLEAR;
      const delta = Math.round((targetBoundary - boundary) / 10) * 10;
      if (delta === 0) continue;
      const newThisWidth = strakes[i].width + delta;
      const newNextWidth = strakes[i+1].width - delta;
      // Only apply if both remain within reasonable range
      if (newThisWidth >= 1200 && newNextWidth >= 1200 && newThisWidth <= 3500 && newNextWidth <= 3500) {
        strakes[i].width = newThisWidth;
        strakes[i+1].width = newNextWidth;
        cursor = startOffset;
        for (let k = 0; k <= i; k++) cursor += strakes[k].width;  // recompute cursor after shift
        strakeWarnings.push(`${label}: strake ${i+1} width adjusted to ${newThisWidth}mm (clearance from obstacle at ${nearest}mm)`);
        changed = true;
        break;  // restart from beginning
      } else {
        strakeWarnings.push(`${label}: boundary at ${boundary}mm too close to obstacle at ${nearest}mm — can't adjust within limits`);
      }
    }
  }
}

// =========================================================================
// EDITOR UI — profile groups + link toggles
// =========================================================================
const EDITOR_GROUPS = [
  { key:'bottomShell',   label:'Bottom Shell',             coord:'y', color:'#ef4444', prefix:'BS',   link:'linkBS_IB',        linkWith:'innerBottom' },
  { key:'innerBottom',   label:'Inner Bottom',             coord:'y', color:'#3b82f6', prefix:'IB',   link:'linkBS_IB',        linkWith:'bottomShell' },
  { key:'stringerStiff', label:'Stringer Deck Stiff.',     coord:'y', color:'#a855f7', prefix:'SD'   },
  { key:'tweenStiff',    label:'Tween Deck Stiff.',        coord:'y', color:'#06b6d4', prefix:'TD'   },
  { key:'coamingStiff',  label:'Coaming Top Stiff.',       coord:'y', color:'#f59e0b', prefix:'CT'   },
  { key:'sideShell',     label:'Side Shell',               coord:'z', color:'#ef4444', prefix:'SS',   link:'linkSS_IS',        linkWith:'innerSide'   },
  { key:'innerSide',     label:'Inner Side',               coord:'z', color:'#22c55e', prefix:'IS',   link:'linkSS_IS',        linkWith:'sideShell'   },
  { key:'stringer',      label:'Stringer Plate',           coord:'z', color:'#a855f7', prefix:'STRP' },
  { key:'tweenDeck',     label:'Tween Deck Plate',         coord:'z', color:'#06b6d4', prefix:'TDP'  },
  { key:'upperDeck',     label:'Upper Deck',               coord:'y', color:'#94a3b8', prefix:'UD'   }
];

// =========================================================================
// PROFILE NAMING HELPER  (Apr 2026)
// -------------------------------------------------------------------------
// Returns a human-readable, sequential name for a stiffener:
//   "Bottom Shell Longitudinal 1"
//   "Inner Bottom Longitudinal 12"
//   "Side Shell Longitudinal 5"
//   "Coaming Top Stiffener 2"
// The number is its 1-based ORDINAL POSITION within its group, sorted by
// the group's primary coordinate (so the bottom long closest to centreline
// is #1, the lowest side long is #1, etc.).
// =========================================================================
const PROFILE_LONG_NAMES = {
  bottomShell:   'Bottom Shell Longitudinal',
  innerBottom:   'Inner Bottom Longitudinal',
  sideShell:     'Side Shell Longitudinal',
  innerSide:     'Inner Side Longitudinal',
  upperDeck:     'Upper Deck Longitudinal',
  stringerStiff: 'Stringer Deck Stiffener',
  tweenStiff:    'Tween Deck Stiffener',
  coamingStiff:  'Coaming Top Stiffener',
};

// Resolve a stiff's 1-based ordinal index within its group, sorted by the
// group's coordinate. Returns 0 if not found.
function resolveStiffOrdinal(group, idx) {
  try {
    const arr = (window.Draw?.profiles?.[group]) || [];
    if (!Array.isArray(arr) || idx == null || !arr[idx]) return 0;
    const grp = EDITOR_GROUPS.find(g => g.key === group);
    const coord = grp ? grp.coord : 'y';
    // Build sorted view with original indices
    const sorted = arr.map((p, i) => ({ p, i, c: p[coord] || 0 }))
                      .sort((a, b) => a.c - b.c);
    const found = sorted.findIndex(s => s.i === idx);
    return found >= 0 ? found + 1 : 0;
  } catch (_) { return 0; }
}

// Build the full display name "{Group Long Name} {ordinal}"
// e.g. resolveStiffDisplayName('bottomShell', 4) → "Bottom Shell Longitudinal 5"
function resolveStiffDisplayName(group, idx) {
  const base = PROFILE_LONG_NAMES[group] || group;
  const ord = resolveStiffOrdinal(group, idx);
  return ord > 0 ? `${base} ${ord}` : base;
}
window.resolveStiffOrdinal = resolveStiffOrdinal;
window.resolveStiffDisplayName = resolveStiffDisplayName;

function getLink(grp) {
  if (!grp.link) return null;
  if (grp.link === 'linkBS_IB') return linkBS_IB;
  if (grp.link === 'linkSS_IS') return linkSS_IS;
  return null;
}
function setLink(grp, v) {
  if (grp.link === 'linkBS_IB')      linkBS_IB = v;
  else if (grp.link === 'linkSS_IS') linkSS_IS = v;
}

// =========================================================================
// POSITION CODE REGISTRY  (Apr 2026 — single source of truth refactor)
// -------------------------------------------------------------------------
// Every strake and longitudinal stiffener in the model carries a 2-letter
// position code that uniquely identifies its STRUCTURAL ROLE on the ship,
// independent of array index, click handlers, or display order.
//
// The position code is the AUTHORITATIVE link between an element and:
//   - which LR rule table applies          (tableP / tableS)
//   - which inspector elemType to use      (plateElemType / longElemType)
//   - which display label to show          (longName)
//
// Refactor strategy: this registry is added FIRST in passive mode (just a
// data structure — nothing reads it yet). Subsequent steps gradually move
// the click handler, inspector, and calc functions to consult this table
// instead of doing their own ad-hoc string matching. The expected outcome
// is identical numerical results — only the routing logic changes.
//
// IMPORTANT: every change is verified against /tmp/baseline_snapshot.json.
// If a single number differs from the baseline, the refactor stops and
// the cause is investigated before proceeding.
// =========================================================================
const POSITION_RULES = {
  // ── Shell strakes (4 kinds, all in STRAKES.shell, distinguished by .kind)
  K:  { codeName:'Keel',                 longName:'Keel Strake',
        plateElemType:'plate-keel',     longElemType:null,
        tableP:'1.4.4',                 tableS:null,
        plateGroupKey:'shell',          longGroupKey:null,
        kind:'keel' },
  BL: { codeName:'Bilge',                longName:'Bilge Strake',
        plateElemType:'plate-bottom',   longElemType:'long-bottom',
        tableP:'1.5.2',                 tableS:'1.6.1',
        plateGroupKey:'shell',          longGroupKey:'bottomShell',
        kind:'bilge' },
  BS: { codeName:'Bottom Shell',         longName:'Bottom Shell Longitudinal',
        plateElemType:'plate-bottom',   longElemType:'long-bottom',
        tableP:'1.5.2',                 tableS:'1.6.1',
        plateGroupKey:'shell',          longGroupKey:'bottomShell',
        kind:'bottom' },
  SS: { codeName:'Side Shell',           longName:'Side Shell Longitudinal',
        plateElemType:'plate-side',     longElemType:'long-side',
        tableP:'1.5.3',                 tableS:'1.6.1',
        plateGroupKey:'shell',          longGroupKey:'sideShell',
        kind:'side' },

  // ── Inner Bottom
  IB: { codeName:'Inner Bottom',         longName:'Inner Bottom Longitudinal',
        plateElemType:'plate-ib',       longElemType:'long-ib',
        tableP:'1.4.4',                 tableS:'1.4.6',
        plateGroupKey:'innerBottom',    longGroupKey:'innerBottom' },

  // ── Inner Side (deep-tank bulkhead)
  IS: { codeName:'Inner Side',           longName:'Inner Side Longitudinal',
        plateElemType:'plate-is',       longElemType:'long-is',
        tableP:'1.9.1',                 tableS:'1.9.1',
        plateGroupKey:'innerSide',      longGroupKey:'innerSide' },

  // ── Decks
  UD: { codeName:'Upper Deck',           longName:'Upper Deck Longitudinal',
        plateElemType:'plate-ud',       longElemType:'long-ud',
        tableP:'1.4.2',                 tableS:'1.4.3',
        plateGroupKey:'upperDeck',      longGroupKey:'upperDeck' },
  SD: { codeName:'Stringer Deck',        longName:'Stringer Deck Stiffener',
        plateElemType:'plate-str',      longElemType:'long-str',
        tableP:'1.4.4',                 tableS:'1.4.6',
        plateGroupKey:'stringer',       longGroupKey:'stringerStiff' },
  TD: { codeName:'Tween Deck',           longName:'Tween Deck Stiffener',
        plateElemType:'plate-twn',      longElemType:'long-twn',
        tableP:'1.4.4',                 tableS:'1.4.6',
        plateGroupKey:'tween',          longGroupKey:'tweenStiff' },

  // ── Hatch Coaming (Pt 3 Ch 11)
  CT: { codeName:'Coaming Top',          longName:'Coaming Top Stiffener',
        plateElemType:'plate-coaming',  longElemType:'long-coaming',
        tableP:'Pt 3 Ch 11.2',          tableS:'Pt 3 Ch 11.3',
        plateGroupKey:'coamingTop',     longGroupKey:'coamingStiff' },

  // ── Side Girder boyuna intercostal stiffeners (Pt 4 Ch 1 Sec 8.3.5 + Pt 3 Ch 4 Sec 7)
  SG1L: { codeName:'SG1 Long',           longName:'Side Girder #1 Longitudinal',
          plateElemType:'plate-sidegirder', longElemType:'long-sidegirder',
          tableP:'8.3.5',                tableS:'Pt 3 Ch 4 Sec 7',
          plateGroupKey:'sideGirder0',   longGroupKey:'sideGirder0' },
  SG2L: { codeName:'SG2 Long',           longName:'Side Girder #2 Longitudinal',
          plateElemType:'plate-sidegirder', longElemType:'long-sidegirder',
          tableP:'8.3.5',                tableS:'Pt 3 Ch 4 Sec 7',
          plateGroupKey:'sideGirder1',   longGroupKey:'sideGirder1' },
  SG3L: { codeName:'SG3 Long',           longName:'Side Girder #3 Longitudinal',
          plateElemType:'plate-sidegirder', longElemType:'long-sidegirder',
          tableP:'8.3.5',                tableS:'Pt 3 Ch 4 Sec 7',
          plateGroupKey:'sideGirder2',   longGroupKey:'sideGirder2' },
};

// =========================================================================
// resolvePositionRule(code)  — look up a position rule by its 2-letter code
// resolveCodeForPlateGroup(groupKey, kind?)
//   → reverse lookup: given a plate-group key (and optional .kind for shell)
//     return the position code that applies.
// resolveCodeForLongGroup(groupKey)
//   → reverse lookup for stiffeners.
// All three are pure helpers, safe to call before assignPositionCodes() runs.
// =========================================================================
function resolvePositionRule(code) {
  if (!code) return null;
  return POSITION_RULES[code] || null;
}

function resolveCodeForPlateGroup(groupKey, kind) {
  if (!groupKey) return null;
  // Shell uses .kind to distinguish K / BL / BS / SS
  if (groupKey === 'shell') {
    if (kind === 'keel')   return 'K';
    if (kind === 'bilge')  return 'BL';
    if (kind === 'side')   return 'SS';
    return 'BS';   // default 'bottom' or undefined → BS
  }
  for (const code in POSITION_RULES) {
    if (POSITION_RULES[code].plateGroupKey === groupKey) return code;
  }
  return null;
}

function resolveCodeForLongGroup(groupKey) {
  if (!groupKey) return null;
  // Special case: bottomShell maps to BS for stiffeners (not BL — bilge has
  // no separate longitudinal group; bilge longs are part of bottomShell.)
  if (groupKey === 'bottomShell') return 'BS';
  for (const code in POSITION_RULES) {
    if (POSITION_RULES[code].longGroupKey === groupKey) return code;
  }
  return null;
}

// Expose for testing & for future consumers
window.POSITION_RULES = POSITION_RULES;
window.resolvePositionRule = resolvePositionRule;
window.resolveCodeForPlateGroup = resolveCodeForPlateGroup;
window.resolveCodeForLongGroup = resolveCodeForLongGroup;

// =========================================================================
// assignPositionCodes()  — walk every strake & stiff and tag it with a
// position code + 1-based ordinal (e.g. "BS01", "IS06").
//
// Result is stored on each element as `_positionCode` (auto-generated; the
// underscore prefix signals "do not hand-edit"). Calling this multiple
// times is idempotent — codes get re-assigned cleanly each time.
//
// PASSIVE: nothing reads _positionCode yet. This step only ATTACHES the
// data; subsequent steps will start consuming it. Safe to run at any
// time; calc functions ignore the field.
// =========================================================================
function assignPositionCodes() {
  const D = window.Draw;
  if (!D) return { strakeCount: 0, stiffCount: 0 };
  const STR = D.STRAKES || {};
  const PROF = D.profiles || {};

  let strakeCount = 0;
  let stiffCount = 0;

  // ── Strakes ──
  // Shell strakes get K/BL/BS/SS based on .kind. The ordinal is per-CODE
  // (so K01, K02 go separately from BS01, BS02), matching engineering
  // drawing conventions.
  if (Array.isArray(STR.shell)) {
    const counters = { K: 0, BL: 0, BS: 0, SS: 0 };
    STR.shell.forEach(s => {
      const code = resolveCodeForPlateGroup('shell', s.kind);
      if (code) {
        counters[code] = (counters[code] || 0) + 1;
        s._positionCode = code + String(counters[code]).padStart(2, '0');
        strakeCount++;
      }
    });
  }

  // Other strake groups: each group gets its own counter
  const plateGroups = ['innerBottom', 'innerSide', 'upperDeck',
                       'stringer', 'tween', 'coamingTop'];
  plateGroups.forEach(grp => {
    if (!Array.isArray(STR[grp])) return;
    const code = resolveCodeForPlateGroup(grp);
    if (!code) return;
    STR[grp].forEach((s, i) => {
      s._positionCode = code + String(i + 1).padStart(2, '0');
      strakeCount++;
    });
  });

  // ── Stiffeners ──
  // Each long group has its own counter; ordinal is by sorted coordinate
  // (matches the visual "1, 2, 3 from low → high" used by
  // resolveStiffOrdinal). The two refs stay in sync because they sort by
  // the same coordinate.
  const longGroups = ['bottomShell','innerBottom','sideShell','innerSide',
                      'upperDeck','stringerStiff','tweenStiff','coamingStiff'];
  longGroups.forEach(grp => {
    if (!Array.isArray(PROF[grp])) return;
    const code = resolveCodeForLongGroup(grp);
    if (!code) return;
    const editorGrp = (typeof EDITOR_GROUPS !== 'undefined')
                      ? EDITOR_GROUPS.find(g => g.key === grp) : null;
    const coord = editorGrp ? editorGrp.coord : 'y';
    // Build a sorted view so the position ordinal matches the visual order
    const indexed = PROF[grp].map((p, i) => ({ p, i, c: p[coord] || 0 }))
                             .sort((a, b) => a.c - b.c);
    indexed.forEach((entry, sortedIdx) => {
      entry.p._positionCode = code + String(sortedIdx + 1).padStart(2, '0');
      stiffCount++;
    });
  });

  return { strakeCount, stiffCount };
}
window.assignPositionCodes = assignPositionCodes;

// Resolve the position code of a specific strake at runtime (lazy: assigns
// if missing). Returns the code string, or null if the element/group is
// unknown.
function getStrakePositionCode(group, idx) {
  const arr = window.Draw?.STRAKES?.[group];
  if (!arr || !arr[idx]) return null;
  if (!arr[idx]._positionCode) assignPositionCodes();
  return arr[idx]._positionCode || null;
}
function getStiffPositionCode(group, idx) {
  const arr = window.Draw?.profiles?.[group];
  if (!arr || !arr[idx]) return null;
  if (!arr[idx]._positionCode) assignPositionCodes();
  return arr[idx]._positionCode || null;
}
window.getStrakePositionCode = getStrakePositionCode;
window.getStiffPositionCode = getStiffPositionCode;

// =========================================================================
// POSITION CODE VALIDATION  (Faz 2 — passive validation layer)
// -------------------------------------------------------------------------
// validatePositionCodeRouting(legacyElemType, kind, group, idx)
//   Compares the legacy elemType (computed by old click-handler logic)
//   against what POSITION_RULES would produce for the same element.
//   If they disagree, logs a warning to console — but the legacy elemType
//   is what gets returned and used. This lets us run the new logic in
//   shadow mode and detect inconsistencies without changing any results.
//
// Returns the legacy elemType unchanged (so callers are unaffected).
// =========================================================================
const _POSITION_VALIDATION_LOG = [];   // collect warnings for inspection

function validatePlateRouting(legacyElemType, plateGroup, kind) {
  const code = resolveCodeForPlateGroup(plateGroup, kind);
  const rule = code ? POSITION_RULES[code] : null;
  if (!rule) {
    // Unknown group — can't validate, return legacy
    return legacyElemType;
  }
  const expected = rule.plateElemType;
  if (expected && legacyElemType && expected !== legacyElemType) {
    const msg = `[POS-CODE WARN] plate group="${plateGroup}" kind="${kind}" → legacy="${legacyElemType}" but POSITION_RULES says "${expected}" (code ${code})`;
    if (typeof console !== 'undefined' && console.warn) console.warn(msg);
    _POSITION_VALIDATION_LOG.push({ kind: 'plate', plateGroup, legacy: legacyElemType, expected, code });
  }
  return legacyElemType;   // unchanged — passive only
}

function validateStiffRouting(legacyElemType, longGroup) {
  const code = resolveCodeForLongGroup(longGroup);
  const rule = code ? POSITION_RULES[code] : null;
  if (!rule) return legacyElemType;
  const expected = rule.longElemType;
  if (expected && legacyElemType && expected !== legacyElemType) {
    const msg = `[POS-CODE WARN] long group="${longGroup}" → legacy="${legacyElemType}" but POSITION_RULES says "${expected}" (code ${code})`;
    if (typeof console !== 'undefined' && console.warn) console.warn(msg);
    _POSITION_VALIDATION_LOG.push({ kind: 'long', longGroup, legacy: legacyElemType, expected, code });
  }
  return legacyElemType;
}

function getPositionValidationLog() { return _POSITION_VALIDATION_LOG.slice(); }
function clearPositionValidationLog() { _POSITION_VALIDATION_LOG.length = 0; }
window.validatePlateRouting = validatePlateRouting;
window.validateStiffRouting = validateStiffRouting;
window.getPositionValidationLog = getPositionValidationLog;
window.clearPositionValidationLog = clearPositionValidationLog;

// =========================================================================
// focusEditorRow(kind, group/plate, idx)
// -------------------------------------------------------------------------
// When the user clicks on a strake or stiffener in the geometry view, jump
// the Profile Editor to the matching row:
//   1. Switch the editor tab (strake → 'strakes', stiff → 'profiles')
//   2. Re-render the editor so the new selection highlight appears
//   3. Scroll the row into view (smooth) and flash a bright outline briefly
//
// Safe to call even before the editor has been rendered — it no-ops if the
// row isn't found in the DOM.
// =========================================================================
function focusEditorRow(kind, keyOrGroup, idx) {
  const targetTab = (kind === 'strake') ? 'strakes' : 'profiles';
  if (EDITOR_TAB !== targetTab) EDITOR_TAB = targetTab;
  renderEditor();
  // Wait a tick so the newly-rendered DOM is queryable
  requestAnimationFrame(() => {
    const sel = (kind === 'strake')
      ? `[data-row-plate="${keyOrGroup}"][data-row-idx="${idx}"]`
      : `[data-row-group="${keyOrGroup}"][data-row-idx="${idx}"]`;
    const row = document.querySelector(sel);
    if (!row) return;
    try {
      // Only scroll the Profile Editor's own scroll container — don't bubble up
      // to the page. Compute the row's position relative to the editor-body and
      // adjust scrollTop manually, so the rest of the page never moves.
      const scroller = row.closest('.editor-body') || row.closest('.editor');
      if (scroller) {
        const rowRect = row.getBoundingClientRect();
        const scRect  = scroller.getBoundingClientRect();
        // If the row is already fully inside the visible portion, do nothing.
        const fullyVisible = rowRect.top >= scRect.top && rowRect.bottom <= scRect.bottom;
        if (!fullyVisible) {
          // Center the row inside the scroller.
          const rowOffsetTop = row.offsetTop;
          const target = rowOffsetTop - (scroller.clientHeight / 2) + (row.offsetHeight / 2);
          scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
        }
      } else {
        // Fallback: use block:'nearest' so the window only moves if absolutely needed
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    } catch (e) {
      try { row.scrollIntoView({ block: 'nearest' }); } catch(_) {}
    }
    // Flash highlight — brief outline pulse so the user's eye catches the row.
    const prevOutline = row.style.outline;
    const prevTransition = row.style.transition;
    row.style.transition = 'outline 0.2s, background 0.2s';
    row.style.outline = '2px solid var(--accent)';
    setTimeout(() => {
      row.style.outline = prevOutline || '';
      row.style.transition = prevTransition || '';
    }, 900);
  });
}
window.focusEditorRow = focusEditorRow;

function renderEditor() {
  const ec = document.getElementById('edContent');
  let html = '';

  // Helper: any drawing-side mutation that affects geometry / scantling
  // (strake width, count, profile, thickness, …) calls this so the analysis
  // panels stay live. Recalc covers section-properties, hull girder σ,
  // buckling UC, rule-min margins, the floating Info overlay, and the
  // currently-open Result Panel for the selected element. Called only when
  // analysis mode is on so draw-mode edits stay cheap. Defined here at the
  // top of renderEditor so every event handler bound below can call it.
  const _refreshAnalysisIfRunning = (tag) => {
    if (!window.ANALYSIS_MODE) return;
    try {
      if (typeof recalcAll === 'function') {
        recalcAll();
      } else if (window.Bridge && window.Bridge.runRuleChecks) {
        window.Bridge.runRuleChecks();
      }
    } catch (err) {
      console.warn(`[${tag || 'edit'}] analysis refresh failed:`, err);
    }
  };

  // === TAB NAVIGATION ===
  const tabs = [
    { key:'geometry',     label:'Geom'    },
    { key:'params',       label:'Params'  },
    { key:'profiles',     label:'Prof'    },
    { key:'strakes',      label:'Strakes' },
    { key:'layers',       label:'Layers'  },
    { key:'compartments', label:'Comp'    },
    { key:'transverse',   label:'Trans'   },
  ];
  html += `<div class="ed-tabs">`;
  tabs.forEach(t => {
    html += `<button class="ed-tab ${EDITOR_TAB === t.key ? 'active' : ''}" data-ed-tab="${t.key}">${t.label}</button>`;
  });
  html += `</div>`;

  // === TAB: GEOMETRY ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'geometry' ? 'active' : ''}" data-tab-pane="geometry">`;
  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header">
    <span style="color:#f59e0b">Ship Geometry</span>
    <button class="ed-add-btn" id="geomReset" style="color:#94a3b8">↺ reset</button>
  </div>`;
  GEOMETRY_META.forEach(meta => {
    const v = GEOMETRY[meta.key];
    html += `<div class="ed-row">
      <span class="ed-id" style="min-width:150px;font-size:0.68rem">${meta.label}</span>
      <input class="ed-input geom-input" type="number" value="${v}" data-geom-key="${meta.key}" min="${meta.min}" max="${meta.max}" step="${meta.step}">
      <span class="ed-label" style="color:#475569;font-size:0.65rem">mm</span>
    </div>`;
  });
  html += `</div>`;
  html += `</div>`;  // close geometry tab pane

  // === TAB: DESIGN PARAMS (spacing, profile types per surface) ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'params' ? 'active' : ''}" data-tab-pane="params">`;
  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header"><span style="color:#f59e0b">Design Parameters</span></div>`;
  PARAMS_META.forEach(meta => {
    html += `<div class="ed-row">
      <span class="ed-id" style="min-width:150px;font-size:0.68rem">${meta.label}</span>
      <input class="ed-input param-input" type="number" value="${PARAMS[meta.key]}" data-param-key="${meta.key}" min="${meta.min}" max="${meta.max}" step="${meta.step}">
      <span class="ed-label" style="color:#475569;font-size:0.65rem">mm</span>
    </div>`;
  });
  // Profile type dropdowns per surface
  const profSurfaces = [
    { key:'profTypeBottom',   label:'Bottom Shell'       },
    { key:'profTypeIB',       label:'Inner Bottom'       },
    { key:'profTypeStringer', label:'Stringer Deck'      },
    { key:'profTypeTween',    label:'Tween Deck'         },
    { key:'profTypeCoaming',  label:'Coaming Top Plate'  },
    { key:'profTypeSide',     label:'Side Shell'         },
    { key:'profTypeIS',       label:'Inner Side'         },
    { key:'profTypeDeck',     label:'Upper Deck'         },
  ];
  profSurfaces.forEach(ps => {
    html += `<div class="ed-row">
      <span class="ed-id" style="min-width:150px;font-size:0.68rem">${ps.label} profile</span>
      <select class="ed-input proftype-select" data-proftype-key="${ps.key}" style="width:98px">
        <option value="L"  ${PARAMS[ps.key]==='L'  ? 'selected' : ''}>L</option>
        <option value="HP" ${PARAMS[ps.key]==='HP' ? 'selected' : ''}>HP Bulb</option>
        <option value="FB" ${PARAMS[ps.key]==='FB' ? 'selected' : ''}>Flat Bar</option>
      </select>
    </div>`;
  });
  html += `</div>`;
  html += `</div>`;  // close params tab pane

  // === TAB: PROFILES (all profile groups) ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'profiles' ? 'active' : ''}" data-tab-pane="profiles">`;

  // NOTE: Side Girders are STRUCTURAL PLATES (vertical webs), not profiles.
  // They are managed in the Strakes tab under "Vertical Plates".

  // === Profile groups ===
  EDITOR_GROUPS.forEach(grp => {
    const arr = profiles[grp.key];
    const isLinked = getLink(grp);
    const isSideIS = grp.link === 'linkSS_IS';
    const linkTitle = isSideIS
      ? `Aligned with ${grp.linkWith} — mirror active only when Z < (UD-600 = ${GEOMETRY.UD - 600}); above that, independent`
      : `Aligned with ${grp.linkWith} — toggle to unlink`;
    let linkLabelText = 'Free';
    if (isLinked) linkLabelText = isSideIS ? 'Linked <UD-600' : 'Linked';
    const linkIcon = isLinked ? '🔗' : '⛓';
    const linkBadge = grp.link
      ? `<button class="ed-link-btn ${isLinked?'on':''}" data-link-grp="${grp.key}" title="${linkTitle}">${linkIcon} ${linkLabelText}</button>`
      : '';

    // Resolve default group profile name (from scantling page or visual sizes)
    // NOTE: side/innerSide use multi-group selects (sideGroupProfile_G1..G5,
    // innerSideGroupProfile_IS-G1..G4) — no single source dropdown — so we
    // leave them null, and the editor falls back to the full profile catalog
    // for those rows. Stringer/Tween are 'strDeckProfile'/'twnDeckProfile' in
    // the HTML (not stringerLongProfile/tweenLongProfile, which don't exist).
    const PROFILE_SELECT_ID = {
      bottomShell:'bottomLongProfile', innerBottom:'ibLongProfile',
      sideShell:null,     innerSide:null,
      stringerStiff:'strDeckProfile', tweenStiff:'twnDeckProfile',
      coamingStiff:'coamingProfile',   upperDeck:'deckLongProfile'
    };
    const selId = PROFILE_SELECT_ID[grp.key];
    const scantSel = selId ? document.getElementById(selId) : null;
    const groupProfName = (scantSel && scantSel.value) ? scantSel.value : '';

    // Build list of all available profile names (from catalog).
    // Cache for reuse across all rows of this group.
    let allProfilesCache = null;
    const getAllProfiles = () => {
      if (allProfilesCache) return allProfilesCache;
      if (!window.Profile || !window.Profile.allProfiles) { allProfilesCache = []; return []; }
      try {
        allProfilesCache = window.Profile.allProfiles(['L','HP','FB']).map(p => p.name);
      } catch(e) { allProfilesCache = []; }
      return allProfilesCache;
    };

    // Build options HTML for a given current selection.
    // Always uses the full profile catalog (L + HP + FB), regardless of
    // group, so every row in every group lists every profile. The scantling
    // page's filtered dropdown is no longer involved here — it was the
    // source of empty rows when the scantling select had no options yet.
    // Only the current value is rendered, not the whole catalog.
    //
    // Every stiffener row carries one of these <select>s, and the catalog is
    // ~1500 profiles. With ~100 stiffeners that built ~158 000 <option> nodes,
    // 95% of every node in the document, and none of them were ever shown:
    // 91-profile-picker.js intercepts mousedown and keydown on
    // .ed-profile-row-select and opens its own modal instead of the native
    // dropdown. When the user picks something the picker appends the chosen
    // option itself before setting .value, so a one-option select is all this
    // needs to hold state.
    //
    // Measured on the Baltic Laker project: 195 000 DOM nodes before, and a
    // project load that blocked the main thread for 22 s.
    //
    // The one thing this gives up: arrow-keying through the catalog on a
    // focused select. That was never a usable way to choose among 1500
    // entries, and the picker handles Space / Alt+Down to open properly.
    const buildOptionsHtml = (currentValue) => {
      const all = getAllProfiles();
      if (!all.length) return '';          // no catalog -> caller renders a dash
      let opts = '<option value=""></option>';
      if (currentValue) {
        opts += `<option value="${escapeXml(currentValue)}" selected>${escapeXml(currentValue)}</option>`;
      }
      return opts;
    };

    html += `<div class="ed-group">`;
    html += `<div class="ed-group-header">
      <span style="color:${grp.color}">${grp.label} <span class="ed-count">(${arr.length})</span></span>
      <span style="display:flex;gap:4px;align-items:center">
        ${linkBadge}
        <button class="ed-add-btn" data-eq-spacing="${grp.key}" title="Distribute stiffeners evenly between two coordinates" style="color:#a855f7">⚖ equal</button>
        <button class="ed-add-btn" data-add="${grp.key}" title="Add a new stiffener at a specific coordinate">+ add</button>
      </span>
    </div>`;

    // Group-default profile select: if user changes this, it updates the matching
    // scantling-page dropdown (which is the source of truth for group profile).
    // This lets the user set the default without leaving the editor.
    if (selId && scantSel) {
      let defaultOpts = '';
      for (let i = 0; i < scantSel.options.length; i++) {
        const o = scantSel.options[i];
        const sel = (o.value === scantSel.value) ? ' selected' : '';
        defaultOpts += `<option value="${escapeXml(o.value)}"${sel}>${escapeXml(o.textContent || o.value)}</option>`;
      }
      html += `<div class="ed-row" style="padding:3px 6px;background:rgba(168,85,247,0.06);border-radius:4px;margin-bottom:4px">
        <span class="ed-id" style="min-width:40px;color:#a855f7;font-size:0.62rem;font-weight:600;letter-spacing:0.5px">DFLT</span>
        <span style="font-size:0.62rem;color:var(--text-muted);min-width:78px">group profile</span>
        <select class="ed-group-default-select" data-default-sel-id="${selId}" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.7rem;background:var(--bg-tertiary);border:1px solid var(--border);color:var(--text-primary);padding:3px 5px;border-radius:3px">
          ${defaultOpts}
        </select>
      </div>`;
    }

    // Column header row
    html += `<div class="ed-row" style="padding:3px 6px;font-size:0.58rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;border-bottom:1px solid var(--border);margin-bottom:3px">
      <span style="min-width:40px">ID</span>
      <span style="min-width:78px">${grp.coord.toUpperCase()} (mm)</span>
      <span style="min-width:60px" title="Spacing to previous stiffener in this group">Spacing</span>
      <span style="flex:1">Profile</span>
      <span style="min-width:18px"></span>
    </div>`;

    // Sort display by coordinate; keep original index for editing
    const sorted = arr.map((p,i) => ({ ...p, _idx: i })).sort((a,b) => (a[grp.coord] - b[grp.coord]));
    sorted.forEach((p, dispIdx) => {
      const id = `${grp.prefix}${String(dispIdx+1).padStart(2,'0')}`;
      // Spacing to previous (sorted) stiffener — editable. Editing the
      // spacing rewrites this stiff's coord to (prev + new spacing), which
      // matches user intuition (move this stiff closer/farther from the one
      // below it). The first stiff in a group has no previous neighbour
      // and therefore no editable spacing.
      const prevCoord = dispIdx > 0 ? sorted[dispIdx-1][grp.coord] : null;
      const spacing = prevCoord != null ? (p[grp.coord] - prevCoord) : null;
      const spacingColor = (spacing != null && (spacing < 400 || spacing > 900))
        ? 'var(--warning)' : 'var(--text-muted)';
      const spacingText = spacing != null
        ? `<input class="ed-input ed-spacing-edit" type="number" value="${spacing}" data-group="${grp.key}" data-idx="${p._idx}" data-prev-coord="${prevCoord}" data-coord="${grp.coord}" step="5" min="50" style="width:62px;color:${spacingColor};font-family:var(--font-mono);font-size:0.66rem" title="Spacing from previous stiffener (mm). Edit to move this stiff. Recommended 550–750 mm.">`
        : `<span style="min-width:62px;color:var(--text-muted);font-size:0.66rem;text-align:center">—</span>`;

      // Mark side/IS rows that would clash with stringer/tween deck
      const clashWarn = (grp.coord === 'z' && (grp.key === 'sideShell' || grp.key === 'innerSide') && clashesWithHorizontal(p[grp.coord]))
        ? `<span title="Clashes with stringer / tween deck — will be skipped in drawing" style="color:var(--warning);font-size:0.75rem">${icon('warn','11px')}</span>` : '';

      // Per-row profile: stiff.profileName overrides group default
      const rowProfName = p.profileName || groupProfName;
      const rowOptsHtml = buildOptionsHtml(rowProfName);
      const hasOptions = rowOptsHtml.length > 0;
      const customMark = p.profileName
        ? `<span title="Custom profile (override group default)" style="color:#fbbf24;font-size:0.65rem">•</span>`
        : `<span style="width:6px;display:inline-block"></span>`;

      // ─── BRACKET EFFECT BADGE ─────────────────────────────────────────
      // If user-defined brackets attach to this longitudinal, l_e was
      // reduced. Show a purple badge with the count and the resulting l_e.
      let bracketBadge = '';
      try {
        if (typeof bracketSpanReductionForLong === 'function') {
          const G = GEOMETRY;
          let longInfo = null;
          if (grp.key === 'bottomShell' && p.y != null) longInfo = { plate: 'shell', y: p.y, z: 0 };
          else if (grp.key === 'innerBottom' && p.y != null) longInfo = { plate: 'innerBottom', y: p.y, z: G.IB };
          else if (grp.key === 'sideShell' && p.z != null) longInfo = { plate: 'shell', y: G.B_half, z: p.z };
          else if (grp.key === 'innerSide' && p.z != null) longInfo = { plate: 'innerSide', y: G.IS, z: p.z };
          else if (grp.key === 'upperDeck' && p.y != null) longInfo = { plate: 'upperDeck', y: p.y, z: G.UD };
          else if (grp.key === 'coamingStiff' && p.y != null) longInfo = { plate: 'coamingTop', y: p.y, z: G.HC };
          if (longInfo) {
            const eff = bracketSpanReductionForLong(longInfo);
            if (eff && eff.count > 0) {
              const baseLe = parseFloat(document.getElementById('le')?.value) || 0;
              const newLe = Math.max(baseLe - eff.reduction_m, 1.5);
              bracketBadge = `<span title="Bracket-reduced l_e: ${baseLe.toFixed(2)}m → ${newLe.toFixed(2)}m (Δ=${eff.reduction_m.toFixed(2)}m, ${eff.count} bracket${eff.count>1?'s':''})" style="color:#a855f7;font-size:0.55rem;padding:1px 4px;background:rgba(168,85,247,0.12);border:1px solid rgba(168,85,247,0.4);border-radius:3px;font-family:var(--font-mono);font-weight:600">BR×${eff.count}</span>`;
            }
          }
        }
      } catch(_) {}

      // Highlight when this stiffener is the selected one
      const isStiffSel = (typeof SELECTED_STIFF !== 'undefined' && SELECTED_STIFF
                         && SELECTED_STIFF.group === grp.key && SELECTED_STIFF.index === p._idx);
      const stiffSelStyle = isStiffSel
        ? 'background:rgba(168,85,247,0.18);border-left:3px solid var(--accent);'
        : '';
      // ── Material grade dropdown (auto from parent strake/Setup, manual override) ──
      // Default: shows whatever the parent strake's effective grade is —
      // which itself reads live from the Setup zone resolver. The user
      // can pin a single long by picking a value here; '—' clears the pin.
      const lMfManual = !!p.gradeManual;
      let lMfAuto = '';
      if (typeof getInheritedFamilyForLong === 'function') {
        try { lMfAuto = getInheritedFamilyForLong(grp.key, p._idx) || ''; } catch (_) {}
      }
      if (!lMfAuto) lMfAuto = (document.getElementById('material')?.value) || '';
      const sMf = lMfManual ? (p.materialFamily || lMfAuto) : lMfAuto;
      const sMfColors = {
        'MS':'#6b7280',
        'AH32':'#0891b2','AH36':'#7c3aed','AH40':'#ea580c'
      };
      const sMfBg = sMf ? (sMfColors[sMf] || 'var(--bg-tertiary)') : 'var(--bg-tertiary)';
      const sMfFg = sMf ? '#fff' : 'var(--text-muted)';
      const lMfOp = lMfManual ? '1' : '0.65';
      const lMfTitle = lMfManual
        ? `Pinned: ${familyToKLabel(sMf)}. Pick '— auto' to revert to parent strake.`
        : `Auto from parent strake / Setup zone: ${familyToKLabel(sMf)}. Pick a value here to pin this single long.`;
      const sMfSel = `<select class="ed-input ed-stiff-mf" data-edit-group="${grp.key}" data-edit-idx="${p._idx}" title="${lMfTitle}" style="min-width:90px;font-size:0.62rem;background:${sMfBg};color:${sMfFg};font-weight:600;padding:2px 4px;border-radius:3px;font-family:var(--font-mono);opacity:${lMfOp};border:none">
        <option value=""     ${!lMfManual ? 'selected' : ''}>${lMfManual ? '— auto' : (lMfAuto ? familyToKLabel(lMfAuto) : '—')}</option>
        <option value="MS"   ${lMfManual && sMf === 'MS'   ? 'selected' : ''}>k = 1.00</option>
        <option value="AH32" ${lMfManual && sMf === 'AH32' ? 'selected' : ''}>k = 0.78</option>
        <option value="AH36" ${lMfManual && sMf === 'AH36' ? 'selected' : ''}>k = 0.72</option>
        <option value="AH40" ${lMfManual && sMf === 'AH40' ? 'selected' : ''}>k = 0.68</option>
      </select>`;

      // Build the long human-readable name (e.g. "Bottom Shell Longitudinal 5")
      // and a tooltip that includes the LR Table reference from POSITION_RULES.
      // The short ID `${id}` IS the position code (e.g. "BS01"), kept consistent
      // with POSITION_RULES naming convention.
      const longName = (typeof PROFILE_LONG_NAMES === 'object' && PROFILE_LONG_NAMES[grp.key])
                       ? `${PROFILE_LONG_NAMES[grp.key]} ${dispIdx + 1}`
                       : `${grp.label} #${dispIdx + 1}`;
      let tooltipText = longName;
      try {
        const code = (typeof resolveCodeForLongGroup === 'function')
                     ? resolveCodeForLongGroup(grp.key) : null;
        const rule = code ? POSITION_RULES[code] : null;
        if (rule && rule.tableS) {
          tooltipText = `${longName}  ·  ${id}  ·  LR Tablo ${rule.tableS}`;
        }
      } catch(_) {}

      // SINGLE ROW: id + coord input + spacing + profile dropdown + family + delete
      html += `<div class="ed-row" data-row-group="${grp.key}" data-row-idx="${p._idx}" style="padding:3px 6px;${stiffSelStyle}">
        <span class="ed-id" style="min-width:40px;font-family:var(--font-mono)" title="${tooltipText}">${id}</span>
        <input class="ed-input" type="number" value="${p[grp.coord]}" data-group="${grp.key}" data-idx="${p._idx}" data-coord="${grp.coord}" step="10" style="width:78px" title="${grp.coord.toUpperCase()} coordinate in mm">
        ${spacingText}
        ${hasOptions
          ? `<select class="ed-profile-row-select" data-edit-group="${grp.key}" data-edit-idx="${p._idx}" data-sel-id="${selId}" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.67rem;background:var(--bg-tertiary);border:1px solid var(--border);color:${p.profileName ? '#fbbf24' : 'var(--text-primary)'};padding:3px 5px;border-radius:3px">${rowOptsHtml}</select>`
          : `<span style="flex:1;color:var(--text-muted);font-size:0.65rem;font-style:italic">—</span>`
        }
        ${sMfSel}
        ${customMark}
        ${bracketBadge}
        ${clashWarn}
        <button class="ed-del" data-del-group="${grp.key}" data-del-idx="${p._idx}" title="Delete">${icon('close','10px')}</button>
      </div>`;
    });
    html += `</div>`;
  });

  html += `</div>`;  // close profiles tab pane

  // === TAB: STRAKES (manual plate strake table) ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'strakes' ? 'active' : ''}" data-tab-pane="strakes">`;

  // Auto/manual toggle + reset button
  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header">
    <span style="color:#06b6d4">Strakes <span class="ed-count">(${(STRAKES.shell.length + STRAKES.innerBottom.length + STRAKES.innerSide.length)} total)</span></span>
    <span style="display:flex;gap:4px">
      <button class="ed-link-btn ${STRAKES_AUTO ? 'on' : ''}" id="strakeAutoToggle" title="When ON, strakes regenerate on auto-recalculate">${STRAKES_AUTO ? icon('lock','11px')+' Auto' : icon('pencil','11px')+' Manual'}</button>
      <button class="ed-add-btn" id="strakeResetAll" title="Regenerate all strakes from defaults">↺ reset</button>
    </span>
  </div>`;
  html += `<div style="font-size:0.68rem;color:var(--text-muted);padding:4px 0 8px;line-height:1.4">Width = mm along plate. Thick = plate thickness (mm). Watertight flags are set per panel in the Layers tab. <span style="color:var(--warning)">Last strake auto-fits</span> to match the panel total — edit any strake freely, another one will adjust.</div>`;

  const strakeTableHead = `
    <div class="ed-row" style="font-size:0.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;padding:4px 6px;border-bottom:1px solid var(--border)">
      <span style="min-width:58px">Name</span>
      <span style="min-width:30px;text-align:center" title="Delete this strake">Del</span>
      <span style="min-width:56px">Width</span>
      <span style="min-width:48px">Thick</span>
      <span style="min-width:62px" title="LR Pt 3 Ch 2 material grade — driven by Setup zones">Grade</span>
      <span style="flex:1"></span>
    </div>`;

  const renderStrakeRow = (plateKey, i, s) => {
    const kindBadge = s.kind
      ? `<span style="color:var(--text-muted);font-size:0.6rem;padding-left:4px">${s.kind}</span>`
      : '';
    // ─── TRANS-STIFF EFFECT BADGE ─────────────────────────────────────────
    // If user-defined transverse stiffeners cross this strake, the local
    // s_eff is reduced. Show a small pink badge so the user knows this
    // strake's plate t was computed with the local (smaller) trans spacing.
    let transBadge = '';
    try {
      if (typeof findCrossingTransStiffs === 'function') {
        const crossings = findCrossingTransStiffs(plateKey, i);
        if (crossings && crossings.length > 0) {
          const n = new Set(crossings.map(c => c.ts)).size;
          const globalTS = parseFloat(document.getElementById('transFrameSpacing')?.value) || 700;
          const localTS = Math.round(globalTS / (n + 1));
          transBadge = `<span title="Local trans spacing reduced by ${n} user stiff${n>1?'s':''}: ${globalTS}/${n+1}=${localTS} mm" style="color:#ec4899;font-size:0.55rem;padding:1px 4px;background:rgba(236,72,153,0.12);border:1px solid rgba(236,72,153,0.4);border-radius:3px;font-family:var(--font-mono);font-weight:600">TS×${n}</span>`;
        }
      }
    } catch (_) {}
    // Row-level data-row-plate / data-row-idx are what `focusEditorStrake`
    // queries to scroll + highlight when the user clicks on the strake in
    // the drawing. The editor stays in sync with the geometry view.
    const isSel = (typeof SELECTED_STRAKE !== 'undefined' && SELECTED_STRAKE
                   && SELECTED_STRAKE.plate === plateKey && SELECTED_STRAKE.index === i);
    const selStyle = isSel
      ? 'background:rgba(168,85,247,0.18);border-left:3px solid var(--accent);'
      : '';
    // AUTO-FIT model: every strake is editable. When the user changes any
    // strake's width, the LAST strake (slack) auto-adjusts to keep total =
    // panel size. If the user edits the last strake, the slack shifts to
    // the one before it.
    const arr = STRAKES[plateKey] || [];
    const isLast = (i === arr.length - 1);
    const widthInput = `<input class="ed-input strake-width${isLast ? ' strake-width-slack' : ''}" type="number" value="${s.width}" data-plate="${plateKey}" data-strake-idx="${i}" step="10" min="10" style="width:70px${isLast ? ';color:var(--warning);font-weight:700;border-style:dashed' : ''}" title="${isLast ? 'Last strake — auto-fills to match the panel total. You can still type a value; an earlier strake will adjust.' : 'Width in mm. The last strake auto-adjusts so total = panel size.'}">`;
    // Slack (last) strake can't be deleted — total must always equal panel size.
    const delBtn = isLast
      ? `<button class="ed-del ed-del-disabled" disabled title="Last (slack) strake — delete an earlier one instead.">${icon('close','10px')}</button>`
      : `<button class="ed-del" data-strake-del="${plateKey}" data-strake-idx="${i}" title="Delete this strake">${icon('close','10px')}</button>`;

    // ── Material grade dropdown (auto from Setup, manual override possible) ──
    // Default behaviour: the badge shows what the Setup zone resolver returns
    // for this strake's z-band, LIVE — no field is written, no button needs
    // to be pressed. The user can override a single strake by picking a
    // value from the dropdown; that pins the strake (materialFamilyManual=
    // true) and the calc + propagation use the pinned value. Selecting '—'
    // ('auto') clears the pin and reverts to live Setup-zone resolution.
    const sMfManual = !!s.materialFamilyManual;
    let sMfAuto = '';
    if (typeof getZoneMaterialForStrake === 'function') {
      try { sMfAuto = getZoneMaterialForStrake(plateKey, s) || ''; } catch (_) {}
    }
    if (!sMfAuto) sMfAuto = (document.getElementById('material')?.value) || '';
    const sMfKey = sMfManual ? (s.materialFamily || sMfAuto) : sMfAuto;
    const sMfColors = {
      'MS':'#6b7280',
      'AH32':'#0891b2','AH36':'#7c3aed','AH40':'#ea580c'
    };
    const sMfBg = sMfKey ? (sMfColors[sMfKey] || 'var(--bg-tertiary)') : 'var(--bg-tertiary)';
    const sMfFg = sMfKey ? '#fff' : 'var(--text-muted)';
    // Dimmed when auto (Setup-driven), full opacity when pinned, so the user
    // can see at a glance which strakes have been overridden.
    const sMfOp = sMfManual ? '1' : '0.65';
    const sMfTitle = sMfManual
      ? `Pinned: ${familyToKLabel(sMfKey)}. Pick '— auto' to revert to Setup zone.`
      : `Auto from Setup zone: ${familyToKLabel(sMfKey)}. Pick a value here to pin this single strake.`;
    const sMfBadge = `<select class="ed-input strake-mf" data-plate="${plateKey}" data-strake-idx="${i}" title="${sMfTitle}" style="min-width:90px;font-size:0.62rem;background:${sMfBg};color:${sMfFg};font-weight:600;padding:2px 4px;border-radius:3px;font-family:var(--font-mono);opacity:${sMfOp};border:none">
      <option value=""     ${!sMfManual ? 'selected' : ''}>${sMfManual ? '— auto' : (sMfAuto ? familyToKLabel(sMfAuto) : '—')}</option>
      <option value="MS"   ${sMfManual && sMfKey === 'MS'   ? 'selected' : ''}>k = 1.00</option>
      <option value="AH32" ${sMfManual && sMfKey === 'AH32' ? 'selected' : ''}>k = 0.78</option>
      <option value="AH36" ${sMfManual && sMfKey === 'AH36' ? 'selected' : ''}>k = 0.72</option>
      <option value="AH40" ${sMfManual && sMfKey === 'AH40' ? 'selected' : ''}>k = 0.68</option>
    </select>`;

    return `<div class="ed-row ${isLast ? 'is-slack-strake' : ''}" data-row-plate="${plateKey}" data-row-idx="${i}" style="${selStyle}">
      <span class="ed-id" style="min-width:58px;font-family:var(--font-mono);font-size:0.68rem;color:var(--accent);font-weight:600" title="${s.name || ''}">${s.id || (i+1)}${isLast ? ' <span style=\"color:var(--warning);font-size:0.52rem;font-weight:700;background:rgba(251,191,36,0.15);padding:1px 3px;border-radius:2px;margin-left:1px\">AUTO</span>' : ''}</span>
      ${delBtn}
      ${widthInput}
      <input class="ed-input strake-thick" type="number" value="${s.thickness}" data-plate="${plateKey}" data-strake-idx="${i}" step="1" style="width:52px">
      ${sMfBadge}
      ${transBadge}
      ${kindBadge}
    </div>`;
  };

  const renderStrakePlate = (plateKey, label, color) => {
    const arr = STRAKES[plateKey];
    const totalW = arr.reduce((s, x) => s + x.width, 0);
    // Compute target geometry total
    const g = GEOMETRY;
    let target = null;
    switch (plateKey) {
      case 'innerSide':   target = g.HC - g.IB; break;  // IB → HC (IS-6 is coaming wall)
      case 'innerBottom': target = g.B_half; break;  // CL → B_half (full half-beam)
      case 'upperDeck':   target = g.B_half - g.IS; break;
      case 'coamingTop':  target = PARAMS.coamingTop; break;
      case 'sideGirder0':
      case 'sideGirder1':
      case 'sideGirder2':
        target = g.IB; break;  // Side Girder vertical plate: Z=0 → Z=IB
      case 'stringer':    target = null; break;   // legacy flat union — no single target
      case 'tween':       target = null; break;   // legacy flat union — no single target
      case 'shell': {
        const L = shellGeometryLengths();
        target = L.total;
        break;
      }
      default: {
        // Dynamic per-level groups: stringerN / tweenN span IS → B_half
        if (/^stringer\d+$/.test(plateKey) || /^tween\d+$/.test(plateKey)) {
          target = Math.max(0, g.B_half - g.IS);
        }
      }
    }
    const diff = target != null ? totalW - target : null;
    const fits = diff != null && Math.abs(diff) <= 5;  // 5 mm tolerance
    const statusColor = fits ? 'var(--success)' : (diff > 0 ? 'var(--error)' : 'var(--warning)');
    const statusText = target == null ? '' 
      : fits ? `✓ fits ${target}mm` 
      : (diff > 0 ? `⚠ ${diff}mm OVER` : `⚠ ${-diff}mm UNDER`);
    
    let h = `<div style="margin-top:var(--spacing-md)">`;
    h += `<div class="ed-group-header" style="padding-bottom:4px;margin-bottom:4px;border-bottom:1px solid var(--border)">
      <span style="color:${color}">${label} <span class="ed-count">(${arr.length} strakes · Σ=${totalW}mm${target != null ? ' / target '+target+'mm' : ''})</span>
      ${statusText ? `<span style="font-size:0.6rem;color:${statusColor};margin-left:6px;font-family:var(--font-mono)">${statusText}</span>` : ''}</span>
      <button class="ed-add-btn" data-strake-add="${plateKey}">+ add</button>
    </div>`;
    h += strakeTableHead;
    arr.forEach((s, i) => { h += renderStrakeRow(plateKey, i, s); });
    h += `</div>`;
    return h;
  };

  // ═══════════════════════════════════════════════════════════════════════
  // STRAKES TAB — all structural panels listed in order.
  // Panel order follows the user's 12-panel spec:
  //   1) Shell (Keel Plate dahil)
  //   2) Inner Bottom
  //   3) Inner Side (Coaming dahil)
  //   4) Duct Keel  — included inside Shell, no separate entry
  //   5-7) Side Girder I / II / III
  //   8) Stringer Deck
  //   9) Tween Deck
  //   10) Upper Deck
  //   11) Hatch Coaming Top Plate
  //   12) Hatch Coaming Wall
  // ═══════════════════════════════════════════════════════════════════════

  // 1) Shell (Keel + Bottom + Bilge + Side shell, as one continuous panel)
  html += renderStrakePlate('shell',       '1. Shell (Keel → UD)',              DEFAULT_PALETTE.shell);
  // 2) Inner Bottom
  html += renderStrakePlate('innerBottom', '2. Inner Bottom (CL → Shell)',      DEFAULT_PALETTE.ib);
  // 3) Inner Side (Coaming included — panel runs IB → HC as one flow)
  html += renderStrakePlate('innerSide',   '3. Inner Side (IB → HC)',           DEFAULT_PALETTE.is);

  // 5-7) Side Girders — each one is its own panel.
  // (Y-position and delete buttons are grouped separately below the strake
  // list so the user can see the girder's location and still edit strakes.)
  const sortedSG = SIDE_GIRDERS.map((s,i) => ({ ...s, _idx: i })).sort((a,b) => a.y - b.y);
  sortedSG.forEach((sg, dispIdx) => {
    const romans = ['I', 'II', 'III', 'IV', 'V'];
    const num = romans[dispIdx] || (dispIdx + 1);
    const panelNum = 5 + dispIdx;
    const sgKey = 'sideGirder' + sg._idx;
    if (STRAKES[sgKey]) {
      html += renderStrakePlate(sgKey, `${panelNum}. Side Girder ${num} (Y=${sg.y}, Z=0 → IB)`, DEFAULT_PALETTE.sideGirder);
    }
    // Y-position control directly below the strake list
    html += `<div class="ed-row" style="border-left:3px solid ${DEFAULT_PALETTE.sideGirder};margin-top:-4px;background:rgba(168,85,247,0.04)">
      <span class="ed-id" style="color:${DEFAULT_PALETTE.sideGirder}">SG${dispIdx+1}</span>
      <span class="ed-label" style="font-size:0.68rem;color:var(--text-muted)">Position Y =</span>
      <input class="ed-input sg-input" type="number" value="${sg.y}" data-sg-idx="${sg._idx}" step="50" style="width:80px">
      <span class="ed-label" style="color:var(--text-muted);font-size:0.65rem">mm</span>
      <button class="ed-del" data-sg-del="${sg._idx}" title="Delete this Side Girder">${icon('close','10px')}</button>
    </div>`;
  });
  // Add-girder button after the list
  html += `<div style="display:flex;justify-content:flex-end;margin-top:4px;margin-bottom:var(--spacing-md)">
    <button class="ed-add-btn" id="sgAdd">+ add Side Girder</button>
  </div>`;

  // 8) Stringer Decks — one sub-panel per level (STRAKES.stringer0, stringer1, ...)
  {
    const stringerLevels = (profiles.stringer || []).filter(p => p.z > GEOMETRY.IB && p.z < GEOMETRY.UD);
    stringerLevels.forEach((p, i) => {
      const key = 'stringer' + i;
      if (STRAKES[key] && STRAKES[key].length > 0) {
        const suffix = stringerLevels.length > 1 ? ` ${i+1}` : '';
        html += renderStrakePlate(key, `8. Stringer Deck${suffix} (Z=${p.z})`, DEFAULT_PALETTE.stringer);
      }
    });
  }
  // 9) Tween Decks — one sub-panel per level
  {
    const tweenLevels = (profiles.tweenDeck || []).filter(p => p.z > GEOMETRY.IB && p.z < GEOMETRY.UD);
    tweenLevels.forEach((p, i) => {
      const key = 'tween' + i;
      if (STRAKES[key] && STRAKES[key].length > 0) {
        const suffix = tweenLevels.length > 1 ? ` ${i+1}` : '';
        html += renderStrakePlate(key, `9. Tween Deck${suffix} (Z=${p.z})`, DEFAULT_PALETTE.tween);
      }
    });
  }
  // 10) Upper Deck
  html += renderStrakePlate('upperDeck',   '10. Upper Deck (IS → Shell)',                    DEFAULT_PALETTE.upperDeck);
  // 11) Hatch Coaming Top Plate — horizontal at Z=HC
  html += renderStrakePlate('coamingTop',  '11. Hatch Coaming Top Plate (IS → IS+coamingTop)', DEFAULT_PALETTE.coamingTop);

  // (Auto-Optimize buttons moved to page 2 / Scantling Inputs — top banner)

  html += `</div>`;  // close ed-group (strakes list)

  // Duct Keel is included in Shell (as per spec) — show a small info banner
  // so users know where to find duct-keel-related settings.
  html += `<div style="margin-top:var(--spacing-md);padding:6px 10px;background:rgba(168,85,247,0.06);border-left:3px solid ${DEFAULT_PALETTE.duct};border-radius:var(--radius-sm);font-size:0.68rem;color:var(--text-muted)">
    <strong style="color:${DEFAULT_PALETTE.duct}">4. Duct Keel</strong> — geometrically part of the Shell panel (CL → keel_half). Edit via <em>Setup → Duct keel half</em>. Wall thickness: <strong>${PLATE_THICKNESS.duct} mm</strong>.
  </div>`;

  html += `</div>`;  // close strakes tab pane

  // === TAB: LAYERS (WT / Non-WT classification) ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'layers' ? 'active' : ''}" data-tab-pane="layers">`;

  // === WT / NON-WT classification panel ===
  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header"><span style="color:#22c55e">WT / Non-WT</span></div>`;
  const wtOptions = (key) => `
    <select class="ed-input wt-select" data-wt-key="${key}" style="width:90px">
      <option value="WT"     ${WT_FLAGS[key] === 'WT'     ? 'selected':''}>WT</option>
      <option value="Non-WT" ${WT_FLAGS[key] === 'Non-WT' ? 'selected':''}>Non-WT</option>
    </select>`;
  // Side Girders (dynamic, one per SG)
  SIDE_GIRDERS.forEach((sg, i) => {
    const k = 'sg' + i;
    if (WT_FLAGS[k] === undefined) WT_FLAGS[k] = 'WT';
    html += `<div class="ed-row">
      <span class="ed-id" style="min-width:120px;font-size:0.68rem">Side Girder ${i+1}</span>
      ${wtOptions(k)}
    </div>`;
  });
  // Decks / horizontal plates (only stringer, tween deck, upper deck)
  const deckWTs = [
    { key:'stringerPlate',   label:'Stringer Plate'     },
    { key:'tweenDeckPlate',  label:'Tween Deck Plate'   },
    { key:'upperDeckPlate',  label:'Upper Deck'         },
  ];
  deckWTs.forEach(d => {
    html += `<div class="ed-row">
      <span class="ed-id" style="min-width:120px;font-size:0.68rem">${d.label}</span>
      ${wtOptions(d.key)}
    </div>`;
  });
  html += `</div>`;

  html += `</div>`;  // close layers tab pane

  // === TAB: COMPARTMENTS ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'compartments' ? 'active' : ''}" data-tab-pane="compartments">`;

  // Hint banner explaining node-pick flow
  if (COMPARTMENT_PICK) {
    const n = COMPARTMENT_PICK.picks.length;
    const verb = COMPARTMENT_PICK.mode === 'edit' ? 'Re-picking' : 'Picking';
    html += `<div class="ed-hint ed-hint-active">
      <strong>${verb} nodes…</strong> ${n} selected. Click each corner <em>once</em> — don't re-click the first node (the boundary auto-closes). L-shaped Ballast = 6 corners.
      <div style="margin-top:6px;display:flex;gap:4px">
        ${n >= 3 ? `<button class="ed-add-btn" id="compPickDone" style="background:rgba(34,197,94,0.18);border-color:#22c55e;color:#22c55e">Done (${n} nodes)</button>` : ''}
        <button class="ed-add-btn" id="compPickCancel">Cancel</button>
      </div>
    </div>`;
  } else {
    html += `<div class="ed-hint">Compartments are defined by picking corner <strong>nodes</strong> in the <em>Comp</em> view (3+ for simple shapes, 6 for an L-shape). The boundary auto-closes back to the first node.</div>`;
  }

  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header">
    <span style="color:#06b6d4">Compartments <span class="ed-count">(${COMPARTMENTS.length})</span></span>
    <div style="display:flex;gap:4px">
      <button class="ed-add-btn" id="compAddByNodes" title="Pick 4 nodes on the drawing">+ by nodes</button>
      <button class="ed-add-btn" id="compAdd" title="Add compartment with numeric coords">+ coords</button>
    </div>
  </div>`;

  COMPARTMENTS.forEach((c, i) => {
    const hasNodesArr = Array.isArray(c.nodes) && c.nodes.length >= 3;
    const hasLegacy4  = c.n1 != null;
    const isNodeBased = hasNodesArr || hasLegacy4;
    const type = c.type || 'void';
    
    // Type color coding
    const typeColors = {
      ballast:    '#3b82f6',
      cargo:      '#eab308',
      fuel:       '#f97316',
      freshwater: '#06b6d4',
      void:       '#64748b',
      cofferdam:  '#a78bfa'
    };
    const tCol = typeColors[type] || '#64748b';
    
    html += `<div style="padding:8px 8px;border-bottom:1px solid var(--border-faint);background:var(--bg-tertiary);border-left:3px solid ${tCol};margin-bottom:4px;border-radius:4px">`;
    
    // ROW 1 — Name + geometry + type + delete
    html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
      <input class="ed-input comp-name" type="text" value="${c.name}" data-comp-idx="${i}" style="flex:1;min-width:0;font-size:0.75rem;font-weight:600;padding:4px 6px" placeholder="Name">
      <select class="ed-input comp-type" data-comp-idx="${i}" title="Compartment type" style="width:100px;font-size:0.7rem;font-weight:600;color:${tCol};padding:4px 4px">
        <option value="ballast"    ${type==='ballast'?'selected':''}>Ballast</option>
        <option value="cargo"      ${type==='cargo'?'selected':''}>Cargo</option>
        <option value="fuel"       ${type==='fuel'?'selected':''}>Fuel Oil</option>
        <option value="freshwater" ${type==='freshwater'?'selected':''}>Fresh Water</option>
        <option value="void"       ${type==='void'?'selected':''}>Void</option>
        <option value="cofferdam"  ${type==='cofferdam'?'selected':''}>Cofferdam</option>
      </select>
      <button class="ed-del" data-comp-del="${i}" title="Delete compartment" style="flex-shrink:0">${icon('close','11px')}</button>
    </div>`;
    
    // ROW 2 — Geometry (node list or YZ bounds)
    if (isNodeBased) {
      const ids = hasNodesArr ? c.nodes : [c.n1, c.n2, c.n3, c.n4];
      const isOpen = (COMPARTMENT_NODE_EDIT === i);
      // Compact node-list pill (always visible). The pencil button toggles
      // a per-node inline editor underneath; the reload button starts a
      // fresh full re-pick session on the drawing.
      html += `<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
        <span style="font-size:0.58rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;flex-shrink:0">Nodes</span>
        <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:0.65rem;color:#22c55e;font-family:var(--font-mono);padding:3px 6px;background:rgba(34,197,94,0.08);border:1px solid rgba(34,197,94,0.25);border-radius:3px;letter-spacing:0.3px">
          ${ids.map(id => 'N'+id).join(' · ')}
        </span>
        <button class="ed-add-btn ${isOpen ? 'comp-edit-active' : ''}" data-comp-editnodes="${i}"
                title="Edit individual nodes"
                style="font-size:0.6rem;padding:2px 6px;display:inline-flex;align-items:center;flex-shrink:0">${icon('pencil','11px')}</button>
        <button class="ed-add-btn" data-comp-repick="${i}" title="Re-pick all nodes from scratch"
                style="font-size:0.6rem;padding:2px 6px;display:inline-flex;align-items:center;flex-shrink:0">${icon('reload','11px')}</button>
      </div>`;

      // Inline node editor — only rendered for the currently-open row.
      // v26: simplified to a single-line space-separated input. The user
      // types node IDs in polygon order ("2 3 4 5" etc.) and presses Enter
      // (or just blurs) to commit. An aim button next to it lets them grab
      // an ID from the drawing and append it to the cursor position.
      if (isOpen) {
        const isPicking = !!(COMPARTMENT_NODE_PICK_SLOT && COMPARTMENT_NODE_PICK_SLOT.compIdx === i);
        const idsStr = ids.join(' ');
        html += `<div class="comp-node-editor" style="background:var(--bg-input);border:1px solid var(--border);border-radius:4px;padding:8px;margin-bottom:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-size:0.58rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;font-weight:600">Edit nodes — space-separated, in polygon order</span>
            <button class="ed-add-btn" data-comp-editnodes-close="${i}" style="font-size:0.6rem;padding:2px 6px;display:inline-flex;align-items:center" title="Close editor">${icon('close','10px')}</button>
          </div>
          <div style="display:flex;align-items:center;gap:5px">
            <input type="text" class="ed-input comp-nodes-line" value="${idsStr}"
                   data-comp-idx="${i}"
                   placeholder="e.g. 2 3 4 5 6"
                   style="flex:1;min-width:0;font-size:0.78rem;padding:5px 8px;font-family:var(--font-mono);letter-spacing:1px;${isPicking ? 'border-color:#a855f7' : ''}"
                   title="Type node IDs separated by spaces or commas. Press Enter to apply.">
            <button class="ed-add-btn ${isPicking ? 'comp-edit-active' : ''}"
                    data-comp-pick-append="${i}"
                    title="${isPicking ? 'Cancel pick — or press Esc' : 'Click a node on the drawing to append its ID'}"
                    style="font-size:0.6rem;padding:4px 7px;display:inline-flex;align-items:center;flex-shrink:0">${icon('target','11px')}</button>
          </div>
          <div style="font-size:0.55rem;color:var(--text-muted);margin-top:5px;line-height:1.45">
            <strong style="color:var(--text-secondary)">Enter</strong> to apply ·
            <strong style="color:var(--text-secondary)">Aim</strong> + click in drawing to append ·
            <strong style="color:var(--text-secondary)">Min 3</strong> nodes
          </div>
        </div>`;
      }
    } else {
      html += `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:6px">
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Y min</div>
          <input class="ed-input comp-y-min" type="number" value="${c.yMin}" data-comp-idx="${i}" step="100" style="width:100%;font-size:0.7rem;padding:3px 4px">
        </div>
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Y max</div>
          <input class="ed-input comp-y-max" type="number" value="${c.yMax}" data-comp-idx="${i}" step="100" style="width:100%;font-size:0.7rem;padding:3px 4px">
        </div>
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Z min</div>
          <input class="ed-input comp-z-min" type="number" value="${c.zMin}" data-comp-idx="${i}" step="100" style="width:100%;font-size:0.7rem;padding:3px 4px">
        </div>
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Z max</div>
          <input class="ed-input comp-z-max" type="number" value="${c.zMax}" data-comp-idx="${i}" step="100" style="width:100%;font-size:0.7rem;padding:3px 4px">
        </div>
      </div>`;
    }
    
    // ROW 3 — Properties (based on type)
    if (type === 'cargo') {
      html += `<div style="display:grid;grid-template-columns:1fr;gap:6px">
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Cargo Stowage Load</div>
          <div style="display:flex;align-items:center;gap:6px">
            <input class="ed-input comp-cargo" type="number" step="0.5" value="${c.cargoLoad ?? 0}" data-comp-idx="${i}" style="flex:1;font-size:0.72rem;padding:3px 6px">
            <span style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);flex-shrink:0">t/m²</span>
          </div>
        </div>
      </div>`;
    } else if (type === 'void' || type === 'cofferdam') {
      html += `<div style="font-size:0.62rem;color:var(--text-muted);font-style:italic;padding:4px 0">— no fluid/cargo load —</div>`;
    } else {
      // Tanks (ballast/fuel/freshwater): 3-column grid
      html += `<div style="display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:6px">
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px" title="Cargo / liquid density ρ in tonnes per cubic metre. Used in LR Pt 4 Ch 1 Tablo 1.9.1 deep-tank formulas: t = 0.004·s·f·√(ρ·h₄·k/1.025)+2.5 and Z = ρ·s·k·h₄·l_e²/(22·γ·(ω₁+ω₂+2)).">Density ρ (t/m³)</div>
          <input class="ed-input comp-rho" type="number" step="0.01" value="${c.rho ?? (type==='ballast'?1.025:(type==='fuel'?0.9:1.0))}" data-comp-idx="${i}" style="width:100%;font-size:0.72rem;padding:3px 4px">
        </div>
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px" title="Air pipe / overflow top elevation in mm ABOVE BASELINE (absolute z-coordinate, NOT relative to tank top). This is the 'top of overflow' z_OF in LR Pt 4 Ch 1 Tablo 1.9.1 (b)/(d). Drives h₄ = max(z_TT−z_ref, (z_OF−z_ref)/2, 0.5 m) — the design head used in scantling formulas.">Airpipe top z_OF (mm AB)</div>
          <input class="ed-input comp-airpipe" type="number" step="10" value="${c.airpipeZ_mm ?? ''}" data-comp-idx="${i}" placeholder="mm AB" style="width:100%;font-size:0.72rem;padding:3px 4px">
        </div>
        <div>
          <div style="font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px" title="Hydrostatic structural test water column above TANK TOP. Per LR Pt 3 Ch 1 Tablo 1.9.1, deep tank test head = the GREATER of (i) head up to top of overflow, or (ii) head 2.4 m above top of tank. So this field is the minimum (2.4 m); the inspector also computes overflow head from the airpipe and uses the greater. INFO ONLY for tank-test reporting — scantling formulas use LR Tablo 1.9.1 h₄ in Pt 4 Ch 1 Sec 9.">Test head (m, min 2.4)</div>
          <input class="ed-input comp-test" type="number" step="0.1" value="${c.testHead_m ?? 2.4}" data-comp-idx="${i}" style="width:100%;font-size:0.72rem;padding:3px 4px">
        </div>
      </div>`;
    }
    
    html += `</div>`;  // close compartment card
  });
  html += `</div>`;
  html += `</div>`;  // close compartments tab pane

  // === TAB: TRANSVERSE ===
  html += `<div class="ed-tab-pane ${EDITOR_TAB === 'transverse' ? 'active' : ''}" data-tab-pane="transverse">`;

  // ─── LOCAL EFFECT SUMMARY ───────────────────────────────────────────────
  // Show how many strakes have reduced s_eff and how many longs have reduced
  // l_e because of the user's transverse stiffeners and brackets.
  try {
    let strakesAffected = 0;
    let totalStrakesScanned = 0;
    ['shell','innerBottom','innerSide'].forEach(plate => {
      const arr = STRAKES[plate] || [];
      arr.forEach((_, i) => {
        totalStrakesScanned++;
        const cr = (typeof findCrossingTransStiffs === 'function')
          ? findCrossingTransStiffs(plate, i) : [];
        if (cr && cr.length > 0) strakesAffected++;
      });
    });
    let longsAffected = 0;
    let totalLongsScanned = 0;
    const G = GEOMETRY;
    [
      ['bottomShell','y',0],
      ['innerBottom','y',G.IB],
      ['sideShell','z',G.B_half],
      ['innerSide','z',G.IS],
      ['upperDeck','y',G.UD],
    ].forEach(([key, coord, fixed]) => {
      const arr = profiles[key] || [];
      arr.forEach(p => {
        totalLongsScanned++;
        const longInfo = (coord === 'y')
          ? { plate: key === 'bottomShell' ? 'shell' : (key === 'upperDeck' ? 'upperDeck' : key), y: p.y, z: fixed }
          : { plate: key === 'sideShell' ? 'shell' : 'innerSide', y: fixed, z: p.z };
        const eff = (typeof bracketSpanReductionForLong === 'function')
          ? bracketSpanReductionForLong(longInfo) : null;
        if (eff && eff.count > 0) longsAffected++;
      });
    });
    const tsCount = TRANSVERSE_STIFFS.length;
    const brCount = BRACKETS.length;
    html += `<div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.25);border-radius:4px;padding:8px 10px;margin-bottom:8px;font-size:0.7rem;line-height:1.5">
      <div style="font-weight:600;color:#a855f7;margin-bottom:4px">Local effects on scantling</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 8px">
        <div><span style="color:#ec4899">${tsCount}</span> trans stiff${tsCount!==1?'s':''} → <span style="color:var(--text-secondary)">${strakesAffected}/${totalStrakesScanned}</span> strakes with reduced s</div>
        <div><span style="color:#a855f7">${brCount}</span> bracket${brCount!==1?'s':''} → <span style="color:var(--text-secondary)">${longsAffected}/${totalLongsScanned}</span> longs with reduced l<sub>e</sub></div>
      </div>
      <div style="font-size:0.62rem;color:var(--text-muted);margin-top:5px;font-style:italic">
        Effects propagate: trans stiff lowers s in plate t formulas (LR Tables 1.4.1 / 1.5.2 / 1.7.1 etc.); bracket lowers l<sub>e</sub> in stiffener Z formulas (LR Tables 1.4.3 / 1.6.1 / 1.6.3 etc.).
      </div>
    </div>`;
  } catch(_) {}

  if (TRANSVERSE_PICK) {
    const n = TRANSVERSE_PICK.picks.length;
    const need = TRANSVERSE_PICK.kind === 'stiff' ? 2 : '3+';
    const kindLabel = TRANSVERSE_PICK.kind === 'stiff' ? 'stiff' : 'bracket/floor';
    html += `<div class="ed-hint ed-hint-active">
      <strong>Picking ${kindLabel}…</strong> ${n}/${need} node${n===1?'':'s'}. Switch to <em>Trans</em> view and click nodes.
      <div style="margin-top:6px;display:flex;gap:4px">
        ${TRANSVERSE_PICK.kind === 'bracket' && n >= 3 ? `<button class="ed-add-btn" id="transPickDone" style="background:rgba(34,197,94,0.18);border-color:#22c55e;color:#22c55e">Done (${n} nodes)</button>` : ''}
        <button class="ed-add-btn" id="transPickCancel">Cancel</button>
      </div>
    </div>`;
  } else {
    html += `<div class="ed-hint">Transverse elements connect <strong>nodes</strong>. Pick nodes in the <em>Trans</em> view to create them.</div>`;
  }

  // Transverse stiffs list
  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header">
    <span style="color:#ec4899">Transverse Stiffeners <span class="ed-count">(${TRANSVERSE_STIFFS.length})</span></span>
    <button class="ed-add-btn" id="transAddStiff" title="Pick 2 nodes">+ stiff</button>
  </div>`;
  // Inline CSS — hide number-input spinners (kept tight so all controls fit one row).
  // Without this the browser-default spinner buttons eat ~16px on every <input
  // type=number>, pushing the rightmost controls onto a second row.
  html += `<style>
    .ts-n1::-webkit-outer-spin-button, .ts-n1::-webkit-inner-spin-button,
    .ts-n2::-webkit-outer-spin-button, .ts-n2::-webkit-inner-spin-button,
    .br-node::-webkit-outer-spin-button, .br-node::-webkit-inner-spin-button {
      -webkit-appearance: none; margin: 0;
    }
    .ts-n1, .ts-n2, .br-node { -moz-appearance: textfield; }
    .ts-row {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 6px;
      border-bottom: 1px dashed var(--border-faint);
      flex-wrap: nowrap;          /* never wrap — single row always */
    }
    .ts-row .ts-node-input {
      width: 36px; padding: 3px 4px;
      font-size: 0.7rem; font-family: var(--font-mono, monospace);
      color: #ec4899; text-align: center;
      background: rgba(236,72,153,0.08);
      border: 1px solid rgba(236,72,153,0.3); border-radius: 3px;
    }
    .ts-row .ts-node-input:focus { outline: 1px solid #ec4899; }
    .ts-row .ts-node-label {
      font-size: 0.65rem; color: #ec4899; font-family: var(--font-mono, monospace);
      font-weight: 600; padding: 0 1px;
    }
  </style>`;
  // Build catalog dropdown options once (reused for every trans-stiff row).
  // We list FB, L, and HP profiles together, grouped by family. The stored
  // representation is a single profileName string (e.g. "FB 120x10") which
  // matches the canonical names used by window.Profile.allProfiles().
  // Legacy data (profile:'FB' + size:'120x10') is migrated on-the-fly to the
  // combined name in the value selector below.
  let _tsProfileOpts = '';
  try {
    if (window.Profile && window.Profile.allProfiles) {
      const fb = window.Profile.allProfiles(['FB']).map(p => p.name);
      const l  = window.Profile.allProfiles(['L']).map(p => p.name);
      const hp = window.Profile.allProfiles(['HP']).map(p => p.name);
      const grp = (label, list) => {
        if (!list.length) return '';
        return `<optgroup label="${label}">` +
          list.map(n => `<option value="${escapeXml(n)}">${escapeXml(n)}</option>`).join('') +
          `</optgroup>`;
      };
      _tsProfileOpts = grp('Flat bar', fb) + grp('Bulb plate', hp) + grp('Angle', l);
    }
  } catch(_) {}

  TRANSVERSE_STIFFS.forEach((s, i) => {
    // Migrate legacy { profile, size } → combined profileName for display.
    // We do NOT mutate the stored object here — the change handler below
    // writes back the combined name (and clears legacy fields) so that next
    // render reads a clean record.
    const currentName = s.profileName ||
      (s.profile && s.size ? `${s.profile} ${s.size}` : '');
    // If the migrated name isn't in the catalog (e.g. user-typed custom),
    // prepend it as a free-form option so it stays selectable.
    const optsForRow = (currentName && !_tsProfileOpts.includes(`value="${escapeXml(currentName)}"`))
      ? `<option value="${escapeXml(currentName)}" selected>${escapeXml(currentName)} (custom)</option>` + _tsProfileOpts
      : _tsProfileOpts;
    // Mark current selection
    const optsHtml = currentName
      ? optsForRow.replace(`value="${escapeXml(currentName)}"`, `value="${escapeXml(currentName)}" selected`)
      : optsForRow;

    html += `<div class="ts-row">
      <span class="ts-node-label">N</span>
      <input class="ed-input ts-n1 ts-node-input" type="number" value="${s.n1}" data-ts-idx="${i}" min="1" title="Start node ID — editable">
      <span class="ts-node-label">→ N</span>
      <input class="ed-input ts-n2 ts-node-input" type="number" value="${s.n2}" data-ts-idx="${i}" min="1" title="End node ID — editable">
      <input class="ed-input ts-name" type="text" value="${escapeXml(s.name || '')}" data-ts-idx="${i}" placeholder="name" style="flex:1;min-width:0;font-size:0.7rem;padding:3px 5px">
      <select class="ed-input ts-profile-name" data-ts-idx="${i}" title="Profile — pick from catalog (FB / HP / L)" style="width:118px;font-size:0.7rem;padding:3px 4px;font-family:var(--font-mono,monospace)">
        ${optsHtml}
      </select>
      <button class="ed-del" data-ts-del="${i}" title="Delete" style="flex:0 0 auto">${icon('close','10px')}</button>
    </div>`;
  });
  html += `</div>`;

  // Brackets list
  html += `<div class="ed-group">`;
  html += `<div class="ed-group-header">
    <span style="color:#a855f7">Brackets / Floors <span class="ed-count">(${BRACKETS.length})</span></span>
    <button class="ed-add-btn" id="transAddBracket" title="Pick 3+ nodes, then Done">+ bracket</button>
  </div>`;
  // Inline CSS — bracket row styling (matches the trans-stiff styling above
  // but with purple accent and allows wrapping when many nodes are selected).
  html += `<style>
    .br-row {
      display: flex; align-items: center; gap: 4px;
      padding: 4px 6px;
      border-bottom: 1px dashed var(--border-faint);
      flex-wrap: wrap;            /* may wrap when many nodes are picked */
    }
    .br-row .br-node-input {
      width: 36px; padding: 3px 4px;
      font-size: 0.7rem; font-family: var(--font-mono, monospace);
      color: #a855f7; text-align: center;
      background: rgba(168,85,247,0.08);
      border: 1px solid rgba(168,85,247,0.3); border-radius: 3px;
    }
    .br-row .br-node-input:focus { outline: 1px solid #a855f7; }
    .br-row .br-node-sep {
      color: #a855f7; font-family: var(--font-mono, monospace);
      font-size: 0.7rem; padding: 0 1px;
    }
    .br-row .br-add-node {
      padding: 2px 6px; font-size: 0.7rem; font-weight: 600;
      background: rgba(168,85,247,0.1);
      border: 1px solid rgba(168,85,247,0.4);
      color: #a855f7; border-radius: 3px; cursor: pointer;
      line-height: 1;
    }
    .br-row .br-add-node:hover { background: rgba(168,85,247,0.2); }
  </style>`;
  BRACKETS.forEach((b, i) => {
    const arm = (b.arm_mm != null ? b.arm_mm : 250);
    // Render each node ID as an editable input separated by ·
    const nodeInputsHtml = (b.nodes || []).map((id, ni) =>
      `<input class="ed-input br-node br-node-input" type="number" value="${id}" data-br-idx="${i}" data-br-node-idx="${ni}" min="1" title="Node #${ni+1} — editable">`
    ).join('<span class="br-node-sep">·</span>');
    html += `<div class="br-row">
      <span class="br-node-sep" style="font-weight:600">N</span>
      ${nodeInputsHtml}
      <button class="br-add-node" data-br-idx="${i}" title="Add another node">+</button>
      <input class="ed-input br-name" type="text" value="${escapeXml(b.name || '')}" data-br-idx="${i}" placeholder="name" style="flex:1;min-width:60px;font-size:0.7rem;padding:3px 5px">
      <select class="ed-input br-kind" data-br-idx="${i}" style="width:68px;font-size:0.7rem;padding:3px 4px">
        <option value="bracket"${b.kind==='bracket'?' selected':''}>bracket</option>
        <option value="floor"${b.kind==='floor'?' selected':''}>floor</option>
      </select>
      <input class="ed-input br-arm" type="number" value="${arm}" data-br-idx="${i}" min="50" max="2000" step="10" title="Bracket arm length (mm)" style="width:54px;font-size:0.7rem;padding:3px 5px">
      <span style="font-size:0.6rem;color:var(--text-muted)">mm</span>
      <button class="ed-del" data-br-del="${i}" title="Delete">${icon('close','10px')}</button>
    </div>`;
  });
  html += `</div>`;

  html += `</div>`;  // close transverse tab pane

  ec.innerHTML = html;

  // --- Geometry input handler ---
  ec.querySelectorAll('.geom-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const k = e.target.dataset.geomKey;
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) {
        GEOMETRY[k] = v;
        render();
      }
    });
  });
  const geomResetBtn = document.getElementById('geomReset');
  if (geomResetBtn) {
    geomResetBtn.addEventListener('click', () => {
      GEOMETRY = {
        B_half: 11880, IB: 1800, TT: 12900, UD: 15300, HC: 16350,
        R_B: 1800, keel_half: 900, duct_half: 900, IS: 10030
      };
      renderEditor();
      render();
    });
  }

  // --- Design Params input handler (spacing etc.) — triggers recompute ---
  ec.querySelectorAll('.param-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const k = e.target.dataset.paramKey;
      const v = parseFloat(e.target.value);
      if (!isNaN(v)) {
        PARAMS[k] = v;
        computeProfiles();  // spacing changed → profiles redistributed
        renderEditor();
        render();
      }
    });
  });

  // --- Profile type dropdowns (per-surface) ---
  ec.querySelectorAll('.proftype-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const k = e.target.dataset.proftypeKey;
      PARAMS[k] = e.target.value;
      render();
    });
  });

  // --- Profile dropdown per row in Profiles tab (stiff.profileName override) ---
  ec.querySelectorAll('.ed-profile-row-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const newName = e.target.value;
      const groupKey = e.target.getAttribute('data-edit-group');
      const idx = parseInt(e.target.getAttribute('data-edit-idx'));
      const arr = profiles[groupKey];
      if (!arr || !arr[idx]) return;
      // Resolve current group default name to compare. See PROFILE_SELECT_ID
      // note above — side/innerSide use multi-group selects.
      const GROUP_SEL_ID = {
        bottomShell:'bottomLongProfile', innerBottom:'ibLongProfile',
        sideShell:null,     innerSide:null,
        stringerStiff:'strDeckProfile', tweenStiff:'twnDeckProfile',
        coamingStiff:'coamingProfile',   upperDeck:'deckLongProfile'
      };
      const selId = GROUP_SEL_ID[groupKey];
      const scantSel = selId ? document.getElementById(selId) : null;
      const groupDefault = scantSel && scantSel.value ? scantSel.value : '';
      // If selected name matches group default, clear the override — use group default
      if (newName === groupDefault) {
        delete arr[idx].profileName;
      } else {
        // Store custom profile name on this specific stiffener
        arr[idx].profileName = newName;
      }
      // Re-render editor (to refresh highlight color) and drawing (if render
      // logic uses stiff.profileName — we need to check)
      renderEditor();
      render();
      // v31: live-refresh analysis when running. Without this, σ_hg /
      // buckling UC / rule margins all keep using the *previous* profile.
      _refreshAnalysisIfRunning('profile-edit');
    });
  });

  // --- Per-stiffener material-family override ---
  // gradeManual=true pins this long; otherwise the badge reads live from
  // the parent strake (which itself reads from the Setup zone). Selecting
  // '— auto' clears the pin.
  ec.querySelectorAll('.ed-stiff-mf').forEach(sel => {
    sel.addEventListener('change', e => {
      const groupKey = e.target.getAttribute('data-edit-group');
      const idx = parseInt(e.target.getAttribute('data-edit-idx'));
      const arr = profiles[groupKey];
      if (!arr || !arr[idx]) return;
      const newMf = e.target.value || null;
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }
      if (newMf) {
        arr[idx].materialFamily = newMf;
        arr[idx].family = (newMf === 'MS') ? 'Mild' : 'HT';
        arr[idx].gradeManual = true;       // user explicitly chose
        arr[idx].familyManual = true;
      } else {
        // '— auto': drop the pin. Don't write a fallback value into the
        // long — the live resolver picks up the current Setup zone every
        // render, so the field would just go stale.
        delete arr[idx].gradeManual;
        delete arr[idx].familyManual;
      }
      // k factor depends on family → recalc
      if (typeof recalcAll === 'function') recalcAll();
      renderEditor();
      render();
    });
  });

  // --- Side Girders input handler ---
  ec.querySelectorAll('.sg-input').forEach(inp => {
    inp.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.sgIdx);
      const v = parseFloat(e.target.value);
      if (isNaN(v) || !SIDE_GIRDERS[idx]) return;
      const check = validateSideGirder(v);
      if (!check.ok) {
        showError(check.msg, e.target);
        e.target.value = SIDE_GIRDERS[idx].y;
        return;
      }
      SIDE_GIRDERS[idx].y = v;
      computeProfiles();
      renderEditor();
      render();
    });
  });
  ec.querySelectorAll('[data-sg-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.currentTarget.dataset.sgDel);
      if (SIDE_GIRDERS[idx]) {
        SIDE_GIRDERS.splice(idx, 1);
        computeProfiles();
        renderEditor();
        render();
        if (window.Bridge && window.Bridge.onSideGirdersChangedFromDrawing) {
          window.Bridge.onSideGirdersChangedFromDrawing();
        }
      }
    });
  });
  const sgAddBtn = document.getElementById('sgAdd');
  if (sgAddBtn) {
    sgAddBtn.addEventListener('click', () => {
      const ys = SIDE_GIRDERS.map(s=>s.y);
      const last = ys.length ? Math.max(...ys) : GEOMETRY.duct_half + 2800;
      const next = Math.min(last + 2800, GEOMETRY.IS - 500);
      SIDE_GIRDERS.push({ y: Math.round(next) });
      computeProfiles();
      renderEditor();
      render();
      if (window.Bridge && window.Bridge.onSideGirdersChangedFromDrawing) {
        window.Bridge.onSideGirdersChangedFromDrawing();
      }
    });
  }

  // --- Coordinate input handler (profile groups only, skip geometry/params/sg/select/wt/comp) ---
  ec.querySelectorAll('.ed-input:not(.geom-input):not(.param-input):not(.sg-input):not(.proftype-select):not(.wt-select):not(.comp-name):not(.comp-y-min):not(.comp-y-max):not(.comp-z-min):not(.comp-z-max):not(.ed-spacing-edit)').forEach(inp => {
    if (inp.tagName === 'SELECT') return;
    inp.addEventListener('change', e => {
      const grpKey = e.target.dataset.group;
      const idx = parseInt(e.target.dataset.idx);
      const c = e.target.dataset.coord;
      const v = parseFloat(e.target.value);
      if (isNaN(v) || !profiles[grpKey] || !profiles[grpKey][idx]) return;

      // STRAKE VALIDATION — reject values outside bounds
      const check = validateStrake(grpKey, v);
      if (!check.ok) {
        showError(check.msg, e.target);
        e.target.value = profiles[grpKey][idx][c];  // revert to old value
        return;
      }

      // Record history BEFORE mutating the profile so undo can restore it.
      // Validation already passed so this change is real.
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }

      profiles[grpKey][idx][c] = v;

      // Linked alignment: if this group is linked, mirror the value to the partner at the same index.
      // EXTRA RULE: Side Shell ↔ Inner Side mirror only when Z < (UD - 600).
      // Near coaming (above UD-600) they are independent.
      const grp = EDITOR_GROUPS.find(g => g.key === grpKey);
      if (grp && grp.link && getLink(grp) && grp.linkWith) {
        const sideLinkThreshold = GEOMETRY.UD - 600;
        const isSideIS = (grp.link === 'linkSS_IS');
        const partnerAllowed = !isSideIS || v < sideLinkThreshold;
        if (partnerAllowed) {
          const partner = profiles[grp.linkWith];
          if (partner[idx]) partner[idx][c] = v;
        }
      }
      renderEditor();  // rebuild to reflect linked partner & clash warnings
      render();
      // Re-run scantling formulas because max stiffener spacing may have changed.
      if (typeof recalcAll === 'function') recalcAll();
    });
  });

  // --- Spacing-edit handler (PROF tab) ---
  // The "Spacing" cell in profile rows is editable. Editing it rewrites the
  // stiffener's coord to (prev + new spacing), giving the user a direct way
  // to dial in spacings without having to compute absolute Y/Z. The first
  // row in a sorted group has no previous neighbour and no editable input.
  ec.querySelectorAll('.ed-spacing-edit').forEach(inp => {
    inp.addEventListener('change', e => {
      const grpKey = e.target.dataset.group;
      const idx = parseInt(e.target.dataset.idx);
      const c = e.target.dataset.coord;
      const prev = parseFloat(e.target.dataset.prevCoord);
      const newSpacing = parseFloat(e.target.value);
      if (!profiles[grpKey] || !profiles[grpKey][idx] || !isFinite(newSpacing) || !isFinite(prev)) return;
      const newCoord = Math.round(prev + newSpacing);
      const check = validateStrake(grpKey, newCoord);
      if (!check.ok) {
        showError(check.msg, e.target);
        // Revert to the displayed-old spacing
        const oldCoord = profiles[grpKey][idx][c];
        e.target.value = oldCoord - prev;
        return;
      }
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }
      profiles[grpKey][idx][c] = newCoord;
      // Linked alignment, mirroring the generic coord handler above.
      const grp = EDITOR_GROUPS.find(g => g.key === grpKey);
      if (grp && grp.link && getLink(grp) && grp.linkWith) {
        const sideLinkThreshold = GEOMETRY.UD - 600;
        const isSideIS = (grp.link === 'linkSS_IS');
        const partnerAllowed = !isSideIS || newCoord < sideLinkThreshold;
        if (partnerAllowed) {
          const partner = profiles[grp.linkWith];
          if (partner[idx]) partner[idx][c] = newCoord;
        }
      }
      renderEditor();
      render();
      if (typeof recalcAll === 'function') recalcAll();
    });
  });

  // --- Delete handler (profile groups only — SG has its own handler above) ---
  ec.querySelectorAll('.ed-del[data-del-group]').forEach(btn => {
    btn.addEventListener('click', e => {
      const grpKey = e.currentTarget.dataset.delGroup;
      const idx = parseInt(e.currentTarget.dataset.delIdx);
      // Snapshot BEFORE mutation so undo restores the deleted stiffener
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }
      const deletedZ = (profiles[grpKey][idx] && profiles[grpKey][idx].z) || null;
      profiles[grpKey].splice(idx, 1);
      // If linked, also remove partner's same-index item
      // EXTRA RULE: Side ↔ IS shared delete only when Z < (UD - 600)
      const grp = EDITOR_GROUPS.find(g => g.key === grpKey);
      if (grp && grp.link && getLink(grp) && grp.linkWith && profiles[grp.linkWith][idx]) {
        const sideLinkThreshold = GEOMETRY.UD - 600;
        const isSideIS = (grp.link === 'linkSS_IS');
        const partnerAllowed = !isSideIS || (deletedZ !== null && deletedZ < sideLinkThreshold);
        if (partnerAllowed) {
          profiles[grp.linkWith].splice(idx, 1);
        }
      }
      renderEditor();
      render();
      // Re-run scantling formulas: plate-sizing depends on max stiffener spacing,
      // which just changed. Without this the plate-thickness panel stays stale.
      if (typeof recalcAll === 'function') recalcAll();
    });
  });

  // --- Add handler (opens modal for manual coord + profile entry) ---
  ec.querySelectorAll('[data-add]').forEach(btn => {
    btn.addEventListener('click', e => {
      const grpKey = e.currentTarget.dataset.add;
      if (typeof window.openAddStiff === 'function') {
        window.openAddStiff(grpKey);
      }
    });
  });

  // --- Equal-spacing handler (opens modal for distributing stiffeners) ---
  ec.querySelectorAll('[data-eq-spacing]').forEach(btn => {
    btn.addEventListener('click', e => {
      const grpKey = e.currentTarget.dataset.eqSpacing;
      if (typeof window.openEqualSpacing === 'function') {
        window.openEqualSpacing(grpKey);
      }
    });
  });

  // --- Group default profile select — updates the scantling-page dropdown ---
  ec.querySelectorAll('.ed-group-default-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const targetId = e.target.dataset.defaultSelId;
      const newVal = e.target.value;
      const target = document.getElementById(targetId);
      if (target) {
        target.value = newVal;
        // Fire change event so scantling recalculates with the new default
        target.dispatchEvent(new Event('change', { bubbles: true }));
      }
      renderEditor();  // refresh to show new default across rows that inherit it
      if (typeof render === 'function') render();
    });
  });

  // --- Link toggle ---
  ec.querySelectorAll('[data-link-grp]').forEach(btn => {
    btn.addEventListener('click', e => {
      const grpKey = e.currentTarget.dataset.linkGrp;
      const grp = EDITOR_GROUPS.find(g => g.key === grpKey);
      if (!grp) return;
      setLink(grp, !getLink(grp));
      renderEditor();
    });
  });

  // --- WT / Non-WT selects ---
  ec.querySelectorAll('.wt-select').forEach(sel => {
    sel.addEventListener('change', e => {
      const k = e.target.dataset.wtKey;
      WT_FLAGS[k] = e.target.value;
      render();
    });
  });

  // --- Compartment name/bounds inputs ---
  const compFields = [
    { cls:'comp-name',    key:'name',        parse: v => v },
    { cls:'comp-y-min',   key:'yMin',        parse: v => parseFloat(v) },
    { cls:'comp-y-max',   key:'yMax',        parse: v => parseFloat(v) },
    { cls:'comp-z-min',   key:'zMin',        parse: v => parseFloat(v) },
    { cls:'comp-z-max',   key:'zMax',        parse: v => parseFloat(v) },
    { cls:'comp-rho',     key:'rho',         parse: v => parseFloat(v) },
    { cls:'comp-airpipe', key:'airpipeZ_mm', parse: v => v === '' ? null : parseFloat(v) },
    { cls:'comp-test',    key:'testHead_m',  parse: v => v === '' ? null : parseFloat(v) },
    { cls:'comp-cargo',   key:'cargoLoad',   parse: v => parseFloat(v) },
  ];
  compFields.forEach(f => {
    ec.querySelectorAll('.' + f.cls).forEach(inp => {
      inp.addEventListener('change', e => {
        const i = parseInt(e.target.dataset.compIdx);
        if (!COMPARTMENTS[i]) return;
        const v = f.parse(e.target.value);
        if (f.key !== 'name' && f.key !== 'airpipeZ_mm' && f.key !== 'testHead_m' && isNaN(v)) return;
        COMPARTMENTS[i][f.key] = v;
        render();
        // If an Analysis-mode inspection panel is open, refresh it
        if (window.ANALYSIS_MODE && window.Bridge?.runRuleChecks) {
          window.Bridge.runRuleChecks();
        }
      });
    });
  });
  
  // --- Compartment type (select): changes what secondary fields appear ---
  ec.querySelectorAll('.comp-type').forEach(sel => {
    sel.addEventListener('change', e => {
      const i = parseInt(e.target.dataset.compIdx);
      if (!COMPARTMENTS[i]) return;
      const newType = e.target.value;
      COMPARTMENTS[i].type = newType;
      // Set sensible defaults on type switch
      if (newType === 'ballast' && COMPARTMENTS[i].rho == null) COMPARTMENTS[i].rho = 1.025;
      if (newType === 'fuel'    && COMPARTMENTS[i].rho == null) COMPARTMENTS[i].rho = 0.9;
      if (newType === 'freshwater' && COMPARTMENTS[i].rho == null) COMPARTMENTS[i].rho = 1.0;
      if (newType === 'cargo'   && COMPARTMENTS[i].cargoLoad == null) COMPARTMENTS[i].cargoLoad = 10;
      renderEditor();  // re-render to show correct secondary fields
      render();
      if (window.ANALYSIS_MODE && window.Bridge?.runRuleChecks) {
        window.Bridge.runRuleChecks();
      }
    });
  });

  // --- Compartment delete ---
  ec.querySelectorAll('[data-comp-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = parseInt(e.currentTarget.dataset.compDel);
      COMPARTMENTS.splice(i, 1);
      renderEditor();
      render();
    });
  });

  // --- Compartment add (numeric) ---
  const compAddBtn = document.getElementById('compAdd');
  if (compAddBtn) {
    compAddBtn.addEventListener('click', () => {
      COMPARTMENTS.push({ name:'NEW', yMin:0, yMax:GEOMETRY.B_half, zMin:0, zMax:GEOMETRY.UD });
      renderEditor();
      render();
    });
  }

  // --- Compartment add BY NODES (pick 4 nodes on drawing) ---
  const compAddByNodesBtn = document.getElementById('compAddByNodes');
  if (compAddByNodesBtn) {
    compAddByNodesBtn.addEventListener('click', () => {
      COMPARTMENT_PICK = { mode:'new', picks:[] };
      // Switch view to compartment so nodes become visible & clickable
      if (VIEW_MODE !== 'compartment') {
        VIEW_MODE = 'compartment';
        document.querySelectorAll('.view-pill').forEach(b => {
          b.classList.toggle('active', b.dataset.viewmode === 'compartment');
        });
      }
      renderEditor();
      render();
    });
  }

  // --- Cancel current pick ---
  const compPickCancelBtn = document.getElementById('compPickCancel');
  if (compPickCancelBtn) {
    compPickCancelBtn.addEventListener('click', () => {
      COMPARTMENT_PICK = null;
      renderEditor();
      render();
    });
  }

  // --- Done — commit current pick as a polygon compartment ---
  const compPickDoneBtn = document.getElementById('compPickDone');
  if (compPickDoneBtn) {
    compPickDoneBtn.addEventListener('click', () => commitCompartmentPick());
  }

  // --- Re-pick nodes for existing compartment ---
  ec.querySelectorAll('[data-comp-repick]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.currentTarget.getAttribute('data-comp-repick'));
      COMPARTMENT_PICK = { mode:'edit', editIdx: idx, picks:[] };
      if (VIEW_MODE !== 'compartment') {
        VIEW_MODE = 'compartment';
        document.querySelectorAll('.view-pill').forEach(b => {
          b.classList.toggle('active', b.dataset.viewmode === 'compartment');
        });
      }
      renderEditor();
      render();
    });
  });

  // === INLINE COMPARTMENT NODE EDITOR (v25+) ===
  // Lets the user tweak individual nodes of a compartment polygon without
  // re-picking everything. Helpers below mutate COMPARTMENTS in place,
  // re-render the editor + drawing, and (in analysis mode) re-run rule checks.
  const _refreshCompAfterEdit = () => {
    renderEditor();
    if (typeof render === 'function') render();
    if (window.ANALYSIS_MODE && window.Bridge?.runRuleChecks) {
      try { window.Bridge.runRuleChecks(); } catch(e){}
    }
  };
  const _getCompNodes = (i) => {
    const c = COMPARTMENTS[i]; if (!c) return null;
    if (Array.isArray(c.nodes)) return c.nodes;
    if (c.n1 != null) {
      // Migrate legacy n1..n4 → nodes[] so subsequent edits are uniform.
      c.nodes = [c.n1, c.n2, c.n3, c.n4].filter(v => v != null);
      delete c.n1; delete c.n2; delete c.n3; delete c.n4;
      return c.nodes;
    }
    return null;
  };

  // Toggle: open/close the inline node editor for one compartment row.
  ec.querySelectorAll('[data-comp-editnodes]').forEach(btn => {
    btn.addEventListener('click', e => {
      const idx = parseInt(e.currentTarget.getAttribute('data-comp-editnodes'));
      COMPARTMENT_NODE_EDIT = (COMPARTMENT_NODE_EDIT === idx) ? null : idx;
      COMPARTMENT_NODE_PICK_SLOT = null;  // cancel any pending single-pick
      // Make sure the user can SEE node IDs while editing — switch to
      // Comp view (which renders node dots in compartment-edit mode).
      if (COMPARTMENT_NODE_EDIT != null && VIEW_MODE !== 'compartment') {
        VIEW_MODE = 'compartment';
        document.querySelectorAll('.view-pill').forEach(b => {
          b.classList.toggle('active', b.dataset.viewmode === 'compartment');
        });
      }
      renderEditor();
      if (typeof render === 'function') render();
    });
  });

  // Explicit close button inside the editor.
  ec.querySelectorAll('[data-comp-editnodes-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      COMPARTMENT_NODE_EDIT = null;
      COMPARTMENT_NODE_PICK_SLOT = null;
      renderEditor();
      if (typeof render === 'function') render();
    });
  });

  // Direct ID list typed into the single-line input. Accepts space- or
  // comma-separated IDs, in polygon order. Commits on change (Enter / blur).
  // v26: replaces the per-slot row editor — much faster to retype "2 3 4 5".
  const _parseNodeLine = (str) => {
    return String(str || '')
      .split(/[\s,;]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => parseInt(s, 10))
      .filter(n => Number.isFinite(n) && n >= 1);
  };
  ec.querySelectorAll('.comp-nodes-line').forEach(inp => {
    // Apply on Enter for a snappy feel; also commit on blur.
    const apply = () => {
      const i = parseInt(inp.dataset.compIdx);
      const arr = _getCompNodes(i); if (!arr) return;
      const ids = _parseNodeLine(inp.value);
      if (ids.length < 3) {
        // Polygon needs ≥ 3 vertices — restore the previous value.
        renderEditor();
        return;
      }
      // Soft validation: any IDs outside the current cache → log a hint.
      if (Array.isArray(NODES_CACHE) && NODES_CACHE.length > 0) {
        const out = ids.filter(n => n > NODES_CACHE.length);
        if (out.length) {
          console.warn(`[comp-edit] These IDs are outside current cache (max N${NODES_CACHE.length}):`, out);
        }
      }
      // Replace in place so the live binding (Object.defineProperty) holds.
      arr.length = 0;
      ids.forEach(n => arr.push(n));
      _refreshCompAfterEdit();
    };
    inp.addEventListener('change', apply);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        apply();
        // Re-focus after re-render (renderEditor recreates the node).
        setTimeout(() => {
          const fresh = document.querySelector(`.comp-nodes-line[data-comp-idx="${inp.dataset.compIdx}"]`);
          if (fresh) {
            fresh.focus();
            const len = fresh.value.length;
            try { fresh.setSelectionRange(len, len); } catch(_) {}
          }
        }, 0);
      }
    });
  });

  // Aim → click in drawing → APPEND that node's ID at the end of the line.
  // (No more per-slot pick — appending to the line keeps the UI uniform.)
  ec.querySelectorAll('[data-comp-pick-append]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = parseInt(e.currentTarget.getAttribute('data-comp-pick-append'));
      // Toggle: clicking the same aim button cancels.
      if (COMPARTMENT_NODE_PICK_SLOT && COMPARTMENT_NODE_PICK_SLOT.compIdx === i) {
        COMPARTMENT_NODE_PICK_SLOT = null;
      } else {
        // slot = -1 is the sentinel meaning "append to nodes[]"
        COMPARTMENT_NODE_PICK_SLOT = { compIdx: i, slot: -1 };
        if (VIEW_MODE !== 'compartment') {
          VIEW_MODE = 'compartment';
          document.querySelectorAll('.view-pill').forEach(b => {
            b.classList.toggle('active', b.dataset.viewmode === 'compartment');
          });
        }
      }
      renderEditor();
      if (typeof render === 'function') render();
    });
  });

  // === TRANSVERSE TAB HANDLERS ===
  const transAddStiffBtn = document.getElementById('transAddStiff');
  if (transAddStiffBtn) {
    transAddStiffBtn.addEventListener('click', () => {
      TRANSVERSE_PICK = { kind:'stiff', picks:[] };
      if (VIEW_MODE !== 'transverse') {
        VIEW_MODE = 'transverse';
        document.querySelectorAll('.view-pill').forEach(b =>
          b.classList.toggle('active', b.dataset.viewmode === 'transverse'));
      }
      renderEditor();
      render();
    });
  }
  const transAddBracketBtn = document.getElementById('transAddBracket');
  if (transAddBracketBtn) {
    transAddBracketBtn.addEventListener('click', () => {
      TRANSVERSE_PICK = { kind:'bracket', picks:[] };
      if (VIEW_MODE !== 'transverse') {
        VIEW_MODE = 'transverse';
        document.querySelectorAll('.view-pill').forEach(b =>
          b.classList.toggle('active', b.dataset.viewmode === 'transverse'));
      }
      renderEditor();
      render();
    });
  }
  const transPickCancelBtn = document.getElementById('transPickCancel');
  if (transPickCancelBtn) {
    transPickCancelBtn.addEventListener('click', () => {
      TRANSVERSE_PICK = null;
      renderEditor();
      render();
    });
  }
  const transPickDoneBtn = document.getElementById('transPickDone');
  if (transPickDoneBtn) {
    transPickDoneBtn.addEventListener('click', () => commitBracketPick());
  }

  // Transverse stiff row: n1 / n2 / name / profile / size / delete
  // Editable node IDs (ts-n1 / ts-n2): user can directly type a different node.
  ec.querySelectorAll('.ts-n1').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-ts-idx'));
      const v = parseInt(e.target.value);
      if (TRANSVERSE_STIFFS[i] && v > 0) {
        TRANSVERSE_STIFFS[i].n1 = v;
        if (typeof recalcAll === 'function') recalcAll();
        renderEditor();
        render();
      }
    });
  });
  ec.querySelectorAll('.ts-n2').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-ts-idx'));
      const v = parseInt(e.target.value);
      if (TRANSVERSE_STIFFS[i] && v > 0) {
        TRANSVERSE_STIFFS[i].n2 = v;
        if (typeof recalcAll === 'function') recalcAll();
        renderEditor();
        render();
      }
    });
  });
  ec.querySelectorAll('.ts-name').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-ts-idx'));
      if (TRANSVERSE_STIFFS[i]) { TRANSVERSE_STIFFS[i].name = e.target.value; render(); }
    });
  });
  // Combined profile selector (catalog dropdown). Stores into TS as
  //   profileName: 'FB 120x10'
  // and clears legacy { profile, size } fields. Also extracts profile family
  // and size into the legacy fields for backward compatibility with code that
  // still reads ts.profile / ts.size (e.g. drawing helpers).
  ec.querySelectorAll('.ts-profile-name').forEach(sel => {
    sel.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-ts-idx'));
      const ts = TRANSVERSE_STIFFS[i];
      if (!ts) return;
      const name = e.target.value;
      ts.profileName = name;
      // Parse family + size for legacy consumers (e.g. polygon width).
      // Match "FB 120x10" / "HP 60x4" / "L 75x50x6" etc.
      const m = name.match(/^([A-Z]+)\s+(.+)$/);
      if (m) { ts.profile = m[1]; ts.size = m[2]; }
      // Trans-stiff change → polygon width depends on size → re-render
      // and (because s_eff via crossing-trans-stiffs is unaffected by size,
      // only by count, we don't need recalcAll here, just redraw)
      render();
    });
  });
  ec.querySelectorAll('[data-ts-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = parseInt(e.currentTarget.getAttribute('data-ts-del'));
      TRANSVERSE_STIFFS.splice(i, 1);
      if (SELECTED_TRANSVERSE === i) SELECTED_TRANSVERSE = null;
      else if (SELECTED_TRANSVERSE > i) SELECTED_TRANSVERSE--;
      // Trans stiff change → s_eff for crossed strakes changes → recalc plate t
      if (typeof recalcAll === 'function') recalcAll();
      renderEditor();
      render();
    });
  });

  // Bracket node IDs (br-node): user can directly type different node IDs.
  ec.querySelectorAll('.br-node').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-br-idx'));
      const ni = parseInt(e.target.getAttribute('data-br-node-idx'));
      const v = parseInt(e.target.value);
      if (BRACKETS[i] && Array.isArray(BRACKETS[i].nodes) && v > 0) {
        BRACKETS[i].nodes[ni] = v;
        if (typeof recalcAll === 'function') recalcAll();
        renderEditor();
        render();
      }
    });
  });
  // Add-node "+" button: appends a copy of the last node ID (user then edits it)
  ec.querySelectorAll('.br-add-node').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = parseInt(e.currentTarget.getAttribute('data-br-idx'));
      if (BRACKETS[i] && Array.isArray(BRACKETS[i].nodes)) {
        const last = BRACKETS[i].nodes[BRACKETS[i].nodes.length - 1] || 1;
        BRACKETS[i].nodes.push(last);
        renderEditor();
        render();
      }
    });
  });

  // Bracket row: name / kind / delete
  ec.querySelectorAll('.br-name').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-br-idx'));
      if (BRACKETS[i]) { BRACKETS[i].name = e.target.value; render(); }
    });
  });
  ec.querySelectorAll('.br-kind').forEach(sel => {
    sel.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-br-idx'));
      if (BRACKETS[i]) { BRACKETS[i].kind = e.target.value; render(); }
    });
  });
  // Bracket arm input — controls how much l_e is reduced for any longitudinal
  // attached to this bracket (LR Pt 4 Ch 1 Sec 1.5 / Pt 3 Ch 10 Sec 3.4).
  ec.querySelectorAll('.br-arm').forEach(inp => {
    inp.addEventListener('change', e => {
      const i = parseInt(e.target.getAttribute('data-br-idx'));
      const v = parseFloat(e.target.value);
      if (BRACKETS[i] && isFinite(v) && v > 0) {
        BRACKETS[i].arm_mm = v;
        // Bracket-arm change affects stiffener Z_req → recalc everything
        if (typeof recalcAll === 'function') recalcAll();
        render();
      }
    });
  });
  ec.querySelectorAll('[data-br-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const i = parseInt(e.currentTarget.getAttribute('data-br-del'));
      BRACKETS.splice(i, 1);
      if (SELECTED_BRACKET === i) SELECTED_BRACKET = null;
      else if (SELECTED_BRACKET > i) SELECTED_BRACKET--;
      // Bracket change → l_e of attached longs changes → recalc Z_req
      if (typeof recalcAll === 'function') recalcAll();
      renderEditor();
      render();
    });
  });

  // --- Tab switcher ---
  ec.querySelectorAll('.ed-tab').forEach(btn => {
    btn.addEventListener('click', e => {
      const k = e.currentTarget.dataset.edTab;
      if (!k || k === EDITOR_TAB) return;
      EDITOR_TAB = k;
      // Just toggle classes — no need to re-render everything
      ec.querySelectorAll('.ed-tab').forEach(b => b.classList.toggle('active', b.dataset.edTab === k));
      ec.querySelectorAll('.ed-tab-pane').forEach(p => p.classList.toggle('active', p.dataset.tabPane === k));
    });
  });

  // Helper: compute the total geometric extent of a plate (mm).
  // IS extends from IB up to HC (Coaming wall is part of the Inner Side).
  // IB extends from duct_half (or 0 if no duct) to IS inboard.
  // UD spans from IS outboard to B_half.
  // Shell total = keel + bottom + bilge + side segments.
  const plateGeometryTotal = (plateKey) => {
    const g = GEOMETRY;
    switch (plateKey) {
      case 'innerSide':   return g.HC - g.IB;                    // IB → HC (Coaming included)
      case 'innerBottom': return g.B_half;
      case 'upperDeck':   return g.B_half - g.IS;
      case 'shell': {
        const L = shellGeometryLengths();
        return L.total;
      }
      // Side Girders: vertical plates from Z=0 (bottom shell) to Z=IB (inner bottom)
      case 'sideGirder0':
      case 'sideGirder1':
      case 'sideGirder2':
        return g.IB;
      default: {
        // Dynamic per-level groups: stringerN / tweenN span IS → B_half
        if (/^stringer\d+$/.test(plateKey) || /^tween\d+$/.test(plateKey)) {
          return Math.max(0, g.B_half - g.IS);
        }
        return null;
      }
    }
  };
  
  // Helper: re-balance strakes so their total equals the geometry total.
  // Called when the user edits a strake width. The LAST strake is used as the
  // "slack" absorber — it's adjusted so sum == target. If the user edited the
  // last strake themselves, the second-to-last becomes slack.
  //
  // ---------------------------------------------------------------------------
  // Re-balance: keep sum(strake widths) == panel total.
  // The LAST strake is the slack absorber. If the user just edited the last
  // strake, the slack shifts to the one before it.
  // ---------------------------------------------------------------------------
  const MIN_STRAKE = 10;
  const rebalanceStrakes = (plateKey, editedIdx) => {
    const target = plateGeometryTotal(plateKey);
    if (target == null || !STRAKES[plateKey] || STRAKES[plateKey].length === 0) return;
    const arr = STRAKES[plateKey];
    if (arr.length === 1) {
      arr[0].width = Math.max(MIN_STRAKE, Math.round(target));
      return;
    }
    const lastIdx = arr.length - 1;
    let slackIdx = lastIdx;
    if (editedIdx === lastIdx) slackIdx = lastIdx - 1;
    let sumOthers = 0;
    for (let k = 0; k < arr.length; k++) {
      if (k === slackIdx) continue;
      sumOthers += arr[k].width;
    }
    const newSlack = target - sumOthers;
    arr[slackIdx].width = Math.max(MIN_STRAKE, Math.round(newSlack));
  };
  window.rebalanceStrakes = rebalanceStrakes;
  window.plateGeometryTotal = plateGeometryTotal;
  
  // --- Strake width/thickness/WT ---
  const attachStrakeNumber = (selector, field, autoManual) => {
    ec.querySelectorAll(selector).forEach(inp => {
      const handler = e => {
        const pk = e.target.getAttribute('data-plate');
        const i  = parseInt(e.target.getAttribute('data-strake-idx'));
        const v  = parseFloat(e.target.value);
        if (!STRAKES[pk] || !STRAKES[pk][i] || isNaN(v) || v <= 0) return;
        const oldVal = STRAKES[pk][i][field];
        const newVal = Math.round(v);
        if (oldVal === newVal) return;  // no change, skip snapshot + work

        // =====================================================================
        // =====================================================================
        // WIDTH PRE-VALIDATION — auto-fit model
        // ---------------------------------------------------------------------
        // Every strake is editable. After the edit, one "slack" strake will
        // be adjusted to keep the sum equal to the panel total. By convention
        // the slack is the LAST strake, unless the user is editing the last
        // strake — in which case the slack shifts to the strake just before.
        //
        // We only reject the edit if it is mathematically impossible to stay
        // within the panel: i.e. (sum of fixed strakes) + (new value) +
        // MIN_SLACK > panel total. Otherwise we accept and let rebalance do
        // its thing.
        // =====================================================================
        if (field === 'width') {
          const arr = STRAKES[pk];
          const lastIdx = arr.length - 1;
          const target = (typeof plateGeometryTotal === 'function') ? plateGeometryTotal(pk) : null;
          const MIN_SLACK = 10;

          if (target != null && arr.length > 1) {
            // Determine which strake will become the slack after this edit.
            const slackIdx = (i === lastIdx) ? (lastIdx - 1) : lastIdx;
            let sumFixed = 0;
            for (let k = 0; k < arr.length; k++) {
              if (k === i || k === slackIdx) continue;
              sumFixed += arr[k].width;
            }
            const maxAllowed = target - sumFixed - MIN_SLACK;
            if (newVal > maxAllowed) {
              // HARD REJECT
              e.target.value = oldVal;
              e.target.style.transition = 'background 0.3s, border-color 0.3s';
              const prevBg = e.target.style.background;
              const prevBc = e.target.style.borderColor;
              e.target.style.background = 'rgba(239,68,68,0.28)';
              e.target.style.borderColor = '#ef4444';
              setTimeout(() => {
                e.target.style.background = prevBg || '';
                e.target.style.borderColor = prevBc || '';
              }, 900);
              e.target.title = `Max for this strake: ${maxAllowed} mm. Panel total is ${target} mm. Delete a strake if you need more room.`;
              return;
            }
          }
        }

        // Record snapshot BEFORE mutation
        if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
          window.HistoryManager.recordChange();
        }
        STRAKES[pk][i][field] = newVal;
        if (autoManual) STRAKES_AUTO = false;
        // AUTO-REBALANCE: whichever strake the user just edited, the slack
        // (last or second-last depending on edit target) absorbs the diff.
        if (field === 'width') {
          rebalanceStrakes(pk, i);
          if (typeof renderEditor === 'function') renderEditor();
        }
        render();
        // REVERSE SYNC: if strake thickness edited, push to scantling
        if (field === 'thickness' && window.Bridge && typeof window.Bridge.onStrakeEditFromDrawing === 'function') {
          window.Bridge.onStrakeEditFromDrawing(pk, i, Math.round(v));
        }
        // v31: in analysis mode, the user's edit needs to flow into the
        // hull-girder σ, buckling UC, rule margins, and the floating Info
        // overlay. Previously these stayed stale until the user re-clicked
        // "Run Analysis". Trigger a full refresh now so panels are live.
        _refreshAnalysisIfRunning('strake-edit');
      };
      inp.addEventListener('change', handler);
      inp.addEventListener('blur',   handler);
    });
  };
  attachStrakeNumber('.strake-width', 'width',     true);
  attachStrakeNumber('.strake-thick', 'thickness', false);

  // Material family dropdown — per-strake manual override of the auto-from-
  // Setup default. Empty value ('— auto') clears the pin and reverts to
  // Setup-zone resolution; any other value pins the strake. The change
  // propagates to longs that sit on this strake and aren't themselves
  // pinned (gradeManual). Recalc afterwards so k flows to plate / Z_req.
  ec.querySelectorAll('.strake-mf').forEach(sel => {
    sel.addEventListener('change', e => {
      const pk = e.target.getAttribute('data-plate');
      const i  = parseInt(e.target.getAttribute('data-strake-idx'));
      if (!STRAKES[pk] || !STRAKES[pk][i]) return;
      const strake = STRAKES[pk][i];
      const newMf = e.target.value || null;
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }
      if (newMf) {
        strake.materialFamily = newMf;
        strake.family = (newMf === 'MS') ? 'Mild' : 'HT';
        strake.materialFamilyManual = true;
      } else {
        // '— auto': drop the pin so Setup zone takes over again. Leave any
        // previously-derived family/grade/class fields in place — they're
        // harmless and the next assign run will refresh them.
        delete strake.materialFamilyManual;
      }
      // Propagate the new effective grade to longs sitting on this strake
      // (those without their own gradeManual pin). Mirrors the inspector-
      // side handler for inspGrade.
      try {
        const D = window.Draw;
        if (D && D.profiles && typeof getStrakeForLong === 'function') {
          const effectiveMf = newMf
            || (typeof getZoneMaterialForStrake === 'function'
                ? getZoneMaterialForStrake(pk, strake)
                : null);
          const effectiveFamily = effectiveMf
            ? (effectiveMf === 'MS' ? 'Mild' : 'HT')
            : null;
          const longGroups = ['bottomShell','sideShell','innerBottom','innerSide',
                              'upperDeck','stringerStiff','tweenStiff','coamingStiff'];
          longGroups.forEach(grpKey => {
            const arr = D.profiles[grpKey];
            if (!Array.isArray(arr)) return;
            arr.forEach((p, ix) => {
              if (p.gradeManual && p.materialFamily) return;
              const ps = getStrakeForLong(grpKey, ix);
              if (ps !== strake) return;
              if (effectiveMf) {
                p.materialFamily = effectiveMf;
                p.family = effectiveFamily;
              }
            });
          });
        }
      } catch (_) {}
      if (typeof recalcAll === 'function') recalcAll();
      if (typeof renderEditor === 'function') renderEditor();
      render();
    });
  });

  // Add strake
  ec.querySelectorAll('[data-strake-add]').forEach(btn => {
    btn.addEventListener('click', e => {
      const pk = e.currentTarget.dataset.strakeAdd;
      if (!STRAKES[pk]) return;
      // Panel-fit guard: don't add a strake if the slack (last) strake has no
      // room to spare. Every panel has a fixed geometry total, so the sum of
      // strake widths must not exceed it.
      const last = STRAKES[pk][STRAKES[pk].length - 1];
      if (!last || last.width < 30) {
        // Soft feedback: briefly flash the button red so the user sees why
        // the click didn't do anything.
        const btnEl = e.currentTarget;
        const prevBg = btnEl.style.background;
        const prevBc = btnEl.style.borderColor;
        btnEl.style.background = 'rgba(239,68,68,0.2)';
        btnEl.style.borderColor = '#ef4444';
        btnEl.title = 'Panel is full — reduce an existing strake first.';
        setTimeout(() => {
          btnEl.style.background = prevBg || '';
          btnEl.style.borderColor = prevBc || '';
        }, 900);
        return;
      }
      // Record snapshot BEFORE mutation so undo rolls back the add
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }
      const thickness = last.thickness || 14;
      // Split the slack in half: the NEW strake takes half, the slack gets
      // the remainder. The new strake is inserted BEFORE the current slack so
      // that the last strake in the array stays the auto-filled one.
      const halfWidth = Math.max(MIN_STRAKE, Math.floor(last.width / 2));
      const lastIdx = STRAKES[pk].length - 1;
      STRAKES[pk].splice(lastIdx, 0, { width: halfWidth, thickness });
      STRAKES_AUTO = false;
      // Recompute the (new) slack strake's width so sum == panel total
      rebalanceStrakes(pk);
      renderEditor();
      render();
      _refreshAnalysisIfRunning('strake-add');
    });
  });
  // Delete strake
  ec.querySelectorAll('[data-strake-del]').forEach(btn => {
    btn.addEventListener('click', e => {
      const pk = e.currentTarget.dataset.strakeDel;
      const i  = parseInt(e.currentTarget.dataset.strakeIdx);
      if (!STRAKES[pk] || !STRAKES[pk][i]) return;
      // Don't allow deleting the last (slack) strake directly — panel must
      // have at least one strake that absorbs the remainder. If the user
      // wants to remove it, they need to delete an earlier strake first.
      if (STRAKES[pk].length <= 1) return;
      if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
        window.HistoryManager.recordChange();
      }
      STRAKES[pk].splice(i, 1);
      STRAKES_AUTO = false;
      // The new last strake absorbs the freed width automatically.
      rebalanceStrakes(pk);
      renderEditor();
      render();
      _refreshAnalysisIfRunning('strake-del');
    });
  });
  // Toggle auto-compute mode
  const strakeAutoToggle = document.getElementById('strakeAutoToggle');
  if (strakeAutoToggle) {
    strakeAutoToggle.addEventListener('click', () => {
      STRAKES_AUTO = !STRAKES_AUTO;
      if (STRAKES_AUTO) {
        // Regenerate from defaults
        computeStrakes();
      }
      renderEditor();
      render();
      _refreshAnalysisIfRunning('strake-auto-toggle');
    });
  }
  // Reset all strakes to defaults
  const strakeResetAll = document.getElementById('strakeResetAll');
  if (strakeResetAll) {
    strakeResetAll.addEventListener('click', () => {
      STRAKES_AUTO = true;
      computeStrakes();
      renderEditor();
      render();
      _refreshAnalysisIfRunning('strake-reset');
    });
  }
}

// =========================================================================
// DYNAMIC PROFILE VISUAL SIZES — maps stiffener group → {webH, flangeW} in mm
// These are filled by Bridge from scantling's group-specific profile selections.
// SVG-pixel sizes are derived from mm values via _visualProfileDims().
// =========================================================================
const PROFILE_VISUAL_SIZES = {
  // group key  →  { webH:mm, flangeW:mm, type:'L'|'HP'|'FB'|'T' }
  // Defaults (used before scantling sync)
  bottomShell:   { webH:150, flangeW:90, type:'L' },
  innerBottom:   { webH:150, flangeW:90, type:'L' },
  sideShell:     { webH:150, flangeW:90, type:'L' },
  innerSide:     { webH:150, flangeW:90, type:'L' },
  stringerStiff: { webH:150, flangeW:90, type:'L' },
  tweenStiff:    { webH:150, flangeW:90, type:'L' },
  upperDeckStiff:{ webH:150, flangeW:90, type:'L' },
  coamingStiff:  { webH:150, flangeW:90, type:'L' }
};

// Convert real mm webH/flangeW to SVG-pixel visual size.
// Scale so that real 150 mm → 8 px (base), 300 mm → 13 px, 75 mm → 5 px
// If `stiff` is given and has a per-row profileName override, parse it and use
// those dimensions instead of the group default.
function _visualProfileDims(groupKey, stiff) {
  let src = PROFILE_VISUAL_SIZES[groupKey] || { webH:150, flangeW:90, type:'L' };
  // Per-stiffener override: stiff.profileName like "HP 200x10", "L 250x90x12", "FB 200x20"
  if (stiff && stiff.profileName) {
    const name = stiff.profileName;
    let type = src.type, webH = src.webH, flangeW = src.flangeW;
    if (/^L\s+(\d+)x(\d+)x(\d+)/i.test(name)) {
      const m = name.match(/^L\s+(\d+)x(\d+)x(\d+)/i);
      type = 'L'; webH = parseInt(m[1]); flangeW = parseInt(m[2]);
    } else if (/^HP\s+(\d+)x(\d+)/i.test(name)) {
      const m = name.match(/^HP\s+(\d+)x(\d+)/i);
      type = 'HP'; webH = parseInt(m[1]); flangeW = 0;
    } else if (/^FB\s+(\d+)x(\d+)/i.test(name)) {
      const m = name.match(/^FB\s+(\d+)x(\d+)/i);
      type = 'FB'; webH = parseInt(m[1]); flangeW = 0;
    }
    src = { webH, flangeW, type };
  }
  // Legacy: if stiff has edge/coaming explicit h/t, use those (coaming edge FB)
  if (stiff && stiff.edge && stiff.type === 'FB' && stiff.h) {
    src = { webH: stiff.h, flangeW: 0, type: 'FB' };
  }
  // Real-scale rendering: use the same SCALE (mm → SVG pixel) as the rest of
  // the drawing. Earlier formula was `Math.round(3 + h_mm * 0.033)` which
  // (a) added a constant +3 px → tiny stiffs still rendered ~5 px tall
  //     instead of ~3 px, breaking proportion against side-shell length
  // (b) had no upper bound but was also amplified by a *1.5 factor in the
  //     FB drawer → a 200 mm FB rendered ~14 px tall instead of ~7 px.
  // Now h and fl are exactly h_mm × SCALE, with a 2 px floor for tiny
  // sections so they remain clickable but stay visually proportional.
  const h  = Math.max(2, Math.round(src.webH    * SCALE));
  const fl = Math.max(2, Math.round(src.flangeW * SCALE));
  return { h, fl, type: src.type };
}

// Update visual sizes from a map of group → profile name (e.g. "L 250x100x12").
// Called by Bridge after scantling profile changes.
function updateVisualProfileSizes(groupSizes) {
  if (!groupSizes) return;
  Object.keys(groupSizes).forEach(key => {
    const val = groupSizes[key];
    if (!val || typeof val !== 'string') return;
    // Parse "L 250x100x12" or "HP 200x10" or "FB 180x12"
    let type = 'L', webH = 150, flangeW = 90;
    if (val.startsWith('L ')) {
      const m = val.match(/L\s+(\d+)x(\d+)x(\d+)/i);
      if (m) { type = 'L'; webH = parseInt(m[1]); flangeW = parseInt(m[2]); }
    } else if (val.startsWith('HP ')) {
      const m = val.match(/HP\s+(\d+)x(\d+)/i);
      if (m) { type = 'HP'; webH = parseInt(m[1]); flangeW = 0; }
    } else if (val.startsWith('FB ')) {
      const m = val.match(/FB\s+(\d+)x(\d+)/i);
      if (m) { type = 'FB'; webH = parseInt(m[1]); flangeW = 0; }
    }
    // Map scantling group names → drawing group keys
    const keyMap = {
      bottom: 'bottomShell',
      innerBottom: 'innerBottom',
      stringer: 'stringerStiff',
      tween: 'tweenStiff',
      upperDeck: 'upperDeckStiff',
      coaming: 'coamingStiff',
      // side and innerSide are "mixed" at group level — use a representative value
      side: 'sideShell',
      innerSide: 'innerSide'
    };
    const drawKey = keyMap[key];
    if (drawKey) {
      PROFILE_VISUAL_SIZES[drawKey] = { webH, flangeW, type };
    }
  });
  // For "side" and "innerSide" when value is like "G1: L 250x90x12, G2: ..."
  // just pick the first group as representative for the visual
  ['side','innerSide'].forEach(groupKey => {
    const v = groupSizes[groupKey];
    if (!v || typeof v !== 'string') return;
    const firstMatch = v.match(/(L|HP|FB)\s+(\d+)x(\d+)(?:x(\d+))?/i);
    if (firstMatch) {
      const type = firstMatch[1].toUpperCase();
      const webH = parseInt(firstMatch[2]);
      const flangeW = type === 'L' ? parseInt(firstMatch[3]) : 0;
      const drawKey = groupKey === 'side' ? 'sideShell' : 'innerSide';
      PROFILE_VISUAL_SIZES[drawKey] = { webH, flangeW, type };
    }
  });
}
window.updateVisualProfileSizes = updateVisualProfileSizes;

// =========================================================================
// LONGITUDINAL DRAWING — Correct orientation per DXF:
//   - DB L profiles: flange points TOWARD CL (toward centerline)
//   - Side L profiles in tank: flange points DOWNWARD always
//   - Inner side L profiles: flange points DOWNWARD (same as side tank)
//   - Deck L profiles: flange points INWARD (toward CL = downward into hold)
// =========================================================================
// Generate an invisible clickable overlay for a stiffener.
// orientation: 'vertical' (bottom/IB/decks/upper) or 'horizontal' (side/IS)
// x, y : anchor point (usually where the stiff attaches to its plate)
// group: stiffener group key for selection state
// idx  : index in that group's array
function drawStiffHit(x, y, orientation, group, idx, plateZ) {
  // Hit area dimensions — narrow enough not to swallow strake clicks,
  // but wide enough to target the profile reliably. Matches actual stiff
  // visual footprint (~8-12px wide, ~15-20px long).
  // Ice intermediates ({ice:true}) get a smaller hit area so they don't
  // crowd out plate-strake clicks on the side shell.
  // plateZ (optional): for linked-deck stiffener groups (stringerStiff,
  // tweenStiff) — the z (mm) of the deck plate this hit belongs to. The
  // SAME stiff index is rendered once per plate, so plateZ is what
  // disambiguates them downstream (l_e override, Z_req per plate).
  let HIT = 10, LEN = 18;
  let isIce = false;
  try {
    const stiff = profiles && profiles[group] && profiles[group][idx];
    if (stiff && stiff.ice === true) {
      HIT = 4;
      LEN = 10;
      isIce = true;
    }
  } catch (_) { /* keep defaults */ }
  // Build tooltip: "BS05 — Bottom Shell Longitudinal 5"
  // (position code first for quick scanning, then the long name).
  let tooltip;
  try {
    const longName = (typeof resolveStiffDisplayName === 'function')
                     ? resolveStiffDisplayName(group, idx)
                     : `${group} #${idx + 1}`;
    let posCode = null;
    if (typeof resolveCodeForLongGroup === 'function') {
      const code = resolveCodeForLongGroup(group);
      if (code && typeof resolveStiffOrdinal === 'function') {
        const ord = resolveStiffOrdinal(group, idx) || (idx + 1);
        posCode = code + String(ord).padStart(2, '0');
      }
    }
    tooltip = posCode ? `${posCode} — ${longName}` : longName;
    if (isIce) tooltip = `[ICE] ${tooltip}`;
  } catch (_) { tooltip = (isIce ? '[ICE] ' : '') + `${group} #${idx + 1}`; }
  const pzAttr = (plateZ != null && isFinite(plateZ)) ? ` data-plate-z="${plateZ}"` : '';
  if (orientation === 'vertical') {
    return `<rect x="${x - HIT/2}" y="${y - LEN}" width="${HIT}" height="${LEN*2}" fill="#000" fill-opacity="0" pointer-events="all" style="cursor:pointer" data-stiff-group="${group}" data-stiff-idx="${idx}"${pzAttr}><title>${tooltip}</title></rect>`;
  } else {
    return `<rect x="${x - LEN}" y="${y - HIT/2}" width="${LEN*2}" height="${HIT}" fill="#000" fill-opacity="0" pointer-events="all" style="cursor:pointer" data-stiff-group="${group}" data-stiff-idx="${idx}"${pzAttr}><title>${tooltip}</title></rect>`;
  }
}

function drawL_onBottom(x, isPortOfCL, type, color, group, stiff) {
  // Bottom plate: web goes UP from plate, flange points TOWARD CL
  const dims = _visualProfileDims(group || 'bottomShell', stiff);
  const h = dims.h, fl = dims.fl;
  // type override: if dims has HP/FB, use it; otherwise respect passed `type`
  const useType = dims.type || type;
  const c = color || '#4ade80';
  const isAtCL = Math.abs(x - X(0)) < 0.5;
  let out = '';
  if (useType === 'FB') {
    out += `<line x1="${x}" y1="${BASELINE_Y}" x2="${x}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="2" fill="none"/>`;
  } else if (useType === 'HP') {
    // HP: thin web + small asymmetric bulb at top (perpendicular to web)
    const hpBulbSize = Math.max(2, Math.round(h * 0.25));
    const hpDir = isPortOfCL ? +1 : -1;
    out += `<line x1="${x}" y1="${BASELINE_Y}" x2="${x}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x}" y1="${BASELINE_Y - h}" x2="${x + hpDir*hpBulbSize}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x + hpDir*hpBulbSize}" y1="${BASELINE_Y - h}" x2="${x}" y2="${BASELINE_Y - h + hpBulbSize}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
  } else if (isAtCL) {
    out += `<line x1="${x}" y1="${BASELINE_Y}" x2="${x}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${x - fl}" y1="${BASELINE_Y - h}" x2="${x + fl}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  } else {
    const flDir = isPortOfCL ? +1 : -1;
    out += `<line x1="${x}" y1="${BASELINE_Y}" x2="${x}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${x}" y1="${BASELINE_Y - h}" x2="${x + flDir*fl}" y2="${BASELINE_Y - h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  }
  return `<g pointer-events="none">${out}</g>`;
}

function drawL_onIB(x, type, color, group, stiff) {
  const dims = _visualProfileDims(group || 'innerBottom', stiff);
  const h = dims.h, fl = dims.fl;
  const useType = dims.type || type;
  const svgIB = Y(GEOMETRY.IB);
  const c = color || '#4ade80';
  const isAtCL = Math.abs(x - X(0)) < 0.5;
  let out = '';
  if (useType === 'FB') {
    out += `<line x1="${x}" y1="${svgIB}" x2="${x}" y2="${svgIB + h}" stroke="${c}" stroke-width="2" fill="none"/>`;
  } else if (useType === 'HP') {
    // HP on IB: thin web + small asymmetric bulb at bottom of web (inside DB tank)
    const hpBulbSize = Math.max(2, Math.round(h * 0.25));
    out += `<line x1="${x}" y1="${svgIB}" x2="${x}" y2="${svgIB + h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x}" y1="${svgIB + h}" x2="${x - hpBulbSize}" y2="${svgIB + h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x - hpBulbSize}" y1="${svgIB + h}" x2="${x}" y2="${svgIB + h - hpBulbSize}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
  } else if (isAtCL) {
    out += `<line x1="${x}" y1="${svgIB}" x2="${x}" y2="${svgIB + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${x - fl}" y1="${svgIB + h}" x2="${x + fl}" y2="${svgIB + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  } else {
    out += `<line x1="${x}" y1="${svgIB}" x2="${x}" y2="${svgIB + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${x}" y1="${svgIB + h}" x2="${x - fl}" y2="${svgIB + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  }
  return `<g pointer-events="none">${out}</g>`;
}

function drawL_onSide(y_svg, type, color, group, stiff) {
  const dims = _visualProfileDims(group || 'sideShell', stiff);
  const h = dims.h, fl = dims.fl;
  const useType = dims.type || type;
  const xShell = X(GEOMETRY.B_half);
  const c = color || '#4ade80';
  let out = '';
  if (useType === 'FB') {
    out += `<line x1="${xShell}" y1="${y_svg}" x2="${xShell - h}" y2="${y_svg}" stroke="${c}" stroke-width="2" fill="none"/>`;
  } else if (useType === 'HP') {
    // HP on Side: thin horizontal web + small bulb at inner end (pointing down)
    const hpBulbSize = Math.max(2, Math.round(h * 0.25));
    out += `<line x1="${xShell}" y1="${y_svg}" x2="${xShell - h}" y2="${y_svg}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${xShell - h}" y1="${y_svg}" x2="${xShell - h}" y2="${y_svg + hpBulbSize}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${xShell - h}" y1="${y_svg + hpBulbSize}" x2="${xShell - h + hpBulbSize}" y2="${y_svg}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
  } else {
    out += `<line x1="${xShell}" y1="${y_svg}" x2="${xShell - h}" y2="${y_svg}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${xShell - h}" y1="${y_svg}" x2="${xShell - h}" y2="${y_svg + fl}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  }
  return `<g pointer-events="none">${out}</g>`;
}

function drawL_onInnerSide(y_svg, type, color, group, stiff) {
  const dims = _visualProfileDims(group || 'innerSide', stiff);
  const h = dims.h, fl = dims.fl;
  const useType = dims.type || type;
  const xIS = X(GEOMETRY.IS);
  const c = color || '#4ade80';
  let out = '';
  if (useType === 'FB') {
    out += `<line x1="${xIS}" y1="${y_svg}" x2="${xIS + h}" y2="${y_svg}" stroke="${c}" stroke-width="2" fill="none"/>`;
  } else if (useType === 'HP') {
    // HP on InnerSide: thin horizontal web + small bulb at inner end (pointing down)
    const hpBulbSize = Math.max(2, Math.round(h * 0.25));
    out += `<line x1="${xIS}" y1="${y_svg}" x2="${xIS + h}" y2="${y_svg}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${xIS + h}" y1="${y_svg}" x2="${xIS + h}" y2="${y_svg + hpBulbSize}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${xIS + h}" y1="${y_svg + hpBulbSize}" x2="${xIS + h - hpBulbSize}" y2="${y_svg}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
  } else {
    out += `<line x1="${xIS}" y1="${y_svg}" x2="${xIS + h}" y2="${y_svg}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${xIS + h}" y1="${y_svg}" x2="${xIS + h}" y2="${y_svg + fl}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  }
  return `<g pointer-events="none">${out}</g>`;
}

function drawL_onDeck(x, type, color, group, stiff) {
  const dims = _visualProfileDims(group || 'upperDeckStiff', stiff);
  const h = dims.h, fl = dims.fl;
  const useType = dims.type || type;
  const svgUD = Y(GEOMETRY.UD);
  const c = color || '#4ade80';
  let out = '';
  if (useType === 'FB') {
    out += `<line x1="${x}" y1="${svgUD}" x2="${x}" y2="${svgUD + h}" stroke="${c}" stroke-width="2" fill="none"/>`;
  } else if (useType === 'HP') {
    // HP on Deck: thin web + small bulb at bottom (inward)
    const hpBulbSize = Math.max(2, Math.round(h * 0.25));
    out += `<line x1="${x}" y1="${svgUD}" x2="${x}" y2="${svgUD + h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x}" y1="${svgUD + h}" x2="${x - hpBulbSize}" y2="${svgUD + h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x - hpBulbSize}" y1="${svgUD + h}" x2="${x}" y2="${svgUD + h - hpBulbSize}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
  } else {
    out += `<line x1="${x}" y1="${svgUD}" x2="${x}" y2="${svgUD + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${x}" y1="${svgUD + h}" x2="${x - fl}" y2="${svgUD + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  }
  return `<g pointer-events="none">${out}</g>`;
}

function drawL_onHorizontalPlate(x, plate_z, type, color, group, stiff) {
  const dims = _visualProfileDims(group || 'stringerStiff', stiff);
  const h = dims.h, fl = dims.fl;
  const useType = dims.type || type;
  const y0 = Y(plate_z);
  const c = color || '#4ade80';
  let out = '';
  if (useType === 'FB') {
    // Real-scale FB: just h, no 1.5x amplification (the old factor doubled
    // visual size which made flat bars dominate the drawing).
    out += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + h}" stroke="${c}" stroke-width="2" fill="none"/>`;
  } else if (useType === 'HP') {
    // HP: thin web + small asymmetric bulb at end
    const hpBulbSize = Math.max(2, Math.round(h * 0.25));
    out += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x}" y1="${y0 + h}" x2="${x - hpBulbSize}" y2="${y0 + h}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
    out += `<line x1="${x - hpBulbSize}" y1="${y0 + h}" x2="${x}" y2="${y0 + h - hpBulbSize}" stroke="${c}" stroke-width="1.4" fill="none"/>`;
  } else {
    out += `<line x1="${x}" y1="${y0}" x2="${x}" y2="${y0 + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
    out += `<line x1="${x}" y1="${y0 + h}" x2="${x - fl}" y2="${y0 + h}" stroke="${c}" stroke-width="1.6" fill="none"/>`;
  }
  return `<g pointer-events="none">${out}</g>`;
}

// =========================================================================
// MAIN RENDER
// =========================================================================
// =========================================================================
// Nodes = structural-element intersections (girders × decks × shell × IS × IB).
// computeNodes() populates NODES_CACHE. drawNodesOverlay() returns SVG markup.
// =========================================================================
function computeNodes() {
  const g = GEOMETRY;
  const nodes = [];
  const addNode = (realY, realZ, tag) => {
    nodes.push({ x: X(realY), y: Y(realZ), realY, realZ, tag });
  };

  const verticalYs = [
    { y: 0,                            name:'CL' },
    { y: g.duct_half,                  name:'Duct' },
    ...SIDE_GIRDERS.map((sg, i) => ({ y: sg.y, name:`SG${i+1}` })),
    { y: g.IS,                         name:'IS' },
    { y: g.B_half,                     name:'Shell' },
  ];
  const bilgeStartY = g.B_half - g.R_B;

  const horizontalZs = [
    { z: 0,     name:'BL' },
    { z: g.IB,  name:'IB' },
  ];
  profiles.stringer.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) horizontalZs.push({ z: p.z, name:'Stringer' });
  });
  profiles.tweenDeck.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) horizontalZs.push({ z: p.z, name:'Tween' });
  });
  horizontalZs.push({ z: g.UD, name:'UD' });
  if (g.HC > g.UD) horizontalZs.push({ z: g.HC, name:'HC' });

  // Bottom (Z=0)
  verticalYs.forEach(v => {
    if (v.y <= bilgeStartY + 1) addNode(v.y, 0, v.name + '/BL');
  });
  // IB (Z=IB)
  verticalYs.forEach(v => {
    if (v.name === 'Shell') return;
    addNode(v.y, g.IB, v.name + '/IB');
  });
  // IS (Y=IS)
  horizontalZs.forEach(h => {
    if (h.z < g.IB || h.z > g.HC) return;
    if (h.z === g.IB) return;
    addNode(g.IS, h.z, 'IS/' + h.name);
  });
  // Shell side (Y=B_half)
  horizontalZs.forEach(h => {
    if (h.z < g.R_B || h.z > g.UD) return;
    if (h.z === 0) return;
    if (h.z === g.IB && g.IB < g.R_B) return;
    addNode(g.B_half, h.z, 'Shell/' + h.name);
  });
  // Bilge corners
  addNode(bilgeStartY, 0, 'Bilge start');
  addNode(g.B_half, g.R_B, 'Bilge end');

  // Deduplicate
  const uniq = [];
  nodes.forEach(n => {
    const dup = uniq.find(u => Math.abs(u.realY - n.realY) < 5 && Math.abs(u.realZ - n.realZ) < 5);
    if (!dup) uniq.push(n);
    else if (n.tag && (!dup.tag || !dup.tag.includes(n.tag))) {
      dup.tag = dup.tag ? dup.tag + ' / ' + n.tag : n.tag;
    }
  });
  // Sort bottom-up, left-to-right
  uniq.sort((a, b) => {
    if (Math.abs(a.realZ - b.realZ) > 1) return a.realZ - b.realZ;
    return a.realY - b.realY;
  });
  uniq.forEach((n, i) => { n.id = i + 1; });
  NODES_CACHE = uniq;
  return uniq;
}

function drawNodesOverlay(showLines) {
  const nodes = NODES_CACHE;
  const g = GEOMETRY;
  let html = '';

  if (showLines) {
    const drawLineBetween = (n1, n2, label) => {
      const mx = (n1.x + n2.x) / 2;
      const my = (n1.y + n2.y) / 2;
      const dx = n2.x - n1.x, dy = n2.y - n1.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * 9;
      const ny = dx / len * 9;
      const w = label.length * 5 + 6;
      html += `<rect x="${mx + nx - w/2}" y="${my + ny - 6}" width="${w}" height="11" rx="2" fill="rgba(15,23,42,0.95)" stroke="#06b6d4" stroke-width="0.4"/>`;
      html += `<text x="${mx + nx}" y="${my + ny + 3}" text-anchor="middle" style="fill:#06b6d4;font-family:monospace;font-size:8px;font-weight:600">${label}</text>`;
    };
    let lineCounter = 1;
    const bilgeStartY = g.B_half - g.R_B;
    const bottomNodes = nodes.filter(n => n.realZ === 0).sort((a, b) => a.realY - b.realY);
    for (let i = 0; i < bottomNodes.length - 1; i++) drawLineBetween(bottomNodes[i], bottomNodes[i+1], `L${lineCounter++}`);
    const ibNodes = nodes.filter(n => Math.abs(n.realZ - g.IB) < 1).sort((a, b) => a.realY - b.realY);
    for (let i = 0; i < ibNodes.length - 1; i++) drawLineBetween(ibNodes[i], ibNodes[i+1], `L${lineCounter++}`);
    const isNodes = nodes.filter(n => Math.abs(n.realY - g.IS) < 1).sort((a, b) => a.realZ - b.realZ);
    for (let i = 0; i < isNodes.length - 1; i++) drawLineBetween(isNodes[i], isNodes[i+1], `L${lineCounter++}`);
    const shellNodes = nodes.filter(n => Math.abs(n.realY - g.B_half) < 1).sort((a, b) => a.realZ - b.realZ);
    for (let i = 0; i < shellNodes.length - 1; i++) drawLineBetween(shellNodes[i], shellNodes[i+1], `L${lineCounter++}`);
    // Vertical girders / IS from Z=0 to Z=IB
    const vList = [g.duct_half, ...SIDE_GIRDERS.map(sg => sg.y), g.IS];
    vList.forEach(y => {
      const top = nodes.find(n => Math.abs(n.realY - y) < 1 && Math.abs(n.realZ - g.IB) < 1);
      const bot = nodes.find(n => Math.abs(n.realY - y) < 1 && n.realZ === 0);
      if (top && bot) drawLineBetween(bot, top, `L${lineCounter++}`);
    });
    // Horizontal decks
    [ ...profiles.stringer.map(p => p.z), ...profiles.tweenDeck.map(p => p.z), g.UD ].forEach(z => {
      if (z < g.IB || z > g.UD) return;
      const isNode = nodes.find(n => Math.abs(n.realY - g.IS) < 1 && Math.abs(n.realZ - z) < 1);
      const shNode = nodes.find(n => Math.abs(n.realY - g.B_half) < 1 && Math.abs(n.realZ - z) < 1);
      if (isNode && shNode) drawLineBetween(isNode, shNode, `L${lineCounter++}`);
    });
    // Bilge
    const bst = nodes.find(n => Math.abs(n.realY - bilgeStartY) < 1 && n.realZ === 0);
    const bend = nodes.find(n => Math.abs(n.realY - g.B_half) < 1 && Math.abs(n.realZ - g.R_B) < 1);
    if (bst && bend) drawLineBetween(bst, bend, `L${lineCounter++}`);
  }

  nodes.forEach((n, i) => {
    const id = n.id;
    const isSel = SELECTED_NODE && SELECTED_NODE.id === id;
    // Smart label direction — opposite to nearest neighbor
    let nearestDx = 0, nearestDy = 0, minDist = Infinity;
    nodes.forEach((m, j) => {
      if (j === i) return;
      const d = Math.hypot(m.x - n.x, m.y - n.y);
      if (d < minDist) { minDist = d; nearestDx = m.x - n.x; nearestDy = m.y - n.y; }
    });
    let lx = 8, ly = -6;
    if (minDist < 25) {
      if (nearestDx > 0 && nearestDy < 0) { lx = -18; ly = 10; }
      else if (nearestDx > 0 && nearestDy >= 0) { lx = -18; ly = -6; }
      else if (nearestDx <= 0 && nearestDy < 0) { lx = 8; ly = 14; }
      else { lx = 8; ly = -6; }
    }
    if (isSel) {
      html += `<circle cx="${n.x}" cy="${n.y}" r="9" fill="none" stroke="#06b6d4" stroke-width="2"/>`;
    }
    html += `<circle cx="${n.x}" cy="${n.y}" r="5" fill="#fbbf24" stroke="#111827" stroke-width="1.2"/>`;
    const anchor = lx < 0 ? 'end' : 'start';
    html += `<text x="${n.x + lx}" y="${n.y + ly}" text-anchor="${anchor}" style="fill:#fbbf24;font-family:monospace;font-size:9.5px;font-weight:700;paint-order:stroke;stroke:#0f172a;stroke-width:2.5;stroke-linejoin:round;pointer-events:none">N${id}</text>`;
    // Invisible hit area — bigger when picking so it's easier to hit
    const _hitR = (typeof TRANSVERSE_PICK !== 'undefined' && TRANSVERSE_PICK) ||
                  (typeof COMPARTMENT_PICK !== 'undefined' && COMPARTMENT_PICK)
                  ? 16 : 11;
    html += `<circle cx="${n.x}" cy="${n.y}" r="${_hitR}" fill="#000" fill-opacity="0" pointer-events="all" style="cursor:pointer" data-node-id="${id}"/>`;
  });
  return html;
}

// =========================================================================
// SECTION PROPERTIES — Neutral Axis & Section Modulus
// All calculations in mm. Uses half-beam geometry and multiplies by 2 for
// full ship. Returns values about the centerline (assumed NA-vertical passes
// through CL by symmetry).
// =========================================================================

// Profile properties (area in mm², I about own horizontal centroid axis in mm⁴,
// centroid offset from attachment point in mm — positive = outward from plate).
//
// NOTE: This table used to contain ONLY 3 hardcoded defaults (L 150x90x9,
// HP 180x10, FB 180x12) — causing `computeSectionProperties()` to use the
// wrong values for every stiffener regardless of the actual profile chosen.
// This caused a systematic ~40% overestimate of total stiffener area and
// propagated to I_NA, z_NA, and every hull-girder stress (σ_hg, τ_A).
//
// Fix: the 3-entry fallback table is kept only for backwards compatibility
// when no real profile name is available; the new resolver below queries the
// full SectionPro catalog (window.Profile.allProfiles) using the real profile
// name stored on each stiff object.
const PROFILE_PROPS = {
  // type -> { A, Iy_self, cz }   cz = centroid distance from attachment (mm, positive outward)
  'L 150x90x9': { A: 2080,  Iy: 4.7e6,  cz: 47  },   // ~equal-leg-ish approximation
  'HP 180x10':  { A: 2350,  Iy: 6.9e6,  cz: 64  },
  'FB 180x12':  { A: 2160,  Iy: 5.83e6, cz: 90  },
};

// In-memory cache of catalog-based profile props (populated on first lookup).
// Shape: { "HP 200x9": { A, Iy, cz }, ... }
const _PROP_CACHE = {};

// Resolve *accurate* profile properties by name, from the SectionPro catalog.
// Called once per unique profile name; subsequent calls hit the cache.
//   A  — cross-sectional area (mm²)
//   Iy — moment of inertia about own centroidal horizontal axis (mm⁴)
//   cz — distance from the attached plate face to the profile centroid (mm)
//        (used to place the profile centroid on the hull-girder z-axis)
function _resolveProfilePropsFromCatalog(profileName) {
  if (!profileName || typeof profileName !== 'string') return null;
  if (_PROP_CACHE[profileName]) return _PROP_CACHE[profileName];
  if (!window.Profile || !window.Profile.allProfiles) return null;
  const pd = window.Profile.allProfiles(['L','HP','FB','T']).find(p => p.name === profileName);
  if (!pd) return null;
  // pd units (from SectionPro):
  //   pd.area     cm²
  //   pd.Ixx      cm⁴  (about profile's own horizontal centroidal axis)
  //   pd.height   cm   (total height)
  //   pd.centroidY cm  (Y position of centroid; for HP measured from plate end,
  //                    for L/T from web-side plate attachment)
  //
  // centroidY interpretation (see _calcHP/_calcL):
  //   HP: centroidY ≈ pd.dx (distance from plate base to centroid)
  //   L : centroidY is measured from the plate-side edge (height − centroidY = cz outward)
  // To keep all profiles consistent with "distance outward from attachment":
  const isHP = /^HP /i.test(profileName);
  const height_mm = (pd.height || 0) * 10;
  const cenY_mm   = (pd.centroidY || 0) * 10;
  // Outward distance = distance from attached plate face to profile centroid.
  const cz_mm = isHP ? cenY_mm : (height_mm - cenY_mm);
  const props = {
    A:  (pd.area || 0) * 100,    // cm² → mm²
    Iy: (pd.Ixx  || 0) * 1e4,    // cm⁴ → mm⁴
    cz: cz_mm,
  };
  _PROP_CACHE[profileName] = props;
  return props;
}

// Clear cache if catalog changes (not used currently, kept for safety)
window._clearPropsCache = () => { for (const k in _PROP_CACHE) delete _PROP_CACHE[k]; };

// Lookup — prefer real profile name, fall back to 3-default table by type.
// Accepts either a profile name string ("HP 120x6") OR a type code ("HP").
function profProps(typeOrName) {
  if (!typeOrName) return { A: 0, Iy: 0, cz: 0 };
  // If it looks like a full profile name (contains a space and numbers),
  // query the real catalog.
  if (typeof typeOrName === 'string' && /\s\d/.test(typeOrName)) {
    const real = _resolveProfilePropsFromCatalog(typeOrName);
    if (real) return real;
  }
  // Else: short type code (L/HP/FB/T) → use old 3-default fallback.
  const m = { L:'L 150x90x9', HP:'HP 180x10', FB:'FB 180x12' };
  return PROFILE_PROPS[m[typeOrName]] || PROFILE_PROPS[typeOrName] || { A: 0, Iy: 0, cz: 0 };
}

// Helper: get the effective profile for a stiffener object (may have
// per-row override via stiff.profileName, else falls back to a group default).
// `typeCode` is the short type from PARAMS (profTypeBottom/IB/Side/…) used
// only as a last resort when no real name is available.
function _stiffProfilePropsFor(stiff, typeCode) {
  // 1) CUSTOM PROFILE — user entered dimensions via "Custom Profile" modal.
  //    stiff.customProfile = { type, dims, Z_cm3, A_cm2, I_cm4, weight }
  //    Convert to the same {A, Iy, cz} shape as catalog lookup.
  if (stiff && stiff.customProfile) {
    const cp = stiff.customProfile;
    // A in mm², Iy in mm⁴, cz = attachment-to-centroid distance in mm
    const A_mm2 = (cp.A_cm2 || 0) * 100;
    const Iy_mm4 = (cp.I_cm4 || 0) * 1e4;
    // cz: derive from dims — outward distance from plate face to stiff centroid.
    // For L: (centroid_y of the L-shape without plate); approximate = a/2 for simple L
    // For T: web height - tf/2 approx
    // For FB: h/2
    // For HP: catalog dx (cm) * 10
    let cz_mm = 0;
    const d = cp.dims || {};
    if (cp.type === 'L')      cz_mm = (d.a || 0) / 2;     // approximate
    else if (cp.type === 'T') cz_mm = ((d.h || 0) - (d.tf || 0) / 2);
    else if (cp.type === 'FB')cz_mm = (d.h || 0) / 2;
    else if (cp.type === 'HP') {
      // Use HP catalog dx if available
      const cat = (typeof HP_CATALOG !== 'undefined' ? HP_CATALOG : [])
                   .find(x => x.b === d.b && x.t === d.t);
      cz_mm = cat ? cat.dx * 10 : (d.b || 0) * 0.5;
    }
    return { A: A_mm2, Iy: Iy_mm4, cz: cz_mm };
  }
  // 2) Catalog lookup by real profile name
  if (stiff && stiff.profileName) {
    const r = _resolveProfilePropsFromCatalog(stiff.profileName);
    if (r) return r;
  }
  // 3) Fallback: 3-default table by type
  return profProps(typeCode);
}

// Compute area and centroid Z for a plate segment.
// For horizontal plates (Y along-length, constant Z): simple A = L·t, Iself_y negligible (thin)
// For vertical plates (Z along-length, constant Y): A = H·t, Iself_y = t·H³/12
// For the bilge arc: area = (π·R_B/2)·t, centroid Z = R_B·(1 − 2/π)  (quarter-arc centroid)
function plateContribution(L_mm, t_mm, centroidZ, orientation) {
  const A = L_mm * t_mm;
  let Iself = 0;
  if (orientation === 'vertical') {
    // Moment of inertia about horizontal axis through plate's own centroid
    // I = t·L³/12  (L is along vertical)
    Iself = t_mm * Math.pow(L_mm, 3) / 12;
  }
  // Horizontal plates: I_self about horizontal axis ≈ 0 for thin plate
  return { A, z: centroidZ, Iself };
}

// Main: compute section properties for current state
function computeSectionProperties() {
  const g = GEOMETRY;
  const contributions = [];   // each: { A, z, Iself, label }

  // --- SHELL (strake-by-strake: keel → bottom → bilge → side) ---
  {
    let cursor = 0;
    const L = shellGeometryLengths();
    STRAKES.shell.forEach((s) => {
      const segStart = cursor;
      const segEnd = Math.min(cursor + s.width, L.total);
      const midPath = (segStart + segEnd) / 2;
      // Determine segment kind (keel/bottom/bilge/side) and centroid Z
      let z, orient;
      if (midPath <= L.keel) {
        // Keel: on BL, horizontal plate at Z=0
        z = 0;
        orient = 'horizontal';
      } else if (midPath <= L.keel + L.bottom) {
        // Bottom: at Z=0
        z = 0;
        orient = 'horizontal';
      } else if (midPath <= L.keel + L.bottom + L.bilge) {
        // Bilge: exact centroid and self-inertia of the arc segment.
        //   z(θ) = R(1 − cos θ),  dA = t·R·dθ,  θ ∈ [θ0, θ1]
        //   z̄     = R[1 − (sin θ1 − sin θ0)/Δθ]
        //   I₀    = t R³[Δθ − 2(sin θ1 − sin θ0) + Δθ/2 + (sin 2θ1 − sin 2θ0)/4]
        //   Iself = I₀ − A z̄²
        // This used to take z at the strake's MID-ANGLE and Iself = 0. Over a
        // full quarter arc that puts the centroid at 0,293·R instead of the
        // true 0,363·R — 122 mm low here — which lifted Z_B by 0,9 %.
        const s0 = segStart - L.keel - L.bottom;
        const s1 = Math.min(segEnd - L.keel - L.bottom, L.bilge);
        const th0 = (s0 / L.bilge) * (Math.PI / 2);
        const th1 = (s1 / L.bilge) * (Math.PI / 2);
        const dth = th1 - th0;
        const R = g.R_B, t = s.thickness;
        if (dth > 1e-9) {
          const A_arc = t * R * dth;
          const zbar = R * (1 - (Math.sin(th1) - Math.sin(th0)) / dth);
          const I0 = t * R * R * R * (dth - 2 * (Math.sin(th1) - Math.sin(th0))
                      + dth / 2 + (Math.sin(2 * th1) - Math.sin(2 * th0)) / 4);
          contributions.push({ A: A_arc, z: zbar, Iself: Math.max(I0 - A_arc * zbar * zbar, 0),
                               label: `Shell strake ${s.kind || ''}` });
          cursor = segEnd;
          return;
        }
        z = R - R * Math.cos((th0 + th1) / 2);
        orient = 'curved';
      } else {
        // Side: at Y=B_half, vertical plate
        const sInSide = midPath - (L.keel + L.bottom + L.bilge);
        z = g.R_B + sInSide;
        orient = 'vertical';
      }
      const c = plateContribution(s.width, s.thickness, z, orient);
      contributions.push({ ...c, label: `Shell strake ${s.kind || ''}` });
      cursor = segEnd;
    });
  }

  // --- INNER BOTTOM (horizontal at Z=IB, half-beam span) ---
  STRAKES.innerBottom.forEach((s) => {
    contributions.push({
      A: s.width * s.thickness,
      z: g.IB,
      Iself: 0,
      label: 'IB strake'
    });
  });

  // --- INNER SIDE (vertical at Y=IS, IB → HC) ---
  // Single uniform tank-wall stack from IB upward. Legacy coaming-wall
  // entries (kind === 'coamingWall') are stripped by the schema migration
  // at the top of computeStrakes(); they no longer appear here.
  {
    let zc = g.IB;
    STRAKES.innerSide.forEach((s) => {
      const midZ = zc + s.width / 2;
      zc += s.width;
      contributions.push({
        A: s.width * s.thickness,
        z: midZ,
        Iself: s.thickness * Math.pow(s.width, 3) / 12,
        label: 'IS strake'
      });
    });
  }

  // --- HORIZONTAL PLATES ---
  const horizPlate = (Y_start, Y_end, Z, thickness, label) => {
    const L_len = Y_end - Y_start;
    if (L_len <= 0) return;
    contributions.push({ A: L_len * thickness, z: Z, Iself: 0, label });
  };
  // Stringer plates — prefer STRAKES.stringer (multi-strake, per-strake thickness).
  // Fall back to profiles.stringer × PLATE_THICKNESS.stringer for backward
  // compatibility if the new group is empty.
  //
  // BUG FIX: Earlier this returned early when s.z_level was null. Excel
  // defaults (and freshly-loaded JSON files from older versions) carry
  // strakes WITHOUT a z_level field, so every stringer was silently
  // dropped from the section calculation. We now resolve z_level by
  // pairing the strake list with the matching profiles.stringer entries
  // by index — that's how computeStrakes() seeds them too.
  if (STRAKES.stringer && STRAKES.stringer.length > 0) {
    STRAKES.stringer.forEach((s, i) => {
      // Resolve z_level: prefer s.z_level; else look up profiles.stringer[i].z
      let z = s.z_level;
      if (z == null && profiles.stringer && profiles.stringer[i]) {
        z = profiles.stringer[i].z;
      }
      if (z == null || z <= g.IB || z >= g.UD) return;
      contributions.push({
        A: s.width * s.thickness,
        z: z,
        Iself: 0,
        label: `Stringer @ ${z} (t=${s.thickness})`
      });
    });
  } else {
    profiles.stringer.forEach(p => {
      if (p.z > g.IB && p.z < g.UD) {
        horizPlate(g.IS, g.B_half, p.z, PLATE_THICKNESS.stringer, `Stringer @ ${p.z} (t=${PLATE_THICKNESS.stringer})`);
      }
    });
  }
  // Tween deck plates — same fallback pattern as Stringer.
  if (STRAKES.tween && STRAKES.tween.length > 0) {
    STRAKES.tween.forEach((s, i) => {
      let z = s.z_level;
      if (z == null && profiles.tweenDeck && profiles.tweenDeck[i]) {
        z = profiles.tweenDeck[i].z;
      }
      if (z == null || z <= g.IB || z >= g.UD) return;
      contributions.push({
        A: s.width * s.thickness,
        z: z,
        Iself: 0,
        label: `Tween @ ${z} (t=${s.thickness})`
      });
    });
  } else {
    profiles.tweenDeck.forEach(p => {
      if (p.z > g.IB && p.z < g.UD) {
        horizPlate(g.IS, g.B_half, p.z, PLATE_THICKNESS.tween, `Tween @ ${p.z} (t=${PLATE_THICKNESS.tween})`);
      }
    });
  }
  // Upper Deck — prefer STRAKES.upperDeck (future multi-strake support).
  if (STRAKES.upperDeck && STRAKES.upperDeck.length > 0) {
    // Anchor Y starts at IS and walks outboard across strakes.
    let yc = g.IS;
    STRAKES.upperDeck.forEach((s, i) => {
      contributions.push({
        A: s.width * s.thickness,
        z: g.UD,
        Iself: 0,
        label: `Upper Deck${STRAKES.upperDeck.length > 1 ? ' '+(i+1) : ''} (t=${s.thickness})`
      });
      yc += s.width;
    });
  } else {
    horizPlate(g.IS, g.B_half, g.UD, PLATE_THICKNESS.upperDeck, `Upper Deck (t=${PLATE_THICKNESS.upperDeck})`);
  }
  // Coaming top — prefer STRAKES.coamingTop
  if (STRAKES.coamingTop && STRAKES.coamingTop.length > 0) {
    STRAKES.coamingTop.forEach((s, i) => {
      contributions.push({
        A: s.width * s.thickness,
        z: g.HC,
        Iself: 0,
        label: `Coaming top${STRAKES.coamingTop.length > 1 ? ' '+(i+1) : ''} (t=${s.thickness})`
      });
    });
  } else if (PARAMS.coamingTop > 0) {
    horizPlate(g.IS, g.IS + PARAMS.coamingTop, g.HC, PLATE_THICKNESS.coaming, `Coaming top (t=${PLATE_THICKNESS.coaming})`);
  }

  // --- VERTICAL PLATES (side girders, duct wall, coaming wall) ---
  const vertPlate = (Y, Z_bot, Z_top, thickness, label) => {
    const H = Z_top - Z_bot;
    if (H <= 0) return;
    contributions.push({
      A: H * thickness,
      z: (Z_bot + Z_top) / 2,
      Iself: thickness * Math.pow(H, 3) / 12,
      label
    });
  };
  vertPlate(g.duct_half, 0, g.IB, PLATE_THICKNESS.duct, 'Duct wall');
  SIDE_GIRDERS.forEach((sg, i) => {
    const sgKey = 'sideGirder' + i;
    const strakes = STRAKES[sgKey];
    if (strakes && strakes.length > 0) {
      // Use per-strake thicknesses. Stack strakes from Z=0 up to Z=IB.
      let zc = 0;
      strakes.forEach((s) => {
        const midZ = zc + s.width / 2;
        contributions.push({
          A: s.width * s.thickness,
          z: midZ,
          Iself: s.thickness * Math.pow(s.width, 3) / 12,
          label: `SG${i+1} strake (t=${s.thickness})`
        });
        zc += s.width;
      });
    } else {
      // Backward compat: single plate with uniform thickness
      vertPlate(sg.y, 0, g.IB, PLATE_THICKNESS.sideGirder, `SG${i+1}`);
    }
  });
  // Coaming edge is no longer a separate geometry element — it's represented
  // as a coamingStiff entry (FB type, edge flag). Its area contribution
  // comes in via the stiffener loop below.

  // --- LONGITUDINAL STIFFENERS (each profile contributes A, z, Iself) ---
  // IMPORTANT: use each stiffener's actual profileName (if set), not a hardcoded
  // type default. `_stiffProfilePropsFor` resolves real profile from catalog.
  //
  // Bottom shell (Z=0, stiff extends +cz upward)
  profiles.bottomShell.forEach(p => {
    const pp = _stiffProfilePropsFor(p, PARAMS.profTypeBottom);
    contributions.push({ A: pp.A, z: 0 + pp.cz, Iself: pp.Iy, label: 'Bottom stiff' });
  });
  // Inner bottom (Z=IB, stiff extends -cz downward)
  profiles.innerBottom.forEach(p => {
    const pp = _stiffProfilePropsFor(p, PARAMS.profTypeIB);
    contributions.push({ A: pp.A, z: g.IB - pp.cz, Iself: pp.Iy, label: 'IB stiff' });
  });
  // Side shell (at each p.z)
  profiles.sideShell.forEach(p => {
    const pp = _stiffProfilePropsFor(p, PARAMS.profTypeSide);
    contributions.push({ A: pp.A, z: p.z, Iself: pp.Iy, label: 'Side stiff' });
  });
  // Inner side
  profiles.innerSide.forEach(p => {
    const pp = _stiffProfilePropsFor(p, PARAMS.profTypeIS);
    contributions.push({ A: pp.A, z: p.z, Iself: pp.Iy, label: 'IS stiff' });
  });
  // Stringer deck stiff (one per stringer plate)
  profiles.stringer.forEach(plate => {
    if (plate.z <= g.IB || plate.z >= g.UD) return;
    profiles.stringerStiff.forEach(p => {
      const pp = _stiffProfilePropsFor(p, PARAMS.profTypeStringer);
      contributions.push({ A: pp.A, z: plate.z - pp.cz, Iself: pp.Iy, label: 'Stringer stiff' });
    });
  });
  // Tween deck stiff
  profiles.tweenDeck.forEach(plate => {
    if (plate.z <= g.IB || plate.z >= g.UD) return;
    profiles.tweenStiff.forEach(p => {
      const pp = _stiffProfilePropsFor(p, PARAMS.profTypeTween);
      contributions.push({ A: pp.A, z: plate.z - pp.cz, Iself: pp.Iy, label: 'Tween stiff' });
    });
  });
  // Coaming top stiff (at Z=HC, extends down)
  if (PARAMS.coamingTop > 0) {
    profiles.coamingStiff.forEach(p => {
      const pp = _stiffProfilePropsFor(p, PARAMS.profTypeCoaming);
      contributions.push({ A: pp.A, z: g.HC - pp.cz, Iself: pp.Iy, label: 'Coaming stiff' });
    });
  }
  // Upper deck stiff (at Z=UD, extends down)
  profiles.upperDeck.forEach(p => {
    const pp = _stiffProfilePropsFor(p, PARAMS.profTypeDeck);
    contributions.push({ A: pp.A, z: g.UD - pp.cz, Iself: pp.Iy, label: 'UD stiff' });
  });

  // --- Summation (half-ship, then ×2 for full) ---
  const sumA  = contributions.reduce((s, c) => s + c.A, 0) * 2;
  const sumAz = contributions.reduce((s, c) => s + c.A * c.z, 0) * 2;
  const NA = sumA > 0 ? sumAz / sumA : 0;
  // Moment of inertia about NA
  const I_NA = contributions.reduce((s, c) =>
    s + c.Iself + c.A * Math.pow(c.z - NA, 2), 0) * 2;

  // --- Section moduli at 3 locations ---
  const Z_bottom = NA > 0 ? I_NA / NA : Infinity;           // to BL (z=0)
  const Z_ud     = g.UD > NA ? I_NA / (g.UD - NA) : Infinity;
  const Z_hc     = g.HC > NA ? I_NA / (g.HC - NA) : Infinity;

  return {
    totalArea:   sumA,          // mm²
    NA:          NA,            // mm above BL
    I_NA:        I_NA,          // mm⁴
    Z_bottom:    Z_bottom,      // mm³
    Z_upperDeck: Z_ud,
    Z_hatchCoaming: Z_hc,
    contributions,              // for debugging / detail breakdown
  };
}

// ──────────────────────────────────────────────────────────────────────
// FIRST MOMENT OF AREA Q(z) — for hull girder shear flow computation
// ──────────────────────────────────────────────────────────────────────
// Q(z) = ∫ (z' − z_NA) dA   over cross-section on ONE side of the cut
// Returns Q in m³ (so shear flow q = F·Q/I gives N/mm when F in N, I in m⁴)
//
// For a plate cut at height z_q:
//   - If z_q ≤ z_NA: sum contributions from BL up to z_q, Q = Σ A·(z_NA − z)
//   - If z_q >  z_NA: sum contributions from z_q up to top,  Q = Σ A·(z − z_NA)
// (Both give the same |Q| by equilibrium.)
//
// Input: z_q_m (cut height in metres above BL)
// Output: Q_m3 (|first moment| in m³), or 0 if section not available
function computeShearFirstMoment(z_q_m) {
  const sp = computeSectionProperties();
  if (!sp || !sp.contributions) return 0;
  const z_NA_mm = sp.NA;
  const z_q_mm = z_q_m * 1000;
  let Q_mm3 = 0;
  // Pick the "smaller side" to integrate (numerically equivalent)
  const cutAboveNA = z_q_mm > z_NA_mm;
  for (const c of sp.contributions) {
    if (!c || c.A == null || c.z == null) continue;
    const z = c.z;
    const A = c.A;
    // Include this contribution if it lies between the cut and the nearer end
    let include;
    if (cutAboveNA) {
      // Cut above NA: integrate from cut up to top (any z ≥ z_q)
      include = z >= z_q_mm;
    } else {
      // Cut below NA: integrate from BL up to cut (any z ≤ z_q)
      include = z <= z_q_mm;
    }
    if (!include) continue;
    // Moment arm = |z − z_NA|
    Q_mm3 += A * Math.abs(z - z_NA_mm);
  }
  // IMPORTANT: sp.contributions holds HALF-ship entries (computeSectionProperties
  // builds contributions for one side then doubles area + I_NA at the end).
  // To stay consistent with full-ship I_NA used in q = F·Q/I, double Q here too.
  // Previously this returned half-ship Q, under-predicting shear stress by 2×.
  Q_mm3 *= 2;
  // Convert mm² × mm = mm³ → m³ (÷ 1e9)
  return Q_mm3 * 1e-9;
}
window.computeShearFirstMoment = computeShearFirstMoment;

function renderSectionProps() {
  const el = document.getElementById('sectionProps');
  if (!el) return;
  const g = GEOMETRY;
  const sp = computeSectionProperties();

  // Format helpers
  // Area: mm² → cm²
  const cm2 = v => (v / 100).toLocaleString('en-US', { maximumFractionDigits: 0 });
  // I: mm⁴ → m⁴ (divide by 10^12) → typically reported as cm² · m² = m⁴ × 10⁴
  const m4    = v => (v / 1e12).toLocaleString('en-US', { maximumFractionDigits: 4 });
  // Z: mm³ → cm³
  const cm3   = v => !isFinite(v) ? '∞' : (v / 1000).toLocaleString('en-US', { maximumFractionDigits: 0 });
  // Length: mm as-is
  const mm    = v => Math.round(v).toLocaleString('en-US');

  let h = '';
  h += `<div class="section-props-title">Section Properties</div>`;

  // Global
  h += `<div class="sp-row"><span class="sp-label">Total area</span>
    <span><span class="sp-val">${cm2(sp.totalArea)}</span><span class="sp-unit">cm²</span></span></div>`;
  h += `<div class="sp-row"><span class="sp-label">Neutral axis</span>
    <span><span class="sp-val accent">${mm(sp.NA)}</span><span class="sp-unit">mm above BL</span></span></div>`;
  h += `<div class="sp-row"><span class="sp-label">I about NA</span>
    <span><span class="sp-val">${m4(sp.I_NA)}</span><span class="sp-unit">m⁴</span></span></div>`;

  // Section modulus at 3 locations
  h += `<div class="sp-section">Section Modulus (cm³)</div>`;
  h += `<div class="sp-row"><span class="sp-label">Z · Bottom (z=0)</span>
    <span><span class="sp-val sec">${cm3(sp.Z_bottom)}</span></span></div>`;
  h += `<div class="sp-row"><span class="sp-label">Z · Upper Deck</span>
    <span><span class="sp-val sec">${cm3(sp.Z_upperDeck)}</span></span></div>`;
  h += `<div class="sp-row"><span class="sp-label">Z · Coaming (HC)</span>
    <span><span class="sp-val sec">${cm3(sp.Z_hatchCoaming)}</span></span></div>`;

  // Footer note
  h += `<div style="font-size:0.52rem;color:var(--text-muted);margin-top:8px;line-height:1.4">
    Full ship · half values ×2 · longitudinals + plates included · transverses excluded
  </div>`;

  // ─── Materials in use (Apr 2026) ──────────────────────────────────────
  // Walk strakes + stiffeners, count occurrences of each yield-strength
  // family. Plates and stiffs are kept separate. Strakes / stiffs without
  // an explicit override use the global Setup family.
  try {
    const globalMat = (document.getElementById('material')?.value) || 'AH36';
    const tally = { plates: {}, stiffs: {} };
    const bump = (cat, key) => { tally[cat][key] = (tally[cat][key] || 0) + 1; };
    // Plates: every strake in every group. STRAKES is module-scoped here;
    // fall back to window.Draw.STRAKES if the closure variable is undefined
    // (e.g. when this fn is called from a context that doesn't see it).
    const STRAKES_REF = (typeof STRAKES !== 'undefined' && STRAKES)
                        || (window.Draw && window.Draw.STRAKES) || {};
    Object.keys(STRAKES_REF).forEach(grp => {
      const arr = STRAKES_REF[grp];
      if (!Array.isArray(arr)) return;
      arr.forEach(s => bump('plates', s.family || globalMat));
    });
    // Stiffs: every profile in every group
    if (window.Draw && window.Draw.profiles) {
      Object.keys(window.Draw.profiles).forEach(grp => {
        const arr = window.Draw.profiles[grp];
        if (!Array.isArray(arr)) return;
        arr.forEach(p => bump('stiffs', p.family || globalMat));
      });
    }
    // Render the summary
    const FAM_COLORS = { MS:'#6b7280', AH32:'#0891b2', AH36:'#7c3aed', AH40:'#ea580c' };
    const renderTally = (label, tallyDict) => {
      const keys = Object.keys(tallyDict).sort();
      if (!keys.length) return '';
      const pills = keys.map(k => {
        const col = FAM_COLORS[k] || '#9ca3af';
        return `<span style="display:inline-block;background:${col};color:#fff;padding:1px 6px;border-radius:3px;font-size:0.62rem;font-weight:600;margin-right:4px;font-family:monospace">${k}<span style="opacity:0.85;margin-left:3px">×${tallyDict[k]}</span></span>`;
      }).join('');
      return `<div style="display:flex;gap:6px;align-items:center;margin-top:3px">
        <span style="font-size:0.6rem;color:var(--text-muted);min-width:42px">${label}</span>
        <span>${pills}</span>
      </div>`;
    };
    const platesHtml = renderTally('Plates', tally.plates);
    const stiffsHtml = renderTally('Stiffs', tally.stiffs);
    if (platesHtml || stiffsHtml) {
      h += `<div class="sp-section" style="margin-top:8px">Materials in use</div>`;
      h += `<div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:3px">Setup default: <strong style="color:${FAM_COLORS[globalMat] || '#fff'}">${globalMat}</strong> · counts include local overrides</div>`;
      h += platesHtml;
      h += stiffsHtml;
    }
  } catch (e) { /* silent */ }

  el.innerHTML = h;
  // Mirror into the inline accordion under the Info pane (v23+: tab bar
  // hidden; this gives the user one-click access to the props without
  // a separate tab).
  const elInline = document.getElementById('sectionPropsInline');
  if (elInline) elInline.innerHTML = h;
}
window.renderSectionProps = renderSectionProps;

// ==========================================================================
// MEASURE TOOL — Snap to nearest structural feature + draw dimension line.
// snapToStructure(yMM, zMM) → {y, z, label, type} or null if nothing close.
// Considers: stiffener positions, side girders, duct keel, decks, strake
// boundaries, shell line. Returns real-mm coordinates, snapped.
// ==========================================================================
function snapToStructure(yMM, zMM, maxDistMM) {
  const g = GEOMETRY;
  const snapRadius = maxDistMM || 250;   // mm — snap if within this real distance
  let best = null;

  const candidates = [];

  // Stiff Y positions (bottom/IB/UD/coamingTop/stringer/tween stiffs have .y)
  ['bottomShell','innerBottom','upperDeck','coamingStiff','stringer','tweenDeck'].forEach(grp => {
    (profiles[grp]||[]).forEach((p, i) => {
      if (p.y == null) return;
      const z = grp === 'bottomShell' ? 0
              : grp === 'innerBottom' ? g.IB
              : grp === 'upperDeck' ? g.UD
              : grp === 'coamingStiff' ? g.HC
              : p.z;
      candidates.push({ y: p.y, z, label: `Stiff ${grp}#${i+1}`, type: 'stiff' });
    });
  });
  // Side/IS stiffs have .z
  ['sideShell','innerSide'].forEach(grp => {
    (profiles[grp]||[]).forEach((p, i) => {
      if (p.z == null) return;
      const y = grp === 'sideShell' ? g.B_half : g.IS;
      candidates.push({ y, z: p.z, label: `Stiff ${grp}#${i+1}`, type: 'stiff' });
    });
  });

  // Side girders
  (SIDE_GIRDERS || []).forEach((sg, i) => {
    candidates.push({ y: sg.y, z: g.IB, label: `SG${i+1}`, type: 'girder' });
    candidates.push({ y: sg.y, z: 0,   label: `SG${i+1}`, type: 'girder' });
  });
  // Duct keel
  candidates.push({ y: g.duct_half, z: 0, label: 'Duct Keel', type: 'girder' });
  candidates.push({ y: g.duct_half, z: g.IB, label: 'Duct Keel', type: 'girder' });
  candidates.push({ y: 0, z: 0, label: 'CL', type: 'cl' });
  candidates.push({ y: g.IS, z: 0, label: 'IS base', type: 'line' });
  candidates.push({ y: g.IS, z: g.IB, label: 'IS @ IB', type: 'line' });
  candidates.push({ y: g.IS, z: g.UD, label: 'IS @ UD', type: 'line' });
  candidates.push({ y: g.IS, z: g.HC, label: 'IS @ HC', type: 'line' });
  candidates.push({ y: g.B_half, z: 0, label: 'Shell @ BL', type: 'line' });
  candidates.push({ y: g.B_half, z: g.UD, label: 'Shell @ UD', type: 'line' });
  // Coaming top plate outboard end
  if (PARAMS.coamingTop > 0) {
    candidates.push({ y: g.IS + PARAMS.coamingTop, z: g.HC, label: 'Coaming outer', type: 'line' });
    candidates.push({ y: g.IS + PARAMS.coamingTop, z: g.UD, label: 'Coaming outer @ UD', type: 'line' });
  }
  // Decks (vertical snap) — at user's click y but z locked to deck level
  [
    { z: g.IB,  label: 'IB' },
    { z: g.UD,  label: 'UD' },
    { z: g.HC,  label: 'HC' },
    { z: 0,     label: 'BL' },
  ].forEach(d => {
    // Add a candidate at the user's yMM so horizontal alignment with deck snaps
    candidates.push({ y: yMM, z: d.z, label: d.label, type: 'deck' });
  });
  // Stringers and tweens
  (profiles.stringer||[]).forEach(p => {
    if (p.z > g.IB && p.z < g.UD) candidates.push({ y: yMM, z: p.z, label: 'Stringer', type: 'deck' });
  });
  (profiles.tweenDeck||[]).forEach(p => {
    if (p.z > g.IB && p.z < g.UD) candidates.push({ y: yMM, z: p.z, label: 'Tween', type: 'deck' });
  });
  // Vertical lines at key Y positions (snap horizontally to these lines)
  [
    { y: 0, label: 'CL' },
    { y: g.duct_half, label: 'Duct' },
    { y: g.keel_half, label: 'Keel edge' },
    { y: g.IS, label: 'IS' },
    { y: g.B_half, label: 'Shell' },
  ].forEach(v => {
    candidates.push({ y: v.y, z: zMM, label: v.label, type: 'line' });
  });
  (SIDE_GIRDERS||[]).forEach((sg, i) => {
    candidates.push({ y: sg.y, z: zMM, label: `SG${i+1}`, type: 'line' });
  });

  // Pick closest within snapRadius (real mm distance)
  candidates.forEach(c => {
    const d = Math.hypot(c.y - yMM, c.z - zMM);
    if (d < snapRadius && (!best || d < best.dist)) {
      best = { y: c.y, z: c.z, label: c.label, type: c.type, dist: d };
    }
  });
  return best;
}
window.snapToStructure = snapToStructure;

// Render measure overlay — snap markers + dimension line + mm value
function drawMeasureOverlay() {
  if (VIEW_MODE !== 'measure') return '';
  let out = '';
  const markerColor = '#22d3ee';   // cyan
  const lineColor = '#22d3ee';

  // Hover snap marker (crosshair)
  if (MEASURE.hover) {
    const x = X(MEASURE.hover.y);
    const y = Y(MEASURE.hover.z);
    out += `<g pointer-events="none">
      <circle cx="${x}" cy="${y}" r="6" fill="none" stroke="${markerColor}" stroke-width="1.5" opacity="0.8"/>
      <line x1="${x-10}" y1="${y}" x2="${x+10}" y2="${y}" stroke="${markerColor}" stroke-width="1" opacity="0.6"/>
      <line x1="${x}" y1="${y-10}" x2="${x}" y2="${y+10}" stroke="${markerColor}" stroke-width="1" opacity="0.6"/>
      <text x="${x+10}" y="${y-10}" fill="${markerColor}" font-size="9" font-family="ui-monospace,monospace" font-weight="600">${MEASURE.hover.label}</text>
    </g>`;
  }

  // Point 1 marker
  if (MEASURE.p1) {
    const x = X(MEASURE.p1.y);
    const y = Y(MEASURE.p1.z);
    out += `<g pointer-events="none">
      <circle cx="${x}" cy="${y}" r="5" fill="${markerColor}" stroke="#fff" stroke-width="1.5"/>
      <text x="${x+8}" y="${y-8}" fill="${markerColor}" font-size="9" font-family="ui-monospace,monospace" font-weight="700">1</text>
    </g>`;
  }

  // Point 2 + dimension line
  if (MEASURE.p1 && MEASURE.p2) {
    const x1 = X(MEASURE.p1.y);
    const y1 = Y(MEASURE.p1.z);
    const x2 = X(MEASURE.p2.y);
    const y2 = Y(MEASURE.p2.z);
    const dy = MEASURE.p2.y - MEASURE.p1.y;   // mm
    const dz = MEASURE.p2.z - MEASURE.p1.z;   // mm
    const dist = Math.hypot(dy, dz);          // mm
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    out += `<g pointer-events="none">
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${lineColor}" stroke-width="2" opacity="0.9" stroke-dasharray="6 3"/>
      <circle cx="${x2}" cy="${y2}" r="5" fill="${markerColor}" stroke="#fff" stroke-width="1.5"/>
      <text x="${x2+8}" y="${y2-8}" fill="${markerColor}" font-size="9" font-family="ui-monospace,monospace" font-weight="700">2</text>
    </g>`;
    // Dimension label box (centered between p1 and p2)
    const labelMain = `${Math.round(dist)} mm`;
    const labelSub = `ΔY=${Math.round(dy)}  ΔZ=${Math.round(dz)}`;
    const boxW = Math.max(labelMain.length, labelSub.length) * 6 + 14;
    const boxH = 28;
    out += `<g pointer-events="none">
      <rect x="${mx - boxW/2}" y="${my - boxH/2}" width="${boxW}" height="${boxH}" rx="3"
            fill="rgba(15,23,42,0.95)" stroke="${markerColor}" stroke-width="1"/>
      <text x="${mx}" y="${my-2}" fill="#fff" font-size="10" font-family="ui-monospace,monospace" font-weight="700" text-anchor="middle">${labelMain}</text>
      <text x="${mx}" y="${my+9}" fill="${markerColor}" font-size="8" font-family="ui-monospace,monospace" text-anchor="middle">${labelSub}</text>
    </g>`;
  }

  return out;
}

function render() {
  // Keep window.SELECTED_STIFF in sync with the local render scope's state,
  // and refresh the top-bar "Optimize Stiff" button enable/disable state.
  window.SELECTED_STIFF = SELECTED_STIFF;
  if (typeof window._updateOptimizeStiffBtn === 'function') {
    window._updateOptimizeStiffBtn();
  }
  const svg = document.getElementById('midshipSVG');
  const g = GEOMETRY;

  const svgShell = X(g.B_half);
  const svgBilgeY = X(g.B_half - g.R_B);
  const svgBilgeZ = Y(g.R_B);
  const svgIB = Y(g.IB);
  const svgTT = Y(g.TT);
  const svgUD = Y(g.UD);
  const svgHC = Y(g.HC);
  const svgIS = X(g.IS);
  const svgKeel = X(g.keel_half);
  const svgDuct = X(g.duct_half);

  // ── Analysis submode: decides which FAIL overlay is shown ──
  // submode: 'overall' | 'local' | 'hullgirder' | 'buckling'
  // In draw mode this always returns true (no fail highlighting).
  const submode = window.ANALYSIS_MODE ? (window.ANALYSIS_SUBMODE || 'overall') : null;
  // Should we draw FAIL overlay for a given 'kind' of check?
  // kind: 'local' | 'hullgirder' | 'buckling'
  const showFail = (kind) => {
    if (!submode) return true;  // draw mode — legacy behaviour
    if (submode === 'overall') return true;
    return submode === kind;
  };

  // Buffer for stiff / small-element hit areas. Appended to html at the very
  // end so these render on top of strake and plate hit areas, ensuring clicks
  // on small profiles (coaming edge FB, stringer stiff, etc.) hit them and
  // not the underlying plate.
  let stiffHits = '';

  // =====================================================================
  // MODE-AWARE COLOR PALETTE — every plate/girder/stiff drawing below
  // reads its stroke color from this object. Changes per VIEW_MODE.
  // =====================================================================
  const PC = buildPaletteForMode();

  let html = '';

  // Inject per-mode style overrides so existing CSS classes respect palette
  html += `<style>
    .shell        { stroke: ${PC.shell}; }
    .ib           { stroke: ${PC.ib}; }
    .is           { stroke: ${PC.is}; }
    .deck         { stroke: ${PC.upperDeck}; }
    .tanktop      { stroke: ${PC.tween}; }
    .coaming      { stroke: ${PC.coaming}; }
    .coaming-top  { stroke: ${PC.coamingTop || PC.coaming}; }
    .coaming-wall { stroke: ${PC.coamingWall || PC.coaming}; }
    .keel         { stroke: ${PC.keel}; }
    .girder       { stroke: ${PC.duct}; }
    .stringer     { stroke: ${PC.stringer}; stroke-dasharray: 4,2; }
  </style>`;
  
  // === GRID (semi-transparent technical drawing grid) ===
  // Light horizontal + vertical lines at important coordinates.
  // Horizontal: BL, IB, stringer, tween, UD, HC
  // Vertical: CL, duct_half, each SG, IS, B_half
  const gridStyle = `stroke="#3b82f6" stroke-opacity="0.12" stroke-width="0.5" fill="none"`;
  const xMin = -60;
  const xMax = svgShell + 90;
  const yMin = Y(g.HC) - 20;
  const yMax = BASELINE_Y + 60;

  // Horizontal grid lines
  const hGridZ = new Set([0, g.IB, g.UD, g.HC]);
  profiles.stringer.forEach(p => { if (p.z > g.IB && p.z < g.UD) hGridZ.add(p.z); });
  profiles.tweenDeck.forEach(p => { if (p.z > g.IB && p.z < g.UD) hGridZ.add(p.z); });
  Array.from(hGridZ).forEach(z => {
    const yy = Y(z);
    html += `<line x1="${xMin}" y1="${yy}" x2="${xMax}" y2="${yy}" ${gridStyle}/>`;
  });

  // Vertical grid lines (Y positions from CL)
  const vGridY = new Set([0, g.duct_half, g.IS, g.B_half]);
  SIDE_GIRDERS.forEach(sg => vGridY.add(sg.y));
  Array.from(vGridY).forEach(y => {
    const xx = X(y);
    html += `<line x1="${xx}" y1="${yMin}" x2="${xx}" y2="${yMax}" ${gridStyle}/>`;
  });

  // === CL-distance labels below BL (for vertical grid positions) ===
  // Each important Y gets a label under baseline showing distance from CL.
  // If multiple items share the same (or near-same) Y, merge their labels.
  const rawVDim = [
    { y: g.duct_half, label:'Duct' },
    ...SIDE_GIRDERS.map((sg, i) => ({ y: sg.y, label:`SG${i+1}` })),
    { y: g.IS,     label:'IS'    },
    { y: g.B_half, label:'Shell' },
  ];
  // Merge items with nearly identical Y (within 20mm) into one label
  rawVDim.sort((a, b) => a.y - b.y);
  const vDimY = [];
  rawVDim.forEach(item => {
    const last = vDimY[vDimY.length - 1];
    if (last && Math.abs(item.y - last.y) < 20) {
      last.label += ' / ' + item.label;
    } else {
      vDimY.push({ y: item.y, label: item.label });
    }
  });
  // Stagger labels vertically when horizontally close (SVG-unit distance)
  let lastX = -Infinity;
  vDimY.forEach(({ y, label }) => {
    const xx = X(y);
    const close = (xx - lastX) < 45;
    const labelY = BASELINE_Y + (close ? 50 : 32);
    const tickEnd = labelY - 8;
    html += `<line x1="${xx}" y1="${BASELINE_Y + 2}" x2="${xx}" y2="${tickEnd}" stroke="#3b82f6" stroke-width="0.5" opacity="0.5"/>`;
    html += `<text class="label-z" x="${xx}" y="${labelY}" text-anchor="middle" style="font-size:9px">${y}</text>`;
    html += `<text x="${xx}" y="${labelY + 10}" text-anchor="middle" style="fill:#64748b;font-size:7.5px;font-family:monospace">${label}</text>`;
    lastX = xx;
  });

  // === AXES ===
  html += `<line class="axis" x1="0" y1="${svgHC - 20}" x2="0" y2="${BASELINE_Y + 30}"/>`;
  html += `<text class="label-dim" x="-15" y="${BASELINE_Y + 45}">CL</text>`;
  html += `<line class="axis" x1="-30" y1="${BASELINE_Y}" x2="${svgShell + 40}" y2="${BASELINE_Y}"/>`;
  html += `<text class="label-dim" x="-50" y="${BASELINE_Y + 4}">BL 0</text>`;
  
  // Z levels — labels on the right side (outside shell): value + "AB" (Above Baseline)
  // Collect all named Z levels + stringer/tween deck plate Zs (in case user adds extras).
  const zLevels = new Set([g.IB, g.TT, g.UD, g.HC]);
  profiles.stringer.forEach(p => { if (p.z > g.IB && p.z < g.UD) zLevels.add(p.z); });
  profiles.tweenDeck.forEach(p => { if (p.z > g.IB && p.z < g.UD) zLevels.add(p.z); });
  Array.from(zLevels).sort((a,b) => a - b).forEach(z => {
    const yy = Y(z);
    // Label
    html += `<text class="label-z" x="${svgShell + 15}" y="${yy - 3}">${z} AB</text>`;
    // Short horizontal line under the text (roughly text width)
    const textWidth = String(z).length * 6 + 18;  // ~6px per digit + " AB"
    html += `<line x1="${svgShell + 15}" y1="${yy}" x2="${svgShell + 15 + textWidth}" y2="${yy}" stroke="#3b82f6" stroke-width="0.6" opacity="0.6"/>`;
  });
  // BL (Baseline) label — same style as AB labels
  html += `<text class="label-z" x="${svgShell + 15}" y="${BASELINE_Y - 3}">BL</text>`;
  html += `<line x1="${svgShell + 15}" y1="${BASELINE_Y}" x2="${svgShell + 15 + 2 * 6 + 6}" y2="${BASELINE_Y}" stroke="#3b82f6" stroke-width="0.6" opacity="0.6"/>`;

  // === FSICR ICE WATERLINES & MARGINS ===
  // Drawn only when the ice-class panel is set to Enabled. Two horizontal
  // bands are highlighted on the section drawing:
  //   • Plate Ice Belt   — UIWL + a, LIWL − b   (Reg. 4.3.1)
  //   • Frame Ice Streng — UIWL + c, LIWL − d   (Reg. 4.4.1)
  // Plus the two waterlines themselves (UIWL solid cyan, LIWL solid amber).
  // All labels go on the OPPOSITE side from AB labels (left of CL) so they
  // don't collide with the dense AB stack on the right.
  try {
    const ctxFS = (typeof FSICR !== 'undefined' && FSICR && typeof FSICR.compute === 'function')
                  ? FSICR.compute() : null;
    if (ctxFS) {
      // Pixel coords for the four extents (mm → svg)
      const yPlateTop = Y(ctxFS.z_top_plate);
      const yPlateBot = Y(ctxFS.z_bot_plate);
      const yFrameTop = Y(ctxFS.z_top_frame);
      const yFrameBot = Y(ctxFS.z_bot_frame);
      // UIWL / LIWL pixel coords
      const T_uiwl_mm = (parseFloat((document.getElementById('ice_T_uiwl') || {}).value) || 0) * 1000;
      const T_liwl_mm = (parseFloat((document.getElementById('ice_T_liwl') || {}).value) || 0) * 1000;
      const yUIWL = Y(T_uiwl_mm);
      const yLIWL = Y(T_liwl_mm);

      // X extents for the bands — span across the whole drawing
      const xL = -90;                     // left edge (a bit beyond CL labels)
      const xR = svgShell + 12;           // right edge (just before AB labels)
      const w  = xR - xL;

      // 1) Frame Ice Strengthening band — wider, lighter
      html += `<rect x="${xL}" y="${yFrameTop}" width="${w}" height="${yFrameBot - yFrameTop}" `
            + `fill="#06b6d4" fill-opacity="0.05" stroke="#06b6d4" stroke-width="0.5" `
            + `stroke-dasharray="4 3" stroke-opacity="0.55" pointer-events="none"/>`;
      // 2) Plate Ice Belt band — narrower, denser tint, on top of the frame band
      html += `<rect x="${xL}" y="${yPlateTop}" width="${w}" height="${yPlateBot - yPlateTop}" `
            + `fill="#06b6d4" fill-opacity="0.10" stroke="#06b6d4" stroke-width="0.7" `
            + `stroke-dasharray="2 2" stroke-opacity="0.85" pointer-events="none"/>`;

      // 3) UIWL — solid cyan
      html += `<line x1="${xL}" y1="${yUIWL}" x2="${xR}" y2="${yUIWL}" `
            + `stroke="#22d3ee" stroke-width="1.3" pointer-events="none"/>`;
      // 4) LIWL — solid amber
      html += `<line x1="${xL}" y1="${yLIWL}" x2="${xR}" y2="${yLIWL}" `
            + `stroke="#f59e0b" stroke-width="1.3" pointer-events="none"/>`;

      // === LABELS — placed on the LEFT side, away from AB stack ===
      const labelX = xL - 4;   // text right-anchored
      // UIWL label
      html += `<text x="${labelX}" y="${yUIWL - 3}" text-anchor="end" `
            + `fill="#22d3ee" font-size="9" font-family="var(--font-mono)" font-weight="600" `
            + `pointer-events="none">UIWL ${T_uiwl_mm.toFixed(0)}</text>`;
      // LIWL label
      html += `<text x="${labelX}" y="${yLIWL - 3}" text-anchor="end" `
            + `fill="#f59e0b" font-size="9" font-family="var(--font-mono)" font-weight="600" `
            + `pointer-events="none">LIWL ${T_liwl_mm.toFixed(0)}</text>`;
      // Plate ice belt extents — left labels (top + bot)
      html += `<text x="${labelX}" y="${yPlateTop - 2}" text-anchor="end" `
            + `fill="#06b6d4" font-size="8" font-family="var(--font-mono)" `
            + `pointer-events="none">Plate IB top ${ctxFS.z_top_plate.toFixed(0)}</text>`;
      html += `<text x="${labelX}" y="${yPlateBot + 8}" text-anchor="end" `
            + `fill="#06b6d4" font-size="8" font-family="var(--font-mono)" `
            + `pointer-events="none">Plate IB bot ${ctxFS.z_bot_plate.toFixed(0)}</text>`;
      // Frame ice strengthening extents — left labels (top + bot)
      html += `<text x="${labelX}" y="${yFrameTop - 2}" text-anchor="end" `
            + `fill="#06b6d4" font-size="8" font-family="var(--font-mono)" opacity="0.75" `
            + `pointer-events="none">Frame top ${ctxFS.z_top_frame.toFixed(0)}</text>`;
      html += `<text x="${labelX}" y="${yFrameBot + 8}" text-anchor="end" `
            + `fill="#06b6d4" font-size="8" font-family="var(--font-mono)" opacity="0.75" `
            + `pointer-events="none">Frame bot ${ctxFS.z_bot_frame.toFixed(0)}</text>`;
      // Ice class chip — top-left of the band
      html += `<text x="${labelX}" y="${yFrameTop - 14}" text-anchor="end" `
            + `fill="#22d3ee" font-size="9" font-family="var(--font-mono)" font-weight="700" `
            + `pointer-events="none">FSICR ${ctxFS.iceClass}</text>`;
    }
  } catch (_) { /* if anything fails, just skip the overlay */ }
  
  // === PLATES ===
  // Shell (bottom → bilge → side → UD)
  html += `<path class="shell" d="M ${svgDuct},${BASELINE_Y} L ${svgBilgeY},${BASELINE_Y} Q ${svgShell},${BASELINE_Y} ${svgShell},${svgBilgeZ} L ${svgShell},${svgUD}"/>`;
  
  // Keel (thick yellow)
  html += `<line class="keel" x1="0" y1="${BASELINE_Y}" x2="${svgKeel}" y2="${BASELINE_Y}"/>`;
  
  // Inner bottom (full width CL → shell)
  html += `<path class="ib" d="M 0,${svgIB} L ${svgShell},${svgIB}"/>`;
  
  // Tank top (IS → shell, cyan dashed)
  html += `<path class="tanktop" d="M ${svgIS},${svgTT} L ${svgShell},${svgTT}"/>`;
  
  // Inner side (IB → HC, single green line — full panel as one color).
  // The inboard coaming wall is part of Inner Side now, so the green line
  // continues all the way up to HC (no coaming-colour overlay).
  html += `<path class="is" d="M ${svgIS},${svgIB} L ${svgIS},${svgHC}"/>`;
  
  // Upper deck (IS → shell) — cargo hold top is open (hatch opening); deck only covers side tank top
  html += `<path class="deck" d="M ${svgIS},${svgUD} L ${svgShell},${svgUD}"/>`;
  
  // === HATCH COAMING (top plate only — outboard wall removed) ===
  // Top plate — at Z=HC level, extends coamingTop mm from IS toward shell.
  // The coaming top plate is now a cantilever from the inner-side wall;
  // it has no outboard support since the outboard wall has been removed
  // from the section. This matches what's used in computeSectionProperties().
  if (PARAMS.coamingTop > 0) {
    const topEndY = Math.min(g.IS + PARAMS.coamingTop, g.B_half);
    const topEndSVG = X(topEndY);
    html += `<path class="coaming-top" d="M ${svgIS},${svgHC} L ${topEndSVG},${svgHC}"/>`;
  }
  
  // === GIRDERS in DB ===
  // Duct keel walls at ±900 (shown as 2 vertical lines, but we're only drawing half)
  html += `<line x1="${svgDuct}" y1="${BASELINE_Y}" x2="${svgDuct}" y2="${svgIB}" stroke="${PC.duct}" stroke-width="1.8" fill="none"/>`;
  
  // Side Girders — editable list (SIDE_GIRDERS state).
  // Each girder extends from BL to IB. Color resolved per-girder (WT mode uses flag).
  SIDE_GIRDERS.forEach((sg, i) => {
    if (sg.y > g.duct_half && sg.y < g.B_half - g.R_B) {
      const sx = X(sg.y);
      const col = colorForSG(i);
      html += `<line x1="${sx}" y1="${BASELINE_Y}" x2="${sx}" y2="${svgIB}" stroke="${col}" stroke-width="1.8" fill="none"/>`;
    }
  });
  
  // === STRINGERS removed ===

  // === STRAKE SEAMS (short tick marks) ===
  const SEAM_COLOR = '#64748b';
  const SEAM_TICK = 14;
  const seamStyle = `stroke="${SEAM_COLOR}" stroke-width="1" stroke-dasharray="3,2" fill="none"`;
  const SEL_COLOR = '#fbbf24';

  // Shell seam ticks
  {
    const L = shellGeometryLengths();
    let cursor = 0;
    for (let i = 0; i < STRAKES.shell.length - 1; i++) {
      cursor += STRAKES.shell[i].width;
      const pt = shellPathPointAt(cursor);
      if (cursor <= L.keel + L.bottom + 0.01) {
        html += `<line x1="${pt.x}" y1="${pt.y - SEAM_TICK/2}" x2="${pt.x}" y2="${pt.y + SEAM_TICK/2}" ${seamStyle}/>`;
      } else if (cursor <= L.keel + L.bottom + L.bilge + 0.01) {
        const s = cursor - L.keel - L.bottom;
        const theta = (s / L.bilge) * (Math.PI / 2);
        const dx = Math.sin(theta) * SEAM_TICK / 2;
        const dy = -Math.cos(theta) * SEAM_TICK / 2;
        html += `<line x1="${pt.x - dx}" y1="${pt.y - dy}" x2="${pt.x + dx}" y2="${pt.y + dy}" ${seamStyle}/>`;
      } else {
        html += `<line x1="${pt.x - SEAM_TICK/2}" y1="${pt.y}" x2="${pt.x + SEAM_TICK/2}" y2="${pt.y}" ${seamStyle}/>`;
      }
    }
  }
  // IB seam ticks
  {
    let cursor = 0;
    for (let i = 0; i < STRAKES.innerBottom.length - 1; i++) {
      cursor += STRAKES.innerBottom[i].width;
      const sx = X(cursor);
      html += `<line x1="${sx}" y1="${svgIB - SEAM_TICK/2}" x2="${sx}" y2="${svgIB + SEAM_TICK/2}" ${seamStyle}/>`;
    }
  }
  // IS seam ticks
  {
    let cursor = g.IB;
    for (let i = 0; i < STRAKES.innerSide.length - 1; i++) {
      cursor += STRAKES.innerSide[i].width;
      const sy = Y(cursor);
      html += `<line x1="${svgIS - SEAM_TICK/2}" y1="${sy}" x2="${svgIS + SEAM_TICK/2}" y2="${sy}" ${seamStyle}/>`;
    }
  }

  // === BOTTOM SHELL LONGITUDINALS ===
  // CL stiff (Y=0) and all stiffs outside duct wall up to bilge start.
  // When duct exists, stiffs inside duct half (but not at CL) are suppressed
  // because they'd be physically inside the duct keel.
  //
  // NOTE: stiff HIT AREAS are collected into `stiffHits` buffer (declared at
  // the top of render) and appended AT THE VERY END, so they render ON TOP
  // of strake hit areas and plate hit areas — this ensures clicking a stiff
  // opens the stiff inspector, not the underlying plate/strake.
  const bottomEnd = g.B_half - g.R_B;
  profiles.bottomShell.forEach((p, i) => {
    // Suppress stiffeners physically inside the duct keel (0 < y < duct_half).
    // EXCEPTIONS: y == 0 (CL stiff) and y == 300 (offset CL stiff per May 2026
    // user spec — first bottom-shell long was relocated 300 mm from CL).
    // Both belong to the duct/keel structural family and are intentionally
    // placed inside the duct.
    const insideDuct = g.duct_half > 0 && p.y > 0 && p.y < g.duct_half
                       && Math.abs(p.y - 300) > 1;
    if (insideDuct) return;
    if (p.y >= 0 && p.y < bottomEnd) {
      html += drawL_onBottom(X(p.y), false, PARAMS.profTypeBottom, colorForStiff('bottomShell', PARAMS.profTypeBottom), 'bottomShell', p);
      if (SELECTED_STIFF && SELECTED_STIFF.group === 'bottomShell' && SELECTED_STIFF.index === i) {
        html += drawL_onBottom(X(p.y), false, PARAMS.profTypeBottom, '#fbbf24', 'bottomShell', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
      }
      stiffHits += drawStiffHit(X(p.y), BASELINE_Y, 'vertical', 'bottomShell', i);
    }
  });

  // === INNER BOTTOM LONGITUDINALS (full span up to B_half — IB plate spans full beam) ===
  profiles.innerBottom.forEach((p, i) => {
    // Same duct-suppression as bottomShell — allow y=0 (CL) and y=300
    // (offset CL stiff per May 2026 user spec).
    const insideDuct = g.duct_half > 0 && p.y > 0 && p.y < g.duct_half
                       && Math.abs(p.y - 300) > 1;
    if (insideDuct) return;
    if (p.y >= 0 && p.y < g.B_half) {
      html += drawL_onIB(X(p.y), PARAMS.profTypeIB, colorForStiff('innerBottom', PARAMS.profTypeIB), 'innerBottom', p);
      if (SELECTED_STIFF && SELECTED_STIFF.group === 'innerBottom' && SELECTED_STIFF.index === i) {
        html += drawL_onIB(X(p.y), PARAMS.profTypeIB, '#fbbf24', 'innerBottom', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
      }
      stiffHits += drawStiffHit(X(p.y), svgIB, 'vertical', 'innerBottom', i);
    }
  });

  // === STRINGER PLATE(s) — horizontal plate from IS to shell, strake: IB..UD ===
  profiles.stringer.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) {
      const sy = Y(p.z);
      html += `<line x1="${svgIS}" y1="${sy}" x2="${svgShell}" y2="${sy}" stroke="${PC.stringer}" stroke-width="2.5" fill="none"/>`;
    }
  });

  // === STRINGER DECK STIFFENERS — on each stringer plate, IS..shell span ===
  profiles.stringer.forEach(plate => {
    if (plate.z <= g.IB || plate.z >= g.UD) return;
    profiles.stringerStiff.forEach((p, i) => {
      if (p.y > g.IS && p.y < g.B_half) {
        html += drawL_onHorizontalPlate(X(p.y), plate.z, PARAMS.profTypeStringer, colorForStiff('stringerStiff', PARAMS.profTypeStringer), 'stringerStiff', p);
        if (SELECTED_STIFF && SELECTED_STIFF.group === 'stringerStiff' && SELECTED_STIFF.index === i) {
          html += drawL_onHorizontalPlate(X(p.y), plate.z, PARAMS.profTypeStringer, '#fbbf24', 'stringerStiff', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
        }
        stiffHits += drawStiffHit(X(p.y), Y(plate.z), 'vertical', 'stringerStiff', i, plate.z);
      }
    });
  });

  // === TWEEN DECK PLATE(s) — horizontal plate from IS to shell, strake: IB..UD ===
  profiles.tweenDeck.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) {
      const sy = Y(p.z);
      html += `<line x1="${svgIS}" y1="${sy}" x2="${svgShell}" y2="${sy}" stroke="${PC.tween}" stroke-width="2.5" fill="none"/>`;
    }
  });

  // === TWEEN DECK STIFFENERS — on each tween deck plate, IS..shell span ===
  profiles.tweenDeck.forEach(plate => {
    if (plate.z <= g.IB || plate.z >= g.UD) return;
    profiles.tweenStiff.forEach((p, i) => {
      if (p.y > g.IS && p.y < g.B_half) {
        html += drawL_onHorizontalPlate(X(p.y), plate.z, PARAMS.profTypeTween, colorForStiff('tweenStiff', PARAMS.profTypeTween), 'tweenStiff', p);
        if (SELECTED_STIFF && SELECTED_STIFF.group === 'tweenStiff' && SELECTED_STIFF.index === i) {
          html += drawL_onHorizontalPlate(X(p.y), plate.z, PARAMS.profTypeTween, '#fbbf24', 'tweenStiff', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
        }
        stiffHits += drawStiffHit(X(p.y), Y(plate.z), 'vertical', 'tweenStiff', i, plate.z);
      }
    });
  });

  // === COAMING TOP PLATE STIFFENERS — on the coaming top plate at Z=HC ===
  // Two render modes:
  //   - Normal stiff: horizontal plate stiff (drawL_onHorizontalPlate at Z=HC)
  //   - Edge FB (edge:true): vertical FB at Y=coamEndY extending DOWN from Z=HC
  //     by p.h mm (yellow color because type='FB')
  if (PARAMS.coamingTop > 0) {
    const coamEndY = g.IS + PARAMS.coamingTop;
    profiles.coamingStiff.forEach((p, i) => {
      if (p.edge) {
        // Vertical FB at coaming top plate's outboard edge (Y = coamEndY)
        const edgeH = p.h || PARAMS.coamingEdgeH || 150;
        const svgHC = Y(g.HC);
        const svgEdgeBottom = Y(g.HC - edgeH);
        const xEdge = X(p.y);
        // FB color — yellow since it's a flat bar
        const edgeColor = (VIEW_MODE === 'profile') ? '#fbbf24'
                          : (VIEW_MODE === 'wt' || VIEW_MODE === 'compartment' || VIEW_MODE === 'thickness') ? '#64748b'
                          : '#fbbf24';
        const isSelected = SELECTED_STIFF && SELECTED_STIFF.group === 'coamingStiff' && SELECTED_STIFF.index === i;
        const strokeW = isSelected ? 4 : 2.5;
        const col = isSelected ? '#fbbf24' : edgeColor;
        html += `<g pointer-events="none"><line x1="${xEdge}" y1="${svgHC}" x2="${xEdge}" y2="${svgEdgeBottom}" stroke="${col}" stroke-width="${strokeW}" fill="none"/></g>`;
        // Hit area
        stiffHits += `<rect x="${xEdge - 8}" y="${Math.min(svgHC, svgEdgeBottom) - 2}" width="16" height="${Math.abs(svgEdgeBottom - svgHC) + 4}" fill="#000" fill-opacity="0" pointer-events="all" style="cursor:pointer" data-stiff-group="coamingStiff" data-stiff-idx="${i}"><title>Coaming Edge FB #${i+1}</title></rect>`;
      } else if (p.y >= g.IS && p.y <= coamEndY) {
        // Regular horizontal-plate stiff on coaming top plate. Stiff is
        // allowed at the inner (Y=IS) and outer (Y=IS+coamingTop) edges
        // since the outboard wall has been removed and the outer edge is
        // now the most loaded point of the cantilever.
        html += drawL_onHorizontalPlate(X(p.y), g.HC, PARAMS.profTypeCoaming, colorForStiff('coamingStiff', PARAMS.profTypeCoaming), 'coamingStiff', p);
        if (SELECTED_STIFF && SELECTED_STIFF.group === 'coamingStiff' && SELECTED_STIFF.index === i) {
          html += drawL_onHorizontalPlate(X(p.y), g.HC, PARAMS.profTypeCoaming, '#fbbf24', 'coamingStiff', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
        }
        stiffHits += drawStiffHit(X(p.y), Y(g.HC), 'vertical', 'coamingStiff', i);
      }
    });
  }

  // === SIDE SHELL LONGITUDINALS (strake: IB..UD — Side Shell plate UD'de biter) ===
  profiles.sideShell.forEach((p, i) => {
    if (p.z <= g.IB || p.z >= g.UD) return;
    if (clashesWithHorizontal(p.z)) return;
    html += drawL_onSide(Y(p.z), PARAMS.profTypeSide, colorForStiff('sideShell', PARAMS.profTypeSide), 'sideShell', p);
    if (SELECTED_STIFF && SELECTED_STIFF.group === 'sideShell' && SELECTED_STIFF.index === i) {
      html += drawL_onSide(Y(p.z), PARAMS.profTypeSide, '#fbbf24', 'sideShell', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
    }
    stiffHits += drawStiffHit(svgShell, Y(p.z), 'horizontal', 'sideShell', i);
  });

  // === INNER SIDE LONGITUDINALS (full panel IB → HC, including coaming wall region) ===
  // Note: previous schema treated UD→HC as stiff-free coaming wall. Now Inner
  // Side is a single uniform panel IB → HC, so stiffeners may be placed
  // anywhere in this range (coaming-wall longs are valid IS longs).
  profiles.innerSide.forEach((p, i) => {
    if (p.z <= g.IB || p.z >= g.HC) return;   // full panel range
    if (clashesWithHorizontal(p.z)) return;
    html += drawL_onInnerSide(Y(p.z), PARAMS.profTypeIS, colorForStiff('innerSide', PARAMS.profTypeIS), 'innerSide', p);
    if (SELECTED_STIFF && SELECTED_STIFF.group === 'innerSide' && SELECTED_STIFF.index === i) {
      html += drawL_onInnerSide(Y(p.z), PARAMS.profTypeIS, '#fbbf24', 'innerSide', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
    }
    stiffHits += drawStiffHit(svgIS, Y(p.z), 'horizontal', 'innerSide', i);
  });

  // === UPPER DECK LONGITUDINALS ===
  profiles.upperDeck.forEach((p, i) => {
    if (p.y > g.IS && p.y < g.B_half) {
      html += drawL_onDeck(X(p.y), PARAMS.profTypeDeck, colorForStiff('upperDeck', PARAMS.profTypeDeck), 'upperDeckStiff', p);
      if (SELECTED_STIFF && SELECTED_STIFF.group === 'upperDeck' && SELECTED_STIFF.index === i) {
        html += drawL_onDeck(X(p.y), PARAMS.profTypeDeck, '#fbbf24', 'upperDeckStiff', p).replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"');
      }
      stiffHits += drawStiffHit(X(p.y), svgUD, 'vertical', 'upperDeck', i);
    }
  });

  // === STRAKE CLICKABLE HIT AREAS + (in thickness mode) per-strake coloring ===
  // Drawn AFTER all stiffs so clicks hit strakes, not stiffs underneath.
  const HIT_WIDTH = 22;
  const PAINT_WIDTH = 4;  // width of the visible colored strip in thickness mode
  const isThicknessMode = VIEW_MODE === 'thickness';
  const isMaterialMode  = VIEW_MODE === 'material';
  const isYieldMode     = VIEW_MODE === 'yield';

  // Color map for yield-strength families (matches the editor pill colours)
  const YIELD_COLORS = {
    MS:   '#6b7280',   // gray (mild steel)
    AH32: '#0891b2',   // cyan
    AH36: '#7c3aed',   // purple
    AH40: '#ea580c',   // orange
  };
  // Resolve a strake/stiff's effective family. Override > global Setup.
  // Returns '<family>' (always a real key, never null), and a `inherited`
  // flag indicating whether the value came from override or fallback.
  const _globalMatKey = (() => {
    try { return document.getElementById('material')?.value || 'AH36'; }
    catch(_) { return 'AH36'; }
  })();
  const effectiveFamily = (obj) => {
    if (obj && obj.family) return { family: obj.family, inherited: false };
    return { family: _globalMatKey, inherited: true };
  };
  const colorForFamily = (fam, inherited) => {
    const base = YIELD_COLORS[fam] || '#9ca3af';
    if (inherited) {
      // Mute the colour to signal "default / inherited" rather than overridden
      return base + '66';   // alpha ~40% via 8-digit hex
    }
    return base;
  };

  const strakeStroke = (strake) => {
    if (isThicknessMode) {
      return colorForThickness(strake.thickness);
    }
    if (isMaterialMode) {
      // Use the strake's assigned grade (set by assignMaterialGrades).
      // If unassigned, fall back to a muted grey so it's visually obvious
      // the plate hasn't been graded yet.
      return colorForGrade(strake.grade);
    }
    if (isYieldMode) {
      const ef = effectiveFamily(strake);
      return colorForFamily(ef.family, ef.inherited);
    }
    return null;
  };

  // Shell hit areas / color strips — sampled path per strake
  {
    const L = shellGeometryLengths();
    let cursor = 0;
    for (let i = 0; i < STRAKES.shell.length; i++) {
      const strake = STRAKES.shell[i];
      const start = cursor;
      const end   = cursor + strake.width;
      const isSel = SELECTED_STRAKE && SELECTED_STRAKE.plate === 'shell' && SELECTED_STRAKE.index === i;
      const samples = [];
      const nSample = Math.max(2, Math.ceil((end - start) / 60));
      for (let k = 0; k <= nSample; k++) {
        const s = start + (end - start) * (k / nSample);
        samples.push(shellPathPointAt(Math.min(s, L.total - 0.01)));
      }
      const pathD = `M ${samples.map(p => `${p.x},${p.y}`).join(' L ')}`;
      // Thickness-mode visible strake paint
      const col = strakeStroke(strake);
      if (col) {
        html += `<path d="${pathD}" stroke="${col}" stroke-width="${PAINT_WIDTH}" fill="none" opacity="0.95" pointer-events="none"/>`;
      }
      // Yield-family label at the mid-sample point
      if (isYieldMode) {
        const ef = effectiveFamily(strake);
        const labelCol = colorForFamily(ef.family, ef.inherited);
        const midSample = samples[Math.floor(samples.length / 2)];
        if (midSample) {
          // Offset away from the hull in the "outboard" direction
          const lblW = ef.family.length * 5 + 8;
          html += `<rect x="${midSample.x - lblW/2}" y="${midSample.y - 6}" width="${lblW}" height="11" rx="2" fill="rgba(15,23,42,0.92)" stroke="${labelCol}" stroke-width="0.8" pointer-events="none"/>`;
          html += `<text x="${midSample.x}" y="${midSample.y + 2}" text-anchor="middle" style="fill:${labelCol};font-family:monospace;font-size:8px;font-weight:700;pointer-events:none">${ef.family}</text>`;
        }
      }
      // Selection highlight
      if (isSel) {
        html += `<path d="${pathD}" stroke="${SEL_COLOR}" stroke-width="7" fill="none" opacity="0.6" pointer-events="none"/>`;
      }
      // Invisible clickable area
      html += `<path d="${pathD}" stroke="#000" stroke-opacity="0" stroke-width="${HIT_WIDTH}" fill="none" pointer-events="all" style="cursor:pointer" class="strake-hit" data-plate="shell" data-strake-idx="${i}"/>`;
      cursor = end;
    }
  }
  // IB hit areas / color strips
  {
    let cursor = 0;
    for (let i = 0; i < STRAKES.innerBottom.length; i++) {
      const strake = STRAKES.innerBottom[i];
      const x1 = X(cursor);
      const x2 = X(cursor + strake.width);
      const isSel = SELECTED_STRAKE && SELECTED_STRAKE.plate === 'innerBottom' && SELECTED_STRAKE.index === i;
      const col = strakeStroke(strake);
      if (col) {
        html += `<line x1="${x1}" y1="${svgIB}" x2="${x2}" y2="${svgIB}" stroke="${col}" stroke-width="${PAINT_WIDTH}" opacity="0.95" pointer-events="none"/>`;
      }
      // Yield-family label (Apr 2026): tiny pill above the strake mid-point
      // showing which yield class this strake uses. Inherited families are
      // muted to distinguish them from explicit overrides.
      if (isYieldMode) {
        const ef = effectiveFamily(strake);
        const labelCol = colorForFamily(ef.family, ef.inherited);
        const cx = (x1 + x2) / 2;
        const cy = svgIB - 8;
        const lblW = ef.family.length * 5 + 8;
        html += `<rect x="${cx - lblW/2}" y="${cy - 6}" width="${lblW}" height="11" rx="2" fill="rgba(15,23,42,0.92)" stroke="${labelCol}" stroke-width="0.8" pointer-events="none"/>`;
        html += `<text x="${cx}" y="${cy + 2}" text-anchor="middle" style="fill:${labelCol};font-family:monospace;font-size:8px;font-weight:700;pointer-events:none">${ef.family}</text>`;
      }
      if (isSel) {
        html += `<line x1="${x1}" y1="${svgIB}" x2="${x2}" y2="${svgIB}" stroke="${SEL_COLOR}" stroke-width="7" opacity="0.6" pointer-events="none"/>`;
      }
      html += `<line x1="${x1}" y1="${svgIB}" x2="${x2}" y2="${svgIB}" stroke="#000" stroke-opacity="0" stroke-width="${HIT_WIDTH}" fill="none" pointer-events="all" style="cursor:pointer" class="strake-hit" data-plate="innerBottom" data-strake-idx="${i}"/>`;
      cursor += strake.width;
    }
  }
  // IS hit areas / color strips
  {
    // In Analysis Mode, compute status of each IS strake for overlay.
    // Each strake is checked against its OWN as-built thickness, not a
    // hard-coded value — otherwise after Optimize Plates the thicknesses
    // change but the FAIL overlay keeps using the old number.
    let isStrakeStatus = null;
    if (window.ANALYSIS_MODE && typeof window.calcInnerSide === 'function') {
      try {
        const isCalc = window.calcInnerSide();
        isStrakeStatus = isCalc.strakes.map((s, i) => {
          const t_as = STRAKES.innerSide[i]?.thickness ?? 11;
          return { t_req: s.t, pass: t_as >= s.t, region: s.region };
        });
      } catch (e) { isStrakeStatus = null; }
    }
    
    let cursor = g.IB;
    for (let i = 0; i < STRAKES.innerSide.length; i++) {
      const strake = STRAKES.innerSide[i];
      const isCoamingWall = (strake.kind === 'coamingWall');
      const isOutboardCoaming = isCoamingWall && strake.side === 'outboard';

      // Position: inboard coaming + all tank wall strakes are at Y=IS (svgIS).
      // Outboard coaming is drawn at Y=IS+coamingTop and spans UD→HC (not from cursor).
      let x_pos, y1, y2;
      if (isOutboardCoaming) {
        x_pos = X(g.IS + PARAMS.coamingTop);
        y1 = Y(g.UD);
        y2 = Y(g.HC);
        // NOTE: don't advance cursor — outboard is a separate parallel strake,
        // not continuous with the stacked IS column.
      } else {
        x_pos = svgIS;
        y1 = Y(cursor);
        y2 = Y(cursor + strake.width);
      }

      const isSel = SELECTED_STRAKE && SELECTED_STRAKE.plate === 'innerSide' && SELECTED_STRAKE.index === i;
      const col = strakeStroke(strake);
      if (col) {
        html += `<line x1="${x_pos}" y1="${y1}" x2="${x_pos}" y2="${y2}" stroke="${col}" stroke-width="${PAINT_WIDTH}" opacity="0.95" pointer-events="none"/>`;
      }
      // Inner Side is ONE panel with ONE colour (green). The coaming-wall
      // colour overlay was removed — coaming top & inner/outer walls are
      // their own groups now (coamingTop / coamingWall), not an IS kind.
      // Analysis Mode: FAIL overlay (red) / OK overlay (green).
      // Only shown if current submode includes 'local' (or 'overall').
      if (isStrakeStatus && isStrakeStatus[i] && showFail('local')) {
        const st = isStrakeStatus[i];
        if (!st.pass) {
          // FAIL — red pulsing stroke + "!" marker
          html += `<line x1="${x_pos}" y1="${y1}" x2="${x_pos}" y2="${y2}" stroke="#ef4444" stroke-width="9" opacity="0.85" pointer-events="none">
            <animate attributeName="opacity" values="0.85;0.4;0.85" dur="1.6s" repeatCount="indefinite"/>
          </line>`;
          // "!" label
          const midY = (y1 + y2) / 2;
          html += `<circle cx="${x_pos + 14}" cy="${midY}" r="6" fill="#ef4444" stroke="#fff" stroke-width="1"/>`;
          html += `<text x="${x_pos + 14}" y="${midY + 3}" fill="#fff" font-size="9" font-weight="900" text-anchor="middle" pointer-events="none">!</text>`;
        }
      }
      if (isSel) {
        html += `<line x1="${x_pos}" y1="${y1}" x2="${x_pos}" y2="${y2}" stroke="${SEL_COLOR}" stroke-width="7" opacity="0.6" pointer-events="none"/>`;
      }
      // Tooltip with status info on hover
      const strakeLabel = strake.id || 'IS-'+(i+1);
      const tooltip = isStrakeStatus && isStrakeStatus[i]
        ? `${strakeLabel} (${isStrakeStatus[i].region}) · req ${isStrakeStatus[i].t_req.toFixed(1)} mm · have ${strake.thickness} mm · ${isStrakeStatus[i].pass ? 'OK' : 'FAIL'}`
        : `${strakeLabel} · ${strake.thickness} mm${isOutboardCoaming ? ' (outboard coaming)' : ''}`;
      html += `<line x1="${x_pos}" y1="${y1}" x2="${x_pos}" y2="${y2}" stroke="#000" stroke-opacity="0" stroke-width="${HIT_WIDTH}" fill="none" pointer-events="all" style="cursor:pointer" class="strake-hit" data-plate="innerSide" data-strake-idx="${i}"><title>${tooltip}</title></line>`;
      // Only advance cursor for inboard strakes (stacked column)
      if (!isOutboardCoaming) {
        cursor += strake.width;
      }
    }
  }

  // === WHOLE-PLATE HIT AREAS (for non-strake-subdivided plates) ===
  const wholeHitStyle = `stroke="#000" stroke-opacity="0" stroke-width="${HIT_WIDTH}" fill="none" pointer-events="all" style="cursor:pointer"`;
  const wholeSel = (key) => SELECTED_WHOLE_PLATE === key;
  const wholeSelStroke = `stroke="${SEL_COLOR}" stroke-width="7" opacity="0.6" pointer-events="none"`;

  // Thickness color strip (when in thickness mode)
  const paintWhole = (key, x1, y1, x2, y2) => {
    if (!isThicknessMode) return '';
    const t = PLATE_THICKNESS[key.replace(/[0-9]/g, '')] || PLATE_THICKNESS[key];
    if (!t) return '';
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colorForThickness(t)}" stroke-width="${PAINT_WIDTH}" opacity="0.95" pointer-events="none"/>`;
  };

  // Stringer Deck plate(s) — key: 'stringer' or 'stringer0' if multiple
  profiles.stringer.forEach((p, i) => {
    if (p.z <= g.IB || p.z >= g.UD) return;
    const sy = Y(p.z);
    const key = profiles.stringer.length > 1 ? 'stringer' + i : 'stringer';
    if (isThicknessMode) html += paintWhole('stringer', svgIS, sy, svgShell, sy);
    if (wholeSel(key)) html += `<line x1="${svgIS}" y1="${sy}" x2="${svgShell}" y2="${sy}" ${wholeSelStroke}/>`;
    html += `<line x1="${svgIS}" y1="${sy}" x2="${svgShell}" y2="${sy}" ${wholeHitStyle} data-whole-plate="${key}"/>`;
  });

  // Tween Deck plate(s)
  profiles.tweenDeck.forEach((p, i) => {
    if (p.z <= g.IB || p.z >= g.UD) return;
    const sy = Y(p.z);
    const key = profiles.tweenDeck.length > 1 ? 'tween' + i : 'tween';
    if (isThicknessMode) html += paintWhole('tween', svgIS, sy, svgShell, sy);
    if (wholeSel(key)) html += `<line x1="${svgIS}" y1="${sy}" x2="${svgShell}" y2="${sy}" ${wholeSelStroke}/>`;
    html += `<line x1="${svgIS}" y1="${sy}" x2="${svgShell}" y2="${sy}" ${wholeHitStyle} data-whole-plate="${key}"/>`;
  });

  // Upper Deck plate
  if (isThicknessMode) html += paintWhole('upperDeck', svgIS, svgUD, svgShell, svgUD);
  if (wholeSel('upperDeck')) html += `<line x1="${svgIS}" y1="${svgUD}" x2="${svgShell}" y2="${svgUD}" ${wholeSelStroke}/>`;
  html += `<line x1="${svgIS}" y1="${svgUD}" x2="${svgShell}" y2="${svgUD}" ${wholeHitStyle} data-whole-plate="upperDeck"/>`;

  // Coaming Top Plate (horizontal at Z=HC, extends from Y=IS to Y=IS+coamingTop)
  // Draw per-strake paint (thickness / material modes), seam ticks,
  // selection highlight, and a hit area so clicking routes to the Profile
  // Editor's Coaming Top Plate panel.
  if (PARAMS.coamingTop > 0) {
    const topEndX = X(g.IS + PARAMS.coamingTop);
    const topStrakes = STRAKES.coamingTop || [];
    // Per-strake paint (thickness / material modes)
    let yc = g.IS;
    topStrakes.forEach((s, i) => {
      const x1 = X(yc);
      const x2 = X(yc + s.width);
      const isSel = SELECTED_STRAKE && SELECTED_STRAKE.plate === 'coamingTop' && SELECTED_STRAKE.index === i;
      const col = strakeStroke(s);
      if (col) {
        html += `<line x1="${x1}" y1="${svgHC}" x2="${x2}" y2="${svgHC}" stroke="${col}" stroke-width="${PAINT_WIDTH}" opacity="0.95" pointer-events="none"/>`;
      }
      if (isSel) {
        html += `<line x1="${x1}" y1="${svgHC}" x2="${x2}" y2="${svgHC}" stroke="${SEL_COLOR}" stroke-width="7" opacity="0.6" pointer-events="none"/>`;
      }
      // Per-strake hit area
      html += `<line x1="${x1}" y1="${svgHC}" x2="${x2}" y2="${svgHC}" stroke="#000" stroke-opacity="0" stroke-width="${HIT_WIDTH}" fill="none" pointer-events="all" style="cursor:pointer" class="strake-hit" data-plate="coamingTop" data-strake-idx="${i}"><title>${s.id || 'CT-'+(i+1)} · ${s.thickness} mm</title></line>`;
      yc += s.width;
    });
    // Seam ticks between strakes
    if (topStrakes.length > 1) {
      let ys = g.IS;
      for (let k = 0; k < topStrakes.length - 1; k++) {
        ys += topStrakes[k].width;
        const xx = X(ys);
        html += `<line x1="${xx}" y1="${svgHC - 5}" x2="${xx}" y2="${svgHC + 5}" stroke="${DEFAULT_PALETTE.coamingTop}" stroke-width="1.2" opacity="0.85" pointer-events="none"/>`;
      }
    }
    // Whole-plate fallback hit area (if strake list is empty)
    if (topStrakes.length === 0) {
      if (wholeSel('coamingTop') || wholeSel('coaming')) html += `<line x1="${svgIS}" y1="${svgHC}" x2="${topEndX}" y2="${svgHC}" ${wholeSelStroke}/>`;
      html += `<line x1="${svgIS}" y1="${svgHC}" x2="${topEndX}" y2="${svgHC}" ${wholeHitStyle} data-whole-plate="coamingTop"/>`;
    }
  }

  // Duct wall
  if (isThicknessMode) html += paintWhole('duct', svgDuct, BASELINE_Y, svgDuct, svgIB);
  if (wholeSel('duct')) html += `<line x1="${svgDuct}" y1="${BASELINE_Y}" x2="${svgDuct}" y2="${svgIB}" ${wholeSelStroke}/>`;
  html += `<line x1="${svgDuct}" y1="${BASELINE_Y}" x2="${svgDuct}" y2="${svgIB}" ${wholeHitStyle} data-whole-plate="duct"/>`;

  // Side Girders — each indexed separately
  SIDE_GIRDERS.forEach((sg, i) => {
    if (sg.y <= g.duct_half || sg.y >= g.B_half - g.R_B) return;
    const sx = X(sg.y);
    const key = 'sg' + i;
    if (isThicknessMode) html += paintWhole('sideGirder', sx, BASELINE_Y, sx, svgIB);
    if (wholeSel(key)) html += `<line x1="${sx}" y1="${BASELINE_Y}" x2="${sx}" y2="${svgIB}" ${wholeSelStroke}/>`;
    html += `<line x1="${sx}" y1="${BASELINE_Y}" x2="${sx}" y2="${svgIB}" ${wholeHitStyle} data-whole-plate="${key}"/>`;
    // === Boyuna intercostal stiffener'lar — SADECE BİR YANDA, gerçek FB boyutu ===
    // Stbd side girder (y > 0) → FB CL'ye doğru (sola): web sx'ten sx-h'a
    // Port side girder (y < 0) → FB CL'ye doğru (sağa): web sx'ten sx+h'a
    // Bu örnekte tüm SG'ler stbd (y > 0) varsayılır.
    const sgKey = 'sideGirder' + i;
    const sgLongs = (profiles && profiles[sgKey]) ? profiles[sgKey] : [];
    const dir = -1;  // CL'ye doğru: sola
    sgLongs.forEach((stiff, sIdx) => {
      if (stiff.z >= 0 && stiff.z <= g.IB) {
        const sy = Y(stiff.z);
        const dims = _visualProfileDims(sgKey, stiff);
        const h = dims.h, fl = dims.fl, useType = dims.type || 'FB';
        const tickColor = colorForStiff(sgKey, useType);
        let stiffOut = '';
        if (useType === 'FB') {
          // Flat bar — yatay ince çizgi, web yüksekliği = h px
          stiffOut += `<line x1="${sx}" y1="${sy}" x2="${sx + dir*h}" y2="${sy}" stroke="${tickColor}" stroke-width="2" fill="none"/>`;
        } else if (useType === 'L') {
          // L — yatay web + dikey flange (yukarı doğru)
          stiffOut += `<line x1="${sx}" y1="${sy}" x2="${sx + dir*h}" y2="${sy}" stroke="${tickColor}" stroke-width="1.6" fill="none"/>`;
          stiffOut += `<line x1="${sx + dir*h}" y1="${sy}" x2="${sx + dir*h}" y2="${sy - fl}" stroke="${tickColor}" stroke-width="1.6" fill="none"/>`;
        } else if (useType === 'HP') {
          // HP — yatay web + küçük asimetrik bulb
          const hpBulbSize = Math.max(2, Math.round(h * 0.25));
          stiffOut += `<line x1="${sx}" y1="${sy}" x2="${sx + dir*h}" y2="${sy}" stroke="${tickColor}" stroke-width="1.4" fill="none"/>`;
          stiffOut += `<line x1="${sx + dir*h}" y1="${sy}" x2="${sx + dir*h}" y2="${sy - hpBulbSize}" stroke="${tickColor}" stroke-width="1.4" fill="none"/>`;
        }
        html += `<g pointer-events="none">${stiffOut}</g>`;
        // Selection highlight
        if (SELECTED_STIFF && SELECTED_STIFF.group === sgKey && SELECTED_STIFF.index === sIdx) {
          html += `<g pointer-events="none">${stiffOut.replace(/stroke="[^"]+"/g, 'stroke="#fbbf24"').replace(/stroke-width="[\d.]+"/g, 'stroke-width="3"')}</g>`;
        }
        // Hit area — geniş, tıklanabilir
        stiffHits += drawStiffHit(sx + dir*h/2, sy, 'horizontal', sgKey, sIdx);
      }
    });
  });
  
  // =====================================================================
  // ANNOTATION LAYERS — controlled by VIEW_MODE
  // Modes: general | thickness | profile | position | wt | compartment
  // =====================================================================

  // --- Plate thickness mode: plate colors change (palette above); no in-drawing numbers.
  //     Legend on the right shows "thickness → color" mapping.
  // (No explicit block needed — palette already applied at top of render.)

  // --- Compartment labels (only in 'compartment' mode, editable list) ---
  if (VIEW_MODE === 'compartment') {
    const PALETTE = ['#06b6d4','#a855f7','#f59e0b','#22c55e','#ef4444','#3b82f6','#94a3b8','#fbbf24'];
    // Pre-compute nodes so compartments defined by node IDs can resolve their bounds
    if (VIEW_MODE === 'compartment') computeNodes();

    COMPARTMENTS.forEach((c, i) => {
      const col = PALETTE[i % PALETTE.length];
      const b = compartmentBounds(c);
      if (!b) return;

      let cx, cy;  // centroid for label

      if (b.kind === 'polygon') {
        // Build path: detect bilge arc segments (bilge start ↔ bilge end)
        const ns = b.nodes;
        const g2 = GEOMETRY;
        const bilgeStartY = g2.B_half - g2.R_B;
        const isBilgeStart = (n) => Math.abs(n.realY - bilgeStartY) < 5 && n.realZ === 0;
        const isBilgeEnd   = (n) => Math.abs(n.realY - g2.B_half) < 5 && Math.abs(n.realZ - g2.R_B) < 5;

        let d = `M ${ns[0].x},${ns[0].y}`;
        for (let k = 1; k <= ns.length; k++) {
          const from = ns[k - 1];
          const to   = ns[k % ns.length];
          const crossesBilge = (isBilgeStart(from) && isBilgeEnd(to)) || (isBilgeEnd(from) && isBilgeStart(to));
          if (crossesBilge) {
            const rSvg = Math.abs(X(g2.B_half) - X(g2.B_half - g2.R_B));
            const sweep = isBilgeStart(from) ? 0 : 1;
            d += ` A ${rSvg},${rSvg} 0 0 ${sweep} ${to.x},${to.y}`;
          } else {
            d += ` L ${to.x},${to.y}`;
          }
        }
        d += ' Z';
        html += `<path d="${d}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="0.8" stroke-opacity="0.6" pointer-events="none"/>`;

        // Centroid (simple average — good enough for label placement)
        cx = ns.reduce((s, n) => s + n.x, 0) / ns.length;
        cy = ns.reduce((s, n) => s + n.y, 0) / ns.length + 3;
      } else {
        // Legacy bbox
        const x1 = X(b.yMin), x2 = X(b.yMax);
        const y1 = Y(b.zMax), y2 = Y(b.zMin);
        const bx = Math.min(x1, x2), by = Math.min(y1, y2);
        const bw = Math.abs(x2 - x1), bh = Math.abs(y2 - y1);
        html += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" fill="${col}" fill-opacity="0.18" stroke="${col}" stroke-width="0.8" stroke-opacity="0.6" pointer-events="none"/>`;
        cx = bx + bw / 2;
        cy = by + bh / 2 + 3;
      }
      html += `<text x="${cx}" y="${cy}" text-anchor="middle" style="fill:${col};font-family:monospace;font-size:12px;font-weight:600">${escapeXml(c.name)}</text>`;
    });
  }

  // === POSITION NAME LABELS (only in 'position' view mode) ===
  // Draws each stiff's user-assigned posName next to its anchor point.
  if (VIEW_MODE === 'position') {
    const drawPosLabel = (sx, sy, name, orient) => {
      // Offset: labels on vertical stiffs go above, horizontal ones to the outside
      let lx = 0, ly = -14;
      if (orient === 'horizontal') { lx = 16; ly = 3; }
      const w = String(name).length * 5.5 + 6;
      html += `<rect x="${sx + lx - w/2}" y="${sy + ly - 7}" width="${w}" height="11" rx="2" fill="rgba(15,23,42,0.92)" stroke="#a855f7" stroke-width="0.5" pointer-events="none"/>`;
      html += `<text x="${sx + lx}" y="${sy + ly + 2}" text-anchor="middle" style="fill:#a855f7;font-family:monospace;font-size:8px;font-weight:700;pointer-events:none">${escapeXml(String(name))}</text>`;
    };
    const bottomEnd = g.B_half - g.R_B;
    profiles.bottomShell.forEach(p => {
      if (!p.posName) return;
      if (p.y > g.duct_half && p.y < bottomEnd) drawPosLabel(X(p.y), BASELINE_Y, p.posName, 'vertical');
    });
    profiles.innerBottom.forEach(p => {
      if (!p.posName) return;
      if (p.y > g.duct_half && p.y < g.B_half) drawPosLabel(X(p.y), svgIB, p.posName, 'vertical');
    });
    profiles.stringer.forEach(plate => {
      if (plate.z <= g.IB || plate.z >= g.UD) return;
      profiles.stringerStiff.forEach(p => {
        if (!p.posName) return;
        if (p.y > g.IS && p.y < g.B_half) drawPosLabel(X(p.y), Y(plate.z), p.posName, 'vertical');
      });
    });
    profiles.tweenDeck.forEach(plate => {
      if (plate.z <= g.IB || plate.z >= g.UD) return;
      profiles.tweenStiff.forEach(p => {
        if (!p.posName) return;
        if (p.y > g.IS && p.y < g.B_half) drawPosLabel(X(p.y), Y(plate.z), p.posName, 'vertical');
      });
    });
    if (PARAMS.coamingTop > 0) {
      const coamEndY = g.IS + PARAMS.coamingTop;
      profiles.coamingStiff.forEach(p => {
        if (!p.posName) return;
        if (p.y > g.IS && p.y < coamEndY) drawPosLabel(X(p.y), Y(g.HC), p.posName, 'vertical');
      });
    }
    profiles.sideShell.forEach(p => {
      if (!p.posName) return;
      if (p.z <= g.IB || p.z >= g.UD) return;
      drawPosLabel(svgShell, Y(p.z), p.posName, 'horizontal');
    });
    profiles.innerSide.forEach(p => {
      if (!p.posName) return;
      if (p.z <= g.IB || p.z >= g.HC) return;
      drawPosLabel(svgIS, Y(p.z), p.posName, 'horizontal');
    });
    profiles.upperDeck.forEach(p => {
      if (!p.posName) return;
      if (p.y > g.IS && p.y < g.B_half) drawPosLabel(X(p.y), svgUD, p.posName, 'vertical');
    });
  }

  // === NODES (nodes mode shows labels + line elements; compartment/transverse mode shows only dots for picking) ===
  if (VIEW_MODE === 'nodes' || VIEW_MODE === 'compartment' || VIEW_MODE === 'transverse') {
    // Already computed above if compartment mode; otherwise compute now.
    if (VIEW_MODE !== 'compartment') computeNodes();
    html += drawNodesOverlay(VIEW_MODE === 'nodes');
  }

  // === TRANSVERSE STIFFS + BRACKETS ===
  // Shown in 'transverse' and 'general' views. Compute nodes if not yet computed.
  if (VIEW_MODE === 'transverse' || VIEW_MODE === 'general') {
    if (NODES_CACHE.length === 0 || VIEW_MODE === 'general') computeNodes();

    // Brackets (polygons) — drawn FIRST so stiffs render on top
    // When user is actively picking nodes (TRANSVERSE_PICK set), disable
    // pointer-events on bracket/stiff polygons so they don't intercept node
    // clicks. Otherwise the polygon's large fill area can swallow clicks
    // intended for the small (~22 px) node hit-circles sitting on its edges.
    const _disablePolyClicks = !!(TRANSVERSE_PICK || COMPARTMENT_PICK || COMPARTMENT_NODE_PICK_SLOT);
    const _peAttr = _disablePolyClicks ? ' pointer-events="none"' : '';
    BRACKETS.forEach((b, i) => {
      const isSel = SELECTED_BRACKET != null && SELECTED_BRACKET === i;
      const resolvedNodes = b.nodes.map(id => NODES_CACHE.find(n => n.id === id)).filter(Boolean);
      if (resolvedNodes.length < 3) return;
      const fill = b.kind === 'floor' ? '#8b5cf6' : '#a855f7';

      // Build path: use quarter-arc for segments that cross the bilge,
      // straight line for all other segments. Closed shape (Z command).
      const g2 = GEOMETRY;
      const bilgeStartY = g2.B_half - g2.R_B;
      const isBilgeStart = (n) => Math.abs(n.realY - bilgeStartY) < 5 && n.realZ === 0;
      const isBilgeEnd   = (n) => Math.abs(n.realY - g2.B_half) < 5 && Math.abs(n.realZ - g2.R_B) < 5;

      let d = `M ${resolvedNodes[0].x},${resolvedNodes[0].y}`;
      for (let k = 1; k <= resolvedNodes.length; k++) {
        const from = resolvedNodes[k - 1];
        const to   = resolvedNodes[k % resolvedNodes.length];
        // Detect bilge segment in either direction
        const crossesBilge = (isBilgeStart(from) && isBilgeEnd(to)) || (isBilgeEnd(from) && isBilgeStart(to));
        if (crossesBilge) {
          // Quarter-arc of radius R_B, curving outward (away from CL)
          // sweep-flag: 1 if going from bilge-start (bottom) to bilge-end (side) = sweeps counterclockwise in user coords
          // In SVG Y-down, we need the opposite; curve should bulge toward increasing X
          const rSvg = Math.abs(X(g2.B_half) - X(g2.B_half - g2.R_B));  // radius in SVG units
          const sweep = isBilgeStart(from) ? 0 : 1;
          d += ` A ${rSvg},${rSvg} 0 0 ${sweep} ${to.x},${to.y}`;
        } else {
          d += ` L ${to.x},${to.y}`;
        }
      }
      d += ' Z';

      html += `<path d="${d}" fill="${fill}" fill-opacity="${isSel ? 0.45 : 0.22}" stroke="${fill}" stroke-width="${isSel ? 2.5 : 1.5}" style="cursor:pointer" data-bracket-idx="${i}"${_peAttr}/>`;
      // No in-drawing bracket name — shown in legend/inspector only
    });

    // Transverse stiffeners — drawn as RECTANGLES whose width is the
    // web height (e.g. FB 120x10 → 120 mm wide rectangle along the stiff axis).
    // The rectangle extends perpendicular to the line connecting n1↔n2,
    // OFFSET INWARD (toward the centreline / hull interior) so it overlaps
    // the plate-side view rather than the cargo space.
    //
    // The 'size' field uses the convention "<webHeight>x<webThickness>" in mm.
    // We parse the first number as web height; if missing, fall back to 100 mm.
    TRANSVERSE_STIFFS.forEach((s, i) => {
      const n1 = NODES_CACHE.find(n => n.id === s.n1);
      const n2 = NODES_CACHE.find(n => n.id === s.n2);
      if (!n1 || !n2) return;
      const isSel = SELECTED_TRANSVERSE != null && SELECTED_TRANSVERSE === i;
      const col = '#ec4899';   // pink — easy to distinguish from longitudinals

      // Parse web height (mm). Prefer the canonical profileName ("FB 120x10",
      // "L 75x50x6", "HP 60x4"); the FIRST number after the family is always
      // the web height. Fall back to legacy `size` field if profileName missing.
      const profStr = String(s.profileName || s.size || '120x10');
      const sizeMatch = profStr.match(/(\d+)/);
      const webH_mm = sizeMatch ? parseFloat(sizeMatch[1]) : 100;
      // Convert to SVG units using the same scale as everything else
      // X(0) is the SVG x of Y=0; X(webH_mm)-X(0) gives the width in SVG units.
      const webH_svg = Math.abs(X(webH_mm) - X(0));

      // Direction vector along the stiff
      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const len = Math.hypot(dx, dy) || 1;
      // Unit perpendicular vector. The stiff sits on the structural element
      // (Duct wall, side girder, etc.). The web sticks out perpendicular to
      // the element. For a vertical stiff (n1.x ≈ n2.x), dx≈0 → perp is
      // horizontal. We choose the side toward CL (negative X) so the web
      // shows on the cargo-space side of the structural element.
      let perpX = -dy / len;
      let perpY =  dx / len;
      // Bias toward CL: if perpX > 0 (pointing away from CL), flip
      if (perpX > 0) { perpX = -perpX; perpY = -perpY; }

      const off = webH_svg;
      // Rectangle corners (n1 → n2 → n2+perp·off → n1+perp·off)
      const p1 = { x: n1.x,           y: n1.y           };
      const p2 = { x: n2.x,           y: n2.y           };
      const p3 = { x: n2.x + perpX*off, y: n2.y + perpY*off };
      const p4 = { x: n1.x + perpX*off, y: n1.y + perpY*off };

      const fillOp = isSel ? 0.50 : 0.30;
      const strokeW = isSel ? 2.5 : 1.4;
      // Polygon fill + stroke — clickable for selection (unless picking nodes)
      html += `<polygon points="${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}" fill="${col}" fill-opacity="${fillOp}" stroke="${col}" stroke-width="${strokeW}" style="cursor:pointer" data-transverse-idx="${i}"${_peAttr}/>`;
    });
  }

  // Picked-node highlight (during compartment-by-nodes creation)
  if (COMPARTMENT_PICK && COMPARTMENT_PICK.picks.length > 0 && VIEW_MODE === 'compartment') {
    COMPARTMENT_PICK.picks.forEach((id, idx) => {
      const node = NODES_CACHE.find(n => n.id === id);
      if (!node) return;
      html += `<circle cx="${node.x}" cy="${node.y}" r="11" fill="none" stroke="#22c55e" stroke-width="2.5"/>`;
      html += `<text x="${node.x}" y="${node.y + 2}" text-anchor="middle" style="fill:#22c55e;font-family:monospace;font-size:9px;font-weight:700;paint-order:stroke;stroke:#0f172a;stroke-width:2">${idx+1}</text>`;
    });
  }

  // Picked-node highlight (during transverse element creation)
  if (TRANSVERSE_PICK && TRANSVERSE_PICK.picks.length > 0 && VIEW_MODE === 'transverse') {
    TRANSVERSE_PICK.picks.forEach((id, idx) => {
      const node = NODES_CACHE.find(n => n.id === id);
      if (!node) return;
      html += `<circle cx="${node.x}" cy="${node.y}" r="11" fill="none" stroke="#ec4899" stroke-width="2.5"/>`;
      html += `<text x="${node.x}" y="${node.y + 2}" text-anchor="middle" style="fill:#ec4899;font-family:monospace;font-size:9px;font-weight:700;paint-order:stroke;stroke:#0f172a;stroke-width:2">${idx+1}</text>`;
    });
    // Pick-mode banner at the top of the SVG. For brackets with ≥3 nodes,
    // the banner doubles as a clickable "Done" button. For 1–2 nodes, it
    // shows a guidance hint.
    const n = TRANSVERSE_PICK.picks.length;
    const isBr = TRANSVERSE_PICK.kind === 'bracket';
    const needMin = isBr ? 3 : 2;
    const ready = n >= needMin;
    const bannerY = 20;
    const bannerW = 360;
    const bannerH = 38;
    const bannerX = 30;
    const bannerColor = ready ? '#22c55e' : '#ec4899';
    const bgColor = ready ? 'rgba(34,197,94,0.18)' : 'rgba(236,72,153,0.18)';
    const labelText = isBr
      ? (ready ? `✓ ${n} nodes — click here or press Enter to FINISH bracket` : `Picking bracket… ${n}/${needMin}+ nodes — click ${needMin - n} more node${needMin - n > 1 ? 's' : ''}`)
      : (ready ? `✓ Stiff complete (${n}/2) — auto-saved` : `Picking stiff… ${n}/2 nodes`);
    // Container rect: clickable when ready (for bracket commit)
    const clickAttr = (ready && isBr) ? ' style="cursor:pointer" data-pick-banner="done"' : '';
    html += `<g pointer-events="${(ready && isBr) ? 'all' : 'none'}"${clickAttr ? ' ' + clickAttr.replace('style=', 'data-pick-style=') : ''}>
      <rect x="${bannerX}" y="${bannerY}" width="${bannerW}" height="${bannerH}" rx="6" fill="${bgColor}" stroke="${bannerColor}" stroke-width="2"${clickAttr}/>
      <text x="${bannerX + bannerW/2}" y="${bannerY + bannerH/2 + 4}" text-anchor="middle" style="fill:${bannerColor};font-family:Inter,sans-serif;font-size:13px;font-weight:600;pointer-events:none">${labelText}</text>
    </g>`;
  }


  // =====================================================================
  // LEGEND — rendered as HTML panel next to the SVG (no longer inside SVG).
  // Drawing stays clean. Legend has its own scroll if tall.
  // =====================================================================
  renderHTMLLegend();

  // === NEUTRAL AXIS (horizontal dashed line at NA height) ===
  // Computed from current section properties. Shown in all view modes.
  // Label at right side just inside shell, small and unobtrusive.
  try {
    const sp_for_na = computeSectionProperties();
    if (sp_for_na && isFinite(sp_for_na.NA) && sp_for_na.NA > 0 && sp_for_na.NA < g.HC) {
      const naY = Y(sp_for_na.NA);
      // Line spans from just outside CL to just past shell, so it reads clearly
      const naColor = '#60a5fa';   // soft blue
      html += `<line x1="-40" y1="${naY}" x2="${X(g.B_half) + 80}" y2="${naY}" stroke="${naColor}" stroke-width="1.1" stroke-dasharray="8,4" fill="none" opacity="0.85" pointer-events="none"/>`;
      // Label on the right side
      html += `<text x="${X(g.B_half) + 85}" y="${naY + 3}" style="fill:${naColor};font-family:monospace;font-size:9px;font-weight:600;pointer-events:none;paint-order:stroke;stroke:#0f172a;stroke-width:2">NA · ${Math.round(sp_for_na.NA)}</text>`;
    }
  } catch (e) { /* safe no-op if section compute not ready */ }

  // Wrap all drawing content in a <g>. If MIRROR_BODY is enabled, also emit
  // a mirrored copy (reflected across CL = x=0). All text in the mirrored copy
  // is hidden to avoid reversed / duplicated labels. Pointer events disabled
  // so clicks only target the primary side. The viewBox itself is managed by
  // the zoom system (applyView) — mirror toggle triggers an applyView call.
  // Append stiff hit areas AT THE VERY END so they render on top of strake
  // and plate hit areas — clicking a stiff opens the stiff inspector, not
  // the underlying plate/strake. Without this, clicks on the IS/UD/coaming
  // edge were being swallowed by strake hit areas.
  html += stiffHits;

  // Measure Tool overlay (snap marker + dimension line)
  html += drawMeasureOverlay();

  // ──────────────────────────────────────────────────────────────────
  // SUBMODE OVERLAY — Hull Girder / Buckling FAIL highlights for whole plates
  // Only in analysis mode, when submode is HG or buckling (or overall).
  // Draws red pulsing stroke over plates that fail the corresponding check.
  // ──────────────────────────────────────────────────────────────────
  if (submode && window.Buckling && window.runLongStrengthAnalysis) {
    try {
      const p = (typeof getParams === 'function') ? getParams() : null;
      const ls = p ? window.runLongStrengthAnalysis() : null;
      if (ls && ls.section && ls.section.I_NA) {
        const M_max = Math.max(
          Math.abs(ls.M_total_hog),
          Math.abs(ls.M_total_sag)
        );
        const z_NA = ls.section.z_NA;
        const I_NA = ls.section.I_NA;
        const sigma_perm = ls.sigma_amid;
        const sigmaAt = z_m => Math.abs(M_max * (z_m - z_NA) / I_NA) * 1e-3;

        const failStroke = (x1, y1, x2, y2, label) => {
          return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#ef4444" stroke-width="5" opacity="0.75" pointer-events="none" stroke-linecap="round">
            <animate attributeName="opacity" values="0.75;0.35;0.75" dur="1.6s" repeatCount="indefinite"/>
          </line>`;
        };

        const overlays = [];

        // ── Unified UC gradient for overall / hullgirder / buckling / local ──
        // All four submodes use the same green→yellow→red gradient scale.
        // The only difference is which UC value is plotted:
        //   overall    → max(HG ratio, Buckling UC, Local ratio)
        //   hullgirder → HG ratio (σ_hg / σ_perm)
        //   buckling   → max(Buckling UC_comp, UC_shear)
        //   local      → t_req / t_have (if available) else HG ratio as fallback
        if (submode && window.Buckling) {
          const B = window.Buckling;
          const kL = p.kL || 0.72;
          const material = p.material || 'AH36';
          const S_m = 2.1;
          const z_deck_m = g.UD / 1000;

          // Component UC calculators
          const hgUC = (z_m) => Math.abs(sigmaAt(z_m)) / sigma_perm;
          // Real hull girder shear flow τ = F·Q / (I·t·1000)
          // Qwo from ls (wave shear, kN). Falls back to 30/kL (LR Sec 7.4.2 floor).
          const Qwo_kN = ls.Qwo || (ls.F && ls.F.Qwo) || null;
          const realTauA = (z_m, t_mm) => {
            try {
              if (Qwo_kN != null && typeof window.computeShearFirstMoment === 'function') {
                const Q_m3 = window.computeShearFirstMoment(z_m);
                if (Q_m3 > 0) {
                  const F_N = Qwo_kN * 1000;
                  const tau_real = (F_N * Q_m3) / (I_NA * t_mm * 1000);
                  return Math.max(Math.abs(tau_real), 30 / kL);
                }
              }
            } catch(e) {}
            return B.tauADesignInitial(kL);
          };
          const bkUC = (t_mm, z_m, corrosion) => {
            try {
              const z_face = (z_m >= z_NA) ? (z_deck_m - z_NA) : z_NA;
              if (z_face <= 0) return 0;
              const sigma_face = Math.abs(M_max * z_face / I_NA) * 1e-3;
              const sigma_A = B.sigmaADesign(sigma_face, Math.abs(z_m - z_NA), z_face, kL);
              const tau_A = realTauA(z_m, t_mm);
              const r = B.checkPlate({
                s_mm: 700, t_mm, S_m, sigma_A, tau_A,
                stiffening: 'LONGITUDINAL', corrosion, material
              });
              return Math.max(r.UC_comp || 0, r.UC_shear || 0);
            } catch (e) { return 0; }
          };

          // Dispatcher: returns UC for the current submode
          const ucFor = (t_mm, z_m, corrosion, localRatio) => {
            if (submode === 'hullgirder') return hgUC(z_m);
            if (submode === 'buckling')   return bkUC(t_mm, z_m, corrosion);
            if (submode === 'local')      return localRatio || hgUC(z_m);
            // overall (default)
            return Math.max(hgUC(z_m), bkUC(t_mm, z_m, corrosion), localRatio || 0);
          };

          const ucStroke = (x1, y1, x2, y2, uc) => {
            const c = colorForUC(uc);
            const sw = uc > 1.0 ? 6 : 4;
            return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${c}" stroke-width="${sw}" opacity="0.85" pointer-events="none"/>`;
          };

          // Local ratios: for IS strakes, use t_req/t_have from calcInnerSide if available
          const localRatios_IS = [];
          if (submode === 'local' || submode === 'overall') {
            try {
              if (typeof calcInnerSide === 'function') {
                const is = calcInnerSide();
                is.strakes.forEach((s, i) => {
                  const t_as = (STRAKES.innerSide[i]?.thickness) || 11;
                  localRatios_IS[i] = s.t / t_as;
                });
              }
            } catch(e) {}
          }

          // ─── Paint each plate/strake with UC color ───
          // Upper Deck
          overlays.push(ucStroke(svgIS, svgUD, svgShell, svgUD,
            ucFor(PLATE_THICKNESS.upperDeck || 14, g.UD/1000, 'ONE_WB_VERT')));
          // Coaming top
          if (PARAMS.coamingTop > 0) {
            const topEndX = X(g.IS + PARAMS.coamingTop);
            overlays.push(ucStroke(svgIS, svgHC, topEndX, svgHC,
              ucFor(PLATE_THICKNESS.coaming || 20, g.HC/1000, 'ONE_WB_VERT')));
          }
          // Stringer
          profiles.stringer.forEach(st => {
            if (st.z <= g.IB || st.z >= g.UD) return;
            overlays.push(ucStroke(svgIS, Y(st.z), svgShell, Y(st.z),
              ucFor(PLATE_THICKNESS.stringer || 10, st.z/1000, 'DRY_BULK')));
          });
          // Tween
          profiles.tweenDeck.forEach(st => {
            if (st.z <= g.IB || st.z >= g.UD) return;
            overlays.push(ucStroke(svgIS, Y(st.z), svgShell, Y(st.z),
              ucFor(PLATE_THICKNESS.tween || 10, st.z/1000, 'DRY_BULK')));
          });
          // Inner Side strakes (per strake — uses its own thickness + z)
          if (STRAKES.innerSide && STRAKES.innerSide.length) {
            let cursor = g.IB;
            STRAKES.innerSide.forEach((s, i) => {
              const isCoamingWall = s.kind === 'coamingWall';
              const isOutboard = isCoamingWall && s.side === 'outboard';
              let x_pos, y1, y2, z_mid;
              if (isOutboard) {
                x_pos = X(g.IS + PARAMS.coamingTop);
                y1 = Y(g.UD);
                y2 = Y(g.HC);
                z_mid = (g.UD + 525) / 1000;
              } else {
                x_pos = svgIS;
                y1 = Y(cursor);
                y2 = Y(cursor + s.width);
                z_mid = (cursor + s.width/2) / 1000;
              }
              const corr = isCoamingWall ? 'ONE_WB_VERT' : 'DRY_BULK';
              const uc = ucFor(s.thickness, z_mid, corr, localRatios_IS[i]);
              overlays.push(ucStroke(x_pos, y1, x_pos, y2, uc));
              if (!isOutboard) cursor += s.width;
            });
          }
          // Shell side strakes
          if (STRAKES.shell && STRAKES.shell.length) {
            try {
              const L = shellGeometryLengths();
              let cursor = 0;
              STRAKES.shell.forEach(s => {
                if (s.kind === 'side') {
                  const z_mid_along = cursor + s.width/2;
                  const z_from_bl = g.R_B + Math.max(0, z_mid_along - (L.keel + L.bottom + L.bilge));
                  const p1 = shellPathPointAt(Math.min(cursor, L.total - 0.01));
                  const p2 = shellPathPointAt(Math.min(cursor + s.width, L.total - 0.01));
                  overlays.push(ucStroke(p1.x, p1.y, p2.x, p2.y,
                    ucFor(s.thickness, z_from_bl/1000, 'ONE_WB_VERT')));
                }
                cursor += s.width;
              });
            } catch(e) {}
          }
          // Bottom + Keel (z = 0, HG may matter if below NA)
          if (STRAKES.shell && STRAKES.shell.length) {
            try {
              const L = shellGeometryLengths();
              let cursor = 0;
              STRAKES.shell.forEach(s => {
                if (s.kind === 'keel' || s.kind === 'bottom' || s.kind === 'bilge') {
                  const p1 = shellPathPointAt(Math.min(cursor, L.total - 0.01));
                  const p2 = shellPathPointAt(Math.min(cursor + s.width, L.total - 0.01));
                  const z_m = s.kind === 'bilge' ? g.R_B/2000 : 0;
                  overlays.push(ucStroke(p1.x, p1.y, p2.x, p2.y,
                    ucFor(s.thickness, z_m, 'TWO_WB_HORIZ')));
                }
                cursor += s.width;
              });
            } catch(e) {}
          }
          // Inner Bottom strakes
          if (STRAKES.innerBottom && STRAKES.innerBottom.length) {
            let cursor = 0;
            STRAKES.innerBottom.forEach(s => {
              const x1 = X(cursor);
              const x2 = X(cursor + s.width);
              overlays.push(ucStroke(x1, svgIB, x2, svgIB,
                ucFor(s.thickness, g.IB/1000, 'TWO_WB_HORIZ')));
              cursor += s.width;
            });
          }
          // ─── DB internals (v80): duct wall + side girders + centre girder ───
          // Vertical plates in the double bottom — rule mins from Pt 4 Ch 1 Sec 8
          // but Sec 8.3.10 / 8.4.6 explicitly require the buckling check of
          // Pt 3 Ch 4 Sec 7 to also be satisfied. Without painting these in
          // the buckling/HG view, the overlay misses the entire DB box.
          // Centroid z of each vertical plate = IB/2 (mid-height).
          {
            const z_db_mid = (g.IB / 2) / 1000;
            // Duct wall (CL-side) — only when duct keel config is selected
            if (g.duct_half > 0 && PLATE_THICKNESS.duct) {
              overlays.push(ucStroke(svgDuct, Y(0), svgDuct, svgIB,
                ucFor(PLATE_THICKNESS.duct, z_db_mid, 'TWO_WB_HORIZ')));
            }
            // Centre girder (Y=0) — only when no duct keel
            if (g.duct_half === 0) {
              const t_cg_overlay = parseFloat(document.getElementById('cgT')?.value || '12');
              if (isFinite(t_cg_overlay) && t_cg_overlay > 0) {
                overlays.push(ucStroke(X(0), Y(0), X(0), svgIB,
                  ucFor(t_cg_overlay, z_db_mid, 'TWO_WB_HORIZ')));
              }
            }
            // Side girders — each at its own y (per-strake when defined)
            // v84: intercostal-aware s_panel (boyuna stiff sayısına göre)
            //      ve doğru korozyon kategorisi (vertical plate → ONE_WB_VERT)
            if (Array.isArray(SIDE_GIRDERS)) {
              const _wf_mm_ov = (PARAMS.le && PARAMS.le > 0) ? PARAMS.le * 1000 : 1452;
              SIDE_GIRDERS.forEach((sg, i) => {
                if (!sg || !isFinite(sg.y)) return;
                if (sg.y <= (g.duct_half || 0)) return;
                if (sg.y >= g.B_half - g.R_B) return;
                const sgKey = 'sideGirder' + i;
                // Boyuna intercostal stiff sayısı bu girder için
                const _sgLongs_ov = (profiles && profiles[sgKey]) ? profiles[sgKey] : [];
                const _N_ov = _sgLongs_ov.length;
                const _s_vert_ov = g.IB / (_N_ov + 1);
                const _s_horiz_ov = _wf_mm_ov;   // full web (no vert stiff)
                const _s_panel_ov = Math.min(_s_vert_ov, _s_horiz_ov);
                // Side girder = vertical plate, one side = DB tank → ONE_WB_VERT
                const _corr_sg = 'ONE_WB_VERT';
                // ucFor uses sabit s=700 → custom buckling here:
                const _t_sg_ov = PLATE_THICKNESS.sideGirder || 10;
                const _bkUC_sg = (() => {
                  try {
                    const z_face_ov = (z_db_mid >= z_NA) ? (z_deck_m - z_NA) : z_NA;
                    if (z_face_ov <= 0) return 0;
                    const sigma_face_ov = Math.abs(M_max * z_face_ov / I_NA) * 1e-3;
                    const sigma_A_ov = B.sigmaADesign(sigma_face_ov, Math.abs(z_db_mid - z_NA), z_face_ov, kL);
                    const tau_A_ov = realTauA(z_db_mid, _t_sg_ov);
                    const r = B.checkPlate({
                      s_mm: _s_panel_ov, t_mm: _t_sg_ov, S_m,
                      sigma_A: sigma_A_ov, tau_A: tau_A_ov,
                      stiffening: 'LONGITUDINAL', corrosion: _corr_sg, material
                    });
                    return Math.max(r.UC_comp || 0, r.UC_shear || 0);
                  } catch(e) { return 0; }
                })();
                const _hgUC_sg = hgUC(z_db_mid);
                const _uc_sg = (submode === 'hullgirder') ? _hgUC_sg
                              : (submode === 'buckling') ? _bkUC_sg
                              : Math.max(_hgUC_sg, _bkUC_sg);
                overlays.push(ucStroke(X(sg.y), Y(0), X(sg.y), svgIB, _uc_sg));
              });
            }
          }
        }

        // Flush overlay paint buffer into main html
        html += overlays.join('');
      }
    } catch (e) { /* silent */ }
  }

  if (MIRROR_BODY) {
    svg.innerHTML =
      `<g>${html}</g>` +
      `<g class="mirror-reflection" transform="scale(-1,1)" style="pointer-events:none">${html}</g>`;
  } else {
    svg.innerHTML = html;
  }

  // Event delegation on SVG root using elementsFromPoint (more reliable than e.target)
  if (!svg._strakeClickBound) {
    svg._strakeClickBound = true;

    // Helper: set active view mode + update pill UI
    const setViewMode = (mode) => {
      const ANALYSIS_SUBMODES = ['overall','local','hullgirder','buckling'];
      const isAnalysisSub = ANALYSIS_SUBMODES.includes(mode);
      // For analysis submodes, skip the early-return so ANALYSIS_SUBMODE always
      // updates and overlays re-render even if VIEW_MODE didn't change.
      if (VIEW_MODE === mode && !isAnalysisSub) return;
      const prevMode = VIEW_MODE;
      VIEW_MODE = mode;
      document.querySelectorAll('.view-pill').forEach(b => {
        b.classList.toggle('active', b.dataset.viewmode === mode);
      });
      if (isAnalysisSub) {
        window.ANALYSIS_SUBMODE = mode;
      }
      // Measure mode: reset state, set crosshair cursor, show help
      if (mode === 'measure') {
        MEASURE.p1 = null; MEASURE.p2 = null; MEASURE.hover = null;
        if (svg) svg.style.cursor = 'crosshair';
        const help = document.getElementById('modeHelp');
        if (help) help.textContent = 'Measure: click two points to show distance. Hover to snap. Escape to clear.';
      } else if (prevMode === 'measure') {
        // Leaving measure mode — clean up
        MEASURE.p1 = null; MEASURE.p2 = null; MEASURE.hover = null;
        if (svg) svg.style.cursor = '';
        const help = document.getElementById('modeHelp');
        if (help && !window.ANALYSIS_MODE) help.textContent = 'Review geometry only. Click "Run Analysis" to check LR rule compliance.';
      }
      render();
    };
    // Expose so toggleAnalysisMode can call it
    window.Draw = window.Draw || {};
    window.Draw.setViewMode = setViewMode;

    // Bind view-pill click handler (draw + analysis)
    document.querySelectorAll('.view-pill').forEach(pill => {
      if (pill._clickBound) return;
      pill._clickBound = true;
      pill.addEventListener('click', () => {
        const mode = pill.dataset.viewmode;
        if (mode) setViewMode(mode);
      });
    });

    // Bind sidebar tab handler
    document.querySelectorAll('.sb-tab').forEach(tab => {
      if (tab._clickBound) return;
      tab._clickBound = true;
      tab.addEventListener('click', () => {
        const name = tab.dataset.sbtab;
        document.querySelectorAll('.sb-tab').forEach(t => t.classList.toggle('active', t === tab));
        document.querySelectorAll('.sb-pane').forEach(p => p.classList.toggle('active', p.dataset.sbpane === name));
      });
    });

    // Context-aware mode switching based on what was clicked.
    // Rule: only GENERAL view auto-switches to a more specific mode.
    // Other modes stay put (user is already focused there) and just select.
    const onStrakeClick = (plate, idx) => {
      const toggle = SELECTED_STRAKE && SELECTED_STRAKE.plate === plate && SELECTED_STRAKE.index === idx;
      if (toggle) {
        SELECTED_STRAKE = null;
      } else {
        SELECTED_STRAKE = { plate, index: idx };
        SELECTED_WHOLE_PLATE = null;
        SELECTED_STIFF = null;
        SELECTED_NODE = null;
        // Auto-switch: general → thickness (strakes edit thickness by default)
        if (VIEW_MODE === 'general') setViewMode('thickness');
      }
      render();
      // Sync editor panel: switch to STRAKES tab and scroll to the clicked row
      // so the geometry-view click feels tied to the editor. Fires on selection
      // only (not on toggle-off).
      if (SELECTED_STRAKE) {
        focusEditorRow('strake', plate, idx);
      }
      // ANALYSIS MODE: show inspection panel
      if (window.ANALYSIS_MODE && window.showElemInspect && SELECTED_STRAKE) {
        const strake = STRAKES[plate] && STRAKES[plate][idx];
        // Faz 4: pure POSITION_RULES routing. The registry covers every
        // mainstream plate group; only db-* (duct, centre girder) and
        // plate-sidegirder fall outside (they're detail elements without
        // a registry entry) — those still need the small fallback.
        let t = null;
        if (typeof window.resolveCodeForPlateGroup === 'function') {
          const code = window.resolveCodeForPlateGroup(plate, strake?.kind);
          const rule = code ? window.POSITION_RULES[code] : null;
          if (rule && rule.plateElemType) t = rule.plateElemType;
        }
        // Edge cases not in POSITION_RULES (detail elements):
        if (!t) {
          if (/^sideGirder\d+$/.test(plate))   t = 'plate-sidegirder';
          else if (plate === 'duct')           t = 'plate-duct';
          else                                  t = 'plate-bottom';   // safety net
        }

        // Validation still runs (Faz 2) — catches drift if registry ever changes
        if (typeof window.validatePlateRouting === 'function') {
          try { window.validatePlateRouting(t, plate, strake?.kind); } catch(_) {}
        }

        // Pass the strake's own spacing so inspection recomputes with strake-local s
        // Also pass plateKey so the inspector can distinguish coamingWall vs
        // coamingTop (both share elemType 'plate-coaming' but show different titles).
        window.showElemInspect(t, { 
          strakeIdx: idx,
          strakeId:  strake?.id,
          strakeName:strake?.name,
          strakeSpacing: strake?.spacing_mm,
          strakeThickness: strake?.thickness,
          strakeWidth: strake?.width,
          strakeKind: strake?.kind,
          plateKey: plate     // <-- needed by plate-coaming wall/top split
        });
      }
    };

    const onStiffClick = (group, idx, plateZ) => {
      const toggle = SELECTED_STIFF && SELECTED_STIFF.group === group && SELECTED_STIFF.index === idx;
      if (toggle) {
        SELECTED_STIFF = null;
      } else {
        SELECTED_STIFF = { group, index: idx, plateZ: plateZ };
        SELECTED_STRAKE = null;
        SELECTED_WHOLE_PLATE = null;
        SELECTED_NODE = null;
        // Auto-switch: general → profile (stiffs edit profile type by default)
        if (VIEW_MODE === 'general') setViewMode('profile');
      }
      // Sync selection to global scope so the top-bar "Optimize Stiff" button
      // can enable/disable + know which stiff to target.
      window.SELECTED_STIFF = SELECTED_STIFF;
      if (typeof window._updateOptimizeStiffBtn === 'function') window._updateOptimizeStiffBtn();
      render();
      // Sync editor panel: switch to PROF tab and scroll to the clicked stiff's
      // row. Toggle-off does nothing.
      if (SELECTED_STIFF) {
        focusEditorRow('stiff', group, idx);
      }
      // ANALYSIS MODE: show inspection panel
      if (window.ANALYSIS_MODE && window.showElemInspect && SELECTED_STIFF) {
        // Faz 4: pure POSITION_RULES routing
        let t = null;
        if (typeof window.resolveCodeForLongGroup === 'function') {
          const code = window.resolveCodeForLongGroup(group);
          const rule = code ? window.POSITION_RULES[code] : null;
          if (rule && rule.longElemType) t = rule.longElemType;
        }
        // Safety net for unexpected group keys
        if (!t) t = 'long-bottom';

        // Validation still runs (Faz 2)
        if (typeof window.validateStiffRouting === 'function') {
          try { window.validateStiffRouting(t, group); } catch(_) {}
        }
        // Get z for inspection panel. For vertical members (side/IS longs) z comes
        // from profile.z; for horizontal plates (stringer/tween/UD/coaming stiffs)
        // z is the plate level.
        let z_m = 5;
        if (profiles[group] && profiles[group][idx]) {
          const prof = profiles[group][idx];
          if (prof.z != null) {
            z_m = prof.z / 1000;
          } else if (group === 'coamingStiff') {
            z_m = GEOMETRY.HC / 1000;   // coaming stiffeners sit on HC-level plate
          } else if (group === 'upperDeck') {
            z_m = GEOMETRY.UD / 1000;
          } else if (group === 'stringerStiff' || group === 'tweenStiff') {
            // Linked plates: same stiff idx renders on every plate. If the
            // click handler supplied plateZ (from the rect's data-plate-z),
            // use that exact plate; else fall back to the first plate's z.
            if (plateZ != null && isFinite(plateZ)) {
              z_m = plateZ / 1000;
            } else {
              const plateArr = group === 'stringerStiff' ? profiles.stringer : profiles.tweenDeck;
              if (plateArr && plateArr[0] && plateArr[0].z != null) z_m = plateArr[0].z / 1000;
            }
          }
        }
        window.showElemInspect(t, { index: idx, group, z_m, plateZ });
      }
    };

    const onWholePlateClick = (key) => {
      if (SELECTED_WHOLE_PLATE === key) {
        SELECTED_WHOLE_PLATE = null;
      } else {
        SELECTED_WHOLE_PLATE = key;
        SELECTED_STRAKE = null;
        SELECTED_STIFF = null;
        SELECTED_NODE = null;
        if (VIEW_MODE === 'general') setViewMode('thickness');
      }
      render();

      // ─── Focus Profile Editor's matching strake panel ────────────────
      // Map a whole-plate key coming from the SVG onto the STRAKES group
      // key used by the editor. Fall through with no-op if the click was
      // on something that doesn't have a strake editor (e.g. duct wall).
      if (SELECTED_WHOLE_PLATE && typeof window.focusEditorRow === 'function') {
        const k = SELECTED_WHOLE_PLATE;
        let plateKey = null;
        if (k === 'upperDeck')        plateKey = 'upperDeck';
        else if (k === 'coaming' || k === 'coamingTop')  plateKey = 'coamingTop';
        else if (k === 'coamingWall') plateKey = 'coamingWall';
        else if (k === 'stringer')    plateKey = 'stringer0';
        else if (k === 'tween')       plateKey = 'tween0';
        else if (/^stringer\d+$/.test(k)) plateKey = k;
        else if (/^tween\d+$/.test(k))    plateKey = k;
        else if (/^sg(\d+)$/.test(k))     plateKey = 'sideGirder' + RegExp.$1;
        if (plateKey && STRAKES[plateKey] && STRAKES[plateKey].length > 0) {
          // Focus first strake of the panel (scrolls panel into view)
          window.focusEditorRow('strake', plateKey, 0);
        }
      }

      // ANALYSIS MODE: show inspection panel for whole plate
      if (window.ANALYSIS_MODE && window.showElemInspect && SELECTED_WHOLE_PLATE) {
        // Faz 4: pure POSITION_RULES routing
        // Map whole-plate key back to STRAKES group key for resolveCode.
        // Most are identical except: 'ib'→'innerBottom', 'coaming'→'coamingTop'
        const groupKey = key === 'ib' ? 'innerBottom'
                       : key === 'coaming' ? 'coamingTop'
                       : key;
        let t = null;
        if (typeof window.resolveCodeForPlateGroup === 'function') {
          const code = window.resolveCodeForPlateGroup(groupKey, null);
          const rule = code ? window.POSITION_RULES[code] : null;
          if (rule && rule.plateElemType) t = rule.plateElemType;
        }
        // Edge cases not in POSITION_RULES (detail elements)
        if (!t) {
          if (/^sg\d+$/.test(key))   t = 'plate-sidegirder';
          else if (key === 'duct')   t = 'plate-duct';
          else if (key === 'cg')     t = 'db-cg';
          else if (key === 'coamingEdge') t = 'plate-coaming';
        }

        // Validation still runs (Faz 2)
        if (t && typeof window.validatePlateRouting === 'function') {
          try { window.validatePlateRouting(t, groupKey, null); } catch(_) {}
        }
        if (t) window.showElemInspect(t, { plateKey: key });
      }
    };

    const onNodeClick = (id) => {
      // v25+: Single-slot compartment node edit. The user clicked an aim
      // button next to one node row of the inline editor; clicking any node
      // on the drawing now writes that ID into the armed slot and disarms.
      // v26: a slot of -1 is the sentinel for "append" — the inline editor
      // is now a single-line input, so the aim button just adds to the end.
      if (COMPARTMENT_NODE_PICK_SLOT) {
        const { compIdx, slot } = COMPARTMENT_NODE_PICK_SLOT;
        const c = COMPARTMENTS[compIdx];
        if (c) {
          // Normalise to nodes[] (mirrors the migration in _getCompNodes)
          if (!Array.isArray(c.nodes)) {
            c.nodes = [c.n1, c.n2, c.n3, c.n4].filter(v => v != null);
            delete c.n1; delete c.n2; delete c.n3; delete c.n4;
          }
          if (slot === -1) {
            // Append mode: add the new node at the end of the polygon.
            c.nodes.push(id);
          } else if (slot >= 0 && slot < c.nodes.length) {
            // Legacy per-slot replace mode.
            c.nodes[slot] = id;
          }
        }
        COMPARTMENT_NODE_PICK_SLOT = null;
        renderEditor();
        render();
        if (window.ANALYSIS_MODE && window.Bridge?.runRuleChecks) {
          try { window.Bridge.runRuleChecks(); } catch(e){}
        }
        return;
      }
      // In compartment mode with an active pick session — feed compartment picker
      if (VIEW_MODE === 'compartment' && COMPARTMENT_PICK) {
        handleCompartmentNodePick(id);
        return;
      }
      // In transverse mode with an active pick — feed transverse picker
      if (VIEW_MODE === 'transverse' && TRANSVERSE_PICK) {
        handleTransverseNodePick(id);
        return;
      }
      if (SELECTED_NODE && SELECTED_NODE.id === id) {
        SELECTED_NODE = null;
      } else {
        SELECTED_NODE = { id };
        SELECTED_STRAKE = null;
        SELECTED_WHOLE_PLATE = null;
        SELECTED_STIFF = null;
        SELECTED_TRANSVERSE = null;
        SELECTED_BRACKET = null;
        if (VIEW_MODE === 'general') setViewMode('nodes');
      }
      render();
    };

    const onTransverseClick = (idx) => {
      if (SELECTED_TRANSVERSE === idx) SELECTED_TRANSVERSE = null;
      else {
        SELECTED_TRANSVERSE = idx;
        SELECTED_BRACKET = null;
        SELECTED_STRAKE = null;
        SELECTED_STIFF = null;
        SELECTED_NODE = null;
        SELECTED_WHOLE_PLATE = null;
        if (VIEW_MODE === 'general') setViewMode('transverse');
      }
      render();
    };

    const onBracketClick = (idx) => {
      if (SELECTED_BRACKET === idx) SELECTED_BRACKET = null;
      else {
        SELECTED_BRACKET = idx;
        SELECTED_TRANSVERSE = null;
        SELECTED_STRAKE = null;
        SELECTED_STIFF = null;
        SELECTED_NODE = null;
        SELECTED_WHOLE_PLATE = null;
        if (VIEW_MODE === 'general') setViewMode('transverse');
      }
      render();
    };

    // ======================================================================
    // Context-menu helpers (scoped to render(), so they see profiles/GEOMETRY)
    // ======================================================================
    const hideDrawContextMenu = () => {
      const el = document.getElementById('drawContextMenu');
      if (el) el.style.display = 'none';
    };

    const showDrawContextMenu = (x, y, headerText, items) => {
      const menu = document.getElementById('drawContextMenu');
      if (!menu) return;
      document.getElementById('drawContextMenuHeader').textContent = headerText;
      const body = document.getElementById('drawContextMenuBody');
      body.innerHTML = '';
      items.forEach(it => {
        const btn = document.createElement('button');
        btn.style.cssText = `display:block;width:100%;text-align:left;padding:8px 12px;background:transparent;border:none;color:${it.color || 'var(--text-primary)'};cursor:pointer;font-family:inherit;font-size:inherit;transition:background 0.12s`;
        btn.onmouseover = () => { btn.style.background = 'var(--bg-tertiary)'; };
        btn.onmouseout = () => { btn.style.background = 'transparent'; };
        btn.textContent = it.label;
        btn.onclick = () => {
          hideDrawContextMenu();
          try { it.action(); } catch(err) { console.warn('context action:', err); }
        };
        body.appendChild(btn);
      });
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.style.display = 'block';
    };

    // "Add stiffener here" context menu for right-click on a plate/strake.
    // sp, si = plate key + strake index (or null for whole-plate).
    // wp = whole-plate key (e.g. 'upperDeck', 'stringer', 'tween', 'coaming').
    // y_mm, z_mm = cursor position in ship coords.
    const showAddStiffContextMenu = (x, y, sp, si, y_mm, z_mm, wp) => {
      // Decide which profile group matches this plate:
      //   shell strake (idx>0, kind=side)  → sideShell
      //   shell strake (bottom / bilge)    → bottomShell
      //   innerBottom strake               → innerBottom
      //   innerSide strake                 → innerSide
      //   upperDeck whole-plate            → upperDeck
      //   stringer whole-plate             → stringerStiff
      //   tween whole-plate                → tweenStiff
      //   coaming whole-plate              → coamingStiff
      let grpKey = null;
      let coord = null;
      let cursorValue = null;

      if (sp === 'shell' && si != null) {
        const s = STRAKES.shell[si];
        if (!s) return;
        if (s.kind === 'side') { grpKey = 'sideShell'; coord = 'z'; cursorValue = Math.round(z_mm); }
        else if (s.kind === 'keel' || s.kind === 'bottom' || s.kind === 'bilge') {
          grpKey = 'bottomShell'; coord = 'y'; cursorValue = Math.round(Math.abs(y_mm));
        }
      } else if (sp === 'innerBottom') {
        grpKey = 'innerBottom'; coord = 'y'; cursorValue = Math.round(Math.abs(y_mm));
      } else if (sp === 'innerSide') {
        grpKey = 'innerSide'; coord = 'z'; cursorValue = Math.round(z_mm);
      } else if (wp) {
        const wpMap = {
          upperDeck: { grp:'upperDeck', coord:'y' },
          stringer:  { grp:'stringerStiff', coord:'y' },
          tween:     { grp:'tweenStiff', coord:'y' },
          coaming:   { grp:'coamingStiff', coord:'y' },
        };
        const m = wpMap[wp];
        if (!m) return;
        grpKey = m.grp;
        coord = m.coord;
        cursorValue = Math.round(Math.abs(y_mm));
      }
      if (!grpKey || !coord || cursorValue == null) return;

      // Find the neighbour stiffener's profile (nearest in the group) as default
      const arr = profiles[grpKey] || [];
      let neighbourProf = null;
      let minDist = Infinity;
      arr.forEach(p => {
        const d = Math.abs((p[coord] || 0) - cursorValue);
        if (d < minDist) { minDist = d; neighbourProf = p.profileName || null; }
      });

      // Show menu
      const EDG = EDITOR_GROUPS.find(g => g.key === grpKey);
      const headerText = `${EDG ? EDG.label : grpKey} @ ${coord.toUpperCase()}=${cursorValue}`;
      showDrawContextMenu(x, y, headerText, [
        {
          label: `+ Add stiffener here (${coord.toUpperCase()}=${cursorValue} mm)${neighbourProf ? ' · ' + neighbourProf : ''}`,
          color: '#22c55e',
          action: () => {
            const newItem = { [coord]: cursorValue };
            if (neighbourProf) newItem.profileName = neighbourProf;
            arr.push(newItem);
            // Linked mirror
            const grp = EDITOR_GROUPS.find(g => g.key === grpKey);
            if (grp && grp.link && getLink(grp) && grp.linkWith) {
              const sideLinkThreshold = GEOMETRY.UD - 600;
              const isSideIS = (grp.link === 'linkSS_IS');
              const partnerAllowed = !isSideIS || (coord === 'z' && cursorValue < sideLinkThreshold);
              if (partnerAllowed) profiles[grp.linkWith].push({ ...newItem });
            }
            if (typeof renderEditor === 'function') renderEditor();
            render();
          }
        },
        {
          label: `+ Add with custom profile…`,
          color: 'var(--text-secondary)',
          action: () => {
            // Open the Add Stiffener modal pre-filled with this coord
            if (typeof window.openAddStiff === 'function') {
              window.openAddStiff(grpKey);
              // Pre-fill coord input
              setTimeout(() => {
                const inp = document.getElementById('asmCoordInput');
                if (inp) inp.value = cursorValue;
              }, 60);
            }
          }
        }
      ]);
    };

    svg.addEventListener('click', (e) => {
      // MEASURE MODE: capture snap points, not element clicks
      if (VIEW_MODE === 'measure') {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX; pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const svgPt = pt.matrixTransform(ctm.inverse());
        const y_mm = svgPt.x / SCALE;
        const z_mm = (BASELINE_Y - svgPt.y) / SCALE;
        const snapped = snapToStructure(y_mm, z_mm) || { y: Math.round(y_mm), z: Math.round(z_mm), label: 'free', type: 'free' };
        if (!MEASURE.p1) {
          MEASURE.p1 = snapped; MEASURE.p2 = null;
        } else if (!MEASURE.p2) {
          MEASURE.p2 = snapped;
        } else {
          // Third click — restart
          MEASURE.p1 = snapped; MEASURE.p2 = null;
        }
        render();
        return;
      }

      const below = document.elementsFromPoint(e.clientX, e.clientY);
      // PASS -1: pick-mode banner (Done button rendered on SVG when ≥3 picks)
      for (const el of below) {
        if (!el.getAttribute) continue;
        if (el.getAttribute('data-pick-banner') === 'done') {
          if (typeof commitBracketPick === 'function') commitBracketPick();
          return;
        }
      }
      // PASS 0: node (highest priority — very small target)
      for (const el of below) {
        if (!el.getAttribute) continue;
        const nid = el.getAttribute('data-node-id');
        if (nid !== null && nid !== '') { onNodeClick(parseInt(nid)); return; }
      }
      // PASS 0b: transverse stiffs / brackets (before regular stiff)
      for (const el of below) {
        if (!el.getAttribute) continue;
        const ti = el.getAttribute('data-transverse-idx');
        if (ti !== null && ti !== '') { onTransverseClick(parseInt(ti)); return; }
        const bi = el.getAttribute('data-bracket-idx');
        if (bi !== null && bi !== '') { onBracketClick(parseInt(bi)); return; }
      }
      // PASS 1: stiff
      for (const el of below) {
        if (!el.getAttribute) continue;
        const sg = el.getAttribute('data-stiff-group');
        const sgi = el.getAttribute('data-stiff-idx');
        if (sg && sgi !== null) {
          const pzRaw = el.getAttribute('data-plate-z');
          const pz = (pzRaw != null && pzRaw !== '') ? parseFloat(pzRaw) : undefined;
          onStiffClick(sg, parseInt(sgi), pz);
          return;
        }
      }
      // PASS 2: strake or whole-plate
      for (const el of below) {
        if (!el.getAttribute) continue;
        const sp = el.getAttribute('data-plate');
        const si = el.getAttribute('data-strake-idx');
        if (sp && si !== null) { onStrakeClick(sp, parseInt(si)); return; }
        const wp = el.getAttribute('data-whole-plate');
        if (wp) { onWholePlateClick(wp); return; }
      }
    });

    // ======================================================================
    // RIGHT-CLICK CONTEXT MENU — quick delete / add stiffener at cursor
    // ======================================================================
    svg.addEventListener('contextmenu', (e) => {
      // Suppress default browser menu so ours can appear
      e.preventDefault();
      // Not in measure mode
      if (VIEW_MODE === 'measure') return;

      const below = document.elementsFromPoint(e.clientX, e.clientY);

      // Compute cursor coords in ship space
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const y_mm = svgPt.x / SCALE;
      const z_mm = (BASELINE_Y - svgPt.y) / SCALE;

      // PRIORITY 1: Stiffener — right click = delete (with confirm)
      for (const el of below) {
        if (!el.getAttribute) continue;
        const sg = el.getAttribute('data-stiff-group');
        const sgi = el.getAttribute('data-stiff-idx');
        if (sg && sgi !== null) {
          showDrawContextMenu(e.clientX, e.clientY, `Stiffener ${sg}[${parseInt(sgi)+1}]`, [
            {
              label: `🗑  Delete stiffener`,
              color: '#ef4444',
              action: () => {
                // Record undo-snapshot BEFORE mutation
                if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
                  window.HistoryManager.recordChange();
                }
                profiles[sg]?.splice(parseInt(sgi), 1);
                // Mirror-delete on linked groups (same index)
                const grp = EDITOR_GROUPS.find(g => g.key === sg);
                if (grp && grp.link && getLink(grp) && grp.linkWith && profiles[grp.linkWith] && profiles[grp.linkWith][parseInt(sgi)]) {
                  profiles[grp.linkWith].splice(parseInt(sgi), 1);
                }
                if (typeof renderEditor === 'function') renderEditor();
                render();
                // CRITICAL: re-run the scantling formulas so plate thickness
                // requirements update (they depend on max stiffener spacing).
                // Without this, calcBottomPlate/calcIBPlate/etc. keep showing
                // the old t_req even though the profile dispapeared.
                if (typeof recalcAll === 'function') recalcAll();
              }
            }
          ]);
          return;
        }
      }

      // PRIORITY 2: Strake (shell / IB / IS) — right click = add stiffener at Y/Z
      for (const el of below) {
        if (!el.getAttribute) continue;
        const sp = el.getAttribute('data-plate');
        const si = el.getAttribute('data-strake-idx');
        if (sp && si !== null) {
          showAddStiffContextMenu(e.clientX, e.clientY, sp, parseInt(si), y_mm, z_mm);
          return;
        }
        const wp = el.getAttribute('data-whole-plate');
        if (wp) {
          showAddStiffContextMenu(e.clientX, e.clientY, null, null, y_mm, z_mm, wp);
          return;
        }
      }

      // Nothing recognizable — hide menu
      hideDrawContextMenu();
    });

    // Measure: hover to preview snap target
    svg.addEventListener('mousemove', (e) => {
      if (VIEW_MODE !== 'measure') {
        if (MEASURE.hover) { MEASURE.hover = null; render(); }
        return;
      }
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const ctm = svg.getScreenCTM();
      if (!ctm) return;
      const svgPt = pt.matrixTransform(ctm.inverse());
      const y_mm = svgPt.x / SCALE;
      const z_mm = (BASELINE_Y - svgPt.y) / SCALE;
      const snapped = snapToStructure(y_mm, z_mm);
      // Only rerender if snapped target changed (avoid flicker)
      const prev = MEASURE.hover;
      if (!snapped && !prev) return;
      if (snapped && prev && prev.y === snapped.y && prev.z === snapped.z) return;
      MEASURE.hover = snapped;
      render();
    });

    // Escape key to clear current measure
    document.addEventListener('keydown', (e) => {
      // Pick mode keyboard shortcuts
      // Single-slot compartment node pick (inline editor) — Escape cancels
      // just the pick arming, leaving the editor row open.
      if (COMPARTMENT_NODE_PICK_SLOT && e.key === 'Escape') {
        COMPARTMENT_NODE_PICK_SLOT = null;
        renderEditor();
        render();
        e.preventDefault();
        return;
      }
      if (TRANSVERSE_PICK) {
        if (e.key === 'Enter') {
          if (TRANSVERSE_PICK.kind === 'bracket' && TRANSVERSE_PICK.picks.length >= 3) {
            commitBracketPick();
            e.preventDefault();
          }
          return;
        }
        if (e.key === 'Escape') {
          TRANSVERSE_PICK = null;
          renderEditor();
          render();
          e.preventDefault();
          return;
        }
      }
      if (VIEW_MODE !== 'measure') return;
      if (e.key === 'Escape') {
        MEASURE.p1 = null;
        MEASURE.p2 = null;
        MEASURE.hover = null;
        render();
      }
    });
  }

  renderStrakeInspector();
  renderSectionProps();
  renderWarnBar();
}

// Populate the collapsible warnings bar at the bottom of the page.
// Pulls from spacingWarnings + strakeWarnings. Visibility of the body is
// controlled by user (click header to toggle); summary always visible.
function renderWarnBar() {
  const bar = document.getElementById('warnBar');
  if (!bar) return;
  const all = [
    ...spacingWarnings,
    ...strakeWarnings.map(msg => ({ level:'warn', msg }))
  ];
  const errors = all.filter(w => w.level === 'error');
  const warns  = all.filter(w => w.level === 'warn');

  // Update summary bar
  bar.classList.remove('has-errors', 'has-warns');
  const iconEl = bar.querySelector('.warn-bar-icon');
  const textEl = bar.querySelector('.warn-bar-text');
  if (errors.length) {
    bar.classList.add('has-errors');
    iconEl.innerHTML = icon('error', '14px');
    textEl.textContent = `${errors.length} error${errors.length>1?'s':''}` +
      (warns.length ? `, ${warns.length} warning${warns.length>1?'s':''}` : '');
  } else if (warns.length) {
    bar.classList.add('has-warns');
    iconEl.innerHTML = icon('warn', '14px');
    textEl.textContent = `${warns.length} warning${warns.length>1?'s':''}`;
  } else {
    iconEl.innerHTML = icon('check', '14px');
    textEl.textContent = 'No warnings';
  }

  // Body content — grouped
  const body = document.getElementById('warnBarBody');
  let h = '';
  if (errors.length) {
    h += `<div class="warn-bar-group errors">
      <div class="warn-bar-group-header">${icon('error','12px')} ${errors.length} error${errors.length>1?'s':''}</div>`;
    errors.forEach(e => { h += `<div class="warn-bar-row error">${escapeXml(e.msg)}</div>`; });
    h += `</div>`;
  }
  if (warns.length) {
    h += `<div class="warn-bar-group warns">
      <div class="warn-bar-group-header">${icon('warn','12px')} ${warns.length} warning${warns.length>1?'s':''}</div>`;
    warns.forEach(w => { h += `<div class="warn-bar-row warn">${escapeXml(w.msg)}</div>`; });
    h += `</div>`;
  }
  if (!errors.length && !warns.length) {
    h = `<div style="padding:8px;color:var(--text-muted);text-align:center">No warnings or errors.</div>`;
  }
  body.innerHTML = h;

  // Set the toggle caret icon (rotated via CSS when body is open)
  const toggleBtn = document.getElementById('warnBarToggle');
  if (toggleBtn && toggleBtn.innerHTML.indexOf('<svg') === -1) {
    toggleBtn.innerHTML = icon('caret', '12px');
  }
}

// =========================================================================
// MODE-AWARE COLORS — one palette per VIEW_MODE
// Used by render() for stroke colors. Legend builds its swatches off the
// same data so drawing and legend always agree.
// =========================================================================

// Plate thickness → color map (for 'thickness' mode)
// Common shipbuilding thicknesses 7-25 mm.
const THICKNESS_COLORS = {
  7:  '#67e8f9',   // very light cyan
  8:  '#22d3ee',   // light cyan
  9:  '#06b6d4',   // cyan
  10: '#0891b2',   // dark cyan
  11: '#22c55e',   // green
  12: '#16a34a',   // dark green
  13: '#3b82f6',   // blue
  14: '#2563eb',   // dark blue
  15: '#8b5cf6',   // violet
  16: '#f59e0b',   // orange
  17: '#ea580c',   // darker orange
  18: '#dc2626',   // red
  19: '#b91c1c',   // darker red
  20: '#ef4444',   // bright red
  22: '#be185d',   // pink
  25: '#831843',   // deep pink
};

// Auto-generate a color for any thickness not in the map (hash-based fallback)
function colorForThickness(t) {
  if (THICKNESS_COLORS[t]) return THICKNESS_COLORS[t];
  // HSL from hash of thickness value — consistent per value
  const hue = ((t * 37) % 360);
  return `hsl(${hue}, 65%, 55%)`;
}

// Colour a plate by its LR material grade — used in the 'material' view mode.
// Toughness tier:
//   A / AH   — light grey / green  (basic)
//   B        — yellow-grey         (mild step up)
//   D / DH   — orange / dark orange (medium)
//   E / EH   — red / dark red       (high)
//   FH       — purple                (low-temp extreme)
function colorForGrade(grade) {
  const map = {
    'A':  '#9ca3af',  // mild, basic
    'AH': '#22c55e',  // HT, basic
    'B':  '#a3a860',  // mild, cold-service minimum bumped
    'D':  '#f97316',  // mild, medium toughness
    'DH': '#ea580c',  // HT, medium toughness
    'E':  '#ef4444',  // mild, high toughness
    'EH': '#b91c1c',  // HT, high toughness
    'FH': '#a855f7',  // extreme low-T
  };
  return map[grade] || '#6b7280';  // grey if unknown / not yet assigned
}

// ==========================================================================
// UC (utilization) color gradient — for Overall/Buckling/HG analysis modes
// Maps UC value (0.0..1.2+) to a smooth green→yellow→orange→red gradient.
// 0.0  = deep green   (very safe)
// 0.5  = green        (safe)
// 0.8  = yellow       (warning)
// 1.0  = orange       (limit reached)
// 1.2+ = deep red     (FAIL)
// ==========================================================================
function colorForUC(uc) {
  if (!isFinite(uc) || uc < 0) return '#6b7280';  // grey for missing
  // Clamp display range
  const u = Math.max(0, Math.min(uc, 1.4));
  // HSL hue: 130 (green) → 60 (yellow) → 30 (orange) → 0 (red)
  // Map 0.0→1.2 to hue 130→0
  let hue;
  if (u <= 0.8) {
    hue = 130 - (u / 0.8) * 50;  // 130 → 80 (green band)
  } else if (u <= 1.0) {
    hue = 80 - ((u - 0.8) / 0.2) * 30;  // 80 → 50 (yellow-orange)
  } else if (u <= 1.2) {
    hue = 50 - ((u - 1.0) / 0.2) * 40;  // 50 → 10 (orange-red)
  } else {
    hue = 0;  // deep red
  }
  const sat = u > 1.0 ? 85 : 70;
  const light = u > 1.0 ? 50 : 55;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}
window.colorForUC = colorForUC;

// Profile type → color (for 'profile' mode)
const PROFILE_TYPE_COLORS = {
  L:  '#4ade80',   // light green
  HP: '#a78bfa',   // purple
  FB: '#fbbf24',   // yellow
};

// WT flag → color (for 'wt' mode)
const WT_COLORS = {
  'WT':     '#06b6d4',   // cyan (watertight)
  'Non-WT': '#f59e0b',   // orange (non-watertight)
};

// Default structural palette (general / position / compartment fallback)
const DEFAULT_PALETTE = {
  shell:       '#ef4444',
  ib:          '#3b82f6',
  is:          '#22c55e',
  stringer:    '#a855f7',   // stringer plate
  tween:       '#06b6d4',   // tween deck plate
  upperDeck:   '#94a3b8',
  coaming:     '#f59e0b',   // legacy alias (kept for compat = coamingTop)
  coamingTop:  '#f59e0b',   // hatch coaming TOP plate (horizontal at Z=HC)
  coamingWall: '#d946ef',   // hatch coaming WALL (vertical UD→HC, distinct magenta)
  sideGirder:  '#a855f7',
  keel:        '#f59e0b',
  duct:        '#a855f7',
};

// Plate thickness values — editable state. Used for plates without strake subdivision
// (stringer, tween, upper deck, coaming, keel portion of shell, duct wall, side girders).
// Shell/IB/IS use per-strake thickness from STRAKES instead.
let PLATE_THICKNESS = {
  shell:     14,   // fallback only (strakes override)
  ib:        16,   // fallback only (Excel default IB = 16 mm)
  is:        11,   // fallback only (Excel default IS = 11 mm)
  stringer:  10,   // Stringer Deck plate (Excel = 10 mm)
  tween:     12,   // Tween Deck plate (Excel = 12 mm)
  upperDeck: 25,   // Upper Deck plate (Excel = 25 mm)
  coaming:     40, // legacy alias (kept for compat = coamingTop)
  coamingTop:  40, // Hatch Coaming Top Plate (Excel = 40 mm)
  coamingWall: 25, // Hatch Coaming Wall (outboard) — DEPRECATED, kept for save/load compat
  keel:      16,   // Keel plate (Excel keel K01 = 16 mm)
  sideGirder:10,   // Side Girder plates — Sec 8.3.5 default for AH36 ≈ 9.31 → 10 mm
  duct:      12,   // Duct wall — Sec 8.3.8 (a)+(b) default for AH36 ≈ 11 mm → 12 mm
};

// LR Pt 3 Ch 2 material grade per whole-plate group. These are the
// non-strake plates (single-piece). Strake-based plates store grade
// per strake on STRAKES.<group>[i].grade. For whole plates we keep a
// flat map so the inspector can read/write a single grade per plate.
//
// Empty string ('') means "not yet assigned" — assignMaterialGrades()
// can fill these in based on Setup inputs (ship type, x/L, temperature).
let PLATE_GRADE = {
  stringer:  '',   // Stringer Deck plate
  tween:     '',   // Tween Deck plate
  upperDeck: '',   // Upper Deck plate
  duct:      '',   // Duct wall
  sideGirder:'',   // Side Girder plates (default for all girders)
  coamingTop:'',   // Hatch Coaming Top
};
// Per-girder grade override (sg0, sg1, sg2 ...) — fall back to PLATE_GRADE.sideGirder
let SIDE_GIRDER_GRADES = {};

// ─── Yield-strength family pins for whole plates ─────────────────────
// Same key set as PLATE_GRADE but holds the *yield* part of the grade
// (MS / AH32 / AH36 / AH40), separate from toughness (A/AH/D/DH/E/EH).
// Empty = no pin; the live resolver falls back to the Setup zone for
// that plate's z-band. Set by the whole-plate inspector dropdown.
let PLATE_MATERIAL_FAMILY = {
  stringer:  '',
  tween:     '',
  upperDeck: '',
  duct:      '',
  sideGirder:'',
  coamingTop:'',
};
let SIDE_GIRDER_FAMILIES = {};   // sg0, sg1, ...
window.PLATE_GRADE = PLATE_GRADE;
window.SIDE_GIRDER_GRADES = SIDE_GIRDER_GRADES;
window.PLATE_MATERIAL_FAMILY = PLATE_MATERIAL_FAMILY;
window.SIDE_GIRDER_FAMILIES = SIDE_GIRDER_FAMILIES;

// Live materialFamily resolver for whole plates (side girder, duct,
// stringer/tween/upperDeck/coamingTop when not strake-split).
// Order: pin (PLATE_MATERIAL_FAMILY[key] / SIDE_GIRDER_FAMILIES[sgN])
//      → Setup zone at the plate's typical z-level (live)
//      → global Setup #material dropdown
// The plate's z-hint mirrors the one assignMaterialGrades uses for
// processWholePlate, so badges and the calc layer agree.
function resolveWholePlateFamily(key) {
  // Per-girder pin first
  if (typeof key === 'string' && key.startsWith('sg')) {
    const pin = window.SIDE_GIRDER_FAMILIES?.[key];
    if (pin) return pin;
    // Then the generic side-girder pin
    if (window.PLATE_MATERIAL_FAMILY?.sideGirder)
      return window.PLATE_MATERIAL_FAMILY.sideGirder;
  } else if (window.PLATE_MATERIAL_FAMILY?.[key]) {
    return window.PLATE_MATERIAL_FAMILY[key];
  }
  // Live Setup-zone read.
  const G = window.Draw?.GEOMETRY || {};
  let z_mm;
  if (key === 'upperDeck')     z_mm = G.UD;
  else if (key === 'stringer' || key.startsWith('stringer'))
                                z_mm = G.TT || ((G.IB || 0) + (G.UD || 0)) / 2;
  else if (key === 'tween' || key.startsWith('tween'))
                                z_mm = G.TT || ((G.IB || 0) + (G.UD || 0)) / 2;
  else if (key === 'coamingTop') z_mm = G.HC || (G.UD ? G.UD + 500 : null);
  else if (key === 'duct')       z_mm = (G.IB || 0) / 2;
  else if (key.startsWith('sg')) z_mm = (G.IB || 0) / 2;
  else if (key === 'sideGirder') z_mm = (G.IB || 0) / 2;
  if (typeof getZoneMaterialAt === 'function' && isFinite(z_mm)) {
    try { const m = getZoneMaterialAt(z_mm); if (m) return m; } catch (_) {}
  }
  return document.getElementById('material')?.value || 'AH36';
}
window.resolveWholePlateFamily = resolveWholePlateFamily;

function buildPaletteForMode() {
  const mode = VIEW_MODE;
  if (mode === 'thickness') {
    // Each plate color reflects its thickness
    const out = {};
    Object.keys(DEFAULT_PALETTE).forEach(k => {
      const t = PLATE_THICKNESS[k];
      out[k] = t ? colorForThickness(t) : '#64748b';
    });
    return out;
  }
  if (mode === 'wt') {
    // Only WT-flagged elements get colored by flag; others stay muted gray
    const MUTED = '#475569';
    const out = {
      shell:     MUTED,
      ib:        MUTED,
      is:        MUTED,
      keel:      MUTED,
      duct:      MUTED,
      coaming:   MUTED,
      stringer:  WT_COLORS[WT_FLAGS.stringerPlate]  || MUTED,
      tween:     WT_COLORS[WT_FLAGS.tweenDeckPlate] || MUTED,
      upperDeck: WT_COLORS[WT_FLAGS.upperDeckPlate] || MUTED,
      sideGirder:'sg-dynamic',  // resolved per-girder at draw time
    };
    return out;
  }
  if (mode === 'compartment') {
    // Plates muted so colored compartment fills stand out
    return {
      shell:'#64748b', ib:'#64748b', is:'#64748b',
      stringer:'#64748b', tween:'#64748b', upperDeck:'#64748b',
      coaming:'#64748b', sideGirder:'#64748b', keel:'#64748b', duct:'#64748b'
    };
  }
  if (mode === 'profile') {
    // Plates muted so stiff colors (per profile type) stand out
    return {
      shell:'#64748b', ib:'#64748b', is:'#64748b',
      stringer:'#64748b', tween:'#64748b', upperDeck:'#64748b',
      coaming:'#64748b', sideGirder:'#64748b', keel:'#64748b', duct:'#64748b'
    };
  }
  // Default (general, position) — original structural colors
  return { ...DEFAULT_PALETTE };
}

// Resolve side girder color per-index (used in WT mode)
function colorForSG(idx) {
  if (VIEW_MODE === 'wt') {
    const flag = WT_FLAGS['sg' + idx] || 'WT';
    return WT_COLORS[flag];
  }
  return DEFAULT_PALETTE.sideGirder;
}

// Resolve stiffener color per surface group, considering current view mode.
// surfaceKey: bottomShell | innerBottom | stringerStiff | tweenStiff | coamingStiff |
//             sideShell | innerSide | upperDeck
// profileType: 'L' | 'HP' | 'FB' (for profile-mode coloring)
function colorForStiff(surfaceKey, profileType) {
  if (VIEW_MODE === 'profile') {
    return PROFILE_TYPE_COLORS[profileType] || '#64748b';
  }
  if (VIEW_MODE === 'wt' || VIEW_MODE === 'compartment' || VIEW_MODE === 'thickness') {
    // Stiffeners muted in these modes (focus is on plates/compartments/WT)
    return '#64748b';
  }
  // general / position — default green (original L color)
  return '#4ade80';
}


function buildLegendItems() {
  // Returns array of { color, label, swatch?: 'line'|'dash'|'box'|'dot' }
  const items = [];
  const g = GEOMETRY;
  switch (VIEW_MODE) {
    case 'general': {
      items.push({ color: DEFAULT_PALETTE.shell,       label:'Shell',              swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.ib,          label:'Inner Bottom',       swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.is,          label:'Inner Side',         swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.stringer,    label:'Stringer Plate',     swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.tween,       label:'Tween Deck',         swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.upperDeck,   label:'Upper Deck',         swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.coamingTop,  label:'Coaming Top Plate',  swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.sideGirder,  label:'Side Girders',       swatch:'dash' });
      break;
    }
    case 'thickness': {
      // Collect all thicknesses actually present (from STRAKES + whole-plate thicknesses)
      const used = new Set();
      STRAKES.shell.forEach(s => used.add(s.thickness));
      STRAKES.innerBottom.forEach(s => used.add(s.thickness));
      STRAKES.innerSide.forEach(s => used.add(s.thickness));
      // Whole plates
      ['stringer','tween','upperDeck','coaming','duct','sideGirder'].forEach(k => {
        if (PLATE_THICKNESS[k]) used.add(PLATE_THICKNESS[k]);
      });
      Array.from(used).filter(t => t).sort((a,b) => a - b).forEach(t => {
        const col = colorForThickness(t);
        items.push({ color: col, label: `${t} mm`, swatch:'line' });
      });
      break;
    }
    case 'profile': {
      // Profile sizes shown here MUST come from the real scantling state
      // (window.__DrawGroupSizes, populated by Bridge.fromScantlings on every
      // recalc). If a group hasn't been scantled yet we say so explicitly —
      // never substitute a hardcoded placeholder, since users were misreading
      // those placeholders as real values (v25 bug fix).
      const GRP_SIZES = window.__DrawGroupSizes || {};
      const sizeFor = (grp) => {
        const v = grp ? GRP_SIZES[grp] : undefined;
        if (v == null || v === '' || v === '(shared)') return 'auto';
        return v;
      };

      // Section 1: profile type color key
      items.push({ section:'Profile Types' });
      items.push({ color: PROFILE_TYPE_COLORS.L,  label:'L (angle)',   swatch:'line' });
      items.push({ color: PROFILE_TYPE_COLORS.HP, label:'HP (bulb)',   swatch:'dot'  });
      items.push({ color: PROFILE_TYPE_COLORS.FB, label:'FB (flat)',   swatch:'line' });
      // Section 2: per-surface assignment (actual sizes from scantling)
      items.push({ section:'Surfaces (per scantling)' });
      const showType = (label, type, grp) => {
        const col = PROFILE_TYPE_COLORS[type] || '#64748b';
        items.push({ color: col, label: `${label} — ${sizeFor(grp)}`, swatch:'line' });
      };
      showType('Bottom Shell',  PARAMS.profTypeBottom, 'bottom');
      showType('Inner Bottom',  PARAMS.profTypeIB,    'innerBottom');
      showType('Stringer St.',  PARAMS.profTypeStringer, 'stringer');
      showType('Tween St.',     PARAMS.profTypeTween,    'tween');
      showType('Coaming St.',   PARAMS.profTypeCoaming,  'coaming');
      showType('Side Shell',    PARAMS.profTypeSide,  'side');
      showType('Inner Side',    PARAMS.profTypeIS,    'innerSide');
      // BUG FIX (v25): Upper Deck was missing its group key, so sizeFor()
      // fell through to the hardcoded defSize placeholder ('L 150x90x9')
      // instead of reading the real scantling value from __DrawGroupSizes.
      showType('Upper Deck',    PARAMS.profTypeDeck,  'upperDeck');
      break;
    }
    case 'position': {
      // Same as general — structural elements colored by category
      items.push({ color: DEFAULT_PALETTE.shell,      label:'Shell',            swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.ib,         label:'Inner Bottom',     swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.is,         label:'Inner Side',       swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.stringer,   label:'Stringer Plate',   swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.tween,      label:'Tween Deck',       swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.upperDeck,  label:'Upper Deck',       swatch:'line' });
      items.push({ color: DEFAULT_PALETTE.coaming,    label:'Coaming Top',      swatch:'line' });
      SIDE_GIRDERS.forEach((sg, i) => {
        items.push({ color: DEFAULT_PALETTE.sideGirder, label:`SG${i+1} (Y=${sg.y})`, swatch:'line' });
      });
      break;
    }
    case 'wt': {
      // Section 1: color key
      items.push({ section:'Legend' });
      items.push({ color: WT_COLORS['WT'],     label:'Watertight',     swatch:'line' });
      items.push({ color: WT_COLORS['Non-WT'], label:'Non-watertight', swatch:'line' });
      items.push({ color: '#64748b',           label:'Not applicable', swatch:'line' });
      // Section 2: each labelled element with its current status
      items.push({ section:'Elements' });
      SIDE_GIRDERS.forEach((sg, i) => {
        const k = 'sg' + i;
        const flag = WT_FLAGS[k] || 'WT';
        items.push({ color: WT_COLORS[flag], label:`SG${i+1}`, swatch:'line' });
      });
      items.push({ color: WT_COLORS[WT_FLAGS.stringerPlate],  label:`Stringer Plate`, swatch:'line' });
      items.push({ color: WT_COLORS[WT_FLAGS.tweenDeckPlate], label:`Tween Deck`,     swatch:'line' });
      items.push({ color: WT_COLORS[WT_FLAGS.upperDeckPlate], label:`Upper Deck`,     swatch:'line' });
      break;
    }
    case 'compartment': {
      const PALETTE = ['#06b6d4','#a855f7','#f59e0b','#22c55e','#ef4444','#3b82f6','#94a3b8','#fbbf24'];
      COMPARTMENTS.forEach((c, i) => {
        items.push({ color: PALETTE[i % PALETTE.length], label: c.name, swatch:'box' });
      });
      break;
    }
    case 'transverse': {
      items.push({ section:'Legend' });
      items.push({ color:'#ec4899', label:'Transverse stiff',  swatch:'line' });
      items.push({ color:'#a855f7', label:'Bracket',           swatch:'box'  });
      items.push({ color:'#8b5cf6', label:'Floor',             swatch:'box'  });
      items.push({ color:'#fbbf24', label:'Nodes',             swatch:'dot'  });
      if (TRANSVERSE_STIFFS.length > 0) {
        items.push({ section:`Stiffeners (${TRANSVERSE_STIFFS.length})` });
        TRANSVERSE_STIFFS.forEach((s, i) => {
          const parts = [`N${s.n1}↔N${s.n2}`];
          if (s.profile && s.size) parts.push(`${s.profile} ${s.size}`);
          else if (s.size) parts.push(s.size);
          if (s.name) parts.push(s.name);
          items.push({ color:'#ec4899', label: parts.join(' · '), swatch:'line' });
        });
      }
      if (BRACKETS.length > 0) {
        items.push({ section:`Brackets / Floors (${BRACKETS.length})` });
        BRACKETS.forEach((b, i) => {
          const label = `${b.name || b.kind} · ${b.nodes.map(n => 'N'+n).join('-')}`;
          items.push({ color: b.kind === 'floor' ? '#8b5cf6' : '#a855f7', label, swatch:'box' });
        });
      }
      if (TRANSVERSE_PICK) {
        items.push({ section:'Active pick' });
        const need = TRANSVERSE_PICK.kind === 'stiff' ? '2' : '3+';
        items.push({ color:'#ec4899', label:`${TRANSVERSE_PICK.kind}: ${TRANSVERSE_PICK.picks.length}/${need}`, swatch:'dot' });
      }
      break;
    }
    case 'nodes': {
      items.push({ section:'Reference labels' });
      items.push({ color:'#fbbf24', label:'N# — Nodes (intersections)', swatch:'dot' });
      items.push({ color:'#06b6d4', label:'L# — Line elements',          swatch:'line' });
      items.push({ section:'Node types' });
      items.push({ color:'#94a3b8', label:'Shell × girders/decks',       swatch:'dot' });
      items.push({ color:'#94a3b8', label:'IB × girders / IB × IS',      swatch:'dot' });
      items.push({ color:'#94a3b8', label:'IS × decks / IS × coaming',   swatch:'dot' });
      items.push({ color:'#94a3b8', label:'Bilge start / Bilge end',     swatch:'dot' });
      break;
    }
    case 'material': {
      // Count strakes by grade across all plate groups
      const tally = {};
      const groups = ['shell','innerBottom','innerSide','upperDeck','coamingTop','stringer','tween'];
      let totalAssigned = 0, totalUnassigned = 0;
      groups.forEach(g => {
        const arr = STRAKES[g];
        if (!Array.isArray(arr)) return;
        arr.forEach(s => {
          if (!s.grade) { totalUnassigned++; return; }
          tally[s.grade] = (tally[s.grade] || 0) + 1;
          totalAssigned++;
        });
      });
      items.push({ section:'LR Pt 3 Ch 2 Material Grades' });
      if (totalAssigned === 0) {
        items.push({ color:'#6b7280', label:'(No grades assigned yet — click "Material Grades" in top bar)', swatch:'box' });
      } else {
        // Sort in toughness order for readability
        const ORDER = ['A','AH','B','D','DH','E','EH','FH'];
        ORDER.forEach(g => {
          if (tally[g]) {
            items.push({ color: colorForGrade(g), label: `${g} — ${tally[g]} plate${tally[g]===1?'':'s'}`, swatch:'box' });
          }
        });
      }
      if (totalUnassigned > 0) {
        items.push({ color:'#6b7280', label:`Not graded: ${totalUnassigned} plates`, swatch:'box' });
      }
      break;
    }
  }
  return items;
}

function renderHTMLLegend() {
  const el = document.getElementById('htmlLegend');
  if (!el) return;
  // Always apply the "pro" style class on the legend container — it's a
  // pure visual upgrade (cards + hover + size pill on the right) and works
  // for every VIEW_MODE. v23+: this used to be a plain text list.
  el.classList.add('pro');
  const items = buildLegendItems();
  const modeTitle = {
    general:     'Legend',
    thickness:   'Plate Thickness',
    profile:     'Profile Sizes',
    position:    'Position Codes',
    wt:          'WT / Non-WT',
    compartment: 'Compartments',
    transverse:  'Transverse',
    nodes:       'Nodes & Elements',
    material:    'Material Grades',
  }[VIEW_MODE] || 'Legend';
  let h = '';
  h += `<div class="html-legend-title">${modeTitle}</div>`;
  if (items.length === 0) {
    h += `<div style="color:var(--text-muted);font-size:0.65rem;padding:4px 0">No items</div>`;
  } else {
    items.forEach(it => {
      if (it.section) {
        h += `<div class="html-legend-section">${escapeHtml(it.section)}</div>`;
        return;
      }
      const swatchCls = `sw ${it.swatch || 'line'}`;
      const style = `background:${it.swatch === 'dash' ? 'transparent' : it.swatch === 'box' ? it.color : it.color};color:${it.color}`;
      // If the label is of the form "Surface Name — PROFILE SIZE" (used in
      // the Profile view by buildLegendItems → showType), split off the size
      // into a right-aligned monospace pill so it reads as data.
      const lbl = String(it.label || '');
      const dashIdx = lbl.indexOf(' — ');
      let leftLabel = lbl, sizePill = '';
      let rowExtraCls = '';
      if (dashIdx > 0) {
        leftLabel = lbl.slice(0, dashIdx);
        const sizeStr = lbl.slice(dashIdx + 3).trim();
        // "auto" sizes (group not yet locked) get a subtler treatment.
        if (/^auto$/i.test(sizeStr)) rowExtraCls = ' is-auto';
        sizePill = `<span class="size-pill">${escapeHtml(sizeStr)}</span>`;
      }
      h += `<div class="html-legend-row${rowExtraCls}" style="color:${it.color}">
        <span class="${swatchCls}" style="${style}"></span>
        <span class="lbl">${escapeHtml(leftLabel)}</span>
        ${sizePill}
      </div>`;
    });
  }
  el.innerHTML = h;
}

function escapeHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Get absolute start/end coordinate of a strake on its plate
function strakeAbsoluteRange(plate, index) {
  const arr = STRAKES[plate];
  if (!arr || !arr[index]) return null;
  let start;
  if (plate === 'shell') {
    start = 0;  // path length from keel start
  } else if (plate === 'innerBottom') {
    start = 0;  // Y from CL
  } else if (plate === 'innerSide') {
    start = GEOMETRY.IB;  // Z from IB
  }
  for (let i = 0; i < index; i++) start += arr[i].width;
  return { start, end: start + arr[index].width };
}

// Find nearest stiff/girder/deck to a given position on a plate.
// Returns { distance, obstacle, label } or null.
function nearestObstacleTo(plate, position) {
  let obstacles = [];
  const g = GEOMETRY;
  const L = shellGeometryLengths();

  if (plate === 'shell') {
    // Position is along shell path — map to segment and build obstacle list in matching coord
    if (position <= L.keel + L.bottom + 0.01) {
      // On bottom: obstacles are bottom shell stiffs (Y), side girders, duct_half
      const localY = position <= L.keel ? position : g.keel_half + (position - L.keel);
      obstacles = [
        ...profiles.bottomShell.map(p => ({ coord: p.y, label: `Stiff Y=${p.y}` })),
        ...SIDE_GIRDERS.map((s, i) => ({ coord: s.y, label: `SG${i+1}` })),
        { coord: g.duct_half, label: 'Duct wall' },
        { coord: g.keel_half, label: 'Keel edge' },
      ];
      return nearestIn(localY, obstacles);
    }
    if (position <= L.keel + L.bottom + L.bilge + 0.01) {
      // On bilge — no direct stiff obstacles; just return bilge edges
      return null;
    }
    // On side shell: Z coord obstacles (side shell stiffs, stringer, tween, UD)
    const localZ = g.R_B + (position - L.keel - L.bottom - L.bilge);
    // Ice intermediates are NOT obstacles for plate seam placement.
    obstacles = [
      ...profiles.sideShell.filter(p => p && p.ice !== true).map(p => ({ coord: p.z, label: `Stiff Z=${p.z}` })),
      ...profiles.stringer.map(p => ({ coord: p.z, label: 'Stringer Deck' })),
      ...profiles.tweenDeck.map(p => ({ coord: p.z, label: 'Tween Deck' })),
      { coord: g.UD, label: 'Upper Deck' },
    ];
    return nearestIn(localZ, obstacles);
  }

  if (plate === 'innerBottom') {
    obstacles = [
      ...profiles.innerBottom.map(p => ({ coord: p.y, label: `Stiff Y=${p.y}` })),
      ...SIDE_GIRDERS.map((s, i) => ({ coord: s.y, label: `SG${i+1}` })),
      { coord: g.duct_half, label: 'Duct wall' },
      { coord: g.IS, label: 'Inner Side' },
    ];
    return nearestIn(position, obstacles);
  }

  if (plate === 'innerSide') {
    obstacles = [
      ...profiles.innerSide.filter(p => p && p.ice !== true).map(p => ({ coord: p.z, label: `Stiff Z=${p.z}` })),
      ...profiles.stringer.map(p => ({ coord: p.z, label: 'Stringer Deck' })),
      ...profiles.tweenDeck.map(p => ({ coord: p.z, label: 'Tween Deck' })),
      { coord: g.UD, label: 'Upper Deck' },
    ];
    return nearestIn(position, obstacles);
  }
  return null;
}

function nearestIn(pos, obstacles) {
  let best = null;
  obstacles.forEach(o => {
    const d = Math.abs(o.coord - pos);
    if (!best || d < best.distance) best = { distance: d, obstacle: o.coord, label: o.label };
  });
  return best;
}

// =========================================================================
// For the Strake Inspector: return the nearest obstacle IN EACH CATEGORY
// (stiffener / side girder / stringer deck / tween deck / deck edges / duct /
// keel / inner side). This lets the UI show clearance to every type of
// structural obstacle, not just the single closest one.
// =========================================================================
function categoryOf(label) {
  if (!label) return 'Edge';
  if (label.startsWith('Stiff')) return 'Stiffener';
  if (label.startsWith('SG'))    return 'Side Girder';
  if (label === 'Duct wall')     return 'Duct wall';
  if (label === 'Keel edge')     return 'Keel edge';
  if (label === 'Inner Side')    return 'Inner Side';
  if (label === 'Upper Deck')    return 'Upper Deck';
  if (label === 'Stringer Deck') return 'Stringer Deck';
  if (label === 'Tween Deck')    return 'Tween Deck';
  return label;
}

function obstaclesListFor(plate, position) {
  // Mirrors the switch inside nearestObstacleTo(), but returns
  // { obstacles, localPos } instead of the single best. Keeps one source of truth.
  const g = GEOMETRY;
  const L = shellGeometryLengths();
  if (plate === 'shell') {
    if (position <= L.keel + L.bottom + 0.01) {
      const localY = position <= L.keel ? position : g.keel_half + (position - L.keel);
      return { localPos: localY, obstacles: [
        ...profiles.bottomShell.map(p => ({ coord: p.y, label: `Stiff Y=${p.y}` })),
        ...SIDE_GIRDERS.map((s, i) => ({ coord: s.y, label: `SG${i+1}` })),
        { coord: g.duct_half, label: 'Duct wall' },
        { coord: g.keel_half, label: 'Keel edge' },
      ]};
    }
    if (position <= L.keel + L.bottom + L.bilge + 0.01) return null;
    const localZ = g.R_B + (position - L.keel - L.bottom - L.bilge);
    return { localPos: localZ, obstacles: [
      ...profiles.sideShell.map(p => ({ coord: p.z, label: `Stiff Z=${p.z}` })),
      ...profiles.stringer.map(p => ({ coord: p.z, label: 'Stringer Deck' })),
      ...profiles.tweenDeck.map(p => ({ coord: p.z, label: 'Tween Deck' })),
      { coord: g.UD, label: 'Upper Deck' },
    ]};
  }
  if (plate === 'innerBottom') {
    return { localPos: position, obstacles: [
      ...profiles.innerBottom.map(p => ({ coord: p.y, label: `Stiff Y=${p.y}` })),
      ...SIDE_GIRDERS.map((s, i) => ({ coord: s.y, label: `SG${i+1}` })),
      { coord: g.duct_half, label: 'Duct wall' },
      { coord: g.IS, label: 'Inner Side' },
    ]};
  }
  if (plate === 'innerSide') {
    return { localPos: position, obstacles: [
      ...profiles.innerSide.map(p => ({ coord: p.z, label: `Stiff Z=${p.z}` })),
      ...profiles.stringer.map(p => ({ coord: p.z, label: 'Stringer Deck' })),
      ...profiles.tweenDeck.map(p => ({ coord: p.z, label: 'Tween Deck' })),
      { coord: g.UD, label: 'Upper Deck' },
    ]};
  }
  return null;
}

// Return: Array<{ category, distance, obstacle, label }>, sorted by distance ASC.
// Only the nearest obstacle per category is included. Empty categories are
// omitted. Returns [] if the plate/position combo has no obstacles.
function nearestObstaclePerCategory(plate, position) {
  const list = obstaclesListFor(plate, position);
  if (!list) return [];
  const byCat = {};
  list.obstacles.forEach(o => {
    const cat = categoryOf(o.label);
    const d = Math.abs(o.coord - list.localPos);
    if (!byCat[cat] || d < byCat[cat].distance) {
      byCat[cat] = { category: cat, distance: d, obstacle: o.coord, label: o.label };
    }
  });
  return Object.values(byCat).sort((a, b) => a.distance - b.distance);
}
window.nearestObstaclePerCategory = nearestObstaclePerCategory;

function renderStrakeInspector() {
  const el = document.getElementById('strakeInspector');
  if (!el) return;

  // One-time: move the inspector DOM node from its original home (inside the
  // right-sidebar info pane) into the drawing panel's svgContainer so that
  // its position:absolute resolves against the drawing area, and the panel
  // floats over the empty upper-left corner of the midship drawing.
  // Only do this once per page load — once parented to svgContainer, it stays.
  const svgContainer = document.getElementById('svgContainer');
  if (svgContainer && el.parentElement !== svgContainer) {
    svgContainer.appendChild(el);
  }

  // In ANALYSIS MODE, do NOT open the drawing's built-in inspector panels
  // — the dedicated Element Inspection Panel handles that role.
  if (window.ANALYSIS_MODE) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }

  // Dispatch by selection type
  if (SELECTED_TRANSVERSE != null) {
    return renderTransverseInspector(el);
  }
  if (SELECTED_BRACKET != null) {
    return renderBracketInspector(el);
  }
  if (SELECTED_NODE) {
    return renderNodeInspector(el);
  }
  if (SELECTED_STIFF) {
    return renderStiffInspector(el);
  }
  if (SELECTED_WHOLE_PLATE) {
    return renderWholePlateInspector(el);
  }

  if (!SELECTED_STRAKE) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const { plate, index } = SELECTED_STRAKE;
  const strake = STRAKES[plate] && STRAKES[plate][index];
  if (!strake) {
    el.style.display = 'none';
    return;
  }
  const plateLabels = {
    shell: 'Shell',
    innerBottom: 'Inner Bottom',
    innerSide: 'Inner Side',
    upperDeck: 'Upper Deck',
    stringer: 'Stringer Deck',
    tween: 'Tween Deck',
    coamingTop: 'Coaming Top',
    coamingWall: 'Coaming Wall',
    sideGirder: 'Side Girder',
    duct: 'Duct',
    keel: 'Keel',
  };
  const range = strakeAbsoluteRange(plate, index);
  const nearStart = range ? nearestObstacleTo(plate, range.start) : null;
  const nearEnd   = range ? nearestObstacleTo(plate, range.end)   : null;
  const warnStart = nearStart && nearStart.distance < STRAKE_MIN_CLEAR;
  const warnEnd   = nearEnd   && nearEnd.distance   < STRAKE_MIN_CLEAR;
  const anyWarn   = warnStart || warnEnd;

  // Classify obstacle type for display
  const obstacleType = (label) => {
    if (!label) return 'Edge';
    if (label.startsWith('Stiff')) return 'Stiffener';
    if (label.startsWith('SG'))    return 'Side Girder';
    if (label === 'Duct wall')     return 'Duct wall';
    if (label === 'Keel edge')     return 'Keel edge';
    if (label === 'Inner Side')    return 'IS plate';
    if (label === 'Upper Deck')    return 'Upper Deck';
    if (label === 'Stringer Deck') return 'Stringer';
    if (label === 'Tween Deck')    return 'Tween Deck';
    return label;
  };

  // Build the title. plateLabels has every group; if somehow a new key
  // arrives that we haven't mapped, fall back to a humanised version of
  // the key itself instead of showing "undefined".
  // Also: don't append `kind` if it's just the same as the plate group
  // (e.g. coamingTop strake has kind='coamingTop' — already in title).
  const plateLabel = plateLabels[plate]
                     || (plate ? plate.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()) : 'Plate');
  const showKind = strake.kind && strake.kind !== plate
                   && strake.kind.toLowerCase() !== plate.toLowerCase();

  let h = '';
  h += `<div class="strake-inspector-title">
    <span>${plateLabel} · Strake #${index + 1}${showKind ? ' · '+strake.kind : ''}</span>
    <button class="strake-inspector-close" id="inspectorClose" title="Close">${icon('close','12px')}</button>
  </div>`;
  // Open scrollable body wrapper — keeps the title pinned and lets the
  // rest of the card scroll independently when the screen is too short.
  h += `<div class="strake-inspector-body">`;

  // Editable parameters
  h += `<div class="strake-inspector-section">Parameters</div>`;
  h += `<div class="strake-inspector-field">
    <label>Width</label>
    <input type="number" id="inspWidth" value="${strake.width}" step="10" min="100">
    <span style="color:var(--text-muted);font-size:0.6rem">mm</span>
  </div>`;
  h += `<div class="strake-inspector-field">
    <label>Thickness</label>
    <input type="number" id="inspThick" value="${strake.thickness}" step="1" min="1">
    <span style="color:var(--text-muted);font-size:0.6rem">mm</span>
  </div>`;
  // Material grade — yield-strength family (LR Pt 3 Ch 2).
  // Dropdown sets MS/AH32/AH36/AH40. Default from Setup zone (live, dimmed),
  // pinnable. '— auto' clears the pin and reverts to Setup-zone resolution.
  {
    const isManual = !!strake.materialFamilyManual;
    let autoMf = '';
    if (typeof getZoneMaterialForStrake === 'function') {
      try { autoMf = getZoneMaterialForStrake(strake._plateKey || (typeof _plateKeyForStrake === 'function' ? _plateKeyForStrake(strake) : null), strake) || ''; } catch (_) {}
    }
    if (!autoMf) autoMf = (document.getElementById('material')?.value) || 'AH36';
    const eff = isManual ? (strake.materialFamily || autoMf) : autoMf;
    const colors = { 'MS':'#6b7280', 'AH32':'#0891b2', 'AH36':'#7c3aed', 'AH40':'#ea580c' };
    const bg = eff ? (colors[eff] || 'var(--bg-tertiary)') : 'var(--bg-tertiary)';
    const fg = eff ? '#fff' : 'var(--text-muted)';
    const op = isManual ? '1' : '0.65';
    const clsInfo = strake.materialClass ? ` · Class ${strake.materialClass}` : '';
    const title = isManual
      ? `Pinned: ${familyToKLabel(eff)}. Pick '— auto' to revert to Setup zone.`
      : `Auto from Setup zone: ${familyToKLabel(eff)}.`;
    h += `<div class="strake-inspector-field" title="${title}">
      <label>k${clsInfo}</label>
      <select id="inspGrade" style="max-width:100px;background:${bg};color:${fg};font-weight:600;font-family:var(--font-mono);opacity:${op};border:none;padding:3px 6px;border-radius:3px">
        <option value=""     ${!isManual ? 'selected' : ''}>${isManual ? '— auto' : (autoMf ? familyToKLabel(autoMf) : '—')}</option>
        <option value="MS"   ${isManual && eff === 'MS'   ? 'selected' : ''}>k = 1.00</option>
        <option value="AH32" ${isManual && eff === 'AH32' ? 'selected' : ''}>k = 0.78</option>
        <option value="AH36" ${isManual && eff === 'AH36' ? 'selected' : ''}>k = 0.72</option>
        <option value="AH40" ${isManual && eff === 'AH40' ? 'selected' : ''}>k = 0.68</option>
      </select>
    </div>`;
  }

  // Position
  if (range) {
    h += `<div class="strake-inspector-section">Position along plate</div>`;
    h += `<div class="strake-inspector-field"><label>Seam 1 (start)</label><span class="val">${Math.round(range.start)} mm</span></div>`;
    h += `<div class="strake-inspector-field"><label>Seam 2 (end)</label><span class="val">${Math.round(range.end)} mm</span></div>`;
  }

  // Clearance — two nearest obstacles per seam, no type labels.
  // The user just wants to see how close the seam is to any obstacle.
  h += `<div class="strake-inspector-section">Weld clearance (2 nearest)</div>`;

  // Collect all obstacles flat (not grouped by category), take the two nearest.
  const twoNearestFor = (pos) => {
    if (!range) return [];
    const list = (typeof obstaclesListFor === 'function') ? obstaclesListFor(plate, pos) : null;
    if (!list || !list.obstacles || list.obstacles.length === 0) return [];
    const scored = list.obstacles.map(o => ({
      distance: Math.abs(o.coord - list.localPos),
      obstacle: o.coord
    }));
    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, 2);
  };

  const nearS1 = range ? twoNearestFor(range.start) : [];
  const nearS2 = range ? twoNearestFor(range.end)   : [];

  const renderDistCell = (entry) => {
    if (!entry) return `<span class="clear-cell-na">—</span>`;
    const bad = entry.distance < STRAKE_MIN_CLEAR;
    return `<span class="clear-cell ${bad ? 'bad' : 'ok'}" title="Obstacle @ ${Math.round(entry.obstacle)} mm">${Math.round(entry.distance)} mm</span>`;
  };

  let anyWarn2 = false;
  const markWarn = list => list.forEach(x => { if (x && x.distance < STRAKE_MIN_CLEAR) anyWarn2 = true; });
  markWarn(nearS1); markWarn(nearS2);

  // Two rows: "Nearest" and "2nd nearest", with S1 and S2 values side-by-side.
  const labels = ['Nearest', '2nd nearest'];
  for (let k = 0; k < 2; k++) {
    h += `<div class="clear-cat-row">
      <div class="clear-cat-label">${labels[k]}</div>
      <div class="clear-cat-values">
        <span class="clear-cat-seam">S1</span>${renderDistCell(nearS1[k])}
        <span class="clear-cat-seam">S2</span>${renderDistCell(nearS2[k])}
      </div>
    </div>`;
  }

  if (nearS1.length === 0 && nearS2.length === 0) {
    h += `<div style="color:var(--text-muted);font-size:0.72rem;padding:6px 8px">No nearby obstacles for this plate.</div>`;
  } else if (anyWarn2) {
    h += `<div class="clear-alert">${icon('warn','12px')} Weld collision risk — seam within ${STRAKE_MIN_CLEAR}mm of an obstacle. Adjust strake width.</div>`;
  } else {
    h += `<div class="clear-ok">${icon('check','12px')} Clearances OK (≥ ${STRAKE_MIN_CLEAR}mm each side)</div>`;
  }

  // Close the scrollable body wrapper opened right after the title.
  h += `</div>`;

  el.innerHTML = h;
  el.style.display = 'block';

  // Wire up inputs
  document.getElementById('inspectorClose')?.addEventListener('click', () => {
    SELECTED_STRAKE = null;
    render();
  });
  document.getElementById('inspWidth')?.addEventListener('change', e => {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v <= 0) return;
    // Pre-validate like the Profile Editor does: ensure sum stays ≤ panel total.
    const pk = SELECTED_STRAKE?.plate;
    const idx = SELECTED_STRAKE?.index;
    if (pk && STRAKES[pk] && idx != null && typeof plateGeometryTotal === 'function') {
      const arr = STRAKES[pk];
      const target = plateGeometryTotal(pk);
      const lastIdx = arr.length - 1;
      if (target != null && arr.length > 1) {
        const MIN_SLACK = 10;
        const slackIdx = (idx === lastIdx) ? (lastIdx - 1) : lastIdx;
        let sumFixed = 0;
        for (let k = 0; k < arr.length; k++) {
          if (k === idx || k === slackIdx) continue;
          sumFixed += arr[k].width;
        }
        const maxAllowed = target - sumFixed - MIN_SLACK;
        if (v > maxAllowed) {
          // Reject — restore old value, flash red.
          e.target.value = strake.width;
          e.target.style.transition = 'background 0.3s, border-color 0.3s';
          e.target.style.background = 'rgba(239,68,68,0.28)';
          e.target.style.borderColor = '#ef4444';
          setTimeout(() => {
            e.target.style.background = '';
            e.target.style.borderColor = '';
          }, 900);
          e.target.title = `Max: ${maxAllowed} mm (panel total ${target} mm).`;
          return;
        }
      }
    }
    strake.width = v;
    STRAKES_AUTO = false;
    // Rebalance so the slack strake absorbs the diff → total = panel size.
    if (pk && typeof rebalanceStrakes === 'function') {
      try { rebalanceStrakes(pk, idx); } catch(e2) {}
    }
    // v32: full recalc — re-runs scantling formulas (Z_req, plate t_req,
    // hull-girder σ, buckling UC, rule margins). Without this, the result
    // panel for the just-edited strake keeps showing the OLD required
    // thickness even though the section has been recomputed.
    try {
      if (window.ANALYSIS_MODE && typeof recalcAll === 'function') {
        recalcAll();
      } else {
        // Fallback (draw mode) — at least keep panels coherent.
        if (window.Draw && window.Draw.computeSectionProperties) window.Draw.computeSectionProperties();
        if (typeof renderAnalysisStatusPanel === 'function') renderAnalysisStatusPanel();
        if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel();
        if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel();
        if (typeof renderBucklingStatusPanel === 'function') renderBucklingStatusPanel();
      }
    } catch(e2) { console.warn('[inspWidth] refresh failed:', e2); }
    renderEditor();
    render();
  });
  document.getElementById('inspThick')?.addEventListener('change', e => {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v <= 0) return;
    strake.thickness = v;
    STRAKES_AUTO = false;  // prevent recalcAll from regenerating strakes
    // v32: full recalc — re-runs every scantling formula AND analysis panel.
    // Previously only individual panels were re-rendered, leaving Z_req /
    // t_req in the result panel stale relative to the new thickness.
    try {
      if (window.ANALYSIS_MODE && typeof recalcAll === 'function') {
        recalcAll();
      } else {
        if (window.Draw && window.Draw.computeSectionProperties) window.Draw.computeSectionProperties();
        if (typeof renderAnalysisStatusPanel === 'function') renderAnalysisStatusPanel();
        if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel();
        if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel();
        if (typeof renderBucklingStatusPanel === 'function') renderBucklingStatusPanel();
      }
    } catch(e2) { console.warn('[inspThick] refresh failed:', e2); }
    // Re-render the currently-open element inspector (shows Hull girder σ / Buckling UC)
    try {
      if (window.ANALYSIS_MODE && window.showElemInspect && typeof SELECTED_STRAKE !== 'undefined' && SELECTED_STRAKE) {
        const map = {
          shell: SELECTED_STRAKE.index === 0 ? 'plate-keel' : 'plate-bottom',
          innerBottom: 'plate-ib',
          innerSide: 'plate-is',
        };
        const kind = map[SELECTED_STRAKE.plate] || 'plate-bottom';
        const s2 = STRAKES[SELECTED_STRAKE.plate] && STRAKES[SELECTED_STRAKE.plate][SELECTED_STRAKE.index];
        if (s2) {
          window.showElemInspect(kind, {
            strakeIdx: SELECTED_STRAKE.index,
            strakeId: s2?.id,
            strakeName: s2?.name,
            strakeSpacing: s2?.spacing_mm,
            strakeThickness: s2?.thickness,
            strakeWidth: s2?.width,
            strakeKind: s2?.kind,
          });
        }
      }
    } catch(e2) { console.warn('[inspThick] re-render inspector failed:', e2); }
    renderEditor();
    render();
  });
  document.getElementById('inspGrade')?.addEventListener('change', e => {
    if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
      window.HistoryManager.recordChange();
    }
    const v = e.target.value || null;
    if (v) {
      // Pin yield-strength family (MS / AH32 / AH36 / AH40).
      strake.materialFamily = v;
      strake.family = (v === 'MS') ? 'Mild' : 'HT';
      strake.materialFamilyManual = true;
    } else {
      // '— auto': drop the pin so Setup zone takes over again.
      delete strake.materialFamilyManual;
    }
    // Propagate to longs that sit on this strake (those without their own
    // gradeManual pin). Mirrors the editor-row strake-mf handler.
    try {
      const D = window.Draw;
      if (D && D.profiles && typeof getStrakeForLong === 'function') {
        const effectiveMf = v || (typeof getZoneMaterialForStrake === 'function'
          ? getZoneMaterialForStrake(strake._plateKey || (typeof _plateKeyForStrake === 'function' ? _plateKeyForStrake(strake) : null), strake)
          : null);
        const effectiveFamily = effectiveMf
          ? (effectiveMf === 'MS' ? 'Mild' : 'HT') : null;
        const groups = ['bottomShell','sideShell','innerBottom','innerSide',
                        'upperDeck','stringerStiff','tweenStiff','coamingStiff'];
        groups.forEach(grpKey => {
          const arr = D.profiles[grpKey];
          if (!Array.isArray(arr)) return;
          arr.forEach((p, i) => {
            if (p.gradeManual && p.materialFamily) return;     // user pinned this one
            const ps = getStrakeForLong(grpKey, i);
            if (ps !== strake) return;                          // not on edited strake
            if (effectiveMf) {
              p.materialFamily = effectiveMf;
              p.family = effectiveFamily;
            }
          });
        });
      }
    } catch (_) {}
    if (typeof recalcAll === 'function') recalcAll();
    renderStrakeInspector();
    renderEditor();
    render();
  });
}

// =========================================================================
// WHOLE-PLATE INSPECTOR — for plates without strake subdivision.
// Shows thickness (editable) and WT (if applicable).
// =========================================================================
// Called by click handler when a node is clicked in compartment view
// while a COMPARTMENT_PICK session is active.
// Called by click handler when a node is clicked in compartment view
// while a COMPARTMENT_PICK session is active.
function handleCompartmentNodePick(nodeId) {
  if (!COMPARTMENT_PICK) return;
  const p = COMPARTMENT_PICK;
  // Toggle: if already picked, remove it; otherwise append (no upper limit)
  const existing = p.picks.indexOf(nodeId);
  if (existing >= 0) {
    p.picks.splice(existing, 1);
  } else {
    p.picks.push(nodeId);
  }
  renderEditor();
  render();
}

// Commit the current compartment pick (user pressed Done).
// Requires at least 3 nodes.
function commitCompartmentPick() {
  if (!COMPARTMENT_PICK) return;
  if (COMPARTMENT_PICK.picks.length < 3) return;
  const nodes = COMPARTMENT_PICK.picks.slice();
  if (COMPARTMENT_PICK.mode === 'new') {
    COMPARTMENTS.push({ name:'NEW', nodes });
  } else if (COMPARTMENT_PICK.mode === 'edit' && COMPARTMENT_PICK.editIdx != null) {
    const c = COMPARTMENTS[COMPARTMENT_PICK.editIdx];
    if (c) {
      c.nodes = nodes;
      // Remove legacy coord fields and old n1..n4 since polygon nodes takes precedence
      delete c.n1; delete c.n2; delete c.n3; delete c.n4;
      delete c.yMin; delete c.yMax; delete c.zMin; delete c.zMax;
    }
  }
  COMPARTMENT_PICK = null;
  renderEditor();
  render();
}

// Called by click handler when a node is clicked in transverse view
// while a TRANSVERSE_PICK session is active.
function handleTransverseNodePick(nodeId) {
  if (!TRANSVERSE_PICK) return;
  const p = TRANSVERSE_PICK;
  // Toggle: if already picked, remove it
  const existing = p.picks.indexOf(nodeId);
  if (existing >= 0) {
    p.picks.splice(existing, 1);
    render();
    renderEditor();
    return;
  }
  if (p.kind === 'stiff') {
    if (p.picks.length >= 2) return;
    p.picks.push(nodeId);
    if (p.picks.length === 2) {
      // Commit as a new transverse stiff (default = FB 120x10 from catalog)
      TRANSVERSE_STIFFS.push({
        n1: p.picks[0], n2: p.picks[1],
        profileName: 'FB 120x10',
        profile: 'FB', size: '120x10',  // legacy mirrors for older consumers
        name: ''
      });
      TRANSVERSE_PICK = null;
      // New trans stiff → may reduce s_eff for crossed strakes → recalc plate t
      if (typeof recalcAll === 'function') recalcAll();
      renderEditor();
      render();
      return;
    }
  } else if (p.kind === 'bracket') {
    // No upper node limit — user decides with Done button
    p.picks.push(nodeId);
  }
  render();
  renderEditor();
}

// Commit an in-progress bracket pick (user clicked Done)
function commitBracketPick() {
  if (!TRANSVERSE_PICK || TRANSVERSE_PICK.kind !== 'bracket') return;
  if (TRANSVERSE_PICK.picks.length < 3) return;
  BRACKETS.push({
    nodes: TRANSVERSE_PICK.picks.slice(),
    kind: 'bracket',
    arm_mm: 250,  // LR Rule-standard bracket default arm length
    name: ''
  });
  TRANSVERSE_PICK = null;
  // New bracket → may reduce l_e for attached longs → recalc Z_req
  if (typeof recalcAll === 'function') recalcAll();
  renderEditor();
  render();
}
// Expose for testing & external triggers
window.handleTransverseNodePick = handleTransverseNodePick;
window.commitBracketPick = commitBracketPick;
window.startTransversePick = function(kind) {
  TRANSVERSE_PICK = { kind: kind || 'bracket', picks: [] };
  if (typeof VIEW_MODE !== 'undefined' && VIEW_MODE !== 'transverse') {
    VIEW_MODE = 'transverse';
  }
  if (typeof renderEditor === 'function') renderEditor();
  if (typeof render === 'function') render();
};
window.getTransversePick = function() { return TRANSVERSE_PICK; };

function renderTransverseInspector(el) {
  const idx = SELECTED_TRANSVERSE;
  const s = TRANSVERSE_STIFFS[idx];
  if (!s) { el.style.display = 'none'; return; }
  const n1 = NODES_CACHE.find(n => n.id === s.n1);
  const n2 = NODES_CACHE.find(n => n.id === s.n2);
  const distance = (n1 && n2) ? Math.hypot(n2.realY - n1.realY, n2.realZ - n1.realZ) : null;

  let h = '';
  h += `<div class="strake-inspector-title">
    <span style="color:#ec4899">Transverse Stiff #${idx+1}</span>
    <button class="strake-inspector-close" id="inspectorClose" title="Close">${icon('close','12px')}</button>
  </div>`;
  h += `<div class="strake-inspector-body">`;
  h += `<div class="strake-inspector-section">Endpoints</div>`;
  h += `<div class="strake-inspector-field"><label>From</label><span class="val">N${s.n1}</span></div>`;
  h += `<div class="strake-inspector-field"><label>To</label><span class="val">N${s.n2}</span></div>`;
  if (distance != null) {
    h += `<div class="strake-inspector-field"><label>Length</label><span class="val">${Math.round(distance)} mm</span></div>`;
  }
  h += `<div class="strake-inspector-section">Properties</div>`;
  h += `<div class="strake-inspector-field">
    <label>Name</label>
    <input type="text" id="tsName" value="${escapeXml(s.name || '')}" placeholder="(optional)" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.72rem">
  </div>`;
  h += `<div class="strake-inspector-field">
    <label>Profile</label>
    <select id="tsProfile" style="max-width:80px">
      <option value="FB"${s.profile==='FB'?' selected':''}>FB</option>
      <option value="L"${s.profile==='L'?' selected':''}>L</option>
      <option value="HP"${s.profile==='HP'?' selected':''}>HP</option>
    </select>
  </div>`;
  h += `<div class="strake-inspector-field">
    <label>Size</label>
    <input type="text" id="tsSize" value="${escapeXml(s.size || '')}" placeholder="e.g. 120x10" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.72rem">
  </div>`;
  h += `<button class="ed-del" id="tsDelete" style="margin-top:10px;width:100%;padding:6px">Delete this stiff</button>`;
  h += `</div>`;   // close strake-inspector-body

  el.innerHTML = h;
  el.style.display = 'block';
  document.getElementById('inspectorClose')?.addEventListener('click', () => { SELECTED_TRANSVERSE = null; render(); });
  document.getElementById('tsName')?.addEventListener('change', e => { s.name = e.target.value; render(); });
  document.getElementById('tsProfile')?.addEventListener('change', e => { s.profile = e.target.value; render(); });
  document.getElementById('tsSize')?.addEventListener('change', e => { s.size = e.target.value; render(); });
  document.getElementById('tsDelete')?.addEventListener('click', () => {
    TRANSVERSE_STIFFS.splice(idx, 1);
    SELECTED_TRANSVERSE = null;
    renderEditor();
    render();
  });
}

function renderBracketInspector(el) {
  const idx = SELECTED_BRACKET;
  const b = BRACKETS[idx];
  if (!b) { el.style.display = 'none'; return; }

  let h = '';
  h += `<div class="strake-inspector-title">
    <span style="color:#a855f7">Bracket / Floor #${idx+1}</span>
    <button class="strake-inspector-close" id="inspectorClose" title="Close">${icon('close','12px')}</button>
  </div>`;
  h += `<div class="strake-inspector-body">`;
  h += `<div class="strake-inspector-section">Nodes (${b.nodes.length})</div>`;
  h += `<div style="font-family:monospace;font-size:0.72rem;color:#a855f7;padding:2px 6px;background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.3);border-radius:3px;letter-spacing:0.5px;margin:4px 0">
    ${b.nodes.map(id => 'N'+id).join(' · ')}
  </div>`;
  h += `<div class="strake-inspector-section">Properties</div>`;
  h += `<div class="strake-inspector-field">
    <label>Name</label>
    <input type="text" id="brName" value="${escapeXml(b.name || '')}" placeholder="(optional)" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.72rem">
  </div>`;
  h += `<div class="strake-inspector-field">
    <label>Kind</label>
    <select id="brKind" style="max-width:100px">
      <option value="bracket"${b.kind==='bracket'?' selected':''}>Bracket</option>
      <option value="floor"${b.kind==='floor'?' selected':''}>Floor</option>
    </select>
  </div>`;
  h += `<button class="ed-del" id="brDelete" style="margin-top:10px;width:100%;padding:6px">Delete this bracket</button>`;
  h += `</div>`;   // close strake-inspector-body

  el.innerHTML = h;
  el.style.display = 'block';
  document.getElementById('inspectorClose')?.addEventListener('click', () => { SELECTED_BRACKET = null; render(); });
  document.getElementById('brName')?.addEventListener('change', e => { b.name = e.target.value; render(); });
  document.getElementById('brKind')?.addEventListener('change', e => { b.kind = e.target.value; render(); });
  document.getElementById('brDelete')?.addEventListener('click', () => {
    BRACKETS.splice(idx, 1);
    SELECTED_BRACKET = null;
    renderEditor();
    render();
  });
}

function renderNodeInspector(el) {
  const { id } = SELECTED_NODE;
  const node = NODES_CACHE.find(n => n.id === id);
  if (!node) {
    el.style.display = 'none';
    return;
  }
  let h = '';
  h += `<div class="strake-inspector-title">
    <span>Node N${id}</span>
    <button class="strake-inspector-close" id="inspectorClose" title="Close">${icon('close','12px')}</button>
  </div>`;
  h += `<div class="strake-inspector-body">`;
  h += `<div class="strake-inspector-section">Coordinates</div>`;
  h += `<div class="strake-inspector-field"><label>Y (from CL)</label><span class="val">${Math.round(node.realY)} mm</span></div>`;
  h += `<div class="strake-inspector-field"><label>Z (from BL)</label><span class="val">${Math.round(node.realZ)} mm</span></div>`;
  if (node.tag) {
    h += `<div class="strake-inspector-section">Intersection of</div>`;
    // Tag can be combined with "/" — show each part on a new line
    node.tag.split(' / ').forEach(t => {
      h += `<div style="color:var(--text-secondary);font-size:0.7rem;padding:2px 0 2px 10px;border-left:2px solid var(--accent);margin:3px 0">${t}</div>`;
    });
  }
  h += `</div>`;   // close strake-inspector-body
  el.innerHTML = h;
  el.style.display = 'block';
  document.getElementById('inspectorClose')?.addEventListener('click', () => {
    SELECTED_NODE = null;
    render();
  });
}

function renderStiffInspector(el) {
  const { group, index } = SELECTED_STIFF;
  const arr = profiles[group];
  const stiff = arr && arr[index];
  if (!stiff) {
    el.style.display = 'none';
    return;
  }
  // Group metadata: label, which coord (y/z), which profile type param
  const GROUP_META = {
    bottomShell:   { label:'Bottom Shell Stiff.',   coord:'y', typeKey:'profTypeBottom',   plate:'shell'       },
    innerBottom:   { label:'Inner Bottom Stiff.',   coord:'y', typeKey:'profTypeIB',       plate:'innerBottom' },
    sideShell:     { label:'Side Shell Stiff.',     coord:'z', typeKey:'profTypeSide',     plate:'shell'       },
    innerSide:     { label:'Inner Side Stiff.',     coord:'z', typeKey:'profTypeIS',       plate:'innerSide'   },
    stringerStiff: { label:'Stringer Deck Stiff.',  coord:'y', typeKey:'profTypeStringer', plate:null          },
    tweenStiff:    { label:'Tween Deck Stiff.',     coord:'y', typeKey:'profTypeTween',    plate:null          },
    coamingStiff:  { label:'Coaming Top Stiff.',    coord:'y', typeKey:'profTypeCoaming',  plate:null          },
    upperDeck:     { label:'Upper Deck Stiff.',     coord:'y', typeKey:'profTypeDeck',     plate:null          },
  };
  const meta = GROUP_META[group];
  if (!meta) { el.style.display = 'none'; return; }

  const pos = stiff[meta.coord];
  const profType = PARAMS[meta.typeKey];

  // Map group -> scantling-page select ID (to read & write the actual profile name).
  // side/innerSide have multi-group dropdowns (sideGroupProfile_*) — no single
  // source — so we leave them null and rely on profileName / visual-sizes fallback.
  // Stringer/Tween IDs in HTML are 'strDeckProfile'/'twnDeckProfile'.
  const PROFILE_SELECT_ID = {
    bottomShell:   'bottomLongProfile',
    innerBottom:   'ibLongProfile',
    sideShell:     null,
    innerSide:     null,
    stringerStiff: 'strDeckProfile',
    tweenStiff:    'twnDeckProfile',
    coamingStiff:  'coamingProfile',
    upperDeck:     'deckLongProfile'
  };
  const selId = PROFILE_SELECT_ID[group];

  // Get current profile name from scantling page (e.g. "L 150x90x9")
  let currentProfName = '';
  const selEl = selId ? document.getElementById(selId) : null;
  if (selEl && selEl.value) currentProfName = selEl.value;
  // Fallback: use PROFILE_VISUAL_SIZES
  if (!currentProfName && window.PROFILE_VISUAL_SIZES && window.PROFILE_VISUAL_SIZES[group]) {
    const d = window.PROFILE_VISUAL_SIZES[group];
    currentProfName = `${d.type || profType} ${d.webH}x${d.flangeW || ''}${d.flangeW ? 'x' : ''}${d.t_web || d.t || ''}`;
  }
  if (!currentProfName) currentProfName = profType;

  // Neighbor spacing — same-group stiffeners before/after this index (sorted by coord)
  const sorted = [...arr].sort((a, b) => a[meta.coord] - b[meta.coord]);
  const myPos = sorted.findIndex(s => s === stiff);
  const prev = myPos > 0 ? sorted[myPos - 1] : null;
  const next = myPos < sorted.length - 1 ? sorted[myPos + 1] : null;
  const gapPrev = prev ? pos - prev[meta.coord] : null;
  const gapNext = next ? next[meta.coord] - pos : null;

  // Find which strake on the parent plate contains this stiff's position
  let parentStrake = null;
  let parentThickness = null;
  let parentStrakeGrade = null;
  let parentStrakeObj = null;
  if (meta.plate && STRAKES[meta.plate]) {
    const startOffset = meta.plate === 'innerSide' ? GEOMETRY.IB : 0;
    let cursor = startOffset;
    // Shell has special mapping — stiff Y/Z must be converted to path length
    if (meta.plate === 'shell') {
      const L = shellGeometryLengths();
      // Convert stiff's local coord to path position
      let pathPos = null;
      if (meta.coord === 'y') {
        // Bottom stiff — on BL between keel_half and bilge_start
        if (pos < GEOMETRY.keel_half) pathPos = pos;
        else if (pos < GEOMETRY.B_half - GEOMETRY.R_B) pathPos = L.keel + (pos - GEOMETRY.keel_half);
      } else {
        // Side stiff — on shell line between R_B and UD
        if (pos > GEOMETRY.R_B) pathPos = L.keel + L.bottom + L.bilge + (pos - GEOMETRY.R_B);
      }
      if (pathPos !== null) {
        cursor = 0;
        for (let i = 0; i < STRAKES.shell.length; i++) {
          const end = cursor + STRAKES.shell[i].width;
          if (pathPos >= cursor && pathPos <= end) {
            parentStrake = i + 1;
            parentThickness = STRAKES.shell[i].thickness;
            parentStrakeGrade = STRAKES.shell[i].grade || null;
            parentStrakeObj = STRAKES.shell[i];
            break;
          }
          cursor = end;
        }
      }
    } else {
      // innerBottom or innerSide — direct coord matching
      cursor = startOffset;
      for (let i = 0; i < STRAKES[meta.plate].length; i++) {
        const end = cursor + STRAKES[meta.plate][i].width;
        if (pos >= cursor && pos <= end) {
          parentStrake = i + 1;
          parentThickness = STRAKES[meta.plate][i].thickness;
          parentStrakeGrade = STRAKES[meta.plate][i].grade || null;
          parentStrakeObj = STRAKES[meta.plate][i];
          break;
        }
        cursor = end;
      }
    }
  }

  // Spacing warnings (550-750mm range)
  const spacingWarn = (g) => g !== null && (g < 550 || g > 750);

  let h = '';
  h += `<div class="strake-inspector-title">
    <span>${meta.label} · #${index + 1}</span>
    <button class="strake-inspector-close" id="inspectorClose" title="Close">${icon('close','12px')}</button>
  </div>`;
  h += `<div class="strake-inspector-body">`;

  // Position name (free-text label, e.g. "L12", "B7", "BS-3") — editable
  const posName = stiff.posName || '';
  h += `<div class="strake-inspector-section">Position name</div>`;
  h += `<div class="strake-inspector-field">
    <label>Label</label>
    <input type="text" id="inspPosName" value="${escapeXml(posName)}" placeholder="e.g. L12, B7, BS-3" maxlength="12" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.72rem">
  </div>`;

  // currentProfName: stiff.profileName (override) > group default
  const effectiveProfName = stiff.profileName || currentProfName;
  const isCustom = !!stiff.profileName;

  h += `<div class="strake-inspector-section">Profile</div>`;
  // Build options: prefer scantling select, else profile catalog
  let inspOpts = '';
  let hasDropdownOptions = false;
  if (selEl && selEl.tagName === 'SELECT' && selEl.options && selEl.options.length > 0) {
    // Clone from scantling dropdown.
    // If the effective profile (e.g. HP 200x10 set by auto-optimize) is NOT in
    // the form's filtered list (which is often limited to one family like 'L'),
    // inject it as an extra selected option so the inspector shows the actual
    // profile instead of snapping to the first list item.
    let effInList = false;
    for (let i = 0; i < selEl.options.length; i++) {
      if (selEl.options[i].value === effectiveProfName) { effInList = true; break; }
    }
    if (!effInList && effectiveProfName) {
      inspOpts += `<option value="${escapeXml(effectiveProfName)}" selected>${escapeXml(effectiveProfName)} (override)</option>`;
    }
    for (let i = 0; i < selEl.options.length; i++) {
      const opt = selEl.options[i];
      const selected = (opt.value === effectiveProfName) ? ' selected' : '';
      inspOpts += `<option value="${escapeXml(opt.value)}"${selected}>${escapeXml(opt.textContent || opt.value)}</option>`;
    }
    hasDropdownOptions = true;
  } else if (window.Profile && window.Profile.allProfiles) {
    // Fallback: catalog
    try {
      const all = window.Profile.allProfiles(['L','HP','FB']).map(p => p.name);
      if (effectiveProfName && !all.includes(effectiveProfName)) {
        inspOpts += `<option value="${escapeXml(effectiveProfName)}" selected>${escapeXml(effectiveProfName)}</option>`;
      }
      all.forEach(name => {
        const selected = (name === effectiveProfName) ? ' selected' : '';
        inspOpts += `<option value="${escapeXml(name)}"${selected}>${escapeXml(name)}</option>`;
      });
      hasDropdownOptions = all.length > 0;
    } catch(e) {}
  }
  if (hasDropdownOptions) {
    const color = isCustom ? '#fbbf24' : 'var(--text-primary)';
    h += `<div class="strake-inspector-field">
      <label>Profile${isCustom ? ' <span title="Custom override for this stiffener" style="color:#fbbf24;font-size:0.7rem">•</span>' : ''}</label>
      <select id="inspProfileSelect" data-group="${group}" data-sel-id="${selId}" style="flex:1;min-width:0;font-family:var(--font-mono);font-size:0.7rem;background:var(--bg-tertiary);border:1px solid var(--border);color:${color};padding:3px 6px;border-radius:3px">
        ${inspOpts}
      </select>
    </div>`;
  } else {
    h += `<div class="strake-inspector-field"><label>Profile</label><span class="val">${escapeXml(effectiveProfName)}</span></div>`;
  }
  h += `<div class="strake-inspector-field"><label>${meta.coord === 'y' ? 'Y position' : 'Z position'}</label><span class="val">${Math.round(pos)} mm</span></div>`;
  if (parentStrake) {
    h += `<div class="strake-inspector-field"><label>On strake</label><span class="val">#${parentStrake} · ${parentThickness} mm plate${parentStrakeGrade ? ' · ' + parentStrakeGrade : ''}</span></div>`;
  }

  // Resolve effective family for parent strake too (used in "On strake" row)
  let parentStrakeMfDisplay = '';
  if (parentStrakeObj) {
    let parentMf = '';
    if (parentStrakeObj.materialFamilyManual && parentStrakeObj.materialFamily) {
      parentMf = parentStrakeObj.materialFamily;
    } else if (typeof getZoneMaterialForStrake === 'function') {
      try { parentMf = getZoneMaterialForStrake(meta.plate, parentStrakeObj) || ''; } catch (_) {}
    }
    if (parentMf) parentStrakeMfDisplay = familyToKLabel(parentMf);
  }
  if (parentStrake) {
    h += `<div class="strake-inspector-field"><label>On strake</label><span class="val">#${parentStrake} · ${parentThickness} mm plate${parentStrakeMfDisplay ? ' · ' + parentStrakeMfDisplay : ''}</span></div>`;
  }

  // ── k-value row (auto from parent strake / Setup, manual override possible) ──
  // Display the resolved k for THIS stiff. The chain is the same as the
  // calc layer uses (resolveStiffFamily): pin → parent strake → Setup zone.
  // A small dropdown lets the user pin a different k just for this stiff;
  // '—' (auto) clears the pin.
  const isStiffManual = !!stiff.gradeManual;
  let stiffEffMf = '';
  if (isStiffManual && stiff.materialFamily) stiffEffMf = stiff.materialFamily;
  else if (typeof getInheritedFamilyForLong === 'function') {
    try {
      const idxInArr = (window.Draw?.profiles?.[meta.group])?.indexOf(stiff);
      if (idxInArr >= 0) stiffEffMf = getInheritedFamilyForLong(meta.group, idxInArr) || '';
    } catch (_) {}
  }
  if (!stiffEffMf) stiffEffMf = (document.getElementById('material')?.value) || 'AH36';
  const kColors = { 'MS':'#6b7280', 'AH32':'#0891b2', 'AH36':'#7c3aed', 'AH40':'#ea580c' };
  const kBg = stiffEffMf ? (kColors[stiffEffMf] || 'var(--bg-tertiary)') : 'var(--bg-tertiary)';
  const kFg = stiffEffMf ? '#fff' : 'var(--text-muted)';
  const kOp = isStiffManual ? '1' : '0.65';
  const kTitle = isStiffManual
    ? `Pinned: ${familyToKLabel(stiffEffMf)}. Pick '— auto' to revert to parent strake.`
    : `Auto from parent strake / Setup zone: ${familyToKLabel(stiffEffMf)}.`;
  const kSel = `<select id="inspStiffK" data-group="${meta.group}" title="${escapeXml(kTitle)}" style="background:${kBg};color:${kFg};font-weight:600;font-family:var(--font-mono);opacity:${kOp};border:none;padding:3px 8px;border-radius:3px;font-size:0.7rem">
    <option value=""     ${!isStiffManual ? 'selected' : ''}>${isStiffManual ? '— auto' : familyToKLabel(stiffEffMf)}</option>
    <option value="MS"   ${isStiffManual && stiffEffMf === 'MS'   ? 'selected' : ''}>k = 1.00</option>
    <option value="AH32" ${isStiffManual && stiffEffMf === 'AH32' ? 'selected' : ''}>k = 0.78</option>
    <option value="AH36" ${isStiffManual && stiffEffMf === 'AH36' ? 'selected' : ''}>k = 0.72</option>
    <option value="AH40" ${isStiffManual && stiffEffMf === 'AH40' ? 'selected' : ''}>k = 0.68</option>
  </select>`;
  h += `<div class="strake-inspector-field"><label>k</label><span class="val">${kSel}</span></div>`;

  h += `<div class="strake-inspector-section">Spacing to neighbours</div>`;
  if (prev) {
    h += `<div class="clear-row ${spacingWarn(gapPrev) ? 'bad' : 'ok'}">
      <div class="clear-row-head">
        <span class="clear-tag">Previous</span>
        <span class="clear-dist ${spacingWarn(gapPrev)?'bad':''}">${Math.round(gapPrev)} mm</span>
      </div>
      <div class="clear-row-body">
        <span class="clear-type">Stiff @ ${Math.round(prev[meta.coord])} mm</span>
      </div>
    </div>`;
  } else {
    h += `<div class="strake-inspector-field"><label>Previous</label><span class="val" style="color:var(--text-muted)">— (edge)</span></div>`;
  }
  if (next) {
    h += `<div class="clear-row ${spacingWarn(gapNext) ? 'bad' : 'ok'}">
      <div class="clear-row-head">
        <span class="clear-tag">Next</span>
        <span class="clear-dist ${spacingWarn(gapNext)?'bad':''}">${Math.round(gapNext)} mm</span>
      </div>
      <div class="clear-row-body">
        <span class="clear-type">Stiff @ ${Math.round(next[meta.coord])} mm</span>
      </div>
    </div>`;
  } else {
    h += `<div class="strake-inspector-field"><label>Next</label><span class="val" style="color:var(--text-muted)">— (edge)</span></div>`;
  }
  if (spacingWarn(gapPrev) || spacingWarn(gapNext)) {
    h += `<div class="clear-alert">${icon('warn','12px')} Spacing outside preferred 550–750mm range</div>`;
  } else {
    h += `<div class="clear-ok">${icon('check','12px')} Spacing within 550–750mm range</div>`;
  }
  h += `</div>`;   // close strake-inspector-body

  el.innerHTML = h;
  el.style.display = 'block';

  document.getElementById('inspectorClose')?.addEventListener('click', () => {
    SELECTED_STIFF = null;
    render();
  });

  // k-value dropdown — pin/unpin per-stiff materialFamily.
  document.getElementById('inspStiffK')?.addEventListener('change', e => {
    const newMf = e.target.value || null;
    if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
      window.HistoryManager.recordChange();
    }
    if (newMf) {
      stiff.materialFamily = newMf;
      stiff.family = (newMf === 'MS') ? 'Mild' : 'HT';
      stiff.gradeManual = true;
      stiff.familyManual = true;
    } else {
      delete stiff.gradeManual;
      delete stiff.familyManual;
    }
    if (typeof recalcAll === 'function') recalcAll();
    if (typeof renderStiffInspector === 'function') renderStiffInspector(el);
    if (typeof renderEditor === 'function') renderEditor();
    render();
  });

  // Position name input — update stiff.posName
  const posInput = document.getElementById('inspPosName');
  if (posInput) {
    const savePosName = () => {
      const v = posInput.value.trim();
      if (v) stiff.posName = v;
      else delete stiff.posName;
      render();
    };
    posInput.addEventListener('change', savePosName);
    posInput.addEventListener('blur', savePosName);
    // Auto-focus the position-name field when user arrived via Position view
    // (makes "click stiff to rename" feel instantaneous)
    if (VIEW_MODE === 'position') {
      setTimeout(() => { posInput.focus(); posInput.select(); }, 0);
    }
  }

  // Profile dropdown — set per-stiffener override (stiff.profileName)
  const profSelect = document.getElementById('inspProfileSelect');
  if (profSelect) {
    profSelect.addEventListener('change', () => {
      const newName = profSelect.value;
      const scantlingSelId = profSelect.getAttribute('data-sel-id');
      const scantlingSel = scantlingSelId ? document.getElementById(scantlingSelId) : null;
      const groupDefault = scantlingSel && scantlingSel.value ? scantlingSel.value : '';
      // If selected matches group default — clear override; else set override
      if (newName === groupDefault) {
        delete stiff.profileName;
      } else {
        stiff.profileName = newName;
      }
      // Re-render drawing and the editor panel (to reflect custom mark)
      render();
      if (typeof renderEditor === 'function') renderEditor();
      // v32: in analysis mode, also rerun all scantling formulas + analysis
      // panel renders. Without this, σ_hg / Z_section / buckling UC stay
      // stale relative to the just-selected profile.
      try {
        if (window.ANALYSIS_MODE && typeof recalcAll === 'function') {
          recalcAll();
        }
      } catch (err) {
        console.warn('[inspProfileSelect] analysis refresh failed:', err);
      }
    });
  }
}

function renderWholePlateInspector(el) {
  const key = SELECTED_WHOLE_PLATE;
  if (!key) { el.style.display = 'none'; el.innerHTML = ''; return; }

  // Map key → display config
  // gradeKey: which key to read/write in PLATE_GRADE. For side girders the
  // grade is keyed by the SVG key itself (sg0, sg1, ...) so each girder
  // can have its own grade; falls back to PLATE_GRADE.sideGirder.
  const cfgMap = {
    stringer:  { label: 'Stringer Deck',  thickKey: 'stringer',   wtKey: 'stringerPlate',  canWT: true,  gradeKey: 'stringer'   },
    tween:     { label: 'Tween Deck',     thickKey: 'tween',      wtKey: 'tweenDeckPlate', canWT: true,  gradeKey: 'tween'      },
    upperDeck: { label: 'Upper Deck',     thickKey: 'upperDeck',  wtKey: 'upperDeckPlate', canWT: true,  gradeKey: 'upperDeck'  },
    coaming:   { label: 'Coaming Top',    thickKey: 'coaming',    wtKey: null,             canWT: false, gradeKey: 'coamingTop' },
    duct:      { label: 'Duct wall',      thickKey: 'duct',       wtKey: null,             canWT: false, gradeKey: 'duct'       },
  };
  // Side girders: sg0, sg1, ... and numbered stringer/tween if multiple
  let cfg;
  if (key.startsWith('sg')) {
    const idx = parseInt(key.substring(2));
    cfg = { label: `Side Girder ${idx+1}`, thickKey: 'sideGirder', wtKey: key, canWT: true,
            gradeKey: key, gradeFallbackKey: 'sideGirder' };
  } else if (cfgMap[key]) {
    cfg = cfgMap[key];
  } else if (key.startsWith('stringer')) {
    cfg = { label: 'Stringer Deck '+(key.substring(8)), thickKey:'stringer', wtKey:'stringerPlate', canWT:true, gradeKey:'stringer' };
  } else if (key.startsWith('tween')) {
    cfg = { label: 'Tween Deck '+(key.substring(5)), thickKey:'tween', wtKey:'tweenDeckPlate', canWT:true, gradeKey:'tween' };
  } else {
    el.style.display = 'none'; return;
  }

  const thickness = PLATE_THICKNESS[cfg.thickKey] || 10;
  const wt = cfg.wtKey ? (WT_FLAGS[cfg.wtKey] || 'WT') : null;
  // Resolve current grade. Side girders look up by their own key first
  // (sg0, sg1...), then fall back to the generic 'sideGirder' grade.
  let currentGrade = '';
  if (cfg.gradeKey) {
    if (cfg.gradeKey.startsWith('sg')) {
      currentGrade = (window.SIDE_GIRDER_GRADES?.[cfg.gradeKey])
                    || (window.PLATE_GRADE?.[cfg.gradeFallbackKey || 'sideGirder'])
                    || '';
    } else {
      currentGrade = (window.PLATE_GRADE?.[cfg.gradeKey]) || '';
    }
  }

  let h = '';
  h += `<div class="strake-inspector-title">
    <span>${cfg.label}</span>
    <button class="strake-inspector-close" id="inspectorClose" title="Close">${icon('close','12px')}</button>
  </div>`;
  h += `<div class="strake-inspector-body">`;
  h += `<div class="strake-inspector-section">Parameters</div>`;
  h += `<div class="strake-inspector-field">
    <label>Thickness</label>
    <input type="number" id="inspWholeThick" value="${thickness}" step="1" min="1">
    <span style="color:var(--text-muted);font-size:0.6rem">mm</span>
  </div>`;
  if (cfg.canWT) {
    h += `<div class="strake-inspector-field">
      <label>WT</label>
      <select id="inspWholeWT" style="max-width:80px">
        <option value="WT"${wt==='WT'?' selected':''}>WT</option>
        <option value="Non-WT"${wt==='Non-WT'?' selected':''}>Non-WT</option>
      </select>
    </div>`;
  } else {
    h += `<div class="strake-inspector-field" style="opacity:0.5"><label>WT</label><span class="val">N/A</span></div>`;
  }

  // ─── Material grade (LR Pt 3 Ch 2 — yield + toughness) ────────────
  // Same auto/manual semantics as the strake/long pickers: default is the
  // Setup zone for this plate's z-band, displayed dimmed; selecting a value
  // pins this plate (PLATE_MATERIAL_FAMILY[key] or SIDE_GIRDER_FAMILIES[sgN]
  // for individual girders). '— auto' clears the pin.
  {
    const isSG = (cfg.gradeKey && cfg.gradeKey.startsWith('sg'));
    const pin = isSG
      ? (window.SIDE_GIRDER_FAMILIES?.[cfg.gradeKey] || '')
      : (window.PLATE_MATERIAL_FAMILY?.[cfg.gradeKey] || '');
    const auto = (typeof resolveWholePlateFamily === 'function')
                 ? resolveWholePlateFamily(cfg.gradeKey)
                 : (document.getElementById('material')?.value || 'AH36');
    const isManual = !!pin;
    const eff = isManual ? pin : auto;
    const colors = {
      'MS':'#6b7280',
      'AH32':'#0891b2','AH36':'#7c3aed','AH40':'#ea580c'
    };
    const bg = eff ? (colors[eff] || 'var(--bg-tertiary)') : 'var(--bg-tertiary)';
    const fg = eff ? '#fff' : 'var(--text-muted)';
    const op = isManual ? '1' : '0.65';
    const title = isManual
      ? `Pinned: ${familyToKLabel(eff)}. Pick '— auto' to revert to Setup zone.`
      : `Auto from Setup zone: ${familyToKLabel(eff)}. Pick a value here to pin this plate.`;
    h += `<div class="strake-inspector-field">
      <label>k</label>
      <select id="inspWholeGrade" title="${title}" style="max-width:100px;background:${bg};color:${fg};font-weight:600;font-family:var(--font-mono);opacity:${op};border:none;padding:3px 6px;border-radius:3px">
        <option value=""     ${!isManual ? 'selected' : ''}>${isManual ? '— auto' : (auto ? familyToKLabel(auto) : '—')}</option>
        <option value="MS"   ${isManual && eff === 'MS'   ? 'selected' : ''}>k = 1.00</option>
        <option value="AH32" ${isManual && eff === 'AH32' ? 'selected' : ''}>k = 0.78</option>
        <option value="AH36" ${isManual && eff === 'AH36' ? 'selected' : ''}>k = 0.72</option>
        <option value="AH40" ${isManual && eff === 'AH40' ? 'selected' : ''}>k = 0.68</option>
      </select>
    </div>`;
  }
  h += `</div>`;   // close strake-inspector-body

  el.innerHTML = h;
  el.style.display = 'block';

  // Wire up
  document.getElementById('inspectorClose')?.addEventListener('click', () => {
    SELECTED_WHOLE_PLATE = null;
    render();
  });
  document.getElementById('inspWholeThick')?.addEventListener('change', e => {
    const v = parseInt(e.target.value);
    if (isNaN(v) || v <= 0) return;
    PLATE_THICKNESS[cfg.thickKey] = v;
    // v38: ALSO mirror the new value into the matching scantling form
    // input. Without this, recalcAll later reads the OLD form value
    // (e.g. coamingT=25 still showing in the field) and overwrites the
    // STRAKES we just updated. Reproducer: set Coaming Top → 40, then
    // set Upper Deck → 30 and watch coaming snap back to 25.
    // The form-input mapping mirrors what calcXxx() formulas read.
    try {
      const FORM_ID_MAP = {
        coaming:    'coamingT',
        upperDeck:  'deckT',
        stringer:   'strDeckT',
        tween:      'twnDeckT',
        keel:       'keelT',
        shell:      'bottomT',
        innerBottom:'ibT',
        sideGirder: 'sgT',
        duct:       'dkT',
      };
      const formId = FORM_ID_MAP[cfg.thickKey];
      if (formId) {
        const formEl = document.getElementById(formId);
        if (formEl && parseFloat(formEl.value) !== v) {
          formEl.value = v;
        }
      }
    } catch (err) { console.warn('[inspWholeThick] form mirror failed:', err); }
    // v34: mirror the new thickness into STRAKES groups whose render reads
    // from per-strake `thickness` (not from PLATE_THICKNESS). Without this,
    // editing the whole-plate value updates the form/section calc but the
    // SVG strakes keep showing the old thickness — looks like "the strakes
    // don't exist". Mirror only for groups with a single strake (multi-
    // strake groups are user-managed; we don't want to overwrite their
    // per-strake values silently).
    //
    // BUG FIX (May 2026): The original map only listed coamingTop/upperDeck/
    // stringer/tween. SIDE GIRDERS and DUCT WALL were missing — even though
    // computeSectionProperties() for side girders checks STRAKES.sideGirderN
    // FIRST and falls back to PLATE_THICKNESS.sideGirder only when empty.
    // Result: editing Side Girder thickness via the popover updated
    // PLATE_THICKNESS.sideGirder but STRAKES.sideGirder0/1/2 stayed at the
    // old value, so Z_B / Z_D / I_NA didn't move. Visiting Setup→Geometry
    // happened to clear and re-seed those strakes (using the now-fresh
    // PLATE_THICKNESS), which is why "navigating away and back" worked.
    // Now: also walk sideGirder0/1/2 (and stringer0/1/.../tween0/1/...)
    // and apply the new thickness directly. No more navigation dance.
    try {
      const STR_MIRROR_MAP = {
        coaming:    ['coamingTop'],
        upperDeck:  ['upperDeck'],
        stringer:   ['stringer'],
        tween:      ['tween'],
      };
      const mirrorGroups = STR_MIRROR_MAP[cfg.thickKey] || [];
      mirrorGroups.forEach(grp => {
        const arr = STRAKES[grp];
        if (!Array.isArray(arr) || arr.length === 0) return;
        if (arr.length === 1) {
          arr[0].thickness = v;
        } else {
          // Multi-strake: only update strakes that look like they were
          // tracking the global default (i.e. all currently equal — no
          // per-strake variation). Otherwise leave them alone.
          const allSame = arr.every(s => s.thickness === arr[0].thickness);
          if (allSame) arr.forEach(s => { s.thickness = v; });
        }
      });
      // ─── Side girders (sideGirder0/1/2) — update all subgroups ─────
      // computeSectionProperties iterates SIDE_GIRDERS and reads each
      // STRAKES.sideGirderN[*].thickness, so all three must be synced.
      if (cfg.thickKey === 'sideGirder') {
        ['sideGirder0', 'sideGirder1', 'sideGirder2'].forEach(k => {
          const arr = STRAKES[k];
          if (!Array.isArray(arr) || arr.length === 0) return;
          arr.forEach(s => { s.thickness = v; });
        });
      }
      // ─── Stringer / tween subgroups (stringerN / tweenN) ────────────
      // These exist when there are multiple stringer / tween levels.
      // Each level has its own STRAKES.stringer0, stringer1, ... entry
      // that computeSectionProperties reads. The legacy flat array
      // STRAKES.stringer / STRAKES.tween is rebuilt from these in
      // computeStrakes(); we update both to be safe.
      if (cfg.thickKey === 'stringer' || cfg.thickKey === 'tween') {
        const prefix = cfg.thickKey;
        const re = new RegExp('^' + prefix + '\\d+$');
        Object.keys(STRAKES).forEach(k => {
          if (re.test(k) && Array.isArray(STRAKES[k])) {
            STRAKES[k].forEach(s => { s.thickness = v; });
          }
        });
      }
      // Duct wall doesn't use a STRAKES group — computeSectionProperties
      // calls vertPlate(g.duct_half, 0, g.IB, PLATE_THICKNESS.duct, ...)
      // directly, so updating PLATE_THICKNESS.duct above is sufficient.
      // (Listed here for documentation; no action needed.)
    } catch (err) { console.warn('[inspWholeThick] STRAKES mirror failed:', err); }
    render();
    // REVERSE SYNC: notify scantling. For mapped plates (shell, ib, deck,
    // stringer, tween, sideGirder, duct), Bridge.onPlateEditFromDrawing()
    // already calls recalcAll() internally. For unmapped plates (coaming,
    // inner-side per-strake, etc.) it returns early — so we ALSO trigger
    // a recalc explicitly for those, otherwise σ_hg / buckling UC stay
    // stale until the user touches a different field.
    let bridgeHandled = false;
    if (window.Bridge && typeof window.Bridge.onPlateEditFromDrawing === 'function') {
      try {
        window.Bridge.onPlateEditFromDrawing(cfg.thickKey, v);
        bridgeHandled = true;
      } catch (err) { console.warn('[inspWholeThick] Bridge sync failed:', err); }
    }
    if (!bridgeHandled || window.ANALYSIS_MODE) {
      // Force recalc — covers (a) plates with no scantling input mapping,
      // and (b) double-tap insurance in analysis mode where the user
      // expects every panel to refresh on every edit.
      try {
        if (typeof recalcAll === 'function') recalcAll();
      } catch (err) { console.warn('[inspWholeThick] recalc failed:', err); }
    }
    // BUG FIX (May 2026): The Rule Minimum / Hull Girder / Buckling panels
    // (the floating "INFO" overlay that shows Z_B / Z_D / I_NA ratios) are
    // updated by renderRuleMinInfoPanel / renderHullGirderStrengthPanel /
    // renderBucklingStatusPanel — and these are only chained from recalcAll
    // when window.ANALYSIS_MODE is true. In edit/draw mode the popover's
    // STRAKES update + render() refreshed the SVG and the Section Properties
    // pane, but the floating INFO overlay (which the user actually reads
    // for Z_D / I_NA ratios) stayed stale. The user had to navigate
    // Setup→Geometry to bounce the panels into refresh — annoying.
    // Now: always call these renders directly after a popover thickness
    // edit, regardless of mode.
    try {
      if (typeof renderRuleMinInfoPanel === 'function') {
        renderRuleMinInfoPanel();
      }
      if (typeof renderHullGirderStrengthPanel === 'function') {
        renderHullGirderStrengthPanel();
      }
      if (typeof renderBucklingStatusPanel === 'function') {
        renderBucklingStatusPanel();
      }
      if (typeof renderAnalysisStatusPanel === 'function') {
        renderAnalysisStatusPanel();
      }
    } catch (err) { console.warn('[inspWholeThick] info-panel refresh failed:', err); }
  });
  document.getElementById('inspWholeWT')?.addEventListener('change', e => {
    if (cfg.wtKey) {
      WT_FLAGS[cfg.wtKey] = e.target.value;
      render();
    }
  });

  // Grade change → write to materialFamily pin map (or SIDE_GIRDER_FAMILIES
  // per girder). Empty value clears the pin so live Setup-zone resolution
  // takes over again.
  document.getElementById('inspWholeGrade')?.addEventListener('change', e => {
    if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
      window.HistoryManager.recordChange();
    }
    const v = e.target.value || null;
    const isSG = (cfg.gradeKey && cfg.gradeKey.startsWith('sg'));
    if (isSG) {
      if (v) window.SIDE_GIRDER_FAMILIES[cfg.gradeKey] = v;
      else   delete window.SIDE_GIRDER_FAMILIES[cfg.gradeKey];
    } else if (cfg.gradeKey) {
      if (v) window.PLATE_MATERIAL_FAMILY[cfg.gradeKey] = v;
      else   delete window.PLATE_MATERIAL_FAMILY[cfg.gradeKey];
    }
    // Family change affects the k factor → t_req, Z_req → recalc
    if (typeof recalcAll === 'function') recalcAll();
    renderWholePlateInspector(el);
    render();
  });
}

// =========================================================================
// Inline SVG icons (replace all emojis). Each returns a stroke-based SVG
// at 1em size that inherits currentColor for easy theming.
// =========================================================================
const ICON_PATHS = {
  check:   '<polyline points="4,13 9,18 20,6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  warn:    '<path d="M12 3 L22 20 L2 20 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><line x1="12" y1="10" x2="12" y2="14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1" fill="currentColor"/>',
  error:   '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="7" y1="12" x2="17" y2="12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  cross:   '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="16" y1="8" x2="8" y2="16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  checkCircle:'<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><polyline points="7.5,12.5 11,16 16.5,9.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  info:    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="12" cy="7.5" r="1.2" fill="currentColor"/><path d="M11 11 L11 17 M13 17 L9 17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  beaker:  '<path d="M8 3 L8 10 L4 19 A1.5 1.5 0 0 0 5.5 21 L18.5 21 A1.5 1.5 0 0 0 20 19 L16 10 L16 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><line x1="7" y1="3" x2="17" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="6.3" y1="14" x2="17.7" y2="14" stroke="currentColor" stroke-width="1.6" opacity="0.6"/>',
  stopSquare:'<rect x="6" y="6" width="12" height="12" rx="1" fill="none" stroke="currentColor" stroke-width="2"/>',
  close:   '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  reload:  '<path d="M4 12 A8 8 0 0 1 18 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polyline points="18,3 18,8 13,8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 12 A8 8 0 0 1 6 16.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><polyline points="6,21 6,16 11,16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
  mirror:  '<line x1="12" y1="3" x2="12" y2="21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="2,2"/><path d="M9 6 L5 12 L9 18 Z" fill="currentColor"/><path d="M15 6 L19 12 L15 18 Z" fill="none" stroke="currentColor" stroke-width="2"/>',
  lock:    '<rect x="5" y="11" width="14" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M8 11 V7 A4 4 0 0 1 16 7 V11" fill="none" stroke="currentColor" stroke-width="2.2"/>',
  pencil:  '<path d="M4 20 L4 16 L16 4 L20 8 L8 20 Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><line x1="13" y1="7" x2="17" y2="11" stroke="currentColor" stroke-width="2.2"/>',
  caret:   '<polyline points="6,15 12,9 18,15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  // Optimize: target crosshair
  target:  '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><line x1="12" y1="2" x2="12" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="19" x2="12" y2="22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="2" y1="12" x2="5" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="19" y1="12" x2="22" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Profiles (stiffeners): stacked bars
  bars:    '<rect x="4" y="14" width="2.5" height="7" fill="currentColor"/><rect x="8.5" y="10" width="2.5" height="11" fill="currentColor"/><rect x="13" y="6" width="2.5" height="15" fill="currentColor"/><rect x="17.5" y="3" width="2.5" height="18" fill="currentColor"/>',
  // Plates: stacked layers
  layers:  '<path d="M12 3 L21 8 L12 13 L3 8 Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 12 L12 17 L21 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 16 L12 21 L21 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
  // Wrench (for 'refresh' of analysis - clearer than reload)
  wrench:  '<path d="M14.5 3.5 A4 4 0 0 0 20 9 L13 16 L11 14 L18 7 A4 4 0 0 0 14.5 3.5 Z M10 16 L4 22 L2 20 L8 14 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  // Debug icon (gear)
  gear:    '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2 L12 5 M12 19 L12 22 M4.9 4.9 L7.1 7.1 M16.9 16.9 L19.1 19.1 M2 12 L5 12 M19 12 L22 12 M4.9 19.1 L7.1 16.9 M16.9 7.1 L19.1 4.9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  // Plus / minus — used by inline editors (e.g. compartment node editor)
  plus:    '<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  minus:   '<line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
};
window.icon = window.icon || null;  // placeholder (real icon() fn defined below)
function icon(name, size) {
  const s = size || '1em';
  const p = ICON_PATHS[name];
  if (!p) return '';
  return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" style="display:inline-block;vertical-align:-0.15em;flex-shrink:0">${p}</svg>`;
}
window.icon = icon;
window.ICON_PATHS = ICON_PATHS;

function escapeXml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// =========================================================================
// ZOOM & PAN — viewBox manipulation
// =========================================================================
const VIEW_INITIAL_HALF = { x: -120, y: 0, w: 700, h: 720 };
const VIEW_INITIAL_FULL = { x: -620, y: 0, w: 1240, h: 720 };
function currentViewInitial() {
  return MIRROR_BODY ? VIEW_INITIAL_FULL : VIEW_INITIAL_HALF;
}
let view = { ...currentViewInitial() };
let svgEl = null;
let zoomInfoEl = null;

function applyView() {
  if (!svgEl) return;
  svgEl.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  const pct = Math.round((currentViewInitial().w / view.w) * 100);
  zoomInfoEl.textContent = pct + '%';
}

function zoomAtClientPoint(clientX, clientY, factor) {
  const VI = currentViewInitial();
  // Convert screen point to SVG user coordinates at current view
  const rect = svgEl.getBoundingClientRect();
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  const svgX = view.x + relX * view.w;
  const svgY = view.y + relY * view.h;
  // Clamp zoom range: 0.2x .. 20x relative to initial
  // Zoom in: up to 20× closer. Zoom out: capped at reset level (cannot zoom out further than initial view).
  const newW = Math.max(VI.w / 20, Math.min(VI.w, view.w * factor));
  const newH = newW * (VI.h / VI.w);
  // Keep cursor-anchored point stable
  view.x = svgX - relX * newW;
  view.y = svgY - relY * newH;
  view.w = newW;
  view.h = newH;
  applyView();
}



// ======================================================================
// Deferred init — called when Geometry page becomes visible
// ======================================================================
function __drawingInit() {
  if (__drawingInit._done) return;
  if (!document.getElementById('midshipSVG')) return;
  __drawingInit._done = true;

  // Lazy-bind DOM refs
  svgEl = document.getElementById('midshipSVG');
  zoomInfoEl = document.getElementById('zoomInfo');

// Mouse wheel zoom (cursor-anchored)
svgEl.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = e.deltaY < 0 ? 0.85 : 1.18; // up = zoom in
  zoomAtClientPoint(e.clientX, e.clientY, factor);
}, { passive: false });

// Pan by drag
let panning = false, panStart = null;
svgEl.addEventListener('pointerdown', (e) => {
  panning = true;
  panStart = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  svgEl.classList.add('panning');
  svgEl.setPointerCapture(e.pointerId);
});
svgEl.addEventListener('pointermove', (e) => {
  if (!panning) return;
  const rect = svgEl.getBoundingClientRect();
  const dx = (e.clientX - panStart.x) * (view.w / rect.width);
  const dy = (e.clientY - panStart.y) * (view.h / rect.height);
  view.x = panStart.vx - dx;
  view.y = panStart.vy - dy;
  applyView();
});
function endPan(e) {
  if (!panning) return;
  panning = false;
  svgEl.classList.remove('panning');
  try { svgEl.releasePointerCapture(e.pointerId); } catch(_) {}
}
svgEl.addEventListener('pointerup', endPan);
svgEl.addEventListener('pointercancel', endPan);
svgEl.addEventListener('pointerleave', endPan);

// Button handlers — zoom around SVG center
function zoomAtCenter(factor) {
  const rect = svgEl.getBoundingClientRect();
  zoomAtClientPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
}
document.getElementById('zoomIn').addEventListener('click', () => zoomAtCenter(0.75));
document.getElementById('zoomOut').addEventListener('click', () => zoomAtCenter(1.333));
document.getElementById('zoomReset').addEventListener('click', () => {
  view = { ...currentViewInitial() };
  applyView();
});

// Mirror body toggle — flips between half (right side only) and full mirrored view
document.getElementById('mirrorToggle').addEventListener('click', () => {
  MIRROR_BODY = !MIRROR_BODY;
  document.getElementById('mirrorToggle').classList.toggle('active', MIRROR_BODY);
  // Reset zoom to fit new viewBox extent
  view = { ...currentViewInitial() };
  applyView();
  render();
});

// Keyboard shortcuts: +, -, 0
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === '+' || e.key === '=') { zoomAtCenter(0.75); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { zoomAtCenter(1.333); e.preventDefault(); }
  else if (e.key === '0') { view = { ...currentViewInitial() }; applyView(); e.preventDefault(); }
});

// Recompute + redraw + rebuild editor. Called when SG / spacing changes,
// or when user clicks the "Auto-recalculate" button.
function recomputeAndRender() {
  computeProfiles();
  renderEditor();
  render();
}

document.getElementById('recalcBtn').addEventListener('click', recomputeAndRender);

// View-mode pills — trigger re-render when changed
document.querySelectorAll('.view-pill').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const mode = e.currentTarget.dataset.viewmode;
    if (!mode || mode === VIEW_MODE) return;
    VIEW_MODE = mode;
    document.querySelectorAll('.view-pill').forEach(b => b.classList.toggle('active', b.dataset.viewmode === mode));
    render();
  });
});

// =========================================================================
// SAVE / LOAD / EXPORT — header actions
// =========================================================================
function saveDrawingJSON() {
  const payload = {
    format: 'MidshipDraw',
    version: 2,
    savedAt: new Date().toISOString(),
    GEOMETRY,
    PARAMS,
    PLATE_THICKNESS,
    SIDE_GIRDERS,
    profiles,
    BAND_ASSIGNMENTS: (typeof window !== 'undefined' && window.BAND_ASSIGNMENTS) ? window.BAND_ASSIGNMENTS : {},
    linkBS_IB,
    linkSS_IS,
    VIEW_MODE,
    WT_FLAGS,
    COMPARTMENTS,
    TRANSVERSE_STIFFS,
    BRACKETS,
    STRAKES,
    STRAKES_AUTO,
    MIRROR_BODY
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `midship_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadDrawingJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.format !== 'MidshipDraw') {
        showError('Invalid file format — not a MidshipDraw JSON.');
        return;
      }
      if (data.GEOMETRY) Object.assign(GEOMETRY, data.GEOMETRY);
      if (data.PARAMS)   Object.assign(PARAMS, data.PARAMS);
      if (data.PLATE_THICKNESS && typeof data.PLATE_THICKNESS === 'object') {
        Object.assign(PLATE_THICKNESS, data.PLATE_THICKNESS);
      }
      if (data.BAND_ASSIGNMENTS && typeof data.BAND_ASSIGNMENTS === 'object') {
        if (typeof window !== 'undefined') {
          window.BAND_ASSIGNMENTS = data.BAND_ASSIGNMENTS;
        }
      }
      // In place, not reassigned: window.Draw.SIDE_GIRDERS was bound to the
    // original array at module load, and 50-analysis.js reads it. Reassigning
    // here left that export pointing at the previously loaded project's
    // girders. Same reason for COMPARTMENTS / TRANSVERSE_STIFFS / BRACKETS.
    if (data.SIDE_GIRDERS) {
      SIDE_GIRDERS.length = 0;
      data.SIDE_GIRDERS.forEach(g => SIDE_GIRDERS.push(g));
    }
      if (data.profiles) {
        ['bottomShell','innerBottom','stringerStiff','tweenStiff','coamingStiff','sideShell','innerSide','stringer','tweenDeck','upperDeck'].forEach(k => {
          if (Array.isArray(data.profiles[k])) profiles[k] = data.profiles[k];
        });
      }
      if (typeof data.linkBS_IB === 'boolean') linkBS_IB = data.linkBS_IB;
      if (typeof data.linkSS_IS === 'boolean') linkSS_IS = data.linkSS_IS;
      if (typeof data.VIEW_MODE === 'string')  {
        VIEW_MODE = data.VIEW_MODE;
        document.querySelectorAll('.view-pill').forEach(b => b.classList.toggle('active', b.dataset.viewmode === VIEW_MODE));
      }
      if (data.WT_FLAGS && typeof data.WT_FLAGS === 'object') {
        Object.assign(WT_FLAGS, data.WT_FLAGS);
      }
      // In place, not reassigned — same reason as importFullState: window.Draw
      // exports these arrays by reference and 50-analysis.js reads them.
      if (Array.isArray(data.COMPARTMENTS)) {
        COMPARTMENTS.length = 0;
        data.COMPARTMENTS.forEach(c => COMPARTMENTS.push(c));
      }
      if (Array.isArray(data.TRANSVERSE_STIFFS)) {
        TRANSVERSE_STIFFS.length = 0;
        data.TRANSVERSE_STIFFS.forEach(t => TRANSVERSE_STIFFS.push(t));
      }
      if (Array.isArray(data.BRACKETS)) {
        BRACKETS.length = 0;
        data.BRACKETS.forEach(b => BRACKETS.push(b));
      }
      if (typeof data.MIRROR_BODY === 'boolean') {
        MIRROR_BODY = data.MIRROR_BODY;
        document.getElementById('mirrorToggle')?.classList.toggle('active', MIRROR_BODY);
        view = { ...currentViewInitial() };
        applyView();
      }
      if (data.STRAKES && typeof data.STRAKES === 'object') {
        if (Array.isArray(data.STRAKES.shell))       STRAKES.shell       = data.STRAKES.shell;
        if (Array.isArray(data.STRAKES.innerBottom)) STRAKES.innerBottom = data.STRAKES.innerBottom;
        if (Array.isArray(data.STRAKES.innerSide))   STRAKES.innerSide   = data.STRAKES.innerSide;
      }
      if (typeof data.STRAKES_AUTO === 'boolean') STRAKES_AUTO = data.STRAKES_AUTO;
      renderEditor();
      render();
    } catch (err) {
      showError('Failed to parse JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
  // Reset input so same file can be re-loaded
  event.target.value = '';
}

// =========================================================================
// DXF EXPORT (AutoCAD R2000 minimal format)
// Conventions:
//   - Units: mm (1 DXF unit = 1 mm)
//   - Coordinate system: X horizontal (from CL toward shell), Y = Z (height above BL)
//   - Half-body only (CL = X=0, right side only)
//   - Plates: two parallel lines offset by thickness on the correct side per user rules:
//       Shell:        outward (away from hull interior) — for bottom = DOWN (-Y), side = OUT (+X), bilge = radial OUT
//       Inner Bottom: upward (+Y away from BL)
//       Inner Side:   outward (+X toward shell)
//       Stringer/Tween/Upper Deck/Coaming top: upward (+Y)
//       Duct wall:    outward (+X, away from CL toward shell)
//       Side Girder:  outward (+X)
//   - Stiffeners: real profile shape (web + flange per L/HP/FB type)
//       - attached plate side: stiff points OPPOSITE to plate thickness direction
//         (i.e. into the tank / DB / hull interior)
//   - Transverse stiffs: single line between two nodes (pink layer)
//   - Brackets / floors: closed polyline of the node polygon (curved on bilge)
// Layers:
//   0_BASELINE, 0_CENTERLINE, SHELL, INNER_BOTTOM, INNER_SIDE, DECKS,
//   COAMING, DUCT, SIDE_GIRDERS, LONG_STIFFS, TRANSVERSE, BRACKETS, ANNOTATION
// =========================================================================
function exportDXF() {
  const g = GEOMETRY;

  // HP bulb-flat catalogue (EN 10067). Dimensions in mm.
  //   b = web height, t = web thickness
  //   c = bulb protrusion (shoulder to bulb tip, outside face)
  //   r = fillet radius
  //
  // Note: this duplicates the main `window.Profile` HP catalog (line ~10946).
  // Any change here should also be made there to keep DXF geometry consistent
  // with calculated section properties.
  const HP_CATALOG = {
    'HP 60x4':  {b:60,  t:4,  c:13, r:3.5},
    'HP 60x5':  {b:60,  t:5,  c:13, r:3.5},
    'HP 60x6':  {b:60,  t:6,  c:13, r:3.5},
    'HP 80x5':  {b:80,  t:5,  c:14, r:4},
    'HP 80x6':  {b:80,  t:6,  c:14, r:4},
    'HP 80x7':  {b:80,  t:7,  c:14, r:4},
    'HP 80x8':  {b:80,  t:8,  c:14, r:4},
    'HP 100x6': {b:100, t:6,  c:15.5, r:4.5},
    'HP 100x7': {b:100, t:7,  c:15.5, r:4.5},
    'HP 100x8': {b:100, t:8,  c:15.5, r:4.5},
    'HP 120x6': {b:120, t:6,  c:17, r:5},
    'HP 120x7': {b:120, t:7,  c:17, r:5},
    'HP 120x8': {b:120, t:8,  c:17, r:5},
    'HP 140x7': {b:140, t:7,  c:19, r:5.5},
    'HP 140x8': {b:140, t:8,  c:19, r:5.5},
    'HP 140x9': {b:140, t:9,  c:19, r:5.5},
    'HP 140x10':{b:140, t:10, c:19, r:5.5},
    'HP 160x7': {b:160, t:7,  c:22, r:6},
    'HP 160x8': {b:160, t:8,  c:22, r:6},
    'HP 160x9': {b:160, t:9,  c:22, r:6},
    'HP 160x10':{b:160, t:10, c:22, r:6},
    'HP 180x8': {b:180, t:8,  c:25, r:7},
    'HP 180x9': {b:180, t:9,  c:25, r:7},
    'HP 180x10':{b:180, t:10, c:25, r:7},
    'HP 180x11':{b:180, t:11, c:25, r:7},
    'HP 200x9': {b:200, t:9,  c:28, r:8},
    'HP 200x10':{b:200, t:10, c:28, r:8},
    'HP 200x11':{b:200, t:11, c:28, r:8},
    'HP 200x12':{b:200, t:12, c:28, r:8},
    'HP 220x10':{b:220, t:10, c:31, r:9},
    'HP 220x11':{b:220, t:11, c:31, r:9},
    'HP 220x12':{b:220, t:12, c:31, r:9},
    'HP 240x10':{b:240, t:10, c:34, r:10},
    'HP 240x11':{b:240, t:11, c:34, r:10},
    'HP 240x12':{b:240, t:12, c:34, r:10},
    'HP 260x11':{b:260, t:11, c:37, r:11},
    'HP 260x12':{b:260, t:12, c:37, r:11},
    'HP 260x13':{b:260, t:13, c:37, r:11},
    'HP 280x12':{b:280, t:12, c:36, r:12},
    'HP 280x13':{b:280, t:13, c:36, r:12},
    'HP 300x12':{b:300, t:12, c:39, r:12},
    'HP 300x13':{b:300, t:13, c:39, r:12},
    'HP 320x12':{b:320, t:12, c:42, r:13},
    'HP 320x13':{b:320, t:13, c:42, r:13},
    'HP 340x12':{b:340, t:12, c:45, r:14},
    'HP 340x14':{b:340, t:14, c:45, r:14},
    'HP 370x13':{b:370, t:13, c:46, r:15},
    'HP 370x15':{b:370, t:15, c:46, r:15},
    'HP 400x14':{b:400, t:14, c:49, r:16},
    'HP 400x16':{b:400, t:16, c:49, r:16},
  };

  // Parse profile name to real dimensions (mm).
  //   "L 250x90x12"    → { type:'L',  webH:250, flangeW:90, t_web:12, t_fl:12 }
  //   "HP 200x10"      → { type:'HP', b:200, t:10, c:28, r:8 }  (from HP_CATALOG)
  //   "FB 150x12"      → { type:'FB', webH:150, flangeW:0,  t_web:12, t_fl:0  }
  const parseProfileName = (name, fallbackType) => {
    const defaults = {
      L:  { type:'L',  webH:150, flangeW:90, t_web:9,  t_fl:9  },
      HP: { type:'HP', b:180, t:10, c:26, r:7 },
      FB: { type:'FB', webH:180, flangeW:0,  t_web:12, t_fl:0  },
    };
    const def = defaults[fallbackType] || defaults.FB;
    if (!name || typeof name !== 'string') return def;
    const s = name.trim();
    // L 250x90x12
    let m = s.match(/^L\s+(\d+)\s*[x×]\s*(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (m) return { type:'L', webH:+m[1], flangeW:+m[2], t_web:+m[3], t_fl:+m[3] };
    // HP 200x10 — use catalog if available
    m = s.match(/^HP\s+(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (m) {
      const key = `HP ${m[1]}x${m[2]}`;
      const cat = HP_CATALOG[key];
      if (cat) return { type:'HP', b:cat.b, t:cat.t, c:cat.c, r:cat.r };
      // Fallback: estimate c and r from web thickness (rough approximation)
      return { type:'HP', b:+m[1], t:+m[2], c:Math.round(+m[2] * 2.6), r:Math.round(+m[2] * 0.75) };
    }
    // FB 150x12
    m = s.match(/^FB\s*(\d+)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (m) return { type:'FB', webH:+m[1], flangeW:0, t_web:+m[2], t_fl:0 };
    return def;
  };

  // Legacy fallback table (used when a stiff has no profile name attached).
  const PROFILE_DIMS = {
    L:  { webH: 150, flangeW: 90,  t_web: 9,  t_fl: 9  },
    HP: { webH: 180, flangeW: 0,   t_web: 10, t_fl: 10 },
    FB: { webH: 180, flangeW: 0,   t_web: 12, t_fl: 0  },
  };

  // DXF helpers ---------------------------------------------------------
  // We use a pre-built R12 template (created by Python ezdxf) that already
  // has a complete, AutoCAD-compliant HEADER, TABLES and BLOCKS section.
  // This helper only generates the ENTITIES content, which is injected
  // into the template at the end via placeholder replacement.
  //
  // The template includes all mandatory AutoCAD R12 structure: VPORT,
  // LTYPE, LAYER, STYLE, VIEW, UCS, APPID, DIMSTYLE tables, plus HEADER
  // variables like $HANDSEED, $CLAYER, $CECOLOR, etc., and a BLOCKS
  // section with $Model_Space and $Paper_Space block definitions.
  //
  // Layers in the template (UY175-2010 Conoship standard):
  //   STEEL CONTINUOUS (1/red), STEEL DASHED (1),
  //   STIFFENERS CONTINUOUS (2/yellow), STIFFENERS DASHED (2),
  //   FLANGE (2), TEXT & POINTERS (7), Plate seam (8)
  let dxf = '';                                     // entities-only buffer
  const pad = (n) => String(n).padStart(3, ' ');    // group-code alignment
  const g2 = (code, val) => { dxf += `${pad(code)}\n${val}\n`; };

  // Layer mapping: internal names → UY175 standard layer names.
  const LAYER_MAP = {
    'BASELINE':       'STEEL_CONTINUOUS',
    'CENTERLINE':     'STEEL_CONTINUOUS',
    'SHELL':          'STEEL_CONTINUOUS',
    'INNER_BOTTOM':   'STEEL_CONTINUOUS',
    'INNER_SIDE':     'STEEL_CONTINUOUS',
    'DECKS':          'STEEL_CONTINUOUS',
    'COAMING':        'STEEL_CONTINUOUS',
    'DUCT':           'STEEL_CONTINUOUS',
    'SIDE_GIRDERS':   'STEEL_CONTINUOUS',
    'LONG_STIFFS':    'STIFFENERS_CONTINUOUS',
    'TRANSVERSE':     'STIFFENERS_CONTINUOUS',
    'BRACKETS':       'STEEL_CONTINUOUS',
    'FLANGE':         'FLANGE',
    'ANNOTATION':     'TEXT_POINTERS',
    'SEAM':           'PLATE_SEAM',
  };
  const mapLayer = (name) => LAYER_MAP[name] || name;

  // Unique handle counter. DXF R12 requires every entity to carry a handle
  // (group code 5, hex string). The template already uses handles up to 0x37,
  // but some DXF readers interpret handle strings as decimal, so a "40" handle
  // (decimal 40 = hex 0x28) can collide with template's 0x28 handle. To avoid
  // any ambiguity, start our counter at 0x1000 — well above any template range
  // and unambiguous in both hex and decimal interpretations.
  let _handleNext = 0x1000;
  const nextHandle = () => (_handleNext++).toString(16).toUpperCase();

  const line = (x1, y1, x2, y2, layer) => {
    g2(0,'LINE'); g2(5, nextHandle()); g2(8, mapLayer(layer));
    g2(10, x1.toFixed(3)); g2(20, y1.toFixed(3)); g2(30, '0.0');
    g2(11, x2.toFixed(3)); g2(21, y2.toFixed(3)); g2(31, '0.0');
  };
  const polyline = (pts, layer, closed) => {
    // R12 POLYLINE (not LWPOLYLINE — LWPOLYLINE only valid in R13+)
    g2(0,'POLYLINE'); g2(5, nextHandle()); g2(8, mapLayer(layer));
    g2(66, 1);                    // "entities follow" flag
    g2(70, closed ? 1 : 0);
    g2(10, '0.0'); g2(20, '0.0'); g2(30, '0.0');
    pts.forEach(p => {
      g2(0,'VERTEX'); g2(5, nextHandle()); g2(8, mapLayer(layer));
      g2(10, p[0].toFixed(3)); g2(20, p[1].toFixed(3)); g2(30, '0.0');
    });
    g2(0,'SEQEND'); g2(5, nextHandle()); g2(8, mapLayer(layer));
  };
  const arc = (cx, cy, r, startDeg, endDeg, layer) => {
    g2(0,'ARC'); g2(5, nextHandle()); g2(8, mapLayer(layer));
    g2(10, cx.toFixed(3)); g2(20, cy.toFixed(3)); g2(30, '0.0');
    g2(40, r.toFixed(3));
    g2(50, startDeg.toFixed(3)); g2(51, endDeg.toFixed(3));
  };
  const text = (x, y, h, txt, layer) => {
    g2(0,'TEXT'); g2(5, nextHandle()); g2(8, mapLayer(layer));
    g2(10, x.toFixed(3)); g2(20, y.toFixed(3)); g2(30, '0.0');
    g2(40, h.toFixed(3));
    g2(1, String(txt).replace(/[\r\n]/g, ' '));   // sanitize
  };
  // Material label for annotations — from params (AH36, DH36, etc.)
  const MATERIAL_NAME = (window.getParams ? (window.getParams().matKey || 'AH36') : 'AH36');

  // DXF_TEMPLATE: complete R12 skeleton generated by Python ezdxf.
  // Placeholders <<<EXTMIN_X>>>, <<<EXTMIN_Y>>>, <<<EXTMAX_X>>>, <<<EXTMAX_Y>>>,
  // and <<<ENTITIES>>> are replaced at the end of this function.
  const DXF_TEMPLATE = "  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1009\n  9\n$DWGCODEPAGE\n  3\nANSI_1252\n  9\n$INSBASE\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$EXTMIN\n 10\n<<<EXTMIN_X>>>\n 20\n<<<EXTMIN_Y>>>\n 30\n0.0\n  9\n$EXTMAX\n 10\n<<<EXTMAX_X>>>\n 20\n<<<EXTMAX_Y>>>\n 30\n0.0\n  9\n$LIMMIN\n 10\n0.0\n 20\n0.0\n  9\n$LIMMAX\n 10\n420.0\n 20\n297.0\n  9\n$ORTHOMODE\n 70\n0\n  9\n$REGENMODE\n 70\n1\n  9\n$FILLMODE\n 70\n1\n  9\n$DRAGMODE\n 70\n2\n  9\n$QTEXTMODE\n 70\n0\n  9\n$MIRRTEXT\n 70\n1\n  9\n$OSMODE\n 70\n20583\n  9\n$LTSCALE\n 40\n1.0\n  9\n$ATTMODE\n 70\n1\n  9\n$TEXTSIZE\n 40\n2.5\n  9\n$TRACEWID\n 40\n1.0\n  9\n$TEXTSTYLE\n  7\nStandard\n  9\n$CLAYER\n  8\n0\n  9\n$CELTYPE\n  6\nByLayer\n  9\n$CECOLOR\n 62\n256\n  9\n$DIMSCALE\n 40\n1.0\n  9\n$DIMASZ\n 40\n2.5\n  9\n$DIMEXO\n 40\n0.625\n  9\n$DIMDLI\n 40\n3.75\n  9\n$DIMRND\n 40\n0.0\n  9\n$DIMDLE\n 40\n0.0\n  9\n$DIMEXE\n 40\n1.25\n  9\n$DIMTP\n 40\n0.0\n  9\n$DIMTM\n 40\n0.0\n  9\n$DIMTXT\n 40\n2.5\n  9\n$DIMCEN\n 40\n2.5\n  9\n$DIMTSZ\n 40\n0.0\n  9\n$DIMTOL\n 70\n0\n  9\n$DIMLIM\n 70\n0\n  9\n$DIMTIH\n 70\n0\n  9\n$DIMTOH\n 70\n0\n  9\n$DIMSE1\n 70\n0\n  9\n$DIMSE2\n 70\n0\n  9\n$DIMTAD\n 70\n1\n  9\n$DIMZIN\n 70\n8\n  9\n$DIMBLK\n  1\n\n  9\n$DIMASO\n 70\n1\n  9\n$DIMSHO\n 70\n1\n  9\n$DIMPOST\n  1\n\n  9\n$DIMAPOST\n  1\n\n  9\n$DIMALT\n 70\n0\n  9\n$DIMALTD\n 70\n3\n  9\n$DIMALTF\n 40\n0.03937007874\n  9\n$DIMLFAC\n 40\n1.0\n  9\n$DIMTOFL\n 70\n1\n  9\n$DIMTVP\n 40\n0.0\n  9\n$DIMTIX\n 70\n0\n  9\n$DIMSOXD\n 70\n0\n  9\n$DIMSAH\n 70\n0\n  9\n$DIMBLK1\n  1\n\n  9\n$DIMBLK2\n  1\n\n  9\n$DIMSTYLE\n  2\nISO-25\n  9\n$DIMCLRD\n 70\n0\n  9\n$DIMCLRE\n 70\n0\n  9\n$DIMCLRT\n 70\n0\n  9\n$DIMTFAC\n 40\n1.0\n  9\n$DIMGAP\n 40\n0.625\n  9\n$COORDS\n 70\n1\n  9\n$ATTDIA\n 70\n0\n  9\n$ATTREQ\n 70\n1\n  9\n$HANDLING\n 70\n1\n  9\n$LUNITS\n 70\n2\n  9\n$LUPREC\n 70\n4\n  9\n$SKETCHINC\n 40\n1.0\n  9\n$FILLETRAD\n 40\n10.0\n  9\n$AUNITS\n 70\n0\n  9\n$AUPREC\n 70\n2\n  9\n$MENU\n  1\n.\n  9\n$ELEVATION\n 40\n0.0\n  9\n$PELEVATION\n 40\n0.0\n  9\n$THICKNESS\n 40\n0.0\n  9\n$LIMCHECK\n 70\n0\n  9\n$CHAMFERA\n 40\n0.0\n  9\n$CHAMFERB\n 40\n0.0\n  9\n$SKPOLY\n 70\n0\n  9\n$TDCREATE\n 40\n2461153.908587963\n  9\n$TDUPDATE\n 40\n2461153.908587963\n  9\n$TDINDWG\n 40\n0.0\n  9\n$TDUSRTIMER\n 40\n0.0\n  9\n$USRTIMER\n 70\n1\n  9\n$ANGBASE\n 50\n0.0\n  9\n$ANGDIR\n 70\n0\n  9\n$PDMODE\n 70\n0\n  9\n$PDSIZE\n 40\n0.0\n  9\n$PLINEWID\n 40\n0.0\n  9\n$SPLFRAME\n 70\n0\n  9\n$SPLINETYPE\n 70\n6\n  9\n$SPLINESEGS\n 70\n8\n  9\n$HANDSEED\n  5\n<<<HANDSEED>>>\n  9\n$SURFTAB1\n 70\n6\n  9\n$SURFTAB2\n 70\n6\n  9\n$SURFTYPE\n 70\n6\n  9\n$SURFU\n 70\n6\n  9\n$SURFV\n 70\n6\n  9\n$UCSNAME\n  2\n\n  9\n$UCSORG\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSXDIR\n 10\n1.0\n 20\n0.0\n 30\n0.0\n  9\n$UCSYDIR\n 10\n0.0\n 20\n1.0\n 30\n0.0\n  9\n$PUCSNAME\n  2\n\n  9\n$PUCSORG\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSXDIR\n 10\n1.0\n 20\n0.0\n 30\n0.0\n  9\n$PUCSYDIR\n 10\n0.0\n 20\n1.0\n 30\n0.0\n  9\n$USERI1\n 70\n0\n  9\n$USERI2\n 70\n0\n  9\n$USERI3\n 70\n0\n  9\n$USERI4\n 70\n0\n  9\n$USERI5\n 70\n0\n  9\n$USERR1\n 40\n0.0\n  9\n$USERR2\n 40\n0.0\n  9\n$USERR3\n 40\n0.0\n  9\n$USERR4\n 40\n0.0\n  9\n$USERR5\n 40\n0.0\n  9\n$WORLDVIEW\n 70\n1\n  9\n$SHADEDGE\n 70\n3\n  9\n$SHADEDIF\n 70\n70\n  9\n$TILEMODE\n 70\n1\n  9\n$MAXACTVP\n 70\n64\n  9\n$PLIMCHECK\n 70\n0\n  9\n$PEXTMIN\n 10\n1e+20\n 20\n1e+20\n 30\n1e+20\n  9\n$PEXTMAX\n 10\n-1e+20\n 20\n-1e+20\n 30\n-1e+20\n  9\n$PLIMMIN\n 10\n0.0\n 20\n0.0\n  9\n$PLIMMAX\n 10\n420.0\n 20\n297.0\n  9\n$UNITMODE\n 70\n0\n  9\n$VISRETAIN\n 70\n1\n  9\n$PLINEGEN\n 70\n0\n  9\n$PSLTSCALE\n 70\n1\n  0\nENDSEC\n  0\nSECTION\n  2\nTABLES\n  0\nTABLE\n  2\nVPORT\n 70\n1\n  0\nVPORT\n  5\n23\n  2\n*Active\n 70\n0\n 10\n0.0\n 20\n0.0\n 11\n1.0\n 21\n1.0\n 12\n0.0\n 22\n0.0\n 13\n0.0\n 23\n0.0\n 14\n0.5\n 24\n0.5\n 15\n0.5\n 25\n0.5\n 16\n0.0\n 26\n0.0\n 36\n1.0\n 17\n0.0\n 27\n0.0\n 37\n0.0\n 40\n1000.0\n 41\n1.34\n 42\n50.0\n 43\n0.0\n 44\n0.0\n 50\n0.0\n 51\n0.0\n 71\n0\n 72\n1000\n 73\n1\n 74\n3\n 75\n0\n 76\n0\n 77\n0\n 78\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nLTYPE\n 70\n4\n  0\nLTYPE\n  5\n24\n  2\nByBlock\n 70\n0\n  3\n\n 72\n65\n 73\n0\n 40\n0.0\n  0\nLTYPE\n  5\n25\n  2\nByLayer\n 70\n0\n  3\n\n 72\n65\n 73\n0\n 40\n0.0\n  0\nLTYPE\n  5\n26\n  2\nContinuous\n 70\n0\n  3\n\n 72\n65\n 73\n0\n 40\n0.0\n  0\nLTYPE\n  5\n2D\n  2\nDASHED\n 70\n0\n  3\nDashed __ __ __ __\n 72\n65\n 73\n2\n 40\n0.0\n 49\n12.7\n 49\n-6.35\n  0\nENDTAB\n  0\nTABLE\n  2\nLAYER\n 70\n9\n  0\nLAYER\n  5\n27\n  2\n0\n 70\n0\n 62\n7\n  6\nContinuous\n  0\nLAYER\n  5\n28\n  2\nDefpoints\n 70\n0\n 62\n7\n  6\nContinuous\n  0\nLAYER\n  5\n2E\n  2\nSTEEL_CONTINUOUS\n 70\n0\n 62\n1\n  6\nContinuous\n  0\nLAYER\n  5\n2F\n  2\nSTEEL_DASHED\n 70\n0\n 62\n1\n  6\nDASHED\n  0\nLAYER\n  5\n30\n  2\nSTIFFENERS_CONTINUOUS\n 70\n0\n 62\n2\n  6\nContinuous\n  0\nLAYER\n  5\n31\n  2\nSTIFFENERS_DASHED\n 70\n0\n 62\n2\n  6\nDASHED\n  0\nLAYER\n  5\n32\n  2\nFLANGE\n 70\n0\n 62\n2\n  6\nContinuous\n  0\nLAYER\n  5\n33\n  2\nTEXT_POINTERS\n 70\n0\n 62\n7\n  6\nContinuous\n  0\nLAYER\n  5\n34\n  2\nPLATE_SEAM\n 70\n0\n 62\n8\n  6\nContinuous\n  0\nENDTAB\n  0\nTABLE\n  2\nSTYLE\n 70\n1\n  0\nSTYLE\n  5\n29\n  2\nStandard\n 70\n0\n 40\n0.0\n 41\n1.0\n 50\n0.0\n 71\n0\n 42\n2.5\n  3\ntxt\n  4\n\n  0\nENDTAB\n  0\nTABLE\n  2\nVIEW\n 70\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nUCS\n 70\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nAPPID\n 70\n3\n  0\nAPPID\n  5\n2A\n  2\nACAD\n 70\n0\n  0\nAPPID\n  5\n35\n  2\nHATCHBACKGROUNDCOLOR\n 70\n0\n  0\nAPPID\n  5\n36\n  2\nEZDXF\n 70\n0\n  0\nENDTAB\n  0\nTABLE\n  2\nDIMSTYLE\n 70\n1\n  0\nDIMSTYLE\n105\n2B\n  2\nStandard\n 70\n0\n  3\n\n  4\n\n  5\n\n  6\n\n  7\n\n 40\n1.0\n 41\n2.5\n 42\n0.625\n 43\n3.75\n 44\n1.25\n 45\n0.0\n 46\n0.0\n 47\n0.0\n 48\n0.0\n140\n2.5\n141\n2.5\n142\n0.0\n143\n0.03937007874\n144\n1.0\n145\n0.0\n146\n1.0\n147\n0.625\n 71\n0\n 72\n0\n 73\n0\n 74\n0\n 75\n0\n 76\n0\n 77\n1\n 78\n8\n170\n0\n171\n3\n172\n1\n173\n0\n174\n0\n175\n0\n176\n0\n177\n0\n178\n0\n  0\nENDTAB\n  0\nENDSEC\n  0\nSECTION\n  2\nBLOCKS\n  0\nBLOCK\n  5\n18\n  8\n0\n  2\n$Model_Space\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n$Model_Space\n  1\n\n1001\nEZDXF\n1000\nCREATED_BY_EZDXF\n1000\n1.4.3 @ 2026-04-22T21:48:22.926895+00:00\n1000\nWRITTEN_BY_EZDXF\n1000\n1.4.3 @ 2026-04-22T21:48:22.928872+00:00\n  0\nENDBLK\n  5\n19\n  8\n0\n  0\nBLOCK\n  5\n1C\n  8\n0\n  2\n$Paper_Space\n 70\n0\n 10\n0.0\n 20\n0.0\n 30\n0.0\n  3\n$Paper_Space\n  1\n\n  0\nENDBLK\n  5\n1D\n  8\n0\n  0\nENDSEC\n  0\nSECTION\n  2\nENTITIES\n<<<ENTITIES>>>\n  0\nENDSEC\n  0\nEOF\n";


  // ---- Baseline & Centerline reference ----
  line(-50, 0, g.B_half + 50, 0, 'BASELINE');
  line(0, -50, 0, g.HC + 50, 'CENTERLINE');
  text(g.B_half + 55, -3, 25, 'BL', 'ANNOTATION');
  text(-45, -5, 25, 'CL', 'ANNOTATION');

  // ====================================================================
  // PLATES (drawn as two lines: centerline + offset by thickness)
  // Shell strakes walk along the hull path; bottom+side are straight lines,
  // bilge is a quarter-arc.
  // Inner Bottom: horizontal at Z=IB (thickness UP = +Y)
  // Inner Side: vertical at Y=IS (thickness OUT = +X toward shell)
  // Decks: horizontal plates (thickness UP = +Y)
  // Coaming top: horizontal at Z=HC (thickness UP)
  // Duct wall: vertical at Y=duct_half (thickness OUT = +X per user)
  // Side Girders: vertical (thickness OUT = +X per user)
  // ====================================================================

  // --- SHELL: walk strake-by-strake along keel → bottom → bilge → side
  {
    const L = shellGeometryLengths();
    // Shell inside/outside: user rule says "dışarı" (outward from hull body)
    // For bottom (z=0, horizontal segment): outside = DOWN (−Y direction, below BL)
    // For bilge arc (center at y=B_half−R_B, z=R_B, radius R_B): outside = RADIALLY OUT (away from arc center)
    // For side (y=B_half, vertical): outside = +X (toward higher Y in our DXF mapping = away from CL)
    let cursor = 0;
    STRAKES.shell.forEach((s, idx) => {
      const t = s.thickness;
      const segStart = cursor;
      const segEnd   = Math.min(cursor + s.width, L.total);

      // Figure out which segment this strake falls in and map to DXF coords.
      // All shell mapping is piecewise: keel, bottom, bilge arc, side.
      // NOTE: in DXF Y = real Z (BL=0), X = real Y (CL=0).
      const mapShellPathToXY = (pathS) => {
        if (pathS <= L.keel) {
          // Keel: X from 0 to keel_half at Z=0
          return { x: pathS, y: 0, tangent: [1, 0], normalOut: [0, -1] };
        } else if (pathS <= L.keel + L.bottom) {
          // Bottom straight: X from keel_half to (B_half - R_B) at Z=0
          const s = pathS - L.keel;
          return { x: g.keel_half + s, y: 0, tangent: [1, 0], normalOut: [0, -1] };
        } else if (pathS <= L.keel + L.bottom + L.bilge) {
          // Bilge quarter-arc
          const s = pathS - L.keel - L.bottom;
          const theta = (s / L.bilge) * (Math.PI / 2);
          // Center at (g.B_half - g.R_B, g.R_B)
          const cx = g.B_half - g.R_B, cy = g.R_B;
          const x = cx + g.R_B * Math.sin(theta);
          const y = cy - g.R_B * Math.cos(theta);
          // Outward normal (away from center): radial out
          const nx = (x - cx) / g.R_B, ny = (y - cy) / g.R_B;
          return { x, y, normalOut: [nx, ny] };
        } else {
          // Side: X = B_half, Y from R_B upward
          const s = pathS - L.keel - L.bottom - L.bilge;
          return { x: g.B_half, y: g.R_B + s, tangent: [0, 1], normalOut: [1, 0] };
        }
      };

      // Determine if strake is keel / bottom / bilge / side for drawing method
      const midS = (segStart + segEnd) / 2;
      const isBilge = midS > L.keel + L.bottom && midS < L.keel + L.bottom + L.bilge;

      if (isBilge) {
        // Bilge strake: draw as two concentric arcs (center at (B_half-R_B, R_B))
        const cx = g.B_half - g.R_B, cy = g.R_B;
        const s0 = segStart - L.keel - L.bottom;
        const s1 = segEnd - L.keel - L.bottom;
        const th0 = (s0 / L.bilge) * 90;         // degrees: 0° = downward (bottom tangent)
        const th1 = (s1 / L.bilge) * 90;
        // Inner arc: radius R_B
        // Outer arc: radius R_B + t
        // DXF ARC angles: 0° = +X axis, counterclockwise.
        // Bottom tangent point (bilge start) at bottom of arc = (cx, cy-R_B) → angle 270°
        // Side tangent point (bilge end) at right of arc = (cx+R_B, cy) → angle 0° (=360°)
        // So sweep from 270° to 360° (90° total).
        const startDeg = 270 + th0;
        const endDeg   = 270 + th1;
        arc(cx, cy, g.R_B,       startDeg, endDeg, 'SHELL');
        arc(cx, cy, g.R_B + t,   startDeg, endDeg, 'SHELL');
        // Short radial ticks at each strake boundary connecting inner to outer
        const p0 = mapShellPathToXY(segStart);
        const p1 = mapShellPathToXY(segEnd);
        line(p0.x, p0.y, p0.x + p0.normalOut[0]*t, p0.y + p0.normalOut[1]*t, 'SHELL');
        line(p1.x, p1.y, p1.x + p1.normalOut[0]*t, p1.y + p1.normalOut[1]*t, 'SHELL');
      } else {
        // Straight segment (keel / bottom / side): two parallel lines
        const p0 = mapShellPathToXY(segStart);
        const p1 = mapShellPathToXY(segEnd);
        const nx = p0.normalOut[0], ny = p0.normalOut[1];
        // Inner (plate center) line
        line(p0.x, p0.y, p1.x, p1.y, 'SHELL');
        // Outer (offset by thickness) line
        line(p0.x + nx*t, p0.y + ny*t, p1.x + nx*t, p1.y + ny*t, 'SHELL');
        // Seam end caps (short perpendicular segments) only at very first and last strake ends
        if (idx === 0) line(p0.x, p0.y, p0.x + nx*t, p0.y + ny*t, 'SHELL');
        if (idx === STRAKES.shell.length - 1) line(p1.x, p1.y, p1.x + nx*t, p1.y + ny*t, 'SHELL');
      }
      cursor = segEnd;
    });
  }

  // --- INNER BOTTOM: horizontal plate at y=IB, x from 0 to B_half, thickness UP (+Y)
  STRAKES.innerBottom.reduce((cursor, s) => {
    const t = s.thickness;
    const x0 = cursor, x1 = cursor + s.width;
    line(x0, g.IB,     x1, g.IB,     'INNER_BOTTOM');
    line(x0, g.IB + t, x1, g.IB + t, 'INNER_BOTTOM');
    // End caps at first and last
    if (cursor === 0) line(x0, g.IB, x0, g.IB + t, 'INNER_BOTTOM');
    if (x1 >= g.B_half - 0.1) line(x1, g.IB, x1, g.IB + t, 'INNER_BOTTOM');
    return x1;
  }, 0);

  // --- INNER SIDE: vertical plate at x=IS, from IB to UD only.
  // Coaming walls (UD → HC) are drawn separately below as an independent box.
  // Filter out coaming-wall strakes so cursor doesn't run past HC.
  const isBaseStrakes = STRAKES.innerSide.filter(s => s.kind !== 'coamingWall');
  const isInboardCoam = STRAKES.innerSide.find(s => s.kind === 'coamingWall' && s.side === 'inboard');
  const isOutboardCoam = STRAKES.innerSide.find(s => s.kind === 'coamingWall' && s.side === 'outboard');
  {
    let cursor = g.IB;
    isBaseStrakes.forEach((s, idx) => {
      const t = s.thickness;
      const y0 = cursor, y1 = cursor + s.width;
      line(g.IS,     y0, g.IS,     y1, 'INNER_SIDE');
      line(g.IS + t, y0, g.IS + t, y1, 'INNER_SIDE');
      if (idx === 0) line(g.IS, y0, g.IS + t, y0, 'INNER_SIDE');  // bottom cap at IB
      cursor = y1;
    });
    // Top cap at UD (IS plate terminates at Upper Deck level)
    const topT = isBaseStrakes[isBaseStrakes.length-1]?.thickness || 11;
    line(g.IS, cursor, g.IS + topT, cursor, 'INNER_SIDE');
  }

  // --- COAMING BOX (independent closed box sitting on top of Upper Deck)
  // Left wall:  Y=IS,             Z: UD → HC
  // Right wall: Y=IS+coamingTop,  Z: UD → HC
  // Top plate:  Y: IS → IS+coamingTop, Z=HC
  // Bottom:     the UD plate itself (already drawn as 'DECKS').
  if (PARAMS.coamingTop > 0) {
    const tInb = isInboardCoam?.thickness || PLATE_THICKNESS.coaming || 20;
    const tOut = isOutboardCoam?.thickness || PLATE_THICKNESS.coaming || 20;
    const xLeft  = g.IS;
    const xRight = g.IS + PARAMS.coamingTop;

    // Left (inboard) wall — thickness goes INTO the box (+X from the wall line)
    line(xLeft,       g.UD, xLeft,       g.HC, 'COAMING');
    line(xLeft + tInb, g.UD, xLeft + tInb, g.HC, 'COAMING');
    line(xLeft,       g.UD, xLeft + tInb, g.UD, 'COAMING');
    line(xLeft,       g.HC, xLeft + tInb, g.HC, 'COAMING');

    // Right (outboard) wall — thickness goes INTO the box (−X from the wall line)
    line(xRight,        g.UD, xRight,        g.HC, 'COAMING');
    line(xRight - tOut, g.UD, xRight - tOut, g.HC, 'COAMING');
    line(xRight - tOut, g.UD, xRight,        g.UD, 'COAMING');
    line(xRight - tOut, g.HC, xRight,        g.HC, 'COAMING');
  }

  // --- STRINGER DECK(s): horizontal, from IS to B_half, thickness UP
  const tStringer = PLATE_THICKNESS.stringer;
  profiles.stringer.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) {
      line(g.IS, p.z,             g.B_half, p.z,             'DECKS');
      line(g.IS, p.z + tStringer, g.B_half, p.z + tStringer, 'DECKS');
      line(g.IS,      p.z, g.IS,      p.z + tStringer, 'DECKS');
      line(g.B_half,  p.z, g.B_half,  p.z + tStringer, 'DECKS');
    }
  });

  // --- TWEEN DECK(s): same as stringer
  const tTween = PLATE_THICKNESS.tween;
  profiles.tweenDeck.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) {
      line(g.IS, p.z,            g.B_half, p.z,            'DECKS');
      line(g.IS, p.z + tTween,   g.B_half, p.z + tTween,   'DECKS');
      line(g.IS,     p.z, g.IS,      p.z + tTween, 'DECKS');
      line(g.B_half, p.z, g.B_half,  p.z + tTween, 'DECKS');
    }
  });

  // --- UPPER DECK: horizontal, from IS to B_half (hatch opening means CL..IS is void)
  {
    const t = PLATE_THICKNESS.upperDeck;
    line(g.IS,     g.UD,     g.B_half, g.UD,     'DECKS');
    line(g.IS,     g.UD + t, g.B_half, g.UD + t, 'DECKS');
    line(g.IS,     g.UD, g.IS,     g.UD + t, 'DECKS');
    line(g.B_half, g.UD, g.B_half, g.UD + t, 'DECKS');
  }

  // --- COAMING TOP PLATE: horizontal plate at Z=HC, capping the box.
  if (PARAMS.coamingTop > 0) {
    const t = PLATE_THICKNESS.coaming;
    const xEnd = g.IS + PARAMS.coamingTop;
    line(g.IS, g.HC,     xEnd, g.HC,     'COAMING');
    line(g.IS, g.HC + t, xEnd, g.HC + t, 'COAMING');
    line(g.IS, g.HC, g.IS, g.HC + t, 'COAMING');
    line(xEnd, g.HC, xEnd, g.HC + t, 'COAMING');
  }

  // --- DUCT WALL: vertical at y=duct_half, z from 0 to IB, thickness OUT (+X per user rule)
  {
    const t = PLATE_THICKNESS.duct;
    line(g.duct_half,     0, g.duct_half,     g.IB, 'DUCT');
    line(g.duct_half + t, 0, g.duct_half + t, g.IB, 'DUCT');
    line(g.duct_half, 0,    g.duct_half + t, 0,    'DUCT');
    line(g.duct_half, g.IB, g.duct_half + t, g.IB, 'DUCT');
  }

  // --- SIDE GIRDERS: vertical, y from 0 to IB, thickness OUT (+X per user rule)
  SIDE_GIRDERS.forEach((sg, i) => {
    const t = PLATE_THICKNESS.sideGirder;
    if (sg.y <= g.duct_half || sg.y >= g.B_half - g.R_B) return;
    line(sg.y,     0, sg.y,     g.IB, 'SIDE_GIRDERS');
    line(sg.y + t, 0, sg.y + t, g.IB, 'SIDE_GIRDERS');
    line(sg.y, 0,    sg.y + t, 0,    'SIDE_GIRDERS');
    line(sg.y, g.IB, sg.y + t, g.IB, 'SIDE_GIRDERS');
    text(sg.y + t + 15, g.IB / 2, 20, `SG${i+1}`, 'ANNOTATION');
  });

  // ====================================================================
  // LONGITUDINAL STIFFENERS — real profile shape (L/HP/FB)
  // Stiff direction rule: OPPOSITE to plate thickness direction.
  //   Bottom shell (plate down) → stiff UP (+Y)
  //   Inner Bottom (plate up)   → stiff DOWN (−Y)
  //   Side shell (plate +X)     → stiff −X (into tank)
  //   Inner Side (plate +X)     → stiff −X (into tank, toward CL)
  //   Decks (plate up)          → stiff DOWN
  //   Coaming top (plate up)    → stiff DOWN
  //   Upper Deck (plate up)     → stiff DOWN
  // Flange orientation: toward CL for horizontal plates (pointing to −X)
  //                     downward (−Y) for vertical plates (side, IS)
  // ====================================================================
  // Generic stiff drawer. anchor = (x,y) plate attachment point.
  //   webDir   : [dx,dy] unit vector along the web (away from plate)
  //   flangeDir: [dx,dy] unit vector along the flange, perpendicular to web
  //   type       : 'L' | 'HP' | 'FB' (fallback if profileName missing)
  //   profileName : optional string like 'HP 200x10' to use real dimensions
  const drawStiff = (x, y, webDir, flangeDir, type, layer, profileName) => {
    const d = profileName
      ? parseProfileName(profileName, type)
      : (PROFILE_DIMS[type] ? { type, ...PROFILE_DIMS[type] } : { type:'FB', ...PROFILE_DIMS.FB });

    // HP is drawn as a complete 9-point polygon (web + bulb in one outline),
    // so skip the L/FB-style "web rectangle" pass.
    if (d.type !== 'HP') {
      const wh = d.webH, tw = d.t_web;
      const ax = x, ay = y;
      const bx = x + webDir[0]*wh, by = y + webDir[1]*wh;
      const offx = flangeDir[0]*tw, offy = flangeDir[1]*tw;
      // Web as closed rectangle (4 lines) on STIFFENERS layer
      line(ax, ay, bx, by, layer);
      line(ax + offx, ay + offy, bx + offx, by + offy, layer);
      line(ax, ay, ax + offx, ay + offy, layer);
      line(bx, by, bx + offx, by + offy, layer);

      // L flange as rectangle at web tip
      if (d.type === 'L' && d.flangeW > 0) {
        const fw = d.flangeW, tf = d.t_fl;
        const fx0 = bx, fy0 = by;
        const fx1 = bx + flangeDir[0]*fw, fy1 = by + flangeDir[1]*fw;
        const fox = -webDir[0]*tf, foy = -webDir[1]*tf;
        line(fx0, fy0, fx1, fy1, 'FLANGE');
        line(fx0 + fox, fy0 + foy, fx1 + fox, fy1 + foy, 'FLANGE');
        line(fx0, fy0, fx0 + fox, fy0 + foy, 'FLANGE');
        line(fx1, fy1, fx1 + fox, fy1 + foy, 'FLANGE');
      }
    } else {
      // HP profile (EN 10067 / bulb-flat) — drawn as 9-point polygon.
      // Local frame (before rotation): web goes +Y up, bulb protrudes +X.
      //   bS = b (full web+bulb height)
      //   tS = t (web thickness)
      //   cS = c (bulb protrusion)
      //   rS = r (fillet radius)
      // Geometry adapted from EN 10067 catalog drawing (30° shoulder angles).
      const bS = d.b, tS = d.t, cS = d.c, rS = d.r;
      const sa = 30 * Math.PI / 180;
      const si = Math.sin(sa), co = Math.cos(sa);
      const bTX = tS/2 + cS;              // bulb tip X (outside face)
      const bSY = bS - cS;                // bulb bottom Y on inside
      const uTX = tS/2 + rS*si,  uTY = bSY + rS*(1 - co);
      const lRCX = bTX - rS;
      const lTX = lRCX + rS*si,   lTY = bS - rS - rS*co;
      // 9 local points (counter-clockwise from bottom-left)
      const localPts = [
        { x: -tS/2,           y: 0              },  // 0 bottom-left (plate)
        { x: -tS/2,           y: bS - rS*0.4    },  // 1 upper left
        { x: -tS/2 + rS*0.4,  y: bS             },  // 2 top-left corner (after fillet)
        { x: lRCX,            y: bS             },  // 3 top-right before bulb nose
        { x: bTX,             y: bS - rS        },  // 4 bulb tip (outermost)
        { x: lTX,             y: lTY            },  // 5 bulb lower outer
        { x: uTX,             y: uTY            },  // 6 bulb lower inner (shoulder)
        { x: tS/2,            y: bSY - rS       },  // 7 right face of web (below shoulder)
        { x: tS/2,            y: 0              },  // 8 bottom-right (plate)
      ];

      // Map local → global using webDir (local +Y) and flangeDir (local +X).
      //   webDir  = direction of web up from base (e.g. [0,1] for bottom shell)
      //   flangeDir = direction bulb protrudes (same convention as L profile)
      //   anchor = (x, y) — base center on the plate surface
      const mapLocal = (lp) => ({
        X: x + flangeDir[0]*lp.x + webDir[0]*lp.y,
        Y: y + flangeDir[1]*lp.x + webDir[1]*lp.y,
      });
      const gp = localPts.map(mapLocal);

      // Draw as closed polyline (line segments between consecutive points).
      for (let i = 0; i < gp.length; i++) {
        const a = gp[i], b = gp[(i + 1) % gp.length];
        line(a.X, a.Y, b.X, b.Y, 'FLANGE');
      }
    }
    // FB has no flange / bulb — web rectangle is enough.
  };

  // Resolve per-group profile names from the Scantling page dropdowns.
  // Used as the 7th arg to drawStiff so the DXF gets real dimensions
  // (HP 200x10 looks different from HP 300x13, etc.)
  const getProf = (selId) => {
    try { return document.getElementById(selId)?.value || ''; } catch(e) { return ''; }
  };
  const profName = {
    bottom:   getProf('bottomLongProfile'),
    ib:       getProf('ibLongProfile') || getProf('bottomLongProfile'),
    side:     getProf('sideGroupProfile_G1') || getProf('bottomLongProfile'),
    is:       getProf('innerSideGroupProfile_IS1') || getProf('bottomLongProfile'),
    str:      getProf('strDeckProfile'),
    twn:      getProf('twnDeckProfile'),
    ud:       getProf('deckLongProfile'),
    coaming:  getProf('coamingProfile'),
  };

  // Bottom shell stiffs: web UP (+Y), flange toward CL (−X)
  profiles.bottomShell.forEach(p => {
    // Allow y=0 (CL) and y=300 (offset CL per May 2026 spec); suppress
    // other in-duct stiffeners.
    const insideDuct = g.duct_half > 0 && p.y > 0 && p.y < g.duct_half
                       && Math.abs(p.y - 300) > 1;
    if (insideDuct) return;
    if (p.y > g.B_half - g.R_B) return;  // past bilge start
    drawStiff(p.y, 0, [0,1], [-1,0], PARAMS.profTypeBottom, 'LONG_STIFFS', p.profileName || profName.bottom);
  });
  // Inner Bottom stiffs: web DOWN (−Y), flange toward CL (−X)
  profiles.innerBottom.forEach(p => {
    const insideDuct = g.duct_half > 0 && p.y > 0 && p.y < g.duct_half
                       && Math.abs(p.y - 300) > 1;
    if (insideDuct) return;
    if (p.y >= g.B_half) return;
    drawStiff(p.y, g.IB, [0,-1], [-1,0], PARAMS.profTypeIB, 'LONG_STIFFS', p.profileName || profName.ib);
  });
  // Side shell stiffs: web toward CL (−X), flange DOWN (−Y)
  profiles.sideShell.forEach(p => {
    if (p.z <= g.IB || p.z >= g.UD) return;
    drawStiff(g.B_half, p.z, [-1,0], [0,-1], PARAMS.profTypeSide, 'LONG_STIFFS', p.profileName || profName.side);
  });
  // Inner Side stiffs: web toward SHELL (+X, outward into ballast tank space).
  // IS wall has cargo on inboard side and ballast on outboard — stiffeners are
  // placed in the ballast (outboard) side so cargo hold surface stays flat.
  // Stiffs only exist on IS plate itself (IB → UD), not on coaming walls.
  profiles.innerSide.forEach(p => {
    if (p.z <= g.IB || p.z >= g.UD) return;
    drawStiff(g.IS, p.z, [1,0], [0,-1], PARAMS.profTypeIS, 'LONG_STIFFS', p.profileName || profName.is);
  });
  // Stringer deck stiffs: web DOWN, flange toward CL
  profiles.stringer.forEach(plate => {
    if (plate.z <= g.IB || plate.z >= g.UD) return;
    profiles.stringerStiff.forEach(p => {
      if (p.y > g.IS && p.y < g.B_half) {
        drawStiff(p.y, plate.z, [0,-1], [-1,0], PARAMS.profTypeStringer, 'LONG_STIFFS', p.profileName || profName.str);
      }
    });
  });
  // Tween deck stiffs
  profiles.tweenDeck.forEach(plate => {
    if (plate.z <= g.IB || plate.z >= g.UD) return;
    profiles.tweenStiff.forEach(p => {
      if (p.y > g.IS && p.y < g.B_half) {
        drawStiff(p.y, plate.z, [0,-1], [-1,0], PARAMS.profTypeTween, 'LONG_STIFFS', p.profileName || profName.twn);
      }
    });
  });
  // Coaming top stiffs: web DOWN, flange toward CL
  if (PARAMS.coamingTop > 0) {
    const coamEnd = g.IS + PARAMS.coamingTop;
    profiles.coamingStiff.forEach(p => {
      if (p.y > g.IS && p.y < coamEnd) {
        drawStiff(p.y, g.HC, [0,-1], [-1,0], PARAMS.profTypeCoaming, 'LONG_STIFFS', p.profileName || profName.coaming);
      }
    });
  }
  // Upper deck stiffs: web DOWN, flange toward CL
  profiles.upperDeck.forEach(p => {
    if (p.y > g.IS && p.y < g.B_half) {
      drawStiff(p.y, g.UD, [0,-1], [-1,0], PARAMS.profTypeDeck, 'LONG_STIFFS', p.profileName || profName.ud);
    }
  });

  // ====================================================================
  // TRANSVERSE STIFFS & BRACKETS (from NODES_CACHE)
  // ====================================================================
  if (NODES_CACHE.length === 0) computeNodes();

  const nodeXY = (id) => {
    const n = NODES_CACHE.find(nn => nn.id === id);
    return n ? { x: n.realY, y: n.realZ } : null;
  };

  // Transverse stiffs: single line between two nodes
  TRANSVERSE_STIFFS.forEach(s => {
    const a = nodeXY(s.n1), b = nodeXY(s.n2);
    if (!a || !b) return;
    line(a.x, a.y, b.x, b.y, 'TRANSVERSE');
  });

  // Brackets / floors — polyline between nodes, with curved arc if ends are bilge corners
  BRACKETS.forEach(br => {
    const ns = br.nodes.map(nodeXY).filter(Boolean);
    if (ns.length < 3) return;
    const bilgeStartY = g.B_half - g.R_B;
    const isBilgeStart = (p) => Math.abs(p.x - bilgeStartY) < 5 && Math.abs(p.y) < 5;
    const isBilgeEnd   = (p) => Math.abs(p.x - g.B_half) < 5 && Math.abs(p.y - g.R_B) < 5;
    for (let i = 0; i < ns.length; i++) {
      const p1 = ns[i];
      const p2 = ns[(i + 1) % ns.length];
      const crossesBilge = (isBilgeStart(p1) && isBilgeEnd(p2)) || (isBilgeEnd(p1) && isBilgeStart(p2));
      if (crossesBilge) {
        // Quarter-arc
        const cx = g.B_half - g.R_B, cy = g.R_B;
        arc(cx, cy, g.R_B, 270, 360, 'BRACKETS');
      } else {
        line(p1.x, p1.y, p2.x, p2.y, 'BRACKETS');
      }
    }
  });

  // ====================================================================
  // ANNOTATIONS — UY175-style labels on 'TEXT_POINTERS' layer
  //   Plate thickness:  "-t- (MAT)"           (ör. "-14- (AH36)")
  //   Stiffener:        "Profile (MAT)"       (ör. "HP 200x10 (AH36)")
  //   Both use text height 80 mm so they are legible at typical plot scales.
  // ====================================================================
  const LABEL_LAYER = 'ANNOTATION';   // maps to 'TEXT_POINTERS'
  const TH = 80;                       // text height (mm)
  const plateLabel = (t) => `-${t}- (${MATERIAL_NAME})`;
  const profLabel  = (name) => `${name} (${MATERIAL_NAME})`;

  // Helper: resolve stiffener profile name. Uses per-stiff override if set,
  // else falls back to group default from PARAMS.
  const stiffName = (stiff, defaultName) => stiff?.profileName || defaultName || '';

  // ---- PLATE THICKNESS LABELS ----
  // Shell — label each strake region at its centroid
  {
    const L = shellGeometryLengths();
    let cursor = 0;
    STRAKES.shell.forEach(s => {
      const mid = cursor + s.width / 2;
      let lx, ly;
      if (mid <= L.keel) { lx = mid; ly = -350; }
      else if (mid <= L.keel + L.bottom) { lx = g.keel_half + (mid - L.keel); ly = -350; }
      else if (mid <= L.keel + L.bottom + L.bilge) {
        const arcS = mid - L.keel - L.bottom;
        const theta = (arcS / L.bilge) * (Math.PI/2);
        lx = (g.B_half - g.R_B) + (g.R_B + 350) * Math.sin(theta);
        ly = g.R_B - (g.R_B + 350) * Math.cos(theta);
      } else {
        const sideS = mid - L.keel - L.bottom - L.bilge;
        lx = g.B_half + 350; ly = g.R_B + sideS;
      }
      text(lx, ly, TH, plateLabel(s.thickness), LABEL_LAYER);
      cursor += s.width;
    });
  }
  // Inner Bottom — per strake at centroid
  {
    let cursor = 0;
    STRAKES.innerBottom.forEach(s => {
      const midX = cursor + s.width / 2;
      text(midX, g.IB + 80, TH, plateLabel(s.thickness), LABEL_LAYER);
      cursor += s.width;
    });
  }
  // Inner Side — per strake at centroid (only base strakes, not coaming walls)
  {
    let cursor = g.IB;
    isBaseStrakes.forEach(s => {
      const midY = cursor + s.width / 2;
      text(g.IS + 80, midY, TH, plateLabel(s.thickness), LABEL_LAYER);
      cursor += s.width;
    });
  }
  // Coaming walls + top plate
  if (PARAMS.coamingTop > 0) {
    const xLeft = g.IS, xRight = g.IS + PARAMS.coamingTop;
    const tInb = isInboardCoam?.thickness || PLATE_THICKNESS.coaming;
    const tOut = isOutboardCoam?.thickness || PLATE_THICKNESS.coaming;
    text(xLeft - 300, (g.UD + g.HC)/2, TH, plateLabel(tInb), LABEL_LAYER);
    text(xRight + 50, (g.UD + g.HC)/2, TH, plateLabel(tOut), LABEL_LAYER);
    text((xLeft+xRight)/2 - 100, g.HC + 100, TH, plateLabel(PLATE_THICKNESS.coaming), LABEL_LAYER);
  }
  // Upper Deck
  text((g.IS + g.B_half)/2 - 200, g.UD + 100, TH, plateLabel(PLATE_THICKNESS.upperDeck), LABEL_LAYER);
  // Stringer decks
  profiles.stringer.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) {
      text((g.IS + g.B_half)/2 - 200, p.z + 100, TH, plateLabel(PLATE_THICKNESS.stringer), LABEL_LAYER);
    }
  });
  // Tween decks
  profiles.tweenDeck.forEach(p => {
    if (p.z > g.IB && p.z < g.UD) {
      text((g.IS + g.B_half)/2 - 200, p.z + 100, TH, plateLabel(PLATE_THICKNESS.tween), LABEL_LAYER);
    }
  });

  // ---- STIFFENER PROFILE LABELS ----
  const getDefaultProf = (selId) => {
    try { return document.getElementById(selId)?.value || ''; } catch(e) { return ''; }
  };
  const defaults = {
    bottom:  getDefaultProf('bottomLongProfile'),
    ib:      getDefaultProf('ibLongProfile') || getDefaultProf('bottomLongProfile'),
    str:     getDefaultProf('strDeckProfile'),
    twn:     getDefaultProf('twnDeckProfile'),
    ud:      getDefaultProf('deckLongProfile'),
    coaming: getDefaultProf('coamingProfile'),
  };

  const labelOneStiff = (group, defaultName, getXY) => {
    const arr = profiles[group];
    if (!arr || !arr.length) return;
    const mid = arr[Math.floor(arr.length/2)];
    const name = stiffName(mid, defaultName);
    if (!name) return;
    const [x, y] = getXY(mid);
    text(x, y, TH * 0.75, profLabel(name), LABEL_LAYER);
  };
  labelOneStiff('bottomShell', defaults.bottom, p => [p.y - 500, -500]);
  labelOneStiff('innerBottom', defaults.ib,     p => [p.y - 500, g.IB + 300]);
  labelOneStiff('upperDeck',   defaults.ud,     p => [p.y - 300, g.UD - 200]);
  labelOneStiff('sideShell',   '',              p => [g.B_half + 100, p.z]);
  labelOneStiff('innerSide',   '',              p => [g.IS + 300, p.z]);
  labelOneStiff('stringerStiff', defaults.str,  p => {
    const plate = profiles.stringer?.[0];
    return [p.y - 300, (plate?.z || g.IB+2000) - 200];
  });
  labelOneStiff('tweenStiff',   defaults.twn,   p => {
    const plate = profiles.tweenDeck?.[0];
    return [p.y - 300, (plate?.z || g.IB+5000) - 200];
  });
  labelOneStiff('coamingStiff', defaults.coaming, p => [p.y - 300, g.HC - 200]);

  // Inject entities into R12 template. The template already includes
  // all required HEADER variables, TABLES (VPORT/LTYPE/LAYER/STYLE/VIEW/
  // UCS/APPID/DIMSTYLE), a BLOCKS section with $Model_Space and
  // $Paper_Space, and the closing ENDSEC/EOF markers.
  const extMinX = -500;
  const extMinY = -500;
  const extMaxX = g.B_half + 500;
  const extMaxY = g.HC + 500;
  // Update $HANDSEED so it points beyond the highest handle we emitted.
  // AutoCAD may reject the file if HANDSEED is not strictly greater than any
  // handle already present.
  const finalHandseed = _handleNext.toString(16).toUpperCase();
  const dxfOut = DXF_TEMPLATE
    .replace('<<<EXTMIN_X>>>', extMinX.toFixed(1))
    .replace('<<<EXTMIN_Y>>>', extMinY.toFixed(1))
    .replace('<<<EXTMAX_X>>>', extMaxX.toFixed(1))
    .replace('<<<EXTMAX_Y>>>', extMaxY.toFixed(1))
    .replace('<<<HANDSEED>>>', finalHandseed)
    .replace('<<<ENTITIES>>>', dxf.replace(/\n$/, ''));

  // Download
  const blob = new Blob([dxfOut], { type: 'application/dxf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `midship_${new Date().toISOString().slice(0,10)}.dxf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
// Expose DXF export to HTML onclick handlers (IIFE-scoped function → window).
window.exportDXF = exportDXF;

// Initial setup
computeProfiles();
// Render once so NODES_CACHE is populated (needed to seed default transverse elements)
computeNodes();

// Seed default transverse stiffeners + bracket as example references.
// These use the default geometry's node numbering (after sort: bottom-up, left-to-right):
//   N1=CL/BL, N2=Duct/BL,  N3=SG1/BL,  N4=SG2/BL,  N5=IS/BL,        N6=Bilge start,
//   N7=CL/IB, N8=Duct/IB, N9=SG1/IB, N10=SG2/IB, N11=IS/IB(SG3),    N12=Shell/IB(Bilge end),
//   N13=IS/UD, N14=Shell/UD, N15=IS/HC ...
//
// Apr 2026: Default transverse stiffeners and brackets removed per user
// request — TRANSVERSE_STIFFS and BRACKETS now start empty. Users add their
// own via the Trans tab "+ stiff" / "+ bracket" buttons.

// v28: seedDefaultCompartments IIFE disabled. Previously, this would
// auto-add Ballast + VOID node-polygons whenever no node-based compartment
// existed in defaults — which silently overwrote the user's clean list.
// User asked to remove Ballast and VOID entirely, so we no longer seed them.
// Flip the `false` below back to `true` to re-enable the geometry-based seed.
const __SEED_DEFAULT_COMPARTMENTS = false;
(function seedDefaultCompartments() {
  if (!__SEED_DEFAULT_COMPARTMENTS) return;
  // Only rebuild if all existing compartments are the legacy bbox form
  // (i.e. no one has defined anything node-based yet). If user loaded a JSON
  // that already has node-based compartments, skip.
  const anyNodeBased = COMPARTMENTS.some(c => Array.isArray(c.nodes) || c.n1 != null);
  if (anyNodeBased) {
    console.log('[seedDefaultCompartments] Skipped — node-based compartments already present:',
      COMPARTMENTS.map(c => ({ name:c.name, nodes:c.nodes })));
    return;
  }
  console.log('[seedDefaultCompartments] Running geometry-based seed…');

  const findByCoord = (y, z) => {
    const n = NODES_CACHE.find(n => Math.abs(n.realY - y) < 5 && Math.abs(n.realZ - z) < 5);
    return n ? n.id : null;
  };
  const g = GEOMETRY;
  const bilgeStartY = g.B_half - g.R_B;
  // Pick a Z for the Ballast top in the side tank. Common choice: tween deck level.
  // Fall back to UD if there's no tween deck.
  const ballastTopZ = (profiles.tweenDeck[0] && profiles.tweenDeck[0].z) || g.UD;

  const newList = [];

  // --- DUCT (Y=0..duct_half, Z=0..IB) ---
  // Leave as node-rectangle. CL side has no node (CL isn't a real element)
  // so fall back to bbox for this one.
  newList.push({ name:'DUCT', yMin:0, yMax:g.duct_half, zMin:0, zMax:g.IB });

  // --- BALLAST — explicit user-specified node order (v28) ---
  //   2 3 4 5 6 12 14 16 15 13 11 10 9 8
  newList.push({
    name:'Ballast', type:'ballast', rho:1.025,
    airpipeZ_mm:16060, testHead_m:2.4, cargoLoad:0,
    nodes:[2, 3, 4, 5, 6, 12, 14, 16, 15, 13, 11, 10, 9, 8]
  });

  // --- VOID — explicit user-specified node order (v28) ---
  //   16 18 17 15
  newList.push({
    name:'VOID', type:'void', rho:0,
    airpipeZ_mm:null, testHead_m:null, cargoLoad:0,
    nodes:[16, 18, 17, 15]
  });

  // --- CARGO (above IB, below UD, CL..IS). CL side has no node → use bbox. ---
  newList.push({ name:'CARGO', type:'cargo', rho:0.80, airpipeZ_mm:null, testHead_m:null, cargoLoad:20.0,
                 yMin:0, yMax:g.IS, zMin:g.IB, zMax:g.UD });

  // Replace defaults
  COMPARTMENTS.length = 0;
  newList.forEach(c => COMPARTMENTS.push(c));
})();

renderEditor();
render();
applyView();

// Inject static SVG icons (buttons outside render's scope)
{ const _mt = document.querySelector('#mirrorToggle .mirror-icon'); if (_mt) _mt.innerHTML = icon('mirror', '12px'); }

// Warnings bar: click header or toggle button to show/hide body
document.getElementById('warnBarHeader')?.addEventListener('click', (e) => {
  // Ignore clicks on the toggle button itself (it handles its own click)
  if (e.target.id === 'warnBarToggle') return;
  document.getElementById('warnBar').classList.toggle('open');
});
document.getElementById('warnBarToggle')?.addEventListener('click', (e) => {
  e.stopPropagation();
  document.getElementById('warnBar').classList.toggle('open');
});


  // Re-apply view & render after refs are bound
  applyView();
}
window.Draw = window.Draw || {};
window.Draw.init = __drawingInit;


// Export critical references
window.Draw.GEOMETRY = GEOMETRY;
window.Draw.PLATE_THICKNESS = PLATE_THICKNESS;
window.Draw.SIDE_GIRDERS = SIDE_GIRDERS;
window.Draw.STRAKES = STRAKES;
window.Draw.PARAMS = PARAMS;
window.Draw.profiles = profiles;
window.Draw.WT_FLAGS = WT_FLAGS;
window.Draw.TRANSVERSE_STIFFS = TRANSVERSE_STIFFS;
window.Draw.BRACKETS = BRACKETS;
window.Draw.COMPARTMENTS = COMPARTMENTS;
window.Draw.computeSectionProperties = computeSectionProperties;
window.Draw.computeProfiles = computeProfiles;
// Variant geometry overrides — variant change handler reads/writes these
window.Draw.applyExcelDefaultProfiles = applyExcelDefaultProfiles;
window.Draw.applyExcelDefaultStrakes = applyExcelDefaultStrakes;
// Local-structure helpers (added Apr 2026 for trans stiff / bracket support)
Object.defineProperty(window.Draw, 'NODES_CACHE', { get: () => NODES_CACHE, configurable: true });
window.Draw.computeNodes = computeNodes;
// Profile visual sizes (per-group mm dimensions used by SVG stiffener drawers)
window.PROFILE_VISUAL_SIZES = PROFILE_VISUAL_SIZES;
window._visualProfileDims  = _visualProfileDims;
window.updateVisualProfileSizes = updateVisualProfileSizes;
window.Draw.render = function(){ if (typeof render === 'function' && document.getElementById('midshipSVG')) render(); };
window.Draw.computeStrakes = function(){ if (typeof computeStrakes === 'function') computeStrakes(); };
window.Draw.setStrakesAuto = function(v){ STRAKES_AUTO = !!v; };
window.Draw.getStrakesAuto = function(){ return STRAKES_AUTO; };
window.Draw.saveJSON = function(){ saveDrawingJSON(); };
window.Draw.loadJSON = function(ev){ loadDrawingJSON(ev); };

// ============================================================================
// EXPORT FULL STATE — captures BOTH drawing state AND scantling form inputs.
// Call from console:  exportFullState()            → downloads JSON file
//                     copy(exportFullState(true))  → copies JSON to clipboard
// Returns the JSON string (or the object if returnObj=true).
// ============================================================================
window.exportFullState = function(returnObj) {
  // 1) Collect every <input>, <select>, <textarea> on the scantling page
  //    that has an id. Keyed by element id, value = current value.
  const formValues = {};
  document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
    if (!el.id) return;
    // Skip transient/UI elements (file pickers, hidden analysis toggles)
    if (el.type === 'file') return;
    if (el.type === 'button') return;
    // Capture value (for checkboxes, use .checked)
    if (el.type === 'checkbox' || el.type === 'radio') {
      formValues[el.id] = !!el.checked;
    } else {
      formValues[el.id] = el.value;
    }
  });

  const payload = {
    format: 'MidshipFullState',
    version: 2,
    savedAt: new Date().toISOString(),
    note: 'Full snapshot: drawing state + all scantling form inputs. Load via window.importFullState(jsonString).',
    // --- Drawing state (same as MidshipDraw format) ---
    GEOMETRY,
    PARAMS,
    PLATE_THICKNESS,
    // Material grade / yield-family pins per plate group + per side girder.
    // These were missing from v1 payloads, so reloading a saved JSON would
    // silently drop the user's grade/family choices. Now captured.
    PLATE_GRADE,
    PLATE_MATERIAL_FAMILY,
    SIDE_GIRDER_GRADES,
    SIDE_GIRDER_FAMILIES,
    SIDE_GIRDERS,
    profiles,
    BAND_ASSIGNMENTS: window.BAND_ASSIGNMENTS || {},
    linkBS_IB,
    linkSS_IS,
    VIEW_MODE,
    WT_FLAGS,
    COMPARTMENTS,
    TRANSVERSE_STIFFS,
    BRACKETS,
    STRAKES,
    STRAKES_AUTO,
    MIRROR_BODY,
    // --- Scantling page form values ---
    formValues
  };

  const json = JSON.stringify(payload, null, 2);

  if (returnObj) return payload;

  // Default behaviour: download as file
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `midship_full_${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  console.log('[exportFullState] Downloaded JSON. Also available as string:');
  console.log(json);
  return json;
};

// Mirror of exportFullState — restore state from a JSON string.
// Usage:  importFullState(jsonStringOrObject)
window.importFullState = function(data) {
  try {
    if (typeof data === 'string') data = JSON.parse(data);
    if (!data || (data.format !== 'MidshipFullState' && data.format !== 'MidshipDraw')) {
      console.error('[importFullState] Invalid format');
      return false;
    }
    // Disable auto strake regeneration FIRST so that form-change events
    // don't wipe out the STRAKES arrays we're about to apply.
    STRAKES_AUTO = false;

    // Drawing state
    if (data.GEOMETRY) Object.assign(GEOMETRY, data.GEOMETRY);
    if (data.PARAMS)   Object.assign(PARAMS, data.PARAMS);
    if (data.PLATE_THICKNESS) Object.assign(PLATE_THICKNESS, data.PLATE_THICKNESS);
    // Material grade / yield-family pins. v1 payloads don't include these,
    // so guard each one. Use Object.assign so existing keys not present in
    // the payload are preserved (e.g. coamingTop default empty).
    if (data.PLATE_GRADE && typeof data.PLATE_GRADE === 'object') {
      Object.assign(PLATE_GRADE, data.PLATE_GRADE);
    }
    if (data.PLATE_MATERIAL_FAMILY && typeof data.PLATE_MATERIAL_FAMILY === 'object') {
      Object.assign(PLATE_MATERIAL_FAMILY, data.PLATE_MATERIAL_FAMILY);
    }
    if (data.SIDE_GIRDER_GRADES && typeof data.SIDE_GIRDER_GRADES === 'object') {
      // Replace wholesale — sg0/sg1/sg2 keys are dynamic; an Object.assign
      // would leave stale keys behind from a previous load with more girders.
      Object.keys(SIDE_GIRDER_GRADES).forEach(k => delete SIDE_GIRDER_GRADES[k]);
      Object.assign(SIDE_GIRDER_GRADES, data.SIDE_GIRDER_GRADES);
    }
    if (data.SIDE_GIRDER_FAMILIES && typeof data.SIDE_GIRDER_FAMILIES === 'object') {
      Object.keys(SIDE_GIRDER_FAMILIES).forEach(k => delete SIDE_GIRDER_FAMILIES[k]);
      Object.assign(SIDE_GIRDER_FAMILIES, data.SIDE_GIRDER_FAMILIES);
    }
    // In place, not reassigned — window.Draw.SIDE_GIRDERS is bound to the
    // original array at module load and 50-analysis.js reads it, so a
    // reassignment here left that export on the previous project's girders.
    if (data.SIDE_GIRDERS) {
      SIDE_GIRDERS.length = 0;
      data.SIDE_GIRDERS.forEach(g => SIDE_GIRDERS.push(g));
    }
    if (data.profiles) {
      Object.keys(data.profiles).forEach(k => {
        if (Array.isArray(data.profiles[k])) profiles[k] = data.profiles[k];
      });
    }
    if (data.BAND_ASSIGNMENTS) window.BAND_ASSIGNMENTS = data.BAND_ASSIGNMENTS;
    if (typeof data.linkBS_IB === 'boolean') linkBS_IB = data.linkBS_IB;
    if (typeof data.linkSS_IS === 'boolean') linkSS_IS = data.linkSS_IS;
    if (data.WT_FLAGS) Object.assign(WT_FLAGS, data.WT_FLAGS);
    if (Array.isArray(data.COMPARTMENTS)) {
      COMPARTMENTS.length = 0;
      data.COMPARTMENTS.forEach(c => COMPARTMENTS.push(c));
    }
    if (Array.isArray(data.TRANSVERSE_STIFFS)) {
      TRANSVERSE_STIFFS.length = 0;
      data.TRANSVERSE_STIFFS.forEach(t => TRANSVERSE_STIFFS.push(t));
    }
    if (Array.isArray(data.BRACKETS)) {
      BRACKETS.length = 0;
      data.BRACKETS.forEach(b => BRACKETS.push(b));
    }
    if (typeof data.MIRROR_BODY === 'boolean')  MIRROR_BODY  = data.MIRROR_BODY;

    // Form values — fire events so listeners update. May regenerate strakes,
    // but we'll re-apply them below.
    if (data.formValues && typeof data.formValues === 'object') {
      // Suspend recalculation for the whole burst, then run it once. The last
      // of the old per-event recalcs fired at exactly this point in the
      // sequence - before STRAKES are applied below - so the single call
      // lands where the previous behaviour left off, only 100x cheaper.
      const canBatch = typeof window.suspendRecalc === 'function';
      if (canBatch) window.suspendRecalc();
      try {
        Object.entries(data.formValues).forEach(([id, val]) => {
          const el = document.getElementById(id);
          if (!el) return;
          if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = !!val;
          } else {
            el.value = val;
          }
          // Fire change event so any listeners (recalcAll) pick it up
          el.dispatchEvent(new Event('change', { bubbles: true }));
        });
      } finally {
        if (canBatch) {
          const wanted = window.resumeRecalc();
          if (wanted && typeof recalcAll === 'function') {
            try { recalcAll(); } catch (e) { console.warn('[importFullState] recalc:', e); }
          }
        }
      }
    }

    // Apply STRAKES AFTER form events so they are not overwritten by
    // computeStrakes() triggered through recalcAll → syncFromScantling.
    // PREVIOUSLY only shell/innerBottom/innerSide were restored — strake
    // widths for upperDeck, stringer, tween, coamingTop, coamingWall, and
    // each sideGirder were silently dropped. Now we iterate every key the
    // payload provides, and we also clear sideGirderN keys that aren't in
    // the payload so we don't leave stale strakes behind from a previous
    // load with a different girder count.
    if (data.STRAKES && typeof data.STRAKES === 'object') {
      // Drop any sideGirderN keys that exist in the live STRAKES but are not
      // in the incoming payload (girder count may have changed).
      Object.keys(STRAKES).forEach(k => {
        if (/^sideGirder\d+$/.test(k) && !(k in data.STRAKES)) {
          delete STRAKES[k];
        }
      });
      Object.keys(data.STRAKES).forEach(k => {
        if (Array.isArray(data.STRAKES[k])) {
          STRAKES[k] = data.STRAKES[k];
        }
      });
    }
    // Ensure STRAKES_AUTO stays false if JSON says so (guard against late overrides)
    if (typeof data.STRAKES_AUTO === 'boolean') STRAKES_AUTO = data.STRAKES_AUTO;

    if (typeof renderEditor === 'function') renderEditor();
    if (typeof render === 'function') render();
    // Do NOT call recalcAll() here — it would re-sync from scantling and
    // regenerate strakes. The form-change events above have already kept
    // analysis panels in sync.
    console.log('[importFullState] Restored successfully.');
    return true;
  } catch (e) {
    console.error('[importFullState] Failed:', e);
    return false;
  }
};

window.Draw.sync = function(patch){
  try {
    if (patch.GEOMETRY) Object.assign(GEOMETRY, patch.GEOMETRY);
    if (patch.PLATE_THICKNESS) Object.assign(PLATE_THICKNESS, patch.PLATE_THICKNESS);
    if (patch.PARAMS) Object.assign(PARAMS, patch.PARAMS);
    if (patch.SIDE_GIRDERS) {
      SIDE_GIRDERS.length = 0;
      patch.SIDE_GIRDERS.forEach(g => SIDE_GIRDERS.push(g));
    }
    if (typeof computeStrakes === 'function') computeStrakes();
    if (typeof computeProfiles === 'function') computeProfiles();
    if (typeof render === 'function' && document.getElementById('midshipSVG')) {
      render();
    }
  } catch(e) {
    console.error('Draw.sync error:', e);
  }
};
})();
