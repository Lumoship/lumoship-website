/* ============================================================================
   Field catalogue. Every input is declared once, with its unit and the rule
   clause behind it, and the forms are generated from these declarations. That
   keeps the wording of a symbol identical wherever it appears — form label,
   trace row, PDF — and means a rule reference is never more than a hover away.
   ============================================================================ */

window.NRFIELDS = (function () {
  'use strict';

  function num(k, l, u, h, step) { return { k: k, l: l, u: u, h: h, t: 'num', step: step || 'any' }; }
  function sel(k, l, o, h) { return { k: k, l: l, o: o, h: h, t: 'select' }; }
  function txt(k, l, h) { return { k: k, l: l, h: h, t: 'text' }; }

  /* ---------------------------------------------------------------- page 1 */
  var PROJECT = [
    txt('vessel', 'Vessel / structure', 'Free text — appears on the exported report.'),
    txt('rules', 'Applicable Rules', 'The Rules invoking NR615 (e.g. NR467 Pt B). They define eta_all, not NR615 — Sec 1 [2.3.1].'),
    txt('preparedBy', 'Prepared by', 'Free text.'),
    txt('revision', 'Revision', 'Free text.')
  ];

  var CONTROL = [
    sel('method', 'Method', 'method', 'Assessment method. App 2 Tab 1 selects it by structural member — Sec 1 [2.1.3]. B variants take c1 = 1.'),
    sel('analysis', 'Analysis', 'analysis', 'Prescriptive (Sec 3) or direct strength / FE (Sec 4). Switches the effective-width route and the Sec 5 [2.3.5] Poisson correction.'),
    sel('profile', 'Stiffener profile', 'profile', 'Bulb bars are idealised as equivalent angle bars — Sec 5 [2.3.2]. Enter the equivalent dimensions.'),
    sel('edgeFixity', 'Edge fixity', 'edgeFixity', 'Drives Flong — Sec 5 Tab 3. An unstiffened panel, or one not fixed at both ends, gives Flong = 1.0.'),
    sel('stiffEnds', 'Stiffener end continuity', 'stiffEnds', 'Continuous gives M2 = 0 and the 24e3 divisor; sniped ends change both — Sec 5 [2.3.3].'),
    sel('pressureSide', 'Pressure side', 'pressureSide', 'Opposite to the stiffener: C_PI = +1, C_SI = -1. Same side reverses both — Sec 5 [2.3.3].'),
    num('etaAll', 'eta_all', '—', 'Allowable buckling utilisation. NOT defined by NR615 — it comes from the applicable Rules, Sec 1 [2.3.1].', '0.05'),
    num('S', 'S — partial safety factor', '—', '1.00 general · 1.10 local concentrated loads · 1.15 bulk carrier over 150 m.', '0.05')
  ];

  var MATERIAL = [
    num('E', 'E', 'N/mm2', 'Young modulus of the material.'),
    num('nu', 'nu', '—', 'Poisson ratio.', '0.01'),
    num('ReHP', 'ReH_P', 'N/mm2', 'Yield of the plate. With mixed materials use the minimum — Sec 3 [1.2.3].'),
    num('ReHS', 'ReH_S', 'N/mm2', 'Yield of the stiffener.')
  ];

  /* ---------------------------------------------------------------- page 2 */
  var PLATE = [
    num('a', 'a — longer side', 'mm', 'Longer side of the plate panel, normally the stiffener span. Tab 4 requires a >= b.'),
    num('b', 'b — shorter side', 'mm', 'Shorter side. Equals the stiffener spacing for longitudinal stiffening.'),
    num('tp', 'tp', 'mm', 'Plate thickness as entered — net or gross per the basis below, Sec 1 [1.2.2].'),
    num('s', 's — stiffener spacing', 'mm', 'For a U-type stiffener the spacing used in the formulae becomes b1 + b2 — Sec 5 [2.1.2].'),
    num('l', 'l — stiffener span', 'mm', 'Spacing between primary supporting members.')
  ];

  var BASIS = [
    sel('thickBasis', 'Thickness basis', 'thickBasis', 'NR615 works on NET scantlings — Sec 1 [1.2.2]. Choose gross to have the corrosion additions deducted here.'),
    num('tcP', 'tc — plate', 'mm', 'Corrosion addition for the plate, applied only on the gross basis. From the applicable Rules.'),
    num('tcS', 'tc — stiffener', 'mm', 'Corrosion addition for the stiffener web and flange, applied only on the gross basis.')
  ];

  var STIFF = [
    num('hw', 'hw — web depth', 'mm', 'Sec 5 Fig 1. For a U-type this is the web breadth of Fig 2.'),
    num('tw', 'tw — web thickness', 'mm', 'As entered — net or gross per the basis.'),
    num('bf', 'bf — flange breadth', 'mm', 'Total flange breadth. Flat bar: enter 0.'),
    num('tf', 'tf — flange thickness', 'mm', 'Flat bar: enter 0.'),
    num('df', 'df — L2 flange extension', 'mm', 'df = 0 for bulb and angle — Sec 5 Tab 6 Note 2.'),
    sel('flangeType', 'Flange type', 'flangeType', 'Drives bf_out: symmetric gives bf/2, one-sided gives bf — Sec 2 Fig 1.'),
    num('bfOutManual', 'bf_out (manual)', 'mm', 'Used only when the flange type is Manual. Maximum distance from the web mid-thickness to the flange edge.'),
    num('b1u', 'b1 — U-type', 'mm', 'U-type plate width — Sec 5 Fig 2. Leave 0 for other profiles.'),
    num('b2u', 'b2 — U-type', 'mm', 'U-type plate width — Sec 5 Fig 2.')
  ];

  /* ---------------------------------------------------------------- page 3 */
  var STRESS = [
    num('sx', 'sigma_x', 'N/mm2', 'Parallel to the long edge. Prescriptive: hull girder stress, Sec 3 [2.1.1]. FE: reference stress, App 1 [2.1.1]. COMPRESSION POSITIVE.'),
    num('sy', 'sigma_y', 'N/mm2', 'Perpendicular to the long edge. Prescriptive longitudinal stiffening: 0 — Sec 3 [2.1.1].'),
    num('tau', 'tau', 'N/mm2', 'Hull girder or FE reference shear stress — Sec 5 [2.2.7].'),
    num('psix', 'psi_x', '—', 'Edge stress ratio sigma_2/sigma_1. Uniform stress gives 1.0. Under FE, App 1 gives psi_x = 1.0.'),
    num('psiy', 'psi_y', '—', 'Edge stress ratio in the transverse direction — App 1 [2.1.2] linear extrapolation.')
  ];

  var LATERAL = [
    num('P', 'P — lateral pressure', 'kN/m2', 'Prescriptive: design load set pressure at the stiffener LCP. FE: the average pressure Pavr of Sec 4 [2.5.2].'),
    num('MCL', 'MCL', 'kN.m', 'Maximum bending moment from a concentrated load between l/3 and 2l/3 of the span — Sec 5 [2.3.3]. Enter 0 if none.'),
    num('Ftran', 'Ftran', '—', '1.00 general · 1.25 / 1.33 / 1.15 for transversely framed single-side-skin ships — Sec 5 [2.2.5]. Not an FE quantity.')
  ];

  var CASES = [
    sel('caseX', 'Tab 4 case — longitudinal', 'caseX', 'Case 1 is the simply supported default of Sec 5 [2.2.3]. Any other case is subject to the agreement of the Society.'),
    sel('caseY', 'Tab 4 case — transverse', 'caseY', 'Case 2 is the default.'),
    sel('caseT', 'Tab 4 case — shear', 'caseT', 'Case 15 is the default.'),
    sel('upModel', 'UP model for cases 3-8', 'upModel', 'Cases 3-8 carry two reduction curves. UP-A gives 0.75/lambda above 0.75; UP-B gives 1/(lambda^2 + 0.51) above 0.7.'),
    num('openDa', 'Opening d_a/a (case 17)', '—', 'Case 17 only. Opening dimension along a, as a fraction, capped at 0.7.', '0.05'),
    num('openDb', 'Opening d_b/b (case 17)', '—', 'Case 17 only. Opening dimension along b, as a fraction, capped at 0.7.', '0.05')
  ];

  var ARRANGE = [
    sel('stiffArr', 'Stiffening arrangement', 'stiffArr', 'Drives the Sec 3 [2.1.1] prescriptive stress combination and the Sec 2 [2.1.1] sigma_ct cap.'),
    sel('endRestraint', 'Stiffener end restraint', 'endRestraint', 'ROTATIONAL restraint — sets l_eff and so the effective width chi_s, Sec 5 [2.3.4]. Independent of the end continuity above.'),
    sel('panelLocation', 'Panel location', 'panelLocation', 'A vertically stiffened single-side-skin bulk carrier side shell takes L_B1 = 0.8 l — Sec 5 [2.1.2].'),
    sel('applyCtCap', 'Apply sigma_ct cap', 'applyCtCap', 'Sec 2 [2.1.1] caps sigma_ct at the applied compressive stress on the small side of the panel when that is known.'),
    num('syStiffPlating', 'sigma_y at stiffener plating', 'N/mm2', 'TRANSVERSE arrangement only — the transverse stress at the stiffener attached-plating LCP, Sec 5 [2.2.7]. Leave 0 to reuse the EPP value.'),
    num('cUtype', 'c (U-type, Tab 3)', '—', 'Tab 3 does not tabulate c for a U profile; the value is subject to the agreement of the Society.', '0.05'),
    sel('brackets', 'Tripping brackets on stiffener', 'brackets', 'When brackets are fitted, l_tor is the maximum spacing between adjacent PSM and fitted brackets — Sec 5 [2.3.3].'),
    num('bracketSpacing', 'Bracket spacing', 'mm', 'Used only when brackets are fitted. Leave 0 to keep l_tor = l.'),
    num('beffB1', 'b1 (EPP side 1)', 'mm', 'Prescriptive only — width of the plate panel on one side of the stiffener. Leave 0 to use b on both sides.'),
    num('beffB2', 'b2 (EPP side 2)', 'mm', 'Prescriptive only — width on the other side. Leave 0 to use b on both sides.'),
    num('nMax', 'Half-wave sweep limit n', '—', 'gamma_GEB,bi is minimised over n = 1..this. The workbook stopped at 30; raise it if the minimum reaches the end.', '1'),
    num('mTorMax', 'Torsional sweep limit m', '—', 'sigma_ET is minimised over m_tor = 1..this. The workbook stopped at 10.', '1')
  ];

  /* ---------------------------------------------------------------- page 4 */
  var SLEN_PSM = [
    num('lBdg', 'l_bdg', 'm', 'Effective bending span of the deck transverse PSM, from the applicable Rules — Sec 2 [4.1.1].'),
    num('sPsm', 'S — PSM spacing', 'm', 'Spacing of deck transverse PSM.'),
    num('iPsm', 'I_psm-n50 offered', 'cm4', 'Offered net inertia of the PSM with effective attached plating 0.8 S.')
  ];
  var SLEN_WS = [
    sel('wsArrangement', 'Web stiffener arrangement', 'wsArrangement', 'A: along the PSM span. B: normal to it — Sec 2 Tab 1.'),
    num('lWs', 'l_ws', 'm', 'Length of the web stiffener — Sec 2 Tab 1 Note 1.'),
    num('sWs', 's_ws', 'mm', 'Web stiffener spacing — arrangement B only.'),
    num('twPsm', 'tw_psm', 'mm', 'PSM web net thickness — arrangement B only.'),
    num('aEffWs', 'A_eff,ws', 'cm2', 'Net sectional area of the web stiffener including effective attached plating — Sec 2 Tab 1 Note 2.'),
    num('iWs', 'I_st offered', 'cm4', 'Offered net inertia of the web stiffener with effective attached plating.')
  ];
  var SLEN_BR = [
    sel('bracketsApplicable', 'Bracket block applicable?', 'bracketsApplicable', 'Set No when the bracket entries are indicative rather than the assessed structure; the four bracket rows then report n/a.'),
    num('bfPsm', 'bf_psm', 'mm', 'Flange breadth of the primary supporting member — Sec 2 [5.1.1].'),
    num('afPsm', 'Af-n50', 'cm2', 'Net cross-sectional area of the PSM flange.'),
    num('awPsm', 'Aw-n50', 'cm2', 'Net cross-sectional area of the PSM web plate.'),
    num('db', 'db — bracket depth', 'mm', 'Sec 2 Tab 2.'),
    num('lb', 'l_b — bracket edge', 'mm', 'Effective length of the bracket edge — Sec 2 Tab 2.'),
    num('tb', 'tb', 'mm', 'Net web thickness of the bracket — Sec 2 [5.1.2].'),
    num('sbActual', 'Sb as fitted', 'm', 'Tripping bracket spacing as fitted — Sec 2 [5.1.1].'),
    num('hwEdge', 'hw edge stiffener', 'mm', 'Edge stiffener web depth as fitted — Sec 2 [5.3.1]. Enter 0 if none.'),
    sel('flangeSym', 'Flange symmetry', 'flangeSym', 'C = 0.022 symmetrical · 0.033 asymmetrical — Sec 2 [5.1.1].'),
    sel('bracketLocation', 'Location', 'bracketLocation', 'Sb_min = 3.0 m at tank/hold boundaries and the hull envelope, 4.0 m elsewhere.'),
    sel('bracketType', 'Bracket type', 'bracketType', 'Edge reinforcement coefficient C: 75 end bracket, 50 tripping bracket — Sec 2 [5.3.1].'),
    sel('edgeStiffFitted', 'Edge stiffener fitted?', 'edgeStiffFitted', 'Drives the Sec 2 Tab 2 coefficient: fitted gives C = 70, not fitted gives C = 20(db/lb) + 16.')
  ];

  var PILLAR = [
    num('pillarA', 'A', 'cm2', 'Net cross-sectional area of the member — Sec 5 [3.1.2].'),
    num('pillarI', 'I', 'cm4', 'Net moment of inertia about the weakest axis.'),
    num('pillarL', 'l_pill', 'm', 'Pillars and struts: unsupported length. Cross ties per Sec 5 [3.1.2].'),
    sel('pillarEnd', 'End constraint', 'pillarEnd', 'f_end = 1.0 both simply supported · 2.0 one fixed or cross tie · 4.0 both fixed.'),
    num('pillarSigma', 'sigma_av', 'N/mm2', 'Average axial compressive stress in the member — Sec 5 [3.1.1].'),
    num('pillarSigmaET', 'sigma_ET', 'N/mm2', 'Elastic torsional buckling of open cross-sections — Sec 5 [3.1.3]. Enter 0 for closed sections.'),
    num('pillarSigmaETF', 'sigma_ETF', 'N/mm2', 'Torsional / column interaction when the centroid and shear centre do not coincide — Sec 5 [3.1.4]. Enter 0 otherwise.'),
    num('pillarR', 'r — circular pillar', 'mm', 'Mid-thickness radius of a circular pillar — Sec 2 [6.1.3]. Enter 0 if not applicable.'),
    num('pillarT', 't offered', 'mm', 'Net thickness of the circular pillar as fitted.')
  ];

  var CORR_LOCAL = [
    num('corrB1', 'b_corr — comb 1', 'mm', 'Width of the corrugation member assessed, flange or web — Sec 4 [3.2.3].'),
    num('corrT1', 't_corr — comb 1', 'mm', 'Net thickness. Check each thickness range separately — Sec 4 [3.2.4].'),
    num('corrSx1', 'sigma_x — comb 1', 'N/mm2', 'Normal stress parallel to the corrugation, at its maximum.'),
    num('corrSy1', 'sigma_y — comb 1', 'N/mm2', 'Coexisting normal stress perpendicular to the corrugation — Sec 4 [3.4.1].'),
    num('corrTau1', 'tau — comb 1', 'N/mm2', 'Shear stress where sigma_x is maximum.'),
    num('corrB2', 'b_corr — comb 2', 'mm', 'Second stress combination: geometry as above.'),
    num('corrT2', 't_corr — comb 2', 'mm', ''),
    num('corrSx2', 'sigma_x — comb 2', 'N/mm2', 'Value of sigma_x where tau is maximum.'),
    num('corrSy2', 'sigma_y — comb 2', 'N/mm2', ''),
    num('corrTau2', 'tau — comb 2', 'N/mm2', 'Shear stress at its maximum.')
  ];

  var CORR_COL = [
    num('corrBf', 'b_flange', 'mm', 'Corrugation flange breadth — Sec 4 Fig 3.'),
    num('corrBw', 'b_web', 'mm', 'Corrugation web breadth, the sloping member.'),
    num('corrTf', 't_flange', 'mm', 'Net flange thickness.'),
    num('corrTw', 't_web', 'mm', 'Net web thickness.'),
    num('corrPhi', 'phi', 'deg', 'Angle between the web and the flange plane.'),
    num('corrL', 'l_corr', 'm', 'Corrugation length — the unsupported length of the unit, Sec 4 [3.3.2].'),
    num('corrSigmaAv', 'sigma_av', 'N/mm2', 'Average axial compressive stress in the corrugation unit.'),
    sel('corrStool', 'Stool wider than 2x depth?', 'corrStool', 'Sec 4 [3.3.3]: pinned ends in general (f_end = 1); fixed (f_end = 4) with such a stool.')
  ];

  var CURVED = [
    num('curvR', 'R', 'mm', 'Radius of the curved plate panel. Leave 0 to disable the check.'),
    num('curvT', 'tp', 'mm', 'Net thickness of the curved panel.'),
    num('curvD', 'd', 'mm', 'Length of the side parallel to the cylinder axis, as shown in Tab 5.'),
    num('curvSax', 'sigma_ax', 'N/mm2', 'Axial stress applied to the cylinder. Tensile values are entered as 0 — Sec 5 [2.2.6].'),
    num('curvStg', 'sigma_tg', 'N/mm2', 'Tangential stress. Tensile values are entered as 0.'),
    num('curvTau', 'tau', 'N/mm2', 'Shear stress applied to the curved panel.')
  ];

  var OPENINGS_CFG = [
    sel('opConfig', 'Configuration', 'opConfig', 'Tab 7. Configuration (c), a hole in the web, is run as P1/P2 under (a) and P3 under (b).'),
    sel('opModelled', 'Opening modelled in PSM', 'opModelled', 'Whether the opening is represented in the FE model. Drives which Tab 7 shear column applies.'),
    sel('opMethod', 'Method', 'opMethod', 'Tab 7 Note 2. Method A where the long edges cannot pull in; Method B where they can.'),
    sel('opCase17', 'Case 17 applicable?', 'opCase17', 'Relevant only when the opening is not modelled and the configuration is (a).'),
    num('opH', 'h — web height', 'mm', 'Height of the PSM web in way of the opening — Sec 5 Tab 7.'),
    num('opH0', 'h0 — opening height', 'mm', 'Height of the opening measured in the depth of the web.'),
    num('opDa', 'da', 'mm', 'Case 17 opening dimension along the panel long side a.'),
    num('opDb', 'db', 'mm', 'Case 17 opening dimension along the short side b.')
  ];
  var OPENINGS_P1 = [
    num('opA1', 'a — P1', 'mm', 'Longer side of the web panel adjacent to the opening. Leave 0 to disable.'),
    num('opB1', 'b — P1', 'mm', 'Shorter side of the web panel.'),
    num('opTw1', 'tw — P1', 'mm', 'Net web thickness of the primary supporting member.'),
    num('opSav1', 'sigma_av — P1', 'N/mm2', 'Weighted average compressive stress in the web plate area considered — Sec 5 [2.4.1].'),
    num('opTav1', 'tau_av — P1', 'N/mm2', 'Weighted average shear stress. When the opening is not modelled, Tab 7 scales it by h/(h - h0).')
  ];
  var OPENINGS_P2 = [
    num('opA2', 'a — P2', 'mm', 'Longer side of the second web panel. Leave 0 to disable.'),
    num('opB2', 'b — P2', 'mm', ''),
    num('opTw2', 'tw — P2', 'mm', ''),
    num('opSav2', 'sigma_av — P2', 'N/mm2', ''),
    num('opTav2', 'tau_av — P2', 'N/mm2', '')
  ];

  return {
    PROJECT: PROJECT, CONTROL: CONTROL, MATERIAL: MATERIAL,
    PLATE: PLATE, BASIS: BASIS, STIFF: STIFF,
    STRESS: STRESS, LATERAL: LATERAL, CASES: CASES, ARRANGE: ARRANGE,
    SLEN_PSM: SLEN_PSM, SLEN_WS: SLEN_WS, SLEN_BR: SLEN_BR,
    PILLAR: PILLAR, CORR_LOCAL: CORR_LOCAL, CORR_COL: CORR_COL,
    CURVED: CURVED, OPENINGS_CFG: OPENINGS_CFG, OPENINGS_P1: OPENINGS_P1, OPENINGS_P2: OPENINGS_P2
  };
})();
