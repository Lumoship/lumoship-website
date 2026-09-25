/* ==========================================================================
   71-recalc.js  —  recalcAll() orchestration + save/load JSON
   Extracted verbatim from Index.html (lines 30609–31569 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==================== RENDER ====================
// Restoring a project dispatches a change event on every form input, and 74 of
// them carry an inline onchange="recalcAll()". That ran a full recalc 103 times
// per load - measured at 11.3 s of the 22 s an import took, with the main thread
// blocked throughout. Callers that are about to fire a burst of change events
// suspend recalculation, then run it once themselves.
//
// Coalesced, not dropped: if anything asked for a recalc while suspended, the
// flag below records it so the caller can tell.
window.__recalcSuspended = false;
window.__recalcPending = false;

window.suspendRecalc = function () {
  window.__recalcSuspended = true;
  window.__recalcPending = false;
};
// Returns true if at least one recalc was swallowed while suspended.
window.resumeRecalc = function () {
  window.__recalcSuspended = false;
  const pending = window.__recalcPending;
  window.__recalcPending = false;
  return pending;
};

function recalcAll() {
  if (window.__recalcSuspended) { window.__recalcPending = true; return; }
  // f1 girdisi yalnız 'restricted' seçiliyken okunuyor (Pt 3 Ch 4 Sec 5.1.1: diğer 3 durumda K2/svScale zaten sabit tablo değeriyle çarpıyor, f1 kutusu görmezden geliniyor) — arayüz bunu yansıtsın
  (function () {
    const sr = document.getElementById('serviceRestriction'), f1El = document.getElementById('f1');
    if (sr && f1El) { const restricted = sr.value === 'restricted'; f1El.disabled = !restricted; f1El.closest('.ea-field') && f1El.closest('.ea-field').classList.toggle('ref-only', !restricted); }
  })();
  // Moulded displacement at Tsc — standart Arşimet: Δ = L·B·T·Cb·1,025 (deniz suyu). Nauticus'ta salt-okunur gösteriliyor.
  (function () {
    const el = document.getElementById('dnvDispCalc'); if (!el) return;
    const L = parseFloat((document.getElementById('L') || {}).value), B = parseFloat((document.getElementById('B') || {}).value),
          T = parseFloat((document.getElementById('T') || {}).value), Cb = parseFloat((document.getElementById('Cb') || {}).value);
    el.value = (L > 0 && B > 0 && T > 0 && Cb > 0) ? Math.round(L * B * T * Cb * 1.025).toLocaleString('en-US') : '—';
  })();
  const p = getParams();
  const Cw = calcCw(p.L);

  // ──────────────────────────────────────────────────────────────────
  // SYNC FORM THICKNESS → STRAKES ARRAY
  // When the user edits a plate thickness field (bottomT, ibT, deckT, etc.)
  // we must propagate that value into the corresponding STRAKES entries
  // AND window.Draw.PLATE_THICKNESS so that computeSectionProperties uses
  // the new thickness. Otherwise hull-girder σ and buckling UC stay stale.
  //
  // IMPORTANT: only sync when STRAKES_AUTO is TRUE. If the user (or the
  // auto-optimize function) has disabled STRAKES_AUTO, it means the
  // thicknesses in STRAKES are user-managed (or freshly optimized) and
  // must NOT be overwritten from the form inputs.
  try {
    const D = window.Draw;
    const autoOn = (typeof STRAKES_AUTO !== 'undefined') ? STRAKES_AUTO : true;
    if (D && D.STRAKES && autoOn) {
      const readNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const v = parseFloat(el.value);
        return isNaN(v) ? null : v;
      };
      const bottomT  = readNum('bottomT');
      const keelT    = readNum('keelT');
      const bilgeT   = readNum('bilgeT');
      const ibT      = readNum('ibT');
      const udT      = readNum('deckT');
      const strT     = readNum('strDeckT');
      const twnT     = readNum('twnDeckT');
      const coamT    = readNum('coamingT');

      // Shell: update per-strake based on kind
      if (D.STRAKES.shell) {
        D.STRAKES.shell.forEach(s => {
          if (s.kind === 'keel'   && keelT   != null) s.thickness = keelT;
          if (s.kind === 'bottom' && bottomT != null) s.thickness = bottomT;
          if (s.kind === 'bilge'  && bilgeT  != null) s.thickness = bilgeT;
          // side strakes have their own per-strake thickness, don't auto-overwrite
        });
      }
      // Inner Bottom: all strakes same t
      if (D.STRAKES.innerBottom && ibT != null) {
        D.STRAKES.innerBottom.forEach(s => { s.thickness = ibT; });
      }
    }
    // PLATE_THICKNESS object (always sync — whole-plate fields UD/str/twn/coaming)
    if (D && D.PLATE_THICKNESS) {
      const readNum = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const v = parseFloat(el.value);
        return isNaN(v) ? null : v;
      };
      const udT   = readNum('deckT');
      const strT  = readNum('strDeckT');
      const twnT  = readNum('twnDeckT');
      const coamT = readNum('coamingT');
      const dkT   = readNum('dkT');
      const sgT   = readNum('sgT');
      const keelT = readNum('keelT');
      if (udT   != null) D.PLATE_THICKNESS.upperDeck = udT;
      if (strT  != null) D.PLATE_THICKNESS.stringer  = strT;
      if (twnT  != null) D.PLATE_THICKNESS.tween     = twnT;
      if (coamT != null) D.PLATE_THICKNESS.coaming   = coamT;
      // v79: also sync duct wall, side girder, keel — without this, editing
      // dkT / sgT / keelT in the form did not update the SVG: the duct wall
      // and side-girder verticals were drawn with the stale (default) value,
      // making them look invisible when the default was very thin.
      if (dkT   != null) D.PLATE_THICKNESS.duct       = dkT;
      if (sgT   != null) D.PLATE_THICKNESS.sideGirder = sgT;
      if (keelT != null) D.PLATE_THICKNESS.keel       = keelT;

      // Mirror the form values into the new STRAKES groups so the editor and
      // computeSectionProperties see the same numbers. These groups may have
      // their own user-edited thickness per strake; we only overwrite when
      // the group has a single strake (tek strake = form-driven behaviour).
      // If the user manually splits into multiple strakes, we preserve their
      // per-strake values.
      //
      // CRITICAL (v38): this mirror MUST also respect STRAKES_AUTO. Without
      // the gate, after the Section-Modulus optimizer raises e.g. coamingTop
      // 25 → 50 mm, the next recalcAll() fires (auto-triggered) and reads
      // the form's coamingT (still 25) and writes it back into the strake —
      // silently undoing every optimizer change. The earlier `autoOn` gate
      // a few lines up only protected the shell/IB sync; this branch was
      // unconditional.
      if (D.STRAKES && autoOn) {
        const syncSingle = (groupName, newT) => {
          const g = D.STRAKES[groupName];
          if (!g || g.length !== 1 || newT == null) return;
          g[0].thickness = newT;
        };
        syncSingle('upperDeck', udT);
        syncSingle('coamingTop', coamT);
        syncSingle('coamingWall', coamT);
      }
      // ─── ALWAYS-SYNC GROUPS (stringer / tween / sideGirder) ───────────
      // These groups need their thickness mirrored from the form even when
      // STRAKES_AUTO is false. Reason: STRAKES_AUTO=false means "don't
      // regenerate strake widths on geometry change" — it does NOT mean
      // "ignore the user's form edit". When the user types a new value
      // into the Side Girder t / Stringer t / Tween t field, that's an
      // explicit instruction that must apply to whatever strakes already
      // exist for that group, regardless of the auto/manual mode.
      //
      // Earlier these were inside the `if (autoOn)` block, so flipping
      // STRAKES_AUTO=false anywhere (e.g. through the strake editor or an
      // optimizer step) silently broke the form → STRAKES → section-prop
      // chain. The form looked active but Z_B / Z_D / I_NA stayed flat
      // because computeSectionProperties() was reading STRAKES (stale)
      // instead of PLATE_THICKNESS (fresh).
      if (D.STRAKES) {
        if (D.STRAKES.stringer && strT != null) {
          D.STRAKES.stringer.forEach(s => { s.thickness = strT; });
        }
        if (D.STRAKES.tween && twnT != null) {
          D.STRAKES.tween.forEach(s => { s.thickness = twnT; });
        }
        // Per-stringer subgroups (stringer0, stringer1, ...)
        Object.keys(D.STRAKES).forEach(k => {
          if (/^stringer\d+$/.test(k) && strT != null) {
            D.STRAKES[k].forEach(s => { s.thickness = strT; });
          }
          if (/^tween\d+$/.test(k) && twnT != null) {
            D.STRAKES[k].forEach(s => { s.thickness = twnT; });
          }
        });
        // Side girders — sideGirder0/1/2 — read sgT
        const sgT_now = readNum('sgT');
        if (sgT_now != null) {
          ['sideGirder0', 'sideGirder1', 'sideGirder2'].forEach(k => {
            if (D.STRAKES[k]) {
              D.STRAKES[k].forEach(s => { s.thickness = sgT_now; });
            }
          });
        }
      }
    }
    // Invalidate any cached section and recompute
    if (D && typeof D.computeSectionProperties === 'function') {
      try { D.computeSectionProperties(); } catch(e) {}
    }
  } catch(e) { console.warn('[recalcAll] thickness sync error:', e); }

  // ──────────────────────────────────────────────────────────────────
  // AUTO-SYNC F_B / F_D from the live section (LR Pt 3 Ch 4 Sec 5.7.2)
  // ──────────────────────────────────────────────────────────────────
  // Setup-zone factors used to be a manual assumption; once the user
  // optimises plates / strakes the actual section drifts and the F's
  // must be recomputed on every recalcAll. The correct definition is
  //   F = σ_actual / σ_perm     (Sec 5.7.2)
  // — NOT Z_actual / Z_required (that is a section-modulus margin, an
  // entirely different quantity that an earlier version of this tool
  // mistakenly used). The LongStrength.analyze() result already carries
  // the proper σ-ratio in F_B_raw / F_D_raw; we just route it back into
  // the FB / FD inputs so every downstream formula sees the live value.
  //
  // Floors per Sec 5.7.2: 0.67 plating, 0.75 longitudinal stiffener.
  // We expose the longitudinal floor (the stricter of the two) on the
  // input box because the same value drives both stiffener and plating
  // formulas, and being safe-on-stiffener is the binding case. NO upper
  // clamp — F > 1.0 means the hull-girder section modulus is inadequate
  // (σ_actual > σ_perm); we let the value pass through so the plate /
  // stiffener formulas demand thicker scantlings as required.
  //
  // RE-ENTRY GUARD: the input listeners for FB / FD call recalcAll()
  // on `change`. We mutate `.value` only (no event dispatch) and skip
  // when the delta is below 0.005 to avoid infinite loops when the
  // computed value oscillates by floating-point noise.
  if (!recalcAll._FBFD_LOCK) {
    recalcAll._FBFD_LOCK = true;
    try {
      const ls = (typeof runLongStrengthAnalysis === 'function')
        ? runLongStrengthAnalysis() : null;
      // ─── CORRECT F_B / F_D PER LR Pt 3, Ch 4, Sec 5.7.2 ───
      // F = σ_actual / σ_perm  (NOT Z_actual / Z_required — that is a
      // section-modulus margin, an entirely different quantity).
      //   σ_D = |Ms + Mw_worst| / Z_D · 1e-3   N/mm²
      //   σ_B = |Ms + Mw_worst| / Z_B · 1e-3
      //   σ_perm = 175 / k_L                    (Sec 5.6.1, midship 0.4L)
      // Floor:  plating = 0.67, longitudinal stiffener = 0.75.
      // NO upper clamp: F > 1.0 means hull-girder is overstressed → the
      // formulas downstream will (correctly) demand thicker plate /
      // larger stiffener. We surface that as a FAIL state instead of
      // silently writing 1.0.
      //
      // MANUAL MODE: if the user has switched the F_B / F_D Mode selector
      // to "Manual", we DO NOT overwrite their typed F_B / F_D values.
      // We still compute raw σ_B/σ_D internally (exposed via p.FB_raw etc.)
      // so the diagnostic panel can show them, but p.FB / p.FD stay at the
      // user-typed values from the Setup inputs.
      const _fbfdMode = (typeof getFBFDMode === 'function') ? getFBFDMode() : 'auto';
      if (ls && typeof ls.F_B_raw === 'number' && typeof ls.F_D_raw === 'number') {
        const FB_in = document.getElementById('FB');
        const FD_in = document.getElementById('FD');
        const FB_raw = ls.F_B_raw;
        const FD_raw = ls.F_D_raw;
        // The single F input drives BOTH plating and longitudinal formulas.
        // To stay safe for both, use the longitudinal floor (0.75) — it is
        // the stricter of the two and binding for stiffener Z calculations.
        // Plating-only consumers may relax to 0.67 internally; we expose
        // the longitudinal-floor value as the "live" input.
        const FB_new = Math.max(FB_raw, 0.75);
        const FD_new = Math.max(FD_raw, 0.75);
        if (_fbfdMode === 'auto') {
          if (FB_in) {
            const FB_old = parseFloat(FB_in.value);
            if (!isFinite(FB_old) || Math.abs(FB_new - FB_old) > 0.005) {
              FB_in.value = FB_new.toFixed(3);
              p.FB = FB_new;
              const overStressTag = (FB_raw > 1.0) ? ' ⚠ HULL OVERSTRESSED' : '';
              FB_in.title = `LR Pt 3 Ch 4 Sec 5.7: F_B = σ_B/σ_perm = ${FB_raw.toFixed(3)} → applied ${FB_new.toFixed(3)} (long. floor 0.75)${overStressTag}`;
            }
          }
          if (FD_in) {
            const FD_old = parseFloat(FD_in.value);
            if (!isFinite(FD_old) || Math.abs(FD_new - FD_old) > 0.005) {
              FD_in.value = FD_new.toFixed(3);
              p.FD = FD_new;
              const overStressTag = (FD_raw > 1.0) ? ' ⚠ HULL OVERSTRESSED' : '';
              FD_in.title = `LR Pt 3 Ch 4 Sec 5.7: F_D = σ_D/σ_perm = ${FD_raw.toFixed(3)} → applied ${FD_new.toFixed(3)} (long. floor 0.75)${overStressTag}`;
            }
          }
        } else {
          // MANUAL MODE: keep user's typed values; just refresh the tooltip
          // so they can see what the auto value WOULD have been.
          if (FB_in) {
            FB_in.title = `MANUAL MODE — using your typed value F_B = ${parseFloat(FB_in.value).toFixed(3)}. (Auto would compute: σ_B/σ_perm = ${FB_raw.toFixed(3)} → ${FB_new.toFixed(3)} with floor 0.75.)`;
          }
          if (FD_in) {
            FD_in.title = `MANUAL MODE — using your typed value F_D = ${parseFloat(FD_in.value).toFixed(3)}. (Auto would compute: σ_D/σ_perm = ${FD_raw.toFixed(3)} → ${FD_new.toFixed(3)} with floor 0.75.)`;
          }
          // Make sure p.FB / p.FD reflect the USER'S typed values, not the
          // auto-computed ones. getParams() reads from the input directly,
          // but we also re-read here to be explicit and to guard against
          // any earlier overwrite in this same recalc cycle.
          if (FB_in) p.FB = parseFloat(FB_in.value);
          if (FD_in) p.FD = parseFloat(FD_in.value);
        }
        // Stash raw + plating-floor variants on the params object so any
        // plating consumer can pick the relaxed 0.67 floor if it knows it
        // is dealing with plate (not stiffener). recalcAll's downstream
        // code picks p.FB / p.FD which carry the longitudinal floor (auto)
        // or the user's typed value (manual).
        p.FB_raw = FB_raw;  p.FD_raw = FD_raw;
        p.FB_plating = (_fbfdMode === 'auto') ? Math.max(FB_raw, 0.67) : p.FB;
        p.FD_plating = (_fbfdMode === 'auto') ? Math.max(FD_raw, 0.67) : p.FD;
        p.FB_long    = (_fbfdMode === 'auto') ? FB_new : p.FB;
        p.FD_long    = (_fbfdMode === 'auto') ? FD_new : p.FD;
        p.FB_overstressed = FB_raw > 1.0;
        p.FD_overstressed = FD_raw > 1.0;
        p.FBFD_mode = _fbfdMode;
      }
    } catch (err) {
      console.warn('[recalcAll] F_B/F_D auto-sync failed:', err);
    } finally {
      recalcAll._FBFD_LOCK = false;
    }
  }

  // Populate profile dropdowns (filtered by Z_req + slenderness + safety margin)
  populateProfileDropdowns();
  
  // Bottom
  const bp = calcBottomPlate();
  const bl = calcBottomLong();
  document.getElementById('bottomZreq').value = bl.Z_req.toFixed(0);
  
  const profName = bl.resolvedProfile;  // AUTO resolved to actual profile
  const bt = parseFloat(document.getElementById('bottomT').value);
  // Real spacing from drawing (matches calcBottomLongCore). Falls back to form.
  const s = (typeof realLongSpacing === 'function')
            ? realLongSpacing('bottomShell', {
                coord: 'y', inputId: 'bottomLongSpacing', defaultFallback: 700,
                extraSupports: (typeof getPlateSupports === 'function')
                               ? getPlateSupports('bottomShell') : []
              })
            : parseFloat(document.getElementById('bottomLongSpacing').value);
  const Z_sec_b = sectionZL(s, bt, profName);
  const status_b = Z_sec_b >= bl.Z_req ? '✓ OK' : '✗ FAIL';
  const stCls_b = Z_sec_b >= bl.Z_req ? 'success' : 'warning';
  
  // Show resolved profile next to dropdown
  const blSel = document.getElementById('bottomLongProfile');
  const isAuto = blSel.value === 'AUTO';
  const bl_kg = weightPerM(getProfileData(profName)?.area || 0);
  document.getElementById('bottomCalc').innerHTML = `
    <div class="ea-calc-row"><span class="lbl">Long spacing s (max real gap)</span><span class="val cyan">${bp.s.toFixed(0)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">Plate t_net (a/b)</span><span class="val">${bp.t_a.toFixed(2)} / ${bp.t_b.toFixed(2)} mm — gov ${bp.gov}</span></div>
    <div class="ea-calc-row"><span class="lbl">Long Z_req (wave hT2=${bl.hT2.toFixed(2)} m)</span><span class="val cyan">${bl.Z_req.toFixed(1)} cm³</span></div>
    <div class="ea-calc-row"><span class="lbl">Selected Profile${isAuto ? ' (AUTO)' : ''}</span><span class="val success">${profName} · ${bl_kg.toFixed(1)} kg/m</span></div>
    <div class="ea-calc-row"><span class="lbl">Long Z_section (with plate ${s}×${bt})</span><span class="val">${Z_sec_b.toFixed(1)} cm³</span></div>
    <div class="ea-calc-row"><span class="lbl">γ · F1 · Fsb</span><span class="val">${bl.gamma.toFixed(3)} · ${bl.F1.toFixed(3)} · ${bl.Fsb.toFixed(3)}</span></div>
    <div class="ea-calc-row"><span class="lbl">Status</span><span class="val ${stCls_b}">${status_b}</span></div>
  `;
  
  // IB — Plate (Sec 8.4.1 + 8.4.2 + 2.2.2 + 8.4.4) + Long (Sec 8.4.5)
  // Show/hide side tank inputs
  const ibSideTankSel = document.getElementById('ibSideTank').value;
  document.getElementById('ibSideTankRow').style.display = ibSideTankSel === 'yes' ? 'grid' : 'none';
  
  const ibP = calcIBPlate();
  const ibL = calcIBLong(bl.Z_req);  // Sec 8.4.5 full check
  const Z_ib = ibL.Z_req;             // governing Z (may be deep tank)
  document.getElementById('ibZreq').value = Z_ib.toFixed(0);
  
  // IB long — INDEPENDENT profile selection (no longer shared with bottom)
  // Populate dropdown based on Z_ib required for IB long (not bottom's)
  // Real spacing from drawing (matches calcIBLong). Falls back to form.
  const ibSpacing = (typeof realLongSpacing === 'function')
            ? realLongSpacing('innerBottom', {
                coord: 'y', inputId: 'ibLongSpacing', defaultFallback: 700,
                extraSupports: (typeof getPlateSupports === 'function')
                               ? getPlateSupports('innerBottom') : []
              })
            : parseFloat(document.getElementById('ibLongSpacing').value);
  const ibPlateT  = parseFloat(document.getElementById('ibT').value);
  populateFilteredDropdown('ibLongProfile', Z_ib, ibSpacing, ibPlateT, p.kL);
  
  // Read selected IB profile (user choice or auto-picked)
  const ibProfName = document.getElementById('ibLongProfile').value;
  let Z_sec_ib = 0;
  let ibProfWeight = 0;
  if (ibProfName && typeof sectionZWithPlate === 'function') {
    const ibSec = sectionZWithPlate(ibProfName, ibSpacing, ibPlateT);
    Z_sec_ib = ibSec.Z_min;
    ibProfWeight = ibSec.weight;
  }
  
  document.getElementById('ibZsec').value = Z_sec_ib ? Z_sec_ib.toFixed(1) : '—';
  const plateOK = ibP.passFail;
  const longOK  = Z_sec_ib >= Z_ib && ibL.spanOK;
  const plateSt = plateOK ? '✓ OK' : '✗ FAIL';
  const longSt  = longOK  ? '✓ OK' : '✗ FAIL';
  const plateCls = plateOK ? 'success' : 'warning';
  const longCls  = longOK  ? 'success' : 'warning';
  document.getElementById('ibLongStatus').value = longSt;
  document.getElementById('ibLongStatus').style.color = longOK ? 'var(--success)' : 'var(--error)';
  
  let deepRow = '';
  if (ibP.t_deep !== null) {
    deepRow = `<div class="ea-calc-row"><span class="lbl">t (Sec 8.4.4 deep tank)</span><span class="val">${ibP.t_deep.toFixed(2)} mm</span></div>`;
  }
  
  // Long extra rows (Sec 8.4.5)
  let longDeepRow = '';
  if (ibL.Z_dt !== null) {
    longDeepRow = `<div class="ea-calc-row"><span class="lbl">Long Z_deep (Sec 8.4.5 if connected to side tank)</span><span class="val">${ibL.Z_dt.toFixed(1)} cm³</span></div>`;
  }
  const spanCls = ibL.spanOK ? 'success' : 'warning';
  const spanSt = ibL.spanOK ? '✓ OK' : '✗ FAIL';
  let htRow = '';
  if (ibL.htNote) {
    htRow = `<div class="ea-calc-row"><span class="lbl">⚠ HT Steel Note</span><span class="val warning">${ibL.htNote}</span></div>`;
  }
  
  document.getElementById('ibCalc').innerHTML = `
    <div class="ea-calc-row"><span class="lbl">Configuration</span><span class="val">${ibP.location} · Ceiling: ${ibP.ceiling} · Grab: ${ibP.grab} · Side tank: ${ibP.sideTank}</span></div>
    <div class="ea-calc-row"><span class="lbl">Long spacing s (max real gap)</span><span class="val cyan">${ibP.s.toFixed(0)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">t_base (Sec 8.4.1): ${ibP.formula_base}</span><span class="val">${ibP.t_base.toFixed(2)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">Minimum (${ibP.t_min === 7.5 ? '7.5 hatch/no-ceiling' : '6.5 hold'})</span><span class="val">${ibP.t_min.toFixed(1)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">Increment (${ibP.incRule}): ${ibP.incDesc}</span><span class="val">+${ibP.increment.toFixed(1)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">t with increment = max(t_base, t_min) + Δ</span><span class="val">${ibP.t_with_incr.toFixed(2)} mm</span></div>
    ${deepRow}
    <div class="ea-calc-row"><span class="lbl">t_req (governing: ${ibP.gov})</span><span class="val cyan">${ibP.t_req.toFixed(2)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">Plate as-built</span><span class="val">${ibP.t_ib.toFixed(1)} mm</span></div>
    <div class="ea-calc-row"><span class="lbl">Plate Status (Sec 8.4)</span><span class="val ${plateCls}">${plateSt}</span></div>
    <div class="ea-calc-row"><span class="lbl">Long Z_85 = 0.85 × Z_bot (Sec 8.4.5)</span><span class="val">${ibL.Z_85.toFixed(1)} cm³</span></div>
    ${longDeepRow}
    <div class="ea-calc-row"><span class="lbl">Long Z_req (governing: ${ibL.gov})</span><span class="val cyan">${Z_ib.toFixed(1)} cm³</span></div>
    <div class="ea-calc-row"><span class="lbl">Long Profile</span><span class="val">${ibProfName || '—'}${ibProfWeight ? ` · ${ibProfWeight.toFixed(1)} kg/m` : ''}</span></div>
    <div class="ea-calc-row"><span class="lbl">Long Z_section</span><span class="val">${Z_sec_ib.toFixed(1)} cm³</span></div>
    <div class="ea-calc-row"><span class="lbl">Unsupported span l_e = ${ibL.le.toFixed(2)} m (Sec 8.4.5 limit ≤ 2.5 m)</span><span class="val ${spanCls}">${spanSt}</span></div>
    ${htRow}
    <div class="ea-calc-row"><span class="lbl">Long Status</span><span class="val ${longCls}">${longSt}</span></div>
  `;
  
  // Side plate strakes
  const strakes = calcSidePlate();
  const sb = document.getElementById('sidePlateBody');
  sb.innerHTML = '';
  // FSICR context (null when disabled)
  const _iceCtxPlate = (typeof FSICR !== 'undefined') ? FSICR.compute() : null;
  strakes.forEach(s => {
    const tr = document.createElement('tr');
    let tCls = s.t_sy === 14 ? 'cyan' : (s.t_sy === 14.5 ? 'warning' : '');
    let tDisp = s.t_sy.toFixed(1);
    let govDisp = s.gov;
    // FSICR governance: if mid-strake z is in plate ice belt, take max(LR, FSICR)
    if (_iceCtxPlate) {
      const mid_mm = s.mid * 1000;
      if (FSICR.inPlateIceBelt(mid_mm, _iceCtxPlate)) {
        const t_ice = _iceCtxPlate.plate_t(s.max_sp, true).t_final;
        if (t_ice > s.t_sy) {
          tDisp = `${t_ice.toFixed(1)} <span style="color:var(--cyan);font-size:0.65rem">[ICE]</span>`;
          tCls = 'warning';
          govDisp = `${s.gov} → FSICR ${t_ice.toFixed(1)}`;
        } else {
          tDisp = `${s.t_sy.toFixed(1)} <span style="color:var(--text-muted);font-size:0.65rem">[ice ${t_ice.toFixed(1)}]</span>`;
        }
      }
    }
    tr.innerHTML = `
      <td><span class="badge badge-purple">#${s.n}</span></td>
      <td>${s.z1}</td><td>${s.z2}</td><td>${s.H}</td>
      <td>${s.mid.toFixed(2)}</td>
      <td>${s.max_sp}</td>
      <td class="${tCls}">${tDisp}</td>
      <td>${govDisp}</td>
    `;
    sb.appendChild(tr);
  });
  
  // Side longs
  const sideLongs = calcSideLong();
  const slb = document.getElementById('sideLongBody');
  slb.innerHTML = '';
  sideLongs.forEach(l => {
    const region = l.region || '';
    const badge = (region === 'LR' || region === 'User')
      ? 'badge-orange'
      : (region.includes('void') ? 'badge-cyan' : 'badge-blue');
    let zReqDisp = l.Z_req.toFixed(1);
    let zReqCls = 'cyan';
    // FSICR badge: ICE-driven Z value highlighted
    if (l.iceGoverns) {
      zReqDisp = `${l.Z_req.toFixed(1)} <span style="color:var(--cyan);font-size:0.65rem">[ICE]</span>`;
      zReqCls = 'warning';
    } else if (l.Z_ice != null) {
      // Ice computed but did not govern — show subdued for transparency
      zReqDisp = `${l.Z_req.toFixed(1)} <span style="color:var(--text-muted);font-size:0.65rem">[ice ${l.Z_ice.toFixed(1)}]</span>`;
    }
    // FSICR 4.4.3 shear area (Eq 4.10) and 4.4.4.2 web thickness of the fitted profile
    if (l.Z_ice != null && (l.iceShearOK != null || l.iceWebOK != null)) {
      const parts = [];
      if (l.iceShearOK != null) parts.push(`<span style="color:${l.iceShearOK ? 'var(--success)' : 'var(--danger,#ef4444)'}" title="FSICR Eq 4.10 shear area: web ${l.A_web.toFixed(1)} cm² vs ${l.A_ice.toFixed(1)} cm² required">A ${l.iceShearOK ? '✓' : '✗ ' + l.A_ice.toFixed(1)}</span>`);
      if (l.iceWebOK != null) parts.push(`<span style="color:${l.iceWebOK ? 'var(--success)' : 'var(--danger,#ef4444)'}" title="FSICR 4.4.4.2 web thickness: ${l.tw_act} mm vs ${l.tw_min_ice.toFixed(1)} mm minimum">t_w ${l.iceWebOK ? '✓' : '✗ ' + l.tw_min_ice.toFixed(1)}</span>`);
      zReqDisp += ` <span style="font-size:0.62rem">${parts.join(' ')}</span>`;
    }
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${l.n}</td>
      <td>${l.z}</td><td>${l.s}</td>
      <td>${l.strake}</td>
      <td><span class="badge ${badge}">${region || '—'}</span></td>
      <td>${l.loc}</td>
      <td class="${zReqCls}">${zReqDisp}</td>
      <td><span class="badge badge-green">${l.group}</span></td>
    `;
    slb.appendChild(tr);
  });
  
  // Side groups
  const groups = calcSideGroups();
  const sgb = document.getElementById('sideGroupBody');
  sgb.innerHTML = '';
  Object.keys(groups).forEach(k => {
    const g = groups[k];
    const tr = document.createElement('tr');
    const stCls = g.safety >= 0 ? 'success' : 'error';
    // Build profile dropdown inline - viable profiles only
    const viable = getViableProfiles(g.Z_max, g.s_max, g.t_plate, p.kL);
    let selectHTML = `<select id="sideGroupProfile_${k}" onchange="recalcAll()" style="min-width:200px">`;
    if (viable.length === 0) {
      selectHTML += `<option disabled>— no viable —</option>`;
    } else {
      const byType = { 'L':[], 'HP':[], 'FB':[] };
      viable.forEach(v => {
        if (v.name.startsWith('L ')) byType.L.push(v);
        else if (v.name.startsWith('HP ')) byType.HP.push(v);
        else if (v.name.startsWith('FB ')) byType.FB.push(v);
      });
      Object.keys(byType).forEach(type => {
        if (byType[type].length === 0) return;
        selectHTML += `<optgroup label="${type === 'L' ? 'L Profile' : type === 'HP' ? 'HP Bulb' : 'Flat Bar'}">`;
        byType[type].forEach(v => {
          const sel = v.name === g.profile ? ' selected' : '';
          selectHTML += `<option value="${v.name}"${sel}>${v.name} · Z=${v.Z.toFixed(0)} · ${v.weight.toFixed(1)}kg · +${v.safety.toFixed(0)}%</option>`;
        });
        selectHTML += `</optgroup>`;
      });
    }
    selectHTML += `</select>`;
    
    tr.innerHTML = `
      <td><span class="badge badge-green">${k}</span></td>
      <td>${g.longs.join(', ')}</td>
      <td>${g.Z_max.toFixed(1)}</td>
      <td>${g.t_plate.toFixed(1)}</td>
      <td>${selectHTML}</td>
      <td class="cyan">${g.Z_sec.toFixed(1)}</td>
      <td class="${stCls}">${g.safety >= 0 ? '+' : ''}${g.safety.toFixed(1)}%</td>
      <td>${g.kg.toFixed(1)}</td>
    `;
    sgb.appendChild(tr);
  });
  
  // Inner side
  const is_data = calcInnerSide();
  const isb = document.getElementById('innerSidePlateBody');
  isb.innerHTML = '';
  is_data.strakes.forEach(s => {
    const badge = s.region === 'Tank' ? 'badge-blue' : (s.region === 'Void' ? 'badge-cyan' : 'badge-orange');
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${s.n}</td>
      <td>${s.z1}</td><td>${s.z2}</td>
      <td><span class="badge ${badge}">${s.region}</span></td>
      <td>${s.max_sp}</td>
      <td>${s.h4 ? s.h4.toFixed(2) : '—'}</td>
      <td class="cyan">${s.t.toFixed(1)}</td>
      <td>${s.rule}</td>
    `;
    isb.appendChild(tr);
  });
  
  const isgb = document.getElementById('innerSideGroupBody');
  isgb.innerHTML = '';
  const s_is_val = 650;
  Object.keys(is_data.groups).forEach(k => {
    const g = is_data.groups[k];
    const tr = document.createElement('tr');
    // Profile dropdown for inner side groups
    const viable = getViableProfiles(g.Z_max, s_is_val, 10, p.kL);
    let selectHTML = `<select id="innerSideGroupProfile_${k}" onchange="recalcAll()" style="min-width:200px">`;
    if (viable.length === 0) {
      selectHTML += `<option disabled>— no viable —</option>`;
    } else {
      const byType = { 'L':[], 'HP':[], 'FB':[] };
      viable.forEach(v => {
        if (v.name.startsWith('L ')) byType.L.push(v);
        else if (v.name.startsWith('HP ')) byType.HP.push(v);
        else if (v.name.startsWith('FB ')) byType.FB.push(v);
      });
      Object.keys(byType).forEach(type => {
        if (byType[type].length === 0) return;
        selectHTML += `<optgroup label="${type === 'L' ? 'L Profile' : type === 'HP' ? 'HP Bulb' : 'Flat Bar'}">`;
        byType[type].forEach(v => {
          const sel = v.name === g.profile ? ' selected' : '';
          const safetyPct = ((v.Z - g.Z_max)/g.Z_max*100);
          selectHTML += `<option value="${v.name}"${sel}>${v.name} · Z=${v.Z.toFixed(0)} · ${v.weight.toFixed(1)}kg · +${safetyPct.toFixed(0)}%</option>`;
        });
        selectHTML += `</optgroup>`;
      });
    }
    selectHTML += `</select>`;
    tr.innerHTML = `
      <td><span class="badge badge-orange">${k}</span></td>
      <td>${g.z_range}</td>
      <td>${g.count}</td>
      <td><span class="badge badge-blue">${g.region}</span></td>
      <td class="cyan">${g.Z_max.toFixed(1)}</td>
      <td>${selectHTML}</td>
      <td>${g.Z_sec.toFixed(1)}</td>
      <td>${g.kg.toFixed(1)}</td>
    `;
    isgb.appendChild(tr);
  });
  
  // DB
  const dbRows = calcDB();
  const dbb = document.getElementById('dbBody');
  dbb.innerHTML = '';
  dbRows.forEach(r => {
    const tr = document.createElement('tr');
    let statusCls = 'cyan';
    let statusTxt = r.status;
    if (r.status === 'OK') { statusCls = 'success'; statusTxt = '✓ OK'; }
    else if (r.status === 'FAIL') { statusCls = 'error'; statusTxt = '✗ FAIL'; }
    else if (r.status === 'INFO') { statusCls = ''; statusTxt = 'ℹ INFO'; }
    else if (r.status === 'N/A')  { statusCls = ''; statusTxt = '— N/A'; }
    tr.innerHTML = `
      <td><strong>${r.elem}</strong></td>
      <td>${r.count}</td>
      <td class="cyan">${r.t}</td>
      <td style="font-size:0.75rem">${r.dim}</td>
      <td>${r.rule}</td>
      <td style="font-size:0.75rem">${r.formula}</td>
      <td class="cyan">${r.t_req}</td>
      <td class="${statusCls}">${statusTxt}<div style="font-size:0.7rem;opacity:0.7;font-weight:normal">${r.note || ''}</div></td>
    `;
    dbb.appendChild(tr);
  });
  
  // ============ DECKS (Sec 4 — Tables 1.4.1–1.4.4) ============
  const renderDeckCalc = (prefix, plateRes, longRes, profName, isUpper) => {
    const t_as = plateRes.t_as || plateRes.t_ud;
    const plateOK = plateRes.passFail;
    const pd = getProfileData(profName);
    const s = parseFloat(document.getElementById(isUpper ? 'deckLongSpacing' : prefix + 'DeckSpacing').value);
    const t_plate = parseFloat(document.getElementById(isUpper ? 'deckT' : prefix + 'DeckT').value);
    const r = pd ? sectionZWithPlate(profName, s, t_plate) : null;
    const Z_sec = r ? r.Z_min : 0;
    const longOK = Z_sec >= longRes.Z_req;
    const plateSt = plateOK ? '✓ OK' : '✗ FAIL';
    const longSt = longOK ? '✓ OK' : '✗ FAIL';
    const plateCls = plateOK ? 'success' : 'warning';
    const longCls = longOK ? 'success' : 'warning';

    // LR inertia check I ≥ (2.3/k)·l_e·Z   (Tables 1.4.3, 1.4.4, 1.6.1, 1.9.1)
    const p = getParams();
    const le_eff = Math.max(p.le, 1.5);
    const I_req = (2.3 / p.k) * le_eff * longRes.Z_req;
    const I_sec = r?.Ixx ?? 0;
    const iOK = I_req <= 0 || I_sec >= I_req;
    const iSt = iOK ? '✓ OK' : '✗ FAIL';
    const iCls = iOK ? 'success' : 'warning';

    // LR web-thickness minimum (Note 3 Table 1.9.1 / Note 1 Table 1.4.3)
    const wm = (typeof checkWebMin === 'function') ? checkWebMin(profName, p.kL, true) : null;
    const webRow = wm ? `
      <div class="ea-calc-row"><span class="lbl">Web t_min (LR Note 3)</span><span class="val ${wm.ok ? 'success' : 'warning'}">${wm.t_w.toFixed(1)} / ${wm.t_w_min.toFixed(1)} mm  ${wm.ok ? '✓' : '✗'}</span></div>` : '';

    return `
      <div class="ea-calc-row"><span class="lbl">Plate formula</span><span class="val" style="font-size:0.7rem">${plateRes.formula}</span></div>
      <div class="ea-calc-row"><span class="lbl">Plate t_req</span><span class="val cyan">${plateRes.t_req.toFixed(2)} mm</span></div>
      <div class="ea-calc-row"><span class="lbl">Plate as-built</span><span class="val">${t_as.toFixed(1)} mm</span></div>
      <div class="ea-calc-row"><span class="lbl">Plate Status</span><span class="val ${plateCls}">${plateSt}</span></div>
      <div class="ea-calc-row"><span class="lbl">Long formula</span><span class="val" style="font-size:0.7rem">${longRes.formula}</span></div>
      <div class="ea-calc-row"><span class="lbl">Long Z_req</span><span class="val cyan">${longRes.Z_req.toFixed(1)} cm³</span></div>
      <div class="ea-calc-row"><span class="lbl">Long Profile</span><span class="val">${profName || '—'}</span></div>
      <div class="ea-calc-row"><span class="lbl">Long Z_section</span><span class="val">${Z_sec.toFixed(1)} cm³</span></div>
      <div class="ea-calc-row"><span class="lbl">Long Status</span><span class="val ${longCls}">${longSt}</span></div>
      <div class="ea-calc-row"><span class="lbl">I_req = (2.3/k)·l_e·Z</span><span class="val cyan">${I_req.toFixed(0)} cm⁴</span></div>
      <div class="ea-calc-row"><span class="lbl">I_section</span><span class="val ${iCls}">${I_sec.toFixed(0)} cm⁴  ${iSt}</span></div>
      ${webRow}
    `;
  };
  
  // Stringer Deck
  const strPlate = calcLowerDeckPlate('str');
  const strLong = calcLowerDeckLong('str');
  const strProf = document.getElementById('strDeckProfile').value;
  document.getElementById('strDeckCalc').innerHTML = renderDeckCalc('str', strPlate, strLong, strProf, false);
  
  // Tween Deck
  const twnPlate = calcLowerDeckPlate('twn');
  const twnLong = calcLowerDeckLong('twn');
  const twnProf = document.getElementById('twnDeckProfile').value;
  document.getElementById('twnDeckCalc').innerHTML = renderDeckCalc('twn', twnPlate, twnLong, twnProf, false);
  
  // Upper Deck
  const udPlate = calcUpperDeckPlate();
  const udLong = calcUpperDeckLong();
  const udProf = document.getElementById('deckLongProfile').value;
  document.getElementById('udDeckLevelRO').value = p.udLevel;
  document.getElementById('udDeckCalc').innerHTML = renderDeckCalc('', udPlate, udLong, udProf, true);
  
  // Wire up "🔍 Suggest" buttons next to all profile dropdowns (idempotent)
  if (typeof wireSuggestButtons === 'function') {
    try { wireSuggestButtons(); } catch(e) { console.warn('wireSuggestButtons:', e); }
  }
  
  // SUMMARY PAGE
  const w = calcWeight();
  document.getElementById('sum_total').textContent = '7';
  // A blank required input (l_e, for one) propagates NaN all the way here, and
  // the card used to print "NaN" in 2rem type with nothing saying why. Show
  // what is missing instead. The arithmetic is unchanged - only the readout.
  const _setWeight = (id, val) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (Number.isFinite(val)) {
      el.textContent = val.toFixed(0);
      el.classList.remove('is-nan');
      el.removeAttribute('title');
      return;
    }
    const blanks = ['le', 'MsDesign', 'ibSideTankH']
      .filter(k => {
        const f = document.getElementById(k);
        return f && String(f.value).trim() === '';
      });
    el.textContent = blanks.length ? 'input needed' : 'n/a';
    el.classList.add('is-nan');
    el.title = blanks.length
      ? 'Blank on the Setup page: ' + blanks.join(', ')
      : 'Could not be computed from the current inputs.';
  };
  _setWeight('sum_plate', w.W_plate);
  _setWeight('sum_long',  w.W_long);
  _setWeight('sum_grand', w.total);
  refreshSummaryStatus();
  document.getElementById('sum_FBD').textContent = `${p.FB.toFixed(2)} / ${p.FD.toFixed(2)}`;
  document.getElementById('sum_mat').textContent = `${p.matKey} (k=${p.k})`;
  document.getElementById('sum_Cw').textContent = Cw.toFixed(2) + ' m';
  const _Flambda = calcFlambda(p.L);
  const _sumFlambdaEl = document.getElementById('sum_Flambda');
  if (_sumFlambdaEl) _sumFlambdaEl.textContent = _Flambda.toFixed(4);
  
  // Local vars needed for summary table
  const L_eff = 0.80 * p.L;
  const R_B = 1.8; // bilge radius m
  const B = p.B;
  const keel_w = parseFloat(document.getElementById('keelWidth').value)/1000;
  const t_keel = parseFloat(document.getElementById('keelT').value);
  const t_bilge = parseFloat(document.getElementById('bilgeT').value);
  const t_ib = parseFloat(document.getElementById('ibT').value);
  const t_deck = parseFloat(document.getElementById('deckT').value);
  
  // Summary table
  const sm = document.getElementById('summaryBody');
  sm.innerHTML = '';
  const summaryRows = [
    { e:'Bottom Shell Plate', r:'Table 1.5.2', req:bp.t_net.toFixed(2)+' mm', prov:bp.t_sy.toFixed(1)+' mm',
      w: ((B - 2*R_B - keel_w) * L_eff * bt/1000 * 7.85).toFixed(0),
      st: bp.t_sy >= bp.t_net ? 'ok':'fail' },
    { e:'Keel Plate', r:'Table 1.5.1', req:'16 mm min', prov:t_keel+' mm',
      w: (keel_w * L_eff * t_keel/1000 * 7.85).toFixed(0),
      st: 'ok' },
    (function() {
      // Bilge plating — LR Table 1.5.2 location (3) requires bilge brackets
      // (or transverses) spaced ≤ (8·t² / (D·R_B))·√(t/R_B)·1e6 mm apart.
      // Compute the limit and check against actual bracket/trans frame spacing.
      let bbReqText = '≥ bottom t';
      let bbStatus  = (t_bilge >= bt ? 'ok' : 'fail');
      try {
        if (typeof bilgeBracketCheck === 'function') {
          const chk = bilgeBracketCheck(t_bilge);
          if (chk) {
            bbReqText = `≥ bottom t · brk-sp ≤ ${chk.limit_mm} mm (actual ${chk.actual_mm})`;
            if (!chk.ok) bbStatus = 'fail';
          }
        }
      } catch(_) {}
      return { e:'Bilge Plate', r:'Table 1.5.2(3)', req:bbReqText, prov:t_bilge+' mm',
        w: ((Math.PI/2) * R_B * L_eff * 2 * t_bilge/1000 * 7.85).toFixed(0),
        st: bbStatus };
    })(),
    { e:'Bottom Longitudinal', r:'Table 1.6.1(3)', req:bl.Z_req.toFixed(0)+' cm³', prov:Z_sec_b.toFixed(0)+' cm³',
      w: (2 * parseInt(document.getElementById('bottomLongCount').value) * L_eff * (L_PROFILES[profName]?.kg || 20) / 1000).toFixed(0),
      st: Z_sec_b >= bl.Z_req ? 'ok':'fail' },
    { e:'Inner Bottom Plate', r:'Sec 8.4.1-4', req:calcIBPlate().t_req.toFixed(2)+' mm', prov:t_ib.toFixed(1)+' mm',
      w: ((B - 2*R_B) * L_eff * t_ib/1000 * 7.85).toFixed(0),
      st: calcIBPlate().passFail ? 'ok':'fail' },
    { e:'Inner Bottom Long', r:'Sec 8.4.5', req:Z_ib.toFixed(0)+' cm³', prov:Z_sec_b.toFixed(0)+' cm³',
      w: (2 * parseInt(document.getElementById('ibLongCount').value) * L_eff * (L_PROFILES[profName]?.kg || 20) / 1000).toFixed(0),
      st: Z_sec_b >= Z_ib ? 'ok':'fail' },
    { e:'Side Shell Plate (6 strakes)', r:'Table 1.5.3', req:'14-14.5 mm', prov:'zoned',
      w: strakes.reduce((a,s)=>a+((s.z2-s.z1)/1000 * L_eff * 2 * s.t_sy/1000 * 7.85),0).toFixed(0),
      st: 'ok' },
    { e:'Side Longitudinals (5 groups)', r:'Table 1.6.1(1,2)', req:'215 cm³ max', prov:'per group',
      w: Object.values(groups).reduce((a,g)=>a+(2*g.count*L_eff*g.kg/1000),0).toFixed(0),
      st: Object.values(groups).every(g=>g.safety>=0)?'ok':'fail' },
    { e:'Inner Side Plate (tank+void+coaming)', r:'Table 1.9.1', req:'zoned', prov:'7.5-10 mm',
      w: is_data.strakes.reduce((a,s)=>a+((s.z2-s.z1)/1000 * L_eff * 2 * s.t/1000 * 7.85),0).toFixed(0),
      st: 'ok' },
    { e:'Inner Side Longitudinals', r:'Table 1.9.1', req:'per group', prov:'per group',
      w: Object.values(is_data.groups).reduce((a,g)=>a+(2*g.count*L_eff*g.kg/1000),0).toFixed(0),
      st: 'ok' },
    { e:'Upper Deck Plate', r:'Pt 4 Ch 1 Sec 7', req:'~12-14 mm', prov:t_deck+' mm',
      w: (B * L_eff * t_deck/1000 * 7.85).toFixed(0),
      st: 'ok' },
    { e:'Upper Deck Longitudinals', r:'Pt 4 Ch 1 Sec 7', req:'TBD', prov:w.deckProf,
      w: (2 * parseInt(document.getElementById('deckLongCount').value) * L_eff * weightPerM(getProfileData(w.deckProf)?.area || 0) / 1000).toFixed(0),
      st: 'ok' },
    { e:'Duct Keel Side Plate', r:'Sec 8.3.8', req:(((0.008*p.ibLevel + 2) * Math.sqrt(p.k))).toFixed(1)+' mm', prov:'12 mm',
      w:'~5', st:'ok' },
    { e:'Side Girder (×2/side)', r:'Sec 8.3.5', req:'~9 mm', prov:'11 mm',
      w:'~25', st:'ok' },
    { e:'Floor (non-WT)', r:'Sec 8.5.1', req:'~9 mm', prov:'11 mm',
      w:'varies', st:'ok' }
  ];
  
  summaryRows.forEach(r => {
    const tr = document.createElement('tr');
    if (r.st === 'fail') tr.classList.add('highlight');
    tr.innerHTML = `
      <td><strong>${r.e}</strong></td>
      <td>${r.r}</td>
      <td>${r.req}</td>
      <td class="cyan">${r.prov}</td>
      <td>${r.w}</td>
      <td class="${r.st}">${r.st === 'ok' ? '✓' : '✗'}</td>
    `;
    sm.appendChild(tr);
  });

  // ──────────────────────────────────────────────────────────────────
  // DETAILED SUMMARY (May 2026) — populate the 3 detailed tables on
  // page 4 (Hull Girder Section Properties + Plates/Strakes +
  // Longitudinal Stiffeners). Wrapped in try/catch and a setTimeout(0)
  // so the legacy table renders first and a slow detailed pass doesn't
  // block the click handler that switched to page 4.
  setTimeout(() => {
    try {
      if (typeof renderDetailedSummary === 'function') renderDetailedSummary();
    } catch (e) { console.warn('renderDetailedSummary call failed:', e); }
  }, 0);

  // ──────────────────────────────────────────────────────────────────
  // Refresh analysis panels so hull-girder σ and buckling UC reflect
  // current plate thicknesses / geometry. Only active in ANALYSIS mode.
  // DNV modu (68-dnv-ui.js): toplum DNV ise EPP/profil kontrol panelini yenile
  try { if (window.DNVUI && typeof window.DNVUI.refresh === 'function') window.DNVUI.refresh(); } catch (e) { console.warn('DNVUI.refresh failed:', e); }
  try {
    if (window.ANALYSIS_MODE) {
      if (typeof renderAnalysisStatusPanel === 'function')  renderAnalysisStatusPanel();
      if (typeof renderHullGirderStrengthPanel === 'function') renderHullGirderStrengthPanel(); if (typeof renderRuleMinInfoPanel === 'function') renderRuleMinInfoPanel();
      if (typeof renderBucklingStatusPanel === 'function')  renderBucklingStatusPanel();
      if (window.Bridge && window.Bridge.runRuleChecks)  window.Bridge.runRuleChecks();
      // Re-render currently-open element inspector, if any
      if (typeof SELECTED_STRAKE !== 'undefined' && SELECTED_STRAKE && window.showElemInspect) {
        const map = {
          shell: SELECTED_STRAKE.index === 0 ? 'plate-keel' : 'plate-bottom',
          innerBottom: 'plate-ib',
          innerSide: 'plate-is',
        };
        const kind = map[SELECTED_STRAKE.plate] || 'plate-bottom';
        const sDraw = window.Draw && window.Draw.STRAKES &&
                      window.Draw.STRAKES[SELECTED_STRAKE.plate] &&
                      window.Draw.STRAKES[SELECTED_STRAKE.plate][SELECTED_STRAKE.index];
        if (sDraw) {
          window.showElemInspect(kind, {
            strakeIdx: SELECTED_STRAKE.index,
            strakeId: sDraw?.id,
            strakeName: sDraw?.name,
            strakeSpacing: sDraw?.spacing_mm,
            strakeThickness: sDraw?.thickness,
            strakeWidth: sDraw?.width,
            strakeKind: sDraw?.kind,
          });
        }
      }
    }
  } catch(e) { console.warn('[recalcAll] analysis refresh error:', e); }

  // FSICR ice class display refresh (no-op when disabled)
  try { if (typeof refreshIceDisplay === 'function') refreshIceDisplay(); }
  catch(e) { console.warn('[recalcAll] FSICR refresh error:', e); }

  // CRITICAL: trigger Draw re-render so renderSectionProps() runs and the
  // Z_B / Z_D / I_NA panel reflects the latest PLATE_THICKNESS / STRAKES
  // changes. Without this, editing form thicknesses (sgT, dkT, strDeckT,
  // twnDeckT…) updates the underlying data and computeSectionProperties()
  // would return new values, but the displayed numbers stay stale because
  // the SVG (and the section-properties pane it owns) is never repainted.
  try {
    if (window.Draw && typeof window.Draw.render === 'function') {
      window.Draw.render();
    }
  } catch (e) { console.warn('[recalcAll] Draw.render error:', e); }

  // ALSO call renderSectionProps directly. Draw.render() short-circuits when
  // midshipSVG is not in the DOM (e.g. while user is on the Setup page).
  // But the section-props pane itself is just a <div> that's perfectly
  // happy to render with stale-or-fresh data — we want it FRESH so that
  // when the user navigates to Geometry, the panel already shows the right
  // numbers (no need to bounce Setup→Geometry→Setup→Geometry).
  // renderSectionProps() is a no-op when its target div is missing.
  try {
    if (typeof window.renderSectionProps === 'function') {
      window.renderSectionProps();
    }
  } catch (e) { console.warn('[recalcAll] renderSectionProps error:', e); }
}

// ==================== SAVE / LOAD ====================
function saveJSON() {
  // Prefer the full-state exporter (drawing + strakes + profiles +
  // side girders + compartments + transverse + brackets + all form inputs).
  // Falls back to the minimal form-only save if Draw hasn't initialised yet.
  let payload;
  try {
    if (typeof window.exportFullState === 'function') {
      payload = window.exportFullState(true);  // returnObj=true → no download
      // Enrich with project metadata so the saved file shows up with a
      // recognizable name and carries the user's revision/notes.
      payload.project = {
        vesselName:    document.getElementById('vesselName')?.value || '',
        variant:       document.getElementById('variant')?.value || '',
        revision:      document.getElementById('revision')?.value || '',
        analysisDate:  document.getElementById('analysisDate')?.value || '',
        classSociety:  document.getElementById('classificationSociety')?.value || '',
        preparedBy:    document.getElementById('preparedBy')?.value || '',
        notes:         document.getElementById('reportNotes')?.value || ''
      };
    }
  } catch (err) {
    console.warn('exportFullState failed, using minimal save:', err);
    payload = null;
  }
  if (!payload) {
    // Minimal fallback — legacy format, form inputs only.
    payload = {
      format: 'MidshipLegacy',
      version: '1.0',
      tool: 'Midship Scantling Viewer',
      project: {
        vesselName: document.getElementById('vesselName')?.value || '',
        variant: document.getElementById('variant')?.value || '',
        revision: document.getElementById('revision')?.value || '',
        analysisDate: document.getElementById('analysisDate')?.value || '',
        classSociety: document.getElementById('classificationSociety')?.value || '',
        preparedBy: document.getElementById('preparedBy')?.value || '',
        notes: document.getElementById('reportNotes')?.value || ''
      },
      params: (typeof getParams === 'function') ? getParams() : {},
      formValues: (() => {
        const fv = {};
        document.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
          if (!el.id || el.type === 'file' || el.type === 'button') return;
          fv[el.id] = (el.type === 'checkbox' || el.type === 'radio') ? !!el.checked : el.value;
        });
        return fv;
      })()
    };
  }
  const vessel   = (payload.project?.vesselName || 'Midship').replace(/\s+/g, '');
  const revision = payload.project?.revision || '0';
  const stamp    = new Date().toISOString().slice(0, 10);
  const filename = `${vessel}_Rev${revision}_${stamp}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Saving used to be completely silent: the file landed in the downloads
  // folder with nothing on screen to say it had worked, or under what name.
  if (typeof window.eaToast === 'function') {
    window.eaToast('Project saved', 'ok', filename);
  }
}

function loadJSON(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = function(ev) {
    try {
      const d = JSON.parse(ev.target.result);

      // Apply project metadata (vessel, revision, notes) if present — works
      // for every format we support.
      if (d.project) {
        const pmap = {
          vesselName: 'vesselName',
          variant: 'variant',
          revision: 'revision',
          analysisDate: 'analysisDate',
          classSociety: 'classificationSociety',
          preparedBy: 'preparedBy',
          notes: 'reportNotes'
        };
        Object.entries(pmap).forEach(([srcKey, elId]) => {
          const el = document.getElementById(elId);
          if (el && d.project[srcKey] !== undefined) el.value = d.project[srcKey];
        });
      }

      // NEW FORMAT — full snapshot (drawing state + strakes + profiles +
      // compartments + transverses + every form input). Delegate to the
      // dedicated restorer.
      if (d.format === 'MidshipFullState' || d.format === 'MidshipDraw') {
        const ok = (typeof window.importFullState === 'function') && window.importFullState(d);
        if (ok) {
          // Make sure we're on the geometry page so the user sees the restored drawing.
          if (typeof goToPage === 'function') goToPage(3);
          // alert() blocks the renderer; a toast says the same thing without
          // stopping the app dead until someone clicks OK.
          if (typeof window.eaToast === 'function') window.eaToast('Project loaded', 'ok', f.name);
          else alert('Project loaded (full state).');
          return;
        }
        // If importFullState failed for any reason, fall through to legacy path.
      }

      // LEGACY FORMAT — form values only. Two shapes are accepted:
      //   (a) old flat save — keys at top level (d.bottomT, d.keelT, ...)
      //   (b) new "MidshipLegacy" fallback with d.formValues map.
      if (d.formValues && typeof d.formValues === 'object') {
        // Same burst, same fix as importFullState: one recalc, not one per field.
        window.suspendRecalc();
        try {
          Object.entries(d.formValues).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') el.checked = !!val;
            else el.value = val;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          });
        } finally { window.resumeRecalc(); }
      } else {
        ['bottomT','keelT','bilgeT','keelWidth','bottomLongCount','bottomLongSpacing','bottomLongProfile','ibT','ibLongCount','deckT','deckLongCount','deckLongProfile','dbConfig','cgT','sgT','dkT','floorNonWtT','floorWtT','brkT','dkSpacing','ibLongSpacing','ibLocation','ibCeiling','ibGrab','ibSideTank','ibSideTankH','ibRho','strDeckLevel','strDeckT','strDeckSpacing','strDeckLongCount','strDeckFunction','strDeckType','strDeckProfile','twnDeckLevel','twnDeckT','twnDeckSpacing','twnDeckLongCount','twnDeckFunction','twnDeckType','twnDeckProfile','udLocation','udFraming','coamingT'].forEach(k => {
          const el = document.getElementById(k);
          if (el && d[k] !== undefined) el.value = d[k];
        });
      }
      if (typeof recalcAll === 'function') recalcAll();
      if (typeof window.eaToast === 'function') {
        window.eaToast('Project loaded — form values only, geometry regenerated from inputs', 'warn', f.name);
      } else {
        alert('Project loaded (form values only - geometry will be regenerated from inputs).');
      }
    } catch (err) { alert('Error: ' + err.message); }
  };
  r.readAsText(f);
  e.target.value = '';
}



// Status card on the Summary page. Single source: the rule-check counters
// the Bridge fills in (#cntOk / #cntFail). Until an analysis has run the
// card stays neutral instead of claiming PASS.
function refreshSummaryStatus() {
  const st = document.getElementById('sum_status');
  const card = document.getElementById('statusCard');
  if (!st || !card) return;
  const okN = parseInt((document.getElementById('cntOk') || {}).textContent);
  const fail = parseInt((document.getElementById('cntFail') || {}).textContent);
  const ran = isFinite(okN) || isFinite(fail);
  if (!ran) {
    st.textContent = '—';
    card.className = 'ea-summary-card';
    card.title = 'Run Analysis on the Geometry page to check the rules.';
  } else if (fail > 0) {
    st.textContent = 'CHECK';
    card.className = 'ea-summary-card fail';
    card.title = fail + ' element(s) below rule minimum — see the rule check table.';
  } else {
    st.textContent = 'PASS';
    card.className = 'ea-summary-card pass';
    card.title = okN + ' checks OK';
  }
}
window.refreshSummaryStatus = refreshSummaryStatus;
