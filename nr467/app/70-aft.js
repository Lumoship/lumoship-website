/* ============================================================================
   Aft part — BV NR467 Pt B, Ch 5 Sec 5 [4.2.2] and Ch 11 Sec 3.

   The same shape of problem as the fore part, and it shares the panel check,
   the AC-4 coefficients and the prescriptive row forms through 55-impact.js.
   Four things differ, and each one is a trap if the fore module is copied
   across without reading it:

     1. x/L is measured FROM THE AFT END. h_SL is largest at the aft
        perpendicular, falls away to x/L = 0,2 and is zero beyond it — the
        mirror image of the fore part, where it is zero until x/L = 0,7.

     2. The impact height is measured from TLC, not TF. TLC must be the
        draught of the condition that actually governs stern slamming.

     3. T_RZ = 3 L^0,26 here against 1,2 L^0,4 forward. Same symbol, different
        law.

     4. Stern slamming applies only for L >= 150 m (Ch 11 Sec 3 [5.1.1]). Below
        that the impact pressure is zero and only the minima and the stern
        frame govern — that is a scope limit, not a pass.

   alpha for the stern slamming wave parameter is a fixed 0,86 rather than a
   function of the loading condition.
   ============================================================================ */

window.NR467AFT = (function () {
  'use strict';

  var TABLES = null;
  function setTables(json) { TABLES = json; }
  function ready() { return !!TABLES; }

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }
  function rad(deg) { return n(deg) * Math.PI / 180; }

  var AC4 = NR467IMPACT.AC4;
  var req = NR467IMPACT.req, lim = NR467IMPACT.lim;
  var cE = NR467IMPACT.cE;

  function derive(S) {
    var L = n(S.L);
    var nav = NR467LOADS.navOf(S.navigation);
    var TLC = n(S.TLC, n(S.TSC));
    var d = {
      L: L, B: n(S.B), D: n(S.D), TSC: n(S.TSC), TLC: TLC, TBAL: n(S.TBAL),
      V: n(S.V), CB_LC: n(S.CB_LC, n(S.CB)), CW_LC: n(S.CW_LC),
      nav: nav, fp: 1,
      L0: L,
      L1: Math.min(L, 200),
      L2: Math.min(L, 300),
      L3: Math.min(L, 300),
      L4: Math.min(Math.max(L, 100), 300),
      tRes: n(S.t_res)
    };
    /* Ch 11 Sec 3 [5.1.1] — stern slamming is a large-ship rule. */
    d.sternSlammingRequired = L >= 150;

    var alpha = n(TABLES.sternSlamAlpha, 0.86);
    var w = NR467LOADS.waveH(alpha, L, d.fp, nav);
    d.slamAlpha = alpha; d.slamLref = w.Lref; d.Hslam = w.H;

    /* Not the fore part's 1,2 L^0,4. */
    d.TRZ = 3 * Math.pow(L, 0.26);
    return d;
  }

  /* ------------------------------------------- stern slamming · [4.2.2] ---
     h_SL is at its maximum at and abaft the aft perpendicular, falls linearly
     to x/L = 0,2 and is zero forward of that. It is very sensitive to the
     waterplane coefficient through the CW^-4,9 term, so CW_LC has to belong to
     the same loading condition as TLC. */
  function hSL(xL, H, CB_LC, CW_LC) {
    var base = Math.pow(CB_LC, 2.5) * Math.pow(CW_LC, -4.9) * H;
    if (xL <= 0) return 13.7 * base;
    if (xL <= 0.2) return (13.7 + (2.7 - 13.7) * xL / 0.2) * base;
    return 0;
  }

  function slamPoint(pt, d) {
    var xL = n(pt.xL), z = n(pt.z);
    var h = hSL(xL, d.Hslam, d.CB_LC, d.CW_LC);
    var beta = Math.max(n(pt.beta), 10);
    var tanB = Math.tan(rad(beta));
    /* Below 150 m the rule does not apply at all. */
    var P = (!d.sternSlammingRequired || tanB <= 0) ? 0
      : Math.max(0, 100 * (h * h - Math.pow(z - d.TLC, 2)) / (d.TRZ * d.TRZ * tanB));
    return {
      name: pt.name || ('SS x/L ' + xL), xL: xL, z: z,
      beta: n(pt.beta), betaUsed: beta, tanBeta: tanB,
      H: d.Hslam, CB_LC: d.CB_LC, CW_LC: d.CW_LC, hSL: h, TRZ: d.TRZ, PSLI: P,
      /* A point more than h_SL below TLC gives zero because it is outside the
         slamming zone, which is not the same as passing a check. */
      inZone: h > 0 && Math.abs(z - d.TLC) < h
    };
  }

  /* ============================================ minimum scantlings ========
     Ch 11 Sec 3 Tab 1 and Tab 2. Close to the fore part's forms but not
     identical: the platform and wash bulkhead row switches on L = 120 m, and
     the inner bottom, deck and platform rows take the plate BREADTH b rather
     than the stiffener spacing. */
  function platingMin(el, d, k) {
    var b = n(el.s), cf = n(el.cF, 1), ce = cE(d.L);
    switch (String(el.kind || 'shell')) {
      case 'shell':
        return cf * (0.03 * d.L3 + 5.5) * Math.sqrt(k) - ce;
      case 'innerBottom':
        return 2 + 0.017 * d.L3 * Math.sqrt(k) + 0.0045 * b;
      case 'deck':
        return 2.1 + 0.013 * d.L3 * Math.sqrt(k) + 0.0045 * b;
      case 'platform':
        return d.L < 120
          ? 1.3 + 0.004 * d.L3 * Math.sqrt(k) + 0.0045 * b
          : 2.1 + 2.2 * Math.sqrt(k) + 0.001 * b;
      default:
        return 0;
    }
  }

  function platingRow(el, d) {
    var k = NRIN.kOf(n(el.ReH, 235));
    var tMin = platingMin(el, d, k);
    var tSel = n(el.tSel);
    return {
      name: el.name || 'plating', kind: el.kind || 'shell', s: n(el.s),
      ReH: n(el.ReH, 235), k: k, cF: n(el.cF, 1), cE: cE(d.L),
      tMin: tMin, tSel: tSel,
      UC: tSel > 0 ? tMin / tSel : null
    };
  }

  function stiffenerRow(el, d, plateByName) {
    var k = NRIN.kOf(n(el.ReH, 235));
    var formula = 1.5 * Math.pow(d.L0, 1 / 3) * Math.pow(k, 1 / 6);
    var plate = plateByName[el.plating];
    var tPlate = plate ? plate.tSel : 0;
    var tMin = tPlate > 0 ? Math.min(formula, tPlate) : formula;
    var twSel = n(el.twSel);
    return {
      name: el.name || 'stiffener', plating: el.plating || '',
      ReH: n(el.ReH, 235), k: k,
      tFormula: formula, tPlate: tPlate, tMin: tMin, twSel: twSel,
      UC: twSel > 0 ? tMin / twSel : null
    };
  }

  /* Ch 11 Sec 2 [2.1.9] — only when the aft peak adjoins the machinery space. */
  function machineryPlatform(mp, d) {
    var k = NRIN.kOf(n(mp.ReH, 235));
    return req('Platform (machinery space)', 0.018 * d.L0 * Math.sqrt(k) + 4.5,
      mp.tSel, 'mm', 'Ch 11 Sec 2 [2.1.9]');
  }

  /* ================================================= aft peak · [2] [3] ===
     Dimensional and arrangement rules only — no stress, bending or shear check
     is made on floors, girders or side transverses. The side-transverse limits
     are expressed in FRAME SPACINGS, not metres. */
  function aftPeak(ap) {
    var lstf = Math.min(n(ap.stiffenerLength), 5);
    var total = n(ap.totalLength);
    return {
      stiffenerLength: n(ap.stiffenerLength), totalLength: total,
      requirements: [
        req('hstf · flat bar', 80 * lstf, ap.hstfFlat, 'mm', '[2.3.2] · 80 lstf'),
        req('hstf · bulb or flanged', 70 * lstf, ap.hstfBulb, 'mm', '[2.3.2] · 70 lstf')
      ],
      triggers: [
        NR467IMPACT.trigger('Brackets both ends', total > 4, '[2.3.3] · when lstf-t > 4 m'),
        NR467IMPACT.trigger('Bracket lower end', total > 2.5, '[2.3.3] · when lstf-t > 2,5 m')
      ],
      spacing: [
        lim('Floors — at each frame', null, ap.floorsPerFrame, 'frame',
          '[2.1.1] · a floor at every frame space in the peak'),
        lim('Side transv. — at horn', 2, ap.sideTransvHorn, 'frame sp.',
          '[3.2.1] · <= 2-frame spacing in way of the horn'),
        lim('Side transv. — fwd/aft of horn', 4, ap.sideTransvOther, 'frame sp.',
          '[3.2.1] · <= 4-frame spacing'),
        lim('Side transv. — near AP bhd', 6, ap.sideTransvAP, 'frame sp.',
          '[3.2.1] · <= 6-frame spacing'),
        lim('Side girder when depth > 2,6 m', 2.6, ap.peakDepth, 'm',
          '[3.2.2] · fit a side girder if peak top to deck > 2,6 m'),
        lim('Longitudinal wash bhd if breadth >', 20, ap.spaceBreadth, 'm',
          '[2.1.3] · additional wash bulkhead if the space breadth exceeds 20 m')
      ]
    };
  }

  /* ================================================ stern frame · [2.2] [4]
     Two bases on one page: the shell and transom floor values are NET, while
     the propeller-post dimensions and the boss thickness are GROSS. They must
     not be compared with each other. */
  function sternFrame(sf, d) {
    var b = n(sf.plateBreadth);
    var barPostB = 10 * Math.sqrt(4.6 * d.L - 164);
    return {
      plateBreadth: b, barPostB: barPostB,
      shell: [
        req('Shell at stern frame', 0.094 * (d.L3 - 43) + 0.009 * b, sf.shellSel, 'mm',
          '[2.2.2] · net'),
        req('Boss and heel plate', 0.105 * (d.L3 - 47) + 0.011 * b, sf.bossSel, 'mm',
          '[2.2.2] · net')
      ],
      /* Tab 3, fabricated single-screw post. A cast post, or any twin-screw
         post (Tab 4), uses different coefficients — this block is not those. */
      post: [
        req('a (fore-aft)', 50 * Math.sqrt(d.L2), sf.aSel, 'mm', 'Tab 3 · fabricated single'),
        req('b (transverse)', 35 * Math.sqrt(d.L2), sf.bSel, 'mm', 'Tab 3 · fabricated single'),
        req('t1 (wall)', 2.5 * Math.sqrt(d.L2), sf.t1Sel, 'mm', 'Tab 3 · fabricated single'),
        req('td (diaphragm)', 1.3 * Math.sqrt(d.L2), sf.tdSel, 'mm', 'Tab 3 · fabricated single'),
        req('Boss thickness', 0.6 * barPostB, sf.bossThkSel, 'mm',
          '[4.2.2] · >= 0,6 b of the rule bar-post section')
      ],
      connections: [
        req('Transom floor thickness', 9 + 0.023 * d.L1, sf.transomSel, 'mm',
          '[4.3.3] · net'),
        req('Post extension to keel', 1500 + 6 * d.L3, sf.postExtSel, 'mm',
          '[4.3.1] · from the aft perpendicular'),
        req('Rudder-horn shell radius', 150 + 0.8 * d.L3, sf.hornRadiusSel, 'mm',
          '[2.2.3] · where the horn is radiused into the shell')
      ],
      /* The workbook computes the bar-post b from a formula but its own note
         says the Tab 3/4 bar-post expression could not be read unambiguously
         from the rule PDF and should be entered by hand. The formula is
         reproduced here and the caveat carried with it rather than either
         being dropped. */
      caveats: [
        'Post block is wired for a FABRICATED, SINGLE-SCREW post (Tab 3). Cast posts and all '
        + 'twin-screw posts (Tab 4) use different coefficients.',
        'Bar-post b = 10 sqrt(4,6 L - 164) is reproduced from the workbook, whose own note says '
        + 'the Tab 3/4 bar-post expression could not be read unambiguously from the rule PDF. '
        + 'Confirm it against the printed table before relying on the boss thickness.',
        'A non-standard post is acceptable only if its section modulus about the longitudinal '
        + 'axis is at least that of the tabulated post [4.2.1]. That check is not automated.',
        'Post dimensions and boss thickness are GROSS; the shell and transom floor are NET.'
      ]
    };
  }

  /* ---------------------------------------------------------- solve ------- */
  function solve(I, aft) {
    var d = derive(I.ship);

    var slam = (aft.slamPoints || []).map(function (pt) { return slamPoint(pt, d); });
    var maxPSLI = 0, slamGov = '';
    slam.forEach(function (r) { if (r.PSLI > maxPSLI) { maxPSLI = r.PSLI; slamGov = r.name; } });

    var plating = (aft.plating || []).map(function (el) { return platingRow(el, d); });
    var byName = {};
    plating.forEach(function (r) { byName[r.name] = r; });
    var stiffeners = (aft.stiffeners || []).map(function (el) {
      return stiffenerRow(el, d, byName);
    });
    var machPlatform = aft.machineryPlatform
      ? machineryPlatform(aft.machineryPlatform, d) : null;

    var ctx = { tRes: d.tRes };
    var Cd = n(TABLES.Cd['flat bottom aft'], 1.3);
    var panels = (aft.panels || []).map(function (el) {
      return NR467IMPACT.panelRow(el, ctx, maxPSLI, Cd);
    });

    var peak = aftPeak(aft.aftPeak || {});
    var frame = sternFrame(aft.sternFrame || {}, d);

    /* ---- results envelope ---------------------------------------------- */
    var rows = panels.map(function (r) {
      return {
        name: r.name, kind: 'stern panel', UCt: r.UCt, UCz: r.UCz,
        status: (r.UCt !== null && r.UCt <= 1 && r.UCz !== null && r.UCz <= 1) ? 'PASS' : 'FAIL'
      };
    });

    var platingUC = NR467IMPACT.worstOf(
      rows.map(function (r) { return { name: r.name, v: r.UCt }; })
        .concat(plating.map(function (r) { return { name: r.name, v: r.UC }; })), ['v']);
    var stiffUC = NR467IMPACT.worstOf(
      rows.map(function (r) { return { name: r.name, v: r.UCz }; })
        .concat(stiffeners.map(function (r) { return { name: r.name, v: r.UC }; })), ['v']);

    var maxTreq = NR467IMPACT.worstOf(
      panels.map(function (r) { return { name: r.name, v: r.tReq }; })
        .concat(plating.map(function (r) { return { name: r.name, v: r.tMin }; })), ['v']).worst;
    var maxZreq = NR467IMPACT.worstOf(
      panels.map(function (r) { return { name: r.name, v: r.Zreq }; }), ['v']).worst;

    var panelsAndMinimaPass = rows.every(function (r) { return r.status === 'PASS'; })
      && plating.every(function (r) { return r.UC === null || r.UC <= 1; })
      && stiffeners.every(function (r) { return r.UC === null || r.UC <= 1; })
      && (!machPlatform || machPlatform.status !== 'FAIL');

    /* The aft workbook says in two places that the peak and stern frame sheets
       do not feed its envelope. Both scopes are reported rather than one
       standing in for the other. */
    var extra = peak.requirements.concat(frame.shell, frame.post, frame.connections);
    var extraSpacing = peak.spacing;
    var extraPass = extra.every(function (r) { return r.status !== 'FAIL'; })
      && extraSpacing.every(function (r) { return r.status !== 'EXCEEDS'; });

    return {
      d: d, AC: AC4, slam: slam, maxPSLI: maxPSLI, slamGoverning: slamGov,
      plating: plating, stiffeners: stiffeners, machineryPlatform: machPlatform,
      panels: panels, Cd: Cd, aftPeak: peak, sternFrame: frame,
      results: {
        rows: rows,
        worstPlating: platingUC.worst, platingGoverning: platingUC.governing,
        worstStiffener: stiffUC.worst, stiffenerGoverning: stiffUC.governing,
        maxTreq: maxTreq, maxZreq: maxZreq, maxPSLI: maxPSLI,
        overallPanelsAndMinima: panelsAndMinimaPass ? 'PASS' : 'FAIL',
        overall: (panelsAndMinimaPass && extraPass) ? 'PASS' : 'FAIL',
        peakAndFramePass: extraPass,
        sternSlammingRequired: d.sternSlammingRequired
      }
    };
  }

  return {
    setTables: setTables, ready: ready,
    AC4: AC4, derive: derive, hSL: hSL, slamPoint: slamPoint,
    platingMin: platingMin, platingRow: platingRow, stiffenerRow: stiffenerRow,
    machineryPlatform: machineryPlatform, aftPeak: aftPeak, sternFrame: sternFrame,
    solve: solve
  };
})();
