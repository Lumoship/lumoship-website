// =========================================================================
//  95-project.js  —  Project lifecycle: New / Save / Restore / Example
//
//  Everything this app boots with today is the "Wagenborg Baltic Laker GC"
//  project, written as literals in 10-draw.js (GEOMETRY, PARAMS,
//  SIDE_GIRDERS, COMPARTMENTS, PLATE_THICKNESS, WT_FLAGS) and as value=""
//  attributes in index.html (142 form inputs). That made the tool a viewer
//  for one ship rather than a tool for any ship.
//
//  This module does NOT touch those literals — the calculation engine is
//  left exactly as it was. It layers a project concept on top and drives
//  the engine through window.importFullState(), the same path the existing
//  Load button has always used.
//
//    boot          → restore autosaved project, else the code defaults
//    New Project   → wizard collects principal particulars → generated state
//    Example       → drop the autosave and reload = the original defaults
//
//  Load order: last real module (before 99-info-overlay). Needs window.Draw,
//  window.importFullState and recalcAll to already exist.
// =========================================================================

(function () {
  'use strict';

  var LS_KEY = 'midship_project_v1';

  // ── Fields the wizard writes ─────────────────────────────────────────
  // id → function(spec) returning the value to set.
  var WIZARD_DRIVEN = {
    vesselName:            function (s) { return s.vesselName; },
    shipType:              function (s) { return s.shipType; },
    classificationSociety: function (s) { return s.classSociety; },
    preparedBy:            function (s) { return s.preparedBy; },
    analysisDate:          function ()  { return new Date().toISOString().slice(0, 10); },
    L:  function (s) { return s.L; },
    B:  function (s) { return s.B; },
    D:  function (s) { return s.D; },
    T:  function (s) { return s.T; },
    Cb: function (s) { return s.Cb; },
    designAirTemp: function (s) { return s.designAirTemp; },
    // Deck / level inputs — the scantling page mirrors of GEOMETRY
    ibLevel:       function (s) { return s.IB; },
    ttLevel:       function (s) { return s.TT; },
    udLevel:       function (s) { return s.UD; },
    hcLevel:       function (s) { return s.HC; },
    udDeckLevelRO: function (s) { return s.UD; },
    twnDeckLevel:  function (s) { return s.TT; },
    keelWidth:     function (s) { return s.keelWidth; },
    // Spacings
    bottomLongSpacing: function (s) { return s.dbSpacing; },
    ibLongSpacing:     function (s) { return s.dbSpacing; },
    deckLongSpacing:   function (s) { return s.deckSpacing; },
    twnDeckSpacing:    function (s) { return s.deckSpacing; },
    strDeckSpacing:    function (s) { return s.deckSpacing; },
    dkStiffS:          function (s) { return s.sideSpacing; },
    transFrameSpacing: function (s) { return s.transFrameSpacing; },
    // Still-water bending moments — asked for explicitly, see MUST_CLEAR note
    MsDesign: function (s) { return s.MsHog; },
    MsSag:    function (s) { return s.MsSag; },
    // Effective span of longitudinals between web frames. Not derivable from
    // the frame spacing - it depends on how often web frames are fitted - and
    // the optimizers fall back to a silent 1.5 m when it is blank, so the
    // wizard asks for it outright.
    le: function (s) { return s.le; },
    // Derivable from the draught - see ibCargoFromDraught(). Previously this
    // was left blank because the shipped default (20 t/m2) belonged to one
    // specific ship; the rule gives a standard value for any ship without a
    // heavy cargo notation.
    ibCargo: function (s) { return ibCargoFromDraught(s.T); },
    ibRho: function () { return Math.round(RHO_SEAWATER * 1000) / 1000; }
  };

  // ── Fields with no safe generic default ──────────────────────────────
  // These describe one specific ship. Carrying Baltic Laker's numbers into
  // a new project would produce plausible-looking but wrong results, so they
  // are cleared and the user is told which ones still need input.
  //
  // MsDesign/MsSag are in WIZARD_DRIVEN above because the wizard asks for
  // them; they land here too so an empty wizard answer stays empty rather
  // than silently inheriting 900 000 kN·m.
  var MUST_CLEAR = [
    'MsDesign',      // still-water hogging moment — from the loading manual
    'MsSag',         // still-water sagging moment — from the loading manual
    'variant',
    'revision',
    'reportNotes',
    'ibSideTankH',   // side tank height above IB (m) — arrangement specific
    'le',            // effective span of longitudinals (m)
    'ice_T_uiwl', 'ice_T_liwl', 'ice_Disp', 'ice_P0', 'ice_P0_required',
    'ice_t_floor', 'ice_tc'
  ];

  // ── LR standard loading constants ───────────────────────────────────
  // Pt 3 Ch 3, 5.3.1: "Unless it is specifically requested otherwise, the
  // following standard stowage rates are to be used: 1,39 m3/tonne for weather
  // or general cargo loading on deck and inner bottom. 0,975 m3/tonne for
  // liquid cargo of density of 1,025 tonne/m3 or less."
  //
  // Densities are the reciprocals, so they are derived here rather than typed
  // as literals - the stowage rate is the number the rule actually states.
  var C_GENERAL_CARGO = 1.39;    // m3/tonne - no density is stated for cargo,
  var RHO_CARGO = 1 / C_GENERAL_CARGO;      // so derive it: 0.719 t/m3
  // For liquids the rule states the density itself (1,025 tonne/m3); the 0,975
  // m3/tonne stowage rate is that value rounded and inverted. Use the density
  // the rule gives rather than re-deriving it from the rounded rate, which
  // lands on 1,026.
  var RHO_SEAWATER = 1.025;      // t/m3

  // Pt 3 Ch 1, 9 Table 1.9.1: tanks are tested to the greater of the head to
  // the top of the overflow, 2,4 m above the top of the tank, and (for double
  // bottom tanks) the head up to the bulkhead deck. 2,4 m is the floor.
  var TEST_HEAD_MIN_M = 2.4;

  // Pt 3 Ch 12, 3.2.1: air pipe height above the freeboard deck is normally
  // not less than 760 mm (450 mm on a superstructure deck).
  var AIR_PIPE_ABOVE_DECK_MM = 760;

  // Pt 3 Ch 3 Table 3.5.1, Inner bottom, ship without heavy cargo notation:
  // permissible cargo loading = 9,82·T kN/m2 (equivalent permissible head
  // 1,39·T m). Dividing by g gives almost exactly T tonnes/m2.
  function ibCargoFromDraught(T_m) {
    if (!T_m || !isFinite(T_m)) return '';
    return Math.round((9.82 * T_m / 9.81) * 10) / 10;   // t/m2
  }

  // Human-readable names for the "still to fill in" notice.
  var CLEAR_LABELS = {
    MsDesign:    'Still-water hogging moment (Ms)',
    MsSag:       'Still-water sagging moment (Ms)',
    ibSideTankH: 'Side tank height above inner bottom',
    le:          'Effective span of longitudinals between web frames (l_e)'
  };

  // =====================================================================
  //  STATE GENERATION
  // =====================================================================

  // Inputs that belong to this wizard or to a transient modal - never part
  // of the project state.
  function isTransient(id) {
    return id.indexOf('np_') === 0        // this wizard's own fields
        || id.indexOf('psm') === 0        // profile-suggest modal
        || id.indexOf('asm') === 0        // add-stiffener modal
        || id.indexOf('esm') === 0        // equal-spacing modal
        || id.indexOf('cpm-') === 0;      // custom-profile modal
  }

  // Reset every form input to the value declared in index.html, then layer
  // the wizard's answers on top, then blank the ship-specific ones.
  //
  // Two rules keep this from manufacturing bad inputs:
  //   * an input with no value="" attribute has no declared default, so its
  //     current value is kept rather than blanked - blanking a numeric field
  //     turns it into NaN downstream;
  //   * a <select> is only reset when an <option selected> says what the
  //     default is. The profile dropdowns are filled from the catalogs at
  //     runtime and carry no marked option; falling back to options[0] there
  //     picked an arbitrary profile, or an empty string when the catalog had
  //     not been built yet, which hangs the section-property loops.
  function buildFormValues(spec) {
    var fv = {};
    document.querySelectorAll('input[id], select[id], textarea[id]').forEach(function (el) {
      if (!el.id || el.type === 'file' || el.type === 'button') return;
      if (isTransient(el.id)) return;

      if (el.type === 'checkbox' || el.type === 'radio') {
        fv[el.id] = el.defaultChecked;
      } else if (el.tagName === 'SELECT') {
        var marked = el.querySelector('option[selected]');
        fv[el.id] = marked ? marked.value : el.value;   // no marked default -> keep
      } else if (el.hasAttribute('value')) {
        fv[el.id] = el.defaultValue;
      } else {
        fv[el.id] = el.value;                            // no declared default -> keep
      }
    });

    Object.keys(WIZARD_DRIVEN).forEach(function (id) {
      if (!(id in fv)) return;               // input not present in this build
      var v = WIZARD_DRIVEN[id](spec);
      if (v !== undefined && v !== null) fv[id] = String(v);
    });

    MUST_CLEAR.forEach(function (id) {
      if (!(id in fv)) return;
      // Keep a wizard answer if the user actually gave one.
      if (WIZARD_DRIVEN[id]) {
        var given = WIZARD_DRIVEN[id](spec);
        if (given !== undefined && given !== null && String(given).trim() !== '') {
          fv[id] = String(given);
          return;
        }
      }
      fv[id] = '';
    });

    // Ice class off by default — the wizard does not cover FSICR, and the
    // ice inputs above were just cleared, so leaving it on would compute
    // against blanks.
    if ('iceEnabledOff' in fv) fv.iceEnabledOff = true;
    if ('iceEnabledOn'  in fv) fv.iceEnabledOn  = false;

    return fv;
  }

  // Side girders spread evenly between the duct keel and the inner side.
  function buildSideGirders(spec) {
    var n = Math.max(0, parseInt(spec.sgCount, 10) || 0);
    if (!n) return [];
    var girders = [];
    var first = spec.ductHalf;
    var last = spec.IS;
    // n girders: the outermost sits on the inner side, the rest spread inboard.
    for (var i = 1; i <= n; i++) {
      var y = first + (last - first) * (i / n);
      girders.push({ y: Math.round(y / 50) * 50 });
    }
    if (girders.length) girders[girders.length - 1].y = spec.IS;
    return girders;
  }

  // A generic single-hold arrangement: duct keel, double-bottom wing
  // ballast, cargo hold, side ballast tank. Rectangles rather than node
  // polygons — node indices depend on computeNodes() having run, and a
  // freshly generated section has not been drawn yet.
  function buildCompartments(spec) {
    var airpipe = spec.UD + AIR_PIPE_ABOVE_DECK_MM;
    var rhoCargo = Math.round(RHO_CARGO * 1000) / 1000;
    var rhoSea   = Math.round(RHO_SEAWATER * 1000) / 1000;
    return [
      { name: 'DUCT', type: 'void', rho: 0, airpipeZ_mm: null, testHead_m: null, cargoLoad: 0,
        yMin: 0, yMax: spec.ductHalf, zMin: 0, zMax: spec.IB },
      { name: 'DB WING BALLAST', type: 'ballast', rho: rhoSea,
        airpipeZ_mm: airpipe, testHead_m: TEST_HEAD_MIN_M, cargoLoad: 0,
        yMin: spec.ductHalf, yMax: spec.Bhalf, zMin: 0, zMax: spec.IB },
      { name: 'CARGO', type: 'cargo', rho: rhoCargo, airpipeZ_mm: null, testHead_m: null,
        cargoLoad: ibCargoFromDraught(spec.T) || 0,
        yMin: 0, yMax: spec.IS, zMin: spec.IB, zMax: spec.UD },
      { name: 'SIDE BALLAST', type: 'ballast', rho: rhoSea,
        airpipeZ_mm: airpipe, testHead_m: TEST_HEAD_MIN_M, cargoLoad: 0,
        yMin: spec.IS, yMax: spec.Bhalf, zMin: spec.IB, zMax: spec.UD }
    ];
  }

  // Assemble a MidshipFullState payload the existing importer understands.
  function buildStateFromSpec(spec) {
    var girders = buildSideGirders(spec);

    var wt = { stringerPlate: 'Non-WT', tweenDeckPlate: 'WT', upperDeckPlate: 'WT' };
    girders.forEach(function (g, i) { wt['sg' + i] = 'Non-WT'; });

    // Empty strake/profile lists + STRAKES_AUTO on: the engine regenerates
    // both from geometry and the scantling inputs on the next recalc, which
    // is exactly what a fresh section should get.
    var strakes = {
      shell: [], innerBottom: [], innerSide: [],
      upperDeck: [], stringer: [], tween: [], coamingTop: []
    };
    var profiles = {
      bottomShell: [], innerBottom: [], stringerStiff: [], tweenStiff: [],
      coamingStiff: [], sideShell: [], innerSide: [], stringer: [],
      tweenDeck: [], upperDeck: []
    };
    girders.forEach(function (g, i) {
      strakes['sideGirder' + i] = [];
      profiles['sideGirder' + i] = [];
    });

    return {
      format: 'MidshipFullState',
      version: 2,
      GEOMETRY: {
        B_half: spec.Bhalf,
        IB: spec.IB,
        TT: spec.TT,
        UD: spec.UD,
        HC: spec.HC,
        R_B: spec.R_B,
        keel_half: Math.round(spec.keelWidth / 2),
        duct_half: spec.ductHalf,
        IS: spec.IS
      },
      PARAMS: {
        dbSpacing: spec.dbSpacing,
        sideSpacing: spec.sideSpacing,
        // Levels are state: one tween deck at TT, one side stringer midway
        // between inner bottom and tween deck. Both editable at step 3.
        tweenZs: spec.TT ? [spec.TT] : [],
        stringerZs: [Math.round((spec.IB + (spec.TT || spec.UD)) / 2 / 10) * 10],
        sideZ0: spec.IB + Math.round(spec.sideSpacing * 0.8),
        coamingTop: 950,
        coamingEdgeH: 200,
        coamingEdgeT: 20,
        profTypeBottom: 'L', profTypeIB: 'L', profTypeStringer: 'L',
        profTypeTween: 'L', profTypeCoaming: 'FB', profTypeSide: 'L',
        profTypeIS: 'L', profTypeDeck: 'L'
      },
      // Starting thicknesses only — the plate optimizer replaces these.
      PLATE_THICKNESS: {
        shell: 12, ib: 12, is: 10, stringer: 10, tween: 10, upperDeck: 12,
        coaming: 20, coamingTop: 20, coamingWall: 15, keel: 14,
        sideGirder: 10, duct: 10
      },
      // Empty = not yet assigned; assignMaterialGrades() fills them from
      // ship type, x/L and design temperature on the first recalc.
      PLATE_GRADE: { stringer: '', tween: '', upperDeck: '', duct: '', sideGirder: '', coamingTop: '' },
      PLATE_MATERIAL_FAMILY: { stringer: '', tween: '', upperDeck: '', duct: '', sideGirder: '', coamingTop: '' },
      SIDE_GIRDER_GRADES: {},
      SIDE_GIRDER_FAMILIES: {},
      SIDE_GIRDERS: girders,
      profiles: profiles,
      BAND_ASSIGNMENTS: {},
      linkBS_IB: true,
      linkSS_IS: true,
      VIEW_MODE: 'general',
      WT_FLAGS: wt,
      COMPARTMENTS: buildCompartments(spec),
      TRANSVERSE_STIFFS: [],
      BRACKETS: [],
      STRAKES: strakes,
      STRAKES_AUTO: true,
      MIRROR_BODY: false,
      formValues: buildFormValues(spec),
      project: {
        vesselName: spec.vesselName,
        variant: '',
        revision: '',
        analysisDate: new Date().toISOString().slice(0, 10),
        classSociety: spec.classSociety,
        preparedBy: spec.preparedBy,
        notes: ''
      }
    };
  }

  // =====================================================================
  //  APPLY / PERSIST
  // =====================================================================

  // The empty project: every text / number input of the Main particulars blank, the
  // engine's geometry zeroed, no section model, no compartments, empty tables.
  // Selects, checkboxes and radios keep their built-in defaults (class society,
  // ship type, materials).
  function blankState() {
    var fv = {};
    document.querySelectorAll('#page-1 input[id], #page-1 textarea[id]').forEach(function (el) {
      if (!el.id || el.type === 'file' || el.type === 'button' || el.type === 'checkbox' || el.type === 'radio') return;
      if (isTransient(el.id)) return;
      fv[el.id] = '';
    });
    fv.analysisDate = new Date().toISOString().slice(0, 10);
    fv.revision = 'A';
    fv.f1 = '1.00';
    fv.sectionXL = '0.5';
    fv.compartmentsJson = ''; fv.frameTableJson = ''; fv.customProfilesJson = '';
    return {
      format: 'MidshipFullState', version: 2, blank: true,
      GEOMETRY: { B_half: 0, IB: 0, TT: 0, UD: 0, HC: 0, R_B: 0, keel_half: 0, duct_half: 0, IS: 0 },
      PARAMS: { dbSpacing: 700, sideSpacing: 700, tweenZs: [], stringerZs: [], sideZ0: 0, coamingTop: 0, coamingEdgeH: 0, coamingEdgeT: 0,
                profTypeBottom: 'L', profTypeIB: 'L', profTypeStringer: 'L', profTypeTween: 'L', profTypeCoaming: 'FB', profTypeSide: 'L', profTypeIS: 'L', profTypeDeck: 'L' },
      SIDE_GIRDERS: [],
      STRAKES: { shell: [], innerBottom: [], innerSide: [], upperDeck: [], stringer: [], tween: [], coamingTop: [] },
      profiles: { bottomShell: [], innerBottom: [], stringerStiff: [], tweenStiff: [], coamingStiff: [], sideShell: [], innerSide: [], stringer: [], tweenDeck: [], upperDeck: [] },
      COMPARTMENTS: [],
      SECTIONS: { active: null, items: [] },
      formValues: fv
    };
  }

  function applyState(state) {
    if (!window.importFullState) {
      notify('<strong>The drawing engine is not ready yet.</strong><br>' +
             'Open the Geometry page once, then try again.');
      return false;
    }
    var ok = window.importFullState(state);
    if (!ok) { notify('<strong>Could not apply the project state.</strong>'); return false; }

    // No cross section (the empty project, or one saved before a section was made):
    // nothing to lay out - the legacy layout from a zero geometry only yields NaN.
    var noSection = !!state.blank || (state.SECTIONS && !((state.SECTIONS.items || []).length)
                     && (!state.SECTION || !((state.SECTION.panels || []).length)));
    if (noSection) {
      try { if (window.Draw && window.Draw.render) window.Draw.render(); } catch (e) {}
      try { if (typeof recalcAll === 'function') recalcAll(); } catch (e) {}
      try { if (window.SectionCAD && SectionCAD.renderPanel) SectionCAD.renderPanel(); } catch (e) {}
      return true;
    }

    // A generated section has no strakes or profiles yet — regenerate both
    // now so the user lands on a drawn section rather than an empty canvas.
    // Each step is isolated: one throwing recompute must not leave the rest
    // of the section unbuilt. importFullState has already fired the form
    // change events, so this is the drawing-side catch-up.
    var step = function (name, fn) {
      try { fn(); } catch (e) { console.warn('[Project] ' + name + ' failed:', e); }
    };
    if (window.Draw) {
      step('setStrakesAuto',  function () { if (window.Draw.setStrakesAuto) window.Draw.setStrakesAuto(true); });
      step('computeProfiles', function () { if (window.Draw.computeProfiles) window.Draw.computeProfiles(); });
      step('computeStrakes',  function () { if (window.Draw.computeStrakes)  window.Draw.computeStrakes(); });
      step('render',          function () { if (window.Draw.render)          window.Draw.render(); });
    }
    step('recalcAll',          function () { if (typeof recalcAll === 'function') recalcAll(); });
    step('syncFromScantling',  function () { if (window.Bridge && window.Bridge.syncFromScantling) window.Bridge.syncFromScantling(); });
    // Grades last. importFullState fires the zone-material change events, which
    // assign grades - but the strakes are regenerated after that, so a freshly
    // generated section would land with every strake ungraded. Re-run once the
    // strakes actually exist.
    step('assignMaterialGrades', function () {
      if (typeof window.assignMaterialGrades === 'function') {
        window.assignMaterialGrades({ silent: true });
      }
    });
    // The panel steps (Strakes / Stiffeners) start from the engine's automatic
    // layout instead of empty: fill the section model from the regenerated
    // STRAKES / profiles, then push it back so both agree.
    step('fillPanelsFromEngine', function () {
      var D = window.Draw; var m = D && D.getSection && D.getSection();
      if (!m || !window.SectionAdapter || !SectionAdapter.legacyToPanelData) return;
      // let the parametric engine lay the section out once (a hand-edited model
      // would otherwise feed its empty panel data back), then take that layout
      m.manual = false; D.setSection(m);
      if (D.computeProfiles) D.computeProfiles();
      if (D.computeStrakes) D.computeStrakes();
      if (typeof window.assignMaterialGrades === 'function') window.assignMaterialGrades({ silent: true });
      Object.keys(m.panelData || {}).forEach(function (g) { m.panelData[g].strakes = []; m.panelData[g].stiffGroups = []; });
      SectionAdapter.legacyToPanelData(m, D.STRAKES, D.profiles, D.GEOMETRY, D.PLATE_THICKNESS);
      m.manual = true; D.setSection(m); SectionAdapter.apply(m); D.render();
    });
    syncHeaderSubtitle();
    return true;
  }

  // Once the user asks to discard the project, nothing may write it back -
  // in particular the beforeunload autosave, which otherwise re-saved the
  // very project loadExample() had just cleared, so "Example" never actually
  // reverted anything.
  var discarded = false;

  function saveLocal() {
    try {
      if (discarded) return false;
      if (!window.exportFullState) return false;
      var s = window.exportFullState(true);
      localStorage.setItem(LS_KEY, JSON.stringify(s));
      return true;
    } catch (e) {
      console.warn('[Project] autosave failed:', e);
      return false;
    }
  }

  function loadLocal() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  // Drop the stored project without latching. Used by the boot-time escape
  // hatches, which clear and then carry on running in the same page: latching
  // there would leave autosave dead for the whole session.
  function dropSaved() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
  }

  // Drop it AND stop anything writing it back. Only for an explicit discard
  // that is immediately followed by a reload (loadExample), where the pending
  // beforeunload autosave would otherwise resurrect what we just deleted.
  // The latch dies with the page, so it never outlives that reload.
  function clearLocal() {
    discarded = true;
    dropSaved();
  }

  // =====================================================================
  //  WIZARD UI
  // =====================================================================

  // Prefill rules. Only B drives a hard value (half beam); the rest are
  // conventional starting points the user is expected to overwrite.
  function prefillFromDims(L, B, D, T) {
    var Bhalf = Math.round(B * 1000 / 2);
    var UD = Math.round(D * 1000);
    return {
      Bhalf: Bhalf,
      IB: 1800,
      TT: Math.max(3000, UD - 2400),
      UD: UD,
      HC: UD + 1050,
      R_B: 1800,
      keelWidth: 1800,
      ductHalf: 900,
      IS: Math.max(1000, Bhalf - 1850),
      dbSpacing: 700,
      sideSpacing: 705,
      deckSpacing: 700,
      transFrameSpacing: 2400,
      sgCount: 3
    };
  }

  function num(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    var v = parseFloat(el.value);
    return isNaN(v) ? null : v;
  }
  function str(id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  function openWizard() {
    var m = document.getElementById('newProjectModal');
    if (!m) return;
    m.classList.add('open');
    var vn = document.getElementById('np_vesselName');
    if (vn) vn.focus();
    syncPrefill();
  }

  function closeWizard() {
    var m = document.getElementById('newProjectModal');
    if (m) m.classList.remove('open');
  }

  // Recompute the derived fields whenever L/B/D/T change, but never
  // overwrite a box the user has already typed into.
  function syncPrefill() {
    var L = num('np_L'), B = num('np_B'), D = num('np_D'), T = num('np_T');
    if (!B || !D) return;
    var p = prefillFromDims(L, B, D, T);
    Object.keys(p).forEach(function (k) {
      var el = document.getElementById('np_' + k);
      if (!el) return;
      if (el.dataset.touched === '1') return;
      el.value = p[k];
    });
  }

  function readSpec() {
    var errs = [];
    var L = num('np_L'), B = num('np_B'), D = num('np_D'), T = num('np_T'), Cb = num('np_Cb');
    if (!L || L <= 0) errs.push('L (rule length)');
    if (!B || B <= 0) errs.push('B (breadth)');
    if (!D || D <= 0) errs.push('D (depth)');
    if (!T || T <= 0) errs.push('T (draught)');
    if (!Cb || Cb <= 0 || Cb > 1) errs.push('C_b (block coefficient, 0–1)');
    // The geometry / spacing boxes are hidden in the wizard (steps 2 and 5 own
    // them). They are normally prefilled by the L/B/D/T input listeners, but a
    // pasted or programmatic fill skips those, so fill any blank one here.
    if (B && D) syncPrefill();
    if (!str('np_vesselName')) errs.push('Vessel name');

    var spec = {
      vesselName: str('np_vesselName'),
      shipType: str('np_shipType'),
      classSociety: str('np_classSociety'),
      preparedBy: str('np_preparedBy'),
      designAirTemp: num('np_designAirTemp'),
      L: L, B: B, D: D, T: T, Cb: Cb,
      Bhalf: num('np_Bhalf'),
      IB: num('np_IB'), TT: num('np_TT'), UD: num('np_UD'), HC: num('np_HC'),
      R_B: num('np_R_B'),
      keelWidth: num('np_keelWidth'),
      ductHalf: num('np_ductHalf'),
      IS: num('np_IS'),
      dbSpacing: num('np_dbSpacing'),
      sideSpacing: num('np_sideSpacing'),
      deckSpacing: num('np_deckSpacing'),
      transFrameSpacing: num('np_transFrameSpacing'),
      sgCount: num('np_sgCount'),
      MsHog: str('np_MsHog'),
      MsSag: str('np_MsSag'),
      le: str('np_le')
    };

    // Geometry sanity — these would produce a nonsense section rather than
    // an error, so catch them before generating.
    if (spec.IB && spec.UD && spec.IB >= spec.UD) errs.push('Inner bottom must be below the upper deck');
    if (spec.IS && spec.Bhalf && spec.IS >= spec.Bhalf) errs.push('Inner side must be inboard of the half beam');
    if (spec.ductHalf && spec.IS && spec.ductHalf >= spec.IS) errs.push('Duct keel must be inboard of the inner side');
    if (spec.R_B && spec.IB && spec.R_B > spec.UD) errs.push('Bilge radius is larger than the depth');
    if (spec.TT && spec.UD && spec.TT > spec.UD) errs.push('Tween deck must be at or below the upper deck');
    if (spec.HC && spec.UD && spec.HC < spec.UD) errs.push('Hatch coaming top must be at or above the upper deck');

    return { spec: spec, errors: errs };
  }

  function createProject() {
    var r = readSpec();
    var errBox = document.getElementById('np_errors');
    if (r.errors.length) {
      if (errBox) {
        errBox.style.display = 'block';
        errBox.innerHTML = '<strong>Please fix:</strong><br>\u2022 ' + r.errors.join('<br>\u2022 ');
      }
      return;
    }
    if (errBox) errBox.style.display = 'none';

    var state = buildStateFromSpec(r.spec);
    discarded = false;          // a new project is saveable again
    closeWizard();

    // The importer writes into the geometry page's editor, so make sure the
    // drawing engine has been initialised at least once first.
    if (typeof goToPage === 'function') goToPage(3);
    setTimeout(function () {
      if (!applyState(state)) return;
      saveLocal();
      reportPending(r.spec);
    }, 400);
  }

  // Shared toast. 70-history.js has one but it is closure-local, so nothing
  // outside that module could give feedback. This one is on window and lives
  // in an aria-live region - the app previously had none, so every toast was
  // silent to a screen reader.
  var toastEl = null, toastTimer = null;
  function toast(msg, kind, detail) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'ea-toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'ea-toast' + (kind ? ' ' + kind : '');
    toastEl.innerHTML = '';
    var span = document.createElement('span');
    span.textContent = msg;
    toastEl.appendChild(span);
    if (detail) {
      var d = document.createElement('span');
      d.className = 'ea-toast-file';
      d.textContent = detail;
      toastEl.appendChild(d);
    }
    // force reflow so the transition runs on repeat calls
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3200);
  }
  window.eaToast = toast;

  // Show a message in the floating banner. Deliberately NOT alert(): a modal
  // dialog blocks the renderer, and one fired during boot leaves the whole
  // app unresponsive until someone clicks it.
  function notify(html) {
    var box = document.getElementById('np_pendingBanner');
    if (!box) { console.warn('[Project] ' + html.replace(/<[^>]*>/g, ' ')); return; }
    box.innerHTML =
      '<button class="np-banner-dismiss" ' +
      'onclick="document.getElementById(\'np_pendingBanner\').classList.remove(\'open\')">' +
      'Dismiss</button>' + html;
    box.classList.add('open');
  }

  // Flag the fields the wizard deliberately left blank, on the fields
  // themselves. The banner says which inputs are missing; this says where.
  // Without it a blank l_e just turns the summary's plate weight into "NaN"
  // with nothing pointing back at the cause.
  function markMissing() {
    // Only the inputs something downstream actually needs - the ones the
    // banner names. Marking variant/revision/notes as well, or the ice fields
    // while ice class is switched off, would paint half the Setup page amber
    // and the signal would be worth nothing.
    Object.keys(CLEAR_LABELS).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var blank = String(el.value).trim() === '';
      el.classList.toggle('is-missing', blank);
      if (blank && !el.dataset.missingWired) {
        el.dataset.missingWired = '1';
        var clear = function () {
          if (String(el.value).trim() !== '') el.classList.remove('is-missing');
        };
        el.addEventListener('input', clear);
        el.addEventListener('change', clear);
      }
    });
  }

  // Tell the user, plainly, which inputs were deliberately left empty.
  function reportPending(spec) {
    markMissing();
    var pending = [];
    MUST_CLEAR.forEach(function (id) {
      if (!CLEAR_LABELS[id]) return;
      var el = document.getElementById(id);
      if (el && String(el.value).trim() === '') pending.push(CLEAR_LABELS[id]);
    });
    if (!pending.length) return;
    // Not a banner: the step badges (1 Ship, 5 Stiffeners) name the blanks
    // and stay amber until they are filled. A toast just points there.
    toast('Project created — ' + pending.length + ' input(s) still blank (' + pending.join(', ') + '). See the amber step badges.');
  }

  // =====================================================================
  //  EXAMPLE PROJECT
  // =====================================================================

  // The original Baltic Laker data still lives in the code defaults, so
  // "load the example" is just: forget the autosave and start over.
  var EXAMPLE_FLAG = LS_KEY + ':example';
  function loadExample() {
    if (!confirm('Discard the current project and load the built-in example (Wagenborg Baltic Laker GC)?\n\nAnything not saved to a .json file will be lost.')) return;
    clearLocal();
    try { localStorage.setItem(EXAMPLE_FLAG, '1'); } catch (e) {}   // one launch with the code defaults
    location.reload();
  }

  // The empty project (no autosave, fresh start, failed restore): applied once the
  // drawing engine is live, then autosaved so the next launch is the same.
  function blankStart() {
    if (typeof goToPage === 'function') goToPage(3);
    setTimeout(function () {
      try { if (window.importFullState) window.importFullState(blankState()); } catch (e) { console.error('[Project] blank start failed:', e); }
      try { saveLocal(); } catch (e) {}
      try { window.dispatchEvent(new Event('midship:restored')); } catch (e) {}
    }, 600);
    installAutosave();
  }

  function newProject() {
    var has = !!loadLocal();
    if (has && !confirm('Start a new project?\n\nThe current project will be replaced. Save it to a .json file first if you want to keep it.')) return;
    openWizard();
  }

  // =====================================================================
  //  BOOT
  // =====================================================================

  // The header subtitle was fixed text naming one ship. Mirror the vessel
  // name field instead, so it follows whatever project is open.
  function syncHeaderSubtitle() {
    var sub = document.getElementById('headerSubtitle');
    var vn = document.getElementById('vesselName');
    if (!sub || !vn) return;
    var name = (vn.value || '').trim();
    sub.textContent = (name || 'Midship Section') + ' \u2014 LR Pt 4 Ch 1';
  }

  // ── Label association ────────────────────────────────────────────────
  // The form has 132 <label class="ea-label"> but only the ones written for
  // the New Project wizard carried a for="". Without it, clicking a label does
  // not focus its input and a screen reader announces the field unnamed.
  // Wiring it in markup would mean editing 100+ sites; the structure is
  // regular (.ea-field > label + control) so pair them at runtime instead.
  function wireLabels() {
    var paired = 0;
    document.querySelectorAll('.ea-field').forEach(function (field) {
      var label = field.querySelector('label.ea-label');
      if (!label || label.htmlFor) return;
      var ctrl = field.querySelector('input[id], select[id], textarea[id]');
      if (!ctrl) return;
      if (ctrl.type === 'radio' || ctrl.type === 'checkbox') return;  // grouped, needs a fieldset not a label
      label.htmlFor = ctrl.id;
      paired++;
    });
    return paired;
  }

  // ── Wizard keyboard handling ─────────────────────────────────────────
  // Every other modal in the app closes on Escape (40-modals.js,
  // 91-profile-picker.js). This one did not, had no backdrop-click close, no
  // Enter-to-submit and no focus trap - it was the least keyboard-friendly
  // surface in the tool despite being the newest.
  function wireWizardKeys() {
    var m = document.getElementById('newProjectModal');
    if (!m || m.dataset.keysWired) return;
    m.dataset.keysWired = '1';

    // Click on the backdrop itself (not the dialog) closes.
    m.addEventListener('mousedown', function (e) {
      if (e.target === m) closeWizard();
    });

    // Escape is bound on document, not on the dialog: a keydown listener on the
    // modal only fires while focus is inside it, so pressing Escape after
    // clicking the backdrop did nothing. Every other modal in the app listens
    // on document for exactly this reason.
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (!m.classList.contains('open')) return;
      e.preventDefault();
      closeWizard();
    });

    m.addEventListener('keydown', function (e) {

      // Enter submits, except from a textarea or a button (where Enter has
      // its own meaning).
      if (e.key === 'Enter' && !e.shiftKey) {
        var t = e.target;
        if (t && t.tagName !== 'TEXTAREA' && t.tagName !== 'BUTTON') {
          e.preventDefault();
          createProject();
        }
        return;
      }

      // Focus trap: Tab cycles inside the dialog instead of escaping to the
      // page behind it.
      if (e.key === 'Tab') {
        var f = m.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])');
        var list = [];
        f.forEach(function (el) { if (!el.disabled && el.offsetParent) list.push(el); });
        if (!list.length) return;
        var first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    });
  }

  // Autosave on the way out and periodically — the drawing engine has no
  // single "changed" event, so a timer is the honest option here. Kept in its
  // own function because two boot paths return early and still need it.
  var autosaveInstalled = false;
  function installAutosave() {
    if (autosaveInstalled) return;
    autosaveInstalled = true;
    window.addEventListener('beforeunload', saveLocal);
    setInterval(function () { saveLocal(); }, 30000);
  }

  function boot() {
    syncHeaderSubtitle();
    wireWizardKeys();
    var pairedNow = wireLabels();
    // Panels are rebuilt as the user moves around, so re-pair on page change.
    if (typeof window.goToPage === 'function' && !window.__labelsHooked) {
      window.__labelsHooked = true;
      var origGoTo = window.goToPage;
      window.goToPage = function () {
        var r = origGoTo.apply(this, arguments);
        setTimeout(wireLabels, 60);
        return r;
      };
    }
    console.log('[Project] labels paired:', pairedNow);
    var vnEl = document.getElementById('vesselName');
    if (vnEl) {
      vnEl.addEventListener('input', syncHeaderSubtitle);
      vnEl.addEventListener('change', syncHeaderSubtitle);
    }

    // Mark boxes the user edits so syncPrefill leaves them alone.
    ['Bhalf', 'IB', 'TT', 'UD', 'HC', 'R_B', 'keelWidth', 'ductHalf', 'IS',
     'dbSpacing', 'sideSpacing', 'deckSpacing', 'transFrameSpacing', 'sgCount'
    ].forEach(function (k) {
      var el = document.getElementById('np_' + k);
      if (el) el.addEventListener('input', function () { el.dataset.touched = '1'; });
    });
    ['L', 'B', 'D', 'T'].forEach(function (k) {
      var el = document.getElementById('np_' + k);
      if (el) el.addEventListener('input', syncPrefill);
    });

    // ── Safe restore ───────────────────────────────────────────────────
    // Restoring a project runs the whole drawing engine over saved data. If
    // that data is bad the engine can hang, and because the restore happens
    // on every launch the app would then be bricked with no way back in.
    // Two escapes:
    //   * ?fresh=1 (or #fresh) skips the restore and drops the autosave;
    //   * a restore that never finished leaves BOOT_FLAG set, so the next
    //     launch refuses to replay the same data and tells the user.
    var BOOT_FLAG = LS_KEY + ':restoring';

    if (/[?&]fresh=1/.test(location.search) || location.hash === '#fresh') {
      dropSaved();
      try { localStorage.removeItem(BOOT_FLAG); } catch (e) {}
      console.log('[Project] fresh start requested - stored project dropped');
      blankStart();
      return;
    }

    // the Example button: one launch with the built-in ship (the code defaults)
    var example = false;
    try { example = localStorage.getItem(EXAMPLE_FLAG) === '1'; localStorage.removeItem(EXAMPLE_FLAG); } catch (e) {}
    if (example) {
      setTimeout(function () { try { saveLocal(); } catch (e) {} try { window.dispatchEvent(new Event('midship:restored')); } catch (e) {} }, 600);
      installAutosave();
      return;
    }

    var crashed = false;
    try { crashed = localStorage.getItem(BOOT_FLAG) === '1'; } catch (e) {}
    if (crashed) {
      try { localStorage.removeItem(BOOT_FLAG); } catch (e) {}
      dropSaved();
      blankStart();
      console.warn('[Project] previous restore did not finish - autosave dropped');
      setTimeout(function () {
        notify('<strong>The last saved project could not be reopened.</strong><br>' +
               'It has been discarded and an empty project opened instead. ' +
               'If you exported that project to a .json file you can bring it back ' +
               'with the Load button.');
      }, 1200);
      return;
    }

    var saved = loadLocal();
    if (!saved) { blankStart(); return; }   // nothing saved: the empty project, not the built-in example
    if (saved) {
      try { localStorage.setItem(BOOT_FLAG, '1'); } catch (e) {}
      // Restore on the geometry page so the drawing engine is live.
      if (typeof goToPage === 'function') goToPage(3);
      setTimeout(function () {
        var ok = false;
        try { ok = applyState(saved); } catch (e) { console.error('[Project] restore failed:', e); }
        try { localStorage.removeItem(BOOT_FLAG); } catch (e) {}
        if (ok) {
          console.log('[Project] restored autosaved project');
          markMissing();
        }
        // 96-steps.js lands on the remembered step; without it fall back to Setup.
        if (typeof window.goToStep !== 'function' && typeof goToPage === 'function') goToPage(1);
        try { window.dispatchEvent(new Event('midship:restored')); } catch (e) {}
      }, 600);
    }

    installAutosave();
  }

  window.Project = {
    newProject: newProject,
    openWizard: openWizard,
    closeWizard: closeWizard,
    createProject: createProject,
    loadExample: loadExample,
    saveLocal: saveLocal,
    clearLocal: clearLocal,
    buildStateFromSpec: buildStateFromSpec,
    applyState: applyState,
    blankState: blankState,
    syncPrefill: syncPrefill,
    syncHeaderSubtitle: syncHeaderSubtitle,
    markMissing: markMissing,
    toast: toast,
    wireLabels: wireLabels
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
