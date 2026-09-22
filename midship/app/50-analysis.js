/* ==========================================================================
   50-analysis.js  —  Analysis mode, element inspector, summary & status panels
   Extracted verbatim from Index.html (lines 21717–27250 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==========================================================================
// ANALYSIS MODE — two-phase workflow for Geometry page
// Phase 1 (default): DRAW mode — pure geometry review, no checks visible
// Phase 2: ANALYSIS mode — run LR rule checks, FAIL elements highlighted,
//          click any plate/profile to see detailed rule calculation
// ==========================================================================
let ANALYSIS_MODE = false;
window.ANALYSIS_MODE = false;

// Analysis sub-mode — which check perspective is active in analysis mode.
// Options: 'overall' | 'local' | 'hullgirder' | 'buckling'
let ANALYSIS_SUBMODE = 'overall';
window.ANALYSIS_SUBMODE = 'overall';

function toggleAnalysisMode() {
  ANALYSIS_MODE = !ANALYSIS_MODE;
  window.ANALYSIS_MODE = ANALYSIS_MODE;
  const btn = document.getElementById('runAnalysisBtn');
  const iconSlot = document.getElementById('runAnalysisIcon');
  const labelSlot = document.getElementById('runAnalysisLabel');
  const indicator = document.getElementById('modeIndicator');
  const help = document.getElementById('modeHelp');
  const ruleCheckPanel = document.getElementById('ruleCheckPanel');
  const okWrap = document.getElementById('countOkWrap');
  const failWrap = document.getElementById('countFailWrap');
  const reloadSlot = document.getElementById('reloadIconSlot');
  if (reloadSlot && window.icon) reloadSlot.innerHTML = window.icon('reload', '13px');

  // Toggle pill visibility — draw pills hidden in analysis, analysis pills shown
  const drawPills = document.querySelectorAll('.view-pill.draw-pill');
  const analysisPills = document.querySelectorAll('.view-pill.analysis-pill');

  if (ANALYSIS_MODE) {
    // Enter ANALYSIS mode
    if (btn) btn.style.background = 'var(--warning)';
    if (iconSlot && window.icon) iconSlot.innerHTML = window.icon('stopSquare', '13px');
    if (labelSlot) labelSlot.textContent = 'Exit Analysis';
    if (indicator) {
      indicator.textContent = 'ANALYSIS MODE';
      indicator.style.background = 'rgba(239,68,68,0.15)';
      indicator.style.color = 'var(--error)';
      indicator.style.borderColor = 'var(--error)';
    }
    if (help) help.textContent = 'Click any plate/profile for details. Use pills to filter by check type.';
    if (ruleCheckPanel) {
      ruleCheckPanel.style.display = 'block';
      // Start collapsed — user expands on demand.
      ruleCheckPanel.classList.add('collapsed');
      ruleCheckPanel.classList.remove('expanded');
    }
    if (okWrap) okWrap.style.display = '';
    if (failWrap) failWrap.style.display = '';
    const optBtn = document.getElementById('autoOptimizeBtn');
    if (optBtn) optBtn.style.display = 'inline-flex';
    const optPlatesBtn = document.getElementById('autoOptimizePlatesBtn');
    if (optPlatesBtn) optPlatesBtn.style.display = 'inline-flex';
    // New unified optimize toolbar (3 buttons grouped)
    const optToolbar = document.getElementById('optimizeToolbar');
    if (optToolbar) optToolbar.style.display = 'inline-flex';
    // Wire icons into toolbar buttons (once)
    if (window.icon) {
      const stiffIcon = document.querySelector('#optimizeStiffBtn .opt-tool-icon');
      if (stiffIcon && !stiffIcon.innerHTML) stiffIcon.innerHTML = window.icon('target', '14px');
      const profIcon = document.querySelector('#optimizeProfilesBtn .opt-tool-icon');
      if (profIcon && !profIcon.innerHTML) profIcon.innerHTML = window.icon('bars', '14px');
      const plateIcon = document.querySelector('#optimizePlatesBtn .opt-tool-icon');
      if (plateIcon && !plateIcon.innerHTML) plateIcon.innerHTML = window.icon('layers', '14px');
      const debugIcon = document.getElementById('debugIconSlot');
      if (debugIcon && !debugIcon.innerHTML) debugIcon.innerHTML = window.icon('gear', '13px');
      const refreshIcon = document.getElementById('refreshIconSlot');
      if (refreshIcon && !refreshIcon.innerHTML) refreshIcon.innerHTML = window.icon('wrench', '13px');
    }

    // Swap pills: hide draw, show analysis
    drawPills.forEach(p => p.style.display = 'none');
    analysisPills.forEach(p => p.style.display = '');
    // Show analysis-only tabs (HG, Buckling)
    document.querySelectorAll('.sb-tab.analysis-tab').forEach(t => t.style.display = '');
    // Reveal the tab bar in analysis mode (it's hidden in draw mode, where the
    // panel only shows Info/Props content).
    const sbTabsEl = document.getElementById('sbTabs');
    if (sbTabsEl) sbTabsEl.style.display = '';
    // Swap Profile Editor → Result Panel
    const editorEl = document.getElementById('editor');
    const resultEl = document.getElementById('resultPanel');
    if (editorEl) editorEl.style.display = 'none';
    if (resultEl) resultEl.style.display = '';
    // Show color scale legend (UC gradient)
    const csLegend = document.getElementById('colorScaleLegend');
    if (csLegend) csLegend.style.display = '';
    // Default analysis submode: overall
    ANALYSIS_SUBMODE = 'overall';
    window.ANALYSIS_SUBMODE = 'overall';
    analysisPills.forEach(p => p.classList.toggle('active', p.dataset.viewmode === 'overall'));
    // Set VIEW_MODE in Draw to match current submode — render will use this
    if (window.Draw && window.Draw.setViewMode) window.Draw.setViewMode('overall');

    const si = document.getElementById('strakeInspector');
    if (si) { si.style.display = 'none'; si.innerHTML = ''; }

    if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();
    // Initialize band assignments for local optimizer
    if (typeof autoBandGroups === 'function') autoBandGroups();
    renderAnalysisStatusPanel();
    if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel(); if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel();
    if (typeof renderBucklingStatusPanel === 'function') renderBucklingStatusPanel();
    updateSbTabFailFlags();
    if (window.Draw && window.Draw.render) window.Draw.render();
  } else {
    if (btn) btn.style.background = 'var(--accent)';
    if (iconSlot && window.icon) iconSlot.innerHTML = window.icon('beaker', '13px');
    if (labelSlot) labelSlot.textContent = 'Run Analysis';
    if (indicator) {
      indicator.textContent = 'DRAW MODE';
      indicator.style.background = 'var(--bg-tertiary)';
      indicator.style.color = 'var(--text-secondary)';
      indicator.style.borderColor = 'var(--border)';
    }
    if (help) help.textContent = 'Review geometry only. Click "Run Analysis" to check LR rule compliance.';
    if (ruleCheckPanel) ruleCheckPanel.style.display = 'none';
    if (okWrap) okWrap.style.display = 'none';
    if (failWrap) failWrap.style.display = 'none';
    const optBtn = document.getElementById('autoOptimizeBtn');
    if (optBtn) optBtn.style.display = 'none';
    const optPlatesBtn = document.getElementById('autoOptimizePlatesBtn');
    if (optPlatesBtn) optPlatesBtn.style.display = 'none';
    const optToolbar = document.getElementById('optimizeToolbar');
    if (optToolbar) optToolbar.style.display = 'none';

    // Restore draw pills, hide analysis pills
    drawPills.forEach(p => p.style.display = '');
    analysisPills.forEach(p => p.style.display = 'none');
    // Hide analysis-only tabs
    document.querySelectorAll('.sb-tab.analysis-tab').forEach(t => t.style.display = 'none');
    // Re-hide the tab bar in draw mode.
    const sbTabsEl2 = document.getElementById('sbTabs');
    if (sbTabsEl2) sbTabsEl2.style.display = 'none';
    // Swap back: Result Panel → Profile Editor
    const editorEl = document.getElementById('editor');
    const resultEl = document.getElementById('resultPanel');
    if (editorEl) editorEl.style.display = '';
    if (resultEl) resultEl.style.display = 'none';
    // Hide color scale legend
    const csLegend = document.getElementById('colorScaleLegend');
    if (csLegend) csLegend.style.display = 'none';
    // If current active tab was HG or Buckling, switch to Info
    const activeTab = document.querySelector('.sb-tab.active');
    if (activeTab && (activeTab.dataset.sbtab === 'hg' || activeTab.dataset.sbtab === 'buckling')) {
      document.querySelector('.sb-tab[data-sbtab="info"]')?.click();
    }
    // Return to 'general' view mode for drawing
    const generalPill = document.querySelector('.view-pill.draw-pill[data-viewmode="general"]');
    if (generalPill) {
      document.querySelectorAll('.view-pill.draw-pill').forEach(p => p.classList.remove('active'));
      generalPill.classList.add('active');
    }
    if (window.Draw && window.Draw.setViewMode) window.Draw.setViewMode('general');

    closeElemInspect();
    if (window.Draw && window.Draw.render) window.Draw.render();
  }
}

// =========================================================================
// Rule Check drawer — collapsible bottom panel in Analysis Mode.
// Starts collapsed; clicking the header toggles between collapsed/expanded.
// =========================================================================
function toggleRuleCheckDrawer(forceState) {
  const panel = document.getElementById('ruleCheckPanel');
  if (!panel) return;
  const isCollapsed = panel.classList.contains('collapsed');
  let expand;
  if (typeof forceState === 'boolean') {
    expand = forceState;
  } else {
    expand = isCollapsed;   // if currently collapsed, expand it
  }
  panel.classList.toggle('collapsed', !expand);
  panel.classList.toggle('expanded', expand);
}
window.toggleRuleCheckDrawer = toggleRuleCheckDrawer;

// Update the drawer header status (OK / FAIL counts) so users know what's
// inside without having to expand it.
function updateRuleCheckDrawerStatus() {
  const statusEl = document.getElementById('ruleCheckDrawerStatus');
  if (!statusEl) return;
  const body = document.getElementById('ruleCheckBody');
  if (!body) { statusEl.textContent = ''; return; }
  const rows = body.querySelectorAll('tr');
  let okN = 0, failN = 0;
  rows.forEach(r => {
    const txt = r.textContent || '';
    if (txt.includes('✗') || /\bFAIL\b/i.test(txt)) failN++;
    else if (txt.includes('✓') || /\bOK\b/i.test(txt)) okN++;
  });
  if (rows.length === 0) {
    statusEl.innerHTML = '<span style="color:var(--text-muted)">— no rows —</span>';
  } else {
    statusEl.innerHTML =
      `<span style="color:var(--success)">✓ ${okN} OK</span>` +
      (failN > 0 ? ` · <span style="color:var(--error);font-weight:700">✗ ${failN} FAIL</span>` : '');
  }
}
window.updateRuleCheckDrawerStatus = updateRuleCheckDrawerStatus;

// Update sidebar tab badges — show red dot / class on tabs that have FAILs.
function updateSbTabFailFlags() {
  if (!window.ANALYSIS_MODE) {
    document.querySelectorAll('.sb-tab').forEach(t => t.classList.remove('has-fail'));
    return;
  }
  try {
    // HG fails — check if renderHullGirderStrengthPanel produced any FAIL
    const hgPanel = document.getElementById('hullGirderStrengthPanel');
    const hgHasFail = hgPanel && /FAIL|✗/.test(hgPanel.innerHTML);
    const bkPanel = document.getElementById('bucklingStatusPanel');
    const bkHasFail = bkPanel && /FAIL|✗/.test(bkPanel.innerHTML);
    const statusP = document.getElementById('analysisStatusPanel');
    const localHasFail = statusP && /FAIL|✗/.test(statusP.innerHTML);

    const tabHG = document.querySelector('.sb-tab[data-sbtab="hg"]');
    const tabBK = document.querySelector('.sb-tab[data-sbtab="buckling"]');
    const tabInfo = document.querySelector('.sb-tab[data-sbtab="info"]');
    if (tabHG) tabHG.classList.toggle('has-fail', !!hgHasFail);
    if (tabBK) tabBK.classList.toggle('has-fail', !!bkHasFail);
    if (tabInfo) tabInfo.classList.toggle('has-fail', !!localHasFail);
  } catch (e) {}
}
window.updateSbTabFailFlags = updateSbTabFailFlags;

function closeElemInspect() {
  const p = document.getElementById('elemInspectPanel');
  if (p) p.style.display = 'none';
}

// Compute and render element inspection details.
// elemType: 'plate-bottom' | 'plate-keel' | 'plate-ib' | 'plate-is' | 'plate-ud' 
//           | 'plate-str' | 'plate-twn' | 'plate-sg' | 'plate-duct'
//           | 'long-bottom' | 'long-ib' | 'long-side' | 'long-is'
//           | 'long-str' | 'long-twn' | 'long-ud'
//           | 'db-floor-wt' | 'db-floor-nwt' | 'db-bracket' | 'db-cg'
// opts: extra context (strake index, group key, etc.)
function showElemInspect(elemType, opts) {
  opts = opts || {};
  if (window._CLICK_DEBUG) {
    console.log('[showElemInspect] elemType=', elemType, 'opts=', opts);
  }
  const panel = document.getElementById('elemInspectPanel');
  if (!panel) return;
  panel.style.display = 'flex';
  
  // Install close button icon (idempotent)
  const closeBtn = document.getElementById('eipCloseBtn');
  if (closeBtn && window.icon && !closeBtn.innerHTML.includes('svg')) {
    closeBtn.innerHTML = window.icon('close', '14px');
  }
  
  const titleEl = document.getElementById('eipTitle');
  const subtitleEl = document.getElementById('eipSubtitle');
  const bodyEl = document.getElementById('eipBody');
  
  let data;
  try {
    data = _computeElemInspect(elemType, opts);
  } catch (e) {
    console.error('showElemInspect error:', e);
    data = { title: 'Error', subtitle: elemType, sections: [{ label:'Error', value: e.message }] };
  }
  
  // ─── Position Code Resolution (Faz 2 — display only) ───
  // Resolve the element's position code (e.g. "BS01", "IS06", "CW01") and
  // attach it to data so the title row can show a badge. This is purely
  // visual; no calc value depends on it.
  try {
    let positionCode = null;
    let positionRule = null;
    // Plate strakes: opts.plateKey + opts.strakeIdx
    if (/^plate-/.test(elemType) && opts.strakeIdx != null && opts.plateKey) {
      const kind = opts.strakeKind ||
                   (window.Draw?.STRAKES?.[opts.plateKey]?.[opts.strakeIdx]?.kind);
      const code = window.resolveCodeForPlateGroup?.(opts.plateKey, kind);
      if (code) {
        positionCode = code + String(opts.strakeIdx + 1).padStart(2, '0');
        positionRule = window.POSITION_RULES?.[code];
      }
    }
    // Plate inspector for whole-plate clicks (no strakeIdx): use plateKey alone
    else if (/^plate-/.test(elemType) && opts.plateKey && opts.strakeIdx == null) {
      const code = window.resolveCodeForPlateGroup?.(opts.plateKey, null);
      if (code) {
        positionCode = code + '01';
        positionRule = window.POSITION_RULES?.[code];
      }
    }
    // Stiffeners: opts.group + opts.index, ordinal via resolveStiffOrdinal
    else if (/^long-/.test(elemType) && opts.group != null && opts.index != null) {
      const code = window.resolveCodeForLongGroup?.(opts.group);
      if (code) {
        const ord = window.resolveStiffOrdinal?.(opts.group, opts.index) || (opts.index + 1);
        positionCode = code + String(ord).padStart(2, '0');
        positionRule = window.POSITION_RULES?.[code];
      }
    }
    if (positionCode) data.positionCode = positionCode;
    // Cross-check: add a "Position rule" entry to inputs so the user can
    // see exactly which LR table the registry says applies. If data.rule
    // was set by _computeElemInspect, leave it alone (it's more specific).
    if (positionRule && data) {
      data.inputs = data.inputs || [];
      const tableRef = /^plate-/.test(elemType) ? positionRule.tableP : positionRule.tableS;
      if (tableRef && !data.inputs.some(i => i && /Position rule/i.test(i.label || ''))) {
        data.inputs.push({
          label: 'Position rule',
          value: `${positionCode} → LR Tablo ${tableRef} (${positionRule.codeName})`
        });
      }
    }
  } catch(_) { /* silent */ }
  
  // ─── Auto-inject Hull Girder Stress for EVERY strake and profile ───
  // Uses _elemZm (exposed below) + runLongStrengthAnalysis to compute
  // σ_hg at the element's z-position, then appends a block to data.inputs
  // and data.steps. Skips hull-girder/db-internal element types (which
  // don't need this — they either already show it, or aren't longitudinal members).
  try {
    if (typeof window._elemZm_inspect === 'function' && 
        typeof window.runLongStrengthAnalysis === 'function' &&
        !data._hgInjected &&
        !/^hull-girder|^db-/.test(elemType)) {
      const z_m = window._elemZm_inspect(elemType, opts);
      if (z_m != null && isFinite(z_m)) {
        const p = getParams();
        const ls = window.runLongStrengthAnalysis();
        if (ls && ls.section && ls.section.I_NA) {
          const dz_m = z_m - ls.section.z_NA;
          const M_hog = Math.abs(ls.M_total_hog);
          const M_sag = Math.abs(ls.M_total_sag);
          const M_max = Math.max(M_hog, M_sag);
          const sigma_hg = Math.abs(M_max * dz_m / ls.section.I_NA) * 1e-3;
          const sigma_perm = ls.sigma_amid;
          const ratio = sigma_hg / sigma_perm;
          const pass = sigma_hg <= sigma_perm;
          const side = dz_m < 0 ? 'below NA' : 'above NA';
          
          // Append to Inputs table (one-line summary)
          data.inputs = data.inputs || [];
          // Avoid duplicate if inspector already added the same info.
          // Match BOTH label variants used across the codebase:
          //   - "Hull girder σ (Pt 3 Ch 4 Sec 5.7)"    [explicit, with rule ref]
          //   - "HG σ / σ_perm"                        [short, used in combo]
          const hasHG = data.inputs.some(i => {
            if (!i || !i.label) return false;
            const L = i.label;
            return /Hull girder/i.test(L) || /HG σ/i.test(L);
          });
          if (!hasHG) {
            data.inputs.push({
              label: 'Hull girder σ (Pt 3 Ch 4 Sec 5.7)',
              value: `${sigma_hg.toFixed(1)} / ${sigma_perm.toFixed(0)} N/mm²  ratio ${ratio.toFixed(2)}  ${pass ? '✓' : '✗ FAIL'}`
            });
          }
          
          // Append to Steps (detailed breakdown at end)
          data.steps = data.steps || [];
          const stepsHasHG = data.steps.some(s => typeof s === 'string' && /Hull Girder Stress at this/i.test(s));
          if (!stepsHasHG) {
            data.steps.push('');
            data.steps.push(`── Hull Girder Stress at this ${(window._elemLabel?.(elemType, opts)) || elemType} (Pt 3 Ch 4 Sec 5.7) ──`);
            data.steps.push(`z = ${z_m.toFixed(2)} m · z_NA = ${ls.section.z_NA.toFixed(2)} m · Δz = ${dz_m.toFixed(2)} m  [${side}]`);
            data.steps.push(`M_total_max = ${M_max.toLocaleString()} kN·m  (Ms + |Mw| worst)`);
            data.steps.push(`σ_hg = |M · Δz / I_NA| × 10⁻³ = ${sigma_hg.toFixed(1)} N/mm²`);
            data.steps.push(`σ_perm = 175/kL = ${sigma_perm.toFixed(1)} N/mm²`);
            data.steps.push(`Ratio = ${ratio.toFixed(3)}  ${pass ? '✓ OK (within limit)' : '✗ FAIL (exceeds limit)'}`);
          }
          
          // Append to statusNote
          if (data.statusNote && !data.statusNote.includes('HG σ')) {
            data.statusNote += ` · HG σ ${sigma_hg.toFixed(0)}/${sigma_perm.toFixed(0)} N/mm² ${pass?'✓':'✗'}`;
          } else if (!data.statusNote) {
            data.statusNote = `HG σ ${sigma_hg.toFixed(0)}/${sigma_perm.toFixed(0)} N/mm² ${pass?'✓':'✗'}`;
          }
          
          // ⚠ If HG stress fails, override the top-level status.
          // Even if local bending (e.g. plate thickness for pressure) is OK,
          // the hull girder must also satisfy σ_hg ≤ σ_perm — otherwise the
          // element cannot carry global bending. Show as FAIL.
          if (!pass) {
            data.status = 'FAIL';
            data._hgFailed = true;
          }
          
          data._hgInjected = true;
          data._hgData = { sigma_hg, sigma_perm, ratio, pass, z_m, dz_m };
        }
      }
    }
  } catch (e) { /* silent */ }

  // ─── Auto-inject Spacing Breakdown for stiffeners (long-*) ───
  // Lets the user manually verify the s value (mean of neighbour gaps)
  // used in the Z formula. Shows above/below distances + neighbour labels.
  try {
    if (!data._spacingInjected && /^long-/.test(elemType)
        && opts && opts.index != null) {
      // Resolve group name from elemType (long-bottom, long-ib, long-side, ...)
      const groupMap = {
        'long-bottom':  'bottomShell',
        'long-ib':      'innerBottom',
        'long-side':    'sideShell',
        'long-is':      'innerSide',
        'long-ud':      'upperDeck',
        'long-stringer':'stringerStiff',
        'long-tween':   'tweenStiff',
        'long-coaming': 'coamingStiff',
      };
      const group = groupMap[elemType] || opts.group;
      if (group && typeof _attachSpacingBreakdown === 'function') {
        _attachSpacingBreakdown(data, group, opts.index);
        data._spacingInjected = true;
      }
    }
  } catch (e) { /* silent */ }

  // ─── Auto-inject LR Pt 3 Ch 4 Sec 7 Buckling Check for plates + longs ───
  // Adds a buckling block to data.inputs and data.steps. Covers:
  //   plate-*   → Plate buckling (Table 4.7.2)
  //   long-*    → Longitudinal buckling (Table 4.7.3)
  // Uses compartment-aware corrosion category and ship's k_L.
  try {
    if (window.Buckling && !data._bucklingInjected
        && !/^hull-girder|^db-/.test(elemType)) {
      const z_m = window._elemZm_inspect?.(elemType, opts);
      if (z_m != null && isFinite(z_m)) {
        const p = getParams();
        const ls = window.runLongStrengthAnalysis?.();
        if (!ls || !ls.section || !ls.section.I_NA) {
          // no hull girder data, skip
        } else {
          const M_max = Math.max(
            Math.abs(ls.M_total_hog),
            Math.abs(ls.M_total_sag)
          );
          const z_NA = ls.section.z_NA;
          const I_NA = ls.section.I_NA;
          const kL = p.kL || 0.72;
          const material = p.material || 'AH36';
          const G = (window.Draw && window.Draw.GEOMETRY) || {};
          const z_deck_m = (G.UD || 15300) / 1000;
          const z_face_m = (z_m >= z_NA) ? (z_deck_m - z_NA) : z_NA;
          const sigma_face = Math.abs(M_max * z_face_m / I_NA) * 1e-3;
          const sigma_A = window.Buckling.sigmaADesign(
            sigma_face, Math.abs(z_m - z_NA), z_face_m, kL
          );
          const tau_A_initial = window.Buckling.tauADesignInitial(kL);
          // Use real hull girder shear flow τ = F·Q/(I·t·1000) when available.
          // Falls back to 30/kL (Sec 7.4.2 floor) when Q/F not computable.
          // t_mm is not yet known at this point — it's derived below in isPlate branch.
          // We compute τ_A later inside isPlate (where t_mm is known). For longs
          // τ_A is unused by checkLong, so we keep tau_A_initial here as default.
          let tau_A = tau_A_initial;
          const Qwo_kN = (ls.Q_design != null ? ls.Q_design : null) || ls.Qwo || (ls.F && ls.F.Qwo) || null;   // Q_s + Q_w at the section (LR Pt 3 Ch 4 Sec 6.7)
          const computeTauReal = (t_plate_mm) => {
            try {
              if (Qwo_kN != null && typeof window.computeShearFirstMoment === 'function') {
                const Q_m3 = window.computeShearFirstMoment(z_m);
                if (Q_m3 > 0) {
                  const F_N = Qwo_kN * 1000;
                  const tau_real = (F_N * Q_m3) / (I_NA * t_plate_mm * 1000);
                  return Math.max(Math.abs(tau_real), 30 / kL);
                }
              }
            } catch(e) {}
            return tau_A_initial;
          };
          const S_m = 2.1;  // web frame spacing default

          // Determine plate vs long + parameters
          const isPlate = elemType.startsWith('plate-');
          const isLong = elemType.startsWith('long-');
          if (!isPlate && !isLong) { /* skip */ }
          else {
            // Map elemType → plateKey for corrosion logic
            const typeMap = {
              'plate-bottom':'shell', 'plate-keel':'shell', 'plate-ud':'upperDeck',
              'plate-ib':'innerBottom', 'plate-is':'innerSide',
              'plate-side':'shell', 'plate-coaming':'coaming',
              'plate-str':'stringer', 'plate-twn':'tween',
              'long-bottom':'shell', 'long-ib':'innerBottom',
              'long-is':'innerSide', 'long-side':'shell',
              'long-ud':'upperDeck', 'long-str':'stringer',
              'long-twn':'tween', 'long-coaming':'coaming',
            };
            const plateKey = typeMap[elemType] || 'innerSide';
            const Y_mm = opts.y_mm || null;

            // Detect compartments for auto-corrosion
            const z_mm = z_m * 1000;
            let cA = null, cB = null, orient = 'vertical';
            const isHorizPlate = /plate-(ib|ud|str|twn|coaming)/.test(elemType)
                              || /long-(ib|ud|str|twn|coaming)/.test(elemType);
            const isShellPlate = /plate-(bottom|keel|side)/.test(elemType)
                              || /long-(bottom|side)/.test(elemType);
            const isISPlate = /plate-is|long-is/.test(elemType);
            
            if (isHorizPlate) {
              orient = 'horizontal';
              const yq = Y_mm || 3000;
              if (window.getCompartmentAt) {
                cA = window.getCompartmentAt(yq, z_mm - 50);
                cB = window.getCompartmentAt(yq, z_mm + 50);
              }
              // Upper deck: above = weather
              if (elemType.includes('ud') || elemType.includes('coaming')) {
                cB = { type: 'weather' };
              }
            } else if (isShellPlate) {
              // Outside = sea, inside = inner compartment
              cA = null;
              if (window.getCompartmentAt) {
                const Y_inb = (G.B_half || 11880) - 100;
                cB = window.getCompartmentAt(Y_inb, z_mm);
              }
            } else if (isISPlate) {
              if (window.getCompartmentAt) {
                cA = window.getCompartmentAt((G.IS || 10030) + 50, z_mm);
                cB = window.getCompartmentAt((G.IS || 10030) - 50, z_mm);
              }
            }
            const corrosion = window.Buckling.corrosionFromComps(cA, cB, orient);
            const compName_A = cA?.name || (cA?.type || 'sea');
            const compName_B = cB?.name || (cB?.type || 'sea');

            let r = null;
            if (isPlate) {
              // Derive t and s from opts or current state.
              // Start with a safe fallback, then overlay current data.
              let t_mm = 14;
              let s_mm = opts.s_mm || opts.strakeSpacing || 700;
              if (opts.strakeSpacing) s_mm = opts.strakeSpacing;

              // STRAKE-BASED plates (shell, IB, IS, keel, side, bilge):
              // read the CURRENT thickness directly from STRAKES using strakeIdx.
              // This is critical — otherwise we compute buckling against a stale
              // value (opts was captured at click-time, before any edit).
              const strakeTypeMap = {
                'plate-bottom':'shell',   'plate-keel':'shell',
                'plate-side':'shell',     'plate-bilge':'shell',
                'plate-ib':'innerBottom', 'plate-is':'innerSide',
              };
              const strakeArrKey = strakeTypeMap[elemType];
              if (strakeArrKey && opts.strakeIdx != null
                  && window.Draw?.STRAKES?.[strakeArrKey]?.[opts.strakeIdx]) {
                t_mm = window.Draw.STRAKES[strakeArrKey][opts.strakeIdx].thickness;
                // Also try to use strake-level stiffener spacing if present
                const strakeObj = window.Draw.STRAKES[strakeArrKey][opts.strakeIdx];
                if (strakeObj.spacing_mm) s_mm = strakeObj.spacing_mm;
              } else {
                // WHOLE-PLATE types (upper deck, coaming, stringer, tween):
                // read from PLATE_THICKNESS object.
                if (window.Draw?.PLATE_THICKNESS) {
                  const ptKey = {
                    'plate-ud':'upperDeck', 'plate-coaming':'coaming',
                    'plate-str':'stringer', 'plate-twn':'tween',
                  }[elemType];
                  if (ptKey && window.Draw.PLATE_THICKNESS[ptKey])
                    t_mm = window.Draw.PLATE_THICKNESS[ptKey];
                }
                // Fallback to opts value if STRAKES / PLATE_THICKNESS empty
                if (opts.t_mm) t_mm = opts.t_mm;
                if (opts.strakeThickness) t_mm = opts.strakeThickness;
                if (opts.strake?.thickness) t_mm = opts.strake.thickness;
              }
              r = window.Buckling.checkPlate({
                s_mm, t_mm, S_m,
                sigma_A,
                tau_A: computeTauReal(t_mm),   // real shear from F·Q/(I·t)
                stiffening: 'LONGITUDINAL',
                corrosion, material,
              });
              r._kind = 'plate';
              r._t_mm = t_mm;
              r._s_mm = s_mm;
            } else if (isLong) {
              // Resolve profile INLINE (stiff.profileName > scantling group default)
              const stiffOpts = { group: opts.group, index: opts.index };
              if (stiffOpts.group && stiffOpts.index != null) {
                const arr = window.Draw?.profiles?.[stiffOpts.group];
                const stiff = arr && arr[stiffOpts.index];
                let profName = stiff?.profileName || '';
                if (!profName) {
                  const SEL = {
                    bottomShell:'bottomLongProfile', innerBottom:'ibLongProfile',
                    sideShell:null,     innerSide:null,
                    stringerStiff:'strDeckProfile', tweenStiff:'twnDeckProfile',
                    coamingStiff:'coamingProfile',   upperDeck:'deckLongProfile'
                  };
                  const selId = SEL[stiffOpts.group];
                  const sel = selId ? document.getElementById(selId) : null;
                  profName = sel?.value || '';
                }
                if (profName && window.Profile?.allProfiles) {
                  const pc = window.Profile.allProfiles(['L','HP','FB','T'])
                                          .find(x => x.name === profName);
                  if (pc) {
                    const prof_type = pc.type === 'L' ? 'L'
                                    : pc.type === 'HP' ? 'BULB'
                                    : pc.type === 'FB' ? 'FLAT_BAR'
                                    : pc.type === 'T' ? 'TEE' : 'L';
                    // Extract d_w, t_w, b_f, t_f from catalog's `dimensions` object.
                    // Property naming depends on profile type:
                    //   L:  {a, b, t}       a=web_height, b=flange_width, t=web_thickness=flange_thickness
                    //   HP: {b, t, c, r}    b=web_height, t=web_thickness, c=bulb_size
                    //   FB: {h, t}          h=web_height, t=web_thickness
                    //   T:  {a, b, tw, tf}  a=web_height, b=flange_width, tw/tf=thicknesses
                    const dim = pc.dimensions || {};
                    let d_w = 0, t_w = 0, b_f = 0, t_f = 0;
                    if (pc.type === 'L') {
                      d_w = dim.a || 0;
                      t_w = dim.t || 0;
                      b_f = dim.b || 0;
                      t_f = dim.t || 0;
                    } else if (pc.type === 'HP') {
                      d_w = dim.b || 0;
                      t_w = dim.t || 0;
                      // HP = bulb plate; use bulb as "flange" for LR formulas:
                      // effective flange width ≈ c (bulb size), t_f ≈ c (mean thickness)
                      b_f = dim.c || 0;
                      t_f = dim.c || 0;
                    } else if (pc.type === 'FB') {
                      d_w = dim.h || dim.a || 0;
                      t_w = dim.t || 0;
                      b_f = 0;
                      t_f = 0;
                    } else if (pc.type === 'T') {
                      d_w = dim.a || 0;
                      t_w = dim.tw || dim.t || 0;
                      b_f = dim.b || 0;
                      t_f = dim.tf || dim.t || 0;
                    }
                    let t_p_mm = 14;
                    const ptKey = {
                      shell:'shell', innerBottom:'ib', innerSide:'is',
                      upperDeck:'upperDeck', stringer:'stringer',
                      tween:'tween', coaming:'coaming',
                    }[plateKey];
                    if (ptKey && window.Draw?.PLATE_THICKNESS?.[ptKey]) {
                      t_p_mm = window.Draw.PLATE_THICKNESS[ptKey];
                    }
                    r = window.Buckling.checkLong({
                      d_w, t_w, b_f, t_f,
                      s_mm: 700, t_p_mm, S_m,
                      prof: prof_type,
                      sigma_A,
                      corrosion,
                      corrosion_plate: corrosion,
                      material,
                    });
                    r._kind = 'long';
                    r._profile = profName;
                    r._dims = { d_w, t_w, b_f, t_f };
                  }
                }
              }
            }

            if (r) {
              data.inputs = data.inputs || [];
              data.steps = data.steps || [];
              const hasBk = data.inputs.some(i => i && /Buckling \(LR Sec 7\)/.test(i.label || ''));
              if (!hasBk) {
                if (r._kind === 'plate') {
                  data.inputs.push({
                    label: 'Buckling (LR Sec 7)',
                    value: `UC_c=${r.UC_comp.toFixed(2)} UC_s=${r.UC_shear.toFixed(2)} ${r.pass_all ? '✓' : '✗ FAIL'} · ${corrosion}`
                  });
                  data.steps.push('');
                  data.steps.push(`── Buckling Check (LR Pt 3 Ch 4 Sec 7) ──`);
                  data.steps.push(`Plate: t=${r._t_mm} mm  s=${r._s_mm} mm  S=${S_m} m  material=${material}`);
                  data.steps.push(`Surrounding compartments:  ${compName_A}  |  ${compName_B}  →  Corrosion: ${corrosion}`);
                  data.steps.push(`dt = ${r.dt_mm.toFixed(2)} mm  →  t_net = ${r.tp_mm.toFixed(2)} mm`);
                  data.steps.push(`σ_A (design) = ${r.sigma_A.toFixed(1)} N/mm²   τ_A = ${r.tau_A.toFixed(1)} N/mm²`);
                  data.steps.push(`σ_E = ${r.sigma_E_comp.toFixed(1)}  →  σ_CRB = ${r.sigma_CRB.toFixed(1)} N/mm²`);
                  data.steps.push(`τ_E = ${r.tau_E.toFixed(1)}  →  τ_CRB = ${r.tau_CRB.toFixed(1)} N/mm²`);
                  data.steps.push(`Compression:  UC = β·σ_A/σ_CRB = ${r.UC_comp.toFixed(3)}  ${r.pass_comp ? '✓ OK' : '✗ FAIL'}  (β=1.0 plating)`);
                  data.steps.push(`Shear:        UC = τ_A/τ_CRB = ${r.UC_shear.toFixed(3)}  ${r.pass_shear ? '✓ OK' : '✗ FAIL'}`);
                } else {
                  data.inputs.push({
                    label: 'Buckling (LR Sec 7)',
                    value: `UC=${r.UC.toFixed(2)} [${r.governing_mode}] ${r.pass_all ? '✓' : '✗ FAIL'} · ${corrosion}`
                  });
                  data.steps.push('');
                  data.steps.push(`── Buckling Check (LR Pt 3 Ch 4 Sec 7) ──`);
                  data.steps.push(`Profile: ${r._profile}   S=${S_m} m   material=${material}`);
                  data.steps.push(`Surrounding compartments:  ${compName_A}  |  ${compName_B}  →  Corrosion: ${corrosion}`);
                  data.steps.push(`A_t = ${r.A_t_cm2.toFixed(1)} cm²   I_a = ${r.I_a_cm4.toFixed(0)} cm⁴`);
                  data.steps.push(`σ_A = ${r.sigma_A.toFixed(1)} N/mm²   β = 1.1`);
                  data.steps.push(`σ_E_column    = ${r.sigma_E_col.toFixed(1)}  →  σ_CRB = ${r.sigma_CRB_col.toFixed(1)}`);
                  if (r.sigma_E_tor > 0) data.steps.push(`σ_E_torsional = ${r.sigma_E_tor.toFixed(1)}  →  σ_CRB = ${r.sigma_CRB_tor.toFixed(1)}`);
                  if (r.sigma_E_web > 0) data.steps.push(`σ_E_web       = ${r.sigma_E_web.toFixed(1)}  →  σ_CRB = ${r.sigma_CRB_web.toFixed(1)}`);
                  data.steps.push(`Governing mode: ${r.governing_mode}  →  σ_CRB = ${r.sigma_CRB_gov.toFixed(1)} N/mm²`);
                  data.steps.push(`UC = β·σ_A/σ_CRB = ${r.UC.toFixed(3)}  ${r.pass_buckling ? '✓ OK' : '✗ FAIL'}`);
                  if (r.flange_ratio != null) {
                    data.steps.push(`Flange proportion: b_f/t_f = ${r.flange_ratio.toFixed(1)} ≤ ${r.flange_limit}  ${r.flange_ok ? '✓ OK' : '✗ FAIL'}`);
                  }
                }
                // NOTE: Plate inspector case already runs _platePassCombined,
                // which includes buckling in the overall status. Do NOT append
                // "Buckling FAIL" here — that caused a duplicate/inconsistent
                // verdict (e.g. "local OK · buckl UC=0.98 OK · Buckling FAIL").
              }
              data._bucklingInjected = true;
              data._bucklingData = r;
            }
          }
        }
      }
    }
  } catch (e) { console.warn('Buckling inject error:', e); }

  // Title with optional position-code badge (e.g. "BS01" on the right
  // edge of the title row). Position code is displayed but not editable —
  // it derives from the structural role.
  if (data.positionCode) {
    titleEl.innerHTML = `<span>${data.title || 'Element'}</span>` +
      `<span style="margin-left:auto;background:#1e3a8a;color:#dbeafe;padding:2px 8px;border-radius:4px;font-family:var(--font-mono);font-size:0.7rem;font-weight:600;letter-spacing:0.5px" title="Position code (auto-generated from structural role)">${data.positionCode}</span>`;
    titleEl.style.display = 'flex';
    titleEl.style.alignItems = 'center';
    titleEl.style.justifyContent = 'space-between';
    titleEl.style.gap = '8px';
  } else {
    titleEl.textContent = data.title || 'Element';
    titleEl.style.display = '';
  }
  subtitleEl.textContent = data.subtitle || elemType;
  
  // Render body
  let html = '';
  const _ico = name => (window.icon ? window.icon(name, '1.1em') : '');
  
  // Status banner
  if (data.status) {
    const color = data.status === 'OK' ? 'var(--success)' : (data.status === 'FAIL' ? 'var(--error)' : 'var(--warning)');
    const bg = data.status === 'OK' ? 'rgba(34,197,94,0.12)' : (data.status === 'FAIL' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)');
    const ic = data.status === 'OK' ? 'checkCircle' : (data.status === 'FAIL' ? 'cross' : 'warn');

    // If structured criteria provided: show 3 equal-size cards side-by-side
    // (no outer OK/FAIL banner — each card carries its own status).
    // Otherwise fall back to the classic single banner with statusNote.
    if (Array.isArray(data.statusCriteria) && data.statusCriteria.length) {
      const cards = data.statusCriteria.map(c => {
        const cOK  = c.status === 'OK';
        const cCol = cOK ? 'var(--success)' : 'var(--error)';
        const cBg  = cOK ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
        const cIcon = cOK ? '✓' : '✗';
        return `<div style="flex:1;min-width:0;padding:10px 12px;background:${cBg};border:1px solid ${cCol};border-radius:var(--radius-sm);display:flex;flex-direction:column;gap:4px">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
            <span style="font-size:0.7rem;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;font-weight:700">${c.label}</span>
            <span style="font-size:1rem;color:${cCol};font-weight:700">${cIcon}</span>
          </div>
          <div style="font-size:0.75rem;color:var(--text-secondary);font-family:var(--font-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.value || (cOK ? 'OK' : 'FAIL')}</div>
        </div>`;
      }).join('');
      html += `<div style="display:flex;gap:8px;margin-bottom:14px">${cards}</div>`;
    } else {
      html += `<div style="padding:10px 14px;background:${bg};border:1px solid ${color};border-radius:var(--radius-sm);margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <div style="color:${color};display:inline-flex;align-items:center">${window.icon ? window.icon(ic, '1.5em') : ''}</div>
        <div><div style="font-weight:700;color:${color};font-size:0.9rem">${data.status}</div>
        <div style="font-size:0.7rem;color:var(--text-muted);font-family:var(--font-mono)">${data.statusNote || ''}</div></div>
      </div>`;
    }
  }
  
  // Required vs Provided headline
  if (data.required != null && data.provided != null) {
    // PROVIDED: two-line format when providedValue + providedSub given.
    // Otherwise single-line using data.provided (backward compatible).
    const provValue = data.providedValue || data.provided;
    const provSub   = data.providedSub || '';
    const provInner = provSub
      ? `<div style="font-size:1.1rem;color:var(--text-primary);font-family:var(--font-mono);font-weight:700;margin-top:2px">${provValue}</div>
         <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);font-weight:500;margin-top:3px">${provSub}</div>`
      : `<div style="font-size:1.1rem;color:var(--text-primary);font-family:var(--font-mono);font-weight:700;margin-top:2px">${provValue}</div>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
      <div style="padding:8px 12px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase">Required</div>
        <div style="font-size:1.1rem;color:var(--accent);font-family:var(--font-mono);font-weight:700;margin-top:2px">${data.required}</div>
      </div>
      <div style="padding:8px 12px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase">Provided</div>
        ${provInner}
      </div>
    </div>`;
  }
  
  // Design Pressure (if applicable — from data.pressure)
  if (data.pressure) {
    html += `<div style="padding:10px 12px;background:linear-gradient(135deg, rgba(59,130,246,0.10), rgba(59,130,246,0.03));border:1px solid var(--accent);border-radius:var(--radius-sm);margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.04em">Design Pressure / Head</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div>
          <div style="font-family:var(--font-mono);font-size:1.0rem;color:var(--accent);font-weight:700">${data.pressure.head_m.toFixed(2)} m</div>
          <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono)">Head (h)</div>
        </div>
        <div>
          <div style="font-family:var(--font-mono);font-size:1.0rem;color:var(--accent);font-weight:700">${data.pressure.kPa.toFixed(1)} kPa</div>
          <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono)">P = ρ·g·h</div>
        </div>
      </div>
      <div style="font-size:0.65rem;color:var(--text-muted);margin-top:6px;font-style:italic">${data.pressure.note || ''}</div>
    </div>`;
  }
  
  // Rule reference
  if (data.rule) {
    html += `<div style="margin-bottom:10px">
      <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;margin-bottom:4px">Rule Reference</div>
      <div style="padding:6px 10px;background:var(--bg-tertiary);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.75rem;color:var(--accent)">${data.rule}</div>
    </div>`;
  }
  
  // Formula
  if (data.formula) {
    html += `<div style="margin-bottom:10px">
      <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;margin-bottom:4px">Formula</div>
      <div style="padding:8px 10px;background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.72rem;color:var(--text-primary);line-height:1.4">${data.formula}</div>
    </div>`;
  }
  
  // Inputs (the specific values plugged in)
  if (data.inputs && data.inputs.length) {
    html += `<div style="margin-bottom:10px">
      <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;margin-bottom:4px">Inputs</div>
      <div style="background:var(--bg-tertiary);border-radius:var(--radius-sm);padding:4px 0">`;
    data.inputs.forEach(row => {
      html += `<div style="display:flex;justify-content:space-between;padding:4px 10px;font-family:var(--font-mono);font-size:0.72rem">
        <span style="color:var(--text-secondary)">${row.label}</span>
        <span style="color:var(--text-primary)">${row.value}</span>
      </div>`;
    });
    html += `</div></div>`;
  }
  
  // Calculation steps
  if (data.steps && data.steps.length) {
    html += `<div style="margin-bottom:10px">
      <div style="font-size:0.65rem;color:var(--text-muted);font-family:var(--font-mono);text-transform:uppercase;margin-bottom:4px">Calculation</div>
      <div style="background:var(--bg-input);border:1px solid var(--border);border-radius:var(--radius-sm);padding:8px">`;
    data.steps.forEach(s => {
      html += `<div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-secondary);padding:3px 4px;line-height:1.5">${s}</div>`;
    });
    html += `</div></div>`;
  }
  
  // Notes
  if (data.notes) {
    html += `<div style="margin-top:10px;padding:8px 10px;background:rgba(59,130,246,0.08);border-left:3px solid var(--accent);font-size:0.7rem;color:var(--text-secondary);line-height:1.5;display:flex;gap:8px;align-items:flex-start">
      <span style="color:var(--accent);display:inline-flex;flex-shrink:0;margin-top:1px">${window.icon ? window.icon('info', '14px') : ''}</span>
      <span>${data.notes}</span>
    </div>`;
  }
  
  // Local Optimize moved from inline inspector block to the top toolbar
  // ("Optimize Stiff" button, enabled when a stiffener is selected). This keeps
  // the inspector focused on rule-check results and avoids a busy look.
  let optimizeBlock = '';   // kept for downstream code compatibility; unused

  bodyEl.innerHTML = html;

  // Analysis mode: also render into the persistent Result Panel (replaces Profile Editor).
  // Hide the floating elemInspectPanel since resultPanel now shows everything.
  if (window.ANALYSIS_MODE) {
    const rpBody = document.getElementById('resultPanelBody');
    const rpStatus = document.getElementById('resultPanelStatus');
    if (rpBody) {
      // Full-width content: title + subtitle + OPTIMIZE (if stiff) + the same body HTML
      rpBody.innerHTML = `
        <div style="margin-bottom:12px;padding-bottom:10px;border-bottom:2px solid var(--border)">
          <div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:1rem">${data.title || 'Element'}</div>
          <div style="font-size:0.72rem;color:var(--text-muted);font-family:var(--font-mono);margin-top:3px">${data.subtitle || elemType}</div>
        </div>
        ${optimizeBlock}
        ${html.replace(optimizeBlock, '')}
      `;
    }
    if (rpStatus) {
      const st = data.status || '';
      rpStatus.textContent = st ? `Status: ${st}` : '';
      rpStatus.style.color = /FAIL|NG/i.test(st) ? 'var(--error)' :
                              /OK|PASS/i.test(st) ? 'var(--success)' :
                              'var(--text-muted)';
    }
    // Hide the floating panel — content is now in resultPanel
    panel.style.display = 'none';
    // Wire optimize buttons in result panel too
    const rpBody2 = document.getElementById('resultPanelBody');
    if (rpBody2) {
      rpBody2.querySelectorAll('.opt-stiff-btn').forEach(btn => {
        btn.addEventListener('click', () => _handleOptimizeClick(btn.dataset.group, parseInt(btn.dataset.idx), 'stiff'));
      });
      rpBody2.querySelectorAll('.opt-band-btn').forEach(btn => {
        btn.addEventListener('click', () => _handleOptimizeClick(btn.dataset.group, parseInt(btn.dataset.band), 'band'));
      });
    }
  }
}

// Compute the rule-check data for a given element
function _computeElemInspect(elemType, opts) {
  const num = id => { const e=document.getElementById(id); return e ? parseFloat(e.value) : NaN; };

  // ─── Helper: resolve the EFFECTIVE k for a strake / stiffener ───
  // The scantling formulas use `p.k` (global Setup default), but every
  // strake / long can override its material family (MS / AH32 / AH36 / AH40).
  // Without this helper, switching a single strake to MS leaves the
  // analysis panel computing with the global k — so the displayed `t_req`
  // never moves. Tries the local override first, then the global p.k.
  // (v33 — this is the main fix for "I changed the strake to MS but the
  // hesap and k didn't update" reports.)
  const _resolveK = (plateGroup, strakeIdx, stiffIdx, fallbackK) => {
    try {
      // 1) Stiffener-level pin (per-row override)
      if (plateGroup && stiffIdx != null && window.Draw?.profiles?.[plateGroup]) {
        const stiff = window.Draw.profiles[plateGroup][stiffIdx];
        const fam = stiff && (stiff.gradeManual ? stiff.materialFamily : null);
        if (fam && window.MATERIAL?.[fam]?.k != null) return window.MATERIAL[fam].k;
      }
      // 2) Strake-level pin (per-strake override)
      if (plateGroup && strakeIdx != null && window.Draw?.STRAKES?.[plateGroup]) {
        const sk = window.Draw.STRAKES[plateGroup][strakeIdx];
        if (sk && sk.materialFamilyManual && sk.materialFamily
            && window.MATERIAL?.[sk.materialFamily]?.k != null) {
          return window.MATERIAL[sk.materialFamily].k;
        }
      }
      // 3) Whole-plate pin (Stringer / Tween / Upper Deck / coaming / sg*)
      if (plateGroup && window.PLATE_MATERIAL_FAMILY?.[plateGroup]
          && window.MATERIAL?.[window.PLATE_MATERIAL_FAMILY[plateGroup]]?.k != null) {
        return window.MATERIAL[window.PLATE_MATERIAL_FAMILY[plateGroup]].k;
      }
    } catch (_) { /* fall through */ }
    return fallbackK;
  };

  // ─── Helper: get the EFFECTIVE profile name for a stiffener ───
  // If the user clicked a specific stiff and it has a per-stiff profileName
  // override (set e.g. by Local Optimize → Apply), use that. Otherwise fall
  // back to the scantling-page group default dropdown.
  // Usage: _stiffProfileName('innerBottom', 'ibLongProfile')
  const _stiffProfileName = (group, defaultSelectId) => {
    try {
      if (opts && opts.index != null && window.Draw?.profiles?.[group]) {
        const stiff = window.Draw.profiles[group][opts.index];
        if (stiff && stiff.profileName) return stiff.profileName;
      }
    } catch(e) {}
    const el = document.getElementById(defaultSelectId);
    return el ? el.value : '';
  };

  // ─── Helper: PASS/FAIL for plate thickness with 0.25 mm rounding tolerance ───
  // The project's plate-rounding rule allows rounding DOWN when the fractional
  // part of the required thickness is ≤ 0.25 mm (no half-mm plates).
  // Mirror that tolerance here: a provided thickness within 0.25 mm below the
  // computed requirement is treated as OK (same tolerance used for ordering).
  const _thickStatus = (provided, required) => {
    const TOL = 0.25;
    const pass = provided >= required - TOL;
    if (pass) {
      const margin = provided - required;
      const note = margin >= 0
        ? `Margin: +${margin.toFixed(2)} mm`
        : `Within rounding tolerance (−${(-margin).toFixed(2)} mm, ≤ ${TOL} mm)`;
      return { status: 'OK', statusNote: note };
    }
    return { status: 'FAIL', statusNote: `Deficit: ${(required - provided).toFixed(2)} mm` };
  };

  // ─── Helper: Combined plate status — local + hull girder + buckling ───
  // Returns {overallStatus, localStatus, hgStatus, bucklingStatus, note}
  // A plate is OK only if ALL THREE pass. Any FAIL → overall FAIL.
  // This is what the user expects: "Status OK" must reflect the whole picture.
  // IMPORTANT: uses the same _bucklingPlateResult (with corrosion) that the
  // analysis panel uses — single source of truth, no conflicting verdicts.
  const _platePassCombined = (t_provided, t_req_local, s_mm, z_m, stiffening, plateKey, Y_mm) => {
    // 1) Local (with 0.25 mm rounding tolerance)
    const local = _thickStatus(t_provided, t_req_local);

    // 2) Hull girder: σ at this z vs σ_perm
    let hg = { status: 'OK', ratio: null };
    try {
      const Ms_design = parseFloat(document.getElementById('MsDesign')?.value || 0);
      const ls = window.runLongStrengthAnalysis?.();
      if (ls && ls.section) {
        const M_hog = Math.abs(ls.M_total_hog);
        const M_sag = Math.abs(ls.M_total_sag);
        const M_max = Math.max(M_hog, M_sag);
        const dz = z_m - ls.section.z_NA;
        const sigma_hg = Math.abs(M_max * dz / ls.section.I_NA) * 1e-3;  // N/mm²
        const ratio = sigma_hg / ls.sigma_amid;
        hg = {
          status: ratio <= 1.0 ? 'OK' : 'FAIL',
          sigma_hg,
          sigma_perm: ls.sigma_amid,
          ratio
        };
      }
    } catch(e) {}

    // 3) Buckling (LR Pt 3 Ch 4 Sec 7) — USE _bucklingPlateResult for
    //    consistency with the analysis panel (same corrosion assumptions).
    //    Fall back to a simpler checkPlate call if plateKey not given.
    let bk = { status: 'OK', UC: null };
    try {
      let res = null;
      if (plateKey && typeof _bucklingPlateResult === 'function') {
        res = _bucklingPlateResult(plateKey, t_provided, s_mm, z_m, Y_mm);
      } else if (window.Buckling && window.Buckling.checkPlate && window.runLongStrengthAnalysis) {
        const p = getParams();
        const Ms_design = parseFloat(document.getElementById('MsDesign')?.value || 0);
        const ls = window.runLongStrengthAnalysis();
        if (ls && ls.section) {
          const z_NA = ls.section.z_NA;
          const I_NA = ls.section.I_NA;
          // M_total (Ms + Mw), not wave-only.
          const M_hog = Math.abs(ls.M_total_hog);
          const M_sag = Math.abs(ls.M_total_sag);
          const G_ = (window.Draw && window.Draw.GEOMETRY) || {};
          const z_deck = (G_.UD || 15300)/1000;
          const is_above = z_m >= z_NA;
          const z_face = is_above ? (z_deck - z_NA) : z_NA;
          // LR Pt 3 Ch 4 Sec 7.4.1 — design compressive stress σ_A:
          //   above NA → σ_D from SAGGING moment
          //   below NA → σ_B from HOGGING moment
          // (Replaces earlier max(M_hog, M_sag) which was overly conservative
          //  on the side with the smaller moment.)
          const M_for_face = is_above ? M_sag : M_hog;
          const sigma_face = Math.abs(M_for_face * z_face / I_NA) * 1e-3;
          const sigma_A = window.Buckling.sigmaADesign(
            sigma_face, Math.abs(z_m - z_NA), z_face, p.kL || 0.72
          );
          const tau_A = window.Buckling.tauADesignInitial(p.kL || 0.72);
          res = window.Buckling.checkPlate({
            s_mm, t_mm: t_provided, S_m: 2.1,
            sigma_A, tau_A,
            stiffening: stiffening || 'LONGITUDINAL',
            corrosion: { plate: 0, stiff: 0 },
            material: p.material || 'AH36',
          });
        }
      }
      if (res) {
        const uc_c = res.UC_comp != null ? res.UC_comp : 0;
        const uc_s = res.UC_shear != null ? res.UC_shear : 0;
        const UC = Math.max(uc_c, uc_s);
        const pass = (typeof res.pass_all === 'boolean') ? res.pass_all : (uc_c <= 1.0 && uc_s <= 1.0);
        bk = { status: pass ? 'OK' : 'FAIL', UC, UC_comp: uc_c, UC_shear: uc_s };
      }
    } catch(e) {}

    const allOK = (local.status === 'OK') && (hg.status === 'OK') && (bk.status === 'OK');
    const parts = [];
    parts.push(`local: ${local.status}`);
    if (hg.ratio != null) parts.push(`HG σ/σₚ=${hg.ratio.toFixed(2)} ${hg.status}`);
    if (bk.UC != null) parts.push(`buckl UC=${bk.UC.toFixed(2)} ${bk.status}`);
    // Structured criteria for 3-badge UI rendering
    const criteria = [
      { label: 'Local',    value: local.statusNote || (local.status === 'OK' ? 'within tol.' : 'deficit'), status: local.status },
    ];
    if (hg.ratio != null) {
      criteria.push({
        label: 'Hull girder',
        value: `σ/σₚ = ${hg.ratio.toFixed(2)}`,
        status: hg.status
      });
    }
    if (bk.UC != null) {
      criteria.push({
        label: 'Buckling',
        value: `UC = ${bk.UC.toFixed(2)}`,
        status: bk.status
      });
    }
    return {
      overallStatus: allOK ? 'OK' : 'FAIL',
      localStatus: local.status,
      hgStatus: hg.status,
      bucklingStatus: bk.status,
      hg, bk,
      note: parts.join(' · '),
      criteria,   // [{label, value, status}, ...] — for 3-badge UI
    };
  };

  // ─── Helper: Combined stiffener status — Z_req + HG + column buckling ───
  // Inputs:
  //   Z_sec      — as-built section modulus with attached plate (cm³)
  //   Z_req      — rule-required section modulus (cm³, LR Pt 4 Ch 1)
  //   z_m        — stiffener height above BL (m) for HG stress
  //   group      — profile group key ('bottomShell', 'innerBottom', …)
  //   index      — stiffener index within group (for _bucklingLongResult)
  // Returns { overallStatus, criteria } like _platePassCombined.
  const _stiffPassCombined = (Z_sec, Z_req, z_m, group, index) => {
    // 1) Local rule — Z_sec ≥ Z_req (small rounding tolerance of 2 cm³)
    const TOL_Z = 2.0;
    const zPass = (Z_sec >= Z_req - TOL_Z);
    const zPct = Z_req > 0 ? (Z_sec / Z_req) : 0;
    const local = {
      status: zPass ? 'OK' : 'FAIL',
      value: `Z=${Z_sec.toFixed(0)}/${Z_req.toFixed(0)} cm³`,
    };

    // 2) Hull girder stress at stiffener z
    let hg = null;
    try {
      if (z_m != null && typeof _hgStressAtZ === 'function') {
        const h = _hgStressAtZ(z_m);
        if (h && h.ratio != null) {
          hg = {
            status: h.ratio <= 1.0 ? 'OK' : 'FAIL',
            ratio: h.ratio,
            sigma_hg: h.sigma_hg,
            sigma_perm: h.sigma_perm,
            value: `σ/σₚ = ${h.ratio.toFixed(2)}`
          };
        }
      }
    } catch(e) {}

    // 3) Column buckling (Sec 7)
    let bk = null;
    try {
      if (group && index != null && z_m != null && typeof _bucklingLongResult === 'function') {
        const r = _bucklingLongResult(group, index, z_m);
        if (r && r.UC != null) {
          bk = {
            status: r.pass_all ? 'OK' : 'FAIL',
            UC: r.UC,
            mode: r.governing_mode,
            value: `UC = ${r.UC.toFixed(2)}`
          };
        }
      }
    } catch(e) {}

    const checks = [
      { label: 'Z req',      status: local.status, value: local.value },
    ];
    if (hg) checks.push({ label: 'Hull girder', status: hg.status, value: hg.value });
    if (bk) checks.push({ label: 'Buckling',    status: bk.status, value: bk.value });
    const allOK = checks.every(c => c.status === 'OK');

    return {
      overallStatus: allOK ? 'OK' : 'FAIL',
      localStatus: local.status,
      hgStatus: hg ? hg.status : 'OK',
      bucklingStatus: bk ? bk.status : 'OK',
      local, hg, bk,
      criteria: checks,
    };
  };

  
  // ─── Helper: Compute hull girder normal stress at height z (m above BL) ───
  // Returns { z_m, dz_m, sigma_hg, sigma_perm, ratio, pass, M_max, side } or null.
  // Used to show "boy mukavemetinden gelen gerilme" for every plate/profile.
  function _hgStressAtZ(z_m) {
    try {
      const p = getParams();
      const ls = runLongStrengthAnalysis();
      if (!ls || !ls.section || !ls.section.I_NA) return null;
      const dz_m = z_m - ls.section.z_NA;
      const M_hog = Math.abs(ls.M_total_hog);
      const M_sag = Math.abs(ls.M_total_sag);
      const M_max = Math.max(M_hog, M_sag);
      const sigma_hg = Math.abs(M_max * dz_m / ls.section.I_NA) * 1e-3;
      const sigma_perm = ls.sigma_amid;
      return {
        z_m, z_NA: ls.section.z_NA, dz_m,
        sigma_hg, sigma_perm,
        ratio: sigma_hg / sigma_perm,
        pass: sigma_hg <= sigma_perm,
        M_max,
        side: dz_m < 0 ? 'below NA (tension in sag, compression in hog)' 
                       : 'above NA (compression in sag, tension in hog)'
      };
    } catch (e) { return null; }
  }
  
  // Helper: attach HG stress block to a result (mutates `out.inputs` and `out.steps`).
  // `z_m` is the height at which to evaluate hull girder stress.
  // `label` is the element label shown in the panel (e.g. "SH-2", "IB Long z=1.80 m").
  function _attachHGStress(out, z_m, label) {
    const hg = _hgStressAtZ(z_m);
    if (!hg) return out;
    out.inputs = out.inputs || [];
    out.steps = out.steps || [];
    // Inputs table: one-line summary
    out.inputs.push({
      label: 'Hull girder σ (Pt 3 Ch 4 Sec 5.7)',
      value: `${hg.sigma_hg.toFixed(1)} / ${hg.sigma_perm.toFixed(0)} N/mm²  ratio ${hg.ratio.toFixed(2)}  ${hg.pass ? '✓' : '✗ FAIL'}`
    });
    // Steps: detailed breakdown at bottom
    out.steps.push('');
    out.steps.push(`── Hull Girder Stress at this ${label || 'element'} (Pt 3 Ch 4 Sec 5.7) ──`);
    out.steps.push(`z = ${hg.z_m.toFixed(2)} m · z_NA = ${hg.z_NA.toFixed(2)} m · Δz = ${hg.dz_m.toFixed(2)} m  [${hg.side}]`);
    out.steps.push(`M_total_max = ${hg.M_max.toLocaleString()} kN·m   (Ms + |Mw| worst)`);
    out.steps.push(`σ_hg = |M · Δz / I_NA| × 10⁻³ = ${hg.sigma_hg.toFixed(1)} N/mm²`);
    out.steps.push(`σ_perm = 175/kL = ${hg.sigma_perm.toFixed(1)} N/mm²`);
    out.steps.push(`Ratio = ${hg.ratio.toFixed(3)} ${hg.pass ? '✓ OK (within limit)' : '✗ FAIL (exceeds limit)'}`);
    // Status note: add HG summary if element doesn't already flag FAIL
    if (out.statusNote && !out.statusNote.includes('HG σ')) {
      out.statusNote += ` · HG σ ${hg.sigma_hg.toFixed(0)}/${hg.sigma_perm.toFixed(0)} ${hg.pass?'✓':'✗'}`;
    }
    return out;
  }
  
  // After switch, we'll auto-attach HG stress based on elemType + opts.
  // This ensures EVERY plate/profile shows "boy mukavemetinden gelen gerilme".

  // ─── Helper: resolve the actual profile used by a specific stiffener ───
  // Returns { name, Z_cm3, A_cm2, type } or null.
  // Checks stiff.profileName (per-row override), falls back to group default
  // read from the scantling-page select.
  function _resolveStiffProfile(opts) {
    if (!opts || !opts.group || opts.index == null) return null;
    const D = window.Draw;
    if (!D || !D.profiles) return null;
    const arr = D.profiles[opts.group];
    const stiff = arr && arr[opts.index];
    if (!stiff) return null;

    // ─── CUSTOM PROFILE: user entered dimensions manually via the modal.
    //     Return the pre-computed Z/A/I directly (no catalog lookup).
    if (stiff.customProfile) {
      const cp = stiff.customProfile;
      return {
        name: stiff.profileName || cp.name || '(custom)',
        type: cp.type,
        Z_cm3: cp.Z_cm3,
        I_cm4: cp.I_cm4,
        A_cm2: cp.A_cm2,
        weight_kgm: cp.weight,
        isOverride: true,
        isCustom: true
      };
    }

    // Per-stiffener override
    let profName = stiff.profileName;
    // Fallback: group default from scantling page
    if (!profName) {
      const SEL = {
        bottomShell:'bottomLongProfile', innerBottom:'ibLongProfile',
        sideShell:'sideLongProfile',     innerSide:'isLongProfile',
        stringerStiff:'strDeckProfile',  tweenStiff:'twnDeckProfile',
        coamingStiff:'coamingProfile',   upperDeck:'deckLongProfile'
      };
      const selId = SEL[opts.group];
      const sel = selId ? document.getElementById(selId) : null;
      profName = sel && sel.value ? sel.value : '';
    }
    if (!profName) return null;
    // Compute section modulus with the REAL attached plate for this stiff's
    // group. Previously this used a hardcoded s=700, t=10 (visible via
    // computeCombinedSection signature below), which meant every inspector
    // call showed Z_sec derived from wrong plate — a major discrepancy for
    // bottom/IB/deck where actual t is 13–16 mm, not 10.
    try {
      if (!window.Profile || !window.Profile.allProfiles) return { name: profName, Z_cm3: null };
      const pd = window.Profile.allProfiles(['L','HP','FB','T']).find(p => p.name === profName);
      if (!pd) return { name: profName, Z_cm3: null };
      const { pw_mm, pt_mm } = (typeof _attachedPlateFor === 'function')
        ? _attachedPlateFor(opts.group, stiff)
        : { pw_mm: 700, pt_mm: 10 };
      const r = window.Profile.computeCombinedSection(pd, true, pw_mm, pt_mm, 90);
      // Z_cm3 for scantling check should be the MINIMUM of top/bottom moduli.
      // For HP profiles this matters because Z_top (plate-to-bulb) is typically
      // smaller than Z_bot (plate edge). Reporting WxxBot alone would overstate
      // capacity and let under-sized HPs appear to pass.
      const Z_min = Math.min(r.WxxBot, r.WxxTop);
      return {
        name: profName,
        type: pd.type,
        Z_cm3: Z_min,
        Z_top_cm3: r.WxxTop,
        Z_bot_cm3: r.WxxBot,
        I_cm4: r.combinedIxx,
        A_cm2: r.totalArea,
        weight_kgm: r.weight,
        isOverride: !!stiff.profileName
      };
    } catch (e) {
      return { name: profName, Z_cm3: null };
    }
  }

  // Helper: format the "Provided" field for a stiffener inspection.
  // Returns "L 250x90x12 · Z=247 cm³" or "(no profile selected)"
  function _providedProfileStr(opts) {
    const r = _resolveStiffProfile(opts);
    if (!r) return '(no profile selected)';
    if (r.Z_cm3 == null) return r.name;
    const customTag = r.isOverride ? ' (custom)' : '';
    return `${r.name} · Z=${r.Z_cm3.toFixed(1)} cm³${customTag}`;
  }

  // ─── Helper: auto-detect corrosion category from surrounding compartments.
  // plateKey: 'shell' | 'innerBottom' | 'innerSide' | 'upperDeck' | 'coaming' | ...
  // At a given z_m (or Y_mm for horizontal), returns 'DRY_BULK' / 'ONE_WB_VERT' / 'TWO_WB_HORIZ'
  function _corrosionForPlate(plateKey, z_m, Y_mm) {
    if (!window.Buckling || !window.Buckling.corrosionFromComps) return 'DRY_BULK';
    const G = (window.Draw && window.Draw.GEOMETRY) || {};
    const z_mm = (z_m != null) ? z_m * 1000 : null;

    // Two compartments sharing this plate (a = one side, b = other).
    // Horizontal plates: a = below, b = above. Vertical plates: a = outboard, b = inboard.
    let a = null, b = null, orientation = 'vertical';

    switch (plateKey) {
      case 'shell':
      case 'bottomShell': {
        // Bottom shell (keel/bottom): horizontal plate, sea below, DB above
        // Side shell: vertical plate, sea outboard, compartment inboard
        // Without z we can't reliably distinguish — use z to pick orientation:
        //   z ≤ R_B → horizontal (bottom/bilge region)  — a=below(sea), b=above(inboard)
        //   z >  R_B → vertical (side) — a=outboard(sea), b=inboard
        const R_B_m = (G.R_B || 1800) / 1000;
        const zOrDefault = (z_m != null ? z_m : 0);
        if (zOrDefault <= R_B_m) {
          orientation = 'horizontal';
          a = null;  // sea below keel/bottom
          // Just above the bottom: find the compartment inside (DB tank or cargo)
          b = window.getCompartmentAt ? window.getCompartmentAt(Y_mm || 3000, 100) : null;
        } else {
          orientation = 'vertical';
          a = null;  // sea outboard
          if (z_mm != null && window.getCompartmentAt) {
            const Y_inb = (G.B_half || 11880) - 100;
            b = window.getCompartmentAt(Y_inb, z_mm);
          }
        }
        break;
      }
      case 'innerBottom': {
        // IB: below = DB tank (ballast or duct keel void), above = cargo
        orientation = 'horizontal';
        // Just below IB
        a = window.getCompartmentAt ? window.getCompartmentAt(Y_mm || 3000, G.IB - 50) : null;
        b = window.getCompartmentAt ? window.getCompartmentAt(Y_mm || 3000, G.IB + 50) : null;
        break;
      }
      case 'innerSide': {
        // IS: outboard = ballast wing tank, inboard = cargo hold
        orientation = 'vertical';
        if (z_mm != null && window.getCompartmentAt) {
          a = window.getCompartmentAt((G.IS || 10030) + 50, z_mm);
          b = window.getCompartmentAt((G.IS || 10030) - 50, z_mm);
        }
        break;
      }
      case 'upperDeck':
      case 'stringer':
      case 'tween': {
        orientation = 'horizontal';
        const z_here = plateKey === 'upperDeck' ? G.UD
                     : plateKey === 'stringer' ? (parseFloat(document.getElementById('strDeckZ')?.value) || 8590)
                     : (parseFloat(document.getElementById('twnDeckZ')?.value) || 12900);
        if (window.getCompartmentAt) {
          a = window.getCompartmentAt(Y_mm || 3000, z_here - 50);
          b = window.getCompartmentAt(Y_mm || 3000, z_here + 50);
        }
        if (plateKey === 'upperDeck') b = { type: 'weather' };  // above UD = outside
        break;
      }
      case 'coaming': {
        // Top plate of coaming: both sides are weather (exterior atop hatch).
        a = { type: 'weather' };
        b = null;  // sea/weather
        orientation = 'horizontal';
        break;
      }
      default:
        return 'DRY_BULK';
    }
    return window.Buckling.corrosionFromComps(a, b, orientation);
  }

  // ─── Helper: run LR Pt 3 Ch 4 Sec 7 PLATE buckling check for a strake.
  // Returns {...result + description} or null.
  function _bucklingPlateResult(plateKey, t_mm, s_mm, z_m, Y_mm) {
    if (!window.Buckling) return null;
    const p = getParams();
    const S_m = 2.1;  // default web frame spacing

    // Hull girder section properties — needed for σ at extreme fibre
    const ls = runLongStrengthAnalysis();
    if (!ls || !ls.section || !ls.section.I_NA) return null;
    const z_NA = ls.section.z_NA;
    const I_NA = ls.section.I_NA;
    const M_hog = Math.abs(ls.M_total_hog);
    const M_sag = Math.abs(ls.M_total_sag);
    const dz_m = z_m - z_NA;

    // σ at the extreme fibre (deck above NA, bottom below NA)
    const z_deck = ((window.Draw?.GEOMETRY?.UD) || 15300) / 1000;
    const is_above = z_m >= z_NA;
    const z_face = is_above ? (z_deck - z_NA) : z_NA;
    // LR Pt 3 Ch 4 Sec 7.4.1 — design compressive stress σ_A:
    //   "for structural members above the neutral axis, σ_A = σ_D · z/z_D
    //    where σ_D is based on SAGGING moment"
    //   "for structural members below the neutral axis, σ_A = σ_B · z/z_B
    //    where σ_B is based on HOGGING moment"
    // Compression at the face is what governs buckling: above-NA plates are
    // compressed in sagging (deck dips down), below-NA plates are compressed
    // in hogging (bottom pushes up). Earlier versions used max(M_hog, M_sag)
    // which was conservative for whichever side was the smaller of the two
    // — typically the deck (sagging tends to be the smaller moment when
    // Ms_design is positive/hogging), inflating UC by 2–3× there. Picking
    // the correct moment per side restores rule-compliant σ_A.
    const M_for_face = is_above ? M_sag : M_hog;
    const sigma_face = Math.abs(M_for_face * z_face / I_NA) * 1e-3;  // N/mm²
    const kL = p.kL || 0.72;
    const sigma_A = window.Buckling.sigmaADesign(sigma_face, Math.abs(dz_m), z_face, kL);

    // τ_A — ACTUAL hull girder shear stress at this z, using shear flow τ = F·Q/(I·t)
    // Falls back to LR default 30/k_L (minimum from Sec 7.4.2) when Q/F not available.
    // LR allows a calculated τ_A ≥ 30/k_L; if the real value is smaller, use 30/k_L
    // as the floor (protects against artificially low shear in slender members).
    let tau_A;
    try {
      // Wave shear force (Qwo from LongStrength.analyze) — kN
      const Qwo_kN = (ls.Q_design != null ? ls.Q_design : null) || ls.Qwo || ls.F?.Qwo || null;   // Q_s + Q_w at the section (LR Pt 3 Ch 4 Sec 6.7)
      const Q_m3 = (typeof window.computeShearFirstMoment === 'function')
        ? window.computeShearFirstMoment(z_m)
        : null;
      if (Qwo_kN != null && Q_m3 != null && Q_m3 > 0) {
        // τ = F·Q / (I·t·1000)   [F in N, Q in m³, I in m⁴, t in mm → N/mm²]
        const F_N = Qwo_kN * 1000;
        // Shear efficiency of the panel this plate sits on (section model, 1 when unset):
        // only effS·t of the plate carries the shear flow.
        const effS = (window.SectionAdapter && SectionAdapter.effSAt) ? SectionAdapter.effSAt(Y_mm, z_m * 1000) : 1;
        const tau_real = effS > 0 ? (F_N * Q_m3) / (I_NA * t_mm * effS * 1000) : 0;
        const tau_floor = 30 / kL;   // LR Sec 7.4.2 lower bound
        tau_A = Math.max(Math.abs(tau_real), tau_floor);
      } else {
        tau_A = window.Buckling.tauADesignInitial(kL);
      }
    } catch(e) {
      tau_A = window.Buckling.tauADesignInitial(kL);
    }

    // Auto corrosion
    const corrosion = _corrosionForPlate(plateKey, z_m, Y_mm);

    const material = p.material || 'AH36';
    const res = window.Buckling.checkPlate({
      s_mm, t_mm, S_m,
      sigma_A, tau_A,
      stiffening: 'LONGITUDINAL',
      corrosion,
      material,
    });

    // Diagnostic log
    if (window._BK_DEBUG) {
      console.log(`[_bucklingPlateResult] ${plateKey}  z=${z_m.toFixed(2)}m  Y=${Y_mm||'—'}  t=${t_mm}  s=${s_mm}`,
        `\n  I_NA=${I_NA.toFixed(2)} m⁴  z_NA=${z_NA.toFixed(2)}m  dz=${dz_m.toFixed(2)}  M_max=${(M_max/1000).toFixed(0)} MN·m`,
        `\n  σ_face=${sigma_face.toFixed(1)}  σ_A=${sigma_A.toFixed(1)}  τ_A=${tau_A.toFixed(1)} N/mm²`,
        `\n  corrosion=${corrosion}  dt=${res?.dt_mm?.toFixed(2)}  tp=${res?.tp_mm?.toFixed(2)}`,
        `\n  σ_E=${res?.sigma_E_comp?.toFixed(1)}  σ_CRB=${res?.sigma_CRB?.toFixed(1)}  UC_c=${res?.UC_comp?.toFixed(3)}`,
        `\n  τ_E=${res?.tau_E?.toFixed(1)}  τ_CRB=${res?.tau_CRB?.toFixed(1)}  UC_s=${res?.UC_shear?.toFixed(3)}`);
    }

    return {
      ...res,
      corrosion_cat: corrosion,
      S_m_used: S_m,
      tau_A_used: tau_A,
    };
  }

  // ─── Helper: LONGITUDINAL buckling check for a specific stiffener.
  function _bucklingLongResult(group, index, z_m) {
    if (!window.Buckling || !window.Draw) return null;
    const arr = window.Draw.profiles[group];
    const stiff = arr && arr[index];
    if (!stiff) return null;
    const p = getParams();
    const S_m = 2.1;

    // Resolve profile dimensions from profile name
    const profResolved = _resolveStiffProfile({ group, index });
    if (!profResolved || !profResolved.name) return null;

    // Map profile type to Buckling's LongitudinalType
    let prof_type;
    let d_w = 0, t_w = 0, b_f = 0, t_f = 0;
    let profCatType;

    // ─── CUSTOM PROFILE BRANCH ─────────────────────────────────────────────
    // If the stiff has a customProfile (user entered dims via modal), use its
    // dims directly — don't require catalog entry. Otherwise the buckling
    // check would silently bypass (return null) for every custom stiff.
    if (stiff.customProfile) {
      const cp = stiff.customProfile;
      const d = cp.dims || {};
      profCatType = cp.type;
      if (cp.type === 'L') {
        d_w = d.a || 0; t_w = d.t || 0;
        b_f = d.b || 0; t_f = d.t || 0;
      } else if (cp.type === 'HP') {
        d_w = d.b || 0; t_w = d.t || 0;
        b_f = d.c || 0; t_f = d.c || 0;
      } else if (cp.type === 'FB') {
        d_w = d.h || 0; t_w = d.t || 0;
      } else if (cp.type === 'T') {
        d_w = d.h || 0;  t_w = d.tw || 0;
        b_f = d.bf || 0; t_f = d.tf || 0;
      }
    } else {
      // Catalog lookup — existing path
      const profCat = window.Profile?.allProfiles?.(['L','HP','FB','T'])?.find(p => p.name === profResolved.name);
      if (!profCat) return null;
      profCatType = profCat.type;
      // Extract dimensions from the catalog's `dimensions` object.
      //   L:  {a, b, t}       a=web_height, b=flange_width, t=web_thickness=flange_thickness
      //   HP: {b, t, c}       b=web_height, t=web_thickness, c=bulb_size
      //   FB: {h, t}          h=web_height, t=web_thickness
      //   T:  {a, b, tw, tf}  a=web_height, b=flange_width, tw/tf=thicknesses
      const dim = profCat.dimensions || {};
      if (profCat.type === 'L') {
        d_w = dim.a || 0;
        t_w = dim.t || 0;
        b_f = dim.b || 0;
        t_f = dim.t || 0;
      } else if (profCat.type === 'HP') {
        d_w = dim.b || 0;
        t_w = dim.t || 0;
        // HP = bulb plate; use bulb as "flange" for LR formulas:
        b_f = dim.c || 0;
        t_f = dim.c || 0;
      } else if (profCat.type === 'FB') {
        d_w = dim.h || dim.a || 0;
        t_w = dim.t || 0;
        b_f = 0;
        t_f = 0;
      } else if (profCat.type === 'T') {
        d_w = dim.a || 0;
        t_w = dim.tw || dim.t || 0;
        b_f = dim.b || 0;
        t_f = dim.tf || dim.t || 0;
      }
    }

    if (profCatType === 'L') prof_type = 'L';
    else if (profCatType === 'HP') prof_type = 'BULB';
    else if (profCatType === 'FB') prof_type = 'FLAT_BAR';
    else if (profCatType === 'T')  prof_type = 'TEE';
    else prof_type = 'L';

    // Attached plate: use the REAL spacing for this group and the REAL
    // plate thickness at the stiff's position. Previously these were
    // hardcoded to 700 / 14 mm, which silently under- or overestimated
    // the combined-section second moment and the plate-level buckling
    // coefficients.
    // --- spacing ---
    const spacingIds = {
      bottomShell:'bottomLongSpacing', innerBottom:'ibLongSpacing',
      upperDeck:'deckLongSpacing',
      stringerStiff:'strDeckSpacing', tweenStiff:'twnDeckSpacing',
      // sideShell / innerSide are strake-local; pick strake's spacing below
    };
    let s_mm = 700;
    const sid = spacingIds[group];
    if (sid) {
      const v = parseFloat(document.getElementById(sid)?.value);
      if (v > 0) s_mm = v;
    }
    // --- plate thickness at stiff's z ---
    let t_p_mm = 14;
    const pk = group === 'bottomShell' || group === 'sideShell' ? 'shell'
             : group === 'innerBottom' ? 'innerBottom'
             : group === 'innerSide' ? 'innerSide'
             : null;
    if (pk && window.Draw.STRAKES && window.Draw.STRAKES[pk]) {
      const strakes = window.Draw.STRAKES[pk];
      const G = window.Draw.GEOMETRY || {};
      const z_mm = Math.round((z_m || 0) * 1000);
      if (pk === 'innerSide') {
        // IS strakes: stacked from IB upward.
        let cursor = G.IB || 1800;
        for (const st of strakes) {
          if (z_mm >= cursor && z_mm <= cursor + st.width) { t_p_mm = st.thickness || t_p_mm; break; }
          cursor += st.width;
        }
      } else if (pk === 'shell') {
        // Shell strakes: keel→bottom→bilge→side (side starts at z = R_B).
        // For bottom stiffs (z ≈ 0), pick any bottom/keel strake.
        // For side stiffs, pick the side strake whose vertical range contains z_mm.
        const isBottom = group === 'bottomShell';
        if (isBottom) {
          // Representative: keel or first bottom strake
          const bottomS = strakes.find(s => s.kind === 'keel' || s.kind === 'bottom');
          if (bottomS) t_p_mm = bottomS.thickness || t_p_mm;
        } else {
          // Side: walk side strakes from R_B upward
          const R_B = G.R_B || 1800;
          let cursor = R_B;
          for (const st of strakes) {
            if (st.kind !== 'side') continue;
            if (z_mm >= cursor && z_mm <= cursor + st.width) { t_p_mm = st.thickness || t_p_mm; break; }
            cursor += st.width;
          }
        }
      } else if (pk === 'innerBottom') {
        // Innerbottom is a single plate level — pick representative (first) strake.
        if (strakes.length > 0) t_p_mm = strakes[0].thickness || t_p_mm;
      }
    } else {
      // Non-strake groups (upper deck, stringer, tween, coaming)
      const PT = window.Draw.PLATE_THICKNESS || {};
      if (group === 'upperDeck') t_p_mm = PT.upperDeck || t_p_mm;
      else if (group === 'stringerStiff') t_p_mm = PT.stringer || t_p_mm;
      else if (group === 'tweenStiff') t_p_mm = PT.tween || t_p_mm;
      else if (group === 'coamingStiff') t_p_mm = PT.coaming || t_p_mm;
      else t_p_mm = PT[group.replace('Stiff','')] || t_p_mm;
    }

    // Design stress — read I_NA/z_NA directly from section properties.
    // Do NOT use hg.I_NA (it doesn't exist on the _hgStressAtZ return object;
    // earlier code used `|| 1` fallback which produced UC values in the thousands).
    const ls_long = runLongStrengthAnalysis();
    if (!ls_long || !ls_long.section || !ls_long.section.I_NA) return null;
    const z_NA = ls_long.section.z_NA;
    const I_NA = ls_long.section.I_NA;
    const M_hog = Math.abs(ls_long.M_total_hog);
    const M_sag = Math.abs(ls_long.M_total_sag);
    const dz_m_long = z_m - z_NA;
    const z_deck = ((window.Draw?.GEOMETRY?.UD) || 15300) / 1000;
    const is_above = z_m >= z_NA;
    const z_face = is_above ? (z_deck - z_NA) : z_NA;
    // LR Pt 3 Ch 4 Sec 7.4.1 — same logic as _bucklingPlateResult.
    // Above NA → σ_D from SAGGING; below NA → σ_B from HOGGING.
    const M_for_face = is_above ? M_sag : M_hog;
    const sigma_face_calc = Math.abs(M_for_face * z_face / I_NA) * 1e-3;
    const kL = p.kL || 0.72;
    const sigma_A = window.Buckling.sigmaADesign(sigma_face_calc, Math.abs(dz_m_long), z_face, kL);

    // Auto corrosion based on surrounding compartments
    const Y_mm = group === 'innerSide' || group === 'sideShell' ? null : stiff.y;
    const corrosion = _corrosionForPlate(pk || 'innerSide', z_m, Y_mm);

    return {
      ...window.Buckling.checkLong({
        d_w, t_w, b_f, t_f,
        s_mm, t_p_mm, S_m,
        prof: prof_type,
        sigma_A,
        corrosion,
        corrosion_plate: corrosion,
        material: p.material || 'AH36',
      }),
      profile_name: profResolved.name,
      corrosion_cat: corrosion,
      S_m_used: S_m,
    };
  }

  // ─── Helper: append buckling section to an inspection result.
  // kind: 'plate' | 'long'
  // ─── Helper: append a spacing breakdown to the inspector for stiffeners
  // (and plates), so the user can manually verify the s value used in the
  // Z / t formulas. Shows neighbour gaps and the resulting spacing.
  function _attachSpacingBreakdown(out, group, idx) {
    if (!group || idx == null || !window.Draw?.profiles?.[group]) return out;
    const arr = window.Draw.profiles[group];
    const target = arr[idx];
    if (!target) return out;
    // Determine coord
    const grp = (typeof EDITOR_GROUPS !== 'undefined')
                ? EDITOR_GROUPS.find(g => g.key === group) : null;
    const coord = grp ? grp.coord : 'y';
    const targetC = +target[coord];
    if (!isFinite(targetC)) return out;
    // Build fence: own profiles + supports (deck levels for side groups,
    // side girders + duct for bottom/IB)
    const fence = new Set();
    arr.forEach(p => { if (isFinite(+p[coord])) fence.add(+p[coord]); });
    const G = window.Draw.GEOMETRY || {};
    const supports = (typeof getPlateSupports === 'function')
                     ? getPlateSupports(group === 'sideShell' ? 'sideShell'
                       : group === 'innerSide' ? 'innerSide'
                       : group === 'innerBottom' ? 'innerBottom'
                       : group === 'bottomShell' ? 'bottomShell' : group)
                     : [];
    if (Array.isArray(supports)) supports.forEach(s => { if (isFinite(s)) fence.add(s); });
    // Add deck levels manually for vertical groups too (the fallback path)
    if (group === 'sideShell' || group === 'innerSide') {
      if (G.IB != null) fence.add(G.IB);
      if (G.UD != null) fence.add(G.UD);
      if (G.TT != null) fence.add(G.TT);
      // stringer/tween deck profile arrays
      const strs = (window.Draw.profiles.stringer) || [];
      const tws  = (window.Draw.profiles.tweenDeck) || [];
      strs.forEach(d => { if (isFinite(+d.z)) fence.add(+d.z); });
      tws.forEach(d => { if (isFinite(+d.z)) fence.add(+d.z); });
    }
    const sorted = Array.from(fence).sort((a, b) => a - b);
    const ix = sorted.findIndex(c => Math.abs(c - targetC) < 0.5);
    if (ix < 0) return out;
    const below = ix > 0 ? targetC - sorted[ix - 1] : null;
    const above = ix < sorted.length - 1 ? sorted[ix + 1] - targetC : null;
    let mean;
    if (below != null && above != null) mean = (below + above) / 2;
    else if (below != null) mean = below;
    else if (above != null) mean = above;
    else mean = null;
    // Identify what each neighbour IS (another long, IB, UD, deck, side girder)
    const labelFor = (c) => {
      if (G.IB != null && Math.abs(c - G.IB) < 0.5) return 'IB';
      if (G.UD != null && Math.abs(c - G.UD) < 0.5) return 'UD';
      if (G.TT != null && Math.abs(c - G.TT) < 0.5) return 'TT';
      // Stringer / tween deck Z's
      const strs = (window.Draw.profiles.stringer) || [];
      if (strs.find(d => Math.abs(+d.z - c) < 0.5)) return 'stringer deck';
      const tws = (window.Draw.profiles.tweenDeck) || [];
      if (tws.find(d => Math.abs(+d.z - c) < 0.5)) return 'tween deck';
      // SIDE_GIRDERS
      const SG = window.Draw.SIDE_GIRDERS || [];
      if (SG.find(s => Math.abs(+s.y - c) < 0.5)) return 'side girder';
      // duct
      if (G.duct_half != null && Math.abs(c - G.duct_half) < 0.5) return 'duct wall';
      // Otherwise it's another long — find its ordinal
      const ordIdx = arr.findIndex(p => Math.abs(+p[coord] - c) < 0.5);
      if (ordIdx >= 0 && typeof resolveStiffOrdinal === 'function') {
        const ord = resolveStiffOrdinal(group, ordIdx);
        return `long #${ord}`;
      }
      return `long`;
    };

    // Append section
    out.steps = out.steps || [];
    out.steps.push('');
    out.steps.push('── Spacing Breakdown (manual check) ──');
    if (below != null) {
      out.steps.push(`Below: ${below.toFixed(0)} mm  → ${labelFor(sorted[ix-1])} at ${(sorted[ix-1]/1000).toFixed(2)} m`);
    } else {
      out.steps.push(`Below: — (no neighbour)`);
    }
    if (above != null) {
      out.steps.push(`Above: ${above.toFixed(0)} mm  → ${labelFor(sorted[ix+1])} at ${(sorted[ix+1]/1000).toFixed(2)} m`);
    } else {
      out.steps.push(`Above: — (no neighbour)`);
    }
    if (mean != null) {
      out.steps.push(`s_mean = (below + above) / 2 = ${mean.toFixed(0)} mm  ← used for Z formula`);
    }
    // Also push to inputs as a one-line summary
    out.inputs = out.inputs || [];
    if (mean != null) {
      const summary = below != null && above != null
        ? `${below.toFixed(0)} | ${above.toFixed(0)}  →  mean ${mean.toFixed(0)} mm`
        : `${mean.toFixed(0)} mm (edge)`;
      out.inputs.push({
        label: 'Spacing breakdown',
        value: summary
      });
    }
    return out;
  }

  function _attachBuckling(out, kind, opts) {
    if (!window.Buckling) return out;
    let r;
    if (kind === 'plate') {
      r = _bucklingPlateResult(opts.plateKey, opts.t_mm, opts.s_mm, opts.z_m, opts.Y_mm);
    } else {
      r = _bucklingLongResult(opts.group, opts.index, opts.z_m);
    }
    if (!r) return out;
    out.steps = out.steps || [];
    out.steps.push('');
    out.steps.push(`── Buckling Check (LR Pt 3 Ch 4 Sec 7) ──`);
    out.steps.push(`Corrosion category: ${r.corrosion_cat}  ·  Web frame spacing S = ${r.S_m_used} m`);
    if (kind === 'plate') {
      out.steps.push(`dt = ${r.dt_mm.toFixed(2)} mm  ·  t_net = ${r.tp_mm.toFixed(2)} mm`);
      out.steps.push(`σ_A (design) = ${r.sigma_A.toFixed(1)}   τ_A (design) = ${r.tau_A.toFixed(1)}  N/mm²`);
      out.steps.push(`σ_E = ${r.sigma_E_comp.toFixed(1)}  →  σ_CRB = ${r.sigma_CRB.toFixed(1)}  N/mm²`);
      out.steps.push(`τ_E = ${r.tau_E.toFixed(1)}  →  τ_CRB = ${r.tau_CRB.toFixed(1)}  N/mm²`);
      out.steps.push(`Compression UC = ${r.UC_comp.toFixed(3)}  ${r.pass_comp ? '✓ OK' : '✗ FAIL'}`);
      out.steps.push(`Shear       UC = ${r.UC_shear.toFixed(3)}  ${r.pass_shear ? '✓ OK' : '✗ FAIL'}`);
      // One-line summary into inputs
      out.inputs = out.inputs || [];
      out.inputs.push({
        label: 'Buckling (LR Sec 7)',
        value: `UC_c=${r.UC_comp.toFixed(2)} UC_s=${r.UC_shear.toFixed(2)} ${r.pass_all ? '✓' : '✗ FAIL'} · ${r.corrosion_cat}`
      });
    } else {
      out.steps.push(`Profile: ${r.profile_name}  (t_w=${r.tw_mm.toFixed(1)} t_f=${r.tf_mm.toFixed(1)})`);
      out.steps.push(`A_t = ${r.A_t_cm2.toFixed(1)} cm²  ·  I_a = ${r.I_a_cm4.toFixed(0)} cm⁴`);
      out.steps.push(`σ_A = ${r.sigma_A.toFixed(1)} N/mm²  ·  β = ${r.beta}`);
      out.steps.push(`σ_E_column    = ${r.sigma_E_col.toFixed(1)} → σ_CRB = ${r.sigma_CRB_col.toFixed(1)}`);
      if (r.sigma_E_tor > 0) out.steps.push(`σ_E_torsional = ${r.sigma_E_tor.toFixed(1)} → σ_CRB = ${r.sigma_CRB_tor.toFixed(1)}`);
      if (r.sigma_E_web > 0) out.steps.push(`σ_E_web       = ${r.sigma_E_web.toFixed(1)} → σ_CRB = ${r.sigma_CRB_web.toFixed(1)}`);
      out.steps.push(`Governing: ${r.governing_mode}  ·  σ_CRB = ${r.sigma_CRB_gov.toFixed(1)} N/mm²`);
      out.steps.push(`UC = β·σ_A/σ_CRB = ${r.UC.toFixed(3)}  ${r.pass_buckling ? '✓ OK' : '✗ FAIL'}`);
      if (r.flange_ratio != null) {
        out.steps.push(`Flange proportion: b_f/t_f = ${r.flange_ratio.toFixed(1)} ≤ ${r.flange_limit}  ${r.flange_ok ? '✓ OK' : '✗ FAIL'}`);
      }
      // One-line summary
      out.inputs = out.inputs || [];
      out.inputs.push({
        label: 'Buckling (LR Sec 7)',
        value: `UC=${r.UC.toFixed(2)} [${r.governing_mode}] ${r.pass_all ? '✓' : '✗ FAIL'} · ${r.corrosion_cat}`
      });
    }
    return out;
  }


  // Helper: compute z-coordinate (m above BL) for a given element type
  function _elemZm(eType, eOpts) {
    const p = getParams();
    const G = (window.Draw && window.Draw.GEOMETRY) || {};
    eOpts = eOpts || {};
    switch (eType) {
      // Bottom / keel — at BL
      case 'plate-bottom': case 'plate-keel':
      case 'long-bottom':
        return 0;
      // IB level
      case 'plate-ib': case 'long-ib':
        return p.ibLevel / 1000;
      // Upper deck
      case 'plate-ud': case 'long-ud':
        return p.udLevel / 1000;
      // Stringer deck
      case 'plate-str': case 'long-str': {
        const z = parseFloat(document.getElementById('strDeckZ')?.value || 8590);
        return z / 1000;
      }
      // Tween deck
      case 'plate-twn': case 'long-twn': {
        const z = parseFloat(document.getElementById('twnDeckZ')?.value || 12900);
        return z / 1000;
      }
      // Hatch coaming — at HC level
      case 'plate-coaming': case 'long-coaming':
        return p.hcLevel / 1000;
      // IS plate strake — use midpoint from strakeIdx
      case 'plate-is': {
        const idx = eOpts.strakeIdx;
        if (idx != null && window.Draw?.STRAKES?.innerSide) {
          const strakes = window.Draw.STRAKES.innerSide;
          let z_mm = G.IB || 1800;
          for (let i = 0; i <= idx && i < strakes.length; i++) {
            if (i < idx) z_mm += strakes[i].width;
            else z_mm += strakes[i].width / 2;
          }
          return z_mm / 1000;
        }
        return eOpts.z_m || ((G.IB + G.UD) / 2000);
      }
      // Side shell strake — use midpoint from strakeIdx
      case 'plate-side': {
        const idx = eOpts.strakeIdx;
        if (idx != null && window.Draw?.STRAKES?.shell) {
          // Shell strakes: keel → bottom → bilge → side. Approx midpoint.
          return eOpts.z_m || 5;
        }
        return eOpts.z_m || 5;
      }
      // IS long / side long — opts.z_m given
      case 'long-is': case 'long-side':
        return eOpts.z_m || 5;
      // DB-internal vertical plates — centroid at IB/2 (v80: enable HG/buckling)
      case 'plate-duct': case 'plate-sidegirder':
        return (p.ibLevel / 2) / 1000;
      // Double bottom internals — at or near BL, skip HG
      case 'db-floor-wt': case 'db-floor-nwt':
      case 'db-cg': case 'db-bracket': case 'db-duct':
        return null;  // skip
      // Hull girder itself — already shows stress in full report
      case 'hull-girder': case 'hull-girder-Z': case 'hull-girder-I':
        return null;
      default:
        return null;
    }
  }
  switch (elemType) {
    case 'hull-girder-Z':
    case 'hull-girder-I':
    case 'hull-girder': {
      const p = getParams();
      const res = runLongStrengthAnalysis();
      if (!res) {
        return {
          title: 'Hull Girder Longitudinal Strength',
          subtitle: 'LR Pt 3 Ch 4',
          status: 'INFO',
          notes: 'Section properties not available yet. Visit the Geometry page first.'
        };
      }
      const which = elemType === 'hull-girder-Z' ? 'Z' : (elemType === 'hull-girder-I' ? 'I' : 'all');
      const sec = res.section;
      const comp = res.compliance;
      
      // Pick which compliance row is the focus
      let focusPass, focusReq, focusAct, focusRatio, focusLabel;
      if (which === 'Z') {
        const worst = comp.Z_B.ratio < comp.Z_D.ratio ? comp.Z_B : comp.Z_D;
        focusPass = worst.pass;
        focusReq = `${res.Z_min.toFixed(4)} m³`;
        focusAct = `Z_B=${sec.Z_B.toFixed(3)}, Z_D=${sec.Z_D.toFixed(3)} m³`;
        focusRatio = `min(${comp.Z_B.ratio.toFixed(3)}, ${comp.Z_D.ratio.toFixed(3)})`;
        focusLabel = 'Z_min';
      } else if (which === 'I' && comp.I) {
        focusPass = comp.I.pass;
        focusReq = `${res.I_min.toFixed(3)} m⁴`;
        focusAct = `${sec.I_NA.toFixed(3)} m⁴`;
        focusRatio = comp.I.ratio.toFixed(3);
        focusLabel = 'I_min';
      } else {
        // Overall
        const allPass = comp.Z_B.pass && comp.Z_D.pass && (!comp.I || comp.I.pass);
        focusPass = allPass;
      }
      
      return {
        title: which === 'Z' ? 'Hull Girder Section Modulus' 
             : which === 'I' ? 'Hull Girder Moment of Inertia' 
             : 'Hull Girder Longitudinal Strength',
        subtitle: 'LR Pt 3 Ch 4 — Sec 5.4.1 / 5.8.1',
        rule: 'LR Pt 3 Ch 4 — Longitudinal Strength',
        required: (focusReq != null) ? focusReq : undefined,
        provided: (focusAct != null) ? focusAct : undefined,
        status: focusPass == null ? 'INFO' : (focusPass ? 'OK' : 'FAIL'),
        statusNote: focusRatio ? `Ratio: ${focusRatio}` : '',
        pressure: null,
        formula: 'Mwo = 0.1·C₁·C₂·L²·B·(Cb+0.7)  <i>(Sec 5.2.1)</i><br>'
               + 'Z_min = f₁·kL·C₁·L²·B·(Cb+0.7)·10⁻⁶ m³  <i>(Sec 5.4.1)</i><br>'
               + 'I_min = 3·C₁·L³·B·(Cb+0.7)·10⁻⁸ m⁴  <i>(Sec 5.8.1)</i><br>'
               + 'F_D = σ_D / σ_perm,  F_B = σ_B / σ_perm  <i>(Sec 5.7)</i>',
        inputs: [
          { label:'L (m)', value: p.L.toFixed(2) },
          { label:'B (m)', value: p.B.toFixed(2) },
          { label:'D (m)', value: p.D.toFixed(2) },
          { label:'T (m)', value: p.T.toFixed(2) },
          { label:'C_b', value: p.Cb.toFixed(2) + (p.Cb < 0.6 ? ' → 0.60 (rule floor)' : '') },
          { label:'k_L', value: p.kL },
          { label:'C₁ (Table 4.5.1)', value: res.C1.toFixed(4) },
          { label:'M_s hog (kN·m)', value: (p.Ms_hog || 0).toLocaleString() },
          { label:'M_s sag (kN·m)', value: (p.Ms_sag || 0).toLocaleString() }
        ],
        steps: [
          `── Wave Bending Moment (5.2.1) ──`,
          `Mwo = 0.1 · ${res.C1.toFixed(3)} · ${p.L.toFixed(2)}² · ${p.B.toFixed(2)} · ${(res.Cb_rule + 0.7).toFixed(3)} = ${res.Mwo.toFixed(0)} kN·m`,
          `Mw_sag = ${res.svScale} × ${res.f2_sag} × ${res.Mwo.toFixed(0)} = ${res.Mw_sag.toFixed(0)} kN·m`,
          `Mw_hog = ${res.svScale} × ${res.f2_hog.toFixed(3)} × ${res.Mwo.toFixed(0)} = ${res.Mw_hog.toFixed(0)} kN·m`,
          ``,
          `── Minimum Requirements ──`,
          `Z_min = ${res.Z_min.toFixed(4)} m³  (${(res.Z_min * 1e6).toLocaleString()} cm³)`,
          `I_min = ${res.I_min != null ? res.I_min.toFixed(3) + ' m⁴' : '— (L<90)'}`,
          ``,
          `── Actual Section (tool-computed) ──`,
          `Z_B  = ${sec.Z_B.toFixed(3)} m³   Z_D = ${sec.Z_D.toFixed(3)} m³`,
          `I_NA = ${sec.I_NA.toFixed(3)} m⁴   z_NA = ${sec.z_NA.toFixed(2)} m`,
          ``,
          `── Total Bending Moments (Sec 5.7.1) ──`,
          `M_hog_total = Ms_hog + Mw_hog = ${(p.Ms_hog||0).toLocaleString()} + ${res.Mw_hog.toFixed(0)} = ${(res.M_total_hog||0).toFixed(0)} kN·m`,
          `M_sag_total = Ms_sag + Mw_sag = ${(p.Ms_sag||0).toLocaleString()} + ${res.Mw_sag.toFixed(0)} = ${(res.M_total_sag||0).toFixed(0)} kN·m`,
          ``,
          `── Stresses ──`,
          `σ_perm = 175/k_L = ${res.sigma_amid.toFixed(1)} N/mm²`,
          `σ_D (deck) = ${res.sigma_D.toFixed(1)} N/mm²`,
          `σ_B (keel) = ${res.sigma_B.toFixed(1)} N/mm²`,
          ``,
          `── Reduction Factors (Sec 5.7) ──`,
          `F_D_raw = σ_D/σ_perm = ${res.F_D_raw.toFixed(3)}  → plating: ${res.F_D_plating.toFixed(3)}, long: ${res.F_D_long.toFixed(3)}`,
          `F_B_raw = σ_B/σ_perm = ${res.F_B_raw.toFixed(3)}  → plating: ${res.F_B_plating.toFixed(3)}, long: ${res.F_B_long.toFixed(3)}`,
          ``,
          `── Compliance ──`,
          `Z_B: actual ${sec.Z_B.toFixed(3)} / required ${res.Z_min.toFixed(3)} m³ = ${comp.Z_B.ratio.toFixed(3)} ${comp.Z_B.pass ? '✓' : '✗'}`,
          `Z_D: actual ${sec.Z_D.toFixed(3)} / required ${res.Z_min.toFixed(3)} m³ = ${comp.Z_D.ratio.toFixed(3)} ${comp.Z_D.pass ? '✓' : '✗'}`,
          comp.I ? `I:   actual ${sec.I_NA.toFixed(3)} / required ${res.I_min.toFixed(3)} m⁴ = ${comp.I.ratio.toFixed(3)} ${comp.I.pass ? '✓' : '✗'}` : '',
          ``,
          `── Wave Shear (6.3.1) ──`,
          `Qwo = 0.3·C₁·L·B·(Cb+0.7) = ${res.Qwo.toFixed(0)} kN`,
        ].filter(Boolean),
        notes: p.Ms_design === 0 
          ? 'Wave-only analysis (M_s = 0). Enter actual still-water bending moment in Setup for a more representative check. Click "Compute F from LR Ch 4" button to apply computed F_D, F_B to all subsequent scantling checks.'
          : `Analysis with M_s_hog = ${(p.Ms_hog || 0).toLocaleString()} kN·m, M_s_sag = ${(p.Ms_sag || 0).toLocaleString()} kN·m. M_hog_total = ${Math.abs(res.M_total_hog || 0).toLocaleString()} kN·m, M_sag_total = ${Math.abs(res.M_total_sag || 0).toLocaleString()} kN·m.`
      };
    }
    
    case 'plate-bottom': {
      // Always read CURRENT thickness from STRAKES (not cached opts)
      // so that edits via inspector / auto-optimize are reflected immediately.
      let t;
      if (opts.strakeIdx != null && window.Draw?.STRAKES?.shell?.[opts.strakeIdx]) {
        t = window.Draw.STRAKES.shell[opts.strakeIdx].thickness;
      } else if (opts.strakeThickness != null) {
        t = opts.strakeThickness;
      } else {
        t = num('bottomT');
      }
      const p_raw = getParams();
      // v33: shadow `p` with a strake-aware k (per-strake material pin)
      const p = { ...p_raw, k: _resolveK('shell', opts.strakeIdx, null, p_raw.k) };
      const Cw = calcCw(p.L);
      const hT2 = Math.min(p.T + 0.5*Cw, 1.2*p.T);
      // Strake-LOCAL long spacing: only profiles/supports within this
      // strake's range + one immediate neighbour on each side. This matches
      // LR shell-plating sizing (Table 1.5.2) which is a per-strake check.
      // Bilge strake returns transFrameSpacing via strakeLongSpacing.
      let s_strake;
      if (opts.strakeIdx != null && typeof window.strakeLongSpacing === 'function') {
        s_strake = window.strakeLongSpacing('shell', opts.strakeIdx).value;
      } else if (typeof realLongSpacing === 'function') {
        // Fallback: whole-group max gap (used when idx is unknown)
        s_strake = realLongSpacing('bottomShell', { inputId: 'bottomLongSpacing', coord: 'y', extraSupports: window.getPlateSupports?.('bottomShell') || [] });
      } else {
        s_strake = (opts.strakeSpacing != null ? opts.strakeSpacing : num('bottomLongSpacing'));
      }
      const L1 = Math.min(p.L, 190);
      const s1 = s1Limit(s_strake, p.L);
      const t_a = 0.001 * s1 * (0.043*L1 + 10) * Math.sqrt(p.FB/p.kL);
      const t_b = 0.0052 * s1 * Math.sqrt(hT2*p.k/(1.8-p.FB));
      const t_net = Math.max(t_a, t_b);
      const gov = t_a >= t_b ? 'a (hull girder)' : 'b (local)';
      // Combined status — local + HG + buckling
      const z_m = 0.0;  // bottom plate is at baseline
      const combo = _platePassCombined(t, t_net, s_strake, z_m, 'LONGITUDINAL', 'shell');
      return {
        title: opts.strakeName ? `Bottom Strake — ${opts.strakeName}` : 'Bottom Shell Plate',
        subtitle: opts.strakeId ? `${opts.strakeId} · Pt 3 Ch 6 Shell thickness` : 'Pt 3 Ch 6 — Shell thickness',
        rule: 'LR Pt 3 Ch 6 — Table 1.5.2 / Sec 6 + HG (Sec 5.7) + buckling (Sec 7)',
        required: t_net.toFixed(2) + ' mm',
        provided: t.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: combo.note,
        statusCriteria: combo.criteria,
        pressure: {
          head_m: hT2,
          kPa: 10.05 * hT2,
          note: 'h_T2 = min(T + 0.5·Cw, 1.2·T) — wave design head at bottom'
        },
        formula: 't = max(t_a, t_b)<br>'
          + 't_a = 0.001·s₁·(0.043·L₁ + 10)·√(F_B/k_L)  <i>(hull girder)</i><br>'
          + 't_b = 0.0052·s₁·√(h_T2·k/(1.8−F_B))  <i>(local pressure)</i>',
        inputs: [
          opts.strakeId ? { label:'Strake', value: opts.strakeName || opts.strakeId } : null,
          { label:'L (m)', value: p.L.toFixed(2) },
          { label:'T (design draft, m)', value: p.T.toFixed(2) },
          { label:'C_w (wave coef.)', value: Cw.toFixed(3) },
          { label:'h_T2 (m)', value: hT2.toFixed(2) },
          { label:'k (material)', value: p.k.toFixed ? p.k.toFixed(2) : p.k },
          { label:'F_B (bottom factor)', value: p.FB.toFixed(2) },
          { label:'s_strake (mm)', value: s_strake.toFixed(0) + (opts.strakeId ? ' (strake-local)' : '') },
          { label:'s₁ (effective)', value: s1.toFixed(0) },
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: [
          `t_a = ${t_a.toFixed(2)} mm  (hull girder)`,
          `t_b = ${t_b.toFixed(2)} mm  (local pressure)`,
          `Governing: ${gov}`,
          `t_req = ${t_net.toFixed(2)} mm`,
          `t_as-built = ${t.toFixed(1)} mm`
        ],
        notes: opts.strakeId 
          ? `This strake's local spacing is ${s_strake} mm (determined by nearest obstacles). Click another strake to compare.`
          : 's₁ is effective spacing per Sec 6 (lower bound applied if s < 470 + L/0.6 mm).'
      };
    }
    
    case 'plate-keel': {
      // Keel plate — LR Pt 4 Ch 1 Sec 5 / Table 1.5.1
      // Required keel plate thickness = t_bottom (rule-required) + 2 mm
      // Read current actual thicknesses from STRAKES, not form inputs, so
      // values stay consistent after auto-optimize or manual strake edit.

      // Actual keel thickness — STRAKES.shell[0] if available, else form input
      let tk = num('keelT');
      if (window.Draw?.STRAKES?.shell?.[0]?.thickness != null) {
        tk = window.Draw.STRAKES.shell[0].thickness;
      }

      // Actual bottom thickness — first strake with kind='bottom'
      let tb_actual = num('bottomT');
      if (window.Draw?.STRAKES?.shell) {
        const botStrake = window.Draw.STRAKES.shell.find(s => s.kind === 'bottom');
        if (botStrake?.thickness != null) tb_actual = botStrake.thickness;
      }

      // Bottom RULE-REQUIRED thickness (Table 1.5.2) — this is what keel +2 refers to,
      // NOT the as-built bottom. Otherwise keel_req keeps chasing the as-built value.
      let tb_req = null;
      try {
        const bp = window.calcBottomPlate?.();
        if (bp && bp.t_net != null) tb_req = bp.t_net;
      } catch (e) {}
      // Fallback: compute inline
      if (tb_req == null) {
        const p = getParams();
        const Cw_v = calcCw(p.L);
        const hT2_v = Math.min(p.T + 0.5*Cw_v, 1.2*p.T);
        const L1_v = Math.min(p.L, 190);
        const s_strake = num('bottomLongSpacing') || 700;
        const s1_v = s1Limit(s_strake, p.L);
        const t_a_v = 0.001 * s1_v * (0.043*L1_v + 10) * Math.sqrt(p.FB/p.kL);
        const t_b_v = 0.0052 * s1_v * Math.sqrt(hT2_v*p.k/(1.8-p.FB));
        tb_req = Math.max(t_a_v, t_b_v);
      }

      // Keel required = bottom RULE-REQUIRED + 2 mm
      const req = tb_req + 2;
      // Combined status — local + HG + buckling (keel is at z=0, baseline)
      const s_keel = num('bottomLongSpacing') || 700;
      const combo = _platePassCombined(tk, req, s_keel, 0.0, 'LONGITUDINAL', 'shell');

      return {
        title: 'Keel Plate',
        subtitle: 'LR Pt 4 Ch 1 Table 1.5.1 — Keel plate',
        rule: 'LR Pt 4 Ch 1 — Table 1.5.1 + HG (Sec 5.7) + buckling (Sec 7)',
        required: req.toFixed(2) + ' mm',
        provided: tk.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: combo.note,
        statusCriteria: combo.criteria,
        formula: 't_keel ≥ t_bottom_req + 2 mm  <i>(Table 1.5.1)</i><br>'
               + 'where t_bottom_req is the rule-required bottom shell thickness<br>'
               + '<i>(NOT the as-built bottom — otherwise keel follows thickening)</i>',
        inputs: [
          { label:'t_bottom (rule-required)', value: tb_req.toFixed(2) + ' mm' },
          { label:'t_bottom (as-built)',      value: tb_actual.toFixed(1) + ' mm' },
          { label:'Rule increment',           value: '+2.0 mm' },
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: [
          `t_bottom_req (Table 1.5.2) = ${tb_req.toFixed(2)} mm`,
          `t_keel_req = ${tb_req.toFixed(2)} + 2.0 = ${req.toFixed(2)} mm`,
          `t_keel (as-built)   = ${tk.toFixed(1)} mm`,
          `t_bottom (as-built) = ${tb_actual.toFixed(1)} mm  (not used for rule — shown for reference)`
        ],
        notes: 'Keel plate rule is based on the BOTTOM RULE-REQUIRED thickness, not the as-built bottom plate. This prevents unnecessary keel thickening when bottom is conservative.'
      };
    }

    case 'plate-side': {
      // SIDE SHELL — LR Pt 4 Ch 1 Table 1.5.3 (distinct from Table 1.5.2 bottom).
      // Side shell uses F_D in region (a) above D/2, and different coefficients.
      let t;
      if (opts.strakeIdx != null && window.Draw?.STRAKES?.shell?.[opts.strakeIdx]) {
        t = window.Draw.STRAKES.shell[opts.strakeIdx].thickness;
      } else if (opts.strakeThickness != null) {
        t = opts.strakeThickness;
      } else {
        t = num('bottomT');
      }
      const p_raw = getParams();
      // v33: shadow `p` with a strake-aware k so every formula in this case
      // (t_ii, t_ii_a, t_ii_b…) picks up the per-strake material override
      // without having to touch each formula site individually.
      const p = { ...p_raw, k: _resolveK('shell', opts.strakeIdx, null, p_raw.k) };
      const Cw = calcCw(p.L);
      const hT1 = Math.min(p.T + Cw, 1.36*p.T);
      const hT2 = Math.min(p.T + 0.5*Cw, 1.2*p.T);
      const D2 = Math.min(p.D, 1.6*p.T);
      const G2 = (window.Draw && window.Draw.GEOMETRY) || {};
      const R_B_mm = G2.R_B || 1800;
      const z_bilge_m = R_B_mm / 1000;
      const z_mid_D2 = D2 / 2;

      // Compute this strake's z_mid by summing preceding side-strake widths.
      // Side strakes start vertically from the top of the bilge arc (z = R_B),
      // NOT from IB level. (Earlier revisions incorrectly added G.IB here — that
      // mis-placed every side strake ~1.8 m higher than physical, inflating σ_hg
      // by ~20% and making the "Hull girder σ" check disagree with the
      // auto-injected _elemZm_inspect() result.)
      let z_side_cursor = R_B_mm;
      if (opts.strakeIdx != null && window.Draw?.STRAKES?.shell) {
        const arr = window.Draw.STRAKES.shell;
        for (let j = 0; j < opts.strakeIdx; j++) {
          if (arr[j]?.kind === 'side') z_side_cursor += arr[j].width;
        }
      }
      const strake_width = (opts.strakeWidth != null) ? opts.strakeWidth
        : (window.Draw?.STRAKES?.shell?.[opts.strakeIdx]?.width || 2480);
      const z_mid_mm = z_side_cursor + strake_width/2;
      const z_m = z_mid_mm / 1000;

      let s_strake;
      if (opts.strakeIdx != null && typeof window.strakeLongSpacing === 'function') {
        s_strake = window.strakeLongSpacing('shell', opts.strakeIdx).value;
      } else if (typeof realLongSpacing === 'function') {
        s_strake = realLongSpacing('sideShell', { inputId: 'sideLongSpacing', coord: 'z', extraSupports: window.getPlateSupports?.('sideShell') || [] });
      } else {
        s_strake = (opts.strakeSpacing != null ? opts.strakeSpacing : 705);
      }
      const L1 = Math.min(p.L, 190);
      const s1 = s1Limit(s_strake, p.L);

      // Region (a/b/c) determination
      let region, t_i, t_ii, formula_desc, region_name;
      if (z_m >= z_mid_D2) {
        region = 'a';
        region_name = 'above D/2';
        t_i  = 0.001 * s1 * (0.059*L1 + 7) * Math.sqrt(p.FD/p.kL);
        t_ii = 0.0042 * s1 * Math.sqrt(hT1*p.k);
        formula_desc = 't = max(t_i, t_ii)  <i>[region (a), above D/2]</i><br>'
          + 't_i = 0.001·s₁·(0.059·L₁ + 7)·√(F_D/k_L)  <i>(hull girder)</i><br>'
          + 't_ii = 0.0042·s₁·√(h_T1·k)  <i>(wave pressure)</i>';
      } else if (z_m <= z_bilge_m) {
        region = 'b';
        region_name = 'at upper turn of bilge';
        t_i  = 0.001 * s1 * (0.059*L1 + 7) * Math.sqrt(p.FB/p.kL);
        t_ii = 0.0054 * s1 * Math.sqrt(hT2*p.k/(2-p.FB));
        formula_desc = 't = max(t_i, t_ii)  <i>[region (b), bilge]</i><br>'
          + 't_i = 0.001·s₁·(0.059·L₁ + 7)·√(F_B/k_L)<br>'
          + 't_ii = 0.0054·s₁·√(h_T2·k/(2−F_B))';
      } else {
        region = 'c';
        region_name = 'between bilge and D/2 (interpolated)';
        t_i = 0.001 * s1 * (0.059*L1 + 7) * Math.sqrt(p.FB/p.kL);
        const t_ii_a = 0.0042 * s1 * Math.sqrt(hT1*p.k);
        const t_ii_b = 0.0054 * s1 * Math.sqrt(hT2*p.k/(2-p.FB));
        const frac = (z_m - z_bilge_m) / (z_mid_D2 - z_bilge_m);
        t_ii = t_ii_b + frac * (t_ii_a - t_ii_b);
        formula_desc = 't = max(t_i, t_ii)  <i>[region (c), interpolation]</i><br>'
          + 't_i  from (b)(i):  0.001·s₁·(0.059·L₁ + 7)·√(F_B/k_L)<br>'
          + 't_ii = linear interp between (a)(ii) @ z=D₂/2 and (b)(ii) @ z=bilge_top';
      }

      const t_net = Math.max(t_i, t_ii);
      const gov = t_i >= t_ii ? '(i) hull girder' : '(ii) local pressure';
      const combo = _platePassCombined(t, t_net, s_strake, z_m, 'LONGITUDINAL', 'shell');

      return {
        title: opts.strakeName ? `Side Strake — ${opts.strakeName}` : 'Side Shell Plate',
        subtitle: (opts.strakeId ? `${opts.strakeId} · ` : '') + `z = ${z_m.toFixed(2)} m · s = ${s_strake.toFixed(0)} mm · region (${region}) ${region_name}`,
        rule: 'LR Pt 4 Ch 1 — Table 1.5.3 (side shell) + HG (Sec 5.7) + buckling (Sec 7)',
        required: t_net.toFixed(2) + ' mm',
        provided: t.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: combo.note,
        statusCriteria: combo.criteria,
        pressure: {
          head_m: (region === 'a' ? hT1 : hT2),
          kPa: 10.05 * (region === 'a' ? hT1 : hT2),
          note: (region === 'a' ? 'h_T1 = min(T + Cw, 1.36·T)' : 'h_T2 = min(T + 0.5·Cw, 1.2·T)') + ' — wave design head'
        },
        formula: formula_desc,
        inputs: [
          opts.strakeId ? { label:'Strake', value: opts.strakeName || opts.strakeId } : null,
          { label:'z (strake mid, m)', value: z_m.toFixed(2) },
          { label:'Region', value: `(${region}) ${region_name}` },
          { label:'D₂ (m)', value: D2.toFixed(2) },
          { label:'L₁ (m)', value: L1.toFixed(1) },
          { label:'h_T1 (m)', value: hT1.toFixed(2) },
          { label:'h_T2 (m)', value: hT2.toFixed(2) },
          { label:'k (material)', value: p.k },
          { label:'F_D (deck factor)', value: p.FD.toFixed(2) },
          { label:'F_B (bottom factor)', value: p.FB.toFixed(2) },
          { label:'s_strake (mm)', value: s_strake.toFixed(0) },
          { label:'s₁ (effective)', value: s1.toFixed(0) },
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: [
          `z_mid = ${z_m.toFixed(3)} m  (from baseline)`,
          `D₂/2 = ${z_mid_D2.toFixed(3)} m, bilge top = ${z_bilge_m.toFixed(3)} m  →  region (${region})`,
          `t_i  = ${t_i.toFixed(2)} mm  (hull girder)`,
          `t_ii = ${t_ii.toFixed(2)} mm  (local pressure)`,
          `Governing: ${gov}`,
          `t_req = ${t_net.toFixed(2)} mm`,
          `t_as-built = ${t.toFixed(1)} mm`
        ],
        notes: 'Side shell follows Table 1.5.3, NOT Table 1.5.2. Region (a) uses F_D (≈1.0), making required thickness generally higher than bottom.'
      };
    }

    case 'plate-sidegirder': {
      // SIDE GIRDER — LR Pt 4 Ch 1 Sec 8.3.5
      //   One side girder required where B > 14 m
      //   Two side girders each side where B > 21 m
      //   t = (0.0075·d_DB + 1)·√k mm, minimum 6.0 mm
      //   d_DB for THICKNESS: per Sec 8.3.2 last sentence, formula (a) is
      //   permitted (without applying minimums b and c). Formula (a):
      //     d_DB(a) = 28·B + 205·√T
      const p = getParams();
      const G2 = (window.Draw && window.Draw.GEOMETRY) || {};
      const d_DB_actual = G2.IB || p.ibLevel || 1800;  // mm — actual IB
      const d_DB_a = 28.0 * p.B + 205.0 * Math.sqrt(p.T);
      const d_DB = d_DB_a;  // use formula (a) per Sec 8.3.2 last sentence
      const t_rule = (0.0075 * d_DB + 1) * Math.sqrt(p.k);
      const t_min = 6.0;
      const t_req = Math.max(t_rule, t_min);

      // Read actual thickness
      let t_as = 11;
      if (window.Draw?.PLATE_THICKNESS?.sideGirder) {
        t_as = window.Draw.PLATE_THICKNESS.sideGirder;
      } else {
        const el = document.getElementById('sgT');
        if (el) t_as = parseFloat(el.value) || 11;
      }
      const { status, statusNote } = _thickStatus(t_as, t_req);
      const sgIdx = opts.plateKey ? opts.plateKey.replace('sg','') : null;
      const sgY = sgIdx != null && window.Draw?.SIDE_GIRDERS ?
                  window.Draw.SIDE_GIRDERS[parseInt(sgIdx)]?.y : null;

      // 3-badge combined check (Local + Hull Girder + Buckling) — v83
      // Side girder buckling sub-panel calculation:
      //   • YATAY destek: vertical stiffener tool'da YOK → s_horiz = full web frame
      //     (eğer ileride vertical stiff eklenirse: s_horiz = web/N_vert)
      //   • DİKEY destek: longitudinal intercostal stiffeners (this girder)
      // Sub-panel kısa kenarı = min(dikey, yatay).
      // Stress direction: hull-girder bending along ship (x).
      // Boyuna intercostal stiffener'lar bu strese PARALEL → LONGITUDINAL stiffening.
      const _z_sg_m = (d_DB_actual / 2) / 1000;
      const _wf_mm = (p.le && p.le > 0) ? p.le * 1000 : 1452;
      const _s_horiz = _wf_mm;                          // full web frame (no vert stiff)
      // Count longitudinal intercostal stiffeners on this girder:
      const _sgKey = sgIdx != null ? ('sideGirder' + sgIdx) : null;
      const _sgLongs = (_sgKey && window.Draw?.profiles?.[_sgKey]) ? window.Draw.profiles[_sgKey] : [];
      const _N_long = _sgLongs.length;
      // Vertical sub-panel = girder height / (N_long + 1)
      const _s_vert = d_DB_actual / (_N_long + 1);
      const _s_panel_sg = Math.min(_s_vert, _s_horiz);
      const _combo_sg = _platePassCombined(t_as, t_req, _s_panel_sg, _z_sg_m, 'LONGITUDINAL', 'sideGirder', sgY);

      return {
        title: sgIdx != null ? `Side Girder #${parseInt(sgIdx)+1}` : 'Side Girder',
        subtitle: (sgY != null ? `y = ${sgY} mm from CL · ` : '') + 'LR Pt 4 Ch 1 Sec 8.3.5',
        rule: 'LR Pt 4 Ch 1 Sec 8.3.5 — Side girder plating (+ Pt 3 Ch 4 Sec 5.7 / Sec 7)',
        required: t_req.toFixed(2) + ' mm',
        provided: t_as.toFixed(1) + ' mm',
        status: _combo_sg.overallStatus,
        statusNote: _combo_sg.note,
        statusCriteria: _combo_sg.criteria,
        formula: 't = (0.0075·d_DB + 1)·√k mm,  minimum 6.0 mm<br>'
          + '<i>d_DB per Sec 8.3.2 last sentence = formula (a): 28·B + 205·√T</i>',
        inputs: [
          { label:'d_DB(a) = 28·B + 205·√T (mm)', value: d_DB.toFixed(0) },
          { label:'d_DB actual (IB level, mm)', value: d_DB_actual.toString() },
          { label:'k (material)', value: p.k },
          { label:'t_rule = (0.0075·d_DB + 1)·√k', value: t_rule.toFixed(2) + ' mm' },
          { label:'t_min (Sec 8.3.5)', value: t_min.toFixed(1) + ' mm' },
          { label:'Long. intercostal stiff (count)', value: _N_long.toString() + (_N_long > 0 ? ` × ${_sgLongs[0].profileName || 'FB'}` : '') },
          { label:'Sub-panel (vert × horiz, mm)', value: `${_s_vert.toFixed(0)} × ${_s_horiz.toFixed(0)}` },
          _combo_sg.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${_combo_sg.hg.sigma_hg.toFixed(1)} / ${_combo_sg.hg.sigma_perm.toFixed(0)} N/mm² (${_combo_sg.hg.ratio.toFixed(2)}) ${_combo_sg.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          _combo_sg.bk.UC != null ? { label:'Buckling UC', value:`${_combo_sg.bk.UC.toFixed(2)} ${_combo_sg.bk.status === 'OK' ? '✓' : '✗'}` } : null
        ].filter(Boolean),
        steps: [
          `Side girder required (B=${p.B.toFixed(1)} m ${p.B > 14 ? '> 14 m ✓' : '≤ 14 m — optional'})`,
          `d_DB(a) = 28·${p.B} + 205·√${p.T} = ${d_DB.toFixed(1)} mm  (used for thickness)`,
          `d_DB actual = ${d_DB_actual} mm  (as-built IB level)`,
          `t_rule = (0.0075·${d_DB.toFixed(0)} + 1)·√${p.k} = ${t_rule.toFixed(2)} mm`,
          `t_min  = ${t_min.toFixed(1)} mm`,
          `t_req  = max = ${t_req.toFixed(2)} mm`,
          `t_as-built = ${t_as.toFixed(1)} mm`,
          `Buckling: ${_N_long} long. intercostal stiff → vert s=${_s_vert.toFixed(0)} mm | horiz s=${_s_horiz.toFixed(0)} mm (full web — vert stiff yok) → s_panel=min=${_s_panel_sg.toFixed(0)} mm`
        ],
        notes: 'Side girders must extend as far fwd/aft as practicable. Vertical stiffener (≥100 mm depth, same t as girder) midway between floors. d_DB for thickness uses formula (a) per Sec 8.3.2 last sentence. Buckling: vertical plate centroid at IB/2.'
      };
    }

    case 'plate-duct': {
      // DUCT KEEL SIDE PLATE — LR Pt 4 Ch 1 Sec 8.3.8
      //   t = greater of:
      //     (a) (0.008·d_DB + 2)·√k mm
      //     (b) deep-tank formula (Tablo 1.9.1) if interconnected
      //   Min 6.0 mm (Sec 8.3.8) and 7.5 mm (Tablo 1.9.1, L≥90).
      const p = getParams();
      const G2 = (window.Draw && window.Draw.GEOMETRY) || {};
      const d_DB_actual = G2.IB || p.ibLevel || 1800;
      const d_DB = 28.0 * p.B + 205.0 * Math.sqrt(p.T);
      const sqk = Math.sqrt(p.k);

      const t_a = (0.008 * d_DB + 2) * sqk;

      const dkInterconnect = document.getElementById('dkInterconnect')?.value || 'yes';
      let t_b = 0, h4 = 0, f_dt = 0, s_dk = 0, S_dk = 0, rho_dk = 0;
      const dt_steps = [];
      if (dkInterconnect === 'yes') {
        s_dk = parseFloat(document.getElementById('dkStiffS')?.value || 700);
        S_dk = parseFloat(document.getElementById('dkPrimaryS')?.value || 2.5);
        rho_dk = parseFloat(document.getElementById('dkRho')?.value || 1.025);
        const z_top = p.ibLevel;
        const z_bot = 0;
        const H_panel = z_top - z_bot;
        const z_ref = z_bot + H_panel / 3;
        const z_TT = p.ttLevel;
        const z_OF = p.udLevel + 760;
        const h_a = (z_TT - z_ref) / 1000;
        const h_b = (z_OF - z_ref) / 2 / 1000;
        h4 = Math.max(h_a, h_b, 0.5);
        f_dt = Math.min(1.0, 1.1 - s_dk / (2500 * S_dk));
        if (f_dt < 0) f_dt = 0;
        t_b = 0.004 * s_dk * f_dt * Math.sqrt(rho_dk * h4 * p.k / 1.025) + 2.5;

        dt_steps.push(`(b) deep-tank check (interconnected = yes):`);
        dt_steps.push(`   z_ref = z_bot + H/3 = ${z_ref.toFixed(0)} mm = ${(z_ref/1000).toFixed(2)} m`);
        dt_steps.push(`   h_a = (z_TT − z_ref)/1000 = ${h_a.toFixed(2)} m`);
        dt_steps.push(`   h_b = (z_OF − z_ref)/2/1000 = ${h_b.toFixed(2)} m`);
        dt_steps.push(`   h₄  = max(h_a, h_b, 0.5) = ${h4.toFixed(2)} m`);
        dt_steps.push(`   f   = 1.1 − ${s_dk}/(2500·${S_dk}) = ${f_dt.toFixed(3)}`);
        dt_steps.push(`   t_b = 0.004·${s_dk}·${f_dt.toFixed(3)}·√(${rho_dk}·${h4.toFixed(2)}·${p.k}/1.025) + 2.5 = ${t_b.toFixed(2)} mm`);
      } else {
        dt_steps.push(`(b) deep-tank check skipped (interconnected = no)`);
      }

      const t_min_table191 = (p.L >= 90) ? 7.5 : 6.5;
      const t_min_sec = 6.0;
      const t_req = Math.max(t_a, t_b, t_min_sec, dkInterconnect === 'yes' ? t_min_table191 : 0);

      let gov_label;
      if (t_b > t_a && t_b >= t_min_table191 && t_b >= 6) gov_label = '(b) deep-tank';
      else if (t_a >= t_min_table191 && t_a >= 6) gov_label = '(a) (0.008·d_DB+2)·√k';
      else if (dkInterconnect === 'yes' && t_min_table191 >= 6) gov_label = `Tablo 1.9.1 min (${t_min_table191})`;
      else gov_label = '6.0 mm min';

      let t_as = 12;
      if (window.Draw?.PLATE_THICKNESS?.duct) {
        t_as = window.Draw.PLATE_THICKNESS.duct;
      } else {
        const el = document.getElementById('dkT');
        if (el) t_as = parseFloat(el.value) || 12;
      }

      // 3-badge combined check
      // Duct keel side plate: vertical, height = IB, length = web frame.
      // The "Duct stiff. spacing s" input (used for deep-tank f-factor) IS the
      // stiffener spacing on the duct side plate — use it as the buckling panel
      // short side. If smaller than min(IB, web×1000), buckling improves.
      // Stiffening direction: stiffeners are typically vertical → parallel to
      // hull-girder bending stress → LONGITUDINAL.
      const _z_dk_m = (d_DB_actual / 2) / 1000;
      const _wf_mm = (p.le && p.le > 0) ? p.le * 1000 : 1452;
      const _s_dk_form = parseFloat(document.getElementById('dkStiffS')?.value || _wf_mm);
      const _s_panel_dk = Math.min(d_DB_actual, _wf_mm, _s_dk_form);
      const _dk_Y = G2.duct_half || 900;
      const _combo_dk = _platePassCombined(t_as, t_req, _s_panel_dk, _z_dk_m, 'LONGITUDINAL', 'duct', _dk_Y);

      return {
        title: 'Duct Keel Side Plate',
        subtitle: `y = ${_dk_Y} mm from CL · LR Pt 4 Ch 1 Sec 8.3.8 (+ 9.2 / Sec 7)`,
        rule: 'LR Pt 4 Ch 1 Sec 8.3.8 — Duct keel side plating (+ Pt 3 Ch 4 Sec 5.7 / Sec 7)',
        required: t_req.toFixed(2) + ' mm',
        provided: t_as.toFixed(1) + ' mm',
        status: _combo_dk.overallStatus,
        statusNote: _combo_dk.note,
        statusCriteria: _combo_dk.criteria,
        formula: 't = greater of: (a) (0.008·d_DB + 2)·√k mm, or (b) deep-tank: 0.004·s·f·√(ρ·h₄·k/1.025) + 2.5<br>'
          + '<i>d_DB per Sec 8.3.2 last sentence. Min 6.0 mm (Sec 8.3.8) & 7.5 mm (Tablo 1.9.1 L≥90).</i>',
        inputs: [
          { label:'d_DB(a) = 28·B + 205·√T (mm)', value: d_DB.toFixed(0) },
          { label:'d_DB actual (IB level, mm)', value: d_DB_actual.toString() },
          { label:'k (material)', value: p.k },
          { label:'t_a = (0.008·d_DB + 2)·√k', value: t_a.toFixed(2) + ' mm' },
          { label:'Interconnected (8.3.8 b)', value: dkInterconnect === 'yes' ? 'yes — DT check applied' : 'no — skipped' },
          dkInterconnect === 'yes' ? { label:'s, S, ρ', value: `${s_dk} mm, ${S_dk} m, ${rho_dk}` } : null,
          dkInterconnect === 'yes' ? { label:'h₄ (m)', value: h4.toFixed(2) } : null,
          dkInterconnect === 'yes' ? { label:'f', value: f_dt.toFixed(3) } : null,
          dkInterconnect === 'yes' ? { label:'t_b (deep tank)', value: t_b.toFixed(2) + ' mm' } : null,
          { label:'t_min (Sec 8.3.8 / Tablo 1.9.1)', value: `${t_min_sec} / ${t_min_table191} mm` },
          { label:'Governing', value: gov_label },
          _combo_dk.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${_combo_dk.hg.sigma_hg.toFixed(1)} / ${_combo_dk.hg.sigma_perm.toFixed(0)} N/mm² (${_combo_dk.hg.ratio.toFixed(2)}) ${_combo_dk.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          _combo_dk.bk.UC != null ? { label:'Buckling UC', value:`${_combo_dk.bk.UC.toFixed(2)} ${_combo_dk.bk.status === 'OK' ? '✓' : '✗'}` } : null
        ].filter(Boolean),
        steps: [
          `d_DB(a) = 28·${p.B} + 205·√${p.T} = ${d_DB.toFixed(1)} mm`,
          `(a) t_a = (0.008·${d_DB.toFixed(0)} + 2)·√${p.k} = ${t_a.toFixed(2)} mm`,
          ...dt_steps,
          `Min Sec 8.3.8 = ${t_min_sec} mm`,
          `Min Tablo 1.9.1 (L=${p.L}≥90) = ${t_min_table191} mm`,
          `t_req = max(t_a, t_b, mins) = ${t_req.toFixed(2)} mm  →  ${gov_label}`,
          `t_as-built = ${t_as.toFixed(1)} mm`,
          `Buckling: z_mid=${_z_dk_m.toFixed(2)} m, s=${_s_panel_dk.toFixed(0)} mm`
        ],
        notes: 'Duct keel sides ≤ 2.0 m apart (Sec 8.3.9). When interconnected with side tank/cofferdam, deep-tank thickness (b) often governs. Inputs s/S/ρ/interconnect in DB Internals panel.'
      };
    }

    case 'plate-ib': {
      // Read CURRENT IB strake thickness (fresh from STRAKES) if available
      let t;
      if (opts.strakeIdx != null && window.Draw?.STRAKES?.innerBottom?.[opts.strakeIdx]) {
        t = window.Draw.STRAKES.innerBottom[opts.strakeIdx].thickness;
      } else if (opts.strakeThickness != null) {
        t = opts.strakeThickness;
      } else {
        t = num('ibT');
      }
      const p_raw = getParams();
      // v33: shadow `p.k` with strake-effective k
      const p = { ...p_raw, k: _resolveK('innerBottom', opts.strakeIdx, null, p_raw.k) };
      let s_strake;
      if (opts.strakeIdx != null && typeof window.strakeLongSpacing === 'function') {
        s_strake = window.strakeLongSpacing('innerBottom', opts.strakeIdx).value;
      } else if (typeof realLongSpacing === 'function') {
        s_strake = realLongSpacing('innerBottom', { inputId: 'ibLongSpacing', coord: 'y', extraSupports: window.getPlateSupports?.('innerBottom') || [] });
      } else {
        s_strake = (opts.strakeSpacing != null ? opts.strakeSpacing : num('ibLongSpacing'));
      }
      const t_base = 0.00136 * (s_strake + 660) * Math.pow(p.k * p.k * p.L * p.T, 0.25);
      const location = document.getElementById('ibLocation').value;
      const ceiling  = document.getElementById('ibCeiling').value;
      const grab     = document.getElementById('ibGrab').value;
      const t_min = (location === 'hatch' && ceiling === 'no') ? 7.5 : 6.5;
      let increment = 0, incRule = '', incDesc = '';
      if (location === 'hatch' && ceiling === 'no') { increment = 2; incRule='8.4.2'; incDesc='hatch+no-ceiling'; }
      if (grab === 'yes') { 
        if (ceiling === 'yes') { increment = Math.max(increment, 3); incRule='2.2.2'; incDesc='grab+ceiling'; }
        else { increment = Math.max(increment, 5); incRule='2.2.2 alt'; incDesc='grab+no-ceiling'; }
      }
      const t_req = Math.max(t_base, t_min) + increment;
      
      // === COMPARTMENT-DRIVEN PRESSURE ===
      // Pick a sample point slightly ABOVE the IB surface to find which
      // compartment sits on top of this plate (the loading compartment).
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const B_half = G.B_half || 11880;
      const ib_z = p.ibLevel + 100;  // just above IB plate
      // Determine strake mid Y; if no strake context, use B_half/2
      let sample_y = B_half / 2;
      if (opts.strakeIdx != null && window.Draw?.STRAKES?.innerBottom) {
        let cursor = 0;
        for (let i = 0; i < window.Draw.STRAKES.innerBottom.length; i++) {
          const w = window.Draw.STRAKES.innerBottom[i].width;
          if (i === opts.strakeIdx) { sample_y = cursor + w/2; break; }
          cursor += w;
        }
      }
      const compAbove = (window.getCompartmentAt ? window.getCompartmentAt(sample_y, ib_z) : null);
      
      let pressure = null;
      const loadInputs = [];
      let cargoLoad = 0, P_cargo_kPa = 0;
      let tankHead_m = 0, P_tank_kPa = 0, rho_tank = 1.025;
      
      if (compAbove) {
        if (compAbove.type === 'cargo') {
          cargoLoad = compAbove.cargoLoad || 0;
          P_cargo_kPa = cargoLoad * 9.81;
          if (cargoLoad > 0) {
            pressure = {
              head_m: cargoLoad / 1.025,  // seawater-equivalent head
              kPa: P_cargo_kPa,
              note: `${compAbove.name} · Cargo stowage ${cargoLoad} t/m² × g = ${P_cargo_kPa.toFixed(1)} kPa`
            };
            loadInputs.push({ label:'Compartment', value: `${compAbove.name} (cargo)` });
            loadInputs.push({ label:'Cargo Load', value: `${cargoLoad} t/m² = ${P_cargo_kPa.toFixed(1)} kPa` });
          }
        } else if (compAbove.type === 'ballast' || compAbove.type === 'fuel' || compAbove.type === 'freshwater') {
          rho_tank = compAbove.rho || 1.025;
          const bb = window._compartmentBoundingBox?.(compAbove);
          const tank_top_mm = bb?.zMax ?? (G.UD || 15300);
          const z_plate_mm = p.ibLevel;  // IB plate sits at ibLevel
          // For IB plate: z_ref = z_plate (1/3 height up from lower edge of
          // the IB plate panel reduces to plate level for a horizontal panel).
          const airpipe_m = _resolveAirpipeTop_m(compAbove, null);
          const pipe_mm = airpipe_m * 1000;
          // LR Tablo 1.9.1 (b) — design load head h₄
          const lr = _LR_h4(z_plate_mm, tank_top_mm, pipe_mm);
          const P_kPa = 10.05 * lr.h4 * rho_tank;
          // Hydrostatic test head per LR Pt 3 Ch 1 Tablo 1.9.1:
          //   greater of 2.4 m above tank top OR head up to overflow top.
          // INFO ONLY — scantling formulas use LR Tablo 1.9.1 h₄ above.
          const th = _LR_testHead_above_TT(compAbove, tank_top_mm, pipe_mm);
          const h_test_m = Math.max((tank_top_mm + th.h_test_m*1000 - z_plate_mm)/1000, 0.5);
          const P_test_kPa = 10.05 * h_test_m * rho_tank;
          pressure = {
            head_m: lr.h4,
            kPa: P_kPa,
            note: `${compAbove.name} (${compAbove.type}) · LR h₄=${lr.h4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  [Tablo 1.9.1 (b): max(z_TT−z_ref=${lr.h_a.toFixed(2)}, (z_OF−z_ref)/2=${lr.h_b.toFixed(2)}, 0.5)]`
          };
          loadInputs.push({ label:'Compartment', value: `${compAbove.name} (${compAbove.type})` });
          loadInputs.push({ label:'ρ (t/m³)', value: rho_tank.toFixed(3) });
          loadInputs.push({ label:'Airpipe top', value: `${pipe_mm.toFixed(0)} mm AB (${airpipe_m.toFixed(2)} m)` });
          loadInputs.push({ label:'Tank top', value: `${tank_top_mm} mm AB` });
          loadInputs.push({ label:'h₄ (LR design)', value: `${lr.h4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  (governs: ${lr.governs})` });
          loadInputs.push({ label:'Test head (info)', value: `+${th.h_test_m.toFixed(2)} m above TT (governs: ${th.source}) → ${h_test_m.toFixed(2)} m at plate → ${P_test_kPa.toFixed(1)} kPa` });
        } else {
          loadInputs.push({ label:'Compartment', value: `${compAbove.name} (${compAbove.type} — no load)` });
        }
      } else {
        loadInputs.push({ label:'Compartment', value: '— none defined above —' });
      }
      
      if (grab === 'yes') {
        loadInputs.push({ label:'Grab loading', value: `yes (+${ceiling === 'yes' ? 3 : 5} mm per Sec 2.2.2)` });
      }
      
      // Combined status — local + HG + buckling (sample_y now defined)
      const z_m = p.ibLevel / 1000;
      const combo = _platePassCombined(t, t_req, s_strake, z_m, 'LONGITUDINAL', 'innerBottom', sample_y);
      
      return {
        title: opts.strakeName ? `Inner Bottom Strake — ${opts.strakeName}` : 'Inner Bottom Plate',
        subtitle: opts.strakeId ? `${opts.strakeId} · Sec 8.4.1` : 'Sec 8.4.1 (+ 8.4.2 / 2.2.2 / 8.4.4)',
        rule: 'LR Pt 4 Ch 1 Sec 8.4 + HG (Pt 3 Ch 4 Sec 5.7) + buckling (Sec 7)',
        required: t_req.toFixed(2) + ' mm',
        provided: t.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: combo.note,
        statusCriteria: combo.criteria,
        pressure,
        formula: 't_base = 0.00136·(s + 660)·⁴√(k²·L·T)  <i>(Sec 8.4.1 — empirical)</i><br>'
          + 't_min = 7.5 mm (hatch, no ceiling) or 6.5 mm (hold)<br>'
          + 't_req = max(t_base, t_min) + Δ_increment',
        inputs: [
          opts.strakeId ? { label:'Strake', value: opts.strakeName || opts.strakeId } : null,
          ...loadInputs,
          { label:'Location', value: location },
          { label:'Ceiling', value: ceiling },
          { label:'s_strake (mm)', value: s_strake.toFixed(0) + (opts.strakeId ? ' (strake-local)' : '') },
          { label:'k · L · T', value: `${p.k} · ${p.L.toFixed(1)} · ${p.T.toFixed(1)}` },
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: [
          `t_base (Sec 8.4.1) = ${t_base.toFixed(2)} mm  [s = ${s_strake} mm]`,
          `t_min = ${t_min.toFixed(1)} mm`,
          `Increment (${incRule || '—'}) = +${increment.toFixed(1)} mm  — ${incDesc || 'none'}`,
          `t_req = max(${t_base.toFixed(1)}, ${t_min.toFixed(1)}) + ${increment.toFixed(1)} = ${t_req.toFixed(2)} mm`,
          `t_as-built = ${t.toFixed(1)} mm`
        ],
        notes: compAbove
          ? `Load source: compartment "${compAbove.name}" (${compAbove.type}). Delete this compartment to remove its load from this check.`
          : `No compartment defined above this plate — pressure shown is 0. Add a Cargo or Ballast compartment in the Geometry page editor to load this plate.`
      };
    }
    
    case 'plate-coaming': {
      const p = getParams();
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const PA = (window.Draw && window.Draw.PARAMS) || {};
      const isEdge = opts && opts.plateKey === 'coamingEdge';
      // Coaming wall is no longer part of the section — only the top plate
      // remains. `isTop` is just `!isEdge`.
      const isTop  = !isEdge;
      
      if (isEdge) {
        // Coaming Edge Flat Bar — vertical FB at top plate edge
        const edgeH = PA.coamingEdgeH || 150;
        const edgeT = PA.coamingEdgeT || 20;
        return {
          title: 'Coaming Edge Flat Bar',
          subtitle: 'Pt 3 Ch 11 — Top edge stiffening FB',
          rule: 'LR Pt 3 Ch 11 Sec 2',
          required: '(LR Ch 11 detail)',
          provided: `FB ${edgeH}×${edgeT} mm`,
          status: 'INFO',
          statusNote: `At top of coaming (Z=${G.HC} mm AB), vertical flat bar extending ${edgeH} mm downward.`,
          formula: 'Flat bar stiffening the free edge of the coaming top plate. Depth and thickness per LR Pt 3 Ch 11 Sec 2 (based on hatch length and coaming height).',
          inputs: [
            { label:'FB height (mm)', value: edgeH.toString() },
            { label:'FB thickness (mm)', value: edgeT.toString() },
            { label:'Z at top (mm AB)', value: (G.HC || p.hcLevel).toString() },
            { label:'Z at bottom (mm AB)', value: ((G.HC || p.hcLevel) - edgeH).toString() },
            { label:'Y position (mm)', value: ((G.IS + (PA.coamingTop || 300)) || '—').toString() }
          ],
          steps: [
            `Top edge position: Y = IS + coamingTop = ${G.IS} + ${PA.coamingTop || 300} = ${(G.IS || 0) + (PA.coamingTop || 300)} mm`,
            `FB extends from Z=${G.HC} down to Z=${(G.HC || 0) - edgeH} (${edgeH} mm)`,
            `As-built: FB ${edgeH}×${edgeT}`,
            `Purpose: stiffen the free edge of the coaming top plating against local buckling and distortion`
          ],
          notes: 'This flat bar works with the coaming top plate. σ_hg at HC level is shown below. Full LR Pt 3 Ch 11 check requires hatchway dimensions and cover design.'
        };
      }
      
      // Coaming top plate — horizontal at Z=HC, IS → IS+coamingTop.
      const STR = (window.Draw && window.Draw.STRAKES) || {};
      const groupKey = 'coamingTop';
      const strakeArr = Array.isArray(STR[groupKey]) ? STR[groupKey] : null;
      let t_as;
      let strakeIdxResolved = null;
      if (strakeArr && strakeArr.length > 0) {
        strakeIdxResolved = (opts && opts.strakeIdx != null && strakeArr[opts.strakeIdx])
          ? opts.strakeIdx : 0;
        t_as = strakeArr[strakeIdxResolved].thickness;
      } else {
        t_as = parseFloat(document.getElementById('coamingT')?.value || 10);
      }
      // Strake-effective k (per-strake material override)
      const p_local = { ...p, k: _resolveK(groupKey, strakeIdxResolved, null, p.k) };
      // Read s from drawing's coamingStiff geometry (max gap)
      const s = (typeof realLongSpacing === 'function')
        ? realLongSpacing('coamingStiff', {
            coord: 'y',
            inputId: 'coamingLongSpacing',
            defaultFallback: 700
          })
        : 700;
      const t_simple = 0.0025 * s * Math.sqrt(p_local.k);
      const t_min = 12;
      const t_req = Math.max(t_simple, t_min);
      const z_m = (G.HC || p.hcLevel) / 1000;
      const combo = _platePassCombined(t_as, t_req, s, z_m, 'LONGITUDINAL', 'coamingTop');
      const coamingWidth = (PA.coamingTop || 300);
      const titleStr = 'Hatch Coaming Top Plate';
      const subtitleStr = 'Pt 3 Ch 11 — horizontal top plate (at HC)';
      const widthLabel = 'Width (mm)';
      const zLabel = 'Z level (mm AB)';
      return {
        title: titleStr,
        subtitle: subtitleStr,
        rule: 'LR Pt 3 Ch 11 Sec 2 / 3 + HG + buckling',
        required: t_req.toFixed(1) + ' mm',
        provided: t_as.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: `${widthLabel.replace(' (mm)','')}: ${coamingWidth} mm · Z = ${(z_m*1000).toFixed(0)} mm AB · ${combo.note}`,
        statusCriteria: combo.criteria,
        formula: 't ≥ 0.0025·s·√k  (simplified — exact per LR Pt 3 Ch 11)<br>'
               + `Minimum: 12 mm for hatch coaming top plating`,
        inputs: [
          { label:'L (m)', value: p.L.toFixed(2) },
          { label:'k (material)', value: (p_local.k.toFixed ? p_local.k.toFixed(2) : p_local.k) },
          { label:'s (mm)', value: s.toFixed(0) },
          { label: widthLabel, value: coamingWidth.toString() },
          { label: zLabel, value: (z_m*1000).toFixed(0) },
          { label:'t_as (mm)', value: t_as.toFixed(1) },
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: [
          `t_simple = 0.0025 × ${s.toFixed(0)} × √${(p_local.k.toFixed ? p_local.k.toFixed(2) : p_local.k)} = ${t_simple.toFixed(2)} mm`,
          `t_min (hatch coaming) = ${t_min} mm`,
          `t_req = max(t_simple, t_min) = ${t_req.toFixed(1)} mm`,
          `t_as-built = ${t_as.toFixed(1)} mm`,
          `Position: horizontal top plate at HC level (Z=${G.HC || p.hcLevel} mm AB)`
        ],
        notes: 'Hatch coaming top per LR Pt 3 Ch 11. Simplified check — full analysis requires hatchway opening geometry, cover type, and closing arrangements.'
      };
    }
    
    case 'long-coaming': {
      const p = getParams();
      // Resolve this stiff's mean tributary spacing (per-stiff inspector).
      const _D = window.Draw;
      const _arr = _D?.profiles?.coamingStiff;
      const _stiff = (_arr && opts && opts.index != null) ? _arr[opts.index] : null;
      let _sMean = null;
      if (_stiff) {
        try { _zReqForStiff('coamingStiff', _stiff); _sMean = _stiff._s_mean_mm; } catch(_) {}
      }
      const cs = (_sMean && _sMean > 0 && typeof withLocalSpacing === 'function')
        ? withLocalSpacing(_sMean, () => calcCoamingStiff())
        : calcCoamingStiff();
      const profName = _stiffProfileName('coamingStiff', 'coamingProfile') || 'L 150x90x10';
      const sec = sectionZWithPlate(profName, cs.s, parseFloat(document.getElementById('coamingT')?.value || 10), _stiff);
      const G_c = (window.Draw && window.Draw.GEOMETRY) || {};
      const z_c_m = (G_c.HC || p.hcLevel) / 1000;
      const combo_c = _stiffPassCombined(sec.Z_min, cs.Z_req, z_c_m, 'coamingStiff', opts?.index);
      const allOK_c = combo_c.criteria.every(c => c.status === 'OK');
      return {
        title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
               ? window.resolveStiffDisplayName('coamingStiff', opts.index)
               : 'Hatch Coaming Top Longitudinal',
        subtitle: 'Pt 3 Ch 11 — stiffener',
        rule: 'LR Pt 3 Ch 11 + HG + Sec 7 buckling',
        required: cs.Z_req.toFixed(1) + ' cm³',
        provided: sec.Z_min.toFixed(1) + ' cm³',
        providedValue: sec.Z_min.toFixed(1) + ' cm³',
        providedSub: profName || '—',
        status: combo_c.criteria.length ? (allOK_c ? 'OK' : 'FAIL') : 'INFO',
        statusCriteria: combo_c.criteria.length ? combo_c.criteria : null,
        formula: cs.formula,
        inputs: [
          { label:'Profile', value: profName },
          ...(cs.inputs || []),
          { label:'Z (cm³)', value: sec.Z_min.toFixed(1) }
        ],
        notes: 'Coaming top stiffeners work with hull girder bending (high σ_hg at this elevation). Check hull girder stress in the block below.'
      };
    }
    
    case 'plate-ud': {
      const ud = calcUpperDeckPlate();
      // Combined status — local + HG + buckling
      const G_ = (window.Draw && window.Draw.GEOMETRY) || {};
      const z_m = (G_.UD || 15300) / 1000;
      const s_mm = parseFloat(document.getElementById('deckLongSpacing')?.value) || 700;
      const combo = _platePassCombined(ud.t_ud, ud.t_req, s_mm, z_m, 'LONGITUDINAL', 'upperDeck');
      // Weather deck head: h_w = 2.5 m nominal for weather deck (Pt 4 Ch 1 Sec 4)
      const h_w = 2.5;
      return {
        title: 'Upper Deck Plate',
        subtitle: 'Sec 4 — Table 1.4.1',
        rule: 'LR Pt 4 Ch 1 Sec 4 + Pt 3 Ch 4 Sec 5.7 (HG) + Sec 7 (buckling)',
        required: ud.t_req.toFixed(2) + ' mm',
        provided: ud.t_ud.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: combo.note,
        statusCriteria: combo.criteria,
        pressure: {
          head_m: h_w,
          kPa: 10.05 * h_w,
          note: 'h = 2.5 m weather head (Pt 4 Ch 1 Sec 4 Table 1.4.1, cargo deck region)'
        },
        formula: ud.formula || 'per Table 1.4.1',
        inputs: [
          ...(ud.inputs || []),
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: ud.steps || []
      };
    }
    
    case 'plate-str':
    case 'plate-twn': {
      const which = elemType === 'plate-str' ? 'str' : 'twn';
      const d = calcLowerDeckPlate(which);
      const p = getParams();
      // Combined status
      const z_m = which === 'str'
        ? (parseFloat(document.getElementById('strDeckZ')?.value || 8590)/1000)
        : (parseFloat(document.getElementById('twnDeckZ')?.value || 12900)/1000);
      const s_mm = which === 'str'
        ? ((typeof realLongSpacing === 'function')
            ? realLongSpacing('stringerStiff', { coord: 'y', inputId: 'strDeckSpacing', defaultFallback: 700 })
            : (parseFloat(document.getElementById('strDeckSpacing')?.value) || 700))
        : ((typeof realLongSpacing === 'function')
            ? realLongSpacing('tweenStiff', { coord: 'y', inputId: 'twnDeckSpacing', defaultFallback: 700 })
            : (parseFloat(document.getElementById('twnDeckSpacing')?.value) || 700));
      const combo = _platePassCombined(d.t_as, d.t_req, s_mm, z_m, 'LONGITUDINAL', which === 'str' ? 'stringer' : 'tween');
      // Pressure: deep tank → LR h₄; weather → 2.5 m; void → none
      let pressure = null;
      if (d.fn === 'deep_tank' || d.fn === 'deep_tank_crown') {
        const tankTop_mm = p.ttLevel;
        const tankComp = _findTankComp();
        const airpipe_m = _resolveAirpipeTop_m(tankComp, tankTop_mm + 760);
        const lr = _LR_h4(z_m * 1000, tankTop_mm, airpipe_m * 1000);
        const rho_ = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
        pressure = {
          head_m: lr.h4,
          kPa: 10.05 * lr.h4 * rho_,
          note: `LR h₄ = ${lr.h4.toFixed(2)} m (governs: ${lr.governs}; airpipe ${airpipe_m.toFixed(2)} m, ρ ${rho_.toFixed(3)})`
        };
      } else if (d.fn === 'weather') {
        pressure = { head_m: 2.5, kPa: 10.05*2.5, note: 'h = 2.5 m weather head' };
      }
      return {
        title: which === 'str' ? 'Stringer Deck Plate' : 'Tween Deck Plate',
        subtitle: d.fn === 'deep_tank' ? 'Table 1.9.1 DT' : (d.fn === 'weather' ? 'Table 1.4.1' : 'Table 1.4.8 min'),
        rule: (d.fn === 'deep_tank' ? 'LR Pt 4 Ch 1 Sec 9 — Table 1.9.1 (2)' : 'LR Pt 4 Ch 1 Sec 4') + ' + Pt 3 Ch 4 Sec 5.7 (HG) + Sec 7 (buckling)',
        required: d.t_req.toFixed(2) + ' mm',
        provided: d.t_as.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: `Function: ${d.fn} · ${combo.note}`,
        statusCriteria: combo.criteria,
        pressure,
        formula: d.formula || '—',
        inputs: [
          ...(d.inputs || []),
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps: d.steps || []
      };
    }
    
    case 'long-bottom': {
      const p = getParams();
      // Resolve this specific stiff and use ITS mean tributary spacing for
      // the formula display (not the group-wide max-gap). _zReqForStiff
      // populates stiff._s_mean_mm; we wrap calcBottomLongCore in the same
      // override so bl.s in the inspector matches the s actually used for
      // this stiff's Z_req.
      const _D = window.Draw;
      const _arr = _D?.profiles?.bottomShell;
      const _stiff = (_arr && opts && opts.index != null) ? _arr[opts.index] : null;
      let _sMean = null;
      if (_stiff) {
        try { _zReqForStiff('bottomShell', _stiff); _sMean = _stiff._s_mean_mm; } catch(_) {}
      }
      const bl = (_sMean && _sMean > 0 && typeof withLocalSpacing === 'function')
        ? withLocalSpacing(_sMean, () => calcBottomLongCore())
        : calcBottomLongCore();
      const profName = _stiffProfileName('bottomShell', 'bottomLongProfile');
      const sec = profName ? sectionZWithPlate(profName, bl.s, num('bottomT'), _stiff) : { Z_min:0 };
      // 3-criterion combined: Z_req + HG + column buckling
      const combo = _stiffPassCombined(sec.Z_min, bl.Z_req, 0.0, 'bottomShell', opts?.index);
      return {
        title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
               ? window.resolveStiffDisplayName('bottomShell', opts.index)
               : 'Bottom Shell Longitudinal',
        subtitle: 'Sec 6 / Table 1.6.1 (3)',
        rule: 'LR Pt 3 Ch 6 Table 1.6.1 + HG + buckling (Pt 3 Ch 4 Sec 7)',
        required: bl.Z_req.toFixed(1) + ' cm³',
        provided: sec.Z_min.toFixed(1) + ' cm³',
        providedValue: sec.Z_min.toFixed(1) + ' cm³',
        providedSub: profName || '—',
        status: combo.overallStatus,
        statusCriteria: combo.criteria,
        statusNote: `Profile: ${profName || '—'} · governing: ${bl.governing || '(a)'}`,
        pressure: {
          head_m: bl.hT2,
          kPa: 10.05 * bl.hT2,
          note: 'h_T2 = design wave head at bottom (Table 1.5.2)'
        },
        formula: 'Z_req = MAX of:<br>'
               + '&nbsp;&nbsp;(a) Z = γ·s·k·h_T2·l_e²·F₁  <i>[wave]</i><br>'
               + '&nbsp;&nbsp;(b) Z = γ·s·k·h_T3·l_e²·F₁·F_sb  <i>[tank, h_T3 = h₄−0.25T]</i>',
        inputs: [
          { label:'s (mm)', value: bl.s.toFixed(0) },
          // bl.le is the Table 1.6.1 value actually used (floored at 1,5 m).
          { label:'l_e (m)', value: (bl.le ?? p.le).toFixed(2) },
          { label:'h_T2 (m)', value: bl.hT2.toFixed(2) },
          { label:'h_T3 (m)', value: (bl.hT3 || 0).toFixed(2) },
          { label:'k (material)', value: p.k },
          { label:'F₁', value: bl.F1.toFixed(3) },
          { label:'Fsb', value: bl.Fsb.toFixed(3) },
          { label:'γ', value: bl.gamma.toFixed(2) }
        ],
        steps: [
          `Z_a = γ · s · k · h_T2 · l_e² · F₁`,
          `    = ${bl.gamma.toFixed(2)} · ${bl.s.toFixed(0)} · ${p.k} · ${bl.hT2.toFixed(2)} · ${p.le.toFixed(2)}² · ${bl.F1.toFixed(3)}`,
          `    = ${(bl.Z_a || 0).toFixed(1)} cm³`,
          (bl.Z_b || 0) > 0
            ? `Z_b = γ · s · k · h_T3 · l_e² · F₁ · Fsb = ${(bl.Z_b || 0).toFixed(1)} cm³`
            : `Z_b = 0 (no deep tank above DB)`,
          `Z_req = max(Z_a, Z_b) = ${bl.Z_req.toFixed(1)} cm³  [governing: ${bl.governing || '(a)'}]`,
          `Z_section (${profName}) = ${sec.Z_min.toFixed(1)} cm³`,
          `Weight: ${sec.weight ? sec.weight.toFixed(1) : '—'} kg/m`
        ]
      };
    }
    
    case 'long-ib': {
      const p = getParams();
      // Resolve this specific IB stiff. Sec 8.4.5: Z ≥ 0.85·Z_bottom RULE
      // value — bottom Z must be computed under the bottom long's own
      // group-max spacing (override cleared), then calcIBLong runs under
      // THIS IB stiff's own mean tributary spacing so the inspector shows
      // the s actually used for this stiff.
      const _D = window.Draw;
      const _arr = _D?.profiles?.innerBottom;
      const _stiff = (_arr && opts && opts.index != null) ? _arr[opts.index] : null;
      let _sMean = null;
      if (_stiff) {
        try { _zReqForStiff('innerBottom', _stiff); _sMean = _stiff._s_mean_mm; } catch(_) {}
      }
      const bl = (typeof withLocalSpacing === 'function')
        ? withLocalSpacing(null, () => calcBottomLongCore())
        : calcBottomLongCore();
      const ibL = (_sMean && _sMean > 0 && typeof withLocalSpacing === 'function')
        ? withLocalSpacing(_sMean, () => calcIBLong(bl.Z_req))
        : calcIBLong(bl.Z_req);
      const profName = _stiffProfileName('innerBottom', 'ibLongProfile');
      const sec = profName ? sectionZWithPlate(profName, num('ibLongSpacing'), num('ibT'), _stiff) : { Z_min:0 };
      // 3-criterion combined: Z_req + HG + column buckling
      const combo = _stiffPassCombined(sec.Z_min, ibL.Z_req, p.ibLevel / 1000, 'innerBottom', opts?.index);
      const status = combo.overallStatus;
      
      // Get loading compartment (cargo/ballast/etc. directly above IB)
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const ib_z = p.ibLevel + 100;
      const sample_y = (G.B_half || 11880) / 2;
      const compAbove = (window.getCompartmentAt ? window.getCompartmentAt(sample_y, ib_z) : null);
      
      let pressure = null;
      const loadInputs = [];
      if (compAbove) {
        if (compAbove.type === 'cargo') {
          const cargoLoad = compAbove.cargoLoad || 0;
          const P_cargo_kPa = cargoLoad * 9.81;
          if (cargoLoad > 0) {
            pressure = {
              head_m: cargoLoad / 1.025,
              kPa: P_cargo_kPa,
              note: `${compAbove.name} · Cargo stowage ${cargoLoad} t/m² = ${P_cargo_kPa.toFixed(1)} kPa (Sec 8.4.5 Z_req = 0.85·Z_bot is empirical proxy)`
            };
            loadInputs.push({ label:'Compartment', value: `${compAbove.name} (cargo)` });
            loadInputs.push({ label:'Cargo Load', value: `${cargoLoad} t/m² = ${P_cargo_kPa.toFixed(1)} kPa` });
          }
        } else if (compAbove.type === 'ballast' || compAbove.type === 'fuel' || compAbove.type === 'freshwater') {
          const rho = compAbove.rho || 1.025;
          const bb = window._compartmentBoundingBox?.(compAbove);
          const tank_top_mm = bb?.zMax ?? (G.UD || 15300);
          // For IB longitudinal: z_ref = middle of effective length ≈ z_plate
          const z_plate_mm = p.ibLevel;
          const airpipe_m = _resolveAirpipeTop_m(compAbove, null);
          const pipe_mm = airpipe_m * 1000;
          // LR Tablo 1.9.1 (d) — design load head h₄ for stiffener
          const lr = _LR_h4(z_plate_mm, tank_top_mm, pipe_mm);
          const P_kPa = 10.05 * lr.h4 * rho;
          // Test head per LR Pt 3 Ch 1 Tablo 1.9.1 — greater of 2.4 m & overflow.
          const th = _LR_testHead_above_TT(compAbove, tank_top_mm, pipe_mm);
          const h_test_m = Math.max((tank_top_mm + th.h_test_m*1000 - z_plate_mm)/1000, 0.5);
          const P_test_kPa = 10.05 * h_test_m * rho;
          pressure = {
            head_m: lr.h4,
            kPa: P_kPa,
            note: `${compAbove.name} (${compAbove.type}) · LR h₄=${lr.h4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  [Tablo 1.9.1 (d): max(z_TT−z_mid=${lr.h_a.toFixed(2)}, (z_OF−z_mid)/2=${lr.h_b.toFixed(2)}, 0.5)]`
          };
          loadInputs.push({ label:'Compartment', value: `${compAbove.name} (${compAbove.type})` });
          loadInputs.push({ label:'ρ (t/m³)', value: rho.toString() });
          loadInputs.push({ label:'Airpipe top', value: `${pipe_mm.toFixed(0)} mm AB (${airpipe_m.toFixed(2)} m)` });
          loadInputs.push({ label:'Tank top', value: `${tank_top_mm} mm AB` });
          loadInputs.push({ label:'h₄ (LR design)', value: `${lr.h4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  (governs: ${lr.governs})` });
          loadInputs.push({ label:'Test head (info)', value: `+${th.h_test_m.toFixed(2)} m above TT (governs: ${th.source}) → ${h_test_m.toFixed(2)} m at stiff → ${P_test_kPa.toFixed(1)} kPa` });
        } else {
          loadInputs.push({ label:'Compartment', value: `${compAbove.name} (${compAbove.type} — no load)` });
        }
      } else {
        loadInputs.push({ label:'Compartment', value: '— none defined —' });
      }
      
      // === HULL GIRDER NORMAL STRESS AT IB LEVEL (LR Pt 3 Ch 4 Sec 5.7) ===
      let hgBlock = null;
      try {
        const ls = runLongStrengthAnalysis();
        if (ls && ls.section && ls.section.I_NA > 0) {
          const ib_z_m = p.ibLevel / 1000;
          const dz_m = ib_z_m - ls.section.z_NA;  // IB below NA → negative
          const M_hog = Math.abs(ls.M_total_hog);
          const M_sag = Math.abs(ls.M_total_sag);
          const M_max = Math.max(M_hog, M_sag);
          // σ = M(kN·m) · Δz(m) / I(m⁴) × 10⁻³ → N/mm²
          const sigma_hg = Math.abs(M_max * dz_m / ls.section.I_NA) * 1e-3;
          const sigma_perm = ls.sigma_amid;
          hgBlock = {
            z_m: ib_z_m, dz_m, sigma_hg, sigma_perm,
            ratio: sigma_hg / sigma_perm,
            pass: sigma_hg <= sigma_perm,
            M_max
          };
        }
      } catch (e) { /* silent */ }
      
      return {
        title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
               ? window.resolveStiffDisplayName('innerBottom', opts.index)
               : 'Inner Bottom Longitudinal',
        subtitle: 'Sec 8.4.5 + Sec 5.7 hull girder',
        rule: 'LR Pt 4 Ch 1 Sec 8.4.5 + Pt 3 Ch 4 Sec 5.7',
        required: ibL.Z_req.toFixed(1) + ' cm³',
        provided: sec.Z_min.toFixed(1) + ' cm³',
        providedValue: sec.Z_min.toFixed(1) + ' cm³',
        providedSub: profName || '—',
        status,
        statusCriteria: combo.criteria,
        statusNote: `Profile: ${profName || '—'} · Gov: ${ibL.gov}`
               + (hgBlock ? ` · HG σ ${hgBlock.sigma_hg.toFixed(0)}/${hgBlock.sigma_perm.toFixed(0)} N/mm² ${hgBlock.pass?'✓':'✗'}` : ''),
        pressure,
        formula: 'Z ≥ 0.85 × Z_bottom_long  <i>(Sec 8.4.5 local)</i><br>'
               + 'PLUS hull girder: σ = |M·Δz/I_NA| ≤ σ_perm  <i>(Sec 5.7)</i>',
        inputs: [
          ...loadInputs,
          { label:'s (mm)', value: (_sMean != null && _sMean > 0) ? _sMean.toFixed(0) : num('ibLongSpacing').toFixed(0) },
          { label:'Z_bottom_long (cm³)', value: bl.Z_req.toFixed(1) },
          { label:'Z_85 = 0.85·Z_bot', value: ibL.Z_85.toFixed(1) },
          ibL.Z_dt != null ? { label:'Z_deep_tank (Sec 9)', value: ibL.Z_dt.toFixed(1) + ' cm³' } : null,
          ibL.Z_cargo != null ? { label:'Z_cargo (Sec 5)', value: ibL.Z_cargo.toFixed(1) + ' cm³' } : null,
          ibL.h_4_dt != null ? { label:'h_4 (airpipe head)', value: ibL.h_4_dt.toFixed(2) + ' m' } : null,
          ibL.h_cargo_eq != null ? { label:'h_cargo (equiv head)', value: ibL.h_cargo_eq.toFixed(2) + ' m' } : null,
          ibL.cargoSource ? { label:'Cargo source', value: ibL.cargoSource } : null,
          ibL.airpipe_m != null ? { label:'Airpipe top (m AB)', value: ibL.airpipe_m.toFixed(2) + ' — ' + (ibL.airpipe_src || '') } : null,
          ibL.rho != null ? { label:'ρ (tank fluid)', value: ibL.rho.toFixed(3) + ' t/m³' } : null,
          // Z_85 derives from the bottom-longitudinal Z, so show that l_e.
          { label:'l_e (m)', value: (bl.le ?? p.le).toFixed(2) },
          hgBlock ? { label:'Hull girder σ', value: `${hgBlock.sigma_hg.toFixed(1)} / ${hgBlock.sigma_perm.toFixed(0)} N/mm²` } : null
        ].filter(Boolean),
        steps: [
          `── Local Bending (Sec 8.4.5) ──`,
          `Z_85 = 0.85 × ${bl.Z_req.toFixed(1)} = ${ibL.Z_85.toFixed(1)} cm³   (primary rule)`,
          ibL.Z_dt != null ? `── Deep Tank Check (Sec 9 Table 1.9.1(2)) ──` : '',
          ibL.Z_dt != null ? `Airpipe top = ${ibL.airpipe_m.toFixed(2)} m AB  (${ibL.airpipe_src})` : '',
          ibL.Z_dt != null ? `h_4 = max(tank_top−z_IB, (airpipe−z_IB)/2) = ${ibL.h_4_dt.toFixed(2)} m   (min 0.5 m)` : '',
          ibL.Z_dt != null ? `Z_dt = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2))` : '',
          ibL.Z_dt != null ? `     = ${ibL.rho.toFixed(3)}·${num('ibLongSpacing')}·${p.k}·${ibL.h_4_dt.toFixed(2)}·${(p.le*p.le).toFixed(3)} / (22·${ibL.gamma}·4) = ${ibL.Z_dt.toFixed(1)} cm³` : '',
          ibL.Z_cargo != null ? `── Cargo Load Check (Pt 3 Ch 3 Sec 5 Table 3.5.1) ──` : '',
          ibL.Z_cargo != null && ibL.cargoLoad_tm2 != null ? `Cargo load = ${ibL.cargoLoad_tm2} t/m² (from compartment definition)` : '',
          ibL.Z_cargo != null && ibL.C_stowage != null ? `Back-check stowage rate: C = H/h = ${ibL.C_stowage.toFixed(2)} m³/t  ${ibL.C_stowage < 0.865 ? '→ heavy cargo notation required' : '→ light cargo range'}` : '',
          ibL.Z_cargo != null ? `h_cargo_eq = cargoLoad / ρ_ref = ${(ibL.h_cargo_eq || 0).toFixed(2)} m  (equivalent head)` : '',
          ibL.Z_cargo != null ? `Z_cargo = ρ_ref·s·k·h·l_e² / (22·γ·(ω₁+ω₂+2))` : '',
          ibL.Z_cargo != null ? `        = 1.025·${num('ibLongSpacing')}·${p.k}·${(ibL.h_cargo_eq||0).toFixed(2)}·${(p.le*p.le).toFixed(3)} / (22·${ibL.gamma}·4) = ${ibL.Z_cargo.toFixed(1)} cm³` : '',
          `── Governing ──`,
          `Governing: ${ibL.gov}`,
          `Z_req = ${ibL.Z_req.toFixed(1)} cm³`,
          `Z_section (${profName}) = ${sec.Z_min.toFixed(1)} cm³`,
          hgBlock ? `` : '',
          hgBlock ? `── Hull Girder Check (Pt 3 Ch 4 Sec 5.7) ──` : '',
          hgBlock ? `z_IB = ${hgBlock.z_m.toFixed(2)} m · Δz = ${hgBlock.dz_m.toFixed(2)} m (below NA)` : '',
          hgBlock ? `M_total_max = ${hgBlock.M_max.toFixed(0)} kN·m  (Ms+|Mw|)` : '',
          hgBlock ? `σ_hg = |M · Δz / I_NA| × 10⁻³ = ${hgBlock.sigma_hg.toFixed(1)} N/mm²` : '',
          hgBlock ? `σ_perm = 175/kL = ${hgBlock.sigma_perm.toFixed(1)} N/mm²` : '',
          hgBlock ? `Ratio = ${hgBlock.ratio.toFixed(3)} ${hgBlock.pass ? '✓ OK' : '✗ FAIL'}` : '',
        ].filter(Boolean),
        notes: compAbove
          ? `Load sources: compartment "${compAbove.name}" (local) + hull girder global bending. Both checked.`
          : 'Sec 8.4.5 local requirement + hull girder global stress check.'
      };
    }
    
    case 'long-sidegirder': {
      // Side girder boyuna intercostal stiffener — Pt 4 Ch 1 Sec 8.3.5
      // (LR'da bu stiff için spesifik Z_req yok; sadece plate buckling
      //  desteği + stiff kendi buckling kontrolü)
      const p = getParams();
      const _D = window.Draw;
      const grp = opts?.group;                              // 'sideGirder0' / 1 / 2
      const idx = opts?.index;
      const _arr = grp ? _D?.profiles?.[grp] : null;
      const _stiff = (_arr && idx != null) ? _arr[idx] : null;
      const sgIndex = grp ? parseInt(grp.replace('sideGirder','')) : 0;
      const sgY = _D?.SIDE_GIRDERS?.[sgIndex]?.y;
      const z_mm = _stiff?.z || 0;
      const z_m = z_mm / 1000;
      const profName = _stiff?.profileName || 'FB 100x10';

      // Parse profile dims
      let d_w = 100, t_w = 10, profType = 'FB';
      const fbMatch = profName.match(/^FB\s+(\d+)x(\d+)/i);
      const lMatch  = profName.match(/^L\s+(\d+)x(\d+)x(\d+)/i);
      const hpMatch = profName.match(/^HP\s+(\d+)x(\d+)/i);
      if (fbMatch) { profType = 'FB'; d_w = +fbMatch[1]; t_w = +fbMatch[2]; }
      else if (lMatch) { profType = 'L'; d_w = +lMatch[1]; t_w = +lMatch[3]; }
      else if (hpMatch){ profType = 'HP'; d_w = +hpMatch[1]; t_w = +hpMatch[2]; }

      // Side girder plate parameters
      const G2 = (window.Draw && window.Draw.GEOMETRY) || {};
      const d_DB_actual = G2.IB || p.ibLevel || 1800;
      const t_sg = (window.Draw?.PLATE_THICKNESS?.sideGirder) ||
                   parseFloat(document.getElementById('sgT')?.value) || 10;

      // ── (A) Plate sub-panel buckling with this stiffener configuration ──
      const N_long = _arr ? _arr.length : 0;
      const wf_mm = (p.le && p.le > 0) ? p.le * 1000 : 1452;
      const s_horiz = wf_mm;                           // full web frame (no vert stiff)
      const s_vert  = d_DB_actual / (N_long + 1);      // boyuna stiff sayısı
      const s_panel = Math.min(s_vert, s_horiz);

      const E_steel = 206000;
      const sigma_o = 235 / (p.k || 0.72);             // approximate yield from k
      const dt_corr = 0.5;                             // ONE_WB_VERT
      const tp_plate = t_sg - dt_corr;
      const sigma_E_plate = 3.6 * E_steel * Math.pow(tp_plate/s_panel, 2);
      const sigma_CRB_plate = (sigma_E_plate <= sigma_o/2)
                              ? sigma_E_plate
                              : sigma_o * (1 - sigma_o/(4*sigma_E_plate));

      // ── (B) Hull-girder stress at this stiffener's z ──
      let sigma_A = 30 / p.kL;
      let sigma_perm = 175 / p.kL;
      let hg_status = 'OK', hg_ratio = 0, hg_dbg = '';
      try {
        if (typeof window.runLongStrengthAnalysis === 'function') {
          const rls = window.runLongStrengthAnalysis();
          if (rls && rls.section) {
            const I_NA = rls.section.I;
            const z_NA = rls.section.z_NA;
            const M_max = Math.max(Math.abs(rls.Ms_design || 0), 0) +
                          Math.max(Math.abs(rls.Mw_hog || 0), Math.abs(rls.Mw_sag || 0));
            if (I_NA && z_NA != null) {
              sigma_A = Math.abs(M_max * (z_m - z_NA) / I_NA) * 1e-3;
              if (sigma_A < 30/p.kL) sigma_A = 30/p.kL;
            }
          }
        } else {
          // Fallback estimate: σ_A = σ_face × (z_from_NA / z_face)
          const z_NA_est = (G2.D || 15.3) / 2;
          const z_from_NA = Math.abs(z_m - z_NA_est);
          sigma_A = Math.max(30/p.kL, 200 * z_from_NA / z_NA_est);
        }
      } catch(_) {}
      hg_ratio = sigma_A / sigma_perm;
      hg_status = hg_ratio <= 1 ? 'OK' : 'FAIL';

      // ── (C) Stiffener web buckling — Tablo 4.7.3(c) ──
      // σ_E = 3.8·E·(t_w/d_w)², β = 1.0 web local
      const dt_web = 0.5;
      const tw_corr = t_w - dt_web;
      const sigma_E_web = 3.8 * E_steel * Math.pow(tw_corr/d_w, 2);
      const sigma_CRB_web = (sigma_E_web <= sigma_o/2)
                            ? sigma_E_web
                            : sigma_o * (1 - sigma_o/(4*sigma_E_web));

      // ── UC values ──
      const UC_plate = sigma_A / sigma_CRB_plate;
      const UC_web   = sigma_A / sigma_CRB_web;
      const plate_status = UC_plate <= 1 ? 'OK' : 'FAIL';
      const web_status = UC_web <= 1 ? 'OK' : 'FAIL';

      // ── Overall status (3-badge style) ──
      let overallStatus = 'OK';
      if (UC_plate > 1 || UC_web > 1 || hg_ratio > 1) overallStatus = 'FAIL';
      const note_lines = [];
      note_lines.push(`Plate: UC=${UC_plate.toFixed(2)} ${plate_status==='OK'?'✓':'✗'}`);
      note_lines.push(`Web:   UC=${UC_web.toFixed(2)} ${web_status==='OK'?'✓':'✗'}`);
      note_lines.push(`HG:    σ/σp=${hg_ratio.toFixed(2)} ${hg_status==='OK'?'✓':'✗'}`);

      // 3-criterion combined badges format
      const criteria = [
        { name: 'LOCAL', label: 'Plate Buckling', status: plate_status, value: `UC=${UC_plate.toFixed(2)}` },
        { name: 'HG',    label: 'Hull Girder',    status: hg_status,    value: `σ/σp=${hg_ratio.toFixed(2)}` },
        { name: 'WEB',   label: 'Web Buckling',   status: web_status,   value: `UC=${UC_web.toFixed(2)}` }
      ];

      return {
        title: `SG${sgIndex+1} L${idx+1} — ${profName}`,
        subtitle: (sgY != null ? `y = ${sgY} mm CL · ` : '') +
                  `z = ${z_mm} mm · LR Pt 4 Ch 1 Sec 8.3.5 + Pt 3 Ch 4 Sec 7`,
        rule: 'LR boyuna intercostal stiff için spesifik Z_req yok — plate buckling desteği + stiff. kendi web buckling',
        required: '—',
        provided: profName,
        status: overallStatus,
        statusNote: note_lines.join(' · '),
        statusCriteria: criteria,
        formula: 'Plate buckling: σ_E = 3.6·E·(t_p/s)², s = sub-panel kısa kenarı<br>' +
                 'Web buckling: σ_E = 3.8·E·(t_w/d_w)²',
        inputs: [
          { label: 'Profile', value: profName },
          { label: 'd_w (web depth)', value: d_w + ' mm' },
          { label: 't_w (web thickness)', value: t_w + ' mm' },
          { label: 'z (stiff. konum)', value: z_mm + ' mm' },
          { label: 'Side girder t', value: t_sg.toFixed(1) + ' mm' },
          { label: 'Long. stiff sayısı (this SG)', value: N_long.toString() },
          { label: 'Sub-panel (vert × horiz)', value: `${s_vert.toFixed(0)} × ${s_horiz.toFixed(0)} mm` },
          { label: 's_panel (kısa kenar)', value: s_panel.toFixed(0) + ' mm' },
          { label: 'σ_A (HG at z)', value: sigma_A.toFixed(1) + ' N/mm²' },
          { label: 'σ_perm = 175/kL', value: sigma_perm.toFixed(1) + ' N/mm²' },
          { label: 'σ_CRB plate', value: sigma_CRB_plate.toFixed(1) + ' N/mm²' },
          { label: 'σ_CRB web', value: sigma_CRB_web.toFixed(1) + ' N/mm²' },
          { label: 'UC plate', value: UC_plate.toFixed(3) + ' ' + (plate_status==='OK'?'✓':'✗') },
          { label: 'UC web', value: UC_web.toFixed(3) + ' ' + (web_status==='OK'?'✓':'✗') }
        ],
        steps: [
          `Stiff: ${profName} (FB d_w=${d_w}, t_w=${t_w} mm), z=${z_mm} mm`,
          `Side girder t = ${t_sg} mm, AH36 (k=${p.k}, kL=${p.kL})`,
          ``,
          `── (A) Plate sub-panel buckling ──`,
          `  Yatay s = full web frame = ${s_horiz.toFixed(0)} mm (vert stiff yok)`,
          `  ${N_long} long. stiff → dikey s = ${d_DB_actual}/(${N_long}+1) = ${s_vert.toFixed(0)} mm`,
          `  s_panel = min = ${s_panel.toFixed(0)} mm`,
          `  σ_E = 3.6·E·(t_p/s)² = 3.6·206000·(${tp_plate}/${s_panel.toFixed(0)})² = ${sigma_E_plate.toFixed(1)} N/mm²`,
          `  σ_CRB = ${sigma_CRB_plate.toFixed(1)} N/mm²`,
          `  UC_plate = ${sigma_A.toFixed(1)}/${sigma_CRB_plate.toFixed(1)} = ${UC_plate.toFixed(3)} ${plate_status==='OK'?'✓':'✗'}`,
          ``,
          `── (B) Stiffener web buckling (Tablo 4.7.3c) ──`,
          `  σ_E_web = 3.8·E·(t_w/d_w)² = 3.8·206000·(${tw_corr}/${d_w})² = ${sigma_E_web.toFixed(0)} N/mm²`,
          `  σ_CRB_web = ${sigma_CRB_web.toFixed(0)} N/mm²`,
          `  UC_web = ${UC_web.toFixed(3)} ${web_status==='OK'?'✓':'✗'}`,
          ``,
          `── (C) Hull-girder stress at z=${z_m.toFixed(2)} m ──`,
          `  σ_A = ${sigma_A.toFixed(1)} N/mm²`,
          `  σ_perm = ${sigma_perm.toFixed(1)} N/mm²`,
          `  Ratio = ${hg_ratio.toFixed(3)} ${hg_status==='OK'?'✓':'✗'}`
        ],
        notes: 'Sniped-intercostal: uçları frame\'e bağlı değil (25 mm gap). Column buckling check uygulanmadı çünkü stiff axial yük taşımaz, sadece plate buckling desteği. Üretimde sniped uçlarda soft-toe detayı önerilir (yorulma).'
      };
    }
    
    case 'long-side': {
      const p = getParams();
      const z_m = opts.z_m || 5;
      if (typeof calcSideLong !== 'function') {
        return { title:'Side Long', subtitle:'—', status:'INFO', notes:'calcSideLong not available.' };
      }
      const all = calcSideLong();
      if (!all || !Array.isArray(all) || !all.length) {
        return { title:'Side Long', subtitle:'—', status:'INFO', notes:'No side longitudinals defined.' };
      }
      // Find nearest long to clicked z
      const z_mm = z_m * 1000;
      let best = all[0], bestDist = Infinity;
      all.forEach(r => {
        const d = Math.abs(r.z - z_mm);
        if (d < bestDist) { bestDist = d; best = r; }
      });

      // ===== Override-aware Z_req recomputation =====
      // If this stiff falls within the user "every-4th-frame" study range
      // (Side Shell #3..#42), recompute Z_req with the larger span. This
      // mirrors the override applied inside _zReqForStiff so the panel
      // display matches the actual FAIL-PASS / profile-filter result.
      let le_panel_side = p.le;
      let le_overridden_side = false;
      if (opts && opts.index != null && typeof window._resolveStiffLe === 'function') {
        const over_s = window._resolveStiffLe('sideShell', opts.index, p.le);
        if (over_s.applied) {
          le_panel_side = over_s.le_m;
          le_overridden_side = true;
          // Re-run calcSideLong under the override and pick the same nearest long
          try {
            const all_over = (typeof withLocalLe === 'function')
              ? withLocalLe(over_s.le_m, () => calcSideLong())
              : all;
            if (Array.isArray(all_over) && all_over.length) {
              let best_over = all_over[0], bestD = Infinity;
              all_over.forEach(r => {
                const d = Math.abs(r.z - z_mm);
                if (d < bestD) { bestD = d; best_over = r; }
              });
              best = best_over;  // replace with override-aware record
            }
          } catch (_) {}
        }
      }

      const Z_req = best.Z_req ?? best.Z ?? 0;
      const s_val = best.s ?? 700;
      const hT1 = best.hT1 ?? 0;
      // Compute h_4 inline (only if below tank top) — LR Tablo 1.9.1 (d)
      const tank_top_mm = p.ttLevel;
      const z_m_best = best.z / 1000;
      const tankComp = _findTankComp();
      const airpipe_m_side = _resolveAirpipeTop_m(tankComp, tank_top_mm + 760);
      const h4 = z_m_best * 1000 < tank_top_mm 
        ? _LR_h4(best.z, tank_top_mm, airpipe_m_side * 1000).h4
        : 0;
      const Cw = calcCw(p.L);
      const hT3 = Math.max(p.T + 0.5*Cw - z_m, 0.5);
      // Resolve selected profile for this specific stiffener
      const profInfo_side = _resolveStiffProfile(opts);
      const providedStr_side = profInfo_side 
        ? (profInfo_side.Z_cm3 != null 
            ? `${profInfo_side.name} · Z=${profInfo_side.Z_cm3.toFixed(1)} cm³${profInfo_side.isOverride ? ' (custom)' : ''}`
            : profInfo_side.name)
        : '(no profile selected)';
      // Provided: show WHY on screen if resolve fails (for debugging).
      let provVal_side, provSub_side;
      if (profInfo_side && profInfo_side.Z_cm3 != null) {
        provVal_side = profInfo_side.Z_cm3.toFixed(1) + ' cm³';
        provSub_side = profInfo_side.name + (profInfo_side.isOverride ? ' (custom)' : '');
      } else if (profInfo_side) {
        provVal_side = '—';
        provSub_side = profInfo_side.name + ' (Z calc failed)';
      } else {
        const D = window.Draw;
        const arr = D && D.profiles && D.profiles.sideShell;
        if (!opts || opts.index == null) {
          provVal_side = '—'; provSub_side = '(no index in opts)';
        } else if (!arr) {
          provVal_side = '—'; provSub_side = '(profiles.sideShell missing)';
        } else if (!arr[opts.index]) {
          provVal_side = '—'; provSub_side = `(no stiff at index ${opts.index}, arr.length=${arr.length})`;
        } else {
          const s = arr[opts.index];
          const dd = document.getElementById('sideLongProfile');
          provVal_side = '—';
          provSub_side = s.profileName
            ? `(name="${s.profileName}" not found in catalog)`
            : `(no profileName, dropdown="${dd?.value || ''}")`;
        }
      }
      const Z_sec_side = (profInfo_side && profInfo_side.Z_cm3 != null) ? profInfo_side.Z_cm3 : 0;
      const combo_side = _stiffPassCombined(Z_sec_side, Z_req, z_m, 'sideShell', opts?.index);
      const sideStatus = (Z_req > 0 && Z_sec_side > 0) ? combo_side.overallStatus : 'INFO';
      return {
        title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
               ? window.resolveStiffDisplayName('sideShell', opts.index)
               : 'Side Shell Longitudinal',
        subtitle: `z = ${(best.z/1000).toFixed(2)} m · Table 1.6.1 + 1.9.1 (tank)`,
        rule: 'LR Pt 3 Ch 6 / Pt 4 Ch 1 Sec 9 + Sec 7 buckling',
        required: Z_req.toFixed(1) + ' cm³',
        provided: providedStr_side,
        providedValue: provVal_side,
        providedSub: provSub_side,
        status: sideStatus,
        statusCriteria: (Z_req > 0 && Z_sec_side > 0) ? combo_side.criteria : null,
        statusNote: `z = ${(best.z/1000).toFixed(2)} m (nearest long to ${z_m.toFixed(2)})`,
        pressure: hT1 > 0 ? {
          head_m: hT1,
          kPa: 10.05 * hT1,
          note: `h_T1 = wave head at side (Table 1.6.1)`
        } : (h4 > 0 ? {
          head_m: h4, kPa: 10.05 * h4 * 1.025,
          note: `h_4 = tank head (Table 1.9.1 DT)`
        } : null),
        formula: 'Z_a = 0.056·s·k·h_T1·l_e²·F₁·Fs  <i>(hull girder, Table 1.6.1)</i><br>'
               + 'Z_tank = ρ·s·k·h_4·l_e²/(22·γ·4)  <i>(if z &lt; tank top, Table 1.9.1 DT)</i><br>'
               + 'Z_req = max(Z_a, Z_tank)',
        inputs: [
          { label:'z (m above BL)', value: (best.z/1000).toFixed(2) },
          { label:'s (mm)', value: s_val.toString() },
          // Table 1.6.1 floors l_e at 1,5 m — show the value the formula used.
          { label:'l_e (m)', value: Math.max(le_panel_side, 1.5).toFixed(2) + (le_overridden_side ? ' ⚠ override' : '') },
          { label:'h_T1 (m)', value: hT1.toFixed(2) },
          h4 > 0 ? { label:'h_4 (m)', value: h4.toFixed(2) } : null,
          { label:'k', value: p.k }
        ].filter(Boolean),
        steps: [
          `Governing case: ${best.gov || '—'}`,
          `Z_req = ${Z_req.toFixed(1)} cm³` + (le_overridden_side ? `  [l_e=${le_panel_side.toFixed(2)} m, every-4th-frame override]` : ''),
          best.Z_a  ? `  Z_a (hull girder)  = ${best.Z_a.toFixed(1)} cm³` : '',
          best.Z_tank ? `  Z_tank (deep tank) = ${best.Z_tank.toFixed(1)} cm³` : '',
        ].filter(Boolean),
        notes: 'Side longs are grouped in the Scantling page (Side Groups table). Each group picks one profile based on the worst strake in the group.'
      };
    }
    
    case 'plate-is': {
      const p_raw = getParams();
      // v33: shadow `p` with a strake-aware k so the IS Tank/Coaming/Void
      // formulas pick up per-strake material overrides automatically.
      const p = { ...p_raw, k: _resolveK('innerSide', opts.strakeIdx, null, p_raw.k) };
      // Read CURRENT thickness from STRAKES (not cached opts)
      let t;
      if (opts.strakeIdx != null && window.Draw?.STRAKES?.innerSide?.[opts.strakeIdx]) {
        t = window.Draw.STRAKES.innerSide[opts.strakeIdx].thickness;
      } else if (opts.strakeThickness != null) {
        t = opts.strakeThickness;
      } else {
        t = 11;
      }
      let s_strake;
      if (opts.strakeIdx != null && typeof window.strakeLongSpacing === 'function') {
        s_strake = window.strakeLongSpacing('innerSide', opts.strakeIdx).value;
      } else if (typeof realLongSpacing === 'function') {
        s_strake = realLongSpacing('innerSide', { coord: 'z', defaultFallback: 650, extraSupports: window.getPlateSupports?.('innerSide') || [] });
      } else {
        s_strake = (opts.strakeSpacing != null ? opts.strakeSpacing : 650);
      }
      
      // Get Z range from drawing's STRAKES.innerSide[strakeIdx]
      let z1_mm = null, z2_mm = null, z_mid_m = null, z_mid_mm = null;
      if (opts.strakeIdx != null && window.Draw && window.Draw.STRAKES?.innerSide) {
        let cursor = p.ibLevel;
        for (let i = 0; i < window.Draw.STRAKES.innerSide.length; i++) {
          const w = window.Draw.STRAKES.innerSide[i].width;
          if (i === opts.strakeIdx) {
            z1_mm = cursor;
            z2_mm = cursor + w;
            z_mid_mm = (z1_mm + z2_mm) / 2;
            z_mid_m = z_mid_mm / 1000;
            break;
          }
          cursor += w;
        }
      }
      
      // === COMPARTMENT-DRIVEN PRESSURE ===
      // IS wall has a compartment on each side. The OUTBOARD side (Y > IS wall)
      // typically holds ballast/fuel (wing tank). Sample a point just outside.
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const IS_Y = G.IS || 10030;
      const is_y = IS_Y + 50;  // just outboard of IS wall
      const sample_z = z_mid_mm != null ? z_mid_mm : (p.ibLevel + 3000);
      const compOutboard = (window.getCompartmentAt ? window.getCompartmentAt(is_y, sample_z) : null);
      
      // Determine region: Tank (loaded by compartment), Void, or Coaming
      let region, ruleRef, h_4 = 0, rho = 1.025, f = 1.0;
      let t_req, formula, steps, pressure = null;
      let compDesc = '';
      
      // Above UD = coaming
      if (sample_z > p.udLevel) {
        region = 'Coaming';
        ruleRef = 'Pt 3 Ch 11';
        t_req = 10;
        formula = 't_min = 10 mm  <i>(Hatch coaming — Pt 3 Ch 11 approx.)</i>';
        steps = [`Coaming region`, `t_min = 10 mm`, `t_as-built = ${t.toFixed(1)} mm`];
      }
      else if (compOutboard && (compOutboard.type === 'ballast' || compOutboard.type === 'fuel' || compOutboard.type === 'freshwater')) {
        region = 'Tank';
        ruleRef = 'Table 1.9.1 (1)';
        rho = compOutboard.rho || 1.025;
        const tank_top_mm = window._compartmentBoundingBox?.(compOutboard)?.zMax || p.udLevel;
        // LR Tablo 1.9.1 footnote (b) — plate reference point:
        //   "from a point one-third of the height of the plate above its
        //    lower edge to the top of the tank, OR half the distance to
        //    the top of the overflow, whichever is the greater"
        const z_ref_mm = z1_mm != null ? (z1_mm + (z2_mm - z1_mm)/3) : sample_z;
        const airpipe_m = _resolveAirpipeTop_m(compOutboard, null);
        const pipe_mm = airpipe_m * 1000;
        const lr = _LR_h4(z_ref_mm, tank_top_mm, pipe_mm);
        h_4 = lr.h4;
        // S = primary-member (web frame) spacing, not the per-stiffener l_e
        f = Math.min(1.0, 1.1 - s_strake/(2500 * (p.le_global || p.le)));
        // LR Table 1.9.1 (1): t = 0.004·s·f·√(ρ·h₄·k/1.025) + 2.5 — k inside sqrt
        const t_calc = 0.004 * s_strake * f * Math.sqrt(rho * h_4 * p.k / 1.025) + 2.5;
        // Use RAW t_calc (with LR 7.5 mm minimum) — no 0.5 mm pre-rounding.
        // The plate-rounding rule (0.25 mm threshold) is applied by the
        // Optimize Plates tool; keeping t_req raw here means the inspector
        // panel and the optimizer agree on the required value.
        t_req = Math.max(t_calc, 7.5);
        formula = 't = 0.004·s·f·√(ρ·h_4·k/1.025) + 2.5 mm  <i>(Table 1.9.1 (1))</i><br>Min: 7.5 mm';
        steps = [
          `z_ref = z1 + H/3 = ${z_ref_mm.toFixed(0)} mm AB`,
          `LR Tablo 1.9.1 (b): h₄ = max(z_TT−z_ref=${lr.h_a.toFixed(2)}, (z_OF−z_ref)/2=${lr.h_b.toFixed(2)}, 0.5) = ${h_4.toFixed(2)} m  (governs: ${lr.governs})`,
          `f = min(1.0, 1.1 − s/(2500·l_e)) = ${f.toFixed(3)}`,
          `t = 0.004 × ${s_strake} × ${f.toFixed(3)} × √(${rho} × ${h_4.toFixed(2)} × ${p.k.toFixed ? p.k.toFixed(2) : p.k}/1.025) + 2.5 = ${t_calc.toFixed(2)} mm`,
          `t_req = max(${t_calc.toFixed(2)}, 7.5) → ${t_req.toFixed(2)} mm`,
          `t_as-built = ${t.toFixed(1)} mm`
        ];
        // Pressure for inspector display — LR h₄ is the design head
        const P_kPa = 10.05 * h_4 * rho;
        // Test head per LR Pt 3 Ch 1 Tablo 1.9.1 — info only
        const z_plate_mm = z_mid_mm != null ? z_mid_mm : sample_z;
        const th = _LR_testHead_above_TT(compOutboard, tank_top_mm, pipe_mm);
        const h_test_m = Math.max((tank_top_mm + th.h_test_m*1000 - z_plate_mm)/1000, 0.5);
        const P_test_kPa = 10.05 * h_test_m * rho;
        pressure = {
          head_m: h_4,
          kPa: P_kPa,
          note: `${compOutboard.name} (${compOutboard.type}) · LR h₄=${h_4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  [Tablo 1.9.1 (b): max(z_TT−z_ref=${lr.h_a.toFixed(2)}, (z_OF−z_ref)/2=${lr.h_b.toFixed(2)}, 0.5)] · test +${th.h_test_m.toFixed(2)} m above TT (${th.source}) → ${P_test_kPa.toFixed(1)} kPa`
        };
        compDesc = `${compOutboard.name} (${compOutboard.type})`;
      }
      else {
        region = 'Void';
        ruleRef = 'Sec 9 min';
        t_req = 7.5;
        formula = 't_min = 7.5 mm  <i>(Non-WT bulkhead, Sec 9)</i>';
        steps = [
          compOutboard ? `Adjacent: ${compOutboard.name} (${compOutboard.type}) — no fluid load` : `No compartment defined — void default`,
          `t_min = 7.5 mm`,
          `t_as-built = ${t.toFixed(1)} mm`
        ];
        compDesc = compOutboard ? `${compOutboard.name} (${compOutboard.type})` : '— none —';
      }
      
      // Combined status — local + HG + buckling
      // z_m for HG computation: use z_mid_m if available, else sample_z/1000
      const z_hg_m = z_mid_m != null ? z_mid_m : (sample_z / 1000);
      const combo = _platePassCombined(t, t_req, s_strake, z_hg_m, 'LONGITUDINAL', 'innerSide', IS_Y);
      
      return {
        title: opts.strakeName ? `Inner Side Strake — ${opts.strakeName}` : 'Inner Side Plate',
        subtitle: opts.strakeId 
          ? `${opts.strakeId} · ${region} · ${ruleRef}`
          : `Sec 9 — Table 1.9.1`,
        rule: (region === 'Tank' 
          ? 'LR Pt 4 Ch 1 Sec 9 — Table 1.9.1 (1) Deep Tank plate'
          : (region === 'Coaming' ? 'Pt 3 Ch 11' : 'Pt 4 Ch 1 Sec 9 (non-WT min)'))
          + ' + HG (Pt 3 Ch 4 Sec 5.7) + buckling (Sec 7)',
        required: t_req.toFixed(2) + ' mm',
        provided: t.toFixed(1) + ' mm',
        status: combo.overallStatus,
        statusNote: combo.note,
        statusCriteria: combo.criteria,
        pressure,
        formula,
        inputs: [
          opts.strakeId ? { label:'Strake', value: opts.strakeName || opts.strakeId } : null,
          { label:'Outboard compartment', value: compDesc || '— none —' },
          { label:'Region', value: region },
          z1_mm != null ? { label:'Z range', value: `${z1_mm} — ${z2_mm} mm AB` } : null,
          z_mid_m != null ? { label:'z_mid', value: `${z_mid_m.toFixed(2)} m AB` } : null,
          region === 'Tank' ? { label:'h_4 (m)', value: h_4.toFixed(2) } : null,
          region === 'Tank' ? { label:'ρ (t/m³)', value: rho.toFixed(3) } : null,
          region === 'Tank' ? { label:'f (slenderness)', value: f.toFixed(3) } : null,
          { label:'s_strake (mm)', value: s_strake.toFixed(0) + (opts.strakeId ? ' (strake-local)' : '') },
          { label:'l_e (m)', value: p.le.toFixed(2) },
          { label:'k', value: (p.k.toFixed ? p.k.toFixed(2) : p.k) },
          combo.hg.sigma_hg != null ? { label:'HG σ / σ_perm', value:`${combo.hg.sigma_hg.toFixed(1)} / ${combo.hg.sigma_perm.toFixed(0)} N/mm² (${combo.hg.ratio.toFixed(2)}) ${combo.hg.status === 'OK' ? '✓' : '✗'}` } : null,
          combo.bk.UC != null ? { label:'Buckling UC', value:`${combo.bk.UC.toFixed(2)} ${combo.bk.status === 'OK' ? '✓' : '✗'}` } : null,
        ].filter(Boolean),
        steps,
        notes: region === 'Tank'
          ? `Load source: "${compDesc}" — a ${compOutboard.type} tank. Delete this compartment from the Geometry editor to remove the tank load from this plate.`
          : (region === 'Void' 
              ? 'No fluid load — adjacent compartment is void or undefined. Add a Ballast tank in the Geometry editor to load this plate.'
              : 'Hatch coaming zone above Upper Deck — governed by Pt 3 Ch 11.')
      };
    }
    
    case 'long-is': {
      const p = getParams();
      const z_m = opts.z_m || 5;
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const IS_Y = G.IS || 10030;
      // Outboard compartment (on the ballast/wing side of IS wall)
      const compOutboard = (window.getCompartmentAt ? window.getCompartmentAt(IS_Y + 50, z_m * 1000) : null);
      
      let pressure = null, h_4 = 0, rho = 1.025, region = 'Void';
      const loadInputs = [];
      // Read the real IS strake spacing for this stiff's z (mirrors _zReqForStiff).
      let s_is = 650;
      try {
        const IS_strakes = window.Draw?.STRAKES?.innerSide || [];
        let cursor = G.IB || 1800;
        const z_mm = z_m * 1000;
        for (const st of IS_strakes) {
          if (z_mm >= cursor && z_mm <= cursor + st.width) {
            s_is = st.spacing_mm || s_is;
            break;
          }
          cursor += st.width;
        }
      } catch (_) {}
      
      if (compOutboard && (compOutboard.type === 'ballast' || compOutboard.type === 'fuel' || compOutboard.type === 'freshwater')) {
        region = 'Tank';
        rho = compOutboard.rho || 1.025;
        const bb = window._compartmentBoundingBox?.(compOutboard);
        const tank_top_mm = bb?.zMax ?? p.udLevel;
        const z_plate_mm = z_m * 1000;
        const airpipe_m = _resolveAirpipeTop_m(compOutboard, null);
        const pipe_mm = airpipe_m * 1000;
        // LR Tablo 1.9.1 (d) — design load head h₄ for stiffener
        const lr = _LR_h4(z_plate_mm, tank_top_mm, pipe_mm);
        h_4 = lr.h4;
        const P_kPa = 10.05 * h_4 * rho;
        // Test head per LR Pt 3 Ch 1 Tablo 1.9.1 — info only
        const th = _LR_testHead_above_TT(compOutboard, tank_top_mm, pipe_mm);
        const h_test_m = Math.max((tank_top_mm + th.h_test_m*1000 - z_plate_mm)/1000, 0.5);
        const P_test_kPa = 10.05 * h_test_m * rho;
        pressure = {
          head_m: h_4,
          kPa: P_kPa,
          note: `${compOutboard.name} (${compOutboard.type}) · LR h₄=${h_4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  [Tablo 1.9.1 (d): max(z_TT−z_mid=${lr.h_a.toFixed(2)}, (z_OF−z_mid)/2=${lr.h_b.toFixed(2)}, 0.5)]`
        };
        loadInputs.push({ label:'Compartment', value: `${compOutboard.name} (${compOutboard.type})` });
        loadInputs.push({ label:'ρ (t/m³)', value: rho.toString() });
        loadInputs.push({ label:'Airpipe top', value: `${pipe_mm.toFixed(0)} mm AB (${airpipe_m.toFixed(2)} m)` });
        loadInputs.push({ label:'Tank top', value: `${tank_top_mm} mm AB` });
        loadInputs.push({ label:'h₄ (LR design)', value: `${h_4.toFixed(2)} m → ${P_kPa.toFixed(1)} kPa  (governs: ${lr.governs})` });
        loadInputs.push({ label:'Test head (info)', value: `+${th.h_test_m.toFixed(2)} m above TT (governs: ${th.source}) → ${h_test_m.toFixed(2)} m at stiff → ${P_test_kPa.toFixed(1)} kPa` });
      } else {
        loadInputs.push({ label:'Compartment', value: compOutboard ? `${compOutboard.name} (${compOutboard.type})` : '— none —' });
      }
      
      // Resolve override-aware l_e for THIS stiff (mirrors _zReqForStiff so
      // the panel display matches the value used in the calc / FAIL-PASS).
      let le_panel_is = p.le;
      let le_overridden_is = false;
      if (opts && opts.index != null && typeof window._resolveStiffLe === 'function') {
        const over_is = window._resolveStiffLe('innerSide', opts.index, p.le);
        if (over_is.applied) { le_panel_is = over_is.le_m; le_overridden_is = true; }
      }
      // Compute Z_req
      const Z_req = region === 'Tank' ? (rho * s_is * p.k * h_4 * le_panel_is * le_panel_is / (22 * 1.4 * 4)) : 0;
      
      // === HULL GIRDER NORMAL STRESS AT IS LONG LEVEL (Pt 3 Ch 4 Sec 5.7) ===
      let hgBlock = null;
      let _ls_z_NA = null;
      try {
        const ls = runLongStrengthAnalysis();
        if (ls && ls.section && ls.section.I_NA > 0) {
          _ls_z_NA = ls.section.z_NA;
          const dz_m = z_m - ls.section.z_NA;
          const M_hog = Math.abs(ls.M_total_hog);
          const M_sag = Math.abs(ls.M_total_sag);
          const M_max = Math.max(M_hog, M_sag);
          const sigma_hg = Math.abs(M_max * dz_m / ls.section.I_NA) * 1e-3;
          const sigma_perm = ls.sigma_amid;
          hgBlock = {
            z_m, dz_m, sigma_hg, sigma_perm,
            ratio: sigma_hg / sigma_perm,
            pass: sigma_hg <= sigma_perm,
            M_max
          };
        }
      } catch (e) {}
      
      // Resolve selected profile for this specific stiffener
      const profInfo_is = _resolveStiffProfile(opts);
      const providedStr_is = profInfo_is 
        ? (profInfo_is.Z_cm3 != null 
            ? `${profInfo_is.name} · Z=${profInfo_is.Z_cm3.toFixed(1)} cm³${profInfo_is.isOverride ? ' (custom)' : ''}`
            : profInfo_is.name)
        : '(no profile selected)';
      // 3-criterion combined: Z_req + HG + column buckling
      const Z_sec_is = (profInfo_is && profInfo_is.Z_cm3 != null) ? profInfo_is.Z_cm3 : 0;
      const combo_is = _stiffPassCombined(Z_sec_is, Z_req, z_m, 'innerSide', opts?.index);
      const isStatus = (Z_req > 0 && Z_sec_is > 0) ? combo_is.overallStatus : 'INFO';
      // Provided: if resolve failed, show WHY on screen (for debugging).
      // Possible failure reasons:
      //   - no opts (e.g. showElemInspect called without index/group)
      //   - no stiff at that index (index out of range)
      //   - stiff has no profileName AND dropdown fallback also empty
      //   - profile name doesn't match any catalog entry
      //   - computeCombinedSection threw
      let provVal_is, provSub_is;
      if (profInfo_is && profInfo_is.Z_cm3 != null) {
        provVal_is = profInfo_is.Z_cm3.toFixed(1) + ' cm³';
        provSub_is = profInfo_is.name + (profInfo_is.isOverride ? ' (custom)' : '');
      } else if (profInfo_is) {
        // Name resolved but Z failed
        provVal_is = '—';
        provSub_is = profInfo_is.name + ' (Z calc failed)';
      } else {
        // Resolve returned null — investigate why and show it
        const D = window.Draw;
        const arr = D && D.profiles && D.profiles.innerSide;
        if (!opts || opts.index == null) {
          provVal_is = '—';
          provSub_is = '(no index in opts)';
        } else if (!arr) {
          provVal_is = '—';
          provSub_is = '(profiles.innerSide missing)';
        } else if (!arr[opts.index]) {
          provVal_is = '—';
          provSub_is = `(no stiff at index ${opts.index}, arr.length=${arr.length})`;
        } else {
          const s = arr[opts.index];
          const dd = document.getElementById('isLongProfile');
          provVal_is = '—';
          provSub_is = s.profileName
            ? `(name="${s.profileName}" not found in catalog)`
            : `(no profileName, dropdown="${dd?.value || ''}")`;
        }
      }
      return {
        title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
               ? window.resolveStiffDisplayName('innerSide', opts.index)
               : 'Inner Side Longitudinal',
        subtitle: `${region} · Table 1.9.1 (2) + Sec 5.7 hull girder`,
        rule: 'LR Pt 4 Ch 1 Sec 9 + Pt 3 Ch 4 Sec 5.7 + Sec 7 buckling',
        required: Z_req > 0 ? Z_req.toFixed(1) + ' cm³' : '—',
        provided: providedStr_is,
        providedValue: provVal_is,
        providedSub: provSub_is,
        status: isStatus,
        statusCriteria: (Z_req > 0 && Z_sec_is > 0) ? combo_is.criteria : null,
        statusNote: `z = ${z_m.toFixed(2)} m · Region: ${region}`
                 + (hgBlock ? ` · HG σ ${hgBlock.sigma_hg.toFixed(0)}/${hgBlock.sigma_perm.toFixed(0)} N/mm² ${hgBlock.pass?'✓':'✗'}` : ''),
        pressure,
        formula: 'Z = ρ·s·k·h_4·l_e² / (22·γ·(ω₁+ω₂+2))  <i>(Sec 9 local)</i><br>'
               + 'PLUS hull girder: σ = |M·Δz/I_NA| ≤ σ_perm  <i>(Sec 5.7)</i>',
        inputs: [
          ...loadInputs,
          { label:'z (m above BL)', value: z_m.toFixed(2) },
          { label:'h_4 (m)', value: h_4.toFixed(2) },
          { label:'s (mm)', value: s_is.toString() },
          { label:'γ (partial safety)', value: '1.4' },
          { label:'l_e (m)', value: le_panel_is.toFixed(2) + (le_overridden_is ? ' ⚠ override' : '') },
          { label:'k', value: p.k },
          hgBlock ? { label:'Hull girder σ', value: `${hgBlock.sigma_hg.toFixed(1)} / ${hgBlock.sigma_perm.toFixed(0)} N/mm² (${hgBlock.ratio.toFixed(2)})` } : null
        ].filter(Boolean),
        steps: hgBlock ? [
          `── Local Bending (Sec 9) ──`,
          region === 'Tank' 
            ? `Z_req = ρ·s·k·h_4·l_e² / (22·γ·4) = ${Z_req.toFixed(1)} cm³` + (le_overridden_is ? `  [l_e=${le_panel_is.toFixed(2)} m, every-4th-frame override]` : '')
            : `No tank load (${region} zone)`,
          ``,
          `── Hull Girder (Pt 3 Ch 4 Sec 5.7) ──`,
          `z = ${z_m.toFixed(2)} m · z_NA = ${_ls_z_NA?.toFixed(2) || '—'} m · Δz = ${hgBlock.dz_m.toFixed(2)} m`,
          `M_total_max = ${hgBlock.M_max.toFixed(0)} kN·m`,
          `σ_hg = |M · Δz / I_NA| × 10⁻³ = ${hgBlock.sigma_hg.toFixed(1)} N/mm²`,
          `σ_perm = 175/kL = ${hgBlock.sigma_perm.toFixed(1)} N/mm²`,
          `Ratio = ${hgBlock.ratio.toFixed(3)} ${hgBlock.pass ? '✓ OK' : '✗ FAIL'}`,
        ] : [],
        notes: compOutboard && region === 'Tank'
          ? `Load sources: "${compOutboard.name}" tank (local) + hull girder global bending. Both checked.`
          : 'No tank compartment adjacent. Hull girder global stress still checked.'
      };
    }
    
    case 'long-str':
    case 'long-twn':
    case 'long-ud': {
      const which = elemType === 'long-ud' ? 'ud' : (elemType === 'long-str' ? 'str' : 'twn');
      // Resolve this stiff's mean tributary spacing for the inspector (so
      // displayed s + Z_req match the value actually used for this stiff,
      // not the group max-gap).
      const _grpKey = which === 'ud' ? 'upperDeck' : (which === 'str' ? 'stringerStiff' : 'tweenStiff');
      const _D = window.Draw;
      const _arr = _D?.profiles?.[_grpKey];
      const _stiff = (_arr && opts && opts.index != null) ? _arr[opts.index] : null;
      let _sMean = null;
      if (_stiff) {
        try { _zReqForStiff(_grpKey, _stiff); _sMean = _stiff._s_mean_mm; } catch(_) {}
      }
      // Resolve override-aware l_e for this deck stiff (matches _zReqForStiff
      // so panel display equals the value used by the actual Z_req calc).
      // For stringerStiff/tweenStiff: pass plateZ from opts so the right
      // stringer plate is used (variant 2A has 3 stringers at different z).
      const _baseLe = parseFloat(document.getElementById('le')?.value) || 1.5;
      let _leDeck = _baseLe;
      let _leDeckOver = false;
      if (opts && opts.index != null && typeof window._resolveStiffLe === 'function') {
        const _resolveOpts = (opts.plateZ != null && isFinite(+opts.plateZ))
          ? { plateZ: +opts.plateZ }
          : undefined;
        const _o = window._resolveStiffLe(_grpKey, opts.index, _baseLe, _resolveOpts);
        if (_o.applied) { _leDeck = _o.le_m; _leDeckOver = true; }
      }
      const _wrap = (fn) => {
        let inner = fn;
        if (_leDeckOver && typeof withLocalLe === 'function') {
          const f0 = inner;
          inner = () => withLocalLe(_leDeck, f0);
        }
        if (_sMean && _sMean > 0 && typeof withLocalSpacing === 'function') {
          const f0 = inner;
          inner = () => withLocalSpacing(_sMean, f0);
        }
        return inner();
      };
      if (which === 'ud' && typeof calcUpperDeckLong === 'function') {
        const udL = _wrap(() => calcUpperDeckLong());
        const profName = _stiffProfileName('upperDeck', 'deckLongProfile');
        const sec = profName ? sectionZWithPlate(profName, num('deckLongSpacing'), num('deckT'), _stiff) : { Z_min:0 };
        const G_ud = (window.Draw && window.Draw.GEOMETRY) || {};
        const z_ud_m = (G_ud.UD || 15300) / 1000;
        const combo_ud = _stiffPassCombined(sec.Z_min, udL.Z_req, z_ud_m, 'upperDeck', opts?.index);
        return {
          title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
                 ? window.resolveStiffDisplayName('upperDeck', opts.index)
                 : 'Upper Deck Longitudinal',
          subtitle: 'Sec 4 — Table 1.4.3',
          rule: 'LR Pt 4 Ch 1 Sec 4 + Sec 5.7 HG + Sec 7 buckling',
          required: udL.Z_req.toFixed(1) + ' cm³',
          provided: sec.Z_min.toFixed(1) + ' cm³',
        providedValue: sec.Z_min.toFixed(1) + ' cm³',
        providedSub: profName || '—',
          status: combo_ud.overallStatus,
          statusCriteria: combo_ud.criteria,
          statusNote: `Profile: ${profName}`,
          formula: udL.formula || 'per Table 1.4.3',
          inputs: udL.inputs || [],
          steps: udL.steps || []
        };
      }
      // stringer / tween
      if (typeof calcLowerDeckLong === 'function') {
        const dL = _wrap(() => calcLowerDeckLong(which));
        const id = which === 'str' ? 'strDeckProfile' : 'twnDeckProfile';
        const spId = which === 'str' ? 'strDeckSpacing' : 'twnDeckSpacing';
        const tId  = which === 'str' ? 'strDeckT' : 'twnDeckT';
        const grp  = which === 'str' ? 'stringerStiff' : 'tweenStiff';
        const profName = _stiffProfileName(grp, id);
        const sec = profName ? sectionZWithPlate(profName, num(spId), num(tId), _stiff) : { Z_min:0 };
        const Zreq = dL.Z_req || 0;
        // z of this deck
        const z_deck_m = which === 'str'
          ? (parseFloat(document.getElementById('strDeckZ')?.value || 8590) / 1000)
          : (parseFloat(document.getElementById('twnDeckZ')?.value || 12900) / 1000);
        const combo_d = (Zreq > 0 && sec.Z_min > 0)
          ? _stiffPassCombined(sec.Z_min, Zreq, z_deck_m, grp, opts?.index)
          : null;
        const status = combo_d ? combo_d.overallStatus : 'INFO';
        return {
          title: (typeof window.resolveStiffDisplayName === 'function' && opts && opts.index != null)
                 ? window.resolveStiffDisplayName(which === 'str' ? 'stringerStiff' : 'tweenStiff', opts.index)
                 : (which === 'str' ? 'Stringer Deck Longitudinal' : 'Tween Deck Longitudinal'),
          subtitle: dL.fn === 'deep_tank' ? 'Table 1.9.1 DT Long' : (dL.fn === 'void' ? 'Sec 9 min (void)' : 'Table 1.4.3'),
          rule: (dL.fn === 'deep_tank' ? 'LR Pt 4 Ch 1 Sec 9' : 'LR Pt 4 Ch 1 Sec 4') + ' + HG + Sec 7 buckling',
          required: Zreq > 0 ? Zreq.toFixed(1) + ' cm³' : '(no load case)',
          provided: sec.Z_min.toFixed(1) + ' cm³',
        providedValue: sec.Z_min.toFixed(1) + ' cm³',
        providedSub: profName || '—',
          status,
          statusCriteria: combo_d ? combo_d.criteria : null,
          statusNote: `Profile: ${profName || '—'} · Function: ${dL.fn || 'void'}`,
          formula: dL.formula || 'per table / void min',
          inputs: dL.inputs || [],
          steps: dL.steps || []
        };
      }
      return { title: 'Deck Long', subtitle: which, status:'INFO' };
    }
    
    case 'db-floor-wt':
    case 'db-floor-nwt':
    case 'db-cg':
    case 'db-bracket':
    case 'db-duct': {
      // Pull row from calcDB
      const rows = calcDB();
      const map = {
        'db-floor-wt':   r => r.elem && r.elem.includes('Floor (WT)'),
        'db-floor-nwt':  r => r.elem && r.elem.includes('Floor (non-WT)'),
        'db-cg':         r => r.elem && r.elem.includes('Centre Girder'),
        'db-bracket':    r => r.elem && r.elem.includes('Bracket'),
        'db-duct':       r => r.elem && r.elem.includes('Duct')
      };
      const r = rows.find(map[elemType]);
      if (!r) return { title: elemType, subtitle:'—', status:'INFO', notes:'No matching DB row found.' };
      return {
        title: r.elem,
        subtitle: r.rule,
        rule: r.rule,
        required: (typeof r.t_req === 'number' ? r.t_req.toFixed(2) : r.t_req) + ' ' + (r.unit || ''),
        provided: r.t + ' ' + (r.unit || ''),
        status: r.status,
        statusNote: r.note || '',
        formula: r.formula || '—',
        notes: r.note
      };
    }
    
    default:
      return {
        title: 'Unknown element',
        subtitle: elemType,
        status: 'INFO',
        notes: 'No rule mapping for this element yet.'
      };
  }
}

window.toggleAnalysisMode = toggleAnalysisMode;
window.showElemInspect = showElemInspect;
window.closeElemInspect = closeElemInspect;
window._computeElemInspect = _computeElemInspect;   // for debugging

// ═════════════════════════════════════════════════════════════════════════
// DETAILED SUMMARY — Page 4 (May 2026)
// ─────────────────────────────────────────────────────────────────────────
// Walks every plate strake and every longitudinal stiffener, calling
// _computeElemInspect for each one, and fills the three tables on the
// Summary page:
//   1) #detailedHullGirderBody  — Z_B / Z_D / I_NA required vs provided
//   2) #detailedPlatesBody      — every strake: t_req, t_prov, Local, HG, Buckling
//   3) #detailedStiffBody       — every longitudinal: Z_req, Z_sec, Local, HG, Buckling
//
// Called from the end of recalcAll(). Best-effort — wraps every per-element
// call in try/catch so one broken element does not blank the whole table.
// ═════════════════════════════════════════════════════════════════════════
function renderDetailedSummary() {
  const D = window.Draw;
  if (!D || !D.STRAKES || !D.profiles) return;
  const STR = D.STRAKES;
  const PR  = D.profiles;
  const G   = D.GEOMETRY || {};

  // ── Helper: status pill HTML for a single criterion ─────────────────
  const pill = (status, label, value) => {
    const color = (status === 'OK')   ? 'var(--success)'
                : (status === 'FAIL') ? 'var(--error)'
                                       : 'var(--text-muted)';
    const bg = (status === 'OK')   ? 'rgba(34,197,94,0.10)'
             : (status === 'FAIL') ? 'rgba(239,68,68,0.12)'
                                    : 'var(--bg-tertiary)';
    const tip = label ? ` title="${label}"` : '';
    return `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 7px;background:${bg};color:${color};border-radius:10px;font-family:var(--font-mono);font-size:0.68rem;font-weight:600"${tip}>${value || (status === 'OK' ? '✓' : status === 'FAIL' ? '✗' : '—')}</span>`;
  };

  // ── Helper: pick the matching criterion by label substring ──────────
  const findCrit = (criteria, labelMatch) => {
    if (!Array.isArray(criteria)) return null;
    return criteria.find(c => c && c.label && c.label.toLowerCase().includes(labelMatch)) || null;
  };

  // ── Helper: small ✓/✗ overall badge ─────────────────────────────────
  const overallBadge = (status) => {
    if (status === 'OK')   return `<span style="color:var(--success);font-weight:700">✓ PASS</span>`;
    if (status === 'FAIL') return `<span style="color:var(--error);font-weight:700">✗ FAIL</span>`;
    return `<span style="color:var(--text-muted)">—</span>`;
  };

  // ── Helper: tile out a row in the plates / stiff tables ─────────────
  const formatPlateRow = (label, rule, t_req, t_prov, data) => {
    const crits = (data && data.statusCriteria) || [];
    const localC = findCrit(crits, 'local');
    const hgC    = findCrit(crits, 'hull');
    const bkC    = findCrit(crits, 'buckl');
    return `
      <tr>
        <td><strong>${label}</strong></td>
        <td style="font-family:var(--font-mono);font-size:0.68rem;color:var(--text-muted)">${rule || '—'}</td>
        <td style="font-family:var(--font-mono)">${t_req || '—'}</td>
        <td style="font-family:var(--font-mono);color:var(--cyan)">${t_prov || '—'}</td>
        <td>${localC ? pill(localC.status, 'Local: ' + localC.value, localC.value) : pill('—')}</td>
        <td>${hgC    ? pill(hgC.status,    'Hull girder: ' + hgC.value, hgC.value)    : pill('—')}</td>
        <td>${bkC    ? pill(bkC.status,    'Buckling: ' + bkC.value, bkC.value)       : pill('—')}</td>
        <td>${overallBadge(data && data.status)}</td>
      </tr>`;
  };
  const formatStiffRow = (label, profile, z_mm, s_mm, Z_req, Z_sec, data) => {
    const crits = (data && data.statusCriteria) || [];
    const localC = findCrit(crits, 'local');
    const hgC    = findCrit(crits, 'hull');
    const bkC    = findCrit(crits, 'buckl');
    return `
      <tr>
        <td><strong>${label}</strong></td>
        <td style="font-family:var(--font-mono);font-size:0.7rem">${profile || '—'}</td>
        <td style="font-family:var(--font-mono);font-size:0.7rem">${z_mm != null ? z_mm.toFixed(0) : '—'}</td>
        <td style="font-family:var(--font-mono);font-size:0.7rem">${s_mm != null ? s_mm.toFixed(0) : '—'}</td>
        <td style="font-family:var(--font-mono)">${Z_req || '—'}</td>
        <td style="font-family:var(--font-mono);color:var(--cyan)">${Z_sec || '—'}</td>
        <td>${localC ? pill(localC.status, 'Local: ' + localC.value, localC.value) : pill('—')}</td>
        <td>${hgC    ? pill(hgC.status,    'Hull girder: ' + hgC.value, hgC.value)    : pill('—')}</td>
        <td>${bkC    ? pill(bkC.status,    'Buckling: ' + bkC.value, bkC.value)       : pill('—')}</td>
        <td>${overallBadge(data && data.status)}</td>
      </tr>`;
  };

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1 — Hull Girder Section Properties (required vs provided)
  // ═══════════════════════════════════════════════════════════════════
  try {
    const ls = (typeof window.runLongStrengthAnalysis === 'function')
               ? window.runLongStrengthAnalysis() : null;
    const hgBody = document.getElementById('detailedHullGirderBody');
    if (hgBody && ls && ls.section) {
      const sec = ls.section;
      const Z_min_m3 = ls.Z_min;   // m³ required (LR Sec 5.4.1)
      const I_min_m4 = ls.I_min;   // m⁴ required (LR Sec 5.8.1)
      const Z_B = sec.Z_B;         // m³ provided to bottom fibre
      const Z_D = sec.Z_D;         // m³ provided to deck fibre
      const I_NA = sec.I_NA;       // m⁴ provided
      const z_NA = sec.z_NA;       // m, above baseline

      const rowZ = (label, req, prov, unit, status) => {
        const ratio = req > 0 ? (prov / req) : 0;
        const okPill = status === 'OK' ? `<span style="color:var(--success);font-weight:700">✓ PASS</span>`
                                       : `<span style="color:var(--error);font-weight:700">✗ FAIL</span>`;
        return `
          <tr>
            <td><strong>${label}</strong></td>
            <td style="font-family:var(--font-mono)">${req.toFixed(2)} ${unit}</td>
            <td style="font-family:var(--font-mono);color:var(--cyan)">${prov.toFixed(2)} ${unit}</td>
            <td style="font-family:var(--font-mono)">${ratio.toFixed(3)}</td>
            <td>${okPill}</td>
            <td style="color:var(--text-muted);font-size:0.7rem">${
              label === 'Z_B' ? 'I_NA / z_NA (NA → bottom fibre)' :
              label === 'Z_D' ? `I_NA / (D − z_NA)  (NA → deck fibre, z_NA = ${z_NA.toFixed(2)} m)` :
                                 'LR Pt 3 Ch 4 Sec 5.8.1 — gross transverse moment of inertia'
            }</td>
          </tr>`;
      };
      let hgRows = '';
      hgRows += rowZ('Z_B', Z_min_m3, Z_B, 'm³', (Z_B >= Z_min_m3 ? 'OK' : 'FAIL'));
      hgRows += rowZ('Z_D', Z_min_m3, Z_D, 'm³', (Z_D >= Z_min_m3 ? 'OK' : 'FAIL'));
      hgRows += rowZ('I_NA', I_min_m4, I_NA, 'm⁴', (I_NA >= I_min_m4 ? 'OK' : 'FAIL'));
      // Extra info row — NA + σ_perm
      hgRows += `
        <tr>
          <td style="color:var(--text-muted)">NA / σ_perm</td>
          <td colspan="5" style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-muted)">
            z_NA = ${z_NA.toFixed(3)} m above BL  ·
            σ_perm = ${ls.sigma_amid.toFixed(1)} N/mm²  ·
            M_total_hog = ${(Math.abs(ls.M_total_hog)/1000).toFixed(0)} MN·m  ·
            M_total_sag = ${(Math.abs(ls.M_total_sag)/1000).toFixed(0)} MN·m
          </td>
        </tr>`;
      hgBody.innerHTML = hgRows;
    } else if (hgBody) {
      hgBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:12px">Section properties not yet computed. Visit Geometry page first.</td></tr>`;
    }
  } catch (e) {
    console.warn('[renderDetailedSummary] hull girder section failed:', e);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2 — Plates / Strakes table
  // ═══════════════════════════════════════════════════════════════════
  // Build a list of every plate strake in the section, with its elemType
  // and identifying opts. Walks STRAKES + POSITION_RULES to resolve type.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const platesBody = document.getElementById('detailedPlatesBody');
    if (!platesBody) return;
    const rows = [];

    // ── Helper to call inspector and append a plate row ──────────────
    const addPlateRow = (label, rule, elemType, opts, t_provided) => {
      try {
        const data = _computeElemInspect(elemType, opts);
        if (!data) {
          rows.push(formatPlateRow(label, rule, '—', t_provided != null ? t_provided.toFixed(1) + ' mm' : '—', null));
          return;
        }
        const t_req  = data.required || '—';
        const t_prov = (t_provided != null) ? t_provided.toFixed(1) + ' mm' : (data.provided || '—');
        rows.push(formatPlateRow(label, data.rule || rule, t_req, t_prov, data));
      } catch (e) {
        rows.push(formatPlateRow(label, rule, '—', t_provided != null ? t_provided.toFixed(1) + ' mm' : '—', null));
      }
    };

    // ── Helper: human label for a shell strake by kind + index ───────
    const shellLabel = (kind, idx, total_of_kind) => {
      if (kind === 'keel')   return `Keel Strake (K01)`;
      if (kind === 'bottom') return `Bottom Strake #${idx + 1}`;
      if (kind === 'bilge')  return `Bilge Strake`;
      if (kind === 'side')   return `Side Shell Strake #${idx + 1}`;
      return `Shell Strake #${idx + 1}`;
    };
    const shellElemType = (kind) => {
      if (kind === 'keel')  return 'plate-keel';
      if (kind === 'bilge' || kind === 'bottom') return 'plate-bottom';
      if (kind === 'side')  return 'plate-side';
      return 'plate-bottom';
    };

    // ── (a) SHELL strakes ────────────────────────────────────────────
    if (Array.isArray(STR.shell)) {
      const kindCounts = {};
      STR.shell.forEach((s, idx) => {
        const kind = s.kind || 'bottom';
        kindCounts[kind] = (kindCounts[kind] || 0) + 1;
        const localIdx = kindCounts[kind] - 1;
        const label = shellLabel(kind, localIdx, kindCounts[kind]);
        const eType = shellElemType(kind);
        addPlateRow(label, 'LR Pt 3 Ch 6', eType, {
          strakeIdx: idx, strakeId: s.id || `Shell-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: kind, plateKey: 'shell',
        }, s.thickness);
      });
    }

    // ── (b) INNER BOTTOM strakes ─────────────────────────────────────
    if (Array.isArray(STR.innerBottom)) {
      STR.innerBottom.forEach((s, idx) => {
        const label = `Inner Bottom Strake #${idx + 1}`;
        addPlateRow(label, 'LR Pt 4 Ch 1 Sec 8.4', 'plate-ib', {
          strakeIdx: idx, strakeId: s.id || `IB-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: s.kind, plateKey: 'innerBottom',
        }, s.thickness);
      });
    }

    // ── (c) INNER SIDE strakes ───────────────────────────────────────
    if (Array.isArray(STR.innerSide)) {
      STR.innerSide.forEach((s, idx) => {
        const label = `Inner Side Strake #${idx + 1}`;
        addPlateRow(label, 'LR Table 1.9.1', 'plate-is', {
          strakeIdx: idx, strakeId: s.id || `IS-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: s.kind, plateKey: 'innerSide',
        }, s.thickness);
      });
    }

    // ── (d) UPPER DECK strakes ───────────────────────────────────────
    if (Array.isArray(STR.upperDeck)) {
      STR.upperDeck.forEach((s, idx) => {
        const label = STR.upperDeck.length > 1 ? `Upper Deck Strake #${idx + 1}` : `Upper Deck`;
        addPlateRow(label, 'LR Pt 4 Ch 1 Sec 7', 'plate-ud', {
          strakeIdx: idx, strakeId: s.id || `UD-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: 'upperDeck', plateKey: 'upperDeck',
        }, s.thickness);
      });
    }

    // ── (e) COAMING TOP strakes ──────────────────────────────────────
    if (Array.isArray(STR.coamingTop)) {
      STR.coamingTop.forEach((s, idx) => {
        const label = STR.coamingTop.length > 1 ? `Coaming Top Strake #${idx + 1}` : `Coaming Top`;
        addPlateRow(label, 'LR Pt 3 Ch 11', 'plate-coaming', {
          strakeIdx: idx, strakeId: s.id || `CT-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: 'coamingTop', plateKey: 'coamingTop',
        }, s.thickness);
      });
    }

    // ── (f) STRINGER DECK strakes (per-level: stringer0/1/2…) ────────
    Object.keys(STR).sort().forEach(key => {
      const m = key.match(/^stringer(\d+)$/);
      if (!m) return;
      const levelIdx = parseInt(m[1]);
      const z = (PR.stringer && PR.stringer[levelIdx]) ? PR.stringer[levelIdx].z : null;
      STR[key].forEach((s, idx) => {
        const zLabel = z != null ? ` @ z=${z} mm` : '';
        const label = STR[key].length > 1
          ? `Stringer Deck #${levelIdx + 1}${zLabel} Strake #${idx + 1}`
          : `Stringer Deck #${levelIdx + 1}${zLabel}`;
        addPlateRow(label, 'LR Pt 4 Ch 1 Sec 4', 'plate-str', {
          strakeIdx: idx, strakeId: s.id || `SD${levelIdx+1}-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: 'stringer', plateKey: key,
        }, s.thickness);
      });
    });

    // ── (g) TWEEN DECK strakes (per-level: tween0/1…) ────────────────
    Object.keys(STR).sort().forEach(key => {
      const m = key.match(/^tween(\d+)$/);
      if (!m) return;
      const levelIdx = parseInt(m[1]);
      const z = (PR.tweenDeck && PR.tweenDeck[levelIdx]) ? PR.tweenDeck[levelIdx].z : null;
      STR[key].forEach((s, idx) => {
        const zLabel = z != null ? ` @ z=${z} mm` : '';
        const label = STR[key].length > 1
          ? `Tween Deck #${levelIdx + 1}${zLabel} Strake #${idx + 1}`
          : `Tween Deck${zLabel}`;
        addPlateRow(label, 'LR Pt 4 Ch 1 Sec 4', 'plate-twn', {
          strakeIdx: idx, strakeId: s.id || `TD${levelIdx+1}-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: 'tween', plateKey: key,
        }, s.thickness);
      });
    });

    // ── (h) SIDE GIRDER strakes (per-girder: sideGirder0/1/2) ────────
    [0, 1, 2].forEach(gIdx => {
      const key = 'sideGirder' + gIdx;
      if (!Array.isArray(STR[key])) return;
      const sgY = (window.SIDE_GIRDERS && window.SIDE_GIRDERS[gIdx]) ? window.SIDE_GIRDERS[gIdx].y
                : (D.SIDE_GIRDERS && D.SIDE_GIRDERS[gIdx]) ? D.SIDE_GIRDERS[gIdx].y : null;
      STR[key].forEach((s, idx) => {
        const yLabel = sgY != null ? ` @ Y=${sgY} mm` : '';
        const label = STR[key].length > 1
          ? `Side Girder #${gIdx + 1}${yLabel} Strake #${idx + 1}`
          : `Side Girder #${gIdx + 1}${yLabel}`;
        addPlateRow(label, 'LR Pt 4 Ch 1 Sec 8.3.5', 'plate-sidegirder', {
          strakeIdx: idx, strakeId: s.id || `SG${gIdx+1}-${idx+1}`, strakeName: label,
          strakeSpacing: s.spacing_mm, strakeThickness: s.thickness,
          strakeWidth: s.width, strakeKind: 'sideGirder', plateKey: key,
        }, s.thickness);
      });
    });

    // ── (i) DUCT KEEL WALL — single plate, no strake list ────────────
    try {
      const t_duct = (window.PLATE_THICKNESS && window.PLATE_THICKNESS.duct)
                  || (D.PLATE_THICKNESS && D.PLATE_THICKNESS.duct) || null;
      addPlateRow('Duct Keel Side Plate', 'LR Pt 4 Ch 1 Sec 8.3.8',
                  'plate-duct', { plateKey: 'duct' }, t_duct);
    } catch (_) {}

    platesBody.innerHTML = rows.join('') || `<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:12px">No plate strakes found.</td></tr>`;
  } catch (e) {
    console.warn('[renderDetailedSummary] plates section failed:', e);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3 — Longitudinal Stiffeners table
  // ═══════════════════════════════════════════════════════════════════
  // Walks profiles.{bottomShell, innerBottom, sideShell, innerSide,
  // stringerStiff (per stringer plate), tweenStiff (per tween plate),
  // upperDeck, coamingStiff, sideGirder0/1/2} and calls _computeElemInspect
  // for each. Each row shows profile name, z, s, Z_req, Z_sec + 3 badges.
  // ═══════════════════════════════════════════════════════════════════
  try {
    const stiffBody = document.getElementById('detailedStiffBody');
    if (!stiffBody) return;
    const rows = [];

    const addStiffRow = (label, group, idx, elemType, z_mm_override) => {
      try {
        const profile = (PR[group] && PR[group][idx]) ? PR[group][idx] : null;
        const profileName = profile?.profileName || '(default)';
        const z_mm = z_mm_override != null ? z_mm_override : profile?.z;
        const z_m  = (z_mm != null) ? z_mm / 1000 : undefined;
        const data = _computeElemInspect(elemType, { index: idx, group, z_m });
        if (!data) {
          rows.push(formatStiffRow(label, profileName, z_mm, null, '—', '—', null));
          return;
        }
        // Spacing — try several common locations on the data object
        let s_mm = null;
        try {
          if (data.spacing_mm != null) s_mm = data.spacing_mm;
          else if (data.inputs) {
            const sEntry = data.inputs.find(x => x && /s\s*\(/i.test(x.label || ''));
            if (sEntry) {
              const v = parseFloat(String(sEntry.value).replace(/[^\d.\-]/g, ''));
              if (!isNaN(v)) s_mm = v;
            }
          }
        } catch (_) {}
        rows.push(formatStiffRow(label, profileName, z_mm, s_mm,
                                  data.required, data.provided, data));
      } catch (e) {
        rows.push(formatStiffRow(label, '—', null, null, '—', '—', null));
      }
    };

    // ── (a) BOTTOM SHELL longitudinals ───────────────────────────────
    if (Array.isArray(PR.bottomShell)) {
      PR.bottomShell.forEach((p, idx) => {
        const label = `Bottom Shell Long. #${idx + 1}` + (p.y != null ? ` @ y=${p.y} mm` : '');
        addStiffRow(label, 'bottomShell', idx, 'long-bottom', 0);
      });
    }
    // ── (b) INNER BOTTOM longitudinals ───────────────────────────────
    if (Array.isArray(PR.innerBottom)) {
      PR.innerBottom.forEach((p, idx) => {
        const label = `Inner Bottom Long. #${idx + 1}` + (p.y != null ? ` @ y=${p.y} mm` : '');
        addStiffRow(label, 'innerBottom', idx, 'long-ib', G.IB);
      });
    }
    // ── (c) SIDE SHELL longitudinals (including ice intermediates) ───
    if (Array.isArray(PR.sideShell)) {
      PR.sideShell.forEach((p, idx) => {
        const iceTag = p.ice ? ' (ice)' : '';
        const label = `Side Shell Long. #${idx + 1} @ z=${p.z} mm${iceTag}`;
        addStiffRow(label, 'sideShell', idx, 'long-side', p.z);
      });
    }
    // ── (d) INNER SIDE longitudinals ─────────────────────────────────
    if (Array.isArray(PR.innerSide)) {
      PR.innerSide.forEach((p, idx) => {
        const label = `Inner Side Long. #${idx + 1} @ z=${p.z} mm`;
        addStiffRow(label, 'innerSide', idx, 'long-is', p.z);
      });
    }
    // ── (e) STRINGER stiffeners — same y-list replayed per level ─────
    if (Array.isArray(PR.stringer) && Array.isArray(PR.stringerStiff)) {
      PR.stringer.forEach((plate, lvlIdx) => {
        if (plate.z == null || plate.z <= G.IB || plate.z >= G.UD) return;
        PR.stringerStiff.forEach((p, stIdx) => {
          const label = `Stringer Deck #${lvlIdx + 1} Stiff. @ y=${p.y} mm (z=${plate.z})`;
          addStiffRow(label, 'stringerStiff', stIdx, 'long-str', plate.z);
        });
      });
    }
    // ── (f) TWEEN stiffeners — per tween level ───────────────────────
    if (Array.isArray(PR.tweenDeck) && Array.isArray(PR.tweenStiff)) {
      PR.tweenDeck.forEach((plate, lvlIdx) => {
        if (plate.z == null || plate.z <= G.IB || plate.z >= G.UD) return;
        PR.tweenStiff.forEach((p, stIdx) => {
          const label = `Tween Deck #${lvlIdx + 1} Stiff. @ y=${p.y} mm (z=${plate.z})`;
          addStiffRow(label, 'tweenStiff', stIdx, 'long-twn', plate.z);
        });
      });
    }
    // ── (g) UPPER DECK longitudinals ─────────────────────────────────
    if (Array.isArray(PR.upperDeck)) {
      PR.upperDeck.forEach((p, idx) => {
        const label = `Upper Deck Long. #${idx + 1}` + (p.y != null ? ` @ y=${p.y} mm` : '');
        addStiffRow(label, 'upperDeck', idx, 'long-ud', G.UD);
      });
    }
    // ── (h) COAMING TOP stiffeners ───────────────────────────────────
    if (Array.isArray(PR.coamingStiff)) {
      PR.coamingStiff.forEach((p, idx) => {
        const label = `Coaming Top Stiff. #${idx + 1}` + (p.y != null ? ` @ y=${p.y} mm` : '');
        addStiffRow(label, 'coamingStiff', idx, 'long-coaming', G.HC);
      });
    }
    // ── (i) SIDE GIRDER longitudinal intercostals (sideGirder0/1/2) ──
    [0, 1, 2].forEach(gIdx => {
      const group = 'sideGirder' + gIdx;
      if (!Array.isArray(PR[group])) return;
      PR[group].forEach((p, idx) => {
        const label = `Side Girder #${gIdx + 1} Long. #${idx + 1}` + (p.z != null ? ` @ z=${p.z} mm` : '');
        addStiffRow(label, group, idx, 'long-sidegirder', p.z);
      });
    });

    stiffBody.innerHTML = rows.join('') || `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:12px">No longitudinal stiffeners found.</td></tr>`;
  } catch (e) {
    console.warn('[renderDetailedSummary] stiffeners section failed:', e);
  }
}
window.renderDetailedSummary = renderDetailedSummary;

// Expose _elemZm as a helper that showElemInspect can use to inject HG stress
// into every element's inspection panel. Walks the same logic as _elemZm inside
// _computeElemInspect (kept in sync by mirroring here).
window._elemZm_inspect = function(eType, eOpts) {
  try {
    const p = getParams();
    const G = (window.Draw && window.Draw.GEOMETRY) || {};
    eOpts = eOpts || {};
    switch (eType) {
      case 'plate-bottom': case 'plate-keel':
      case 'long-bottom':
        return 0;
      case 'plate-ib': case 'long-ib':
        return p.ibLevel / 1000;
      case 'plate-ud': case 'long-ud':
        return p.udLevel / 1000;
      case 'plate-str': case 'long-str': {
        const z = parseFloat(document.getElementById('strDeckZ')?.value || 8590);
        return z / 1000;
      }
      case 'plate-twn': case 'long-twn': {
        const z = parseFloat(document.getElementById('twnDeckZ')?.value || 12900);
        return z / 1000;
      }
      case 'plate-coaming': case 'long-coaming':
        return p.hcLevel / 1000;
      case 'plate-is': {
        const idx = eOpts.strakeIdx;
        if (idx != null && window.Draw?.STRAKES?.innerSide) {
          const strakes = window.Draw.STRAKES.innerSide;
          let z_mm = G.IB || 1800;
          for (let i = 0; i <= idx && i < strakes.length; i++) {
            if (i < idx) z_mm += strakes[i].width;
            else z_mm += strakes[i].width / 2;
          }
          return z_mm / 1000;
        }
        return eOpts.z_m || ((G.IB + G.UD) / 2000);
      }
      case 'plate-side': {
        const idx = eOpts.strakeIdx;
        if (idx != null && window.Draw?.STRAKES?.shell) {
          const shell = window.Draw.STRAKES.shell;
          // Shell strakes in order: keel, bottom, bilge, side-1, side-2, ...
          // Accumulate arc-length, estimate z.
          // For the first N strakes that are bottom/keel, z ≈ 0
          // Then bilge strakes rise along arc
          // Then side strakes rise linearly
          const R_B = G.R_B || 1800;
          let s_cum = 0;
          for (let i = 0; i < idx && i < shell.length; i++) s_cum += shell[i].width;
          s_cum += (shell[idx]?.width || 0) / 2;
          // Decompose: is s_cum still in keel+bottom, bilge, or side?
          // Flat bottom width = B_half − R_B (from CL to where bilge radius starts).
          // Was previously hardcoded to 10030 mm; that only matched for one specific
          // ship and drifted as B changed.
          const keelBottomLen = Math.max(0, (G.B_half || 11880) - R_B);
          const bilgeLen = Math.PI / 2 * R_B;
          if (s_cum <= keelBottomLen) return 0;
          if (s_cum <= keelBottomLen + bilgeLen) {
            const t = (s_cum - keelBottomLen) / bilgeLen;
            const angle = t * Math.PI / 2;
            return (R_B * (1 - Math.cos(angle))) / 1000;
          }
          const side_s = s_cum - keelBottomLen - bilgeLen;
          return (R_B + side_s) / 1000;
        }
        return eOpts.z_m || 5;
      }
      case 'long-is': case 'long-side': {
        // Prefer z_m from opts (passed by inspector). If missing, derive
        // from the actual stiff's z position rather than defaulting to 5 m.
        if (eOpts.z_m != null) return eOpts.z_m;
        const grp = eType === 'long-is' ? 'innerSide' : 'sideShell';
        const stiffs = window.Draw?.profiles?.[grp] || [];
        const idx = eOpts.index;
        if (idx != null && stiffs[idx] && stiffs[idx].z != null) {
          return stiffs[idx].z / 1000;
        }
        return 5;
      }
      // v80: vertical DB-internal plates — centroid at IB/2 for HG calc
      case 'plate-duct': case 'plate-sidegirder':
        return (p.ibLevel / 2) / 1000;
      case 'db-floor-wt': case 'db-floor-nwt':
      case 'db-cg': case 'db-bracket': case 'db-duct':
      case 'hull-girder': case 'hull-girder-Z': case 'hull-girder-I':
        return null;
      default:
        return null;
    }
  } catch (e) { return null; }
};

// Short label for the inspection step text
function _elemLabel(eType, eOpts) {
  eOpts = eOpts || {};
  if (eOpts.strakeName) return eOpts.strakeName;
  if (eOpts.strakeId) return eOpts.strakeId;
  const labels = {
    'plate-bottom':'Bottom plate', 'plate-keel':'Keel plate',
    'plate-ib':'IB plate', 'plate-is':'IS plate', 'plate-side':'Side plate',
    'plate-ud':'Upper Deck', 'plate-str':'Stringer Deck', 'plate-twn':'Tween Deck',
    'plate-coaming':'Coaming',
    'plate-sidegirder':'Side Girder',
    'long-bottom':'Bottom long', 'long-ib':'IB long', 'long-is':'IS long',
    'long-side':'Side long', 'long-ud':'UD long', 'long-str':'Stringer long',
    'long-twn':'Tween long', 'long-coaming':'Coaming long'
  };
  return labels[eType] || eType;
}
window._elemLabel = _elemLabel;

// =========================================================================
// Hull Girder Strength Panel
// Shows σ_hg / σ_perm ratio for every plate and longitudinal in the section,
// color-coded green→yellow→orange→red as the ratio approaches / exceeds 1.
// Gives the user a one-glance view of which elements are struggling.
// =========================================================================
// =========================================================================
// RULE MINIMUM INFO PANEL (Info tab, always visible) — LR Pt 3 Ch 4 Sec 5.4/5.8
// =========================================================================
// Compact display of:
//   Z_min = f₁·k_L·C₁·L²·B·(C_b+0.7)·10⁻⁶   [m³]   (f₁ ≥ 0.5)
//   I_min = 3·C₁·L³·B·(C_b+0.7)·10⁻⁸        [m⁴]   (L ≥ 90 m only)
// Plus the actual Z_B / Z_D / I_NA of the current section and their ratios.
// Runs on every recalc, so the user sees this without having to switch tabs.
// =========================================================================
function renderRuleMinInfoPanel() {
  // Sidebar's #ruleMinInfoPanel was removed in v23 — content now lives only
  // in the floating overlay (#infoOverlayBody) above the drawing. We still
  // accept either target so external callers / older code paths keep working.
  const panel = document.getElementById('ruleMinInfoPanel')
             || document.getElementById('infoOverlayBody');
  if (!panel) return;
  let ls;
  try {
    const p = getParams();
    ls = runLongStrengthAnalysis();
  } catch (e) { ls = null; }
  if (!ls || !ls.compliance) {
    const fallbackHTML = `
      <div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:0.74rem;padding-bottom:4px;border-bottom:1px solid var(--border);margin-bottom:6px">
        Rule Minimum
      </div>
      <div style="color:var(--text-muted);font-size:0.62rem">
        Section data not available — check geometry.
      </div>`;
    panel.innerHTML = fallbackHTML;
    const ovBody = document.getElementById('infoOverlayBody');
    if (ovBody && ovBody !== panel) ovBody.innerHTML = fallbackHTML;
    return;
  }
  const c = ls.compliance;

  // Row style: green if pass with margin, yellow if tight, red if fail.
  const rowStyle = (pass, ratio) => {
    if (!pass) return { col:'#ef4444', bg:'rgba(239,68,68,0.14)' };
    if (ratio >= 1.20) return { col:'#22c55e', bg:'rgba(34,197,94,0.10)' };
    if (ratio >= 1.05) return { col:'#84cc16', bg:'rgba(132,204,22,0.10)' };
    return { col:'#f97316', bg:'rgba(249,115,22,0.12)' };  // tight
  };

  const zbS = rowStyle(c.Z_B.pass, c.Z_B.ratio);
  const zdS = rowStyle(c.Z_D.pass, c.Z_D.ratio);

  // Overall pass
  const allPass = c.Z_B.pass && c.Z_D.pass && (!c.I || c.I.pass);
  const headerColor = allPass ? 'var(--success)' : '#ef4444';
  const headerText  = allPass ? '✓ LR Minimum OK' : '✗ LR Minimum FAIL';

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:4px;border-bottom:1px solid var(--border);margin-bottom:6px">
      <span style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:0.74rem">Loading</span>
      <span style="font-family:var(--font-mono);font-weight:600;color:var(--text-muted);font-size:0.58rem">LR Pt 3 Ch 4 Sec 5</span>
    </div>`;

  // Live loading summary — so the user can visually confirm that changing
  // M_s (still-water moment) propagates into M_max, which drives every
  // σ_hg stress check downstream. Previously the Ms field's effect was
  // invisible unless the user scrolled through individual element results.
  const Ms = (getParams().Ms_design || 0);
  const Mw_h = ls.Mw_hog || 0;
  const Mw_s = ls.Mw_sag || 0;
  const M_hog = Math.abs(Ms + Mw_h);
  const M_sag = Math.abs(Ms + Mw_s);
  const M_max_live = Math.max(M_hog, M_sag);
  const govCase = M_hog >= M_sag ? 'hogging' : 'sagging';
  const fmt = n => (Math.abs(n) >= 1e6)
    ? (n/1e6).toFixed(2) + '·10⁶'
    : (Math.abs(n) >= 1e3) ? (n/1e3).toFixed(1) + 'k' : n.toFixed(0);

  html += `
    <div style="display:grid;grid-template-columns:40px 1fr;gap:2px 6px;margin-bottom:6px;padding:4px 5px;background:var(--bg-input);border-radius:3px;font-size:0.60rem;font-family:var(--font-mono);line-height:1.4">
      <span style="color:var(--text-muted)">M_s</span>
      <span style="color:var(--text-primary);text-align:right">${fmt(Ms)} kN·m</span>
      <span style="color:var(--text-muted)">M_w↑</span>
      <span style="color:var(--text-primary);text-align:right">${fmt(Mw_h)} kN·m</span>
      <span style="color:var(--text-muted)">M_w↓</span>
      <span style="color:var(--text-primary);text-align:right">${fmt(Mw_s)} kN·m</span>
      <span style="color:var(--accent);font-weight:700">M_max</span>
      <span style="color:var(--accent);text-align:right;font-weight:700">${fmt(M_max_live)} kN·m <span style="color:var(--text-muted);font-weight:400">(${govCase})</span></span>
    </div>`;

  html += `
    <div style="display:flex;justify-content:space-between;align-items:center;padding-bottom:4px;border-bottom:1px solid var(--border);margin-bottom:6px">
      <span style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:0.74rem">Rule Minimum</span>
      <span style="font-family:var(--font-mono);font-weight:700;color:${headerColor};font-size:0.62rem">${headerText}</span>
    </div>
    <div style="font-size:0.56rem;color:var(--text-muted);margin-bottom:6px;line-height:1.35;font-family:var(--font-mono)">
      LR Pt 3 Ch 4 Sec 5.4 — Z_min = f₁·k_L·C₁·L²·B·(C_b+0.7)·10⁻⁶<br>
      = <span style="color:var(--accent);font-weight:600">${c.Z_B.required_m3.toFixed(3)} m³</span>
      <span style="color:var(--text-muted);margin-left:6px">(not a function of M_s)</span>
    </div>
    <div style="display:grid;grid-template-columns:40px 1fr 42px 38px;gap:3px;margin-bottom:3px;font-size:0.53rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-family:var(--font-mono)">
      <span>Prop</span>
      <span style="text-align:right">Actual / Req</span>
      <span style="text-align:right">Ratio</span>
      <span style="text-align:center">OK?</span>
    </div>`;

  const row = (label, actual, req, ratio, pass, unit) => {
    const s = rowStyle(pass, ratio);
    return `<div style="display:grid;grid-template-columns:40px 1fr 42px 38px;gap:3px;padding:3px 5px;font-size:0.62rem;background:${s.bg};border-radius:3px;margin-bottom:2px;font-family:var(--font-mono);border-left:2px solid ${s.col}">
      <span style="color:var(--text-primary);font-weight:600">${label}</span>
      <span style="text-align:right;color:var(--text-secondary)">${actual.toFixed(2)}<span style="color:var(--text-muted)"> / ${req.toFixed(2)}</span></span>
      <span style="text-align:right;color:${s.col};font-weight:700">${ratio.toFixed(2)}</span>
      <span style="text-align:center;color:${s.col};font-weight:700">${pass ? '✓' : '✗'}</span>
    </div>`;
  };

  html += row('Z_B',  c.Z_B.actual_m3, c.Z_B.required_m3, c.Z_B.ratio, c.Z_B.pass, 'm³');
  html += row('Z_D',  c.Z_D.actual_m3, c.Z_D.required_m3, c.Z_D.ratio, c.Z_D.pass, 'm³');
  if (c.I) {
    html += row('I_NA', c.I.actual_m4, c.I.required_m4, c.I.ratio, c.I.pass, 'm⁴');
  }

  // ─── F_B / F_D readout (LR Pt 3 Ch 4 Sec 5.7) ───
  // Show the LIVE values: raw ratio Z_act/Z_req, the clamped value the
  // formulas actually use, and the form input value (so you can see if
  // auto-sync is working). All three should match in normal operation;
  // they only diverge when the user manually overrides the input or
  // when the raw ratio is outside the [0.67, 1.0] LR band (then Used
  // shows the clamp value, not the raw).
  //
  // SAFETY-NET SYNC (v37): if the Setup input has drifted from the
  // clamped value (e.g. PROJECT_FULL_STATE auto-import wrote an old
  // FD=0.95 AFTER recalcAll's own auto-sync ran), reconcile it here.
  // This is the last place the user sees these numbers, so it's also
  // the cheapest place to enforce consistency. Threshold 0.005 to
  // avoid floating-point churn.
  try {
    // ─── F_B / F_D PER LR Pt 3, Ch 4, Sec 5.7.2 ───
    // F = σ_actual / σ_perm — these come straight from the central
    // LongStrength.analyze() result so the panel ALWAYS matches what
    // the formulas downstream are doing. Editing geometry, M_s, k_L,
    // or wave parameters re-runs runLongStrengthAnalysis above and
    // these numbers update on the next render automatically.
    const FB_raw = (typeof ls.F_B_raw === 'number') ? ls.F_B_raw : 0;
    const FD_raw = (typeof ls.F_D_raw === 'number') ? ls.F_D_raw : 0;
    // Two-tier floor: plating 0.67, longitudinal 0.75. The "used"
    // displayed here is the longitudinal floor (the stricter of the
    // two) since that is what goes into the FB/FD input boxes.
    const FB_plating  = Math.max(FB_raw, 0.67);
    const FD_plating  = Math.max(FD_raw, 0.67);
    const FB_long     = Math.max(FB_raw, 0.75);
    const FD_long     = Math.max(FD_raw, 0.75);
    const FB_used = FB_long;
    const FD_used = FD_long;
    const FB_inEl = document.getElementById('FB');
    const FD_inEl = document.getElementById('FD');
    let FB_input = parseFloat(FB_inEl?.value || 'NaN');
    let FD_input = parseFloat(FD_inEl?.value || 'NaN');
    // Drift detection: keep the Setup input in sync with the live value.
    // SKIP IN MANUAL MODE: the user has explicitly chosen to fix F_B / F_D
    // at their typed values — drift "correction" here would silently undo
    // their override on every panel render.
    const _fbfdMode_panel = (typeof getFBFDMode === 'function') ? getFBFDMode() : 'auto';
    const FB_drift = (_fbfdMode_panel === 'auto') && isFinite(FB_input) ? Math.abs(FB_input - FB_used) > 0.005 : false;
    const FD_drift = (_fbfdMode_panel === 'auto') && isFinite(FD_input) ? Math.abs(FD_input - FD_used) > 0.005 : false;
    if (FB_inEl && FB_drift) {
      FB_inEl.value = FB_used.toFixed(3);
      FB_input = FB_used;
    }
    if (FD_inEl && FD_drift) {
      FD_inEl.value = FD_used.toFixed(3);
      FD_input = FD_used;
    }
    // Tag the raw value: 'OVER' (>1, hull-girder fails) | 'floor' (<0.75
    // for stiffener, lifted to floor) | 'in-band' (normal)
    const FB_overstressed = FB_raw > 1.0;
    const FD_overstressed = FD_raw > 1.0;
    const FB_tag = FB_overstressed ? '⚠ OVER 1.0' : (FB_raw < 0.75 ? '↑floor' : 'in-band');
    const FD_tag = FD_overstressed ? '⚠ OVER 1.0' : (FD_raw < 0.75 ? '↑floor' : 'in-band');
    const FB_tagCol = FB_overstressed ? '#ef4444' : (FB_raw < 0.75 ? '#f97316' : 'var(--text-muted)');
    const FD_tagCol = FD_overstressed ? '#ef4444' : (FD_raw < 0.75 ? '#f97316' : 'var(--text-muted)');
    const FB_borderCol = FB_overstressed ? '#ef4444' : '#6366f1';
    const FD_borderCol = FD_overstressed ? '#ef4444' : '#6366f1';
    const FB_bg = FB_overstressed ? 'rgba(239,68,68,0.10)' : 'rgba(99,102,241,0.06)';
    const FD_bg = FD_overstressed ? 'rgba(239,68,68,0.10)' : 'rgba(99,102,241,0.06)';
    const okCol = 'var(--text-muted)';
    html += `
      <div style="display:grid;grid-template-columns:40px 1fr 50px 50px;gap:3px;padding:3px 5px;font-size:0.62rem;background:${FB_bg};border-radius:3px;margin-top:6px;margin-bottom:2px;font-family:var(--font-mono);border-left:2px solid ${FB_borderCol}">
        <span style="color:var(--text-primary);font-weight:700">F_B</span>
        <span style="text-align:right;color:var(--text-secondary)">raw ${FB_raw.toFixed(3)} <span style="color:${FB_tagCol};font-size:0.56rem;font-weight:700">(${FB_tag})</span></span>
        <span style="text-align:right;color:#a5b4fc;font-weight:700" title="Longitudinal floor 0.75; plating relaxes to ${FB_plating.toFixed(3)} (floor 0.67)">${FB_used.toFixed(3)}</span>
        <span style="text-align:right;color:${okCol};font-weight:600" title="Setup input (auto-synced)">in:${isFinite(FB_input) ? FB_input.toFixed(3) : '—'}</span>
      </div>
      <div style="display:grid;grid-template-columns:40px 1fr 50px 50px;gap:3px;padding:3px 5px;font-size:0.62rem;background:${FD_bg};border-radius:3px;margin-bottom:2px;font-family:var(--font-mono);border-left:2px solid ${FD_borderCol}">
        <span style="color:var(--text-primary);font-weight:700">F_D</span>
        <span style="text-align:right;color:var(--text-secondary)">raw ${FD_raw.toFixed(3)} <span style="color:${FD_tagCol};font-size:0.56rem;font-weight:700">(${FD_tag})</span></span>
        <span style="text-align:right;color:#a5b4fc;font-weight:700" title="Longitudinal floor 0.75; plating relaxes to ${FD_plating.toFixed(3)} (floor 0.67)">${FD_used.toFixed(3)}</span>
        <span style="text-align:right;color:${okCol};font-weight:600" title="Setup input (auto-synced)">in:${isFinite(FD_input) ? FD_input.toFixed(3) : '—'}</span>
      </div>
      <div style="font-size:0.54rem;color:var(--text-muted);padding:1px 5px 4px;font-family:var(--font-mono);line-height:1.3">
        ${_fbfdMode_panel === 'manual'
          ? `<span style="color:#fbbf24;font-weight:700">MODE: MANUAL</span> — Setup F_B/F_D inputs used as-is. <span style="color:#a5b4fc;font-weight:700">used</span> column shows what AUTO would compute (for reference only).`
          : `<span style="color:#a5b4fc;font-weight:700">used</span> = max(raw, 0.75) — long. stiffener floor (LR Sec 5.7.2). Plating may relax to 0.67. <span style="color:${okCol};font-weight:700">in</span> = current Setup input (auto-synced).`}
        ${(FB_overstressed || FD_overstressed)
          ? `<br><span style="color:#ef4444;font-weight:700">⚠ Hull girder OVERSTRESSED — σ_actual > σ_perm; section modulus inadequate.</span>`
          : ''}
      </div>`;
  } catch (err) { console.warn('[renderRuleMinInfoPanel] FB/FD row failed:', err); }

  // Section element-count diagnostic. Confirms that computeSectionProperties
  // is actually iterating through all strakes + stiffeners (and not silently
  // dropping any group) — useful when debugging "did my geometry change
  // actually take effect?".
  try {
    const sp = window.Draw && window.Draw.computeSectionProperties
      ? window.Draw.computeSectionProperties() : null;
    if (sp && sp.contributions) {
      // Tally by label category
      const tally = { plate:0, stiff:0 };
      sp.contributions.forEach(c => {
        if ((c.label||'').toLowerCase().includes('stiff')) tally.stiff++;
        else tally.plate++;
      });
      const NA_m = (sp.NA/1000).toFixed(2);
      const A_cm2 = (sp.totalArea/100).toFixed(0);
      html += `<div style="font-size:0.54rem;color:var(--text-muted);margin-top:4px;padding:3px 5px;background:var(--bg-input);border-radius:3px;font-family:var(--font-mono);line-height:1.3">
        Section: <b style="color:var(--text-primary)">${sp.contributions.length}</b> elements (${tally.plate} plates, ${tally.stiff} stiffs) · A=${A_cm2} cm² · NA=${NA_m} m
      </div>`;

      // Live plate thickness readout. If you change "Upper Deck t" in the form
      // and the number here doesn't update, sync form→PLATE_THICKNESS is stale.
      const PT = window.Draw?.PLATE_THICKNESS || {};
      html += `<div style="font-size:0.54rem;color:var(--text-muted);margin-top:3px;padding:3px 5px;background:var(--bg-input);border-radius:3px;font-family:var(--font-mono);line-height:1.3">
        Live t (mm): UD=<b style="color:var(--text-primary)">${PT.upperDeck}</b> · Str=<b style="color:var(--text-primary)">${PT.stringer}</b> · Twn=<b style="color:var(--text-primary)">${PT.tween}</b> · Coam=<b style="color:var(--text-primary)">${PT.coaming}</b>
      </div>`;

      // ────── DIAGNOSTIC BREAKDOWN ──────
      // Sum contributions by label prefix so we see if deck side is lean.
      // Also show: sum(A·z) above NA  vs  sum(A·z) below NA — this directly
      // tells us whether the NA imbalance is "deck starving" or something else.
      const NA_mm = sp.NA;
      const groups = {};
      let A_above = 0, A_below = 0;
      let M_above = 0, M_below = 0;  // A·|z-NA|  moment arm relative to NA
      sp.contributions.forEach(c => {
        const lbl = c.label || 'other';
        if (!groups[lbl]) groups[lbl] = { n:0, A:0, Az:0, zmin:Infinity, zmax:-Infinity };
        groups[lbl].n++;
        groups[lbl].A  += c.A;
        groups[lbl].Az += c.A * c.z;
        if (c.z < groups[lbl].zmin) groups[lbl].zmin = c.z;
        if (c.z > groups[lbl].zmax) groups[lbl].zmax = c.z;
        if (c.z >= NA_mm) {
          A_above += c.A;
          M_above += c.A * (c.z - NA_mm);
        } else {
          A_below += c.A;
          M_below += c.A * (NA_mm - c.z);
        }
      });
      // These two moments about NA should be equal (that's what defines NA).
      // But above/below AREA ratio tells us mass distribution.
      const aboveBelowRatio = A_above / Math.max(A_below, 1);
      html += `<div style="font-size:0.54rem;color:var(--text-muted);margin-top:3px;padding:3px 5px;background:var(--bg-input);border-radius:3px;font-family:var(--font-mono);line-height:1.3">
        Above NA: <b style="color:var(--text-primary)">${(A_above/100).toFixed(0)}</b> cm² · Below NA: <b style="color:var(--text-primary)">${(A_below/100).toFixed(0)}</b> cm² · ratio=<b style="color:${aboveBelowRatio<0.7?'#ef4444':'var(--text-primary)'}">${aboveBelowRatio.toFixed(2)}</b>
      </div>`;

      // Group breakdown table (collapsible via <details>)
      const sortedGroups = Object.entries(groups).sort((a,b) => b[1].A - a[1].A);
      let tblRows = '';
      sortedGroups.forEach(([lbl, g]) => {
        const zmid = g.Az / g.A;
        const sideMark = zmid >= NA_mm ? '▲' : '▼';
        const sideColor = zmid >= NA_mm ? '#22c55e' : '#3b82f6';
        tblRows += `<tr style="border-bottom:1px solid var(--border-faint)">
          <td style="padding:2px 4px;color:var(--text-primary)">${lbl}</td>
          <td style="padding:2px 4px;text-align:right;color:var(--text-secondary)">${g.n}</td>
          <td style="padding:2px 4px;text-align:right;color:var(--text-secondary)">${(g.A/100).toFixed(0)}</td>
          <td style="padding:2px 4px;text-align:right;color:var(--text-secondary)">${(zmid/1000).toFixed(2)}</td>
          <td style="padding:2px 4px;text-align:center;color:${sideColor}">${sideMark}</td>
        </tr>`;
      });
      html += `<details style="margin-top:3px;font-size:0.56rem;font-family:var(--font-mono)">
        <summary style="cursor:pointer;padding:3px 5px;background:var(--bg-input);border-radius:3px;color:var(--text-muted)">Contribution breakdown by group (${sortedGroups.length})</summary>
        <table style="width:100%;border-collapse:collapse;margin-top:3px;font-size:0.55rem">
          <thead>
            <tr style="color:var(--text-muted);border-bottom:1px solid var(--border)">
              <th style="padding:2px 4px;text-align:left">Group</th>
              <th style="padding:2px 4px;text-align:right">n</th>
              <th style="padding:2px 4px;text-align:right">A (cm²)</th>
              <th style="padding:2px 4px;text-align:right">z̄ (m)</th>
              <th style="padding:2px 4px;text-align:center">↕</th>
            </tr>
          </thead>
          <tbody>${tblRows}</tbody>
        </table>
      </details>`;
    }
  } catch(e) {}

  // Governing and margin
  const ratios = [
    { name:'Z_B',  r: c.Z_B.ratio },
    { name:'Z_D',  r: c.Z_D.ratio },
  ];
  if (c.I) ratios.push({ name:'I_NA', r: c.I.ratio });
  ratios.sort((a,b) => a.r - b.r);
  const gov = ratios[0];
  const marginPct = (gov.r - 1) * 100;
  html += `<div style="font-size:0.55rem;color:var(--text-muted);margin-top:4px;padding:3px 5px;background:var(--bg-input);border-radius:3px;font-family:var(--font-mono)">
    Gov: <b style="color:var(--text-primary)">${gov.name}</b> · margin <b style="color:${marginPct>=0?'var(--success)':'#ef4444'}">${marginPct>=0?'+':''}${marginPct.toFixed(1)}%</b>
  </div>`;

  panel.innerHTML = html;
  // Mirror the same content into the floating overlay sitting on top of the
  // drawing area, so the user can see the rule-min status without keeping the
  // left sidebar expanded. The overlay is otherwise inert — it just reflects.
  // (Skip if `panel` is already the overlay body — i.e. sidebar element is
  // gone in v23+ and the lookup fell through to the overlay directly.)
  const overlayBody = document.getElementById('infoOverlayBody');
  if (overlayBody && overlayBody !== panel) overlayBody.innerHTML = html;
}
window.renderRuleMinInfoPanel = renderRuleMinInfoPanel;

// =========================================================================
// HULL GIRDER STRENGTH PANEL — Analysis mode sidebar
// Shows σ_hg / σ_perm ratio for every plate and longitudinal in the section,
// color-coded green→yellow→orange→red as the ratio approaches / exceeds 1.
// Gives the user a one-glance view of which elements are struggling.
// =========================================================================
function renderHullGirderStrengthPanel() {
  const panel = document.getElementById('hullGirderStrengthPanel');
  if (!panel || !window.ANALYSIS_MODE) return;
  panel.style.display = 'block';
  
  const p = getParams();
  const ls = runLongStrengthAnalysis();
  if (!ls || !ls.section || !ls.section.I_NA) {
    panel.innerHTML = `<div style="color:var(--text-muted)">Hull girder data not available — visit Geometry page first.</div>`;
    return;
  }
  
  const sigma_perm = ls.sigma_amid;
  const z_NA = ls.section.z_NA;
  const I_NA = ls.section.I_NA;
  const M_hog = Math.abs(ls.M_total_hog);
  const M_sag = Math.abs(ls.M_total_sag);
  const M_max = Math.max(M_hog, M_sag);
  
  // Compute σ_hg for a z (m)
  const sigma_at = z_m => {
    const dz = z_m - z_NA;
    return Math.abs(M_max * dz / I_NA) * 1e-3;
  };
  
  // Ratio → color (green 0 → yellow 0.6 → orange 0.85 → red 1.0+)
  const colorFor = (r) => {
    if (r < 0.5) return '#22c55e';    // green
    if (r < 0.70) return '#84cc16';   // lime
    if (r < 0.85) return '#eab308';   // yellow
    if (r < 1.00) return '#f97316';   // orange
    return '#ef4444';                  // red (>1 fail)
  };
  const bgFor = (r) => {
    if (r < 0.5) return 'rgba(34,197,94,0.08)';
    if (r < 0.70) return 'rgba(132,204,22,0.10)';
    if (r < 0.85) return 'rgba(234,179,8,0.12)';
    if (r < 1.00) return 'rgba(249,115,22,0.14)';
    return 'rgba(239,68,68,0.18)';
  };
  
  // Collect all elements with their z coordinates
  const items = [];
  
  // --- Plates ---
  items.push({ kind:'plate', type:'plate-keel',   label:'Keel',         z: 0.00, opts:{} });
  items.push({ kind:'plate', type:'plate-bottom', label:'Bottom',       z: 0.00, opts:{} });
  items.push({ kind:'plate', type:'plate-ib',     label:'Inner Bottom', z: p.ibLevel/1000, opts:{} });
  // IS strakes (each)
  const isStrakes = window.Draw?.STRAKES?.innerSide || [];
  const G = window.Draw?.GEOMETRY || {};
  let z_is = G.IB || 1800;
  isStrakes.forEach((s, i) => {
    const z_mid = (z_is + s.width/2) / 1000;
    items.push({ 
      kind:'plate', 
      type:'plate-is', 
      label:`IS-${i+1}`, 
      z: z_mid, 
      opts:{strakeIdx:i}
    });
    z_is += s.width;
  });
  // Stringer / Tween / UD / Coaming
  const strZ = parseFloat(document.getElementById('strDeckZ')?.value || 8590) / 1000;
  const twnZ = parseFloat(document.getElementById('twnDeckZ')?.value || 12900) / 1000;
  items.push({ kind:'plate', type:'plate-str', label:'Stringer Deck', z: strZ, opts:{} });
  items.push({ kind:'plate', type:'plate-twn', label:'Tween Deck',    z: twnZ, opts:{} });
  items.push({ kind:'plate', type:'plate-ud',  label:'Upper Deck',    z: p.udLevel/1000, opts:{} });
  items.push({ kind:'plate', type:'plate-coaming', label:'Coaming',   z: p.hcLevel/1000, opts:{} });
  
  // --- Profiles (longitudinals) ---
  items.push({ kind:'long', type:'long-bottom', label:'Bottom long', z: 0.00, opts:{} });
  items.push({ kind:'long', type:'long-ib',     label:'IB long',     z: p.ibLevel/1000, opts:{} });
  // Side longs — sample a few
  if (window.DEFAULT_SIDE_LONGS) {
    window.DEFAULT_SIDE_LONGS.forEach(sl => {
      items.push({ 
        kind:'long', 
        type:'long-side', 
        label:`Side long #${sl.n} (z=${(sl.z/1000).toFixed(1)})`, 
        z: sl.z / 1000, 
        opts:{ z_m: sl.z / 1000 }
      });
    });
  }
  // IS longs — sample at strake midpoints
  z_is = G.IB || 1800;
  isStrakes.forEach((s, i) => {
    const z_mid = (z_is + s.width/2) / 1000;
    items.push({ 
      kind:'long', 
      type:'long-is', 
      label:`IS long @ z=${z_mid.toFixed(1)}`, 
      z: z_mid, 
      opts:{ z_m: z_mid }
    });
    z_is += s.width;
  });
  // Decks
  items.push({ kind:'long', type:'long-str', label:'Stringer long', z: strZ, opts:{} });
  items.push({ kind:'long', type:'long-twn', label:'Tween long',    z: twnZ, opts:{} });
  items.push({ kind:'long', type:'long-ud',  label:'UD long',       z: p.udLevel/1000, opts:{} });
  items.push({ kind:'long', type:'long-coaming', label:'Coaming long', z: p.hcLevel/1000, opts:{} });
  
  // Compute ratios and group
  items.forEach(it => {
    it.sigma = sigma_at(it.z);
    it.ratio = it.sigma / sigma_perm;
    it.pass = it.sigma <= sigma_perm;
  });
  
  // Sort by ratio descending (worst first), for at-a-glance "is there any failure?"
  const sorted = [...items].sort((a, b) => b.ratio - a.ratio);
  const failCount = items.filter(i => !i.pass).length;
  const warnCount = items.filter(i => i.pass && i.ratio >= 0.85).length;
  
  // --- Build HTML ---
  let html = `
    <div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:0.82rem;padding:2px 0;border-bottom:1px solid var(--border);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
      <span>Hull Girder Strength</span>
      <span style="font-size:0.6rem;color:var(--text-muted);font-weight:500">σ_hg/σ_perm per element</span>
    </div>
    <div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:6px;line-height:1.3">
      <b>σ_perm</b> = 175/kL = <b style="color:var(--accent)">${sigma_perm.toFixed(0)} N/mm²</b> · 
      <b>M_max</b> = ${M_max.toLocaleString()} kN·m · 
      <b>z_NA</b> = ${z_NA.toFixed(2)} m
    </div>
  `;
  
  // Include LR rule-minimum failures (Z_B, Z_D, I) in the summary counts.
  // These are separate from element σ_hg failures and just as important —
  // even if every element's stress is OK, a hull failing Z_min means the
  // section is structurally insufficient per LR.
  let ruleMinFailCount = 0;
  if (ls.compliance) {
    if (!ls.compliance.Z_B.pass) ruleMinFailCount++;
    if (!ls.compliance.Z_D.pass) ruleMinFailCount++;
    if (ls.compliance.I && !ls.compliance.I.pass) ruleMinFailCount++;
  }
  const totalFail = failCount + ruleMinFailCount;

  // Summary strip
  if (totalFail > 0) {
    const ruleMinNote = ruleMinFailCount > 0 ? ` (incl. ${ruleMinFailCount} rule-min)` : '';
    html += `<div style="display:flex;gap:4px;margin-bottom:6px">
      <div style="flex:1;padding:5px;background:rgba(239,68,68,0.15);border:1px solid #ef4444;border-radius:3px;text-align:center;font-family:var(--font-mono);font-weight:600;color:#ef4444;font-size:0.65rem">${totalFail} FAIL${ruleMinNote}</div>
      <div style="flex:1;padding:5px;background:rgba(249,115,22,0.10);border:1px solid #f97316;border-radius:3px;text-align:center;font-family:var(--font-mono);color:#f97316;font-size:0.65rem">${warnCount} warn</div>
    </div>`;
  } else if (warnCount > 0) {
    html += `<div style="padding:5px;background:rgba(249,115,22,0.10);border:1px solid #f97316;border-radius:3px;text-align:center;font-family:var(--font-mono);color:#f97316;font-size:0.65rem;margin-bottom:6px">${warnCount} element near limit · all pass</div>`;
  } else {
    html += `<div style="padding:5px;background:rgba(34,197,94,0.10);border:1px solid var(--success);border-radius:3px;text-align:center;font-family:var(--font-mono);color:var(--success);font-size:0.65rem;margin-bottom:6px">All ${items.length} elements pass · Z_min / I_min OK</div>`;
  }
  
  // Color legend
  html += `<div style="display:flex;align-items:center;gap:3px;margin-bottom:6px;font-size:0.55rem;color:var(--text-muted);font-family:var(--font-mono);flex-wrap:wrap">
    <span style="padding:1px 5px;background:rgba(34,197,94,0.12);color:#22c55e;border-radius:2px">0 – 0.5</span>
    <span style="padding:1px 5px;background:rgba(132,204,22,0.12);color:#84cc16;border-radius:2px">0.5 – 0.7</span>
    <span style="padding:1px 5px;background:rgba(234,179,8,0.14);color:#eab308;border-radius:2px">0.7 – 0.85</span>
    <span style="padding:1px 5px;background:rgba(249,115,22,0.14);color:#f97316;border-radius:2px">0.85 – 1.0</span>
    <span style="padding:1px 5px;background:rgba(239,68,68,0.18);color:#ef4444;border-radius:2px">&gt; 1.0 FAIL</span>
  </div>`;

  // ─── LR Pt 3 Ch 4 Sec 5.4 / 5.8 — Rule minimum section properties ───
  // Z_B / Z_D must both be ≥ Z_min; I_NA must be ≥ I_min (L ≥ 90 m).
  // Z_min = f1·kL·C1·L²·B·(Cb+0.7)·10⁻⁶  [m³]  (f1 ≥ 0.5)
  // I_min = 3·C1·L³·B·(Cb+0.7)·10⁻⁸       [m⁴]
  // Values come from runLongStrengthAnalysis()'s compliance block.
  if (ls.compliance) {
    const c = ls.compliance;
    const rowStyle = (pass, ratio) => {
      // For rule-minimum checks the "good" direction is ratio > 1.0 (actual ≥ required),
      // so invert the color logic used for stress.
      let col, bg;
      if (pass) {
        if (ratio >= 1.50)      { col = '#22c55e'; bg = 'rgba(34,197,94,0.10)'; }
        else if (ratio >= 1.20) { col = '#84cc16'; bg = 'rgba(132,204,22,0.10)'; }
        else if (ratio >= 1.05) { col = '#eab308'; bg = 'rgba(234,179,8,0.12)'; }
        else                    { col = '#f97316'; bg = 'rgba(249,115,22,0.14)'; }
      } else {
        col = '#ef4444'; bg = 'rgba(239,68,68,0.18)';
      }
      return { col, bg };
    };

    const Zmin_cm3 = c.Z_B.required_m3 * 1e6;   // m³ → cm³ for display

    const zbS = rowStyle(c.Z_B.pass, c.Z_B.ratio);
    const zdS = rowStyle(c.Z_D.pass, c.Z_D.ratio);

    html += `
      <div style="font-size:0.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:6px 0 4px 0;padding-bottom:2px;border-bottom:1px dashed var(--border-faint)">
        Rule Minimum (LR Pt 3 Ch 4 Sec 5.4 / 5.8)
      </div>
      <div style="font-size:0.57rem;color:var(--text-muted);margin-bottom:4px;line-height:1.3;font-family:var(--font-mono)">
        Z_min = f₁·k_L·C₁·L²·B·(C_b+0.7)·10⁻⁶ = <b style="color:var(--accent)">${c.Z_B.required_m3.toFixed(3)} m³</b> (${(Zmin_cm3/1e6).toFixed(2)}·10⁶ cm³)
      </div>
      <div style="display:grid;grid-template-columns:80px 1fr 1fr 50px 48px;gap:3px;margin-bottom:4px;font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-family:var(--font-mono)">
        <span>Property</span>
        <span style="text-align:right">Actual</span>
        <span style="text-align:right">Required</span>
        <span style="text-align:right">Ratio</span>
        <span style="text-align:center">Status</span>
      </div>`;

    // Z_B row (keel)
    html += `<div style="display:grid;grid-template-columns:80px 1fr 1fr 50px 48px;gap:3px;padding:4px 6px;font-size:0.66rem;background:${zbS.bg};border-radius:3px;margin-bottom:2px;font-family:var(--font-mono);border-left:2px solid ${zbS.col}">
        <span style="color:var(--text-primary);font-weight:600">Z_B (keel)</span>
        <span style="text-align:right;color:var(--text-primary)">${c.Z_B.actual_m3.toFixed(3)} m³</span>
        <span style="text-align:right;color:var(--text-muted)">${c.Z_B.required_m3.toFixed(3)} m³</span>
        <span style="text-align:right;color:${zbS.col};font-weight:700">${c.Z_B.ratio.toFixed(2)}</span>
        <span style="text-align:center;color:${zbS.col};font-weight:700">${c.Z_B.pass ? '✓ OK' : '✗ FAIL'}</span>
      </div>`;

    // Z_D row (deck)
    html += `<div style="display:grid;grid-template-columns:80px 1fr 1fr 50px 48px;gap:3px;padding:4px 6px;font-size:0.66rem;background:${zdS.bg};border-radius:3px;margin-bottom:2px;font-family:var(--font-mono);border-left:2px solid ${zdS.col}">
        <span style="color:var(--text-primary);font-weight:600">Z_D (deck)</span>
        <span style="text-align:right;color:var(--text-primary)">${c.Z_D.actual_m3.toFixed(3)} m³</span>
        <span style="text-align:right;color:var(--text-muted)">${c.Z_D.required_m3.toFixed(3)} m³</span>
        <span style="text-align:right;color:${zdS.col};font-weight:700">${c.Z_D.ratio.toFixed(2)}</span>
        <span style="text-align:center;color:${zdS.col};font-weight:700">${c.Z_D.pass ? '✓ OK' : '✗ FAIL'}</span>
      </div>`;

    // I row (only valid for L ≥ 90 m — otherwise c.I is null)
    if (c.I) {
      const iS = rowStyle(c.I.pass, c.I.ratio);
      html += `<div style="display:grid;grid-template-columns:80px 1fr 1fr 50px 48px;gap:3px;padding:4px 6px;font-size:0.66rem;background:${iS.bg};border-radius:3px;margin-bottom:2px;font-family:var(--font-mono);border-left:2px solid ${iS.col}">
          <span style="color:var(--text-primary);font-weight:600">I_NA</span>
          <span style="text-align:right;color:var(--text-primary)">${c.I.actual_m4.toFixed(2)} m⁴</span>
          <span style="text-align:right;color:var(--text-muted)">${c.I.required_m4.toFixed(2)} m⁴</span>
          <span style="text-align:right;color:${iS.col};font-weight:700">${c.I.ratio.toFixed(2)}</span>
          <span style="text-align:center;color:${iS.col};font-weight:700">${c.I.pass ? '✓ OK' : '✗ FAIL'}</span>
        </div>`;
    }

    // Summary note on governing case
    const overallPass = c.Z_B.pass && c.Z_D.pass && (!c.I || c.I.pass);
    const minRatio = Math.min(c.Z_B.ratio, c.Z_D.ratio, c.I ? c.I.ratio : Infinity);
    const governing = c.Z_B.ratio <= c.Z_D.ratio && (!c.I || c.Z_B.ratio <= c.I.ratio) ? 'Z_B (keel)'
                    : c.Z_D.ratio <= (c.I ? c.I.ratio : Infinity) ? 'Z_D (deck)' : 'I_NA';
    html += `<div style="font-size:0.57rem;color:var(--text-muted);margin:4px 0 6px 0;padding:4px 6px;background:var(--surface-subtle);border-radius:3px;font-family:var(--font-mono)">
        Governing: <b style="color:var(--text-primary)">${governing}</b> · margin = <b style="color:${overallPass?'var(--success)':'#ef4444'}">${((minRatio-1)*100).toFixed(1)}%</b>
      </div>`;
  }
  
  // Split: plates and longs
  const plates = items.filter(i => i.kind === 'plate');
  const longs = items.filter(i => i.kind === 'long');
  
  const renderGroup = (groupItems, title) => {
    let s = `<div style="font-size:0.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:6px 0 4px 0;padding-bottom:2px;border-bottom:1px dashed var(--border-faint)">${title} (${groupItems.length})</div>`;
    s += `<div style="display:grid;grid-template-columns:1fr 40px 48px 36px;gap:3px;margin-bottom:4px;font-size:0.55rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-family:var(--font-mono)">
      <span>Element</span><span style="text-align:right">z (m)</span><span style="text-align:right">σ_hg</span><span style="text-align:right">Ratio</span>
    </div>`;
    groupItems.forEach(it => {
      const col = colorFor(it.ratio);
      const bg = bgFor(it.ratio);
      s += `<div style="display:grid;grid-template-columns:1fr 40px 48px 36px;gap:3px;padding:4px 6px;font-size:0.65rem;background:${bg};border-radius:3px;margin-bottom:2px;cursor:pointer;font-family:var(--font-mono);border-left:2px solid ${col}"
           onclick='window.showElemInspect(${JSON.stringify(it.type)}, ${JSON.stringify(it.opts)})'>
        <span style="color:var(--text-primary);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${it.label}</span>
        <span style="text-align:right;color:var(--text-muted)">${it.z.toFixed(2)}</span>
        <span style="text-align:right;color:${col}">${it.sigma.toFixed(0)}</span>
        <span style="text-align:right;color:${col};font-weight:700">${it.ratio.toFixed(2)}</span>
      </div>`;
    });
    return s;
  };
  
  html += renderGroup(plates, 'Plates');
  html += renderGroup(longs, 'Longitudinals');
  
  panel.innerHTML = html;
}
window.renderHullGirderStrengthPanel = renderHullGirderStrengthPanel;

// Render the Analysis Status Panel — right sidebar quick view of IS + other
// strake-based checks. Lets user spot FAILs without scrolling down to Rule Check.
function renderAnalysisStatusPanel() {
  const panel = document.getElementById('analysisStatusPanel');
  if (!panel || !window.ANALYSIS_MODE) return;
  panel.style.display = 'block';
  
  const _ico = name => (window.icon ? window.icon(name, '11px') : '');
  let html = '';
  
  // Inner Side strakes
  if (typeof calcInnerSide === 'function') {
    try {
      const is = calcInnerSide();
      const STR = window.Draw?.STRAKES?.innerSide || [];
      html += `<div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:0.78rem;padding:2px 0;border-bottom:1px solid var(--border);margin-bottom:6px">Inner Side Strakes</div>`;
      html += `<div style="font-size:0.6rem;color:var(--text-muted);margin-bottom:4px;display:grid;grid-template-columns:60px 44px 36px 36px 22px;gap:4px;font-family:var(--font-mono);text-transform:uppercase;letter-spacing:0.3px">
        <span>Strake</span><span>Region</span><span>Req</span><span>Have</span><span></span>
      </div>`;
      is.strakes.forEach((s, i) => {
        const t_as = STR[i]?.thickness ?? 11;
        const pass = t_as >= s.t;
        const color = pass ? 'var(--success)' : 'var(--error)';
        const bg = pass ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.12)';
        const icon = pass ? 'checkCircle' : 'cross';
        html += `<div style="display:grid;grid-template-columns:60px 44px 36px 36px 22px;gap:4px;padding:4px 6px;font-size:0.68rem;background:${bg};border-radius:3px;margin-bottom:2px;cursor:pointer;font-family:var(--font-mono);border-left:2px solid ${color}"
                     onclick="window.showElemInspect('plate-is',{strakeIdx:${i},strakeId:'IS-${i+1}',strakeName:'IS-${i+1}',strakeSpacing:${(window.Draw?.STRAKES?.innerSide?.[i]?.spacing_mm)||650},strakeThickness:${t_as}})">
          <span style="color:var(--text-primary);font-weight:600">IS-${i+1}</span>
          <span style="color:var(--text-muted);font-size:0.6rem">${s.region}</span>
          <span style="color:var(--accent)">${s.t.toFixed(1)}</span>
          <span style="color:${color};font-weight:600">${t_as}</span>
          <span style="color:${color};display:inline-flex;align-items:center">${_ico(icon)}</span>
        </div>`;
      });
      
      const failCount = is.strakes.filter((s, i) => {
        const t_as = STR[i]?.thickness ?? 11;
        return t_as < s.t;
      }).length;
      if (failCount > 0) {
        html += `<div style="font-size:0.62rem;color:var(--error);padding:5px;background:rgba(239,68,68,0.08);border-radius:3px;margin-top:4px;text-align:center;font-family:var(--font-mono);font-weight:600">${failCount} FAIL · click row to inspect</div>`;
      } else {
        html += `<div style="font-size:0.62rem;color:var(--success);padding:5px;background:rgba(34,197,94,0.08);border-radius:3px;margin-top:4px;text-align:center;font-family:var(--font-mono);font-weight:600">All OK</div>`;
      }
      
      // Legend
      html += `<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px;line-height:1.4">
        <b>Req</b> = plate thickness required (mm)<br>
        <b>Have</b> = as-built 11 mm · click row for details
      </div>`;
    } catch (e) {
      html += `<div style="color:var(--text-muted);font-size:0.65rem">Inner side calc unavailable</div>`;
    }
  }
  
  panel.innerHTML = html;
}
window.renderAnalysisStatusPanel = renderAnalysisStatusPanel;

// ==========================================================================
// BUCKLING STATUS PANEL — summary of all plates + longitudinals
// LR Pt 3 Ch 4 Sec 7 buckling checks for every strake and stiffener
// ==========================================================================
function renderBucklingStatusPanel() {
  const panel = document.getElementById('bucklingStatusPanel');
  if (!panel) return;
  if (!window.ANALYSIS_MODE) { panel.innerHTML = ''; return; }
  if (!window.Buckling || !window.Draw) {
    panel.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:10px">Buckling module not ready</div>';
    return;
  }

  const D = window.Draw;
  const B = window.Buckling;
  const p = (typeof getParams === 'function') ? getParams() : { material: 'AH36', kL: 0.72, Ms_design: 0 };
  const ls = window.runLongStrengthAnalysis?.();
  if (!ls || !ls.section) {
    panel.innerHTML = '<div style="color:var(--text-muted);padding:10px">Hull girder data not available</div>';
    return;
  }
  const kL = p.kL || 0.72;
  const material = p.material || 'AH36';
  const M_max = Math.max(Math.abs(ls.M_total_hog), Math.abs(ls.M_total_sag));
  const z_NA = ls.section.z_NA;
  const I_NA = ls.section.I_NA;
  const G = D.GEOMETRY || {};
  const z_deck_m = (G.UD || 15300) / 1000;

  const sigmaAz = (z_m) => {
    const z_face = (z_m >= z_NA) ? (z_deck_m - z_NA) : z_NA;
    if (z_face <= 0) return 30 / kL;
    const sigma_face = Math.abs(M_max * z_face / I_NA) * 1e-3;
    return B.sigmaADesign(sigma_face, Math.abs(z_m - z_NA), z_face, kL);
  };
  const tau_A = B.tauADesignInitial(kL);
  const S_m = 2.1;

  // Collect plate checks
  const plateRows = [];
  const pushPlate = (label, t_mm, z_m, corrosion, elemType, stiffening='LONGITUDINAL') => {
    const sigma_A = sigmaAz(z_m);
    const r = B.checkPlate({
      s_mm: 700, t_mm, S_m,
      sigma_A, tau_A,
      stiffening, corrosion, material,
    });
    plateRows.push({ label, t_mm, z_m, r, corrosion, elemType });
  };

  // Upper Deck
  pushPlate('UD', D.PLATE_THICKNESS?.upperDeck || 14, G.UD/1000,
            _corrosionForPanel('upperDeck'), 'plate-ud');
  pushPlate('Coaming top', D.PLATE_THICKNESS?.coaming || 20, G.HC/1000,
            'ONE_WB_VERT', 'plate-coaming');
  pushPlate('Stringer', D.PLATE_THICKNESS?.stringer || 10, 8.59,
            _corrosionForPanel('stringer'), 'plate-str');
  pushPlate('Tween', D.PLATE_THICKNESS?.tween || 10, 12.9,
            _corrosionForPanel('tween'), 'plate-twn');

  // IS strakes sample (take 2 — mid and top)
  if (D.STRAKES?.innerSide?.length > 0) {
    const isArr = D.STRAKES.innerSide;
    let cursor = G.IB;
    isArr.forEach((s, i) => {
      if (s.kind === 'coamingWall') {
        pushPlate(`IS-${i+1} (Coaming ${s.side||''})`.trim(), s.thickness,
                  (G.UD + 525)/1000, 'ONE_WB_VERT', 'plate-is');
      } else {
        const z_mid = (cursor + s.width/2)/1000;
        pushPlate(`IS-${i+1}`, s.thickness, z_mid,
                  _corrosionForPanel('innerSide', cursor + s.width/2), 'plate-is');
        cursor += s.width;
      }
    });
  }

  // Collect long checks (per stiffener, using resolved profile)
  const longRows = [];
  const pushLong = (label, group, index, z_m, corrosion, elemType) => {
    const stiff = D.profiles[group]?.[index];
    if (!stiff) return;
    let profName = stiff.profileName || '';
    if (!profName) {
      const SEL = {bottomShell:'bottomLongProfile',innerBottom:'ibLongProfile',
                   sideShell:null,innerSide:null,
                   stringerStiff:'strDeckProfile',tweenStiff:'twnDeckProfile',
                   coamingStiff:'coamingProfile',upperDeck:'deckLongProfile'};
      const selId = SEL[group];
      const sel = selId ? document.getElementById(selId) : null;
      profName = sel?.value || '';
    }
    if (!profName || !window.Profile?.allProfiles) return;
    const pc = window.Profile.allProfiles(['L','HP','FB','T']).find(x => x.name === profName);
    if (!pc) return;
    const dim = pc.dimensions || {};
    let d_w=0, t_w=0, b_f=0, t_f=0;
    if (pc.type === 'L')  { d_w=dim.a||0; t_w=dim.t||0; b_f=dim.b||0; t_f=dim.t||0; }
    else if (pc.type === 'HP') { d_w=dim.b||0; t_w=dim.t||0; b_f=dim.c||0; t_f=dim.c||0; }
    else if (pc.type === 'FB') { d_w=dim.h||dim.a||0; t_w=dim.t||0; }
    else if (pc.type === 'T')  { d_w=dim.a||0; t_w=dim.tw||dim.t||0; b_f=dim.b||0; t_f=dim.tf||dim.t||0; }
    const prof_type = pc.type === 'L' ? 'L' : pc.type === 'HP' ? 'BULB' : pc.type === 'FB' ? 'FLAT_BAR' : 'TEE';
    const t_p_mm = (group==='bottomShell'||group==='sideShell') ? 14
                 : group === 'innerBottom' ? 13 : 14;
    const sigma_A = sigmaAz(z_m);
    const r = B.checkLong({
      d_w, t_w, b_f, t_f, s_mm: 700, t_p_mm, S_m,
      prof: prof_type, sigma_A,
      corrosion, corrosion_plate: corrosion, material,
    });
    longRows.push({ label, group, index, profName, r, elemType });
  };

  // Bottom, IB, Side, IS, Deck longs — sample some key ones
  ['bottomShell','innerBottom','sideShell','innerSide','upperDeck'].forEach(group => {
    const arr = D.profiles[group] || [];
    const et = group === 'bottomShell' ? 'long-bottom'
             : group === 'innerBottom' ? 'long-ib'
             : group === 'sideShell' ? 'long-side'
             : group === 'innerSide' ? 'long-is'
             : 'long-ud';
    arr.forEach((st, i) => {
      const coord = st.z != null ? st.z : st.y;
      const z_m = (group === 'upperDeck') ? G.UD/1000
                : (group === 'bottomShell' || group === 'innerBottom') ? (group === 'innerBottom' ? G.IB/1000 : 0)
                : coord / 1000;
      const corrGroup = group === 'bottomShell' ? 'shell'
                      : group === 'innerBottom' ? 'innerBottom'
                      : group === 'sideShell' ? 'shell'
                      : group === 'innerSide' ? 'innerSide'
                      : 'upperDeck';
      const corr = _corrosionForPanel(corrGroup, st.y || 0);
      const lbl = ({bottomShell:'BS', innerBottom:'IB', sideShell:'SS', innerSide:'IS', upperDeck:'UD'}[group]) + String(i+1).padStart(2,'0');
      pushLong(lbl, group, i, z_m, corr, et);
    });
  });

  // Count pass/fail
  const pFails = plateRows.filter(x => !x.r.pass_all).length;
  const lFails = longRows.filter(x => !x.r.pass_all).length;

  // Render HTML
  let html = '';
  html += `<div style="font-family:var(--font-display);font-weight:700;color:var(--text-primary);font-size:0.78rem;padding:2px 0;border-bottom:1px solid var(--border);margin-bottom:6px;display:flex;justify-content:space-between;align-items:center">
    <span>Buckling (LR Sec 7)</span>
    <span style="font-size:0.62rem;color:${(pFails+lFails)>0?'var(--error)':'var(--success)'};font-family:var(--font-mono)">${pFails+lFails===0?'✓ ALL PASS':`${pFails+lFails} FAIL`}</span>
  </div>`;

  // Plates section
  html += `<div style="font-size:0.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:3px">Plates (${plateRows.length})</div>`;
  plateRows.forEach(x => {
    const pass = x.r.pass_all;
    const color = pass ? 'var(--success)' : 'var(--error)';
    const bg = pass ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.10)';
    const ucMax = Math.max(x.r.UC_comp, x.r.UC_shear);
    html += `<div style="display:grid;grid-template-columns:1fr 44px 18px;gap:4px;padding:3px 6px;background:${bg};border-radius:3px;margin-bottom:2px;font-family:var(--font-mono);font-size:0.66rem;border-left:2px solid ${color};cursor:pointer" onclick="window.showElemInspect('${x.elemType}',{t_mm:${x.t_mm},z_m:${x.z_m}})">
      <span style="color:var(--text-primary)">${x.label}</span>
      <span style="color:${color};text-align:right">${ucMax.toFixed(2)}</span>
      <span style="color:${color};text-align:center">${pass?'✓':'✗'}</span>
    </div>`;
  });

  // Longs section (grouped, collapsible)
  html += `<div style="font-size:0.62rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin:6px 0 3px">Longs (${longRows.length}, ${lFails} fail)</div>`;
  longRows.forEach(x => {
    const pass = x.r.pass_all;
    const color = pass ? 'var(--success)' : 'var(--error)';
    const bg = pass ? 'rgba(34,197,94,0.04)' : 'rgba(239,68,68,0.10)';
    html += `<div style="display:grid;grid-template-columns:52px 1fr 36px 14px;gap:3px;padding:2px 5px;background:${bg};border-radius:3px;margin-bottom:1px;font-family:var(--font-mono);font-size:0.62rem;border-left:2px solid ${color};cursor:pointer" onclick="window.showElemInspect('${x.elemType}',{group:'${x.group}',index:${x.index}})">
      <span style="color:var(--text-primary);font-weight:600">${x.label}</span>
      <span style="color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${x.profName}</span>
      <span style="color:${color};text-align:right">${x.r.UC.toFixed(2)}</span>
      <span style="color:${color};text-align:center">${pass?'✓':'✗'}</span>
    </div>`;
  });

  panel.innerHTML = html;
}
window.renderBucklingStatusPanel = renderBucklingStatusPanel;

// Helper for buckling panel: quick compartment-based corrosion lookup.
// Signature: _corrosionForPanel(plateKey, refCoord)
//   - For horizontal plates (upperDeck/stringer/tween/innerBottom), refCoord is Y (mm from CL).
//   - For vertical plates (innerSide/shell), refCoord is Z (mm above baseline).
// Orientation passed to corrosionFromComps depends on plate type, NOT hardcoded.
function _corrosionForPanel(plateKey, refCoord) {
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  let cA, cB;
  let orientation = 'vertical';
  try {
    if (plateKey === 'upperDeck') {
      // Horizontal — below=inside, above=weather
      cA = window.getCompartmentAt?.(refCoord||3000, G.UD - 50);
      cB = { type: 'weather' };
      orientation = 'horizontal';
    } else if (plateKey === 'stringer') {
      const z = parseFloat(document.getElementById('strDeckZ')?.value || 8590);
      cA = window.getCompartmentAt?.(refCoord||3000, z - 50);
      cB = window.getCompartmentAt?.(refCoord||3000, z + 50);
      orientation = 'horizontal';
    } else if (plateKey === 'tween') {
      const z = parseFloat(document.getElementById('twnDeckZ')?.value || 12900);
      cA = window.getCompartmentAt?.(refCoord||3000, z - 50);
      cB = window.getCompartmentAt?.(refCoord||3000, z + 50);
      orientation = 'horizontal';
    } else if (plateKey === 'innerBottom') {
      cA = window.getCompartmentAt?.(refCoord||3000, G.IB - 50);
      cB = window.getCompartmentAt?.(refCoord||3000, G.IB + 50);
      orientation = 'horizontal';
    } else if (plateKey === 'innerSide') {
      // Vertical — refCoord is Z (mm above BL)
      const z = refCoord || 5000;
      cA = window.getCompartmentAt?.((G.IS||10030)+50, z);   // outboard
      cB = window.getCompartmentAt?.((G.IS||10030)-50, z);   // inboard
      orientation = 'vertical';
    } else if (plateKey === 'shell') {
      // Vertical side shell (or horizontal bottom shell). Use z to decide.
      const z = refCoord || 5000;
      const R_B = G.R_B || 1800;
      if (z <= R_B) {
        // Bottom/keel/bilge region
        cA = null;  // sea
        cB = window.getCompartmentAt?.(3000, 100);  // DB tank above
        orientation = 'horizontal';
      } else {
        // Side region
        cA = null;  // sea outboard
        cB = window.getCompartmentAt?.((G.B_half||11880)-100, z);  // inboard
        orientation = 'vertical';
      }
    }
  } catch(e) {}
  return window.Buckling?.corrosionFromComps?.(cA, cB, orientation) || 'ONE_WB_VERT';
}

function handleLogoUpload(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = function(ev) {
    logoData = ev.target.result;
    document.getElementById('logoPreview').src = logoData;
    document.getElementById('logoPreview').style.display = 'block';
    document.getElementById('logoPlaceholder').style.display = 'none';
  };
  r.readAsDataURL(f);
}

function updateVariantParticulars() {
  // Built-in example only: the two variants describe the Baltic Laker. Any other
  // project (the empty one included) replays this change event on restore and
  // must keep its own particulars.
  if (!(window.Draw && window.Draw.isExampleGeometry && window.Draw.isExampleGeometry())) return;
  const v = document.getElementById('variant').value;
  console.log('[updateVariantParticulars] called with v=', v);
  const cfg = VARIANTS[v];
  if (!cfg) { console.warn('[updateVariantParticulars] no cfg for variant', v); return; }
  console.log('[updateVariantParticulars] cfg:', cfg);
  // Update L, D, Cb form inputs to the variant's default rule values.
  // B and T are intentionally NOT changed — they're the same across variants.
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val != null) el.value = val;
  };
  setVal('L', cfg.L);
  setVal('D', cfg.D);
  setVal('Cb', cfg.Cb);
  // Apply geometry overrides (UD, HC). 1B uses 15300/16350; 2A uses
  // 15500/16350 (taller depth, same coaming top elevation per user spec).
  // Two writes are needed:
  //   (a) window.Draw.GEOMETRY.UD/HC — used by computeProfiles, drawing,
  //       section-property calc, and rule checks.
  //   (b) udLevel/hcLevel form inputs — getParams() reads these and the
  //       returned `p.udLevel`/`p.hcLevel` are used by HG stress checks,
  //       overflow heights, axis labels in the drawing, etc. Writing only
  //       (a) leaves the labels/HG calc on the old level.
  if (cfg.geom) {
    const G = window.Draw && window.Draw.GEOMETRY;
    if (G) {
      for (const k in cfg.geom) G[k] = cfg.geom[k];
      console.log('[updateVariantParticulars] window.Draw.GEOMETRY now:',
                  JSON.stringify({ UD: G.UD, HC: G.HC, IB: G.IB }));
    } else {
      console.warn('[updateVariantParticulars] window.Draw.GEOMETRY missing');
    }
    // Mirror to the geometry form inputs so getParams() returns the new
    // values. id mapping: UD→udLevel, HC→hcLevel, IB→ibLevel, TT→ttLevel.
    const inputMap = { UD: 'udLevel', HC: 'hcLevel', IB: 'ibLevel', TT: 'ttLevel' };
    for (const k in cfg.geom) {
      const id = inputMap[k];
      if (id) {
        const el = document.getElementById(id);
        if (el) el.value = cfg.geom[k];
      }
    }
  }
  // Apply IS-segment profile-count override.
  if (cfg.tweenUDProfiles != null) {
    window.VARIANT_TWEEN_UD_PROFILES = cfg.tweenUDProfiles;
    console.log('[updateVariantParticulars] window.VARIANT_TWEEN_UD_PROFILES =',
                window.VARIANT_TWEEN_UD_PROFILES);
  }

  // Apply plate thickness overrides to the form inputs.
  // recalcAll() reads these IDs and writes them back into STRAKES.shell +
  // PLATE_THICKNESS on every sync — so the form is the source of truth for
  // these whole-plate-group thicknesses. Without this, switching 1B → 2A
  // would have applyExcelDefaultStrakes() write the new values into
  // STRAKES.shell, but the very next recalcAll() would read the form's
  // still-1B values and silently revert the override.
  // Mapped IDs:  keelT, bottomT, bilgeT, ibT (bottom shell + IB)
  //              deckT, coamingT             (upper deck + coaming top)
  //              dkT                         (duct keel side plate)
  //              sgT                         (side girder — single field
  //                                           applied to all SG instances)
  // Side strake thicknesses are NOT in the form (they're per-strake) —
  // they're applied by applyExcelDefaultStrakes via SIDE_PATTERN_<variant>.
  if (cfg.plateT) {
    setVal('keelT',    cfg.plateT.keel);
    setVal('bottomT',  cfg.plateT.bottom);
    setVal('bilgeT',   cfg.plateT.bilge);
    setVal('ibT',      cfg.plateT.ib);
    setVal('deckT',    cfg.plateT.deck);
    setVal('coamingT', cfg.plateT.coaming);
    setVal('dkT',      cfg.plateT.duct);
    setVal('sgT',      cfg.plateT.sg);
    // Added May 2026: stringer deck and tween deck form inputs.
    // 2A: strDeck=20, twnDeck=35. 1B doesn't ship strDeck/twnDeck in plateT
    // (they default to 10/12 from the HTML value="..." attribute), so the
    // setVal calls are guarded with != null to avoid clearing the inputs
    // when switching back to 1B.
    if (cfg.plateT.strDeck != null) setVal('strDeckT', cfg.plateT.strDeck);
    if (cfg.plateT.twnDeck != null) setVal('twnDeckT', cfg.plateT.twnDeck);
    console.log('[updateVariantParticulars] plateT applied:', cfg.plateT);
  }

  // Still-water bending moments (LR Pt 3 Ch 4 Sec 5.3.1):
  //   MsDesign input → Ms_hog (positive value, hogging max)
  //   MsSag    input → Ms_sag (negative value, sagging max)
  // 1B uses ±900,000 kN·m, 2A uses ±1,000,000 kN·m by default. User can
  // override either independently from real loading manual data.
  if (cfg.Ms_hog != null) setVal('MsDesign', cfg.Ms_hog);
  if (cfg.Ms_sag != null) setVal('MsSag',    cfg.Ms_sag);
  // Excel defaults (profile names + ice intermediates) are shared across
  // variants. The 2A geometry differs from 1B only at UD (15500 vs 15300),
  // and every Excel-pinned side-shell z (max 14700) is below both UD levels,
  // so the same pin is geometrically valid for both variants. Keeping
  // _SKIP_EXCEL_DEFAULTS = false ensures 2A inherits 1B's ice intermediates
  // and profile-name assignments instead of the bare algorithmic seed.
  window._SKIP_EXCEL_DEFAULTS = false;
  console.log('[updateVariantParticulars] window._SKIP_EXCEL_DEFAULTS =', window._SKIP_EXCEL_DEFAULTS);
  // Re-seed profiles + strakes with new geometry / profile counts.
  // computeProfiles lives inside the Draw IIFE — call it via window.Draw.
  if (window.Draw && typeof window.Draw.computeProfiles === 'function') {
    try {
      window.Draw.computeProfiles();
      console.log('[updateVariantParticulars] window.Draw.computeProfiles() ok. innerSide count=',
                  (window.Draw?.profiles?.innerSide || []).length);
      console.log('[updateVariantParticulars] innerSide z values:',
                  (window.Draw?.profiles?.innerSide || []).map(p => p.z));
    } catch (e) { console.warn('computeProfiles after variant change:', e); }
  } else {
    console.warn('[updateVariantParticulars] window.Draw.computeProfiles is not a function');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // VARIANT 2A — COMPARTMENT NODE-ID REMAP (user-specified, May 2026)
  // ───────────────────────────────────────────────────────────────────────
  // Adding 2 new stringer decks at z=10435 and z=11665 inserts 4 new nodes
  // into computeNodes()'s sorted output (IS/Stringer and Shell/Stringer at
  // each level). The Ballast and VOID compartments are defined by node ID
  // in COMPARTMENTS, so their polygons would shift to the wrong points.
  // The UD level also moves from 15300 → 15500 in 2A (unrelated to this
  // patch, but it shifts UD-row IDs too).
  //
  // Mapping (1B node id → 2A node id) for the physical points the
  // compartments reference:
  //   Ballast uses: 2,3,4,5,6,12,14,16,15,13,11,10,9,8
  //     → 16 (Shell/Tween) → 20,  15 (IS/Tween) → 19,  rest unchanged.
  //   VOID uses: 16,18,17,15
  //     → 16 → 20,  18 (Shell/UD@15300) → 22 (Shell/UD@15500),
  //       17 (IS/UD@15300) → 21,  15 (IS/Tween) → 19.
  // The DUCT compartment is rect-based (yMin/yMax/zMin/zMax) so no remap
  // needed. CARGO uses zMax=15300 (UD level) — bumped to 15500 to follow
  // 2A UD.
  // ═══════════════════════════════════════════════════════════════════════
  if (v === '2A') {
    const NODE_REMAP_2A = { 15: 19, 16: 20, 17: 21, 18: 22 };
    const remap = (id) => (NODE_REMAP_2A[id] != null ? NODE_REMAP_2A[id] : id);
    const remapNodes = (arr) => Array.isArray(arr) ? arr.map(remap) : arr;
    COMPARTMENTS.forEach(c => {
      if (Array.isArray(c.nodes)) {
        c.nodes = remapNodes(c.nodes);
      }
      // CARGO rect: bump zMax from 15300 to 15500 (UD-driven)
      if (c.name === 'CARGO' && c.zMax === 15300) c.zMax = 15500;
    });
    if (window.Draw) window.Draw.COMPARTMENTS = COMPARTMENTS;
    console.log('[updateVariantParticulars] COMPARTMENTS remapped for 2A:',
                COMPARTMENTS.map(c => c.name + ':' + JSON.stringify(c.nodes || `rect(${c.zMin}-${c.zMax})`)));
  } else {
    // Switching BACK to 1B: rebuild COMPARTMENTS from the original 1B
    // baseline so polygon ids match 1B's node layout.
    const REVERSE_REMAP_1B = { 19: 15, 20: 16, 21: 17, 22: 18 };
    const reverseRemap = (id) => (REVERSE_REMAP_1B[id] != null ? REVERSE_REMAP_1B[id] : id);
    COMPARTMENTS.forEach(c => {
      if (Array.isArray(c.nodes)) {
        c.nodes = c.nodes.map(reverseRemap);
      }
      if (c.name === 'CARGO' && c.zMax === 15500) c.zMax = 15300;
    });
    if (window.Draw) window.Draw.COMPARTMENTS = COMPARTMENTS;
    console.log('[updateVariantParticulars] COMPARTMENTS reverted to 1B:',
                COMPARTMENTS.map(c => c.name + ':' + JSON.stringify(c.nodes || `rect(${c.zMin}-${c.zMax})`)));
  }

  if (window.Draw && window.Draw.render) {
    try { window.Draw.render(); } catch (e) { console.warn('render:', e); }
  }
  recalcAll();
  if (typeof forceRefreshAnalysis === 'function') {
    try { forceRefreshAnalysis(); } catch (e) {}
  }
}
function updateMaterial() { recalcAll(); }

