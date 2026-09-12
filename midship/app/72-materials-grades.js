/* ==========================================================================
   72-materials-grades.js  —  LR Pt 3 Ch 2 material grade assignment
   Extracted verbatim from Index.html (lines 31570–32153 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// =========================================================================
// MATERIAL GRADES — LR Pt 3 Ch 2 Tables 2.2.1 / 2.2.2 / 2.2.3
// -------------------------------------------------------------------------
// Two-stage assignment:
//   1. Each plate gets a "material class" (I / II / III) based on its
//      structural category (Table 2.2.1). Categories depend on ship type,
//      longitudinal position (within/outside 0.4L / 0.6L amidships), and
//      which strake the plate is (keel, bilge, sheerstrake, coaming, etc.)
//   2. Thickness then picks the grade from Table 2.2.2 (Class × t ranges).
//   3. If design air temp < −10°C, Table 2.2.3 raises the minimum.
//
// Steel family ('HT' or 'Mild') selects the column: AH-series vs A-series.
// Users can override per-strake via the editor grade dropdown.
// =========================================================================

// Resolve the material class (I / II / III) for one plate, given:
//   group       — STRAKES group key ('shell', 'innerBottom', 'innerSide', ...)
//   strakeIdx   — index of the strake within its group
//   kind        — optional kind ('keel', 'bottom', 'bilge', 'side', 'coamingWall', etc)
//   isUppermostSide — true if this is the top side strake (sheerstrake)
//   context     — {shipType, withinP4L, withinP6L, L_ship}
// Returns: 'I' | 'II' | 'III' | null (outside 0.6L → no class tightening)
function _resolveMaterialClass(group, strakeIdx, strake, context) {
  const within04 = context.within04;
  const within06 = context.within06;
  const shipType = context.shipType || 'general_cargo';
  const L_ship   = context.L_ship || 200;
  const kind     = strake.kind;

  // --- SPECIAL CATEGORY (Class III within 0.4L, Class II 0.4–0.6L, Class I outside) ---
  // Sheerstrake & stringer plate at strength deck  — C1
  // Bilge strake                                    — C6 (L<150, DB) or C7 (others)
  // Hatch coamings length > 0.15·L                  — C8
  // Hatch corner deck plating                       — C4 (bulk carriers), C3 (containers)
  if (group === 'coamingWall' || group === 'coamingTop') {
    // C8: longitudinal hatch coaming (if > 0.15·L)
    // We don't know coaming length here — assume yes for cargo/bulk ships.
    if (shipType !== 'tanker') {
      if (within04) return 'III';
      if (within06) return 'II';
      return 'I';
    }
  }
  // Sheerstrake: the uppermost side strake of the shell (top of side region)
  if (group === 'shell' && kind === 'side' && context.isSheerstrake) {
    if (within04) return 'III';
    if (within06) return 'II';
    return 'I';
  }
  // Bilge strake
  if (group === 'shell' && kind === 'bilge') {
    if (L_ship < 150) {
      // C6 — ships with DB over full breadth and length < 150 m
      return within06 ? 'II' : 'I';
    }
    // C7 — other ships (incl. this one at 199 m)
    if (within04) return 'III';
    if (within06) return 'II';
    return 'I';
  }
  // Stringer plate at strength deck (at the sheer line) — currently not
  // separately modelled; upperDeck covers this. If upperDeck is adjacent to
  // the side shell (always true here) its outermost strake is C1.
  // For simplicity we treat the whole upper deck as Primary (B2) below;
  // users can upgrade manually.

  // --- PRIMARY CATEGORY (Class II within 0.4L, Grade A/AH outside) ---
  // Bottom plating incl. keel  — B1
  // Strength (upper) deck      — B2
  // Continuous longitudinal above strength deck (not coaming) — B3
  // Uppermost strake in longitudinal bulkhead — B4
  if (group === 'shell' && (kind === 'keel' || kind === 'bottom')) {
    return within04 ? 'II' : null;  // null → Grade A/AH minimum (below)
  }
  if (group === 'upperDeck') {
    return within04 ? 'II' : null;
  }
  // IS-6 (last innerSide, kind='coamingWall') = B4 — uppermost strake of
  // longitudinal bulkhead (the IS is the longitudinal bulkhead here).
  if (group === 'innerSide' && kind === 'coamingWall') {
    return within04 ? 'II' : null;
  }

  // --- SECONDARY CATEGORY (Class I within 0.4L, Grade A/AH outside) ---
  // Longitudinal bulkhead strakes (other than B4 above) — A1
  // Weather-deck plating, other than B2                — A2
  // Side plating                                        — A3
  if (group === 'innerSide') {
    return within04 ? 'I' : null;
  }
  if (group === 'shell' && kind === 'side' && !context.isSheerstrake) {
    return within04 ? 'I' : null;
  }
  // Stringer / tween decks — these are internal decks, treated as A1/A2 equivalent
  if (group === 'stringer' || group === 'tween') {
    return within04 ? 'I' : null;
  }
  // Inner bottom — Primary (double-bottom top plating carries cargo loads)
  if (group === 'innerBottom') {
    return within04 ? 'II' : null;
  }

  // Unknown / fallback: treat as Secondary
  return within04 ? 'I' : null;
}

// Given a material class ('I'|'II'|'III'|null), plate thickness, steel family,
// and design air temp, return the required grade per LR Tables 2.2.2 + 2.2.3.
// =========================================================================
// ZONE MATERIAL RESOLVER  (Apr 2026 — Setup-driven yield strength selection)
// -------------------------------------------------------------------------
// Reads the three zone selectors from Setup (zoneMaterialDB / Side / Coaming)
// and resolves which yield-strength family (Mild/AH32/AH36/AH40) applies
// at a given z-coordinate.
//
// Zones (z in mm above baseline):
//   • Double Bottom: 0 ≤ z < IB level
//   • Side / Cargo:  IB level ≤ z < UD level
//   • Coaming:       UD level ≤ z ≤ HC level
//
// Used by:
//   - assignMaterialGrades() → picks the family before applying LR table
//   - inspector "auto-suggest" hints (future)
//
// Returns one of: "MS", "AH32", "AH36", "AH40". Falls back to the global
// `material` dropdown when a zone selector is missing or empty.
// =========================================================================
function getZoneMaterialAt(z_mm) {
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  const IB_mm = G.IB || 1800;
  const UD_mm = G.UD || 15300;
  const fallback = document.getElementById('material')?.value || 'AH36';
  let zoneId;
  if (z_mm < IB_mm)        zoneId = 'zoneMaterialDB';
  else if (z_mm < UD_mm)   zoneId = 'zoneMaterialSide';
  else                     zoneId = 'zoneMaterialCoaming';
  return document.getElementById(zoneId)?.value || fallback;
}
window.getZoneMaterialAt = getZoneMaterialAt;

// Returns the zone label ('DB' / 'Side' / 'Coaming') for a z-coordinate.
function getZoneAt(z_mm) {
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  const IB_mm = G.IB || 1800;
  const UD_mm = G.UD || 15300;
  if (z_mm < IB_mm)        return 'DB';
  else if (z_mm < UD_mm)   return 'Side';
  else                     return 'Coaming';
}
window.getZoneAt = getZoneAt;

// Called when user changes any of the three zone material dropdowns in
// Setup. Re-runs grade assignment in silent mode (no alert, no view-mode
// switch) so every plate immediately picks up the new family. Manual
// per-strake overrides (gradeManual flag) are preserved.
function onZoneMaterialChange() {
  if (typeof window.assignMaterialGrades === 'function') {
    try { window.assignMaterialGrades({ silent: true }); } catch(e) { console.warn(e); }
  }
  // recalcAll triggers downstream rendering; protect against early-init
  // edge cases where some dependent functions aren't yet wired up.
  try {
    if (typeof recalcAll === 'function') recalcAll();
  } catch (e) { /* silent — non-essential UI refresh */ }
}
window.onZoneMaterialChange = onZoneMaterialChange;

