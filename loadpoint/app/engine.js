/* LoadPoint - design load sets (Ch 6 Sec 2 Table 1) assembled from the pressure
   modules. One entry point: designLoads(ship, col) -> { comp1: [...], comp2: [...] }
   where every item is { set, scenario, AC, P, kase, draught, note }.

   Sign convention: P > 0 pushes from the named compartment onto the element.
   Outer shell next to a tank (Ch 6 Sec 2 [1.3.1]): the tank sets carry the net
   pressure P_in - P_ex at the set's draught; the sea sets are applied alone.
   Other elements: each compartment on its own. */
(function (root) {
  'use strict';
  var Sea = root.LoadPoint || require('./calc'), Acc = root.LoadPointAccel || require('./accel'), Tk = root.LoadPointTank || require('./tank');
  var BSea = root.BVSea || require('./bv/sea'), BAcc = root.BVAccel || require('./bv/accel'), BTk = root.BVTank || require('./bv/tank');
  var SSC = root.LRSSCLoads || require('./lrssc/loads'), LR = root.LRShips || require('./lr/rules');
  var g = 9.81, rho = 1.025;

  /* The rule set is chosen on the Ship page (ship.cls). Every class exposes the same
     functions; the design load sets differ per class and are built below. */
  var RULES = {
    dnv: { name: 'DNV RU-SHIP Pt 3 (July 2026)', sea: Sea, acc: Acc, tank: Tk },
    bv:  { name: 'BV NR467 Pt B (July 2026)', sea: BSea, acc: BAcc, tank: BTk },
    lrssc: { name: 'LR SSC (July 2026)', ssc: SSC },
    lr: { name: 'LR Rules for Ships (July 2026)', lr: LR }
  };
  function rulesOf(ship) { return RULES[ship.cls] || RULES.dnv; }

  /* frame/mm text -> m */
  function parseX(ship, txt) {
    var s = String(txt === undefined ? '' : txt).trim();
    if (!s) return 0;
    if (s[0] === '#' || /^fr/i.test(s)) {
      var fr = parseFloat(s.replace(/^[#a-zA-Z. ]+/, ''));
      return Sea.frameX(ship.frames || { x0: 0, s: 0.6 }, isNaN(fr) ? 0 : fr);
    }
    return parseFloat(s) / 1000;
  }

  /* sea pressure per load case at a point for a draught; returns {P_S, cases:[{name,P_W,P_ex}], env} */
  function sea(ship, pt, T_LC, bwe) { return rulesOf(ship).sea.seaPressure(ship, pt, { T_LC: T_LC, bwe: bwe }); }

  /* tank pressure per load case: static + dynamic (accelerations at the tank CoG) */
  function tankCases(ship, tank, pt, T_LC, bwe) {
    var R = rulesOf(ship), A = R.acc, T = R.tank;
    var m = A.motions(ship, { T_LC: T_LC, bwe: bwe });
    var acc = A.caseAccelerations(m, tank.x_G, tank.y_G, tank.z_G);
    var st = T.staticPressures(tank, pt, ship.L);
    var cases = A.CASES.map(function (k) {
      var d = T.dynamicPressure(tank, pt, acc[k]);
      return { name: k, P_ld: d.P_ld, ref: d.ref, acc: acc[k] };
    });
    return { st: st, cases: cases, m: m };
  }

  function best(list, key) { return list.reduce(function (b, r) { return r[key] > b[key] ? r : b; }, list[0]); }

  /* deck distributed load: S and S+D with envelope a_z (Sec 5 [2.3.1]). Table 1 lists T_BAL for
     UDL-1 with note 3 (condition giving the highest acceleration); Nauticus Hull reproduces
     4.37 kN/m2 for the reference ship only with T_LC = T_SC, so that is what is used here. */
  function deckLoad(ship, pt, P_dls, T_LC) {
    var A = rulesOf(ship).acc;
    var m = A.motions(ship, { T_LC: T_LC });
    if (ship.cls === 'bv') {                  /* BV Ch 5 Sec 6 [6.1.1]: P_dl-d = P_dl-s a_Z/g for each load case */
      var ca = A.caseAccelerations(m, pt.x, pt.y, pt.z), bestK = null, bestA = -1e9;
      A.CASES.forEach(function (k) { if (ca[k].aZ > bestA) { bestA = ca[k].aZ; bestK = k; } });
      return { S: P_dls, SD: P_dls * (1 + bestA / g), a_z: bestA, kase: bestK };
    }
    var env = A.envelope(m, pt.x, pt.y, pt.z);
    return { S: P_dls, SD: P_dls * (1 + env.a_z_env / g), a_z: env.a_z_env, kase: 'a_z-env' };
  }

  /* green sea on exposed deck, Sec 5 [2.2]: P_D = max(chi P_D-min, P_W,D - rho g (z - z_dk)) for head/following
     seas, interpolated between the two deck edges for the others. wd: {z_dk, z_fdk, L_LL, x_LL, typeA, B_dk} */
  function greenSea(ship, pt, wd) {
    var Bd = wd.B_dk || ship.B, T = ship.T_SC;
    var side = function (y) { return Sea.seaPressure(ship, { x: pt.x, y: y, z: wd.z_dk, B_x: Bd }, {}); };
    var pt_ = side(Bd / 2), st = side(-Bd / 2);
    var Pmin = wd.noMin ? 0 : Tk.pDmin(wd.L_LL || ship.L, wd.x_LL === undefined ? pt.x : wd.x_LL, wd.typeA);
    var C = (wd.z_dk - wd.z_fdk) / 2.3, chi;
    if (Pmin === 0) chi = 0; else if (wd.z_dk <= wd.z_fdk + 1e-6) chi = 1.0; else chi = C < 3 ? Math.pow(0.75, C) : 2.5 / Pmin;
    var cases = pt_.cases.map(function (c, i) {
      var head = /^(HSM|HSA|FSM)/.test(c.name), P;
      if (head) P = Math.max(chi * Pmin, c.P_W - rho * g * (pt.z - wd.z_dk));
      else {
        var f = (pt.y + Bd / 2) / Bd;          /* 0 at starboard edge, 1 at port edge */
        var Pint = st.cases[i].P_W + (c.P_W - st.cases[i].P_W) * Math.min(Math.max(f, 0), 1);
        P = Pint - rho * g * (pt.z - wd.z_dk);
      }
      return { name: c.name, P_D: Math.max(P, 0) };
    });
    var b = best(cases, 'P_D');
    return { cases: cases, P_Dmax: b.P_D, governing: b.name, chi: chi, Pmin: Pmin };
  }

  /* ---- the design load sets for one compartment side ---- */
  function setsFor(ship, col, comp, other) {
    var pt = col.pt, out = [];
    var want = function (sc) { return col.scenario === 'all' || col.scenario === sc; };
    var T_SC = ship.T_SC, T_BAL = ship.T_BAL || 0.6 * T_SC;
    var shellNext = other.kind === 'sea';           /* element is outer shell, this tank sits inside */

    if (comp.kind === 'sea') {
      if (want('extSD')) {
        var r = sea(ship, pt, T_SC, false);
        out.push({ set: 'SEA-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: r.P_ex_SD, kase: r.governing, draught: T_SC, detail: r });
      }
      if (want('extS')) {
        var r2 = sea(ship, pt, T_SC, false);
        out.push({ set: 'SEA-2', scenario: 'ExtremeSea S', AC: 'AC-I', P: r2.P_ex_S, kase: '-', draught: T_SC, detail: r2 });
      }
    }
    if (comp.kind === 'ballast' || comp.kind === 'fresh' || comp.kind === 'fuel' || comp.kind === 'cargo' || comp.kind === 'other') {
      var tank = comp.tank, wb = comp.kind === 'ballast', pre = wb ? 'WB' : 'TK';
      var exS = function (T) { return shellNext ? Math.max(rho * g * (T - pt.z), 0) : 0; };
      if (want('extSD')) {
        var tc = tankCases(ship, tank, pt, T_BAL, false), sr = shellNext ? sea(ship, pt, T_BAL, false) : null;
        var rows = tc.cases.map(function (c, i) {
          return { name: c.name, P: tc.st.P_ls1 + c.P_ld - (sr ? sr.cases[i].P_ex : 0), P_ld: c.P_ld, P_ex: sr ? sr.cases[i].P_ex : 0 };
        });
        var b1 = best(rows, 'P');
        out.push({ set: pre + '-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: Math.max(b1.P, 0), kase: b1.name, draught: T_BAL, rows: rows, P_ls: tc.st.P_ls1 });
      }
      if (wb && want('bweSD')) {
        var tb = tankCases(ship, tank, pt, T_BAL, true), sb = shellNext ? sea(ship, pt, T_BAL, true) : null;
        var rws = tb.cases.map(function (c, i) { return { name: c.name, P: tb.st.P_ls2 + c.P_ld - (sb ? sb.cases[i].P_ex : 0), P_ld: c.P_ld, P_ex: sb ? sb.cases[i].P_ex : 0 }; });
        var b2 = best(rws, 'P');
        out.push({ set: 'WB-2', scenario: 'BWExchange S+D', AC: 'AC-II', P: Math.max(b2.P, 0), kase: b2.name, draught: T_BAL, rows: rws, P_ls: tb.st.P_ls2 });
      }
      if (want('testS')) {
        var st = Tk.staticPressures(tank, pt, ship.L);
        var Tt = wb ? Math.min(T_BAL, 0.25 * T_SC) : null;
        var P3 = wb ? Math.max(st.P_ls4 || 0, st.P_lsST) - exS(Tt) : Math.max(st.P_ls4 || 0, st.P_lsST);
        out.push({ set: wb ? 'WB-3' : 'TK-2', scenario: 'Testing S', AC: 'AC-III', P: Math.max(P3, 0), kase: '-', draught: Tt, P_ls: Math.max(st.P_ls4 || 0, st.P_lsST) });
      }
      if (want('harbS')) {
        var st2 = Tk.staticPressures(tank, pt, ship.L);
        out.push({ set: wb ? 'WB-4' : 'TK-3', scenario: 'Harbour S', AC: 'AC-I', P: Math.max(st2.P_ls3 - exS(T_BAL), 0), kase: '-', draught: T_BAL, P_ls: st2.P_ls3 });
      }
    }
    if (comp.kind === 'deck') {
      var P_dls = comp.P_dls || 2.5;
      if (want('extSD')) { var dl = deckLoad(ship, pt, P_dls, T_SC); out.push({ set: 'UDL-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: dl.SD, kase: 'a_z-env ' + dl.a_z.toFixed(2) + ' m/s2', draught: T_BAL }); }
      if (want('extS')) out.push({ set: 'UDL-2', scenario: 'ExtremeSea S', AC: 'AC-I', P: P_dls, kase: '-', draught: null });
    }
    if (comp.kind === 'weather') {
      if (want('extSD')) { var gs = greenSea(ship, pt, comp.wd || { z_dk: pt.z, z_fdk: pt.z }); out.push({ set: 'SEA-1 (P_D)', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: gs.P_Dmax, kase: gs.governing, draught: T_SC, detail: gs }); }
      var P_dls2 = comp.P_dls || 0;
      if (P_dls2 > 0) {
        if (want('extSD')) { var dl2 = deckLoad(ship, pt, P_dls2, T_SC); out.push({ set: 'UDL-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: dl2.SD, kase: 'a_z-env', draught: T_BAL }); }
        if (want('extS')) out.push({ set: 'UDL-2', scenario: 'ExtremeSea S', AC: 'AC-I', P: P_dls2, kase: '-', draught: null });
      }
    }
    if (comp.kind === 'flood') {
      if (want('floodS')) out.push({ set: 'FD-1', scenario: 'Flooding S', AC: comp.collision ? 'AC-I' : 'AC-III', P: Tk.floodingPressure(pt, comp.z_fd || ship.D, comp.dam), kase: '-', draught: null });
    }
    if (comp.kind === 'sside') {                          /* Ch 4 Sec 5 [3.3]: max(P_W; P_SI), SEA-1, AC-II */
      if (want('extSD')) {
        var rs = sea(ship, pt, T_SC, false), Cw = Sea.waveCoef(ship.L);
        var P_SI = pt.z < T_SC + 1.7 * Cw ? 3 * Cw * (ship.C_B + 0.7) - 2.2 * (pt.z - T_SC) : 2.5;
        P_SI = Math.max(P_SI, 2.5);
        var useW = rs.P_Wmax >= P_SI;
        out.push({ set: 'SEA-1 (P_SI)', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: Math.max(rs.P_Wmax, P_SI), kase: useW ? rs.governing : 'P_SI', draught: T_SC, detail: rs, P_SI: P_SI });
      }
    }
    if (comp.kind === 'tankInt') {
      if (want('extS')) out.push({ set: 'INT-1', scenario: 'ExtremeSea S', AC: 'AC-I', P: 12, kase: '-', draught: T_SC });
    }
    return out;
  }

  /* BV Ch 5 Sec 5 [3.2]: P_d at the deck. wd: {tier, L_LL, x_LL, typeA, B_dk (= B_x,max), noMin} */
  function greenSeaBV(ship, pt, wd) {
    var Bd = wd.B_dk || ship.B;
    var side = function (y) { return BSea.seaPressure(ship, { x: pt.x, y: y, z: pt.z, B_x: Bd }, {}); };
    var P = side(Bd / 2), S = side(-Bd / 2);
    var Pmin = wd.noMin ? 0 : BTk.pDmin(wd.L_LL || ship.L, wd.x_LL === undefined ? pt.x : wd.x_LL, wd.typeA);
    var chi = BTk.chiTier(wd.tier || 1);
    var cases = P.cases.map(function (c, i) {
      var head = /^(HVM|FVM)/.test(c.name), v;
      if (head) v = Math.max(c.P_W, chi * Pmin);
      else { var f = Math.min(Math.max((pt.y + Bd / 2) / Bd, 0), 1); v = S.cases[i].P_W + (c.P_W - S.cases[i].P_W) * f; }
      return { name: c.name, P_D: Math.max(v, 0) };
    });
    var b = best(cases, 'P_D');
    return { cases: cases, P_Dmax: b.P_D, governing: b.name, chi: chi, Pmin: Pmin };
  }

  /* BV Ch 7 Sec 2 Tab 1 */
  function setsForBV(ship, col, comp, other) {
    var pt = col.pt, out = [];
    var want = function (sc) { return col.scenario === 'all' || col.scenario === sc; };
    var T_SC = ship.T_SC, T_BAL = ship.T_BAL || 0.6 * T_SC, T_Q = (ship.roro ? 0.7 : 0.25) * T_SC;
    var shellNext = other.kind === 'sea';
    var exS = function (T) { return shellNext ? Math.max(rho * g * (T - pt.z), 0) : 0; };
    if (comp.kind === 'sea') {
      if (want('extSD')) { var r = sea(ship, pt, T_SC, false); out.push({ set: 'SEA-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: r.P_ex_SD, kase: r.governing, draught: T_SC, detail: r }); }
      if (want('harbS')) { var r2 = sea(ship, pt, T_SC, false); out.push({ set: 'SEA-2', scenario: 'Harbour S', AC: 'AC-I', P: r2.P_ex_S, kase: '-', draught: T_SC, detail: r2 }); }
    }
    if (['ballast', 'fresh', 'fuel', 'cargo', 'other'].indexOf(comp.kind) >= 0) {
      var tank = comp.tank, wb = comp.kind === 'ballast', lc = comp.kind === 'cargo', pre = wb ? 'WB' : (lc ? 'LC' : 'TK');
      var sub = lc ? function () { return 0; } : exS;         /* LC sets carry P_in alone */
      if (want('extSD')) {
        var T1 = lc ? T_SC : T_BAL;
        var tc = tankCases(ship, tank, pt, T1, false), sr = (shellNext && !lc) ? sea(ship, pt, T1, false) : null;
        var rows = tc.cases.map(function (c, i) { return { name: c.name, P: tc.st.P_ls1 + c.P_ld - (sr ? sr.cases[i].P_ex : 0), P_ld: c.P_ld, P_ex: sr ? sr.cases[i].P_ex : 0 }; });
        var b1 = best(rows, 'P');
        out.push({ set: pre + '-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: Math.max(b1.P, 0), kase: b1.name, draught: T1, rows: rows, P_ls: tc.st.P_ls1 });
        if (lc) {
          var tc2 = tankCases(ship, tank, pt, 0.6 * T_SC, false);
          var rows2 = tc2.cases.map(function (c) { return { name: c.name, P: tc2.st.P_ls1 + c.P_ld, P_ld: c.P_ld, P_ex: 0 }; });
          var b12 = best(rows2, 'P');
          out.push({ set: 'LC-2', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: Math.max(b12.P, 0), kase: b12.name, draught: 0.6 * T_SC, rows: rows2, P_ls: tc2.st.P_ls1 });
        }
      }
      if (wb && want('bweSD')) {
        var tb = tankCases(ship, tank, pt, T_BAL, true), sb = shellNext ? sea(ship, pt, T_BAL, true) : null;
        var rws = tb.cases.map(function (c, i) { return { name: c.name, P: tb.st.P_ls2 + c.P_ld - (sb ? sb.cases[i].P_ex : 0), P_ld: c.P_ld, P_ex: sb ? sb.cases[i].P_ex : 0 }; });
        var b2 = best(rws, 'P');
        out.push({ set: 'WB-2', scenario: 'BWExchange S+D', AC: 'AC-II', P: Math.max(b2.P, 0), kase: b2.name, draught: T_BAL, rows: rws, P_ls: tb.st.P_ls2 });
      }
      var st = BTk.staticPressures(tank, pt, ship.L);
      if (want('harbS')) out.push({ set: wb ? 'WB-3' : (lc ? 'LC-3' : 'TK-2'), scenario: 'Harbour S', AC: 'AC-I', P: Math.max(st.P_ls3 - sub(T_Q), 0), kase: '-', draught: lc ? null : T_Q, P_ls: st.P_ls3 });
      if (want('testS')) out.push({ set: wb ? 'WB-4' : (lc ? 'LC-4' : 'TK-3'), scenario: 'Testing S', AC: 'AC-III', P: Math.max(st.P_lsST - (tank.dryDock ? 0 : sub(T_Q)), 0), kase: '-', draught: lc ? null : T_Q, P_ls: st.P_lsST, testing: true });
    }
    if (comp.kind === 'deck' || (comp.kind === 'weather' && comp.P_dls > 0)) {
      var P_dls = comp.P_dls || 2.5;
      if (want('extSD')) { var dl = deckLoad(ship, pt, P_dls, T_SC); out.push({ set: 'DL-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: dl.SD, kase: dl.kase + ' a_Z ' + dl.a_z.toFixed(2), draught: T_SC }); }
      if (want('harbS')) out.push({ set: 'DL-2', scenario: 'Harbour S', AC: 'AC-I', P: P_dls, kase: '-', draught: null });
    }
    if (comp.kind === 'weather' && want('extSD')) {
      var gs = greenSeaBV(ship, pt, comp.wd || { tier: 1 });
      out.push({ set: 'SEA-1 (P_d)', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: gs.P_Dmax, kase: gs.governing, draught: T_SC, detail: gs });
    }
    if (comp.kind === 'flood' && want('floodS')) out.push({ set: 'FD-1', scenario: 'Flooding S', AC: 'AC-III', P: BTk.floodingPressure(pt, comp.z_fd || ship.D, comp.dam), kase: '-', draught: T_SC, flood: true, collision: !!comp.collision });
    if (comp.kind === 'sside' && want('extSD')) { var rs = sea(ship, pt, T_SC, false); out.push({ set: 'SEA-1', scenario: 'ExtremeSea S+D', AC: 'AC-II', P: rs.P_ex_SD, kase: rs.governing, draught: T_SC, detail: rs }); }
    return out;
  }

  function designLoads(ship, col) {
    /* LR SSC: the pressure follows the position (Pt 5 Ch 3 Tab 3.3.1 / Ch 4 Tab 4.3.1), acting on the plate side */
    if (ship.cls === 'lrssc') return { comp1: [], comp2: SSC.designPressures(ship, col.pt, col.member || 'side', col.ssc || {}) };
    /* LR Ships: heads of the position (Pt 3 Ch 3 Tab 3.5.1, Pt 4 Ch 1 tables) */
    if (ship.cls === 'lr') return { comp1: [], comp2: LR.pointLoads(ship, col.pt, col.member || 'side', col.lr || {}) };
    var c1 = col.comp1 || { kind: 'none' }, c2 = col.comp2 || { kind: 'none' };
    var fn = ship.cls === 'bv' ? setsForBV : setsFor;
    var out = { comp1: fn(ship, col, c1, c2), comp2: fn(ship, col, c2, c1) };
    /* flags for the scantling coefficients (K_corr for testing, chi / watertight rows for flooding) */
    ['comp1', 'comp2'].forEach(function (k) { out[k].forEach(function (x) { if (/Flooding/.test(x.scenario)) x.flood = true; if (/Testing/.test(x.scenario)) x.testing = true; }); });
    return out;
  }

  var api = { designLoads: designLoads, parseX: parseX, sea: sea, tankCases: tankCases, deckLoad: deckLoad, greenSea: greenSea, greenSeaBV: greenSeaBV, RULES: RULES, rulesOf: rulesOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LoadPointEngine = api;
})(typeof window !== 'undefined' ? window : this);
