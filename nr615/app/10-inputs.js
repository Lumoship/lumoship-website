/* ============================================================================
   Input model. One flat object drives the whole app: the engine reads it, the
   forms bind to it, save/load serialises it. Defaults reproduce the worked
   example that shipped in NR615_Buckling_Assessment.xlsx, so a fresh launch
   lands on a case that is already meaningful.
   ============================================================================ */

window.NRIN = (function () {
  'use strict';

  var OPTIONS = {
    method: ['SP-A', 'SP-B', 'UP-A', 'UP-B'],
    analysis: ['Prescriptive', 'FE'],
    profile: ['Flat bar', 'Bulb', 'Angle', 'T-bar', 'L2', 'U-type'],
    edgeFixity: ['Fixed both ends', 'Not fixed both ends', 'Unstiffened panel', 'Girder high rigidity'],
    stiffEnds: ['Continuous', 'Sniped one end', 'Sniped both ends'],
    pressureSide: ['Opposite to stiffener', 'Same side as stiffener'],
    thickBasis: ['Net (corrosion deducted)', 'Gross (deduct tc below)'],
    flangeType: ['Symmetric (T-bar)', 'One-sided (angle/L2)', 'Manual'],
    endRestraint: ['Fixed both ends', 'One end fixed', 'Simply supported both ends'],
    panelLocation: ['General', 'Vertically stiffened SSS bulk carrier side shell'],
    applyCtCap: ['No', 'Yes'],
    stiffArr: ['Longitudinal', 'Transverse'],
    brackets: ['None', 'Fitted'],
    caseX: ['Case 1', 'Case 3', 'Case 4', 'Case 5', 'Case 9', 'Case 11', 'Case 13'],
    caseY: ['Case 2', 'Case 6', 'Case 7', 'Case 8', 'Case 10', 'Case 12', 'Case 14'],
    caseT: ['Case 15', 'Case 16', 'Case 17', 'Case 18', 'Case 19'],
    upModel: ['UP-A', 'UP-B'],
    wsArrangement: ['A - along PSM span', 'B - normal to PSM span'],
    flangeSym: ['Symmetrical', 'Asymmetrical'],
    bracketLocation: ['Tank/hold boundary', 'Other area'],
    bracketType: ['End bracket', 'Tripping bracket'],
    edgeStiffFitted: ['Yes', 'No'],
    bracketsApplicable: ['Yes', 'No'],
    pillarEnd: ['Both simply supported', 'One end fixed', 'Both ends fixed', 'Cross tie'],
    corrStool: ['No', 'Yes'],
    opConfig: ['(a) without edge reinforcement', '(b) with edge reinforcement'],
    opModelled: ['No', 'Yes'],
    opMethod: ['Method A', 'Method B'],
    opCase17: ['No', 'Yes']
  };

  function defaults() {
    return {
      /* --- project --- */
      vessel: 'Buckling Assessment', rules: 'BV NR467 Pt B', preparedBy: '', revision: 'Rev00',
      notes: '',

      /* --- analysis control · Sec 1 --- */
      method: 'SP-A', analysis: 'Prescriptive', profile: 'T-bar',
      edgeFixity: 'Fixed both ends', stiffEnds: 'Continuous',
      pressureSide: 'Opposite to stiffener', etaAll: 0.8, S: 1,

      /* --- material --- */
      E: 206000, nu: 0.3, ReHP: 355, ReHS: 355,

      /* --- plate panel --- */
      a: 2550, b: 850, thickBasis: 'Net (corrosion deducted)', tcP: 0, tcS: 0,
      tp: 14, s: 850, l: 2550,

      /* --- stiffener --- */
      hw: 400, tw: 12, bf: 100, tf: 16, df: 0,
      flangeType: 'Symmetric (T-bar)', bfOutManual: 0, b1u: 0, b2u: 0,

      /* --- applied stresses · Sec 3 [2.1.1] / App 1 --- */
      sx: 180, sy: 0, tau: 55, psix: 1, psiy: 1, P: 90, MCL: 0, Ftran: 1,

      /* --- modelling options --- */
      beffB1: 0, beffB2: 0, endRestraint: 'Fixed both ends', panelLocation: 'General',
      applyCtCap: 'No', cUtype: 0.4, stiffArr: 'Longitudinal', syStiffPlating: 0,
      brackets: 'None', bracketSpacing: 0,
      caseX: 'Case 1', caseY: 'Case 2', caseT: 'Case 15', upModel: 'UP-A',
      openDa: 0, openDb: 0,
      nMax: 60, mTorMax: 40,

      /* --- Sec 2 slenderness data --- */
      lBdg: 12, sPsm: 3.2, iPsm: 900000,
      wsArrangement: 'A - along PSM span', lWs: 1.6, sWs: 700, twPsm: 13, aEffWs: 40, iWs: 1200,
      bracketsApplicable: 'Yes', bfPsm: 300, afPsm: 60, awPsm: 130,
      db: 900, lb: 1200, tb: 12, sbActual: 2.6, hwEdge: 90,
      flangeSym: 'Symmetrical', bracketLocation: 'Tank/hold boundary',
      bracketType: 'End bracket', edgeStiffFitted: 'Yes',

      /* --- Sec 5 [3.1] pillars --- */
      pillarA: 85, pillarI: 4200, pillarL: 4.2, pillarEnd: 'Both ends fixed',
      pillarSigma: 105, pillarSigmaET: 0, pillarSigmaETF: 0, pillarR: 150, pillarT: 8,

      /* --- Sec 5 [3.2] corrugations --- */
      corrB1: 700, corrT1: 14, corrSx1: 150, corrSy1: 0, corrTau1: 45,
      corrB2: 700, corrT2: 14, corrSx2: 120, corrSy2: 0, corrTau2: 70,
      corrBf: 700, corrBw: 650, corrTf: 14, corrTw: 13, corrPhi: 60,
      corrL: 9, corrSigmaAv: 95, corrStool: 'No',

      /* --- Sec 5 [2.2.6] curved panels --- */
      curvR: 0, curvT: 0, curvD: 0, curvSax: 120, curvStg: 80, curvTau: 45,

      /* --- Sec 5 [2.4] openings --- */
      opConfig: '(a) without edge reinforcement', opModelled: 'No', opMethod: 'Method B',
      opCase17: 'No', opA1: 0, opB1: 0, opTw1: 0, opSav1: 0, opTav1: 0,
      opA2: 0, opB2: 0, opTw2: 0, opSav2: 0, opTav2: 0, opDa: 0, opDb: 0, opH: 0, opH0: 0
    };
  }

  /* Sec 3 [1.1.3] wants the check repeated for every design load set and
     dynamic load case. These are the quantities that change between them —
     geometry, material and the modelling options do not. */
  var CASE_KEYS = ['sx', 'sy', 'tau', 'psix', 'psiy', 'P', 'MCL'];

  function loadCase(name, base) {
    var c = { name: name };
    CASE_KEYS.forEach(function (k) { c[k] = base[k]; });
    return c;
  }

  var CASE_FIELDS = [
    { k: 'name', label: 'Load set', t: 'text' },
    { k: 'sx', label: 'sig_x', unit: 'N/mm2' }, { k: 'sy', label: 'sig_y', unit: 'N/mm2' },
    { k: 'tau', label: 'tau', unit: 'N/mm2' },
    { k: 'psix', label: 'psi_x' }, { k: 'psiy', label: 'psi_y' },
    { k: 'P', label: 'P', unit: 'kN/m2' }, { k: 'MCL', label: 'MCL', unit: 'kN.m' }
  ];

  /* A batch row carries only what varies panel to panel; everything else is
     inherited from the main input set at solve time. */
  function batchRow(i, base) {
    return {
      name: 'Panel ' + i, location: '',
      a: base.a, b: base.b, tp: base.tp, s: base.s, l: base.l,
      profile: base.profile, hw: base.hw, tw: base.tw, bf: base.bf, tf: base.tf,
      sx: base.sx, sy: base.sy, tau: base.tau, psix: base.psix, psiy: base.psiy,
      ReHP: base.ReHP, ReHS: base.ReHS, P: base.P, MCL: base.MCL
    };
  }

  /* Column spec for the batch table. k / t / unit / opts match the names the
     batch view and the exporters read. */
  var BATCH_FIELDS = [
    { k: 'name', label: 'Panel', t: 'text' },
    { k: 'location', label: 'Location', t: 'text' },
    { k: 'a', label: 'a', unit: 'mm' }, { k: 'b', label: 'b', unit: 'mm' },
    { k: 'tp', label: 'tp', unit: 'mm' }, { k: 's', label: 's', unit: 'mm' },
    { k: 'l', label: 'l', unit: 'mm' },
    { k: 'profile', label: 'Profile', t: 'select', opts: ['Flat bar', 'Bulb', 'Angle', 'T-bar', 'L2'] },
    { k: 'hw', label: 'hw', unit: 'mm' }, { k: 'tw', label: 'tw', unit: 'mm' },
    { k: 'bf', label: 'bf', unit: 'mm' }, { k: 'tf', label: 'tf', unit: 'mm' },
    { k: 'sx', label: 'sig_x', unit: 'N/mm2' }, { k: 'sy', label: 'sig_y', unit: 'N/mm2' },
    { k: 'tau', label: 'tau', unit: 'N/mm2' },
    { k: 'psix', label: 'psi_x' }, { k: 'psiy', label: 'psi_y' },
    { k: 'ReHP', label: 'ReH_P', unit: 'N/mm2' }, { k: 'ReHS', label: 'ReH_S', unit: 'N/mm2' },
    { k: 'P', label: 'P', unit: 'kN/m2' }, { k: 'MCL', label: 'MCL', unit: 'kN.m' }
  ];

  return {
    OPTIONS: OPTIONS, defaults: defaults, batchRow: batchRow, BATCH_FIELDS: BATCH_FIELDS,
    CASE_KEYS: CASE_KEYS, CASE_FIELDS: CASE_FIELDS, loadCase: loadCase
  };
})();
