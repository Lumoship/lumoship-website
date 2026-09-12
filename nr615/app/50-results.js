/* ============================================================================
   Results page. Each buckling mode gets one card: verdict on the face, the
   full derivation behind it. The trace is the whole chain from the rule
   symbols down to gamma_c, so a result can be checked without opening the
   rule book beside it.
   ============================================================================ */

window.RESULTS = (function () {
  'use strict';

  /* Delegate rather than capture: the exporters call the tracers directly,
     without going through html(), so these have to be live at any time. */
  function esc(s) { return UI.esc(s); }
  function fmt(v, dp) { return UI.fmt(v, dp); }
  function band(v, a) { return UI.band(v, a); }

  function h(sym, val, unit, ref, cls) {
    return '<tr><td class="sym">' + esc(sym) + '</td><td class="val' + (cls ? ' ' + cls : '') + '">'
      + (typeof val === 'string' ? esc(val) : fmt(val)) + '</td><td class="unit">' + esc(unit || '')
      + '</td><td class="ref">' + esc(ref || '') + '</td></tr>';
  }
  function head(t) { return '<tr class="head"><td colspan="4">' + esc(t) + '</td></tr>'; }
  function table(body) { return '<table class="nr-trace">' + body + '</table>'; }

  /* ------------------------------------------------------------- traces */
  function tracePlate(R) {
    var P = R.plate, C = R.coef;
    return table(
      head('Reference stresses and slenderness · Sec 5 [2.2.2]')
      + h('alpha = a/b', C.alpha, '—', 'Aspect ratio · Sec 5 Symbols')
      + h('beta_p', C.betaP, '—', '(b/tp) sqrt(ReH_P/E) · Tab 1 Note 1')
      + h('sigma_E', C.sigmaE, 'N/mm2', 'pi^2 E /(12(1-nu^2)) (tp/b)^2')
      + h('c1', C.c1, '—', 'Tab 2 · ' + (R.inp.method.indexOf('B') > 0 ? 'B model: 1' : 'max(0, 1 - 1/alpha)'))
      + h('Flong', C.Flong, '—', 'Tab 3 · edge fixity ' + R.inp.edgeFixity)
      + h('Ftran', C.Ftran, '—', 'Sec 5 [2.2.5]')
      + head('Longitudinal · Tab 4 ' + R.inp.caseX)
      + h('Kx', P.Kx, '—', 'Buckling factor')
      + h('lambda_x', P.lam_x, '—', 'sqrt(ReH_P/(Kx sigma_E))')
      + h('c', P.c, '—', 'min(1.25 ; 1.25 - 0.12 psi_x)')
      + h('lambda_c', P.lamC, '—', 'c/2 (1 + sqrt(1 - 0.88/c))')
      + h('Cx', P.Cx, '—', 'Reduction factor · Sec 5 [2.2.3]')
      + head('Transverse · Tab 4 ' + R.inp.caseY)
      + h('f1', P.f1, '—', 'Tab 4 Case 2 auxiliary')
      + h('f2', P.f2, '—', 'Tab 4 Case 2 auxiliary')
      + h('f3', P.f3, '—', 'Tab 4 Case 2 auxiliary')
      + h('Ky', P.Ky, '—', 'Buckling factor')
      + h('lambda_y', P.lam_y, '—', 'sqrt(ReH_P/(Ky sigma_E))')
      + h('R', P.R, '—', 'Tab 4 Case 2 · reduction term')
      + h('F', P.F, '—', 'max(0, (1 - (Ky/0.91 - 1)/lambda_p^2) c1)')
      + h('H', P.H, '—', 'max(R ; lambda - 2 lambda/(c(T + sqrt(T^2 - 4))))')
      + h('Cy', P.Cy, '—', 'Reduction factor')
      + head('Shear · Tab 4 ' + R.inp.caseT)
      + h('K_tau', P.Ktau, '—', 'Buckling factor')
      + h('lambda_tau', P.lam_t, '—', 'sqrt(ReH_P/(K_tau sigma_E))')
      + h('C_tau', P.Ctau, '—', 'lambda <= 0.84 : 1, else 0.84/lambda')
      + head('Ultimate buckling stresses · Sec 5 [2.2.3]')
      + h("sigma_cx'", P.scx, 'N/mm2', 'Cx ReH_P')
      + h("sigma_cy'", P.scy, 'N/mm2', 'Cy ReH_P')
      + h("tau_c'", P.tc, 'N/mm2', 'C_tau ReH_P / sqrt(3)')
      + head('Limit state · Sec 5 [2.2.1]')
      + h('B', P.B, '—', P.tensile ? 'Tab 1 · a stress is tensile, so B = 1.0' : 'Tab 1 · 0.7 - 0.3 beta_p/alpha^2')
      + h('e0', P.e0, '—', P.tensile ? 'Tab 1 · a stress is tensile, so e0 = 2.0' : 'Tab 1 · 2/beta_p^0.25')
      + h('gamma_c1 (combined)', P.gc1 >= 999 ? 'not reached' : P.gc1, '—', 'Interaction with the Omega cross term')
      + h('gamma_c2 (x + shear)', P.gc2 >= 999 ? 'not reached' : P.gc2, '—', 'Considered only when sigma_x >= 0')
      + h('gamma_c3 (y + shear)', P.gc3 >= 999 ? 'not reached' : P.gc3, '—', 'Considered only when sigma_y >= 0')
      + h('gamma_c4 (pure shear)', P.gc4 >= 999 ? 'not reached' : P.gc4, '—', 'tau only')
      + h('gamma_c', P.gamma, '—', 'min of the four · governing: ' + P.gov)
      + h('eta_Plate', P.eta, '—', '1 / gamma_c · Sec 1 [2.2.2]', bandCls(P.eta, R.env.etaAll))
      + head('Effective widths · Sec 5 [2.3.4]')
      + h('chi_s', C.chi_s, '—', 'from l_eff/s · end restraint ' + R.inp.endRestraint)
      + h('beff1', P.beff1, 'mm', R.inp.analysis === 'Prescriptive'
        ? 'Mean of Cx b over the two EPP sides · Sec 5 Symbols' : 'Cx b · FE route')
      + h('beff', P.beff, 'mm', 'min(Cx b ; chi_s s)')
    );
  }

  function tracePanel(R) {
    var A = R.panel;
    return table(
      head('Loads per unit length · Sec 5 [2.1.2]')
      + h('c', A.c, '—', 'psi_y >= 0 : 0.5(1 + psi_y), else 1/(2(1 - psi_y))')
      + h('sigma_x,av', A.sxav, 'N/mm2', 'Poisson-corrected when both stresses are compressive')
      + h('sigma_y used', A.syUsed, 'N/mm2', R.inp.stiffArr === 'Transverse'
        ? 'Sec 5 [2.2.7] stiffener attached-plating value' : 'EPP value')
      + h('Nx', A.Nx, 'N/mm', 'sigma_x,av (Ap + As_eff)/s')
      + h('Ny', A.Ny, 'N/mm', 'c sigma_y tp')
      + h('Nxy', A.Nxy, 'N/mm', '|tau| tp')
      + h('L_B1', A.LB1, 'mm', R.inp.panelLocation === 'General' ? 'Stiffener span l' : '0.8 l · SSS bulk carrier side shell')
      + h('L_B2', A.LB2, 'mm', '6 s')
      + head('Bending stiffness · Sec 5 [2.1.2]')
      + h('D11', A.D11, 'N.mm', 'E I_eff 1e4 / s')
      + h('D12', A.D12, 'N.mm', R.inp.profile === 'U-type' ? 'nu D22 · U-type' : 'E tp^3 nu /(12(1-nu^2))')
      + h('D22', A.D22, 'N.mm', R.inp.profile === 'U-type' ? 'U-type form with the b1/hw and tw/tp caps' : 'E tp^3 /(12(1-nu^2))')
      + h('D33', A.D33, 'N.mm', 'E tp^3 /(12(1+nu))')
      + head('Elastic capacity · Sec 5 [2.1.2] to [2.1.4]')
      + h('gamma_GEB,bi', A.gBi >= 999 ? 'no biaxial demand' : A.gBi, '—', 'minimised over n = 1..' + A.nMax)
      + h('governing n', A.nGov || '—', '—', 'Half-waves across the panel'
        + (A.nGov >= A.nMax ? ' — the minimum reached the end of the sweep' : ''),
        A.nGov >= A.nMax ? 'flag' : '')
      + h('gamma_GEB,tau', A.gTau >= 999 ? 'no shear demand' : A.gTau, '—', 'Sec 5 [2.1.3]')
      + h('gamma_GEB,bi+tau', A.gBiTau >= 999 ? 'n/a' : A.gBiTau, '—', 'Sec 5 [2.1.4] combined')
      + h('gamma_GEB', A.gGEB >= 999 ? 'no demand' : A.gGEB, '—', 'Governing elastic capacity')
      + h('eta_Overall', A.eta, '—', '1 / gamma_GEB', bandCls(A.eta, R.env.etaAll))
    );
  }

  function traceStiff(R, mode) {
    var T = R.stiff, M = mode === 'SI' ? T.SI : T.PI;
    var body = head('Section properties · Sec 5 [2.3.3]')
      + h('A_tot', T.A_tot, 'mm2', 'beff tp + As_eff')
      + h('w_na', T.w_na, 'mm', 'Plate mid-plane to the neutral axis')
      + h('I_eff', T.I_eff, 'cm4', 'About the combined neutral axis')
      + h('Z_' + mode, mode === 'SI' ? T.Z_SI : T.Z_PI, 'cm3',
        mode === 'SI' ? 'At the top of the stiffener flange' : 'At the attached plating')
      + head('Torsional buckling · Tab 6')
      + h('I_P', T.I_P, 'cm4', 'Polar moment about the plate connection')
      + h('I_T', T.I_T, 'cm4', 'Saint Venant moment of inertia')
      + h('I_w', T.I_w, 'cm6', 'Sectorial moment of inertia')
      + h('epsilon', T.eps, 'mm2', 'Degree of fixation')
      + h('l_tor', T.l_tor, 'mm', R.inp.brackets === 'Fitted'
        ? 'Limited by the fitted tripping brackets' : 'Full stiffener span')
      + h('m_tor', T.m_tor, '—', 'Half-waves giving the smallest sigma_ET, swept 1..' + T.mMax,
        T.m_tor >= T.mMax ? 'flag' : '')
      + h('sigma_ET', T.sET, 'N/mm2', 'Governing torsional reference stress')
      + h('Phi_0', T.Phi0, '—', 'l_tor /(m_tor hw) 1e-4')
      + h('y_w', T.y_w, 'mm', 'Centroid to the free flange edge')
      + head('Global slenderness · Sec 5 [2.3.3]')
      + h('sigma_x,av', T.sxav, 'N/mm2', 'Poisson-corrected axial stress')
      + h('gamma_ReH', T.gReH, '—', 'min(ReH_P, ReH_S)/sqrt(sx^2 + sy^2 - sx sy + 3 tau^2)')
      + h('gamma_GEB', R.panel.gGEB >= 999 ? 'no demand' : R.panel.gGEB, '—', 'From the overall panel capacity')
      + h('lambda_G', T.lamG, '—', 'sqrt(gamma_ReH / gamma_GEB)')
      + h('C_sl', T.C_sl, '—', 'lambda_G <= 1.56 : 1 - lambda_G^4/12, else 3/lambda_G^4')
      + h('F_E', T.F_E, 'N', '(pi/l)^2 E I_eff 1e4')
      + head('Stress components at the converged gamma');

    if (M.na) {
      body += h('Precondition', 'FAILED', '—', M.reason, 'bad')
        + h('Result', 'CHECK', '—', 'The section is too slender for the applied stress; revise the scantlings.', 'bad');
      return table(body);
    }
    body += h('sigma_x1', T.sx1, 'N/mm2', R.inp.analysis === 'FE'
      ? 'Sec 5 [2.3.5] corrected stress' : 'Prescriptive: passed through unchanged')
      + h('sigma_a', T.sigma_a, 'N/mm2', 'sigma_x1 (s tp + As_eff)/(beff1 tp + As_eff)')
      + h('M0', M.M0, 'N.mm', 'F_E C_sl gamma/(gamma_GEB - gamma) w0')
      + h('M1', M.M1, 'N.mm', 'Lateral pressure and concentrated load')
      + h('M2', M.M2, 'N.mm', R.inp.stiffEnds === 'Continuous' ? 'Zero — the stiffener is continuous' : 'Snipe term')
      + h('sigma_b', M.sb, 'N/mm2', '(M0 + M1 + M2)/(1000 Z)')
      + h('sigma_w', M.sw, 'N/mm2', mode === 'PI' ? 'Zero for plate induced failure'
        : (R.inp.profile === 'U-type' ? 'Zero for U-type · Sec 5 [2.5.2]' : 'Warping stress at the converged gamma'))
      + h('sa + sb + sw', M.sum, 'N/mm2', 'The interaction applies only where this is positive')
      + head('Solution · Sec 5 [1.1.3] bisection')
      + h('ReH', M.ReH, 'N/mm2', mode === 'SI' ? 'ReH_S · stiffener induced' : 'ReH_P · plate induced')
      + h('bracket upper bound', M.pole, '—', mode === 'SI'
        ? 'min(gamma_GEB ; sigma_ET/sigma_a)' : 'gamma_GEB')
      + h('converged', M.converged ? 'OK' : 'NOT CONVERGED', '—',
        'Width of the final bracket', M.converged ? 'good' : 'flag')
      + h('gamma_c', M.gamma >= 999 ? 'never reached' : M.gamma, '—',
        'gamma (sa + sb + sw) S / ReH = 1')
      + h('eta', M.eta, '—', '1 / gamma_c', bandCls(M.eta, R.env.etaAll));
    return table(body);
  }

  function tracePillar(R) {
    var P = R.pillar;
    if (!P.active) return '<div class="nr-hint">Enter A, I and the length on the Extras page to activate this check.</div>';
    return table(
      head('Column buckling · Sec 5 [3.1]')
      + h('f_end', P.fEnd, '—', 'End constraint: ' + R.inp.pillarEnd)
      + h('sigma_EC', P.sEC, 'N/mm2', 'pi^2 E f_end I /(A l^2) 1e-4 · Sec 5 [3.1.2]')
      + h('sigma_E used', P.sE, 'N/mm2', 'min of the column, torsional and torsional-flexural values')
      + h('sigma_cr', P.scr, 'N/mm2', 'sigma_E <= 0.5 ReH : sigma_E, else (1 - ReH/(4 sigma_E)) ReH')
      + h('eta', P.eta, '—', 'sigma_av / sigma_cr · Sec 5 [3.1.1]', bandCls(P.eta, R.env.etaAll))
      + (P.circActive ? head('Circular pillar · Sec 2 [6.1.3]')
        + h('t required', P.tReq, 'mm', 'r / 50')
        + h('t offered', P.tOff, 'mm', P.circStatus, P.circStatus === 'PASS' ? 'good' : 'bad') : '')
    );
  }

  function traceCorr(R) {
    var C = R.corr;
    if (!C.active) return '<div class="nr-hint">Enter the corrugation width and thickness on the Extras page to activate this check.</div>';
    function comb(name, c) {
      if (!c) return '';
      return head(name)
        + h('sigma_E', c.sE, 'N/mm2', 'pi^2 E /(12(1-nu^2)) (t/b)^2')
        + h('Cx', c.Cx, '—', 'Tab 4 Case 1 with alpha = 2')
        + h('Cy', c.Cy, '—', 'Tab 4 Case 2 with alpha = 2')
        + h('C_tau', c.Ct, '—', 'Tab 4 Case 15')
        + h('gamma_c', c.gamma >= 999 ? 'not reached' : c.gamma, '—', 'Sec 5 [2.2.1] interaction')
        + h('eta', c.eta, '—', '1 / gamma_c', bandCls(c.eta, R.env.etaAll));
    }
    return table(comb('Combination 1 — maximum sigma_x', C.c1) + comb('Combination 2 — maximum tau', C.c2));
  }

  function traceCorrCol(R) {
    var C = R.corr;
    if (!C.colActive) return '<div class="nr-hint">Enter the corrugation flange, web, angle and length on the Extras page.</div>';
    return table(
      head('Corrugation unit as a column · Sec 4 [3.3.2]')
      + h('depth', C.depth, 'mm', 'b_web sin(phi)')
      + h('A_unit', C.Aunit, 'cm2', '(b_f t_f + b_w t_w)/100')
      + h('y_na', C.yna, 'mm', 'Neutral axis of the unit')
      + h('I_unit', C.Iunit, 'cm4', 'About the unit neutral axis')
      + h('f_end', C.fEnd, '—', C.fEnd === 4 ? 'Fixed — stool wider than twice the depth · Sec 4 [3.3.3]' : 'Pinned')
      + h('sigma_EC', C.sEC, 'N/mm2', 'pi^2 E f_end I /(A l^2) 1e-4')
      + h('sigma_cr', C.scr, 'N/mm2', 'Johnson-Ostenfeld correction')
      + h('eta', C.etaCol, '—', 'sigma_av / sigma_cr', bandCls(C.etaCol, R.env.etaAll))
    );
  }

  function traceUtype(R) {
    var U = R.utype;
    if (!U.active) return '<div class="nr-hint">This check applies only when the stiffener profile is U-type · Sec 5 [2.5.1].</div>';
    var body = head('Correction factors · Sec 5 [2.2.5] and Tab 3')
      + h('Flong (U-type)', U.Flong === null ? 'n/a' : U.Flong, '—', 'Tab 3 U-type form with the c on the Loads page')
      + h('Ftran (b1)', U.Ftran1 === null ? 'n/a' : U.Ftran1, '—', 'Sec 5 [2.2.5]')
      + h('Ftran (b2)', U.Ftran2 === null ? 'n/a' : U.Ftran2, '—', 'Sec 5 [2.2.5]');
    U.panels.forEach(function (p) {
      if (!p.active) { body += head(p.name) + h('status', 'n/a', '—', 'Width not entered'); return; }
      body += head(p.name + (p.name === 'EPP bf' || p.name === 'EPP hw' ? ' · UP-B, Flong = Ftran = 1' : ''))
        + h('b', p.b, 'mm', 'Panel width')
        + h('alpha', p.alpha, '—', 'a / b')
        + h('sigma_E', p.sE, 'N/mm2', 'Reference stress for this panel')
        + h('Cx', p.Cx, '—', 'Reduction factor')
        + h('Cy', p.Cy, '—', 'Reduction factor')
        + h('C_tau', p.Ctau, '—', 'Reduction factor')
        + h('eta', p.eta, '—', '1 / gamma_c', bandCls(p.eta, R.env.etaAll));
    });
    return table(body);
  }

  function traceCurved(R) {
    var C = R.curved;
    if (!C.active) {
      return '<div class="nr-hint">' + esc(C.reason === 'geometry not entered'
        ? 'Enter R, tp and d on the Extras page to activate this check.'
        : 'R/tp = ' + fmt(C.ratio, 1) + ' exceeds 2500, so Tab 5 does not apply — the panel is treated as plane and '
        + 'the plate capacity of Sec 5 [2.2.1] governs.') + '</div>';
    }
    return table(
      head('Applicability · Sec 5 [2.2.6]')
      + h('R/tp', C.ratio, '—', 'Tab 5 applies while this stays at or below 2500')
      + h('sigma_E', C.sE, 'N/mm2', 'pi^2 E /(12(1-nu^2)) (tp/d)^2')
      + head('Tab 5 buckling and reduction factors')
      + h('K axial', C.Kax, '—', 'Tab 5 Case 1')
      + h('C_ax', C.Cax, '—', 'Reduction factor')
      + h('K tangential', C.Ktg, '—', 'Tab 5 Case 2')
      + h('C_tg', C.Ctg, '—', 'Reduction factor')
      + h('K shear', C.Ktau, '—', 'Tab 5 Case 4')
      + h('C_tau', C.Ctau, '—', 'Reduction factor')
      + head('Limit state · Sec 5 [2.2.6]')
      + h('gamma_c', C.gamma, '—', 'Bisection on the curved-panel interaction')
      + h('eta', C.eta, '—', '1 / gamma_c', bandCls(C.eta, R.env.etaAll))
    );
  }

  function traceOpenings(R) {
    var O = R.openings;
    if (!O.active) return '<div class="nr-hint">Enter the geometry of at least one web panel on the Extras page to activate this check.</div>';
    var body = '';
    O.panels.forEach(function (p) {
      if (!p.active) { body += head(p.name) + h('status', p.err || 'n/a', '—', 'Not activated'); return; }
      body += head(p.name)
        + h('tau_av used', p.tauUsed, 'N/mm2', R.inp.opModelled === 'Yes'
          ? 'Opening modelled — the entered value is used directly'
          : 'Scaled by h/(h - h0) per Tab 7')
        + h('alpha', p.alpha, '—', 'a / b')
        + h('sigma_E', p.sE, 'N/mm2', 'Reference stress')
        + h('Kx', p.Kx, '—', 'Tab 7 buckling factor')
        + h('Cx', p.Cx, '—', R.inp.opMethod + ' reduction curve')
        + h('K_tau', p.Ktau, '—', 'Tab 7 shear buckling factor')
        + h('C_tau', p.Ctau, '—', 'Reduction factor')
        + h('gamma_c', p.gamma >= 999 ? 'not reached' : p.gamma, '—', 'Sec 5 [2.4.1] with sigma_y = 0')
        + h('eta', p.eta, '—', '1 / gamma_c', bandCls(p.eta, R.env.etaAll));
    });
    return table(body);
  }

  function bandCls(eta, etaAll) {
    var b = band(eta, etaAll);
    return b === 'over' ? 'bad' : b === 'near' ? 'flag' : 'good';
  }

  var TRACERS = {
    panel: tracePanel, plate: tracePlate,
    stiffSI: function (R) { return traceStiff(R, 'SI'); },
    stiffPI: function (R) { return traceStiff(R, 'PI'); },
    pillar: tracePillar, corrLocal: traceCorr, corrCol: traceCorrCol,
    utype: traceUtype, curved: traceCurved, opening: traceOpenings
  };

  /* --------------------------------------------------------- page body */
  function html(S) {
    var R = S.res;              // the active load set — what the traces describe
    var E = S.env;              // worst across every load set — what is assessed
    var many = S.cases.length > 1;

    var cards = '<div class="ea-summary-grid" style="grid-template-columns:repeat(4,1fr)">'
      + card('Worst utilisation', fmt(E.worst, 3),
        many ? 'over ' + S.cases.length + ' load sets · eta_all = ' + fmt(E.etaAll, 2)
          : 'eta_all = ' + fmt(E.etaAll, 2),
        E.worst <= E.etaAll ? 'pass' : 'fail')
      + card('Governing mode', shortName(E.governing),
        many && E.governingCase ? 'in ' + E.governingCase : 'Most unfavourable failure mode', 'cyan')
      + card('Slenderness', E.slenStatus,
        E.slenFails ? E.slenFails + ' requirement(s) not met' : 'Sec 2 satisfied',
        E.slenStatus === 'PASS' ? 'pass' : 'fail')
      + card('Overall', E.overall, E.anyCheck ? 'A precondition failed' : 'Utilisation and slenderness combined',
        E.overall === 'PASS' ? 'pass' : E.overall === 'CHECK' ? 'cyan' : 'fail')
      + '</div>';

    var warns = R.warn.length
      ? '<div class="ea-panel" style="margin-top:var(--spacing-lg);border-color:var(--warning)">'
      + '<div class="ea-panel-header"><div class="ea-panel-icon warning"></div>'
      + '<span class="ea-panel-title">Sweep warnings</span></div><div class="ea-panel-body">'
      + R.warn.map(function (w) { return '<div class="nr-hint">' + esc(w) + '</div>'; }).join('')
      + '</div></div>' : '';

    var checks = E.rows.map(function (r) { return checkCard(S, R, E, r); }).join('');

    var caseNote = many
      ? '<div class="nr-hint" style="margin-bottom:var(--spacing-md)">Each utilisation below is the worst across all '
      + S.cases.length + ' design load sets, with the set that produced it named beside the bar — Sec 3 [1.1.3]. '
      + 'The derivations inside each card are for <b>' + esc(S.cases[S.active].name)
      + '</b>, the set selected on the Loads page.</div>' : '';

    return cards + warns
      + '<div style="margin-top:var(--spacing-xl)"><div class="ea-section-title">Utilisation by buckling mode '
      + '— eta_act &lt;= eta_all per Sec 1 [2.4.1]</div>' + caseNote + checks + '</div>'
      + (many ? '<div style="margin-top:var(--spacing-xl)">' + caseSummaryHTML(S) + '</div>' : '')
      + '<div style="margin-top:var(--spacing-xl)">' + slenderHTML(R) + '</div>'
      + '<div class="nr-hint" style="margin-top:var(--spacing-lg)">'
      + '<b>n/a</b> means the check does not apply to this configuration and is correctly left out of the envelope. '
      + '<b>CHECK</b> means a Sec 5 [2.3.3] precondition failed — gamma_GEB at or below gamma, or sigma_ET at or below '
      + 'gamma sigma_a. That is a real result, not a numerical fault: the section is too slender for the applied stress.'
      + '</div>';
  }

  function shortName(s) {
    return s.replace('Elementary plate panel', 'Plate').replace('Overall stiffened panel', 'Overall panel')
      .replace('Stiffener — ', 'Stiffener ').replace('Struts / pillars / cross ties', 'Pillar')
      .replace('Corrugated bulkhead — local', 'Corrugation').replace('PSM web in way of openings', 'Opening')
      .replace('U-type stiffener — local plate', 'U-type EPP').replace('Curved plate panel', 'Curved');
  }

  function card(label, value, sub, cls) {
    return '<div class="ea-summary-card ' + cls + '"><div class="ea-summary-label">' + esc(label) + '</div>'
      + '<div class="ea-summary-value" style="font-size:' + (String(value).length > 12 ? '1.05rem' : '2rem')
      + '">' + esc(value) + '</div><div class="ea-summary-sub">' + esc(sub) + '</div></div>';
  }

  function checkCard(S, R, E, r) {
    var open = S.open[r.key] ? ' open' : '';
    var governing = (typeof r.eta === 'number' && r.eta === E.worst && r.eta > 0) ? ' governing' : '';
    var b = band(r.eta, E.etaAll);
    var pct = typeof r.eta === 'number' ? Math.min(100, r.eta / Math.max(E.etaAll, 1e-9) * 80) : 0;
    var label = r.status === 'na' ? 'n/a' : r.status === 'check' ? 'CHECK' : r.status.toUpperCase();
    var many = S.cases.length > 1;
    /* With several load sets the middle column names the one that produced the
       worst utilisation; with one it stays the mode detail. */
    var midCol = many && r.caseName ? r.caseName : (r.mode || '');

    var note = '';
    if (governing) {
      note = 'This mode governs the assessment'
        + (many && r.caseName ? ', in ' + r.caseName : '') + '.';
    }
    /* Only worth saying once the trace is actually on screen: the numbers you
       are reading are not the ones that produced this row's utilisation. */
    if (S.open[r.key] && many && typeof r.eta === 'number' && r.caseIdx >= 0 && r.caseIdx !== S.active) {
      note += (note ? ' ' : '') + 'The derivation below is for ' + S.cases[S.active].name
        + ' — this row is governed by ' + r.caseName + '.';
    }

    return '<div class="nr-check ' + r.status + open + governing + '" id="chk-' + r.key + '">'
      + '<div class="nr-check-head" onclick="UI.toggleCheck(\'' + r.key + '\')">'
      + '<div class="nr-check-name"><b>' + esc(r.name) + '</b><span>' + esc(r.ref) + '</span></div>'
      + '<div class="nr-uc"><div class="nr-uc-track"><div class="nr-uc-fill ' + b + '" style="width:' + pct + '%"></div>'
      + '<div class="nr-uc-limit" style="left:80%"></div></div>'
      + '<span class="nr-uc-num ' + b + '">' + (typeof r.eta === 'number' ? fmt(r.eta, 3) : '—') + '</span></div>'
      + '<div class="nr-check-mode">' + esc(midCol) + '</div>'
      + '<div class="nr-check-status ' + r.status + '">' + label + '</div>'
      + '<div class="nr-check-chev">&#9656;</div></div>'
      + '<div class="nr-check-body">' + (TRACERS[r.key] ? TRACERS[r.key](R) : '') + '</div>'
      + (note ? '<div class="nr-check-note">' + esc(note) + '</div>' : '')
      + '</div>';
  }

  /* One row per design load set, so the spread across them is visible at a
     glance rather than only through the governing value. */
  function caseSummaryHTML(S) {
    var etaAll = S.env.etaAll;
    var rowsOut = S.cases.map(function (c, i) {
      var R = S.caseRes[i];
      if (!R) return '';
      var e = R.env;
      var b = band(e.worst, etaAll);
      return '<tr' + (i === S.active ? ' class="highlight"' : '') + '>'
        + '<td style="text-align:left">' + esc(c.name) + (i === S.active ? ' <span class="badge badge-blue">shown</span>' : '') + '</td>'
        + '<td>' + fmt(c.sx, 1) + '</td><td>' + fmt(c.sy, 1) + '</td><td>' + fmt(c.tau, 1) + '</td>'
        + '<td>' + fmt(c.P, 1) + '</td>'
        + '<td>' + fmt(R.plate.eta, 3) + '</td><td>' + fmt(R.panel.eta, 3) + '</td>'
        + '<td>' + (R.stiff.SI.na ? 'CHECK' : fmt(R.stiff.SI.eta, 3)) + '</td>'
        + '<td>' + (R.stiff.PI.na ? 'CHECK' : fmt(R.stiff.PI.eta, 3)) + '</td>'
        + '<td class="' + (b === 'over' ? 'error' : b === 'near' ? 'warning' : 'success') + '">'
        + fmt(e.worst, 3) + '</td>'
        + '<td style="text-align:left">' + esc(e.governing) + '</td>'
        + '<td class="' + (e.overall === 'PASS' ? 'ok' : e.overall === 'CHECK' ? 'warning' : 'fail') + '">'
        + esc(e.overall) + '</td></tr>';
    }).join('');
    return '<div class="ea-section-title">By design load set · Sec 3 [1.1.3]</div>'
      + '<div class="ea-table-wrap"><table class="ea-table"><thead><tr>'
      + '<th style="text-align:left">Load set</th><th>sig_x</th><th>sig_y</th><th>tau</th><th>P</th>'
      + '<th>eta plate</th><th>eta panel</th><th>eta SI</th><th>eta PI</th><th>Worst</th>'
      + '<th style="text-align:left">Governing</th><th>Status</th></tr></thead><tbody>'
      + rowsOut + '</tbody></table></div>';
  }

  function slenderHTML(R) {
    var rowsHTML = R.slen.rows.map(function (r) {
      var cls = r.status === 'PASS' || r.status === 'NOT REQUIRED' || r.status === 'REQUIRED - FITTED' ? 'ok'
        : r.status === 'na' ? '' : 'fail';
      return '<tr><td style="text-align:left">' + esc(r.name) + '</td>'
        + '<td>' + (r.req === null ? 'n/a' : fmt(r.req, 3)) + '</td>'
        + '<td>' + (r.act === null ? 'n/a' : fmt(r.act, 3)) + '</td>'
        + '<td>' + esc(r.unit) + '</td>'
        + '<td class="' + cls + '">' + esc(r.status === 'na' ? 'n/a' : r.status) + '</td>'
        + '<td style="text-align:left;color:var(--text-secondary);font-family:var(--font-body)">' + esc(r.ref) + '</td></tr>';
    }).join('');
    return '<div class="ea-section-title">Slenderness · Sec 2 — a separate acceptance criterion from the utilisation</div>'
      + '<div class="ea-table-wrap"><table class="ea-table">'
      + '<thead><tr><th style="text-align:left">Check</th><th>Required</th><th>Actual</th><th>Unit</th><th>Status</th>'
      + '<th style="text-align:left">Rule</th></tr></thead><tbody>' + rowsHTML + '</tbody></table></div>';
  }

  return { html: html, TRACERS: TRACERS };
})();
