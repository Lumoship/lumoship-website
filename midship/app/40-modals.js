/* ==========================================================================
   40-modals.js  —  Profile suggest / add stiffener / equal spacing modals
   Extracted verbatim from Index.html (lines 21123–21716 of the
   original single-file build). Load order is significant: see index.html.
   ========================================================================== */
// ==========================================================================
// PROFILE SUGGEST MODAL — integrates with window.Profile
// ==========================================================================
let _psmTargetSelectId = null;  // Which dropdown to update when user clicks "Apply"

function openProfileSuggest(targetSelectId, ctx) {
  // ctx: { label, Zreq, plateS, plateT, families (optional) }
  _psmTargetSelectId = targetSelectId;
  document.getElementById('psmContext').textContent = 
    `Target: ${ctx.label || targetSelectId} — Z_req = ${ctx.Zreq.toFixed(1)} cm³, plate ${ctx.plateS}×${ctx.plateT} mm`;
  document.getElementById('psmZreq').value = ctx.Zreq.toFixed(1);
  document.getElementById('psmPlateS').value = ctx.plateS;
  document.getElementById('psmPlateT').value = ctx.plateT;
  // Default families: L + HP (most common for shipbuilding longitudinals)
  document.getElementById('psmFamL').checked = true;
  document.getElementById('psmFamHP').checked = true;
  document.getElementById('psmFamFB').checked = false;
  document.getElementById('psmFamT').checked = false;
  document.getElementById('profileSuggestModal').style.display = 'flex';
  // Auto-run search
  runProfileSuggest();
}

function closeProfileSuggest() {
  document.getElementById('profileSuggestModal').style.display = 'none';
  _psmTargetSelectId = null;
}

// ==========================================================================
// ADD STIFFENER MODAL — manual coord + profile entry for "+ add" buttons
// ==========================================================================
let _asmGroupKey = null;      // current group being added to
let _asmMode = 'coord';       // 'coord' | 'spacing'

// Group metadata for hints & defaults (coord name, allowed range)
function _asmGroupMeta(grpKey) {
  const G = (window.Draw && window.Draw.GEOMETRY) || {};
  const PA = (window.Draw && window.Draw.PARAMS) || {};
  const dh = G.duct_half || 900;
  const bh = G.B_half || 11880;
  const rb = G.R_B || 1800;
  const is_y = G.IS || 10030;
  const hc = G.HC || 16350;
  const ud = G.UD || 15300;

  const meta = {
    bottomShell:   { coord:'y', label:'Bottom Shell stiffener', min: dh + 100, max: bh - rb - 50, defSp: 700 },
    innerBottom:   { coord:'y', label:'Inner Bottom stiffener', min: dh + 100, max: is_y - 50,    defSp: 700 },
    stringerStiff: { coord:'y', label:'Stringer Deck stiffener', min: is_y + 50, max: bh - 100,   defSp: 700 },
    tweenStiff:    { coord:'y', label:'Tween Deck stiffener',    min: is_y + 50, max: bh - 100,   defSp: 700 },
    coamingStiff:  { coord:'y', label:'Coaming Top stiffener',   min: is_y + 20, max: is_y + (PA.coamingTop||300) - 20, defSp: 150 },
    sideShell:     { coord:'z', label:'Side Shell stiffener',    min: rb + 50, max: ud - 150,     defSp: 705 },
    innerSide:     { coord:'z', label:'Inner Side stiffener',    min: (G.IB||1800) + 50, max: hc - 150, defSp: 705 },
    stringer:      { coord:'z', label:'Stringer plate (horizontal)', min: 2000, max: 12000,       defSp: 0    },
    tweenDeck:     { coord:'z', label:'Tween Deck plate',        min: 5000, max: 14000,           defSp: 0    },
    upperDeck:     { coord:'y', label:'Upper Deck stiffener',    min: is_y + 50, max: bh - 100,   defSp: 700 },
  };
  return meta[grpKey] || null;
}