// Convenience: look up the zone material for a STRAKE in a given group.
// Uses the strake's centre z when available; for groups without per-strake
// z (e.g. innerBottom — all at IB level), uses the group's plate level.
function getZoneMaterialForStrake(groupKey, strake) {
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  let z_mm = null;
  if (strake && typeof strake.z === 'number') {
    z_mm = strake.z;
  } else if (groupKey === 'innerBottom') {
    z_mm = G.IB - 1;        // just below IB so it falls into DB zone
  } else if (groupKey === 'shell') {
    // Shell strakes vary; use kind to bias
    if (strake?.kind === 'side') z_mm = (G.IB + G.UD) / 2;       // mid-side
    else if (strake?.kind === 'bilge') z_mm = G.IB / 2;           // bottom half
    else                                z_mm = 100;               // keel/bottom
  } else if (groupKey === 'innerSide') {
    z_mm = (G.IB + G.UD) / 2;
  } else if (groupKey === 'upperDeck') {
    z_mm = G.UD;
  } else if (groupKey === 'stringer' || groupKey === 'stringerStiff') {
    z_mm = G.TT || (G.IB + G.UD) / 2;
  } else if (groupKey === 'tween' || groupKey === 'tweenStiff') {
    z_mm = G.TT || (G.IB + G.UD) / 2;
  } else if (groupKey === 'coamingTop' || groupKey === 'coamingWall' || groupKey === 'coamingStiff') {
    z_mm = G.HC || G.UD + 500;
  } else {
    z_mm = G.UD / 2;        // generic fallback
  }
  return getZoneMaterialAt(z_mm);
}
window.getZoneMaterialForStrake = getZoneMaterialForStrake;

