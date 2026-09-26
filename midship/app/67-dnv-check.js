// =============================================================================
// 67-dnv-check.js — DNV RU-SHIP yerel boyutlandırma orkestratörü (M12 çekirdeği): EPP + profil başına tüm kontroller ve hükmeden gereklilik
//   Kullanır: 61 (korozyon, min kalınlık, narinlik, hull girder), 62 (yükler, σ_hg), 63 (plaka/profil akma), 64 (burkulma), 65 (buz), 66 (kesme akışı)
//   Girdi modeli (mm / kN / kNm; ship boyutları m):
//   model = { ship:{L,B,D,TSC,TBAL,CB,rollType,bilgeKeel,v,lamOST,LLL,freeboardType,ice:{iceClass,deltaF,PS,UIWL,LIWL}},
//             x (AE'den m), xLCP (EPP orta boyu; yoksa x), section:{I_n50,zn_n50,Iz_n50}, loads:{Msw:{hog,sag},Qsw:{pos,neg},Qwv?:fn(lc)→kN},
//             qv: (y_mm,z_mm)→q_v (1/mm) | null,
//             conditions:[{name,T,rollType,hd?:bool}],                      // yük durumları (LD/HD/Ballast)
//             tanks:{name:{ztop,zair,rho,P0,Pdrop2,x0,x1,y0,y1,xG,yG,zG}}, holds:{name:{rhoC,zC,xG,yG,zG,psi,heavy?}},
//             epps:[{id,panel,y0,z0,y1,z1,b,a,kind,tGross,tc,ReH,k,minLoc,minAdj,slC,faces:[...],Flong,curved,transverse,ice:{region,s1}|null}],
//             stiffeners:[{id,panel,y,z,ref:{y,z},type,hw,tw,bf,tf,tcw,tcf,ReH,s,lBdg,lShr,dShr,fbdg,fixity,fu,faces:[...],buck:{b1,b2,tp,epp1,epp2},minLoc,ice:{region,s1,l,m1}|null}] }
//   faces: {kind:'sea'} | {kind:'tank',tank,cond?} | {kind:'hold',hold,alpha,coaming?} | {kind:'deck',Pdls,exposed,zdk} | {kind:'flood',zfd} | {kind:'internal'}
//     Kaplamada (sea + iç yüz) tank/ambar seti net = iç − deniz (Ch 6 Sec 2 Table 1 not 1). P işareti: + plaka tarafı (dıştan), − profil tarafı (içten).
// SAF. Doğrulama: _dev/dnv-ref/verify-dnv-e2e.js (Nauticus plate_summary / stiffener_summary)
// =============================================================================
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./61-dnv-core.js'), require('./62-dnv-loads.js'), require('./63-dnv-local.js'), require('./64-dnv-buckling.js'), require('./65-dnv-ice.js'), require('./66-dnv-section.js'), require('./69-dnv-sideframe.js'));
  } else root.DNVCheck = factory(root.DNV, root.DNVLoads, root.DNVLocal, root.DNVBuckling, root.DNVIce, root.DNVSection, root.DNVSideFrame);
})(typeof self !== 'undefined' ? self : this, function (DNV, DL, DLoc, BK, ICE, SEC, SF) {
  'use strict';
  const AC_OF = { 'SEA-1': 'AC-II', 'SEA-2': 'AC-I', 'WB-1': 'AC-II', 'WB-3': 'AC-III', 'WB-4': 'AC-I', 'BC-1': 'AC-II', 'BC-2': 'AC-I', 'BC-3': 'AC-II', 'BC-4': 'AC-I', 'UDL-1': 'AC-II', 'UDL-2': 'AC-I', 'FD-1': 'AC-III', 'INT-1': 'AC-I' };
  const r05 = t => Math.ceil(t * 2 - 1e-9) / 2;

  // ---------------------------------------------------------- yük setleri (EPP veya profil "elemanı" için)
  //   el: {y (mm), z (mm), faces, xLCP}; dönüş: [{set, AC, T, cond, lc (LC adı|'Static'), P (kN/m²; + plaka tarafı), sw:'hog'|'sag'|null}]
  function loadSets(model, el, opts) {
    const ship = model.ship, out = [];
    const y = el.y / 1000, z = el.z / 1000, x = model.x, xl = model.xLCP != null ? model.xLCP : model.x, Bx = model.Bx || ship.B;
    const conds = model.conditions || [{ name: 'LD', T: ship.TSC, rollType: ship.rollType }];
    const shipOf = c => Object.assign({}, ship, { rollType: c.rollType || ship.rollType, kr: c.kr != null ? c.kr : ship.kr, GM: c.GM != null ? c.GM : ship.GM });
    const seaFace = el.faces.find(f => f.kind === 'sea');
    const push = (set, cond, lc, P, sw, extra) => out.push(Object.assign({ set, AC: AC_OF[set], T: cond ? cond.T : ship.TSC, cond: cond ? cond.name : '-', lc, P, sw }, extra || {}));
    // --- deniz
    if (seaFace) {
      const deck = seaFace.deck;                                            // açık güverte: yeşil deniz
      for (const c of conds) {
        if (c.hd) continue;                                                 // HD kondisyonunda deniz seti LD ile aynı (roll farkı LC'lerde)
        for (const lc of DL.LOAD_CASES) {
          let P;
          if (deck) P = DL.PD(lc, shipOf(c), c.T, x, y, z, Bx, deck, 'ES').PD;
          else { const w = DL.Pw(lc, shipOf(c), c.T, x, y, z, Bx, 'ES'); P = Math.max(0, DL.Ps(z, c.T) + w.PW); if (w.PW < 0 && DL.Ps(z, c.T) + w.PW < 0) P = 0; }
          for (const sw of ['hog', 'sag']) push('SEA-1', c, lc, P, sw);
        }
        if (!deck) for (const sw of ['hog', 'sag']) push('SEA-2', c, 'Static', DL.Ps(z, c.T), sw);
      }
    }
    // --- tanklar
    for (const f of el.faces.filter(f => f.kind === 'tank')) {
      const tank = model.tanks[f.tank]; if (!tank) continue;
      const cond = conds.find(c => c.name === (f.cond || 'Ballast')) || conds[conds.length - 1];
      const sgn = f.inside === false ? 1 : -1;                              // tank içten yüklüyor → profil tarafı (−)
      const pl = DL.Pls(tank, z, ship.L);
      const seaT3 = seaFace ? DL.Ps(z, Math.min(ship.TBAL, 0.25 * ship.TSC)) : 0, seaT4 = seaFace ? DL.Ps(z, ship.TBAL) : 0;
      for (const sw of ['hog', 'sag']) {
        push('WB-3', { name: cond.name, T: Math.min(ship.TBAL, 0.25 * ship.TSC) }, 'Static', sgn * (Math.max(pl.p4, pl.pST) - seaT3), sw);
        push('WB-4', { name: cond.name, T: ship.TBAL }, 'Static', sgn * (pl.p3 - seaT4), sw);
      }
      for (const lc of DL.LOAD_CASES) {
        const ld = DL.Pld(lc, shipOf(cond), cond.T, tank, xl, y, z, model.pldOpts || { fullL: 1, fullT: 1, fcd: 1 });
        const sea = seaFace ? Math.max(0, DL.Ps(z, cond.T) + DL.Pw(lc, shipOf(cond), cond.T, x, y, z, Bx, 'ES').PW) : 0;
        for (const sw of ['hog', 'sag']) push('WB-1', cond, lc, sgn * (pl.p1 + ld.P - sea), sw);
      }
    }
    // --- dökme yük ambarı
    for (const f of el.faces.filter(f => f.kind === 'hold')) {
      const hold = model.holds[f.hold]; if (!hold) continue;
      const sgn = f.inside === false ? 1 : -1;
      const cond = conds.find(c => c.name === (f.cond || 'LD')) || conds[0];
      if (f.coaming) { for (const sw of ['hog', 'sag']) { push('BC-2', cond, 'Static', 0, sw); } for (const lc of DL.LOAD_CASES) for (const sw of ['hog', 'sag']) push('BC-1', cond, lc, 0, sw); continue; }
      const st = DL.Pbulk(null, shipOf(cond), cond.T, hold, xl, y, z, f.alpha || 0, f.kc0 ? { kc0: true } : null);
      for (const sw of ['hog', 'sag']) push('BC-2', cond, 'Static', sgn * st.Pbs, sw);
      for (const lc of DL.LOAD_CASES) { const b = DL.Pbulk(lc, shipOf(cond), cond.T, hold, xl, y, z, f.alpha || 0, f.kc0 ? { kc0: true } : null); for (const sw of ['hog', 'sag']) push('BC-1', cond, lc, sgn * b.P, sw); }
      if (hold.heavy) {                                                     // BC-3/4: ağır yük (HD) — dolum yoksa 0
        const hv = hold.heavy, condH = conds.find(c => c.hd) || cond;
        for (const sw of ['hog', 'sag']) push('BC-4', condH, 'Static', sgn * DL.Pbulk(null, shipOf(condH), condH.T, hv, xl, y, z, f.alpha || 0).Pbs, sw);
        for (const lc of DL.LOAD_CASES) for (const sw of ['hog', 'sag']) push('BC-3', condH, lc, sgn * DL.Pbulk(lc, shipOf(condH), condH.T, hv, xl, y, z, f.alpha || 0).P, sw);
      }
    }
    // --- yayılı güverte yükü
    for (const f of el.faces.filter(f => f.kind === 'deck')) {
      const cond = conds.find(c => c.name === (f.cond || 'Ballast')) || conds[conds.length - 1];
      for (const sw of ['hog', 'sag']) push('UDL-2', cond, 'Static', DL.Pdl(null, shipOf(cond), cond.T, xl, y, z, f.Pdls2 != null ? f.Pdls2 : f.Pdls).P, sw);
      for (const lc of DL.LOAD_CASES) for (const sw of ['hog', 'sag']) push('UDL-1', cond, lc, DL.Pdl(lc, shipOf(cond), cond.T, xl, y, z, f.Pdls).P, sw);
    }
    // --- su basması / iç yapı
    for (const f of el.faces.filter(f => f.kind === 'flood')) for (const sw of ['hog', 'sag']) push('FD-1', { name: 'Flood', T: 0 }, 'Static', (f.inside === false ? 1 : -1) * DL.Pflood(z, f.zfd, 1.025), sw);
    if (el.faces.some(f => f.kind === 'internal')) for (const sw of ['hog', 'sag']) push('INT-1', conds[0], 'Static', -DL.P_INT, sw);
    return out;
  }
  // σ_hg (çekme +) — set/LC/SW için ; ref: {y (m), z (m)}
  function sigmaFor(model, ls, ref, T) {
    const sec = model.section, ship = model.ship, ft = DL.fT(T, ship.TSC);
    const x = model.x, mwv = DNV.Mwv(x, ship.L, ship.B, ship.CB, 1.0), mwh = DL.Mwh(x, ship.L, ship.B, ship.CB, T, 1.0);
    if (ls.lc === 'Static') return DL.sigmaHgStatic(sec, model.loads.Msw, ref.z, ls.sw === 'hog');
    return DL.sigmaHg(ls.lc, ft, sec, model.loads.Msw, mwv, ref.z, ls.sw === 'hog', ref.y, mwh);
  }
  // ---------------------------------------------------------- plaka (EPP)
  function checkEPP(model, e) {
    const ship = model.ship, L = ship.L, k = e.k != null ? e.k : DNV.kFactor(e.ReH);
    const res = { id: e.id, panel: e.panel, tGross: e.tGross, tc: e.tc, tNet: e.tGross - e.tc };
    // min kalınlık, narinlik
    res.tMinNet = !e.minLoc ? 0 : /^psm:/.test(e.minLoc) ? DNV.minPSMNet(e.minLoc.slice(4), L, k) : DNV.minPlateNet(e.minLoc, L, k, e.minAdj);
    res.tSlendNet = e.b / (e.slC || 100);                                        // Ch 8 Sec 2 [2.1]: b/C (Nauticus: R_eH terimi yok; PLAN §5 madde 4)
    // akma: tüm setler
    // Ch 3 Sec 7 Table 2 LCP: yatay plaka → dış y (z aynı) ; düşey/eğik plaka → alt kenardaki uç noktası (y ve z birlikte)
    const horiz = Math.abs(e.z1 - e.z0) < 5;
    const low = e.z0 <= e.z1 ? [e.y0, e.z0] : [e.y1, e.z1];
    const lcp = horiz ? { y: Math.max(e.y0, e.y1) / 1000, z: Math.min(e.z0, e.z1) / 1000 } : { y: low[0] / 1000, z: low[1] / 1000 };
    const sets = loadSets(model, { y: lcp.y * 1000, z: lcp.z * 1000, faces: e.faces }, {});
    let gov = null;
    for (const ls of sets) {
      if (ls.P <= 0 && ls.set !== 'SEA-1') { }
      const P = Math.abs(ls.P); if (!(P > 0)) continue;
      const sHg = sigmaFor(model, ls, lcp, ls.T);
      let kind = e.kind || 'longStiffened';
      if (ls.AC === 'AC-III') kind = (e.ac3Kind && typeof e.ac3Kind === 'object') ? (e.ac3Kind[ls.set] || kind) : (e.ac3Kind || kind);
      const Ca = DLoc.Ca(ls.AC, kind, sHg, e.ReH);
      const t = DLoc.tPlate(P, e.a, e.b, Ca, e.ReH);
      if (!gov || t > gov.t) gov = { t, set: ls.set, lc: ls.lc, sw: ls.sw, cond: ls.cond, P: ls.P, Ca, sHg, AC: ls.AC };
    }
    // Ch 10 Sec 6 [8]: usturmaça (berthing) bölgesi — L > 90, borda kaplaması, T_BAL … T_SC + min(0.25 T_SC, 2.0): t_net = 26(b/1000 + 0.7)(B T_SC/R_eH²)^0.25
    //   (2022 kuralında profiller için de bir gereklilik vardı — Temmuz 2023'te kaldırıldı; Nauticus 2022 Z_min 72 cm³ veriyor, uygulanmıyor)
    if (ship.L > 90 && e.faces.some(f => f.kind === 'sea' && !f.deck) && !horiz && e.berthing !== false) {
      // Nauticus: plaka bazında — plakanın z aralığı [T_BAL, T_SC] ile kesişiyorsa tüm EPP'lerine uygulanır (e.plateZ = [zmin, zmax] mm; yoksa EPP'nin kendisi)
      const pz = e.plateZ || [Math.min(e.z0, e.z1), Math.max(e.z0, e.z1)];
      const inZone = pz[1] / 1000 >= ship.TBAL - 1e-6 && pz[0] / 1000 <= ship.TSC + 1e-6;
      if (inZone && Math.max(e.y0, e.y1) >= 0.9 * ship.B / 2 * 1000) {
        const tb = 26 * (e.b / 1000 + 0.7) * Math.pow(ship.B * ship.TSC / (e.ReH * e.ReH), 0.25);
        res.berthing = tb;
        if (!gov || tb > gov.t) gov = { t: tb, set: 'Berthing impact', lc: '-', sw: null, cond: '-', P: 0, Ca: 0, sHg: 0, AC: '-' };
      }
    }
    res.yield = gov; res.tLocNet = gov ? gov.t : 0;
    // burkulma (hull girder gerilmeleri; kompartıman basıncı yok)
    if (model.qv && e.a && e.b) {
      const tp = res.tNet, q = model.qv((e.y0 + e.y1) / 2, (e.z0 + e.z1) / 2);
      const ends = [[e.y0 / 1000, e.z0 / 1000], [e.y1 / 1000, e.z1 / 1000]];
      let best = null;
      for (const c of (model.conditions || [{ T: ship.TSC }])) {
        const ft = DL.fT(c.T, ship.TSC), mwv = DNV.Mwv(model.x, L, ship.B, ship.CB, 1.0), mwh = DL.Mwh(model.x, L, ship.B, ship.CB, c.T, 1.0);
        for (const lc of DL.LOAD_CASES) for (const sw of ['hog', 'sag']) {
          const s1 = -DL.sigmaHg(lc, ft, model.section, model.loads.Msw, mwv, ends[0][1], sw === 'hog', ends[0][0], mwh);
          const s2 = -DL.sigmaHg(lc, ft, model.section, model.loads.Msw, mwv, ends[1][1], sw === 'hog', ends[1][0], mwh);
          const smax = Math.max(s1, s2), smin = Math.min(s1, s2), psi = smax > 0 ? smin / smax : 1;
          const Q = model.loads.Qsw[sw === 'hog' ? 'pos' : 'neg'] + (model.loads.Qwv ? model.loads.Qwv(lc, c.T) : 0);
          const tau = SEC.tau(Q, q, tp);
          const trans = !!e.transverse && !e.curved;                                   // eğri (bilge) panel: σ_hg eksenel (Table 4 σ_ax), a/b yönünden bağımsız
          for (const cb of BK.stressCombos(smax, tau, trans)) {
            const inp = { sx: cb.sx, sy: cb.sy, tau: cb.tau, tp, b: e.b, a: e.a, ReH: e.ReH, psi_x: trans ? 1 : psi, psi_y: trans ? psi : 1, Flong: e.Flong != null ? e.Flong : 1, Ftran: 1, S: e.S || 1, curved: e.curved || null };
            const o = BK.plateLimit(inp);
            if (!best || o.eta > best.eta) best = { eta: o.eta, lc, sw, comb: cb.comb, inp };
          }
        }
      }
      res.buckling = best;
      res.tBucNet = best ? BK.tBuckling(best.inp, BK.ETA_ALL['AC-II'], { tauScales: true }) : 0;
    } else res.tBucNet = 0;
    // buz
    if (e.ice && ship.ice) {
      const longit = e.ice.longit !== false;                                       // Table 9: dış kaplama boyuna postalı → ℓ_a = 1.7 s1 ; enine postalı → ℓ_a = s1
      const h = ICE.hOf(ship.ice.iceClass)[1], la = longit ? 1.7 * e.ice.s1 : e.ice.s1, pr = ICE.pressure(ship.ice, e.ice.region, la);
      const pl = ICE.plate(pr.P, e.ice.s1, h, e.ReH, e.ice.tc != null ? e.ice.tc : 2, longit);
      res.ice = { P: pr.P, t: pl.t }; res.tIceGr = pl.t;
    }
    // Grab (Pt 6 Ch 1 Sec 1): iç dip her zaman ("excluding bilge wells"); düşey/eğik ambar sınırı yalnız Grab(2-X)/(3-X), ambar tabanından 1,5/3,0 m içinde
    const holdFace = (e.faces || []).find(f => f.kind === 'hold');
    const hold = holdFace && model.holds[holdFace.hold];
    if (hold && hold.grab) {
      const isIB = e.panel === 'innerBottom';
      const ext = DNV.GRAB_EXTENT[hold.grab.qualifier] || 0;
      const zMin = Math.min(e.z0, e.z1) / 1000, zMax = Math.max(e.z0, e.z1) / 1000;
      const inExtent = ext > 0 && zMin <= hold.grab.z0 + ext + 1e-6 && zMax >= hold.grab.z0 - 1e-6;
      if (isIB || inExtent) {
        const tG = DNV.tGrab(e.b, k, hold.grab.MGR, !isIB);
        res.grab = { MGR: hold.grab.MGR, t: tG, vertical: !isIB }; res.tGrabGr = tG;
      }
    }
    // hükmeden (brüt)
    // brüt yuvarlama: min kalınlık en yakın 0,5 (Nauticus, Ch 3 Sec 2 [2.?]); diğerleri yukarı 0,5
    // brüt yuvarlama: Nauticus min/akma/narinlik en yakın 0,5 (Ch 3 Sec 2 [2.?]); burkulma t_buc yukarı 0,5 (fikstür)
    const cand = [['Minimum thickness', DNV.roundHalf(res.tMinNet + e.tc)], ['Yielding', DNV.roundHalf(res.tLocNet + e.tc)], ['Slenderness', DNV.roundHalf(res.tSlendNet + e.tc)], ['Buckling', r05(res.tBucNet + e.tc)]];
    if (res.tIceGr) cand.push(['Ice Class', r05(res.tIceGr)]);
    if (res.tGrabGr) cand.push(['Grab', DNV.roundHalf(res.tGrabGr + e.tc)]);
    cand.sort((a, b) => b[1] - a[1]);
    res.tReqGr = cand[0][1]; res.governing = cand[0][0]; res.isOK = e.tGross + 1e-9 >= res.tReqGr;
    res.candidates = cand;
    return res;
  }
  // ---------------------------------------------------------- profil
  function checkStiffener(model, st, eppResults) {
    const ship = model.ship, L = ship.L;
    const res = { id: st.id, panel: st.panel, type: st.type, hw: st.hw, tw: st.tw };
    const twNet = st.tw - (st.tcw || 0), tfNet = (st.tf || 0) - (st.tcf || 0);
    // narinlik / min web
    const sl = DNV.slendernessStiffener(st.type === 'FB' ? 'flat' : st.type === 'HP' ? 'bulb' : st.type === 'T' ? 'T' : 'angle', st.hw, st.bf || 0, st.ReH);
    res.twSlendNet = sl.tw_min || 0; res.tfSlendNet = sl.tf_min || 0;
    res.twMinNet = st.minLoc ? DNV.minStiffNet(st.minLoc, L, st.tPlateReqNet).t_min_net : 0;
    // akma: setler (referans noktası ile σ_hg)
    const sets = loadSets(model, { y: st.y, z: st.z, faces: st.faces }, {});
    const ref = { y: (st.ref ? st.ref.y : st.y) / 1000, z: (st.ref ? st.ref.z : st.z) / 1000 };
    let gZ = null, gTw = null;
    for (const ls of sets) {
      const P = Math.abs(ls.P); if (!(P > 0)) continue;
      const sHg = sigmaFor(model, ls, ref, ls.T);
      const csKind = /^(INT-1)$/.test(ls.set) ? 'other' : (ls.AC === 'AC-III' && st.wt) ? 'longitudinalWT' : 'longitudinal';
      const isInt = /^(INT-1|SLH-1)$/.test(ls.set);
      const Cs = DLoc.Cs(ls.AC, csKind, sHg, st.ReH, st.fixity || 'fixed', (isInt || ls.P >= 0) ? 'plate' : 'stiffener');   // P_int nominal: Nauticus plaka tarafı
      const Z = DLoc.Zreq(P, st.s / 1000, st.lBdg, isInt ? 8 : (st.fbdg || 12), Cs, st.ReH, st.fu || 1);                      // Nauticus SLH-1/INT-1: f_bdg = 8
      const tw = st.dShr > 0 ? DLoc.twReq(P, st.s / 1000, st.lShr, st.dShr, DLoc.CT[ls.AC], st.ReH, st.fshr || 0.5, 1.0) : 0;
      if (!gZ || Z > gZ.Z) gZ = { Z, set: ls.set, lc: ls.lc, sw: ls.sw, cond: ls.cond, P: ls.P, Cs, sHg };
      if (!gTw || tw > gTw.tw) gTw = { tw, set: ls.set, lc: ls.lc, P: ls.P };
    }
    res.yieldZ = gZ; res.ZReqNet = gZ ? gZ.Z : 0; res.yieldTw = gTw; res.twLocNet = gTw ? gTw.tw : 0;
    // burkulma (profil): her yük seti (SEA-1 / WB-1 / BC-1 / UDL-1 …) kendi T, LC, P'si ile; η_max
    if (model.qv && st.buck) {
      const b = st.buck, tp = b.tp;
      let best = null; const allEta = [];
      let dyn = sets.filter(ls => ls.lc !== 'Static' || Math.abs(ls.P) > 0);          // statik setler de (WB-3 test: σ_hg = 0; harbour statikleri: statik M_sw) — Nauticus profil burkulmasında WB-3 hükmedebiliyor
      if (!dyn.filter(ls => ls.lc !== 'Static').length) {                                                    // yalnız iç yapı (INT-1): Nauticus yine her LC için hull girder gerilmesiyle burkulmaya bakar (düşey PSM P=0, yatay iç güverte P_int)
        const c0 = (model.conditions || [])[0] || { name: 'LD', T: ship.TSC }, Pint = st.vertical ? 0 : (sets.find(q => q.set === 'INT-1') || { P: 0 }).P;
        dyn = []; for (const lc of DL.LOAD_CASES) for (const sw of ['hog', 'sag']) dyn.push({ set: 'INT-1', lc, sw, T: c0.T, cond: c0.name, P: Pint });
      }
      const cache = {};
      for (const ls of dyn) {
        const ck = ls.T + '|' + ls.lc + '|' + ls.sw + '|' + (ls.lc === 'Static' ? ls.set : '');
        if (!cache[ck]) {
          if (ls.lc === 'Static') {
            const testing = ls.set === 'WB-3';
            const sx = testing ? 0 : -DL.sigmaHgStatic(model.section, model.loads.Msw, st.z / 1000, ls.sw === 'hog');
            const Q = model.loads.Qsw[ls.sw === 'hog' ? 'pos' : 'neg'];
            cache[ck] = { sx, tau: testing ? 0 : SEC.tau(Q, model.qv(st.y, st.z), tp) };
          } else {
          const ft = DL.fT(ls.T, ship.TSC), mwv = DNV.Mwv(model.x, L, ship.B, ship.CB, 1.0), mwh = DL.Mwh(model.x, L, ship.B, ship.CB, ls.T, 1.0);
          const sx = -DL.sigmaHg(ls.lc, ft, model.section, model.loads.Msw, mwv, st.z / 1000, ls.sw === 'hog', st.y / 1000, mwh);   // bağlantı noktası, basınç +
          const Q = model.loads.Qsw[ls.sw === 'hog' ? 'pos' : 'neg'] + (model.loads.Qwv ? model.loads.Qwv(ls.lc, ls.T) : 0);
          cache[ck] = { sx, tau: SEC.tau(Q, model.qv(st.y, st.z), tp) };
          }
        }
        const { sx, tau } = cache[ck];
        const Cx = bb => bb ? (sx > 0 ? BK.Cx1(Math.sqrt(bb.ReH / (BK.Kx1(1, bb.Flong != null ? bb.Flong : 1) * BK.KE * Math.pow(bb.tp / bb.b, 2))), 1) : 1) : 1;
        const Cx1 = Cx(b.epp1), Cx2 = Cx(b.epp2);
        for (const cb of BK.stressCombos(sx, tau, false)) {
          const o = BK.stiffenerCapacity({ sx: cb.sx, sy: 0, tau: cb.tau, s: st.s, l: st.lBdg * 1000, tp, hw: st.hw - (st.type === 'FB' || st.type === 'HP' ? 0 : (st.tf || 0)), tw: twNet, bf: st.bf || 0, tf: tfNet, type: st.type, b1: b.b1, b2: b.b2, Cx1, Cx2, ReHS: st.ReH, ReHP: b.ReHP || st.ReH, S: st.S || 1, P: ls.P, fixity: st.fixity });
          allEta.push({ set: ls.set, lc: ls.lc, sw: ls.sw, comb: cb.comb, mode: o.mode, eta: o.eta });
          if (!best || o.eta > best.eta) best = { eta: o.eta, mode: o.mode, set: ls.set, lc: ls.lc, sw: ls.sw, comb: cb.comb, P: ls.P, sx: cb.sx, tau: cb.tau, sa: o.sa, gammaGEB: o.gammaGEB, sigmaET: o.sigmaET, Csl: o.Csl, beff: o.beff, tp, Cx1, Cx2, b1: b.b1, b2: b.b2 };
        }
      }
      res.buckling = best; res.buckTop = allEta.sort((u, v) => v.eta - u.eta).slice(0, 5); res.staticSets = sets.filter(q => q.lc === 'Static' && q.sw === 'hog').map(q => q.set + ':' + q.P.toFixed(0)).join(' ') + ' | dyn ' + dyn.length;
    }
    // buz (boyuna posta)
    if (st.ice && ship.ice) {
      const trans = !!st.ice.trans;                                                // Table 9: enine posta ℓ_a = s1 (frame spacing) ; boyuna posta ℓ_a = açıklık ℓ
      const h = ICE.hOf(ship.ice.iceClass)[1], la = trans ? st.ice.s1 : st.ice.l, pr = ICE.pressure(ship.ice, st.ice.region, la);
      const fr = trans ? ICE.transFrame(pr.P, h, st.ice.s1, st.ice.l, st.ReH, st.ice.m0) : ICE.longFrame(pr.P, h, st.ice.s1, st.ice.l, st.ice.l - st.ice.s1 / 2, st.ReH, { m1: st.ice.m1 });
      const plLa = trans ? st.ice.s1 : 1.7 * st.ice.s1, plReq = ICE.plate(ICE.pressure(ship.ice, st.ice.region, plLa).P, st.ice.s1, h, st.ReH, 2, !trans).t;
      res.ice = { P: pr.P, Z: fr.Z, A: fr.A, tw: ICE.twMin(plReq, 2, st.hw, st.ReH, st.type === 'FB') };
    }
    // yan posta (Pt 5 Ch 1 Sec 2 §§5.2.2-5.2.4): tek bordalı, kuru dökme yük ambarı sınırındaki enine posta.
    // Kapsam (dryCargo/singleSide/transverse) modelden gerçek yüzler/yön bilgisinden çıkarılıyor; CSR-BC kapsamı
    // (§1.3.1 — bu basit formülün geçerli olmadığı durum) modelden çıkarılamıyor, kullanıcının Additional
    // Notations'ta işaretlediği bayrağa (ship.sideFrameCSR) bağlı. Braket uzunlukları girilmediği için kural
    // minimumu (0,12/0,07·l_SF) varsayılıyor — bu, geçerli her tasarım için en kötü (en yüksek A_shr) durumdur.
    // HENÜZ gerçek bir Nauticus referansıyla doğrulanmadı (PLAN-DNV.md §27/28) — sonuç bilgi amaçlı, "governing"e girmiyor.
    const Side = SF || root.DNVSideFrame;
    if (Side && ship.sideFrameCSR != null && st.faces && st.faces.some(f => f.kind === 'hold') && st.faces.some(f => f.kind === 'sea') && st.dir === 'trans') {
      const depth_m = ship.D, lSF = Math.max(st.lBdg, 0.25 * depth_m);
      const scope = { dryCargo: true, singleSide: true, transverse: true, csr: !!ship.sideFrameCSR };
      let gSF = null;
      for (const ls of sets) {
        if (!/^BC-[1-4]$/.test(ls.set)) continue;
        const P = Math.abs(ls.P); if (!(P > 0)) continue;
        const r = Side.requirements({ scope, spacing_mm: st.s, span_m: st.lBdg, depth_m, ReH_MPa: st.ReH, pressure_kPa: P, AC: ls.AC,
          lowerBracket_m: 0.12 * lSF, upperBracket_m: 0.07 * lSF, mayBeEmpty: !!ship.holdsMayBeEmpty });
        if (r.status === 'calculated' && (!gSF || r.required.Zmid_net_cm3 > gSF.required.Zmid_net_cm3)) gSF = Object.assign({ set: ls.set, lc: ls.lc, P, AC: ls.AC }, r);
      }
      if (gSF) res.sideFrame = gSF;
    }
    return res;
  }
  function run(model) {
    const epps = (model.epps || []).map(e => checkEPP(model, e));
    const stiffs = (model.stiffeners || []).map(s => checkStiffener(model, s, epps));
    return { epps, stiffeners: stiffs };
  }
  return { run, checkEPP, checkStiffener, loadSets, sigmaFor, AC_OF };
});