window.openAddStiff = function(grpKey) {
  const D = window.Draw;
  if (!D || !D.profiles) return;
  const arr = D.profiles[grpKey];
  if (!Array.isArray(arr)) return;
  _asmGroupKey = grpKey;

  const meta = _asmGroupMeta(grpKey);
  if (!meta) return;

  // Reset mode to coord
  _asmMode = 'coord';
  document.getElementById('asmCoordBlock').style.display = '';
  document.getElementById('asmSpacingBlock').style.display = 'none';
  document.getElementById('asmModeCoord').style.background = 'var(--accent)';
  document.getElementById('asmModeCoord').style.color = '#fff';
  document.getElementById('asmModeSpacing').style.background = 'var(--bg-tertiary)';
  document.getElementById('asmModeSpacing').style.color = '';

  document.getElementById('asmTitle').textContent = `Add ${meta.label}`;
  document.getElementById('asmSubtitle').textContent = `Group: ${grpKey} · coordinate ${meta.coord.toUpperCase()} in mm`;
  document.getElementById('asmCoordLabel').textContent = `${meta.coord.toUpperCase()} coordinate`;

  // Default value — last stiffener's coord + default spacing, clamped to valid range
  const last = arr.length ? Math.max(...arr.map(p => p[meta.coord])) : meta.min;
  const defCoord = Math.min(last + (meta.defSp || 700), meta.max);
  document.getElementById('asmCoordInput').value = defCoord;
  document.getElementById('asmCoordHint').textContent =
    `Valid range: ${meta.min} to ${meta.max} mm · last ${meta.coord.toUpperCase()} = ${last} mm`;

  document.getElementById('asmSpacingInput').value = meta.defSp || 700;
  document.getElementById('asmSpacingHint').textContent =
    `New coord will be ${last} + spacing = from baseline`;

  // Populate profile dropdown from catalog
  const sel = document.getElementById('asmProfileSelect');
  sel.innerHTML = '<option value="">(group default)</option>';
  if (window.Profile && window.Profile.allProfiles) {
    try {
      const all = window.Profile.allProfiles(['L','HP','FB','T']);
      all.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    } catch (e) {}
  }
  sel.value = '';

  // Wire mode buttons
  document.getElementById('asmModeCoord').onclick = () => {
    _asmMode = 'coord';
    document.getElementById('asmCoordBlock').style.display = '';
    document.getElementById('asmSpacingBlock').style.display = 'none';
    document.getElementById('asmModeCoord').style.background = 'var(--accent)';
    document.getElementById('asmModeCoord').style.color = '#fff';
    document.getElementById('asmModeSpacing').style.background = 'var(--bg-tertiary)';
    document.getElementById('asmModeSpacing').style.color = '';
  };
  document.getElementById('asmModeSpacing').onclick = () => {
    _asmMode = 'spacing';
    document.getElementById('asmCoordBlock').style.display = 'none';
    document.getElementById('asmSpacingBlock').style.display = '';
    document.getElementById('asmModeSpacing').style.background = 'var(--accent)';
    document.getElementById('asmModeSpacing').style.color = '#fff';
    document.getElementById('asmModeCoord').style.background = 'var(--bg-tertiary)';
    document.getElementById('asmModeCoord').style.color = '';
  };

  document.getElementById('addStiffModal').style.display = 'flex';
  // Focus primary input
  setTimeout(() => document.getElementById('asmCoordInput').focus(), 50);

  // Keyboard shortcuts: Enter confirms, Esc cancels
  const kbd = (e) => {
    if (document.getElementById('addStiffModal').style.display !== 'flex') {
      window.removeEventListener('keydown', kbd);
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); window.confirmAddStiff(); }
    else if (e.key === 'Escape') { e.preventDefault(); window.closeAddStiff(); }
  };
  window.addEventListener('keydown', kbd);
};

window.closeAddStiff = function() {
  document.getElementById('addStiffModal').style.display = 'none';
  _asmGroupKey = null;
};