// =========================================================================
// LONG → STRAKE ASSOCIATION  (Apr 2026 — profile inherits plate's grade)
// -------------------------------------------------------------------------
// A longitudinal stiffener sits on a plate. Its material grade should
// follow the plate's grade by default — same family, same toughness —
// because they form a single load-carrying assembly.
//
// getStrakeForLong(group, idx) → returns the strake object the long is
// attached to, by mapping the long's coordinate onto the strake spans.
//
// getInheritedGradeForLong(group, idx)  → returns the strake's grade
// getInheritedFamilyForLong(group, idx) → returns the strake's family
//
// If the long has been manually overridden (gradeManual / familyManual),
// callers should respect that and skip the inheritance.
// =========================================================================
function getStrakeForLong(group, idx) {
  const D = window.Draw;
  if (!D) return null;
  const profArr = D.profiles?.[group];
  if (!profArr || !profArr[idx]) return null;
  const prof = profArr[idx];

  // Map stiffener group → parent plate group
  const PARENT = {
    bottomShell:   'shell',
    sideShell:     'shell',
    innerBottom:   'innerBottom',
    innerSide:     'innerSide',
    upperDeck:     'upperDeck',
    stringerStiff: 'stringer',
    tweenStiff:    'tween',
    coamingStiff:  'coamingTop',
  };
  const parent = PARENT[group];
  if (!parent) return null;
  const strakes = D.STRAKES?.[parent];
  if (!Array.isArray(strakes) || strakes.length === 0) return null;

  // For shell, walk along the keel-bottom-bilge-side path. The shell
  // strakes are stored in order from keel outward; bottomShell longs
  // (y-coord) sit on bottom/keel/bilge strakes; sideShell longs (z)
  // sit on side strakes.
  if (parent === 'shell') {
    if (group === 'bottomShell') {
      // y-coordinate maps along bottom strake spans
      const y_mm = prof.y || 0;
      let cursor = 0;
      // Bottom strakes: keel + bottom + bilge — kind in {keel, bottom, bilge}
      for (const s of strakes) {
        if (s.kind === 'side') break;     // we've left the bottom region
        if (y_mm >= cursor && y_mm <= cursor + (s.width || 0)) return s;
        cursor += (s.width || 0);
      }
      // Past the last bottom strake — return the bilge (closest)
      const last = strakes.filter(s => s.kind !== 'side').pop();
      return last || strakes[0];
    }
    if (group === 'sideShell') {
      // z-coordinate maps along side strake spans, starting at the
      // top of bilge (where side begins). Use side strakes only.
      // FIX (Apr 2026): cursor starts at G.R_B, not G.IB. The shell side
      // segment physically begins at Z = R_B (post-bilge), see
      // shellPathPointAt(). When the user sets IB ≠ R_B independently,
      // starting at IB shifts the strake walk by (IB - R_B) mm and
      // misroutes longs to the wrong strake.
      const z_mm = prof.z || 0;
      const sideStrakes = strakes.filter(s => s.kind === 'side');
      if (sideStrakes.length === 0) return strakes[strakes.length - 1];
      const G = D.GEOMETRY || {};
      let cursor = (G.R_B != null) ? G.R_B : (G.IB || 1800);
      for (const s of sideStrakes) {
        if (z_mm >= cursor && z_mm <= cursor + (s.width || 0)) return s;
        cursor += (s.width || 0);
      }
      return sideStrakes[sideStrakes.length - 1];
    }
  }

  // For inner bottom: longs run in y direction; all IB strakes are at IB level.
  // Use y to find which strake.
  if (parent === 'innerBottom') {
    const y_mm = prof.y || 0;
    let cursor = 0;
    for (const s of strakes) {
      if (y_mm >= cursor && y_mm <= cursor + (s.width || 0)) return s;
      cursor += (s.width || 0);
    }
    return strakes[strakes.length - 1];
  }

  // For inner side: longs run in z direction; all IS strakes are vertical.
  if (parent === 'innerSide') {
    const z_mm = prof.z || 0;
    const G = D.GEOMETRY || {};
    let cursor = G.IB || 1800;
    for (const s of strakes) {
      if (z_mm >= cursor && z_mm <= cursor + (s.width || 0)) return s;
      cursor += (s.width || 0);
    }
    return strakes[strakes.length - 1];
  }

  // Single-strake plates (coaming, decks): just use [0]
  return strakes[0];
}
window.getStrakeForLong = getStrakeForLong;

