/* ============================================================================
   Input model.

   The whole point of merging five workbooks is this file: the ship particulars
   are declared once, in `ship`, and every module reads them. Each module then
   adds only what is genuinely its own — engine data for the machinery space,
   forward draught for the fore part, and so on.

   Defaults reproduce the worked examples the workbooks shipped with, so a fresh
   launch lands on a case that already means something.
   ============================================================================ */

window.NRIN = (function () {
  'use strict';

  var OPTIONS = {
    navigation: ['unrestricted navigation', 'summer zone', 'tropical zone', 'coastal area', 'sheltered area'],
    scenario: ['extreme sea', 'ballast water exchange'],
    assessment: ['direct strength', 'prescriptive'],
    yesNo: ['Yes', 'No'],
    autoMode: ['Auto', 'Manual'],
    shipGroup: ['other', 'tanker/bulker'],
    machLocation: ['within 0.4L', 'outside 0.4L'],
    bottomType: ['double', 'single'],
    reH: ['235', '315', '355', '390', '460'],
    reHnum: [235, 315, 355, 390, 460],
    acSet: ['AC-1', 'AC-2', 'AC-3'],
    psmModel: ['A', 'B', 'C'],
    stiffEnd: ['horizontal/upper', 'lower vertical', 'simply supported'],
    stiffEndCon: ['welded', 'bracket', 'sniped'],
    structureType: ['deckhouse', 'superstructure'],
    location: ['front', 'side', 'aft'],
    /* The exposure list is built from the corrosion table at run time so the
       dropdown and the lookup cannot fall out of step; this is the fallback
       before the table has loaded. */
    exposure: ['atmosphere', 'seawater', 'dry', 'ballast', 'cargo_oil', 'cofferdam', 'other']
  };

  /* Ch 4 Sec 1 Tab 2 — material factor. */
  var K_TABLE = { 235: 1, 315: 0.78, 355: 0.72, 390: 0.68, 460: 0.62 };
  function kOf(ReH) {
    var r = parseFloat(ReH);
    if (K_TABLE[r] !== undefined) return K_TABLE[r];
    /* Between tabulated grades, fall back to the nearest lower entry rather
       than inventing an interpolation the rule does not give. */
    var keys = Object.keys(K_TABLE).map(Number).sort(function (a, b) { return a - b; });
    var pick = keys[0];
    keys.forEach(function (k) { if (k <= r) pick = k; });
    return K_TABLE[pick];
  }

  /* Ch 4 Sec 3 Tab 1 — corrosion additions, ONE table for the whole app,
     injected from app/data/corrosion.json at start-up.

     Every one of the five source workbooks abridged this table its own way and
     three of the abridgements disagreed with the printed rule, so reading it
     once from the rule and letting every module share it is the only way the
     same compartment cannot mean two different things in two modules.

     Names are resolved through the alias map, so input saved against a
     workbook's own spelling still resolves. */
  var TC = null;

  function setCorrosion(json) { TC = json; }
  function corrosionReady() { return !!TC; }

  function tcKey(name) {
    if (!TC) return null;
    var k = String(name === null || name === undefined ? '' : name).trim();
    if (!k) return null;
    var lower = k.toLowerCase();
    var hit = null;
    TC.entries.forEach(function (e) { if (e.key === k || e.key === lower) hit = e.key; });
    if (hit) return hit;
    return TC.aliases[lower] || TC.aliases[k] || null;
  }

  /* The addition for ONE side. An unknown compartment returns 0 rather than a
     guess — a silent default here would quietly thin every plate that names
     something this table does not have. */
  function tcOf(name) {
    var key = tcKey(name);
    if (!key) return 0;
    var out = 0;
    TC.entries.forEach(function (e) { if (e.key === key) out = e.tc; });
    return out;
  }

  /* Rewrite every exposure name in an input model to its canonical key.

     The lookup resolves aliases, so the numbers were always right — but a
     dropdown built from the canonical keys cannot show a value spelled the
     workbook's way, and a browser silently displays the FIRST option instead.
     Touching such a field would then write that first option over the real
     one. Canonicalising on load keeps what is stored, what is shown and what
     is computed the same string.

     Walks the model rather than naming each list, so a module that grows a new
     row type is covered without being remembered here. */
  function canonicaliseExposures(node) {
    if (!TC || node === null || typeof node !== 'object') return 0;
    var changed = 0;
    if (Array.isArray(node)) {
      node.forEach(function (x) { changed += canonicaliseExposures(x); });
      return changed;
    }
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if ((k === 'exposure1' || k === 'exposure2') && typeof v === 'string' && v) {
        var key = tcKey(v);
        if (key && key !== v) { node[k] = key; changed++; }
      } else if (v && typeof v === 'object') {
        changed += canonicaliseExposures(v);
      }
    });
    return changed;
  }

  function corrosionEntries() { return TC ? TC.entries : []; }
  function corrosionNames() {
    return TC ? TC.entries.map(function (e) { return e.key; }) : [];
  }
  function corrosionLabel(name) {
    var key = tcKey(name), out = key || String(name);
    if (TC) TC.entries.forEach(function (e) { if (e.key === key) out = e.label; });
    return out;
  }

  /* ------------------------------------------------ input sanity ---------
     Nothing here is a rule check. These are the handful of ways a particulars
     block can be wrong in a way that produces a NUMBER rather than an error,
     which is the dangerous kind: a zero length divides, a zero coefficient
     sends a negative power to infinity, a draught above the scantling draught
     quietly changes which branch of a load formula runs.

     Two of these were live bugs before the checks existed — a blank load line
     length read as zero metres, and a waterplane coefficient that could reach
     the wave-parameter alpha as zero. Reporting them beats finding them in the
     third place they bite. */
  function checkShip(S) {
    var out = [];
    function num(k) { var v = parseFloat(S[k]); return isFinite(v) ? v : 0; }
    function bad(field, message) { out.push({ field: field, message: message, level: 'error' }); }
    function warn(field, message) { out.push({ field: field, message: message, level: 'warning' }); }

    ['L', 'B', 'D', 'TSC'].forEach(function (k) {
      if (num(k) <= 0) bad(k, k + ' must be greater than zero — it divides in the load chain.');
    });
    [['CB', 'Block coefficient at TSC'],
     ['CB_LC', 'Block coefficient at the considered condition'],
     ['CW_LC', 'Waterplane coefficient at the considered condition']].forEach(function (p) {
      var v = num(p[0]);
      if (v <= 0 || v > 1) {
        bad(p[0], p[1] + ' must be greater than zero and not above 1,00. '
          + 'It is raised to a negative power in the wave parameter, so zero does not fail — '
          + 'it silently changes which branch runs.');
      }
    });
    if (num('TLC') > num('TSC') && num('TSC') > 0) {
      warn('TLC', 'TLC is deeper than the scantling draught TSC. That is unusual; check which '
        + 'loading condition this block describes.');
    }
    if (num('TF') > num('TLC') && num('TLC') > 0) {
      warn('TF', 'The minimum forward draught TF is deeper than TLC.');
    }
    if (num('LLL') > 0 && Math.abs(num('LLL') - num('L')) > 0.25 * num('L')) {
      warn('LLL', 'LLL differs from L by more than a quarter. Check it — the deckhouse deck x/L '
        + 'divides by LLL, not L.');
    }
    if (num('D') > 0 && num('TSC') > num('D')) {
      bad('TSC', 'The scantling draught is deeper than the depth D.');
    }
    return out;
  }

  function defaults() {
    return {
      /* ---------------- project ---------------- */
      vessel: 'NR467 local scantlings', rules: 'BV NR467 Pt B (07/2026)',
      preparedBy: '', revision: 'Rev00',

      /* ---------------- ship particulars, shared by every module -------- */
      ship: {
        L: 140, LLL: 0, B: 22, D: 12,
        TSC: 8.5, TF: 2, TLC: 8.5, TBAL: 4.5,
        V: 15, CB: 0.75, CB_LC: 0.75, CW_LC: 0.886,
        navigation: 'unrestricted navigation', scenario: 'extreme sea',
        assessment: 'direct strength', bilgeKeel: 'Yes',
        gmMode: 'Auto', GM: 0, krMode: 'Auto', kr: 0, shipGroup: 'other',
        rho: 1.025, g: 9.81, x0: 0,
        t_res: 0.5, ReH_plate: '315', ReH_stiff: '315'
      },

      /* ---------------- machinery space · Ch 11 Sec 2 ------------------- */
      mach: {
        /* engine data, from the manufacturer */
        P: 6000, nr: 500, LE: 6, nG: 2,
        location: 'within 0.4L', bottomType: 'double', ReH: '235',

        /* double bottom · Tab 1 */
        ibBreadth: 900,
        ibSel: 12, marginSel: 14, centreGirderSel: 14, floorsSel: 11, ductKeelSel: 14,
        ibBoltedSel: 20,

        /* single bottom · Tab 2 */
        sbCentreSel: 15, sbFloorsSel: 15,
        floorHeightSel: 1.6, floorHeightRecessSel: 1.4,

        /* seatings · Tab 3 */
        bedplateAreaSel: 200, bedplateThk2Sel: 600, bedplateThk1Sel: 600,
        girderWeb2Sel: 400, girderWeb1Sel: 240, transWebSel: 140,

        /* arrangement · [2.1] to [2.3] */
        webFrames: 4, sideTransverses: 3, sideGirderSpacing: 2.4,
        dbFloorsEngine: 1, sbFloorsEngine: 1, sbFloorsElse: 2, manholeDepth: 0.35,
        platformSel: 8, casingCargoSel: 7, casingAccomSel: 6
      },

      /* ---------------- deckhouse · Ch 5 Sec 5 [5.4] and Ch 7 ----------- */
      dh: {
        /* Navigation coefficient nD is an input here, exactly as it is in the
           workbook: it comes from Tab 35 by notation and is entered directly
           rather than derived from the notation string on the Ship page. */
        nD: 1, tierShift: 0, Bx: 0,
        /* TR and the navigation wave constants are not held here — they are
           ship-level and come from the loads engine's derive(). */
        shipTypeA: 'No', acSet: 'AC-2', stiffEnd: 'lower vertical',

        /* Ch 1 Sec 3 [2.2] — decides which of the two side rules applies. */
        declaredType: 'deckhouse', lowestTierWidth: 14, inboardOffset: 2,

        geometry: {
          originFrame: 0,
          regions: [
            { name: 'Aft', endFrame: 25, spacing: 600 },
            { name: 'Cargo', endFrame: 161, spacing: 740 },
            { name: 'Fore', endFrame: 183, spacing: 600 }
          ],
          tiers: [
            { name: 'Tier 1', frame: 25, z: 12, width: 14, length: 12, height: 2.8, b1: 14, s: 740 },
            { name: 'Tier 2', frame: 25, z: 14.8, width: 14, length: 12, height: 2.8, b1: 14, s: 740 },
            { name: 'Tier 3', frame: '', z: 0, width: 0, length: 0, height: 0, b1: 0, s: 700 },
            { name: 'Tier 4', frame: '', z: 0, width: 0, length: 0, height: 0, b1: 0, s: 700 }
          ]
        },

        /* Front, both sides and aft for each live tier. */
        elements: [1, 2].reduce(function (out, t) {
          ['front', 'side port', 'side stbd', 'aft'].forEach(function (loc) {
            out.push({
              name: 'T' + t + ' ' + loc, tier: t,
              location: loc.indexOf('side') === 0 ? 'side' : loc,
              protection: 'No', tGross: 8, exposure1: 'atmosphere', exposure2: 'dry',
              ReHplate: 235, ReHstiff: 355, endLow: 'welded', endUp: 'welded',
              stiffener: 'HP 200x12'
            });
          });
          return out;
        }, []),

        decks: [1, 2].map(function (t) {
          return {
            name: 'T' + t + ' deck', tier: t, tSel: 6,
            exposure1: 'atmosphere', exposure2: 'dry',
            ReHplate: 235, ReHstiff: 355, fbdg: 12, stiffener: 'HP 200x12'
          };
        }),

        psm: [1, 2].map(function (t) {
          return {
            name: 'T' + t + ' deck PSM', tier: t, from: 'T' + t + ' deck',
            S: 3, model: 'A', acSet: 'AC-2',
            exposure1: 'atmosphere', exposure2: 'dry',
            ReH: 235, tSel: 6, stiffener: 'HP 200x12'
          };
        }),

        superSides: [1, 2].reduce(function (out, t) {
          ['port', 'stbd'].forEach(function (side) {
            out.push({
              name: 'T' + t + ' side ' + side, tier: t,
              ReHplate: 235, ReHstiff: 235, tSel: 8, stiffener: 'HP 100x8',
              exposure1: 'atmosphere', exposure2: 'dry'
            });
          });
          return out;
        }, [])
      },

      /* ---------------- fore part · Ch 5 Sec 5 [4.2] / [4.3], Ch 11 Sec 1 -- */
      fore: {
        CS: 1.8, CSpsm: 1.1,

        plating: [
          { name: 'Bottom shell', kind: 'shell', s: 700, ReH: 315, cF: 1, tSel: 8 },
          { name: 'Side shell', kind: 'shell', s: 700, ReH: 315, cF: 1, tSel: 8 },
          { name: 'Forecastle side', kind: 'shell', s: 700, ReH: 235, cF: 0.9, tSel: 7 },
          { name: 'Inner bottom', kind: 'innerBottom', s: 700, ReH: 235, cF: 1, tSel: 8 },
          { name: 'Deck (to bhd deck)', kind: 'deck', s: 700, ReH: 235, cF: 1, tSel: 7 },
          { name: 'Wash bulkhead', kind: 'washBulkhead', s: 700, ReH: 235, cF: 1, tSel: 7 }
        ],
        stiffeners: [
          { name: 'Bottom stiffeners', plating: 'Bottom shell', ReH: 315, twSel: 8 },
          { name: 'Side stiffeners', plating: 'Side shell', ReH: 315, twSel: 8 },
          { name: 'Inner bottom stiff.', plating: 'Inner bottom', ReH: 235, twSel: 8 },
          { name: 'Deck stiffeners', plating: 'Deck (to bhd deck)', ReH: 235, twSel: 8 }
        ],

        slamPoints: [
          { name: 'BS x/L 0.70', xL: 0.70, z: 0.1, beta: 15 },
          { name: 'BS x/L 0.80', xL: 0.80, z: 0.1, beta: 15 },
          { name: 'BS x/L 0.90', xL: 0.90, z: 0.1, beta: 15 },
          { name: 'BS x/L 0.95', xL: 0.95, z: 0.3, beta: 15 },
          { name: 'BS fore end', xL: 1.00, z: 0.5, beta: 15 }
        ],
        flarePoints: [
          { name: 'BF ballast wl', area: 'A', z: 4.5, alphaFlare: 35, betaEntry: 40 },
          { name: 'BF mid', area: 'A', z: 7, alphaFlare: 40, betaEntry: 35 },
          { name: 'BF upper', area: 'A', z: 10, alphaFlare: 45, betaEntry: 30 },
          { name: 'BF fc deck', area: 'A', z: 12.5, alphaFlare: 50, betaEntry: 25 },
          { name: 'BF area B', area: 'B', z: 8, alphaFlare: 45, betaEntry: 30 }
        ],

        slamPanels: [
          { name: 'Flat bottom plate', location: 'x/L 0.90', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.4, dShr: 800, ReH: 315, tSel: 14, stiffener: 'HP 200x12' },
          { name: 'Bottom long. stiff.', location: 'x/L 0.90', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.4, dShr: 800, ReH: 315, tSel: 14, stiffener: 'HP 240x12' },
          { name: 'Adjacent plate <500', location: 'x/L 0.95', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.4, dShr: 800, ReH: 315, tSel: 12, stiffener: 'HP 180x10' }
        ],
        bowPanels: [
          { name: 'Side shell plate', location: 'Area A · mid', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.6, dShr: 800, ReH: 315, tSel: 12, stiffener: 'HP 200x12' },
          { name: 'Side shell plate', location: 'Area A · upper', exposure1: 'atmosphere', ns: 2,
            s: 700, lbdg: 2.6, dShr: 800, ReH: 315, tSel: 11, stiffener: 'HP 260x12' },
          { name: 'Side stiffener', location: 'Area B', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.6, dShr: 800, ReH: 315, tSel: 11, stiffener: 'HP 220x12' }
        ],

        floorsGirders: {
          ReHweb: 315, webHeight: 1.2, webThk: 9, faceAreaLong: 40, faceAreaTransv: 22,
          faceThk: 12, frameSpacing: 2.4,
          floorsTransv: 2.4, floorsLong: 2.4, girdersTransv: 2.2, girdersLong: 3.2,
          webFrameSpacing: 2.6, stringerSpan: 8, trippingSpacing: 2.4, pantingSpacing: 1.9,
          platformSpacing: 2.4,
          beamLength: 6, stringerDepth: 800, stringerThk: 9, pantingArea: 50, pantingInertia: 600
        },
        stem: {
          ReH: 235, stringerSpacing: 1,
          tFormulaSel: 15, tCapSel: 25, tStmSel: 16, tTaperSel: 13, diaphragmSpacing: 1.1,
          APsel: 170, tBsel: 65, APupperSel: 115,
          bulbPlateSel: 16, bulbDiaphragmSpacing: 1, thrusterSel: 12
        }
      },

      /* ---------------- aft part · Ch 5 Sec 5 [4.2.2], Ch 11 Sec 3 -------- */
      aft: {
        slamPoints: [
          { name: 'SS at AE', xL: 0, z: 3, beta: 18 },
          { name: 'SS x/L 0.05', xL: 0.05, z: 3.5, beta: 18 },
          { name: 'SS x/L 0.10', xL: 0.10, z: 4, beta: 18 },
          { name: 'SS x/L 0.15', xL: 0.15, z: 5, beta: 18 },
          { name: 'SS x/L 0.20', xL: 0.20, z: 5.5, beta: 18 }
        ],
        plating: [
          { name: 'Bottom and side', kind: 'shell', s: 700, ReH: 315, cF: 1, tSel: 12 },
          { name: 'Inner bottom', kind: 'innerBottom', s: 700, ReH: 235, cF: 1, tSel: 11 },
          { name: 'Strength deck', kind: 'deck', s: 700, ReH: 235, cF: 1, tSel: 9 },
          { name: 'Platform / wash bhd', kind: 'platform', s: 700, ReH: 235, cF: 1, tSel: 8 }
        ],
        stiffeners: [
          { name: 'Bottom / side stiff.', plating: 'Bottom and side', ReH: 315, twSel: 8 },
          { name: 'Inner bottom stiff.', plating: 'Inner bottom', ReH: 235, twSel: 8 },
          { name: 'Deck stiffeners', plating: 'Strength deck', ReH: 235, twSel: 8 },
          { name: 'Platform / wash stiff.', plating: 'Platform / wash bhd', ReH: 235, twSel: 8 }
        ],
        machineryPlatform: { ReH: 235, tSel: 8 },
        panels: [
          { name: 'Flat bottom plate', location: 'at AE', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.4, dShr: 800, ReH: 315, tSel: 16, stiffener: 'HP 220x12' },
          { name: 'Bottom long. stiff.', location: 'at AE', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.4, dShr: 800, ReH: 315, tSel: 16, stiffener: 'HP 280x12' },
          { name: 'Adjacent plate', location: 'x/L 0.15', exposure1: 'sea water', ns: 2,
            s: 700, lbdg: 2.4, dShr: 800, ReH: 315, tSel: 13, stiffener: 'HP 200x12' }
        ],
        aftPeak: {
          stiffenerLength: 3.5, hstfFlat: 300, hstfBulb: 260, totalLength: 5.5,
          floorsPerFrame: 1, sideTransvHorn: 2, sideTransvOther: 4, sideTransvAP: 5,
          peakDepth: 2.4, spaceBreadth: 16
        },
        sternFrame: {
          plateBreadth: 700, shellSel: 19, bossSel: 21,
          aSel: 700, bSel: 480, t1Sel: 34, tdSel: 18, bossThkSel: 300,
          transomSel: 14, postExtSel: 3000, hornRadiusSel: 400
        }
      }
    };
  }

  return {
    OPTIONS: OPTIONS, defaults: defaults, kOf: kOf, K_TABLE: K_TABLE,
    checkShip: checkShip,
    setCorrosion: setCorrosion, corrosionReady: corrosionReady,
    tcOf: tcOf, tcKey: tcKey, canonicaliseExposures: canonicaliseExposures,
    corrosionEntries: corrosionEntries, corrosionNames: corrosionNames,
    corrosionLabel: corrosionLabel
  };
})();