window.confirmAddStiff = function() {
  const D = window.Draw;
  if (!D || !D.profiles || !_asmGroupKey) { window.closeAddStiff(); return; }
  const grpKey = _asmGroupKey;
  const meta = _asmGroupMeta(grpKey);
  if (!meta) { window.closeAddStiff(); return; }
  const arr = D.profiles[grpKey];

  // Compute target coord from mode
  let coord;
  if (_asmMode === 'spacing') {
    const sp = parseFloat(document.getElementById('asmSpacingInput').value);
    if (isNaN(sp) || sp <= 0) {
      alert('Spacing must be a positive number (mm).'); return;
    }
    const last = arr.length ? Math.max(...arr.map(p => p[meta.coord])) : meta.min;
    coord = last + sp;
  } else {
    coord = parseFloat(document.getElementById('asmCoordInput').value);
    if (isNaN(coord)) { alert('Please enter a valid coordinate (mm).'); return; }
  }

  // Clamp and validate
  if (coord < meta.min || coord > meta.max) {
    const ok = confirm(`Coordinate ${coord} mm is outside the typical range (${meta.min} – ${meta.max} mm). Add anyway?`);
    if (!ok) return;
  }

  // Build the new stiffener
  const newItem = { [meta.coord]: Math.round(coord) };
  const profName = document.getElementById('asmProfileSelect').value;
  if (profName) newItem.profileName = profName;

  // Insert
  arr.push(newItem);

  // Linked partner insert (Side↔IS, Bottom↔IB)
  try {
    const EG = (typeof EDITOR_GROUPS !== 'undefined') ? EDITOR_GROUPS : null;
    const grp = EG ? EG.find(g => g.key === grpKey) : null;
    if (grp && grp.link && grp.linkWith && typeof getLink === 'function' && getLink(grp)) {
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const sideLinkThreshold = G.UD ? (G.UD - 600) : 14700;
      const isSideIS = (grp.link === 'linkSS_IS');
      const partnerAllowed = !isSideIS || (meta.coord === 'z' && coord < sideLinkThreshold);
      if (partnerAllowed) {
        D.profiles[grp.linkWith].push({ ...newItem });
      }
    }
  } catch(e) {}

  // Re-render
  if (typeof renderEditor === 'function') renderEditor();
  if (D.render) D.render();

  window.closeAddStiff();
};

// ==========================================================================
// EQUAL SPACING MODAL — distribute stiffeners evenly over a zone (auto-detected)
// ==========================================================================
let _esmGroupKey = null;
let _esmZone = null;   // { lo, hi, coord, label }

function _esmComputeCoords() {
  // Uses _esmZone (auto-detected per group) — no user start/end input.
  if (!_esmZone) return null;
  const { lo, hi } = _esmZone;
  const span = hi - lo;

  const countInput = document.getElementById('esmCount').value;
  const n = countInput !== '' ? parseInt(countInput) : NaN;
  if (isNaN(n) || n < 1) return null;

  const includeEndpoints = document.getElementById('esmIncludeEndpoints').checked;
  const coords = [];
  if (includeEndpoints) {
    if (n < 2) return { coords:[Math.round(lo + span/2)], actualSp:0, n:1 };
    const step = span / (n - 1);
    for (let i = 0; i < n; i++) coords.push(Math.round(lo + i*step));
  } else {
    const step = span / (n + 1);
    for (let i = 1; i <= n; i++) coords.push(Math.round(lo + i*step));
  }
  const actualSp = coords.length >= 2 ? coords[1] - coords[0] : 0;
  return { coords, actualSp, n };
}

function _esmUpdatePreview() {
  const out = document.getElementById('esmPreview');
  const info = _esmComputeCoords();
  if (!info) {
    out.innerHTML = '<span style="color:var(--text-muted)">Enter a valid count to preview</span>';
    return;
  }
  const { coords, actualSp, n } = info;
  const sampleList = coords.slice(0, 10).join(', ') + (coords.length > 10 ? ` … (+${coords.length-10} more)` : '');
  out.innerHTML = `
    <div><strong style="color:#7c3aed">${n}</strong> stiffeners · spacing <strong>${actualSp} mm</strong></div>
    <div style="margin-top:3px;font-size:0.62rem;color:var(--text-muted);line-height:1.4">${sampleList}</div>
  `;
}

// Determine the zone (min/max coord) automatically for a group.
// This uses the group's geometric constraints (duct, bilge, UD, etc.)
// so the user doesn't have to specify start/end.
function _esmDetectZone(grpKey) {
  const meta = _asmGroupMeta(grpKey);
  if (!meta) return null;
  return {
    lo: meta.min,
    hi: meta.max,
    coord: meta.coord,
    label: meta.label,
    defSp: meta.defSp || 700,
  };
}

