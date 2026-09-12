/* ============================================================================
   Fore part — BV NR467 Pt B, Ch 5 Sec 5 [4.2] and [4.3], Ch 11 Sec 1.

   The fore part is governed by impact rather than by the standing wave
   pressure the other modules use. Two separate impacts, each with its own
   wave parameter H:

     Bottom slamming · [4.2]   the flat of bottom forward slamming into the
                               water as the bow emerges and re-enters. Only
                               applies when the ship can run light enough
                               forward: TF < 0,04 L (Ch 11 Sec 1 [3.2.1]).
     Bow flare impact · [4.3]  the flared shell forward taking a blow from the
                               wave face. Always applies.

   Both reach H through the same Ch 5 Sec 3 [1.1.1] closed form as every other
   wave load in the app, so it is taken from 20-loads.js rather than written
   again here — only alpha differs:

     bottom slamming   alpha = 0,34 . (TLC/L)^-0,28
     bow flare         alpha = 0,65 . CW_LC^-1,3

   Impact checks run against acceptance criteria AC-4, which is its own set of
   partial factors and not the AC-1/2/3 the deckhouse uses.

   The Ch 11 Sec 1 minimum plating and stiffener-web thicknesses are here too,
   and the impact panel checks that run against those two pressures.

   Floors, girders, the stem and the results envelope are here as well, so the
   whole fore workbook is covered.
   ============================================================================ */

