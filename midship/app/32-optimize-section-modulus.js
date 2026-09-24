/* ==========================================================================
   32-optimize-section-modulus.js  —  Hull-girder section-modulus optimizer + Bridge
   Extracted verbatim from Index.html (lines 19595–21122 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// =========================================================================
// SECTION MODULUS OPTIMIZER  (LR Pt 3 Ch 4 Sec 5.4 / 5.8)
// =========================================================================
// Greedy algorithm that raises plate thicknesses until the hull girder section
// meets Z_B ≥ Z_min, Z_D ≥ Z_min, I_NA ≥ I_min (with 5% safety margin).
//
// DESIGN NOTES:
//   - Only plate thicknesses are modified — stiffeners untouched (v1).
//   - Only thickens plates; never reduces existing t.
//   - Standard mill thicknesses used: 11, 12, 13, ..., 22, 25, 28, 30, 32, 35, 40, (50 coaming top only).
//   - Each step adjusts ONE plate by ONE standard-size step up.
//   - Priority: whichever target (Z_B, Z_D, I_NA) has the largest deficit.
//   - Best candidate for that target = element with highest "efficiency score"
//     = |z − z_NA| · A.  Distant-from-NA plates give the most Z / I per kg.
//   - Ratio-based adjacency constraint: neighbouring strakes must satisfy
//     t_big / t_small ≤ 1.7. After a thickening step, any neighbour that
//     violates this is bumped up too.
//   - Per-plate caps: 40 mm general, 50 mm for coaming top.
//   - On unsolvable: reports which plates hit caps and suggests next steps.
// =========================================================================
function autoOptimizeSectionModulus() {
  if (!window.Draw || !window.Draw.STRAKES) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }

  const confirmMsg =
    'Section Modulus Optimizer\n' +
    '────────────────────────\n' +
    'This will raise plate thicknesses until the hull girder section meets LR\n' +
    'minimum section modulus (Z_min) and moment of inertia (I_min).\n\n' +
    'Rules applied:\n' +
    '  • Standard mill thicknesses only (11,12,13,14,15,16,17,18,20,22,25,28,30,32,35,40)\n' +
    '  • Coaming top plate up to 50 mm; all other plates capped at 40 mm\n' +
    '  • Ratio-based neighbour step: adjacent strakes t_big/t_small ≤ 1.7\n' +
    '  • Plate thickening only (never reduces), stiffeners untouched\n\n' +
    'Continue?';
  if (!confirm(confirmMsg)) return;

  const D = window.Draw;
  const S = D.STRAKES;
  if (D.setStrakesAuto) D.setStrakesAuto(false);

  // ─── Parameters ─────────────────────────────────────────────────────
  const T_STD = [11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 25, 28, 30, 32, 35, 40];
  const T_STD_COAMING_TOP = T_STD.concat([45, 50]);  // coaming top allowed up to 50
  const MAX_T_GENERAL = 40;
  const MAX_T_COAMING_TOP = 50;
  const RATIO_LIMIT = 1.7;       // neighbour t_big / t_small ≤ this
  const MARGIN = 1.0;            // target exactly LR minimum (no extra margin)
  const MAX_ITERATIONS = 200;    // prevent runaway

  // Next standard thickness up from t. Returns null if at cap.
  const nextT = (t, isCoamingTop) => {
    const ladder = isCoamingTop ? T_STD_COAMING_TOP : T_STD;
    const cap = isCoamingTop ? MAX_T_COAMING_TOP : MAX_T_GENERAL;
    if (t >= cap) return null;
    for (const v of ladder) {
      if (v > t) return v;
    }
    return null;
  };

  // ─── Build candidate list: every plate strake that can be modified ──
  // Each candidate carries a reference to its STRAKES[group][idx] so we
  // mutate the live array. Stiffeners are excluded (v1).
  const listCandidates = () => {
    const out = [];
    const groups = ['shell', 'innerBottom', 'innerSide', 'upperDeck',
                    'stringer', 'tween', 'coamingTop'];
    for (const g of groups) {
      const arr = S[g];
      if (!Array.isArray(arr)) continue;
      arr.forEach((s, i) => {
        out.push({
          group: g, idx: i, strake: s,
          isCoamingTop: (g === 'coamingTop'),
        });
      });
    }
    return out;
  };

  // Compute current Z_B, Z_D, I_NA and the deficits vs requirements.
  // Returns {Z_B, Z_D, I_NA, z_NA, Z_req, I_req, def_B, def_D, def_I, allOK}.
  const evaluate = () => {
    // Reset internal caches so computeSectionProperties re-reads strake arrays
    const sp = D.computeSectionProperties();
    if (!sp) return null;
    const p = (typeof getParams === 'function') ? getParams() : null;
    if (!p) return null;
    const ls = (typeof runLongStrengthAnalysis === 'function')
      ? runLongStrengthAnalysis() : null;
    if (!ls || !ls.compliance) return null;
    const c = ls.compliance;
    const Z_req_B = c.Z_B.required_m3 * MARGIN;
    const Z_req_D = c.Z_D.required_m3 * MARGIN;
    const I_req = c.I ? c.I.required_m4 * MARGIN : 0;
    const def_B = Math.max(0, Z_req_B - c.Z_B.actual_m3);
    const def_D = Math.max(0, Z_req_D - c.Z_D.actual_m3);
    const def_I = c.I ? Math.max(0, I_req - c.I.actual_m4) : 0;
    return {
      Z_B: c.Z_B.actual_m3, Z_D: c.Z_D.actual_m3,
      I_NA: c.I ? c.I.actual_m4 : null, z_NA: sp.NA/1000,
      Z_req_B, Z_req_D, Z_req: Z_req_B,  // Z_req kept for backwards compat in logs
      I_req, def_B, def_D, def_I,
      allOK: def_B <= 0 && def_D <= 0 && def_I <= 0
    };
  };

  // Rank a candidate by efficiency score (higher = better) for a given target.
  //   target === 'Z_B' → prefer elements BELOW NA, far from NA
  //   target === 'Z_D' → prefer elements ABOVE NA, far from NA
  //   target === 'I_NA' → any element, by |z − NA|
  // Score = ∂I/∂t  for a +1 mm increment ≈ width · arm²  (arm = z − z_NA).
  // (Earlier the score was arm·area = arm·width·t — that mistakenly scaled
  // with current thickness, so already-thick strakes kept being chosen
  // even when a thinner strake at the same arm would give an equal gain.
  // For ranking purposes the +1 mm increment is what matters, so drop t.)
  const score = (cand, target, state) => {
    const s = cand.strake;
    const zNA_mm = state.z_NA * 1000;
    const g = D.GEOMETRY || {};
    // Rough centroid z for this strake (matches computeSectionProperties logic)
    let z_mm;
    switch (cand.group) {
      case 'upperDeck':  z_mm = g.UD; break;
      case 'coamingTop': z_mm = g.HC; break;
      case 'stringer':   z_mm = s.z_level || 0; break;
      case 'tween':      z_mm = s.z_level || 0; break;
      case 'innerBottom': z_mm = g.IB; break;
      case 'innerSide': {
        // Walk IS strakes to find this one's vertical range
        let zc = g.IB;
        for (let k = 0; k < cand.idx; k++) zc += S.innerSide[k].width;
        z_mm = zc + s.width / 2;
        break;
      }
      case 'shell': {
        // Walk shell strakes along arc-path to find z
        let cursor = 0;
        const L_obj = (typeof shellGeometryLengths === 'function') ? shellGeometryLengths() : null;
        for (let k = 0; k < cand.idx; k++) cursor += S.shell[k].width;
        const midPath = cursor + s.width / 2;
        if (!L_obj) { z_mm = 0; break; }
        if (midPath <= L_obj.keel + L_obj.bottom) z_mm = 0;
        else if (midPath <= L_obj.keel + L_obj.bottom + L_obj.bilge) {
          const sb = midPath - L_obj.keel - L_obj.bottom;
          const th = (sb / L_obj.bilge) * (Math.PI / 2);
          z_mm = (g.R_B || 1800) * (1 - Math.cos(th));
        } else {
          const ss = midPath - L_obj.keel - L_obj.bottom - L_obj.bilge;
          z_mm = (g.R_B || 1800) + ss;
        }
        break;
      }
      default: z_mm = 0;
    }
    const arm = z_mm - zNA_mm;  // signed
    // ∂I/∂t for a +1 mm increment ≈ w · arm² (units: mm · mm² = mm³).
    // arm is signed only for direction filtering (Z_B = below NA, Z_D = above).
    const w = s.width;
    const armSq = arm * arm;
    if (target === 'Z_D') {
      // Only elements ABOVE NA contribute positively to Z_D
      return arm > 0 ? w * armSq : -Infinity;
    }
    if (target === 'Z_B') {
      // Only elements BELOW NA contribute positively to Z_B
      return arm < 0 ? w * armSq : -Infinity;
    }
    // I_NA target: any element
    return w * armSq;
  };

  // Priority tier for each candidate given a target. LOWER tier = higher
  // priority (thicken first). User-requested order:
  //   Z_D (deck):  1=coamingTop, 2=IS top tank strake, 3=IS-6 inner wall,
  //                4=coamingWall outboard, 5=upperDeck, 99=everything else
  //   Z_B (keel):  1=keel, 2=bottom, 3=bilge, 4=innerBottom, 5=IS bottom strakes,
  //                99=everything else
  //   I_NA:        uses pure efficiency score (no explicit tier) — rely on score.
  // Within the same tier, efficiency score (arm·A) breaks ties.
  const priorityTier = (cand, target) => {
    const grp = cand.group;
    const idx = cand.idx;
    const s = cand.strake;
    if (target === 'Z_D') {
      if (grp === 'coamingTop') return 1;
      // IS-5: the tank-wall strake just below UD. It's the last 'non-coaming'
      // strake in STRAKES.innerSide — i.e. the one with the highest index
      // among those that are NOT kind==='coamingWall'.
      if (grp === 'innerSide') {
        if (s.kind === 'coamingWall') return 3;  // IS-6 inner wall
        // Find the top tank-wall strake
        const arr = S.innerSide || [];
        let topTankIdx = -1;
        for (let k = 0; k < arr.length; k++) {
          if (arr[k].kind !== 'coamingWall') topTankIdx = k;
        }
        if (idx === topTankIdx) return 2;
        return 6;  // other IS tank-wall strakes (lower) — below priority list
      }
      if (grp === 'coamingWall') return 4;       // outboard coaming wall
      if (grp === 'upperDeck')   return 5;
      return 99;  // everything else
    }
    if (target === 'Z_B') {
      if (grp === 'shell') {
        if (s.kind === 'keel')   return 1;
        if (s.kind === 'bottom') return 2;
        if (s.kind === 'bilge')  return 3;
        return 99;
      }
      if (grp === 'innerBottom') return 4;
      if (grp === 'innerSide' && s.kind !== 'coamingWall') {
        // Lower IS strakes (idx 0, 1) get priority for Z_B
        if (idx <= 1) return 5;
        return 6;
      }
      return 99;
    }
    // I_NA target: no tiering — efficiency score is used directly
    return 1;
  };

  // Check neighbour adjacency constraint. After thickening strake[idx] in a
  // group, any neighbour whose ratio now violates RATIO_LIMIT is raised too.
  // Returns list of additional changes made for logging.
  const enforceRatio = (group, idx, log) => {
    const arr = S[group];
    if (!arr || arr.length < 2) return;
    // For strake groups ordered along a path (shell, innerSide, innerBottom,
    // upperDeck multi-strake), immediate left/right neighbours are indices
    // idx-1 and idx+1. For coamingWall (2 parallel walls), neighbour logic
    // doesn't apply — they're independent.
    if (group === 'coamingWall' || group === 'stringer' || group === 'tween') return;
    const neighbours = [];
    if (idx > 0) neighbours.push(idx - 1);
    if (idx < arr.length - 1) neighbours.push(idx + 1);
    const t_here = arr[idx].thickness;
    for (const n of neighbours) {
      const t_n = arr[n].thickness;
      const big = Math.max(t_here, t_n);
      const small = Math.min(t_here, t_n);
      if (big / small > RATIO_LIMIT) {
        // Raise the smaller neighbour to the next standard that restores ratio.
        const target_t_min = big / RATIO_LIMIT;
        const isCT = (group === 'coamingTop');
        const ladder = isCT ? T_STD_COAMING_TOP : T_STD;
        let newT = null;
        for (const v of ladder) {
          if (v >= target_t_min && v >= t_n) { newT = v; break; }
        }
        const cap = isCT ? MAX_T_COAMING_TOP : MAX_T_GENERAL;
        if (newT != null && newT <= cap && newT > t_n) {
          log.push(`  [neighbour] ${group}[${n}]: ${t_n} → ${newT} mm (ratio constraint)`);
          arr[n].thickness = newT;
          // Recurse once to propagate further
          enforceRatio(group, n, log);
        }
      }
    }
  };

  // ─── Main loop ──────────────────────────────────────────────────────
  const log = [];
  let state = evaluate();
  if (!state) {
    alert('Section Modulus Optimizer: could not evaluate section. Ensure geometry is initialized.');
    return;
  }

  const initial = { Z_B: state.Z_B, Z_D: state.Z_D, I_NA: state.I_NA, z_NA: state.z_NA };
  log.push(`Initial: Z_B=${state.Z_B.toFixed(3)}  Z_D=${state.Z_D.toFixed(3)}  ` +
           `I_NA=${state.I_NA?state.I_NA.toFixed(2):'n/a'}  z_NA=${state.z_NA.toFixed(2)} m`);
  log.push(`Target (Z_req_B=${state.Z_req_B.toFixed(3)}, Z_req_D=${state.Z_req_D.toFixed(3)}, I_req=${state.I_req.toFixed(2)})`);
  log.push(`Deficits: Z_B=${state.def_B.toFixed(3)}  Z_D=${state.def_D.toFixed(3)}  I=${state.def_I.toFixed(2)}`);
  log.push('');

  if (state.allOK) {
    alert(`Section already meets LR Z_min / I_min.\n\n` +
          `Z_B = ${state.Z_B.toFixed(3)} m³ (req ${state.Z_req_B.toFixed(3)})\n` +
          `Z_D = ${state.Z_D.toFixed(3)} m³ (req ${state.Z_req_D.toFixed(3)})\n` +
          `I_NA = ${state.I_NA ? state.I_NA.toFixed(2) : 'n/a'} m⁴ (req ${state.I_req.toFixed(2)})`);
    return;
  }

  const changes = [];  // [{group, idx, t_before, t_after}]
  const cappedOut = new Set();  // candidate keys that hit their max
  let iter = 0;
  while (iter < MAX_ITERATIONS) {
    iter++;
    state = evaluate();
    if (!state || state.allOK) break;
    // Pick target with largest proportional deficit
    const defs = [
      { tag: 'Z_B', def: state.def_B / Math.max(state.Z_req_B, 1) },
      { tag: 'Z_D', def: state.def_D / Math.max(state.Z_req_D, 1) },
      { tag: 'I_NA', def: state.def_I / Math.max(state.I_req, 1) },
    ];
    defs.sort((a, b) => b.def - a.def);
    const target = defs[0].tag;
    if (defs[0].def <= 0) break;

    // Find best candidate for this target.
    // Sort by priority tier first (user-requested order), efficiency score
    // breaks ties within the same tier. Lower tier = higher priority.
    const candidates = listCandidates()
      .filter(c => {
        const key = c.group + ':' + c.idx;
        if (cappedOut.has(key)) return false;
        const nt = nextT(c.strake.thickness, c.isCoamingTop);
        return nt != null;
      })
      .map(c => ({
        ...c,
        tier:  priorityTier(c, target),
        score: score(c, target, state),
      }))
      .filter(c => c.score > -Infinity)
      .sort((a, b) => (a.tier - b.tier) || (b.score - a.score));

    if (candidates.length === 0) {
      log.push(`[iter ${iter}] target=${target}: no remaining candidates (all at cap). Stopping.`);
      break;
    }

    const best = candidates[0];
    const oldT = best.strake.thickness;
    const newT = nextT(oldT, best.isCoamingTop);
    if (newT == null) {
      cappedOut.add(best.group + ':' + best.idx);
      continue;
    }
    best.strake.thickness = newT;
    changes.push({ group: best.group, idx: best.idx, t_before: oldT, t_after: newT, target });
    log.push(`[iter ${iter}] target=${target} · ${best.group}[${best.idx}]: ${oldT} → ${newT} mm ` +
             `(def ${(defs[0].def*100).toFixed(1)}%, tier=${best.tier}, score=${best.score.toFixed(0)})`);
    enforceRatio(best.group, best.idx, log);
    if (newT >= (best.isCoamingTop ? MAX_T_COAMING_TOP : MAX_T_GENERAL)) {
      cappedOut.add(best.group + ':' + best.idx);
    }
  }

  // ─── Final re-eval & report ─────────────────────────────────────────
  const final = evaluate();
  log.push('');
  log.push(`Final: Z_B=${final.Z_B.toFixed(3)}  Z_D=${final.Z_D.toFixed(3)}  ` +
           `I_NA=${final.I_NA?final.I_NA.toFixed(2):'n/a'}  z_NA=${final.z_NA.toFixed(2)} m`);

  // Report
  let msg = 'Section Modulus Optimizer — Result\n';
  msg += '──────────────────────────────────\n\n';
  msg += `Iterations: ${iter}\n`;
  msg += `Plate changes: ${changes.length}\n\n`;
  msg += 'Before → After:\n';
  msg += `  Z_B  = ${initial.Z_B.toFixed(3)} → ${final.Z_B.toFixed(3)} m³  (req ${final.Z_req_B.toFixed(3)})\n`;
  msg += `  Z_D  = ${initial.Z_D.toFixed(3)} → ${final.Z_D.toFixed(3)} m³  (req ${final.Z_req_D.toFixed(3)})\n`;
  if (final.I_NA != null) {
    msg += `  I_NA = ${initial.I_NA.toFixed(2)} → ${final.I_NA.toFixed(2)} m⁴  (req ${final.I_req.toFixed(2)})\n`;
  }
  msg += `  z_NA = ${initial.z_NA.toFixed(2)} → ${final.z_NA.toFixed(2)} m\n\n`;

  if (final.allOK) {
    msg += '✓ All LR minimums now satisfied.\n';
  } else {
    msg += '✗ Some targets still unmet:\n';
    if (final.def_B > 0) msg += `    Z_B still ${final.def_B.toFixed(3)} m³ short\n`;
    if (final.def_D > 0) msg += `    Z_D still ${final.def_D.toFixed(3)} m³ short\n`;
    if (final.def_I > 0) msg += `    I_NA still ${final.def_I.toFixed(2)} m⁴ short\n`;
    msg += '\nPossible next steps:\n';
    msg += '  • Check Drawing — some plates likely hit the thickness cap\n';
    msg += '  • Enlarge stiffeners (not touched by this optimizer)\n';
    msg += '  • Re-check ship geometry / design moment\n';
  }

  if (changes.length > 0) {
    msg += '\nChanged plates:\n';
    const byGroup = {};
    changes.forEach(c => {
      const k = c.group + '[' + c.idx + ']';
      // Keep only the LATEST t_after (in case of re-thicken during propagation)
      byGroup[k] = byGroup[k] || { t_before: c.t_before, t_after: c.t_after };
      byGroup[k].t_after = c.t_after;
    });
    Object.entries(byGroup).slice(0, 30).forEach(([k, v]) => {
      msg += `  ${k}: ${v.t_before} → ${v.t_after} mm\n`;
    });
    if (Object.keys(byGroup).length > 30) {
      msg += `  ... (${Object.keys(byGroup).length - 30} more)\n`;
    }
  }

  console.log('[autoOptimizeSectionModulus] Log:', log);
  console.log('[autoOptimizeSectionModulus] Changes:', changes);

  alert(msg);

  // Re-render & re-run downstream panels so the user sees the updated values
  if (typeof window.render === 'function') window.render();
  if (typeof recalcAll === 'function') recalcAll();
}
window.autoOptimizeSectionModulus = autoOptimizeSectionModulus;


function autoOptimizeAll() {
  if (!window.Draw || !window.Draw.STRAKES || !window.Draw.PARAMS) {
    alert('Drawing not initialized. Please go to Geometry page first.');
    return;
  }
  const D = window.Draw;
  const G = D.GEOMETRY;
  const S = D.STRAKES;
  const PA = D.PARAMS;

  // CRITICAL: Disable auto-regeneration of strakes during optimization —
  // otherwise `recalcAll()` → `syncFromScantling` → `Draw.sync` → `computeStrakes()`
  // would regenerate STRAKES from scratch each iter, wiping out our thickness
  // changes. We leave it OFF after optimization (user toggles to re-enable).
  if (D.setStrakesAuto) D.setStrakesAuto(false);

  const T_STEPS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 18, 20, 22, 25];
  // Per-element thickness caps (user constraint: UD ≤ 15, IS/shell/IB ≤ 25,
  // Coaming plate ≤ 20). Optimizer will NOT exceed these even if hull girder
  // is still FAIL — instead, reports "cannot be solved by plate thickness alone".
  const T_MAX = {
    shell: 25, innerBottom: 25, innerSide: 25,
    upperDeck: 15, stringer: 15, tween: 15,
    coaming: 20,
  };
  const TARGET_RATIO = 0.85;
  const MAX_ITERATIONS = 10;

  const totalChanges = { strakes: {}, profiles: {} };

  // Helper: cap thickness at element's max
  const capT = (t, elemKey) => {
    const max = T_MAX[elemKey];
    if (max != null && t > max) return max;
    return t;
  };

  // Helper: run long strength, return { ls, sigma_perm, I_NA, z_NA, M_max }
  const getLS = () => {
    try {
      const Ms_design = parseFloat(document.getElementById('MsDesign')?.value || 0);
      const ls = window.runLongStrengthAnalysis();
      if (!ls || !ls.section) return null;
      // M_total (Ms + Mw). Without Ms the optimizer would under-size plates
      // any time still-water is non-trivial.
      const M_hog = Math.abs(ls.M_total_hog);
      const M_sag = Math.abs(ls.M_total_sag);
      const M_max = Math.max(M_hog, M_sag);
      return { ls, sigma_perm: ls.sigma_amid, I_NA: ls.section.I_NA, z_NA: ls.section.z_NA, M_max };
    } catch (e) { return null; }
  };

  const sigmaAt = (z_m, info) => {
    if (!info) return 0;
    return Math.abs(info.M_max * (z_m - info.z_NA) / info.I_NA) * 1e-3;
  };

  // Next thicker step
  const stepUpT = (t) => {
    const i = T_STEPS.findIndex(x => x > t);
    return i < 0 ? T_STEPS[T_STEPS.length - 1] : T_STEPS[i];
  };

  // Find smallest profile with Z ≥ Zreq.
  // `families` controls which types are considered.
  // `preferFamily`: if multiple profiles have similar weight (within 10%),
  //   prefer one matching this family (e.g. 'HP' for side/deck regions).
  const pickProfile = (Zreq, families, currentName, preferFamily, plate) => {
    if (!window.Profile || !window.Profile.findBestFit) return null;
    const pw = plate?.pw_mm || 700;
    const pt = plate?.pt_mm || 10;
    const fits = window.Profile.findBestFit(Zreq, {
      families: families || ['HP','L','FB'],  // default HP first
      plateWidth_mm: pw, plateThickness_mm: pt, angle: 90,
      maxResults: 20
    });
    if (!fits || !fits.length) return null;
    // Weight-sorted; pick lightest. If preferFamily is given, prefer that
    // type when a member of that family is within 10% of lightest's weight.
    const best = fits[0];
    if (preferFamily) {
      const lightestWeight = best.weight_kgm;
      const preferred = fits.find(f =>
        f.type === preferFamily && f.weight_kgm <= lightestWeight * 1.10
      );
      if (preferred) return preferred;
    }
    return best;
  };

  // Group → preferred profile family (per user rule):
  //   - Bottom, IB: L (traditional)
  //   - Side, IS, Stringer, Tween, UD: HP (lighter at deck region)
  //   - Coaming: FB (locked via profileName)
  const GROUP_PREFER = {
    bottomShell: 'L',
    innerBottom: 'L',
    sideShell: 'HP',
    innerSide: 'HP',
    stringerStiff: 'HP',
    tweenStiff: 'HP',
    upperDeck: 'HP',
    coamingStiff: 'FB'
  };

  // Get profile's current Z (cm³). Parse name like "L 250x90x12" or "HP 180x10".
  // Uses the real attached-plate for the given group, not hardcoded s=700/t=10.
  const getCurrentZ = (elementId, groupKey) => {
    const el = document.getElementById(elementId);
    if (!el || !el.value) return 0;
    try {
      const profAll = window.Profile.allProfiles(['L','HP','FB','T']);
      const pd = profAll.find(p => p.name === el.value);
      if (!pd) return 0;
      // Pick a representative stiff from the group for plate lookup
      const reprStiff = (window.Draw?.profiles?.[groupKey] || [])[0] || null;
      const { pw_mm, pt_mm } = (typeof _attachedPlateFor === 'function' && reprStiff)
        ? _attachedPlateFor(groupKey, reprStiff)
        : { pw_mm: 700, pt_mm: 10 };
      const r = window.Profile.computeCombinedSection(pd, true, pw_mm, pt_mm, 90);
      // Report Z_min — matches optimizer criterion.
      return Math.min(r.WxxBot, r.WxxTop);
    } catch (e) { return 0; }
  };

  // Profile group registry
  const groups = [
    { key:'bottomShell',   zReqFn: () => { try { return window.calcBottomLong?.().Z_req || 0; } catch(e) { return 0; } },
      elementId: 'bottomLongProfile', typeKey: 'profTypeBottom', z_m: 0 },
    { key:'innerBottom',   zReqFn: () => {
        try {
          const bl = window.calcBottomLong?.();
          // CORRECT: bl.Z_req (rule value), not bl.Z_sec (profile capacity).
          return window.calcIBLong?.(bl?.Z_req || 0).Z_req || 0;
        } catch(e) { return 0; }
      }, elementId: 'ibLongProfile', typeKey: 'profTypeIB', z_m: G.IB/1000 },
    { key:'sideShell',     zReqFn: () => { try { return window.calcSideLong?.().Z_req || 0; } catch(e) { return 0; } },
      elementId: 'sideLongProfile', typeKey: 'profTypeSide', z_m: (G.IB + G.UD)/2000 },
    { key:'innerSide',     zReqFn: () => { try { return window.calcInnerSideLongs?.()?.Z_req_max || 0; } catch(e) { return 0; } },
      elementId: 'isLongProfile', typeKey: 'profTypeIS', z_m: G.UD/1000 - 1 },
    { key:'stringerStiff', zReqFn: () => { try { return window.calcLowerDeckLong?.('str').Z_req || 0; } catch(e) { return 0; } },
      elementId: 'strDeckProfile', typeKey: 'profTypeStringer', z_m: 8.59 },
    { key:'tweenStiff',    zReqFn: () => { try { return window.calcLowerDeckLong?.('twn').Z_req || 0; } catch(e) { return 0; } },
      elementId: 'twnDeckProfile', typeKey: 'profTypeTween', z_m: 12.9 },
    { key:'upperDeck',     zReqFn: () => { try { return window.calcUpperDeckLong?.().Z_req || 0; } catch(e) { return 0; } },
      elementId: 'deckLongProfile', typeKey: 'profTypeDeck', z_m: G.UD/1000 }
  ];

  // =====================================================================
  // MAIN ITERATIVE LOOP
  // =====================================================================
  let iteration = 0;
  let allPass = false;
  const log = [];

  while (iteration < MAX_ITERATIONS && !allPass) {
    iteration++;
    let anyChanged = false;
    const info = getLS();
    if (!info) { log.push(`iter ${iteration}: could not compute hull girder`); break; }

    // --- STEP A: Fix plate thicknesses (shell + IB + IS) ---
    ['shell', 'innerBottom', 'innerSide'].forEach(plateKey => {
      const arr = S[plateKey];
      if (!arr) return;
      let z_cursor = plateKey === 'innerSide' ? G.IB : 0;
      arr.forEach((strake, i) => {
        const t_before = strake.thickness;
        // Local rule
        let t_local = 8;
        try {
          if (plateKey === 'innerSide') {
            const calcIS = window.calcInnerSide?.();
            t_local = calcIS?.strakes?.[i]?.t || 8;
          } else if (plateKey === 'innerBottom') {
            t_local = window.calcIBPlate?.().t_req || 8;
          } else if (plateKey === 'shell') {
            t_local = strake.kind === 'keel' ? 14 : 11;
          }
        } catch (e) {}
        t_local = Math.ceil(t_local);

        // Hull girder at strake midpoint
        let z_mid_mm;
        if (plateKey === 'innerSide') {
          z_mid_mm = z_cursor + strake.width / 2;
        } else if (plateKey === 'innerBottom') {
          z_mid_mm = G.IB;
        } else {
          // Shell — use IB or 0 depending on kind
          z_mid_mm = (strake.kind === 'side') ? G.IB + strake.width/2 : 0;
        }
        const sig = sigmaAt(z_mid_mm / 1000, info);
        const ratio = sig / info.sigma_perm;

        let t_needed = Math.max(t_local, t_before);
        if (ratio > TARGET_RATIO && plateKey === 'innerSide' && strake.kind !== 'keel') {
          // Upper IS strakes — bump thickness to help hull girder
          const excess = ratio - TARGET_RATIO;
          let steps;
          if (excess > 0.35) steps = 6;
          else if (excess > 0.25) steps = 4;
          else if (excess > 0.15) steps = 3;
          else if (excess > 0.05) steps = 2;
          else steps = 1;
          let t = t_before;
          for (let k = 0; k < steps; k++) t = stepUpT(t);
          t_needed = Math.max(t_needed, t);
        }
        // Snap to T_STEPS and cap at element's maximum allowed thickness
        let t_target = T_STEPS.find(x => x >= t_needed) || t_needed;
        t_target = capT(t_target, plateKey);
        if (t_target !== t_before) {
          strake.thickness = t_target;
          anyChanged = true;
          if (!totalChanges.strakes[plateKey]) totalChanges.strakes[plateKey] = [];
          totalChanges.strakes[plateKey].push({ idx: i, from: t_before, to: t_target });
        }
        z_cursor += strake.width;
      });
    });

    // --- STEP B: Hull-girder-critical plate thicknesses (UD, stringer, tween, coaming) ---
    // These plates' area × z contribution drives I_NA. Increasing them is the
    // most effective way to reduce σ_hg at the deck region (where σ is highest).
    // Apply aggressive stepping if ratio is far above target.
    //
    // NOTE: UD and Coaming plates don't have separate scantling-page inputs —
    // they live in PLATE_THICKNESS directly. We write to both the DOM element
    // (if any) and PLATE_THICKNESS for consistency.
    const deckKeys = [
      { id: 'deckT',    z: G.UD/1000, default: 14, name: 'UD plate',       state: 'upperDeck' },
      { id: 'strDeckT', z: 8.59,       default: 10, name: 'Stringer plate', state: 'stringer' },
      { id: 'twnDeckT', z: 12.9,       default: 9,  name: 'Tween plate',    state: 'tween'    },
      { id: null,       z: G.HC/1000, default: 12, name: 'Coaming plate',  state: 'coaming'  }
    ];
    deckKeys.forEach(d => {
      // Read current thickness: prefer DOM value, fallback to state
      const el = d.id ? document.getElementById(d.id) : null;
      let t_cur;
      if (el && el.value) t_cur = parseFloat(el.value);
      else if (D.PLATE_THICKNESS && D.PLATE_THICKNESS[d.state] != null) t_cur = D.PLATE_THICKNESS[d.state];
      else t_cur = d.default;
      const sig = sigmaAt(d.z, info);
      const ratio = sig / info.sigma_perm;
      if (ratio > TARGET_RATIO) {
        // More aggressive stepping — hull girder is hard to move
        const excess = ratio - TARGET_RATIO;
        let steps;
        if (excess > 0.35) steps = 6;
        else if (excess > 0.25) steps = 4;
        else if (excess > 0.15) steps = 3;
        else if (excess > 0.05) steps = 2;
        else steps = 1;
        let t = t_cur;
        for (let k = 0; k < steps; k++) t = stepUpT(t);
        t = capT(t, d.state);  // cap at element's max
        if (t !== t_cur) {
          if (el) el.value = t;
          // Also update PLATE_THICKNESS in Draw state — critical for coaming
          // (no DOM element) and for hull girder recalculation.
          if (D.PLATE_THICKNESS) D.PLATE_THICKNESS[d.state] = t;
          anyChanged = true;
          if (!totalChanges.strakes[d.name]) totalChanges.strakes[d.name] = [];
          totalChanges.strakes[d.name].push({ idx: 0, from: t_cur, to: t });
        }
      }
    });

    // --- STEP C: Fix profile groups ---
    groups.forEach(grp => {
      // Coaming stiffener is LOCKED to FB 200x20 — never change via optimizer
      if (grp.key === 'coamingStiff') return;
      let Zreq = 0;
      try { Zreq = grp.zReqFn() || 0; } catch(e) {}
      if (Zreq <= 0) return;

      // Hull girder consideration — if σ at this group's z is near permissible,
      // we need extra Z margin to ensure profile doesn't become the weak link.
      const sig = sigmaAt(grp.z_m, info);
      const ratio = sig / info.sigma_perm;
      let Zreq_effective = Zreq;
      if (ratio > 0.7) {
        // Scale Zreq by (1 + safety) — gives bigger profile in high-stress region
        const safety = Math.min(0.5, (ratio - 0.7) * 2);
        Zreq_effective = Zreq * (1 + safety);
      }

      const el = document.getElementById(grp.elementId);
      const currentName = el ? el.value : '';
      const currentZ = getCurrentZ(grp.elementId, grp.key);

      // Pick the cheapest profile meeting Zreq_effective, with group-specific
      // family preference (HP for side/deck, L for bottom/IB, FB for coaming)
      const preferFam = GROUP_PREFER[grp.key];
      const familyList = preferFam === 'FB' ? ['FB','L','HP'] : ['HP','L','FB'];
      // Resolve real attached plate for this group once, so pickProfile
      // ranks candidates against the correct section.
      const reprStiff = (window.Draw?.profiles?.[grp.key] || [])[0] || null;
      const plate = (typeof _attachedPlateFor === 'function' && reprStiff)
        ? _attachedPlateFor(grp.key, reprStiff)
        : null;
      const best = pickProfile(Zreq_effective, familyList, currentName, preferFam, plate);
      if (!best) return;

      // Don't downgrade if currently passes and is bigger than needed
      if (currentZ >= Zreq_effective && currentZ >= best.Z_cm3 * 0.95) return;

      if (best.name !== currentName) {
        if (el) el.value = best.name;
        if (PA[grp.typeKey] !== best.type) PA[grp.typeKey] = best.type;
        anyChanged = true;
        if (!totalChanges.profiles[grp.key]) totalChanges.profiles[grp.key] = {};
        totalChanges.profiles[grp.key] = {
          from: currentName || '(none)',
          to: best.name,
          Zreq: Zreq_effective,
          Zgot: best.Z_cm3
        };
      }
    });

    // --- STEP D: BAND-BASED per-stiffener profile assignment for Side Shell and Inner Side ---
    // Side Shell and Inner Side span a large vertical range (IB → UD/HC).
    // Hull girder σ varies strongly with z. Using a single profile for all
    // stiffeners is wasteful at bottom (low σ) and unsafe at top (high σ).
    //
    // Strategy: Group stiffeners into BANDS of 3-4 consecutive members.
    // Each band uses the SAME profile (the one needed by the band's highest
    // stressed member). Stores per-stiffener `stiff.profileName` — no binding
    // between bands, user can override any individual stiffener via UI.
    //
    // Only done on the FIRST iteration (to give a good starting point).
    // Subsequent iterations just bump thicknesses.
    if (iteration === 1) {
      const BAND_SIZE = 3;  // 3-4 stiffeners per band (we use 3; last band may have 1-2 extra)

      ['sideShell', 'innerSide'].forEach(groupKey => {
        const arr = D.profiles[groupKey];
        if (!arr || arr.length === 0) return;

        // Sort stiffeners by z ascending
        const sorted = arr.map((p, origIdx) => ({ p, origIdx, z: p.z })).sort((a,b) => a.z - b.z);
        const n = sorted.length;

        // Build bands: [0..2], [3..5], [6..8], ...
        // If last band would have 1 stiff, merge it with previous (so bands have 3-4).
        const bands = [];
        for (let i = 0; i < n; i += BAND_SIZE) {
          bands.push(sorted.slice(i, Math.min(i + BAND_SIZE, n)));
        }
        // Merge trailing singleton into previous band (so bands are 3 or 4)
        if (bands.length >= 2 && bands[bands.length - 1].length === 1) {
          const last = bands.pop();
          bands[bands.length - 1] = bands[bands.length - 1].concat(last);
        }

        bands.forEach((band, bandIdx) => {
          // For each band: find the Zreq needed by the highest-stressed stiff in band.
          // Simplified Z_req per stiffener = local LR formula scaled by hull girder ratio.
          // Use topmost stiff (highest z) as governing (max σ_hg).
          const topStiff = band[band.length - 1];
          const z_top = topStiff.z / 1000;

          // Base local Z_req for this band — use LR's own calcSideLong() which
          // returns per-stiffener values (array with z, hT1, F1, Fs, Z_req).
          // We pick the value for the Z closest to our band's bottom stiff.
          let Zreq_local;
          if (groupKey === 'sideShell') {
            try {
              const z_bot_mm = band[0].z;
              const allSideLongs = window.calcSideLong?.() || [];
              // Find the LR-computed entry whose z is closest to our band's bottom
              let nearest = null;
              let minDist = Infinity;
              allSideLongs.forEach(e => {
                const d = Math.abs(e.z - z_bot_mm);
                if (d < minDist) { minDist = d; nearest = e; }
              });
              Zreq_local = nearest ? nearest.Z_req : 80;
              // Absolute minimum for side shell longs
              Zreq_local = Math.max(Zreq_local, 30);
            } catch(e) { Zreq_local = 80; }
          } else {
            // innerSide — use tank-head Z formula (Sec 9 Table 1.9.1 Item 2)
            // Z ≈ ρ·s·k·h·l²/(22·γ·4), with head h = max(0, tank_top - z)
            try {
              const p = getParams();
              // Read real spacing from drawing — group max gap. This band-
              // level estimate is a coarse "is the whole band overstressed"
              // check; per-stiff Z_req is computed elsewhere.
              const s = (typeof realLongSpacing === 'function')
                ? realLongSpacing('innerSide', {
                    coord: 'z', defaultFallback: 700,
                    extraSupports: (typeof getPlateSupports === 'function')
                                   ? getPlateSupports('innerSide') : []
                  })
                : 700;
              const tank_top_mm = (PA?.ttLevel || 12900);
              const z_bot_mm = band[0].z;
              // LR Tablo 1.9.1 (d): h₄ = max(z_TT−z, (z_OF−z)/2, 0.5)
              const tankComp = (typeof _findTankComp === 'function') ? _findTankComp() : null;
              const airpipe_m = (typeof _resolveAirpipeTop_m === 'function')
                ? _resolveAirpipeTop_m(tankComp, tank_top_mm + 760)
                : (tank_top_mm + 760)/1000;
              const lr = (typeof _LR_h4 === 'function')
                ? _LR_h4(z_bot_mm, tank_top_mm, airpipe_m * 1000)
                : { h4: Math.max((tank_top_mm - z_bot_mm)/1000, 0.5) };
              const h = lr.h4;
              const rho_ = (tankComp && tankComp.rho) ? tankComp.rho : 1.025;
              Zreq_local = rho_ * s * p.kL * h * p.le * p.le / (22 * 1.4 * 4);
            } catch(e) { Zreq_local = 50; }
          }

          // Scale by hull girder ratio at top of band (higher σ → more margin)
          const sig_top = sigmaAt(z_top, info);
          const ratio_top = sig_top / info.sigma_perm;
          let Zreq_eff = Zreq_local;
          if (ratio_top > 0.5) {
            const safety = Math.min(0.6, (ratio_top - 0.5) * 1.5);
            Zreq_eff = Zreq_local * (1 + safety);
          }

          // Find smallest profile meeting Zreq_eff — prefer HP for side/IS
          const preferFam_band = GROUP_PREFER[groupKey] || 'HP';
          const best = pickProfile(Zreq_eff, ['HP','L','FB'], null, preferFam_band);
          if (!best) return;

          // Assign this profile to every stiff in this band
          // If band profile equals the group default, skip setting override.
          const groupDefaultName = (() => {
            const sid = {
              sideShell:'sideLongProfile', innerSide:'isLongProfile'
            }[groupKey];
            const sel = sid ? document.getElementById(sid) : null;
            return sel?.value || '';
          })();
          band.forEach(item => {
            const stiff = arr[item.origIdx];
            if (best.name === groupDefaultName) {
              delete stiff.profileName;
            } else {
              stiff.profileName = best.name;
            }
          });
          anyChanged = true;

          // Track in report
          if (!totalChanges.profiles[groupKey + '_bands']) totalChanges.profiles[groupKey + '_bands'] = [];
          totalChanges.profiles[groupKey + '_bands'].push({
            band: `Band ${bandIdx+1} (${band.length} stiffs, z=${(band[0].z/1000).toFixed(1)}..${z_top.toFixed(1)}m)`,
            profile: best.name,
            Zreq: Zreq_eff,
            Zgot: best.Z_cm3
          });
        });
      });
    }

    // Trigger recomputation of section properties so next iteration sees new I_NA.
    // NOTE: We do NOT call syncFromScantling here because it would overwrite
    // PLATE_THICKNESS.coaming (hardcoded to 12 in Bridge) each iteration.
    // Instead we directly trigger section property recomputation.
    if (D.computeSectionProperties) {
      try { D.computeSectionProperties(); } catch(e) {}
    }
    if (typeof recalcAll === 'function') recalcAll();

    // --- Check if all rules now pass ---
    const info2 = getLS();
    if (info2) {
      // Sample σ at deck region (highest)
      const sig_ud = sigmaAt(G.UD / 1000, info2);
      const sig_hc = sigmaAt(G.HC / 1000, info2);
      const ratio_ud = sig_ud / info2.sigma_perm;
      const ratio_hc = sig_hc / info2.sigma_perm;
      log.push(`iter ${iteration}: UD=${ratio_ud.toFixed(2)} HC=${ratio_hc.toFixed(2)} changed=${anyChanged}`);
      if (ratio_ud <= TARGET_RATIO && ratio_hc <= TARGET_RATIO && !anyChanged) {
        allPass = true;
      }
    }

    if (!anyChanged) break;
  }

  // =====================================================================
  // FINAL REPORT
  // =====================================================================
  let msg = 'AUTO-OPTIMIZE COMPLETE\n\n';
  msg += `Iterations: ${iteration}\n`;
  msg += `Target: LR rules + σ_hg/σ_perm ≤ ${TARGET_RATIO}\n\n`;

  // Final ratio check
  const finalInfo = getLS();
  if (finalInfo) {
    const ratios = [
      { name: 'Upper Deck (z=UD)',  z: G.UD/1000 },
      { name: 'Coaming top (z=HC)', z: G.HC/1000 },
      { name: 'Tween deck',          z: 12.9 },
      { name: 'Stringer',            z: 8.59 },
      { name: 'Inner Bottom',        z: G.IB/1000 },
      { name: 'Keel',                z: 0 }
    ];
    msg += 'FINAL σ_hg / σ_perm RATIOS:\n';
    ratios.forEach(r => {
      const s = sigmaAt(r.z, finalInfo);
      const ra = s / finalInfo.sigma_perm;
      const flag = ra <= TARGET_RATIO ? 'PASS' : 'FAIL';
      msg += `  ${r.name.padEnd(22)}: ${ra.toFixed(2)}  ${flag}\n`;
    });
    msg += '\n';
  }

  // Strake changes
  const strakeKeys = Object.keys(totalChanges.strakes);
  if (strakeKeys.length > 0) {
    msg += 'STRAKE / PLATE THICKNESS CHANGES:\n';
    strakeKeys.forEach(pk => {
      totalChanges.strakes[pk].forEach(c => {
        msg += `  ${pk.padEnd(14)} #${c.idx+1}: ${c.from} → ${c.to} mm\n`;
      });
    });
    msg += '\n';
  } else {
    msg += 'Strakes: no changes\n\n';
  }

  // Profile changes
  const profKeys = Object.keys(totalChanges.profiles);
  if (profKeys.length > 0) {
    msg += 'PROFILE CHANGES:\n';
    profKeys.forEach(pk => {
      const c = totalChanges.profiles[pk];
      // Is it a band list (for sideShell_bands / innerSide_bands)?
      if (Array.isArray(c)) {
        msg += `\n  ${pk} (${c.length} bands):\n`;
        c.forEach(b => {
          msg += `    ${b.band}\n      → ${b.profile}  (Z_req=${b.Zreq.toFixed(1)}, got=${b.Zgot.toFixed(1)})\n`;
        });
      } else {
        msg += `  ${pk.padEnd(14)}: ${c.from} → ${c.to}\n`;
        msg += `                  Z_req=${c.Zreq.toFixed(1)} Z_got=${c.Zgot.toFixed(1)} cm³\n`;
      }
    });
    msg += '\n';
  } else {
    msg += 'Profiles: no changes\n\n';
  }

  if (!allPass) {
    msg += 'WARNING: Some hull girder checks still FAIL.\n';
    msg += 'The ship geometry may be inadequate for the design moment.\n';
    msg += 'Consider: increasing UD/Coaming plate thickness further,\n';
    msg += 'using heavier deck profiles, or adding deck girders.\n';
  } else {
    msg += 'All checks PASS.\n';
  }

  // Final re-render + re-analysis
  if (D.render) D.render();
  if (typeof renderEditor === 'function') renderEditor();
  if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks();

  // Restore auto-regen flag (left OFF by default since user has now manually
  // optimized — re-enabling would wipe changes on next recalcAll)
  // We leave STRAKES_AUTO = false, user can re-enable via toggle if desired.

  alert(msg);
}
window.autoOptimizeAll = autoOptimizeAll;


// ============================================================================


const Bridge = {
  // Read current scantling inputs and push to drawing
  syncFromScantling(showToast) {
    if (!window.Draw) return;
    // the empty project: no section to describe, and the hidden legacy inputs
    // still carry their built-in defaults - pushing them would draw the old ship
    if (window.MidshipSteps && MidshipSteps.noSection && MidshipSteps.noSection()) return;
    try {
      const p = getParams();
      const B_mm = p.B * 1000;

      // Parse inputs safely
      const num = (id, fallback) => {
        const el = document.getElementById(id);
        const v = el ? parseFloat(el.value) : NaN;
        return isNaN(v) ? fallback : v;
      };

      // GEOMETRY - only the fields the scantling page actually owns.
      //
      // R_B, duct_half and IS used to be written here as the literals 1800,
      // 900 and 10030 ("project convention" / the example drawing). The
      // scantling page has no inputs for any of them, so hardcoding them meant
      // this sync silently reverted whatever the geometry editor held, and made
      // it impossible to set up a ship whose inner side is not at 10030.
      // They belong to the drawing - carry the drawing's own values through.
      const dg = window.Draw.GEOMETRY || {};
      const geom = {
        B_half:    Math.round(B_mm / 2),
        IB:        p.ibLevel,
        TT:        p.ttLevel,
        UD:        p.udLevel,
        HC:        p.hcLevel,
        R_B:       (dg.R_B       != null ? dg.R_B       : 1800),
        keel_half: Math.round(num('keelWidth', 1800) / 2),
        duct_half: (dg.duct_half != null ? dg.duct_half : 900),
        IS:        (dg.IS        != null ? dg.IS        : 10030)
      };

      // PLATE_THICKNESS — from scantling inputs
      const plateT = {
        shell:      num('bottomT', 14),
        ib:         num('ibT', 13),
        is:         11,           // inner side has zoned strakes (7.5-10); default fallback
        stringer:   num('strDeckT', 10),
        tween:      num('twnDeckT', 10),
        upperDeck:  num('deckT', 15),
        coaming:    num('coamingT', 25),
        keel:       num('keelT', 16),
        sideGirder: num('sgT', 11),
        duct:       num('dkT', 12)
      };

      // SIDE_GIRDERS - owned by the geometry editor, not by this page.
      //
      // This used to rebuild the list as a fixed [3700, 6500, IS] layout
      // "that matches the example", which meant every trip back to the
      // Geometry page threw away girders the user had added or moved.
      // The scantling page has no girder-position inputs, so it pushes none.

      Object.keys(geom).forEach(k => { if (!Number.isFinite(geom[k])) delete geom[k]; });   // a blank input keeps the drawing's value
      window.Draw.sync({
        GEOMETRY: geom,
        PLATE_THICKNESS: plateT
      });

      // Push actual profile names from scantling to drawing legend
      this.pushProfileNames();

      // Run rule checks after sync
      this.runRuleChecks();

      if (showToast) console.log('Bridge: synced scantling → drawing');
    } catch (e) {
      console.error('Bridge.syncFromScantling error:', e);
    }
  },

  // Push per-group profile selections from scantling into drawing's legend/tooltip map
  pushProfileNames() {
    const val = id => {
      const el = document.getElementById(id);
      return el ? el.value : '';
    };
    
    // Collect side group profiles (5 groups)
    const sideGroups = [];
    for (let i = 1; i <= 5; i++) {
      const v = val('sideGroupProfile_G' + i);
      if (v && v !== 'AUTO') sideGroups.push(`G${i}: ${v}`);
    }
    const sideText = sideGroups.length ? sideGroups.join(', ') : 'auto';
    
    // Inner side groups (4 groups)
    const isGroups = [];
    for (let i = 1; i <= 4; i++) {
      const v = val('innerSideGroupProfile_IS-G' + i);
      if (v && v !== 'AUTO') isGroups.push(`G${i}: ${v}`);
    }
    const isText = isGroups.length ? isGroups.join(', ') : 'auto';
    
    window.__DrawGroupSizes = {
      bottom:       val('bottomLongProfile') || 'auto',
      innerBottom:  val('ibLongProfile') || 'auto',
      side:         sideText,
      innerSide:    isText,
      stringer:     val('strDeckProfile') || 'auto',
      tween:        val('twnDeckProfile') || 'auto',
      upperDeck:    val('deckLongProfile') || 'auto',
      coaming:      val('deckLongProfile') || '(shared)'
    };
    
    // Also update drawing's per-group visual profile sizes (parsed from names)
    // so SVG stiffener shape reflects actual profile dimensions.
    if (typeof window.updateVisualProfileSizes === 'function') {
      window.updateVisualProfileSizes(window.__DrawGroupSizes);
    }
    
    // Re-render legend if Draw already initialized
    if (window.Draw && window.Draw.render) {
      try { window.Draw.render(); } catch(e){}
    }
  },

  // REVERSE SYNC: Drawing → Scantling
  // Called from drawing when user edits a plate thickness in the inspector
  onPlateEditFromDrawing(plateKey, newT) {
    // Map drawing plate keys to scantling input IDs
    const keyToId = {
      shell:     'bottomT',
      keel:      'keelT',
      ib:        'ibT',
      stringer:  'strDeckT',
      tween:     'twnDeckT',
      upperDeck: 'deckT',
      sideGirder:'sgT',
      duct:      'dkT'
      // 'is' (inner side) skipped: strake-based, not a single input
      // 'coaming' skipped: Pt 3 Ch 11, no direct scantling input
    };
    const scantlingId = keyToId[plateKey];
    if (!scantlingId) return;
    const el = document.getElementById(scantlingId);
    if (!el) return;
    const oldVal = parseFloat(el.value);
    if (oldVal === newT) return;
    el.value = newT;
    // Trigger scantling recalc
    if (typeof recalcAll === 'function') recalcAll();
    // Re-run rule checks (synced drawing state already updated separately)
    this.runRuleChecks();
    console.log(`Bridge: Drawing '${plateKey}' changed ${oldVal} → ${newT} mm → scantling updated`);
  },

  // REVERSE SYNC: Drawing → Scantling (side girder list)
  // Called when user adds/removes/edits a side girder in drawing editor
  onSideGirdersChangedFromDrawing() {
    // Drawing already holds canonical SIDE_GIRDERS; scantling auto-derives SG count from B
    // so we just need to trigger a recalc of DB internals (which uses SG count)
    if (typeof recalcAll === 'function') recalcAll();
    this.runRuleChecks();
    console.log('Bridge: Drawing side girders changed → scantling recalc');
  },

  // REVERSE SYNC: Drawing → Scantling (strake thickness edited in drawing's editor)
  // Note: scantling's shell/IB/IS use per-zone defaults; for simplicity, first strake
  // drives the main scantling input (representative). Strakes with mixed values will
  // keep that mix but the first (or keel for shell) drives the scantling baseline.
  onStrakeEditFromDrawing(plateKey, strakeIdx, newT) {
    const mapping = {
      shell: (idx, t) => {
        // keel strake (index 0) = keelT; other shell strakes → bottomT
        if (idx === 0) document.getElementById('keelT').value = t;
        else document.getElementById('bottomT').value = t;
      },
      innerBottom: (idx, t) => document.getElementById('ibT').value = t,
      innerSide:   (idx, t) => {
        // IS has zoned thickness in scantling (not a single input); no direct reverse
        console.log(`Drawing IS strake[${idx}] = ${t} mm — scantling IS is zoned, no direct sync.`);
      },
      // New strake groups — each mirrors a single scantling form input.
      // Applies when the group has one strake (typical). If user splits into
      // multiple strakes they diverge from the form and must edit each
      // individually; the form value then only serves as a "default for
      // newly-added strakes".
      upperDeck: (idx, t) => { const el = document.getElementById('deckT'); if (el) el.value = t; },
      coamingTop: (idx, t) => { const el = document.getElementById('coamingT'); if (el) el.value = t; },
      coamingWall: (idx, t) => { const el = document.getElementById('coamingT'); if (el) el.value = t; },
      stringer: (idx, t) => { const el = document.getElementById('strDeckT'); if (el) el.value = t; },
      tween:    (idx, t) => { const el = document.getElementById('twnDeckT'); if (el) el.value = t; },
    };
    const fn = mapping[plateKey];
    if (!fn) return;
    fn(strakeIdx, newT);
    if (typeof recalcAll === 'function') recalcAll();
    this.runRuleChecks();
    console.log(`Bridge: Drawing strake ${plateKey}[${strakeIdx}] = ${newT} mm → scantling updated`);
  },

  // Run scantling rule functions against current plate thicknesses & populate summary
  runRuleChecks() {
    const tbody = document.getElementById('ruleCheckBody');
    if (!tbody) return;
    const num = (id, fb) => { const e=document.getElementById(id); const v=e?parseFloat(e.value):NaN; return isNaN(v)?fb:v; };
    const results = [];

    // Map rule row name → elemType for inspection panel
    const _rowNameToElemType = name => {
      if (/Hull girder Z/i.test(name)) return 'hull-girder-Z';
      if (/Hull girder I/i.test(name)) return 'hull-girder-I';
      if (/Hull girder/i.test(name)) return 'hull-girder';
      if (/Bottom plate/i.test(name)) return 'plate-bottom';
      if (/Keel plate/i.test(name)) return 'plate-keel';
      if (/Inner bottom/i.test(name)) return 'plate-ib';
      if (/Inner Side/i.test(name) || /Inner side/i.test(name)) return 'plate-is';
      if (/Stringer plate/i.test(name)) return 'plate-str';
      if (/Tween plate/i.test(name)) return 'plate-twn';
      if (/Upper deck plate/i.test(name)) return 'plate-ud';
      if (/Floor \(WT/i.test(name)) return 'db-floor-wt';
      if (/Floor \(non-WT/i.test(name)) return 'db-floor-nwt';
      if (/Centre Girder/i.test(name)) return 'db-cg';
      if (/Bracket/i.test(name)) return 'db-bracket';
      if (/Duct/i.test(name)) return 'plate-duct';
      return null;
    };
    
    const addRow = (name, rule, req, prov, status, formula) => {
      const ok = (status === 'OK');
      const cls = ok ? 'rule-check-ok' : (status === 'WARN' ? 'rule-check-warn' : 'rule-check-fail');
      results.push({ name, ok, warn: status === 'WARN' });
      const elemType = _rowNameToElemType(name);
      const clickAttr = elemType
        ? ` style="cursor:pointer" onclick="window.showElemInspect('${elemType}')" title="Click to inspect this element"`
        : '';
      const statusIconName = ok ? 'checkCircle' : (status === 'WARN' ? 'warn' : 'cross');
      const statusIcon = window.icon ? window.icon(statusIconName, '13px') : '';
      tbody.insertAdjacentHTML('beforeend', `
        <tr${clickAttr}>
          <td>${name}</td>
          <td style="font-size:0.75rem">${rule}</td>
          <td>${typeof req === 'number' ? req.toFixed(2) : req}</td>
          <td>${typeof prov === 'number' ? prov.toFixed(2) : prov}</td>
          <td class="${cls}"><span style="display:inline-flex;align-items:center;gap:4px">${statusIcon}${status}</span></td>
          <td style="font-size:0.7rem;opacity:0.8">${formula || ''}</td>
        </tr>
      `);
    };

    tbody.innerHTML = '';

    try {
      const p = getParams();

      // ===== HULL GIRDER (LR Pt 3 Ch 4) — top of report =====
      if (typeof runLongStrengthAnalysis === 'function') {
        const ls = runLongStrengthAnalysis();
        if (ls && ls.section) {
          const sec = ls.section;
          const comp = ls.compliance;
          // Z_B
          addRow('Hull girder Z_B (keel)', 'Pt 3 Ch 4 Sec 5.4.1',
                 ls.Z_min, sec.Z_B,
                 comp.Z_B.pass ? 'OK' : 'FAIL',
                 `ratio ${comp.Z_B.ratio.toFixed(3)} · Mwo=${ls.Mwo.toFixed(0)} kN·m`);
          // Z_D
          addRow('Hull girder Z_D (deck)', 'Pt 3 Ch 4 Sec 5.4.1',
                 ls.Z_min, sec.Z_D,
                 comp.Z_D.pass ? 'OK' : 'FAIL',
                 `ratio ${comp.Z_D.ratio.toFixed(3)}`);
          // I
          if (comp.I) {
            addRow('Hull girder I_NA', 'Pt 3 Ch 4 Sec 5.8.1',
                   ls.I_min, sec.I_NA,
                   comp.I.pass ? 'OK' : 'FAIL',
                   `ratio ${comp.I.ratio.toFixed(3)}`);
          }
        }
      }

      // Bottom plate
      if (typeof calcBottomPlate === 'function') {
        const bp = calcBottomPlate();
        const t = num('bottomT', 14);
        addRow('Bottom plate', 'Sec 6 (Pt 3 Ch 6)', bp.t_net, t, t >= bp.t_net ? 'OK' : 'FAIL', 'gov: ' + (bp.gov || ''));
      }

      // Keel
      const kt = num('keelT', 16);
      const keelReq = num('bottomT', 14) + 2;
      addRow('Keel plate', 'Bottom + 2 mm', keelReq, kt, kt >= keelReq ? 'OK' : 'FAIL', '+2 mm over bottom');

      // IB
      if (typeof calcIBPlate === 'function') {
        const ib = calcIBPlate();
        const t = num('ibT', 13);
        addRow('Inner bottom', 'Sec 8.4.1', ib.t_req, t, t >= ib.t_req ? 'OK' : 'FAIL', ib.formula);
      }

      // Inner side — all strakes (each can be Tank/Void/Coaming)
      if (typeof calcInnerSide === 'function') {
        const is = calcInnerSide();
        // Find worst-case (FAIL) strake first; show others if any fail
        const t_is = 11;  // as-built default inner side plate thickness
        is.strakes.forEach((s, idx) => {
          const ok = t_is >= s.t;
          const name = `Inner Side IS-${idx+1} (${s.region})`;
          const ruleRef = s.region === 'Tank' 
            ? 'Table 1.9.1 DT' 
            : (s.region === 'Void' ? 'Sec 9 min' : 'Pt 3 Ch 11');
          const note = s.region === 'Tank' ? `h₄=${s.h4.toFixed(2)} m` : `${s.region} zone`;
          addRow(name, ruleRef, s.t, t_is, ok ? 'OK' : 'FAIL', note);
        });
      }

      // Stringer deck plate
      if (typeof calcLowerDeckPlate === 'function') {
        const sp = calcLowerDeckPlate('str');
        addRow('Stringer plate', sp.fn === 'deep_tank' ? 'Table 1.9.1 DT' : 'Table 1.4.2', sp.t_req, sp.t_as, sp.t_as >= sp.t_req ? 'OK' : 'FAIL', sp.formula);
      }

      // Tween deck plate
      if (typeof calcLowerDeckPlate === 'function') {
        const tp = calcLowerDeckPlate('twn');
        addRow('Tween plate', tp.fn === 'void' ? 'Sec 9 min' : 'Table 1.4.2', tp.t_req, tp.t_as, tp.t_as >= tp.t_req ? 'OK' : 'FAIL', tp.formula);
      }

      // Upper deck plate
      if (typeof calcUpperDeckPlate === 'function') {
        const ud = calcUpperDeckPlate();
        addRow('Upper deck plate', 'Table 1.4.1', ud.t_req, ud.t_ud, ud.t_ud >= ud.t_req ? 'OK' : 'FAIL', ud.formula);
      }

      // DB internals (duct wall, side girder, center girder, floor)
      if (typeof calcDB === 'function') {
        const dbRows = calcDB();
        dbRows.forEach(r => {
          // Skip informational / N/A rows
          if (r.status === 'N/A' || r.status === 'INFO' || r.status === '—' || r.status == null) return;
          // Use calcDB's own status determination (it knows upper vs lower limits)
          addRow(r.elem, r.rule, r.t_req, r.t, r.status, r.formula);
        });
      }
    } catch (e) {
      console.error('Bridge.runRuleChecks error:', e);
    }

    // Update counters
    const ok = results.filter(r => r.ok).length;
    const fail = results.length - ok;
    const cntOk = document.getElementById('cntOk');
    const cntFail = document.getElementById('cntFail');
    if (cntOk) cntOk.textContent = ok;
    if (cntFail) cntFail.textContent = fail;
    if (typeof window.refreshSummaryStatus === 'function') window.refreshSummaryStatus();
    
    // Also refresh the sidebar panels
    if (typeof window.renderAnalysisStatusPanel === 'function') window.renderAnalysisStatusPanel();
    if (typeof window.renderHullGirderStrengthPanel === 'function') window.renderHullGirderStrengthPanel(); if (typeof window.renderRuleMinInfoPanel === 'function') window.renderRuleMinInfoPanel();
    // Update the bottom drawer status (OK/FAIL counts) so users see them
    // without expanding the drawer.
    if (typeof window.updateRuleCheckDrawerStatus === 'function') window.updateRuleCheckDrawerStatus();
  }
};
window.Bridge = Bridge;

// ==========================================================================
// DIAGNOSTIC — Debug section properties to troubleshoot stale values
// ==========================================================================
// Force-refresh analysis panels and element inspector.
// Use after editing a thickness/width if the on-screen values seem stale.
window.forceRefreshAnalysis = function() {
  const D = window.Draw;
  if (!D) { alert('Draw not initialized.'); return; }
  try { if (D.computeSectionProperties) D.computeSectionProperties(); } catch(e) {}
  try { if (typeof recalcAll === 'function') recalcAll(); } catch(e) {}
  try { if (typeof renderAnalysisStatusPanel === 'function') renderAnalysisStatusPanel(); } catch(e) {}
  try { if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel(); if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel(); } catch(e) {}
  try { if (typeof renderBucklingStatusPanel === 'function') renderBucklingStatusPanel(); } catch(e) {}
  try { if (window.Bridge && window.Bridge.runRuleChecks) window.Bridge.runRuleChecks(); } catch(e) {}
  // Re-render any currently-selected element inspector
  try {
    if (window.ANALYSIS_MODE && window.showElemInspect && typeof SELECTED_STRAKE !== 'undefined' && SELECTED_STRAKE) {
      const map = {
        shell: SELECTED_STRAKE.index === 0 ? 'plate-keel' : 'plate-bottom',
        innerBottom: 'plate-ib',
        innerSide: 'plate-is',
      };
      const kind = map[SELECTED_STRAKE.plate] || 'plate-bottom';
      const s = D.STRAKES[SELECTED_STRAKE.plate]?.[SELECTED_STRAKE.index];
      if (s) {
        window.showElemInspect(kind, {
          strakeIdx: SELECTED_STRAKE.index,
          strakeThickness: s.thickness,
          strakeWidth: s.width,
          strakeKind: s.kind,
        });
      }
    }
    // Re-render the stiffener inspector if a stiffener is currently selected.
    // Without this, applying a custom profile would leave the inspector
    // showing the OLD profile's Z_provided and buckling UC.
    if (window.ANALYSIS_MODE && window.showElemInspect && window.SELECTED_STIFF) {
      const sel = window.SELECTED_STIFF;
      const grp = sel.group, idx = sel.index;
      let t = null;
      if (typeof window.resolveCodeForLongGroup === 'function') {
        const code = window.resolveCodeForLongGroup(grp);
        const rule = code ? window.POSITION_RULES[code] : null;
        if (rule && rule.longElemType) t = rule.longElemType;
      }
      if (!t) t = 'long-bottom';
      let z_m = 5;
      const prof = D.profiles?.[grp]?.[idx];
      if (prof) {
        if (prof.z != null) z_m = prof.z / 1000;
        else if (grp === 'coamingStiff')   z_m = (D.GEOMETRY?.HC || 17500) / 1000;
        else if (grp === 'upperDeck')      z_m = (D.GEOMETRY?.UD || 15300) / 1000;
        else if (grp === 'stringerStiff' || grp === 'tweenStiff') {
          const plateArr = grp === 'stringerStiff' ? D.profiles?.stringer : D.profiles?.tweenDeck;
          if (plateArr && plateArr[0] && plateArr[0].z != null) z_m = plateArr[0].z / 1000;
        }
      }
      window.showElemInspect(t, { index: idx, group: grp, z_m });
    }
  } catch(e) { console.warn('refresh inspector:', e); }
  console.log('[forceRefreshAnalysis] done');
};

window.debugSectionProps = function() {
  const D = window.Draw;
  if (!D || !D.STRAKES) { alert('Draw not initialized.'); return; }

  const form = {
    bottomT: document.getElementById('bottomT')?.value,
    keelT:   document.getElementById('keelT')?.value,
    bilgeT:  document.getElementById('bilgeT')?.value,
    ibT:     document.getElementById('ibT')?.value,
    deckT:   document.getElementById('deckT')?.value,
    strDeckT:document.getElementById('strDeckT')?.value,
    twnDeckT:document.getElementById('twnDeckT')?.value,
    coamingT:document.getElementById('coamingT')?.value,
  };

  const shellT = D.STRAKES.shell.map(s => `${s.kind || '-'}: ${s.thickness}`);
  const ibT = D.STRAKES.innerBottom.map(s => s.thickness);
  const isT = D.STRAKES.innerSide.map(s => `${s.kind||'-'}: ${s.thickness}`);
  const pt = D.PLATE_THICKNESS || {};

  // Fresh section properties
  let sp = null;
  try { sp = D.computeSectionProperties(); } catch(e) {}

  // Hull girder analysis
  let ls = null;
  try {
    const Ms = parseFloat(document.getElementById('MsDesign')?.value || 0);
    ls = window.runLongStrengthAnalysis(Ms);
  } catch(e) {}

  const lines = [];
  lines.push('=== FORM INPUTS ===');
  Object.keys(form).forEach(k => lines.push(`  ${k} = ${form[k]}`));
  lines.push('');
  lines.push('=== PLATE_THICKNESS object ===');
  Object.keys(pt).forEach(k => lines.push(`  ${k} = ${pt[k]}`));
  lines.push('');
  lines.push('=== STRAKES.shell (per-strake) ===');
  shellT.forEach((t,i) => lines.push(`  [${i}] ${t}`));
  lines.push('');
  lines.push('=== STRAKES.innerBottom ===');
  lines.push('  ' + ibT.join(', '));
  lines.push('');
  lines.push('=== STRAKES.innerSide ===');
  isT.forEach((t,i) => lines.push(`  [${i}] ${t}`));
  lines.push('');
  if (sp) {
    lines.push('=== SECTION PROPERTIES (fresh compute) ===');
    lines.push(`  I_NA   = ${(sp.I_NA/1e12).toFixed(4)} m⁴`);
    lines.push(`  z_NA   = ${(sp.NA/1000).toFixed(3)} m above BL`);
    lines.push(`  Z_B    = ${(sp.Z_bottom/1e9).toFixed(4)} m³`);
    lines.push(`  Z_D    = ${(sp.Z_upperDeck/1e9).toFixed(4)} m³`);
    lines.push(`  Z_HC   = ${(sp.Z_hatchCoaming/1e9).toFixed(4)} m³`);
    lines.push(`  Area   = ${(sp.totalArea/100).toFixed(0)} cm²`);
  }
  if (ls) {
    lines.push('');
    lines.push('=== HULL GIRDER ANALYSIS ===');
    lines.push(`  Mw_hog = ${ls.Mw_hog.toFixed(0)} kN·m`);
    lines.push(`  Mw_sag = ${ls.Mw_sag.toFixed(0)} kN·m`);
    lines.push(`  σ_amid = ${ls.sigma_amid.toFixed(1)} N/mm²`);
  }

  // === SPACING DIAGNOSTICS ===
  // Shows every plate group's profile count and what max-gap s is being
  // used in the sizing formulas. If s looks huge it means either:
  //   (a) profiles for that group were deleted (bug or user action), OR
  //   (b) realLongSpacing isn't including the outer boundary of the group.
  lines.push('');
  lines.push('=== LONG SPACING DIAGNOSTICS ===');
  const groups = [
    ['bottomShell',   'y',  'bottomLongSpacing'],
    ['innerBottom',   'y',  'ibLongSpacing'],
    ['sideShell',     'z',  'sideLongSpacing'],
    ['innerSide',     'z',  'isLongSpacing'],
    ['upperDeck',     'y',  'deckLongSpacing'],
    ['coamingStiff',  'y',  'coamingLongSpacing'],
    ['stringerStiff', 'y',  'strDeckSpacing'],
    ['tweenStiff',    'y',  'twnDeckSpacing'],
  ];
  groups.forEach(([grp, coord, inputId]) => {
    const arr = (D.profiles && D.profiles[grp]) || [];
    if (typeof window.realLongSpacing !== 'function') {
      lines.push(`  ${grp}: (realLongSpacing fn missing)`);
      return;
    }
    const supports = (typeof window.getPlateSupports === 'function')
      ? (window.getPlateSupports(grp) || []) : [];
    const trace = window.realLongSpacing(grp, { coord, inputId, trace: true, extraSupports: supports });
    const formVal = document.getElementById(inputId)?.value;
    if (arr.length < 2) {
      lines.push(`  ${grp}: n=${arr.length} — using form fallback ${formVal} mm`);
    } else {
      const coords = trace.sorted.map(p => Math.round(p[coord] || 0));
      const maxGap = trace.value;
      lines.push(`  ${grp}: n=${arr.length} profiles + ${supports.length} supports [${supports.map(Math.round).join(', ')}]`);
      lines.push(`          merged coords=[${coords.join(', ')}]`);
      lines.push(`          max gap = ${Math.round(maxGap)} mm (form says ${formVal})`);
    }
  });

  // --- PER-STRAKE SPACING (the real per-strake s used by plate sizing) ---
  if (typeof window.strakeLongSpacing === 'function') {
    lines.push('');
    lines.push('=== PER-STRAKE SPACING (strakeLongSpacing) ===');
    const strakeGroups = [
      ['shell', 'Shell'],
      ['innerBottom', 'Inner Bottom'],
      ['innerSide', 'Inner Side'],
      ['upperDeck', 'Upper Deck'],
    ];
    for (const [g, label] of strakeGroups) {
      const arr = D.STRAKES?.[g];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      lines.push(`  ${label}:`);
      for (let i = 0; i < arr.length; i++) {
        const r = window.strakeLongSpacing(g, i);
        const s = arr[i];
        const kind = s.kind || '-';
        const rng = r.range ? `[${Math.round(r.range[0])}, ${Math.round(r.range[1])}]` : '?';
        lines.push(`    [${i}] ${kind} t=${s.thickness} w=${s.width} range=${rng} → s=${Math.round(r.value)} (${r.reason})`);
      }
    }
  }

  console.log('[debugSectionProps]', { form, shellT, ibT, isT, pt, sp, ls });
  alert(lines.join('\n'));
};