window.openEqualSpacing = function(grpKey) {
  const D = window.Draw;
  if (!D || !D.profiles || !Array.isArray(D.profiles[grpKey])) return;
  _esmGroupKey = grpKey;
  const zone = _esmDetectZone(grpKey);
  if (!zone) return;
  _esmZone = zone;

  document.getElementById('esmTitle').textContent = `⚖ Equal Spacing — ${zone.label}`;
  document.getElementById('esmSubtitle').textContent = `Group: ${grpKey}`;

  // Zone info line
  const span = zone.hi - zone.lo;
  document.getElementById('esmZoneInfo').innerHTML =
    `Zone: <strong>${zone.coord.toUpperCase()} = ${zone.lo} → ${zone.hi} mm</strong> ` +
    `<span style="color:var(--text-muted)">(span = ${span} mm)</span>`;

  // Smart default count: span / typical spacing
  const defaultCount = Math.max(2, Math.round(span / zone.defSp) + 1);
  document.getElementById('esmCount').value = defaultCount;
  document.getElementById('esmIncludeEndpoints').checked = true;

  // Fill profile dropdown
  const sel = document.getElementById('esmProfileSelect');
  sel.innerHTML = '<option value="">(group default)</option>';
  if (window.Profile && window.Profile.allProfiles) {
    try {
      const all = window.Profile.allProfiles(['L','HP','FB','T']);
      all.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
    } catch (e) {}
  }
  sel.value = '';

  // Wire live preview
  ['esmCount','esmIncludeEndpoints'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.oninput = _esmUpdatePreview;
      el.onchange = _esmUpdatePreview;
    }
  });
  _esmUpdatePreview();

  document.getElementById('eqSpacingModal').style.display = 'flex';
  setTimeout(() => document.getElementById('esmCount').focus(), 50);

  // Keyboard: Enter = apply, Esc = cancel
  const kbd = (e) => {
    if (document.getElementById('eqSpacingModal').style.display !== 'flex') {
      window.removeEventListener('keydown', kbd);
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); window.confirmEqualSpacing(); }
    else if (e.key === 'Escape') { e.preventDefault(); window.closeEqualSpacing(); }
  };
  window.addEventListener('keydown', kbd);
};

window.closeEqualSpacing = function() {
  document.getElementById('eqSpacingModal').style.display = 'none';
  _esmGroupKey = null;
  _esmZone = null;
};

window.confirmEqualSpacing = function() {
  const D = window.Draw;
  if (!D || !D.profiles || !_esmGroupKey || !_esmZone) { window.closeEqualSpacing(); return; }
  const grpKey = _esmGroupKey;

  const info = _esmComputeCoords();
  if (!info || !info.coords.length) {
    alert('Please enter a valid number of stiffeners.');
    return;
  }

  const coord = _esmZone.coord;
  const profName = document.getElementById('esmProfileSelect').value;
  const items = info.coords.map(c => {
    const item = { [coord]: c };
    if (profName) item.profileName = profName;
    return item;
  });

  // Replace existing group contents
  const before = D.profiles[grpKey].length;
  D.profiles[grpKey].length = 0;
  items.forEach(it => D.profiles[grpKey].push(it));
  if ((grpKey === 'stringer' || grpKey === 'tweenDeck') && D.syncLevelParams) D.syncLevelParams();

  // Mirror to linked partner where allowed
  try {
    const EG = (typeof EDITOR_GROUPS !== 'undefined') ? EDITOR_GROUPS : null;
    const grp = EG ? EG.find(g => g.key === grpKey) : null;
    if (grp && grp.link && grp.linkWith && typeof getLink === 'function' && getLink(grp)) {
      const G = (window.Draw && window.Draw.GEOMETRY) || {};
      const sideLinkThreshold = G.UD ? (G.UD - 600) : 14700;
      const isSideIS = (grp.link === 'linkSS_IS');
      if (!isSideIS) {
        D.profiles[grp.linkWith].length = 0;
        items.forEach(it => D.profiles[grp.linkWith].push({ ...it }));
      } else if (coord === 'z') {
        D.profiles[grp.linkWith].length = 0;
        items.filter(it => it.z < sideLinkThreshold)
             .forEach(it => D.profiles[grp.linkWith].push({ ...it }));
      }
    }
  } catch(e) {}

  console.log(`[equalSpacing] ${grpKey}: replaced ${before} → ${items.length} stiffeners`);

  if (typeof renderEditor === 'function') renderEditor();
  if (D.render) D.render();

  window.closeEqualSpacing();
};

