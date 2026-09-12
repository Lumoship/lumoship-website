/* ==========================================================================
   80-export.js  —  Excel + PDF export
   Extracted verbatim from Index.html (lines 32154–32832 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==================== EXCEL ====================
// Exports a multi-sheet Excel workbook containing:
//   1. Plates — every strake in every group (shell, IB, IS, upperDeck, stringer,
//      tween, coamingWall, coamingTop) with position code, kind, thickness,
//      width, Y/Z coordinates, area, mass.
//   2. Longitudinal Stiffeners — every profile in every group with position
//      code, Y/Z coordinates, spacing to neighbour, profile name, section
//      properties, mass/m.
//   3. Transverse Stiffeners — frames, brackets (from TRANSVERSE_STIFFS).
//   4. Section Properties — z_NA, I_NA, Z_B, Z_D, Ms, Mw, M_max with LR
//      minimums and pass/fail status.
//   5. Ship Parameters — every form input with its value and unit.
//
// Requires SheetJS (window.XLSX) loaded in <head>.
function exportExcel() {
  if (typeof window.XLSX === 'undefined') {
    alert('Excel library not loaded. Please refresh the page and try again.');
    return;
  }
  if (!window.Draw || !window.Draw.STRAKES) {
    alert('Drawing not initialized. Please visit the Geometry page first.');
    return;
  }

  const D = window.Draw;
  const S = D.STRAKES || {};
  const P = D.profiles || {};
  const G = D.GEOMETRY || {};
  const PA = D.PARAMS || {};
  const PT = D.PLATE_THICKNESS || {};
  const STEEL_DENSITY = 7.85e-6;  // kg/mm³ = 7850 kg/m³

  // Header block — shown at the top of every sheet
  const vesselName = document.getElementById('vesselName')?.value || 'Unnamed Vessel';
  const revision = document.getElementById('revision')?.value || 'A';
  const dateStr = new Date().toISOString().slice(0, 10);
  const headerRows = [
    ['Ship:', vesselName],
    ['Revision:', revision],
    ['Date:', dateStr],
    ['Reference:', 'LR Pt 4 Ch 1 + Pt 3 Ch 4'],
    [],
  ];

  // ─── Helper: build a position code prefix per group ─────────────
  const CODE_PREFIX = {
    shell:       (s, i) => (s.kind === 'keel' ? 'K' : s.kind === 'bilge' ? 'BL' : s.kind === 'bottom' ? 'BS' : 'SS') + String(i+1).padStart(2,'0'),
    innerBottom: (s, i) => 'IB' + String(i+1).padStart(2,'0'),
    innerSide:   (s, i) => 'IS' + String(i+1).padStart(2,'0'),
    upperDeck:   (s, i) => 'UD' + String(i+1).padStart(2,'0'),
    stringer:    (s, i) => 'SD' + String(i+1).padStart(2,'0'),
    tween:       (s, i) => 'TD' + String(i+1).padStart(2,'0'),
    coamingWall: (s, i) => 'CW' + String(i+1).padStart(2,'0'),
    coamingTop:  (s, i) => 'CT' + String(i+1).padStart(2,'0'),
  };

  // ─── Sheet 1: PLATES ─────────────────────────────────────────────
  const plateRows = [
    ...headerRows,
    ['Sheet:', 'Plates (Strakes)'],
    [],
    ['Position', 'Group', 'Kind', 'Thickness (mm)', 'Width (mm)', 'WT', 'Grade', 'Class', 'Y_start (mm)', 'Y_end (mm)', 'Z_start (mm)', 'Z_end (mm)', 'Length (mm)', 'Area (m²)', 'Mass (kg)'],
  ];

  // Shell: walk along arc path (keel → bottom → bilge → side)
  let shell_cursor = 0;
  const shell_len = (typeof window.shellGeometryLengths === 'function')
    ? window.shellGeometryLengths() : null;
  (S.shell || []).forEach((s, i) => {
    const code = CODE_PREFIX.shell(s, i);
    const kind = s.kind || '';
    let y1, y2, z1, z2;
    const segStart = shell_cursor;
    const segEnd = shell_cursor + s.width;
    if (shell_len) {
      // Determine segment region + coordinates
      if (segEnd <= shell_len.keel + shell_len.bottom) {
        // horizontal along bottom at z=0
        y1 = segStart;
        y2 = segEnd;
        z1 = 0;
        z2 = 0;
      } else if (segStart >= shell_len.keel + shell_len.bottom && segEnd <= shell_len.keel + shell_len.bottom + shell_len.bilge) {
        // bilge arc
        y1 = G.B_half - (G.R_B || 1800);   // bilge start
        y2 = G.B_half;
        z1 = 0;
        z2 = G.R_B || 1800;
      } else if (segStart >= shell_len.keel + shell_len.bottom + shell_len.bilge) {
        // vertical side
        const s0 = segStart - (shell_len.keel + shell_len.bottom + shell_len.bilge);
        y1 = G.B_half;
        y2 = G.B_half;
        z1 = (G.R_B || 1800) + s0;
        z2 = z1 + s.width;
      } else {
        y1 = segStart; y2 = segEnd; z1 = 0; z2 = 0;
      }
    } else {
      y1 = y2 = z1 = z2 = '';
    }
    const area_m2 = (s.width * 2 /* half-ship → full */) * 1 /* longitudinal span = 1 m reference */ / 1e6;
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'shell', kind, s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    typeof y1 === 'number' ? Math.round(y1) : y1,
                    typeof y2 === 'number' ? Math.round(y2) : y2,
                    typeof z1 === 'number' ? Math.round(z1) : z1,
                    typeof z2 === 'number' ? Math.round(z2) : z2,
                    s.width,
                    +area_m2.toFixed(4), +mass_kg.toFixed(1)]);
    shell_cursor += s.width;
  });

  // Inner Bottom strakes (CL → B_half, at Z=IB)
  let ib_cursor = G.duct_half || 0;
  (S.innerBottom || []).forEach((s, i) => {
    const code = CODE_PREFIX.innerBottom(s, i);
    const y1 = ib_cursor, y2 = ib_cursor + s.width;
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'innerBottom', 'ibPlate', s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    Math.round(y1), Math.round(y2), G.IB, G.IB, s.width,
                    +((s.width * 2 * 1) / 1e6).toFixed(4), +mass_kg.toFixed(1)]);
    ib_cursor = y2;
  });

  // Inner Side strakes (Y=IS, IB → UD, last one is coaming wall UD → HC)
  let is_cursor = G.IB;
  (S.innerSide || []).forEach((s, i) => {
    const code = CODE_PREFIX.innerSide(s, i);
    const z1 = is_cursor, z2 = is_cursor + s.width;
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'innerSide', s.kind || 'isPlate', s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    G.IS, G.IS, Math.round(z1), Math.round(z2), s.width,
                    +((s.width * 2) / 1e6).toFixed(4), +mass_kg.toFixed(1)]);
    is_cursor = z2;
  });

  // Upper Deck (IS → B_half, at Z=UD)
  let ud_cursor = G.IS;
  (S.upperDeck || []).forEach((s, i) => {
    const code = CODE_PREFIX.upperDeck(s, i);
    const y1 = ud_cursor, y2 = ud_cursor + s.width;
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'upperDeck', 'upperDeck', s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    Math.round(y1), Math.round(y2), G.UD, G.UD, s.width,
                    +((s.width * 2) / 1e6).toFixed(4), +mass_kg.toFixed(1)]);
    ud_cursor = y2;
  });

  // Coaming Top (Z=HC, Y=IS → IS+coamingTop)
  let ct_cursor = G.IS;
  (S.coamingTop || []).forEach((s, i) => {
    const code = CODE_PREFIX.coamingTop(s, i);
    const y1 = ct_cursor, y2 = ct_cursor + s.width;
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'coamingTop', 'coamingTop', s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    Math.round(y1), Math.round(y2), G.HC, G.HC, s.width,
                    +((s.width * 2) / 1e6).toFixed(4), +mass_kg.toFixed(1)]);
    ct_cursor = y2;
  });

  // Stringer strakes (each at z_level, IS → B_half)
  (S.stringer || []).forEach((s, i) => {
    const code = CODE_PREFIX.stringer(s, i);
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'stringer', 'stringer', s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    G.IS, G.IS + s.width, s.z_level, s.z_level, s.width,
                    +((s.width * 2) / 1e6).toFixed(4), +mass_kg.toFixed(1)]);
  });

  // Tween strakes (each at z_level, IS → B_half)
  (S.tween || []).forEach((s, i) => {
    const code = CODE_PREFIX.tween(s, i);
    const mass_kg = s.width * s.thickness * 2 * (PA.transFrameSpacing || 726) * STEEL_DENSITY;
    plateRows.push([code, 'tween', 'tween', s.thickness, s.width, '', s.grade || '', s.materialClass || '',
                    G.IS, G.IS + s.width, s.z_level, s.z_level, s.width,
                    +((s.width * 2) / 1e6).toFixed(4), +mass_kg.toFixed(1)]);
  });

  // ─── Sheet 2: LONGITUDINAL STIFFENERS ─────────────────────────────
  const longRows = [
    ...headerRows,
    ['Sheet:', 'Longitudinal Stiffeners'],
    [],
    ['Position', 'Group', 'Profile', 'Y (mm)', 'Z (mm)', 'Spacing prev (mm)', 'Plate t (mm)', 'Z_section (cm³)', 'I (cm⁴)', 'Mass/m (kg)', 'Mass (kg)', 'Z_req (cm³)', 'Z_util (%)', 'Z_pass', 'dw/t', 'dw/t limit', 'dw/t pass'],
  ];

  const STIFF_GROUPS = [
    { key: 'bottomShell',   prefix: 'BS', coord: 'y', plateT: PT.shell || 14,      plateKey: 'shell',       profDefaultId: 'bottomLongProfile' },
    { key: 'innerBottom',   prefix: 'IB', coord: 'y', plateT: PT.ib || 13,         plateKey: 'innerBottom', profDefaultId: 'ibLongProfile' },
    { key: 'sideShell',     prefix: 'SS', coord: 'z', plateT: PT.shell || 14,      plateKey: 'shell',       profDefaultId: null },
    { key: 'innerSide',     prefix: 'ISL', coord: 'z', plateT: PT.is || 11,        plateKey: 'innerSide',   profDefaultId: null },
    { key: 'stringerStiff', prefix: 'SDL', coord: 'y', plateT: PT.stringer || 10,  plateKey: 'stringer',    profDefaultId: 'strDeckProfile' },
    { key: 'tweenStiff',    prefix: 'TDL', coord: 'y', plateT: PT.tween || 10,     plateKey: 'tween',       profDefaultId: 'twnDeckProfile' },
    { key: 'upperDeck',     prefix: 'UDL', coord: 'y', plateT: PT.upperDeck || 15, plateKey: 'upperDeck',   profDefaultId: 'deckLongProfile' },
    { key: 'coamingStiff',  prefix: 'CS', coord: 'y', plateT: PT.coaming || 20,    plateKey: 'coamingTop',  profDefaultId: 'coamingProfile' },
  ];

  STIFF_GROUPS.forEach(grp => {
    const arr = P[grp.key] || [];
    if (arr.length === 0) return;
    const groupProfDefault = document.getElementById(grp.profDefaultId)?.value || '';
    // Sort by coordinate for neighbour spacing
    const sorted = arr.map((p, i) => ({ ...p, _origIdx: i })).sort((a, b) => (a[grp.coord] || 0) - (b[grp.coord] || 0));
    sorted.forEach((p, dispIdx) => {
      const code = grp.prefix + String(dispIdx + 1).padStart(2, '0');
      const profName = p.profileName || groupProfDefault || '—';
      const spacing = dispIdx > 0 ? (p[grp.coord] || 0) - (sorted[dispIdx-1][grp.coord] || 0) : '';
      // Y / Z are group-dependent: bottomShell lives at z=0, side at y=B_half,
      // IB at z=IB, stringer/tween at z=z_level, etc.
      let y_mm = '', z_mm = '';
      if (grp.key === 'bottomShell') { y_mm = p.y || 0; z_mm = 0; }
      else if (grp.key === 'innerBottom') { y_mm = p.y || 0; z_mm = G.IB; }
      else if (grp.key === 'sideShell') { y_mm = G.B_half; z_mm = p.z || 0; }
      else if (grp.key === 'innerSide') { y_mm = G.IS; z_mm = p.z || 0; }
      else if (grp.key === 'upperDeck') { y_mm = p.y || 0; z_mm = G.UD; }
      else if (grp.key === 'stringerStiff') {
        y_mm = p.y || 0;
        // Guess z from first stringer plate
        const plate = (P.stringer || []).find(pl => pl.z != null);
        z_mm = plate ? plate.z : '';
      }
      else if (grp.key === 'tweenStiff') {
        y_mm = p.y || 0;
        const plate = (P.tweenDeck || []).find(pl => pl.z != null);
        z_mm = plate ? plate.z : '';
      }
      else if (grp.key === 'coamingStiff') { y_mm = p.y || 0; z_mm = G.HC; }

      // Profile section properties
      let Z_sec = '', I_sec = '', mass_m = '';
      if (profName && profName !== '—' && typeof window.sectionZWithPlate === 'function') {
        try {
          const sec = window.sectionZWithPlate(profName, spacing || 700, grp.plateT);
          if (sec) {
            Z_sec = sec.Z_min != null ? +sec.Z_min.toFixed(1) : '';
            I_sec = sec.I != null ? +sec.I.toFixed(1) : '';
            mass_m = sec.weight != null ? +sec.weight.toFixed(2) : '';
          }
        } catch (_) {}
      }
      // Per-stiffener mass: m/m × transverse frame span (approx — bulkhead to bulkhead
      // length would be more exact, but frame-spacing is the local unit mass equivalent
      // matching how the plate mass column is computed).
      const span_m = (PA.transFrameSpacing || 726) / 1000;
      const totalMass = mass_m ? +(mass_m * span_m).toFixed(2) : '';

      // ─── Rule-check additions (LR Pt 4 Ch 1) ────────────────────────
      // Match the INSPECTION PANEL exactly: _zReqForStiff() wraps the
      // calc*() chain in withLocalSpacing(s_mean) so each stiff is sized
      // by its own (gap_above + gap_below)/2 tributary width, plus its
      // bracket-corrected l_e and pinned material family.
      //
      // CRITICAL (same as Sheet 6): pass the ORIGINAL stiff reference.
      // The `p` here is a spread clone with _origIdx; _zReqForStiff uses
      // Draw.profiles[group].indexOf(stiff) to find the live object, so
      // a clone fails (returns -1) and we silently fall back to the
      // group's max-gap. Look up the live ref via _origIdx.
      const _origStiff = (typeof p._origIdx === 'number') ? (P[grp.key]?.[p._origIdx] || p) : p;
      let Z_req = '', Z_util = '', Z_pass = '';
      if (typeof window._zReqForStiff === 'function') {
        try {
          const zr = window._zReqForStiff(grp.key, _origStiff);
          if (zr && isFinite(zr) && zr > 0) {
            Z_req = +zr.toFixed(1);
            if (Z_sec && Z_sec > 0) {
              Z_util = +(zr / Z_sec * 100).toFixed(1);
              Z_pass = (Z_sec >= zr) ? 'PASS' : 'FAIL';
            }
          } else {
            // Z_req returned 0 → governed by hull-girder/buckling only, no local Z requirement
            Z_req = 0;
            Z_pass = 'N/A';
          }
        } catch (_) {}
      }

      let dwt_val = '', dwt_lim = '', dwt_pass = '';
      if (profName && profName !== '—' && typeof window.checkProfileSlenderness === 'function') {
        try {
          const kL_val = parseFloat(document.getElementById('kL')?.value) || 1.0;
          const sl = window.checkProfileSlenderness(profName, kL_val);
          if (sl && isFinite(sl.ratio)) {
            dwt_val  = +sl.ratio.toFixed(2);
            dwt_lim  = +sl.limit.toFixed(2);
            dwt_pass = sl.ok ? 'PASS' : 'FAIL';
          }
        } catch (_) {}
      }

      longRows.push([code, grp.key, profName,
                     typeof y_mm === 'number' ? Math.round(y_mm) : y_mm,
                     typeof z_mm === 'number' ? Math.round(z_mm) : z_mm,
                     spacing || '', grp.plateT, Z_sec, I_sec, mass_m, totalMass,
                     Z_req, Z_util, Z_pass, dwt_val, dwt_lim, dwt_pass]);
    });
  });

  // ─── Sheet 3: TRANSVERSE STIFFENERS ───────────────────────────────
  const transRows = [
    ...headerRows,
    ['Sheet:', 'Transverse Stiffeners'],
    [],
    ['Position', 'Group', 'Profile/Type', 'Y (mm)', 'Z (mm)', 'Length (mm)', 'Notes'],
  ];
  const transData = D.TRANSVERSE_STIFFS || [];
  transData.forEach((t, i) => {
    const code = 'T' + String(i+1).padStart(2, '0');
    transRows.push([
      code,
      t.group || t.type || 'transverse',
      t.profile || t.profileName || t.size || '—',
      t.y != null ? Math.round(t.y) : (t.y_mm != null ? Math.round(t.y_mm) : ''),
      t.z != null ? Math.round(t.z) : (t.z_mm != null ? Math.round(t.z_mm) : ''),
      t.length || t.span || '',
      t.note || t.description || ''
    ]);
  });
  if (transData.length === 0) {
    transRows.push(['(no transverse stiffeners defined)', '', '', '', '', '', '']);
  }
  // Include brackets if present
  const brackets = D.BRACKETS || [];
  if (brackets.length > 0) {
    transRows.push([]);
    transRows.push(['Brackets:']);
    transRows.push(['ID', 'At Node', 'Type', 'Size (mm)', 'Plate t (mm)', '', '']);
    brackets.forEach((b, i) => {
      transRows.push([
        'BR' + String(i+1).padStart(2,'0'),
        b.nodeId || b.atNode || '',
        b.type || 'standard',
        b.armLength || b.size || '',
        b.thickness || '',
        '', ''
      ]);
    });
  }

  // ─── Sheet 4: SECTION PROPERTIES ──────────────────────────────────
  const secRows = [
    ...headerRows,
    ['Sheet:', 'Section Properties'],
    [],
    ['Property', 'Value', 'Unit', 'Required (LR min)', 'Ratio', 'Status'],
  ];

  // Compute section + analysis
  let sp = null, ls = null;
  try {
    sp = D.computeSectionProperties ? D.computeSectionProperties() : null;
    const p_form = (typeof getParams === 'function') ? getParams() : null;
    if (p_form && typeof runLongStrengthAnalysis === 'function') {
      ls = runLongStrengthAnalysis();
    }
  } catch (_) {}

  if (sp) {
    secRows.push(['Total section area', +(sp.totalArea / 100).toFixed(0), 'cm²', '', '', '']);
    secRows.push(['Neutral axis z_NA (from BL)', +(sp.NA / 1000).toFixed(3), 'm', '', '', '']);
  }
  if (ls && ls.compliance) {
    const c = ls.compliance;
    secRows.push(['I_NA', +c.I.actual_m4.toFixed(3), 'm⁴', +c.I.required_m4.toFixed(3), +c.I.ratio.toFixed(3), c.I.pass ? 'PASS' : 'FAIL']);
    secRows.push(['Z_B (keel)', +c.Z_B.actual_m3.toFixed(3), 'm³', +c.Z_B.required_m3.toFixed(3), +c.Z_B.ratio.toFixed(3), c.Z_B.pass ? 'PASS' : 'FAIL']);
    secRows.push(['Z_D (deck)', +c.Z_D.actual_m3.toFixed(3), 'm³', +c.Z_D.required_m3.toFixed(3), +c.Z_D.ratio.toFixed(3), c.Z_D.pass ? 'PASS' : 'FAIL']);
    secRows.push([]);
    secRows.push(['Loading:']);
    const p_form = (typeof getParams === 'function') ? getParams() : {};
    secRows.push(['M_s (still water)', p_form.Ms_design || 0, 'kN·m', '', '', '']);
    secRows.push(['M_w hog', +ls.Mw_hog.toFixed(0), 'kN·m', '', '', '']);
    secRows.push(['M_w sag', +ls.Mw_sag.toFixed(0), 'kN·m', '', '', '']);
    const M_hog = Math.abs(ls.M_total_hog);
    const M_sag = Math.abs(ls.M_total_sag);
    const M_max = Math.max(M_hog, M_sag);
    const gov = M_hog >= M_sag ? 'hogging' : 'sagging';
    secRows.push(['M_max (governing)', +M_max.toFixed(0), 'kN·m', '', '', gov]);
    secRows.push([]);
    secRows.push(['Permissible stresses:']);
    secRows.push(['σ_amid (permissible)', +ls.sigma_amid.toFixed(1), 'N/mm²', '', '', '']);
    secRows.push(['τ (permissible shear)', +ls.tau.toFixed(1), 'N/mm²', '', '', '']);
    secRows.push([]);
    secRows.push(['F factors:']);
    secRows.push(['F_D (section)', +(ls.F_D || 0).toFixed(3), '—', '', '', '']);
    secRows.push(['F_B (section)', +(ls.F_B || 0).toFixed(3), '—', '', '', '']);
    secRows.push(['C_1 (wave)', +ls.C1.toFixed(3), '—', '', '', '']);
  } else {
    secRows.push(['(analysis not available)', '', '', '', '', '']);
  }

  // ─── Sheet 5: SHIP PARAMETERS ─────────────────────────────────────
  const paramRows = [
    ...headerRows,
    ['Sheet:', 'Ship Parameters'],
    [],
    ['Field ID', 'Label', 'Value', 'Unit'],
  ];

  // Pull every form input on the page, labelled where possible.
  // A small mapping for units: anything not matched gets '—'.
  const UNIT_HINTS = {
    L: 'm', B: 'm', D: 'm', T: 'm',
    Cb: '—',
    kL: '—', k: '—',
    FB: '—', FD: '—',
    MsDesign: 'kN·m',
    ibLevel: 'mm', udLevel: 'mm', ttLevel: 'mm', hcLevel: 'mm',
    duct_half: 'mm', B_half: 'mm',
    bottomT: 'mm', keelT: 'mm', ibT: 'mm', bilgeT: 'mm',
    deckT: 'mm', strDeckT: 'mm', twnDeckT: 'mm', coamingT: 'mm',
    bottomLongSpacing: 'mm', ibLongSpacing: 'mm', deckLongSpacing: 'mm',
    strDeckSpacing: 'mm', twnDeckSpacing: 'mm', coamingLongSpacing: 'mm',
    transFrameSpacing: 'mm', le: 'm', coamingTop: 'mm',
    strDeckLevel: 'mm', twnDeckLevel: 'mm',
  };
  document.querySelectorAll('input, select').forEach(el => {
    if (!el.id) return;
    // Skip our own editor internals and non-input elements.
    if (el.classList.contains('ed-input') || el.classList.contains('ed-profile-row-select')) return;
    const val = el.type === 'checkbox' ? (el.checked ? 'yes' : 'no') : el.value;
    // Try to find a visible label. Many inputs in the tool are labelled by
    // their preceding <label class="ea-label">, so walk up to find one.
    let labelText = '';
    let parent = el.parentElement;
    for (let depth = 0; parent && depth < 3; depth++) {
      const lbl = parent.querySelector('.ea-label, label');
      if (lbl && lbl.textContent) { labelText = lbl.textContent.trim(); break; }
      parent = parent.parentElement;
    }
    const unit = UNIT_HINTS[el.id] || (/\b(mm|m|kg|cm|kN)\b/.test(labelText) ? (labelText.match(/\b(mm|m|kg|cm|kN\S*)\b/)?.[1] || '—') : '—');
    paramRows.push([el.id, labelText, val, unit]);
  });

  // ─── Sheet 6: RULE CHECK EXPORT ───────────────────────────────────
  // Machine-readable sheet designed to be imported by the standalone
  // profile section tool. Each row carries everything needed to repeat
  // the LR rule check externally: location code, ship globals, local
  // load parameters (s, l_e, h, ρ), the Z_required already computed by
  // this tool, and a profile-class hint (HP/L/FB) for the d_w/t branch.
  //
  // Schema (header in row 1, data from row 2):
  //   Position | Profile | ProfileClass | LocationCode | Group |
  //   L_m | k | kL | s_mm | le_m | h_m | rho |
  //   Z_section_cm3 | Z_req_cm3 | Z_util_pct | Z_pass |
  //   dw_mm | tw_mm | dw_t | dw_t_limit | dw_t_pass
  const rcRows = [
    ['Position', 'Profile', 'ProfileClass', 'LocationCode', 'Group',
     'L_m', 'k', 'kL', 's_mm', 'le_m', 'h_m', 'rho',
     'Z_section_cm3', 'Z_req_cm3', 'Z_util_pct', 'Z_pass',
     'dw_mm', 'tw_mm', 'dw_t', 'dw_t_limit', 'dw_t_pass'],
  ];

  // Map internal group keys → LR location code used by the profile tool.
  // For innerBottom / stringerStiff / tweenStiff we cannot decide cargo-vs-tank
  // without compartment context, so we use the most common case and let the
  // profile tool override if needed.
  const GROUP_TO_LOCATION = {
    bottomShell:   'shell-bottom',
    sideShell:     'shell-side',
    innerBottom:   'tank-crown',   // IB top often forms tank bottom
    innerSide:     'tank-bhd',     // double-skin tank wall
    upperDeck:     'deck-cargo',
    stringerStiff: 'deck-cargo',
    tweenStiff:    'deck-cargo',
    coamingStiff:  'deck-cargo',   // hatch coaming → treat as cargo deck stiffener
  };

  // Map profile name → class hint (HP / L / FB / T) by checking the catalogs.
  function profileClassOf(name) {
    if (!name || name === '—') return '';
    if (typeof HP_CATALOG !== 'undefined' && HP_CATALOG.find(p => p.name === name)) return 'HP';
    if (typeof L_CATALOG  !== 'undefined' && L_CATALOG .find(p => p.name === name)) return 'L';
    if (typeof FB_CATALOG !== 'undefined' && FB_CATALOG.find(p => p.name === name)) return 'FB';
    return '';
  }

  // Read ship globals once
  const shipL  = parseFloat(document.getElementById('L')?.value)  || 0;
  const shipK  = parseFloat(document.getElementById('k')?.value)  || 1.0;
  const shipKL = parseFloat(document.getElementById('kL')?.value) || 1.0;
  const shipLe = parseFloat(document.getElementById('le')?.value) || 0;

  // Walk through the same STIFF_GROUPS we walked for Sheet 2 — but this time
  // emit the rule-check schema instead of geometry.
  STIFF_GROUPS.forEach(grp => {
    const arr = P[grp.key] || [];
    if (arr.length === 0) return;
    const groupProfDefault = document.getElementById(grp.profDefaultId)?.value || '';
    const sorted = arr.map((p, i) => ({ ...p, _origIdx: i })).sort((a, b) => (a[grp.coord] || 0) - (b[grp.coord] || 0));

    // Default spacing per group (used only when this stiff has no neighbour
    // before it in the sorted list, i.e. dispIdx === 0).
    const SPACING_FIELD = {
      bottomShell:   'bottomLongSpacing',
      innerBottom:   'ibLongSpacing',
      upperDeck:     'deckLongSpacing',
      stringerStiff: 'strDeckSpacing',
      tweenStiff:    'twnDeckSpacing',
      coamingStiff:  'coamingLongSpacing',
    };

    sorted.forEach((p, dispIdx) => {
      const code = grp.prefix + String(dispIdx + 1).padStart(2, '0');
      const profName = p.profileName || groupProfDefault || '—';
      const profClass = profileClassOf(profName);

      let spacing;
      if (dispIdx > 0) {
        spacing = (p[grp.coord] || 0) - (sorted[dispIdx-1][grp.coord] || 0);
      } else {
        const defaultField = SPACING_FIELD[grp.key];
        const defaultEl = defaultField ? document.getElementById(defaultField) : null;
        spacing = (defaultEl && parseFloat(defaultEl.value)) || 700;
      }

      // Z_section
      let Z_sec = '';
      if (profName && profName !== '—' && typeof window.sectionZWithPlate === 'function') {
        try {
          const sec = window.sectionZWithPlate(profName, spacing || 700, grp.plateT);
          if (sec && sec.Z_min != null) Z_sec = +sec.Z_min.toFixed(1);
        } catch (_) {}
      }

      // Z_req — match the INSPECTION PANEL exactly.
      // The panel that opens when the user clicks a stiff (e.g. "Bottom Shell
      // Longitudinal 8") shows the REQUIRED Z computed for THAT specific
      // stiffener with its own tributary load width
      // s_mean = (gap_above + gap_below)/2 (LR Pt 4 Ch 1 Sec 1.5).
      // _zReqForStiff() does exactly this — wraps the calc*() chain in
      // withLocalSpacing(s_mean, ...) plus per-stiff l_e (bracket-corrected)
      // and material family.
      //
      // CRITICAL: must pass the ORIGINAL stiff reference from window.Draw.
      // profiles[group], not the spread-cloned object `p`. _zReqForStiff
      // does `Draw.profiles[group].indexOf(stiff)` to locate the stiff
      // (so it can compute its own s_mean from neighbour gaps); a cloned
      // object fails the indexOf check (-1), so s_mean stays null, the
      // local-spacing override is never applied, and realLongSpacing
      // falls back to the group's max-gap — giving us the wrong (larger)
      // panel-summary value (~140 cm³) instead of the per-stiff value
      // (~108 cm³) the inspector shows. Use _origIdx to find the live
      // object.
      const _origStiff = (typeof p._origIdx === 'number') ? (P[grp.key]?.[p._origIdx] || p) : p;
      let Z_req = 0, Z_util = '', Z_pass = '';
      if (typeof window._zReqForStiff === 'function') {
        try {
          const zr = window._zReqForStiff(grp.key, _origStiff);
          if (zr && isFinite(zr) && zr > 0) {
            Z_req = +zr.toFixed(1);
            if (Z_sec && Z_sec > 0) {
              Z_util = +(zr / Z_sec * 100).toFixed(1);
              Z_pass = (Z_sec >= zr) ? 'PASS' : 'FAIL';
            }
          } else {
            Z_pass = 'N/A';
          }
        } catch (_) {}
      }

      // d_w/t check
      let dw_mm = '', tw_mm = '', dwt = '', dwt_lim = '', dwt_pass = '';
      if (profName && profName !== '—') {
        try {
          // Pull web depth & thickness directly from the catalogs so we report
          // the actual mm values (the slenderness check itself returns a ratio).
          const HP_e = (typeof HP_CATALOG !== 'undefined') ? HP_CATALOG.find(p => p.name === profName) : null;
          const L_e  = (typeof L_CATALOG  !== 'undefined') ? L_CATALOG .find(p => p.name === profName) : null;
          const FB_e = (typeof FB_CATALOG !== 'undefined') ? FB_CATALOG.find(p => p.name === profName) : null;
          if      (HP_e) { dw_mm = HP_e.b; tw_mm = HP_e.t; }
          else if (L_e)  { dw_mm = L_e.a;  tw_mm = L_e.t; }
          else if (FB_e) { dw_mm = FB_e.h; tw_mm = FB_e.t; }
          if (typeof window.checkProfileSlenderness === 'function') {
            const sl = window.checkProfileSlenderness(profName, shipKL || 1.0);
            if (sl && isFinite(sl.ratio)) {
              dwt      = +sl.ratio.toFixed(2);
              dwt_lim  = +sl.limit.toFixed(2);
              dwt_pass = sl.ok ? 'PASS' : 'FAIL';
            }
          }
        } catch (_) {}
      }

      // h and ρ — the tool computes h internally via _zReqForStiff but does
      // not surface it. We leave these blank so downstream tooling knows the
      // pre-computed Z_req already accounts for them. (External users wanting
      // to recompute Z_req from scratch should see Sheet 5 'Parameters' for
      // ship-level inputs and the geometry sheets for tank coordinates.)
      const h_m = '';   // not exposed by _zReqForStiff
      const rho = '';   // not exposed by _zReqForStiff

      rcRows.push([
        code, profName, profClass, GROUP_TO_LOCATION[grp.key] || '', grp.key,
        shipL || '', shipK || '', shipKL || '',
        spacing || '', shipLe || '', h_m, rho,
        Z_sec, Z_req, Z_util, Z_pass,
        dw_mm, tw_mm, dwt, dwt_lim, dwt_pass
      ]);
    });
  });

  // ─── Build workbook ───────────────────────────────────────────────
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();

  const aoaToSheet = (aoa, colWidths) => {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }));
    return ws;
  };
  XLSX.utils.book_append_sheet(wb, aoaToSheet(plateRows, [10, 14, 14, 14, 12, 8, 8, 8, 12, 12, 12, 12, 12, 12, 12]), 'Plates');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(longRows,  [10, 14, 18, 12, 12, 14, 12, 14, 12, 12, 12, 12, 10, 10, 10, 10, 10]), 'Longitudinals');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(transRows, [10, 14, 18, 12, 12, 12, 30]), 'Transverse');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(secRows,   [28, 14, 10, 14, 10, 10]), 'Section');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(paramRows, [20, 36, 14, 8]), 'Parameters');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(rcRows,    [10, 18, 12, 14, 14, 8, 8, 8, 8, 8, 8, 8, 12, 12, 10, 10, 8, 8, 8, 10, 10]), 'RuleCheckExport');

  // Download
  const safeName = vesselName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}_midship_${dateStr}.xlsx`;
  XLSX.writeFile(wb, filename);
}
window.exportExcel = exportExcel;


// ==================== PDF ====================
function exportPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const lm = 15, rm = 15, pw = 210, cw = pw - lm - rm;
  let y = 12;
  
  const v = document.getElementById('vesselName').value || '-';
  const variant = document.getElementById('variant').value;
  const rv = document.getElementById('revision').value || 'A';
  const dt = document.getElementById('analysisDate').value || new Date().toLocaleDateString('en-GB');
  const pb = document.getElementById('preparedBy').value || '-';
  const w = calcWeight();
  
  if (logoData) { try { doc.addImage(logoData, 'PNG', lm, 8, 50, 20); } catch(e) {} }
  
  const hx = 120;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Date', hx, y + 4); doc.setFont('helvetica','normal'); doc.text(dt, hx+20, y+4); y += 6;
  doc.setFont('helvetica','bold'); doc.text('Variant', hx, y+4); doc.setFont('helvetica','normal'); doc.text(variant, hx+20, y+4); y += 6;
  doc.setFont('helvetica','bold'); doc.text('By', hx, y+4); doc.setFont('helvetica','normal'); doc.text(pb, hx+20, y+4);
  
  y = 35;
  doc.setDrawColor(59, 130, 246); doc.setLineWidth(1.5); doc.line(lm, y, pw-rm, y); y += 10;
  doc.setFontSize(16); doc.setFont('helvetica','bold'); doc.text('Midship Scantling Summary', lm, y); y += 6;
  doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(80,80,80);
  // Was hardcoded to 'Baltic Laker GC', so every report printed that ship's
  // name whatever project was open. `v` is the live vessel name.
  doc.text((v || 'Midship Section') + ' — LR Pt 4 Ch 1', lm, y); y += 10;
  
  doc.setFillColor(240,248,255); doc.setDrawColor(59,130,246);
  doc.rect(lm, y, cw, 14, 'FD');
  doc.setFontSize(9); doc.setTextColor(60,60,60);
  doc.text('Vessel: ' + v, lm+5, y+6);
  doc.text('Variant: ' + variant + ' | Rev: ' + rv, lm+5, y+11);
  y += 22;
  
  // Weight summary
  doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(0,0,0);
  doc.text('Weight Summary (Variant 1B, cargo + taper region)', lm, y); y += 6;
  doc.setFontSize(9); doc.setFont('helvetica','normal');
  doc.text('Plate Weight:      ' + w.W_plate.toFixed(0) + ' ton', lm, y); y += 5;
  doc.text('Longitudinal Wt:  ' + w.W_long.toFixed(0) + ' ton', lm, y); y += 5;
  doc.text('GRAND TOTAL:    ' + w.total.toFixed(0) + ' ton', lm, y); y += 10;
  
  doc.setFont('helvetica','bold');
  doc.text('See web tool for detailed scantling per element.', lm, y);
  
  doc.setDrawColor(200,200,200); doc.setLineWidth(0.3); doc.line(lm, 282, pw-rm, 282);
  doc.setFontSize(7); doc.setTextColor(128,128,128);
  doc.text('Midship Scantling Viewer — EA Engineering Tools', lm, 287);
  
  doc.save('BalticLakerGC_' + variant + '_Rev' + rv + '.pdf');
}