function getInheritedGradeForLong(group, idx) {
  const s = getStrakeForLong(group, idx);
  if (s && s.grade) return s.grade;
  // Fall back: the whole-plate group's PLATE_GRADE (e.g. upperDeck)
  const PARENT = {
    upperDeck: 'upperDeck', stringerStiff: 'stringer', tweenStiff: 'tween',
    coamingStiff: 'coamingTop',
  };
  const wp = PARENT[group];
  if (wp && window.PLATE_GRADE?.[wp]) return window.PLATE_GRADE[wp];
  return '';
}
window.getInheritedGradeForLong = getInheritedGradeForLong;

function getInheritedFamilyForLong(group, idx) {
  const s = getStrakeForLong(group, idx);
  if (s && s.materialFamily) return s.materialFamily;
  // Fall back: the long's z position via zone selectors
  const profArr = window.Draw?.profiles?.[group];
  const prof = profArr?.[idx];
  let z_mm = null;
  if (prof && typeof prof.z === 'number') z_mm = prof.z;
  else {
    // long sitting on a horizontal plate — use the parent plate's level
    const G = window.Draw?.GEOMETRY || {};
    if (group === 'innerBottom' || group === 'bottomShell') z_mm = G.IB / 2;
    else if (group === 'upperDeck') z_mm = G.UD;
    else if (group === 'stringerStiff' || group === 'tweenStiff') z_mm = (G.IB + G.UD) / 2;
    else if (group === 'coamingStiff') z_mm = G.HC || (G.UD + 500);
    else z_mm = (G.IB + G.UD) / 2;
  }
  return (typeof getZoneMaterialAt === 'function') ? getZoneMaterialAt(z_mm) : 'AH36';
}
window.getInheritedFamilyForLong = getInheritedFamilyForLong;

