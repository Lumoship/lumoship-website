/* ============================================================================
   Machinery space — BV NR467 Pt B, Ch 11 Sec 2.

   Minimum net thicknesses for the double and single bottom, engine and
   thrust-bearing seating scantlings, and the arrangement limits.

   A note on which way the numbers run: these are MINIMA, so the utilisation
   here is required / selected and a value at or below 1.00 passes. That is the
   opposite sense to a buckling utilisation, and the reason every row carries
   both the required and the selected value rather than just the ratio.
   ============================================================================ */

window.NR467MACH = (function () {
  'use strict';

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }

  /* required / selected, with the selected value guarded so an empty field
     reports "no scantling entered" instead of dividing by zero. */
  function uc(req, sel) { return n(sel) > 0 ? req / n(sel) : null; }

  function row(name, req, sel, unit, ref) {
    var u = uc(req, sel);
    return {
      name: name, req: req, sel: n(sel), unit: unit, ref: ref, uc: u,
      status: u === null ? 'none' : (u <= 1 ? 'pass' : 'fail')
    };
  }

  function solve(I) {
    var S = I.ship, M = I.mach;
    var L = n(S.L), B = n(S.B), L0 = L;
    var k = NRIN.kOf(M.ReH);
    var within = M.location === 'within 0.4L';
    var double = M.bottomType === 'double';
    var P = n(M.P), nr = n(M.nr), LE = n(M.LE), nG = n(M.nG, 1);
    var drive = (nr > 0 && LE > 0) ? P / (nr * LE) : 0;      // Tab 3 load parameter

    /* ---- Ch 11 Sec 2 [3.3.3] single longitudinal member test ---------- */
    var t1 = L < 150, t2 = P < 7100, t3 = P < 2.3 * nr * LE;
    var singleMember = t1 && t2 && t3;
    var memberTest = {
      rows: [
        { name: 'L < 150 m', value: L, limit: 150, ok: t1 },
        { name: 'P < 7100 kW', value: P, limit: 7100, ok: t2 },
        { name: 'P < 2.3 nr LE', value: P, limit: 2.3 * nr * LE, ok: t3 }
      ],
      allowed: singleMember
    };

    /* ---- double bottom · Tab 1 ---------------------------------------- */
    var b = n(M.ibBreadth);
    var centreGirderReq = within
      ? 1.8 * Math.pow(L, 1 / 3) * Math.pow(k, 1 / 6) + 4
      : 1.55 * Math.pow(L, 1 / 3) * Math.pow(k, 1 / 6) + 3.5;
    var db = [
      row('Inner bottom', 3 + 0.024 * L * Math.sqrt(k) + 0.0045 * b, M.ibSel, 'mm',
        'Tab 1 · 3.0 + 0.024 L sqrt(k) + 0.0045 b — same both branches'),
      row('Margin plate',
        (within ? 1 : 0.9) * Math.sqrt(L) * Math.pow(k, 0.25) + 1, M.marginSel, 'mm',
        'Tab 1 · L^0.5 k^0.25 + 1  /  0.9 L^0.5 k^0.25 + 1'),
      row('Centre girder', centreGirderReq, M.centreGirderSel, 'mm',
        'Tab 1 · 1.8 L^(1/3) k^(1/6) + 4  /  1.55 L^(1/3) k^(1/6) + 3.5'),
      row('Floors and side girders',
        1.7 * Math.pow(L, 1 / 3) * Math.pow(k, 1 / 6) + 1, M.floorsSel, 'mm',
        'Tab 1 · 1.7 L^(1/3) k^(1/6) + 1 — same both branches'),
      row('Duct-keel girder',
        Math.max(0.8 * Math.sqrt(L) * Math.pow(k, 0.25) + 2.5, centreGirderReq), M.ductKeelSel, 'mm',
        'Tab 1 · max(0.8 L^0.5 k^0.25 + 2.5 ; centre girder)'),
      row('Inner bottom, bolted engine', 19, M.ibBoltedSel, 'mm',
        '[2.2.11] · net >= 19 mm where the engine or thrust block is bolted directly to it')
    ];

    /* ---- single bottom · Tab 2 and [2.3.3] ----------------------------- */
    var sb = [
      row('Centre girder', (within ? 7 : 6) + 0.05 * L0 * Math.sqrt(k), M.sbCentreSel, 'mm',
        'Tab 2 · 7 + 0.05 L0 sqrt(k)  /  6 + 0.05 L0 sqrt(k)'),
      row('Floors and side girder', (within ? 6.5 : 5) + 0.05 * L0 * Math.sqrt(k), M.sbFloorsSel, 'mm',
        'Tab 2 · 6.5 + 0.05 L0 sqrt(k)  /  5 + 0.05 L0 sqrt(k)'),
      row('Floor height, amidships', B / 14.5, M.floorHeightSel, 'm', '[2.3.3] · >= B/14.5'),
      row('Floor height, recessed', B / 16, M.floorHeightRecessSel, 'm',
        '[2.3.3] · recess in way of machinery >= B/16')
    ];

    /* ---- seatings · Tab 3 ---------------------------------------------- *
       Two rows have a separate single-member form that only applies when the
       [3.3.3] test above passes; they report as not applicable otherwise. */
    function seatRow(name, req, sel, unit, ref, needsSingle) {
      if (needsSingle && !singleMember) {
        return {
          name: name, req: null, sel: n(sel), unit: unit, ref: ref, uc: null, status: 'na',
          note: 'The [3.3.3] single-member test does not pass, so this form does not apply.'
        };
      }
      return row(name, req, sel, unit, ref);
    }
    var seat = [
      seatRow('Bedplate net area, each', 40 + 70 * drive, M.bedplateAreaSel, 'cm2',
        'Tab 3 · 40 + 70 P/(nr LE)'),
      seatRow('Bedplate thickness, 2+ members', Math.sqrt(240 + 175 * drive), M.bedplateThk2Sel, 'mm',
        'Tab 3 · sqrt(240 + 175 P/(nr LE))'),
      seatRow('Bedplate thickness, 1 member', 5 + Math.sqrt(240 + 175 * drive), M.bedplateThk1Sel, 'mm',
        'Tab 3 · 5 + sqrt(240 + 175 P/(nr LE))', true),
      seatRow('Girder web, 2+ members', (nG > 0 ? 1 / nG : 0) * Math.sqrt(320 + 215 * drive),
        M.girderWeb2Sel, 'mm', 'Tab 3 · (1/nG) sqrt(320 + 215 P/(nr LE))'),
      seatRow('Girder web, 1 member', Math.sqrt(95 + 65 * drive), M.girderWeb1Sel, 'mm',
        'Tab 3 · sqrt(95 + 65 P/(nr LE))', true),
      seatRow('Transverse member web', Math.sqrt(55 + 40 * drive), M.transWebSel, 'mm',
        'Tab 3 · sqrt(55 + 40 P/(nr LE))')
    ];

    /* ---- arrangement · [2.1] to [2.3] ---------------------------------- *
       These are limits on what is fitted, not thickness minima, so they report
       OK or EXCEEDS rather than a ratio. */
    function limit(name, actual, lim, unit, ref) {
      return {
        name: name, actual: n(actual), limit: lim, unit: unit, ref: ref,
        status: n(actual) <= lim ? 'ok' : 'exceeds'
      };
    }
    var spacing = [
      limit('Web frames, transversely framed side', M.webFrames, 5, 'frame spaces',
        '[2.1.4] · <= 5 transverse frame spaces'),
      limit('Side transverses, longitudinally framed', M.sideTransverses, 4, 'frame spaces',
        '[2.1.4] · <= 4-frame spacing'),
      limit('Side bottom girder spacing', M.sideGirderSpacing, Math.min(3, 3 * 0.85), 'm',
        '[2.2.6] · <= 3x longitudinal spacing and <= 3 m'),
      limit('Double bottom floors under engine', M.dbFloorsEngine, 1, 'frame spaces',
        '[2.2.8] · plate floor at every frame under the engine or thrust block'),
      limit('Single bottom floors under engine', M.sbFloorsEngine, 1, 'frame spaces',
        '[2.3.1] · <= 1-frame under the engine or thrust block'),
      limit('Single bottom floors elsewhere', M.sbFloorsElse, 2, 'frame spaces',
        '[2.3.1] · <= 2-frame elsewhere'),
      limit('Manhole depth in floors', M.manholeDepth, 0.4, 'x floor depth',
        '[2.2.10] · <= 40 % of the local floor depth')
    ];
    var plates = [
      row('Platform net thickness', 0.018 * L0 * Math.sqrt(k) + 4.5, M.platformSel, 'mm',
        '[2.1.9] · 0.018 L0 sqrt(k) + 4.5'),
      row('Casing bulkhead, cargo holds', 5.5, M.casingCargoSel, 'mm', '[2.1.7] · >= 5.5 mm'),
      row('Casing bulkhead, accommodation', 4, M.casingAccomSel, 'mm', '[2.1.7] · >= 4.0 mm')
    ];

    /* ---- envelope ------------------------------------------------------ */
    function worst(rows) {
      var live = rows.filter(function (r) { return typeof r.uc === 'number'; });
      return live.length ? Math.max.apply(null, live.map(function (r) { return r.uc; })) : null;
    }
    var wDB = worst(db), wSB = worst(sb), wSeat = worst(seat), wPlate = worst(plates);
    var governing = double ? wDB : wSB;
    var spacingOk = spacing.every(function (r) { return r.status === 'ok'; });
    var overall = (governing !== null && governing <= 1)
      && (wSeat === null || wSeat <= 1) && (wPlate === null || wPlate <= 1) ? 'PASS' : 'FAIL';

    return {
      k: k, L0: L0, within: within, double: double, drive: drive,
      memberTest: memberTest,
      groups: [
        { key: 'db', name: 'Double bottom', ref: 'Ch 11 Sec 2 Tab 1 · [2.2.11]', rows: db, worst: wDB, used: double },
        { key: 'sb', name: 'Single bottom', ref: 'Ch 11 Sec 2 Tab 2 · [2.3.3]', rows: sb, worst: wSB, used: !double },
        { key: 'seat', name: 'Seatings', ref: 'Ch 11 Sec 2 Tab 3 · [3.2] · [3.3]', rows: seat, worst: wSeat, used: true },
        { key: 'plates', name: 'Platform and casing', ref: 'Ch 11 Sec 2 [2.1.7] · [2.1.9]', rows: plates, worst: wPlate, used: true }
      ],
      spacing: spacing, spacingOk: spacingOk,
      worstDB: wDB, worstSB: wSB, worstSeat: wSeat, worstPlate: wPlate,
      governing: governing, overall: overall
    };
  }

  return { solve: solve };
})();