function runProfileSuggest() {
  if (!window.Profile) return;
  const Zreq = parseFloat(document.getElementById('psmZreq').value);
  const pw = parseFloat(document.getElementById('psmPlateS').value);
  const pt = parseFloat(document.getElementById('psmPlateT').value);
  const families = [];
  if (document.getElementById('psmFamL').checked) families.push('L');
  if (document.getElementById('psmFamHP').checked) families.push('HP');
  if (document.getElementById('psmFamFB').checked) families.push('FB');
  if (document.getElementById('psmFamT').checked) families.push('T');
  
  if (isNaN(Zreq) || isNaN(pw) || isNaN(pt) || families.length === 0) {
    document.getElementById('psmEmpty').style.display = 'block';
    document.getElementById('psmEmpty').textContent = 'Enter valid Z_req, plate dimensions, and select at least one family.';
    document.getElementById('psmResultsBody').innerHTML = '';
    return;
  }
  
  const fits = window.Profile.findBestFit(Zreq, {
    families, plateWidth_mm: pw, plateThickness_mm: pt, maxResults: 20
  });
  
  const tbody = document.getElementById('psmResultsBody');
  tbody.innerHTML = '';
  if (fits.length === 0) {
    document.getElementById('psmEmpty').style.display = 'block';
    document.getElementById('psmEmpty').textContent = 
      `No profile in the selected families satisfies Z ≥ ${Zreq.toFixed(1)} cm³ with plate ${pw}×${pt}. Try enabling more families or increase plate thickness.`;
    return;
  }
  document.getElementById('psmEmpty').style.display = 'none';
  
  fits.forEach((f, i) => {
    const margin = ((f.Z_cm3 / Zreq - 1) * 100);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${i+1}</td>
      <td style="font-family:var(--font-mono);font-weight:600">${f.name}</td>
      <td>${f.type}</td>
      <td style="color:${f.Z_cm3 >= Zreq*1.15 ? 'var(--success)' : 'var(--warning)'}">${f.Z_cm3.toFixed(1)} <span style="font-size:0.7rem;color:var(--text-muted)">(+${margin.toFixed(0)}%)</span></td>
      <td>${f.I_cm4.toFixed(0)}</td>
      <td>${f.A_cm2.toFixed(1)}</td>
      <td style="color:${i===0 ? 'var(--success)' : 'var(--text-primary)'}">${f.weight_kgm.toFixed(1)}${i===0 ? ' ★' : ''}</td>
      <td><button onclick="applyProfileFromSuggest('${f.name}')" style="padding:3px 8px;background:var(--accent);color:white;border:none;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.7rem;cursor:pointer">Apply →</button></td>
    `;
    tbody.appendChild(tr);
  });
}

function applyProfileFromSuggest(profileName) {
  if (!_psmTargetSelectId) { closeProfileSuggest(); return; }
  const sel = document.getElementById(_psmTargetSelectId);
  if (!sel) { closeProfileSuggest(); return; }
  
  // If the dropdown doesn't have this profile in its options, add it
  let found = false;
  for (let i = 0; i < sel.options.length; i++) {
    if (sel.options[i].value === profileName) { found = true; break; }
  }
  if (!found) {
    const opt = document.createElement('option');
    opt.value = profileName; opt.textContent = profileName;
    sel.appendChild(opt);
  }
  sel.value = profileName;
  sel.dispatchEvent(new Event('change'));  // trigger scantling recalc
  closeProfileSuggest();
}

// Helper to inject "🔍" button next to a <select> profile dropdown.
// ctxFn returns { label, Zreq, plateS, plateT } at click time (dynamic values).
function addSuggestButton(selectId, ctxFn) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  if (sel.nextElementSibling && sel.nextElementSibling.classList && sel.nextElementSibling.classList.contains('psm-btn')) return;  // already added
  
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'psm-btn';
  btn.innerHTML = '🔍';
  btn.title = 'Suggest best-fit profile for required Z';
  btn.style.cssText = 'margin-left:4px;padding:3px 8px;background:var(--bg-tertiary);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--accent);font-family:var(--font-mono);font-size:0.85rem;cursor:pointer;vertical-align:middle';
  btn.onmouseover = () => { btn.style.background = 'var(--accent)'; btn.style.color = 'white'; };
  btn.onmouseout  = () => { btn.style.background = 'var(--bg-tertiary)'; btn.style.color = 'var(--accent)'; };
  btn.onclick = () => {
    const ctx = ctxFn();
    if (!ctx || isNaN(ctx.Zreq) || ctx.Zreq <= 0) {
      alert('Required Z is not available yet. Please make sure scantling is calculated (visit Scantling page first).');
      return;
    }
    openProfileSuggest(selectId, ctx);
  };
  sel.parentNode.insertBefore(btn, sel.nextSibling);
}

// Wire up suggest buttons for all profile dropdowns after recalcAll runs
function wireSuggestButtons() {
  // Helper: use realLongSpacing if available, fall back to form input.
  const realS = (group, inputId, fallback, supports) => {
    if (typeof realLongSpacing !== 'function') {
      return parseFloat(document.getElementById(inputId).value);
    }
    return realLongSpacing(group, {
      coord: (group === 'sideShell' || group === 'innerSide') ? 'z' : 'y',
      inputId, defaultFallback: fallback,
      extraSupports: supports && (typeof getPlateSupports === 'function')
                     ? getPlateSupports(group) : []
    });
  };
  // Bottom long
  addSuggestButton('bottomLongProfile', () => {
    const bl = (typeof calcBottomLongCore === 'function') ? calcBottomLongCore() : null;
    const t = parseFloat(document.getElementById('bottomT').value);
    const s = realS('bottomShell', 'bottomLongSpacing', 700, true);
    return { label:'Bottom Long', Zreq: bl ? bl.Z_req : 0, plateS: s, plateT: t };
  });
  // Inner Bottom long (independent from bottom now)
  addSuggestButton('ibLongProfile', () => {
    let Zreq = 0;
    try {
      const bl = calcBottomLongCore();
      const ibL = calcIBLong(bl.Z_req);
      Zreq = ibL.Z_req;
    } catch(e) {
      Zreq = parseFloat(document.getElementById('ibZreq').value) || 0;
    }
    const t = parseFloat(document.getElementById('ibT').value);
    const s = realS('innerBottom', 'ibLongSpacing', 700, true);
    return { label:'Inner Bottom Long', Zreq, plateS: s, plateT: t };
  });
  // Upper deck long
  addSuggestButton('deckLongProfile', () => {
    const udL = (typeof calcUpperDeckLong === 'function') ? calcUpperDeckLong() : null;
    const t = parseFloat(document.getElementById('deckT').value);
    const s = realS('upperDeck', 'deckLongSpacing', 700, true);
    return { label:'Upper Deck Long', Zreq: udL ? udL.Z_req : 0, plateS: s, plateT: t };
  });
  // Stringer deck long
  addSuggestButton('strDeckProfile', () => {
    const L = (typeof calcLowerDeckLong === 'function') ? calcLowerDeckLong('str') : null;
    const t = parseFloat(document.getElementById('strDeckT').value);
    const s = realS('stringerStiff', 'strDeckSpacing', 700, false);
    return { label:'Stringer Long', Zreq: L ? L.Z_req : 0, plateS: s, plateT: t };
  });
  // Tween deck long
  addSuggestButton('twnDeckProfile', () => {
    const L = (typeof calcLowerDeckLong === 'function') ? calcLowerDeckLong('twn') : null;
    const t = parseFloat(document.getElementById('twnDeckT').value);
    const s = realS('tweenStiff', 'twnDeckSpacing', 700, false);
    return { label:'Tween Long', Zreq: L ? L.Z_req : 0, plateS: s, plateT: t };
  });
  // Side groups G1..G5
  if (typeof calcSideGroupsBase === 'function') {
    try {
      const sg = calcSideGroupsBase();
      Object.keys(sg).forEach(k => {
        const id = 'sideGroupProfile_' + k;
        addSuggestButton(id, () => {
          const sgNow = calcSideGroupsBase();
          const g = sgNow[k];
          if (!g) return null;
          return { label: `Side ${k}`, Zreq: g.Z_max, plateS: g.s_max, plateT: g.t_plate };
        });
      });
    } catch(e) {}
  }
  // Inner Side groups IS-G1..G4
  if (typeof calcInnerSideGroupsBase === 'function') {
    try {
      const isg = calcInnerSideGroupsBase();
      Object.keys(isg).forEach(k => {
        const id = 'innerSideGroupProfile_' + k;
        addSuggestButton(id, () => {
          const isgNow = calcInnerSideGroupsBase();
          const g = isgNow[k];
          if (!g) return null;
          return { label: `Inner Side ${k}`, Zreq: g.Z_max, plateS: g.s_is, plateT: 10 };
        });
      });
    } catch(e) {}
  }
}

// Handle clicks outside modal to close
document.addEventListener('click', (e) => {
  const modal = document.getElementById('profileSuggestModal');
  if (modal && e.target === modal) closeProfileSuggest();
  // Hide context menu if click is outside it
  const ctx = document.getElementById('drawContextMenu');
  if (ctx && ctx.style.display !== 'none' && !ctx.contains(e.target)) {
    ctx.style.display = 'none';
  }
});
// Hide context menu on Escape or scroll
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const ctx = document.getElementById('drawContextMenu');
    if (ctx) ctx.style.display = 'none';
  }
});
window.addEventListener('scroll', () => {
  const ctx = document.getElementById('drawContextMenu');
  if (ctx) ctx.style.display = 'none';
}, true);

