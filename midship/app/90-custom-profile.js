/* ==========================================================================
   90-custom-profile.js  —  Custom profile modal + initial recalc
   Extracted verbatim from Index.html (lines 32833–33234 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// =============================================================================
// CUSTOM PROFILE MODAL
// =============================================================================
// State while modal is open: which type tab is active, and which stiff to
// apply the resulting profile to.
let _cpmType = 'L';          // 'L' | 'T' | 'FB' | 'HP'
let _cpmTarget = null;       // { group, index }
let _cpmResult = null;       // last computed { name, dims, Z_cm3, A_cm2, I_cm4, weight }

// Populate HP catalog dropdown once (mirrors window.HP_CATALOG or the module's
// own catalog). We also use the catalog to auto-fill manual fields when user
// picks a named entry — they can then tweak freely.
function _cpmPopulateHPCatalog() {
  const sel = document.getElementById('cpm-HP-catalog');
  if (!sel || sel.options.length > 1) return;   // already populated
  const cat = (typeof HP_CATALOG !== 'undefined' && Array.isArray(HP_CATALOG)) ? HP_CATALOG : [];
  cat.forEach(hp => {
    const opt = document.createElement('option');
    opt.value = hp.name;
    opt.textContent = hp.name;
    sel.appendChild(opt);
  });
}

function cpmSelectHPFromCatalog() {
  const sel = document.getElementById('cpm-HP-catalog');
  const name = sel.value;
  if (!name) return;
  const hp = (typeof HP_CATALOG !== 'undefined' ? HP_CATALOG : []).find(x => x.name === name);
  if (!hp) return;
  // Fill the manual fields with catalog values (user can still edit them)
  document.getElementById('cpm-HP-b').value = hp.b;
  document.getElementById('cpm-HP-t').value = hp.t;
  document.getElementById('cpm-HP-c').value = hp.c;
  document.getElementById('cpm-HP-r').value = hp.r;
  cpmUpdate();
}

function cpmSelectTab(type) {
  _cpmType = type;
  document.querySelectorAll('.cpm-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.type === type);
  });
  document.querySelectorAll('.cpm-section').forEach(s => s.style.display = 'none');
  const sec = document.getElementById(`cpm-${type}-section`);
  if (sec) sec.style.display = 'block';
  cpmUpdate();
}

function cpmToggleLEqual() {
  const equal = document.getElementById('cpm-L-equal').checked;
  const bInp = document.getElementById('cpm-L-b');
  bInp.disabled = equal;
  bInp.style.opacity = equal ? '0.55' : '1';
  if (equal) {
    bInp.value = document.getElementById('cpm-L-a').value;
  }
  cpmUpdate();
}

// Sync b = a when equal-legs is checked
function _cpmSyncL() {
  const equal = document.getElementById('cpm-L-equal').checked;
  if (equal) {
    document.getElementById('cpm-L-b').value = document.getElementById('cpm-L-a').value;
  }
}

// Build the profile-data object (same shape _calcL/_calcHP/_calcFB/_calcT produce),
// then run computeCombinedSection with current spacing + attached plate.
// Returns { name, type, dims, Z_cm3, A_cm2, I_cm4, weight } or null on invalid.
function _cpmBuildProfileData(type) {
  if (!window.Profile || !window.Profile.computeCombinedSection) return null;

  const num = id => parseFloat(document.getElementById(id).value) || 0;
  let pd = null, name = '', dims = null;

  if (type === 'L') {
    _cpmSyncL();
    const a = num('cpm-L-a'), b = num('cpm-L-b'), t = num('cpm-L-t');
    if (a <= 0 || b <= 0 || t <= 0) return null;
    // Mirror _calcL logic: centroid = t/2 (from plate side), height = a, width = b
    const A = ((a + b) - t) * t / 100;   // cm²  (L-shape, no overlap at corner)
    const h_cm = a / 10;
    const b_cm = b / 10;
    const t_cm = t / 10;
    // Centroid from plate side (flange is at bottom along plate):
    // For an L with web of height `a` and flange of width `b`, thickness t:
    //   Area_web = (a - t) * t    (just the web excluding corner)
    //   Area_flange = b * t
    //   Web centroid from flange base: (a - t)/2 + t/2 = a/2
    //   Flange centroid from flange base: t/2
    // Combined centroid (from flange bottom = plate top):
    const A_web = ((a - t) * t) / 100;
    const A_fl  = (b * t) / 100;
    const cY_web = (a/2) / 10;  // cm
    const cY_fl  = (t/2) / 10;  // cm
    const centroidY = (A_web*cY_web + A_fl*cY_fl) / (A_web + A_fl);  // cm (from plate side)
    // Ixx about own centroid: parallel-axis
    const Iweb_self = t_cm * Math.pow((a-t)/10, 3) / 12;
    const Iflg_self = b_cm * Math.pow(t_cm, 3) / 12;
    const Ixx = Iweb_self + A_web*Math.pow(cY_web - centroidY, 2)
              + Iflg_self + A_fl *Math.pow(cY_fl  - centroidY, 2);
    const Iyy_approx = (t_cm * Math.pow(b_cm, 3) / 12);  // rough
    const xOff = (b_cm - t_cm) / 2 * 0.4;
    pd = {
      type:'L', name:`L ${a}x${b}x${t}`,
      area: A_web + A_fl,
      centroidX: b_cm/2, centroidY,
      Ixx, Iyy: Iyy_approx,
      height: h_cm, maxWidth: b_cm,
      xOffsetFromWebCenter: xOff,
      dimensions:{a, b, t}
    };
    name = pd.name;
    dims = {a, b, t};
  }
  else if (type === 'T') {
    const h = num('cpm-T-h'), tw = num('cpm-T-tw'), bf = num('cpm-T-bf'), tf = num('cpm-T-tf');
    if (h <= 0 || tw <= 0 || bf <= 0 || tf <= 0) return null;
    const A_web = (h - tf) * tw / 100;
    const A_fl  = bf * tf / 100;
    const h_cm = h/10, tw_cm = tw/10, bf_cm = bf/10, tf_cm = tf/10;
    // Flange is AT TOP (free end), web connects to plate at bottom:
    //   Web centroid from plate: (h-tf)/2  measured from plate side
    //   Flange centroid from plate: h - tf/2
    const cY_web = (h - tf)/2 / 10;
    const cY_fl  = (h - tf/2) / 10;
    const centroidY = (A_web*cY_web + A_fl*cY_fl) / (A_web + A_fl);
    const Iweb_self = tw_cm * Math.pow((h-tf)/10, 3) / 12;
    const Iflg_self = bf_cm * Math.pow(tf_cm, 3) / 12;
    const Ixx = Iweb_self + A_web*Math.pow(cY_web - centroidY, 2)
              + Iflg_self + A_fl *Math.pow(cY_fl  - centroidY, 2);
    pd = {
      type:'T', name:`T ${h}x${bf}x${tw}x${tf}`,
      area: A_web + A_fl, centroidX:0, centroidY,
      Ixx, Iyy: (tf_cm * Math.pow(bf_cm, 3)/12),
      height: h_cm, maxWidth: bf_cm,
      xOffsetFromWebCenter:0,
      dimensions:{a:h, b:bf, tw, tf}
    };
    name = pd.name;
    dims = {h, tw, bf, tf};
  }
  else if (type === 'FB') {
    const h = num('cpm-FB-h'), t = num('cpm-FB-t');
    if (h <= 0 || t <= 0) return null;
    const h_cm = h/10, t_cm = t/10;
    const A = h_cm * t_cm;
    // Uniform rectangle: centroid at h/2 from plate side
    const Ixx = t_cm * Math.pow(h_cm, 3) / 12;
    pd = {
      type:'FB', name:`FB ${h}x${t}`,
      area: A, centroidX:0, centroidY: h_cm/2,
      Ixx, Iyy:(h_cm * Math.pow(t_cm,3)/12),
      height: h_cm, maxWidth: t_cm,
      xOffsetFromWebCenter:0,
      dimensions:{h, t}
    };
    name = pd.name;
    dims = {h, t};
  }
  else if (type === 'HP') {
    const b = num('cpm-HP-b'), t = num('cpm-HP-t'), c = num('cpm-HP-c'), rr = num('cpm-HP-r');
    if (b <= 0 || t <= 0) return null;
    // Mirror _calcHP: look up catalog for A, dx, Ixx if possible, else estimate.
    const cat = (typeof HP_CATALOG !== 'undefined' ? HP_CATALOG : [])
                  .find(x => x.b===b && x.t===t);
    let A_cm2, dx, Ixx;
    if (cat) {
      A_cm2 = cat.A; dx = cat.dx; Ixx = cat.Ixx;
    } else {
      // Estimation: bulb area ≈ c × t (simplified); web area = b × t
      const webArea = b * t / 100;
      const bulbArea = c * t / 100;
      A_cm2 = webArea + bulbArea;
      // Centroid: web centroid at b/2 (from plate), bulb centroid near top at b - c/2
      const cY_web = (b/2) / 10;
      const cY_bulb = ((b) - c/4) / 10;
      dx = (webArea*cY_web + bulbArea*cY_bulb) / A_cm2;
      const Iweb_self = (t/10) * Math.pow(b/10, 3) / 12;
      const Ibulb_self = (c/10) * Math.pow((t/10), 3) / 12; // small
      Ixx = Iweb_self + webArea*Math.pow(cY_web - dx, 2)
          + Ibulb_self + bulbArea*Math.pow(cY_bulb - dx, 2);
    }
    const cCm = c/10, bCm = b/10, tCm = t/10;
    const Iyy = (A_cm2 * cCm * cCm) / 12;
    pd = {
      type:'HP', name:`HP ${b}x${t}`,
      area: A_cm2,
      centroidX: cCm/2, centroidY: dx,
      Ixx, Iyy,
      height: bCm, maxWidth: cCm,
      xOffsetFromWebCenter: (cCm - tCm)/2 * 0.4,
      dimensions:{b, t, c, r: rr}
    };
    name = pd.name;
    dims = {b, t, c, r: rr};
  }

  if (!pd) return null;
  return { pd, name, type, dims };
}

// Compute Z_cm3 with the attached plate of the currently-selected stiff's
// spacing and plate thickness.
function _cpmComputeWithPlate(pd) {
  if (!pd || !window.Profile || !window.Profile.computeCombinedSection) return null;
  const sel = _cpmTarget || window.SELECTED_STIFF;
  if (!sel) return null;
  const D = window.Draw;
  const stiff = D && D.profiles && D.profiles[sel.group] && D.profiles[sel.group][sel.index];
  // Resolve plate s + t consistently with the rest of the tool via the
  // shared helper. Falls back to PLATE_THICKNESS / spacing inputs if the
  // helper isn't available.
  let s_mm = 700, t_mm = 12;
  if (stiff && typeof _attachedPlateFor === 'function') {
    const { pw_mm, pt_mm } = _attachedPlateFor(sel.group, stiff);
    if (pw_mm > 0) s_mm = pw_mm;
    if (pt_mm > 0) t_mm = pt_mm;
  } else {
    // legacy fallback path
    const g = sel.group;
    const PT = D && D.PLATE_THICKNESS;
    if (PT) {
      if (g === 'bottomShell')  t_mm = PT.shell || 13;
      else if (g === 'innerBottom') t_mm = PT.ib || 16;
      else if (g === 'sideShell')   t_mm = PT.shell || 14;
      else if (g === 'innerSide')   t_mm = PT.is || 11;
      else if (g === 'upperDeck')   t_mm = PT.upperDeck || 15;
      else if (g === 'stringerStiff') t_mm = PT.stringer || 11;
      else if (g === 'tweenStiff')    t_mm = PT.tween || 11;
      else if (g === 'coamingStiff')  t_mm = PT.coaming || 20;
    }
    const spacingIds = {
      bottomShell:'bottomLongSpacing', innerBottom:'ibLongSpacing',
      upperDeck:'deckLongSpacing',
      stringerStiff:'strDeckSpacing', tweenStiff:'twnDeckSpacing',
    };
    const spId = spacingIds[g];
    if (spId) {
      const spVal = parseFloat(document.getElementById(spId)?.value || 700);
      if (spVal > 0) s_mm = spVal;
    }
  }
  // run combined section (for the preview Z_cm3 — this includes the plate)
  try {
    const r = window.Profile.computeCombinedSection(pd, true, s_mm, t_mm, 90);
    const Z_min = Math.min(r.WxxBot, r.WxxTop);
    // CRITICAL: report PROFILE-ONLY properties for A_cm2/I_cm4. These are
    // the values that get written into stiff.customProfile and consumed by
    // computeSectionProperties() — which already accounts for the attached
    // plate separately (the plate is one of the strakes in STRAKES). If we
    // returned r.totalArea / r.combinedIxx (which include the plate's
    // contribution), the section calc would double-count the plate area
    // and shift the neutral axis incorrectly. Z_cm3 is still the combined
    // value because that's what the rule check compares to Z_req.
    return {
      Z_cm3: Z_min,                  // combined Z (with plate) — for rule check
      Z_top_cm3: r.WxxTop,
      Z_bot_cm3: r.WxxBot,
      A_cm2: pd.area,                // PROFILE only (cm²)
      I_cm4: pd.Ixx,                 // PROFILE own Ixx (cm⁴) — about its own centroid
      A_cm2_combined: r.totalArea,   // exposed for UI preview only
      I_cm4_combined: r.combinedIxx, // exposed for UI preview only
      weight: r.weight,
      s_mm, t_mm
    };
  } catch(e) {
    console.warn('[cpm] computeCombinedSection failed', e);
    return null;
  }
}

// Live update of outputs when user types
function cpmUpdate() {
  const built = _cpmBuildProfileData(_cpmType);
  const outN = document.getElementById('cpmOutName');
  const outZ = document.getElementById('cpmOutZ');
  const outA = document.getElementById('cpmOutA');
  const outW = document.getElementById('cpmOutW');
  const outI = document.getElementById('cpmOutInfo');
  if (!built) {
    outN.textContent = outZ.textContent = outA.textContent = outW.textContent = '—';
    outI.textContent = 'Enter valid dimensions';
    _cpmResult = null;
    return;
  }
  const comp = _cpmComputeWithPlate(built.pd);
  if (!comp) {
    outN.textContent = built.name;
    outZ.textContent = outA.textContent = outW.textContent = '—';
    outI.textContent = 'Could not compute with plate (select a stiff first)';
    _cpmResult = null;
    return;
  }
  outN.textContent = built.name;
  outZ.textContent = comp.Z_cm3.toFixed(1);
  outA.textContent = (comp.A_cm2_combined != null ? comp.A_cm2_combined : comp.A_cm2).toFixed(2);
  outW.textContent = comp.weight.toFixed(2);
  const I_show = (comp.I_cm4_combined != null ? comp.I_cm4_combined : comp.I_cm4);
  outI.textContent = `with attached plate s=${comp.s_mm} mm, t=${comp.t_mm} mm · I_xx = ${I_show.toFixed(0)} cm⁴`;
  _cpmResult = {
    name: built.name,
    type: built.type,
    dims: built.dims,
    Z_cm3: comp.Z_cm3,
    A_cm2: comp.A_cm2,
    I_cm4: comp.I_cm4,
    weight: comp.weight
  };
}

function openCustomProfileModal() {
  const sel = window.SELECTED_STIFF;
  if (!sel || !sel.group || sel.index == null) {
    alert('Click a stiffener in the drawing first, then press "Custom Profile" to enter its dimensions.');
    return;
  }
  _cpmTarget = { group: sel.group, index: sel.index };
  const sub = document.getElementById('cpmSubtitle');
  if (sub) sub.textContent = `Target: ${sel.group} #${sel.index + 1}`;
  _cpmPopulateHPCatalog();
  // Preload HP catalog dropdown if current profile is an HP
  const D = window.Draw;
  const stiff = D && D.profiles && D.profiles[sel.group] && D.profiles[sel.group][sel.index];
  const currentName = stiff && stiff.profileName;
  if (currentName && /^HP /.test(currentName)) {
    cpmSelectTab('HP');
    const hpSel = document.getElementById('cpm-HP-catalog');
    if (hpSel) hpSel.value = currentName;
    cpmSelectHPFromCatalog();
  } else if (currentName && /^L /.test(currentName)) {
    cpmSelectTab('L');
    // Try parsing "L 250x90x12"
    const m = currentName.match(/^L\s+(\d+)x(\d+)x(\d+)/);
    if (m) {
      document.getElementById('cpm-L-a').value = m[1];
      document.getElementById('cpm-L-b').value = m[2];
      document.getElementById('cpm-L-t').value = m[3];
      document.getElementById('cpm-L-equal').checked = (m[1] === m[2]);
      cpmToggleLEqual();
    }
  } else if (currentName && /^FB /.test(currentName)) {
    cpmSelectTab('FB');
    const m = currentName.match(/^FB\s+(\d+)x(\d+)/);
    if (m) {
      document.getElementById('cpm-FB-h').value = m[1];
      document.getElementById('cpm-FB-t').value = m[2];
    }
  } else if (currentName && /^T /.test(currentName)) {
    cpmSelectTab('T');
  } else {
    cpmSelectTab('L');
  }
  document.getElementById('customProfileModal').style.display = 'flex';
  cpmUpdate();
}
window.openCustomProfileModal = openCustomProfileModal;

function closeCustomProfileModal() {
  document.getElementById('customProfileModal').style.display = 'none';
  _cpmTarget = null;
  _cpmResult = null;
}
window.closeCustomProfileModal = closeCustomProfileModal;

// Apply computed profile → assigns name + custom dimensions on the stiff.
// _resolveStiffProfile + computeSectionProperties will now find this via the
// per-stiff `customDims` field (preferred) and/or the name (if matches catalog).
function applyCustomProfile() {
  if (!_cpmResult || !_cpmTarget) {
    alert('Enter valid dimensions first.');
    return;
  }
  const D = window.Draw;
  if (!D || !D.profiles || !D.profiles[_cpmTarget.group]) return;
  const stiff = D.profiles[_cpmTarget.group][_cpmTarget.index];
  if (!stiff) return;
  stiff.profileName = _cpmResult.name;
  // Save the full dimensions (and type) so the resolver can recompute
  // section properties for a non-catalog custom profile.
  stiff.customProfile = {
    type: _cpmResult.type,
    dims: _cpmResult.dims,
    Z_cm3: _cpmResult.Z_cm3,
    A_cm2: _cpmResult.A_cm2,
    I_cm4: _cpmResult.I_cm4,
    weight: _cpmResult.weight,
  };
  // Clear property cache so computeSectionProperties picks up the new value
  if (typeof window._clearPropsCache === 'function') window._clearPropsCache();
  closeCustomProfileModal();
  // Re-run the analysis pipeline
  if (window.Draw && window.Draw.render) window.Draw.render();
  if (typeof forceRefreshAnalysis === 'function') forceRefreshAnalysis();
  else if (typeof recalcAll === 'function') recalcAll();
}
window.applyCustomProfile = applyCustomProfile;

// ==================== INIT ====================
recalcAll();
