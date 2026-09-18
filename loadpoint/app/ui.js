/* LoadPoint UI: Nauticus-style columns (one calculation point per column) on
   three boards - Pressure, Accelerations, Plate & Stiffeners - plus the ship page.
   All numbers come from calc.js / accel.js / tank.js / engine.js / scantling.js;
   nothing is computed here. State lives in S and is mirrored to localStorage. */
(function () {
  'use strict';
  var E = window.LoadPointEngine, Sea = window.LoadPoint, Pos = window.LoadPointPos;
  var CLASSES = [['dnv', 'DNV RU-SHIP Pt 3 (July 2026)'], ['bv', 'BV NR467 Pt B (July 2026)'], ['lrssc', 'LR SSC Pt 5-6 (July 2026)'], ['lr', 'LR Rules for Ships Pt 3-4 (July 2026)']];
  var isBV = function () { return S.ship.cls === 'bv'; };
  var isSSC = function () { return S.ship.cls === 'lrssc'; };
  var isLR = function () { return S.ship.cls === 'lr'; };
  var Lr = window.LRShips;
  var Lssc = window.LRSSCLoads, Sssc = window.LRSSCScant;
  var accOf = function () { return isBV() ? window.BVAccel : window.LoadPointAccel; };
  var scOf = function () { return isBV() ? window.BVScant : window.LoadPointScant; };
  var g = 9.81;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); };
  var f2 = function (v, d) { return (v === null || v === undefined || isNaN(v)) ? '-' : Number(v).toFixed(d === undefined ? 2 : d); };

  /* ---------------- state ---------------- */
  var KEY = 'loadpoint.state.v1';
  var defShip = function () {
    return { cls: 'dnv', name: '', L: 120.78, B: 17.2, D: 9.8, T_SC: 7.1, T_BAL: 4.106, C_B: 0.821, C_W: 0.88, C_B_BAL: '', C_W_BAL: '', GM: '', k_r: '', bilgeKeel: true, service: 'R0',
             nav: 'unrestricted', roro: false, prescriptive: true, tanker: false, decksAbove07D: 1, L_LL: '', typeA: false, x0: 0, frames: '0:0.6',
             /* LR SSC */ L_WL: '', disp: '', V: '', mode: 'disp', H_s: '', group: 'G4', stype: 'passenger', hull: 'none', craft: 'Mono', x_LCG: '', z_k: 0, theta_D: '', theta_trim: '', B_c: '', B_W: '',
             /* LR Ships */ matHull: 235, F_D: '', F_B: '', fbType: 'B', H_b: '', rho: 1.025, decks: 1 };
  };
  var COMP_KINDS = [['none', 'No compartment'], ['sea', 'External sea'], ['ballast', 'Ballast tank'], ['fresh', 'Fresh water tank'],
                    ['fuel', 'Fuel / lube oil tank'], ['cargo', 'Cargo tank (liquid)'], ['other', 'Other tank'], ['deck', 'Deck / platform (distributed load)'],
                    ['weather', 'Weather deck (green sea)'], ['sside', 'Superstructure side (P_SI)'], ['flood', 'Flooded (watertight boundary)'], ['tankInt', 'Internal structure in tank'],
                    ['dryHold', 'Dry cargo hold (upper part)'], ['dryHoldLower', 'Dry cargo hold, lower 1.5 m / inner bottom'],
                    ['void', 'Void / dry space'], ['voidDeck', 'Void / dry space (deck upper surface)'], ['accommodation', 'Accommodation']];
  var defComp = function (kind) {
    return { kind: kind || 'none', tank: { z_top: 9.3, h_air: 0.76, x_top: 0, y_top: 0, l_fs: 4, b_top: 3, x_G: 0, y_G: 0, z_G: 5, rho_L: 1.025, P_PV: 0, prv: false, noOverfill: false, cargoTank: false },
             P_dls: 2.5, wd: { z_dk: 9.8, z_fdk: 9.8, B_dk: '', L_LL: '', x_LL: '', typeA: false }, z_fd: 9.8, collision: false };
  };
  var SCEN = [['all', '-All-'], ['extSD', 'ExtremeSea S+D'], ['extS', 'ExtremeSea S (static)'], ['bweSD', 'BWExchange S+D'], ['harbS', 'Harbour S'], ['testS', 'Testing S'], ['floodS', 'Flooding S']];
  var defSSC = function () { return { B_x: '', T_x: '', theta_B: '', theta_S: '', z_deck: '', h_b: '', W_cdp: '', sheltered: false, ssAft: false, stepped: false, G_o: '', continuous: true, crowd: false, a_z_g: '' }; };
  var defLR = function () { return { S: '', H_td: '', p_a: '', C: '', accommodation: false, tier: 1, sheltered: false, h_4: '', deepTank: false, X: '', face: 'aft', b: '', casing: false, insideOpenings: false, deckLevel: 'second', tankBottom: false, underHatch: false, z_bilge: '', t_c: '', H: '', brackets: 'two', la_l: 1, w1: 1, w2: 1, tween: false, aftPeak: false, peak: false, S_1: '', tankSide: false, deckhouse: false, shortErection: false, sideSpan: false, continuous: true, member: 'secondary' }; };
  var defPressCol = function () { return { name: '', X: '#0', Y: 0, Z: 0, B_x: '', member: 'side', comp1: defComp('none'), comp2: defComp('sea'), scenario: 'all', showCases: false, ssc: defSSC(), lr: defLR() }; };
  var defAccCol = function () { return { name: '', X: '#60', Y: 0, Z: 9800, draught: 'T_SC', bwe: false, showCases: true }; };
  var defScantCol = function () {
    return { name: '', X: '#15', Y: 0, Z: 9300, a: 2400, b: 740, comp1: defComp('none'), comp2: defComp('none'), scenario: 'all',
             member: 'strengthDeck', stiffening: 'long', vertical: false, tp: 8, matP: 235, profType: 'FB', hp: 'HP100x8', h: 100, t: 8, bf: 0, tf: 0,
             matS: 235, s: 690, l: 2.4, l_bdg: 2.4, l_shr: 2.4, fixity: 'fixed', sigma_hg: 0, fbLateral: false, phi_w: 90,
             ssc: defSSC(), sscMember: 'secondary', sscModel: 'auto', curv_h: 0, matSSC: 'MS (A/B/D/E)', matSSCs: 'MS (A/B/D/E)', lr: defLR() };
  };
  var S = { page: 1, ship: defShip(), press: [defPressCol()], acc: [defAccCol()], scant: [defScantCol()] };
  try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.ship) S = saved; } catch (e) {}
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  /* ship as the calc modules want it */
  function shipModel() {
    var s = S.ship, num = function (v) { return v === '' || v === null || isNaN(parseFloat(v)) ? undefined : parseFloat(v); };
    var zones = String(s.frames || '').split(',').map(function (z) { var p = z.split(':'); return { from: parseFloat(p[0]), s: parseFloat(p[1]) }; }).filter(function (z) { return !isNaN(z.from) && !isNaN(z.s); });
    return { cls: s.cls || 'dnv', L: +s.L, B: +s.B, D: +s.D, T_SC: +s.T_SC, T_BAL: num(s.T_BAL), C_B: +s.C_B, C_W: num(s.C_W) || 0.85, C_B_BAL: num(s.C_B_BAL), C_W_BAL: num(s.C_W_BAL),
             nav: s.nav || 'unrestricted', roro: !!s.roro, prescriptive: s.prescriptive !== false, GM: num(s.GM), k_r: num(s.k_r), bilgeKeel: !!s.bilgeKeel,
             service: s.service || 'R0', tanker: !!s.tanker, decksAbove07D: +s.decksAbove07D || 0, L_LL: num(s.L_LL), typeA: !!s.typeA,
             frames: { x0: +s.x0 || 0, zones: zones },
             /* LR SSC (T = T_SC) */
             T: +s.T_SC, L_WL: num(s.L_WL) || +s.L, disp: num(s.disp), V: num(s.V) || 0, mode: s.mode || 'disp', H_s: num(s.H_s), group: s.group || 'G4', stype: s.stype || 'passenger',
             hull: s.hull || 'none', craft: s.craft || 'Mono', x_LCG: num(s.x_LCG), z_k: num(s.z_k) || 0, theta_D: num(s.theta_D), theta_trim: num(s.theta_trim), B_c: num(s.B_c), B_W: num(s.B_W),
             /* LR Ships */ k_L: Lr ? Lr.kL(+s.matHull || 235) : 1, F_D: num(s.F_D), F_B: num(s.F_B), fbType: s.fbType || 'B', H_b: num(s.H_b), rho: num(s.rho) || 1.025, decks: +s.decks || 1 };
  }
  function pointOf(ship, col) {
    return { x: E.parseX(ship, col.X), y: (+col.Y || 0) / 1000, z: (+col.Z || 0) / 1000, B_x: col.B_x === '' || col.B_x === undefined ? undefined : +col.B_x };
  }
  function compModel(c, ship) {
    var k = c.kind, m = { kind: k };
    if (['ballast', 'fresh', 'fuel', 'cargo', 'other'].indexOf(k) >= 0) {
      var t = c.tank; m.tank = { kind: k, z_top: +t.z_top, h_air: +t.h_air || 0, x_top: +t.x_top, y_top: +t.y_top, l_fs: +t.l_fs, b_top: +t.b_top, x_G: +t.x_G, y_G: +t.y_G, z_G: +t.z_G,
                                 rho_L: +t.rho_L || 1.025, P_PV: +t.P_PV || 0, P_pv: +t.P_PV || 0, prv: !!t.prv, noOverfill: !!t.noOverfill, cargoTank: !!t.cargoTank || k === 'cargo',
                                 h_OF: +t.h_air || 0, overflowLarge: !!t.overflowLarge, dryDock: !!t.dryDock, z_bd: +t.z_bd || 0 };
    }
    if (k === 'deck' || k === 'weather') m.P_dls = +c.P_dls || 0;
    if (k === 'weather') { var w = c.wd; m.wd = { z_dk: +w.z_dk, z_fdk: +w.z_fdk, tier: +w.tier || 1, B_dk: +w.B_dk || undefined, L_LL: +w.L_LL || ship.L_LL || undefined, x_LL: w.x_LL === '' ? undefined : +w.x_LL, typeA: !!w.typeA || ship.typeA }; }
    if (k === 'flood') { m.z_fd = +c.z_fd; m.collision = !!c.collision; }
    return m;
  }
  /* corrosion key of a compartment kind (Ch 3 Sec 3 Table 1) */
  var TCKEY = { none: 'none', sea: 'sea', ballast: 'ballast', fresh: 'fresh', fuel: 'fuel', cargo: 'cargoOil', other: 'other', deck: 'accommodation', weather: 'sea', sside: 'sea',
                flood: 'void', tankInt: 'ballast', dryHold: 'dryHold', dryHoldLower: 'dryHoldLower', void: 'void', voidDeck: 'voidDeck', accommodation: 'accommodation' };

  /* ---------------- generic row builders ---------------- */
  function rIn(label, path, val, unit, attrs) {
    return '<div class="lp-row"><label>' + label + (unit ? ' <span class="lp-unit">[' + unit + ']</span>' : '') + '</label>' +
      '<input class="lp-in" data-path="' + path + '" value="' + esc(val === undefined || val === null ? '' : val) + '"' + (attrs || '') + '></div>';
  }
  function rSel(label, path, val, opts) {
    return '<div class="lp-row"><label>' + label + '</label><select class="lp-in" data-path="' + path + '">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(val) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
  }
  function rChk(label, path, val) {
    return '<div class="lp-row"><label>' + label + '</label><input type="checkbox" class="lp-in" data-path="' + path + '"' + (val ? ' checked' : '') + '></div>';
  }
  function rOut(label, val, cls, title) {
    return '<div class="lp-row lp-out' + (cls ? ' ' + cls : '') + '"' + (title ? ' title="' + esc(title) + '"' : '') + '><label>' + label + '</label><span>' + val + '</span></div>';
  }
  function rHead(t) { return '<div class="lp-head">' + t + '</div>'; }
  function rSub(t) { return '<div class="lp-sub">' + t + '</div>'; }

  function compEditor(prefix, c, label) {
    var h = rSel(label, prefix + '.kind', c.kind, COMP_KINDS);
    var k = c.kind;
    if (['ballast', 'fresh', 'fuel', 'cargo', 'other'].indexOf(k) >= 0) {
      var t = c.tank, p = prefix + '.tank.';
      h += rIn('Tank top z_top', p + 'z_top', t.z_top, 'm') + rIn(isBV() ? 'Overflow height above tank top h_OF' : 'Air pipe height h_air', p + 'h_air', t.h_air, 'm') +
           rIn('Tank top centre x_top', p + 'x_top', t.x_top, 'm') + rIn('Tank top centre y_top', p + 'y_top', t.y_top, 'm') +
           rIn('Tank top length l_fs', p + 'l_fs', t.l_fs, 'm') + rIn('Tank top breadth b_top', p + 'b_top', t.b_top, 'm') +
           rIn('Tank CoG x_G', p + 'x_G', t.x_G, 'm') + rIn('Tank CoG y_G', p + 'y_G', t.y_G, 'm') + rIn('Tank CoG z_G', p + 'z_G', t.z_G, 'm') +
           rIn('Liquid density ρ_L', p + 'rho_L', t.rho_L, 't/m³');
      if (k === 'cargo' || k === 'other' || isBV()) h += rIn(isBV() ? 'Design vapour pressure P_pv (0 without relief valve)' : 'Design overpressure P_PV', p + 'P_PV', t.P_PV, 'kN/m²') + (isBV() ? '' : rChk('Pressure relief valve', p + 'prv', t.prv));
      if (isBV()) h += rChk('Overflow area > 2 x filling pipe (P_drop = 0)', p + 'overflowLarge', t.overflowLarge) + rChk('Tank tested in dry dock (no P_ex)', p + 'dryDock', t.dryDock) + rIn('Bulkhead deck z_bd (testing, 0 = ignore)', p + 'z_bd', t.z_bd, 'm');
      if (k === 'ballast' || k === 'fresh') h += rChk('Not intended for overfilling', p + 'noOverfill', t.noOverfill);
      if (k === 'ballast') h += rChk('Ballast in cargo tank (f_ull 0.62/0.67)', p + 'cargoTank', t.cargoTank);
    }
    if (k === 'deck') h += rIn('Distributed load P_dl-s', prefix + '.P_dls', c.P_dls, 'kN/m²');
    if (k === 'weather') {
      var w = c.wd, q = prefix + '.wd.';
      h += (isBV() ? rIn('Superstructure tier (1 = freeboard deck / lowest tier)', q + 'tier', w.tier === undefined ? 1 : w.tier) : rIn('Deck lowest point z_dk', q + 'z_dk', w.z_dk, 'm') + rIn('Freeboard deck at side z_fdk', q + 'z_fdk', w.z_fdk, 'm')) +
           rIn('Deck breadth B_dk (blank = B)', q + 'B_dk', w.B_dk, 'm') + rIn('Freeboard length L_LL (blank = L)', q + 'L_LL', w.L_LL, 'm') +
           rIn('x from aft end of L_LL (blank = x)', q + 'x_LL', w.x_LL, 'm') + rChk('Type A / B-60 / B-100 freeboard', q + 'typeA', w.typeA) +
           rIn('Distributed load on deck P_dl-s (0 = none)', prefix + '.P_dls', c.P_dls, 'kN/m²');
    }
    if (k === 'flood') h += rIn('Freeboard deck at side z_fd', prefix + '.z_fd', c.z_fd, 'm') + rChk('Collision bulkhead (AC-I)', prefix + '.collision', c.collision);
    return h;
  }

  /* ---------------- boards ---------------- */
  function pointRows(prefix, col) {
    return rIn('X position (frame #n or mm)', prefix + '.X', col.X) + rIn('Y position', prefix + '.Y', col.Y, 'mm') + rIn('Z position', prefix + '.Z', col.Z, 'mm');
  }
  /* the structural position (Nauticus "position code") - one row on every board where a rule reads it */
  function posRow(prefix, col) {
    if (!col.member) col.member = col.comp2 && col.comp2.kind === 'weather' ? 'weatherDeck' : (col.comp2 && col.comp2.kind === 'sside' ? 'sside' : 'side');
    if (!col.ssc) col.ssc = defSSC();
    if (!col.lr) col.lr = defLR();
    return rSel('Position code', prefix + '.member', col.member, Pos.options(S.ship.cls));
  }
  /* LR SSC: the inputs the design-pressure tables need for this position (Pt 5 Ch 3 Tab 3.3.1 / Ch 4 Tab 4.3.1) */
  function sscEditor(prefix, col) {
    var k = Lssc.posKind(col.member), c = col.ssc, q = prefix + '.ssc.', nd = S.ship.mode === 'nondisp', h = '';
    if (k === 'bottom' || k === 'side' || k === 'innerBottom' || k === 'coachroof' || k === 'deckhouse' || k === 'weatherDeck' || k === 'ssDeck')
      h += rIn('Waterline breadth at section B_x (blank = B)', q + 'B_x', c.B_x, 'm') + rIn('Local draught T_x (blank = T)', q + 'T_x', c.T_x, 'm');
    if (k === 'bottom' || k === 'side') h += rIn('Mean deadrise of bottom plating θ_B at section', q + 'theta_B', c.theta_B, '°') + rIn('Mean deadrise of side plating θ_S at section', q + 'theta_S', c.theta_S, '°');
    if (k === 'side' || k === 'deckhouse') h += rIn('Weather deck at side z_deck (blank = D)', q + 'z_deck', c.z_deck, 'm');
    if (nd && (k === 'bottom' || k === 'side')) h += rIn('Support girth G_o at LCG (blank = B)', q + 'G_o', c.G_o, 'm') + rChk('Craft in continuous contact with water (Φ distribution)', q + 'continuous', c.continuous !== false);
    if (k === 'weatherDeck' || k === 'ssDeck' || k === 'coachroof' || k === 'interior') {
      if (k !== 'interior') h += rChk('Sheltered deck (E = 0)', q + 'sheltered', c.sheltered);
      if (k === 'ssDeck') h += rChk('Superstructure deck aft of the forward quarter (E = 0)', q + 'ssAft', c.ssAft);
      if (k === 'coachroof') h += rChk('Subject to loads from crew or passengers (min 5.0)', q + 'crowd', c.crowd);
      h += rIn('Designer deck load W_CDP (0 = none)', q + 'W_cdp', c.W_cdp, 'kN/m²');
      if (!nd) h += rIn('a_z/g at the point for P_cd (blank = 0.5 min)', q + 'a_z_g', c.a_z_g);
    }
    if (k === 'deckhouse' && col.member === 'sside') h += rChk('Superstructure side stepped in >= 1.0 m (C_1 0.64)', q + 'stepped', c.stepped);
    if (k === 'wtBhd' || k === 'deepTank') h += rIn('Load head h_b (' + (k === 'deepTank' ? 'to tank top / half to overflow, greater' : 'to bulkhead deck at side') + ')', q + 'h_b', c.h_b, 'm');
    if (k === 'none') h += '<div class="lp-hint">No SSC design pressure is defined for this position - choose a shell, deck, deckhouse, inner bottom or bulkhead position.</div>';
    return h;
  }
  function sscModel(col) {
    var c = col.ssc || defSSC(), n = function (v) { return v === '' || v === undefined || v === null || isNaN(parseFloat(v)) ? undefined : parseFloat(v); };
    return { B_x: n(c.B_x), T_x: n(c.T_x), theta_B: n(c.theta_B) || 0, theta_S: n(c.theta_S) || 90, z_deck: n(c.z_deck), h_b: n(c.h_b) || 0, W_cdp: n(c.W_cdp) || 0, sheltered: !!c.sheltered, ssAft: !!c.ssAft,
             stepped: !!c.stepped, G_o: n(c.G_o), continuous: c.continuous !== false, crowd: !!c.crowd, a_z_g: n(c.a_z_g) };
  }
  /* LR Ships: inputs the tables of the position need. scant: also the scantling-side inputs */
  function lrEditor(prefix, col, scant) {
    var k = Lr.posKind(col.member), c = col.lr, q = prefix + '.lr.', h = '';
    var shell = k === 'bottom' || k === 'side' || k === 'sheer';
    if (k === 'sdeck' || k === 'ldeck') { if (k === 'ldeck') h += rChk('Accommodation deck (h_3 = 1.2 m)', q + 'accommodation', c.accommodation); h += rIn('Specified cargo loading p_a (blank = standard)', q + 'p_a', c.p_a, 'kN/m²'); if (k === 'ldeck' && !c.accommodation) h += rIn('Tween-deck cargo height H_td', q + 'H_td', c.H_td, 'm') + rIn('Stowage rate C for p_a (blank = 1.39)', q + 'C', c.C, 'm³/t'); }
    if (k === 'ssDeck') h += rIn('Tier (1 = on the deck D is measured to)', q + 'tier', c.tier) + rChk('Sheltered (not exposed to weather)', q + 'sheltered', c.sheltered);
    if (k === 'sdeck' || k === 'ldeck' || k === 'ib' || shell) h += rIn('Tank head h_4 if the position bounds a tank (0 = none)', q + 'h_4', c.h_4, 'm');
    if (k === 'wtBhd' || k === 'deepTank') h += rIn('Load head h_4 (' + (k === 'deepTank' ? 'to tank top / half to overflow' : 'to 0.91 m above bulkhead deck or z_FD') + ')', q + 'h_4', c.h_4, 'm');
    if (k === 'none') h += '<div class="lp-hint">No LR table row for this position - choose a shell, deck, inner bottom, bulkhead or erection position.</div>';
    if (k === 'erection') { h += rIn('Tier', q + 'tier', c.tier) + rIn('X, bulkhead from A.P. (blank = x)', q + 'X', c.X, 'm') + rIn('Deckhouse breadth b (blank = B)', q + 'b', c.b, 'm') + rChk('Exposed machinery casing (δ = 1)', q + 'casing', c.casing); if (col.member === 'dhOther') h += rSel('Face', q + 'face', c.face, [['aft', 'Aft end'], ['frontProtected', 'Protected front']]); }
    if (!scant) return h;
    h += rHead('Panel definition') + rSel('Framing', prefix + '.stiffening', col.stiffening, [['long', 'Longitudinal'], ['trv', 'Transverse / vertical']]) + rIn('Primary member spacing S', q + 'S', c.S, 'm');
    if (k === 'sdeck') h += rChk('Inside line of openings', q + 'insideOpenings', c.insideOpenings) + rChk('Short bridge / poop (K_2 133)', q + 'shortErection', c.shortErection) + rChk('Beam span adjacent to ship side (K_3 3.6)', q + 'sideSpan', c.sideSpan);
    if (k === 'ldeck') h += rSel('Deck level', q + 'deckLevel', c.deckLevel, [['second', 'Second deck'], ['third', 'Third / platform deck']]) + rChk('Inside line of openings', q + 'insideOpenings', c.insideOpenings) + rChk('Bottom of a tank (K_1 2.5)', q + 'tankBottom', c.tankBottom);
    if (k === 'ssDeck') h += rChk('Deckhouse deck (2.4.3 beams)', q + 'deckhouse', c.deckhouse);
    if (k === 'ib') h += rChk('Under hatchway without ceiling (+ 2 mm)', q + 'underHatch', c.underHatch);
    if (shell) h += rIn('Upper turn of bilge z_bilge', q + 'z_bilge', c.z_bilge, 'm') + rIn('Midship thickness t_c for taper at the ends', q + 'lr_tc', c.t_c, 'mm');
    if (shell && col.stiffening === 'trv') h += rIn('Framing depth H (≥ 3.5 main, ≥ 2.5 tween)', q + 'H', c.H, 'm') + rChk('Tween-deck frame', q + 'tween', c.tween) + rSel('End brackets', q + 'brackets', c.brackets, [['two', 'Two Rule standard (C 3.4)'], ['one', 'One Rule standard (6.1)'], ['none', 'None (7.3)'], ['stdReduced', 'One standard + one reduced'], ['twoReduced', 'Two reduced'], ['oneReduced', 'One reduced']]) + rIn('l_a / l for reduced brackets', q + 'la_l', c.la_l) + rChk('Frame in way of tank / ballast hold (Tab 1.6.3 (2))', q + 'tankSide', c.tankSide) + rChk('Peak frame (Tab 5.4.2 / 6.4.2 (1))', q + 'peak', c.peak) + rIn('Peak stringer spacing S_1', q + 'S_1', c.S_1, 'm');
    if (shell) h += rChk('Aft of the after peak bulkhead', q + 'aftPeak', c.aftPeak) + rChk('Forward of the collision bulkhead', q + 'forePeak', c.forePeak);
    if (k === 'wtBhd' || k === 'deepTank') h += rIn('End constraint ω_1 (Tab 1.9.3)', q + 'w1', c.w1) + rIn('End constraint ω_2', q + 'w2', c.w2);
    h += rChk('Flat bar continuous at bulkheads (18 √k_L)', q + 'continuous', c.continuous !== false);
    return h;
  }
  function lrModel(col) {
    var c = col.lr || defLR(), n = function (v) { return v === '' || v === undefined || v === null || isNaN(parseFloat(v)) ? undefined : parseFloat(v); };
    return { S: n(c.S), H_td: n(c.H_td), p_a: n(c.p_a), C: n(c.C), accommodation: !!c.accommodation, tier: n(c.tier) || 1, sheltered: !!c.sheltered, h_4: n(c.h_4), deepTank: Lr.posKind(col.member) === 'deepTank', X: n(c.X), face: c.face || 'aft', b: n(c.b), casing: !!c.casing,
             insideOpenings: !!c.insideOpenings, deckLevel: c.deckLevel || 'second', tankBottom: !!c.tankBottom, underHatch: !!c.underHatch, z_bilge: n(c.z_bilge), t_c: n(c.lr_tc !== undefined ? c.lr_tc : c.t_c), H: n(c.H), brackets: c.brackets || 'two', la_l: n(c.la_l) || 1, w1: n(c.w1) || 0, w2: n(c.w2) || 0,
             tween: !!c.tween, aftPeak: !!c.aftPeak, forePeak: !!c.forePeak, peak: !!c.peak, S_1: n(c.S_1), tankSide: !!c.tankSide, deckhouse: !!c.deckhouse, shortErection: !!c.shortErection, sideSpan: !!c.sideSpan, continuous: c.continuous !== false };
  }
  /* which external load the position carries, per the design load table of the class */
  function posLoadNote(member) {
    if (isLR()) { var kl = Lr.posKind(member); return Pos.name(member) + ' → ' + { bottom: 'bottom shell / bilge rows (Tab 1.5.2, 1.6.1 (3))', side: 'side shell rows (Tab 1.5.3, 1.6.1 (1), 1.6.3)', sheer: 'sheerstrake rows (Tab 1.5.3 (2))', sdeck: 'strength / weather deck rows (Tab 1.4.1, 1.4.3, 1.4.5)', ldeck: 'lower deck rows (Tab 1.4.2, 1.4.4, 1.4.5)', ssDeck: 'erection deck rows (Tab 8.2.2, 2.4)', ib: 'inner bottom (8.4)', wtBhd: 'watertight bulkhead (Tab 1.9.1)', deepTank: 'deep tank bulkhead (Tab 1.9.1)', erection: 'erection bulkhead (Pt 3 Ch 8)', none: 'no row' }[kl]; }
    if (isSSC()) { var kk = Lssc.posKind(member); return Pos.name(member) + ' → ' + { bottom: 'bottom shell row', side: 'side shell row', weatherDeck: 'weather deck row', ssDeck: 'exposed superstructure deck row', coachroof: 'coachroof row', interior: 'interior deck row', deckhouse: 'deckhouse / superstructure row (P_dhp)', innerBottom: 'inner bottom row', wtBhd: 'watertight bulkhead row (P_bh)', deepTank: 'deep tank bulkhead row (P_bh)', none: 'no row' }[kk] + (S.ship.mode === 'nondisp' ? ' (Pt 5 Ch 3 Tab 3.3.1)' : ' (Pt 5 Ch 4 Tab 4.3.1)'); }
    var ext = Pos.externalKind(member), ref = isBV() ? 'Ch 7 Sec 2 Tab 1' : 'Ch 4 Sec 7 Tab 1';
    var what = ext === 'sea' ? 'external shell: P_S + P_W' : ext === 'weather' ? 'exposed deck: P_D (green sea)' : ext === 'sside' ? 'superstructure side: max(P_W, P_SI)' : 'internal position: no external sea load';
    return Pos.name(member) + ' → ' + what + ' (' + ref + ')';
  }
  function casesTable(rows, cols) {
    var h = '<table class="lp-cases"><tr>' + cols.map(function (c) { return '<th>' + c[0] + '</th>'; }).join('') + '</tr>';
    rows.forEach(function (r) { h += '<tr' + (r._best ? ' class="best"' : '') + '>' + cols.map(function (c) { var v = r[c[1]]; return '<td>' + (typeof v === 'number' ? f2(v, c[2] === undefined ? 2 : c[2]) : v) + '</td>'; }).join('') + '</tr>'; });
    return h + '</table>';
  }

  /* LR SSC pressure column: position-driven sets with plating / secondary / primary values */
  function paintPressureSSC(ship, col, i) {
    var p = 'press.' + i, pt = pointOf(ship, col);
    var body = rIn('Point name', p + '.name', col.name) + pointRows(p, col) + posRow(p, col) + sscEditor(p, col);
    var res = '', err = '', hero = [], status = null;
    try {
      var sets = E.designLoads(ship, { pt: pt, member: col.member, ssc: sscModel(col) }).comp2;
      var best = sets.reduce(function (b, x) { return !b || x.P > b.P ? x : b; }, null);
      res += rOut('Position', esc(posLoadNote(col.member)));
      if (!sets.length) res += rOut('Design pressure', '-');
      sets.forEach(function (it) {
        res += rSub(it.set + ' · ' + it.scenario + ' · ' + esc(it.kase)) +
          rOut('Plating  P (δ_f 1.0)', f2(it.P) + ' kN/m²', it === best ? 'best' : '', it.min ? 'minimum ' + it.min + ' kN/m²' : '') +
          rOut('Secondary stiffening (δ_f 0.8)', f2(it.P_sec) + ' kN/m²') + rOut('Primary / transverse frames (δ_f 0.5)', f2(it.P_pri) + ' kN/m²');
        var d = it.detail || {};
        var keys = Object.keys(d).filter(function (k) { return typeof d[k] === 'number'; });
        if (keys.length) res += rOut('Components', keys.map(function (k) { return k + ' ' + f2(d[k], 2); }).join(' · '));
      });
      var prm = Lssc.params(ship);
      res += rSub('Factors') + rOut('ω · H_f · G_f · C_f', f2(prm.omega, 2) + ' · ' + f2(prm.H_f, 2) + ' · ' + f2(prm.G_f, 2) + ' · ' + f2(prm.C_f, 2)) +
        rOut('H_s applied · f_Hs', f2(prm.H_s, 2) + ' m · ' + f2(prm.f_Hs, 3), '', 'Tab 2.2.1 minimum for ' + ship.group + ': ' + prm.Hs_min + ' m') +
        rOut('Γ · F_n · L_f', f2(prm.Gamma, 2) + ' · ' + f2(prm.F_n, 3) + ' · ' + f2(prm.L_f, 3)) +
        rOut('Point x, y, z', f2(pt.x, 3) + ', ' + f2(pt.y, 3) + ', ' + f2(pt.z, 3) + ' m', '', 'x from the aft end of L_WL; z at 1/3 panel height (plating), mid-span (stiffeners) - Pt 5 Ch 2 2.2.1');
      hero = [{ label: 'Plating', value: best ? f2(best.P) : '–', sub: best ? 'kN/m² · ' + best.set : '', cls: 'accent' },
              { label: 'Secondary', value: best ? f2(sets.reduce(function (m, x) { return Math.max(m, x.P_sec); }, 0)) : '–', sub: 'kN/m² · δ_f 0.8' },
              { label: 'Point', value: f2(pt.x, 1) + '·' + f2(pt.y, 2) + '·' + f2(pt.z, 2), sub: 'x · y · z  m', cls: 'small' }];
      status = { text: prm.mode === 'nondisp' ? 'Non-displacement' : 'Displacement', cls: 'info' };
    } catch (e) { err = e.message; console.error(e); }
    return column(p, col, body, res, err, 'press', i, hero, status);
  }
  function paintPressureLR(ship, col, i) {
    var p = 'press.' + i, pt = pointOf(ship, col);
    if (!col.lr) col.lr = defLR();
    var body = rIn('Point name', p + '.name', col.name) + pointRows(p, col) + posRow(p, col) + lrEditor(p, col, false);
    var res = '', err = '', hero = [], status = null;
    try {
      var sets = E.designLoads(ship, { pt: pt, member: col.member, lr: lrModel(col) }).comp2, prm = Lr.params(ship), r = Lr.region(ship, pt.x);
      var best = sets.reduce(function (b, x) { return !b || x.P > b.P ? x : b; }, null);
      res += rOut('Position', esc(posLoadNote(col.member))) + rOut('Region', esc(r.name));
      if (!sets.length) res += rOut('Design head', '-');
      sets.forEach(function (it) { res += rOut(esc(it.set), f2(it.head, 2) + ' m · ' + f2(it.P, 1) + ' kN/m²', it === best ? 'best' : '', esc(it.kase)); });
      res += rSub('Ship factors') + rOut('C_w · F_λ · E', f2(prm.C_w, 3) + ' · ' + f2(prm.F_lambda, 3) + ' · ' + f2(prm.E, 4), '', 'C_w = 7.71 10⁻² L e^(−0.0044 L); E = (0.0914 + 0.003 L)/(D − T) − 0.15 in [0, 0.147]') +
        rOut('k_L · F_D · F_B', f2(prm.k_L, 2) + ' · ' + f2(prm.F_D, 2) + ' · ' + f2(prm.F_B, 2), '', 'plating uses F ≥ 0.67, stiffeners F ≥ 0.75 (Pt 3 Ch 4 5.7.2)') +
        rOut('Point x, z', f2(pt.x, 3) + ', ' + f2(pt.z, 3) + ' m', '', 'x from A.P.; plating: 1/3 panel height, stiffeners: mid-span');
      hero = [{ label: 'Head', value: best ? f2(best.head, 2) : '–', sub: best ? 'm · ' + best.set.split(' ')[0] : '', cls: 'accent' }, { label: 'Pressure', value: best ? f2(best.P, 1) : '–', sub: 'kN/m² equivalent' }, { label: 'Point', value: f2(pt.x, 1) + '·' + f2(pt.z, 2), sub: 'x · z  m', cls: 'small' }];
      status = { text: r.key === 'mid' ? 'Midship' : r.fwd ? 'Fore end' : 'Aft end', cls: 'info' };
    } catch (e) { err = e.message; console.error(e); }
    return column(p, col, body, res, err, 'press', i, hero, status);
  }
  function paintPressure() {
    var ship = shipModel();
    var h = '';
    S.press.forEach(function (col, i) {
      if (isSSC()) { h += paintPressureSSC(ship, col, i); return; }
      if (isLR()) { h += paintPressureLR(ship, col, i); return; }
      var p = 'press.' + i;
      var pt = pointOf(ship, col);
      var body = rIn('Point name', p + '.name', col.name) + pointRows(p, col) + posRow(p, col) +
        rIn('Waterline breadth at section B_x (blank = B)', p + '.B_x', col.B_x, 'm') +
        compEditor(p + '.comp1', col.comp1, 'Compartment 1') + compEditor(p + '.comp2', col.comp2, 'Compartment 2') +
        rSel('Load scenario', p + '.scenario', col.scenario, SCEN.filter(function (o) { return !(isBV() && o[0] === 'extS'); }));
      var res = '', err = isSSC() || isLR() ? '' : Pos.conflicts(col.member, col.comp1.kind, col.comp2.kind).join(' · '), hero = [], status = null;
      try {
        var D = E.designLoads(ship, { pt: pt, comp1: compModel(col.comp1, ship), comp2: compModel(col.comp2, ship), scenario: col.scenario });
        var maxSD = null, maxS = null, govSD = null;
        [['comp1', 'Comp. 1'], ['comp2', 'Comp. 2']].forEach(function (cc) {
          var list = D[cc[0]];
          res += rSub(cc[1] + ' · ' + esc(COMP_KINDS.filter(function (k) { return k[0] === col[cc[0]].kind; })[0][1]));
          if (!list.length) res += rOut('Design pressure', '-');
          list.forEach(function (it) {
            res += rOut(it.set + ' · ' + it.scenario + ' · ' + it.AC, f2(it.P) + ' kN/m²', it.P === Math.max.apply(null, list.map(function (x) { return x.P; })) ? 'best' : '',
                        (it.kase !== '-' ? 'governing: ' + it.kase : 'static') + (it.draught ? ' · T_LC ' + f2(it.draught, 3) + ' m' : ''));
            var dyn = /S\+D/.test(it.scenario);
            if (dyn) { if (maxSD === null || it.P > maxSD) { maxSD = it.P; govSD = it; } } else maxS = Math.max(maxS === null ? -1e9 : maxS, it.P);
          });
        });
        hero = [{ label: 'Max S + D', value: maxSD === null ? '–' : f2(maxSD), sub: maxSD === null ? 'no dynamic set' : 'kN/m² · ' + govSD.set + (govSD.kase !== '-' ? ' · ' + govSD.kase : ''), cls: 'accent' },
                { label: 'Max static', value: maxS === null ? '–' : f2(maxS), sub: 'kN/m²' },
                { label: 'Point', value: f2(pt.x, 1) + '·' + f2(pt.y, 2) + '·' + f2(pt.z, 2), sub: 'x · y · z  m', cls: 'small' }];
        status = govSD ? { text: govSD.AC, cls: 'info' } : null;
        res += rOut('Position', esc(posLoadNote(col.member))) + rOut('Point x, y, z', f2(pt.x, 3) + ', ' + f2(pt.y, 3) + ', ' + f2(pt.z, 3) + ' m') + rOut('f_xL / f_yB', f2(Math.min(Math.max(pt.x / ship.L, 0), 1), 3) + ' / ' + f2(Math.min(Math.abs(2 * pt.y) / (pt.B_x || ship.B), 1), 3));
        /* per-load-case table for any sea/tank set with rows */
        var tbl = '';
        ['comp1', 'comp2'].forEach(function (cc) { D[cc].forEach(function (it) {
          if (it.detail && it.detail.cases) {
            var rows = it.detail.cases.map(function (c) { return { name: c.name, P_W: c.P_W !== undefined ? c.P_W : c.P_D, P_ex: c.P_ex !== undefined ? c.P_ex : c.P_D, _best: c.name === it.kase }; });
            tbl += rSub(cc === 'comp1' ? 'Comp. 1 · ' + it.set + ' per load case' : 'Comp. 2 · ' + it.set + ' per load case') + casesTable(rows, [['Case', 'name'], ['P_W', 'P_W'], ['P_ex', 'P_ex']]);
          }
          if (it.rows) {
            var rws = it.rows.map(function (r) { return { name: r.name, P_ld: r.P_ld, P_ex: r.P_ex, P: r.P, _best: r.name === it.kase }; });
            tbl += rSub((cc === 'comp1' ? 'Comp. 1' : 'Comp. 2') + ' · ' + it.set + ' per load case (P_ls ' + f2(it.P_ls) + ')') + casesTable(rws, [['Case', 'name'], ['P_ld', 'P_ld'], ['P_ex', 'P_ex'], ['P', 'P']]);
          }
        }); });
        if (tbl) res += '<details class="lp-det"' + (col.showCases ? ' open' : '') + ' data-path="' + p + '.showCases"><summary>Load cases</summary>' + tbl + '</details>';
      } catch (e) { err = e.message; console.error(e); }
      h += column(p, col, body, res, err, 'press', i, hero, status);
    });
    $('#board-press').innerHTML = h + addBtn('press');
  }

  function paintAccelSSC(ship, col, i) {
    var p = 'acc.' + i, pt = pointOf(ship, col);
    var body = rIn('Point name', p + '.name', col.name) + pointRows(p, col);
    var res = '', err = '', hero = [];
    try {
      var prm = Lssc.params(ship);
      if (prm.mode === 'nondisp') {
        var a = Lssc.accelNonDisp(ship, pt.x);
        hero = [{ label: 'a_v at LCG', value: f2(a.a_v), sub: 'g · 3.2.4', cls: 'accent' }, { label: 'a_x at point', value: f2(a.a_x), sub: 'g · 3.2.6', cls: 'accent' }, { label: 'Γ', value: f2(a.Gamma, 2), sub: 'Taylor quotient' }];
        res += rSub('Results (Pt 5 Ch 2 3.2, non-displacement mono-hull)') + rOut('Vertical acceleration at LCG a_v', f2(a.a_v, 3) + ' g', 'hl', a.over6g ? 'above 6 g - special agreement with LR (3.2.4 note)' : '') +
          rOut('Vertical acceleration at x a_x', f2(a.a_x, 3) + ' g', 'hl') + rOut('L_1 · H_1', f2(a.L1, 3) + ' · ' + f2(a.H1, 3)) + rOut('θ_D · θ_B applied', f2(a.theta_D, 1) + '° · ' + f2(a.theta_trim, 1) + '°') + rOut('ξ_a', f2(a.xi, 4)) +
          rOut('Relative vertical motion H_rm at x', f2(Lssc.relativeMotion(ship, pt.x).H_rm, 3) + ' m');
      } else {
        var m = Lssc.motionsDisp(ship), a2 = Lssc.accelDisp(ship, m, pt.x, pt.y, pt.z);
        hero = [{ label: 'a_x', value: f2(a2.a_x), sub: 'm/s²', cls: 'accent' }, { label: 'a_y', value: f2(a2.a_y), sub: 'm/s²', cls: 'accent' }, { label: 'a_z', value: f2(a2.a_z), sub: 'm/s²', cls: 'accent' }];
        res += rSub('Results (Pt 5 Ch 2 Tab 2.3.2, displacement mode)') + rOut('Longitudinal a_x', f2(a2.a_x, 3) + ' m/s²', 'hl') + rOut('Transverse a_y', f2(a2.a_y, 3) + ' m/s²', 'hl') + rOut('Vertical a_z', f2(a2.a_z, 3) + ' m/s²', 'hl') +
          rSub('Intermediate results') + rOut('a_surge · a_sway · a_heave', f2(m.a_surge, 3) + ' · ' + f2(m.a_sway, 3) + ' · ' + f2(m.a_heave, 3) + ' m/s²') +
          rOut('Roll θ · T_θ · a_roll', f2(m.theta, 2) + '° · ' + f2(m.T_theta, 2) + ' s · ' + f2(m.a_roll, 4)) + rOut('Pitch φ · T_φ · a_pitch', f2(m.phi, 2) + '° · ' + f2(m.T_phi, 2) + ' s · ' + f2(m.a_pitch, 4)) +
          rOut('a_pitch-x · a_roll-y · a_roll-z · a_pitch-z', [a2.a_pitch_x, a2.a_roll_y, a2.a_roll_z, a2.a_pitch_z].map(function (v) { return f2(v, 3); }).join(' · ')) +
          rOut('a_0 · f_Hs · f_st', f2(m.a0, 4) + ' · ' + f2(m.f_Hs, 3) + ' · ' + m.f_st) + rOut('f_ax · f_av', f2(a2.f_ax, 3) + ' · ' + a2.f_av) +
          rOut('GM · k_r · f_BK · R · L_CG', f2(m.GM, 2) + ' · ' + f2(m.k_r, 2) + ' · ' + m.f_BK + ' · ' + f2(m.R, 2) + ' · ' + f2(m.L_CG, 2));
      }
      res += rOut('Point x, y, z', f2(pt.x, 3) + ', ' + f2(pt.y, 3) + ', ' + f2(pt.z, 3) + ' m');
    } catch (e) { err = e.message; console.error(e); }
    return column(p, col, body, res, err, 'acc', i, hero, { text: prm && prm.mode === 'nondisp' ? 'Non-displacement' : 'Displacement', cls: 'info' });
  }
  function paintAccel() {
    var ship = shipModel(), h = '';
    S.acc.forEach(function (col, i) {
      if (isSSC()) { h += paintAccelSSC(ship, col, i); return; }
      if (isLR()) { h += column('acc.' + i, col, rIn('Point name', 'acc.' + i + '.name', col.name) + pointRows('acc.' + i, col), rOut('Accelerations', 'not part of the LR Rules for Ships local scantling method', '', 'Pt 3 Ch 3 Sec 5 works with design heads; motions appear only in the sloshing check (5.4) and Pt 3 Ch 14 securing'), '', 'acc', i, [], { text: 'Head-based rules', cls: 'info' }); return; }
      var p = 'acc.' + i, pt = pointOf(ship, col);
      var body = rIn('Point name', p + '.name', col.name) + pointRows(p, col) +
        rSel('Draught', p + '.draught', col.draught, [['T_SC', 'T_SC (scantling)'], ['T_BAL', 'T_BAL (ballast)']]) +
        rSel('Load scenario', p + '.bwe', col.bwe ? '1' : '0', [['0', 'ExtremeSea'], ['1', 'BWExchange']]);
      var res = '', err = '', hero = [];
      try {
        var T = col.draught === 'T_BAL' ? (ship.T_BAL || 0.6 * ship.T_SC) : ship.T_SC;
        var A = accOf();
        var m = A.motions(ship, { T_LC: T, bwe: col.bwe === true || col.bwe === '1' });
        var ca = A.caseAccelerations(m, pt.x, pt.y, pt.z), env = A.envelope(m, pt.x, pt.y, pt.z);
        var rows = A.CASES.map(function (k) { return { name: k, aX: ca[k].aX, aY: ca[k].aY, aZ: ca[k].aZ }; });
        var mx = function (key) { return rows.reduce(function (b, r) { return Math.abs(r[key]) > Math.abs(b[key]) ? r : b; }, rows[0]); };
        var bx = mx('aX'), by = mx('aY'), bz = mx('aZ');
        hero = [{ label: 'a_X', value: f2(bx.aX), sub: 'm/s² · ' + bx.name, cls: 'accent' }, { label: 'a_Y', value: f2(by.aY), sub: 'm/s² · ' + by.name, cls: 'accent' }, { label: 'a_Z', value: f2(bz.aZ), sub: 'm/s² · ' + bz.name, cls: 'accent' }];
        res += rSub('Results') + rOut('Critical load case (a_X / a_Y / a_Z)', bx.name + ' / ' + by.name + ' / ' + bz.name) +
          rOut('a_X max |·|', f2(bx.aX) + ' m/s²', 'hl') + rOut('a_Y max |·|', f2(by.aY) + ' m/s²', 'hl') + rOut('a_Z max |·|', f2(bz.aZ) + ' m/s²', 'hl') +
          (env.fromCases ? '' : rOut('Max a_x-env', f2(env.a_x_env) + ' m/s²') + rOut('Max a_y-env', f2(env.a_y_env) + ' m/s²') + rOut('Max a_z-env', f2(env.a_z_env) + ' m/s²') +
          rOut('Max a_z-env-pitch', f2(env.a_z_env_pitch) + ' m/s²') + rOut('Max a_z-env-roll', f2(env.a_z_env_roll) + ' m/s²'));
        res += rSub('Intermediate results') + rOut('Roll period T_θ', f2(m.T_theta) + ' s') + rOut('Roll angle θ', f2(m.theta) + ' °') +
          rOut('Pitch period T_φ', f2(m.T_phi) + ' s') + rOut('Pitch angle φ', f2(m.phi) + ' °') + rOut('a_surge', f2(m.a_surge, 3) + ' m/s²') +
          rOut('a_sway', f2(m.a_sway, 3) + ' m/s²') + rOut('a_heave', f2(m.a_heave, 3) + ' m/s²') + rOut('a_roll', f2(m.a_roll, 4) + ' rad/s²') +
          rOut('a_pitch', f2(m.a_pitch, 4) + ' rad/s²') +
          (isBV() ? rOut('a_yaw', f2(m.a_yaw, 4) + ' rad/s²') + rOut('Wave parameter H (heave / pitch / surge)', f2(m.H_heave, 3) + ' / ' + f2(m.H_pitch, 3) + ' / ' + f2(m.H_surge, 3) + ' m') +
                    rOut('Dimensionless roll period T_R', f2(m.T_R, 3)) + rOut('Navigation coefficient n', f2(m.n, 3)) + rOut('C_B-LC · C_W-LC', f2(m.C_B_LC, 3) + ' · ' + f2(m.C_W_LC, 3))
                  : rOut('Acceleration parameter a_0', f2(m.a0, 4))) +
          rOut('Draught ratio f_T', f2(m.f_T, 3)) + rOut('f_ps', f2(m.f_ps)) + rOut('Applied GM', f2(m.GM) + ' m') + rOut('Applied k_r', f2(m.k_r) + ' m') +
          (isBV() ? rOut('Centre of gravity x_G · z_G', f2(m.x_G, 2) + ' · ' + f2(m.z_G, 2) + ' m') : rOut('Ship rotation centre R', f2(m.R) + ' m')) +
          rOut('Point x, y, z', f2(pt.x, 3) + ', ' + f2(pt.y, 3) + ', ' + f2(pt.z, 3) + ' m');
        rows.forEach(function (r) { r._best = r.name === bz.name; });
        res += '<details class="lp-det"' + (col.showCases ? ' open' : '') + ' data-path="' + p + '.showCases"><summary>Load cases (' + (isBV() ? 'Ch 5 Sec 3 [3.2]' : 'Ch 4 Sec 3 [3.2]') + ')</summary>' +
          casesTable(rows, [['Case', 'name'], ['a_X', 'aX'], ['a_Y', 'aY'], ['a_Z', 'aZ']]) + '</details>';
      } catch (e) { err = e.message; console.error(e); }
      h += column(p, col, body, res, err, 'acc', i, hero, { text: col.bwe === true || col.bwe === '1' ? 'BWE' : 'Extreme sea', cls: 'info' });
    });
    $('#board-acc').innerHTML = h + addBtn('acc');
  }


  function paintScantSSC(ship, col, i) {
    var p = 'scant.' + i, pt = pointOf(ship, col), prof = profileOf(col);
    if (!col.sscMember) { col.sscMember = 'secondary'; col.sscModel = 'auto'; col.curv_h = 0; col.matSSC = 'MS (A/B/D/E)'; col.matSSCs = 'MS (A/B/D/E)'; }
    var mats = Object.keys(Sssc.MATERIALS).map(function (k) { return [k, k + ' · ' + Sssc.MATERIALS[k][0] + ' / ' + Sssc.MATERIALS[k][1] + ' N/mm²']; });
    var body = rHead('Panel and loads') + rIn('Point name', p + '.name', col.name) + pointRows(p, col) + posRow(p, col) + sscEditor(p, col) +
      rIn('Panel length a (along the stiffeners)', p + '.a', col.a, 'mm') + rIn('Stiffener spacing s (panel breadth)', p + '.s', col.s, 'mm') +
      rIn('Plate curvature rise h between supports (0 = flat)', p + '.curv_h', col.curv_h || 0, 'mm') +
      rHead('Plate') + rIn('Plate thickness t_p', p + '.tp', col.tp, 'mm') + rSel('Plate material', p + '.matSSC', col.matSSC, mats) +
      rHead('Stiffener') + rSel('Member type', p + '.sscMember', col.sscMember, [['secondary', 'Secondary / local stiffener (δ_f 0.8, model b)'], ['primary', 'Primary member / transverse frame (δ_f 0.5, model a)']]) +
      rSel('Load model (Tab 3.1.1)', p + '.sscModel', col.sscModel, [['auto', 'Per member type'], ['a', '(a) both ends fixed'], ['b', '(b) one end fixed, one simply supported'], ['c', '(c) fixed / free-end supported'], ['e', '(e) simply supported']]) +
      rSel('Profile type', p + '.profType', col.profType, [['FB', 'Flat bar'], ['HP', 'Bulb flat (HP)'], ['L', 'Angle (L)'], ['T', 'T-bar']]);
    if (col.profType === 'HP') body += rSel('Bulb profile', p + '.hp', col.hp, window.LoadPointScant.HP.map(function (r) { return [r[0], r[0]]; }));
    else {
      body += rIn('Web height h', p + '.h', col.h, 'mm') + rIn('Web thickness t_w', p + '.t', col.t, 'mm');
      if (col.profType !== 'FB') body += rIn('Flange breadth b_f', p + '.bf', col.bf, 'mm') + rIn('Flange thickness t_f', p + '.tf', col.tf, 'mm');
    }
    body += rSel('Stiffener material', p + '.matSSCs', col.matSSCs, mats) + rIn('Angle between web and plate φ_w', p + '.phi_w', col.phi_w === undefined ? 90 : col.phi_w, '°') +
      rIn('Overall length ℓ', p + '.l', col.l, 'm') + rIn('Effective span ℓ_e (1.19)', p + '.l_bdg', col.l_bdg, 'm');
    var res = '', err = '', out = null;
    try { out = scantResultsSSC(ship, col, pt, prof); res = out.html; } catch (e) { err = e.message; console.error(e); }
    return column(p, col, body, res, err, 'scant', i, out ? out.hero : [], out ? out.status : null);
  }
  function scantResultsSSC(ship, col, pt, prof) {
    var res = '', prm = Lssc.params(ship);
    var mp = Sssc.MATERIALS[col.matSSC] || Sssc.MATERIALS['MS (A/B/D/E)'], ms = Sssc.MATERIALS[col.matSSCs] || mp;
    var k_sp = Sssc.kS(mp[0]), k_ss = Sssc.kS(ms[0]), k_ms = Sssc.kMS(mp[0], mp[1]);
    var s_mm = +col.s, a_mm = +col.a, tp = +col.tp;
    var gam = Sssc.gamma(+col.curv_h || 0, s_mm), bet = Sssc.beta(a_mm, s_mm);
    var sets = E.designLoads(ship, { pt: pt, member: col.member, ssc: sscModel(col) }).comp2;
    var member = col.sscMember === 'primary' ? 'primary' : 'secondary';
    var model = col.sscModel && col.sscModel !== 'auto' ? col.sscModel : Sssc.loadModel(member);
    /* plate */
    var pl = sets.map(function (st) { var lim = Sssc.limits(col.member, st.load, 'plate'); var r = Sssc.plateThickness(st.P, s_mm, gam, bet, k_sp, lim.f_sigma); return { set: st, t: r.t, lim: lim }; });
    var plBest = pl.reduce(function (b, r) { return !b || r.t > b.t ? r : b; }, null);
    var tmin = Sssc.minPlate(col.member, ship.L, prm.omega, k_ms);
    var tReq = Math.max(plBest ? plBest.t : 0, tmin.t);
    res += rSub('Position rules applied · ' + esc(Pos.name(col.member))) + rOut('Design pressure row', esc(posLoadNote(col.member))) +
      rOut('Limiting stress row (Tab 7.3.1)', plBest ? esc(plBest.lim.row) + ' · f_σ ' + plBest.lim.f_sigma : '-') +
      rOut('Minimum thickness row (Tab 3.2.1)', esc(tmin.row), '', tmin.formula + ' · k_ms ' + f2(k_ms, 3)) +
      rOut('Deflection row (Tab 7.2.1)', esc(Sssc.deflection(col.member, member).row) + ' · f_δ ' + Sssc.deflection(col.member, member).f_delta) +
      rOut('Load model', esc(Sssc.MODELS[model].name));
    res += rSub('Results plate (Pt 6 Ch 3 1.16)') + rOut('Design pressure for plate P', plBest ? f2(plBest.set.P) + ' kN/m²' : '-', '', plBest ? plBest.set.set + ' · ' + esc(plBest.set.kase) : '') +
      rOut('γ · β · k_s', f2(gam, 3) + ' · ' + f2(bet, 3) + ' · ' + f2(k_sp, 3)) +
      rOut('Required thickness t_p', f2(plBest ? plBest.t : 0) + ' mm', '', 't_p = 22.4 s γ β √(p k_s / (f_σ 235)) 10⁻³') +
      rOut('Minimum thickness', f2(tmin.t) + ' mm') +
      rOut('Rule status (t ' + f2(tp, 1) + ' vs ' + f2(tReq) + ')', tp + 1e-9 >= tReq ? 'OK' : 'NOT OK', tp + 1e-9 >= tReq ? 'ok' : 'fail');
    /* stiffener */
    var l_e = +col.l_bdg || +col.l, l = +col.l || l_e;
    var beff = Sssc.bEff(tp, s_mm, mp[0], mp[0] > 265);
    var net = window.LoadPointScant.sectionProps(prof, 0, tp, beff, +col.phi_w || 90);      /* gross, no corrosion deduction */
    var defl = Sssc.deflection(col.member, member);
    var st = sets.map(function (x) {
      var P = member === 'primary' ? x.P_pri : x.P_sec, lim = Sssc.limits(col.member, x.load, member);
      var r = Sssc.stiffenerReq(P, s_mm, l_e, l, k_ss, lim.f_sigma, lim.f_tau, defl.f_delta, model);
      return { set: x, P: P, Z: r.Z, I: r.I, A_w: r.A_w, lim: lim };
    });
    var zBest = st.reduce(function (b, r) { return !b || r.Z > b.Z ? r : b; }, null), iBest = st.reduce(function (b, r) { return !b || r.I > b.I ? r : b; }, null), aBest = st.reduce(function (b, r) { return !b || r.A_w > b.A_w ? r : b; }, null);
    var prop = Sssc.proportions(prof);
    var Aw = net.hw * net.tw / 100;                                                                 /* web area cm² */
    var okZ = !zBest || net.Z + 1e-9 >= zBest.Z, okI = !iBest || net.I + 1e-9 >= iBest.I, okA = !aBest || Aw + 1e-9 >= aBest.A_w, okP = prof.t + 1e-9 >= prop.tw_min && (prop.bf_max === undefined || prof.bf <= prop.bf_max + 1e-9);
    res += rSub('Results stiffener (Pt 6 Ch 3 1.17) · ' + esc(prof.name)) +
      rOut('Design pressure for stiffener P (δ_f ' + (member === 'primary' ? '0.5' : '0.8') + ')', zBest ? f2(zBest.P) + ' kN/m²' : '-', '', zBest ? zBest.set.set + ' · f_σ ' + zBest.lim.f_sigma + ' · f_τ ' + zBest.lim.f_tau : '') +
      rOut('Effective breadth b_e', f2(beff, 0) + ' mm', '', '2 t_p √(E/σ_s) ≤ s') +
      rOut('Section modulus Z actual / required', f2(net.Z) + ' / ' + f2(zBest ? zBest.Z : 0) + ' cm³', okZ ? 'ok' : 'fail') +
      rOut('Inertia I actual / required', f2(net.I) + ' / ' + f2(iBest ? iBest.I : 0) + ' cm⁴', okI ? 'ok' : 'fail') +
      rOut('Web area A_w actual / required', f2(Aw) + ' / ' + f2(aBest ? aBest.A_w : 0) + ' cm²', okA ? 'ok' : 'fail') +
      rOut('Proportions (Tab 3.1.2): t_w ≥ ' + f2(prop.tw_min, 2) + (prop.bf_max !== undefined ? ', b_f ≤ ' + f2(prop.bf_max, 0) : ''), okP ? 'OK' : 'NOT OK', okP ? 'ok' : 'fail', prop.row) +
      rOut('Rule status', okZ && okI && okA && okP ? 'OK' : 'NOT OK', okZ && okI && okA && okP ? 'ok' : 'fail');
    var rows = sets.map(function (x, j) { return { set: x.set, kase: x.kase, P: x.P, Psec: x.P_sec, t: pl[j].t, Z: st[j].Z, I: st[j].I, Aw: st[j].A_w, _best: zBest && x === zBest.set }; });
    if (rows.length) res += '<details class="lp-det" open><summary>Design pressures</summary>' + casesTable(rows, [['Set', 'set'], ['Case', 'kase'], ['P plate', 'P'], ['P stf', 'Psec'], ['t_p', 't'], ['Z', 'Z'], ['I', 'I', 1], ['A_w', 'Aw']]) + '</details>';
    var okAll = tp + 1e-9 >= tReq && okZ && okI && okA && okP;
    var hero = [{ label: 'Plate t', value: f2(tp, 1) + '/' + f2(tReq, 1), sub: 'actual / required mm', cls: tp + 1e-9 >= tReq ? 'ok' : 'fail' },
                { label: 'Stiffener Z', value: f2(net.Z, 1) + '/' + f2(zBest ? zBest.Z : 0, 1), sub: 'actual / required cm³', cls: okZ ? 'ok' : 'fail' },
                { label: 'Inertia I', value: f2(net.I, 0) + '/' + f2(iBest ? iBest.I : 0, 0), sub: 'actual / required cm⁴', cls: okI ? 'ok' : 'fail' }];
    return { html: res, hero: hero, status: { text: okAll ? 'OK' : 'NOT OK', cls: okAll ? 'ok' : 'fail' } };
  }
  function paintScantLR(ship, col, i) {
    var p = 'scant.' + i, pt = pointOf(ship, col), prof = profileOf(col);
    if (!col.lr) col.lr = defLR();
    if (!col.matSSC) { col.matSSC = 'MS (A/B/D/E)'; col.matSSCs = 'MS (A/B/D/E)'; }
    var mats = Object.keys(Lr.MATERIALS).map(function (k) { return [k, k + ' · σ_o ' + Lr.MATERIALS[k] + ' · k ' + Lr.kFactor(Lr.MATERIALS[k]).toFixed(3)]; });
    var body = rHead('Panel and heads') + rIn('Point name', p + '.name', col.name) + pointRows(p, col) + posRow(p, col) + lrEditor(p, col, true) +
      rIn('Stiffener spacing s', p + '.s', col.s, 'mm') +
      rHead('Plate') + rIn('Plate thickness t', p + '.tp', col.tp, 'mm') + rSel('Plate material', p + '.matSSC', col.matSSC, mats) +
      rHead('Stiffener') + rSel('Profile type', p + '.profType', col.profType, [['FB', 'Flat bar'], ['HP', 'Bulb flat (HP)'], ['L', 'Angle (L)'], ['T', 'T-bar']]);
    if (col.profType === 'HP') body += rSel('Bulb profile', p + '.hp', col.hp, window.LoadPointScant.HP.map(function (r) { return [r[0], r[0]]; }));
    else {
      body += rIn('Web height h', p + '.h', col.h, 'mm') + rIn('Web thickness t_w', p + '.t', col.t, 'mm');
      if (col.profType !== 'FB') body += rIn('Flange breadth b_f', p + '.bf', col.bf, 'mm') + rIn('Flange thickness t_f', p + '.tf', col.tf, 'mm');
    }
    body += rSel('Stiffener material', p + '.matSSCs', col.matSSCs, mats) + rIn('Overall length l', p + '.l', col.l, 'm') + rIn('Effective length l_e (span points, Pt 3 Ch 3 3.3)', p + '.l_bdg', col.l_bdg, 'm');
    var res = '', err = '', out = null;
    try { out = scantResultsLR(ship, col, pt, prof); res = out.html; } catch (e) { err = e.message; console.error(e); }
    return column(p, col, body, res, err, 'scant', i, out ? out.hero : [], out ? out.status : null);
  }
  function scantResultsLR(ship, col, pt, prof) {
    var res = '', prm = Lr.params(ship), kind = Lr.posKind(col.member), m = lrModel(col);
    var sp = Lr.MATERIALS[col.matSSC] || 235, ss = Lr.MATERIALS[col.matSSCs] || 235, kp = Lr.kFactor(sp), ks = Lr.kFactor(ss);
    var s_mm = +col.s, tp = +col.tp, le = +col.l_bdg || +col.l, framing = col.stiffening;
    var optP = { k: kp, s: s_mm, S: m.S || 2.5, framing: framing, insideOpenings: m.insideOpenings, deckLevel: m.deckLevel, h_4: m.h_4, tankBottom: m.tankBottom, underHatch: m.underHatch, z_bilge: m.z_bilge, t_c: m.t_c, tier: m.tier, X: m.X, b: m.b, casing: m.casing, face: m.face, deepTank: m.deepTank };
    var pl = kind === 'bottom' || kind === 'side' || kind === 'sheer' ? Lr.shellPlating(ship, pt, col.member, optP)
           : kind === 'sdeck' || kind === 'ldeck' || kind === 'ssDeck' ? Lr.deckPlating(ship, pt, col.member, optP)
           : kind === 'ib' ? Lr.innerBottomPlating(ship, optP)
           : kind === 'wtBhd' || kind === 'deepTank' ? Lr.bulkheadPlating(ship, optP)
           : kind === 'erection' ? Lr.erectionPlating(ship, pt, col.member, optP) : { rows: [], t: 0, governing: '-' };
    var optS = { k: ks, s: s_mm, l_e: le, framing: framing, profType: prof.type, h_4: m.h_4, H: m.H, tween: m.tween, brackets: m.brackets, la_l: m.la_l, tankSide: m.tankSide, peak: m.peak, S_1: m.S_1, aftPeak: m.aftPeak, forePeak: m.forePeak, insideOpenings: m.insideOpenings, p_a: m.p_a, H_td: m.H_td, C: m.C, accommodation: m.accommodation, tier: m.tier, sheltered: m.sheltered, deckhouse: m.deckhouse, shortErection: m.shortErection, sideSpan: m.sideSpan, w1: m.w1, w2: m.w2, deepTank: m.deepTank, X: m.X, b: m.b, casing: m.casing, face: m.face, l_s: +col.l };
    var st = kind === 'bottom' || kind === 'side' || kind === 'sheer' ? Lr.shellStiffener(ship, pt, col.member === 'sheerstrake' ? 'side' : col.member, optS)
           : kind === 'sdeck' || kind === 'ldeck' || kind === 'ssDeck' ? Lr.deckStiffener(ship, pt, col.member, optS)
           : kind === 'ib' ? Lr.innerBottomStiffener(ship, pt, optS)
           : kind === 'wtBhd' || kind === 'deepTank' ? Lr.bulkheadStiffener(ship, optS)
           : kind === 'erection' ? Lr.erectionStiffener(ship, pt, col.member, optS) : { rows: [], Z: 0, I: 0, governing: '-' };
    var beff = Lr.attachedWidth(tp, s_mm), net = window.LoadPointScant.sectionProps(prof, 0, tp, beff, 90);
    var wl = Lr.webLimit(prof, prm.k_L, m.continuous), okWeb = prof.h / prof.t <= wl + 1e-9;
    var okT = tp + 1e-9 >= pl.t, okZ = net.Z + 1e-9 >= st.Z, okI = !st.I || net.I + 1e-9 >= st.I;
    res += rSub('Position rules applied · ' + esc(Pos.name(col.member))) + rOut('Rule rows', esc(posLoadNote(col.member))) + rOut('Region', esc(Lr.region(ship, pt.x).name)) +
      rOut('k (plate / stiffener) · k_L · F_D · F_B', f2(kp, 3) + ' / ' + f2(ks, 3) + ' · ' + f2(prm.k_L, 2) + ' · ' + f2(prm.F_D, 2) + ' · ' + f2(prm.F_B, 2));
    res += rSub('Results plate');
    pl.rows.forEach(function (o) { res += rOut(esc(o.row), f2(o.t) + ' mm', o.best ? 'best' : '', esc(o.formula)); });
    res += rOut('Rule status (t ' + f2(tp, 1) + ' vs ' + f2(pl.t) + ')', okT ? 'OK' : 'NOT OK', okT ? 'ok' : 'fail');
    res += rSub('Results stiffener · ' + esc(prof.name) + ' with plating ' + f2(beff, 0) + ' × ' + f2(tp, 1));
    st.rows.forEach(function (o) { res += rOut(esc(o.row), f2(o.Z, 1) + ' cm³' + (o.I ? ' · I ' + f2(o.I, 0) + ' cm⁴' : ''), o.best ? 'best' : '', esc(o.formula)); });
    res += rOut('Actual modulus Z_a (Pt 3 Ch 3 3.2.3: plating 600 or 40 t_p, ≤ s)', f2(net.Z, 1) + ' cm³ · I ' + f2(net.I, 0) + ' cm⁴', okZ && okI ? 'ok' : 'fail') +
      rOut('Web proportion d_w / t = ' + f2(prof.h / prof.t, 1) + ' ≤ ' + f2(wl, 1), okWeb ? 'OK' : 'NOT OK', okWeb ? 'ok' : 'fail', prof.type === 'FB' ? 'flat bar 18 √k_L continuous, 15 √k_L otherwise' : 'built / rolled 60 √k_L') +
      rOut('Rule status', okZ && okI && okWeb ? 'OK' : 'NOT OK', okZ && okI && okWeb ? 'ok' : 'fail');
    var okAll = okT && okZ && okI && okWeb;
    var hero = [{ label: 'Plate t', value: f2(tp, 1) + '/' + f2(pl.t, 1), sub: 'actual / required mm', cls: okT ? 'ok' : 'fail' },
                { label: 'Stiffener Z', value: f2(net.Z, 1) + '/' + f2(st.Z, 1), sub: 'actual / required cm³', cls: okZ ? 'ok' : 'fail' },
                { label: 'Inertia I', value: f2(net.I, 0) + '/' + f2(st.I || 0, 0), sub: 'actual / required cm⁴', cls: okI ? 'ok' : 'fail' }];
    return { html: res, hero: hero, status: { text: okAll ? 'OK' : 'NOT OK', cls: okAll ? 'ok' : 'fail' } };
  }
  function paintScant() {
    var ship = shipModel(), h = '';
    S.scant.forEach(function (col, i) {
      if (isSSC()) { h += paintScantSSC(ship, col, i); return; }
      if (isLR()) { h += paintScantLR(ship, col, i); return; }
      var p = 'scant.' + i, pt = pointOf(ship, col);
      var prof = profileOf(col);
      var body = rHead('Elementary plate panel') + rIn('Point name', p + '.name', col.name) + pointRows(p, col) + posRow(p, col) +
        rIn('Length of EPP a', p + '.a', col.a, 'mm') + rIn('Breadth of EPP b', p + '.b', col.b, 'mm') +
        rHead('Compartments and loads') + compEditor(p + '.comp1', col.comp1, 'Compartment 1 (stiffener side)') + compEditor(p + '.comp2', col.comp2, 'Compartment 2 (plate side)') +
        rSel('Load scenario', p + '.scenario', col.scenario, SCEN.filter(function (o) { return !(isBV() && o[0] === 'extS'); })) +
        rHead('Panel definition') + rSel('Stiffening arrangement', p + '.stiffening', col.stiffening, [['long', 'Longitudinal'], ['trv', 'Transverse / vertical']]) +
        rChk('Vertical stiffener, lower end (f_bdg 10, f_shr 0.7)', p + '.vertical', col.vertical) +
        rIn('Hull girder stress σ_hg at LCP (+ tension)', p + '.sigma_hg', col.sigma_hg, 'N/mm²') +
        (isBV() ? rIn('Plate curvature radius R (0 = flat)', p + '.R_curv', col.R_curv || 0, 'm') : '') +
        rHead('Plate') + rIn('Gross plate thickness t_gr', p + '.tp', col.tp, 'mm') + rSel('Plate material', p + '.matP', col.matP, matOpts()) +
        rHead('Stiffener') + rSel('Profile type', p + '.profType', col.profType, [['FB', 'Flat bar'], ['HP', 'Bulb flat (HP)'], ['L', 'Angle (L)'], ['T', 'T-bar']]);
      if (col.profType === 'HP') body += rSel('Bulb profile', p + '.hp', col.hp, scOf().HP.map(function (r) { return [r[0], r[0]]; }));
      else {
        body += rIn('Web height h', p + '.h', col.h, 'mm') + rIn('Web thickness t_w', p + '.t', col.t, 'mm');
        if (col.profType !== 'FB') body += rIn('Flange breadth b_f', p + '.bf', col.bf, 'mm') + rIn('Flange thickness t_f', p + '.tf', col.tf, 'mm');
      }
      body += rSel('Stiffener material', p + '.matS', col.matS, matOpts()) + rIn('Angle between web and plate φ_w', p + '.phi_w', col.phi_w === undefined ? 90 : col.phi_w, '°') + rIn('Stiffener spacing s', p + '.s', col.s, 'mm') +
        rIn('Full length ℓ', p + '.l', col.l, 'm') + rIn('Eff. bending span ℓ_bdg', p + '.l_bdg', col.l_bdg, 'm') + rIn('Eff. shear span ℓ_shr', p + '.l_shr', col.l_shr, 'm') +
        rSel('End fixity', p + '.fixity', col.fixity, [['fixed', 'Both ends fixed (continuous)'], ['one', 'One fixed, one simply supported'], ['ss', 'Simply supported (non-continuous)']]);
      if (col.profType === 'FB') body += rChk('Flat bar laterally loaded, not in hull girder bending (C_w 26)', p + '.fbLateral', col.fbLateral);
      var res = '', err = Pos.conflicts(col.member, col.comp1.kind, col.comp2.kind).join(' · '), out = null;
      try { out = scantResults(ship, col, pt, prof); res = out.html; } catch (e) { err = e.message; console.error(e); }
      h += column(p, col, body, res, err, 'scant', i, out ? out.hero : [], out ? out.status : null);
    });
    $('#board-scant').innerHTML = h + addBtn('scant');
  }
  function matOpts() { return Object.keys(scOf().MATERIALS).map(function (k) { return [scOf().MATERIALS[k], k + ' · ' + scOf().MATERIALS[k]]; }); }
  function profileOf(col) {
    if (col.profType === 'HP') { var r = scOf().HP.filter(function (x) { return x[0] === col.hp; })[0] || scOf().HP[0]; return { type: 'HP', h: r[1], t: r[2], name: r[0] }; }
    return { type: col.profType, h: +col.h, t: +col.t, bf: +col.bf || 0, tf: +col.tf || 0, name: col.profType + ' ' + col.h + 'x' + col.t + (col.profType !== 'FB' ? '+' + col.bf + 'x' + col.tf : '') };
  }

  function scantResults(ship, col, pt, prof) {
    var res = '', Sc = scOf(), bv = isBV();
    var m1 = compModel(col.comp1, ship), m2 = compModel(col.comp2, ship);
    var D = E.designLoads(ship, { pt: pt, comp1: m1, comp2: m2, scenario: col.scenario });
    var tp_gr = +col.tp, R_p = +col.matP, R_s = +col.matS, k_p = Sc.kFactor(R_p);
    var ck = Pos.corrosionKeys(bv ? 'bv' : 'dnv', col.member, col.comp1.kind, col.comp2.kind, TCKEY, 1);
    var tc = Sc.corrosion(ck.plate[0], ck.plate[1], tp_gr);
    var tcS = Sc.corrosion(ck.stiff[0], ck.stiff[1], +col.t || tp_gr);
    var tp = tp_gr - tc;
    var posDef = Pos.get(col.member);
    var longit = posDef.longit && col.stiffening === 'long';
    var sig = +col.sigma_hg || 0;
    /* pressure sets from both sides; comp1 acts on the stiffener side, comp2 on the plate side */
    var sets = D.comp1.map(function (s) { s.side = 'stiffener'; return s; }).concat(D.comp2.map(function (s) { s.side = 'plate'; return s; }));
    /* ---- plate ---- */
    var pl = sets.map(function (s) { var r = Sc.plateThickness(s.P, +col.a, +col.b, R_p, s.AC, col.member, col.stiffening, sig, !!s.flood, { testing: !!s.testing, collision: !!s.collision, R: +col.R_curv || 0 }); return { set: s, t: r.t, C_a: r.C_a, alpha_p: r.alpha_p, chi: r.chi, K_corr: r.K_corr }; });
    var plBest = pl.reduce(function (b, r) { return r.t > b.t ? r : b; }, pl[0] || { t: 0 });
    var tmin = Sc.minPlate(col.member, ship, pt.z, k_p, pt.x);
    var tminGr = tmin.gross ? tmin.t : tmin.t + tc;                  /* BV: 5.0 mm gross; DNV: net + t_c */
    var slC = Pos.slendernessC(col.member, ship.L), Cslend = slC.C;
    var tslend = bv ? Sc.plateSlenderness(+col.b, R_p) : +col.b / Cslend;
    var tReqGr = Math.max(plBest.t + tc, tminGr, tslend + tc);
    var plRow = plBest.set ? (plBest.set.flood ? 'watertight boundary, flooding' : (posDef.key === 'longBhd' && plBest.set.AC === 'AC-III' ? 'longitudinal bulkhead' : (longit || (posDef.longit && !bv) ? 'longitudinal strength member, ' + (col.stiffening === 'long' ? 'longitudinal' : 'transverse') + ' stiffening' : 'other member'))) : '-';
    res += rSub('Position rules applied · ' + esc(Pos.name(col.member))) +
      rOut('External load', esc(posLoadNote(col.member))) +
      rOut('Corrosion t_c1 / t_c2 (plate)', ck.plate[0] + ' ' + f2(Sc.TC1[ck.plate[0]] || 0, 2) + ' / ' + ck.plate[1] + ' ' + f2(Sc.TC1[ck.plate[1]] || 0, 2) + ' mm', '', ck.notes.length ? ck.notes.join(' · ') : (bv ? 'Ch 4 Sec 3 Tab 1 by compartment' : 'Ch 3 Sec 3 Tab 1 by compartment')) +
      (tcS !== tc ? rOut('Corrosion t_c (stiffener)', f2(tcS, 1) + ' mm', '', ck.stiff.join(' / ')) : '') +
      rOut('Minimum thickness row', bv ? '5.0 mm gross, all elements' : esc(tmin.row) + ' · a ' + tmin.a + ', b ' + tmin.b, '', bv ? 'Ch 7 Sec 3 [1.1.1]' : 'Ch 6 Sec 3 Tab 1; side shell band by z − T_SC = ' + f2(pt.z - ship.T_SC, 2) + ' m') +
      rOut('Plate coefficient row', esc(plRow), '', (bv ? 'Ch 7 Sec 4 Tab 1' : 'Ch 6 Sec 4 Tab 1') + ' · β ' + (plBest.set ? f2(Sc.plateCoef(plBest.set.AC, col.member, col.stiffening, !!plBest.set.flood).beta, 2) : '-')) +
      (bv ? '' : rOut('Slenderness row', esc(slC.row) + ' · C ' + slC.C, '', 'Ch 8 Sec 2 Tab 1'));
    res += rSub('Results (yield) plate') + rOut('Total corrosion addition t_c', f2(tc, 1) + ' mm', '', 't_c1 + t_c2 + 0.5, capped at 0.2 t_gr') +
      rOut('Design pressure for plate P', (pl.length ? f2(plBest.set.P) + ' kN/m²' : '-'), '', pl.length ? plBest.set.set + ' · ' + plBest.set.scenario + ' · ' + plBest.set.AC + ' · ' + plBest.set.kase : '') +
      rOut('Design case giving max t_req', pl.length ? plBest.set.set + ' · ' + plBest.set.scenario + (plBest.set.kase !== '-' ? ' · ' + plBest.set.kase : '') : '-') +
      rOut('C_a · α_p', pl.length ? f2(plBest.C_a, 3) + ' · ' + f2(plBest.alpha_p, 3) : '-') +
      rOut('Gross req. plate thk, t_yield_gr', f2(plBest.t + tc) + ' mm', '', bv ? 't = 0.0158 α_p b K_R,a √(|P| / (χ C_a R_eH)) + t_c (Ch 7 Sec 4 [1.1.1])' : 't = 0.0158 α_p b √(P / (C_a R_eH)) + t_c with b = EPP breadth (Ch 6 Sec 4 [1.1.1])') + rOut('Gross req. minimum thickness, t_min_gr', f2(tminGr) + ' mm', '', bv ? 'Ch 7 Sec 3: 5.0 mm gross for all structural elements' : 'a ' + tmin.a + ' + b ' + tmin.b + ' · L_2 · √k') +
      rOut('Gross req. slenderness thk, t_slend_gr', f2(tslend + tc) + ' mm', '', bv ? 'NR615 Sec 2: 2.32 b 10⁻³ √(0.2 R_eH / 4) + t_c' : 'b / C, C = ' + Cslend) +
      rOut('Rule status (t_gr ' + f2(tp_gr, 1) + ' vs ' + f2(tReqGr) + ')', tp_gr + 1e-9 >= tReqGr ? 'OK' : 'NOT OK', tp_gr + 1e-9 >= tReqGr ? 'ok' : 'fail');
    /* ---- stiffener ---- */
    var beff = Math.min(200 * (+col.l), +col.s); if (tp < 8) beff = Math.min(beff, 600);
    var net = Sc.sectionProps(prof, tcS, tp, beff, +col.phi_w || 90);
    /* DNV Ch 3 Sec 7 [1.4.3]: d_shr = (h_stf + t_p) sin phi_w; BV Ch 4 Sec 6 [1.4.4]: (h_stf - 0.5 t_c-stf + t_p + 0.5 t_c-pl) sin phi_w.
       h_stf is the GROSS stiffener height, t_p the net plate; with one t_c for both parts the two are the same */
    var d_shr = (prof.h + tp) * net.sinw;
    var f_u = bv ? 1.0 : (prof.type === 'FB' || prof.type === 'T' ? 1.0 : (prof.type === 'HP' ? 1.03 : 1.15));
    var KRs = bv ? Sc.KRs(+col.s, +col.R_curv || 0, tp_gr) : 1.0;
    var C_m = 1.0;                                     /* flat bars, bulbs and L < 90 m: 1.0; other profiles: [1.1.1] formula needs Z/Z_a - iterated below */
    var st = sets.map(function (s) {
      var c = Sc.stiffCoef(s.AC, longit, col.fixity, !!col.vertical, !!s.flood);
      var C_s = Sc.stiffCs(c, R_s, sig, s.side, col.fixity, s.testing ? 1.1 : 1.0);
      var r = Sc.stiffenerReq(s.P, +col.s, +col.l_bdg, +col.l_shr, d_shr, R_s, C_s, c.C_t, f_u, c.f_bdg, c.f_shr, 1.0, { testing: !!s.testing, flood: !!s.flood, collision: !!s.collision, KR: KRs });
      return { set: s, Z: r.Z, t_w: r.t_w, C_s: C_s, c: c };
    });
    var zBest = st.reduce(function (b, r) { return r.Z > b.Z ? r : b; }, st[0] || { Z: 0 });
    var wBest = st.reduce(function (b, r) { return r.t_w > b.t_w ? r : b; }, st[0] || { t_w: 0 });
    if (!bv && (prof.type === 'L' || prof.type === 'T')) {  /* DNV C_m for angle / T profiles, Ch 6 Sec 5 [1.1.1] */
      var Cst = Math.min(Math.max(wBest.C_s || 0.5, 0.5), 0.95), Cxt = 0.52 * Cst + 0.56;
      var e0 = 9.23 * Math.pow(net.hw / net.tw * Math.sqrt(R_s), -0.25);
      var ratio = Math.min(zBest.Z / net.Z, 1.0);
      var inner = 1 - Math.pow(0.75 / Cxt * ratio, e0);
      C_m = inner > 0 ? Math.max(0.71 * Math.pow(inner, -1 / e0), 1.0) : 99;
    }
    var tankB = /^(ballast|fresh|fuel|cargo|other|dryHold|dryHoldLower|tankInt)$/.test(col.comp1.kind) || /^(ballast|fresh|fuel|cargo|other|dryHold|dryHoldLower|tankInt)$/.test(col.comp2.kind);
    var twMinRow = bv ? { t: Sc.minStiffener() - tcS, row: '5.0 mm gross' } : Sc.minStiffener(col.member, ship, tankB), twMin = twMinRow.t;
    var sl = Sc.slenderness(prof, net, R_s, !!col.fbLateral);
    var tw_req_net = Math.max((wBest.t_w || 0) * C_m, twMin, bv ? 0 : 0.4 * plBest.t, sl.tw_req);
    var okZ = net.Z + 1e-9 >= (zBest.Z || 0), okW = net.tw + 1e-9 >= tw_req_net, okF = !sl.tf_req || net.tf + 1e-9 >= sl.tf_req;
    res += rSub('Results (yield) stiffener · ' + esc(prof.name)) +
      rOut('Design pressure for stiffener P', st.length ? f2(zBest.set.P) + ' kN/m²' : '-', '', st.length ? zBest.set.set + ' · ' + zBest.set.scenario + ' · ' + zBest.set.AC + ' · ' + zBest.set.kase : '') +
      rOut('Dimensioning design case, Z', st.length ? zBest.set.set + ' · ' + zBest.set.scenario + (zBest.set.kase !== '-' ? ' · ' + zBest.set.kase : '') : '-') +
      rOut('C_s · f_bdg · f_u', st.length ? f2(zBest.C_s, 3) + ' · ' + zBest.c.f_bdg + ' · ' + f_u : '-') +
      rOut('Effective breadth b_eff', f2(beff, 0) + ' mm') +
      rOut('Net actual section modulus Z_a (net t_p ' + f2(tp, 1) + ')', f2(net.Z) + ' cm³', okZ ? 'ok' : 'fail') + rOut('Net req. section modulus Z', f2(zBest.Z || 0) + ' cm³') +
      rOut('Gross web thickness t_w (actual, net ' + f2(net.tw, 1) + ')', f2(prof.t) + ' mm', okW ? 'ok' : 'fail') +
      rOut('Gross req. web thk, shear', f2((wBest.t_w || 0) * C_m + tcS) + ' mm', '', (wBest.set ? wBest.set.set + ' · C_t ' + wBest.c.C_t + ' · f_shr ' + wBest.c.f_shr + ' · d_shr ' + f2(d_shr, 1) + ' · C_m ' + f2(C_m, 3) : '')) +
      rOut(bv ? 'Gross req. min web thk (Ch 7 Sec 3)' : 'Gross req. min web thk (Ch 6 Sec 3 Table 2)', f2(twMin + tcS) + ' mm', '', esc(twMinRow.row)) + (bv ? '' : rOut('Gross req. web thk, 40 % of plate', f2(0.4 * plBest.t + tcS) + ' mm')) +
      rOut('Gross req. web slenderness thk (' + (bv ? 'NR615 Sec 2, ' : 'C_w ') + sl.C_w + ')', f2(sl.tw_req + tcS) + ' mm');
    if (sl.tf_req !== undefined) res += rOut('Gross flange thk t_f / req. slenderness (' + (bv ? 'NR615 K 0.43' : 'C_f 12') + ')', f2(prof.tf) + ' / ' + f2(sl.tf_req + tcS) + ' mm', okF ? 'ok' : 'fail') + rOut('Flange breadth b_f / min 0.2 h_w', f2(prof.bf, 0) + ' / ' + f2(sl.bf_min, 0) + ' mm', prof.bf >= sl.bf_min ? 'ok' : 'fail');
    res += rOut('Rule status', okZ && okW && okF ? 'OK' : 'NOT OK', okZ && okW && okF ? 'ok' : 'fail');
    res += rSub('Intermediate') + rOut('LCP x, y, z', f2(pt.x, 3) + ', ' + f2(pt.y, 3) + ', ' + f2(pt.z, 3) + ' m', '', 'Ch 3 Sec 7 Table 2: plate LCP at the lower edge of the EPP (mid-length); stiffener LCP at mid-span on the plate. Enter the point accordingly - one point serves both here.') + rOut('Material factor k (plate)', f2(k_p, 3)) +
      rOut('Net stiffener (h_w / t_w / b_f / t_f)', f2(net.hw, 1) + ' / ' + f2(net.tw, 1) + ' / ' + f2(net.bf, 1) + ' / ' + f2(net.tf, 1) + ' mm') + rOut('Net stiffener area / inertia', f2(net.Astf) + ' cm² / ' + f2(net.I) + ' cm⁴');
    var rows = sets.map(function (s, j) { return { set: s.set + ' (' + (s.side === 'stiffener' ? 'C1' : 'C2') + ')', scen: s.scenario, AC: s.AC, P: s.P, kase: s.kase, t: pl[j].t, Z: st[j].Z, tw: st[j].t_w * C_m, _best: s === zBest.set }; });
    if (rows.length) res += '<details class="lp-det" open><summary>Design load sets</summary>' + casesTable(rows, [['Set', 'set'], ['Scenario', 'scen'], ['AC', 'AC'], ['P', 'P'], ['Case', 'kase'], ['t_net', 't'], ['Z', 'Z'], ['t_w', 'tw']]) + '</details>';
    var okPlate = tp_gr + 1e-9 >= tReqGr, okAll = okPlate && okZ && okW && okF;
    var hero = [{ label: 'Plate t', value: f2(tp_gr, 1) + '/' + f2(tReqGr, 1), sub: 'gross / required mm', cls: okPlate ? 'ok' : 'fail' },
                { label: 'Stiffener Z', value: f2(net.Z, 1) + '/' + f2(zBest.Z || 0, 1), sub: 'actual / required cm³ net', cls: okZ ? 'ok' : 'fail' },
                { label: 'Web t_w', value: f2(prof.t, 1) + '/' + f2(tw_req_net + tcS, 1), sub: 'gross / required mm', cls: okW && okF ? 'ok' : 'fail' }];
    return { html: res, hero: hero, status: { text: okAll ? 'OK' : 'NOT OK', cls: okAll ? 'ok' : 'fail' } };
  }

  /* hero: [{label, value, sub, cls}] shown as tiles under the column head; status: {text, cls} badge */
  function column(p, col, body, res, err, tab, i, hero, status) {
    var tiles = (hero || []).map(function (t) {
      return '<div class="lp-tile' + (t.cls ? ' ' + t.cls : '') + '"><div class="lp-tile-label">' + t.label + '</div><div class="lp-tile-value">' + t.value + '</div>' + (t.sub ? '<div class="lp-tile-sub">' + t.sub + '</div>' : '') + '</div>';
    }).join('');
    return '<div class="lp-col' + (status && status.cls ? ' is-' + status.cls : '') + '"><div class="lp-col-head">' +
      '<span class="lp-col-title"><span class="lp-col-idx">' + (i + 1) + '</span>' + (col.name ? esc(col.name) : 'Point ' + (i + 1)) + '</span>' +
      (status ? '<span class="lp-badge ' + (status.cls || '') + '">' + status.text + '</span>' : '') +
      '<span class="lp-col-btns"><button title="Duplicate column" data-act="dup" data-tab="' + tab + '" data-i="' + i + '">⧉</button><button title="Delete column" data-act="del" data-tab="' + tab + '" data-i="' + i + '">✕</button></span></div>' +
      (tiles ? '<div class="lp-hero">' + tiles + '</div>' : '') +
      (err ? '<div class="lp-err">' + esc(err) + '</div>' : '') +
      '<details class="lp-fold" open><summary>Input</summary>' + body + '</details>' +
      '<div class="lp-results"><div class="lp-head lp-head-results">Results</div>' + res + '</div></div>';
  }
  function addBtn(tab) { return '<button class="lp-add" data-act="add" data-tab="' + tab + '"><span class="lp-add-plus">+</span><span>Add point</span></button>'; }

  function panel(title, inner, icon) {
    return '<div class="ea-panel lp-panel"><div class="ea-panel-header"><div class="ea-panel-icon' + (icon ? ' ' + icon : '') + '"></div><div class="ea-panel-title">' + title + '</div></div><div class="lp-panel-body">' + inner + '</div></div>';
  }
  function paintShipSSC(s, p, ship, clsPanel) {
    var prm = null, m = null; try { prm = Lssc.params(ship); m = Lssc.motionsDisp(ship); } catch (e) { console.error(e); }
    var nd = (s.mode || 'disp') === 'nondisp';
    var derived = prm ? [
      { label: 'f_Hs · H_s', value: f2(prm.f_Hs, 3) + ' · ' + f2(prm.H_s, 2), sub: 'wave height factor · applied H_s (min ' + prm.Hs_min + ' m)' },
      { label: 'Γ · F_n', value: f2(prm.Gamma, 2) + ' · ' + f2(prm.F_n, 3), sub: 'Taylor quotient · Froude number' },
      { label: 'ω · G_f · H_f · C_f', value: [prm.omega, prm.G_f, prm.H_f, prm.C_f].map(function (v) { return f2(v, 2); }).join(' · '), sub: 'service type · area · hull · craft factors' },
      { label: 'T_θ · θ', value: f2(m.T_theta, 1) + ' s · ' + f2(m.theta, 1) + '°', sub: 'roll period · amplitude (Tab 2.3.2)' },
      { label: 'T_φ · φ', value: f2(m.T_phi, 1) + ' s · ' + f2(m.phi, 1) + '°', sub: 'pitch period · amplitude' },
      { label: 'L_f · k_r', value: f2(prm.L_f, 3) + ' · ' + f2(prm.k_r, 2), sub: 'wave coefficient · hull form factor' }
    ] : [];
    var tiles = derived.map(function (t) { return '<div class="lp-tile"><div class="lp-tile-label">' + t.label + '</div><div class="lp-tile-value">' + t.value + '</div><div class="lp-tile-sub">' + t.sub + '</div></div>'; }).join('');
    var main = rIn('Craft / project', p + '.name', s.name) + rIn('Rule length L_R', p + '.L', s.L, 'm') + rIn('Waterline length L_WL (blank = L_R)', p + '.L_WL', s.L_WL, 'm') +
      rIn('Moulded breadth B', p + '.B', s.B, 'm') + rIn('Moulded depth D', p + '.D', s.D, 'm') + rIn('Draught T', p + '.T_SC', s.T_SC, 'm') + rIn('Block coefficient C_b', p + '.C_B', s.C_B) +
      rIn('Displacement Δ', p + '.disp', s.disp, 't') + rIn('Allowable speed V', p + '.V', s.V, 'knots');
    var notation = rSel('Operating mode', p + '.mode', s.mode || 'disp', [['disp', 'Displacement (Pt 5 Ch 4)'], ['nondisp', 'Non-displacement (Pt 5 Ch 3)']]) +
      rSel('Service group', p + '.group', s.group || 'G4', ['G0', 'G1', 'G2', 'G2A', 'G3', 'G4', 'G5', 'G6'].map(function (k) { return [k, k + ' · H_s min ' + Lssc.HS_MIN[k] + ' m · G_f ' + Lssc.GF[k]]; })) +
      rIn('Design significant wave height H_s (blank = group minimum)', p + '.H_s', s.H_s, 'm') +
      rSel('Service type notation (ω)', p + '.stype', s.stype || 'passenger', Object.keys(Lssc.OMEGA).map(function (k) { return [k, Lssc.OMEGA_LABEL[k] + ' · ω ' + Lssc.OMEGA[k]]; })) +
      rSel('Hull notation (H_f)', p + '.hull', s.hull || 'none', [['none', 'None · 1.0'], ['HSC', 'HSC · 1.0'], ['LDC', 'LDC · 0.95']]) +
      rSel('Craft type notation (C_f)', p + '.craft', s.craft || 'Mono', [['Mono', 'Mono · 1.0'], ['RIB', 'RIB · 1.15'], ['Hydrofoil', 'Hydrofoil · 1.1']]);
    var motions = rIn('GM (blank = 0.10 B, min 0.05 B)', p + '.GM', s.GM, 'm') + rIn('Roll radius of gyration k_r (blank = 0.39 B)', p + '.k_r', s.k_r, 'm') + rChk('Bilge keel fitted', p + '.bilgeKeel', s.bilgeKeel) +
      rIn('LCG from aft end of L_WL (blank = 0.45 L_WL)', p + '.x_LCG', s.x_LCG, 'm') + rIn('Underside of keel above baseline z_k', p + '.z_k', s.z_k, 'm') +
      (nd ? rIn('Deadrise at LCG θ_D (≤ 30)', p + '.theta_D', s.theta_D, '°') + rIn('Running trim θ_B (≥ 3)', p + '.theta_trim', s.theta_trim, '°') + rIn('Chine / bilge breadth at LCG B_c', p + '.B_c', s.B_c, 'm') + rIn('Waterline breadth at LCG B_W', p + '.B_W', s.B_W, 'm') : '');
    $('#board-ship').innerHTML = '<div class="lp-ship">' + clsPanel +
      '<div class="lp-ship-grid">' + panel('Main particulars', main) + panel('Notations and environment', notation, 'orange') + panel('Motions' + (nd ? ' and planing parameters' : ''), motions, 'purple') +
      panel('Frame table', rIn('x of frame 0 from aft end of L_WL', p + '.x0', s.x0, 'm') + rIn('Spacing zones  fromFrame:spacing, …', p + '.frames', s.frames, 'm') +
        '<div class="lp-hint">Points can then be entered as <b>#12</b> or <b>#-3</b> instead of millimetres. SSC loads use x from the aft end of L_WL.</div>', 'success') + '</div>' +
      '<div class="lp-derived"><div class="lp-derived-title">Derived from the rules</div><div class="lp-hero lp-hero-wide">' + tiles + '</div></div></div>';
  }
  function paintShipLR(s, p, ship, clsPanel) {
    var prm = null; try { prm = Lr.params(ship); } catch (e) { console.error(e); }
    var derived = prm ? [
      { label: 'C_w · F_λ', value: f2(prm.C_w, 3) + ' · ' + f2(prm.F_lambda, 3), sub: 'wave head (7.71 10⁻² L e^−0.0044L) · length factor' },
      { label: 'E', value: f2(prm.E, 4), sub: 'platform height correction (Tab 3.5.1)' },
      { label: 'k_L · F_D · F_B', value: f2(prm.k_L, 2) + ' · ' + f2(prm.F_D, 2) + ' · ' + f2(prm.F_B, 2), sub: 'HT factor · local reduction factors' },
      { label: 'D_2 · s_b', value: f2(prm.D_2, 2) + ' m · ' + f2(prm.s_bMid, 0) + ' mm', sub: 'D ≤ 1.6 T · standard spacing amidships' },
      { label: 'H_b applied', value: f2(prm.H_b, 2), sub: 'm · bow height for D_1 at the ends' },
      { label: 'h_T1 · h_T2', value: f2(Math.min(ship.T + prm.C_w, 1.36 * ship.T), 2) + ' · ' + f2(Math.min(ship.T + 0.5 * prm.C_w, 1.2 * ship.T), 2), sub: 'm · side / bottom plating heads amidships' }
    ] : [];
    var tiles = derived.map(function (t) { return '<div class="lp-tile"><div class="lp-tile-label">' + t.label + '</div><div class="lp-tile-value">' + t.value + '</div><div class="lp-tile-sub">' + t.sub + '</div></div>'; }).join('');
    var main = rIn('Ship / project', p + '.name', s.name) + rIn('Rule length L', p + '.L', s.L, 'm') + rIn('Moulded breadth B', p + '.B', s.B, 'm') + rIn('Moulded depth D', p + '.D', s.D, 'm') + rIn('Summer draught T', p + '.T_SC', s.T_SC, 'm') + rIn('Block coefficient C_b', p + '.C_B', s.C_B);
    var hull = rSel('Hull girder steel (k_L, Tab 2.1.1)', p + '.matHull', s.matHull || 235, Object.keys(Lr.MATERIALS).map(function (k) { return [Lr.MATERIALS[k], k + ' · k_L ' + Lr.kL(Lr.MATERIALS[k]).toFixed(2)]; })) +
      rIn('F_D deck reduction factor σ_D/σ (blank = 1.0)', p + '.F_D', s.F_D) + rIn('F_B keel reduction factor σ_B/σ (blank = 1.0)', p + '.F_B', s.F_B) +
      rSel('Freeboard type', p + '.fbType', s.fbType || 'B', [['B', 'Type B'], ['B60', 'Type B-60']]) + rIn('Minimum bow height H_b (blank = D − T)', p + '.H_b', s.H_b, 'm') +
      rSel('Number of decks (K_1 for beams)', p + '.decks', s.decks || 1, [[1, '1'], [2, '2'], [3, '3'], [4, '4 or more']]) + rIn('Tank liquid relative density ρ (≥ 1.025)', p + '.rho', s.rho);
    $('#board-ship').innerHTML = '<div class="lp-ship">' + clsPanel +
      '<div class="lp-ship-grid">' + panel('Main particulars', main) + panel('Hull girder and notation', hull, 'orange') +
      panel('Frame table', rIn('x of frame 0 from A.P.', p + '.x0', s.x0, 'm') + rIn('Spacing zones  fromFrame:spacing, …', p + '.frames', s.frames, 'm') + '<div class="lp-hint">Points can then be entered as <b>#12</b> or <b>#-3</b>. LR tables use x from the A.P.; the fore / aft end rows switch at 0.3 L and 0.7 L.</div>', 'success') +
      panel('Scope', '<div class="lp-hint">General cargo ship rows (Pt 4 Ch 1) in the midship region, fore / aft end shell (Pt 3 Ch 5-6), erections (Pt 3 Ch 8), decks and bulkheads (Pt 3 Ch 3 Sec 5 heads). Other ship types (Pt 4 Ch 2-13), hull girder, buckling and primary members are not covered.</div>', 'purple') + '</div>' +
      '<div class="lp-derived"><div class="lp-derived-title">Derived from the rules</div><div class="lp-hero lp-hero-wide">' + tiles + '</div></div></div>';
  }
  function paintShip() {
    var s = S.ship, p = 'ship', ship = shipModel(), bv = isBV();
    if (isLR()) {
      var cpl = '<div class="lp-cls">' + CLASSES.map(function (c) {
        return '<button class="lp-cls-btn' + ((s.cls || 'dnv') === c[0] ? ' on' : '') + '" data-cls="' + c[0] + '"><span class="lp-cls-name">' + c[1].split(' - ')[0] + '</span><span class="lp-cls-sub">pressures · accelerations · plating · stiffeners</span></button>';
      }).join('') + '</div>';
      return paintShipLR(s, p, ship, cpl);
    }
    if (isSSC()) {
      var cp = '<div class="lp-cls">' + CLASSES.map(function (c) {
        var ready = true;
        return '<button class="lp-cls-btn' + ((s.cls || 'dnv') === c[0] ? ' on' : '') + (ready ? '' : ' soon') + '" data-cls="' + c[0] + '"' + (ready ? '' : ' disabled') + '><span class="lp-cls-name">' + c[1].split(' - ')[0] + '</span><span class="lp-cls-sub">' + (ready ? 'pressures · accelerations · plating · stiffeners' : 'in preparation') + '</span></button>';
      }).join('') + '</div>';
      return paintShipSSC(s, p, ship, cp);
    }
    var m = null; try { m = accOf().motions(ship, {}); } catch (e) {}
    var derived = m ? [
      bv ? { label: 'H · n', value: f2(m.H_heave, 3) + ' · ' + f2(m.n, 2), sub: 'wave parameter (heave) · navigation' } : { label: 'C_w', value: f2(Sea.waveCoef(ship.L), 3), sub: 'wave coefficient' },
      { label: 'T_θ · θ', value: f2(m.T_theta, 1) + ' s · ' + f2(m.theta, 1) + '°', sub: 'roll period · angle' },
      { label: 'T_φ · φ', value: f2(m.T_phi, 1) + ' s · ' + f2(m.phi, 1) + '°', sub: 'pitch period · angle' },
      { label: 'a_heave', value: f2(m.a_heave, 2), sub: 'm/s² at T_SC' },
      { label: 'GM · k_r', value: f2(m.GM, 2) + ' · ' + f2(m.k_r, 2), sub: 'm, applied' },
      bv ? { label: 'T_R · x_G · z_G', value: f2(m.T_R, 2) + ' · ' + f2(m.x_G, 1) + ' · ' + f2(m.z_G, 2), sub: 'roll period ratio · CoG m' } : { label: 'L_0 · L_1 · L_2', value: Math.max(ship.L, 110).toFixed(1) + ' · ' + Math.min(ship.L, 250).toFixed(1) + ' · ' + Math.min(ship.L, 300).toFixed(1), sub: 'm' }
    ] : [];
    var tiles = derived.map(function (t) { return '<div class="lp-tile"><div class="lp-tile-label">' + t.label + '</div><div class="lp-tile-value">' + t.value + '</div><div class="lp-tile-sub">' + t.sub + '</div></div>'; }).join('');
    var clsPanel = '<div class="lp-cls">' + CLASSES.map(function (c) {
      var ready = true;
      return '<button class="lp-cls-btn' + ((s.cls || 'dnv') === c[0] ? ' on' : '') + (ready ? '' : ' soon') + '" data-cls="' + c[0] + '"' + (ready ? '' : ' disabled') + '><span class="lp-cls-name">' + c[1].split(' - ')[0] + '</span><span class="lp-cls-sub">' + (ready ? 'pressures · accelerations · plating · stiffeners' : 'in preparation') + '</span></button>';
    }).join('') + '</div>';
    var stab = bv
      ? rIn('GM (blank = Ch 5 Sec 3 Tab 4 default)', p + '.GM', s.GM, 'm') + rIn('Roll radius of gyration k_r (blank = Tab 4 default)', p + '.k_r', s.k_r, 'm') +
        rChk('Bilge keel fitted', p + '.bilgeKeel', s.bilgeKeel) + rChk('Oil tanker / bulk carrier (Tab 4 GM, k_r)', p + '.tanker', s.tanker) +
        rSel('Navigation notation', p + '.nav', s.nav, [['unrestricted', 'Unrestricted navigation'], ['summer', 'Summer zone'], ['tropical', 'Tropical zone'], ['coastal', 'Coastal area'], ['sheltered', 'Sheltered area']]) +
        rChk('Prescriptive assessment (P_ex >= 2.5 kN/m²)', p + '.prescriptive', s.prescriptive !== false)
      : rIn('GM (blank = 0.07 B, tankers 0.12 B)', p + '.GM', s.GM, 'm') + rIn('Roll radius of gyration k_r (blank = 0.39 B)', p + '.k_r', s.k_r, 'm') +
        rChk('Bilge keel fitted', p + '.bilgeKeel', s.bilgeKeel) + rChk('Tanker', p + '.tanker', s.tanker) +
        rSel('Service area notation', p + '.service', s.service, [['R0', 'R0 (unrestricted)'], ['R1', 'R1'], ['R2', 'R2'], ['R3', 'R3'], ['R4', 'R4']]);
    var main = rIn('Ship / project', p + '.name', s.name) +
        rIn('Rule length L', p + '.L', s.L, 'm') + rIn('Moulded breadth B', p + '.B', s.B, 'm') + rIn('Moulded depth D', p + '.D', s.D, 'm') +
        rIn('Scantling draught T_SC', p + '.T_SC', s.T_SC, 'm') + rIn('Ballast draught T_BAL', p + '.T_BAL', s.T_BAL, 'm') + rIn('Block coefficient C_B', p + '.C_B', s.C_B) +
        (bv ? rIn('Waterplane coefficient C_W (blank = 0.85)', p + '.C_W', s.C_W) + rIn('C_B at T_BAL (blank = C_B)', p + '.C_B_BAL', s.C_B_BAL) + rIn('C_W at T_BAL (blank = C_W)', p + '.C_W_BAL', s.C_W_BAL) : '');
    var decks = bv
      ? rChk('Ro-ro / PCTC / passenger ship (harbour draught 0.7 T_SC)', p + '.roro', s.roro) + rIn('Freeboard length L_LL (blank = L)', p + '.L_LL', s.L_LL, 'm') + rChk('Type A / B-60 / B-100 freeboard', p + '.typeA', s.typeA)
      : rSel('Continuous decks above 0.7 D', p + '.decksAbove07D', s.decksAbove07D, [[0, '0 or 1'], [2, '2'], [3, 'more than 2']]) +
        rIn('Freeboard length L_LL (blank = L)', p + '.L_LL', s.L_LL, 'm') + rChk('Type A / B-60 / B-100 freeboard', p + '.typeA', s.typeA);
    $('#board-ship').innerHTML = '<div class="lp-ship">' + clsPanel +
      '<div class="lp-ship-grid">' +
      panel('Main dimensions', main) +
      panel('Stability and motions', stab, 'purple') +
      panel('Decks and freeboard', decks, 'orange') +
      panel('Frame table', rIn('x of frame 0 from aft end of L', p + '.x0', s.x0, 'm') + rIn('Spacing zones  fromFrame:spacing, …', p + '.frames', s.frames, 'm') +
        '<div class="lp-hint">Points can then be entered as <b>#12</b> or <b>#-3</b> instead of millimetres. Zones apply from the named frame forward; the first zone also covers frames aft of it.</div>', 'success') +
      '</div>' +
      '<div class="lp-derived"><div class="lp-derived-title">Derived from the rules</div><div class="lp-hero lp-hero-wide">' + tiles + '</div></div>' +
      '</div>';
  }

  /* ---------------- events ---------------- */
  function setPath(path, v) {
    var parts = path.split('.'), o = S;
    for (var i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = v;
  }
  document.addEventListener('change', function (e) {
    var t = e.target; if (!t.matches || !t.matches('.lp-in')) return;
    var v = t.type === 'checkbox' ? t.checked : t.value;
    setPath(t.dataset.path, v);
    if (/\.member$/.test(t.dataset.path)) {                  /* position changed: external compartments follow it */
      var parts = t.dataset.path.split('.'), col = S[parts[0]][+parts[1]];
      ['comp1', 'comp2'].forEach(function (c) { var k = Pos.coerceKind(v, col[c].kind); if (k) { col[c].kind = k; toast('Compartment ' + c.slice(-1) + ' load set to "' + k + '" for position ' + Pos.get(v).code); } });
    }
    persist(); paint();
  });
  document.addEventListener('toggle', function (e) { var d = e.target; if (d.matches && d.matches('details[data-path]')) { setPath(d.dataset.path, d.open); persist(); } }, true);
  document.addEventListener('click', function (e) {
    var cb = e.target.closest('[data-cls]');
    if (cb && !cb.disabled) { S.ship.cls = cb.dataset.cls; persist(); paint(); return; }
    var b = e.target.closest('[data-act]'); if (!b) return;
    var tab = b.dataset.tab, list = S[tab], i = +b.dataset.i;
    if (b.dataset.act === 'add') list.push(tab === 'press' ? defPressCol() : tab === 'acc' ? defAccCol() : defScantCol());
    if (b.dataset.act === 'dup') list.splice(i + 1, 0, JSON.parse(JSON.stringify(list[i])));
    if (b.dataset.act === 'del') { if (list.length > 1) list.splice(i, 1); else toast('The last point stays - edit it instead'); }
    persist(); paint();
  });

  var PAGES = [[1, 'Ship'], [2, 'Pressure'], [3, 'Accelerations'], [4, 'Plate & Stiffeners']];
  function paint() {
    var w = '';
    PAGES.forEach(function (p, i) {
      if (i) w += '<div class="ea-wizard-line"></div>';
      w += '<button class="ea-wizard-step' + (p[0] === S.page ? ' active' : '') + '" onclick="LP.go(' + p[0] + ')"><span class="ea-wizard-num">' + p[0] + '</span> ' + p[1] + '</button>';
    });
    $('#wizard').innerHTML = w;
    var sub = document.querySelector('.ea-title-group p'); if (sub) sub.textContent = (isBV() ? 'BV NR467 Pt B (July 2026)' : isSSC() ? 'LR Special Service Craft Pt 5-6 (July 2026)' : isLR() ? 'LR Rules for Ships Pt 3-4, general cargo (July 2026)' : 'DNV RU-SHIP Pt 3 (July 2026)') + ' — design pressures, accelerations and plate / stiffener scantlings at a point';
    document.querySelectorAll('.ea-page').forEach(function (el, i) { el.classList.toggle('active', i + 1 === S.page); });
    try { if (S.page === 1) paintShip(); if (S.page === 2) paintPressure(); if (S.page === 3) paintAccel(); if (S.page === 4) paintScant(); } catch (e) { console.error(e); toast(e.message); }
  }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(function () { t.classList.remove('show'); }, 2500); }

  window.LP = {
    go: function (n) { S.page = n; persist(); paint(); },
    save: function () {
      var blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (S.ship.name || 'loadpoint') + '.loadpoint.json'; a.click();
    },
    load: function (ev) {
      var f = ev.target.files[0]; if (!f) return;
      var r = new FileReader(); r.onload = function () { try { var j = JSON.parse(r.result); if (j.ship) { S = j; persist(); paint(); toast('Loaded'); } } catch (e) { toast('Not a LoadPoint file'); } }; r.readAsText(f); ev.target.value = '';
    },
    reset: function () { if (confirm('Reset every input to the defaults?')) { S = { page: 1, ship: defShip(), press: [defPressCol()], acc: [defAccCol()], scant: [defScantCol()] }; persist(); paint(); } }
  };
  paint();
})();
