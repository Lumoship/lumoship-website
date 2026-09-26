// DNV RU-SHIP Pt 5 Ch 1 Sec 2: single-side, transverse cargo hold frames.
// Source: ClauseFinder dnv-ruship-2026/sections/pt5-ch1-sec2.html
// §§1.3.1, 2.2.4, 5.2.1–5.2.4 and Symbols; units from Pt 3 Ch 1 Sec 4.
// Pure requirements calculator. The check does not call it: Figure 1 span and Figure 1/13 brackets are not in the model.
// It does not generate pressures, infer hold geometry, or certify the whole frame.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DNVSideFrame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Pt 5 Ch 1 Sec 2 Table 5. BC-3/4 are homogeneous heavy cargo,
  // not alternate loading. Each case needs its own verified cargo condition.
  const CARGO_CASES = Object.freeze({
    'BC-1': Object.freeze({ AC: 'AC-II', dynamic: true, loading: 'homogeneousFull' }),
    'BC-2': Object.freeze({ AC: 'AC-I', dynamic: false, loading: 'homogeneousFull' }),
    'BC-3': Object.freeze({ AC: 'AC-II', dynamic: true, loading: 'homogeneousHeavyPartial' }),
    'BC-4': Object.freeze({ AC: 'AC-I', dynamic: false, loading: 'homogeneousHeavyPartial' }),
    'BC-5': Object.freeze({ AC: 'AC-II', dynamic: true, loading: 'alternateLightFull' }),
    'BC-6': Object.freeze({ AC: 'AC-I', dynamic: false, loading: 'alternateLightFull' }),
    'BC-7': Object.freeze({ AC: 'AC-II', dynamic: true, loading: 'alternateHeavyPartial' }),
    'BC-8': Object.freeze({ AC: 'AC-I', dynamic: false, loading: 'alternateHeavyPartial' }),
  });

  function requirements(input) {
    const p = input || {}, scope = p.scope || {};
    const scopeKeys = ['dryCargo', 'singleSide', 'transverse', 'csr'];
    if (scopeKeys.some(k => typeof scope[k] !== 'boolean'))
      return { status: 'incomplete', errors: ['Explicit dryCargo, singleSide, transverse and csr applicability flags are required.'] };
    if (!scope.dryCargo || !scope.singleSide || !scope.transverse || scope.csr)
      return { status: 'notApplicable', reference: 'Pt 5 Ch 1 Sec 2 §§1.3.1, 5.2.1' };

    const errors = [];
    for (const k of ['spacing_mm', 'span_m', 'depth_m', 'ReH_MPa'])
      if (!Number.isFinite(p[k]) || p[k] <= 0) errors.push(k + ' must be a finite positive number.');
    for (const k of ['pressure_kPa', 'lowerBracket_m', 'upperBracket_m'])
      if (!Number.isFinite(p[k]) || p[k] < 0) errors.push(k + ' must be a finite non-negative number.');
    if (p.AC !== 'AC-I' && p.AC !== 'AC-II') errors.push('Only AC-I and AC-II are defined by §5.2.2.');
    if (typeof p.mayBeEmpty !== 'boolean') errors.push('mayBeEmpty must be explicitly true or false.');
    if (errors.length) return { status: 'incomplete', errors };

    // Symbols: rule side frame span is not less than 0.25 D.
    const lSF = Math.max(p.span_m, 0.25 * p.depth_m);
    // Reject a degenerate mid-span; do not hide it by clamping required area to 0.
    if (2 * p.lowerBracket_m >= lSF || p.lowerBracket_m + p.upperBracket_m >= lSF)
      return { status: 'incomplete', errors: ['Bracket lengths leave no valid mid-span for this calculation.'] };
    const alphaM = p.mayBeEmpty ? 0.42 : 0.36;
    const alphaS = p.mayBeEmpty ? 1.1 : 1.0;
    const Cs = p.AC === 'AC-I' ? 0.75 : 0.90, Ct = Cs, fbdg = 10;
    const tau = p.ReH_MPa / Math.sqrt(3);
    // s is mm here (unlike DNVLocal.Zreq, which takes s in m).
    const Z = 1.125 * alphaM * p.pressure_kPa * p.spacing_mm * lSF * lSF / (fbdg * Cs * p.ReH_MPa);
    const A = 5 * alphaS * p.pressure_kPa * p.spacing_mm * lSF / (Ct * tau)
      * ((lSF - 2 * p.lowerBracket_m) / lSF) * 1e-3;
    return {
      status: 'calculated', reference: 'Pt 5 Ch 1 Sec 2 §§5.2.2–5.2.4',
      spanRule_m: lSF, spanRaised: lSF > p.span_m,
      coefficients: { alphaM, alphaS, Cs, Ct, fbdg, tau_eH_MPa: tau },
      required: { Zmid_net_cm3: Z, Ashr_net_cm2: A, Zlower_net_cm3: 2 * Z, Zupper_net_cm3: 1.5 * Z },
      bracketLengths: {
        reference: 'Pt 5 Ch 1 Sec 2 §2.2.4',
        lowerMin_m: 0.12 * lSF, upperMin_m: 0.07 * lSF,
        lowerMeetsMinimum: p.lowerBracket_m >= 0.12 * lSF,
        upperMeetsMinimum: p.upperBracket_m >= 0.07 * lSF,
      },
      // No overall OK: net actual section properties, all applicable load cases,
      // bracket edges, tripping, hatch-end reinforcement and ballast checks remain.
      assessment: 'requirementsOnly',
    };
  }

  return { CARGO_CASES, requirements };
});