function _pickGradeForClass(cls, t_mm, steelFamily, designAirTemp) {
  // Clamp thickness
  const t = Math.max(0, +t_mm || 0);
  const isHT = (steelFamily === 'HT');

  // Table 2.2.2 — by class and thickness band
  // Rows: t≤15, 15<t≤20, 20<t≤25, 25<t≤30, 30<t≤35, 35<t≤40, t>40
  //   Class I:   A A A A B B D   / AH AH AH AH AH AH DH
  //   Class II:  A A B D D D E   / AH AH AH DH DH DH EH
  //   Class III: A B D D E E E   / AH AH DH DH EH EH EH
  const band = (t <= 15) ? 0 : (t <= 20) ? 1 : (t <= 25) ? 2 : (t <= 30) ? 3 : (t <= 35) ? 4 : (t <= 40) ? 5 : 6;
  const tableMild = {
    'I':   ['A', 'A', 'A', 'A', 'B', 'B', 'D'],
    'II':  ['A', 'A', 'B', 'D', 'D', 'D', 'E'],
    'III': ['A', 'B', 'D', 'D', 'E', 'E', 'E'],
  };
  const tableHT = {
    'I':   ['AH', 'AH', 'AH', 'AH', 'AH', 'AH', 'DH'],
    'II':  ['AH', 'AH', 'AH', 'DH', 'DH', 'DH', 'EH'],
    'III': ['AH', 'AH', 'DH', 'DH', 'EH', 'EH', 'EH'],
  };
  // If cls is null → minimum is Grade A/AH regardless of thickness (Table 2.2.1 Note 3)
  let grade;
  if (cls == null) {
    grade = isHT ? 'AH' : 'A';
  } else {
    grade = isHT ? tableHT[cls][band] : tableMild[cls][band];
  }

  // Table 2.2.3 — GRADES FOR REFRIGERATED SPACES (Sec 2.2)
  // This table is NOT applied for normal worldwide service at -10 °C, which
  // is the LR default per Sec 2.1.4. It ONLY applies to:
  //   - Refrigerated cargo holds with design temperature below 0 °C, OR
  //   - Ships intended to operate in air temperatures below -10 °C
  //     (polar / arctic service, per Sec 2.3).
  //
  // Trigger threshold: designAirTemp < -10. At exactly -10 or warmer, use
  // Table 2.2.2 only. Users wanting refrigerated-hold grades must enter a
  // colder design temperature.
  if (designAirTemp != null && designAirTemp < -10) {
    const T = designAirTemp;
    let minGrade = null;
    // Note: Table 2.2.3 brackets start at < -10 to -25
    if (T > -25) {
      minGrade = (t <= 12.5) ? (isHT ? 'DH' : 'D') : (isHT ? 'EH' : 'E');
    } else if (T > -40) {
      minGrade = (t <= 12.5) ? (isHT ? 'EH' : 'E') : (isHT ? 'FH' : 'FH');
    } else {
      minGrade = isHT ? 'FH' : 'FH';
    }
    // Grade toughness tier for comparison
    const tier = g => ({ A:1, AH:1, B:2, D:3, DH:3, E:4, EH:4, FH:5 }[g] || 1);
    if (tier(minGrade) > tier(grade)) {
      grade = minGrade;
    }
  }
  return grade;
}