window.NR467FORE = (function () {
  'use strict';

  var TABLES = null;
  function setTables(json) { TABLES = json; }
  function ready() { return !!TABLES; }

  function n(v, d) { v = parseFloat(v); return isFinite(v) ? v : (d === undefined ? 0 : d); }
  function rad(deg) { return n(deg) * Math.PI / 180; }

  /* AC-4, the panel check, the row shapes and cE are shared with the aft part
     and live in 55-impact.js. */
  var AC4 = NR467IMPACT.AC4;
  var req = NR467IMPACT.req, lim = NR467IMPACT.lim;
  var cE = NR467IMPACT.cE;

  /* Ship-level quantities the fore module needs. L0 to L4 are the capped and
     clamped lengths the minimum-thickness formulae ask for — the rule uses
     several different caps on L and mixing them up is easy. */
  function derive(S) {
    var L = n(S.L);
    var nav = NR467LOADS.navOf(S.navigation);
    var TLC = n(S.TLC, n(S.TSC));
    var d = {
      L: L, B: n(S.B), D: n(S.D), TSC: n(S.TSC), TF: n(S.TF), TLC: TLC,
      TBAL: n(S.TBAL), V: n(S.V), CB_LC: n(S.CB_LC, n(S.CB)), CW_LC: n(S.CW_LC),
      nav: nav, fp: 1,
      L0: L,                                     // no cap
      L1: Math.min(L, 200),
      L2: Math.min(L, 300),
      L3: Math.min(L, 300),
      L4: Math.min(Math.max(L, 100), 300),       // clamped both ends
      tRes: n(S.t_res)
    };
    /* Ch 11 Sec 1 [3.2.1] — slamming strengthening is required only when the
       ship can trim light enough forward. */
    d.slammingRequired = d.TF < 0.04 * L;

    var slam = NR467LOADS.waveH(0.34 * Math.pow(TLC / L, -0.28), L, d.fp, nav);
    var flare = NR467LOADS.waveH(0.65 * Math.pow(d.CW_LC, -1.3), L, d.fp, nav);
    d.slamAlpha = 0.34 * Math.pow(TLC / L, -0.28);
    d.slamLref = slam.Lref; d.Hslam = slam.H;
    d.flareAlpha = 0.65 * Math.pow(d.CW_LC, -1.3);
    d.flareLref = flare.Lref; d.Hflare = flare.H;

    /* Reference period for the slamming pressure — Ch 5 Sec 5 [4.2.1]. */
    d.TRZ = 1.2 * Math.pow(L, 0.4);
    return d;
  }

  /* ------------------------------------------- bottom slamming · [4.2] ----
     The slamming draught h_SL is zero abaft x/L = 0,7, ramps over the next
     fifth of the ship and is flat forward of x/L = 0,9. */
  function hSL(xL, H, CB_LC) {
    if (xL < 0.7) return 0;
    var lo = 4 * H * Math.pow(CB_LC, -0.7);
    var hi = 0.7 * 19 * H * Math.pow(CB_LC, -0.7);
    if (xL < 0.9) return lo + (hi - lo) * (xL - 0.7) / 0.2;
    return hi;
  }

  /* P_SLI = 100 . (h_SL^2 - (z - TF)^2) / (T_RZ^2 . tan beta), never negative.
     The deadrise is floored at 10 degrees: a truly flat bottom would divide by
     zero, and the rule does not let the pressure run away there. */
  function slamPoint(pt, d) {
    var xL = n(pt.xL), z = n(pt.z);
    var h = hSL(xL, d.Hslam, d.CB_LC);
    var beta = Math.max(n(pt.beta), 10);
    var tanB = Math.tan(rad(beta));
    var P = tanB > 0
      ? Math.max(0, 100 * (h * h - Math.pow(z - d.TF, 2)) / (d.TRZ * d.TRZ * tanB))
      : 0;
    return {
      name: pt.name || ('BS x/L ' + xL), xL: xL, z: z,
      beta: n(pt.beta), betaUsed: beta, tanBeta: tanB,
      H: d.Hslam, CB_LC: d.CB_LC, hSL: h, TRZ: d.TRZ, PSLI: P
    };
  }

  /* ----------------------------------------- bow flare impact · [4.3] ----
     P_FI = CS . CZ . (0,22 + 0,15 tan alpha) . (0,4 V sin beta + 0,6 sqrt(L))^2

     CS is the ship coefficient: 1,8 for plating and stiffeners, 1,1 for the
     primary supporting members behind them. CZ falls off with height above the
     waterline, but only once the point is clear of the band where it holds at
     5,5. */
  function CZof(z, H, TLC) {
    return z >= 21.5 * H + TLC - 11
      ? Math.max(0, 10.75 * H - 0.5 * (z - TLC))
      : 5.5;
  }

  function flarePoint(pt, d, CS) {
    var z = n(pt.z);
    var cz = CZof(z, d.Hflare, d.TLC);
    var flareTerm = 0.22 + 0.15 * Math.tan(rad(pt.alphaFlare));
    var speedTerm = Math.pow(0.4 * d.V * Math.sin(rad(pt.betaEntry)) + 0.6 * Math.sqrt(d.L), 2);
    var cs = n(CS, 1.8);
    return {
      name: pt.name || 'BF', area: pt.area || 'A', z: z,
      alphaFlare: n(pt.alphaFlare), betaEntry: n(pt.betaEntry),
      H: d.Hflare, CS: cs, CZ: cz, flareTerm: flareTerm, speedTerm: speedTerm,
      PFI: cs * cz * flareTerm * speedTerm
    };
  }

  /* ============================================ minimum scantlings ========
     Ch 11 Sec 1 Tab 1 (bottom), Tab 4 (side), Tab 5 (deck) and [2.2.3] (wash
     bulkhead). These are floors, independent of the impact pressures — the
     governing thickness is the greater of these and the impact panel checks.

     Each element type has its own closed form and they use DIFFERENT capped
     lengths, which is the easy mistake here: the shell and the inner bottom
     and deck forms take L3 (L capped at 300 m), the wash bulkhead takes L1
     (capped at 200 m), and the stiffener web minimum takes L0, uncapped. */

  function platingMin(el, d, k) {
    var s = n(el.s), cf = n(el.cF, 1), ce = cE(d.L);
    switch (String(el.kind || 'shell')) {
      case 'shell':
        return cf * (0.03 * d.L3 + 5.5) * Math.sqrt(k) - ce;
      case 'innerBottom':
        return 2 + 0.017 * d.L3 * Math.sqrt(k) + 4.5 * s / 1000;
      case 'deck':
        return 2.1 + 0.013 * d.L3 * Math.sqrt(k) + 4.5 * s / 1000;
      case 'washBulkhead':
        return 6.5 + 0.013 * d.L1;
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
      /* Minima again, so UC = required / selected and above 1,00 means the
         selected plate is thinner than the rule allows. */
      UC: tSel > 0 ? tMin / tSel : null
    };
  }

  /* Stiffener web minimum — the lesser of the closed form and the attached
     plating. Note it is the plating a designer SELECTED that caps it, not the
     plating minimum: a web is not asked to be thicker than the plate it is
     welded to. */
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

  /* ================================================== impact panels =======
     Both panel sets run the shared Ch 7 Sec 4/5 check and differ only in which
     pressure they carry and in Cd:

       flat bottom   Cd = 1,3        bow flare   Cd = 1,2   */
  function panelRow(el, d, P, Cd) {
    return NR467IMPACT.panelRow(el, { tRes: d.tRes }, P, Cd);
  }

  /* ======================================== floors, girders and the stem ==
     Ch 11 Sec 1 Tab 2 and Tab 3 for the primary members, [2.3] for the side
     shell, [2.8] for the stem. These are all closed forms in L or D against a
     selected value, so they share two row shapes:

       requirement  a minimum — UC = required / selected, over 1,00 fails
       spacing      a maximum — UC = actual / limit, over 1,00 exceeds

     The two run in opposite directions and a couple of rows in the workbook
     are spacings dressed as requirements, so the direction is carried on the
     row rather than inferred. */

  function floorsGirders(fg, d) {
    var D = d.D, L = d.L;
    var kWeb = NRIN.kOf(n(fg.ReHweb, 315));
    return {
      requirements: [
        req('Web height hM', 0.085 * D + 0.15, fg.webHeight, 'm',
          'Tab 2/3 · hM = 0,085 D + 0,15'),
        req('Web net thickness', Math.min(10, 1.5 * Math.pow(d.L0, 1 / 3) * Math.pow(kWeb, 1 / 6)),
          fg.webThk, 'mm', 'Tab 2/3 · capped at 10 mm'),
        req('Face plate area · long.', 3.15 * D, fg.faceAreaLong, 'cm2', 'Tab 2 · AP = 3,15 D'),
        req('Face plate area · transv.', 1.67 * D, fg.faceAreaTransv, 'cm2', 'Tab 3 · AP = 1,67 D'),
        req('Face plate thickness', Math.min(0.4 * D + 5, 14), fg.faceThk, 'mm',
          'Tab 2 · tP = 0,4 D + 5, capped at 14 mm'),
        req('Stringer web depth bA', 2.5 * (180 + L), fg.stringerDepth, 'mm',
          '[2.3.3] · bA = 2,5 (180 + L)'),
        req('Stringer web thickness tA', (6 + 0.018 * L) * Math.sqrt(kWeb), fg.stringerThk, 'mm',
          '[2.3.3]'),
        req('Panting beam area AB', Math.max(0, 0.5 * L - 18), fg.pantingArea, 'cm2',
          '[2.3.5] · AB = 0,5 L - 18'),
        req('Panting beam inertia JB',
          0.34 * Math.max(0, 0.5 * L - 18) * Math.pow(n(fg.beamLength), 2),
          fg.pantingInertia, 'cm4', '[2.3.5] · JB = 0,34 (0,5 L - 18) bB^2')
      ],
      spacing: [
        lim('Solid floors · transv. framing', null, fg.floorsTransv, 'm',
          'At each web frame · [2.1.2]'),
        lim('Solid floors · long. framing', Math.min(3.5, 4 * n(fg.frameSpacing)),
          fg.floorsLong, 'm', '<= 3,5 m or 4 transverse frame spaces · [2.1.2]'),
        lim('Bottom girders · transv.', 2.5, fg.girdersTransv, 'm', '<= 2,5 m · [2.1.3]'),
        lim('Bottom girders · long.', 3.5, fg.girdersLong, 'm', '<= 3,5 m · [2.1.3]'),
        lim('Web frame spacing S', 2.6 + 0.005 * L, fg.webFrameSpacing, 'm',
          'S <= 2,6 + 0,005 L · [2.3.2]'),
        lim('Stringer effective span', 10, fg.stringerSpan, 'm', '<= 10 m · [2.3.3]'),
        lim('Tripping bracket spacing', 2.6, fg.trippingSpacing, 'm', '<= 2,6 m · [2.4.1]'),
        lim('Panting structure spacing', 2, fg.pantingSpacing, 'm', '<= 2 m · [2.3.5]'),
        lim('Non-tight platform spacing', 2.5, fg.platformSpacing, 'm', '<= 2,5 m · [2.3.5]')
      ],
      beamLength: n(fg.beamLength), kWeb: kWeb
    };
  }

  /* Stem · [2.8]. Plate stem thicknesses are net; the bar stem area and
     thickness are gross — the rule mixes the two on one page. */
  function stem(st, d, sideShellSel) {
    var L = d.L;
    var k = NRIN.kOf(n(st.ReH, 235));
    var SB = n(st.stringerSpacing);
    var formula = (0.6 + 0.4 * SB) * (0.08 * L + 2.7) * Math.sqrt(k);
    var cap = 22 * Math.sqrt(k) - 1;
    var tStm = Math.min(formula, cap);

    var ratio = Math.min(Math.max(d.TSC / L, 0.05), 0.075);
    var AP = null, APnote = '';
    if (L <= 90) AP = (0.4 + 10 * ratio) * (0.009 * L * L + 20) * Math.sqrt(k);
    else if (L <= 200) AP = (0.4 + 10 * ratio) * (1.8 * L - 69) * Math.sqrt(k);
    else APnote = 'L > 200 m — the bar stem area is considered case by case';

    return {
      k: k, stringerSpacing: SB, tStmFormula: formula, tStmCap: cap, tStmRequired: tStm,
      ratio: ratio, APnote: APnote,
      plate: [
        req('t_Stm formula', formula, st.tFormulaSel, 'mm', '[2.8.1]'),
        req('t_Stm cap', cap, st.tCapSel, 'mm', '[2.8.1] · need not exceed 22 sqrt(k) - 1'),
        req('t_Stm required', tStm, st.tStmSel, 'mm', 'Governing net thickness'),
        req('t at TSC + Cw', 0.8 * tStm, st.tTaperSel, 'mm',
          '[2.8.1] · may taper to 0,8 t_Stm above TSC + 0,6 m')
      ],
      /* Spacing, so the ratio is the other way up. */
      plateSpacing: [
        lim('Diaphragm spacing', 1.2, st.diaphragmSpacing, 'm', '[2.8.1] · <= 1200 mm')
      ],
      bar: (AP === null ? [] : [
        req('Gross area AP', AP, st.APsel, 'cm2', '[2.8.2]'),
        req('Gross thickness tB', (0.4 * L + 13) * Math.sqrt(k), st.tBsel, 'mm',
          '[2.8.2] · tB = (0,4 L + 13) sqrt(k)'),
        req('Area at upper end', 2 / 3 * AP, st.APupperSel, 'cm2',
          '[2.8.2] · may taper to two thirds above the load waterline')
      ]),
      bulb: [
        req('Bulb fwd-end plating', tStm, st.bulbPlateSel, 'mm',
          '[2.7.4] · as the plate stem where anchors or cables may contact'),
        req('Thruster tunnel plating', n(sideShellSel), st.thrusterSel, 'mm',
          '[2.9.1] · not less than the adjacent shell plating')
      ],
      bulbSpacing: [
        lim('Diaphragm spacing (bulb)', 1, st.bulbDiaphragmSpacing, 'm', '[2.7.2] · about 1 m apart')
      ]
    };
  }

  /* ---------------------------------------------------------- solve ------- */
  function solve(I, fore) {
    var d = derive(I.ship);
    var slam = (fore.slamPoints || []).map(function (p) { return slamPoint(p, d); });
    var flare = (fore.flarePoints || []).map(function (p) {
      return flarePoint(p, d, n(fore.CS, 1.8));
    });

    var maxPSLI = 0, slamGov = '';
    slam.forEach(function (r) { if (r.PSLI > maxPSLI) { maxPSLI = r.PSLI; slamGov = r.name; } });
    var maxPFI = 0, flareGov = '';
    flare.forEach(function (r) { if (r.PFI > maxPFI) { maxPFI = r.PFI; flareGov = r.name; } });

    var plating = (fore.plating || []).map(function (el) { return platingRow(el, d); });
    var byName = {};
    plating.forEach(function (r) { byName[r.name] = r; });
    var stiffeners = (fore.stiffeners || []).map(function (el) {
      return stiffenerRow(el, d, byName);
    });

    var worstMin = null, worstMinName = '';
    plating.concat(stiffeners).forEach(function (r) {
      if (r.UC !== null && (worstMin === null || r.UC > worstMin)) {
        worstMin = r.UC; worstMinName = r.name;
      }
    });

    /* Panels. The slamming set only exists when slamming applies at all, and
       both sets carry the governing pressure from the point tables above. */
    var slamPanels = d.slammingRequired
      ? (fore.slamPanels || []).map(function (el) {
        return panelRow(el, d, maxPSLI, n(TABLES.Cd['flat bottom'], 1.3));
      })
      : [];
    var bowPanels = (fore.bowPanels || []).map(function (el) {
      return panelRow(el, d, maxPFI, n(TABLES.Cd['bow flare'], 1.2));
    });

    var worstPanel = null, worstPanelName = '';
    slamPanels.concat(bowPanels).forEach(function (r) {
      [r.UCt, r.UCz].forEach(function (u) {
        if (u !== null && (worstPanel === null || u > worstPanel)) {
          worstPanel = u; worstPanelName = r.name;
        }
      });
    });

    /* Floors, girders and the stem. The stem's thruster-tunnel row is tied to
       the side shell plate the designer selected on the minima sheet. */
    var side = byName['Side shell'];
    var fg = floorsGirders(fore.floorsGirders || {}, d);
    var st = stem(fore.stem || {}, d, side ? side.tSel : 0);

    /* ---- results envelope ------------------------------------------------
       The workbook rolls up the impact panels and the minima only, and says so
       in a note: floors, girders and the stem are left out. Both are reported
       here — `overall` covers everything that has a utilisation, and
       `overallPanelsAndMinima` reproduces the workbook's narrower scope so the
       two can be compared rather than one silently standing in for the other. */
    var rows = [];
    slamPanels.forEach(function (r) {
      rows.push({ name: r.name, kind: 'slam panel', UCt: r.UCt, UCz: r.UCz });
    });
    bowPanels.forEach(function (r) {
      rows.push({ name: r.name, kind: 'bow panel', UCt: r.UCt, UCz: r.UCz });
    });
    rows.forEach(function (r) {
      r.status = (r.UCt !== null && r.UCt <= 1 && r.UCz !== null && r.UCz <= 1) ? 'PASS' : 'FAIL';
    });

    function maxOf(list, pick) {
      var m = null;
      list.forEach(function (r) {
        var v = pick(r);
        if (v !== null && v !== undefined && (m === null || v > m)) m = v;
      });
      return m;
    }
    var worstPlating = maxOf(
      rows.map(function (r) { return r.UCt; })
        .concat(plating.map(function (r) { return r.UC; }))
        .map(function (v) { return { v: v }; }), function (r) { return r.v; });
    var worstStiffener = maxOf(
      rows.map(function (r) { return r.UCz; })
        .concat(stiffeners.map(function (r) { return r.UC; }))
        .map(function (v) { return { v: v }; }), function (r) { return r.v; });
    var maxTreq = maxOf(
      slamPanels.concat(bowPanels).map(function (r) { return { v: r.tReq }; })
        .concat(plating.map(function (r) { return { v: r.tMin }; })),
      function (r) { return r.v; });
    var maxZreq = maxOf(slamPanels.concat(bowPanels).map(function (r) { return { v: r.Zreq }; }),
      function (r) { return r.v; });

    var panelsAndMinimaPass = rows.every(function (r) { return r.status === 'PASS'; })
      && plating.every(function (r) { return r.UC === null || r.UC <= 1; })
      && stiffeners.every(function (r) { return r.UC === null || r.UC <= 1; });

    var extra = fg.requirements.concat(st.plate, st.bar, st.bulb);
    var extraSpacing = fg.spacing.concat(st.plateSpacing, st.bulbSpacing);
    var extraPass = extra.every(function (r) { return r.status !== 'FAIL'; })
      && extraSpacing.every(function (r) { return r.status !== 'EXCEEDS'; });

    var results = {
      rows: rows,
      worstPlating: worstPlating, worstStiffener: worstStiffener,
      maxTreq: maxTreq, maxZreq: maxZreq,
      maxPSLI: maxPSLI, maxPFI: maxPFI,
      overallPanelsAndMinima: panelsAndMinimaPass ? 'PASS' : 'FAIL',
      overall: (panelsAndMinimaPass && extraPass) ? 'PASS' : 'FAIL',
      floorsGirdersAndStemPass: extraPass
    };

    return {
      d: d, AC: AC4, slam: slam, flare: flare,
      slamPanels: slamPanels, bowPanels: bowPanels,
      floorsGirders: fg, stem: st, results: results,
      worstPanel: worstPanel, worstPanelGoverning: worstPanelName,
      plating: plating, stiffeners: stiffeners,
      worstMin: worstMin, worstMinGoverning: worstMinName,
      maxPSLI: maxPSLI, slamGoverning: slamGov,
      maxPFI: maxPFI, flareGoverning: flareGov,
      /* The same flare pressure re-scaled for the primary supporting members,
         which take CS = 1,1 rather than 1,8. */
      PFIforPSM: maxPFI / n(fore.CS, 1.8) * n(fore.CSpsm, 1.1),
      slammingRequired: d.slammingRequired
    };
  }

  return {
    setTables: setTables, ready: ready,
    AC4: AC4, derive: derive,
    hSL: hSL, slamPoint: slamPoint, CZof: CZof, flarePoint: flarePoint,
    cE: cE, platingMin: platingMin, platingRow: platingRow, stiffenerRow: stiffenerRow,
    panelRow: panelRow, floorsGirders: floorsGirders, stem: stem,
    solve: solve
  };
})();