// Main button action. Iterates every plate-strake group, determines class,
// picks grade, and stores into strake.grade. Shows a summary alert, switches
// the drawing into Material view mode so the user can see the result, and
// re-renders.
function assignMaterialGrades(opts) {
  opts = opts || {};
  const silent = opts.silent === true;
  if (!window.Draw || !window.Draw.STRAKES) {
    if (!silent) alert('Drawing not initialized. Please visit the Geometry page first.');
    return;
  }
  const D = window.Draw;
  const S = D.STRAKES;

  // Record a snapshot so undo rolls back the whole grade assignment as one step.
  if (window.HistoryManager && typeof window.HistoryManager.recordChange === 'function') {
    window.HistoryManager.recordChange();
  }

  // Pull context from Setup form
  const shipType     = document.getElementById('shipType')?.value || 'general_cargo';
  const steelFamily  = document.getElementById('steelFamily')?.value || 'HT';
  const designT      = parseFloat(document.getElementById('designAirTemp')?.value);
  const xL           = parseFloat(document.getElementById('sectionXL')?.value) || 0.5;
  const L_ship       = parseFloat(document.getElementById('L')?.value) || 200;
  // Within 0.4L amidships → |x/L − 0.5| ≤ 0.2
  // Within 0.6L amidships → |x/L − 0.5| ≤ 0.3
  const within04 = Math.abs(xL - 0.5) <= 0.2;
  const within06 = Math.abs(xL - 0.5) <= 0.3;

  // Identify the sheerstrake: the uppermost 'side' strake in shell
  let sheerstrakeIdx = -1;
  (S.shell || []).forEach((s, i) => {
    if (s.kind === 'side') sheerstrakeIdx = i;  // last one wins
  });

  const tally = {};  // grade → count
  let totalCount = 0;

  const processGroup = (groupKey) => {
    const arr = S[groupKey];
    if (!Array.isArray(arr)) return;
    arr.forEach((s, i) => {
      const ctx = {
        shipType, within04, within06, L_ship,
        isSheerstrake: (groupKey === 'shell' && i === sheerstrakeIdx),
      };
      const cls = _resolveMaterialClass(groupKey, i, s, ctx);
      // ZONE-AWARE: read the yield-strength family from the Setup zone
      // selectors based on this strake's z-position. This is the family
      // used to compute the toughness letter; if the user has pinned a
      // different yield via the inspector dropdown (materialFamilyManual),
      // we honour that pin so the computed toughness matches the displayed
      // material. The pin field is left untouched.
      const pinnedMf = (s.materialFamilyManual && s.materialFamily) || null;
      const zoneMat = pinnedMf
        || ((typeof getZoneMaterialForStrake === 'function')
            ? getZoneMaterialForStrake(groupKey, s)
            : (document.getElementById('material')?.value || 'AH36'));
      const family = (zoneMat === 'MS') ? 'Mild' : 'HT';
      const grade = _pickGradeForClass(cls, s.thickness, family, designT);
      s.grade = grade;                 // toughness letter (A/AH/D/E/EH...)
      s.materialClass = cls;           // for inspector / excel
      // s.materialFamily is set ONLY when the user has pinned it. Otherwise
      // we never write it — the live resolver reads Setup zones every time
      // and stays in sync if the user later edits the Setup zones.
      if (grade) {
        tally[grade] = (tally[grade] || 0) + 1;
        totalCount++;
      }
    });
  };

  ['shell','innerBottom','innerSide','upperDeck','coamingWall','coamingTop','stringer','tween']
    .forEach(processGroup);

  // ─── Auto-assign profile (longitudinal stiffener) toughness grade ──
  // Each long inherits the toughness letter (A/D/E/AH/DH/EH) of the strake
  // it sits on. The yield-strength family is NOT written here — it's read
  // live from the parent strake's resolver at render/calc time, so it
  // stays in sync if the user edits Setup zones. Manual pin (gradeManual)
  // is honoured.
  const longGroups = ['bottomShell','sideShell','innerBottom','innerSide',
                      'upperDeck','stringerStiff','tweenStiff','coamingStiff'];
  longGroups.forEach(grpKey => {
    const profArr = D.profiles?.[grpKey];
    if (!Array.isArray(profArr)) return;
    profArr.forEach((p, i) => {
      if (p.gradeManual && p.grade) return;     // user pinned this one
      const inheritedGrade = (typeof getInheritedGradeForLong === 'function')
                             ? getInheritedGradeForLong(grpKey, i) : null;
      if (inheritedGrade) {
        p.grade = inheritedGrade;
        tally[inheritedGrade] = (tally[inheritedGrade] || 0) + 1;
        totalCount++;
      }
    });
  });

  // ─── Also assign grades to WHOLE-PLATE groups ───────────────────
  // Side girders, duct, and the deck/coaming "single-piece" plates store
  // their grade in PLATE_GRADE / SIDE_GIRDER_GRADES (not STRAKES). Pick a
  // grade for each based on a sensible material class, mirroring how
  // strake-based plates are handled. This way, "Assign Grades" fills in
  // every plate the model knows about, not just the strake-split ones.
  const processWholePlate = (key, t_mm, classOverride, zHint_mm) => {
    if (!t_mm || !isFinite(t_mm)) return;
    // Default class is I unless overridden (e.g. duct WT bulkhead -> II).
    //
    // getMaterialClass() and the Table 2.2.2 lookups both key on the Roman
    // numerals 'I' / 'II' / 'III'. This helper used to hand _pickGradeForClass
    // the numbers 1 and 2, so tableHT[1] was undefined and every whole-plate
    // grade lookup threw. Normalise to the numeral the tables actually use.
    const CLASS_NUMERAL = { 1: 'I', 2: 'II', 3: 'III' };
    const cls = CLASS_NUMERAL[classOverride] || classOverride || 'I';
    // Zone material — derive from the plate's z-coordinate (zHint_mm)
    const zoneMat = (typeof getZoneMaterialAt === 'function' && isFinite(zHint_mm))
                    ? getZoneMaterialAt(zHint_mm)
                    : (document.getElementById('material')?.value || 'AH36');
    const family = (zoneMat === 'MS') ? 'Mild' : 'HT';
    const grade = _pickGradeForClass(cls, t_mm, family, designT);
    if (grade) {
      window.PLATE_GRADE[key] = grade;
      tally[grade] = (tally[grade] || 0) + 1;
      totalCount++;
    }
  };
  // Whole plates that aren't already covered by strakes. (upperDeck,
  // coamingTop, stringer, tween are present as STRAKES groups too — but
  // if the user has them as single-piece, they end up here too.)
  // Note: PLATE_THICKNESS holds the current thickness for each.
  // Whole-plate z-hints (for zone resolution): each plate's typical level
  const G = window.Draw.GEOMETRY || {};
  // PLATE_THICKNESS lives inside the 10-draw.js IIFE, so the bare name is not
  // in scope here - referencing it threw a ReferenceError on the first line of
  // the whole-plate block below, which meant upperDeck, stringer, tween,
  // coamingTop, duct and sideGirder never received a grade at all. The throw
  // was swallowed by the caller's try/catch, so it only showed as PLATE_GRADE
  // staying empty. Read it off window.Draw the same way G is.
  const PT = window.Draw.PLATE_THICKNESS || {};
  if (!Array.isArray(S.upperDeck) || S.upperDeck.length === 0) {
    processWholePlate('upperDeck', PT.upperDeck, 1, G.UD);
  }
  if (!Array.isArray(S.stringer) || S.stringer.length === 0) {
    processWholePlate('stringer', PT.stringer, 1, G.TT || (G.IB + G.UD)/2);
  }
  if (!Array.isArray(S.tween) || S.tween.length === 0) {
    processWholePlate('tween', PT.tween, 1, G.TT || (G.IB + G.UD)/2);
  }
  if (!Array.isArray(S.coamingTop) || S.coamingTop.length === 0) {
    processWholePlate('coamingTop', PT.coamingTop || PT.coaming, 1, G.HC || (G.UD + 500));
  }
  // Duct wall: WT bulkhead — class 2 (slightly higher requirement).
  processWholePlate('duct', PT.duct, 2, G.IB / 2);
  // Side girders: one entry per girder (sg0, sg1, sg2 ...). All use the
  // generic PLATE_GRADE.sideGirder default + per-girder override key.
  processWholePlate('sideGirder', PT.sideGirder, 1, G.IB / 2);

  // Build the summary message
  const distrib = Object.entries(tally).sort((a,b) => b[1] - a[1])
                      .map(([g, n]) => `${n}× ${g}`).join(', ');
  const zoneStr = within04 ? 'within 0.4L amidships'
                  : within06 ? 'within 0.6L amidships (0.4L–0.6L band)'
                  : 'outside 0.6L amidships';
  const msg = 'Material Grades Assigned\n' +
              '────────────────────────\n\n' +
              `Ship type: ${shipType}\n` +
              `Steel family: ${steelFamily}\n` +
              `Design air temp: ${designT} °C\n` +
              `Section position: x/L = ${xL.toFixed(2)} (${zoneStr})\n\n` +
              `Total plates graded: ${totalCount}\n` +
              `Distribution: ${distrib}\n\n` +
              'References:\n' +
              '  • LR Pt 3 Ch 2 Table 2.2.1 (material classes)\n' +
              '  • LR Pt 3 Ch 2 Table 2.2.2 (grade vs thickness)\n' +
              (designT < -10 ? '  • LR Pt 3 Ch 2 Table 2.2.3 (refrigerated / polar service, raised minimum grades)\n' : '') +
              '\nSwitching drawing to Material view so you can see the result.';
  if (!silent) alert(msg);

  // Switch drawing to Material view mode (only when invoked manually)
  if (!silent) {
    if (typeof setViewMode === 'function') {
      try { setViewMode('material'); } catch (e) {}
    } else if (window.Draw && typeof window.Draw.setViewMode === 'function') {
      try { window.Draw.setViewMode('material'); } catch (e) {}
    }
  }

  // Re-render everything
  if (typeof window.render === 'function') window.render();
  if (typeof renderEditor === 'function') renderEditor();
  if (!silent && typeof recalcAll === 'function') recalcAll();
}
window.assignMaterialGrades = assignMaterialGrades;


